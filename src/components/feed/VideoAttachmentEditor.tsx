import { useState } from "react";
import { motion } from "framer-motion";
import { Loader2, Pause, Play, Scissors, Volume2, VolumeX, X } from "lucide-react";
import { describeError } from "../../lib/supabase";
import { formatVideoTime, trimVideoFile } from "../../lib/video";
import { formatBytes } from "../../lib/imageCompression";
import { springs } from "../../theme/tokens";
import { useToast } from "../ui/Toast";
import { cn } from "../../utils/cn";

export interface VideoAttachmentDraft {
  file: File;
  previewUrl: string;
  duration: number;
  width: number;
  height: number;
}

interface VideoAttachmentEditorProps {
  draft: VideoAttachmentDraft;
  onReplace: (draft: VideoAttachmentDraft) => void;
  onRemove: () => void;
}

/** Interactive upload preview with play/pause, mute, trim, and remove controls. */
export function VideoAttachmentEditor({ draft, onReplace, onRemove }: VideoAttachmentEditorProps) {
  const { toast } = useToast();
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(draft.duration);
  const [trimming, setTrimming] = useState(false);

  const togglePlay = () => {
    if (!videoEl) return;
    if (videoEl.paused) void videoEl.play().catch(() => undefined);
    else videoEl.pause();
  };

  const applyTrim = async () => {
    if (end - start < 0.4) {
      toast("Select at least 0.4 seconds for your clip.", "danger");
      return;
    }
    setTrimming(true);
    try {
      const trimmed = await trimVideoFile(draft.file, start, end);
      onReplace({
        file: trimmed,
        previewUrl: URL.createObjectURL(trimmed),
        duration: end - start,
        width: draft.width,
        height: draft.height,
      });
      setStart(0);
      setEnd(end - start);
      toast(`Trimmed to ${formatVideoTime(end - start)}!`, "success");
    } catch (error) {
      toast(describeError(error, "Could not trim this clip."), "danger");
    } finally {
      setTrimming(false);
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={springs.bouncy}
      className="overflow-hidden rounded-2xl border-2 border-line bg-page p-2 shadow-[0_3px_0_var(--border-color)]"
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
          className="aspect-[16/10] w-full cursor-pointer object-contain"
          aria-label="Video upload preview"
        />
        <motion.button
          type="button"
          onClick={togglePlay}
          whileTap={{ scale: 0.9 }}
          transition={springs.snappy}
          aria-label={playing ? "Pause preview" : "Play preview"}
          className={cn(
            "absolute left-1/2 top-1/2 flex size-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white/30 bg-black/60 text-white backdrop-blur",
            playing && "opacity-0 hover:opacity-100"
          )}
        >
          {playing ? <Pause size={21} fill="currentColor" aria-hidden /> : <Play size={21} fill="currentColor" className="ml-0.5" aria-hidden />}
        </motion.button>
        <button
          type="button"
          onClick={() => {
            if (!videoEl) return;
            videoEl.muted = !videoEl.muted;
            setMuted(videoEl.muted);
          }}
          aria-label={muted ? "Unmute preview" : "Mute preview"}
          className="absolute bottom-2 left-2 flex size-8 items-center justify-center rounded-full bg-black/65 text-white"
        >
          {muted ? <VolumeX size={15} aria-hidden /> : <Volume2 size={15} aria-hidden />}
        </button>
        <motion.button
          type="button"
          whileTap={{ scale: 0.85, rotate: 90 }}
          transition={springs.snappy}
          onClick={onRemove}
          aria-label="Remove video"
          className="absolute right-2 top-2 flex size-8 items-center justify-center rounded-full border border-white/25 bg-black/80 text-white hover:bg-danger"
        >
          <X size={15} strokeWidth={2.8} aria-hidden />
        </motion.button>
      </div>

      <div className="mt-2.5 space-y-2 px-1">
        <div className="flex items-center justify-between gap-2 text-[10px] font-bold text-ink-muted">
          <span>{draft.width}×{draft.height} · {formatBytes(draft.file.size)}</span>
          <span>{formatVideoTime(start)}–{formatVideoTime(end)} / {formatVideoTime(draft.duration)}</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-[9px] font-black uppercase tracking-wider text-ink-muted">Trim start</span>
            <input
              type="range"
              min={0}
              max={Math.max(0, draft.duration - 0.4)}
              step={0.1}
              value={Math.min(start, Math.max(0, draft.duration - 0.4))}
              onChange={(event) => {
                const next = Number(event.target.value);
                setStart(next);
                if (next >= end) setEnd(Math.min(draft.duration, next + 0.4));
                if (videoEl) videoEl.currentTime = next;
              }}
              className="w-full accent-[#8B5CF6]"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[9px] font-black uppercase tracking-wider text-ink-muted">Trim end</span>
            <input
              type="range"
              min={0.4}
              max={draft.duration}
              step={0.1}
              value={Math.min(end, draft.duration)}
              onChange={(event) => {
                const next = Number(event.target.value);
                setEnd(next);
                if (next <= start) setStart(Math.max(0, next - 0.4));
                if (videoEl) videoEl.currentTime = next;
              }}
              className="w-full accent-[#8B5CF6]"
            />
          </label>
        </div>
        <motion.button
          type="button"
          whileTap={{ scale: 0.97, y: 2 }}
          transition={springs.snappy}
          onClick={applyTrim}
          disabled={trimming}
          className="flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border-2 border-line bg-card text-[11px] font-extrabold text-brand-deep shadow-[0_2px_0_var(--border-color)] hover:border-brand disabled:opacity-50"
        >
          {trimming ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Scissors size={13} strokeWidth={2.6} aria-hidden />}
          {trimming ? "Trimming clip…" : "Apply trim before posting"}
        </motion.button>
      </div>
    </motion.div>
  );
}
