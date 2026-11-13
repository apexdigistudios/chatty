import { createClient } from "@supabase/supabase-js";
import { defaultAvatarUrl, shortNameOf } from "@/lib/media";
import { isVideoUrl } from "@/lib/video";
import { emptyReactions, type Confession, type Post, type PublicProfile } from "@/types/models";

if (typeof window !== "undefined") {
  throw new Error("Public content queries are server-only.");
}

type PublicPostRow = {
  id: string;
  user_id: string;
  seed_profile_id?: string | null;
  school_id: string | null;
  content: string;
  media_url: string | null;
  media_type?: "image" | "video" | null;
  video_duration_seconds?: number | null;
  video_thumbnail_url?: string | null;
  seed_likes_count?: number;
  seed_comments_count?: number;
  seed_views_count?: number;
  is_promoted?: boolean;
  promoted_until?: string | null;
  promotion_status?: "active" | "expired";
  created_at: string;
  author: {
    id: string;
    username: string;
    full_name?: string | null;
    avatar_url: string | null;
    school_id: string | null;
    is_verified?: boolean | null;
    verified_title?: string | null;
    verified_expires_at?: string | null;
  } | null;
  seed_author?: {
    id: string;
    username: string;
    full_name: string;
    avatar_url: string | null;
    school_id: string;
  } | null;
  school: { id: string; name: string; crest_url: string | null } | null;
  media?: Array<{
    post_id: string;
    media_url: string;
    media_type?: "image" | "video" | null;
    video_duration_seconds?: number | null;
    video_thumbnail_url?: string | null;
    sort_order: number;
  }>;
  likes: Array<{ count: number }>;
  comments: Array<{ count: number }>;
};

type PublicConfessionRow = {
  id: string;
  school_id: string | null;
  category: Confession["category"];
  content: string;
  created_at: string;
  published_at: string | null;
  comment_count?: number;
  school_name?: string | null;
  school_crest_url?: string | null;
  media_urls?: string[] | null;
  media_types?: Array<"image" | "video"> | null;
};

function publicSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("Public Supabase configuration is missing.");
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function relationCount(rows: Array<{ count: number }> | null | undefined): number {
  return rows?.reduce((total, row) => total + (row.count ?? 0), 0) ?? 0;
}

let publicSeedAuthorsPromise: Promise<boolean> | null = null;
const publicColumnSupport = new Map<string, Promise<boolean>>();

function supportsPublicColumn(table: "posts" | "post_media", column: string): Promise<boolean> {
  const key = `${table}.${column}`;
  let support = publicColumnSupport.get(key);
  if (!support) {
    support = (async () => {
      const { error } = await publicSupabase().from(table).select(column).limit(1);
      if (error && (error.code === "42703" || error.code === "PGRST204")) return false;
      if (error && (error.code === "42P01" || error.code === "PGRST205")) return false;
      if (error) throw new Error(error.message);
      return true;
    })();
    publicColumnSupport.set(key, support);
  }
  return support;
}

let publicPostMediaAvailable: Promise<boolean> | null = null;
function supportsPublicPostMedia(): Promise<boolean> {
  if (!publicPostMediaAvailable) {
    publicPostMediaAvailable = (async () => {
      const { error } = await publicSupabase().from("post_media").select("id").limit(1);
      if (error && (error.code === "42P01" || error.code === "PGRST205")) return false;
      if (error) throw new Error(error.message);
      return true;
    })();
  }
  return publicPostMediaAvailable;
}

function supportsPublicSeedAuthors(): Promise<boolean> {
  if (!publicSeedAuthorsPromise) {
    publicSeedAuthorsPromise = (async () => {
      const client = publicSupabase();
      const [postColumn, seedTable] = await Promise.all([
        client.from("posts").select("seed_profile_id").limit(1),
        client.from("admin_seed_profiles").select("id").limit(1),
      ]);
      const missingCodes = new Set(["42P01", "42703", "PGRST204", "PGRST205"]);
      if (postColumn.error && !missingCodes.has(postColumn.error.code ?? "")) {
        throw new Error(postColumn.error.message);
      }
      if (seedTable.error && !missingCodes.has(seedTable.error.code ?? "")) {
        throw new Error(seedTable.error.message);
      }
      return !postColumn.error && !seedTable.error;
    })();
  }
  return publicSeedAuthorsPromise;
}

