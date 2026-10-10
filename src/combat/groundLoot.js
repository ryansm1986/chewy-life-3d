// Ground loot: spills from monsters/chests with a bouncy arc; coins/potions/materials auto-collect,
// items show rarity beams + labels and are picked up by walking over them or clicking their label.
// A furniture find (docs/HOUSING.md §3, home/finds.js) is the piece itself (its cached model, scaled down to ~0.5 m;
// a wallpaper is a roll and a floor a little stack of tiles), floating and bobbing in a soft beam with sparkles and its
// name; it comes to Chewy like the other loot and goes into the furniture storage.
import * as THREE from 'three';
import { makeToon, makeOutline } from '../gfx/materials.js';
import { paint, merge } from '../gfx/geom.js';
import { tennisBallTexture, glowTexture } from '../gfx/textures.js';
import { katanaGeo, katanaVariant } from '../actors/charKit.js';
import { RARITY } from '../rpg/items.js';
import { Events } from '../core/events.js';
import { POTION_CAP } from '../rpg/actions.js';
import { rand, TAU, dist, uid } from '../core/util.js';
import { glyph } from '../ui/glyphs.js';
import { PANTRY, CROPS } from '../life/pantry.js';
import { FURNITURE, SURFACES, SETS as FSETS, itemDef } from '../home/furniture.js';
import { furnitureGroup, furnitureTemplate } from '../home/furnitureMesh.js';
import { surfaceTexture } from '../home/surfaces.js';
import { lookIn } from '../dungeon/horde.js';

