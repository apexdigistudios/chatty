"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import {
  ArrowLeft,
  Check,
  Copy,
  GraduationCap,
  ExternalLink,
  MessageCircle,
  Megaphone,
  QrCode,
} from "lucide-react";
import { Link } from "@/lib/router";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { VerifiedBadge } from "@/components/profile/VerifiedBadge";
import type { PublicProfile } from "@/types/models";
import { cloudflareMediaUrl } from "@/lib/mediaUrl";
import { PROFILE_SHARE_HOOKS } from "@/lib/profileShareContent";

const PROFILE_ORIGIN = "https://www.gistme.online";

function ShareAvatar({ profile }: { profile: PublicProfile }) {
  const [failed, setFailed] = useState(false);
  const initials = (profile.fullName?.trim() || profile.username).slice(0, 2).toUpperCase();
  const src = useMemo(
    () => profile.avatarUrl && !failed ? cloudflareMediaUrl(profile.avatarUrl) : null,
    [failed, profile.avatarUrl]
  );
  useEffect(() => setFailed(false), [profile.avatarUrl]);

  return (
    <div className="mx-auto flex size-24 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-brand-deep text-2xl font-black text-white shadow-xl ring-4 ring-brand/20">
      {src ? (
        <img
          src={src}
          alt={`${profile.username}'s profile`}
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="size-full rounded-full object-cover"
        />
      ) : initials}
    </div>
  );
}

function ShareSchool({ profile }: { profile: PublicProfile }) {
  const [failed, setFailed] = useState(false);
  const src = profile.schoolCrest && !failed ? cloudflareMediaUrl(profile.schoolCrest) : null;
  useEffect(() => setFailed(false), [profile.schoolCrest]);

  return (
    <span className="inline-flex max-w-full items-center gap-1.5 text-xs font-extrabold text-indigo-900">
      <span className="flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-md bg-indigo-50 text-indigo-700">
        {src ? (
          <img
            src={src}
            alt=""
            referrerPolicy="no-referrer"
            onError={() => setFailed(true)}
            className="size-full object-cover"
          />
        ) : (
          <GraduationCap size={15} aria-hidden />
        )}
      </span>
      <span className="max-w-[200px] truncate">{profile.schoolName || "Campus community"}</span>
    </span>
  );
}

