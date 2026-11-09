'use client';

import { Suspense, useEffect, useMemo, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Link, useLocation, useNavigate, useSearchParams } from "@/lib/router";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Mail,
  Search,
  ShieldCheck,
} from "lucide-react";
import { MascotCharacter, type MascotReaction } from "@/components/auth/MascotCharacter";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { Button } from "@/components/ui/Button";
import { SchoolBadge } from "@/components/ui/SchoolBadge";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/context/AuthContext";
import { describeError, supabase } from "@/lib/supabase";
import {
  checkUsernameAvailable,
  ensureProfile,
  isValidUsername,
  signInWithEmail,
  signUpWithEmail,
  updateMyProfile,
} from "@/services/profilesService";
import { useGistStore } from "@/store/gistStore";
import { springs } from "@/theme/tokens";
import { cn } from "@/utils/cn";
import { findOrCreateSchool, normalizeSchoolName } from "@/lib/services/school-resolver";
import type { School } from "@/types/models";

type AuthMode = "signup" | "signin";
type WizardStep = 1 | 2 | 3;
type SignupMethod = "google" | "email";
type NicknameStatus = "idle" | "invalid" | "checking" | "available" | "taken";

const AGE_CONFIRMATION_KEY = "gistme-signup-age-confirmed";
const SAFE_COMMUNITY_RULES = [
  {
    icon: "🛡️",
    title: "Digital Footprint",
    text: "What you post today stays online forever. Make your future self proud.",
  },
  {
    icon: "🤝",
    title: "Respect & Kindness",
    text: "No cyberbullying, secret recording without consent, or fake rumors.",
  },
  {
    icon: "🔐",
    title: "Privacy First",
    text: "Protect your identity and respect your fellow SHS peers.",
  },
] as const;

function GoogleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5 shrink-0">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.75 3.28-8.09Z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z" />
      <path fill="#EA4335" d="M12 4.37c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.55 10.55 0 0 0 12 0 11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 4.37 12 4.37Z" />
    </svg>
  );
}

function isSchoolRecord(value: unknown): value is School {
  if (!value || typeof value !== "object") return false;
  const school = value as Record<string, unknown>;
  return typeof school.id === "string" &&
    typeof school.name === "string" &&
    typeof school.shortName === "string" &&
    typeof school.region === "string" &&
    typeof school.schoolType === "string" &&
    (school.crestUrl === null || typeof school.crestUrl === "string") &&
    Array.isArray(school.aliases) &&
    typeof school.memberCount === "number" &&
    typeof school.postCount === "number";
}

export function AuthWizardPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-page" aria-label="Loading sign-in" />}>
      <AuthWizardContent />
    </Suspense>
  );
}

