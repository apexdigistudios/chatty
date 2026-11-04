import { memo, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import {
  Bookmark,
  BookmarkCheck,
  Clock3,
  Eye,
  Heart,
  MessageCircle,
  MoreHorizontal,
  Plus,
  Share2,
  ShieldCheck,
  ShieldAlert,
  Users,
  Zap,
  ZoomIn,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { isUserGlobalAdmin } from "../../lib/adminAccess";
import { useCanModerate } from "../../hooks/useModeration";
import { isPostSaved, subscribeToSavedPosts, toggleSavedPost } from "../../lib/savedPosts";
import { cachePublicMedia } from "../../lib/offlineCache";
import { describeError } from "../../lib/supabase";
import { timeAgo } from "../../lib/time";
import { recordPostShare } from "../../services/followsService";
import { addSeedPostComments, addSeedPostLikes, addSeedPostViews } from "../../services/postsService";
import { useAuthGateStore } from "../../store/authGateStore";
import { useGistStore } from "../../store/gistStore";
import { springs } from "../../theme/tokens";
import type { Post } from "../../types/models";
import { cn } from "../../utils/cn";
import { Avatar } from "../ui/Avatar";
import { Badge } from "../ui/Badge";
import { ImageLightbox } from "../ui/ImageLightbox";
import { ProgressiveImage } from "../ui/ProgressiveImage";
import { SchoolTag } from "../ui/SchoolBadge";
import { VideoPostPlayer } from "./VideoPostPlayer";
import { useToast } from "../ui/Toast";
import { PostActionMenu } from "./PostActionMenu";
import { SpotlightModal } from "../spotlight/SpotlightModal";
import { ReportModal } from "./ReportModal";
import { ProfileHoverCard } from "../profile/ProfileHoverCard";
import { AnimatedReaction } from "../common/AnimatedReaction";

function renderHashtags(content: string) {
  const parts: Array<{ value: string; tag: string | null }> = [];
  let cursor = 0;
  for (const match of content.matchAll(/#([A-Za-z0-9_]{1,50})/g)) {
    const index = match.index ?? 0;
    if (index > cursor) parts.push({ value: content.slice(cursor, index), tag: null });
    parts.push({ value: match[0], tag: match[1]!.toLowerCase() });
    cursor = index + match[0].length;
  }
  if (cursor < content.length) parts.push({ value: content.slice(cursor), tag: null });
  return parts.map((part, index) =>
    part.tag ? (
      <Link
        key={`${part.tag}-${index}`}
        to={`/explore?tag=${encodeURIComponent(part.tag)}`}
        className="cursor-pointer font-bold text-brand-deep hover:underline"
      >
        {part.value}
      </Link>
    ) : (
      <span key={index}>{part.value}</span>
    )
  );
}

interface GistCardProps {
  post: Post;
  /** Called after a post is removed (author delete or moderator removal). */
  onRemoved?: (postId: string) => void;
}

/** Public SHS gist card bound to live Supabase rows. */
export const GistCard = memo(function GistCard({ post, onRemoved }: GistCardProps) {
  const { toast } = useToast();
  const { user, isGlobalAdmin } = useAuth();
  const canModerate = useCanModerate();
  const canBoostSeeds = isGlobalAdmin || isUserGlobalAdmin(user?.email);
  const openAuthGate = useAuthGateStore((state) => state.openAuthGate);
  const toggleLike = useGistStore((state) => state.toggleLike);
  const openComments = useGistStore((state) => state.openComments);
  const removePostLocally = useGistStore((state) => state.removePostLocally);

  const [menuOpen, setMenuOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [saved, setSaved] = useState(() => isPostSaved(post.id));
  const [spotlightOpen, setSpotlightOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [textExpanded, setTextExpanded] = useState(false);
  const [textOverflows, setTextOverflows] = useState(false);
  const [seededLikeCount, setSeededLikeCount] = useState(post.likeCount);
  const [seededCommentCount, setSeededCommentCount] = useState(post.commentCount);
  const [seededViewCount, setSeededViewCount] = useState(post.viewCount ?? 0);
  const [adminToolsOpen, setAdminToolsOpen] = useState(false);
  const [adminIncrement, setAdminIncrement] = useState("10");
  const [adminBusy, setAdminBusy] = useState(false);
  const articleRef = useRef<HTMLElement>(null);
  const textRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    setSaved(isPostSaved(post.id));
    return subscribeToSavedPosts(() => setSaved(isPostSaved(post.id)));
  }, [post.id]);

  useEffect(() => {
    setTextExpanded(false);
  }, [post.id]);

  useEffect(() => {
    const element = textRef.current;
    if (!element || textExpanded) return;

    const measure = () => setTextOverflows(element.scrollHeight > element.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [post.content, textExpanded]);

  const media = post.mediaUrls.map((src, index) => ({
    src,
    alt: `Photo ${index + 1} shared by ${post.authorName} from ${post.schoolShort}`,
    type: post.mediaTypes?.[index] ?? (index === 0 ? post.mediaType : "image"),
    duration: post.videoDurations?.[index] ?? (index === 0 ? post.videoDurationSeconds : null),
  }));
  const imageMedia = media.filter((item) => item.type === "image");
  const moderator = canModerate(post.schoolId);
  const isAuthor = user?.id === post.authorId;
  const canDelete = Boolean(user) && (isAuthor || moderator);
  const profileHref = user?.id === post.authorId ? "/profile" : `/profile/${post.authorId}`;

  useEffect(() => {
    const article = articleRef.current;
    if (!article || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        void (async () => {
          for (const item of media) {
            await cachePublicMedia(item.src, item.type);
          }
        })().catch((error: unknown) => {
          console.warn("Could not pre-cache gist media for offline use.", error);
        });
      },
      { rootMargin: "500px 0px" }
    );
    observer.observe(article);
    return () => observer.disconnect();
  }, [post.id]);

  const requireAuth = () => {
    if (user) return true;
    setMenuOpen(false);
    openAuthGate({
      title: `Join ${post.schoolShort} & Ghana SHSs!`,
      speech: `Create your secret @nickname in 30 seconds to like @${post.authorName}'s gist and join the banter!`,
      prefillSchoolId: post.schoolId,
    });
    return false;
  };

  const like = async () => {
    if (!requireAuth()) return;
    try {
      await toggleLike(post.id);
    } catch (error) {
      toast(describeError(error), "danger");
    }
  };

  const share = async () => {
    const url = `${window.location.origin}/profile/${post.authorId}?gist=${post.id}`;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "Gist on Gist me", text: post.content.slice(0, 120), url });
        void recordPostShare(post.id).catch((error: unknown) => {
          console.error("Could not record this gist share.", error);
        });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast("Gist link copied to clipboard.", "info");
      void recordPostShare(post.id).catch((error: unknown) => {
        console.error("Could not record this gist share.", error);
      });
    } catch {
      toast("Gist link is ready to share.", "brand");
    }
  };

  const quickSave = () => {
    const next = toggleSavedPost(post.id);
    setSaved(next);
    toast(next ? "Gist saved to your device." : "Removed from saved gists.", next ? "success" : "brand");
  };

  const handleDeleted = (postId: string) => {
    removePostLocally(postId);
    onRemoved?.(postId);
  };

  const displayLikeCount = Math.max(post.likeCount, seededLikeCount);
  const displayCommentCount = Math.max(post.commentCount, seededCommentCount);
  const handleSeeded = (counts: { likesCount?: number; commentsCount?: number }) => {
    const updatedCounts = {
      ...(counts.likesCount !== undefined
        ? { likeCount: Math.max(post.likeCount, counts.likesCount) }
        : {}),
      ...(counts.commentsCount !== undefined
        ? { commentCount: Math.max(post.commentCount, counts.commentsCount) }
        : {}),
    };
    if (updatedCounts.likeCount !== undefined) setSeededLikeCount(updatedCounts.likeCount);
    if (updatedCounts.commentCount !== undefined) setSeededCommentCount(updatedCounts.commentCount);
    useGistStore.getState().patchPost(post.id, updatedCounts);
  };

  const boostFromCard = async (metric: "likes" | "comments" | "views", increment: number) => {
    if (!Number.isSafeInteger(increment) || increment < 1 || increment > 100000) {
      toast("Enter a whole number between 1 and 100000.", "danger");
      return;
    }
    setAdminBusy(true);
    try {
      const count = metric === "likes"
        ? await addSeedPostLikes(post.id, increment)
        : metric === "comments"
          ? await addSeedPostComments(post.id, increment)
          : await addSeedPostViews(post.id, increment);
      if (metric === "likes") {
        const nextLikeCount = Math.max(displayLikeCount + increment, post.likeCount, count);
        setSeededLikeCount(nextLikeCount);
        useGistStore.getState().patchPost(post.id, { likeCount: nextLikeCount });
      }
      if (metric === "comments") handleSeeded({ commentsCount: Math.max(post.commentCount, count) });
      if (metric === "views") {
        setSeededViewCount(count);
        useGistStore.getState().patchPost(post.id, { viewCount: count });
      }
      toast(`Added ${increment} seed ${metric}.`, "success");
    } catch (error) {
      toast(describeError(error, `Could not add seed ${metric}.`), "danger");
    } finally {
      setAdminBusy(false);
    }
  };

  return (
    <article
      ref={articleRef}
      role="article"
      aria-label={`Gist by ${post.authorName} from ${post.schoolShort}`}
      className="relative w-full overflow-visible border-b-4 border-line/60 px-4 py-3 dark:border-neutral-900/60"
    >
      <div className="flex items-start gap-2.5 pb-2.5">
        <ProfileHoverCard
          userId={post.authorId}
          username={post.authorName}
          fullName={post.authorFullName ?? null}
          avatarUrl={post.authorAvatar}
          schoolName={post.schoolShort}
          isSeed={post.isSeed}
        >
          <Link
            to={profileHref}
            aria-label={`View @${post.authorName}'s public profile`}
            className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft"
          >
            <Avatar name={post.authorName} src={post.authorAvatar} size="md" />
          </Link>
        </ProfileHoverCard>
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <Link
              to={profileHref}
              className="max-w-full truncate text-[14px] font-extrabold leading-tight text-ink hover:text-brand-deep hover:underline"
            >
              {post.authorFullName || `@${post.authorName}`}
            </Link>
            {post.authorFullName && (
              <span className="truncate text-[10px] font-semibold text-ink-muted">@{post.authorName}</span>
            )}
            {post.status !== "active" && (
              <Badge tone={post.status === "flagged" ? "warning" : "danger"} className="px-2 py-0.5 text-[9px]">
                <ShieldAlert size={10} strokeWidth={2.6} aria-hidden />
                {post.status}
              </Badge>
            )}
            {post.spotlightStatus === "active" && (
              <span className="inline-flex shrink-0 items-center gap-1 text-[9px] font-black uppercase tracking-wide text-purple-700 dark:text-purple-300">
                <span aria-hidden>✦</span>
                Spotlight
              </span>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <SchoolTag
              schoolId={post.schoolId}
              crestUrl={post.schoolCrest}
              name={post.schoolShort}
              size="xs"
              nameClassName="text-[10px] font-semibold text-ink-muted"
            />
            {post.groupName && (
              <Badge tone="brand" className="gap-1 px-2 py-0.5 text-[9px]">
                <Users size={10} strokeWidth={2.8} aria-hidden />
                {post.groupEmoji ?? "👥"} {post.groupName}
              </Badge>
            )}
            <span className="size-1 rounded-full bg-ink-faint" aria-hidden />
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-ink-muted">
              <Clock3 size={12} strokeWidth={2.4} aria-hidden />
              {timeAgo(post.createdAt)}
            </span>
          </div>
        </div>
        <div className="-mr-1 -mt-1 flex shrink-0 items-center gap-1">
          {canBoostSeeds && post.isSeed && (
            <button
              type="button"
              onClick={() => setAdminToolsOpen((open) => !open)}
              aria-label="Admin tools for seeded gist"
              aria-expanded={adminToolsOpen}
              className="flex min-h-11 items-center gap-1 rounded-full bg-brand-wash px-2.5 text-[10px] font-black text-brand-deep hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft"
            >
              <ShieldCheck size={15} aria-hidden />
              <span className="hidden sm:inline">Admin Tools</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label="More gist actions"
            aria-expanded={menuOpen}
            className="flex size-11 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-page hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft"
          >
            <MoreHorizontal size={18} strokeWidth={2.5} aria-hidden />
          </button>
        </div>
      </div>

      {canBoostSeeds && post.isSeed && adminToolsOpen && (
        <div className="absolute right-3 top-14 z-50 w-[min(19rem,calc(100%-1.5rem))] rounded-2xl border-2 border-brand-soft bg-card p-3 shadow-2xl">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-xs font-black text-ink"><ShieldCheck size={14} className="text-brand-deep" aria-hidden /> Admin Tools</p>
            <button type="button" onClick={() => setAdminToolsOpen(false)} aria-label="Close admin tools" className="flex size-8 items-center justify-center rounded-lg text-ink-muted hover:bg-page"><MoreHorizontal size={15} aria-hidden /></button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" disabled={adminBusy} onClick={() => void boostFromCard("likes", 10)} className="flex min-h-10 items-center justify-center gap-1 rounded-xl border border-line px-2 text-[10px] font-extrabold text-ink hover:border-brand disabled:opacity-50"><Heart size={12} aria-hidden /> +10 likes</button>
            <button type="button" disabled={adminBusy} onClick={() => void boostFromCard("likes", 50)} className="flex min-h-10 items-center justify-center gap-1 rounded-xl border border-line px-2 text-[10px] font-extrabold text-ink hover:border-brand disabled:opacity-50"><Heart size={12} aria-hidden /> +50 likes</button>
            <button type="button" disabled={adminBusy} onClick={() => void boostFromCard("views", 100)} className="flex min-h-10 items-center justify-center gap-1 rounded-xl border border-line px-2 text-[10px] font-extrabold text-ink hover:border-brand disabled:opacity-50"><Eye size={12} aria-hidden /> +100 views</button>
            <button type="button" disabled={adminBusy} onClick={() => void boostFromCard("comments", 1)} className="flex min-h-10 items-center justify-center gap-1 rounded-xl border border-line px-2 text-[10px] font-extrabold text-ink hover:border-brand disabled:opacity-50"><MessageCircle size={12} aria-hidden /> +1 comment</button>
          </div>
          <div className="mt-2 flex gap-2">
            <input type="number" min={1} max={100000} value={adminIncrement} onChange={(event) => setAdminIncrement(event.target.value)} aria-label="Custom seed likes increment" className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-page px-2 text-xs font-bold text-ink outline-none focus:border-brand" />
            <button type="button" disabled={adminBusy} onClick={() => void boostFromCard("likes", Number(adminIncrement))} className="flex min-h-10 items-center gap-1 rounded-xl bg-brand px-3 text-[10px] font-black text-white disabled:opacity-50"><Plus size={13} aria-hidden /> Add likes</button>
          </div>
          <p className="mt-2 flex items-center gap-1 text-[9px] font-semibold text-ink-muted"><Eye size={11} aria-hidden /> Seed views: {seededViewCount}</p>
        </div>
      )}

      <div>
        <div className="relative">
          <p
            ref={textRef}
            className={cn(
              "whitespace-pre-wrap wrap-break-word text-[15px] font-medium leading-[1.45] text-ink-soft",
              !textExpanded && "line-clamp-2 pr-20"
            )}
          >
            {renderHashtags(post.content)}
          </p>
          {textOverflows && !textExpanded && (
            <button
              type="button"
              onClick={() => setTextExpanded(true)}
              className="absolute bottom-0 right-0 bg-page pl-1 text-[14px] font-extrabold text-ink-muted hover:text-ink"
            >
              … See more
            </button>
          )}
        </div>
        {textExpanded && (
          <button
            type="button"
            onClick={() => setTextExpanded(false)}
            className="mt-1 text-xs font-extrabold text-ink-muted hover:text-ink"
          >
            See less
          </button>
        )}

        {media.length === 1 && media[0]?.type === "video" ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={springs.gentle}
            className="-mx-4 mt-3 w-[calc(100%+2rem)]"
          >
            <VideoPostPlayer src={media[0].src} durationSeconds={media[0].duration} edgeToEdge />
          </motion.div>
        ) : media.length > 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={springs.gentle}
            className={cn("-mx-4 mt-3 w-[calc(100%+2rem)]", media.length > 1 ? "grid grid-cols-2 gap-0" : "block")}
          >
            {media.map((item) => item.type === "video" ? (
              <div key={item.src} className="overflow-hidden bg-black">
                <VideoPostPlayer src={item.src} durationSeconds={item.duration} edgeToEdge />
              </div>
            ) : (
              <div key={item.src} className="overflow-hidden rounded-none border-0 bg-page shadow-none">
                <button
                  type="button"
                  onClick={() => setLightboxIndex(imageMedia.indexOf(item))}
                  aria-label={`Open full-screen: ${item.alt}`}
                  className="group relative block w-full cursor-zoom-in focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft"
                >
                  <ProgressiveImage
                    src={item.src}
                    alt={item.alt}
                    referrerPolicy="no-referrer"
                    containerClassName="aspect-[4/3] max-h-[480px] w-full bg-neutral-950"
                    fit="cover"
                  />
                  <span className="absolute right-2.5 top-2.5 flex items-center gap-1 rounded-full bg-[#09090b]/75 px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-white opacity-0 backdrop-blur transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                    <ZoomIn size={11} strokeWidth={2.8} aria-hidden />
                    Full screen
                  </span>
                </button>
              </div>
            ))}
          </motion.div>
        ) : null}
      </div>

      <div className="mt-2 flex w-full flex-wrap items-center justify-between gap-1 border-t border-line/50 pt-1.5">
        <AnimatedReaction
          type="button"
          onClick={like}
          aria-pressed={post.likedByMe}
          aria-label={`${post.likedByMe ? "Unlike" : "Like"} gist, ${displayLikeCount} likes`}
          icon={<Heart size={17} strokeWidth={2.5} fill={post.likedByMe ? "currentColor" : "none"} />}
          count={displayLikeCount}
          iconClassName="motion-safe:transition-transform"
          className={cn(
            "flex min-h-11 items-center gap-1.5 rounded-xl px-2.5 text-xs font-extrabold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft sm:px-3 sm:text-sm",
            post.likedByMe ? "bg-danger-wash text-danger" : "text-ink-muted hover:bg-page hover:text-danger"
          )}
        />
        {canBoostSeeds && post.isSeed && (
          <button
            type="button"
            disabled={adminBusy}
            onClick={() => void boostFromCard("likes", 10)}
            aria-label="Boost seed likes by 10"
            className="flex min-h-11 items-center gap-1 rounded-xl px-2.5 text-[10px] font-extrabold text-brand-deep transition-colors hover:bg-brand-wash focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft disabled:opacity-50 sm:px-3 sm:text-xs"
          >
            <Zap size={14} fill="currentColor" aria-hidden />
            <span>Boost Seed Likes (+10)</span>
          </button>
        )}

        <motion.button
          type="button"
          whileTap={{ scale: 0.92 }}
          transition={springs.snappy}
          onClick={() => openComments({ type: "post", id: post.id })}
          aria-label={`Open comments, ${displayCommentCount} comments`}
          className="flex min-h-11 items-center gap-1.5 rounded-xl px-2.5 text-xs font-extrabold text-ink-muted transition-colors hover:bg-brand-wash hover:text-brand-deep focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft sm:px-3 sm:text-sm"
        >
          <MessageCircle size={17} strokeWidth={2.4} aria-hidden />
          <span className="tabular-nums">{displayCommentCount}</span>
        </motion.button>

        <motion.button
          type="button"
          whileTap={{ scale: 0.92 }}
          transition={springs.snappy}
          onClick={share}
          className="flex min-h-11 items-center gap-1.5 rounded-xl px-2.5 text-xs font-extrabold text-ink-muted transition-colors hover:bg-page hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft sm:px-3 sm:text-sm"
        >
          <Share2 size={16} strokeWidth={2.4} aria-hidden />
          <span className="hidden sm:inline">Share</span>
        </motion.button>

        <AnimatedReaction
          type="button"
          onClick={quickSave}
          aria-pressed={saved}
          aria-label={saved ? "Remove saved gist" : "Save gist"}
          icon={saved ? <BookmarkCheck size={16} strokeWidth={2.4} aria-hidden /> : <Bookmark size={16} strokeWidth={2.4} aria-hidden />}
          className={cn(
            "flex min-h-11 items-center gap-1.5 rounded-xl px-2.5 text-xs font-extrabold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft sm:px-3 sm:text-sm",
            saved ? "bg-brand-wash text-brand-deep" : "text-ink-muted hover:bg-page hover:text-brand-deep"
          )}
        >
          <span className="hidden sm:inline">{saved ? "Saved" : "Save"}</span>
        </AnimatedReaction>

        <span className="ml-auto pr-1 text-[9px] font-bold uppercase tracking-wider text-ink-faint">
          {post.groupName ? "Club gist" : "Campus gist"}
        </span>
      </div>

      <PostActionMenu
        post={post}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        canDelete={canDelete}
        onDeleted={handleDeleted}
        onShare={share}
        onPromote={() => setSpotlightOpen(true)}
        onSeeded={handleSeeded}
        onReport={() => {
          if (!user) {
            openAuthGate({
              title: "Report a Gist",
              speech: "Create your secret student pass to report content to the campus moderators.",
              outfit: "fbi_security",
              prefillSchoolId: post.schoolId,
            });
            return;
          }
          setReportOpen(true);
        }}
      />

      {spotlightOpen && <SpotlightModal post={post} onClose={() => setSpotlightOpen(false)} />}
      {reportOpen && <ReportModal post={post} onClose={() => setReportOpen(false)} />}

      {imageMedia.length > 0 && (
        <ImageLightbox images={imageMedia} index={lightboxIndex} onClose={() => setLightboxIndex(null)} />
      )}
    </article>
  );
});
