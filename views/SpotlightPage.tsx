'use client';

import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode, type UIEvent } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, Copy, Download, Heart, MessageCircle, MoreHorizontal, RefreshCw, Share2, Volume2, VolumeX, Zap } from "lucide-react";
import { Link } from "@/lib/router";
import { useAuth } from "@/context/AuthContext";
import { describeError } from "@/lib/supabase";
import { timeAgo } from "@/lib/time";
import { recordPostShare } from "@/services/followsService";
import { fetchApprovedConfessions, toggleReaction } from "@/services/confessionsService";
import { fetchFeed, toggleLike } from "@/services/postsService";
import { useAuthGateStore } from "@/store/authGateStore";
import { useGistStore } from "@/store/gistStore";
import type { Confession, Post } from "@/types/models";
import { useToast } from "@/components/ui/Toast";
import { Avatar } from "@/components/ui/Avatar";
import { VerifiedBadge } from "@/components/profile/VerifiedBadge";
import { rotateBySeed } from "@/lib/feedRotation";
import { shareOrCopyLink, sharePreviewUrl } from "@/lib/shareLinks";
import { reportSpotlightScrollDirection } from "@/hooks/useScrollDirection";
import { downloadSpotlightVideo } from "@/lib/download";
import { formatCompactNumber } from "@/lib/utils";

type SpotlightItem =
  | { kind: "post"; key: string; videoUrl: string; post: Post }
  | { kind: "confession"; key: string; videoUrl: string; confession: Confession };

