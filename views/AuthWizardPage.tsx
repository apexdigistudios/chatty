'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Link, useLocation, useNavigate, useSearchParams } from "@/lib/router";
import {
  ArrowLeft,
  ArrowRight,
  AtSign,
  Camera,
  Check,
  CheckCircle2,
  Dices,
  Eye,
  EyeOff,
  GraduationCap,
  KeyRound,
  Loader2,
  Lock,
  LogIn,
  Mail,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
  X,
  XCircle,
} from "lucide-react";
import {
  MascotCharacter,
  type MascotReaction,
} from "@/components/auth/MascotCharacter";
import { Avatar } from "@/components/ui/Avatar";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { SchoolBadge } from "@/components/ui/SchoolBadge";
import { useToast } from "@/components/ui/Toast";
import { formatCompactNumber } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import {
  COMPRESSION_PRESETS,
  compressImageWithStats,
  formatBytes,
} from "@/lib/imageCompression";
import { defaultAvatarUrl } from "@/lib/media";
import { describeError } from "@/lib/supabase";
import {
  checkUsernameAvailable,
  signInWithEmail,
  signUpWithEmail,
} from "@/services/profilesService";
import { findSchoolByName, GHANA_REGIONS } from "@/services/schoolsService";
import { useGistStore } from "@/store/gistStore";
import { springs } from "@/theme/tokens";
import { schoolTypeLabel } from "@/types/models";
import { cn } from "@/utils/cn";

type AuthMode = "signup" | "signin";
type WizardStep = 1 | 2 | 3 | 4;
type NicknameStatus = "idle" | "invalid" | "checking" | "available" | "taken";

const NICKNAME_SUGGESTIONS = [
  "CampusKing",
  "NSMQBoss",
  "PrepPrefect",
  "JollofInspector",
  "DormCaptain",
  "GistGeneral",
] as const;

const AVATAR_SEEDS = [
  { label: "Scholar", seed: "KofiScholar", bg: "ede9fe" },
  { label: "Prefect", seed: "AmaPrefect", bg: "dbeafe" },
  { label: "Quizzer", seed: "KwameNSMQ", bg: "dcfce7" },
  { label: "Striker", seed: "EfuaCaptain", bg: "fef3c7" },
  { label: "Agent", seed: "UndercoverKing", bg: "fae8ff" },
  { label: "Poet", seed: "AbenaVibes", bg: "ffe4e6" },
  { label: "Tech", seed: "YawCoder", bg: "e0e7ff" },
  { label: "Royalty", seed: "NanaSika", bg: "fef9c3" },
] as const;

function presetAvatarUrl(seed: string, bg: string): string {
  return `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(
    seed
  )}&backgroundColor=${bg}`;
}

