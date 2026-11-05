'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useDragControls } from "framer-motion";
import { Link } from "@/lib/router";
import { CornerDownRight, EyeOff, Heart, Loader2, MessageCircle, Send, Sparkles, Trash2, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useCanModerate } from "@/hooks/useModeration";
import { describeError } from "@/lib/supabase";
import { timeAgo } from "@/lib/time";
import { useAuthGateStore } from "@/store/authGateStore";
import { useGistStore } from "@/store/gistStore";
import { springs } from "@/theme/tokens";
import type { Comment } from "@/types/models";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { SchoolTag } from "@/components/ui/SchoolBadge";
import { useToast } from "@/components/ui/Toast";
import { VerifiedBadge } from "@/components/profile/VerifiedBadge";

const QUICK_REPLIES = ["Chale, facts!", "No size at all!", "Herh, campus gist!", "Big respect!"] as const;

/** Slide-up comment sheet shared by post and confession discussion threads. */
export function CommentDrawer() {
  const { toast } = useToast();
  const { user, profile, isGlobalAdmin } = useAuth();
  const canModerate = useCanModerate();
  const openAuthGate = useAuthGateStore((state) => state.openAuthGate);

  const activeTarget = useGistStore((state) => state.activeCommentThread);
  const posts = useGistStore((state) => state.posts);
  const confessions = useGistStore((state) => state.confessions);
  const commentsByThread = useGistStore((state) => state.commentsByThread);
  const commentsLoading = useGistStore((state) => state.commentsLoading);
  const commentsError = useGistStore((state) => state.commentsError);
  const closeComments = useGistStore((state) => state.closeComments);
  const addComment = useGistStore((state) => state.addComment);
  const deleteComment = useGistStore((state) => state.deleteComment);
  const toggleCommentLike = useGistStore((state) => state.toggleCommentLike);

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Comment | null>(null);
  const listEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragControls = useDragControls();

  const activePost = useMemo(
    () => activeTarget?.type === "post" ? posts.find((post) => post.id === activeTarget.id) ?? null : null,
    [activeTarget, posts]
  );
  const activeConfession = useMemo(
    () => activeTarget?.type === "confession" ? confessions.find((item) => item.id === activeTarget.id) ?? null : null,
    [activeTarget, confessions]
  );
  const threadKey = activeTarget ? `${activeTarget.type}:${activeTarget.id}` : "";
  const comments = commentsByThread[threadKey] ?? [];
  const loading = Boolean(commentsLoading[threadKey]);
  const loadError = commentsError[threadKey];
  const isOpen = Boolean(activeTarget);

  useEffect(() => {
    if (!isOpen) return;
    setDraft("");
    setReplyingTo(null);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 220);
    return () => window.clearTimeout(timer);
  }, [isOpen, activeTarget?.id]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeComments();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, closeComments]);

  useEffect(() => {
    if (!isOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isOpen]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = draft.trim();
    if (!activeTarget) return;
    if (!user) {
      closeComments();
      openAuthGate({
        title: activeTarget.type === "confession" ? "Comment anonymously" : "Reply to this Gist!",
        speech: "Grab your secret @nickname in 30 seconds to join the conversation across every SHS community!",
        prefillSchoolId: activePost?.schoolId ?? activeConfession?.schoolId ?? null,
      });
      return;
    }
    if (!text) return;
    setSending(true);
    try {
      await addComment(activeTarget, text, replyingTo?.id ?? null);
      setDraft("");
      setReplyingTo(null);
      window.setTimeout(() => listEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 80);
    } catch (error) {
      toast(describeError(error), "danger");
    } finally {
      setSending(false);
    }
  };

  const remove = async (commentId: string) => {
    if (!activeTarget) return;
    try {
      await deleteComment(activeTarget, commentId);
      toast("Comment removed.", "success");
    } catch (error) {
      toast(describeError(error), "danger");
    }
  };

  const likeComment = async (comment: Comment) => {
    if (!user || !activeTarget) {
      openAuthGate({
        title: "Like this reply",
        speech: "Join Gist me to like comments and join the campus conversation.",
        prefillSchoolId: activePost?.schoolId ?? activeConfession?.schoolId ?? null,
      });
      return;
    }
    try {
      await toggleCommentLike(activeTarget, comment.id);
    } catch (error) {
      toast(describeError(error), "danger");
    }
  };

  const renderComment = (comment: Comment, depth = 0) => {
    const canDelete = user?.id === comment.authorId ||
      isGlobalAdmin ||
      (activePost ? canModerate(activePost.schoolId) : false);
    const replies = comments.filter((item) => item.parentId === comment.id);
    return (
      <div key={comment.id} className={depth > 0 ? "ml-4 border-l-2 border-line pl-3 sm:ml-6" : ""}>
        <motion.article
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={springs.gentle}
          className="flex items-start gap-3 rounded-2xl border-2 border-line bg-page p-3"
        >
          <Avatar name={comment.authorName} src={comment.authorAvatar} size="md" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Link
                to={comment.authorId === user?.id ? "/profile" : `/profile/${comment.authorId}`}
                onClick={closeComments}
                className="truncate text-xs font-extrabold text-ink hover:text-brand-deep hover:underline sm:text-[13px]"
              >
                @{comment.authorName}
              </Link>
              <VerifiedBadge
                isVerified={comment.authorIsVerified}
                verifiedExpiresAt={comment.authorVerifiedExpiresAt}
                verifiedTitle={comment.authorVerifiedTitle}
                isAdmin={comment.authorIsAdmin}
                role={comment.authorRole}
              />
              {comment.authorSchoolShort && (
                <SchoolTag schoolId={comment.authorSchoolId} name={comment.authorSchoolShort} size="xs" nameClassName="text-[10px] font-bold text-ink-muted" />
              )}
              <span className="text-[10px] font-semibold text-ink-muted">· {timeAgo(comment.createdAt)}</span>
            </div>
            <p className="mt-1.5 wrap-break-word text-[13px] font-semibold leading-relaxed text-ink-soft sm:text-sm">{comment.content}</p>
            <div className="mt-2 flex items-center gap-3">
              <button
                type="button"
                onClick={() => void likeComment(comment)}
                aria-pressed={comment.likedByMe}
                aria-label={`${comment.likedByMe ? "Unlike" : "Like"} comment, ${comment.likesCount} likes`}
                className={`inline-flex min-h-8 items-center gap-1 rounded-lg px-2 text-[10px] font-extrabold ${comment.likedByMe ? "text-danger" : "text-ink-muted hover:text-danger"}`}
              >
                <Heart size={13} fill={comment.likedByMe ? "currentColor" : "none"} aria-hidden />
                {comment.likesCount}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!user) {
                    openAuthGate({
                      title: "Reply to this comment",
                      speech: "Join Gist me to reply and join the campus conversation.",
                      prefillSchoolId: activePost?.schoolId ?? activeConfession?.schoolId ?? null,
                    });
                    return;
                  }
                  setReplyingTo(comment);
                  inputRef.current?.focus();
                }}
                className="inline-flex min-h-8 items-center gap-1 rounded-lg px-2 text-[10px] font-extrabold text-ink-muted hover:text-brand-deep"
              >
                <CornerDownRight size={13} aria-hidden /> Reply
              </button>
            </div>
          </div>
          {canDelete && (
            <button
              type="button"
              onClick={() => void remove(comment.id)}
              aria-label="Delete comment"
              className="shrink-0 rounded-xl p-2 text-ink-muted transition-colors hover:bg-danger-wash hover:text-danger"
            >
              <Trash2 size={14} strokeWidth={2.5} aria-hidden />
            </button>
          )}
        </motion.article>
        {replies.length > 0 && <div className="mt-2 space-y-2">{replies.map((reply) => renderComment(reply, depth + 1))}</div>}
      </div>
    );
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && activeTarget && (
        <div key="comment-drawer" role="dialog" aria-modal="true" aria-labelledby="comment-drawer-title" className="fixed inset-0 z-60 flex flex-col justify-end">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={closeComments}
            className="absolute inset-0 bg-black/60 backdrop-blur-xs"
            aria-hidden
          />

          <motion.section
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 360, damping: 34, mass: 0.85 }}
            drag="y"
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.04, bottom: 0.45 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 110 || info.velocity.y > 620) closeComments();
            }}
            className="relative z-10 mx-auto flex max-h-[86dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[28px] border-t-2 border-line bg-card text-ink shadow-2xl sm:border-x-2"
          >
            <div onPointerDown={(event) => dragControls.start(event)} className="shrink-0 cursor-grab touch-none border-b-2 border-line px-4 pb-3 pt-2.5 active:cursor-grabbing sm:px-5">
              <div className="mx-auto mb-2.5 h-1.5 w-12 rounded-full bg-line" aria-hidden />
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="flex size-9 items-center justify-center rounded-xl bg-brand-wash text-brand-deep">
                    <MessageCircle size={18} strokeWidth={2.6} aria-hidden />
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 id="comment-drawer-title" className="text-base font-black tracking-tight text-ink">Comments</h2>
                      <Badge tone="brand" className="px-2 py-0.5 text-[10px]">{activePost?.commentCount ?? activeConfession?.commentCount ?? comments.length}</Badge>
                    </div>
                    <p className="text-[11px] font-semibold text-ink-muted">{activeTarget.type === "confession" ? "Anonymous confession discussion" : "Cross-school SHS replies"}</p>
                  </div>
                </div>
                <motion.button
                  type="button"
                  onClick={closeComments}
                  whileTap={{ scale: 0.9, rotate: 90 }}
                  transition={springs.snappy}
                  aria-label="Close comments"
                  className="flex size-11 items-center justify-center rounded-2xl border-2 border-line bg-card text-ink-muted transition-colors hover:border-line-deep hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft"
                >
                  <X size={17} strokeWidth={2.7} aria-hidden />
                </motion.button>
              </div>

              {activePost ? (
                <div className="mt-3 flex items-center gap-2.5 rounded-2xl border border-line bg-page px-3 py-2">
                  <Avatar name={activePost.authorName} src={activePost.authorAvatar} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <Link to={`/profile/${activePost.authorId}`} onClick={closeComments} className="truncate text-xs font-extrabold text-ink hover:text-brand-deep hover:underline">
                        @{activePost.authorName}
                      </Link>
                      <SchoolTag schoolId={activePost.schoolId} crestUrl={activePost.schoolCrest} name={activePost.schoolShort} size="xs" nameClassName="text-[10px] font-bold text-ink-muted" />
                    </div>
                    <p className="truncate text-[11px] font-semibold text-ink-muted">{activePost.content}</p>
                  </div>
                </div>
              ) : activeTarget.type === "confession" ? (
                <div className="mt-3 flex items-center gap-2.5 rounded-2xl border border-line bg-page px-3 py-2">
                  <span className="flex size-9 items-center justify-center rounded-full bg-brand-wash text-brand-deep"><EyeOff size={16} aria-hidden /></span>
                  <p className="text-xs font-extrabold text-ink">Anonymous confession</p>
                </div>
              ) : null}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
              {loading && comments.length === 0 ? (
                <div className="flex items-center justify-center gap-2 py-10 text-xs font-extrabold text-ink-muted">
                  <Loader2 size={16} className="animate-spin" aria-hidden />
                  Loading replies…
                </div>
              ) : loadError ? (
                <div role="alert" className="rounded-2xl border-2 border-danger-soft bg-danger-wash px-4 py-4 text-center">
                  <p className="text-xs font-semibold text-danger-deep">{loadError}</p>
                  <button type="button" onClick={() => activeTarget && void useGistStore.getState().loadComments(activeTarget).catch(() => undefined)} className="mt-2 rounded-lg px-3 py-2 text-xs font-extrabold text-danger-deep hover:bg-danger-soft">Try again</button>
                </div>
              ) : comments.some((comment) => !comment.parentId) ? (
                <div className="space-y-3">
                  {comments.filter((comment) => !comment.parentId).map((comment) => renderComment(comment))}
                  <div ref={listEndRef} />
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-line px-4 py-10 text-center">
                  <span className="flex size-12 items-center justify-center rounded-2xl bg-brand-wash text-brand-deep">
                    <Sparkles size={22} strokeWidth={2.5} aria-hidden />
                  </span>
                  <p className="mt-3 text-sm font-extrabold text-ink">No comments yet</p>
                  <p className="mt-1 max-w-[28ch] text-xs font-semibold text-ink-muted">Be the first student to join the conversation.</p>
                </div>
              )}
            </div>

            <form onSubmit={submit} className="shrink-0 border-t-2 border-line bg-card px-3 pt-2.5 sm:px-5" style={{ paddingBottom: "max(0.85rem, env(safe-area-inset-bottom))" }}>
              {replyingTo && (
                <div className="mb-2 flex items-center gap-2 rounded-xl bg-brand-wash px-3 py-2 text-[11px] font-bold text-brand-deep">
                  <CornerDownRight size={14} aria-hidden />
                  <span className="min-w-0 flex-1 truncate">Replying to @{replyingTo.authorName}</span>
                  <button type="button" onClick={() => setReplyingTo(null)} aria-label="Cancel reply" className="rounded-md p-1 hover:bg-brand-soft"><X size={13} aria-hidden /></button>
                </div>
              )}
              <div className="no-scrollbar mb-2 flex gap-1.5 overflow-x-auto">
                {QUICK_REPLIES.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => {
                      setDraft((prev) => (prev ? `${prev} ${chip}` : chip));
                      inputRef.current?.focus();
                    }}
                    className="shrink-0 rounded-full border border-line bg-page px-2.5 py-1 text-[11px] font-extrabold text-ink-muted transition-colors hover:border-brand hover:bg-brand-wash hover:text-brand-deep"
                  >
                    {chip}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2.5">
                <Avatar name={profile?.username ?? "you"} src={profile?.avatarUrl} size="md" ring />
                <label className="min-w-0 flex-1">
                  <span className="sr-only">Write a comment</span>
                  <input
                    ref={inputRef}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value.slice(0, 220))}
                    maxLength={220}
                    placeholder={user ? `${replyingTo ? "Reply" : "Comment"} as @${profile?.username ?? "you"}…` : "Sign in to reply…"}
                    className="h-11 w-full rounded-2xl border-2 border-line bg-page px-3.5 text-sm font-semibold text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-brand focus:bg-card focus:ring-4 focus:ring-brand-soft"
                  />
                </label>
                <motion.button
                  type="submit"
                  disabled={(Boolean(user) && !draft.trim()) || sending}
                  whileTap={!user || draft.trim() ? { y: 3, boxShadow: "0px 1px 0px var(--brand-edge)" } : undefined}
                  transition={springs.snappy}
                  aria-label="Send comment"
                  className="flex h-11 shrink-0 items-center gap-1.5 rounded-2xl bg-brand-deep px-4 text-xs font-extrabold uppercase tracking-wider text-brand-contrast shadow-[0_3px_0_var(--brand-edge)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {sending ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Send size={15} strokeWidth={2.6} aria-hidden />}
                  <span className="hidden sm:inline">Send</span>
                </motion.button>
              </div>
            </form>
          </motion.section>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
