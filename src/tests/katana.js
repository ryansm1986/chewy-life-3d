// The Bone Katana in a studio (ROADMAP R-15: the bone-shaped looks, charKit.js katanaVariant):
//   /?test=katana&v=a            one look turned round: its flat, three-quarter, edge-on, back three-quarter and other flat
//   /?test=katana&v=,a,b,c&tip=1  the looks side by side (none = today's), close on the tips (flat and edge-on)
//   &colors=e6f0ff,2c3a6a,8fd0ff an item's tint (items.js [blade, wrap, accent]); &bg=7d8794 the backdrop; &pitch, &dist, &fy (the focus height);
//   &off=tilt drops the tilt-shift blur (gfx/post.js)
//   &tints=e6f0ff,2c3a6a,8fd0ff|c98f5e,8a5a3a,7cc45a  one look (v) in several item tints, side by side
import * as THREE from 'three';
import { makeStage } from './_stage.js';
import { katanaGeo, katanaMaterial } from '../actors/charKit.js';

export default function () {
  const P = new URLSearchParams(location.search);
  const looks = (P.get('v') ?? '').split(','), tip = P.has('tip'), tints = P.get('tints') ? P.get('tints').split('|').map(t => t.split(',').map(h => '#' + h)) : null;
  const colors = P.get('colors') ? P.get('colors').split(',').map(h => '#' + h) : null;
  const S = makeStage({ ground: 0, hour: +(P.get('hour') ?? 10), dist: 3, fog: false });
  S.scene.background = new THREE.Color('#' + (P.get('bg') || '7d8794'));
  S.freeCam = false;
  const mat = katanaMaterial(), rig = S.engine.rig;
  const add = (look, x, y, ry, rz = 0, cols = colors) => {
    const m = new THREE.Mesh(katanaGeo({ colors: cols, variant: look }), mat);
    m.position.set(x, y, 0); m.rotation.set(0, ry, rz, 'ZYX'); S.scene.add(m);
    return m;
  };
  // (rotation.y: 0 the +Z flat face toward the camera, the edge on the left; π/2 the edge toward the camera)
  const VIEWS = [0, Math.PI / 4, Math.PI / 2, Math.PI * 0.75, Math.PI];
  const info = { looks, tris: {} };
  for (const look of looks) { const g = katanaGeo({ colors, variant: look }); info.tris[look || 'today'] = (g.index ? g.index.count : g.attributes.position.count) / 3; }
  if (tints) {
    tints.forEach((c, i) => add(looks[0], (i - (tints.length - 1) / 2) * 0.3, 0, 0.35, 0, c));
    rig.focus.set(0, 0.25, 0); rig.distTarget = +(P.get('dist') ?? 2.9);
  } else if (tip) {
    looks.forEach((look, i) => { const x = (i - (looks.length - 1) / 2) * 0.5; add(look, x - 0.11, 0, 0); add(look, x + 0.11, 0, Math.PI / 2); });
    rig.focus.set(0, 0.56, 0); rig.distTarget = +(P.get('dist') ?? Math.max(1.6, looks.length * 0.75));
  } else {
    VIEWS.forEach((ry, i) => add(looks[0], (i - 2) * 0.3, 0, ry));
    rig.focus.set(0, 0.25, 0); rig.distTarget = +(P.get('dist') ?? 3.2);
  }
  if (P.has('fy')) rig.focus.y = +P.get('fy');
  rig.yawTarget = 0; rig.pitch = +(P.get('pitch') ?? 0.18); rig.minDist = 0.5; rig.snap();
  window.__info = info;
  S.ready();
}
