/**
 * Deterministically picks a visually-distinct next color for a new class,
 * rotating hue by the golden angle so consecutive classes stay separated
 * even as more are added. Matches the `#rrggbb` format Class.color expects.
 */
export function nextDistinctColorHex(existingCount: number): string {
  const hue = (existingCount * 137.508) % 360;
  return hslToHex(hue, 65, 55);
}

function hslToHex(h: number, s: number, l: number): string {
  const sat = s / 100;
  const lum = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sat * Math.min(lum, 1 - lum);
  const f = (n: number) => lum - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (n: number) =>
    Math.round(f(n) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(0)}${toHex(8)}${toHex(4)}`;
}
