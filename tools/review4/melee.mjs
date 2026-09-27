import { open } from './lib.mjs';
// One click on a far monster: does Chewy walk up and swing? time-to-first-hit; also LMB-hold whiff rate vs moving mobs.
const s = await open('/?fresh&nointro&floor=3', { wait: 7000 });
await s.ev(() => {
  if (G.ui.dlg.active) G.ui.dlg.finish(-1); G.state.flags.burrowTut = true;
  const P = G.state.player; P.lvl = 8; P.stats = { str: 40, dex: 30, vit: 200, ene: 30 }; G.actions.recompute(); P.life = null;
  window.__scr = (p, y = 0.6) => { const v = p.clone().setY(p.y + y).project(G.engine.camera); return [Math.round((v.x * .5 + .5) * innerWidth), Math.round((-v.y * .5 + .5) * innerHeight)]; };
  G.companion.hold = { x: -999, z: -999 }; G.companion.setPos(-50, -50); // keep Shadow out of the measurement
});
const results = [];
for (let t = 0; t < 6; t++) {
  const pick = await s.ev(() => {
    const p = G.player.pos; let best = null;
    for (const m of G.dungeon.monsters) { if (!m.alive || m.isBoss) continue; const d = m.pos.distanceTo(p); if (d > 4.5 && d < 8.5) { let clear = true; for (let k = 0.1; k < 1; k += 0.1) if (!G.world.walkable(p.x + (m.pos.x - p.x) * k, p.z + (m.pos.z - p.z) * k)) clear = false; if (clear && (!best || d < best.d)) best = { m, d }; } }
    if (!best) { // teleport next to a new monster 6 m away on a clear line
      for (const m of G.dungeon.monsters) { if (!m.alive || m.isBoss) continue; for (let a = 0; a < 16; a++) { const x = m.pos.x + Math.cos(a / 16 * 6.283) * 6.5, z = m.pos.z + Math.sin(a / 16 * 6.283) * 6.5; let clear = G.world.walkable(x, z); for (let k = 0.1; k < 1 && clear; k += 0.1) if (!G.world.walkable(x + (m.pos.x - x) * k, z + (m.pos.z - z) * k)) clear = false; if (clear) { G.player.setPos(x, z); G.engine.rig.focus.copy(G.player.pos); G.engine.rig.snap(); best = { m, d: 6.5 }; break; } } if (best) break; }
    }
    if (!best) return null;
    for (const o of G.dungeon.monsters) if (o !== best.m && o.alive && o.pos.distanceTo(best.m.pos) < 7) { o.alive = false; o.rig?.root && (o.rig.root.visible = false); o.mesh && (o.mesh.visible = false); }
    window.__tm = best.m; window.__t0 = performance.now(); window.__first = null; const m = best.m; let last = m.life;
    clearInterval(window.__iv); window.__iv = setInterval(() => { if (m.life < last && window.__first == null) window.__first = Math.round(performance.now() - window.__t0); last = m.life; }, 10);
    return { d: +best.d.toFixed(1), name: m.name };
  });
  if (!pick) break;
  await s.sleep(500);
  const sc = await s.ev(() => __scr(__tm.pos, 0.6));
  if (!(sc[0] > 330 && sc[0] < 1330 && sc[1] > 130 && sc[1] < 680)) { console.log('offscreen', sc); continue; }
  await s.ev(() => { window.__t0 = performance.now(); });
  await s.page.mouse.move(sc[0], sc[1]); await s.page.mouse.down(); await s.sleep(60); await s.page.mouse.up();
  if (t === 0) { await s.sleep(500); await s.snap('72_melee_walkup'); await s.sleep(400); await s.snap('72_melee_swing'); }
  await s.sleep(t === 0 ? 1600 : 2500);
  const r = await s.ev(() => ({ first: window.__first, life: Math.round(__tm.life), max: __tm.lifeMax, dist: +__tm.pos.distanceTo(G.player.pos).toFixed(2), alive: __tm.alive }));
  results.push({ ...pick, ...r }); console.log('trial', t, JSON.stringify({ ...pick, ...r }));
}
await s.close();