function mapPost(row: PublicPostRow, media?: Array<{
  media_url: string;
  media_type?: "image" | "video" | null;
  video_duration_seconds?: number | null;
  video_thumbnail_url?: string | null;
}>): Post {
  const joinedMedia = row.media?.length
    ? [...row.media].sort((left, right) => left.sort_order - right.sort_order)
    : undefined;
  const mediaItems = media?.length
    ? media
    : joinedMedia?.length
      ? joinedMedia
    : row.media_url
      ? [{ media_url: row.media_url, media_type: row.media_type }]
      : [];
  const mediaUrls = mediaItems.map((item) => item.media_url);
  const mediaTypes = mediaItems.map((item) =>
    item.media_type === "video" || isVideoUrl(item.media_url) ? "video" as const : "image" as const
  );
  const schoolName = row.school?.name ?? (row.school_id ? "School" : "Gist me");
  const seedAuthor = row.seed_author ?? null;

  return {
    id: row.id,
    authorId: seedAuthor?.id ?? row.author?.id ?? row.user_id,
    isSeed: Boolean(seedAuthor),
    authorName: seedAuthor?.username ?? row.author?.username ?? "student",
    authorFullName: seedAuthor?.full_name ?? row.author?.full_name ?? null,
    authorIsVerified: row.author?.is_verified ?? false,
    authorVerifiedTitle: row.author?.verified_title ?? null,
    authorVerifiedExpiresAt: row.author?.verified_expires_at ?? null,
    authorAvatar: seedAuthor?.avatar_url ?? row.author?.avatar_url ?? null,
    authorSchoolId: seedAuthor?.school_id ?? row.author?.school_id ?? row.school_id,
    schoolId: row.school_id,
    schoolName,
    schoolShort: row.school ? shortNameOf(schoolName) : row.school_id ? "SHS" : "Community",
    schoolCrest: row.school?.crest_url ?? null,
    groupId: null,
    groupName: null,
    groupEmoji: null,
    content: row.content,
    mediaUrls,
    mediaTypes,
    videoDurations: mediaItems.map((item) => item.video_duration_seconds ?? null),
    videoThumbnailUrl: mediaItems[0]?.video_thumbnail_url ?? row.video_thumbnail_url ?? null,
    videoThumbnailUrls: mediaItems.map((item) => item.video_thumbnail_url ?? null),
    mediaType: mediaTypes[0] ?? "image",
    status: "active",
    createdAt: row.created_at,
    spotlightStatus: null,
    spotlightExpiresAt: null,
    spotlightTargetSchoolIds: null,
    isPromoted: row.is_promoted === true &&
      row.promotion_status === "active" &&
      typeof row.promoted_until === "string" &&
      Date.parse(row.promoted_until) > Date.now(),
    promotedUntil: row.promoted_until ?? null,
    promotionStatus: row.is_promoted === true &&
      row.promotion_status === "active" &&
      typeof row.promoted_until === "string" &&
      Date.parse(row.promoted_until) > Date.now()
      ? "active"
      : "expired",
    likeCount: relationCount(row.likes) + (row.seed_likes_count ?? 0),
    seed_likes_count: row.seed_likes_count ?? 0,
    likedByMe: false,
    commentCount: relationCount(row.comments) + (row.seed_comments_count ?? 0),
    seed_comments_count: row.seed_comments_count ?? 0,
    viewCount: row.seed_views_count ?? 0,
    seed_views_count: row.seed_views_count ?? 0,
    shareCount: 0,
  };
}

type PublicPostMedia = {
  post_id: string;
  media_url: string;
  media_type?: "image" | "video" | null;
  video_duration_seconds?: number | null;
  video_thumbnail_url?: string | null;
  sort_order: number;
};

