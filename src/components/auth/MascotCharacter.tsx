import { useEffect } from "react";
import { LottieLight } from "lottie-react";
import {
  AnimatePresence,
  motion,
  useAnimationControls,
  useReducedMotion,
} from "framer-motion";
import { AlertCircle, CheckCircle2, Sparkles } from "lucide-react";
import { springs } from "../../theme/tokens";
import { cn } from "../../utils/cn";
import { MASCOT_LOTTIE_DATA } from "./mascotLottieData";

export type MascotOutfit =
  | "shs_welcome"
  | "detective"
  | "fbi_security"
  | "celebration"
  | "login_welcome";

export type MascotReaction = "idle" | "valid" | "error" | "celebrate";

export interface MascotCharacterProps {
  /** Wizard step (1..4) automatically selects the matching outfit when `outfit` is omitted. */
  step?: 1 | 2 | 3 | 4;
  outfit?: MascotOutfit;
  reaction?: MascotReaction;
  /** Increment to replay `valid` wiggle or `error` head-shake on consecutive triggers. */
  reactionKey?: number | string;
  /** Friendly prompt displayed inside the Duolingo-style speech bubble. */
  speech?: string;
  /** Small uppercase tag inside the speech bubble (e.g., "AGENT BRIEFING"). */
  badgeLabel?: string;
  /** Slightly tighter footprint for modals and small screens. */
  compact?: boolean;
  className?: string;
}

const STEP_TO_OUTFIT: Record<1 | 2 | 3 | 4, MascotOutfit> = {
  1: "shs_welcome",
  2: "detective",
  3: "fbi_security",
  4: "celebration",
};

const OUTFIT_LABELS: Record<MascotOutfit, string> = {
  shs_welcome: "Animated SHS student mascot waving in uniform",
  login_welcome: "Animated SHS student mascot welcoming you back",
  detective: "Animated undercover detective mascot adjusting sunglasses with magnifying glass",
  fbi_security: "Animated campus security agent mascot with sunglasses and padlock shield",
  celebration: "Animated student mascot in graduation cap doing a confetti victory dance",
};

/**
 * Interactive Animated Vector Mascot ("Kofi") powered by `lottie-react` (`LottieLight`)
 * and Framer Motion state transitions.
 *
 * - Physically moves, waves, blinks, adjusts sunglasses, scans with a magnifying glass,
 *   glances side-to-side, and performs a confetti victory dance at 60fps.
 * - Uses tree-shaken `LottieLight` + inline JSON data so load times are 0ms on SM1 tablets.
 */
