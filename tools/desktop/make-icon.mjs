// Renders the desktop app's icon (tools/desktop/icon.png, 512×512): the title screen's Chewy badge — his 3D portrait
// in the pink circle with the ink ring — on a transparent background, from the dev server. Run it again if the hero's
// portrait changes.   usage: node tools/desktop/make-icon.mjs   (BASE=http://localhost:5173)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASE || 'http://localhost:5173';
const browser = await chromium.launch({ executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(`${BASE}/?smoke=1`);
await page.waitForFunction(() => window.__ready === true && window.G?.titleActive && document.querySelector('.ti-chewy img.p3d')?.complete, null, { timeout: 90000 });
const out = await page.evaluate(async () => {
  const img = new Image(); img.src = document.querySelector('.ti-chewy img.p3d').src; await img.decode();
  const N = 512, R = 236, c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  // the title badge (ui/fx.css .ti-chewy): a pink radial fill, the bust a little larger than the circle, an ink ring
  g.save(); g.beginPath(); g.arc(N / 2, N / 2, R, 0, Math.PI * 2); g.clip();
  const bg = g.createRadialGradient(N / 2, N * 0.3, 0, N / 2, N * 0.3, R * 1.3); bg.addColorStop(0, '#ffffff'); bg.addColorStop(0.6, '#ffe0ea'); bg.addColorStop(1, '#ffc4d6');
  g.fillStyle = bg; g.fillRect(0, 0, N, N);
  const S = R * 2 * 1.12; g.drawImage(img, N / 2 - S / 2, N / 2 - R - 8, S, S); // (its top edge, where the render crops the head, above the circle)
  g.restore();
  g.lineWidth = 16; g.strokeStyle = '#4a2c2a'; g.beginPath(); g.arc(N / 2, N / 2, R, 0, Math.PI * 2); g.stroke();
  return c.toDataURL('image/png').split(',')[1];
});
fs.writeFileSync(path.join(DIR, 'icon.png'), Buffer.from(out, 'base64'));
console.log('wrote', path.join(DIR, 'icon.png'));
await browser.close();
