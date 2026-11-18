import { createClient } from "@supabase/supabase-js";
import { moderateConfessionText, type ConfessionModerationStatus } from "@/lib/moderation";

export const runtime = "nodejs";

const CONFESSION_CATEGORIES = [
  "Crush Confession",
  "School Secret",
  "Relationship Gist",
  "Friendship Gist",
] as const;

interface ConfessionSubmissionRow {
  id: string;
  school_id: string | null;
  category: string;
  content: string;
  created_at: string;
  published_at: string | null;
  moderation_status: ConfessionModerationStatus;
}

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
    console.error("Server-side confession publishing is not configured.");
    return errorResponse("Confession publishing is not available right now.", 500);
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
      !("content" in body) ||
      typeof body.content !== "string" ||
      body.content.trim().length < 1 ||
      body.content.trim().length > 300 ||
      !("category" in body) ||
      typeof body.category !== "string" ||
      !CONFESSION_CATEGORIES.includes(body.category as (typeof CONFESSION_CATEGORIES)[number]) ||
      !("schoolId" in body) ||
      !isUuid(body.schoolId)
    ) {
      return errorResponse("Your confession details are invalid.", 400);
    }

    const { data: profile, error: profileError } = await serviceClient
      .from("profiles")
      .select("school_id, is_admin")
      .eq("id", authData.user.id)
      .maybeSingle<{ school_id: string | null; is_admin: boolean | null }>();
    if (profileError) throw new Error("Could not verify your account and school.");
    if (!profile) return errorResponse("Your profile could not be found.", 404);

    const { data: roles, error: rolesError } = await serviceClient
      .from("admin_roles")
      .select("role")
      .eq("user_id", authData.user.id)
      .in("role", ["global_admin"]);
    if (rolesError) throw new Error("Could not verify your account permissions.");
    const isAdmin = profile.is_admin === true || Boolean(roles?.length);
    if (!isAdmin && profile.school_id !== body.schoolId) {
      return errorResponse("Confessions can only be submitted to your own school community.", 403);
    }

    const { data: school, error: schoolError } = await serviceClient
      .from("schools")
      .select("name")
      .eq("id", body.schoolId)
      .maybeSingle<{ name: string }>();
    if (schoolError) throw new Error("Could not verify the selected school.");
    if (!school) return errorResponse("The selected school could not be found.", 400);

    // Reserve the submission while private first. This applies the atomic
    // database rate limit before spending an OpenAI moderation request.
    const { data: reservedConfession, error: submitError } = await serviceClient
      .rpc("submit_confession_for_review", {
        p_author_id: authData.user.id,
        p_school_id: body.schoolId,
        p_category: body.category,
        p_content: body.content.trim(),
      })
      .single<ConfessionSubmissionRow>();

    if (submitError) {
      if (submitError.message.includes("rate limit")) {
        return errorResponse(submitError.message, 429);
      }
      if (submitError.message.includes("restricted")) {
        return errorResponse(submitError.message, 403);
      }
      if (submitError.code === "42501") return errorResponse("Confession publishing is not authorized.", 403);
      if (submitError.code === "22023") return errorResponse(submitError.message, 400);
      throw new Error("Could not submit your confession for review.");
    }

    const decision = await moderateConfessionText(body.content.trim(), school.name);
    const { error: finalizeError } = await serviceClient.rpc("finalize_confession_moderation", {
      p_confession_id: reservedConfession.id,
      p_moderation_status: decision.status,
      p_ai_categories: decision.categories,
      p_ai_scores: decision.scores,
      p_ai_flags: decision.flags,
      p_is_urgent_safeguarding: decision.isUrgentSafeguarding,
    });
    if (finalizeError) {
      console.error("Could not finalize confession moderation; submission remains private.", finalizeError.message);
      return errorResponse(
        "Your confession was saved privately for moderator review. Automated checks could not be finalized.",
        503
      );
    }

    const { data: confession, error: resultError } = await serviceClient
      .from("confessions")
      .select("id, school_id, category, content, created_at, published_at, moderation_status")
      .eq("id", reservedConfession.id)
      .single<ConfessionSubmissionRow>();
    if (resultError) {
      console.error("Could not read the finalized confession result.", resultError.message);
      return errorResponse("Your confession was processed but its status could not be loaded. Please check your submissions.", 503);
    }

    return Response.json({
      confession,
      message: decision.status === "REJECTED" ? decision.rejectionMessage : undefined,
    }, { status: decision.status === "REJECTED" ? 422 : 201 });
  } catch (error) {
    console.error("Could not submit confession.", error);
    return errorResponse(error instanceof Error ? error.message : "Could not submit your confession.", 500);
  }
}
