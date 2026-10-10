// Auto targeting (docs/CONTROLS.md §13, ROADMAP CT-8): the game picks good targets for you.
//  - The setting: Settings › Controls › Targeting Off · Assist · Auto, one per device type (targetKbm / targetPad /
//    targetTouch in the UI settings): Auto on touch and the pad, Assist on the mouse by default. targetingOf() reads it,
//    migrateTargeting() fills it from the old touch Skill aim and Aim assist once.
//  - AIM: every active skill's aim kind (melee / target / ground / line / cone / leap / dash / heal / self), so each one
//    goes somewhere sensible in Auto; aimSpec() resolves its ranges from the skill's params. test-rpg checks that no
//    active skill of any hero is left out.
//  - The pure math (node-tested): scoreFoe (the lock's score), bestCluster (the point covering the most foes in a
//    radius), bestLine and bestCone (the direction through the most foes).
//  - AutoAim (G.autoAim): the all-round lock pick (padAim.js calls it), aimFor(id) (where a skill goes in Auto),
//    assist(id, cursor, hover) (the mouse's light magnetism), and the AoE marker while a ground skill charges.
//    Candidates come from the combat grid (combat.inRadius), so a 150-monster fight stays cheap.
import * as THREE from 'three';
import { Actions } from '../core/actions.js';
import { Events } from '../core/events.js';
import { skillRuntime } from '../rpg/skills.js';
import { registerDebug } from '../debug/registry.js';

// ------------------------------------------------------------------ the setting
export const TARGETING = { OFF: 0, ASSIST: 1, AUTO: 2 };
export const TARGET_LABELS = ['Off', 'Assist', 'Auto'];
export const TARGET_KEYS = { kbm: 'targetKbm', pad: 'targetPad', touch: 'targetTouch' };
export const TARGET_DEFAULTS = { kbm: TARGETING.ASSIST, pad: TARGETING.AUTO, touch: TARGETING.AUTO };
const isMode = v => v === 0 || v === 1 || v === 2;
/** the value a device starts on when its key is missing: the old touch Skill aim (Drag → Off), a saved Aim assist of 0
 *  (→ the pad Off), else the default */
export function migratedTarget(s, dev) {
  if (dev === 'touch') return s?.touchAim === 1 ? TARGETING.OFF : TARGETING.AUTO;
  if (dev === 'pad') return s?.aimAssist === 0 ? TARGETING.OFF : TARGETING.AUTO;
  return TARGET_DEFAULTS.kbm;
}
/** Settings › Controls › Targeting for a device ('kbm' | 'pad' | 'touch') → 0 Off · 1 Assist · 2 Auto */
export function targetingOf(s, dev = 'kbm') {
  const v = s?.[TARGET_KEYS[dev] || TARGET_KEYS.kbm];
  return isMode(v) ? v : migratedTarget(s, TARGET_KEYS[dev] ? dev : 'kbm');
}
/** the keys a settings object is missing, with their migrated values ({} when none) */
export function migrateTargeting(s) {
  const set = {};
  for (const dev of Object.keys(TARGET_KEYS)) if (!isMode(s?.[TARGET_KEYS[dev]])) set[TARGET_KEYS[dev]] = migratedTarget(s, dev);
  return set;
}
/** one line about a device's choice (Settings › Controls, under its Targeting row) */
export function targetingHint(dev, v) {
  if (v === TARGETING.AUTO) return dev === 'touch' ? 'Skills pick the best foe or group all round you. Tap a monster or flick the stick to pick another.' : dev === 'pad' ? 'Skills pick the best foe or group all round you. Flick the right stick or click R3 to pick another.' : 'Skills pick the best foe or group all round you; point at a monster to pick it.';
  if (v === TARGETING.ASSIST) return dev === 'touch' ? 'Skills go at the foe in front of you (where the stick or your facing points).' : dev === 'pad' ? 'Skills go at the foe in front of the stick (Aim assist sets how wide).' : 'The mouse aims; a skill cast near a foe or a group snaps onto it.';
  return dev === 'touch' ? 'Drag off a skill to aim it; back onto its button cancels.' : dev === 'pad' ? 'No lock: skills go where the sticks or your facing point.' : 'Pure mouse: skills go exactly at the cursor.';
}

// ------------------------------------------------------------------ the numbers (docs/CONTROLS.md §13.2)
export const LOCK_RANGE = 11, LOCK_HOLD = 13, POT_RANGE = 5, REACH = 1, MELEE_STEP = 1.8, SNAP = 1.5;
export const MANUAL_HOLD = 5, MANUAL_CAST = 2.5, REPICK = 0.1;
/** the lock's score weights (lower wins) */
export const SCORE = { face: 0.05, sticky: 0.62, threat: 0.7, elite: 0.85, ward: 3, sight: 2.2 };
/** a foe's weight in a cluster, line or cone (1 + these) */
export const WEIGHT = { lock: 0.6, threat: 0.3, elite: 0.2 };
const DEG = Math.PI / 180;

