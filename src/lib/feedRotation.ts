export function rotateBySeed<T>(items: T[], seed: number): T[] {
  if (items.length < 2) return items;
  const offset = Math.floor(Math.abs(seed) * items.length) % items.length;
  return [...items.slice(offset), ...items.slice(0, offset)];
}
