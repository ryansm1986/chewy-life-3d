// Tier run look review (docs/ZONES.md §5.1; ROADMAP Z-E2): boots a tier run with modifiers and shoots a pack fight at the
// game camera. One page per run; shots wait on game state (the dungeon up, the pack awake, ghosts risen), not wall time.
//   node tools/qa/tier-shots.mjs [--run bambooDepths:5:haunted] [--tag name] [--lvl 30] [--hero chewy] [--kill 6]
//        [--hud 0] [--seed 1] [--dist 27]
// → <SHOT_DIR>/tier_<tag>_<n>.png and a line per shot (draw calls, triangles, monsters on the floor, awake)
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2), arg = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const runQ = arg('run', 'bambooDepths:5:haunted'), tag = arg('tag', runQ.replace(/[:,]/g, '_')), lvl = +arg('lvl', 30), hero = arg('hero', 'chewy');
const kill = +arg('kill', 6), hud = arg('hud', '1') !== '0', seed = arg('seed', '1'), dist = +arg('dist', 0);
const OUT = process.env.SHOT_DIR || path.resolve('tools/qa/out/tier');
fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE || 'http://localhost:5173';
const browser = await chromium.launch({ executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.routeWebSocket(/.*/, ws => { ws.onMessage(() => {}); });
const logs = [];
page.on('console', m => { if (m.type() === 'error') logs.push('[error] ' + m.text()); });
page.on('pageerror', e => logs.push('[pageerror] ' + e.message + '\n' + (e.stack || '').split('\n').slice(1, 4).join('\n')));
await page.goto(`${BASE}/?fresh&nointro&notut&hour=10&dseed=${seed}&hero=${hero}`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__ready === true && window.G?.player && window.G.tierDebug, null, { timeout: 60000 });
await page.waitForTimeout(600);
await page.evaluate(({ runQ, lvl }) => {
  const G = window.G, P = G.state.player; G.state.flags.burrowTut = true; P.lvl = lvl; P.stats = { str: 60, dex: 60, vit: 200, ene: 120 }; G.actions.recompute();
  const [id, t, mods, sp] = runQ.split(':'); G.tierDebug.run(id, +t || 0, mods ? mods.split(',') : [], +sp || 0);
}, { runQ, lvl });
await page.waitForFunction(() => window.G?.mode === 'dungeon' && window.G.dungeon?.monsters?.length && !window.G.ui?.iris?.active, null, { timeout: 60000 });
await page.waitForFunction(() => !document.querySelector('.banner, .bn')?.offsetParent, null, { timeout: 8000 }).catch(() => {});
await page.waitForTimeout(1500);
const shot = async (name, note = '') => {
  const r = await page.evaluate(async () => {
    const G = window.G, R = G.engine.renderer; R.info.autoReset = false; R.info.reset();
    await new Promise(q => requestAnimationFrame(() => requestAnimationFrame(q)));
    const o = { calls: R.info.render.calls, tris: R.info.render.triangles, n: G.dungeon.monsters.length, awake: G.dungeon.monsters.filter(m => m.aggro).length, ghosts: G.dungeon.monsters.filter(m => m._ghost).length };
    R.info.autoReset = true; return o;
  });
  const f = path.join(OUT, `tier_${tag}_${name}.png`);
  await page.screenshot({ path: f });
  console.log(`${name.padEnd(10)} calls=${r.calls} tris=${(r.tris / 1e3) | 0}k monsters=${r.n} awake=${r.awake} ghosts=${r.ghosts} ${note} → ${f}`);
};
// the biggest pack near the arrival: the hero stands 6.5 m from it on the camera side, the pack wakes
const info = await page.evaluate(({ hud, dist }) => {
  const G = window.G, D = G.dungeon, P = G.player;
  if (!hud) { const ui = document.getElementById('ui'); if (ui) ui.style.display = 'none'; }
  P.invuln = true; window.__inv = setInterval(() => { P.invuln = true; G.actions.restoreAll?.(); }, 300);
  const groups = new Map();
  for (const m of D.monsters) { if (m.def.boss) continue; const k = m._pack || m.leader || m; const g = groups.get(k) || []; g.push(m); groups.set(k, g); }
  const s = D.startPos; let best = null;
  for (const g of groups.values()) { if (g.length < 5) continue; let cx = 0, cz = 0; for (const m of g) { cx += m.pos.x; cz += m.pos.z; } cx /= g.length; cz /= g.length; const sc = g.length * 2 - Math.hypot(cx - s.x, cz - s.z) * 0.6; if (!best || sc > best.sc) best = { g, cx, cz, sc }; }
  const g = best.g; let x = best.cx + 4.6, z = best.cz + 4.6;
  for (let k = 0; k < 24 && !G.world.walkable(x, z); k++) { const a = k * 0.7; x = best.cx + Math.cos(a) * 6.5; z = best.cz + Math.sin(a) * 6.5; }
  P.setPos(x, z); G.companion?.setPos?.(x + 0.8, z + 0.6); P.faceTarget = P.facing = Math.atan2(best.cx - x, best.cz - z);
  const rig = G.engine.rig; if (dist) rig.distTarget = dist; rig.focus.copy(P.pos); rig.snap();
  for (const m of g) m.alert();
  window.__pack = g;
  return { pack: g.length, kinds: [...new Set(g.map(m => m.id))], ranks: [...new Set(g.map(m => m.rank))], run: D.tr?.label, mods: D.mods, n: D.monsters.length, mlvl: D.layout.mlvl, modded: D.layout.modded, el: D.runMods.monster.el };
}, { hud, dist });
console.log(`${runQ}: ${JSON.stringify(info)}`);
await page.waitForFunction(() => window.__pack.filter(m => m.alive).some(m => Math.hypot(m.pos.x - window.G.player.pos.x, m.pos.z - window.G.player.pos.z) < 4.5), null, { timeout: 8000 }).catch(() => {});
await page.waitForTimeout(400);
await shot('1-pack');
if (kill > 0) {
  await page.evaluate(k => { const G = window.G, live = window.__pack.filter(m => m.alive).slice(0, k); for (const m of live) G.combat.applyDamageToMonster ? G.combat.applyDamageToMonster(m, m.life + 5, { element: 'phys' }) : m.takeDamage(m.life + 5); }, kill);
  await page.waitForFunction(() => (window.G.dungeon.tr?.stats.ghosts || 0) > 0 || !window.G.dungeon.runMods.run.haunted, null, { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(450);
  await shot('2-rise', '(ghosts rising)');
  await page.waitForTimeout(1600);
  await shot('3-fight');
}
const st = await page.evaluate(() => window.G.dungeon.tr?.stats || null);
console.log('tier run stats', JSON.stringify(st));
if (logs.length) console.log(logs.slice(0, 20).join('\n'));
await browser.close();
