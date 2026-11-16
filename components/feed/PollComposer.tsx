"use client";

import { AnimatePresence, motion } from "framer-motion";
import { BarChart3, Plus, Trash2, X } from "lucide-react";
import type { PollDraft } from "@/types/models";

const MAX_POLL_OPTIONS = 6;

export function PollComposer({
  value,
  onChange,
  disabled = false,
}: {
  value: PollDraft | null;
  onChange: (value: PollDraft | null) => void;
  disabled?: boolean;
}) {
  if (!value) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange({ question: "", options: ["", ""] })}
        className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-brand-soft bg-brand-wash px-4 text-xs font-extrabold text-brand-deep transition hover:border-brand disabled:opacity-50"
      >
        <BarChart3 size={17} aria-hidden /> Add a poll
      </button>
    );
  }

  const updateOption = (index: number, text: string) => {
    onChange({
      ...value,
      options: value.options.map((option, optionIndex) => optionIndex === index ? text : option),
    });
  };

  return (
    <motion.section
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className="mt-4 overflow-hidden rounded-2xl border border-brand-soft bg-brand-wash/50 p-3"
      aria-label="Create a poll"
    >
      <div className="flex items-center gap-2">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-wash text-brand-deep">
          <BarChart3 size={17} aria-hidden />
        </span>
        <label className="min-w-0 flex-1">
          <span className="sr-only">Poll question</span>
          <input
            value={value.question}
            onChange={(event) => onChange({ ...value, question: event.target.value })}
            maxLength={160}
            placeholder="Ask your campus…"
            disabled={disabled}
            className="h-10 w-full rounded-xl border border-line bg-card px-3 text-sm font-bold text-ink outline-none placeholder:text-ink-muted focus:border-brand"
          />
        </label>
        <button
          type="button"
          onClick={() => onChange(null)}
          disabled={disabled}
          aria-label="Remove poll"
          className="flex size-9 shrink-0 items-center justify-center rounded-xl text-ink-muted hover:bg-danger-wash hover:text-danger"
        >
          <X size={17} aria-hidden />
        </button>
      </div>

      <div className="mt-2 space-y-2">
        <AnimatePresence initial={false}>
          {value.options.map((option, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="flex items-center gap-2"
            >
              <label className="min-w-0 flex-1">
                <span className="sr-only">Poll option {index + 1}</span>
                <input
                  value={option}
                  onChange={(event) => updateOption(index, event.target.value)}
                  maxLength={80}
                  placeholder={`Option ${index + 1}`}
                  disabled={disabled}
                  className="h-10 w-full rounded-xl border border-line bg-card px-3 text-xs font-semibold text-ink outline-none placeholder:text-ink-muted focus:border-brand"
                />
              </label>
              {index > 1 && (
                <button
                  type="button"
                  onClick={() => onChange({ ...value, options: value.options.filter((_, optionIndex) => optionIndex !== index) })}
                  disabled={disabled}
                  aria-label={`Remove option ${index + 1}`}
                  className="flex size-9 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-danger-wash hover:text-danger"
                >
                  <Trash2 size={15} aria-hidden />
                </button>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {value.options.length < MAX_POLL_OPTIONS && (
        <button
          type="button"
          onClick={() => onChange({ ...value, options: [...value.options, ""] })}
          disabled={disabled}
          className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-[10px] font-extrabold text-brand-deep hover:bg-brand-wash"
        >
          <Plus size={14} aria-hidden /> Add option
        </button>
      )}
      <p className="mt-1 text-[10px] font-semibold text-ink-muted">2–6 options · Pick one answer</p>
    </motion.section>
  );
}
