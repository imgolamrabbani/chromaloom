import { describe, expect, it } from 'vitest';
import { createMemoryStorageAdapter } from '../src/licensing';
import { SwatchBoardStore } from '../src/pro/gradientBoards';
import { exportDesignTokens } from '../src/pro/tokenExporter';
import {
  apcaContrastLc,
  auditContrast,
  wcagContrastRatio,
} from '../src/pro/wcagAuditor';

describe('Pro: wcagAuditor (WCAG 2.2 + APCA Lc + OKLCH compliant shade solver)', () => {
  it('computes exact WCAG 2.2 21:1 black/white contrast and signed APCA Lc polarities', () => {
    const bw = auditContrast('#000000', '#FFFFFF');
    expect(bw.wcagRatio).toBe(21);
    expect(bw.aaNormal).toBe(true);
    expect(bw.aaaNormal).toBe(true);
    expect(bw.apcaLc).toBeGreaterThan(100);

    const wb = auditContrast('#FFFFFF', '#000000');
    expect(wb.wcagRatio).toBe(21);
    expect(wb.apcaLc).toBeLessThan(-100);
  });

  it('binary-searches OKLCH lightness to solve failing AA/AAA pairs', () => {
    // Low-contrast sky blue on white
    const failing = auditContrast('#7DD3FC', '#FFFFFF');
    expect(failing.aaNormal).toBe(false);
    expect(failing.suggestedAaHex).toBeTruthy();
    expect(failing.suggestedAaaHex).toBeTruthy();

    // Verify suggested AA shade genuinely passes >= 4.5:1
    const fixedAa = auditContrast(failing.suggestedAaHex!, '#FFFFFF');
    expect(fixedAa.wcagRatio).toBeGreaterThanOrEqual(4.5);
    expect(fixedAa.aaNormal).toBe(true);

    // Verify suggested AAA shade genuinely passes >= 7.0:1
    const fixedAaa = auditContrast(failing.suggestedAaaHex!, '#FFFFFF');
    expect(fixedAaa.wcagRatio).toBeGreaterThanOrEqual(7.0);
    expect(fixedAaa.aaaNormal).toBe(true);

    expect(
      wcagContrastRatio({ r: 0, g: 0, b: 0, a: 1 }, { r: 255, g: 255, b: 255, a: 1 })
    ).toBe(21);
    expect(
      Math.abs(
        apcaContrastLc({ r: 0, g: 0, b: 0, a: 1 }, { r: 255, g: 255, b: 255, a: 1 })
      )
    ).toBeGreaterThan(100);
  });
});

describe('Pro: tokenExporter', () => {
  const palette = [
    { name: 'Brand Primary', hex: '#0EA5E9' },
    { name: 'Surface Dark', hex: '#0F172A' },
  ];

  it('exports Tailwind v4 @theme, CSS :root vars, and W3C Design Tokens JSON', () => {
    const tw = exportDesignTokens(palette, 'tailwind-v4', true);
    expect(tw).toContain('@theme {');
    expect(tw).toContain('--color-brand-primary: oklch(');

    const css = exportDesignTokens(palette, 'css-vars', false);
    expect(css).toContain(':root {');
    expect(css).toContain('--surface-dark: #0F172A;');

    const w3c = JSON.parse(exportDesignTokens(palette, 'w3c-json', true));
    expect(w3c.color['brand-primary'].$type).toBe('color');
    expect(w3c.color['brand-primary'].$value).toBe('#0EA5E9');
    expect(
      w3c.color['brand-primary'].$extensions['dev.chromaloom.oklch']
    ).toContain('oklch(');
  });
});

describe('Pro: gradientBoards (SwatchBoardStore CRUD + JSON import/export)', () => {
  it('creates boards, adds colors, exports JSON, and re-imports cleanly', async () => {
    const store = new SwatchBoardStore(createMemoryStorageAdapter());
    const board = await store.createBoard('Landing Palette', [
      { name: 'accent', hex: '#0EA5E9' },
    ]);
    await store.addColorToBoard(board.id, { name: 'bg', hex: '#0F172A' });

    const json = await store.exportJson();
    expect(json).toContain('chromaloom.boards.v1');

    const store2 = new SwatchBoardStore(createMemoryStorageAdapter());
    const importedCount = await store2.importJson(json);
    expect(importedCount).toBe(1);
    const list = await store2.list();
    expect(list[0].colors).toHaveLength(2);

    await store2.deleteBoard(board.id);
    expect(await store2.list()).toHaveLength(0);
  });
});
