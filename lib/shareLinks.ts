const SITE_ORIGIN = "https://www.gistme.online";

export function sharePreviewUrl(kind: "post" | "confession", id: string): string {
  return `${SITE_ORIGIN}/${kind === "post" ? "posts" : "confessions"}/${encodeURIComponent(id)}`;
}

export function isNativeSharePreferred(): boolean {
  return typeof navigator.share === "function" && window.matchMedia("(max-width: 767px)").matches;
}
