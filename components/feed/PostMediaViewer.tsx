'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Bookmark, BookmarkCheck, ChevronLeft, ChevronRight, Download, Heart, MessageCircle, Share2, X } from "lucide-react";
import { Link } from "@/lib/router";
import type { Post } from "@/types/models";
import { downloadImage } from "@/lib/download";
import { formatCompactNumber } from "@/lib/utils";
import { isVideoUrl } from "@/lib/video";
import { useToast } from "@/components/ui/Toast";
import { Avatar } from "@/components/ui/Avatar";
import { VerifiedBadge } from "@/components/profile/VerifiedBadge";
import { SchoolTag } from "@/components/ui/SchoolBadge";

interface PostMediaViewerProps {
  post: Post;
  activeIndex: number | null;
  saved: boolean;
  onClose: () => void;
  onLike: () => void;
  onComment: () => void;
  onShare: () => void;
  onSave: () => void;
}

export function PostMediaViewer({
  post,
  activeIndex,
  saved,
  onClose,
  onLike,
  onComment,
  onShare,
  onSave,
}: PostMediaViewerProps) {
  const { toast } = useToast();
  const mediaScrollerRef = useRef<HTMLDivElement>(null);
  const [currentIndex, setCurrentIndex] = useState(activeIndex ?? 0);
  const [downloading, setDownloading] = useState(false);
  const media = post.mediaUrls.map((src, index) => ({
    src,
    type: post.mediaTypes?.[index] === "video" || isVideoUrl(src)
      ? "video"
      : post.mediaTypes?.[index] ?? (index === 0 ? post.mediaType : "image"),
  }));
  const activeMedia = media[currentIndex];

  useEffect(() => {
    if (activeIndex === null) return;
    setCurrentIndex(activeIndex);
    const scroller = mediaScrollerRef.current;
    if (scroller) scroller.scrollTo({ left: activeIndex * scroller.clientWidth, behavior: "auto" });
  }, [activeIndex]);

  const changeSlide = useCallback((direction: -1 | 1) => {
    if (media.length < 2) return;
    const nextIndex = (currentIndex + direction + media.length) % media.length;
    setCurrentIndex(nextIndex);
    mediaScrollerRef.current?.scrollTo({ left: nextIndex * (mediaScrollerRef.current?.clientWidth ?? 0), behavior: "smooth" });
  }, [currentIndex, media.length]);

  useEffect(() => {
    if (activeIndex === null) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft") changeSlide(-1);
      if (event.key === "ArrowRight") changeSlide(1);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeIndex, changeSlide, onClose]);

  const downloadCurrentImage = async () => {
    if (!activeMedia || activeMedia.type !== "image" || downloading) return;
    setDownloading(true);
    try {
      await downloadImage(activeMedia.src, `letsgist-${post.schoolShort}-${post.id.slice(0, 6)}-${currentIndex + 1}`);
      toast("Image downloaded.", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not download image.", "danger");
    } finally {
      setDownloading(false);
    }
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {activeIndex !== null && activeMedia && (
        <motion.div
          key="post-media-viewer"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-120 flex items-center justify-center bg-black/90 p-0 backdrop-blur-md sm:p-5"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
        >
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-label={`Post by @${post.authorName}`}
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            className="relative flex h-dvh w-full flex-col overflow-hidden bg-card text-ink sm:h-[min(92dvh,900px)] sm:max-w-7xl sm:flex-row sm:rounded-2xl sm:border sm:border-line"
          >
            <button type="button" onClick={onClose} aria-label="Close post viewer" className="absolute right-3 top-3 z-30 flex size-11 items-center justify-center rounded-full border border-line bg-card/90 text-ink shadow-lg backdrop-blur hover:bg-page">
              <X size={20} aria-hidden />
            </button>

            <div className="relative min-h-0 flex-1 bg-black">
              <div
                ref={mediaScrollerRef}
                onScroll={(event) => {
                  const node = event.currentTarget;
                  setCurrentIndex(Math.round(node.scrollLeft / Math.max(node.clientWidth, 1)));
                }}
                className="flex h-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                {media.map((item, index) => (
                  <div key={`${item.src}-${index}`} className="flex h-full min-w-full snap-center items-center justify-center">
                    {item.type === "video" ? (
                      <video
                        src={item.src}
                        controls
                        autoPlay={index === currentIndex}
                        playsInline
                        preload="metadata"
                        controlsList="nodownload noremoteplayback"
                        disablePictureInPicture
                        onContextMenu={(event) => event.preventDefault()}
                        className="max-h-full max-w-full object-contain"
                      />
                    ) : (
                      <img
                        src={item.src}
                        alt={`Photo ${index + 1} by @${post.authorName}`}
                        draggable={false}
                        className="max-h-full max-w-full select-none object-contain"
                      />
                    )}
                  </div>
                ))}
              </div>
              {media.length > 1 && (
                <>
                  <button type="button" onClick={() => changeSlide(-1)} aria-label="Previous post media" className="absolute left-3 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white ring-1 ring-white/20 backdrop-blur hover:bg-black/80">
                    <ChevronLeft size={22} aria-hidden />
                  </button>
                  <button type="button" onClick={() => changeSlide(1)} aria-label="Next post media" className="absolute right-3 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white ring-1 ring-white/20 backdrop-blur hover:bg-black/80 sm:right-5">
                    <ChevronRight size={22} aria-hidden />
                  </button>
                  <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs font-bold tabular-nums text-white ring-1 ring-white/15">
                    {currentIndex + 1} / {media.length}
                  </span>
                </>
              )}
            </div>

            <aside className="flex max-h-[42dvh] w-full shrink-0 flex-col border-t border-line bg-card sm:max-h-none sm:w-[360px] sm:border-l sm:border-t-0">
              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4 sm:p-5">
                <div className="flex items-center gap-3 pr-11">
                  <Link to={`/profile/${post.authorId}`} onClick={onClose} className="shrink-0 rounded-full">
                    <Avatar name={post.authorName} src={post.authorAvatar} size="md" />
                  </Link>
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <Link to={`/profile/${post.authorId}`} onClick={onClose} className="truncate text-sm font-black text-ink hover:underline">
                        @{post.authorName}
                      </Link>
                      <VerifiedBadge isVerified={post.authorIsVerified} verifiedExpiresAt={post.authorVerifiedExpiresAt} verifiedTitle={post.authorVerifiedTitle} isAdmin={post.authorIsAdmin} role={post.authorRole} />
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-semibold text-ink-muted">
                  <SchoolTag schoolId={post.schoolId} crestUrl={post.schoolCrest} name={post.schoolShort} size="xs" nameClassName="text-[11px] font-bold text-ink-muted" />
                  {post.groupName && <span>· {post.groupName}</span>}
                </div>
                <p className="mt-4 whitespace-pre-wrap wrap-break-word text-sm font-semibold leading-relaxed text-ink-soft">{post.content}</p>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-bold text-ink-muted">
                  <span>{formatCompactNumber(post.likeCount)} likes</span>
                  <span>{formatCompactNumber(post.commentCount)} comments</span>
                </div>
              </div>

              <div className="grid shrink-0 grid-cols-5 border-t border-line px-2 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:px-3">
                <ViewerAction label={post.likedByMe ? "Unlike" : "Like"} onClick={onLike} active={post.likedByMe}>
                  <Heart size={20} fill={post.likedByMe ? "currentColor" : "none"} />
                </ViewerAction>
                <ViewerAction label="Comment" onClick={onComment}><MessageCircle size={20} /></ViewerAction>
                <ViewerAction label="Share" onClick={onShare}><Share2 size={20} /></ViewerAction>
                <ViewerAction label={saved ? "Unsave" : "Save"} onClick={onSave} active={saved}>
                  {saved ? <BookmarkCheck size={20} /> : <Bookmark size={20} />}
                </ViewerAction>
                {activeMedia.type === "image" ? (
                  <ViewerAction label={downloading ? "Downloading" : "Download"} onClick={() => void downloadCurrentImage()} disabled={downloading}>
                    <Download size={20} />
                  </ViewerAction>
                ) : <span aria-hidden />}
              </div>
            </aside>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

function ViewerAction({
  label,
  onClick,
  active = false,
  disabled = false,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-bold transition hover:bg-page disabled:opacity-50 ${active ? "text-danger" : "text-ink"}`}
    >
      {children}
      <span>{label}</span>
    </button>
  );
}
