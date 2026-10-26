// Turns ONE brand color (e.g. "#7c3aed") into the full Tailwind-style scale (50 ... 700)
// that the UI uses: bg-brand-50 for soft backgrounds, bg-brand-500 for buttons,
// text-brand-700 for links, and so on.
//
// The math happens in OKLCH: L = lightness (0 black ... 1 white), C = chroma (how colorful),
// H = hue (the "color" itself, in degrees). Changing only L and C keeps every shade
// the same hue, so the whole scale still looks like the client's color.

type Oklch = { l: number; c: number; h: number };

export const HEX_REGEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace("#", "");
  if (h.length === 3) h = [...h].map((ch) => ch + ch).join("");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];
}

const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const fromLinear = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

function rgbToOklch([r, g, b]: [number, number, number]): Oklch {
  const [lr, lg, lb] = [r, g, b].map(toLinear);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);

  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;

  return { l: L, c: Math.hypot(A, B), h: (Math.atan2(B, A) * 180) / Math.PI };
}

function oklchToRgb({ l: L, c, h }: Oklch): [number, number, number] {
  const A = c * Math.cos((h * Math.PI) / 180);
  const B = c * Math.sin((h * Math.PI) / 180);

  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;

  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return rgb.map((v) => Math.min(1, Math.max(0, fromLinear(v)))) as [number, number, number];
}

const rgbToHex = (rgb: [number, number, number]) =>
  "#" +
  rgb
    .map((v) =>
      Math.round(v * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("");

// WCAG contrast ratio between two colors: 1 (same) ... 21 (black on white).
// 4.5 is the minimum for normal-size text.
function luminance(rgb: [number, number, number]) {
  const [r, g, b] = rgb.map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: [number, number, number], b: [number, number, number]) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const WHITE: [number, number, number] = [1, 1, 1];
const DARK_TEXT = "#0e1a33"; // navy-950: the text color used on light buttons

// Light shades: fixed lightness, with chroma reduced so tints stay soft (not neon).
const TINTS: [shade: number, l: number, chroma: number][] = [
  [50, 0.975, 0.12],
  [100, 0.945, 0.25],
  [200, 0.895, 0.45],
  [300, 0.83, 0.7],
  [400, 0.77, 0.9],
];

export type BrandScale = Record<`--color-brand-${50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | "ink"}`, string>;

export function brandScale(hex: string): BrandScale {
  const base = rgbToOklch(hexToRgb(hex));
  const shade = (l: number, chromaFactor = 1) =>
    rgbToHex(oklchToRgb({ l: Math.min(0.99, Math.max(0, l)), c: base.c * chromaFactor, h: base.h }));

  const scale = {} as BrandScale;
  for (const [n, l, chroma] of TINTS) {
    // A very light brand color would make the "light" tints darker than itself - keep them lighter.
    scale[`--color-brand-${n}` as keyof BrandScale] = shade(
      Math.max(l, base.l + (0.98 - base.l) * (1 - n / 500)),
      chroma,
    );
  }
  scale["--color-brand-500"] = rgbToHex(hexToRgb(hex));
  scale["--color-brand-600"] = shade(base.l - 0.07);

  // 700 is used for links on white, so darken until it is readable (contrast >= 4.5).
  let l700 = Math.min(base.l - 0.14, 0.6);
  while (l700 > 0.15 && contrast(oklchToRgb({ l: l700, c: base.c, h: base.h }), WHITE) < 4.5) l700 -= 0.02;
  scale["--color-brand-700"] = shade(l700);

  // Text ON a brand-500 button: dark navy or white, whichever is easier to read.
  const brandRgb = hexToRgb(hex);
  scale["--color-brand-ink"] =
    contrast(brandRgb, hexToRgb(DARK_TEXT)) >= contrast(brandRgb, WHITE) ? DARK_TEXT : "#ffffff";

  return scale;
}
