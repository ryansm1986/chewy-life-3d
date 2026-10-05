// House upgrades (/?test=upgrade): Chewy's cottage at levels 1-3 side by side (world/buildings/special.js chewyHouse),
// the house mailbox and the construction scaffold round a 2x2 and a 3x3 footprint (home/exteriorModels.js).
// Params: &style=machiya|cottage|teaHouse|seaside|all (all = the unstyled cottage + each set, one row each),
//         &style=roof:plum,door:round (single fields), &bunting=1 (festival bunting on every cottage),
//         &level=N (only that level), &only=cottage|mailbox|scaffold, &inside=1 (a house inside each scaffold),
//         &focus=L1|L2|L3|mailbox|scaffold2|scaffold3|<index> (centre + zoom on one item), &hour=21 (night),
//         &frames=1 (the upgrade animation as a storyboard: before, the scaffold pops up, dust, the new house rises
//         inside, the scaffold drops away, after; one row L1 -> L2 and one row L2 -> L3, built from the real templates),
//         &labels=0, &pads=0, &dist= &yaw= &pitch=
// window.__info = { count, totalTris, per: { label: tris } }.
import * as THREE from 'three';
import { makeStage } from './_stage.js';
import { buildModel, setNight } from '../world/buildings/index.js';
import { instantiate } from '../world/buildings/kit.js';
import { STYLE_SETS, setStyle, cleanStyle } from '../world/buildings/styles.js';
import { mailboxTemplate, scaffoldTemplate } from '../home/exteriorModels.js';
import { makeToon } from '../gfx/materials.js';
import { smokeTexture } from '../gfx/textures.js';

const _q = new THREE.Quaternion();
function animateParts(parts, t) {
  for (const { node, a } of parts) {
    const ph = t * a.speed + a.phase;
    if (a.kind === 'swing') node.quaternion.setFromAxisAngle(a.axis, Math.sin(ph) * a.amp + Math.sin(ph * 2.3) * a.amp * 0.15);
    else if (a.kind === 'spin') node.quaternion.setFromAxisAngle(a.axis, ph);
    else if (a.kind === 'bob') node.position.set(a.pivot.x, a.pivot.y + Math.sin(ph) * a.amp, a.pivot.z);
  }
  void _q;
}

