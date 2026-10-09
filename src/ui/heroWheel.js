// The hero wheel (docs/POE.md §6, docs/HEROES.md §4): hold Tab to open it, pick a hero, let go. Mouse: point toward a
// hero (or hover / click a card); keys: 1–9 pick and confirm (the roster's order), Esc closes. A tap of Tab never opens it (heroes.js
// tabInput: a tap switches straight to the next joined hero). It isn't a modal: the hero can keep walking while it's up;
// game.js skips the skill keys while it's open.
//   new HeroWheel(G, heroes) → .show() .hide() .release() .input() .open
import './heroWheel.css';
import { Input } from '../core/input.js';
import { Actions } from '../core/actions.js';
import { keyCap } from './padGlyphs.js';
import { HERO_TEXT } from '../rpg/classes.js';
import { el, esc } from './dom.js';
import { portrait } from './portraits.js';
import { cozyIcon } from './cozyIcons.js';
import './cozy.css';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9']; // (one per hero, in roster order: any number of heroes)
export class HeroWheel {
  constructor(G, heroes) {
    this.G = G; this.H = heroes; this.open = false; this.sel = null; this.cards = [];
    this.root = el('div', 'hero-wheel');
    this.root.innerHTML = `<div class="hw-ring"></div><div class="hw-hub"><b>Heroes</b><span>Let go of ${keyCap('hero', { sm: true })} to switch</span></div>`;
    (document.getElementById('ui') || document.body).appendChild(this.root);
    this.ring = this.root.querySelector('.hw-ring');
    this.hub = this.root.querySelector('.hw-hub');
  }
  build() {
    const list = this.H.roster(), n = list.length;
    this.ring.innerHTML = '';
    this.cards = list.map((h, i) => {
      const a = -Math.PI / 2 + (i / n) * Math.PI * 2, R = n > 5 ? 228 : n > 4 ? 206 : n > 3 ? 190 : 178; // (the first hero at the top, the others round the ring; a wider ring for more heroes)
      const c = el('button', 'hw-card'); c.dataset.id = h.id; // (the Meet Poe guide spotlights her card)
      c.style.setProperty('--hc', h.color); c.style.setProperty('--x', `${Math.cos(a) * R}px`); c.style.setProperty('--y', `${Math.sin(a) * R}px`); c.style.setProperty('--i', i);
      c.classList.toggle('active', h.active); c.classList.toggle('locked', !h.joined); c.classList.toggle('blocked', h.joined && !h.active && !h.ready); c.classList.toggle('away', !!h.away); // (away: out on an expedition, docs/COZY.md §4.8)
      const url = this.G.portrait?.(h.id), face = url ? `<img class="p3d" src="${url}" alt="" draggable="false">` : portrait(h.id);
      const jp = h.joined ? HERO_TEXT[h.id]?.jp || '' : '';
      c.innerHTML = `<div class="hw-face">${face}${h.joined ? '' : '<i class="hw-q">?</i>'}</div>${h.away ? `<i class="cz-away-badge" title="Away on an expedition">${cozyIcon('pack')}</i>` : ''}
        <div class="hw-t"><b>${esc(h.name)}${jp ? `<span class="jp">${jp}</span>` : ''}</b><span>${esc(h.title)}</span>${h.joined ? `<em>Lv ${h.lvl}</em>` : ''}</div>
        <span class="kc sm hw-k">${i + 1}</span>${h.active ? '<span class="hw-tag">Playing</span>' : !h.ready && h.joined ? `<span class="hw-tag dim">${esc(h.why)}</span>` : !h.joined ? `<span class="hw-tag dim">${esc(h.why)}</span>` : ''}`;
      c.addEventListener('pointerenter', () => this.select(i));
      c.addEventListener('click', e => { e.stopPropagation(); this.select(i); this.confirm(); });
      this.ring.appendChild(c);
      return { el: c, h, a };
    });
  }
  show() {
    this.build();
    this.open = true; this.root.classList.add('show');
    const nx = this.H.next(), i = this.cards.findIndex(c => c.h.id === nx);
    this.select(i >= 0 ? i : this.cards.findIndex(c => c.h.active));
    this.mouse0 = { x: Input.mouse.x, y: Input.mouse.y };
  }
  hide() { this.open = false; this.root.classList.remove('show'); this.sel = null; }
  select(i) {
    if (i == null || i < 0 || !this.cards[i]) return;
    if (this.sel === i) return;
    this.sel = i;
    this.cards.forEach((c, k) => c.el.classList.toggle('sel', k === i));
    const h = this.cards[i].h;
    this.hub.innerHTML = `<b>${esc(h.joined ? h.name : '???')}</b><span>${h.active ? 'Playing now' : h.ready ? `${Actions.device === 'touch' ? 'Tap a card' : `Let go of ${keyCap('hero', { sm: true })}`} to play as ${esc(h.name)}` : esc(h.why)}</span>`; // (touch: the wheel stays up for a tap, ui/touch.js)
    this.G.audio?.play?.('ui_hover', { vol: 0.5 });
  }
  confirm() {
    const c = this.cards[this.sel];
    if (c?.h.away) this.G.ui?.toast?.(`${c.h.name} is away on an expedition: ${c.h.away.label}`, { color: '#8fd0ff', duration: 3 }); // (a click on an away card says so)
    this.H.pickFromWheel(c && c.h.ready ? c.h.id : null);
  }
  /** Tab let go: switch to the highlighted hero (if it can be played now), else just close */
  release() { this.confirm(); }
  /** per frame while open (heroes.tabInput): number keys, Esc, pointing the mouse toward a card */
  input() {
    for (let k = 0; k < Math.min(KEYS.length, this.cards.length); k++) if (Input.hit(KEYS[k])) { Input.consume(KEYS[k]); this.select(k); this.confirm(); return; }
    if (Input.hit('escape')) { Input.consume('escape'); this.H.pickFromWheel(null); return; }
    // the pad (docs/CONTROLS.md §2): the right stick points at a hero, B closes the wheel without switching
    if (Actions.pressed('roll', 'pad')) { Actions.consume('roll', 'pad'); this.H.pickFromWheel(null); return; }
    const rs = Actions.aim();
    if (rs.mag > 0.5) { this.pickAngle(Math.atan2(-rs.y, rs.x)); return; } // (screen angles: y grows downward)
    // radial pick: the mouse pushed away from where it was when the wheel opened selects the card in that direction
    const dx = Input.mouse.x - this.mouse0.x, dy = Input.mouse.y - this.mouse0.y;
    if (dx * dx + dy * dy > 40 * 40) this.pickAngle(Math.atan2(dy, dx));
  }
  /** select the card nearest a screen angle (the mouse push, or the pad's right stick) */
  pickAngle(a) {
    let best = -1, bd = 9;
    this.cards.forEach((c, k) => { let d = Math.abs(((a - c.a) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI); if (d < bd) { bd = d; best = k; } });
    this.select(best);
  }
}
