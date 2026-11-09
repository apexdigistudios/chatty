'use client';

import { BadgeCheck } from "lucide-react";
import {
  hasActiveVerification,
  verificationTitle,
  type VerificationStatus,
} from "@/lib/verification";
import { cn } from "@/utils/cn";

interface VerifiedBadgeProps extends VerificationStatus {
  verifiedTitle?: string | null;
  showTitle?: boolean;
  className?: string;
}

export function VerifiedBadge({
  isVerified,
  verifiedExpiresAt,
  isAdmin,
  role,
  verifiedTitle,
  showTitle = false,
  className,
}: VerifiedBadgeProps) {
  const identity = { isVerified, verifiedExpiresAt, isAdmin, role, verifiedTitle };
  if (!hasActiveVerification(identity)) return null;

  const title = verificationTitle(identity);

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 align-middle",
        "text-sky-500",
        className
      )}
      title={title}
      aria-label={`Verified: ${title}`}
    >
      <BadgeCheck size={15} strokeWidth={2.8} className="text-current" aria-hidden />
      {showTitle && (
        <span className={cn(
          "rounded-full px-1.5 py-0.5 text-[9px] font-black leading-none",
          "bg-sky-500/10 text-sky-600 dark:text-sky-400"
        )}>
          {title}
        </span>
      )}
    </span>
  );
}
