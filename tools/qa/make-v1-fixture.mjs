// Writes tools/qa/fixtures/village-v1.json: a pre-plan (layout v1) save made by the game's own save path (G.save() →
// localStorage 'chewy3d.save'), with the starter village plus extra buildings of every role, painted zones, painted
// path tiles and buildings above level 1 — the input for the layoutVersion 2 migration test (docs/VILLAGE_PLAN.md §5).
// Run it against a server that still serves the old (v1) layout:   BASE=http://localhost:5180 node tools/qa/make-v1-fixture.mjs
import fs from 'node:fs';
import { launch, boot } from './lib.mjs';

const { browser, page, errors } = await launch({ w: 1280, h: 720 });
await boot(page, 'fresh&nointro&noaudio');
const res = await page.evaluate(async () => {
  const G = window.G, sim = G.sim, S = sim.S, P = G.world.landmarks.plaza;
  const rnd = (() => { let s = 1234567; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
  Math.random = rnd; // deterministic auto-siting / seeds for this run
  G.state.coins = 4321; for (const k of Object.keys(G.state.materials)) G.state.materials[k] = 200;
  const log = [];
  const add = (type, r0, r1, decor = false) => { const b = sim.autoPlace(type, P.x, P.z, r0, r1, decor); log.push(`${type}:${b ? 'ok' : 'no room'}`); return b; };
  // more of every zoned role, and services / decorations a player would buy
  for (const [t, n, r0, r1] of [['home', 4, 10, 30], ['shop', 2, 8, 26], ['farm', 1, 14, 30], ['kiln', 1, 14, 32], ['fishingHut', 1, 12, 32], ['lumber', 1, 14, 32]]) for (let i = 0; i < n; i++) add(t, r0, r1);
  for (const [t, n, r0, r1] of [['well', 1, 8, 22], ['waterTower', 1, 10, 26], ['park', 1, 10, 28], ['clinic', 1, 10, 28], ['school', 1, 10, 30], ['shrine', 1, 14, 34], ['onsen', 1, 14, 34], ['koiStatue', 1, 6, 18], ['chewyStatue', 1, 6, 20], ['miniTorii', 1, 6, 20], ['lanternString', 1, 6, 18]]) for (let i = 0; i < n; i++) add(t, r0, r1, true);
  for (let i = 0; i < 4; i++) add('bench', 6, 22, true);
  for (let i = 0; i < 3; i++) add('stoneLantern', 6, 24, true);
  for (let i = 0; i < 4; i++) add('fence', 8, 22, true);
  // level-ups: homes to 3 and 2, shops to 2, a farm and a workshop to 2 (growSpot must find room; try a few)
  const lv = (type, to, n) => { let k = 0; for (const b of S.buildings.filter(x => x.type === type)) { if (k >= n) break; while (b.level < to && sim.levelUp(b)); if (b.level > 1) k++; } return k; };
  const leveled = { home3: lv('home', 3, 2), home2: lv('home', 2, 3), shop2: lv('shop', 2, 2), farm2: lv('farm', 2, 1), lumber2: lv('lumber', 2, 1) };
  // painted zones waiting to grow, and a few hand-painted path tiles (a spur off the south path)
  const zones = { R: sim.autoZone(1, 2, 12, 34, 3), C: sim.autoZone(2, 1, 10, 30, 3), W: sim.autoZone(3, 1, 16, 34, 3) };
  let paths = 0;
  for (let z = Math.floor(P.z) + 6; z < Math.floor(P.z) + 16 && paths < 8; z++) for (const x of [Math.floor(P.x) + 3, Math.floor(P.x) + 4]) if (sim.paintPath(x, z, true)) paths++;
  // residents in every home, and a little progress so the save looks played
  for (const b of S.buildings) if (b.type === 'home') b.residents = [2, 4, 6][b.level - 1];
  sim.simulate(true);
  G.state.player.lvl = 6; G.state.player.xp = 0; G.state.day = 9; G.state.dungeon.deepest = 4; G.state.dungeon.waypoints = [1, 3];
  G.state.quests.done.push('burrow1'); G.state.flags.layoutTest = 'v1';
  G.save();
  const raw = localStorage.getItem('chewy3d.save');
  const st = JSON.parse(raw);
  const byType = {}; for (const b of st.village.buildings) byType[`${b.type}L${b.level}`] = (byType[`${b.type}L${b.level}`] || 0) + 1;
  return { raw, summary: { buildings: st.village.buildings.length, zones: st.village.zones.length, paths: st.village.paths.length, layoutVersion: st.village.layoutVersion ?? null, byType, leveled, zonesPainted: zones, pathTiles: paths, rank: st.village.stats?.rank, pop: st.village.stats?.population }, log };
});
fs.mkdirSync(new URL('./fixtures/', import.meta.url), { recursive: true });
fs.writeFileSync(new URL('./fixtures/village-v1.json', import.meta.url), JSON.stringify(JSON.parse(res.raw), null, 1) + '\n');
console.log(JSON.stringify(res.summary, null, 1));
console.log(res.log.join(' '));
if (errors.length) console.log('ERRORS', [...new Set(errors)].slice(0, 8).join('\n'));
await browser.close();
