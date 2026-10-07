// The reel bar (docs/HOMESTEAD.md §3): a little cozy card beside the player while a fish fights. A water-filled
// capsule with the fish (its silhouette until it's in the Fish Log) darting up and down, the mint catch zone the
// player lifts by holding F / LMB, and a catch meter that fills while the fish is in the zone. The physics live in
// life/reelSim.js; this only draws a ReelSim. Transforms are written only when they change.
import { el } from './dom.js';
import { glyph } from './glyphs.js';
import { keyCap } from './padGlyphs.js';

const BH = 236; // bar height (px at UI scale 1)

export class ReelBar {
  constructor(ui, layer) {
    this.ui = ui;
    const r = this.root = el('div', 'reel');
    r.innerHTML = `<div class="rl-card">
      <div class="rl-head"><span class="rl-ex">!</span><b class="rl-name">???</b></div>
      <div class="rl-body">
        <div class="rl-bar"><i class="rl-bub b1"></i><i class="rl-bub b2"></i><i class="rl-bub b3"></i><i class="rl-weed w1"></i><i class="rl-weed w2"></i>
          <div class="rl-zone"><i class="rl-zg"></i></div><div class="rl-fish"><img alt=""></div></div>
        <div class="rl-meter"><i class="rl-fill"></i><b class="rl-star">${glyph('star')}</b></div>
      </div>
      <div class="rl-hint"><span class="rl-keys kbm-only"><span class="kc sm">F</span><span class="rl-or">or</span>${glyph('mouseL')}</span><span class="rl-keys pad-only">${keyCap('interact', { sm: true })}<span class="rl-or">or</span>${keyCap('reel', { sm: true })}</span><span>hold to reel</span></div>
      <div class="rl-msg"></div>
    </div>`;
    layer.appendChild(r);
    const q = s => r.querySelector(s);
    this.$ = { card: q('.rl-card'), name: q('.rl-name'), bar: q('.rl-bar'), zone: q('.rl-zone'), fish: q('.rl-fish'), img: q('.rl-fish img'), fill: q('.rl-fill'), meter: q('.rl-meter'), msg: q('.rl-msg') };
    this.on = false; this.last = {};
  }
  /** o: { icon, name, known, zone } */
  start(o) {
    clearTimeout(this._hideT);
    const $ = this.$;
    $.img.src = o.icon || ''; $.img.classList.toggle('sil', !o.known);
    $.name.textContent = o.known ? o.name : '???';
    $.zone.style.height = (o.zone * BH) + 'px';
    $.card.className = 'rl-card start'; $.msg.textContent = '';
    this.root.classList.add('show'); this.on = true; this.last = {};
  }
  /** Draw the sim; ax / ay = the player's screen position (px) to sit beside. */
  draw(sim, ax, ay, hold) {
    if (!this.on) return;
    const s = this.ui.scale || 1, L = this.last, $ = this.$;
    const x = Math.round(Math.min(innerWidth / s - 150, Math.max(20, ax / s + 70))), y = Math.round(Math.min(innerHeight / s - 380, Math.max(70, ay / s - 260)));
    if (x !== L.x || y !== L.y) { this.root.style.transform = `translate(${x}px,${y}px)`; L.x = x; L.y = y; }
    const zy = Math.round((1 - sim.z - sim.zh) * BH), fy = Math.round((1 - sim.f) * BH - 20), m = Math.round(sim.m * 1000) / 10;
    if (zy !== L.zy) { $.zone.style.transform = `translateY(${zy}px)`; L.zy = zy; }
    if (fy !== L.fy) { $.fish.style.transform = `translateY(${fy}px)`; L.fy = fy; }
    if (m !== L.m) { $.fill.style.height = m + '%'; L.m = m; }
    const st = (sim.inZone ? 'in' : 'out') + (hold ? ' hold' : '') + (sim.m > 0.82 ? ' near' : sim.m < 0.18 ? ' risk' : '') + (sim.dart ? ' dart' : '');
    if (st !== L.st) { $.bar.className = 'rl-bar ' + st; $.meter.className = 'rl-meter ' + st; L.st = st; }
  }
  end(result, text) {
    if (!this.on) return;
    this.on = false;
    const $ = this.$;
    $.card.className = 'rl-card ' + (result === 'catch' ? 'won' : 'lost');
    $.msg.textContent = text || (result === 'catch' ? 'Caught!' : 'It got away…');
    if (result === 'catch') { const r = $.card.getBoundingClientRect(); this.ui.burst(r.left + r.width / 2, r.top + r.height * 0.45, { n: 18, spread: 90, colors: ['#8fe0c0', '#fff3b8', '#8fd0ff', '#ff8fb0'] }); }
    this._hideT = setTimeout(() => this.root.classList.remove('show'), result === 'catch' ? 750 : 1100);
  }
  hide() { this.on = false; clearTimeout(this._hideT); this.root.classList.remove('show'); }
}
