'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type ThemeMode = "light" | "dark" | "system";
export type ResolvedTheme = Exclude<ThemeMode, "system">;

interface ThemeContextValue {
  mode: ThemeMode;
  resolvedTheme: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
  cycleThemeMode: () => void;
}

const STORAGE_KEY = "lets-gist-theme";
const ThemeContext = createContext<ThemeContextValue | null>(null);
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function isThemeMode(value: string | null): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system";
}

function readStoredMode(): ThemeMode {
  if (typeof window === "undefined") return "system";
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return isThemeMode(saved) ? saved : "system";
  } catch {
    return "system";
  }
}

function readSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("system");
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>("light");
  const resolvedTheme = mode === "system" ? systemTheme : mode;

  const setMode = useCallback((nextMode: ThemeMode) => {
    setModeState(nextMode);
  }, []);

  const toggleTheme = useCallback(() => {
    setModeState((current) => {
      const active = current === "system" ? readSystemTheme() : current;
      return active === "dark" ? "light" : "dark";
    });
  }, []);

  const cycleThemeMode = useCallback(() => {
    setModeState((current) =>
      current === "light" ? "dark" : current === "dark" ? "system" : "light"
    );
  }, []);

  useIsomorphicLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", resolvedTheme === "dark");
    root.dataset.theme = resolvedTheme;
    root.style.colorScheme = resolvedTheme;
    document
      .querySelector<HTMLMetaElement>('meta[name="theme-color"]')
      ?.setAttribute("content", resolvedTheme === "dark" ? "#121215" : "#F4F4F5");
  }, [resolvedTheme]);

  useEffect(() => {
    setModeState(readStoredMode());
    setSystemTheme(readSystemTheme());
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // Theme changes still work for this session when storage is unavailable.
    }
  }, [mode]);

  useEffect(() => {
    if (mode !== "system") return;
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = (event: MediaQueryListEvent) => setSystemTheme(event.matches ? "dark" : "light");
    setSystemTheme(media.matches ? "dark" : "light");
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", update);
      return () => media.removeEventListener("change", update);
    }
    media.addListener(update);
    return () => media.removeListener(update);
  }, [mode]);

  useEffect(() => {
    const syncStoredMode = (event: StorageEvent) => {
      if (event.key && event.key !== STORAGE_KEY) return;
      if (isThemeMode(event.newValue)) setModeState(event.newValue);
    };
    window.addEventListener("storage", syncStoredMode);
    return () => window.removeEventListener("storage", syncStoredMode);
  }, []);

  const value = useMemo(
    () => ({ mode, resolvedTheme, setMode, toggleTheme, cycleThemeMode }),
    [mode, resolvedTheme, setMode, toggleTheme, cycleThemeMode]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used inside <ThemeProvider>.");
  return context;
}