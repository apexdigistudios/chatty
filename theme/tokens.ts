import type { Transition } from "framer-motion";

/**
 * Gist me design tokens.
 * CSS equivalents live in `src/index.css` (@theme) — keep both in sync.
 */

/* ————————————————————— Colors ————————————————————— */

export const themePalettes = {
  light: {
    brand: {
      main: "#8B5CF6",
      deep: "#7C3AED",
      edge: "#5B21B6",
      soft: "#EDE9FE",
      wash: "#F5F3FF",
    },
    accent: { main: "#0EA5E9", deep: "#0369A1", soft: "#BAE6FD", wash: "#E0F2FE" },
    success: { main: "#10B981", deep: "#047857", soft: "#A7F3D0", wash: "#ECFDF5" },
    warning: { main: "#F59E0B", deep: "#B45309", soft: "#FDE68A", wash: "#FFFBEB" },
    danger: { main: "#EF4444", deep: "#B91C1C", soft: "#FECACA", wash: "#FEF2F2" },
    surface: { page: "#F4F4F5", card: "#FFFFFF", raised: "#FFFFFF", deep: "#FFFFFF", line: "#E4E4E7", lineDeep: "#18181B" },
    ink: { strong: "#0F0F11", body: "#18181B", muted: "#71717A", faint: "#A1A1AA" },
  },
  dark: {
    brand: {
      main: "#A78BFA",
      deep: "#A78BFA",
      edge: "#7C3AED",
      soft: "#3B2D5C",
      wash: "#251D35",
    },
    accent: { main: "#38BDF8", deep: "#7DD3FC", soft: "#0C4A6E", wash: "#082F49" },
    success: { main: "#34D399", deep: "#6EE7B7", soft: "#064E3B", wash: "#052E2B" },
    warning: { main: "#FBBF24", deep: "#FCD34D", soft: "#713F12", wash: "#422006" },
    danger: { main: "#BE123C", deep: "#FDA4AF", soft: "#881337", wash: "#4C0519" },
    surface: { page: "#121215", card: "#18181B", raised: "#202024", deep: "#09090B", line: "#3F3F46", lineDeep: "#71717A" },
    ink: { strong: "#FAFAFA", body: "#E4E4E7", muted: "#A1A1AA", faint: "#71717A" },
  },
} as const;

/** Light palette is the default/fallback used by static assets such as initials avatars. */
export const palette = themePalettes.light;
export type ThemePalette = (typeof themePalettes)[keyof typeof themePalettes];

export type PaletteFamily = keyof typeof palette;

/* ————————————————————— 3D shadows ————————————————————— */

/** How far (px) a 3D element travels when pressed — its bottom "border" depth. */
export const PRESS_DEPTH = 5;

const depth = (color: string, y: number): string =>
  `0px ${y}px 0px 0px ${color}`;

/** Rest / hover / pressed shadow triple for a chunky 3D surface. */
export interface DepthShadow {
  rest: string;
  hover: string;
  tap: string;
}

export const depthShadow = (color: string): DepthShadow => ({
  rest: depth(color, PRESS_DEPTH),
  hover: depth(color, PRESS_DEPTH + 2),
  tap: depth(color, 1),
});

/** Transparent triple for flat (ghost) elements — keeps Motion interpolation happy. */
export const flatShadow: DepthShadow = {
  rest: depth("rgba(15,15,17,0)", 0),
  hover: depth("rgba(15,15,17,0)", 0),
  tap: depth("rgba(15,15,17,0)", 0),
};

export const shadows = {
  card: depth("var(--border-color)", 4),
  cardHover: depth("var(--border-strong)", 6),
  cardTap: depth("var(--border-strong)", 2),
  logo: depth("var(--brand-edge)", 3),
  toast: depth("rgba(15,15,17,0.2)", 4),
  phone: "0px 30px 70px -36px rgba(15,15,17,0.22), 0px 6px 0px 0px #18181B",
} as const;

/* ————————————————————— Typography ————————————————————— */

export const typography = {
  fontFamily: {
    sans: '"Nunito Variable", "Nunito", ui-rounded, system-ui, sans-serif',
  },
  weight: {
    regular: 400,
    semibold: 600,
    bold: 700,
    extrabold: 800,
    black: 900,
  },
  size: {
    display: "1.875rem", // 30
    title: "1.25rem", // 20
    body: "0.9375rem", // 15
    caption: "0.75rem", // 12
    micro: "0.6875rem", // 11
  },
  tracking: { label: "0.08em" },
} as const;

/* ————————————————————— Radii ————————————————————— */

export const radii = {
  button: "1rem", // rounded-2xl
  card: "1.5rem", // rounded-3xl
  phone: "3rem",
  pill: "9999px",
} as const;

/* ————————————————————— Motion ————————————————————— */

export const springs = {
  /** Buttons & tactile presses */
  snappy: { type: "spring", stiffness: 600, damping: 30, mass: 0.7 },
  /** Bouncy entrances, likes, badges */
  bouncy: { type: "spring", stiffness: 420, damping: 22 },
  /** Section reveals, bars, layout */
  gentle: { type: "spring", stiffness: 170, damping: 24 },
} satisfies Record<string, Transition>;

export const durations = { fast: 0.15, normal: 0.25, slow: 0.45 } as const;

/* ————————————————————— Showcase helpers ————————————————————— */

export interface Swatch {
  name: string;
  hex: string;
  deep: string;
  /** True when the swatch is light enough to need dark text */
  light?: boolean;
}

export const brandSwatches: readonly Swatch[] = [
  { name: "Brand", hex: palette.brand.main, deep: palette.brand.deep },
  { name: "Deep", hex: palette.brand.deep, deep: "#4C1D95" },
  { name: "Lilac", hex: palette.brand.soft, deep: "#C4B5FD", light: true },
  { name: "Emerald", hex: palette.success.main, deep: palette.success.deep },
  { name: "Amber", hex: palette.warning.main, deep: palette.warning.deep },
  { name: "Sky", hex: palette.accent.main, deep: palette.accent.deep },
];
