import { createClient } from "@supabase/supabase-js";
import type { Metadata } from "next";

const SITE_NAME = "Gist me";
const SITE_ORIGIN = "https://www.gistme.online";
const DEFAULT_DESCRIPTION =
  "Join Ghanaian SHS communities on Gist me. Share campus gists, student stories, confessions, shoutouts, and spotlighted posts.";

interface SharedContentMetadata {
  content: string;
  imageUrl: string | null;
  mediaType: "image" | "video" | null;
}

function isVideoUrl(url: string): boolean {
  return /\.(mp4|webm|mov|m4v)(?:$|[?#])/i.test(url);
}

function videoMimeType(url: string): string {
  const extension = url.match(/\.([a-z0-9]+)(?:$|[?#])/i)?.[1]?.toLowerCase();
  if (extension === "webm") return "video/webm";
  if (extension === "mov") return "video/quicktime";
  return "video/mp4";
}

async function fetchSharedContent(
  kind: "post" | "confession",
  id: string
): Promise<SharedContentMetadata | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (kind === "confession") {
    const { data, error } = await supabase
      .from("public_confessions")
      .select("content, media_urls, media_types")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(`Could not load confession metadata: ${error.message}`);
    const mediaUrl = data?.media_urls?.[0] ?? null;
    const mediaType = data?.media_types?.[0] ?? (mediaUrl && isVideoUrl(mediaUrl) ? "video" : null);
    return data
      ? { content: data.content, imageUrl: mediaUrl, mediaType }
      : null;
  }

  const result = await supabase
    .from("posts")
    .select("content, media_url, media_type")
    .eq("id", id)
    .maybeSingle();
  if (result.error) {
    if (result.error.code !== "42703" && result.error.code !== "PGRST204") {
      throw new Error(`Could not load post metadata: ${result.error.message}`);
    }
    const fallback = await supabase
      .from("posts")
      .select("content, media_url")
      .eq("id", id)
      .maybeSingle();
    if (fallback.error) throw new Error(`Could not load post metadata: ${fallback.error.message}`);
    if (!fallback.data) return null;
    const imageUrl = fallback.data.media_url;
    return {
      content: fallback.data.content,
      imageUrl,
      mediaType: imageUrl && isVideoUrl(imageUrl) ? "video" : imageUrl ? "image" : null,
    };
  }
  if (!result.data) return null;
  const imageUrl = result.data.media_url;
  const mediaType = result.data.media_type === "video" || (imageUrl && isVideoUrl(imageUrl))
    ? "video"
    : imageUrl
      ? "image"
      : null;
  return { content: result.data.content, imageUrl, mediaType };
}

export async function generateSharedContentMetadata(
  kind: "post" | "confession",
  id: string
): Promise<Metadata> {
  const data = await fetchSharedContent(kind, id);
  const title = data
    ? `${kind === "post" ? "Gist" : "Anonymous confession"} on Gist me`
    : `${kind === "post" ? "Gist" : "Confession"} | ${SITE_NAME}`;
  const description = data?.content.trim().slice(0, 160) || DEFAULT_DESCRIPTION;
  const mediaUrl = data?.imageUrl
    ? new URL(data.imageUrl, SITE_ORIGIN).toString()
    : new URL("/logo.png", SITE_ORIGIN).toString();
  const isVideo = data?.mediaType === "video";
  const previewImage = isVideo ? new URL("/logo.png", SITE_ORIGIN).toString() : mediaUrl;

  return {
    title,
    description,
    openGraph: {
      siteName: SITE_NAME,
      title,
      description,
      type: "article",
      url: `${SITE_ORIGIN}/${kind === "post" ? "posts" : "confessions"}/${encodeURIComponent(id)}`,
      images: [{ url: previewImage }],
      ...(isVideo ? { videos: [{ url: mediaUrl, type: videoMimeType(mediaUrl) }] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [previewImage],
    },
  };
}
