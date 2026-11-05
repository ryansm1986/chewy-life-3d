// In-game look at the Bamboo Grove props (rg-bamboo): boots ?fresh&nointro&region=bamboo, computes each prop's world
// position from the plan with src/regions/biomes/bamboo.js's own formulas, stands the player 2 m to the camera side of it
// and screenshots at the game camera.   node game_tour.mjs [--dist 14] [--only shrine,iwakura,...] [--tag r2]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
const args = process.argv.slice(2), arg = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const dist = +arg('dist', 14), only = arg('only', ''), tag = arg('tag', 'r2');
const here = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1');
const outDir = path.join(here, 'game'); fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
  args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.routeWebSocket(/.*/, ws => { ws.onMessage(() => {}); });
const logs = [];
page.on('console', m => { if (m.type() === 'error' || m.text().includes('[region]')) logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', e => logs.push(`[pageerror] ${e.message}`));
await page.goto(`http://localhost:5173/?fresh&nointro&region=bamboo`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__ready === true && globalThis.G?.dungeon?.isRegion, null, { timeout: 90000 }).catch(() => logs.push('[harness] region not ready'));
await page.waitForTimeout(8000);
const spots = await page.evaluate(() => {
  const D = G.dungeon, P = D.layout.plan, out = [], tr = P.trail;
  for (const m of D.monsters) { m.pos.set(-400, 0, -400); m.aggro = false; m.frozen = true; }
  const f = P.pois.find(p => p.kind === 'feature'); if (f) out.push({ name: 'shrine', x: f.x, z: f.z - 1.8 });
  const A = P.arena, e = tr[tr.length - 1], ea = Math.atan2(e[1] - A.z, e[0] - A.x), ra = ea + Math.PI;
  out.push({ name: 'torii', x: A.x + Math.cos(ea) * (A.r + 1.4), z: A.z + Math.sin(ea) * (A.r + 1.4) });
  out.push({ name: 'iwakura', x: A.x + Math.cos(ra) * (A.r + 2.4), z: A.z + Math.sin(ra) * (A.r + 2.4) });
  out.push({ name: 'chimes', x: A.x + Math.cos(ra + 0.9) * (A.r + 1.8), z: A.z + Math.sin(ra + 0.9) * (A.r + 1.8) });
  { const a = ea + Math.PI * 0.32 + 3 / 7 * Math.PI * 1.4; out.push({ name: 'lantern', x: A.x + Math.cos(a) * (A.r + 0.8), z: A.z + Math.sin(a) * (A.r + 0.8) }); }
  const S = P.start; out.push({ name: 'bench', x: S.x + 3.4, z: S.z + 1.6 }); out.push({ name: 'lanternStart', x: S.x - 2.8, z: S.z + 2.6 });
  return out;
});
for (const s of spots) {
  if (only && !only.split(',').includes(s.name)) continue;
  await page.evaluate(async ({ x, z, dist }) => {
    const P = G.player; P.setPos(x + 1.9, z + 1.9); G.introFocus = { x, z }; G.engine.rig.distTarget = dist; G.engine.rig.snap?.();
    await new Promise(r => setTimeout(r, 1800));
  }, { ...s, dist });
  const f = path.join(outDir, `${tag}-${s.name}-d${dist}.png`);
  await page.screenshot({ path: f });
  console.log(`${s.name.padEnd(14)} (${s.x.toFixed(1)},${s.z.toFixed(1)}) -> ${f}`);
}
if (logs.length) console.log(logs.slice(0, 20).join('\n'));
await browser.close();
