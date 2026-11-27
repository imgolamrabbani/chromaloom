export interface RgbColor {
  r: number; // 0..255
  g: number; // 0..255
  b: number; // 0..255
  a: number; // 0..1
}

export interface HslColor {
  h: number; // 0..360
  s: number; // 0..100
  l: number; // 0..100
  a: number; // 0..1
}

export interface OklchColor {
  l: number; // 0..1
  c: number; // 0..0.4
  h: number; // 0..360
  a: number; // 0..1
}

export interface ParsedColor {
  hex: string;      // "#RRGGBB" (uppercase)
  hex8: string;     // "#RRGGBBAA"
  rgb: RgbColor;
  hsl: HslColor;
  oklch: OklchColor;
  cssRgb: string;   // "rgb(14, 165, 233)"
  cssHsl: string;   // "hsl(199, 89%, 48%)"
  cssOklch: string; // "oklch(0.685 0.169 237.3)"
}

export interface ColorHistoryEntry {
  id: string;
  hex: string;
  cssOklch: string;
  pickedAtIso: string;
  sourceUrl?: string;
}

export interface ScannedSwatch {
  hex: string;
  cssOklch: string;
  count: number;
  roles: Array<'background' | 'text' | 'border' | 'accent'>;
}

export interface ContrastAuditResult {
  foregroundHex: string;
  backgroundHex: string;
  wcagRatio: number;
  apcaLc: number;
  aaNormal: boolean;
  aaLarge: boolean;
  aaaNormal: boolean;
  aaaLarge: boolean;
  suggestedAaHex?: string;
  suggestedAaaHex?: string;
}

export type TokenExportFormat = 'tailwind-v4' | 'css-vars' | 'w3c-json';

export interface ExtractedEffect {
  kind: 'gradient' | 'box-shadow';
  cssValue: string;
  selectorHint: string;
}

export interface SwatchBoard {
  id: string;
  name: string;
  createdAtIso: string;
  updatedAtIso: string;
  colors: Array<{ name: string; hex: string }>;
}

export interface KvStorageAdapter {
  get<T = unknown>(key: string): Promise<T | undefined>;
  set<T = unknown>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
}
