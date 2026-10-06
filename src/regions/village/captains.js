// Siege captains (docs/ZONES.md §2; ROADMAP Z-D2): each zone village's siege is led by a unique elite in the square — a
// bigger, named variant of one of the zone's monsters with fixed elite mods and two signature attacks. It is a boss to the
// combat code (def.boss: the intro, the boss bar, the framing, stun resistance) but not the region's boss: the village
// runtime lends it the mode's boss slot while it fights (village.js) and RegionMode hands its death back to the village.
// The captains register with the monster tables the way the region monster modules do (regions/monsters/index.js).
import { MONSTERS, registerMonsters } from '../../dungeon/monsters.js';
import { KIND_MAP } from '../../dungeon/monster.js';
import '../monsters/index.js'; // (the zone monsters the captains are built on)
import * as THREE from 'three';
import { tele, push, roll, act, sfx, bolt, lob, puff, patch, playerIn, hitArea, chill, take, give, LEAF_LOOK } from '../monsters/bamboo.js';
import { icicleDrop, TC as ONSEN_TC } from '../monsters/onsen.js';
import { rand, clamp, TAU, dist, angleDiff } from '../../core/util.js';
const TELE_MAPLE = '#ff3a7a', TELE_TIDE = '#ff5a3a';

/** the captains by id: { zone, base (monster id), name, subtitle, variant, scale, radius, vr, life, mods, lvl, gear (art.js
 *  captainGearTpl: colours + per-part placement on the base body), glb (ROADMAP Z-D6: a Blender model slot, null = the kit) } */
export const CAPTAINS = {
  captainGaleclaw: { zone: 'bamboo', base: 'kamaitachi', name: 'Captain Galeclaw', subtitle: 'Storm-weasel of the Takemori siege', variant: 2, scale: 2.05, radius: 0.62, vr: 0.84, life: 0.5, mods: ['bouncy', 'zapBurst'], lvl: 2, gear: {}, glb: null },
  captainStrawgrin: { zone: 'maple', base: 'kakashi', name: 'Captain Strawgrin', subtitle: 'Scarecrow general of the Akane siege', variant: 2, scale: 1.9, radius: 0.6, vr: 0.8, life: 0.5, mods: ['multishot', 'cursed'], lvl: 2,
    gear: { banner: '#7a2a1e', mark: '#ffd07a', place: { helm: null, sode: [0, 0.38, -0.12, 1.25], sw: 1.5, flag: [0, 0.42, -0.08, 1.15] } }, glb: null },
  captainBrineclaw: { zone: 'tidepool', base: 'heikegani', name: 'Captain Brineclaw', subtitle: 'Shogun crab of the Shiokaze siege', variant: 3, scale: 1.8, radius: 0.95, vr: 1.08, life: 0.42, mods: ['stoneskin', 'bouncy'], lvl: 2,
    // its own look (a variant of the Heike-gani builder's shape knobs, regions/monsters/tidepool.js): a wide round coral
    // shell with a rolled lip, three stubby legs a side, two big claws held up front, eyes on stalks
    look: { key: 3, name: 'Brineclaw', shell: '#ea6440', belly: '#f8e6c8', leg: '#d8583a', claw: '#f4703f', tip: '#3a1c1c', trim: '#ffd257', face: '#3a1418', eyeW: '#fff6e6', crest: '#ffc83a', mon: '#e8403a',
      shellW: 0.6, shellD: 0.44, dome: 0.27, lip: true, legs: 3, legK: 1.9, legL: 0.88, clawK: 1.5, stalk: 2.0 },
    gear: { banner: '#1e3a5a', mark: '#e8f4ff', place: { helm: [0, -0.05, 0.03, 1.2], sode: null, flag: [0, -0.1, -0.46, 0.8] } }, glb: null },
  captainFrostbelly: { zone: 'onsen', base: 'yukidaruma', name: 'Captain Frostbelly', subtitle: 'Snowman general of the Yukimi siege', variant: 2, scale: 1.75, radius: 0.85, vr: 1.0, life: 0.36, mods: ['frostAura', 'extraStrong'], lvl: 2,
    gear: { banner: '#3a3a6a', mark: '#e8f0ff', place: { helm: null, sode: [0, 0.32, -0.02, 1.6], sw: 2.1, flag: [0, 0.5, -0.16, 1.3] } }, glb: null },
};

