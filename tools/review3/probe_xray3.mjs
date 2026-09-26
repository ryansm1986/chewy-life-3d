import { open } from './lib.mjs';
const s = await open('/?fresh&nointro&hour=12', { wait: 3000 });
const r = await s.ev(() => {
  const out = {};
  for (const [k, a] of [['player', G.player], ['companion', G.companion]]) {
    const o = [];
    a.rig.root.traverse(m => { if (m.isSkinnedMesh) { const wp = m.getWorldPosition(new G.THREE.Vector3()); const ws = m.getWorldScale(new G.THREE.Vector3()); o.push({ n: m.name, parent: m.parent?.name || m.parent?.type, pos: m.position.toArray().map(v => +v.toFixed(3)), scale: m.scale.toArray().map(v => +v.toFixed(3)), rot: [m.rotation.x, m.rotation.y, m.rotation.z].map(v => +v.toFixed(3)), wpos: wp.toArray().map(v => +v.toFixed(2)), wscale: ws.toArray().map(v => +v.toFixed(3)), bindMode: m.bindMode }); } });
    out[k] = o;
  }
  return out;
});
console.log(JSON.stringify(r, null, 1));
await s.close();
