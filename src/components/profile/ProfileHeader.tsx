import type { ReactNode } from "react";
import { Users } from "lucide-react";

interface ProfileHeaderProps {
  username: string;
  fullName: string | null;
  avatar: ReactNode;
  bio: string;
  followerCount: number;
  followingCount: number;
  onFollowersClick: () => void;
  onFollowingClick: () => void;
}

export function ProfileHeader({
  username,
  fullName,
  avatar,
  bio,
  followerCount,
  followingCount,
  onFollowersClick,
  onFollowingClick,
}: ProfileHeaderProps) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-3 text-center sm:flex-row sm:items-start sm:text-left">
      <div className="-mt-28 shrink-0 sm:-mt-32">{avatar}</div>
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-2xl font-black tracking-tight text-ink sm:text-[26px]">
          {fullName || `@${username}`}
        </h1>
        {fullName && <p className="truncate text-xs font-bold text-ink-muted">@{username}</p>}
        <p className="mt-1 text-sm font-semibold leading-relaxed text-ink-soft">
          {bio || "No bio yet — tell your campus who you are."}
        </p>
        <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
          <button
            type="button"
            onClick={onFollowersClick}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line bg-page px-3 text-xs font-extrabold text-ink transition-colors hover:border-brand hover:text-brand-deep"
          >
            <Users size={14} aria-hidden />
            <span className="tabular-nums">{followerCount}</span> Followers
          </button>
          <button
            type="button"
            onClick={onFollowingClick}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line bg-page px-3 text-xs font-extrabold text-ink transition-colors hover:border-brand hover:text-brand-deep"
          >
            <Users size={14} aria-hidden />
            <span className="tabular-nums">{followingCount}</span> Following
          </button>
        </div>
      </div>
    </div>
  );
}
