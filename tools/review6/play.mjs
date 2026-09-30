// Review harness: like tools/shot.mjs plus key holds, mouse buttons, wheel and fps sampling.
// node tools/review/play.mjs --url "/?fresh" --wait 3000 --hold w,1500 --snap a --fps 3000 ...
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
const args = process.argv.slice(2);
const opt = { url: '/', wait: 1500, w: 1600, h: 900, steps: [] };
for (let i = 0; i < args.length; i++) {
  const a = args[i], v = () => args[++i];
  if (a === '--url') opt.url = v();
  else if (a === '--wait') opt.wait = +v();
  else if (a === '--w') opt.w = +v();
  else if (a === '--h') opt.h = +v();
  else if (a === '--eval') opt.steps.push({ eval: v() });
  else if (a === '--snap') opt.steps.push({ snap: v() });
  else if (a === '--sleep') opt.steps.push({ sleep: +v() });
  else if (a === '--key') opt.steps.push({ key: v() });
  else if (a === '--hold') { const [k, ms] = v().split(','); opt.steps.push({ hold: k, ms: +ms }); }
  else if (a === '--down') opt.steps.push({ down: v() });
  else if (a === '--up') opt.steps.push({ up: v() });
  else if (a === '--click') opt.steps.push({ click: v().split(',').map(Number) });
  else if (a === '--rclick') opt.steps.push({ rclick: v().split(',').map(Number) });
  else if (a === '--mdown') opt.steps.push({ mdown: v() });
  else if (a === '--mup') opt.steps.push({ mup: v() });
  else if (a === '--move') opt.steps.push({ move: v().split(',').map(Number) });
  else if (a === '--wheel') opt.steps.push({ wheel: +v() });
  else if (a === '--fps') opt.steps.push({ fps: +v() });
  else if (a === '--burst') { const [name, n, ms] = v().split(','); opt.steps.push({ burst: name, n: +n, ms: +ms }); }
}
const outDir = process.env.SHOT_DIR || 'C:/Users/there/AppData/Local/Temp/claude/D--projects-chewy-life-3d/8589dfce-d448-4273-9d64-a50029bd572d/scratchpad/review4';
fs.mkdirSync(outDir, { recursive: true });
const base = process.env.BASE || 'http://localhost:5173';
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
  args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--js-flags=--expose-gc'],
});
const page = await browser.newPage({ viewport: { width: opt.w, height: opt.h } });
await page.routeWebSocket(/.*/, ws => { ws.onMessage(() => {}); });
const logs = [];
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
page.on('response', r => { if (r.status() >= 400) logs.push('[http ' + r.status() + '] ' + r.url()); });
page.on('pageerror', e => logs.push(`[pageerror] ${e.message}\n${(e.stack || '').split('\n').slice(0, 4).join('\n')}`));
const t0 = Date.now();
await page.goto(base + opt.url, { waitUntil: 'load' });
try { await page.waitForFunction(() => window.__ready === true || document.querySelector('vite-error-overlay'), null, { timeout: 40000 }); } catch { logs.push('[harness] __ready timeout'); }
console.log('ready in', Date.now() - t0, 'ms');
await page.waitForTimeout(opt.wait);
for (const s of opt.steps) {
  if (s.eval) { try { const r = await page.evaluate(s.eval); if (r !== undefined) console.log('eval>', typeof r === 'string' ? r : JSON.stringify(r)); } catch (e) { logs.push('[eval error] ' + e.message); } }
  if (s.sleep) await page.waitForTimeout(s.sleep);
  if (s.key) await page.keyboard.press(s.key);
  if (s.hold) { await page.keyboard.down(s.hold); await page.waitForTimeout(s.ms); await page.keyboard.up(s.hold); }
  if (s.down) await page.keyboard.down(s.down);
  if (s.up) await page.keyboard.up(s.up);
  if (s.move) await page.mouse.move(s.move[0], s.move[1], { steps: 4 });
  if (s.click) { await page.mouse.move(s.click[0], s.click[1]); await page.mouse.click(s.click[0], s.click[1]); }
  if (s.rclick) { await page.mouse.move(s.rclick[0], s.rclick[1]); await page.mouse.click(s.rclick[0], s.rclick[1], { button: 'right' }); }
  if (s.mdown) await page.mouse.down({ button: s.mdown });
  if (s.mup) await page.mouse.up({ button: s.mup });
  if (s.wheel) await page.mouse.wheel(0, s.wheel);
  if (s.fps) {
    const r = await page.evaluate((ms) => new Promise(res => { const ts = []; const t0 = performance.now(); function f(t) { ts.push(t); if (t - t0 < ms) requestAnimationFrame(f); else { const d = []; for (let i = 1; i < ts.length; i++) d.push(ts[i] - ts[i - 1]); d.sort((a, b) => a - b); res({ fps: +(ts.length / ((ts[ts.length - 1] - ts[0]) / 1000)).toFixed(1), p50: +d[d.length >> 1].toFixed(1), p95: +d[Math.floor(d.length * 0.95)].toFixed(1), max: +d[d.length - 1].toFixed(1), calls: G.engine.renderer.info.render.calls, tris: G.engine.renderer.info.render.triangles }); } } requestAnimationFrame(f); }), s.fps);
    console.log('fps>', JSON.stringify(r));
  }
  if (s.snap) { const f = path.join(outDir, s.snap + '.png'); await page.screenshot({ path: f }); console.log('saved', f); }
  if (s.burst) { for (let k = 0; k < s.n; k++) { const f = path.join(outDir, `${s.burst}_${k}.png`); await page.screenshot({ path: f }); console.log('saved', f); await page.waitForTimeout(s.ms); } }
}
if (logs.length) console.log(logs.slice(0, 60).join('\n'));
await browser.close();