// ------------------------------------------------------------------ the aim table (docs/CONTROLS.md §13.3)
// kind: melee · target · ground · line · cone · leap · dash · heal · self. Ranges default to the skill's own params
// (range ?? leap ?? distance ?? length ?? throwRange), radii to (radius ?? area ?? impactRadius ?? popRadius), a line's
// width to (width ?? 2 × grabRadius ?? 0.7), a cone's half-angle to (spread ?? arc) / 2. A dash goes where the move stick
// points (escape) and, with no move input, as its `idle` form; `away`: the cast itself moves away from its aim.
const K = (kind, o) => ({ kind, ...o });
export const AIM_KINDS = ['melee', 'target', 'ground', 'line', 'cone', 'leap', 'dash', 'heal', 'self'];
export const AIM = {
  // Chewy: Bone Blade, Fetch Mastery, Pack Spirit
  chomp: K('melee'), whirl: K('self'), dig: K('leap'), bonestorm: K('self'),
  throw: K('line'), ricochet: K('target', { range: () => 10 }), multi: K('cone'), decoy: K('ground', { radius: p => p.cloudRadius }),
  blaze: K('target'), fetchstorm: K('ground'),
  woof: K('self'), zoom: K('dash', { idle: 'line', width: p => p.width * 2 }), packcall: K('self'), treat: K('heal'), howl: K('self'), moonhowl: K('self'),
  // Moka: Tidewater, Starlight Kibble, Duck Hunt
  splash: K('target'), bubble: K('self'), shake: K('self'), puddleHop: K('dash', { idle: 'ground' }), whirlpool: K('ground'), greatWave: K('line'),
  kibble: K('target'), squeak: K('self'), pawRune: K('ground'), moonbeam: K('ground'), constellation: K('target'), meteor: K('ground'),
  duckDecoy: K('ground'), fetchLeash: K('target'), feathers: K('cone'), duckCall: K('ground'), spiritRetriever: K('self'), mallards: K('ground'),
  // Poe
  fumaThrow: K('target'), kunaiFan: K('cone'), shadowStitch: K('target'), whirlingFuma: K('ground'), shurikenRain: K('ground'), thousandStars: K('self'),
  smokeBomb: K('self'), puffBall: K('target'), shadowClone: K('self'), substitution: K('dash', { idle: 'away' }), thunderPaw: K('target'), smokeDragon: K('line'),
  shadowStep: K('target'), afterimageDash: K('dash', { idle: 'line', width: p => p.width * 2 }), vanish: K('self'),
  caltropFlip: K('dash', { idle: 'lock', away: true, range: p => p.flip }), bullseyeMark: K('target'), phantomBarrage: K('target'),
  // Floofy (the Shih Tzu)
  woefulWallop: K('melee'), tugOfWoe: K('line'), maelstrom: K('self'), steadfastSulk: K('self'), heaviestSigh: K('leap', { range: p => p.leap + 1.2 }),
  drippingPaw: K('target'), grumbleCloud: K('ground'), caseOfMopes: K('ground'), mournfulAwoo: K('self'), everlastingGloom: K('ground'),
  ghostPups: K('self'), borrowedWarmth: K('target'), boneWard: K('self'), wayhomeLantern: K('heal'), grandpawsGhost: K('self'),
  // Foosy (the Golden dragoon) and the whelp
  sunbeamThrust: K('melee', { reach: p => p.length }), sunfallJump: K('leap'), pinwheelSweep: K('self'), gallantCharge: K('dash', { idle: 'line' }), // (its width is the whole lane; Flash Draw's and Afterimage's are a radius round him)
  starfallLance: K('ground'), bonkDart: K('target'), tailwagVolley: K('cone'), trueFlight: K('line'), emberleafJavelin: K('target'), sunshower: K('ground'),
  emberBreath: K('ground', { range: () => 10, radius: p => p.range * 0.5 }), divebombSwoop: K('ground'), wingShield: K('self'), mightyRoar: K('self'), dragonHeart: K('self'),
};
/** a skill's aim in numbers (R: its runtime, rpg/skills.js skillRuntime) → { kind, range, radius, width, half, reach, idle, away } */
export function aimSpec(id, R) {
  const p = R?.params || {};
  const a = id === 'attack' ? (p.projectile ? { kind: 'target' } : { kind: 'melee' }) : AIM[id];
  if (!a) return { kind: 'self', range: 0, radius: 0, width: 0, half: 0, reach: null, idle: null, away: false };
  const f = (v, d) => (typeof v === 'function' ? v(p) : v ?? d);
  return {
    kind: a.kind,
    range: +f(a.range, p.range ?? p.leap ?? p.distance ?? p.length ?? p.throwRange ?? 10) || 10,
    radius: +f(a.radius, p.radius ?? p.area ?? p.impactRadius ?? p.popRadius ?? 2) || 2,
    width: +f(a.width, p.width ?? (p.grabRadius ? p.grabRadius * 2 : 0.7)) || 0.7,
    half: (+f(a.half, (p.spread ?? p.arc ?? 50) / 2) || 25) * DEG,
    reach: a.reach ? +f(a.reach, null) : null,
    idle: a.idle || null, away: !!a.away,
  };
}

// ------------------------------------------------------------------ the pure math
/** the lock's score for one foe (lower wins). f: { d (m, centre to centre), r (its radius), cos (to the hero's facing),
 *  lock (it is the current lock), threat, elite, warded, sight (false: no line of sight) } */
export function scoreFoe(f) {
  let s = Math.max(0.3, f.d - (f.r || 0) * 0.5) + 0.5;
  s *= 1 + SCORE.face * (1 - (f.cos ?? 1));
  if (f.lock) s *= SCORE.sticky;
  if (f.threat) s *= SCORE.threat;
  if (f.elite) s *= SCORE.elite;
  if (f.warded) s *= SCORE.ward;
  if (f.sight === false) s *= SCORE.sight;
  return s;
}
/** the weight a foe adds to a cluster, line or cone */
export const foeWeight = (lock, threat, elite) => 1 + (lock ? WEIGHT.lock : 0) + (threat ? WEIGHT.threat : 0) + (elite ? WEIGHT.elite : 0);

/** the best place for a ground skill of `radius`: pts [{ x, z, r, w }] (the foes: their radius and weight, nearest the
 *  origin first), o: { ox, oz (the hero), range (the centre stays within it), lock {x, z} (ties go to the group nearer
 *  it), near { x, z, r } (the centre stays within r of a point: the mouse's Assist), cap } → { x, z, w, n } or null.
 *  Each foe (up to cap) is tried as a centre; then the centre is nudged to its members' weighted middle when that keeps
 *  their weight. */
