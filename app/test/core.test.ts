import { describe, expect, it } from 'vitest';
import {
  oklchToRgb,
  parseColor,
  rgbToHex,
  rgbToOklch,
} from '../src/core/colorEngine';
import { ColorHistoryStore } from '../src/core/historyStore';
import { aggregateScannedColors } from '../src/core/pageScanner';
import { createMemoryStorageAdapter } from '../src/licensing';

describe('Core: colorEngine (Björn Ottosson exact OKLCH + HEX/RGB/HSL)', () => {
  it('converts #0EA5E9 accurately to RGB, HSL, and OKLCH and round-trips OKLCH -> RGB', () => {
    const parsed = parseColor('#0ea5e9');
    expect(parsed).not.toBeNull();
    expect(parsed!.hex).toBe('#0EA5E9');
    expect(parsed!.rgb).toEqual({ r: 14, g: 165, b: 233, a: 1 });
    expect(parsed!.hsl.h).toBe(199);
    // Björn Ottosson exact sRGB->OKLCH for #0EA5E9 is oklch(0.6847 0.1479 237.3)
    expect(parsed!.oklch.l).toBeCloseTo(0.685, 2);
    expect(parsed!.oklch.c).toBeCloseTo(0.148, 2);
    expect(parsed!.oklch.h).toBeCloseTo(237.3, 0);

    const backRgb = oklchToRgb(parsed!.oklch);
    expect(Math.abs(backRgb.r - 14)).toBeLessThanOrEqual(1);
    expect(Math.abs(backRgb.g - 165)).toBeLessThanOrEqual(1);
    expect(Math.abs(backRgb.b - 233)).toBeLessThanOrEqual(1);
  });

  it('handles pure white, pure black, rgb(), and oklch() inputs cleanly', () => {
    expect(rgbToOklch({ r: 255, g: 255, b: 255, a: 1 }).l).toBeCloseTo(1, 3);
    expect(rgbToOklch({ r: 0, g: 0, b: 0, a: 1 }).l).toBeCloseTo(0, 3);
    expect(parseColor('rgb(255, 0, 128)')?.hex).toBe('#FF0080');
    const fromOklch = parseColor('oklch(0.685 0.169 237.3)');
    expect(fromOklch).not.toBeNull();
    expect(rgbToHex(fromOklch!.rgb)).toMatch(/^#[0-9A-F]{6}$/);
  });
});

describe('Core: pageScanner & historyStore', () => {
  it('deduplicates, counts frequency, tracks roles, and skips transparent samples', () => {
    const swatches = aggregateScannedColors([
      { color: 'rgb(15, 23, 42)', role: 'background' },
      { color: '#0f172a', role: 'border' },
      { color: 'rgba(0, 0, 0, 0)', role: 'background' },
      { color: 'rgb(14, 165, 233)', role: 'accent' },
    ]);
    expect(swatches).toHaveLength(2);
    expect(swatches[0].hex).toBe('#0F172A');
    expect(swatches[0].count).toBe(2);
    expect(swatches[0].roles).toContain('background');
    expect(swatches[0].roles).toContain('border');
  });

  it('persists color history and deduplicates repeated picks', async () => {
    const store = new ColorHistoryStore(createMemoryStorageAdapter());
    await store.add('#112233');
    await store.add('#445566');
    await store.add('#112233');
    const list = await store.list();
    expect(list).toHaveLength(2);
    expect(list[0].hex).toBe('#112233');
    await store.clear();
    expect(await store.list()).toHaveLength(0);
  });
});