// ------------------------------------------------------------------ Galeclaw: Gale Rush (three dashes) + Sickle Storm (a blade ring)
const GR = { WIND: 0.55, GAP: 0.18, SPEED: 16, W: 0.75, RECOVER: 1.15, N: 3 };
const SS = { WIND: 0.95, R: 2.7, BLADES: 12, REST: 1.4 };
function galeclawAI(m, dt, target, d, slow) {
  if (m.warded) { m.aggro = false; act(m, 'idle'); return false; } // (the siege's banner ward: it waits in the square, village.js)
  const C = m.cap ||= { cd: rand(3.5, 5), storm: 7, sig: null };
  const G = m.G, base = MONSTERS[m.def.baseId].ai;
  if (C.sig) return sig(m, C, dt, target, d);
  C.cd -= dt; C.storm -= dt;
  const free = m.state !== 'windup' && m.state !== 'attack' && m.rs?.st !== 'dash';
  if (free && C.storm <= 0 && m.life < m.lifeMax * 0.6 && d < 7) { begin(m, C, { kind: 'storm', ph: 'wind', t: 0 }); return false; }
  if (free && C.cd <= 0 && d < 11 && m.mode.los(m.pos, target.pos)) { begin(m, C, { kind: 'rush', ph: 'wind', t: 0, n: 0 }); return false; }
  void G;
  return base(m, dt, target, d, slow);
}
function begin(m, C, s) {
  if (m.telegraph) { m.telegraph.t = 999; m.telegraph = null; }
  if (m.rs) { m.rs.st = 'roam'; m.rs.t = 0; }
  m.state = 'windup'; C.sig = s;
  m.mode.bossEngaged?.(m);
  if (s.kind === 'storm') {
    act(m, 'wind'); m.mode.bossTelegraph?.(SS.WIND);
    s.tele = tele(m.G, { shape: 'circle', x: m.pos.x, z: m.pos.z, r: SS.R, time: SS.WIND, color: '#ffd84a' });
    sfx('boss_roar', m.pos); sfx('kamaitachi_wind', m.pos);
    m.emote?.('anger', 1.2);
  }
}
function aim(m, s, target) {
  const dx = target.pos.x - m.pos.x, dz = target.pos.z - m.pos.z, d = Math.hypot(dx, dz) || 1;
  s.dx = dx / d; s.dz = dz / d; s.len = Math.min(d + 3, 10); m.facing = Math.atan2(s.dx, s.dz);
  s.x0 = m.pos.x; s.z0 = m.pos.z; s.trav = 0; s.hit = false;
  s.tele = tele(m.G, { shape: 'lane', x: m.pos.x, z: m.pos.z, r: GR.W, dir: m.facing, len: s.len + 0.5, time: GR.WIND, color: '#ff6a3a' });
  m.mode.bossTelegraph?.(GR.WIND);
  act(m, 'wind'); sfx('kamaitachi_wind', m.pos);
}
function sig(m, C, dt, target, d) {
  const s = C.sig, G = m.G; s.t += dt;
  if (s.kind === 'rush') {
    if (s.ph === 'wind') {
      if (s.dx == null) aim(m, s, target);
      m.facing = Math.atan2(s.dx, s.dz);
      if (s.t >= GR.WIND) { s.ph = 'dash'; s.t = 0; m.state = 'attack'; act(m, 'dash'); sfx('kamaitachi_dash', m.pos); }
      return false;
    }
    if (s.ph === 'dash') {
      const step = push(m, s.dx, s.dz, GR.SPEED, dt); s.trav += step;
      if (!s.hit && dist(target.pos.x, target.pos.z, m.pos.x, m.pos.z) < GR.W + (target.radius || 0.3) + 0.25) { s.hit = true; m.dealTo(target, Math.round(roll(m) * 1.1), m.stats.element, 1.6); G.vfx.slash(target.pos, m.facing, { color: '#fff4b0', arc: 1.6, r: 1.1, life: 0.2, y: 0.7 }); }
      if (Math.random() < 0.9) puff(G.vfx.smoke, m.pos.x, m.pos.y + 0.3, m.pos.z, { vx: -s.dx * 2, vy: 0.4, vz: -s.dz * 2, life: 0.45, size: 0.5, size1: 1.0, color: '#fff4c8', alpha: 0.55, alpha1: 0, drag: 3 });
      if (s.trav >= s.len || step < GR.SPEED * dt * 0.25 || s.t > 1.1) {
        trail(m, s.x0, s.z0, m.pos.x, m.pos.z);
        s.n++;
        if (s.n >= GR.N) { s.ph = 'recover'; s.t = 0; act(m, 'recover'); m.emote?.('sweat', GR.RECOVER); G.vfx.decal(m.pos, { r: m.bodyR * 1.4, color: '#ffe0a0', additive: true, opacity: 0.3, life: GR.RECOVER, spin: -0.8 }); }
        else { s.ph = 'gap'; s.t = 0; act(m, 'idle'); }
      }
      return true;
    }
    if (s.ph === 'gap') { m.faceTo(target.pos.x, target.pos.z, dt * 2); if (s.t >= GR.GAP) { s.ph = 'wind'; s.t = 0; s.dx = null; m.state = 'windup'; } return false; }
    if (s.ph === 'recover') { if (s.t >= GR.RECOVER) end(m, C, rand(6.5, 8.5)); return false; }
  }
  if (s.kind === 'storm') {
    if (s.ph === 'wind') {
      if (Math.random() < dt * 40) { const a = rand(0, TAU), r = SS.R * (1.1 - s.t / SS.WIND * 0.7); puff(G.vfx.spark, m.pos.x + Math.cos(a) * r, m.pos.y + rand(0.2, 1.2), m.pos.z + Math.sin(a) * r, { vx: -Math.sin(a) * 4, vz: Math.cos(a) * 4, life: 0.35, size: 0.35, size1: 0.1, color: '#fff4b0', alpha: 0.9, alpha1: 0 }); }
      m.facing += dt * (4 + s.t * 12);
      if (s.t >= SS.WIND) {
        s.ph = 'rest'; s.t = 0; m.state = 'attack';
        hitArea(m, m.pos.x, m.pos.z, SS.R, Math.round(roll(m) * 1.2), m.stats.element, 1.4);
        G.vfx.ring?.(m.pos, { color: '#fff4b0', r0: 0.4, r1: SS.R + 0.4, life: 0.4 });
        G.engine.rig.shake(0.45);
        for (let i = 0; i < SS.BLADES; i++) {
          const a = i / SS.BLADES * TAU + rand(-0.05, 0.05);
          bolt(m, { look: LEAF_LOOK, from: { x: m.pos.x, z: m.pos.z }, dir: { x: Math.cos(a), z: Math.sin(a) }, speed: 7.5, range: 9, radius: 0.32, h: 0.8, color: '#fff2a8', trail: '#ffffff', size: 0.55, onHit: e => m.dealTo(e, Math.max(1, Math.round(roll(m) * 0.55)), m.stats.element, 0.6) });
        }
        sfx('kamaitachi_dash', m.pos);
        act(m, 'recover'); m.emote?.('sweat', SS.REST);
        G.vfx.decal(m.pos, { r: m.bodyR * 1.4, color: '#ffe0a0', additive: true, opacity: 0.3, life: SS.REST, spin: -0.8 });
      }
      return false;
    }
    if (s.ph === 'rest') { if (s.t >= SS.REST) end(m, C, 3); return false; }
  }
  end(m, C, 3); return false;
}
function end(m, C, cd) { C.sig = null; C.cd = cd; if (C.storm <= 0) C.storm = rand(9, 12); m.state = 'chase'; m.cd = rand(1.2, 2); act(m, 'idle'); }
// the wind trail a dash leaves: a lane that nicks the hero for a moment (like a kamaitachi's, wider)
function trail(m, x0, z0, x1, z1) {
  const G = m.G, len = Math.hypot(x1 - x0, z1 - z0); if (len < 0.5) return;
  const dx = (x1 - x0) / len, dz = (z1 - z0) / len, raw = Math.max(1, Math.round(roll(m) * 0.25));
  patch(m, { x: (x0 + x1) / 2, z: (z0 + z1) / 2, r: len / 2, life: 1.4, tick: 0.35,
    update: (dt, z) => { if (Math.random() < dt * 34) { const u = Math.random() * len, px = x0 + dx * u, pz = z0 + dz * u; puff(G.vfx.smoke, px, (G.world.heightAt?.(px, pz) || 0) + rand(0.2, 0.9), pz, { vx: dx * 2, vy: 0.3, vz: dz * 2, life: 0.5, size: 0.4, size1: 0.9, color: '#fff8d8', alpha: 0.45 * (1 - z.t / z.life), alpha1: 0, drag: 3 }); } },
    onTick: () => {
      const P = G.player; if (!P || G.playerDead) return;
      const u = clamp((P.pos.x - x0) * dx + (P.pos.z - z0) * dz, 0, len), qx = x0 + dx * u, qz = z0 + dz * u;
      if (dist(P.pos.x, P.pos.z, qx, qz) < 0.7 + (P.radius || 0.3)) m.mode.combat.hitPlayer(raw, { element: m.stats.element, level: m.level, src: m });
    } });
}
// ------------------------------------------------------------------ Strawgrin (maple): Murder of Crows + Harvest Scythe
// An oni scarecrow general. Murder of Crows: it rattles, then six crows dive one after another onto marked circles
// round the hero (the last ones cut off the escape). Harvest Scythe: in close, a wide sweep in front with knockback.
const MC = { WIND: 0.85, N: 6, R: 1.15, GAP: 0.2, TELE: 1.0, REST: 1.1 };
const HS = { WIND: 0.75, R: 3.5, ARC: 1.15, REST: 0.9 };
const _crowMat = new THREE.MeshToonMaterial({ color: '#2a2230' }), _crowBeak = new THREE.MeshToonMaterial({ color: '#f0b030' });
function makeCrow() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), _crowMat); body.scale.set(0.8, 0.75, 1.35); g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), _crowMat); head.position.set(0, 0.07, 0.2); g.add(head);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.12, 6), _crowBeak); beak.rotation.x = Math.PI / 2; beak.position.set(0, 0.06, 0.32); g.add(beak);
  for (const s of [-1, 1]) { const w = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.02, 0.2), _crowMat); w.geometry.translate(s * 0.21, 0, 0); w.position.set(s * 0.06, 0.05, 0); g.add(w); g.userData[s < 0 ? 'wl' : 'wr'] = w; }
  return g;
}
const CROW_LOOK = {
  start(G, s) {
    const o = take(G, 'captainCrow', makeCrow); o.scale.setScalar(1.6); o.position.set(s.x, s.y, s.z);
    let ph = rand(0, TAU);
    return {
      update(dt, s2) {
        ph += dt * 22; const f = Math.sin(ph) * 0.8;
        o.userData.wl.rotation.z = -f; o.userData.wr.rotation.z = f;
        const vx = s2.x - s2.px, vy = s2.y - s2.py, vz = s2.z - s2.pz, h = Math.hypot(vx, vz);
        if (h > 1e-4 || Math.abs(vy) > 1e-4) o.rotation.set(-Math.atan2(vy, h || 1e-4) * 0.9, Math.atan2(vx, vz), 0);
        o.position.set(s2.x, s2.y, s2.z);
      },
      end() { give(o); },
    };
  },
};
function strawgrinAI(m, dt, target, d, slow) {
  if (m.warded) { m.aggro = false; act(m, 'idle'); return false; }
  const C = m.cap ||= { cd: rand(3.5, 5), scythe: 2.5, sig: null };
  const base = MONSTERS[m.def.baseId].ai;
  if (C.sig) return strawSig(m, C, dt, target, d);
  C.cd -= dt; C.scythe -= dt;
  const free = m.state !== 'windup' && m.state !== 'attack';
  if (free && C.scythe <= 0 && d < HS.R * 0.9) { capBegin(m, C, { kind: 'scythe', t: 0 }); return false; }
  if (free && C.cd <= 0 && d < 12 && m.mode.los(m.pos, target.pos)) { capBegin(m, C, { kind: 'crows', t: 0 }); return false; }
  return base(m, dt, target, d, slow);
}
function capBegin(m, C, s) {
  if (m.telegraph) { m.telegraph.t = 999; m.telegraph = null; }
  if (m.rs) { m.rs.st = 'move'; m.rs.t = 0; }
  m.state = 'windup'; C.sig = s;
  m.mode.bossEngaged?.(m);
}
function strawSig(m, C, dt, target, d) {
  const s = C.sig, G = m.G; s.t += dt;
  if (s.kind === 'crows') {
    if (!s.go) {
      s.go = true; act(m, 'wind'); m.mode.bossTelegraph?.(MC.WIND);
      sfx('kakashi_rattle', m.pos); sfx('kakashi_caw', m.pos); m.emote?.('anger', 1);
      // where they'll land: on the hero, then round them (fixed now: you dodge the marks)
      const P = target.pos, a0 = rand(0, TAU); s.spots = [[P.x, P.z]];
      for (let i = 1; i < MC.N; i++) { const a = a0 + i * TAU / (MC.N - 1), r = 2.1; s.spots.push([P.x + Math.cos(a) * r, P.z + Math.sin(a) * r]); }
      s.i = 0;
    }
    m.faceTo(target.pos.x, target.pos.z, dt * 2);
    if (s.t >= MC.WIND && s.i < MC.N && s.t >= MC.WIND + s.i * MC.GAP) {
      const [x, z] = s.spots[s.i++], raw = Math.max(1, Math.round(roll(m) * 0.9));
      if (m.world.walkable(x, z)) lob(m, { look: CROW_LOOK, from: m.lift(m.height * 0.9), to: { x, z }, h: 3.5, time: MC.TELE, r: MC.R, tele: TELE_MAPLE,
        onLand: () => { hitArea(m, x, z, MC.R, raw, m.stats.element, 0.9); const y = m.world.heightAt(x, z); G.vfx.dustRing(new THREE.Vector3(x, y, z), 1.2, 10); G.vfx.ring?.(new THREE.Vector3(x, y, z), { color: '#3a2a3a', r0: 0.2, r1: MC.R, life: 0.25 }); sfx('kakashi_peck', { x, z }); } });
      if (s.i === 1) { act(m, 'send'); sfx('kakashi_caw', m.pos); }
    }
    if (s.t >= MC.WIND + MC.N * MC.GAP + MC.TELE + MC.REST) capEnd(m, C, rand(7, 9));
    return false;
  }
  if (s.kind === 'scythe') {
    if (!s.go) {
      s.go = true; act(m, 'hopWind'); m.mode.bossTelegraph?.(HS.WIND);
      s.dir = Math.atan2(target.pos.x - m.pos.x, target.pos.z - m.pos.z); m.facing = s.dir;
      s.tele = tele(G, { shape: 'cone', x: m.pos.x, z: m.pos.z, r: HS.R, dir: s.dir, arc: HS.ARC, time: HS.WIND, color: TELE_MAPLE });
      sfx('kakashi_rattle', m.pos);
    }
    if (!s.cut && s.t >= HS.WIND) {
      s.cut = true; m.state = 'attack'; act(m, 'land');
      const P = G.player;
      if (P && !G.playerDead && !P.invuln) {
        const dx = P.pos.x - m.pos.x, dz = P.pos.z - m.pos.z, dd = Math.hypot(dx, dz);
        if (dd < HS.R + (P.radius || 0.3) && Math.abs(angleDiff(s.dir, Math.atan2(dx, dz))) < HS.ARC + 0.1) m.dealTo(P, Math.round(roll(m) * 1.4), m.stats.element, 2.4);
      }
      G.vfx.slash(m.lift(0), s.dir, { color: '#ffe6a8', arc: HS.ARC * 2, r: HS.R * 0.9, life: 0.26, y: 0.8 });
      G.vfx.dustRing(m.pos, 2.2, 14); G.engine.rig.shake(0.3);
      sfx('kakashi_stomp', m.pos);
    }
    if (s.t >= HS.WIND + HS.REST) capEnd(m, C, Math.max(C.cd, 2), () => { C.scythe = rand(5, 7); });
    return false;
  }
  capEnd(m, C, 3); return false;
}
function capEnd(m, C, cd, after) { C.sig = null; C.cd = cd; after?.(); m.state = 'chase'; m.cd = rand(1.2, 2); if (m.rs) { m.rs.st = 'move'; m.rs.t = 0; } act(m, 'idle'); }

