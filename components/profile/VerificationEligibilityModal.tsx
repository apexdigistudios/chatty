"use client";

import { BadgeCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";

const REQUIRED_FOLLOWERS = 5000;

export function VerificationEligibilityModal({
  followerCount,
  onClose,
}: {
  followerCount: number;
  onClose: () => void;
}) {
  const progress = Math.min(100, (followerCount / REQUIRED_FOLLOWERS) * 100);

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="verification-eligibility-title"
        aria-describedby="verification-eligibility-description"
        className="w-full max-w-md rounded-3xl border-2 border-line bg-card p-5 shadow-2xl sm:p-6"
      >
        <span className="flex size-12 items-center justify-center rounded-2xl bg-brand-wash text-brand-deep">
          <BadgeCheck size={24} strokeWidth={2.5} aria-hidden />
        </span>
        <h2 id="verification-eligibility-title" className="mt-4 text-lg font-black tracking-tight text-ink">
          Grow your community first
        </h2>
        <p id="verification-eligibility-description" className="mt-2 text-sm font-semibold leading-relaxed text-ink-muted">
          To apply for verification, you need at least 5,000 followers. Campus ambassadors are also eligible.
        </p>

        <div className="mt-5 rounded-2xl border border-line bg-page p-3.5">
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="font-bold text-ink-muted">Your follower progress</span>
            <span className="font-black tabular-nums text-ink">
              {followerCount.toLocaleString()} / {REQUIRED_FOLLOWERS.toLocaleString()}
            </span>
          </div>
          <div
            className="mt-2.5 h-2.5 overflow-hidden rounded-full bg-line"
            role="progressbar"
            aria-label="Progress toward verification eligibility"
            aria-valuemin={0}
            aria-valuemax={REQUIRED_FOLLOWERS}
            aria-valuenow={Math.min(followerCount, REQUIRED_FOLLOWERS)}
          >
            <div
              className="h-full rounded-full bg-brand transition-[width] duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <Button type="button" onClick={onClose} className="mt-5 w-full">
          Got it
        </Button>
      </section>
    </div>
  );
}
