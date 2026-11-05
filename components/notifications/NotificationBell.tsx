'use client';

import { useEffect } from "react";
import { motion, useAnimationControls } from "framer-motion";
import { Bell } from "lucide-react";
import { selectUnreadCount, useNotificationStore } from "@/store/notificationStore";
import { springs } from "@/theme/tokens";

/**
 * Persistent header bell with a reactive Signature Purple unread badge.
 * Rings whenever a realtime INSERT lands.
 */
export function NotificationBell() {
  const openDrawer = useNotificationStore((state) => state.openDrawer);
  const items = useNotificationStore((state) => state.items);
  const livePulse = useNotificationStore((state) => state.livePulse);
  const syncing = useNotificationStore((state) => state.syncing);
  const controls = useAnimationControls();

  const unread = selectUnreadCount(items);

  // Ring the bell on incoming realtime activity.
  useEffect(() => {
    if (livePulse === 0) return;
    void controls.start({
      rotate: [0, -13, 11, -7, 4, 0],
      scale: [1, 1.1, 1.04, 1],
      transition: { duration: 0.62, ease: "easeInOut" },
    });
  }, [livePulse, controls]);

  return (
    <motion.button
      type="button"
      onClick={() => openDrawer()}
      animate={controls}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.9 }}
      transition={springs.snappy}
      aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
      aria-haspopup="dialog"
      className="relative flex size-11 shrink-0 items-center justify-center rounded-2xl border-2 border-line bg-card text-ink transition-colors hover:border-brand hover:text-brand-deep focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft"
    >
      <Bell size={19} strokeWidth={2.5} aria-hidden />

      {/* Ambient attention ring while unread */}
      {unread > 0 && (
        <span
          className="pointer-events-none absolute inset-0 rounded-2xl ring-2 ring-[#8B5CF6]/35 motion-safe:animate-pulse"
          aria-hidden
        />
      )}

      {/* Reactive count badge */}
      {unread > 0 && (
        <motion.span
          key={unread}
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={springs.bouncy}
          className="absolute -right-1.5 -top-1.5 flex h-[19px] min-w-[19px] items-center justify-center rounded-full border-2 border-card bg-[#8B5CF6] px-1 text-[10px] font-black leading-none text-white shadow-[0_2px_0_#5B21B6]"
        >
          {unread > 99 ? "99+" : unread}
        </motion.span>
      )}

      {/* Live sync indicator */}
      {syncing && (
        <span
          className="absolute -bottom-0.5 -right-0.5 size-2 rounded-full bg-success ring-2 ring-card"
          aria-hidden
        />
      )}
    </motion.button>
  );
}
