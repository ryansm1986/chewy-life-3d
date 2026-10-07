// Phone memory check (docs/CONTROLS.md §12, ROADMAP CT-5): what the game asks of a phone's GPU and JS heap, since iOS
// Safari closes a tab that uses too much memory (an iPhone with 4 GB gives a page roughly 1–1.5 GB in all, an older
// 3 GB one less). It boots an 844×390 DPR 3 touch phone on the Mobile preset (or ?q=N with Q=N) and counts every WebGL
// allocation as the page makes it (an init script wraps the context: texImage*/texStorage* by format and size, the
// mip chains generateMipmap adds, renderbuffers with their samples, buffers; deletes subtract), then reports:
//   the village (10:00), a Burrow floor (B8 with its monsters), a fight there (60 more in packs on the hero, 6 s), then
//   two more Burrow trips back to back and a zone dungeon (Bamboo Depths 1), each followed by the village again (what
//   stays behind), with the textures', render targets' and buffers' MB, the largest textures, and after a full GC the JS
//   heap and the ArrayBuffers' memory (Runtime.getHeapUsage: geometry arrays kept in JS are most of the latter).
// It also checks the Mobile preset's memory diet still draws: in each Burrow, the geometries that let go of their arrays
// (core/deck.js releaseAfterUpload) and two frames' draw calls; at the end, a building template evicted from the cache
// is rebuilt and drawn. Screenshots: tools/qa/tmp/mobile-mem/burrow3.png, village4.png.
// The canvas's own back buffers (about 844×390×4×3 at pixel ratio 1) and the browser's DOM and image caches aren't in
// the WebGL count. Ceilings: MAX_MB (default 600) on the GPU total at any stop, and on the Mobile preset AB_MAX (default
// 400) on the ArrayBuffers in the fight; over either, or a page error, is a FAIL (exit 1).
//   usage: node tools/qa/mobile-mem.mjs    Q=4 (the preset)  MAX_MB=600  AB_MAX=400  BASE=http://localhost:5173
import { launchTouch, boot, waitMode, sleep } from './touch-lib.mjs';
import fs from 'node:fs';
import path from 'node:path';
const OUT = process.env.SHOT_DIR || path.resolve('tools/qa/tmp/mobile-mem'); fs.mkdirSync(OUT, { recursive: true });

const Q = +(process.env.Q ?? 4), MAX_MB = +(process.env.MAX_MB || 600), AB_MAX = +(process.env.AB_MAX || 400);
const MB = b => (b / 1048576).toFixed(1);

