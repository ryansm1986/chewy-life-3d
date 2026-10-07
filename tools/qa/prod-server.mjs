// The production bundle for QA tools: `vite build` into a temp dir and `vite preview` on a free port (the way the owner
// plays: Play Chewy Life.cmd → build + preview). prod-smoke.mjs does the same inline.
//   const S = await startProd(); … S.url … await S.close();
import { build, preview } from 'vite';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export async function startProd({ root = process.env.PROD_ROOT || ROOT } = {}) { // (PROD_ROOT: build another checkout, e.g. a before / after A/B)
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chewy-prod-'));
  const t0 = Date.now();
  await build({ root, logLevel: 'error', build: { outDir, emptyOutDir: true } });
  const buildMs = Date.now() - t0;
  const server = await preview({ root, logLevel: 'error', build: { outDir }, preview: { port: 0, strictPort: false } });
  const url = server.resolvedUrls.local[0].replace(/\/$/, '');
  return { url, outDir, buildMs, async close() { await new Promise(r => server.httpServer.close(r)); fs.rmSync(outDir, { recursive: true, force: true }); } };
}

export const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
export const CHROME_ARGS = ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'];
