// The reel bar (docs/HOMESTEAD.md §3): a little cozy card beside the player while a fish fights. A water-filled
// capsule with the fish (its silhouette until it's in the Fish Log) darting up and down, the mint catch zone the
// player lifts by holding F / LMB (the pad: A or RT; touch: a finger anywhere on the screen), and a catch meter that
// fills while the fish is in the zone. The physics live in life/reelSim.js; this only draws a ReelSim.
// R-12 (the owner's "I can't see the mechanic, especially on mobile"):
//  - the card is placed where nothing covers it: beside the hero and the float, clear of the guide's dock, the HUD's
//    corners, the toasts and (on touch) the stick; it is a size a phone can read (the text never under 12 px);
//  - the first reels show a little "how to": a thumb (touch), the F key (keyboard) or the A button (pad) pressing and
//    letting go, with "Hold ▲" / "Let go ▼";
//  - the cue at the float: a big "!" with what to press when it bites, "Not yet…" for an early press, "Missed!" when
//    it gets back to nibbling. While a session runs the ui root has .fishing (touch fades the controls it doesn't use).
// Transforms are written only when they change.
import { el } from './dom.js';
import { glyph } from './glyphs.js';
import { keyCap } from './padGlyphs.js';

const BH = 236; // bar height (px at UI scale 1)
const THUMB = '<svg viewBox="0 0 40 52" class="rh-thumb"><path d="M9 50 L9 20 Q9 6 20 6 Q31 6 31 20 L31 50 Z" fill="#ffd9c2" stroke="#4a2c2a" stroke-width="3"/><path d="M14 20 Q14 11 20 11 Q26 11 26 20 Q26 25 20 25 Q14 25 14 20 Z" fill="#fff4ee" stroke="#4a2c2a" stroke-width="2"/></svg>';