const RCOL = { normal: '#f4efe6', magic: '#6ea8ff', rare: '#ffd84a', unique: '#ff9a3c', set: '#5ee07a' };
const MAT_COL = { wood: '#b07a4a', stone: '#b8b0c0', petal: '#ffb0d0', crystal: '#9ae8ff', bone: '#fff4e0', mochi: '#ffe0ec', silk: '#e8e0ff', lantern: '#ff8a4a' };
const POT_COL = { heart: '#ff6a8a', zoom: '#5aa8ff', rejuv: '#b88aff' };
const cache = {};
// drops drawn instanced with the monsters in a fight (dungeon/horde.js lookIn: toon + ink on cached geometry; a fast
// killer leaves a few hundred on the floor, each was 3+ draws): the ones whose geometry is always cached
const INSTANCED_DROPS = new Set(['coins', 'potion', 'material', 'pantry', 'gem', 'quest', 'item']);
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
// a seed packet (or a little cloth bundle for other pantry goods): docs/HOMESTEAD.md
function pantryGeo(key) {
  return geo('pantry' + key, () => {
    const d = PANTRY[key], band = new THREE.Color(d?.crop ? (CROPS[d.crop].color === '#fbf6ee' || CROPS[d.crop].color === '#f4e4f0' ? CROPS[d.crop].accent : CROPS[d.crop].color) : '#8fe0a0');
    const pk = new THREE.BoxGeometry(0.2, 0.26, 0.035); pk.translate(0, 0.16, 0); paint(pk, (p, n, o) => o.set(p.y > 0.24 ? band : '#fff4dc'));
    const win = new THREE.CircleGeometry(0.055, 12); win.translate(0, 0.15, 0.0185); paint(win, (p, n, o) => o.copy(band).lerp(new THREE.Color('#ffffff'), 0.25));
    const g = merge([pk, win]); g.rotateX(-0.25); return g;
  });
}
// a quest item (docs/ZONES.md §8.2 'drop' objectives): a rolled letter tied with a red cord and a gold seal
function questGeo() {
  return geo('quest', () => {
    const roll = new THREE.CylinderGeometry(0.075, 0.075, 0.34, 14); roll.rotateZ(Math.PI / 2); roll.translate(0, 0.12, 0); paint(roll, (p, n, o) => o.set('#fff6e0').multiplyScalar(0.88 + 0.12 * Math.abs(n.y)));
    const ends = [-1, 1].map(s => { const e = new THREE.CylinderGeometry(0.09, 0.09, 0.03, 14); e.rotateZ(Math.PI / 2); e.translate(s * 0.18, 0.12, 0); return paint(e, (p, n, o) => o.set('#8a5a3a')); });
    const cord = new THREE.TorusGeometry(0.08, 0.016, 5, 14); cord.rotateY(Math.PI / 2); cord.translate(0, 0.12, 0); paint(cord, (p, n, o) => o.set('#e8403a'));
    const seal = new THREE.CylinderGeometry(0.04, 0.04, 0.02, 10); seal.rotateX(Math.PI / 2); seal.translate(0, 0.12, 0.085); paint(seal, (p, n, o) => o.set('#ffcf4a'));
    return merge([roll, ...ends, cord, seal]);
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

// a furniture find on the ground: shared, cached geometry and materials only (never disposed with the floor)
const surfMats = new Map();
function surfaceMat(id) {
  let m = surfMats.get(id);
  if (!m) { m = makeToon({ map: surfaceTexture(id).tex, rim: 0.45 }); surfMats.set(id, m); }
  return m;
}
function wallRollGeos() {
  return geo('wpRoll', () => {
    const roll = new THREE.CylinderGeometry(0.075, 0.075, 0.42, 18, 1); roll.rotateZ(Math.PI / 2); roll.translate(0, 0.075, -0.05);
    const flap = new THREE.PlaneGeometry(0.4, 0.2); flap.rotateX(-Math.PI / 2 + 0.08); flap.translate(0, 0.012, 0.075);
    for (const [g, su, sv] of [[roll, 0.47, 0.42], [flap, 0.4, 0.2]]) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv); }
    const band = new THREE.TorusGeometry(0.079, 0.014, 6, 20); band.rotateY(Math.PI / 2); band.translate(0.1, 0.075, -0.05); paint(band, (p, n, o) => o.set('#ff8fb0'));
    const bow = new THREE.SphereGeometry(0.03, 8, 6); bow.scale(1, 0.7, 1.4); bow.translate(0.1, 0.155, -0.05); paint(bow, (p, n, o) => o.set('#ff6f96'));
    return { paper: merge([roll, flap]), ribbon: merge([band, bow]) };
  });
}
function floorStackGeo() {
  return geo('flStack', () => {
    const parts = [[0, 0.0175, 0, 0.1], [0.02, 0.0525, -0.015, -0.25], [-0.015, 0.0875, 0.01, 0.4]].map(([x, y, z, r]) => {
      const t = new THREE.BoxGeometry(0.3, 0.035, 0.3); const uv = t.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.3, uv.getY(i) * 0.3);
      t.rotateY(r); t.translate(x, y, z); return t;
    });
    return merge(parts);
  });
}
function ribbonMat() { return geo('ribbonMat', () => makeToon({ vertexColors: true, rim: 0.5 })); }
// the soft glow disc a find floats over (one shared plane and material, white-gold for every set: the beam and the
// light carry the set's colour)
function glowDisc() {
  const { g, m } = geo('findGlow', () => { const g = new THREE.CircleGeometry(0.55, 28); g.rotateX(-Math.PI / 2); return { g, m: new THREE.MeshBasicMaterial({ map: glowTexture(), color: new THREE.Color('#ffe8a8'), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }) }; });
  const d = new THREE.Mesh(g, m); d.renderOrder = 1; return d;
}
/** the ground model of a furniture find (a Group of shared meshes): the piece about half a metre big (flat rugs tilted
 *  up to face the camera), lifted over a glow disc */
