// Blossom Hollow 2.0 shot tour (docs/VILLAGE_PLAN.md §9): the whole town from above (distance 140 at the plaza, plus
// a wider frame of the whole island), every district at 60, and play shots at the normal camera (22) on Main Street,
// the West Lanes and Market Street. Overhead shots switch the haze and the tilt-shift off so the plan reads.
//   SHOT_DIR=... [GROW=4] node tools/qa/village-plan-shots.mjs [tag] [only=a,b] [query]
// (GROW=4: shoot a town fast-forwarded to village rank 4, reloaded from its save; FIXTURE=path: an old save, migrated)
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
const tag = process.argv[2] || 'p1';
const only = process.argv[3] && process.argv[3] !== 'all' ? process.argv[3].split(',') : null;
const extra = process.argv[4] || '';
const OUT = process.env.SHOT_DIR || 'tools/blender/work/village-plan/shots';
const BASE = process.env.BASE || 'http://localhost:5173';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.routeWebSocket(/.*/, ws => { ws.onMessage(() => {}); });
const errs = [];
page.on('pageerror', e => errs.push(e.message));
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
if (process.env.FIXTURE) { // shoot an old (layout v1) save after its migration onto the plan
  await page.goto(`${BASE}/rigs/chewy_b.json`); // (same origin, no game: nothing saves over the fixture on unload)
  await page.evaluate(s => localStorage.setItem('chewy3d.save', s), JSON.stringify(JSON.parse(fs.readFileSync(process.env.FIXTURE, 'utf8'))));
}
await page.goto(`${BASE}/?${process.env.FIXTURE ? 'notitle' : 'fresh&nointro'}&noui&hour=11${extra}`);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 90000 });
await page.waitForTimeout(3000);
// GROW=4: fast-forward the sim to a grown town at that village rank (zones on every open plot, the services a player
// would add, growth ticks), save, and reload from the save so the opened rings' streets are built like a real boot
if (process.env.GROW) {
  const want = +process.env.GROW;
  const g = await page.evaluate(async want => {
    const G = window.G, sim = G.sim, S = sim.S;
    const { PLOTS, PLOT_BY_ID, plotZones, plotCentre } = await import('/src/world/plots.js');
    G.state.coins = 1e6; for (const k of Object.keys(G.state.materials)) G.state.materials[k] = 9999;
    const put = (type, id) => { const p = PLOT_BY_ID[id]; if (!p || !sim.plotOpen(p) || !sim.plotFree(p)) return; const sp = sim.spotFor(p, type, 1); if (sp) sim.place(type, sp.x, sp.z, sp.rot, { free: true, silent: true, plot: id }); };
    // the services a player adds as the town grows: water towers and parks on the garden plots, the clinic and the
    // school on the civic plots, the shrine and the hot spring, and a well only where a lot still has no water
    const services = () => {
      put('clinic', 'civic-e'); put('school', 'civic-w'); put('waterTower', 'core-se'); put('park', 'pond-e'); put('koiStatue', 'pond-se'); put('waterTower', 'wl-g1'); put('shrine', 'shrine'); put('onsen', 'onsen');
      sim.computeCoverage();
      for (const p of PLOTS) {
        if (p.fixed || !sim.plotOpen(p) || !(p.allows.includes('home') || p.allows.includes('shop'))) continue;
        const c = plotCentre(p);
        if (sim.coverAt('water', c.x, c.z) < 0.25) { sim.autoPlace('well', c.x, c.z, 3, 8, true); sim.computeCoverage(); }
      }
    };
    const zoneAll = () => { for (const p of PLOTS) { if (p.fixed || !sim.plotOpen(p) || !sim.plotFree(p) || sim.plotZone(p)) continue; const z = plotZones(p); if (z.length) sim.zonePlot(p, z.includes(1) && z.includes(2) ? (p.x % 2 ? 1 : 2) : z[0]); } };
    let ticks = 0;
    for (let round = 0; round < 8; round++) {
      zoneAll(); if (round % 2 === 0) services();
      for (let k = 0; k < 400; k++) { sim.simulate(true); sim.grow(); ticks++; }
      if (sim.stats.rank >= want && round >= 2) break;
    }
    zoneAll(); services(); for (let k = 0; k < 300; k++) { sim.simulate(true); sim.grow(); ticks++; }
    // maturity: the town as it would look after many more days (the demand model keeps level-ups slow, so the
    // fast-forward levels about 60% of the grown homes and shops directly, each one inside its own plot)
    let matured = 0;
    for (const b of S.buildings.filter(x => ['home', 'shop', 'farm', 'lumber', 'kiln', 'fishingHut'].includes(x.type))) {
      if (Math.random() < 0.6) while (!sim.atCap(b) && sim.levelUp(b)) matured++;
    }
    // residents: the grown homes fill up, but the town stays at the asked rank (RANK_POP)
    const { RANK_POP } = await import('/src/world/village.js'), cap = (RANK_POP[want] ?? 999) - 1;
    for (const b of S.buildings) if (b.type === 'home') { const room = [2, 4, 6][b.level - 1]; b.residents = Math.min(room, Math.max(b.residents || 0, room - 1)); }
    for (const b of S.buildings) { sim.simulate(true); if (sim.stats.population <= cap) break; if (b.type === 'home' && b.residents > 1) b.residents = 1; }
    sim.simulate(true);
    const byLv = {}; for (const b of S.buildings) if (b.plot) byLv[`${b.type}L${b.level}`] = (byLv[`${b.type}L${b.level}`] || 0) + 1;
    G.save();
    return { ticks, matured, rank: sim.stats.rank, ring: S.ringRank, pop: sim.stats.population, buildings: S.buildings.length, plotsUsed: sim.plotUse.size, byLv };
  }, want);
  console.log('grown:', JSON.stringify(g));
  await page.goto(`${BASE}/?notitle&noui&hour=11${extra}`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 90000 });
  await page.waitForTimeout(4000);
}
// [name, focus x, z, distance, overhead?]
const SPOTS = [
  ['overview', 112, 121, 140, true], ['whole', 116, 128, 330, true],
  ['core', 112, 111, 60, true], ['market', 144, 119, 60, true], ['west', 88, 137, 60, true], ['meadows', 121, 160, 60, true],
  ['pond', 143, 147, 60, true], ['works', 86, 100, 60, true], ['shrine', 175, 85, 60, true], ['terraces', 96, 73, 60, true],
  ['outer', 117, 182, 60, true], ['hamlet', 178, 121, 60, true],
  ['play-main', 99, 121.5, 22, false], ['play-west', 96, 136, 22, false], ['play-market', 141, 121.5, 22, false],
];
for (const [name, x, z, d, over] of SPOTS) {
  if (only && !only.includes(name)) continue;
  await page.evaluate(({ x, z, d, over }) => {
    const G = window.G, r = G.engine.rig, sc = G.world.scene, cam = G.engine.camera;
    G.player.controlLocked = true;
    G.introFocus = { x, z }; r.distTarget = d; r.focus.set(x, G.world.heightAt(x, z), z); r.snap();
    sc.fog.near = over ? 900 : 60; sc.fog.far = over ? 1800 : 140;
    G.engine.post.tiltPass.enabled = !over;
    cam.far = over ? 1200 : 500; cam.updateProjectionMatrix();
    // the player stands where the camera looks in play shots (so the shadow frustum, lights and grass follow)
    if (!over) G.player.setPos(x, z + 0.5);
  }, { x, z, d, over });
  await page.waitForTimeout(1400);
  const f = path.join(OUT, `${tag}-${name}.png`);
  await page.screenshot({ path: f });
  console.log('saved', f);
}
if (errs.length) console.log('ERRORS\n' + [...new Set(errs)].slice(0, 10).join('\n'));
await browser.close();
