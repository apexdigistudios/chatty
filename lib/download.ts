/**
 * Downloads an image (post media / avatar) to the device.
 * Tries a CORS fetch → Blob download; falls back to opening the asset in a new tab
 * when the remote host blocks cross-origin reads. Available to guests and members.
 */
export async function downloadMedia(
  src: string,
  filenameHint = "gist-me-image"
): Promise<"downloaded" | "opened"> {
  const safeName = filenameHint.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 48) || "gist-me";
  try {
    const response = await fetch(src, { mode: "cors", credentials: "omit" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    const extension =
      blob.type === "image/webp"
        ? "webp"
        : blob.type === "image/png"
          ? "png"
          : blob.type === "image/gif"
            ? "gif"
            : blob.type === "video/mp4"
              ? "mp4"
              : blob.type === "video/webm"
                ? "webm"
                : blob.type === "video/quicktime"
                  ? "mov"
                  : blob.type.startsWith("video/")
                    ? "mp4"
                    : "jpg";
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = `${safeName}.${extension}`;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 4000);
    return "downloaded";
  } catch {
    window.open(src, "_blank", "noopener,noreferrer");
    return "opened";
  }
}
