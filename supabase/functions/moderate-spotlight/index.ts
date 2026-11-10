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

interface RequestPayload {
  promotion_id: string;
  paystack_reference: string;
}

interface SpotlightPromotion {
  id: string;
  post_id: string;
  user_id: string;
  payment_id: string | null;
  package_type: string;
  duration_hours: number;
  status: string;
}

interface SpotlightPayment {
  id: string;
  user_id: string;
  post_id: string;
  paystack_reference: string;
  amount_pesewas: number;
  currency: string;
  status: string;
}

interface PostContent {
  content: string;
  media_url: string | null;
}

interface PaystackVerification {
  status: boolean;
  data?: {
    status?: string;
    amount?: number;
    currency?: string;
    reference?: string;
  };
}

interface ModerationCategoryFlags {
  [category: string]: boolean;
}

interface ModerationCategoryScores {
  [category: string]: number;
}

interface ModerationResult {
  flagged: boolean;
  categories: ModerationCategoryFlags;
  category_scores: ModerationCategoryScores;
}

interface OpenAIModerationResponse {
  results?: ModerationResult[];
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

function supportedImageUrl(value: string | null, supabaseUrl: string): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    const storageOrigin = new URL(supabaseUrl);
    return (
      url.protocol === "https:" &&
      url.origin === storageOrigin.origin &&
      /\.(?:jpe?g|png|gif|webp)$/i.test(url.pathname)
    );
  } catch {
    return false;
  }
}

async function updatePaymentAndPromotionFailure(
  supabase: ReturnType<typeof createClient>,
  paymentId: string,
  promotionId: string,
): Promise<void> {
  const { error: paymentError } = await supabase
    .from("spotlight_payments")
    .update({ status: "failed" })
    .eq("id", paymentId);
  if (paymentError) throw new Error("Could not update spotlight payment status.");

  const { error: promotionError } = await supabase
    .from("spotlight_promotions")
    .update({ status: "rejected" })
    .eq("id", promotionId);
  if (promotionError) throw new Error("Could not reject spotlight promotion.");
}

function isModerationResult(value: unknown): value is ModerationResult {
  if (!isRecord(value) || typeof value.flagged !== "boolean") return false;
  if (!isRecord(value.categories) || !isRecord(value.category_scores)) return false;
  return (
    Object.values(value.categories).every((flag) => typeof flag === "boolean") &&
    Object.values(value.category_scores).every(
      (score) => typeof score === "number" && Number.isFinite(score),
    )
  );
}

