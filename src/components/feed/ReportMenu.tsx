import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Flag, Loader2, ShieldCheck, Trash2, X } from "lucide-react";
import { describeError } from "../../lib/supabase";
import { submitReport } from "../../services/moderationService";
import { springs } from "../../theme/tokens";
import type { ReportTargetType } from "../../types/models";
import { useToast } from "../ui/Toast";

const REASONS = ["Bullying or harassment", "Unsafe content", "Spam", "Something else"];

interface ReportMenuProps {
  open: boolean;
  onClose: () => void;
  targetType: ReportTargetType;
  targetId: string;
  /** Routes the report to this school's moderators (null → global queue). */
  schoolId: string | null;
  /** Shown only to moderators of the target's school / global admins. */
  moderatorAction?: { label: string; onConfirm: () => Promise<void> };
  requireAuth: () => boolean;
}

/** Shared popover: report reasons for everyone, plus a moderator action. */
export function ReportMenu({ open, onClose, targetType, targetId, schoolId, moderatorAction, requireAuth }: ReportMenuProps) {
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const report = async (reason: string) => {
    if (!requireAuth()) return;
    setBusy(reason);
    try {
      await submitReport({ targetType, targetId, schoolId, reason });
      toast(
        schoolId && targetType !== "confession"
          ? "Reported to the school moderators."
          : "Reported to the Gist me safety team.",
        "danger"
      );
      onClose();
    } catch (error) {
      toast(describeError(error), "danger");
    } finally {
      setBusy(null);
    }
  };

  const runModeratorAction = async () => {
    if (!moderatorAction) return;
    setBusy("moderate");
    try {
      await moderatorAction.onConfirm();
      onClose();
    } catch (error) {
      toast(describeError(error), "danger");
    } finally {
      setBusy(null);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: -4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: -3 }}
          transition={springs.snappy}
          className="absolute right-3 top-14 z-20 w-60 rounded-2xl border-2 border-line bg-card p-2 shadow-[0_5px_0_var(--border-strong)]"
          role="group"
          aria-label="Report options"
        >
          <div className="flex items-center justify-between px-2 pb-1.5 pt-1">
            <p className="text-xs font-extrabold text-ink">Report {targetType}</p>
            <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-ink-muted hover:bg-page">
              <X size={14} aria-hidden />
            </button>
          </div>
          {REASONS.map((reason) => (
            <button
              key={reason}
              type="button"
              disabled={busy !== null}
              onClick={() => report(reason)}
              className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs font-bold text-ink-soft transition-colors hover:bg-danger-wash hover:text-danger disabled:opacity-50"
            >
              {busy === reason ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Flag size={13} strokeWidth={2.4} aria-hidden />}
              {reason}
            </button>
          ))}
          {moderatorAction && (
            <button
              type="button"
              disabled={busy !== null}
              onClick={runModeratorAction}
              className="mt-1 flex w-full items-center gap-2 rounded-xl border-t-2 border-line px-2.5 pb-2 pt-3 text-left text-xs font-extrabold text-brand-deep transition-colors hover:bg-brand-wash disabled:opacity-50"
            >
              {busy === "moderate" ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Trash2 size={13} strokeWidth={2.5} aria-hidden />}
              {moderatorAction.label}
              <ShieldCheck size={12} className="ml-auto" aria-hidden />
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
