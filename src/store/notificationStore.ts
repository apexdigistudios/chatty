import { create } from "zustand";
import { describeError } from "../lib/supabase";
import { markNotificationRead, markNotificationsRead, writeSeenAt } from "../lib/notificationReads";
import {
  categoryCounts,
  fetchNotifications,
  subscribeToNotificationEvents,
  unreadCount,
  type AppNotification,
  type NotificationCategory,
} from "../services/notificationsService";
import type { Profile } from "../types/models";

export type NotificationFilter = NotificationCategory | "all";

interface NotificationState {
  items: AppNotification[];
  loading: boolean;
  error: string | null;
  drawerOpen: boolean;
  filter: NotificationFilter;
  /** Increments on every realtime INSERT — drives the bell's attention pulse. */
  livePulse: number;
  /** True while a realtime refresh is in flight (subtle "live" shimmer). */
  syncing: boolean;
  lastSyncAt: string | null;
  /** True only while a realtime channel is actually open for this student. */
  connected: boolean;

  openDrawer: (filter?: NotificationFilter) => void;
  closeDrawer: () => void;
  setFilter: (filter: NotificationFilter) => void;
  load: (profile: Profile | null, options?: { silent?: boolean }) => Promise<void>;
  markRead: (id: string) => void;
  markAllRead: () => void;
  /** Clears everything on sign-out. */
  reset: () => void;
  /** Opens the realtime channel. Returns its cleanup function. */
  connect: (profile: Profile | null) => () => void;
}

const RELOAD_DEBOUNCE_MS = 650;

export const useNotificationStore = create<NotificationState>()((set, get) => ({
  items: [],
  loading: false,
  error: null,
  drawerOpen: false,
  filter: "all",
  livePulse: 0,
  syncing: false,
  lastSyncAt: null,
  connected: false,

  openDrawer: (filter) =>
    set((state) => ({ drawerOpen: true, filter: filter ?? state.filter })),

  closeDrawer: () => set({ drawerOpen: false }),

  setFilter: (filter) => set({ filter }),

  load: async (profile, { silent } = {}) => {
    if (!profile) {
      set({ items: [], loading: false, error: null });
      return;
    }
    if (!silent) set({ loading: true, error: null });
    else set({ syncing: true });
    try {
      const items = await fetchNotifications(profile);
      set({
        items,
        loading: false,
        syncing: false,
        error: null,
        lastSyncAt: new Date().toISOString(),
      });
    } catch (error) {
      set({
        loading: false,
        syncing: false,
        error: describeError(error, "Could not load notifications."),
      });
    }
  },

  markRead: (id) => {
    markNotificationRead(id);
    set((state) => ({
      items: state.items.map((item) => (item.id === id ? { ...item, read: true } : item)),
    }));
  },

  markAllRead: () => {
    const { items } = get();
    const now = Date.now();
    markNotificationsRead(items.map((item) => item.id));
    writeSeenAt(now);
    set((state) => ({ items: state.items.map((item) => ({ ...item, read: true })) }));
  },

  reset: () =>
    set({
      items: [],
      loading: false,
      syncing: false,
      error: null,
      drawerOpen: false,
      lastSyncAt: null,
      connected: false,
    }),

  connect: (profile) => {
    if (!profile) return () => undefined;

    let debounce: number | null = null;
    set({ connected: true });

    const unsubscribe = subscribeToNotificationEvents(
      profile.id,
      () => {
        set((state) => ({ livePulse: state.livePulse + 1 }));
        if (debounce !== null) window.clearTimeout(debounce);
        // Collapse bursts (ten likes in one second) into a single refetch.
        debounce = window.setTimeout(() => {
          debounce = null;
          void get().load(profile, { silent: true });
        }, RELOAD_DEBOUNCE_MS);
      },
      { schoolId: profile.schoolId }
    );

    return () => {
      if (debounce !== null) window.clearTimeout(debounce);
      set({ connected: false, syncing: false });
      unsubscribe();
    };
  },
}));

/* ───────────────────────── Selectors ───────────────────────── */

export const selectUnreadCount = (items: AppNotification[]): number => unreadCount(items);

export const selectCategoryCounts = (
  items: AppNotification[]
): ReturnType<typeof categoryCounts> => categoryCounts(items);

export function selectVisibleNotifications(
  items: AppNotification[],
  filter: NotificationFilter
): AppNotification[] {
  return filter === "all" ? items : items.filter((item) => item.category === filter);
}
