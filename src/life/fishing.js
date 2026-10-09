// Fishing: cast, bite, reel (docs/HOMESTEAD.md §3). With a rod (Kero's gift, or the Fishing Hut), standing at the
// water's edge facing water — any village shore (pond, river, the waterfall pool, the sea, the dock's end) or a
// region's water (bamboo creeks, maple ponds, tide pools; not hot-spring pools) — F prompts "Fish". Yukimi Onsen's
// water is all ice or hot springs, so there you stand on the frozen pond and fish through a hole in the ice. The flow:
// cast (rodCast pose, the float arcs out ~3.3 m, far enough to clear the hero's head from the camera) → wait 2-8 s with
// teasing nibbles (an early press: "Not yet…", the first of a cast forgiven; Relaxed and the guide forgive them all) →
// bite (a big "!" at the float, a splash, the float dips, a ping, a buzz on touch and a rumble on the pad: press F / LMB /
// tap within the rod's window; a miss and the fish nibbles again, once (Relaxed: twice)) → the reel bar (ui/reel.js,
// physics in reelSim.js; the first catch ever and the guide always land) → the catch arcs out of the water over the
// player's head into the pantry, with its size, the Fish Log record and the toast. WASD gives up at any time; getting
// hurt or leaving the area ends it. While a session runs the camera leans toward the float (frameFocus).
// Settings › Fishing (fishMode): 0 Auto (Relaxed while touch plays) · 1 Normal · 2 Relaxed (fishData.js reelParams).
//
// One interactable per world (pushed into the village once, and into each region world on arrival), its label and
// position following the shore in front of the player, as the garden's does.
import * as THREE from 'three';
import { Events } from '../core/events.js';
import { Input } from '../core/input.js';
import { Actions } from '../core/actions.js';
import { Touch } from '../core/touch.js';
import { makeToon, makeOutline } from '../gfx/materials.js';
import { POND, BASIN, RIVER_W } from '../world/layout.js';
import { riverDist } from '../world/islandShape.js';
import { PANTRY } from './pantry.js';
import { FISH, SPOTS, rollFish, rollSize, recordCatch, fishLogOf, fishingOf, timeOf, reelParams } from './fishData.js';
import { ReelSim } from './reelSim.js';
import { bobberGeo, fishGeo, iceHoleGeo, ROD_TIP } from './fishModels.js';
import { pantryIcon } from './pantryIcons.js';

const MOVE = ['w', 'a', 's', 'd', 'up', 'down', 'left', 'right', 'space', 'escape'];
const ROD_NAMES = ['', 'Bamboo Rod', 'Moonlit Rod'];
export const CAST = 3.3; // how far the float lands (m; less where the water is narrower)
const FLOAT_K = 1.9; // the float's size (a toy float: it must read on a phone at the game camera)
const HOWTO_REELS = 3; // the first reels show the "how to" on the card
const _w = new THREE.Vector3(), _a = new THREE.Vector3(), _v = new THREE.Vector3(), _b = new THREE.Vector3();
const rand = (a, b) => a + Math.random() * (b - a);
// the fishing meshes' own materials: they visit region scenes, whose teardown disposes what it finds, so they must not
// share the village buildings' MATS() (a disposed material just recompiles, but the whole village would hitch)
let _mats = null;
const fishMats = () => (_mats ||= { body: makeToon({ vertexColors: true, brush: 0.15, brushScale: 0.5, rim: 0.5, term: [-0.06, 0.34], shadowSat: 0.4 }), ink: makeOutline('#3a2230', 0.021) });

