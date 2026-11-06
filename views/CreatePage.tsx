'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { motion } from "framer-motion";
import { useNavigate, useSearchParams } from "@/lib/router";
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, Globe2, Hash, ImagePlus, Loader2, Send, Smile, X } from "lucide-react";
import { ImageLightbox } from "@/components/ui/ImageLightbox";
import { ProgressiveImage } from "@/components/ui/ProgressiveImage";
import { SchoolBadge } from "@/components/ui/SchoolBadge";
import { useToast } from "@/components/ui/Toast";
import { fetchGroup } from "@/services/groupsService";
import { useAuth } from "@/context/AuthContext";
import {
  COMPRESSION_PRESETS,
  compressImageWithStats,
  formatBytes,
} from "@/lib/imageCompression";
import { describeError } from "@/lib/supabase";
import { isUserGlobalAdmin } from "@/lib/adminAccess";
import { isVideoMime, readVideoMetadata } from "@/lib/video";
import { useGistStore } from "@/store/gistStore";
import { springs } from "@/theme/tokens";
import { MAX_POST_LENGTH, type SchoolGroup } from "@/types/models";
import { cn } from "@/utils/cn";

const MAX_IMAGES = 5;
const MAX_VIDEOS = 3;
const COMPOSER_EMOJIS = ["😀", "😂", "😍", "🥹", "🔥", "👏", "🎉", "💜", "👀", "🙏", "🤔", "😮"];

interface Attachment {
  kind: "image" | "video";
  file: File;
  previewUrl: string;
  originalBytes: number;
  compressedBytes: number;
  width: number;
  height: number;
  duration?: number;
}

