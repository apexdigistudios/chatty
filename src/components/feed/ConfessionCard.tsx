import { useState } from "react";
import { EyeOff, Lock, MessageCircle, MoreHorizontal, Share2, ShieldCheck } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { describeError } from "../../lib/supabase";
import { timeAgo } from "../../lib/time";
import { reactionsAvailable } from "../../services/confessionsService";
import { useAuthGateStore } from "../../store/authGateStore";
import { useGistStore } from "../../store/gistStore";
import type { Confession, ConfessionCategory, ReactionKind } from "../../types/models";
import { cn } from "../../utils/cn";
import { Badge, type BadgeTone } from "../ui/Badge";
import { SchoolTag } from "../ui/SchoolBadge";
import { useToast } from "../ui/Toast";
import { ReportMenu } from "./ReportMenu";
import { AnimatedReaction } from "../common/AnimatedReaction";
import { Avatar } from "../ui/Avatar";
import { SafeImage } from "../common/SafeImage";

interface ReactionMeta {
  kind: ReactionKind;
  label: string;
  emoji: string;
  activeClass: string;
}

export const REACTION_META: ReactionMeta[] = [
  { kind: "like", label: "Like", emoji: "👍", activeClass: "bg-brand-wash text-brand-deep border-brand-soft" },
  { kind: "heart", label: "Love", emoji: "❤️", activeClass: "bg-danger-wash text-danger border-danger-soft" },
  { kind: "fire", label: "Fire", emoji: "🔥", activeClass: "bg-warning-wash text-warning-deep border-warning-soft" },
  { kind: "laugh", label: "Funny", emoji: "😂", activeClass: "bg-warning-wash text-warning-deep border-warning-soft" },
  { kind: "clap", label: "Applause", emoji: "👏", activeClass: "bg-accent-wash text-accent-deep border-accent-soft" },
  { kind: "surprised", label: "Surprised", emoji: "😮", activeClass: "bg-accent-wash text-accent-deep border-accent-soft" },
];

const categoryTone: Record<ConfessionCategory, BadgeTone> = {
  "Crush Confession": "danger",
  "School Secret": "warning",
  "Relationship Gist": "accent",
  "Friendship Gist": "success",
};

interface ConfessionCardProps {
  confession: Confession;
  /** Renders the "under review" treatment for the author's own pending items. */
  pending?: boolean;
}

