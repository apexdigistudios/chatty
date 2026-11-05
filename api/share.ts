import { readFileSync } from "node:fs";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createClient } from "@supabase/supabase-js";

interface ApiRequest extends IncomingMessage {
  query: Record<string, string | string[] | undefined>;
}

interface RawSchool {
  name: string;
  logo_url: string | null;
}

interface RawPost {
  id: string;
  school_id: string | null;
  content: string;
  media_url: string | null;
}

interface RawConfession {
  id: string;
  school_id: string | null;
  content: string;
  media_urls: string[] | null;
  media_types: Array<"image" | "video"> | null;
}

interface RawPostMedia {
  media_url: string;
  media_type: "image" | "video";
  sort_order: number;
}

const SITE_ORIGIN = (process.env.SITE_ORIGIN ?? "https://www.gistme.online").replace(/\/+$/, "");
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function setMeta(html: string, attribute: "name" | "property", key: string, value: string): string {
  const escaped = escapeHtml(value);
  const pattern = new RegExp(`<meta\\s+${attribute}="${key}"\\s+content="[^"]*"\\s*\\/?>`, "i");
  const tag = `<meta ${attribute}="${key}" content="${escaped}">`;
  return pattern.test(html) ? html.replace(pattern, tag) : html.replace("</head>", `  ${tag}\n</head>`);
}

