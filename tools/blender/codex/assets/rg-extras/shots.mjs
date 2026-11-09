// rg-extras: enter a region, record where the Blender pieces landed (Placer.piece hooked in the page), shoot each at the game
// camera, measure the taikobashi against the deck. Read-only on src: models not listed in REGION_GLB yet are listed in the
// page only (session), so the torii can be judged without touching the Ice Cavern's.
//   node shots.mjs --region maple|onsen [--tag g1] [--dist 24,14] [--hour 10] [--max 2] [--only bench,sheaf-v0]
import { chromium } from 'playwright-core';
import path from 'node:path';
const args = process.argv.slice(2), arg = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const region = arg('region', 'maple'), tag = arg('tag', 'g1'), dists = arg('dist', '24,14').split(',').map(Number), hour = arg('hour', '10'), maxPer = +arg('max', 2), only = arg('only', '');
const OUT = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1');
const v0 = '/models/rg-onsen-snowTorii-v0.glb', v1 = '/models/rg-onsen-snowTorii-v1.glb';
const LIST = region === 'maple'
  ? { taikobashi: '/models/rg-maple-taikobashi.glb', bench: '/models/rg-maple-bench.glb', sheaf: ['/models/rg-maple-sheaf-v0.glb', '/models/rg-maple-sheaf-v1.glb'], bale: ['/models/rg-maple-bale-v0.glb', '/models/rg-maple-bale-v1.glb'] }
  : { snowTorii: [v0, v0, v0, v0, v0, v0, v0, v0, v0, v1] }; // (seed-indexed: seeds 0-3 are the trail's w 4.2, seed 9 the arena gate's w 3.2)
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.routeWebSocket(/.*/, ws => { ws.onMessage(() => {}); });
const logs = []; page.on('pageerror', e => logs.push(e.message));
await page.goto(`http://localhost:5173/?fresh&nointro&notut&hour=${hour}`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__ready === true && window.G?.player, null, { timeout: 90000 });
const names = await page.evaluate(async ({ region, LIST }) => {
  const urlOf = k => performance.getEntriesByType('resource').map(e => new URL(e.name).pathname + new URL(e.name).search).find(u => u.includes(k)) || k;
  const GP = await import(urlOf('/src/regions/assets/glbPieces.js')), BK = await import(urlOf('/src/regions/assets/bambooKit.js'));
  Object.assign(GP.REGION_GLB[region], LIST);
  await GP.loadRegionGlbs(region);
  const byBody = new Map();
  for (const [n, urls] of Object.entries(LIST)) {
    const fake = GP.withGlb(region, { [n]: () => ({}) })[n], seen = new Set();
    (Array.isArray(urls) ? urls : [urls]).forEach((u, i) => { if (seen.has(u)) return; seen.add(u); const g = fake(i); if (g.body) byBody.set(g.body, n + (Array.isArray(urls) && new Set(urls).size > 1 ? '-v' + [...new Set(urls)].indexOf(u) : '')); });
  }
  window.__x = { byBody, hits: [] };
  const o = BK.Placer.prototype.piece;
  BK.Placer.prototype.piece = function (pc, x, z, rot = 0, opts = {}) { const n = pc && byBody.get(pc.body); if (n) window.__x.hits.push({ name: n, x, z, rot, y: opts.y, s: opts.s, pc: n.startsWith('taiko') ? { dk: true } : null }); if (pc?.deckAt) window.__x.deck = pc.deckAt; return o.call(this, pc, x, z, rot, opts); };
  G.state.flags.burrowTut = true; G.state.player.lvl = 15; G.actions.recompute();
  G.enterRegion(region);
  return [...byBody.values()];
}, { region, LIST });
console.log('watching', names.join(', '));
await page.waitForFunction(() => window.G?.mode === 'dungeon' && G.dungeon?.isRegion && !G.ui?.iris?.active, null, { timeout: 120000 });
await page.waitForTimeout(2500);
if (arg('night', '')) await page.evaluate(h => { const D = G.day || G.dayNight; if (D) { D.hour = +h; D._lastHour = +h; } G.state.hour = +h; G.dungeon?.world?.applyDay?.(); }, arg('night', ''));
const hits = await page.evaluate(() => {
  const D = G.dungeon; document.getElementById('ui').style.display = 'none';
  for (const m of D.monsters) { m.pos.set(-500, 0, -500); m.aggro = false; m.sync?.(); }
  G.player.invuln = true; return window.__x.hits;
});
const per = {}; for (const h of hits) per[h.name] = (per[h.name] || 0) + 1;
console.log('placed', JSON.stringify(per));
for (const h of hits) if (h.name.startsWith('snowTorii')) console.log(h.name, h.x.toFixed(2), h.z.toFixed(2), 'yaw', h.rot.toFixed(2));
// the bridge, measured in the game: the placed GLB's top surface against the height the player walks on
const bridge = hits.find(h => h.name === 'taikobashi');
if (bridge) {
  const m = await page.evaluate(async h => {
    const urlOf = k => performance.getEntriesByType('resource').map(e => new URL(e.name).pathname + new URL(e.name).search).find(u => u.includes(k)) || k;
    const GP = await import(urlOf('/src/regions/assets/glbPieces.js'));
    const g = GP.withGlb('maple', { taikobashi: () => ({}) }).taikobashi(0).body, P = g.attributes.position, W = G.dungeon.world, dx = Math.sin(h.rot), dz = Math.cos(h.rot), ux = dz, uz = -dx, rows = [];
    const top = (lx, lz) => { let best = -1e9; for (let i = 0; i < P.count; i += 3) { const ax = P.getX(i), az = P.getZ(i), bx = P.getX(i + 1), bz = P.getZ(i + 1), cx = P.getX(i + 2), cz = P.getZ(i + 2), d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz); if (Math.abs(d) < 1e-9) continue; const a = ((bz - cz) * (lx - cx) + (cx - bx) * (lz - cz)) / d, b = ((cz - az) * (lx - cx) + (ax - cx) * (lz - cz)) / d, c = 1 - a - b; if (a < -1e-6 || b < -1e-6 || c < -1e-6) continue; const y = a * P.getY(i) + b * P.getY(i + 1) + c * P.getY(i + 2); if (y > best) best = y; } return best; };
    const step = 7.6 / 24; let worst = 0, n = 0;
    for (let i = 0; i < 24; i++) for (const f of [-0.3, 0, 0.3]) for (const u of [-0.72, -0.36, 0, 0.36, 0.72]) {
      const s = -3.8 + (i + 0.5 + f) * step, wx = h.x + dx * s + ux * u, wz = h.z + dz * s + uz * u, walk = W.heightAt(wx, wz), model = top(u, s), diff = model - walk; if (diff < 0.003) { worst = Math.max(worst, Math.abs(diff)); n++; }
      if (u === 0 && f === 0 && i % 4 === 1) rows.push(`s ${s.toFixed(2)} walk ${walk.toFixed(4)} model ${model.toFixed(4)} diff ${(diff * 1000).toFixed(2)} mm`);
    }
    // the same with the walking height picked from the deck segment nearest the point (regionWorld.deckAt takes the FIRST whose capsule holds it)
    let worst2 = 0, n2 = 0; const near = (x, z) => { let best = null, bd = 1e9; for (const d of W.decks) { if (!d.test(x, z)) continue; const q = Math.hypot((d.x0 + d.x1) / 2 - x, (d.z0 + d.z1) / 2 - z); if (q < bd) { bd = q; best = d; } } return best ? best.h(x, z) : null; };
    for (let i = 0; i < 24; i++) for (const f of [-0.3, 0, 0.3]) for (const u of [-0.72, -0.36, 0, 0.36, 0.72]) { const s = -3.8 + (i + 0.5 + f) * step, wx = h.x + dx * s + ux * u, wz = h.z + dz * s + uz * u, w2 = near(wx, wz), d = top(u, s) - w2; if (w2 !== null && d < 0.003 + 0.01) { worst2 = Math.max(worst2, Math.abs(d)); n2++; } }
    return { n, worst, rows, n2, worst2 };
  }, bridge);
  console.log(`deck in game: ${m.n} samples, worst ${(m.worst * 1000).toFixed(2)} mm; with the nearest deck segment: ${m.n2} samples, worst ${(m.worst2 * 1000).toFixed(2)} mm`); console.log(m.rows.join('\n'));
}
const done = {};
for (const h of hits) {
  if (only && !only.split(',').includes(h.name)) continue;
  done[h.name] = (done[h.name] || 0) + 1; if (done[h.name] > maxPer) continue;
  const stands = h.name === 'taikobashi' ? [0, 1.9, -3.2] : [null];
  for (const st of stands) for (const dist of dists) {
    const f = path.join(OUT, `${tag}_${h.name}_${done[h.name]}${st === null ? '' : '_s' + st}_d${dist}.png`);
    const info = await page.evaluate(async ({ h, dist, st }) => {
      const rig = G.engine.rig, fx = Math.sin(h.rot), fz = Math.cos(h.rot);
      const px = st === null ? h.x + fx * 1.9 + fz * 0.9 : h.x + fx * st, pz = st === null ? h.z + fz * 1.9 - fx * 0.9 : h.z + fz * st;
      G.player.setPos(px, pz); G.companion?.setPos?.(px + 0.7, pz + 0.4);
      const y = G.dungeon.world.heightAt(px, pz);
      rig.distTarget = dist; rig.focus.set(h.x * 0.5 + px * 0.5, y, h.z * 0.5 + pz * 0.5); rig.snap();
      await new Promise(q => setTimeout(q, 700));
      rig.focus.set(h.x * 0.5 + px * 0.5, y, h.z * 0.5 + pz * 0.5); rig.snap?.();
      await new Promise(q => requestAnimationFrame(() => requestAnimationFrame(q)));
      return { y, py: G.player.pos?.y };
    }, { h, dist, st });
    await page.screenshot({ path: f });
    console.log(h.name, h.x.toFixed(1), h.z.toFixed(1), 'yaw', h.rot.toFixed(2), JSON.stringify(info), '->', path.basename(f));
  }
}
if (logs.length) console.log('ERRORS', logs.slice(0, 10).join('\n'));
await browser.close();