export function bestCluster(pts, radius, o = {}) {
  const n = pts.length; if (!n) return null;
  const ox = o.ox ?? 0, oz = o.oz ?? 0, range = o.range ?? Infinity, near = o.near || null, L = o.lock || null;
  const clampXZ = (x, z) => {
    let dx = x - ox, dz = z - oz, d = Math.hypot(dx, dz);
    if (d > range && d > 1e-6) { x = ox + dx / d * range; z = oz + dz / d * range; }
    if (near) { dx = x - near.x; dz = z - near.z; d = Math.hypot(dx, dz); if (d > near.r && d > 1e-6) { x = near.x + dx / d * near.r; z = near.z + dz / d * near.r; } }
    return [x, z];
  };
  const at = (x, z) => {
    let w = 0, k = 0, sx = 0, sz = 0;
    for (let i = 0; i < n; i++) {
      const q = pts[i], rr = radius + (q.r || 0) * 0.5, dx = q.x - x, dz = q.z - z;
      if (dx * dx + dz * dz > rr * rr) continue;
      const qw = q.w ?? 1; w += qw; k++; sx += q.x * qw; sz += q.z * qw;
    }
    return { x, z, w, n: k, cx: w ? sx / w : x, cz: w ? sz / w : z };
  };
  const tie = c => (L ? Math.hypot(c.x - L.x, c.z - L.z) : Math.hypot(c.x - ox, c.z - oz));
  let best = null;
  for (let i = 0, cap = Math.min(n, o.cap ?? 64); i < cap; i++) {
    const [x, z] = clampXZ(pts[i].x, pts[i].z);
    let c = at(x, z);
    if (!c.w) continue;
    const [mx, mz] = clampXZ(c.cx, c.cz);
    if (Math.abs(mx - x) + Math.abs(mz - z) > 0.05) { const c2 = at(mx, mz); if (c2.w >= c.w - 1e-6) c = c2; }
    if (!best || c.w > best.w + 1e-6 || (Math.abs(c.w - best.w) <= 1e-6 && tie(c) < tie(best))) best = c;
  }
  return best && { x: best.x, z: best.z, w: best.w, n: best.n };
}
/** the direction through the most foes for a line `length` long and `width` wide from (ox, oz): candidates toward each
 *  foe (and the lock) → { dx, dz, w, n, far (the farthest member along it) } or null */
export function bestLine(pts, o = {}) {
  const ox = o.ox ?? 0, oz = o.oz ?? 0, len = o.length ?? 10, hw = (o.width ?? 0.7) / 2, L = o.lock || null;
  const at = (ux, uz) => {
    let w = 0, k = 0, far = 0;
    for (const q of pts) {
      const rx = q.x - ox, rz = q.z - oz, al = rx * ux + rz * uz, lat = Math.abs(rx * uz - rz * ux), r = q.r || 0;
      if (al < -r - 0.3 || al > len + r || lat > hw + r) continue;
      w += q.w ?? 1; k++; if (al > far) far = al;
    }
    return { dx: ux, dz: uz, w, n: k, far };
  };
  return bestDir(pts, ox, oz, L, at, o.cap);
}
/** the direction whose fan (half-angle `half`, rad; `range` m) covers the most foes → { dx, dz, w, n, far, mean (the
 *  members' weighted distance: where lobbed javelins come down) } or null */
export function bestCone(pts, o = {}) {
  const ox = o.ox ?? 0, oz = o.oz ?? 0, range = o.range ?? 8, half = o.half ?? 0.45, L = o.lock || null;
  // each foe once: its unit direction and the cosine its body's edge allows (cos(half + its angular radius)), so a
  // candidate direction only takes dot products (no acos per pair)
  const Q = [];
  for (const q of pts) {
    const rx = q.x - ox, rz = q.z - oz, d = Math.hypot(rx, rz), r = q.r || 0;
    if (d > range + r) continue;
    Q.push({ ux: d > 1e-6 ? rx / d : 0, uz: d > 1e-6 ? rz / d : 0, c: d > 0.9 ? Math.cos(Math.min(Math.PI, half + Math.atan2(r, d))) : -2, w: q.w ?? 1, d });
  }
  const at = (ux, uz) => {
    let w = 0, k = 0, far = 0, sd = 0;
    for (let i = 0; i < Q.length; i++) { const q = Q[i]; if (q.ux * ux + q.uz * uz < q.c) continue; w += q.w; k++; sd += q.d * q.w; if (q.d > far) far = q.d; }
    return { dx: ux, dz: uz, w, n: k, far, mean: w ? sd / w : 0 };
  };
  return bestDir(pts, ox, oz, L, at, o.cap);
}
function bestDir(pts, ox, oz, L, at, cap = 64) {
  let lx = 0, lz = 0;
  if (L) { const d = Math.hypot(L.x - ox, L.z - oz); if (d > 1e-3) { lx = (L.x - ox) / d; lz = (L.z - oz) / d; } }
  const tie = c => (lx || lz ? 1 - (c.dx * lx + c.dz * lz) : 0);
  let best = null;
  const tryDir = (ux, uz) => { const c = at(ux, uz); if (!c.w) return; if (!best || c.w > best.w + 1e-6 || (Math.abs(c.w - best.w) <= 1e-6 && tie(c) < tie(best) - 1e-6)) best = c; };
  if (lx || lz) tryDir(lx, lz);
  for (let i = 0, n = Math.min(pts.length, cap); i < n; i++) {
    const q = pts[i], dx = q.x - ox, dz = q.z - oz, d = Math.hypot(dx, dz);
    if (d > 1e-3) tryDir(dx / d, dz / d);
  }
  return best;
}

