// Screenshot harness: node tools/shot.mjs [--url path] [--out name] [--wait ms] [--w 1600 --h 900] [--eval "js"]...
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = { url: '/', out: 'shot', wait: 1500, w: 1600, h: 900, evals: [], steps: [] };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--url') opt.url = args[++i];
  else if (a === '--out') opt.out = args[++i];
  else if (a === '--wait') opt.wait = +args[++i];
  else if (a === '--w') opt.w = +args[++i];
  else if (a === '--h') opt.h = +args[++i];
  else if (a === '--eval') opt.steps.push({ eval: args[++i] });
  else if (a === '--snap') opt.steps.push({ snap: args[++i] });
  else if (a === '--sleep') opt.steps.push({ sleep: +args[++i] });
  else if (a === '--key') opt.steps.push({ key: args[++i] });
  else if (a === '--click') opt.steps.push({ click: args[++i].split(',').map(Number) });
  else if (a === '--move') opt.steps.push({ move: args[++i].split(',').map(Number) });
}
const outDir = process.env.SHOT_DIR || 'C:/Users/there/AppData/Local/Temp/claude/D--projects-chewy-life-3d/8589dfce-d448-4273-9d64-a50029bd572d/scratchpad/shots';
fs.mkdirSync(outDir, { recursive: true });
const base = process.env.BASE || 'http://localhost:5173';

const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: opt.w, height: opt.h } });
// Mock Vite's HMR socket: other agents edit files concurrently and HMR reloads would reset the page mid-test.
if (!process.env.HMR) await page.routeWebSocket(/.*/, ws => { ws.onMessage(() => {}); });
const logs = [];
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning' || m.text().startsWith('[')) logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', e => logs.push(`[pageerror] ${e.message}\n${e.stack || ''}`));
await page.goto(base + opt.url, { waitUntil: 'load' });
try { await page.waitForFunction(() => window.__ready === true || document.querySelector('vite-error-overlay'), null, { timeout: 30000 }); } catch { logs.push('[harness] __ready timeout'); }
const overlay = await page.evaluate(() => { const o = document.querySelector('vite-error-overlay'); return o ? o.shadowRoot?.querySelector('.message')?.textContent + '\n' + o.shadowRoot?.querySelector('.file')?.textContent : null; });
if (overlay) logs.push('[VITE ERROR] ' + overlay);
await page.waitForTimeout(opt.wait);
let n = 0;
for (const s of opt.steps) {
  if (s.eval) { try { const r = await page.evaluate(s.eval); if (r !== undefined) console.log('eval>', typeof r === 'string' ? r : JSON.stringify(r)); } catch (e) { logs.push('[eval error] ' + e.message); } }
  if (s.sleep) await page.waitForTimeout(s.sleep);
  if (s.key) await page.keyboard.press(s.key);
  if (s.move) await page.mouse.move(s.move[0], s.move[1]);
  if (s.click) { await page.mouse.move(s.click[0], s.click[1]); await page.mouse.click(s.click[0], s.click[1]); }
  if (s.snap) { const f = path.join(outDir, s.snap + '.png'); await page.screenshot({ path: f }); console.log('saved', f); n++; }
}
if (!n) { const f = path.join(outDir, opt.out + '.png'); await page.screenshot({ path: f }); console.log('saved', f); }
const info = await page.evaluate(() => window.__info).catch(() => null);
if (info) console.log('info:', typeof info === 'string' ? info : JSON.stringify(info));
if (logs.length) console.log(logs.slice(0, 40).join('\n'));
await browser.close();
