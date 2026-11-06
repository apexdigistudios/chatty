export async function downloadImage(
  src: string,
  filenameHint = "gist-me-image"
): Promise<void> {
  const safeName = filenameHint.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 48) || "gist-me-image";
  const response = await fetch(src, { mode: "cors", credentials: "omit" });
  if (!response.ok) throw new Error(`Image download failed (HTTP ${response.status}).`);

  const blob = await response.blob();
  if (!blob.size) throw new Error("The image is empty.");
  if (blob.type && !blob.type.startsWith("image/")) {
    throw new Error("This media is not an image.");
  }

  const extensionByType: Record<string, string> = {
    "image/avif": "avif",
    "image/gif": "gif",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };
  const extension = extensionByType[blob.type] ?? "jpg";
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = `${safeName}.${extension}`;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 4000);
}
