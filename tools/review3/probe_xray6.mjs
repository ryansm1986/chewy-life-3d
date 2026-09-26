import { open } from './lib.mjs';
import path from 'node:path';
const OUT = 'C:/Users/there/AppData/Local/Temp/claude/D--projects-chewy-life-3d/8589dfce-d448-4273-9d64-a50029bd572d/scratchpad/review3';
const s = await open('/?fresh&nointro&hour=17.5', { wait: 3000 });
for (let i = 0; i < 14; i++) {
  const r = await s.ev(() => {
    const a = G.companion; let m = null; a.rig.root.traverse(o => { if (o.isSkinnedMesh && o.name === 'body_skin') m = o; });
    const v = new G.THREE.Vector3(); const pos = m.geometry.attributes.position; const n = pos.count; let below = 0, minY = 1e9;
    const ground = G.world.heightAt(a.pos.x, a.pos.z);
    for (let i = 0; i < n; i += 3) { m.getVertexPosition(i, v); v.applyMatrix4(m.matrixWorld); if (v.y < ground - 0.03) below++; minY = Math.min(minY, v.y); }
    const p = a.pos.clone().setY(a.pos.y + 0.25).project(G.engine.camera);
    const bones = m.skeleton.bones.filter(b => b.scale.x < 0.99 || b.scale.y < 0.99).map(b => b.name + ':' + b.scale.x.toFixed(2));
    return { below, minY: +(minY - ground).toFixed(3), rootLocalY: +a.rig.root.position.y.toFixed(3), state: a.state, pose: a.pose || a.idleT || null, clip: { x: Math.round((p.x * .5 + .5) * innerWidth) - 90, y: Math.round((-p.y * .5 + .5) * innerHeight) - 90, width: 180, height: 180 }, bones: bones.slice(0, 6), animKeys: Object.keys(a.anim || {}).slice(0, 12) };
  });
  await s.page.screenshot({ path: path.join(OUT, 'p_x6_' + i + '.png'), clip: r.clip });
  console.log(i, JSON.stringify({ ...r, clip: undefined }));
  await s.sleep(2500);
}
await s.close();
