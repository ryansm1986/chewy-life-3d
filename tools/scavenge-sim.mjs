// The scavenging pace sim (docs/COZY.md §7.3, §8; ROADMAP CZ-6): checks the gather nodes' and dig spots' yields
// (src/cozy/scavenge.js) against COZY's targets, on the pure tables (means, no rolls).
//   node tools/scavenge-sim.mjs [--verbose]
//   1. A sweep of a saved zone (every node once, the day's dig spots): about 18 wood, 12 stone, 4–6 of the zone's
//      specialty, 5 forage and 2 dig finds; Blossom Hollow's daily round about half that (COZY §7.3).
//   2. "A cozy player is never short of a building's materials for more than one world day once its rank opens" (§8):
//      for every building and upgrade (and the Guild's three levels, §5.1), the days of a cozy routine it takes to
//      gather its combat-only materials (petal, bone, silk, crystal, lantern, mochi). Wood and stone are the nodes' bulk
//      and the lumber yard's / kiln's, so they're reported but not gated. The routine of a world day (14 real minutes):
//      Blossom Hollow's round, two zone sweeps (the two open zones best for what's short), one errand from the Board
//      (the best one for it, objectives.js ERRANDS), the farm's mochi trickle and, from rank 2 (rice), Pound Mochi.
//      The zones open with the village's rank as the story paces them (rank 2: Bamboo saved; 3: Maple; 4: all four).
//   Exit code 1 when a target is missed.
import fs from 'node:fs';
import { AREA_DEFS, NODE_KINDS, meanGather, meanDig, nodeCount, spotCount } from '../src/cozy/scavenge.js';
import { ERRANDS } from '../src/cozy/objectives.js';
import { BUILDINGS } from '../src/world/buildings/catalog.js';

const VERBOSE = process.argv.includes('--verbose');
const SPECIAL = ['petal', 'bone', 'silk', 'crystal', 'lantern', 'mochi'];
const SPECIALTY = { bamboo: ['silk'], maple: ['petal'], tidepool: ['silk', 'crystal'], onsen: ['crystal'] };
// (world/buildMode.js RANK_REQ, read from the source so the sim follows it)
const RANK_REQ = (() => { const m = fs.readFileSync(new URL('../src/world/buildMode.js', import.meta.url), 'utf8').match(/const RANK_REQ = (\{[^}]*\})/); return m ? Function(`return (${m[1]})`)() : {}; })();
const OPEN = { 1: ['home'], 2: ['home', 'bamboo'], 3: ['home', 'bamboo', 'maple'], 4: ['home', 'bamboo', 'maple', 'tidepool', 'onsen'] };
const MOCHI_FARM = 0.5, POUND_PER_DAY = 2; // (world/village.js: a farm's ½ mochi a day; Pound Mochi: 2 rice → 2 mochi, about a batch a day)
const DIGS = area => { let s = 0; for (let d = 0; d < 200; d++) s += spotCount(area, d); return s / 200; };
let fails = 0;
const check = (cond, msg) => { console.log(`${cond ? '  ok ' : '  ✗  '} ${msg}`); if (!cond) fails++; };
const r1 = v => Math.round(v * 10) / 10;

// ------------------------------------------------------------------ 1. a sweep
/** the mean haul of every node in an area once, and its dig spots → { wood, stone, …, forage, coins, digs, finds } */
function sweep(area, o = {}) {
  const A = AREA_DEFS[area], out = { digs: DIGS(area) };
  for (const [kind, n] of Object.entries(A.nodes)) for (const [k, v] of Object.entries(meanGather(kind, o))) out[k] = (out[k] || 0) + v * n;
  for (const [k, v] of Object.entries(meanDig(area, o.perfect ?? 0.3))) out[k] = (out[k] || 0) + v * out.digs;
  return out;
}
console.log('\n== 1. a sweep: every node once and the day\'s dig spots (means; 30% of digs perfect)');
for (const area of Object.keys(AREA_DEFS)) {
  const s = sweep(area), home = area === 'home', k = home ? 0.5 : 1;
  console.log(`  ${area.padEnd(9)} ${String(nodeCount(area)).padStart(2)} nodes · ${Object.entries(s).map(([m, v]) => `${m} ${r1(v)}`).join(' · ')}`);
  check(Math.abs(s.wood - 18 * k) <= 3.5 * Math.max(k, 0.6), `${area}: wood ≈ ${18 * k} (${r1(s.wood)})`);
  check(Math.abs(s.stone - 12 * k) <= 3 * Math.max(k, 0.6), `${area}: stone ≈ ${12 * k} (${r1(s.stone)})`);
  if (!home) { const sp = SPECIALTY[area].reduce((a, m) => a + (s[m] || 0), 0); check(sp >= 4 && sp <= 7, `${area}: its specialty ${SPECIALTY[area].join('+')} 4–6 (${r1(sp)})`); }
  if (!home) check(Math.abs((s.forage || 0) - 5) <= 1.5, `${area}: forage ≈ 5 (${r1(s.forage || 0)})`);
  check(s.digs >= 2 && s.digs <= 3, `${area}: 2–3 dig finds a day (${r1(s.digs)})`);
  check(nodeCount(area) >= (home ? 10 : 14) && nodeCount(area) <= (home ? 12 : 18), `${area}: ${home ? '10–12' : '14–18'} nodes (${nodeCount(area)})`);
}