export default function () {
  const P = new URLSearchParams(location.search);
  const only = P.get('only'), lvl = P.has('level') ? +P.get('level') : null, inside = P.get('inside') === '1';
  const sp = P.get('style');
  const styles = !sp ? [null] : sp === 'all' ? [null, ...Object.keys(STYLE_SETS)] : STYLE_SETS[sp] ? [sp] : [Object.fromEntries(sp.split(',').map(kv => kv.split(':')))];
  const SQ = Math.SQRT1_2, U = [SQ, -SQ], Vv = [SQ, SQ];
  const items = [];
  // rows run along the screen-horizontal diagonal of the iso camera (yaw 45°)
  let vRow = 0;
  const row = (list, gap = 1.4, vGap = 2.2) => {
    let u = 0, depth = 0;
    for (const it of list) { const ext = (it.w + it.d) * SQ; it.cu = u + ext / 2; it.cv = vRow + ext / 2; u += ext + gap; depth = Math.max(depth, ext); }
    const span = u - gap; for (const it of list) it.cu -= span / 2;
    vRow += depth + vGap; items.push(...list);
  };
  const frames = P.get('frames') === '1';
  // storyboard phases: scaffold height scale, old house shown, new house rise (0 = sunk a full height, 1 = up), dust
  const PHASES = [
    { name: 'before', sy: 0, old: 1, rise: null, dust: 0 }, { name: 'scaffold pops up', sy: 0.55, old: 1, rise: null, dust: 0.5 },
    { name: 'dust ring', sy: 1, old: 1, rise: null, dust: 1 }, { name: 'new house rises', sy: 1, old: 0, rise: 0.55, dust: 0.8 },
    { name: 'scaffold drops', sy: 0.4, old: 0, rise: 1, dust: 0.5 }, { name: 'after', sy: 0, old: 0, rise: 1, dust: 0.15 },
  ];
  const pairs = P.get('pair') === '12' ? [[1, 2]] : P.get('pair') === '23' ? [[2, 3]] : [[1, 2], [2, 3]];
  if (frames) for (const [a, b] of pairs) row(PHASES.map((ph, i) => ({ kind: 'frame', key: `F${a}${b}-${i + 1}`, label: `L${a}→L${b} · ${i + 1} ${ph.name}`, w: 3, d: 3, a, b, ph })), 1.7, 4.2);
  if (!frames && (!only || only === 'cottage')) for (const st of styles) {
    let style = typeof st === 'string' ? setStyle(st) : cleanStyle(st);
    if (P.get('bunting') === '1') style = cleanStyle({ ...(style || {}), bunting: 'on' });
    const name = typeof st === 'string' ? STYLE_SETS[st].name : st ? 'custom' : 'unstyled';
    row((lvl ? [lvl] : [1, 2, 3]).map(L => ({ kind: 'cottage', key: `L${L}${st ? ':' + (typeof st === 'string' ? st : 'custom') : ''}`, label: `Chewy L${L} · ${name}`, w: 3, d: 3, L, style })));
  }
  if (!frames && (!only || only === 'mailbox' || only === 'scaffold')) {
    const list = [];
    if (!only || only === 'mailbox') list.push({ kind: 'mailbox', key: 'mailbox', label: 'mailbox', w: 1, d: 1 });
    if (!only || only === 'scaffold') list.push({ kind: 'scaffold', key: 'scaffold2', label: 'scaffold 2x2', w: 2, d: 2, h: 2.7 }, { kind: 'scaffold', key: 'scaffold3', label: 'scaffold 3x3', w: 3, d: 3, h: 3.9 });
    row(list, 2.2);
  }
  for (const it of items) { it.cx = it.cu * U[0] + it.cv * Vv[0]; it.cz = it.cu * U[1] + it.cv * Vv[1]; }
  // build
  const S0 = { lights: [] };
  const dustTex = smokeTexture(), dustMat = new THREE.SpriteMaterial({ map: dustTex, color: '#efe4cf', transparent: true, depthWrite: false, opacity: 0.9 }), dustMat2 = new THREE.SpriteMaterial({ map: dustTex, color: '#f8f2e6', transparent: true, depthWrite: false, opacity: 0.75 });
  for (const it of items) {
    if (it.kind === 'cottage') { it.m = buildModel('chewyHouse', { level: it.L, seed: 0, style: it.style }); it.group = it.m.group; it.tris = it.m.tris; it.height = it.m.height; }
    else if (it.kind === 'frame') {
      const { ph } = it, g = new THREE.Group(), oldM = buildModel('chewyHouse', { level: it.a }), newM = buildModel('chewyHouse', { level: it.b });
      const tpl = scaffoldTemplate(3, 3, Math.max(oldM.height, newM.height) - 0.3);
      if (ph.old) g.add(oldM.group);
      if (ph.rise != null) { newM.group.position.y = -(1 - ph.rise) * newM.height; g.add(newM.group); }
      if (ph.sy > 0) { const sc = instantiate(tpl); sc.group.scale.set(1, ph.sy, 1); g.add(sc.group); it.parts = sc.parts; }
      if (ph.dust > 0) for (let k = 0; k < 14; k++) for (let j = 0; j < 2; j++) { // a soft dust ring round the footprint (smoke sprites)
        const an = k / 14 * Math.PI * 2 + j * 0.2, r = 1.75 + (k % 2) * 0.25 + j * 0.2, s0 = (0.7 + ((k + j) % 3) * 0.25) * (0.4 + ph.dust * 0.6);
        const d = new THREE.Sprite(j ? dustMat2 : dustMat); d.scale.setScalar(s0);
        d.position.set(Math.cos(an) * r, s0 * 0.32 + j * 0.15 * ph.dust, Math.sin(an) * r); g.add(d);
      }
      it.group = g; it.height = tpl.height; it.tris = (ph.old ? oldM.tris : 0) + (ph.rise != null ? newM.tris : 0) + (ph.sy ? tpl.tris : 0);
    }
    else {
      const tpl = it.kind === 'mailbox' ? mailboxTemplate() : scaffoldTemplate(it.w, it.d, it.h), inst = instantiate(tpl);
      it.group = inst.group; it.parts = inst.parts; it.tris = tpl.tris; it.height = tpl.height; it.tpl = tpl;
      if (it.kind === 'mailbox') { // a few of them in a row, the way a street of homes shows them
        for (const dx of [-0.7, 0.7]) { const extra = instantiate(tpl); extra.group.position.set(dx, 0, dx * 0.4); extra.group.rotation.y = dx * 0.3; it.group.add(extra.group); }
      }
      if (it.kind === 'scaffold' && inside) {
        it.inner = it.w >= 3 ? buildModel('chewyHouse', { level: 2, seed: 0 }) : buildModel('home', { level: 1, seed: 3 });
      }
    }
    it.group.position.set(it.cx, 0, it.cz);
    if (it.inner) it.inner.group.position.set(it.cx, 0, it.cz);
  }
  // camera framing
  let center, dist0;
  const fk = P.get('focus');
  const f = fk == null ? null : items.find(i => i.key === fk) || items[Math.min(items.length - 1, +fk || 0)];
  if (f) { center = [f.cx, f.cz]; dist0 = f.kind === 'mailbox' ? 4.2 : Math.max(9, Math.max(f.w, f.d) * 2.6 + f.height * 1.25 + 3); }
  else {
    const us = items.map(i => i.cu), vs = items.map(i => i.cv);
    const cu = (Math.min(...us) + Math.max(...us)) / 2, cv = (Math.min(...vs) + Math.max(...vs)) / 2;
    center = [cu * U[0] + cv * Vv[0], cu * U[1] + cv * Vv[1]];
    const WU = Math.max(...us) - Math.min(...us) + 5, HV = Math.max(...vs) - Math.min(...vs) + 5;
    dist0 = Math.max(12, Math.max(WU / 0.62, (HV * 0.75 + 4.5 * 0.66) / 0.35) * 1.0);
  }
  const S = makeStage({ ground: 120, center, dist: dist0, hour: 10, groundColor: P.get('ground') || '#8ec46e' });
  S.engine.rig.focus.y = f ? f.height * (f.kind === 'mailbox' ? 0.45 : 0.42) : 1.2; S.engine.rig.snap();
  const padMat = makeToon({ color: '#93c864', brush: 0.25, rim: 0 });
  const lineMat = new THREE.LineBasicMaterial({ color: '#5a8a40', transparent: true, opacity: 0.35 });
  for (const it of items) {
    S.scene.add(it.group); it.group.updateMatrixWorld(true);
    if (it.inner) { S.scene.add(it.inner.group); it.inner.group.updateMatrixWorld(true); }
    if (P.get('pads') !== '0' && it.kind !== 'mailbox' && it.kind !== 'frame') {
      const pad = new THREE.Mesh(new THREE.PlaneGeometry(it.w, it.d).rotateX(-Math.PI / 2), padMat); pad.position.set(it.cx, 0.004, it.cz); pad.receiveShadow = true; S.scene.add(pad);
      const pts = [];
      for (let i = 0; i <= it.w; i++) pts.push(new THREE.Vector3(it.cx - it.w / 2 + i, 0.01, it.cz - it.d / 2), new THREE.Vector3(it.cx - it.w / 2 + i, 0.01, it.cz + it.d / 2));
      for (let j = 0; j <= it.d; j++) pts.push(new THREE.Vector3(it.cx - it.w / 2, 0.01, it.cz - it.d / 2 + j), new THREE.Vector3(it.cx + it.w / 2, 0.01, it.cz - it.d / 2 + j));
      S.scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), lineMat));
    }
    const lights = it.m ? it.m.lights : (it.tpl?.lights || []);
    for (const m of [it.m, it.inner].filter(Boolean)) for (const l of m.lights) S.lightPool.addSource({ ...l, pos: l.pos.clone().applyMatrix4(m.group.matrixWorld) });
    if (!it.m) for (const l of lights) S.lightPool.addSource({ ...l, pos: l.pos.clone().applyMatrix4(it.group.matrixWorld) });
  }
  void S0;
  // labels
  const labels = [], v = new THREE.Vector3();
  if (P.get('labels') !== '0') {
    const root = document.createElement('div');
    root.style.cssText = 'position:fixed;inset:0;pointer-events:none;font:600 12px system-ui,sans-serif;z-index:5';
    document.body.appendChild(root);
    for (const it of items) {
      const el = document.createElement('div');
      el.style.cssText = 'position:absolute;transform:translate(-50%,-100%);background:rgba(255,246,232,.88);color:#4a2c2a;padding:2px 7px;border-radius:9px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,.15)';
      el.textContent = `${it.label} · ${Math.round(it.tris / 100) / 10}k`;
      root.appendChild(el); labels.push({ el, pos: new THREE.Vector3(it.cx, it.height + 0.3, it.cz) });
    }
  }
  S.onUpdate((dt, t) => {
    setNight(null, S.day.night);
    for (const it of items) { it.m?.update?.(dt, t); it.inner?.update?.(dt, t); if (it.parts?.length) animateParts(it.parts, t); }
    const cam = S.engine.camera;
    for (const L of labels) {
      v.copy(L.pos).project(cam);
      L.el.style.display = v.z < 1 ? 'block' : 'none';
      L.el.style.left = ((v.x * 0.5 + 0.5) * innerWidth) + 'px'; L.el.style.top = ((-v.y * 0.5 + 0.5) * innerHeight) + 'px';
    }
  });
  const per = {}; for (const it of items) per[it.key] = Math.round(it.tris);
  setTimeout(() => { window.__info = { count: items.length, totalTris: items.reduce((a, i) => a + i.tris, 0), per }; }, 600);
  S.ready();
}
