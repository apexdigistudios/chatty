import { supabase } from "@/lib/supabase";

export type R2UploadFolder = "posts" | "seed-posts" | "avatars" | "covers" | "crests";

export async function uploadFileToR2(
  file: File,
  folder: R2UploadFolder,
  contentType = file.type,
  resourceId?: string
): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(error.message);
  const accessToken = data.session?.access_token;
  if (!accessToken) throw new Error("Please sign in to continue.");

  const formData = new FormData();
  formData.set("file", file);
  formData.set("folder", folder);
  formData.set("contentType", contentType);
  if (resourceId) formData.set("resourceId", resourceId);

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
  return result.url;
}
