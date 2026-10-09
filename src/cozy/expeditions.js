// The expedition core (docs/COZY.md §4.2–§4.9; ROADMAP CZ-2). Pure (no three.js, no DOM): node-tested in
// tools/test-rpg.mjs "COZY". The runtime (cozy/expeditionRun.js) owns the clock ticks, the supplies it spends through
// the actions, the world effects and the UI; everything that decides is here.
//
//   heroPower / crewPower       10 × level × (1 + 0.02 × gear points); fed (every member's lunch tier 2+) +10%,
//                               heart potions +3% each (up to 3). Hires (phase D) plug into memberInfo.
//   chance / oddsOf             r = crew ÷ need: < 0.6 Too risky (can't send) · Risky · ≥ 0.85 Good odds · ≥ 1.1 Sure
//                               thing; p = clamp((r − 0.5) / 0.6). An errand with packed lunches is a sure thing.
//   canSend                     the crew (1–4, rested, not away, not the hero being played), the gates, the supplies,
//                               the odds → { ok, why, … }
//   resolve                     success / partial (a failed roll at r ≥ 0.75) / setback (below)
//   rollLoot / xpFor            the rewards (COZY §4.6): full, half on a partial or "You beat us to it!", a third on a
//                               setback; XP full except a setback (half), scaled by the hero's level like kills are
//   startExpedition / finishExpedition   the pure state changes (the active list, the report, tired, done, progress)
import { PANTRY } from '../life/pantry.js';
import { CLASSES } from '../rpg/classes.js';
import { cozyOf, expOf, parseMember, memberAway, tiredLeft } from './state.js';
import { killXp, objectivePower, campsStanding } from './objectives.js';

export const MAX_CREW = 4;
/** below this ratio a crew can't be sent */
export const SEND_MIN = 0.6;
/** a failed roll at or above this ratio is a partial success; below, a setback */
export const PARTIAL_MIN = 0.75;
/** the rest after a partial or a setback (world hours) */
export const TIRED_H = 6;
export const ODDS = [
  { key: 'sure', word: 'Sure thing', min: 1.1, color: '#3aa860' },
  { key: 'good', word: 'Good odds', min: 0.85, color: '#5a9ad8' },
  { key: 'risky', word: 'Risky', min: SEND_MIN, color: '#e0952a' },
  { key: 'nope', word: 'Too risky', min: -Infinity, color: '#d85a5a' },
];
/** what each result pays (COZY §4.3, §4.9): loot share, XP share */
export const RESULT_PAY = { success: [1, 1], partial: [0.5, 1], setback: [1 / 3, 0.5], beaten: [0.5, 1], recalled: [0, 0] };

const RARITY_PTS = { normal: 1, magic: 2, rare: 3, unique: 4, set: 4 };
const GEAR_SLOTS = ['weapon', 'weaponAlt', 'hat', 'outfit', 'collar', 'charm1', 'charm2', 'boots', 'paws'];
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const joined = (state, id) => id === 'chewy' || !!state.flags?.[`${id}Joined`];

