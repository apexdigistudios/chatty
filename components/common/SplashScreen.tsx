'use client';

import { motion } from "framer-motion";
import { FeedSkeleton } from "@/components/feed/FeedSkeleton";

export function SplashScreen() {
  return (
    <motion.div
      role="status"
      aria-label="Loading Gist me"
      className="fixed inset-0 z-100 overflow-y-auto bg-page text-ink"
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.18, ease: "easeOut" } }}
    >
      <div className="mx-auto w-full max-w-[1320px] px-4">
        <header className="flex h-[60px] items-center gap-3 border-b border-line/60 sm:h-[68px]">
          <span className="size-10 animate-pulse rounded-xl bg-line motion-reduce:animate-none" />
          <span className="h-4 w-24 animate-pulse rounded-full bg-line motion-reduce:animate-none" />
          <span className="ml-auto hidden h-10 max-w-[430px] flex-1 animate-pulse rounded-2xl bg-line motion-reduce:animate-none sm:block" />
          <span className="size-11 animate-pulse rounded-2xl bg-line motion-reduce:animate-none" />
        </header>
        <main className="mx-auto w-full max-w-[720px] space-y-4 px-0 py-5 sm:px-6 sm:py-7">
          <div className="mb-4 flex gap-2">
            <span className="h-10 flex-1 animate-pulse rounded-xl bg-line motion-reduce:animate-none" />
            <span className="h-10 flex-1 animate-pulse rounded-xl bg-line motion-reduce:animate-none" />
            <span className="h-10 flex-1 animate-pulse rounded-xl bg-line motion-reduce:animate-none" />
            <span className="h-10 flex-1 animate-pulse rounded-xl bg-line motion-reduce:animate-none" />
          </div>
          <FeedSkeleton count={3} />
        </main>
      </div>
    </motion.div>
  );
}
