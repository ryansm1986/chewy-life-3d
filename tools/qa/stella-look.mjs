// Stella's look-page shots (docs/STELLA.md §9): /?test=stella in a few set-ups, saved to tools/qa/tmp/stella-look/.
//   node tools/qa/stella-look.mjs [views] [scale] [props] [carry] [shoulder] [cast] [walk] [run] [sit] [portrait] [face]
//     [--out dir] [--qs k=v]
// The game's light and grade on a plain stage, at a near camera; tools/qa/stella-shots.mjs has the in-game review.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2), val = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const OUT = val('--out') || 'tools/qa/tmp/stella-look', QS = val('--qs') ? '&' + val('--qs') : '', BASE = process.env.BASE || 'http://localhost:5173';
fs.mkdirSync(OUT, { recursive: true });
const ids = args.filter((a, i) => !a.startsWith('--') && !['--out', '--qs'].includes(args[i - 1]));
const SETS = {
  views: { qs: 'views=1&dist=6.5&pitch=0.32', wait: 1500 },
  scale: { qs: 'moka=1&dist=7', wait: 1500 },
  props: { qs: 'props=1&dist=2.6', wait: 1200 },
  carry: { qs: 'solo=1&hold=carry&dist=3.6', wait: 1500 },
  shoulder: { qs: 'solo=1&hold=shoulder&dist=3.6', wait: 1500 },
  cast: { qs: 'solo=1&act=cast&at=0.42&dist=4.2', wait: 1800 },
  walk: { qs: 'solo=1&walk=1&dist=5', wait: 2600 },
  run: { qs: 'solo=1&run=1&dist=6', wait: 2600 },
  sit: { qs: 'solo=1&sit=1&dist=3.6', wait: 1800 },
  portrait: { qs: 'solo=1&portrait=1&dist=4', wait: 2500 },
  // the face beyond the face check's frames (its bark is shot before the jaw opens): the bark's peak, the happy hop, the
  // wave, talking
  bark: { qs: 'solo=1&act=bark&at=0.55&dist=2.6&pitch=0.35&cx=0&cy=0.95&cz=0&face=0.785', wait: 1500, one: true },
  happy: { qs: 'solo=1&act=happy&at=0.25&dist=2.6&pitch=0.35&cx=0&cy=0.95&cz=0&face=0.785', wait: 1500, one: true },
  wave: { qs: 'solo=1&act=wave&at=0.5&dist=3.6&pitch=0.35&cx=0&cy=0.8&cz=0&face=0.785', wait: 1500, one: true },
  blink: { qs: 'solo=1&hold=hand&blink=1&dist=2.6&pitch=0.35&cx=0&cy=0.95&cz=0', wait: 1500 },
  blink60: { qs: 'solo=1&hold=hand&blink=0.6&dist=2.6&pitch=0.35&cx=0&cy=0.95&cz=0', wait: 1500 },
  talk: { qs: 'solo=1&talk=1&dist=2.6&pitch=0.35&cx=0&cy=0.95&cz=0&face=0.785', wait: 1500, one: true },
};
const want = ids.length ? ids : Object.keys(SETS);
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.routeWebSocket(/.*/, ws => { ws.onMessage(() => {}); });
const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
for (const k of want) {
  const S = SETS[k]; if (!S) { console.log('unknown', k); continue; }
  for (const yaw of k === 'views' || k === 'props' || k === 'scale' || k === 'portrait' || k === 'walk' || k === 'run' || S.one ? [null] : [Math.PI / 2, 0]) { // (her facing: 45° either side of facing the camera, whose yaw is π/4)
    await page.goto(`${BASE}/?test=stella&${S.qs}${yaw != null ? `&face=${yaw.toFixed(3)}` : ''}${QS}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
    await page.waitForTimeout(S.wait);
    const f = path.join(OUT, `${k}${yaw == null ? '' : yaw > 1 ? '-45r' : '-45l'}.png`);
    await page.screenshot({ path: f }); console.log('saved', f, JSON.stringify(await page.evaluate(() => window.__info)));
  }
}
console.log(errors.length ? 'ERRORS\n' + errors.slice(0, 8).join('\n') : 'no errors');
await browser.close();
