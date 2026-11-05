'use client';

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Flag, X } from "lucide-react";
import { describeError } from "@/lib/supabase";
import {
  GIST_REPORT_REASONS,
  submitGistReport,
  type GistReportReason,
} from "@/services/reportService";
import { springs } from "@/theme/tokens";
import type { Post } from "@/types/models";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";

interface ReportModalProps {
  post: Post;
  onClose: () => void;
}

export function ReportModal({ post, onClose }: ReportModalProps) {
  const { toast } = useToast();
  const [reason, setReason] = useState<GistReportReason | null>(null);
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [busy, onClose]);

  const submit = async () => {
    if (!reason) return;
    setBusy(true);
    try {
      const result = await submitGistReport({ gistId: post.id, reason, details });
      toast(
        result === "duplicate"
          ? "You have already reported this post."
          : "Thank you. Your report was sent to the safety team.",
        result === "duplicate" ? "info" : "success"
      );
      onClose();
    } catch (error) {
      toast(describeError(error, "Could not submit your report."), "danger");
    } finally {
      setBusy(false);
    }
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-90 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget && !busy) onClose();
        }}
      >
        <motion.section
          role="dialog"
          aria-modal="true"
          aria-labelledby="report-gist-title"
          className="flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-[28px] border-2 border-line bg-card shadow-[0_8px_0_var(--border-strong)] sm:rounded-[28px]"
          initial={{ y: 28, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 20, opacity: 0 }}
          transition={springs.gentle}
        >
          <header className="flex items-start gap-3 border-b-2 border-line px-4 py-4 sm:px-5">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-danger-wash text-danger">
              <Flag size={18} strokeWidth={2.6} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <h2 id="report-gist-title" className="text-sm font-black text-ink">Report this gist</h2>
              <p className="mt-0.5 truncate text-xs font-semibold text-ink-muted">@{post.authorName} · {post.schoolShort}</p>
            </div>
            <button type="button" onClick={onClose} disabled={busy} aria-label="Close report dialog" className="flex size-11 shrink-0 items-center justify-center rounded-xl text-ink-muted hover:bg-page disabled:opacity-50">
              <X size={17} aria-hidden />
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
            <p className="text-xs font-extrabold text-ink">Why are you reporting this gist?</p>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {GIST_REPORT_REASONS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  aria-pressed={reason === item.value}
                  disabled={busy}
                  onClick={() => setReason(item.value)}
                  className={`min-h-11 rounded-xl border-2 px-3 py-2 text-left text-xs font-extrabold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft ${
                    reason === item.value
                      ? "border-brand bg-brand-wash text-brand-deep"
                      : "border-line bg-card text-ink-soft hover:border-brand/60"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <label className="mt-4 block">
              <span className="text-xs font-extrabold text-ink">Details <span className="font-semibold text-ink-muted">(optional)</span></span>
              <textarea
                value={details}
                onChange={(event) => setDetails(event.target.value)}
                maxLength={1000}
                rows={4}
                placeholder="Share context that can help us review this report."
                className="mt-2 w-full resize-y rounded-xl border-2 border-line bg-page px-3 py-2.5 text-sm font-medium text-ink outline-none placeholder:text-ink-faint focus:border-brand focus:ring-4 focus:ring-brand-soft"
              />
              <span className="mt-1 block text-right text-[10px] font-semibold text-ink-muted">{details.length}/1000</span>
            </label>
            <p className="mt-3 flex items-start gap-2 rounded-xl border border-warning-soft bg-warning-wash px-3 py-2.5 text-[11px] font-semibold leading-relaxed text-ink-soft">
              <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning-deep" aria-hidden />
              Reports are reviewed by the safety team. Your identity is not shown to the post author.
            </p>
          </div>

          <footer className="flex justify-end gap-2 border-t-2 border-line px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:px-5 sm:pb-3">
            <Button variant="outline" size="sm" disabled={busy} onClick={onClose}>Cancel</Button>
            <Button size="sm" disabled={!reason || busy} loading={busy} leftIcon={<Flag size={14} aria-hidden />} onClick={() => void submit()}>
              Submit report
            </Button>
          </footer>
        </motion.section>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
