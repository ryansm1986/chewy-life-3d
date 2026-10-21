// Simple stats (docs/STATS.md, ROADMAP UX-3): one Power number for a hero and for each piece of gear, the friendly
// summary the Character screen shows (Attack, Life, Zoom, Defense, Speed, Luck), and Shadow's auto points.
//
//   heroPower(derived)                  → the hero's Power: how hard they hit × how much they can take (a sqrt, so it
//                                         grows like one of them), with a little for Zoom, speed and luck
//   itemPower(item, state)              → { power, delta, verdict, slot, hero, other, locked } for the hero who'd wear it:
//                                         power = what it adds (Power with it on − Power with that slot empty), delta =
//                                         Power with it on − Power with today's piece on; verdict 'better' | 'worse' |
//                                         'same' | 'empty' (nothing on there: any piece helps). Cached per hero state.
//   isUpgrade(item, state)              → the bag's green arrow: better, and wearable by the hero being played right now
//   statSummary(derived)                → the six friendly numbers
//   AUTO_PLAN / autoPlan / spendAuto    → how Shadow spends a hero's points (on by default: P.autoStats !== false)
//   attrFx(cls, k)                      → what an attribute does for that hero, in plain words
import { computeStats, playerPhysDR } from './stats.js';
import { CLASSES, WEAPON_CLASS } from './classes.js';
import { targetSlot, meetsReq } from './items.js';

const ELEM = ['fireDmg', 'frostDmg', 'zapDmg', 'stinkDmg'];
const RES = ['resFire', 'resFrost', 'resZap', 'resStink'];
const sum = o => { let s = 0; for (const k in o || {}) s += +o[k] || 0; return s; };

/** the average hit, with the elemental adds */
export function avgHit(d) {
  let e = 0;
  for (const k of ELEM) if (d[k]) e += (d[k][0] + d[k][1]) / 2;
  return (d.dmgAvg || ((d.dmgMin || 1) + (d.dmgMax || 3)) / 2) + e;
}

/** A hero's Power from their derived stats. */
export function heroPower(d) {
  if (!d) return 0;
  const lvl = d.lvl || 1, hit = avgHit(d);
  const crit = 1 + Math.min(75, d.crit || 0) / 100 * ((d.critMul || 1.5) - 1);
  const speed = (d.aspd || 1.2) * (1 + ((d.castMul || 1) - 1) * 0.5);
  const skills = 1 + 0.1 * (d.allSkills || 0) + 0.05 * sum(d.treeSkills) + 0.02 * sum(d.skillBonus);
  const offense = hit * crit * speed * skills;
  const phys = playerPhysDR(d.def || 0, lvl);
  let res = 0; for (const k of RES) res += Math.max(0, Math.min(75, d[k] || 0)); res /= 400;
  const taken = (0.65 * (1 - phys) + 0.35 * (1 - res)) * (1 - (d.block || 0) / 100) * (1 - (d.dodge || 0) / 100) * (1 - (d.dmgReduce || 0) / 100);
  const life = (d.lifeMax || 1) + 10 * (d.lifeRegen || 0) + 4 * (d.lifeOnKill || 0) + 3 * (d.thorns || 0) + 20 * hit * speed * (d.lifeSteal || 0) / 100;
  const tough = life / Math.max(0.05, taken);
  const zoom = 1 + 0.12 * Math.log1p(((d.zoomMax || 0) + 8 * (d.zoomRegen || 0) + 20 * hit * speed * (d.zoomSteal || 0) / 100) / (40 + 4.6 * lvl));
  const extra = (1 + Math.max(0, d.moveSpeed || 0) / 300) * (1 + Math.max(0, d.cdr || 0) / 200) * (1 + Math.max(0, (d.shadowDmg || 0) + (d.shadowLife || 0)) / 800)
    * (1 + Math.max(0, (d.mf || 0) + (d.gf || 0) / 2 + 2 * (d.xpBonus || 0)) / 1000);
  return 4 * Math.sqrt(offense * tough) * zoom * extra;
}

