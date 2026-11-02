import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useDragControls } from "framer-motion";
import { Link } from "react-router-dom";
import { Loader2, MessageCircle, Send, Sparkles, Trash2, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useCanModerate } from "../../hooks/useModeration";
import { describeError } from "../../lib/supabase";
import { timeAgo } from "../../lib/time";
import { useAuthGateStore } from "../../store/authGateStore";
import { useGistStore } from "../../store/gistStore";
import { springs } from "../../theme/tokens";
import { Avatar } from "../ui/Avatar";
import { Badge } from "../ui/Badge";
import { SchoolTag } from "../ui/SchoolBadge";
import { useToast } from "../ui/Toast";

const QUICK_REPLIES = ["Chale, facts!", "No size at all!", "Herh, campus gist!", "Big respect!"] as const;

/** Slide-up comment sheet backed by the comments table (one thread per post). */
export function CommentDrawer() {
  const { toast } = useToast();
  const { user, profile } = useAuth();
  const canModerate = useCanModerate();
  const openAuthGate = useAuthGateStore((state) => state.openAuthGate);

  const activePostId = useGistStore((state) => state.activeCommentPostId);
  const posts = useGistStore((state) => state.posts);
  const commentsByPostId = useGistStore((state) => state.commentsByPostId);
  const commentsLoading = useGistStore((state) => state.commentsLoading);
  const closeComments = useGistStore((state) => state.closeComments);
  const addComment = useGistStore((state) => state.addComment);
  const deleteComment = useGistStore((state) => state.deleteComment);

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const listEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragControls = useDragControls();

  const activePost = useMemo(
    () => (activePostId ? posts.find((post) => post.id === activePostId) ?? null : null),
    [activePostId, posts]
  );
  const comments = activePostId ? commentsByPostId[activePostId] ?? [] : [];
  const loading = activePostId ? Boolean(commentsLoading[activePostId]) : false;
  const isOpen = Boolean(activePostId);

  useEffect(() => {
    if (!isOpen) return;
    setDraft("");
    const timer = window.setTimeout(() => inputRef.current?.focus(), 220);
    return () => window.clearTimeout(timer);
  }, [isOpen, activePostId]);

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
    if (!activePostId) return;
    if (!user) {
      closeComments();
      openAuthGate({
        title: "Reply to this Gist!",
        speech:
          "Grab your secret @nickname in 30 seconds to drop replies across every SHS community!",
        prefillSchoolId: activePost?.schoolId ?? null,
      });
      return;
    }
    if (!text) return;
    setSending(true);
    try {
      await addComment(activePostId, text);
      setDraft("");
      window.setTimeout(() => listEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 80);
    } catch (error) {
      toast(describeError(error), "danger");
    } finally {
      setSending(false);
    }
  };

  const remove = async (commentId: string) => {
    if (!activePostId) return;
    try {
      await deleteComment(activePostId, commentId);
      toast("Comment removed.", "success");
    } catch (error) {
      toast(describeError(error), "danger");
    }
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && activePostId && (
        <div key="comment-drawer" role="dialog" aria-modal="true" aria-labelledby="comment-drawer-title" className="fixed inset-0 z-40 flex flex-col justify-end">
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
                      <Badge tone="brand" className="px-2 py-0.5 text-[10px]">{activePost?.commentCount ?? comments.length}</Badge>
                    </div>
                    <p className="text-[11px] font-semibold text-ink-muted">Cross-school SHS replies</p>
                  </div>
                </div>
                <motion.button
                  type="button"
                  onClick={closeComments}
                  whileTap={{ scale: 0.9, rotate: 90 }}
                  transition={springs.snappy}
                  aria-label="Close comments"
                  className="flex size-9 items-center justify-center rounded-2xl border-2 border-line bg-card text-ink-muted transition-colors hover:border-line-deep hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft"
                >
                  <X size={17} strokeWidth={2.7} aria-hidden />
                </motion.button>
              </div>

              {activePost && (
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
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
              {loading && comments.length === 0 ? (
                <div className="flex items-center justify-center gap-2 py-10 text-xs font-extrabold text-ink-muted">
                  <Loader2 size={16} className="animate-spin" aria-hidden />
                  Loading replies…
                </div>
              ) : comments.length > 0 ? (
                <div className="space-y-3">
                  {comments.map((comment) => {
                    const canDelete = user?.id === comment.authorId || canModerate(activePost?.schoolId);
                    return (
                      <motion.article
                        key={comment.id}
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
                            {comment.authorSchoolShort && (
                              <SchoolTag schoolId={comment.authorSchoolId} name={comment.authorSchoolShort} size="xs" nameClassName="text-[10px] font-bold text-ink-muted" />
                            )}
                            <span className="text-[10px] font-semibold text-ink-muted">· {timeAgo(comment.createdAt)}</span>
                          </div>
                          <p className="mt-1.5 break-words text-[13px] font-semibold leading-relaxed text-ink-soft sm:text-sm">{comment.content}</p>
                        </div>
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => remove(comment.id)}
                            aria-label="Delete comment"
                            className="shrink-0 rounded-xl p-2 text-ink-muted transition-colors hover:bg-danger-wash hover:text-danger"
                          >
                            <Trash2 size={14} strokeWidth={2.5} aria-hidden />
                          </button>
                        )}
                      </motion.article>
                    );
                  })}
                  <div ref={listEndRef} />
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-line px-4 py-10 text-center">
                  <span className="flex size-12 items-center justify-center rounded-2xl bg-brand-wash text-brand-deep">
                    <Sparkles size={22} strokeWidth={2.5} aria-hidden />
                  </span>
                  <p className="mt-3 text-sm font-extrabold text-ink">No comments yet</p>
                  <p className="mt-1 max-w-[28ch] text-xs font-semibold text-ink-muted">Be the first student to drop a reply on this gist.</p>
                </div>
              )}
            </div>

            <form onSubmit={submit} className="shrink-0 border-t-2 border-line bg-card px-3 pt-2.5 sm:px-5" style={{ paddingBottom: "max(0.85rem, env(safe-area-inset-bottom))" }}>
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
                    placeholder={user ? `Reply as @${profile?.username ?? "you"}…` : "Sign in to reply…"}
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
