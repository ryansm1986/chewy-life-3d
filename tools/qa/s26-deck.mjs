// s26 — the Steam Deck profile (docs/CONTROLS.md §4 and §10, ROADMAP CT-3 and R-2):
//   a) a first start on a 1280×800 screen picks the Deck: the Deck preset (Medium density, pixel ratio 0.85, AO and
//      tilt-shift off, a 1536 sun shadow map over a tighter area, the particle cap at 0.6), the UI at 1.15 inside the
//      safe area, Settings › Graphics showing Deck
//   b) a 1280×720 screen is not a Deck: High, the UI at 1, no safe area
//   c) R-2: the saved Graphics preset applies at boot (Low: Low density, a 2048 shadow map, less grass); ?q= still wins
//   d) Settings › Graphics live: Deck turns AO off and shrinks the shadows, High brings them back, and a density change
//      says it follows at the next start
//   e) Settings › Frame cap: 40 draws ~40 frames a second and 60 ~60, Off every display refresh
//   f) the text floor: the HUD, the bag, the skill trees and build mode at 1280×800 have no text under 11 px (the full
//      sweep of every panel, with screenshots, is tools/qa/deck-ui.mjs)
import { chromium } from 'playwright-core';
import { BASE, makeReport, sleep } from './lib.mjs';

