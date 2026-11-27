import { fromRgb, parseCssColor } from './colorEngine';
import type { ScannedSwatch } from './types';

export interface RawStyleSample {
  color: string;
  role: 'background' | 'text' | 'border' | 'accent';
}

/**
 * Pure aggregation & sorting logic for computed page colors.
 * Deduplicates by uppercase HEX, tracks frequency and CSS roles, and sorts by count desc.
 */
export function aggregateScannedColors(
  samples: RawStyleSample[],
  maxSwatches = 48
): ScannedSwatch[] {
  const map = new Map<
    string,
    {
      hex: string;
      cssOklch: string;
      count: number;
      roles: Set<'background' | 'text' | 'border' | 'accent'>;
    }
  >();

  for (const sample of samples) {
    const rgb = parseCssColor(sample.color);
    if (!rgb || rgb.a < 0.05) continue;
    const parsed = fromRgb({ ...rgb, a: 1 });
    let entry = map.get(parsed.hex);
    if (!entry) {
      entry = {
        hex: parsed.hex,
        cssOklch: parsed.cssOklch,
        count: 0,
        roles: new Set(),
      };
      map.set(parsed.hex, entry);
    }
    entry.count++;
    entry.roles.add(sample.role);
  }

  return Array.from(map.values())
    .sort((a, b) => b.count - a.count || a.hex.localeCompare(b.hex))
    .slice(0, maxSwatches)
    .map((e) => ({
      hex: e.hex,
      cssOklch: e.cssOklch,
      count: e.count,
      roles: Array.from(e.roles),
    }));
}

/**
 * Self-contained DOM collector injected into activeTab via `chrome.scripting.executeScript`.
 */
export function collectPageColorsFromDom(): RawStyleSample[] {
  const samples: RawStyleSample[] = [];
  const elements = Array.from(document.querySelectorAll('*')).slice(0, 1200);
  for (const el of elements) {
    const cs = window.getComputedStyle(el);
    if (cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)') {
      samples.push({ color: cs.backgroundColor, role: 'background' });
    }
    if (cs.color) {
      samples.push({ color: cs.color, role: 'text' });
    }
    if (
      cs.borderTopColor &&
      cs.borderTopWidth &&
      cs.borderTopWidth !== '0px'
    ) {
      samples.push({ color: cs.borderTopColor, role: 'border' });
    }
    if (cs.outlineColor && cs.outlineWidth && cs.outlineWidth !== '0px') {
      samples.push({ color: cs.outlineColor, role: 'accent' });
    }
  }
  return samples;
}