export class Fishing {
  constructor(G, tools) {
    this.G = G; this.tools = tools; this.s = null; this.target = null; this.world = null;
    this.tut = null; // the fishing guide's easier first cast: { biteAfter, window, fish, zone, drain, floor, forgiveEarly, retryBite } (world/guides.js)
    this.fk = 0; this.fp = { x: 0, z: 0 }; // the camera's lean toward the float (0..1, eased) and where it leans
    const self = this;
    this.inter = { pos: new THREE.Vector3(-999, -50, -999), radius: 0.95, fishing: true, get label() { return self.label(); }, onInteract: () => self.start() };
    // the float and its line (one each, moved into whichever scene the session is in)
    this.bobber = new THREE.Mesh(bobberGeo(), fishMats().body); this.bobber.castShadow = false; this.bobber.name = 'fishing:float'; this.bobber.scale.setScalar(FLOAT_K);
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(18 * 3), 3));
    this.line = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: '#fbf6ff', transparent: true, opacity: 0.85 })); this.line.frustumCulled = false; this.line.name = 'fishing:line';
    this.fishMeshes = new Map();
    this.hole = new THREE.Mesh(iceHoleGeo(), fishMats().body); this.hole.receiveShadow = true; this.hole.name = 'fishing:iceHole';
  }
  get F() { return fishingOf(this.G.state); }
  get rod() { return this.F.rod || 0; }
  /** the world we can fish in right now (the village, or an outdoor region) */
  fishable() { const G = this.G; return G.mode === 'village' || !!G.dungeon?.isRegion; }
  /** Settings › Fishing: 0 Auto (Relaxed while touch plays: a thumb on glass reacts later than a key, and covers some of
   *  the screen) · 1 Normal · 2 Relaxed (a wider zone, half the drain, a longer bite window, early presses forgiven) */
  relaxed() { const m = this.G.ui?.settings?.fishMode || 0; return m === 2 || (m === 0 && Actions.device === 'touch'); }
  /** the reel and bite numbers for the rod and the setting (fishData.js reelParams) */
  params() { return reelParams(this.rod, { relaxed: this.relaxed() }); }
  ensureInteractable() {
    const W = this.G.world; if (W === this.world) return;
    this.world = W;
    if (this.fishable() && !W.interactables.includes(this.inter)) W.interactables.push(this.inter);
  }
  // ---------------------------------------------------------------- the water
  /** water at (x, z) → { depth, y (surface) } or null. Decks, ice and hot-spring pools don't count. */
  water(x, z) {
    const G = this.G, W = G.world;
    if (W.deckAt?.(x, z)) return null;
    if (G.mode === 'village') { const h = W.terrain.heightAt(x, z); return h < -0.05 ? { depth: -h, y: 0 } : null; }
    if (W.pools?.some(p => (x - p.x) ** 2 + (z - p.z) ** 2 < p.r * p.r)) return null;
    const d = W.waterAt?.(x, z) || 0; return d > 0.05 ? { depth: d, y: W.terrain.gridHeight(x, z) + d } : null;
  }
  spotAt(x, z) {
    const G = this.G;
    if (G.mode !== 'village') return G.dungeon?.regionId || 'river';
    if (Math.hypot(x - POND.x, z - POND.z) < POND.r + 5) return 'pond';
    if (Math.hypot(x - BASIN.x, z - BASIN.z) < BASIN.r1 + 4) return 'river';
    return riverDist(x, z) < RIVER_W(z) + 3.5 ? 'river' : 'sea';
  }
  /** Open water ahead of the player → { x, z, y, spot } | { blocked } | { danger } | null */
  scan() { const P = this.G.player; return this.scanAt(P.pos.x, P.pos.z, P.facing); }
  /** …or ahead of any spot on the bank (the fishing guide picks a bank spot with it) */
  scanAt(px, pz, facing) {
    const G = this.G, P = G.player, W = G.world;
    if (G.mode !== 'village' && W.terrain?.iceAt?.(px, pz)) return this.scanIce();
    if (this.water(px, pz)?.depth > 0.12 && !W.deckAt?.(px, pz)) return null; // (wading)
    let blocked = false;
    for (const da of [0, 0.32, -0.32, 0.62, -0.62]) {
      const a = facing + da, dx = Math.sin(a), dz = Math.cos(a);
      let first = -1, last = -1;
      for (let d = 0.9; d <= 4.2; d += 0.3) {
        const w = this.water(px + dx * d, pz + dz * d);
        if (w && w.depth >= 0.28) { if (first < 0) first = d; last = d; } else if (first >= 0) break;
      }
      if (first < 0 || first > 2.6) continue;
      const d = Math.min(last, Math.max(first + 0.8, CAST)), x = px + dx * d, z = pz + dz * d;
      if (this.nearVillagerFloat(x, z)) { blocked = true; continue; }
      const w = this.water(x, z) || this.water(px + dx * first, pz + dz * first);
      if (G.dungeon?.monsters?.some(m => m.alive && m.aggro && m.pos.distanceTo(P.pos) < 9)) return { danger: true };
      return { x, z, y: w.y, spot: this.spotAt(x, z) };
    }
    return blocked ? { blocked: true } : null;
  }
  /** A dry bank spot near (x, z) facing open water (centre: the water to face) → { x, z, face } | null */
  bankSpotNear(x, z, centre) {
    const W = this.G.world, out = [];
    for (let r = 1.5; r <= 9; r += 0.75) for (let k = 0; k < 24; k++) {
      const a = k / 24 * Math.PI * 2, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      if (this.water(px, pz) || !W.walkable?.(px, pz) || W.collision?.solidAt?.(px, pz, 0.4)) continue;
      const face = Math.atan2(centre.x - px, centre.z - pz), t = this.scanAt(px, pz, face);
      if (t && !t.blocked && !t.danger && Math.hypot(t.x - px, t.z - pz) < CAST + 0.5) out.push({ x: px, z: pz, face, d: r });
      if (out.length >= 3) return out.sort((p, q) => p.d - q.d)[0];
    }
    return out[0] || null;
  }
  /** standing on a frozen pond: a hole in the ice just ahead, over deep enough water */
  scanIce() {
    const G = this.G, P = G.player, T = G.world.terrain, lvl = T.water.level;
    for (const da of [0, 0.4, -0.4]) {
      const a = P.facing + da, x = P.pos.x + Math.sin(a) * 1.15, z = P.pos.z + Math.cos(a) * 1.15;
      if (!T.iceAt(x, z) || lvl - T.gridHeight(x, z) < 0.08) continue; // (the frozen beds are shallow: any water under the ice will do)
      if (G.dungeon?.monsters?.some(m => m.alive && m.aggro && m.pos.distanceTo(P.pos) < 9)) return { danger: true };
      return { x, z, y: lvl, spot: this.spotAt(x, z), ice: true };
    }
    return null;
  }
  // a villager already fishing this bank keeps it (docs/HOMESTEAD.md §3): pick water clear of their floats
  nearVillagerFloat(x, z) {
    if (this.G.mode !== 'village') return false;
    for (const n of this.G.npcs || []) if (n.propKind === 'rod' && n.bobber?.parent && Math.hypot(n.bobber.position.x - x, n.bobber.position.z - z) < 2) return true;
    return false;
  }
  label() {
    const t = this.target; if (!t) return null;
    if (t.danger) return 'Too noisy to fish here!';
    if (t.blocked) return 'Someone is fishing here — try along the bank';
    return `${t.ice ? 'Ice fish' : 'Fish'} 🎣 ${SPOTS[t.spot]?.name || ''}`;
  }
  // ---------------------------------------------------------------- the session
  start() {
    const G = this.G, P = G.player, t = this.target;
    if (this.s || !t || !this.rod || this.tools.busy) return;
    if (t.blocked || t.danger) { G.ui?.toast?.(t.danger ? 'The fish are hiding — the monsters are too noisy!' : 'Someone is fishing here. Try a little further along the bank!', { icon: 'wave', color: '#8fd0ff' }); return; }
    P.controlLocked = true; P.moveTarget = null; P.interactTarget = null; P.route?.clear?.();
    P.faceTo(t.x, t.z); P.facing = P.faceTarget;
    this.prop = this.tools.hold('rod' + Math.min(2, this.rod));
    this.s = { phase: 'cast', t: 0, world: G.world, spot: t.spot, x: t.x, z: t.z, y: t.y, ice: !!t.ice, life0: G.actions.life(), fx: 0 };
    if (t.ice) { this.hole.position.set(t.x, t.y + 0.012, t.z); this.hole.rotation.y = Math.random() * 6.28; G.world.scene.add(this.hole); }
    P.anim.play('rodCast', { onEvent: ev => { if (ev === 'release' && this.s?.phase === 'cast') this.launch(); } });
    this.fp.x = t.x; this.fp.z = t.z;
    G.ui?.reel?.session?.(true);
    Events.emit('fishing:start', { spot: t.spot });
    Events.emit('sfx', 'swing', { pitch: 1.5, vol: 0.35 });
    Actions.consume('interact');
  }
  launch() {
    const s = this.s, scene = s.world.scene;
    s.phase = 'fly'; s.t = 0;
    this.rodTip(_w); s.from = _w.clone();
    scene.add(this.bobber, this.line);
    this.bobber.position.copy(_w); this.bobber.visible = true; this.line.visible = true;
    Events.emit('fishing:cast', { spot: s.spot });
    Events.emit('sfx', 'leash_throw', { pitch: 1.6, vol: 0.4 });
  }
  land() {
    const s = this.s, G = this.G, P = G.player;
    s.phase = 'wait'; s.t = 0;
    s.wait = this.tut?.biteAfter ?? rand(2, 8) * (this.rod >= 2 ? 0.8 : 1); // (the fishing guide: a sure bite)
    s.nib = rand(0.7, 1.4); s.early = 0; s.misses = 0; s.ring = 0.6;
    P.anim.play('fish');
    _w.set(s.x, s.y, s.z);
    Events.emit('sfx', 'splash_cast', { pos: _w });
    this.ripple(0.15, 0.9, 0.7);
    for (let i = 0; i < 6; i++) { const a = i / 6 * 6.283; G.vfx?.dot?.spawn({ x: s.x, y: s.y + 0.05, z: s.z, vx: Math.cos(a) * 0.7, vz: Math.sin(a) * 0.7, vy: 1.5, grav: 7, life: 0.45, size: 0.08, color: '#e8faff', alpha: 0.9, alpha1: 0 }); }
  }
  bite() {
    const s = this.s, G = this.G;
    s.fish ||= this.tut?.fish || rollFish(s.spot, G.day?.hour ?? 12, this.rod); // (after a miss it's the same fish, back for another go)
    if (!s.fish) return this.end('Nothing seems to be biting here…');
    s.phase = 'bite'; s.t = 0; s.window = this.tut?.window ?? this.params().window;
    Events.emit('fishing:bite', { fish: s.fish, window: s.window });
    // the cue, everywhere at once: a big "!" at the float (what to press beside it), a splash and a spray, the ping, a
    // buzz on touch and a rumble on the pad (no "!" over the hero any more: from the game camera it sat on the float)
    G.ui?.reel?.cue?.('bite', this.tut ? 'NOW!' : '');
    Events.emit('sfx', 'splash', { vol: 0.9, pitch: 1.2 });
    Events.emit('sfx', 'bite_ping');
    if (Actions.device === 'touch') Touch.buzz(60);
    Actions.rumble(0.55, 0.85, 220);
    this.ripple(0.2, 1.4, 0.55); this.ripple(0.1, 0.8, 0.4);
    for (let i = 0; i < 14; i++) { const a = i / 14 * 6.283, k = i % 2 ? 0.7 : 1.2; G.vfx?.dot?.spawn({ x: s.x, y: s.y + 0.05, z: s.z, vx: Math.cos(a) * k, vz: Math.sin(a) * k, vy: 2.4 + (i % 3) * 0.5, grav: 8, life: 0.6, size: 0.13, color: '#ffffff', alpha: 0.95, alpha1: 0 }); }
    G.engine?.rig?.shake?.(0.08);
  }
  /** the bite was missed: the fish nibbles again (the guide: always; Relaxed: twice; Normal: once), else it's gone */
  missed() {
    const s = this.s, G = this.G, tries = this.tut?.retryBite ? 99 : this.relaxed() ? 2 : 1;
    if (s.misses >= tries) return this.end('It got away! Cast again whenever you like.', { escaped: true });
    s.misses++; s.phase = 'wait'; s.t = 0; s.wait = rand(1.4, 2.6); s.nib = rand(0.5, 0.9);
    G.ui?.reel?.cue?.('miss');
    Events.emit('sfx', 'nibble', { pitch: 0.8 });
    Events.emit('fishing:miss', { n: s.misses });
  }
  reel() {
    const s = this.s, G = this.G, f = FISH[s.fish];
    s.phase = 'reel'; s.t = 0; s.click = 0;
    const R = this.params(), T = this.tut, log = fishLogOf(G.state), first = !Object.keys(log).length, F = this.F;
    // (the guide and the very first catch always land: the meter has a floor)
    s.sim = new ReelSim({ d: f.d, beh: f.beh, zone: T?.zone ?? R.zone, drain: T?.drain ?? R.drain, floor: T?.floor ?? (first ? 0.04 : 0) });
    F.reels = (F.reels || 0) + 1;
    G.ui?.reel?.cue?.(null);
    Events.emit('fishing:reel', { fish: s.fish, relaxed: R.relaxed, sure: s.sim.floor > 0 });
    G.ui?.reel?.start({ icon: pantryIcon(s.fish), name: PANTRY[s.fish].name, known: !!log[s.fish], zone: s.sim.zh, howto: !!T || F.reels <= HOWTO_REELS });
    Events.emit('sfx', 'reel_start');
  }
  caught() {
    const s = this.s, G = this.G, P = G.player;
    s.phase = 'land'; s.t = 0;
    G.ui?.reel?.end('catch');
    P.anim.play('reel');
    const size = rollSize(s.fish), r = recordCatch(G.state, s.fish, size, { spot: s.spot, hour: G.day?.hour ?? 12, day: G.day?.day || 1 });
    s.size = size; s.rec = r;
    if (r.record || r.first) this.F.lastRecord = { id: s.fish, size, first: r.first };
    if (r.milestone) this.F.pendingMilestone = r.milestone;
    // the fish leaps out of the water and over the player's head
    const m = this.fishMesh(s.fish); s.fm = m;
    const k = s.fk = Math.min(1.7, Math.max(0.85, size / 45)) * 1.15; // (small fish shown a bit bigger: they read at game distance)
    m.scale.setScalar(k); m.position.set(s.x, s.y, s.z); m.visible = true;
    s.world.scene.add(m);
    this.bobber.visible = false;
    Events.emit('sfx', 'water_splash', { pitch: 1.1 });
    for (let i = 0; i < 10; i++) { const a = i / 10 * 6.283; G.vfx?.dot?.spawn({ x: s.x, y: s.y + 0.05, z: s.z, vx: Math.cos(a) * 1.3, vz: Math.sin(a) * 1.3, vy: 2.6, grav: 8, life: 0.6, size: 0.11, color: '#ffffff', alpha: 0.95, alpha1: 0 }); }
  }
  /** the catch is in: pantry, Fish Log, toast, events */
  award() {
    const s = this.s, G = this.G, P = G.player, d = PANTRY[s.fish], r = s.rec;
    G.actions.addPantry(s.fish, 1, { src: 'fish' });
    const tags = (r.first ? ' <b class="t-new">New!</b>' : '') + (r.record ? ' <b class="t-rec">New record!</b>' : '');
    G.ui?.toast?.(`${d.name} <span class="t-cm">${s.size} cm</span>${tags}`, { html: true, iconURL: pantryIcon(s.fish), color: d.rare >= 2 ? '#ffd84a' : '#8fd0ff', sub: `${SPOTS[s.spot]?.name || ''} · ${r.species}/15 in your Fish Log`, duration: 4.5 });
    G.ui?.pantryGain?.(s.fish, 1, { quiet: true, worldPos: P.pos.clone().setY(P.pos.y + 1.8) });
    G.vfx?.sparkle?.(P.pos.clone().setY(P.pos.y + 1.9), { n: 14, color: d.rare >= 2 ? '#ffe070' : '#bff0ff', r: 0.5, rise: 0.7 });
    Events.emit('sfx', d.rare >= 2 ? 'pickup_rare' : 'fish_catch');
    Events.emit('fish:caught', { id: s.fish, size: s.size, spot: s.spot, first: r.first, record: r.record });
    if (r.milestone) setTimeout(() => G.ui?.toast?.(`${r.milestone} kinds of fish! Kero has something for you at the pond.`, { icon: 'gift', color: '#8fe0c0' }), 1600);
  }
  /** End the session. msg: a toast; quiet: no clap / feedback */
  end(msg = null, { quiet = false, escaped = false } = {}) {
    const s = this.s, G = this.G, P = G.player; if (!s) return;
    this.s = null;
    this.bobber.parent?.remove(this.bobber); this.line.parent?.remove(this.line); this.hole.parent?.remove(this.hole);
    if (s.fm) s.fm.parent?.remove(s.fm);
    if (s.phase === 'reel') G.ui?.reel?.end('escape', escaped ? (s.sim.m > 0.6 ? 'So close!' : 'It got away…') : 'Line in!');
    G.ui?.reel?.session?.(false);
    this.tools.release();
    if (P.anim.action && ['fish', 'rodCast', 'reel'].includes(P.anim.action.name)) P.anim.stop();
    P.controlLocked = false; G.interactCooldown = performance.now() + 400; Actions.consume('interact');
    if (msg && !quiet) G.ui?.toast?.(msg, { icon: 'wave', color: '#8fd0ff' });
    if (escaped && !quiet) Events.emit('sfx', 'fish_escape');
    if (escaped && !quiet && !msg && s.phase === 'reel') G.ui?.toast?.('It got away — no harm done. Cast again!', { icon: 'wave', color: '#8fd0ff' });
    // how it ended (the fishing guide loops on it): catch | escape (the reel) | late (the bite) | early | cancel
    const result = s.awarded ? 'catch' : !escaped ? 'cancel' : s.phase === 'reel' ? 'escape' : s.phase === 'bite' ? 'late' : 'early';
    Events.emit('fishing:end', { result, fish: s.fish || null });
  }
  // ---------------------------------------------------------------- per frame
  update(dt) {
    const G = this.G, P = G.player;
    this.ensureInteractable();
    const s = this.s;
    this.fk += ((s && s.phase !== 'cast' && s.phase !== 'land' ? 1 : 0) - this.fk) * (1 - Math.exp(-3 * dt));
    if (!s) {
      const quiet = !this.rod || !this.fishable() || G.titleActive || G.ui?.anyModal?.() || P?.controlLocked || G.build?.active || this.tools.busy;
      // (the shore scan reruns when the player moves or turns, or every 0.25 s for the monster check: not every frame)
      const k = this._scanKey ||= { x: 0, z: 0, f: 0, t: 0 };
      k.t -= dt;
      if (quiet) { this.target = null; k.t = 0; }
      else if (k.t <= 0 || Math.abs(P.pos.x - k.x) + Math.abs(P.pos.z - k.z) > 0.04 || Math.abs(P.facing - k.f) > 0.02) {
        this.target = this.scan(); k.x = P.pos.x; k.z = P.pos.z; k.f = P.facing; k.t = 0.25;
      }
      if (this.target) this.inter.pos.set(P.pos.x + Math.sin(P.facing) * 0.5, P.pos.y, P.pos.z + Math.cos(P.facing) * 0.5);
      else this.inter.pos.set(-999, -50, -999);
      return;
    }
    // anything that pulls the player away ends the session
    if (G.world !== s.world || G.ui?.iris?.active || G.leavingDungeon || G.playerDead || G.mode === 'title') return this.end(null, { quiet: true });
    if (G.actions.life() < s.life0 - 0.5) return this.end('Ouch! The fish got away.', { escaped: true });
    if (s.phase !== 'land' && (MOVE.some(k => Input.hit(k)) || Actions.moveHit() || Actions.pressed('roll', 'pad') || Actions.pressed('menu', 'pad'))) return this.end('You reel in your line.'); // (the pad: a fresh push of the stick, B or Menu)
    s.t += dt;
    const press = Actions.pressed('interact') || Actions.pressed('attack') || Actions.pressed('reel'); // (F or LMB; the pad: A, the D-pad or RT)
    if (s.phase === 'cast') { if (s.t > 1.2) this.launch(); }
    else if (s.phase === 'fly') {
      const k = Math.min(1, s.t / 0.5), b = this.bobber;
      b.position.set(s.from.x + (s.x - s.from.x) * k, s.from.y + (s.y + 0.03 - s.from.y) * k + Math.sin(k * Math.PI) * (s.ice ? 0.45 : 1.1), s.from.z + (s.z - s.from.z) * k);
      if (k >= 1) this.land();
    } else if (s.phase === 'wait') {
      if (press) { // too early: a gentle "Not yet…" (Normal forgives the first of a cast; Relaxed and the guide, all of them)
        s.early++;
        if (!(this.tut?.forgiveEarly || this.relaxed() || s.early === 1)) return this.end('Too early — it swam off!', { escaped: true });
        Events.emit('fishing:early', { n: s.early }); this.ripple(0.06, 0.3, 0.3); G.ui?.reel?.cue?.('early');
        s.wait = Math.max(s.wait, s.t + 1.2); // (no bite the instant after)
      }
      if ((s.ring -= dt) <= 0) { s.ring = 1.5; this.ripple(0.12, 0.42, 0.9); } // (a soft ring now and then: where the float is)
      s.nib -= dt;
      let dip = 0;
      if (s.nib < 0) { dip = Math.max(0, 1 + s.nib / 0.18); if (s.nib < -0.18) { s.nib = rand(0.8, 1.6); this.ripple(0.08, 0.45, 0.45); Events.emit('sfx', 'nibble'); Events.emit('fishing:nibble', {}); } }
      this.bobber.position.set(s.x, s.y + 0.03 + Math.sin(s.t * 2.4) * 0.012 - dip * 0.045, s.z);
      if (s.t >= s.wait) this.bite();
    } else if (s.phase === 'bite') {
      this.bobber.position.set(s.x, s.y - 0.07 + Math.sin(s.t * 40) * 0.02, s.z);
      if (press) this.reel();
      else if (s.t > s.window) { this.missed(); if (!this.s) return; }
    } else if (s.phase === 'reel') {
      const hold = Actions.held('interact') || Actions.held('attack') || Actions.held('reel'), r = s.sim.step(dt, hold);
      // the float tugs about with the fish; the reel clicks while it's wound
      const off = (s.sim.f - 0.5) * (s.ice ? 0.3 : 1.4), dx = Math.cos(P.facing), dz = -Math.sin(P.facing);
      this.bobber.position.set(s.x + dx * off, s.y - 0.02 + Math.sin(s.t * 13) * 0.02 - (s.sim.inZone ? 0 : 0.03), s.z + dz * off);
      if (hold && (s.click -= dt) <= 0) { s.click = 0.11; Events.emit('sfx', 'reel_click', { pitch: 0.9 + s.sim.m * 0.5 }); }
      if ((s.fx -= dt) <= 0) { s.fx = 0.22; this.ripple(0.1, 0.55, 0.35, this.bobber.position); }
      _v.copy(P.pos).setY(P.pos.y + 1.0).project(G.engine.camera); _b.copy(this.bobber.position).project(G.engine.camera);
      G.ui?.reel?.draw(s.sim, (_v.x * 0.5 + 0.5) * innerWidth, (-_v.y * 0.5 + 0.5) * innerHeight, hold, (_b.x * 0.5 + 0.5) * innerWidth, (-_b.y * 0.5 + 0.5) * innerHeight);
      if (r === 'catch') this.caught();
      else if (r === 'escape') return this.end(null, { escaped: true });
    } else if (s.phase === 'land') {
      const m = s.fm, k = Math.min(1, s.t / 0.75), hx = P.pos.x, hy = P.pos.y + 1.75, hz = P.pos.z;
      // (1.5x while it arcs, so the species reads in the air; it settles to a held size over the head)
      if (k < 1) { m.position.set(s.x + (hx - s.x) * k, s.y + (hy - s.y) * k + Math.sin(k * Math.PI) * 1.6, s.z + (hz - s.z) * k); m.rotation.set(Math.sin(s.t * 18) * 0.35, P.facing + Math.PI / 2 + Math.sin(s.t * 9) * 0.6, Math.sin(s.t * 11) * 0.4); m.scale.setScalar(s.fk * (1 + 0.5 * Math.min(1, k * 4))); }
      else { if (!s.awarded) { s.awarded = true; this.award(); } m.position.set(hx, hy + 0.15 + Math.sin(s.t * 6) * 0.05, hz); m.rotation.set(0, P.facing + Math.PI / 2 + Math.sin(s.t * 8) * 0.3, Math.sin(s.t * 14) * 0.25); m.scale.setScalar(s.fk * (1.15 + 0.35 * Math.max(0, 1 - (s.t - 0.75) / 0.25))); }
      if (s.t > 1.55) m.scale.setScalar(s.fk * 1.15 * Math.max(0, 1 - (s.t - 1.55) / 0.25));
      if (s.t > 1.8) { this.end(null, { quiet: true }); P.anim.play('clap'); return; }
    }
    if (this.s && G.ui?.reel?.cueKind) { _b.copy(this.bobber.position).setY(this.bobber.position.y + 0.2).project(G.engine.camera); G.ui.reel.track((_b.x * 0.5 + 0.5) * innerWidth, (-_b.y * 0.5 + 0.5) * innerHeight); }
    this.poseRod(dt, s);
    this.drawLine(s);
  }
  /** game.js, after it sets the camera's focus: while fishing it leans 45% of the way to the float, so the hero, the
   *  float and the reel card all fit (eased in and out) */
  frameFocus(focus) {
    if (this.fk < 0.002) return;
    const P = this.G.player, k = this.fk * 0.45;
    focus.x += (this.fp.x - P.pos.x) * k; focus.z += (this.fp.z - P.pos.z) * k;
  }
  // ---------------------------------------------------------------- visuals
  rodTip(out) { const m = this.prop; if (!m) return out.copy(this.G.player.pos); m.updateWorldMatrix(true, false); return out.copy(ROD_TIP).applyMatrix4(m.matrixWorld); }
  poseRod(dt, s) {
    const m = this.prop; if (!m) return;
    const parts = this.G.player.rig.parts, pitch = parts.body.rotation.x + parts.armR.rotation.x;
    let x = -0.35 - pitch * 0.7, z = 0;
    if (s.phase === 'cast') x = -0.2 - pitch * 0.35;
    if (s.phase === 'wait' && s.nib < 0) x += 0.08;
    if (s.phase === 'bite') x += 0.32 + Math.sin(s.t * 40) * 0.05;
    if (s.phase === 'reel') { const tense = s.sim.inZone ? 0.18 : 0.32; x += tense + Math.sin(s.t * 31) * 0.03 * (1 + s.sim.d); z = Math.sin(s.t * 7.3) * 0.12 * (s.sim.dart ? 1.6 : 1); }
    m.rotation.set(x, 0, z);
  }
  drawLine(s) {
    if (!this.line.parent || s.phase === 'cast') return;
    // landing: the line rides the fish up out of the water, then it's unhooked
    if (s.phase === 'land' && s.awarded) { this.line.visible = false; return; }
    this.rodTip(_w); const end = s.phase === 'land' ? s.fm.position : this.bobber.position, arr = this.line.geometry.attributes.position.array;
    const sag = s.phase === 'reel' || s.phase === 'bite' || s.phase === 'land' ? 0.04 : s.phase === 'fly' ? 0.1 : 0.32;
    _a.set((_w.x + end.x) / 2, Math.min(_w.y, end.y) + (Math.abs(_w.y - end.y) * 0.25) - sag, (_w.z + end.z) / 2);
    for (let i = 0; i < 18; i++) {
      const t = i / 17, it = 1 - t;
      arr[i * 3] = it * it * _w.x + 2 * it * t * _a.x + t * t * end.x; arr[i * 3 + 1] = it * it * _w.y + 2 * it * t * _a.y + t * t * (end.y + (s.phase === 'land' ? 0.08 : 0.08 * FLOAT_K)); arr[i * 3 + 2] = it * it * _w.z + 2 * it * t * _a.z + t * t * end.z;
    }
    this.line.geometry.attributes.position.needsUpdate = true;
  }
  ripple(r0, r1, life, at = null) {
    const s = this.s; if (!s || !this.G.vfx?.ring) return;
    const p = at || _w.set(s.x, s.y, s.z);
    if (s.ice) { r0 = Math.min(r0, 0.1); r1 = Math.min(r1, 0.3); } // (inside the hole)
    this.G.vfx.ring({ x: p.x, y: s.y, z: p.z }, { color: '#ffffff', r0, r1, life, opacity: 0.55, y: 0.02 });
  }
  fishMesh(id) {
    let m = this.fishMeshes.get(id);
    if (!m) { // the catch, with an ink contour so its shape and colours read at play distance
      const g = fishGeo(id), M = fishMats();
      m = new THREE.Mesh(g, M.body); m.castShadow = true; m.name = 'fishing:catch';
      const ink = new THREE.Mesh(g, M.ink); ink.name = 'fishing:catchInk'; m.add(ink);
      this.fishMeshes.set(id, m);
    }
    return m;
  }
}
