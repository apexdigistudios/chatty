import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { deleteFromR2 } from "@/lib/r2";
import { CLOUDFLARE_MEDIA_ORIGIN } from "@/lib/mediaUrl";
import {
  CommunitySafetyViolationError,
  moderatePostCaption,
  ModerationUnavailableError,
} from "@/lib/moderation";
import { isUserGlobalAdmin } from "@/lib/adminAccess";

export const runtime = "nodejs";

interface SubmittedMedia {
  url: string;
  mediaType: "image" | "video";
  duration: number | null;
}

class PostRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "PostRequestError";
  }
}

function errorResponse(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

function readMediaKey(value: unknown, userId: string): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.origin !== CLOUDFLARE_MEDIA_ORIGIN || url.search || url.hash) return null;
    const key = url.pathname.slice(1).split("/").map(decodeURIComponent).join("/");
    const parts = key.split("/");
    if (
      parts.length < 5 ||
      parts[0] !== "posts" ||
      !/^\d+-[0-9a-f-]{36}$/i.test(parts[1] ?? "") ||
      parts[2] !== userId ||
      parts[3] !== "posts" ||
      parts.some((part) => !part || part === "." || part === "..")
    ) {
      return null;
    }
    return key;
  } catch {
    return null;
  }
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function columnExists(
  client: SupabaseClient,
  table: "posts" | "post_media",
  column: string
): Promise<boolean> {
  const { error } = await client.from(table).select(column).limit(1);
  if (error && (error.code === "42703" || error.code === "PGRST204")) return false;
  if (error && (error.code === "42P01" || error.code === "PGRST205")) return false;
  if (error) throw new Error(error.message);
  return true;
}

async function removeStagedMedia(keys: string[]): Promise<void> {
  const results = await Promise.allSettled(keys.map((key) => deleteFromR2(key)));
  for (const result of results) {
    if (result.status === "rejected") {
      console.error("Could not remove staged media after a rejected gist.", result.reason);
    }
  }
}

