import { useEffect, useState } from "react";

/** Hides app chrome on downward scroll and restores it as soon as scrolling reverses. */
export function useScrollDirection(): boolean {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let previousY = window.scrollY;
    let distance = 0;
    let lastDirection = 0;

    const handleScroll = () => {
      const currentY = Math.max(0, window.scrollY);
      const delta = currentY - previousY;
      previousY = currentY;

      if (currentY < 48) {
        distance = 0;
        lastDirection = 0;
        setHidden(false);
        return;
      }

      const direction = Math.sign(delta);
      if (direction === 0) return;
      if (direction !== lastDirection) distance = 0;
      lastDirection = direction;
      distance += Math.abs(delta);

      if (distance >= 8) {
        setHidden(direction > 0);
        distance = 0;
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return hidden;
}
