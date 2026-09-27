import { open } from './lib.mjs';
const s = await open('/?fresh&nointro&hour=21.5', { wait: 3500 });
await s.snap('p_night_probe');
const r = await s.ev(() => {
  const THREE = G.THREE; const cam = G.engine.camera; const rc = new THREE.Raycaster();
  const out = [];
  for (const [x, y] of [[563, 300], [563, 320], [740, 640], [1140, 410]]) {
    rc.setFromCamera(new THREE.Vector2(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1), cam);
    const hits = rc.intersectObjects(G.world.scene.children, true).slice(0, 6);
    out.push({ at: [x, y], hits: hits.map(h => ({ name: h.object.name, type: h.object.type, mat: h.object.material?.type + '/' + (h.object.material?.name || ''), blend: h.object.material?.blending, transp: h.object.material?.transparent, geo: h.object.geometry?.type, parent: h.object.parent?.name, d: +h.distance.toFixed(1), p: [+h.point.x.toFixed(1), +h.point.y.toFixed(1), +h.point.z.toFixed(1)] })) });
  }
  return out;
});
console.log(JSON.stringify(r, null, 1));
await s.close();
