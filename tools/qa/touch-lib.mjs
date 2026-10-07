// Touch QA helpers (docs/CONTROLS.md §12, ROADMAP CT-5): a phone- or tablet-like browser (hasTouch, isMobile, a DPR,
// landscape) and fingers driven through CDP Input.dispatchTouchEvent, so multi-touch reaches the page as real touch and
// pointer events (pointerType 'touch').
//   const { browser, page, errors, warns, F } = await launchTouch({ w: 844, h: 390, dpr: 3 })
//   await F.down(1, x, y) / F.move(1, x, y, steps) / F.up(1) / F.tap(x, y) / F.hold(x, y, ms) / F.drag(x0, y0, x1, y1, { hold, steps })
//   await F.pinch(cx, cy, d0, d1)
//   await center(page, '.tc-attack') → { x, y }
import { chromium } from 'playwright-core';
export { boot, sleep, waitMode, makeReport, BASE } from './lib.mjs';

const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
export const PHONE = { w: 844, h: 390, dpr: 3, ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36' };
export const TABLET = { w: 1180, h: 820, dpr: 2, ua: 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' };

export async function launchTouch({ w = PHONE.w, h = PHONE.h, dpr = PHONE.dpr, ua = PHONE.ua } = {}) {
  const browser = await chromium.launch({
    executablePath: CHROME, headless: true,
    args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
  });
  const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, hasTouch: true, isMobile: true, userAgent: ua });
  const page = await context.newPage();
  await page.routeWebSocket(/.*/, ws => { ws.onMessage(() => {}); }); // (no Vite HMR reloads mid-test)
  const errors = [], warns = [];
  page.on('pageerror', e => errors.push(`[pageerror] ${e.message}\n    ${(e.stack || '').split('\n').slice(1, 5).join('\n    ')}`));
  page.on('console', m => { const t = m.text(); if (m.type() === 'error') { if (!/favicon|404 \(Not Found\)/.test(t)) errors.push(`[console.error] ${t}`); } else if (m.type() === 'warning') warns.push(t); });
  const cdp = await context.newCDPSession(page);
  return { browser, context, page, errors, warns, cdp, F: fingers(page, cdp) };
}

/** fingers on the touch screen: each id is one finger; every event carries all the fingers still down */
export function fingers(page, cdp) {
  const pts = new Map();
  const list = () => [...pts.values()].map(p => ({ x: p.x, y: p.y, id: p.id, radiusX: 6, radiusY: 6, force: 1 }));
  const send = (type) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: list() });
  const frame = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  const F = {
    async down(id, x, y) { pts.set(id, { id, x, y }); await send('touchStart'); },
    async move(id, x, y, steps = 1) {
      const p = pts.get(id); if (!p) return;
      const x0 = p.x, y0 = p.y;
      for (let i = 1; i <= steps; i++) { p.x = x0 + (x - x0) * i / steps; p.y = y0 + (y - y0) * i / steps; await send('touchMove'); if (steps > 1) await page.waitForTimeout(16); }
    },
    async up(id) { if (!pts.has(id)) return; pts.delete(id); await send('touchEnd'); },
    async upAll() { for (const id of [...pts.keys()]) await F.up(id); },
    async tap(x, y, id = 9) { await F.down(id, x, y); await frame(); await F.up(id); await frame(); },
    async hold(x, y, ms, id = 9) { await F.down(id, x, y); await page.waitForTimeout(ms); await F.up(id); await frame(); },
    async drag(x0, y0, x1, y1, { id = 9, hold = 0, steps = 8, keep = false } = {}) {
      await F.down(id, x0, y0); await frame();
      await F.move(id, x1, y1, steps);
      if (hold) await page.waitForTimeout(hold);
      if (!keep) { await F.up(id); await frame(); }
    },
    async pinch(cx, cy, d0, d1, steps = 8) {
      await F.down(21, cx - d0 / 2, cy); await F.down(22, cx + d0 / 2, cy); await frame();
      for (let i = 1; i <= steps; i++) { const d = d0 + (d1 - d0) * i / steps; pts.get(21).x = cx - d / 2; pts.get(22).x = cx + d / 2; await send('touchMove'); await page.waitForTimeout(16); }
      await F.up(22); await F.up(21); await frame();
    },
    frame,
  };
  return F;
}

/** the screen centre of the first element matching sel (null when it isn't laid out) */
export async function center(page, sel) {
  return page.evaluate(s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height } : null; }, sel);
}
