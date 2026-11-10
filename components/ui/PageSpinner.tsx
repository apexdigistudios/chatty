"use client";

import { Loader2 } from "lucide-react";
import { cn } from "@/utils/cn";

export function PageSpinner({
  label = "Loading",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-label={label}
      className={cn("flex w-full items-center justify-center py-10 text-brand-deep", className)}
    >
      <Loader2 size={20} className="animate-spin" aria-hidden />
    </div>
  );
}
