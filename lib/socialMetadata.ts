import type { Metadata } from "next";
import { cloudflareMediaUrl } from "@/lib/mediaUrl";
import { fetchPublicConfession, fetchPublicPost } from "@/lib/publicContent.server";

const SITE_NAME = "Gist me";
const SITE_ORIGIN = "https://www.gistme.online";
const DEFAULT_DESCRIPTION =
  "Join Ghanaian SHS communities on Gist me. Share campus gists, student stories, confessions, and spotlighted posts.";
const DEFAULT_IMAGE = `${SITE_ORIGIN}/logo.png`;

function absoluteUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(cloudflareMediaUrl(value), SITE_ORIGIN);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function videoMimeType(url: string): string {
  const extension = url.match(/\.([a-z0-9]+)(?:$|[?#])/i)?.[1]?.toLowerCase();
  if (extension === "webm") return "video/webm";
  if (extension === "mov") return "video/quicktime";
  if (extension === "ogv") return "video/ogg";
  return "video/mp4";
}

export async function generateSharedContentMetadata(
  kind: "post" | "confession",
  id: string
): Promise<Metadata> {
  let data;
  try {
    data = kind === "post"
      ? await fetchPublicPost(id)
      : await fetchPublicConfession(id);
  } catch (error) {
    console.error("Could not generate public shared-content metadata.", error);
    data = null;
  }
  const title = data
    ? `${kind === "post" ? "Gist" : "Anonymous confession"} on Gist me`
    : `${kind === "post" ? "Gist" : "Confession"} | ${SITE_NAME}`;
  const description = data?.content.trim().slice(0, 160) || DEFAULT_DESCRIPTION;
  const absoluteMediaUrl = absoluteUrl(data?.mediaUrls?.[0]);
  const mediaUrl = absoluteMediaUrl ?? DEFAULT_IMAGE;
  const isVideo = data?.mediaTypes?.[0] === "video" && absoluteMediaUrl !== null;
  const previewImage = isVideo ? DEFAULT_IMAGE : mediaUrl;
  const canonicalUrl = `${SITE_ORIGIN}/${kind === "post" ? "posts" : "confessions"}/${encodeURIComponent(id)}`;

  return {
    title,
    description,
    openGraph: {
      siteName: SITE_NAME,
      title,
      description,
      type: "article",
      url: canonicalUrl,
      images: [{ url: previewImage, secureUrl: previewImage, alt: title }],
      ...(isVideo ? { videos: [{ url: mediaUrl, secureUrl: mediaUrl, type: videoMimeType(mediaUrl) }] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [previewImage],
    },
  };
}
