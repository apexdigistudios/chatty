'use client';

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Link, useNavigate } from "@/lib/router";
import { ArrowUpRight, BookOpen, Bookmark, BriefcaseBusiness, Check, ChevronDown, EyeOff, Heart, LayoutGrid, Loader2, Lock, LogIn, LogOut, Mailbox, MessageCircle, Monitor, Moon, Plus, ShieldCheck, Sun, Video, X } from "lucide-react";
import { MascotCharacter } from "@/components/auth/MascotCharacter";
import { GistCard } from "@/components/feed/GistCard";
import { BentoPostGrid } from "@/components/feed/BentoPostGrid";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { SchoolBadge } from "@/components/ui/SchoolBadge";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/context/AuthContext";
import { useTheme, type ThemeMode } from "@/context/ThemeContext";
import { describeError } from "@/lib/supabase";
import { isUserGlobalAdmin } from "@/lib/adminAccess";
import { fetchFeed, fetchLikedPosts } from "@/services/postsService";
import { useGistStore } from "@/store/gistStore";
import { springs } from "@/theme/tokens";
import type { Post } from "@/types/models";
import { cn } from "@/utils/cn";
import { PageSpinner } from "@/components/ui/PageSpinner";
import { SafeImage } from "@/components/common/SafeImage";
import { ProfileHeader } from "@/components/profile/ProfileHeader";
import { FollowListModal } from "@/components/profile/FollowListModal";
import { fetchFollowSummary, type FollowSummary } from "@/services/followsService";
import { fetchPostsByIds } from "@/services/postsService";
import { readSavedPostIds, subscribeToSavedPosts } from "@/lib/savedPosts";
import { hasActiveVerification, isGlobalAdminProfile } from "@/lib/verification";
import { formatCompactNumber } from "@/lib/utils";
import { isVideoUrl } from "@/lib/video";

type ProfileTab = "Gists" | "Videos" | "Liked" | "Saved" | "Brand Deals";
const TABS: Array<{ id: ProfileTab; label: string; icon: typeof MessageCircle }> = [
  { id: "Gists", label: "Gists", icon: LayoutGrid },
  { id: "Videos", label: "Videos", icon: Video },
  { id: "Liked", label: "Liked gists", icon: Heart },
  { id: "Saved", label: "Saved gists", icon: Bookmark },
  { id: "Brand Deals", label: "Brand deals", icon: BriefcaseBusiness },
];

const GUIDELINES = [
  { id: "community", title: "SHS Community Guidelines", subtitle: "Healthy inter-school banter, zero bullying", icon: BookOpen, points: ["Friendly NSMQ, inter-co and dining hall banter is welcome — personal attacks are removed by your school's moderators.", "Never post private phone numbers, dormitory details or exam leaks.", "Respect students from every region, school and form."] },
  { id: "confessions", title: "Anonymous Confessions Policy", subtitle: "How identity protection & review work", icon: Lock, points: ["The database strips your nickname and avatar before any confession is readable publicly.", "Every confession passes the global admin queue before publishing.", "Use the report menu on any post to alert moderators."] },
  { id: "safety", title: "Moderation Model", subtitle: "Who keeps your campus clean", icon: ShieldCheck, points: ["The student who founds a school community becomes its primary moderator.", "School moderators handle reports, comments and posts tagged to their campus only.", "Global admins oversee confessions and site-wide escalations."] },
];

