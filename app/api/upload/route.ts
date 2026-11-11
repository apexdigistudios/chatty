import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { deleteFromR2, uploadToR2 } from "@/lib/r2";
import { moderateUploadedMedia } from "@/lib/moderation";
import type { R2UploadFolder } from "@/lib/r2Upload";
import { cleanupProcessedVideo, processVideo } from "@/lib/videoProcessor";

export const runtime = "nodejs";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);
const VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime", "video/ogg"]);
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_VIDEO_BYTES = 80 * 1024 * 1024;
const VALID_FOLDERS = new Set<R2UploadFolder>(["posts", "seed-posts", "avatars", "covers", "crests", "highlights"]);

function errorResponse(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

async function authorize(request: Request) {
  const accessToken = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!accessToken) return { response: errorResponse("Please sign in to continue.", 401) };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    console.error("Supabase authentication is not configured for R2 uploads.");
    return { response: errorResponse("Uploads are not available right now.", 503) };
  }

  const client = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data, error } = await client.auth.getUser(accessToken);
  if (error || !data.user) return { response: errorResponse("Please sign in to continue.", 401) };
  return { client, user: data.user };
}

async function isGlobalAdmin(client: SupabaseClient<any>): Promise<boolean> {
  const { data, error } = await client.rpc("is_global_admin");
  if (error) throw new Error(`Could not verify administrator permissions: ${error.message}`);
  return data === true;
}

function isValidR2Key(key: unknown): key is string {
  return typeof key === "string" &&
    /^seed-posts\/\d+-[0-9a-f-]{36}\/[0-9a-f-]{36}\/seed-posts\/[a-zA-Z0-9._-]+$/i.test(key);
}

