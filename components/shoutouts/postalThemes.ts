/** Shared Step 11 envelope / stamp catalog for the wizard and the postal cards. */

export interface EnvelopeTheme {
  id: string;
  label: string;
  primary: string;
  secondary: string;
  accent: string;
  /** Text colour for the crest chip / stamp when accent is very dark. */
  onAccent?: string;
}

export const ENVELOPE_THEMES: readonly EnvelopeTheme[] = [
  { id: "school_crest", label: "Classic SHS Gold", primary: "#B45309", secondary: "#F59E0B", accent: "#FEF3C7" },
  { id: "royal_navy", label: "Deep Royal Navy", primary: "#1E3A8A", secondary: "#3B82F6", accent: "#DBEAFE" },
  { id: "classic_purple", label: "Signature Purple", primary: "#7C3AED", secondary: "#A78BFA", accent: "#EDE9FE" },
  { id: "emerald_green", label: "Emerald Green", primary: "#047857", secondary: "#34D399", accent: "#D1FAE5" },
  { id: "crimson_red", label: "Crimson Red", primary: "#B91C1C", secondary: "#F87171", accent: "#FEE2E2" },
  { id: "midnight_airmail", label: "Midnight Dark", primary: "#18181B", secondary: "#52525B", accent: "#E4E4E7" },
  { id: "vintage_parchment", label: "Vintage Parchment", primary: "#92400E", secondary: "#D6B98C", accent: "#F5E7C8" },
];

export const ENVELOPE_THEME_BY_ID = new Map(ENVELOPE_THEMES.map((theme) => [theme.id, theme]));

export const STAMPS = [
  { id: "priority", label: "Priority Campus Mail", detail: "Fastest paper plane", seal: "#991B1B" },
  { id: "confidential", label: "Confidential Gist Stamp", detail: "For your eyes only", seal: "#1E3A8A" },
  { id: "special_delivery", label: "Special Delivery", detail: "Handle with extra care", seal: "#B45309" },
  { id: "nsmq_dispatch", label: "NSMQ Dispatch", detail: "For the quiz legends", seal: "#047857" },
  { id: "secret_admirer", label: "Secret Admirer Stamp", detail: "Sent with butterflies", seal: "#BE185D" },
] as const;

export const STAMP_BY_ID = new Map(STAMPS.map((stamp) => [stamp.id, stamp]));

export const FORM_OPTIONS = [
  "Form 1 Science 1", "Form 1 Science 2", "Form 1 General Arts 1", "Form 1 Business 1",
  "Form 2 Science 1", "Form 2 Science 2", "Form 2 General Arts 1", "Form 2 Business 1",
  "Form 2 Visual Arts 1", "Form 3 Science 1", "Form 3 Science 2", "Form 3 General Arts 1",
  "Form 3 Business 1", "Form 3 Visual Arts 1", "Prefect / Staff",
] as const;
