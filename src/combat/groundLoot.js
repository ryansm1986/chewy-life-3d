// Ground loot: spills from monsters/chests with a bouncy arc; coins/potions/materials auto-collect,
// items show rarity beams + labels and are picked up by walking over them or clicking their label.
import * as THREE from 'three';
import { makeToon, makeOutline } from '../gfx/materials.js';
import { paint, merge } from '../gfx/geom.js';
import { tennisBallTexture } from '../gfx/textures.js';
import { boneSwordGeo } from '../actors/charKit.js';
import { RARITY } from '../rpg/items.js';
import { Events } from '../core/events.js';
import { rand, TAU, dist, uid } from '../core/util.js';

const RCOL = { normal: '#f4efe6', magic: '#6ea8ff', rare: '#ffd84a', unique: '#ff9a3c', set: '#5ee07a' };
const MAT_COL = { wood: '#b07a4a', stone: '#b8b0c0', petal: '#ffb0d0', crystal: '#9ae8ff', bone: '#fff4e0', mochi: '#ffe0ec', silk: '#e8e0ff', lantern: '#ff8a4a' };
const POT_COL = { heart: '#ff6a8a', zoom: '#5aa8ff', rejuv: '#b88aff' };
const cache = {};
function geo(key, make) { return cache[key] || (cache[key] = make()); }

function coinGeo() {
  return geo('coin', () => { const parts = []; for (let i = 0; i < 4; i++) { const c = new THREE.CylinderGeometry(0.1, 0.1, 0.03, 14); c.translate((i % 2) * 0.06 - 0.03, 0.02 + i * 0.032, (i > 1 ? 0.05 : -0.02)); parts.push(paint(c, (p, n, o) => o.set(n.y > 0.5 ? '#ffe070' : '#e8a830'))); } return merge(parts); });
}
function potionGeo(key) {
  return geo('pot' + key, () => {
    if (key === 'heart') { // heart-shaped cookie
      const s = new THREE.Shape(); s.moveTo(0, -0.12); s.bezierCurveTo(-0.18, 0.0, -0.1, 0.16, 0, 0.07); s.bezierCurveTo(0.1, 0.16, 0.18, 0.0, 0, -0.12);
      const g = new THREE.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 2 }); g.center(); g.translate(0, 0.14, 0);
      return paint(g, (p, n, o) => o.set(Math.abs(n.z) > 0.7 ? '#ff7a9a' : '#e8a870'));
    }
    const b = new THREE.SphereGeometry(0.1, 12, 10); b.translate(0, 0.1, 0); paint(b, (p, n, o) => o.set(POT_COL[key]));
    const neck = new THREE.CylinderGeometry(0.035, 0.045, 0.08, 8); neck.translate(0, 0.22, 0); paint(neck, (p, n, o) => o.set('#e8f4ff'));
    const cork = new THREE.CylinderGeometry(0.035, 0.03, 0.04, 8); cork.translate(0, 0.28, 0); paint(cork, (p, n, o) => o.set('#b07a4a'));
    return merge([b, neck, cork]);
  });
}
function matGeo(key) {
  return geo('mat' + key, () => {
    const c = MAT_COL[key] || '#ffffff';
    if (key === 'wood') { const g = new THREE.CylinderGeometry(0.07, 0.07, 0.3, 8); g.rotateZ(Math.PI / 2); g.translate(0, 0.08, 0); return paint(g, (p, n, o) => o.set(Math.abs(n.x) > 0.7 ? '#e8c08a' : c)); }
    if (key === 'crystal') { const g = new THREE.OctahedronGeometry(0.12); g.scale(0.7, 1.4, 0.7); g.translate(0, 0.16, 0); return paint(g, (p, n, o) => o.set(c)); }
    if (key === 'bone') { const g = new THREE.CapsuleGeometry(0.03, 0.2, 4, 8); g.rotateZ(Math.PI / 2); g.translate(0, 0.05, 0); const e = [-1, 1].map(s => { const k = new THREE.SphereGeometry(0.045, 8, 6); k.translate(s * 0.13, 0.05, 0); return k; }); return paint(merge([g, ...e]), (p, n, o) => o.set(c)); }
    if (key === 'petal') { const g = new THREE.SphereGeometry(0.1, 10, 6); g.scale(1, 0.25, 0.6); g.translate(0, 0.05, 0); return paint(g, (p, n, o) => o.set(c)); }
    const g = new THREE.IcosahedronGeometry(0.11, 1); g.translate(0, 0.1, 0); return paint(g, (p, n, o) => o.set(c));
  });
}
function gemGeo() { return geo('gem', () => { const g = new THREE.OctahedronGeometry(0.11, 0); g.scale(1, 1.2, 1); g.translate(0, 0.14, 0); return paint(g, (p, n, o) => o.set('#ffffff').lerp(new THREE.Color('#dddddd'), 0.2)); }); }
function bundleGeo() {
  return geo('bundle', () => {
    const b = new THREE.SphereGeometry(0.17, 14, 10); b.scale(1, 0.8, 1); b.translate(0, 0.14, 0);
    const knot = new THREE.SphereGeometry(0.07, 10, 8); knot.translate(0, 0.3, 0);
    const ears = [-1, 1].map(s => { const e = new THREE.ConeGeometry(0.05, 0.12, 6); e.rotateZ(s * 0.9); e.translate(s * 0.07, 0.34, 0); return e; });
    return merge([b, knot, ...ears]);
  });
}

