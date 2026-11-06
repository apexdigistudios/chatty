export function formatCompactNumber(count: number): string {
  if (!count || Number.isNaN(count)) return "0";
  return new Intl.NumberFormat("en", {
    notation: "compact",
    compactDisplay: "short",
  }).format(count);
}
