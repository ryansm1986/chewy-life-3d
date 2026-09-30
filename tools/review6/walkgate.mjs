import { open } from './lib.mjs';
// Follow the quest arrow to the Burrow with real ground clicks (7 m ahead along the straight line, like a player
// clicking toward the arrow). Logs distance each click; if stuck, also try one long click on the arrow direction.
const s = await open('/?fresh&nointro&hour=9', { wait: 3500 });
await s.ev(() => { window.__scr = (p, y = 0) => { const v = p.clone().setY((p.y || 0) + y).project(G.engine.camera); return [Math.round((v.x * .5 + .5) * innerWidth), Math.round((-v.y * .5 + .5) * innerHeight)]; }; window.__gate = G.world.interactables.find(i => /Burrow/.test(i.label)); });
const L = [];
for (let i = 0; i < 45; i++) {
  const st = await s.ev(() => { const g = __gate.pos, p = G.player.pos; const d = Math.hypot(g.x - p.x, g.z - p.z); const k = Math.min(1, 7 / Math.max(d, 0.01)); const w = new G.THREE.Vector3(p.x + (g.x - p.x) * k, G.world.heightAt(p.x + (g.x - p.x) * k, p.z + (g.z - p.z) * k), p.z + (g.z - p.z) * k); return { d: +d.toFixed(1), p: [+p.x.toFixed(1), +p.z.toFixed(1)], sc: __scr(w), walk: G.world.walkable ? G.world.walkable(w.x, w.z) : null, mt: G.player.moveTarget ? [+G.player.moveTarget.x.toFixed(1), +G.player.moveTarget.z.toFixed(1)] : null }; });
  L.push(`${i} d=${st.d} p=${st.p} clickWalkable=${st.walk} sc=${st.sc} mt=${st.mt}`);
  if (st.d < 1.6) break;
  const x = Math.min(1300, Math.max(360, st.sc[0])), y = Math.min(660, Math.max(160, st.sc[1]));
  await s.click(x, y); await s.sleep(800);
  if (i === 10 || i === 20) await s.snap('94_walkgate_' + i);
}
console.log(L.join('\n'));
await s.snap('94_walkgate_end');
await s.close();