export function SpotlightPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const openComments = useGistStore((state) => state.openComments);
  const commentsByThread = useGistStore((state) => state.commentsByThread);
  const slideListRef = useRef<HTMLDivElement>(null);
  const previousSlideScrollTop = useRef(0);
  const slideScrollDownDistance = useRef(0);
  const slideScrollFrame = useRef(0);
  const schools = useGistStore((state) => state.schools);
  const openAuthGate = useAuthGateStore((state) => state.openAuthGate);
  const [items, setItems] = useState<SpotlightItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sharePopover, setSharePopover] = useState<{
    item: SpotlightItem;
    anchor: { top: number; right: number };
  } | null>(null);
  const [downloadingVideo, setDownloadingVideo] = useState(false);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const [feed, confessions] = await Promise.all([
        fetchFeed({ limit: 100 }),
        fetchApprovedConfessions(100),
      ]);
      const videoPosts = feed
        .filter((post) => post.mediaTypes?.includes("video") || post.mediaType === "video")
        .flatMap((post) =>
          post.mediaUrls.flatMap((videoUrl, index) =>
            post.mediaTypes?.[index] === "video" || (index === 0 && post.mediaType === "video")
              ? [{ kind: "post" as const, key: `post:${post.id}:${index}`, videoUrl, post }]
              : []
          )
        );
      const videoConfessions = confessions.flatMap((confession) =>
        confession.mediaUrls?.flatMap((videoUrl, index) =>
          confession.mediaTypes?.[index] === "video"
            ? [{
                kind: "confession" as const,
                key: `confession:${confession.id}:${index}`,
                videoUrl,
                confession,
              }]
            : []
        ) ?? []
      );
      const chronologicalItems = [...videoPosts, ...videoConfessions].sort((left, right) => {
        const leftCreatedAt = left.kind === "post" ? left.post.createdAt : left.confession.publishedAt ?? left.confession.createdAt;
        const rightCreatedAt = right.kind === "post" ? right.post.createdAt : right.confession.publishedAt ?? right.confession.createdAt;
        return Date.parse(rightCreatedAt) - Date.parse(leftCreatedAt);
      });
      setItems(rotateBySeed(chronologicalItems, Math.random()));
    } catch (cause) {
      setError(describeError(cause, "Could not load Spotlight videos."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const share = async (post: Post) => {
    const url = sharePreviewUrl("post", post.id);
    try {
      const result = await shareOrCopyLink({
        title: "Spotlight on Gist me",
        text: post.content.slice(0, 120),
        url,
      });
      if (result === "cancelled") return;
      if (result === "copied") toast("Gist link copied.", "success");
      void recordPostShare(post.id).catch((cause: unknown) => console.error("Could not record this gist share.", cause));
    } catch (cause) {
      toast("Could not copy the gist link.", "danger");
      console.error("Could not copy gist link.", cause);
    }
  };

  const shareConfession = async (confession: Confession) => {
    const url = sharePreviewUrl("confession", confession.id);
    try {
      const result = await shareOrCopyLink({
        title: "Anonymous confession on Gist me",
        text: "Click to read and reply anonymously.",
        url,
      });
      if (result === "cancelled") return;
      if (result === "copied") toast("Confession link copied.", "success");
    } catch (cause) {
      toast("Could not copy the confession link.", "danger");
      console.error("Could not copy confession link.", cause);
    }
  };

  const downloadVideo = async () => {
    if (!sharePopover || downloadingVideo) return;
    setDownloadingVideo(true);
    try {
      const id = sharePopover.item.kind === "post" ? sharePopover.item.post.id : sharePopover.item.confession.id;
      await downloadSpotlightVideo(sharePopover.item.videoUrl, `gistme-spotlight-${id.slice(0, 8)}`);
      toast("Spotlight video downloaded.", "success");
    } catch (cause) {
      toast(describeError(cause, "Could not download this video."), "danger");
      console.error("Could not download Spotlight video.", cause);
    } finally {
      setDownloadingVideo(false);
    }
  };

  const scrollSlide = (direction: -1 | 1) => {
    const list = slideListRef.current;
    if (!list) return;
    list.scrollBy({ top: direction * list.clientHeight, behavior: "smooth" });
  };

  const handleSlideScroll = (event: UIEvent<HTMLDivElement>) => {
    const list = event.currentTarget;
    if (slideScrollFrame.current) return;
    slideScrollFrame.current = window.requestAnimationFrame(() => {
      slideScrollFrame.current = 0;
      const currentTop = Math.max(0, list.scrollTop);
      const delta = currentTop - previousSlideScrollTop.current;
      previousSlideScrollTop.current = currentTop;

      if (currentTop <= 8 || delta < 0) {
        slideScrollDownDistance.current = 0;
        reportSpotlightScrollDirection(false);
        return;
      }

      if (delta > 0) {
        slideScrollDownDistance.current += delta;
        if (slideScrollDownDistance.current >= 12) {
          slideScrollDownDistance.current = 0;
          reportSpotlightScrollDirection(true);
        }
      }
    });
  };

  useEffect(() => () => {
    if (slideScrollFrame.current) window.cancelAnimationFrame(slideScrollFrame.current);
  }, []);

  return (
    <div className="relative flex h-[calc(100dvh-4rem)] w-full overflow-hidden bg-neutral-950 text-white">
      <section className="relative h-full min-w-0 flex-1 bg-neutral-950">
      <header className="pointer-events-none absolute inset-x-0 top-0 z-30 px-3 pb-5 pt-[max(0.7rem,env(safe-area-inset-top))]">
        <div className="pointer-events-auto flex items-center justify-between">
          <Link
            to="/"
            aria-label="Back to feed"
            className="flex size-11 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <ArrowLeft size={20} strokeWidth={2.7} aria-hidden />
          </Link>
          <h1 className="flex items-center gap-1.5 text-sm font-black uppercase tracking-[0.16em] text-white drop-shadow">
            <Zap size={16} fill="currentColor" className="text-purple-300" aria-hidden />
            Spotlight
          </h1>
          <button
            type="button"
            onClick={() => void load(true)}
            disabled={refreshing}
            aria-label="Refresh Spotlight"
            className="flex size-11 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-md disabled:opacity-60"
          >
            <RefreshCw size={17} className={refreshing ? "animate-spin" : ""} aria-hidden />
          </button>
        </div>
      </header>

      {loading ? (
        <div className="flex h-full items-center justify-center text-sm font-bold text-white/75">Finding your next favorite…</div>
      ) : error ? (
        <div role="alert" className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="max-w-sm text-sm font-bold text-white">{error}</p>
          <button type="button" onClick={() => void load(true)} className="rounded-full bg-white px-4 py-2 text-xs font-black text-neutral-950">Try again</button>
        </div>
      ) : items.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center px-6 text-center">
          <Zap size={28} className="mb-3 text-purple-300" aria-hidden />
          <p className="text-base font-black">No videos to spotlight yet</p>
          <p className="mt-1 max-w-xs text-sm font-semibold text-white/65">
            Video gists and approved confession clips will show up here.
          </p>
        </div>
      ) : (
        <div ref={slideListRef} onScroll={handleSlideScroll} className="h-full snap-y snap-mandatory overflow-y-auto overscroll-contain [scrollbar-width:none]">
          {items.map((item) => {
            const threadId = item.kind === "post" ? item.post.id : item.confession.id;
            const cachedCount = commentsByThread[`${item.kind}:${threadId}`]?.length;
            const slideItem = item.kind === "post"
              ? { ...item, post: { ...item.post, commentCount: Math.max(item.post.commentCount, cachedCount ?? 0) } }
              : { ...item, confession: { ...item.confession, commentCount: Math.max(item.confession.commentCount, cachedCount ?? 0) } };
            return (
              <SpotlightSlide
                key={slideItem.key}
                item={slideItem}
                schoolName={
                  item.kind === "post"
                    ? item.post.schoolShort
                    : item.confession.schoolId
                      ? schools.find((school) => school.id === item.confession.schoolId)?.shortName ?? "School"
                      : "Gist me"
                }
                onLike={async () => {
                  if (item.kind !== "post") return;
                  if (!user) {
                    openAuthGate({ title: "Like this Spotlight", speech: "Join Gist me to react to campus videos.", returnTo: "/spotlight" });
                    return;
                  }
                  try {
                    const liked = await toggleLike(item.post.id);
                    setItems((current) => current.map((entry) => entry.key === item.key && entry.kind === "post"
                      ? { ...entry, post: { ...entry.post, likedByMe: liked, likeCount: Math.max(0, entry.post.likeCount + (liked ? 1 : -1)) } }
                      : entry));
                  } catch (cause) {
                    toast(describeError(cause, "Could not update your reaction."), "danger");
                  }
                }}
                onComment={() => {
                  openComments(item.kind === "post"
                    ? { type: "post", id: item.post.id }
                    : { type: "confession", id: item.confession.id });
                }}
                onShare={() => {
                  if (item.kind === "post") void share(item.post);
                }}
                onShareConfession={() => {
                  if (item.kind === "confession") void shareConfession(item.confession);
                }}
                onMore={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  const top = rect.bottom + 220 < window.innerHeight
                    ? rect.bottom + 8
                    : Math.max(8, rect.top - 220);
                  setSharePopover({ item, anchor: { top, right: window.innerWidth - rect.right } });
                }}
                onConfessionReaction={async () => {
                  if (item.kind !== "confession") return;
                  if (!user) {
                    openAuthGate({ title: "React anonymously", speech: "Join Gist me to react to campus confessions.", returnTo: "/spotlight" });
                    return;
                  }
                  try {
                    const confession = item.confession;
                    const current = confession.myReaction;
                    const next = current === "heart" ? null : "heart";
                    await toggleReaction(confession.id, "heart", current);
                    setItems((currentItems) => currentItems.map((entry) => {
                      if (entry.kind !== "confession" || entry.confession.id !== confession.id) return entry;
                      const reactions = { ...entry.confession.reactions };
                      if (current) reactions[current] = Math.max(0, reactions[current] - 1);
                      if (next) reactions[next] += 1;
                      return { ...entry, confession: { ...entry.confession, reactions, myReaction: next } };
                    }));
                  } catch (cause) {
                    toast(describeError(cause, "Could not update your reaction."), "danger");
                  }
                }}
              />
            );
          })}
        </div>
      )}
      </section>
      {!loading && !error && items.length > 0 && (
        <div className="hidden w-16 shrink-0 items-center justify-center lg:flex">
          <div className="flex flex-col gap-2">
            <button type="button" onClick={() => scrollSlide(-1)} aria-label="Previous Spotlight video" className="flex size-11 items-center justify-center rounded-full border border-white/15 bg-black/55 text-white shadow-lg backdrop-blur transition hover:bg-black/80">
              <ArrowUp size={20} aria-hidden />
            </button>
            <button type="button" onClick={() => scrollSlide(1)} aria-label="Next Spotlight video" className="flex size-11 items-center justify-center rounded-full border border-white/15 bg-black/55 text-white shadow-lg backdrop-blur transition hover:bg-black/80">
              <ArrowDown size={20} aria-hidden />
            </button>
          </div>
        </div>
      )}
      {sharePopover && (
        <SpotlightSharePopover
          item={sharePopover.item}
          anchor={sharePopover.anchor}
          downloading={downloadingVideo}
          onClose={() => setSharePopover(null)}
          onDownload={() => void downloadVideo()}
          onCopied={() => toast("Spotlight link copied.", "success")}
          onCopyError={() => toast("Could not copy the Spotlight link.", "danger")}
        />
      )}
    </div>
  );
}

