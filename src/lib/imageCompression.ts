/**
 * Client-side Image Compression & Fast WebP Conversion Pipeline.
 *
 * Optimised for Ghanaian mobile networks and SM1 student tablets:
 * - Resizes images proportionally within `maxDimension` (default 1200px)
 * - Encodes to `image/webp` (with automatic `image/jpeg` fallback) at 0.75 quality
 * - Preserves alpha transparency for school crests when WebP is supported
 * - Iteratively steps quality & scale so output stays strictly <= 200 KB
 */

export interface CompressionOptions {
  /** Max width or height in pixels. @default 1200 */
  maxDimension?: number;
  /** Starting encoder quality (0..1). @default 0.75 */
  initialQuality?: number;
  /** Strict target ceiling in bytes. @default 200 * 1024 (200 KB) */
  maxBytes?: number;
  /** Fill background if encoding to opaque JPEG. @default "#FFFFFF" */
  backgroundColor?: string;
  /** Force a specific output format when the upload path requires one. */
  outputFormat?: "image/webp" | "image/jpeg";
}

export interface CompressedImageResult {
  file: File;
  originalBytes: number;
  compressedBytes: number;
  width: number;
  height: number;
  format: "image/webp" | "image/jpeg";
  wasCompressed: boolean;
}

const DEFAULT_MAX_DIMENSION = 1200;
const DEFAULT_INITIAL_QUALITY = 0.75;
const DEFAULT_MAX_BYTES = 200 * 1024; // 200 KB
const MAX_RAW_INPUT_BYTES = 25 * 1024 * 1024; // Allow up to 25 MB camera photos pre-compression

/** WeakSet tracks files already produced by this pipeline to prevent double compression. */
const alreadyCompressedFiles = new WeakSet<File>();

export function isAlreadyCompressed(file: File): boolean {
  return alreadyCompressedFiles.has(file);
}

let cachedWebPSupport: boolean | null = null;

/** Detects once whether the browser's `<canvas>` encoder supports `image/webp`. */
function supportsWebPEncoding(): boolean {
  if (cachedWebPSupport !== null) return cachedWebPSupport;
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 2;
    canvas.height = 2;
    const dataUrl = canvas.toDataURL("image/webp", 0.75);
    cachedWebPSupport = dataUrl.startsWith("data:image/webp");
  } catch {
    cachedWebPSupport = false;
  }
  return cachedWebPSupport;
}

interface DecodedSource {
  width: number;
  height: number;
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
  cleanup: () => void;
}

/** Decodes an image file via `createImageBitmap` (fast, off-thread) with `<img>` fallback. */
async function decodeImageFile(file: File): Promise<DecodedSource> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        width: bitmap.width,
        height: bitmap.height,
        draw: (ctx, w, h) => ctx.drawImage(bitmap, 0, 0, w, h),
        cleanup: () => bitmap.close(),
      };
    } catch {
      // Fall through to HTMLImageElement decoder
    }
  }

  return new Promise<DecodedSource>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      resolve({
        width: img.naturalWidth || img.width,
        height: img.naturalHeight || img.height,
        draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h),
        cleanup: () => URL.revokeObjectURL(objectUrl),
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not decode that image file."));
    };
    img.src = objectUrl;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number
): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Image compression failed."));
      },
      mimeType,
      quality
    );
  });
}

function buildOutputFilename(originalName: string, mime: "image/webp" | "image/jpeg"): string {
  const base = originalName.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "_") || "image";
  const ext = mime === "image/webp" ? "webp" : "jpg";
  return `${base}.${ext}`;
}

/** Preset options tailored to each upload surface while staying <= 1200px & <= 200KB. */
export const COMPRESSION_PRESETS = {
  posts: {
    maxDimension: 1200,
    initialQuality: 0.75,
    maxBytes: 200 * 1024,
  },
  avatars: {
    maxDimension: 640,
    initialQuality: 0.75,
    maxBytes: 140 * 1024,
  },
  crests: {
    maxDimension: 512,
    initialQuality: 0.78,
    maxBytes: 140 * 1024,
  },
  covers: {
    maxDimension: 1200,
    initialQuality: 0.75,
    maxBytes: 200 * 1024,
    outputFormat: "image/jpeg",
  },
} as const satisfies Record<"posts" | "avatars" | "crests" | "covers", CompressionOptions>;

