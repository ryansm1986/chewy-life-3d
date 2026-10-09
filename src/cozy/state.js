// The cozy path's save state (docs/COZY.md §4.10, §9; ROADMAP CZ-1). Pure (no three.js, no DOM): node-tested in
// tools/test-rpg.mjs "COZY".
//
//   state.cozy = {
//     v: COZY_V,
//     clock: { h, wall },                       // the world clock (cozy/clock.js)
//     exp: {
//       active:  [{ uid, obj, crew: ['hero:moka', 'hire:h3'], start, hours, power, need, odds, p, supplies, hold?, seed }],
//       reports: [{ uid, obj, name, place, kind, result, crew, loot, xp, levels, lines, read, at, items? }],
//       progress: { [obj]: { camps?, floor?, trail? } },   // a partial success's kept progress
//       done:     { [obj]: n },                           // successes per objective
//       errands:  { day, taken: [errand id] },           // today's errands already sent
//       tired:    { [member key]: world hour it ends },
//       seq:      n,                                      // the next expedition uid
//     },
//     guild: { level, hires, seq, cand, wages, met },                  // the Adventurers' Guild (cozy/guild.js, phase D)
//     scav: {}, sightings: { day, list, renown, total },              // phases C and B fill these (COZY §6, §7)
//   }
//
// New state is additive and lazy (the homestead pattern, COZY §9): normalizeCozy is an idempotent, type-checked fill
// that game.js runs at boot after normalizeZones. A save from before the cozy path loads with an empty cozy state and
// a clock with no wall-clock mark, so its first load counts no time away. A member key is 'hero:<id>' (benched heroes)
// or 'hire:<id>' (the Guild's hires, phase D): the crew lists are hire-ready from the start.
import { fillClock } from './clock.js';
import { fillGuild } from './guild.js';

export const COZY_V = 1;
const obj = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);
const arr = v => (Array.isArray(v) ? v : []);
const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const str = v => typeof v === 'string' && v.length > 0;

/** a member key → { type: 'hero' | 'hire', id } (null for anything else) */
export function parseMember(key) {
  if (!str(key)) return null;
  const i = key.indexOf(':'), type = key.slice(0, i), id = key.slice(i + 1);
  return (type === 'hero' || type === 'hire') && id ? { type, id } : null;
}
export const heroKey = id => `hero:${id}`;

function fillSupplies(s) {
  s = obj(s) || {};
  const meals = obj(s.meals) || {};
  const out = { meals: {}, potions: Math.max(0, Math.min(3, Math.floor(num(s.potions)))), coins: Math.max(0, Math.floor(num(s.coins))) };
  for (const [k, n] of Object.entries(meals)) if (num(n) > 0) out.meals[k] = Math.floor(n);
  return out;
}
function fillExp(e) {
  if (!obj(e) || !str(e.uid) || !str(e.obj)) return null;
  const crew = arr(e.crew).filter(k => parseMember(k));
  if (!crew.length) return null;
  return { ...e, // (extra fields stay: the board's snapshot of the objective's name and place)
    uid: e.uid, obj: e.obj, name: str(e.name) ? e.name : e.obj, crew,
    start: Math.max(0, num(e.start)), hours: Math.max(0.1, num(e.hours, 1)),
    power: Math.max(0, num(e.power)), need: Math.max(1, num(e.need, 1)), odds: str(e.odds) ? e.odds : 'good', p: Math.max(0, Math.min(1, num(e.p, 1))),
    supplies: fillSupplies(e.supplies), hold: !!e.hold, seed: Math.floor(num(e.seed, 1)) >>> 0,
  };
}
const RESULTS = ['success', 'partial', 'setback', 'beaten', 'recalled'];
function fillReport(r) {
  if (!obj(r) || !str(r.uid) || !RESULTS.includes(r.result)) return null;
  r.crew = arr(r.crew).filter(k => parseMember(k));
  r.loot = obj(r.loot) || {};
  r.xp = obj(r.xp) || {};
  r.levels = obj(r.levels) || {};
  r.lines = arr(r.lines).filter(l => obj(l) && str(l.text));
  r.items = arr(r.items).filter(it => obj(it) && str(it.uid));
  r.read = !!r.read; r.at = Math.max(0, num(r.at));
  return r;
}
/** Make state.cozy whole (idempotent; a type-checked fill, never loses good data) → state */
export function normalizeCozy(state) {
  if (!state) return state;
  const c = state.cozy = obj(state.cozy) || {};
  c.v = COZY_V;
  c.clock = fillClock(c.clock);
  const E = c.exp = obj(c.exp) || {};
  const seen = new Set();
  E.active = arr(E.active).map(fillExp).filter(e => e && !seen.has(e.uid) && seen.add(e.uid));
  E.reports = arr(E.reports).map(fillReport).filter(Boolean).slice(-24);
  E.progress = obj(E.progress) || {};
  E.done = obj(E.done) || {};
  for (const k of Object.keys(E.done)) E.done[k] = Math.max(0, Math.floor(num(E.done[k])));
  const er = obj(E.errands) || {};
  E.errands = { day: Math.floor(num(er.day, -1)), taken: arr(er.taken).filter(str) };
  E.tired = obj(E.tired) || {};
  for (const k of Object.keys(E.tired)) if (!parseMember(k) || !(num(E.tired[k]) > 0)) delete E.tired[k];
  E.seq = Math.max(1, Math.floor(num(E.seq, 1)));
  c.guild = fillGuild(c.guild); // (cozy/guild.js: the Guild's level, the hires, the candidates, the wages)
  c.scav = obj(c.scav) || {};
  const si = obj(c.sightings) || {};
  c.sightings = { day: Math.floor(num(si.day, -1)), list: arr(si.list), renown: Math.max(0, Math.floor(num(si.renown))), total: Math.max(0, Math.floor(num(si.total))) }; // (cozy/sightings.js: the board, renown)
  return state;
}
/** state.cozy, filled on first use */
export function cozyOf(state) {
  if (!obj(state.cozy) || state.cozy.v !== COZY_V || !obj(state.cozy.exp)) normalizeCozy(state);
  return state.cozy;
}
export const expOf = state => cozyOf(state).exp;
export const guildOf = state => cozyOf(state).guild;
export const scavOf = state => cozyOf(state).scav;
/** the expedition a member is out on (a member key, or a hero id), or null */
export function memberAway(state, key) {
  if (!key.includes(':')) key = heroKey(key);
  return expOf(state).active.find(e => e.crew.includes(key)) || null;
}
/** the expedition a hero is out on, or null (heroes.js: not on the bench, not in the wheel, not in town) */
export const heroAway = (state, id) => memberAway(state, heroKey(id));
/** world hours of rest left for a member (0: rested) */
export function tiredLeft(state, key) {
  const t = expOf(state).tired[key] || 0, h = cozyOf(state).clock.h;
  return Math.max(0, t - h);
}
/** the hero keys out on expeditions */
export const awayHeroes = state => expOf(state).active.flatMap(e => e.crew).map(parseMember).filter(m => m?.type === 'hero').map(m => m.id);
/** unread reports */
export const unreadReports = state => expOf(state).reports.filter(r => !r.read).length;
