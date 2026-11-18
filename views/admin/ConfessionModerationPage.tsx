"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  BadgeCheck,
  Check,
  Clock3,
  FileSearch,
  Flag,
  History,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useNavigate } from "@/lib/router";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/Toast";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { describeError, supabase } from "@/lib/supabase";
import { celebrateSuccess } from "@/lib/celebrations";
import { timeAgo } from "@/lib/time";

type ModerationStatus = "PENDING_REVIEW" | "APPROVED" | "REJECTED" | "ESCALATED" | "HIDDEN_UNDER_REVIEW";
type DashboardTab = "pending" | "flagged" | "urgent" | "history";
type DecisionStatus = "APPROVED" | "REJECTED" | "ESCALATED";

interface AdminConfession {
  id: string;
  school_id: string | null;
  category: string;
  content: string;
  created_at: string;
  published_at: string | null;
  moderation_status: ModerationStatus;
  ai_categories: unknown;
  ai_scores: unknown;
  ai_flags: string[] | null;
  is_urgent_safeguarding: boolean;
  report_count: number;
}

interface ConfessionReport {
  confession_id: string;
  reason: string;
  details: string | null;
  status: "OPEN" | "RESOLVED";
  created_at: string;
}

interface ModerationLog {
  id: string;
  confession_id: string;
  action: string;
  decision_notes: string | null;
  previous_status: string | null;
  new_status: string | null;
  created_at: string;
}

interface DashboardData {
  confessions: AdminConfession[];
  reports: ConfessionReport[];
  logs: ModerationLog[];
}

interface ApiErrorBody {
  error?: string;
}

