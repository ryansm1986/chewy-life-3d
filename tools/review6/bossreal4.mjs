import { open } from './lib.mjs';
// Real-input boss fight: mouse clicks (LMB/RMB) + number keys; clicks are only sent when the boss projects inside a
// safe playfield rect (away from minimap/quest panel/hotbar); otherwise Chewy walks toward it with a ground click.
const f = +(process.argv[2] || 15);
const lvl = +(process.argv[3] || 0) || (14 + f);
const dur = +(process.argv[4] || 30000);
const s = await open(`/?fresh&nointro&hour=10`, { wait: 2500 });
await s.ev(([f, lvl]) => {
  G.state.flags.burrowTut = true;
  const P = G.state.player; P.lvl = lvl; P.statPts = 0; P.stats = { str: 40 + lvl * 2, dex: 35 + lvl * 1.5, vit: 50 + lvl * 3, ene: 40 + lvl * 1.5 };
  for (const id of ['chomp', 'boneMastery', 'whirl', 'bonestorm', 'throw', 'fetchMastery', 'blaze', 'woof', 'packcall']) P.skills[id] = Math.min(8, Math.round(lvl / 4));
  P.hotbar = ['attack', 'chomp', 'whirl', 'bonestorm', 'woof', 'packcall'];
  G.actions.recompute(); P.life = null; P.zoom = null;
  G.enterDungeon(f);
}, [f, lvl]);
await s.sleep(5500);
await s.ev(() => {
  if (G.ui.dlg.active) G.ui.dlg.finish(-1);
  window.__scr = (p, y = 0.6) => { const v = p.clone().setY(p.y + y).project(G.engine.camera); return [Math.round((v.x * .5 + .5) * innerWidth), Math.round((-v.y * .5 + .5) * innerHeight)]; };
  window.__hits = 0; window.__dmg = 0; const b = G.dungeon.boss; let last = b.life;
  window.__track = setInterval(() => { const b = G.dungeon.boss; if (!b) return; if (b.life < last) { window.__hits++; window.__dmg += last - b.life; } last = b.life; }, 16);
});
await s.ev(() => {
  const b = G.dungeon.boss; for (const m of G.dungeon.monsters) if (m !== b && m.pos.distanceTo(b.pos) < 14) { m.alive = false; m.mesh && (m.mesh.visible = false); m.rig?.root && (m.rig.root.visible = false); }
  let best = null; for (let a = 0; a < 48; a++) for (const r of [9, 8, 10, 7, 11]) { const x = b.pos.x + Math.cos(a / 48 * 6.283) * r, z = b.pos.z + Math.sin(a / 48 * 6.283) * r; if (!G.world.walkable(x, z)) continue; let ok = true; for (let t = 0.1; t < 1; t += 0.1) if (!G.world.walkable(x + (b.pos.x - x) * t, z + (b.pos.z - z) * t)) ok = false; if (!ok) continue; const sc = (x - b.pos.x) + (z - b.pos.z); if (!best || sc > best.sc) best = { x, z, sc }; }
  G.player.setPos(best.x, best.z); G.companion.setPos(best.x + 0.8, best.z + 0.6); G.engine.rig.focus.copy(G.player.pos); G.engine.rig.snap?.();
});
await s.sleep(1200);
await s.snap(`60_boss${f}_0`);
const SAFE = (p) => p[0] > 330 && p[0] < 1330 && p[1] > 130 && p[1] < 680;
const t0 = Date.now(); let i = 0, shots = 1, uiClicks = 0, walks = 0;
const lifeLog = [];
await s.page.mouse.move(800, 450);
while (Date.now() - t0 < dur) {
  const st = await s.ev(() => { const b = G.dungeon.boss; if (!b || !b.alive) return null; if (G.state.player.life != null && G.state.player.life < G.derived.lifeMax * 0.3) G.state.player.life = null; G.state.player.zoom = null; return { sc: __scr(b.pos, 0.8), me: __scr(G.player.pos, 0.5), d: +b.pos.distanceTo(G.player.pos).toFixed(2), life: Math.round(b.life), st: b.state, pl: Math.round(G.state.player.life ?? G.derived.lifeMax) }; });
  if (!st) break;
  if (i % 6 === 0) lifeLog.push(`${((Date.now() - t0) / 1000).toFixed(1)}s life=${st.life} d=${st.d} st=${st.st} pl=${st.pl}`);
  let target = st.sc;
  if (!SAFE(target)) { // walk toward it: ground click between Chewy and boss, clamped into the playfield
    const dx = target[0] - st.me[0], dy = target[1] - st.me[1], L = Math.hypot(dx, dy) || 1;
    const g = [Math.min(1300, Math.max(360, st.me[0] + dx / L * 180)), Math.min(660, Math.max(160, st.me[1] + dy / L * 180))];
    await s.page.mouse.move(g[0], g[1]); await s.page.mouse.down(); await s.sleep(250); await s.page.mouse.up(); walks++;
    i++; continue;
  }
  await s.page.mouse.move(target[0], target[1]);
  const uiHit = await s.ev(([x, y]) => { const e = document.elementFromPoint(x, y); return e && e.tagName !== 'CANVAS' ? (e.className || e.tagName) + '' : null; }, target);
  if (uiHit) { uiClicks++; }
  const k = i % 8;
  if (k < 3) { await s.page.mouse.down(); await s.sleep(450); await s.page.mouse.up(); }
  else if (k === 3) { await s.page.mouse.down({ button: 'right' }); await s.sleep(200); await s.page.mouse.up({ button: 'right' }); }
  else if (k === 4) { await s.key('2'); }
  else if (k === 5) { await s.page.keyboard.down('1'); await s.sleep(700); await s.page.keyboard.up('1'); }
  else if (k === 6) { await s.key('3'); }
  else { await s.key('4'); }
  await s.sleep(120);
  if (i % 6 === 2 && shots < 8) { await s.snap(`60_boss${f}_${shots++}`); }
  i++;
}
console.log(lifeLog.join('\n'));
await s.log('end', () => { const b = G.dungeon.boss; clearInterval(window.__track); return { alive: b?.alive, life: b && Math.round(b.life), max: b?.lifeMax, hits: window.__hits, dmg: Math.round(window.__dmg), dist: +b.pos.distanceTo(G.player.pos).toFixed(2), plLvl: G.state.player.lvl, dmgRange: [G.derived.dmgMin, G.derived.dmgMax] }; });
console.log('uiClicks', uiClicks, 'walks', walks, 'iters', i, 'secs', ((Date.now() - t0) / 1000).toFixed(1));
await s.snap(`60_boss${f}_end`);
await s.close();
