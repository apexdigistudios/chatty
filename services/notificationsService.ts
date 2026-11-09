import { shortNameOf } from "@/lib/media";
import {
  isNotificationRead,
} from "@/lib/notificationReads";
import { countOf, supabase } from "@/lib/supabase";
import type { Profile } from "@/types/models";
import { fetchInbox } from "@/services/shoutoutsService";
import { supportsPostVisibility } from "@/services/postsService";
import { trackEvent } from "@/lib/mixpanel";

/**
 * Real-Time Notification System (Step 12).
 *
 * There is no dedicated `notifications` table: the centre is a live projection
 * over `likes`, `comments`, `shoutouts`, `posts`, and safety notices, scoped to the signed-in
 * student, and kept fresh by Supabase Realtime INSERT events.
 */

export type NotificationCategory = "shoutouts" | "interactions" | "campus";
export type NotificationKind = "like" | "comment" | "shoutout" | "campus_post" | "safety";
export type NotificationSource = "likes" | "comments" | "shoutouts" | "posts" | "safety_notifications";

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  category: NotificationCategory;
  /** Who triggered it. Campus news and shoutouts always have an actor. */
  actorName: string;
  actorAvatar: string | null;
  actorSchoolShort: string | null;
  title: string;
  body: string;
  createdAt: string;
  postId?: string;
  schoolId?: string | null;
  shoutoutId?: string;
  /** Visually promoted (big like counts, fresh sealed letters). */
  highlight?: boolean;
  read: boolean;
}

const PER_SOURCE_LIMIT = 40;
const TOTAL_LIMIT = 80;
const NOTIFICATION_READS_TABLE = "notification_reads";

/* ───────────────────────── Verified PostgREST selects ───────────────────── */

const LIKES_SELECT = `id, created_at, user_id,
  liker:profiles(id, username, avatar_url, school:schools!school_id(name)),
  post:posts!inner(id, user_id, content, media_url, school_id, school:schools(name, crest_url:logo_url))`;

const COMMENTS_SELECT = `id, content, created_at,
  post:posts!inner(id, user_id, content, school_id, school:schools(name, crest_url:logo_url)),
  author:profiles(id, username, avatar_url, school:schools!school_id(name))`;

const CAMPUS_SELECT = `id, content, media_url, created_at, user_id,
  school:schools(name, crest_url:logo_url), author:profiles(username, avatar_url),
  likes(count), comments(count)`;

interface RawLike {
  id: string;
  created_at: string;
  user_id: string;
  liker: {
    id: string;
    username: string;
    avatar_url: string | null;
    school: { name: string } | null;
  } | null;
  post: {
    id: string;
    user_id: string;
    content: string;
    media_url: string | null;
    school_id: string | null;
    school: { name: string } | null;
  } | null;
}

interface RawComment {
  id: string;
  content: string;
  created_at: string;
  post: {
    id: string;
    user_id: string;
    content: string;
    school_id: string | null;
    school: { name: string } | null;
  } | null;
  author: {
    id: string;
    username: string;
    avatar_url: string | null;
    school: { name: string } | null;
  } | null;
}

interface RawCampusPost {
  id: string;
  content: string;
  media_url: string | null;
  created_at: string;
  user_id: string;
  school: { name: string } | null;
  author: { username: string; avatar_url: string | null } | null;
  likes: { count: number }[];
  comments: { count: number }[];
}

interface RawSafetyNotification {
  id: string;
  post_id: string | null;
  title: string;
  body: string;
  created_at: string;
}

/* ───────────────────────────── Helpers ───────────────────────────── */

function excerpt(text: string, max = 92): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

/**
 * Runs a query using a PostgREST embedded filter (`post.user_id=eq.…`).
 * Falls back to fetching and filtering locally if the server rejects the syntax.
 */
async function queryMine<T>(
  build: (filtered: boolean) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  keep: (row: T) => boolean
): Promise<T[]> {
  const filtered = await build(true);
  if (!filtered.error) return filtered.data ?? [];
  const unfiltered = await build(false);
  if (unfiltered.error) throw new Error(unfiltered.error.message);
  return (unfiltered.data ?? []).filter(keep);
}

/** Never let one noisy source break the whole notification centre. */
async function safe<T>(promise: Promise<T[]>, fallback: T[] = []): Promise<T[]> {
  try {
    return await promise;
  } catch {
    return fallback;
  }
}

/* ───────────────────────── Source builders ───────────────────────── */