// ------------------------------------------------------------------ the runtime (G.autoAim)
const _v = new THREE.Vector3();
const ATTACKING = new Set(['windup', 'attack', 'cast', 'blinkwind']);
export class AutoAim {
  constructor(G) {
    this.G = G; this.cache = new Map(); this.pool = []; this.cand = []; this.pts = []; this.marker = null; this.mt = 0;
  }
  /** Settings › Controls › Targeting for the device playing now */
  get mode() { return targetingOf(this.G.ui?.settings, Actions.device); }
  ok(e) { return !!e && e.alive && !e.untargetable && e.life > 0 && !!e.pos && Number.isFinite(e.pos.x); }
  elite(e) { return !!(e.def?.boss || e.rank === 'boss' || e.rank === 'champion' || e.rank === 'unique' || (e.siegeCaptain && !e.warded)); }
  /** is this foe hitting (or about to hit) the hero or a companion? */
  threat(e, d) {
    if (!e.aggro || e.breakable) return false;
    const t = e.atkTarget;
    if (ATTACKING.has(e.state) && t && (t === this.G.player || t.team === 'ally')) return true;
    return d < (e.def?.attack?.range || 1.5) + (e.radius || 0.4) + 0.8;
  }
  sight(e) { const D = this.G.dungeon; return this.G.mode !== 'dungeon' || !D?.los ? true : D.los(this.G.player.pos, e.pos); }
  /** the foes round the hero, best first: [{ e, s (score), pot }] (a reused array), every candidate within `range` (a
   *  current lock `cur` within LOCK_HOLD), or only those within `cone` (cos) of `dir` (a flick) */
  ranked(cur = null, { range = LOCK_RANGE, dir = null, cone = -2, sight = 8 } = {}) {
    const G = this.G, P = G.player, C = G.combat, out = this.cand; out.length = 0;
    if (!P || !C?.inRadius) return out;
    const fx = Math.sin(P.facing), fz = Math.cos(P.facing), pool = this.pool, hold = Math.max(range, LOCK_HOLD);
    let n = 0, monsters = 0;
    C.inRadius(P.pos.x, P.pos.z, hold, 'ally', (e, d) => {
      if (e.team !== 'enemy' || !this.ok(e)) return;
      if (e !== cur && d > range + (e.radius || 0)) return;
      const dx = e.pos.x - P.pos.x, dz = e.pos.z - P.pos.z, dd = Math.hypot(dx, dz) || 1e-4;
      if (dir && dd > 0.9 && (dx * dir.x + dz * dir.z) / dd < cone) return;
      const pot = !!e.breakable;
      if (pot && dd > POT_RANGE) return;
      if (!pot) monsters++;
      const c = pool[n] ||= { e: null, s: 0, pot: false }; n++;
      c.e = e; c.pot = pot;
      c.s = scoreFoe({ d: dd, r: e.radius, cos: dd < 0.9 ? 1 : (dx * fx + dz * fz) / dd, lock: e === cur, threat: !pot && this.threat(e, dd), elite: this.elite(e), warded: !!e.warded });
    });
    for (let i = 0; i < n; i++) if (!monsters || !pool[i].pot) out.push(pool[i]); // (pots only when no monster is in range)
    out.sort((a, b) => a.s - b.s);
    // line of sight: tested in score order (a blocked foe scores ×2.2), only as far as it could still matter
    let bs = Infinity;
    for (let i = 0; i < out.length && i < sight; i++) { const c = out[i]; if (c.s >= bs) break; if (!this.sight(c.e)) c.s *= SCORE.sight; if (c.s < bs) bs = c.s; }
    out.sort((a, b) => a.s - b.s);
    return out;
  }
  /** the best foe all round (the Auto lock; padAim.js): `cur` is the current lock (sticky) */
  pickLock(cur = null, o) { return this.ranked(cur, o)[0]?.e || null; }
  /** R3: the next foe after `cur` in score order (round to the best again) */
  nextAfter(cur) {
    const r = this.ranked(cur);
    if (!r.length) return null;
    const i = r.findIndex(c => c.e === cur);
    return r[(i + 1) % r.length].e === cur ? null : r[(i + 1) % r.length].e;
  }
  /** the foes within r of (x, z) as cluster points { x, z, r, w, e } (the hero's nearest first; pots only when no
   *  monster is there, and within POT_RANGE of the hero) → a reused array */
  gather(x, z, r, lock = null) {
    const G = this.G, P = G.player, C = G.combat, out = this.pts; out.length = 0;
    if (!P || !C?.inRadius) return out;
    let pots = 0;
    C.inRadius(x, z, r, 'ally', (e, d) => {
      if (e.team !== 'enemy' || !this.ok(e)) return;
      const dh = Math.hypot(e.pos.x - P.pos.x, e.pos.z - P.pos.z);
      if (e.breakable) { if (dh > POT_RANGE) return; pots++; }
      out.push({ x: e.pos.x, z: e.pos.z, r: e.radius || 0.3, w: e.breakable ? 0.5 : foeWeight(e === lock, this.threat(e, dh), this.elite(e)), e, dh, pot: !!e.breakable });
    });
    if (pots && pots < out.length) { let j = 0; for (const q of out) if (!q.pot) out[j++] = q; out.length = j; }
    out.sort((a, b) => a.dh - b.dh);
    return out;
  }
  ground(x, z, y) { const W = this.G.world; return new THREE.Vector3(x, W?.heightAt ? W.heightAt(x, z) : y ?? 0, z); }
  /** the move stick (or WASD) as a world direction, or null when it isn't pushed */
  moveDir() {
    const m = Actions.move(); if (!(m.mag > 0.3)) return null;
    const { f, r } = this.G.engine.rig.groundAxes();
    const d = new THREE.Vector3().addScaledVector(f, m.y).addScaledVector(r, m.x).setY(0);
    return d.lengthSq() > 1e-6 ? d.normalize() : null;
  }
  /** the most open of a few directions round dir (for a blink away): the first whose line stays clear for most of dist */
  openDir(dir, dist) {
    const S = this.G.skills, P = this.G.player;
    if (!S?.lineClear) return dir;
    for (const a of [0, 0.5, -0.5, 1, -1, 1.6, -1.6]) {
      const c = Math.cos(a), s = Math.sin(a), d = new THREE.Vector3(dir.x * c + dir.z * s, 0, -dir.x * s + dir.z * c);
      if (S.lineClear(P.pos, _v.copy(P.pos).addScaledVector(d, dist * 0.7))) return d;
    }
    return dir;
  }

