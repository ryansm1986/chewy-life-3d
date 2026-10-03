// Homestead performance (docs/HOMESTEAD.md §5): uncapped frame times (no vsync), draw calls and triangles for
//  a) the garden as a fresh game has it (Chewy's bed wild, the farmers' rows on the starter field), then the same
//     camera with EVERY bed planted and ripe (Chewy's bed and both fields, a mix of all eight crops);
//  b) the koi pond idle, then the same spot with a reel in progress (the reel bar, the float, the line, ripples).
// Each pair is measured back to back in the same page, so it compares like with like.
//   node tools/qa/homestead-perf.mjs [runs=2]      BASE=http://localhost:5180 to measure another server
import { chromium } from 'playwright-core';
const BASE = process.env.BASE || 'http://localhost:5173';
const runs = +(process.argv[2] || 2);
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
  args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit'],
});
const out = [];
for (let run = 0; run < runs; run++) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.routeWebSocket(/.*/, ws => { ws.onMessage(() => {}); });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(`${BASE}/?fresh&nointro&hour=11`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 90000 });
  await page.waitForTimeout(3000);
  const r = await page.evaluate(async () => {
    const G = window.G, rig = G.engine.rig, R = G.engine.renderer, P = G.player, g = G.life.garden, F = G.life.fishing;
    const wait = ms => new Promise(q => setTimeout(q, ms));
    const frames = ms => new Promise(res => { const ts = []; const t0 = performance.now(); const f = t => { ts.push(t); if (t - t0 < ms) requestAnimationFrame(f); else { const d = []; for (let i = 1; i < ts.length; i++) d.push(ts[i] - ts[i - 1]); d.sort((a, b) => a - b); res({ fps: Math.round(ts.length / (ms / 1000)), p50: +d[d.length >> 1].toFixed(2), p95: +d[Math.floor(d.length * 0.95)].toFixed(2), max: +d[d.length - 1].toFixed(1) }); } }; requestAnimationFrame(f); });
    const info = () => new Promise(res => { R.info.autoReset = false; R.info.reset(); requestAnimationFrame(() => { const o = { tris: R.info.render.triangles, calls: R.info.render.calls }; R.info.autoReset = true; res(o); }); });
    const measure = async () => { await wait(1200); return { ...(await info()), ...(await frames(4000)) }; };
    G.sim.tickT = -1e9; setInterval(() => { G.sim.tickT = -1e9; }, 200);
    G.state.flags.hints = { garden: 1, build: 1, travel: 1, tabSwitch: 1, skills: 1, stats: 1 };
    G.titleActive = false; G.introFocus = null;
    const res = {};
    // ---- a) the garden: a camera over all the beds
    const pts = g.beds.flatMap(b => b.tiles.map(i => g.tiles.get(i))).filter(Boolean);
    const cx = pts.reduce((a, t) => a + t.x, 0) / pts.length, cz = pts.reduce((a, t) => a + t.z, 0) / pts.length;
    const home = g.beds[0], hc = g.tiles.get(home.tiles[0]);
    for (const [k, fx, fz, dist] of [['bed', hc.x, hc.z, 22], ['beds', cx, cz, 46]]) res[k] = { fx, fz, dist };
    const at = async (k) => { const s = res[k]; P.setPos(s.fx + 2.5, s.fz + 2.5); P.moveTarget = null; rig.distTarget = s.dist; rig.focus.set(s.fx, 1, s.fz); rig.snap(); G.introFocus = { x: s.fx, z: s.fz }; return measure(); };
    res.bed.before = await at('bed'); res.beds.before = await at('beds');
    const { CROP_IDS, CROPS } = await import('/src/life/pantry.js');
    let n = 0;
    for (const b of g.beds) { b.active = true; for (const i of b.tiles) { if (g.blocked(i)) continue; const r = g.ensure(i), c = CROP_IDS[n++ % CROP_IDS.length]; r.till = true; r.crop = c; r.stage = CROPS[c].days; r.wet = n % 3 === 0; } }
    for (const i of g.tiles.keys()) g.draw(i);
    res.planted = n; res.bedsN = g.beds.length;
    res.bed.after = await at('bed'); res.beds.after = await at('beds');
    G.introFocus = null;
    // ---- b) the koi pond: idle, then reeling
    const pond = { x: 152.5, z: 146, cx: 142, cz: 146 };
    P.setPos(pond.x, pond.z); P.moveTarget = null; P.faceTo(pond.cx, pond.cz); P.facing = P.faceTarget;
    rig.distTarget = 22; rig.focus.set(pond.x, 1, pond.z); rig.snap(); G.introFocus = { x: pond.x, z: pond.z };
    G.state.fishing = { rod: 1, milestones: [] };
    res.pond = { before: await measure() };
    G.interactCooldown = 0; await wait(300);
    F.start(); await wait(1600);
    if (F.s) { F.s.wait = F.s.t + 0.01; await wait(150); F.reel?.(); }
    // keep the fight going: the fish swims about, the meter hovers (the bar, float, line and ripples all keep working)
    const hold = setInterval(() => { const s = F.s; if (s?.sim) { s.sim.m = 0.5; s.sim.done = null; } }, 100);
    const ph = F.s?.phase;
    res.pond.after = await measure();
    clearInterval(hold);
    res.pond.phase = ph; res.pond.bar = !!document.querySelector('.reel.show');
    F.end(null, { quiet: true });
    G.introFocus = null;
    return res;
  });
  out.push(r);
  console.log(JSON.stringify({ run, ...r, errs: errs.slice(0, 3) }));
  await page.close();
}
await browser.close();
const med = f => { const v = out.map(f).filter(x => x != null).sort((a, b) => a - b); return v[v.length >> 1]; };
const row = (k, w) => ({ p50: med(o => o[k][w].p50), p95: med(o => o[k][w].p95), calls: med(o => o[k][w].calls), tris: med(o => o[k][w].tris) });
const sum = {};
for (const k of ['bed', 'beds', 'pond']) { const a = row(k, 'before'), b = row(k, 'after'); sum[k] = { before: a, after: b, p95: `${((b.p95 / a.p95 - 1) * 100).toFixed(1)}%` }; }
console.log('== summary', JSON.stringify({ planted: out[0].planted, reel: out[0].pond.phase, ...sum }));
