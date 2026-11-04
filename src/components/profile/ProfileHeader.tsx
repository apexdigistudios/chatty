import type { ReactNode } from "react";
import { Pencil, Settings, Users } from "lucide-react";

interface ProfileHeaderProps {
  username: string;
  fullName: string | null;
  avatar: ReactNode;
  schoolBadge: ReactNode;
  bio: string;
  gistCount: number;
  followerCount: number;
  followingCount: number;
  onFollowersClick: () => void;
  onFollowingClick: () => void;
  onEdit: () => void;
  onSettings: () => void;
  onShoutouts: () => void;
}

export function ProfileHeader({
  username,
  fullName,
  avatar,
  schoolBadge,
  bio,
  gistCount,
  followerCount,
  followingCount,
  onFollowersClick,
  onFollowingClick,
  onEdit,
  onSettings,
  onShoutouts,
}: ProfileHeaderProps) {
  return (
    <div className="flex min-w-0 flex-col items-center text-center">
      <div className="pt-1">{avatar}</div>
      <h1 className="mt-3 max-w-full truncate text-2xl font-black tracking-tight text-ink sm:text-[28px]">
        {fullName || `@${username}`}
      </h1>
      {fullName && <p className="mt-0.5 truncate text-sm font-bold text-ink-muted">@{username}</p>}
      <div className="mt-3 max-w-full">{schoolBadge}</div>
      <p className="mt-3 max-w-xl text-sm font-semibold leading-relaxed text-ink-soft">
        {bio || "No bio yet — tell your campus who you are."}
      </p>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border-2 border-line bg-card px-4 text-xs font-extrabold text-ink transition-colors hover:border-brand hover:text-brand-deep focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft"
        >
          <Pencil size={14} strokeWidth={2.6} aria-hidden />
          Edit Profile
        </button>
        <button
          type="button"
          onClick={onShoutouts}
          className="inline-flex min-h-11 items-center rounded-xl border-2 border-line bg-card px-4 text-xs font-extrabold text-ink transition-colors hover:border-brand hover:text-brand-deep focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft"
        >
          Shoutouts
        </button>
        <button
          type="button"
          onClick={onSettings}
          aria-label="Open profile settings"
          title="Profile settings"
          className="inline-flex size-11 items-center justify-center rounded-xl border-2 border-line bg-card text-ink-muted transition-colors hover:border-brand hover:text-brand-deep focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft"
        >
          <Settings size={17} strokeWidth={2.5} aria-hidden />
        </button>
      </div>

      <div className="mt-5 grid w-full max-w-md grid-cols-3 divide-x divide-line border-y border-line py-3">
        <div className="px-2">
          <p className="text-lg font-black tabular-nums text-ink">{gistCount}</p>
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-ink-muted">Gists</p>
        </div>
        <button
          type="button"
          onClick={onFollowersClick}
          className="rounded-lg px-2 transition-colors hover:text-brand-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          aria-label={`${followerCount} followers`}
        >
          <p className="text-lg font-black tabular-nums text-ink">{followerCount}</p>
          <p className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider text-ink-muted">
            <Users size={11} aria-hidden /> Followers
          </p>
        </button>
        <button
          type="button"
          onClick={onFollowingClick}
          className="rounded-lg px-2 transition-colors hover:text-brand-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          aria-label={`${followingCount} following`}
        >
          <p className="text-lg font-black tabular-nums text-ink">{followingCount}</p>
          <p className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider text-ink-muted">
            <Users size={11} aria-hidden /> Following
          </p>
        </button>
      </div>
    </div>
  );
}
