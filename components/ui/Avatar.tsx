'use client';

import { useEffect, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { defaultAvatarUrl } from "@/lib/media";
import { cn } from "@/utils/cn";
import { SafeImage } from "@/components/common/SafeImage";

export type AvatarSize = "sm" | "md" | "lg" | "xl" | "2xl" | "3xl";

export interface AvatarProps {
  /** Username / display name — seeds the generated avatar when no photo exists. */
  name: string;
  /** Storage URL of the student's uploaded photo. */
  src?: string | null;
  size?: AvatarSize;
  online?: boolean;
  ring?: boolean;
  viewable?: boolean;
  className?: string;
}

const sizeClasses: Record<AvatarSize, string> = {
  sm: "w-8 h-8",
  md: "w-10 h-10",
  lg: "w-12 h-12",
  xl: "w-16 h-16",
  "2xl": "w-24 h-24",
  "3xl": "w-28 h-28",
};

const dotClasses: Record<AvatarSize, string> = {
  sm: "size-2.5 border-2",
  md: "size-3 border-2",
  lg: "size-3.5 border-[3px]",
  xl: "size-4 border-[3px]",
  "2xl": "size-5 border-[3px]",
  "3xl": "size-6 border-4",
};

/** Circular student avatar: uploaded photo, else the DiceBear illustration stored at signup. */
export function Avatar({
  name,
  src,
  size = "md",
  online = false,
  ring = false,
  viewable = false,
  className,
}: AvatarProps) {
  const primary = src || defaultAvatarUrl(name);
  const [viewerOpen, setViewerOpen] = useState(false);

  useEffect(() => {
    if (!viewerOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setViewerOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [viewerOpen]);

  const handleKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (!viewable || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    event.stopPropagation();
    setViewerOpen(true);
  };

  return (
    <span className="relative inline-flex aspect-square shrink-0">
      <span
        role={viewable ? "button" : undefined}
        tabIndex={viewable ? 0 : undefined}
        aria-label={viewable ? `View ${name}'s profile photo` : undefined}
        onClick={(event) => {
          if (!viewable) return;
          event.preventDefault();
          event.stopPropagation();
          setViewerOpen(true);
        }}
        onKeyDown={handleKeyDown}
        className={cn(
          "relative flex aspect-square shrink-0 items-center justify-center overflow-hidden rounded-full",
          className ?? sizeClasses[size],
          ring && "ring-2 ring-brand",
          viewable && "cursor-zoom-in focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft"
        )}
      >
        <SafeImage
          src={primary}
          alt={name}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          className="relative aspect-square h-full w-full shrink-0 rounded-full object-cover"
        />
      </span>

      {online && (
        <span
          className={cn("absolute -bottom-0.5 -right-0.5 rounded-full border-solid border-card bg-success", dotClasses[size])}
          title="Online now"
        >
          <motion.span
            className="absolute inset-0 rounded-full bg-success"
            animate={{ scale: [1, 1.9], opacity: [0.55, 0] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
            aria-hidden
          />
        </span>
      )}
      {viewable && typeof document !== "undefined" && createPortal(
        <AnimatePresence>
          {viewerOpen && (
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={`${name}'s profile photo`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 p-4"
              onClick={() => setViewerOpen(false)}
            >
              <button
                type="button"
                aria-label="Close photo"
                onClick={() => setViewerOpen(false)}
                className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] flex size-12 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/60"
              >
                <X size={24} aria-hidden />
              </button>
              <motion.div
                initial={{ opacity: 0, scale: 0.94 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.18 }}
                className="flex max-h-[88dvh] max-w-[94vw] items-center justify-center"
                onClick={(event) => event.stopPropagation()}
              >
                <SafeImage
                  src={primary}
                  alt={name}
                  decoding="async"
                  className="max-h-[88dvh] max-w-[94vw] rounded-lg object-contain"
                  style={{ visibility: "visible" }}
                />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </span>
  );
}
