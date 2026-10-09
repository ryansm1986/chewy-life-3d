// The expedition pace sim (docs/COZY.md §8, §12; ROADMAP CZ-2, tuned in CZ-12): plays the cozy path's early game on the
// pure modules (src/cozy/objectives.js, expeditions.js) many times and reports how long the first siege relief
// (Takemori) takes, against COZY §8's target (Takemori saved at about 1.5–2.5 h of play on either path).
//   node tools/expedition-sim.mjs [runs=300] [--verbose]
// The route (phase A: benched heroes only, no hires, no fighting, Chewy played and never levelled):
//   - Moka is the only benched hero; she runs the best errand on offer (the most XP per hour at odds she can be sent
//     at), rests after a partial or a setback, and waits for the next world day when today's errands are taken;
//   - Bamboo opens when any hero reaches level 4 (regions/index.js regionUnlocked); the relief goes out with a packed
//     lunch as soon as the odds are good (r ≥ 0.85), and partials break camps until it succeeds;
//   - the "Moka + Poe" route has Poe join (level 2 below the top, prepareJoin) as soon as Bamboo opens.
// Real time is world hours × 35 s, plus `OVERHEAD` real minutes per trip (walking to the board, picking, reading the
// report). Sleeping is not modelled (it only makes it faster). Lunches are assumed cooked (the farm's first crops).
import { newGameState, normalizeHeroes, createActions } from '../src/rpg/actions.js';
import { normalizeZones, saveVillage, zoneOf } from '../src/rpg/zones.js';
import { normalizeCozy } from '../src/cozy/state.js';
import { SECS_PER_HOUR, worldDay } from '../src/cozy/clock.js';
import { objective, errandsFor, storyObjectives, objectivePower } from '../src/cozy/objectives.js';
import { canSend, resolve, partialProgress, xpFor, startExpedition, finishExpedition } from '../src/cozy/expeditions.js';
import { VILLAGES } from '../src/regions/village/data.js';

const RUNS = +(process.argv.find(a => /^\d+$/.test(a)) || 300), VERBOSE = process.argv.includes('--verbose');
const OVERHEAD = 0.5; // real minutes per trip
const TARGET = [90, 150]; // real minutes (COZY §8)
const town = { rank: 1, pop: 6, built: {}, guild: 0 };

