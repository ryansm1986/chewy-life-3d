// Steam Deck performance check (docs/CONTROLS.md §4 and §10, ROADMAP CT-3): the game at the Deck's 1280×800 with the
// Deck preset, on this machine with the CPU throttled to stand in for the Deck's slower cores, in four scenes:
//   village   the plaza at 10:00, the hero running a loop
//   square    a busy village square: 17:00, every named villager gathered round the fountain, the hero running through
//   burrow    a Burrow fight: floor 8, 60 monsters (packs of 10, every 3rd a champion pack) on the hero, Chewy's rotation
//   zone      a zone dungeon fight: Bamboo Depths floor 1 (its own ~140) plus 40 more on the hero, Chewy's rotation
// Per scene and config: the CPU frame time (engine.tick → the end of render, so the game's whole frame), p50 / p95 / p99,
// the share of frames whose CPU time alone is over 16.7 ms (60 fps) and 25 ms (40 fps), the uncapped rAF interval,
// draw calls, triangles, live particles, and the GPU time of a frame on this machine (EXT_disjoint_timer_query_webgl2,
// when Chrome exposes it) — the GPU can't be throttled, so the GPU columns compare presets, they don't predict the Deck.
// Configs (CONFIGS=deck,deck1x,high): deck = the Deck preset at 1280×800 with the CPU throttled ×CPU (default 3: a Deck
// core against a current desktop core, roughly); deck1x = the same unthrottled; high = the High preset at 1600×900
// unthrottled (the dev target, for the GPU and draw-call comparison). Screenshots of each scene (deck1x, else the
// first config) go to SHOT_DIR (default tools/qa/tmp/deck-perf).
// The verdict, for the deck config: each scene's CPU p95 under 16.7 ms (60 fps) passes; under 25 ms (the 40 fps cap)
// is WARN; else FAIL. Exit 1 on a FAIL or a page error. (A busy machine inflates the throttled numbers: CPU load is
// printed with the table, as profile-horde does.)
//   usage: node tools/qa/deck-perf.mjs [--quick]   CPU=3  SECS=5  SCENES=village,square,burrow,zone  CONFIGS=deck,deck1x,high
//          PHASES=1: ms per frame per game phase (dungeon, skills, combat, vfx, ui, player, world, sim, render, shadows)
//          --quick: SECS=3, configs deck only.  BASE=http://localhost:5173
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';

const quick = process.argv.includes('--quick');
const BASE = process.env.BASE || 'http://localhost:5173';
const CPU = +(process.env.CPU || 3), SECS = +(process.env.SECS || (quick ? 3 : 5));
const SCENES = (process.env.SCENES || 'village,square,burrow,zone').split(',');
const CONFIGS = (process.env.CONFIGS || (quick ? 'deck' : 'deck,deck1x,high')).split(',');
const OUT = process.env.SHOT_DIR || path.resolve('tools/qa/tmp/deck-perf');
fs.mkdirSync(OUT, { recursive: true });
const CFG = {
  deck: { w: 1280, h: 800, q: 3, cpu: CPU, label: `Deck preset, 1280×800, CPU ×${CPU}` },
  deck1x: { w: 1280, h: 800, q: 3, cpu: 1, label: 'Deck preset, 1280×800, CPU ×1' },
  high: { w: 1600, h: 900, q: 2, cpu: 1, label: 'High preset, 1600×900, CPU ×1' },
};
const shotCfg = CONFIGS.includes('deck1x') ? 'deck1x' : CONFIGS[0];