function mediaType(url: string): "video" | "image" | null {
  const path = url.split(/[?#]/, 1)[0]!.toLowerCase();
  if (/\.(mp4|webm|mov|m4v|ogv)$/.test(path)) return "video";
  if (/\.(jpe?g|png|webp|gif|avif)$/.test(path)) return "image";
  return null;
}

function videoMimeType(url: string): string {
  const path = url.split(/[?#]/, 1)[0]!.toLowerCase();
  if (path.endsWith(".webm")) return "video/webm";
  if (path.endsWith(".mov")) return "video/quicktime";
  if (path.endsWith(".ogv")) return "video/ogg";
  return "video/mp4";
}

function send(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=600",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
  });
  res.end(body);
}

function template(): string {
  return readFileSync(path.resolve(process.cwd(), "dist/index.html"), "utf8");
}

export default async function share(req: ApiRequest, res: ServerResponse): Promise<void> {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    send(res, 405, "<!doctype html><title>Method not allowed</title>");
    return;
  }

  const kindParam = req.query.kind;
  const idParam = req.query.id;
  const kind = typeof kindParam === "string" ? kindParam : "";
  const id = typeof idParam === "string" ? idParam : "";
  if ((kind !== "post" && kind !== "confession") || !UUID_PATTERN.test(id)) {
    send(res, 400, "<!doctype html><title>Invalid share link</title>");
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    console.error("Share metadata route requires Supabase URL and anonymous key.");
    send(res, 500, "<!doctype html><title>Share unavailable</title>");
    return;
  }

  try {
    const supabase = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    let content: string;
    let schoolId: string | null;
    let imageUrl: string | null = null;
    let videoUrl: string | null = null;

    if (kind === "post") {
      const { data: post, error } = await supabase
        .from("posts")
        .select("id, school_id, content, media_url, post_type, status")
        .eq("id", id)
        .eq("post_type", "public")
        .eq("status", "active")
        .maybeSingle<RawPost>();
      if (error) throw new Error(error.message);
      if (!post) {
        send(res, 404, "<!doctype html><title>Content unavailable</title>");
        return;
      }

      content = post.content;
      schoolId = post.school_id;
      const { data: media, error: mediaError } = await supabase
        .from("post_media")
        .select("media_url, media_type, sort_order")
        .eq("post_id", id)
        .order("sort_order", { ascending: true })
        .returns<RawPostMedia[]>();
      if (mediaError && !["42P01", "PGRST205", "PGRST204", "42703"].includes(mediaError.code ?? "")) {
        throw new Error(mediaError.message);
      }
      const items = media ?? [];
      videoUrl = items.find((item) => item.media_type === "video")?.media_url ?? (post.media_url && mediaType(post.media_url) === "video" ? post.media_url : null);
      imageUrl = items.find((item) => item.media_type === "image")?.media_url ?? (post.media_url && mediaType(post.media_url) === "image" ? post.media_url : null);
    } else {
      const { data: confession, error } = await supabase
        .from("public_confessions")
        .select("id, school_id, content, media_urls, media_types")
        .eq("id", id)
        .maybeSingle<RawConfession>();
      if (error) throw new Error(error.message);
      if (!confession) {
        send(res, 404, "<!doctype html><title>Content unavailable</title>");
        return;
      }
      content = confession.content;
      schoolId = confession.school_id;
      const urls = confession.media_urls ?? [];
      const types = confession.media_types ?? [];
      imageUrl = urls.find((_, index) => types[index] === "image") ?? null;
      videoUrl = urls.find((_, index) => types[index] === "video") ?? null;
    }

    let school: RawSchool | null = null;
    if (schoolId) {
      const { data, error } = await supabase.from("schools").select("name, logo_url").eq("id", schoolId).maybeSingle<RawSchool>();
      if (error) throw new Error(error.message);
      school = data;
    }

    const destination = `${SITE_ORIGIN}/${kind === "post" ? "posts" : "confessions"}/${encodeURIComponent(id)}`;
    const title = kind === "confession" ? `Anonymous confession | Gist me` : `Gist from ${school?.name ?? "Ghana SHS"} | Gist me`;
    const excerpt = content.replace(/\s+/g, " ").trim().slice(0, 130);
    const description = kind === "confession"
      ? `${excerpt}${excerpt.length < content.length ? "…" : ""} Read and reply anonymously on Gist me.`
      : `${excerpt}${excerpt.length < content.length ? "…" : ""} Read and join the conversation on Gist me.`;
    const image = imageUrl ?? school?.logo_url ?? `${SITE_ORIGIN}/logo.png`;

    let html = template();
    html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title)}</title>`);
    html = setMeta(html, "name", "description", description);
    html = setMeta(html, "property", "og:site_name", "Gist me");
    html = setMeta(html, "property", "og:title", title);
    html = setMeta(html, "property", "og:description", description);
    html = setMeta(html, "property", "og:url", destination);
    html = setMeta(html, "property", "og:image", image);
    html = setMeta(html, "property", "og:image:secure_url", image);
    html = setMeta(html, "property", "og:image:alt", title);
    html = setMeta(html, "property", "og:type", videoUrl ? "video.other" : "article");
    html = setMeta(html, "name", "twitter:card", "summary_large_image");
    html = setMeta(html, "name", "twitter:title", title);
    html = setMeta(html, "name", "twitter:description", description);
    html = setMeta(html, "name", "twitter:image", image);
    const canonicalTag = `<link rel="canonical" href="${escapeHtml(destination)}">`;
    const canonicalPattern = /<link\s+rel="canonical"[^>]*\/?>/i;
    html = canonicalPattern.test(html)
      ? html.replace(canonicalPattern, canonicalTag)
      : html.replace("</head>", `  ${canonicalTag}\n</head>`);
    if (videoUrl) {
      const videoMeta = [
        `<meta property="og:video" content="${escapeHtml(videoUrl)}">`,
        `<meta property="og:video:secure_url" content="${escapeHtml(videoUrl)}">`,
        `<meta property="og:video:type" content="${videoMimeType(videoUrl)}">`,
        `<meta property="og:video:width" content="720">`,
        `<meta property="og:video:height" content="1280">`,
      ].join("\n");
      html = html.replace("</head>", `  ${videoMeta}\n</head>`);
    }
    send(res, 200, html);
  } catch (error) {
    console.error("Could not render share metadata.", error);
    send(res, 500, "<!doctype html><title>Share unavailable</title>");
  }
}