export async function POST(request: Request): Promise<Response> {
  const accessToken = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!accessToken) return errorResponse("Please sign in to continue.", 401);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error("Supabase server-side post creation is not configured.");
    return errorResponse("Post publishing is not available right now.", 500);
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data: authData, error: authError } = await authClient.auth.getUser(accessToken);
  if (authError || !authData.user) return errorResponse("Please sign in to continue.", 401);

  const user = authData.user;
  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let mediaKeys: string[] = [];
  let createdPostId: string | null = null;
  try {
    const body: unknown = await request.json();
    if (
      typeof body !== "object" ||
      body === null ||
      !("content" in body) ||
      typeof body.content !== "string" ||
      body.content.trim().length > 300 ||
      !("schoolId" in body) ||
      (body.schoolId !== null && !isUuid(body.schoolId)) ||
      !("groupId" in body) ||
      (body.groupId !== null && !isUuid(body.groupId)) ||
      !("media" in body) ||
      !Array.isArray(body.media) ||
      body.media.length > 8
    ) {
      return errorResponse("Your gist details are invalid.", 400);
    }

    const content = body.content.trim();
    const media: SubmittedMedia[] = [];
    for (const item of body.media) {
      if (
        typeof item !== "object" ||
        item === null ||
        !("url" in item) ||
        !("mediaType" in item) ||
        (item.mediaType !== "image" && item.mediaType !== "video") ||
        !("duration" in item) ||
        (item.duration !== null &&
          (typeof item.duration !== "number" || !Number.isFinite(item.duration)))
      ) {
        throw new PostRequestError("One of the uploaded files is invalid.", 400);
      }
      const key = readMediaKey(item.url, user.id);
      if (!key) throw new PostRequestError("One of the uploaded files is not yours.", 403);
      mediaKeys.push(key);
      media.push({
        url: item.url as string,
        mediaType: item.mediaType,
        duration: item.duration as number | null,
      });
    }

    if (!content && media.length === 0) {
      throw new PostRequestError("Please add text, an image, or a video to publish.", 400);
    }
    const imageCount = media.filter((item) => item.mediaType === "image").length;
    const videoCount = media.length - imageCount;
    if (imageCount > 5 || videoCount > 3) {
      throw new PostRequestError("A gist can include up to 5 images and 3 videos.", 400);
    }

    await moderatePostCaption(content, user.id);

    let globalAdmin = isUserGlobalAdmin(user.email);
    if (!globalAdmin) {
      const { data, error } = await authClient.rpc("is_global_admin", {});
      if (error) throw new Error("Could not verify admin permissions.");
      globalAdmin = data === true;
    }
    if (!body.schoolId && !globalAdmin) {
      throw new PostRequestError("Choose your school in your profile before publishing a gist.", 400);
    }

    const [groupsAvailable, postMediaAvailable, mediaTypeAvailable, durationAvailable] =
      await Promise.all([
        columnExists(serviceClient, "posts", "group_id"),
        serviceClient.from("post_media").select("id").limit(1).then(({ error }) => {
          if (error && (error.code === "42P01" || error.code === "PGRST205")) return false;
          if (error) throw new Error(error.message);
          return true;
        }),
        columnExists(serviceClient, "posts", "media_type"),
        columnExists(serviceClient, "posts", "video_duration_seconds"),
      ]);

    if (media.length > 1 && !postMediaAvailable) {
      throw new PostRequestError("Multiple attachments need the post media database migration.", 400);
    }

    let groupId: string | null = null;
    if (body.groupId && groupsAvailable) {
      const { data, error } = await serviceClient
        .from("school_groups")
        .select("id")
        .eq("id", body.groupId)
        .eq("school_id", body.schoolId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new PostRequestError("Choose a group from your school.", 400);
      groupId = body.groupId;
    }

    const firstMedia = media[0] ?? null;
    const post: Record<string, unknown> = {
      user_id: user.id,
      school_id: body.schoolId,
      content,
      media_url: firstMedia?.url ?? null,
      post_type: "public",
      status: "active",
      ...(groupsAvailable && groupId ? { group_id: groupId } : {}),
    };
    if (firstMedia && mediaTypeAvailable) {
      post.media_type = firstMedia.mediaType;
      if (firstMedia.mediaType === "video" && durationAvailable) {
        post.video_duration_seconds =
          firstMedia.duration === null ? null : Math.max(0, Math.round(firstMedia.duration));
      }
    }

    const { data: created, error: createError } = await serviceClient
      .from("posts")
      .insert(post)
      .select("id")
      .single<{ id: string }>();
    if (createError) throw new Error(createError.message);
    createdPostId = created.id;

    if (media.length > 0 && postMediaAvailable) {
      const [postMediaTypeAvailable, postMediaDurationAvailable] = await Promise.all([
        columnExists(serviceClient, "post_media", "media_type"),
        columnExists(serviceClient, "post_media", "video_duration_seconds"),
      ]);
      const rows = media.map((item, index) => ({
        post_id: created.id,
        media_url: item.url,
        ...(postMediaTypeAvailable ? { media_type: item.mediaType } : {}),
        ...(postMediaDurationAvailable
          ? {
              video_duration_seconds:
                item.mediaType === "video" && item.duration !== null
                  ? Math.max(0, Math.round(item.duration))
                  : null,
            }
          : {}),
        sort_order: index,
      }));
      const { error: mediaError } = await serviceClient.from("post_media").insert(rows);
      if (mediaError) throw new Error(mediaError.message);
    }

    return Response.json({ id: created.id });
  } catch (error) {
    if (mediaKeys.length > 0) await removeStagedMedia(mediaKeys);
    if (createdPostId) {
      const { error: rollbackError } = await serviceClient.from("posts").delete().eq("id", createdPostId);
      if (rollbackError) console.error("Could not remove a partially-created gist.", rollbackError);
    }
    if (error instanceof PostRequestError) return errorResponse(error.message, error.status);
    if (error instanceof CommunitySafetyViolationError) {
      return errorResponse(error.message, 422);
    }
    if (error instanceof ModerationUnavailableError) {
      return errorResponse(error.message, 503);
    }
    console.error("Gist creation failed.", error);
    return errorResponse("We couldn't publish your gist. Please try again.", 500);
  }
}
