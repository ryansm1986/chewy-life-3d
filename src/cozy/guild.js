// The Adventurers' Guild's rules (docs/COZY.md §5, §4.2, §8; ROADMAP CZ-7, CZ-8). Pure (no three.js, no DOM):
// node-tested in tools/test-rpg.mjs "COZY: THE GUILD AND HIRES". The runtime (cozy/guildRun.js) owns the building, Old
// Hachi, the coins it spends through the actions and the UI; everything that decides is here.
//
//   state.cozy.guild = {
//     level,                                    // the Guild building's level (0: not built); synced from the village
//     hires: [{ id, seed, name, cls, lvl, xp, morale, since, owed, unpaid, floor, onBreak, trips, wins, look }],
//     seq,                                      // the next hire id ('h<seq>')
//     cand: { day, list: [{ i, seed, name, cls, lvl, taken }] },  // today's three candidates (a world day each)
//     wages: { day, paid, short, total, banner },   // the world day wages are settled through; the last settle's pay;
//                                                   // back pay owed now; paid ever; paid since the last morning banner
//     met,                                      // talked to Old Hachi once (his first words)
//   }
//
//   Hires (COZY §5.2): generated townsfolk with a class flavour, saved by seed so they look the same forever; a sign-on
//   fee (40 × level), daily wages (4 × level a world day, accrued on the world clock so time away counts), morale
//   0.85–1.15 (a success, a fed trip and a paid day lift it; a setback and an unpaid day drop it; three days at the floor
//   and they ask for a break until paid), leveling from expeditions on the hero curve × 0.8, the roster cap 3 / 6 / 9 and
//   the level cap 10 + 10 × the Guild's level.
//   Classes (COZY §4.2, §5.2): a class that suits the objective adds 15% to the crew (once a crew); a Scout takes 15% off
//   the trip; a Healer turns a setback into a partial; a Porter brings 25% more materials.
import { mulberry32 } from '../core/util.js';
import { xpToNext } from '../rpg/stats.js';

export const GUILD_MAX = 3;
/** the roster cap per Guild level (0: not built) */
export const ROSTER_CAP = [0, 3, 6, 9];
/** the crew's size per Guild level (COZY §4.1: 4, and 5 at Guild level 3) */
export const CREW_CAP = [4, 4, 4, 5];
/** the village rank each Guild level needs (COZY §5.1: built at rank 2; level 2 at rank 3; level 3 at rank 4) */
export const GUILD_RANK = [0, 2, 3, 4];
export const MORALE_MIN = 0.85, MORALE_MAX = 1.15;
/** what moves morale (COZY §5.2) */
export const MORALE = { success: 0.05, fed: 0.03, paid: 0.02, partial: 0, setback: -0.05, unpaid: -0.08 };
/** days at the morale floor before an unpaid hire asks for a break */
export const BREAK_DAYS = 3;
export const SIGN_ON = 40, WAGE = 4;
export const signOnFee = lvl => SIGN_ON * Math.max(1, lvl | 0);
export const wageOf = lvl => WAGE * Math.max(1, lvl | 0);
export const rosterCap = level => ROSTER_CAP[Math.max(0, Math.min(GUILD_MAX, level | 0))];
export const crewCap = level => CREW_CAP[Math.max(0, Math.min(GUILD_MAX, level | 0))];
/** a hire's level cap: 10 + 10 × the Guild's level (20 / 30 / 40) */
export const hireLevelCap = level => 10 + 10 * Math.max(1, Math.min(GUILD_MAX, level | 0));
/** the XP a hire needs for the next level: the hero curve × 0.8 (a gentler curve, COZY §4.6) */
export const hireXpToNext = lvl => Math.round(xpToNext(lvl) * 0.8);
/** a hire's crew power (the same formula expeditions.js memberInfo uses: 6 × level × morale × (1 + 0.05 × Guild level)) */
export const hirePower = (h, level) => 6 * (h?.lvl || 1) * (h?.morale || 1) * (1 + 0.05 * (level || 0));
/** morale → hearts (1–3) on the cards */
export const moraleHearts = m => (m < 0.95 ? 1 : m < 1.05 ? 2 : 3);
export const moraleWord = m => (m < 0.9 ? 'Gloomy' : m < 0.97 ? 'A bit low' : m < 1.04 ? 'Content' : m < 1.1 ? 'Cheerful' : 'In high spirits');

