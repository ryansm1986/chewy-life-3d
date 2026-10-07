// S24 render health (ROADMAP R-7 black flashes, R-8 first-open menu stutter), on the production bundle (built here,
// like prod-smoke: the owner plays the bundle).
//  a) the probe works: a test quad that writes NaN is counted at the scene stage, and the bloom's guard keeps it to its
//     own pixels (without the guard one NaN texel blacks out the whole frame)
//  b) NaN-safe geometry: no lit mesh in the village, Chewy's Cottage or a Burrow floor has a zero vertex normal
//  c) scripted sessions with ?nanprobe, every frame read back: a lap round Chewy's Cottage at night + in and out, a dense
//     Burrow fight with Chewy (kills, charged casts) and with Poe (her clones), a Bamboo Depths fight with Moka: 0 NaN /
//     Inf texels at every stage, 0 flash frames, no Horde instance with a degenerate normal matrix
//  d) the menus' first open, the owner's way (a save, the title screen, Continue): the prewarm finishes on the title,
//     play's first seconds stay smooth, and the open of I, C, K, J, M, Esc, the hero wheel, B and Rosie's shop each
//     keeps its worst frame under max(FIRST_MS, the page's idle worst frame + 40 ms) (load-robust; B and the shop: LIMIT)
// usage: node tools/qa/s24-render-health.mjs [--quick] [BASE=… (skip the build)]
import { chromium } from 'playwright-core';
import { makeReport } from './lib.mjs';
import { startProd, CHROME, CHROME_ARGS } from './prod-server.mjs';
import { huntSession } from './health-lib.mjs';

