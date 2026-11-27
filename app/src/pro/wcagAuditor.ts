import {
  oklchToRgb,
  parseColor,
  rgbToHex,
  rgbToOklch,
  srgbChannelToLinear,
} from '../core/colorEngine';
import type { ContrastAuditResult, RgbColor } from '../core/types';

/**
 * WCAG 2.2 Relative Luminance (0..1).
 */
export function relativeLuminance(rgb: RgbColor): number {
  return (
    0.2126 * srgbChannelToLinear(rgb.r) +
    0.7152 * srgbChannelToLinear(rgb.g) +
    0.0722 * srgbChannelToLinear(rgb.b)
  );
}

/**
 * WCAG 2.2 Contrast Ratio (1.00 .. 21.00).
 */
export function wcagContrastRatio(fg: RgbColor, bg: RgbColor): number {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  const ratio = (lighter + 0.05) / (darker + 0.05);
  return Math.round(ratio * 100) / 100;
}

/**
 * APCA Lc (W3 0.0.98G-4g perceptual lightness contrast, signed -108 .. +106).
 */
export function apcaContrastLc(textRgb: RgbColor, bgRgb: RgbColor): number {
  const yFromRgb = (c: RgbColor) => {
    const y =
      0.2126729 * Math.pow(c.r / 255, 2.4) +
      0.7151522 * Math.pow(c.g / 255, 2.4) +
      0.072175 * Math.pow(c.b / 255, 2.4);
    return y > 0.022 ? y : y + Math.pow(0.022 - y, 1.414);
  };

  const yTxt = yFromRgb(textRgb);
  const yBg = yFromRgb(bgRgb);

  if (Math.abs(yBg - yTxt) < 0.0005) {
    return 0;
  }

  let sapc: number;
  let output: number;

  if (yBg > yTxt) {
    // Dark text on light background (normal polarity -> positive Lc)
    sapc = (Math.pow(yBg, 0.56) - Math.pow(yTxt, 0.57)) * 1.14;
    output = sapc < 0.1 ? 0 : (sapc - 0.027) * 100;
  } else {
    // Light text on dark background (reverse polarity -> negative Lc)
    sapc = (Math.pow(yBg, 0.65) - Math.pow(yTxt, 0.62)) * 1.14;
    output = sapc > -0.1 ? 0 : (sapc + 0.027) * 100;
  }

  return Math.round(output * 10) / 10;
}

/**
 * Binary-searches OKLCH lightness L (preserving hue H and chroma C)
 * to find the nearest foreground shade meeting the target WCAG contrast ratio.
 */
export function findNearestCompliantShade(
  fgRgb: RgbColor,
  bgRgb: RgbColor,
  targetRatio: number
): string | undefined {
  if (wcagContrastRatio(fgRgb, bgRgb) >= targetRatio) {
    return rgbToHex(fgRgb);
  }

  const fgOklch = rgbToOklch(fgRgb);
  const bgLum = relativeLuminance(bgRgb);

  const searchDirection = (goLighter: boolean): { hex: string; deltaL: number } | null => {
    let low = goLighter ? fgOklch.l : 0;
    let high = goLighter ? 1 : fgOklch.l;
    let bestHex: string | null = null;
    let bestL = fgOklch.l;

    // Verify endpoint can actually satisfy targetRatio
    const extremeRgb = oklchToRgb({
      l: goLighter ? 1 : 0,
      c: fgOklch.c,
      h: fgOklch.h,
      a: 1,
    });
    if (wcagContrastRatio(extremeRgb, bgRgb) < targetRatio) {
      return null;
    }

    for (let iter = 0; iter < 18; iter++) {
      const mid = (low + high) / 2;
      const candRgb = oklchToRgb({
        l: mid,
        c: fgOklch.c,
        h: fgOklch.h,
        a: 1,
      });
      if (wcagContrastRatio(candRgb, bgRgb) >= targetRatio) {
        bestHex = rgbToHex(candRgb);
        bestL = mid;
        if (goLighter) {
          high = mid;
        } else {
          low = mid;
        }
      } else {
        if (goLighter) {
          low = mid;
        } else {
          high = mid;
        }
      }
    }

    return bestHex
      ? { hex: bestHex, deltaL: Math.abs(bestL - fgOklch.l) }
      : null;
  };

  const lighter = searchDirection(true);
  const darker = searchDirection(false);

  if (lighter && darker) {
    return lighter.deltaL <= darker.deltaL ? lighter.hex : darker.hex;
  }
  if (lighter) return lighter.hex;
  if (darker) return darker.hex;

  // Fallback to pure black or pure white if chroma prevents reaching target
  return bgLum > 0.5 ? '#000000' : '#FFFFFF';
}

export function auditContrast(
  foregroundInput: string,
  backgroundInput: string
): ContrastAuditResult {
  const fg = parseColor(foregroundInput);
  const bg = parseColor(backgroundInput);
  if (!fg || !bg) {
    throw new Error('Invalid foreground or background color.');
  }

  const ratio = wcagContrastRatio(fg.rgb, bg.rgb);
  const apcaLc = apcaContrastLc(fg.rgb, bg.rgb);

  const aaNormal = ratio >= 4.5;
  const aaLarge = ratio >= 3.0;
  const aaaNormal = ratio >= 7.0;
  const aaaLarge = ratio >= 4.5;

  return {
    foregroundHex: fg.hex,
    backgroundHex: bg.hex,
    wcagRatio: ratio,
    apcaLc,
    aaNormal,
    aaLarge,
    aaaNormal,
    aaaLarge,
    suggestedAaHex: aaNormal
      ? undefined
      : findNearestCompliantShade(fg.rgb, bg.rgb, 4.5),
    suggestedAaaHex: aaaNormal
      ? undefined
      : findNearestCompliantShade(fg.rgb, bg.rgb, 7.0),
  };
}
