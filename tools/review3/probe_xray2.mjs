import { open } from './lib.mjs';
import fs from 'node:fs';
const s = await open('/?fresh&nointro&hour=8', { wait: 3500 });
await s.ev(() => { G.day.hour = 17.5; });
await s.sleep(2500);
// sample frames; record Shadow's screen pos + occluder under ray
const res = [];
for (let i = 0; i < 16; i++) {
  const r = await s.ev(() => {
    const c = G.companion; const v = c.pos.clone().setY(c.pos.y + 0.25).project(G.engine.camera);
    const sx = Math.round((v.x * .5 + .5) * innerWidth), sy = Math.round((-v.y * .5 + .5) * innerHeight);
    // raycast from camera to the companion's belly; list what is hit before it
    const rc = new G.THREE.Raycaster(); rc.setFromCamera(new G.THREE.Vector2(v.x, v.y), G.engine.camera);
    const hits = rc.intersectObjects(G.world.scene.children, true).filter(h => h.object.visible).slice(0, 4).map(h => (h.object.name || h.object.parent?.name || h.object.type) + '@' + h.distance.toFixed(1));
    return { sx, sy, hits, pos: [c.pos.x.toFixed(1), c.pos.z.toFixed(1)], anim: c.anim?.cur || c.state };
  });
  const f = await s.snap('p_x2_' + i);
  res.push({ i, ...r });
  await s.sleep(900);
}
console.log(res.map(r => JSON.stringify(r)).join('\n'));
await s.close();