const R = makeReport('s26-deck');
const browser = await chromium.launch({ executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const errors = [], warns = [];
async function open(w, h) {
  const context = await browser.newContext({ viewport: { width: w, height: h }, screen: { width: w, height: h }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.routeWebSocket(/.*/, ws => { ws.onMessage(() => {}); });
  page.on('pageerror', e => errors.push(`[pageerror] ${e.message}`));
  page.on('console', m => { const t = m.text(); if (m.type() === 'error' && !/favicon|404 \(Not Found\)/.test(t)) errors.push(`[console.error] ${t}`); else if (m.type() === 'warning') warns.push(t); });
  return { context, page };
}
const go = async (page, qs) => { await page.goto(`${BASE}/?${qs}&dseed=1`, { waitUntil: 'load' }); await page.waitForFunction(() => window.__ready === true && window.G?.player, null, { timeout: 60000 }); await page.waitForTimeout(800); };
const profile = page => page.evaluate(() => {
  const G = window.G, E = G.engine, sun = G.world.sun, PARTICLE_BUDGET = G.particleBudget || {};
  let grass = 0; const gm = G.world.veg?.grassMat; G.world.scene.traverse(o => { if (o.isMesh && gm && o.material === gm) grass += o.isInstancedMesh ? o.count : (o.geometry.index?.count || o.geometry.attributes.position.count); });
  return { screen: [screen.width, screen.height], preset: E.preset, quality: E.quality, deck: E.deck, pr: +E.renderer.getPixelRatio().toFixed(3), ao: E.post.ao.enabled, tilt: E.post.tiltPass.enabled, shadow: sun.shadow.mapSize.x, ext: +sun.shadow.camera.right.toFixed(2),
    particles: PARTICLE_BUDGET.scale, uiScale: G.ui.settings.uiScale, settingsQ: G.ui.settings.quality, scale: +G.ui.scale.toFixed(3), deckUi: G.ui.root.classList.contains('deck-ui'), hudInset: getComputedStyle(document.querySelector('.l-hud')).top, grass };
});

try {
  // ---------------------------------------------------------------- a) the Deck picks itself
  const D = await open(1280, 800);
  await go(D.page, 'fresh&nointro&notut&hour=10');
  const pd = await profile(D.page);
  R.check('a) a first start on 1280×800 picks the Deck: the Deck preset (Medium density), pixel ratio 0.85, AO and tilt off, a 1536 shadow map, particles ×0.6, the UI at 1.15 in the safe area', pd.preset === 3 && pd.deck && pd.quality === 1 && pd.pr === 0.85 && !pd.ao && !pd.tilt && pd.shadow === 1536 && pd.ext < 34 && pd.particles === 0.6 && pd.uiScale === 1.15 && pd.settingsQ === 3 && pd.deckUi && pd.hudInset !== '0px', JSON.stringify(pd));
  await D.page.evaluate(() => { window.G.ui.open('menu'); window.G.ui.panels.menu.setView('settings'); }); await sleep(D.page, 400);
  const seg = await D.page.evaluate(() => ({ names: [...document.querySelectorAll('.p-menu .seg[data-k="quality"] button')].map(b => b.textContent), on: document.querySelector('.p-menu .seg[data-k="quality"] button.on')?.textContent, cap: [...document.querySelectorAll('.p-menu .seg[data-k="fpsCap"] button')].map(b => b.textContent) }));
  R.check('a) Settings › Graphics offers Low / Medium / High / Deck with Deck on, and a Frame cap row (Off / 60 / 40)', seg.names.join() === 'Low,Medium,High,Deck' && seg.on === 'Deck' && seg.cap.join() === 'Off,60,40', JSON.stringify(seg));
  await D.page.evaluate(() => window.G.ui.close('menu'));

  // ---------------------------------------------------------------- f) the text floor at 1280×800 (a few key views)
  const small = await D.page.evaluate(async () => {
    const G = window.G, out = [], wait = ms => new Promise(r => setTimeout(r, ms));
    const audit = (where, sel) => { for (const root of document.querySelectorAll(sel)) { const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); for (let n = w.nextNode(); n; n = w.nextNode()) { const t = n.textContent.trim(), el = n.parentElement; if (!t || !el || el.closest('svg, .jp, .chg-jp') || el.matches('.mm-n > span, .pc-lv > small')) continue; const r = el.getBoundingClientRect(); if (r.width < 1 || r.bottom < 0 || r.top > innerHeight) continue; let vis = true; for (let e = el; e && e !== document.body; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05) { vis = false; break; } } if (!vis) continue; const px = parseFloat(getComputedStyle(el).fontSize) * (el.currentCSSZoom ?? 1); if (px < 11) out.push(`${where}: ${el.className || el.tagName} ${px.toFixed(1)}px "${t.slice(0, 24)}"`); } } };
    audit('hud', '.l-hud');
    G.ui.open('inventory', { view: 'bag' }); await wait(500); audit('bag', '.p-inventory'); G.ui.close('inventory');
    G.ui.open('skills'); await wait(500); audit('skills', '.p-skills'); G.ui.close('skills');
    G.build.enter(); await wait(700); audit('build', '.p-build'); G.build.exit(); await wait(300);
    return out;
  });
  R.check('f) the HUD, bag, skill trees and build mode at 1280×800: no text under 11 px on screen (the 12 px floor at the Deck scale)', small.length === 0, small.slice(0, 8).join(' | '));

  // ---------------------------------------------------------------- d) Settings › Graphics live
  const live = await D.page.evaluate(async () => {
    const G = window.G, E = G.engine, sun = G.world.sun, toasts = []; const raw = G.ui.toast; G.ui.toast = (t, o) => { toasts.push(t); return raw.call(G.ui, t, o); };
    G.ui.setSetting('quality', 2); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const hi = { ao: E.post.ao.enabled, tilt: E.post.tiltPass.enabled, shadow: sun.shadow.mapSize.x, ext: sun.shadow.camera.right, pr: E.renderer.getPixelRatio(), deck: E.deck };
    G.ui.setSetting('quality', 3); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const dk = { ao: E.post.ao.enabled, tilt: E.post.tiltPass.enabled, shadow: sun.shadow.mapSize.x, ext: sun.shadow.camera.right, pr: E.renderer.getPixelRatio(), deck: E.deck, map: sun.shadow.map?.width ?? null };
    G.ui.toast = raw;
    return { hi, dk, toasts };
  });
  R.check('d) Settings › Graphics live: High turns AO and tilt on with the world\'s own shadows, Deck turns them off at 1536 over a tighter area; High says the density follows at the next start', live.hi.ao && live.hi.tilt && live.hi.shadow >= 2048 && live.hi.ext === 34 && !live.hi.deck && !live.dk.ao && !live.dk.tilt && live.dk.shadow === 1536 && live.dk.ext < 34 && live.dk.deck && live.toasts.some(t => /next start/.test(t)), JSON.stringify(live));

  // ---------------------------------------------------------------- e) the frame cap (the headless loop runs at 60 Hz)
  const cap = await D.page.evaluate(async () => {
    const G = window.G, E = G.engine, tick = E.tick.bind(E); let n = 0; E.tick = () => { n++; return tick(); };
    const count = async (v) => { G.ui.setSetting('fpsCap', v); await new Promise(r => setTimeout(r, 400)); n = 0; const t0 = performance.now(); await new Promise(r => setTimeout(r, 2000)); return +(n / ((performance.now() - t0) / 1000)).toFixed(1); };
    let raf = 0; await new Promise(res => { const t0 = performance.now(); const f = () => { raf++; if (performance.now() - t0 < 1000) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
    const off = await count(0), c40 = await count(2), c60 = await count(1); await count(0);
    E.tick = tick; return { raf, off, c40, c60 };
  });
  R.check('e) Settings › Frame cap: 40 draws ~40 frames a second and 60 ~60 (headless Chrome refreshes faster), Off all of them', cap.c40 >= 34 && cap.c40 <= 44 && cap.c60 >= 50 && cap.c60 <= 66 && cap.off >= Math.min(cap.raf * 0.8, 58), JSON.stringify(cap));
  await D.context.close();

  // ---------------------------------------------------------------- b) not a Deck
  const N = await open(1280, 720);
  await go(N.page, 'fresh&nointro&notut&hour=10');
  const pn = await profile(N.page);
  R.check('b) a first start on 1280×720 is not a Deck: High, the UI at 1, no safe area', pn.preset === 2 && !pn.deck && pn.quality === 2 && pn.shadow === 4096 && pn.ao && pn.uiScale === 1 && !pn.deckUi && pn.hudInset === '0px', JSON.stringify(pn));

  // ---------------------------------------------------------------- c) R-2: the saved preset at boot
  await N.page.evaluate(() => { const s = JSON.parse(localStorage.getItem('chewy3d.settings') || '{}'); s.quality = 0; localStorage.setItem('chewy3d.settings', JSON.stringify(s)); });
  await go(N.page, 'nointro&notut&hour=10');
  const pl = await profile(N.page);
  R.check('c) R-2: a saved Low applies at boot — Low density (less grass than High), a 2048 shadow map, no AO', pl.preset === 0 && pl.quality === 0 && pl.shadow === 2048 && !pl.ao && pl.settingsQ === 0 && pl.grass > 0 && pl.grass < pn.grass, JSON.stringify({ low: pl, highGrass: pn.grass }));
  await go(N.page, 'nointro&notut&hour=10&q=1');
  const pq = await profile(N.page);
  R.check('c) R-2: ?q= still wins over the saved preset (q=1: Medium)', pq.preset === 1 && pq.quality === 1 && pq.settingsQ === 1 && pq.grass > pl.grass && pq.grass < pn.grass, JSON.stringify(pq));
  await N.context.close();
} catch (e) { R.check('the run finished', false, String(e.message || e).split('\n')[0]); }

await browser.close();
process.exit(R.finish(errors, warns) ? 1 : 0);
