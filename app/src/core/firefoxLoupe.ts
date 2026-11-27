/**
 * Self-contained 11x11 Canvas pixel magnifier injected into activeTab on Firefox
 * (which does not ship window.EyeDropper). Runs with zero external dependencies.
 */
export function launchFirefoxLoupeOverlay(screenshotDataUrl: string): void {
  const EXISTING_ID = '__chromaloom_loupe_root__';
  document.getElementById(EXISTING_ID)?.remove();

  const img = new Image();
  img.onload = () => {
    const dpr = window.devicePixelRatio || 1;
    const offscreen = document.createElement('canvas');
    offscreen.width = img.naturalWidth;
    offscreen.height = img.naturalHeight;
    const offCtx = offscreen.getContext('2d', { willReadFrequently: true });
    if (!offCtx) return;
    offCtx.drawImage(img, 0, 0);

    const overlay = document.createElement('div');
    overlay.id = EXISTING_ID;
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:2147483647;cursor:crosshair;background:transparent;';

    const loupe = document.createElement('div');
    loupe.style.cssText =
      'position:fixed;pointer-events:none;width:132px;padding:6px;border-radius:10px;background:#0f172a;color:#f8fafc;border:1px solid #334155;box-shadow:0 10px 25px rgba(0,0,0,0.45);font-family:monospace;font-size:11px;text-align:center;';

    const zoomCanvas = document.createElement('canvas');
    zoomCanvas.width = 110;
    zoomCanvas.height = 110;
    zoomCanvas.style.cssText =
      'width:110px;height:110px;border-radius:6px;image-rendering:pixelated;border:1px solid #475569;display:block;margin:0 auto 4px;';
    const zCtx = zoomCanvas.getContext('2d');

    const label = document.createElement('div');
    label.textContent = '#000000';

    loupe.appendChild(zoomCanvas);
    loupe.appendChild(label);
    overlay.appendChild(loupe);
    document.body.appendChild(overlay);

    let lastHex = '#000000';

    const readPixel = (clientX: number, clientY: number) => {
      const px = Math.max(
        0,
        Math.min(offscreen.width - 1, Math.round(clientX * dpr))
      );
      const py = Math.max(
        0,
        Math.min(offscreen.height - 1, Math.round(clientY * dpr))
      );
      const data = offCtx.getImageData(px, py, 1, 1).data;
      const toHex = (n: number) => n.toString(16).padStart(2, '0').toUpperCase();
      lastHex = `#${toHex(data[0])}${toHex(data[1])}${toHex(data[2])}`;
      label.textContent = lastHex;

      if (zCtx) {
        zCtx.imageSmoothingEnabled = false;
        zCtx.clearRect(0, 0, 110, 110);
        zCtx.drawImage(offscreen, px - 5, py - 5, 11, 11, 0, 0, 110, 110);
        zCtx.strokeStyle = '#ffffff';
        zCtx.lineWidth = 1.5;
        zCtx.strokeRect(50, 50, 10, 10);
      }

      loupe.style.left = `${Math.min(window.innerWidth - 150, clientX + 18)}px`;
      loupe.style.top = `${Math.min(window.innerHeight - 160, clientY + 18)}px`;
    };

    const cleanup = () => {
      overlay.remove();
      window.removeEventListener('keydown', onKey);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cleanup();
    };

    overlay.addEventListener('mousemove', (e) => readPixel(e.clientX, e.clientY));
    overlay.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      readPixel(e.clientX, e.clientY);
      cleanup();
      void navigator.clipboard?.writeText(lastHex).catch(() => undefined);
      const runtime = (globalThis as { chrome?: { runtime?: { sendMessage: (m: unknown) => void } } }).chrome?.runtime;
      runtime?.sendMessage({
        type: 'FIREFOX_PICK_COMPLETE',
        hex: lastHex,
        sourceUrl: window.location.href,
      });
    });

    window.addEventListener('keydown', onKey);
  };
  img.src = screenshotDataUrl;
}
