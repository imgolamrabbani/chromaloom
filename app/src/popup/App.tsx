import React, { useEffect, useMemo, useState } from 'react';
import { copyTextReliable } from '../core/clipboard';
import { parseColor } from '../core/colorEngine';
import { ColorHistoryStore } from '../core/historyStore';
import {
  aggregateScannedColors,
  collectPageColorsFromDom,
} from '../core/pageScanner';
import type {
  ColorHistoryEntry,
  ExtractedEffect,
  ScannedSwatch,
  SwatchBoard,
  TokenExportFormat,
} from '../core/types';
import {
  DEFAULT_POLAR_ORGANIZATION_ID,
  FeatureGate,
  LicenseManager,
  PRO_FEATURE_LABELS,
  createChromeStorageAdapter,
  type LicenseState,
  type ProFeatureId,
} from '../licensing';
import {
  SwatchBoardStore,
  collectPageEffectsFromDom,
} from '../pro/gradientBoards';
import { exportDesignTokens } from '../pro/tokenExporter';
import { auditContrast } from '../pro/wcagAuditor';

const CHECKOUT_URL = 'https://imgolamrabbani.github.io/chromaloom/#pricing';

declare global {
  interface Window {
    EyeDropper?: new () => { open(): Promise<{ sRGBHex: string }> };
  }
}

const browserApi = (
  globalThis as unknown as {
    chrome?: {
      tabs?: {
        query(q: { active: boolean; currentWindow: boolean }): Promise<Array<{ id?: number; url?: string }>>;
      };
      scripting?: {
        executeScript<T>(opts: { target: { tabId: number }; func: () => T }): Promise<Array<{ result: T }>>;
      };
      runtime?: {
        sendMessage(msg: unknown): Promise<{ ok?: boolean; error?: string }>;
      };
    };
  }
).chrome;

type TabId = 'picker' | 'palette' | 'contrast' | 'tokens' | 'boards';

