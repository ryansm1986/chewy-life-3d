// Production-build smoke test: `vite build` into a temp dir, serve it with `vite preview` on a free port, boot the
// title screen and the village, and fail if the UI/audio did not load or the page logged errors.
// (The dev server resolves things the bundle can't — e.g. a variable import() path — so this catches "works in dev,
// no UI in the real game" bugs.)  usage: node tools/qa/prod-smoke.mjs
import { build, preview } from 'vite';
import { chromium } from 'playwright-core';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chewy-prod-'));
await build({ logLevel: 'error', build: { outDir, emptyOutDir: true } });
const server = await preview({ logLevel: 'error', build: { outDir }, preview: { port: 0, strictPort: false } });
const url = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist'] });
let failed = 0;
for (const [label, q] of [['title', '/?smoke=1'], ['village', '/?fresh&nointro']]) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' || /optional module missing/.test(m.text())) errs.push(m.type() + ': ' + m.text()); });
  await page.goto(url + q);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 }).catch(() => errs.push('never became ready'));
  await page.waitForTimeout(2500);
  const s = await page.evaluate(() => ({ ui: document.querySelector('#ui')?.children.length || 0, hasUI: !!window.G?.ui, audio: !!window.G?.audio, title: !!window.G?.titleActive, mode: window.G?.mode }));
  const ok = s.ui > 0 && s.hasUI && s.audio && !errs.length && (label !== 'title' || s.title) && (label !== 'village' || s.mode === 'village');
  console.log(`${ok ? 'PASS' : 'FAIL'}  production ${label}: ${JSON.stringify(s)}${errs.length ? '\n   ' + [...new Set(errs)].slice(0, 8).join('\n   ') : ''}`);
  if (!ok) failed++;
  await page.close();
}
await browser.close();
await new Promise(r => server.httpServer.close(r));
fs.rmSync(outDir, { recursive: true, force: true });
console.log(failed ? `== production smoke: ${failed} FAILED` : '== production smoke: PASS');
process.exit(failed ? 1 : 0);
