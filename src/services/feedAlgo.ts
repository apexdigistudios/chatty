import { currentUserId, supabase } from "../lib/supabase";
import { isBrowserOffline, readOfflineValue } from "../lib/offlineCache";
import { rotateBySeed } from "../lib/feedRotation";
import type { Post, Profile } from "../types/models";
import { fetchFollowingIds } from "./followsService";
import { fetchFeed } from "./postsService";

const CANDIDATE_LIMIT = 100;
const TIME_DECAY_PER_HOUR = 0.35;

export interface FeedRankingContext {
  schoolId: string | null;
  followingIds: ReadonlySet<string>;
  now?: number;
}

export function scoreFeedPost(post: Post, context: FeedRankingContext): number {
  const ageInHours = Math.max(0, (context.now ?? Date.now()) - Date.parse(post.createdAt)) / 3_600_000;
  return (
    (context.followingIds.has(post.authorId) ? 50 : 0) +
    (context.schoolId !== null && post.schoolId === context.schoolId ? 30 : 0) +
    post.likeCount * 10 +
    post.commentCount * 20 +
    (post.shareCount ?? 0) * 30 -
    ageInHours * TIME_DECAY_PER_HOUR
  );
}

export function rankFeedPosts(posts: Post[], context: FeedRankingContext): Post[] {
  return [...posts].sort((left, right) => {
    const difference = scoreFeedPost(right, context) - scoreFeedPost(left, context);
    return difference || Date.parse(right.createdAt) - Date.parse(left.createdAt);
  });
}

export interface RankedFeedOptions {
  limit: number;
  offset?: number;
  rotationSeed?: number;
  followingOnly?: boolean;
  schoolId?: string | null;
  tag?: string;
}

export async function fetchFeedRankingContext(): Promise<FeedRankingContext> {
  const viewerId = await currentUserId();
  const followingIds = new Set(await fetchFollowingIds(viewerId));
  let viewerSchoolId: string | null = null;
  if (viewerId) {
    if (isBrowserOffline()) {
      const cachedProfile = await readOfflineValue<Profile>(`profile:private:${viewerId}`);
      viewerSchoolId = cachedProfile?.schoolId ?? null;
    } else {
      const { data, error } = await supabase
        .from("profiles")
        .select("school_id")
        .eq("id", viewerId)
        .maybeSingle<{ school_id: string | null }>();
      if (error) throw new Error(error.message);
      viewerSchoolId = data?.school_id ?? null;
    }
  }
  return { schoolId: viewerSchoolId, followingIds, now: Date.now() };
}

export async function fetchRankedFeed({
  limit,
  offset = 0,
  followingOnly = false,
  schoolId,
  tag,
  rotationSeed,
}: RankedFeedOptions): Promise<Post[]> {
  const context = await fetchFeedRankingContext();
  if (followingOnly && context.followingIds.size === 0) return [];

  let candidates: Post[];
  try {
    candidates = await fetchFeed({
      limit: CANDIDATE_LIMIT,
      schoolId: schoolId ?? undefined,
      authorIds: followingOnly ? [...context.followingIds] : undefined,
      tag,
    });
  } catch (error) {
    if (!isBrowserOffline() || followingOnly) throw error;
    candidates = await fetchFeed({ limit: 10, schoolId: schoolId ?? undefined, tag });
  }
  const rankedCandidates = rankFeedPosts(candidates, context);
  const rotatedCandidates = rotationSeed === undefined
    ? rankedCandidates
    : rotateBySeed(rankedCandidates, rotationSeed);
  return rotatedCandidates.slice(offset, offset + limit);
}
