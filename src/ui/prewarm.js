// Menu prewarm (ROADMAP R-8; ARCHITECTURE.md "Render health"). A menu's first open used to pay for its lazy setup on
// that frame: the panel's DOM and first style / layout pass, a font face's first use, its icons (canvas drawings
// encoded to PNG data URLs, cached per id: 2-50 ms each), the hero wheel's cards and the build palette's building
// thumbnails (a model template build, a render with the thumbnail lights, a pixel read-back and a PNG encode each:
// 20-70 ms, gfx/thumbs.js). After boot the same work is done ahead, in priority order (the HUD keys' panels and the
// active hero's icons first), as steps that each fill a cache the menus read:
//  - in moments that hide a hitch (ui.js hidesHitches: the title screen, a menu or dialogue that has finished opening),
//    about BUDGET ms of steps per tick (TITLE_BUDGET on the title, where nothing is played yet);
//  - in ordinary idle slots (requestIdleCallback) only the steps flagged tiny: most steps are bigger than an idle slot,
//    and one landing mid-play would be the very hitch this exists to remove.
// Nothing changes but when the work happens; a menu opened before its step ran builds itself as before (the build
// palette fills in missing thumbnails after it opens: world/buildMode.js).
//   G.ui.prewarm: { done, left, ms (busy time), steps, longest (the longest step, ms), doneAt, log: [[step, ms]] };
//   ?noprewarm skips it (A/B: tools/qa/menu-stutter.mjs AB=1)
import { HeroWheel } from './heroWheel.js';
import { skillList, skillIconURL, hotbarIconURL, itemIconURL, potionIconURL } from './rpg.js';
import { BUILDINGS, CATEGORIES } from '../world/buildings/index.js';

const OFF = typeof location !== 'undefined' && /[?&]noprewarm\b/.test(location.search);
const BUDGET = 18, TITLE_BUDGET = 40, TICK = 80; // (ms of steps per tick in a hidden moment, the tick interval)
const START_MS = 600; // after window.__ready (the boot splash fading)
const ric = typeof requestIdleCallback === 'function' ? f => requestIdleCallback(f, { timeout: 500 }) : f => setTimeout(() => f(null), 50);
// the face / weight combinations the panels use (ui/fonts.css): loaded early, a first open doesn't swap fonts and lay
// out twice
const FONTS = ['400 16px Fredoka', '600 16px Fredoka', '700 16px Fredoka', '500 16px "M PLUS Rounded 1c"', '700 16px "M PLUS Rounded 1c"', '800 16px "M PLUS Rounded 1c"'];
// panels whose render() needs no open() options
const RENDER = new Set(['inventory', 'character', 'skills', 'quests', 'map', 'menu', 'stash']);

