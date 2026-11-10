import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PACKAGE_CATALOG = {
  "2_hours": { amountPesewas: 300, durationHours: 2 },
  "1_day": { amountPesewas: 800, durationHours: 24 },
  "2_days": { amountPesewas: 1400, durationHours: 48 },
  "7_days": { amountPesewas: 3500, durationHours: 168 },
} as const;

interface InitRequest {
  post_id: string;
  package_type: keyof typeof PACKAGE_CATALOG;
  target_school_ids: string[] | null;
}

interface PaystackInitializeResponse {
  status: boolean;
  data?: {
    authorization_url?: string;
    access_code?: string;
    reference?: string;
  };
}

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
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed." });
  }

  const accessToken = request.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!accessToken) return jsonResponse(401, { error: "Authentication is required." });

  let payload: InitRequest;
  try {
    const body: unknown = await request.json();
    if (
      !isRecord(body) ||
      typeof body.post_id !== "string" ||
      !isUuid(body.post_id) ||
      typeof body.package_type !== "string" ||
      !Object.hasOwn(PACKAGE_CATALOG, body.package_type)
    ) {
      return jsonResponse(400, { error: "A valid post and spotlight package are required." });
    }

    const rawTargets = body.target_school_ids;
    if (
      rawTargets !== null &&
      (!Array.isArray(rawTargets) ||
        rawTargets.length === 0 ||
        rawTargets.length > 100 ||
        !rawTargets.every((id) => typeof id === "string" && isUuid(id)))
    ) {
      return jsonResponse(400, { error: "Select all schools or one or more valid SHS communities." });
    }
    const targetIds = rawTargets === null ? null : [...new Set(rawTargets as string[])];
    if (targetIds && targetIds.length !== rawTargets.length) {
      return jsonResponse(400, { error: "Duplicate SHS communities are not allowed." });
    }

    payload = {
      post_id: body.post_id,
      package_type: body.package_type as InitRequest["package_type"],
      target_school_ids: targetIds,
    };
  } catch {
    return jsonResponse(400, { error: "Request body must be valid JSON." });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const paystackSecretKey = Deno.env.get("PAYSTACK_SECRET_KEY");
  if (!supabaseUrl || !serviceRoleKey || !paystackSecretKey) {
    console.error("Required server-side environment configuration is missing.");
    return jsonResponse(500, { error: "Spotlight checkout is not configured." });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const { data: authData, error: authError } = await supabase.auth.getUser(accessToken);
    if (authError || !authData.user) {
      return jsonResponse(401, { error: "Authentication is invalid or expired." });
    }
    const user = authData.user;
    if (!user.email) {
      return jsonResponse(400, { error: "An email address is required for Paystack checkout." });
    }

    const { data: post, error: postError } = await supabase
      .from("posts")
      .select("id, user_id, post_type, status")
      .eq("id", payload.post_id)
      .maybeSingle<{ id: string; user_id: string; post_type: string; status: string }>();
    if (postError) throw new Error("Could not verify the gist.");
    if (!post || post.user_id !== user.id) {
      return jsonResponse(404, { error: "Your gist was not found." });
    }
    if (post.post_type !== "public" || post.status !== "active") {
      return jsonResponse(400, { error: "Only active public gists can be promoted." });
    }

    if (payload.target_school_ids) {
      const { data: schools, error: schoolsError } = await supabase
        .from("schools")
        .select("id")
        .in("id", payload.target_school_ids);
      if (schoolsError) throw new Error("Could not validate selected SHS communities.");
      if ((schools ?? []).length !== payload.target_school_ids.length) {
        return jsonResponse(400, { error: "One or more selected SHS communities do not exist." });
      }
    }

    const packageInfo = PACKAGE_CATALOG[payload.package_type];
    const reference = `lg_spotlight_${crypto.randomUUID()}`;
    const { data: promotion, error: promotionError } = await supabase
      .from("spotlight_promotions")
      .insert({
        post_id: post.id,
        user_id: user.id,
        package_type: payload.package_type,
        duration_hours: packageInfo.durationHours,
        target_school_ids: payload.target_school_ids,
      })
      .select("id")
      .single<{ id: string }>();
    if (promotionError) throw new Error("Could not create spotlight promotion.");

    const { data: payment, error: paymentError } = await supabase
      .from("spotlight_payments")
      .insert({
        user_id: user.id,
        post_id: post.id,
        paystack_reference: reference,
        amount_pesewas: packageInfo.amountPesewas,
        currency: "GHS",
      })
      .select("id")
      .single<{ id: string }>();
    if (paymentError) {
      await supabase
        .from("spotlight_promotions")
        .update({ status: "rejected" })
        .eq("id", promotion.id);
      throw new Error("Could not create spotlight payment.");
    }

    const { error: linkError } = await supabase
      .from("spotlight_promotions")
      .update({ payment_id: payment.id })
      .eq("id", promotion.id);
    if (linkError) throw new Error("Could not link spotlight payment.");

    let paystackResponse: Response;
    try {
      paystackResponse = await fetch("https://api.paystack.co/transaction/initialize", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${paystackSecretKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: user.email,
          amount: packageInfo.amountPesewas,
          currency: "GHS",
          reference,
          metadata: {
            promotion_id: promotion.id,
            post_id: post.id,
            user_id: user.id,
          },
        }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      await Promise.all([
        supabase.from("spotlight_payments").update({ status: "failed" }).eq("id", payment.id),
        supabase.from("spotlight_promotions").update({ status: "rejected" }).eq("id", promotion.id),
      ]);
      if (error instanceof DOMException && error.name === "TimeoutError") {
        return jsonResponse(504, { error: "Paystack checkout timed out. Please try again." });
      }
      return jsonResponse(502, { error: "Paystack checkout is temporarily unavailable." });
    }

    let responseBody: PaystackInitializeResponse | null = null;
    try {
      const parsed: unknown = await paystackResponse.json();
      if (isRecord(parsed) && typeof parsed.status === "boolean") {
        responseBody = parsed as unknown as PaystackInitializeResponse;
      }
    } catch {
      // An invalid gateway response must not be presented as a ready checkout.
    }

    const checkout = responseBody?.data;
    if (
      !paystackResponse.ok ||
      responseBody?.status !== true ||
      !checkout?.authorization_url ||
      !checkout.access_code ||
      checkout.reference !== reference
    ) {
      await Promise.all([
        supabase.from("spotlight_payments").update({ status: "failed" }).eq("id", payment.id),
        supabase.from("spotlight_promotions").update({ status: "rejected" }).eq("id", promotion.id),
      ]);
      return jsonResponse(502, { error: "Paystack could not initialize checkout." });
    }

    return jsonResponse(200, {
      promotion_id: promotion.id,
      authorization_url: checkout.authorization_url,
      access_code: checkout.access_code,
      reference: checkout.reference,
    });
  } catch (error) {
    console.error(
      "Spotlight checkout initialization failed:",
      error instanceof Error ? error.message : "Unexpected server error.",
    );
    return jsonResponse(500, { error: "Spotlight checkout could not be initialized." });
  }
});
