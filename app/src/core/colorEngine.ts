import type {
  HslColor,
  OklchColor,
  ParsedColor,
  RgbColor,
} from './types';

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function round(v: number, digits = 3): number {
  const f = Math.pow(10, digits);
  return Math.round(v * f) / f;
}

export function srgbChannelToLinear(c255: number): number {
  const c = clamp(c255 / 255, 0, 1);
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function linearToSrgbChannel(lin: number): number {
  const c = clamp(lin, 0, 1);
  const s =
    c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.round(clamp(s, 0, 1) * 255);
}

/**
 * Björn Ottosson exact sRGB -> Oklab -> OKLCH conversion.
 */
export function rgbToOklch(rgb: RgbColor): OklchColor {
  const r = srgbChannelToLinear(rgb.r);
  const g = srgbChannelToLinear(rgb.g);
  const b = srgbChannelToLinear(rgb.b);

  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const b_ = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;

  const C = Math.hypot(a, b_);
  let H = (Math.atan2(b_, a) * 180) / Math.PI;
  if (H < 0) H += 360;
  if (C < 1e-5) H = 0;

  return {
    l: round(clamp(L, 0, 1), 4),
    c: round(Math.max(0, C), 4),
    h: round(H, 1),
    a: round(clamp(rgb.a, 0, 1), 3),
  };
}

/**
 * Björn Ottosson exact OKLCH -> Oklab -> linear sRGB -> sRGB conversion.
 */
export function oklchToRgb(oklch: OklchColor): RgbColor {
  const L = clamp(oklch.l, 0, 1);
  const C = Math.max(0, oklch.c);
  const hRad = (oklch.h * Math.PI) / 180;

  const a = C * Math.cos(hRad);
  const b = C * Math.sin(hRad);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  const rLin = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const gLin = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bLin = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

  return {
    r: linearToSrgbChannel(rLin),
    g: linearToSrgbChannel(gLin),
    b: linearToSrgbChannel(bLin),
    a: clamp(oklch.a ?? 1, 0, 1),
  };
}

export function rgbToHsl(rgb: RgbColor): HslColor {
  const r = clamp(rgb.r / 255, 0, 1);
  const g = clamp(rgb.g / 255, 0, 1);
  const b = clamp(rgb.b / 255, 0, 1);

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;

  let h = 0;
  let s = 0;

  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r:
        h = ((g - b) / d) % 6;
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
        break;
    }
    h *= 60;
    if (h < 0) h += 360;
  }

  return {
    h: Math.round(h),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
    a: round(clamp(rgb.a, 0, 1), 3),
  };
}

export function rgbToHex(rgb: RgbColor): string {
  const toHex = (n: number) =>
    Math.round(clamp(n, 0, 255))
      .toString(16)
      .padStart(2, '0')
      .toUpperCase();
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
}

export function rgbToHex8(rgb: RgbColor): string {
  const alphaByte = Math.round(clamp(rgb.a, 0, 1) * 255)
    .toString(16)
    .padStart(2, '0')
    .toUpperCase();
  return `${rgbToHex(rgb)}${alphaByte}`;
}

export function parseCssColor(input: string): RgbColor | null {
  const trimmed = input.trim();
  if (!trimmed || trimmed === 'transparent') return null;

  // Hex (#RGB, #RGBA, #RRGGBB, #RRGGBBAA)
  const hexMatch = trimmed.match(/^#([0-9a-fA-F]{3,8})$/);
  if (hexMatch) {
    const h = hexMatch[1];
    if (h.length === 3 || h.length === 4) {
      const r = parseInt(h[0] + h[0], 16);
      const g = parseInt(h[1] + h[1], 16);
      const b = parseInt(h[2] + h[2], 16);
      const a = h.length === 4 ? parseInt(h[3] + h[3], 16) / 255 : 1;
      return { r, g, b, a };
    }
    if (h.length === 6 || h.length === 8) {
      const r = parseInt(h.slice(0, 2), 16);
      const g = parseInt(h.slice(2, 4), 16);
      const b = parseInt(h.slice(4, 6), 16);
      const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
      return { r, g, b, a };
    }
  }

  // rgb(...) / rgba(...)
  const rgbMatch = trimmed.match(
    /^rgba?\(\s*([\d.]+)\s*[,\s]\s*([\d.]+)\s*[,\s]\s*([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i
  );
  if (rgbMatch) {
    let a = 1;
    if (rgbMatch[4] !== undefined) {
      a = rgbMatch[4].endsWith('%')
        ? parseFloat(rgbMatch[4]) / 100
        : parseFloat(rgbMatch[4]);
    }
    return {
      r: clamp(Math.round(parseFloat(rgbMatch[1])), 0, 255),
      g: clamp(Math.round(parseFloat(rgbMatch[2])), 0, 255),
      b: clamp(Math.round(parseFloat(rgbMatch[3])), 0, 255),
      a: clamp(a, 0, 1),
    };
  }

  // oklch(L C H [/ A])
  const oklchMatch = trimmed.match(
    /^oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)(?:deg)?(?:\s*\/\s*([\d.]+%?))?\s*\)$/i
  );
  if (oklchMatch) {
    const l = oklchMatch[1].endsWith('%')
      ? parseFloat(oklchMatch[1]) / 100
      : parseFloat(oklchMatch[1]);
    const c = parseFloat(oklchMatch[2]);
    const h = parseFloat(oklchMatch[3]);
    let a = 1;
    if (oklchMatch[4] !== undefined) {
      a = oklchMatch[4].endsWith('%')
        ? parseFloat(oklchMatch[4]) / 100
        : parseFloat(oklchMatch[4]);
    }
    return oklchToRgb({ l, c, h, a });
  }

  return null;
}

export function fromRgb(rgb: RgbColor): ParsedColor {
  const hex = rgbToHex(rgb);
  const hex8 = rgbToHex8(rgb);
  const hsl = rgbToHsl(rgb);
  const oklch = rgbToOklch(rgb);

  const cssRgb =
    rgb.a < 1
      ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${round(rgb.a, 2)})`
      : `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
  const cssHsl =
    rgb.a < 1
      ? `hsla(${hsl.h}, ${hsl.s}%, ${hsl.l}%, ${round(rgb.a, 2)})`
      : `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`;
  const cssOklch =
    rgb.a < 1
      ? `oklch(${round(oklch.l, 3)} ${round(oklch.c, 3)} ${round(oklch.h, 1)} / ${round(rgb.a, 2)})`
      : `oklch(${round(oklch.l, 3)} ${round(oklch.c, 3)} ${round(oklch.h, 1)})`;

  return {
    hex,
    hex8,
    rgb,
    hsl,
    oklch,
    cssRgb,
    cssHsl,
    cssOklch,
  };
}

export function parseColor(input: string): ParsedColor | null {
  const rgb = parseCssColor(input);
  return rgb ? fromRgb(rgb) : null;
}
