// Stella's pack (docs/STELLA.md §5): who her heals and shields can reach, who needs them most, and Hinata the little sun.
//
//  - stellaAllies(G, pos, r): the bodies a heal can land on within r of pos: her (the hero played), Shadow (awake),
//    Hinata / Hikari, and (once co-op exists: docs/MULTIPLAYER.md) every hero body and their summons. Nothing in her kit
//    reads G.player for "the ally": it goes through these records. A record: { e (the entity: G.player, G.companion, a
//    little sun), kind ('hero' | 'shadow' | 'sun'), pos, life(), lifeMax(), heal(n) → healed, h (its height) }.
//  - neediest(G, list, o): the one who needs it most (§5.1): the lowest life fraction after shells, × 0.85 if hit in the
//    last 1.5 s, × 0.7 under 35%; a little sun counts only when no hero or Shadow is under 95%. o.full (0..1): nobody
//    under it → null (Kind Light's fallback to a foe). o.shell(e): the shell on e.
//  - LittleSun: Hinata (and Hikari, Twin Suns): a team-'ally' combat entity at her shoulder: sunbolts at the nearest foe,
//    a warm pulse that mends the pack, her own life; foes leave her be unless she has hit them lately (tauntFor). Looks:
//    gfx/stellaFx.js hinata(); she fades where she'd cover the hero (coversHero, as the Shih Tzu's summons).
import * as THREE from 'three';
import { Events } from '../core/events.js';
import { dist, clamp } from '../core/util.js';
import { stlFx } from '../gfx/stellaFx.js';
import { coversHero } from './shihtzuAllies.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3();
const sfx = (n, o) => Events.emit('sfx', n, o);
const isFoe = e => e.alive && e.team === 'enemy' && !e.breakable;

/** the hero played as a body record (the one object reused: callers read it at once) */
function heroBody(G) {
  const P = G.player; if (!P || G.playerDead) return null;
  const B = G._stlHeroBody ||= { kind: 'hero', e: null, pos: null, h: 1.2, life: () => G.actions?.life?.() ?? 0, lifeMax: () => G.derived?.lifeMax || 1, heal: n => G.actions?.heal?.(n) || 0 };
  B.e = P; B.pos = P.pos; return B;
}
function shadowBody(G) {
  const S = G.companion; if (!S || !S.pos || S.fainted > 0 || S.world !== G.world) return null;
  const B = G._stlShadowBody ||= { kind: 'shadow', e: null, pos: null, h: 0.6, life: () => G.companion?.life ?? 0, lifeMax: () => G.companion?.lifeMax || 1, heal: n => { const c = G.companion; if (!c || c.fainted > 0) return 0; const b = c.life; c.heal(n); return c.life - b; } };
  B.e = S; B.pos = S.pos; return B;
}
/** couch co-op (docs/COOP.md): another player's hero as a body record (their life, read and healed as them) */
function coopBody(G, s) {
  const C = G.coop, P = C.bodyOf(s); if (!P || C.isDown(s)) return null;
  const R = (G._stlCoop ||= {})[s.n] ||= { kind: 'hero', e: null, pos: null, h: 1.2, s: null,
    life: () => C.with(R.s, () => G.actions?.life?.() ?? 0), lifeMax: () => C.with(R.s, () => G.derived?.lifeMax || 1), heal: n => C.with(R.s, () => G.actions?.heal?.(n) || 0) };
  R.s = s; R.e = P; R.pos = P.pos; return R;
}
/** a body record for any entity of hers (a little sun: its own life) */
export function bodyOf(G, e) {
  if (!e) return null;
  if (e === G.player) return heroBody(G);
  if (e._coopSlot && G.coop?.active) return coopBody(G, e._coopSlot);
  if (e === G.companion) return shadowBody(G);
  if (e.stlBody) return e.alive ? e.stlBody : null;
  return null;
}
/** the bodies within r of pos (her own first, then Shadow, then her little suns) → a reused array */
export function stellaAllies(G, pos, r = 99) {
  const out = G._stlAllies ||= []; out.length = 0;
  const near = b => b && (!pos || dist(b.pos.x, b.pos.z, pos.x, pos.z) <= r + 0.3);
  const h = heroBody(G); if (near(h)) out.push(h);
  const s = shadowBody(G); if (near(s)) out.push(s);
  for (const x of G.skills?.stlSuns || []) if (x.alive && near(x.stlBody)) out.push(x.stlBody);
  if (G.coop?.active) for (const s of G.coop.slots) { const P = G.coop.bodyOf(s); if (P && P !== G.player) { const b = coopBody(G, s); if (near(b)) out.push(b); } } // (couch co-op: the other players' heroes, docs/COOP.md)
  return out;
}
/** the life fraction a body counts at (its shell counted in) */
export function fracOf(b, shell = 0) { const m = b.lifeMax(); return m > 0 ? clamp((b.life() + shell) / m, 0, 2) : 1; }
/** who needs it most (see the header) → a body record or null */
export function neediest(G, list, { full = 1.01, shell = () => 0, now = G.engine?.time || 0, skip = null } = {}) {
  let best = null, bs = Infinity, anyLow = false;
  for (const b of list) if (b.kind !== 'sun' && b !== skip && fracOf(b, shell(b.e)) < 0.95) anyLow = true;
  for (const b of list) {
    if (b === skip) continue;
    if (b.kind === 'sun' && anyLow) continue;
    const f = fracOf(b, shell(b.e));
    if (f >= full) continue;
    let s = f;
    if (now - (b.e._stlHitT ?? -9) < 1.5) s *= 0.85;
    if (f < 0.35) s *= 0.7;
    if (b.kind === 'sun') s += 0.05; // (ties: the hero and Shadow first)
    if (s < bs) { bs = s; best = b; }
  }
  return best;
}

