// The expedition pace sim (docs/COZY.md §8, §12; ROADMAP CZ-2, retuned in CZ-9): plays the cozy path's early game on the
// pure modules (src/cozy/objectives.js, expeditions.js, guild.js) many times and reports how long the first siege relief
// (Takemori) takes, against COZY §8's target (Takemori saved at about 1.5–2.5 h of play on either path).
//   node tools/expedition-sim.mjs [runs=300] [--verbose]
// The route (no fighting, Chewy played and never levelled by crews):
//   - "Peek into the Burrow" (burrow1) first: Moka alone with Rosie's lunch; then the town's own growth finishes A Home for
//     Everyone and the Lights on the first world day, and "The King of Squish" goes out once its odds are good;
//   - Moka runs the best errand on offer (the most XP per hour at odds she can be sent at), rests after a partial or a
//     setback, and waits for the next world day when today's errands are taken;
//   - Bamboo opens when any hero reaches level 4 (regions/index.js regionUnlocked); the relief goes out with a packed lunch
//     as soon as a miss would still break a camp (r ≥ 0.75: Risky, but never a setback), and partials break camps until
//     it succeeds;
//   - "Moka + a hire": the Guild is built on the second world day (rank 2 comes with the town's growth) and one of its
//     candidates (cozy/guild.js candidateLevel) is signed on; the hire runs errands too and joins the relief.
// Real time is world hours × 35 s, plus `OVERHEAD` real minutes per trip (walking to the board, picking, reading the
// report). Sleeping is not modelled (it only makes it faster). Lunches are assumed cooked (the farm's first crops).
import { newGameState, normalizeHeroes, createActions } from '../src/rpg/actions.js';
import { normalizeZones, saveVillage, zoneOf } from '../src/rpg/zones.js';
import { normalizeCozy } from '../src/cozy/state.js';
import { SECS_PER_HOUR, worldDay } from '../src/cozy/clock.js';
import { objective, errandsFor, storyObjectives } from '../src/cozy/objectives.js';
import { canSend, resolve, partialProgress, xpFor, startExpedition, finishExpedition } from '../src/cozy/expeditions.js';
import { signOn, candidateLevel, hireReturn } from '../src/cozy/guild.js';
import { VILLAGES } from '../src/regions/village/data.js';

const RUNS = +(process.argv.find(a => /^\d+$/.test(a)) || 300), VERBOSE = process.argv.includes('--verbose');
const OVERHEAD = 0.5; // real minutes per trip
const RELIEF_R = +(process.env.RELIEF_R || 0.75); // (the relief goes at Risky once a miss is sure to be a partial: r ≥ 0.75 breaks a camp)
const TARGET = [90, 150]; // real minutes (COZY §8)
const town = { rank: 2, pop: 14, built: {}, guild: 0 };

