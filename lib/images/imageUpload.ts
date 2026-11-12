import { COMPRESSION_PRESETS, compressImageWithStats } from "@/lib/imageCompression";
import { requireUserId } from "@/lib/supabase";
import { uploadFileToR2 } from "@/lib/r2Upload";

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

  onStage?.("uploading");
  const logoUrl = await uploadFileToR2(optimized.file, "crests", "image/webp", schoolId);
  onStage?.("saving");
  return logoUrl;
}
