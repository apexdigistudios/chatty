'use client';

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useDragControls } from "framer-motion";
import {
  ArrowUpRight,
  Bell,
  BellOff,
  CheckCheck,
  ChevronRight,
  Heart,
  Loader2,
  Mailbox,
  MessageCircle,
  Newspaper,
  ShieldAlert,
  Sparkles,
  Wifi,
  X,
  type LucideIcon,
} from "lucide-react";
import { useNavigate } from "@/lib/router";
import { useAuth } from "@/context/AuthContext";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { timeAgoShort } from "@/lib/time";
import { useAuthGateStore } from "@/store/authGateStore";
import { useGistStore } from "@/store/gistStore";
import {
  selectCategoryCounts,
  selectVisibleNotifications,
  useNotificationStore,
  type NotificationFilter,
} from "@/store/notificationStore";
import { CATEGORY_LABELS } from "@/services/notificationsService";
import type { AppNotification, NotificationCategory } from "@/services/notificationsService";
import { springs } from "@/theme/tokens";
import { cn } from "@/utils/cn";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";

const FILTERS: Array<{ id: NotificationFilter; label: string; icon: LucideIcon }> = [
  { id: "all", label: "All", icon: Bell },
  { id: "shoutouts", label: CATEGORY_LABELS.shoutouts, icon: Mailbox },
  { id: "interactions", label: CATEGORY_LABELS.interactions, icon: Heart },
  { id: "campus", label: CATEGORY_LABELS.campus, icon: Newspaper },
];

const KIND_ICON: Record<AppNotification["kind"], LucideIcon> = {
  like: Heart,
  comment: MessageCircle,
  shoutout: Mailbox,
  campus_post: Newspaper,
  safety: ShieldAlert,
};

const KIND_TONE: Record<AppNotification["kind"], string> = {
  like: "bg-danger-wash text-danger",
  comment: "bg-accent-wash text-accent-deep",
  shoutout: "bg-brand-wash text-brand-deep",
  campus_post: "bg-success-wash text-success-deep",
  safety: "bg-warning-wash text-warning-deep",
};

