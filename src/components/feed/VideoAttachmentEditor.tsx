import { useState } from "react";
import { motion } from "framer-motion";
import { Pause, Play, Volume2, VolumeX, X } from "lucide-react";
import { formatBytes } from "../../lib/imageCompression";
import { springs } from "../../theme/tokens";

export interface VideoAttachmentDraft {
  file: File;
  previewUrl: string;
  duration: number;
  width: number;
  height: number;
}

interface VideoAttachmentEditorProps {
  draft: VideoAttachmentDraft;
  onRemove: () => void;
}

/** Standard upload preview with playback, mute, and remove controls. */
export function VideoAttachmentEditor({ draft, onRemove }: VideoAttachmentEditorProps) {
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);

  const togglePlay = () => {
    if (!videoEl) return;
    if (videoEl.paused) void videoEl.play().catch(() => undefined);
    else videoEl.pause();
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={springs.bouncy}
      className="overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-2"
    >
      <div className="relative overflow-hidden rounded-xl bg-black">
        <video
          ref={setVideoEl}
          src={draft.previewUrl}
          playsInline
          muted={muted}
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onClick={togglePlay}
          className="aspect-9/16 max-h-80 w-full cursor-pointer object-contain"
          aria-label="Video upload preview"
        />
        <button
          type="button"
          onClick={togglePlay}
          aria-label={playing ? "Pause preview" : "Play preview"}
          className="absolute left-1/2 top-1/2 flex size-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/25 bg-black/65 text-white backdrop-blur"
        >
          {playing ? <Pause size={21} fill="currentColor" aria-hidden /> : <Play size={21} fill="currentColor" className="ml-0.5" aria-hidden />}
        </button>
        <button
          type="button"
          onClick={() => {
            if (!videoEl) return;
            videoEl.muted = !videoEl.muted;
            setMuted(videoEl.muted);
          }}
          aria-label={muted ? "Unmute preview" : "Mute preview"}
          className="absolute bottom-2 left-2 flex size-10 items-center justify-center rounded-full bg-black/70 text-white"
        >
          {muted ? <VolumeX size={16} aria-hidden /> : <Volume2 size={16} aria-hidden />}
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove video"
          className="absolute right-2 top-2 flex size-10 items-center justify-center rounded-full border border-white/25 bg-black/80 text-white hover:bg-red-600"
        >
          <X size={16} strokeWidth={2.8} aria-hidden />
        </button>
      </div>
      <p className="px-1 pt-2 text-[10px] font-bold text-white/55">
        {draft.width}×{draft.height} · {formatBytes(draft.file.size)}
      </p>
    </motion.div>
  );
}
