// Furniture test page (docs/HOUSING.md §2): every catalog item on a warm plank floor, a back wall for wall items.
//   /?test=furniture                       every item (wall items in the back row), with name labels
//   &cat=seating|table|...|wall|rug|tabletop   one category      &set=tea|bamboo|...   one set
//   &id=futonBed[,chabudai]                 just these items, larger
//   &dist=14 &yaw=0.785 &pitch=0.62 &hour=13   camera / time;  &night  = hour 21 (lamps glow)
//   &gap=2  grid spacing;  &nolabels  hide the name tags;  &bounds  draw each template's box (red when it breaks the footprint / height
//   contract);  &cols=N  grid columns
// window.__info: { items, stubs, tris, contract: { id: [issues] } }
import * as THREE from 'three';
import { makeStage } from './_stage.js';
import { makeToon } from '../gfx/materials.js';
import { FURNITURE, FURNITURE_IDS, CELL, footprint } from '../home/furniture.js';
import { furnitureGroup, furnitureTemplate } from '../home/furnitureMesh.js';
import { setNightAll } from '../world/buildings/index.js';

// the model contract (furnitureMesh.js / furnitureModels.js): footprint with a 2 cm margin, height about def.h
function contract(d, b) {
  const out = [], tol = 0.012, [w, dd] = d.size, hx = w * CELL / 2, hz = dd * CELL / 2, f = v => v.toFixed(3);
  if (d.mount === 'wall') {
    const H = dd * CELL;
    if (b.min.x < -hx - tol || b.max.x > hx + tol) out.push(`x ${f(b.min.x)}..${f(b.max.x)} (±${hx})`);
    if (b.min.y < -tol || b.max.y > H + tol) out.push(`y ${f(b.min.y)}..${f(b.max.y)} (0..${H})`);
    if (b.min.z < -tol || b.max.z > 0.22 + tol) out.push(`z ${f(b.min.z)}..${f(b.max.z)} (0..0.22)`);
    return out;
  }
  const mx = hx - 0.02, mz = hz - 0.02;
  if (b.min.x < -mx - tol || b.max.x > mx + tol) out.push(`x ${f(b.min.x)}..${f(b.max.x)} (±${f(mx)})`);
  if (b.min.z < -mz - tol || b.max.z > mz + tol) out.push(`z ${f(b.min.z)}..${f(b.max.z)} (±${f(mz)})`);
  if (b.min.y < (d.mount === 'rug' ? 0.002 : 0) - tol) out.push(`below base ${f(b.min.y)}`);
  if (b.max.y < d.h * 0.85 - tol || b.max.y > d.h * 1.15 + tol) out.push(`top ${f(b.max.y)} (h ${d.h})`);
  return out;
}

