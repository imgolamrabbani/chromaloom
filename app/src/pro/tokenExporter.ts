import { parseColor } from '../core/colorEngine';
import type { TokenExportFormat } from '../core/types';

export interface NamedTokenInput {
  name: string;
  hex: string;
}

function slugifyToken(name: string, index: number): string {
  const clean = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return clean || `color-${index + 1}`;
}

export function exportDesignTokens(
  colors: NamedTokenInput[],
  format: TokenExportFormat,
  useOklch = true
): string {
  const normalized = colors
    .map((item, idx) => {
      const parsed = parseColor(item.hex);
      if (!parsed) return null;
      return {
        slug: slugifyToken(item.name, idx),
        hex: parsed.hex,
        oklch: parsed.cssOklch,
      };
    })
    .filter((x): x is { slug: string; hex: string; oklch: string } => x !== null);

  if (format === 'tailwind-v4') {
    const lines = ['@theme {'];
    for (const c of normalized) {
      lines.push(`  --color-${c.slug}: ${useOklch ? c.oklch : c.hex}; /* ${c.hex} */`);
    }
    lines.push('}');
    return lines.join('\n') + '\n';
  }

  if (format === 'css-vars') {
    const lines = [':root {'];
    for (const c of normalized) {
      lines.push(`  --${c.slug}: ${useOklch ? c.oklch : c.hex}; /* ${c.hex} */`);
    }
    lines.push('}');
    return lines.join('\n') + '\n';
  }

  // W3C Design Tokens Community Group JSON format
  const tokenTree: Record<string, Record<string, unknown>> = { color: {} };
  for (const c of normalized) {
    tokenTree.color[c.slug] = {
      $type: 'color',
      $value: c.hex,
      $extensions: {
        'dev.chromaloom.oklch': c.oklch,
      },
    };
  }
  return JSON.stringify(tokenTree, null, 2) + '\n';
}
