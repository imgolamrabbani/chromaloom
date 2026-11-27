import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');
const distDir = path.join(appRoot, 'dist');
const outDir = path.resolve(appRoot, '../dist-packages');
const stagingRoot = path.join(appRoot, '.pkg-staging');

async function copyDir(src, dst) {
  await fs.mkdir(dst, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const dstPath = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, dstPath);
    } else if (entry.isFile()) {
      await fs.copyFile(srcPath, dstPath);
    }
  }
}

function createZip(cwd, outZipPath, targets = ['.']) {
  execFileSync('zip', ['-r', '-q', outZipPath, ...targets], { cwd });
}

async function main() {
  await fs.mkdir(outDir, { recursive: true });
  await fs.rm(stagingRoot, { recursive: true, force: true });

  const edgeStage = path.join(stagingRoot, 'edge-chrome');
  const firefoxStage = path.join(stagingRoot, 'firefox');
  const sourceStage = path.join(stagingRoot, 'firefox-source');

  // 1. Edge / Chrome MV3 package
  await copyDir(distDir, edgeStage);
  await fs.copyFile(
    path.join(appRoot, 'manifest.edge-chrome.json'),
    path.join(edgeStage, 'manifest.json')
  );
  const edgeZip = path.join(outDir, 'chromaloom-edge-chrome-1.0.0.zip');
  await fs.rm(edgeZip, { force: true });
  createZip(edgeStage, edgeZip);

  // 2. Firefox AMO MV3 package
  await copyDir(distDir, firefoxStage);
  await fs.copyFile(
    path.join(appRoot, 'manifest.firefox.json'),
    path.join(firefoxStage, 'manifest.json')
  );
  const firefoxZip = path.join(outDir, 'chromaloom-firefox-1.0.0.zip');
  await fs.rm(firefoxZip, { force: true });
  createZip(firefoxStage, firefoxZip);

  // 3. Reproducible Firefox AMO Source Zip
  await fs.mkdir(sourceStage, { recursive: true });
  const filesToCopy = [
    'package.json',
    'package-lock.json',
    'tsconfig.json',
    'vite.config.ts',
    'vitest.config.ts',
    'manifest.edge-chrome.json',
    'manifest.firefox.json',
    'BUILD.md',
    'LICENSE',
  ];
  for (const f of filesToCopy) {
    const src = path.join(appRoot, f);
    try {
      await fs.copyFile(src, path.join(sourceStage, f));
    } catch {
      // Optional lockfile fallback
    }
  }
  for (const d of ['src', 'scripts', 'public', 'test']) {
    await copyDir(path.join(appRoot, d), path.join(sourceStage, d));
  }
  const sourceZip = path.join(outDir, 'chromaloom-firefox-source-1.0.0.zip');
  await fs.rm(sourceZip, { force: true });
  createZip(sourceStage, sourceZip);

  await fs.rm(stagingRoot, { recursive: true, force: true });

  for (const z of [edgeZip, firefoxZip, sourceZip]) {
    const st = await fs.stat(z);
    console.log(`Packaged: ${path.basename(z)} (${(st.size / 1024).toFixed(2)} KB)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
