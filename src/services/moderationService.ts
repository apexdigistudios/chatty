import { requireUserId, supabase } from "../lib/supabase";
import type {
  Confession,
  Post,
  Report,
  ReportStatus,
  ReportTarget,
  ReportTargetType,
} from "../types/models";
import { emptyReactions, type ConfessionCategory } from "../types/models";
import { hydrateLikes, POST_SELECT, type RawPost } from "./postsService";

/* ───────────── Reports ───────────── */

interface RawReport {
  id: string;
  reporter_id: string;
  target_type: ReportTargetType;
  target_id: string;
  school_id: string | null;
  reason: string;
  status: ReportStatus;
  created_at: string;
  reporter: { username: string } | null;
}

/** `!reporter_id` is required: the live table also has `resolved_by → profiles`. */
const REPORT_SELECT = `id, reporter_id, target_type, target_id, school_id, reason, status, created_at,
  reporter:profiles!reporter_id(username)`;

export interface SubmitReportInput {
  targetType: ReportTargetType;
  targetId: string;
  /** Routes the report to that school's moderators; null → global queue. */
  schoolId: string | null;
  reason: string;
}

export async function submitReport(input: SubmitReportInput): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabase.from("reports").insert({
    reporter_id: userId,
    target_type: input.targetType,
    target_id: input.targetId,
    // Confessions are anonymous → always escalate to global admins.
    school_id: input.targetType === "confession" ? null : input.schoolId,
    reason: input.reason.trim(),
    status: "pending",
  });
  if (error) throw new Error(error.message);
}

/** Loads previews for the reported posts/comments/confessions in one pass. */
async function hydrateTargets(rows: RawReport[]): Promise<Report[]> {
  const byType = (type: ReportTargetType) =>
    [...new Set(rows.filter((row) => row.target_type === type).map((row) => row.target_id))];

  const [postIds, commentIds, confessionIds] = [byType("post"), byType("comment"), byType("confession")];
  const targets = new Map<string, ReportTarget>();

  if (postIds.length > 0) {
    const { data } = await supabase
      .from("posts")
      .select("id, content, status, author:profiles(username)")
      .in("id", postIds)
      .returns<Array<{ id: string; content: string; status: string; author: { username: string } | null }>>();
    for (const row of data ?? []) {
      targets.set(`post:${row.id}`, { preview: row.content, authorName: row.author?.username ?? null, status: row.status });
    }
  }
  if (commentIds.length > 0) {
    const { data } = await supabase
      .from("comments")
      .select("id, post_id, content, author:profiles(username)")
      .in("id", commentIds)
      .returns<Array<{ id: string; post_id: string; content: string; author: { username: string } | null }>>();
    for (const row of data ?? []) {
      targets.set(`comment:${row.id}`, { preview: row.content, authorName: row.author?.username ?? null, status: null, postId: row.post_id });
    }
  }
  if (confessionIds.length > 0) {
    const { data } = await supabase
      .from("confessions")
      .select("id, content, moderation_status")
      .in("id", confessionIds)
      .returns<Array<{ id: string; content: string; moderation_status: string }>>();
    for (const row of data ?? []) {
      targets.set(`confession:${row.id}`, { preview: row.content, authorName: "Anonymous", status: row.moderation_status });
    }
  }

  return rows.map((row) => ({
    id: row.id,
    reporterId: row.reporter_id,
    reporterName: row.reporter?.username ?? "student",
    targetType: row.target_type,
    targetId: row.target_id,
    schoolId: row.school_id,
    reason: row.reason,
    status: row.status,
    createdAt: row.created_at,
    target: targets.get(`${row.target_type}:${row.target_id}`) ?? null,
  }));
}

