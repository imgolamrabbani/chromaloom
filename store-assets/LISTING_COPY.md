# ChromaLoom — Store Listing Copy & Reviewer Notes (`LISTING_COPY.md`)

Ready-to-paste metadata, descriptions, permission justifications, and privacy disclosures for **Microsoft Edge Add-ons** ($0), **Firefox Add-ons (AMO)** ($0), and **Chrome Web Store**.

---

## 1. Store Metadata

- **Extension Name:** `ChromaLoom — OKLCH, Palette & WCAG 2.2 Contrast Studio`
- **Short Description (132 chars max):**
  `Cross-browser MV3 eyedropper, page palette scanner, exact OKLCH converter, WCAG 2.2 + APCA contrast solver & Tailwind v4 export.`
- **Category:** `Developer Tools`
- **Firefox Gecko ID:** `chromaloom@caliberhttp.dev`
- **Assets Included (`products/chromaloom/store-assets/`):**
  - `icon-16.png` (16×16 PNG)
  - `icon-48.png` (48×48 PNG)
  - `icon-128.png` (128×128 PNG)
  - `icon-256.png` (256×256 PNG)
  - `banner.png` (1280×640 PNG)
  - `screenshot-1-picker.png` (1280×800 PNG)
  - `screenshot-2-wcag-apca.png` (1280×800 PNG)
  - `screenshot-3-tokens-boards.png` (1280×800 PNG)

---

## 2. Full Store Description

```markdown
ChromaLoom is a fast, privacy-first Manifest V3 color picker, palette extractor, and WCAG 2.2 / APCA contrast studio built for frontend engineers and designers.

Zero `<all_urls>` permissions. Zero cookies access. Zero telemetry.

### Free Forever ($0)
- **Cross-Browser Eyedropper:** Uses native `window.EyeDropper` on Edge/Chrome and a crisp `captureVisibleTab` 11×11 Canvas zoom loupe on Firefox.
- **Exact Color Conversions:** Instant HEX, RGB, HSL, and exact Björn Ottosson **OKLCH** readout (`oklch(L C H)`).
- **One-Click Page Palette Scanner:** Extract computed colors from the active tab without broad host permissions.
- **Persistent Local History:** Up to 200 recent picks stored locally in `chrome.storage.local` with one-click clipboard copy.
- **Light & Dark Theme:** Clean, accessible popup UI.

### ChromaLoom Pro (Optional Power Tools)
Upgrade once (**$19 Early Bird** / **$24 Perpetual One-Time** or **$5/mo**) via Polar.sh—no cloud account required, with a **14-day offline grace cache**:
- **WCAG 2.2 & APCA `Lc` Contrast Auditor:** Live AA/AAA + perceptual `Lc` scoring with an **OKLCH binary-search shade solver** that suggests the nearest compliant foreground/background shade without shifting hue.
- **Design Token Exporter:** Export palettes directly to **Tailwind v4 `@theme`**, **CSS Custom Properties (`:root`)**, or **W3C Design Tokens JSON**.
- **Gradient & Box-Shadow Inspector + Swatch Boards:** Inspect active-tab CSS gradients/shadows and organize persistent local swatch boards with JSON import/export.
```

---

## 3. Firefox AMO & Edge Add-ons Reviewer Notes

### Permission Justifications (Minimal MV3 Set)
- `activeTab`: Required solely when the user clicks the ChromaLoom toolbar icon or triggers the Page Palette Scanner / Firefox Canvas Loupe (`captureVisibleTab`) on the currently active tab. Avoids `<all_urls>`.
- `scripting`: Required solely to execute the on-demand `scripting.executeScript` page palette / gradient / box-shadow reader on the user's active tab.
- `storage`: Required to store the user's local color history (200 entries), local swatch boards, theme preference, and optional Polar.sh license state in `chrome.storage.local`.
- `clipboardWrite`: Required for one-click copying of HEX/RGB/HSL/OKLCH values and exported Tailwind v4 / CSS tokens.

### Reproducible Build & Privacy Statement
- **Zero Remote Code:** All UI and color math are bundled locally in the extension zip (`chromaloom-firefox-source-1.0.0.zip` includes `BUILD.md` for full source verification).
- **Zero Telemetry:** No analytics, crash reporting, or browsing history collection. Outbound network calls occur only if the user enters a Polar.sh Pro license key (`https://api.polar.sh/v1/customer-portal/license-keys/*`).