export async function POST(request: Request): Promise<Response> {
  let processedVideo: Awaited<ReturnType<typeof processVideo>> | null = null;
  const uploadedUrls: string[] = [];
  try {
    const auth = await authorize(request);
    if (auth.response) return auth.response;

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (error) {
      console.warn("Could not parse upload form data.", error);
      return errorResponse("The upload request is invalid or incomplete.", 400);
    }
    const file = formData.get("file");
    const folder = formData.get("folder");
    const contentType = formData.get("contentType");
    if (!(file instanceof File) || typeof folder !== "string" || !VALID_FOLDERS.has(folder as R2UploadFolder)) {
      return errorResponse("Choose a valid file and upload folder.", 400);
    }

    if (folder === "seed-posts" && !(await isGlobalAdmin(auth.client))) {
      return errorResponse("You are not authorized to upload seed media.", 403);
    }
    if (folder === "crests") {
      const schoolId = formData.get("resourceId");
      if (typeof schoolId !== "string" || !/^[0-9a-f-]{36}$/i.test(schoolId)) {
        return errorResponse("A valid school is required for a crest upload.", 400);
      }
      const { data: isModerator, error } = await auth.client.rpc("is_school_moderator", {
        target_school: schoolId,
        uid: auth.user.id,
      });
      if (error) throw new Error(`Could not verify school permissions: ${error.message}`);
      if (isModerator !== true) return errorResponse("You are not authorized to update this school crest.", 403);
    }
    if (folder === "highlights") {
      const schoolId = formData.get("resourceId");
      if (typeof schoolId !== "string" || !/^[0-9a-f-]{36}$/i.test(schoolId)) {
        return errorResponse("A valid school is required for a highlight.", 400);
      }
      const { data: membership, error } = await auth.client
        .from("profiles")
        .select("school_id")
        .eq("id", auth.user.id)
        .maybeSingle();
      if (error) throw new Error(`Could not verify school membership: ${error.message}`);
      if (membership?.school_id !== schoolId) {
        return errorResponse("Join this school before sharing a highlight.", 403);
      }
    }

    if (typeof contentType !== "string" || (!IMAGE_TYPES.has(contentType) && !VIDEO_TYPES.has(contentType))) {
      return errorResponse("This file type is not supported.", 400);
    }
    const isVideo = VIDEO_TYPES.has(contentType);
    const maxBytes = isVideo
      ? folder === "highlights" ? 30 * 1024 * 1024 : MAX_VIDEO_BYTES
      : MAX_IMAGE_BYTES;
    if (file.size === 0 || file.size > maxBytes) {
      return errorResponse(
        isVideo
          ? folder === "highlights" ? "Highlight videos must be 30MB or smaller." : "Videos must be 80MB or smaller."
          : "Images must be 20MB or smaller.",
        400
      );
    }
    if (folder !== "posts" && folder !== "seed-posts" && folder !== "highlights" && isVideo) {
      return errorResponse("Video uploads are only supported for posts.", 400);
    }

    const name = file.name.split(/[\\/]/).pop()?.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100);
    if (!name) return errorResponse("The file name is invalid.", 400);
    const moderationText = formData.get("moderationText");
    if (moderationText !== null && typeof moderationText !== "string") {
      return errorResponse("The caption is invalid.", 400);
    }
    if (isVideo) {
      try {
        processedVideo = await processVideo(file);
      } catch (error) {
        console.warn("Video processing failed; continuing with the original upload.", error);
        if (folder === "highlights") {
          return errorResponse("We couldn't check this video's length. Please try another video.", 422);
        }
      }
      if (folder === "highlights" && processedVideo && processedVideo.durationSeconds > 15) {
        return errorResponse("Highlight videos must be 15 seconds or shorter.", 400);
      }
    }

    try {
      await moderateUploadedMedia(file, auth.user.id, moderationText ?? "", processedVideo ?? undefined);
    } catch (error) {
      if (error instanceof Error && error.name === "CommunitySafetyViolationError") {
        return errorResponse(error.message, 422);
      }
      console.warn("Automated moderation is unavailable; continuing with the original upload.", error);
    }

    const url = await uploadToR2(file, `${auth.user.id}/${folder}/${name}`, contentType, folder);
    uploadedUrls.push(url);
    let thumbnailUrl: string | null = null;
    if (processedVideo && (folder === "posts" || folder === "highlights")) {
      const thumbnailName = `${name.replace(/\.[^.]+$/, "")}-thumbnail.jpg`;
      const thumbnailKey = `${auth.user.id}/${folder}/${thumbnailName}`;
      try {
        thumbnailUrl = await uploadToR2(processedVideo.thumbnail, thumbnailKey, "image/jpeg", folder);
        uploadedUrls.push(thumbnailUrl);
      } catch (error) {
        console.warn("Thumbnail upload failed; returning the original video upload.", error);
        try {
          await deleteFromR2(thumbnailKey);
        } catch (cleanupError) {
          console.error("Could not remove an incomplete video thumbnail upload.", cleanupError);
        }
      }
    }
    return Response.json({
      url,
      ...(processedVideo
        ? {
            duration: processedVideo.durationSeconds,
            width: processedVideo.width,
            height: processedVideo.height,
            thumbnailUrl,
          }
        : {}),
    });
  } catch (error) {
    if (uploadedUrls.length > 0) {
      try {
        const keys = uploadedUrls.map((url) => new URL(url).pathname.slice(1).split("/").map(decodeURIComponent).join("/"));
        const cleanup = await Promise.allSettled(keys.map((key) => deleteFromR2(key)));
        for (const result of cleanup) {
          if (result.status === "rejected") console.error("Could not remove incomplete R2 upload.", result.reason);
        }
      } catch (cleanupError) {
        console.error("Could not clean up incomplete R2 uploads.", cleanupError);
      }
    }
    if (error instanceof Error && error.message === "Cloudflare R2 is not fully configured.") {
      console.error("R2 storage is not configured.", error);
      return errorResponse("Media storage is not configured. Please contact support.", 503);
    }
    console.error("Upload request could not be completed.", error);
    return errorResponse("Media storage is temporarily unavailable. Please try again.", 503);
  } finally {
    if (processedVideo) await cleanupProcessedVideo(processedVideo);
  }
}

export async function DELETE(request: Request): Promise<Response> {
  try {
    const auth = await authorize(request);
    if (auth.response) return auth.response;

    if (!(await isGlobalAdmin(auth.client))) {
      return errorResponse("You are not authorized to delete seed media.", 403);
    }
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || !("keys" in body) ||
      !Array.isArray(body.keys) || body.keys.length > 100 ||
      !body.keys.every(isValidR2Key)) {
      return errorResponse("The media paths are invalid.", 400);
    }
    await Promise.all(body.keys.map((key) => deleteFromR2(key)));
    return Response.json({ success: true });
  } catch (error) {
    console.error("R2 media deletion failed.", error);
    return errorResponse("Media storage is temporarily unavailable. Please try again.", 503);
  }
}
