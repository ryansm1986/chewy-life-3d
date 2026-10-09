// The dig ring (docs/COZY.md §7.1, §10; ROADMAP CZ-5): a little paper disc over the hero while Shadow and the hero dig.
// The ring fills over the dig (1.4 s held), a golden band sits at 70–85%, and letting go inside it is a "Perfect dig!"
// (the fill turns gold while it's in the band). Holding on to the end, or letting go anywhere else, is a good dig:
// nothing is ever lost. The keys under it follow the device (F or the mouse, A, the attack button). Drawn by
// cozy/scavengeWorld.js; transforms are written only when they change.
import './scavenge.css';
import { el } from './dom.js';
import { glyph } from './glyphs.js';
import { keyCap } from './padGlyphs.js';
import { DIG_BAND } from '../cozy/scavenge.js';

const R = 27, C = 2 * Math.PI * R;

export class DigRing {
  constructor(ui, layer) {
    this.ui = ui;
    const r = this.root = el('div', 'dig-ring');
    const band = (DIG_BAND[1] - DIG_BAND[0]) * C, bandAt = DIG_BAND[0] * C;
    r.innerHTML = `<div class="dr-card">
      <svg class="dr-svg" viewBox="0 0 72 72" aria-hidden="true">
        <circle class="dr-track" cx="36" cy="36" r="${R}"/>
        <circle class="dr-band" cx="36" cy="36" r="${R}" stroke-dasharray="${band.toFixed(2)} ${C.toFixed(2)}" stroke-dashoffset="${(-bandAt).toFixed(2)}"/>
        <circle class="dr-fill" cx="36" cy="36" r="${R}" stroke-dasharray="0 ${C.toFixed(2)}"/>
        <circle class="dr-tick" cx="36" cy="36" r="${R}" stroke-dasharray="1.6 ${C.toFixed(2)}" stroke-dashoffset="${(-bandAt + 0.8).toFixed(2)}"/>
        <circle class="dr-tick" cx="36" cy="36" r="${R}" stroke-dasharray="1.6 ${C.toFixed(2)}" stroke-dashoffset="${(-(DIG_BAND[1] * C) + 0.8).toFixed(2)}"/>
      </svg>
      <div class="dr-paw">${glyph('paw')}</div>
      <div class="dr-word"></div>
    </div>
    <div class="dr-hint"><span class="kbm-only"><span class="kc sm">F</span></span><span class="pad-only">${keyCap('attack', { sm: true })}</span><span class="touch-only"><i class="dr-tap">${glyph('paw')}</i></span><b>hold, let go in the gold</b></div>`;
    layer.appendChild(r);
    const q = s => r.querySelector(s);
    this.$ = { card: q('.dr-card'), fill: q('.dr-fill'), word: q('.dr-word'), hint: q('.dr-hint'), hintTx: q('.dr-hint b') };
    this.on = false; this.last = {};
  }
  /** a dig starts. o: { hold: the ring follows the button (else it fills by itself), tap: a tap-mode dig } */
  start(o = {}) {
    clearTimeout(this._hideT);
    const $ = this.$;
    $.card.className = 'dr-card start'; $.word.textContent = '';
    $.hintTx.textContent = o.hold ? 'hold, let go in the gold' : 'digging…';
    this.root.classList.toggle('auto', !o.hold);
    this.root.classList.add('show'); this.on = true; this.last = {};
  }
  /** k: the fill 0..1; ax / ay: the hero's head on screen (px) */
  draw(k, ax, ay) {
    if (!this.on) return;
    const s = this.ui.scale || 1, L = this.last, $ = this.$;
    const x = Math.round(Math.min(innerWidth / s - 60, Math.max(60, ax / s))), y = Math.round(Math.min(innerHeight / s - 90, Math.max(70, ay / s - 64)));
    if (x !== L.x || y !== L.y) { this.root.style.transform = `translate(${x}px,${y}px)`; L.x = x; L.y = y; }
    const f = Math.round(Math.max(0, Math.min(1, k)) * 1000) / 1000;
    if (f !== L.f) { $.fill.setAttribute('stroke-dasharray', `${(f * C).toFixed(2)} ${C.toFixed(2)}`); L.f = f; }
    const inBand = f >= DIG_BAND[0] && f <= DIG_BAND[1], st = inBand ? 'gold' : f > DIG_BAND[1] ? 'past' : '';
    if (st !== L.st) { $.card.classList.toggle('gold', inBand); $.card.classList.toggle('past', f > DIG_BAND[1]); L.st = st; }
  }
  /** the dig is done: 'perfect' | 'normal' | 'cancel' */
  finish(result, streak = 0) {
    if (!this.on) return;
    const $ = this.$;
    this.on = false;
    if (result === 'cancel') { $.card.className = 'dr-card gone'; }
    else {
      $.word.textContent = result === 'perfect' ? (streak > 1 ? `Perfect ×${streak}!` : 'Perfect!') : 'Good dig!';
      $.card.className = `dr-card done ${result}`;
    }
    clearTimeout(this._hideT);
    this._hideT = setTimeout(() => this.root.classList.remove('show'), result === 'cancel' ? 250 : 900);
  }
  hide() { this.on = false; clearTimeout(this._hideT); this.root.classList.remove('show'); }
}
