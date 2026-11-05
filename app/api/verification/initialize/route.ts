import { NextResponse } from "next/server";
import {
  authenticateVerificationRequest,
  createVerificationServiceClient,
  initializePaystackTransaction,
} from "@/lib/paystack";
import { isGlobalAdminProfile } from "@/lib/verification";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await authenticateVerificationRequest(request);
    if (!user?.email) return NextResponse.json({ error: "Sign in with an email to continue." }, { status: 401 });

    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || !("title" in body)) {
      return NextResponse.json({ error: "Enter a valid account title." }, { status: 400 });
    }
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (title.length > 40) return NextResponse.json({ error: "Titles must be 40 characters or fewer." }, { status: 400 });

    const service = createVerificationServiceClient();
    const { data: profile, error: profileError } = await service
      .from("profiles")
      .select("is_admin, role, is_verified, verified_expires_at")
      .eq("id", user.id)
      .maybeSingle<{
        is_admin: boolean | null;
        role: string | null;
        is_verified: boolean | null;
        verified_expires_at: string | null;
      }>();
    if (profileError) throw new Error("Could not check the account verification status.");
    if (!profile) return NextResponse.json({ error: "Your profile could not be found." }, { status: 404 });
    const { data: adminRoles, error: adminRolesError } = await service
      .from("admin_roles")
      .select("role")
      .eq("user_id", user.id)
      .in("role", ["admin", "global_admin"]);
    if (adminRolesError) throw new Error("Could not check the account admin status.");
    if (
      isGlobalAdminProfile({ isAdmin: profile.is_admin, role: profile.role }) ||
      Boolean(adminRoles?.length)
    ) {
      return NextResponse.json({ error: "Global admin accounts are verified automatically." }, { status: 409 });
    }
    if (
      profile.is_verified &&
      profile.verified_expires_at &&
      Date.parse(profile.verified_expires_at) > Date.now()
    ) {
      return NextResponse.json({ error: "Your verification is already active." }, { status: 409 });
    }

    const reference = `VER-${crypto.randomUUID().replace(/-/g, "")}`;
    const { error: insertError } = await service.from("subscriptions").insert({
      user_id: user.id,
      paystack_reference: reference,
      amount: 50,
      currency: "GHS",
      status: "pending",
      title: title || null,
    });
    if (insertError) throw new Error("Could not create the verification payment record.");

    try {
      const checkout = await initializePaystackTransaction({
        email: user.email,
        reference,
        title,
        userId: user.id,
      });
      return NextResponse.json({ ...checkout, reference });
    } catch (error) {
      const { error: updateError } = await service
        .from("subscriptions")
        .update({ status: "failed" })
        .eq("paystack_reference", reference)
        .eq("user_id", user.id);
      if (updateError) console.error("Could not mark the failed verification payment.", updateError);
      throw error;
    }
  } catch (error) {
    console.error("Could not initialize verification checkout.", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not initialize checkout." },
      { status: 500 }
    );
  }
}
