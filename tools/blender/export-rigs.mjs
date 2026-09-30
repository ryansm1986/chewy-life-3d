// Step 1 of the refine pipeline: dump the procedural rigs (dense tessellation) for Blender.
//   node tools/blender/export-rigs.mjs [chewy shadow ...]   (dev server on :5173)  → tools/blender/work/<who>.json
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WORK = path.join(HERE, 'work');
fs.mkdirSync(WORK, { recursive: true });
const BASE = process.env.BASE || 'http://localhost:5173';
const who = process.argv.slice(2).length ? process.argv.slice(2) : ['chewy', 'shadow'];

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--use-angle=d3d11'] });
const page = await browser.newPage();
await page.routeWebSocket(/.*/, ws => { ws.onMessage(() => {}); });
page.on('pageerror', e => console.log('[pageerror]', e.message));
for (const w of who) {
  await page.goto(`${BASE}/?test=rigexport&who=${w}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });
  const data = await page.evaluate(() => JSON.stringify(window.__export));
  const f = path.join(WORK, w + '.json');
  fs.writeFileSync(f, data);
  const d = JSON.parse(data);
  console.log(`${w}: ${d.parts.length} parts, ${d.parts.reduce((a, p) => a + p.pos.length / 3, 0)} verts, ${d.bones.length} nodes → ${f} (${(data.length / 1e6).toFixed(1)} MB)`);
}
await browser.close();