function SpotlightSharePopover({
  item,
  anchor,
  downloading,
  onClose,
  onDownload,
  onCopied,
  onCopyError,
}: {
  item: SpotlightItem;
  anchor: { top: number; right: number };
  downloading: boolean;
  onClose: () => void;
  onDownload: () => void;
  onCopied: () => void;
  onCopyError: () => void;
}) {
  const popoverRef = useRef<HTMLElement>(null);
  const id = item.kind === "post" ? item.post.id : item.confession.id;
  const content = item.kind === "post" ? item.post.content : item.confession.content;
  const kind = item.kind === "post" ? "post" : "confession";
  const url = sharePreviewUrl(kind, id);
  const text = content.slice(0, 120);
  const encodedUrl = encodeURIComponent(url);
  const encodedText = encodeURIComponent(text);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node) || !popoverRef.current?.contains(event.target)) onClose();
    };
    const handleScroll = () => onClose();
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleScroll);
    document.addEventListener("scroll", handleScroll, true);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleScroll);
      document.removeEventListener("scroll", handleScroll, true);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [onClose]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      onCopied();
      onClose();
    } catch {
      onCopyError();
    }
  };

  return (
    <section
      ref={popoverRef}
      role="menu"
      aria-label="Spotlight sharing options"
      className="fixed z-110 w-[min(17rem,calc(100vw-1rem))] rounded-2xl border border-white/15 bg-neutral-900 p-2.5 text-white shadow-2xl"
      style={{
        top: anchor.top,
        right: Math.max(8, Math.min(anchor.right, window.innerWidth - 280)),
      }}
    >
      <div className="mb-2 flex items-center justify-between px-1">
        <h2 className="text-xs font-black">Share Spotlight</h2>
        <button type="button" onClick={onClose} aria-label="Close share options" className="flex size-8 items-center justify-center rounded-full bg-white/10 hover:bg-white/15">
          <span className="text-lg leading-none" aria-hidden>×</span>
        </button>
      </div>
      <div className="grid grid-cols-4 gap-1 text-center">
        <a role="menuitem" href={`https://wa.me/?text=${encodedText}%20${encodedUrl}`} target="_blank" rel="noopener noreferrer" className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[9px] font-bold hover:bg-white/10">
          <WhatsAppLogo />
          WhatsApp
        </a>
        <a role="menuitem" href={`https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`} target="_blank" rel="noopener noreferrer" className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[9px] font-bold hover:bg-white/10">
          <XLogo />
          X
        </a>
        <a role="menuitem" href={`https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`} target="_blank" rel="noopener noreferrer" className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[9px] font-bold hover:bg-white/10">
          <TelegramLogo />
          Telegram
        </a>
        <button role="menuitem" type="button" onClick={() => void copyLink()} className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[9px] font-bold hover:bg-white/10">
          <Copy size={18} aria-hidden /> Copy link
        </button>
      </div>
      <button type="button" onClick={onDownload} disabled={downloading} className="mt-2 flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-white px-3 text-xs font-black text-neutral-950 transition hover:bg-white/85 disabled:opacity-60">
        <Download size={16} aria-hidden />
        {downloading ? "Preparing video…" : "Download Video"}
      </button>
    </section>
  );
}