/** the equipped slots' points: normal 1, magic 2, rare 3, unique or set 4 (at most 36) */
export function gearPoints(equipment) {
  let n = 0;
  for (const k of GEAR_SLOTS) { const it = equipment?.[k]; if (it) n += RARITY_PTS[it.rarity] || 1; }
  return n;
}
/** a hero's crew power: 10 × level × (1 + 0.02 × gear points) */
export function heroPower(state, id) {
  const h = state.heroes?.[id]; if (!h) return 0;
  return 10 * (h.player?.lvl || 1) * (1 + 0.02 * gearPoints(h.equipment));
}
/** a crew member → { key, type, id, name, lvl, power, color } (hires: phase D), or null */
export function memberInfo(state, key) {
  const m = parseMember(key); if (!m) return null;
  if (m.type === 'hero') {
    const h = state.heroes?.[m.id]; if (!h) return null;
    const C = CLASSES[m.id] || {};
    return { key, type: 'hero', id: m.id, name: C.name || m.id, title: C.title || '', color: C.color || '#8fd0ff', lvl: h.player?.lvl || 1, power: heroPower(state, m.id) };
  }
  const H = state.cozy?.guild?.hires?.find?.(x => x.id === m.id); // (phase D: the Guild's roster)
  if (!H) return null;
  return { key, type: 'hire', id: m.id, name: H.name || 'Hire', lvl: H.lvl || 1, cls: H.cls, power: 6 * (H.lvl || 1) * (H.morale || 1) * (1 + 0.05 * (state.cozy.guild.level || 0)) };
}
/** the dishes packed (supplies.meals) → { n, fed: n of tier 2+ } */
export function mealsPacked(meals) {
  let n = 0, fed = 0;
  for (const [id, k] of Object.entries(meals || {})) { const t = PANTRY[id]?.food?.tier || 0; if (PANTRY[id]?.kind !== 'dish' || !(k > 0)) continue; n += k; if (t >= 2) fed += k; }
  return { n, fed };
}
/** The crew's power for an objective → { base, mul, total, fed, potions, parts: [{ key, power }] } */
export function crewPower(state, crew, o, supplies = {}) {
  const parts = crew.map(k => ({ key: k, power: memberInfo(state, k)?.power || 0 }));
  const base = parts.reduce((a, p) => a + p.power, 0);
  const pk = mealsPacked(supplies.meals), fed = crew.length > 0 && pk.fed >= crew.length;
  const potions = Math.max(0, Math.min(3, supplies.potions || 0));
  const mul = 1 + (fed ? 0.1 : 0) + 0.03 * potions; // (a class that suits the objective: +15%, the hires' classes, phase D)
  return { base, mul, total: base * mul, fed, potions, parts };
}
/** the success chance at a ratio r */
export const chance = r => clamp((r - 0.5) / 0.6);
/** the odds at a ratio → { key, word, color, p, r } ('nope': can't send). An errand with a lunch for everyone is a sure
 *  thing once it can be sent at all (COZY §4.7). */
export function oddsOf(r, o = null, lunch = false) {
  if (o?.supplies?.mealSure && lunch && r >= SEND_MIN) return { ...ODDS[0], p: 1, r, lunch: true };
  const O = ODDS.find(x => r >= x.min);
  return { ...O, p: O.key === 'nope' ? 0 : chance(r), r };
}
/** a gate's state → { label, ok, have } (town = { rank, pop, built: { type: n }, guild }; supplies: the packed ones) */
export function gateCheck(g, state, town = {}, crew = [], supplies = {}) {
  const heroes = crew.filter(k => k.startsWith('hero:')).length;
  switch (g.kind) {
    case 'rank': return { label: g.label || `Village rank ${g.n}`, ok: (town.rank || 1) >= g.n, have: `rank ${town.rank || 1} now` };
    case 'pop': return { label: g.label || `${g.n} villagers`, ok: (town.pop || 0) >= g.n, have: `${town.pop || 0} now` };
    case 'built': return { label: g.label || `${g.name || g.type} built`, ok: (town.built?.[g.type] || 0) >= (g.n || 1), have: '' };
    case 'guild': return { label: g.label || (g.n > 1 ? `Adventurers' Guild level ${g.n}` : "The Adventurers' Guild built"), ok: (town.guild || 0) >= g.n, have: town.guild ? `level ${town.guild} now` : 'not built yet' };
    case 'heroes': return { label: g.label || `${g.n} heroes in the crew`, ok: heroes >= g.n, have: `${heroes} now` };
    case 'crew': return { label: g.label || `A crew of ${g.n}`, ok: crew.length >= g.n, have: `${crew.length} now` };
    case 'lunches': { const n = mealsPacked(supplies.meals).n; return { label: g.label || 'Packed lunches', ok: crew.length > 0 && n >= crew.length, have: n ? `${n} packed` : 'none packed' }; }
    case 'any': { const sub = g.any.map(x => gateCheck(x, state, town, crew, supplies)); return { label: g.label, ok: sub.some(s => s.ok), have: sub.map(s => s.have).filter(Boolean).join(', '), any: sub }; }
    default: return { label: g.label || g.kind, ok: true, have: '' };
  }
}
export const gateChecks = (o, state, town, crew, supplies) => (o?.gates || []).map(g => gateCheck(g, state, town, crew, supplies));
/** why a member can't go now ('' if they can): the hero being played, not joined, away, resting */
export function memberWhy(state, key, active = state.activeHero) {
  const m = parseMember(key); if (!m) return 'Unknown';
  if (m.type === 'hero') {
    if (!state.heroes?.[m.id]) return 'Unknown';
    if (!joined(state, m.id)) return 'Not met yet';
    if (m.id === active) return 'Playing now: switch to someone else to send them';
  } else if (!memberInfo(state, key)) return 'Unknown';
  if (memberAway(state, key)) return 'Away on an expedition';
  const t = tiredLeft(state, key); if (t > 0) return `Resting: ${Math.ceil(t)} h`;
  return '';
}
/** the trip's length in world hours (a Scout hire takes 15% off: phase D) */
export const tripHours = (o, crew) => o.hours;
/** lunches the objective needs (per member; 0: optional) */
export const mealsNeeded = (o, crew) => (o?.supplies?.meals || 0) * crew.length;
/** Pick n dishes from the pantry for the lunches: tier 2+ first when there are enough for everyone (fed: +10%), else
 *  the plainest dishes first → { id: n } (short when the pantry is) */
