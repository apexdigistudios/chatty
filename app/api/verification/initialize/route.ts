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
      .select("is_admin, role, is_verified, is_ambassador, verified_expires_at")
      .eq("id", user.id)
      .maybeSingle<{
        is_admin: boolean | null;
        role: string | null;
        is_verified: boolean | null;
        is_ambassador: boolean;
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
    if (profile.is_ambassador) {
      return NextResponse.json({ error: "Campus ambassadors receive verification automatically." }, { status: 409 });
    }
    if (
      profile.is_verified &&
      profile.verified_expires_at &&
      Date.parse(profile.verified_expires_at) > Date.now()
    ) {
      return NextResponse.json({ error: "Your verification is already active." }, { status: 409 });
    }

    const { data: followerRecord, error: followerError } = await service
      .from("profile_follow_counts")
      .select("followers_count")
      .eq("profile_id", user.id)
      .maybeSingle<{ followers_count: number }>();
    if (followerError) throw new Error("Could not check your follower eligibility.");
    const followerCount = followerRecord?.followers_count ?? 0;
    if (followerCount < 5000) {
      return NextResponse.json({
        error: "Verification requires at least 5,000 followers or campus ambassador status.",
        followerCount,
        requiredFollowers: 5000,
      }, { status: 403 });
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
