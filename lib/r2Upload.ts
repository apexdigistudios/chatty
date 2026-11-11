import { supabase } from "@/lib/supabase";

export type R2UploadFolder = "posts" | "seed-posts" | "avatars" | "covers" | "crests" | "highlights";

export interface UploadedR2File {
  url: string;
  duration?: number;
  width?: number;
  height?: number;
  thumbnailUrl?: string | null;
}

export async function uploadFileToR2WithMetadata(
  file: File,
  folder: R2UploadFolder,
  contentType = file.type,
  resourceId?: string,
  moderationText?: string
): Promise<UploadedR2File> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(error.message);
  const accessToken = data.session?.access_token;
  if (!accessToken) throw new Error("Please sign in to continue.");

  const formData = new FormData();
  formData.set("file", file);
  formData.set("folder", folder);
  formData.set("contentType", contentType);
  if (resourceId) formData.set("resourceId", resourceId);
  if (moderationText) formData.set("moderationText", moderationText);

  const response = await fetch("/api/upload", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: formData,
  });
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = result && typeof result === "object" && "error" in result &&
      typeof result.error === "string"
      ? result.error
      : "Upload failed. Please try again.";
    throw new Error(message);
  }
  if (!result || typeof result !== "object" || !("url" in result) || typeof result.url !== "string") {
    throw new Error("The upload service returned an invalid response.");
  }
  const duration = "duration" in result ? result.duration : undefined;
  const width = "width" in result ? result.width : undefined;
  const height = "height" in result ? result.height : undefined;
  const thumbnailUrl = "thumbnailUrl" in result ? result.thumbnailUrl : undefined;
  if (
    (duration !== undefined && (typeof duration !== "number" || !Number.isFinite(duration))) ||
    (width !== undefined && typeof width !== "number") ||
    (height !== undefined && typeof height !== "number") ||
    (thumbnailUrl !== undefined && thumbnailUrl !== null && typeof thumbnailUrl !== "string")
  ) {
    throw new Error("The upload service returned invalid video metadata.");
  }
  return {
    url: result.url,
    ...(typeof duration === "number" ? { duration } : {}),
    ...(typeof width === "number" ? { width } : {}),
    ...(typeof height === "number" ? { height } : {}),
    ...(typeof thumbnailUrl === "string" || thumbnailUrl === null ? { thumbnailUrl } : {}),
  };
}

export async function uploadFileToR2(
  file: File,
  folder: R2UploadFolder,
  contentType = file.type,
  resourceId?: string,
  moderationText?: string
): Promise<string> {
  const uploaded = await uploadFileToR2WithMetadata(file, folder, contentType, resourceId, moderationText);
  return uploaded.url;
}
