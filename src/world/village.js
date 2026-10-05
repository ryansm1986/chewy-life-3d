// SimCity-style village simulation: placement, zoning (R/C/W), road access, service coverage, RCI demand,
// organic growth & level-ups, residents, daily income. Renders buildings via the buildings kit.
import * as THREE from 'three';
import { BUILDINGS, buildModel, releaseModel, setNight, sizeOf, bridgeDeckHeight, getTemplate, hasTemplate, VARIANTS } from './buildings/index.js';
import { T, WORLD } from './terrain.js';
import { LANDMARKS, PLAZA, PATHS, JUNCTIONS, distToPaths, paintStreet } from './layout.js';
import { PLOTS, PLOT_BY_ID, PLOT_TYPES, ZONE_TYPES, DISTRICTS, DOOR_ROT, DOOR_DIR, plotZones, plotSpot, plotReserve, plotCentre, plotFrame, rectsOverlap } from './plots.js';
import { Events } from '../core/events.js';
import { uid, rand, randInt, clamp, ease, mulberry32, pick } from '../core/util.js';
import { NeedIcons } from './needIcons.js';
import { markOccluder } from '../gfx/materials.js';

export const ZONES = { R: 1, C: 2, W: 3 };
export const ZONE_COLORS = { 1: [70, 205, 90], 2: [70, 140, 255], 3: [255, 165, 40] };
export const COVER_KINDS = ['water', 'light', 'joy', 'health', 'learn'];
const COVER_COLORS = { water: [90, 170, 255], light: [255, 220, 110], joy: [255, 130, 190], health: [120, 230, 160], learn: [180, 140, 255] };
// ---- planning feedback tables (read-only mirrors of the rules in simulate()/grow() — keep in sync if those change)
export const RANK_POP = [0, 12, 28, 50, 80]; // villagers needed for rank 1..5
export const LAYOUT_VERSION = 2; // Blossom Hollow 2.0: buildings stand on plots (docs/VILLAGE_PLAN.md)
const LEVEL_NEEDS = { 1: [['water', 0.2], ['joy', 0.25]], 2: [['water', 0.3], ['joy', 0.5], ['light', 0.2], ['care', 0.2]] }; // care = health OR learn
const MOVE_IN_DEMAND = -0.2, LEVEL_DEMAND = -0.1, GROW_DEMAND = 0.05;
const ZONE_KEY = { 1: 'R', 2: 'C', 3: 'W' };
const ZONE_INFO = {
  R: { name: 'Homes zone', word: 'homes', types: ['home'] },
  C: { name: 'Shops zone', word: 'shops', types: ['shop'] },
  W: { name: 'Workshop zone', word: 'workshops', types: ['farm', 'lumber', 'kiln', 'fishingHut'] },
};
const NEED_NAME = { road: 'Path', water: 'Water', joy: 'Joy', light: 'Light', health: 'Health', learn: 'Learning', care: 'Health / Learning' };
const NEED_FIX = { water: 'a Well or Water Tower', joy: 'a Park, Benches or Flower Beds', light: 'Stone Lanterns or Lantern Posts', care: 'a Paw Clinic or Village School' };
const pct = v => `${Math.round(v * 100)}%`;
const hexRGB = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const sgn = v => `${v >= 0 ? '+' : '−'}${Math.round(Math.abs(v) * 100)}%`;