async function captureOpenAIModeration(input: {
  userId: string;
  traceId: string;
  requestInput: Array<Record<string, unknown>>;
  latencySeconds: number;
  httpStatus?: number;
  result?: ModerationResult;
  error?: string;
}): Promise<void> {
  const key = Deno.env.get("NEXT_PUBLIC_POSTHOG_KEY");
  const host = Deno.env.get("NEXT_PUBLIC_POSTHOG_HOST");
  if (!key || !host) {
    if (Deno.env.get("NODE_ENV") !== "production") {
      if (!key) {
        console.warn("NEXT_PUBLIC_POSTHOG_KEY variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once NEXT_PUBLIC_POSTHOG_KEY is configured");
      }
      if (!host) {
        console.warn("NEXT_PUBLIC_POSTHOG_HOST variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once NEXT_PUBLIC_POSTHOG_HOST is configured");
      }
    }
    return;
  }

  try {
    await fetch(`${host.replace(/\/$/, "")}/i/v0/e/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: key,
        event: "$ai_generation",
        properties: {
          distinct_id: input.userId,
          $ai_trace_id: input.traceId,
          $ai_session_id: `moderation:${input.userId}`,
          $ai_span_id: crypto.randomUUID(),
          $ai_span_name: "openai_moderation",
          $ai_model: "omni-moderation-latest",
          $ai_provider: "openai",
          $ai_input: [{ role: "user", content: input.requestInput }],
          $ai_output_choices: input.result
            ? [{ role: "assistant", content: JSON.stringify(input.result) }]
            : [],
          $ai_latency: input.latencySeconds,
          ...(input.httpStatus ? { $ai_http_status: input.httpStatus } : {}),
          ...(input.error ? { $ai_is_error: true, $ai_error: input.error } : {}),
        },
      }),
      signal: AbortSignal.timeout(2_000),
    });
  } catch {
    console.warn("PostHog AI Observability capture failed.");
  }
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed." });
  }

  const authorization = request.headers.get("Authorization");
  const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!accessToken) {
    return jsonResponse(401, { error: "Authentication is required." });
  }

  let payload: RequestPayload;
  try {
    const body: unknown = await request.json();
    if (
      !isRecord(body) ||
      typeof body.promotion_id !== "string" ||
      !isUuid(body.promotion_id) ||
      typeof body.paystack_reference !== "string" ||
      body.paystack_reference.length < 1 ||
      body.paystack_reference.length > 100 ||
      !/^[A-Za-z0-9._-]+$/.test(body.paystack_reference)
    ) {
      return jsonResponse(400, { error: "A valid promotion ID and Paystack reference are required." });
    }
    payload = {
      promotion_id: body.promotion_id,
      paystack_reference: body.paystack_reference,
    };
  } catch {
    return jsonResponse(400, { error: "Request body must be valid JSON." });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const paystackSecretKey = Deno.env.get("PAYSTACK_SECRET_KEY");
  const openAiApiKey = Deno.env.get("OPENAI_API_KEY");
  if (!supabaseUrl || !serviceRoleKey || !paystackSecretKey || !openAiApiKey) {
    console.error("Required server-side environment configuration is missing.");
    return jsonResponse(500, { error: "Spotlight verification is not configured." });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const { data: authData, error: authError } = await supabase.auth.getUser(accessToken);
    if (authError || !authData.user) {
      return jsonResponse(401, { error: "Authentication is invalid or expired." });
    }
    const userId = authData.user.id;

    const { data: promotion, error: promotionError } = await supabase
      .from("spotlight_promotions")
      .select("id, post_id, user_id, payment_id, package_type, duration_hours, status")
      .eq("id", payload.promotion_id)
      .maybeSingle<SpotlightPromotion>();
    if (promotionError) throw new Error("Could not load spotlight promotion.");
    if (!promotion || promotion.user_id !== userId) {
      return jsonResponse(404, { error: "Spotlight promotion was not found." });
    }
    if (!promotion.payment_id) {
      return jsonResponse(409, { error: "Spotlight promotion has no associated payment." });
    }
    if (!["pending_payment", "pending_moderation"].includes(promotion.status)) {
      return jsonResponse(409, { error: "Spotlight promotion is not awaiting verification or moderation." });
    }

    const { data: payment, error: paymentError } = await supabase
      .from("spotlight_payments")
      .select("id, user_id, post_id, paystack_reference, amount_pesewas, currency, status")
      .eq("id", promotion.payment_id)
      .maybeSingle<SpotlightPayment>();
    if (paymentError) throw new Error("Could not load spotlight payment.");
    if (
      !payment ||
      payment.user_id !== userId ||
      payment.post_id !== promotion.post_id ||
      payment.paystack_reference !== payload.paystack_reference
    ) {
      return jsonResponse(404, { error: "Matching Paystack payment was not found." });
    }

    const packageInfo = PACKAGE_CATALOG[promotion.package_type as keyof typeof PACKAGE_CATALOG];
    if (!packageInfo) {
      return jsonResponse(400, { error: "Spotlight package is not supported." });
    }
    if (promotion.duration_hours !== packageInfo.durationHours) {
      return jsonResponse(400, { error: "Spotlight duration does not match the selected package." });
    }

    let paystackResponse: Response;
    try {
      paystackResponse = await fetch(
        `https://api.paystack.co/transaction/verify/${encodeURIComponent(payment.paystack_reference)}`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${paystackSecretKey}` },
          signal: AbortSignal.timeout(15_000),
        },
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === "TimeoutError") {
        return jsonResponse(504, { error: "Payment verification timed out. Please try again." });
      }
      return jsonResponse(502, { error: "Payment verification is temporarily unavailable." });
    }
    if (!paystackResponse.ok) {
      return jsonResponse(502, { error: "Payment verification is temporarily unavailable." });
    }

    let paystackBody: PaystackVerification | null = null;
    try {
      const parsed: unknown = await paystackResponse.json();
      if (isRecord(parsed) && typeof parsed.status === "boolean") {
        paystackBody = parsed as unknown as PaystackVerification;
      }
    } catch {
      // Treat an unparseable gateway response as a failed verification.
    }

    const verifiedTransaction = paystackBody?.data;
    const paymentIsValid =
      paystackBody?.status === true &&
      verifiedTransaction?.status === "success" &&
      verifiedTransaction.reference === payment.paystack_reference &&
      verifiedTransaction.amount === packageInfo.amountPesewas &&
      verifiedTransaction.amount === payment.amount_pesewas &&
      verifiedTransaction.currency === "GHS" &&
      payment.currency === "GHS";

    if (!paymentIsValid) {
      await updatePaymentAndPromotionFailure(supabase, payment.id, promotion.id);
      return jsonResponse(402, { error: "Paystack payment failed verification." });
    }

    const { error: verifiedPaymentError } = await supabase
      .from("spotlight_payments")
      .update({ status: "success", verified_at: new Date().toISOString() })
      .eq("id", payment.id);
    if (verifiedPaymentError) throw new Error("Could not save verified payment.");

    const { error: moderationStatusError } = await supabase
      .from("spotlight_promotions")
      .update({ status: "pending_moderation" })
      .eq("id", promotion.id);
    if (moderationStatusError) throw new Error("Could not set moderation hold.");

    const { data: post, error: postError } = await supabase
      .from("posts")
      .select("content, media_url")
      .eq("id", promotion.post_id)
      .maybeSingle<PostContent>();
    if (postError) throw new Error("Could not load post content for moderation.");
    if (!post) {
      return jsonResponse(404, { error: "Spotlight post was not found." });
    }

    const input: Array<Record<string, unknown>> = [
      { type: "text", text: post.content },
    ];
    if (supportedImageUrl(post.media_url, supabaseUrl)) {
      input.push({ type: "image_url", image_url: { url: post.media_url } });
    }

    const moderationTraceId = crypto.randomUUID();
    const moderationStartedAt = performance.now();
    let moderationResponse: Response;
    try {
      moderationResponse = await fetch("https://api.openai.com/v1/moderations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openAiApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model: "omni-moderation-latest", input }),
        signal: AbortSignal.timeout(20_000),
      });
    } catch (error) {
      await captureOpenAIModeration({
        userId,
        traceId: moderationTraceId,
        requestInput: input,
        latencySeconds: (performance.now() - moderationStartedAt) / 1_000,
        error: "OpenAI moderation request failed.",
      });
      if (error instanceof DOMException && error.name === "TimeoutError") {
        return jsonResponse(200, {
          status: "pending_moderation",
          error: "Automated moderation timed out. The promotion remains on hold.",
        });
      }
      return jsonResponse(200, {
        status: "pending_moderation",
        error: "Automated moderation is temporarily unavailable. The promotion remains on hold.",
      });
    }

    let moderationBody: OpenAIModerationResponse | null = null;
    try {
      const parsed: unknown = await moderationResponse.json();
      if (isRecord(parsed) && Array.isArray(parsed.results)) {
        moderationBody = parsed as unknown as OpenAIModerationResponse;
      }
    } catch {
      // A malformed moderation response must never activate the promotion.
    }

    const moderationResult: unknown = moderationBody?.results?.[0];
    if (!moderationResponse.ok || !isModerationResult(moderationResult)) {
      await captureOpenAIModeration({
        userId,
        traceId: moderationTraceId,
        requestInput: input,
        latencySeconds: (performance.now() - moderationStartedAt) / 1_000,
        httpStatus: moderationResponse.status,
        error: "OpenAI moderation did not return a valid result.",
      });
      return jsonResponse(200, {
        status: "pending_moderation",
        error: "Automated moderation did not complete. The promotion remains on hold.",
      });
    }

    await captureOpenAIModeration({
      userId,
      traceId: moderationTraceId,
      requestInput: input,
      latencySeconds: (performance.now() - moderationStartedAt) / 1_000,
      httpStatus: moderationResponse.status,
      result: moderationResult,
    });

    const isFlagged =
      moderationResult.flagged ||
      Object.values(moderationResult.categories).some(Boolean);
    const { error: logError } = await supabase.from("moderation_logs").insert({
      post_id: promotion.post_id,
      promotion_id: promotion.id,
      provider: "openai-omni-moderation-latest",
      is_flagged: isFlagged,
      flagged_categories: moderationResult.categories,
      category_scores: moderationResult.category_scores,
    });
    if (logError) throw new Error("Could not save moderation result.");

    if (isFlagged) {
      const { error: flaggedUpdateError } = await supabase
        .from("spotlight_promotions")
        .update({ status: "flagged" })
        .eq("id", promotion.id);
      if (flaggedUpdateError) throw new Error("Could not flag spotlight promotion.");
      return jsonResponse(200, {
        status: "flagged",
        message: "Promotion is on hold for manual review.",
      });
    }

    const { data: activationData, error: activationError } = await supabase.rpc(
      "activate_spotlight_promotion",
      { p_promotion_id: promotion.id },
    );
    if (activationError) throw new Error("Could not activate spotlight promotion.");
    const activation = Array.isArray(activationData) ? activationData[0] : activationData;
    if (
      !isRecord(activation) ||
      typeof activation.started_at !== "string" ||
      typeof activation.expires_at !== "string"
    ) {
      throw new Error("Promotion activation returned invalid timing metadata.");
    }

    return jsonResponse(200, {
      status: "active",
      started_at: activation.started_at,
      expires_at: activation.expires_at,
    });
  } catch (error) {
    console.error(
      "Spotlight verification failed:",
      error instanceof Error ? error.message : "Unexpected server error.",
    );
    return jsonResponse(500, { error: "Spotlight verification could not be completed." });
  }
});