/** Full-screen creator: gists → posts (+ storage uploads), confessions → moderation queue. */
export function CreatePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const { user, profile, isGlobalAdmin, loading: authLoading } = useAuth();
  const groupParam = searchParams.get("group");
  const [postGroup, setPostGroup] = useState<SchoolGroup | null>(null);

  const createPost = useGistStore((state) => state.createPost);
  const schools = useGistStore((state) => state.schools);
  const loadSchools = useGistStore((state) => state.loadSchools);

  const [content, setContent] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [compressing, setCompressing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);

  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const previewUrls = useRef(new Set<string>());

  const isGlobalAdminAuthor = isGlobalAdmin || isUserGlobalAdmin(user?.email);
  const schoolId = isGlobalAdminAuthor ? null : profile?.schoolId ?? null;
  const school = useMemo(() => schoolId ? schools.find((item) => item.id === schoolId) ?? null : null, [schoolId, schools]);
  const remaining = MAX_POST_LENGTH - content.length;
  const hasText = content.trim().length > 0;
  const hasMedia = attachments.length > 0;
  const canPublish =
    (hasText || hasMedia) &&
    (Boolean(schoolId) || isGlobalAdminAuthor) &&
    !publishing &&
    !compressing;
  const canContinue =
    hasMedia &&
    !publishing &&
    !compressing;
  const activeAttachment = attachments[previewIndex] ?? attachments[0] ?? null;
  const detectedHashtags = useMemo(
    () => [...new Set([...content.matchAll(/#([A-Za-z0-9_]{1,50})/g)].map((match) => match[1]!.toLowerCase()))],
    [content]
  );
  const hashtagSuggestions = useMemo(
    () => [...new Set([...detectedHashtags, "campusgist", "shslife", "letsGist"].map((item) => item.toLowerCase()))].slice(0, 6),
    [detectedHashtags]
  );
  const highlightedCaption = useMemo(
    () => content.split(/(#[A-Za-z0-9_]{1,50})/g).map((part, index) =>
      part.startsWith("#")
        ? <span key={index} className="font-extrabold text-brand-deep">{part}</span>
        : <span key={index}>{part}</span>
    ),
    [content]
  );

  // Optional club context passed from /schools/:id?tab=groups → "Post to <club>".
  useEffect(() => {
    if (!groupParam) {
      setPostGroup(null);
      return;
    }
    let active = true;
    fetchGroup(groupParam)
      .then((group) => {
        if (!active) return;
        setPostGroup(group?.schoolId === profile?.schoolId ? group : null);
      })
      .catch(() => active && setPostGroup(null));
    return () => {
      active = false;
    };
  }, [groupParam, profile?.schoolId]);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth?mode=signup&returnTo=%2Fcreate", { replace: true });
    }
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (schools.length === 0) void loadSchools();
  }, [schools.length, loadSchools]);

  useEffect(() => {
    if (previewIndex >= attachments.length) setPreviewIndex(Math.max(0, attachments.length - 1));
  }, [attachments.length, previewIndex]);

  useEffect(() => () => {
    previewUrls.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const createPreviewUrl = (file: File) => {
    const url = URL.createObjectURL(file);
    previewUrls.current.add(url);
    return url;
  };

  const syncHeight = useCallback(() => {
    const el = textRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(step === 1 ? 64 : 112, el.scrollHeight)}px`;
  }, [step]);
  useLayoutEffect(() => syncHeight(), [content, step, syncHeight]);

  const cancel = useCallback(() => {
    if (window.history.state?.idx > 0) navigate(-1);
    else navigate("/");
  }, [navigate]);

  const continueToDetails = () => {
    if (!canContinue) {
      if (!hasMedia) toast("Select an image or video before continuing.", "danger");
      return;
    }
    setStep(2);
    setEmojiPickerOpen(false);
  };

  const insertHashtag = (tag: string) => {
    const hashtag = `#${tag}`;
    setContent((current) => {
      if (new RegExp(`(^|\\s)${hashtag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=\\s|$)`, "i").test(current)) {
        return current;
      }
      return `${current.trimEnd()}${current.trim() ? " " : ""}${hashtag}`.slice(0, MAX_POST_LENGTH);
    });
    requestAnimationFrame(() => textRef.current?.focus());
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !publishing && lightboxIndex === null) {
        if (emojiPickerOpen) {
          setEmojiPickerOpen(false);
          return;
        }
        cancel();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cancel, emojiPickerOpen, lightboxIndex, publishing]);

  const pickFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) return;

    let remainingImages = MAX_IMAGES - attachments.filter((item) => item.kind === "image").length;
    let remainingVideos = MAX_VIDEOS - attachments.filter((item) => item.kind === "video").length;
    const accepted: File[] = [];
    for (const file of files) {
      if (isVideoMime(file.type) && remainingVideos > 0) {
        accepted.push(file);
        remainingVideos -= 1;
      } else if (file.type.startsWith("image/") && remainingImages > 0) {
        accepted.push(file);
        remainingImages -= 1;
      }
    }
    if (accepted.length < files.length) toast("A gist supports up to 5 images and 3 videos. Extra files were skipped.", "info");
    if (accepted.length === 0) return;

    setCompressing(true);
    try {
      const compressedList: Attachment[] = [];
      for (const rawFile of accepted) {
        if (isVideoMime(rawFile.type)) {
          const metadata = await readVideoMetadata(rawFile);
          compressedList.push({
            kind: "video",
            file: rawFile,
            previewUrl: createPreviewUrl(rawFile),
            originalBytes: rawFile.size,
            compressedBytes: rawFile.size,
            width: metadata.width,
            height: metadata.height,
            duration: metadata.duration,
          });
          continue;
        }
        const result = await compressImageWithStats(rawFile, COMPRESSION_PRESETS.posts);
        compressedList.push({
          kind: "image",
          file: result.file,
          previewUrl: createPreviewUrl(result.file),
          originalBytes: result.originalBytes,
          compressedBytes: result.compressedBytes,
          width: result.width,
          height: result.height,
        });
      }
      if (compressedList.length > 0) {
        setAttachments((prev) => [...prev, ...compressedList]);
        const first = compressedList[0]!;
        toast(
          first.kind === "video"
            ? `Video ready (${formatBytes(first.compressedBytes)}) — trim or publish it!`
            : `Optimized to ${formatBytes(first.compressedBytes)} (${first.file.type === "image/webp" ? "WebP" : "JPEG"}) for fast campus loading!`,
          "success"
        );
      }
    } catch (error) {
      toast(describeError(error, "Upload failed. Please check your file size and format."), "danger");
    } finally {
      setCompressing(false);
    }
  };

  const removeAttachment = (index: number) => {
    const removed = attachments[index];
    if (removed) {
      URL.revokeObjectURL(removed.previewUrl);
      previewUrls.current.delete(removed.previewUrl);
    }
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const moveAttachment = (index: number, offset: -1 | 1) => {
    const destination = index + offset;
    if (destination < 0 || destination >= attachments.length) return;
    setAttachments((current) => {
      const next = [...current];
      [next[index], next[destination]] = [next[destination]!, next[index]!];
      return next;
    });
    setPreviewIndex(destination);
  };

  const insertEmoji = (emoji: string) => {
    const textarea = textRef.current;
    const start = textarea?.selectionStart ?? content.length;
    const end = textarea?.selectionEnd ?? content.length;
    const next = `${content.slice(0, start)}${emoji}${content.slice(end)}`.slice(0, MAX_POST_LENGTH);
    setContent(next);
    setEmojiPickerOpen(false);
    requestAnimationFrame(() => {
      if (!textarea) return;
      textarea.focus();
      const cursor = Math.min(start + emoji.length, next.length);
      textarea.setSelectionRange(cursor, cursor);
    });
  };

  const publish = async () => {
    const text = content.trim();
    if ((!text && attachments.length === 0) || publishing || compressing) {
      if (!text && attachments.length === 0) {
        toast("Please add text, an image, or a video to publish.", "danger");
      }
      return;
    }
    if (!schoolId && !isGlobalAdminAuthor) {
      toast("Choose your school in your profile before publishing a gist.", "danger");
      return;
    }
    setPublishing(true);
    try {
      await createPost({
        content: text.slice(0, MAX_POST_LENGTH),
        schoolId,
        groupId: postGroup?.schoolId === schoolId ? postGroup.id : null,
        files: attachments.map((item) => item.file),
        videoDurations: attachments.map((item) => item.duration ?? null),
      });
      toast("Gist published to the feed!", "success");
      navigate("/");
    } catch (error) {
      toast(describeError(error), "danger");
    } finally {
      setPublishing(false);
    }
  };

  const imageAttachments = attachments.filter((item) => item.kind === "image");
  const lightboxImages = imageAttachments.map((item, index) => ({ src: item.previewUrl, alt: `Attachment ${index + 1}` }));

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 flex h-dvh w-full flex-col overflow-hidden bg-page text-ink"
    >
      <input
        ref={fileRef}
        type="file"
        multiple
        accept="image/*,video/mp4,video/webm,video/quicktime"
        onChange={pickFiles}
        className="sr-only"
        aria-label="Choose photos or videos"
      />
      <input
        ref={cameraRef}
        type="file"
        accept="video/*"
        capture="environment"
        onChange={pickFiles}
        className="sr-only"
        aria-label="Record or capture a video"
      />

      {step === 1 ? (
        <>
          <header className="relative z-40 flex shrink-0 items-center justify-between gap-3 border-b border-line bg-page/95 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur">
            <button type="button" onClick={cancel} aria-label="Close creator" className="flex size-11 items-center justify-center rounded-full border border-line bg-card text-ink hover:bg-page">
              <X size={21} strokeWidth={2.7} aria-hidden />
            </button>
            <div className="text-center">
              <p className="text-sm font-black text-ink">Create gist</p>
              <p className="text-[10px] font-bold text-ink-muted">Step 1 of 2 · Select media</p>
            </div>
            <button type="button" onClick={continueToDetails} disabled={!canContinue} className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-brand px-4 text-xs font-black text-white shadow-[0_3px_0_var(--brand-edge)] disabled:pointer-events-none disabled:opacity-40">
              Next <ArrowRight size={15} strokeWidth={2.8} aria-hidden />
            </button>
          </header>

          <main className="relative z-10 flex min-h-0 flex-1 flex-col items-center px-4 pb-4 pt-4 sm:px-6">
            {activeAttachment ? (
              <div className="flex min-h-0 w-full max-w-3xl flex-1 flex-col items-center justify-center">
                <div className="flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden rounded-3xl border border-line bg-card p-2 shadow-card">
                  {activeAttachment.kind === "video" ? (
                    <video
                      ref={previewVideoRef}
                      key={activeAttachment.previewUrl}
                      src={activeAttachment.previewUrl}
                      autoPlay
                      loop
                      muted
                      playsInline
                      controlsList="nodownload noremoteplayback"
                      disablePictureInPicture
                      onContextMenu={(event) => event.preventDefault()}
                      className="max-h-full max-w-full rounded-2xl object-contain"
                    />
                  ) : (
                    <img src={activeAttachment.previewUrl} alt={`Selected ${activeAttachment.kind}`} className="max-h-full max-w-full rounded-2xl object-contain" />
                  )}
                </div>
                <div className="mt-3 flex w-full flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-bold text-ink-muted">{previewIndex + 1} of {attachments.length} · {activeAttachment.kind}</p>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => moveAttachment(previewIndex, -1)} disabled={previewIndex === 0} aria-label="Move media earlier" className="flex size-10 items-center justify-center rounded-full border border-line bg-card text-ink hover:bg-page disabled:opacity-40"><ArrowLeft size={17} aria-hidden /></button>
                    <button type="button" onClick={() => moveAttachment(previewIndex, 1)} disabled={previewIndex >= attachments.length - 1} aria-label="Move media later" className="flex size-10 items-center justify-center rounded-full border border-line bg-card text-ink hover:bg-page disabled:opacity-40"><ArrowRight size={17} aria-hidden /></button>
                    <button type="button" onClick={() => removeAttachment(previewIndex)} aria-label="Remove selected media" className="flex size-10 items-center justify-center rounded-full border border-danger-soft bg-danger-wash text-danger hover:bg-danger-soft"><X size={17} aria-hidden /></button>
                  </div>
                </div>
                {attachments.length > 1 && (
                  <div className="no-scrollbar mt-3 flex w-full gap-2 overflow-x-auto pb-1">
                    {attachments.map((item, index) => (
                      <button key={item.previewUrl} type="button" onClick={() => setPreviewIndex(index)} aria-label={`Preview media ${index + 1}`} aria-pressed={previewIndex === index} className={cn("relative size-16 shrink-0 overflow-hidden rounded-xl border-2 bg-card", previewIndex === index ? "border-brand" : "border-line")}>
                        {item.kind === "video"
                          ? <video src={item.previewUrl} muted playsInline className="size-full object-cover" />
                          : <img src={item.previewUrl} alt="" className="size-full object-cover" />}
                        <span className="absolute bottom-1 right-1 rounded bg-black/65 px-1 text-[9px] font-black text-white">{index + 1}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex min-h-0 w-full max-w-3xl flex-1 flex-col items-center justify-center rounded-3xl border-2 border-dashed border-line bg-card px-8 text-center">
                <span className="flex size-20 items-center justify-center rounded-full border border-line bg-page text-ink-muted">
                  <ImagePlus size={28} aria-hidden />
                </span>
                <h1 className="mt-5 text-2xl font-black tracking-tight text-ink">Choose your media</h1>
                <p className="mt-2 text-sm font-semibold leading-relaxed text-ink-muted">
                  Select photos or videos to preview and arrange before adding your caption.
                </p>
              </div>
            )}

          </main>

          <footer className="w-full shrink-0 border-t border-line bg-page px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={compressing}
                className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-card px-4 text-xs font-extrabold text-ink hover:bg-page disabled:opacity-40"
              >
                {compressing ? <Loader2 size={17} className="animate-spin" aria-hidden /> : <ImagePlus size={17} aria-hidden />}
                Add photos/videos
              </button>
              <button
                type="button"
                onClick={() => cameraRef.current?.click()}
                disabled={compressing}
                aria-label={compressing ? "Preparing media" : "Record or upload media"}
                className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-card px-4 text-xs font-extrabold text-ink hover:bg-page disabled:opacity-50"
              >
                <ImagePlus size={17} aria-hidden />
                Record video
              </button>
            </div>
            <p className="mt-2 text-center text-[10px] font-semibold text-ink-muted">{attachments.length ? `${attachments.length} selected · up to 5 photos and 3 videos` : "Up to 5 photos and 3 videos"}</p>
          </footer>
        </>
      ) : (
        <>
          <header className="absolute inset-x-0 top-0 z-40 flex items-center justify-between border-b border-line bg-page/95 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur">
            <button type="button" onClick={() => setStep(1)} aria-label="Back to media studio" className="flex size-11 items-center justify-center rounded-full border border-line bg-card text-ink hover:bg-page"><ArrowLeft size={19} aria-hidden /></button>
            <div className="text-center">
              <p className="text-sm font-black text-ink">Post details</p>
              <p className="text-[10px] font-bold text-ink-muted">Step 2 of 2</p>
            </div>
            <span className="size-11" aria-hidden />
          </header>

          <motion.section
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={springs.gentle}
            className="absolute inset-x-0 bottom-0 top-[calc(4.5rem+env(safe-area-inset-top))] z-30 flex min-h-0 flex-col overflow-hidden border-t border-line bg-page"
            style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
          >
            <div className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-4 pb-4 pt-4 sm:px-7">
              <div className="flex items-center justify-between gap-3">
                <h1 className="text-lg font-black tracking-tight text-ink">Your post</h1>
                <span className={cn("shrink-0 text-xs font-extrabold tabular-nums", remaining <= 25 ? "text-danger" : "text-ink-muted")}>{content.length}/{MAX_POST_LENGTH}</span>
              </div>

              <section className="mt-3 rounded-2xl border border-line bg-card p-3" aria-labelledby="audience-title">
                <div className="flex items-center gap-2">
                  <span className="flex size-9 items-center justify-center rounded-xl bg-brand-wash text-brand-deep">
                    {isGlobalAdminAuthor ? <Globe2 size={17} aria-hidden /> : <SchoolBadge schoolId={school?.id} crestUrl={school?.crestUrl} name={school?.name ?? "School"} size="xs" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 id="audience-title" className="text-xs font-black text-ink">Audience</h2>
                    <p className="truncate text-[11px] font-semibold text-ink-muted">
                      {isGlobalAdminAuthor ? "All schools and communities" : school?.shortName ?? "Your school community"}
                      {postGroup ? ` · ${postGroup.name}` : ""}
                    </p>
                  </div>
                  <span className="rounded-full bg-brand-wash px-2.5 py-1 text-[10px] font-extrabold text-brand-deep">Public</span>
                </div>
              </section>

              {postGroup && (
                <div className="mt-3 flex items-center gap-2 rounded-xl border border-brand-soft bg-brand-wash px-3 py-2 text-xs font-bold text-brand-deep">
                  <span aria-hidden>{postGroup.emoji}</span> Posting into {postGroup.name}
                </div>
              )}
              {step === 2 && !schoolId && !isGlobalAdminAuthor && (
                <p role="status" className="mt-3 rounded-xl border border-warning-soft bg-warning-wash px-3 py-2 text-xs font-bold text-warning-deep">
                  Link your school in your profile before publishing.
                </p>
              )}

              <textarea
                ref={textRef}
                value={content}
                onChange={(event) => setContent(event.target.value.slice(0, MAX_POST_LENGTH))}
                maxLength={MAX_POST_LENGTH}
                rows={4}
                placeholder="Write a caption, add #hashtags, and tell everyone the gist…"
                aria-label="Gist caption and hashtags"
                className="mt-4 min-h-32 w-full resize-y rounded-2xl border border-line bg-card p-3 text-sm font-semibold leading-relaxed text-ink outline-none placeholder:text-ink-muted focus:border-brand"
              />
              <section className="mt-3 rounded-2xl border border-line bg-card p-3" aria-label="Hashtag suggestions">
                  <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-ink-muted"><Hash size={12} aria-hidden /> Tags (optional)</p>
                  {content && <p className="mt-2 whitespace-pre-wrap wrap-break-word text-xs font-semibold text-ink-soft">{highlightedCaption}</p>}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {hashtagSuggestions.map((tag) => (
                      <button key={tag} type="button" onClick={() => insertHashtag(tag)} className="min-h-8 rounded-full border border-brand-soft bg-brand-wash px-3 text-[10px] font-extrabold text-brand-deep">#{tag}</button>
                    ))}
                  </div>
              </section>

              {attachments.length > 0 && (
                <div className="mt-4">
                  <p className="mb-2 text-[10px] font-extrabold uppercase tracking-wider text-ink-muted">Selected media · {attachments.length}</p>
                  <div className="no-scrollbar flex gap-2 overflow-x-auto pb-2">
                    {attachments.map((item, index) => item.kind === "video" ? (
                      <div key={`${item.previewUrl}-${index}`} className="relative size-20 shrink-0 overflow-hidden rounded-xl border border-line bg-card">
                        <video src={item.previewUrl} muted playsInline controlsList="nodownload noremoteplayback" disablePictureInPicture onContextMenu={(event) => event.preventDefault()} className="size-full object-cover" />
                        <span className="absolute bottom-1 left-1 rounded bg-black/65 px-1.5 py-0.5 text-[9px] font-black text-white">Video</span>
                        <button type="button" onClick={() => removeAttachment(index)} aria-label={`Remove video ${index + 1}`} className="absolute right-1 top-1 flex size-7 items-center justify-center rounded-full bg-black/70 text-white"><X size={14} aria-hidden /></button>
                      </div>
                    ) : (
                      <div key={item.previewUrl} className="relative size-20 shrink-0 overflow-hidden rounded-xl border border-line bg-card">
                        <button type="button" onClick={() => setLightboxIndex(imageAttachments.findIndex((image) => image.previewUrl === item.previewUrl))} aria-label={`Preview photo ${index + 1}`} className="block size-full">
                          <ProgressiveImage src={item.previewUrl} alt={`Attachment ${index + 1}`} containerClassName="size-full" />
                        </button>
                        <button type="button" onClick={() => removeAttachment(index)} aria-label={`Remove photo ${index + 1}`} className="absolute right-1 top-1 flex size-7 items-center justify-center rounded-full bg-black/70 text-white"><X size={14} aria-hidden /></button>
                      </div>
                    ))}
                    <button type="button" onClick={() => fileRef.current?.click()} disabled={compressing} aria-label="Add more media" className="flex size-20 shrink-0 items-center justify-center rounded-xl border border-dashed border-line bg-card text-ink-muted hover:border-brand hover:text-brand-deep disabled:opacity-50">
                      {compressing ? <Loader2 size={19} className="animate-spin" aria-hidden /> : <ImagePlus size={19} aria-hidden />}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <footer className="mx-auto w-full max-w-3xl shrink-0 border-t border-line bg-page px-4 py-3 sm:px-7">
              <div className="mb-2 flex justify-end">
                <button type="button" onClick={() => setEmojiPickerOpen((open) => !open)} aria-label="Open emoji picker" className="flex size-10 items-center justify-center rounded-xl border border-line bg-card text-ink-muted hover:bg-page"><Smile size={19} aria-hidden /></button>
              </div>
              <motion.button
                type="button"
                onClick={() => void publish()}
                disabled={!canPublish}
                whileTap={canPublish ? { scale: 0.98 } : undefined}
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 text-sm font-black text-white shadow-[0_4px_0_var(--brand-edge)] disabled:pointer-events-none disabled:opacity-45"
              >
                {publishing ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Send size={15} aria-hidden />}
                {publishing ? "Publishing…" : "Post now"}
              </motion.button>
            </footer>
          </motion.section>
          {emojiPickerOpen && (
            <div role="group" aria-label="Choose an emoji" className="absolute bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-4 right-4 z-50 grid grid-cols-6 gap-1 rounded-2xl border border-line bg-card p-2 text-ink shadow-2xl">
              {COMPOSER_EMOJIS.map((emoji) => (
                <button key={emoji} type="button" onClick={() => insertEmoji(emoji)} aria-label={`Insert ${emoji}`} className="flex size-11 items-center justify-center rounded-xl text-xl hover:bg-page">{emoji}</button>
              ))}
            </div>
          )}
        </>
      )}

      <ImageLightbox images={lightboxImages} index={lightboxIndex} onClose={() => setLightboxIndex(null)} />
    </motion.div>
  );
}