const { browser, context, page, errors, cdp } = await launchTouch();
await context.addInitScript(() => {
  const M = window.__gmem = { tex: 0, rb: 0, buf: 0, big: new Map() };
  const size = new WeakMap(), bound = new Map(), info = new WeakMap();
  // bytes per texel by internal format (WebGL2 enums); anything else counts as 4
  const BPP = { 0x8229: 1, 0x822B: 2, 0x8051: 3, 0x8058: 4, 0x8C43: 4, 0x881A: 8, 0x8814: 16, 0x822D: 2, 0x822E: 4, 0x822F: 4, 0x8230: 8, 0x8D62: 2, 0x81A5: 2, 0x81A6: 3, 0x8CAC: 4, 0x88F0: 4, 0x8CAD: 5, 0x1908: 4, 0x1907: 3, 0x1906: 1, 0x1909: 1, 0x190A: 2, 0x1902: 2, 0x8C3A: 4, 0x8C3D: 4, 0x8F97: 4 };
  for (const C of [globalThis.WebGL2RenderingContext, globalThis.WebGLRenderingContext].filter(Boolean)) {
    const P = C.prototype, o = {};
    for (const k of ['bindTexture', 'activeTexture', 'texImage2D', 'texStorage2D', 'texImage3D', 'texStorage3D', 'generateMipmap', 'deleteTexture', 'bindBuffer', 'bufferData', 'deleteBuffer', 'bindRenderbuffer', 'renderbufferStorage', 'renderbufferStorageMultisample', 'deleteRenderbuffer']) o[k] = P[k];
    const keyOf = (gl, target) => (gl.__unit || 0) * 100000 + (target >= 0x8515 && target <= 0x851A ? 0x8513 : target);
    const setTex = (gl, target, bytes, w, h, add) => {
      const t = bound.get(keyOf(gl, target)); if (!t) return;
      const prev = size.get(t) || 0, next = add ? prev + bytes : bytes;
      size.set(t, next); M.tex += next - prev; info.set(t, { w, h, b: next });
      if (next > 2e6) M.big.set(t, { w, h, b: next }); else M.big.delete(t);
    };
    P.activeTexture = function (u) { this.__unit = u - 0x84C0; return o.activeTexture.call(this, u); };
    P.bindTexture = function (target, t) { bound.set(keyOf(this, target), t); return o.bindTexture.call(this, target, t); };
    P.texImage2D = function (...a) {
      const [target, level, fmt] = a; let w, h;
      if (a.length >= 8) { w = a[3]; h = a[4]; } else { const s = a[5]; w = s?.videoWidth || s?.naturalWidth || s?.width || 0; h = s?.videoHeight || s?.naturalHeight || s?.height || 0; }
      const cube = target >= 0x8515 && target <= 0x851A;
      if (level === 0) setTex(this, target, w * h * (BPP[fmt] || 4), w, h, cube && target !== 0x8515);
      return o.texImage2D.apply(this, a);
    };
    P.texStorage2D = function (target, levels, fmt, w, h) {
      let b = 0; for (let l = 0, x = w, y = h; l < levels; l++, x = Math.max(1, x >> 1), y = Math.max(1, y >> 1)) b += x * y * (BPP[fmt] || 4);
      setTex(this, target, b * (target === 0x8513 ? 6 : 1), w, h, false);
      return o.texStorage2D.call(this, target, levels, fmt, w, h);
    };
    P.texImage3D = function (...a) { const [target, level, fmt, w, h, d] = a; if (level === 0) setTex(this, target, w * h * d * (BPP[fmt] || 4), w, h, false); return o.texImage3D.apply(this, a); };
    P.texStorage3D = function (target, levels, fmt, w, h, d) { setTex(this, target, w * h * d * (BPP[fmt] || 4) * (levels > 1 ? 4 / 3 : 1), w, h, false); return o.texStorage3D.call(this, target, levels, fmt, w, h, d); };
    P.generateMipmap = function (target) { const t = bound.get(keyOf(this, target)), i = t && info.get(t); if (i && !i.mip) { i.mip = true; setTex(this, target, Math.round(i.b / 3), i.w, i.h, true); } return o.generateMipmap.call(this, target); };
    P.deleteTexture = function (t) { if (t) { M.tex -= size.get(t) || 0; size.delete(t); M.big.delete(t); } return o.deleteTexture.call(this, t); };
    P.bindBuffer = function (target, b) { bound.set('b' + target, b); return o.bindBuffer.call(this, target, b); };
    P.bufferData = function (target, d, usage, ...r) { const b = bound.get('b' + target); if (b) { const n = typeof d === 'number' ? d : d?.byteLength || 0, prev = size.get(b) || 0; size.set(b, n); M.buf += n - prev; } return o.bufferData.call(this, target, d, usage, ...r); };
    P.deleteBuffer = function (b) { if (b) { M.buf -= size.get(b) || 0; size.delete(b); } return o.deleteBuffer.call(this, b); };
    P.bindRenderbuffer = function (target, r) { bound.set('r', r); return o.bindRenderbuffer.call(this, target, r); };
    const rbSet = (gl, n) => { const r = bound.get('r'); if (!r) return; const prev = size.get(r) || 0; size.set(r, n); M.rb += n - prev; };
    P.renderbufferStorage = function (target, fmt, w, h) { rbSet(this, w * h * (BPP[fmt] || 4)); return o.renderbufferStorage.call(this, target, fmt, w, h); };
    P.renderbufferStorageMultisample = function (target, s, fmt, w, h) { rbSet(this, w * h * (BPP[fmt] || 4) * Math.max(1, s)); return o.renderbufferStorageMultisample.call(this, target, s, fmt, w, h); };
    P.deleteRenderbuffer = function (r) { if (r) { M.rb -= size.get(r) || 0; size.delete(r); } return o.deleteRenderbuffer.call(this, r); };
  }
});

