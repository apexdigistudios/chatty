import { createClient } from "@supabase/supabase-js";
import { shortNameOf } from "@/lib/media";
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
  media_urls?: string[] | null;
  media_types?: Array<"image" | "video"> | null;
};

type PublicProfileRow = {
  id: string;
  username: string;
  school_id: string | null;
  avatar_url: string | null;
  cover_url?: string | null;
  bio: string | null;
  created_at: string;
  full_name?: string | null;
  class_form?: string | null;
  website?: string | null;
  is_verified?: boolean | null;
  verified_title?: string | null;
  verified_expires_at?: string | null;
  school: { name: string; crest_url: string | null } | null;
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

function mapPost(row: PublicPostRow, media?: Array<{ media_url: string; media_type?: "image" | "video" | null }>): Post {
  const mediaItems = media?.length
    ? media
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
    videoDurations: mediaItems.map(() => null),
    mediaType: mediaTypes[0] ?? "image",
    status: "active",
    createdAt: row.created_at,
    spotlightStatus: null,
    spotlightExpiresAt: null,
    spotlightTargetSchoolIds: null,
    likeCount: relationCount(row.likes),
    likedByMe: false,
    commentCount: relationCount(row.comments),
    viewCount: 0,
    shareCount: 0,
  };
}

async function fetchPostMedia(ids: string[]) {
  if (ids.length === 0) return new Map<string, Array<{ media_url: string; media_type?: "image" | "video" | null }>>();
  const { data, error } = await publicSupabase()
    .from("post_media")
    .select("post_id, media_url, media_type, sort_order")
    .in("post_id", ids)
    .order("sort_order", { ascending: true })
    .returns<Array<{ post_id: string; media_url: string; media_type?: "image" | "video" | null }>>();
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return new Map();
    if (error.code === "42703" || error.code === "PGRST204") {
      const fallback = await publicSupabase()
        .from("post_media")
        .select("post_id, media_url, sort_order")
        .in("post_id", ids)
        .order("sort_order", { ascending: true })
        .returns<Array<{ post_id: string; media_url: string }>>();
      if (fallback.error) throw new Error(fallback.error.message);
      return groupMedia(fallback.data ?? []);
    }
    throw new Error(error.message);
  }
  return groupMedia(data ?? []);
}

function groupMedia<T extends { post_id: string; media_url: string; media_type?: "image" | "video" | null }>(
  rows: T[]
): Map<string, Array<{ media_url: string; media_type?: "image" | "video" | null }>> {
  const result = new Map<string, Array<{ media_url: string; media_type?: "image" | "video" | null }>>();
  for (const row of rows) {
    const items = result.get(row.post_id) ?? [];
    items.push({ media_url: row.media_url, media_type: row.media_type });
    result.set(row.post_id, items);
  }
  return result;
}