// ------------------------------------------------------------------ Brineclaw (tidepool): Sidelong Rampage + Tidal Slam
// A shogun crab. Sidelong Rampage: three sideways charges, each on a marked lane. Tidal Slam: both claws up, a slam
// at its feet, then a ring wave that rolls out across the square (jump the ring by rolling through it).
const SR = { WIND: 0.55, GAP: 0.22, SPEED: 13, W: 0.85, N: 3, RECOVER: 1.2 };
const TS = { WIND: 0.95, R: 2.2, WAVE: 6.2, SPEED: 5.2, BAND: 0.55, STUCK: 1.3 };
function brineclawAI(m, dt, target, d, slow) {
  if (m.warded) { m.aggro = false; act(m, 'idle'); return false; }
  const C = m.cap ||= { cd: rand(3, 4.5), slam: 3, sig: null };
  const base = MONSTERS[m.def.baseId].ai;
  if (C.sig) return brineSig(m, C, dt, target, d);
  C.cd -= dt; C.slam -= dt;
  const free = m.state !== 'windup' && m.state !== 'attack' && m.rs?.st !== 'dash' && m.rs?.st !== 'stuck';
  if (free && C.slam <= 0 && d < 4.2) { capBegin(m, C, { kind: 'slam', t: 0 }); return false; }
  if (free && C.cd <= 0 && d > 2 && d < 10 && m.mode.los(m.pos, target.pos)) { capBegin(m, C, { kind: 'rush', t: 0, n: 0, ph: 'wind' }); return false; }
  return base(m, dt, target, d, slow);
}
function brineSig(m, C, dt, target, d) {
  const s = C.sig, G = m.G; s.t += dt;
  if (s.kind === 'rush') {
    if (s.ph === 'wind') {
      if (s.dx == null) {
        const dx = target.pos.x - m.pos.x, dz = target.pos.z - m.pos.z, L = Math.hypot(dx, dz) || 1;
        s.dx = dx / L; s.dz = dz / L; s.len = Math.min(L + 2.5, 9); s.trav = 0; s.hit = false;
        s.side = s.n % 2 ? -1 : 1; m.facing = Math.atan2(-s.dz * s.side, s.dx * s.side); // (side-on: a crab charges sideways)
        tele(G, { shape: 'lane', x: m.pos.x, z: m.pos.z, r: SR.W, dir: Math.atan2(s.dx, s.dz), len: s.len + 0.5, time: SR.WIND, color: TELE_TIDE });
        m.mode.bossTelegraph?.(SR.WIND); act(m, 'dashWind'); sfx('heikegani_dash_wind', m.pos);
        if (m.model) m.model.side = s.side;
      }
      if (s.t >= SR.WIND) { s.ph = 'dash'; s.t = 0; m.state = 'attack'; act(m, 'dash'); sfx('heikegani_dash', m.pos); }
      return false;
    }
    if (s.ph === 'dash') {
      const step = push(m, s.dx, s.dz, SR.SPEED, dt); s.trav += step;
      if (!s.hit && dist(target.pos.x, target.pos.z, m.pos.x, m.pos.z) < SR.W + (target.radius || 0.3) + 0.2) { s.hit = true; m.dealTo(target, Math.round(roll(m) * 1.2), 'phys', 2.0); G.vfx.slash(target.pos, Math.atan2(s.dx, s.dz), { color: '#fff0e0', arc: 1.6, r: 1.1, life: 0.22, y: 0.5 }); }
      if (Math.random() < 0.9) puff(G.vfx.smoke, m.pos.x - s.dx * 0.5, m.pos.y + 0.12, m.pos.z - s.dz * 0.5, { vx: -s.dx * 2, vy: 0.4, vz: -s.dz * 2, life: 0.45, size: 0.4, size1: 0.9, color: '#f2e6cc', alpha: 0.55, alpha1: 0, drag: 3 });
      if (s.trav >= s.len || step < SR.SPEED * dt * 0.25 || s.t > 1) {
        s.n++;
        if (s.n >= SR.N) { s.ph = 'recover'; s.t = 0; act(m, 'recover'); m.emote?.('sweat', SR.RECOVER); }
        else { s.ph = 'gap'; s.t = 0; act(m, 'idle'); }
      }
      return true;
    }
    if (s.ph === 'gap') { if (s.t >= SR.GAP) { s.ph = 'wind'; s.t = 0; s.dx = null; m.state = 'windup'; } return false; }
    if (s.ph === 'recover') { if (s.t >= SR.RECOVER) capEnd(m, C, rand(6, 8)); return false; }
  }
  if (s.kind === 'slam') {
    if (!s.go) {
      s.go = true; act(m, 'slamWind'); m.mode.bossTelegraph?.(TS.WIND);
      m.faceTo(target.pos.x, target.pos.z, 1);
      tele(G, { shape: 'circle', x: m.pos.x, z: m.pos.z, r: TS.R, time: TS.WIND, color: TELE_TIDE });
      sfx('heikegani_slam_wind', m.pos); sfx('boss_roar', m.pos);
    }
    if (!s.hit0 && s.t >= TS.WIND) {
      s.hit0 = true; m.state = 'attack'; act(m, 'slam');
      hitArea(m, m.pos.x, m.pos.z, TS.R, Math.round(roll(m) * 1.5), 'phys', 2.2);
      const y = m.world.heightAt(m.pos.x, m.pos.z), c = new THREE.Vector3(m.pos.x, y, m.pos.z); s.c = c;
      G.vfx.ring?.(c, { color: '#e8fcff', r0: 0.4, r1: TS.R * 1.2, life: 0.35 }); G.vfx.dustRing(c, 2.2, 18); G.engine.rig.shake(0.45);
      sfx('heikegani_slam', m.pos);
      s.wave = TS.R; s.waveHit = false;
    }
    if (s.hit0 && s.wave < TS.WAVE) { // the ring wave rolls out
      s.wave += TS.SPEED * dt;
      if (Math.random() < dt * 30) { const a = rand(0, TAU); puff(G.vfx.smoke, s.c.x + Math.cos(a) * s.wave, s.c.y + 0.25, s.c.z + Math.sin(a) * s.wave, { vy: 1.4, life: 0.5, size: 0.45, size1: 0.9, color: '#dff8ff', alpha: 0.7, alpha1: 0, drag: 2 }); }
      if ((s.ringT = (s.ringT || 0) - dt) <= 0) { s.ringT = 0.12; G.vfx.ring?.(s.c, { color: '#bff0ff', r0: s.wave - 0.2, r1: s.wave + 0.35, life: 0.18 }); }
      const P = G.player;
      if (!s.waveHit && P && !G.playerDead && !P.invuln) { const pd = dist(P.pos.x, P.pos.z, s.c.x, s.c.z); if (Math.abs(pd - s.wave) < TS.BAND + (P.radius || 0.3) * 0.5) { s.waveHit = true; m.dealTo(P, Math.round(roll(m) * 0.9), 'frost', 1.6); } }
    }
    if (s.hit0 && s.t >= TS.WIND + 0.2 && !s.stuck) { s.stuck = true; act(m, 'stuck'); m.emote?.('sweat', TS.STUCK); }
    if (s.t >= TS.WIND + TS.STUCK) capEnd(m, C, Math.max(C.cd, 1.5), () => { C.slam = rand(6, 8); });
    return false;
  }
  capEnd(m, C, 3); return false;
}

