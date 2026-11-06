'use client';

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Expand, Loader2, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { formatVideoTime } from "@/lib/video";
import { isBrowserOffline, readVideoBlob } from "@/lib/offlineCache";
import { springs } from "@/theme/tokens";
import { cn } from "@/utils/cn";
import { VideoLightbox } from "@/components/feed/VideoLightbox";

interface VideoPostPlayerProps {
  src: string;
  durationSeconds?: number | null;
  edgeToEdge?: boolean;
}

/** TikTok-style video: muted autoplay in view, pause offscreen, custom overlays. */
export function VideoPostPlayer({ src, durationSeconds, edgeToEdge = false }: VideoPostPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(durationSeconds ?? 0);
  const [loading, setLoading] = useState(true);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [cachedVideo, setCachedVideo] = useState<{ source: string; objectUrl: string } | null>(null);
  const playbackSrc = cachedVideo?.source === src ? cachedVideo.objectUrl : src;

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    const loadOfflineVideo = async () => {
      if (!isBrowserOffline()) return;
      try {
        const blob = await readVideoBlob(src);
        if (active && blob) {
          objectUrl = URL.createObjectURL(blob);
          setCachedVideo({ source: src, objectUrl });
        }
      } catch (error) {
        console.warn("Could not read the cached video.", error);
      }
    };
    const handleOffline = () => void loadOfflineVideo();
    void loadOfflineVideo();
    window.addEventListener("offline", handleOffline);
    return () => {
      active = false;
      window.removeEventListener("offline", handleOffline);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);

  useEffect(() => {
    const container = containerRef.current;
    const video = videoRef.current;
    if (!container || !video) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
          video.muted = true;
          setMuted(true);
          void video.play().catch(() => setPlaying(false));
        } else {
          video.pause();
        }
      },
      { threshold: [0, 0.6, 1] }
    );
    observer.observe(container);
    return () => {
      observer.disconnect();
      video.pause();
    };
  }, [playbackSrc]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play().catch(() => undefined);
    else video.pause();
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
  };

  const progress = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <>
      <div
        ref={containerRef}
        className={cn(
          "group relative aspect-video w-full overflow-hidden bg-black",
          edgeToEdge
            ? "rounded-none border-0 shadow-none"
            : "rounded-[22px] border-2 border-line shadow-[0_4px_0_var(--border-color)]"
        )}
      >
        <video
          ref={videoRef}
          src={playbackSrc}
          controlsList="nodownload noremoteplayback"
          disablePictureInPicture
          playsInline
          loop
          muted={muted}
          preload="metadata"
          onContextMenu={(event) => event.preventDefault()}
          onClick={togglePlay}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onLoadedMetadata={(event) => {
            setDuration(event.currentTarget.duration || durationSeconds || 0);
            setLoading(false);
          }}
          onWaiting={() => setLoading(true)}
          onCanPlay={() => setLoading(false)}
          onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
          className="size-full cursor-pointer object-contain"
          aria-label="Video gist"
        />

        {loading && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/25 text-white">
            <Loader2 size={24} className="animate-spin" aria-label="Loading video" />
          </span>
        )}

        {/* Play / pause center overlay */}
        <motion.button
          type="button"
          onClick={togglePlay}
          whileTap={{ scale: 0.9 }}
          transition={springs.snappy}
          aria-label={playing ? "Pause video" : "Play video"}
          className={cn(
            "absolute left-1/2 top-1/2 flex size-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white/30 bg-black/55 text-white backdrop-blur-md transition-opacity",
            playing ? "opacity-0 group-hover:opacity-100" : "opacity-100"
          )}
        >
          {playing ? <Pause size={25} fill="currentColor" aria-hidden /> : <Play size={25} fill="currentColor" className="ml-1" aria-hidden />}
        </motion.button>

        {/* Bottom control bar */}
        <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-linear-to-t from-black/85 to-transparent px-3 pb-2.5 pt-10">
          <button
            type="button"
            onClick={toggleMute}
            aria-label={muted ? "Unmute video" : "Mute video"}
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur"
          >
            {muted ? <VolumeX size={17} aria-hidden /> : <Volume2 size={17} aria-hidden />}
          </button>
          <span className="shrink-0 text-[10px] font-bold tabular-nums text-white/85">
            {formatVideoTime(currentTime)} / {formatVideoTime(duration)}
          </span>
          <button
            type="button"
            onClick={() => setLightboxOpen(true)}
            aria-label="Open video full screen"
            className="ml-auto flex size-11 shrink-0 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur"
          >
            <Expand size={16} aria-hidden />
          </button>
        </div>
        <div className="absolute inset-x-0 bottom-0 h-1 bg-white/25">
          <div className="h-full bg-[#8B5CF6] transition-[width] duration-150" style={{ width: `${progress}%` }} />
        </div>
      </div>
      <VideoLightbox src={lightboxOpen ? playbackSrc : null} onClose={() => setLightboxOpen(false)} />
    </>
  );
}
