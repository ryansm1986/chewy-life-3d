// Moka spell-spam perf check in a big Burrow fight: every active Moka spell cast in rotation into a 45-monster pack
// (Moonbeam held in between), measuring per-frame CPU time (engine.tick → end of engine.render), draw calls, long
// frames and GPU geometry/texture counts before/after.
// usage: node tools/qa/profile-moka.mjs   [CASTS=splash,kibble,...] [SECS=8] [FLOOR=12] [BASE=http://localhost:5173]
import { chromium } from 'playwright-core';
const BASE = process.env.BASE || 'http://localhost:5173', SECS = +(process.env.SECS || 8), FLOOR = +(process.env.FLOOR || 12);
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--disable-frame-rate-limit', '--disable-gpu-vsync'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.routeWebSocket(/.*/, ws => { ws.onMessage(() => {}); });
await page.addInitScript(c => { if (c) window.__casts = c; }, process.env.CASTS || '');
page.on('pageerror', e => console.log('[pageerror]', e.message));
await page.goto(`${BASE}/?fresh&nointro&hour=10&hero=moka`);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 40000 });
await page.waitForTimeout(2500);
await page.evaluate((floor) => {
  const G = window.G; G.state.flags.burrowTut = true;
  const P = G.state.player; P.lvl = 30; P.stats = { str: 20, dex: 40, vit: 400, ene: 300 };
  for (const id of ['splash', 'tideMastery', 'bubble', 'shake', 'puddleHop', 'whirlpool', 'greatWave', 'kibble', 'starMastery', 'squeak', 'pawRune', 'moonbeam', 'constellation', 'meteor', 'duckDecoy', 'retriever', 'fetchLeash', 'feathers', 'duckCall', 'spiritRetriever', 'mallards']) P.skills[id] = 10;
  G.actions.recompute(); P.life = null; P.zoom = null;
  G.enterDungeon(floor);
}, FLOOR);
await page.waitForTimeout(5500);
const setup = await page.evaluate(() => {
  const G = window.G, p = G.player.pos; let k = 0;
  for (const m of G.dungeon.monsters) { if (!m.alive || m.def?.boss) continue; if (k++ > 45) break; const a = Math.random() * 6.28, r = 3 + Math.random() * 5.5; const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r; if (G.world.walkable(x, z)) { m.pos.set(x, m.pos.y, z); m.aggro = true; } }
  // CPU frame time: engine.tick() starts a frame, engine.render() ends it
  const E = G.engine, tick = E.tick.bind(E), render = E.render.bind(E), R = window.__perf = { t: [], calls: [], spikes: [], on: false, t0: 0 };
  E.renderer.info.autoReset = false;
  E.tick = () => { R.t0 = performance.now(); E.renderer.info.reset(); return tick(); };
  E.render = () => { const p0 = E.renderer.info.programs?.length || 0; render(); if (R.on) { const dt = performance.now() - R.t0; R.t.push(dt); R.calls.push(E.renderer.info.render.calls); if (dt > 25) R.spikes.push(`${Math.round(dt)}ms after ${(window.__castLog || []).slice(-2).join('+') || '-'}${(E.renderer.info.programs?.length || 0) > p0 ? ' (+' + ((E.renderer.info.programs?.length || 0) - p0) + ' programs)' : ''}`); } };
  const mem = E.renderer.info.memory; return { hero: G.player.hero, monsters: k, geo: mem.geometries, tex: mem.textures };
});
console.log('setup', JSON.stringify(setup));
const measure = async (label, fn) => {
  await page.evaluate(() => { window.__perf.t.length = 0; window.__perf.calls.length = 0; window.__perf.spikes.length = 0; window.__perf.on = true; });
  if (fn) await page.evaluate(fn, SECS); else await page.waitForTimeout(SECS * 1000);
  await page.waitForTimeout(fn ? SECS * 1000 + 400 : 0);
  const r = await page.evaluate(() => { const R = window.__perf; R.on = false; const t = [...R.t].sort((a, b) => a - b), c = [...R.calls].sort((a, b) => a - b); const q = (a, f) => a[Math.min(a.length - 1, Math.floor(a.length * f))] || 0; return { n: t.length, p50: q(t, 0.5), p95: q(t, 0.95), p99: q(t, 0.99), max: t[t.length - 1] || 0, over7: t.filter(x => x > 7).length, over16: t.filter(x => x > 16.7).length, calls50: q(c, 0.5), calls95: q(c, 0.95), casts: window.__castLog?.length || 0, spikes: R.spikes.slice(0, 12) }; });
  console.log(label.padEnd(10), `frames ${r.n}  cpu p50 ${r.p50.toFixed(2)} ms  p95 ${r.p95.toFixed(2)}  p99 ${r.p99.toFixed(2)}  max ${r.max.toFixed(1)}  >7ms ${r.over7}  >16.7ms ${r.over16}  draw calls p50 ${r.calls50} p95 ${r.calls95}${r.casts ? `  casts ${r.casts}` : ''}`);
  if (r.spikes.length) console.log('   long frames:', r.spikes.join(' | '));
  return r;
};
await measure('idle-fight');
await measure('moka-spam', (secs) => {
  const G = window.G, t0 = performance.now(); window.__castLog = [];
  const casts = (window.__casts || 'splash,kibble,shake,whirlpool,squeak,constellation,feathers,meteor,pawRune,greatWave,duckCall,mallards,duckDecoy,spiritRetriever,fetchLeash,bubble,moonbeam').split(',');
  let hold = 0; const orig = G.skills.updateMoonbeam; G.skills.updateMoonbeam = function (dt) { return orig.call(this, dt, { holding: () => performance.now() < hold }); };
  let i = 0;
  const iv = setInterval(() => {
    if (performance.now() - t0 > secs * 1000) { clearInterval(iv); return; }
    const id = casts[i++ % casts.length], near = [...G.combat.entities].filter(e => e.alive && e.team === 'enemy' && !e.breakable);
    const m = near[(Math.random() * near.length) | 0];
    G.state.player.zoom = null; G.state.player.life = null; G.skills.cds = {}; G.player.anim.stop();
    if (id === 'moonbeam') hold = performance.now() + 700;
    window.__castLog.push(id);
    if (m) G.skills.tryCast(id, m.pos.clone(), m);
  }, 140);
});
const after = await page.evaluate(() => { const G = window.G; G.skills.clearAll(); const mem = G.engine.renderer.info.memory; return { geo: mem.geometries, tex: mem.textures, programs: G.engine.renderer.info.programs?.length }; });
console.log('gpu after', JSON.stringify(after));
await browser.close();