const cpuLoad = () => { if (process.platform !== 'win32') return null; try { return +execFileSync('powershell', ['-NoProfile', '-Command', '(Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average'], { encoding: 'utf8', timeout: 20000 }).trim(); } catch (e) { return null; } };
const load0 = cpuLoad();
const browser = await chromium.launch({ executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--disable-frame-rate-limit', '--disable-gpu-vsync', '--autoplay-policy=no-user-gesture-required'] });
const rows = [], errorsAll = [];
let gpuName = '';

async function runConfig(cname) {
  const C = CFG[cname];
  const context = await browser.newContext({ viewport: { width: C.w, height: C.h }, screen: { width: C.w, height: C.h }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.routeWebSocket(/.*/, ws => { ws.onMessage(() => {}); });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errors.push(m.text()); });
  const cdp = await context.newCDPSession(page);
  const throttle = rate => cdp.send('Emulation.setCPUThrottlingRate', { rate });
  await page.goto(`${BASE}/?fresh&nointro&notut&dseed=1&hour=10&q=${C.q}${C.q === 3 ? '&deck' : '&deck=0'}`);
  await page.waitForFunction(() => window.__ready === true && window.G?.player, null, { timeout: 90000 });
  await page.waitForTimeout(2000);
  const prof = await page.evaluate(() => { const E = window.G.engine; return { preset: E.preset, deck: E.deck, quality: E.quality, pr: +E.renderer.getPixelRatio().toFixed(2), buf: [E.renderer.domElement.width, E.renderer.domElement.height], shadow: window.G.world.sun.shadow.mapSize.x, ao: E.post.ao.enabled, uiScale: window.G.ui.settings.uiScale }; });
  if (!gpuName) gpuName = await page.evaluate(() => { try { const gl = window.G.engine.renderer.getContext(), e = gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : ''; } catch (e) { return ''; } });
  console.log(`\n${cname}: ${C.label} — preset ${prof.preset} (density ${prof.quality}), pixel ratio ${prof.pr} → ${prof.buf.join('×')}, shadow map ${prof.shadow}, AO ${prof.ao ? 'on' : 'off'}, UI ${prof.uiScale}`);

  // ---- in-page harness: frame bookkeeping (as profile-horde), a GPU timer, the hero's rotation, a horde that tops up
  const gpuOk = await page.evaluate(() => {
    const G = window.G, E = G.engine, gl = E.renderer.getContext(), X = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    E.renderer.info.autoReset = false;
    const R = window.__perf = { t: [], w: [], calls: [], tris: [], gpu: [], parts: [], on: false, t0: 0 };
    const tick = E.tick.bind(E), render = E.render.bind(E);
    const pend = []; let q = null;
    E.tick = () => {
      R.t0 = performance.now(); E.renderer.info.reset();
      try { window.__deckH?.top?.(); window.__deckH?.cast?.(); window.__deckH?.run?.(); } catch (e) { window.__deckErr = String(e.stack || e); }
      return tick();
    };
    E.render = () => {
      if (X && R.on && !q) { q = gl.createQuery(); gl.beginQuery(X.TIME_ELAPSED_EXT, q); } // (the render's GPU work: shadows, scene, post)
      render();
      if (q) { gl.endQuery(X.TIME_ELAPSED_EXT); pend.push(q); q = null; }
      for (let i = pend.length - 1; i >= 0; i--) { const p = pend[i]; if (gl.getQueryParameter(p, gl.QUERY_RESULT_AVAILABLE)) { if (!gl.getParameter(X.GPU_DISJOINT_EXT) && R.on) R.gpu.push(gl.getQueryParameter(p, gl.QUERY_RESULT) / 1e6); gl.deleteQuery(p); pend.splice(i, 1); } }
      if (!R.on) return;
      R.t.push(performance.now() - R.t0); R.calls.push(E.renderer.info.render.calls); R.tris.push(E.renderer.info.render.triangles);
      let n = 0; for (const L of G.vfx?.layers || [G.vfx?.glow, G.vfx?.spark, G.vfx?.smoke, G.vfx?.dot].filter(Boolean)) n += (L.p?.length || 0) - (L.killed || 0); R.parts.push(n);
    };
    let last = performance.now();
    (function f() { const n = performance.now(); if (R.on) R.w.push(n - last); last = n; requestAnimationFrame(f); })();
    // PHASES=1: ms per frame per game phase (wrapped where they live now; the dungeon's appear once it exists)
    R.ph = {};
    R.wrap = () => { const w = (o, k, name) => { const f = o?.[k]; if (typeof f !== 'function' || f.__ph) return; const g = o[k] = function (...a) { const t = performance.now(); try { return f.apply(this, a); } finally { if (R.on) R.ph[name] = (R.ph[name] || 0) + performance.now() - t; } }; g.__ph = true; };
      w(G.dungeon, 'update', 'dungeon'); w(G.skills, 'update', 'skills'); w(G.combat, 'update', 'combat'); w(G.vfx, 'update', 'vfx'); w(G.ui, 'update', 'ui'); w(G.player, 'update', 'player'); w(G.world, 'update', 'world'); w(G.sim, 'update', 'sim');
      w(E.post, 'render', 'render'); w(E.renderer.shadowMap, 'render', 'shadows'); };
    return !!X;
  });
  const measure = async (rate) => {
    if (rate > 1) await throttle(rate);
    await page.evaluate((ph) => { const R = window.__perf; if (ph) R.wrap(); R.ph = {}; for (const k of ['t', 'w', 'calls', 'tris', 'gpu', 'parts']) R[k].length = 0; R.on = true; }, !!process.env.PHASES);
    await page.waitForTimeout(SECS * 1000 * Math.max(1, rate * 0.6));
    const r = await page.evaluate(() => {
      const R = window.__perf; R.on = false;
      const s = a => [...a].sort((x, y) => x - y), q = (a, f) => a.length ? a[Math.min(a.length - 1, Math.floor(a.length * f))] : 0;
      const t = s(R.t), w = s(R.w), g = s(R.gpu);
      return { n: t.length, p50: q(t, 0.5), p95: q(t, 0.95), p99: q(t, 0.99), over60: t.filter(x => x > 1000 / 60).length / Math.max(1, t.length), over40: t.filter(x => x > 25).length / Math.max(1, t.length),
        w50: q(w, 0.5), w95: q(w, 0.95), calls: q(s(R.calls), 0.5), tris: q(s(R.tris), 0.5), parts: q(s(R.parts), 0.95), g50: g.length ? q(g, 0.5) : null, g95: g.length ? q(g, 0.95) : null,
        alive: window.G.dungeon?.monsters?.filter(m => m.alive).length ?? null, err: window.__deckErr || null,
        phases: Object.fromEntries(Object.entries(R.ph).map(([k, v]) => [k, +(v / Math.max(1, t.length)).toFixed(2)])) };
    });
    if (rate > 1) await throttle(1);
    return r;
  };
  const shoot = async (scene) => { if (cname === shotCfg) await page.screenshot({ path: path.join(OUT, `${scene}.png`) }); };

  for (const scene of SCENES) {
    try {
      if (scene === 'village' || scene === 'square') {
        await page.evaluate(async (scene) => {
          const G = window.G, L = G.world.landmarks, P = G.player;
          if (G.mode !== 'village') return;
          G.day.hour = scene === 'square' ? 17 : 10;
          const c = L.plaza; P.setPos(c.x + 8.5, c.z); G.engine.rig.focus.copy(P.pos); G.engine.rig.snap();
          if (scene === 'square') for (const [i, n] of G.npcs.entries()) { const a = i * 2.4, r = 4 + (i % 4) * 2.2; n.setPos?.(c.x + Math.cos(a) * r, c.z + Math.sin(a) * r); }
          // the hero runs a loop round the fountain on a virtual stick (camera-relative: up = away from the camera)
          if (!window.__pad) { const pad = window.__pad = { id: 'Xbox 360 Controller (XInput STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) }; navigator.getGamepads = () => [pad, null, null, null]; }
          const cam = G.engine.camera;
          let chk = { t: performance.now(), x: P.pos.x, z: P.pos.z };
          window.__deckH = { run() {
            const now = performance.now();
            if (now - chk.t > 600) { // (stuck on a lantern or a bench: hop on round the loop)
              if (Math.hypot(P.pos.x - chk.x, P.pos.z - chk.z) < 0.6) { const b = Math.atan2(P.pos.z - c.z, P.pos.x - c.x) + 0.5; P.setPos(c.x + Math.cos(b) * 8.5, c.z + Math.sin(b) * 8.5); }
              chk = { t: now, x: P.pos.x, z: P.pos.z };
            }
            const a = Math.atan2(P.pos.z - c.z, P.pos.x - c.x) + 0.35, tx = c.x + Math.cos(a) * 8.5, tz = c.z + Math.sin(a) * 8.5;
            let dx = tx - P.pos.x, dz = tz - P.pos.z; const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
            const t = G.engine.rig.target; let fx = t.x - cam.position.x, fz = t.z - cam.position.z; const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
            window.__pad.axes[0] = dx * -fz + dz * fx; window.__pad.axes[1] = -(dx * fx + dz * fz); window.__pad.timestamp = performance.now();
          } };
        }, scene);
        if (await page.evaluate(() => window.G.mode !== 'village')) throw new Error('not in the village');
      } else {
        const zone = scene === 'zone';
        await page.evaluate((zone) => {
          const G = window.G; window.__deckH = null; G.state.flags.burrowTut = true;
          const P = G.state.player; P.lvl = 30; P.stats = { str: 90, dex: 90, vit: 400, ene: 300 }; P.statPts = 0;
          for (const id of ['chomp', 'whirl', 'bonestorm', 'blaze', 'fetchstorm', 'woof', 'packcall', 'multi', 'throw', 'fetchMastery', 'boneMastery', 'frenzy', 'howl']) P.skills[id] = 10;
          G.actions.recompute(); P.life = null; P.zoom = null; G.actions.addXp = () => {};
          if (zone) G.enterDungeon({ id: 'bambooDepths', floor: 1 }); else G.enterDungeon(8);
        }, zone);
        await page.waitForFunction(() => window.G?.mode === 'dungeon' && window.G.dungeon?.monsters?.length && !window.G.ui?.iris?.active, null, { timeout: 60000 });
        await page.waitForTimeout(2500);
        await page.evaluate(({ zone, N }) => {
          const G = window.G, D = G.dungeon, P = G.player;
          const KINDS = zone ? ['takenoko', 'kodama', 'kamaitachi', 'iwabozu', 'karasuKozo', 'kurage'] : ['mochi', 'dustbunny', 'kinoko', 'lantern', 'kasa', 'wisp', 'oni', 'tanuki'];
          D.warmMonsters?.(KINDS);
          const MON = D.monsters[0].constructor, lvl = D.layout.mlvl || 10, set = new Set(); let k = 0, nextT = 0;
          const spot = (r0, r1) => { for (let i = 0; i < 80; i++) { const a = Math.random() * 6.283, r = r0 + Math.random() * (r1 - r0), x = P.pos.x + Math.cos(a) * r, z = P.pos.z + Math.sin(a) * r; if (G.world.walkable(x, z)) return [x, z]; } return [P.pos.x + 2, P.pos.z + 2]; };
          const pack = (n, r0, r1) => { const id = KINDS[k % KINDS.length], rank = k++ % 3 === 2 ? 'champion' : 'normal', [cx, cz] = spot(r0, r1);
            for (let i = 0; i < n; i++) { let x = cx + Math.cos(i * 2.4) * (0.6 + i * 0.25), z = cz + Math.sin(i * 2.4) * (0.6 + i * 0.25); if (!G.world.walkable(x, z)) { x = cx; z = cz; }
              const m = D.spawnMonster ? D.spawnMonster(id, { level: lvl, rank, x, z }) : (() => { const m = new MON(D, id, { level: lvl, rank, x, z }); D.monsters.push(m); D.combat.add(m); return m; })();
              m.lifeMax = m.life = Math.round(m.lifeMax * 8); m.aggro = true; set.add(m); } };
          for (let i = 0; i < N / 10; i++) pack(10, 3, 13);
          const ROT = ['attack', 'attack', 'chomp', 'attack', 'whirl', 'attack', 'bonestorm', 'woof', 'attack', 'packcall', 'blaze', 'fetchstorm', 'multi', 'throw'], BALL = new Set(['blaze', 'fetchstorm', 'multi', 'throw']);
          let ri = 0, nextCast = 0;
          window.__deckH = {
            top() { for (const m of set) if (!m.alive) set.delete(m); if (set.size < N - 9 && performance.now() > nextT) { pack(10, 10, 15); nextT = performance.now() + 500; } },
            cast() { if (performance.now() < nextCast) return; nextCast = performance.now() + 160; const id = ROT[ri++ % ROT.length];
              G.state.player.zoom = null; G.state.player.life = null; G.skills.cds = {};
              const ball = BALL.has(id); if (id !== 'attack' && (G.derived.weaponType === 'ball') !== ball) { G.actions.swapWeapons(); P.setWeapon(G.derived.weaponType); }
              const t = G.combat.nearest(P.pos, 'ally', 9, e => !e.breakable) || [...set].find(m => m.alive);
              if (t) { if (P.anim.busy?.() && id !== 'attack') P.anim.stop(); G.skills.tryCast(id, t.pos.clone(), t); } },
          };
        }, { zone, N: zone ? 40 : 60 });
        await page.waitForTimeout(2500);
      }
      await page.waitForTimeout(800);
      await shoot(scene);
      const r = await measure(C.cpu);
      rows.push({ cfg: cname, scene, ...r, gpuOk });
      const f = x => x.toFixed(1);
      console.log(`  ${scene.padEnd(8)} cpu p50 ${f(r.p50).padStart(5)}  p95 ${f(r.p95).padStart(5)}  p99 ${f(r.p99).padStart(5)} ms | over 16.7 ${(r.over60 * 100).toFixed(0).padStart(3)}%  over 25 ${(r.over40 * 100).toFixed(0).padStart(3)}% | rAF p50 ${f(r.w50)} p95 ${f(r.w95)} | gpu ${r.g50 != null ? `p50 ${r.g50.toFixed(2)} p95 ${r.g95.toFixed(2)} ms` : 'n/a'} | draws ${r.calls} tris ${(r.tris / 1000).toFixed(0)}k particles ${r.parts}${r.alive != null ? ` | alive ${r.alive}` : ''}${r.err ? ' | ERR ' + r.err.split('\n')[0] : ''}`);
      if (process.env.PHASES) console.log('    phases (ms/frame):', JSON.stringify(r.phases));
    } catch (e) { console.log(`  ${scene}: harness error ${String(e.message).split('\n')[0]}`); rows.push({ cfg: cname, scene, failed: true }); }
  }
  errorsAll.push(...errors.map(e => `${cname}: ${e}`));
  await context.close();
}

for (const c of CONFIGS) await runConfig(c);
await browser.close();
const load1 = cpuLoad();

// ---- the verdict (the deck config, else the first one)
const vc = CONFIGS.includes('deck') ? 'deck' : CONFIGS[0];
console.log(`\nGPU: ${gpuName || 'n/a'} · CPU load before ${load0 ?? 'n/a'}% / after ${load1 ?? 'n/a'}% · shots: ${OUT}`);
let fail = errorsAll.length > 0;
for (const r of rows.filter(r => r.cfg === vc)) {
  const v = r.failed ? 'FAIL' : r.p95 <= 1000 / 60 ? 'PASS' : r.p95 <= 25 ? 'WARN' : 'FAIL';
  if (v === 'FAIL') fail = true;
  console.log(`${v} deck-perf ${r.scene}: ${r.failed ? 'did not run' : `CPU p95 ${r.p95.toFixed(1)} ms at ×${CFG[vc].cpu} (${v === 'PASS' ? '60 fps' : v === 'WARN' ? 'the 40 fps cap' : 'under 40 fps'})`}`);
}
const hi = rows.filter(r => r.cfg === 'high'), dk = rows.filter(r => r.cfg === 'deck1x');
if (hi.length && dk.length) for (const d of dk) { const h = hi.find(x => x.scene === d.scene); if (h && !h.failed && !d.failed) console.log(`  ${d.scene}: the Deck preset vs High — draws ${d.calls} vs ${h.calls}, triangles ${(d.tris / 1000).toFixed(0)}k vs ${(h.tris / 1000).toFixed(0)}k${d.g50 != null && h.g50 != null ? `, GPU p50 ${d.g50.toFixed(2)} vs ${h.g50.toFixed(2)} ms (${(100 - d.g50 / h.g50 * 100).toFixed(0)}% less)` : ''}`); }
if (errorsAll.length) console.log('page errors:\n  ' + [...new Set(errorsAll)].slice(0, 8).join('\n  '));
process.exit(fail ? 1 : 0);