const rows = [];
const stop = async (name) => {
  await sleep(page, 1500);
  await cdp.send('HeapProfiler.collectGarbage').catch(() => {}); await sleep(page, 300); // (the heap after a full GC: what stays, not what is still to be swept)
  const r = await page.evaluate(() => {
    const M = window.__gmem, R = window.G?.engine?.renderer;
    const big = [...M.big.values()].sort((a, b) => b.b - a.b);
    return { tex: M.tex, rb: M.rb, buf: M.buf, heap: performance.memory?.usedJSHeapSize || 0, n: R?.info.memory.textures, g: R?.info.memory.geometries,
      big: big.slice(0, 6).map(t => `${t.w}×${t.h}`), nbig: big.length, bigB: big.reduce((s, t) => s + t.b, 0),
      preset: window.G?.engine?.preset, skins: big.filter(t => t.w === 2048).length };
  });
  const u = await cdp.send('Runtime.getHeapUsage').catch(() => ({}));
  r.v8 = u.usedSize || 0; r.ab = u.backingStorageSize || 0; // (performance.memory counts both)
  r.name = name; r.gpu = r.tex + r.rb + r.buf; rows.push(r);
  console.log(`  ${name.padEnd(9)} GPU ${MB(r.gpu).padStart(6)} MB (textures ${MB(r.tex)} · render buffers ${MB(r.rb)} · buffers ${MB(r.buf)}) | JS heap ${MB(r.v8)} MB + ArrayBuffers ${MB(r.ab)} MB | ${r.n} textures, ${r.g} geometries | textures over 2 MB: ${r.nbig} (${MB(r.bigB)} MB; ${r.skins} at 2048) ${r.big.join(' ')}`);
};

const toVillage = async () => { await page.evaluate(() => window.G.returnToVillage()); await waitMode(page, 'village', 40000); };
const toBurrow = async () => { await page.evaluate(() => window.G.enterDungeon(8)); await waitMode(page, 'dungeon', 40000); };
// a Burrow fight: 60 monsters in packs of 10 on the hero (as mobile-perf), the hero unkillable, for 6 s
const fight = () => page.evaluate(async () => {
  const G = window.G, D = G.dungeon, P = G.player, KINDS = ['mochi', 'dustbunny', 'kinoko', 'lantern', 'kasa', 'wisp', 'oni', 'tanuki'];
  D.warmMonsters?.(KINDS);
  const lvl = D.layout.mlvl || 10; let k = 0;
  const spot = () => { for (let i = 0; i < 80; i++) { const a = Math.random() * 6.283, r = 3 + Math.random() * 10, x = P.pos.x + Math.cos(a) * r, z = P.pos.z + Math.sin(a) * r; if (G.world.walkable(x, z)) return [x, z]; } return [P.pos.x + 2, P.pos.z + 2]; };
  for (let p = 0; p < 6; p++) { const id = KINDS[k % KINDS.length], rank = k++ % 3 === 2 ? 'champion' : 'normal', [cx, cz] = spot();
    for (let i = 0; i < 10; i++) { let x = cx + Math.cos(i * 2.4) * (0.6 + i * 0.25), z = cz + Math.sin(i * 2.4) * (0.6 + i * 0.25); if (!G.world.walkable(x, z)) { x = cx; z = cz; } const m = D.spawnMonster?.(id, { level: lvl, rank, x, z }); if (m) m.aggro = true; } }
  const t0 = performance.now();
  const S = G.state.player; S.lvl = Math.max(S.lvl || 1, 30); S.stats = { ...(S.stats || {}), vit: 400 }; G.actions.recompute(); // (the hero lasts the fight: full life every frame)
  await new Promise(res => { (function f() { S.life = null; if (performance.now() - t0 < 6000) requestAnimationFrame(f); else res(); })(); });
  return D.monsters.filter(m => m.alive).length;
});
// what is released (the Mobile preset) and that the scene still draws: chunk arrays gone, the frame drawn, no errors
const health = () => page.evaluate(async () => {
  const G = window.G, R = G.engine.renderer, sc = G.world.scene; let rel = 0, gone = 0;
  sc.traverse(o => { const g = o.geometry; if (!g?.userData?.released) return; rel++; if (g.attributes.position && g.attributes.position.array === null) gone++; });
  R.info.autoReset = false; R.info.reset(); // (two frames' draws, every pass)
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const calls = R.info.render.calls, tris = R.info.render.triangles; R.info.autoReset = true;
  return { released: rel, arraysGone: gone, calls, tris };
});