async function fetchPostMedia(ids: string[]): Promise<Map<string, PublicPostMedia[]>> {
  if (ids.length === 0) return new Map();
  const [mediaType, videoDuration, videoThumbnail] = await Promise.all([
    supportsPublicColumn("post_media", "media_type"),
    supportsPublicColumn("post_media", "video_duration_seconds"),
    supportsPublicColumn("post_media", "video_thumbnail_url"),
  ]);
  const columns = [
    "post_id",
    "media_url",
    ...(mediaType ? ["media_type"] : []),
    ...(videoDuration ? ["video_duration_seconds"] : []),
    ...(videoThumbnail ? ["video_thumbnail_url"] : []),
    "sort_order",
  ].join(", ");
  const { data, error } = await publicSupabase()
    .from("post_media")
    .select(columns)
    .in("post_id", ids)
    .order("sort_order", { ascending: true })
    .returns<Array<{
      post_id: string;
      media_url: string;
      media_type?: "image" | "video" | null;
      video_duration_seconds?: number | null;
      video_thumbnail_url?: string | null;
      sort_order: number;
    }>>();
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return new Map();
    if (error.code === "42703" || error.code === "PGRST204") {
      const fallback = await publicSupabase()
        .from("post_media")
        .select("post_id, media_url, sort_order")
        .in("post_id", ids)
        .order("sort_order", { ascending: true })
        .returns<Array<{ post_id: string; media_url: string; sort_order: number }>>();
      if (fallback.error) throw new Error(fallback.error.message);
      return groupMedia(fallback.data ?? []);
    }
    throw new Error(error.message);
  }
  return groupMedia(data ?? []);
}

function groupMedia<T extends {
  post_id: string;
  media_url: string;
  sort_order?: number;
  media_type?: "image" | "video" | null;
  video_duration_seconds?: number | null;
  video_thumbnail_url?: string | null;
}>(
  rows: T[]
): Map<string, PublicPostMedia[]> {
  const result = new Map<string, PublicPostMedia[]>();
  for (const row of rows) {
    const items = result.get(row.post_id) ?? [];
    items.push({
      post_id: row.post_id,
      media_url: row.media_url,
      media_type: row.media_type,
      video_duration_seconds: "video_duration_seconds" in row ? row.video_duration_seconds : null,
      video_thumbnail_url: "video_thumbnail_url" in row ? row.video_thumbnail_url : null,
      sort_order: row.sort_order ?? items.length,
    });
    result.set(row.post_id, items);
  }
  return result;
}

async function mapPublicConfessions(rows: PublicConfessionRow[]): Promise<Confession[]> {
  if (rows.length === 0) return [];
  const client = publicSupabase();
  const ids = rows.map((row) => row.id);
  const [comments, reactions] = await Promise.all([
    rows.every((row) => row.comment_count !== undefined)
      ? Promise.resolve({ data: [] as Array<{ confession_id: string }>, error: null })
      : client.from("confession_comments").select("confession_id").in("confession_id", ids)
          .returns<Array<{ confession_id: string }>>(),
    client.from("confession_reactions").select("confession_id, kind").in("confession_id", ids)
      .returns<Array<{ confession_id: string; kind: keyof ReturnType<typeof emptyReactions> }>>(),
  ]);
  if (comments.error && comments.error.code !== "42P01" && comments.error.code !== "PGRST205") {
    throw new Error(comments.error.message);
  }
  if (reactions.error && reactions.error.code !== "42P01" && reactions.error.code !== "PGRST205") {
    throw new Error(reactions.error.message);
  }
  const commentCounts = new Map<string, number>();
  for (const comment of comments.data ?? []) {
    commentCounts.set(comment.confession_id, (commentCounts.get(comment.confession_id) ?? 0) + 1);
  }
  const reactionCounts = new Map<string, ReturnType<typeof emptyReactions>>();
  for (const reaction of reactions.data ?? []) {
    const counts = reactionCounts.get(reaction.confession_id) ?? emptyReactions();
    counts[reaction.kind] += 1;
    reactionCounts.set(reaction.confession_id, counts);
  }
  return rows.map((row) => ({
    id: row.id,
    content: row.content,
    category: row.category,
    schoolId: row.school_id,
    moderationStatus: "approved",
    createdAt: row.created_at,
    publishedAt: row.published_at,
    reactions: reactionCounts.get(row.id) ?? emptyReactions(),
    myReaction: null,
    commentCount: row.comment_count ?? commentCounts.get(row.id) ?? 0,
    schoolName: row.school_name ?? null,
    schoolCrestUrl: row.school_crest_url ?? null,
    mediaUrls: row.media_urls ?? [],
    mediaTypes: row.media_types ?? [],
  }));
}

