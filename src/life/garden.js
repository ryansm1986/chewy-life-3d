// Farming: cozy garden plots (docs/HOMESTEAD.md §2). Chewy's 4×3 raised bed (layout.CHEWY_GARDEN, from day one) and
// the tilled fields of every built Veggie Patch plot (details.fieldTiles) are player tiles:
//   wild → till (hoe) → plant (seed picker) → water (can) → one stage per new day if watered → ripe → harvest.
// A dry day only pauses growth; nothing ever dies. Strawberries step back `regrow` days after a harvest.
// Sprinklers (a rank-3 Build-mode decoration) water the 8 tiles round them every morning.
//
// State (household, lazy-init): state.garden = { v, tiles: [{ x, z, till?, crop?, stage?, wet? }], day, seeded:{plot},
// lastSeed }. A record exists only for a touched tile; field tiles are tilled by default, the home bed's are wild.
// Rendering: one BatchedMesh each for the soil mounds, the crops' bodies and their leaves (wind-swayed, bent by
// Chewy), with one fixed instance slot per tile. ONE interactable serves every bed: its position follows the tile in
// front of (or under) the player, so village interactables stay stable across round trips (s1).
import * as THREE from 'three';
import { Events } from '../core/events.js';
import { vegToon } from '../world/vegetation.js';
import { applyDepth } from '../gfx/materials.js';
import { Builder, instantiate, MATS } from '../world/buildings/kit.js';
import { WORLD, T, CHEWY_GARDEN } from '../world/layout.js';
import { PLOTS } from '../world/plots.js';
import { CROPS, CROP_IDS, PANTRY, seedFor } from './pantry.js';
import { growNight, harvestCrop, SPRINKLE } from './gardenRules.js';
import { cropGeo, soilGeo, bedFrameGeo, tileCursorGeo, vstage, STAGES, BED_EDGE } from './gardenModels.js';
import { pantryIcon } from './pantryIcons.js';

export const gardenState = st => { const g = st.garden ||= { v: 1, tiles: [], day: st.day || 1 }; g.tiles ||= []; g.seeded ||= {}; return g; };
const key = (x, z) => z * WORLD + x;
const WET = new THREE.Color(0.6, 0.52, 0.56), DRY = new THREE.Color(1, 1, 1);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1), _p = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);