/** Slide-over notification centre: Shoutouts, Interactions and Campus News. */
export function NotificationDrawer() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const openAuthGate = useAuthGateStore((state) => state.openAuthGate);
  const openComments = useGistStore((state) => state.openComments);

  const open = useNotificationStore((state) => state.drawerOpen);
  const closeDrawer = useNotificationStore((state) => state.closeDrawer);
  const items = useNotificationStore((state) => state.items);
  const loading = useNotificationStore((state) => state.loading);
  const syncing = useNotificationStore((state) => state.syncing);
  const error = useNotificationStore((state) => state.error);
  const filter = useNotificationStore((state) => state.filter);
  const setFilter = useNotificationStore((state) => state.setFilter);
  const markRead = useNotificationStore((state) => state.markRead);
  const markAllRead = useNotificationStore((state) => state.markAllRead);
  const load = useNotificationStore((state) => state.load);
  const lastSyncAt = useNotificationStore((state) => state.lastSyncAt);
  const connected = useNotificationStore((state) => state.connected);

  const dragControls = useDragControls();
  const [now, setNow] = useState(() => Date.now());
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 640px)").matches
  );

  // Slide-over from the right on desktop; bottom sheet on phones.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");
    const onChange = (event: MediaQueryListEvent) => setIsDesktop(event.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const counts = useMemo(() => selectCategoryCounts(items), [items]);
  const visible = useMemo(() => selectVisibleNotifications(items, filter), [items, filter]);
  const totalUnread = items.filter((item) => !item.read).length;

  // Keep relative timestamps honest while the drawer sits open.
  useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDrawer();
    };
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, closeDrawer]);

  // Refresh whenever the drawer opens so timestamps and new mail are current.
  useEffect(() => {
    if (open && user && profile) void load(profile, { silent: items.length > 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user?.id]);

  const handleAction = (item: AppNotification) => {
    if (profile) void markRead(item.id, profile.id);
    closeDrawer();

    if (item.kind === "shoutout") {
      navigate("/shoutouts?tab=inbox");
      return;
    }
    if (item.kind === "like") {
      navigate(item.schoolId ? `/schools/${item.schoolId}` : "/");
      return;
    }
    if (item.kind === "safety") {
      navigate("/");
      return;
    }
    if (item.postId) {
      openComments({ type: "post", id: item.postId });
      return;
    }
    navigate(item.schoolId ? `/schools/${item.schoolId}` : "/");
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div
          key="notification-drawer"
          role="dialog"
          aria-modal="true"
          aria-label="Notifications"
          className="fixed inset-0 z-70 flex justify-end"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={closeDrawer}
            className="absolute inset-0 bg-black/55 backdrop-blur-[3px]"
            aria-hidden
          />

          <motion.aside
            initial={isDesktop ? { x: "100%" } : { y: "100%" }}
            animate={isDesktop ? { x: 0 } : { y: 0 }}
            exit={isDesktop ? { x: "100%" } : { y: "100%" }}
            transition={{ type: "spring", stiffness: 340, damping: 34, mass: 0.9 }}
            drag={isDesktop ? "x" : "y"}
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={isDesktop ? { left: 0, right: 0 } : { top: 0, bottom: 0 }}
            dragElastic={isDesktop ? { left: 0, right: 0.4 } : { top: 0, bottom: 0.4 }}
            onDragEnd={(_, info) => {
              const dismissed = isDesktop
                ? info.offset.x > 110 || info.velocity.x > 620
                : info.offset.y > 110 || info.velocity.y > 620;
              if (dismissed) closeDrawer();
            }}
            className="relative z-10 flex h-dvh w-full max-w-[430px] flex-col border-l-2 border-line bg-card text-ink shadow-[-18px_0_50px_-30px_rgba(9,9,11,0.6)] max-sm:h-[88dvh] max-sm:max-w-none max-sm:mt-auto max-sm:rounded-t-[28px] max-sm:border-l-0 max-sm:border-t-2"
          >
            {/* ─── Layered header ─── */}
            <div className="relative shrink-0 overflow-hidden border-b-2 border-line">
              <div
                className="pointer-events-none absolute -right-16 -top-24 size-64 rounded-full opacity-90"
                style={{ background: "radial-gradient(circle, var(--brand-wash), transparent 68%)" }}
                aria-hidden
              />
              <div
                className="pointer-events-none absolute inset-0 opacity-[0.35] dark:opacity-20"
                style={{
                  backgroundImage: "radial-gradient(var(--border-color) 1px, transparent 1px)",
                  backgroundSize: "18px 18px",
                  maskImage: "linear-gradient(to bottom, black, transparent 75%)",
                  WebkitMaskImage: "linear-gradient(to bottom, black, transparent 75%)",
                }}
                aria-hidden
              />

              <div
                className="relative px-4 pb-3 pt-3 sm:px-5"
                style={{ paddingTop: "max(0.85rem, env(safe-area-inset-top))" }}
              >
                <div
                  onPointerDown={(event) => dragControls.start(event)}
                  className="mx-auto mb-3 h-1.5 w-11 cursor-grab touch-none rounded-full bg-line active:cursor-grabbing sm:hidden"
                  aria-hidden
                />

                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-2.5">
                    <BrandLogo className="mt-1 h-8 w-auto max-w-8 shrink-0 object-contain" />
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-brand-deep">
                        <span className="relative flex size-1.5">
                          <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#8B5CF6] opacity-70 motion-reduce:animate-none" aria-hidden />
                          <span className="relative inline-flex size-1.5 rounded-full bg-[#8B5CF6]" />
                        </span>
                        Gist me · live
                      </p>
                      <h2 className="mt-1 text-[28px] font-black leading-none tracking-tight text-ink">
                        Notifications
                      </h2>
                      <p className="mt-1.5 text-xs font-semibold text-ink-muted">
                        {totalUnread > 0
                          ? `${totalUnread} unread across your SHS network`
                          : "You're all caught up"}
                      </p>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.92 }}
                      transition={springs.snappy}
                      onClick={() => profile && void markAllRead(profile.id)}
                      disabled={totalUnread === 0 || !profile}
                      aria-label="Mark all notifications as read"
                      className="flex size-11 items-center justify-center rounded-xl border-2 border-line bg-card text-ink-muted transition-colors hover:border-brand hover:text-brand-deep disabled:opacity-40"
                    >
                      <CheckCheck size={16} strokeWidth={2.6} aria-hidden />
                    </motion.button>
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.9, rotate: 90 }}
                      transition={springs.snappy}
                      onClick={closeDrawer}
                      aria-label="Close notifications"
                      className="flex size-11 items-center justify-center rounded-xl border-2 border-line bg-card text-ink-muted transition-colors hover:border-line-deep hover:text-ink"
                    >
                      <X size={17} strokeWidth={2.7} aria-hidden />
                    </motion.button>
                  </div>
                </div>

                {/* ─── Category tabs ─── */}
                <div
                  className="no-scrollbar mt-3.5 flex gap-1.5 overflow-x-auto rounded-2xl border-2 border-line bg-surface-muted p-1"
                  role="tablist"
                  aria-label="Notification categories"
                >
                  {FILTERS.map(({ id, label, icon: Icon }) => {
                    const selected = filter === id;
                    const unread =
                      id === "all"
                        ? totalUnread
                        : counts[id as NotificationCategory]?.unread ?? 0;
                    return (
                      <button
                        key={id}
                        type="button"
                        role="tab"
                        aria-selected={selected}
                        onClick={() => setFilter(id)}
                        className={cn(
                          "relative z-0 flex min-h-11 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-2.5 text-[11px] font-extrabold transition-colors",
                          selected ? "text-brand-deep" : "text-ink-muted hover:text-ink"
                        )}
                      >
                        {selected && (
                          <motion.span
                            layoutId="notification-tab"
                            transition={springs.bouncy}
                            className="absolute inset-0 -z-10 rounded-xl border border-line bg-card shadow-[0_2px_0_var(--border-color)]"
                            aria-hidden
                          />
                        )}
                        <Icon size={13} strokeWidth={2.6} aria-hidden />
                        <span className="truncate">{label}</span>
                        {unread > 0 && (
                          <span className="flex min-w-[17px] items-center justify-center rounded-full bg-[#8B5CF6] px-1 text-[9px] font-black leading-[17px] text-white">
                            {unread > 99 ? "99+" : unread}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* ─── Scrollable list ─── */}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 sm:px-4">
              {syncing && (
                <div className="mb-2 flex items-center justify-center gap-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-brand-deep">
                  <Loader2 size={12} className="animate-spin" aria-hidden />
                  Syncing new activity
                </div>
              )}

              {error && (
                <div className="mb-3 flex items-center gap-2 rounded-2xl border-2 border-danger-soft bg-danger-wash px-3 py-2.5">
                  <BellOff size={15} className="shrink-0 text-danger-deep" aria-hidden />
                  <p className="min-w-0 flex-1 text-[11px] font-semibold text-danger-deep">{error}</p>
                  <button
                    type="button"
                    onClick={() => profile && void load(profile)}
                    className="shrink-0 text-[11px] font-extrabold text-danger-deep underline"
                  >
                    Retry
                  </button>
                </div>
              )}

              {!user ? (
                <GuestState
                  onSignIn={() => {
                    closeDrawer();
                    openAuthGate({
                      title: "See your campus signals",
                      speech: "Create your student pass to get likes, replies and sealed shoutouts in real time.",
                      returnTo: "/",
                    });
                  }}
                />
              ) : loading && items.length === 0 ? (
                <ListSkeleton />
              ) : visible.length > 0 ? (
                <ul className="space-y-0">
                  {visible.map((item, index) => (
                    <NotificationRow
                      key={item.id}
                      item={item}
                      index={index}
                      now={now}
                      onAction={() => handleAction(item)}
                    />
                  ))}
                </ul>
              ) : (
                <EmptyState filter={filter} />
              )}
            </div>

            {/* ─── Live status footer ─── */}
            <div
              className="flex shrink-0 items-center justify-between gap-2 border-t-2 border-line bg-card px-4 py-2.5"
              style={{ paddingBottom: "max(0.65rem, env(safe-area-inset-bottom))" }}
            >
              <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-muted">
                <Wifi
                  size={12}
                  strokeWidth={2.6}
                  className={connected ? (syncing ? "text-brand-deep" : "text-success") : "text-ink-faint"}
                  aria-hidden
                />
                {!connected
                  ? "Sign in for live updates"
                  : syncing
                    ? "Receiving…"
                    : "Realtime connected"}
              </span>
              <span className="truncate text-[10px] font-semibold text-ink-faint">
                {lastSyncAt ? `Updated ${timeAgoShort(lastSyncAt, now)}` : "Awaiting first sync"}
              </span>
            </div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}

/* ───────────────────────── Row ───────────────────────── */

function NotificationRow({
  item,
  index,
  now,
  onAction,
}: {
  item: AppNotification;
  index: number;
  now: number;
  onAction: () => void;
}) {
  const Icon = KIND_ICON[item.kind];

  return (
    <motion.li
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...springs.gentle, delay: Math.min(index * 0.035, 0.28) }}
      className="list-none"
    >
      <motion.button
        type="button"
        onClick={onAction}
        whileHover={{ x: 3 }}
        whileTap={{ scale: 0.985 }}
        transition={springs.snappy}
        className={cn(
          "group relative flex w-full items-start gap-3 overflow-hidden border-b border-line/60 px-2 py-3 text-left transition-colors last:border-b-0 dark:border-neutral-800/60",
          item.read
            ? "bg-transparent hover:bg-page/70"
            : "bg-brand-wash/45 hover:bg-brand-wash/70"
        )}
      >
        {/* Unread spine */}
        {!item.read && (
          <span className="absolute inset-y-0 left-0 w-1 bg-[#8B5CF6]" aria-hidden />
        )}

        {/* Actor avatar or category medallion */}
        <span className="relative shrink-0">
          {item.actorAvatar ? (
            <Avatar name={item.actorName} src={item.actorAvatar} size="md" />
          ) : (
            <span
              className={cn(
                "flex size-10 items-center justify-center rounded-full ring-2 ring-line",
                KIND_TONE[item.kind]
              )}
              aria-hidden
            >
              <Icon size={17} strokeWidth={2.5} />
            </span>
          )}
          <span
            className={cn(
              "absolute -bottom-0.5 -right-0.5 flex size-5 items-center justify-center rounded-full border-2 border-card",
              KIND_TONE[item.kind]
            )}
            aria-hidden
          >
            <Icon size={10} strokeWidth={3} />
          </span>
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="min-w-0 truncate text-[13px] font-extrabold leading-snug text-ink">
              {item.title}
            </span>
            <span className="shrink-0 text-[10px] font-bold tabular-nums text-ink-muted">
              {timeAgoShort(item.createdAt, now)}
            </span>
          </span>

          <span className="mt-0.5 line-clamp-2 block text-[12px] font-semibold leading-relaxed text-ink-soft">
            {item.body}
          </span>

          <span className="mt-1.5 flex items-center gap-1.5">
            {item.actorSchoolShort && (
              <span className="truncate rounded-full bg-page px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-ink-muted">
                {item.actorSchoolShort}
              </span>
            )}
            {item.highlight && (
              <span className="inline-flex items-center gap-1 rounded-full bg-warning-wash px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-warning-deep">
                <Sparkles size={9} strokeWidth={3} aria-hidden />
                Hot
              </span>
            )}
            {!item.read && (
              <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-brand-deep">
                <span className="size-1.5 animate-pulse rounded-full bg-[#8B5CF6] motion-reduce:animate-none" aria-hidden />
                New
              </span>
            )}
            <ChevronRight
              size={14}
              strokeWidth={2.8}
              className="ml-auto shrink-0 text-ink-faint transition-transform group-hover:translate-x-0.5 group-hover:text-brand-deep"
              aria-hidden
            />
          </span>
        </span>
      </motion.button>
    </motion.li>
  );
}

/* ───────────────────────── States ───────────────────────── */

function ListSkeleton() {
  return (
    <ul className="space-y-2" aria-label="Loading notifications" role="status">
      <span className="sr-only">Loading notifications…</span>
      {Array.from({ length: 5 }, (_, index) => (
        <li
          key={index}
          className="flex items-start gap-3 rounded-2xl border-2 border-line bg-card p-3 motion-safe:animate-pulse"
        >
          <span className="size-10 shrink-0 rounded-full bg-line" />
          <span className="min-w-0 flex-1 space-y-2">
            <span className="block h-3 w-3/5 rounded-full bg-line" />
            <span className="block h-2.5 w-full rounded-full bg-line" />
            <span className="block h-2.5 w-2/5 rounded-full bg-line" />
          </span>
        </li>
      ))}
    </ul>
  );
}

function EmptyState({ filter }: { filter: NotificationFilter }) {
  const copy: Record<NotificationFilter, { title: string; detail: string; icon: LucideIcon }> = {
    all: {
      title: "No signals yet",
      detail: "Likes, replies and sealed shoutouts will land here the moment they happen.",
      icon: Bell,
    },
    shoutouts: {
      title: "No paper planes yet",
      detail: "When another SHS sends you a sealed letter, its wax seal shows up here.",
      icon: Mailbox,
    },
    interactions: {
      title: "No likes or replies yet",
      detail: "Post a gist and your campus will start reacting — you'll see every one here.",
      icon: Heart,
    },
    campus: {
      title: "Quiet on campus",
      detail: "New gists from your SHS appear here. Join a community to start receiving them.",
      icon: Newspaper,
    },
  };
  const { title, detail, icon: Icon } = copy[filter];

  return (
    <div className="flex flex-col items-center rounded-3xl border-2 border-dashed border-line px-5 py-12 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-brand-wash text-brand-deep">
        <Icon size={24} strokeWidth={2.4} aria-hidden />
      </span>
      <p className="mt-3 text-sm font-extrabold text-ink">{title}</p>
      <p className="mx-auto mt-1 max-w-[34ch] text-xs font-semibold leading-relaxed text-ink-muted">
        {detail}
      </p>
    </div>
  );
}

function GuestState({ onSignIn }: { onSignIn: () => void }) {
  return (
    <div className="flex flex-col items-center rounded-3xl border-2 border-dashed border-line px-5 py-12 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-brand-wash text-brand-deep">
        <Bell size={24} strokeWidth={2.4} aria-hidden />
      </span>
      <p className="mt-3 text-sm font-extrabold text-ink">Your signals are private</p>
      <p className="mx-auto mt-1 max-w-[34ch] text-xs font-semibold leading-relaxed text-ink-muted">
        Sign in to see likes, replies and sealed shoutouts addressed to you — updated live.
      </p>
      <Button size="sm" className="mt-4" onClick={onSignIn} leftIcon={<ArrowUpRight size={14} strokeWidth={2.7} aria-hidden />}>
        Create student pass
      </Button>
    </div>
  );
}