async function fetchPublicPostRows(options: {
  id?: string;
  ids?: string[];
  schoolId?: string;
  authorId?: string;
  limit: number;
}): Promise<PublicPostRow[]> {
  const client = publicSupabase();
  const withSeedAuthors = await supportsPublicSeedAuthors();
  const [hasMediaType, hasVideoDuration, hasVideoThumbnail, hasSeedLikes, hasSeedComments, hasSeedViews, hasPromotionFlag, hasPromotedUntil, hasPromotionStatus, hasPostMedia, hasPostMediaType, hasPostMediaDuration, hasPostMediaThumbnail] = await Promise.all([
    supportsPublicColumn("posts", "media_type"),
    supportsPublicColumn("posts", "video_duration_seconds"),
    supportsPublicColumn("posts", "video_thumbnail_url"),
    supportsPublicColumn("posts", "seed_likes_count"),
    supportsPublicColumn("posts", "seed_comments_count"),
    supportsPublicColumn("posts", "seed_views_count"),
    supportsPublicColumn("posts", "is_promoted"),
    supportsPublicColumn("posts", "promoted_until"),
    supportsPublicColumn("posts", "promotion_status"),
    supportsPublicPostMedia(),
    supportsPublicColumn("post_media", "media_type"),
    supportsPublicColumn("post_media", "video_duration_seconds"),
    supportsPublicColumn("post_media", "video_thumbnail_url"),
  ]);
  const select = (withMediaType: boolean, withProfileDetails: boolean, withPostMedia: boolean) =>
    `id, user_id, ${withSeedAuthors ? `seed_profile_id, seed_author:admin_seed_profiles!posts_seed_profile_id_fkey(id, username, full_name, avatar_url, school_id), ` : ""}school_id, content, media_url, ${withMediaType && hasMediaType ? "media_type, " : ""}${hasVideoDuration ? "video_duration_seconds, " : ""}${hasVideoThumbnail ? "video_thumbnail_url, " : ""}${hasSeedLikes ? "seed_likes_count, " : ""}${hasSeedComments ? "seed_comments_count, " : ""}${hasSeedViews ? "seed_views_count, " : ""}${hasPromotionFlag && hasPromotedUntil && hasPromotionStatus ? "is_promoted, promoted_until, promotion_status, " : ""}created_at, author:profiles(id, username, ${withProfileDetails ? "full_name, is_verified, verified_title, verified_expires_at, " : ""}avatar_url, school_id), school:schools(id, name, crest_url:logo_url), likes(count), comments(count)${withPostMedia && hasPostMedia ? `, media:post_media(post_id, media_url${withMediaType && hasPostMediaType ? ", media_type" : ""}${hasPostMediaDuration ? ", video_duration_seconds" : ""}${hasPostMediaThumbnail ? ", video_thumbnail_url" : ""}, sort_order)` : ""}`;
  const request = (withMediaType: boolean, withProfileDetails: boolean, withPostMedia: boolean) => {
    let query = client
    .from("posts")
    .select(select(withMediaType, withProfileDetails, withPostMedia))
    .eq("post_type", "public")
    .eq("status", "active")
    .eq("is_hidden", false)
    .order("created_at", { ascending: false })
    .limit(options.limit);

    if (options.id) query = query.eq("id", options.id);
    if (options.ids) query = query.in("id", options.ids);
    if (options.schoolId) query = query.eq("school_id", options.schoolId);
    if (options.authorId) query = query.eq("user_id", options.authorId);
    return query.returns<PublicPostRow[]>();
  };

  let data: PublicPostRow[] | null = null;
  let error: { code?: string; message: string } | null = null;
  let includesPostMedia = true;
  const variants = [
    [true, true, true],
    [false, true, true],
    [true, false, true],
    [false, false, true],
    [true, true, false],
    [false, true, false],
    [true, false, false],
    [false, false, false],
  ] as const;
  for (const [withMediaType, withProfileDetails, withPostMedia] of variants) {
    const result = await request(withMediaType, withProfileDetails, withPostMedia);
    data = result.data;
    error = result.error;
    if (!error) {
      includesPostMedia = withPostMedia && hasPostMedia;
      break;
    }
    if (!["42703", "PGRST204", "PGRST200", "PGRST201"].includes(error.code ?? "")) break;
  }
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  if (!includesPostMedia && rows.length > 0) {
    const mediaByPost = await fetchPostMedia(rows.map((row) => row.id));
    return rows.map((row) => ({ ...row, media: mediaByPost.get(row.id) ?? [] }));
  }
  return rows;
}

