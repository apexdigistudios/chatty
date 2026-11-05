'use client';

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useNavigate } from "@/lib/router";
import { EyeOff, GraduationCap, LogIn, Sparkles, X } from "lucide-react";
import { useAuthGateStore } from "@/store/authGateStore";
import { useGistStore } from "@/store/gistStore";
import { springs } from "@/theme/tokens";
import { Button } from "@/components/ui/Button";
import { MascotCharacter } from "@/components/auth/MascotCharacter";

/**
 * Contextual Auth Gate Modal shown only when an unauthenticated visitor attempts
 * an authorship action (liking, commenting, posting, confessing, or joining a school).
 */
export function AuthGateModal() {
  const navigate = useNavigate();
  const open = useAuthGateStore((state) => state.open);
  const payload = useAuthGateStore((state) => state.payload);
  const closeAuthGate = useAuthGateStore((state) => state.closeAuthGate);
  const setComposerIntent = useGistStore((state) => state.setComposerIntent);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeAuthGate();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, closeAuthGate]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const goToAuth = (mode: "signup" | "signin") => {
    if (payload.prefillSchoolId) {
      setComposerIntent("gist", payload.prefillSchoolId);
    }
    const params = new URLSearchParams();
    params.set("mode", mode);
    if (payload.returnTo && payload.returnTo !== "/auth") {
      params.set("returnTo", payload.returnTo);
    }
    if (payload.prefillSchoolId) {
      params.set("schoolId", payload.prefillSchoolId);
    }
    closeAuthGate();
    navigate(`/auth?${params.toString()}`);
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div
          key="auth-gate-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="auth-gate-title"
          className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={closeAuthGate}
            className="absolute inset-0 bg-black/65 backdrop-blur-xs"
            aria-hidden
          />

          {/* Chunky Duolingo-style Card */}
          <motion.div
            initial={{ opacity: 0, y: 48, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 36, scale: 0.96 }}
            transition={springs.bouncy}
            className="relative z-10 max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-[30px] border-t-2 border-line bg-card p-5 text-ink shadow-2xl sm:rounded-3xl sm:border-2 sm:p-6"
            style={{
              paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))",
            }}
          >
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-line sm:hidden" aria-hidden />

            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="inline-flex items-center gap-1 rounded-full bg-brand-wash px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-brand-deep">
                  <Sparkles size={11} strokeWidth={2.8} aria-hidden />
                  Student Pass Required
                </span>
                <h2
                  id="auth-gate-title"
                  className="mt-1.5 text-xl font-black tracking-tight text-ink sm:text-2xl"
                >
                  {payload.title}
                </h2>
              </div>

              <motion.button
                type="button"
                onClick={closeAuthGate}
                whileTap={{ scale: 0.9, rotate: 90 }}
                transition={springs.snappy}
                aria-label="Close and continue browsing"
                className="flex size-11 shrink-0 items-center justify-center rounded-2xl border-2 border-line bg-card text-ink-muted transition-colors hover:border-line-deep hover:text-ink"
              >
                <X size={17} strokeWidth={2.7} aria-hidden />
              </motion.button>
            </div>

            {/* Mascot + Speech Bubble */}
            <div className="mt-4">
              <MascotCharacter
                outfit={payload.outfit ?? "shs_welcome"}
                speech={payload.speech}
                badgeLabel="CAMPUS GUIDE"
                compact
              />
            </div>

            {/* Perks Pills */}
            <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5 sm:justify-start">
              <span className="inline-flex items-center gap-1 rounded-full border border-line bg-page px-2.5 py-1 text-[10px] font-extrabold text-ink-soft">
                <EyeOff size={11} strokeWidth={2.6} className="text-brand-deep" aria-hidden />
                Secret @Nickname
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-line bg-page px-2.5 py-1 text-[10px] font-extrabold text-ink-soft">
                <GraduationCap size={12} strokeWidth={2.6} className="text-brand-deep" aria-hidden />
                Official SHS Crest
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-line bg-page px-2.5 py-1 text-[10px] font-extrabold text-ink-soft">
                <Sparkles size={11} strokeWidth={2.6} className="text-brand-deep" aria-hidden />
                Takes 30 Seconds
              </span>
            </div>

            {/* 3D Action Buttons */}
            <div className="mt-5 space-y-2.5">
              <Button
                fullWidth
                size="lg"
                onClick={() => goToAuth("signup")}
                leftIcon={<Sparkles size={17} strokeWidth={2.7} aria-hidden />}
              >
                Get Started — Free
              </Button>
              <Button
                fullWidth
                size="md"
                variant="outline"
                onClick={() => goToAuth("signin")}
                leftIcon={<LogIn size={16} strokeWidth={2.6} aria-hidden />}
              >
                I Already Have an Account
              </Button>
            </div>

            <button
              type="button"
              onClick={closeAuthGate}
              className="mt-3 block w-full py-1.5 text-center text-xs font-extrabold text-ink-muted transition-colors hover:text-ink"
            >
              Keep browsing feed as guest
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
