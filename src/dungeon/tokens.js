// Attack tokens and the alert bubbles (docs/ZONES.md §5.1, "Readability in big packs"; ROADMAP Z-E2). Big packs (a
// zone's 8–16, a Swarming tier run's 20–30) must stay readable: a wall of crossing lane telegraphs, or a cloud of "!"
// bubbles, says nothing. Nothing is hidden here: every telegraph on screen is still a real attack. Instead monsters wait
// their turn to START one.
//  - A monster's attack cooldown (m.cd, which every AI — the Burrow's and the region kit's — checks before it winds up)
//    runs out → beyond melee reach of the hero it needs an attack token first: one pack's tokens may weigh at most packCap
//    (2, 3 from T3 and in Spirit runs) and one kind's near the hero kindCap (4, 5 from T3). A token weighs 1, or more for
//    an attack that draws several telegraphs (WEIGHT: the kakashi's crows fly 2–3 lanes, the sazae-oni's spines a star of 8);
//    a heavy one may always go alone.
//    No token: its cooldown is pushed back a random 0.25–0.65 s (it keeps moving and kiting) and it asks again, so the
//    volleys come in staggered waves. Close up (melee reach) no token is needed.
//  - A token is held through the wind-up and the attack (m.state 'windup' / 'attack') and goes back when the AI resets
//    its cooldown; one held 1.4 s without attacking (no sight line) goes back too. Death, a boss's vanish and dispose
//    return it.
//  - The "!" bubble: one per pack (2.5 s), and at most 3 a second across the floor; the rest wake silently.
// Bosses and their adds are never gated.
import { rand } from '../core/util.js';

export const TOK = { meleeR: 2.8, nearR: 20, hold: 1.4, wait: [0.25, 0.65], bubblePack: 2.5, bubbleRate: 3 };
const ledger = mode => (mode._tokens ||= { packs: new Map(), kinds: new Map(), bubbles: new Map(), recent: [], granted: 0, denied: 0 });
const packKey = m => m._pack || m.leader || m;
/** attacks that draw several telegraphs at once count for more */
export const WEIGHT = { kakashi: 2, sazaeOni: 3 };
const weightOf = m => WEIGHT[m.id] || 1;
const sum = (set, P, r2) => { let n = 0; if (set) for (const o of set) { if (P) { const ox = o.pos.x - P.pos.x, oz = o.pos.z - P.pos.z; if (ox * ox + oz * oz > r2) continue; } n += weightOf(o); } return n; };
/** how many members of one pack may hold an attack token at once */
export const packCap = mode => (mode?.spirit > 0 || (mode?.tier || 0) >= 3 ? 3 : 2);
/** how many monsters of one kind near the hero may hold one at once */
export const kindCap = mode => (mode?.spirit > 0 || (mode?.tier || 0) >= 3 ? 5 : 4);

/** Monster.update, right after its cooldown ticks (before its AI decides): grant, keep or return its attack token */
export function attackToken(m, dt) {
  const L = ledger(m.mode);
  if (m._tok) {
    if (m.state === 'windup' || m.state === 'attack') { m._tokT = 0; return; }
    if (m.cd > 0.05) { releaseToken(m); return; }
    if ((m._tokT += dt) > TOK.hold) { releaseToken(m); m.cd = rand(TOK.wait[0], TOK.wait[1]); } // (it couldn't use it: a pack-mate's turn)
    return;
  }
  if (m.cd > 0 || m.def?.boss || m.bossAdd) return;
  const P = m.G.player; if (!P) return;
  const dx = m.pos.x - P.pos.x, dz = m.pos.z - P.pos.z, d2 = dx * dx + dz * dz;
  if (d2 < TOK.meleeR * TOK.meleeR || d2 > TOK.nearR * TOK.nearR) return; // (close: melee, no token; far: not in this fight)
  const pk = packKey(m), held = L.packs.get(pk), ks = L.kinds.get(m.id);
  const w = weightOf(m), inPack = sum(held, null, 0), near = sum(ks, P, TOK.nearR * TOK.nearR);
  if (inPack + w > Math.max(packCap(m.mode), w) || near + w > Math.max(kindCap(m.mode), w)) { m.cd = rand(TOK.wait[0], TOK.wait[1]); L.denied++; return; }
  m._tok = true; m._tokT = 0; L.granted++;
  if (held) held.add(m); else L.packs.set(pk, new Set([m]));
  if (ks) ks.add(m); else L.kinds.set(m.id, new Set([m]));
}
/** give a token back (also on death / vanish / dispose) */
export function releaseToken(m) {
  if (!m._tok) return;
  m._tok = false;
  const L = m.mode?._tokens; if (!L) return;
  const pk = packKey(m), ps = L.packs.get(pk); if (ps) { ps.delete(m); if (!ps.size) L.packs.delete(pk); }
  L.kinds.get(m.id)?.delete(m);
}
/** may this monster show its "!" as it wakes? one per pack in 2.5 s, at most 3 a second across the floor */
export function alertBubble(m) {
  if (m.def?.boss) return true;
  const L = ledger(m.mode), now = performance.now(), pk = packKey(m), last = L.bubbles.get(pk);
  if (last != null && now - last < TOK.bubblePack * 1000) return false;
  while (L.recent.length && now - L.recent[0] > 1000) L.recent.shift();
  if (L.recent.length >= TOK.bubbleRate) return false;
  L.bubbles.set(pk, now); L.recent.push(now);
  return true;
}
/** QA: who holds tokens now → { packs: [sizes], kinds: { id: n }, granted, denied } */
export function tokenStats(mode) {
  const L = mode?._tokens; if (!L) return { packs: [], kinds: {}, granted: 0, denied: 0 };
  return { packs: [...L.packs.values()].map(s => s.size), kinds: Object.fromEntries([...L.kinds].map(([k, s]) => [k, s.size])), granted: L.granted, denied: L.denied };
}
