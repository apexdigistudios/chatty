/** A displayable image: storage URL (or object URL during upload) + copy. */
export interface MediaItem {
  src: string;
  alt?: string;
  caption?: string;
}

/**
 * Illustrated avatar generated from the username when a student has not
 * uploaded a photo yet. Mirrors the default written by the DB signup trigger.
 */
export function defaultAvatarUrl(seed: string): string {
  return `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(
    seed || "student"
  )}&backgroundColor=ede9fe`;
}

export function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  return hash;
}

/** Heraldic colour pairs used by the crest medallion when no crest is uploaded. */
const CREST_PALETTE: ReadonlyArray<readonly [string, string]> = [
  ["#1E3A8A", "#FACC15"],
  ["#9D174D", "#FDE68A"],
  ["#166534", "#F5F5F4"],
  ["#7C2D12", "#FACC15"],
  ["#0F172A", "#D97706"],
  ["#065F46", "#FACC15"],
  ["#1E40AF", "#FBBF24"],
  ["#0E7490", "#F97316"],
  ["#5B21B6", "#EDE9FE"],
];

export function crestColorsFor(seed: string): readonly [string, string] {
  return CREST_PALETTE[hashString(seed) % CREST_PALETTE.length]!;
}

/** Well-known Ghanaian SHS nicknames, keyed by normalised full name. */
const SHORT_NAME_ALIASES: Record<string, string> = {
  "presbyterian boys' senior high school": "PRESEC",
  "presbyterian boys senior high school": "PRESEC",
  "wesley girls' senior high school": "Wesley Girls",
  "wesley girls senior high school": "Wesley Girls",
  "achimota school": "Achimota",
  "mfantsipim school": "Mfantsipim",
  "adisadel college": "Adisadel",
  "prempeh college": "Prempeh",
  "opoku ware school": "Opoku Ware",
  "st. peter's boys senior high school": "St. Peter's",
  "st peter's boys senior high school": "St. Peter's",
  "ghana national college": "Ghanass",
  "holy child school": "Holy Child",
  "mawuli school": "Mawuli",
  "aburi girls' senior high school": "Aburi Girls",
  "st. augustine's college": "Augusco",
  "accra academy": "Accra Aca",
};

/**
 * Short display name for a school, derived from its full name because the
 * live schema stores only `name`. Strips "Senior High School" style suffixes.
 */
export function shortNameOf(name: string): string {
  const trimmed = name.trim();
  const alias = SHORT_NAME_ALIASES[trimmed.toLowerCase()];
  if (alias) return alias;
  let short = trimmed
    .replace(/\b(senior\s+high\s+(school|sch\.?)|senior\s+high|secondary\s+(school|sch\.?)|s\.?h\.?s\.?)\s*$/i, "")
    .replace(/\b(school|sch\.?|college)\s*$/i, "")
    .replace(/[\s,\-–]+$/, "")
    .trim();
  if (short.length < 3) short = trimmed;
  return short.length > 22 ? `${short.slice(0, 21).trimEnd()}…` : short;
}

export function initialsOf(name: string): string {
  const parts = name
    .replace(/[^A-Za-z0-9' ]/g, " ")
    .split(/\s+/)
    .filter((part) => part && !/^(of|the|and|senior|high|school|college)$/i.test(part));
  const letters = parts.slice(0, 2).map((part) => part[0]!.toUpperCase()).join("");
  return letters || name.slice(0, 2).toUpperCase();
}
