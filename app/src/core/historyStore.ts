import { parseColor } from './colorEngine';
import type { ColorHistoryEntry, KvStorageAdapter } from './types';

export const HISTORY_STORAGE_KEY = 'chromaloom.colorHistory';
const MAX_HISTORY = 200;

export class ColorHistoryStore {
  constructor(private readonly storage: KvStorageAdapter) {}

  async list(): Promise<ColorHistoryEntry[]> {
    const raw = await this.storage.get<ColorHistoryEntry[]>(HISTORY_STORAGE_KEY);
    return Array.isArray(raw) ? raw : [];
  }

  async add(hexInput: string, sourceUrl?: string): Promise<ColorHistoryEntry> {
    const parsed = parseColor(hexInput);
    if (!parsed) {
      throw new Error(`Invalid color value: ${hexInput}`);
    }
    const existing = await this.list();
    const entry: ColorHistoryEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      hex: parsed.hex,
      cssOklch: parsed.cssOklch,
      pickedAtIso: new Date().toISOString(),
      sourceUrl,
    };

    // Deduplicate consecutive identical hex while keeping recent order
    const filtered = existing.filter((e) => e.hex !== parsed.hex);
    const next = [entry, ...filtered].slice(0, MAX_HISTORY);
    await this.storage.set(HISTORY_STORAGE_KEY, next);
    return entry;
  }

  async clear(): Promise<void> {
    await this.storage.set(HISTORY_STORAGE_KEY, []);
  }
}