// ------------------------------------------------------------------ the five classes (COZY §5.2)
//   suits: the objective kinds / tags it adds +15% to; perk: its special rule; look: its prop and accent (cozy/hires.js)
export const HIRE_CLASSES = {
  guard: { name: 'Guard', jp: '守', color: '#5a8ad8', suits: ['siege'], suitWord: 'sieges', perk: null, perkWord: '', look: 'A pot-lid shield and a headband',
    lines: ['Nobody gets past the pot lid.', 'I stood very still and looked very large. It worked!', 'Walls are just slow guards.'] },
  archer: { name: 'Archer', jp: '弓', color: '#5aa860', suits: ['dungeon'], suitWord: 'dungeon clears', perk: null, perkWord: '', look: 'A toy bow and a quiver',
    lines: ['Every arrow came home. Some of them with snacks.', 'I hit the lantern from forty paces. On purpose.', 'Deep places need sharp eyes.'] },
  scout: { name: 'Scout', jp: '斥', color: '#e0952a', suits: ['find', 'errand'], suitWord: 'finds and errands', perk: 'fast', perkWord: 'The crew travels 15% faster', look: 'A bandana and a spyglass',
    lines: ['I found a shortcut. And then a shorter shortcut.', 'Spyglass says: home by dinner.', 'I saw it before it saw me. Mostly.'] },
  healer: { name: 'Healer', jp: '癒', color: '#e07a98', suits: ['rescue'], suitWord: 'rescues', perk: 'soft', perkWord: 'A setback comes back as a partial instead', look: 'A satchel with a cross-stitched paw',
    lines: ['Bandages for everyone! Even the ones who were fine.', 'Nobody scraped a paw. I checked twice.', 'A warm tea fixes most things.'] },
  porter: { name: 'Porter', jp: '運', color: '#b07a4a', suits: ['errand'], suitWord: 'errands', perk: 'haul', perkWord: '25% more materials', look: 'A big backpack',
    lines: ['I carried it all. Twice, because I forgot the first lot.', 'My pack is a little heavier. That means it went well.', 'Wood, stone, one interesting pebble.'] },
};
export const CLASS_IDS = Object.keys(HIRE_CLASSES);
/** the tags an objective carries for the class rule (its kind and its tags) */
const objTags = o => new Set([o?.kind, ...(o?.tags || [])].filter(Boolean));
/** does a class suit an objective (+15%) */
export const classSuits = (cls, o) => { const t = objTags(o); return (HIRE_CLASSES[cls]?.suits || []).some(s => t.has(s)); };

// ------------------------------------------------------------------ names (the hires' own; saved on the record)
const NAMES = ['Kenta', 'Hiro', 'Sachi', 'Rin', 'Daichi', 'Mai', 'Jiro', 'Aoi', 'Toki', 'Nanami', 'Goro', 'Hotaru', 'Isamu', 'Kaede', 'Ren', 'Saku', 'Tama', 'Yuzu', 'Botan', 'Ginta', 'Kotetsu', 'Mikan', 'Shin', 'Wataru', 'Asuka', 'Fubuki', 'Hayate', 'Kiri'];
const hashStr = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const obj = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);
const arr = v => (Array.isArray(v) ? v : []);
const worldDayOf = h => Math.floor(Math.max(0, h) / 24);

