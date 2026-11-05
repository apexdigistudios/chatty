'use client';

import type { ImgHTMLAttributes } from "react";
import { cn } from "@/utils/cn";
import { SafeImage } from "@/components/common/SafeImage";

export interface ProgressiveImageProps
  extends Omit<ImgHTMLAttributes<HTMLImageElement>, "loading" | "decoding"> {
  src: string;
  alt: string;
  /** Wrapper classes (aspect ratio, sizing, border radius). */
  containerClassName?: string;
  /** Contain the complete image without cropping, preserving its natural ratio. */
  fit?: "cover" | "contain";
}

/**
 * Low-data Progressive Image component.
 *
 * - Enforces native `loading="lazy"` and `decoding="async"` for smooth 60fps scrolling
 */
export function ProgressiveImage({
  src,
  alt,
  className,
  containerClassName,
  fit = "cover",
  onLoad,
  onError,
  ...rest
}: ProgressiveImageProps) {
  return (
    <span
      className={cn(
        "relative block overflow-hidden",
        containerClassName
      )}
    >
      <SafeImage
        {...rest}
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        onLoad={onLoad}
        onError={onError}
        className={cn(
          "block",
          fit === "contain" ? "h-auto w-full object-contain" : "size-full object-cover",
          className
        )}
      />
    </span>
  );
}
