import { open } from './lib.mjs';
// Click-to-move around corners in the Burrow: pick on-screen floor points whose straight line from Chewy is blocked
// (but reachable), click them with the real mouse, and see whether Chewy gets there.
const s = await open('/?fresh&nointro&floor=7', { wait: 7000 });
await s.ev(() => { if (G.ui.dlg.active) G.ui.dlg.finish(-1); G.state.flags.burrowTut = true; for (const m of G.dungeon.monsters) { m.alive = false; m.world.scene.remove(m.model.root, m.shadow); } G.state.player.lvl = 20; G.actions.recompute();
  window.__w2s = (x, z) => { const v = new G.THREE.Vector3(x, G.world.heightAt(x, z), z).project(G.engine.camera); return [Math.round((v.x * .5 + .5) * innerWidth), Math.round((-v.y * .5 + .5) * innerHeight)]; }; });
let trials = 0, ok = 0;
for (let t = 0; t < 30 && trials < 6; t++) {
  const c = await s.ev(() => {
    const W = G.world, L = W.L, CELL = W.cellSize || 2;
    for (let k = 0; k < 3000; k++) {
      const x = Math.random() * L.W * CELL, z = Math.random() * L.H * CELL; if (!W.walkable(x, z)) continue;
      // candidate target 5-9 m away, straight line blocked
      for (let a = 0; a < 12; a++) { const r = 5 + Math.random() * 4, ang = Math.random() * 6.283; const tx = x + Math.cos(ang) * r, tz = z + Math.sin(ang) * r; if (!W.walkable(tx, tz)) continue;
        let blocked = false; for (let q = 0.05; q < 1; q += 0.05) if (!W.walkable(x + (tx - x) * q, z + (tz - z) * q)) { blocked = true; break; }
        if (!blocked) continue;
        // reachable within a short BFS on walkable samples (0.5 m grid, 14 m box)
        const step = 0.5, seen = new Set(), key = (i, j) => i + ',' + j; const q0 = [[0, 0]]; seen.add(key(0, 0)); let found = false, n = 0;
        while (q0.length && n++ < 6000) { const [i, j] = q0.shift(); const px = x + i * step, pz = z + j * step; if (Math.hypot(px - tx, pz - tz) < 0.6) { found = true; break; } for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ni = i + di, nj = j + dj; if (Math.abs(ni) > 28 || Math.abs(nj) > 28 || seen.has(key(ni, nj))) continue; if (!W.walkable(x + ni * step, z + nj * step)) continue; seen.add(key(ni, nj)); q0.push([ni, nj]); } }
        if (!found) continue;
        G.player.setPos(x, z); G.engine.rig.focus.copy(G.player.pos); G.engine.rig.snap();
        return { x, z, tx, tz };
      }
    }
    return null;
  });
  if (!c) break;
  await s.sleep(500);
  const sc = await s.ev(c => __w2s(c.tx, c.tz), c);
  if (!(sc[0] > 330 && sc[0] < 1330 && sc[1] > 130 && sc[1] < 680)) continue;
  const under = await s.ev(([x, y]) => document.elementFromPoint(x, y)?.tagName, sc); if (under !== 'CANVAS') continue;
  trials++;
  await s.page.mouse.move(sc[0], sc[1]); await s.page.mouse.down(); await s.sleep(120); await s.page.mouse.up();
  await s.sleep(4500);
  const d = await s.ev(c => +Math.hypot(G.player.pos.x - c.tx, G.player.pos.z - c.tz).toFixed(2), c);
  if (d < 1) ok++;
  console.log('trial', trials, 'straight', +Math.hypot(c.tx - c.x, c.tz - c.z).toFixed(1), 'final dist', d);
  if (trials === 1) await s.snap('74_pathing_stuck');
}
console.log('reached', ok, '/', trials);
await s.close();
