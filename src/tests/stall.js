// Tanu's Trinkets (/?test=stall): the market stall (home/stallModel.js trinketStallTemplate) on a patch of Market
// Street, lit like the village, for screenshots.
//   &hour=21            the evening (the lanterns and paper glow, their light pools on)
//   &yaw= &pitch= &dist= &cx= &cy= &cz=   the camera (defaults: a front three-quarter view)
//   &furn=<id>          one furniture item on the same stage instead (close-ups of a model from any side)
import * as THREE from 'three';
import { makeStage } from './_stage.js';
import { instantiate, MATS } from '../world/buildings/kit.js';
import { setNightAll } from '../world/buildings/index.js';
import { makeToon } from '../gfx/materials.js';
import { trinketStallTemplate } from '../home/stallModel.js';
import { furnitureGroup } from '../home/furnitureMesh.js';
import { FURNITURE } from '../home/furniture.js';

export default function () {
  const P = new URLSearchParams(location.search), furn = P.get('furn');
  const S = makeStage({ ground: 60, hour: 10, center: [0, 0], dist: furn ? 2.4 : 8, groundColor: '#e2d2b6' });
  const rig = S.engine.rig;
  // a strip of paving under the stall: big soft cobbles in two tones
  if (!furn) {
    const cob = new THREE.Group(), mats = ['#cfc2ae', '#d9ccb8', '#c4b6a2'].map(c => makeToon({ color: c, brush: 0.12, rim: 0.05 }));
    for (let i = -6; i <= 6; i++) for (let j = -4; j <= 5; j++) {
      const w = 0.42 + 0.06 * Math.sin(i * 3.1 + j), g = new THREE.CylinderGeometry(w / 2, w / 2 + 0.01, 0.04, 7);
      const m = new THREE.Mesh(g, mats[(i * 7 + j * 3 + 99) % 3]); m.position.set(i * 0.46 + (j % 2) * 0.23, 0.0, j * 0.42); m.rotation.y = i + j; m.receiveShadow = true; cob.add(m);
    }
    S.scene.add(cob);
  }
  let focus = new THREE.Vector3(0, 1.05, 0.1), lightSrc = [];
  if (furn && FURNITURE[furn]) {
    const d = FURNITURE[furn], g = furnitureGroup(furn), y0 = d.mount === 'ceiling' ? 1.4 : d.mount === 'table' ? 0.55 : 0;
    g.position.set(0, y0, 0); S.scene.add(g);
    if (d.mount === 'table') { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.36, 0.55, 32), makeToon({ color: '#c98f5e', brush: 0.12 })); t.position.y = 0.275; t.receiveShadow = t.castShadow = true; S.scene.add(t); }
    if (d.mount === 'wall') { const w = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.2, 0.1), makeToon({ color: '#fff3e0', brush: 0.1 })); w.position.set(0, 1.1, -0.05); w.receiveShadow = true; w.userData.noCast = true; S.scene.add(w); g.position.y = 0.9; }
    const box = new THREE.Box3().setFromObject(g); focus = box.getCenter(new THREE.Vector3());
    if (d.light) lightSrc.push({ pos: new THREE.Vector3(0, y0 + d.light.y, 0), color: new THREE.Color(d.light.color), intensity: d.light.intensity, radius: d.light.radius, flicker: 0.4, nightOnly: true });
  } else {
    const tpl = trinketStallTemplate(), inst = instantiate(tpl);
    S.scene.add(inst.group);
    for (const l of tpl.lights) lightSrc.push({ pos: l.pos.clone(), color: l.color, intensity: l.intensity, radius: l.radius, flicker: l.flicker, nightOnly: l.nightOnly });
    let tris = 0; for (const geo of Object.values(tpl.geos)) tris += geo.attributes.position.count / 3;
    window.__info = { tris: Math.round(tris), buckets: Object.keys(tpl.geos), lights: tpl.lights.length };
  }
  for (const s of lightSrc) S.lightPool.addSource(s);
  S.scene.traverse(o => { if (o.isMesh) { o.castShadow = !o.userData.noCast; o.receiveShadow = true; } });
  if (furn) { S.engine.camera.near = 0.05; S.engine.camera.updateProjectionMatrix(); } // (close-ups come nearer than the game's 1 m near plane)
  rig.focus.set(+(P.get('cx') ?? focus.x), +(P.get('cy') ?? focus.y), +(P.get('cz') ?? focus.z));
  rig.yawTarget = +(P.get('yaw') ?? 0.55); rig.pitch = +(P.get('pitch') ?? (furn ? 0.36 : 0.3)); rig.snap();
  const post = S.engine.post;
  if (furn) post.tiltPass.enabled = false; else { post.tilt.focusArea = 0.95; post.tilt.feather = 0.3; }
  // a tight sun shadow round the subject (the stage's default spans 80 m: too coarse for close-ups)
  const sc = S.sun.shadow.camera, e = furn ? 1.6 : 4.5; sc.left = -e; sc.right = e; sc.top = e; sc.bottom = -e; sc.updateProjectionMatrix(); S.sun.shadow.normalBias = 0.01;
  S.onUpdate(() => { setNightAll(S.day.night); MATS(); });
  S.ready();
}
