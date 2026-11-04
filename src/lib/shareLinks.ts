const SITE_ORIGIN = "https://www.gistme.online";

export function sharePreviewUrl(kind: "post" | "confession", id: string): string {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) {
    return `${SITE_ORIGIN}/${kind === "post" ? "posts" : "confessions"}/${encodeURIComponent(id)}`;
  }

  const url = new URL("/functions/v1/share-preview", supabaseUrl);
  url.searchParams.set("kind", kind);
  url.searchParams.set("id", id);
  return url.toString();
}

export function isNativeSharePreferred(): boolean {
  return typeof navigator.share === "function" && window.matchMedia("(max-width: 767px)").matches;
}
