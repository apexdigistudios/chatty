import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, CheckCircle2, EyeOff, Flag, Loader2, ShieldCheck, Sparkles, Trash2, XCircle } from "lucide-react";
import { PageHeading } from "../components/layout/PageHeading";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardBody } from "../components/ui/Card";
import { SchoolBadge } from "../components/ui/SchoolBadge";
import { useToast } from "../components/ui/Toast";
import { useAuth } from "../context/AuthContext";
import { describeError } from "../lib/supabase";
import { timeAgo } from "../lib/time";
import {
  approveConfession,
  fetchGlobalPendingConfessions,
  fetchGlobalPendingReports,
  rejectConfession,
  removeComment,
  removeSchoolPost,
  resolveReport,
} from "../services/moderationService";
import { useGistStore } from "../store/gistStore";
import type { Confession, Report } from "../types/models";

/** Global admin console: anonymous confession approval queue + site-wide reports. */
export function AdminPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, isGlobalAdmin, loading: authLoading } = useAuth();
  const schools = useGistStore((state) => state.schools);
  const loadConfessions = useGistStore((state) => state.loadConfessions);

  const [queue, setQueue] = useState<Confession[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && (!user || !isGlobalAdmin)) navigate("/", { replace: true });
  }, [authLoading, user, isGlobalAdmin, navigate]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextQueue, nextReports] = await Promise.all([fetchGlobalPendingConfessions(), fetchGlobalPendingReports()]);
      setQueue(nextQueue);
      setReports(nextReports);
    } catch (err) {
      setError(describeError(err, "Could not load the admin queue."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isGlobalAdmin) void load();
  }, [isGlobalAdmin, load]);

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

  if (!isGlobalAdmin) return null;

  return (
    <div className="mx-auto w-full max-w-[860px] min-w-0 px-3 pb-10 pt-5 sm:px-4 sm:pt-7 lg:px-5">
      <PageHeading eyebrow="Global admin" title="Safety Console" description="Approve anonymous confessions and resolve site-wide escalations. School-level reports are handled by each community's founder." action={<Badge tone="brand"><ShieldCheck size={12} strokeWidth={2.6} aria-hidden />Admin</Badge>} />

      {error && (
        <div className="mb-4 flex items-center gap-3 rounded-2xl border-2 border-danger-soft bg-danger-wash px-3.5 py-3">
          <AlertTriangle size={16} className="shrink-0 text-danger-deep" aria-hidden />
          <p className="min-w-0 flex-1 text-xs font-semibold text-danger-deep">{error}</p>
          <Button size="sm" variant="outline" onClick={() => void load()}>Retry</Button>
        </div>
      )}

      <section aria-labelledby="queue-heading">
        <div className="mb-3 flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-xl bg-brand-wash text-brand-deep"><EyeOff size={15} strokeWidth={2.6} aria-hidden /></span>
          <h2 id="queue-heading" className="text-sm font-extrabold text-ink sm:text-base">Confession approval queue</h2>
          <Badge tone={queue.length > 0 ? "warning" : "neutral"} className="ml-auto">{queue.length} pending</Badge>
          {loading && <Loader2 size={14} className="animate-spin text-ink-muted" aria-hidden />}
        </div>

        {queue.length === 0 && !loading ? (
          <div className="rounded-2xl border-2 border-dashed border-line px-5 py-10 text-center">
            <CheckCircle2 size={22} className="mx-auto text-success" aria-hidden />
            <p className="mt-2 text-sm font-extrabold text-ink">Queue is clear</p>
            <p className="mt-1 text-xs font-semibold text-ink-muted">New confessions appear here the moment students submit them.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {queue.map((confession) => {
              const school = schools.find((item) => item.id === confession.schoolId);
              return (
                <Card key={confession.id}>
                  <CardBody className="py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="warning" className="px-2 py-0.5 text-[9px]">{confession.category}</Badge>
                      {school && (
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-ink-muted">
                          <SchoolBadge schoolId={school.id} crestUrl={school.crestUrl} name={school.name} size="xs" />{school.shortName}
                        </span>
                      )}
                      <span className="ml-auto text-[10px] font-semibold text-ink-muted">{timeAgo(confession.createdAt)}</span>
                    </div>
                    <p className="mt-3 whitespace-pre-wrap text-[15px] font-semibold leading-relaxed text-ink-soft">{confession.content}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button size="sm" disabled={busy !== null} leftIcon={busy === `approve-${confession.id}` ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <CheckCircle2 size={14} strokeWidth={2.6} aria-hidden />} onClick={() => run(`approve-${confession.id}`, async () => { await approveConfession(confession.id); void loadConfessions(); }, "Confession approved and published.")}>
                        Approve
                      </Button>
                      <Button size="sm" variant="danger" disabled={busy !== null} leftIcon={<XCircle size={14} strokeWidth={2.6} aria-hidden />} onClick={() => run(`reject-${confession.id}`, () => rejectConfession(confession.id), "Confession rejected.")}>
                        Reject
                      </Button>
                      <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-ink-muted"><Sparkles size={11} aria-hidden />Author stays anonymous</span>
                    </div>
                  </CardBody>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <section className="mt-8" aria-labelledby="reports-heading">
        <div className="mb-3 flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-xl bg-danger-wash text-danger"><Flag size={15} strokeWidth={2.6} aria-hidden /></span>
          <h2 id="reports-heading" className="text-sm font-extrabold text-ink sm:text-base">All pending reports</h2>
          <Badge tone={reports.length > 0 ? "danger" : "neutral"} className="ml-auto">{reports.length}</Badge>
        </div>

        {reports.length === 0 && !loading ? (
          <p className="rounded-2xl border-2 border-dashed border-line px-5 py-8 text-center text-xs font-semibold text-ink-muted">No open reports anywhere on Let&apos;s Gist.</p>
        ) : (
          <div className="space-y-3">
            {reports.map((report) => {
              const school = schools.find((item) => item.id === report.schoolId);
              return (
                <Card key={report.id}>
                  <CardBody className="py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={report.targetType === "confession" ? "brand" : report.targetType === "comment" ? "accent" : "danger"} className="px-2 py-0.5 text-[9px]">{report.targetType}</Badge>
                      <span className="text-xs font-extrabold text-ink">{report.reason}</span>
                      {school ? <span className="text-[10px] font-bold text-ink-muted">· routed to {school.shortName}</span> : <span className="text-[10px] font-bold text-brand-deep">· global queue</span>}
                      <span className="ml-auto text-[10px] font-semibold text-ink-muted">by @{report.reporterName} · {timeAgo(report.createdAt)}</span>
                    </div>
                    <div className="mt-3 rounded-2xl border border-line bg-page px-3.5 py-3">
                      {report.target ? (
                        <>
                          <p className="text-[13px] font-semibold leading-relaxed text-ink-soft">{report.target.preview}</p>
                          <p className="mt-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-muted">{report.target.authorName ? `@${report.target.authorName}` : "Unknown"}{report.target.status ? ` · ${report.target.status}` : ""}</p>
                        </>
                      ) : (
                        <p className="text-xs font-semibold text-ink-muted">Content already deleted.</p>
                      )}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {report.targetType === "post" && report.target?.status !== "removed" && (
                        <Button size="sm" variant="danger" disabled={busy !== null} leftIcon={<Trash2 size={14} strokeWidth={2.6} aria-hidden />} onClick={() => run(`rp-${report.id}`, () => removeSchoolPost(report.targetId), "Post removed.")}>Remove post</Button>
                      )}
                      {report.targetType === "comment" && report.target && (
                        <Button size="sm" variant="danger" disabled={busy !== null} leftIcon={<Trash2 size={14} strokeWidth={2.6} aria-hidden />} onClick={() => run(`rc-${report.id}`, () => removeComment(report.targetId), "Comment deleted.")}>Delete comment</Button>
                      )}
                      {report.targetType === "confession" && report.target?.status !== "rejected" && (
                        <Button size="sm" variant="danger" disabled={busy !== null} leftIcon={<XCircle size={14} strokeWidth={2.6} aria-hidden />} onClick={() => run(`rx-${report.id}`, async () => { await rejectConfession(report.targetId); void loadConfessions(); }, "Confession taken down.")}>Take down</Button>
                      )}
                      <Button size="sm" variant="outline" disabled={busy !== null} leftIcon={<CheckCircle2 size={14} strokeWidth={2.6} aria-hidden />} onClick={() => run(`res-${report.id}`, () => resolveReport(report.id), "Report resolved.")}>Dismiss</Button>
                    </div>
                  </CardBody>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