// ================================================================== Hinata, the little sun (Little Sun · the Corona)
export class LittleSun {
  /** R: Little Sun's runtime (params: duration, every, dmgPct, range, healPct, healEvery, healR, lifePct, burnDur; a
   *  charged one's size, Sunny Spell and Twin Suns ride on o); i: 0 Hinata, 1 Hikari */
  constructor(G, runner, R, i = 0, o = {}) {
    this.G = G; this.runner = runner; this.team = 'ally'; this.alive = true; this.radius = 0.25; this.height = 0.5; this.res = { fire: 75 }; this.status = {}; this.noBody = true; // (she floats: monsters aren't pushed off her: monster.separate)
    this.i = i; this.pos = new THREE.Vector3(); this.t = 0; this.boltCd = 0.5 + i * 0.45; this.pulseCd = 1.2 + i * 0.6; this.hitBy = new Map();
    this.fx = stlFx(G); this.h = this.fx.hinata({ size: o.size || 1, twin: i === 1 });
    this.stlBody = { kind: 'sun', e: this, pos: this.pos, h: 0.5, life: () => this.life, lifeMax: () => this.lifeMax, heal: n => { const b = this.life; this.heal(n); return this.life - b; } };
    this.refresh(R, o);
    this.place(1);
    G.combat?.add?.(this);
    this.fx.motes(this.pos, 8, { r: 0.3, rise: 1 });
    sfx('stl_hinata', { pos: this.pos, pitch: i ? 1.15 : 1 });
  }
  get name() { return this.i ? 'Hikari' : 'Hinata'; }
  refresh(R, o = {}) {
    const p = R.params; this.p = p; this.o = o; this.t = 0;
    this.lifeMax = Math.max(1, Math.round((this.G.derived?.lifeMax || 100) * p.lifePct / 100)); this.life = this.lifeMax;
  }
  /** where she floats: at Stella's shoulder (Hinata the left, Hikari the right), bobbing */
  place(k) {
    const P = this.G.player; if (!P) return;
    const side = this.i ? -1 : 1, f = P.facing, sx = Math.cos(f) * side, sz = -Math.sin(f) * side; // (her left: +x in her frame)
    const bx = P.pos.x + sx * 0.62 - Math.sin(f) * 0.25, bz = P.pos.z + sz * 0.62 - Math.cos(f) * 0.25, by = P.pos.y + 1.55 + Math.sin(this.t * 2.2 + this.i) * 0.08;
    if (k >= 1) this.pos.set(bx, by, bz); else { this.pos.x += (bx - this.pos.x) * k; this.pos.y += (by - this.pos.y) * k; this.pos.z += (bz - this.pos.z) * k; }
  }
  /** foes leave her be unless she has hit them in the last 3 s (monster.pickTarget subtracts this from her distance) */
  tauntFor(m) { const t = this.hitBy.get(m); return t != null && this.G.engine.time - t < 3 ? 0 : -99; }
  takeDamage(dmg) {
    if (!this.alive) return;
    dmg = this.G.skills?.stlGuardAlly ? this.G.skills.stlGuardAlly(this, dmg) : dmg;
    if (!(dmg > 0)) return;
    this.life -= dmg; this.h.hurt();
    if (this.life <= 0) this.expire();
  }
  heal(n) { if (this.alive) this.life = Math.min(this.lifeMax, this.life + n); }
  update(dt) {
    if (!this.alive) return;
    const G = this.G, P = G.player, p = this.p, S = this.runner;
    if (!P || G.playerDead) return;
    this.t += dt;
    if (this.t >= p.duration) return this.expire();
    this.place(Math.min(1, dt * 8));
    // fades where she'd cover the hero on screen
    const cov = coversHero(G, this.pos, 0.35, 0.5);
    this.h.set(this.pos, this.t, this.t - (this._boltT ?? -9) < 0.25 ? 1 : 0, 1 - 0.65 * cov);
    // the sunbolts: the nearest foe within range of her (weighted toward Stella's side)
    if ((this.boltCd -= dt) <= 0) {
      let best = null, bd = p.range;
      G.combat.inRadius(this.pos.x, this.pos.z, p.range, 'ally', (e, d) => { if (!isFoe(e)) return; const s = d + dist(e.pos.x, e.pos.z, P.pos.x, P.pos.z) * 0.25; if (s < bd) { bd = s; best = e; } });
      if (best) {
        this.boltCd = p.every; this._boltT = G.engine.time;
        const to = _w.set(best.pos.x, best.pos.y + (best.height || 1) * 0.55, best.pos.z), e = best;
        this.h.bolt(this.pos, to);
        sfx('stl_hinata', { pos: this.pos, pitch: 1.25 + Math.random() * 0.15, vol: 0.45 });
        const T = Math.max(0.08, this.pos.distanceTo(to) / 18);
        const share = this.i === 1 ? (this.o.twin?.share ?? 50) / 100 : 1; // (Twin Suns: Hikari's at 50%)
        S.after?.(T, () => { if (!e.alive) return; this.hitBy.set(e, G.engine.time); S.stlHit(e, { dmgPct: p.dmgPct * share, tree: 'flare', from: this.pos, source: 'ally', burnPct: p.dmgPct * share * 0.4, burnDur: p.burnDur }); }); // (her sunbolts sunburn: 40% of the bolt a second)
      } else this.boltCd = 0.25;
    }
    // the warm pulse: the pack within healR mends a little
    if ((this.pulseCd -= dt) <= 0) {
      const every = this.o.sunny ? this.o.sunny.every : p.healEvery, pct = this.o.sunny ? this.o.sunny.heal * (G.derived?.healMul || 1) : p.healPct;
      this.pulseCd = every;
      this.h.pulse(p.healR);
      for (const b of stellaAllies(G, this.pos, p.healR)) S.stlHeal(b, b.lifeMax() * pct / 100, { quiet: true, src: 'pulse' });
    }
  }
  expire(silent = false) {
    if (!this.alive) return;
    this.alive = false; this.life = 0;
    this.G.combat?.remove?.(this);
    this.h.end();
    if (!silent) sfx('stl_hinata', { pos: this.pos, pitch: 0.8, vol: 0.4 });
  }
}