  /** where a skill goes in Auto (docs/CONTROLS.md §13.3) → [point, target | null]. hover: the foe under the mouse (a
   *  manual pick); fallback: where it goes with no foe at all (the device's own aim point) */
  aimFor(id, { hover = null, fallback = null } = {}) {
    const G = this.G, P = G.player, PA = G.padAim, t = G.engine?.time ?? performance.now() / 1000;
    if (hover && this.ok(hover) && hover.team === 'enemy') PA?.setManual?.(hover, true); // (the mouse's foe: a manual pick)
    const lock = PA?.lock && this.ok(PA.lock) ? PA.lock : null;
    // ground, line and cone picks are cached a moment (a held key feeds every frame)
    const c = this.cache.get(id);
    if (c && t - c.t < REPICK && c.lock === lock && Math.abs(c.x - P.pos.x) + Math.abs(c.z - P.pos.z) < 0.3 && (!c.target || this.ok(c.target))) return [c.point, c.target];
    const out = this.compute(id, lock, fallback);
    if (out[1] && out[1] === PA?.manual) PA.extendManual?.(); // (a foe you keep fighting stays picked)
    this.cache.set(id, { t, lock, x: P.pos.x, z: P.pos.z, point: out[0], target: out[1] });
    return out;
  }
  compute(id, lock, fallback) {
    const G = this.G, P = G.player, R = skillRuntime(id, G.state, G.derived), sp = aimSpec(id, R);
    const fb = () => (fallback ? fallback.clone() : P.pos.clone().add(new THREE.Vector3(Math.sin(P.facing) * 6, 0, Math.cos(P.facing) * 6)));
    const d = e => Math.hypot(e.pos.x - P.pos.x, e.pos.z - P.pos.z);
    switch (sp.kind) {
      case 'melee': {
        const reach = e => (sp.reach ?? (R?.params?.radius || 1.8)) + (e?.radius || 0.3) - 0.15;
        const step = G.skills?.isMelee?.(id, R) ? MELEE_STEP : 0; // (the attack and Crescent Chomp lunge or step in; the other swings and thrusts hit only what they reach)
        if (lock && d(lock) <= reach(lock) + step) return [lock.pos, lock];
        const alt = this.pickLock(null, { range: reach(null) + step + 0.4, sight: 3 }); // (null: the out-of-reach lock gets no sticky pass)
        if (alt && d(alt) <= reach(alt) + step) return [alt.pos, alt];
        if (lock) { const dd = d(lock), k = Math.min(dd, reach(lock) * 0.8) / dd; return [new THREE.Vector3(P.pos.x + (lock.pos.x - P.pos.x) * k, P.pos.y, P.pos.z + (lock.pos.z - P.pos.z) * k), null]; } // (a swing in place toward it: never a chase)
        return [fb(), null];
      }
      case 'target': {
        const rng = sp.range + REACH;
        if (lock && d(lock) <= rng + (lock.radius || 0)) return [lock.pos, lock];
        const alt = this.pickLock(null, { range: rng }); // (the best foe in range: the lock is out of it)
        if (alt) return [alt.pos, alt];
        return lock ? [lock.pos, lock] : [fb(), null];
      }
      case 'ground': case 'leap': return this.cluster(sp, sp.kind === 'leap' ? sp.range + sp.radius * 0.4 : sp.range, lock, fb, sp.kind === 'leap');
      case 'line': return this.lineAim(sp, sp.range, sp.width, lock, fb);
      case 'cone': {
        const pts = this.gather(P.pos.x, P.pos.z, sp.range + 0.5, lock);
        const b = pts.length ? bestCone(pts, { ox: P.pos.x, oz: P.pos.z, range: sp.range, half: sp.half, lock: lock?.pos }) : null;
        if (!b) return lock ? [lock.pos, null] : [fb(), null];
        const k = Math.max(2, Math.min(sp.range, b.mean || b.far || sp.range)); // (the fan's middle distance: a lobbed volley comes down on it)
        return [this.ground(P.pos.x + b.dx * k, P.pos.z + b.dz * k, P.pos.y), null];
      }
      case 'dash': {
        const mv = this.moveDir();
        if (mv) return sp.away ? [this.ground(P.pos.x - mv.x * 3, P.pos.z - mv.z * 3, P.pos.y), null] : [this.ground(P.pos.x + mv.x * sp.range, P.pos.z + mv.z * sp.range, P.pos.y), null]; // (escape: where the stick points)
        if (sp.idle === 'line') return this.lineAim(sp, sp.range, sp.width, lock, fb);
        if (sp.idle === 'ground') return this.cluster(sp, sp.range, lock, fb, true);
        if (sp.idle === 'away' && lock) { const away = _v.set(P.pos.x - lock.pos.x, 0, P.pos.z - lock.pos.z); if (away.lengthSq() < 1e-4) away.set(-Math.sin(P.facing), 0, -Math.cos(P.facing)); const dir = this.openDir(away.normalize().clone(), sp.range); return [this.ground(P.pos.x + dir.x * sp.range, P.pos.z + dir.z * sp.range, P.pos.y), null]; }
        return lock ? [lock.pos, null] : [fb(), null]; // ('lock': Caltrop Flip flips away from it by itself)
      }
      case 'heal': {
        if (!lock) return [this.ground(P.pos.x + Math.sin(P.facing) * 0.6, P.pos.z + Math.cos(P.facing) * 0.6, P.pos.y), null];
        const dd = d(lock) || 1, k = Math.min(1.2, dd) / dd;
        return [this.ground(P.pos.x + (lock.pos.x - P.pos.x) * k, P.pos.z + (lock.pos.z - P.pos.z) * k, P.pos.y), null];
      }
      default: return [lock ? lock.pos : fb(), null]; // (self: no aim; the hero still turns to the lock)
    }
  }
  /** a ground skill (or a leap) on the best cluster within range */
  cluster(sp, range, lock, fb, leap) {
    const P = this.G.player, S = this.G.skills;
    const pts = this.gather(P.pos.x, P.pos.z, range + sp.radius, lock);
    if (!pts.length) return lock ? [lock.pos, null] : [fb(), null];
    const c = bestCluster(pts, sp.radius, { ox: P.pos.x, oz: P.pos.z, range, lock: lock?.pos });
    if (!c) return lock ? [lock.pos, null] : [fb(), null];
    const pt = this.ground(c.x, c.z, P.pos.y);
    if (leap && S?.lineClear && !S.lineClear(P.pos, pt)) { // (never a leap into a wall or off a ledge: the lock's way if it is open, else as far as the floor goes)
      if (lock && S.lineClear(P.pos, lock.pos)) return [lock.pos, null];
      return [this.clearTo(pt), null];
    }
    return [pt, null];
  }
  /** the farthest point from the hero toward `to` with open, walkable floor all the way */
  clearTo(to) {
    const P = this.G.player, W = this.G.world, dx = to.x - P.pos.x, dz = to.z - P.pos.z, d = Math.hypot(dx, dz), n = Math.ceil(d / 0.25);
    let x = P.pos.x, z = P.pos.z;
    for (let i = 1; i <= n; i++) { const nx = P.pos.x + dx * i / n, nz = P.pos.z + dz * i / n; if (W.collision?.solidAt?.(nx, nz, 0.3) || (W.walkable && !W.walkable(nx, nz))) break; x = nx; z = nz; }
    return this.ground(x, z, P.pos.y);
  }
  /** a line (or a dash's cut) through the most foes */
  lineAim(sp, length, width, lock, fb) {
    const P = this.G.player;
    const pts = this.gather(P.pos.x, P.pos.z, length + width, lock);
    const b = pts.length ? bestLine(pts, { ox: P.pos.x, oz: P.pos.z, length, width, lock: lock?.pos }) : null;
    if (!b) return lock ? [lock.pos, null] : [fb(), null];
    const k = Math.max(2, Math.min(length, b.far || length));
    return [this.ground(P.pos.x + b.dx * k, P.pos.z + b.dz * k, P.pos.y), null];
  }

