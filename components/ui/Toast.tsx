'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  CheckCircle2,
  Copy,
  MessageCircle,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";
import { shadows, springs } from "@/theme/tokens";

/* ————————————————————— Types & context ————————————————————— */

export type ToastTone = "success" | "brand" | "info" | "danger";

interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastContextValue {
  toast: (message: string, tone?: ToastTone) => void;
}

interface ToastState extends ToastContextValue {
  current: ToastItem | null;
  offline: boolean;
}

const ToastContext = createContext<ToastState | null>(null);

const toneConfig: Record<ToastTone, { icon: LucideIcon; className: string }> = {
  success: { icon: CheckCircle2, className: "text-success-soft dark:text-success" },
  brand: { icon: MessageCircle, className: "text-brand-soft dark:text-brand-deep" },
  info: { icon: Copy, className: "text-accent-soft dark:text-accent-deep" },
  danger: { icon: ShieldAlert, className: "text-danger-soft dark:text-danger" },
};

/* ————————————————————— Provider ————————————————————— */

export function ToastProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<ToastItem | null>(null);
  const [offline, setOffline] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const counter = useRef(0);

  const toast = useCallback((message: string, tone: ToastTone = "brand") => {
    if (timer.current) clearTimeout(timer.current);
    counter.current += 1;
    setCurrent({ id: counter.current, message, tone });
    timer.current = setTimeout(() => setCurrent(null), 2400);
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  useEffect(() => {
    const updateConnection = () => setOffline(!navigator.onLine);
    updateConnection();
    window.addEventListener("offline", updateConnection);
    window.addEventListener("online", updateConnection);
    return () => {
      window.removeEventListener("offline", updateConnection);
      window.removeEventListener("online", updateConnection);
    };
  }, []);

  const value = useMemo(() => ({ toast, current, offline }), [toast, current, offline]);

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

/** Fire a playful toast: `toast("Gist posted! 🎉", "success")`. */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>.");
  return { toast: ctx.toast };
}

/* ————————————————————— Viewport ————————————————————— */

/** Portaled toast viewport so notifications float cleanly on every route. */
export function ToastViewport() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("ToastViewport must be used inside <ToastProvider>.");
  const { current, offline } = ctx;

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="pointer-events-none fixed inset-x-4 top-[max(0.75rem,env(safe-area-inset-top))] z-[70] flex flex-col items-center gap-2 md:top-4"
    >
      {offline && (
        <div
          role="status"
          aria-live="polite"
          className="flex max-w-full items-center gap-2.5 rounded-2xl bg-danger-wash px-4 py-3 text-danger-deep shadow-lg dark:bg-danger/20 dark:text-danger"
        >
          <ShieldAlert size={18} strokeWidth={2.5} aria-hidden />
          <span className="text-sm font-bold">You are offline. Why you off your Data?</span>
        </div>
      )}
      <AnimatePresence mode="wait">
        {current && (
          <motion.div
            key={current.id}
            initial={{ y: 28, opacity: 0, scale: 0.92 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 14, opacity: 0, scale: 0.95 }}
            transition={springs.bouncy}
            className="fixed inset-x-4 bottom-24 mx-auto flex max-w-fit items-center gap-2.5 rounded-2xl px-4 py-3 md:bottom-6"
            style={{ boxShadow: shadows.toast, backgroundColor: "var(--toast-bg)", color: "var(--toast-fg)" }}
            role="status"
            aria-live="polite"
          >
            {(() => {
              const { icon: Icon, className } = toneConfig[current.tone];
              return <Icon size={18} strokeWidth={2.5} className={className} aria-hidden />;
            })()}
            <span className="truncate text-sm font-bold">{current.message}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>,
    document.body
  );
}
