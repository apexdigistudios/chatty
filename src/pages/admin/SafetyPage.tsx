import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, CheckCircle2, EyeOff, Flag, Loader2, RotateCcw, ShieldAlert, ShieldCheck, Trash2, UserRoundX } from "lucide-react";
import { PageHeading } from "../../components/layout/PageHeading";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card, CardBody } from "../../components/ui/Card";
import { useToast } from "../../components/ui/Toast";
import { useAuth } from "../../context/AuthContext";
import { describeError } from "../../lib/supabase";
import { timeAgo } from "../../lib/time";
import {
  fetchSafetyQueue,
  runSafetyAdminAction,
  type FlaggedPromotion,
  type PausedGist,
  type SafetyReport,
} from "../../services/safetyService";
import { GIST_REPORT_REASONS } from "../../services/reportService";

type SafetyTab = "promotions" | "paused" | "serious";
const tabs: Array<{ id: SafetyTab; label: string }> = [
  { id: "promotions", label: "Flagged Promotions" },
  { id: "paused", label: "Paused Gists" },
  { id: "serious", label: "Serious Escalations" },
];

function reasonLabel(reason: string): string {
  return GIST_REPORT_REASONS.find((item) => item.value === reason)?.label ?? reason;
}

function actionButton(
  action: "dismiss_reports" | "remove_post" | "suspend_creator",
  target: { postId?: string; creatorId?: string },
  busy: string | null,
  run: (key: string, action: () => Promise<void>, success: string) => void,
  key: string
) {
  const isBusy = busy === key;
  if (action === "dismiss_reports") {
    return (
      <Button
        key={key}
        size="sm"
        variant="outline"
        disabled={busy !== null}
        loading={isBusy}
        leftIcon={<RotateCcw size={14} aria-hidden />}
        onClick={() => run(key, () => runSafetyAdminAction(action, target), "Reports dismissed and eligible promotion restored.")}
      >
        Dismiss &amp; restore
      </Button>
    );
  }
  if (action === "remove_post") {
    return (
      <Button
        key={key}
        size="sm"
        variant="danger"
        disabled={busy !== null}
        loading={isBusy}
        leftIcon={<Trash2 size={14} aria-hidden />}
        onClick={() => {
          if (window.confirm("Mark this post removed? It will be hidden from feeds and can be restored by an admin.")) {
            run(key, () => runSafetyAdminAction(action, target), "Post removed and linked promotions cancelled.");
          }
        }}
      >
        Remove post
      </Button>
    );
  }
  return (
    <Button
      key={key}
      size="sm"
      variant="outline"
      disabled={busy !== null}
      loading={isBusy}
      leftIcon={<UserRoundX size={14} aria-hidden />}
      onClick={() => {
        if (window.confirm("Suspend this creator until an admin manually lifts the suspension?")) {
          run(key, () => runSafetyAdminAction(action, target), "Creator suspended until manually reinstated.");
        }
      }}
    >
      Suspend creator
    </Button>
  );
}