// ------------------------------------------------------------------ items
/** the state as hero `id` (their own player and gear; the household is shared) */
function asHero(state, id) {
  if (!id || id === (state.player?.cls || state.activeHero)) return state;
  const h = state.heroes?.[id];
  if (!h || (id !== 'chewy' && !state.flags?.[`${id}Joined`])) return null; // (a hero who hasn't joined yet: just "Moka's weapon")
  return { ...state, player: h.player, equipment: h.equipment, activeHero: id };
}
const heroSig = st => {
  const P = st.player, e = st.equipment || {};
  let s = `${P.cls}|${P.lvl}|${P.stats?.str},${P.stats?.dex},${P.stats?.vit},${P.stats?.ene}|${P.activeWeapon || 0}|${sum(P.skills)}|${P.meal?.buff || ''}${P.meal?.tier || ''}|`;
  for (const k in e) s += e[k] ? e[k].uid + ',' : '-,';
  return s;
};
const CACHE = new Map(), BASE = new Map(), DER = new Map();
const powerOf = (st, equipment, activeWeapon) => heroPower(computeStats({ ...st, player: { ...st.player, activeWeapon }, equipment }));
/** Power with the slot empty and with today's piece, shared by every item for that slot (one computeStats an item after) */
function baseOf(st, sig, slot, aw) {
  const k = `${sig}|${slot}|${aw}`;
  let b = BASE.get(k);
  if (!b) {
    const eq = st.equipment || {}, off = powerOf(st, { ...eq, [slot]: null }, aw);
    b = { off, now: eq[slot] ? powerOf(st, eq, aw) : off };
    if (BASE.size > 300) BASE.clear();
    BASE.set(k, b);
  }
  return b;
}
const derOf = (st, sig) => { let d = DER.get(sig); if (!d) { if (DER.size > 60) DER.clear(); d = computeStats(st); DER.set(sig, d); } return d; };

/** → { power, delta, verdict, slot, hero, other, locked } or null (not gear) */
export function itemPower(it, state) {
  if (!it || it.kind !== 'gear' || !state?.player) return null;
  const own = it.wtype && WEAPON_CLASS[it.wtype];
  const cls = state.player.cls || 'chewy';
  const other = !!own && own !== cls;
  const st = other ? asHero(state, own) : state;
  if (!st) return { power: 0, delta: 0, verdict: 'none', slot: null, hero: own, other: true, locked: null };
  const sig = heroSig(st), key = `${sig}#${it.uid}`;
  const hit = CACHE.get(key);
  if (hit) return hit;
  const slot = targetSlot(it, st);
  const eq = st.equipment || {}, cur = eq[slot] || null;
  // a weapon counts with its own hand active (Chewy's ball hand, while the katana is out)
  const aw = slot === 'weaponAlt' ? 1 : slot === 'weapon' ? 0 : st.player.activeWeapon || 0;
  const B = baseOf(st, sig, slot, aw);
  let r;
  if (cur === it) r = { power: Math.round(B.now - B.off), delta: 0, verdict: 'worn', slot, hero: st.player.cls, other, locked: null };
  else {
    const on = powerOf(st, { ...eq, [slot]: it }, aw), delta = on - B.now, same = Math.abs(delta) < Math.max(1, B.now * 0.005);
    r = { power: Math.round(on - B.off), delta: Math.round(delta), verdict: !cur ? 'empty' : same ? 'same' : delta > 0 ? 'better' : 'worse', slot, hero: st.player.cls, other, vs: cur, locked: lockWhy(it, st, derOf(st, sig)) };
  }
  if (CACHE.size > 800) CACHE.clear();
  CACHE.set(key, r);
  return r;
}
/** what stops this hero wearing it right now, in plain words (or null) */
function lockWhy(it, st, d) {
  if (meetsReq(it, st, d)) return null;
  const r = it.req || {}, P = st.player;
  if ((r.lvl || 1) > (P.lvl || 1)) return `Needs level ${r.lvl}`;
  if (r.str && d.str < r.str) return `Needs ${r.str} Strength`;
  if (r.dex && d.dex < r.dex) return `Needs ${r.dex} Dexterity`;
  if (r.ene && d.ene < r.ene) return `Needs ${r.ene} Energy`;
  return null;
}
/** the bag's green arrow: a better piece the hero being played can put on now */
export function isUpgrade(it, state) {
  const p = itemPower(it, state);
  return !!p && !p.other && !p.locked && (p.verdict === 'better' || p.verdict === 'empty');
}

