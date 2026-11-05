'use client';

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import PaystackPop from "@paystack/inline-js";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, CheckCircle2, Loader2, ShieldCheck, Sparkles, Zap } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { useGistStore } from "@/store/gistStore";
import { springs } from "@/theme/tokens";
import type { Post } from "@/types/models";
import { cn } from "@/utils/cn";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

const packages = [
  { id: "2_hours", label: "2 Hours", amountPesewas: 300, detail: "Quick visibility boost" },
  { id: "1_day", label: "1 Day", amountPesewas: 800, detail: "A full day in the spotlight" },
  { id: "2_days", label: "2 Days", amountPesewas: 1400, detail: "More time to reach students" },
  { id: "7_days", label: "7 Days", amountPesewas: 3500, detail: "A whole week of visibility" },
] as const;

type PackageType = (typeof packages)[number]["id"];
type TargetMode = "all" | "my-school" | "selected";
type CheckoutState = "idle" | "initializing" | "ready" | "opening" | "moderating" | "success" | "hold" | "error";

interface CheckoutResponse {
  promotion_id: string;
  authorization_url: string;
  access_code: string;
  reference: string;
  error?: string;
}

interface ModerationResponse {
  status: "active" | "flagged" | "pending_moderation";
  error?: string;
  message?: string;
}

interface SpotlightModalProps {
  post: Post;
  onClose: () => void;
}

function formatPrice(amountPesewas: number): string {
  return new Intl.NumberFormat("en-GH", {
    style: "currency",
    currency: "GHS",
    maximumFractionDigits: 2,
  }).format(amountPesewas / 100);
}