// ------------------------------------------------------------------ the state (a type-checked fill; cozy/state.js calls it)
function fillHire(h, cap = 40) {
  if (!obj(h) || typeof h.id !== 'string' || !h.id) return null;
  const cls = HIRE_CLASSES[h.cls] ? h.cls : 'guard';
  return {
    id: h.id, seed: Math.floor(num(h.seed, hashStr(h.id))) >>> 0, name: typeof h.name === 'string' && h.name ? h.name.slice(0, 24) : 'Hire', cls,
    lvl: clamp(Math.floor(num(h.lvl, 1)), 1, cap), xp: Math.max(0, num(h.xp)), morale: clamp(num(h.morale, 1), MORALE_MIN, MORALE_MAX),
    since: Math.max(0, Math.floor(num(h.since))), owed: Math.max(0, Math.floor(num(h.owed))), unpaid: Math.max(0, Math.floor(num(h.unpaid))), floor: Math.max(0, Math.floor(num(h.floor))),
    onBreak: !!h.onBreak, trips: Math.max(0, Math.floor(num(h.trips))), wins: Math.max(0, Math.floor(num(h.wins))),
  };
}
/** Make state.cozy.guild whole (idempotent; never loses good data) → the guild state. `g` is the old object (or junk). */
export function fillGuild(g) {
  g = obj(g) || {};
  const level = clamp(Math.floor(num(g.level)), 0, GUILD_MAX);
  const seen = new Set();
  const hires = arr(g.hires).map(h => fillHire(h)).filter(h => h && !seen.has(h.id) && seen.add(h.id));
  const c = obj(g.cand) || {};
  const w = obj(g.wages) || {};
  const out = {
    level, hires, seq: Math.max(1, Math.floor(num(g.seq, 1)), ...hires.map(h => (parseInt(h.id.slice(1), 10) || 0) + 1)),
    cand: { day: Math.floor(num(c.day, -1)), list: arr(c.list).filter(x => obj(x) && HIRE_CLASSES[x.cls]).map(x => ({ i: Math.floor(num(x.i)), seed: Math.floor(num(x.seed)) >>> 0, name: String(x.name || 'Hire').slice(0, 24), cls: x.cls, lvl: Math.max(1, Math.floor(num(x.lvl, 1))), taken: !!x.taken })).slice(0, 3) },
    wages: { day: Math.floor(num(w.day, -1)), paid: Math.max(0, Math.floor(num(w.paid))), short: Math.max(0, Math.floor(num(w.short))), total: Math.max(0, Math.floor(num(w.total))), banner: Math.max(0, Math.floor(num(w.banner))) },
    met: !!g.met,
  };
  // (any other fields a later phase adds stay)
  for (const [k, v] of Object.entries(g)) if (!(k in out)) out[k] = v;
  return out;
}
/** the guild state on a game state (filled on first use) */
export function guildState(state) {
  const c = state.cozy ||= {};
  if (!obj(c.guild) || !Array.isArray(c.guild.hires) || !obj(c.guild.wages) || !obj(c.guild.cand)) c.guild = fillGuild(c.guild);
  return c.guild;
}
export const hireOf = (state, id) => guildState(state).hires.find(h => h.id === id) || null;
export const hireKey = id => `hire:${id}`;

// ------------------------------------------------------------------ candidates (3 a world day, seeded)
/** The candidates' level: two below the strongest joined hero, and at least 3 (CZ-9: the joined heroes' average − 2
 *  put a fresh rank-2 Guild's candidates at level 1–2, too weak for an errand alone; a cozy player's Chewy stays low).
 *  A level-3 hire takes a Burrow errand alone at Risky, a home errand as a sure thing. */