export class GroundLoot {
  constructor(G, world) { this.G = G; this.world = world; this.list = []; this.mats = {}; }
  mat(color) { return this.mats[color] || (this.mats[color] = makeToon({ vertexColors: true, color, rim: 0.6, emissive: color, emissiveIntensity: 0.12 })); }
  drop(pos, drops) {
    drops.forEach((d, i) => {
      const a = rand(0, TAU), r = rand(0.5, 1.6);
      const to = new THREE.Vector3(pos.x + Math.cos(a) * r, 0, pos.z + Math.sin(a) * r);
      if (!this.world.walkable(to.x, to.z)) to.set(pos.x, 0, pos.z);
      to.y = this.world.heightAt(to.x, to.z);
      setTimeout(() => this.spawn(d, pos.clone().setY(pos.y + 0.6), to), i * 70);
    });
  }
  spawn(d, from, to) {
    let mesh, color = '#ffffff', beam = null, label = null;
    if (d.type === 'coins') { mesh = new THREE.Mesh(coinGeo(), makeToon({ vertexColors: true, rim: 0.7, emissive: '#ffb030', emissiveIntensity: 0.25 })); }
    else if (d.type === 'potion') { mesh = new THREE.Mesh(potionGeo(d.key), makeToon({ vertexColors: true, rim: 0.6, emissive: POT_COL[d.key], emissiveIntensity: 0.3 })); }
    else if (d.type === 'material') { mesh = new THREE.Mesh(matGeo(d.key), makeToon({ vertexColors: true, rim: 0.6 })); }
    else if (d.type === 'gem') { const gc = d.item?.color || d.item?.icon?.colors?.[0] || '#ff6a8a'; mesh = new THREE.Mesh(gemGeo(), makeToon({ vertexColors: true, color: gc, rim: 0.8, emissive: gc, emissiveIntensity: 0.6 })); color = gc; label = d.item?.name; }
    else if (d.type === 'item') {
      const it = d.item; color = RCOL[it.rarity] || '#ffffff';
      if (it.slot === 'weapon' && it.wtype === 'sword') { mesh = new THREE.Mesh(boneSwordGeo(), makeToon({ vertexColors: true, rim: 0.6, emissive: color, emissiveIntensity: it.rarity === 'normal' ? 0 : 0.25 })); mesh.scale.setScalar(0.7); mesh.rotation.z = Math.PI / 2; }
      else if (it.slot === 'weapon') { mesh = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 10), makeToon({ map: tennisBallTexture(), rim: 0.6, emissive: color, emissiveIntensity: 0.15 })); mesh.geometry.translate(0, 0.13, 0); }
      else { mesh = new THREE.Mesh(bundleGeo(), makeToon({ color, rim: 0.7, emissive: color, emissiveIntensity: 0.2 })); }
      label = it.name;
      if (['rare', 'unique', 'set'].includes(it.rarity)) beam = this.G.vfx.pillar(to, { color, persistent: true, r: 0.28, h: 5, opacity: it.rarity === 'rare' ? 0.35 : 0.6 });
      if (it.rarity === 'unique' || it.rarity === 'set') Events.emit('sfx', 'pickup_rare');
    }
    if (!mesh) return;
    mesh.castShadow = true;
    const ol = new THREE.Mesh(mesh.geometry, makeOutline('#3a2230', 0.012)); mesh.add(ol);
    this.world.scene.add(mesh);
    const e = { id: uid(), d, mesh, from, to, t: 0, fly: 0.55, beam, color, label, spin: rand(-3, 3) };
    if (label) this.G.ui?.lootLabel?.add?.({ id: e.id, name: label, color, worldPos: to.clone().setY(to.y + 0.5), onClick: () => this.tryPickup(e, true) });
    if (e.beam) e.light = this.world.lightPool.addSource({ pos: to.clone().setY(1), color: new THREE.Color(color), intensity: 3, radius: 3.5 });
    this.list.push(e);
    Events.emit('sfx', 'drop_item', { pos: to });
  }
  tryPickup(e, clicked = false) {
    const G = this.G, P = G.player;
    if (!clicked && e.d.type === 'item' && e.d.item.rarity === 'normal' && !G.state.flags?.autoPickNormal) return false;
    if (clicked && dist(P.pos.x, P.pos.z, e.to.x, e.to.z) > 1.8) { P.moveTarget = e.to.clone(); P.pendingLoot = e; return false; }
    const ok = G.actions.pickup(e.d);
    if (!ok) return false;
    this.remove(e);
    const p = e.to.clone().setY(e.to.y + 0.4);
    if (e.d.type === 'coins') { G.vfx.coins(p, 6); Events.emit('sfx', 'pickup_gold'); G.ui?.float?.(p, `+${e.d.n}`, { kind: 'coins' }); }
    else if (e.d.type === 'potion') { G.vfx.sparkle(p, { n: 5, color: POT_COL[e.d.key] }); Events.emit('sfx', 'pickup_item'); }
    else if (e.d.type === 'material') { G.vfx.sparkle(p, { n: 4, color: MAT_COL[e.d.key] }); Events.emit('sfx', 'pickup_item'); G.ui?.float?.(p, `+${e.d.n} ${e.d.key}`, { kind: 'status', color: MAT_COL[e.d.key] }); }
    else { G.vfx.sparkle(p, { n: 10, color: e.color }); Events.emit('sfx', ['unique', 'set', 'rare'].includes(e.d.item?.rarity) ? 'pickup_rare' : 'pickup_item'); G.ui?.pickupFly?.(e.d.item, p); }
    return true;
  }
  remove(e) {
    const i = this.list.indexOf(e); if (i >= 0) this.list.splice(i, 1);
    e.mesh.parent?.remove(e.mesh);
    if (e.beam) { e.beam.alive = false; }
    if (e.light) this.world.lightPool.removeSource(e.light);
    if (e.label) this.G.ui?.lootLabel?.remove?.(e.id);
  }
  update(dt) {
    const G = this.G, P = G.player;
    for (const e of [...this.list]) {
      e.t += dt;
      if (e.t < e.fly) {
        const k = e.t / e.fly;
        e.mesh.position.lerpVectors(e.from, e.to, k); e.mesh.position.y = e.from.y + (e.to.y - e.from.y) * k + Math.sin(k * Math.PI) * 1.2;
        e.mesh.rotation.y += dt * 12;
      } else {
        const b = Math.max(0, 1 - (e.t - e.fly) * 3);
        e.mesh.position.set(e.to.x, e.to.y + Math.abs(Math.sin((e.t - e.fly) * 9)) * 0.15 * b + 0.02, e.to.z);
        e.mesh.rotation.y += dt * e.spin * 0.3;
        if (Math.random() < dt * 1.5 && e.d.type === 'coins') G.vfx.sparkle(e.mesh.position, { n: 1, color: '#ffe070', r: 0.2 });
        if (!P || G.playerDead) continue;
        const d = dist(P.pos.x, P.pos.z, e.to.x, e.to.z);
        const auto = e.d.type !== 'item' && e.d.type !== 'gem';
        if (auto && d < 2.2 && !(e.refusedUntil > e.t)) { // magnet (pauses after a refused pickup, e.g. full belt)
          e.to.lerp(P.pos, Math.min(1, dt * 8));
          if (d < 0.5 && !this.tryPickup(e)) { e.refusedUntil = e.t + 4; e.refusedPos = P.pos.clone(); }
        } else if (e.refusedUntil > e.t && e.refusedPos && P.pos.distanceTo(e.refusedPos) > 2.5) e.refusedUntil = 0; else if (!auto && d < 0.6 && !e.triedAuto) { e.triedAuto = true; if (!this.tryPickup(e)) e.triedAuto = true; }
        else if (d > 1.2) e.triedAuto = false;
        if (P.pendingLoot === e && d < 1.3) { P.pendingLoot = null; this.tryPickup(e, true); }
      }
    }
  }
  clear() { for (const e of [...this.list]) this.remove(e); }
}
