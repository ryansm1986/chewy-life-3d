import { open } from './lib.mjs';
const f = +(process.argv[2] || 5);
const s = await open(`/?fresh&nointro&hour=10`, { wait: 2500 });
await s.ev((f) => {
  G.state.flags.burrowTut = true;
  const P = G.state.player; P.lvl = 16 + f; P.statPts = 0; P.stats = { str: 60 + f * 3, dex: 50 + f * 2, vit: 80 + f * 4, ene: 60 + f * 2 };
  for (const id of ['chomp', 'boneMastery', 'whirl', 'bonestorm', 'throw', 'fetchMastery', 'blaze', 'woof', 'packcall']) P.skills[id] = 6;
  P.hotbar = ['attack', 'chomp', 'whirl', 'bonestorm', 'woof', 'packcall'];
  G.actions.recompute(); P.life = null; P.zoom = null;
  G.enterDungeon(f);
}, f);
await s.sleep(5500);
await s.ev(() => { if (G.ui.dlg.active) G.ui.dlg.finish(-1); window.__scr = (p, y = 0.6) => { const v = p.clone().setY(p.y + y).project(G.engine.camera); return [Math.round((v.x * .5 + .5) * innerWidth), Math.round((-v.y * .5 + .5) * innerHeight)]; }; });
// clear adds around boss, teleport to a walkable spot ~9 units from boss on camera side
await s.ev(() => {
  const b = G.dungeon.boss; for (const m of G.dungeon.monsters) if (m !== b && m.pos.distanceTo(b.pos) < 14) { m.alive = false; m.mesh && (m.mesh.visible = false); m.rig?.root && (m.rig.root.visible = false); }
  let best = null; for (let a = 0; a < 32; a++) for (const r of [9, 8, 10, 7]) { const x = b.pos.x + Math.cos(a / 32 * 6.283) * r, z = b.pos.z + Math.sin(a / 32 * 6.283) * r; if (!G.world.walkable(x, z)) continue; const sc = (x - b.pos.x) + (z - b.pos.z); if (!best || sc > best.sc) best = { x, z, sc }; }
  G.player.setPos(best.x, best.z); G.companion.setPos(best.x + 0.8, best.z + 0.6); G.engine.rig.focus.copy(G.player.pos); G.engine.rig.snap?.();
});
await s.sleep(1200);
await s.snap(`44_bossreal${f}_0`);
const t0 = Date.now(); let i = 0, shots = 1;
await s.page.mouse.move(800, 450);
while (Date.now() - t0 < 16000) {
  const st = await s.ev(() => { const b = G.dungeon.boss; if (!b || !b.alive) return null; if (G.state.player.life != null && G.state.player.life < G.derived.lifeMax * 0.35) G.state.player.life = null; G.state.player.zoom = null; return { sc: __scr(b.pos, 0.8), d: +b.pos.distanceTo(G.player.pos).toFixed(2), life: Math.round(b.life), vis: (() => { const v = G.player.pos.clone().setY(0.5).project(G.engine.camera); return [Math.round((v.x * .5 + .5) * innerWidth), Math.round((-v.y * .5 + .5) * innerHeight)]; })() }; });
  if (!st) break;
  await s.page.mouse.move(st.sc[0], st.sc[1]);
  const k = i % 8;
  if (k < 3) { await s.page.mouse.down(); await s.sleep(450); await s.page.mouse.up(); }
  else if (k === 3) { await s.page.mouse.down({ button: 'right' }); await s.sleep(200); await s.page.mouse.up({ button: 'right' }); }
  else if (k === 4) { await s.key('2'); }
  else if (k === 5) { await s.page.keyboard.down('1'); await s.sleep(700); await s.page.keyboard.up('1'); }
  else if (k === 6) { await s.key('3'); }
  else { await s.key('4'); }
  await s.sleep(120);
  if (i % 5 === 2 && shots < 7) { await s.snap(`44_bossreal${f}_${shots++}`); console.log(i, JSON.stringify(st)); }
  i++;
}
await s.log('end', () => { const b = G.dungeon.boss; return { alive: b?.alive, life: b && Math.round(b.life), max: b?.lifeMax, pl: G.state.player.life, dist: +b.pos.distanceTo(G.player.pos).toFixed(2), bossR: b.radius, bodyR: b.bodyR }; });
await s.close();
