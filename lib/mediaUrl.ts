export const CLOUDFLARE_MEDIA_ORIGIN = "https://media.gistme.online";

const SUPABASE_STORAGE_PATH =
  /^\/storage\/v1\/(?:object|render\/image)\/(?:public|sign|authenticated)\/(.+)$/;

export function cloudflareMediaUrl(value: string): string {
  try {
    const url = new URL(value, "https://www.gistme.online");
    const storagePath = url.pathname.match(SUPABASE_STORAGE_PATH);
    if (storagePath?.[1]) {
      return `${CLOUDFLARE_MEDIA_ORIGIN}/${storagePath[1]}`;
    }

    if (
      url.hostname.endsWith(".r2.dev") ||
      url.hostname.endsWith(".r2.cloudflarestorage.com")
    ) {
      return `${CLOUDFLARE_MEDIA_ORIGIN}${url.pathname}${url.search}${url.hash}`;
    }
  } catch {
    return value;
  }

  return value;
}