// ------------------------------------------------------------------ 2. never short for more than a day
const errandHaul = (area, t) => { const tot = Object.values(t.mats).reduce((a, w) => a + w, 0), n = 11; return Object.fromEntries(Object.entries(t.mats).map(([m, w]) => [m, n * w / tot])); };
/** the best daily rate of a material at a rank (home + the two best open zones + the best errand + mochi) */
function rate(mat, rank) {
  const open = OPEN[Math.min(4, rank)], zones = open.filter(a => a !== 'home');
  const home = sweep('home')[mat] || 0;
  const best2 = zones.map(z => sweep(z)[mat] || 0).sort((a, b) => b - a).slice(0, 2).reduce((a, v) => a + v, 0);
  const errand = Math.max(0, ...[...open, 'burrow'].flatMap(a => (ERRANDS[a] || []).map(t => errandHaul(a, t)[mat] || 0)));
  const mochi = mat === 'mochi' ? MOCHI_FARM + (rank >= 2 ? POUND_PER_DAY : 0) : 0;
  return { total: home + best2 + errand + mochi, home, zones: best2, errand, mochi };
}
const GUILD = [{ id: 'guild L1', rank: 2, cost: { coins: 400, wood: 30, stone: 16, petal: 4 } }, { id: 'guild L2', rank: 3, cost: { coins: 900, wood: 40, stone: 30, silk: 4, lantern: 2 } }, { id: 'guild L3', rank: 4, cost: { coins: 1800, wood: 60, stone: 40, crystal: 4, lantern: 4 } }];
const items = [];
for (const [id, b] of Object.entries(BUILDINGS)) {
  if (b.prebuilt && !b.levelCost) continue;
  if (id === 'guild') continue; // (its levels open at ranks 2, 3 and 4, not 1 + level: the GUILD list below)
  const rank = RANK_REQ[id] || 1;
  if (!b.prebuilt) items.push({ id, rank, cost: b.cost || {} });
  (b.levelCost || []).forEach((c, i) => { if (c) items.push({ id: `${id} L${i + 1}`, rank: Math.max(rank, i + 1), cost: c }); });
}
items.push(...GUILD);
console.log('\n== 2. days of a cozy routine to gather a building\'s combat-only materials, once its rank opens');
let worst = { days: 0 };
for (const it of items.sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id))) {
  const need = SPECIAL.filter(m => it.cost[m] > 0); if (!need.length) continue;
  const parts = need.map(m => { const R = rate(m, it.rank); return { m, n: it.cost[m], days: it.cost[m] / R.total, R }; });
  const days = Math.max(...parts.map(p => p.days));
  if (days > worst.days) worst = { days, id: it.id };
  const line = `${it.id.padEnd(16)} rank ${it.rank}: ${parts.map(p => `${p.n} ${p.m} (${r1(p.R.total)}/day)`).join(', ')} → ${r1(days)} day${days >= 1.05 ? 's' : ''}`;
  check(days <= 1.0, line);
  if (VERBOSE) for (const p of parts) console.log(`        ${p.m}: home ${r1(p.R.home)} · zones ${r1(p.R.zones)} · errand ${r1(p.R.errand)}${p.R.mochi ? ` · mochi ${p.R.mochi}` : ''}`);
}
console.log(`\n  the longest wait: ${worst.id} (${r1(worst.days)} world days)`);
console.log(fails ? `\n${fails} target(s) missed` : '\nall targets met');
process.exit(fails ? 1 : 0);