function play(withPoe, rng) {
  const st = normalizeCozy(normalizeZones(normalizeHeroes(newGameState())));
  const A = createActions({ state: st });
  st.flags.mokaJoined = true; A.prepareJoin('moka');
  st.pantry = { roastedVeggies: 99 }; // (lunches from the first crops)
  const C = st.cozy.clock, log = [];
  let trips = 0, errands = 0, reliefTries = 0;
  for (let guard = 0; guard < 2000; guard++) {
    if (zoneOf(st, 'bamboo').village === 'saved') break;
    if (withPoe && !st.flags.poeJoined && storyObjectives(st).length) { st.flags.poeJoined = true; A.prepareJoin('poe'); log.push(`h${C.h.toFixed(0)} Poe joins at L${st.heroes.poe.player.lvl}`); }
    const crewAll = ['moka', 'poe'].filter(id => id === 'moka' || st.flags.poeJoined).map(id => `hero:${id}`);
    const rest = Math.max(0, ...crewAll.map(k => (st.cozy.exp.tired[k] || 0) - C.h));
    if (rest > 0) { C.h += rest; continue; }
    // the relief, once the odds are good
    const rel = storyObjectives(st)[0];
    if (rel) {
      const sup = { meals: { roastedVeggies: crewAll.length } }, chk = canSend(st, rel, crewAll, sup, town, 'chewy');
      if (chk.ok && chk.r >= 0.85) {
        const e = startExpedition(st, rel, crewAll, sup, { r: chk.r, need: chk.need, power: chk.power, odds: chk.odds.key, p: chk.odds.p, lunch: true, frac: chk.need / rel.power });
        C.h += e.hours; trips++; reliefTries++;
        const res = resolve(chk.r, rng, rel, true);
        for (const k of crewAll) A.addXpTo(k.slice(5), xpFor(rel, st.heroes[k.slice(5)].player.lvl, res.result, e.frac));
        if (res.result === 'success') saveVillage(st, 'bamboo', 'crew');
        else if (res.result === 'partial') { const n = partialProgress(st, rel, chk.r).camps; const Z = zoneOf(st, 'bamboo'); for (const c of VILLAGES.bamboo.camps) if (!Z.siegeCamps.some(s => s.id === c.id)) Z.siegeCamps.push({ id: c.id, cleared: false }); let k = n; for (const s of Z.siegeCamps) if (k > 0 && !s.cleared) { s.cleared = true; k--; } }
        finishExpedition(st, e, rel, { result: res.result });
        log.push(`h${C.h.toFixed(0)} relief ${res.result} (r ${chk.r.toFixed(2)}, Moka L${st.heroes.moka.player.lvl})`);
        continue;
      }
    }
    // the best errand today: the most XP per hour at the odds
    const day = worldDay(C.h), E = st.cozy.exp;
    const open = errandsFor(st, day).filter(o => !(E.errands.day === day && E.errands.taken.includes(o.id)));
    let best = null;
    for (const o of open) for (const crew of [['hero:moka'], ...(st.flags.poeJoined ? [['hero:poe']] : [])]) {
      const chk = canSend(st, o, crew, {}, town, 'chewy'); if (!chk.ok) continue;
      const v = xpFor(o, st.heroes[crew[0].slice(5)].player.lvl, 'success') * (chk.odds.p + (1 - chk.odds.p) * (chk.r >= 0.75 ? 1 : 0.5)) / o.hours;
      if (!best || v > best.v) best = { o, crew, chk, v };
    }
    if (!best) { C.h = (day + 1) * 24; continue; }
    const { o, crew, chk } = best;
    const e = startExpedition(st, o, crew, {}, { r: chk.r, need: chk.need, power: chk.power, odds: chk.odds.key, p: chk.odds.p });
    C.h += e.hours; trips++; errands++;
    const res = resolve(chk.r, rng, o, false);
    for (const k of crew) A.addXpTo(k.slice(5), xpFor(o, st.heroes[k.slice(5)].player.lvl, res.result));
    finishExpedition(st, e, o, { result: res.result });
  }
  const realMin = C.h * SECS_PER_HOUR / 60 + trips * OVERHEAD;
  return { saved: zoneOf(st, 'bamboo').village === 'saved', h: C.h, realMin, trips, errands, reliefTries, moka: st.heroes.moka.player.lvl, poe: st.flags.poeJoined ? st.heroes.poe.player.lvl : 0, log };
}
let seed = 12345;
const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pct = (a, q) => a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(q * a.length))];
let warn = 0;
for (const [label, poe] of [['Moka alone', false], ['Moka + Poe', true]]) {
  const R = Array.from({ length: RUNS }, () => play(poe, rng)), m = R.map(r => r.realMin);
  const all = R.every(r => r.saved), med = pct(m, 0.5);
  console.log(`${label.padEnd(11)} Takemori saved in ${all ? 'every' : R.filter(r => r.saved).length + '/' + RUNS} run(s): real minutes p10 ${pct(m, 0.1).toFixed(0)} · median ${med.toFixed(0)} · p90 ${pct(m, 0.9).toFixed(0)} (world h median ${pct(R.map(r => r.h), 0.5).toFixed(0)}); trips ${pct(R.map(r => r.trips), 0.5)}, relief tries ${pct(R.map(r => r.reliefTries), 0.5)}, Moka L${pct(R.map(r => r.moka), 0.5)}${poe ? `, Poe L${pct(R.map(r => r.poe), 0.5)}` : ''}`);
  if (VERBOSE) console.log('   ' + R[0].log.join('\n   '));
  if (!all) { console.log('  FAIL  the cozy route must always reach Takemori'); warn = 2; }
  else if (med < TARGET[0] || med > TARGET[1]) { console.log(`  NOTE  outside COZY §8's ${TARGET[0]}–${TARGET[1]} min target (expeditions only; the target counts the whole session: building, farming, cooking). Tuned in CZ-12.`); }
}
process.exit(warn > 1 ? 1 : 0);