function WhatsAppLogo() {
  return (
    <svg viewBox="0 0 32 32" className="size-6" aria-hidden="true">
      <circle cx="16" cy="16" r="15" fill="#25D366" />
      <path d="M9.3 23.2 10.4 19a8.3 8.3 0 1 1 3.3 3.1l-4.4 1.1Z" fill="none" stroke="white" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M13.1 11.6c-.4-.8-.8-.8-1.1-.8-.3 0-.7 0-1 .4-.4.4-1.3 1.3-1.3 3.1s1.3 3.5 1.5 3.7c.2.3 2.5 3.9 6.1 5.3 3 .1 3.6-1.2 4-2 .4-.8.4-1.5.3-1.7-.1-.2-.3-.3-.7-.5l-2.4-1.2c-.3-.1-.6-.2-.8.2-.3.4-.9 1.2-1.1 1.4-.2.2-.4.3-.8.1-.4-.2-1.6-.6-3-1.9-1.1-1-1.8-2.2-2-2.6-.2-.4 0-.6.2-.8.2-.2.4-.5.6-.7.2-.2.2-.4.3-.6.1-.2 0-.4-.1-.6l-.7-1.8Z" fill="white" transform="translate(2 0) scale(.8)" />
    </svg>
  );
}

function XLogo() {
  return (
    <svg viewBox="0 0 24 24" className="size-5 fill-current" aria-hidden="true">
      <path d="M18.9 1.2h3.7l-8.1 9.3L24 22.8h-7.4l-5.8-7.6-6.7 7.6H.4l8.7-9.9L0 1.2h7.6l5.2 6.9 6.1-6.9Zm-1.3 19.5h2L6.5 3.2H4.4l13.2 17.5Z" />
    </svg>
  );
}