function furnitureLoot(id) {
  const holder = new THREE.Group(), piece = new THREE.Group();
  holder.add(piece);
  if (FURNITURE[id]) {
    const d = FURNITURE[id], t = furnitureTemplate(id), g = furnitureGroup(id), size = t.box.getSize(new THREE.Vector3()), c = t.box.getCenter(new THREE.Vector3());
    const k = Math.min(1.8, 0.52 / Math.max(size.x, size.y * 1.1, size.z, 0.1));
    g.scale.setScalar(k); g.position.set(-c.x * k, -c.y * k, -c.z * k); // (centred: it turns about its middle)
    piece.add(g);
    if (d.mount === 'rug') piece.rotation.x = 1.05; // (a rug shows its pattern)
    else if (d.mount === 'wall') piece.rotation.x = -0.25;
    piece.position.y = Math.max(size.y * k / 2, d.mount === 'rug' ? 0.24 : 0.05);
  } else if (SURFACES[id]?.kind === 'wall') {
    const G2 = wallRollGeos();
    piece.add(new THREE.Mesh(G2.paper, surfaceMat(id)), new THREE.Mesh(G2.ribbon, ribbonMat()));
    piece.scale.setScalar(1.25); piece.rotation.x = 0.35; piece.position.y = 0.06;
  } else { piece.add(new THREE.Mesh(floorStackGeo(), surfaceMat(id))); piece.scale.setScalar(1.4); piece.rotation.x = 0.55; piece.position.y = 0.12; }
  piece.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  const glow = glowDisc(); holder.add(glow);
  holder.userData.piece = piece; holder.userData.glow = glow;
  holder.name = 'loot:furniture:' + id;
  return holder;
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
    if (this.disposed) return; // the floor was left while this drop was still in the air
    let mesh, color = '#ffffff', beam = null, label = null;
    if (d.type === 'coins') { mesh = new THREE.Mesh(coinGeo(), makeToon({ vertexColors: true, rim: 0.7, emissive: '#ffb030', emissiveIntensity: 0.25 })); }
    else if (d.type === 'potion') { mesh = new THREE.Mesh(potionGeo(d.key), makeToon({ vertexColors: true, rim: 0.6, emissive: POT_COL[d.key], emissiveIntensity: 0.3 })); }
    else if (d.type === 'material') { mesh = new THREE.Mesh(matGeo(d.key), makeToon({ vertexColors: true, rim: 0.6 })); }
    else if (d.type === 'pantry') { mesh = new THREE.Mesh(pantryGeo(d.key), makeToon({ vertexColors: true, rim: 0.6, emissive: '#fff0c0', emissiveIntensity: 0.15 })); color = '#8fe0a0'; }
    else if (d.type === 'furniture') { const fd = itemDef(d.key); if (!fd) return; mesh = furnitureLoot(d.key); color = FSETS[fd.set]?.color || '#ffcf4a'; label = fd.name; beam = this.G.vfx.pillar(to, { color, persistent: true, r: 0.3, h: 4, opacity: 0.4 }); Events.emit('sfx', 'pickup_rare'); }
    else if (d.type === 'gem') { const gc = d.item?.color || d.item?.icon?.colors?.[0] || '#ff6a8a'; mesh = new THREE.Mesh(gemGeo(), makeToon({ vertexColors: true, color: gc, rim: 0.8, emissive: gc, emissiveIntensity: 0.6 })); color = gc; label = d.item?.name; }
    else if (d.type === 'item') {
      const it = d.item; color = RCOL[it.rarity] || '#ffffff';
      if (it.slot === 'weapon' && it.wtype === 'sword') { const kc = it.icon?.colors?.length ? it.icon.colors : null; mesh = new THREE.Mesh(geo(`lootKatana:${kc || ''}|${katanaVariant()}`, () => katanaGeo({ colors: kc })), makeToon({ vertexColors: true, rim: 0.6, emissive: color, emissiveIntensity: it.rarity === 'normal' ? 0 : 0.25 })); mesh.scale.setScalar(0.7); mesh.rotation.z = Math.PI / 2; }
      else if (it.slot === 'weapon') { mesh = new THREE.Mesh(geo('lootBall', () => { const g = new THREE.SphereGeometry(0.13, 14, 10); g.translate(0, 0.13, 0); return g; }), makeToon({ map: tennisBallTexture(), rim: 0.6, emissive: color, emissiveIntensity: 0.15 })); }
      else { mesh = new THREE.Mesh(bundleGeo(), makeToon({ color, rim: 0.7, emissive: color, emissiveIntensity: 0.2 })); }
      label = it.name;
      if (['rare', 'unique', 'set'].includes(it.rarity)) beam = this.G.vfx.pillar(to, { color, persistent: true, r: 0.28, h: 5, opacity: it.rarity === 'rare' ? 0.35 : 0.6 });
      if (it.rarity === 'unique' || it.rarity === 'set') Events.emit('sfx', 'pickup_rare');
    }
    else if (d.type === 'quest') { mesh = new THREE.Mesh(questGeo(), makeToon({ vertexColors: true, rim: 0.7, emissive: '#ffe08a', emissiveIntensity: 0.3 })); color = '#ffe070'; label = d.label || 'Quest item'; beam = this.G.vfx.pillar(to, { color, persistent: true, r: 0.32, h: 5, opacity: 0.55 }); Events.emit('sfx', 'pickup_rare'); }
    if (!mesh) return;
    mesh.castShadow = true;
    if (mesh.geometry) { const ol = new THREE.Mesh(mesh.geometry, makeOutline('#3a2230', 0.012)); mesh.add(ol); }
    if (INSTANCED_DROPS.has(d.type)) lookIn(this.G.dungeon?.loot === this ? this.G.dungeon : null, mesh, this.world.scene); // (adopted by the floor's Horde, else a scene object; a textured one stays in the scene)
    else this.world.scene.add(mesh);
    const e = { id: uid(), d, mesh, from, to, t: 0, fly: 0.55, beam, color, label, spin: rand(-3, 3) };
    // the label stands on the item itself (not at Chewy's height), so a pile of drops doesn't bury him
    if (label) this.G.ui?.lootLabel?.add?.({ id: e.id, name: label, color, worldPos: to, lift: d.type === 'furniture' ? -0.55 : 0.16, onClick: () => this.tryPickup(e, true) }); // (a find's name sits under it: the piece floats above)
    if (e.beam) e.light = this.world.lightPool.addSource({ pos: to.clone().setY(1), color: new THREE.Color(color), intensity: 3, radius: 3.5 });
    this.list.push(e);
    if (d.type === 'quest') this.G.dungeon?.zr?.onQuestLoot?.(d, e, false); // (the quest pointer finds it on the ground)
    Events.emit('sfx', 'drop_item', { pos: to });
  }
  tryPickup(e, clicked = false) {
    const G = this.G, P = G.player;
    if (!clicked && e.d.type === 'item' && e.d.item.rarity === 'normal' && !G.state.flags?.autoPickNormal) return false;
    if (clicked && dist(P.pos.x, P.pos.z, e.to.x, e.to.z) > 1.8) { P.moveTarget = e.to.clone(); P.pendingLoot = e; return false; }
    const first = e.d.type === 'pantry' ? !(G.state.pantryFound || {})[e.d.key] : e.d.type === 'furniture' ? !(G.state.furnitureFound || {})[e.d.key] && !(G.state.furniture?.[e.d.key] > 0) : false;
    const ok = e.d.type === 'furniture' ? G.actions.addFurniture?.(e.d.key, e.d.n || 1, { src: 'find' }) > 0 : e.d.type === 'quest' ? true : G.actions.pickup(e.d); // (a quest item never enters the bag)
    if (!ok) return false;
    this.remove(e);
    const p = e.to.clone().setY(e.to.y + 0.4);
    if (e.d.type === 'coins') { G.vfx.coins(p, 6); Events.emit('sfx', 'pickup_gold'); this.tally('coin', e.d.n); }
    else if (e.d.type === 'potion') { G.vfx.sparkle(p, { n: 5, color: POT_COL[e.d.key] }); Events.emit('sfx', 'pickup_item'); }
    else if (e.d.type === 'material') { G.vfx.sparkle(p, { n: 4, color: MAT_COL[e.d.key] }); Events.emit('sfx', 'pickup_item'); this.tally(e.d.key, e.d.n); }
    else if (e.d.type === 'pantry') { G.vfx.sparkle(p, { n: 8, color: '#bff0a0' }); Events.emit('sfx', 'pickup_magic'); G.ui?.pantryGain?.(e.d.key, e.d.n || 1, { first, worldPos: p }); }
    else if (e.d.type === 'quest') { // 'quest:find' { item, n, zone, dungeon, floor, tier }: phase D's find steps count it (world/questSteps.js)
      G.vfx.sparkle(p, { n: 18, color: '#ffe070', r: 0.5, rise: 1.2 }); Events.emit('sfx', 'pickup_unique');
      G.ui?.toast?.(`Found: ${e.d.label || e.d.item}`, { icon: 'quest', color: '#ffe070' });
      Events.emit('quest:find', { item: e.d.item, n: e.d.n || 1, ...(e.d.where || {}) });
      G.dungeon?.zr?.onQuestLoot?.(e.d, e, true);
    }
    else if (e.d.type === 'furniture') { G.vfx.sparkle(p, { n: 16, color: e.color, r: 0.5, rise: 1.1 }); Events.emit('sfx', first ? 'pickup_unique' : 'pickup_magic'); G.furnitureGain?.(e.d.key, e.d.n || 1, { first, worldPos: p }); Events.emit('furniture:found', { id: e.d.key, first }); }
    else { G.vfx.sparkle(p, { n: 10, color: e.color }); Events.emit('sfx', ['unique', 'set', 'rare'].includes(e.d.item?.rarity) ? 'pickup_rare' : 'pickup_item'); G.ui?.pickupFly?.(e.d.item, p); }
    return true;
  }
  // coin / material pickups within ~0.5 s share one short line over Chewy's head ("+34 ¢  +1 wood  +2 stone", glyphs)
  // instead of a "+1 WOOD" pop per piece
  tally(key, n) {
    const T = this.picks ||= { t: 0, n: new Map() };
    if (!T.n.size) T.t = 0;
    T.n.set(key, (T.n.get(key) || 0) + (n || 1));
  }
  flushPicks() {
    const T = this.picks, P = this.G.player;
    if (!T?.n.size) return;
    const html = [...T.n].map(([k, n]) => `<span style="color:${k === 'coin' ? '#ffd84a' : MAT_COL[k] || '#fff'}">+${n}</span>${glyph(k)}`).join('<i style="width:6px"></i>');
    T.n.clear();
    if (P) this.G.ui?.float?.(P.pos.clone().setY(P.pos.y + 1.5), '+', { kind: 'pickup', html });
  }
  canTake(d) {
    if (d.type === 'potion') return (this.G.state.potions[d.key] || 0) < (POTION_CAP[d.key] ?? 15);
    return true;
  }
  remove(e) {
    const i = this.list.indexOf(e); if (i >= 0) this.list.splice(i, 1);
    const ud = e.mesh.userData; if (ud.lookH) { if (!ud.lookH.disposed && ud.lookModel?.slots) ud.lookH.release(ud.lookModel); ud.lookH = null; } // (off the Horde's batches)
    e.mesh.parent?.remove(e.mesh);
    if (e.beam) { e.beam.alive = false; }
    if (e.light) this.world.lightPool.removeSource(e.light);
    if (e.label) this.G.ui?.lootLabel?.remove?.(e.id);
  }
  update(dt) {
    const G = this.G, P = G.player;
    if (this.picks?.n.size && (this.picks.t += dt) >= 0.5) this.flushPicks();
    if (G.ui?.labels) G.ui.labels.avoid = P && !G.playerDead ? P.pos : null; // loot labels keep clear of Chewy
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
        if (e.d.type === 'furniture') { // a find floats over its glow, turning slowly, with sparkles
          const h = Math.min(1, (e.t - e.fly) * 2), U = e.mesh.userData, lift = h * (0.32 + Math.sin(e.t * 2.4) * 0.07);
          U.piece.position.y = (U.py ??= U.piece.position.y) + lift; U.glow.position.y = 0.03 - (e.mesh.position.y - e.to.y);
          U.glow.scale.setScalar(0.85 + 0.15 * Math.sin(e.t * 2.4 + 1)); e.mesh.rotation.y += dt * 0.8;
          if (Math.random() < dt * 3) G.vfx.sparkle(e.mesh.position.clone().setY(e.mesh.position.y + lift + 0.3), { n: 1, color: Math.random() < 0.5 ? e.color : '#fff6c0', r: 0.35, size: 0.22 });
        }
        if (!P || G.playerDead) continue;
        const d = dist(P.pos.x, P.pos.z, e.to.x, e.to.z);
        const auto = e.d.type !== 'item' && e.d.type !== 'gem';
        if (auto && d < 2.2 && !(e.refusedUntil > e.t) && this.canTake(e.d)) { // magnet (only for loot Chewy can actually take) (pauses after a refused pickup, e.g. full belt)
          e.to.lerp(P.pos, Math.min(1, dt * 8));
          if (d < 0.5 && !this.tryPickup(e)) { e.refusedUntil = e.t + 4; e.refusedPos = P.pos.clone(); }
        } else if (e.refusedUntil > e.t && e.refusedPos && P.pos.distanceTo(e.refusedPos) > 2.5) e.refusedUntil = 0; else if (!auto && d < 0.6 && !e.triedAuto) { e.triedAuto = true; if (!this.tryPickup(e)) e.triedAuto = true; }
        else if (d > 1.2) e.triedAuto = false;
        if (P.pendingLoot === e && d < 1.3) { P.pendingLoot = null; this.tryPickup(e, true); }
      }
    }
  }
  clear() { this.disposed = true; this.picks?.n.clear(); for (const e of [...this.list]) this.remove(e); }
}
