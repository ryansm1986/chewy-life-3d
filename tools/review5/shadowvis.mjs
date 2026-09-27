import { open } from './lib.mjs';
// How often is Shadow hidden behind props/buildings at the real camera? Chewy hops between village spots and idles;
// every 0.4 s a ray from the camera to Shadow's chest (and head) is tested against non-instanced scene meshes.
const s = await open('/?fresh&nointro&hour=10', { wait: 3000 });
await s.ev(() => {
  const T = G.THREE; const rc = new T.Raycaster();
  const shadowRoot = G.companion.rig.root, playerRoot = G.player.rig.root;
  const isOf = (o, root) => { for (let p = o; p; p = p.parent) if (p === root) return true; return false; };
  const cands = () => { const out = []; G.engine.scene.traverse(o => { if (!o.isMesh || o.isInstancedMesh || !o.visible || o.isSkinnedMesh) return; if (isOf(o, shadowRoot) || isOf(o, playerRoot)) return; let vis = true; for (let p = o; p; p = p.parent) if (!p.visible) { vis = false; break; } if (!vis) return; const m = o.material; if (m && (m.transparent && m.opacity < 0.5)) return; if (o.geometry?.boundingSphere == null) o.geometry?.computeBoundingSphere?.(); out.push(o); }); return out; };
  window.__occ = { n: 0, hid: 0, hidBy: {}, spots: [] };
  window.__probe = () => {
    const cam = G.engine.camera.position; const c = G.companion.pos; const list = cands();
    let hidden = 0, by = null;
    for (const h of [0.35, 0.6]) {
      const tgt = new T.Vector3(c.x, c.y + h, c.z); const dir = tgt.clone().sub(cam); const L = dir.length(); dir.normalize();
      rc.set(cam, dir); rc.far = L - 0.25; const hits = rc.intersectObjects(list, false);
      if (hits.length) { hidden++; by = hits[0].object; }
    }
    const o = window.__occ; o.n++;
    if (hidden === 2) { o.hid++; let nm = by.name || by.parent?.name || by.geometry?.type || '?'; for (let p = by; p; p = p.parent) if (p.userData?.type || p.userData?.kind) { nm = p.userData.type || p.userData.kind; break; } o.hidBy[nm] = (o.hidBy[nm] || 0) + 1; o.spots.push([+c.x.toFixed(1), +c.z.toFixed(1)]); }
    return hidden;
  };
});
const L = await s.ev(() => ({ plaza: [G.world.landmarks.plaza.x, G.world.landmarks.plaza.z] }));
const spots = [[1, 2], [-4, 3], [5, -3], [-6, -5], [8, 6], [0, -8], [-9, 1], [3, 9]];
let k = 0;
for (const [dx, dz] of spots) {
  // walk there with a real click-to-move order (moveTarget), then idle 7 s
  await s.ev(([x, z]) => { G.player.moveTarget = new G.THREE.Vector3(x, 0, z); }, [L.plaza[0] + dx, L.plaza[1] + dz]);
  for (let i = 0; i < 25; i++) { await s.sleep(400); await s.ev(() => __probe()); }
  const hidNow = await s.ev(() => __probe());
  if (hidNow === 2) await s.snap(`77_shadow_hidden_${k++}`);
}
await s.log('occlusion', () => ({ samples: __occ.n, hiddenBoth: __occ.hid, pct: +(100 * __occ.hid / __occ.n).toFixed(1), by: __occ.hidBy, spots: __occ.spots.slice(0, 12) }));
await s.close();
