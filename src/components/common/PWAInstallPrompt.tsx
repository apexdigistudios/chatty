import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";
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

function isMobileDevice(): boolean {
  return window.matchMedia("(max-width: 767px)").matches ||
    /android|iphone|ipad|ipod/i.test(navigator.userAgent);
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
    if (isStandalone() || !isMobileDevice() || Date.now() - dismissedAt < DISMISS_FOR_MS) return;

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
          className="fixed inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[90] mx-auto flex max-w-lg items-start gap-3 rounded-2xl border border-white/10 bg-neutral-950/95 p-3.5 text-white shadow-2xl backdrop-blur-xl sm:inset-x-5 sm:bottom-5"
        >
          <img
            src="/icons/icon-192x192.png"
            alt=""
            className="size-11 shrink-0 rounded-xl"
            width={44}
            height={44}
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-extrabold">Install Gist me App</p>
            <p className="mt-0.5 text-xs leading-relaxed text-white/70">
              Get quick access to your school community, even offline.
            </p>
            {ios && showIOSSteps && (
              <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-white/85">
                Tap <Share size={14} aria-hidden /> Share, then choose “Add to Home Screen”.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => void install()}
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-[#8B5CF6] px-3 text-xs font-extrabold text-white transition-colors hover:bg-[#7C3AED] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            {ios ? "How to install" : <><Download size={15} aria-hidden /> Install</>}
          </button>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss install prompt"
            className="flex size-11 shrink-0 items-center justify-center rounded-xl text-white/70 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <X size={17} aria-hidden />
          </button>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
