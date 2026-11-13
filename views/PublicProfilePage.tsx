'use client';

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Link, useNavigate, useParams } from "@/lib/router";
import { ArrowLeft, CalendarDays, MessageCircle, Send, Share2, WifiOff } from "lucide-react";
import { BentoPostGrid } from "@/components/feed/BentoPostGrid";
import { FollowButton } from "@/components/profile/FollowButton";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SchoolTag } from "@/components/ui/SchoolBadge";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/context/AuthContext";
import { describeError } from "@/lib/supabase";
import { fetchFeed } from "@/services/postsService";
import { fetchPublicProfile } from "@/services/profilesService";
import { useAuthGateStore } from "@/store/authGateStore";
import { fetchFollowSummary, followUser, unfollowUser, type FollowSummary } from "@/services/followsService";
import { springs } from "@/theme/tokens";
import type { Post, PublicProfile } from "@/types/models";
import { VerifiedBadge } from "@/components/profile/VerifiedBadge";
import { formatCompactNumber } from "@/lib/utils";

/** Facebook-style public student profile: `/profile/:userId`. */
export function PublicProfilePage({
  initialUserId,
  initialProfile,
  initialPosts,
  initialError = null,
}: {
  initialUserId?: string;
  initialProfile?: PublicProfile | null;
  initialPosts?: Post[] | null;
  initialError?: string | null;
}) {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const openAuthGate = useAuthGateStore((state) => state.openAuthGate);

  const [profile, setProfile] = useState<PublicProfile | null>(initialProfile ?? null);
  const [posts, setPosts] = useState<Post[]>(initialPosts ?? []);
  const [loading, setLoading] = useState(initialProfile === undefined && initialPosts === undefined);
  const [error, setError] = useState<string | null>(initialError);
  const [followSummary, setFollowSummary] = useState<FollowSummary>({
    followerCount: 0,
    followingCount: 0,
    isFollowing: false,
  });
  const [followBusy, setFollowBusy] = useState(false);

  // A student viewing their own public URL lands on the editable profile page.
  useEffect(() => {
    if (user && profile?.id === user.id) navigate("/profile", { replace: true });
  }, [user, userId, profile?.id, navigate]);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const nextProfile = await fetchPublicProfile(userId);
      const nextPosts = nextProfile ? await fetchFeed({ authorId: nextProfile.id, limit: 30 }) : [];
      setProfile(nextProfile);
      setPosts(nextPosts);
      if (nextProfile?.isSeed) {
        setFollowSummary({ followerCount: 0, followingCount: 0, isFollowing: false });
      } else {
        try {
          if (nextProfile) setFollowSummary(await fetchFollowSummary(nextProfile.id, user?.id));
        } catch (followError) {
          toast(describeError(followError, "Could not load follow counts."), "danger");
        }
      }
      if (!nextProfile) setError("This student profile does not exist.");
    } catch (err) {
      setError(describeError(err, "Could not load this student profile."));
    } finally {
      setLoading(false);
    }
  }, [userId, user?.id, toast]);

  useEffect(() => {
    if (initialUserId === userId && initialProfile !== undefined) return;
    void load();
  }, [initialProfile, initialUserId, load, userId]);

  useEffect(() => {
    if (initialUserId !== userId || !initialProfile || initialProfile.isSeed) return;
    let active = true;
    void fetchFollowSummary(initialProfile.id, user?.id)
      .then((summary) => active && setFollowSummary(summary))
      .catch((cause) => active && toast(describeError(cause, "Could not load follow counts."), "danger"));
    return () => {
      active = false;
    };
  }, [initialProfile, initialUserId, toast, user?.id, userId]);

  const retryProfile = () => void load();

  const shareProfile = () => {
    if (!profile) return;
    navigate(`/share/${encodeURIComponent(profile.username)}`);
  };

  const toggleFollow = async () => {
    if (!profile || profile.isSeed || followBusy) return;
    if (!user) {
      openAuthGate({
        title: "Follow your SHS community",
        speech: `Create your Gist me student pass to follow @${profile.username} and see their gists first.`,
        returnTo: `/profile/${profile.id}`,
      });
      return;
    }

    setFollowBusy(true);
    try {
      if (followSummary.isFollowing) {
        await unfollowUser(profile.id);
        setFollowSummary((current) => ({
          ...current,
          isFollowing: false,
          followerCount: Math.max(0, current.followerCount - 1),
        }));
      } else {
        await followUser(profile.id);
        setFollowSummary((current) => ({
          ...current,
          isFollowing: true,
          followerCount: current.followerCount + 1,
        }));
      }
    } catch (followError) {
      toast(describeError(followError, "Could not update your follow."), "danger");
    } finally {
      setFollowBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-[740px] min-w-0 px-4 pt-6 sm:px-6">
        <div className="h-40 animate-pulse rounded-3xl border-2 border-line bg-card motion-reduce:animate-none" />
        <div className="mt-4 space-y-3">
          <div className="h-24 animate-pulse rounded-3xl border-2 border-line bg-card" />
          <div className="h-40 animate-pulse rounded-3xl border-2 border-line bg-card" />
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="mx-auto w-full max-w-[740px] min-w-0 px-4 pt-6 sm:px-6">
        <div className="rounded-3xl border-2 border-dashed border-line bg-card px-5 py-12 text-center">
          <WifiOff size={22} className="mx-auto text-ink-muted" aria-hidden />
          <p className="mt-2 text-sm font-extrabold text-ink">{error ?? "Student not found"}</p>
          {error && <Button size="sm" variant="outline" className="mt-4" onClick={retryProfile}>Try again</Button>}
          <Link to="/" className="mt-4 inline-flex items-center gap-1 text-xs font-extrabold text-brand-deep hover:underline">
            <ArrowLeft size={14} aria-hidden />Back to feed
          </Link>
        </div>
      </div>
    );
  }

  const likesReceived = posts.reduce((sum, post) => sum + post.likeCount, 0);
  const joined = new Date(profile.createdAt).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const websiteHref = profile.website ? safeWebsiteUrl(profile.website) : null;

  return (
    <div className="mx-auto w-full max-w-[740px] min-w-0 px-4 pb-10 pt-5 sm:px-6 sm:pt-7 lg:px-5">
      <button
        type="button"
        onClick={() => (window.history.state?.idx > 0 ? navigate(-1) : navigate("/"))}
        className="inline-flex items-center gap-1 text-xs font-extrabold text-ink-muted transition-colors hover:text-brand-deep"
      >
        <ArrowLeft size={14} strokeWidth={2.6} aria-hidden />
        Back
      </button>

      <section aria-label={`${profile.username}'s profile`} className="relative mt-3 min-w-0 border-b border-line pb-5 sm:pb-6">
        <div className="flex min-w-0 flex-col items-center gap-2 text-center sm:flex-row sm:items-start sm:gap-6 sm:text-left">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={springs.bouncy}
            className="shrink-0"
          >
            <Avatar name={profile.username} src={profile.avatarUrl} size="3xl" className="size-20 sm:size-28" />
          </motion.div>

          <div className="w-full min-w-0 flex-1 sm:w-auto">
            <h1 className="flex max-w-full flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-xl font-black tracking-tight text-ink sm:justify-start sm:text-2xl">
              <span className="truncate">@{profile.username}</span>
              <VerifiedBadge
                isVerified={profile.isVerified === true}
                verifiedExpiresAt={profile.verifiedExpiresAt}
                verifiedTitle={profile.verifiedTitle}
                isAdmin={profile.isAdmin}
                role={profile.role}
              />
            </h1>
            <div className="mt-1 flex flex-nowrap items-center justify-center gap-x-1.5 whitespace-nowrap sm:mt-2 sm:justify-start">
              <span className="inline-flex min-h-7 items-center gap-1 text-[10px] font-semibold text-ink-muted sm:min-h-9">
                <strong className="font-black tabular-nums text-ink">{formatCompactNumber(followSummary.followingCount)}</strong>
                <span className="text-[8px] font-extrabold uppercase tracking-tight">Following</span>
              </span>
              <span className="inline-flex min-h-7 items-center gap-1 text-[10px] font-semibold text-ink-muted sm:min-h-9">
                <strong className="font-black tabular-nums text-ink">{formatCompactNumber(followSummary.followerCount)}</strong>
                <span className="text-[8px] font-extrabold uppercase tracking-tight">Followers</span>
              </span>
              <span className="inline-flex min-h-7 items-center gap-1 text-[10px] font-semibold text-ink-muted sm:min-h-9">
                <strong className="font-black tabular-nums text-ink">{formatCompactNumber(likesReceived)}</strong>
                <span className="text-[8px] font-extrabold uppercase tracking-tight">Likes</span>
              </span>
            </div>

            {profile.fullName && <p className="mt-1 truncate text-xs font-bold text-ink-muted">{profile.fullName}</p>}

            <div className="mt-1 flex justify-center sm:mt-3 sm:justify-start">
              {profile.schoolName ? (
                <Link
                  to={profile.schoolId ? `/schools/${profile.schoolId}` : "/schools"}
                  className="inline-flex max-w-full items-center text-left transition-colors hover:text-brand-deep focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft"
                >
                  <SchoolTag
                    schoolId={profile.schoolId}
                    crestUrl={profile.schoolCrest}
                    name={profile.schoolShort ?? profile.schoolName}
                    size="sm"
                    ring
                    nameClassName="text-xs"
                  />
                </Link>
              ) : initialPosts === null && error ? null : (
                <span className="text-xs font-semibold text-ink-muted">No SHS community linked yet</span>
              )}
            </div>

            <div className="mt-2 flex w-full flex-wrap items-center justify-center gap-2 sm:mt-4 sm:justify-start">
              {!profile.isSeed && profile.id !== user?.id && (
                <FollowButton
                  following={followSummary.isFollowing}
                  loading={followBusy}
                  onToggle={() => void toggleFollow()}
                />
              )}
              {!profile.isSeed && (
                <Button
                  size="sm"
                  className="px-3 text-[10px] sm:px-4 sm:text-xs"
                  leftIcon={<Send size={14} strokeWidth={2.6} aria-hidden />}
                  onClick={() => navigate(`/shoutouts/create?to=${profile.id}`)}
                >
                  <span className="sm:hidden">Shoutout</span>
                  <span className="hidden sm:inline">Send Paper Plane Shoutout</span>
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                className="px-3 text-[10px] sm:px-4 sm:text-xs"
                leftIcon={<Share2 size={14} strokeWidth={2.5} aria-hidden />}
                onClick={shareProfile}
              >
                <span className="sm:hidden">Share</span>
                <span className="hidden sm:inline">Share profile</span>
              </Button>
            </div>

            <p className="mt-2 max-w-xl whitespace-pre-wrap text-sm font-semibold leading-relaxed text-ink-soft sm:mt-3">
              {profile.bio || "This student hasn't added a bio yet."}
            </p>
            {websiteHref && (
              <a href={websiteHref} target="_blank" rel="noreferrer" className="mt-2 inline-block max-w-full truncate text-xs font-extrabold text-accent-deep hover:underline">
                {profile.website}
              </a>
            )}

            <div className="mt-2 flex flex-wrap items-center gap-2">
              {profile.classForm && <Badge tone="brand" className="px-2 py-0.5 text-[10px]">{profile.classForm}</Badge>}
              <p className="inline-flex items-center gap-1 text-[11px] font-bold text-ink-muted">
                <CalendarDays size={12} strokeWidth={2.5} aria-hidden />
                Joined {joined}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-6" aria-labelledby="public-gists-heading">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="public-gists-heading" className="text-sm font-extrabold text-ink sm:text-base">
            Public gists by @{profile.username}
          </h2>
          <span className="text-[10px] font-bold text-ink-muted">
            {initialPosts === null && error ? "Unavailable" : `${formatCompactNumber(posts.length)} posts`}
          </span>
        </div>

        {error && initialProfile && initialPosts === null && (
          <div role="alert" className="mb-4 flex items-center gap-3 rounded-2xl border-2 border-danger-soft bg-danger-wash px-3.5 py-3">
            <WifiOff size={16} className="shrink-0 text-danger-deep" aria-hidden />
            <p className="min-w-0 flex-1 text-xs font-semibold text-danger-deep">{error}</p>
            <Button size="sm" variant="outline" onClick={retryProfile}>Retry</Button>
          </div>
        )}

        {posts.length > 0 ? (
          <BentoPostGrid posts={posts} emptyMessage={`When @${profile.username} shares a campus gist it will appear here.`} />
        ) : (
          <div className="rounded-2xl border-2 border-dashed border-line px-5 py-12 text-center">
            <MessageCircle size={20} className="mx-auto text-brand-deep" aria-hidden />
            <p className="mt-2 text-sm font-extrabold text-ink">No public gists yet</p>
            <p className="mx-auto mt-1 max-w-[32ch] text-xs font-semibold leading-relaxed text-ink-muted">
              When @{profile.username} shares a campus gist it will appear here.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

function safeWebsiteUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}
