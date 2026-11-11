"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { SchoolBadge } from "@/components/ui/SchoolBadge";
import { VerifiedBadge } from "@/components/profile/VerifiedBadge";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/Toast";
import { describeError } from "@/lib/supabase";
import { useGistStore } from "@/store/gistStore";
import {
  createSchoolHighlight,
  fetchSchoolHighlights,
  type SchoolHighlight,
} from "@/services/schoolHighlightsService";

const IMAGE_STORY_MS = 5_000;

export function SchoolHighlightsReel({
  schoolId,
  schoolName,
  variant = "reel",
  children,
  className,
  promptOnOpen = false,
  onViewProfile,
}: {
  schoolId: string | null;
  schoolName?: string;
  variant?: "reel" | "avatar" | "story-bar";
  children?: ReactNode;
  className?: string;
  promptOnOpen?: boolean;
  onViewProfile?: () => void;
}) {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const schools = useGistStore((state) => state.schools);
  const fileInput = useRef<HTMLInputElement>(null);
  const [highlights, setHighlights] = useState<SchoolHighlight[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [selectedHighlights, setSelectedHighlights] = useState<SchoolHighlight[]>([]);
  const [promptOpen, setPromptOpen] = useState(false);

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
  const shareSchoolId = schoolId ?? profile?.schoolId ?? null;
  const canShare = Boolean(!loading && shareSchoolId && user && profile?.schoolId === shareSchoolId && !ownHighlight);

  const moveStory = useCallback((step: number) => {
    setSelectedIndex((current) => {
      if (current === null) return null;
      const next = current + step;
      return next >= 0 && next < selectedHighlights.length ? next : null;
    });
  }, [selectedHighlights.length]);

  const openStories = (stories: SchoolHighlight[], index = 0) => {
    setSelectedHighlights(stories);
    setSelectedIndex(index);
  };

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    setUploading(true);
    try {
      if (!shareSchoolId) throw new Error("Choose your school before sharing a highlight.");
      await createSchoolHighlight(shareSchoolId, file);
      await load();
      toast("Your highlight is live for 24 hours.", "success");
    } catch (error) {
      toast(describeError(error, "Highlight could not be shared."), "danger");
    } finally {
      setUploading(false);
    }
  };

  const activeStory = selectedIndex === null ? null : selectedHighlights[selectedIndex] ?? null;
  const openAvatar = () => {
    if (highlights.length > 0) {
      if (promptOnOpen) setPromptOpen(true);
      else openStories(highlights);
    } else if (canShare) {
      fileInput.current?.click();
    } else {
      onViewProfile?.();
    }
  };
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
      {variant === "story-bar" ? (
        <section aria-label="School highlights" className="relative min-w-0">
          <div className="flex items-center gap-3 overflow-x-auto pb-1 [scrollbar-width:none]">
            {(() => {
              const groups = new Map<string, SchoolHighlight[]>();
              for (const highlight of highlights) {
                const group = groups.get(highlight.schoolId) ?? [];
                group.push(highlight);
                groups.set(highlight.schoolId, group);
              }
              const primarySchool = schools.find((school) => school.id === profile?.schoolId);
              const primarySchoolId = profile?.schoolId ?? null;
              const primaryStories = profile?.schoolId ? groups.get(profile.schoolId) ?? [] : [];
              const otherGroups = [...groups.entries()].filter(([id]) => id !== profile?.schoolId);

              return (
                <>
                  {primarySchoolId && (primaryStories.length > 0 || canShare) && (
                    <div className="relative flex w-[72px] shrink-0 flex-col items-center gap-1">
                      <button
                        type="button"
                        onClick={() => primaryStories.length > 0 ? openStories(primaryStories) : canShare && fileInput.current?.click()}
                        disabled={primaryStories.length === 0 && !canShare}
                        aria-label={primaryStories.length ? `View ${primarySchool?.name ?? "school"} highlights` : `Add a highlight for ${primarySchool?.name ?? "your school"}`}
                        className={`flex size-[62px] items-center justify-center rounded-full p-[3px] disabled:opacity-70 ${primaryStories.length ? "bg-gradient-to-br from-fuchsia-500 via-rose-500 to-amber-400 shadow-[0_0_16px_rgba(236,72,153,0.35)]" : "border-2 border-dashed border-sky-400 bg-card"}`}
                      >
                        <span className="relative flex size-full items-center justify-center rounded-full border-2 border-card bg-card">
                          <SchoolBadge schoolId={primarySchoolId} crestUrl={primarySchool?.crestUrl} name={primarySchool?.name ?? "My school"} size="lg" />
                        </span>
                      </button>
                      {canShare && (
                        <button
                          type="button"
                          onClick={() => fileInput.current?.click()}
                          disabled={uploading}
                          aria-label="Add a school highlight"
                          className="absolute right-0 top-9 flex size-7 items-center justify-center rounded-full border-2 border-card bg-sky-500 text-white shadow-lg"
                        >
                          {uploading ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <ImagePlus size={14} aria-hidden />}
                        </button>
                      )}
                      <span className="max-w-full truncate text-center text-[10px] font-bold text-ink">
                        {primarySchool?.shortName ?? "My school"}
                      </span>
                    </div>
                  )}
                  {otherGroups.map(([groupSchoolId, stories]) => {
                    const school = schools.find((item) => item.id === groupSchoolId);
                    const name = school?.name ?? stories[0]?.author.username ?? "School";
                    return (
                      <button
                        key={groupSchoolId}
                        type="button"
                        onClick={() => openStories(stories)}
                        aria-label={`View ${name} highlights`}
                        className="flex w-[72px] shrink-0 flex-col items-center gap-1"
                      >
                        <span className="flex size-[62px] items-center justify-center rounded-full bg-gradient-to-br from-fuchsia-500 via-rose-500 to-amber-400 p-[3px] shadow-[0_0_16px_rgba(236,72,153,0.35)]">
                          <span className="flex size-full items-center justify-center rounded-full border-2 border-card bg-card">
                            <SchoolBadge schoolId={groupSchoolId} crestUrl={school?.crestUrl} name={name} size="lg" />
                          </span>
                        </span>
                        <span className="max-w-full truncate text-center text-[10px] font-bold text-ink">
                          {school?.shortName ?? name}
                        </span>
                      </button>
                    );
                  })}
                  {!loading && groups.size === 0 && !primarySchoolId && (
                    <p className="py-2 text-xs font-semibold text-ink-muted">School highlights will appear here.</p>
                  )}
                  {loading && <Loader2 size={16} className="m-5 animate-spin text-brand-deep" aria-label="Loading highlights" />}
                </>
              );
            })()}
          </div>
          {canShare && <p className="mt-1 text-[10px] font-semibold text-ink-muted">Share one photo or short video. It stays for 24 hours.</p>}
        </section>
      ) : variant === "avatar" ? (
        <div className={`relative inline-flex shrink-0 ${className ?? ""}`}>
          <button
            type="button"
            onClick={openAvatar}
            aria-label={highlights.length ? `Open ${schoolName ?? "school"} highlights` : canShare ? "Add a school highlight" : `View ${schoolName ?? "school"} profile`}
            className="size-full rounded-full focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft"
          >
            <span className={`flex rounded-full p-[3px] transition-shadow ${highlights.length ? "bg-gradient-to-br from-fuchsia-500 via-rose-500 to-amber-400 shadow-[0_0_18px_rgba(236,72,153,0.5)]" : "bg-transparent"}`}>
              <span className="flex rounded-full bg-card p-[2px]">{children}</span>
            </span>
          </button>
          {canShare && (
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={uploading}
              aria-label="Add a highlight"
              className="absolute -bottom-1 -right-1 z-10 flex size-8 items-center justify-center rounded-full border-2 border-card bg-sky-500 text-white shadow-lg"
            >
              {uploading ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <ImagePlus size={15} aria-hidden />}
            </button>
          )}
        </div>
      ) : (
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
              onClick={() => openStories(highlights, index)}
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
      </section>
      )}

      <input
        ref={fileInput}
        type="file"
        accept="image/*,video/mp4,video/webm,video/quicktime,video/ogg"
        onChange={(event) => void upload(event)}
        className="sr-only"
        aria-label="Choose a photo or short video"
      />

      {promptOpen && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/65 p-4" role="dialog" aria-modal="true" aria-labelledby="highlight-choice-title">
          <div className="w-full max-w-xs rounded-2xl border border-line bg-card p-4 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <h2 id="highlight-choice-title" className="text-sm font-extrabold text-ink">{schoolName ?? "School"}</h2>
              <button type="button" onClick={() => setPromptOpen(false)} aria-label="Close choices" className="flex size-9 items-center justify-center rounded-xl text-ink-muted hover:bg-page">
                <X size={17} aria-hidden />
              </button>
            </div>
            <div className="mt-3 grid gap-2">
              <button
                type="button"
                onClick={() => {
                  setPromptOpen(false);
                  onViewProfile?.();
                }}
                className="min-h-11 rounded-xl border-2 border-line bg-page px-3 text-left text-sm font-bold text-ink hover:border-brand"
              >
                View Profile
              </button>
              <button
                type="button"
                onClick={() => {
                  setPromptOpen(false);
                  openStories(highlights);
                }}
                className="min-h-11 rounded-xl bg-brand-deep px-3 text-left text-sm font-bold text-brand-contrast hover:brightness-110"
              >
                View the Highlight
              </button>
            </div>
          </div>
        </div>
      )}
      {activeStory && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/95 p-3 text-white" role="dialog" aria-modal="true" aria-label={`${activeStory.author.username}'s highlight`}>
          <div className="relative flex h-[min(90dvh,780px)] w-full max-w-[430px] flex-col overflow-hidden rounded-3xl bg-neutral-950">
            <div className="absolute inset-x-0 top-0 z-10 p-3">
              <div className="mb-3 flex gap-1" aria-hidden="true">
                {selectedHighlights.map((highlight, index) => (
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
