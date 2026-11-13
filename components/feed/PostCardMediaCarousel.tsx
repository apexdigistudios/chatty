"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useAnimationControls, useInView } from "framer-motion";
import { VideoPostPlayer } from "@/components/feed/VideoPostPlayer";
import { ProgressiveImage } from "@/components/ui/ProgressiveImage";
import { springs } from "@/theme/tokens";
import { cn } from "@/utils/cn";
import type { MediaType } from "@/types/models";

export interface PostCardMediaItem {
  src: string;
  poster?: string | null;
  alt: string;
  type: MediaType;
  duration?: number | null;
}

interface PostCardMediaCarouselProps {
  media: PostCardMediaItem[];
  onOpenMedia: (index: number) => void;
}

const peekSpring = { type: "spring" as const, stiffness: 190, damping: 23, mass: 0.85 };

export function PostCardMediaCarousel({ media, onOpenMedia }: PostCardMediaCarouselProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const hasPeekedRef = useRef(false);
  const controls = useAnimationControls();
  const inView = useInView(viewportRef, { once: true, amount: 0.35 });
  const [width, setWidth] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return;
    const measure = () => setWidth(node.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    void controls.start({
      x: -activeIndex * width,
      transition: springs.snappy,
    });
  }, [activeIndex, controls, width]);

  useEffect(() => {
    if (!inView || width <= 0 || media.length < 2 || hasPeekedRef.current) return;
    hasPeekedRef.current = true;
    let active = true;
    const pause = () => new Promise<void>((resolve) => window.setTimeout(resolve, 500));

    void (async () => {
      await controls.start({ x: -width * 0.28, transition: peekSpring });
      if (!active) return;
      await pause();
      if (!active) return;
      await controls.start({ x: 0, transition: peekSpring });
    })();

    return () => {
      active = false;
    };
  }, [controls, inView, media.length, width]);

  const settleOnSlide = (offset: number, velocity: number) => {
    if (media.length < 2 || width <= 0) return;
    const projected = offset + velocity * 0.18;
    const threshold = Math.min(width * 0.18, 90);
    const direction = projected < -threshold ? 1 : projected > threshold ? -1 : 0;
    const next = Math.max(0, Math.min(media.length - 1, activeIndex + direction));
    setActiveIndex(next);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springs.gentle}
      className="-mx-4 mt-3 w-[calc(100%+2rem)]"
    >
      <div
        ref={viewportRef}
        className="relative overflow-hidden bg-neutral-950"
        aria-roledescription="carousel"
        aria-label="Post media"
      >
        <motion.div
          className="flex items-stretch"
          animate={controls}
          drag={media.length > 1 ? "x" : false}
          dragConstraints={{ left: -Math.max(0, (media.length - 1) * width), right: 0 }}
          dragElastic={0.06}
          dragMomentum={false}
          onDragEnd={(_, info) => settleOnSlide(info.offset.x, info.velocity.x)}
          style={{ touchAction: "pan-y" }}
        >
          {media.map((item, index) => (
            <div
              key={`${item.src}-${index}`}
              className="w-full min-w-full shrink-0"
              aria-hidden={index !== activeIndex}
            >
              {item.type === "video" ? (
                <VideoPostPlayer
                  src={item.src}
                  poster={item.poster}
                  durationSeconds={item.duration}
                  edgeToEdge
                  onOpenFullScreen={() => onOpenMedia(index)}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => onOpenMedia(index)}
                  aria-label={`Open full-screen: ${item.alt}`}
                  className="group relative block w-full cursor-zoom-in focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft"
                >
                  <ProgressiveImage
                    src={item.src}
                    alt={item.alt}
                    referrerPolicy="no-referrer"
                    containerClassName="aspect-[4/3] max-h-[480px] w-full bg-neutral-950"
                    fit="cover"
                  />
                </button>
              )}
            </div>
          ))}
        </motion.div>

        <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-black/65 px-2.5 py-1 text-[10px] font-extrabold tabular-nums text-white ring-1 ring-white/15 backdrop-blur">
          {activeIndex + 1}/{media.length}
        </span>

      </div>
      {media.length > 1 && (
        <div className="mt-1 flex justify-center">
          <div className="flex items-center gap-1" role="group" aria-label="Choose post media">
            {media.map((item, index) => (
              <button
                key={`${item.src}-dot-${index}`}
                type="button"
                onClick={() => setActiveIndex(index)}
                aria-label={`Show media ${index + 1} of ${media.length}`}
                aria-current={index === activeIndex ? "true" : undefined}
                className="flex size-5 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <motion.span
                  className={cn("block rounded-full", index === activeIndex ? "size-2 bg-brand-deep" : "size-1.5 bg-ink-faint")}
                  animate={{ scale: index === activeIndex ? 1 : 0.9, opacity: index === activeIndex ? 1 : 0.7 }}
                  transition={springs.snappy}
                />
              </button>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}
