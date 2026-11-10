import { currentUserId, supabase } from "@/lib/supabase";
import { fetchFeed } from "@/services/postsService";
import { fetchBlockedUserIds } from "@/services/blocksService";
import { isPostPromoted } from "@/lib/promotions";
import type { Post } from "@/types/models";

const MAX_PAGE_SIZE = 50;

export interface SmartFeedInput {
  userId: string | null;
  userSchoolId: string | null;
  page?: number;
  limit?: number;
  seenPostIds?: string[];
}

export interface SmartFeedResult {
  posts: Post[];
  hasMore: boolean;
}

interface GlobalFeedRank {
  post_id: string;
  engagement_score: number;
}

function parseGlobalFeedRanks(value: unknown): GlobalFeedRank[] {
  if (!Array.isArray(value)) throw new Error("The smart-feed ranking service returned invalid data.");
  return value.map((row: unknown) => {
    if (
      typeof row !== "object" ||
      row === null ||
      !("post_id" in row) ||
      typeof row.post_id !== "string" ||
      !("engagement_score" in row) ||
      typeof row.engagement_score !== "number" ||
      !Number.isFinite(row.engagement_score)
    ) {
      throw new Error("The smart-feed ranking service returned invalid data.");
    }
    return { post_id: row.post_id, engagement_score: row.engagement_score };
  });
}

function newestFirst(left: Post, right: Post): number {
  const difference = Date.parse(right.createdAt) - Date.parse(left.createdAt);
  return difference || right.id.localeCompare(left.id);
}

async function resolveUserSchoolId(
  userId: string | null,
  userSchoolId: string | null
): Promise<string | null> {
  if (userSchoolId || !userId) return userSchoolId;
  const { data, error } = await supabase
    .from("profiles")
    .select("school_id")
    .eq("id", userId)
    .maybeSingle<{ school_id: string | null }>();
  if (error) throw new Error(`Could not load the feed school: ${error.message}`);
  return data?.school_id ?? null;
}

/** Loads unseen school posts first, then fills the page with globally scored posts. */
export async function getSmartFeed({
  userId,
  userSchoolId,
  page = 1,
  limit = 10,
  seenPostIds = [],
}: SmartFeedInput): Promise<SmartFeedResult> {
  const safePage = Number.isSafeInteger(page) && page > 0 ? Math.min(page, 50) : 1;
  const safeLimit = Number.isSafeInteger(limit)
    ? Math.min(MAX_PAGE_SIZE, Math.max(1, limit))
    : 10;
  const seenIds = new Set(seenPostIds.filter((id) =>
    typeof id === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
  ));
  const actualUserId = userId ?? await currentUserId();
  const schoolId = await resolveUserSchoolId(actualUserId, userSchoolId);
  const blockedUserIds = await fetchBlockedUserIds();
  const offset = seenIds.size === 0 ? (safePage - 1) * safeLimit : 0;
  const promotedPosts = (await fetchFeed({
    schoolId: schoolId ?? undefined,
    includeSpotlight: true,
    excludePostIds: [...seenIds],
    limit: safeLimit,
  }))
    .filter((post) => isPostPromoted(post))
    .slice(0, safeLimit);
  const promotedIds = promotedPosts.map((post) => post.id);
  if (seenIds.size === 0 && offset + safeLimit + 1 > 1000) {
    throw new Error("Pass seenPostIds to continue paging through the feed.");
  }

  const organicLimit = Math.max(0, safeLimit - promotedPosts.length);
  const schoolFetchLimit = seenIds.size === 0
    ? offset + organicLimit + 1
    : organicLimit + 1;
  const schoolCandidates = schoolId
    ? await fetchFeed({
        schoolId,
        includeSpotlight: false,
        excludePostIds: [...seenIds, ...promotedIds],
        limit: schoolFetchLimit,
        offset: 0,
      })
    : [];
  const schoolPosts = schoolCandidates
    .filter((post) => !seenIds.has(post.id) && !promotedIds.includes(post.id))
    .sort(newestFirst);
  const selectedSchoolPosts = schoolPosts.slice(offset, offset + organicLimit);
  const schoolHasMore = schoolPosts.length > offset + organicLimit;
  const globalOffset = seenIds.size === 0
    ? Math.max(0, offset - schoolPosts.length)
    : 0;
  const globalExclusions = new Set(seenIds);
  for (const postId of promotedIds) globalExclusions.add(postId);
  for (const post of schoolPosts) globalExclusions.add(post.id);

  if (selectedSchoolPosts.length === organicLimit) {
    if (schoolHasMore) {
      return {
        posts: [...promotedPosts, ...selectedSchoolPosts],
        hasMore: true,
      };
    }
    const { data, error } = await supabase.rpc("get_smart_global_feed", {
      p_excluded_post_ids: [...globalExclusions],
      p_excluded_user_ids: blockedUserIds,
      p_limit: 1,
      p_offset: globalOffset,
    });
    if (error) throw new Error(`Could not check for more global posts: ${error.message}`);
    const ranks = parseGlobalFeedRanks(data);
    return {
      posts: [...promotedPosts, ...selectedSchoolPosts],
      hasMore: ranks.length > 0,
    };
  }

  const remaining = safeLimit - promotedPosts.length - selectedSchoolPosts.length;
  const { data: rankedRows, error: rankError } = await supabase.rpc("get_smart_global_feed", {
    p_excluded_post_ids: [...globalExclusions],
    p_excluded_user_ids: blockedUserIds,
    p_limit: remaining + 1,
    p_offset: globalOffset,
  });
  if (rankError) throw new Error(`Could not rank global posts: ${rankError.message}`);
  const ranks = parseGlobalFeedRanks(rankedRows);
  const postIds = ranks.slice(0, remaining).map((row) => row.post_id);
  const postsById = new Map(
    (postIds.length > 0
      ? await fetchFeed({ postIds, includeSpotlight: false, limit: postIds.length })
      : []
    ).map((post) => [post.id, post])
  );
  const selectedGlobalPosts = postIds
    .map((id) => postsById.get(id))
    .filter((post): post is Post => post !== undefined);
  const posts = [...promotedPosts, ...selectedSchoolPosts, ...selectedGlobalPosts];
  const hasMore = ranks.length > remaining;

  return {
    posts,
    hasMore: posts.length > 0 && hasMore,
  };
}