// Small models (decor, lanterns, wells, stalls) draw with a twin of the shared building material that has the
// occlusion cutaway switched off (uOcclOn = 0) and writes no x-ray stencil: a stone lantern next to Chewy must never
// dissolve, and only real buildings trigger the x-ray silhouette -- except bushy props big enough to swallow Chewy
// whole (a sakura planter's crown), which keep the stencil so he shows as a silhouette instead of vanishing.
// A uniform can't be toggled per draw (the renderer only re-uploads material uniforms when the material changes, and
// opaque draws are sorted by material), so the twin is a separate material object. It keeps the same
// customProgramCacheKey, so it shares the compiled program (no new shader), shares every other uniform object with the
// original, and reads the original's emissive live (setNight).
const PROP_TWINS = [new Map(), new Map()];
function propTwin(m, xray = false) {
  let t = PROP_TWINS[+xray].get(m);
  if (t) return t;
  const ud = m.userData;
  m.userData = {}; t = m.clone(); m.userData = ud; // (Material.clone JSON-copies userData: keep it out of that)
  const u = { ...ud.u, uOcclOn: { value: 0 } };
  t.userData = { ...ud, u, shader: null };
  t.stencilWrite = false; if (xray) markOccluder(t);
  t.customProgramCacheKey = m.customProgramCacheKey;
  const base = m.onBeforeCompile;
  t.onBeforeCompile = (sh, r) => {
    const keep = ud.shader; base.call(m, sh, r); ud.shader = keep; // base() binds the original's uniforms + records its shader
    sh.uniforms.uOcclOn = u.uOcclOn; t.userData.shader = sh;
  };
  t.emissive = m.emissive;
  Object.defineProperty(t, 'emissiveIntensity', { get: () => m.emissiveIntensity, set() {}, configurable: true });
  PROP_TWINS[+xray].set(m, t);
  return t;
}
// a decorated home is a happier one (docs/HOUSING.md §4): its Home Rating (home/rating.js, kept on b.homeStars) adds to
// b.happy past the three stars a villager's own furnishing gets: +0.06 at four stars, +0.12 at five
const homeJoy = b => (b.homeStars > 3 ? (Math.min(5, b.homeStars) - 3) * 0.06 : 0);

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
    // plots (docs/VILLAGE_PLAN.md §4): plot index per tile, the tiles each plot keeps clear of free decorations, and
    // which building stands on which plot
    this.plotTile = new Int16Array(WORLD * WORLD).fill(-1);
    this.reserveTile = new Int16Array(WORLD * WORLD).fill(-1);
    PLOTS.forEach((pl, k) => {
      for (let z = pl.z; z < pl.z + pl.d; z++) for (let x = pl.x; x < pl.x + pl.w; x++) this.plotTile[z * WORLD + x] = k;
      for (const r of plotReserve(pl)) for (let z = Math.floor(r.z); z < Math.ceil(r.z + r.d); z++) for (let x = Math.floor(r.x); x < Math.ceil(r.x + r.w); x++) this.reserveTile[z * WORLD + x] = k;
    });
    this.plotUse = new Map(); // plot id -> building data
  }
  get S() { return this.G.state.village; }
  get vfx() { return this.G.village?.vfx || this.G.vfx; } // (the village's own effects: growth goes on while you're indoors)
  // ------------------------------------------------------------------ setup / persistence
  // Zoned buildings grow with a random variant/level; building a template the first time costs 5-20 ms, a hitch right
  // when a home pops up. Templates are pre-built only while nobody can see a hitch: the level-1 variants that grow
  // first behind the boot splash, the rest during the title screen, dialogue, menus and Burrow trips. (Idle callbacks
  // mid-play were tried: on a busy machine their timeouts fire constantly and each build became a visible hitch.)
  // a random seed, preferring a variant whose model template is already built (no build hitch mid-play); the prewarm
  // fills in the other variants over time, so variety returns
  seedFor(type, level) {
    const seeds = []; for (let i = 0; i < 6; i++) seeds.push(randInt(0, 9999));
    return seeds.find(sd => hasTemplate(type, level, sd)) ?? seeds[0];
  }
  prewarmTemplates() {
    if (this._prewarm) return;
    const q = this._prewarm = [];
    for (const [id, d] of Object.entries(BUILDINGS)) if (d.zone) for (let lv = 1; lv <= (d.levels || 1); lv++) for (let v = 0; v < VARIANTS; v++) q.push([id, lv, v]);
    q.sort((a, b) => a[1] - b[1]); // level 1 first
    const one = () => { const [id, lv, v] = q.shift(); try { getTemplate(id, lv, v); } catch (e) { /* unknown combo */ } };
    for (let t = performance.now(); q.length && q[0][1] === 1 && performance.now() - t < 400;) one(); // boot, behind the splash
    const hidden = () => { const G = this.G; return G.titleActive || G.ui?.dlg?.active || G.ui?.anyModal?.() || (G.mode !== 'village' && G.mode !== 'interior'); };
    const iv = setInterval(() => {
      if (!q.length) return clearInterval(iv);
      if (hidden()) for (let t = performance.now(); q.length && performance.now() - t < 14;) one();
    }, 60);
  }
  init() {
    this.prewarmTemplates();
    const V = this.G.state.village;
    if (!V.buildings) {
      V.buildings = []; V.zones = []; V.paths = []; V.day = 1; V.income = [];
      V.layoutVersion = LAYOUT_VERSION; V.ringRank = 1; V.seed = (Math.random() * 1e9) >>> 0;
      this.seedStarterVillage();
    } else {
      if ((V.layoutVersion || 1) < LAYOUT_VERSION) this.migrate(V); // an old save: everyone moves into the new town plan
      for (const p of V.paths || []) { this.terrain.tiles[p[1] * WORLD + p[0]] = T.PATH; this.world.veg.clearRect(p[0], p[1], p[0] + 1, p[1] + 1, 0.1); }
      for (const [x, z, t] of V.zones || []) this.zone[z * WORLD + x] = t;
      for (const b of V.buildings) this.spawnModel(b, false);
    }
    this.refreshTiles();
    this.simulate(true);
    this.paintOverlay();
  }
  // A new game: the landmarks on their fixed plots, then the starter neighbourhood on its starter plots in every core
  // district (plots.js `starter`, with a starting level), the plaza furniture, benches with flower beds at the street
  // junctions and a few zones waiting to grow. Deterministic for a village seed (S.seed): no random lot search.
  seedStarterVillage() {
    const L = LANDMARKS, V = this.S;
    const rnd = mulberry32(V.seed ?? 1);
    const fixedPlot = k => PLOTS.find(q => q.fixed === k)?.id || null;
    const pre = (type, lm, key) => { const rot = lm.ri ?? 0, [w, d] = sizeOf(type); return this.place(type, Math.round(lm.x - (rot % 2 ? d : w) / 2), Math.round(lm.z - (rot % 2 ? w : d) / 2), rot, { free: true, silent: true, force: true, plot: fixedPlot(key) }); };
    pre('townHall', L.townHall, 'townHall');
    pre('chewyHouse', L.chewyHouse, 'chewyHouse'); // door east, onto Cottage Lane
    pre('rosieShop', L.rosieShop, 'rosieShop');      // door south, onto Market Street
    pre('dungeonGate', { x: L.dungeon.x, z: L.dungeon.z - 0.5, ri: L.dungeon.ri }, 'dungeon');
    this.place('fountain', L.fountain.x - 1, L.fountain.z - 1, 0, { free: true, silent: true, force: true }); // 2x2 on the plaza centre
    const B = L.bridgeW;
    this.place('bridge', Math.round(B.x - B.len / 2), Math.round(B.z - 1.5), 1, { free: true, silent: true, force: true });
    // the starter neighbourhood on its plots
    for (const pl of PLOTS) {
      if (!pl.starter) continue;
      const level = pl.level || 1, sp = this.spotFor(pl, pl.starter, level);
      if (!sp) { console.warn('[village] no starter spot on plot', pl.id); continue; }
      this.place(pl.starter, sp.x, sp.z, sp.rot, { free: true, silent: true, level, plot: pl.id, seed: (rnd() * 1e4) | 0 });
    }
    // plaza furniture (relative to the plaza: stone lanterns at its inner corners, planters, benches and beds round the fountain)
    const P = LANDMARKS.plaza, ex = PLAZA.hw - 0.2, ez = PLAZA.hd - 0.6;
    for (const [dx, dz] of [[-ex, -ez], [ex, -ez], [-ex, ez], [ex, ez]]) this.place('stoneLantern', Math.floor(P.x + dx), Math.floor(P.z + dz), 0, { free: true, silent: true });
    for (const [t, dx, dz] of [['sakuraPlanter', -4.2, -2.8], ['sakuraPlanter', 4.2, -2.8], ['bench', -2.8, 3.8], ['bench', 2.8, 3.8], ['flowerBed', -1.4, -4.2], ['flowerBed', 1.4, -4.2], ['bulletinBoard', 0, -5.6]]) this.place(t, Math.floor(P.x + dx), Math.floor(P.z + dz), 0, { free: true, silent: true });
    // a bench (facing the corner, and so the default camera when it can) and a flower bed at each street junction
    for (const J of JUNCTIONS) this.junctionBench(J, rnd);
    // zones waiting to grow
    for (const pl of PLOTS) if (pl.zone) this.zonePlot(pl, pl.zone);
    // homes start partly inhabited (newcomers move in over the first minutes: village rank 2 comes soon)
    for (const b of V.buildings) if (BUILDINGS[b.type].cat === 'home') b.residents = Math.max(1, BUILDINGS[b.type].capacity[b.level - 1] - 2);
  }
  // ------------------------------------------------------------------ save migration (docs/VILLAGE_PLAN.md §5)
  // A layout v1 save (the 112 m island, absolute tile coordinates, no plots) moves onto the new plan. Every building
  // keeps its id, type, level, residents, seed (so its variant) and build day; only x / z / rot / plot change:
  //  - the prebuilt landmarks go to their fixed plots, the first fountain to the plaza centre, the bridge to the river;
  //  - plot buildings go to a free plot that allows them, by district role (homes nearest the core first, shops along
  //    Market Street, workshops and farms in their quarter, services on the civic, garden, pond and shrine plots), the
  //    highest level first; if the open plots run out, the save's next ring unlocks;
  //  - decorations keep their arrangement round the plaza, spread to the bigger town (1.6x), on the nearest free tile.
  //  - old painted zones and paths are dropped (their coordinates mean nothing on the new island).
  // Deterministic (a stable order, no randomness) and idempotent (layoutVersion 2 is never migrated again). A building
  // that fits nowhere at all is still kept (nearest free ground), never lost.
  migrate(V) {
    const OLD_PLAZA = { x: 56, z: 60.5 }, P = LANDMARKS.plaza, L = LANDMARKS;
    const list = [...V.buildings];
    const before = new Map(list.map(b => [b.id, { type: b.type, level: b.level, residents: b.residents || 0, seed: b.seed }]));
    // the save's village rank decides which rings are open (residents are kept, so the rank is too)
    let pop = 0; for (const b of list) if (BUILDINGS[b.type]?.cat === 'home') pop += b.residents || 0;
    let ring = Math.max(1, V.ringRank || 1, RANK_POP.filter(n => pop >= n).length);
    const mark = (b, on) => { const [w, d] = this.dims(b.type, b.rot, b.level); for (let z = b.z; z < b.z + d; z++) for (let x = b.x; x < b.x + w; x++) this.occ[z * WORLD + x] = on ? b.idx : -1; };
    const set = (b, x, z, rot, plot = null) => { b.x = x; b.z = z; b.rot = rot; if (plot) { b.plot = plot; this.plotUse.set(plot, b); } else delete b.plot; mark(b, true); };
    const fixedPlot = k => PLOTS.find(q => q.fixed === k)?.id || null;
    const ringOpen = r => r <= ring;
    // 1. landmarks
    let fountain = false, bridge = false;
    const lmOf = { townHall: 'townHall', chewyHouse: 'chewyHouse', rosieShop: 'rosieShop', dungeonGate: 'dungeon' };
    const placed = new Set();
    for (const b of list) {
      const k = lmOf[b.type];
      if (k && !this.plotUse.has(fixedPlot(k) || '-')) {
        const lm = L[k], rot = lm.ri ?? 0, [w, d] = sizeOf(b.type, b.level), zc = k === 'dungeon' ? lm.z - 0.5 : lm.z;
        set(b, Math.round(lm.x - (rot % 2 ? d : w) / 2), Math.round(zc - (rot % 2 ? w : d) / 2), rot, fixedPlot(k)); placed.add(b);
      } else if (b.type === 'fountain' && !fountain) { fountain = true; set(b, L.fountain.x - 1, L.fountain.z - 1, 0); placed.add(b); }
      else if (b.type === 'bridge' && !bridge) { bridge = true; const B = L.bridgeW; set(b, Math.round(B.x - B.len / 2), Math.round(B.z - 1.5), 1); placed.add(b); }
    }
    // 2. plot buildings, by role
    const dist = (pl, at) => { const c = plotCentre(pl); return Math.hypot(c.x - at.x, c.z - at.z); };
    const PREF = {
      home: { at: P, districts: ['west', 'meadows', 'outer', 'hamlet', 'terraces'] },
      shop: { at: L.rosieShop, districts: ['market', 'hamlet'] },
      farm: { at: L.plaza, districts: ['works'] }, lumber: { at: L.plaza, districts: ['works'] }, kiln: { at: L.plaza, districts: ['works'] }, fishingHut: { at: L.bridgeW, districts: ['works'] },
      clinic: { at: P, districts: ['core'] }, school: { at: P, districts: ['core'] }, boneSmith: { at: P, districts: ['core'] },
      park: { at: P, districts: ['core', 'meadows', 'pond', 'west'] }, waterTower: { at: P, districts: ['core', 'west', 'meadows', 'pond'] },
      chewyStatue: { at: P, districts: ['core', 'pond', 'meadows', 'west'] }, shrine: { at: L.shrine, districts: ['shrine'] }, onsen: { at: L.shrine, districts: ['shrine'] },
    };
    const order = list.filter(b => !placed.has(b) && PLOT_TYPES.has(b.type))
      .sort((a, b) => (Object.keys(PREF).indexOf(a.type) - Object.keys(PREF).indexOf(b.type)) || (b.level - a.level) || (Math.hypot(a.x - OLD_PLAZA.x, a.z - OLD_PLAZA.z) - Math.hypot(b.x - OLD_PLAZA.x, b.z - OLD_PLAZA.z)) || String(a.id).localeCompare(String(b.id)));
    const loose = [];
    for (const b of order) {
      const pref = PREF[b.type] || { at: P, districts: [] };
      let done = false;
      for (let tries = 0; tries < 5 && !done; tries++) {
        const cands = PLOTS.filter(pl => !pl.fixed && pl.allows.includes(b.type) && ringOpen(pl.rank || 1) && !this.plotUse.has(pl.id))
          .map(pl => ({ pl, sp: this.spotFor(pl, b.type, b.level), k: pref.districts.indexOf(pl.district) }))
          .filter(c => c.sp && this.canPlace(b.type, c.sp.x, c.sp.z, c.sp.rot, b.level, -1, c.pl.id).ok)
          .sort((p1, p2) => ((p1.k < 0 ? 99 : p1.k) - (p2.k < 0 ? 99 : p2.k)) || (dist(p1.pl, pref.at) - dist(p2.pl, pref.at)) || p1.pl.id.localeCompare(p2.pl.id));
        const c = cands[0];
        if (c) { set(b, c.sp.x, c.sp.z, c.sp.rot, c.pl.id); done = true; }
        else if (ring < 4) ring++; // out of plots: this save's next ring opens
        else break;
      }
      if (!done) loose.push(b);
    }
    // 3. decorations (and anything that found no plot): their old arrangement round the plaza, 1.6x, nearest free tile
    const free = list.filter(b => !placed.has(b) && !PLOT_TYPES.has(b.type) && !(b.plot && this.plotUse.get(b.plot) === b))
      .sort((a, b) => (Math.hypot(a.x - OLD_PLAZA.x, a.z - OLD_PLAZA.z) - Math.hypot(b.x - OLD_PLAZA.x, b.z - OLD_PLAZA.z)) || String(a.id).localeCompare(String(b.id)));
    for (const b of [...free, ...loose]) {
      const [w0, d0] = this.dims(b.type, b.rot, b.level), ox = b.x + w0 / 2 - OLD_PLAZA.x, oz = b.z + d0 / 2 - OLD_PLAZA.z;
      const tx = P.x + ox * 1.6, tz = P.z + oz * 1.6;
      const strict = !loose.includes(b);
      let best = null;
      for (let r = 0; r <= 40 && !best; r++) for (let k = 0; k < Math.max(1, r * 8) && !best; k++) {
        const a = (k / Math.max(1, r * 8)) * Math.PI * 2, rot = b.rot;
        const [w, d] = this.dims(b.type, rot, b.level), x = Math.round(tx + Math.cos(a) * r - w / 2), z = Math.round(tz + Math.sin(a) * r - d / 2);
        // decorations stay off the plots' reserved boxes; a building with no plot left only needs free ground
        if (this.canPlace(b.type, x, z, rot, b.level, -1, strict ? null : '__migrate').ok) best = { x, z, rot };
      }
      if (best) set(b, best.x, best.z, best.rot);
      else { // nowhere at all (should not happen): keep it, parked by the plaza, rather than lose it
        set(b, Math.round(P.x), Math.round(P.z + PLAZA.hd + 2), b.rot); console.warn('[village] migration: no room for', b.type);
      }
    }
    // the rings this save now has: their stub streets are paved
    for (const S of PATHS) if (S.rank > 1 && S.rank <= ring) this.openStreet(S);
    // done: the plot table and occupancy are rebuilt by spawnModel (it marks both again)
    this.occ.fill(-1); this.plotUse.clear();
    const lost = [...before.keys()].filter(id => !list.some(b => b.id === id));
    const changed = list.filter(b => { const o = before.get(b.id); return o.type !== b.type || o.level !== b.level || o.residents !== (b.residents || 0) || o.seed !== b.seed; });
    if (lost.length || changed.length) console.error('[village] migration changed buildings', lost, changed.map(b => b.id));
    V.buildings = list; V.zones = []; V.paths = [];
    V.layoutVersion = LAYOUT_VERSION; V.ringRank = ring; V.seed ??= 1;
    V.migrationNote = true; // the "everyone moved" toast is still to be shown (cleared once it has been)
    this.migration = { from: 1, buildings: list.length, onPlots: list.filter(b => b.plot).length, loose: loose.length, ring };
    return this.migration;
  }
  // a bench + flower bed on the corner of a junction: the nearest free spot 2-4 m from it, off the paving and the lots
  junctionBench(J, rnd) {
    let best = null;
    for (let r = 2; r <= 4.2 && !best; r += 0.6) for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2 + 0.26, x = Math.floor(J.x + Math.cos(a) * r), z = Math.floor(J.z + Math.sin(a) * r);
      if (distToPaths(x + 0.5, z + 0.5) < 0.3 || this.plotTile[z * WORLD + x] >= 0) continue;
      const dx = J.x - (x + 0.5), dz = J.z - (z + 0.5), rot = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 3 : 1) : (dz > 0 ? 0 : 2);
      if (!this.canPlace('bench', x, z, rot).ok) continue;
      const score = -(x + z) * 0.05 + (rot === 0 || rot === 3 ? 0.4 : 0) - r * 0.2; // prefer corners seen from the camera
      if (!best || score > best.score) best = { x, z, rot, score };
    }
    if (!best) return;
    if (!this.place('bench', best.x, best.z, best.rot, { free: true, silent: true, seed: (rnd() * 1e4) | 0 })) return;
    const [dx, dz] = [[1, 0], [0, 1], [1, 0], [0, 1]][best.rot];
    for (const sg of [1, -1]) if (this.place('flowerBed', best.x + dx * sg, best.z + dz * sg, best.rot, { free: true, silent: true })) break;
  }
  // ------------------------------------------------------------------ plots
  ringRank() { return this.S.ringRank || 1; }
  plotOpen(pl) { return (pl.rank || 1) <= this.ringRank(); }
  plotOf(x, z) { x = Math.floor(x); z = Math.floor(z); if (x < 0 || z < 0 || x >= WORLD || z >= WORLD) return null; const k = this.plotTile[z * WORLD + x]; return k >= 0 ? PLOTS[k] : null; }
  needsPlot(type) { return PLOT_TYPES.has(type); }
  plotFree(pl, ignore = null) { const b = this.plotUse.get(pl.id); return !b || b === ignore; }
  plotZone(pl) { const c = plotCentre(pl); return this.zone[Math.floor(c.z) * WORLD + Math.floor(c.x)] || 0; }
  // where `type` at `level` stands on plot pl ({ x, z, w, d, rot } or null when it outgrows the plot); small pieces
  // (a well, a statue) stand in the middle of the lot
  spotFor(pl, type, level = 1) {
    const r = DOOR_ROT[pl.door], [w, d] = sizeOf(type, level);
    if (Math.max(w, d) <= 1) return { x: Math.floor(pl.x + (pl.w - 1) / 2), z: Math.floor(pl.z + (pl.d - 1) / 2), w: 1, d: 1, rot: r };
    return plotSpot(pl, r % 2 ? d : w, r % 2 ? w : d);
  }
  // a plot building that can't grow any more on its plot (the next size doesn't fit)
  plotCapped(b) { const pl = b.plot && PLOT_BY_ID[b.plot]; return !!pl && !pl.fixed && b.level < (BUILDINGS[b.type].levels || 1) && !this.spotFor(pl, b.type, b.level + 1); }
  atCap(b) { return b.level >= (BUILDINGS[b.type].levels || 1) || this.plotCapped(b); }
  // the plot fronts an open street: a paved tile within ~3 m straight out from its door edge
  plotRoad(pl) {
    const [dx, dz] = DOOR_DIR[pl.door], c = plotCentre(pl), ex = c.x + dx * pl.w / 2, ez = c.z + dz * pl.d / 2;
    for (const lat of [0, -1, 1]) for (let k = 0.3; k < 3.4; k += 0.4) {
      const t = this.terrain.tile(ex + dx * k + dz * lat, ez + dz * k + dx * lat);
      if (t === T.PATH || t === T.PLAZA) return true;
    }
    return false;
  }
  // paint a whole plot with a zone (or clear it)
  zonePlot(pl, t) {
    let n = 0;
    for (let z = pl.z; z < pl.z + pl.d; z++) for (let x = pl.x; x < pl.x + pl.w; x++) { const i = z * WORLD + x; if (this.occ[i] >= 0) continue; if (this.zone[i] !== t) { this.zone[i] = t; n++; } }
    this.syncZones();
    return n;
  }
  syncZones() { this.S.zones = []; for (let i = 0; i < this.zone.length; i++) if (this.zone[i]) this.S.zones.push([i % WORLD, (i / WORLD) | 0, this.zone[i]]); }
  // the yard of a newly built plot: small plants and stones inside the lot go (the curb along the street stays), and
  // its dressing appears (details.js setPlotBuilt)
  plotBuilt(pl, on) {
    if (on) this.world.veg.clearRect(pl.x + 0.45, pl.z + 0.45, pl.x + pl.w - 0.45, pl.z + pl.d - 0.45, 0);
    this.world.details?.setPlotBuilt?.(pl.id, on);
    this.G.villageLife?.nav?.touchRect?.(pl.x - 1, pl.z - 1, pl.x + pl.w + 1, pl.z + pl.d + 1);
  }
  // rank rings (docs/VILLAGE_PLAN.md §3, 8): when the village rank first reaches a ring's rank, its stub streets are
  // paved, its plots unlock and a toast names the new district. S.ringRank never goes down.
  // A district never opens on the first day: the starter village fills its homes within seconds (10 → 12+ villagers),
  // which used to open the outer South Meadows before Chewy had done anything. It opens with the next morning.
  checkRings() {
    const V = this.S, rank = this.stats.rank, have = this.ringRank();
    if (rank <= have) return;
    if ((this.G.day?.day ?? this.G.state?.day ?? 1) <= 1) return;
    for (let r = have + 1; r <= rank; r++) {
      for (const P of PATHS) if (P.rank === r) this.openStreet(P);
      for (const D of Object.values(DISTRICTS)) if (D.ring === r) (this.ringNews ||= []).push(D.name);
    }
    V.ringRank = rank;
    this.refreshTiles(); this.paintOverlay();
    Events.emit('village:changed');
  }
  openStreet(P) {
    const tiles = this.terrain.tiles, before = tiles.slice();
    paintStreet(tiles, P);
    for (let i = 0; i < tiles.length; i++) if (tiles[i] !== before[i]) { const x = i % WORLD, z = (i / WORLD) | 0; this.zone[i] = 0; this.world.veg.clearRect(x, z, x + 1, z + 1, 0.15); }
    this.terrain.syncTiles();
  }
  // ------------------------------------------------------------------ queries
  dims(type, rot, level = 1) { const [w, d] = sizeOf(type, level); return rot % 2 ? [d, w] : [w, d]; }
  // plot: the plot this building goes on (plot buildings may use their plot's reserved tiles; free decorations may not)
  canPlace(type, x0, z0, rot, level = 1, ignore = -1, plot = null) {
    const [w, d] = this.dims(type, rot, level); const tr = this.terrain;
    let hMin = 1e9, hMax = -1e9;
    for (let z = z0; z < z0 + d; z++) for (let x = x0; x < x0 + w; x++) {
      if (x < 3 || z < 3 || x >= WORLD - 3 || z >= WORLD - 3) return { ok: false, why: 'Too close to the edge' };
      const i = z * WORLD + x;
      if (this.occ[i] >= 0 && this.occ[i] !== ignore) return { ok: false, why: 'Something is already here' };
      if (!plot && type !== 'bridge' && this.reserveTile[i] >= 0 && !(type === 'sprinkler' && this.G.life?.garden?.tiles.has(i))) return { ok: false, why: 'Keep the plots clear' }; // (a sprinkler may stand in any garden bed)
      if (type !== 'bridge' && this.world.details?.reserved.has(i)) return { ok: false, why: 'Something is already here' }; // signpost, lanterns, jizo...
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
    if (b.plot && PLOT_BY_ID[b.plot]) return this.plotRoad(PLOT_BY_ID[b.plot]);
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
  // plot: the id of the plot it goes on. Plot types (PLOT_TYPES) need one, on its spot; `force` skips every check.
  place(type, x0, z0, rot = 0, { free = false, silent = false, force = false, level = 1, plot = null, seed = null } = {}) {
    const def = BUILDINGS[type]; if (!def) return null;
    const pl = plot ? PLOT_BY_ID[plot] : null;
    let chk = pl || !this.needsPlot(type) ? this.canPlace(type, x0, z0, rot, level, -1, pl?.id || null) : { ok: false, why: 'Build it on a free plot' };
    if (chk.ok && pl && !pl.fixed) {
      const sp = this.spotFor(pl, type, level);
      chk = !pl.allows.includes(type) ? { ok: false, why: "This plot isn't for that" } : !this.plotOpen(pl) ? { ok: false, why: `This plot opens at village rank ${pl.rank}` }
        : !this.plotFree(pl) ? { ok: false, why: 'This plot is taken' } : !sp || sp.x !== x0 || sp.z !== z0 || sp.rot !== rot ? { ok: false, why: "It doesn't fit this plot" } : chk;
    }
    if (!chk.ok && !force) { if (!silent) this.G.ui?.toast?.(chk.why, { color: '#ff8a8a' }); return null; }
    if (!free) {
      if (!this.G.actions.hasMaterials(def.cost)) { if (!silent) this.G.ui?.toast?.('Not enough materials!', { color: '#ff8a8a' }); Events.emit('sfx', 'ui_error'); return null; }
      this.G.actions.spendMaterials(def.cost);
    }
    const b = { id: uid(), idx: this.nextIdx(), type, x: x0, z: z0, rot, level, seed: seed ?? this.seedFor(type, level), residents: 0, built: this.G.day?.day || 1 };
    if (pl) b.plot = pl.id;
    this.S.buildings.push(b);
    this.spawnModel(b, !silent);
    this.refreshTiles();
    if (!silent) { Events.emit('sfx', 'build_place'); Events.emit('village:changed'); this.simulate(true); this.paintOverlay(); }
    return b;
  }
  nextIdx() { let m = -1; for (const b of this.S.buildings) m = Math.max(m, b.idx ?? -1); return m + 1; }
  remove(b, refund = true) {
    if (!b || this.S.buildings.indexOf(b) < 0) return false; // already gone: no-op (splice(-1) would delete the last building)
    const rec = this.list.find(r => r.data === b);
    if (rec) this.despawn(rec);
    this.S.buildings.splice(this.S.buildings.indexOf(b), 1);
    if (b.plot && this.plotUse.get(b.plot) === b) { this.plotUse.delete(b.plot); this.plotBuilt(PLOT_BY_ID[b.plot], false); }
    if (refund) { const c = BUILDINGS[b.type].cost; for (const k in c) if (k === 'coins') this.G.actions.addCoins(Math.floor(c[k] / 2)); else this.G.actions.addMaterial(k, Math.floor(c[k] / 2)); }
    this.refreshTiles(); this.simulate(true); this.paintOverlay();
    Events.emit('sfx', 'bulldoze'); Events.emit('village:changed');
  }
  // Zones snap to plots: every open, free plot the rectangle touches that can take the zone is painted whole.
  // Painting over plotless land does nothing (this.lastZoneHits = 0; Build mode says so). t = 0 erases.
  paintZone(x0, z0, x1, z1, t) {
    const [ax, bx] = [Math.min(x0, x1), Math.max(x0, x1)], [az, bz] = [Math.min(z0, z1), Math.max(z0, z1)];
    const R = { x: ax, z: az, w: bx - ax + 1, d: bz - az + 1 };
    let n = 0, hits = 0;
    for (const pl of PLOTS) {
      if (pl.fixed || !rectsOverlap(pl, R, -0.01)) continue;
      if (t && (!this.plotOpen(pl) || !this.plotFree(pl) || !plotZones(pl).includes(t))) continue;
      hits++; n += this.zonePlot(pl, t);
    }
    if (!t) for (let z = az; z <= bz; z++) for (let x = ax; x <= bx; x++) { const i = z * WORLD + x; if (this.zone[i]) { this.zone[i] = 0; n++; } } // (loose zone tiles from old saves)
    this.lastZoneHits = hits;
    this.syncZones();
    this.paintOverlay();
    return n;
  }
  paintPath(x, z, on = true) {
    const i = z * WORLD + x, t = this.terrain.tiles[i];
    if (on) { if (t !== T.GRASS || this.occ[i] >= 0 || this.reserveTile[i] >= 0) return false; this.terrain.tiles[i] = T.PATH; this.zone[i] = 0; this.S.paths.push([x, z]); this.world.veg.clearRect(x, z, x + 1, z + 1, 0.1); }
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
    const model = buildModel(b.type, { level: b.level, seed: b.seed, style: b.style || null }); // (b.style: a remodelled look, docs/HOUSING.md §6)
    const g = new THREE.Group(); g.add(model.group);
    const p = this.worldPos(b);
    g.position.copy(p); g.rotation.y = -b.rot * Math.PI / 2;
    // Only real buildings get the occlusion cutaway and may trigger the x-ray silhouette; small models (decor,
    // lanterns, wells, stalls) swap to propTwin() materials (see above).
    const [fw, fd] = this.dims(b.type, b.rot, b.level);
    const box = new THREE.Box3().setFromObject(model.group), tall = box.max.y - box.min.y > 1.7;
    const occluder = BUILDINGS[b.type].cat !== 'decor' && tall && fw * fd >= 4;
    const bushy = !occluder && box.max.y - box.min.y > 1.75 && Math.min(box.max.x - box.min.x, box.max.z - box.min.z) > 1.1;
    g.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = o.castShadow !== false; o.receiveShadow = true;
      const m = o.material; if (!m?.userData?.u?.uOcclOn) return;
      if (occluder) { m.userData.u.uOcclOn.value = 1; markOccluder(m); } else o.material = propTwin(m, bushy);
    });
    this.group.add(g);
    const [w, d] = this.dims(b.type, b.rot, b.level);
    for (let z = b.z; z < b.z + d; z++) for (let x = b.x; x < b.x + w; x++) { this.occ[z * WORLD + x] = b.idx; this.zone[z * WORLD + x] = 0; }
    const pl = b.plot && PLOT_BY_ID[b.plot];
    if (pl) {
      const was = this.plotUse.get(pl.id) === b;
      this.plotUse.set(pl.id, b);
      for (let z = pl.z; z < pl.z + pl.d; z++) for (let x = pl.x; x < pl.x + pl.w; x++) this.zone[z * WORLD + x] = 0; // the whole lot is built on now
      if (!was) this.plotBuilt(pl, true);
    }
    // collision (skip walk-through decor and the bridge, which is a deck)
    const def = BUILDINGS[b.type];
    let col = null;
    const inset = def.cat === 'decor' ? 0.25 : 0.12;
    if (!['flowerBed', 'bridge', 'fence'].includes(b.type) && b.type !== 'park') col = this.world.collision.addRect(b.x + inset, b.z + inset, b.x + w - inset, b.z + d - inset, 'building');
    let deck = null;
    if (b.type === 'bridge') { this.addBridgeDeck(b, model); deck = this._deck; }
    if (def.cat === 'decor' || !this.world.veg.clearAround) this.world.veg.clearRect(b.x, b.z, b.x + w, b.z + d, 0.6);
    else this.world.veg.clearAround(b.x, b.z, b.x + w, b.z + d);
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
    if (animate) { g.scale.set(1, 0.01, 1); this.rising.push({ rec, t: 0 }); this.vfx?.dustRing?.(p, Math.max(w, d) * 0.6); }
    this.nightVal = -1;
    return rec;
  }
  despawn(rec) {
    this.group.remove(rec.group);
    releaseModel(rec.model); // (its template may be evicted again: buildings/index.js)
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
      case 'fishingHut': return mk("Kero's Fishing Hut", () => G.openFishHut?.()); // (rods, and fish sell best here: docs/HOMESTEAD.md)
      case 'lumber': return mk('Use the workbench 🔨', () => G.openWorkbench?.('lumber')); // (furniture crafting: docs/HOUSING.md §3)
      default: return G.housing?.doorInter?.(b, door) || null; // (a named villager's home: visit / knock — home/housing.js)
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
    // the street lanterns (details.js streetLamps) light their street like Lantern Posts
    const lamp = BUILDINGS.streetLamp?.covers?.find(c => c.kind === 'light'), arr = this.cover.light;
    if (lamp) for (const l of this.world.details?.lamps || []) {
      const r = lamp.r;
      for (let z = Math.max(0, Math.floor(l.z - r)); z <= Math.min(WORLD - 1, Math.ceil(l.z + r)); z++) for (let x = Math.max(0, Math.floor(l.x - r)); x <= Math.min(WORLD - 1, Math.ceil(l.x + r)); x++) {
        const dd = Math.hypot(x + 0.5 - l.x, z + 0.5 - l.z); if (dd > r) continue;
        const i = z * WORLD + x; arr[i] = Math.min(1.5, arr[i] + 1 - (dd / r) * 0.6);
      }
    }
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
      if (def.cat === 'home') { S.homes++; S.population += b.residents || 0; const h = (q.road ? 0.3 : 0) + q.water * 0.25 + q.joy * 0.25 + q.light * 0.1 + q.health * 0.05 + q.learn * 0.05 + homeJoy(b); b.happy = h; hap += h; nh++; }
      if (def.jobs) { const j = def.jobs[Math.min(def.jobs.length - 1, b.level - 1)] || 0; S.jobs += j; if (def.cat === 'shop') { S.shops++; cJobs += j; } if (def.cat === 'craft') { S.workshops++; wJobs += j; } }
    }
    S.happiness = (nh ? hap / nh : 0.5) + (this.S.buildings.some(b => b.type === 'chewyHouse' && b.homeStars >= 5) ? 0.03 : 0); // (a five-star cottage: a little joy for everyone)
    const pop = S.population;
    this.demand.R = clamp((S.jobs + 6 + S.happiness * 8 - pop) / 12, -1, 1);
    this.demand.C = clamp((pop * 0.45 - cJobs + 2) / 8, -1, 1);
    this.demand.W = clamp((pop * 0.35 - wJobs + 1) / 8, -1, 1);
    S.rank = pop >= 80 ? 5 : pop >= 50 ? 4 : pop >= 28 ? 3 : pop >= 12 ? 2 : 1;
    this.checkRings();
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
      if (b.residents < cap && this.demand.R > -0.2 && R() < 0.5) { b.residents++; this.news('villagers'); }
    }
    // new building on a zoned lot
    for (const [key, t] of [['R', ZONES.R], ['C', ZONES.C], ['W', ZONES.W]]) {
      if (this.demand[key] <= 0.05 || R() > 0.6) continue;
      const lot = this.findLot(t);
      if (lot) { const b = this.place(lot.type, lot.x, lot.z, lot.rot, { free: true, silent: false, plot: lot.plot }); if (b) { this.news(key === 'R' ? 'homes' : key === 'C' ? 'shops' : 'workshops'); this.ping(b); return; } }
    }
    // level ups
    for (const b of V.buildings) {
      const def = BUILDINGS[b.type]; if (this.atCap(b) || !def.zone || !b.q?.road) continue;
      const need = b.level === 1 ? (b.q.water > 0.2 && b.q.joy > 0.25) : (b.q.water > 0.3 && b.q.joy > 0.5 && b.q.light > 0.2 && (b.q.health > 0.2 || b.q.learn > 0.2));
      const dem = this.demand[def.zone];
      if (need && dem > -0.1 && R() < 0.35) { if (this.levelUp(b)) return; }
    }
  }
  // place near (cx,cz) between radii r0..r1 on the best lot with path access (decor may sit on grass by paths); plot
  // types take the nearest free open plot that allows them
  autoPlace(type, cx, cz, r0, r1, decor = false) {
    if (this.needsPlot(type)) {
      const opts = PLOTS.filter(pl => !pl.fixed && pl.allows.includes(type) && this.plotOpen(pl) && this.plotFree(pl))
        .map(pl => { const c = plotCentre(pl); return { pl, d: Math.hypot(c.x - cx, c.z - cz) }; }).filter(o => o.d >= r0 - 4 && o.d <= r1 + 6).sort((a, b) => a.d - b.d);
      for (const { pl } of opts) { const sp = this.spotFor(pl, type, 1); if (sp && this.canPlace(type, sp.x, sp.z, sp.rot, 1, -1, pl.id).ok) return this.place(type, sp.x, sp.z, sp.rot, { free: true, silent: true, plot: pl.id }); }
      return null;
    }
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
  // zone n free open plots that can take zone t, r0..r1 from the plaza (nearest first)
  autoZone(t, n, r0, r1) {
    const P = LANDMARKS.plaza;
    const opts = PLOTS.filter(pl => !pl.fixed && this.plotOpen(pl) && this.plotFree(pl) && plotZones(pl).includes(t) && !this.plotZone(pl))
      .map(pl => { const c = plotCentre(pl); return { pl, d: Math.hypot(c.x - P.x, c.z - P.z) }; }).filter(o => o.d >= r0 && o.d <= r1).sort((a, b) => a.d - b.d);
    let made = 0;
    for (const { pl } of opts) { if (made >= n) break; if (this.zonePlot(pl, t)) made++; }
    this.paintOverlay();
    return made;
  }
  // (the pre-plot zone painter: square blocks beside paths)
  autoZoneBlocks(t, n, r0, r1, size) {
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
  // the best free open plot painted with zoneType, for one of the zone's types the plot allows (nearest the plaza
  // first, with a little chance): { x, z, rot, plot, type } or null
  findLot(zoneType, type = null) {
    const cands = [];
    for (const pl of PLOTS) {
      if (pl.fixed || !this.plotOpen(pl) || !this.plotFree(pl) || this.plotZone(pl) !== zoneType) continue;
      const types = ZONE_TYPES[zoneType].filter(t => pl.allows.includes(t) && (!type || t === type)); if (!types.length) continue;
      const t = pick(types), sp = this.spotFor(pl, t, 1);
      if (!sp || !this.canPlace(t, sp.x, sp.z, sp.rot, 1, -1, pl.id).ok || !this.plotRoad(pl)) continue;
      const c = plotCentre(pl);
      cands.push({ x: sp.x, z: sp.z, rot: sp.rot, plot: pl.id, type: t, score: -Math.hypot(c.x - PLAZA.x, c.z - PLAZA.z) * 0.04 + Math.random() * 1.2 });
    }
    cands.sort((a, b) => b.score - a.score);
    return cands[0] || null;
  }
  // (the pre-plot lot finder, kept for loose zone tiles in old saves)
  findLooseLot(zoneType, type) {
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
    if (b.plot && PLOT_BY_ID[b.plot]) return this.plotRoad(PLOT_BY_ID[b.plot]);
    const [w, d] = this.dims(b.type, b.rot); const dirs = [[0, 1], [-1, 0], [0, -1], [1, 0]][b.rot];
    const cx = b.x + w / 2 + dirs[0] * (w / 2 + 0.5), cz = b.z + d / 2 + dirs[1] * (d / 2 + 0.5);
    const t = this.terrain.tile(cx, cz); return t === T.PATH || t === T.PLAZA;
  }
  // collect growth events and report them as one friendly digest (at most about once a minute)
  news(kind) {
    this.digest ||= {}; this.digest[kind] = (this.digest[kind] || 0) + 1;
    this.digestT ??= 20;
  }
  flushDigest(force = false) {
    const d = this.digest; if (!d) return;
    const parts = [];
    if (d.homes) parts.push(`+${d.homes} home${d.homes > 1 ? 's' : ''}`);
    if (d.shops) parts.push(`+${d.shops} shop${d.shops > 1 ? 's' : ''}`);
    if (d.workshops) parts.push(`+${d.workshops} workshop${d.workshops > 1 ? 's' : ''}`);
    if (d.upgrades) parts.push(`${d.upgrades} upgrade${d.upgrades > 1 ? 's' : ''}`);
    if (d.villagers) parts.push(`+${d.villagers} villager${d.villagers > 1 ? 's' : ''}`);
    if (parts.length) this.G.ui?.toast?.(`Blossom Hollow grew: ${parts.join(', ')}`, { color: '#8fe0c0', icon: 'home' });
    this.digest = null; this.digestT = null;
  }
  // visible world ping where something new appeared (sparkle pillar + heart)
  ping(b, color = '#ffb0d0') {
    const p = this.worldPos(b);
    this.vfx?.pillar?.(p, { color, life: 2.2, r: 0.9, h: 6, opacity: 0.6 });
    this.vfx?.sparkle?.(p.clone().setY(p.y + 1.5), { n: 18, color, r: 1.5 });
  }
  // Where the next-level footprint fits: any anchor that still covers the current lot and keeps path access,
  // preferring the one that grows over the most zoned tiles. → { x, z } or { why } (reason for the same-corner try)
  growSpot(b) {
    const nl = b.level + 1, pl = b.plot && PLOT_BY_ID[b.plot];
    if (pl && !pl.fixed) { // on a plot: centred, the front stays on the setback line, it grows toward the back of the lot
      const sp = this.spotFor(pl, b.type, nl);
      if (!sp) return { why: 'Too big for its plot' };
      const c = this.canPlace(b.type, sp.x, sp.z, b.rot, nl, b.idx, pl.id);
      return c.ok ? { x: sp.x, z: sp.z } : { why: c.why };
    }
    const [w1, d1] = this.dims(b.type, b.rot, b.level), [w2, d2] = this.dims(b.type, b.rot, nl);
    if (w1 === w2 && d1 === d2) return { x: b.x, z: b.z };
    let best = null, bestScore = -1, why = null;
    for (let dz = 0; dz <= Math.max(0, d2 - d1); dz++) for (let dx = 0; dx <= Math.max(0, w2 - w1); dx++) {
      const x = b.x - dx, z = b.z - dz, first = !dx && !dz;
      const c = this.canPlace(b.type, x, z, b.rot, nl, b.idx);
      if (!c.ok) { if (first) why = c.why; continue; }
      if (!this.roadAccess({ type: b.type, rot: b.rot, level: nl, x, z })) { if (first) why = 'No path next to it'; continue; }
      let score = 0;
      for (let zz = z; zz < z + d2; zz++) for (let xx = x; xx < x + w2; xx++) if (this.zone[zz * WORLD + xx]) score++;
      if (score > bestScore) { bestScore = score; best = { x, z }; }
    }
    return best || { why: why || 'Something is already here' };
  }
  levelUp(b) {
    if (this.atCap(b)) return false; // (its type's top level, or the biggest its plot holds)
    const nl = b.level + 1;
    const spot = this.growSpot(b);
    if (spot.why) return false;
    this.despawn(this.list.find(r => r.data === b));
    b.x = spot.x; b.z = spot.z;
    b.level = nl; // (the seed and the style stay: a house keeps its look as it grows — docs/HOUSING.md §5)
    const rec = this.spawnModel(b, true);
    Events.emit('building:levelup', { b, level: nl });
    this.refreshTiles();
    this.vfx?.levelUp?.(this.worldPos(b));
    this.news('upgrades'); this.ping(b, '#ffd84a');
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
    this.checkRings(); // (a rank reached on day 1 opens its district this morning)
  }
  // ------------------------------------------------------------------ overlays (build mode)
  setOverlay(mode) { this.overlayMode = mode; this.paintOverlay(); this.terrain.material.userData.u.uOverlayAmt.value = mode ? 1 : 0; }
  // Build mode overlay. Plots: a mown-lawn tint on free open plots, the district's tint on built ones, grey on plots (and
  // stub streets) a rank ring still keeps locked; neighbouring plots alternate their alpha a little so every lot gets
  // its own outline. Painted zones on top in their zone colours. Coverage modes show only the coverage.
  paintOverlay() {
    const D = this.terrain.overlayData, mode = this.overlayMode;
    D.fill(0);
    if (!mode) { this.terrain.overlayTex.needsUpdate = true; return; }
    const set = (i, c, a) => { D[i * 4] = c[0]; D[i * 4 + 1] = c[1]; D[i * 4 + 2] = c[2]; D[i * 4 + 3] = a; };
    if (COVER_KINDS.includes(mode)) {
      for (let i = 0; i < WORLD * WORLD; i++) { const v = this.cover[mode][i]; if (v > 0) set(i, COVER_COLORS[mode], Math.min(200, v * 170)); }
    } else if (mode === 'zones' || mode === 'build') {
      const rank = this.ringRank();
      PLOTS.forEach((pl, k) => {
        const open = (pl.rank || 1) <= rank, used = !this.plotFree(pl), alt = (k % 2) * 26;
        const c = !open ? [150, 150, 168] : used ? hexRGB(DISTRICTS[pl.district]?.color || '#ffffff') : [206, 236, 150];
        const a = !open ? 110 + alt : used ? 70 + alt : 104 + alt;
        for (let z = pl.z; z < pl.z + pl.d; z++) for (let x = pl.x; x < pl.x + pl.w; x++) set(z * WORLD + x, c, a);
      });
      for (const i of this.lockedStreetTiles()) set(i, [168, 168, 180], 150);
      for (let i = 0; i < WORLD * WORLD; i++) { const z = this.zone[i]; if (z) set(i, ZONE_COLORS[z], 185); }
    }
    this.terrain.overlayTex.needsUpdate = true;
  }
  // tiles of the stub streets the rank rings still keep locked (cached per ring rank)
  lockedStreetTiles() {
    const rank = this.ringRank();
    if (this._lockedRank === rank) return this._locked;
    const tiles = new Uint8Array(WORLD * WORLD), out = [];
    for (const P of PATHS) if (P.rank > rank) paintStreet(tiles, P); // (T.PATH = 1 marks them)
    for (let i = 0; i < tiles.length; i++) if (tiles[i] === T.PATH) out.push(i);
    this._lockedRank = rank; this._locked = out;
    return out;
  }
  // ------------------------------------------------------------------ per frame
  update(dt, t) {
    // rising animation for new buildings
    for (let i = this.rising.length - 1; i >= 0; i--) {
      const r = this.rising[i]; r.t += dt; const k = Math.min(1, r.t / 0.7);
      r.rec.group.scale.set(1 + Math.sin(k * Math.PI) * 0.08, ease.outBack(k), 1 + Math.sin(k * Math.PI) * 0.08);
      if (Math.random() < 0.4) this.vfx?.dust?.(r.rec.group.position.clone().add(new THREE.Vector3(rand(-1, 1), 0, rand(-1, 1))), { n: 1, size: 0.4 });
      if (k >= 1) { this.rising.splice(i, 1); this.vfx?.petals?.(r.rec.group.position.clone().setY(r.rec.group.position.y + 1.5), 16, 1.2); Events.emit('sfx', 'build_complete'); }
    }
    for (const r of this.list) r.model.update?.(dt, t);
    const n = this.G.day?.out?.night ?? 0;
    if (Math.abs(n - this.nightVal) > 0.02) { this.nightVal = n; for (const r of this.list) setNight(r.model, n); }
    // growth pauses on the title screen, during conversations and while in the Burrow
    const G = this.G, busy = G.titleActive || (G.mode !== 'village' && G.mode !== 'interior') || G.ui?.dlg?.active || G.player?.controlLocked; // (indoors the village keeps growing)
    if (!busy) {
      this.tickT += dt;
      if (this.tickT > 6) { this.tickT = 0; this.simulate(); this.grow(); this.simulate(); }
      if (this.digestT != null) { this.digestT -= dt; if (this.digestT <= 0) this.flushDigest(); }
      this.calmT = (this.calmT || 0) + dt;
      if (this.S.migrationNote && G.ui?.toast && !G.ui.anyModal?.() && this.calmT > 2.5) {
        G.ui.toast('Blossom Hollow has grown! Everyone moved into the new town plan.', { color: '#ffd27a', icon: 'home' });
        delete this.S.migrationNote; (this.migration ||= {}).toastShown = (this.migration.toastShown || 0) + 1;
        Events.emit('sfx', 'ui_levelup');
      }
      if (this.ringNews?.length && G.ui?.toast && !G.ui.anyModal?.()) {
        for (const name of this.ringNews) G.ui.toast(`New district: ${name}!`, { color: '#ffd27a', icon: 'home' });
        this.ringNews = null; Events.emit('sfx', 'ui_levelup');
      }
    }
    this.needIcons?.update(dt, t);
  }
  // ------------------------------------------------------------------ planning feedback (build-mode inspector + need bubbles)
  // Coverage the next level asks for: [{kind, need, have, ok}] ([] at max level / for non-zoned buildings).
  levelNeeds(b) {
    const def = BUILDINGS[b.type]; if (!def?.zone || this.atCap(b)) return [];
    const q = b.q || this.quality(b);
    return LEVEL_NEEDS[Math.min(2, b.level)].map(([kind, need]) => { const have = kind === 'care' ? Math.max(q.health, q.learn) : q[kind]; return { kind, need, have, ok: have > need }; });
  }
  // can the building expand to its next-level footprint where it stands?
  roomToGrow(b) { return !this.growBlock(b); }
  // why the next-level footprint doesn't fit (null when it does) — same check as levelUp()
  growBlock(b) {
    const def = BUILDINGS[b.type]; if (this.atCap(b)) return null;
    const c = this.growSpot(b);
    return !c.why ? null : ({ 'No path next to it': 'it would lose its path', 'Keep the paths clear': 'a path is in the way', 'Something is already here': 'a neighbour is in the way', 'Too wet!': 'water is in the way', 'Ground is too bumpy': 'the ground is too bumpy', 'The plaza is for decorations': 'the plaza is in the way', 'Too rocky': 'rocks are in the way' }[c.why] || String(c.why || 'blocked').toLowerCase());
  }
  // what a zoned building is missing, most urgent first (for the floating need bubbles): 'road'|'water'|'joy'|'light'|'care'|'room'
  needsFor(b) {
    const def = BUILDINGS[b.type]; if (!def?.zone) return [];
    const q = b.q || this.quality(b);
    if (!q.road) return ['road'];
    const out = this.levelNeeds(b).filter(n => !n.ok).map(n => n.kind);
    if (!out.length && def.cat === 'home' && (b.happy ?? 1) < 0.35) out.push('joy');
    if (!out.length && !this.roomToGrow(b)) out.push('room');
    return out.slice(0, 2);
  }
  showNeedIcons(on) {
    if (on && !this.needIcons) this.needIcons = new NeedIcons(this);
    this.needIcons?.setVisible(on);
  }
  // Build-mode hover card for a tile: { kind, title, sub, cat, stats:[{g,text}], lines:[{text, ok, kind, have, need, val}], blockers:[text], hint, ok } or null
  inspect(x, z) {
    x = Math.floor(x); z = Math.floor(z);
    if (!(x >= 0 && z >= 0 && x < WORLD && z < WORLD)) return null;
    const b = this.buildingAt(x, z);
    if (b) return this.inspectBuilding(b);
    const zt = this.zone[z * WORLD + x];
    if (zt) return this.inspectZone(x, z, zt);
    const pl = this.plotOf(x, z);
    return pl ? this.inspectPlot(pl) : null;
  }
  // an empty plot: what it's for, how big it can grow, whether a rank ring still locks it
  inspectPlot(pl) {
    const D = DISTRICTS[pl.district], open = this.plotOpen(pl), used = this.plotUse.get(pl.id);
    if (used) return this.inspectBuilding(used);
    const words = { home: 'homes', shop: 'shops', farm: 'farms', lumber: 'workshops', kiln: 'workshops', fishingHut: 'workshops', park: 'parks', well: 'wells', waterTower: 'water towers', clinic: 'a clinic', school: 'a school', shrine: 'the shrine', onsen: 'the hot spring', boneSmith: 'the forge', koiStatue: 'statues', chewyStatue: 'statues', miniTorii: 'small gardens', sakuraPlanter: 'small gardens', fountain: 'a fountain' };
    const fors = [...new Set(pl.allows.map(t => words[t] || BUILDINGS[t]?.name || t))];
    const info = { kind: 'plot', title: `${D?.name || 'Village'} plot`, sub: open ? 'Free plot' : `Opens at village rank ${pl.rank}`, stats: [], lines: [], blockers: [], hint: '', ok: open };
    info.lines.push({ kind: 'lot', text: `For ${fors.slice(0, 3).join(', ')}${fors.length > 3 ? '…' : ''}`, ok: true, info: true });
    info.lines.push({ kind: 'lot', text: `Up to ${pl.max}×${pl.max}`, ok: true, info: true });
    info.lines.push({ kind: 'road', text: NEED_NAME.road, ok: this.plotRoad(pl), val: this.plotRoad(pl) ? 'yes' : 'none' });
    if (!open) info.blockers.push(`Grow the village to rank ${pl.rank} (${RANK_POP[pl.rank - 1]} villagers) to open ${D?.name || 'this district'}.`);
    else { const z = plotZones(pl); info.hint = z.length ? `Paint a ${z.map(k => ZONE_INFO[ZONE_KEY[k]].word).join(' or ')} zone here and villagers will build.` : 'Pick it from the palette and click this plot to build.'; }
    return info;
  }
  inspectBuilding(b) {
    const def = BUILDINGS[b.type], q = b.q || this.quality(b);
    const info = { kind: 'building', id: b.id, type: b.type, cat: def.cat, zone: def.zone || null, title: def.name, sub: '', stats: [], lines: [], blockers: [], hint: '', ok: true };
    const catName = { home: 'Home', shop: 'Shop', craft: 'Workshop', service: 'Service', decor: 'Decoration', special: 'Landmark' }[def.cat] || '';
    info.sub = def.levels > 1 ? `Level ${b.level} of ${def.levels} · ${catName}` : catName;
    if (def.cat === 'home') {
      const cap = def.capacity?.[b.level - 1] ?? 0;
      info.stats.push({ g: 'home', text: `${b.residents || 0}/${cap} residents` }, { g: 'heart', text: `${pct(clamp(b.happy ?? 0))} happy` });
    }
    const jobs = def.jobs ? def.jobs[Math.min(def.jobs.length - 1, b.level - 1)] || 0 : 0;
    if (jobs) info.stats.push({ g: 'craft', text: `${jobs} job${jobs === 1 ? '' : 's'}` });
    if (!def.zone) {
      // services, decor and landmarks: say what they give the neighbourhood
      for (const c of def.covers || []) info.lines.push({ kind: c.kind, text: `Gives ${NEED_NAME[c.kind].toLowerCase()} within ${c.r} tiles`, ok: true, info: true });
      if (!info.lines.length && def.desc) info.note = def.desc;
      return info;
    }
    // zoned building: its needs for the next level (or its current comfort when fully grown)
    info.lines.push({ kind: 'road', text: NEED_NAME.road, ok: !!q.road, val: q.road ? 'yes' : 'none' });
    const needs = this.levelNeeds(b);
    if (needs.length) for (const n of needs) info.lines.push({ kind: n.kind, text: NEED_NAME[n.kind], ok: n.ok, have: clamp(n.have), need: n.need, val: pct(clamp(n.have)) });
    else for (const k of ['water', 'joy', 'light']) info.lines.push({ kind: k, text: NEED_NAME[k], ok: q[k] > 0.2, have: clamp(q[k]), val: pct(clamp(q[k])), info: true });
    const zi = ZONE_INFO[def.zone], dem = this.demand[def.zone];
    if (!q.road) info.blockers.push("No path beside it — villagers can't reach it, move in or upgrade. Lay a path next to it.");
    if (def.cat === 'home' && q.road && (b.residents || 0) < (def.capacity?.[b.level - 1] ?? 0) && dem <= MOVE_IN_DEMAND) info.blockers.push(`Nobody wants to move in (homes demand ${sgn(dem)}) — villagers need jobs: zone shops & workshops.`);
    if (this.plotCapped(b)) { info.hint = 'Fully grown for its plot!'; info.ok = !info.blockers.length; return info; }
    if (needs.length) {
      info.needFor = b.level + 1;
      for (const n of needs) if (!n.ok) info.blockers.push(`Needs more ${NEED_NAME[n.kind].toLowerCase()} (${pct(clamp(n.have))} of ${pct(n.need)}) — build ${NEED_FIX[n.kind]} nearby.`);
      if (dem <= LEVEL_DEMAND) info.blockers.push(`Low demand for ${zi.word} (${sgn(dem)}) — it waits until villagers want more.`);
      const gb = this.growBlock(b);
      if (gb) { const [w2, d2] = this.dims(b.type, b.rot, b.level + 1); info.blockers.push(`No room to expand to ${w2}×${d2} — ${gb}.`); }
      info.hint = info.blockers.length ? '' : `Ready to grow — it will reach level ${b.level + 1} soon!`;
    } else info.hint = 'Fully grown!';
    info.ok = !info.blockers.length;
    return info;
  }
  inspectZone(x, z, zt) {
    const key = ZONE_KEY[zt], zi = ZONE_INFO[key], dem = this.demand[key];
    // is there a buildable lot through this tile? (same test as findLot: inside the zone, placeable, path access)
    let fit = null, noRoad = null, why = null;
    const pl = this.plotOf(x, z);
    if (pl) {
      for (const type of zi.types) {
        if (!pl.allows.includes(type)) continue;
        const sp = this.spotFor(pl, type, 1); if (!sp) continue;
        const c = this.canPlace(type, sp.x, sp.z, sp.rot, 1, -1, pl.id);
        if (!c.ok) { why ||= c.why; continue; }
        if (this.plotRoad(pl)) { fit = { type, w: sp.w, d: sp.d }; break; }
        noRoad ||= { type, w: sp.w, d: sp.d };
      }
    }
    if (!pl) search: for (const type of zi.types) for (const rot of [0, 1]) {
      const [w, d] = this.dims(type, rot);
      for (let z0 = z - d + 1; z0 <= z; z0++) for (let x0 = x - w + 1; x0 <= x; x0++) {
        let inside = true;
        for (let zz = z0; zz < z0 + d && inside; zz++) for (let xx = x0; xx < x0 + w && inside; xx++) if (this.zone[zz * WORLD + xx] !== zt) inside = false;
        if (!inside) continue;
        const c = this.canPlace(type, x0, z0, rot);
        if (!c.ok) { why ||= c.why; continue; }
        if (this.roadAccess({ type, x: x0, z: z0, rot, level: 1 })) { fit = { type, w, d }; break search; }
        noRoad ||= { type, w, d };
      }
    }
    const lot = fit || noRoad;
    const minSize = key === 'W' ? '2×3' : '2×2';
    const info = { kind: 'zone', zone: key, title: zi.name, sub: pl ? `${DISTRICTS[pl.district]?.name || ''} plot` : 'No plot', stats: [], lines: [], blockers: [], hint: '', ok: false };
    info.lines.push({ kind: 'demand', text: `Demand for ${zi.word}`, ok: dem > GROW_DEMAND, val: sgn(dem) });
    info.lines.push({ kind: 'lot', text: lot ? `Room for a ${lot.w}×${lot.d} lot` : `Needs a ${minSize} block`, ok: !!lot });
    info.lines.push({ kind: 'road', text: NEED_NAME.road, ok: !!fit, val: fit ? 'yes' : 'none' });
    // coverage here decides how far a future building can grow
    for (const [k, need] of LEVEL_NEEDS[1]) { const have = clamp(this.coverAt(k, x + 0.5, z + 0.5)); info.lines.push({ kind: k, text: NEED_NAME[k], ok: have > need, have, need, val: pct(have), info: true }); }
    if (!pl) info.blockers.push('Zones only grow on plots — paint over the marked lots.');
    else if (!lot) info.blockers.push(why && why !== 'Something is already here' ? `Can't build here: ${why.toLowerCase()}.` : `Zone is too small — paint at least a ${minSize} block.`);
    else if (!fit) info.blockers.push('No path beside this lot — lay a path next to it.');
    if (dem <= GROW_DEMAND) info.blockers.push(key === 'R' ? `No demand for homes (${sgn(dem)}) — villagers want jobs & joy first: zone shops and workshops.` : `No demand for ${zi.word} (${sgn(dem)}) — grow more homes first.`);
    info.ok = !info.blockers.length;
    info.hint = info.ok ? 'Villagers will build here soon!' : '';
    return info;
  }
}