// ------------------------------------------------------------------ rendering
let MATS_G = null;
function gardenMats() {
  if (MATS_G) return MATS_G;
  MATS_G = {
    soil: vegToon({ vertexColors: true, brush: 0.32, brushScale: 0.9, rim: 0.12, term: [-0.05, 0.4], shadowSat: 0.3 }),
    body: vegToon({ vertexColors: true, brush: 0.14, brushScale: 0.6, rim: 0.42, term: [-0.08, 0.34], shadowSat: 0.35 }),
    leaf: vegToon({ vertexColors: true, wind: 'grass', windAmt: 0.32, brush: 0.2, brushScale: 0.8, rim: 0.5, shadowSat: 0.45, term: [-0.15, 0.4] }),
  };
  return MATS_G;
}
/** Instanced garden drawing: soil, crop bodies, crop leaves; one instance slot per tile. */
export class GardenView {
  constructor(scene, n) {
    const M = gardenMats(), soil = soilGeo();
    const all = CROP_IDS.flatMap(c => STAGES.map(s => ({ c, s, ...cropGeo(c, s) })));
    const vb = all.reduce((a, e) => a + (e.body?.attributes.position.count || 0), 0), vl = all.reduce((a, e) => a + (e.leaf?.attributes.position.count || 0), 0);
    const mk = (geoVerts, mat, cast) => { const bm = new THREE.BatchedMesh(Math.max(1, n), geoVerts, 1, mat); bm.castShadow = cast; bm.receiveShadow = true; bm.frustumCulled = false; bm.perObjectFrustumCulled = true; bm.sortObjects = false; applyDepth(bm); return bm; };
    this.soil = mk(soil.attributes.position.count, M.soil, false); this.soil.name = 'garden:soil';
    this.body = mk(vb, M.body, true); this.body.name = 'garden:crops';
    this.leaf = mk(vl, M.leaf, true); this.leaf.name = 'garden:leaves';
    const soilId = this.soil.addGeometry(soil);
    this.ids = new Map();
    for (const e of all) this.ids.set(e.c + ':' + e.s, { body: e.body ? this.body.addGeometry(e.body) : -1, leaf: e.leaf ? this.leaf.addGeometry(e.leaf) : -1 });
    const anyB = [...this.ids.values()].find(v => v.body >= 0).body, anyL = [...this.ids.values()].find(v => v.leaf >= 0).leaf;
    this.slots = [];
    for (let i = 0; i < n; i++) {
      const s = { soil: this.soil.addInstance(soilId), body: this.body.addInstance(anyB), leaf: this.leaf.addInstance(anyL), key: null };
      for (const [bm, id] of [[this.soil, s.soil], [this.body, s.body], [this.leaf, s.leaf]]) bm.setVisibleAt(id, false);
      this.slots.push(s);
    }
    this.group = new THREE.Group(); this.group.name = 'garden';
    this.group.add(this.soil, this.body, this.leaf);
    scene.add(this.group);
  }
  /** Place slot i at (x, y, z) with yaw rot; soil: show the mound; wet: darken it; crop/stage: the plant ('' = none). */
  set(i, x, y, z, rot, { soil = false, wet = false, crop = null, stage = null } = {}) {
    const s = this.slots[i]; if (!s) return;
    _q.setFromAxisAngle(UP, rot); _m.compose(_p.set(x, y, z), _q, _s);
    this.soil.setMatrixAt(s.soil, _m); this.soil.setVisibleAt(s.soil, soil); this.soil.setColorAt(s.soil, wet ? WET : DRY);
    _m.compose(_p.set(x, y + (soil ? 0.085 : 0.01), z), _q, _s);
    const ids = crop ? this.ids.get(crop + ':' + stage) : null;
    if (ids && ids.body >= 0) { this.body.setGeometryIdAt(s.body, ids.body); this.body.setMatrixAt(s.body, _m); this.body.setVisibleAt(s.body, true); } else this.body.setVisibleAt(s.body, false);
    if (ids && ids.leaf >= 0) { this.leaf.setGeometryIdAt(s.leaf, ids.leaf); this.leaf.setMatrixAt(s.leaf, _m); this.leaf.setVisibleAt(s.leaf, true); } else this.leaf.setVisibleAt(s.leaf, false);
  }
}