  /** the mouse's Assist (docs/CONTROLS.md §13.6): the cursor's point, snapped onto a foe or a group within SNAP m */
  assist(id, cursor, hover = null) {
    const G = this.G, P = G.player, C = G.combat, hov = hover && this.ok(hover) ? hover : null;
    if (!cursor || !P || !C?.inRadius || G.mode === 'interior') return hov ? [hov.pos, hov] : [cursor, null];
    const R = skillRuntime(id, G.state, G.derived), sp = aimSpec(id, R);
    if (sp.kind === 'ground') { // (a ground skill takes the best group near the cursor, even with a foe under it)
      const pts = this.gather(cursor.x, cursor.z, SNAP + sp.radius);
      const c = pts.length ? bestCluster(pts, sp.radius, { ox: P.pos.x, oz: P.pos.z, range: sp.range, near: { x: cursor.x, z: cursor.z, r: SNAP } }) : null;
      return c ? [this.ground(c.x, c.z, cursor.y), null] : hov ? [hov.pos, null] : [cursor, null];
    }
    if (hov) return [hov.pos, hov];
    if (sp.kind === 'self' || sp.kind === 'heal' || sp.kind === 'dash') return [cursor, null];
    let best = null, bd = Infinity;
    C.inRadius(cursor.x, cursor.z, SNAP + 1.5, 'ally', (e, dd) => {
      if (e.team !== 'enemy' || !this.ok(e) || e.breakable) return;
      if (dd <= SNAP + (e.radius || 0.3) && dd < bd) { bd = dd; best = e; }
    });
    if (!best) return [cursor, null];
    return [best.pos, sp.kind === 'line' || sp.kind === 'cone' || sp.kind === 'leap' ? null : best];
  }

  // ---------------------------------------------------------------- the AoE marker (docs/CONTROLS.md §13.5)
  /** per frame (game.js handleInput): a ring where a charging ground skill or leap will land, in Assist and Auto */
  tick(dt) {
    const G = this.G, a = G.skills?.charge?.active, W = G.world;
    let sp = null;
    if (a && !a.chan && G.mode !== 'interior' && this.mode !== TARGETING.OFF && !G.ui?.touch?.mark?.group?.visible) {
      const s = aimSpec(a.id, skillRuntime(a.id, G.state, G.derived));
      if (s.kind === 'ground' || s.kind === 'leap' || (s.kind === 'dash' && s.idle === 'ground')) sp = s;
    }
    if (!sp || !W?.scene) { if (this.marker?.parent) this.marker.removeFromParent(); return; }
    const m = this.marker ||= makeMarker();
    if (m.parent !== W.scene) { m.removeFromParent(); W.scene.add(m); m.userData.key = ''; } // (another world: sample its ground afresh)
    this.mt += dt;
    const at = G.skills.charge.aim, r = Math.max(0.8, Math.round(sp.radius * 4) / 4), pulse = 1 + 0.025 * Math.sin(this.mt * 5);
    const tex = markerTex(r); if (m.material.map !== tex) { m.material.map = tex; m.material.needsUpdate = true; }
    const h0 = W.heightAt ? W.heightAt(at.x, at.z) : at.y;
    m.position.set(at.x, h0 + 0.05, at.z);
    m.scale.set(pulse, 1, pulse);
    drapeMarker(m, W, at.x, at.z, h0, r * MARK_PAD, this.mt * 0.3);
    m.material.opacity = MARK_OPACITY;
  }
  clear() { this.cache.clear(); if (this.marker?.parent) this.marker.removeFromParent(); }
}

