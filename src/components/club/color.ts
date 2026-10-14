/* Club colour maths: derive a page-scoped palette from ESPN's team colours
   that stays legible on glass in both themes. Pure functions, no React. */

type RGB = [number, number, number];

const HEX = /^#?([0-9a-f]{6})$/i;

export function parseHex(hex: string | null | undefined): RGB | null {
  if (!hex) return null;
  const m = HEX.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function toHex([r, g, b]: RGB): string {
  return `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("")}`;
}

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function luminance(rgb: RGB): number {
  return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
}

export function contrast(a: RGB, b: RGB): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** OKLab, for perceptual distance between two colours. */
function oklab([r, g, b]: RGB): [number, number, number] {
  const [lr, lg, lb] = [channel(r), channel(g), channel(b)];
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export function deltaE(a: RGB, b: RGB): number {
  const [l1, a1, b1] = oklab(a);
  const [l2, a2, b2] = oklab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2) * 100;
}

/** Nudge a colour toward white (on dark surfaces) or black (on light) until it clears `min` contrast against every surface. */
export function ensureContrast(rgb: RGB, surfaces: RGB[], min: number, dark: boolean): RGB {
  const target: RGB = dark ? [255, 255, 255] : [0, 0, 0];
  for (let i = 0; i <= 20; i++) {
    const c = mix(rgb, target, i * 0.05);
    if (surfaces.every((s) => contrast(c, s) >= min)) return c;
  }
  return target;
}

const nearWhite = (rgb: RGB) => luminance(rgb) > 0.8;
const nearBlack = (rgb: RGB) => luminance(rgb) < 0.012;

export interface ClubPalette {
  /** Hero / large fill colour (never near-white). */
  hero: string;
  /** Graphical accent on glass (≥3:1 against the page surfaces). */
  accent: string;
  /** Accent safe for text (≥4.5:1). */
  ink: string;
  /** Text colour on top of `accent`. */
  onAccent: string;
  /** A second data series that is perceptually far from the accent. */
  second: string;
  /** True when the club has no usable colour and we fell back to graphite. */
  neutral: boolean;
}

const LIGHT_SURFACES: RGB[] = [
  [255, 255, 255],
  [242, 242, 247],
];
const DARK_SURFACES: RGB[] = [
  [0, 0, 0],
  [44, 44, 46],
];

// Design-system series tokens (global.css) per theme, plus neutral ink-3.
const SECOND_LIGHT = ["#eb6834", "#2a78d6", "#8e8e93"];
const SECOND_DARK = ["#d95926", "#3987e5", "#8e8e93"];

export function clubPalette(primary: string | null | undefined, alt: string | null | undefined, dark: boolean): ClubPalette {
  const p = parseHex(primary);
  const a = parseHex(alt);
  let base: RGB | null = p && !nearWhite(p) ? p : null;
  // White-shirted clubs (e.g. Real Madrid) use their alternate colour when it has one.
  if (!base && a && !nearWhite(a)) base = a;
  const neutral = !base;
  const graphite: RGB = [58, 58, 60];
  const chosen = base ?? graphite;
  const surfaces = dark ? DARK_SURFACES : LIGHT_SURFACES;
  const accent = ensureContrast(chosen, surfaces, 3, dark);
  const ink = ensureContrast(chosen, surfaces, 4.5, dark);
  const onAccent = contrast(accent, [255, 255, 255]) >= contrast(accent, [17, 17, 17]) ? "#ffffff" : "#111111";
  // Very dark clubs read better as a deep graphite hero than pure black.
  const hero = nearBlack(chosen) ? mix(chosen, [255, 255, 255], 0.08) : chosen;
  const candidates = dark ? SECOND_DARK : SECOND_LIGHT;
  let second = candidates[0];
  let best = -1;
  for (const c of candidates) {
    const d = deltaE(accent, parseHex(c)!);
    if (d > best) {
      best = d;
      second = c;
    }
  }
  return { hero: toHex(hero), accent: toHex(accent), ink: toHex(ink), onAccent, second, neutral };
}

/** Readable text on top of an arbitrary fill. */
export function textOn(hex: string): string {
  const rgb = parseHex(hex);
  if (!rgb) return "#ffffff";
  return contrast(rgb, [255, 255, 255]) >= 3 ? "#ffffff" : "#111111";
}
