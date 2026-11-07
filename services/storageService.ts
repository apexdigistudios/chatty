import { COMPRESSION_PRESETS, compressImageFile } from "@/lib/imageCompression";
import { MEDIA_BUCKET, requireUserId, supabase } from "@/lib/supabase";

export type MediaFolder = "posts" | "seed-posts" | "avatars" | "crests";

async function uploadPreparedImage(file: File, folder: MediaFolder, userId: string): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Only image files can be uploaded.");
  }

  const ext =
    file.type === "image/webp"
      ? "webp"
      : file.type === "image/jpeg"
        ? "jpg"
        : (file.name.split(".").pop() ?? "webp").toLowerCase().replace(/[^a-z0-9]/g, "") ||
          "webp";

  const path = `${userId}/${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(path, file, {
      cacheControl: "31536000",
      upsert: false,
      contentType: file.type,
    });
  if (error) throw new Error(error.message);

  return supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
}

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
  return uploadPreparedImage(optimized, folder, userId);
}

/** Uploads an image that has already been compressed by a preview workflow. */
export async function uploadPreparedAvatar(file: File): Promise<string> {
  const userId = await requireUserId();
  return uploadPreparedImage(file, "avatars", userId);
}

export async function uploadImages(files: File[], folder: MediaFolder): Promise<string[]> {
  return Promise.all(files.map((file) => uploadImage(file, folder)));
}

const VIDEO_FORMATS = {
  mp4: { extension: "mp4", contentType: "video/mp4" },
  m4v: { extension: "m4v", contentType: "video/mp4" },
  webm: { extension: "webm", contentType: "video/webm" },
  mov: { extension: "mov", contentType: "video/quicktime" },
  ogv: { extension: "ogv", contentType: "video/ogg" },
  ogg: { extension: "ogv", contentType: "video/ogg" },
} as const;
const MAX_VIDEO_BYTES = 80 * 1024 * 1024;

function getVideoFormat(file: File) {
  const mimeType = file.type.split(";")[0]?.trim().toLowerCase();
  if (mimeType?.startsWith("image/")) return undefined;
  const extension = file.name.split(".").pop()?.toLowerCase() as keyof typeof VIDEO_FORMATS | undefined;
  const extensionFormat = extension ? VIDEO_FORMATS[extension] : undefined;
  if (mimeType === "video/mp4") return VIDEO_FORMATS.mp4;
  if (mimeType === "video/webm") return VIDEO_FORMATS.webm;
  if (mimeType === "video/quicktime") return VIDEO_FORMATS.mov;
  if (mimeType === "video/ogg" || mimeType === "application/ogg") return VIDEO_FORMATS.ogv;
  return extensionFormat;
}

export function isVideoFile(file: File): boolean {
  return getVideoFormat(file) !== undefined;
}

/** Uploads a TikTok/WhatsApp-status style video without transcoding it. */
export async function uploadVideo(file: File, folder: MediaFolder = "posts"): Promise<string> {
  const userId = await requireUserId();
  const format = getVideoFormat(file);
  if (!format) throw new Error("Choose an MP4, WebM, MOV, or Ogg video.");
  if (file.size > MAX_VIDEO_BYTES) throw new Error("Videos must be 80MB or smaller.");

  const path = `${userId}/${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${format.extension}`;
  const { error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(path, file, { cacheControl: "31536000", upsert: false, contentType: format.contentType });
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
