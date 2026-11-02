import type { HTMLAttributes } from "react";
import { cn } from "../../utils/cn";

export type BadgeTone =
  | "brand"
  | "accent"
  | "success"
  | "warning"
  | "danger"
  | "neutral";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  /** Solid fills instead of soft washes. */
  solid?: boolean;
}

const softTones: Record<BadgeTone, string> = {
  brand: "bg-brand-wash text-brand-deep",
  accent: "bg-accent-wash text-accent-deep",
  success: "bg-success-wash text-success-deep",
  warning: "bg-warning-wash text-warning-deep",
  danger: "bg-danger-wash text-danger-deep",
  neutral: "bg-page text-ink-soft",
};

const solidTones: Record<BadgeTone, string> = {
  brand: "bg-brand-deep text-brand-contrast",
  accent: "bg-accent text-[#0F0F11]",
  success: "bg-success text-[#0F0F11]",
  warning: "bg-warning text-[#18181B]",
  danger: "bg-danger text-ink",
  neutral: "bg-ink text-card",
};

/** Rounded pill for streaks, school forms, statuses and labels. */
export function Badge({
  tone = "brand",
  solid = false,
  className,
  children,
  ...rest
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 transition-colors duration-200",
        "text-[11px] font-extrabold uppercase tracking-[0.08em]",
        solid ? solidTones[tone] : softTones[tone],
        className
      )}
      {...rest}
    >
      {children}
    </span>
  );
}
