// The whole cozy story's pace sim (docs/COZY.md §8; ROADMAP CZ-9, CZ-12): plays the cozy path from a fresh game to the
// Onsen Caverns' crew clear on the pure modules (src/cozy/objectives.js, expeditions.js, guild.js), with no fighting,
// and reports when each village is saved and each zone dungeon cleared, against COZY §8's "all four villages saved at
// about 8–12 hours either way".
//   node tools/story-sim.mjs [runs=60] [--verbose]
// The model (a cozy player who sends every crew it can, all the time):
//   - the town grows on its own: village rank 2 after RANK_AT[2] world hours, 3 after RANK_AT[3], 4 after RANK_AT[4]
//     (the home sim's growth on painted zones; s37 measures it); the Adventurers' Guild is built at rank 2 and upgraded
//     at ranks 3 and 4 as soon as they open (its coins and materials come from the crews and the homestead: scavenge-sim);
//   - hires: one candidate signed on each world day while the roster has room (cozy/guild.js candidateLevel);
//   - heroes: Moka from the start; Poe joins the day after Takemori is saved, Floofy the day after Akane (each at the
//     pack's level − 2, actions.prepareJoin); Chewy is played and never sent;
//   - the story: burrow1, the King of Squish, then each zone in turn: its relief once the gates allow and a miss would
//     still break a camp (r ≥ 0.75), its dungeon's first clear at good odds (r ≥ 0.85; a partial: −30% next time);
//   - errands: every free member takes the best one left today (the most XP an hour), 3 a day per open area; the
//     player keeps two of today's errands for each hero (a hero's level opens the zones; hires take the rest).
// Real time = world hours × 35 s + OVERHEAD real minutes a trip (one look at the board sends a whole wave). Sleeping is
// not modelled (it only makes it faster).
import { newGameState, normalizeHeroes, createActions } from '../src/rpg/actions.js';
import { normalizeZones, saveVillage, zoneOf, recordCrewClear } from '../src/rpg/zones.js';
import { zoneUnlockOnClear, ZONE_ORDER } from '../src/rpg/zoneProgress.js';
import { normalizeCozy } from '../src/cozy/state.js';
import { SECS_PER_HOUR, worldDay } from '../src/cozy/clock.js';
import { objective, errandsFor, storyObjectives, campsStanding } from '../src/cozy/objectives.js';
import { canSend, resolve, partialProgress, xpFor, startExpedition, finishExpedition, maxCrew, memberInfo } from '../src/cozy/expeditions.js';
import { signOn, candidateLevel, hireReturn, rollCandidates, rosterCap } from '../src/cozy/guild.js';
import { VILLAGES } from '../src/regions/village/data.js';
import { ZONE_DUNGEON } from '../src/dungeon/defs.js';

const RUNS = +(process.argv.find(a => /^\d+$/.test(a)) || 60), VERBOSE = process.argv.includes('--verbose');
const OVERHEAD = 0.5;
export const RANK_AT = { 2: 12, 3: 60, 4: 150 }; // world hours
const TARGET = [480, 720]; // real minutes: all four villages saved (COZY §8)