export function pickMeals(pantry, n) {
  const dishes = Object.entries(pantry || {}).filter(([id, k]) => PANTRY[id]?.kind === 'dish' && k > 0).map(([id, k]) => ({ id, k, t: PANTRY[id].food?.tier || 1, v: PANTRY[id].value || 0 }));
  const good = dishes.filter(d => d.t >= 2).sort((a, b) => a.v - b.v), all = dishes.slice().sort((a, b) => a.t - b.t || a.v - b.v);
  const src = good.reduce((a, d) => a + d.k, 0) >= n ? good : all, out = {};
  let left = n;
  for (const d of src) { if (left <= 0) break; const take = Math.min(d.k, left); out[d.id] = take; left -= take; }
  return out;
}
/** Can this crew go? → { ok, why, need, power, r, odds, checks, meals: { need, have } } */
export function canSend(state, o, crew = [], supplies = {}, town = {}, active = state.activeHero) {
  const need = objectivePower(state, o), P = crewPower(state, crew, o, supplies), r = need > 0 ? P.total / need : 0;
  const pk = mealsPacked(supplies.meals), lunch = crew.length > 0 && pk.n >= crew.length;
  const odds = oddsOf(r, o, lunch), checks = gateChecks(o, state, town, crew, supplies), mNeed = mealsNeeded(o, crew);
  const out = { ok: false, why: '', need, power: P.total, crewPower: P, r, odds, checks, meals: { need: mNeed, have: pk.n } };
  if (!o) { out.why = 'Nothing picked'; return out; }
  if (!crew.length) { out.why = 'Pick a crew'; return out; }
  if (crew.length > MAX_CREW) { out.why = `At most ${MAX_CREW} in a crew`; return out; }
  for (const k of crew) { const w = memberWhy(state, k, active); if (w) { out.why = `${memberInfo(state, k)?.name || k}: ${w}`; return out; } }
  const bad = checks.find(c => !c.ok); if (bad) { out.why = `Needs: ${bad.label}`; return out; }
  if (pk.n < mNeed) { out.why = `Pack ${mNeed} lunch${mNeed > 1 ? 'es' : ''} (one each): cook a few dishes`; return out; }
  if (odds.key === 'nope') { out.why = "They'd never make it. A stronger crew, or a few more levels?"; return out; }
  out.ok = true;
  return out;
}
/** The roll → { result: 'success' | 'partial' | 'setback', p, roll } */
export function resolve(r, rng, o = null, lunch = false) {
  const p = oddsOf(r, o, lunch).p, roll = rng();
  return { result: roll < p ? 'success' : r >= PARTIAL_MIN ? 'partial' : 'setback', p, roll };
}
/** what a partial keeps (COZY §4.3): a siege breaks round(3r) − 1 camps (at least 1, never the last stand: the captain
 *  stays); a dungeon gets to floor 2; a find finds the trail → { camps? , floor?, trail? } */
export function partialProgress(state, o, r) {
  if (o.kind === 'siege') { const s = campsStanding(state, o.binds.village); return { camps: Math.max(0, Math.min(s, Math.max(1, Math.round(3 * r) - 1))) }; }
  if (o.kind === 'dungeon') return { floor: 2 };
  if (o.tags?.includes('find') || o.tags?.includes('rescue')) return { trail: true };
  return {};
}
const between = (rng, [a, b]) => a + Math.floor(rng() * (b - a + 1));
function weighted(pool, rng) {
  const e = Object.entries(pool), tot = e.reduce((a, [, w]) => a + w, 0);
  let x = rng() * tot;
  for (const [k, w] of e) { x -= w; if (x <= 0) return k; }
  return e[e.length - 1][0];
}
/** The loot for a result → { coins, mats: { k: n }, pantry: { id: n }, items: [{ rarity, ilvl }], find: bool }
 *  (items are rolled into real items by the runtime: rpg/items.js generateItem) */