/**
 * Compresses and converts an image `File` to WebP (or JPEG fallback), keeping
 * dimensions <= `maxDimension` (1200px) and byte size strictly <= `maxBytes` (200KB).
 */
export async function compressImageWithStats(
  file: File,
  options: CompressionOptions = {}
): Promise<CompressedImageResult> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Only image files can be uploaded.");
  }
  if (file.size > MAX_RAW_INPUT_BYTES) {
    throw new Error("Please select an image smaller than 25MB.");
  }

  const maxDimension = options.maxDimension ?? DEFAULT_MAX_DIMENSION;
  const initialQuality = options.initialQuality ?? DEFAULT_INITIAL_QUALITY;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const backgroundColor = options.backgroundColor ?? "#FFFFFF";
  const targetMime: "image/webp" | "image/jpeg" =
    options.outputFormat ??
    (supportsWebPEncoding() ? "image/webp" : "image/jpeg");

  // Short-circuit if this exact File instance already passed through our compressor within budget
  if (isAlreadyCompressed(file) && file.type === targetMime && file.size <= maxBytes) {
    return {
      file,
      originalBytes: file.size,
      compressedBytes: file.size,
      width: maxDimension,
      height: maxDimension,
      format: file.type === "image/webp" ? "image/webp" : "image/jpeg",
      wasCompressed: false,
    };
  }

  const source = await decodeImageFile(file);

  try {
    const longestEdge = Math.max(source.width, source.height, 1);
    const baseScale = longestEdge > maxDimension ? maxDimension / longestEdge : 1;

    let targetWidth = Math.max(1, Math.round(source.width * baseScale));
    let targetHeight = Math.max(1, Math.round(source.height * baseScale));

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context is unavailable.");

    const renderAtSize = (w: number, h: number) => {
      canvas.width = w;
      canvas.height = h;
      ctx.clearRect(0, 0, w, h);
      if (targetMime === "image/jpeg") {
        ctx.fillStyle = backgroundColor;
        ctx.fillRect(0, 0, w, h);
      }
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      source.draw(ctx, w, h);
    };

    renderAtSize(targetWidth, targetHeight);

    // Step 1: Encode at target 0.75 quality
    let quality = initialQuality;
    let blob = await canvasToBlob(canvas, targetMime, quality);

    // Step 2: If still > 200KB, step quality down cleanly before touching dimensions
    const qualitySteps = [0.66, 0.56, 0.46, 0.38];
    for (const nextQuality of qualitySteps) {
      if (blob.size <= maxBytes) break;
      if (nextQuality >= quality) continue;
      quality = nextQuality;
      blob = await canvasToBlob(canvas, targetMime, quality);
    }

    // Step 3: For ultra-dense textures still > 200KB, gently step dimensions down by 15%
    let shrinkRound = 0;
    while (blob.size > maxBytes && shrinkRound < 4 && Math.max(targetWidth, targetHeight) > 320) {
      shrinkRound += 1;
      targetWidth = Math.max(1, Math.round(targetWidth * 0.85));
      targetHeight = Math.max(1, Math.round(targetHeight * 0.85));
      renderAtSize(targetWidth, targetHeight);
      blob = await canvasToBlob(canvas, targetMime, 0.55);
    }

    // Release backing canvas memory immediately on mobile / SM1 tablets
    canvas.width = 0;
    canvas.height = 0;

    const outName = buildOutputFilename(file.name, targetMime);
    const compressedFile = new File([blob], outName, {
      type: targetMime,
      lastModified: Date.now(),
    });
    alreadyCompressedFiles.add(compressedFile);

    return {
      file: compressedFile,
      originalBytes: file.size,
      compressedBytes: compressedFile.size,
      width: targetWidth,
      height: targetHeight,
      format: targetMime,
      wasCompressed: true,
    };
  } finally {
    source.cleanup();
  }
}

/** Convenience helper returning the compressed `File` directly. */
export async function compressImageFile(
  file: File,
  options: CompressionOptions = {}
): Promise<File> {
  const result = await compressImageWithStats(file, options);
  return result.file;
}

/** Formats bytes cleanly for UI badges (e.g., "74 KB" or "1.4 MB"). */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.max(1, Math.round(kb))} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}
