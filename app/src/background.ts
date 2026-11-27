import { launchFirefoxLoupeOverlay } from './core/firefoxLoupe';
import { ColorHistoryStore } from './core/historyStore';
import type { KvStorageAdapter } from './core/types';

declare const chrome: {
  runtime: {
    onMessage: {
      addListener(
        cb: (
          msg: Record<string, unknown>,
          sender: unknown,
          sendResponse: (res: unknown) => void
        ) => boolean | void
      ): void;
    };
  };
  tabs: {
    query(queryInfo: { active: boolean; currentWindow: boolean }): Promise<Array<{ id?: number; url?: string }>>;
    captureVisibleTab(
      windowId: number | undefined,
      options: { format: 'png' }
    ): Promise<string>;
  };
  scripting: {
    executeScript(injection: {
      target: { tabId: number };
      func: (...args: string[]) => void;
      args?: string[];
    }): Promise<unknown>;
  };
  storage: {
    local: {
      get(keys: string[]): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
      remove(keys: string[]): Promise<void>;
    };
  };
};

const browserStorage: KvStorageAdapter = {
  async get<T>(key: string): Promise<T | undefined> {
    const obj = await chrome.storage.local.get([key]);
    return obj[key] as T | undefined;
  },
  async set<T>(key: string, value: T): Promise<void> {
    await chrome.storage.local.set({ [key]: value });
  },
  async remove(key: string): Promise<void> {
    await chrome.storage.local.remove([key]);
  },
};

const historyStore = new ColorHistoryStore(browserStorage);

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'START_FIREFOX_PICKER') {
    (async () => {
      try {
        const [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        if (!tab?.id) {
          sendResponse({ ok: false, error: 'No active tab found.' });
          return;
        }
        const dataUrl = await chrome.tabs.captureVisibleTab(undefined, {
          format: 'png',
        });
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: launchFirefoxLoupeOverlay,
          args: [dataUrl],
        });
        sendResponse({ ok: true });
      } catch (err) {
        sendResponse({
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    })();
    return true;
  }

  if (msg?.type === 'FIREFOX_PICK_COMPLETE' && typeof msg.hex === 'string') {
    void historyStore.add(
      msg.hex,
      typeof msg.sourceUrl === 'string' ? msg.sourceUrl : undefined
    );
    sendResponse({ ok: true });
    return false;
  }

  return false;
});
