// The Guild's people in town (docs/COZY.md §5.1, §5.2; ROADMAP CZ-7, CZ-8): Old Hachi the Guildmaster by the Guild's
// door, and the hires as townsfolk villagers who live at the Guild. Built with the Toybox NPC kit (charKit buildHumanoid
// → toyKit), the pattern zoneVillagers.js uses: a hire's look comes from their saved seed (roster.js randomVillagerSpec)
// with their class's prop and accent on top (spec.toy.extras), so they look the same forever.
//   - Old Hachi: a retired Akita adventurer (red-fawn coat, white urajiro, a curled tail, upright ears), white bushy
//     brows, an indigo haori with a red knitted scarf, a gnarled walking stick in his right paw and a leather map case on
//     his back. He minds the Guild's door like Rosie minds her shop (role 'shop'), and sleeps at the Guild.
//   - Hires (cls): Guard a pot-lid shield on the back and a headband; Archer a toy bow and a quiver; Scout a bandana and a
//     brass spyglass at the hip; Healer a white satchel with a cross-stitched paw; Porter a big backpack with a bedroll.
//     They take townsfolk slots first (game.js syncTownsfolk asks inTown()), wander and sit like any townsfolk, sleep at
//     the Guild, walk off to the Wayfarer's Post when sent on an expedition and back in when the crew comes home.
//   installHires(G, run) → { sync(), inTown(), spec(h), hachiSpec, villagers, hachi }
import * as THREE from 'three';
import { Villager } from '../actors/npc.js';
import { prebuildHumanoid } from '../actors/charKit.js';
import { randomVillagerSpec } from '../actors/roster.js';
import { paintFn, mergeIndexed } from '../actors/disneyKit.js';
import { mulberry32 } from '../core/util.js';
import { Events } from '../core/events.js';
import { guildState } from './guild.js';
import { memberAway } from './state.js';

const shade = (base, amt = 0.12) => (x, y, z, nx, ny, nz, o) => { o.set(base).multiplyScalar(1 - amt * Math.max(0, Math.min(1, 0.4 - ny))); return 0; };
const ellG = (r, p, rot = [0, 0, 0], seg = 16) => {
  const g = new THREE.SphereGeometry(1, seg, Math.round(seg * 0.7)); g.scale(...r);
  if (rot[0] || rot[1] || rot[2]) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rot)));
  g.translate(...p); g.deleteAttribute('uv'); return g;
};
const cylG = (r0, r1, h, p, rot = [0, 0, 0], seg = 12) => {
  const g = new THREE.CylinderGeometry(r0, r1, h, seg); g.deleteAttribute('uv');
  if (rot[0] || rot[1] || rot[2]) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rot)));
  g.translate(...p); return g;
};
const torG = (r, t, p, rot = [0, 0, 0], arc = Math.PI * 2, seg = 18) => {
  const g = new THREE.TorusGeometry(r, t, 6, seg, arc); g.deleteAttribute('uv');
  if (rot[0] || rot[1] || rot[2]) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rot)));
  g.translate(...p); return g;
};
const boxG = (w, h, d, p, rot = [0, 0, 0]) => {
  const g = new THREE.BoxGeometry(w, h, d); g.deleteAttribute('uv');
  if (rot[0] || rot[1] || rot[2]) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rot)));
  g.translate(...p); return g;
};
/** a flat paw print (four toes and a pad) facing +z at p, size k (kit metres) */
const pawG = (p, k, hex, rot = [0, 0, 0]) => {
  const parts = [ellG([0.42 * k, 0.36 * k, 0.12 * k], [0, -0.15 * k, 0], [0, 0, 0], 10)];
  for (const [x, y] of [[-0.44, 0.22], [-0.16, 0.42], [0.16, 0.42], [0.44, 0.22]]) parts.push(ellG([0.15 * k, 0.17 * k, 0.1 * k], [x * k, y * k, 0], [0, 0, 0], 8));
  const g = mergeIndexed(parts.map(q => paintFn(q, shade(hex, 0.04))));
  if (rot[0] || rot[1] || rot[2]) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rot)));
  g.translate(...p); return g;
};

