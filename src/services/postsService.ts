import { shortNameOf } from "../lib/media";
import {
  isBrowserOffline,
  readLatestOfflineFeed,
  readOfflineValue,
  writeLatestOfflineFeed,
  writeOfflineValue,
} from "../lib/offlineCache";
import { countOf, currentUserId, requireUserId, supabase } from "../lib/supabase";
import type { Comment, MediaType, Post, PostStatus } from "../types/models";
import { fetchBlockedUserIds } from "./blocksService";
import { uploadPostMedia } from "./storageService";

const BASE_POST_SELECT = `id, user_id, school_id, content, media_url, post_type, status, created_at,
  author:profiles(id, username, avatar_url, school_id),
  school:schools(id, name, crest_url:logo_url),
  likes(count), comments(count)`;

const GROUP_POST_SELECT = `id, user_id, school_id, group_id, content, media_url, post_type, status, created_at,
  author:profiles(id, username, avatar_url, school_id),
  school:schools(id, name, crest_url:logo_url),
  group:school_groups(id, name, emoji),
  likes(count), comments(count)`;

const SPOTLIGHT_FEED_SLOTS = 3;
let spotlightPromotionsTableAvailable: boolean | null = null;

export const POST_SELECT = BASE_POST_SELECT;

/**
 * Step 9 adds `posts.group_id` + `school_groups`. Until migration-step9.sql is
 * applied the feed must still load, so the richer select is used only when the
 * table is reachable. Cached for the session.
 */
let groupsSupportPromise: Promise<boolean> | null = null;
export function supportsSchoolGroups(): Promise<boolean> {
  if (!groupsSupportPromise) {
    groupsSupportPromise = (async () => {
      try {
        const { error } = await supabase.from("school_groups").select("id").limit(1);
        if (error && (error.code === "PGRST205" || error.code === "42P01")) return false;
        return true;
      } catch {
        return false;
      }
    })();
  }
  return groupsSupportPromise;
}

let videoSupportPromise: Promise<boolean> | null = null;
function supportsVideoMetadata(): Promise<boolean> {
  if (!videoSupportPromise) {
    videoSupportPromise = (async () => {
      try {
        const { error } = await supabase.from("posts").select("media_type").limit(1);
        if (error && (error.code === "42703" || error.code === "PGRST204")) return false;
        return true;
      } catch {
        return false;
      }
    })();
  }
  return videoSupportPromise;
}

let hiddenPostSupportPromise: Promise<boolean> | null = null;
export function supportsPostVisibility(): Promise<boolean> {
  if (!hiddenPostSupportPromise) {
    hiddenPostSupportPromise = (async () => {
      const { error } = await supabase.from("posts").select("is_hidden").limit(1);
      if (error && (error.code === "42703" || error.code === "PGRST204")) return false;
      if (error) throw new Error(error.message);
      return true;
    })();
  }
  return hiddenPostSupportPromise;
}

let postSharesSupportPromise: Promise<boolean> | null = null;
function supportsPostShares(): Promise<boolean> {
  if (!postSharesSupportPromise) {
    postSharesSupportPromise = (async () => {
      const { error } = await supabase.from("post_shares").select("id").limit(1);
      if (error && (error.code === "42P01" || error.code === "PGRST205")) return false;
      if (error) throw new Error(error.message);
      return true;
    })();
  }
  return postSharesSupportPromise;
}

let postMediaSupportPromise: Promise<boolean> | null = null;
function supportsPostMedia(): Promise<boolean> {
  if (!postMediaSupportPromise) {
    postMediaSupportPromise = (async () => {
      const { error } = await supabase.from("post_media").select("id").limit(1);
      if (error && (error.code === "42P01" || error.code === "PGRST205")) return false;
      if (error) throw new Error(error.message);
      return true;
    })();
  }
  return postMediaSupportPromise;
}

