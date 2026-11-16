import { CLOUDFLARE_MEDIA_ORIGIN } from "@/lib/mediaUrl";

export const runtime = "nodejs";

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/svg+xml",
  "image/webp",
]);

function isAllowedAvatarUrl(url: URL): boolean {
  if (url.protocol !== "https:" || url.username || url.password) return false;
  if (url.origin === CLOUDFLARE_MEDIA_ORIGIN) return true;
  if (url.origin === "https://api.dicebear.com") return true;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return false;
  try {
    const storageOrigin = new URL(supabaseUrl).origin;
    return url.origin === storageOrigin && url.pathname.startsWith("/storage/v1/");
  } catch {
    return false;
  }
}

export async function GET(request: Request): Promise<Response> {
  const requestedUrl = new URL(request.url).searchParams.get("url");
  if (!requestedUrl) return Response.json({ error: "Avatar URL is required." }, { status: 400 });

  let avatarUrl: URL;
  try {
    avatarUrl = new URL(requestedUrl);
  } catch {
    return Response.json({ error: "Avatar URL is invalid." }, { status: 400 });
  }
  if (!isAllowedAvatarUrl(avatarUrl)) {
    return Response.json({ error: "Avatar host is not allowed." }, { status: 400 });
  }

  try {
    const upstream = await fetch(avatarUrl, {
      cache: "force-cache",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    if (!upstream.ok || !upstream.body) {
      return Response.json({ error: "Avatar image is unavailable." }, { status: 502 });
    }

    const contentType = upstream.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
    if (!contentType || !ALLOWED_IMAGE_TYPES.has(contentType)) {
      return Response.json({ error: "Avatar response is not a supported image." }, { status: 502 });
    }

    const contentLength = Number(upstream.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_AVATAR_BYTES) {
      return Response.json({ error: "Avatar image is too large." }, { status: 413 });
    }

    const reader = upstream.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_AVATAR_BYTES) {
        await reader.cancel();
        return Response.json({ error: "Avatar image is too large." }, { status: 413 });
      }
      chunks.push(value);
    }

    const image = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      image.set(chunk, offset);
      offset += chunk.byteLength;
    }

    return new Response(image, {
      headers: {
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
        "Content-Length": String(totalBytes),
        "Content-Type": contentType,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Could not load a share-card avatar.", error);
    return Response.json({ error: "Avatar image could not be loaded." }, { status: 502 });
  }
}
