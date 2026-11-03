import { useEffect, useState, type ImgHTMLAttributes } from "react";
import { ImageOff } from "lucide-react";
import { cn } from "../../utils/cn";
import { SafeImage } from "../common/SafeImage";

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
 * - Renders a soft blurred placeholder skeleton while the image downloads & decodes
 * - Enforces native `loading="lazy"` and `decoding="async"` for smooth 60fps scrolling
 * - Smoothly transitions from blurred scale-up to crisp full clarity upon load
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
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setLoaded(false);
    setFailed(false);
  }, [src]);

  return (
    <span
      className={cn(
        "relative block overflow-hidden bg-surface-muted",
        containerClassName
      )}
    >
      {/* Blurred Placeholder Skeleton */}
      {!loaded && !failed && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-hidden"
        >
          <span
            className="absolute -inset-3 animate-pulse blur-xl motion-reduce:animate-none"
            style={{
              background:
                "radial-gradient(circle at 28% 32%, var(--brand-soft), transparent 62%), radial-gradient(circle at 75% 72%, var(--border-color), var(--surface-muted) 70%)",
            }}
          />
          <span className="absolute inset-0 bg-card/25 backdrop-blur-md" />
        </span>
      )}

      {failed ? (
        <span className="flex size-full min-h-28 flex-col items-center justify-center gap-1.5 bg-page px-3 py-6 text-center text-ink-muted">
          <ImageOff size={20} strokeWidth={2.3} aria-hidden />
          <span className="text-[11px] font-bold">Image unavailable offline</span>
        </span>
      ) : (
        <SafeImage
          {...rest}
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          onUnavailable={() => setFailed(true)}
          onLoad={(event) => {
            setLoaded(true);
            onLoad?.(event);
          }}
          onError={onError}
          className={cn(
            "block transition-[opacity,filter,transform] duration-400 ease-out",
            fit === "contain" ? "h-auto w-full object-contain" : "size-full object-cover",
            loaded
              ? "scale-100 opacity-100 blur-0"
              : fit === "contain"
                ? "opacity-0 blur-md"
                : "scale-[1.03] opacity-0 blur-md",
            className
          )}
        />
      )}
    </span>
  );
}
