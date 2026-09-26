import { open } from './lib.mjs';
const s = await open('/?fresh&nointro&hour=12', { wait: 3000 });
for (let k = 0; k < 3; k++) {
  const r = await s.ev(() => {
    const out = {};
    for (const [k, a] of [['player', G.player], ['companion', G.companion]]) {
      let m = null; a.rig.root.traverse(o => { if (o.isSkinnedMesh && o.name === 'body_skin') m = o; });
      const v = new G.THREE.Vector3(); const pos = m.geometry.attributes.position; const n = pos.count;
      let below = 0, minY = 1e9, maxY = -1e9; const rootY = a.rig.root.getWorldPosition(new G.THREE.Vector3()).y;
      const ground = G.world.heightAt(a.pos.x, a.pos.z);
      for (let i = 0; i < n; i++) { m.getVertexPosition(i, v); v.applyMatrix4(m.matrixWorld); if (v.y < ground - 0.03) below++; minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y); }
      out[k] = { verts: n, below, minY: +(minY - ground).toFixed(3), maxY: +(maxY - ground).toFixed(3), rootY: +(rootY - ground).toFixed(3), anim: a.anim?.current?.name || a.anim?.cur || null, state: a.state };
    }
    return out;
  });
  console.log(JSON.stringify(r));
  await s.sleep(700);
}
await s.close();