async function mapPublicConfessions(rows: PublicConfessionRow[]): Promise<Confession[]> {
  if (rows.length === 0) return [];
  const client = publicSupabase();
  const ids = rows.map((row) => row.id);
  const [comments, reactions] = await Promise.all([
    client.from("confession_comments").select("confession_id").in("confession_id", ids)
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
    commentCount: commentCounts.get(row.id) ?? 0,
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
  const select = (withMediaType: boolean, withProfileDetails: boolean) =>
    `id, user_id, ${withSeedAuthors ? `seed_profile_id, seed_author:admin_seed_profiles!posts_seed_profile_id_fkey(id, username, full_name, avatar_url, school_id), ` : ""}school_id, content, media_url, ${withMediaType ? "media_type, " : ""}created_at, author:profiles(id, username, ${withProfileDetails ? "full_name, is_verified, verified_title, verified_expires_at, " : ""}avatar_url, school_id), school:schools(id, name, crest_url:logo_url), likes(count), comments(count)`;
  const request = (withMediaType: boolean, withProfileDetails: boolean) => {
    let query = client
    .from("posts")
    .select(select(withMediaType, withProfileDetails))
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
  for (const [withMediaType, withProfileDetails] of [[true, true], [false, true], [true, false], [false, false]]) {
    const result = await request(withMediaType, withProfileDetails);
    data = result.data;
    error = result.error;
    if (!error) break;
    if (error.code !== "42703" && error.code !== "PGRST204") break;
  }
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchPublicPosts(options: {
  id?: string;
  ids?: string[];
  schoolId?: string;
  authorId?: string;
  limit?: number;
} = {}): Promise<Post[]> {
  const rows = await fetchPublicPostRows({ ...options, limit: options.limit ?? 30 });
  const mediaByPost = await fetchPostMedia(rows.map((row) => row.id));
  return rows.map((row) => mapPost(row, mediaByPost.get(row.id)));
}

export async function fetchPopularPublicPosts(limit = 8): Promise<Post[]> {
  const { data, error } = await publicSupabase()
    .from("post_like_counts")
    .select("post_id, likes_count")
    .gt("likes_count", 100)
    .order("likes_count", { ascending: false })
    .limit(limit)
    .returns<Array<{ post_id: string; likes_count: number }>>();
  if (error && error.code !== "42P01" && error.code !== "PGRST205") throw new Error(error.message);
  if (error) {
    return (await fetchPublicPosts({ limit: 100 }))
      .filter((post) => post.likeCount > 100)
      .sort((left, right) => right.likeCount - left.likeCount)
      .slice(0, limit);
  }
  const popular = data ?? [];
  if (popular.length === 0) return [];
  const ids = popular.map((item) => item.post_id);
  const rows = await fetchPublicPostRows({ ids, limit: ids.length });
  const mediaByPost = await fetchPostMedia(rows.map((row) => row.id));
  const postsById = new Map(rows.map((row) => [row.id, mapPost(row, mediaByPost.get(row.id))]));
  return ids.flatMap((id) => {
    const post = postsById.get(id);
    return post ? [post] : [];
  });
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
    ? (await fetchPublicPosts({ limit: 100 }))
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
  const trendingFallback = (await fetchPublicPosts({ limit: 100 }))
    .filter((post) => !trendingIds.has(post.id))
    .sort((left, right) => right.likeCount - left.likeCount)
    .slice(0, 4);

  return { trendingPosts, trendingFallback };
}

export async function fetchPublicPost(id: string): Promise<Post | null> {
  const posts = await fetchPublicPosts({ id, limit: 1 });
  return posts[0] ?? null;
}

export async function fetchPublicConfessions(limit = 40): Promise<Confession[]> {
  const client = publicSupabase();
  const select = "id, school_id, category, content, created_at, published_at, media_urls, media_types";
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
    .select("id, school_id, category, content, created_at, published_at, media_urls, media_types")
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

export async function fetchPublicProfileData(userId: string): Promise<PublicProfile | null> {
  const client = publicSupabase();
  const select =
    "id, username, school_id, avatar_url, cover_url, bio, created_at, full_name, class_form, website, is_verified, verified_title, verified_expires_at, school:schools!school_id(name, crest_url:logo_url)";
  let { data, error } = await client
    .from("profiles")
    .select(select)
    .eq("id", userId)
    .maybeSingle<PublicProfileRow>();

  if (error && (error.code === "42703" || error.code === "PGRST204")) {
    const fallback = await client
      .from("profiles")
      .select("id, username, school_id, avatar_url, cover_url, bio, created_at, school:schools!school_id(name, crest_url:logo_url)")
      .eq("id", userId)
      .maybeSingle<PublicProfileRow>();
    data = fallback.data;
    error = fallback.error;
  }
  if (error) throw new Error(error.message);
  if (!data) return null;

  return {
    id: data.id,
    username: data.username,
    avatarUrl: data.avatar_url,
    coverUrl: data.cover_url ?? null,
    bio: data.bio ?? "",
    fullName: data.full_name ?? null,
    classForm: data.class_form ?? null,
    website: data.website ?? null,
    isVerified: data.is_verified ?? false,
    verifiedTitle: data.verified_title ?? null,
    verifiedExpiresAt: data.verified_expires_at ?? null,
    schoolId: data.school_id,
    schoolName: data.school?.name ?? null,
    schoolShort: data.school ? shortNameOf(data.school.name) : null,
    schoolCrest: data.school?.crest_url ?? null,
    createdAt: data.created_at,
  };
}
