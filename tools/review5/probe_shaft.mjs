import { open } from './lib.mjs';
import path from 'node:path';
const OUT = 'C:/Users/there/AppData/Local/Temp/claude/D--projects-chewy-life-3d/8589dfce-d448-4273-9d64-a50029bd572d/scratchpad/review3';
const s = await open('/?fresh&nointro&hour=10', { wait: 3000 });
await s.ev(() => { G.engine.rig.distTarget = 14; });
await s.sleep(2500);
const info = await s.ev(() => {
  const amb = G.ambient || G.village?.ambient || G.world?.ambient; const out = { hasAmb: !!amb };
  const cand = []; G.world.scene.traverse(o => { if (o.isMesh && o.visible && o.material?.blending === G.THREE.AdditiveBlending && o.material.opacity > 0.01) { const p = o.getWorldPosition(new G.THREE.Vector3()); const v = p.clone().project(G.engine.camera); if (Math.abs(v.x) < 1 && Math.abs(v.y) < 1) cand.push({ geo: o.geometry.type, op: +o.material.opacity.toFixed(2), sx: Math.round((v.x * .5 + .5) * innerWidth), sy: Math.round((-v.y * .5 + .5) * innerHeight), ro: o.renderOrder, name: o.name }); } });
  out.additiveOnScreen = cand; const v = G.player.pos.clone().project(G.engine.camera); out.chewy = [Math.round((v.x * .5 + .5) * innerWidth), Math.round((-v.y * .5 + .5) * innerHeight)];
  return out;
});
console.log(JSON.stringify(info));
await s.page.screenshot({ path: path.join(OUT, 'p_shaft_on.png') });
await s.ev(() => { G.world.scene.traverse(o => { if (o.isMesh && o.geometry?.type === 'PlaneGeometry' && o.material?.blending === G.THREE.AdditiveBlending && o.renderOrder === 11) o.material.opacity = 0; }); });
await s.page.screenshot({ path: path.join(OUT, 'p_shaft_off.png') });
await s.close();
