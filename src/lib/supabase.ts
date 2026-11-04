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

/** Keeps technical backend details out of user-facing messages. */
export function describeError(error: unknown, fallback = "Couldn't complete that action. Please try again."): string {
  let message: string | null = error instanceof Error && error.message ? error.message : null;
  if (error && typeof error === "object" && "message" in error) {
    const candidate = (error as { message?: unknown }).message;
    if (typeof candidate === "string" && candidate) message = candidate;
  }
  if (!message) return fallback;

  const normalized = message.toLowerCase();
  if (/invalid login credentials|invalid email or password/.test(normalized)) {
    return "That email or password doesn't look right. Please try again.";
  }
  if (/file size|too large|file type|unsupported file|invalid image|choose an mp4/.test(normalized)) {
    return "Upload failed. Please check your file size and format.";
  }
  if (
    /\b(postgrest|postgres|supabase|sql|database|storage|bucket|object|migration|row-level security|permission|policy|duplicate key|unique constraint|foreign key|constraint|execute|insert|update|delete|column .* does not exist|relation .* does not exist|http status|status code|error code|pgrst\d+|42501|23505|42p01|403|401)\b/.test(normalized) ||
    /violates|invalid input syntax/.test(normalized) ||
    /failed to fetch|networkerror|fetch failed|request failed|server error|internal server error|api key|jwt|unauthorized|not authorized|gateway/.test(normalized) ||
    /\b[45]\d\d\b/.test(normalized)
  ) {
    return fallback;
  }
  return message;
}

/** Reads `[{ count }]` embeds PostgREST returns for `relation(count)`. */
export function countOf(value: unknown): number {
  if (Array.isArray(value) && value.length > 0) {
    const first = value[0] as { count?: unknown };
    return typeof first.count === "number" ? first.count : 0;
  }
  return 0;
}