try {
  await boot(page, `fresh&nointro&notut&hour=10&q=${Q}&deck=0`);
  console.log(`mobile-mem: 844×390 at DPR 3, touch, preset ${await page.evaluate(() => window.G.engine.preset)} (Q=${Q})`);
  await page.evaluate(() => { const G = window.G; G.state.flags.burrowTut = true; G.ui.toasts?.retire?.(0); });
  await stop('village');
  await toBurrow(); await stop('burrow');
  const alive = await fight(); await stop('fight'); console.log(`    (the fight: ${alive} monsters alive; ${JSON.stringify(await health())})`);
  for (let trip = 1; trip <= 3; trip++) {
    await toVillage(); await stop('village ' + trip);
    if (trip < 3) { await toBurrow(); await stop('burrow ' + (trip + 1)); console.log(`    (burrow ${trip + 1}: ${JSON.stringify(await health())})`); if (trip === 2) await page.screenshot({ path: path.join(OUT, 'burrow3.png') }); }
  }
  await page.evaluate(() => window.G.enterDungeon({ id: 'bambooDepths', floor: 1 })); await waitMode(page, 'dungeon', 40000); await stop('zone');
  await toVillage(); await stop('village 4'); await page.screenshot({ path: path.join(OUT, 'village4.png') });
  // a building template evicted from the cache (the Mobile preset's cap) is rebuilt when a building needs it, and draws
  const rb = await page.evaluate(async () => {
    // (the game's own instance of the module: under the dev server an edited module is served with ?t=, a plain import would be another)
    const url = performance.getEntriesByType('resource').map(e => e.name).find(n => /\/src\/world\/buildings\/index\.js/.test(n)) || '/src/world/buildings/index.js';
    const B = await import(url), before = B.templateStats().all;
    const keys = []; for (let lv = 1; lv <= 3; lv++) for (let v = 0; v < 8; v++) keys.push([lv, v]);
    const miss = keys.find(([lv, v]) => !B.hasTemplate('home', lv, v)) || [3, 7];
    const m = B.buildModel('home', { level: miss[0], seed: miss[1] }), G = window.G, P = G.player;
    m.group.position.set(P.pos.x + 3, G.world.heightAt?.(P.pos.x + 3, P.pos.z) || 0, P.pos.z); G.world.scene.add(m.group);
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const R = G.engine.renderer; R.info.autoReset = false; R.info.reset(); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); const calls = R.info.render.calls; R.info.autoReset = true;
    G.world.scene.remove(m.group); B.releaseModel(m);
    return { before, after: B.templateStats().all, rebuilt: miss, calls };
  });
  console.log(`    (a template rebuilt after eviction: ${JSON.stringify(rb)})`);
} catch (e) { errors.push(String(e?.message || e)); }
await browser.close();
const worst = Math.max(0, ...rows.map(r => r.gpu)), worstAB = Math.max(0, ...rows.map(r => r.ab)), fightAB = rows.find(r => r.name === 'fight')?.ab || 0;
for (const e of errors) console.log('  ' + e.split('\n')[0]);
const abOk = Q !== 4 || fightAB <= AB_MAX * 1048576;
const ok = !errors.length && rows.length >= 8 && worst <= MAX_MB * 1048576 && abOk;
console.log(`${ok ? 'PASS' : 'FAIL'} mobile-mem: the most WebGL memory at a stop ${MB(worst)} MB (ceiling ${MAX_MB} MB); ArrayBuffers in the fight ${MB(fightAB)} MB${Q === 4 ? ` (ceiling ${AB_MAX} MB)` : ''}, the most at a stop ${MB(worstAB)} MB${errors.length ? `, ${errors.length} errors` : ''}`);
process.exit(ok ? 0 : 1);
