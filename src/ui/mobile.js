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
//  - CT-6, iPad and itch (CONTROLS §12.9, ITCH.md "Mobile"): the "back to full screen?" card when full screen closes during
//    play (one tap re-asks; "Stay in a window" is remembered; never more than twice a minute), nothing to touch in the top
//    24 px while in full screen (the browser's swipe-down exit), the "zoomed in?" card (a viewport reset first where the
//    page is the top frame; a pinch is let through while it shows), room kept for itch.io's own buttons over the frame
//    (Settings › Controls › Touch › itch.io buttons) and for the part of the frame off the page. (The save when the page
//    is hidden or closed moved to core/autosave.js, for every platform.)
import './mobile.css';
import { Actions } from '../core/actions.js';
import { Touch } from '../core/touch.js';
import { mobileLike } from '../core/deck.js';
import { el, clamp } from './dom.js';
import { glyph } from './glyphs.js';

const PSCALE = 0.86, FLOOR = 12.1, LONG_MS = 430, DOUBLE_MS = 330;
const FLOOR_SCOPE = '.l-panels .pw, .l-dlg, .tt-wrap, .pop-wrap, .tut-dock, .hero-wheel, .toasts, .reel, .m-flip';
const FLOOR_SKIP = /\bjp\b|\bkc\b|\bmm-n\b|\bpc-lv\b|\bph-jp\b/;
// CT-6. EDGE_TOP: in full screen nothing to touch in the top 24 px (iPadOS exits full screen on a swipe down from there).
// ITCH: itch.io's own buttons over an embedded game, in the frame's CSS px, measured on itch's game page (2026-10-08,
// game.css and the page's markup; ITCH.md "Mobile"): a column of three action buttons ("View all by …", "Follow …",
// "Add To Collection") 10 px in from the page's top right, 21 px tall, 10 apart, up to 158 px wide (25 tall, 183 wide
// when the page is wider than 1300 px, where the column is fixed and follows the scroll). The game frame starts 20 px down
// the page, so the column covers its top 74 px (94 on the wider page). The column only floats over the game from 960 px
// wide (narrower pages put it in a bar above). itch's "Fullscreen button" is 30 px at the frame's bottom right, 8 px in.
const EDGE_TOP = 24, ITCH = { top: 80, topWide: 100, side: 200, corner: 28 }, ZOOM_VIS = 0.75, CLIP_MIN = 0.6;
const FS_SVG = `<svg viewBox="0 0 120 90" class="mh-svg"><rect x="14" y="10" width="92" height="70" rx="12" fill="#fffdf8" stroke="#4a2c2a" stroke-width="5"/><rect x="24" y="20" width="72" height="50" rx="6" fill="#bff0ff"/>
  <g class="mh-arr" fill="none" stroke="#ff8fb0" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><path d="M34 40V30h10M86 40V30H76M34 50v10h10M86 50v10H76"/></g><circle cx="60" cy="45" r="7" fill="#ffcf4a" stroke="#4a2c2a" stroke-width="3"/></svg>`;
