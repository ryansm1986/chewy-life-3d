import { open } from './lib.mjs';
import path from 'node:path';
const OUT = 'C:/Users/there/AppData/Local/Temp/claude/D--projects-chewy-life-3d/8589dfce-d448-4273-9d64-a50029bd572d/scratchpad/review3';
const s = await open('/?fresh&nointro&hour=11', { wait: 3000 });
// put Shadow on open plaza stone, Chewy idle next to him; wait until he sits
await s.ev(() => { const L = G.world.landmarks.plaza; G.player.setPos(L.x + 3, L.z + 5); G.companion.setPos(L.x + 4.2, L.z + 5.4); G.engine.rig.focus.copy(G.player.pos); G.engine.rig.snap(); G.engine.rig.distTarget = 14; });
await s.sleep(9000);
const r = await s.ev(() => { const a = G.companion; let m = null; a.rig.root.traverse(o => { if (o.isSkinnedMesh && o.name === 'body_skin') m = o; }); const v = new G.THREE.Vector3(); let below = 0, minY = 1e9; const g = G.world.heightAt(a.pos.x, a.pos.z); for (let i = 0; i < m.geometry.attributes.position.count; i += 3) { m.getVertexPosition(i, v); v.applyMatrix4(m.matrixWorld); if (v.y < g - 0.03) below++; minY = Math.min(minY, v.y); } const p = a.pos.clone().setY(a.pos.y + 0.25).project(G.engine.camera); return { action: a.anim.action?.name, below, minY: +(minY - g).toFixed(3), clip: { x: Math.round((p.x * .5 + .5) * innerWidth) - 110, y: Math.round((-p.y * .5 + .5) * innerHeight) - 110, width: 220, height: 220 } }; });
console.log(JSON.stringify(r));
await s.page.screenshot({ path: path.join(OUT, 'p_sit_xray_on.png'), clip: r.clip });
await s.ev(() => { G.companion.rig.xrayMat.visible = false; });
await s.sleep(200);
await s.page.screenshot({ path: path.join(OUT, 'p_sit_xray_off.png'), clip: r.clip });
await s.close();