const TABS: Array<{ id: DashboardTab; label: string; icon: typeof ShieldCheck }> = [
  { id: "pending", label: "Pending Review", icon: Clock3 },
  { id: "flagged", label: "Flagged & Reports", icon: Flag },
  { id: "urgent", label: "Urgent Safety Alerts", icon: ShieldAlert },
  { id: "history", label: "History", icon: History },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function flattenValues(value: unknown, prefix = "", entries: Array<[string, boolean | number]> = []) {
  if (!isRecord(value)) return entries;
  for (const [key, item] of Object.entries(value)) {
    const label = prefix ? `${prefix}.${key}` : key;
    if (typeof item === "boolean" || (typeof item === "number" && Number.isFinite(item))) {
      entries.push([label, item]);
    } else if (isRecord(item)) {
      flattenValues(item, label, entries);
    }
  }
  return entries;
}

function formatLabel(value: string): string {
  return value
    .replaceAll("_", " ")
    .replaceAll(".", " / ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function highRisk(confession: AdminConfession): boolean {
  return flattenValues(confession.ai_categories).some(([, value]) => value === true) ||
    flattenValues(confession.ai_scores).some(([, value]) => typeof value === "number" && value >= 0.25) ||
    Boolean(confession.ai_flags?.length);
}

function statusTone(status: ModerationStatus): "brand" | "success" | "danger" | "warning" | "neutral" {
  switch (status) {
    case "APPROVED": return "success";
    case "REJECTED": return "danger";
    case "ESCALATED":
    case "HIDDEN_UNDER_REVIEW": return "warning";
    default: return "neutral";
  }
}

function readableDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

async function adminRequest<T>(method: "GET" | "POST", payload?: object): Promise<T> {
  const { data, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw new Error(sessionError.message);
  const accessToken = data.session?.access_token;
  if (!accessToken) throw new Error("Please sign in to access the moderation dashboard.");

  const response = await fetch("/api/admin/confessions", {
    method,
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(payload ? { "Content-Type": "application/json" } : {}),
    },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
  const result = await response.json() as T & ApiErrorBody;
  if (!response.ok) {
    const failure = new Error(result.error ?? "The moderation request could not be completed.");
    Object.assign(failure, { status: response.status });
    throw failure;
  }
  return result;
}

function matchesSearch(confession: AdminConfession, reports: ConfessionReport[], logs: ModerationLog[], query: string) {
  if (!query) return true;
  const relatedReports = reports.filter((report) => report.confession_id === confession.id);
  const relatedLogs = logs.filter((log) => log.confession_id === confession.id);
  const searchable = [
    confession.content,
    confession.category,
    confession.moderation_status,
    ...relatedReports.flatMap((report) => [report.reason, report.details ?? ""]),
    ...relatedLogs.flatMap((log) => [log.action, log.decision_notes ?? "", log.previous_status ?? "", log.new_status ?? ""]),
  ].join(" ").toLocaleLowerCase();
  return searchable.includes(query);
}

export function ConfessionModerationPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, profile, isGlobalAdmin, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<DashboardTab>("pending");
  const [data, setData] = useState<DashboardData>({ confessions: [], reports: [], logs: [] });
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const result = await adminRequest<DashboardData>("GET");
      setData(result);
    } catch (error) {
      const status = error && typeof error === "object" && "status" in error
        ? error.status
        : undefined;
      if (status === 403 || status === 401) {
        toast("Access denied. Administrator permissions are required.", "danger");
        navigate("/", { replace: true });
        return;
      }
      const message = describeError(error, "Could not load the moderation queue.");
      setLoadError(message);
      toast(message, "danger");
    } finally {
      setLoading(false);
      setCheckingAccess(false);
    }
  }, [navigate, toast]);

  useEffect(() => {
    if (authLoading) return;
    if (!user || (!profile?.isAdmin && !isGlobalAdmin)) {
      toast("Access denied. Administrator permissions are required.", "danger");
      navigate("/", { replace: true });
      setCheckingAccess(false);
      return;
    }
    void loadDashboard();
  }, [authLoading, isGlobalAdmin, loadDashboard, navigate, profile?.isAdmin, toast, user]);

  const reportsByConfession = useMemo(() => {
    const map = new Map<string, ConfessionReport[]>();
    for (const report of data.reports) {
      const items = map.get(report.confession_id) ?? [];
      items.push(report);
      map.set(report.confession_id, items);
    }
    return map;
  }, [data.reports]);
  const logsByConfession = useMemo(() => {
    const map = new Map<string, ModerationLog[]>();
    for (const log of data.logs) {
      const items = map.get(log.confession_id) ?? [];
      items.push(log);
      map.set(log.confession_id, items);
    }
    return map;
  }, [data.logs]);

  const visibleConfessions = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return data.confessions.filter((confession) => {
      const reports = reportsByConfession.get(confession.id) ?? [];
      const logs = logsByConfession.get(confession.id) ?? [];
      const tabMatch = activeTab === "pending"
        ? confession.moderation_status === "PENDING_REVIEW"
        : activeTab === "flagged"
          ? confession.report_count > 0 || highRisk(confession)
          : activeTab === "urgent"
            ? confession.is_urgent_safeguarding
            : ["APPROVED", "REJECTED", "ESCALATED", "HIDDEN_UNDER_REVIEW"].includes(confession.moderation_status) &&
              (logs.length > 0 || confession.moderation_status !== "APPROVED" || Boolean(confession.published_at));
      return tabMatch && matchesSearch(confession, reports, logs, query);
    });
  }, [activeTab, data.confessions, logsByConfession, reportsByConfession, search]);

  const counts = useMemo<Record<DashboardTab, number>>(() => ({
    pending: data.confessions.filter((item) => item.moderation_status === "PENDING_REVIEW").length,
    flagged: data.confessions.filter((item) => item.report_count > 0 || highRisk(item)).length,
    urgent: data.confessions.filter((item) => item.is_urgent_safeguarding).length,
    history: data.confessions.filter((item) =>
      ["APPROVED", "REJECTED", "ESCALATED", "HIDDEN_UNDER_REVIEW"].includes(item.moderation_status)
    ).length,
  }), [data.confessions]);

  const moderate = async (confession: AdminConfession, status: DecisionStatus, decisionNotes: string) => {
    const result = await adminRequest<{ status: DecisionStatus; reportsResolved: boolean }>("POST", {
      confessionId: confession.id,
      status,
      decisionNotes,
    });
    if (!result.reportsResolved) {
      toast("Decision saved, but linked reports could not be marked resolved.", "danger");
    } else {
      toast(
        status === "APPROVED"
          ? "Confession approved and published."
          : status === "REJECTED"
            ? "Confession rejected and hidden."
            : "Confession escalated for safeguarding review.",
        "success"
      );
    }
    if (status === "APPROVED") celebrateSuccess();
    await loadDashboard();
  };

  if (authLoading || checkingAccess || (!user && !loadError)) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-page px-4 text-ink">
        <div role="status" className="flex items-center gap-3 rounded-2xl border-2 border-line bg-card px-5 py-4 text-sm font-bold text-ink-muted">
          <Loader2 size={18} className="animate-spin text-brand" aria-hidden />
          Verifying administrator access…
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-page text-ink">
      <header className="sticky top-0 z-30 border-b-2 border-line bg-card/95 backdrop-blur">
        <div className="mx-auto flex min-h-16 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link href="/" className="flex min-w-0 items-center gap-2.5 rounded-xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft" aria-label="GistMe moderation dashboard">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-deep text-base font-black text-brand-contrast">G</span>
            <span className="truncate text-base font-black tracking-tight text-ink">GistMe</span>
          </Link>
          <div className="flex items-center gap-2">
            <Badge tone="brand"><ShieldCheck size={12} aria-hidden />Admin</Badge>
            <Link href="/" className="inline-flex min-h-10 items-center gap-1.5 rounded-xl px-2.5 text-xs font-extrabold text-ink-soft transition-colors hover:bg-page hover:text-brand-deep focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft sm:px-3">
              Return to App <ArrowUpRight size={14} aria-hidden />
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-6xl px-4 pb-12 pt-6 sm:px-6 sm:pt-9">
        <section className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-1 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-brand-deep">
              <ShieldCheck size={13} aria-hidden /> Trust &amp; Safety
            </p>
            <h1 className="text-2xl font-black tracking-tight text-ink sm:text-3xl">Confession moderation</h1>
            <p className="mt-1 max-w-2xl text-sm font-semibold leading-relaxed text-ink-muted">
              Review AI-screened submissions, student reports, and urgent safeguarding alerts.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void loadDashboard()} disabled={loading} leftIcon={
            loading ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <RefreshCw size={15} aria-hidden />
          }>
            Refresh queue
          </Button>
        </section>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4" role="tablist" aria-label="Confession moderation queues">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              id={`confession-tab-${id}`}
              type="button"
              role="tab"
              aria-selected={activeTab === id}
              aria-controls={`confession-panel-${id}`}
              onClick={() => setActiveTab(id)}
              className={`flex min-h-14 items-center justify-between gap-2 rounded-2xl border-2 px-3.5 py-2.5 text-left text-xs font-extrabold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft ${
                activeTab === id
                  ? id === "urgent"
                    ? "border-danger bg-danger-wash text-danger-deep"
                    : "border-brand bg-brand-wash text-brand-deep"
                  : "border-line bg-card text-ink-muted hover:border-brand/50 hover:text-ink"
              }`}
            >
              <span className="flex min-w-0 items-center gap-2">
                <Icon size={16} className="shrink-0" aria-hidden />
                <span>{label}</span>
              </span>
              <Badge tone={id === "urgent" && counts[id] > 0 ? "danger" : counts[id] > 0 ? "warning" : "neutral"} className="px-2 py-0.5 text-[9px]">
                {counts[id]}
              </Badge>
            </button>
          ))}
        </div>

        <section
          id={`confession-panel-${activeTab}`}
          role="tabpanel"
          aria-labelledby={`confession-tab-${activeTab}`}
          className="mt-5"
        >
          <label className="mb-4 flex h-12 items-center gap-2.5 rounded-2xl border-2 border-line bg-card px-3.5 text-ink-muted focus-within:border-brand focus-within:ring-4 focus-within:ring-brand-soft">
            <Search size={16} aria-hidden />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={activeTab === "history" ? "Search content, reports, notes, or decisions…" : "Search confession content or report reasons…"}
              className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-ink outline-none placeholder:text-ink-faint"
              aria-label="Search moderation submissions"
            />
            {search && (
              <button type="button" onClick={() => setSearch("")} aria-label="Clear search" className="rounded-full p-1 hover:bg-page">
                <X size={14} aria-hidden />
              </button>
            )}
          </label>

          {loadError && (
            <div role="alert" className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border-2 border-danger-soft bg-danger-wash px-4 py-3 text-danger-deep">
              <AlertTriangle size={17} className="shrink-0" aria-hidden />
              <p className="min-w-0 flex-1 text-sm font-bold">{loadError}</p>
              <Button size="sm" variant="outline" onClick={() => void loadDashboard()}>Try again</Button>
            </div>
          )}

          {loading && data.confessions.length === 0 ? (
            <div role="status" className="flex items-center justify-center gap-2 rounded-2xl border-2 border-line bg-card px-4 py-12 text-sm font-bold text-ink-muted">
              <Loader2 size={17} className="animate-spin text-brand" aria-hidden /> Loading moderation queue…
            </div>
          ) : visibleConfessions.length === 0 ? (
            <EmptyQueue tab={activeTab} searching={Boolean(search.trim())} />
          ) : (
            <div className="space-y-4">
              <AnimatePresence mode="popLayout">
                {visibleConfessions.map((confession) => (
                  <ConfessionReviewCard
                    key={confession.id}
                    confession={confession}
                    reports={reportsByConfession.get(confession.id) ?? []}
                    logs={logsByConfession.get(confession.id) ?? []}
                    showActions={activeTab !== "history"}
                    onModerate={moderate}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function EmptyQueue({ tab, searching }: { tab: DashboardTab; searching: boolean }) {
  const labels: Record<DashboardTab, string> = {
    pending: "No confessions awaiting review",
    flagged: "No flagged or reported confessions",
    urgent: "No urgent safety alerts",
    history: "No reviewed confessions found",
  };
  return (
    <div className="rounded-3xl border-2 border-dashed border-line bg-card px-5 py-12 text-center">
      <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-brand-wash text-brand-deep">
        {tab === "history" ? <FileSearch size={22} aria-hidden /> : <BadgeCheck size={22} aria-hidden />}
      </span>
      <h2 className="mt-3 text-sm font-black text-ink">{searching ? "No matching submissions" : labels[tab]}</h2>
      <p className="mt-1 text-xs font-semibold text-ink-muted">
        {searching ? "Try a different search term." : "New items will appear here when available."}
      </p>
    </div>
  );
}

function ConfessionReviewCard({
  confession,
  reports,
  logs,
  showActions,
  onModerate,
}: {
  confession: AdminConfession;
  reports: ConfessionReport[];
  logs: ModerationLog[];
  showActions: boolean;
  onModerate: (confession: AdminConfession, status: DecisionStatus, notes: string) => Promise<void>;
}) {
  const { toast } = useToast();
  const [decisionNotes, setDecisionNotes] = useState("");
  const [busy, setBusy] = useState<DecisionStatus | null>(null);
  const categoryEntries = flattenValues(confession.ai_categories);
  const scoreEntries = flattenValues(confession.ai_scores)
    .filter(([, value]) => typeof value === "number")
    .sort((a, b) => Number(b[1]) - Number(a[1]));
  const flags = Array.isArray(confession.ai_flags)
    ? confession.ai_flags.filter((flag): flag is string => typeof flag === "string")
    : [];
  const openReports = reports.filter((report) => report.status === "OPEN");
  const canModerate = showActions && confession.moderation_status !== "REJECTED" &&
    confession.moderation_status !== "APPROVED";

  const runAction = async (status: DecisionStatus) => {
    setBusy(status);
    try {
      await onModerate(confession, status, decisionNotes);
      setDecisionNotes("");
    } catch (error) {
      toast(describeError(error, "Could not save this moderation decision."), "danger");
    } finally {
      setBusy(null);
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -5 }}
      transition={{ duration: 0.18 }}
    >
      <Card className={confession.is_urgent_safeguarding ? "border-danger-soft" : ""}>
        <CardBody className="p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Badge tone={statusTone(confession.moderation_status)}>{formatLabel(confession.moderation_status)}</Badge>
              <Badge tone="neutral">{confession.category}</Badge>
              {confession.is_urgent_safeguarding && <Badge tone="danger"><ShieldAlert size={11} aria-hidden />Urgent safety</Badge>}
            </div>
            <div className="text-right text-[11px] font-semibold text-ink-muted">
              <p title={readableDate(confession.created_at)}>{timeAgo(confession.created_at)}</p>
              <p className="mt-0.5">Anonymous submission</p>
            </div>
          </div>

          <blockquote className="mt-4 whitespace-pre-wrap break-words rounded-2xl border border-line bg-page px-4 py-4 text-sm font-semibold leading-relaxed text-ink sm:text-[15px]">
            {confession.content}
          </blockquote>
          <p className="mt-2 text-[10px] font-semibold text-ink-muted">
            Author identity is protected in this review view.
          </p>

          <section className="mt-4 rounded-2xl border border-line bg-card p-3.5" aria-label="AI moderation breakdown">
            <h3 className="flex items-center gap-2 text-xs font-black text-ink">
              <ShieldCheck size={15} className="text-brand-deep" aria-hidden /> AI moderation breakdown
            </h3>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {categoryEntries.filter(([, value]) => value === true).map(([name]) => (
                <Badge key={`cat-${name}`} tone="warning" className="normal-case tracking-normal">{formatLabel(name)}</Badge>
              ))}
              {flags.map((flag) => (
                <Badge key={`flag-${flag}`} tone={flag === "moderation_unavailable" ? "warning" : "danger"} className="normal-case tracking-normal">
                  {formatLabel(flag)}
                </Badge>
              ))}
              {categoryEntries.every(([, value]) => value !== true) && flags.length === 0 && (
                <span className="text-[11px] font-semibold text-ink-muted">No flagged categories.</span>
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {scoreEntries.slice(0, 12).map(([name, value]) => {
                const score = Number(value);
                return (
                  <Badge key={`score-${name}`} tone={score >= 0.8 ? "danger" : score >= 0.25 ? "warning" : "neutral"} className="normal-case tracking-normal">
                    {formatLabel(name)} · {Math.round(score * 100)}%
                  </Badge>
                );
              })}
              {scoreEntries.length === 0 && <span className="text-[11px] font-semibold text-ink-muted">No AI scores recorded.</span>}
            </div>
          </section>

          {(reports.length > 0 || confession.report_count > 0) && (
            <section className="mt-3 rounded-2xl border border-warning-soft bg-warning-wash/40 p-3.5" aria-label="Student reports">
              <h3 className="flex items-center gap-2 text-xs font-black text-warning-deep">
                <Flag size={14} aria-hidden />
                Student reports · {confession.report_count} total · {openReports.length} open
              </h3>
              {reports.length > 0 ? (
                <ul className="mt-2 space-y-2">
                  {reports.map((report, index) => (
                    <li key={`${report.confession_id}-${report.created_at}-${index}`} className="rounded-xl border border-warning-soft/70 bg-card/70 px-3 py-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-extrabold text-ink">{report.reason}</span>
                        <span className="text-[10px] font-bold text-ink-muted">{report.status === "OPEN" ? "Open" : "Resolved"} · {timeAgo(report.created_at)}</span>
                      </div>
                      {report.details && <p className="mt-1 whitespace-pre-wrap break-words text-xs font-semibold leading-relaxed text-ink-soft">{report.details}</p>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-[11px] font-semibold text-ink-muted">Report count is recorded; report details are not available in the loaded records.</p>
              )}
            </section>
          )}

          {logs.length > 0 && (
            <section className="mt-3 rounded-2xl border border-line bg-page p-3" aria-label="Moderation history">
              <h3 className="flex items-center gap-2 text-xs font-black text-ink"><History size={14} aria-hidden /> Previous decisions</h3>
              <ul className="mt-2 space-y-2">
                {logs.slice(0, 4).map((log) => (
                  <li key={log.id} className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 text-[11px]">
                    <span className="font-extrabold text-ink">{formatLabel(log.action)}{log.previous_status ? ` · from ${formatLabel(log.previous_status)}` : ""}</span>
                    <span className="font-semibold text-ink-muted">{timeAgo(log.created_at)}</span>
                    {log.decision_notes && <p className="w-full whitespace-pre-wrap text-ink-soft">{log.decision_notes}</p>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {canModerate && (
            <section className="mt-4 border-t border-line pt-4" aria-label="Moderator actions">
              <label className="block">
                <span className="mb-1.5 block text-[11px] font-extrabold text-ink">
                  Decision notes <span className="font-semibold text-ink-muted">(optional)</span>
                </span>
                <textarea
                  value={decisionNotes}
                  onChange={(event) => setDecisionNotes(event.target.value.slice(0, 2000))}
                  rows={2}
                  maxLength={2000}
                  disabled={busy !== null}
                  placeholder="Add context for the moderation log…"
                  className="w-full resize-y rounded-xl border-2 border-line bg-page px-3 py-2.5 text-xs font-semibold leading-relaxed text-ink outline-none placeholder:text-ink-faint focus:border-brand focus:ring-4 focus:ring-brand-soft disabled:opacity-60"
                />
              </label>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                <Button size="sm" className="w-full" disabled={busy !== null} loading={busy === "APPROVED"} leftIcon={<Check size={14} aria-hidden />} onClick={() => void runAction("APPROVED")}>
                  Approve
                </Button>
                <Button size="sm" variant="danger" className="w-full" disabled={busy !== null} loading={busy === "REJECTED"} leftIcon={<X size={14} aria-hidden />} onClick={() => void runAction("REJECTED")}>
                  Reject
                </Button>
                <Button size="sm" variant="outline" className="w-full" disabled={busy !== null} loading={busy === "ESCALATED"} leftIcon={<ShieldAlert size={14} aria-hidden />} onClick={() => void runAction("ESCALATED")}>
                  Escalate
                </Button>
              </div>
            </section>
          )}
        </CardBody>
      </Card>
    </motion.div>
  );
}