export const CAND_MIN = 3;
export function candidateLevel(state) {
  const ids = Object.keys(state.heroes || {}).filter(id => id === 'chewy' || state.flags?.[`${id}Joined`]);
  const top = Math.max(1, ...ids.map(id => state.heroes[id]?.player?.lvl || 1));
  return Math.max(CAND_MIN, top - 2);
}
/** roll a world day's three candidates: a class each (three different ones), a name, a level near the crew's − 2 */
export function rollCandidates(day, baseLvl, guildLevel = 1) {
  const r = mulberry32(hashStr(`guild:cand:${day}`)), pool = CLASS_IDS.slice(), out = [];
  const cap = hireLevelCap(guildLevel);
  for (let i = 0; i < 3; i++) {
    const cls = pool.splice(Math.floor(r() * pool.length), 1)[0];
    const seed = (hashStr(`guild:hire:${day}:${i}`) ^ Math.floor(r() * 0x7fffffff)) >>> 0;
    const name = NAMES[Math.floor(r() * NAMES.length)];
    const lvl = clamp(baseLvl + Math.floor(r() * 3) - 1, Math.min(CAND_MIN, cap), cap); // (never below 3: an errand alone at Risky or better)
    out.push({ i, seed, name, cls, lvl, taken: false });
  }
  // (no two of the day share a name)
  for (let i = 1; i < out.length; i++) while (out.slice(0, i).some(o => o.name === out[i].name)) out[i].name = NAMES[(NAMES.indexOf(out[i].name) + 1) % NAMES.length];
  return out;
}
/** today's candidates (rolled once a world day, kept in the state) */
export function candidatesToday(state, day) {
  const g = guildState(state);
  if (g.cand.day !== day || g.cand.list.length !== 3) g.cand = { day, list: rollCandidates(day, candidateLevel(state), g.level || 1) };
  return g.cand.list;
}
/** Can this candidate be hired now? → { ok, why, fee } (coins: the household's coins) */
export function canHire(state, c, coins = 0) {
  const g = guildState(state), fee = signOnFee(c?.lvl || 1);
  if (!c) return { ok: false, why: 'Nobody there', fee };
  if (!(g.level > 0)) return { ok: false, why: "The Adventurers' Guild isn't built yet", fee };
  if (c.taken) return { ok: false, why: 'Already signed on', fee };
  if (g.hires.length >= rosterCap(g.level)) return { ok: false, why: `The roster is full (${rosterCap(g.level)}): upgrade the Guild for more`, fee };
  if (coins < fee) return { ok: false, why: `Needs ${fee} coins to sign on`, fee };
  return { ok: true, why: '', fee };
}
/** Sign a candidate on (pure; the fee is spent by the caller) → the hire record */
export function signOn(state, c, worldH = 0) {
  const g = guildState(state);
  let name = c.name; // (no two on the roster share a name)
  for (let k = NAMES.indexOf(name), n = 0; g.hires.some(x => x.name === name) && n < NAMES.length; n++) name = NAMES[(k + 1 + n) % NAMES.length];
  const h = fillHire({ id: `h${g.seq++}`, seed: c.seed, name, cls: c.cls, lvl: c.lvl, xp: 0, morale: 1, since: worldDayOf(worldH) }, hireLevelCap(g.level));
  g.hires.push(h);
  c.taken = true;
  return h;
}
/** a kind goodbye: off the roster (their wage stops; back pay is settled by the caller) → the record */
export function dismiss(state, id) {
  const g = guildState(state), i = g.hires.findIndex(h => h.id === id);
  return i >= 0 ? g.hires.splice(i, 1)[0] : null;
}

// ------------------------------------------------------------------ wages (per 24 world hours; time away counts)
/**
 * Settle the wages through world day `day` (pure): for each world day crossed since the last settle, every hire not on a
 * break earns 4 × level; back pay (owed) is paid first, then the day's, in roster order, from `coins`. A hire paid in full
 * gets +0.02 morale; one left short −0.08 (and counts a day at the floor; 3 there and they take a break until paid).
 * → { days, paid, short, perHire: { id: { paid, owed, morale: [from, to], broke?, back? } } }  (the caller spends `paid`)
 */
