"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { VerifiedBadge } from "@/components/profile/VerifiedBadge";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/Toast";
import { describeError } from "@/lib/supabase";
import {
  createSchoolHighlight,
  fetchSchoolHighlights,
  type SchoolHighlight,
} from "@/services/schoolHighlightsService";

const IMAGE_STORY_MS = 5_000;

export function SchoolHighlightsReel({
  schoolId,
  schoolName,
}: {
  schoolId: string | null;
  schoolName?: string;
}) {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [highlights, setHighlights] = useState<SchoolHighlight[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      setHighlights(await fetchSchoolHighlights(schoolId));
    } catch (error) {
      toast(describeError(error, "Highlights could not be loaded."), "danger");
    } finally {
      setLoading(false);
    }
  }, [schoolId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const ownHighlight = highlights.some((highlight) => highlight.userId === user?.id);
  const canShare = Boolean(!loading && schoolId && user && profile?.schoolId === schoolId && !ownHighlight);

  const moveStory = useCallback((step: number) => {
    setSelectedIndex((current) => {
      if (current === null) return null;
      const next = current + step;
      return next >= 0 && next < highlights.length ? next : null;
    });
  }, [highlights.length]);

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    setUploading(true);
    try {
      if (!schoolId) throw new Error("Choose your school before sharing a highlight.");
      await createSchoolHighlight(schoolId, file);
      await load();
      toast("Your highlight is live for 24 hours.", "success");
    } catch (error) {
      toast(describeError(error, "Highlight could not be shared."), "danger");
    } finally {
      setUploading(false);
    }
  };

  const activeStory = selectedIndex === null ? null : highlights[selectedIndex] ?? null;
  useEffect(() => {
    if (!activeStory || activeStory.mediaType === "video") return;
    const timeout = setTimeout(() => moveStory(1), IMAGE_STORY_MS);
    return () => clearTimeout(timeout);
  }, [activeStory, moveStory]);

  useEffect(() => {
    if (!activeStory) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedIndex(null);
      if (event.key === "ArrowRight") moveStory(1);
      if (event.key === "ArrowLeft") moveStory(-1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeStory, moveStory]);

  return (
    <>
      <section aria-label={`${schoolName ?? "School"} highlights`} className="my-4 rounded-2xl border-2 border-line bg-card px-3 py-3 shadow-[0_3px_0_var(--border-color)]">
        <div className="flex items-start gap-3 overflow-x-auto pb-1 [scrollbar-width:none]">
          {canShare && (
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={uploading}
              className="flex w-[74px] shrink-0 flex-col items-center gap-1.5 text-center"
            >
              <span className="relative flex size-[62px] items-center justify-center rounded-full border-2 border-dashed border-sky-400 bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">
                {uploading ? <Loader2 size={21} className="animate-spin" aria-hidden /> : <ImagePlus size={21} aria-hidden />}
                {!uploading && <span className="absolute -bottom-0.5 -right-0.5 flex size-5 items-center justify-center rounded-full border-2 border-card bg-sky-500 text-white">+</span>}
              </span>
              <span className="max-w-full truncate text-[10px] font-bold text-ink-muted">{uploading ? "Sharing…" : "Add highlight"}</span>
            </button>
          )}
          {highlights.map((highlight, index) => (
            <button
              key={highlight.id}
              type="button"
              onClick={() => setSelectedIndex(index)}
              className="flex w-[74px] shrink-0 flex-col items-center gap-1.5 text-center"
              aria-label={`View ${highlight.author.username}'s highlight`}
            >
              <span className="flex size-[62px] items-center justify-center rounded-full bg-gradient-to-br from-fuchsia-500 via-rose-500 to-amber-400 p-[3px] shadow-[0_0_14px_rgba(236,72,153,0.3)]">
                <span className="flex size-full items-center justify-center rounded-full border-2 border-card bg-card">
                  <Avatar name={highlight.author.username} src={highlight.author.avatarUrl} size="md" />
                </span>
              </span>
              <span className="flex max-w-full items-center gap-0.5 truncate text-[10px] font-bold text-ink">
                <span className="truncate">{highlight.author.username}</span>
                <VerifiedBadge
                  isVerified={highlight.author.isVerified}
                  verifiedExpiresAt={highlight.author.verifiedExpiresAt}
                  verifiedTitle={highlight.author.verifiedTitle}
                  isAdmin={highlight.author.isAdmin}
                  role={highlight.author.role}
                />
              </span>
            </button>
          ))}
          {!loading && !canShare && highlights.length === 0 && (
            <p className="py-2 text-xs font-semibold text-ink-muted">No highlights yet.</p>
          )}
          {loading && <Loader2 size={16} className="m-5 animate-spin text-brand-deep" aria-label="Loading highlights" />}
        </div>
        {canShare && <p className="mt-1 text-[10px] font-semibold text-ink-muted">One photo or short video. It stays for 24 hours.</p>}
        <input
          ref={fileInput}
          type="file"
          accept="image/*,video/mp4,video/webm,video/quicktime,video/ogg"
          onChange={(event) => void upload(event)}
          className="sr-only"
          aria-label="Choose a photo or short video"
        />
      </section>

      {activeStory && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/95 p-3 text-white" role="dialog" aria-modal="true" aria-label={`${activeStory.author.username}'s highlight`}>
          <div className="relative flex h-[min(90dvh,780px)] w-full max-w-[430px] flex-col overflow-hidden rounded-3xl bg-neutral-950">
            <div className="absolute inset-x-0 top-0 z-10 p-3">
              <div className="mb-3 flex gap-1" aria-hidden="true">
                {highlights.map((highlight, index) => (
                  <span key={highlight.id} className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/35">
                    <span className={`block h-full bg-white ${index < selectedIndex! ? "w-full" : index === selectedIndex ? "w-full" : "w-0"}`} />
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Avatar name={activeStory.author.username} src={activeStory.author.avatarUrl} size="sm" />
                <span className="text-sm font-extrabold">{activeStory.author.username}</span>
                <VerifiedBadge
                  isVerified={activeStory.author.isVerified}
                  verifiedExpiresAt={activeStory.author.verifiedExpiresAt}
                  verifiedTitle={activeStory.author.verifiedTitle}
                  isAdmin={activeStory.author.isAdmin}
                  role={activeStory.author.role}
                />
                <button type="button" onClick={() => setSelectedIndex(null)} className="ml-auto flex size-10 items-center justify-center rounded-full bg-black/35" aria-label="Close highlight">
                  <X size={20} aria-hidden />
                </button>
              </div>
            </div>
            {activeStory.mediaType === "video" ? (
              <video
                key={activeStory.id}
                src={activeStory.mediaUrl}
                poster={activeStory.thumbnailUrl ?? undefined}
                autoPlay
                playsInline
                onEnded={() => moveStory(1)}
                onError={() => moveStory(1)}
                className="h-full w-full object-contain"
              />
            ) : (
              <img src={activeStory.mediaUrl} alt={`${activeStory.author.username}'s school highlight`} className="h-full w-full object-contain" />
            )}
            <button type="button" onClick={() => moveStory(-1)} aria-label="Previous highlight" className="absolute inset-y-16 left-0 w-1/3" />
            <button type="button" onClick={() => moveStory(1)} aria-label="Next highlight" className="absolute inset-y-16 right-0 w-2/3" />
          </div>
        </div>
      )}
    </>
  );
}
