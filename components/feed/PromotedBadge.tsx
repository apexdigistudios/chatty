'use client';

import { useEffect, useState } from "react";

const MAX_TIMEOUT = 2_147_000_000;
const expiredPromotionsNotified = new Set<string>();

export function PromotedBadge({
  isPromoted,
  promotedUntil,
}: {
  isPromoted?: boolean;
  promotedUntil?: string | null;
}) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const update = () => {
      const expiresAt = promotedUntil ? Date.parse(promotedUntil) : Number.NaN;
      const isActive = isPromoted === true && expiresAt > Date.now();
      setActive(isActive);
      if (
        isPromoted === true &&
        promotedUntil &&
        expiresAt <= Date.now() &&
        !expiredPromotionsNotified.has(promotedUntil)
      ) {
        expiredPromotionsNotified.add(promotedUntil);
        window.dispatchEvent(new Event("gistme:promotion-expired"));
      }
      if (isActive) {
        timeout = setTimeout(update, Math.min(expiresAt - Date.now(), MAX_TIMEOUT));
      }
    };
    update();
    return () => {
      if (timeout) clearTimeout(timeout);
    };
  }, [isPromoted, promotedUntil]);

  if (!active) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">
      Promoted
    </span>
  );
}
