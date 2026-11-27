# Reproducible Build Instructions (Firefox AMO Review)

**Extension:** ChromaLoom v1.0.0 (`chromaloom@caliberhttp.dev`)

## Environment Requirements

- **Node.js:** v20.x or v22.x (tested on Node.js v20+ / v22+ / v26+)
- **npm:** v10+
- **zip:** standard POSIX `zip` CLI utility

## Exact Build Steps

From the unpacked root of `chromaloom-firefox-source-1.0.0.zip`:

```bash
npm ci
npm run typecheck
npm test
npm run package:all
```

## Build Outputs

The script produces:
- `dist/` — compiled popup bundle (`index.html`, `assets/popup.js`, `assets/popup.css`), `background.js`, and `icons/`
- `../dist-packages/chromaloom-firefox-1.0.0.zip` — Firefox MV3 package (uses `manifest.firefox.json` as `manifest.json`)
- `../dist-packages/chromaloom-edge-chrome-1.0.0.zip` — Edge/Chrome MV3 package (uses `manifest.edge-chrome.json` as `manifest.json`)

## Permissions & Privacy Audit Notes

- Permissions are strictly minimal: `activeTab`, `scripting`, `storage`, `clipboardWrite`.
- Zero `<all_urls>`, zero `cookies`, zero `webRequest`, zero remote executable code, zero `eval()`.
- All color conversion, OKLCH math, WCAG 2.2 / APCA auditing, DOM palette scanning, and token exports run 100% locally.
- The only external network calls occur when a user voluntarily activates or validates a Pro license key against Polar.sh's public Customer Portal API (`https://api.polar.sh/v1/customer-portal/license-keys/*`).
