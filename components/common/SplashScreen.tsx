'use client';

import { motion } from "framer-motion";

export function SplashScreen() {
  return (
    <motion.main
      role="status"
      aria-label="Loading Gist me"
      className="fixed inset-0 z-100 flex h-screen items-center justify-center bg-neutral-950 text-white"
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.18, ease: "easeOut" } }}
    >
      <div className="flex flex-col items-center gap-5">
        <motion.img
          src="/logo.png"
          alt="Gist me Logo"
          fetchPriority="high"
          draggable={false}
          className="size-24 rounded-[1.75rem] object-contain drop-shadow-[0_8px_32px_rgba(139,92,246,0.3)] sm:size-28"
          animate={{ scale: [0.96, 1.04, 0.96], opacity: [0.86, 1, 0.86] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
        />
        <p className="text-sm font-extrabold tracking-[0.18em] text-white/85">GIST ME</p>
        <span className="sr-only">Loading your account…</span>
      </div>
    </motion.main>
  );
}
