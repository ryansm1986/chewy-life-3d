// Phones and tablets (docs/CONTROLS.md §12, ROADMAP CT-5): the mobile layout and the touch side of the menus. The
// on-screen play controls are ui/touch.js; this is everything around them.
//  - The screen: .m-touch on the UI root on a touch-first screen (or while touch plays), .m-phone when its short side is
//    500 px or less, .m-tablet otherwise. The safe area (env(safe-area-inset-*), or ?safe=top,right,bottom,left for
//    the QA's fake notch) in --sa-t / -r / -b / -l: every UI layer keeps inside it (mobile.css).
//  - Menus on a phone (mobile.css): the panels, dialogue and tooltips at --m-pscale (0.86: the design's 14 px is 12 on
//    screen), fitted to the screen with their bodies scrolling inside, never off the top; their title, tabs and close
//    button at the bottom where the thumbs are; 44 px targets. A text floor raises anything still drawn under 12 px.
//    Two panels side by side (a shop or the stash beside the bag) take turns: a chip flips between them.
//  - Touch in the menus: a tap is the click (a tap on an item picks it up, a tap on a slot puts it down: ItemDrag's own
//    click flow), a drag drags it, a double-tap is the right-click (equip, use, assign, eat), a long press shows the
//    details (the hover tooltip) without clicking.
//  - The rotate overlay in portrait (the game pauses under it), full screen on the first tap where the browser allows
//    it (Android Chrome; an iPhone can't), and the audio unlocked on the first touch (audio.js listens for it).
import './mobile.css';
import { Actions } from '../core/actions.js';
import { Touch } from '../core/touch.js';
import { mobileLike } from '../core/deck.js';
import { el, clamp } from './dom.js';
import { glyph } from './glyphs.js';

const PSCALE = 0.86, FLOOR = 12.1, LONG_MS = 430, DOUBLE_MS = 330;
const FLOOR_SCOPE = '.l-panels .pw, .l-dlg, .tt-wrap, .pop-wrap, .tut-dock, .hero-wheel, .toasts, .reel, .m-flip';
const FLOOR_SKIP = /\bjp\b|\bkc\b|\bmm-n\b|\bpc-lv\b|\bph-jp\b/;

export class Mobile {
  constructor(ui) {
    this.ui = ui; this.portrait = false; this.phone = false; this.touchy = false;
    const R = ui.root;
    this.rotate = el('div', 'm-rotate');
    this.rotate.innerHTML = `<div class="mr-card"><div class="mr-phone"><i class="mr-scr">${glyph('paw')}</i></div><b>Turn your phone sideways</b><span>Pawhaven plays in landscape. Rotate your device and the adventure picks up right where you left it.</span></div>`;
    R.appendChild(this.rotate);
    this.flip = el('div', 'm-flip'); R.appendChild(this.flip);
    this.flip.addEventListener('click', e => { const b = e.target.closest('button[data-n]'); if (b) { this.front = b.dataset.n; this.pairs(true); ui.sfx('tab'); } });
    this.safeProbe = el('i', 'm-safe'); R.appendChild(this.safeProbe);
    const P = new URLSearchParams(location.search);
    const fake = (P.get('safe') || '').split(',').map(Number);
    this.fakeSafe = fake.length === 4 && fake.every(Number.isFinite) ? { t: fake[0], r: fake[1], b: fake[2], l: fake[3] } : null;
    addEventListener('resize', () => this.layout());
    addEventListener('orientationchange', () => setTimeout(() => this.layout(), 60));
    // the text floor follows the panels' re-renders (a MutationObserver, one pass a frame at most)
    // (only while the screen is touchy: a desktop pays nothing for it; layout() connects and disconnects it)
    this.mo = new MutationObserver(() => { this.floorDirty = true; });
    this.layout();
    this.gestures();
    // full screen on the first tap (a user gesture) on a touch-first screen that allows it; once, unless asked again
    addEventListener('touchend', () => this.firstTap(), { capture: true, passive: true });
  }
  get G() { return this.ui.G; }