export class Prewarm {
  constructor(ui) {
    this.ui = ui; this.off = OFF; this.done = OFF; this.ms = 0; this.steps = 0; this.longest = 0; this.doneAt = 0; this.log = [];
    this.queue = null; this.started = false; this.waiting = false;
  }
  get G() { return this.ui.G; }
  get left() { return this.queue ? this.queue.length : null; }
  start() {
    if (this.done || this.started) return;
    this.started = true;
    const wait = () => { if (window.__ready) setTimeout(() => this.loop(), START_MS); else setTimeout(wait, 150); };
    wait();
  }
  run([name, fn]) {
    const s = performance.now(); let p = null;
    try { p = fn(); } catch (e) { console.warn('[prewarm]', name, e); }
    const ms = performance.now() - s;
    this.steps++; this.ms += ms; this.longest = Math.max(this.longest, ms); this.log.push([name, +ms.toFixed(1)]);
    if (this.log.length > 400) this.log.splice(0, 200);
    if (p?.then) { this.waiting = true; p.catch(() => {}).finally(() => { this.waiting = false; }); } // (an async step: the next one waits for it)
  }
  loop() {
    if (this.done) return;
    this.queue ||= this.plan();
    const U = this.ui;
    if (U.ready && !this.waiting && !document.hidden && U.hidesHitches?.()) {
      const budget = U.mode === 'title' ? TITLE_BUDGET : BUDGET, t0 = performance.now();
      while (this.queue.length && !this.waiting && performance.now() - t0 < budget) this.run(this.queue.shift());
    } else if (this.queue[0]?.[2] && !this.waiting) { // (a tiny step: an idle slot will do)
      ric(d => { if (this.queue[0]?.[2] && (!d || d.timeRemaining() > 4)) this.run(this.queue.shift()); });
    }
    if (!this.queue.length && !this.waiting) { this.done = true; this.doneAt = performance.now(); return; }
    setTimeout(() => this.loop(), TICK);
  }
  /** Open a built panel once, all but invisible (0.4 % opacity, inert), with its real open animation: its first raster
   *  (the GPU shaders of its CSS filters and shadows at the animation's scales, its icons' image decodes, the paper
   *  texture) then happens here instead of in the frame it first opens, which used to take 100-450 ms on the GPU side
   *  with no script at all. It doesn't hold the queue: several panels may ghost at once on the title. */
  ghost(p) {
    if (p.isOpen || !p.wrap) return;
    const w = p.wrap; w.inert = true; w.style.opacity = '0.004'; w.style.display = ''; w.classList.add('opening');
    setTimeout(() => {
      w.inert = false; w.style.opacity = '';
      if (!p.isOpen) { w.classList.remove('opening'); w.style.display = 'none'; }
    }, 650); // (the open animation is 0.56 s)
  }
  plan() {
    const U = this.ui, G = this.G, st = G?.state || {}, Q = [];
    const add = (name, fn, tiny = false) => Q.push([name, fn, tiny]);
    const panel = (n) => {
      const p = U.panels[n]; if (!p) return;
      add('build:' + n, () => { if (p.built) return; p.build(); if (!p.isOpen) p.wrap.style.display = 'none'; });
      if (RENDER.has(n)) add('render:' + n, () => { if (p.isOpen) return; p.opts ||= {}; p.render(); if (n === 'map') p.draw?.(); });
      add('paint:' + n, () => this.ghost(p));
    };
    const icons = (name, list, fn, per) => { for (let i = 0; i < list.length; i += per) { const part = list.slice(i, i + per); add(name, () => { for (const x of part) fn(x); }); } };
    add('fonts', () => { for (const f of FONTS) document.fonts?.load?.(f, 'Aaあ').catch(() => {}); }, true);
    // 1. the active hero: the hotbar's and the K panel's icons; the bag, the worn gear (the I and C panels)
    const all = skillList(), hero = G?.player?.hero || st.activeHero || 'chewy';
    const mine = all.filter(s => s.raw?.cls === hero || s.cls === hero).map(s => s.id), others = all.map(s => s.id).filter(id => !mine.includes(id));
    add('icons:hotbar', () => { for (const id of ['attack', 'attack_ball', 'attack_staff', 'attack_fuma']) skillIconURL(id); hotbarIconURL('attack', G?.derived); });
    icons('icons:skills', mine, skillIconURL, 2);
    const items = [];
    for (const it of st.inventory || []) if (it) items.push(it);
    for (const h of Object.values(st.heroes || {})) for (const it of Object.values(h?.equipment || {})) if (it) items.push(it);
    for (const it of Object.values(st.equipment || {})) if (it) items.push(it);
    icons('icons:items', items, itemIconURL, 2);
    add('icons:potions', () => { for (const k of ['heart', 'zoom', 'rejuv']) potionIconURL(k); });
    // 2. the HUD keys' panels: I, C, K, J, M, Esc
    for (const n of ['inventory', 'character', 'skills', 'quests', 'map', 'menu']) panel(n);
    // 3. the stash and Rosie's shelf, the travel map, the hero wheel's cards (their 3D busts are rendered at boot)
    const shelf = []; for (const it of st.stash || []) if (it) shelf.push(it);
    try { for (const it of G?.shopStock?.() || []) if (it) shelf.push(it); } catch (e) { /* (no shop yet) */ }
    icons('icons:shelf', shelf, itemIconURL, 2);
    for (const n of ['shop', 'stash', 'travel']) panel(n);
    add('wheel', () => { const H = G?.heroes; if (!H || H.wheel) return; H.wheel = new HeroWheel(G, H); H.wheel.build(); });
    // 4. the build palette (B): its thumbnails' shaders compile off the main thread first, then one building a step
    const ids = G?.thumbs ? Object.entries(BUILDINGS).filter(([, b]) => CATEGORIES[b.cat] && !b.zone).map(([id]) => id) : [];
    panel('build');
    if (ids.length) add('thumb:programs', () => G.thumbs.warmPrograms?.(ids[0]));
    for (const id of ids) add('thumb:' + id, () => G.thumbs.get(id));
    add('paint:build+thumbs', () => { // (the palette with its thumbnails in: ~30 filtered images on its first frame otherwise)
      const p = U.panels.build; if (!p?.built || p.isOpen || !G.build?.catalog) return;
      p.opts = { categories: G.build.catalog() }; p.render(); this.ghost(p);
    });
    add('buildmode', () => { // (build mode's own first draw: the plot stakes, an instanced toon variant, and the need-icon sprites)
      const B = G?.build, S = G?.sim, R = G?.engine?.renderer, W = G?.village?.world;
      if (!B?.refreshStakes || !S?.showNeedIcons || !R?.compileAsync || !W || B.active) return;
      B.refreshStakes(); S.showNeedIcons(true); S.needIcons?.refresh?.();
      const st = B.stakes, ni = S.needIcons?.group; let p = null;
      if (st) st.visible = true; if (ni) ni.visible = true;
      try { p = R.compileAsync(W.scene, G.engine.camera); } finally { if (st) st.visible = !!B.active; S.showNeedIcons(false); if (ni) ni.visible = false; }
      return p?.catch(() => {});
    });
    // 5. the other heroes' skills (a hero switch, the wheel), the rest of the panels
    icons('icons:skills', others, skillIconURL, 2);
    for (const n of ['cook', 'craft', 'gift', 'seeds', 'houseCard']) panel(n);
    return Q;
  }
}
