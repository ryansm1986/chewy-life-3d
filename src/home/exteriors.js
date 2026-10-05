// House exteriors in the village (docs/HOUSING.md §5-6): every home's mailbox (an F interactable that opens the house
// card: Upgrade / Remodel / Enter), the remodelled yard fences, and the upgrade's construction moment (a scaffold pops
// up round the house, the house grows inside it, the scaffold drops away). Built by Housing (home/housing.js) as
// G.housing.ext; sync() runs on 'village:changed'; update(dt) runs in the village frame (game.js).
import * as THREE from 'three';
import { Events } from '../core/events.js';
import { instantiate, MATS, Builder } from '../world/buildings/kit.js';
import { mailbox as mailboxProp } from '../world/buildings/props.js';
import { FENCE_COLORS, cleanStyle } from '../world/buildings/styles.js';
import { BUILDINGS } from '../world/buildings/index.js';

// the new models (home/exteriorModels.js) when they're there; a stand-in until then
const EXT = import.meta.glob('./exteriorModels.js', { eager: true })['./exteriorModels.js'] || {};
let _stand = null;
function mailboxTpl() {
  if (EXT.mailboxTemplate) return EXT.mailboxTemplate();
  if (_stand) return _stand;
  const B = new Builder(4711); mailboxProp(B, '#e8403a'); _stand = B.finish(); return _stand;
}
const scaffoldTpl = (w, d, h) => EXT.scaffoldTemplate?.(w, d, h) || null;
const MAX_MAIL = 96;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), UP = new THREE.Vector3(0, 1, 0);