async function fetchLikeNotifications(userId: string): Promise<AppNotification[]> {
  const rows = await queryMine<RawLike>(
    (filtered) => {
      let request = supabase
        .from("likes")
        .select(LIKES_SELECT)
        .order("created_at", { ascending: false })
        .limit(PER_SOURCE_LIMIT);
      if (filtered) request = request.eq("post.user_id", userId);
      return request.returns<RawLike[]>();
    },
    (row) => row.post?.user_id === userId
  );

  // Group every like by post so one viral gist cannot flood the drawer.
  const grouped = new Map<
    string,
    { post: NonNullable<RawLike["post"]>; actors: Array<{ name: string; avatar: string | null; school: string | null }>; newest: string; sampleId: string }
  >();

  for (const row of rows) {
    const post = row.post;
    const liker = row.liker;
    if (!post || !liker) continue;
    if (liker.id === userId || post.user_id !== userId) continue; // ignore self-likes

    const existing = grouped.get(post.id);
    const actor = {
      name: liker.username,
      avatar: liker.avatar_url,
      school: liker.school ? shortNameOf(liker.school.name) : null,
    };
    if (existing) {
      if (!existing.actors.some((item) => item.name === actor.name)) existing.actors.push(actor);
      if (row.created_at > existing.newest) {
        existing.newest = row.created_at;
        existing.sampleId = row.id;
      }
      continue;
    }
    grouped.set(post.id, { post, actors: [actor], newest: row.created_at, sampleId: row.id });
  }

  return Array.from(grouped.values()).map(({ post, actors, newest, sampleId }) => {
    const [first, ...rest] = actors;
    const title =
      rest.length === 0
        ? `${first!.name} liked your gist`
        : `${first!.name} and ${rest.length} other${rest.length === 1 ? "" : "s"} liked your gist`;
    return {
      id: `like:${sampleId}`,
      kind: "like" as const,
      category: "interactions" as const,
      actorName: first!.name,
      actorAvatar: first!.avatar,
      actorSchoolShort: first!.school,
      title,
      body: excerpt(post.content),
      createdAt: newest,
      postId: post.id,
      schoolId: post.school_id,
      highlight: actors.length >= 5,
      read: false,
    };
  });
}

async function fetchCommentNotifications(userId: string): Promise<AppNotification[]> {
  const rows = await queryMine<RawComment>(
    (filtered) => {
      let request = supabase
        .from("comments")
        .select(COMMENTS_SELECT)
        .order("created_at", { ascending: false })
        .limit(PER_SOURCE_LIMIT);
      if (filtered) request = request.eq("post.user_id", userId);
      return request.returns<RawComment[]>();
    },
    (row) => row.post?.user_id === userId
  );

  return rows
    .filter((row) => row.post && row.author && row.post.user_id !== row.author.id)
    .map((row) => ({
      id: `comment:${row.id}`,
      kind: "comment" as const,
      category: "interactions" as const,
      actorName: row.author?.username ?? "A student",
      actorAvatar: row.author?.avatar_url ?? null,
      actorSchoolShort: row.author?.school ? shortNameOf(row.author.school.name) : null,
      title: `${row.author?.username ?? "A student"} replied to your gist`,
      body: excerpt(row.content ?? ""),
      createdAt: row.created_at,
      postId: row.post?.id,
      schoolId: row.post?.school_id ?? null,
      read: false,
    }));
}

async function fetchShoutoutNotifications(profile: Profile): Promise<AppNotification[]> {
  const letters = await fetchInbox(profile);
  return letters.slice(0, PER_SOURCE_LIMIT).map((letter) => ({
    id: `shoutout:${letter.id}`,
    kind: "shoutout" as const,
    category: "shoutouts" as const,
    actorName: letter.senderName || "A student",
    actorAvatar: null,
    actorSchoolShort: null,
    title: letter.openedAt
      ? `Letter from ${letter.senderName}`
      : `A sealed paper plane from ${letter.senderName}`,
    body: excerpt(letter.message),
    createdAt: letter.createdAt,
    shoutoutId: letter.id,
    highlight: !letter.openedAt,
    read: false,
  }));
}

async function fetchCampusNews(profile: Profile): Promise<AppNotification[]> {
  if (!profile.schoolId) return [];
  let request = supabase
    .from("posts")
    .select(CAMPUS_SELECT)
    .eq("school_id", profile.schoolId)
    .eq("status", "active")
    .eq("post_type", "public")
    .neq("user_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(PER_SOURCE_LIMIT);
  if (await supportsPostVisibility()) request = request.eq("is_hidden", false);
  const { data, error } = await request.returns<RawCampusPost[]>();
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const likes = countOf(row.likes);
    return {
      id: `campus:${row.id}`,
      kind: "campus_post" as const,
      category: "campus" as const,
      actorName: row.author?.username ?? "A student",
      actorAvatar: row.author?.avatar_url ?? null,
      actorSchoolShort: row.school ? shortNameOf(row.school.name) : null,
      title: `${row.author?.username ?? "A student"} posted in ${row.school ? shortNameOf(row.school.name) : "your SHS"}`,
      body: excerpt(row.content),
      createdAt: row.created_at,
      postId: row.id,
      schoolId: profile.schoolId,
      highlight: likes >= 25 || Boolean(row.media_url),
      read: false,
    };
  });
}

async function fetchSafetyNotifications(profile: Profile): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from("safety_notifications")
    .select("id, post_id, title, body, created_at")
    .eq("recipient_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(PER_SOURCE_LIMIT)
    .returns<RawSafetyNotification[]>();
  if (error && (error.code === "42P01" || error.code === "PGRST205")) return [];
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: `safety:${row.id}`,
    kind: "safety",
    category: "campus",
    actorName: "Gist me Safety",
    actorAvatar: null,
    actorSchoolShort: null,
    title: row.title,
    body: row.body,
    createdAt: row.created_at,
    postId: row.post_id ?? undefined,
    highlight: true,
    read: false,
  }));
}

