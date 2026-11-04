import { COMPRESSION_PRESETS, compressImageFile } from "../lib/imageCompression";
import { MEDIA_BUCKET, requireUserId, supabase } from "../lib/supabase";

export type MediaFolder = "posts" | "seed-posts" | "avatars" | "crests";

/**
 * Automatically compresses the image client-side (max 1200px, quality 0.75,
 * WebP/JPEG <= 200KB) and uploads it to the public `letsgist-media` bucket
 * under `{auth.uid()}/{folder}/...`.
 */
export async function uploadImage(file: File, folder: MediaFolder): Promise<string> {
  const userId = await requireUserId();
  if (!file.type.startsWith("image/")) {
    throw new Error("Only image files can be uploaded.");
  }

  const preset = folder === "seed-posts" ? COMPRESSION_PRESETS.posts : COMPRESSION_PRESETS[folder];
  const optimized = await compressImageFile(file, preset);

  const ext =
    optimized.type === "image/webp"
      ? "webp"
      : optimized.type === "image/jpeg"
        ? "jpg"
        : (optimized.name.split(".").pop() ?? "webp").toLowerCase().replace(/[^a-z0-9]/g, "") ||
          "webp";

  const path = `${userId}/${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(path, optimized, {
      cacheControl: "31536000",
      upsert: false,
      contentType: optimized.type,
    });
  if (error) throw new Error(error.message);

  return supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
}

export async function uploadImages(files: File[], folder: MediaFolder): Promise<string[]> {
  return Promise.all(files.map((file) => uploadImage(file, folder)));
}

const VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);
const MAX_VIDEO_BYTES = 80 * 1024 * 1024;

export function isVideoFile(file: File): boolean {
  return VIDEO_TYPES.has(file.type) || file.type.startsWith("video/");
}

/** Uploads a TikTok/WhatsApp-status style video without transcoding it. */
export async function uploadVideo(file: File, folder: MediaFolder = "posts"): Promise<string> {
  const userId = await requireUserId();
  if (!isVideoFile(file)) throw new Error("Choose an MP4, WebM, or MOV video.");
  if (file.size > MAX_VIDEO_BYTES) throw new Error("Videos must be 80MB or smaller.");

  const ext = file.type === "video/quicktime" ? "mov" : file.type === "video/webm" ? "webm" : "mp4";
  const path = `${userId}/${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(path, file, { cacheControl: "31536000", upsert: false, contentType: file.type });
  if (error) throw new Error(error.message);
  return supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
}

export interface UploadedMedia {
  url: string;
  mediaType: "image" | "video";
}

/** Single entry point for post media: images are compressed, videos are streamed as-is. */
export async function uploadPostMedia(file: File, folder: "posts" | "seed-posts" = "posts"): Promise<UploadedMedia> {
  if (isVideoFile(file)) {
    return { url: await uploadVideo(file, folder), mediaType: "video" };
  }
  return { url: await uploadImage(file, folder), mediaType: "image" };
}
