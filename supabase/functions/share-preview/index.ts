import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface ShareRecord {
  id: string;
  user_id?: string;
  seed_profile_id?: string | null;
  school_id: string | null;
  content: string;
  media_url?: string | null;
  media_urls?: string[] | null;
  media_types?: string[] | null;
  school?: { name: string; logo_url: string | null } | null;
}

const SITE_ORIGIN = (Deno.env.get("SITE_ORIGIN") ?? "https://www.gistme.online").replace(/\/+$/, "");
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function htmlResponse(status: number, body: string): Response {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=120, s-maxage=300",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    },
  });
}

function redirectResponse(destination: string): Response {
  return new Response(null, {
    status: 302,
    headers: {
      Location: destination,
      "Cache-Control": "no-store",
    },
  });
}

function isSocialCrawler(userAgent: string): boolean {
  return /bot|crawler|spider|facebookexternalhit|whatsapp|twitter|telegram|slack|discord|linkedin|pinterest|skype|applebot/i.test(userAgent);
}

function videoContentType(url: string): string {
  const path = url.split(/[?#]/, 1)[0]!.toLowerCase();
  if (path.endsWith(".webm")) return "video/webm";
  if (path.endsWith(".mov")) return "video/quicktime";
  if (path.endsWith(".ogv")) return "video/ogg";
  return "video/mp4";
}

function page(title: string, description: string, canonical: string, image: string, destination: string, video?: string): string {
  const safeTitle = escapeHtml(title);
  const safeDescription = escapeHtml(description);
  const safeCanonical = escapeHtml(canonical);
  const safeImage = escapeHtml(image);
  const safeDestination = escapeHtml(destination);
  const videoMetadata = video
    ? `<meta property="og:video" content="${escapeHtml(video)}"><meta property="og:video:secure_url" content="${escapeHtml(video)}"><meta property="og:video:type" content="${videoContentType(video)}"><meta property="og:video:width" content="720"><meta property="og:video:height" content="1280">`
    : "";
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${safeTitle}</title><meta name="description" content="${safeDescription}">
<link rel="canonical" href="${safeCanonical}">
<meta property="og:site_name" content="Gist me"><meta property="og:title" content="${safeTitle}">
<meta property="og:description" content="${safeDescription}"><meta property="og:url" content="${safeCanonical}">
<meta property="og:image" content="${safeImage}"><meta property="og:image:secure_url" content="${safeImage}">
<meta property="og:image:alt" content="${safeTitle}"><meta property="og:type" content="${video ? "video.other" : "article"}">
${videoMetadata}
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${safeTitle}">
<meta name="twitter:description" content="${safeDescription}"><meta name="twitter:image" content="${safeImage}">
<meta http-equiv="refresh" content="0;url=${safeDestination}">
</head><body><p>Opening <a href="${safeDestination}">Gist me</a>…</p>
<script>window.location.replace(${JSON.stringify(destination)});</script></body></html>`;
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method !== "GET") return new Response("Method not allowed", { status: 405 });
  const requestUrl = new URL(request.url);
  const kind = requestUrl.searchParams.get("kind");
  const id = requestUrl.searchParams.get("id") ?? "";
  if ((kind !== "post" && kind !== "confession") || !UUID_PATTERN.test(id)) {
    return htmlResponse(400, "<!doctype html><title>Invalid share link</title><p>This share link is invalid.</p>");
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) {
    console.error("Share preview function requires Supabase URL and anonymous key.");
    return htmlResponse(500, "<!doctype html><title>Share unavailable</title><p>This share is temporarily unavailable.</p>");
  }
  const supabase = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let record: ShareRecord | null = null;
  let videoUrl: string | undefined;
  let postImageUrl: string | null = null;
  if (kind === "post") {
    const { data, error } = await supabase
      .from("posts")
      .select("id, user_id, seed_profile_id, school_id, content, media_url, post_type, status, school:schools(name, logo_url)")
      .eq("id", id)
      .eq("post_type", "public")
      .eq("status", "active")
      .maybeSingle();
    if (error) {
      console.error("Could not load a post share preview.", error);
      return htmlResponse(500, "<!doctype html><title>Share unavailable</title><p>This share is temporarily unavailable.</p>");
    }
    record = data as ShareRecord | null;
    if (record?.media_url && /\.(mp4|webm|mov|m4v|ogv)(?:$|[?#])/i.test(record.media_url)) {
      videoUrl = record.media_url;
    } else {
      postImageUrl = record?.media_url ?? null;
    }
    if (record && videoUrl) {
      const { data: mediaRows, error: mediaError } = await supabase
        .from("post_media")
        .select("media_url, sort_order")
        .eq("post_id", id)
        .order("sort_order", { ascending: true })
        .limit(8);
      if (mediaError && !["42P01", "PGRST205", "PGRST204", "42703"].includes(mediaError.code ?? "")) {
        console.error("Could not load post share images.", mediaError);
        return htmlResponse(500, "<!doctype html><title>Share unavailable</title><p>This share is temporarily unavailable.</p>");
      }
      postImageUrl = mediaRows?.find((item) => !/\.(mp4|webm|mov|m4v|ogv)(?:$|[?#])/i.test(item.media_url))?.media_url ?? null;
    }
  } else {
    const { data, error } = await supabase
      .from("public_confessions")
      .select("id, school_id, content, media_urls, media_types")
      .eq("id", id)
      .maybeSingle();
    if (error) {
      console.error("Could not load a confession share preview.", error);
      return htmlResponse(500, "<!doctype html><title>Share unavailable</title><p>This share is temporarily unavailable.</p>");
    }
    record = data as ShareRecord | null;
    const videoIndex = record?.media_types?.findIndex((type) => type === "video") ?? -1;
    if (videoIndex >= 0) videoUrl = record?.media_urls?.[videoIndex] ?? undefined;
  }

  if (!record) return htmlResponse(404, "<!doctype html><title>Content unavailable</title><p>This post or confession is no longer available.</p>");
  if (!record.school && record.school_id) {
    const { data: school, error } = await supabase
      .from("schools")
      .select("name, logo_url")
      .eq("id", record.school_id)
      .maybeSingle();
    if (error) {
      console.error("Could not load a share preview school.", error);
      return htmlResponse(500, "<!doctype html><title>Share unavailable</title><p>This share is temporarily unavailable.</p>");
    }
    if (school) record.school = school;
  }

  const schoolName = record.school?.name ?? "Ghana SHS";
  const title = kind === "confession" ? `Anonymous confession from ${schoolName} | Gist me` : `Gist from ${schoolName} | Gist me`;
  const excerpt = record.content.replace(/\s+/g, " ").trim().slice(0, 130);
  const description = kind === "confession"
    ? `${excerpt}${excerpt.length < record.content.length ? "…" : ""} Click to read and reply anonymously on Gist me.`
    : `${excerpt}${excerpt.length < record.content.length ? "…" : ""} Read and join the conversation on Gist me.`;
  const mediaImage = kind === "post"
    ? postImageUrl
    : record.media_urls?.find((url, index) => record?.media_types?.[index] === "image") ??
      (videoUrl ? record.media_urls?.[record.media_types?.indexOf("video") ?? -1] : undefined);
  const image = mediaImage || record.school?.logo_url || `${SITE_ORIGIN}/logo.png`;
  const targetId = kind === "post" ? record.seed_profile_id || record.user_id : undefined;
  const destination = kind === "post" && targetId
    ? `${SITE_ORIGIN}/posts/${encodeURIComponent(id)}`
    : `${SITE_ORIGIN}/confessions/${encodeURIComponent(id)}`;

  if (!isSocialCrawler(request.headers.get("user-agent") ?? "")) return redirectResponse(destination);
  return htmlResponse(200, page(title, description, requestUrl.toString(), image, destination, videoUrl));
});