/* ───────────────────────── Public API ───────────────────────── */

/** Builds the full notification feed for one student, newest first. */
export async function fetchNotifications(profile: Profile | null): Promise<AppNotification[]> {
  if (!profile) return [];

  const [likes, comments, shoutouts, campus, safety] = await Promise.all([
    safe(fetchLikeNotifications(profile.id)),
    safe(fetchCommentNotifications(profile.id)),
    safe(fetchShoutoutNotifications(profile)),
    safe(fetchCampusNews(profile)),
    fetchSafetyNotifications(profile),
  ]);

  const merged = [...shoutouts, ...comments, ...likes, ...campus, ...safety]
    .filter((item, index, all) => all.findIndex((other) => other.id === item.id) === index)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, TOTAL_LIMIT);
  const locallyReadIds = merged
    .filter((item) => isNotificationRead(item.id))
    .map((item) => item.id);
  if (locallyReadIds.length > 0) {
    await persistNotificationReads(profile.id, locallyReadIds);
  }
  const persistedReadIds = merged.length > 0
    ? await fetchPersistedReadNotificationIds(profile.id, merged.map((item) => item.id))
    : new Set<string>();

  return merged.map((item) => ({
    ...item,
    read: isNotificationRead(item.id) || persistedReadIds.has(item.id),
  }));
}

export async function fetchPersistedReadNotificationIds(
  userId: string,
  notificationIds: string[]
): Promise<Set<string>> {
  if (notificationIds.length === 0) return new Set();
  const { data, error } = await supabase
    .from(NOTIFICATION_READS_TABLE)
    .select("notification_id")
    .eq("user_id", userId)
    .in("notification_id", [...new Set(notificationIds)])
    .returns<Array<{ notification_id: string }>>();
  if (error) throw new Error(`Could not load notification read states: ${error.message}`);
  return new Set((data ?? []).map((row) => row.notification_id));
}

export async function persistNotificationReads(userId: string, notificationIds: string[]): Promise<void> {
  const uniqueIds = [...new Set(notificationIds)];
  if (uniqueIds.length === 0) return;
  const { error } = await supabase.from(NOTIFICATION_READS_TABLE).upsert(
    uniqueIds.map((notificationId) => ({ user_id: userId, notification_id: notificationId })),
    { onConflict: "user_id,notification_id" }
  );
  if (error) throw new Error(`Could not save notification read states: ${error.message}`);
}

/* ───────────────────────── Realtime ───────────────────────── */

/**
 * Subscribes to INSERTs on notification source tables. Supabase Realtime applies
 * RLS, so only rows this student may read are delivered.
 *
 * @returns a cleanup function that removes the channel.
 */
export interface RealtimeOptions {
  /** When set, campus-news events are filtered server-side to this school only. */
  schoolId?: string | null;
}

export function subscribeToNotificationEvents(
  channelKey: string,
  onEvent: (source: NotificationSource, notificationId: string) => void,
  options: RealtimeOptions = {}
): () => void {
  const sources: NotificationSource[] = ["likes", "comments", "shoutouts", "posts", "safety_notifications"];
  let channel = supabase.channel(`notifications-${channelKey}`);

  for (const source of sources) {
    const payload: {
      event: "INSERT";
      schema: "public";
      table: NotificationSource;
      filter?: string;
    } = { event: "INSERT", schema: "public", table: source };

    // Only our own campus can produce Campus News, so let Postgres do that filtering.
    if (source === "posts" && options.schoolId) {
      payload.filter = `school_id=eq.${options.schoolId}`;
    }
    channel = channel.on("postgres_changes", payload, (event) => {
      const notificationId = typeof event.new?.id === "string" ? event.new.id : "";
      const notificationType: Record<NotificationSource, string> = {
        likes: "new_like",
        comments: "new_comment",
        shoutouts: "shoutout",
        posts: "campus_news",
        safety_notifications: "safety_notice",
      };
      if (notificationId) {
        trackEvent("notification_received", {
          notification_type: notificationType[source],
          notification_campaign_id: null,
          notification_id: notificationId,
          timestamp_source: new Date().toISOString(),
        });
      }
      onEvent(source, notificationId);
    });
  }

  channel.subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

export const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  shoutouts: "Shoutouts",
  interactions: "Interactions",
  campus: "Campus News",
};

export function unreadCount(items: AppNotification[]): number {
  return items.filter((item) => !item.read).length;
}

export function categoryCounts(
  items: AppNotification[]
): Record<NotificationCategory, { total: number; unread: number }> {
  const base = { shoutouts: { total: 0, unread: 0 }, interactions: { total: 0, unread: 0 }, campus: { total: 0, unread: 0 } };
  for (const item of items) {
    base[item.category].total += 1;
    if (!item.read) base[item.category].unread += 1;
  }
  return base;
}
