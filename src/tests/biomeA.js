// Biomes A showcase (/?test=biomeA): the Bamboo Grove and Momiji Hollow assets (src/regions/assets/bamboo*.js,
// maple*.js) in a labelled grid, drawn through the biome Placer's batches with their in-game materials.
// Params: &set=bamboo|bambooProps|maple|mapleProps (comma list)  &only=name[,name]  &focus=i  &dist= &pitch= &yaw=
//         &labels=0  &cols=N  &gap=m  &hour=  &ground=#hex
// window.__info = { count, per: { name: tris }, calls }.
import * as THREE from 'three';
import { makeStage } from './_stage.js';
import { Placer, M } from '../regions/assets/bambooKit.js';
import { SHOWCASE as BAMBOO } from '../regions/assets/bambooShowcase.js';

const SETS = { ...BAMBOO };

export default async function () {
  const P = new URLSearchParams(location.search);
  const sets = (P.get('set') || 'bamboo').split(',');
  // later sets are loaded on demand so a half-finished module never breaks the others
  for (const s of sets) if (!SETS[s]) { try { const m = await import(`../regions/assets/${s.startsWith('maple') ? 'maple' : 'bamboo'}Showcase.js`); Object.assign(SETS, m.SHOWCASE); } catch (e) { console.warn('[biomeA] no set', s, e.message); } }
  const only = P.get('only')?.split(',');
  const names = [];
  for (const s of sets) for (const [n, it] of Object.entries(SETS[s] || {})) if (!only || only.includes(n)) names.push([n, it]);
  if (only) names.sort((a, b) => only.indexOf(a[0]) - only.indexOf(b[0]));
  const gap = +(P.get('gap') ?? 3.2), cols = +(P.get('cols') ?? Math.ceil(Math.sqrt(names.length * 1.6)));
  const SQ = Math.SQRT1_2, U = [SQ, -SQ], Vv = [SQ, SQ];
  const cells = []; let u = 0, v = 0, col = 0, rowH = 0;
  for (const [n, it] of names) {
    const w = gap * (it.w || 1);
    if (col >= cols) { col = 0; u = 0; v += rowH; rowH = 0; }
    const cu = u + w / 2, cv = v + w / 2;
    cells.push({ n, it, x: cu * U[0] + cv * Vv[0], z: cu * U[1] + cv * Vv[1] });
    u += w; rowH = Math.max(rowH, w); col++;
  }
  const xs = cells.map(c => c.x), zs = cells.map(c => c.z);
  let center = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...zs) + Math.max(...zs)) / 2];
  const focus = P.has('focus') ? cells[Math.min(cells.length - 1, +P.get('focus'))] : null;
  if (focus) center = [focus.x, focus.z];
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)) + gap;
  const S = makeStage({ ground: Math.max(80, span * 1.6 + 30), center, dist: focus ? 9 : Math.max(12, span * 1.2), hour: 10, groundColor: P.get('ground') || (sets[0].startsWith('maple') ? '#b8a24e' : '#7aaa52') });
  if (focus) { S.engine.rig.focus.y = +(P.get('fy') ?? (focus.it.fy ?? 1)); S.engine.rig.snap(); }
  const placer = new Placer({ heightAt: () => 0, name: 'biomeA' });
  const per = {}, labels = [];
  const tri = g => (g.index ? g.index.count : g.attributes.position.count) / 3;
  const anims = [];
  for (const c of cells) {
    const before = new Map([...placer.batches].map(([k, b]) => [k, b.items?.length || 0]));
    const res = c.it.place(placer, c.x, c.z, { S, anims }) || {};
    let tris = 0, h = res.h ?? 1;
    for (const [k, b] of placer.batches) { const n0 = before.get(k) || 0; for (let i = n0; i < (b.items?.length || 0); i++) { const g = b.geos[b.items[i].gi]; tris += tri(g); if (!res.h) { g.computeBoundingBox(); h = Math.max(h, g.boundingBox.max.y * (b.items[i].m.elements[5] || 1)); } } }
    per[c.n] = Math.round(tris);
    labels.push({ n: c.n, tris: Math.round(tris), pos: new THREE.Vector3(c.x, h + 0.3, c.z) });
  }
  S.scene.add(placer.build());
  for (const l of placer.lights) S.lightPool.addSource(l);
  M('d:glow').emissiveIntensity = +(P.get('glow') ?? 0.4);
  if (P.get('labels') !== '0') {
    const root = document.createElement('div');
    root.style.cssText = 'position:fixed;inset:0;pointer-events:none;font:600 11px system-ui,sans-serif;z-index:5';
    document.body.appendChild(root);
    for (const l of labels) {
      const el = document.createElement('div');
      el.style.cssText = 'position:absolute;transform:translate(-50%,-100%);background:rgba(255,246,232,.85);color:#4a2c2a;padding:1px 6px;border-radius:8px;white-space:nowrap';
      el.textContent = `${l.n} · ${l.tris}`;
      root.appendChild(el); l.el = el;
    }
  }
  const v3 = new THREE.Vector3();
  S.onUpdate((dt, t) => {
    for (const a of anims) a(dt, t);
    for (const l of labels) if (l.el) {
      v3.copy(l.pos).project(S.engine.camera);
      l.el.style.left = ((v3.x * 0.5 + 0.5) * innerWidth) + 'px'; l.el.style.top = ((-v3.y * 0.5 + 0.5) * innerHeight) + 'px';
      l.el.style.display = v3.z < 1 ? '' : 'none';
    }
  });
  window.__info = { count: cells.length, per, calls: placer.batches.size };
  window.__placer = placer;
  S.ready();
}