export default function () {
  const P = new URLSearchParams(location.search);
  const only = P.get('id')?.split(',').filter(id => FURNITURE[id]);
  let ids = only?.length ? only : FURNITURE_IDS.filter(id => (!P.get('cat') || FURNITURE[id].cat === P.get('cat')) && (!P.get('set') || FURNITURE[id].set === P.get('set')));
  const nWall = ids.filter(id => FURNITURE[id].mount === 'wall').length;
  if (!only?.length) ids = [...ids.filter(id => FURNITURE[id].mount === 'wall'), ...ids.filter(id => FURNITURE[id].mount !== 'wall')]; // walls at the back
  const cols = +(P.get('cols') || 0) || (only?.length ? Math.ceil(Math.sqrt(ids.length)) : Math.max(nWall, Math.ceil(Math.sqrt(ids.length * 1.6))));
  const pitch = +(P.get('gap') || 0) || (only?.length ? Math.max(1.5, Math.max(...ids.map(id => Math.max(...FURNITURE[id].size))) * CELL + 1.1) : 2.4);
  const rows = Math.ceil(ids.length / cols);
  const W = cols * pitch, D = rows * pitch;
  const S = makeStage({ ground: 0, hour: 13, center: [W / 2 - pitch / 2, D / 2 - pitch / 2], dist: only?.length ? Math.max(6, Math.hypot(W, D) * 1.6) : Math.max(16, Math.hypot(W, D) * 1.32) });
  const night = P.has('night');
  if (night) S.day.hour = 21;
  // a plank floor and a wall behind each wall item
  const floorMat = makeToon({ color: '#e8c08a', brush: 0.2, rim: 0.05 });
  const fl = new THREE.Mesh(new THREE.BoxGeometry(W + 2, 0.1, D + 2), floorMat); fl.position.set(W / 2 - pitch / 2, -0.05, D / 2 - pitch / 2); fl.receiveShadow = true; S.scene.add(fl);
  const wallMat = makeToon({ color: '#fff3e0', brush: 0.15, rim: 0.05 });
  const labels = [], contracts = {};
  ids.forEach((id, i) => {
    const d = FURNITURE[id], cx = (i % cols) * pitch, cz = Math.floor(i / cols) * pitch;
    const g = furnitureGroup(id), t = furnitureTemplate(id);
    let base = 0;
    if (d.mount === 'wall') {
      const wy = 0.35, wh = wy + d.size[1] * CELL + 0.35;
      const wall = new THREE.Mesh(new THREE.BoxGeometry(pitch * 0.9, wh, 0.12), wallMat); wall.position.set(cx, wh / 2, cz - 0.7); wall.castShadow = wall.receiveShadow = true; S.scene.add(wall);
      g.position.set(cx, wy, cz - 0.64); base = wy;
    } else if (d.mount === 'table') {
      const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.5, 18), makeToon({ color: '#c98f5e', brush: 0.15 })); stand.position.set(cx, 0.25, cz); stand.castShadow = stand.receiveShadow = true; S.scene.add(stand);
      g.position.set(cx, 0.5, cz); base = 0.5;
    } else if (d.mount === 'ceiling') {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.12, 0.12), makeToon({ color: '#8f6a52' })); beam.position.set(cx, 2.36, cz); S.scene.add(beam);
      g.position.set(cx, 2.3 - d.h, cz); base = 2.3 - d.h;
    } else g.position.set(cx, 0, cz);
    // footprint outline on the floor
    const [fw, fd] = footprint(d, 0);
    if (d.mount !== 'wall') {
      const o = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(fw * CELL, fd * CELL).rotateX(-Math.PI / 2)), new THREE.LineBasicMaterial({ color: '#7a5240', transparent: true, opacity: 0.35 }));
      o.position.set(cx, (d.mount === 'table' ? 0.5 : 0) + 0.006, cz); S.scene.add(o);
    }
    g.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    S.scene.add(g);
    const bad = contract(d, t.box);
    if (bad.length) contracts[id] = bad;
    if (P.has('bounds')) { const bh = new THREE.Box3Helper(t.box, bad.length ? '#ff3a3a' : '#3ab86a'); bh.position.copy(g.position); S.scene.add(bh); }
    const top = d.mount === 'wall' ? g.position.y + t.box.max.y : g.position.y + t.box.max.y;
    labels.push({ id, pos: new THREE.Vector3(cx, top + 0.12, d.mount === 'wall' ? cz - 0.6 : cz), text: `${d.name}${t.real ? '' : ' (stub)'}${bad.length ? ' !' : ''}`, base });
  });
  // close-ups: aim at the items' middle (wall items hang high, tabletop items stand on a stand)
  if (only?.length) {
    const c = new THREE.Vector3(); let k = 0;
    S.scene.traverse(o => { if (o.name?.startsWith('furniture:')) { const t = furnitureTemplate(o.name.slice(10)); c.add(t.box.getCenter(new THREE.Vector3()).add(o.position)); k++; } });
    if (k) { c.multiplyScalar(1 / k); S.engine.rig.focus.copy(c); S.engine.rig.snap(); }
  }
  setNightAll(night || +(P.get('hour') ?? 13) > 19 || +(P.get('hour') ?? 13) < 6 ? 1 : 0);
  if (!P.has('nolabels')) {
    const box = document.createElement('div'); box.style.cssText = 'position:fixed;inset:0;pointer-events:none;font:700 11px system-ui;color:#4a2c2a';
    document.body.appendChild(box);
    for (const l of labels) { const e = document.createElement('div'); e.textContent = l.text; e.style.cssText = 'position:absolute;transform:translate(-50%,-100%);background:#fff6e8d0;border:2px solid #4a2c2a;border-radius:8px;padding:1px 5px;white-space:nowrap'; box.appendChild(e); l.el = e; }
    const v = new THREE.Vector3();
    S.onUpdate(() => { for (const l of labels) { v.copy(l.pos).project(S.engine.camera); l.el.style.left = ((v.x * 0.5 + 0.5) * innerWidth) + 'px'; l.el.style.top = ((-v.y * 0.5 + 0.5) * innerHeight) + 'px'; } });
  }
  window.__info = { items: ids.length, stubs: ids.filter(id => !furnitureTemplate(id).real), tris: Object.fromEntries(ids.map(id => [id, Math.round(furnitureTemplate(id).tris)])), contract: contracts };
  S.ready();
}
