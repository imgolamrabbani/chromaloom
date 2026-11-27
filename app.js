(function () {
  const root = document.documentElement;
  const saved = localStorage.getItem('chromaloom_theme');
  if (saved === 'light' || saved === 'dark') {
    root.setAttribute('data-theme', saved);
  }

  const toggleBtn = document.getElementById('theme-toggle');
  function syncLabel() {
    if (!toggleBtn) return;
    const current = root.getAttribute('data-theme') || 'dark';
    toggleBtn.textContent = current === 'light' ? 'Dark Mode' : 'Light Mode';
  }
  syncLabel();

  if (toggleBtn) {
    toggleBtn.addEventListener('click', function () {
      const next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      root.setAttribute('data-theme', next);
      localStorage.setItem('chromaloom_theme', next);
      syncLabel();
    });
  }

  const snippets = {
    oklch: {
      code: `/* Exact Björn Ottosson OKLCH Color Math */
Picked Color:  #6366F1
RGB:           rgb(99, 102, 241)
HSL:           hsl(239, 84%, 67%)
OKLCH:         oklch(0.585 0.233 277.1)

/* Permissions: activeTab, scripting, storage, clipboardWrite */
/* Zero <all_urls> · Zero cookies · Zero telemetry */`,
      status: 'OKLCH(0.585 0.233 277.1) · Copied to clipboard'
    },
    wcag: {
      code: `/* Pro: WCAG 2.2 + APCA Lc Contrast Solver */
Foreground: #6366F1  |  Background: #0B1020
WCAG 2.2:   3.91 : 1 (AA Normal: FAIL)
APCA Lc:    Lc 37.8  (Body threshold: Lc 60)

/* Binary-Search Nearest Compliant OKLCH Shade (Hue 277.1° locked) */
✓ AA  (>= 4.5:1): #787CF5  oklch(0.642 0.205 277.1)
✓ AAA (>= 7.0:1): #9DA2FA  oklch(0.754 0.145 277.1)`,
      status: 'Solved AA & AAA shades with 0° hue drift'
    },
    tailwind: {
      code: `/* Pro: Tailwind v4 @theme & W3C Design Tokens Export */
@theme {
  --color-brand-ink: oklch(0.184 0.029 262.7);
  --color-brand-primary: oklch(0.585 0.233 277.1);
  --color-brand-cyan: oklch(0.815 0.142 205.2);
  --color-brand-amber: oklch(0.769 0.171 70.1);
  --color-brand-rose: oklch(0.645 0.246 16.4);
}`,
      status: 'Exported Tailwind v4 @theme · CSS Vars · W3C JSON'
    }
  };

  const tabs = document.querySelectorAll('[data-snippet]');
  const codeEl = document.getElementById('preview-code');
  const statusEl = document.getElementById('preview-status');

  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      tabs.forEach(function (t) { t.classList.remove('active'); });
      tab.classList.add('active');
      const item = snippets[tab.getAttribute('data-snippet')];
      if (item && codeEl && statusEl) {
        codeEl.textContent = item.code;
        statusEl.textContent = item.status;
      }
    });
  });
})();