export function rollLoot(o, result, rng, frac = 1) {
  const share = (RESULT_PAY[result] || RESULT_PAY.success)[0] * frac, R = o.rewards || {}, out = { coins: 0, mats: {}, pantry: {}, items: [], find: false };
  if (share <= 0) return out;
  out.coins = Math.round(between(rng, R.coins || [0, 0]) * share);
  const nm = Math.max(1, Math.round(between(rng, R.mats?.n || [0, 0]) * share));
  if (R.mats?.pool) for (let i = 0; i < nm; i++) { const k = weighted(R.mats.pool, rng); out.mats[k] = (out.mats[k] || 0) + 1; }
  if (R.pantry?.pool?.length) { const n = Math.round(between(rng, R.pantry.n) * Math.max(share, 0.5)); for (let i = 0; i < n; i++) { const k = R.pantry.pool[Math.floor(rng() * R.pantry.pool.length)]; out.pantry[k] = (out.pantry[k] || 0) + 1; } }
  // items: the guaranteed ones on a full result (half on a partial: the better one kept), the chances scaled
  const items = R.items || [];
  if (share >= 0.99) for (const r of items) out.items.push({ rarity: r, ilvl: o.level });
  else if (share >= 0.49 && items.length) out.items.push({ rarity: items[items.length - 1], ilvl: o.level });
  for (const [rar, c] of Object.entries(R.itemChance || {})) if (rng() < c * share) out.items.push({ rarity: rar, ilvl: o.level });
  if (R.find && rng() < R.find * share) out.find = true;
  return out;
}
/** XP for a hero at level `lvl` (COZY §4.6): worth `kills` kills of the objective's level, scaled like a kill is for a
 *  hero far above it (rpg/stats.js xpForKill), times the result's share and the part of the objective that was left */
export function xpFor(o, lvl, result, frac = 1) {
  const pay = (RESULT_PAY[result] || RESULT_PAY.success)[1]; if (!(pay > 0)) return 0;
  const diff = lvl - o.level;
  let m = 1;
  if (diff > 5) m = Math.max(0.05, 1 - (diff - 5) * 0.12);
  return Math.max(1, Math.round((o.rewards?.kills || 0) * killXp(o.level) * m * pay * frac));
}

// ------------------------------------------------------------------ the crew's words (a line each in the report)
const HERO_LINES = {
  chewy: { success: ['We did it! I only fell in the river once.', 'Shadow would have loved it. I brought him a stick.'], partial: ['We got most of the way! The rest is shy.', "I'll go back. I'm a very good boy at going back."], setback: ['We came back muddy. Very muddy. Happy, though!', 'Next time I bring more snacks.'], beaten: ['You beat us to it! …Can we still have the snacks?'] },
  moka: { success: ['I read about these yokai. They had not read about me.', 'Splendid! I took notes. Twelve pages.'], partial: ['A partial success is still a success. I checked.', 'We found the way. Next time we take it.'], setback: ['We came home soggy. I blame the weather spells. Mine.', 'A setback! Very educational.'], beaten: ['You beat us to it! I had a whole speech ready.'] },
  poe: { success: ['I was very stealthy. Mostly.', 'Nobody saw us. *snort* …Except that one crow.'], partial: ['We shadowed them halfway. Shadowing takes patience.', 'I left a decoy. It was a log. It is still there.'], setback: ['A ninja knows when to retreat. Quickly. In the mud.', '*ACHOO* …They heard that one.'], beaten: ['You beat us to it! A true shinobi admits it. Quietly.'] },
  shihtzu: { success: ['The gloom has lifted. I lifted it. Solemnly.', 'Victory tastes of rice crackers.'], partial: ['The darkness retreats… partway. It will retreat more.', 'My flail squeaked bravely.'], setback: ['We fell back. The night was long, and also damp.', 'The ghost pups say we did our best.'], beaten: ['You beat us to it. My flail is a little disappointed.'] },
  golden: { success: ['Mission complete! I guarded EVERYTHING.', 'We won! Also I found a ball. Two victories.'], partial: ['We charged halfway! The other half is next.', 'A dragoon never gives up. A dragoon goes home for lunch first.'], setback: ['We got a bit lost. The ball went that way.', 'Muddy paws, brave hearts!'], beaten: ['You beat us to it! Good job! …Was there a ball?'] },
};
/** one line per crew member for the report, in their voice */
export function crewLines(state, crew, result, rng) {
  return crew.map(k => {
    const m = memberInfo(state, k), L = HERO_LINES[m?.id]?.[result] || HERO_LINES[m?.id]?.success || ['Back home safe!'];
    return { who: k, name: m?.name || '', text: L[Math.floor(rng() * L.length)] };
  });
}