export function MascotCharacter({
  step = 1,
  outfit,
  reaction = "idle",
  reactionKey = 0,
  speech,
  badgeLabel,
  compact = false,
  className,
}: MascotCharacterProps) {
  const prefersReducedMotion = useReducedMotion();
  const reactionControls = useAnimationControls();
  const activeOutfit: MascotOutfit = outfit ?? STEP_TO_OUTFIT[step];
  const isCelebrating = activeOutfit === "celebration" || reaction === "celebrate";
  const isError = reaction === "error";
  const isValid = reaction === "valid";

  // Trigger wiggle or head-shake on the outer rig without remounting LottieLight
  useEffect(() => {
    if (prefersReducedMotion) return;
    if (reaction === "error") {
      void reactionControls.start({
        x: [0, -11, 11, -8, 8, -4, 0],
        rotate: [0, -2.5, 2.5, -1, 0],
        y: 0,
        scale: 1,
        transition: { duration: 0.44, ease: "easeInOut" },
      });
    } else if (reaction === "valid") {
      void reactionControls.start({
        rotate: [0, -6, 6, -3, 2, 0],
        y: [0, -7, 0],
        scale: [1, 1.05, 1],
        x: 0,
        transition: { duration: 0.5, ease: "easeOut" },
      });
    } else {
      void reactionControls.start({
        x: 0,
        y: 0,
        rotate: 0,
        scale: 1,
        transition: springs.bouncy,
      });
    }
  }, [reaction, reactionKey, prefersReducedMotion, reactionControls]);

  return (
    <div
      className={cn(
        "flex w-full flex-col items-center gap-3 sm:flex-row sm:items-center sm:gap-4",
        className
      )}
    >
      {/* ——— Lottie Vector Mascot Stage ——— */}
      <div className="relative flex shrink-0 items-center justify-center">
        {/* Soft ambient aura behind Lottie stage */}
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute rounded-full transition-colors duration-300",
            compact ? "size-24 sm:size-28" : "size-28 sm:size-32",
            isError
              ? "bg-danger-wash"
              : isValid || isCelebrating
                ? "bg-brand-soft/80 dark:bg-brand-wash"
                : "bg-brand-wash"
          )}
        />

        {/* Outer Framer Motion Reaction Rig (wiggle / head-shake without resetting Lottie playback) */}
        <motion.div
          animate={reactionControls}
          className={cn(
            "relative z-10 select-none",
            compact ? "size-28 sm:size-32" : "size-32 sm:size-36"
          )}
        >
          {/* Smooth Framer Motion State Transitions Between Lottie Outfits */}
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={activeOutfit}
              initial={{ opacity: 0, scale: 0.84, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.88, y: -6 }}
              transition={springs.bouncy}
              className="size-full drop-shadow-[0_5px_0_rgba(15,15,17,0.14)] dark:drop-shadow-[0_5px_0_rgba(0,0,0,0.45)]"
            >
              <LottieLight
                src={MASCOT_LOTTIE_DATA[activeOutfit]}
                autoplay={!prefersReducedMotion}
                loop={!prefersReducedMotion}
                speed={isError ? 0.85 : isValid ? 1.15 : 1}
                role="img"
                aria-label={OUTFIT_LABELS[activeOutfit]}
                className="size-full"
              />
            </motion.div>
          </AnimatePresence>

          {/* Floating Reaction Micro-Badge */}
          <AnimatePresence>
            {(isValid || isError || isCelebrating) && (
              <motion.span
                key={`badge-${reaction}-${reactionKey}`}
                initial={{ scale: 0, opacity: 0, y: 6 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={springs.bouncy}
                className={cn(
                  "absolute right-0.5 top-0.5 flex size-8 items-center justify-center rounded-full border-2 border-card shadow-md",
                  isError
                    ? "bg-danger text-white"
                    : isValid
                      ? "bg-success text-white"
                      : "bg-brand-deep text-brand-contrast"
                )}
                aria-hidden
              >
                {isError ? (
                  <AlertCircle size={16} strokeWidth={2.8} />
                ) : isValid ? (
                  <CheckCircle2 size={16} strokeWidth={2.8} />
                ) : (
                  <Sparkles size={15} strokeWidth={2.8} />
                )}
              </motion.span>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* ——— Duolingo-Style Speech Bubble ——— */}
      {speech && (
        <div className="relative w-full min-w-0 flex-1">
          {/* Desktop left-pointing speech tail */}
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute -left-2 top-1/2 hidden size-4 -translate-y-1/2 rotate-45 border-b-2 border-l-2 bg-card sm:block",
              isError ? "border-danger" : isValid ? "border-success" : "border-line-deep"
            )}
          />
          {/* Mobile top-pointing speech tail */}
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute -top-2 left-1/2 size-3.5 -translate-x-1/2 rotate-45 border-l-2 border-t-2 bg-card sm:hidden",
              isError ? "border-danger" : isValid ? "border-success" : "border-line-deep"
            )}
          />

          <motion.div
            key={speech}
            initial={{ opacity: 0, y: 5, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={springs.snappy}
            className={cn(
              "relative rounded-2xl border-2 bg-card px-4 py-3 text-center shadow-[0_4px_0_var(--border-color)] transition-colors sm:text-left",
              isError
                ? "border-danger bg-danger-wash/40"
                : isValid
                  ? "border-success"
                  : "border-line-deep"
            )}
          >
            {badgeLabel && (
              <span
                className={cn(
                  "mb-1 inline-block rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.14em]",
                  isError
                    ? "bg-danger-wash text-danger-deep"
                    : "bg-brand-wash text-brand-deep"
                )}
              >
                {badgeLabel}
              </span>
            )}
            <p
              className={cn(
                "font-extrabold leading-snug text-ink",
                compact ? "text-xs sm:text-[13px]" : "text-[13px] sm:text-sm"
              )}
            >
              &ldquo;{speech}&rdquo;
            </p>
          </motion.div>
        </div>
      )}
    </div>
  );
}