// the AoE marker: a dashed cream ring with an ink edge at the skill's radius, a soft pink rim inside it and a small gold
// dot at the centre. Its strokes are a fixed width in metres (one canvas per quarter metre of radius, cached), so a big
// Treat Meteor reads as thin as a small Paw Rune. One draw call, normal blending (it never lights or washes the scene),
// under padAim's lock ring.
const MARK_PAD = 1.08, MARK_OPACITY = 0.8, MARK_TEX = new Map();
function markerTex(r) {
  let tex = MARK_TEX.get(r); if (tex) return tex;
  const N = 512, cv = document.createElement('canvas'); cv.width = cv.height = N;
  const g = cv.getContext('2d'), c = N / 2, R = N / 2 / MARK_PAD, ppm = R / r; // (px per metre)
  const rim = g.createRadialGradient(c, c, Math.max(0, R - 0.9 * ppm), c, c, R);
  rim.addColorStop(0, 'rgba(255, 143, 176, 0)'); rim.addColorStop(1, 'rgba(255, 143, 176, 0.32)');
  g.beginPath(); g.arc(c, c, R, 0, Math.PI * 2); g.fillStyle = rim; g.fill();
  const n = Math.max(10, Math.round(Math.PI * 2 * r / 0.95)), step = Math.PI * 2 * R / n; // (dashes about 0.6 m, gaps 0.35 m)
  g.lineCap = 'round'; g.setLineDash([step * 0.62, step * 0.38]);
  for (const [w, col] of [[0.17, '#4a2c2a'], [0.08, '#fff6e8']]) { g.beginPath(); g.arc(c, c, R - 0.09 * ppm, 0, Math.PI * 2); g.lineWidth = Math.max(2, w * ppm); g.strokeStyle = col; g.stroke(); }
  g.setLineDash([]);
  const dot = Math.max(4, 0.11 * ppm);
  g.beginPath(); g.arc(c, c, dot, 0, Math.PI * 2); g.fillStyle = '#ffcf4a'; g.fill(); g.lineWidth = Math.max(2, dot * 0.45); g.strokeStyle = '#4a2c2a'; g.stroke();
  tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  MARK_TEX.set(r, tex);
  return tex;
}
// The disc is a polar mesh draped on the ground (MARK_SEG spokes, MARK_RINGS rings): each vertex takes the height under
// it, and fades out where the ground is not walkable or drops (or rises) more than MARK_DROP m from the centre's (a
// ledge, a pit, a wall, the sea), so a ring by a drop never hangs in the air (aimed off the ground itself, it lies flat
// and whole, as it did before). The heights are sampled only when the centre or the radius moves (MARK_N vertices:
// 0.04 to 0.09 ms a frame in a floor or a region, 0.01 ms when still); the slow spin only turns its UVs.
const MARK_SEG = 40, MARK_RINGS = [0, 0.3, 0.55, 0.72, 0.84, 0.92, 0.97, 1], MARK_N = 1 + MARK_SEG * (MARK_RINGS.length - 1);
const MARK_DROP = 0.35, MARK_FADE = 0.3;
/** the marker's disc geometry (flat; drapeMarker lays it down) */
export function markerGeometry() {
  const g = new THREE.BufferGeometry(), idx = [];
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MARK_N * 3), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(MARK_N * 2), 2));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MARK_N * 4).fill(1), 4));
  const at = (k, i) => k === 0 ? 0 : 1 + (k - 1) * MARK_SEG + (i % MARK_SEG);
  for (let k = 1; k < MARK_RINGS.length; k++) for (let i = 0; i < MARK_SEG; i++) {
    if (k === 1) idx.push(0, at(1, i + 1), at(1, i));
    else idx.push(at(k - 1, i), at(k - 1, i + 1), at(k, i), at(k - 1, i + 1), at(k, i + 1), at(k, i));
  }
  g.setIndex(idx);
  return g;
}
function makeMarker() {
  const m = new THREE.Mesh(markerGeometry(), new THREE.MeshBasicMaterial({ map: markerTex(2), transparent: true, depthWrite: false, toneMapped: false, opacity: MARK_OPACITY, vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3 }));
  m.renderOrder = 7; m.frustumCulled = false; m.name = 'autoAimMarker'; m.userData.key = '';
  return m;
}
/** lay the marker's disc (radius R m, its centre at x, z, height h0) on the ground, and spin its texture to `spin` */
export function drapeMarker(m, W, x, z, h0, R, spin) {
  m.userData.R = R;
  const g = m.geometry, P = g.attributes.position.array, U = g.attributes.uv.array, C = g.attributes.color.array;
  const key = `${Math.round(x * 20)},${Math.round(z * 20)},${R.toFixed(2)}`;
  if (m.userData.key !== key) {
    m.userData.key = key;
    const lay = !W.walkable || W.walkable(x, z) !== false; // (aimed off the ground, over the sea or a pit: flat and whole, as it was)
    for (let k = 0, v = 0; k < MARK_RINGS.length; k++) {
      const f = MARK_RINGS[k];
      for (let i = 0; i < (k ? MARK_SEG : 1); i++, v++) {
        const th = i / MARK_SEG * Math.PI * 2, lx = Math.cos(th) * f * R, lz = Math.sin(th) * f * R, wx = x + lx, wz = z + lz;
        const h = k && lay && W.heightAt ? W.heightAt(wx, wz) : h0, dh = Math.abs(h - h0);
        let a = dh <= MARK_DROP ? 1 : Math.max(0, 1 - (dh - MARK_DROP) / MARK_FADE);
        if (k && lay && W.walkable && W.walkable(wx, wz) === false) a = 0;
        P[v * 3] = lx; P[v * 3 + 1] = a > 0 ? h - h0 : 0; P[v * 3 + 2] = lz; C[v * 4 + 3] = a;
      }
    }
    g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true;
  }
  for (let k = 0, v = 0; k < MARK_RINGS.length; k++) {
    const f = MARK_RINGS[k] * 0.5;
    for (let i = 0; i < (k ? MARK_SEG : 1); i++, v++) { const th = i / MARK_SEG * Math.PI * 2 + spin; U[v * 2] = 0.5 + Math.cos(th) * f; U[v * 2 + 1] = 0.5 + Math.sin(th) * f; }
  }
  g.attributes.uv.needsUpdate = true;
}

