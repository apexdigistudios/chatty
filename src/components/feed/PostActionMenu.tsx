import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bookmark,
  BookmarkCheck,
  Check,
  Download,
  Flag,
  Link2,
  Loader2,
  Share2,
  ShieldCheck,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { downloadMedia } from "../../lib/download";
import { isPostSaved, toggleSavedPost } from "../../lib/savedPosts";
import { describeError } from "../../lib/supabase";
import { recordPostShare } from "../../services/followsService";
import { deletePost } from "../../services/postsService";
import { springs } from "../../theme/tokens";
import type { Post } from "../../types/models";
import { cn } from "../../utils/cn";
import { Avatar } from "../ui/Avatar";
import { useToast } from "../ui/Toast";

interface PostActionMenuProps {
  post: Post;
  open: boolean;
  onClose: () => void;
  /** True for the author, school founder/moderator or global admin. */
  canDelete: boolean;
  onDeleted?: (postId: string) => void;
  onShare: () => Promise<void> | void;
  onPromote?: () => void;
  onReport?: () => void;
}

/**
 * Post action sheet: Save, Download image, Share and Report are available to
 * everyone (guests included). Delete is rendered only when `canDelete` and
 * performs a Supabase soft-delete (`status = 'removed'`).
 */
export function PostActionMenu({ post, open, onClose, canDelete, onDeleted, onShare, onPromote, onReport }: PostActionMenuProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const menuRef = useRef<HTMLDivElement>(null);

  const [saved, setSaved] = useState(() => isPostSaved(post.id));
  const [view, setView] = useState<"main" | "confirm-delete">("main");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setSaved(isPostSaved(post.id));
      setView("main");
    }
  }, [open, post.id]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  const save = () => {
    const next = toggleSavedPost(post.id);
    setSaved(next);
    toast(next ? "Gist saved to your device." : "Removed from saved gists.", next ? "success" : "brand");
    onClose();
  };

  const download = async () => {
    const src = post.mediaUrls[0];
    if (!src) return;
    setBusy(true);
    const result = await downloadMedia(src, `letsgist-${post.schoolShort}-${post.id.slice(0, 6)}`);
    setBusy(false);
    toast(
      result === "downloaded" ? "Photo downloaded." : "Photo opened — long-press to save.",
      "info"
    );
    onClose();
  };

  const share = async () => {
    await onShare();
    onClose();
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/profile/${post.authorId}?gist=${post.id}`
      );
      toast("Link copied to clipboard.", "info");
      void recordPostShare(post.id).catch((error: unknown) => {
        console.error("Could not record this gist share.", error);
      });
    } catch {
      toast("Could not copy the link.", "danger");
    }
    onClose();
  };

  const remove = async () => {
    setBusy(true);
    try {
      await deletePost(post.id);
      toast("Gist removed.", "success");
      onDeleted?.(post.id);
      onClose();
    } catch (error) {
      toast(describeError(error), "danger");
    } finally {
      setBusy(false);
    }
  };

  const itemClass =
    "flex min-h-11 w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs font-extrabold text-ink-soft transition-colors hover:bg-page";

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={menuRef}
          initial={{ opacity: 0, y: -6, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -4, scale: 0.98 }}
          transition={springs.snappy}
          role="menu"
          aria-label={`Actions for gist by ${post.authorName}`}
          className="absolute right-2 top-14 z-30 w-64 max-w-[calc(100vw-1rem)] origin-top-right overflow-hidden rounded-2xl border-2 border-line bg-card p-2 shadow-[0_6px_0_var(--border-strong)]"
        >
          {view === "main" ? (
            <>
              <div className="flex items-center gap-2.5 border-b-2 border-line px-1.5 pb-2 pt-0.5">
                <Avatar name={post.authorName} src={post.authorAvatar} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] font-extrabold text-ink">@{post.authorName}</p>
                  <p className="truncate text-[10px] font-semibold text-ink-muted">
                    {post.groupName ? `${post.schoolShort} · ${post.groupName}` : post.schoolShort}
                  </p>
                </div>
                <button type="button" onClick={onClose} aria-label="Close menu" className="rounded-lg p-1 text-ink-muted hover:bg-page">
                  <X size={14} aria-hidden />
                </button>
              </div>

              <div className="mt-1 space-y-0.5">
                <button type="button" onClick={save} className={itemClass} role="menuitem">
                  {saved ? <BookmarkCheck size={16} className="text-brand-deep" aria-hidden /> : <Bookmark size={16} className="text-brand-deep" aria-hidden />}
                  {saved ? "Saved to device" : "Save gist"}
                </button>

                {post.mediaUrls.length > 0 && (
                  <button type="button" onClick={download} disabled={busy} className={itemClass} role="menuitem">
                    {busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Download size={16} className="text-brand-deep" aria-hidden />}
                    {post.mediaType === "video" ? "Download video" : "Download image"}
                  </button>
                )}

                <button type="button" onClick={share} className={itemClass} role="menuitem">
                  <Share2 size={16} className="text-brand-deep" aria-hidden />
                  Share gist
                </button>

                <button type="button" onClick={copyLink} className={itemClass} role="menuitem">
                  <Link2 size={16} className="text-brand-deep" aria-hidden />
                  Copy link
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onReport?.();
                  }}
                  className={itemClass}
                  role="menuitem"
                >
                  <Flag size={16} className="text-warning-deep" aria-hidden />
                  Report gist
                </button>

                {user?.id === post.authorId && post.status === "active" && onPromote && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onPromote();
                    }}
                    className={itemClass}
                    role="menuitem"
                  >
                    <Zap size={16} className="text-brand-deep" aria-hidden />
                    Promote this gist
                  </button>
                )}

                {canDelete && (
                  <>
                    <div className="my-1 border-t-2 border-line" />
                    <button
                      type="button"
                      onClick={() => setView("confirm-delete")}
                      className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-xs font-extrabold text-danger transition-colors hover:bg-danger-wash"
                      role="menuitem"
                    >
                      <Trash2 size={16} aria-hidden />
                      Delete gist
                    </button>
                  </>
                )}
              </div>

              <p className="mt-1 flex items-center gap-1 border-t border-line px-2 pb-0.5 pt-2 text-[9px] font-bold uppercase tracking-wider text-ink-faint">
                <ShieldCheck size={10} aria-hidden />
                {canDelete ? "Author / moderator controls" : "Guest-friendly actions"}
              </p>
            </>
          ) : (
            <div className="p-1.5">
              <div className="flex items-center gap-2 pb-2">
                <span className="flex size-8 items-center justify-center rounded-xl bg-danger-wash text-danger">
                  <Trash2 size={15} aria-hidden />
                </span>
                <p className="text-xs font-extrabold text-ink">Delete this gist?</p>
              </div>
              <p className="px-1 text-[11px] font-semibold leading-relaxed text-ink-muted">
                It will be hidden from every feed with <code className="font-black">status = removed</code>.
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={remove}
                  disabled={busy}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-danger px-3 py-2 text-xs font-extrabold uppercase tracking-wider text-white shadow-[0_3px_0_var(--danger-deep)] disabled:opacity-60"
                  )}
                >
                  {busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Trash2 size={14} aria-hidden />}
                  Delete
                </button>
                <button
                  type="button"
                  onClick={() => setView("main")}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border-2 border-line px-3 py-2 text-xs font-extrabold text-ink"
                >
                  <Check size={14} aria-hidden />
                  Keep
                </button>
              </div>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
