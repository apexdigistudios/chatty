import { useEffect, useState, type ImgHTMLAttributes } from "react";
import {
  cacheLoadedImage,
  persistImageBlob,
  readImageBlob,
} from "../../lib/offlineCache";
import { cn } from "../../utils/cn";

const MEMORY_PLACEHOLDER =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#8B5CF6"/><path d="M12 30 53 12 38 53 30 36 12 30Zm19 6 22-24" fill="none" stroke="#fff" stroke-linecap="round" stroke-linejoin="round" stroke-width="4"/></svg>'
  );

export interface SafeImageProps extends ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  fallbackSrc?: string;
  onUnavailable?: () => void;
}

export function SafeImage({
  src,
  fallbackSrc,
  className,
  onLoad,
  onError,
  onUnavailable,
  ...props
}: SafeImageProps) {
  const [displaySrc, setDisplaySrc] = useState(src);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setDisplaySrc(src);
    setFailed(false);
  }, [src]);

  useEffect(() => {
    return () => {
      if (displaySrc.startsWith("blob:")) URL.revokeObjectURL(displaySrc);
    };
  }, [displaySrc]);

  return (
    <img
      {...props}
      src={displaySrc}
      className={cn(className)}
      onLoad={(event) => {
        if (displaySrc === src) void cacheLoadedImage(src);
        onLoad?.(event);
      }}
      onError={(event) => {
        onError?.(event);
        void (async () => {
          try {
            const currentUrl = new URL(displaySrc, window.location.href).href;
            if ("caches" in window && !displaySrc.startsWith("blob:")) {
              const cachedResponse = await caches.match(currentUrl);
              if (cachedResponse && cachedResponse.type !== "opaque") {
                const blob = await cachedResponse.blob();
                if (blob.size > 0) {
                  await persistImageBlob(displaySrc, blob);
                  setDisplaySrc(URL.createObjectURL(blob));
                  return;
                }
              }
            }
            const blob = await readImageBlob(src);
            if (blob) {
              setDisplaySrc(URL.createObjectURL(blob));
              return;
            }
          } catch (error) {
            console.warn("Could not read the cached image.", error);
          }
          if (displaySrc === src && fallbackSrc && fallbackSrc !== src) {
            setDisplaySrc(fallbackSrc);
            return;
          }
          if (displaySrc !== MEMORY_PLACEHOLDER) {
            setDisplaySrc(MEMORY_PLACEHOLDER);
            return;
          }
          setFailed(true);
          onUnavailable?.();
        })();
      }}
      data-image-failed={failed || undefined}
      hidden={failed}
    />
  );
}