export function settleWages(state, day, coins = 0) {
  const g = guildState(state), W = g.wages, out = { days: 0, paid: 0, short: 0, perHire: {} };
  if (W.day < 0) { W.day = day; return out; } // (a first settle: wages start from today)
  if (day <= W.day) return out;
  let purse = Math.max(0, Math.floor(coins));
  for (let d = W.day + 1; d <= day; d++) {
    out.days++;
    for (const h of g.hires) {
      const P = out.perHire[h.id] ||= { paid: 0, owed: 0, morale: [h.morale, h.morale] };
      if (h.since >= d) continue; // (signed on today: their first wage is tomorrow's)
      const due = (h.onBreak ? 0 : wageOf(h.lvl)) + h.owed;
      if (!due) continue;
      const pay = Math.min(due, purse);
      purse -= pay; out.paid += pay; P.paid += pay;
      h.owed = due - pay;
      if (h.owed > 0) {
        P.owed = h.owed;
        h.unpaid++;
        h.morale = clamp(h.morale + MORALE.unpaid, MORALE_MIN, MORALE_MAX);
        h.floor = h.morale <= MORALE_MIN + 1e-9 ? h.floor + 1 : 0;
        if (h.floor >= BREAK_DAYS && !h.onBreak) { h.onBreak = true; P.broke = true; }
      } else {
        if (h.onBreak) { h.onBreak = false; P.back = true; } // (paid at last: back from the break)
        h.unpaid = 0; h.floor = 0; P.owed = 0;
        h.morale = clamp(h.morale + MORALE.paid, MORALE_MIN, MORALE_MAX);
      }
      P.morale[1] = h.morale;
    }
  }
  W.day = day; W.paid = out.paid; W.total += out.paid; W.banner += out.paid; W.short = out.short = g.hires.reduce((a, h) => a + h.owed, 0);
  return out;
}
/** pay a hire's back wages now (from `coins`) → { paid, back } */
export function payBack(state, id, coins = 0) {
  const h = hireOf(state, id); if (!h || !h.owed) return { paid: 0, back: false };
  const pay = Math.min(h.owed, Math.max(0, Math.floor(coins)));
  h.owed -= pay;
  let back = false;
  if (!h.owed) { back = h.onBreak; h.onBreak = false; h.unpaid = 0; h.floor = 0; h.morale = clamp(Math.max(h.morale, 0.9) + MORALE.paid, MORALE_MIN, MORALE_MAX); }
  const W = guildState(state).wages; W.total += pay; W.short = guildState(state).hires.reduce((a, x) => a + x.owed, 0);
  return { paid: pay, back };
}
/** the wages a world day costs now */
export const dailyWages = state => guildState(state).hires.reduce((a, h) => a + (h.onBreak ? 0 : wageOf(h.lvl)), 0);

// ------------------------------------------------------------------ expeditions: power, class bonus, perks, the return
/** the crew's class bonus for an objective: +15% once when any hire's class suits it → { mul, keys, cls } */
export function classBonus(state, crew, o) {
  const keys = [];
  let cls = null;
  for (const k of crew || []) {
    if (!k.startsWith('hire:')) continue;
    const h = hireOf(state, k.slice(5));
    if (h && classSuits(h.cls, o)) { keys.push(k); cls ||= h.cls; }
  }
  return { mul: keys.length ? 0.15 : 0, keys, cls };
}
/** the classes in a crew (a Set) */
export function crewClasses(state, crew) {
  const out = new Set();
  for (const k of crew || []) if (k.startsWith('hire:')) { const h = hireOf(state, k.slice(5)); if (h) out.add(h.cls); }
  return out;
}
/** a trip's world hours: a Scout in the crew takes 15% off */
export const scoutHours = (state, crew, hours) => (crewClasses(state, crew).has('scout') ? Math.round(hours * 0.85 * 100) / 100 : hours);
/** why a hire can't go now ('' if they can; away and tired are the expedition core's) */
export function hireWhy(state, id) {
  const h = hireOf(state, id);
  if (!h) return 'Unknown';
  if (h.onBreak) return 'On a break: pay their back wages';
  return '';
}
/**
 * A hire home from a trip (pure): XP on their curve (capped at the Guild's level cap), morale from the result and the
 * lunch, the trip counted → { gained, from, to, morale: [from, to] }
 */
