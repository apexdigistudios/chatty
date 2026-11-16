const CELEBRATION_COLORS = ["#8B5CF6", "#A78BFA", "#F472B6", "#FBBF24", "#34D399"];

export function celebrateSuccess(): void {
  if (typeof window === "undefined") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  void import("canvas-confetti")
    .then(({ default: confetti }) => {
      void confetti({
        particleCount: 48,
        spread: 62,
        startVelocity: 30,
        gravity: 0.9,
        decay: 0.92,
        ticks: 160,
        scalar: 0.8,
        origin: { x: 0.5, y: 0.68 },
        colors: CELEBRATION_COLORS,
        disableForReducedMotion: true,
      });
    })
    .catch((error: unknown) => {
      console.error("Could not load the success celebration.", error);
    });
}
