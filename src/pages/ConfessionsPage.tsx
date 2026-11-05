import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { EyeOff, Lock, Plus, ShieldCheck, Sparkles, WifiOff } from "lucide-react";
import { ConfessionCard } from "../components/feed/ConfessionCard";
import { Button } from "../components/ui/Button";
import { useAuth } from "../context/AuthContext";
import { useAuthGateStore } from "../store/authGateStore";
import { useGistStore } from "../store/gistStore";
import { CONFESSION_CATEGORIES, type ConfessionCategory } from "../types/models";
import { cn } from "../utils/cn";
import { FeedSkeleton } from "./HomePage";

const filters: Array<ConfessionCategory | "All"> = ["All", ...CONFESSION_CATEGORIES];
const listVariants = { hidden: { opacity: 1 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } };
const itemVariants = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.22, ease: "easeOut" as const } } };

/** Anonymous confessions portal: approved items from the public view + the author's own queue. */
export function ConfessionsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const openAuthGate = useAuthGateStore((state) => state.openAuthGate);
  const confessions = useGistStore((state) => state.confessions);
  const confessionsLoading = useGistStore((state) => state.confessionsLoading);
  const confessionsError = useGistStore((state) => state.confessionsError);
  const myConfessions = useGistStore((state) => state.myConfessions);
  const myConfessionsError = useGistStore((state) => state.myConfessionsError);
  const loadConfessions = useGistStore((state) => state.loadConfessions);
  const loadMyConfessions = useGistStore((state) => state.loadMyConfessions);
  const [filter, setFilter] = useState<ConfessionCategory | "All">("All");

  useEffect(() => {
    void loadConfessions();
  }, [loadConfessions]);

  useEffect(() => {
    if (user) void loadMyConfessions();
  }, [user, loadMyConfessions]);

  const visible = useMemo(
    () => (filter === "All" ? confessions : confessions.filter((item) => item.category === filter)),
    [confessions, filter]
  );
  const mine = useMemo(() => myConfessions.filter((item) => item.moderationStatus !== "approved"), [myConfessions]);

  const startConfession = () => {
    if (!user) {
      openAuthGate({
        title: "Submit an Anonymous Confession",
        speech:
          "Time to go undercover! Create your student account so moderators can keep spam out while your identity stays 100% hidden.",
        outfit: "detective",
        returnTo: "/confessions/create",
      });
      return;
    }
    navigate("/confessions/create");
  };

  return (
    <div className="mx-auto w-full max-w-[720px] min-w-0 px-4 pt-5 sm:px-6 sm:pt-7">
      <div className="relative overflow-hidden rounded-[26px] border-2 border-line bg-card p-5 shadow-[0_4px_0_var(--border-color)] sm:p-6">
        <div className="pointer-events-none absolute -right-8 -top-10 size-40 rounded-full opacity-70" style={{ background: "radial-gradient(circle, var(--brand-wash), transparent 70%)" }} aria-hidden />
        <div className="relative">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-deep px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.14em] text-brand-contrast">
            <EyeOff size={11} strokeWidth={2.8} aria-hidden />
            Secret corner
          </span>
          <h1 className="mt-3 text-[26px] font-black leading-tight tracking-tight text-ink sm:text-3xl">Anonymous Confessions</h1>
          <p className="mt-1.5 max-w-[44ch] text-sm font-semibold leading-relaxed text-ink-muted">
            Author identities are stripped at the database layer. Every confession is reviewed by the global safety team before it appears here.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button leftIcon={<Plus size={17} strokeWidth={2.6} aria-hidden />} onClick={startConfession}>Share a confession</Button>
            <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-line px-2.5 py-1.5 text-[10px] font-extrabold uppercase tracking-wider text-ink-muted">
              <ShieldCheck size={12} strokeWidth={2.6} className="text-success-deep" aria-hidden />
              Moderated
            </span>
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2" aria-label="Filter confessions">
        {filters.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setFilter(item)}
            aria-pressed={filter === item}
            className={cn("min-h-11 rounded-full border-2 px-3 py-2 text-[11px] font-extrabold transition-colors", filter === item ? "border-brand-deep bg-brand-deep text-brand-contrast" : "border-line bg-card text-ink-muted hover:border-line-deep hover:text-ink")}
          >
            {item}
          </button>
        ))}
      </div>

      {user && (mine.length > 0 || myConfessionsError) && (
        <section className="mt-8" aria-labelledby="pending-heading">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-xl bg-warning-wash text-warning-deep"><Lock size={15} strokeWidth={2.5} aria-hidden /></span>
            <h2 id="pending-heading" className="text-sm font-extrabold text-ink">Your submissions</h2>
            <span className="ml-auto text-[10px] font-bold uppercase tracking-wider text-ink-muted">{mine.length} in review</span>
          </div>
          {myConfessionsError ? (
            <div className="flex items-center gap-3 rounded-2xl border-2 border-danger-soft bg-danger-wash px-3.5 py-3">
              <WifiOff size={16} className="shrink-0 text-danger-deep" aria-hidden />
              <p className="min-w-0 flex-1 text-xs font-semibold text-danger-deep">{myConfessionsError}</p>
              <Button size="sm" variant="outline" onClick={() => void loadMyConfessions()}>Retry</Button>
            </div>
          ) : (
            <div className="space-y-4">
              {mine.map((confession) => <ConfessionCard key={confession.id} confession={confession} pending />)}
            </div>
          )}
        </section>
      )}

      <section className="mt-8 pb-8" aria-labelledby="approved-heading">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="approved-heading" className="text-sm font-extrabold text-ink sm:text-base">{filter === "All" ? "Approved confessions" : filter}</h2>
          <span className="text-[10px] font-bold text-ink-muted sm:text-xs">{visible.length} posts</span>
        </div>

        {confessionsError && (
          <div className="mb-4 flex items-center gap-3 rounded-2xl border-2 border-danger-soft bg-danger-wash px-3.5 py-3">
            <WifiOff size={16} className="shrink-0 text-danger-deep" aria-hidden />
            <p className="min-w-0 flex-1 text-xs font-semibold text-danger-deep">{confessionsError}</p>
            <Button size="sm" variant="outline" onClick={() => void loadConfessions()}>Retry</Button>
          </div>
        )}

        {confessionsLoading && confessions.length === 0 ? (
          <FeedSkeleton count={3} />
        ) : (
          <motion.div key={filter} variants={listVariants} initial="hidden" animate="show" className="space-y-4">
            {visible.length > 0 ? (
              visible.map((confession) => (
                <motion.div key={confession.id} variants={itemVariants}>
                  <ConfessionCard confession={confession} />
                </motion.div>
              ))
            ) : (
              <div className="rounded-2xl border-2 border-dashed border-line px-5 py-12 text-center">
                <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-brand-wash text-brand-deep"><Sparkles size={22} strokeWidth={2.4} aria-hidden /></span>
                <p className="mt-3 text-sm font-extrabold text-ink">No confessions in this category yet</p>
                <p className="mx-auto mt-1 max-w-[30ch] text-xs font-semibold leading-relaxed text-ink-muted">Yours could be the first one students relate to.</p>
                <Button size="sm" variant="outline" className="mt-4" onClick={startConfession}>Write one</Button>
              </div>
            )}
          </motion.div>
        )}
      </section>
    </div>
  );
}