export function hireReturn(state, id, { xp = 0, result = 'success', fed = false } = {}) {
  const g = guildState(state), h = hireOf(state, id); if (!h) return null;
  const from = h.lvl, m0 = h.morale, cap = hireLevelCap(g.level || 1);
  let gained = 0;
  if (xp > 0 && h.lvl < cap) {
    gained = Math.max(1, Math.round(xp));
    h.xp += gained;
    while (h.lvl < cap && h.xp >= hireXpToNext(h.lvl)) { h.xp -= hireXpToNext(h.lvl); h.lvl++; }
    if (h.lvl >= cap) h.xp = Math.min(h.xp, hireXpToNext(h.lvl) - 1);
  }
  if (result !== 'recalled' && result !== 'broken') {
    h.trips++;
    if (result === 'success' || result === 'beaten') h.wins++;
    const dm = (MORALE[result] || 0) + (fed ? MORALE.fed : 0);
    h.morale = clamp(h.morale + dm, MORALE_MIN, MORALE_MAX);
    if (h.morale > MORALE_MIN) h.floor = 0;
  }
  return { gained, from, to: h.lvl, morale: [m0, h.morale] };
}
/** a Porter's haul: the materials × 1.25 (rounded up), else as they were */
export function porterMats(mats, has) {
  if (!has) return mats;
  const out = {};
  for (const [k, n] of Object.entries(mats || {})) out[k] = Math.ceil(n * 1.25);
  return out;
}
/** a hire's line for the report, in their class's voice */
export function hireLine(h, rng = Math.random) {
  const L = HIRE_CLASSES[h?.cls]?.lines || ['Back home safe!'];
  return L[Math.floor(rng() * L.length) % L.length];
}

// ------------------------------------------------------------------ the Guild's upgrades and tools
/** what the next level costs and whether the village can have it → { ok, why, next, cost, rank, max } (cost: from the
 *  building catalog, passed in so this file stays free of the world) */
export function upgradeCheck(level, levelCost, rank, haveFn = () => true) {
  const next = (level | 0) + 1;
  if (!(level > 0)) return { ok: false, why: "Build the Adventurers' Guild first", next: 1 };
  if (next > GUILD_MAX) return { ok: false, max: true, why: 'The Guild is as grand as it gets!', next: GUILD_MAX };
  const cost = levelCost?.[next - 1] || {}, need = GUILD_RANK[next];
  if ((rank || 1) < need) return { ok: false, why: `Needs village rank ${need}`, next, cost, rank: need };
  if (!haveFn(cost)) return { ok: false, why: 'Not enough materials', next, cost, rank: need, poor: true };
  return { ok: true, why: '', next, cost, rank: need };
}
/** what each Guild level gives (the upgrade card and the docs) */
export function levelPerks(level) {
  const L = Math.max(1, Math.min(GUILD_MAX, level | 0));
  return { roster: rosterCap(L), crew: crewCap(L), levelCap: hireLevelCap(L), power: Math.round(5 * L) };
}
/** the Guild's two tools (COZY §7.1), sold by Old Hachi; flags in state.cozy.scav.tools (scavenge.js reads them) */
export const GUILD_TOOLS = {
  basket: { name: "Forager's Basket", jp: '籠', desc: '+1 on every gather node', cost: { coins: 240, wood: 8, silk: 2 } },
  bandana: { name: "Shadow's Bandana", jp: '布', desc: "Shadow's nose reaches 18 m, and he finds one more dig spot a day", cost: { coins: 320, silk: 3, petal: 4 } },
};