function passwordScore(pw: string): { score: 0 | 1 | 2 | 3 | 4; label: string } {
  if (!pw) return { score: 0, label: "Min. 6 characters" };
  if (pw.length < 6) return { score: 1, label: "Too short (need 6+)" };
  let pts = 2;
  if (pw.length >= 9) pts += 1;
  if (/[0-9!@#$%^&*_-]/.test(pw) && /[A-Za-z]/.test(pw)) pts += 1;
  const clamped = Math.min(4, pts) as 2 | 3 | 4;
  const labels: Record<2 | 3 | 4, string> = {
    2: "Guarded",
    3: "Encrypted",
    4: "FBI Grade",
  };
  return { score: clamped, label: labels[clamped] };
}

/**
 * Duolingo-Style Animated Auth Wizard & Redesigned Login Page.
 *
 * Features dynamic mascot outfit transitions (SHS Uniform -> Detective -> FBI Security
 * -> Graduation Celebration), live nickname availability checks, avatar presets/uploads,
 * and guest-friendly return navigation.
 */
export function AuthWizardPage() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const { user, setProfile, refreshProfile } = useAuth();

  const schools = useGistStore((state) => state.schools);
  const schoolsLoading = useGistStore((state) => state.schoolsLoading);
  const loadSchools = useGistStore((state) => state.loadSchools);

  const initialMode: AuthMode =
    pathname === "/login" || searchParams.get("mode") === "signin" ? "signin" : "signup";
  const returnTo = searchParams.get("returnTo") || "/";
  const prefillSchoolId = searchParams.get("schoolId") || "";

  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [step, setStep] = useState<WizardStep>(1);
  const [slideDir, setSlideDir] = useState<1 | -1>(1);

  // Prevents auto-redirecting away before the user sees Step 4 Celebration!
  const [inWizardFlow, setInWizardFlow] = useState(false);
  const [emailConfirmPending, setEmailConfirmPending] = useState(false);

  // Step 1: SHS Selection
  const [selectedSchoolId, setSelectedSchoolId] = useState<string>(prefillSchoolId);
  const [skippedSchool, setSkippedSchool] = useState(false);
  const [schoolQuery, setSchoolQuery] = useState("");
  const [pendingSchoolName, setPendingSchoolName] = useState("");
  const [pendingSchoolRegion, setPendingSchoolRegion] = useState<string>(GHANA_REGIONS[0]);
  const [checkingNewSchool, setCheckingNewSchool] = useState(false);

  // Step 2: Secret Nickname + Profile Avatar
  const [username, setUsername] = useState("");
  const [nickStatus, setNickStatus] = useState<NicknameStatus>("idle");
  const [selectedAvatarUrl, setSelectedAvatarUrl] = useState<string>(
    presetAvatarUrl(AVATAR_SEEDS[0].seed, AVATAR_SEEDS[0].bg)
  );
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [avatarUploadWarning, setAvatarUploadWarning] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step 3 & Login: Credentials
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Mascot reaction state
  const [reaction, setReaction] = useState<MascotReaction>("idle");
  const [reactionKey, setReactionKey] = useState(0);

  const triggerReaction = (next: MascotReaction) => {
    setReaction(next);
    setReactionKey((k) => k + 1);
  };

  useEffect(() => {
    if (schools.length === 0) void loadSchools();
  }, [schools.length, loadSchools]);

  // Sync mode if URL query changes externally
  useEffect(() => {
    const paramMode = searchParams.get("mode");
    if (paramMode === "signin" || paramMode === "signup") {
      setMode(paramMode);
    } else if (pathname === "/login") {
      setMode("signin");
    } else if (pathname === "/register") {
      setMode("signup");
    }
  }, [pathname, searchParams]);

  // Redirect already-logged-in visitors UNLESS they are viewing Step 4 celebration
  useEffect(() => {
    if (user && !inWizardFlow && step !== 4) {
      navigate(returnTo, { replace: true });
    }
  }, [user, inWizardFlow, step, navigate, returnTo]);

  // Revoke object URL on unmount/change
  useEffect(() => {
    return () => {
      if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
    };
  }, [avatarPreviewUrl]);

  const cleanUsername = useMemo(
    () => username.trim().replace(/^@/, ""),
    [username]
  );

  // Live debounced nickname validation & Supabase uniqueness check
  useEffect(() => {
    if (mode !== "signup" || step !== 2) return;
    if (!cleanUsername) {
      setNickStatus("idle");
      setReaction("idle");
      return;
    }
    if (!/^[A-Za-z0-9_]{3,24}$/.test(cleanUsername)) {
      setNickStatus("invalid");
      triggerReaction("error");
      return;
    }

    let active = true;
    setNickStatus("checking");
    const timer = window.setTimeout(async () => {
      try {
        const available = await checkUsernameAvailable(cleanUsername);
        if (!active) return;
        if (available) {
          setNickStatus("available");
          triggerReaction("valid");
        } else {
          setNickStatus("taken");
          triggerReaction("error");
        }
      } catch {
        if (!active) return;
        // Do not block onboarding on transient network hiccup; DB unique constraint still guards
        setNickStatus("available");
      }
    }, 340);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [cleanUsername, mode, step]);

  const selectedSchool = useMemo(
    () => schools.find((s) => s.id === selectedSchoolId) ?? null,
    [schools, selectedSchoolId]
  );

  const filteredSchools = useMemo(() => {
    const q = schoolQuery.trim().toLowerCase();
    if (!q) return schools;
    return schools.filter((s) =>
      `${s.name} ${s.shortName} ${s.region}`.toLowerCase().includes(q)
    );
  }, [schools, schoolQuery]);

  const activeAvatarSrc = avatarPreviewUrl || selectedAvatarUrl || defaultAvatarUrl(cleanUsername || "CampusKing");
  const pwStrength = useMemo(() => passwordScore(password), [password]);

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setErrorMessage(null);
    setReaction("idle");
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("mode", nextMode);
    setSearchParams(nextParams, { replace: true });
  };

  const goStep = (nextStep: WizardStep) => {
    setSlideDir(nextStep > step ? 1 : -1);
    setErrorMessage(null);
    setReaction(nextStep === 4 ? "celebrate" : "idle");
    setStep(nextStep);
  };

  const handleBackOrExit = () => {
    if (mode === "signup" && step > 1 && step < 4) {
      goStep((step - 1) as WizardStep);
      return;
    }
    navigate(returnTo);
  };

  const addSchoolCommunity = async () => {
    const name = schoolQuery.trim();
    if (name.length < 3 || name.length > 80) {
      toast("School names must be between 3 and 80 characters.", "danger");
      return;
    }

    setCheckingNewSchool(true);
    try {
      const existingSchool = await findSchoolByName(name);
      if (existingSchool) {
        setPendingSchoolName("");
        setSelectedSchoolId(existingSchool.id);
        setSkippedSchool(false);
        toast(`${existingSchool.name} is already listed. It has been selected.`, "brand");
        return;
      }

      setPendingSchoolName(name);
      setSelectedSchoolId("");
      setSkippedSchool(false);
      toast("This community will be created when you complete signup.", "brand");
    } catch (error) {
      const message = describeError(error, "Could not check for an existing school.");
      toast(message, "danger");
      setErrorMessage(message);
    } finally {
      setCheckingNewSchool(false);
    }
  };

  const pickAvatarFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const rawFile = event.target.files?.[0];
    event.target.value = "";
    if (!rawFile) return;

    try {
      const result = await compressImageWithStats(rawFile, COMPRESSION_PRESETS.avatars);
      if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
      setAvatarFile(result.file);
      setAvatarPreviewUrl(URL.createObjectURL(result.file));
      triggerReaction("valid");
      toast(`Avatar compressed to ${formatBytes(result.compressedBytes)}!`, "success");
    } catch (error) {
      toast(describeError(error, "Upload failed. Please check your file size and format."), "danger");
      triggerReaction("error");
    }
  };

  const randomizeNickname = () => {
    const base =
      NICKNAME_SUGGESTIONS[Math.floor(Math.random() * NICKNAME_SUGGESTIONS.length)]!;
    const num = Math.floor(10 + Math.random() * 89);
    setUsername(`${base}${num}`);
  };

  /* ───────────── Submit Signup (Step 3 -> Step 4) ───────────── */
  const handleSignupSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);

    if (!email.trim().includes("@")) {
      setErrorMessage("Enter a valid email address so you never lose your account.");
      triggerReaction("error");
      return;
    }
    if (password.length < 6) {
      setErrorMessage("Your secret password needs at least 6 characters, Agent!");
      triggerReaction("error");
      return;
    }

    setBusy(true);
    setInWizardFlow(true);
    setAvatarUploadWarning(null);
    try {
      const result = await signUpWithEmail({
        email,
        password,
        username: cleanUsername,
        schoolId: skippedSchool ? null : selectedSchoolId || null,
        schoolName: skippedSchool ? null : pendingSchoolName || null,
        schoolRegion: pendingSchoolRegion,
        schoolType: "public",
        avatarUrl: selectedAvatarUrl,
        avatarFile,
      });

      if (result.profile) {
        setProfile(result.profile);
      }
      setAvatarUploadWarning(result.avatarUploadError ?? null);
      if (result.hasSession) {
        await refreshProfile();
        setEmailConfirmPending(false);
      } else {
        setEmailConfirmPending(true);
      }

      goStep(4);
      toast(`Welcome to Gist me, @${cleanUsername}!`, "success");
    } catch (error) {
      const msg = describeError(error, "Could not create your account.");
      setErrorMessage(msg);
      triggerReaction("error");
      setInWizardFlow(false);
      toast(msg, "danger");
    } finally {
      setBusy(false);
    }
  };

  /* ───────────── Submit Login ───────────── */
  const handleLoginSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    if (!email.trim() || password.length < 6) {
      setErrorMessage("Enter your email and password (6+ characters).");
      triggerReaction("error");
      return;
    }

    setBusy(true);
    try {
      await signInWithEmail(email, password);
      triggerReaction("celebrate");
      toast("Welcome back to the gist!", "success");
      navigate(returnTo, { replace: true });
    } catch (error) {
      const msg = describeError(error, "Invalid email or password.");
      setErrorMessage(msg);
      triggerReaction("error");
      toast(msg, "danger");
    } finally {
      setBusy(false);
    }
  };

  /* ───────────── Dynamic Mascot Speech & Outfit Logic ───────────── */
  const mascotConfig = useMemo(() => {
    if (mode === "signin") {
      if (errorMessage) {
        return {
          outfit: "login_welcome" as const,
          badge: "CHECK CREDENTIALS",
          speech: errorMessage,
        };
      }
      return {
        outfit: "login_welcome" as const,
        badge: "WELCOME BACK",
        speech:
          "Akwaaba back! Drop your login details and jump straight into your campus feed.",
      };
    }

    if (step === 1) {
      if (pendingSchoolName) {
        return {
          outfit: "shs_welcome" as const,
          badge: "STEP 1 · NEW COMMUNITY",
          speech: `${pendingSchoolName} will be added to the campus directory when you finish signing up.`,
        };
      }
      if (selectedSchool) {
        return {
          outfit: "shs_welcome" as const,
          badge: "STEP 1 · SHS CAMPUS",
          speech: `Ayekoo! Repping ${selectedSchool.shortName}! Hit Continue to set up your secret campus identity.`,
        };
      }
      if (skippedSchool) {
        return {
          outfit: "shs_welcome" as const,
          badge: "STEP 1 · SHS CAMPUS",
          speech:
            "No wahala! You can join or found your SHS community right after onboarding.",
        };
      }
      return {
        outfit: "shs_welcome" as const,
        badge: "STEP 1 · WELCOME",
        speech: "Yo! Welcome to Gist me! Which SHS are you repping on campus?",
      };
    }

    if (step === 2) {
      if (nickStatus === "invalid") {
        return {
          outfit: "detective" as const,
          badge: "STEP 2 · CODENAME ALERT",
          speech:
            "Hold up Agent! Nicknames must be 3–24 letters, numbers, or underscores (no spaces).",
        };
      }
      if (nickStatus === "taken") {
        return {
          outfit: "detective" as const,
          badge: "STEP 2 · ALREADY CLAIMED",
          speech: `Whoa Agent, @${cleanUsername} is already claimed on campus! Pick another secret nickname.`,
        };
      }
      if (nickStatus === "available" && cleanUsername) {
        return {
          outfit: "detective" as const,
          badge: "STEP 2 · IDENTITY READY",
          speech: `Clean codename, @${cleanUsername}! Pick an avatar disguise or upload a photo too.`,
        };
      }
      return {
        outfit: "detective" as const,
        badge: "STEP 2 · UNDERCOVER",
        speech:
          "Time to go undercover! Pick a nickname so no one knows your real legal name...",
      };
    }

    if (step === 3) {
      if (errorMessage) {
        return {
          outfit: "fbi_security" as const,
          badge: "STEP 3 · SECURITY ALERT",
          speech: errorMessage,
        };
      }
      if (email.includes("@") && password.length >= 6) {
        return {
          outfit: "fbi_security" as const,
          badge: "STEP 3 · VAULT LOCKED",
          speech: `Vault secured, Agent @${cleanUsername}! Hit Create Account to mint your SHS Student Pass.`,
        };
      }
      return {
        outfit: "fbi_security" as const,
        badge: "STEP 3 · SECURITY",
        speech: "Lock down your credentials, Agent!",
      };
    }

    return {
      outfit: "celebration" as const,
      badge: "STEP 4 · OFFICIAL STUDENT",
      speech: "You're in! Time to check out the campus gist.",
    };
  }, [
    mode,
    step,
    selectedSchool,
    pendingSchoolName,
    skippedSchool,
    nickStatus,
    cleanUsername,
    errorMessage,
    email,
    password,
  ]);

  const progressPct = (step / 4) * 100;
  const canProceedStep1 = Boolean(selectedSchoolId || pendingSchoolName) || skippedSchool || schools.length === 0;
  const canProceedStep2 =
    /^[A-Za-z0-9_]{3,24}$/.test(cleanUsername) &&
    (nickStatus === "available" || nickStatus === "checking");

  const slideVariants = {
    enter: (dir: number) => ({ opacity: 0, x: dir * 28 }),
    center: { opacity: 1, x: 0 },
    exit: (dir: number) => ({ opacity: 0, x: dir * -28 }),
  };

  return (
    <div className="flex min-h-dvh w-full flex-col bg-page text-ink">
      {/* ——— Sticky Duolingo-Style Top Progress & Mode Bar ——— */}
      <header
        className="sticky top-0 z-30 border-b-2 border-line bg-card/95 backdrop-blur-md"
        style={{ paddingTop: "max(0.65rem, env(safe-area-inset-top))" }}
      >
        <div className="mx-auto flex w-full max-w-xl items-center gap-3 px-3 pb-2.5 sm:px-6">
          {/* Left: Back step or Exit to public guest feed */}
          {step < 4 ? (
            <motion.button
              type="button"
              onClick={handleBackOrExit}
              whileTap={{ scale: 0.9 }}
              transition={springs.snappy}
              aria-label={
                mode === "signup" && step > 1 ? "Previous step" : "Back to public feed"
              }
              className="flex size-11 shrink-0 items-center justify-center rounded-2xl border-2 border-line bg-card text-ink-muted transition-colors hover:border-line-deep hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft"
            >
              {mode === "signup" && step > 1 ? (
                <ArrowLeft size={18} strokeWidth={2.7} aria-hidden />
              ) : (
                <X size={18} strokeWidth={2.7} aria-hidden />
              )}
            </motion.button>
          ) : (
            <div className="flex shrink-0 items-center gap-2">
              <BrandLogo className="h-9 w-auto max-w-10 object-contain" />
              <span className="text-sm font-black tracking-tight text-ink">Gist me</span>
            </div>
          )}

          {/* Center: Animated 3D Progress Bar (Signup) or Brand Title (Signin) */}
          {mode === "signup" ? (
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              <div
                role="progressbar"
                aria-valuenow={step}
                aria-valuemin={1}
                aria-valuemax={4}
                aria-label={`Onboarding step ${step} of 4`}
                className="relative h-4 flex-1 overflow-hidden rounded-full border-2 border-line bg-surface-muted p-0.5"
              >
                <motion.div
                  initial={false}
                  animate={{ width: `${progressPct}%` }}
                  transition={springs.bouncy}
                  className="relative h-full rounded-full bg-[#8B5CF6]"
                >
                  <span
                    className="absolute inset-x-1.5 top-0.5 h-1 rounded-full bg-white/35"
                    aria-hidden
                  />
                </motion.div>
              </div>
              <span className="shrink-0 text-xs font-black tabular-nums text-brand-deep">
                {step}/4
              </span>
            </div>
          ) : (
            <Link
              to="/"
              className="flex min-w-0 flex-1 items-center justify-center gap-2"
            >
              <BrandLogo className="h-8 w-auto max-w-8 shrink-0 object-contain" />
              <span className="truncate text-base font-black tracking-tight text-ink">
                Gist me
              </span>
            </Link>
          )}

          {/* Right: Mode Switch Pill */}
          {step < 4 && (
            <motion.button
              type="button"
              whileTap={{ scale: 0.94 }}
              transition={springs.snappy}
              onClick={() => switchMode(mode === "signup" ? "signin" : "signup")}
              className="min-h-11 shrink-0 rounded-2xl border-2 border-line-deep bg-card px-3 py-2 text-[11px] font-black uppercase tracking-wider text-brand-deep shadow-[0_3px_0_var(--border-strong)] transition-colors hover:bg-brand-wash"
            >
              {mode === "signup" ? "Log in" : "Sign up"}
            </motion.button>
          )}
        </div>
      </header>

      {/* ——— Main Wizard / Login Stage ——— */}
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col px-4 pb-8 pt-5 sm:px-6 sm:pt-7">
        {mode === "signup" && (
          <Link to="/" aria-label="Gist me home" className="mb-3 inline-flex w-fit items-center gap-2 rounded-xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft">
            <BrandLogo className="h-8 w-auto max-w-8 shrink-0 object-contain" />
            <span className="text-sm font-black tracking-tight text-ink">Gist me</span>
          </Link>
        )}
        {/* Reactive Cartoon Student Mascot & Speech Bubble */}
        <MascotCharacter
          step={step}
          outfit={mascotConfig.outfit}
          reaction={reaction}
          reactionKey={reactionKey}
          badgeLabel={mascotConfig.badge}
          speech={mascotConfig.speech}
        />

        {/* ——— MODE A: REDESIGNED LOGIN SCREEN ——— */}
        {mode === "signin" ? (
          <motion.section
            key="signin-view"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={springs.gentle}
            className="mt-5 flex flex-1 flex-col"
          >
            {/* Visual Campus Crests Strip */}
            <div className="flex items-center justify-between gap-3 rounded-3xl border-2 border-line bg-card px-4 py-3 shadow-[0_4px_0_var(--border-color)]">
              <div className="flex -space-x-2 overflow-hidden py-0.5">
                {schools.slice(0, 5).map((school) => (
                  <SchoolBadge
                    key={school.id}
                    schoolId={school.id}
                    crestUrl={school.crestUrl}
                    name={school.name}
                    size="sm"
                    className="ring-2 ring-card"
                  />
                ))}
              </div>
              <div className="min-w-0 flex-1 text-right">
                <p className="truncate text-xs font-black text-ink">
                  {schools.length > 0
                    ? `${schools.length} SHS Campuses Live`
                    : "Ghana SHS Network"}
                </p>
                <p className="truncate text-[10px] font-bold text-ink-muted">
                  NSMQ · Inter-co · Anonymous Confessions
                </p>
              </div>
            </div>

            {/* Login Form Card */}
            <form
              onSubmit={handleLoginSubmit}
              className="mt-4 space-y-4 rounded-3xl border-2 border-line bg-card p-5 shadow-[0_5px_0_var(--border-color)] sm:p-6"
            >
              <div>
                <h1 className="text-xl font-black tracking-tight text-ink sm:text-2xl">
                  Welcome back to campus
                </h1>
                <p className="mt-0.5 text-xs font-semibold text-ink-muted">
                  Sign in with your student email and secret password.
                </p>
              </div>

              <label className="block">
                <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.14em] text-ink-muted">
                  Student Email
                </span>
                <span className="flex h-12 items-center gap-2.5 rounded-2xl border-2 border-line bg-page px-3.5 transition-colors focus-within:border-brand focus-within:bg-card focus-within:ring-4 focus-within:ring-brand-soft">
                  <Mail size={17} strokeWidth={2.5} className="shrink-0 text-ink-muted" aria-hidden />
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value);
                      if (errorMessage) setErrorMessage(null);
                    }}
                    placeholder="you@school.edu.gh"
                    required
                    autoComplete="email"
                    className="h-full min-w-0 flex-1 bg-transparent text-sm font-bold text-ink outline-none placeholder:text-ink-faint"
                  />
                </span>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.14em] text-ink-muted">
                  Password
                </span>
                <span className="flex h-12 items-center gap-2.5 rounded-2xl border-2 border-line bg-page px-3.5 transition-colors focus-within:border-brand focus-within:bg-card focus-within:ring-4 focus-within:ring-brand-soft">
                  <KeyRound size={17} strokeWidth={2.5} className="shrink-0 text-ink-muted" aria-hidden />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value);
                      if (errorMessage) setErrorMessage(null);
                    }}
                    placeholder="Your secret password"
                    minLength={6}
                    required
                    autoComplete="current-password"
                    className="h-full min-w-0 flex-1 bg-transparent text-sm font-bold text-ink outline-none placeholder:text-ink-faint"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="flex size-11 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:text-ink"
                  >
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </span>
              </label>

              <Button
                type="submit"
                fullWidth
                size="lg"
                loading={busy}
                leftIcon={<LogIn size={18} strokeWidth={2.6} aria-hidden />}
              >
                Sign In to Campus
              </Button>
            </form>

            <div className="mt-4 space-y-2.5">
              <Button
                type="button"
                variant="outline"
                fullWidth
                size="md"
                onClick={() => switchMode("signup")}
                leftIcon={<Sparkles size={16} strokeWidth={2.6} aria-hidden />}
              >
                New Student? Start 30-Sec Wizard
              </Button>

              <Link
                to={returnTo}
                className="block py-2 text-center text-xs font-extrabold text-ink-muted transition-colors hover:text-ink"
              >
                Continue browsing public feed as guest
              </Link>
            </div>
          </motion.section>
        ) : (
          /* ——— MODE B: 4-STEP DUOLINGO-STYLE SIGNUP WIZARD ——— */
          <div className="mt-5 flex flex-1 flex-col">
            <AnimatePresence mode="wait" custom={slideDir} initial={false}>
              {/* ════════════ STEP 1: SELECT SHS SCHOOL ════════════ */}
              {step === 1 && (
                <motion.section
                  key="wizard-step-1"
                  custom={slideDir}
                  variants={slideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={springs.gentle}
                  className="flex flex-1 flex-col"
                >
                  <div className="rounded-3xl border-2 border-line bg-card p-4 shadow-[0_5px_0_var(--border-color)] sm:p-5">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <h1 className="text-lg font-black tracking-tight text-ink sm:text-xl">
                          Pick your SHS Community
                        </h1>
                        <p className="text-xs font-semibold text-ink-muted">
                          Your school crest appears beside your campus gists.
                        </p>
                      </div>
                      <Badge tone="brand">
                        <GraduationCap size={12} strokeWidth={2.6} aria-hidden />
                        {schools.length} SHSs
                      </Badge>
                    </div>

                    {/* Search Directory */}
                    <label className="mt-3.5 flex h-11 items-center gap-2.5 rounded-2xl border-2 border-line bg-page px-3.5 transition-colors focus-within:border-brand focus-within:bg-card focus-within:ring-4 focus-within:ring-brand-soft">
                      <Search size={17} strokeWidth={2.5} className="shrink-0 text-ink-muted" aria-hidden />
                      <input
                        type="search"
                        value={schoolQuery}
                        role="combobox"
                        aria-autocomplete="list"
                        aria-expanded={filteredSchools.length > 0 || Boolean(schoolQuery.trim())}
                        aria-controls="signup-school-options"
                        onChange={(event) => {
                          setSchoolQuery(event.target.value);
                          setPendingSchoolName("");
                        }}
                        placeholder="Search PRESEC, Achimota, Wesley Girls..."
                        aria-label="Search SHS communities"
                        className="min-w-0 flex-1 bg-transparent text-xs font-bold text-ink outline-none placeholder:text-ink-faint sm:text-sm"
                      />
                    </label>

                    {/* School Cards Grid */}
                    <div
                      id="signup-school-options"
                      role="listbox"
                      aria-label="Available school communities"
                      className="mt-3 grid max-h-[300px] grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2"
                    >
                      {schoolsLoading && schools.length === 0 ? (
                        Array.from({ length: 4 }, (_, idx) => (
                          <div
                            key={idx}
                            className="h-16 animate-pulse rounded-2xl border-2 border-line bg-page"
                          />
                        ))
                      ) : filteredSchools.length > 0 ? (
                        filteredSchools.map((school) => {
                          const isSelected =
                            !skippedSchool && selectedSchoolId === school.id;
                          return (
                            <motion.button
                              key={school.id}
                              type="button"
                              whileTap={{ scale: 0.97 }}
                              transition={springs.snappy}
                              onClick={() => {
                                setSkippedSchool(false);
                                setPendingSchoolName("");
                                setSelectedSchoolId(school.id);
                                triggerReaction("valid");
                              }}
                              aria-pressed={isSelected}
                              role="option"
                              aria-selected={isSelected}
                              className={cn(
                                "flex items-center gap-3 rounded-2xl border-2 p-2.5 text-left transition-all",
                                isSelected
                                  ? "border-[#8B5CF6] bg-brand-wash shadow-[0_3px_0_#7C3AED]"
                                  : "border-line bg-page hover:border-line-deep hover:bg-card"
                              )}
                            >
                              <SchoolBadge
                                schoolId={school.id}
                                crestUrl={school.crestUrl}
                                name={school.name}
                                size="md"
                                ring={isSelected}
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-xs font-extrabold text-ink sm:text-[13px]">
                                  {school.shortName}
                                </span>
                                <span className="block truncate text-[10px] font-semibold text-ink-muted">
                                  {school.region} · {schoolTypeLabel(school.schoolType)}
                                </span>
                                <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-bold text-brand-deep">
                                  <Users size={10} aria-hidden />
                                  {formatCompactNumber(school.memberCount)} students
                                </span>
                              </span>
                              {isSelected && (
                                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[#8B5CF6] text-white">
                                  <Check size={14} strokeWidth={3} aria-hidden />
                                </span>
                              )}
                            </motion.button>
                          );
                        })
                      ) : (
                        <div className="col-span-full rounded-2xl border-2 border-dashed border-line px-4 py-4">
                          <p className="text-center text-xs font-extrabold text-ink">
                            No school matched &ldquo;{schoolQuery.trim()}&rdquo;
                          </p>
                          {pendingSchoolName === schoolQuery.trim() ? (
                            <div className="mt-3 rounded-xl border-2 border-brand bg-brand-wash p-3 text-center">
                              <p className="text-xs font-extrabold text-brand-deep">
                                {pendingSchoolName} · {pendingSchoolRegion}
                              </p>
                              <p className="mt-1 text-[11px] font-semibold text-ink-muted">
                                This community will be checked and created during signup.
                              </p>
                              <button
                                type="button"
                                onClick={() => setPendingSchoolName("")}
                                className="mt-2 min-h-11 rounded-xl px-3 text-xs font-extrabold text-ink-muted hover:text-ink"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <>
                              <p className="mt-1 text-center text-[11px] font-semibold text-ink-muted">
                                Add your school community to the directory.
                              </p>
                              <label className="mt-3 block">
                                <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-ink-muted">
                                  School region
                                </span>
                                <select
                                  value={pendingSchoolRegion}
                                  onChange={(event) => setPendingSchoolRegion(event.target.value)}
                                  className="h-11 w-full rounded-xl border-2 border-line bg-page px-3 text-xs font-bold text-ink outline-none focus:border-brand"
                                >
                                  {GHANA_REGIONS.map((region) => (
                                    <option key={region} value={region}>{region}</option>
                                  ))}
                                </select>
                              </label>
                              <Button
                                type="button"
                                fullWidth
                                size="sm"
                                className="mt-3"
                                loading={checkingNewSchool}
                                disabled={!schoolQuery.trim()}
                                onClick={() => void addSchoolCommunity()}
                              >
                                Add New School Community
                              </Button>
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Skip / Found later option */}
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedSchoolId("");
                        setPendingSchoolName("");
                        setSkippedSchool(true);
                        triggerReaction("valid");
                      }}
                      className={cn(
                        "mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border-2 px-3 py-2.5 text-xs font-extrabold transition-colors",
                        skippedSchool
                          ? "border-[#8B5CF6] bg-brand-wash text-brand-deep"
                          : "border-dashed border-line text-ink-muted hover:border-line-deep hover:text-ink"
                      )}
                    >
                      {skippedSchool && <Check size={14} strokeWidth={3} aria-hidden />}
                      <span>My SHS isn&apos;t listed yet — I&apos;ll register it later</span>
                    </button>
                  </div>

                  <div className="mt-5 space-y-2.5">
                    <Button
                      type="button"
                      fullWidth
                      size="lg"
                      disabled={!canProceedStep1}
                      onClick={() => goStep(2)}
                      rightIcon={<ArrowRight size={18} strokeWidth={2.7} aria-hidden />}
                    >
                      Continue
                    </Button>
                    <Link
                      to={returnTo}
                      className="block py-1.5 text-center text-xs font-extrabold text-ink-muted transition-colors hover:text-ink"
                    >
                      Browse public feed as guest first
                    </Link>
                  </div>
                </motion.section>
              )}

              {/* ════════════ STEP 2: SECRET NICKNAME & AVATAR ════════════ */}
              {step === 2 && (
                <motion.section
                  key="wizard-step-2"
                  custom={slideDir}
                  variants={slideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={springs.gentle}
                  className="flex flex-1 flex-col"
                >
                  <div className="space-y-4 rounded-3xl border-2 border-line bg-card p-4 shadow-[0_5px_0_var(--border-color)] sm:p-5">
                    {/* Live Undercover ID Preview Pill */}
                    <div className="flex items-center gap-3 rounded-2xl border-2 border-line bg-page p-3">
                      <Avatar
                        name={cleanUsername || "CampusKing"}
                        src={activeAvatarSrc}
                        size="lg"
                        ring
                        online
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-sm font-black text-ink">
                            @{cleanUsername || "CampusKing"}
                          </span>
                          <Badge tone="brand" className="px-2 py-0.5 text-[9px]">
                            Undercover ID
                          </Badge>
                        </div>
                        <p className="mt-0.5 truncate text-[11px] font-semibold text-ink-muted">
                          {selectedSchool
                            ? `${selectedSchool.shortName} · Real name hidden`
                            : "Ghana SHS · Real name hidden"}
                        </p>
                      </div>
                      {selectedSchool && (
                        <SchoolBadge
                          schoolId={selectedSchool.id}
                          crestUrl={selectedSchool.crestUrl}
                          name={selectedSchool.name}
                          size="sm"
                        />
                      )}
                    </div>

                    {/* Secret Nickname Input */}
                    <div>
                      <div className="mb-1.5 flex items-center justify-between gap-2">
                        <label
                          htmlFor="wizard-nickname-input"
                          className="text-[10px] font-black uppercase tracking-[0.14em] text-ink-muted"
                        >
                          Choose Secret Nickname
                        </label>
                        <button
                          type="button"
                          onClick={randomizeNickname}
                          className="inline-flex items-center gap-1 text-[11px] font-extrabold text-brand-deep hover:underline"
                        >
                          <Dices size={13} strokeWidth={2.6} aria-hidden />
                          Randomize
                        </button>
                      </div>

                      <div
                        className={cn(
                          "flex h-12 items-center gap-2 rounded-2xl border-2 bg-page px-3.5 transition-colors focus-within:bg-card focus-within:ring-4 focus-within:ring-brand-soft",
                          nickStatus === "taken" || nickStatus === "invalid"
                            ? "border-danger"
                            : nickStatus === "available"
                              ? "border-success"
                              : "border-line focus-within:border-brand"
                        )}
                      >
                        <AtSign size={17} strokeWidth={2.7} className="shrink-0 text-brand-deep" aria-hidden />
                        <input
                          id="wizard-nickname-input"
                          value={username}
                          onChange={(event) => setUsername(event.target.value.replace(/^@/, ""))}
                          placeholder="CampusKing"
                          maxLength={24}
                          autoFocus
                          className="h-full min-w-0 flex-1 bg-transparent text-sm font-extrabold text-ink outline-none placeholder:text-ink-faint"
                        />
                        {nickStatus === "checking" && (
                          <Loader2 size={16} className="animate-spin text-ink-muted" aria-hidden />
                        )}
                        {nickStatus === "available" && (
                          <CheckCircle2 size={18} strokeWidth={2.7} className="shrink-0 text-success" aria-label="Available" />
                        )}
                        {(nickStatus === "taken" || nickStatus === "invalid") && (
                          <XCircle size={18} strokeWidth={2.7} className="shrink-0 text-danger" aria-label="Unavailable" />
                        )}
                      </div>

                      {/* Quick Nickname Suggestion Chips */}
                      <div className="no-scrollbar mt-2 flex gap-1.5 overflow-x-auto pb-0.5">
                        {NICKNAME_SUGGESTIONS.map((idea) => (
                          <button
                            key={idea}
                            type="button"
                            onClick={() => setUsername(idea)}
                            className="shrink-0 rounded-full border border-line bg-page px-2.5 py-1 text-[10px] font-extrabold text-ink-muted transition-colors hover:border-brand hover:bg-brand-wash hover:text-brand-deep"
                          >
                            @{idea}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Profile Avatar Picker & Upload */}
                    <div className="border-t-2 border-line pt-3.5">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="text-[10px] font-black uppercase tracking-[0.14em] text-ink-muted">
                          Pick Avatar or Upload Photo
                        </span>
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="inline-flex items-center gap-1 rounded-xl border-2 border-line bg-page px-2.5 py-1 text-[11px] font-extrabold text-brand-deep transition-colors hover:border-brand hover:bg-brand-wash"
                        >
                          <Camera size={13} strokeWidth={2.6} aria-hidden />
                          {avatarFile ? "Change Photo" : "Upload Photo"}
                        </button>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          onChange={pickAvatarFile}
                          className="sr-only"
                          aria-label="Upload profile photo"
                        />
                      </div>

                      <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
                        {AVATAR_SEEDS.map((preset) => {
                          const url = presetAvatarUrl(preset.seed, preset.bg);
                          const isPicked = !avatarPreviewUrl && selectedAvatarUrl === url;
                          return (
                            <motion.button
                              key={preset.seed}
                              type="button"
                              whileTap={{ scale: 0.9 }}
                              transition={springs.snappy}
                              onClick={() => {
                                if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
                                setAvatarFile(null);
                                setAvatarPreviewUrl(null);
                                setSelectedAvatarUrl(url);
                                triggerReaction("valid");
                              }}
                              aria-label={`Choose ${preset.label} avatar`}
                              aria-pressed={isPicked}
                              className={cn(
                                "relative flex flex-col items-center gap-1 rounded-2xl border-2 p-1.5 transition-all",
                                isPicked
                                  ? "border-[#8B5CF6] bg-brand-wash shadow-[0_2px_0_#7C3AED]"
                                  : "border-line bg-page hover:border-line-deep"
                              )}
                            >
                              <Avatar name={preset.seed} src={url} size="md" />
                              <span className="truncate text-[9px] font-extrabold text-ink-muted">
                                {preset.label}
                              </span>
                            </motion.button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 flex gap-2.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="lg"
                      onClick={() => goStep(1)}
                    >
                      Back
                    </Button>
                    <Button
                      type="button"
                      fullWidth
                      size="lg"
                      disabled={!canProceedStep2}
                      onClick={() => goStep(3)}
                      rightIcon={<ArrowRight size={18} strokeWidth={2.7} aria-hidden />}
                    >
                      Continue
                    </Button>
                  </div>
                </motion.section>
              )}

              {/* ════════════ STEP 3: PASSWORD & SECURITY ════════════ */}
              {step === 3 && (
                <motion.section
                  key="wizard-step-3"
                  custom={slideDir}
                  variants={slideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={springs.gentle}
                  className="flex flex-1 flex-col"
                >
                  <form
                    onSubmit={handleSignupSubmit}
                    className="flex flex-1 flex-col"
                  >
                    <div className="space-y-4 rounded-3xl border-2 border-line bg-card p-4 shadow-[0_5px_0_var(--border-color)] sm:p-5">
                      {/* Identity Summary Header */}
                      <div className="flex items-center gap-3 rounded-2xl border-2 border-line bg-page px-3.5 py-2.5">
                        <Avatar
                          name={cleanUsername}
                          src={activeAvatarSrc}
                          size="md"
                          ring
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-black text-ink">
                            Agent @{cleanUsername}
                          </p>
                          <p className="truncate text-[10px] font-bold text-ink-muted">
                            {selectedSchool
                              ? selectedSchool.name
                              : "All Ghana SHS Campuses"}
                          </p>
                        </div>
                        <Badge tone="brand">
                          <Lock size={10} strokeWidth={2.8} aria-hidden />
                          Encrypted
                        </Badge>
                      </div>

                      <label className="block">
                        <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.14em] text-ink-muted">
                          Private Email (For Account Recovery)
                        </span>
                        <span className="flex h-12 items-center gap-2.5 rounded-2xl border-2 border-line bg-page px-3.5 transition-colors focus-within:border-brand focus-within:bg-card focus-within:ring-4 focus-within:ring-brand-soft">
                          <Mail size={17} strokeWidth={2.5} className="shrink-0 text-ink-muted" aria-hidden />
                          <input
                            type="email"
                            value={email}
                            onChange={(event) => {
                              setEmail(event.target.value);
                              if (errorMessage) setErrorMessage(null);
                            }}
                            placeholder="student@gmail.com"
                            required
                            autoComplete="email"
                            className="h-full min-w-0 flex-1 bg-transparent text-sm font-bold text-ink outline-none placeholder:text-ink-faint"
                          />
                        </span>
                      </label>

                      <div>
                        <label className="block">
                          <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.14em] text-ink-muted">
                            Secret Password
                          </span>
                          <span className="flex h-12 items-center gap-2.5 rounded-2xl border-2 border-line bg-page px-3.5 transition-colors focus-within:border-brand focus-within:bg-card focus-within:ring-4 focus-within:ring-brand-soft">
                            <KeyRound size={17} strokeWidth={2.5} className="shrink-0 text-ink-muted" aria-hidden />
                            <input
                              type={showPassword ? "text" : "password"}
                              value={password}
                              onChange={(event) => {
                                const next = event.target.value;
                                setPassword(next);
                                if (errorMessage) setErrorMessage(null);
                                if (next.length >= 6 && email.includes("@") && reaction !== "valid") {
                                  triggerReaction("valid");
                                }
                              }}
                              placeholder="At least 6 characters"
                              minLength={6}
                              required
                              autoComplete="new-password"
                              className="h-full min-w-0 flex-1 bg-transparent text-sm font-bold text-ink outline-none placeholder:text-ink-faint"
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword((v) => !v)}
                              aria-label={showPassword ? "Hide password" : "Show password"}
                              className="rounded-lg p-1 text-ink-muted hover:text-ink"
                            >
                              {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                            </button>
                          </span>
                        </label>

                        {/* 4-Segment FBI Security Strength Meter */}
                        <div className="mt-2.5">
                          <div className="grid grid-cols-4 gap-1.5">
                            {[1, 2, 3, 4].map((bar) => (
                              <span
                                key={bar}
                                className={cn(
                                  "h-2 rounded-full transition-colors duration-200",
                                  pwStrength.score >= bar
                                    ? pwStrength.score === 1
                                      ? "bg-danger"
                                      : pwStrength.score === 2
                                        ? "bg-warning"
                                        : "bg-success"
                                    : "bg-line"
                                )}
                              />
                            ))}
                          </div>
                          <div className="mt-1 flex items-center justify-between text-[10px] font-extrabold text-ink-muted">
                            <span>Email is never shown on your public profile</span>
                            <span
                              className={cn(
                                pwStrength.score >= 3
                                  ? "text-success-deep"
                                  : pwStrength.score === 1
                                    ? "text-danger"
                                    : "text-ink-muted"
                              )}
                            >
                              {pwStrength.label}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-5 flex gap-2.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="lg"
                        disabled={busy}
                        onClick={() => goStep(2)}
                      >
                        Back
                      </Button>
                      <Button
                        type="submit"
                        fullWidth
                        size="lg"
                        loading={busy}
                        disabled={!email.trim() || password.length < 6}
                        leftIcon={<ShieldCheck size={18} strokeWidth={2.7} aria-hidden />}
                      >
                        {busy ? "Minting Pass..." : "Create Account"}
                      </Button>
                    </div>
                  </form>
                </motion.section>
              )}

              {/* ════════════ STEP 4: COMPLETION & CELEBRATION ════════════ */}
              {step === 4 && (
                <motion.section
                  key="wizard-step-4"
                  initial={{ opacity: 0, scale: 0.94, y: 14 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={springs.bouncy}
                  className="flex flex-1 flex-col"
                >
                  {/* Minted SHS Student Pass Card */}
                  <div className="relative overflow-hidden rounded-3xl border-2 border-[#8B5CF6] bg-card p-5 shadow-[0_6px_0_#5B21B6] sm:p-6">
                    <div
                      className="pointer-events-none absolute -right-12 -top-12 size-44 rounded-full opacity-75"
                      style={{
                        background:
                          "radial-gradient(circle, var(--brand-soft), transparent 70%)",
                      }}
                      aria-hidden
                    />

                    <div className="relative flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#8B5CF6] px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white">
                        <Sparkles size={11} strokeWidth={2.8} aria-hidden />
                        Official SHS Student Pass
                      </span>
                      <Badge tone="success">Active</Badge>
                    </div>

                    <div className="relative mt-5 flex items-center gap-4">
                      <Avatar
                        name={cleanUsername}
                        src={activeAvatarSrc}
                        size="2xl"
                        ring
                        online
                      />
                      <div className="min-w-0 flex-1">
                        <h1 className="truncate text-2xl font-black tracking-tight text-ink">
                          @{cleanUsername}
                        </h1>
                        <p className="mt-0.5 truncate text-xs font-bold text-ink-muted">
                          Undercover Student Identity · Verified
                        </p>
                        {selectedSchool ? (
                          <div className="mt-2.5 inline-flex max-w-full items-center gap-2 rounded-full border-2 border-line bg-page py-1 pl-1.5 pr-3">
                            <SchoolBadge
                              schoolId={selectedSchool.id}
                              crestUrl={selectedSchool.crestUrl}
                              name={selectedSchool.name}
                              size="xs"
                            />
                            <span className="truncate text-xs font-extrabold text-ink">
                              {selectedSchool.shortName}
                            </span>
                          </div>
                        ) : (
                          <p className="mt-2 text-xs font-extrabold text-brand-deep">
                            Ready to explore all Ghana SHS campuses
                          </p>
                        )}
                      </div>
                    </div>

                    {emailConfirmPending && (
                      <div className="mt-4 rounded-2xl border-2 border-warning-soft bg-warning-wash px-3.5 py-2.5 text-xs font-bold text-warning-deep">
                        Check your email inbox to confirm your link, then sign in anytime!
                      </div>
                    )}
                    {avatarUploadWarning && (
                      <div role="status" className="mt-4 rounded-2xl border-2 border-warning-soft bg-warning-wash px-3.5 py-2.5 text-xs font-bold text-warning-deep">
                        {avatarUploadWarning}
                      </div>
                    )}
                  </div>

                  <div className="mt-5">
                    <Button
                      type="button"
                      fullWidth
                      size="lg"
                      onClick={() => {
                        setInWizardFlow(false);
                        if (emailConfirmPending) {
                          switchMode("signin");
                        } else {
                          navigate(returnTo, { replace: true });
                        }
                      }}
                      rightIcon={<ArrowRight size={18} strokeWidth={2.8} aria-hidden />}
                    >
                      {emailConfirmPending
                        ? "Proceed to Sign In"
                        : "Check Out the Campus Gist"}
                    </Button>
                  </div>
                </motion.section>
              )}
            </AnimatePresence>
          </div>
        )}
      </main>
    </div>
  );
}
