#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assetsDir = path.resolve(__dirname, '..');
const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const jobs = [
  { html: 'icon.html', out: 'icon-16.png', width: 16, height: 16, transparent: true },
  { html: 'icon.html', out: 'icon-48.png', width: 48, height: 48, transparent: true },
  { html: 'icon.html', out: 'icon-128.png', width: 128, height: 128, transparent: true },
  { html: 'icon.html', out: 'icon-256.png', width: 256, height: 256, transparent: true },
  { html: 'banner.html', out: 'banner.png', width: 1280, height: 640, transparent: false },
  { html: 'screenshot-1.html', out: 'screenshot-1-picker.png', width: 1280, height: 800, transparent: false },
  { html: 'screenshot-2.html', out: 'screenshot-2-wcag-apca.png', width: 1280, height: 800, transparent: false },
  { html: 'screenshot-3.html', out: 'screenshot-3-tokens-boards.png', width: 1280, height: 800, transparent: false },
];

for (const job of jobs) {
  const inputUrl = `file://${path.join(__dirname, job.html)}`;
  const outputPath = path.join(assetsDir, job.out);
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    `--window-size=${job.width},${job.height}`,
    `--screenshot=${outputPath}`,
  ];
  if (job.transparent) {
    args.push('--default-background-color=00000000');
  }
  args.push(inputUrl);

  execFileSync(chromePath, args, { stdio: 'inherit' });
  console.log(`Rendered ${job.out} (${job.width}x${job.height})`);
}