export function ShareProfilePage({
  profile,
  error,
}: {
  profile: PublicProfile | null;
  error?: string | null;
}) {
  const { toast } = useToast();
  const [qrCode, setQrCode] = useState<string | null>(null);
  const profileUrl = profile
    ? `${PROFILE_ORIGIN}/profile/${encodeURIComponent(profile.username)}`
    : "";

  useEffect(() => {
    let active = true;
    if (!profileUrl) {
      setQrCode(null);
      return;
    }
    void QRCode.toDataURL(profileUrl, {
      errorCorrectionLevel: "H",
      margin: 2,
      width: 280,
      color: { dark: "#111827", light: "#FFFFFF" },
    }).then((dataUrl) => {
      if (active) setQrCode(dataUrl);
    }).catch((cause: unknown) => {
      console.error("Could not generate the profile QR code.", cause);
      if (active) toast("The QR code could not be generated. Try again shortly.", "danger");
    });
    return () => {
      active = false;
    };
  }, [profileUrl, toast]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(profileUrl);
      toast("Profile link copied.", "success");
    } catch (cause) {
      console.error("Could not copy the profile link.", cause);
      toast("Could not copy the profile link.", "danger");
    }
  };

  if (!profile) {
    return (
      <main className="mx-auto w-full max-w-xl px-4 py-10 sm:px-6">
        <div className="rounded-3xl border-2 border-line bg-card p-6 text-center shadow-sm">
          <QrCode size={28} className="mx-auto text-brand-deep" aria-hidden />
          <h1 className="mt-3 text-lg font-black text-ink">Profile unavailable</h1>
          <p className="mt-1 text-sm font-semibold text-ink-muted">{error ?? "This profile could not be found."}</p>
          <Link to="/explore" className="mt-5 inline-flex items-center gap-2 text-sm font-extrabold text-brand-deep hover:underline">
            <ArrowLeft size={16} aria-hidden /> Back to Explore
          </Link>
        </div>
      </main>
    );
  }

  const displayName = profile.fullName?.trim() || profile.username;
  const message = `Check out ${displayName}'s profile on Gist me! ${profileUrl}`;

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col items-center px-4 pb-12 pt-5 sm:px-6 sm:pt-8">
      <div className="mb-5 flex w-full items-center">
        <Link
          to={`/profile/${encodeURIComponent(profile.username)}`}
          aria-label="Back to profile"
          className="inline-flex size-11 items-center justify-center rounded-full border-2 border-line bg-card text-ink shadow-sm transition hover:border-brand hover:text-brand-deep focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft"
        >
          <ArrowLeft size={19} aria-hidden />
        </Link>
        <div className="ml-3">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-brand-deep">Profile sharing</p>
          <h1 className="text-lg font-black text-ink">Your share card</h1>
        </div>
      </div>

      <section
        aria-label={`${displayName}'s QR profile card`}
        className="relative w-full max-w-[390px] overflow-hidden rounded-[2rem] border border-white/60 bg-white p-6 text-center shadow-[0_24px_70px_rgba(27,31,59,0.2)] sm:p-8"
      >
        <div className="absolute inset-x-0 top-0 h-36 bg-gradient-to-br from-brand-deep via-indigo-700 to-violet-600" aria-hidden />
        <div className="relative">
          <div className="mb-10 flex items-center justify-between text-white">
            <span className="inline-flex items-center gap-1.5 text-xs font-black tracking-wide">
              <span className="size-2 rounded-full bg-white" aria-hidden /> gist me
            </span>
            <span className="rounded-full border border-white/35 bg-white/15 px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-wider">Student profile</span>
          </div>
          <ShareAvatar profile={profile} />
          <h2 className="mt-4 flex flex-wrap items-center justify-center gap-1.5 text-xl font-black tracking-tight text-slate-950">
            {displayName}
            <VerifiedBadge
              isVerified={profile.isVerified === true}
              verifiedExpiresAt={profile.verifiedExpiresAt}
              verifiedTitle={profile.verifiedTitle}
            />
          </h2>
          <div className="mt-1 flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
            <p className="text-sm font-bold text-slate-500">@{profile.username}</p>
            <ShareSchool profile={profile} />
          </div>
          <div className="mx-auto mt-5 flex size-[204px] items-center justify-center rounded-2xl border border-slate-200 bg-white p-2 shadow-inner">
            {qrCode ? (
              <img src={qrCode} alt={`QR code linking to ${profileUrl}`} className="size-full" />
            ) : (
              <div className="size-8 animate-pulse rounded-lg bg-slate-100" aria-label="Generating QR code" />
            )}
          </div>
          <p className="mt-2 text-[10px] font-bold text-slate-500">Scan to view profile</p>
          <ul className="mx-auto mt-4 flex w-fit max-w-full flex-col gap-1.5 text-left">
            {PROFILE_SHARE_HOOKS.map((hook) => (
              <li key={hook} className="flex items-start gap-2 text-[10px] font-extrabold leading-snug text-slate-700">
                <Check size={13} strokeWidth={3} className="mt-px shrink-0 text-emerald-600" aria-hidden />
                <span>{hook}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-center justify-center gap-1.5 text-[9px] font-black uppercase tracking-[0.16em] text-indigo-700">
            <Megaphone size={13} aria-hidden />
            Find your campus on Gist me
            <MessageCircle size={13} aria-hidden />
          </div>
        </div>
      </section>

      <div className="mt-5 grid w-full max-w-[390px] grid-cols-2 gap-3">
        <a
          href={`https://wa.me/?text=${encodeURIComponent(message)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#25D366] px-3 text-xs font-extrabold text-white shadow-[0_4px_0_#1caa50] transition hover:-translate-y-0.5 active:translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-green-200"
        >
          <MessageCircle size={17} aria-hidden /> Share to WhatsApp
        </a>
        <Button
          type="button"
          variant="outline"
          onClick={() => void copyLink()}
          className="min-h-12 rounded-2xl px-3 text-xs"
          leftIcon={<Copy size={16} aria-hidden />}
        >
          Copy Link
        </Button>
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-[10px] font-semibold text-ink-muted">
        <Check size={12} className="text-success" aria-hidden /> QR code opens your public profile
        <a href={profileUrl} target="_blank" rel="noopener noreferrer" aria-label="Open profile link" className="ml-1 text-brand-deep hover:underline">
          <ExternalLink size={12} aria-hidden />
        </a>
      </p>
    </main>
  );
}
