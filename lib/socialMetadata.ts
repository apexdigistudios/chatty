import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Metadata } from "next";

const SITE_NAME = "Gist me";
const SITE_ORIGIN = "https://www.gistme.online";
const DEFAULT_DESCRIPTION =
  "Join Ghanaian SHS communities on Gist me. Share campus gists, student stories, confessions, shoutouts, and spotlighted posts.";
const DEFAULT_IMAGE = `${SITE_ORIGIN}/logo.png`;

interface SharedContentMetadata {
  content: string;
  imageUrl: string | null;
  mediaType: "image" | "video" | null;
}

interface SupabaseMetadataError {
  code?: string;
  message: string;
}

interface RawPostMetadata {
  content?: string | null;
  caption?: string | null;
  media_url?: string | null;
  media_urls?: string[] | null;
  media_type?: string | null;
  media_types?: string[] | null;
  post_type?: string | null;
  status?: string | null;
  is_hidden?: boolean | null;
}

interface RawConfessionMetadata {
  content?: string | null;
  caption?: string | null;
  media_urls?: string[] | null;
  media_types?: string[] | null;
}

interface RawPostMedia {
  media_url: string;
  media_type: "image" | "video";
}

type MetadataSupabaseClient = SupabaseClient<any, "public", "public", any, any>;

function isVideoUrl(url: string): boolean {
  return /\.(mp4|webm|mov|m4v|ogv)(?:$|[?#])/i.test(url);
}

function isMissingColumn(error: SupabaseMetadataError): boolean {
  return error.code === "42703" ||
    error.code === "PGRST204" ||
    error.code === "PGRST200" ||
    /column .* does not exist|could not find .* column/i.test(error.message);
}

function isMissingRelation(error: SupabaseMetadataError): boolean {
  return error.code === "42P01" ||
    error.code === "PGRST205" ||
    /table .* does not exist|could not find the table/i.test(error.message);
}

function absoluteUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value, SITE_ORIGIN);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function inferMediaType(value: string | null, declaredType?: string | null): "image" | "video" | null {
  if (declaredType === "image" || declaredType === "video") return declaredType;
  if (!value) return null;
  if (isVideoUrl(value)) return "video";
  if (/\.(jpe?g|png|webp|gif|avif)(?:$|[?#])/i.test(value)) return "image";
  return null;
}

function selectedMedia(
  mediaUrls: Array<string | null | undefined>,
  mediaTypes: Array<string | null | undefined> = []
): Pick<SharedContentMetadata, "imageUrl" | "mediaType"> {
  const index = mediaUrls.findIndex((url) => Boolean(url));
  const imageUrl = index >= 0 ? mediaUrls[index] ?? null : null;
  return {
    imageUrl,
    mediaType: inferMediaType(imageUrl, index >= 0 ? mediaTypes[index] : null),
  };
}

async function fetchFirstAvailableRow<T>(
  query: (columns: string) => PromiseLike<{ data: unknown; error: SupabaseMetadataError | null }>,
  columnSets: string[]
): Promise<T | null> {
  for (const columns of columnSets) {
    const { data, error } = await query(columns);
    if (!error) return data as T | null;
    if (!isMissingColumn(error)) throw new Error(`Could not load share metadata: ${error.message}`);
  }
  throw new Error("Could not load share metadata: no supported content columns were found.");
}

async function fetchPostMetadata(
  supabase: MetadataSupabaseClient,
  id: string
): Promise<SharedContentMetadata | null> {
  const post = await fetchFirstAvailableRow<RawPostMetadata>(
    (columns) => supabase
      .from("posts")
      .select(columns)
      .eq("id", id)
      .eq("post_type", "public")
      .eq("status", "active")
      .maybeSingle(),
    [
      "content, caption, media_url, media_urls, media_type, media_types, post_type, status, is_hidden",
      "content, media_url, media_type, post_type, status, is_hidden",
      "content, media_url, media_type, post_type, status",
      "content, media_url, post_type, status",
      "caption, media_url, post_type, status",
      "content, media_urls, media_types, post_type, status",
      "caption, media_urls, media_types, post_type, status",
    ]
  );
  if (!post || post.is_hidden) return null;

  const { data: mediaData, error: mediaError } = await supabase
    .from("post_media")
    .select("media_url, media_type")
    .eq("post_id", id)
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle<RawPostMedia>();
  if (mediaError && !isMissingRelation(mediaError)) {
    throw new Error(`Could not load post preview media: ${mediaError.message}`);
  }

  const postMedia = mediaError ? null : mediaData;
  const legacyMedia = selectedMedia(
    post.media_urls?.length ? post.media_urls : [post.media_url],
    post.media_types?.length ? post.media_types : [post.media_type]
  );
  const mediaUrl = postMedia?.media_url ?? legacyMedia.imageUrl;
  const mediaType = postMedia?.media_type ?? legacyMedia.mediaType;

  return {
    content: post.content?.trim() || post.caption?.trim() || "",
    imageUrl: mediaUrl,
    mediaType: mediaType ?? inferMediaType(mediaUrl),
  };
}

async function fetchConfessionMetadata(
  supabase: MetadataSupabaseClient,
  id: string
): Promise<SharedContentMetadata | null> {
  const confession = await fetchFirstAvailableRow<RawConfessionMetadata>(
    (columns) => supabase
      .from("public_confessions")
      .select(columns)
      .eq("id", id)
      .maybeSingle(),
    [
      "content, caption, media_urls, media_types",
      "content, media_urls, media_types",
      "content, media_urls",
      "caption, media_urls, media_types",
      "caption, media_urls",
      "content",
      "caption",
    ]
  );
  if (!confession) return null;
  const media = selectedMedia(confession.media_urls ?? [], confession.media_types ?? []);
  return {
    content: confession.content?.trim() || confession.caption?.trim() || "",
    ...media,
  };
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

  return kind === "post"
    ? fetchPostMetadata(supabase, id)
    : fetchConfessionMetadata(supabase, id);
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
  const data = await fetchSharedContent(kind, id);
  const title = data
    ? `${kind === "post" ? "Gist" : "Anonymous confession"} on Gist me`
    : `${kind === "post" ? "Gist" : "Confession"} | ${SITE_NAME}`;
  const description = data?.content.trim().slice(0, 160) || DEFAULT_DESCRIPTION;
  const absoluteMediaUrl = absoluteUrl(data?.imageUrl);
  const mediaUrl = absoluteMediaUrl ?? DEFAULT_IMAGE;
  const isVideo = data?.mediaType === "video" && absoluteMediaUrl !== null;
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