// ------------------------------------------------------------------ Frostbelly (onsen): Avalanche Roll + Icicle Rain
// A grand snowman general. Avalanche Roll: it curls into a huge snowball and bowls down a marked lane. Icicle Rain: it
// raises its arms and icicles crash down on marked spots round the hero, one after another.
const AR = { CURL: 1.0, SPEED: 12, LANE: 0.95, DIZZY: 1.3, BALL: 0.72 };
const IR = { WIND: 0.9, N: 7, GAP: 0.16, TIME: 1.0, R: 1.05, REST: 0.8 };
function frostbellyAI(m, dt, target, d, slow) {
  if (m.warded) { m.aggro = false; act(m, 'idle'); return false; }
  const C = m.cap ||= { cd: rand(3, 4.5), rain: 4, sig: null };
  const base = MONSTERS[m.def.baseId].ai;
  if (C.sig) return frostSig(m, C, dt, target, d);
  C.cd -= dt; C.rain -= dt;
  const free = m.state !== 'windup' && m.state !== 'attack' && m.rs?.st !== 'roll';
  if (free && C.rain <= 0 && d < 10 && m.life < m.lifeMax * 0.85) { capBegin(m, C, { kind: 'rain', t: 0 }); return false; }
  if (free && C.cd <= 0 && d > 3 && d < 12 && m.mode.los(m.pos, target.pos)) { capBegin(m, C, { kind: 'roll', t: 0, ph: 'curl' }); return false; }
  return base(m, dt, target, d, slow);
}
function frostSig(m, C, dt, target, d) {
  const s = C.sig, G = m.G; s.t += dt;
  if (s.kind === 'roll') {
    if (s.ph === 'curl') {
      if (s.dx == null) {
        const dx = target.pos.x - m.pos.x, dz = target.pos.z - m.pos.z, L = Math.hypot(dx, dz) || 1;
        s.dx = dx / L; s.dz = dz / L; s.len = Math.min(L + 3.5, 13); s.trav = 0; s.hit = false; m.facing = Math.atan2(s.dx, s.dz);
        tele(G, { shape: 'lane', x: m.pos.x, z: m.pos.z, r: AR.LANE, dir: m.facing, len: s.len + AR.BALL, time: AR.CURL, color: ONSEN_TC.roll });
        m.mode.bossTelegraph?.(AR.CURL); act(m, 'curl'); sfx('daruma_curl', m.pos); sfx('boss_roar', m.pos);
      }
      if (s.t >= AR.CURL) { s.ph = 'roll'; s.t = 0; m.state = 'attack'; act(m, 'roll'); sfx('daruma_roll', m.pos); }
      return false;
    }
    if (s.ph === 'roll') {
      const step = push(m, s.dx, s.dz, AR.SPEED, dt); s.trav += step; if (m.model) m.model.spin = (m.model.spin || 0) + step / AR.BALL;
      if (!s.hit && dist(target.pos.x, target.pos.z, m.pos.x, m.pos.z) < AR.BALL * m.scale + (target.radius || 0.3) + 0.05) { s.hit = true; m.dealTo(target, Math.round(roll(m) * 1.5), 'frost', 2.8); if (target === G.player) chill(m, 2.2, 0.45); G.engine.rig.shake(0.35); sfx('daruma_hit', target.pos); }
      if (Math.random() < 0.9) puff(G.vfx.smoke, m.pos.x - s.dx * 0.8, m.pos.y + 0.15, m.pos.z - s.dz * 0.8, { vx: -s.dx * 2.5, vy: 0.6, vz: -s.dz * 2.5, life: 0.5, size: 0.55, size1: 1.1, color: '#f4f8ff', alpha: 0.75, alpha1: 0, drag: 2.5 });
      if (s.trav >= s.len || step < AR.SPEED * dt * 0.3 || s.t > 2) { s.ph = 'dizzy'; s.t = 0; act(m, 'dizzy'); m.emote?.('sweat', AR.DIZZY); G.vfx.dustRing(m.pos, 2.4, 16); }
      return true;
    }
    if (s.ph === 'dizzy') { if (s.t >= AR.DIZZY) capEnd(m, C, rand(6.5, 8.5)); return false; }
  }
  if (s.kind === 'rain') {
    if (!s.go) {
      s.go = true; act(m, 'slamWind'); m.mode.bossTelegraph?.(IR.WIND); sfx('daruma_slam_wind', m.pos);
      const P = target.pos, a0 = rand(0, TAU); s.spots = [[P.x, P.z]];
      for (let i = 1; i < IR.N; i++) { const a = a0 + i * 2.4, r = 1.6 + (i % 3) * 0.9; s.spots.push([P.x + Math.cos(a) * r, P.z + Math.sin(a) * r]); }
      s.i = 0;
    }
    if (s.t >= IR.WIND && s.i < IR.N && s.t >= IR.WIND + s.i * IR.GAP) {
      const [x, z] = s.spots[s.i++];
      if (m.world.walkable(x, z)) icicleDrop(m, x, z, { r: IR.R, time: IR.TIME, raw: Math.max(1, Math.round(roll(m) * 0.9)), scale: 1.25 });
      if (s.i === 1) act(m, 'slam');
    }
    if (s.t >= IR.WIND + IR.N * IR.GAP + IR.TIME + IR.REST) capEnd(m, C, Math.max(C.cd, 2), () => { C.rain = rand(8, 10); });
    return false;
  }
  capEnd(m, C, 3); return false;
}

const AI = { captainGaleclaw: galeclawAI, captainStrawgrin: strawgrinAI, captainBrineclaw: brineclawAI, captainFrostbelly: frostbellyAI };

// ------------------------------------------------------------------ registration
const defs = {};
for (const [id, c] of Object.entries(CAPTAINS)) {
  const b = MONSTERS[c.base]; if (!b) continue;
  const variants = c.look ? [...(b.variants || [{}]), c.look] : b.variants; // (a captain-only look on its base's builder; the base's own list stays as it is)
  if (c.look) c.variant = variants.length - 1;
  defs[id] = { ...b, variants, baseId: c.base, name: c.name, boss: true, captain: true, subtitle: c.subtitle, scale: c.scale, radius: c.radius, vr: c.vr, life: c.life, ai: AI[id] || b.ai, summon: null };
  KIND_MAP[id] = KIND_MAP[c.base] || c.base;
}
registerMonsters(defs, {});
export const captainIds = () => Object.keys(defs);
void playerIn;