function TelegramLogo() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" aria-hidden="true">
      <circle cx="12" cy="12" r="12" fill="#229ED9" />
      <path d="m5 11.4 12.9-5c.6-.2 1.1.2.9.9l-2.2 10.2c-.1.7-.6.8-1.1.5l-3.4-2.5-1.7 1.7c-.2.2-.4.4-.8.4l.2-3.5 6.4-5.8c.3-.3-.1-.4-.4-.2l-7.9 4.9-3.4-1.1c-.7-.2-.7-.7.5-1.1Z" fill="white" />
    </svg>
  );
}

function renderCaption(content: string) {
  return content.split(/(#[A-Za-z0-9_]{1,50})/g).map((part, index) =>
    part.startsWith("#")
      ? <Link key={`${part}-${index}`} to={`/explore?tag=${encodeURIComponent(part.slice(1).toLowerCase())}`} className="font-extrabold text-white underline decoration-white/60 underline-offset-2">{part}</Link>
      : <span key={index}>{part}</span>
  );
}

function SpotlightSlide({
  item,
  schoolName,
  onLike,
  onComment,
  onShare,
  onShareConfession,
  onConfessionReaction,
  onMore,
}: {
  item: SpotlightItem;
  schoolName: string;
  onLike: () => void;
  onComment: () => void;
  onShare: () => void;
  onShareConfession: () => void;
  onConfessionReaction: () => void;
  onMore: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const confession = item.kind === "confession" ? item.confession : null;
  const post = item.kind === "post" ? item.post : null;
  const caption = post?.content ?? confession?.content ?? "";
  const author = post
    ? post.authorFullName || `@${post.authorName}`
    : confession?.seedFullName || (confession?.seedUsername ? `@${confession.seedUsername}` : "Anonymous");
  const username = post?.authorName ?? confession?.seedUsername ?? null;
  const hasLongCaption = caption.length > 90;

  useEffect(() => {
    const video = videoRef.current;
    const slide = video?.parentElement;
    if (!video || !slide) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && entry.intersectionRatio >= 0.65) {
        video.muted = false;
        void video.play().catch(async () => {
          setAudioBlocked(true);
          video.muted = true;
          setMuted(true);
          try {
            await video.play();
          } catch {
            setPlaying(false);
          }
        });
      } else {
        video.pause();
      }
    }, { threshold: [0, 0.65, 1] });
    observer.observe(slide);
    return () => {
      observer.disconnect();
      video.pause();
    };
  }, [item.videoUrl]);

  const reactionCount = confession
    ? Object.values(confession.reactions).reduce((total, count) => total + count, 0)
    : post?.likeCount ?? 0;

  return (
    <article className="relative h-full w-full snap-start snap-always overflow-hidden bg-neutral-950">
      <video
        ref={videoRef}
        src={item.videoUrl}
        controlsList="nodownload noremoteplayback"
        disablePictureInPicture
        playsInline
        loop
        muted={muted}
        preload="metadata"
        onContextMenu={(event) => event.preventDefault()}
        onClick={() => {
          const video = videoRef.current;
          if (!video) return;
          if (video.paused) void video.play().catch(() => undefined);
          else video.pause();
        }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        className="absolute inset-0 size-full object-contain"
        aria-label={`Spotlight video by ${author}`}
      />
      <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-black/90 via-transparent to-black/20" aria-hidden />
      {audioBlocked && muted && (
        <button
          type="button"
          onClick={() => {
            const video = videoRef.current;
            if (!video) return;
            video.muted = false;
            setMuted(false);
            setAudioBlocked(false);
            void video.play().catch(() => {
              video.muted = true;
              setMuted(true);
              setAudioBlocked(true);
            });
          }}
          className="absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/65 px-4 py-2.5 text-xs font-extrabold text-white backdrop-blur"
        >
          Tap to enable sound
        </button>
      )}

      <div className="absolute bottom-[calc(6rem+env(safe-area-inset-bottom))] left-4 right-19 z-10 space-y-2 text-white md:bottom-24">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-black">{author}</span>
          {post && (
            <VerifiedBadge
              isVerified={post.authorIsVerified}
              verifiedExpiresAt={post.authorVerifiedExpiresAt}
              verifiedTitle={post.authorVerifiedTitle}
              isAdmin={post.authorIsAdmin}
              role={post.authorRole}
            />
          )}
          {confession?.seedUsername && (
            <VerifiedBadge
              isVerified={confession.seedIsVerified}
              verifiedExpiresAt={confession.seedVerifiedExpiresAt}
              verifiedTitle={confession.seedVerifiedTitle}
              isAdmin={confession.seedIsAdmin}
              role={confession.seedRole}
            />
          )}
          {username && author !== `@${username}` && <span className="text-[11px] font-semibold text-white/75">@{username}</span>}
          {confession && <span className="text-[11px] font-bold text-white/75">· Anonymous confession</span>}
        </div>
        <p className="text-[11px] font-semibold text-white/75">{schoolName} · {timeAgo(post?.createdAt ?? confession?.publishedAt ?? confession?.createdAt ?? "")}</p>
        {caption && (
          <div>
            <p className={`${captionExpanded ? "" : "line-clamp-3"} whitespace-pre-wrap text-sm font-semibold leading-relaxed drop-shadow`}>
              {renderCaption(caption)}
            </p>
            {hasLongCaption && (
              <button
                type="button"
                aria-expanded={captionExpanded}
                onClick={() => setCaptionExpanded((expanded) => !expanded)}
                className="mt-1 text-xs font-extrabold text-white underline underline-offset-2"
              >
                {captionExpanded ? "See less" : "See more"}
              </button>
            )}
          </div>
        )}
        <p className="flex items-center gap-1.5 text-[10px] font-bold text-white/75">
          <span aria-hidden>♫</span>
          Original audio · {author}
        </p>
      </div>

      <aside className="absolute bottom-[calc(6.5rem+env(safe-area-inset-bottom))] right-3 z-10 flex flex-col items-center gap-4 text-white md:bottom-24">
        <Link to={post ? `/profile/${post.authorId}` : "/confessions"} aria-label={`View ${author}`} className="mb-1 rounded-full shadow-lg">
          <Avatar
            name={post?.authorName ?? confession?.seedUsername ?? "Anonymous"}
            src={post?.authorAvatar ?? confession?.seedAvatarUrl}
            size="md"
          />
        </Link>
        {post ? (
          <>
            <ActionButton label={`${post.likedByMe ? "Unlike" : "Like"} · ${formatCompactNumber(reactionCount)}`} onClick={onLike} active={post.likedByMe} detail={formatCompactNumber(reactionCount)}>
              <Heart size={25} fill={post.likedByMe ? "currentColor" : "none"} />
            </ActionButton>
            <ActionButton label={`Comments · ${formatCompactNumber(post.commentCount)}`} onClick={onComment} detail={formatCompactNumber(post.commentCount)}>
              <MessageCircle size={24} />
            </ActionButton>
            <ActionButton label="Share video" onClick={onShare} detail={post.shareCount ? formatCompactNumber(post.shareCount) : undefined}>
              <Share2 size={23} />
            </ActionButton>
            <ActionButton label="More sharing options" onClick={onMore}>
              <MoreHorizontal size={23} />
            </ActionButton>
          </>
        ) : (
          <>
            <ActionButton label={`React · ${formatCompactNumber(reactionCount)}`} onClick={onConfessionReaction} active={confession?.myReaction === "heart"} detail={formatCompactNumber(reactionCount)}>
              <Heart size={25} fill={confession?.myReaction === "heart" ? "currentColor" : "none"} />
            </ActionButton>
            <ActionButton label={`Comments · ${formatCompactNumber(confession?.commentCount ?? 0)}`} onClick={onComment} detail={formatCompactNumber(confession?.commentCount ?? 0)}>
              <MessageCircle size={24} />
            </ActionButton>
            <ActionButton label="Share confession" onClick={onShareConfession}>
              <Share2 size={23} />
            </ActionButton>
            <ActionButton label="More sharing options" onClick={onMore}>
              <MoreHorizontal size={23} />
            </ActionButton>
          </>
        )}
        <button
          type="button"
          onClick={() => {
            const video = videoRef.current;
            if (!video) return;
            video.muted = !video.muted;
            setMuted(video.muted);
            if (!video.muted) setAudioBlocked(false);
          }}
          aria-label={muted ? "Turn sound on" : "Mute video"}
          className="flex min-h-11 flex-col items-center gap-1 text-[10px] font-extrabold drop-shadow"
        >
          <span className="flex size-11 items-center justify-center rounded-full bg-black/35 backdrop-blur"><span className="sr-only">{playing ? "Playing" : "Paused"}</span>{muted ? <VolumeX size={21} /> : <Volume2 size={21} />}</span>
          Sound
        </button>
      </aside>
    </article>
  );
}

function ActionButton({
  label,
  onClick,
  active = false,
  children,
  detail,
}: {
  label: string;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  active?: boolean;
  children: ReactNode;
  detail?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`flex min-h-11 flex-col items-center gap-1 text-[10px] font-extrabold drop-shadow ${active ? "text-pink-400" : "text-white"}`}
    >
      <span className="flex size-11 items-center justify-center rounded-full bg-black/35 backdrop-blur">{children}</span>
      {detail !== undefined && <span>{detail}</span>}
    </button>
  );
}