export class ReelBar {
  constructor(ui, layer) {
    this.ui = ui; this.layer = layer;
    const r = this.root = el('div', 'reel');
    r.innerHTML = `<div class="rl-card">
      <div class="rl-head"><span class="rl-ex">!</span><b class="rl-name">???</b></div>
      <div class="rl-body">
        <div class="rl-bar"><i class="rl-bub b1"></i><i class="rl-bub b2"></i><i class="rl-bub b3"></i><i class="rl-weed w1"></i><i class="rl-weed w2"></i>
          <div class="rl-zone"><i class="rl-zg"></i></div><div class="rl-fish"><img alt=""></div></div>
        <div class="rl-meter"><i class="rl-fill"></i><b class="rl-star">${glyph('star')}</b></div>
      </div>
      <div class="rl-hint"><span class="rl-keys kbm-only"><span class="kc sm">F</span><span class="rl-or">or</span>${glyph('mouseL')}</span><span class="rl-keys pad-only">${keyCap('interact', { sm: true })}<span class="rl-or">or</span>${keyCap('reel', { sm: true })}</span><span class="rl-keys touch-only"><i class="rl-tap">${glyph('paw')}</i></span><span class="rl-ht kbm-only">hold to reel</span><span class="rl-ht pad-only">hold to reel</span><span class="rl-ht touch-only">hold the screen</span></div>
      <div class="rl-how">
        <div class="rh-dev touch-only"><i class="rh-glass"></i>${THUMB}</div>
        <div class="rh-dev kbm-only"><span class="kc rh-key">F</span></div>
        <div class="rh-dev pad-only"><span class="rh-key">${keyCap('interact', { sm: true })}</span></div>
        <div class="rh-t"><b class="rh-up">Hold ▲</b><b class="rh-dn">Let go ▼</b></div>
      </div>
      <div class="rl-msg"></div>
    </div>`;
    layer.appendChild(r);
    const c = this.cueEl = el('div', 'fish-cue');
    c.innerHTML = `<div class="fc-in"><b class="fc-bang">!</b><span class="fc-t"></span></div>`;
    layer.appendChild(c);
    const q = s => r.querySelector(s);
    this.$ = { card: q('.rl-card'), name: q('.rl-name'), bar: q('.rl-bar'), zone: q('.rl-zone'), fish: q('.rl-fish'), img: q('.rl-fish img'), fill: q('.rl-fill'), meter: q('.rl-meter'), msg: q('.rl-msg'), cueIn: c.querySelector('.fc-in'), cueT: c.querySelector('.fc-t') };
    this.on = false; this.last = {}; this.cueKind = null; this.side = 'r'; this.cueAt = null; this.pos = null; this.obsT = 0; this.obs = [];
  }
  /** a fishing session starts or ends (the ui root's .fishing: touch fades the controls it doesn't use) */
  session(on) { this.ui.root?.classList.toggle('fishing', !!on); if (!on) this.cue(null); this.obsT = 0; }
  /** o: { icon, name, known, zone, howto } */
  start(o) {
    clearTimeout(this._hideT);
    const $ = this.$;
    $.img.src = o.icon || ''; $.img.classList.toggle('sil', !o.known);
    $.name.textContent = o.known ? o.name : '???';
    $.zone.style.height = (o.zone * BH) + 'px';
    $.card.className = 'rl-card start' + (o.howto ? ' howto' : ''); $.msg.textContent = '';
    this.root.classList.add('show'); this.on = true; this.last = {}; this.pos = null; this.obsT = 0;
    this.ui.root?.classList.add('reeling'); // (a phone's guide dock steps aside while the card is up)
    this.cue(null);
  }
  // ---------------------------------------------------------------- where the card goes
  /** what the card must not cover (screen rects, re-measured a few times a second): the guide's dock, the HUD's
   *  corners and bars, the toasts, and the touch controls that stay lit while fishing (the stick) */
  obstacles() {
    const out = [], add = e => {
      if (!e || !e.isConnected) return;
      let op = 1; for (let o = e; o && o !== document.body; o = o.parentElement) { const cs = getComputedStyle(o); if (cs.display === 'none' || cs.visibility === 'hidden') return; op *= +cs.opacity; } // (what touch fades while fishing doesn't count)
      if (op < 0.3) return;
      const b = e.getBoundingClientRect(); if (b.width > 2 && b.height > 2 && b.width < innerWidth * 0.9) out.push(b);
    };
    const R = this.ui.root || document;
    for (const s of ['.tut.on:not(.paused) .tut-say.on', '.tut.on:not(.paused) .tut-obj', '.tut-offer.on', '.hud-tl', '.hud-tr', '.hud-tc', '.hud-bc', '.hud-br', '.save-glyph', '.toasts > *', '.tc.on .tc-stick .tc-base', '.tc.on .tc-top > *', '.tc.on .tc-cluster > *', '.tc.on .tc-belt']) for (const e of R.querySelectorAll(s)) add(e);
    return out;
  }
  /** the card's screen spot: beside the hero (ax, ay) and the float (fx, fy), on the side and at the height where it
   *  covers the least (nothing at all, when it can) */
  place(ax, ay, fx, fy, w, h) {
    const W = innerWidth, H = innerHeight, m = Math.max(8, H * 0.02), gap = Math.max(18, H * 0.05);
    const pr = { left: Math.min(ax, fx) - H * 0.06, right: Math.max(ax, fx) + H * 0.06, top: Math.min(ay, fy) - H * 0.12, bottom: Math.max(ay, fy) + H * 0.1 };
    const over = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    let best = null;
    for (const [side, x0] of [['r', pr.right + gap], ['r', pr.right + gap * 3], ['l', pr.left - gap - w], ['l', pr.left - gap * 3 - w]]) {
      const x = Math.min(W - w - m, Math.max(m, x0));
      for (let y = m; y <= H - h - m + 0.5; y += Math.max(6, H * 0.02)) {
        const c = { left: x, right: x + w, top: y, bottom: y + h };
        let sc = over(c, pr) * 4 + Math.abs(y + h / 2 - (ay + fy) / 2) * 3 + (side === 'l' ? w * 4 : 0) + Math.abs(x - x0) * 6;
        for (const o of this.obs) sc += over(c, o) * 6;
        if (!best || sc < best.sc) best = { sc, x, y, side };
      }
    }
    return best || { x: m, y: m, side: 'r' };
  }
  /** Draw the sim; ax / ay = the player's screen position (px), fx / fy = the float's */
  draw(sim, ax, ay, hold, fx = ax, fy = ay) {
    if (!this.on) return;
    const s = this.ui.scale || 1, L = this.last, $ = this.$, now = performance.now();
    if (now > this.obsT) { this.obs = this.obstacles(); this.obsT = now + 350; const lb = this.layer.getBoundingClientRect(); this.org = { x: lb.left, y: lb.top }; const cb = $.card.getBoundingClientRect(); if (cb.width > 4) this.size = { w: cb.width, h: cb.height }; }
    const sz = this.size || { w: 130 * s, h: 360 * s }, want = this.place(ax, ay, fx, fy, sz.w, sz.h);
    this.side = want.side; // (the guide's callouts go on this side: world/guides.js)
    // (it glides to a new spot rather than jumping, and settles at once on the first frame)
    const p = this.pos ||= { x: want.x, y: want.y }; p.x += (want.x - p.x) * 0.2; p.y += (want.y - p.y) * 0.2;
    const o = this.org || { x: 0, y: 0 }, x = Math.round((p.x - o.x) / s), y = Math.round((p.y - o.y) / s);
    if (x !== L.x || y !== L.y) { this.root.style.transform = `translate(${x}px,${y}px)`; L.x = x; L.y = y; }
    const zy = Math.round((1 - sim.z - sim.zh) * BH), fyy = Math.round((1 - sim.f) * BH - 20), mm = Math.round(sim.m * 1000) / 10;
    if (zy !== L.zy) { $.zone.style.transform = `translateY(${zy}px)`; L.zy = zy; }
    if (fyy !== L.fy) { $.fish.style.transform = `translateY(${fyy}px)`; L.fy = fyy; }
    if (mm !== L.m) { $.fill.style.height = mm + '%'; L.m = mm; }
    const st = (sim.inZone ? 'in' : 'out') + (hold ? ' hold' : '') + (sim.m > 0.82 ? ' near' : sim.m < 0.18 && !sim.floor ? ' risk' : '') + (sim.dart ? ' dart' : '');
    if (st !== L.st) { $.bar.className = 'rl-bar ' + st; $.meter.className = 'rl-meter ' + st; L.st = st; }
  }
  end(result, text) {
    if (!this.on) return;
    this.on = false; this.ui.root?.classList.remove('reeling');
    const $ = this.$;
    $.card.className = 'rl-card ' + (result === 'catch' ? 'won' : 'lost');
    $.msg.textContent = text || (result === 'catch' ? 'Caught!' : 'It got away…');
    if (result === 'catch') { const r = $.card.getBoundingClientRect(); this.ui.burst(r.left + r.width / 2, r.top + r.height * 0.45, { n: 18, spread: 90, colors: ['#8fe0c0', '#fff3b8', '#8fd0ff', '#ff8fb0'] }); }
    this._hideT = setTimeout(() => this.root.classList.remove('show'), result === 'catch' ? 750 : 1300);
  }
  hide() { this.on = false; this.ui.root?.classList.remove('reeling'); clearTimeout(this._hideT); this.root.classList.remove('show'); this.cue(null); }
  // ---------------------------------------------------------------- the cue at the float
  /** kind: 'bite' (the big "!" and what to press; text: "NOW!" in the guide) | 'early' ("Not yet…") | 'miss' | null */
  cue(kind, text = '') {
    clearTimeout(this._cueT);
    const c = this.cueEl, $ = this.$;
    if (!kind) { c.classList.remove('show', 'below'); this.cueKind = null; return; }
    this.cueObsT = 0;
    this.cueKind = kind;
    $.cueIn.className = 'fc-in ' + kind;
    $.cueT.innerHTML = kind === 'bite' ? `${text ? `<b>${text}</b>` : ''}<span class="kbm-only"><span class="kc sm">F</span></span><span class="pad-only">${keyCap('interact', { sm: true })}</span><span class="touch-only">Tap!</span>`
      : kind === 'early' ? 'Not yet… wait for the splash!' : "Missed! It'll nibble again…";
    c.classList.remove('show'); void c.offsetWidth; c.classList.add('show');
    if (kind !== 'bite') this._cueT = setTimeout(() => { if (this.cueKind === kind) this.cue(null); }, 1400);
  }
  /** keep the cue over the float (screen px) */
  track(x, y) {
    if (!this.cueKind) return;
    const s = this.ui.scale || 1, o = this.org || (() => { const lb = this.layer.getBoundingClientRect(); return (this.org = { x: lb.left, y: lb.top }); })();
    const X = Math.round((x - o.x) / s), Y = Math.round((y - o.y) / s);
    if (X !== this._cx || Y !== this._cy) { this.cueEl.style.transform = `translate(${X}px,${Y}px)`; this._cx = X; this._cy = Y; }
    // (a few times a second: under the float instead when the guide's dock or the HUD would cover it above)
    const now = performance.now(); if (now < this.cueObsT) return; this.cueObsT = now + 300;
    if (!this.on) this.obs = this.obstacles();
    // (the box it fills above the float, from its layout: its parts pop in with a scale, so they can't be measured yet)
    const k = s * (this.ui.root?.classList.contains('m-touch') ? 1.35 : 1.15), r = { left: x - 28 * k, right: x + 160 * k, top: y - 68 * k, bottom: y - 8 * k };
    const hit = r.top < 0 || this.obs.some(b => Math.min(r.right, b.right) - Math.max(r.left, b.left) > 2 && Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top) > 2);
    this.cueEl.classList.toggle('below', hit);
  }
}
