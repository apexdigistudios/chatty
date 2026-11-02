import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Bold,
  Check,
  CheckCircle2,
  ChevronLeft,
  Eye,
  Feather,
  Italic,
  Link2,
  Loader2,
  Mailbox,
  Search,
  Send,
  Sparkles,
  Underline,
  UserRound,
  X,
} from "lucide-react";
import { DispatchAnimation } from "../components/shoutouts/DispatchAnimation";
import { PostalEnvelope } from "../components/shoutouts/PostalEnvelope";
import {
  ENVELOPE_THEMES,
  FORM_OPTIONS,
  STAMPS,
  STAMP_BY_ID,
} from "../components/shoutouts/postalThemes";
import { Avatar } from "../components/ui/Avatar";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { SchoolBadge } from "../components/ui/SchoolBadge";
import { useToast } from "../components/ui/Toast";
import { useAuth } from "../context/AuthContext";
import { describeError } from "../lib/supabase";
import {
  fetchPublicProfile,
  searchStudentsBySchool,
  type ProfileSearchHit,
} from "../services/profilesService";
import {
  advanceShoutoutDelivery,
  createShoutout,
} from "../services/shoutoutsService";
import { useAuthGateStore } from "../store/authGateStore";
import { useGistStore } from "../store/gistStore";
import { springs } from "../theme/tokens";
import type { School, Shoutout, ShoutoutStatus } from "../types/models";
import { cn } from "../utils/cn";

type WizardStep = 1 | 2 | 3 | 4;
type PresenceState = "idle" | "searching" | "found" | "missing";

const STEPS: Array<{ step: WizardStep; label: string; short: string }> = [
  { step: 1, label: "Recipient", short: "Who?" },
  { step: 2, label: "Envelope", short: "Design" },
  { step: 3, label: "Letter", short: "Write" },
  { step: 4, label: "Dispatch", short: "Send" },
];

const MAX_LETTER_LENGTH = 500;

const stepVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? 44 : -44, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? -44 : 44, opacity: 0 }),
};

