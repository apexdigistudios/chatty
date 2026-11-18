import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const MODERATION_STATUSES = ["APPROVED", "REJECTED", "ESCALATED"] as const;
type ModerationStatus = (typeof MODERATION_STATUSES)[number];
type AuthorizationResult =
  | { ok: false; response: Response }
  | { ok: true; client: SupabaseClient };

function errorResponse(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{
    data: T[] | null;
    error: { message: string } | null;
  }>
): Promise<T[]> {
  const rows: T[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

async function getAuthorizedClient(request: Request): Promise<AuthorizationResult> {
  const accessToken = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!accessToken) return { ok: false, response: errorResponse("Please sign in to continue.", 401) };

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    console.error("Confession moderation dashboard is not configured.");
    return { ok: false, response: errorResponse("The moderation dashboard is not available right now.", 500) };
  }

  const client = createClient(supabaseUrl, anonKey, {
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    },
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data: authData, error: authError } = await client.auth.getUser(accessToken);
  if (authError || !authData.user) {
    return { ok: false, response: errorResponse("Please sign in to continue.", 401) };
  }

  const { data: isAdmin, error: adminError } = await client.rpc("is_confession_admin", {
    p_user_id: authData.user.id,
  });
  if (adminError) {
    console.error("Could not verify confession moderation permissions.", adminError.message);
    return { ok: false, response: errorResponse("Could not verify administrator access.", 403) };
  }
  if (isAdmin !== true) {
    return { ok: false, response: errorResponse("Administrator access is required.", 403) };
  }

  return { ok: true, client };
}

export async function GET(request: Request): Promise<Response> {
  const authorization = await getAuthorizedClient(request);
  if (!authorization.ok) return authorization.response;

  try {
    const [confessions, reports, logs] = await Promise.all([
      fetchAllPages((from, to) => authorization.client
        .from("confessions")
        .select(
          "id, school_id, category, content, created_at, published_at, moderation_status, ai_categories, ai_scores, ai_flags, is_urgent_safeguarding, report_count"
        )
        .order("created_at", { ascending: false })
        .range(from, to)),
      fetchAllPages((from, to) => authorization.client
        .from("confession_reports")
        .select("confession_id, reason, details, status, created_at")
        .order("created_at", { ascending: false })
        .range(from, to)),
      fetchAllPages((from, to) => authorization.client
        .from("moderation_logs")
        .select("id, confession_id, action, decision_notes, previous_status, new_status, created_at")
        .order("created_at", { ascending: false })
        .range(from, to)),
    ]);

    return Response.json(
      { confessions, reports, logs },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } }
    );
  } catch (error) {
    console.error("Could not load the confession moderation dashboard.", error);
    return errorResponse("Could not load the moderation queue. Please try again.", 500);
  }
}

export async function POST(request: Request): Promise<Response> {
  const authorization = await getAuthorizedClient(request);
  if (!authorization.ok) return authorization.response;

  try {
    const body: unknown = await request.json();
    if (
      typeof body !== "object" ||
      body === null ||
      !("confessionId" in body) ||
      !isUuid(body.confessionId) ||
      !("status" in body) ||
      typeof body.status !== "string" ||
      !MODERATION_STATUSES.includes(body.status as ModerationStatus) ||
      ("decisionNotes" in body &&
        body.decisionNotes !== undefined &&
        body.decisionNotes !== null &&
        (typeof body.decisionNotes !== "string" || body.decisionNotes.length > 2000))
    ) {
      return errorResponse("Choose a valid moderation action and decision note.", 400);
    }

    const decisionNotes =
      "decisionNotes" in body && typeof body.decisionNotes === "string"
        ? body.decisionNotes.trim() || null
        : null;
    const { error: moderationError } = await authorization.client.rpc("admin_moderate_confession", {
      p_confession_id: body.confessionId,
      p_status: body.status,
      p_decision_notes: decisionNotes,
    });
    if (moderationError) {
      console.error("Could not apply the confession moderation decision.", moderationError.message);
      return errorResponse("The moderation decision could not be saved.", 500);
    }

    let reportsResolved = true;
    if (body.status === "APPROVED" || body.status === "REJECTED") {
      const { error: reportsError } = await authorization.client
        .from("confession_reports")
        .update({ status: "RESOLVED" })
        .eq("confession_id", body.confessionId)
        .eq("status", "OPEN");
      if (reportsError) {
        reportsResolved = false;
        console.error("Decision saved, but linked confession reports could not be resolved.", reportsError.message);
      }
    }

    return Response.json({ status: body.status, reportsResolved }, { status: 200 });
  } catch (error) {
    console.error("Could not process the confession moderation action.", error);
    return errorResponse("The moderation action could not be processed.", 500);
  }
}