const PINCH_SVG = `<svg viewBox="0 0 120 90" class="mh-svg"><rect x="14" y="10" width="92" height="70" rx="12" fill="#fffdf8" stroke="#4a2c2a" stroke-width="5"/><rect x="24" y="20" width="72" height="50" rx="6" fill="#ffe3ec"/>
  <g class="mh-f1"><circle cx="38" cy="58" r="9" fill="#ffd6b8" stroke="#4a2c2a" stroke-width="3.5"/></g><g class="mh-f2"><circle cx="82" cy="32" r="9" fill="#ffd6b8" stroke="#4a2c2a" stroke-width="3.5"/></g>
  <path d="M50 48l8-6M70 42l-8 6" fill="none" stroke="#ff8fb0" stroke-width="5" stroke-linecap="round"/></svg>`;

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
    // CT-6: where the game runs. Embedded: inside another page's iframe (itch's). On itch: its CDN's host, the itch build's
    // flag (tools/build-itch.mjs) or the QA's ?itch, inside a frame
    this.embedded = (() => { try { return window.self !== window.top; } catch (e) { return true; } })();
    this.itch = this.embedded && (/(^|\.)itch\.(zone|io)$/i.test(location.hostname) || import.meta.env.VITE_ITCH === '1' || P.has('itch'));
    this.hold = null; this.vis = null; this.edgeTop = 0; this.zoomTried = 0; this.fsLosses = [];
    this.fsNow = this.fsLike(); this.fsWas = this.fsNow;
    this.cards();
    // (CT-7: a resize, rotation or full screen measures the visible part of the frame afresh: reseen())
    addEventListener('resize', () => { this.reseen(); this.layout(); this.fsSoon(); });
    addEventListener('orientationchange', () => { this.reseen(); setTimeout(() => this.layout(), 60); this.fsSoon(); });
    for (const n of ['fullscreenchange', 'webkitfullscreenchange']) document.addEventListener(n, () => { this.reseen(); this.fsSoon(120); });
    for (const n of ['resize', 'scroll']) globalThis.visualViewport?.addEventListener(n, () => { this.zoomCheck(); if (this.hold === 'zoom') this.placeHold(); });
    // the part of the frame the page shows (an itch frame wider than an iPad, scrolled, or the page zoomed in)
    if (this.embedded && typeof IntersectionObserver === 'function') {
      this.io = new IntersectionObserver(es => { const r = es[es.length - 1].intersectionRect; this.vis = { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; this.layout(); this.zoomCheck(); if (this.hold === 'zoom') this.placeHold(); },
        { threshold: Array.from({ length: 41 }, (_, i) => i / 40) });
      this.io.observe(document.documentElement);
    }
    // full screen that closed while the page was away asks again when it's back (the save when the page is hidden or
    // closed is core/autosave.js's, on every platform: iOS Safari doesn't always send beforeunload)
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.fsSoon(); });
    ui.onSetting?.(k => { if (k === 'itchInset' || k === 'touchFs') this.layout(); });
    // the text floor follows the panels' re-renders (a MutationObserver, one pass a frame at most)
    // (only while the screen is touchy: a desktop pays nothing for it; layout() connects and disconnects it)
    this.mo = new MutationObserver(() => { this.floorDirty = true; });
    this.layout();
    this.gestures();
    // full screen on the first tap (a user gesture) on a touch-first screen that allows it; once, unless asked again
    addEventListener('touchend', () => this.firstTap(), { capture: true, passive: true });
  }
  get G() { return this.ui.G; }

  /** CT-7: the IntersectionObserver only reports when the visible fraction crosses a threshold, so a frame that grows
   *  while staying wholly visible (itch's frame put in full screen: 1280 × 720 → the iPad's 1366 × 1024) kept the old
   *  rect, and the HUD kept clear of a strip that wasn't there (the right 86 px and the bottom 304). The old rect is
   *  dropped on a resize, rotation or full-screen change, and observing again reports the new one */
  reseen() {
    if (!this.io) return;
    this.vis = null;
    try { this.io.unobserve(document.documentElement); this.io.observe(document.documentElement); } catch (e) { /* */ }
  }
  /** the device's safe area in CSS px: env(safe-area-inset-*) (viewport-fit=cover), or the QA's ?safe= */
  deviceSafe() {
    if (this.fakeSafe) return { ...this.fakeSafe };
    const cs = getComputedStyle(this.safeProbe), px = v => parseFloat(v) || 0;
    return { t: px(cs.paddingTop), r: px(cs.paddingRight), b: px(cs.paddingBottom), l: px(cs.paddingLeft) };
  }
  /** what every touch layer keeps out of (--sa-t / r / b / l; ui/touch.js lays out inside it too): the device's safe area,
   *  plus on touch (CT-6) the full-screen top edge, the part of an embedded frame the page doesn't show, and itch.io's
   *  buttons over the frame. Each side is the largest of them (they are all measured from the frame's edge) */
  safe() {
    const s = this.deviceSafe();
    if (!this.touchy) return s;
    const W = innerWidth, H = innerHeight, v = this.vis;
    let clipT = 0;
    // the part of the frame off the page: not in full screen (the frame is the screen), and never a rect bigger than the
    // frame (one measured before a resize)
    if (v && !this.fsNow && v.width <= W + 2 && v.height <= H + 2 && v.width >= W * CLIP_MIN && v.height >= H * CLIP_MIN) {
      clipT = Math.max(0, v.top);
      s.l = Math.max(s.l, v.left); s.t = Math.max(s.t, clipT); s.r = Math.max(s.r, W - v.right); s.b = Math.max(s.b, H - v.bottom);
    }
    const it = this.itchInset(W, H, clipT);
    for (const k of ['t', 'r', 'b', 'l']) s[k] = Math.max(s[k], it[k]);
    s.t = Math.max(s.t, this.edgeTop);
    this.itchBox = it;
    return s;
  }
  /** room for itch.io's buttons over the frame (ITCH above). Settings › Controls › Touch › itch.io buttons: Auto (0: on
   *  itch, in a frame on the page) · Top (1) · Side (2) · Off (3), for when itch moves them */
  itchInset(W, H, clipT = 0) {
    const m = this.ui.settings?.itchInset ?? 0, o = { t: 0, r: 0, b: 0, l: 0 };
    if (m === 3) return o;
    if (m === 1) { o.t = ITCH.topWide; o.b = ITCH.corner; return o; }
    if (m === 2) { o.r = ITCH.side; return o; }
    if (!this.itch || this.fsNow) return o; // (full screen: nothing of itch's shows over the game)
    const sl = Math.max(screen.width, screen.height), v = this.vis;
    // the page is the device's width (Safari's window: the screen's long side in landscape). itch's maximized frame is the
    // whole window wide and sits over its buttons; a frame on the page has them over its top right from 960 px
    const filling = Math.abs(W - sl) <= 2;
    if (!filling && sl >= 960) o.t = sl > 1300 ? clipT + ITCH.topWide : ITCH.top;
    // a frame wider than the screen (1280 on a 1180 iPad): itch puts it at the page's left, so the rest is off the right
    // edge. (The IntersectionObserver can't always see this: a browser may widen the page's layout viewport to the frame)
    const sw = W > H ? sl : Math.min(screen.width, screen.height), over = W - sw;
    if (!filling && over > 2 && over < W * 0.4) o.r = over;
    // itch's Fullscreen button, bottom right, unless that corner is off the page anyway
    if (!(v && (W - v.right > 30 || H - v.bottom > 30))) o.b = ITCH.corner;
    return o;
  }
  layout() {
    const R = this.ui.root, W = innerWidth, H = innerHeight;
    this.ml = mobileLike(); // (cached: matchMedia and the URL once per layout, not every frame)
    const touchy = this.touchy = this.ml || Actions.device === 'touch';
    this.edgeTop = touchy && this.fsNow ? EDGE_TOP : 0;
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
    R.classList.toggle('m-itch', !!this.itch); R.classList.toggle('m-fs', !!this.fsNow);
    this.floorDirty = true;
    const sig = Object.values(sf).map(n => n.toFixed(0)).join(',');
    if (sig !== this._sfSig) { this._sfSig = sig; if (this.ui.touch) this.ui.touch.layoutT = 0; } // (the touch controls lay out again in the new safe area)
  }

  // ---------------------------------------------------------------- CT-6: full screen, zoom (the cards that pause)
  cards() {
    const R = this.ui.root;
    this.holdEl = el('div', 'm-hold');
    this.holdEl.innerHTML = `
      <div class="mh-card mh-fs">${FS_SVG}<b>Back to full screen?</b><span>Full screen closed, so Pawhaven is paused. One tap takes you back.</span>
        <div class="mh-btns"><button class="btn mh-btn mh-go" data-a="fs">${glyph('play')}Full screen</button><button class="btn mh-btn" data-a="window">Stay in a window</button></div>
        <em>Tip: a swipe down from the very top edge closes full screen. Settings › Controls › Touch changes this.</em></div>
      <div class="mh-card mh-zoom">${PINCH_SVG}<b>Zoomed in?</b><span class="mh-z1">Pinch two fingers together on the screen to zoom back out. Pawhaven waits for you.</span>
        <span class="mh-z2">Can't see all of Pawhaven? Pinch two fingers together to zoom the page back out, or scroll it so the game fits.</span>
        <div class="mh-btns"><button class="btn mh-btn" data-a="play">Play on</button></div></div>`;
    R.appendChild(this.holdEl);
    this.holdEl.addEventListener('click', e => {
      const b = e.target.closest('button[data-a]'); if (!b) return;
      this.ui.sfx?.('tab');
      const a = b.dataset.a;
      if (a === 'fs') {
        this.fsAsked = true;
        this.fullscreen(true).then(ok => { if (!ok && this.hold === 'fs') { this.setHold(null); this.ui.toast?.('Full screen isn\'t allowed here, so Pawhaven plays in the window.', { icon: 'eye' }); } });
      } else if (a === 'window') {
        this.ui.setSetting('touchFs', 1); this.setHold(null);
        this.ui.toast?.('Playing in a window. Settings › Controls › Touch › Full screen brings it back.', { icon: 'eye' });
      } else if (a === 'play') { this.zoomDismissed = true; this.setHold(null); }
    });
  }
  /** pause under a card ('fs', 'zoom') or carry on (null); the zoom card lets a pinch through to the page (index.html) */
  setHold(k) {
    if (k === this.hold) return;
    this.hold = k;
    const R = this.ui.root;
    R.classList.toggle('m-hold-fs', k === 'fs'); R.classList.toggle('m-hold-zoom', k === 'zoom');
    document.documentElement.classList.toggle('pinch-ok', k === 'zoom');
    if (k) { this.ui.touch?.releaseAll?.(true); Touch.releaseAll(); this.ui.tip?.hide?.(); }
    this.placeHold();
  }
  /** the zoom card covers the part of the page on screen, drawn at its normal size whatever the zoom: the top frame's
   *  visual viewport, or the part of the frame the zoomed page shows (its zoom about the screen's width over that part) */
  placeHold() {
    let x = 0, y = 0, w = innerWidth, h = innerHeight, k = 1;
    const vv = globalThis.visualViewport, v = this.vis;
    if (this.hold === 'zoom' && !this.embedded && vv) { x = vv.offsetLeft; y = vv.offsetTop; w = vv.width; h = vv.height; k = 1 / Math.max(1, vv.scale); }
    else if (this.hold === 'zoom' && v && v.width > 0) { x = v.left; y = v.top; w = v.width; h = v.height; k = clamp(v.width / (innerWidth > innerHeight ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height)), 0.35, 1); }
    const S = this.holdEl.style;
    S.left = x.toFixed(1) + 'px'; S.top = y.toFixed(1) + 'px'; S.width = w.toFixed(1) + 'px'; S.height = h.toFixed(1) + 'px';
    S.setProperty('--mh-k', k.toFixed(3));
  }
  /** in full screen: ours (the Fullscreen API), or the whole frame the screen's size (itch put the frame in full screen) */
  fsLike() {
    const d = document;
    if (d.fullscreenElement || d.webkitFullscreenElement) return true;
    if (!this.embedded) return false;
    const sl = Math.max(screen.width, screen.height), ss = Math.min(screen.width, screen.height);
    return Math.abs(Math.max(innerWidth, innerHeight) - sl) <= 2 && Math.abs(Math.min(innerWidth, innerHeight) - ss) <= 2;
  }
  canFs() { const d = document, e = d.documentElement; return !!((d.fullscreenEnabled || d.webkitFullscreenEnabled) && (e.requestFullscreen || e.webkitRequestFullscreen)) && !globalThis.pawhaven?.desktop; }
  /** look again once a resize or rotation has settled (a rotation passes through odd sizes) */
  fsSoon(ms = 450) { clearTimeout(this.fsT); this.fsT = setTimeout(() => this.fsCheck(), ms); }
  fsCheck() {
    const fs = this.fsLike();
    if (fs !== this.fsNow) { this.fsNow = fs; this.layout(); }
    if (fs) { this.fsWas = true; this.fsPending = false; if (this.hold === 'fs') this.setHold(null); return; }
    if (this.fsWas) { this.fsWas = false; this.fsPending = true; }
    if (!this.fsPending || document.hidden || !this.touchy || this.portrait) return; // (asked once the page is back and level)
    this.fsPending = false;
    if (this.ui.settings.touchFs === 1 || this.fsMuted || !this.canFs() || this.hold) return;
    // never a loop: a third close within a minute means the player wants the window, for this visit
    const now = performance.now(); this.fsLosses = this.fsLosses.filter(t => now - t < 60000); this.fsLosses.push(now);
    if (this.fsLosses.length >= 3) { this.fsMuted = true; this.ui.toast?.('Playing in the window. Settings › Controls › Touch › Full screen asks again.', { icon: 'eye' }); return; }
    this.setHold('fs');
  }
  /** zoomed in: the top frame's visual viewport over 1.01, or (in a frame) the page shows under 3/4 of it each way */
  zoomState() {
    if (!this.embedded) { const s = globalThis.visualViewport?.scale ?? 1; return s > 1.01 ? 'top' : null; }
    const v = this.vis, W = innerWidth, H = innerHeight;
    return v && v.width > 0 && v.height > 0 && v.width < W * ZOOM_VIS && v.height < H * ZOOM_VIS ? 'frame' : null;
  }
  zoomCheck() {
    const z = this.zoomState();
    if (!z) { this.zoomTried = 0; this.zoomDismissed = false; if (this.hold === 'zoom') this.setHold(null); return; }
    if (!this.touchy || this.hold || this.zoomDismissed || this.portrait) return;
    // the top frame: a viewport reset first (the viewport meta changed and put back), then the card if it didn't work
    if (z === 'top' && this.zoomTried < 1) { this.zoomTried++; this.resetZoom(); clearTimeout(this.zoomT); this.zoomT = setTimeout(() => this.zoomCheck(), 400); return; }
    this.holdEl.classList.toggle('frame', z === 'frame');
    this.setHold('zoom');
  }
  resetZoom() {
    const m = document.querySelector('meta[name="viewport"]'); if (!m) return;
    const c = m.getAttribute('content');
    this.zoomResets = (this.zoomResets || 0) + 1;
    m.setAttribute('content', 'width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover');
    requestAnimationFrame(() => requestAnimationFrame(() => m.setAttribute('content', c)));
  }

  // ---------------------------------------------------------------- per frame (UI.update)
  update() {
    if (this.touchy !== (this.ml || Actions.device === 'touch')) this.layout();
    if (this.phone) this.pairs();
    if (this.floorDirty && this.touchy) { this.floorDirty = false; this.floor(); }
    if (this.touchy && !this.phone && this.ui._order.length && (this._fitN = (this._fitN || 0) + 1) % 3 === 0) this.fitTall();
    if (this.tipUntil && performance.now() > this.tipUntil) { this.tipUntil = 0; this.ui.tip.hide(); }
    // CT-6: the zoom and full screen, twice a second (the events cover most of it; this catches what they miss)
    if (this.touchy && (this._ct6 = (this._ct6 || 0) + 1) % 30 === 0) { this.zoomCheck(); if (this.fsPending || this.fsLike() !== this.fsNow) this.fsCheck(); }
  }
  /** CT-7: a tablet's panel taller than the screen (Settings and Controls on an iPad; a foldable or a phone-sized tablet)
   *  gets .m-fit: it sits between the safe area's margins with its body scrolling inside, as a phone's panels do
   *  (mobile.css). A panel that fits keeps its own layout. Its natural height is its box plus what its body scrolls */
  fitTall() {
    const ui = this.ui, sf = this.sf || this.safe(), H = innerHeight;
    for (const n of ui._order) {
      const P = ui.panels[n], w = P?.wrap;
      if (!w || !P.isOpen || P.side === 'bottom' || !P.panel || !P.body) continue;
      const fit = w.classList.contains('m-fit'), z = P.panel.currentCSSZoom ?? this.pscale ?? 1;
      const nat = (P.panel.offsetHeight + (fit ? P.body.scrollHeight - P.body.clientHeight : 0)) * z;
      // where it would sit unfitted: centred 20 px (40 at the sides) above the middle (style.css .pw.side-*)
      const cy = H / 2 - (P.side === 'center' ? 20 : 40) * z, over = cy - nat / 2 < sf.t + 8 || cy + nat / 2 > H - sf.b - 8;
      if (over !== fit) w.classList.toggle('m-fit', over);
    }
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
    // a tap is a click, not a hover: the tooltip its compat mouseover opened (a palette card's, a slot's) closes once the
    // click is through, so it never stays over the room, the edit buttons or a guide's spotlight (R-13). A long press
    // shows it on purpose (tipUntil; its click is eaten before this)
    R.addEventListener('click', e => { if (Touch.fromTouch(e) && !this.tipUntil) setTimeout(() => { if (!this.tipUntil) ui.tip.hide(); }, 0); }, true);
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
    if (this.ui.settings.mobileFullscreen === false || this.ui.settings.touchFs === 1) return; // (Settings › Controls › Touch › Full screen: Off)
    this.fullscreen(true);
  }
  /** → a promise of whether it went (or was already) full screen. iPadOS before 16.4 has only the webkit-prefixed call,
   *  which returns nothing: the fullscreenchange that follows tells */
  fullscreen(on) {
    const d = document, el = d.documentElement, cur = d.fullscreenElement || d.webkitFullscreenElement;
    try {
      const req = el.requestFullscreen || el.webkitRequestFullscreen;
      if (on && !cur && this.canFs() && req) {
        return Promise.resolve(req.call(el, { navigationUI: 'hide' })).then(() => { screen.orientation?.lock?.('landscape').catch(() => {}); return true; }, () => false);
      } else if (!on && cur) (d.exitFullscreen || d.webkitExitFullscreen)?.call(d)?.catch?.(() => {});
    } catch (e) { /* not allowed here */ }
    return Promise.resolve(on ? !!cur : true);
  }
}

function fire(e, type, bubbles = true) {
  const Ev = type.startsWith('pointer') && typeof PointerEvent === 'function' ? PointerEvent : MouseEvent;
  try { e.dispatchEvent(new Ev(type, { bubbles, cancelable: true, view: window, relatedTarget: null })); } catch (x) { /* */ }
}
/** an element's effective CSS zoom (the browsers without currentCSSZoom) */
function zoomOf(e) { let z = 1; for (let p = e; p && p !== document.body; p = p.parentElement) { const v = parseFloat(getComputedStyle(p).zoom); if (v > 0 && v !== 1) z *= v; } return z; }