function play(rng) {
  const st = normalizeCozy(normalizeZones(normalizeHeroes(newGameState())));
  const A = createActions({ state: st });
  st.flags.mokaJoined = true; A.prepareJoin('moka');
  st.pantry = { roastedVeggies: 9999 }; st.potions = { heart: 99, zoom: 0, rejuv: 0 };
  st.quests = { active: [{ id: 'burrow1', step: 0, prog: 0 }], done: ['welcome'], requests: {} };
  const C = st.cozy.clock, log = [], at = {};
  let trips = 0, waves = 0;
  const town = () => { const rank = C.h >= RANK_AT[4] ? 4 : C.h >= RANK_AT[3] ? 3 : C.h >= RANK_AT[2] ? 2 : 1; return { rank, pop: [0, 10, 20, 34, 50][rank], built: { shrine: rank >= 2 ? 1 : 0, onsen: rank >= 3 ? 1 : 0 }, guild: st.cozy.guild.level }; };
  const lvlOf = k => k.startsWith('hire:') ? st.cozy.guild.hires.find(h => `hire:${h.id}` === k)?.lvl || 1 : st.heroes[k.slice(5)].player.lvl;
  const gain = (k, o, res, frac) => { if (k.startsWith('hire:')) hireReturn(st, k.slice(5), { xp: xpFor(o, lvlOf(k), res, frac), result: res, fed: true }); else A.addXpTo(k.slice(5), xpFor(o, lvlOf(k), res, frac)); };
  const joinedHeroes = () => ['moka', 'poe', 'shihtzu'].filter(id => st.flags[`${id}Joined`]).map(id => `hero:${id}`);
  const members = () => [...joinedHeroes(), ...st.cozy.guild.hires.map(h => `hire:${h.id}`)];
  const busy = new Map(); // member → world hour back
  const freeNow = () => members().filter(k => !((busy.get(k) || 0) > C.h) && !((st.cozy.exp.tired[k] || 0) > C.h));
  /** the strongest free members, one at a time, until the odds reach `want` (or the crew is full) */
  const pickCrew = (o, want, free) => {
    const sorted = free.slice().sort((a, b) => (memberInfo(st, b)?.power || 0) - (memberInfo(st, a)?.power || 0)), crew = [];
    for (const k of sorted) { if (crew.length >= maxCrew(st)) break; crew.push(k); const chk = canSend(st, o, crew, { meals: { roastedVeggies: crew.length }, potions: 3 }, town(), 'chewy'); if (chk.ok && chk.r >= want) return { crew, chk }; }
    return null;
  };
  const send = (o, crew, chk, sup) => {
    const e = startExpedition(st, o, crew, sup, { r: chk.r, need: chk.need, power: chk.power, odds: chk.odds.key, p: chk.odds.p, lunch: true, frac: chk.need / o.power });
    const res = resolve(chk.r, rng, o, true);
    for (const k of crew) { gain(k, o, res.result, e.frac); busy.set(k, C.h + e.hours); }
    finishExpedition(st, e, o, { result: res.result }); // (resolved now, applied now: the crew is "away" until busy runs out)
    trips++;
    return res.result;
  };
  for (let guard = 0; guard < 20000 && C.h < 24 * 80; guard++) {
    const day = worldDay(C.h), T = town();
    if (VERBOSE && day !== play.lastDay) { play.lastDay = day; log.push(`day ${day} h${C.h.toFixed(0)} moka L${st.heroes.moka.player.lvl} hires ${st.cozy.guild.hires.map(h => h.lvl).join(",")} quests ${st.quests.active.map(q => q.id)} bamboo ${zoneOf(st, "bamboo").village}`); }
    // the Guild and its hires
    const g = st.cozy.guild, want = T.rank >= 4 ? 3 : T.rank >= 3 ? 2 : T.rank >= 2 ? 1 : 0;
    if (g.level < want) { g.level = want; log.push(`h${C.h.toFixed(0)} the Guild L${want}`); }
    if (g.level && g.hires.length < rosterCap(g.level) && (g.signDay ?? -1) < day) { g.signDay = day; const c = rollCandidates(day, candidateLevel(st), g.level).sort((a, b) => b.lvl - a.lvl)[0]; signOn(st, { ...c, taken: false }, C.h); }
    // the joiners
    if (at.bamboo != null && !st.flags.poeJoined && C.h >= at.bamboo + 24) { st.flags.poeJoined = true; A.prepareJoin('poe'); log.push(`h${C.h.toFixed(0)} Poe joins at L${st.heroes.poe.player.lvl}`); }
    if (at.maple != null && !st.flags.shihtzuJoined && C.h >= at.maple + 24) { st.flags.shihtzuJoined = true; A.prepareJoin('shihtzu'); log.push(`h${C.h.toFixed(0)} Floofy joins at L${st.heroes.shihtzu.player.lvl}`); }
    let free = freeNow();
    if (free.length) {
      waves++;
      // the story first: burrow1, the king, then the open reliefs and dungeons (in zone order)
      const q = st.quests.active[0];
      const tryObj = (o, want, onDone) => { const pc = pickCrew(o, want, free); if (!pc) return false; const r = send(o, pc.crew, pc.chk, { meals: { roastedVeggies: pc.crew.length }, potions: 3 }); onDone(r, pc); free = freeNow(); return true; };
      if (q?.id === 'burrow1') tryObj(objective(st, 'quest:burrow1'), 0.85, r => { if (r === 'success') { st.quests.done.push('burrow1', 'homes', 'lights'); st.quests.active = [{ id: 'king', step: 0, prog: 0 }]; } });
      else if (q?.id === 'king') tryObj(objective(st, 'quest:king'), 0.85, r => { if (r === 'success') { st.quests.done.push('king'); st.quests.active = []; log.push(`h${C.h.toFixed(0)} the King`); } else if (r === 'partial') q.step = 1; });
      for (const o of storyObjectives(st)) {
        if (!free.length) break;
        if (o.kind === 'siege') tryObj(o, 0.75, (r, pc) => {
          const z = o.binds.village;
          if (r === 'success') { saveVillage(st, z, 'crew'); at[z] = C.h; log.push(`h${C.h.toFixed(0)} ${VILLAGES[z].name} saved (r ${pc.chk.r.toFixed(2)}: ${pc.crew.map(k => `${k.slice(5)} L${lvlOf(k)}`).join(', ')})`); }
          else if (r === 'partial') { const n = partialProgress(st, o, pc.chk.r).camps, Z = zoneOf(st, z); for (const c of VILLAGES[z].camps) if (!Z.siegeCamps.some(s => s.id === c.id)) Z.siegeCamps.push({ id: c.id, cleared: false }); let k = n; for (const s of Z.siegeCamps) if (k > 0 && !s.cleared) { s.cleared = true; k--; } void campsStanding; }
        });
        else if (o.kind === 'dungeon' && o.binds?.dungeon) tryObj(o, 0.85, (r, pc) => {
          const z = o.binds.dungeon;
          if (r === 'success') { recordCrewClear(st, ZONE_DUNGEON[z]); zoneUnlockOnClear(st, z); at[`${z}D`] = C.h; log.push(`h${C.h.toFixed(0)} the ${z} dungeon cleared (r ${pc.chk.r.toFixed(2)}: ${pc.crew.map(k => `${k.slice(5)} L${lvlOf(k)}`).join(', ')})`); }
          else if (r === 'partial') st.cozy.exp.progress[o.id] = { floor: 2 };
        });
      }
      // errands for the rest
      const E = st.cozy.exp;
      for (const k of free) {
        const open = errandsFor(st, day).filter(o => !(E.errands.day === day && E.errands.taken.includes(o.id)));
        if (k.startsWith('hire:') && open.length <= 2 * joinedHeroes().length) continue; // (the player keeps a couple of today's errands for each hero: the heroes open the zones)
        let best = null;
        for (const o of open) { const chk = canSend(st, o, [k], { meals: { roastedVeggies: 1 } }, town(), 'chewy'); if (!chk.ok) continue; const v = xpFor(o, lvlOf(k), 'success') * chk.odds.p / o.hours; if (!best || v > best.v) best = { o, chk, v }; }
        if (best) send(best.o, [k], best.chk, { meals: { roastedVeggies: 1 } });
      }
    }
    if (zoneOf(st, 'onsen').dungeon.crew > 0) break;
    // the clock: to the next return (or the next world day when nobody can do anything)
    const backs = [...busy.values()].filter(h => h > C.h);
    const next = backs.length && freeNow().length < members().length ? Math.min(...backs) : (day + 1) * 24;
    C.h = Math.max(C.h + 0.25, next);
  }
  const rm = h => (h == null ? null : h * SECS_PER_HOUR / 60);
  return { at, h: C.h, trips, waves, realMin: rm(C.h) + waves * OVERHEAD, real: Object.fromEntries(Object.entries(at).map(([k, h]) => [k, rm(h)])), lv: { moka: st.heroes.moka.player.lvl, poe: st.heroes.poe.player.lvl, floofy: st.heroes.shihtzu.player.lvl, hires: st.cozy.guild.hires.map(h => h.lvl) }, log };
}
let seed = 4242;
const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pct = (a, q) => { const b = a.filter(v => v != null).sort((x, y) => x - y); return b.length ? b[Math.min(b.length - 1, Math.floor(q * b.length))] : null; };
const R = Array.from({ length: RUNS }, () => play(rng));
if (VERBOSE) console.log('   ' + R[0].log.join('\n   ') + `\n   levels at the end: ${JSON.stringify(R[0].lv)}`);
const f = v => (v == null ? '—' : `${(v / 60).toFixed(1)} h`);
for (const k of ['bamboo', 'bambooD', 'maple', 'mapleD', 'tidepool', 'tidepoolD', 'onsen', 'onsenD']) {
  const v = R.map(r => r.real[k]);
  console.log(`${k.replace(/D$/, ' dungeon').padEnd(17)} median ${f(pct(v, 0.5))} (p10 ${f(pct(v, 0.1))}, p90 ${f(pct(v, 0.9))}) · in ${v.filter(x => x != null).length}/${RUNS} runs`);
}
const all4 = R.map(r => (r.at.onsen != null ? r.real.onsen + r.waves * OVERHEAD * (r.at.onsen / r.h) : null)), med = pct(all4, 0.5);
console.log(`all four villages saved: median ${f(med)} of play (COZY §8: ${TARGET[0] / 60}–${TARGET[1] / 60} h)`);
const ok = med != null && med >= TARGET[0] && med <= TARGET[1];
console.log(ok ? '  ok    inside the target' : '  FAIL  outside the target');
process.exit(ok ? 0 : 1);
