import { memo, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import {
  Bookmark,
  BookmarkCheck,
  Clock3,
  Heart,
  MessageCircle,
  MoreHorizontal,
  Share2,
  ShieldAlert,
  Users,
  Zap,
  ZoomIn,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useCanModerate } from "../../hooks/useModeration";
import { isPostSaved, subscribeToSavedPosts, toggleSavedPost } from "../../lib/savedPosts";
import { describeError } from "../../lib/supabase";
import { timeAgo } from "../../lib/time";
import { useAuthGateStore } from "../../store/authGateStore";
import { useGistStore } from "../../store/gistStore";
import { springs } from "../../theme/tokens";
import type { Post } from "../../types/models";
import { cn } from "../../utils/cn";
import { Avatar } from "../ui/Avatar";
import { Badge } from "../ui/Badge";
import { Card, CardBody, CardHeader } from "../ui/Card";
import { ImageLightbox } from "../ui/ImageLightbox";
import { ProgressiveImage } from "../ui/ProgressiveImage";
import { SchoolTag } from "../ui/SchoolBadge";
import { VideoPostPlayer } from "./VideoPostPlayer";
import { useToast } from "../ui/Toast";
import { PostActionMenu } from "./PostActionMenu";
import { SpotlightModal } from "../spotlight/SpotlightModal";
import { ReportModal } from "./ReportModal";

interface GistCardProps {
  post: Post;
  /** Called after a post is removed (author delete or moderator removal). */
  onRemoved?: (postId: string) => void;
}

/** Public SHS gist card bound to live Supabase rows. */
export const GistCard = memo(function GistCard({ post, onRemoved }: GistCardProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const canModerate = useCanModerate();
  const openAuthGate = useAuthGateStore((state) => state.openAuthGate);
  const toggleLike = useGistStore((state) => state.toggleLike);
  const openComments = useGistStore((state) => state.openComments);
  const removePostLocally = useGistStore((state) => state.removePostLocally);

  const [menuOpen, setMenuOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [saved, setSaved] = useState(() => isPostSaved(post.id));
  const [spotlightOpen, setSpotlightOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  useEffect(() => {
    setSaved(isPostSaved(post.id));
    return subscribeToSavedPosts(() => setSaved(isPostSaved(post.id)));
  }, [post.id]);

  const media = post.mediaUrls.map((src, index) => ({
    src,
    alt: `Photo ${index + 1} shared by ${post.authorName} from ${post.schoolShort}`,
  }));
  const moderator = canModerate(post.schoolId);
  const isAuthor = user?.id === post.authorId;
  const canDelete = Boolean(user) && (isAuthor || moderator);
  const profileHref = user?.id === post.authorId ? "/profile" : `/profile/${post.authorId}`;

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
        await navigator.share({ title: "Gist on Let's Gist", text: post.content.slice(0, 120), url });
        return;
      } catch {
        // User cancelled or share unavailable → fall through to clipboard.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast("Gist link copied to clipboard.", "info");
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

  return (
    <Card
      role="article"
      aria-label={`Gist by ${post.authorName} from ${post.schoolShort}`}
      className="relative overflow-visible"
    >
      <CardHeader className="items-start gap-3 px-4 pb-3 pt-4 sm:px-5 sm:pt-5">
        <Link
          to={profileHref}
          aria-label={`View @${post.authorName}'s public profile`}
          className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft"
        >
          <Avatar name={post.authorName} src={post.authorAvatar} size="lg" />
        </Link>
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <Link
              to={profileHref}
              className="max-w-full truncate text-sm font-extrabold text-ink hover:text-brand-deep hover:underline sm:text-[15px]"
            >
              @{post.authorName}
            </Link>
            {post.status !== "active" && (
              <Badge tone={post.status === "flagged" ? "warning" : "danger"} className="px-2 py-0.5 text-[9px]">
                <ShieldAlert size={10} strokeWidth={2.6} aria-hidden />
                {post.status}
              </Badge>
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <SchoolTag
              schoolId={post.schoolId}
              crestUrl={post.schoolCrest}
              name={post.schoolShort}
              size="xs"
              nameClassName="text-[11px] font-semibold text-ink-muted"
            />
            {post.groupName && (
              <Badge tone="brand" className="gap-1 px-2 py-0.5 text-[9px]">
                <Users size={10} strokeWidth={2.8} aria-hidden />
                {post.groupEmoji ?? "👥"} {post.groupName}
              </Badge>
            )}
            <span className="size-1 rounded-full bg-ink-faint" aria-hidden />
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-ink-muted">
              <Clock3 size={12} strokeWidth={2.4} aria-hidden />
              {timeAgo(post.createdAt)}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-label="More gist actions"
          aria-expanded={menuOpen}
          className="-mr-1 -mt-1 flex size-9 shrink-0 items-center justify-center rounded-xl text-ink-muted transition-colors hover:bg-page hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft"
        >
          <MoreHorizontal size={18} strokeWidth={2.5} aria-hidden />
        </button>
        {post.spotlightStatus === "active" && (
          <Badge
            tone="brand"
            className="shrink-0 gap-1 border border-purple-500/40 bg-purple-500/10 px-2 py-1 text-[9px] text-purple-600 dark:text-purple-400"
          >
            <Zap size={11} fill="currentColor" aria-hidden />
            Spotlight
          </Badge>
        )}
      </CardHeader>

      <CardBody className="px-4 pb-4 sm:px-5 sm:pb-5">
        <p className="whitespace-pre-wrap wrap-break-word text-[15px] font-semibold leading-[1.65] text-ink-soft sm:text-base">
          {post.content}
        </p>

        {media.length > 0 && post.mediaType === "video" && media[0] ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={springs.gentle}
            className="mt-3.5"
          >
            <VideoPostPlayer src={media[0].src} durationSeconds={post.videoDurationSeconds} />
          </motion.div>
        ) : media.length > 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={springs.gentle}
            className={cn("mt-3.5", media.length > 1 ? "grid grid-cols-2 gap-2" : "block")}
          >
            {media.map((item, index) => (
              <div key={item.src} className="overflow-hidden rounded-[22px] border-2 border-line bg-page shadow-[0_4px_0_var(--border-color)]">
                <button
                  type="button"
                  onClick={() => setLightboxIndex(index)}
                  aria-label={`Open full-screen: ${item.alt}`}
                  className="group relative block w-full cursor-zoom-in focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft"
                >
                  <ProgressiveImage
                    src={item.src}
                    alt={item.alt}
                    referrerPolicy="no-referrer"
                    containerClassName={media.length > 1 ? "aspect-square w-full" : "aspect-[4/3] w-full"}
                    className="group-hover:scale-[1.02]"
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
      </CardBody>

      <div className="flex flex-wrap items-center gap-1 border-t-2 border-line px-2 py-2 sm:px-3">
        <motion.button
          type="button"
          whileTap={{ scale: 0.88 }}
          transition={springs.snappy}
          onClick={like}
          aria-pressed={post.likedByMe}
          aria-label={`${post.likedByMe ? "Unlike" : "Like"} gist, ${post.likeCount} likes`}
          className={cn(
            "flex min-h-10 items-center gap-1.5 rounded-xl px-2.5 text-xs font-extrabold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft sm:px-3 sm:text-sm",
            post.likedByMe ? "bg-danger-wash text-danger" : "text-ink-muted hover:bg-page hover:text-danger"
          )}
        >
          <motion.span
            animate={{ scale: post.likedByMe ? [1, 1.28, 1] : 1, rotate: post.likedByMe ? [0, -12, 0] : 0 }}
            transition={springs.bouncy}
            className="inline-flex"
            aria-hidden
          >
            <Heart size={17} strokeWidth={2.5} fill={post.likedByMe ? "currentColor" : "none"} />
          </motion.span>
          <span className="tabular-nums">{post.likeCount}</span>
        </motion.button>

        <motion.button
          type="button"
          whileTap={{ scale: 0.92 }}
          transition={springs.snappy}
          onClick={() => openComments(post.id)}
          aria-label={`Open comments, ${post.commentCount} comments`}
          className="flex min-h-10 items-center gap-1.5 rounded-xl px-2.5 text-xs font-extrabold text-ink-muted transition-colors hover:bg-brand-wash hover:text-brand-deep focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft sm:px-3 sm:text-sm"
        >
          <MessageCircle size={17} strokeWidth={2.4} aria-hidden />
          <span className="tabular-nums">{post.commentCount}</span>
        </motion.button>

        <motion.button
          type="button"
          whileTap={{ scale: 0.92 }}
          transition={springs.snappy}
          onClick={share}
          className="flex min-h-10 items-center gap-1.5 rounded-xl px-2.5 text-xs font-extrabold text-ink-muted transition-colors hover:bg-page hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft sm:px-3 sm:text-sm"
        >
          <Share2 size={16} strokeWidth={2.4} aria-hidden />
          <span className="hidden sm:inline">Share</span>
        </motion.button>

        <motion.button
          type="button"
          whileTap={{ scale: 0.88 }}
          transition={springs.snappy}
          onClick={quickSave}
          aria-pressed={saved}
          aria-label={saved ? "Remove saved gist" : "Save gist"}
          className={cn(
            "flex min-h-10 items-center gap-1.5 rounded-xl px-2.5 text-xs font-extrabold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft sm:px-3 sm:text-sm",
            saved ? "bg-brand-wash text-brand-deep" : "text-ink-muted hover:bg-page hover:text-brand-deep"
          )}
        >
          {saved ? <BookmarkCheck size={16} strokeWidth={2.4} aria-hidden /> : <Bookmark size={16} strokeWidth={2.4} aria-hidden />}
          <span className="hidden sm:inline">{saved ? "Saved" : "Save"}</span>
        </motion.button>

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

      {post.mediaType !== "video" && media.length > 0 && (
        <ImageLightbox images={media} index={lightboxIndex} onClose={() => setLightboxIndex(null)} />
      )}
    </Card>
  );
});
