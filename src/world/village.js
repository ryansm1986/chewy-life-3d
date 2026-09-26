// SimCity-style village simulation: placement, zoning (R/C/W), road access, service coverage, RCI demand,
// organic growth & level-ups, residents, daily income. Renders buildings via the buildings kit.
import * as THREE from 'three';
import { BUILDINGS, buildModel, setNight, sizeOf, bridgeDeckHeight } from './buildings/index.js';
import { T, WORLD } from './terrain.js';
import { LANDMARKS } from './layout.js';
import { Events } from '../core/events.js';
import { uid, rand, randInt, clamp, ease, mulberry32, pick } from '../core/util.js';

export const ZONES = { R: 1, C: 2, W: 3 };
export const ZONE_COLORS = { 1: [120, 220, 120], 2: [110, 170, 255], 3: [255, 196, 90] };
export const COVER_KINDS = ['water', 'light', 'joy', 'health', 'learn'];
const COVER_COLORS = { water: [90, 170, 255], light: [255, 220, 110], joy: [255, 130, 190], health: [120, 230, 160], learn: [180, 140, 255] };

export class VillageSim {
  constructor(G, world) {
    this.G = G; this.world = world; this.terrain = world.terrain;
    this.occ = new Int32Array(WORLD * WORLD).fill(-1); // building index per tile
    this.zone = new Uint8Array(WORLD * WORLD);
    this.cover = Object.fromEntries(COVER_KINDS.map(k => [k, new Float32Array(WORLD * WORLD)]));
    this.list = []; // runtime building records {data, model, group, colRect, lights[]}
    this.group = new THREE.Group(); this.group.name = 'buildings'; world.scene.add(this.group);
    this.tickT = 0; this.nightVal = -1;
    this.demand = { R: 0.4, C: 0.2, W: 0.2 };
    this.stats = { population: 0, jobs: 0, happiness: 0.5, homes: 0, shops: 0, workshops: 0, rank: 1 };
    this.overlayMode = null;
    this.rising = [];
  }
  get S() { return this.G.state.village; }
  // ------------------------------------------------------------------ setup / persistence
  init() {
    const V = this.G.state.village;
    if (!V.buildings) {
      V.buildings = []; V.zones = []; V.paths = []; V.day = 1; V.income = [];
      this.seedStarterVillage();
    } else {
      for (const p of V.paths || []) { this.terrain.tiles[p[1] * WORLD + p[0]] = T.PATH; this.world.veg.clearRect(p[0], p[1], p[0] + 1, p[1] + 1, 0.1); }
      for (const [x, z, t] of V.zones || []) this.zone[z * WORLD + x] = t;
      for (const b of V.buildings) this.spawnModel(b, false);
    }
    this.refreshTiles();
    this.simulate(true);
    this.paintOverlay();
  }
  seedStarterVillage() {
    const L = LANDMARKS;
    const pre = (type, lm, rot) => this.place(type, Math.round(lm.x - (rot % 2 ? sizeOf(type)[1] : sizeOf(type)[0]) / 2), Math.round(lm.z - (rot % 2 ? sizeOf(type)[0] : sizeOf(type)[1]) / 2), rot, { free: true, silent: true, force: true });
    pre('townHall', L.townHall, 0);
    pre('chewyHouse', L.chewyHouse, 1);
    pre('rosieShop', L.rosieShop, 3);
    pre('dungeonGate', { x: L.dungeon.x, z: L.dungeon.z - 0.5 }, 0);
    this.place('fountain', 55, 59, 0, { free: true, silent: true, force: true });
    this.place('bridge', 28, 57, 1, { free: true, silent: true, force: true });
    // a lived-in starter neighbourhood around the plaza (auto-sited on real lots with path access)
    const P = LANDMARKS.plaza;
    for (const [t, n, r0, r1] of [['home', 6, 8, 17], ['shop', 3, 7, 14], ['well', 2, 5, 12], ['park', 1, 9, 16], ['farm', 1, 12, 22], ['lumber', 1, 13, 24]]) for (let i = 0; i < n; i++) this.autoPlace(t, P.x, P.z, r0, r1);
    for (const [dx, dz] of [[-4.6, -3.8], [4.6, -3.8], [-4.6, 3.8], [4.6, 3.8]]) this.place('stoneLantern', Math.floor(P.x + dx), Math.floor(P.z + dz), 0, { free: true, silent: true });
    for (const [t, dx, dz] of [['sakuraPlanter', -3, -2], ['sakuraPlanter', 3, -2], ['bench', -2, 3], ['bench', 2, 3], ['flowerBed', -1, -3], ['flowerBed', 1, -3], ['bulletinBoard', 0, -4]]) this.place(t, Math.floor(P.x + dx), Math.floor(P.z + dz), 0, { free: true, silent: true });
    for (let i = 0; i < 5; i++) this.autoPlace('streetLamp', P.x, P.z, 6, 20, true);
    for (let i = 0; i < 4; i++) this.autoPlace('flowerBed', P.x, P.z, 6, 16, true);
    // zones waiting to grow (beside paths)
    this.autoZone(ZONES.R, 4, 9, 24, 4); this.autoZone(ZONES.C, 2, 8, 20, 4); this.autoZone(ZONES.W, 2, 14, 28, 4);
    // homes start inhabited
    for (const b of this.S.buildings) if (BUILDINGS[b.type].cat === 'home') b.residents = BUILDINGS[b.type].capacity[b.level - 1];
  }
  // ------------------------------------------------------------------ queries
  dims(type, rot, level = 1) { const [w, d] = sizeOf(type, level); return rot % 2 ? [d, w] : [w, d]; }
  canPlace(type, x0, z0, rot, level = 1, ignore = -1) {
    const [w, d] = this.dims(type, rot, level); const tr = this.terrain;
    let hMin = 1e9, hMax = -1e9;
    for (let z = z0; z < z0 + d; z++) for (let x = x0; x < x0 + w; x++) {
      if (x < 3 || z < 3 || x >= WORLD - 3 || z >= WORLD - 3) return { ok: false, why: 'Too close to the edge' };
      const i = z * WORLD + x;
      if (this.occ[i] >= 0 && this.occ[i] !== ignore) return { ok: false, why: 'Something is already here' };
      const t = tr.tiles[i];
      if (type !== 'bridge' && (t === T.WATER || t === T.SAND)) return { ok: false, why: 'Too wet!' };
      if (t === T.ROCK) return { ok: false, why: 'Too rocky' };
      if (t === T.PATH && BUILDINGS[type].cat !== 'decor' && BUILDINGS[type].cat !== 'service') return { ok: false, why: 'Keep the paths clear' };
      if (t === T.PLAZA && !['fountain', 'bench', 'flowerBed', 'sakuraPlanter', 'stoneLantern', 'streetLamp', 'bulletinBoard', 'koiStatue', 'chewyStatue', 'lanternString'].includes(type)) return { ok: false, why: 'The plaza is for decorations' };
      const h = tr.heightAt(x + 0.5, z + 0.5); hMin = Math.min(hMin, h); hMax = Math.max(hMax, h);
    }
    if (type !== 'bridge' && hMax - hMin > 0.7) return { ok: false, why: 'Ground is too bumpy' };
    return { ok: true };
  }
  roadAccess(b) {
    const [w, d] = this.dims(b.type, b.rot, b.level);
    for (let z = b.z - 1; z <= b.z + d; z++) for (let x = b.x - 1; x <= b.x + w; x++) {
      if (x >= b.x && x < b.x + w && z >= b.z && z < b.z + d) continue;
      const t = this.terrain.tile(x, z); if (t === T.PATH || t === T.PLAZA) return true;
    }
    return false;
  }
  coverAt(kind, x, z) { return this.cover[kind][Math.floor(z) * WORLD + Math.floor(x)] || 0; }
  buildingAt(x, z) { const i = this.occ[Math.floor(z) * WORLD + Math.floor(x)]; return i >= 0 ? this.S.buildings.find(b => b.idx === i) : null; }
  // ------------------------------------------------------------------ mutations
  place(type, x0, z0, rot = 0, { free = false, silent = false, force = false, level = 1 } = {}) {
    const def = BUILDINGS[type]; if (!def) return null;
    const chk = this.canPlace(type, x0, z0, rot, level);
    if (!chk.ok && !force) { if (!silent) this.G.ui?.toast?.(chk.why, { color: '#ff8a8a' }); return null; }
    if (!free) {
      if (!this.G.actions.hasMaterials(def.cost)) { if (!silent) this.G.ui?.toast?.('Not enough materials!', { color: '#ff8a8a' }); Events.emit('sfx', 'ui_error'); return null; }
      this.G.actions.spendMaterials(def.cost);
    }
    const b = { id: uid(), idx: this.nextIdx(), type, x: x0, z: z0, rot, level, seed: randInt(0, 9999), residents: 0, built: this.G.day?.day || 1 };
    this.S.buildings.push(b);
    this.spawnModel(b, !silent);
    this.refreshTiles();
    if (!silent) { Events.emit('sfx', 'build_place'); Events.emit('village:changed'); this.simulate(true); this.paintOverlay(); }
    return b;
  }
  nextIdx() { let m = -1; for (const b of this.S.buildings) m = Math.max(m, b.idx ?? -1); return m + 1; }
  remove(b, refund = true) {
    const rec = this.list.find(r => r.data === b);
    if (rec) this.despawn(rec);
    this.S.buildings.splice(this.S.buildings.indexOf(b), 1);
    if (refund) { const c = BUILDINGS[b.type].cost; for (const k in c) if (k === 'coins') this.G.actions.addCoins(Math.floor(c[k] / 2)); else this.G.actions.addMaterial(k, Math.floor(c[k] / 2)); }
    this.refreshTiles(); this.simulate(true); this.paintOverlay();
    Events.emit('sfx', 'bulldoze'); Events.emit('village:changed');
  }
  paintZone(x0, z0, x1, z1, t) {
    const [ax, bx] = [Math.min(x0, x1), Math.max(x0, x1)], [az, bz] = [Math.min(z0, z1), Math.max(z0, z1)];
    let n = 0;
    for (let z = az; z <= bz; z++) for (let x = ax; x <= bx; x++) {
      const i = z * WORLD + x, tt = this.terrain.tiles[i];
      if (t && (tt !== T.GRASS || this.occ[i] >= 0)) continue;
      if (this.zone[i] !== t) { this.zone[i] = t; n++; }
    }
    this.S.zones = []; for (let i = 0; i < this.zone.length; i++) if (this.zone[i]) this.S.zones.push([i % WORLD, (i / WORLD) | 0, this.zone[i]]);
    this.paintOverlay();
    return n;
  }
  paintPath(x, z, on = true) {
    const i = z * WORLD + x, t = this.terrain.tiles[i];
    if (on) { if (t !== T.GRASS || this.occ[i] >= 0) return false; this.terrain.tiles[i] = T.PATH; this.zone[i] = 0; this.S.paths.push([x, z]); this.world.veg.clearRect(x, z, x + 1, z + 1, 0.1); }
    else { if (t !== T.PATH) return false; const k = this.S.paths.findIndex(p => p[0] === x && p[1] === z); if (k < 0) return false; this.S.paths.splice(k, 1); this.terrain.tiles[i] = T.GRASS; }
    this.terrain.syncTiles();
    return true;
  }
  // ------------------------------------------------------------------ rendering
  worldPos(b) { const [w, d] = this.dims(b.type, b.rot, b.level); const cx = b.x + w / 2, cz = b.z + d / 2; return new THREE.Vector3(cx, this.baseHeight(b), cz); }
  baseHeight(b) {
    const [w, d] = this.dims(b.type, b.rot, b.level); let h = 0, n = 0;
    for (let z = b.z; z < b.z + d; z++) for (let x = b.x; x < b.x + w; x++) { h += this.terrain.heightAt(x + 0.5, z + 0.5); n++; }
    return b.type === 'bridge' ? 0 : h / n;
  }
  spawnModel(b, animate) {
    if (b.idx === undefined) b.idx = this.nextIdx();
    const model = buildModel(b.type, { level: b.level, seed: b.seed });
    const g = new THREE.Group(); g.add(model.group);
    const p = this.worldPos(b);
    g.position.copy(p); g.rotation.y = -b.rot * Math.PI / 2;
    g.traverse(o => { if (o.isMesh) { o.castShadow = o.castShadow !== false; o.receiveShadow = true; const m = o.material; if (m?.userData?.u?.uOcclOn) m.userData.u.uOcclOn.value = 1; } });
    this.group.add(g);
    const [w, d] = this.dims(b.type, b.rot, b.level);
    for (let z = b.z; z < b.z + d; z++) for (let x = b.x; x < b.x + w; x++) { this.occ[z * WORLD + x] = b.idx; this.zone[z * WORLD + x] = 0; }
    // collision (skip walk-through decor and the bridge, which is a deck)
    const def = BUILDINGS[b.type];
    let col = null;
    const inset = def.cat === 'decor' ? 0.25 : 0.12;
    if (!['flowerBed', 'bridge', 'fence'].includes(b.type) && b.type !== 'park') col = this.world.collision.addRect(b.x + inset, b.z + inset, b.x + w - inset, b.z + d - inset, 'building');
    let deck = null;
    if (b.type === 'bridge') { this.addBridgeDeck(b, model); deck = this._deck; }
    this.world.veg.clearRect(b.x, b.z, b.x + w, b.z + d, 0.6);
    // lights & smoke
    const lights = [], rot = new THREE.Matrix4().makeRotationY(-b.rot * Math.PI / 2);
    for (const l of model.lights || []) {
      const lp = l.pos.clone().applyMatrix4(rot).add(p);
      lights.push(this.world.lightPool.addSource({ pos: lp, color: new THREE.Color(l.color), intensity: l.intensity ?? 4, radius: l.radius ?? 5, flicker: l.flicker ?? 0.3, nightOnly: l.nightOnly ?? true }));
    }
    const smokes = [];
    for (const s of model.smoke || []) smokes.push(this.G.village?.ambient?.addSmoke?.(s.clone().applyMatrix4(rot).add(p), { steam: b.type === 'onsen' }));
    // interaction
    const door = (model.door || new THREE.Vector3(0, 0, d / 2 + 0.6)).clone().applyMatrix4(rot).add(p);
    const inter = this.interactionFor(b, door);
    if (inter) this.world.interactables.push(inter);
    const rec = { data: b, model, group: g, col, lights, smokes, inter, door, deck };
    this.list.push(rec);
    if (animate) { g.scale.set(1, 0.01, 1); this.rising.push({ rec, t: 0 }); this.G.vfx?.dustRing?.(p, Math.max(w, d) * 0.6); }
    this.nightVal = -1;
    return rec;
  }
  despawn(rec) {
    this.group.remove(rec.group);
    if (rec.col) this.world.collision.remove(rec.col);
    for (const l of rec.lights) this.world.lightPool.removeSource(l);
    for (const s of rec.smokes) { const a = this.G.village?.ambient; if (a && s) a.smokeEmitters.splice(a.smokeEmitters.indexOf(s), 1); }
    if (rec.inter) { const k = this.world.interactables.indexOf(rec.inter); if (k >= 0) this.world.interactables.splice(k, 1); }
    if (rec.deck) { const k = this.world.decks.indexOf(rec.deck); if (k >= 0) this.world.decks.splice(k, 1); }
    const b = rec.data, [w, d] = this.dims(b.type, b.rot, b.level);
    for (let z = b.z; z < b.z + d; z++) for (let x = b.x; x < b.x + w; x++) if (this.occ[z * WORLD + x] === b.idx) this.occ[z * WORLD + x] = -1;
    this.list.splice(this.list.indexOf(rec), 1);
  }
  addBridgeDeck(b, model) {
    const [w, d] = this.dims(b.type, b.rot, b.level); const p = this.worldPos(b);
    const along = b.rot % 2 ? 'x' : 'z';
    const deck = { x0: b.x, z0: b.z, x1: b.x + w, z1: b.z + d, h: (x, z) => { const local = along === 'z' ? z - p.z : x - p.x; return Math.max(bridgeDeckHeight(local), this.terrain.heightAt(x, z)); } };
    this.world.decks.push(deck);
    this._deck = deck;
  }
  interactionFor(b, door) {
    const G = this.G, def = BUILDINGS[b.type];
    const mk = (label, fn, r = 1.3) => ({ pos: door, radius: r, label, onInteract: fn, building: b });
    switch (b.type) {
      case 'rosieShop': return mk("Shop at Rosie's Treats", () => G.openShop?.());
      case 'chewyHouse': return mk("Enter Chewy's Cottage", () => G.openHome?.());
      case 'townHall': return mk('Visit Blossom Hall', () => G.openTownHall?.());
      case 'boneSmith': return mk('Visit the Bonesmith', () => G.openSmith?.());
      case 'bulletinBoard': return mk('Read the Notice Board', () => G.openBoard?.(), 1.1);
      case 'dungeonGate': return mk('Enter the Burrow', () => G.openBurrowMenu?.(), 1.8);
      default: return null;
    }
  }
  refreshTiles() {
    // grass is hidden under buildings: temporarily mark occupied tiles in the tile texture alpha
    const tr = this.terrain; tr.syncTiles();
    const D = tr.tileData;
    for (let i = 0; i < WORLD * WORLD; i++) if (this.occ[i] >= 0) D[i * 4 + 3] = 0;
    tr.tileTex.needsUpdate = true;
  }
  // ------------------------------------------------------------------ simulation
  computeCoverage() {
    for (const k of COVER_KINDS) this.cover[k].fill(0);
    for (const b of this.S.buildings) {
      const def = BUILDINGS[b.type]; if (!def.covers) continue;
      const [w, d] = this.dims(b.type, b.rot, b.level); const cx = b.x + w / 2, cz = b.z + d / 2;
      for (const c of def.covers) {
        const r = c.r, arr = this.cover[c.kind];
        for (let z = Math.max(0, Math.floor(cz - r)); z <= Math.min(WORLD - 1, Math.ceil(cz + r)); z++) for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(WORLD - 1, Math.ceil(cx + r)); x++) {
          const dd = Math.hypot(x + 0.5 - cx, z + 0.5 - cz); if (dd > r) continue;
          const v = 1 - (dd / r) * 0.6; const i = z * WORLD + x; arr[i] = Math.min(1.5, arr[i] + v * (c.kind === 'joy' ? 0.6 : 1));
        }
      }
    }
    // nature adds a little joy: flowers and trees nearby
  }
  quality(b) {
    const [w, d] = this.dims(b.type, b.rot, b.level); const cx = b.x + w / 2, cz = b.z + d / 2;
    const q = {}; for (const k of COVER_KINDS) q[k] = clamp(this.coverAt(k, cx, cz));
    q.road = this.roadAccess(b);
    return q;
  }
  simulate(silent = false) {
    this.computeCoverage();
    const S = this.stats; S.population = 0; S.jobs = 0; S.homes = 0; S.shops = 0; S.workshops = 0;
    let hap = 0, nh = 0, cJobs = 0, wJobs = 0;
    for (const b of this.S.buildings) {
      const def = BUILDINGS[b.type];
      const q = this.quality(b); b.q = q;
      if (def.cat === 'home') { S.homes++; S.population += b.residents || 0; const h = (q.road ? 0.3 : 0) + q.water * 0.25 + q.joy * 0.25 + q.light * 0.1 + q.health * 0.05 + q.learn * 0.05; b.happy = h; hap += h; nh++; }
      if (def.jobs) { const j = def.jobs[Math.min(def.jobs.length - 1, b.level - 1)] || 0; S.jobs += j; if (def.cat === 'shop') { S.shops++; cJobs += j; } if (def.cat === 'craft') { S.workshops++; wJobs += j; } }
    }
    S.happiness = nh ? hap / nh : 0.5;
    const pop = S.population;
    this.demand.R = clamp((S.jobs + 6 + S.happiness * 8 - pop) / 12, -1, 1);
    this.demand.C = clamp((pop * 0.45 - cJobs + 2) / 8, -1, 1);
    this.demand.W = clamp((pop * 0.35 - wJobs + 1) / 8, -1, 1);
    S.rank = pop >= 80 ? 5 : pop >= 50 ? 4 : pop >= 28 ? 3 : pop >= 12 ? 2 : 1;
    if (!silent) this.G.ui?.setRCI?.(this.demand);
    this.G.state.village.stats = { ...S, demand: { ...this.demand } };
  }
  // one growth step: move-ins, new buildings in zones, level-ups
  grow() {
    const V = this.S, R = Math.random;
    // move-ins
    for (const b of V.buildings) {
      const def = BUILDINGS[b.type]; if (def.cat !== 'home' || !b.q?.road) continue;
      const cap = def.capacity[b.level - 1];
      if (b.residents < cap && this.demand.R > -0.2 && R() < 0.5) { b.residents++; if (R() < 0.3) this.G.ui?.toast?.('A new villager moved in!', { color: '#8fe0c0' }); }
    }
    // new building on a zoned lot
    for (const [key, t] of [['R', ZONES.R], ['C', ZONES.C], ['W', ZONES.W]]) {
      if (this.demand[key] <= 0.05 || R() > 0.6) continue;
      const type = key === 'R' ? 'home' : key === 'C' ? 'shop' : pick(['farm', 'lumber', 'kiln', 'fishingHut']);
      const lot = this.findLot(t, type);
      if (lot) { const b = this.place(type, lot.x, lot.z, lot.rot, { free: true, silent: false }); if (b) { this.G.ui?.toast?.(`${BUILDINGS[type].variants?.[0] || BUILDINGS[type].name} sprouted in the ${key === 'R' ? 'homes' : key === 'C' ? 'shops' : 'workshop'} zone!`, { color: '#ffd84a' }); return; } }
    }
    // level ups
    for (const b of V.buildings) {
      const def = BUILDINGS[b.type]; if (b.level >= def.levels || !def.zone || !b.q?.road) continue;
      const need = b.level === 1 ? (b.q.water > 0.2 && b.q.joy > 0.25) : (b.q.water > 0.3 && b.q.joy > 0.5 && b.q.light > 0.2 && (b.q.health > 0.2 || b.q.learn > 0.2));
      const dem = this.demand[def.zone];
      if (need && dem > -0.1 && R() < 0.35) { if (this.levelUp(b)) return; }
    }
  }
  // place near (cx,cz) between radii r0..r1 on the best lot with path access (decor may sit on grass by paths)
  autoPlace(type, cx, cz, r0, r1, decor = false) {
    const cands = [];
    for (let z = Math.floor(cz - r1); z <= cz + r1; z++) for (let x = Math.floor(cx - r1); x <= cx + r1; x++) {
      const dd = Math.hypot(x - cx, z - cz); if (dd < r0 || dd > r1) continue;
      for (const rot of [0, 1, 2, 3]) {
        if (!this.canPlace(type, x, z, rot).ok) continue;
        const b = { type, x, z, rot, level: 1 };
        if (!this.roadAccess(b)) continue;
        const front = this.frontTouchesPath(b);
        if (!front && !decor) continue;
        // keep a 1-tile gap between buildings so the village breathes
        const [w, d] = this.dims(type, rot); let crowd = 0;
        for (let zz = z - 1; zz <= z + d; zz++) for (let xx = x - 1; xx <= x + w; xx++) if (this.occ[zz * WORLD + xx] >= 0) crowd++;
        if (crowd && !decor) continue;
        cands.push({ x, z, rot, score: -dd * 0.2 + Math.random() * 2 + (front ? 2 : 0) });
      }
    }
    cands.sort((a, b) => b.score - a.score);
    const c = cands[0]; if (!c) return null;
    return this.place(type, c.x, c.z, c.rot, { free: true, silent: true });
  }
  // paint n square zone blocks (size x size) on free, flat grass beside paths, r0..r1 from the plaza
  autoZone(t, n, r0, r1, size) {
    const P = LANDMARKS.plaza, cands = [];
    for (let z = Math.floor(P.z - r1); z <= P.z + r1; z++) for (let x = Math.floor(P.x - r1); x <= P.x + r1; x++) {
      const d = Math.hypot(x + size / 2 - P.x, z + size / 2 - P.z); if (d < r0 || d > r1) continue;
      let ok = true, hMin = 1e9, hMax = -1e9;
      for (let zz = z; zz < z + size && ok; zz++) for (let xx = x; xx < x + size && ok; xx++) {
        const i = zz * WORLD + xx;
        if (this.terrain.tiles[i] !== T.GRASS || this.occ[i] >= 0 || this.zone[i]) ok = false;
        const h = this.terrain.heightAt(xx + 0.5, zz + 0.5); hMin = Math.min(hMin, h); hMax = Math.max(hMax, h);
      }
      if (!ok || hMax - hMin > 0.5 || hMin < 0.6) continue;
      if (!this.roadAccess({ type: 'well', x, z, rot: 0, level: 1, _w: size })) { // check a ring around the block
        let road = false;
        for (let k = -1; k <= size && !road; k++) for (const [xx, zz] of [[x + k, z - 1], [x + k, z + size], [x - 1, z + k], [x + size, z + k]]) { const tt = this.terrain.tile(xx, zz); if (tt === T.PATH || tt === T.PLAZA) { road = true; break; } }
        if (!road) continue;
      }
      cands.push({ x, z, score: -d * 0.1 + Math.random() });
    }
    cands.sort((a, b) => b.score - a.score);
    let made = 0;
    for (const c of cands) {
      if (made >= n) break;
      let free = true;
      for (let zz = c.z - 1; zz <= c.z + size && free; zz++) for (let xx = c.x - 1; xx <= c.x + size && free; xx++) if (this.zone[zz * WORLD + xx] || this.occ[zz * WORLD + xx] >= 0) free = false;
      if (!free) continue;
      this.paintZone(c.x, c.z, c.x + size - 1, c.z + size - 1, t); made++;
      this.world.veg.clearRect(c.x, c.z, c.x + size, c.z + size, 0.2);
    }
    return made;
  }
  findLot(zoneType, type) {
    const cands = [];
    for (let z = 3; z < WORLD - 4; z++) for (let x = 3; x < WORLD - 4; x++) {
      if (this.zone[z * WORLD + x] !== zoneType) continue;
      for (const rot of [0, 1, 2, 3]) {
        const [w, d] = this.dims(type, rot);
        let ok = true;
        for (let zz = z; zz < z + d && ok; zz++) for (let xx = x; xx < x + w && ok; xx++) if (this.zone[zz * WORLD + xx] !== zoneType) ok = false;
        if (!ok || !this.canPlace(type, x, z, rot).ok) continue;
        const b = { type, x, z, rot, level: 1 };
        if (!this.roadAccess(b)) continue;
        // prefer the door facing a path
        const front = this.frontTouchesPath(b) ? 2 : 0;
        cands.push({ x, z, rot, score: front + Math.random() });
      }
    }
    cands.sort((a, b) => b.score - a.score);
    return cands[0] || null;
  }
  frontTouchesPath(b) {
    const [w, d] = this.dims(b.type, b.rot); const dirs = [[0, 1], [-1, 0], [0, -1], [1, 0]][b.rot];
    const cx = b.x + w / 2 + dirs[0] * (w / 2 + 0.5), cz = b.z + d / 2 + dirs[1] * (d / 2 + 0.5);
    const t = this.terrain.tile(cx, cz); return t === T.PATH || t === T.PLAZA;
  }
  levelUp(b) {
    const nl = b.level + 1;
    const [w1, d1] = this.dims(b.type, b.rot, b.level), [w2, d2] = this.dims(b.type, b.rot, nl);
    if (w2 !== w1 || d2 !== d1) { // needs to expand: try keeping the same corner
      const rec = this.list.find(r => r.data === b);
      if (!this.canPlace(b.type, b.x, b.z, b.rot, nl, b.idx).ok) return false;
      this.despawn(rec);
    } else { const rec = this.list.find(r => r.data === b); this.despawn(rec); }
    b.level = nl; b.seed = randInt(0, 9999);
    const rec = this.spawnModel(b, true);
    this.refreshTiles();
    this.G.vfx?.levelUp?.(this.worldPos(b));
    this.G.ui?.toast?.(`${BUILDINGS[b.type].name} grew to level ${nl}!`, { color: '#ffd84a' });
    Events.emit('sfx', 'build_complete');
    return true;
  }
  onNewDay(day) {
    // daily income: rent + shops + workshop production
    let coins = 0; const mats = {};
    for (const b of this.S.buildings) {
      const def = BUILDINGS[b.type];
      if (def.cat === 'home') coins += (b.residents || 0) * 3 * (1 + (b.happy || 0));
      if (def.cat === 'shop') coins += (def.jobs[b.level - 1] || 0) * 5;
      if (b.type === 'lumber') mats.wood = (mats.wood || 0) + 4 * b.level;
      if (b.type === 'kiln') mats.stone = (mats.stone || 0) + 3 * b.level;
      if (b.type === 'farm') { coins += 10 * b.level; mats.mochi = (mats.mochi || 0) + (Math.random() < 0.5 ? 1 : 0); }
      if (b.type === 'fishingHut') coins += 12 * b.level;
    }
    coins = Math.round(coins);
    if (coins) this.G.actions.addCoins(coins);
    for (const k in mats) this.G.actions.addMaterial(k, mats[k]);
    const parts = [`+${coins} coins`, ...Object.entries(mats).map(([k, n]) => `+${n} ${k}`)];
    this.G.ui?.banner?.(`Day ${day}`, `Village income: ${parts.join(', ')}`, { style: 'quest' });
    this.S.income = [{ day, coins, mats }, ...(this.S.income || [])].slice(0, 7);
  }
  // ------------------------------------------------------------------ overlays (build mode)
  setOverlay(mode) { this.overlayMode = mode; this.paintOverlay(); this.terrain.material.userData.u.uOverlayAmt.value = mode ? 1 : 0; }
  paintOverlay() {
    const D = this.terrain.overlayData, mode = this.overlayMode;
    D.fill(0);
    for (let i = 0; i < WORLD * WORLD; i++) {
      if (mode && COVER_KINDS.includes(mode)) { const v = this.cover[mode][i]; if (v > 0) { const c = COVER_COLORS[mode]; D[i * 4] = c[0]; D[i * 4 + 1] = c[1]; D[i * 4 + 2] = c[2]; D[i * 4 + 3] = Math.min(200, v * 170); } }
      else if (mode === 'zones' || mode === 'build') { const z = this.zone[i]; if (z) { const c = ZONE_COLORS[z]; D[i * 4] = c[0]; D[i * 4 + 1] = c[1]; D[i * 4 + 2] = c[2]; D[i * 4 + 3] = 140; } }
    }
    this.terrain.overlayTex.needsUpdate = true;
  }
  // ------------------------------------------------------------------ per frame
  update(dt, t) {
    // rising animation for new buildings
    for (let i = this.rising.length - 1; i >= 0; i--) {
      const r = this.rising[i]; r.t += dt; const k = Math.min(1, r.t / 0.7);
      r.rec.group.scale.set(1 + Math.sin(k * Math.PI) * 0.08, ease.outBack(k), 1 + Math.sin(k * Math.PI) * 0.08);
      if (Math.random() < 0.4) this.G.vfx?.dust?.(r.rec.group.position.clone().add(new THREE.Vector3(rand(-1, 1), 0, rand(-1, 1))), { n: 1, size: 0.4 });
      if (k >= 1) { this.rising.splice(i, 1); this.G.vfx?.petals?.(r.rec.group.position.clone().setY(r.rec.group.position.y + 1.5), 16, 1.2); Events.emit('sfx', 'build_complete'); }
    }
    for (const r of this.list) r.model.update?.(dt, t);
    const n = this.G.day?.out?.night ?? 0;
    if (Math.abs(n - this.nightVal) > 0.02) { this.nightVal = n; for (const r of this.list) setNight(r.model, n); }
    this.tickT += dt;
    if (this.tickT > 6) { this.tickT = 0; this.simulate(); this.grow(); this.simulate(); }
  }
}
