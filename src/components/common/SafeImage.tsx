import { useEffect, useState, type ImgHTMLAttributes } from "react";
import {
  cacheLoadedImage,
  persistImageBlob,
  readImageBlob,
} from "../../lib/offlineCache";
import { cn } from "../../utils/cn";

export interface SafeImageProps extends ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  onUnavailable?: () => void;
}

export function SafeImage({
  src,
  className,
  style,
  onLoad,
  onError,
  onUnavailable,
  ...props
}: SafeImageProps) {
  const [cachedImage, setCachedImage] = useState<{ source: string; objectUrl: string } | null>(null);
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const displaySrc = cachedImage?.source === src ? cachedImage.objectUrl : src;

  useEffect(() => {
    return () => {
      if (cachedImage) URL.revokeObjectURL(cachedImage.objectUrl);
    };
  }, [cachedImage, src]);

  return (
    <img
      {...props}
      src={displaySrc}
      className={cn(className)}
      style={{ ...style, visibility: loadedSrc === displaySrc ? style?.visibility : "hidden" }}
      onLoad={(event) => {
        setLoadedSrc(displaySrc);
        if (displaySrc === src) void cacheLoadedImage(src);
        onLoad?.(event);
      }}
      onError={(event) => {
        setLoadedSrc(null);
        onError?.(event);
        void (async () => {
          try {
            const currentUrl = new URL(displaySrc, window.location.href).href;
            if ("caches" in window && !displaySrc.startsWith("blob:")) {
              const cachedResponse = await caches.match(currentUrl);
              if (cachedResponse && cachedResponse.type !== "opaque") {
                const blob = await cachedResponse.blob();
                if (blob.size > 0) {
                  await persistImageBlob(src, blob);
                  setCachedImage({ source: src, objectUrl: URL.createObjectURL(blob) });
                  return;
                }
              }
            }
            const blob = await readImageBlob(src);
            if (blob) {
              setCachedImage({ source: src, objectUrl: URL.createObjectURL(blob) });
              return;
            }
          } catch (error) {
            console.warn("Could not read the cached image.", error);
          }
          onUnavailable?.();
        })();
      }}
    />
  );
}
