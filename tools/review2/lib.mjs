// Review-2 helper: one browser session per scenario with snap/eval/fps/draw-call helpers.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
export const OUT = process.env.SHOT_DIR || 'C:/Users/there/AppData/Local/Temp/claude/D--projects-chewy-life-3d/8589dfce-d448-4273-9d64-a50029bd572d/scratchpad/review2';
fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE || 'http://localhost:5173';

export async function open(url, { w = 1600, h = 900, wait = 1500, storage = null } = {}) {
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
    args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--js-flags=--expose-gc'],
  });
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.routeWebSocket(/.*/, ws => { ws.onMessage(() => {}); });
  const logs = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') { const t = m.text(); if (!/THREE.Clock|X3595|gradient instruction/.test(t)) logs.push(`[${m.type()}] ${t}`); } });
  page.on('pageerror', e => logs.push(`[pageerror] ${e.message}\n${(e.stack || '').split('\n').slice(0, 5).join('\n')}`));
  page.on('response', r => { if (r.status() >= 400) logs.push('[http ' + r.status() + '] ' + r.url()); });
  if (storage) { await page.goto(BASE + '/?test=none'); await page.evaluate(s => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); }, storage); }
  await page.goto(BASE + url, { waitUntil: 'load' });
  try { await page.waitForFunction(() => window.__ready === true || document.querySelector('vite-error-overlay'), null, { timeout: 45000 }); } catch { logs.push('[harness] __ready timeout'); }
  await page.waitForTimeout(wait);
  const api = {
    page, browser, logs,
    sleep: ms => page.waitForTimeout(ms),
    async snap(name) { const f = path.join(OUT, name + '.png'); await page.screenshot({ path: f }); console.log('saved', name); return f; },
    async ev(fn, arg) { try { const r = await page.evaluate(fn, arg); return r; } catch (e) { logs.push('[eval error] ' + e.message); return undefined; } },
    async log(label, fn, arg) { const r = await api.ev(fn, arg); console.log(label, typeof r === 'string' ? r : JSON.stringify(r)); return r; },
    async key(k) { await page.keyboard.press(k); },
    async hold(k, ms) { await page.keyboard.down(k); await page.waitForTimeout(ms); await page.keyboard.up(k); },
    async click(x, y, button = 'left') { await page.mouse.move(x, y); await page.mouse.click(x, y, { button }); },
    async drag(x0, y0, x1, y1, steps = 12) { await page.mouse.move(x0, y0); await page.mouse.down(); for (let i = 1; i <= steps; i++) { await page.mouse.move(x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps); await page.waitForTimeout(30); } await page.mouse.up(); },
    async skipDlg() { await page.evaluate(() => { let n = 0; while (G.ui?.dlg?.active && n++ < 50) { G.ui.dlg.advance(); } }); },
    async fps(ms = 3000) {
      return page.evaluate((ms) => new Promise(res => { const ts = []; const t0 = performance.now(); function f(t) { ts.push(t); if (t - t0 < ms) requestAnimationFrame(f); else { const d = []; for (let i = 1; i < ts.length; i++) d.push(ts[i] - ts[i - 1]); d.sort((a, b) => a - b); res({ fps: +(ts.length / ((ts[ts.length - 1] - ts[0]) / 1000)).toFixed(1), p50: +d[d.length >> 1].toFixed(1), p95: +d[Math.floor(d.length * 0.95)].toFixed(1), max: +d[d.length - 1].toFixed(1) }); } } requestAnimationFrame(f); }), ms);
    },
    // real per-frame draw calls/triangles (autoReset off for one frame)
    async stats() {
      return page.evaluate(() => new Promise(res => { const r = G.engine.renderer; r.info.autoReset = false; r.info.reset(); requestAnimationFrame(() => { requestAnimationFrame(() => { const o = { calls: r.info.render.calls, tris: r.info.render.triangles, geos: r.info.memory.geometries, tex: r.info.memory.textures, progs: r.info.programs?.length }; r.info.autoReset = true; res(o); }); r.info.reset(); }); }));
    },
    async close() { if (logs.length) console.log('LOGS:\n' + logs.slice(0, 50).join('\n')); await browser.close(); },
  };
  return api;
}