// ------------------------------------------------------------------ the six friendly numbers
const r1 = v => Math.round((+v || 0) * 10) / 10;
/** → { power, attack, crit, life, lifeRegen, zoom, zoomRegen, defense, hurtLess, speed, run, luck, coins } */
export function statSummary(d) {
  d = d || {};
  return {
    power: Math.round(heroPower(d)),
    attack: Math.round(avgHit(d)), crit: r1(d.crit),
    life: Math.round(d.lifeMax || 0), lifeRegen: r1(d.lifeRegen),
    zoom: Math.round(d.zoomMax || 0), zoomRegen: r1(d.zoomRegen),
    defense: Math.round(d.def || 0), hurtLess: Math.round(playerPhysDR(d.def || 0, d.lvl || 1) * 100),
    speed: r1(d.aspd || 1.2), run: Math.round(d.moveSpeed || 0),
    luck: Math.round(d.mf || 0), coins: Math.round(d.gf || 0),
  };
}

// ------------------------------------------------------------------ Shadow's auto points
/** points per 5 for each hero (Chewy: by the weapon in his main hand, the katana or the ball) */
export const AUTO_PLAN = {
  chewy: w => (w === 'ball' ? { dex: 2, vit: 2, str: 1 } : { str: 2, vit: 2, dex: 1 }),
  moka: { ene: 3, vit: 2 },
  poe: { dex: 2, vit: 2, ene: 1 },
  shihtzu: { str: 2, vit: 2, ene: 1 },
  golden: { str: 2, vit: 2, dex: 1 },
  stella: { ene: 3, vit: 2 },
};
export const autoOn = P => !!P && P.autoStats !== false;
export function autoPlan(cls, equipment) {
  const p = AUTO_PLAN[cls] || AUTO_PLAN.chewy;
  return typeof p === 'function' ? p(equipment?.weapon?.wtype || 'sword') : p;
}
/** the hero's star attribute (the plan's first) */
export const mainStat = (cls, equipment) => Object.keys(autoPlan(cls, equipment))[0];
/** Spend every point the hero has by the plan: each goes where the hero is furthest behind it (so it also evens out
 *  points placed by hand). → { str, dex, vit, ene } gained (empty when there was nothing to spend) */
export function spendAuto(P, equipment) {
  const out = {};
  if (!P?.stats || !(P.statPts > 0)) return out;
  const plan = autoPlan(P.cls || 'chewy', equipment), base = (CLASSES[P.cls] || CLASSES.chewy).base;
  const keys = Object.keys(plan);
  while (P.statPts > 0) {
    let best = keys[0], bv = Infinity;
    for (const k of keys) { const v = (P.stats[k] - base[k]) / plan[k]; if (v < bv - 1e-9) { bv = v; best = k; } }
    P.stats[best]++; P.statPts--; out[best] = (out[best] || 0) + 1;
  }
  return out;
}

// ------------------------------------------------------------------ what each attribute does, per hero
const FX = {
  chewy: { str: 'Katana hits harder', dex: 'Ball hits harder, more big hits', ene: 'More Zoom for skills' },
  moka: { ene: 'Spells hit harder, more Zoom' },
  poe: { dex: 'Fūma hits harder, more big hits', ene: 'Jutsu hit harder, more Zoom' },
  shihtzu: { str: 'Flail hits harder', ene: 'Hexes hit harder, more Zoom' },
  golden: { str: 'Lance hits harder', dex: 'Javelins hit harder, more big hits', ene: 'Whelp Shadow hits harder, more Zoom' },
  stella: { ene: 'Sunlight shines brighter, more Zoom' },
};
const FX_ANY = { str: 'Lets you wear heavy gear', dex: 'A few more big hits', vit: 'More Life', ene: 'More Zoom for skills' };
export const attrFx = (cls, k) => FX[cls]?.[k] || FX_ANY[k] || '';
