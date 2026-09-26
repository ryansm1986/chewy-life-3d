// Building catalog showcase: every building / level laid out on grass with labels.
// Params: &only=id[,id2] &level=N &seed=N &variants=N (seeds per level) &cat=home|shop|craft|service|decor|special
//         &hour=21 (night) &dist= &yaw= &pitch= &labels=0 &smoke=0 &rot=radians &pads=0
import * as THREE from 'three';
import { makeStage } from './_stage.js';
import { BUILDINGS, buildModel, setNight, CATEGORIES } from '../world/buildings/index.js';
import { makeToon } from '../gfx/materials.js';
import { smokeTexture } from '../gfx/textures.js';

export default function () {
  const P = new URLSearchParams(location.search);
  const only = P.get('only')?.split(',');
  const lvl = P.has('level') ? +P.get('level') : null;
  const seed0 = +(P.get('seed') ?? 0);
  const variants = +(P.get('variants') ?? 1);
  const catF = P.get('cat');
  const rot = +(P.get('rot') ?? 0);
  const items = [];
  const order = Object.keys(CATEGORIES);
  const ids = Object.keys(BUILDINGS).sort((a, b) => order.indexOf(BUILDINGS[a].cat) - order.indexOf(BUILDINGS[b].cat));
  for (const id of ids) {
    const def = BUILDINGS[id];
    if (only && !only.includes(id)) continue;
    if (catF && def.cat !== catF) continue;
    const levels = lvl ? [Math.min(lvl, def.levels)] : Array.from({ length: def.levels }, (_, i) => i + 1);
    for (const L of levels) for (let k = 0; k < variants; k++) items.push({ id, level: L, seed: seed0 + k, cat: def.cat });
  }
  // build + layout (rows per category, wrapped)
  const maxRow = +(P.get('row') ?? (items.length > 6 ? 30 : 60));
  const gapX = 1.6, gapZ = 2.6;
  let x = 0, z = 0, rowD = 0, lastCat = null;
  const placed = [];
  for (const it of items) {
    const m = buildModel(it.id, { level: it.level, seed: it.seed });
    const [w, d] = m.footprint;
    if ((x > 0 && x + w > maxRow) || (lastCat && it.cat !== lastCat && !only)) { x = 0; z += rowD + gapZ; rowD = 0; }
    lastCat = it.cat;
    const cx = x + w / 2, cz = z + d / 2;
    m.group.position.set(cx, 0, cz);
    m.group.rotation.y = rot;
    placed.push({ ...it, m, cx, cz, w, d });
    x += w + gapX; rowD = Math.max(rowD, d);
  }
  const W = Math.max(...placed.map(p => p.cx + p.w / 2)), D = z + rowD;
  let center = [W / 2, D / 2];
  const span = Math.max(W, D);
  let dist0 = only ? Math.max(12, span * 1.6 + 6) : span * 1.25 + 10;
  if (P.has('focus')) { // centre on one placed item: &focus=index
    const f = placed[Math.min(placed.length - 1, +P.get('focus'))];
    center = [f.cx, f.cz]; dist0 = Math.max(9, Math.max(f.w, f.d) * 2.6 + 5);
  }
  const S = makeStage({ ground: Math.max(60, span + 30), center, dist: dist0, hour: 10, groundColor: P.get('ground') || '#8ec46e' });
  const scene = S.scene;
  if (only || P.has('focus')) { // lift the look-at point to a third of the tallest building
    const hMax = P.has('focus') ? placed[Math.min(placed.length - 1, +P.get('focus'))].m.height : Math.max(...placed.map(p => p.m.height));
    S.engine.rig.focus.y = hMax * 0.32; S.engine.rig.snap();
  }
  const padMat = makeToon({ color: '#93c864', brush: 0.25, rim: 0 });
  const lineMat = new THREE.LineBasicMaterial({ color: '#5a8a40', transparent: true, opacity: 0.35 });
  for (const p of placed) {
    scene.add(p.m.group);
    p.m.group.updateMatrixWorld(true);
    if (P.get('pads') !== '0') {
      const pad = new THREE.Mesh(new THREE.PlaneGeometry(p.w, p.d).rotateX(-Math.PI / 2), padMat);
      pad.position.set(p.cx, 0.004, p.cz); pad.receiveShadow = true; scene.add(pad);
      const pts = [];
      for (let i = 0; i <= p.w; i++) pts.push(new THREE.Vector3(p.cx - p.w / 2 + i, 0.01, p.cz - p.d / 2), new THREE.Vector3(p.cx - p.w / 2 + i, 0.01, p.cz + p.d / 2));
      for (let j = 0; j <= p.d; j++) pts.push(new THREE.Vector3(p.cx - p.w / 2, 0.01, p.cz - p.d / 2 + j), new THREE.Vector3(p.cx + p.w / 2, 0.01, p.cz - p.d / 2 + j));
      scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), lineMat));
    }
    for (const l of p.m.lights) S.lightPool.addSource({ ...l, pos: l.pos.clone().applyMatrix4(p.m.group.matrixWorld) });
    if (P.has('doors')) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.08), new THREE.MeshBasicMaterial({ color: '#ff00ff' })); s.position.copy(p.m.door).applyMatrix4(p.m.group.matrixWorld); scene.add(s); }
  }
  // labels
  const labels = [];
  if (P.get('labels') !== '0') {
    const root = document.createElement('div');
    root.style.cssText = 'position:fixed;inset:0;pointer-events:none;font:600 12px system-ui,sans-serif;z-index:5';
    document.body.appendChild(root);
    for (const p of placed) {
      const el = document.createElement('div');
      el.style.cssText = 'position:absolute;transform:translate(-50%,-100%);background:rgba(255,246,232,.88);color:#4a2c2a;padding:2px 7px;border-radius:9px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,.15)';
      el.textContent = `${p.id}${BUILDINGS[p.id].levels > 1 ? ' L' + p.level : ''}${variants > 1 ? ' #' + p.seed : ''} · ${Math.round(p.m.tris / 100) / 10}k`;
      root.appendChild(el);
      labels.push({ el, pos: new THREE.Vector3(p.cx, p.m.height + 0.25, p.cz) });
    }
  }
  // smoke preview for emitters
  const puffs = [];
  if (P.get('smoke') !== '0') {
    const tex = smokeTexture();
    for (const p of placed) for (const e of p.m.smoke) {
      const wp = e.clone().applyMatrix4(p.m.group.matrixWorld);
      for (let i = 0; i < 6; i++) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: '#f4f0f8', transparent: true, depthWrite: false, opacity: 0 }));
        sp.userData = { o: wp, t: i / 6 };
        scene.add(sp); puffs.push(sp);
      }
    }
  }
  const v = new THREE.Vector3();
  S.onUpdate((dt, t) => {
    const night = S.day.night;
    setNight(placed[0]?.m, night);
    for (const p of placed) p.m.update?.(dt, t);
    for (const sp of puffs) {
      const u = sp.userData; u.t = (u.t + dt * 0.25) % 1;
      sp.position.set(u.o.x + Math.sin(u.t * 5 + u.o.x) * 0.15 * u.t, u.o.y + u.t * 1.6, u.o.z + u.t * 0.3);
      sp.scale.setScalar(0.25 + u.t * 0.7);
      sp.material.opacity = Math.sin(u.t * Math.PI) * 0.55;
    }
    const cam = S.engine.camera;
    for (const L of labels) {
      v.copy(L.pos).project(cam);
      L.el.style.display = v.z < 1 ? 'block' : 'none';
      L.el.style.left = ((v.x * 0.5 + 0.5) * innerWidth) + 'px';
      L.el.style.top = ((-v.y * 0.5 + 0.5) * innerHeight) + 'px';
    }
  });
  const info = {};
  for (const p of placed) info[`${p.id}:${p.level}:${p.seed}`] = Math.round(p.m.tris);
  setTimeout(() => {
    const r = S.engine.renderer.info.render;
    window.__info = { count: placed.length, totalTris: placed.reduce((a, p) => a + p.m.tris, 0), calls: r.calls, frameTris: r.triangles, per: info };
  }, 600);
  S.ready();
}