  /** the safe area in CSS px: env(safe-area-inset-*) (viewport-fit=cover), or the QA's ?safe= */
  safe() {
    if (this.fakeSafe) return this.fakeSafe;
    const cs = getComputedStyle(this.safeProbe), px = v => parseFloat(v) || 0;
    return { t: px(cs.paddingTop), r: px(cs.paddingRight), b: px(cs.paddingBottom), l: px(cs.paddingLeft) };
  }
  layout() {
    const R = this.ui.root, W = innerWidth, H = innerHeight;
    this.ml = mobileLike(); // (cached: matchMedia and the URL once per layout, not every frame)
    const touchy = this.touchy = this.ml || Actions.device === 'touch';
    if (touchy !== !!this.moOn) {
      this.moOn = touchy;
      if (touchy) { const ui = this.ui; for (const L of [ui.layers.panels, ui.layers.dlg, ui.layers.over, ui.layers.msg]) this.mo.observe(L, { childList: true, subtree: true, characterData: true }); this.mo.observe(R, { childList: true }); } // (the hero wheel joins the root)
      else this.mo.disconnect();
    }
    const phone = this.phone = touchy && Math.min(W, H) <= 500;
    R.classList.toggle('m-touch', touchy); R.classList.toggle('m-phone', phone); R.classList.toggle('m-tablet', touchy && !phone);
    const sf = this.sf = this.safe(), st = R.style;
    for (const [k, v] of Object.entries(sf)) st.setProperty('--sa-' + k, v.toFixed(1) + 'px');
    // the menus' scale: 0.86 on a phone (14 design px = 12 on screen), at least that on a tablet
    const ps = this.pscale = !touchy ? this.ui.scale : phone ? PSCALE : Math.max(this.ui.scale, PSCALE);
    st.setProperty('--m-pscale', ps.toFixed(4));
    st.setProperty('--m-mscale', (touchy ? Math.max(this.ui.scale, 0.78) : this.ui.scale).toFixed(4));
    st.setProperty('--m-top', ((sf.t + 8) / ps).toFixed(1) + 'px'); st.setProperty('--m-bot', ((sf.b + 8) / ps).toFixed(1) + 'px');
    st.setProperty('--m-side', ((Math.max(sf.l, sf.r) + 8) / ps).toFixed(1) + 'px');
    const portrait = touchy && H > W * 1.05;
    if (portrait !== this.portrait) { this.portrait = portrait; R.classList.toggle('m-portrait', portrait); if (portrait) this.ui.tip?.hide?.(); }
    this.floorDirty = true;
  }

  // ---------------------------------------------------------------- per frame (UI.update)
  update() {
    if (this.touchy !== (this.ml || Actions.device === 'touch')) this.layout();
    if (this.phone) this.pairs();
    if (this.floorDirty && this.touchy) { this.floorDirty = false; this.floor(); }
    if (this.tipUntil && performance.now() > this.tipUntil) { this.tipUntil = 0; this.ui.tip.hide(); }
  }
  /** raise any text the menus still draw under 12 px (after the scale and mobile.css): an inline size on its element */
  floor() {
    const scopes = this.ui.root.querySelectorAll(FLOOR_SCOPE);
    for (const sc of scopes) {
      if (sc.offsetParent === null && getComputedStyle(sc).position !== 'fixed') continue;
      const w = document.createTreeWalker(sc, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        const e = n.parentElement; if (!e || !n.textContent.trim() || e.closest('svg')) continue;
        if (FLOOR_SKIP.test(e.className) || e.closest('.jp')) continue;
        const z = e.currentCSSZoom ?? zoomOf(e), fs = parseFloat(getComputedStyle(e).fontSize);
        if (fs * z < FLOOR - 0.05) e.style.fontSize = (FLOOR / z).toFixed(2) + 'px';
      }
    }
  }
  /** a phone has room for one panel at a time: a pair (a shop or the stash beside the bag) takes turns, a chip flips */
  pairs(force) {
    const ui = this.ui, open = ui._order.filter(n => ui.panels[n]?.isOpen && ui.panels[n].side !== 'bottom' && !ui.nonBlocking(n));
    const sig = open.join(',');
    if (!force && sig === this._pairSig) return;
    this._pairSig = sig;
    if (open.length < 2) { for (const n of Object.keys(ui.panels)) ui.panels[n].wrap?.classList.remove('m-back'); this.flip.classList.remove('on'); this.front = null; return; }
    const pair = open.slice(-2);
    if (!pair.includes(this.front)) this.front = pair.find(n => n !== 'inventory') || pair[1]; // (the shop or the stash first: the reason it opened)
    for (const n of Object.keys(ui.panels)) ui.panels[n].wrap?.classList.toggle('m-back', open.includes(n) && n !== this.front);
    const title = n => ui.panels[n].title || n;
    this.flip.innerHTML = pair.map(n => `<button data-n="${n}" class="${n === this.front ? 'on' : ''}">${glyph(ui.panels[n].icon || 'bag')}${title(n)}</button>`).join('');
    this.flip.classList.add('on');
  }

