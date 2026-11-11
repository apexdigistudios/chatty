'use client';

import type { ReactNode } from "react";
import { Pencil, Settings } from "lucide-react";
import { VerifiedBadge } from "@/components/profile/VerifiedBadge";
import { Button } from "@/components/ui/Button";

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
  stats: ReactNode;
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
  stats,
  schoolBadge,
  bio,
  onEdit,
  onSettings,
  onShoutouts,
}: ProfileHeaderProps) {
  return (
    <div className="flex min-w-0 flex-col items-center text-center sm:items-start sm:text-left">
      {fullName && <h1 className="max-w-full truncate text-xl font-black tracking-tight text-ink sm:text-2xl">{fullName}</h1>}
      <p className="mt-0.5 flex max-w-full flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-sm font-bold text-ink-muted sm:mt-1 sm:justify-start">
        <span className="truncate">@{username}</span>
        <VerifiedBadge
          isVerified={isVerified === true}
          verifiedExpiresAt={verifiedExpiresAt}
          verifiedTitle={verifiedTitle}
          isAdmin={isAdmin}
          role={role}
        />
      </p>
      <div className="mt-1">{stats}</div>
      {websiteHref && website && (
        <a
          href={websiteHref}
          target="_blank"
          rel="noreferrer"
          className="mt-1 max-w-full truncate text-xs font-extrabold text-brand-deep hover:underline sm:mt-2"
        >
          {website}
        </a>
      )}
      <div className="mt-1.5 flex max-w-full justify-center sm:mt-3 sm:justify-start">{schoolBadge}</div>

      <div className="mt-2 flex w-full flex-wrap items-center justify-center gap-2 sm:mt-4 sm:justify-start">
        <Button
          type="button"
          onClick={onEdit}
          size="sm"
          variant="primary"
          leftIcon={<Pencil size={14} strokeWidth={2.6} aria-hidden />}
        >
          Edit Profile
        </Button>
        <button
          type="button"
          onClick={onShoutouts}
          className="inline-flex min-h-9 items-center justify-center rounded-xl border-2 border-line bg-card px-3 text-[10px] font-extrabold text-ink shadow-[0_3px_0_var(--border-color)] transition-[transform,border-color,box-shadow,color] hover:-translate-y-0.5 hover:border-brand hover:text-brand-deep hover:shadow-[0_4px_0_var(--brand-edge)] active:translate-y-0.5 active:shadow-[0_1px_0_var(--brand-edge)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft sm:min-h-11 sm:px-4 sm:text-xs"
        >
          Shoutouts
        </button>
        <button
          type="button"
          onClick={onSettings}
          aria-label="Open profile settings"
          title="Profile settings"
          className="inline-flex size-9 items-center justify-center rounded-xl border-2 border-line bg-card text-ink-muted shadow-[0_3px_0_var(--border-color)] transition-[transform,border-color,box-shadow,color] hover:-translate-y-0.5 hover:border-brand hover:text-brand-deep hover:shadow-[0_4px_0_var(--brand-edge)] active:translate-y-0.5 active:shadow-[0_1px_0_var(--brand-edge)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft sm:size-11"
        >
          <Settings size={17} strokeWidth={2.5} aria-hidden />
        </button>
      </div>
      <p className="mt-2 max-w-xl whitespace-pre-wrap text-center text-sm font-semibold leading-relaxed text-ink-soft sm:mt-3 sm:text-left sm:text-[15px]">
        {bio || "No bio yet — tell your campus who you are."}
      </p>
    </div>
  );
}
