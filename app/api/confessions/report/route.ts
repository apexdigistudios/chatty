import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const REPORT_REASONS = [
  "Bullying",
  "Sexual content",
  "Personal information exposure",
  "Threats",
  "Hate speech",
  "False accusations",
  "Other inappropriate content",
] as const;

function errorResponse(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function POST(request: Request): Promise<Response> {
  const accessToken = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!accessToken) return errorResponse("Please sign in to continue.", 401);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error("Confession reporting is not configured on the server.");
    return errorResponse("Reporting is not available right now.", 500);
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data: authData, error: authError } = await authClient.auth.getUser(accessToken);
  if (authError || !authData.user) return errorResponse("Please sign in to continue.", 401);

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const body: unknown = await request.json();
    if (
      typeof body !== "object" ||
      body === null ||
      !("confessionId" in body) ||
      !isUuid(body.confessionId) ||
      !("reason" in body) ||
      typeof body.reason !== "string" ||
      !REPORT_REASONS.includes(body.reason as (typeof REPORT_REASONS)[number]) ||
      ("details" in body && body.details !== undefined &&
        body.details !== null &&
        (typeof body.details !== "string" || body.details.trim().length > 1000))
    ) {
      return errorResponse("Choose a valid reason and keep details under 1,000 characters.", 400);
    }

    const { data: confession, error: confessionError } = await serviceClient
      .from("confessions")
      .select("id, author_id, moderation_status")
      .eq("id", body.confessionId)
      .maybeSingle<{ id: string; author_id: string | null; moderation_status: string }>();
    if (confessionError) throw new Error("Could not verify the confession.");
    if (!confession || confession.moderation_status !== "APPROVED") {
      return errorResponse("Only published confessions can be reported.", 404);
    }
    if (confession.author_id === authData.user.id) {
      return errorResponse("You cannot report your own confession.", 403);
    }

    const reportDetails =
      "details" in body && typeof body.details === "string"
        ? body.details.trim() || null
        : null;
    const { error: insertError } = await serviceClient.from("confession_reports").insert({
      confession_id: confession.id,
      reporter_id: authData.user.id,
      reason: body.reason,
      details: reportDetails,
    });
    if (insertError?.code === "23505") {
      return errorResponse("You have already reported this confession.", 409);
    }
    if (insertError) throw new Error("Could not submit the confession report.");

    return Response.json({ status: "submitted" }, { status: 201 });
  } catch (error) {
    console.error("Could not submit confession report.", error);
    return errorResponse(error instanceof Error ? error.message : "Could not submit the report.", 500);
  }
}
