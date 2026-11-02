import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** True once VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are present. */
export const isSupabaseConfigured = Boolean(url && anonKey);

/**
 * Single shared client. When env vars are missing the app renders the
 * SetupGate and never issues a request, so the placeholder values are inert.
 */
export const supabase = createClient(
  url ?? "https://setup-required.supabase.co",
  anonKey ?? "setup-required",
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
);

export const MEDIA_BUCKET = "letsgist-media";

/** Resolves the signed-in user's id or throws a friendly error. */
export async function requireUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(error.message);
  const id = data.session?.user.id;
  if (!id) throw new Error("Please sign in to continue.");
  return id;
}

/** Returns the signed-in user id or null without throwing. */
export async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

/** Normalises Supabase/PostgREST/JS errors into a readable message. */
export function describeError(error: unknown, fallback = "Something went wrong."): string {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return fallback;
}

/** Reads `[{ count }]` embeds PostgREST returns for `relation(count)`. */
export function countOf(value: unknown): number {
  if (Array.isArray(value) && value.length > 0) {
    const first = value[0] as { count?: unknown };
    return typeof first.count === "number" ? first.count : 0;
  }
  return 0;
}