/** Anonymous confession card — reads from the public view, never exposes the author. */
export function ConfessionCard({ confession, pending = false }: ConfessionCardProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const openAuthGate = useAuthGateStore((state) => state.openAuthGate);
  const toggleReaction = useGistStore((state) => state.toggleReaction);
  const openComments = useGistStore((state) => state.openComments);
  const school = useGistStore((state) =>
    confession.schoolId ? state.schools.find((item) => item.id === confession.schoolId) : undefined
  );
  const [menuOpen, setMenuOpen] = useState(false);

  const requireAuth = () => {
    if (user) return true;
    setMenuOpen(false);
    openAuthGate({
      title: "Go Undercover to React!",
      speech:
        "Pick a secret @nickname so nobody knows your real legal name when reacting to campus confessions!",
      outfit: "detective",
      prefillSchoolId: confession.schoolId,
    });
    return false;
  };

  const react = async (kind: ReactionKind) => {
    if (!requireAuth() || pending) return;
    try {
      await toggleReaction(confession.id, kind);
    } catch (error) {
      toast(describeError(error), "danger");
    }
  };

  const share = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/confessions?c=${confession.id}`);
      toast("Confession link copied. Identity stays hidden.", "info");
    } catch {
      toast("Sharing is ready when you are.", "brand");
    }
  };

  const status = pending ? confession.moderationStatus : "approved";

  return (
    <article
      role="article"
      aria-label={`${confession.seedUsername ? `Confession by @${confession.seedUsername}` : "Anonymous confession"}${school ? `, ${school.shortName}` : ""}`}
      className="relative overflow-visible border-b-4 border-line/60 px-4 py-4 dark:border-neutral-900/60"
    >
      <div>
        <div className="flex items-start gap-3">
          {confession.seedUsername ? (
            <Avatar name={confession.seedUsername} src={confession.seedAvatarUrl ?? null} size="md" />
          ) : (
            <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-brand-wash text-brand-deep">
              <EyeOff size={20} strokeWidth={2.5} aria-hidden />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <p className="text-sm font-extrabold text-ink">
                {confession.seedUsername ? confession.seedFullName || `@${confession.seedUsername}` : "Anonymous"}
              </p>
              {confession.seedUsername ? (
                confession.seedFullName && <span className="text-[11px] font-semibold text-ink-muted">@{confession.seedUsername}</span>
              ) : (
                <Badge tone="neutral" className="px-2 py-0.5 text-[9px]">
                  <Lock size={10} strokeWidth={2.6} aria-hidden />
                  Identity hidden
                </Badge>
              )}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-[11px] font-semibold text-ink-muted">{timeAgo(confession.publishedAt ?? confession.createdAt)}</span>
              {school && (
                <>
                  <span className="size-1 rounded-full bg-ink-faint" aria-hidden />
                  <SchoolTag schoolId={school.id} crestUrl={school.crestUrl} name={school.shortName} size="xs" nameClassName="text-[11px] font-semibold text-ink-muted" />
                </>
              )}
              <Badge tone={categoryTone[confession.category]} className="px-2 py-0.5 text-[9px]">
                {confession.category}
              </Badge>
            </div>
          </div>
          {!pending && (
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-label="More confession actions"
              aria-expanded={menuOpen}
              className="-mr-1 -mt-1 flex size-11 shrink-0 items-center justify-center rounded-xl text-ink-muted transition-colors hover:bg-page hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft"
            >
              <MoreHorizontal size={18} strokeWidth={2.5} aria-hidden />
            </button>
          )}
        </div>

        <p className="mt-3.5 whitespace-pre-wrap wrap-break-word text-[15px] font-semibold leading-[1.65] text-ink-soft sm:text-base">
          {confession.content}
        </p>

        {confession.mediaUrls && confession.mediaUrls.length > 0 && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            {confession.mediaUrls.map((url, index) => (
              <div key={`${confession.id}-media-${index}`} className="overflow-hidden rounded-2xl border-2 border-line bg-page">
                {confession.mediaTypes?.[index] === "video" ? (
                  <video src={url} controls playsInline preload="metadata" className="aspect-square size-full object-cover" />
                ) : (
                  <SafeImage src={url} alt={`Confession attachment ${index + 1}`} className="aspect-square size-full object-cover" loading="lazy" decoding="async" />
                )}
              </div>
            ))}
          </div>
        )}

        {pending && (
          <div
            className={cn(
              "mt-3 flex items-start gap-2 rounded-2xl border-2 px-3 py-2.5",
              status === "rejected" ? "border-danger-soft bg-danger-wash" : status === "approved" ? "border-success-soft bg-success-wash" : "border-warning-soft bg-warning-wash"
            )}
          >
            <ShieldCheck size={16} strokeWidth={2.5} className={cn("mt-0.5 shrink-0", status === "rejected" ? "text-danger-deep" : status === "approved" ? "text-success-deep" : "text-warning-deep")} aria-hidden />
            <p className={cn("text-[11px] font-semibold leading-relaxed", status === "rejected" ? "text-danger-deep" : status === "approved" ? "text-success-deep" : "text-warning-deep")}>
              {status === "approved"
                ? "Approved and live on the confessions portal."
                : status === "rejected"
                  ? "A moderator declined this confession under the community guidelines."
                  : "Under moderator review. Only you can see it for now."}
            </p>
          </div>
        )}

        {reactionsAvailable() && (
          <div className="mt-4 flex flex-wrap gap-2">
            {REACTION_META.map(({ kind, label, emoji, activeClass }) => {
              const active = confession.myReaction === kind;
              const count = confession.reactions[kind];
              return (
                <AnimatedReaction
                  key={kind}
                  type="button"
                  onClick={() => react(kind)}
                  disabled={pending}
                  aria-pressed={active}
                  aria-label={`${label} reaction, ${count}`}
                  icon={<span className="text-base leading-none" aria-hidden>{emoji}</span>}
                  count={count}
                  wiggle={kind === "fire"}
                  className={cn(
                    "flex min-h-11 items-center gap-1.5 rounded-full border-2 px-2.5 text-[11px] font-extrabold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft disabled:opacity-50",
                    active ? activeClass : "border-line bg-card text-ink-muted hover:border-line-deep hover:text-ink"
                  )}
                />
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-3 flex items-center gap-1 border-t border-line/50 pt-1.5">
        {!pending && (
          <button
            type="button"
            onClick={() => openComments({ type: "confession", id: confession.id })}
            aria-label={`Open comments, ${confession.commentCount} comments`}
            className="flex min-h-11 items-center gap-1.5 rounded-xl px-2.5 text-xs font-extrabold text-ink-muted transition-colors hover:bg-brand-wash hover:text-brand-deep focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft sm:px-3 sm:text-sm"
          >
            <MessageCircle size={16} strokeWidth={2.4} aria-hidden />
            <span className="tabular-nums">{confession.commentCount}</span>
          </button>
        )}
        <button
          type="button"
          onClick={share}
          className="flex min-h-11 items-center gap-1.5 rounded-xl px-2.5 text-xs font-extrabold text-ink-muted transition-colors hover:bg-page hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft sm:px-3 sm:text-sm"
        >
          <Share2 size={16} strokeWidth={2.4} aria-hidden />
          <span>Share</span>
        </button>
        <span className={cn("ml-auto flex items-center gap-1.5 pr-1 text-[10px] font-bold uppercase tracking-wider", pending ? "text-warning-deep" : "text-ink-muted")}>
          <ShieldCheck size={12} strokeWidth={2.5} aria-hidden />
          {pending ? status : "Reviewed by admins"}
        </span>
      </div>

      <ReportMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        targetType="confession"
        targetId={confession.id}
        schoolId={null}
        requireAuth={requireAuth}
      />
    </article>
  );
}
