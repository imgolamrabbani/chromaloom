import type {
  ExtractedEffect,
  KvStorageAdapter,
  SwatchBoard,
} from '../core/types';

export const BOARDS_STORAGE_KEY = 'chromaloom.swatchBoards';

/**
 * Self-contained DOM collector injected into activeTab via `chrome.scripting.executeScript`
 * to extract live CSS gradients and box-shadows.
 */
export function collectPageEffectsFromDom(): ExtractedEffect[] {
  const seen = new Set<string>();
  const effects: ExtractedEffect[] = [];
  const elements = Array.from(document.querySelectorAll('*')).slice(0, 1200);

  for (const el of elements) {
    const cs = window.getComputedStyle(el);
    const tag = el.tagName.toLowerCase();
    const cls =
      typeof el.className === 'string' && el.className.trim()
        ? `.${el.className.trim().split(/\s+/)[0]}`
        : '';
    const hint = `${tag}${cls}`;

    if (
      cs.backgroundImage &&
      cs.backgroundImage !== 'none' &&
      /gradient\(/i.test(cs.backgroundImage)
    ) {
      const key = `g:${cs.backgroundImage}`;
      if (!seen.has(key)) {
        seen.add(key);
        effects.push({
          kind: 'gradient',
          cssValue: cs.backgroundImage,
          selectorHint: hint,
        });
      }
    }

    if (cs.boxShadow && cs.boxShadow !== 'none') {
      const key = `s:${cs.boxShadow}`;
      if (!seen.has(key)) {
        seen.add(key);
        effects.push({
          kind: 'box-shadow',
          cssValue: cs.boxShadow,
          selectorHint: hint,
        });
      }
    }

    if (effects.length >= 40) break;
  }

  return effects;
}

export class SwatchBoardStore {
  constructor(private readonly storage: KvStorageAdapter) {}

  async list(): Promise<SwatchBoard[]> {
    const raw = await this.storage.get<SwatchBoard[]>(BOARDS_STORAGE_KEY);
    return Array.isArray(raw) ? raw : [];
  }

  async createBoard(
    name: string,
    colors: Array<{ name: string; hex: string }> = []
  ): Promise<SwatchBoard> {
    const now = new Date().toISOString();
    const board: SwatchBoard = {
      id: `board_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: name.trim() || 'Untitled Board',
      createdAtIso: now,
      updatedAtIso: now,
      colors,
    };
    const existing = await this.list();
    await this.storage.set(BOARDS_STORAGE_KEY, [board, ...existing]);
    return board;
  }

  async addColorToBoard(
    boardId: string,
    color: { name: string; hex: string }
  ): Promise<SwatchBoard | null> {
    const boards = await this.list();
    const idx = boards.findIndex((b) => b.id === boardId);
    if (idx === -1) return null;
    const updated: SwatchBoard = {
      ...boards[idx],
      updatedAtIso: new Date().toISOString(),
      colors: [...boards[idx].colors, color],
    };
    boards[idx] = updated;
    await this.storage.set(BOARDS_STORAGE_KEY, boards);
    return updated;
  }

  async deleteBoard(boardId: string): Promise<void> {
    const boards = await this.list();
    await this.storage.set(
      BOARDS_STORAGE_KEY,
      boards.filter((b) => b.id !== boardId)
    );
  }

  async exportJson(): Promise<string> {
    const boards = await this.list();
    return (
      JSON.stringify(
        {
          schema: 'chromaloom.boards.v1',
          exportedAt: new Date().toISOString(),
          boards,
        },
        null,
        2
      ) + '\n'
    );
  }

  async importJson(jsonText: string): Promise<number> {
    const parsed = JSON.parse(jsonText) as { boards?: SwatchBoard[] };
    if (!Array.isArray(parsed.boards)) {
      throw new Error('Invalid ChromaLoom boards JSON: missing boards array.');
    }
    const existing = await this.list();
    const existingIds = new Set(existing.map((b) => b.id));
    const additions = parsed.boards.filter(
      (b) => b && typeof b.name === 'string' && Array.isArray(b.colors) && !existingIds.has(b.id)
    );
    await this.storage.set(BOARDS_STORAGE_KEY, [...additions, ...existing]);
    return additions.length;
  }
}
