import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { motion } from "framer-motion";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, ChevronDown, ChevronLeft, ChevronRight, EyeOff, Filter, FlipHorizontal, Globe2, Hash, ImagePlus, Loader2, Send, ShieldAlert, Smile, Sparkles, Volume2, VolumeX, Zap, X } from "lucide-react";
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
import { isUserGlobalAdmin } from "../lib/adminAccess";
import { isVideoMime, readVideoMetadata } from "../lib/video";
import { useGistStore } from "../store/gistStore";
import { springs } from "../theme/tokens";
import { CONFESSION_CATEGORIES, MAX_POST_LENGTH, type ConfessionCategory, type SchoolGroup } from "../types/models";
import { cn } from "../utils/cn";

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
  const [step, setStep] = useState<1 | 2>(1);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [confessionCategory, setConfessionCategory] = useState<ConfessionCategory>("School Secret");
  const [previewIndex, setPreviewIndex] = useState(0);
  const [previewFilter, setPreviewFilter] = useState<"none" | "vivid" | "mono">("none");
  const [previewFlipped, setPreviewFlipped] = useState(false);
  const [previewFlash, setPreviewFlash] = useState(false);
  const [previewMuted, setPreviewMuted] = useState(true);
  const [previewSpeed, setPreviewSpeed] = useState(1);

  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const previewUrls = useRef(new Set<string>());

  const [confessionMode, setConfessionMode] = useState(composerType === "confession");
  const isConfession = confessionMode;
  const isGlobalAdminAuthor = isGlobalAdmin || isUserGlobalAdmin(user?.email);
  const schoolId = !isConfession && isGlobalAdminAuthor ? null : profile?.schoolId ?? null;
  const school = useMemo(() => schoolId ? schools.find((item) => item.id === schoolId) ?? null : null, [schoolId, schools]);
  const remaining = MAX_POST_LENGTH - content.length;
  const hasText = content.trim().length > 0;
  const hasMedia = attachments.length > 0;
  const canPublish =
    (isConfession ? hasText : hasText || hasMedia) &&
    (Boolean(schoolId) || (!isConfession && isGlobalAdminAuthor)) &&
    !publishing &&
    !compressing;
  const canContinue =
    (isConfession ? hasText : hasText || hasMedia) &&
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
    setConfessionMode(composerType === "confession");
  }, [composerType]);

  useEffect(() => {
    if (previewIndex >= attachments.length) setPreviewIndex(Math.max(0, attachments.length - 1));
  }, [attachments.length, previewIndex]);

  useEffect(() => {
    if (previewVideoRef.current) {
      previewVideoRef.current.playbackRate = previewSpeed;
      previewVideoRef.current.muted = previewMuted;
    }
  }, [previewMuted, previewSpeed, activeAttachment?.previewUrl]);

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
  useLayoutEffect(() => syncHeight(), [content, isConfession, step, syncHeight]);

  const cancel = useCallback(() => {
    if (window.history.state?.idx > 0) navigate(-1);
    else navigate("/");
  }, [navigate]);

  const continueToDetails = () => {
    if (!canContinue) {
      if (!hasText && !hasMedia) toast("Add text, an image, or a video to continue.", "danger");
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
    if ((!text && (isConfession || attachments.length === 0)) || publishing || compressing) {
      if (!text && (isConfession || attachments.length === 0)) {
        toast("Please add text, an image, or a video to publish.", "danger");
      }
      return;
    }
    if (!schoolId && (isConfession || !isGlobalAdminAuthor)) {
      toast("Choose your school in your profile before publishing a gist.", "danger");
      return;
    }
    setPublishing(true);
    try {
      if (isConfession) {
        await submitConfession({ content: text.slice(0, MAX_POST_LENGTH), category: confessionCategory, schoolId });
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

  const imageAttachments = attachments.filter((item) => item.kind === "image");
  const lightboxImages = imageAttachments.map((item, index) => ({ src: item.previewUrl, alt: `Attachment ${index + 1}` }));

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 h-dvh w-full overflow-hidden bg-black text-white"
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

      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_35%,#27213b_0%,#09090b_62%)]" aria-hidden />
      {step === 1 ? (
        <>
          <header className="absolute inset-x-0 top-0 z-30 flex items-center justify-between gap-3 px-4 pb-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <button type="button" onClick={cancel} aria-label="Close creator" className="flex size-11 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-md">
              <X size={21} strokeWidth={2.7} aria-hidden />
            </button>
            <div className="relative">
              <button
                type="button"
                onClick={() => setCategoryPickerOpen((open) => !open)}
                aria-expanded={categoryPickerOpen}
                className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/15 bg-black/45 px-4 text-xs font-extrabold text-white backdrop-blur-md"
              >
                {isConfession ? confessionCategory : "Original sound"}
                <ChevronDown size={14} aria-hidden />
              </button>
              {categoryPickerOpen && (
                <div className="absolute right-0 top-full z-40 mt-2 min-w-52 rounded-2xl border border-white/15 bg-neutral-900/95 p-1.5 shadow-2xl backdrop-blur-xl">
                  {CONFESSION_CATEGORIES.map((category) => (
                    <button
                      key={category}
                      type="button"
                      onClick={() => {
                        setConfessionCategory(category);
                        setCategoryPickerOpen(false);
                      }}
                      className="block min-h-10 w-full rounded-xl px-3 text-left text-xs font-bold text-white hover:bg-white/10"
                    >
                      {category}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <span className="flex size-11 items-center justify-center text-white/75" aria-label="Studio effects">
              <Sparkles size={18} aria-hidden />
            </span>
          </header>

          <main className="absolute inset-0 flex items-center justify-center">
            {activeAttachment ? (
              <div className="absolute inset-0 flex items-center justify-center">
                {activeAttachment.kind === "video" ? (
                  <video
                    ref={previewVideoRef}
                    key={activeAttachment.previewUrl}
                    src={activeAttachment.previewUrl}
                    autoPlay
                    loop
                    muted={previewMuted}
                    playsInline
                    onLoadedMetadata={(event) => { event.currentTarget.playbackRate = previewSpeed; }}
                    className={cn(
                      "size-full object-contain transition-[filter,transform] duration-300",
                      previewFilter === "vivid" && "saturate-150 contrast-110",
                      previewFilter === "mono" && "grayscale",
                      previewFlipped && "-scale-x-100"
                    )}
                  />
                ) : (
                  <img
                    src={activeAttachment.previewUrl}
                    alt={`Selected ${activeAttachment.kind}`}
                    className={cn(
                      "size-full object-contain transition-[filter,transform] duration-300",
                      previewFilter === "vivid" && "saturate-150 contrast-110",
                      previewFilter === "mono" && "grayscale",
                      previewFlipped && "-scale-x-100"
                    )}
                  />
                )}
                <span className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-black/45 px-2 py-1 text-[10px] font-extrabold text-white/90 backdrop-blur">
                  {previewIndex + 1} / {attachments.length} · {activeAttachment.kind}
                </span>
                <button
                  type="button"
                  onClick={() => removeAttachment(previewIndex)}
                  aria-label="Remove selected media"
                  className="absolute left-4 top-[calc(50%+2rem)] flex size-10 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur"
                >
                  <X size={17} aria-hidden />
                </button>
                {attachments.length > 1 && (
                  <div className="absolute bottom-40 left-1/2 flex -translate-x-1/2 gap-2">
                    <button type="button" onClick={() => setPreviewIndex((previewIndex + attachments.length - 1) % attachments.length)} aria-label="Previous media" className="flex size-10 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur"><ChevronLeft size={19} aria-hidden /></button>
                    <button type="button" onClick={() => setPreviewIndex((previewIndex + 1) % attachments.length)} aria-label="Next media" className="flex size-10 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur"><ChevronRight size={19} aria-hidden /></button>
                  </div>
                )}
                {previewFlash && <span className="pointer-events-none absolute inset-0 bg-white/15" aria-hidden />}
              </div>
            ) : (
              <div className="flex max-w-sm flex-col items-center px-8 text-center">
                <span className="flex size-20 items-center justify-center rounded-full border border-white/20 bg-white/5 text-white/75">
                  {isConfession ? <EyeOff size={28} aria-hidden /> : <ImagePlus size={28} aria-hidden />}
                </span>
                <h1 className="mt-5 text-2xl font-black tracking-tight">Create your gist</h1>
                <p className="mt-2 text-sm font-semibold leading-relaxed text-white/65">
                  Add a photo or video, or start with a caption. Your campus is waiting.
                </p>
              </div>
            )}

            <div className="absolute right-3 top-[34%] z-20 flex flex-col items-center gap-4">
              <button type="button" onClick={() => setPreviewFlipped((flipped) => !flipped)} className="flex min-h-11 flex-col items-center gap-1 text-[9px] font-bold text-white drop-shadow">
                <span className="flex size-10 items-center justify-center rounded-full bg-black/45 backdrop-blur"><FlipHorizontal size={18} aria-hidden /></span>Flip
              </button>
              <button type="button" onClick={() => setPreviewFilter((filter) => filter === "none" ? "vivid" : filter === "vivid" ? "mono" : "none")} className="flex min-h-11 flex-col items-center gap-1 text-[9px] font-bold text-white drop-shadow">
                <span className="flex size-10 items-center justify-center rounded-full bg-black/45 backdrop-blur"><Filter size={17} aria-hidden /></span>{previewFilter === "none" ? "Filters" : previewFilter}
              </button>
              <button type="button" onClick={() => setPreviewSpeed((speed) => speed === 1 ? 1.5 : speed === 1.5 ? 2 : 1)} className="flex min-h-11 flex-col items-center gap-1 text-[9px] font-bold text-white drop-shadow">
                <span className="flex size-10 items-center justify-center rounded-full bg-black/45 backdrop-blur"><span className="text-[10px] font-black">{previewSpeed}×</span></span>Speed
              </button>
              <button type="button" onClick={() => setPreviewFlash((flash) => !flash)} aria-pressed={previewFlash} className="flex min-h-11 flex-col items-center gap-1 text-[9px] font-bold text-white drop-shadow">
                <span className={cn("flex size-10 items-center justify-center rounded-full backdrop-blur", previewFlash ? "bg-white text-black" : "bg-black/45")}><Zap size={17} aria-hidden /></span>Flash
              </button>
              {activeAttachment?.kind === "video" && (
                <button type="button" onClick={() => setPreviewMuted((muted) => !muted)} aria-label={previewMuted ? "Enable video sound" : "Mute video"} className="flex min-h-11 flex-col items-center gap-1 text-[9px] font-bold text-white drop-shadow">
                  <span className="flex size-10 items-center justify-center rounded-full bg-black/45 backdrop-blur">{previewMuted ? <VolumeX size={17} /> : <Volume2 size={17} />}</span>Sound
                </button>
              )}
            </div>

            <div className="absolute bottom-[calc(8.5rem+env(safe-area-inset-bottom))] left-4 right-16 z-20">
              <div className="mb-2 flex items-center gap-2">
                {isConfession ? (
                  <span className="flex size-9 items-center justify-center rounded-full bg-purple-600/90"><EyeOff size={17} aria-hidden /></span>
                ) : (
                  <Avatar name={profile?.username ?? "you"} src={profile?.avatarUrl} size="sm" />
                )}
                <span className="truncate text-xs font-extrabold text-white">{isConfession ? "Anonymous Student" : profile?.fullName || `@${profile?.username ?? "student"}`}</span>
                {!isConfession && profile?.fullName && <span className="truncate text-[10px] font-semibold text-white/65">@{profile.username}</span>}
              </div>
              <textarea
                ref={textRef}
                value={content}
                onChange={(event) => setContent(event.target.value.slice(0, MAX_POST_LENGTH))}
                maxLength={MAX_POST_LENGTH}
                rows={2}
                placeholder={isConfession ? "Share an anonymous confession…" : "Add a caption or #hashtag…"}
                aria-label="Gist caption"
                className="max-h-24 w-full resize-none bg-transparent text-sm font-semibold leading-relaxed text-white outline-none placeholder:text-white/65"
              />
            </div>
          </main>

          <footer className="absolute inset-x-0 bottom-0 z-30 bg-linear-to-t from-black/95 via-black/75 to-transparent px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-8">
            <div className="mx-auto flex w-full max-w-lg items-end justify-between gap-3">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={isConfession || compressing}
                className="flex min-h-12 flex-col items-center justify-center gap-1 text-[10px] font-extrabold text-white disabled:opacity-40"
              >
                <span className="flex size-11 items-center justify-center rounded-xl bg-white/10"><ImagePlus size={19} aria-hidden /></span>
                Gallery
              </button>
              <button
                type="button"
                onClick={() => cameraRef.current?.click()}
                disabled={isConfession || compressing}
                aria-label={compressing ? "Preparing media" : "Record or upload media"}
                className="flex size-[68px] shrink-0 items-center justify-center rounded-full border-[5px] border-white bg-[#8B5CF6] shadow-[0_0_0_3px_rgba(139,92,246,.35)] transition-transform active:scale-95 disabled:opacity-50"
              >
                {compressing ? <Loader2 size={24} className="animate-spin" aria-hidden /> : <span className="size-7 rounded-full bg-white" />}
              </button>
              <button
                type="button"
                onClick={continueToDetails}
                disabled={!canContinue}
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-5 text-xs font-black text-neutral-950 transition-transform active:scale-95 disabled:pointer-events-none disabled:opacity-40"
              >
                Next <ArrowRight size={15} strokeWidth={2.8} aria-hidden />
              </button>
            </div>
            <p className="mt-2 text-center text-[10px] font-semibold text-white/50">{attachments.length ? `${attachments.length} selected · up to 5 photos and 3 videos` : "Capture or upload a moment"}</p>
          </footer>
        </>
      ) : (
        <>
          <div className="absolute inset-0 opacity-35">
            {activeAttachment?.kind === "video" ? (
              <video src={activeAttachment.previewUrl} autoPlay muted loop playsInline className="size-full object-cover blur-xl" />
            ) : activeAttachment ? (
              <img src={activeAttachment.previewUrl} alt="" className="size-full object-cover blur-xl" />
            ) : null}
            <span className="absolute inset-0 bg-black/65" />
          </div>
          <header className="absolute inset-x-0 top-0 z-30 flex items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <button type="button" onClick={() => setStep(1)} aria-label="Back to media studio" className="flex size-11 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur"><ArrowLeft size={19} aria-hidden /></button>
            <p className="text-sm font-black text-white">Post details</p>
            <span className="w-11" />
          </header>

          <motion.section
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            transition={springs.gentle}
            className="absolute inset-x-0 bottom-0 z-20 flex max-h-[88dvh] flex-col overflow-hidden rounded-t-[28px] border-t border-white/10 bg-neutral-950/95 shadow-2xl backdrop-blur-2xl"
            style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
          >
            <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-white/25" />
            <div className="flex-1 overflow-y-auto px-4 pb-4 pt-4">
              <div className="flex items-center gap-3">
                {activeAttachment?.kind === "video" ? (
                  <video src={activeAttachment.previewUrl} muted playsInline className="size-[72px] shrink-0 rounded-xl bg-black object-cover" />
                ) : activeAttachment ? (
                  <img src={activeAttachment.previewUrl} alt="Selected media thumbnail" className="size-[72px] shrink-0 rounded-xl bg-black object-cover" />
                ) : (
                  <span className="flex size-[72px] shrink-0 items-center justify-center rounded-xl bg-white/10"><ImagePlus size={22} aria-hidden /></span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {isConfession ? <EyeOff size={16} className="text-purple-300" aria-hidden /> : <Avatar name={profile?.username ?? "you"} src={profile?.avatarUrl} size="sm" />}
                    <span className="truncate text-xs font-extrabold text-white">{isConfession ? "Anonymous Student" : profile?.fullName || `@${profile?.username ?? "student"}`}</span>
                  </div>
                  {isGlobalAdminAuthor && !isConfession ? (
                    <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-purple-300/25 bg-purple-500/15 px-2.5 py-1 text-[10px] font-extrabold text-purple-200">
                      <Globe2 size={12} aria-hidden /> All Schools / Global Admin
                    </span>
                  ) : (
                    <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-bold text-white/75">
                      <SchoolBadge schoolId={school?.id} crestUrl={school?.crestUrl} name={school?.name ?? "School"} size="xs" />
                      {school?.shortName ?? "No school linked"}
                    </span>
                  )}
                </div>
                <span className={cn("shrink-0 text-[10px] font-extrabold tabular-nums", remaining <= 25 ? "text-red-300" : "text-white/50")}>{content.length}/{MAX_POST_LENGTH}</span>
              </div>

              {postGroup && !isConfession && (
                <div className="mt-3 flex items-center gap-2 rounded-xl border border-purple-300/20 bg-purple-500/10 px-3 py-2 text-xs font-bold text-purple-200">
                  <span aria-hidden>{postGroup.emoji}</span> Posting into {postGroup.name}
                </div>
              )}
              {step === 2 && !schoolId && !isGlobalAdminAuthor && !isConfession && (
                <p role="status" className="mt-3 rounded-xl border border-amber-300/20 bg-amber-400/10 px-3 py-2 text-xs font-bold text-amber-200">
                  Link your school in your profile before publishing.
                </p>
              )}

              <textarea
                ref={textRef}
                value={content}
                onChange={(event) => setContent(event.target.value.slice(0, MAX_POST_LENGTH))}
                maxLength={MAX_POST_LENGTH}
                rows={4}
                placeholder={isConfession ? "Share an anonymous confession…" : "Write a caption, add #hashtags, and tell everyone the gist…"}
                aria-label="Gist caption and hashtags"
                className="mt-4 min-h-28 w-full resize-y rounded-2xl border border-white/10 bg-white/5 p-3 text-sm font-semibold leading-relaxed text-white outline-none placeholder:text-white/40 focus:border-purple-400"
              />
              {!isConfession && (
                <section className="mt-3 rounded-2xl border border-white/10 bg-white/3 p-3" aria-label="Hashtag suggestions">
                  <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-white/55"><Hash size={12} aria-hidden /> Hashtags</p>
                  {content && <p className="mt-2 whitespace-pre-wrap wrap-break-word text-xs font-semibold text-white/75">{highlightedCaption}</p>}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {hashtagSuggestions.map((tag) => (
                      <button key={tag} type="button" onClick={() => insertHashtag(tag)} className="min-h-8 rounded-full border border-purple-300/20 bg-purple-500/10 px-3 text-[10px] font-extrabold text-purple-200">#{tag}</button>
                    ))}
                  </div>
                </section>
              )}

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/3 p-3">
                <div>
                  <p className="text-xs font-extrabold text-white">Is Confession?</p>
                  <p className="mt-0.5 text-[10px] font-semibold text-white/50">Anonymous and reviewed before publishing</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={isConfession}
                  onClick={() => {
                    if (!isConfession && attachments.length > 0) {
                      toast("Remove media attachments before switching to confession mode.", "info");
                      return;
                    }
                    const next = !isConfession;
                    setConfessionMode(next);
                    setComposerIntent(next ? "confession" : "gist", profile?.schoolId ?? null);
                  }}
                  className={cn("relative h-7 w-12 rounded-full transition-colors", isConfession ? "bg-purple-500" : "bg-white/20")}
                >
                  <span className={cn("absolute top-1 size-5 rounded-full bg-white transition-transform", isConfession ? "left-6" : "left-1")} />
                </button>
                {isConfession && (
                  <div className="flex w-full flex-wrap gap-2">
                    {CONFESSION_CATEGORIES.map((category) => (
                      <button
                        key={category}
                        type="button"
                        onClick={() => setConfessionCategory(category)}
                        aria-pressed={confessionCategory === category}
                        className={cn("rounded-full border px-3 py-1.5 text-[10px] font-extrabold", confessionCategory === category ? "border-purple-300 bg-purple-500/20 text-purple-100" : "border-white/10 bg-white/5 text-white/60")}
                      >
                        {category}
                      </button>
                    ))}
                    <p className="w-full text-[10px] font-semibold text-white/50">Confessions are text-only and reviewed before going live.</p>
                  </div>
                )}
              </div>

              {attachments.length > 0 && !isConfession && (
                <div className="mt-4">
                  <p className="mb-2 text-[10px] font-extrabold uppercase tracking-wider text-white/55">Media · up to 5 photos and 3 videos</p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {attachments.map((item, index) => item.kind === "video" ? (
                      <VideoAttachmentEditor
                        key={`${item.previewUrl}-${index}`}
                        draft={{ file: item.file, previewUrl: item.previewUrl, duration: item.duration ?? 0, width: item.width, height: item.height }}
                        onReplace={(draft) => replaceVideoDraft(index, draft)}
                        onRemove={() => removeAttachment(index)}
                      />
                    ) : (
                      <div key={item.previewUrl} className="relative overflow-hidden rounded-xl border border-white/10 bg-white/5">
                        <button type="button" onClick={() => setLightboxIndex(imageAttachments.findIndex((image) => image.previewUrl === item.previewUrl))} aria-label={`Preview photo ${index + 1}`} className="block w-full">
                          <ProgressiveImage src={item.previewUrl} alt={`Attachment ${index + 1}`} containerClassName="aspect-video w-full" />
                        </button>
                        <button type="button" onClick={() => removeAttachment(index)} aria-label={`Remove photo ${index + 1}`} className="absolute right-2 top-2 flex size-8 items-center justify-center rounded-full bg-black/70 text-white"><X size={15} aria-hidden /></button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {isConfession && (
                <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-300/20 bg-amber-400/10 px-3 py-2.5 text-[11px] font-semibold leading-relaxed text-amber-100">
                  <ShieldAlert size={15} className="mt-0.5 shrink-0" aria-hidden />
                  Your nickname and avatar stay hidden. A moderator reviews the confession before it appears.
                </div>
              )}
            </div>

            <footer className="flex shrink-0 items-center gap-3 border-t border-white/10 bg-neutral-950 px-4 py-3">
              <button type="button" onClick={() => setEmojiPickerOpen((open) => !open)} aria-label="Open emoji picker" className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/5 text-white/75"><Smile size={19} aria-hidden /></button>
              <button type="button" onClick={() => setStep(1)} className="min-h-11 rounded-xl border border-white/15 px-4 text-xs font-extrabold text-white/75">Preview</button>
              <motion.button
                type="button"
                onClick={() => void publish()}
                disabled={!canPublish}
                whileTap={canPublish ? { scale: 0.98 } : undefined}
                className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[#8B5CF6] px-4 text-sm font-black text-white shadow-[0_4px_0_#5B21B6] disabled:pointer-events-none disabled:opacity-45"
              >
                {publishing ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Send size={15} aria-hidden />}
                {publishing ? "Publishing…" : isConfession ? "Publish confession" : "Post"}
              </motion.button>
            </footer>
          </motion.section>
          {emojiPickerOpen && (
            <div role="group" aria-label="Choose an emoji" className="absolute bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-4 right-4 z-40 grid grid-cols-6 gap-1 rounded-2xl border border-white/10 bg-neutral-900 p-2 shadow-2xl">
              {COMPOSER_EMOJIS.map((emoji) => (
                <button key={emoji} type="button" onClick={() => insertEmoji(emoji)} aria-label={`Insert ${emoji}`} className="flex size-11 items-center justify-center rounded-xl text-xl hover:bg-white/10">{emoji}</button>
              ))}
            </div>
          )}
        </>
      )}

      <ImageLightbox images={lightboxImages} index={lightboxIndex} onClose={() => setLightboxIndex(null)} />
    </motion.div>
  );
}