function play(withHire, rng) {
  const st = normalizeCozy(normalizeZones(normalizeHeroes(newGameState())));
  const A = createActions({ state: st });
  st.flags.mokaJoined = true; A.prepareJoin('moka');
  st.pantry = { roastedVeggies: 999 }; // (lunches from the first crops)
  st.quests = { active: [{ id: 'burrow1', step: 0, prog: 0 }], done: ['welcome'], requests: {} };
  const C = st.cozy.clock, log = [];
  let trips = 0, errands = 0, reliefTries = 0;
  const gain = (k, o, res, frac = 1) => {
    if (k.startsWith('hire:')) { const H = st.cozy.guild.hires.find(h => `hire:${h.id}` === k); hireReturn(st, k.slice(5), { xp: xpFor(o, H.lvl, res, frac), result: res, fed: false }); }
    else A.addXpTo(k.slice(5), xpFor(o, st.heroes[k.slice(5)].player.lvl, res, frac));
  };
  const go = (o, crew, sup, chk) => {
    const e = startExpedition(st, o, crew, sup, { r: chk.r, need: chk.need, power: chk.power, odds: chk.odds.key, p: chk.odds.p, lunch: true, frac: chk.need / o.power });
    const res = resolve(chk.r, rng, o, !!sup.meals);
    for (const k of crew) gain(k, o, res.result, e.frac);
    finishExpedition(st, e, o, { result: res.result });
    return { e, res };
  };
  for (let guard = 0; guard < 3000; guard++) {
    if (zoneOf(st, 'bamboo').village === 'saved') break;
    const day = worldDay(C.h);
    if (withHire && day >= 1 && !st.cozy.guild.hires.length) { st.cozy.guild.level = 1; town.guild = 1; signOn(st, { i: 0, seed: 7, name: 'Rin', cls: 'guard', lvl: candidateLevel(st), taken: false }, 0); log.push(`h${C.h.toFixed(0)} a hire signs on at L${st.cozy.guild.hires[0].lvl}`); }
    const crewAll = ['hero:moka', ...st.cozy.guild.hires.map(h => `hire:${h.id}`)];
    const free = crewAll.filter(k => !((st.cozy.exp.tired[k] || 0) > C.h));
    if (!free.length) { C.h = Math.min(...crewAll.map(k => st.cozy.exp.tired[k])); continue; }
    // the story: burrow1, then (the town grown) the king, then Takemori once Bamboo is open
    const q = st.quests.active[0];
    if (q?.id === 'burrow1' && free.includes('hero:moka')) {
      const o = objective(st, 'quest:burrow1'), chk = canSend(st, o, ['hero:moka'], {}, town, 'chewy');
      if (chk.ok) { const { e, res } = go(o, ['hero:moka'], {}, chk); C.h += e.hours; trips++; if (res.result === 'success') { st.quests.done.push('burrow1', 'homes', 'lights'); st.quests.active = [{ id: 'king', step: 0, prog: 0 }]; } else if (res.result === 'partial') q.prog = 4; log.push(`h${C.h.toFixed(0)} burrow1 ${res.result}`); continue; }
    }
    if (q?.id === 'king') {
      const o = objective(st, 'quest:king'), crew = free.slice(0, 2), sup = { meals: { roastedVeggies: crew.length } }, chk = canSend(st, o, crew, sup, town, 'chewy');
      if (chk.ok && chk.r >= 0.85) { const { e, res } = go(o, crew, sup, chk); C.h += e.hours; trips++; if (res.result === 'success') { st.quests.done.push('king'); st.quests.active = []; } else if (res.result === 'partial' && q.step === 0) q.step = 1; log.push(`h${C.h.toFixed(0)} king ${res.result} (r ${chk.r.toFixed(2)})`); continue; }
    }
    const rel = storyObjectives(st).find(o => o.kind === 'siege');
    if (rel) {
      const crew = free.slice(0, 2), sup = { meals: { roastedVeggies: crew.length } }, chk = canSend(st, rel, crew, sup, town, 'chewy');
      if (chk.ok && chk.r >= RELIEF_R) {
        const { e, res } = go(rel, crew, sup, chk); C.h += e.hours; trips++; reliefTries++;
        if (res.result === 'success') saveVillage(st, 'bamboo', 'crew');
        else if (res.result === 'partial') { const n = partialProgress(st, rel, chk.r).camps; const Z = zoneOf(st, 'bamboo'); for (const c of VILLAGES.bamboo.camps) if (!Z.siegeCamps.some(s => s.id === c.id)) Z.siegeCamps.push({ id: c.id, cleared: false }); let k = n; for (const s of Z.siegeCamps) if (k > 0 && !s.cleared) { s.cleared = true; k--; } }
        log.push(`h${C.h.toFixed(0)} relief ${res.result} (r ${chk.r.toFixed(2)}, Moka L${st.heroes.moka.player.lvl})`);
        continue;
      }
    }
    // errands: each free member takes the best one left today (the most XP per hour at the odds), in parallel
    const E = st.cozy.exp, open = errandsFor(st, day).filter(o => !(E.errands.day === day && E.errands.taken.includes(o.id)));
    let longest = 0;
    for (const k of free) {
      let best = null;
      for (const o of open) {
        if (E.errands.day === day && E.errands.taken.includes(o.id)) continue;
        const chk = canSend(st, o, [k], {}, town, 'chewy'); if (!chk.ok) continue;
        const lvl = k.startsWith('hire:') ? st.cozy.guild.hires[0].lvl : st.heroes.moka.player.lvl;
        const v = xpFor(o, lvl, 'success') * (chk.odds.p + (1 - chk.odds.p) * (chk.r >= 0.75 ? 1 : 0.5)) / o.hours;
        if (!best || v > best.v) best = { o, chk, v };
      }
      if (!best) continue;
      const { e } = go(best.o, [k], {}, best.chk); trips++; errands++; longest = Math.max(longest, e.hours);
    }
    if (!longest) { C.h = (day + 1) * 24; continue; }
    C.h += longest;
  }
  const realMin = C.h * SECS_PER_HOUR / 60 + trips * OVERHEAD;
  return { saved: zoneOf(st, 'bamboo').village === 'saved', h: C.h, realMin, trips, errands, reliefTries, moka: st.heroes.moka.player.lvl, hire: st.cozy.guild.hires[0]?.lvl || 0, king: st.quests.done.includes('king'), log };
}
let seed = 12345;
const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pct = (a, q) => a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(q * a.length))];
let warn = 0;
for (const [label, hire] of [['Moka alone', false], ['Moka + a hire', true]]) {
  const R = Array.from({ length: RUNS }, () => play(hire, rng)), m = R.map(r => r.realMin);
  const all = R.every(r => r.saved), med = pct(m, 0.5);
  console.log(`${label.padEnd(13)} Takemori saved in ${all ? 'every' : R.filter(r => r.saved).length + '/' + RUNS} run(s): real minutes p10 ${pct(m, 0.1).toFixed(0)} · median ${med.toFixed(0)} · p90 ${pct(m, 0.9).toFixed(0)} (world h median ${pct(R.map(r => r.h), 0.5).toFixed(0)}); trips ${pct(R.map(r => r.trips), 0.5)}, relief tries ${pct(R.map(r => r.reliefTries), 0.5)}, Moka L${pct(R.map(r => r.moka), 0.5)}${hire ? `, the hire L${pct(R.map(r => r.hire), 0.5)}` : ''}, the King done in ${R.filter(r => r.king).length}/${RUNS}`);
  if (VERBOSE) console.log('   ' + R[0].log.join('\n   '));
  if (!all) { console.log('  FAIL  the cozy route must always reach Takemori'); warn = 2; }
  else if (hire && med < TARGET[0]) console.log(`  NOTE  faster than COZY §8's ${TARGET[0]}–${TARGET[1]} min: a Guild hire from day 2 adds a crew member's power for free, so the relief goes with Moka at level 4–5 (the expeditions alone; the session also builds the Guild, farms the lunches)`);
  else if (med < TARGET[0] || med > TARGET[1]) { console.log(`  FAIL  outside COZY §8's ${TARGET[0]}–${TARGET[1]} min target`); warn = 2; }
  else console.log(`  ok    inside COZY §8's ${TARGET[0]}–${TARGET[1]} min target`);
}
process.exit(warn > 1 ? 1 : 0);