// ------------------------------------------------------------------ Old Hachi
function hachiExtras(R, K) {
  const { body, head, H, bw, dz, torsoZ, surfZ, tinted, kit } = K;
  // the white bushy brows of an old dog, over the kit's own thin brows
  const brows = [];
  for (const s of [1, -1]) {
    const x = s * 0.112, y = 0.292, z = surfZ(H.face, x, y) + 0.006;
    brows.push(paintFn(ellG([0.036, 0.016, 0.016], [x, y, z], [0.2, 0, -s * 0.22], 12), shade('#fbf6ee', 0.1)));
    brows.push(paintFn(ellG([0.022, 0.012, 0.012], [x + s * 0.03, y - 0.004, z - 0.004], [0.2, 0, -s * 0.5], 10), shade('#f2ebe0', 0.1)));
  }
  R.add(head, kit(mergeIndexed(brows)), 'hachiBrows');
  // the walking stick in his right paw: gnarled wood, a knob, a red cord with a little bell
  const hand = R.parts.handR;
  if (hand) {
    const st = [];
    const L = 0.54, tilt = [0, 0, 0.36]; // (the arm hangs out 0.36 rad: the stick stands upright in the world)
    const along = t => [-Math.sin(0.36) * t, -0.09 + Math.cos(0.36) * t, 0.03]; // (a point on the stick's axis: it reaches the ground)
    st.push(paintFn(cylG(0.014, 0.017, L, along(0), tilt, 7), shade('#9a6a42', 0.14)));
    st.push(paintFn(ellG([0.026, 0.03, 0.026], along(L / 2 + 0.01), [0, 0, 0], 10), shade('#8a5a36', 0.12)));
    for (const t of [0.1, -0.08]) st.push(paintFn(ellG([0.019, 0.012, 0.019], along(t), tilt, 8), shade('#7a4e30', 0.1))); // (knots)
    st.push(tinted(torG(0.018, 0.005, along(0.16), [Math.PI / 2, 0, 0.36], Math.PI * 2, 10), '#c8473a'));
    { const p = along(0.13); st.push(paintFn(ellG([0.012, 0.012, 0.012], [p[0] + 0.006, p[1], p[2] + 0.018], [0, 0, 0], 8), shade('#f2c04a', 0.05))); }
    R.add(hand, kit(mergeIndexed(st)), 'hachiStick');
  }
  // the map case on his back: a leather tube on a strap, brass caps, a rolled map peeking out
  const back = [], zb = -torsoZ(0, 0.14, bw, dz, 0.02) - 0.03;
  back.push(paintFn(cylG(0.03, 0.03, 0.26, [0.02, 0.16, zb], [0, 0, -0.55], 12), shade('#8a5a3a', 0.12)));
  for (const s of [1, -1]) back.push(paintFn(cylG(0.033, 0.033, 0.02, [0.02 - s * Math.sin(0.55) * 0.12, 0.16 + s * Math.cos(0.55) * 0.12, zb], [0, 0, -0.55], 12), shade('#c8a050', 0.06)));
  back.push(paintFn(cylG(0.022, 0.022, 0.05, [0.02 - Math.sin(0.55) * 0.15, 0.16 + Math.cos(0.55) * 0.15, zb], [0, 0, -0.55], 10), shade('#f4e8cc', 0.06)));
  R.add(body, kit(mergeIndexed(back)), 'hachiCase');
}
/** Old Hachi's spec (one object: prebuildHumanoid and the portraits key on it) */
export const HACHI_SPEC = {
  name: 'Old Hachi', species: 'dog', voice: 0.6, scale: 1.06, chubby: 1.04,
  fur: '#d4834a', fur2: '#fff6ea', earColor: '#d4834a', earInner: '#f2c0a8', nose: '#2a1c18', iris: '#5a3a24', blush: '#e8a090',
  patterns: { chin: true, chestBlaze: true },
  toy: { head: 'dog', ears: 'cat', tail: 'curl', extras: hachiExtras },
  outfit: { top: 'kimono', topColor: '#33507e', topColor2: '#f4ead8', bottom: 'pants', bottomColor: '#5a4a3e', sash: '#7a4a30', scarf: '#c8473a', scarfStyle: 'ends' },
};

