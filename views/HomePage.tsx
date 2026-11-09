'use client';

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { usePathname } from "next/navigation";
import { ArrowUpRight, CheckCircle2, Flame, Plus, RefreshCw, Sparkles, TrendingUp, WifiOff, X } from "lucide-react";
import { Link, useNavigate } from "@/lib/router";
import { ConfessionCard } from "@/components/feed/ConfessionCard";
import { FeedSkeleton } from "@/components/feed/FeedSkeleton";
import { GistCard } from "@/components/feed/GistCard";
import { Button } from "@/components/ui/Button";
import { SchoolBadge } from "@/components/ui/SchoolBadge";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { useAuthGateStore } from "@/store/authGateStore";
import { useGistStore } from "@/store/gistStore";
import { springs } from "@/theme/tokens";
import { rotateBySeed } from "@/lib/feedRotation";
import { formatCompactNumber } from "@/lib/utils";
import type { Confession, Post } from "@/types/models";

const tabs = ["All SHSs", "Following", "My School", "Confessions"] as const;
type FeedTab = (typeof tabs)[number] | "Trending";

const listVariants = { hidden: { opacity: 1 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } };
const itemVariants = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.22, ease: "easeOut" as const } } };

/** Live feed. Sticky frosted tab switcher, smart trending (>=1,000 likes), guests welcome. */
export function HomePage({
  initialPosts,
  initialConfessions,
  initialTrendingPosts,
  initialTrendingFallback,
  initialPostsError = null,
  initialConfessionsError = null,
}: {
  initialPosts?: Post[] | null;
  initialConfessions?: Confession[] | null;
  initialTrendingPosts?: Post[] | null;
  initialTrendingFallback?: Post[] | null;
  initialPostsError?: string | null;
  initialConfessionsError?: string | null;
}) {
  const navigate = useNavigate();
  const pathname = usePathname();
  const { user, profile } = useAuth();
  const openAuthGate = useAuthGateStore((state) => state.openAuthGate);

  const posts = useGistStore((state) => state.posts);
  const followingPosts = useGistStore((state) => state.followingPosts);
  const feedLoading = useGistStore((state) => state.feedLoading);
  const followingLoading = useGistStore((state) => state.followingLoading);
  const feedHasLoaded = useGistStore((state) => state.feedHasLoaded);
  const followingHasLoaded = useGistStore((state) => state.followingHasLoaded);
  const feedLoadingMore = useGistStore((state) => state.feedLoadingMore);
  const followingLoadingMore = useGistStore((state) => state.followingLoadingMore);
  const feedError = useGistStore((state) => state.feedError);
  const feedHasMore = useGistStore((state) => state.feedHasMore);
  const followingHasMore = useGistStore((state) => state.followingHasMore);
  const feedSchoolId = useGistStore((state) => state.feedSchoolId);
  const setFeedSchool = useGistStore((state) => state.setFeedSchool);
  const loadFeed = useGistStore((state) => state.loadFeed);
  const loadFollowingFeed = useGistStore((state) => state.loadFollowingFeed);
  const loadMoreFeed = useGistStore((state) => state.loadMoreFeed);
  const loadMoreFollowingFeed = useGistStore((state) => state.loadMoreFollowingFeed);
  const loadTrending = useGistStore((state) => state.loadTrending);
  const trendingPosts = useGistStore((state) => state.trendingPosts);
  const trendingFallback = useGistStore((state) => state.trendingFallback);
  const trendingLoading = useGistStore((state) => state.trendingLoading);
  const trendingHasLoaded = useGistStore((state) => state.trendingHasLoaded);
  const trendingThreshold = useGistStore((state) => state.trendingThreshold);
  const schools = useGistStore((state) => state.schools);
  const confessions = useGistStore((state) => state.confessions);
  const confessionsLoading = useGistStore((state) => state.confessionsLoading);
  const confessionsHasLoaded = useGistStore((state) => state.confessionsHasLoaded);
  const confessionsError = useGistStore((state) => state.confessionsError);
  const loadConfessions = useGistStore((state) => state.loadConfessions);
  const setComposerIntent = useGistStore((state) => state.setComposerIntent);
  const hydrateInitialPublicContent = useGistStore((state) => state.hydrateInitialPublicContent);

  const displayPosts = feedHasLoaded ? posts : feedSchoolId ? posts : initialPosts ?? posts;
  const displayConfessions = confessionsHasLoaded ? confessions : initialConfessions ?? confessions;
  const displayTrendingPosts = trendingHasLoaded ? trendingPosts : initialTrendingPosts ?? trendingPosts;
  const displayTrendingFallback = trendingHasLoaded ? trendingFallback : initialTrendingFallback ?? trendingFallback;
  const trendingInitialized = trendingHasLoaded || initialTrendingPosts != null;
  const feedInitialized = feedHasLoaded || initialPosts != null;
  const confessionsInitialized = confessionsHasLoaded || initialConfessions != null;
  const publicFeedError = feedError ?? (!feedHasLoaded ? initialPostsError : null);
  const publicConfessionsError = confessionsError ?? (!confessionsHasLoaded ? initialConfessionsError : null);
  const [activeTab, setActiveTab] = useState<FeedTab>(
    pathname === "/trending" ? "Trending" : "All SHSs"
  );
  const [refreshing, setRefreshing] = useState(false);
  const [rotationSeed, setRotationSeed] = useState(0);

  const feedSchool = schools.find((school) => school.id === feedSchoolId) ?? null;
  const mySchool = schools.find((school) => school.id === profile?.schoolId) ?? null;
  const headerSchool = feedSchool ?? mySchool;

  useEffect(() => {
    hydrateInitialPublicContent(initialPosts, initialConfessions, initialTrendingPosts, initialTrendingFallback);
  }, [hydrateInitialPublicContent, initialPosts, initialConfessions, initialTrendingFallback, initialTrendingPosts]);

  useEffect(() => {
    const channel = supabase
      .channel("feed-posts")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "posts" }, () => {
        void loadFeed({ silent: true });
        void loadFollowingFeed({ silent: true });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadFeed, loadFollowingFeed]);

  useEffect(() => {
    if (activeTab === "Following" && followingPosts.length === 0 && !followingLoading) void loadFollowingFeed();
    if (
      (activeTab === "All SHSs" || activeTab === "My School" || activeTab === "Confessions") &&
      displayConfessions.length === 0 &&
      !confessionsLoading
    ) void loadConfessions();
    if (activeTab === "Trending" && initialTrendingPosts == null && trendingPosts.length === 0 && trendingFallback.length === 0 && !trendingLoading) void loadTrending();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setRotationSeed(Math.random());
    try {
      await Promise.all([
        loadFeed(),
        activeTab === "Following" ? loadFollowingFeed() : Promise.resolve(),
        ["All SHSs", "My School", "Confessions"].includes(activeTab) ? loadConfessions() : Promise.resolve(),
        activeTab === "Trending" ? loadTrending() : Promise.resolve(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [activeTab, loadFeed, loadFollowingFeed, loadConfessions, loadTrending]);

  const visiblePosts = useMemo(() => {
    if (activeTab === "My School") {
      const schoolId = profile?.schoolId;
      return schoolId
        ? displayPosts.filter((post) =>
            post.schoolId === schoolId ||
            (post.spotlightStatus === "active" &&
              (!post.spotlightTargetSchoolIds ||
                post.spotlightTargetSchoolIds.length === 0 ||
                post.spotlightTargetSchoolIds.includes(schoolId)))
          )
        : [];
    }
    return activeTab === "Following" ? followingPosts : displayPosts;
  }, [activeTab, displayPosts, followingPosts, profile?.schoolId]);
  const mixedItems = useMemo(() => {
    const includeConfessions = activeTab === "All SHSs" || activeTab === "My School";
    const schoolFilter = activeTab === "My School" ? profile?.schoolId : feedSchoolId;
    const items: Array<
      | { kind: "post"; id: string; createdAt: string; post: (typeof visiblePosts)[number] }
      | { kind: "confession"; id: string; createdAt: string; confession: (typeof displayConfessions)[number] }
    > = visiblePosts.map((post) => ({ kind: "post", id: post.id, createdAt: post.createdAt, post }));
    if (includeConfessions && !(activeTab === "My School" && !profile?.schoolId)) {
      for (const confession of displayConfessions) {
        if (schoolFilter && confession.schoolId !== schoolFilter && confession.schoolId !== null) continue;
        items.push({
          kind: "confession",
          id: confession.id,
          createdAt: confession.publishedAt ?? confession.createdAt,
          confession,
        });
      }
    }
    items.sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
    return rotateBySeed(items, rotationSeed);
  }, [activeTab, displayConfessions, feedSchoolId, profile?.schoolId, rotationSeed, visiblePosts]);

  const startComposing = (type: "gist" | "confession") => {
    const returnTo = type === "confession" ? "/confessions/create" : "/create";
    if (!user) {
      if (type === "gist") setComposerIntent(type, feedSchoolId ?? null);
      openAuthGate({
        title: type === "confession" ? "Drop an Anonymous Confession!" : "Share a Campus Gist!",
        speech:
          type === "confession"
            ? "Time to go undercover! Create your secret student pass in 30 seconds to submit confessions."
            : "Grab your secret @nickname and SHS crest in 30 seconds to post to the campus feed!",
        outfit: type === "confession" ? "detective" : "shs_welcome",
        returnTo,
        prefillSchoolId: feedSchoolId ?? null,
      });
      return;
    }
    if (type === "gist") setComposerIntent(type, feedSchoolId ?? profile?.schoolId ?? null);
    navigate(returnTo);
  };

  const showingConfessions = activeTab === "Confessions";
  const showingTrending = activeTab === "Trending";
  const showingFollowing = activeTab === "Following";
  const feedPending = !feedInitialized && !feedError && !initialPostsError;
  const confessionsPending = !confessionsInitialized && !confessionsError && !initialConfessionsError;
  const loading = showingConfessions
    ? confessionsPending || (confessionsLoading && displayConfessions.length === 0 && !initialConfessionsError)
    : showingFollowing
      ? (!followingHasLoaded && !feedError) || (followingLoading && followingPosts.length === 0)
      : showingTrending
        ? (!trendingInitialized && !publicFeedError) ||
          (trendingLoading && displayTrendingPosts.length === 0 && !initialPostsError)
        : feedPending || confessionsPending ||
          (feedLoading && displayPosts.length === 0 && !initialPostsError) ||
          (confessionsLoading && displayConfessions.length === 0 && !initialConfessionsError);
  const canShowEmptyState = showingConfessions
    ? (confessionsHasLoaded || initialConfessions != null) && !publicConfessionsError
    : showingFollowing
      ? followingHasLoaded
      : showingTrending
        ? trendingInitialized
        : activeTab === "My School" && !profile?.schoolId
          ? true
          : (feedHasLoaded || initialPosts != null) &&
            (!(activeTab === "All SHSs" || activeTab === "My School") || confessionsHasLoaded || initialConfessions != null) &&
            !publicFeedError && (!(activeTab === "All SHSs" || activeTab === "My School") || !publicConfessionsError);
  const visibleHasMore = showingFollowing ? followingHasMore : feedHasMore;

  return (
    <div className="mx-auto w-full max-w-[720px] min-w-0 px-0 pt-0 sm:px-6 sm:pt-7">
      <div className="sticky top-[calc(3.4375rem+max(0.625rem,env(safe-area-inset-top)))] z-40 border-b border-line/60 bg-white/80 px-3 py-1.5 backdrop-blur-md dark:border-neutral-800/50 dark:bg-neutral-950/80 sm:px-4 md:top-[calc(3.5625rem+max(0.625rem,env(safe-area-inset-top)))]">
        <div className="mx-auto grid w-full max-w-[720px] grid-cols-4 items-center" role="tablist" aria-label="Choose feed">
          {tabs.map((tab) => {
            const selected = activeTab === tab;
            return (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setActiveTab(tab)}
                className={`relative flex min-h-11 items-center justify-center px-1 text-[10px] font-extrabold leading-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand sm:text-xs ${
                  selected ? "text-brand-deep" : "text-ink-muted hover:text-ink"
                }`}
              >
                {selected && (
                  <motion.span
                    layoutId="feed-tab"
                    transition={springs.bouncy}
                    className="absolute inset-x-1 bottom-0 h-0.5 rounded-full bg-brand"
                    aria-hidden
                  />
                )}
                <span className="relative line-clamp-2">{tab}</span>
              </button>
            );
          })}
        </div>
      </div>

      <header className="relative mx-4 mt-4 overflow-hidden rounded-[26px] border-2 border-line bg-card p-4 shadow-[0_4px_0_var(--border-color)] sm:mx-0 sm:mt-0 sm:p-5">
        <span className="pointer-events-none absolute -right-12 -top-16 size-48 rounded-full opacity-80" style={{ background: "radial-gradient(circle, var(--brand-wash), transparent 70%)" }} aria-hidden />
        <div className="relative flex items-start gap-3">
          <SchoolBadge schoolId={headerSchool?.id} crestUrl={headerSchool?.crestUrl} name={headerSchool?.name ?? "Gist me"} size="xl" ring />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-brand-deep">
              <Sparkles size={12} strokeWidth={2.8} aria-hidden />
              Ghana SHS community
            </p>
            <h1 className="mt-1 truncate text-[24px] font-black leading-tight tracking-tight text-ink sm:text-[28px]">
              {feedSchool ? feedSchool.shortName : "Your Feed"}
            </h1>
            <p className="mt-0.5 truncate text-xs font-semibold text-ink-muted">
              {headerSchool ? `${headerSchool.name} · ${headerSchool.region}` : "Live gist from every campus"}
            </p>
          </div>
          <motion.button
            type="button"
            whileTap={{ rotate: -45, scale: 0.9 }}
            transition={springs.snappy}
            onClick={refresh}
            disabled={refreshing}
            aria-label="Refresh feed"
            className="flex size-11 shrink-0 items-center justify-center rounded-2xl border-2 border-line bg-card text-ink-muted transition-colors hover:border-brand hover:text-brand-deep disabled:opacity-60"
          >
            <RefreshCw size={17} strokeWidth={2.5} className={refreshing ? "animate-spin" : ""} aria-hidden />
          </motion.button>
        </div>

        <div className="relative mt-3.5 flex flex-wrap items-center justify-between gap-2 border-t-2 border-line pt-3.5">
          {user && profile ? (
            <>
              <p className="min-w-0 flex-1 truncate text-xs font-semibold text-ink-muted">
                Posting as <span className="font-extrabold text-ink">@{profile.username}</span>
                {mySchool ? ` · ${mySchool.shortName}` : " · no SHS yet"}
              </p>
              <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-ink-muted">
                {headerSchool ? `${formatCompactNumber(headerSchool.memberCount)} students` : `${formatCompactNumber(schools.length)} communities`}
              </span>
            </>
          ) : (
            <>
              <p className="min-w-0 flex-1 text-xs font-bold text-ink-muted">
                Browsing as guest — join your SHS in 30s to post &amp; reply!
              </p>
              <div className="flex min-w-0 flex-wrap shrink-0 items-center gap-1.5">
                <Link to="/auth?mode=signin" className="inline-flex min-h-11 items-center rounded-xl border-2 border-line bg-page px-2.5 py-1.5 text-[10px] font-extrabold uppercase tracking-wider text-ink transition-colors hover:border-brand hover:text-brand-deep">
                  Log in
                </Link>
                <Link to="/auth?mode=signup" className="inline-flex min-h-11 items-center rounded-xl bg-[#8B5CF6] px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-wider text-white shadow-[0_3px_0_#5B21B6] transition-transform hover:bg-[#7C3AED] active:translate-y-0.5">
                  Get Started
                </Link>
              </div>
            </>
          )}
        </div>
      </header>

      <button
        type="button"
        onClick={() => startComposing("gist")}
        className="mx-4 mt-5 flex min-h-[58px] w-[calc(100%-2rem)] items-center gap-3 rounded-2xl border-2 border-line bg-card px-3.5 py-2.5 text-left shadow-[0_3px_0_var(--border-color)] transition-colors hover:border-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft sm:mx-0 sm:w-full sm:px-4"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-deep text-brand-contrast shadow-[0_3px_0_var(--brand-edge)]">
          <Plus size={19} strokeWidth={3} aria-hidden />
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink-muted">Share a gist with your school…</span>
        <span className="hidden rounded-lg bg-brand-wash px-2 py-1 text-[10px] font-extrabold text-brand-deep sm:inline">Post</span>
      </button>

      {feedSchool && (
        <div className="mx-4 mt-3 flex items-center gap-2 rounded-2xl border-2 border-brand bg-brand-wash px-3 py-2 sm:mx-0">
          <p className="min-w-0 flex-1 truncate text-xs font-extrabold text-brand-deep">Showing gists from {feedSchool.name}</p>
          <button type="button" onClick={() => setFeedSchool(null)} aria-label="Clear school filter" className="flex size-11 shrink-0 items-center justify-center rounded-lg text-brand-deep hover:bg-card">
            <X size={13} strokeWidth={2.8} aria-hidden />
          </button>
        </div>
      )}

      <div className="mx-4 mb-3 mt-4 flex items-center justify-between gap-3 sm:mx-0">
        <h2 className="text-sm font-extrabold text-ink sm:text-base" aria-live="polite">
          {showingTrending ? "Smart trending" : activeTab === "All SHSs" ? "For you" : activeTab}
        </h2>
        {showingConfessions ? (
          <Link to="/confessions" className="inline-flex shrink-0 items-center gap-1 rounded-xl px-2 py-1 text-[10px] font-extrabold uppercase tracking-wider text-brand-deep hover:bg-brand-wash">
            Confessions portal <ArrowUpRight size={13} strokeWidth={2.6} aria-hidden />
          </Link>
        ) : (feedHasLoaded || initialPosts != null) && visiblePosts.length > 0 ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-ink-muted sm:text-xs">
            {showingTrending && <Flame size={11} className="text-warning" aria-hidden />}
            {showingTrending
              ? `≥ ${formatCompactNumber(trendingThreshold)} likes`
              : `${visiblePosts.length} loaded`}
          </span>
        ) : null}
      </div>

      {publicFeedError && !showingConfessions && (
        <div className="mx-4 mb-4 flex items-center gap-3 rounded-2xl border-2 border-danger-soft bg-danger-wash px-3.5 py-3 sm:mx-0">
          <WifiOff size={16} className="shrink-0 text-danger-deep" aria-hidden />
          <p className="min-w-0 flex-1 text-xs font-semibold text-danger-deep">{publicFeedError}</p>
          <Button size="sm" variant="outline" onClick={() => void loadFeed()}>Retry</Button>
        </div>
      )}
      {publicConfessionsError && (activeTab === "All SHSs" || activeTab === "My School" || showingConfessions) && (
        <div role="alert" className="mx-4 mb-4 rounded-2xl border-2 border-danger-soft bg-danger-wash px-3.5 py-3 text-xs font-semibold text-danger-deep sm:mx-0">
          {publicConfessionsError}
        </div>
      )}

      <AnimatePresence mode="wait" initial={false}>
        {loading ? (
          <motion.div key="skeleton" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <FeedSkeleton count={3} />
          </motion.div>
        ) : (
          <motion.div
            key={`${activeTab}-${feedSchoolId ?? "all"}`}
            variants={listVariants}
            initial="hidden"
            animate="show"
            exit={{ opacity: 0, y: -4 }}
            className="space-y-0"
          >
            {showingConfessions ? (
              displayConfessions.length > 0 ? (
                displayConfessions.map((confession) => (
                  <motion.div key={confession.id} variants={itemVariants}>
                    <ConfessionCard confession={confession} />
                  </motion.div>
                ))
              ) : (confessionsHasLoaded || initialConfessions != null) && !publicConfessionsError ? (
                <EmptyFeed title="No approved confessions yet" detail="Approved confessions from the global queue land here." action="Write a confession" onAction={() => startComposing("confession")} />
              ) : null
            ) : showingTrending ? (
              displayTrendingPosts.length > 0 ? (
                displayTrendingPosts.map((post) => (
                  <motion.div key={post.id} variants={itemVariants}>
                    <GistCard post={post} />
                  </motion.div>
                ))
              ) : trendingInitialized ? (
                <>
                  <div className="rounded-2xl border-2 border-dashed border-warning-soft bg-warning-wash/60 px-4 py-6 text-center">
                    <span className="mx-auto flex size-10 items-center justify-center rounded-2xl bg-warning-wash text-warning-deep">
                      <TrendingUp size={20} strokeWidth={2.5} aria-hidden />
                    </span>
                    <p className="mt-2 text-sm font-extrabold text-ink">Nothing has crossed {formatCompactNumber(trendingThreshold)} likes yet</p>
                    <p className="mx-auto mt-1 max-w-[36ch] text-xs font-semibold leading-relaxed text-ink-muted">
                      Trending only promotes gists with {formatCompactNumber(trendingThreshold)}+ likes. Below are the campus favourites right now.
                    </p>
                  </div>
                  {displayTrendingFallback.map((post) => (
                    <motion.div key={post.id} variants={itemVariants}>
                      <GistCard post={post} />
                    </motion.div>
                  ))}
                </>
              ) : null
            ) : mixedItems.length > 0 ? (
              mixedItems.map((item) => (
                <motion.div key={`${item.kind}:${item.id}`} variants={itemVariants}>
                  {item.kind === "post"
                    ? <GistCard post={item.post} />
                    : <ConfessionCard confession={item.confession} />}
                </motion.div>
              ))
            ) : visiblePosts.length > 0 ? (
              visiblePosts.map((post) => (
                <motion.div key={post.id} variants={itemVariants}>
                  <GistCard post={post} />
                </motion.div>
              ))
            ) : feedHasLoaded && !feedHasMore && !showingFollowing && activeTab !== "My School" ? (
              <CaughtUpFeed />
            ) : canShowEmptyState ? (
              <EmptyFeed
                title={
                  activeTab === "My School" && !profile?.schoolId
                    ? "Pick your school first"
                    : showingFollowing && !user
                      ? "Sign in to build your Following feed"
                      : "Nothing here just yet"
                }
                detail={
                  activeTab === "My School" && !profile?.schoolId
                    ? "Your SHS identity is set during onboarding — browse communities to see their feeds."
                    : showingFollowing
                      ? "Follow students from their profiles and their newest gists will appear here."
                      : feedSchool
                        ? `No gists from ${feedSchool.name} yet.`
                        : "Be the first to share the gist of the day."
                }
                action={
                  activeTab === "My School" && !profile?.schoolId
                    ? "Browse schools"
                    : showingFollowing && !user
                      ? "Get started"
                      : showingFollowing
                        ? "Browse gists"
                      : "Write a gist"
                }
                onAction={() => {
                  if (activeTab === "My School" && !profile?.schoolId) navigate("/schools");
                  else if (showingFollowing && !user) navigate("/auth?mode=signup");
                  else if (showingFollowing) navigate("/explore");
                  else startComposing("gist");
                }}
              />
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>

      {!showingConfessions && !showingTrending && !loading && !showingFollowing && activeTab !== "My School" && visibleHasMore && visiblePosts.length > 0 && (
        <div className="pb-8 pt-5">
          <Button variant="outline" fullWidth loading={feedLoadingMore} onClick={() => void loadMoreFeed()}>
            {feedLoadingMore ? "Loading more gists" : "Load more gists"}
          </Button>
        </div>
      )}
      {!showingConfessions && !showingTrending && showingFollowing && !loading && visibleHasMore && visiblePosts.length > 0 && (
        <div className="pb-8 pt-5">
          <Button variant="outline" fullWidth loading={followingLoadingMore} onClick={() => void loadMoreFollowingFeed()}>
            {followingLoadingMore ? "Loading more gists" : "Load more gists"}
          </Button>
        </div>
      )}
      {!showingConfessions && !loading && ((showingTrending && trendingPosts.length > 0) || (!visibleHasMore && visiblePosts.length > 0)) && (
        <p className="pb-8 pt-6 text-center text-xs font-semibold text-ink-muted">You&apos;re all caught up!</p>
      )}
    </div>
  );
}

function EmptyFeed({ title, detail, action, onAction }: { title: string; detail: string; action: string; onAction: () => void }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-line px-5 py-12 text-center">
      <p className="text-sm font-extrabold text-ink">{title}</p>
      <p className="mx-auto mt-1 max-w-[32ch] text-xs font-semibold leading-relaxed text-ink-muted">{detail}</p>
      <Button size="sm" variant="outline" className="mt-4" onClick={onAction}>{action}</Button>
    </div>
  );
}

function CaughtUpFeed() {
  return (
    <div className="mx-4 flex flex-col items-center rounded-2xl border-2 border-dashed border-line bg-card px-5 py-10 text-center sm:mx-0">
      <CheckCircle2 size={26} className="text-success-deep" aria-hidden />
      <p className="mt-2 text-sm font-extrabold text-ink">You&apos;re all caught up!</p>
      <p className="mt-1 text-xs font-semibold text-ink-muted">New gists will show up here.</p>
    </div>
  );
}