let seedEngagementSupportPromise: Promise<boolean> | null = null;
function supportsSeedEngagement(): Promise<boolean> {
  if (!seedEngagementSupportPromise) {
    seedEngagementSupportPromise = (async () => {
      const { error } = await supabase
        .from("posts")
        .select("seed_likes_count, seed_comments_count")
        .limit(1);
      if (error && (error.code === "42703" || error.code === "PGRST204")) return false;
      if (error) throw new Error(error.message);
      return true;
    })();
  }
  return seedEngagementSupportPromise;
}

async function selectForGroups(): Promise<string> {
  const [groups, video, hidden, shares, seededEngagement] = await Promise.all([
    supportsSchoolGroups(),
    supportsVideoMetadata(),
    supportsPostVisibility(),
    supportsPostShares(),
    supportsSeedEngagement(),
  ]);
  return `${groups ? GROUP_POST_SELECT : BASE_POST_SELECT}${video ? ", media_type, video_duration_seconds" : ""}${hidden ? ", is_hidden" : ""}${shares ? ", post_shares(count)" : ""}${seededEngagement ? ", seed_likes_count, seed_comments_count" : ""}`;
}

export interface RawPost {
  id: string;
  user_id: string;
  school_id: string;
  group_id?: string | null;
  content: string;
  media_url: string | null;
  media_type?: "image" | "video" | null;
  video_duration_seconds?: number | null;
  post_type: "public" | "confession";
  status: PostStatus;
  is_hidden?: boolean;
  created_at: string;
  author: { id: string; username: string; avatar_url: string | null; school_id?: string | null } | null;
  school: { id: string; name: string; crest_url: string | null } | null;
  group?: { id: string; name: string; emoji: string } | null;
  likes: { count: number }[];
  comments: { count: number }[];
  post_shares?: { count: number }[];
  seed_likes_count?: number;
  seed_comments_count?: number;
}

interface RawPostMedia {
  post_id: string;
  media_url: string;
  media_type: MediaType;
  video_duration_seconds: number | null;
  sort_order: number;
}

interface SpotlightPromotionRow {
  id: string;
  post_id: string;
  user_id: string;
  target_school_ids: string[] | null;
  started_at: string;
  expires_at: string;
  created_at: string;
}

