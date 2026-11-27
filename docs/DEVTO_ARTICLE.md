---
title: "Building a Zero-Permission OKLCH, WCAG 2.2 & APCA Contrast Studio as a Cross-Browser MV3 Extension"
published: true
tags: webdev, css, accessibility, typescript
---

Browser color pickers haven't aged well. Legacy extensions like ColorZilla still request broad host permissions, lose picked colors, or break clipboard copy on macOS—and none of them speak **OKLCH**, **WCAG 2.2 + APCA `Lc`**, or **Tailwind v4 `@theme`** tokens.

We built **[ChromaLoom](https://imgolamrabbani.github.io/chromaloom/)** to bring modern perceptual color math and contrast auditing into a zero-`<all_urls>`, cross-browser Manifest V3 extension for Edge, Firefox, and Chrome. Here is a look at the color math, contrast solver, and MV3 architecture under the hood.

---

## 1. Björn Ottosson's OKLCH Perceptual Math in Pure TypeScript

HSL is convenient, but its lightness (`L`) is notoriously non-uniform: `hsl(60, 100%, 50%)` (yellow) looks blindingly bright compared to `hsl(240, 100%, 50%)` (blue) at the exact same `50%` lightness.

In `colorEngine.ts`, ChromaLoom implements Björn Ottosson's exact **Oklab / OKLCH** forward and inverse transforms with zero external color libraries:

1. **sRGB → Linear sRGB:** Undo the sRGB gamma transfer curve per channel (`c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4`).
2. **Linear sRGB → LMS:** Multiply by the calibrated 3×3 cone-response matrix (`l`, `m`, `s`).
3. **Non-linearity (`Math.cbrt`):** Apply cube-root compression to `l`, `m`, `s`.
4. **LMS → Oklab (`L, a, b`) → OKLCH (`L, C, H`):** Compute polar chroma `C = Math.hypot(a, b)` and hue `H = (Math.atan2(b, a) * 180) / Math.PI` (normalized to `[0, 360)`).
5. **Inverse & Clamping:** Reverse the matrix and clamp sRGB channels to `[0, 1]` when mapping back to `#RRGGBB`.

Because OKLCH separates perceptual lightness `L` from chroma `C` and hue `H`, adjusting `L` keeps the perceived hue steady—which is the exact property our contrast solver relies on.

---

## 2. Why WCAG 2.2 Luminance and APCA `Lc` Diverge on Dark UIs

WCAG 2.2 contrast ratios remain the legal baseline (`4.5:1` for AA normal text, `3.0:1` for AA large, `7.0:1` for AAA), calculated symmetrically from relative luminance:

```ts
const L = 0.2126 * R_lin + 0.7152 * G_lin + 0.0722 * B_lin;
const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
```

However, WCAG 2.2's symmetric ratio is famously blind to **polarity** on dark backgrounds: white-on-blue or mid-gray-on-charcoal can pass `4.5:1` while feeling illegible, or fail `4.5:1` despite reading crisply.

In `wcagAuditor.ts`, ChromaLoom computes **both** WCAG 2.2 ratios and **APCA `Lc` (W3 0.0.98G-4g)** side by side:
- APCA uses a `2.4` sRGB power curve (`0.2126729 R + 0.7151522 G + 0.0721750 B`) with a `0.022` black soft-clamp.
- It applies **asymmetric polarity exponents**: `0.56` / `0.57` for dark-on-light (`BoW`) vs. `0.65` / `0.62` for light-on-dark (`WoB`), scaled by `1.14`.
- The signed `apcaLc` (`-108` to `+106`) immediately tells you whether a dark-mode surface pair actually has enough perceptual contrast for body text (`|Lc| >= 60`–`75`) even when WCAG 2.2 says `4.6:1`.

---

## 3. Binary-Searching OKLCH Lightness `L` Without Shifting Hue

When a foreground/background pair fails AA (`4.5:1`) or AAA (`7.0:1`), most tools tell you *that* it failed and leave you guessing a replacement hex.

ChromaLoom's compliant shade solver binary-searches **only OKLCH lightness `L`** while holding the original hue `H` and chroma `C` constant:

1. Determine search direction from the background luminance (darken toward `L = 0` on light backgrounds, lighten toward `L = 1` on dark backgrounds).
2. Run a fixed-iteration binary search on `L` in `[0, currentL]` or `[currentL, 1]`, converting each candidate `(L_mid, C, H)` back to clamped sRGB and evaluating `wcagRatio`.
3. Converge on the **minimal perceptual lightness shift** that satisfies `>= 4.5` (`suggestedAaHex`) and `>= 7.0` (`suggestedAaaHex`).

The result is a drop-in accessible shade that still belongs to the exact same brand hue.

---

## 4. Dual Edge/Chrome + Firefox MV3 Bundles With Zero `<all_urls>`

Store review rejections and user privacy distrust almost always trace back to over-broad host permissions (`<all_urls>` or `cookies`). ChromaLoom ships with **only four minimal MV3 permissions**:

```json
"permissions": ["activeTab", "scripting", "storage", "clipboardWrite"]
```

- **Zero `<all_urls>`:** Page palette scanning (`pageScanner.ts`) and gradient/shadow extraction only run on the current tab at the exact moment you click **Scan Page**, via `chrome.scripting.executeScript` on `activeTab`.
- **Cross-Browser Eyedropper:** On Edge and Chrome, ChromaLoom invokes the native `window.EyeDropper` API. On Firefox (which lacks `EyeDropper`), `background.ts` captures the active viewport via `chrome.tabs.captureVisibleTab(undefined, { format: 'png' })` and injects `firefoxLoupe.ts` to render an 11×11 zoomed Canvas pixel loupe with live HEX/OKLCH readout.
- **Dual Manifest Packaging:** `package-zips.mjs` emits both `chromaloom-edge-chrome-1.0.0.zip` (`background.service_worker`) and `chromaloom-firefox-1.0.0.zip` (`browser_specific_settings.gecko.id: "chromaloom@caliberhttp.dev"` + `background.scripts`), alongside a reproducible source archive (`chromaloom-firefox-source-1.0.0.zip`) for AMO reviewers.

---

## 5. Free vs. Pro Split (Zero Telemetry, Zero Login)

Everything you need for daily picking, conversions, and page inspection is **Free Forever**:
- **Free ($0 Forever):** Cross-browser eyedropper & 11×11 Canvas loupe, instant HEX/RGB/HSL/OKLCH conversion, bulletproof macOS-safe clipboard copy, persistent 200-color `chrome.storage.local` history, and one-click Page Palette Scanner.
- **Pro ($19 Early Bird one-time / $5/mo):** WCAG 2.2 AA/AAA + APCA `Lc` Contrast Auditor with OKLCH binary-search shade solver, Design Token Exporter (Tailwind v4 `@theme`, CSS `:root` variables, W3C Design Tokens JSON), and CSS Gradient/Box-Shadow Inspector + local Swatch Boards.

Pro licensing uses Polar.sh (`api.polar.sh`) with a 72-hour local cache and a **14-day offline grace window**—zero telemetry, zero analytics, and zero background calls in Free.

---

## Try ChromaLoom

- **GitHub Repository:** [github.com/imgolamrabbani/chromaloom](https://github.com/imgolamrabbani/chromaloom)
- **Release Bundles (`v1.0.0` for Edge/Chrome & Firefox):** [GitHub Release v1.0.0](https://github.com/imgolamrabbani/chromaloom/releases/tag/v1.0.0)
- **Website & Docs:** [imgolamrabbani.github.io/chromaloom](https://imgolamrabbani.github.io/chromaloom/)

If you have requests for additional token export formats or gamut-mapping options (e.g., P3 `oklch()` warnings), open an issue on GitHub!
