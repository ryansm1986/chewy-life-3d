import { open } from './lib.mjs';
const s = await open('/?fresh&nointro&hour=11', { wait: 3000 });
await s.ev(async () => {
  window.__w2s = (x, z) => { const v = new G.THREE.Vector3(x, G.world.heightAt(x, z), z).project(G.engine.camera); return [Math.round((v.x * .5 + .5) * innerWidth), Math.round((-v.y * .5 + .5) * innerHeight)]; };
  window.__T = (await import('/src/world/terrain.js')).T;
});
await s.key('b'); await s.sleep(1500);
// where are existing zones?
await s.log('zones', () => { const z = G.sim.S.zones; const xs = z.map(a => a[0]), zs = z.map(a => a[1]); return { n: z.length, bbox: [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)], player: [G.player.pos.x | 0, G.player.pos.z | 0] }; });
let zspot = await s.ev(() => {
  const sim = G.sim, W = 112, T = __T;
  let best = null; const p = G.player.pos;
  for (let z0 = 8; z0 < 100; z0++) for (let x0 = 8; x0 < 100; x0++) {
    let good = true;
    for (let z = z0; z < z0 + 4 && good; z++) for (let x = x0; x < x0 + 5 && good; x++) { const i = z * W + x; if (sim.terrain.tiles[i] !== T.GRASS || sim.occ[i] >= 0 || sim.zone[i]) good = false; }
    if (!good) continue;
    let road = false; for (let x = x0; x < x0 + 5; x++) for (const zz of [z0 - 1, z0 + 4]) { const t = sim.terrain.tile(x, zz); if (t === T.PATH || t === T.PLAZA) road = true; }
    for (let z = z0; z < z0 + 4; z++) for (const xx of [x0 - 1, x0 + 5]) { const t = sim.terrain.tile(xx, z); if (t === T.PATH || t === T.PLAZA) road = true; }
    if (!road) continue;
    const d = Math.hypot(x0 - p.x, z0 - p.z); if (!best || d < best.d) best = { x0, z0, d };
  }
  if (best) G.buildFocus = new G.THREE.Vector3(best.x0 + 2.5, 0, best.z0 + 2);
  return best;
});
await s.sleep(1500);
if (zspot) zspot = { ...zspot, ...(await s.ev(z => ({ a: __w2s(z.x0 + 0.5, z.z0 + 0.5), b: __w2s(z.x0 + 4.5, z.z0 + 3.5) }), zspot)) };
console.log('zspot', JSON.stringify(zspot));
const zbtn = await s.ev(() => { const b = document.querySelector('.bd-tools .zone[data-z="R"]'); const r = b.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
await s.click(zbtn[0], zbtn[1]); await s.sleep(500);
await s.snap('19_zone_tool_selected');
if (zspot) {
  const [ax, ay] = zspot.a, [bx, by] = zspot.b;
  await s.page.mouse.move(ax, ay, { steps: 4 }); await s.sleep(200);
  await s.page.mouse.down();
  for (let i = 1; i <= 12; i++) { await s.page.mouse.move(ax + (bx - ax) * i / 12, ay + (by - ay) * i / 12); await s.sleep(40); }
  await s.sleep(250); await s.snap('19b_zone_dragging');
  await s.page.mouse.up(); await s.sleep(800);
  await s.snap('19c_zone_painted');
  await s.log('zones after', () => G.sim.S.zones.length);
  // exit build and let it grow
  await s.key('Escape'); await s.sleep(200);
  await s.ev(() => { G.build.exit(); }); await s.sleep(500);
  for (let i = 0; i < 10; i++) { await s.ev(() => { G.sim.tickT = 99; }); await s.sleep(900); }
  await s.sleep(1200);
  await s.snap('19d_zone_grown');
  await s.log('in-zone buildings', (z) => G.state.village.buildings.filter(b => b.x >= z.x0 - 1 && b.x < z.x0 + 6 && b.z >= z.z0 - 1 && b.z < z.z0 + 5).map(b => b.type + ' L' + b.level + ' r' + b.residents), zspot);
}
// bad placement feedback
await s.ev(() => G.build.enter()); await s.sleep(800);
await s.ev(() => G.build.setTool({ kind: 'building', type: 'park' }));
await s.page.mouse.move(800, 330, { steps: 4 }); await s.sleep(800);
await s.snap('19e_bad_placement');
await s.log('hint', () => document.querySelector('.hud-interact, .interact, [class*=interact]')?.innerText);
await s.close();
