import { open } from './lib.mjs';
for (const f of [2, 8, 13, 18]) {
  const s = await open(`/?fresh&nointro&floor=${f}`, { wait: 6000 });
  await s.ev(() => { if (G.ui.dlg.active) G.ui.dlg.finish(-1); G.state.flags.burrowTut = true; for (const m of G.dungeon.monsters) m.aggro = false; });
  // find walkable spots whose camera-ward neighbour cells (toward camera) are solid for >=2 cells
  const spots = await s.ev(() => {
    const W = G.world, cam = G.engine.camera; const out = [];
    const dir = new G.THREE.Vector3(cam.position.x - G.player.pos.x, 0, cam.position.z - G.player.pos.z).normalize();
    const L = W.L; const CELL = (W.cellSize || 2);
    for (let t = 0; t < 4000 && out.length < 12; t++) {
      const x = Math.random() * L.W * CELL, z = Math.random() * L.H * CELL;
      if (!W.walkable(x, z)) continue;
      let solid = 0; for (let d = 1.2; d <= 4.5; d += 0.6) if (W.solidAtCell(x + dir.x * d, z + dir.z * d)) solid++;
      let clear = W.walkable(x - dir.x * 2, z - dir.z * 2);
      if (solid >= 4 && clear) out.push([+x.toFixed(1), +z.toFixed(1), solid]);
    }
    return { dir: [dir.x, dir.z], out };
  });
  console.log('floor', f, JSON.stringify(spots));
  let k = 0;
  for (const [x, z] of spots.out.slice(0, 2)) {
    await s.ev(([x, z]) => { G.player.setPos(x, z); G.companion.setPos(x - 0.8, z - 0.6); G.engine.rig.focus.copy(G.player.pos); G.engine.rig.snap?.(); }, [x, z]);
    await s.sleep(1200);
    await s.snap(`43_cutaway_f${f}_${k++}`);
  }
  await s.close();
}
