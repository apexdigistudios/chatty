import { NextResponse } from "next/server";
import {
  authenticateVerificationRequest,
  createVerificationServiceClient,
  verifyPaystackTransaction,
} from "@/lib/paystack";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await authenticateVerificationRequest(request);
    if (!user?.email) return NextResponse.json({ error: "Sign in to verify this payment." }, { status: 401 });

    const body: unknown = await request.json();
    const reference =
      body && typeof body === "object" && "reference" in body && typeof body.reference === "string"
        ? body.reference
        : "";
    if (!/^[A-Za-z0-9._-]{1,100}$/.test(reference)) {
      return NextResponse.json({ error: "A valid payment reference is required." }, { status: 400 });
    }

    const service = createVerificationServiceClient();
    const { data: subscription, error: subscriptionError } = await service
      .from("subscriptions")
      .select("user_id, paystack_reference, amount, currency, status, title")
      .eq("paystack_reference", reference)
      .maybeSingle<{
        user_id: string;
        paystack_reference: string;
        amount: number;
        currency: string;
        status: string;
        title: string | null;
      }>();
    if (subscriptionError) throw new Error("Could not find the verification payment.");
    if (!subscription || subscription.user_id !== user.id) {
      return NextResponse.json({ error: "This payment does not belong to your account." }, { status: 404 });
    }
    if (Number(subscription.amount) !== 50 || subscription.currency !== "GHS") {
      return NextResponse.json({ error: "The payment amount does not match verification." }, { status: 400 });
    }

    const payment = await verifyPaystackTransaction(reference);
    if (
      payment.status !== "success" ||
      payment.reference !== subscription.paystack_reference ||
      payment.amount !== 5000 ||
      payment.currency !== "GHS" ||
      payment.customer.email.toLowerCase() !== user.email.toLowerCase()
    ) {
      return NextResponse.json({ error: "Paystack has not confirmed the expected payment." }, { status: 402 });
    }

    const { data: expiresAt, error: activationError } = await service.rpc(
      "activate_verification_subscription",
      {
        p_user_id: user.id,
        p_reference: reference,
      }
    );
    if (activationError || typeof expiresAt !== "string") {
      console.error("Could not activate the verified subscription.", activationError);
      throw new Error("Payment was confirmed, but verification could not be activated. Please contact support.");
    }
    if (Date.parse(expiresAt) <= Date.now()) {
      return NextResponse.json({ error: "This transaction has already been applied and its verification period has ended." }, { status: 409 });
    }

    return NextResponse.json({ status: "active", expires_at: expiresAt });
  } catch (error) {
    console.error("Could not verify the Paystack transaction.", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not verify this payment." },
      { status: 500 }
    );
  }
}
