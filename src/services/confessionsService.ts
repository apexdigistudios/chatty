import { currentUserId, requireUserId, supabase } from "../lib/supabase";
import {
  emptyReactions,
  type Confession,
  type ConfessionCategory,
  type ModerationStatus,
  type ReactionKind,
} from "../types/models";

interface RawPublicConfession {
  id: string;
  school_id: string | null;
  category: ConfessionCategory;
  content: string;
  created_at: string;
  published_at: string | null;
  moderation_status?: ModerationStatus;
  seed_username?: string | null;
  seed_full_name?: string | null;
  seed_avatar_url?: string | null;
  is_seed?: boolean;
  media_urls?: string[];
  media_types?: Array<"image" | "video">;
}

interface RawConfessionCommentCount {
  confession_id: string;
}

interface RawReaction {
  confession_id: string;
  user_id: string;
  kind: ReactionKind;
}

/**
 * `confession_reactions` is created by migration-step7.sql. Until it exists the
 * app still works — reactions just read as zero and the bar hides itself.
 */
let reactionsTableAvailable = true;
export const reactionsAvailable = (): boolean => reactionsTableAvailable;

const isMissingTable = (code: string | undefined): boolean => code === "PGRST205" || code === "42P01";

async function attachReactions(rows: RawPublicConfession[]): Promise<Confession[]> {
  if (rows.length === 0) return [];

  const ids = rows.map((row) => row.id);
  const [userId, commentsResult] = await Promise.all([
    currentUserId(),
    supabase.from("confession_comments").select("confession_id").in("confession_id", ids).returns<RawConfessionCommentCount[]>(),
  ]);
  if (commentsResult.error) throw new Error(commentsResult.error.message);
  const commentCounts = new Map<string, number>();
  for (const comment of commentsResult.data ?? []) {
    commentCounts.set(comment.confession_id, (commentCounts.get(comment.confession_id) ?? 0) + 1);
  }
  let data: RawReaction[] = [];
  if (reactionsTableAvailable) {
    const result = await supabase
      .from("confession_reactions")
      .select("confession_id, user_id, kind")
      .in("confession_id", ids)
      .returns<RawReaction[]>();
    if (result.error) {
      if (!isMissingTable(result.error.code)) throw new Error(result.error.message);
      reactionsTableAvailable = false;
    } else {
      data = result.data ?? [];
    }
  }

  const totals = new Map<string, Record<ReactionKind, number>>();
  const mine = new Map<string, ReactionKind>();
  for (const reaction of data) {
    const bucket = totals.get(reaction.confession_id) ?? emptyReactions();
    bucket[reaction.kind] += 1;
    totals.set(reaction.confession_id, bucket);
    if (userId && reaction.user_id === userId) mine.set(reaction.confession_id, reaction.kind);
  }

  return rows.map((row) => ({
    id: row.id,
    content: row.content,
    category: row.category,
    schoolId: row.school_id,
    moderationStatus: row.moderation_status ?? "approved",
    createdAt: row.created_at,
    publishedAt: row.published_at,
    reactions: totals.get(row.id) ?? emptyReactions(),
    myReaction: mine.get(row.id) ?? null,
    commentCount: commentCounts.get(row.id) ?? 0,
    isSeed: row.is_seed ?? false,
    seedUsername: row.seed_username ?? null,
    seedFullName: row.seed_full_name ?? null,
    seedAvatarUrl: row.seed_avatar_url ?? null,
    mediaUrls: row.media_urls ?? [],
    mediaTypes: row.media_types ?? [],
  }));
}

/** Public, anonymous read path — the view never exposes author_id. */
export async function fetchApprovedConfessions(limit = 40): Promise<Confession[]> {
  const { data, error } = await supabase
    .from("public_confessions")
    .select("id, school_id, category, content, created_at, published_at, seed_username, seed_full_name, seed_avatar_url, is_seed, media_urls, media_types")
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(limit)
    .returns<RawPublicConfession[]>();
  if (error) throw new Error(error.message);
  return attachReactions(data ?? []);
}

/** The signed-in author's own submissions (any moderation status). */
export async function fetchMyConfessions(): Promise<Confession[]> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from("confessions")
    .select("id, school_id, category, content, created_at, published_at, moderation_status")
    .eq("author_id", userId)
    .order("created_at", { ascending: false })
    .returns<RawPublicConfession[]>();
  if (error) throw new Error(error.message);
  return attachReactions(data ?? []);
}

export interface SubmitConfessionInput {
  content: string;
  category: ConfessionCategory;
  schoolId: string | null;
}

export async function submitConfession(input: SubmitConfessionInput): Promise<Confession> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from("confessions")
    .insert({
      author_id: userId,
      school_id: input.schoolId,
      category: input.category,
      content: input.content.trim(),
      moderation_status: "pending",
    })
    .select("id, school_id, category, content, created_at, published_at, moderation_status")
    .single<RawPublicConfession>();
  if (error) throw new Error(error.message);
  const [confession] = await attachReactions([data]);
  return confession!;
}

/** One reaction per student per confession; tapping the same kind clears it. */
export async function toggleReaction(
  confessionId: string,
  kind: ReactionKind,
  current: ReactionKind | null
): Promise<ReactionKind | null> {
  const userId = await requireUserId();
  if (!reactionsTableAvailable) throw new Error("Reactions need migration-step7.sql to be applied first.");
  if (current === kind) {
    const { error } = await supabase
      .from("confession_reactions")
      .delete()
      .eq("confession_id", confessionId)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return null;
  }
  const { error } = await supabase
    .from("confession_reactions")
    .upsert(
      { confession_id: confessionId, user_id: userId, kind },
      { onConflict: "confession_id,user_id" }
    );
  if (error) {
    if (isMissingTable(error.code)) {
      reactionsTableAvailable = false;
      throw new Error("Reactions need migration-step7.sql to be applied first.");
    }
    throw new Error(error.message);
  }
  return kind;
}
