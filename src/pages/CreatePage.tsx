import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, EyeOff, ImagePlus, Loader2, Lock, Send, ShieldAlert, X, ZoomIn } from "lucide-react";
import { Avatar } from "../components/ui/Avatar";
import { ImageLightbox } from "../components/ui/ImageLightbox";
import { ProgressiveImage } from "../components/ui/ProgressiveImage";
import { VideoAttachmentEditor, type VideoAttachmentDraft } from "../components/feed/VideoAttachmentEditor";
import { SchoolBadge } from "../components/ui/SchoolBadge";
import { useToast } from "../components/ui/Toast";
import { fetchGroup } from "../services/groupsService";
import { useAuth } from "../context/AuthContext";
import {
  COMPRESSION_PRESETS,
  compressImageWithStats,
  formatBytes,
} from "../lib/imageCompression";
import { describeError } from "../lib/supabase";
import { isVideoMime, readVideoMetadata } from "../lib/video";
import { useGistStore } from "../store/gistStore";
import { springs } from "../theme/tokens";
import { MAX_POST_LENGTH, type ConfessionCategory, type SchoolGroup } from "../types/models";
import { cn } from "../utils/cn";

const MAX_IMAGES = 5;
const MAX_VIDEOS = 3;

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
  const { user, profile, loading: authLoading } = useAuth();
  const groupParam = searchParams.get("group");
  const [postGroup, setPostGroup] = useState<SchoolGroup | null>(null);

  const composerType = useGistStore((state) => state.composerType);
  const setComposerIntent = useGistStore((state) => state.setComposerIntent);
  const createPost = useGistStore((state) => state.createPost);
  const submitConfession = useGistStore((state) => state.submitConfession);
  const schools = useGistStore((state) => state.schools);
  const loadSchools = useGistStore((state) => state.loadSchools);

  const [content, setContent] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [compressing, setCompressing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const previewUrls = useRef(new Set<string>());

  const isConfession = composerType === "confession";
  const schoolId = profile?.schoolId ?? null;
  const school = useMemo(() => schoolId ? schools.find((item) => item.id === schoolId) ?? null : null, [schoolId, schools]);
  const remaining = MAX_POST_LENGTH - content.length;
  const canPublish =
    content.trim().length > 0 && Boolean(schoolId) && !publishing && !compressing;

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
    el.style.height = `${Math.max(168, el.scrollHeight)}px`;
  }, []);
  useLayoutEffect(() => syncHeight(), [content, isConfession, syncHeight]);

  useEffect(() => {
    const timer = window.setTimeout(() => textRef.current?.focus(), 120);
    return () => window.clearTimeout(timer);
  }, []);

  const cancel = useCallback(() => {
    if (window.history.state?.idx > 0) navigate(-1);
    else navigate("/");
  }, [navigate]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !publishing && lightboxIndex === null) {
        cancel();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cancel, lightboxIndex, publishing]);

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

  const replaceVideoDraft = (index: number, draft: VideoAttachmentDraft) => {
    const previousUrl = attachments[index]?.previewUrl;
    if (previousUrl) {
      URL.revokeObjectURL(previousUrl);
      previewUrls.current.delete(previousUrl);
    }
    previewUrls.current.add(draft.previewUrl);
    setAttachments((prev) => prev.map((item, i) =>
      i === index
        ? { ...item, file: draft.file, previewUrl: draft.previewUrl, duration: draft.duration, width: draft.width, height: draft.height, compressedBytes: draft.file.size }
        : item
    ));
  };

  const publish = async () => {
    const text = content.trim();
    if (!text || !schoolId || publishing) return;
    setPublishing(true);
    try {
      if (isConfession) {
        await submitConfession({ content: text.slice(0, MAX_POST_LENGTH), category: "School Secret" satisfies ConfessionCategory, schoolId });
        toast("Confession submitted for moderator review.", "brand");
        navigate("/confessions");
      } else {
        await createPost({
          content: text.slice(0, MAX_POST_LENGTH),
          schoolId,
          groupId: postGroup?.schoolId === schoolId ? postGroup.id : null,
          files: attachments.map((item) => item.file),
          videoDurations: attachments.map((item) => item.duration ?? null),
        });
        toast("Gist published to the feed!", "success");
        navigate("/");
      }
    } catch (error) {
      toast(describeError(error), "danger");
    } finally {
      setPublishing(false);
    }
  };

  const ringProgress = Math.min(1, content.length / MAX_POST_LENGTH);
  const circumference = 2 * Math.PI * 10;
  const imageAttachments = attachments.filter((item) => item.kind === "image");
  const lightboxImages = imageAttachments.map((item, index) => ({ src: item.previewUrl, alt: `Attachment ${index + 1}` }));

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={springs.gentle} className="flex min-h-dvh w-full flex-col bg-card text-ink">
      <header className="sticky top-0 z-30 border-b-2 border-line bg-card/95 backdrop-blur-md" style={{ paddingTop: "max(0.65rem, env(safe-area-inset-top))" }}>
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-2 px-3 pb-2.5 sm:px-6">
          <motion.button type="button" onClick={cancel} whileTap={{ scale: 0.93 }} transition={springs.snappy} aria-label="Cancel" className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-2xl border-2 border-line bg-card px-3 text-xs font-extrabold text-ink hover:border-line-deep hover:bg-page">
            <ArrowLeft size={16} strokeWidth={2.7} aria-hidden />
            <span>Cancel</span>
          </motion.button>
          <div className="min-w-0 flex-1 text-center">
            <h1 className="truncate text-base font-black tracking-tight text-ink sm:text-lg">{isConfession ? "New Confession" : "Create Gist"}</h1>
            <p className="truncate text-[10px] font-extrabold uppercase tracking-[0.14em] text-brand-deep">{isConfession ? "Anonymous · moderated" : `Public · ${school?.shortName ?? "no SHS linked"}`}</p>
          </div>
          <motion.button
            type="button"
            onClick={publish}
            disabled={!canPublish}
            whileHover={canPublish ? { y: -2, boxShadow: "0px 6px 0px #5B21B6" } : undefined}
            whileTap={canPublish ? { y: 3, boxShadow: "0px 1px 0px #5B21B6" } : undefined}
            transition={springs.snappy}
            className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-2xl bg-[#8B5CF6] px-4 text-xs font-extrabold uppercase tracking-[0.07em] text-white shadow-[0_4px_0_#5B21B6] hover:bg-[#7C3AED] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {publishing ? <Loader2 size={15} strokeWidth={2.9} className="animate-spin" aria-hidden /> : <Send size={14} strokeWidth={2.7} aria-hidden />}
            <span>{publishing ? "Sending" : "Publish"}</span>
          </motion.button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 pb-6 pt-4 sm:px-6 sm:pt-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-line pb-4">
          <div className="flex min-w-0 items-center gap-3">
            {isConfession ? (
              <span className="flex size-12 shrink-0 items-center justify-center rounded-full border-2 border-brand bg-brand-wash text-brand-deep"><EyeOff size={21} strokeWidth={2.5} aria-hidden /></span>
            ) : (
              <Avatar name={profile?.username ?? "you"} src={profile?.avatarUrl} size="lg" ring online />
            )}
            <div className="min-w-0">
              <span className="block truncate text-sm font-black text-ink sm:text-[15px]">{isConfession ? "Anonymous Student" : `@${profile?.username ?? "student"}`}</span>
              <span className="mt-1 inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-full border-2 border-line bg-page py-0.5 pl-1 pr-2.5 text-left">
                <SchoolBadge schoolId={school?.id} crestUrl={school?.crestUrl} name={school?.name ?? "School"} size="xs" />
                <span className="truncate text-[11px] font-extrabold text-ink">{school?.shortName ?? "No school linked"}</span>
              </span>
            </div>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={isConfession}
            onClick={() => setComposerIntent(isConfession ? "gist" : "confession", school?.id ?? null)}
            className={cn("inline-flex min-h-11 items-center gap-2 rounded-2xl border-2 px-3 py-2 text-xs font-extrabold transition-colors", isConfession ? "border-brand bg-brand-wash text-brand-deep" : "border-line bg-page text-ink-muted hover:border-line-deep hover:text-ink")}
          >
            <Lock size={14} strokeWidth={2.6} aria-hidden />
            <span>Confession</span>
            <span className={cn("relative inline-flex h-5 w-9 items-center rounded-full p-0.5 transition-colors", isConfession ? "bg-[#8B5CF6]" : "bg-line")} aria-hidden>
              <motion.span layout transition={springs.snappy} className={cn("size-4 rounded-full bg-white shadow-xs", isConfession ? "ml-auto" : "ml-0")} />
            </span>
          </button>
        </div>

        {postGroup && !isConfession && (
          <div className="mt-3 flex items-center gap-2 rounded-2xl border-2 border-brand bg-brand-wash px-3 py-2">
            <span className="text-base" aria-hidden>{postGroup.emoji}</span>
            <p className="min-w-0 flex-1 truncate text-[11px] font-extrabold text-brand-deep">
              Posting into {postGroup.name}
            </p>
            <button type="button" onClick={() => setPostGroup(null)} aria-label="Remove club tag" className="flex size-11 shrink-0 items-center justify-center rounded-lg text-brand-deep hover:bg-card">
              <X size={13} strokeWidth={2.8} aria-hidden />
            </button>
          </div>
        )}

        <AnimatePresence initial={false}>
          {isConfession && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={springs.gentle} className="overflow-hidden">
              <div className="pt-3">
                <div className="mt-2.5 flex items-center gap-2 rounded-2xl border border-warning-soft bg-warning-wash px-3 py-2">
                  <ShieldAlert size={15} strokeWidth={2.5} className="shrink-0 text-warning-deep" aria-hidden />
                  <p className="text-[11px] font-semibold text-warning-deep">Submitted confessions undergo moderator review before appearing publicly. Photos are not attached to confessions.</p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div onClick={(event) => event.target === event.currentTarget && textRef.current?.focus()} className="flex flex-1 cursor-text flex-col pt-4">
          <textarea
            ref={textRef}
            value={content}
            onChange={(event) => setContent(event.target.value.slice(0, MAX_POST_LENGTH))}
            maxLength={MAX_POST_LENGTH}
            rows={4}
            placeholder={isConfession ? "Share your anonymous confession… Nobody will see your nickname or avatar." : "What's the gist on campus? NSMQ prep, inter-co banter, dining hall stories…"}
            aria-label="Gist content"
            className="w-full resize-none overflow-hidden bg-transparent text-[17px] font-semibold leading-relaxed text-ink outline-none placeholder:text-ink-faint sm:text-lg"
          />

          {!isConfession && attachments.length > 0 && (
            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-ink-muted">Attachments ({attachments.length}/8)</span>
                <span className="text-right text-[11px] font-semibold text-ink-muted">Up to 5 photos · 3 videos</span>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {attachments.map((item, index) => item.kind === "video" ? (
                  <VideoAttachmentEditor
                    key={`${item.previewUrl}-${index}`}
                    draft={{ file: item.file, previewUrl: item.previewUrl, duration: item.duration ?? 0, width: item.width, height: item.height }}
                    onReplace={(draft) => replaceVideoDraft(index, draft)}
                    onRemove={() => removeAttachment(index)}
                  />
                ) : (
                  <motion.div key={item.previewUrl} layout initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={springs.bouncy} className="group relative overflow-hidden rounded-2xl border-2 border-line bg-page p-2 shadow-[0_3px_0_var(--border-color)]">
                    <div className="relative overflow-hidden rounded-xl bg-card">
                      <button type="button" onClick={() => setLightboxIndex(imageAttachments.findIndex((image) => image.previewUrl === item.previewUrl))} aria-label="Preview full-screen" className="relative block w-full cursor-zoom-in">
                        <ProgressiveImage
                          src={item.previewUrl}
                          alt={`Attachment ${index + 1}`}
                          containerClassName="aspect-[16/10] w-full"
                          className="group-hover:scale-[1.02]"
                        />
                        <span className="pointer-events-none absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-white"><ZoomIn size={10} strokeWidth={2.7} aria-hidden />Inspect</span>
                      </button>
                      <motion.button type="button" whileTap={{ scale: 0.85, rotate: 90 }} transition={springs.snappy} onClick={() => removeAttachment(index)} aria-label={`Remove photo ${index + 1}`} className="absolute right-2 top-2 flex size-8 items-center justify-center rounded-full border border-white/25 bg-black/80 text-white hover:bg-danger">
                        <X size={15} strokeWidth={2.8} aria-hidden />
                      </motion.button>
                    </div>
                    <p className="mt-1.5 flex items-center justify-between gap-2 truncate px-1 text-[10px] font-bold text-ink-muted">
                      <span className="truncate">{item.file.type === "image/webp" ? "WebP" : "JPEG"} · {item.width}×{item.height}</span>
                      <span className="shrink-0 font-extrabold text-success-deep">
                        {formatBytes(item.compressedBytes)}
                        {item.originalBytes > item.compressedBytes
                          ? ` (-${Math.round((1 - item.compressedBytes / item.originalBytes) * 100)}%)`
                          : ""}
                      </span>
                    </p>
                  </motion.div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      <footer className="sticky bottom-0 z-20 border-t-2 border-line bg-card/95 backdrop-blur-md" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-2 px-3 pt-2.5 sm:px-6">
          <div className="flex items-center gap-2">
            <input ref={fileRef} type="file" multiple accept="image/*,video/mp4,video/webm,video/quicktime" onChange={pickFiles} className="sr-only" aria-label="Upload up to 5 images and 3 videos" />
            <motion.button
              type="button"
              whileTap={{ scale: 0.93 }}
              transition={springs.snappy}
              onClick={() => fileRef.current?.click()}
              disabled={isConfession || compressing}
              className="inline-flex h-11 items-center gap-1.5 rounded-2xl border-2 border-line bg-page px-3 text-xs font-extrabold text-ink transition-colors hover:border-brand hover:bg-brand-wash hover:text-brand-deep disabled:cursor-not-allowed disabled:opacity-40"
            >
              {compressing ? (
                <Loader2 size={16} strokeWidth={2.7} className="animate-spin text-brand-deep" aria-hidden />
              ) : (
                <ImagePlus size={16} strokeWidth={2.5} className="text-brand-deep" aria-hidden />
              )}
              <span>{compressing ? "Optimizing…" : "Attach media"}</span>
            </motion.button>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className={cn("text-xs font-extrabold tabular-nums", remaining <= 25 ? "text-danger" : "text-ink-muted")} aria-live="polite">{content.length}/{MAX_POST_LENGTH}</span>
            <svg viewBox="0 0 26 26" className="size-6 -rotate-90" aria-hidden>
              <circle cx="13" cy="13" r="10" fill="none" stroke="var(--border-color)" strokeWidth="3" />
              <circle cx="13" cy="13" r="10" fill="none" stroke={remaining <= 25 ? "var(--danger)" : "#8B5CF6"} strokeWidth="3" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - ringProgress)} />
            </svg>
          </div>
        </div>
      </footer>

      <ImageLightbox images={lightboxImages} index={lightboxIndex} onClose={() => setLightboxIndex(null)} />
    </motion.div>
  );
}