export function SafetyPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, isGlobalAdmin, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<SafetyTab>("promotions");
  const [flaggedPromotions, setFlaggedPromotions] = useState<FlaggedPromotion[]>([]);
  const [pausedGists, setPausedGists] = useState<PausedGist[]>([]);
  const [seriousReports, setSeriousReports] = useState<Array<{ report: SafetyReport; post: PausedGist["post"] | null }>>([]);
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
      const queue = await fetchSafetyQueue();
      setFlaggedPromotions(queue.flaggedPromotions);
      setPausedGists(queue.pausedGists);
      setSeriousReports(queue.seriousReports);
    } catch (loadError) {
      setError(describeError(loadError, "Could not load the safety queue."));
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
    } catch (actionError) {
      toast(describeError(actionError), "danger");
    } finally {
      setBusy(null);
    }
  };

  if (authLoading || !isGlobalAdmin) return null;

  const counts: Record<SafetyTab, number> = {
    promotions: flaggedPromotions.length,
    paused: pausedGists.length,
    serious: seriousReports.length,
  };

  return (
    <main className="mx-auto w-full max-w-[900px] min-w-0 px-3 pb-10 pt-5 sm:px-4 sm:pt-7 lg:px-5">
      <PageHeading
        eyebrow="Global admin"
        title="Safety Management"
        description="Review automated screening, community report thresholds, and serious safety escalations."
        action={<Badge tone="brand"><ShieldCheck size={12} aria-hidden />Admin</Badge>}
      />

      {error && (
        <div className="mb-4 flex items-center gap-3 rounded-2xl border-2 border-danger-soft bg-danger-wash px-3.5 py-3">
          <AlertTriangle size={16} className="shrink-0 text-danger-deep" aria-hidden />
          <p className="min-w-0 flex-1 text-xs font-semibold text-danger-deep">{error}</p>
          <Button size="sm" variant="outline" onClick={() => void load()}>Retry</Button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" role="tablist" aria-label="Safety queues">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            id={`safety-tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`safety-panel-${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
            className={`flex min-h-12 items-center justify-between gap-2 rounded-2xl border-2 px-3 py-2 text-left text-xs font-extrabold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft ${
              activeTab === tab.id
                ? "border-brand bg-brand-wash text-brand-deep"
                : "border-line bg-card text-ink-muted hover:border-brand/50 hover:text-ink"
            }`}
          >
            <span>{tab.label}</span>
            <Badge tone={counts[tab.id] > 0 ? (tab.id === "serious" ? "danger" : "warning") : "neutral"} className="px-2 py-0.5 text-[9px]">
              {counts[tab.id]}
            </Badge>
          </button>
        ))}
      </div>

      <section
        id={`safety-panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`safety-tab-${activeTab}`}
        className="mt-5 space-y-3"
      >
        {loading ? (
          <div className="flex items-center justify-center gap-2 rounded-2xl border-2 border-line bg-card px-4 py-10 text-xs font-bold text-ink-muted">
            <Loader2 size={16} className="animate-spin" aria-hidden />Loading safety queue…
          </div>
        ) : activeTab === "promotions" ? (
          flaggedPromotions.length === 0 ? (
            <EmptyQueue label="No flagged promotions" description="Promotions held by automated screening will appear here." />
          ) : flaggedPromotions.map((item) => (
            <FlaggedPromotionCard
              key={item.id}
              item={item}
              busy={busy}
              run={run}
            />
          ))
        ) : activeTab === "paused" ? (
          pausedGists.length === 0 ? (
            <EmptyQueue label="No paused gists" description="Posts hidden by report thresholds or serious reports will appear here." />
          ) : pausedGists.map((item) => (
            <PausedGistCard key={item.post.id} item={item} busy={busy} run={run} />
          ))
        ) : seriousReports.length === 0 ? (
          <EmptyQueue label="No serious escalations" description="Violence, sexual content, and privacy reports are prioritized here." />
        ) : seriousReports.map(({ report, post }) => (
          <SeriousReportCard
            key={report.id}
            report={report}
            post={post}
            busy={busy}
            run={run}
          />
        ))}
      </section>
    </main>
  );
}

function EmptyQueue({ label, description }: { label: string; description: string }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-line px-5 py-10 text-center">
      <CheckCircle2 size={22} className="mx-auto text-success" aria-hidden />
      <p className="mt-2 text-sm font-extrabold text-ink">{label}</p>
      <p className="mt-1 text-xs font-semibold text-ink-muted">{description}</p>
    </div>
  );
}

function PostPreview({ post }: { post: PausedGist["post"] | null }) {
  if (!post) return <p className="text-xs font-semibold text-ink-muted">The post is no longer available.</p>;
  return (
    <>
      <p className="whitespace-pre-wrap break-words text-sm font-semibold leading-relaxed text-ink-soft">{post.content}</p>
      <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-ink-muted">
        @{post.author?.username ?? "student"} · {timeAgo(post.created_at)}
      </p>
    </>
  );
}

function FlaggedPromotionCard({
  item,
  busy,
  run,
}: {
  item: FlaggedPromotion;
  busy: string | null;
  run: (key: string, action: () => Promise<void>, success: string) => void;
}) {
  const categories = Object.entries(item.moderation?.flagged_categories ?? {}).filter(([, flagged]) => flagged);
  const scores = Object.entries(item.moderation?.category_scores ?? {}).sort((left, right) => right[1] - left[1]).slice(0, 5);
  const key = `flagged-remove-${item.id}`;
  return (
    <Card>
      <CardBody className="py-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="warning"><ShieldAlert size={11} aria-hidden />Automated flag</Badge>
          <span className="text-[10px] font-bold text-ink-muted">{item.package_type.replace(/_/g, " ")} · {timeAgo(item.created_at)}</span>
        </div>
        <div className="mt-3 rounded-xl border border-line bg-page p-3"><PostPreview post={item.post} /></div>
        <div className="mt-3">
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-ink-muted">Flagged categories</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {categories.length ? categories.map(([category]) => <Badge key={category} tone="danger" className="text-[9px]">{category.replace(/_/g, " ")}</Badge>) : <span className="text-xs text-ink-muted">No category flags returned.</span>}
          </div>
        </div>
        {scores.length > 0 && (
          <div className="mt-3">
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-ink-muted">Confidence scores</p>
            <div className="mt-1 flex flex-wrap gap-2">
              {scores.map(([category, score]) => (
                <span key={category} className="rounded-lg border border-line bg-card px-2 py-1 text-[10px] font-bold text-ink-soft">
                  {category.replace(/_/g, " ")} · {Math.round(score * 100)}%
                </span>
              ))}
            </div>
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          {actionButton("remove_post", { postId: item.post_id }, busy, run, key)}
          {actionButton("suspend_creator", { creatorId: item.user_id }, busy, run, `flagged-suspend-${item.id}`)}
        </div>
      </CardBody>
    </Card>
  );
}

function PausedGistCard({
  item,
  busy,
  run,
}: {
  item: PausedGist;
  busy: string | null;
  run: (key: string, action: () => Promise<void>, success: string) => void;
}) {
  const key = `paused-${item.post.id}`;
  return (
    <Card>
      <CardBody className="py-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="danger"><EyeOff size={11} aria-hidden />Temporarily paused</Badge>
          <Badge tone="neutral">{item.reports.length} report{item.reports.length === 1 ? "" : "s"}</Badge>
        </div>
        <div className="mt-3 rounded-xl border border-line bg-page p-3"><PostPreview post={item.post} /></div>
        <ReportReasons reports={item.reports} />
        <div className="mt-4 flex flex-wrap gap-2">
          {actionButton("dismiss_reports", { postId: item.post.id }, busy, run, `dismiss-${key}`)}
          {actionButton("remove_post", { postId: item.post.id }, busy, run, `remove-${key}`)}
          {actionButton("suspend_creator", { creatorId: item.post.user_id }, busy, run, `suspend-${key}`)}
        </div>
      </CardBody>
    </Card>
  );
}

function ReportReasons({ reports }: { reports: SafetyReport[] }) {
  if (reports.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {reports.slice(0, 8).map((report) => (
        <Badge key={report.id} tone={report.is_serious_safety ? "danger" : "neutral"} className="text-[9px]">
          {reasonLabel(report.reason)}
        </Badge>
      ))}
    </div>
  );
}

function SeriousReportCard({
  report,
  post,
  busy,
  run,
}: {
  report: SafetyReport;
  post: PausedGist["post"] | null;
  busy: string | null;
  run: (key: string, action: () => Promise<void>, success: string) => void;
}) {
  const key = `serious-${report.id}`;
  return (
    <Card>
      <CardBody className="py-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="danger"><Flag size={11} aria-hidden />Immediate review</Badge>
          <span className="text-xs font-extrabold text-ink">{reasonLabel(report.reason)}</span>
          <span className="ml-auto text-[10px] font-semibold text-ink-muted">{timeAgo(report.created_at)}</span>
        </div>
        {report.details && <p className="mt-2 rounded-xl border border-line bg-page px-3 py-2 text-xs font-semibold text-ink-soft">{report.details}</p>}
        <div className="mt-3 rounded-xl border border-line bg-page p-3"><PostPreview post={post} /></div>
        <div className="mt-4 flex flex-wrap gap-2">
          {actionButton("dismiss_reports", { postId: report.gist_id }, busy, run, `dismiss-${key}`)}
          {actionButton("remove_post", { postId: report.gist_id }, busy, run, `remove-${key}`)}
          {post && actionButton("suspend_creator", { creatorId: post.user_id }, busy, run, `suspend-${key}`)}
        </div>
      </CardBody>
    </Card>
  );
}
