import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type SafetyActionPayload =
  | { action: "dismiss_reports" | "remove_post"; post_id: string }
  | { action: "suspend_creator"; creator_id: string };

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse(405, { error: "Method not allowed." });

  const accessToken = request.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!accessToken) return jsonResponse(401, { error: "Authentication is required." });

  let payload: SafetyActionPayload;
  try {
    const body: unknown = await request.json();
    if (!isRecord(body)) {
      return jsonResponse(400, { error: "A valid safety action is required." });
    }
    if (body.action === "suspend_creator") {
      if (typeof body.creator_id !== "string" || !isUuid(body.creator_id)) {
        return jsonResponse(400, { error: "A valid creator account is required." });
      }
      payload = { action: "suspend_creator", creator_id: body.creator_id };
    } else if (body.action === "dismiss_reports" || body.action === "remove_post") {
      if (typeof body.post_id !== "string" || !isUuid(body.post_id)) {
        return jsonResponse(400, { error: "A valid post is required." });
      }
      payload = {
        action: body.action,
        post_id: body.post_id,
      };
    } else {
      return jsonResponse(400, { error: "A valid safety action is required." });
    }
  } catch {
    return jsonResponse(400, { error: "Request body must be valid JSON." });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Required server-side environment configuration is missing.");
    return jsonResponse(500, { error: "Safety actions are not configured." });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const { data: authData, error: authError } = await supabase.auth.getUser(accessToken);
    if (authError || !authData.user) return jsonResponse(401, { error: "Authentication is invalid or expired." });
    const actorId = authData.user.id;

    const { data: role, error: roleError } = await supabase
      .from("admin_roles")
      .select("id")
      .eq("user_id", actorId)
      .eq("role", "global_admin")
      .limit(1)
      .maybeSingle<{ id: string }>();
    if (roleError) throw new Error("Could not verify platform admin access.");
    if (!role) return jsonResponse(403, { error: "Platform administrator access is required." });

    if (payload.action === "dismiss_reports" || payload.action === "remove_post") {
      const { error } = await supabase.rpc(
        payload.action === "dismiss_reports" ? "safety_dismiss_gist" : "safety_remove_gist",
        { p_actor_id: actorId, p_post_id: payload.post_id }
      );
      if (error) throw new Error("Could not complete the requested post action.");
      return jsonResponse(200, { success: true });
    }

    const creatorId = payload.creator_id;
    const { data: targetRole, error: targetRoleError } = await supabase
      .from("admin_roles")
      .select("id")
      .eq("user_id", creatorId)
      .eq("role", "global_admin")
      .limit(1)
      .maybeSingle<{ id: string }>();
    if (targetRoleError) throw new Error("Could not verify the creator account.");
    if (targetRole) return jsonResponse(409, { error: "A platform administrator cannot be suspended from this page." });

    const { error: suspendError } = await supabase.auth.admin.updateUserById(creatorId, {
      ban_duration: "876000h",
    });
    if (suspendError) throw new Error("Could not suspend the creator account.");
    return jsonResponse(200, { success: true });
  } catch (error) {
    console.error("Safety admin action failed:", error instanceof Error ? error.message : "Unexpected error.");
    return jsonResponse(500, { error: error instanceof Error ? error.message : "Safety action failed." });
  }
});