// ------------------------------------------------------------------ the words (docs/CONTROLS.md §13.1: the hints follow it)
let _settings = null; // (the UI's settings, set by installTargeting: what the words read)
const modeNow = o => ({ dev: o.dev ?? Actions.device, mode: o.mode ?? targetingOf(o.settings ?? _settings, o.dev ?? Actions.device) });
/** a skill's text with "the cursor" in the words of the device and Targeting playing now: on the mouse (Off, Assist) it
 *  stays; in Auto it becomes "your target", "the biggest group", "the most foes" or, for a dash, "where you're heading
 *  (or …)"; on the pad and touch in Assist or Off, "your aim". o: { dev, mode, settings } (the QA), kind (the words of
 *  that aim kind: a charge perk's drift follows the lock, so 'target') */
export function aimWords(text, id, o = {}) {
  if (!text || !/cursor/.test(text)) return text;
  const { dev, mode } = modeNow(o);
  if (dev === 'kbm' && mode !== TARGETING.AUTO) return text;
  const a = o.kind ? { kind: o.kind } : id === 'attack' ? { kind: 'target' } : AIM[id] || { kind: 'self' }, auto = mode === TARGETING.AUTO;
  const noun = !auto ? 'your aim' : a.kind === 'ground' || a.kind === 'leap' ? 'the biggest group' : a.kind === 'line' || a.kind === 'cone' ? 'the most foes' : 'your target';
  return String(text)
    .replace(/\b(at|to|toward|after) (?:the|your) cursor\b/g, (m, prep) => {
      if (!auto || a.kind !== 'dash') return `${prep} ${noun}`;
      return a.idle === 'away' ? "where you're heading (or away from your target)" : a.idle === 'lock' ? 'away from your target' : "where you're heading (or onto the biggest group)";
    })
    .replace(/\b(?:the|your) cursor\b/g, noun);
}
/** the aim point a cast steers by after it leaves (Moonbeam's glide, the Twister / Riptide / Drifting Gloom drift):
 *  the pad's or touch's aim point (combat/padAim.js), and with the mouse in Auto the same (the lock or the group, so the
 *  words above stay true); else null (the mouse's cursor) */
export const steerPoint = () => Actions.padAim && (Actions.device !== 'kbm' || targetingOf(_settings, 'kbm') === TARGETING.AUTO) ? Actions.padAim : null;
const AIM_LINE = {
  melee: 'steps in on your target when it is close (never a chase)',
  target: 'at your target, or the best foe in range',
  ground: 'on the biggest group in range',
  line: 'through the most foes in a line',
  cone: 'the way its fan catches the most foes',
  leap: 'a leap onto the biggest group',
  heal: 'beside you, so you are always in it',
};
/** one line for a skill's tooltip: where it goes with this device's Targeting ('' for self skills, and with the mouse
 *  in Off) */
export function aimLine(id, o = {}) {
  const { dev, mode } = modeNow(o);
  const a = id === 'attack' ? null : AIM[id]; if (id !== 'attack' && (!a || a.kind === 'self')) return '';
  if (mode === TARGETING.OFF) return dev === 'touch' ? 'Targeting Off: drag off its button to aim it' : '';
  if (mode === TARGETING.ASSIST) return dev === 'kbm' ? 'Targeting Assist: snaps onto a foe or a group near the cursor' : 'Targeting Assist: at the foe in front of you';
  if (id === 'attack') return 'Targeting Auto: at your target (a melee swing steps in only when it is close)';
  if (a.kind === 'dash') return `Targeting Auto: where you're heading; standing still, ${a.idle === 'line' ? 'through the most foes' : a.idle === 'ground' ? 'onto the biggest group' : 'away from your target'}`;
  return `Targeting Auto: ${AIM_LINE[a.kind]}`;
}

/** boot (game.js, after the UI): fill the targeting keys an older save of the settings lacks, keep the old touch Skill
 *  aim setting working for old scripts (touchAim 1 → touch Off, 0 → Auto), and the debug menu's actions */
export function installTargeting(G) {
  const ui = G.ui;
  _settings = ui?.settings || null;
  if (ui?.settings) {
    Object.assign(ui.settings, migrateTargeting(ui.settings)); // (in memory: saved with the next setting the player changes; a boot never writes the settings by itself, so the first start's picks (core/deck.js) stay first-start picks)
    ui.onSetting?.((k, v) => { if (k === 'touchAim') ui.setSetting(TARGET_KEYS.touch, v === 1 ? TARGETING.OFF : TARGETING.AUTO); });
  }
  Events.on('mode:changed', () => G.autoAim?.clear());
  registerDebug('combat', [
    { group: 'Targeting (CT-8)', label: 'Targeting on this device', hint: 'Settings › Controls › Targeting for the device playing now', choices: TARGET_LABELS.map((label, value) => ({ label, value })),
      run: (G2, v) => { const dev = Actions.device; G2.ui?.setSetting(TARGET_KEYS[dev], v); return `${dev === 'kbm' ? 'Mouse' : dev === 'pad' ? 'Controller' : 'Touch'}: ${TARGET_LABELS[v]}`; } },
  ]);
}
