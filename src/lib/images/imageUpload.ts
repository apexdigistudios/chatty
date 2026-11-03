import { COMPRESSION_PRESETS, compressImageWithStats } from "../imageCompression";
import { requireUserId, supabase } from "../supabase";

export async function uploadSchoolLogo(schoolId: string, file: File): Promise<string> {
  await requireUserId();
  if (!file.type.startsWith("image/")) {
    throw new Error("Choose an image file for the school logo.");
  }

  const optimized = await compressImageWithStats(file, {
    ...COMPRESSION_PRESETS.crests,
    outputFormat: "image/webp",
  });
  if (optimized.file.type !== "image/webp") {
    throw new Error("This browser cannot encode WebP school logos.");
  }

  const path = `${schoolId}/logo.webp`;
  const { error: uploadError } = await supabase.storage
    .from("school-assets")
    .upload(path, optimized.file, {
      cacheControl: "31536000",
      contentType: "image/webp",
      upsert: true,
    });
  if (uploadError) throw new Error(uploadError.message);

  const logoUrl = supabase.storage.from("school-assets").getPublicUrl(path).data.publicUrl;
  const { error: updateError } = await supabase
    .from("schools")
    .update({ logo_url: logoUrl })
    .eq("id", schoolId);
  if (updateError) throw new Error(updateError.message);

  return logoUrl;
}
