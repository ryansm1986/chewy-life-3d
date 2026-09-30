import { open } from './lib.mjs';
// Clicking a NON-walkable point (wall top / void) 4-8 m away: does Chewy go somewhere sensible (nearest reachable
// spot toward it) or stand still / grind against the wall?
const s = await open('/?fresh&nointro&floor=1', { wait: 7000 });
await s.ev(() => { if (G.ui.dlg.active) G.ui.dlg.finish(-1); G.state.flags.burrowTut = true; for (const m of G.dungeon.monsters) { m.alive = false; m.world.scene.remove(m.model.root, m.shadow); }
  window.__w2s = (x, z, y) => { const v = new G.THREE.Vector3(x, y ?? G.world.heightAt(x, z), z).project(G.engine.camera); return [Math.round((v.x * .5 + .5) * innerWidth), Math.round((-v.y * .5 + .5) * innerHeight)]; }; });
let n = 0; const res = [];
for (let t = 0; t < 40 && n < 6; t++) {
  const c = await s.ev(() => {
    const W = G.world, L = W.L, CELL = W.cellSize || 2;
    for (let k = 0; k < 4000; k++) {
      const x = Math.random() * L.W * CELL, z = Math.random() * L.H * CELL; if (!W.walkable(x, z)) continue;
      const ang = Math.random() * 6.283, r = 4 + Math.random() * 4; const tx = x + Math.cos(ang) * r, tz = z + Math.sin(ang) * r;
      if (W.walkable(tx, tz)) continue;
      // first blocked sample along the line: how far could he get straight?
      let free = 0; for (let q = 0.02; q < 1; q += 0.02) { if (!W.walkable(x + (tx - x) * q, z + (tz - z) * q)) break; free = q * r; }
      if (free < 1.5) continue;
      G.player.setPos(x, z); G.engine.rig.focus.copy(G.player.pos); G.engine.rig.snap();
      return { x, z, tx, tz, free: +free.toFixed(1), r: +r.toFixed(1) };
    }
    return null;
  });
  if (!c) break;
  await s.sleep(500);
  const sc = await s.ev(c => __w2s(c.tx, c.tz, G.player.pos.y), c);
  if (!(sc[0] > 330 && sc[0] < 1330 && sc[1] > 130 && sc[1] < 680)) continue;
  n++;
  await s.page.mouse.move(sc[0], sc[1]); await s.page.mouse.down(); await s.sleep(100); await s.page.mouse.up();
  await s.sleep(3000);
  const r = await s.ev(c => ({ moved: +Math.hypot(G.player.pos.x - c.x, G.player.pos.z - c.z).toFixed(2), toTarget: +Math.hypot(G.player.pos.x - c.tx, G.player.pos.z - c.tz).toFixed(2) }), c);
  res.push({ ...c, ...r }); console.log('trial', n, 'free straight', c.free, 'of', c.r, '-> moved', r.moved, 'left', r.toTarget);
  if (n === 1) await s.snap('75_click_wall');
}
await s.close();
