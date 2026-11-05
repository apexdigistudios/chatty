'use client';

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useMotionValue, useTransform } from "framer-motion";
import { ChevronLeft, ChevronRight, Minus, Plus, RotateCcw, X } from "lucide-react";
import type { MediaItem } from "@/lib/media";
import { springs } from "@/theme/tokens";
import { cn } from "@/utils/cn";
import { SafeImage } from "@/components/common/SafeImage";

export interface ImageLightboxProps {
  images: MediaItem[];
  /** Index of the open image, or null when closed. */
  index: number | null;
  onClose: () => void;
}

const MIN_SCALE = 1;
const MAX_SCALE = 3.5;

/**
 * True full-screen, edge-to-edge image viewer. Portaled to <body> so it escapes
 * every card, overflow container and transform stacking context.
 */
export function ImageLightbox({ images, index, onClose }: ImageLightboxProps) {
  const isOpen = index !== null && images.length > 0;
  const [active, setActive] = useState(index ?? 0);
  const [scale, setScale] = useState(1);
  const dragY = useMotionValue(0);
  const backdropOpacity = useTransform(dragY, (y) => Math.max(0.3, 1 - Math.abs(y) / 460));
  const dragScale = useTransform(dragY, (y) => Math.max(0.86, 1 - Math.abs(y) / 1300));
  const stageRef = useRef<HTMLDivElement>(null);

  const image = images[Math.min(active, Math.max(0, images.length - 1))];

  const zoom = useCallback((next: number) => {
    setScale(Math.min(MAX_SCALE, Math.max(MIN_SCALE, Number(next.toFixed(2)))));
  }, []);
  const resetZoom = useCallback(() => setScale(1), []);

  useEffect(() => {
    if (!isOpen) return;
    setActive(index ?? 0);
    setScale(1);
    dragY.set(0);
  }, [isOpen, index, dragY]);

  useEffect(() => {
    setScale(1);
    dragY.set(0);
  }, [active, dragY]);

  useEffect(() => {
    if (!isOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      else if (event.key === "+" || event.key === "=") zoom(scale + 0.5);
      else if (event.key === "-") zoom(scale - 0.5);
      else if (event.key === "0") resetZoom();
      else if (event.key === "ArrowRight" && images.length > 1) setActive((i) => (i + 1) % images.length);
      else if (event.key === "ArrowLeft" && images.length > 1) setActive((i) => (i - 1 + images.length) % images.length);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [images.length, isOpen, onClose, resetZoom, scale, zoom]);

  useEffect(() => {
    if (!isOpen) return;
    const node = stageRef.current;
    if (!node) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      zoom(scale + (event.deltaY < 0 ? 0.25 : -0.25));
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [isOpen, scale, zoom]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && image && (
        <motion.div
          key="lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={image.alt || image.caption || "Full-screen image"}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          style={{ opacity: backdropOpacity }}
          className="fixed inset-0 z-50 flex h-dvh w-screen flex-col overflow-hidden bg-black/95 backdrop-blur-md"
        >
          <div className="absolute inset-0" onClick={onClose} aria-hidden />

          {/* Floating controls */}
          <div
            className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-2 px-3 pb-3 sm:px-5"
            style={{ paddingTop: "max(0.85rem, env(safe-area-inset-top))" }}
          >
            <span className="pointer-events-auto rounded-full border border-white/15 bg-black/60 px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-[0.14em] text-white/90 backdrop-blur-md">
              {images.length > 1 ? `${active + 1} / ${images.length}` : scale > 1 ? `${Math.round(scale * 100)}%` : "Full view"}
            </span>
            <div className="pointer-events-auto flex items-center gap-2">
              <div className="hidden items-center gap-1 rounded-full border border-white/15 bg-black/60 p-1 backdrop-blur-md sm:flex">
                <button type="button" onClick={() => zoom(scale - 0.5)} disabled={scale <= MIN_SCALE} aria-label="Zoom out" className="flex size-8 items-center justify-center rounded-full text-white hover:bg-white/15 disabled:opacity-35">
                  <Minus size={15} strokeWidth={2.6} aria-hidden />
                </button>
                <button type="button" onClick={resetZoom} disabled={scale === MIN_SCALE} aria-label="Reset zoom" className="flex size-8 items-center justify-center rounded-full text-white hover:bg-white/15 disabled:opacity-35">
                  <RotateCcw size={14} strokeWidth={2.6} aria-hidden />
                </button>
                <button type="button" onClick={() => zoom(scale + 0.5)} disabled={scale >= MAX_SCALE} aria-label="Zoom in" className="flex size-8 items-center justify-center rounded-full text-white hover:bg-white/15 disabled:opacity-35">
                  <Plus size={15} strokeWidth={2.6} aria-hidden />
                </button>
              </div>
              <motion.button
                type="button"
                onClick={onClose}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.9, rotate: 90 }}
                transition={springs.snappy}
                aria-label="Close full-screen image"
                className="flex size-11 items-center justify-center rounded-full border-2 border-white/25 bg-white text-[#0F0F11] shadow-[0_4px_16px_rgba(0,0,0,0.5)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand"
              >
                <X size={20} strokeWidth={2.9} aria-hidden />
              </motion.button>
            </div>
          </div>

          {images.length > 1 && (
            <>
              <button type="button" onClick={(e) => { e.stopPropagation(); setActive((i) => (i - 1 + images.length) % images.length); }} aria-label="Previous photo" className="absolute left-3 top-1/2 z-20 flex size-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/60 text-white backdrop-blur-md hover:bg-black/80">
                <ChevronLeft size={22} strokeWidth={2.6} aria-hidden />
              </button>
              <button type="button" onClick={(e) => { e.stopPropagation(); setActive((i) => (i + 1) % images.length); }} aria-label="Next photo" className="absolute right-3 top-1/2 z-20 flex size-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/60 text-white backdrop-blur-md hover:bg-black/80">
                <ChevronRight size={22} strokeWidth={2.6} aria-hidden />
              </button>
            </>
          )}

          {/* Edge-to-edge stage */}
          <div
            ref={stageRef}
            onClick={onClose}
            onDoubleClick={(event) => {
              event.stopPropagation();
              if (scale > 1) resetZoom();
              else zoom(2.25);
            }}
            className="relative z-10 flex h-full w-screen items-center justify-center overflow-hidden"
          >
            <motion.div
              key={`${image.src}-${active}`}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: scale > 1 ? scale : 1 }}
              exit={{ opacity: 0, scale: 0.92 }}
              transition={springs.bouncy}
              drag={scale > 1 ? true : "y"}
              dragConstraints={scale > 1 ? { left: -360, right: 360, top: -320, bottom: 320 } : { top: 0, bottom: 0 }}
              dragElastic={scale > 1 ? 0.1 : 0.5}
              onDragEnd={(_, info) => {
                if (scale > 1) return;
                if (Math.abs(info.offset.y) > 110 || Math.abs(info.velocity.y) > 620) onClose();
                else dragY.set(0);
              }}
              style={scale > 1 ? undefined : { y: dragY, scale: dragScale }}
              onClick={(event) => event.stopPropagation()}
              className={cn(
                "relative flex h-fit max-h-dvh w-fit max-w-[100vw] touch-none select-none items-center justify-center",
                scale > 1 ? "cursor-move" : "cursor-grab active:cursor-grabbing"
              )}
            >
              <SafeImage
                src={image.src}
                alt={image.alt || image.caption || "Gist image"}
                loading="lazy"
                decoding="async"
                draggable={false}
                referrerPolicy="no-referrer"
                className="block h-auto max-h-dvh w-screen max-w-[100vw] object-contain sm:w-auto"
              />
            </motion.div>
          </div>

          {(image.caption || image.alt) && (
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-linear-to-t from-black/90 via-black/55 to-transparent px-4 pt-12 text-center sm:px-8"
              style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
            >
              {image.caption && <p className="mx-auto max-w-2xl text-sm font-extrabold leading-snug text-white sm:text-base">{image.caption}</p>}
              <p className="mt-1 text-[11px] font-semibold text-white/60">Swipe down or tap backdrop to close · Double-tap to zoom</p>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
