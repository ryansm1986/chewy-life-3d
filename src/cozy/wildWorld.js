// The wild areas at runtime (docs/COZY.md §6.2; ROADMAP CZ-3 / CZ-4). One WildRuntime per region visit (RegionMode):
//  - the leash: a wild monster that chases further than r + WILD.leash from its disc's centre gives up, walks back to
//    the spot it spawned on (healing a little on the way) and settles, so the peaceful map stays peaceful;
//  - the entry toast and 'wild:enter' { zone, area } when the hero steps into a disc ("The Kamaitachi Thicket: wild
//    yokai about!"), at most once a minute per area;
//  - 'wild:cleared' { zone, area } once every pack of an area is down on this visit;
//  - today's sightings (cozy/sightings.js): their packs carry the sighting's name, a red pin on the minimap (pins()),
//    and when the last of a pack falls the bounty is paid (G.peaceful.claim: loot, renown, 'sighting:cleared').
// The data and the pure rules are cozy/peaceful.js; layoutGen places the packs (spawns tagged `wild`).
import * as THREE from 'three';
import { Events } from '../core/events.js';
import { WILD, pastLeash, titled, wildAt } from './peaceful.js';

const _dir = new THREE.Vector3();
const TOAST_GAP = 60; // seconds between two entry toasts for the same area

/** Leash one monster to a wild area: its update runs as usual until it strays past the ring, then it walks home. */
export function leash(m, a) {
  if (!m || m.wild) return;
  m.wild = a; m.wildHome = { x: m.pos.x, z: m.pos.z };
  const base = m.update;
  m.update = function (dt) {
    if (this.homing && this.alive) { homeStep(this, dt); return; }
    base.call(this, dt);
    if (this.alive && this.aggro && !this.def.boss && pastLeash(a, this.pos.x, this.pos.z)) {
      this.homing = true; this.homeT = 0; this.homeLeft = null; this.homeVia = null; this.aggro = false;
      if (this.state === 'windup' || this.state === 'attack') this.cancelAttack();
      this.state = 'idle'; this.stateT = 0;
    }
  };
}
function homeStep(m, dt) {
  m.model._uf = (m.model._uf || 0) + 1;
  m.separate(dt);
  const a = m.wild, home = m.wildHome;
  m.homeT += dt; m.aggro = false;
  // the way home: straight back to its spawn spot; if that stalls (a culm clump, a rock, the crowd) and it's still
  // outside the disc, round by the area's entry (its side path is open ground) first
  const tgt = m.homeVia || home, dx = tgt.x - m.pos.x, dz = tgt.z - m.pos.z, d = Math.hypot(dx, dz);
  if ((m.homeChk = (m.homeChk ?? 1) - dt) <= 0) {
    m.homeChk = 1;
    const left = Math.hypot(home.x - m.pos.x, home.z - m.pos.z);
    if (m.homeLeft != null && m.homeLeft - left < 0.4 && !m.homeVia && a.entry && Math.hypot(m.pos.x - a.x, m.pos.z - a.z) > a.r - 1) m.homeVia = { x: a.entry[0], z: a.entry[1] };
    m.homeLeft = left;
  }
  if (m.homeVia && d < 1.5) m.homeVia = null;
  const done = !m.homeVia && d < 1.2, late = m.homeT > 14;
  if (!done && !late) { _dir.set(dx / d, 0, dz / d); m.move(_dir, dt, 1.15); m.faceTo(tgt.x, tgt.z, dt); }
  else {
    // still stuck out past the leash after all that: it slips back into the wild in a puff (the map stays peaceful)
    if (late && pastLeash(a, m.pos.x, m.pos.z)) {
      const G = m.G; G.vfx?.poof?.(m.pos.clone().setY(m.pos.y + 0.4), { color: '#c8a0ff', n: 8, size: 0.7 });
      m.pos.set(home.x, m.world.heightAt(home.x, home.z), home.z); G.vfx?.poof?.(m.pos.clone().setY(m.pos.y + 0.4), { color: '#c8a0ff', n: 8, size: 0.7 });
    }
    m.homing = false; m.homeVia = null; m.homeLeft = null; m.state = 'idle'; m.stateT = 0; m.wander = null;
  }
  if (m.life < m.lifeMax) m.heal(m.lifeMax * 0.12 * dt);
  const moving = m.homing;
  m.def.update?.(m, dt, moving);
  m.anim.update(dt, moving, m.speed);
  if (m.kit) m.kit.update(dt, m.pos);
  m.sync();
}