export function mapPost(row: RawPost, liked: boolean): Post {
  const schoolName = row.school?.name ?? "School";
  return {
    id: row.id,
    authorId: row.user_id,
    authorName: row.author?.username ?? "student",
    authorAvatar: row.author?.avatar_url ?? null,
    authorSchoolId: row.author?.school_id ?? row.school_id,
    schoolId: row.school_id,
    schoolName,
    schoolShort: row.school ? shortNameOf(schoolName) : "SHS",
    schoolCrest: row.school?.crest_url ?? null,
    groupId: row.group_id ?? row.group?.id ?? null,
    groupName: row.group?.name ?? null,
    groupEmoji: row.group?.emoji ?? null,
    content: row.content,
    mediaUrls: row.media_url ? [row.media_url] : [],
    mediaTypes: row.media_url
      ? [row.media_type ?? (/\.(mp4|webm|mov|m4v|ogv)(?:$|[?#])/i.test(row.media_url) ? "video" : "image")]
      : [],
    videoDurations: row.media_url ? [row.video_duration_seconds ?? null] : [],
    mediaType:
      row.media_type ??
      (/\.(mp4|webm|mov|m4v|ogv)(?:$|[?#])/i.test(row.media_url ?? "") ? "video" : "image"),
    videoDurationSeconds: row.video_duration_seconds ?? null,
    status: row.status,
    createdAt: row.created_at,
    spotlightStatus: null,
    spotlightExpiresAt: null,
    spotlightTargetSchoolIds: null,
    likeCount: Math.max(countOf(row.likes), row.seed_likes_count ?? 0),
    likedByMe: liked,
    commentCount: Math.max(countOf(row.comments), row.seed_comments_count ?? 0),
    shareCount: countOf(row.post_shares),
  };
}

/** Second lightweight query: which of these posts has the viewer liked? */
export async function hydrateLikes(rows: RawPost[]): Promise<Post[]> {
  if (rows.length === 0) return [];
  const userId = await currentUserId();
  let likedIds = new Set<string>();
  if (userId) {
    const { data } = await supabase
      .from("likes")
      .select("post_id")
      .eq("user_id", userId)
      .in("post_id", rows.map((row) => row.id));
    likedIds = new Set((data ?? []).map((like: { post_id: string }) => like.post_id));
  }
  const posts = rows.map((row) => mapPost(row, likedIds.has(row.id)));
  if (!(await supportsPostMedia())) return posts;

  const { data: mediaRows, error: mediaError } = await supabase
    .from("post_media")
    .select("post_id, media_url, media_type, video_duration_seconds, sort_order")
    .in("post_id", rows.map((row) => row.id))
    .order("sort_order", { ascending: true })
    .returns<RawPostMedia[]>();
  if (mediaError) throw new Error(mediaError.message);
  const byPost = new Map<string, RawPostMedia[]>();
  for (const media of mediaRows ?? []) {
    const items = byPost.get(media.post_id) ?? [];
    items.push(media);
    byPost.set(media.post_id, items);
  }
  return posts.map((post) => {
    const items = byPost.get(post.id);
    if (!items?.length) return post;
    return {
      ...post,
      mediaUrls: items.map((item) => item.media_url),
      mediaTypes: items.map((item) => item.media_type),
      videoDurations: items.map((item) => item.video_duration_seconds),
      mediaType: items[0]!.media_type,
      videoDurationSeconds: items[0]!.video_duration_seconds,
    };
  });
}

export interface FeedQuery {
  schoolId?: string | null;
  /** Filter to one school club/squad (requires migration-step9). */
  groupId?: string | null;
  authorId?: string | null;
  authorIds?: string[];
  /** Include flagged/removed rows (RLS still decides visibility). */
  includeModerated?: boolean;
  search?: string;
  /** Excludes active promoted posts but does not place them in the result. */
  includeSpotlight?: boolean;
  limit?: number;
  offset?: number;
}

export function sortPostsNewestFirst(posts: Post[]): Post[] {
  return [...posts].sort((left, right) => {
    const dateDifference = Date.parse(right.createdAt) - Date.parse(left.createdAt);
    return dateDifference || right.id.localeCompare(left.id);
  });
}

async function fetchFeedOnline(query: FeedQuery): Promise<Post[]> {
  if (query.authorIds && query.authorIds.length === 0) return [];
  const limit = query.limit ?? 10;
  const offset = query.offset ?? 0;
  const [blockedUserIds, userId, supportsHiddenPosts] = await Promise.all([
    fetchBlockedUserIds(),
    currentUserId(),
    supportsPostVisibility(),
  ]);
  const blocked = new Set(blockedUserIds);
  const select = await selectForGroups();

  let promotedPosts: Post[] = [];
  let promotedPostIds: string[] = [];
  if (!query.authorId && !query.authorIds && !query.groupId && spotlightPromotionsTableAvailable !== false) {
    let viewerSchoolId = query.schoolId ?? null;
    if (!viewerSchoolId && userId) {
      const { data: viewer, error: viewerError } = await supabase
        .from("profiles")
        .select("school_id")
        .eq("id", userId)
        .maybeSingle<{ school_id: string | null }>();
      if (viewerError) throw new Error(viewerError.message);
      viewerSchoolId = viewer?.school_id ?? null;
    }

    const now = new Date().toISOString();
    const { data: promotionRows, error: promotionError } = await supabase
      .from("spotlight_promotions")
      .select("id, post_id, user_id, target_school_ids, started_at, expires_at, created_at")
      .eq("status", "active")
      .lte("started_at", now)
      .gt("expires_at", now)
      .order("created_at", { ascending: false })
      .limit(40)
      .returns<SpotlightPromotionRow[]>();
    if (promotionError) {
      if (promotionError.code === "42P01" || promotionError.code === "PGRST205") {
        spotlightPromotionsTableAvailable = false;
      } else {
        throw new Error(promotionError.message);
      }
    } else {
      spotlightPromotionsTableAvailable = true;
      const eligiblePromotions = (promotionRows ?? []).filter((promotion) => {
        if (blocked.has(promotion.user_id)) return false;
        const targets = promotion.target_school_ids;
        if (!targets || targets.length === 0) return true;
        return viewerSchoolId !== null && targets.includes(viewerSchoolId);
      });
      const candidateIds = eligiblePromotions.map((promotion) => promotion.post_id);
      if (candidateIds.length > 0) {
        let promotedQuery = supabase
          .from("posts")
          .select(select)
          .in("id", candidateIds)
          .eq("post_type", "public")
          .eq("status", "active");
        if (supportsHiddenPosts) promotedQuery = promotedQuery.eq("is_hidden", false);
        const { data: rows, error } = await promotedQuery.returns<RawPost[]>();
        if (error) throw new Error(error.message);

        const promotionsByPostId = new Map<string, SpotlightPromotionRow>();
        const promotionOrder = new Map<string, number>();
        for (const promotion of eligiblePromotions) {
          if (!promotionsByPostId.has(promotion.post_id)) {
            promotionsByPostId.set(promotion.post_id, promotion);
            promotionOrder.set(promotion.post_id, promotionOrder.size);
          }
        }
        const eligibleRows = (rows ?? []).filter((row) =>
          !blocked.has(row.user_id) &&
          (!query.search?.trim() || row.content.toLowerCase().includes(query.search.trim().toLowerCase()))
        );
        const mappedPromoted = await hydrateLikes(eligibleRows);
        const activePromotedPosts = mappedPromoted
          .map((post) => {
            const promotion = promotionsByPostId.get(post.id);
            return {
              ...post,
              spotlightStatus: "active" as const,
              spotlightExpiresAt: promotion?.expires_at ?? null,
              spotlightTargetSchoolIds: promotion?.target_school_ids ?? null,
            };
          })
          .sort((left, right) =>
            (promotionOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
            (promotionOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER)
          );
        const spotlightCandidates = activePromotedPosts.slice(0, SPOTLIGHT_FEED_SLOTS);
        promotedPostIds = spotlightCandidates.map((post) => post.id);
        if (offset === 0 && query.includeSpotlight !== false) {
          promotedPosts = spotlightCandidates.slice(0, limit);
          promotedPostIds = promotedPosts.map((post) => post.id);
        }
      }
    }
  }

  const organicLimit = Math.max(0, limit - promotedPosts.length);
  if (organicLimit === 0) return sortPostsNewestFirst(promotedPosts);
  const supportsGroups = await supportsSchoolGroups();
  let request = supabase
    .from("posts")
    .select(select)
    .eq("post_type", "public")
    .order("created_at", { ascending: false })
    .range(offset, offset + organicLimit - 1);
  if (supportsHiddenPosts) request = request.eq("is_hidden", false);

  if (!query.includeModerated) request = request.eq("status", "active");
  if (query.schoolId) request = request.eq("school_id", query.schoolId);
  if (query.groupId && supportsGroups) request = request.eq("group_id", query.groupId);
  if (query.authorId) request = request.eq("user_id", query.authorId);
  if (query.authorIds) request = request.in("user_id", query.authorIds);
  if (query.search?.trim()) request = request.ilike("content", `%${query.search.trim()}%`);
  if (blockedUserIds.length > 0) {
    request = request.not(
      "user_id",
      "in",
      `(${blockedUserIds.map((id) => `"${id}"`).join(",")})`
    );
  }
  if (promotedPostIds.length > 0) {
    request = request.not(
      "id",
      "in",
      `(${promotedPostIds.map((id) => `"${id}"`).join(",")})`
    );
  }

  const { data, error } = await request.returns<RawPost[]>();
  if (error) throw new Error(error.message);
  const organicPosts = await hydrateLikes(data ?? []);
  return sortPostsNewestFirst([...promotedPosts, ...organicPosts]);
}

function feedCacheKey(query: FeedQuery, userId: string | null): string {
  return `feed:${userId ?? "guest"}:${JSON.stringify({
    schoolId: query.schoolId ?? null,
    groupId: query.groupId ?? null,
    authorId: query.authorId ?? null,
    authorIds: query.authorIds ? [...query.authorIds].sort() : undefined,
    includeModerated: query.includeModerated ?? false,
    search: query.search?.trim() ?? "",
    includeSpotlight: query.includeSpotlight ?? true,
    limit: query.limit ?? 10,
    offset: query.offset ?? 0,
  })}`;
}

function refreshCachedSpotlights(posts: Post[]): Post[] {
  const now = Date.now();
  return posts.map((post) =>
    post.spotlightStatus === "active" &&
    post.spotlightExpiresAt &&
    Date.parse(post.spotlightExpiresAt) <= now
      ? { ...post, spotlightStatus: null, spotlightExpiresAt: null }
      : post
  );
}

export async function fetchFeed(query: FeedQuery = {}): Promise<Post[]> {
  const userId = await currentUserId();
  const key = feedCacheKey(query, userId);

  if (isBrowserOffline()) {
    const cached = await readOfflineValue<Post[]>(key);
    if (cached) return sortPostsNewestFirst(refreshCachedSpotlights(cached));
    const latest = await readLatestOfflineFeed<Post>(userId);
    if (latest) {
      const filtered = latest.filter((post) =>
        (!query.schoolId || post.schoolId === query.schoolId) &&
        (!query.groupId || post.groupId === query.groupId) &&
        (!query.authorId || post.authorId === query.authorId) &&
        (!query.authorIds || query.authorIds.includes(post.authorId)) &&
        (!query.search?.trim() || post.content.toLowerCase().includes(query.search.trim().toLowerCase())) &&
        (query.includeModerated || post.status === "active")
      );
      return sortPostsNewestFirst(refreshCachedSpotlights(filtered)).slice(query.offset ?? 0, (query.offset ?? 0) + (query.limit ?? 10));
    }
    throw new Error("You are offline and this feed has not been cached on this device.");
  }

  try {
    const posts = sortPostsNewestFirst(await fetchFeedOnline(query));
    try {
      await writeOfflineValue(key, posts);
    } catch (error) {
      console.warn("Could not save this feed for offline use.", error);
    }
    if (
      query.offset === undefined &&
      (query.limit ?? 10) >= 50 &&
      !query.schoolId &&
      !query.groupId &&
      !query.authorId &&
      !query.authorIds &&
      !query.search
    ) {
      try {
        await writeLatestOfflineFeed(userId, posts);
      } catch (error) {
        console.warn("Could not save the latest feed for offline use.", error);
      }
    }
    return posts;
  } catch (error) {
    if (!isBrowserOffline()) throw error;
    const cached = await readOfflineValue<Post[]>(key);
    if (cached) return sortPostsNewestFirst(refreshCachedSpotlights(cached));
    const latest = await readLatestOfflineFeed<Post>(userId);
    if (latest) {
      const filtered = latest.filter((post) =>
        (!query.schoolId || post.schoolId === query.schoolId) &&
        (!query.groupId || post.groupId === query.groupId) &&
        (!query.authorId || post.authorId === query.authorId) &&
        (!query.authorIds || query.authorIds.includes(post.authorId)) &&
        (!query.search?.trim() || post.content.toLowerCase().includes(query.search.trim().toLowerCase())) &&
        (query.includeModerated || post.status === "active")
      );
      return sortPostsNewestFirst(refreshCachedSpotlights(filtered)).slice(
        query.offset ?? 0,
        (query.offset ?? 0) + (query.limit ?? 10)
      );
    }
    throw error;
  }
}

/** Smart Trending: only gists that have crossed 1,000 likes. */
export const TRENDING_LIKE_THRESHOLD = 1000;

/** Cached so a project without migration-step9 does not 404 on every Trending visit. */
let likeCountsViewAvailable: boolean | null = null;

export async function fetchTrendingPosts(
  threshold = TRENDING_LIKE_THRESHOLD,
  limit = 20
): Promise<Post[]> {
  if (likeCountsViewAvailable !== false) try {
    const { data, error } = await supabase
      .from("post_like_counts")
      .select("post_id, likes_count")
      .gte("likes_count", threshold)
      .order("likes_count", { ascending: false })
      .limit(limit)
      .returns<Array<{ post_id: string; likes_count: number }>>();
    if (error && (error.code === "PGRST205" || error.code === "42P01")) {
      likeCountsViewAvailable = false;
    }
    if (!error && data) {
      const ids = data.map((row) => row.post_id);
      if (ids.length === 0) return [];
      const select = await selectForGroups();
      const supportsHiddenPosts = await supportsPostVisibility();
      let postsQuery = supabase
        .from("posts")
        .select(select)
        .in("id", ids)
        .eq("status", "active");
      if (supportsHiddenPosts) postsQuery = postsQuery.eq("is_hidden", false);
      const blockedUserIds = await fetchBlockedUserIds();
      if (blockedUserIds.length > 0) {
        postsQuery = postsQuery.not(
          "user_id",
          "in",
          `(${blockedUserIds.map((id) => `"${id}"`).join(",")})`
        );
      }
      const { data: posts, error: postsError } = await postsQuery.returns<RawPost[]>();
      if (postsError) throw new Error(postsError.message);
      const rank = new Map(data.map((row, index) => [row.post_id, index]));
      const ordered = [...(posts ?? [])].sort(
        (a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0)
      );
      return hydrateLikes(ordered);
    }
  } catch {
    // View missing (migration pending) → fall through to the client-side filter.
  }

  const candidates = await fetchFeed({ limit: 50 });
  return candidates
    .filter((post) => post.likeCount >= threshold)
    .sort((a, b) => b.likeCount - a.likeCount)
    .slice(0, limit);
}

export async function fetchPopularGists(limit = 8): Promise<Post[]> {
  const { data: popular, error: countError } = await supabase
    .from("post_like_counts")
    .select("post_id, likes_count")
    .gt("likes_count", 100)
    .order("likes_count", { ascending: false })
    .limit(limit)
    .returns<Array<{ post_id: string; likes_count: number }>>();
  if (countError && countError.code !== "PGRST205" && countError.code !== "42P01") {
    throw new Error(countError.message);
  }
  if (countError) {
    return (await fetchFeed({ limit: 100 }))
      .filter((post) => post.likeCount > 100)
      .sort((a, b) => b.likeCount - a.likeCount)
      .slice(0, limit);
  }
  if (!popular?.length) return [];

  const select = await selectForGroups();
  const supportsHiddenPosts = await supportsPostVisibility();
  let request = supabase
    .from("posts")
    .select(select)
    .in("id", popular.map((item) => item.post_id))
    .eq("status", "active");
  if (supportsHiddenPosts) request = request.eq("is_hidden", false);
  const { data, error } = await request.returns<RawPost[]>();
  if (error) throw new Error(error.message);
  const order = new Map(popular.map((item, index) => [item.post_id, index]));
  const ordered = [...(data ?? [])].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  return hydrateLikes(ordered);
}

/** Highest-liked gists right now — shown as a labelled fallback when trending is empty. */
export async function fetchTopByLikes(limit = 4): Promise<Post[]> {
  const candidates = await fetchFeed({ limit: 40 });
  return [...candidates].sort((a, b) => b.likeCount - a.likeCount).slice(0, limit);
}

/** Soft-delete (`status = 'removed'`). RLS permits authors, school moderators and admins. */
export async function deletePost(postId: string): Promise<void> {
  await requireUserId();
  const { data, error } = await supabase
    .from("posts")
    .update({ status: "removed" })
    .eq("id", postId)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    throw new Error("You do not have permission to delete this gist.");
  }
}

export async function fetchPost(postId: string): Promise<Post | null> {
  const select = await selectForGroups();
  const supportsHiddenPosts = await supportsPostVisibility();
  let request = supabase
    .from("posts")
    .select(select)
    .eq("id", postId);
  if (supportsHiddenPosts) request = request.eq("is_hidden", false);
  const { data, error } = await request.maybeSingle<RawPost>();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const [post] = await hydrateLikes([data]);
  return post ?? null;
}

export interface CreatePostInput {
  content: string;
  schoolId: string;
  /** Optional club/squad (requires migration-step9). */
  groupId?: string | null;
  files?: File[];
  videoDurations?: Array<number | null>;
}

export async function createPost(input: CreatePostInput): Promise<Post> {
  const userId = await requireUserId();
  const files = input.files ?? [];
  const content = input.content.trim();
  if (!content && files.length === 0) {
    throw new Error("Please add text, an image, or a video to publish.");
  }
  if (content.length > 300) {
    throw new Error("Gist text must be 300 characters or fewer.");
  }
  const unsupportedFile = files.find((file) =>
    !file.type.startsWith("image/") && !file.type.startsWith("video/")
  );
  if (unsupportedFile) {
    throw new Error("Upload failed. Please check your file size and format.");
  }
  const imageCount = files.filter((file) => file.type.startsWith("image/")).length;
  const videoCount = files.length - imageCount;
  if (imageCount > 5 || videoCount > 3) {
    throw new Error("A gist can include up to 5 images and 3 videos.");
  }
  if (files.length > 1 && !(await supportsPostMedia())) {
    throw new Error("Multiple attachments need the profile_explore_and_post_media.sql migration.");
  }
  const media = await Promise.all(files.map((file) => uploadPostMedia(file)));
  const firstMedia = media[0] ?? null;
  const [supportsGroups, supportsVideo] = await Promise.all([supportsSchoolGroups(), supportsVideoMetadata()]);

  const payload: Record<string, unknown> = {
    user_id: userId,
    school_id: input.schoolId,
    content,
    media_url: firstMedia?.url ?? null,
    post_type: "public",
    status: "active",
    ...(supportsGroups && input.groupId ? { group_id: input.groupId } : {}),
  };
  if (firstMedia && supportsVideo) {
    payload.media_type = firstMedia.mediaType;
    if (firstMedia.mediaType === "video") {
      payload.video_duration_seconds = input.videoDurations?.[0] ?? null;
    }
  }

  const select = await selectForGroups();
  const { data, error } = await supabase.from("posts").insert(payload).select(select).single<RawPost>();
  if (error) throw new Error(error.message);
  if (media.length > 0 && (await supportsPostMedia())) {
    const { error: mediaError } = await supabase.from("post_media").insert(
      media.map((item, index) => ({
        post_id: data.id,
        media_url: item.url,
        media_type: item.mediaType,
        video_duration_seconds: item.mediaType === "video" ? input.videoDurations?.[index] ?? null : null,
        sort_order: index,
      }))
    );
    if (mediaError) {
      const { error: rollbackError } = await supabase.from("posts").delete().eq("id", data.id);
      if (rollbackError) console.error("Could not remove a partially-created gist.", rollbackError);
      throw new Error(mediaError.message);
    }
  }
  const [post] = await hydrateLikes([data]);
  return post!;
}

/** Toggles the viewer's like and returns the new liked state. */
export async function toggleLike(postId: string): Promise<boolean> {
  const userId = await requireUserId();
  const { data: existing, error: lookupError } = await supabase
    .from("likes")
    .select("id")
    .eq("post_id", postId)
    .eq("user_id", userId)
    .maybeSingle<{ id: string }>();
  if (lookupError) throw new Error(lookupError.message);

  if (existing) {
    const { error } = await supabase.from("likes").delete().eq("id", existing.id);
    if (error) throw new Error(error.message);
    return false;
  }
  const { error } = await supabase.from("likes").insert({ post_id: postId, user_id: userId });
  if (error && error.code !== "23505") throw new Error(error.message);
  return true;
}

export async function fetchLikedPosts(limit = 30): Promise<Post[]> {
  const userId = await requireUserId();
  const { data: likeRows, error: likeError } = await supabase
    .from("likes")
    .select("post_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (likeError) throw new Error(likeError.message);
  const ids = (likeRows ?? []).map((row: { post_id: string }) => row.post_id);
  if (ids.length === 0) return [];

  const select = await selectForGroups();
  const supportsHiddenPosts = await supportsPostVisibility();
  const { data, error } = await supabase
    .from("posts")
    .select(select)
    .in("id", ids)
    .eq("status", "active")
    .returns<RawPost[]>();
  const visibleRows = supportsHiddenPosts
    ? (data ?? []).filter((row) => row.is_hidden !== true)
    : data ?? [];
  if (error) throw new Error(error.message);
  const order = new Map(ids.map((id, index) => [id, index]));
  const sorted = [...visibleRows].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  return hydrateLikes(sorted);
}

export async function fetchPostsByIds(ids: string[]): Promise<Post[]> {
  if (ids.length === 0) return [];
  const select = await selectForGroups();
  const { data, error } = await supabase
    .from("posts")
    .select(select)
    .in("id", ids)
    .eq("status", "active")
    .returns<RawPost[]>();
  if (error) throw new Error(error.message);
  const order = new Map(ids.map((id, index) => [id, index]));
  const ordered = [...(data ?? [])].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  return hydrateLikes(ordered);
}

export async function permanentlyDeletePost(postId: string): Promise<void> {
  await requireUserId();
  const { error } = await supabase.from("posts").delete().eq("id", postId);
  if (error) throw new Error(error.message);
}

/* ───────────── Comments ───────────── */

const COMMENT_SELECT = `id, post_id, user_id, content, created_at,
  author:profiles(id, username, avatar_url, school_id, school:schools!school_id(name))`;

interface RawComment {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  created_at: string;
  author: {
    id: string;
    username: string;
    avatar_url: string | null;
    school_id: string | null;
    school: { name: string } | null;
  } | null;
}

function mapComment(row: RawComment): Comment {
  return {
    id: row.id,
    postId: row.post_id,
    authorId: row.user_id,
    authorName: row.author?.username ?? "student",
    authorAvatar: row.author?.avatar_url ?? null,
    authorSchoolId: row.author?.school_id ?? null,
    authorSchoolShort: row.author?.school ? shortNameOf(row.author.school.name) : null,
    content: row.content,
    createdAt: row.created_at,
  };
}

export async function fetchComments(postId: string): Promise<Comment[]> {
  const { data, error } = await supabase
    .from("comments")
    .select(COMMENT_SELECT)
    .eq("post_id", postId)
    .order("created_at", { ascending: true })
    .returns<RawComment[]>();
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapComment);
}

export async function seedPostEngagement(
  postId: string,
  likesCount: number | null,
  commentsCount: number | null
): Promise<void> {
  const { error } = await supabase.rpc("admin_seed_engagement", {
    p_post_id: postId,
    p_likes_count: likesCount,
    p_comments_count: commentsCount,
  });
  if (error) throw new Error(error.message);
}

export async function addComment(postId: string, content: string): Promise<Comment> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from("comments")
    .insert({ post_id: postId, user_id: userId, content: content.trim() })
    .select(COMMENT_SELECT)
    .single<RawComment>();
  if (error) throw new Error(error.message);
  return mapComment(data);
}

export async function deleteComment(commentId: string): Promise<void> {
  const { error } = await supabase.from("comments").delete().eq("id", commentId);
  if (error) throw new Error(error.message);
}