export async function fetchSchoolPendingReports(schoolId: string): Promise<Report[]> {
  const { data, error } = await supabase
    .from("reports")
    .select(REPORT_SELECT)
    .eq("school_id", schoolId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .returns<RawReport[]>();
  if (error) throw new Error(error.message);
  return hydrateTargets(data ?? []);
}

export async function fetchGlobalPendingReports(): Promise<Report[]> {
  const { data, error } = await supabase
    .from("reports")
    .select(REPORT_SELECT)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(100)
    .returns<RawReport[]>();
  if (error) throw new Error(error.message);
  return hydrateTargets(data ?? []);
}

/** Audit fields present on the live `reports` table. */
async function resolution() {
  return { status: "resolved" as const, resolved_by: await requireUserId(), resolved_at: new Date().toISOString() };
}

export async function resolveReport(reportId: string): Promise<void> {
  const { error } = await supabase.from("reports").update(await resolution()).eq("id", reportId);
  if (error) throw new Error(error.message);
}

async function resolveReportsFor(targetType: ReportTargetType, targetId: string): Promise<void> {
  await supabase.from("reports").update(await resolution()).eq("target_type", targetType).eq("target_id", targetId).eq("status", "pending");
}

/* ───────────── Posts & comments ───────────── */

async function setPostStatus(postId: string, status: "active" | "flagged" | "removed"): Promise<void> {
  const { error } = await supabase.from("posts").update({ status }).eq("id", postId);
  if (error) throw new Error(error.message);
}

/** School moderators: take a post off the campus feed. */
export async function removeSchoolPost(postId: string): Promise<void> {
  await setPostStatus(postId, "removed");
  await resolveReportsFor("post", postId);
}

export const flagPost = (postId: string) => setPostStatus(postId, "flagged");
export const restorePost = (postId: string) => setPostStatus(postId, "active");

export async function removeComment(commentId: string): Promise<void> {
  const { error } = await supabase.from("comments").delete().eq("id", commentId);
  if (error) throw new Error(error.message);
  await resolveReportsFor("comment", commentId);
}

/** Every post tagged to a school, including flagged/removed (moderator view). */
export async function fetchSchoolModerationPosts(schoolId: string, limit = 50): Promise<Post[]> {
  const { data, error } = await supabase
    .from("posts")
    .select(POST_SELECT)
    .eq("school_id", schoolId)
    .eq("post_type", "public")
    .order("created_at", { ascending: false })
    .limit(limit)
    .returns<RawPost[]>();
  if (error) throw new Error(error.message);
  return hydrateLikes(data ?? []);
}

/* ───────────── Global confession queue ───────────── */

interface RawQueuedConfession {
  id: string;
  school_id: string | null;
  category: ConfessionCategory;
  content: string;
  created_at: string;
  published_at: string | null;
  moderation_status: "pending" | "approved" | "rejected";
}

function mapQueued(row: RawQueuedConfession): Confession {
  return {
    id: row.id,
    content: row.content,
    category: row.category,
    schoolId: row.school_id,
    moderationStatus: row.moderation_status,
    createdAt: row.created_at,
    publishedAt: row.published_at,
    reactions: emptyReactions(),
    myReaction: null,
  };
}

export async function fetchGlobalPendingConfessions(): Promise<Confession[]> {
  const { data, error } = await supabase
    .from("confessions")
    .select("id, school_id, category, content, created_at, published_at, moderation_status")
    .eq("moderation_status", "pending")
    .order("created_at", { ascending: true })
    .returns<RawQueuedConfession[]>();
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapQueued);
}

export async function approveConfession(confessionId: string): Promise<void> {
  const { error } = await supabase
    .from("confessions")
    .update({ moderation_status: "approved", published_at: new Date().toISOString(), reviewed_by: await requireUserId() })
    .eq("id", confessionId);
  if (error) throw new Error(error.message);
}

export async function rejectConfession(confessionId: string, reason = "Declined under community guidelines"): Promise<void> {
  const { error } = await supabase
    .from("confessions")
    .update({ moderation_status: "rejected", published_at: null, reviewed_by: await requireUserId(), rejection_reason: reason })
    .eq("id", confessionId);
  if (error) throw new Error(error.message);
  await resolveReportsFor("confession", confessionId);
}