export class WildRuntime {
  constructor(mode) {
    this.mode = mode; this.G = mode.G; this.zone = mode.regionId;
    this.areas = mode.layout.wild || [];
    this.packs = new Map(); // area id → [monsters]
    this.sights = new Map(); // sighting id → { s, monsters, at, paid }
    this.cleared = new Set(); this.inside = null; this.told = {}; this.t = 0; this.checkT = 0;
  }
  /** the area at a point (or null) */
  at(x, z, pad = 0) { return wildAt(this.areas, x, z, pad); }
  /** RegionMode.start: these monsters were spawned for a wild area's pack */
  tag(monsters, areaId) {
    const a = this.areas.find(w => w.id === areaId); if (!a) return;
    const L = this.packs.get(a.id) || []; this.packs.set(a.id, L);
    for (const m of monsters) { leash(m, a); L.push(m); }
  }
  /** RegionMode.start: these monsters are today's sighting `s` (named, pinned, a bounty when they all fall) */
  sighting(s, monsters) {
    if (!s || !monsters.length) return;
    const lead = monsters.find(m => m.rank === 'unique') || monsters.find(m => m.rank === 'champion' && !m.leader) || null;
    if (s.kind === 'unique' && lead) lead.name = s.name;
    if (s.kind === 'champion') for (const m of monsters) if (m.rank === 'champion') m.name = s.name;
    for (const m of monsters) m.sighting = s.id;
    this.sights.set(s.id, { s, monsters, at: monsters[0].pos.clone(), paid: false });
  }
  /** the red pins: one per live sighting pack (where its first standing member is) */
  pins() {
    const out = [];
    for (const g of this.sights.values()) { if (g.paid) continue; const m = g.monsters.find(q => q.alive); if (m) { g.at.copy(m.pos); out.push({ x: m.pos.x, z: m.pos.z, id: g.s.id }); } }
    return out;
  }
  update(dt) {
    this.t += dt;
    // a sighting pack all down: the bounty
    for (const g of this.sights.values()) {
      if (g.paid) continue;
      const m = g.monsters.find(q => q.alive);
      if (m) { g.at.copy(m.pos); continue; } // (the last one standing is where the bounty drops)
      g.paid = true;
      this.G.peaceful?.claim?.(g.s.id, g.at.clone(), this.mode);
    }
    const P = this.G.player; if (!P || !this.areas.length) return;
    // the entry toast
    const a = this.at(P.pos.x, P.pos.z);
    if (a !== this.inside) {
      this.inside = a;
      if (a) {
        Events.emit('wild:enter', { zone: this.zone, area: a.id });
        if (!(this.told[a.id] > this.t)) {
          this.told[a.id] = this.t + TOAST_GAP;
          const live = (this.packs.get(a.id) || []).some(m => m.alive);
          this.G.ui?.toast?.(live ? `${titled(a.name)}: wild yokai about!` : `${titled(a.name)}: quiet, for now`, { icon: 'oni', color: '#c8a0ff', sub: a.jp || '' });
        }
      }
    }
    // an area whose packs are all down on this visit (checked a few times a second)
    if ((this.checkT -= dt) > 0) return;
    this.checkT = 0.4;
    for (const [id, L] of this.packs) {
      if (this.cleared.has(id) || !L.length || L.some(m => m.alive)) continue;
      this.cleared.add(id);
      const ar = this.areas.find(w => w.id === id);
      Events.emit('wild:cleared', { zone: this.zone, area: id });
      this.G.ui?.toast?.(`${titled(ar?.name || 'the wild')} is quiet, for now`, { icon: 'star', color: '#c8a0ff', sub: 'Its yokai come back on your next visit' });
    }
  }
  /** the leash ring's radius for an area (the debug view, the minimap) */
  static leashR(a) { return a.r + WILD.leash; }
  /** the debug view: each disc's rim (violet) and its leash ring (red), drawn over everything */
  showDebug(on) {
    this.debugOn = !!on;
    if (!on) { this.clearDebug(); return; }
    if (this.dbg) return;
    const W = this.mode.world, g = this.dbg = new THREE.Group(); g.name = 'wildDebug'; g.renderOrder = 30;
    const ring = (a, r, color) => {
      const pts = []; for (let i = 0; i <= 96; i++) { const t = i / 96 * Math.PI * 2, x = a.x + Math.cos(t) * r, z = a.z + Math.sin(t) * r; pts.push(new THREE.Vector3(x, W.heightAt(x, z) + 0.25, z)); }
      const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.9 }));
      l.renderOrder = 30; g.add(l);
    };
    for (const a of this.areas) { ring(a, a.r, '#c070ff'); ring(a, a.r + WILD.leash, '#ff5a6a'); }
    W.scene.add(g);
  }
  clearDebug() { if (!this.dbg) return; this.dbg.removeFromParent(); this.dbg.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); }); this.dbg = null; }
  dispose() { this.clearDebug(); this.packs.clear(); }
}
