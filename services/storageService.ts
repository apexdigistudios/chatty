import { COMPRESSION_PRESETS, compressImageFile } from "@/lib/imageCompression";
import { uploadFileToR2, uploadFileToR2WithMetadata, type R2UploadFolder } from "@/lib/r2Upload";

export type MediaFolder = R2UploadFolder;

async function uploadPreparedImage(
  file: File,
  folder: MediaFolder,
  moderationText?: string
): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Only image files can be uploaded.");
  }

  return uploadFileToR2(file, folder, file.type, undefined, moderationText);
}

/**
 * Automatically compresses the image client-side (max 1200px, quality 0.75,
 * WebP/JPEG <= 200KB) and uploads it to Cloudflare R2 under the user's folder.
 */
export async function uploadImage(
  file: File,
  folder: MediaFolder,
  moderationText?: string
): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Only image files can be uploaded.");
  }

  const preset = folder === "seed-posts" || folder === "highlights"
    ? COMPRESSION_PRESETS.posts
    : COMPRESSION_PRESETS[folder];
  const optimized = await compressImageFile(file, preset);
  return uploadPreparedImage(optimized, folder, moderationText);
}

/** Uploads an image that has already been compressed by a preview workflow. */
export async function uploadPreparedAvatar(file: File): Promise<string> {
  return uploadPreparedImage(file, "avatars");
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
export async function uploadVideo(
  file: File,
  folder: MediaFolder = "posts",
  moderationText?: string
): Promise<string> {
  const format = getVideoFormat(file);
  if (!format) throw new Error("Choose an MP4, WebM, MOV, or Ogg video.");
  if (file.size > MAX_VIDEO_BYTES) throw new Error("Videos must be 80MB or smaller.");

  return uploadFileToR2(file, folder, format.contentType, undefined, moderationText);
}

export interface UploadedMedia {
  url: string;
  mediaType: "image" | "video";
  duration?: number;
  width?: number;
  height?: number;
  thumbnailUrl?: string | null;
}

/** Single entry point for post media: images are compressed, videos are streamed as-is. */
export async function uploadPostMedia(
  file: File,
  folder: "posts" | "seed-posts" = "posts",
  moderationText?: string
): Promise<UploadedMedia> {
  if (isVideoFile(file)) {
    const format = getVideoFormat(file);
    if (!format) throw new Error("Choose an MP4, WebM, MOV, or Ogg video.");
    if (file.size > MAX_VIDEO_BYTES) throw new Error("Videos must be 80MB or smaller.");
    const uploaded = await uploadFileToR2WithMetadata(file, folder, format.contentType, undefined, moderationText);
    return { ...uploaded, mediaType: "video" };
  }
  return { url: await uploadImage(file, folder, moderationText), mediaType: "image" };
}