  // ---------------------------------------------------------------- touch in the menus
  gestures() {
    const ui = this.ui, R = ui.root;
    let lp = null, lastTap = null;
    const MENU = '.pw, .pop-wrap, .l-dlg, .hero-wheel, .tut-dock';
    R.addEventListener('click', e => {
      if (!this.phone) return;
      const tag = e.target.closest?.('.chg-tag'), chip = e.target.closest?.('.nd-chg'), d = ui.root.querySelector('.chg-drawer');
      if (d && tag) { d.classList.toggle('m-open'); ui.sfx('tab'); }
      else if (d && chip) d.classList.add('m-open');
    }, true);
    R.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'touch') return;
      if (this.tipUntil) { this.tipUntil = 0; ui.tip.hide(); }
      const t = e.target; if (!t.closest?.(MENU)) return;
      clearTimeout(lp?.timer);
      lp = { x: e.clientX, y: e.clientY, t, id: e.pointerId, fired: false };
      lp.timer = setTimeout(() => this.longPress(lp), LONG_MS);
    }, true);
    addEventListener('pointermove', e => { if (lp && e.pointerId === lp.id && Math.hypot(e.clientX - lp.x, e.clientY - lp.y) > 10) { clearTimeout(lp.timer); if (!lp.fired) lp = null; } }, { passive: true });
    addEventListener('pointerup', e => {
      if (!lp || e.pointerId !== lp.id) return;
      clearTimeout(lp.timer);
      const fired = lp.fired, t = lp.t, now = performance.now(); lp = null;
      if (fired) { this.eatClick = now + 700; return; }
      // a double-tap is the right-click: the panel's own context handler (equip, use, assign, eat, stash)
      const target = t.closest('.slot[data-c], .node, .pslot, .sh-item, .card, [data-id]');
      if (target && lastTap && lastTap.el === target && now - lastTap.t < DOUBLE_MS) {
        lastTap = null;
        if (ui.drag?.held) ui.drag.cancel();
        target.__synth = true;
        target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: e.clientX, clientY: e.clientY }));
        target.__synth = false;
      } else lastTap = target ? { el: target, t: now } : null;
    }, true);
    addEventListener('pointercancel', () => { clearTimeout(lp?.timer); lp = null; }, true);
    // the click a long press would end with (a buy, a learn) never happens; the browser's own long-press menu is blocked
    addEventListener('click', e => { if (this.eatClick && performance.now() < this.eatClick) { this.eatClick = 0; e.preventDefault(); e.stopImmediatePropagation(); } }, true);
    addEventListener('contextmenu', e => { if (Touch.fromTouch(e) && !e.target?.__synth && e.isTrusted) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
  }
  /** a long press: the element's hover tooltip, anchored by the finger, and no click when it lets go */
  longPress(lp) {
    const ui = this.ui, T = ui.tip;
    if (!lp || ui.drag?.dragging) return;
    lp.fired = true;
    if (ui.drag?.press) ui.drag.press = null; // (an item: no pick-up on release)
    T.x = Math.min(innerWidth - 20, lp.x); T.y = lp.y - 24;
    const chain = []; for (let e = lp.t; e && e !== ui.root && chain.length < 6; e = e.parentElement) chain.push(e);
    fire(lp.t, 'pointerover'); fire(lp.t, 'mouseover');
    for (const e of chain) { fire(e, 'mouseenter', false); fire(e, 'pointerenter', false); }
    if (T.on) { T.place(); this.tipUntil = performance.now() + 5000; Touch.buzz(8); }
  }

  // ---------------------------------------------------------------- full screen
  /** the first tap on a touch-first screen asks for full screen (Android Chrome; iOS has no such API on a phone) */
  firstTap() {
    if (this.fsAsked || !mobileLike()) return;
    this.fsAsked = true;
    if (navigator.webdriver && !new URLSearchParams(location.search).has('fs')) return; // (the QA's browsers: no full screen unless ?fs)
    if (this.ui.settings.mobileFullscreen === false) return;
    this.fullscreen(true);
  }
  fullscreen(on) {
    const d = document, el = d.documentElement;
    try {
      if (on && !d.fullscreenElement && d.fullscreenEnabled && el.requestFullscreen && !globalThis.pawhaven?.desktop) {
        el.requestFullscreen({ navigationUI: 'hide' }).then(() => screen.orientation?.lock?.('landscape').catch(() => {})).catch(() => {});
      } else if (!on && d.fullscreenElement) d.exitFullscreen?.().catch(() => {});
    } catch (e) { /* not allowed here */ }
  }
}

function fire(e, type, bubbles = true) {
  const Ev = type.startsWith('pointer') && typeof PointerEvent === 'function' ? PointerEvent : MouseEvent;
  try { e.dispatchEvent(new Ev(type, { bubbles, cancelable: true, view: window, relatedTarget: null })); } catch (x) { /* */ }
}
/** an element's effective CSS zoom (the browsers without currentCSSZoom) */
function zoomOf(e) { let z = 1; for (let p = e; p && p !== document.body; p = p.parentElement) { const v = parseFloat(getComputedStyle(p).zoom); if (v > 0 && v !== 1) z *= v; } return z; }
void clamp;
