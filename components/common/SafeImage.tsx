'use client';

import { useEffect, useState, type ImgHTMLAttributes } from "react";
import {
  cacheLoadedImage,
  isBrowserOffline,
  persistImageBlob,
  readImageBlob,
} from "@/lib/offlineCache";
import { cloudflareMediaUrl } from "@/lib/mediaUrl";
import { cn } from "@/utils/cn";

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
  const mediaSrc = cloudflareMediaUrl(src);
  const [cachedImage, setCachedImage] = useState<{ source: string; objectUrl: string } | null>(null);
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const displaySrc = cachedImage?.source === mediaSrc ? cachedImage.objectUrl : mediaSrc;

  useEffect(() => {
    return () => {
      if (cachedImage) URL.revokeObjectURL(cachedImage.objectUrl);
    };
  }, [cachedImage, mediaSrc]);

  useEffect(() => {
    let active = true;
    const loadCachedImage = async () => {
      if (!isBrowserOffline()) return;
      try {
        const blob = await readImageBlob(mediaSrc);
        if (active && blob) {
          setCachedImage({ source: mediaSrc, objectUrl: URL.createObjectURL(blob) });
        }
      } catch (error) {
        console.warn("Could not read the cached image.", error);
      }
    };
    const handleOffline = () => void loadCachedImage();

    void loadCachedImage();
    window.addEventListener("offline", handleOffline);
    return () => {
      active = false;
      window.removeEventListener("offline", handleOffline);
    };
  }, [mediaSrc]);

  return (
    <img
      {...props}
      src={displaySrc}
      className={cn(className)}
      style={{ ...style, visibility: loadedSrc === displaySrc ? style?.visibility : "hidden" }}
      onLoad={(event) => {
        setLoadedSrc(displaySrc);
        if (displaySrc === mediaSrc) void cacheLoadedImage(mediaSrc);
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
                  await persistImageBlob(mediaSrc, blob);
                  setCachedImage({ source: mediaSrc, objectUrl: URL.createObjectURL(blob) });
                  return;
                }
              }
            }
            const blob = await readImageBlob(mediaSrc);
            if (blob) {
              setCachedImage({ source: mediaSrc, objectUrl: URL.createObjectURL(blob) });
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
