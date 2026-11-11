'use client';

import { BadgeCheck } from "lucide-react";
import { cn } from "@/utils/cn";

interface VerifiedBadgeProps {
  isVerified?: boolean | null;
  verifiedExpiresAt?: string | null;
  isAdmin?: boolean | null;
  role?: string | null;
  verifiedTitle?: string | null;
  showTitle?: boolean;
  className?: string;
}

export function VerifiedBadge({
  isVerified,
  isAdmin,
  role,
  verifiedTitle,
  showTitle = false,
  className,
}: VerifiedBadgeProps) {
  const isGlobalAdmin = isAdmin === true || role?.toLowerCase() === "admin" || role?.toLowerCase() === "global_admin";
  if (isVerified !== true && !isGlobalAdmin) return null;

  const title = verifiedTitle?.trim() || (isGlobalAdmin ? "Global Admin" : "Verified");

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
