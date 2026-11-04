import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CalendarDays, Heart, MessageCircle, Send, Share2, Sparkles, Users, WifiOff } from "lucide-react";
import { GistCard } from "../components/feed/GistCard";
import { FollowButton } from "../components/profile/FollowButton";
import { Avatar } from "../components/ui/Avatar";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardBody } from "../components/ui/Card";
import { SchoolTag } from "../components/ui/SchoolBadge";
import { useToast } from "../components/ui/Toast";
import { useAuth } from "../context/AuthContext";
import { describeError } from "../lib/supabase";
import { fetchFeed } from "../services/postsService";
import { fetchPublicProfile } from "../services/profilesService";
import { useAuthGateStore } from "../store/authGateStore";
import { fetchFollowSummary, followUser, unfollowUser, type FollowSummary } from "../services/followsService";
import { springs } from "../theme/tokens";
import type { Post, PublicProfile } from "../types/models";
import { SafeImage } from "../components/common/SafeImage";

/** Facebook-style public student profile: `/profile/:userId`. */
export function PublicProfilePage() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const openAuthGate = useAuthGateStore((state) => state.openAuthGate);

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [followSummary, setFollowSummary] = useState<FollowSummary>({
    followerCount: 0,
    followingCount: 0,
    isFollowing: false,
  });
  const [followBusy, setFollowBusy] = useState(false);

  // A student viewing their own public URL lands on the editable profile page.
  useEffect(() => {
    if (user && userId === user.id) navigate("/profile", { replace: true });
  }, [user, userId, navigate]);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const [nextProfile, nextPosts] = await Promise.all([
        fetchPublicProfile(userId),
        fetchFeed({ authorId: userId, limit: 30 }),
      ]);
      setProfile(nextProfile);
      setPosts(nextPosts);
      if (nextProfile?.isSeed) {
        setFollowSummary({ followerCount: 0, followingCount: 0, isFollowing: false });
      } else {
        try {
          setFollowSummary(await fetchFollowSummary(userId, user?.id));
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
    void load();
  }, [load]);

  const shareProfile = async () => {
    if (!profile) return;
    const url = `${window.location.origin}/profile/${profile.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast("Profile link copied.", "info");
    } catch {
      toast("Could not copy the profile link.", "danger");
    }
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
          <Link to="/" className="mt-4 inline-flex items-center gap-1 text-xs font-extrabold text-brand-deep hover:underline">
            <ArrowLeft size={14} aria-hidden />Back to feed
          </Link>
        </div>
      </div>
    );
  }

  const likesReceived = posts.reduce((sum, post) => sum + post.likeCount, 0);
  const replies = posts.reduce((sum, post) => sum + post.commentCount, 0);
  const joined = new Date(profile.createdAt).toLocaleDateString(undefined, { month: "long", year: "numeric" });

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

      <Card className="relative mt-3 overflow-hidden">
        <div className="relative h-32 w-full overflow-hidden bg-linear-to-br from-[#8B5CF6] via-[#6D28D9] to-[#0F0F11] sm:h-44 md:h-60">
          {profile.coverUrl && (
            <SafeImage
              src={profile.coverUrl}
              alt=""
              className="absolute inset-0 size-full object-cover"
              decoding="async"
            />
          )}
          <div className="absolute inset-0 bg-linear-to-b from-black/20 via-transparent to-black/20" aria-hidden />
          <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-black/45 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.14em] text-white backdrop-blur">
            <Sparkles size={10} strokeWidth={2.8} aria-hidden />
            Public student pass
          </span>
        </div>

        <div className="absolute left-1/2 top-20 z-10 -translate-x-1/2 rounded-full ring-4 ring-card sm:left-6 sm:top-28 sm:translate-x-0 md:top-48">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={springs.bouncy}
          >
            <Avatar name={profile.username} src={profile.avatarUrl} size="2xl" />
          </motion.div>
        </div>
        <CardBody className="relative px-4 pb-5 pt-16 sm:px-6 sm:pt-20">
          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:justify-end">
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                {!profile.isSeed && profile.id !== user?.id && (
                  <FollowButton
                    following={followSummary.isFollowing}
                    loading={followBusy}
                    onToggle={() => void toggleFollow()}
                  />
                )}
                {!profile.isSeed && <Button
                size="sm"
                leftIcon={<Send size={14} strokeWidth={2.6} aria-hidden />}
                onClick={() => navigate(`/shoutouts/create?to=${profile.id}`)}
              >
                Send Paper Plane Shoutout
              </Button>}
              <Button size="sm" variant="outline" leftIcon={<Share2 size={14} strokeWidth={2.5} aria-hidden />} onClick={shareProfile}>
                Share profile
              </Button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-black tracking-tight text-ink">@{profile.username}</h1>
              {profile.fullName && <p className="truncate text-xs font-bold text-ink-muted">{profile.fullName}</p>}
            </div>
            <Badge tone="neutral" className="px-2 py-0.5 text-[9px]">
              <Sparkles size={10} strokeWidth={2.6} aria-hidden />
              {profile.isSeed ? "Synthetic demo" : "Student"}
            </Badge>
          </div>

          <div className="mt-2.5">
            {profile.schoolName ? (
              <Link
                to={profile.schoolId ? `/schools/${profile.schoolId}` : "/schools"}
                className="inline-flex max-w-full items-center gap-2 rounded-full border-2 border-line bg-page py-1 pl-1.5 pr-3.5 transition-colors hover:border-brand"
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
            ) : (
              <span className="text-xs font-semibold text-ink-muted">No SHS community linked yet</span>
            )}
          </div>

          <p className="mt-3 max-w-xl text-sm font-semibold leading-relaxed text-ink-soft">
            {profile.bio || "This student hasn't added a bio yet."}
          </p>

          {profile.classForm && <Badge tone="brand" className="mt-2 px-2 py-0.5 text-[10px]">{profile.classForm}</Badge>}
          <p className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-ink-muted">
            <CalendarDays size={12} strokeWidth={2.5} aria-hidden />
            Joined {joined}
          </p>

          <div className="mt-4 grid grid-cols-5 divide-x divide-line rounded-2xl border-2 border-line bg-page py-3 text-center">
            <div>
              <p className="text-lg font-black tabular-nums text-ink">{posts.length}</p>
              <p className="text-[9px] font-extrabold uppercase tracking-wider text-ink-muted sm:text-[10px]">Gists</p>
            </div>
            <div>
              <p className="text-lg font-black tabular-nums text-ink">{likesReceived}</p>
              <p className="flex items-center justify-center gap-1 text-[9px] font-extrabold uppercase tracking-wider text-ink-muted sm:text-[10px]">
                <Heart size={10} aria-hidden /> Likes
              </p>
            </div>
            <div>
              <p className="text-lg font-black tabular-nums text-ink">{replies}</p>
              <p className="flex items-center justify-center gap-1 text-[9px] font-extrabold uppercase tracking-wider text-ink-muted sm:text-[10px]">
                <MessageCircle size={10} aria-hidden /> Replies
              </p>
            </div>
            <div>
              <p className="text-lg font-black tabular-nums text-ink">{followSummary.followerCount}</p>
              <p className="flex items-center justify-center gap-1 text-[9px] font-extrabold uppercase tracking-wider text-ink-muted sm:text-[10px]">
                <Users size={10} aria-hidden /> Followers
              </p>
            </div>
            <div>
              <p className="text-lg font-black tabular-nums text-ink">{followSummary.followingCount}</p>
              <p className="flex items-center justify-center gap-1 text-[9px] font-extrabold uppercase tracking-wider text-ink-muted sm:text-[10px]">
                <Users size={10} aria-hidden /> Following
              </p>
            </div>
          </div>
        </CardBody>
      </Card>

      <section className="mt-6" aria-labelledby="public-gists-heading">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="public-gists-heading" className="text-sm font-extrabold text-ink sm:text-base">
            Public gists by @{profile.username}
          </h2>
          <span className="text-[10px] font-bold text-ink-muted">{posts.length} posts</span>
        </div>

        {posts.length > 0 ? (
          <div className="space-y-0">
            {posts.map((post) => (
              <GistCard key={post.id} post={post} onRemoved={(postId) => setPosts((prev) => prev.filter((item) => item.id !== postId))} />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border-2 border-dashed border-line px-5 py-12 text-center">
            <Sparkles size={20} className="mx-auto text-brand-deep" aria-hidden />
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
