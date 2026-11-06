'use client';

import { useEffect, useRef, useState, type FocusEvent, type ReactNode } from "react";
import { Link } from "@/lib/router";
import { Users } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { describeError } from "@/lib/supabase";
import { fetchFollowSummary, followUser, unfollowUser, type FollowSummary } from "@/services/followsService";
import { useAuthGateStore } from "@/store/authGateStore";
import { useToast } from "@/components/ui/Toast";
import { Avatar } from "@/components/ui/Avatar";
import { FollowButton } from "@/components/profile/FollowButton";
import { VerifiedBadge } from "@/components/profile/VerifiedBadge";
import { formatCompactNumber } from "@/lib/utils";

interface ProfileHoverCardProps {
  userId: string;
  username: string;
  fullName?: string | null;
  isVerified?: boolean;
  verifiedExpiresAt?: string | null;
  verifiedTitle?: string | null;
  isAdmin?: boolean;
  role?: string | null;
  avatarUrl: string | null;
  schoolName: string;
  isSeed?: boolean;
  children: ReactNode;
}

const EMPTY_SUMMARY: FollowSummary = { followerCount: 0, followingCount: 0, isFollowing: false };

export function ProfileHoverCard({
  userId,
  username,
  fullName,
  isVerified,
  verifiedExpiresAt,
  verifiedTitle,
  isAdmin,
  role,
  avatarUrl,
  schoolName,
  isSeed = false,
  children,
}: ProfileHoverCardProps) {
  const { user } = useAuth();
  const openAuthGate = useAuthGateStore((state) => state.openAuthGate);
  const { toast } = useToast();
  const containerRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || isSeed || user?.id === userId) return;
    let active = true;
    setLoading(true);
    void fetchFollowSummary(userId, user?.id)
      .then((nextSummary) => {
        if (active) setSummary(nextSummary);
      })
      .catch((error: unknown) => {
        if (active) toast(describeError(error, "Could not load follow details."), "danger");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [isSeed, open, toast, user?.id, userId]);

  const onBlur = (event: FocusEvent<HTMLSpanElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
  };

  const toggleFollow = async () => {
    if (!user) {
      openAuthGate({
        title: "Follow your SHS community",
        speech: `Create your Gist me student pass to follow @${username} and see their gists first.`,
        returnTo: `/profile/${userId}`,
      });
      return;
    }

    setBusy(true);
    try {
      if (summary.isFollowing) {
        await unfollowUser(userId);
        setSummary((current) => ({
          ...current,
          isFollowing: false,
          followerCount: Math.max(0, current.followerCount - 1),
        }));
      } else {
        await followUser(userId);
        setSummary((current) => ({
          ...current,
          isFollowing: true,
          followerCount: current.followerCount + 1,
        }));
      }
    } catch (error) {
      toast(describeError(error, "Could not update your follow."), "danger");
    } finally {
      setBusy(false);
    }
  };

  return (
    <span
      ref={containerRef}
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={onBlur}
    >
      {children}
      {open && (
        <span
          role="group"
          aria-label={`@${username} profile preview`}
          className="absolute left-0 top-full z-70 mt-2 w-72 rounded-2xl border-2 border-line bg-card p-4 text-left shadow-[0_8px_28px_rgba(0,0,0,0.2)]"
        >
          <span className="flex items-start gap-3">
            <Avatar name={username} src={avatarUrl} size="lg" />
            <span className="min-w-0 flex-1">
              <span className="flex min-w-0 items-center gap-1">
                <Link
                  to={`/profile/${userId}`}
                  className="truncate text-sm font-black text-ink hover:text-brand-deep hover:underline"
                >
                  {fullName || `@${username}`}
                </Link>
                <VerifiedBadge
                  isVerified={isVerified}
                  verifiedExpiresAt={verifiedExpiresAt}
                  verifiedTitle={verifiedTitle}
                  isAdmin={isAdmin}
                  role={role}
                />
              </span>
              {fullName && <span className="block truncate text-[10px] font-semibold text-ink-muted">@{username}</span>}
              <span className="mt-0.5 block truncate text-xs font-semibold text-ink-muted">{schoolName}</span>
            </span>
          </span>
          <span className="mt-3 flex items-center gap-1.5 text-xs font-bold text-ink-muted">
            <Users size={13} aria-hidden />
            {formatCompactNumber(summary.followerCount)} followers · {formatCompactNumber(summary.followingCount)} following
          </span>
          {!isSeed && user?.id !== userId && (
            <span className="mt-3 block">
              <FollowButton following={summary.isFollowing} loading={loading || busy} onToggle={() => void toggleFollow()} />
            </span>
          )}
        </span>
      )}
    </span>
  );
}
