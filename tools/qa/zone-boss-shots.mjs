// A zone dungeon's boss fight at the game camera (docs/ZONES.md §8.2): floor 2, the approach cleared, step into the
// arena (the seal, the intro), then a real fight (the hero swings at the boss, invulnerable), every move the boss's
// def.debug offers forced once, phase 2, the kill, the first-clear chest. Screenshots + the states the boss went
// through, the farthest it strayed from the arena centre, adds inside / outside the ring.
//   node tools/qa/zone-boss-shots.mjs [--id bambooDepths] [--tag tf] [--lvl 12] [--moves gust,tornado] [--fight 8]
// → <SHOT_DIR>/<tag>_*.png
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2), arg = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const id = arg('id', 'bambooDepths'), TAG = arg('tag', 'boss_' + id), lvl = +arg('lvl', 12), nFight = +arg('fight', 8), movesArg = arg('moves', '');
const OUT = process.env.SHOT_DIR || path.resolve('tools/qa/out/zone'); fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE || 'http://localhost:5173';
const browser = await chromium.launch({ executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.routeWebSocket(/.*/, ws => { ws.onMessage(() => {}); });
const errs = [];
page.on('pageerror', e => errs.push('[pageerror] ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('[console] ' + m.text()); });
await page.goto(`${BASE}/?fresh&nointro&notut&dseed=1&hour=10`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__ready === true && window.G?.player, null, { timeout: 90000 });
await page.evaluate(({ id, lvl }) => { const G = window.G, P = G.state.player; G.state.flags.burrowTut = true; P.lvl = lvl; P.stats = { str: 40, dex: 30, vit: 60, ene: 30 }; for (const s of ['chomp', 'whirl']) P.skills[s] = 5; G.actions.recompute(); G.enterDungeon({ id, floor: 2 }); }, { id, lvl });
await page.waitForFunction(() => window.G.mode === 'dungeon' && window.G.dungeon?.boss && !window.G.ui?.iris?.active, null, { timeout: 60000 });
await page.waitForTimeout(1200);
const snap = async n => page.screenshot({ path: `${OUT}/${TAG}_${n}.png` });
const info = await page.evaluate(() => {
  const G = window.G, D = G.dungeon, L = D.layout, A = L.arena, M = L.arenaMouth, b = D.boss, P = G.player;
  for (const m of D.monsters) if (m !== b && m.alive && Math.hypot(m.pos.x - A.x, m.pos.z - A.z) < A.r + 14) { m.pos.set(-900, 0, -900); m.aggro = false; }
  const ux = (M.x - A.x) / Math.hypot(M.x - A.x, M.z - A.z), uz = (M.z - A.z) / Math.hypot(M.x - A.x, M.z - A.z);
  P.setPos(A.x + ux * (A.r - 3.0), A.z + uz * (A.r - 3.0)); G.engine.rig.focus.copy(P.pos); G.engine.rig.snap();
  window.__sts = new Set(); window.__maxR = 0;
  const stOf = () => b.tg?.st ?? b.tk?.st ?? b.Y?.st ?? b.U?.st ?? b.rs?.st ?? b.state;
  setInterval(() => { P.invuln = true; G.actions.restoreAll(); window.__sts.add(String(stOf())); window.__maxR = Math.max(window.__maxR, Math.hypot(b.pos.x - A.x, b.pos.z - A.z)); }, 60);
  return { boss: b.id, arena: A, debug: Object.keys(b.def.debug || {}) };
});
console.log('arena', JSON.stringify(info));
await snap('0_enter');
await page.waitForTimeout(1500); await snap('1_intro');
await page.waitForTimeout(3000); await snap('2_after_intro');
await page.evaluate(() => { const G = window.G, D = G.dungeon, b = D.boss, P = G.player; const ROT = ['attack', 'attack', 'chomp', 'attack', 'whirl']; let k = 0;
  window.__iv = setInterval(() => { const d = Math.hypot(b.pos.x - P.pos.x, b.pos.z - P.pos.z); if (d > 2.6) P.setPos(P.pos.x + (b.pos.x - P.pos.x) * 0.25, P.pos.z + (b.pos.z - P.pos.z) * 0.25); G.skills.cds = {}; try { G.skills.tryCast(ROT[k++ % ROT.length], b.pos.clone(), b); } catch (e) { /* skill not ready */ } }, 350); });
for (let i = 0; i < nFight; i++) { await page.waitForTimeout(2200); await snap(`3_fight_${i}`); }
const moves = movesArg ? movesArg.split(',') : info.debug.filter(k => !['state', 'rest', 'phase2'].includes(k));
for (const mv of moves) {
  const ok = await page.evaluate(mv => { const b = window.G.dungeon.boss; if (!b.alive || !b.def.debug?.[mv]) return false; b.def.debug[mv](b); return true; }, mv);
  if (!ok) continue;
  await page.waitForTimeout(1300); await snap(`4_${mv}`);
  await page.waitForTimeout(1500); await snap(`4_${mv}_b`);
}
if (info.debug.includes('phase2')) { await page.evaluate(() => { const b = window.G.dungeon.boss; b.def.debug.phase2(b); }); await page.waitForTimeout(1500); await snap('5_phase2'); await page.waitForTimeout(2000); await snap('5_phase2_b'); }
const adds = await page.evaluate(() => { const G = window.G, D = G.dungeon, A = D.layout.arena, b = D.boss; const near = D.monsters.filter(m => m.alive && m !== b && Math.hypot(m.pos.x - A.x, m.pos.z - A.z) < A.r + 1); return { n: near.length, ids: [...new Set(near.map(m => m.id))], strayAdds: D.monsters.filter(m => m.alive && m !== b && m.aggro && Math.hypot(m.pos.x - A.x, m.pos.z - A.z) > A.r + 1 && Math.hypot(m.pos.x - A.x, m.pos.z - A.z) < A.r + 8).length }; });
await page.evaluate(() => { clearInterval(window.__iv); const G = window.G, b = G.dungeon.boss; G.combat.hitMonster(b, { dmgPct: 1e8 }); });
await page.waitForTimeout(1200); await snap('6_victory'); await page.waitForTimeout(3600); await snap('6_chest');
const end = await page.evaluate(() => ({ sts: [...window.__sts], maxR: +window.__maxR.toFixed(1), r: window.G.dungeon.layout.arena.r, chest: window.G.world.interactables.some(i => /treasure chest/i.test(i.label)), portal: window.G.world.interactables.find(i => /Return to/.test(i.label))?.label || null }));
console.log('adds', JSON.stringify(adds));
console.log('end', JSON.stringify(end));
if (errs.length) console.log('errors:\n  ' + [...new Set(errs)].slice(0, 10).join('\n  '));
await browser.close();
