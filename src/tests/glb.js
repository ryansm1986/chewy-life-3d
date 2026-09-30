// Blender asset check (/?test=glb&url=/models/NAME.glb): a .glb from the codex-blender skill, drawn through
// gfx/glbAssets.js in the game's lighting and camera, with Chewy beside it for scale.
// Params: &url= (repeatable: several assets in a row)  &outline=1  &hour=19 (dusk: lights / glows)  &dist= &yaw= &pitch=
//         &chewy=0 (no scale reference)  &gap=m (spacing between assets, default 2.5)  &spin=rad/s
// window.__info = { assets: [{ url, tris, meshes, materials, size: [x, y, z] }] } (after __ready).
import * as THREE from 'three';
import { makeStage } from './_stage.js';
import { buildHumanoid, CAST, contactShadow } from '../actors/charKit.js';
import { Animator } from '../actors/animator.js';
import { loadGlb, glbInstance } from '../gfx/glbAssets.js';

export default async function () {
  const params = new URLSearchParams(location.search);
  const urls = params.getAll('url');
  const S = makeStage({ ground: 40, hour: +(params.get('hour') ?? 11), dist: +(params.get('dist') ?? 9) });
  const outline = params.get('outline') === '1', gap = +(params.get('gap') ?? 2.5), spin = +(params.get('spin') ?? 0);
  const info = { assets: [] }, objs = [];
  const x0 = -(urls.length - 1) * gap / 2;
  for (const [i, url] of urls.entries()) {
    try {
      const tpl = await loadGlb(url), obj = glbInstance(tpl, { outline });
      obj.position.set(x0 + i * gap, 0, 0); S.scene.add(obj); objs.push(obj);
      let tris = 0, meshes = 0; obj.traverse(o => { if (o.isMesh && !o.userData.isInk) { meshes++; tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; } });
      const box = new THREE.Box3().setFromObject(obj), size = box.getSize(new THREE.Vector3());
      info.assets.push({ url, tris, meshes, materials: tpl.userData.glb.materials.map(m => m.name || m.type), size: size.toArray().map(v => +v.toFixed(3)) });
    } catch (e) { console.error('[glb] failed to load', url, e); info.assets.push({ url, error: String(e) }); }
  }
  if (params.get('chewy') !== '0') { // Chewy for scale, a step in front of the first asset
    const rig = buildHumanoid(CAST.chewy);
    rig.root.position.set(x0 - gap * 0.6, 0, 0.9); rig.root.rotation.y = 0.5; S.scene.add(rig.root);
    const sh = contactShadow(0.32); sh.position.set(x0 - gap * 0.6, 0.02, 0.9); S.scene.add(sh);
    const anim = new Animator(rig); S.onUpdate(dt => anim.update(dt, rig.root.position));
  }
  if (spin) S.onUpdate(dt => { for (const o of objs) o.rotation.y += spin * dt; });
  window.__info = info;
  S.ready();
}
