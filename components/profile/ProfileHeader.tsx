'use client';

import type { ReactNode } from "react";
import { Pencil, Settings } from "lucide-react";
import { VerifiedBadge } from "@/components/profile/VerifiedBadge";
import { Badge } from "@/components/ui/Badge";

interface ProfileHeaderProps {
  username: string;
  fullName: string | null;
  isVerified?: boolean;
  verifiedExpiresAt?: string | null;
  verifiedTitle?: string | null;
  isAdmin?: boolean;
  role?: string | null;
  websiteHref?: string | null;
  website?: string | null;
  verifiedLabel?: string | null;
  schoolBadge: ReactNode;
  bio: string;
  onEdit: () => void;
  onSettings: () => void;
  onShoutouts: () => void;
}

export function ProfileHeader({
  username,
  fullName,
  isVerified,
  verifiedExpiresAt,
  verifiedTitle,
  isAdmin,
  role,
  websiteHref,
  website,
  verifiedLabel,
  schoolBadge,
  bio,
  onEdit,
  onSettings,
  onShoutouts,
}: ProfileHeaderProps) {
  return (
    <div className="flex min-w-0 flex-col items-start text-left">
      {fullName && <h1 className="max-w-full truncate text-xl font-black tracking-tight text-ink sm:text-2xl">{fullName}</h1>}
      <p className="mt-1 flex max-w-full flex-wrap items-center gap-x-1.5 gap-y-1 text-sm font-bold text-ink-muted">
        <span className="truncate">@{username}</span>
        <VerifiedBadge
          isVerified={isVerified}
          verifiedExpiresAt={verifiedExpiresAt}
          verifiedTitle={verifiedTitle}
          isAdmin={isAdmin}
          role={role}
        />
        {verifiedLabel && (
          <Badge tone="warning" className="rounded-full px-2.5 py-1 text-[10px]">
            {verifiedLabel}
          </Badge>
        )}
      </p>
      <p className="mt-3 max-w-xl whitespace-pre-wrap text-sm font-semibold leading-relaxed text-ink-soft sm:text-[15px]">
        {bio || "No bio yet — tell your campus who you are."}
      </p>
      {websiteHref && website && (
        <a
          href={websiteHref}
          target="_blank"
          rel="noreferrer"
          className="mt-2 max-w-full truncate text-xs font-extrabold text-brand-deep hover:underline"
        >
          {website}
        </a>
      )}
      <div className="mt-3 max-w-full">{schoolBadge}</div>

      <div className="mt-4 flex w-full flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-[#FACC15] bg-[#FACC15] px-4 text-xs font-extrabold text-[#171717] transition-colors hover:bg-yellow-300 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft"
        >
          <Pencil size={14} strokeWidth={2.6} aria-hidden />
          Edit Profile
        </button>
        <button
          type="button"
          onClick={onShoutouts}
          className="inline-flex min-h-10 items-center justify-center rounded-full border border-line bg-page px-4 text-xs font-extrabold text-ink transition-colors hover:border-brand hover:text-brand-deep focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft"
        >
          Shoutouts
        </button>
        <button
          type="button"
          onClick={onSettings}
          aria-label="Open profile settings"
          title="Profile settings"
          className="inline-flex size-10 items-center justify-center rounded-full border border-line bg-page text-ink-muted transition-colors hover:border-brand hover:text-brand-deep focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft"
        >
          <Settings size={17} strokeWidth={2.5} aria-hidden />
        </button>
      </div>

    </div>
  );
}
