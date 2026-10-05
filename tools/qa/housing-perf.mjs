// Housing performance (docs/HOUSING.md §8): uncapped frame times (no vsync) and timings for
//  - entering the cottage cold (a fresh page: every furniture template built for the first time) and warm (again);
//  - entering a villager's home cold (the sculpted pieces' first build) after its door's pre-build, and warm;
//  - a 60-item room: the cottage filled to 60 pieces, frame time and draw calls vs the default cottage;
//  - a remodel: the styled template's first build, a second house in the same style (cached), and the styled-template
//    cache over 40 different looks (it stays at its cap).
//   node tools/qa/housing-perf.mjs [runs=2]
import { chromium } from 'playwright-core';
const BASE = process.env.BASE || 'http://localhost:5173';
const runs = +(process.argv[2] || 2);
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
  args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit', '--enable-precise-memory-info'],
});
const all = [];
for (let run = 0; run < runs; run++) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.routeWebSocket(/.*/, ws => { ws.onMessage(() => {}); });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(`${BASE}/?fresh&nointro&hour=11`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 90000 });
  await page.waitForTimeout(3000);
  const r = await page.evaluate(async () => {
    const G = window.G, R = G.engine.renderer, H = G.housing;
    const wait = ms => new Promise(q => setTimeout(q, ms));
    const frames = ms => new Promise(res => { const ts = []; const t0 = performance.now(); const f = t => { ts.push(t); if (t - t0 < ms) requestAnimationFrame(f); else { const d = []; for (let i = 1; i < ts.length; i++) d.push(ts[i] - ts[i - 1]); d.sort((a, b) => a - b); res({ fps: Math.round(ts.length / (ms / 1000)), p50: +d[d.length >> 1].toFixed(2), p95: +d[Math.floor(d.length * 0.95)].toFixed(2) }); } }; requestAnimationFrame(f); });
    const info = () => new Promise(res => { R.info.autoReset = false; R.info.reset(); requestAnimationFrame(() => { const o = { tris: R.info.render.triangles, calls: R.info.render.calls }; R.info.autoReset = true; res(o); }); });
    const until = async (f, t = 8000) => { const t0 = performance.now(); while (!f() && performance.now() - t0 < t) await wait(50); };
    const go = async rec => { H.enter(rec, { instant: true }); await until(() => G.mode === 'interior'); await wait(400); return Math.round(H.enterMs * 10) / 10; };
    const out = async () => { H.exit({ instant: true }); await until(() => G.mode === 'village'); await wait(300); };
    const o = {};
    // the cottage, cold then warm
    o.cottageCold = await go(H.cottage()); o.cottageFrame = await frames(2000); o.cottageInfo = await info(); await out();
    o.cottageWarm = await go(H.cottage()); await out();
    // a villager's home: build its furniture the way its door does (pre-build), then enter; then warm
    const rec = G.sim.list.find(r => r.data.owner === 'tanu'); G.story.addHearts('tanu', 12);
    const t0 = performance.now(); H.prewarm(rec.data); await until(() => false, 1200); const pre = performance.now() - t0;
    o.villagerCold = await go(rec); await out(); o.villagerWarm = await go(rec); await out();
    o.villagerPrewarmWindowMs = Math.round(pre);
    // 60 items in the cottage: fill it with cushions, side tables, plants and lamps where they fit
    { const D = await import('/src/home/placement.js'), I = H.interiorOf(H.cottage().data), L = (await import('/src/home/rooms.js')).LAYOUTS[I.layout];
      const ids = ['zabutonBlue', 'sideTable', 'pottedFern', 'andonLamp', 'zabutonPink', 'acornStool', 'flourSacks', 'melonStool'];
      let k = 900, i = 0;
      for (let z = 0; z < 10 && I.items.length < 60; z++) for (let x = 0; x < 12 && I.items.length < 60; x++) { const it = { k: k++, id: ids[i % ids.length], mount: 'floor', x, z, rot: 0 }; if (D.canPlace(L, I.items, it).ok) { I.items.push(it); i++; } }
      o.items60 = I.items.length;
      await go(H.cottage()); o.room60Frame = await frames(2500); o.room60Info = await info(); o.room60Batches = G.world.batches.map.size; await out(); }
    // a remodel: the first build of a styled template, a second house in the same style, the cache cap
    { const Bi = H.templates, St = await import('/src/world/buildings/styles.js');
      const homes = G.sim.list.filter(r => r.data.type === 'home');
      const st = St.setStyle('machiya');
      G.state.coins = 1e6; for (const m of ['wood', 'stone', 'petal', 'silk']) G.state.materials[m] = 1000;
      let t = performance.now(); H.remodel(homes[0], st); o.remodelFirstMs = Math.round((performance.now() - t) * 10) / 10;
      t = performance.now(); H.remodel(homes[0], null); H.remodel(homes[0], st); o.remodelCachedMs = Math.round((performance.now() - t) / 2 * 10) / 10; // (back and forth: both templates cached now)
      o.cache0 = { ...Bi.templateStats() }; delete o.cache0.keys;
      t = performance.now(); Bi.getTemplate('home', 2, 3, St.setStyle('seaside')); o.templateBuildMs = Math.round((performance.now() - t) * 10) / 10;
      const roofs = Object.keys(St.ROOF_COLORS), walls = Object.keys(St.WALLS), g0 = R.info.memory.geometries;
      t = performance.now(); for (let i = 0; i < 40; i++) Bi.getTemplate('home', 1 + (i % 3), i % 8, { roof: roofs[i % roofs.length], wall: walls[(i * 3) % walls.length] }); o.forty = { ms: Math.round(performance.now() - t), ...Bi.templateStats(), cap: Bi.STYLED_CAP }; delete o.forty.keys;
      await wait(300); o.villageFrame = await frames(2000); o.geoGrowth = R.info.memory.geometries - g0;
    }
    o.heapMB = performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null;
    return o;
  });
  r.errs = errs; all.push(r);
  console.log(JSON.stringify({ run, ...r }));
  await page.close();
}
const med = f => { const v = all.map(f).filter(x => x != null).sort((a, b) => a - b); return v[(v.length - 1) >> 1]; };
console.log('== summary', JSON.stringify({ cottageCold: med(r => r.cottageCold), cottageWarm: med(r => r.cottageWarm), villagerCold: med(r => r.villagerCold), villagerWarm: med(r => r.villagerWarm), cottageP95: med(r => r.cottageFrame.p95), room60P95: med(r => r.room60Frame.p95), room60Calls: med(r => r.room60Info.calls), cottageCalls: med(r => r.cottageInfo.calls), remodelFirstMs: med(r => r.remodelFirstMs), remodelCachedMs: med(r => r.remodelCachedMs), templateBuildMs: med(r => r.templateBuildMs), styled: med(r => r.forty.styled) }));
await browser.close();