function AuthWizardContent() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const { user, profile, setProfile, refreshProfile } = useAuth();
  const schools = useGistStore((state) => state.schools);
  const schoolsLoading = useGistStore((state) => state.schoolsLoading);
  const loadSchools = useGistStore((state) => state.loadSchools);
  const upsertSchool = useGistStore((state) => state.upsertSchool);

  const returnTo = searchParams.get("returnTo") || "/";
  const prefillSchoolId = searchParams.get("schoolId") || "";
  const initialMode: AuthMode =
    pathname === "/login" || searchParams.get("mode") === "signin" ? "signin" : "signup";
  const initialStep: WizardStep = pathname === "/onboarding" || searchParams.get("step") === "2" ? 2 : 1;

  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [step, setStep] = useState<WizardStep>(initialStep);
  const [method, setMethod] = useState<SignupMethod>("google");
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [username, setUsername] = useState("");
  const [selectedSchoolId, setSelectedSchoolId] = useState(prefillSchoolId);
  const [schoolQuery, setSchoolQuery] = useState("");
  const [schoolSearchState, setSchoolSearchState] = useState<"idle" | "searching" | "error">("idle");
  const [schoolSearchError, setSchoolSearchError] = useState<string | null>(null);
  const [nicknameStatus, setNicknameStatus] = useState<NicknameStatus>("idle");
  const [busy, setBusy] = useState(false);
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [emailConfirmPending, setEmailConfirmPending] = useState(false);
  const [oauthOnboarding, setOauthOnboarding] = useState(initialStep === 2);
  const [reaction, setReaction] = useState<MascotReaction>("idle");

  const selectedSchool = useMemo(
    () => schools.find((school) => school.id === selectedSchoolId) ?? null,
    [schools, selectedSchoolId]
  );
  const schoolMatches = useMemo(() => {
    const query = normalizeSchoolName(schoolQuery);
    if (!query || selectedSchoolId) return [];
    return schools
      .filter((school) => {
        const name = normalizeSchoolName(school.normalizedName ?? school.name);
        const aliases = (school.aliases ?? []).map(normalizeSchoolName);
        return name.includes(query) || query.includes(name) || aliases.some((alias) => alias.includes(query) || query.includes(alias));
      })
      .slice(0, 8);
  }, [schools, schoolQuery, selectedSchoolId]);
  const stepCount = mode === "signup" ? 3 : 1;
  const progress = mode === "signup" ? (step / stepCount) * 100 : 100;
  const stepOneValid = ageConfirmed && email.trim().includes("@") && password.length >= 6;
  const stepTwoHasInvalidFields =
    !selectedSchool ||
    !selectedSchoolId ||
    !isValidUsername(username) ||
    nicknameStatus === "taken" ||
    nicknameStatus === "invalid";
  const stepTwoValid =
    !stepTwoHasInvalidFields && nicknameStatus === "available";
  const validationErrorVisible = hasAttemptedSubmit && mode === "signup" && (
    (step === 1 && !stepOneValid) || (step === 2 && stepTwoHasInvalidFields)
  );
  const mascotReaction =
    mode === "signup" && step <= 2
      ? validationErrorVisible
        ? "error"
        : reaction === "error"
          ? "idle"
          : reaction
      : reaction;

  useEffect(() => {
    if (schools.length === 0) void loadSchools();
  }, [schools.length, loadSchools]);

  useEffect(() => {
    const paramMode = searchParams.get("mode");
    if (paramMode === "signin" || paramMode === "signup") setMode(paramMode);
    else if (pathname === "/login") setMode("signin");
    else if (pathname === "/register") setMode("signup");

    if (searchParams.get("step") === "2") {
      setStep(2);
      setOauthOnboarding(true);
    }
  }, [pathname, searchParams]);

  useEffect(() => {
    if (step === 2 && sessionStorage.getItem(AGE_CONFIRMATION_KEY) === "true") {
      setAgeConfirmed(true);
      sessionStorage.removeItem(AGE_CONFIRMATION_KEY);
    }
  }, [step]);

  useEffect(() => {
    if (user && !oauthOnboarding) navigate(returnTo, { replace: true });
  }, [user, oauthOnboarding, navigate, returnTo]);

  useEffect(() => {
    if (!user || !profile || username) return;
    setUsername(profile.username ?? "");
  }, [user, profile, username]);

  useEffect(() => {
    if (!user || !profile?.schoolId || selectedSchoolId) return;
    setSelectedSchoolId(profile.schoolId);
  }, [user, profile, selectedSchoolId]);

  useEffect(() => {
    if (mode !== "signup" || step !== 2 || !schoolQuery.trim() || selectedSchoolId || schoolMatches.length > 0) {
      setSchoolSearchState("idle");
      setSchoolSearchError(null);
      return;
    }

    const query = schoolQuery.trim();
    if (normalizeSchoolName(query).length < 3) {
      setSchoolSearchState("idle");
      return;
    }

    let active = true;
    const controller = new AbortController();
    setSchoolSearchState("searching");
    setSchoolSearchError(null);
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          let school: School | null = null;
          try {
            school = await findOrCreateSchool(query);
          } catch (error) {
            console.warn("Local school resolver was unavailable; trying live search.", error);
          }

          if (!school) {
            const { data: sessionData } = await supabase.auth.getSession();
            const response = await fetch("/api/schools/live-search", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...(sessionData.session?.access_token
                  ? { Authorization: `Bearer ${sessionData.session.access_token}` }
                  : {}),
              },
              body: JSON.stringify({ query }),
              signal: controller.signal,
            });
            const result: unknown = await response.json();
            if (!response.ok) {
              const message = result && typeof result === "object" && "error" in result && typeof result.error === "string"
                ? result.error
                : "Could not search for that school.";
              throw new Error(message);
            }
            if (
              result &&
              typeof result === "object" &&
              "schools" in result &&
              Array.isArray(result.schools) &&
              result.schools.length === 0
            ) {
              if (active) {
                setSchoolSearchState("error");
                setSchoolSearchError("No matching school was found. Check the spelling or choose a listed school.");
              }
              return;
            }
            if (!result || typeof result !== "object" || !("school" in result) || !isSchoolRecord(result.school)) {
              throw new Error("The school search returned an invalid result.");
            }
            school = result.school;
          }

          if (!active || !school) return;
          upsertSchool(school);
          setSelectedSchoolId(school.id);
          setSchoolQuery(school.name);
          setSchoolSearchState("idle");
        } catch (error) {
          if (!active || controller.signal.aborted) return;
          setSchoolSearchState("error");
          setSchoolSearchError(error instanceof Error ? error.message : "Could not find that school. Try again.");
        }
      })();
    }, 500);

    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [mode, step, schoolQuery, selectedSchoolId, schoolMatches.length, upsertSchool]);

  useEffect(() => {
    if (mode !== "signup" || step !== 2 || !username) {
      setNicknameStatus("idle");
      return;
    }
    if (!isValidUsername(username)) {
      setNicknameStatus("invalid");
      return;
    }

    let active = true;
    setNicknameStatus("checking");
    const timer = window.setTimeout(async () => {
      try {
        const available = await checkUsernameAvailable(username, user?.id);
        if (active) setNicknameStatus(available ? "available" : "taken");
      } catch {
        if (active) setNicknameStatus("available");
      }
    }, 300);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [mode, step, username, user?.id]);

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setErrorMessage(null);
    setHasAttemptedSubmit(false);
    setStep(1);
    setOauthOnboarding(false);
    if (nextMode === "signup") setAgeConfirmed(false);
    const params = new URLSearchParams(searchParams);
    params.set("mode", nextMode);
    params.delete("step");
    setSearchParams(params, { replace: true });
  };

  const showError = (error: unknown, fallback: string) => {
    const message = describeError(error, fallback);
    setErrorMessage(message);
    setReaction("error");
    toast(message, "danger");
  };

  const startGoogleAuth = async () => {
    if (mode === "signup" && !ageConfirmed) return;
    setBusy(true);
    setErrorMessage(null);
    try {
      const callback = new URL("/auth", window.location.origin);
      callback.searchParams.set("mode", mode);
      callback.searchParams.set("returnTo", returnTo);
      if (mode === "signup") {
        sessionStorage.setItem(AGE_CONFIRMATION_KEY, "true");
        callback.searchParams.set("step", "2");
      }
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: callback.toString() },
      });
      if (error) throw error;
    } catch (error) {
      sessionStorage.removeItem(AGE_CONFIRMATION_KEY);
      showError(error, "Google sign-in could not start. Please try again.");
      setBusy(false);
    }
  };

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setErrorMessage(null);
    try {
      await signInWithEmail(email, password);
      toast("Welcome back!", "success");
      navigate(returnTo, { replace: true });
    } catch (error) {
      showError(error, "That email or password doesn't look right. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const handleJoin = async () => {
    if (!selectedSchool || !selectedSchoolId) {
      setErrorMessage("Choose your school before joining.");
      return;
    }
    if (!isValidUsername(username) || nicknameStatus !== "available") {
      setErrorMessage("Choose an available username with 3 to 24 characters.");
      return;
    }
    setBusy(true);
    setErrorMessage(null);
    try {
      if (oauthOnboarding) {
        if (!user) throw new Error("Please sign in with Google again to finish joining.");
        await ensureProfile();
        const updatedProfile = await updateMyProfile({
          username,
          schoolId: selectedSchoolId,
        });
        setProfile(updatedProfile);
        await refreshProfile();
        toast("Welcome to Gist me!", "success");
        setOauthOnboarding(false);
        navigate(returnTo, { replace: true });
        return;
      }

      const result = await signUpWithEmail({
        email,
        password,
        username,
        schoolId: selectedSchoolId,
      });
      if (result.profile) setProfile(result.profile);
      if (result.hasSession) {
        await refreshProfile();
        toast("Welcome to Gist me!", "success");
        navigate(returnTo, { replace: true });
      } else {
        setEmailConfirmPending(true);
      }
    } catch (error) {
      showError(error, "We couldn't finish your sign-up. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const continueFromStepOne = () => {
    setHasAttemptedSubmit(true);
    if (!stepOneValid) {
      setErrorMessage(
        !ageConfirmed
          ? "Confirm your age before continuing."
          : !email.trim().includes("@")
            ? "Enter a valid email address."
            : "Your password must be at least 6 characters."
      );
      return;
    }
    setErrorMessage(null);
    setHasAttemptedSubmit(false);
    setStep(2);
  };

  const continueFromStepTwo = () => {
    setHasAttemptedSubmit(true);
    if (!selectedSchool || !selectedSchoolId) {
      setErrorMessage("Choose your school badge before continuing.");
      return;
    }
    if (
      !isValidUsername(username) ||
      nicknameStatus !== "available"
    ) {
      setErrorMessage("Choose a username with 3 to 24 characters.");
      return;
    }
    setErrorMessage(null);
    setHasAttemptedSubmit(false);
    setStep(3);
    setReaction("valid");
  };

  const mascotSpeech =
    mode === "signin"
      ? "Welcome back! Sign in and catch up with your school."
      : step === 1
        ? "First, choose how to join. I’ll help you along the way!"
        : step === 2
          ? "Pick a name and your school badge. You’re nearly in!"
          : "Let’s keep Gist me kind, safe, and fun for everyone.";

  return (
    <div className="flex min-h-dvh w-full flex-col bg-page text-ink">
      <header
        className="border-b border-line bg-card"
        style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}
      >
        <div className="mx-auto flex min-h-14 w-full max-w-lg items-center gap-3 px-4 pb-2">
          {mode === "signup" && step > 1 ? (
            <button
              type="button"
              onClick={() => {
                setHasAttemptedSubmit(false);
                setStep((current) => (current === 3 ? 2 : 1));
              }}
              aria-label="Go back one step"
              className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-line text-ink hover:bg-page focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft"
            >
              <ArrowLeft size={20} aria-hidden />
            </button>
          ) : (
            <Link to="/" aria-label="Gist me home" className="flex size-11 shrink-0 items-center">
              <BrandLogo className="h-9 w-auto max-w-10 object-contain" />
            </Link>
          )}
          {mode === "signup" ? (
            <>
              <div
                role="progressbar"
                aria-label={`Sign-up step ${step} of 3`}
                aria-valuemin={1}
                aria-valuemax={3}
                aria-valuenow={step}
                className="h-3 flex-1 overflow-hidden rounded-full bg-line"
              >
                <motion.div
                  initial={false}
                  animate={{ width: `${progress}%` }}
                  transition={springs.gentle}
                  className="h-full rounded-full bg-brand-deep"
                />
              </div>
              <span className="min-w-8 text-right text-xs font-extrabold text-brand-deep">
                {step}/3
              </span>
            </>
          ) : (
            <div className="flex-1 text-center text-sm font-black">Gist me</div>
          )}
          <button
            type="button"
            onClick={() => switchMode(mode === "signup" ? "signin" : "signup")}
            className="min-h-11 shrink-0 rounded-xl px-3 text-sm font-extrabold text-brand-deep hover:bg-brand-wash focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft"
          >
            {mode === "signup" ? "Log in" : "Sign up"}
          </button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col px-4 pb-6 pt-3 sm:pt-6">
        <MascotCharacter
          step={mode === "signin" ? 1 : step}
          outfit={mode === "signin" ? "login_welcome" : undefined}
          compact
          reaction={mascotReaction}
          badgeLabel={mode === "signin" ? "WELCOME BACK" : `STEP ${step} OF 3`}
          speech={mascotSpeech}
          className="gap-2 sm:gap-3"
        />

        <AnimatePresence mode="wait" initial={false}>
          {mode === "signin" ? (
            <motion.section
              key="signin"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mt-4"
            >
              <h1 className="text-center text-2xl font-black">Welcome back</h1>
              <p className="mt-1 text-center text-sm text-ink-muted">Sign in to your account.</p>
              <button
                type="button"
                onClick={() => void startGoogleAuth()}
                disabled={busy}
                className="mt-5 flex min-h-12 w-full items-center justify-center gap-3 rounded-2xl border-2 border-line bg-card px-4 font-extrabold text-ink transition-colors hover:bg-page disabled:opacity-50"
              >
                <GoogleIcon />
                Continue with Google
              </button>
              <div className="my-4 flex items-center gap-3 text-xs font-bold text-ink-muted">
                <span className="h-px flex-1 bg-line" />
                OR USE EMAIL
                <span className="h-px flex-1 bg-line" />
              </div>
              <form onSubmit={handleLogin} className="space-y-3">
                <EmailField email={email} setEmail={setEmail} />
                <PasswordField
                  password={password}
                  setPassword={setPassword}
                  showPassword={showPassword}
                  setShowPassword={setShowPassword}
                  autoComplete="current-password"
                />
                {errorMessage && <ErrorMessage>{errorMessage}</ErrorMessage>}
                <Button
                  type="submit"
                  fullWidth
                  size="lg"
                  loading={busy}
                  leftIcon={<KeyRound size={18} aria-hidden />}
                >
                  Sign in
                </Button>
              </form>
              <Link to={returnTo} className="mt-3 block min-h-11 py-3 text-center text-sm font-bold text-ink-muted">
                Keep browsing
              </Link>
            </motion.section>
          ) : step === 1 ? (
            <motion.section
              key="signup-step-1"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              className="mt-4"
            >
              <h1 className="text-center text-2xl font-black">Join Gist me</h1>
              <p className="mt-1 text-center text-sm text-ink-muted">A friendly space for Ghana SHS students.</p>

              <button
                type="button"
                onClick={() => void startGoogleAuth()}
                disabled={!ageConfirmed || busy}
                className="mt-4 flex min-h-14 w-full items-center justify-center gap-3 rounded-2xl bg-white px-4 text-base font-extrabold text-slate-900 shadow-sm ring-2 ring-line transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft disabled:cursor-not-allowed disabled:opacity-50"
              >
                <GoogleIcon />
                {busy ? "Opening Google..." : "Sign up with Google"}
              </button>

              <label className="mt-4 flex min-h-14 cursor-pointer items-start gap-3 rounded-2xl border-2 border-line bg-card p-3.5 text-sm font-semibold leading-5 text-ink">
                <input
                  type="checkbox"
                  checked={ageConfirmed}
                  onChange={(event) => setAgeConfirmed(event.target.checked)}
                  className="mt-0.5 size-5 shrink-0 accent-violet-700"
                />
                <span>I confirm I am 18 years or older, and I promise not to post explicit, adult, or harmful content.</span>
              </label>

              <div className="my-4 flex items-center gap-3 text-xs font-bold text-ink-muted">
                <span className="h-px flex-1 bg-line" />
                OR USE EMAIL
                <span className="h-px flex-1 bg-line" />
              </div>

              <button
                type="button"
                onClick={() => setMethod("email")}
                aria-expanded={method === "email"}
                className={cn(
                  "flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border-2 px-4 font-extrabold transition-colors",
                  method === "email"
                    ? "border-brand-deep bg-brand-wash text-brand-deep"
                    : "border-line bg-card text-ink hover:bg-page"
                )}
              >
                <Mail size={18} aria-hidden />
                {method === "email" ? "Email sign-up selected" : "Use email and password"}
              </button>

              {method === "email" && (
                <div className="mt-3 space-y-3">
                  <EmailField email={email} setEmail={setEmail} />
                  <PasswordField
                    password={password}
                    setPassword={setPassword}
                    showPassword={showPassword}
                    setShowPassword={setShowPassword}
                    autoComplete="new-password"
                  />
                  <Button
                    type="button"
                    fullWidth
                    size="lg"
                    rightIcon={<ArrowRight size={18} aria-hidden />}
                    onClick={continueFromStepOne}
                  >
                    Continue
                  </Button>
                </div>
              )}
              {errorMessage && (validationErrorVisible || reaction === "error") && (
                <ErrorMessage className="mt-3">{errorMessage}</ErrorMessage>
              )}
              {!ageConfirmed && (
                <p className="mt-3 text-center text-xs font-semibold text-ink-muted">
                  Confirm your age and promise to keep the community safe to continue.
                </p>
              )}
            </motion.section>
          ) : step === 2 ? (
            <motion.section
              key="signup-step-2"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              className="mt-4"
            >
              <h1 className="text-center text-2xl font-black">Make it yours</h1>
              <p className="mt-1 text-center text-sm text-ink-muted">Choose a username and school badge.</p>

              <div className="mt-4 space-y-4 rounded-3xl border-2 border-line bg-card p-4 shadow-sm sm:p-5">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-extrabold">Username</span>
                  <input
                    value={username}
                    onChange={(event) => {
                      setUsername(event.target.value);
                      setErrorMessage(null);
                    }}
                    minLength={3}
                    maxLength={24}
                    autoComplete="nickname"
                    placeholder="Type any name you like"
                    className={cn(
                      "min-h-12 w-full rounded-2xl border-2 bg-page px-4 text-base font-bold text-ink outline-none placeholder:text-ink-muted focus:border-brand-deep focus:ring-4 focus:ring-brand-soft",
                      hasAttemptedSubmit && (nicknameStatus === "taken" || nicknameStatus === "invalid")
                        ? "border-danger"
                        : nicknameStatus === "available"
                          ? "border-success"
                          : "border-line"
                    )}
                  />
                </label>
                <p className="-mt-2 text-sm leading-5 text-ink-muted">
                  Your username is what everyone sees on posts. Full names are only used for sending shoutouts.
                </p>

                <div>
                  <label htmlFor="signup-school-search" className="mb-1.5 block text-sm font-extrabold">
                    Your school badge <span className="text-danger" aria-hidden>*</span>
                  </label>
                  {selectedSchool && (
                    <div className="mb-2 flex min-h-12 items-center gap-3 rounded-xl border border-line bg-page p-2.5">
                      <SchoolBadge
                        schoolId={selectedSchool.id}
                        crestUrl={selectedSchool.crestUrl}
                        name={selectedSchool.name}
                        size="sm"
                      />
                      <span className="text-sm font-bold">{selectedSchool.shortName}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedSchoolId("");
                          setSchoolQuery("");
                        }}
                        className="ml-auto min-h-9 rounded-lg px-2 text-xs font-extrabold text-brand-deep hover:bg-brand-wash"
                      >
                        Change
                      </button>
                    </div>
                  )}
                  {!selectedSchool && (
                    <>
                      <span className="flex min-h-12 items-center gap-2 rounded-2xl border-2 border-line bg-page px-3 focus-within:border-brand-deep focus-within:ring-4 focus-within:ring-brand-soft">
                        {schoolSearchState === "searching"
                          ? <Loader2 size={17} className="shrink-0 animate-spin text-brand-deep" aria-hidden />
                          : <Search size={17} className="shrink-0 text-ink-muted" aria-hidden />}
                        <input
                          id="signup-school-search"
                          type="search"
                          value={schoolQuery}
                          onChange={(event) => {
                            setSchoolQuery(event.target.value);
                            setSelectedSchoolId("");
                            setErrorMessage(null);
                          }}
                          autoComplete="off"
                          placeholder="Search for your Senior High School"
                          className="min-w-0 flex-1 bg-transparent py-2 text-sm font-semibold text-ink outline-none placeholder:text-ink-muted"
                          aria-required="true"
                          aria-describedby="school-search-help"
                        />
                      </span>
                      <p id="school-search-help" className="mt-1 text-xs text-ink-muted">
                        Choose a result. If your school is missing, we’ll search for it.
                      </p>
                      {schoolMatches.length > 0 && (
                        <ul className="mt-2 max-h-52 overflow-y-auto rounded-xl border border-line bg-card">
                          {schoolMatches.map((school) => (
                            <li key={school.id}>
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedSchoolId(school.id);
                                  setSchoolQuery(school.name);
                                  setSchoolSearchState("idle");
                                }}
                                className="flex min-h-12 w-full items-center gap-2.5 px-3 py-2 text-left text-sm font-semibold text-ink hover:bg-page focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-deep"
                              >
                                <SchoolBadge schoolId={school.id} crestUrl={school.crestUrl} name={school.name} size="sm" />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate">{school.name}</span>
                                  <span className="block truncate text-xs font-medium text-ink-muted">{school.region}</span>
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  )}
                  {schoolsLoading && schools.length === 0 && (
                    <p className="mt-1 text-xs text-ink-muted">Loading school badges…</p>
                  )}
                  {schoolSearchState === "searching" && (
                    <p role="status" className="mt-2 text-xs font-semibold text-ink-muted">
                      No local match. Searching Ghana school directories…
                    </p>
                  )}
                  {validationErrorVisible && !selectedSchool && schoolSearchState === "error" && schoolSearchError && (
                    <p role="alert" className="mt-2 text-xs font-semibold text-danger">{schoolSearchError}</p>
                  )}
                </div>

                {nicknameStatus === "checking" && (
                  <p className="flex items-center gap-2 text-sm font-semibold text-ink-muted">
                    <Loader2 size={16} className="animate-spin" aria-hidden />
                    Checking username…
                  </p>
                )}
                {hasAttemptedSubmit && nicknameStatus === "taken" && (
                  <p className="text-sm font-semibold text-danger">That username is taken. Try another one.</p>
                )}
                {hasAttemptedSubmit && nicknameStatus === "invalid" && (
                  <p className="text-sm font-semibold text-danger">Use 3 to 24 characters.</p>
                )}
                {nicknameStatus === "available" && (
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-success">
                    <CheckCircle2 size={16} aria-hidden /> Username is free
                  </p>
                )}
              </div>

              {errorMessage && (validationErrorVisible || reaction === "error") && (
                <ErrorMessage className="mt-3">{errorMessage}</ErrorMessage>
              )}
              <Button
                type="button"
                fullWidth
                size="lg"
                className="mt-4"
                rightIcon={<ArrowRight size={18} aria-hidden />}
                onClick={continueFromStepTwo}
              >
                Continue
              </Button>
            </motion.section>
          ) : (
            <motion.section
              key="signup-step-3"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              className="mt-4"
            >
              <h1 className="text-center text-2xl font-black">Let’s keep it safe</h1>
              <p className="mt-1 text-center text-sm text-ink-muted">Our NaCCA &amp; GES Safe Community Pledge.</p>
              <ul className="mt-4 space-y-3">
                {SAFE_COMMUNITY_RULES.map((rule) => (
                  <li
                    key={rule.title}
                    className="flex gap-3 rounded-2xl border-2 border-line bg-card p-3.5"
                  >
                    <span className="text-2xl" aria-hidden>{rule.icon}</span>
                    <span>
                      <strong className="block text-sm font-extrabold">{rule.title}</strong>
                      <span className="mt-0.5 block text-sm leading-5 text-ink-muted">{rule.text}</span>
                    </span>
                  </li>
                ))}
              </ul>
              {selectedSchool && (
                <p className="mt-3 text-center text-sm font-semibold text-ink-muted">
                  Joining {selectedSchool.shortName} as <strong className="text-ink">{username}</strong>
                </p>
              )}
              {errorMessage && <ErrorMessage className="mt-3">{errorMessage}</ErrorMessage>}
              {emailConfirmPending && (
                <p role="status" className="mt-3 rounded-2xl bg-brand-wash p-3 text-center text-sm font-semibold text-brand-deep">
                  Check your email to finish signing up.
                </p>
              )}
              <Button
                type="button"
                fullWidth
                size="lg"
                loading={busy}
                className="mt-4"
                leftIcon={<ShieldCheck size={18} aria-hidden />}
                onClick={() => {
                  if (emailConfirmPending) {
                    switchMode("signin");
                  } else {
                    void handleJoin();
                  }
                }}
              >
                {emailConfirmPending ? "Go to sign in" : "I Agree & Join Gist me"}
              </Button>
              <p className="mt-3 text-center text-xs font-semibold text-ink-muted">
                By joining, you agree to follow these community rules.
              </p>
            </motion.section>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

function EmailField({
  email,
  setEmail,
}: {
  email: string;
  setEmail: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-extrabold">Email</span>
      <span className="flex min-h-12 items-center gap-2.5 rounded-2xl border-2 border-line bg-card px-3 focus-within:border-brand-deep focus-within:ring-4 focus-within:ring-brand-soft">
        <Mail size={18} className="shrink-0 text-ink-muted" aria-hidden />
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          required
          autoComplete="email"
          className="min-w-0 flex-1 bg-transparent py-2 text-base font-semibold outline-none placeholder:text-ink-muted"
        />
      </span>
    </label>
  );
}

function PasswordField({
  password,
  setPassword,
  showPassword,
  setShowPassword,
  autoComplete,
}: {
  password: string;
  setPassword: (value: string) => void;
  showPassword: boolean;
  setShowPassword: (value: boolean) => void;
  autoComplete: "current-password" | "new-password";
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-extrabold">Password</span>
      <span className="flex min-h-12 items-center gap-2 rounded-2xl border-2 border-line bg-card px-3 focus-within:border-brand-deep focus-within:ring-4 focus-within:ring-brand-soft">
        <KeyRound size={18} className="shrink-0 text-ink-muted" aria-hidden />
        <input
          type={showPassword ? "text" : "password"}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="At least 6 characters"
          minLength={6}
          required
          autoComplete={autoComplete}
          className="min-w-0 flex-1 bg-transparent py-2 text-base font-semibold outline-none placeholder:text-ink-muted"
        />
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          aria-label={showPassword ? "Hide password" : "Show password"}
          className="flex size-11 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:text-ink"
        >
          {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </span>
    </label>
  );
}

function ErrorMessage({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  return (
    <p role="alert" className={cn("rounded-xl bg-danger-wash p-3 text-sm font-semibold text-danger", className)}>
      {children}
    </p>
  );
}
