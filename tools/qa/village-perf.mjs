// Village performance snapshot (docs/VILLAGE_PLAN.md §8): boot-to-ready, uncapped frame times (no vsync), triangles,
// draw calls and memory at three camera spots (the gameplay camera at the spawn, the title camera over the plaza and a
// wide view), plus the vegetation / detail build times. Layout-agnostic: spots come from G.world.landmarks.
//   node tools/qa/village-perf.mjs [runs=2]      BASE=http://localhost:5180 to measure another server
import { chromium } from 'playwright-core';
const BASE = process.env.BASE || 'http://localhost:5173';
const runs = +(process.argv[2] || 2);
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
  args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit', '--enable-precise-memory-info', '--js-flags=--expose-gc'],
});
const out = [];
for (let run = 0; run < runs; run++) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.routeWebSocket(/.*/, ws => { ws.onMessage(() => {}); });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  const t0 = Date.now();
  await page.goto(`${BASE}/?fresh&nointro&noui&hour=11`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 90000 });
  const boot = Date.now() - t0;
  await page.waitForTimeout(3000);
  const r = await page.evaluate(async () => {
    const G = window.G, rig = G.engine.rig, r = G.engine.renderer, L = G.world.landmarks;
    const wait = ms => new Promise(q => setTimeout(q, ms));
    const frames = ms => new Promise(res => { const ts = []; const t0 = performance.now(); const f = t => { ts.push(t); if (t - t0 < ms) requestAnimationFrame(f); else { const d = []; for (let i = 1; i < ts.length; i++) d.push(ts[i] - ts[i - 1]); d.sort((a, b) => a - b); res({ fps: Math.round(ts.length / (ms / 1000)), p50: +d[d.length >> 1].toFixed(2), p95: +d[Math.floor(d.length * 0.95)].toFixed(2), max: +d[d.length - 1].toFixed(1) }); } }; requestAnimationFrame(f); });
    const info = () => new Promise(res => { r.info.autoReset = false; r.info.reset(); requestAnimationFrame(() => { const o = { tris: r.info.render.triangles, calls: r.info.render.calls }; r.info.autoReset = true; res(o); }); });
    const P = G.player.pos.clone();
    const spots = [
      ['play', () => { rig.distTarget = 22; rig.focus.set(P.x, P.y + 0.6, P.z); }],
      ['title', () => { rig.distTarget = 52; rig.focus.set(L.plaza.x, 1, L.plaza.z); }],
      ['wide', () => { rig.distTarget = 90; rig.focus.set(L.plaza.x, 1, L.plaza.z); }],
    ];
    const res = {};
    G.titleActive = false; G.player.controlLocked = true; G.introFocus = null;
    for (const [k, set] of spots) {
      G.introFocus = null; set(); rig.snap();
      // the frame loop re-centres the camera on the player: pin it with introFocus
      G.introFocus = { x: rig.focus.x, z: rig.focus.z };
      await wait(1200);
      res[k] = { ...(await info()), ...(await frames(4000)) };
    }
    G.introFocus = null;
    window.gc?.();
    await wait(300);
    const veg = G.world.veg, det = G.world.details;
    return { ...res, heapMB: +(performance.memory.usedJSHeapSize / 1048576).toFixed(1), geos: r.info.memory.geometries, tex: r.info.memory.textures, progs: r.info.programs?.length,
      vegMs: veg.ms, vegInst: veg.instances.length, grassMeshes: veg.grassMeshes?.length, grassBlades: (veg.grassMeshes || []).reduce((a, m) => a + m.count, 0),
      detailsMs: det?.ms?.total, terrainTris: G.world.terrainMesh.userData.tris ?? G.world.terrainMesh.geometry.index.count / 3, buildings: G.sim.S.buildings.length };
  });
  out.push({ boot, ...r, errs: errs.length });
  console.log(JSON.stringify({ run, boot, ...r, errs: errs.slice(0, 3) }));
  await page.close();
}
await browser.close();
const med = k => { const v = out.map(o => k.split('.').reduce((a, s) => a?.[s], o)).filter(x => x != null).sort((a, b) => a - b); return v[v.length >> 1]; };
console.log('== summary', JSON.stringify({ boot: med('boot'), playP95: med('play.p95'), titleP95: med('title.p95'), wideP95: med('wide.p95'), playTris: med('play.tris'), titleTris: med('title.tris'), heapMB: med('heapMB'), geos: med('geos') }));