export class Exteriors {
  constructor(G, housing) {
    this.G = G; this.H = housing;
    this.mail = new Map(); // building data → { inter, idx, x, z, face }
    this.meshes = null; this.jobs = [];
  }
  get W() { return this.G.village?.world || this.G.sim?.world; }
  // ---------------------------------------------------------------- mailboxes
  ensureMeshes() {
    if (this.meshes || !this.W) return;
    const tpl = mailboxTpl(), M = MATS();
    this.meshes = Object.entries(tpl.geos).map(([k, g]) => {
      const m = new THREE.InstancedMesh(g, M[k], MAX_MAIL); m.count = 0; m.name = 'mailboxes:' + k;
      m.castShadow = k !== 'glow'; m.receiveShadow = true; m.frustumCulled = false;
      this.W.scene.add(m); return m;
    });
  }
  /** the mailbox spot of a building record → { x, z, face } | null (homes: their yard's spot; the cottage: its own) */
  spotOf(rec) {
    const b = rec.data, det = this.W?.details;
    if (b.type === 'chewyHouse') { // (the cottage's mailbox is part of its model: local (1.05, 1.2))
      const th = -b.rot * Math.PI / 2, c = Math.cos(th), s = Math.sin(th), p = rec.group.position, lx = 1.05, lz = 1.2;
      return { x: p.x + lx * c + lz * s, z: p.z - lx * s + lz * c, face: th, own: true };
    }
    if (BUILDINGS[b.type]?.cat !== 'home' || !b.plot) return null;
    return det?.mailSpots?.get(b.plot) || null;
  }
  sync() {
    const G = this.G, sim = G.sim, W = this.W; if (!sim || !W) return;
    this.ensureMeshes();
    const want = new Map();
    for (const rec of sim.list) { const sp = this.spotOf(rec); if (sp) want.set(rec.data, { rec, sp }); }
    // gone or moved
    for (const [b, m] of this.mail) if (!want.has(b) || Math.hypot(want.get(b).sp.x - m.x, want.get(b).sp.z - m.z) > 0.05) { const i = W.interactables.indexOf(m.inter); if (i >= 0) W.interactables.splice(i, 1); this.mail.delete(b); }
    for (const [b, { rec, sp }] of want) {
      if (this.mail.has(b)) continue;
      const pos = new THREE.Vector3(sp.x, W.heightAt(sp.x, sp.z), sp.z);
      const inter = { pos, radius: 0.85, label: 'Mailbox ✉', building: b, mailbox: true, onInteract: () => this.H.openHouseCard(this.recOf(b)) };
      W.interactables.push(inter);
      this.mail.set(b, { inter, x: sp.x, z: sp.z, face: sp.face, own: !!sp.own });
    }
    // the instanced mailboxes (the cottage draws its own)
    let n = 0;
    for (const m of this.mail.values()) {
      if (m.own || n >= MAX_MAIL) continue;
      _q.setFromAxisAngle(UP, m.face + 0.25); _m.compose(_p.set(m.x, W.heightAt(m.x, m.z) - 0.02, m.z), _q, _s);
      for (const mesh of this.meshes) mesh.setMatrixAt(n, _m);
      n++;
    }
    for (const mesh of this.meshes) { mesh.count = n; mesh.instanceMatrix.needsUpdate = true; }
    // the remodelled yard fences
    for (const rec of sim.list) this.syncFence(rec.data);
  }
  recOf(b) { return this.G.sim?.list.find(r => r.data === b) || null; }
  syncFence(b) {
    const det = this.W?.details; if (!det?.setPlotFence) return;
    const plot = b.plot || (b.type === 'chewyHouse' ? 'chewyHouse' : null); if (!plot) return;
    const st = cleanStyle(b.style);
    det.setPlotFence(plot, st?.fence || null, st?.fenceColor ? FENCE_COLORS[st.fenceColor].c : null);
  }
  // ---------------------------------------------------------------- the upgrade's construction moment
  // (the storyboard of /?test=upgrade&frames=1: before → the scaffold pops up → a dust ring → the old house goes and
  //  the new one rises from below the ground → the scaffold drops away → after)
  /** a scaffold round a building record for ~3.5 s while it grows: onGrow() levels it up (and returns its new record)
   *  half-way; nextSize = [w, d] metres, h = the new house's height (the pole tops stand 0.45 m above it) → the job */
  construct(rec, nextSize, h, onGrow, at = null) {
    const G = this.G, W = this.W, b = rec.data, [w, d] = nextSize;
    const tpl = scaffoldTpl(w, d, Math.max(2.4, h || rec.model?.height || 2.6));
    let group = null, parts = [];
    if (tpl) { const inst = instantiate(tpl); group = inst.group; parts = inst.parts; group.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); }
    const job = { rec, b, t: 0, grown: false, group, parts, onGrow, pos: (at || rec.group.position).clone(), rot: rec.group.rotation.y, w, d, dust: false, rise: null };
    if (group) { group.position.copy(job.pos); group.rotation.y = job.rot; group.scale.set(1, 0.001, 1); W.scene.add(group); group.name = 'scaffold'; }
    Events.emit('sfx', 'build_place', { vol: 0.7 });
    this.jobs.push(job);
    return job;
  }
  update(dt) {
    const G = this.G, sim = G.sim;
    for (let i = this.jobs.length - 1; i >= 0; i--) {
      const j = this.jobs[i]; j.t += dt;
      // the scaffold: pops up (an overshoot), stands, then drops away
      const up = Math.min(1, j.t / 0.5), down = j.t > 3.0 ? Math.min(1, (j.t - 3.0) / 0.45) : 0;
      if (j.group) {
        const k = down > 0 ? 1 - down * down : 1 - (1 - up) ** 3 + Math.sin(up * Math.PI) * 0.1;
        j.group.scale.set(1, Math.max(0.001, k), 1);
        for (const { node, a } of j.parts) { const ph = j.t * a.speed + a.phase; if (a.kind === 'swing') node.quaternion.setFromAxisAngle(a.axis, Math.sin(ph) * a.amp); else if (a.kind === 'bob') node.position.set(a.pivot.x, a.pivot.y + Math.sin(ph) * a.amp, a.pivot.z); }
      }
      if (!j.dust && j.t > 0.45) { j.dust = true; G.village?.vfx?.dustRing?.(j.pos, Math.max(j.w, j.d) * 0.65); }
      // hammering while it's up
      if (j.t > 0.6 && j.t < 2.9 && (j.puff = (j.puff || 0) - dt) <= 0) { j.puff = 0.24; const an = Math.random() * Math.PI * 2, r = Math.max(j.w, j.d) * 0.5; G.village?.vfx?.dust?.(j.pos.clone().add(new THREE.Vector3(Math.cos(an) * r, 0.5 + Math.random() * 1.8, Math.sin(an) * r)), { n: 2, color: '#f2dcb8', size: 0.3 }); if (Math.random() < 0.55) Events.emit('sfx', 'build_place', { vol: 0.22, pitch: 1.3 + Math.random() * 0.4 }); }
      // half-way: the old house goes, the new one rises from below the ground (instead of the village's own pop-up)
      if (!j.grown && j.t > 1.2) {
        j.grown = true;
        let nrec = null; try { nrec = j.onGrow?.(); } catch (e) { console.error('[housing] upgrade failed', e); }
        if (nrec?.group) {
          const k = sim.rising.findIndex(r => r.rec === nrec); if (k >= 0) sim.rising.splice(k, 1);
          nrec.group.scale.set(1, 1, 1);
          j.rise = { rec: nrec, y0: nrec.group.position.y, h: nrec.model?.height || 2.6, t: 0 };
          nrec.group.position.y = j.rise.y0 - j.rise.h;
        }
      }
      if (j.rise) {
        const R = j.rise; R.t += dt; const k = Math.min(1, R.t / 1.1), e = 1 - (1 - k) ** 3;
        R.rec.group.position.y = R.y0 - R.h * (1 - e);
        if (k >= 1 && !R.done) { R.done = true; R.rec.group.position.y = R.y0; Events.emit('sfx', 'build_complete'); }
      }
      if (j.t > 3.5) {
        if (j.group) j.group.removeFromParent();
        if (j.rise && !j.rise.done) j.rise.rec.group.position.y = j.rise.y0;
        this.jobs.splice(i, 1);
        G.village?.vfx?.petals?.(j.pos.clone().setY(j.pos.y + 1.8), 22, 1.6);
        Events.emit('house:upgraded', { b: j.b });
      }
    }
  }
  get busy() { return this.jobs.length > 0; }
}
