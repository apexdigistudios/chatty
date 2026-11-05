const SITE_ORIGIN = "https://www.gistme.online";

export function sharePreviewUrl(kind: "post" | "confession", id: string): string {
  return `${SITE_ORIGIN}/${kind === "post" ? "posts" : "confessions"}/${encodeURIComponent(id)}`;
}

export function isNativeSharePreferred(): boolean {
  return typeof navigator !== "undefined" &&
    typeof navigator.share === "function" &&
    (typeof window.matchMedia !== "function" || window.matchMedia("(max-width: 767px)").matches);
}

export async function copyShareLink(url: string): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(url);
      return;
    } catch (error) {
      console.warn("The Clipboard API was unavailable; trying the browser copy fallback.", error);
    }
  }

  if (typeof document === "undefined") throw new Error("Clipboard access is unavailable in this browser.");
  const input = document.createElement("textarea");
  input.value = url;
  input.setAttribute("readonly", "");
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.append(input);
  input.select();
  try {
    if (!document.execCommand("copy")) throw new Error("The browser could not copy the link.");
  } finally {
    input.remove();
  }
}

export async function shareOrCopyLink({
  url,
  title,
  text,
}: {
  url: string;
  title: string;
  text: string;
}): Promise<"shared" | "copied" | "cancelled"> {
  if (isNativeSharePreferred()) {
    try {
      await navigator.share({ title, text, url });
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
      console.error("Could not open the native share sheet; copying the link instead.", error);
    }
  }

  await copyShareLink(url);
  return "copied";
}
