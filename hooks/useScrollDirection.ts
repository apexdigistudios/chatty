import { useEffect, useState } from "react";

/** Hides mobile navigation on downward page scroll and restores it on reversal. */
export function useScrollDirection(resetKey?: string): boolean {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let previousY = window.scrollY;
    let downDistance = 0;
    let frame = 0;

    const handleScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const currentY = Math.max(0, window.scrollY);
        const delta = currentY - previousY;
        previousY = currentY;

        if (currentY <= 8) {
          downDistance = 0;
          setHidden(false);
          return;
        }

        if (delta < 0) {
          downDistance = 0;
          setHidden(false);
          return;
        }

        if (delta > 0) {
          downDistance += delta;
          if (downDistance >= 12) {
            downDistance = 0;
            setHidden(true);
          }
        }
      });
    };

    const syncAfterNavigation = () => {
      setHidden(false);
      downDistance = 0;
      if (frame) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        previousY = window.scrollY;
      });
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("popstate", syncAfterNavigation);
    window.addEventListener("pageshow", syncAfterNavigation);
    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("popstate", syncAfterNavigation);
      window.removeEventListener("pageshow", syncAfterNavigation);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [resetKey]);

  useEffect(() => {
    setHidden(false);
  }, [resetKey]);

  return hidden;
}
