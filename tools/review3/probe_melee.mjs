import { open } from './lib.mjs';
const f = +(process.argv[2] || 20);
const s = await open(`/?fresh&nointro&hour=10`, { wait: 2500 });
await s.ev((f) => {
  G.state.flags.burrowTut = true;
  const P = G.state.player; P.lvl = 36; P.stats = { str: 120, dex: 90, vit: 160, ene: 100 };
  for (const id of ['chomp', 'boneMastery', 'whirl', 'bonestorm']) P.skills[id] = 6;
  P.hotbar = ['attack', 'chomp', 'whirl', 'bonestorm', null, null];
  G.actions.recompute(); P.life = null; P.zoom = null; G.enterDungeon(f);
}, f);
await s.sleep(5500);
await s.ev(() => { if (G.ui.dlg.active) G.ui.dlg.finish(-1); window.__scr = (p, y = 0.6) => { const v = p.clone().setY(p.y + y).project(G.engine.camera); return [Math.round((v.x * .5 + .5) * innerWidth), Math.round((-v.y * .5 + .5) * innerHeight)]; };
  const b = G.dungeon.boss; for (const m of G.dungeon.monsters) if (m !== b && m.pos.distanceTo(b.pos) < 14) { m.alive = false; m.rig?.root && (m.rig.root.visible = false); }
  let best = null; for (let a = 0; a < 32; a++) for (const r of [6, 5, 7]) { const x = b.pos.x + Math.cos(a / 32 * 6.283) * r, z = b.pos.z + Math.sin(a / 32 * 6.283) * r; if (!G.world.walkable(x, z)) continue; const sc = (x - b.pos.x) + (z - b.pos.z); if (!best || sc > best.sc) best = { x, z, sc }; }
  G.player.setPos(best.x, best.z); G.companion.setPos(best.x + 0.8, best.z + 0.6); G.engine.rig.focus.copy(G.player.pos); G.engine.rig.snap?.();
});
await s.sleep(1500);
for (let i = 0; i < 24; i++) {
  const st = await s.ev(() => { const b = G.dungeon.boss; G.state.player.life = null; return { sc: __scr(b.pos, 0.8) }; });
  await s.page.mouse.move(st.sc[0], st.sc[1]);
  await s.page.mouse.down(); await s.sleep(250);
  const r = await s.ev(() => { const b = G.dungeon.boss, p = G.player; return { d: +b.pos.distanceTo(p.pos).toFixed(2), bl: Math.round(b.life), anim: p.anim?.action?.name || null, mt: p.moveTarget ? +p.moveTarget.distanceTo(p.pos).toFixed(2) : null, at: p.attackTarget?.name || p.target?.name || null, hover: document.querySelector('.target-frame, [class*=target]')?.innerText?.slice(0, 30), bst: b.state || b.mode?.name || b.ai, bpos: [b.pos.x.toFixed(1), b.pos.z.toFixed(1)], ppos: [p.pos.x.toFixed(1), p.pos.z.toFixed(1)] }; });
  await s.page.mouse.up();
  console.log(i, JSON.stringify(r));
  if (i === 6 || i === 14) await s.snap(`45_melee${f}_${i}`);
  await s.sleep(150);
}
await s.close();
