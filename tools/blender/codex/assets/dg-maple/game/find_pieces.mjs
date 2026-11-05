// dg-maple: boot into the Maple Roots dungeon, record where the Blender pieces (REGION_GLB['dg-maple']) were placed, and
// shoot each at the game camera (the player stood a step off it). Read-only on src (patches Batch.prototype.addVC in the page).
//   node find_pieces.mjs [--floor 1] [--seed 1] [--dist 14] [--tag fp] [--max 3]   (dev server on :5173)
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
const args = process.argv.slice(2), arg = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const floor = +arg('floor', 1), seed = arg('seed', '1'), dist = +arg('dist', 14), tag = arg('tag', 'fp'), maxPer = +arg('max', 2);
const OUT = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1');
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.routeWebSocket(/.*/, ws => { ws.onMessage(() => {}); });
const logs = []; page.on('pageerror', e => logs.push(e.message)); page.on('console', m => { if (m.text().startsWith('total')) console.log(m.text().slice(0, 3000)); });
await page.goto(`http://localhost:5173/?fresh&nointro&notut&hour=10&dseed=${seed}`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__ready === true && window.G?.player, null, { timeout: 60000 });
await page.waitForTimeout(800);
const names = await page.evaluate(async () => {
  const urlOf = k => performance.getEntriesByType('resource').map(e => new URL(e.name).pathname + new URL(e.name).search).find(u => u.includes(k)) || k;
  const DW = await import(urlOf('/src/dungeon/dungeonWorld.js')), GP = await import(urlOf('/src/regions/assets/glbPieces.js'));
  console.log('total urls', urlOf('/src/dungeon/dungeonWorld.js'), urlOf('/src/regions/assets/glbPieces.js'));
  await GP.loadRegionGlbs('dg-maple');
  const map = GP.REGION_GLB['dg-maple'], counts = new Map();
  for (const name of Object.keys(map)) {
    const urls = Array.isArray(map[name]) ? map[name] : [map[name]];
    urls.forEach((u, i) => { const g = GP.glbFn('dg-maple', name, () => ({}))(i); const n = g.body?.attributes.position.count; if (n) counts.set(n, name + (urls.length > 1 ? '-v' + i : '')); });
  }
  window.__dgm = { counts, hits: [], total: 0, seen: new Map() };
  const orig = DW.Batch.prototype.addVC;
  DW.Batch.prototype.addVC = function (g, m, ...rest) {
    window.__dgm.total++; const cnt = g?.attributes?.position?.count; window.__dgm.seen.set(cnt, (window.__dgm.seen.get(cnt) || 0) + 1);
    const nm = window.__dgm.counts.get(cnt);
    if (nm) { const e = m.elements; window.__dgm.hits.push({ name: nm, x: e[12], y: e[13], z: e[14], yaw: Math.atan2(e[8], e[10]), s: Math.hypot(e[0], e[1], e[2]) }); }
    return orig.call(this, g, m, ...rest);
  };
  return [...counts.values()];
});
console.log('watching', names.join(', '));
await page.evaluate(({ floor }) => { const G = window.G; G.state.flags.burrowTut = true; G.state.player.lvl = 15; G.actions.recompute(); G.enterDungeon({ id: 'mapleRoots', floor }); }, { floor });
await page.waitForFunction(() => window.G?.mode === 'dungeon' && window.G.dungeon?.monsters?.length && !window.G.ui?.iris?.active, null, { timeout: 40000 });
await page.waitForTimeout(2500);
const hits = await page.evaluate(() => {
  const D = window.G.dungeon; document.getElementById('ui').style.display = 'none';
  for (const m of D.monsters) { m.pos.set(-500, 0, -500); m.aggro = false; m.sync?.(); }
  window.G.player.invuln = true;
  console.log('total', window.__dgm.total, JSON.stringify([...window.__dgm.counts.entries()]), JSON.stringify([...window.__dgm.seen.entries()].slice(0, 80)));
  return window.__dgm.hits;
});
const per = {};
for (const h of hits) per[h.name] = (per[h.name] || 0) + 1;
console.log('placed', JSON.stringify(per), 'heights', JSON.stringify(hits.map(h => h.name + ':' + h.y.toFixed(2))));
const done = {};
for (const h of hits) {
  if (Math.abs(h.y) > 0.3) continue; done[h.name] = (done[h.name] || 0) + 1; if (done[h.name] > maxPer) continue;
  const f = path.join(OUT, `${tag}_f${floor}_${h.name}_${done[h.name]}.png`);
  await page.evaluate(async ({ h, dist }) => {
    const G = window.G, rig = G.engine.rig, yaw = rig.yaw ?? Math.PI / 4;
    const fx = Math.sin(h.yaw), fz = Math.cos(h.yaw), px = h.x + fx * 2.3 + fz * 0.8, pz = h.z + fz * 2.3 - fx * 0.8; G.player.setPos(px, pz); G.companion?.setPos?.(px + 0.7, pz + 0.4);
    rig.distTarget = dist; rig.focus.set((h.x + px) / 2, 0, (h.z + pz) / 2); rig.snap();
    await new Promise(q => setTimeout(q, 700));
    rig.focus.set((h.x + px) / 2, 0, (h.z + pz) / 2); rig.snap?.();
    await new Promise(q => requestAnimationFrame(() => requestAnimationFrame(q)));
  }, { h, dist });
  await page.screenshot({ path: f });
  console.log(h.name, h.x.toFixed(1), h.z.toFixed(1), 'yaw', h.yaw.toFixed(2), 's', h.s.toFixed(2), '->', f);
}
if (logs.length) console.log(logs.slice(0, 10).join('\n'));
await browser.close();
