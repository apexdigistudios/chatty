import { COMPRESSION_PRESETS, compressImageWithStats } from "../imageCompression";
import { requireUserId, supabase } from "../supabase";

export type SchoolLogoUploadStage = "compressing" | "uploading" | "saving";

export async function uploadSchoolLogo(
  schoolId: string,
  file: File,
  onStage?: (stage: SchoolLogoUploadStage) => void
): Promise<string> {
  await requireUserId();
  if (!file.type.startsWith("image/")) {
    throw new Error("Choose an image file for the school logo.");
  }

  onStage?.("compressing");
  const optimized = await compressImageWithStats(file, {
    maxDimension: 500,
    maxBytes: 100 * 1024,
    initialQuality: COMPRESSION_PRESETS.crests.initialQuality,
    outputFormat: "image/webp",
  });
  if (optimized.file.type !== "image/webp") {
    throw new Error("This browser cannot encode WebP school logos.");
  }

  const path = `${schoolId}/logo.webp`;
  onStage?.("uploading");
  const { error: uploadError } = await supabase.storage
    .from("school-assets")
    .upload(path, optimized.file, {
      cacheControl: "0",
      contentType: "image/webp",
      upsert: true,
    });
  if (uploadError) throw new Error(uploadError.message);

  const publicUrl = supabase.storage.from("school-assets").getPublicUrl(path).data.publicUrl;
  const logoUrl = `${publicUrl}${publicUrl.includes("?") ? "&" : "?"}v=${Date.now()}`;
  onStage?.("saving");
  const { error: updateError } = await supabase
    .from("schools")
    .update({ logo_url: logoUrl })
    .eq("id", schoolId)
    .select("id")
    .single();
  if (updateError) throw new Error(updateError.message);

  return logoUrl;
}