export function SpotlightModal({ post, onClose }: SpotlightModalProps) {
  const { user, profile } = useAuth();
  const schools = useGistStore((state) => state.schools);
  const schoolsLoading = useGistStore((state) => state.schoolsLoading);
  const schoolsError = useGistStore((state) => state.schoolsError);
  const loadSchools = useGistStore((state) => state.loadSchools);
  const loadFeed = useGistStore((state) => state.loadFeed);
  const [step, setStep] = useState(1);
  const [packageType, setPackageType] = useState<PackageType>("1_day");
  const [targetMode, setTargetMode] = useState<TargetMode>("my-school");
  const [selectedSchoolIds, setSelectedSchoolIds] = useState<string[]>([]);
  const [safetyConfirmed, setSafetyConfirmed] = useState(false);
  const [checkout, setCheckout] = useState<CheckoutResponse | null>(null);
  const [checkoutState, setCheckoutState] = useState<CheckoutState>("idle");
  const [paymentVerified, setPaymentVerified] = useState(false);
  const [canRetryModeration, setCanRetryModeration] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const paymentBusy = ["initializing", "opening", "moderating"].includes(checkoutState);

  useEffect(() => {
    if (schools.length === 0 && !schoolsLoading) void loadSchools();
  }, [schools.length, schoolsLoading, loadSchools]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !paymentBusy) onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [paymentBusy, onClose]);

  const selectedPackage = packages.find((item) => item.id === packageType) ?? packages[1];
  const chosenSchools = targetMode === "all"
    ? null
    : targetMode === "my-school"
      ? profile?.schoolId ? [profile.schoolId] : null
      : selectedSchoolIds;
  const canContinueFromSchools =
    targetMode === "all" ||
    (targetMode === "my-school" && Boolean(profile?.schoolId)) ||
    (targetMode === "selected" && selectedSchoolIds.length > 0);
  const initializeCheckout = async () => {
    if (!user) {
      setErrorMessage("Sign in to promote a gist.");
      setCheckoutState("error");
      return;
    }
    if (targetMode === "all" || (chosenSchools && chosenSchools.length > 0)) {
      setCheckoutState("initializing");
      setErrorMessage(null);
      try {
        const { data, error } = await supabase.functions.invoke<CheckoutResponse>(
          "init-spotlight-payment",
          {
            body: {
              post_id: post.id,
              package_type: packageType,
              target_school_ids: chosenSchools,
            },
          }
        );
        if (error || !data?.promotion_id || !data.access_code || !data.reference) {
          setErrorMessage(data?.error ?? error?.message ?? "Could not prepare Paystack checkout.");
          setCheckoutState("error");
          return;
        }
        setCheckout(data);
        setCheckoutState("ready");
      } catch {
        setErrorMessage("Could not prepare Paystack checkout.");
        setCheckoutState("error");
      }
      return;
    }
    setErrorMessage("Choose at least one SHS community.");
    setCheckoutState("error");
  };

  const moderatePayment = (reference: string) => {
    if (!checkout) return;
    setPaymentVerified(true);
    setCanRetryModeration(false);
    setCheckoutState("moderating");
    void supabase.functions
      .invoke<ModerationResponse>("moderate-spotlight", {
        body: {
          promotion_id: checkout.promotion_id,
          paystack_reference: reference,
        },
      })
      .then(({ data, error }) => {
        if (error) {
          setErrorMessage(error.message || "Could not complete safety screening.");
          setCheckoutState("error");
        } else if (data?.status === "active") {
          setCheckoutState("success");
          void loadFeed({ silent: true });
        } else if (data?.status === "flagged") {
          setCanRetryModeration(false);
          setCheckoutState("hold");
          setErrorMessage(data.message ?? data.error ?? null);
        } else if (data?.status === "pending_moderation") {
          setCanRetryModeration(true);
          setCheckoutState("hold");
          setErrorMessage(data.message ?? data.error ?? null);
        } else {
          setErrorMessage(data?.error ?? "Could not complete safety screening.");
          setCheckoutState("error");
        }
      })
      .catch(() => {
        setErrorMessage("Could not complete safety screening. Your payment is recorded.");
        setCheckoutState("error");
      });
  };

  const openPaystackCheckout = () => {
    if (!checkout) return;
    if (paymentVerified) {
      moderatePayment(checkout.reference);
      return;
    }
    setErrorMessage(null);
    setCheckoutState("opening");

    try {
      new PaystackPop().resumeTransaction(checkout.access_code, {
        onSuccess: ({ reference }) => {
          if (reference !== checkout.reference) {
            setErrorMessage("Paystack returned a different transaction reference.");
            setCheckoutState("error");
            return;
          }
          moderatePayment(reference);
        },
        onCancel: () => setCheckoutState("ready"),
        onError: ({ message }) => {
          setErrorMessage(message || "Paystack checkout could not be opened.");
          setCheckoutState("error");
        },
      });
    } catch {
      setErrorMessage("Paystack checkout could not be opened.");
      setCheckoutState("error");
    }
  };

  const toggleSchool = (schoolId: string) => {
    setSelectedSchoolIds((current) =>
      current.includes(schoolId)
        ? current.filter((id) => id !== schoolId)
        : [...current, schoolId]
    );
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-80 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget && !paymentBusy) onClose();
        }}
      >
        <motion.section
          role="dialog"
          aria-modal="true"
          aria-labelledby="spotlight-title"
          className="flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-[28px] border-2 border-line bg-card shadow-2xl sm:rounded-[28px]"
          initial={{ y: 30, opacity: 0, scale: 0.98 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 24, opacity: 0, scale: 0.98 }}
          transition={springs.gentle}
        >
          <div className="flex items-start gap-3 border-b-2 border-line px-4 py-4 sm:px-5">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-brand-wash text-brand-deep">
              <Zap size={21} fill="currentColor" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 id="spotlight-title" className="text-base font-black text-ink">Promote your gist</h2>
                <Badge tone="brand" className="px-2 py-0.5 text-[9px]">Step {step} of 4</Badge>
              </div>
              <p className="mt-0.5 truncate text-xs font-semibold text-ink-muted">
                @{post.authorName} · {post.schoolShort}
              </p>
            </div>
            {!paymentBusy && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close spotlight purchase"
                className="flex size-11 shrink-0 items-center justify-center rounded-xl text-ink-muted transition-colors hover:bg-page hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft"
              >
                <span aria-hidden>×</span>
              </button>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
            {step === 1 && (
              <div>
                <h3 className="text-sm font-extrabold text-ink">Choose a spotlight package</h3>
                <p className="mt-1 text-xs font-semibold text-ink-muted">Your gist gets priority placement for the selected period.</p>
                <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {packages.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setPackageType(item.id)}
                      aria-pressed={packageType === item.id}
                      className={cn(
                        "min-w-0 rounded-2xl border-2 p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft",
                        packageType === item.id
                          ? "border-brand bg-brand-wash"
                          : "border-line bg-card hover:border-brand/60"
                      )}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-sm font-black text-ink">{item.label}</span>
                        <span className="text-sm font-black text-brand-deep">{formatPrice(item.amountPesewas)}</span>
                      </span>
                      <span className="mt-1 block text-[11px] font-semibold text-ink-muted">{item.detail}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {step === 2 && (
              <div>
                <h3 className="text-sm font-extrabold text-ink">Choose communities</h3>
                <p className="mt-1 text-xs font-semibold text-ink-muted">Select where your promoted gist should appear.</p>
                <div className="mt-4 space-y-2">
                  {([
                    { id: "all" as const, label: "All Schools", description: "Reach students across every SHS" },
                    { id: "my-school" as const, label: "My School Only", description: profile?.schoolId ? "Show it to your campus" : "Choose specific schools below" },
                    { id: "selected" as const, label: "Choose schools", description: "Select one or more SHS hubs" },
                  ]).map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setTargetMode(option.id)}
                      disabled={option.id === "my-school" && !profile?.schoolId}
                      aria-pressed={targetMode === option.id}
                      className={cn(
                        "flex w-full min-w-0 items-center gap-3 rounded-2xl border-2 p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                        targetMode === option.id ? "border-brand bg-brand-wash" : "border-line bg-card hover:border-brand/60"
                      )}
                    >
                      <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border-2", targetMode === option.id ? "border-brand bg-brand text-white" : "border-line-deep")}>
                        {targetMode === option.id && <Check size={12} strokeWidth={3} aria-hidden />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-extrabold text-ink">{option.label}</span>
                        <span className="mt-0.5 block text-[11px] font-semibold text-ink-muted">{option.description}</span>
                      </span>
                    </button>
                  ))}
                </div>

                {targetMode === "selected" && (
                  <div className="mt-3 max-h-52 space-y-1.5 overflow-y-auto rounded-2xl border-2 border-line bg-page p-2">
                    {schoolsLoading ? (
                      <p className="px-2 py-3 text-xs font-semibold text-ink-muted">Loading SHS communities…</p>
                    ) : schools.length === 0 ? (
                      <p className="px-2 py-3 text-xs font-semibold text-ink-muted">{schoolsError ?? "No SHS communities available."}</p>
                    ) : schools.map((school) => (
                      <label key={school.id} className="flex min-w-0 cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 hover:bg-card">
                        <input
                          type="checkbox"
                          checked={selectedSchoolIds.includes(school.id)}
                          onChange={() => toggleSchool(school.id)}
                          className="size-4 shrink-0 accent-[#8B5CF6]"
                        />
                        <span className="min-w-0 flex-1 truncate text-xs font-bold text-ink">{school.name}</span>
                        <span className="shrink-0 text-[10px] font-semibold text-ink-muted">{school.region}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}

            {step === 3 && (
              <div>
                <h3 className="text-sm font-extrabold text-ink">Safety agreement</h3>
                <div className="mt-4 rounded-2xl border-2 border-warning-soft bg-warning-wash p-3.5">
                  <span className="flex items-start gap-2.5">
                    <AlertTriangle size={18} className="mt-0.5 shrink-0 text-warning-deep" aria-hidden />
                    <span className="text-xs font-bold leading-relaxed text-ink-soft">
                      All promoted gists undergo automated content screening before going live. Flagged or non-compliant content will not be activated.
                    </span>
                  </span>
                </div>
                <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl border-2 border-line bg-page p-3.5">
                  <input
                    type="checkbox"
                    checked={safetyConfirmed}
                    onChange={(event) => setSafetyConfirmed(event.target.checked)}
                    className="mt-0.5 size-4 shrink-0 accent-[#8B5CF6]"
                  />
                  <span className="text-xs font-extrabold leading-relaxed text-ink">
                    I agree to the safety screening and understand flagged promotions may be held for review.
                  </span>
                </label>
              </div>
            )}

            {step === 4 && (
              <div>
                <h3 className="text-sm font-extrabold text-ink">Secure checkout</h3>
                <div className="mt-3 rounded-2xl border-2 border-line bg-page p-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-bold text-ink-muted">{selectedPackage.label} spotlight</span>
                    <span className="text-sm font-black text-ink">{formatPrice(selectedPackage.amountPesewas)}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3 border-t border-line pt-2">
                    <span className="text-[11px] font-semibold text-ink-muted">Communities</span>
                    <span className="truncate text-[11px] font-extrabold text-brand-deep">
                      {targetMode === "all"
                        ? "All Schools"
                        : targetMode === "my-school"
                          ? schools.find((school) => school.id === profile?.schoolId)?.shortName ?? "My School"
                          : `${selectedSchoolIds.length} selected`}
                    </span>
                  </div>
                </div>

                {checkoutState === "initializing" && (
                  <div className="mt-4 flex items-center gap-2 rounded-2xl border-2 border-brand/30 bg-brand-wash p-3 text-xs font-bold text-brand-deep" role="status">
                    <Loader2 size={16} className="animate-spin" aria-hidden />
                    Preparing secure checkout…
                  </div>
                )}
                {checkoutState === "ready" && (
                  <div className="mt-4 rounded-2xl border-2 border-success-soft bg-success-wash p-3 text-xs font-bold text-success-deep">
                    Checkout is ready. Continue to open Paystack securely.
                  </div>
                )}
                {checkoutState === "opening" && (
                  <div className="mt-4 flex items-center gap-2 rounded-2xl border-2 border-brand/30 bg-brand-wash p-3 text-xs font-bold text-brand-deep" role="status">
                    <Loader2 size={16} className="animate-spin" aria-hidden />
                    Opening Paystack checkout…
                  </div>
                )}
                {checkoutState === "moderating" && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-4 flex items-center gap-2.5 rounded-2xl border-2 border-brand/30 bg-brand-wash p-3.5 text-xs font-extrabold text-brand-deep"
                    role="status"
                    aria-live="polite"
                  >
                    <Loader2 size={18} className="shrink-0 animate-spin" aria-hidden />
                    Screening your gist for safety…
                  </motion.div>
                )}
                {checkoutState === "success" && (
                  <div className="mt-4 rounded-2xl border-2 border-success-soft bg-success-wash p-4 text-center">
                    <CheckCircle2 size={28} className="mx-auto text-success-deep" aria-hidden />
                    <p className="mt-2 text-sm font-black text-success-deep">Your gist is in the spotlight!</p>
                    <p className="mt-1 text-xs font-semibold text-ink-muted">Payment verified and safety screening passed.</p>
                  </div>
                )}
                {checkoutState === "hold" && (
                  <div className="mt-4 rounded-2xl border-2 border-warning-soft bg-warning-wash p-4">
                    <p className="flex items-center gap-2 text-sm font-black text-warning-deep">
                      <ShieldCheck size={18} aria-hidden />Promotion on hold
                    </p>
                    <p className="mt-1 text-xs font-semibold leading-relaxed text-ink-soft">
                      {errorMessage ?? "Your promotion needs manual review and will not go live yet."}
                    </p>
                  </div>
                )}
                {errorMessage && checkoutState !== "hold" && (
                  <p className="mt-3 rounded-xl border-2 border-danger-soft bg-danger-wash px-3 py-2.5 text-xs font-bold text-danger-deep" role="alert">
                    {errorMessage}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t-2 border-line bg-card px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:px-5 sm:pb-3">
            {step > 1 && step < 4 ? (
              <Button variant="outline" size="sm" onClick={() => setStep((current) => current - 1)} leftIcon={<ArrowLeft size={14} aria-hidden />}>
                Back
              </Button>
            ) : step === 1 ? (
              <button type="button" onClick={onClose} className="px-2 py-2 text-xs font-extrabold text-ink-muted hover:text-ink">Cancel</button>
            ) : checkoutState === "success" || checkoutState === "hold" ? (
              <span className="text-[11px] font-semibold text-ink-muted">Payment processed</span>
            ) : (
              <Button variant="outline" size="sm" disabled={paymentBusy || Boolean(checkout)} onClick={() => setStep(3)} leftIcon={<ArrowLeft size={14} aria-hidden />}>
                Back
              </Button>
            )}

            {step < 3 && (
              <Button
                size="sm"
                onClick={() => setStep((current) => current + 1)}
                disabled={step === 2 && !canContinueFromSchools}
                rightIcon={<ArrowRight size={14} aria-hidden />}
              >
                Continue
              </Button>
            )}
            {step === 3 && (
              <Button
                size="sm"
                disabled={!safetyConfirmed}
                onClick={() => {
                  setStep(4);
                  setCheckoutState("idle");
                  setErrorMessage(null);
                }}
                rightIcon={<ArrowRight size={14} aria-hidden />}
              >
                Agree &amp; continue
              </Button>
            )}
            {step === 4 && checkoutState !== "success" && checkoutState !== "hold" && (
              checkout && (checkoutState === "ready" || checkoutState === "error") ? (
                <Button size="sm" onClick={openPaystackCheckout} leftIcon={<Sparkles size={14} aria-hidden />}>
                  {paymentVerified ? "Retry safety screening" : "Pay with Paystack"}
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() => void initializeCheckout()}
                  disabled={paymentBusy}
                  loading={checkoutState === "initializing"}
                  leftIcon={<Sparkles size={14} aria-hidden />}
                >
                  {checkoutState === "error" ? "Try again" : "Continue to payment"}
                </Button>
              )
            )}
            {step === 4 && (checkoutState === "success" || checkoutState === "hold") && (
              <>
                {checkoutState === "hold" && canRetryModeration && checkout && (
                  <Button size="sm" onClick={() => moderatePayment(checkout.reference)}>
                    Retry screening
                  </Button>
                )}
                <Button size="sm" onClick={onClose}>Done</Button>
              </>
            )}
          </div>
        </motion.section>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
