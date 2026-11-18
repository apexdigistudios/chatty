"use client";

import { useEffect, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Flag, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { describeError } from "@/lib/supabase";
import {
  CONFESSION_REPORT_REASONS,
  type ConfessionReportReason,
  submitConfessionReport,
} from "@/services/confessionReportsService";
import { springs } from "@/theme/tokens";

export function ConfessionReportModal({
  open,
  confessionId,
  onClose,
}: {
  open: boolean;
  confessionId: string;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [reason, setReason] = useState<ConfessionReportReason>(CONFESSION_REPORT_REASONS[0]);
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submitting) onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose, open, submitting]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const result = await submitConfessionReport({ confessionId, reason, details });
      toast(
        result === "submitted"
          ? "Thanks. Your report was sent to the GistMe safety team."
          : "You have already reported this confession.",
        result === "submitted" ? "success" : "info"
      );
      onClose();
    } catch (error) {
      toast(describeError(error, "Could not submit your report."), "danger");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !submitting) onClose();
          }}
        >
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-labelledby="confession-report-title"
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 4 }}
            transition={springs.snappy}
            className="w-full max-w-md rounded-3xl border-2 border-line bg-card p-5 shadow-2xl sm:p-6"
          >
            <header className="flex items-start gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-danger-wash text-danger-deep">
                <Flag size={20} strokeWidth={2.5} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <h2 id="confession-report-title" className="text-base font-black text-ink">Report this confession</h2>
                <p className="mt-1 text-xs font-semibold leading-relaxed text-ink-muted">
                  Reports are reviewed privately by the GistMe safety team.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                aria-label="Close report dialog"
                className="rounded-xl p-2 text-ink-muted transition-colors hover:bg-page hover:text-ink disabled:opacity-50"
              >
                <X size={18} aria-hidden />
              </button>
            </header>

            <form onSubmit={(event) => void submit(event)} className="mt-5">
              <label className="block">
                <span className="mb-1.5 block text-xs font-extrabold text-ink">Why are you reporting it?</span>
                <select
                  value={reason}
                  onChange={(event) => setReason(event.target.value as ConfessionReportReason)}
                  disabled={submitting}
                  className="h-12 w-full rounded-xl border-2 border-line bg-page px-3 text-sm font-semibold text-ink outline-none focus:border-brand focus:ring-4 focus:ring-brand-soft"
                >
                  {CONFESSION_REPORT_REASONS.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>

              <label className="mt-4 block">
                <span className="mb-1.5 block text-xs font-extrabold text-ink">
                  Additional details <span className="font-semibold text-ink-muted">(optional)</span>
                </span>
                <textarea
                  value={details}
                  onChange={(event) => setDetails(event.target.value.slice(0, 1000))}
                  maxLength={1000}
                  rows={4}
                  disabled={submitting}
                  placeholder="Share anything that may help our team review this report."
                  className="w-full resize-y rounded-xl border-2 border-line bg-page p-3 text-sm font-semibold leading-relaxed text-ink outline-none placeholder:text-ink-faint focus:border-brand focus:ring-4 focus:ring-brand-soft"
                />
                <span className="mt-1 block text-right text-[10px] font-semibold text-ink-muted">{details.length}/1000</span>
              </label>

              <Button type="submit" fullWidth disabled={submitting} className="mt-4" leftIcon={
                submitting ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Flag size={15} aria-hidden />
              }>
                {submitting ? "Sending report…" : "Submit report"}
              </Button>
            </form>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
