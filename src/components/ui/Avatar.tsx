import { motion } from "framer-motion";
import { defaultAvatarUrl } from "../../lib/media";
import { cn } from "../../utils/cn";
import { SafeImage } from "../common/SafeImage";

export type AvatarSize = "sm" | "md" | "lg" | "xl" | "2xl";

export interface AvatarProps {
  /** Username / display name — seeds the generated avatar when no photo exists. */
  name: string;
  /** Storage URL of the student's uploaded photo. */
  src?: string | null;
  size?: AvatarSize;
  online?: boolean;
  ring?: boolean;
  className?: string;
}

const sizeClasses: Record<AvatarSize, string> = {
  sm: "size-8",
  md: "size-10",
  lg: "size-12",
  xl: "size-16",
  "2xl": "size-24",
};

const dotClasses: Record<AvatarSize, string> = {
  sm: "size-2.5 border-2",
  md: "size-3 border-2",
  lg: "size-3.5 border-[3px]",
  xl: "size-4 border-[3px]",
  "2xl": "size-5 border-[3px]",
};

/** Circular student avatar: uploaded photo, else the DiceBear illustration stored at signup. */
export function Avatar({ name, src, size = "md", online = false, ring = false, className }: AvatarProps) {
  const primary = src || defaultAvatarUrl(name);

  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      <span
        className={cn(
          "relative flex items-center justify-center overflow-hidden rounded-full",
          sizeClasses[size],
          ring && "ring-2 ring-brand"
        )}
      >
        <SafeImage
          src={primary}
          alt={name}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          className="relative size-full object-cover"
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
    </span>
  );
}