// ------------------------------------------------------------------ the hires' class looks
const CLASS_LOOK = {
  guard: { hat: 'headband', hatColor: '#c8473a', extras: (R, K) => { // the pot-lid shield on the back
    const { body, bw, dz, torsoZ, kit } = K, zb = -torsoZ(0, 0.12, bw, dz, 0.02) - 0.035, P = [];
    P.push(paintFn(ellG([0.12, 0.12, 0.035], [0, 0.12, zb]), shade('#a8a8b8', 0.1)));
    P.push(paintFn(torG(0.118, 0.014, [0, 0.12, zb]), shade('#7a7a88', 0.08)));
    P.push(paintFn(ellG([0.02, 0.02, 0.016], [0, 0.12, zb - 0.035]), shade('#8a5a3a', 0.08)));
    P.push(pawG([0, 0.11, zb - 0.034], 0.055, '#c8473a', [0, Math.PI, 0]));
    R.add(body, kit(mergeIndexed(P)), 'clsGuard');
  } },
  archer: { extras: (R, K) => { // the quiver and a toy bow on the back
    const { body, bw, dz, torsoZ, kit } = K, zb = -torsoZ(0, 0.12, bw, dz, 0.02) - 0.03, P = [];
    P.push(paintFn(cylG(0.032, 0.028, 0.2, [0.05, 0.13, zb], [0, 0, 0.35]), shade('#5aa860', 0.12)));
    P.push(paintFn(torG(0.033, 0.006, [0.015, 0.22, zb], [Math.PI / 2, 0, 0.35]), shade('#c8a050', 0.06)));
    for (const [dx, c] of [[-0.012, '#ff8fb0'], [0.006, '#ffd24a'], [0.022, '#8fd0ff']]) P.push(paintFn(ellG([0.012, 0.03, 0.006], [0.0 + dx - 0.02, 0.27, zb], [0, 0, 0.35]), shade(c, 0.05)));
    P.push(paintFn(torG(0.15, 0.011, [-0.02, 0.12, zb - 0.03], [0, 0, Math.PI / 2 + 0.25], Math.PI * 0.8), shade('#b07a4a', 0.1)));
    R.add(body, kit(mergeIndexed(P)), 'clsArcher');
  } },
  scout: { hat: 'bandana', hatColor: '#e0952a', extras: (R, K) => { // the brass spyglass at the left hip
    const { body, bw, kit } = K, P = [];
    P.push(paintFn(cylG(0.026, 0.032, 0.17, [0.18 * bw, 0.03, 0.07], [0.3, 0, 0.35]), shade('#d8b050', 0.1)));
    P.push(paintFn(cylG(0.036, 0.036, 0.026, [0.18 * bw - 0.03, 0.105, 0.095], [0.3, 0, 0.35]), shade('#8a5a3a', 0.08)));
    P.push(paintFn(cylG(0.021, 0.021, 0.04, [0.18 * bw + 0.032, -0.05, 0.045], [0.3, 0, 0.35]), shade('#f0e0a8', 0.05)));
    P.push(paintFn(torG(0.032, 0.007, [0.18 * bw - 0.012, 0.06, 0.082], [0.3 + Math.PI / 2, 0, 0.35], Math.PI * 2, 12), shade('#c8473a', 0.05)));
    R.add(body, kit(mergeIndexed(P)), 'clsScout');
  } },
  healer: { bag: '#fff6ea', scarf: '#ff9ec0', extras: (R, K) => { // a cross-stitched paw on the satchel (the kit's own bag sits at the right hip)
    const { body, bw, kit } = K;
    R.add(body, kit(pawG([-0.18 * bw, 0.034, 0.122], 0.042, '#e86a8a', [0, -0.95, 0])), 'clsHealer');
  } },
  porter: { extras: (R, K) => { // a big backpack with a bedroll and a pot hanging off it
    const { body, bw, dz, torsoZ, kit } = K, zb = -torsoZ(0, 0.12, bw, dz, 0.02) - 0.085, P = [];
    P.push(paintFn(ellG([0.13, 0.15, 0.09], [0, 0.13, zb]), shade('#b07a4a', 0.14)));
    P.push(paintFn(ellG([0.125, 0.06, 0.088], [0, 0.22, zb + 0.004]), shade('#8a5a36', 0.1)));
    P.push(paintFn(ellG([0.07, 0.05, 0.03], [0, 0.08, zb - 0.08]), shade('#c89060', 0.1)));
    P.push(paintFn(cylG(0.05, 0.05, 0.3, [0, 0.33, zb + 0.01], [0, 0, Math.PI / 2], 12), shade('#efd8a8', 0.08)));
    for (const s of [1, -1]) P.push(paintFn(cylG(0.053, 0.053, 0.02, [s * 0.08, 0.33, zb + 0.01], [0, 0, Math.PI / 2], 12), shade('#c8473a', 0.05)));
    P.push(paintFn(ellG([0.14, 0.03, 0.1], [0, 0.27, zb + 0.02]), shade('#8a5a36', 0.1)));
    P.push(paintFn(ellG([0.04, 0.032, 0.04], [0.13, 0.04, zb + 0.01]), shade('#5a5a68', 0.1)));
    R.add(body, kit(mergeIndexed(P)), 'clsPorter');
  } },
};
const SPECS = new Map();
/** a hire's spec (stable object, from the saved seed and class) */
export function hireSpec(h) {
  const key = `${h.id}:${h.seed}:${h.cls}`;
  let s = SPECS.get(key);
  if (!s) {
    s = randomVillagerSpec(mulberry32(h.seed >>> 0));
    s.name = h.name;
    const L = CLASS_LOOK[h.cls] || {};
    s.outfit = { ...(s.outfit || {}) };
    if (L.hat) { s.outfit.hat = L.hat; s.outfit.hatColor = L.hatColor; }
    if (L.bag) s.outfit.bag = L.bag;
    if (L.scarf && !s.outfit.scarf) s.outfit.scarf = L.scarf;
    if (h.cls === 'porter' || h.cls === 'guard' || h.cls === 'archer') s.outfit.bag = undefined; // (the back is the prop's)
    s.toy = { ...(s.toy || {}), extras: L.extras };
    SPECS.set(key, s);
  }
  return s;
}

