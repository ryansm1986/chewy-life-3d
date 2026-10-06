// Zone dungeon look tour (docs/ZONES.md §8.2): boots into a zone dungeon floor and shoots every chamber (and the arena)
// at the game camera, at the dungeon's yaw and a quarter turn round (both yaws), HUD and monsters hidden unless asked.
//   node tools/qa/zone-shots.mjs [--id bambooDepths] [--floor 1] [--seed 1] [--dist 27] [--only start,camp,...]
//        [--yaws 1|2] [--hud] [--mons] [--tag name] [--lvl 10] [--pts "x,z;x,z"] [--close 14]
// → <SHOT_DIR>/zs_<tag>_f<floor>_<room>_<yaw>.png, with draw calls / triangles per shot printed
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2), arg = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; }, has = k => args.includes('--' + k);
const id = arg('id', 'bambooDepths'), floor = +arg('floor', 1), seed = arg('seed', '1'), dist = +arg('dist', 27), only = arg('only', ''), yaws = +arg('yaws', 2), tag = arg('tag', 'now'), lvl = +arg('lvl', 10), extra = arg('pts', ''), close = +arg('close', 0);
const OUT = process.env.SHOT_DIR || path.resolve('tools/qa/out/zone');
fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE || 'http://localhost:5173';
const browser = await chromium.launch({ executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.routeWebSocket(/.*/, ws => { ws.onMessage(() => {}); });
const logs = [];
page.on('console', m => { if (m.type() === 'error') logs.push('[error] ' + m.text()); });
page.on('pageerror', e => logs.push('[pageerror] ' + e.message + '\n' + (e.stack || '').split('\n').slice(1, 4).join('\n')));
await page.goto(`${BASE}/?fresh&nointro&notut&hour=10&dseed=${seed}`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__ready === true && window.G?.player, null, { timeout: 60000 });
await page.waitForTimeout(800);
await page.evaluate(({ id, floor, lvl }) => { const G = window.G; G.state.flags.burrowTut = true; G.state.player.lvl = lvl; G.actions.recompute(); G.enterDungeon({ id, floor }); }, { id, floor, lvl });
await page.waitForFunction(() => window.G?.mode === 'dungeon' && window.G.dungeon?.monsters?.length && !window.G.ui?.iris?.active, null, { timeout: 40000 });
await page.waitForTimeout(2500);
const info = await page.evaluate(({ hud, mons, extra }) => {
  const G = window.G, D = G.dungeon, L = D.layout;
  if (!hud) { const ui = document.getElementById('ui'); if (ui) ui.style.display = 'none'; }
  if (!mons) for (const m of D.monsters) { m.pos.set(-500, 0, -500); m.aggro = false; m.sync?.(); }
  G.player.invuln = true;
  const spots = L.rooms.map((r, i) => ({ name: `${i}-${r.kind}`, x: (r.cx + 0.5) * 2, z: (r.cy + 0.5) * 2 }));
  if (L.arena) spots.push({ name: 'arena-ring', x: L.arena.x + L.arena.r * 0.45, z: L.arena.z + L.arena.r * 0.45 });
  if (L.stairs) spots.push({ name: 'stairs', x: (L.stairs.x + 0.5) * 2 + 1.5, z: (L.stairs.y + 0.5) * 2 + 1.5 });
  for (const c of L.chests) if (c.quality === 'gold') spots.push({ name: 'treasure-chest', x: (c.x + 0.5) * 2 + 1.2, z: (c.y + 0.5) * 2 + 1.2 });
  for (const [i, s] of (L.slots || []).entries()) spots.push({ name: 'slot' + i, x: (s.x + 0.5) * 2 + 1.5, z: (s.y + 0.5) * 2 + 1.5 });
  for (const [i, st] of (G.world.kitState?.streams || []).entries()) { const p = st.pts[Math.floor(st.pts.length / 2)]; spots.push({ name: 'stream' + i, x: p[0] + 1, z: p[1] + 1 }); }
  if (extra) extra.split(';').forEach((s, i) => { const [x, z] = s.split(',').map(Number); spots.push({ name: 'pt' + i, x, z }); });
  return { spots, theme: L.theme, n: D.monsters.length, total: L.packTotal, plan: G.world.roomPlan, dress: G.world.roomDressStats, tops: G.world.topCount };
}, { hud: has('hud'), mons: has('mons'), extra });
console.log(`${id} floor ${floor} (${info.theme}): ${info.n} monsters (${info.total} planned); rooms ${JSON.stringify(info.plan)}; dress ${JSON.stringify(info.dress)}; tops ${JSON.stringify(info.tops)}`);
const list = [];
for (const s of info.spots) {
  if (only && !only.split(',').some(k => s.name.includes(k))) continue;
  for (let yi = 0; yi < yaws; yi++) {
    const yaw = Math.PI / 4 + yi * Math.PI / 2;
    const r = await page.evaluate(async ({ x, z, dist, yaw, close }) => {
      const G = window.G, P = G.player, rig = G.engine.rig;
      P.setPos(x, z); G.companion?.setPos?.(x + 0.9, z + 0.6);
      rig.yawTarget = yaw; rig.distTarget = close || dist; rig.focus.copy(P.pos); rig.snap();
      await new Promise(q => setTimeout(q, 900));
      const R = G.engine.renderer; R.info.autoReset = false; R.info.reset();
      await new Promise(q => requestAnimationFrame(() => requestAnimationFrame(q)));
      const out = { calls: R.info.render.calls, tris: R.info.render.triangles }; R.info.autoReset = true;
      return out;
    }, { ...s, dist, yaw, close });
    const f = path.join(OUT, `zs_${tag}_f${floor}_${s.name}_${yi ? 'y2' : 'y1'}.png`);
    await page.screenshot({ path: f });
    list.push(`${f}\t${s.name} ${yi ? 'yaw+90' : ''} (${r.calls} calls, ${(r.tris / 1e3) | 0}k)`);
    console.log(`${s.name.padEnd(16)} yaw${yi + 1} calls=${r.calls} tris=${(r.tris / 1e3) | 0}k → ${f}`);
  }
}
fs.writeFileSync(path.join(OUT, `zs_${tag}_f${floor}.txt`), list.join('\n'));
if (logs.length) console.log([...new Set(logs)].slice(0, 20).join('\n'));
await browser.close();
