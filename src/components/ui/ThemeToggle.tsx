import { AnimatePresence, motion } from "framer-motion";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "../../context/ThemeContext";
import { springs } from "../../theme/tokens";
import { cn } from "../../utils/cn";

interface ThemeToggleProps {
  /** Show the current preference beside the icon, for settings surfaces. */
  showLabel?: boolean;
  className?: string;
}

const modeLabels = { light: "Light", dark: "Dark", system: "System" } as const;

/** Animated light/dark switch; settings mode also cycles through System. */
export function ThemeToggle({ showLabel = false, className }: ThemeToggleProps) {
  const { mode, resolvedTheme, toggleTheme, cycleThemeMode } = useTheme();
  const Icon = mode === "system" ? Monitor : resolvedTheme === "dark" ? Moon : Sun;
  const nextLabel =
    mode === "system"
      ? `Switch to ${resolvedTheme === "dark" ? "light" : "dark"} theme`
      : mode === "dark"
        ? "Switch to light theme"
        : "Switch to dark theme";

  return (
    <motion.button
      type="button"
      onClick={showLabel ? cycleThemeMode : toggleTheme}
      whileTap={{ scale: 0.92, rotate: -8 }}
      transition={springs.snappy}
      aria-pressed={resolvedTheme === "dark"}
      aria-label={showLabel ? `Theme preference: ${modeLabels[mode]}. Activate to change.` : nextLabel}
      title={showLabel ? `Theme: ${modeLabels[mode]}` : nextLabel}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border-2 border-line bg-card px-2.5 text-ink",
        "transition-colors hover:border-brand hover:text-brand-deep focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft",
        showLabel && "min-h-11 justify-start px-3.5 text-sm font-extrabold",
        className
      )}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={`${mode}-${resolvedTheme}`}
          initial={{ opacity: 0, rotate: -50, scale: 0.7 }}
          animate={{ opacity: 1, rotate: 0, scale: 1 }}
          exit={{ opacity: 0, rotate: 50, scale: 0.7 }}
          transition={springs.bouncy}
          className="inline-flex"
          aria-hidden
        >
          <Icon size={19} strokeWidth={2.5} />
        </motion.span>
      </AnimatePresence>
      {showLabel && (
        <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
          <span>Appearance</span>
          <span className="text-xs font-bold text-ink-muted">{modeLabels[mode]}</span>
        </span>
      )}
    </motion.button>
  );
}