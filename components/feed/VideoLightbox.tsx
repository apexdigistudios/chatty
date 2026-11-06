'use client';

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { springs } from "@/theme/tokens";

interface VideoLightboxProps {
  src: string | null;
  onClose: () => void;
}

/** Full-screen, edge-to-edge video lightbox with native playback controls. */
export function VideoLightbox({ src, onClose }: VideoLightboxProps) {
  useEffect(() => {
    if (!src) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [src, onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {src && (
        <motion.div
          key="video-lightbox"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="dialog"
          aria-modal="true"
          aria-label="Full-screen video player"
          className="fixed inset-0 z-50 flex items-center justify-center bg-page/95 p-3 text-ink backdrop-blur-md sm:p-6"
          onClick={onClose}
        >
          <motion.button
            type="button"
            onClick={onClose}
            whileTap={{ scale: 0.9, rotate: 90 }}
            transition={springs.snappy}
            aria-label="Close video"
            className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] z-10 flex size-11 items-center justify-center rounded-full border-2 border-line bg-card text-ink"
          >
            <X size={20} strokeWidth={2.8} aria-hidden />
          </motion.button>
          <motion.video
            key={src}
            src={src}
            controls
            autoPlay
            playsInline
            preload="metadata"
            controlsList="nodownload noremoteplayback"
            disablePictureInPicture
            onContextMenu={(event) => event.preventDefault()}
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.94, opacity: 0 }}
            transition={springs.bouncy}
            onClick={(event) => event.stopPropagation()}
            className="max-h-[88dvh] w-full max-w-5xl rounded-2xl border-2 border-white/20 bg-black object-contain shadow-2xl"
          />
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
