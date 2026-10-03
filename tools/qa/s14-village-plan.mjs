// Scenario 14: Blossom Hollow 2.0, the town plan (docs/VILLAGE_PLAN.md).
//  a) the plot table fits the real island (validatePlots), every district has plots
//  b) a new game: layout v2, the starter village on its starter plots in every core district, buildings on their
//     plots' spots, >= 3 m between neighbouring lots' buildings, the yards of built plots showing
//  c) free placement: plot buildings need a plot (snapped onto its spot), decorations stay out of the plots' boxes
//  d) zones paint whole plots (nothing on plotless land); growth builds on a zoned plot
//  e) level-ups grow inside the plot, toward its back: the front stays on the setback line
//  f) rank rings: ranks 2-4 open their districts (stub streets paved, plots unlocked, "New district" toast)
//  g) long walks: villagers' and Chewy's routes across the bigger town succeed within their caps; fishing spots by landmark
//  h) migration: the layout v1 fixture (tools/qa/fixtures/village-v1.json) loads onto the plan with every building kept
//     (type, level, residents, seed), on plots, zones and paths dropped, the toast shown once; a second load changes nothing
import fs from 'node:fs';
import { launch, boot, sleep, makeReport, installProbes, BASE } from './lib.mjs';

const R = makeReport('S14 village plan: plots, starter village, growth, level-ups, rings, walks, migration');
const { browser, page, errors, warns } = await launch();
try {
  await boot(page, 'fresh&nointro');
  // a) plot table
  const a = await page.evaluate(async () => {
    const G = window.G, Lay = await import('/src/world/layout.js'), P = await import('/src/world/plots.js'), { sizeOf } = await import('/src/world/buildings/catalog.js');
    const rep = P.validatePlots(G.world.terrain, Lay, sizeOf);
    const empty = Object.keys(P.DISTRICTS).filter(d => !P.PLOTS.some(p => p.district === d));
    return { total: rep.total, errors: rep.errors.slice(0, 6), empty, world: Lay.WORLD };
  });
  R.check('every plot fits the island: dry, flat, off the streets, facing one, no overlaps, a spot for each type', !a.errors.length && a.total >= 60 && a.world === 224, JSON.stringify(a));
  R.check('every district has plots', !a.empty.length, a.empty.join(','));

  // b) the new game's village
  const b = await page.evaluate(async () => {
    const G = window.G, sim = G.sim, S = sim.S, { PLOTS, PLOT_BY_ID } = await import('/src/world/plots.js');
    const onPlot = S.buildings.filter(x => x.plot), by = (t, d) => onPlot.filter(x => x.type === t && (!d || PLOT_BY_ID[x.plot].district === d)).length;
    const off = [], out = [];
    for (const x of onPlot) {
      const p = PLOT_BY_ID[x.plot], [w, d] = sim.dims(x.type, x.rot, x.level);
      if (x.x < p.x || x.z < p.z || x.x + w > p.x + p.w || x.z + d > p.z + p.d) out.push(`${x.type}@${p.id}`);
      if (!p.fixed) { const sp = sim.spotFor(p, x.type, x.level); if (!sp || sp.x !== x.x || sp.z !== x.z || sp.rot !== x.rot) off.push(`${x.type}@${p.id}`); }
    }
    let gap = 99, pair = '';
    const pb = onPlot.filter(x => !PLOT_BY_ID[x.plot].fixed);
    for (let i = 0; i < pb.length; i++) for (let j = i + 1; j < pb.length; j++) {
      const A = pb[i], B = pb[j], [aw, ad] = sim.dims(A.type, A.rot, A.level), [bw, bd] = sim.dims(B.type, B.rot, B.level);
      const g = Math.hypot(Math.max(0, Math.max(A.x, B.x) - Math.min(A.x + aw, B.x + bw)), Math.max(0, Math.max(A.z, B.z) - Math.min(A.z + ad, B.z + bd)));
      if (g < gap) { gap = g; pair = `${A.plot}/${B.plot}`; }
    }
    const plotTypes = S.buildings.filter(x => sim.needsPlot(x.type) && !x.plot).map(x => x.type);
    const yards = G.world.details?.builtPlots?.size ?? -1, built = sim.plotUse.size;
    const shown = (G.world.details?.yardGroups || []).filter(g => g.vis).length, owed = (G.world.details?.yardGroups || []).filter(g => g.plots.some(id => sim.plotUse.has(id))).length;
    return { v: S.layoutVersion, ring: S.ringRank, homesWest: by('home', 'west'), homesMeadows: by('home', 'meadows'), shopsMarket: by('shop', 'market'), farm: by('farm', 'works'), works: onPlot.filter(x => ['lumber', 'kiln', 'fishingHut'].includes(x.type)).length, parks: by('park'), fixed: ['townHall', 'chewyHouse', 'rosieShop', 'dungeonGate'].map(t => S.buildings.find(x => x.type === t)?.plot || null), off, out, gap: +gap.toFixed(2), pair, plotTypes, zoned: PLOTS.filter(p => sim.plotZone(p)).length, yards, built, shown, owed, lamps: G.world.details?.lamps?.length || 0 };
  });
  R.check('a new game is layout v2 with only ring 1 open', b.v === 2 && b.ring === 1, JSON.stringify({ v: b.v, ring: b.ring }));
  R.check('starter village fills plots in every core district (homes West + Meadows, shops on Market Street, a farm and a workshop, parks)', b.homesWest + b.homesMeadows >= 6 && b.homesWest >= 3 && b.homesMeadows >= 3 && b.shopsMarket >= 4 && b.farm >= 1 && b.works >= 1 && b.parks >= 2 && b.zoned >= 3, JSON.stringify(b));
  R.check('the landmarks stand on their fixed plots', b.fixed.every(Boolean), JSON.stringify(b.fixed));
  R.check('every plot building is inside its plot, on its spot (door to the street), and none is off a plot', !b.off.length && !b.out.length && !b.plotTypes.length, JSON.stringify({ off: b.off, out: b.out, noPlot: b.plotTypes }));
  R.check('buildings breathe: >= 3 m between neighbouring lots\' buildings', b.gap >= 3, `${b.gap} m (${b.pair})`);
  R.check('built plots show their yards (and only those); street lanterns stand', b.yards === b.built && b.shown === b.owed && b.shown > 10 && b.lamps >= 8, JSON.stringify({ yards: b.yards, built: b.built, shown: b.shown, owed: b.owed, lamps: b.lamps }));

  // c) free placement and d) zones / growth
  const cd = await page.evaluate(async () => {
    const G = window.G, sim = G.sim, S = sim.S, { PLOTS, PLOT_BY_ID } = await import('/src/world/plots.js');
    const free = PLOTS.find(p => !p.fixed && p.allows.includes('home') && sim.plotOpen(p) && sim.plotFree(p) && !sim.plotZone(p));
    const sp = sim.spotFor(free, 'home', 1);
    const offPlot = sim.place('home', 60, 165, 0, { free: true, silent: true });
    const wrongSpot = sim.place('home', sp.x + 1, sp.z, sp.rot, { free: true, silent: true, plot: free.id });
    const reserved = sim.canPlace('streetLamp', sp.x, sp.z, 0).why || 'ok';
    const lampOk = (() => { for (let r = 2; r < 12; r++) for (let k = 0; k < 16; k++) { const x = Math.floor(free.x + free.w / 2 + Math.cos(k / 16 * 6.283) * r), z = Math.floor(free.z + free.d / 2 + Math.sin(k / 16 * 6.283) * r); if (sim.canPlace('streetLamp', x, z, 0).ok) return true; } return false; })();
    const plotless = sim.paintZone(140, 176, 146, 182, 1); const plotlessHits = sim.lastZoneHits;
    const painted = sim.paintZone(free.x + 1, free.z + 1, free.x + 2, free.z + 2, 1); const paintedHits = sim.lastZoneHits;
    const whole = sim.plotZone(free) === 1 && sim.zone[free.z * 224 + free.x] === 1 && sim.zone[(free.z + free.d - 1) * 224 + free.x + free.w - 1] === 1;
    // growth: force homes demand and tick until a home lands on a zoned plot
    const n0 = S.buildings.length; let grownOn = null;
    for (let k = 0; k < 40 && !grownOn; k++) { sim.simulate(true); sim.demand.R = 1; sim.grow(); const nb = S.buildings.slice(n0).find(x => x.type === 'home'); if (nb) grownOn = nb.plot; }
    return { offPlot: !!offPlot, wrongSpot: !!wrongSpot, reserved, lampOk, plotless, plotlessHits, painted, paintedHits, whole, grownOn, grownZoned: !!grownOn && PLOT_BY_ID[grownOn] && PLOTS.includes(PLOT_BY_ID[grownOn]) };
  });
  R.check('free placement: a home needs a plot and its spot; decorations keep out of the plots\' boxes but fit beside them', !cd.offPlot && !cd.wrongSpot && cd.reserved === 'Keep the plots clear' && cd.lampOk, JSON.stringify(cd));
  R.check('zones paint whole plots; painting plotless land paints nothing', cd.plotless === 0 && cd.plotlessHits === 0 && cd.paintedHits === 1 && cd.whole, JSON.stringify(cd));
  R.check('growth builds a home on a zoned plot', !!cd.grownOn, JSON.stringify(cd));

  // e) level-ups inside the plot
  const e = await page.evaluate(async () => {
    const G = window.G, sim = G.sim, S = sim.S, { PLOT_BY_ID, DOOR_DIR } = await import('/src/world/plots.js');
    const b = S.buildings.find(x => x.type === 'home' && x.plot && x.level === 1);
    const p = PLOT_BY_ID[b.plot], [dx, dz] = DOOR_DIR[p.door];
    const front = () => { const [w, d] = sim.dims(b.type, b.rot, b.level); return dx > 0 ? b.x + w : dx < 0 ? b.x : dz > 0 ? b.z + d : b.z; };
    const f0 = front(), steps = [];
    for (let k = 0; k < 3; k++) { b.q = { road: true, water: 1, joy: 1, light: 1, health: 1, learn: 1 }; const ok = sim.levelUp(b); const [w, d] = sim.dims(b.type, b.rot, b.level); steps.push({ ok, level: b.level, inside: b.x >= p.x && b.z >= p.z && b.x + w <= p.x + p.w && b.z + d <= p.z + p.d, front: front() }); }
    return { plot: p.id, door: p.door, f0, steps, capped: sim.atCap(b), hint: sim.inspectBuilding(b).hint };
  });
  R.check('level-ups grow inside the plot toward its back (the front stays) and stop at the plot\'s max', e.steps.filter(s => s.ok).length === 2 && e.steps.every(s => s.inside && s.front === e.f0) && e.capped, JSON.stringify(e));

  // f) rank rings
  const f = await page.evaluate(async () => {
    const G = window.G, sim = G.sim, S = sim.S, { PLOTS, PLOT_BY_ID } = await import('/src/world/plots.js');
    const out = [], day1 = { rank: sim.stats.rank, ring: S.ringRank };
    G.day.day = 2; sim.checkRings(); // (districts never open on day 1; the next morning, onNewDay opens any rank already reached)
    for (const want of [2, 3, 4]) {
      for (let k = 0; k < 60 && sim.stats.rank < want; k++) {
        for (const b of S.buildings) if (b.type === 'home') b.residents = [2, 4, 6][b.level - 1];
        sim.simulate(true);
        if (sim.stats.rank >= want) break;
        const p = PLOTS.find(q => !q.fixed && q.allows.includes('home') && sim.plotOpen(q) && sim.plotFree(q)); if (!p) break;
        const sp = sim.spotFor(p, 'home', 1); const nb = sim.place('home', sp.x, sp.z, sp.rot, { free: true, silent: true, plot: p.id }); if (nb) nb.level = 1;
      }
      const ringPlots = PLOTS.filter(p => p.rank === want);
      out.push({ want, rank: sim.stats.rank, ring: S.ringRank, open: ringPlots.every(p => sim.plotOpen(p)), news: (sim.ringNews || []).slice() });
      await new Promise(r => setTimeout(r, 400)); // the toast goes out on the next quiet frames
    }
    const T = G.world.terrain;
    return { out, day1, paved: { outer: T.tile(117.6, 182) === 1, hamlet: T.tile(178, 121) === 1, terraces: T.tile(94, 81.2) === 1 }, toasts: window.QA.toasts.filter(t => /New district/.test(t)) };
  });
  R.check('rank rings open their districts at ranks 2, 3 and 4 (plots unlocked, stub streets paved)', f.out.every(o => o.ring >= o.want && o.open) && f.paved.outer && f.paved.hamlet && f.paved.terraces, JSON.stringify(f));
  R.check('no district opens on day 1, even once the starter village reaches rank 2', f.day1.ring === 1, JSON.stringify(f.day1));
  R.check('each new district gets its toast', f.toasts.length >= 3, JSON.stringify(f.toasts));

  // g) long walks, fishing
  const g = await page.evaluate(async () => {
    const G = window.G, { VillageLife } = await import('/src/actors/villageLife.js'), { navFor } = await import('/src/core/nav.js'), { LANDMARKS: L, POND, riverX } = await import('/src/world/layout.js');
    const life = VillageLife.get(G), P = L.plaza;
    const walk = (a, b, c, d) => { const t = performance.now(), pts = life.nav.find(a, b, c, d); return { ok: !!pts, ms: +(performance.now() - t).toFixed(1) }; };
    const villagers = [walk(P.x, P.z + 3, L.dungeon.x, L.dungeon.z + 3.4), walk(P.x - 3, P.z, L.travel.x + 1.6, L.travel.z + 1.6), walk(74, 141, POND.x + 9, POND.z), walk(L.beach.x, L.beach.z - 6, L.forecourt.x, L.forecourt.z)];
    const nav = navFor(G.world); if (!nav.built) nav.build();
    const t0 = performance.now(), chewy = nav.findPath(P.x, P.z + 3, L.dungeon.x, L.dungeon.z + 3.2), chewyMs = +(performance.now() - t0).toFixed(1);
    const t1 = performance.now(), chewy2 = nav.findPath(P.x, P.z + 3, L.travel.x + 1.6, L.travel.z + 1.2), chewyMs2 = +(performance.now() - t1).toFixed(1);
    const fish = life.fishing().map(s => Math.hypot(s.x - POND.x, s.z - POND.z) < POND.r + 7 ? 'pond' : Math.abs(s.x - riverX(s.z)) < 10 ? 'river' : 'other');
    return { villagers, chewy: !!chewy?.exact, chewyMs, chewy2: !!chewy2?.exact, chewyMs2, fish };
  });
  R.check('long walks: villagers reach the Burrow, the travel post, the pond and the forecourt across town', g.villagers.every(w => w.ok), JSON.stringify(g.villagers));
  R.check('Chewy\'s click-to-walk reaches the Burrow gate and the travel post from the plaza', g.chewy && g.chewy2, JSON.stringify(g));
  R.check('fishing spots are at the pond and on the river (by landmark)', g.fish.length >= 4 && g.fish.every(k => k !== 'other') && g.fish.includes('pond') && g.fish.includes('river'), g.fish.join(','));
  // the big map draws at every zoom
  const m = await page.evaluate(() => { const P = window.G.ui?.hud?.mm?.provider, cv = document.createElement('canvas'); cv.width = cv.height = 560; try { for (const z of [0.5, 1, 2, 3]) P.draw(cv.getContext('2d'), 560, null, { big: true, zoom: z }); return 'ok'; } catch (e) { return e.message; } });
  R.check('the big map draws at zooms 0.5-3', m === 'ok', m);

  // h) migration of a layout v1 save
  const fx = JSON.parse(fs.readFileSync(new URL('./fixtures/village-v1.json', import.meta.url), 'utf8'));
  const errBefore = errors.length;
  await page.goto(`${BASE}/rigs/chewy_b.json`); // (same origin, no game running: nothing saves over the fixture)
  await page.evaluate(s => localStorage.setItem('chewy3d.save', s), JSON.stringify(fx));
  const load = async () => {
    await page.goto(`${BASE}/?notitle`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__ready === true && window.G?.player, null, { timeout: 90000 });
    await installProbes(page);
    await sleep(page, 4500);
    return page.evaluate(() => {
      const G = window.G, sim = G.sim, S = sim.S, W = 224, bad = [];
      const claim = new Int32Array(W * W).fill(-1);
      for (const b of S.buildings) { const [w, d] = sim.dims(b.type, b.rot, b.level); for (let z = b.z; z < b.z + d; z++) for (let x = b.x; x < b.x + w; x++) { const i = z * W + x; if (claim[i] >= 0) bad.push(`${b.type} overlaps at ${x},${z}`); claim[i] = b.idx; if (sim.occ[i] !== b.idx) bad.push(`occ ${x},${z}`); } }
      return { v: S.layoutVersion, n: S.buildings.length, records: sim.list.length, keys: S.buildings.map(b => `${b.id}|${b.type}|${b.level}|${b.residents || 0}|${b.seed}`).sort(), pos: S.buildings.map(b => `${b.id}@${b.x},${b.z},${b.rot},${b.plot || ''}`).sort(), noPlot: S.buildings.filter(b => sim.needsPlot(b.type) && !b.plot).map(b => b.type), zones: S.zones.length, paths: S.paths.length, ring: S.ringRank, mig: sim.migration || null, note: !!S.migrationNote, toastDom: document.body.innerText.includes('Everyone moved into the new town plan'), bad: [...new Set(bad)].slice(0, 6), mode: G.mode, locked: G.player.controlLocked };
    });
  };
  const m1 = await load();
  await page.evaluate(() => window.G.save());
  const m2 = await load();
  const orig = fx.village.buildings.map(b => `${b.id}|${b.type}|${b.level}|${b.residents || 0}|${b.seed}`).sort();
  R.check(`migration keeps all ${orig.length} buildings with their type, level, residents and seed (so their variant)`, m1.n === orig.length && JSON.stringify(m1.keys) === JSON.stringify(orig) && m1.records === m1.n, `${m1.n}/${orig.length} kept, ${m1.records} models`);
  R.check('migration puts every plot building on a plot, with no overlaps, and drops the old zones and paths', !m1.noPlot.length && !m1.bad.length && m1.zones === 0 && m1.paths === 0 && m1.v === 2, JSON.stringify({ noPlot: m1.noPlot, bad: m1.bad, zones: m1.zones, paths: m1.paths, v: m1.v, ring: m1.ring, mig: m1.mig }));
  R.check('the "everyone moved" toast shows once', m1.mig?.toastShown === 1 && m1.toastDom && !m1.note && !m2.toastDom && !m2.mig, JSON.stringify({ first: m1.mig, dom1: m1.toastDom, dom2: m2.toastDom, second: m2.mig }));
  R.check('a second load is idempotent: same buildings in the same places', JSON.stringify(m1.pos) === JSON.stringify(m2.pos) && JSON.stringify(m1.keys) === JSON.stringify(m2.keys) && m2.v === 2, `${m1.pos.length} / ${m2.pos.length}`);
  R.check('the migrated save boots into the village, unlocked, with no errors', m1.mode === 'village' && !m1.locked && errors.length === errBefore, errors.slice(errBefore).join(' | '));
} catch (e) { errors.push('[harness] ' + e.stack); }
const failed = R.finish(errors, warns);
await browser.close();
process.exit(failed ? 1 : 0);
