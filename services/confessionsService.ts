import { currentUserId, requireUserId, supabase } from "@/lib/supabase";
import {
  emptyReactions,
  type Confession,
  type ConfessionCategory,
  type ModerationStatus,
  type ReactionKind,
} from "@/types/models";

interface RawPublicConfession {
  id: string;
  school_id: string | null;
  school_name?: string | null;
  school_crest_url?: string | null;
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
  comment_count?: number;
}

interface RawConfessionCommentCount {
  confession_id: string;
}

interface RawReaction {
  confession_id: string;
  user_id: string;
  kind: ReactionKind;
}

export interface ConfessionEngagement {
  reactions: Confession["reactions"];
  myReaction: ReactionKind | null;
  commentCount: number;
}

/**
 * `confession_reactions` is created by migration-step7.sql. Until it exists the
 * app still works — reactions just read as zero and the bar hides itself.
 */
let reactionsTableAvailable = true;
let commentsTableAvailable = true;
export const reactionsAvailable = (): boolean => reactionsTableAvailable;

const isMissingTable = (code: string | undefined): boolean => code === "PGRST205" || code === "42P01";

async function fetchEngagement(ids: string[], includeCommentCounts = true): Promise<Map<string, ConfessionEngagement>> {
  if (ids.length === 0) return new Map();
  const commentCounts = new Map<string, number>();
  const [userId, commentsResult] = await Promise.all([
    currentUserId(),
    commentsTableAvailable && includeCommentCounts
      ? supabase.from("confession_comments").select("confession_id").in("confession_id", ids).returns<RawConfessionCommentCount[]>()
      : Promise.resolve(null),
  ]);
  if (commentsResult?.error) {
    if (!isMissingTable(commentsResult.error.code)) throw new Error(commentsResult.error.message);
    commentsTableAvailable = false;
  } else {
    for (const comment of commentsResult?.data ?? []) {
      commentCounts.set(comment.confession_id, (commentCounts.get(comment.confession_id) ?? 0) + 1);
    }
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

  return new Map(ids.map((id) => [
    id,
    {
      reactions: totals.get(id) ?? emptyReactions(),
      myReaction: mine.get(id) ?? null,
      commentCount: commentCounts.get(id) ?? 0,
    },
  ]));
}

export async function fetchConfessionEngagement(ids: string[]): Promise<Map<string, ConfessionEngagement>> {
  return fetchEngagement([...new Set(ids.filter(Boolean))]);
}

async function attachReactions(rows: RawPublicConfession[]): Promise<Confession[]> {
  if (rows.length === 0) return [];
  const engagement = await fetchEngagement(
    rows.map((row) => row.id),
    rows.some((row) => row.comment_count === undefined)
  );

  return rows.map((row) => ({
    id: row.id,
    content: row.content,
    category: row.category,
    schoolId: row.school_id,
    schoolName: row.school_name ?? null,
    schoolCrestUrl: row.school_crest_url ?? null,
    moderationStatus: row.moderation_status ?? "APPROVED",
    createdAt: row.created_at,
    publishedAt: row.published_at,
    reactions: engagement.get(row.id)?.reactions ?? emptyReactions(),
    myReaction: engagement.get(row.id)?.myReaction ?? null,
    commentCount: row.comment_count ?? engagement.get(row.id)?.commentCount ?? 0,
    isSeed: row.is_seed ?? false,
    seedUsername: row.seed_username ?? null,
    seedFullName: row.seed_full_name ?? null,
    seedAvatarUrl: row.seed_avatar_url ?? null,
    mediaUrls: row.media_urls ?? [],
    mediaTypes: row.media_types ?? [],
  }));
}

/** Public, anonymous read path — the view never exposes author_id. */
export async function fetchApprovedConfessions(limit = 15): Promise<Confession[]> {
  let { data, error } = await supabase
    .from("public_confessions")
    .select("id, school_id, category, content, created_at, published_at, seed_username, seed_full_name, seed_avatar_url, is_seed, media_urls, media_types")
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(limit)
    .returns<RawPublicConfession[]>();
  if (error?.code === "42703" || error?.code === "PGRST204") {
    const fallback = await supabase
      .from("public_confessions")
      .select("id, school_id, category, content, created_at, published_at, seed_username, seed_full_name, seed_avatar_url, is_seed, media_urls, media_types")
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(limit)
      .returns<RawPublicConfession[]>();
    data = fallback.data;
    error = fallback.error;
  }
  if (error) throw new Error(error.message);
  return attachReactions(data ?? []);
}

export async function fetchApprovedConfession(id: string): Promise<Confession | null> {
  let { data, error } = await supabase
    .from("public_confessions")
    .select("id, school_id, category, content, created_at, published_at, seed_username, seed_full_name, seed_avatar_url, is_seed, media_urls, media_types")
    .eq("id", id)
    .maybeSingle<RawPublicConfession>();
  if (error?.code === "42703" || error?.code === "PGRST204") {
    const fallback = await supabase
      .from("public_confessions")
      .select("id, school_id, category, content, created_at, published_at, seed_username, seed_full_name, seed_avatar_url, is_seed, media_urls, media_types")
      .eq("id", id)
      .maybeSingle<RawPublicConfession>();
    data = fallback.data;
    error = fallback.error;
  }
  if (error) throw new Error(error.message);
  const [confession] = await attachReactions(data ? [data] : []);
  return confession ?? null;
}

/** The signed-in author's own submissions (any moderation status). */
export async function fetchMyConfessions(): Promise<Confession[]> {
  await requireUserId();
  const { data, error } = await supabase.rpc("get_my_confessions");
  if (error) throw new Error(error.message);
  if (!Array.isArray(data)) throw new Error("Your confession history could not be loaded.");
  return attachReactions(data as RawPublicConfession[]);
}

export interface SubmitConfessionInput {
  content: string;
  category: ConfessionCategory;
  schoolId: string | null;
}

export async function submitConfession(input: SubmitConfessionInput): Promise<Confession> {
  await requireUserId();
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw new Error(sessionError.message);
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error("Please sign in to submit a confession.");
  const schoolId = input.schoolId?.trim() || null;
  if (!schoolId) {
    throw new Error("Choose your school before submitting a confession.");
  }

  const response = await fetch("/api/confessions", {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      content: input.content.trim(),
      category: input.category,
      schoolId,
    }),
  });
  const result = await response.json() as {
    confession?: RawPublicConfession;
    message?: string;
    error?: string;
  };
  if (result.confession?.moderation_status === "REJECTED") {
    throw new Error(result.message ?? "This confession could not be published under our community guidelines.");
  }
  if (!response.ok || !result.confession) {
    throw new Error(result.error ?? "Could not submit your confession.");
  }
  const [confession] = await attachReactions([result.confession]);
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
