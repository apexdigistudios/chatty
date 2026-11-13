'use client';

import { useEffect, useState } from "react";
import { Bell, Download, Share, Smartphone, Wifi, X, Zap } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

const DISMISSED_KEY = "gist-me-install-dismissed-at";
const DISMISS_FOR_MS = 7 * 24 * 60 * 60 * 1000;

function isStandalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches ||
    ((navigator as Navigator & { standalone?: boolean }).standalone === true);
}

function isIOSDevice(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function PWAInstallPrompt() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [ios, setIos] = useState(false);
  const [showIOSSteps, setShowIOSSteps] = useState(false);

  useEffect(() => {
    let dismissedAt = 0;
    try {
      dismissedAt = Number(localStorage.getItem(DISMISSED_KEY) ?? 0);
    } catch (error) {
      console.warn("Could not read the install-prompt preference.", error);
    }
    if (isStandalone() || Date.now() - dismissedAt < DISMISS_FOR_MS) return;

    setIos(isIOSDevice());
    if (isIOSDevice()) setVisible(true);

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
      setVisible(true);
    };
    const handleInstalled = () => {
      setVisible(false);
      setInstallPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    } catch (error) {
      console.warn("Could not save the install-prompt preference.", error);
    }
    setVisible(false);
  };

  const install = async () => {
    if (!installPrompt) {
      setShowIOSSteps(true);
      return;
    }

    try {
      await installPrompt.prompt();
      await installPrompt.userChoice;
      setVisible(false);
      setInstallPrompt(null);
    } catch (error) {
      console.error("Could not open the Gist me install prompt.", error);
    }
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.aside
          role="region"
          aria-label="Install Gist me"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className="fixed inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-90 mx-auto max-w-xl rounded-2xl border border-white/10 bg-neutral-950/95 p-4 text-white shadow-2xl backdrop-blur-xl sm:inset-x-5 sm:bottom-5 sm:p-5"
        >
          <div className="flex items-start gap-3">
            <img
              src="/icons/icon-192x192.png"
              alt=""
              className="size-11 shrink-0 rounded-xl"
              width={44}
              height={44}
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-extrabold sm:text-base">Get more from Gist me</p>
              <ul className="mt-2 grid gap-1.5 text-xs leading-relaxed text-white/80">
                <li className="flex items-start gap-2"><Bell size={14} className="mt-0.5 shrink-0 text-amber-300" aria-hidden /><span><strong className="text-white">🚀 Campus gists &amp; notifications:</strong> Never miss an update or shoutout.</span></li>
                <li className="flex items-start gap-2"><Zap size={14} className="mt-0.5 shrink-0 text-sky-300" aria-hidden /><span><strong className="text-white">⚡ Lightning-fast access:</strong> Launch from your home screen.</span></li>
                <li className="flex items-start gap-2"><Wifi size={14} className="mt-0.5 shrink-0 text-emerald-300" aria-hidden /><span><strong className="text-white">📱 Seamless offline experience:</strong> Smooth use around campus.</span></li>
              </ul>
              {ios && showIOSSteps && (
                <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-white/85">
                  Tap <Share size={14} aria-hidden /> Share, then choose “Add to Home Screen”.
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={dismiss}
              aria-label="Maybe Later"
              className="flex size-9 shrink-0 items-center justify-center rounded-xl text-white/70 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <X size={17} aria-hidden />
            </button>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={dismiss}
              className="min-h-11 rounded-xl px-3 text-xs font-bold text-white/75 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              Maybe Later
            </button>
            <button
              type="button"
              onClick={() => void install()}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-[#8B5CF6] px-4 text-xs font-extrabold text-white transition-colors hover:bg-[#7C3AED] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <Download size={15} aria-hidden /> Install Now
            </button>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