/** Full-screen, four-step Duolingo-style Shoutout wizard (`/shoutouts/create`). */
export function ShoutoutCreatePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const { user, profile } = useAuth();
  const openAuthGate = useAuthGateStore((state) => state.openAuthGate);
  const schools = useGistStore((state) => state.schools);
  const loadSchools = useGistStore((state) => state.loadSchools);

  const [step, setStep] = useState<WizardStep>(1);
  const [direction, setDirection] = useState(1);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [dispatch, setDispatch] = useState<Shoutout | null>(null);
  const [dispatchStage, setDispatchStage] = useState<ShoutoutStatus>("in_transit");
  const timers = useRef<number[]>([]);

  // Step 1
  const [schoolId, setSchoolId] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientClass, setRecipientClass] = useState("");
  const [recipientUserId, setRecipientUserId] = useState<string | null>(null);
  const [recipientAvatar, setRecipientAvatar] = useState<string | null>(null);
  const [presence, setPresence] = useState<PresenceState>("idle");
  const [suggestions, setSuggestions] = useState<ProfileSearchHit[]>([]);

  // Step 2
  const [envelopeTheme, setEnvelopeTheme] = useState("school_crest");
  const [stamp, setStamp] = useState<string>("priority");

  // Step 3
  const [message, setMessage] = useState("");
  const [draftStyle, setDraftStyle] = useState<"plain" | "bold" | "italic" | "underline">("plain");
  const letterRef = useRef<HTMLTextAreaElement>(null);

  const school = useMemo(
    () => schools.find((item) => item.id === schoolId) ?? null,
    [schoolId, schools]
  );
  const activeStamp = (STAMP_BY_ID as Map<string, (typeof STAMPS)[number]>).get(stamp) ?? STAMPS[0];
  const progress = (step / STEPS.length) * 100;

  const cancel = useCallback(() => {
    if (window.history.state?.idx > 0) navigate(-1);
    else navigate("/shoutouts");
  }, [navigate]);

  useEffect(() => {
    if (schools.length === 0) void loadSchools();
  }, [schools.length, loadSchools]);

  useEffect(() => () => timers.current.forEach(window.clearTimeout), []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (drawerOpen) setDrawerOpen(false);
      else if (!dispatch) cancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cancel, dispatch, drawerOpen]);

  // Deep link from a public profile → verified recipient.
  useEffect(() => {
    const to = searchParams.get("to");
    const schoolParam = searchParams.get("school");
    const nameParam = searchParams.get("name");
    if (schoolParam) setSchoolId(schoolParam);
    if (nameParam) setRecipientName(nameParam);
    if (!to) return;
    let active = true;
    fetchPublicProfile(to)
      .then((student) => {
        if (!active || !student) return;
        setSchoolId(student.schoolId ?? schoolParam ?? "");
        setRecipientName(student.fullName || student.username);
        setRecipientClass(student.classForm ?? "");
        setRecipientUserId(student.id);
        setRecipientAvatar(student.avatarUrl);
        setPresence("found");
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [searchParams]);

  // Real-time presence check against Supabase `profiles`.
  useEffect(() => {
    const query = recipientName.trim();
    if (!schoolId || query.length < 2 || recipientUserId) {
      setSuggestions([]);
      if (!recipientUserId && query.length < 2) setPresence("idle");
      return;
    }
    let active = true;
    setPresence("searching");
    const timer = window.setTimeout(async () => {
      try {
        const hits = await searchStudentsBySchool(schoolId, query, 6);
        if (!active) return;
        setSuggestions(hits);
        const exact = hits.find(
          (hit) => (hit.fullName || hit.username).toLowerCase() === query.toLowerCase()
        );
        if (exact) {
          setPresence("found");
          setRecipientUserId(exact.id);
          setRecipientAvatar(exact.avatarUrl);
          if (exact.classForm) setRecipientClass(exact.classForm);
          return;
        }
        setPresence("missing");
      } catch {
        if (active) {
          setPresence("missing");
          setSuggestions([]);
        }
      }
    }, 350);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [recipientName, schoolId, recipientUserId]);

  const selectSuggestion = (student: ProfileSearchHit) => {
    setRecipientName(student.fullName || student.username);
    setRecipientUserId(student.id);
    setRecipientAvatar(student.avatarUrl);
    if (student.classForm) setRecipientClass(student.classForm);
    setPresence("found");
    setSuggestions([]);
  };

  const clearLink = () => {
    setRecipientUserId(null);
    setRecipientAvatar(null);
    setPresence("idle");
  };

  const copyInviteLink = async () => {
    const params = new URLSearchParams({ mode: "signup", schoolId, invite: recipientName.trim() });
    const url = `${window.location.origin}/auth?${params.toString()}`;
    try {
      await navigator.clipboard.writeText(url);
      toast("Invite link copied — send it to your friend!", "success");
    } catch {
      toast("Could not copy the invite link.", "danger");
    }
  };

  const goStep = (next: WizardStep) => {
    setDirection(next > step ? 1 : -1);
    setStep(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const canContinue =
    step === 1
      ? Boolean(schoolId && recipientName.trim().length >= 2 && recipientClass)
      : step === 2
        ? Boolean(envelopeTheme && stamp)
        : step === 3
          ? message.trim().length >= 2
          : true;

  const formatLetter = (kind: "bold" | "italic" | "underline") => {
    setDraftStyle((current) => (current === kind ? "plain" : kind));
    letterRef.current?.focus();
  };

  const insertPhrase = (phrase: string) => {
    const next = message.trim() ? `${message.trimEnd()} ${phrase} ` : `${phrase} `;
    setMessage(next.slice(0, MAX_LETTER_LENGTH));
    letterRef.current?.focus();
  };

  const dispatchLetter = async () => {
    if (!user) {
      openAuthGate({
        title: "Send a Paper Plane Shoutout!",
        speech: "Create your student pass to dispatch this sealed letter to any SHS in Ghana.",
        outfit: "shs_welcome",
        returnTo: "/shoutouts/create",
        prefillSchoolId: schoolId || null,
      });
      return;
    }
    if (!canContinue) return;
    setSending(true);
    try {
      const sent = await createShoutout({
        recipientSchoolId: schoolId,
        recipientName: recipientName.trim(),
        recipientClass: recipientClass,
        recipientUserId,
        message: message.trim(),
        envelopeTheme,
        stamp,
      });
      setDispatch(sent);
      setDispatchStage("in_transit");
      setDrawerOpen(false);

      const arrive = window.setTimeout(async () => {
        try {
          const next = await advanceShoutoutDelivery(sent.id, "in_transit");
          setDispatchStage(next);
        } catch {
          // Sorting continues visually even if the optional progress write fails.
        }
      }, 1300);
      const delivered = window.setTimeout(async () => {
        try {
          const next = await advanceShoutoutDelivery(sent.id, "arrived");
          setDispatchStage(next);
        } catch {
          // Delivery confirmation stays pending; the letter was already saved.
        }
      }, 2900);
      timers.current.push(arrive, delivered);
    } catch (error) {
      toast(describeError(error, "Could not send that shoutout."), "danger");
    } finally {
      setSending(false);
    }
  };

  const senderName = profile?.fullName || (profile ? `@${profile.username}` : "Guest preview");
  const senderShort = schools.find((item) => item.id === profile?.schoolId)?.shortName ?? "your SHS";

  return (
    <div className="flex min-h-dvh w-full flex-col overflow-x-hidden bg-card text-ink">
      {/* ─── Sticky Header ─── */}
      <header
        className="sticky top-0 z-40 border-b-2 border-line bg-card/95 backdrop-blur-md"
        style={{ paddingTop: "max(0.65rem, env(safe-area-inset-top))" }}
      >
        <div className="mx-auto flex w-full max-w-2xl items-center gap-2 px-3 pb-2.5 sm:px-6">
          <motion.button
            type="button"
            onClick={step > 1 && !dispatch ? () => { if (step === 4) setDrawerOpen(true); else goStep((step - 1) as WizardStep); } : cancel}
            whileTap={{ scale: 0.92 }}
            transition={springs.snappy}
            aria-label={step > 1 ? "Previous step or preview" : "Cancel"}
            className="flex size-10 shrink-0 items-center justify-center rounded-2xl border-2 border-line bg-card text-ink hover:border-line-deep hover:bg-page"
          >
            {step > 1 ? <ChevronLeft size={19} strokeWidth={2.7} aria-hidden /> : <X size={18} strokeWidth={2.7} aria-hidden />}
          </motion.button>

          <div className="min-w-0 flex-1 text-center">
            <h1 className="truncate text-base font-black tracking-tight text-ink sm:text-lg">
              {STEPS[step - 1]!.label} Shoutout
            </h1>
            <p className="truncate text-[10px] font-extrabold uppercase tracking-[0.14em] text-brand-deep">
              Step {step} of 4 · {school?.shortName ?? "Inter-School Post"}
            </p>
          </div>

          <motion.button
            type="button"
            onClick={() => setDrawerOpen(true)}
            whileTap={{ scale: 0.92 }}
            transition={springs.snappy}
            aria-label="Open envelope preview drawer"
            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-2xl border-2 border-line bg-card px-3 text-xs font-extrabold text-ink hover:border-brand hover:text-brand-deep"
          >
            <Eye size={15} strokeWidth={2.6} aria-hidden />
            <span className="hidden min-[380px]:inline">Preview</span>
          </motion.button>
        </div>

        {/* Slim 3D progress bar */}
        <div className="mx-auto w-full max-w-2xl px-3 pb-2 sm:px-6">
          <div className="relative h-3 overflow-hidden rounded-full border-2 border-line bg-surface-muted p-0.5">
            <motion.div
              initial={false}
              animate={{ width: `${progress}%` }}
              transition={springs.bouncy}
              className="relative h-full rounded-full bg-[#8B5CF6]"
            >
              <span className="absolute inset-x-1.5 top-0.5 h-0.5 rounded-full bg-white/40" aria-hidden />
            </motion.div>
          </div>
        </div>
      </header>

      {/* ─── Wizard Step Surface ─── */}
      <main className="mx-auto flex w-full max-w-2xl min-w-0 flex-1 flex-col px-4 pb-4 pt-5 sm:px-6 sm:pt-7">
        <AnimatePresence mode="wait" custom={direction} initial={false}>
          <motion.section
            key={step}
            custom={direction}
            variants={stepVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={springs.gentle}
            className="flex min-w-0 flex-1 flex-col"
          >
            {/* ══════════ Step 1: Recipient Lookup & Presence ══════════ */}
            {step === 1 && (
              <>
                <StepHeading
                  icon={<UserRound size={18} strokeWidth={2.6} aria-hidden />}
                  eyebrow="Postal lookup"
                  title="Who is the letter for?"
                  description="Choose their SHS, type their official name, and pick a class. We check whether they have a Let's Gist pass."
                />

                <div className="mt-5 space-y-4">
                  <Field label="Target SHS school" htmlFor="wizard-school">
                    <div className="flex h-12 items-center gap-2.5 rounded-2xl border-2 border-line bg-page px-3 focus-within:border-brand">
                      {school ? <SchoolBadge schoolId={school.id} crestUrl={school.crestUrl} name={school.name} size="sm" /> : <Mailbox size={17} className="text-brand-deep" aria-hidden />}
                      <select
                        id="wizard-school"
                        value={schoolId}
                        onChange={(event) => {
                          setSchoolId(event.target.value);
                          clearLink();
                        }}
                        className="h-full min-w-0 flex-1 bg-transparent text-sm font-bold text-ink outline-none"
                      >
                        <option value="">Select school…</option>
                        {schools.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                      </select>
                    </div>
                  </Field>

                  <div className="relative">
                    <Field label="Recipient full name" htmlFor="wizard-name">
                      <div className="flex h-12 items-center gap-2.5 rounded-2xl border-2 border-line bg-page px-3 focus-within:border-brand">
                        {presence === "searching" ? <Loader2 size={17} className="animate-spin text-brand-deep" aria-hidden /> : <Search size={17} className="text-ink-muted" aria-hidden />}
                        <input
                          id="wizard-name"
                          value={recipientName}
                          onChange={(event) => {
                            setRecipientName(event.target.value.slice(0, 80));
                            clearLink();
                          }}
                          placeholder="e.g. Kwame Mensah"
                          autoComplete="off"
                          className="h-full min-w-0 flex-1 bg-transparent text-sm font-bold text-ink outline-none placeholder:text-ink-faint"
                        />
                      </div>
                    </Field>

                    {suggestions.length > 0 && !recipientUserId && (
                      <motion.div
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={springs.snappy}
                        className="relative z-20 mt-1.5 overflow-hidden rounded-2xl border-2 border-line bg-card p-1.5 shadow-[0_4px_0_var(--border-color)]"
                      >
                        <p className="px-2 py-1 text-[9px] font-black uppercase tracking-wider text-ink-muted">Students at {school?.shortName ?? "this SHS"}</p>
                        {suggestions.map((student) => (
                          <button key={student.id} type="button" onClick={() => selectSuggestion(student)} className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left hover:bg-page">
                            <Avatar name={student.username} src={student.avatarUrl} size="sm" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-xs font-extrabold text-ink">{student.fullName || student.username}</span>
                              <span className="block truncate text-[10px] font-semibold text-ink-muted">@{student.username}{student.classForm ? ` · ${student.classForm}` : ""}</span>
                            </span>
                            <Check size={15} className="text-brand-deep" aria-hidden />
                          </button>
                        ))}
                      </motion.div>
                    )}

                    {presence !== "idle" && !recipientUserId && presence !== "searching" && (
                      <PresenceBanner
                        presence={presence}
                        name={recipientName.trim()}
                        onCopyInvite={() => void copyInviteLink()}
                      />
                    )}
                  </div>

                  {/* Verified student badge */}
                  <AnimatePresence>
                    {recipientUserId && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.96, y: 8 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.96 }}
                        transition={springs.bouncy}
                        className="flex items-center gap-3 rounded-2xl border-2 border-success bg-success-wash p-3"
                      >
                        <Avatar name={recipientName} src={recipientAvatar} size="lg" ring />
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-1.5 truncate text-sm font-extrabold text-ink">
                            <CheckCircle2 size={15} className="shrink-0 text-success" aria-hidden />
                            Verified Let&apos;s Gist student
                          </p>
                          <p className="truncate text-[11px] font-semibold text-ink-muted">{recipientName} · {school?.shortName ?? "SHS"}</p>
                        </div>
                        <button type="button" onClick={clearLink} aria-label="Unlink student" className="rounded-lg p-1.5 text-ink-muted hover:bg-card">
                          <X size={15} aria-hidden />
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <Field label="Class / Form" htmlFor="wizard-class">
                    <select
                      id="wizard-class"
                      value={recipientClass}
                      onChange={(event) => setRecipientClass(event.target.value)}
                      className="h-12 w-full rounded-2xl border-2 border-line bg-page px-3 text-sm font-bold text-ink outline-none focus:border-brand"
                    >
                      <option value="">Select class / form…</option>
                      {FORM_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </Field>
                </div>
              </>
            )}

            {/* ══════════ Step 2: Envelope Designer ══════════ */}
            {step === 2 && (
              <>
                <StepHeading
                  icon={<Sparkles size={18} strokeWidth={2.6} aria-hidden />}
                  eyebrow="Digital envelope designer"
                  title="Pick your school envelope"
                  description="Choose a colour and a wax-seal stamp. Your recipient's SHS crest sits on every envelope."
                />

                <div className="mt-5">
                  <PostalEnvelope
                    school={school}
                    theme={envelopeTheme}
                    stampId={stamp}
                    stampLabel={activeStamp.label}
                    recipientName={recipientName || "Recipient"}
                    recipientClass={recipientClass || "Class / Form"}
                    senderName={senderName}
                  />
                </div>

                <div className="mt-6">
                  <p className="mb-2 text-[10px] font-black uppercase tracking-[0.14em] text-ink-muted">Envelope colour</p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {ENVELOPE_THEMES.map((theme) => (
                      <motion.button
                        key={theme.id}
                        type="button"
                        whileTap={{ scale: 0.96 }}
                        transition={springs.snappy}
                        onClick={() => setEnvelopeTheme(theme.id)}
                        aria-pressed={envelopeTheme === theme.id}
                        className={cn(
                          "flex items-center gap-2.5 rounded-2xl border-2 p-2.5 text-left transition-colors",
                          envelopeTheme === theme.id ? "border-brand bg-brand-wash" : "border-line bg-page hover:border-line-deep"
                        )}
                      >
                        <span className="flex size-8 shrink-0 overflow-hidden rounded-lg border border-black/20" aria-hidden>
                          <span className="h-full w-1/2" style={{ backgroundColor: theme.primary }} />
                          <span className="h-full w-1/2" style={{ backgroundColor: theme.secondary }} />
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[11px] font-extrabold text-ink">{theme.label}</span>
                        {envelopeTheme === theme.id && <Check size={14} className="shrink-0 text-brand-deep" aria-hidden />}
                      </motion.button>
                    ))}
                  </div>
                </div>

                <div className="mt-6">
                  <p className="mb-2 text-[10px] font-black uppercase tracking-[0.14em] text-ink-muted">Digital stamp / wax seal</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {STAMPS.map((item) => (
                      <motion.button
                        key={item.id}
                        type="button"
                        whileTap={{ scale: 0.97 }}
                        transition={springs.snappy}
                        onClick={() => setStamp(item.id)}
                        aria-pressed={stamp === item.id}
                        className={cn(
                          "flex items-center gap-2.5 rounded-2xl border-2 p-2.5 text-left transition-colors",
                          stamp === item.id ? "border-brand bg-brand-wash" : "border-line bg-page hover:border-line-deep"
                        )}
                      >
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-full border-2 border-black/20" style={{ backgroundColor: item.seal }} aria-hidden>
                          <Sparkles size={14} className="text-white" strokeWidth={2.7} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[11px] font-extrabold text-ink">{item.label}</span>
                          <span className="block truncate text-[10px] font-semibold text-ink-muted">{item.detail}</span>
                        </span>
                      </motion.button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* ══════════ Step 3: iOS Notes-style letter canvas ══════════ */}
            {step === 3 && (
              <>
                <StepHeading
                  icon={<Feather size={18} strokeWidth={2.6} aria-hidden />}
                  eyebrow="Letter editor"
                  title="Write from the heart"
                  description="A calm, lined writing canvas. Only you and your recipient will read this."
                />

                <div className="mt-4 flex min-h-[320px] flex-1 flex-col overflow-hidden rounded-3xl border-2 border-line bg-card shadow-[0_4px_0_var(--border-color)]">
                  <div className="flex items-center justify-between gap-2 border-b-2 border-line px-4 py-2.5">
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-ink-muted">
                      To: {recipientName || "Recipient"} · {school?.shortName ?? "SHS"}
                    </p>
                    <Badge tone="brand" className="px-2 py-0.5 text-[9px]">Private letter</Badge>
                  </div>

                  <div className="relative flex flex-1 flex-col">
                    {/* Lined paper background */}
                    <div
                      className="pointer-events-none absolute inset-0 opacity-70 dark:opacity-30"
                      style={{
                        backgroundImage: "repeating-linear-gradient(to bottom, transparent 0px, transparent 31px, var(--border-color) 31px, var(--border-color) 32px)",
                      }}
                      aria-hidden
                    />
                    <textarea
                      ref={letterRef}
                      value={message}
                      onChange={(event) => setMessage(event.target.value.slice(0, MAX_LETTER_LENGTH))}
                      maxLength={MAX_LETTER_LENGTH}
                      placeholder="Dear Kwame, big ups for the NSMQ win! Your school made the whole region proud…"
                      aria-label="Shoutout letter"
                      className={cn(
                        "relative min-h-[280px] w-full flex-1 resize-none bg-transparent px-4 py-4 text-[17px] leading-8 text-ink outline-none placeholder:text-ink-faint sm:px-5",
                        draftStyle === "bold" && "font-black",
                        draftStyle === "italic" && "italic",
                        draftStyle === "underline" && "underline decoration-brand decoration-2 underline-offset-4"
                      )}
                      style={{ lineHeight: "32px" }}
                    />
                  </div>

                  {/* Minimal floating formatting toolbar */}
                  <div className="sticky bottom-0 flex items-center gap-1.5 border-t-2 border-line bg-card/95 px-3 py-2 backdrop-blur">
                    {(["bold", "italic", "underline"] as const).map((kind) => {
                      const Icon = kind === "bold" ? Bold : kind === "italic" ? Italic : Underline;
                      return (
                        <button
                          key={kind}
                          type="button"
                          onClick={() => formatLetter(kind)}
                          aria-pressed={draftStyle === kind}
                          aria-label={`Toggle ${kind} styling`}
                          className={cn("flex size-9 items-center justify-center rounded-xl border-2 transition-colors", draftStyle === kind ? "border-brand bg-brand-wash text-brand-deep" : "border-line text-ink-muted hover:text-ink")}
                        >
                          <Icon size={15} strokeWidth={2.5} aria-hidden />
                        </button>
                      );
                    })}
                    <span className="mx-1 h-6 w-0.5 rounded-full bg-line" aria-hidden />
                    {["Chale, well done!", "Represent!", "Miss you!"].map((phrase) => (
                      <button
                        key={phrase}
                        type="button"
                        onClick={() => insertPhrase(phrase)}
                        className="hidden shrink-0 rounded-xl border border-line bg-page px-2 py-1.5 text-[10px] font-extrabold text-ink-muted hover:text-ink sm:inline-flex"
                      >
                        {phrase}
                      </button>
                    ))}
                    <span className="ml-auto shrink-0 text-[11px] font-bold tabular-nums text-ink-muted">{message.length}/{MAX_LETTER_LENGTH}</span>
                  </div>
                </div>
              </>
            )}

            {/* ══════════ Step 4: Review & Dispatch ══════════ */}
            {step === 4 && (
              <>
                <StepHeading
                  icon={<Send size={18} strokeWidth={2.6} aria-hidden />}
                  eyebrow="Final check"
                  title="Ready for take-off?"
                  description="Your sealed letter is addressed, stamped and ready for the inter-school sorting office."
                />

                <div className="mt-5">
                  <PostalEnvelope
                    school={school}
                    theme={envelopeTheme}
                    stampId={stamp}
                    stampLabel={activeStamp.label}
                    recipientName={recipientName}
                    recipientClass={recipientClass}
                    senderName={senderName}
                  />
                </div>

                <div className="mt-5 space-y-2 rounded-3xl border-2 border-line bg-page p-4">
                  <SummaryRow label="To" value={`${recipientName} · ${recipientClass}`} />
                  <SummaryRow label="School" value={school?.name ?? "SHS"} />
                  <SummaryRow label="Envelope" value={ENVELOPE_THEMES.find((item) => item.id === envelopeTheme)?.label ?? "Classic SHS Gold"} />
                  <SummaryRow label="Stamp" value={activeStamp.label} />
                  <div className="border-t-2 border-line pt-2">
                    <p className="text-[10px] font-black uppercase tracking-wider text-ink-muted">Letter preview</p>
                    <p className="mt-1.5 line-clamp-4 whitespace-pre-wrap text-sm font-semibold leading-relaxed text-ink-soft">{message}</p>
                  </div>
                </div>

                <div className="mt-4 flex gap-2">
                  <Button variant="outline" fullWidth onClick={() => goStep(3)} leftIcon={<ArrowLeft size={15} aria-hidden />}>
                    Edit letter
                  </Button>
                  <Button fullWidth onClick={() => setDrawerOpen(true)} leftIcon={<Eye size={15} aria-hidden />}>
                    Preview
                  </Button>
                </div>
              </>
            )}
          </motion.section>
        </AnimatePresence>
      </main>

      {/* ─── Sticky wizard navigation ─── */}
      <footer
        className="sticky bottom-0 z-30 border-t-2 border-line bg-card/95 px-3 pt-2.5 backdrop-blur-md sm:px-6"
        style={{ paddingBottom: "max(0.9rem, env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto flex w-full max-w-2xl items-center gap-2">
          <div className="hidden min-w-0 flex-1 items-center gap-1.5 sm:flex">
            {STEPS.map((item, index) => (
              <span key={item.step} className={cn("h-1.5 flex-1 rounded-full", index + 1 <= step ? "bg-[#8B5CF6]" : "bg-line")} aria-hidden />
            ))}
          </div>
          <Button
            size="lg"
            className="w-full sm:w-auto sm:min-w-[190px]"
            disabled={!canContinue || sending}
            loading={sending}
            onClick={() => (step < 4 ? goStep((step + 1) as WizardStep) : dispatchLetter())}
            rightIcon={step < 4 ? <ArrowRight size={17} strokeWidth={2.7} aria-hidden /> : undefined}
            leftIcon={step === 4 ? <Send size={17} strokeWidth={2.7} aria-hidden /> : undefined}
          >
            {step < 4 ? "Continue" : sending ? "Dispatching…" : "Send Paper Plane Shoutout"}
          </Button>
        </div>
        {step === 1 && !canContinue && (
          <p className="mt-1.5 text-center text-[10px] font-semibold text-ink-muted">
            Select a school, enter a full name and choose a class to continue.
          </p>
        )}
        {step === 3 && !canContinue && (
          <p className="mt-1.5 text-center text-[10px] font-semibold text-ink-muted">Write a short message for your letter.</p>
        )}
      </footer>

      {/* ─── Slide-in Preview Drawer ─── */}
      <PreviewDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        school={school}
        theme={envelopeTheme}
        stamp={stamp}
        stampLabel={activeStamp.label}
        recipientName={recipientName}
        recipientClass={recipientClass}
        senderName={senderName}
        message={message}
        onSend={() => void dispatchLetter()}
        sending={sending}
      />

      <DispatchAnimation
        shoutout={dispatch}
        stage={dispatchStage}
        recipientSchool={school}
        senderShort={senderShort}
        recipientShort={school?.shortName ?? "the SHS"}
        onDone={() => {
          setDispatch(null);
          navigate("/shoutouts?tab=outbox");
        }}
      />
    </div>
  );
}

/* ─────────────────────── Wizard Sub-components ─────────────────────── */

function StepHeading({
  icon,
  eyebrow,
  title,
  description,
}: {
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div>
      <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-wash px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-brand-deep">
        {icon}
        {eyebrow}
      </span>
      <h2 className="mt-2.5 text-[26px] font-black leading-tight tracking-tight text-ink sm:text-[30px]">{title}</h2>
      <p className="mt-1.5 max-w-[46ch] text-sm font-semibold leading-relaxed text-ink-muted">{description}</p>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-ink-muted">{label}</label>
      {children}
    </div>
  );
}

function PresenceBanner({ presence, name, onCopyInvite }: { presence: PresenceState; name: string; onCopyInvite: () => void }) {
  if (presence === "found") return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={springs.bouncy}
      className="mt-2 rounded-2xl border-2 border-warning-soft bg-warning-wash p-3.5"
    >
      <p className="flex items-start gap-2 text-xs font-extrabold leading-relaxed text-warning-deep">
        <Mailbox size={16} className="mt-0.5 shrink-0" aria-hidden />
        Looks like {name || "this student"} hasn&apos;t joined Let&apos;s Gist yet! We&apos;ll save this in the school&apos;s digital post office box. Want to send them an invite link?
      </p>
      <motion.button
        type="button"
        onClick={onCopyInvite}
        whileHover={{ y: -2, boxShadow: "0px 6px 0px #5B21B6" }}
        whileTap={{ y: 3, boxShadow: "0px 1px 0px #5B21B6" }}
        transition={springs.snappy}
        className="mt-3 inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#8B5CF6] px-3.5 text-[11px] font-extrabold uppercase tracking-wider text-white shadow-[0_4px_0_#5B21B6]"
      >
        <Link2 size={14} strokeWidth={2.7} aria-hidden />
        Copy Invite Link
      </motion.button>
    </motion.div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line pb-2 last:border-0">
      <span className="shrink-0 text-[10px] font-black uppercase tracking-wider text-ink-muted">{label}</span>
      <span className="min-w-0 truncate text-right text-xs font-extrabold text-ink">{value}</span>
    </div>
  );
}

interface PreviewDrawerProps {
  open: boolean;
  onClose: () => void;
  school: School | null;
  theme: string;
  stamp: string;
  stampLabel: string;
  recipientName: string;
  recipientClass: string;
  senderName: string;
  message: string;
  onSend: () => void;
  sending: boolean;
}

function PreviewDrawer({
  open,
  onClose,
  school,
  theme,
  stamp,
  stampLabel,
  recipientName,
  recipientClass,
  senderName,
  message,
  onSend,
  sending,
}: PreviewDrawerProps) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Sealed envelope preview">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            aria-hidden
          />
          <motion.aside
            initial={{ x: "100%", opacity: 0.8 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "100%", opacity: 0 }}
            transition={springs.gentle}
            className="relative z-10 flex max-h-[90dvh] w-full max-w-md flex-col overflow-hidden rounded-t-[28px] border-t-2 border-line bg-card shadow-2xl sm:rounded-[28px] sm:border-2"
            style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
          >
            <div className="flex items-center justify-between gap-3 border-b-2 border-line px-4 py-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-brand-deep">Sealed preview</p>
                <h2 className="text-base font-black tracking-tight text-ink">Your digital envelope</h2>
              </div>
              <motion.button type="button" onClick={onClose} whileTap={{ scale: 0.9, rotate: 90 }} transition={springs.snappy} aria-label="Close preview" className="flex size-9 items-center justify-center rounded-xl border-2 border-line text-ink-muted hover:text-ink">
                <X size={17} aria-hidden />
              </motion.button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
              <motion.div initial={{ rotateY: -12, scale: 0.96 }} animate={{ rotateY: 0, scale: 1 }} transition={springs.bouncy}>
                <PostalEnvelope
                  school={school}
                  theme={theme}
                  stampId={stamp}
                  stampLabel={stampLabel}
                  recipientName={recipientName || "Recipient"}
                  recipientClass={recipientClass || "Class / Form"}
                  senderName={senderName}
                />
              </motion.div>
              <div className="mt-4 rounded-2xl border-2 border-line bg-page p-3.5">
                <p className="text-[10px] font-black uppercase tracking-wider text-ink-muted">Inside the envelope</p>
                <p className="mt-1.5 whitespace-pre-wrap break-words text-sm font-semibold leading-relaxed text-ink-soft">
                  {message.trim() || "Your letter is still empty — go back to write it."}
                </p>
              </div>
            </div>

            <div className="flex gap-2 border-t-2 border-line px-4 pt-3">
              <Button variant="outline" onClick={onClose} className="shrink-0">Keep editing</Button>
              <Button fullWidth loading={sending} onClick={onSend} leftIcon={<Send size={16} strokeWidth={2.6} aria-hidden />}>
                Seal &amp; Dispatch
              </Button>
            </div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
