'use client';

import { Card } from "@/components/ui/Card";

export function FeedSkeleton({ count = 1 }: { count?: number }) {
  return (
    <div className="space-y-4" aria-label="Loading gists" role="status">
      <span className="sr-only">Loading gists…</span>
      {Array.from({ length: count }, (_, index) => (
        <Card key={index} className="animate-pulse motion-reduce:animate-none">
          <div className="flex items-center gap-3 px-4 pb-3 pt-4 sm:px-5">
            <span className="size-11 shrink-0 rounded-full bg-line" />
            <span className="min-w-0 flex-1 space-y-2">
              <span className="block h-3 w-32 rounded-full bg-line" />
              <span className="block h-2.5 w-24 rounded-full bg-line" />
            </span>
            <span className="size-8 rounded-xl bg-line" />
          </div>
          <div className="space-y-2 px-4 pb-3 sm:px-5">
            <span className="block h-3 w-full rounded-full bg-line" />
            <span className="block h-3 w-[72%] rounded-full bg-line" />
          </div>
          <div className="mx-0 aspect-[4/3] w-full bg-line sm:aspect-video" />
          <div className="flex items-center justify-between gap-3 border-t border-line/60 px-4 py-3 sm:px-5">
            <span className="h-8 w-16 rounded-xl bg-line" />
            <span className="h-8 w-16 rounded-xl bg-line" />
            <span className="h-8 w-16 rounded-xl bg-line" />
            <span className="h-8 w-8 rounded-xl bg-line" />
          </div>
        </Card>
      ))}
    </div>
  );
}