export async function fetchPublicPosts(options: {
  id?: string;
  ids?: string[];
  schoolId?: string;
  authorId?: string;
  limit?: number;
} = {}): Promise<Post[]> {
  const rows = await fetchPublicPostRows({ ...options, limit: options.limit ?? 30 });
  return rows.map((row) => mapPost(row));
}

export async function fetchPopularPublicPosts(limit = 8): Promise<Post[]> {
  return (await fetchPublicTrendingContent(Math.min(limit, 6))).trendingPosts;
}

export async function fetchPublicTrendingContent(limit = 20): Promise<{
  trendingPosts: Post[];
  trendingFallback: Post[];
}> {
  const threshold = 1000;
  const { data, error } = await publicSupabase()
    .from("post_like_counts")
    .select("post_id, likes_count")
    .gte("likes_count", threshold)
    .order("likes_count", { ascending: false })
    .limit(limit)
    .returns<Array<{ post_id: string; likes_count: number }>>();

  if (error && error.code !== "42P01" && error.code !== "PGRST205") {
    throw new Error(error.message);
  }

  const trendingPosts = error
    ? (await fetchPublicPosts({ limit: 15 }))
        .filter((post) => post.likeCount >= threshold)
        .sort((left, right) => right.likeCount - left.likeCount)
        .slice(0, limit)
    : await (async () => {
        const ids = (data ?? []).map((item) => item.post_id);
        if (ids.length === 0) return [];
        const posts = await fetchPublicPosts({ ids, limit: ids.length });
        const byId = new Map(posts.map((post) => [post.id, post]));
        return ids.flatMap((id) => {
          const post = byId.get(id);
          return post ? [post] : [];
        });
      })();
  const trendingIds = new Set(trendingPosts.map((post) => post.id));
  const trendingFallback = (await fetchPublicPosts({ limit: 15 }))
    .filter((post) => !trendingIds.has(post.id))
    .sort((left, right) => right.likeCount - left.likeCount)
    .slice(0, 4);

  return { trendingPosts, trendingFallback };
}

export async function fetchPublicPost(id: string): Promise<Post | null> {
  const posts = await fetchPublicPosts({ id, limit: 1 });
  return posts[0] ?? null;
}

export async function fetchPublicConfessions(limit = 15): Promise<Confession[]> {
  const client = publicSupabase();
  const select = "id, school_id, category, content, created_at, published_at, seed_username, seed_full_name, seed_avatar_url, is_seed, media_urls, media_types";
  let { data, error } = await client
    .from("public_confessions")
    .select(select)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(limit)
    .returns<PublicConfessionRow[]>();

  if (error && (error.code === "42703" || error.code === "PGRST204")) {
    const fallback = await client
      .from("public_confessions")
      .select("id, school_id, category, content, created_at, published_at")
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(limit)
      .returns<PublicConfessionRow[]>();
    data = fallback.data;
    error = fallback.error;
  }
  if (error) throw new Error(error.message);

  return mapPublicConfessions(data ?? []);
}

export async function fetchPublicConfession(id: string): Promise<Confession | null> {
  const client = publicSupabase();
  let { data, error } = await client
    .from("public_confessions")
    .select("id, school_id, category, content, created_at, published_at, seed_username, seed_full_name, seed_avatar_url, is_seed, media_urls, media_types")
    .eq("id", id)
    .maybeSingle<PublicConfessionRow>();
  if (error && (error.code === "42703" || error.code === "PGRST204")) {
    const fallback = await client
      .from("public_confessions")
      .select("id, school_id, category, content, created_at, published_at")
      .eq("id", id)
      .maybeSingle<PublicConfessionRow>();
    data = fallback.data;
    error = fallback.error;
  }
  if (error) throw new Error(error.message);
  if (!data) return null;
  const [confession] = await mapPublicConfessions([data]);
  return confession ?? null;
}

