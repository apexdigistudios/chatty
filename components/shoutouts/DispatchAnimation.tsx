'use client';

import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Mailbox, Send, Sparkles } from "lucide-react";
import { springs } from "@/theme/tokens";
import { Button } from "@/components/ui/Button";
import { PostalEnvelope } from "@/components/shoutouts/PostalEnvelope";
import type { School, Shoutout, ShoutoutStatus } from "@/types/models";

interface DispatchAnimationProps {
  shoutout: Shoutout | null;
  stage: ShoutoutStatus;
  recipientSchool: School | null;
  senderShort: string;
  recipientShort: string;
  onDone: () => void;
}

/** Full-screen paper-plane launch into the inter-school sorting office. */
export function DispatchAnimation({
  shoutout,
  stage,
  recipientSchool,
  senderShort,
  recipientShort,
  onDone,
}: DispatchAnimationProps) {
  if (typeof document === "undefined") return null;

  const statusCopy =
    stage === "delivered"
      ? `Delivered to ${shoutout?.recipientName ?? "recipient"}`
      : stage === "arrived"
        ? `Arrived at ${recipientShort} Mail Room`
        : `In Transit from ${senderShort} Post Office`;

  return createPortal(
    <AnimatePresence>
      {shoutout && (
        <motion.div
          key={shoutout.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-4 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
          aria-label="Paper plane dispatch"
        >
          <motion.div
            initial={{ y: 36, scale: 0.94, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 26, scale: 0.95, opacity: 0 }}
            transition={springs.bouncy}
            className="w-full max-w-md overflow-hidden rounded-[28px] border-2 border-line bg-card p-4 text-center shadow-[0_6px_0_var(--border-strong)] sm:p-5"
          >
            <div className="relative h-40 overflow-hidden rounded-2xl border-2 border-line bg-brand-wash/60">
              {/* Envelope travelling into the sorting box */}
              <motion.div
                initial={{ x: -165, y: 78, rotate: -14, opacity: 0 }}
                animate={{ x: [-165, -35, 135], y: [78, 25, -60], rotate: [-14, 6, -12], opacity: [0, 1, 0] }}
                transition={{ duration: 1.85, times: [0, 0.5, 1], ease: "easeInOut" }}
                className="absolute left-1/2 top-1/2 w-32"
              >
                <PostalEnvelope
                  school={recipientSchool}
                  theme={shoutout.envelopeTheme}
                  stampId={shoutout.stamp}
                  stampLabel={shoutout.stamp.replace(/_/g, " ")}
                  recipientName={shoutout.recipientName}
                  recipientClass={shoutout.recipientClass}
                  compact
                />
              </motion.div>

              <motion.div
                initial={{ x: -200, y: 50, opacity: 0 }}
                animate={{ x: [-200, -40, 190], y: [50, 8, -70], opacity: [0, 1, 0] }}
                transition={{ duration: 1.85, ease: "easeInOut" }}
                className="absolute left-1/2 top-1/2 text-[#8B5CF6]"
              >
                <Send size={34} strokeWidth={2.5} aria-hidden />
              </motion.div>

              <motion.div
                initial={{ y: 18, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.7, duration: 0.45 }}
                className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-xl border-2 border-line bg-card px-4 py-2"
              >
                <Mailbox size={30} className="mx-auto text-brand-deep" aria-hidden />
                <p className="mt-0.5 text-[8px] font-black uppercase tracking-wider text-ink-muted">{recipientShort} Sorting Office</p>
              </motion.div>

              <AnimatePresence>
                {stage === "delivered" && (
                  <motion.span
                    initial={{ scale: 0, rotate: -20 }}
                    animate={{ scale: [0, 1.2, 1], rotate: 0 }}
                    exit={{ opacity: 0 }}
                    className="absolute right-3 top-3 text-success"
                  >
                    <CheckCircle2 size={30} aria-hidden />
                  </motion.span>
                )}
              </AnimatePresence>
            </div>

            <p className="mt-4 inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-brand-deep">
              <Sparkles size={12} aria-hidden />
              {stage === "delivered" ? "Letter delivered" : "Paper plane in flight"}
            </p>
            <h2 className="mt-1.5 text-xl font-black tracking-tight text-ink">{statusCopy}</h2>
            <p className="mt-1 text-xs font-semibold text-ink-muted">
              To {shoutout.recipientName} · {shoutout.recipientClass || "SHS student"} · {recipientShort}
            </p>

            <div className="mt-4 grid grid-cols-3 gap-1.5">
              {(["in_transit", "arrived", "delivered"] as const).map((item, index) => {
                const reached = (["in_transit", "arrived", "delivered"] as const).indexOf(stage) >= index;
                return <span key={item} className={`h-1.5 rounded-full ${reached ? "bg-[#8B5CF6]" : "bg-line"}`} />;
              })}
            </div>

            <Button fullWidth className="mt-4" onClick={onDone} leftIcon={<Mailbox size={16} strokeWidth={2.5} aria-hidden />}>
              Track in Outbox
            </Button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