export const App: React.FC = () => {
  const storage = useMemo(() => createChromeStorageAdapter(), []);
  const licenseManager = useMemo(
    () =>
      new LicenseManager(storage, {
        organizationId: DEFAULT_POLAR_ORGANIZATION_ID,
      }),
    [storage]
  );
  const featureGate = useMemo(
    () => new FeatureGate(licenseManager, CHECKOUT_URL),
    [licenseManager]
  );
  const historyStore = useMemo(() => new ColorHistoryStore(storage), [storage]);
  const boardStore = useMemo(() => new SwatchBoardStore(storage), [storage]);

  const [tab, setTab] = useState<TabId>('picker');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [activeHex, setActiveHex] = useState('#0EA5E9');
  const [bgHex, setBgHex] = useState('#0F172A');
  const [history, setHistory] = useState<ColorHistoryEntry[]>([]);
  const [swatches, setSwatches] = useState<ScannedSwatch[]>([]);
  const [effects, setEffects] = useState<ExtractedEffect[]>([]);
  const [boards, setBoards] = useState<SwatchBoard[]>([]);
  const [newBoardName, setNewBoardName] = useState('');
  const [tokenFormat, setTokenFormat] = useState<TokenExportFormat>('tailwind-v4');
  const [license, setLicense] = useState<LicenseState>({
    tier: 'free',
    offlineGraceActive: false,
  });
  const [showLicenseModal, setShowLicenseModal] = useState(false);
  const [licenseInput, setLicenseInput] = useState('');
  const [proGateNotice, setProGateNotice] = useState<ProFeatureId | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const notify = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    void (async () => {
      const lic = await licenseManager.init();
      setLicense(lic);
      setHistory(await historyStore.list());
      setBoards(await boardStore.list());
      const refreshed = await licenseManager.refreshIfNeeded();
      setLicense(refreshed);
    })();
  }, [licenseManager, historyStore, boardStore]);

  const parsed = useMemo(
    () => parseColor(activeHex) ?? parseColor('#0EA5E9')!,
    [activeHex]
  );

  const contrastResult = useMemo(() => {
    try {
      return auditContrast(activeHex, bgHex);
    } catch {
      return null;
    }
  }, [activeHex, bgHex]);

  const tokenPalette = useMemo(() => {
    if (swatches.length > 0) {
      return swatches.slice(0, 12).map((s, idx) => ({
        name: `${s.roles[0] || 'swatch'}-${idx + 1}`,
        hex: s.hex,
      }));
    }
    if (history.length > 0) {
      return history.slice(0, 12).map((h, idx) => ({
        name: `picked-${idx + 1}`,
        hex: h.hex,
      }));
    }
    return [
      { name: 'primary', hex: parsed.hex },
      { name: 'surface', hex: bgHex },
    ];
  }, [swatches, history, parsed.hex, bgHex]);

  const tokenOutput = useMemo(
    () => exportDesignTokens(tokenPalette, tokenFormat, true),
    [tokenPalette, tokenFormat]
  );

  const handleCopy = async (text: string) => {
    const ok = await copyTextReliable(text);
    notify(ok ? `Copied ${text}` : 'Copy failed — select manually');
  };

  const handlePickColor = async () => {
    if (window.EyeDropper) {
      try {
        const res = await new window.EyeDropper().open();
        const hex = res.sRGBHex.toUpperCase();
        setActiveHex(hex);
        await historyStore.add(hex);
        setHistory(await historyStore.list());
        await handleCopy(hex);
      } catch {
        // User cancelled EyeDropper
      }
      return;
    }

    // Firefox fallback via background captureVisibleTab + Canvas loupe
    if (browserApi?.runtime?.sendMessage) {
      const resp = await browserApi.runtime.sendMessage({
        type: 'START_FIREFOX_PICKER',
      });
      if (resp?.ok) {
        window.close();
      } else {
        notify(resp?.error || 'Open a regular web page to pick pixels.');
      }
    } else {
      notify('EyeDropper unavailable in this browser context.');
    }
  };

  const handleScanPage = async () => {
    try {
      const tabs = await browserApi?.tabs?.query({
        active: true,
        currentWindow: true,
      });
      const tabId = tabs?.[0]?.id;
      if (!tabId || !browserApi?.scripting) {
        notify('Open a web page to scan its palette.');
        return;
      }
      const res = await browserApi.scripting.executeScript({
        target: { tabId },
        func: collectPageColorsFromDom,
      });
      const rawSamples = res?.[0]?.result ?? [];
      const aggregated = aggregateScannedColors(rawSamples);
      setSwatches(aggregated);
      notify(`Extracted ${aggregated.length} unique page colors`);
    } catch {
      notify('Cannot scan restricted browser pages.');
    }
  };

  const handleScanEffects = async () => {
    if (
      !featureGate.requirePro('gradient_boards', (f) => setProGateNotice(f))
    ) {
      return;
    }
    try {
      const tabs = await browserApi?.tabs?.query({
        active: true,
        currentWindow: true,
      });
      const tabId = tabs?.[0]?.id;
      if (!tabId || !browserApi?.scripting) return;
      const res = await browserApi.scripting.executeScript({
        target: { tabId },
        func: collectPageEffectsFromDom,
      });
      const list = res?.[0]?.result ?? [];
      setEffects(list);
      notify(`Extracted ${list.length} gradients & shadows`);
    } catch {
      notify('Cannot inspect restricted browser pages.');
    }
  };

  const requireProTab = (feature: ProFeatureId, targetTab: TabId) => {
    if (featureGate.requirePro(feature, (f) => setProGateNotice(f))) {
      setProGateNotice(null);
      setTab(targetTab);
    } else {
      setTab(targetTab);
    }
  };

  return (
    <div className="app">
      <div className="header">
        <div className="row">
          <strong>ChromaLoom</strong>
          <span
            className={`badge ${license.tier === 'pro' ? 'badge-pro' : ''}`}
          >
            {license.tier === 'pro' ? 'PRO' : 'FREE'}
          </span>
        </div>
        <div className="row">
          <button
            className="btn"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            title="Toggle Light / Dark theme"
          >
            {theme === 'dark' ? 'Light' : 'Dark'}
          </button>
          <button
            className="btn btn-primary"
            onClick={() => setShowLicenseModal((v) => !v)}
          >
            {license.tier === 'pro' ? 'License' : 'Pro Key'}
          </button>
        </div>
      </div>

      {showLicenseModal && (
        <div className="card" style={{ margin: 10 }}>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
            <strong>ChromaLoom Pro License</strong>
            <button className="btn" onClick={() => setShowLicenseModal(false)}>
              ×
            </button>
          </div>
          {license.tier === 'pro' ? (
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="muted">
                Active: {license.keyMask}
                {license.offlineGraceActive ? ' (Offline Grace)' : ''}
              </span>
              <button
                className="btn"
                onClick={async () => {
                  setLicense(await licenseManager.deactivate());
                  notify('License deactivated');
                }}
              >
                Deactivate
              </button>
            </div>
          ) : (
            <div className="row">
              <input
                className="input"
                style={{ flex: 1 }}
                placeholder="CHROMA-XXXX-XXXX-XXXX"
                value={licenseInput}
                onChange={(e) => setLicenseInput(e.target.value)}
              />
              <button
                className="btn btn-primary"
                onClick={async () => {
                  try {
                    const next = await licenseManager.activate(licenseInput);
                    setLicense(next);
                    setLicenseInput('');
                    setProGateNotice(null);
                    setShowLicenseModal(false);
                    notify('ChromaLoom Pro activated!');
                  } catch (err) {
                    notify(err instanceof Error ? err.message : 'Activation failed');
                  }
                }}
              >
                Activate
              </button>
            </div>
          )}
        </div>
      )}

      <div className="tabs">
        <button
          className={`tab ${tab === 'picker' ? 'active' : ''}`}
          onClick={() => setTab('picker')}
        >
          Picker
        </button>
        <button
          className={`tab ${tab === 'palette' ? 'active' : ''}`}
          onClick={() => setTab('palette')}
        >
          Palette
        </button>
        <button
          className={`tab ${tab === 'contrast' ? 'active' : ''}`}
          onClick={() => requireProTab('wcag_auditor', 'contrast')}
        >
          WCAG/APCA
        </button>
        <button
          className={`tab ${tab === 'tokens' ? 'active' : ''}`}
          onClick={() => requireProTab('token_export', 'tokens')}
        >
          Tokens
        </button>
        <button
          className={`tab ${tab === 'boards' ? 'active' : ''}`}
          onClick={() => requireProTab('gradient_boards', 'boards')}
        >
          Boards
        </button>
      </div>

      <div className="panel">
        {tab === 'picker' && (
          <div>
            <div className="swatch-hero">
              <div
                className="swatch-box"
                style={{ background: parsed.hex }}
              />
              <div style={{ flex: 1 }}>
                <div className="row" style={{ marginBottom: 6 }}>
                  <input
                    type="color"
                    value={parsed.hex}
                    onChange={(e) => setActiveHex(e.target.value.toUpperCase())}
                  />
                  <input
                    className="input"
                    style={{ width: 110 }}
                    value={activeHex}
                    onChange={(e) => setActiveHex(e.target.value)}
                  />
                  <button
                    className="btn btn-primary"
                    onClick={handlePickColor}
                  >
                    Pick Pixel
                  </button>
                </div>
                <span className="muted">
                  100% local · Zero &lt;all_urls&gt; · Persistent history
                </span>
              </div>
            </div>

            {[
              ['HEX', parsed.hex],
              ['RGB', parsed.cssRgb],
              ['HSL', parsed.cssHsl],
              ['OKLCH', parsed.cssOklch],
            ].map(([label, val]) => (
              <div className="copy-row" key={label}>
                <span>
                  <strong className="muted">{label}</strong> {val}
                </span>
                <button className="btn" onClick={() => void handleCopy(val)}>
                  Copy
                </button>
              </div>
            ))}

            <div className="row" style={{ justifyContent: 'space-between', margin: '10px 0 6px' }}>
              <strong>Recent History ({history.length})</strong>
              {history.length > 0 && (
                <button
                  className="btn"
                  onClick={async () => {
                    await historyStore.clear();
                    setHistory([]);
                  }}
                >
                  Clear
                </button>
              )}
            </div>
            {history.length === 0 ? (
              <p className="muted">
                Pick any pixel or save a color — your last 200 colors persist locally.
              </p>
            ) : (
              <div className="history-grid">
                {history.slice(0, 32).map((h) => (
                  <button
                    key={h.id}
                    className="chip"
                    style={{ background: h.hex }}
                    title={`${h.hex} · ${h.cssOklch}`}
                    onClick={() => {
                      setActiveHex(h.hex);
                      void handleCopy(h.hex);
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'palette' && (
          <div>
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
              <button className="btn btn-primary" onClick={handleScanPage}>
                Scan Active Tab Palette
              </button>
              <span className="muted">{swatches.length} unique colors</span>
            </div>
            {swatches.map((s) => (
              <div className="copy-row" key={s.hex}>
                <div className="row">
                  <span
                    className="chip"
                    style={{ width: 22, height: 22, background: s.hex }}
                  />
                  <div>
                    <div>{s.hex}</div>
                    <div className="muted">
                      {s.cssOklch} · {s.roles.join(', ')} ({s.count})
                    </div>
                  </div>
                </div>
                <button
                  className="btn"
                  onClick={() => {
                    setActiveHex(s.hex);
                    void handleCopy(s.hex);
                  }}
                >
                  Copy
                </button>
              </div>
            ))}
          </div>
        )}

        {tab === 'contrast' && (
          <div>
            {!featureGate.isAllowed('wcag_auditor') ? (
              <div className="card">
                <strong>{PRO_FEATURE_LABELS.wcag_auditor.title} (Pro)</strong>
                <p className="muted">{PRO_FEATURE_LABELS.wcag_auditor.summary}</p>
                <div className="row">
                  <a
                    className="btn btn-primary"
                    href={CHECKOUT_URL}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Upgrade to Pro
                  </a>
                  <button
                    className="btn"
                    onClick={() => setShowLicenseModal(true)}
                  >
                    Activate Key
                  </button>
                </div>
              </div>
            ) : contrastResult ? (
              <div>
                <div className="row" style={{ marginBottom: 10 }}>
                  <label className="muted">FG</label>
                  <input
                    type="color"
                    value={contrastResult.foregroundHex}
                    onChange={(e) => setActiveHex(e.target.value.toUpperCase())}
                  />
                  <label className="muted">BG</label>
                  <input
                    type="color"
                    value={contrastResult.backgroundHex}
                    onChange={(e) => setBgHex(e.target.value.toUpperCase())}
                  />
                </div>
                <div
                  className="card"
                  style={{
                    background: contrastResult.backgroundHex,
                    color: contrastResult.foregroundHex,
                    textAlign: 'center',
                    fontWeight: 600,
                  }}
                >
                  Sample Contrast Preview (Aa Bb 123)
                </div>
                <div className="card">
                  <div>
                    WCAG 2.2 Ratio: <strong>{contrastResult.wcagRatio}:1</strong> · APCA:{' '}
                    <strong>Lc {contrastResult.apcaLc}</strong>
                  </div>
                  <div className="row" style={{ marginTop: 6 }}>
                    <span className={contrastResult.aaNormal ? 'ok' : 'err'}>
                      AA Normal: {contrastResult.aaNormal ? 'PASS' : 'FAIL'}
                    </span>
                    <span className={contrastResult.aaaNormal ? 'ok' : 'err'}>
                      AAA Normal: {contrastResult.aaaNormal ? 'PASS' : 'FAIL'}
                    </span>
                  </div>
                  {contrastResult.suggestedAaHex && (
                    <div className="row" style={{ marginTop: 8 }}>
                      <span className="muted">
                        Nearest OKLCH AA Shade: <code>{contrastResult.suggestedAaHex}</code>
                      </span>
                      <button
                        className="btn btn-primary"
                        onClick={() => setActiveHex(contrastResult.suggestedAaHex!)}
                      >
                        Apply Fix
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        )}

        {tab === 'tokens' && (
          <div>
            {!featureGate.isAllowed('token_export') ? (
              <div className="card">
                <strong>{PRO_FEATURE_LABELS.token_export.title} (Pro)</strong>
                <p className="muted">{PRO_FEATURE_LABELS.token_export.summary}</p>
                <div className="row">
                  <a
                    className="btn btn-primary"
                    href={CHECKOUT_URL}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Upgrade to Pro
                  </a>
                  <button
                    className="btn"
                    onClick={() => setShowLicenseModal(true)}
                  >
                    Activate Key
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div className="row" style={{ marginBottom: 8 }}>
                  <select
                    className="select"
                    value={tokenFormat}
                    onChange={(e) =>
                      setTokenFormat(e.target.value as TokenExportFormat)
                    }
                  >
                    <option value="tailwind-v4">Tailwind v4 @theme</option>
                    <option value="css-vars">CSS Custom Properties</option>
                    <option value="w3c-json">W3C Design Tokens JSON</option>
                  </select>
                  <button
                    className="btn btn-primary"
                    onClick={() => void handleCopy(tokenOutput)}
                  >
                    Copy Tokens
                  </button>
                </div>
                <textarea
                  className="textarea"
                  readOnly
                  style={{ minHeight: 260 }}
                  value={tokenOutput}
                />
              </div>
            )}
          </div>
        )}

        {tab === 'boards' && (
          <div>
            {!featureGate.isAllowed('gradient_boards') ? (
              <div className="card">
                <strong>{PRO_FEATURE_LABELS.gradient_boards.title} (Pro)</strong>
                <p className="muted">{PRO_FEATURE_LABELS.gradient_boards.summary}</p>
                <div className="row">
                  <a
                    className="btn btn-primary"
                    href={CHECKOUT_URL}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Upgrade to Pro
                  </a>
                  <button
                    className="btn"
                    onClick={() => setShowLicenseModal(true)}
                  >
                    Activate Key
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div className="row" style={{ marginBottom: 8 }}>
                  <input
                    className="input"
                    style={{ flex: 1 }}
                    placeholder="New board name..."
                    value={newBoardName}
                    onChange={(e) => setNewBoardName(e.target.value)}
                  />
                  <button
                    className="btn btn-primary"
                    onClick={async () => {
                      await boardStore.createBoard(newBoardName, [
                        { name: 'primary', hex: parsed.hex },
                      ]);
                      setNewBoardName('');
                      setBoards(await boardStore.list());
                    }}
                  >
                    + Board
                  </button>
                  <button className="btn" onClick={handleScanEffects}>
                    Inspect Gradients
                  </button>
                </div>

                {boards.map((b) => (
                  <div className="card" key={b.id}>
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <strong>{b.name}</strong>
                      <div className="row">
                        <button
                          className="btn"
                          onClick={async () => {
                            await boardStore.addColorToBoard(b.id, {
                              name: `color-${b.colors.length + 1}`,
                              hex: parsed.hex,
                            });
                            setBoards(await boardStore.list());
                          }}
                        >
                          + Current
                        </button>
                        <button
                          className="btn"
                          onClick={async () => {
                            await boardStore.deleteBoard(b.id);
                            setBoards(await boardStore.list());
                          }}
                        >
                          ×
                        </button>
                      </div>
                    </div>
                    <div className="row" style={{ marginTop: 6 }}>
                      {b.colors.map((c, idx) => (
                        <span
                          key={idx}
                          className="chip"
                          style={{ width: 24, height: 24, background: c.hex }}
                          title={`${c.name}: ${c.hex}`}
                        />
                      ))}
                    </div>
                  </div>
                ))}

                {effects.length > 0 && (
                  <div className="card">
                    <strong>Page Gradients &amp; Box-Shadows ({effects.length})</strong>
                    {effects.slice(0, 8).map((ef, idx) => (
                      <div className="copy-row" key={idx} style={{ marginTop: 6 }}>
                        <span className="muted">
                          [{ef.kind}] {ef.cssValue.slice(0, 48)}
                        </span>
                        <button
                          className="btn"
                          onClick={() => void handleCopy(ef.cssValue)}
                        >
                          Copy
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {proGateNotice && !featureGate.isAllowed(proGateNotice) && (
          <p className="muted">
            Unlock {PRO_FEATURE_LABELS[proGateNotice].title} with a ChromaLoom Pro license.
          </p>
        )}
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
};