export async function fetchPublicProfileData(identifier: string): Promise<PublicProfile | null> {
  const client = publicSupabase();
  let cleanIdentifier = identifier.trim();
  try {
    cleanIdentifier = decodeURIComponent(cleanIdentifier).trim();
  } catch {
    // Keep malformed encoded slugs as entered.
  }
  if (!cleanIdentifier) return null;

  const identifierIsUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(cleanIdentifier);
  const escapeIlike = (value: string) => value.replace(/[\\%_]/g, "\\$&");
  const extendedColumns =
    "id, username, school_id, avatar_url, cover_url, bio, created_at, full_name, class_form, website, is_verified, verified_title, verified_expires_at";
  const baseColumns = "id, username, school_id, avatar_url, bio, created_at";
  type ProfileRecord = {
    id: string;
    username?: string | null;
    school_id?: string | null;
    avatar_url?: string | null;
    cover_url?: string | null;
    bio?: string | null;
    created_at?: string | null;
    full_name?: string | null;
    class_form?: string | null;
    website?: string | null;
    is_verified?: boolean | null;
    verified_title?: string | null;
    verified_expires_at?: string | null;
  };
  type SeedRecord = {
    id: string;
    username?: string | null;
    full_name?: string | null;
    avatar_url?: string | null;
    school_id?: string | null;
    created_at?: string | null;
  };

  const fetchProfile = async (column: "username" | "id", value: string) => {
    const run = (columns: string) => {
      let query = client.from("profiles").select(columns);
      query = column === "username"
        ? query.ilike("username", escapeIlike(value))
        : query.eq("id", value);
      return query.limit(1).maybeSingle<ProfileRecord>();
    };
    let result = await run(extendedColumns);
    if (result.error && (result.error.code === "42703" || result.error.code === "PGRST204")) {
      result = await run(baseColumns);
    }
    return result;
  };

  let profileResult = await fetchProfile("username", cleanIdentifier);
  if (profileResult.error) throw new Error(profileResult.error.message);
  if (!profileResult.data && identifierIsUuid) {
    profileResult = await fetchProfile("id", cleanIdentifier);
    if (profileResult.error) throw new Error(profileResult.error.message);
  }

  const loadSchool = async (schoolId: string | null | undefined) => {
    if (!schoolId) return null;
    const { data, error } = await client
      .from("schools")
      .select("name, logo_url")
      .eq("id", schoolId)
      .maybeSingle<{ name: string; logo_url?: string | null }>();
    if (error) {
      console.warn("Could not load the public profile's school details.", error);
      return null;
    }
    return data ?? null;
  };

  const toPublicProfile = async (row: ProfileRecord, isSeed = false, seedName?: string | null) => {
    const username = row.username?.trim() || "student";
    const school = await loadSchool(row.school_id);
    return {
      id: row.id,
      username,
      avatarUrl: row.avatar_url || defaultAvatarUrl(username),
      coverUrl: row.cover_url ?? null,
      bio: row.bio ?? "",
      fullName: row.full_name?.trim() || seedName?.trim() || username,
      classForm: row.class_form ?? null,
      website: row.website ?? null,
      isVerified: row.is_verified === true,
      verifiedTitle: row.verified_title ?? null,
      verifiedExpiresAt: row.verified_expires_at ?? null,
      schoolId: row.school_id ?? null,
      schoolName: school?.name ?? null,
      schoolShort: school?.name ? shortNameOf(school.name) : null,
      schoolCrest: school?.logo_url ?? null,
      createdAt: row.created_at || new Date(0).toISOString(),
      ...(isSeed ? { isSeed: true } : {}),
    } satisfies PublicProfile;
  };

  if (profileResult.data) return toPublicProfile(profileResult.data);

  const fetchSeed = async (column: "username" | "id", value: string) => {
    const run = (columns: string) => {
      let query = client.from("admin_seed_profiles").select(columns);
      query = column === "username"
        ? query.ilike("username", escapeIlike(value))
        : query.eq("id", value);
      return query.limit(1).maybeSingle<SeedRecord>();
    };
    let result = await run("id, username, full_name, avatar_url, school_id, created_at");
    if (result.error && (result.error.code === "42703" || result.error.code === "PGRST204")) {
      result = await run("id, username, school_id, created_at");
    }
    return result;
  };

  let seedResult = await fetchSeed("username", cleanIdentifier);
  if (seedResult.error && seedResult.error.code !== "42P01" && seedResult.error.code !== "PGRST205") {
    throw new Error(seedResult.error.message);
  }
  if (!seedResult.data && identifierIsUuid) {
    seedResult = await fetchSeed("id", cleanIdentifier);
    if (seedResult.error && seedResult.error.code !== "42P01" && seedResult.error.code !== "PGRST205") {
      throw new Error(seedResult.error.message);
    }
  }
  if (!seedResult.data) return null;
  return toPublicProfile(
    { ...seedResult.data, bio: "", cover_url: null },
    true,
    seedResult.data.full_name,
  );
}
