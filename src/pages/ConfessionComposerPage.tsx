import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, EyeOff, Loader2, Send, ShieldCheck } from "lucide-react";
import { Button } from "../components/ui/Button";
import { useToast } from "../components/ui/Toast";
import { useAuth } from "../context/AuthContext";
import { isUserGlobalAdmin } from "../lib/adminAccess";
import { describeError } from "../lib/supabase";
import { useGistStore } from "../store/gistStore";
import { CONFESSION_CATEGORIES, MAX_POST_LENGTH, type ConfessionCategory } from "../types/models";

export function ConfessionComposerPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, profile, loading } = useAuth();
  const schools = useGistStore((state) => state.schools);
  const loadSchools = useGistStore((state) => state.loadSchools);
  const submitConfession = useGistStore((state) => state.submitConfession);
  const globalAdmin = isUserGlobalAdmin(user?.email);
  const [content, setContent] = useState("");
  const [schoolId, setSchoolId] = useState(profile?.schoolId ?? "");
  const [category, setCategory] = useState<ConfessionCategory>("School Secret");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (schools.length === 0) void loadSchools();
  }, [schools.length, loadSchools]);

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth?mode=signup&returnTo=%2Fconfessions%2Fcreate", { replace: true });
    }
  }, [loading, navigate, user]);

  useEffect(() => {
    if (profile?.schoolId) setSchoolId(profile.schoolId);
  }, [profile?.schoolId]);

  const canSubmit = content.trim().length > 0 && (globalAdmin || Boolean(schoolId)) && !submitting && !loading;
  if (!user && !loading) return null;

  const publish = async () => {
    const text = content.trim();
    if (!text || submitting) return;
    if (!globalAdmin && !schoolId) {
      toast("Choose your school in your profile before posting a confession.", "danger");
      return;
    }

    setSubmitting(true);
    try {
      await submitConfession({
        content: text.slice(0, MAX_POST_LENGTH),
        category,
        schoolId: schoolId || null,
      });
      toast("Confession submitted for moderator review.", "brand");
      navigate("/confessions", { replace: true });
    } catch (error) {
      toast(describeError(error, "Could not submit your confession."), "danger");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex min-h-dvh flex-col overflow-y-auto bg-page text-ink">
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-line bg-card px-4 sm:px-6">
        <button type="button" onClick={() => navigate("/confessions")} aria-label="Back to confessions" className="flex size-10 items-center justify-center rounded-full text-ink-muted hover:bg-page hover:text-ink">
          <ArrowLeft size={19} aria-hidden />
        </button>
        <span className="flex size-9 items-center justify-center rounded-xl bg-brand-wash text-brand-deep"><EyeOff size={18} aria-hidden /></span>
        <div>
          <h1 className="text-sm font-black">Anonymous confession</h1>
          <p className="text-[10px] font-semibold text-ink-muted">Only moderators can see who submitted it.</p>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-4 py-8 sm:px-6">
        <section className="rounded-3xl border-2 border-line bg-card p-5 shadow-[0_4px_0_var(--border-color)] sm:p-8">
          <div className="mb-6 flex items-start gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-brand-wash text-brand-deep"><EyeOff size={22} aria-hidden /></span>
            <div>
              <h2 className="text-xl font-black tracking-tight sm:text-2xl">What&apos;s on your mind?</h2>
              <p className="mt-1 text-xs font-semibold leading-relaxed text-ink-muted">Keep it kind and respectful. A moderator reviews each confession before it is published.</p>
            </div>
          </div>

          <label htmlFor="confession-content" className="sr-only">Your anonymous confession</label>
          <textarea
            id="confession-content"
            autoFocus
            value={content}
            onChange={(event) => setContent(event.target.value.slice(0, MAX_POST_LENGTH))}
            maxLength={MAX_POST_LENGTH}
            rows={7}
            placeholder="Type your anonymous confession here..."
            className="min-h-48 w-full resize-y rounded-2xl border-2 border-line bg-page p-4 text-base font-semibold leading-relaxed text-ink outline-none placeholder:text-ink-faint focus:border-brand focus:ring-4 focus:ring-brand-soft sm:min-h-56"
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="text-[10px] font-semibold text-ink-muted">Your real name and profile photo stay hidden.</span>
            <span className={`shrink-0 text-[10px] font-extrabold tabular-nums ${content.length >= MAX_POST_LENGTH - 25 ? "text-danger-deep" : "text-ink-muted"}`}>
              {content.length}/{MAX_POST_LENGTH}
            </span>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-ink-muted">School</span>
              <select
                value={schoolId}
                onChange={(event) => setSchoolId(event.target.value)}
                required={!globalAdmin}
                className="h-12 w-full rounded-xl border-2 border-line bg-page px-3 text-sm font-bold text-ink outline-none focus:border-brand"
              >
                {globalAdmin && <option value="">Global / no school</option>}
                {!globalAdmin && !profile?.schoolId && <option value="">Choose your school</option>}
                {schools.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}
              </select>
              {globalAdmin && <span className="mt-1 block text-[10px] font-semibold text-ink-muted">Optional for global admins.</span>}
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-ink-muted">Category</span>
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value as ConfessionCategory)}
                className="h-12 w-full rounded-xl border-2 border-line bg-page px-3 text-sm font-bold text-ink outline-none focus:border-brand"
              >
                {CONFESSION_CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
          </div>

          {!globalAdmin && !profile?.schoolId && (
            <p role="status" className="mt-3 rounded-xl border border-warning-soft bg-warning-wash px-3 py-2 text-xs font-semibold text-warning-deep">
              Choose a school to send your confession to its community.
            </p>
          )}

          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => navigate("/confessions")}>Cancel</Button>
            <Button disabled={!canSubmit} onClick={() => void publish()} leftIcon={submitting ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Send size={15} aria-hidden />}>
              {submitting ? "Sending…" : "Post Anonymously 🤫"}
            </Button>
          </div>

          <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-[10px] font-semibold text-ink-muted">
            <ShieldCheck size={13} className="shrink-0 text-success-deep" aria-hidden />
            Confessions are moderated before appearing in the public feed.
          </p>
        </section>
      </main>
    </div>
  );
}
