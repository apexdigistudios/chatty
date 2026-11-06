'use client';

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Flag, Loader2, MessageSquare, RotateCcw, ShieldCheck, Trash2 } from "lucide-react";
import { describeError } from "@/lib/supabase";
import { timeAgo } from "@/lib/time";
import {
  fetchSchoolModerationPosts,
  fetchSchoolPendingReports,
  flagPost,
  removeComment,
  removeSchoolPost,
  resolveReport,
  restorePost,
} from "@/services/moderationService";
import { useGistStore } from "@/store/gistStore";
import type { Post, Report, School } from "@/types/models";
import { cn } from "@/utils/cn";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import { formatCompactNumber } from "@/lib/utils";

interface ManageCommunityPanelProps {
  school: School;
}

/** Founder/moderator console: campus-scoped reports + every post tagged to the school. */
export function ManageCommunityPanel({ school }: ManageCommunityPanelProps) {
  const { toast } = useToast();
  const patchPost = useGistStore((state) => state.patchPost);
  const removePostLocally = useGistStore((state) => state.removePostLocally);

  const [reports, setReports] = useState<Report[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "flagged" | "removed">("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextReports, nextPosts] = await Promise.all([
        fetchSchoolPendingReports(school.id),
        fetchSchoolModerationPosts(school.id),
      ]);
      setReports(nextReports);
      setPosts(nextPosts);
    } catch (err) {
      setError(describeError(err, "Could not load moderation data."));
    } finally {
      setLoading(false);
    }
  }, [school.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (key: string, action: () => Promise<void>, success: string) => {
    setBusy(key);
    try {
      await action();
      toast(success, "success");
      await load();
    } catch (err) {
      toast(describeError(err), "danger");
    } finally {
      setBusy(null);
    }
  };

  const removePost = (postId: string) =>
    run(`remove-${postId}`, async () => {
      await removeSchoolPost(postId);
      removePostLocally(postId);
    }, "Post removed from the campus feed.");

  const flag = (postId: string) =>
    run(`flag-${postId}`, async () => {
      await flagPost(postId);
      patchPost(postId, { status: "flagged" });
    }, "Post flagged for review.");

  const restore = (postId: string) =>
    run(`restore-${postId}`, async () => {
      await restorePost(postId);
      patchPost(postId, { status: "active" });
    }, "Post restored to the feed.");

  const visiblePosts = posts.filter((post) => (filter === "all" ? true : post.status === filter));
  const flaggedCount = posts.filter((post) => post.status === "flagged").length;

  return (
    <div className="space-y-6">
      <Card className="border-brand">
        <CardBody className="flex flex-wrap items-center gap-3 py-4">
          <span className="flex size-11 items-center justify-center rounded-2xl bg-brand-deep text-brand-contrast shadow-[0_3px_0_var(--brand-edge)]">
            <ShieldCheck size={21} strokeWidth={2.5} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-black tracking-tight text-ink">Manage {school.shortName}</h2>
            <p className="text-xs font-semibold text-ink-muted">Decentralised moderation — only posts and comments tagged to this school.</p>
          </div>
          <div className="flex gap-2">
            <Stat label="Pending reports" value={reports.length} tone={reports.length > 0 ? "danger" : "neutral"} />
            <Stat label="Flagged" value={flaggedCount} tone={flaggedCount > 0 ? "warning" : "neutral"} />
          </div>
        </CardBody>
      </Card>

      {error && (
        <div className="flex items-center gap-3 rounded-2xl border-2 border-danger-soft bg-danger-wash px-3.5 py-3">
          <AlertTriangle size={16} className="shrink-0 text-danger-deep" aria-hidden />
          <p className="min-w-0 flex-1 text-xs font-semibold text-danger-deep">{error}</p>
          <Button size="sm" variant="outline" onClick={() => void load()}>Retry</Button>
        </div>
      )}

      {/* Reports queue */}
      <section aria-labelledby="reports-heading">
        <div className="mb-3 flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-xl bg-danger-wash text-danger"><Flag size={15} strokeWidth={2.6} aria-hidden /></span>
          <h3 id="reports-heading" className="text-sm font-extrabold text-ink">Reported on your campus</h3>
          {loading && <Loader2 size={14} className="ml-auto animate-spin text-ink-muted" aria-hidden />}
        </div>

        {reports.length === 0 && !loading ? (
          <div className="rounded-2xl border-2 border-dashed border-line px-5 py-8 text-center">
            <CheckCircle2 size={22} className="mx-auto text-success" aria-hidden />
            <p className="mt-2 text-sm font-extrabold text-ink">No pending reports</p>
            <p className="mt-1 text-xs font-semibold text-ink-muted">Your community feed is clean. Reports from students land here instantly.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {reports.map((report) => (
              <Card key={report.id}>
                <CardBody className="py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={report.targetType === "comment" ? "accent" : "danger"} className="px-2 py-0.5 text-[9px]">
                      {report.targetType === "comment" ? <MessageSquare size={10} strokeWidth={2.6} aria-hidden /> : <Flag size={10} strokeWidth={2.6} aria-hidden />}
                      {report.targetType}
                    </Badge>
                    <span className="text-xs font-extrabold text-ink">{report.reason}</span>
                    <span className="ml-auto text-[10px] font-semibold text-ink-muted">by @{report.reporterName} · {timeAgo(report.createdAt)}</span>
                  </div>
                  <div className="mt-3 rounded-2xl border border-line bg-page px-3.5 py-3">
                    {report.target ? (
                      <>
                        <p className="text-[13px] font-semibold leading-relaxed text-ink-soft">{report.target.preview}</p>
                        <p className="mt-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-muted">
                          {report.target.authorName ? `@${report.target.authorName}` : "Unknown author"}
                          {report.target.status ? ` · ${report.target.status}` : ""}
                        </p>
                      </>
                    ) : (
                      <p className="text-xs font-semibold text-ink-muted">This content has already been deleted.</p>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {report.targetType === "post" && report.target && report.target.status !== "removed" && (
                      <Button size="sm" variant="danger" disabled={busy !== null} leftIcon={<Trash2 size={14} strokeWidth={2.6} aria-hidden />} onClick={() => removePost(report.targetId)}>
                        Remove post
                      </Button>
                    )}
                    {report.targetType === "comment" && report.target && (
                      <Button size="sm" variant="danger" disabled={busy !== null} leftIcon={<Trash2 size={14} strokeWidth={2.6} aria-hidden />} onClick={() => run(`comment-${report.id}`, () => removeComment(report.targetId), "Comment deleted.")}>
                        Delete comment
                      </Button>
                    )}
                    <Button size="sm" variant="outline" disabled={busy !== null} leftIcon={<CheckCircle2 size={14} strokeWidth={2.6} aria-hidden />} onClick={() => run(`resolve-${report.id}`, () => resolveReport(report.id), "Report dismissed.")}>
                      Dismiss
                    </Button>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Campus posts */}
      <section aria-labelledby="posts-heading">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h3 id="posts-heading" className="text-sm font-extrabold text-ink">Campus posts ({posts.length})</h3>
          <div className="ml-auto flex gap-1.5">
            {(["all", "flagged", "removed"] as const).map((item) => (
              <button key={item} type="button" onClick={() => setFilter(item)} aria-pressed={filter === item} className={cn("rounded-full border-2 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider transition-colors", filter === item ? "border-brand-deep bg-brand-wash text-brand-deep" : "border-line bg-card text-ink-muted hover:text-ink")}>
                {item}
              </button>
            ))}
          </div>
        </div>

        {visiblePosts.length === 0 && !loading ? (
          <p className="rounded-2xl border-2 border-dashed border-line px-5 py-8 text-center text-xs font-semibold text-ink-muted">No {filter === "all" ? "" : filter} posts tagged to {school.shortName} yet.</p>
        ) : (
          <div className="divide-y-2 divide-line overflow-hidden rounded-2xl border-2 border-line bg-card">
            {visiblePosts.map((post) => (
              <div key={post.id} className="flex items-start gap-3 px-3.5 py-3.5">
                <Avatar name={post.authorName} src={post.authorAvatar} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-xs font-extrabold text-ink">@{post.authorName}</span>
                    <Badge tone={post.status === "active" ? "success" : post.status === "flagged" ? "warning" : "danger"} className="px-2 py-0.5 text-[9px]">{post.status}</Badge>
                    <span className="text-[10px] font-semibold text-ink-muted">{timeAgo(post.createdAt)} · {formatCompactNumber(post.likeCount)} likes · {formatCompactNumber(post.commentCount)} replies</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[13px] font-semibold leading-relaxed text-ink-soft">{post.content}</p>
                </div>
                <div className="flex shrink-0 flex-col gap-1.5">
                  {post.status !== "removed" ? (
                    <>
                      {post.status === "active" && (
                        <button type="button" disabled={busy !== null} onClick={() => flag(post.id)} className="flex items-center gap-1 rounded-lg border-2 border-line px-2 py-1 text-[10px] font-extrabold text-warning-deep hover:border-warning-soft hover:bg-warning-wash disabled:opacity-50">
                          <Flag size={12} strokeWidth={2.6} aria-hidden />Flag
                        </button>
                      )}
                      <button type="button" disabled={busy !== null} onClick={() => removePost(post.id)} className="flex items-center gap-1 rounded-lg border-2 border-line px-2 py-1 text-[10px] font-extrabold text-danger hover:border-danger-soft hover:bg-danger-wash disabled:opacity-50">
                        {busy === `remove-${post.id}` ? <Loader2 size={12} className="animate-spin" aria-hidden /> : <Trash2 size={12} strokeWidth={2.6} aria-hidden />}Remove
                      </button>
                    </>
                  ) : null}
                  {post.status !== "active" && (
                    <button type="button" disabled={busy !== null} onClick={() => restore(post.id)} className="flex items-center gap-1 rounded-lg border-2 border-line px-2 py-1 text-[10px] font-extrabold text-success-deep hover:border-success-soft hover:bg-success-wash disabled:opacity-50">
                      <RotateCcw size={12} strokeWidth={2.6} aria-hidden />Restore
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "danger" | "warning" | "neutral" }) {
  return (
    <div className={cn("rounded-2xl border-2 px-3 py-2 text-center", tone === "danger" ? "border-danger-soft bg-danger-wash" : tone === "warning" ? "border-warning-soft bg-warning-wash" : "border-line bg-page")}>
      <p className={cn("text-lg font-black tabular-nums", tone === "danger" ? "text-danger-deep" : tone === "warning" ? "text-warning-deep" : "text-ink")}>{value}</p>
      <p className="text-[9px] font-extrabold uppercase tracking-wider text-ink-muted">{label}</p>
    </div>
  );
}