// ------------------------------------------------------------------ the pure state changes
/** Put a crew on the road (the supplies already spent by the caller) → the expedition record */
export function startExpedition(state, o, crew, supplies, { r, need, power, odds, p, lunch = false, hours = o.hours, seed = 1, frac = 1 }) {
  const E = expOf(state), C = cozyOf(state);
  const e = {
    uid: `x${E.seq++}`, obj: o.id, name: o.name, kind: o.kind, area: o.place?.area || '', crew: [...crew],
    start: C.clock.h, hours, power, need, r, odds, p, lunch, frac, supplies: { meals: { ...(supplies.meals || {}) }, potions: supplies.potions || 0, coins: supplies.coins || 0 },
    hold: false, seed: seed >>> 0,
  };
  E.active.push(e);
  if (o.kind === 'errand') { const d = o.day; if (E.errands.day !== d) E.errands = { day: d, taken: [] }; if (!E.errands.taken.includes(o.id)) E.errands.taken.push(o.id); }
  return e;
}
/** world hours left on a trip (≤ 0: it's done) */
export const hoursLeft = (state, e) => e.start + e.hours - cozyOf(state).clock.h;
/** Bring a crew home (pure): the active list, done / progress / tired, and the report →
 *  out = { result, loot, xp: { key: n }, levels: { key: [from, to] }, lines, items, note, progress } → the report */
export function finishExpedition(state, e, o, out) {
  const E = expOf(state), C = cozyOf(state);
  const i = E.active.indexOf(e); if (i >= 0) E.active.splice(i, 1);
  if (out.result === 'success') E.done[e.obj] = (E.done[e.obj] || 0) + 1;
  if (out.result === 'success' && E.progress[e.obj]) delete E.progress[e.obj];
  if (out.result === 'partial' && out.progress && Object.keys(out.progress).length && o?.kind !== 'siege') E.progress[e.obj] = { ...(E.progress[e.obj] || {}), ...out.progress }; // (a siege's progress is the zone's own camps)
  if (out.result === 'partial' || out.result === 'setback') for (const k of e.crew) E.tired[k] = C.clock.h + TIRED_H;
  const rep = {
    uid: e.uid, obj: e.obj, name: e.name, kind: e.kind, area: e.area, place: o?.place || null, story: !!o?.story,
    result: out.result, crew: [...e.crew], loot: out.loot || {}, xp: out.xp || {}, levels: out.levels || {}, lines: out.lines || [],
    items: out.items || [], note: out.note || '', progress: out.progress || null, read: false, at: C.clock.h, hours: e.hours,
  };
  E.reports.push(rep);
  if (E.reports.length > 24) E.reports.splice(0, E.reports.length - 24);
  return rep;
}
/** Expeditions saved mid-trip that can't go on (COZY §9): the objective gone, a hero not joined, the hero being played
 *  → [{ e, why }] (the runtime brings them home as a partial with the supplies refunded) */
export function brokenExpeditions(state, lookup) {
  const out = [];
  for (const e of expOf(state).active) {
    const o = lookup(e.obj);
    let why = '';
    if (!o) why = 'The job they were on is gone';
    for (const k of e.crew) {
      const m = parseMember(k);
      if (!why && m?.type === 'hero' && (!joined(state, m.id) || !state.heroes?.[m.id])) why = `${m.id} isn't in the pack`;
      if (!why && m?.type === 'hero' && m.id === state.activeHero) why = `${CLASSES[m.id]?.name || m.id} was being played`;
      if (!why && m?.type === 'hire' && !memberInfo(state, k)) why = 'A hire left the roster';
    }
    if (why) out.push({ e, why });
  }
  return out;
}