const quick = process.argv.includes('--quick');
// a first open's worst frame may be up to max(FIRST_MS, the page's idle worst + 40 ms): the target on a quiet machine is
// ~25 ms (tools/qa/menu-stutter.mjs), and the regressions this guards were 100-130 ms (I, K) and ~0.9 s (B). B (it also
// zooms the camera out and turns the build overlay on) and the shop (~65 ms on every open: its grid and the bag beside
// it re-render) have their own limits.
const FIRST_MS = 70, LIMIT = { build: 250, shop: 150 };
const R = makeReport('S24 render health: the NaN probe, NaN-safe normals, flash-free sessions, menu first opens');
const server = process.env.BASE ? null : await startProd();
const BASE = process.env.BASE || server.url;
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: CHROME_ARGS });
const errors = [], warns = [];
async function page(q, w = 1280, h = 720) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(`[pageerror] ${e.message}`));
  p.on('console', m => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errors.push(`[console.error] ${m.text()}`); else if (m.type() === 'warning') warns.push(m.text()); });
  await p.goto(`${BASE}/?fresh&nointro&notut&dseed=1&${q}`);
  await p.waitForFunction(() => window.__ready === true && window.G?.player, null, { timeout: 90000 });
  await p.waitForTimeout(1200);
  return { p, ctx };
}
const frames = (p, n) => p.evaluate(n => new Promise(q => { let k = 0; const f = () => (++k >= n ? q() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

try {
  // ================================================================ a) the probe and the guard
  for (const guard of [true, false]) {
    const { p, ctx } = await page(`hour=12&nanprobe=spread${guard ? '' : '&off=guard'}`);
    const r = await p.evaluate(async () => {
      const G = window.G, T = G.THREE, RH = window.__rh;
      RH.read = true; RH.frameLog = [];
      const m = new T.Mesh(new T.PlaneGeometry(0.25, 0.25), new T.ShaderMaterial({ fragmentShader: 'void main(){ gl_FragColor = vec4(uintBitsToFloat(0x7fc00000u)); }' }));
      m.position.copy(G.player.pos).add(new T.Vector3(1.2, 1.2, 1.2)); m.lookAt(G.engine.camera.position); G.world.scene.add(m);
      await new Promise(q => { let k = 0; const f = () => (++k >= 8 ? q() : requestAnimationFrame(f)); requestAnimationFrame(f); });
      RH.stage = {};
      await new Promise(q => { let k = 0; const f = () => (++k >= 20 ? q() : requestAnimationFrame(f)); requestAnimationFrame(f); });
      m.removeFromParent();
      const per = s => (RH.stage[s]?.frames ? Math.round(RH.stage[s].bad / RH.stage[s].frames) : 0);
      return { scene: per('scene'), tone: per('tone'), px: innerWidth * innerHeight };
    });
    if (guard) R.check('the probe counts a NaN source at the scene stage, and the bloom guard keeps it to its own pixels', r.scene > 50 && r.tone < r.scene * 3, r);
    else R.check('…without the guard the same source poisons most of the frame (the black flash)', r.tone > r.px * 0.3, r);
    await ctx.close();
  }

  // ================================================================ b) zero vertex normals in lit meshes
  {
    const { p, ctx } = await page('hour=12');
    const scan = async (what) => p.evaluate(async what => {
      const G = window.G;
      if (what === 'interior') { G.openHome(); for (let i = 0; i < 100 && !(G.mode === 'interior' && !G.ui?.iris?.active); i++) await new Promise(q => setTimeout(q, 100)); }
      if (what === 'burrow') { G.state.flags.burrowTut = true; G.enterDungeon(12); for (let i = 0; i < 200 && !(G.mode === 'dungeon' && G.dungeon?.monsters?.length && !G.ui?.iris?.active); i++) await new Promise(q => setTimeout(q, 100)); }
      const seen = new Set(), bad = [];
      G.world.scene.traverse(o => {
        if (!o.isMesh || !o.geometry || seen.has(o.geometry)) return; seen.add(o.geometry);
        const lit = [].concat(o.material).some(m => m && !m.isMeshBasicMaterial && !m.isShaderMaterial && !m.isRawShaderMaterial);
        const N = o.geometry.attributes.normal; if (!lit || !N) return;
        let z = 0; for (let i = 0; i < N.count; i++) { const l = N.getX(i) ** 2 + N.getY(i) ** 2 + N.getZ(i) ** 2; if (!(l > 1e-12)) z++; }
        if (z) bad.push(`${o.name || o.parent?.name || o.type}: ${z}`);
      });
      return { geos: seen.size, bad };
    }, what);
    for (const w of ['village', 'interior']) { const s = await scan(w); R.check(`${w}: no lit geometry has a zero vertex normal (${s.geos} geometries)`, s.geos > 20 && !s.bad.length, s.bad.slice(0, 6).join('; ')); }
    await p.evaluate(() => window.G.housing.exit({ instant: true }));
    await p.waitForFunction(() => window.G.mode === 'village', null, { timeout: 20000 });
    const s = await scan('burrow'); R.check(`a Burrow floor: no lit geometry has a zero vertex normal (${s.geos} geometries)`, s.geos > 20 && !s.bad.length, s.bad.slice(0, 6).join('; '));
    await ctx.close();
  }

  // ================================================================ c) flash-free sessions
  const SESS = quick ? [['cottage-night', 22.5, null], ['burrow-chewy', 10, 'chewy']] : [['cottage-night', 22.5, null], ['burrow-chewy', 10, 'chewy'], ['burrow-poe', 10, 'poe'], ['zone-moka', 10, 'moka']];
  for (const [name, hour, hero] of SESS) {
    const { p, ctx } = await page(`hour=${hour}&nanprobe${hero ? '&hero=' + hero : ''}`);
    const r = await huntSession(p, name, { secs: quick ? 7 : 10 });
    const S = r.stage || {}, nan = ['scene', 'ao', 'tone'].map(k => S[k]?.bad || 0), hordeBad = Object.entries(r.scan?.hits || {}).filter(([k]) => /horde/.test(k));
    R.check(`${name}: 0 NaN / Inf texels at every stage over ${r.frames} frames (scene, AO, tone)`, r.frames > 60 && nan.every(n => n === 0), { nan, firstBad: r.firstBad, fight: r.fight });
    R.check(`${name}: 0 flash frames (a luminance drop or lit blocks turning black outside transitions)`, !(r.flashes || []).length, (r.flashes || []).slice(0, 3));
    if (hero) R.check(`${name}: no Horde instance has a singular or zeroed normal matrix (${r.fight?.kills ?? 0} kills, ${r.fight?.charged ?? 0} charged casts)`, !hordeBad.length && (r.fight?.kills || 0) > 10, hordeBad);
    await ctx.close();
  }

  // ================================================================ d) the menus' first open (the owner's flow: a save,
  // the title screen while the prewarm runs, Continue, then each menu's first open in the village)
  const MENUS = quick ? [['inv', 'i', 'inventory'], ['skills', 'k', 'skills'], ['build', 'b', 'build']] : [['inv', 'i', 'inventory'], ['char', 'c', 'character'], ['skills', 'k', 'skills'], ['quests', 'j', 'quests'], ['map', 'm', 'map'], ['menu', 'Escape', 'menu'], ['wheel', null, 'wheel'], ['build', 'b', 'build'], ['shop', null, 'shop']];
  {
    const { p, ctx } = await page('hour=10&noprewarm', 1600, 900);
    await p.evaluate(() => { const G = window.G; G.state.flags.mokaJoined = true; G.state.flags.poeJoined = true; G.save(); });
    await p.goto(`${BASE}/?notut&dseed=1&hour=10`);
    await p.waitForFunction(() => window.__ready === true && window.G?.titleActive, null, { timeout: 90000 });
    await p.waitForFunction(() => window.G.ui.prewarm?.done === true, null, { timeout: 30000 }).catch(() => {});
    const pw = await p.evaluate(() => { const W = window.G.ui.prewarm; return W ? { done: W.done, left: W.left, ms: Math.round(W.ms), steps: W.steps, longest: +(W.longest || 0).toFixed(1) } : null; });
    R.check('the menu prewarm finishes on the title screen (its steps wait for moments that hide a hitch)', pw?.done && pw.steps > 50, pw);
    await p.click('[data-a="continue"]');
    await p.waitForFunction(() => !window.G.titleActive && window.G.mode === 'village' && !window.G.ui?.iris?.active, null, { timeout: 30000 });
    await p.evaluate(() => { const R = window.__mf = { f: [] }; const f = () => { R.f.push(performance.now()); requestAnimationFrame(f); }; requestAnimationFrame(f); addEventListener('keydown', () => { R.key = performance.now(); }, true); });
    const worst = (a, b) => p.evaluate(([a, b]) => { const F = window.__mf.f; let w = 0; for (let i = 1; i < F.length; i++) if (F[i] > a && F[i - 1] < b) w = Math.max(w, F[i] - F[i - 1]); return +w.toFixed(1); }, [a, b]); // (every frame overlapping the window)
    const now = () => p.evaluate(() => performance.now());
    let t = await now(); await p.waitForTimeout(3000); const play = await worst(t + 500, t + 3000); // (the first seconds of play: nothing heavy may run now)
    t = await now(); await p.waitForTimeout(1500); const idle = await worst(t, t + 1500);
    const lim = Math.max(FIRST_MS, idle + 40), rows = [];
    R.check(`the first seconds of play stay smooth after the title (worst frame ${play} ms ≤ ${lim} ms)`, play <= lim, { play, idle });
    for (const [id, key, name] of MENUS) {
      t = await now();
      if (key) await p.keyboard.press(key);
      else await p.evaluate(id => { const G = window.G; if (id === 'wheel') G.heroes.openWheel(); else if (id === 'shop') void G.openShop(); }, id);
      await p.waitForTimeout(800);
      const k = await p.evaluate(() => window.__mf.key || 0), a = key && k > t - 5 ? k : t;
      const w = await worst(a, a + 750), open = await p.evaluate(n => n === 'wheel' ? !!window.G.heroes.wheelOpen : n === 'build' ? !!window.G.build?.active : window.G.ui.isOpen(n), name);
      rows.push(`${id} ${w}${open ? '' : '(not open)'}`);
      const L = Math.max(lim, LIMIT[id] || 0);
      R.check(`first open of ${id}: the open's worst frame ${w} ms ≤ ${L} ms`, open && w <= L, { w, idle });
      await p.evaluate(id => { const G = window.G; if (id === 'wheel') G.heroes.wheel?.hide(); else if (id === 'build') { if (G.build?.active) G.build.exit(); } G.ui.closeAll(); }, id);
      await p.waitForTimeout(900);
    }
    R.note(`first opens (worst frame of the open, ms): ${rows.join(' · ')} · idle worst ${idle} ms`);
    await ctx.close();
  }
} catch (e) { errors.push('[s24] ' + (e.stack || e).toString().slice(0, 400)); }
await browser.close();
if (server) await server.close();
process.exit(R.finish(errors, warns) ? 1 : 0);