// ------------------------------------------------------------------ the people in town
export function installHires(G, run) {
  const H = new GuildFolk(G, run);
  return H;
}
class GuildFolk {
  constructor(G, run) {
    this.G = G; this.run = run; this.villagers = {}; this.hachi = null; this.pre = new Set();
    Events.on('expedition:sent', e => { for (const k of e?.crew || []) if (k.startsWith('hire:')) this.leave(k.slice(5)); });
    Events.on('expedition:back', e => { const r = G.cozy?.exp?.reports?.().find(x => x.uid === e?.uid); for (const k of r?.crew || []) if (k.startsWith('hire:')) this.walkIn(k.slice(5)); });
    Events.on('mode:changed', () => this.sync());
    Events.on('village:changed', () => this.sync());
    Events.on('guild:hired', () => this.sync());
    Events.on('guild:dismissed', () => this.sync());
  }
  get st() { return this.G.state; }
  get W() { return this.G.village?.world; }
  /** the Guild building's record in the village (null: not built) */
  rec() { return this.G.sim?.list.find(r => r.data.type === 'guild') || null; }
  /** a point in front of the Guild: `side` m to its right (seen from the street), `out` m out from the door */
  spot(rec, side = 0, out = 0) {
    const th = -rec.data.rot * Math.PI / 2, fx = Math.sin(th), fz = Math.cos(th), rx = Math.cos(th), rz = -Math.sin(th);
    return { x: rec.door.x + fx * out + rx * side, z: rec.door.z + fz * out + rz * side, face: th };
  }
  /** hires living in town now (the townsfolk slots they take: game.js syncTownsfolk) */
  inTown() { return Object.keys(this.villagers).length; }
  /** pre-build rigs while nobody can see a hitch (the Guild panel is open when you hire) */
  prewarm(h) { const s = hireSpec(h); if (!this.pre.has(s)) { this.pre.add(s); prebuildHumanoid(s); } }
  sync() {
    const G = this.G, W = this.W; if (!W || !G.sim) return;
    const rec = this.rec(), g = guildState(this.st);
    // Old Hachi: by the Guild's door while it stands
    if (rec && !this.hachi) this.spawnHachi(rec);
    else if (!rec && this.hachi) this.drop(this.hachi), this.hachi = null;
    else if (rec && this.hachi && this.hachi.home !== rec.door) { const a = this.spot(rec, 1.55, 0.9); this.hachi.anchor.set(a.x, 0, a.z); this.hachi.home = rec.door; this.hachi._hv = -1; }
    // the hires: everyone on the roster who isn't away
    const want = new Set(g.hires.filter(h => !memberAway(this.st, `hire:${h.id}`)).map(h => h.id));
    for (const id of Object.keys(this.villagers)) if (!want.has(id) && !this.villagers[id].leaving) this.remove(id);
    for (const h of g.hires) if (want.has(h.id) && !this.villagers[h.id]) this.spawn(h);
    for (const v of Object.values(this.villagers)) if (rec && v.home !== rec.door) { v.home = rec.door; v._hv = -1; }
  }
  spawnHachi(rec) {
    const G = this.G, W = this.W, a = this.spot(rec, 1.55, 0.9);
    const v = new Villager(W, G, HACHI_SPEC, { id: 'hachi', anchor: { x: a.x, z: a.z }, home: rec.door, wander: 1.0, role: 'shop' });
    v.homeFixed = true; v.guildmaster = true; v.speed = 1.1;
    v.interact.label = 'Talk to Old Hachi';
    v.interacted = () => this.run.talkHachi(v);
    v.setPos(a.x, a.z); v.facing = v.faceTarget = a.face + Math.PI / 4; v.sync?.();
    G.registerPortrait?.('hachi', HACHI_SPEC);
    G.npcs.push(v); this.hachi = v;
    return v;
  }
  spawn(h) {
    const G = this.G, W = this.W, rec = this.rec(), L = W.landmarks;
    const k = Object.keys(this.villagers).length, spec = hireSpec(h), at = rec ? this.spot(rec, -2.4 + (k % 5) * 1.2, 2.0 + Math.floor(k / 5) * 1.4 + (k % 2) * 0.5) : { x: L.plaza.x, z: L.plaza.z }; // (spread out in front of the Guild)
    const anchor = rec ? this.spot(rec, 0, 3.5) : L.plaza;
    const v = new Villager(W, G, spec, { id: `hire_${h.id}`, anchor: { x: anchor.x, z: anchor.z }, home: rec?.door || null, wander: 7 });
    v.folk = true; v.hire = h.id; v.homeFixed = !!rec;
    v.interact.label = `Chat with ${h.name}`;
    v.interacted = () => this.run.talkHire(v, h.id);
    v.setPos(at.x, at.z);
    G.registerPortrait?.(`hire_${h.id}`, spec);
    G.npcs.push(v); this.villagers[h.id] = v;
    return v;
  }
  drop(v) { v.retire(); const i = this.G.npcs.indexOf(v); if (i >= 0) this.G.npcs.splice(i, 1); v.dispose(); }
  remove(id) { const v = this.villagers[id]; if (!v) return; this.drop(v); delete this.villagers[id]; }
  /** a hire sets off: in town they walk off toward the Wayfarer's Post and are gone (as the heroes do) */
  leave(id) {
    const G = this.G, v = this.villagers[id]; if (!v) return;
    const L = this.W?.landmarks?.travel || null;
    const near = L && Math.hypot(v.pos.x - L.x, v.pos.z - L.z) < 26;
    if (G.mode === 'village' && v.visible && near && v.state !== 'inside') {
      v.clearTask?.(); v.frozen = true; v.talking = false; v.leaving = true; v.anim?.play?.('wave');
      v.scriptWalk = { x: L.x - 1.2, z: L.z + 0.4, speed: 1.8, t: 0, done: () => { if (!v.leaving) return; G.vfx?.poof?.(v.pos.clone().setY(v.pos.y + 0.6), { color: '#f2e6cc', n: 8, size: 0.4 }); this.remove(id); } };
    } else this.remove(id);
  }
  /** a hire is back: they walk in from the Wayfarer's Post and wave */
  walkIn(id) {
    const G = this.G, h = guildState(this.st).hires.find(x => x.id === id); if (!h) return;
    const v0 = this.villagers[id];
    if (v0) { if (v0.leaving) { v0.leaving = false; v0.scriptWalk = null; v0.frozen = false; v0.state = 'idle'; v0.t = 2; v0.anim?.play?.('wave'); } return; }
    const L = this.W?.landmarks?.travel;
    const v = this.spawn(h);
    if (G.mode !== 'village' || !L) return;
    const k = Object.keys(this.villagers).length % 3;
    v.setPos(L.x + 1.4 + k * 0.5, L.z + 1.6 - k * 0.3);
    v.warm = true; v.frozen = true;
    v.scriptWalk = { x: L.x + 4.6 + k * 0.8, z: L.z + 5.0 - k * 0.6, speed: 1.7, t: 0, done: () => { v.frozen = false; v.state = 'idle'; v.t = 2; v.greeted = 20; v.anim?.play?.('wave'); G.vfx?.emote?.(v, 'heart', 2); } };
  }
}