// ------------------------------------------------------------------ the garden
export class Garden {
  constructor(G, world, tools) {
    this.G = G; this.world = world; this.tools = tools;
    this.beds = []; this.tiles = new Map(); // tile index -> { bed, slot, x, z }
    // Chewy's bed
    const H = CHEWY_GARDEN, home = { id: 'home', kind: 'home', tiles: [], active: true, cx: H.x + H.w / 2, cz: H.z + H.d / 2 };
    for (let z = H.z; z < H.z + H.d; z++) for (let x = H.x; x < H.x + H.w; x++) home.tiles.push(key(x, z));
    this.beds.push(home);
    // the farm fields (their tiles come from details.js plot yards)
    for (const p of PLOTS) {
      if (!p.field || !p.allows.includes('farm')) continue;
      const tiles = world.details?.fieldTiles?.(p.id) || [];
      if (tiles.length) this.beds.push({ id: p.id, kind: 'field', plot: p.id, tiles, active: false });
    }
    let slot = 0;
    for (const b of this.beds) for (const i of b.tiles) this.tiles.set(i, { bed: b, slot: slot++, x: i % WORLD, z: Math.floor(i / WORLD), rot: ((i * 2654435761) >>> 0) % 4 * Math.PI / 2 });
    this.view = new GardenView(world.scene, slot);
    this.buildBed();
    // the one interactable (s1: stable count); label / pos follow the targeted tile
    const self = this;
    this.inter = { pos: new THREE.Vector3(-999, -50, -999), radius: 0.9, garden: true, get label() { return self.label(); }, onInteract: () => self.interact() };
    world.interactables.push(this.inter);
    this.cursor = new THREE.Mesh(tileCursorGeo(), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.0, depthWrite: false, toneMapped: false }));
    this.cursor.renderOrder = 6; this.cursor.visible = false; world.scene.add(this.cursor);
    this.target = null; this.fxT = 0; this.seenHint = false;
    // (re)load: rebuild the index from the save and sync everything
    this.load();
    Events.on('village:changed', () => this.syncBeds());
  }
  get S() { return gardenState(this.G.state); }
  // ---------------------------------------------------------------- state
  load() {
    this.recs = new Map();
    for (const r of this.S.tiles) if (this.tiles.has(key(r.x, r.z))) this.recs.set(key(r.x, r.z), r);
    this.syncBeds(true);
  }
  rec(i) { return this.recs.get(i) || null; }
  ensure(i) {
    let r = this.recs.get(i); if (r) return r;
    const t = this.tiles.get(i); r = { x: t.x, z: t.z };
    this.recs.set(i, r); this.S.tiles.push(r);
    return r;
  }
  drop(i) { const r = this.recs.get(i); if (!r) return; this.recs.delete(i); const a = this.S.tiles, k = a.indexOf(r); if (k >= 0) a.splice(k, 1); }
  tilled(i) { const t = this.tiles.get(i), r = this.rec(i); return t.bed.kind === 'field' || !!r?.till; }
  blocked(i) { const sim = this.G.sim; return !!sim && sim.occ?.[i] >= 0; }
  usable(i) { const t = this.tiles.get(i); return !!t && t.bed.active && !this.blocked(i); }
  /** Bed activity (a farm plot holds a Veggie Patch), terrain paint for the home bed, every tile's drawing. */
  syncBeds(force = false) {
    const sim = this.G.sim;
    for (const b of this.beds) {
      if (b.kind !== 'field') continue;
      const on = !!sim && sim.plotUse?.get(b.plot)?.type === 'farm';
      if (on !== b.active || force) { b.active = on; if (on) this.seedField(b); }
    }
    this.paintHome();
    for (const i of this.tiles.keys()) this.draw(i);
    this.sprinklers = sim?.S?.buildings?.filter(b => b.type === 'sprinkler') || [];
  }
  // the home bed's tilled tiles are painted FIELD on the terrain (soil, no grass blades); wild ones stay lawn
  paintHome() {
    const tr = this.world.terrain; if (!tr) return;
    let ch = false;
    for (const i of this.beds[0].tiles) { const want = this.rec(i)?.till ? T.FIELD : T.GRASS; if (tr.tiles[i] !== want) { tr.tiles[i] = want; ch = true; } }
    if (ch) { if (this.G.sim?.refreshTiles) this.G.sim.refreshTiles(); else tr.syncTiles(); }
  }
  // a field the first time it's farmed: the farmers left a few rows growing (a lived-in look and a first harvest)
  seedField(b) {
    const S = this.S; if (S.seeded[b.plot]) return;
    S.seeded[b.plot] = true;
    let r = (b.tiles.length * 7919 + b.plot.length * 31) >>> 0; const rnd = () => ((r = (r * 1664525 + 1013904223) >>> 0) / 4294967296);
    const pool = ['turnip', 'cabbage', 'carrot', 'turnip', 'cabbage'];
    b.tiles.forEach((i, k) => {
      if (rnd() > 0.38 || this.blocked(i)) return;
      const c = pool[Math.floor(rnd() * pool.length)], rec = this.ensure(i);
      rec.crop = c; rec.stage = Math.min(CROPS[c].days, Math.floor(rnd() * (CROPS[c].days + 1))); rec.wet = rnd() < 0.5;
    });
  }
  draw(i) {
    const t = this.tiles.get(i); if (!t) return;
    const r = this.rec(i), on = t.bed.active && !this.blocked(i);
    const x = t.x + 0.5, z = t.z + 0.5, y = this.world.heightAt(x, z);
    const soil = on && (t.bed.kind === 'field' || !!r?.till);
    this.view.set(t.slot, x, y, z, t.rot, { soil, wet: soil && !!r?.wet, crop: on && r?.crop ? r.crop : null, stage: r?.crop ? vstage(r.crop, r.stage || 0) : null });
  }
  // ---------------------------------------------------------------- the home bed's frame and sign
  buildBed() {
    const H = CHEWY_GARDEN, g = bedFrameGeo(H.w, H.d);
    const m = new THREE.Mesh(g.body, MATS().body); m.castShadow = true; m.receiveShadow = true;
    const cx = H.x + H.w / 2, cz = H.z + H.d / 2;
    m.position.set(cx, this.world.heightAt(cx, cz), cz); m.name = 'garden:bed';
    this.world.scene.add(m); this.bedMesh = m;
    // the corner posts and the sign are solid; the ankle-high edging between them is stepped over
    const hw = H.w / 2 - BED_EDGE / 2, hd = H.d / 2 - BED_EDGE / 2, col = this.world.collision;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) col?.addCircle(cx + sx * hw, cz + sz * hd, 0.16, 'garden');
    col?.addCircle(cx - hw - 0.05, cz + hd + 0.3, 0.2, 'garden');
    this.world.veg?.clearRect?.(H.x - 0.1, H.z - 0.1, H.x + H.w + 0.1, H.z + H.d + 0.1, 0);
    // the untended bed: thinner, shorter grass than the lawn round it (terrain.wear), soil once tilled (paintHome)
    const W = this.world.terrain?.wear;
    if (W) { for (const i of this.beds[0].tiles) W[i] = Math.max(W[i], 150); if (this.G.sim?.refreshTiles) this.G.sim.refreshTiles(); else this.world.terrain.syncTiles(); }
  }
  // ---------------------------------------------------------------- targeting + interaction
  /** The tile the player would work on: the one in front, else the one underfoot, else the nearest within reach. */
  pick() {
    const P = this.G.player; if (!P) return null;
    const fx = Math.sin(P.facing), fz = Math.cos(P.facing);
    for (const d of [0.75, 0.0]) {
      const i = key(Math.floor(P.pos.x + fx * d), Math.floor(P.pos.z + fz * d));
      if (this.tiles.has(i) && this.usable(i)) return i;
    }
    let best = null, bd = 1.25;
    for (const dz of [-1, 0, 1]) for (const dx of [-1, 0, 1]) {
      const x = Math.floor(P.pos.x) + dx, z = Math.floor(P.pos.z) + dz, i = key(x, z);
      if (!this.tiles.has(i) || !this.usable(i)) continue;
      const d = Math.hypot(x + 0.5 - P.pos.x, z + 0.5 - P.pos.z);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  /** What F would do on tile i: { verb, text, color } */
  actionAt(i) {
    const r = this.rec(i);
    if (!this.tilled(i)) return { verb: 'till', text: 'Till the soil', color: '#c98f5e' };
    if (!r?.crop) return { verb: 'plant', text: this.seedsHeld().length ? 'Plant seeds' : 'Plant seeds (no seeds yet)', color: '#8fe0a0' };
    const C = CROPS[r.crop], name = PANTRY[r.crop].name;
    if ((r.stage || 0) >= C.days) return { verb: 'harvest', text: `Harvest ${name}!`, color: '#ffd84a' };
    if (!r.wet) return { verb: 'water', text: `Water the ${name.toLowerCase()}`, color: '#8fd0ff' };
    const left = C.days - (r.stage || 0);
    return { verb: 'look', text: `${name} · ${left === 1 ? 'ripe tomorrow' : `${left} days to go`} ♪`, color: '#c8f0b0' };
  }
  label() { return this.target != null ? this.actionAt(this.target).text : null; }
  seedsHeld() { const p = this.G.state.pantry || {}; return Object.keys(p).filter(id => PANTRY[id]?.kind === 'seed' && p[id] > 0); }
  interact() {
    const i = this.target; if (i == null || this.tools.busy) return;
    const a = this.actionAt(i);
    if (a.verb === 'till') return this.till(i);
    if (a.verb === 'plant') return this.askSeed(i);
    if (a.verb === 'water') return this.water(i);
    if (a.verb === 'harvest') return this.harvest(i);
    // growing and already watered: a happy little look
    const P = this.G.player; P.faceTo(this.tiles.get(i).x + 0.5, this.tiles.get(i).z + 0.5); P.anim.play('nod');
  }
  centre(i) { const t = this.tiles.get(i); return { x: t.x + 0.5, z: t.z + 0.5, y: this.world.heightAt(t.x + 0.5, t.z + 0.5) }; }
  // ---------------------------------------------------------------- the chores
  till(i) {
    const c = this.centre(i), G = this.G;
    this.tools.run({ prop: 'hoe', pose: 'till', dur: 1.1, at: 0.94, face: c,
      onEvent: ev => { if (ev === 'chop' || ev === 'chop2') { G.vfx?.dust?.(new THREE.Vector3(c.x, c.y + 0.1, c.z), { n: 5, color: '#a87858', size: 0.3 }); Events.emit('sfx', 'hoe_chop', { vol: 0.7 }); } },
      onAct: () => {
        this.ensure(i).till = true; this.paintHome(); this.draw(i);
        G.vfx?.dust?.(new THREE.Vector3(c.x, c.y + 0.12, c.z), { n: 8, color: '#8a5e44', size: 0.32 });
        Events.emit('garden:till', { i });
      } });
  }
  askSeed(i) {
    const seeds = this.seedsHeld(), G = this.G;
    if (!seeds.length) {
      G.ui?.toast?.("No seeds! Usagi's Seed Stall in the South Meadows sells them.", { iconURL: pantryIcon('turnipSeed'), color: '#8fe0a0' });
      Events.emit('sfx', 'ui_error'); return;
    }
    const S = this.S;
    if (seeds.length === 1 || !G.ui?.open) return this.plant(i, seeds[0]);
    G.ui.open('seeds', { seeds, last: seeds.includes(S.lastSeed) ? S.lastSeed : seeds[0], onPick: id => { G.input?.consume?.('f'); G.interactCooldown = performance.now() + 250; this.plant(i, id); } });
  }
  plant(i, seedId) {
    const d = PANTRY[seedId], G = this.G; if (!d?.crop || !this.usable(i) || this.rec(i)?.crop) return false;
    if (!G.actions.hasPantry({ [seedId]: 1 })) return false;
    const c = this.centre(i);
    this.S.lastSeed = seedId;
    this.tools.run({ prop: 'bag', pose: 'pickup', dur: 0.62, at: 0.3, face: c,
      onAct: () => {
        if (this.rec(i)?.crop || !G.actions.spendPantry({ [seedId]: 1 }, { quiet: true, src: 'plant' })) return;
        const r = this.ensure(i); r.till = true; r.crop = d.crop; r.stage = 0; r.wet = false; r.planted = G.day?.day || 1;
        this.draw(i);
        const col = CROPS[d.crop].color;
        for (let k = 0; k < 5; k++) G.vfx?.dot?.spawn({ x: c.x + (Math.random() - 0.5) * 0.3, y: c.y + 0.45, z: c.z + (Math.random() - 0.5) * 0.3, vx: 0, vz: 0, vy: -0.5, grav: 6, life: 0.4, size: 0.06, color: '#e8d4a0', alpha: 1, alpha1: 0.4 });
        G.vfx?.sparkle?.(new THREE.Vector3(c.x, c.y + 0.25, c.z), { n: 4, color: col, r: 0.3, rise: 0.4 });
        Events.emit('sfx', 'seed_sow', { vol: 0.7 });
        Events.emit('garden:plant', { i, crop: d.crop });
      } });
    return true;
  }
  water(i) {
    const c = this.centre(i), G = this.G;
    if (!this.tools.run({ prop: 'can', pose: 'water', dur: 1.15, at: 0.6, face: c, hold: true,
      onAct: () => {
        const r = this.ensure(i); r.wet = true; this.draw(i);
        G.vfx?.sparkle?.(new THREE.Vector3(c.x, c.y + 0.15, c.z), { n: 4, color: '#bfeaff', r: 0.35, rise: 0.3 });
        Events.emit('garden:water', { i });
      } })) return;
    Events.emit('sfx', 'water_pour', { vol: 0.6 });
  }
  harvest(i) {
    const c = this.centre(i), G = this.G, r = this.rec(i); if (!r?.crop) return;
    const crop = r.crop;
    this.tools.run({ prop: null, pose: 'pickup', dur: 0.55, at: 0.22, face: c,
      onAct: () => {
        if (this.rec(i)?.crop !== crop) return;
        const C = CROPS[crop], n = harvestCrop(r); // (strawberries step back and keep fruiting)
        this.draw(i);
        G.vfx?.sparkle?.(new THREE.Vector3(c.x, c.y + 0.4, c.z), { n: 10, color: C.color, r: 0.45, rise: 0.8 });
        Events.emit('sfx', 'harvest_pop', { vol: 0.7 });
        this.popOut(crop, c, n);
        Events.emit('garden:harvest', { i, crop, n });
      } });
  }
  /** The crop hops out of the ground, arcs over the player and lands in the pantry. */
  popOut(id, c, n) {
    const G = this.G, P = G.player;
    const tex = this.texFor(id), sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
    sp.renderOrder = 30; sp.scale.setScalar(0.55); sp.position.set(c.x, c.y + 0.2, c.z);
    G.vfx.add(sp, (dt, t) => {
      const k = Math.min(1, t / 0.5);
      const tx = P.pos.x, ty = P.pos.y + 1.55, tz = P.pos.z;
      if (t < 0.5) { sp.position.set(c.x + (tx - c.x) * k, c.y + 0.2 + (ty - c.y - 0.2) * k + Math.sin(k * Math.PI) * 0.9, c.z + (tz - c.z) * k); sp.scale.setScalar(0.4 + 0.35 * Math.sin(k * Math.PI * 0.5)); }
      else { sp.position.set(tx, ty + Math.sin((t - 0.5) * 7) * 0.05, tz); sp.scale.setScalar(0.75 - Math.max(0, t - 0.95) * 2.5); }
      sp.material.opacity = 1 - Math.max(0, (t - 1.0) / 0.25);
      if (t >= 1.25) { sp.material.dispose(); return false; }
      return true;
    }, 1.3);
    setTimeout(() => {
      const first = !(G.state.pantryFound || {})[id];
      G.actions.addPantry(id, n, { src: 'harvest' });
      G.ui?.pantryGain?.(id, n, { first, worldPos: P.pos.clone().setY(P.pos.y + 1.5) });
    }, 550);
  }
  texFor(id) {
    const T0 = this.texCache ||= new Map();
    let t = T0.get(id); if (t) return t;
    t = new THREE.TextureLoader().load(pantryIcon(id)); t.colorSpace = THREE.SRGBColorSpace;
    T0.set(id, t); return t;
  }
  // ---------------------------------------------------------------- the day
  /** A new day (VillageSim.onNewDay, or a nap): watered crops grow a stage, the soil dries, sprinklers water. */
  onNewDay(day) {
    const S = this.S;
    if (S.day === day) return null;
    S.day = day;
    let grew = 0, ripe = 0, thirsty = 0;
    for (const [i, r] of this.recs) {
      const t = this.tiles.get(i);
      if (!r.crop || !t?.bed.active) { r.wet = false; continue; }
      const g = growNight(r); // (gardenRules.js: a watered crop grows a stage, a dry one waits, the soil dries)
      if (g.step === 'grew') grew++; else if (g.step === 'thirsty') thirsty++;
      if (g.ripe) ripe++;
    }
    this.sprinkle();
    for (const i of this.tiles.keys()) this.draw(i);
    const out = { grew, ripe, thirsty };
    if (grew || ripe) setTimeout(() => this.G.ui?.toast?.(`Your garden grew overnight! ${ripe ? `${ripe} ${ripe === 1 ? 'crop is' : 'crops are'} ready to harvest.` : `${grew} ${grew === 1 ? 'plant' : 'plants'} grew.`}`, { iconURL: pantryIcon(ripe ? 'carrot' : 'turnipSeed'), color: '#8fe0a0' }), 3200);
    Events.emit('garden:newDay', out);
    return out;
  }
  /** Every sprinkler wets the 8 tiles round it. */
  sprinkle() {
    const list = this.G.sim?.S?.buildings?.filter(b => b.type === 'sprinkler') || [];
    for (const b of list) for (const [dx, dz] of SPRINKLE) {
      const i = key(b.x + dx, b.z + dz);
      if (this.tiles.has(i) && this.usable(i) && this.tilled(i)) this.ensure(i).wet = true;
    }
  }
  /** Chewy's bed sits by the cottage door: walking up to the door (facing it) means the door, not the corner tile */
  facingDoor() {
    const P = this.G.player, d = this.G.heroes?.homeDoor?.(); if (!d || !P) return false;
    const dx = d.x - P.pos.x, dz = d.z - P.pos.z, l = Math.hypot(dx, dz);
    return l < 1.9 && (l < 0.5 || (Math.sin(P.facing) * dx + Math.cos(P.facing) * dz) / l > 0.5);
  }
  // ---------------------------------------------------------------- per frame
  update(dt) {
    const G = this.G, P = G.player;
    this.tools.update(dt);
    const quiet = G.mode !== 'village' || G.titleActive || G.ui?.anyModal?.() || P?.controlLocked || G.build?.active;
    const t = quiet || this.tools.busy || this.facingDoor() ? null : this.pick();
    this.target = t;
    if (t != null) { const c = this.centre(t); this.inter.pos.set(c.x, c.y, c.z); }
    else this.inter.pos.set(-999, -50, -999);
    // the tile cursor: a soft rounded square in the action's colour
    const cu = this.cursor;
    if (t != null) {
      const c = this.centre(t), a = this.actionAt(t), soil = this.tilled(t);
      cu.position.set(c.x, c.y + (soil ? 0.14 : 0.05), c.z); cu.material.color.set(a.color);
      cu.material.opacity = 0.55 + 0.15 * Math.sin(G.engine.time * 5); cu.visible = true;
    } else cu.visible = false;
    // ripe crops twinkle now and then (near the player only)
    this.fxT -= dt;
    if (this.fxT <= 0 && G.mode === 'village' && P) {
      this.fxT = 0.45;
      const near = [];
      for (const [i, r] of this.recs) if (r.crop && (r.stage || 0) >= CROPS[r.crop].days && this.usable(i)) { const tt = this.tiles.get(i); if (Math.abs(tt.x - P.pos.x) < 26 && Math.abs(tt.z - P.pos.z) < 26) near.push(i); }
      if (near.length) { const i = near[Math.floor(Math.random() * near.length)], c = this.centre(i); G.vfx?.sparkle?.(new THREE.Vector3(c.x + (Math.random() - 0.5) * 0.4, c.y + 0.35, c.z + (Math.random() - 0.5) * 0.4), { n: 2, color: '#fff6c0', r: 0.25, rise: 0.5, size: 0.22 }); }
    }
    // mornings: the sprinklers spin and spray (they watered the tiles round them at dawn)
    const hr = G.day?.hour ?? 12;
    if (this.sprinklers?.length && hr >= 6 && hr < 9.5 && G.mode === 'village' && P && G.vfx?.dot) {
      this.sprT = (this.sprT || 0) - dt;
      if (this.sprT <= 0) {
        this.sprT = 0.05;
        for (const b of this.sprinklers) {
          const x = b.x + 0.5, z = b.z + 0.5; if (Math.abs(x - P.pos.x) > 24 || Math.abs(z - P.pos.z) > 24) continue;
          const y = this.world.heightAt(x, z) + 0.62;
          for (let k = 0; k < 3; k++) { const a = G.engine.time * 3 + k * 2.094; G.vfx.dot.spawn({ x: x + Math.cos(a) * 0.21, y, z: z - Math.sin(a) * 0.21, vx: Math.cos(a) * 1.5, vz: -Math.sin(a) * 1.5, vy: 1.4, grav: 7, life: 0.55, size: 0.06, color: '#c8ecff', alpha: 0.85, alpha1: 0.2 }); }
        }
      }
    }
    // a one-off tip from Shadow the first time Chewy is near his garden bed
    if (!this.seenHint && P && G.mode === 'village' && !G.titleActive) {
      const B = this.beds[0];
      if (Math.hypot(P.pos.x - B.cx, P.pos.z - B.cz) < 5) { this.seenHint = true; G.hint?.('garden', "*Yip!* Your garden bed! Press F to till it — Usagi sells seeds in the South Meadows."); }
    }
  }
}