/** Signed-in student profile backed by profiles + posts + likes tables. */
export function ProfilePage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, profile, loading: authLoading, setProfile, signOut, isGlobalAdmin } = useAuth();
  const { mode, resolvedTheme, setMode, toggleTheme } = useTheme();
  const schools = useGistStore((state) => state.schools);
  const setComposerIntent = useGistStore((state) => state.setComposerIntent);

  const [tab, setTab] = useState<ProfileTab>("Gists");
  const [myPosts, setMyPosts] = useState<Post[]>([]);
  const [liked, setLiked] = useState<Post[]>([]);
  const [saved, setSaved] = useState<Post[]>([]);
  const [followSummary, setFollowSummary] = useState<FollowSummary>({ followerCount: 0, followingCount: 0, isFollowing: false });
  const [followList, setFollowList] = useState<"followers" | "following" | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [openGuideline, setOpenGuideline] = useState<string | null>(null);

  const mySchool = useMemo(() => schools.find((school) => school.id === profile?.schoolId) ?? null, [schools, profile?.schoolId]);
  const activeVerification = hasActiveVerification({
    isVerified: profile?.isVerified,
    verifiedExpiresAt: profile?.verifiedExpiresAt,
    isAdmin: profile?.isAdmin || isGlobalAdmin,
    role: profile?.role,
  });
  const websiteHref = profile?.website ? safeExternalUrl(profile.website) : null;
  const likesReceived = myPosts.reduce((total, post) => total + post.likeCount, 0);
  const profileTabs = activeVerification ? TABS : TABS.filter(({ id }) => id !== "Brand Deals");

  // Guests are never forcefully redirected; we render an inviting Student Pass gate below.

  const loadActivity = useCallback(async () => {
    if (!user) return;
    setLoadingPosts(true);
    try {
      const [posts, likes, follows] = await Promise.all([
        fetchFeed({ authorId: user.id, includeModerated: true, limit: 30 }),
        fetchLikedPosts(),
        fetchFollowSummary(user.id, user.id),
      ]);
      setMyPosts(posts);
      setLiked(likes);
      setFollowSummary(follows);
    } catch (error) {
      toast(describeError(error), "danger");
    } finally {
      setLoadingPosts(false);
    }
  }, [user, toast]);

  useEffect(() => {
    void loadActivity();
  }, [loadActivity]);

  const loadSaved = useCallback(async () => {
    const ids = readSavedPostIds();
    if (ids.length === 0) {
      setSaved([]);
      return;
    }
    try {
      setSaved(await fetchPostsByIds(ids));
    } catch (error) {
      toast(describeError(error, "Could not load saved gists."), "danger");
    }
  }, [toast]);

  useEffect(() => {
    void loadSaved();
    return subscribeToSavedPosts(() => void loadSaved());
  }, [loadSaved]);

  useEffect(() => {
    if (!settingsOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSettingsOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [settingsOpen]);

  if (authLoading || (user && !profile)) {
    return (
      <div className="mx-auto w-full max-w-[740px] min-w-0 px-4 pt-6 sm:px-6">
        <div className="h-56 animate-pulse rounded-3xl border-2 border-line bg-card motion-reduce:animate-none" />
      </div>
    );
  }

  if (!user || !profile) {
    return (
      <div className="mx-auto w-full max-w-[740px] min-w-0 space-y-4 px-4 pb-10 pt-5 sm:px-6 sm:pt-7">
        <Card className="overflow-hidden">
          <div className="relative h-20 bg-linear-to-r from-[#8B5CF6] via-[#6D28D9] to-[#0F0F11]">
            <span className="absolute right-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white">
              SHS Student Pass
            </span>
          </div>
          <CardBody className="p-5 sm:p-6">
            <MascotCharacter
              outfit="detective"
              badgeLabel="YOUR CAMPUS PASS"
              speech="Ready to go undercover? Claim a secret @nickname and rep your SHS crest in 30 seconds!"
            />

            <div className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <Button
                size="lg"
                fullWidth
                leftIcon={<ArrowUpRight size={17} strokeWidth={2.7} aria-hidden />}
                onClick={() => navigate("/auth?mode=signup&returnTo=%2Fprofile")}
              >
                Create Student Pass
              </Button>
              <Button
                size="lg"
                variant="outline"
                fullWidth
                leftIcon={<LogIn size={16} strokeWidth={2.6} aria-hidden />}
                onClick={() => navigate("/auth?mode=signin&returnTo=%2Fprofile")}
              >
                Log In
              </Button>
            </div>
          </CardBody>
        </Card>

        {/* Guests can still switch Light / Dark / System theme freely */}
        <Card>
          <CardBody className="p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-2xl bg-brand-wash text-brand-deep">
                  {resolvedTheme === "dark" ? (
                    <Moon size={19} strokeWidth={2.5} aria-hidden />
                  ) : (
                    <Sun size={19} strokeWidth={2.5} aria-hidden />
                  )}
                </span>
                <div>
                  <h2 className="text-sm font-extrabold text-ink sm:text-base">
                    Light &amp; dark theme
                  </h2>
                  <p className="text-xs font-semibold text-ink-muted">
                    Currently: {resolvedTheme === "dark" ? "Dark" : "Light"} mode
                  </p>
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={resolvedTheme === "dark"}
                aria-label="Toggle dark mode"
                onClick={toggleTheme}
                className={cn(
                  "relative inline-flex h-8 w-14 shrink-0 items-center rounded-full border-2 p-1 transition-colors",
                  resolvedTheme === "dark"
                    ? "border-brand bg-[#8B5CF6]"
                    : "border-line bg-page"
                )}
              >
                <motion.span
                  layout
                  transition={springs.snappy}
                  className={cn(
                    "flex size-5 items-center justify-center rounded-full",
                    resolvedTheme === "dark"
                      ? "ml-auto bg-white text-[#0F0F11]"
                      : "ml-0 bg-ink text-card"
                  )}
                >
                  {resolvedTheme === "dark" ? (
                    <Moon size={11} strokeWidth={2.8} aria-hidden />
                  ) : (
                    <Sun size={11} strokeWidth={2.8} aria-hidden />
                  )}
                </motion.span>
              </button>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {(
                [
                  { value: "light", label: "Light", icon: Sun },
                  { value: "dark", label: "Dark", icon: Moon },
                  { value: "system", label: "System", icon: Monitor },
                ] as Array<{ value: ThemeMode; label: string; icon: typeof Sun }>
              ).map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setMode(value)}
                  aria-pressed={mode === value}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-xl border-2 py-2 text-xs font-extrabold transition-colors",
                    mode === value
                      ? "border-brand-deep bg-brand-wash text-brand-deep"
                      : "border-line bg-page text-ink-muted hover:border-line-deep hover:text-ink"
                  )}
                >
                  <Icon size={14} strokeWidth={2.5} aria-hidden />
                  {label}
                </button>
              ))}
            </div>
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[740px] min-w-0 px-4 pb-10 pt-5 sm:px-6 sm:pt-7 lg:px-5 xl:px-7">
      <section aria-label="Your profile" className="relative min-w-0 border-b border-line pb-5 sm:pb-6">
        <div className="flex min-w-0 flex-col items-center gap-2 text-center sm:flex-row sm:items-start sm:gap-6 sm:text-left">
          <Avatar
            name={profile.username}
            src={profile.avatarUrl}
            size="3xl"
            className="size-20 sm:size-28"
            viewable
          />
          <div className="w-full min-w-0 flex-1 sm:w-auto">
            <ProfileHeader
              username={profile.username}
              fullName={profile.fullName ?? null}
              isVerified={profile.isVerified}
              verifiedExpiresAt={profile.verifiedExpiresAt}
              verifiedTitle={profile.verifiedTitle}
              isAdmin={profile.isAdmin || isGlobalAdmin}
              role={profile.role}
              websiteHref={websiteHref}
              website={profile.website}
              stats={
                <div className="flex flex-nowrap items-center justify-center gap-x-2 whitespace-nowrap sm:justify-start">
                  <button
                    type="button"
                    onClick={() => setFollowList("following")}
                    aria-label={`${formatCompactNumber(followSummary.followingCount)} following`}
                    className="inline-flex min-h-7 items-center gap-1 rounded-lg text-[10px] font-semibold text-ink-muted transition-colors hover:text-brand-deep focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft sm:min-h-9"
                  >
                    <strong className="font-black tabular-nums text-ink">{formatCompactNumber(followSummary.followingCount)}</strong>
                    <span className="text-[8px] font-extrabold uppercase tracking-tight">Following</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFollowList("followers")}
                    aria-label={`${formatCompactNumber(followSummary.followerCount)} followers`}
                    className="inline-flex min-h-7 items-center gap-1 rounded-lg text-[10px] font-semibold text-ink-muted transition-colors hover:text-brand-deep focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft sm:min-h-9"
                  >
                    <strong className="font-black tabular-nums text-ink">{formatCompactNumber(followSummary.followerCount)}</strong>
                    <span className="text-[8px] font-extrabold uppercase tracking-tight">Followers</span>
                  </button>
                  <span className="inline-flex min-h-7 items-center gap-1 text-[10px] font-semibold text-ink-muted sm:min-h-9">
                    <strong className="font-black tabular-nums text-ink">{formatCompactNumber(likesReceived)}</strong>
                    <span className="text-[8px] font-extrabold uppercase tracking-tight">Likes</span>
                  </span>
                </div>
              }
              schoolBadge={
                mySchool ? (
                  <button
                    type="button"
                    onClick={() => setSettingsOpen(true)}
                    className="inline-flex max-w-full items-center gap-2 text-left transition-colors hover:text-brand-deep focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft"
                  >
                    <SchoolBadge schoolId={mySchool.id} crestUrl={mySchool.crestUrl} name={mySchool.name} size="sm" ring />
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-extrabold text-ink">{mySchool.name}</span>
                      <span className="block truncate text-[10px] font-semibold text-ink-muted">{mySchool.shortName} · {mySchool.region}</span>
                    </span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setSettingsOpen(true)}
                    className="rounded-full border-2 border-dashed border-line px-3 py-1.5 text-xs font-extrabold text-brand-deep hover:border-brand"
                  >
                    Choose your SHS
                  </button>
                )
              }
              bio={profile.bio}
              onEdit={() => navigate("/profile/edit")}
              onSettings={() => setSettingsOpen(true)}
              onShoutouts={() => navigate("/shoutouts")}
              onShare={() => navigate(`/share/${encodeURIComponent(profile.username)}`)}
            />
            <div className="mt-2 flex flex-wrap items-center justify-center gap-2 sm:mt-3 sm:justify-start">
              {profile.classForm && (
                <Badge className="border border-brand/40 bg-brand-wash px-2.5 py-0.5 text-[10px] text-brand-deep">
                  {profile.classForm}
                </Badge>
              )}
            </div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {activeVerification ? (
            <>
              {profile.verifiedExpiresAt && !isGlobalAdminProfile({
                isAdmin: profile.isAdmin || isGlobalAdmin,
                role: profile.role,
              }) && (
                <span className="text-[10px] font-semibold text-ink-muted">
                  Expires {new Date(profile.verifiedExpiresAt).toLocaleDateString()}
                </span>
              )}
            </>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="primary"
              depthColor="var(--verification-button-edge)"
              className="[--verification-button-edge:#0284c7] dark:[--verification-button-edge:#0369a1] rounded-xl bg-sky-400 px-4 py-2 font-medium text-sky-950 transition-colors hover:bg-sky-500 dark:bg-sky-500 dark:text-neutral-950 dark:hover:bg-sky-400"
              leftIcon={<ShieldCheck size={14} strokeWidth={2.6} aria-hidden />}
              onClick={() => navigate("/get-verified")}
            >
              Get Verified
            </Button>
          )}
        </div>

      </section>

      <section className="mt-5 md:hidden" aria-labelledby="profile-quick-access">
        <h2 id="profile-quick-access" className="mb-3 text-sm font-extrabold text-ink">
          Quick access
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <Link
            to="/shoutouts"
            className="group min-w-0 rounded-2xl border-2 border-line bg-card p-3.5 shadow-[0_4px_0_var(--border-color)] outline-none transition-[transform,box-shadow,border-color] duration-150 hover:-translate-y-1 hover:border-brand hover:shadow-[0_6px_0_var(--brand-edge)] active:translate-y-0.5 active:shadow-[0_2px_0_var(--brand-edge)] focus-visible:ring-4 focus-visible:ring-brand-soft"
          >
            <span className="flex items-start justify-between gap-2">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-wash text-brand-deep transition-colors group-hover:bg-[#8B5CF6] group-hover:text-white">
                <Mailbox size={19} strokeWidth={2.5} aria-hidden />
              </span>
              <Badge tone="brand" className="px-2 py-0.5 text-[9px]">
                Campus mail
              </Badge>
            </span>
            <span className="mt-3 flex items-center justify-between gap-1">
              <span className="text-xs font-black text-ink">Digital Shoutouts</span>
              <ArrowUpRight size={14} className="shrink-0 text-brand-deep" aria-hidden />
            </span>
            <span className="mt-1 block text-[11px] font-semibold leading-relaxed text-ink-muted">
              Send a note across campus.
            </span>
          </Link>

          <Link
            to="/confessions"
            className="group min-w-0 rounded-2xl border-2 border-line bg-card p-3.5 shadow-[0_4px_0_var(--border-color)] outline-none transition-[transform,box-shadow,border-color] duration-150 hover:-translate-y-1 hover:border-brand hover:shadow-[0_6px_0_var(--brand-edge)] active:translate-y-0.5 active:shadow-[0_2px_0_var(--brand-edge)] focus-visible:ring-4 focus-visible:ring-brand-soft"
          >
            <span className="flex items-start justify-between gap-2">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-wash text-brand-deep transition-colors group-hover:bg-[#8B5CF6] group-hover:text-white">
                <EyeOff size={19} strokeWidth={2.5} aria-hidden />
              </span>
              <Badge tone="neutral" className="px-2 py-0.5 text-[9px]">
                Anonymous
              </Badge>
            </span>
            <span className="mt-3 flex items-center justify-between gap-1">
              <span className="text-xs font-black text-ink">Confessions Feed</span>
              <ArrowUpRight size={14} className="shrink-0 text-brand-deep" aria-hidden />
            </span>
            <span className="mt-1 block text-[11px] font-semibold leading-relaxed text-ink-muted">
              Read the campus secret corner.
            </span>
          </Link>
        </div>
      </section>

      {isUserGlobalAdmin(user?.email) && (
        <div className="mt-4">
          <Link
            to="/vvip"
            className="group flex min-h-14 items-center justify-between gap-3 rounded-2xl border-2 border-brand/30 bg-brand-wash px-4 py-3 text-brand-deep shadow-[0_3px_0_var(--brand-edge)] transition-[transform,box-shadow,border-color] hover:-translate-y-0.5 hover:border-brand hover:shadow-[0_5px_0_var(--brand-edge)] active:translate-y-0.5 active:shadow-[0_1px_0_var(--brand-edge)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft"
          >
            <span className="flex min-w-0 items-center gap-3">
              <ShieldCheck size={19} strokeWidth={2.5} aria-hidden />
              <span className="truncate text-sm font-black">VVIP Admin Panel</span>
            </span>
            <ArrowUpRight size={17} className="shrink-0 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden />
          </Link>
        </div>
      )}

      <div role="tablist" aria-label="Profile sections" className={cn("mt-5 grid border-b border-line", activeVerification ? "grid-cols-5" : "grid-cols-4")}>
        {profileTabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-label={label}
            aria-selected={tab === id}
            title={label}
            onClick={() => setTab(id)}
            className={cn(
              "relative flex min-h-12 items-center justify-center text-ink-muted transition-colors hover:text-brand-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand",
              tab === id && "text-brand-deep"
            )}
          >
            <Icon size={20} strokeWidth={2.5} aria-hidden />
            <span className="sr-only">{label}</span>
            {tab === id && (
              <motion.span
                layoutId="profile-tab-indicator"
                transition={springs.bouncy}
                className="absolute inset-x-3 -bottom-px h-[3px] rounded-full bg-[#8B5CF6]"
                aria-hidden
              />
            )}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {(tab === "Gists" || tab === "Videos") && (
          <div className="space-y-0">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-extrabold text-ink sm:text-base">{tab === "Videos" ? "Videos" : `Published by @${profile.username}`}</h2>
              <Button size="sm" leftIcon={<Plus size={14} strokeWidth={2.8} aria-hidden />} onClick={() => { setComposerIntent("gist", profile.schoolId); navigate("/create"); }}>New gist</Button>
            </div>
            {(() => {
              const profilePosts = tab === "Videos"
                ? myPosts.filter((post) =>
                    post.mediaType === "video" ||
                    post.mediaTypes?.includes("video") ||
                    post.mediaUrls.some(isVideoUrl)
                  )
                : myPosts;
              return loadingPosts ? <PageSpinner label="Loading posts" className="min-h-48" /> : profilePosts.length > 0 ? <BentoPostGrid posts={profilePosts} /> : (
                <Empty title={tab === "Videos" ? "No videos yet" : "You haven't posted a gist yet"} detail={tab === "Videos" ? "Videos you share with your school will appear here." : "Share campus news, NSMQ banter or photos with your community."} action="Create first gist" onAction={() => { setComposerIntent("gist", profile.schoolId); navigate("/create"); }} />
              );
            })()}
          </div>
        )}

        {tab === "Liked" && (
          <div className="space-y-0">
            <h2 className="text-sm font-extrabold text-ink sm:text-base">Gists you liked ({liked.length})</h2>
            {loadingPosts ? <PageSpinner label="Loading liked posts" className="min-h-48" /> : liked.length > 0 ? liked.map((post) => <GistCard key={post.id} post={post} onRemoved={(postId) => { setMyPosts((prev) => prev.filter((item) => item.id !== postId)); setLiked((prev) => prev.filter((item) => item.id !== postId)); }} />) : (
              <Empty title="No liked gists yet" detail="Tap the heart on any campus gist and it will collect here." action="Browse feed" onAction={() => navigate("/")} />
            )}
          </div>
        )}

        {tab === "Saved" && (
          <div className="space-y-0">
            <h2 className="text-sm font-extrabold text-ink sm:text-base">Saved gists ({saved.length})</h2>
            {saved.length > 0 ? saved.map((post) => <GistCard key={post.id} post={post} onRemoved={(postId) => { setMyPosts((prev) => prev.filter((item) => item.id !== postId)); setLiked((prev) => prev.filter((item) => item.id !== postId)); setSaved((prev) => prev.filter((item) => item.id !== postId)); }} />) : (
              <Empty title="No saved gists yet" detail="Save a gist from its options menu to keep it here." action="Browse feed" onAction={() => navigate("/")} />
            )}
          </div>
        )}

        {tab === "Brand Deals" && activeVerification && (
          <section aria-labelledby="brand-deals-heading" className="rounded-2xl border-2 border-line bg-page p-5 text-center sm:p-7">
            <BriefcaseBusiness size={26} className="mx-auto text-brand-deep" aria-hidden />
            <h2 id="brand-deals-heading" className="mt-3 text-base font-black text-ink">Brand Deals & Partnerships</h2>
            <p className="mx-auto mt-2 max-w-md text-xs font-semibold leading-relaxed text-ink-muted">
              Your verified account has access to this hub. Partnership opportunities will appear here when available.
            </p>
          </section>
        )}

        {settingsOpen && (
          <div
            className="fixed inset-0 z-100 flex items-end justify-center bg-black/55 p-0 backdrop-blur-sm sm:items-center sm:p-4"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setSettingsOpen(false);
            }}
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="profile-settings-title"
              className="flex max-h-[90dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl border-2 border-line bg-card shadow-2xl sm:rounded-3xl"
            >
              <div className="flex items-center justify-between border-b border-line px-4 py-3 sm:px-5">
                <h2 id="profile-settings-title" className="text-base font-black text-ink">Profile settings</h2>
                <button
                  type="button"
                  onClick={() => setSettingsOpen(false)}
                  aria-label="Close profile settings"
                  className="flex size-11 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-page hover:text-ink"
                >
                  <X size={19} aria-hidden />
                </button>
              </div>
              <div className="space-y-4 overflow-y-auto p-4 sm:p-5">
            <Card>
              <CardBody className="p-4 sm:p-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex size-10 items-center justify-center rounded-2xl bg-brand-wash text-brand-deep">{resolvedTheme === "dark" ? <Moon size={19} strokeWidth={2.5} aria-hidden /> : <Sun size={19} strokeWidth={2.5} aria-hidden />}</span>
                    <div><h2 className="text-sm font-extrabold text-ink sm:text-base">Light &amp; dark theme</h2><p className="text-xs font-semibold text-ink-muted">Currently: {resolvedTheme === "dark" ? "Dark" : "Light"} mode</p></div>
                  </div>
                  <button type="button" role="switch" aria-checked={resolvedTheme === "dark"} aria-label="Toggle dark mode" onClick={toggleTheme} className={cn("relative inline-flex h-8 w-14 shrink-0 items-center rounded-full border-2 p-1 transition-colors", resolvedTheme === "dark" ? "border-brand bg-[#8B5CF6]" : "border-line bg-page")}>
                    <motion.span layout transition={springs.snappy} className={cn("flex size-5 items-center justify-center rounded-full", resolvedTheme === "dark" ? "ml-auto bg-white text-[#0F0F11]" : "ml-0 bg-ink text-card")}>{resolvedTheme === "dark" ? <Moon size={11} strokeWidth={2.8} aria-hidden /> : <Sun size={11} strokeWidth={2.8} aria-hidden />}</motion.span>
                  </button>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  {([{ value: "light", label: "Light", icon: Sun }, { value: "dark", label: "Dark", icon: Moon }, { value: "system", label: "System", icon: Monitor }] as Array<{ value: ThemeMode; label: string; icon: typeof Sun }>).map(({ value, label, icon: Icon }) => (
                    <button key={value} type="button" onClick={() => setMode(value)} aria-pressed={mode === value} className={cn("flex items-center justify-center gap-1.5 rounded-xl border-2 py-2 text-xs font-extrabold transition-colors", mode === value ? "border-brand-deep bg-brand-wash text-brand-deep" : "border-line bg-page text-ink-muted hover:border-line-deep hover:text-ink")}>
                      <Icon size={14} strokeWidth={2.5} aria-hidden />{label}
                    </button>
                  ))}
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardBody className="p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="flex items-center gap-1.5 text-sm font-extrabold text-ink sm:text-base">
                      <Lock size={14} strokeWidth={2.7} className="text-brand-deep" aria-hidden />
                      School identity locked
                    </h2>
                    <p className="text-xs font-semibold text-ink-muted">
                      Your SHS badge helps keep campus moderation fair.
                    </p>
                  </div>
                  <Badge tone="brand" className="px-2 py-0.5 text-[9px]">Permanent</Badge>
                </div>

                {mySchool ? (
                  <div className="mt-3 flex items-center gap-3 rounded-2xl border-2 border-line bg-page p-3">
                    <SchoolBadge schoolId={mySchool.id} crestUrl={mySchool.crestUrl} name={mySchool.name} size="lg" ring />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-extrabold text-ink">{mySchool.name}</p>
                      <p className="truncate text-[11px] font-semibold text-ink-muted">{mySchool.shortName} · {mySchool.region}</p>
                    </div>
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-wash text-brand-deep">
                      <Lock size={14} strokeWidth={2.7} aria-hidden />
                    </span>
                  </div>
                ) : (
                  <p className="mt-3 rounded-2xl border-2 border-dashed border-line bg-page px-3 py-3 text-xs font-semibold text-ink-muted">
                    No SHS linked yet. Choose one during onboarding — it becomes permanent afterwards.
                  </p>
                )}

                <p className="mt-3 text-[11px] font-semibold leading-relaxed text-ink-muted">
                  Need a fix? Contact a global admin.
                </p>
              </CardBody>
            </Card>

            <Card>
              <CardBody className="p-4 sm:p-5">
                <div className="flex items-center justify-between gap-3">
                  <div><h2 className="text-sm font-extrabold text-ink sm:text-base">Safety &amp; community guidelines</h2><p className="text-xs font-semibold text-ink-muted">Tap a rule to learn more.</p></div>
                  <Badge tone="success">Protected</Badge>
                </div>
                <div className="mt-3 divide-y-2 divide-line overflow-hidden rounded-2xl border-2 border-line">
                  {GUIDELINES.map((doc) => {
                    const open = openGuideline === doc.id;
                    const Icon = doc.icon;
                    return (
                      <div key={doc.id} className="bg-card">
                        <button type="button" onClick={() => setOpenGuideline((current) => (current === doc.id ? null : doc.id))} aria-expanded={open} className="flex w-full items-center gap-3 px-3.5 py-3 text-left hover:bg-page">
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-wash text-brand-deep"><Icon size={17} strokeWidth={2.5} aria-hidden /></span>
                          <span className="min-w-0 flex-1"><span className="block truncate text-xs font-extrabold text-ink sm:text-[13px]">{doc.title}</span><span className="block truncate text-[11px] font-semibold text-ink-muted">{doc.subtitle}</span></span>
                          <ChevronDown size={16} strokeWidth={2.6} className={cn("shrink-0 text-ink-muted transition-transform", open && "rotate-180 text-brand-deep")} aria-hidden />
                        </button>
                        <AnimatePresence initial={false}>
                          {open && (
                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={springs.gentle} className="overflow-hidden">
                              <ul className="space-y-2 border-t border-line bg-page px-4 py-3">
                                {doc.points.map((point) => <li key={point} className="flex items-start gap-2 text-xs font-semibold leading-relaxed text-ink-soft"><span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand" aria-hidden /><span>{point}</span></li>)}
                              </ul>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </div>
              </CardBody>
            </Card>

            <Button variant="danger" fullWidth leftIcon={<LogOut size={16} strokeWidth={2.6} aria-hidden />} onClick={async () => { await signOut(); navigate("/"); }}>
              Sign out
            </Button>
          </div>
            </section>
          </div>
        )}
      </div>
      {followList && <FollowListModal profileId={profile.id} relation={followList} onClose={() => setFollowList(null)} />}
    </div>
  );
}

function safeExternalUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function Empty({ title, detail, action, onAction }: { title: string; detail: string; action: string; onAction: () => void }) {
  return (
    <div className="rounded-3xl border-2 border-dashed border-line bg-card px-5 py-12 text-center">
      <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-brand-wash text-brand-deep"><MessageCircle size={22} strokeWidth={2.5} aria-hidden /></span>
      <p className="mt-3 text-sm font-extrabold text-ink">{title}</p>
      <p className="mx-auto mt-1 max-w-[34ch] text-xs font-semibold leading-relaxed text-ink-muted">{detail}</p>
      <Button size="sm" className="mt-4" onClick={onAction}>{action}</Button>
    </div>
  );
}
