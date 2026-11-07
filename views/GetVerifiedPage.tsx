'use client';

import { useState } from "react";
import { BadgeCheck, BriefcaseBusiness, Loader2, TrendingUp } from "lucide-react";
import { Link, useNavigate } from "@/lib/router";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { hasActiveVerification, isGlobalAdminProfile } from "@/lib/verification";
import { VerifiedBadge } from "@/components/profile/VerifiedBadge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";

interface CheckoutResponse {
  access_code: string;
  reference: string;
  error?: string;
}

interface VerificationResponse {
  status?: string;
  expires_at?: string;
  error?: string;
}

type CheckoutState = "idle" | "initializing" | "opening" | "verifying";

const BENEFITS = [
  { icon: BadgeCheck, title: "Verified badge", description: "A distinct verified mark beside your name." },
  { icon: BriefcaseBusiness, title: "Custom account title", description: "Show your role, work, or campus title." },
  { icon: TrendingUp, title: "Post feed boost", description: "Verified posts receive ranking priority in the feed." },
  { icon: BriefcaseBusiness, title: "Brand deals & partnerships", description: "Unlock the Brand Deals hub on your profile." },
];

export function GetVerifiedPage() {
  const { user, profile, isGlobalAdmin, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [checkoutState, setCheckoutState] = useState<CheckoutState>("idle");
  const [checkout, setCheckout] = useState<CheckoutResponse | null>(null);
  const [verificationRetry, setVerificationRetry] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const verified = hasActiveVerification({
    isVerified: profile?.isVerified,
    verifiedExpiresAt: profile?.verifiedExpiresAt,
    isAdmin: profile?.isAdmin || isGlobalAdmin,
    role: profile?.role,
  });

  const accessToken = async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw new Error(error.message);
    if (!data.session?.access_token) throw new Error("Please sign in to continue.");
    return data.session.access_token;
  };

  const openPaystackCheckout = async (preparedCheckout: CheckoutResponse) => {
    setCheckoutState("opening");
    try {
      const { default: PaystackPop } = await import("@paystack/inline-js");
      new PaystackPop().resumeTransaction(preparedCheckout.access_code, {
        onSuccess: ({ reference }) => {
          if (reference !== preparedCheckout.reference) {
            setErrorMessage("Paystack returned a different transaction reference.");
            setCheckoutState("idle");
            return;
          }
          void verifyPayment(reference);
        },
        onCancel: () => setCheckoutState("idle"),
        onError: ({ message }) => {
          setErrorMessage(message || "Paystack checkout could not be opened.");
          setCheckoutState("idle");
        },
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Paystack checkout could not be opened.");
      setCheckoutState("idle");
    }
  };

  const startCheckout = async () => {
    if (!user) {
      navigate("/login?returnTo=%2Fget-verified");
      return;
    }
    if (verificationRetry) {
      void verifyPayment(verificationRetry);
      return;
    }
    if (checkout) {
      setErrorMessage(null);
      openPaystackCheckout(checkout);
      return;
    }

    setCheckoutState("initializing");
    setErrorMessage(null);
    try {
      const token = await accessToken();
      const response = await fetch("/api/verification/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: title.trim() }),
      });
      const checkout = await response.json() as CheckoutResponse;
      if (!response.ok || !checkout.access_code || !checkout.reference) {
        throw new Error(checkout.error ?? "Could not prepare secure checkout.");
      }
      setCheckout(checkout);
      openPaystackCheckout(checkout);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not start checkout.");
      setCheckoutState("idle");
    }
  };

  const verifyPayment = async (reference: string) => {
    setCheckoutState("verifying");
    setErrorMessage(null);
    try {
      const token = await accessToken();
      const response = await fetch("/api/verification/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reference }),
      });
      const result = await response.json() as VerificationResponse;
      if (!response.ok || result.status !== "active" || !result.expires_at) {
        throw new Error(result.error ?? "Payment could not be verified.");
      }
      await refreshProfile();
      setCheckout(null);
      setVerificationRetry(null);
      setCheckoutState("idle");
      toast("Your account is now verified.", "success");
      navigate("/profile");
    } catch (error) {
      setVerificationRetry(reference);
      setCheckoutState("idle");
      setErrorMessage(error instanceof Error ? error.message : "Payment could not be verified.");
    }
  };

  return (
    <div className="mx-auto w-full max-w-[740px] px-4 pb-10 pt-6 sm:px-6 sm:pt-8">
      <Card className="overflow-hidden">
        <div className="bg-linear-to-br from-[#8B5CF6] via-[#6D28D9] to-[#0F0F11] px-5 py-7 text-white sm:px-7">
          <div className="flex items-center gap-2 text-sm font-black">
            <BadgeCheck size={19} aria-hidden />
            Gist me Verified
          </div>
          <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">Stand out. Get discovered.</h1>
          <p className="mt-2 max-w-xl text-sm font-semibold leading-relaxed text-white/80">
            Get a verified badge, a custom account title, added feed visibility, and access to brand partnerships.
          </p>
        </div>
        <CardBody className="p-5 sm:p-7">
          {verified ? (
            <div className="rounded-2xl border-2 border-sky-500/20 bg-sky-500/5 p-4">
              <div className="flex items-center gap-2 text-sm font-black text-ink">
                You’re verified
                <VerifiedBadge
                  isVerified={profile?.isVerified}
                  verifiedExpiresAt={profile?.verifiedExpiresAt}
                  verifiedTitle={profile?.verifiedTitle}
                  isAdmin={profile?.isAdmin || isGlobalAdmin}
                  role={profile?.role}
                  showTitle
                />
              </div>
              {profile?.verifiedExpiresAt && !isGlobalAdminProfile({
                isAdmin: profile.isAdmin || isGlobalAdmin,
                role: profile.role,
              }) && (
                <p className="mt-2 text-xs font-semibold text-ink-muted">
                  Active until {new Date(profile.verifiedExpiresAt).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </p>
              )}
              {isGlobalAdmin && <p className="mt-2 text-xs font-semibold text-ink-muted">Global admins receive verification automatically.</p>}
              <Link to="/profile" className="mt-3 inline-flex text-xs font-extrabold text-brand-deep hover:underline">
                View your profile
              </Link>
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                {BENEFITS.map(({ icon: Icon, title: benefitTitle, description }) => (
                  <div key={benefitTitle} className="flex gap-3 rounded-2xl border-2 border-line bg-page p-3.5">
                    <Icon size={18} className="mt-0.5 shrink-0 text-brand-deep" aria-hidden />
                    <div>
                      <p className="text-xs font-black text-ink">{benefitTitle}</p>
                      <p className="mt-1 text-[11px] font-semibold leading-relaxed text-ink-muted">{description}</p>
                    </div>
                  </div>
                ))}
              </div>

              <label className="mt-5 block">
                <span className="mb-1.5 block text-xs font-extrabold text-ink">Account title <span className="font-semibold text-ink-muted">(optional)</span></span>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value.slice(0, 40))}
                  maxLength={40}
                  placeholder="e.g. School Prefect"
                  className="h-12 w-full rounded-xl border-2 border-line bg-card px-3 text-sm font-semibold text-ink outline-none focus:border-brand"
                />
                <span className="mt-1 block text-right text-[10px] font-semibold text-ink-muted">{title.length}/40</span>
              </label>

              <div className="mt-4 flex flex-wrap items-end justify-between gap-3 rounded-2xl border-2 border-brand/20 bg-brand-wash p-4">
                <div>
                  <p className="text-xs font-extrabold text-brand-deep">2-month subscription</p>
                  <p className="mt-1 text-2xl font-black text-ink">GH₵50</p>
                  <p className="mt-0.5 text-[10px] font-semibold text-ink-muted">Valid for 60 days after successful payment</p>
                </div>
                <Button
                  onClick={() => void startCheckout()}
                  disabled={checkoutState !== "idle"}
                  leftIcon={checkoutState !== "idle" ? <Loader2 size={16} className="animate-spin" aria-hidden /> : undefined}
                >
                  {checkoutState === "initializing" ? "Preparing checkout…" :
                    checkoutState === "opening" ? "Opening Paystack…" :
                      checkoutState === "verifying" ? "Verifying payment…" :
                        verificationRetry ? "Retry payment verification" :
                          checkout ? "Continue with Paystack" :
                            user ? "Pay securely with Paystack" : "Sign in to get verified"}
                </Button>
              </div>
            </>
          )}

          {errorMessage && (
            <p role="alert" className="mt-4 rounded-xl border-2 border-danger-soft bg-danger-wash px-3 py-2.5 text-xs font-bold text-danger-deep">
              {errorMessage}
            </p>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
