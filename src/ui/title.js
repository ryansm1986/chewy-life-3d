// Title screen over the live 3D scene: bouncing logo, paw-print trail, falling petals, New Game / Continue / Load Game /
// Settings, and the save-slot picker (SL-1: SLOTS adventures, each its own save; core/autosave.js keeps them, game.js
// hands the hooks in through ui.onTitle: hasSave, slots, last, newGame(n), play(n), continue, remove(n)).
import { el, esc } from './dom.js';
import { glyph } from './glyphs.js';
import { DESKTOP, quitGame } from './desktop.js';
import { portrait } from './portraits.js';
import { version as VERSION } from '../../package.json'; // (the footer names the running version, as the desktop app's does: CT-10)

const LETTER_COLORS = ['#fff6e8', '#ffc4d6', '#ffe79a', '#c9f5e4', '#cfeaff', '#e4dcff'];
/** "Today, 3:42 PM" · "Yesterday" · "3 days ago" · "Oct 18" (always English: no Japanese text) */
function when(at) {
  if (!at) return '';
  const d = new Date(at), days = Math.round((new Date(new Date().toDateString()) - new Date(d.toDateString())) / 864e5);
  if (days <= 0) return `Today, ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function played(sec) {
  const m = Math.floor(sec / 60);
  return m < 1 ? 'Played under a minute' : m < 60 ? `Played ${m} min` : `Played ${Math.floor(m / 60)} h ${m % 60} min`;
}

export class Title {
  constructor(ui) {
    this.ui = ui;
    const r = this.root = el('div', 'title');
    const word = (w, off) => [...w].map((c, i) => `<span class="tl" style="--i:${i + off};--c:${LETTER_COLORS[(i + off) % LETTER_COLORS.length]}"><span class="tl-in">${esc(c)}</span></span>`).join('');
    const petals = Array.from({ length: 30 }, (_, i) => {
      const x = Math.random() * 100, d = 7 + Math.random() * 8, dl = -Math.random() * 15, s = 0.55 + Math.random() * 0.8, sw = 30 + Math.random() * 80;
      return `<i class="pt" style="left:${x.toFixed(1)}%;--d:${d.toFixed(1)}s;--dl:${dl.toFixed(1)}s;--s:${s.toFixed(2)};--sw:${sw.toFixed(0)}px;--r:${(Math.random() * 360).toFixed(0)}deg"></i>`;
    }).join('');
    const paws = Array.from({ length: 9 }, (_, i) => `<i style="--i:${i};left:${6 + i * 11}%;top:${i % 2 ? 8 : 0}px;transform:rotate(${80 + (i % 2 ? 12 : -12)}deg)">${glyph('paw')}</i>`).join('');
    r.innerHTML = `<div class="ti-vig"></div><div class="ti-petals">${petals}</div>
      <div class="ti-center">
        <div class="ti-logo">
          <div class="ti-chewy">${portrait('chewy')}</div>
          <div class="ti-shadow">${portrait('shadow')}</div>
          <div class="ti-word w1">${word('Pawhaven', 0)}</div>
          <div class="ti-spark s1">${glyph('sparkle')}</div><div class="ti-spark s2">${glyph('sparkle')}</div><div class="ti-spark s3">${glyph('sakura')}</div>
        </div>
        <div class="ti-paws">${paws}</div>
        <div class="ti-sub">A Cozy Blossom Village Adventure</div>
        <div class="ti-btns">
          <button class="btn big pink" data-a="newGame">${glyph('sakura')}New Game</button>
          <button class="btn big ti-cont" data-a="continue">${glyph('paw')}<span class="ti-bl">Continue<small class="ti-bsub"></small></span></button>
          <button class="btn big" data-a="load">${glyph('book')}Load Game</button>
          <button class="btn big" data-a="settings">${glyph('gear')}Settings</button>${DESKTOP ? `
          <button class="btn big" data-a="quit">${glyph('door')}Quit</button>` : ''}
        </div>
      </div>
      <div class="ti-slots"><div class="sl-head"></div><div class="sl-row"></div>
        <button class="btn sl-back" data-s="back">${glyph('exit')}Back</button></div>
      <div class="ti-foot">v${VERSION} · made with love for Chewy &amp; Shadow ♡</div>`;
    this.$ = { head: r.querySelector('.sl-head'), row: r.querySelector('.sl-row'), back: r.querySelector('.sl-back') };
    this.picking = null;   // the picker's mode while it's up: 'load' | 'new'
    this.ask = null;       // a card asking first: { n, what: 'del' | 'over' }
    ui.layers.title.appendChild(r);
    r.addEventListener('click', e => {
      const sb = e.target.closest('[data-s]');
      if (sb && !sb.disabled) { sb.classList.remove('pressed'); void sb.offsetWidth; sb.classList.add('pressed'); ui.sfx?.('select'); this.slotAction(sb.dataset.s, +sb.closest('.sl-card')?.dataset.n); return; }
      const b = e.target.closest('[data-a]'); if (!b || b.disabled) return;
      const a = b.dataset.a, h = ui._titleH || {};
      b.classList.remove('pressed'); void b.offsetWidth; b.classList.add('pressed');
      ui.sfx?.('select');
      if (a === 'settings') {
        // tuck the title away while settings are open (the menu lives in a lower layer)
        ui.layers.title.classList.add('behind');
        ui.open('menu', { view: 'settings', from: 'title' });
        const off = ui.G?.events?.on?.('ui:close', e => { if (e?.name === 'menu') { ui.layers.title.classList.remove('behind'); off?.(); } });
      }
      else if (a === 'newGame') { if (h.slots && h.hasSave?.()) this.openSlots('new'); else h.newGame?.(); } // (no save anywhere: straight in)
      else if (a === 'continue') h.continue?.();
      else if (a === 'load') this.openSlots('load');
      else if (a === 'quit') quitGame(ui); // (the desktop app only: ui/desktop.js)
    });
  }
  sync() {
    const h = this.ui._titleH || {};
    const hs = typeof h.hasSave === 'function' ? h.hasSave() : h.hasSave;
    const c = this.root.querySelector('[data-a="continue"]');
    c.disabled = hs === false || !h.continue;
    c.classList.toggle('dis', c.disabled);
    const ld = this.root.querySelector('[data-a="load"]');
    ld.disabled = hs === false || !h.slots;
    ld.classList.toggle('dis', ld.disabled);
    ld.style.display = h.slots ? '' : 'none';
    // Continue names the adventure it plays
    const n = !c.disabled && h.last?.(), i = n && h.slots?.()[n - 1];
    c.querySelector('.ti-bsub').textContent = i ? (i.damaged ? `Adventure ${n}` : `Adventure ${n} · ${i.name}, level ${i.lvl}`) : '';
  }

  // ---------------------------------------------------------------- the save-slot picker
  openSlots(mode) {
    this.picking = mode; this.ask = null; this._pf = null; this._up = null; this._intro = true;
    this.root.classList.remove('unpick'); this.root.classList.add('picking');
    this.renderSlots();
  }
  closeSlots() {
    if (!this.picking) return;
    this.picking = null; this.ask = null;
    this.root.classList.remove('picking'); this.root.classList.add('unpick');
    this.sync();
  }
  /** Escape / B on the title: back out of a question, then out of the picker. → true when it did */
  escape() { if (this.ask) { this.ask = null; this.renderSlots(); return true; } if (this.picking) { this.closeSlots(); return true; } return false; }
  renderSlots() {
    const h = this.ui._titleH || {}, list = h.slots?.() || [], last = h.last?.() || 0, mode = this.picking;
    const free = list.some(i => !i);
    this.$.head.textContent = mode === 'new' ? (free ? 'Where should the new adventure go?' : 'All full! Start over on one, or delete one') : 'Pick an adventure';
    this.$.row.innerHTML = list.map((info, k) => this.card(info, k + 1, k + 1 === last, mode)).join('');
    this.$.row.classList.toggle('pop', !!this._intro); this._intro = false; // (the cards pop in when the picker opens, not on every answer)
    // the pad's focus: a question's "Keep it", else the card the mode is about
    const btns = this.slotButtons();
    let f = this.ask ? this.$.row.querySelector(`.sl-card[data-n="${this.ask.n}"] [data-s="no"]`) : null;
    if (!f) f = this.$.row.querySelector(mode === 'new' ? '.sl-card.empty .btn' : `.sl-card[data-n="${last}"] .btn.go`) || this.$.row.querySelector('.btn.go');
    this._pf = Math.max(0, btns.indexOf(f)); this._up = null;
    if (this.ui.G?.controls?.device === 'pad') this.markPad();
  }
  card(info, n, last, mode) {
    const top = `<div class="sl-top"><span class="sl-num">Adventure ${n}</span>${last && info ? '<span class="sl-tag">Last played</span>' : ''}</div>`;
    const k = `style="--k:${n - 1}"`;
    if (!info) return `<div class="sl-card empty" data-n="${n}" ${k}>${top}
      <div class="sl-face sl-blank">${glyph('sakura')}</div><div class="sl-name">Empty</div><div class="sl-lvl">A fresh start in Blossom Hollow</div>
      <div class="sl-acts"><button class="btn pink go" data-s="new">${glyph('sakura')}New Game</button></div></div>`;
    const ask = this.ask?.n === n ? this.ask.what : null;
    const acts = ask ? `<div class="sl-ask">${ask === 'del' ? 'Delete this adventure? It will be gone for good.' : 'Start over here? This adventure will be gone for good.'}</div>
        <div class="sl-acts"><button class="btn sl-yes" data-s="yes">${ask === 'del' ? `${glyph('bin')}Delete` : `${glyph('sakura')}Start over`}</button><button class="btn mint go" data-s="no">Keep it</button></div>`
      : `<div class="sl-acts">${mode === 'new' ? `<button class="btn pink go" data-s="over">${glyph('sakura')}Start over</button>` : `<button class="btn pink go" data-s="play">${glyph('play')}Play</button>`}<button class="btn sl-del" data-s="del" title="Delete" aria-label="Delete">${glyph('bin')}</button></div>`;
    if (info.damaged) return `<div class="sl-card ${last ? 'last' : ''} ${ask ? 'asking' : ''}" data-n="${n}" ${k}>${top}
      <div class="sl-face sl-blank">${glyph('question')}</div><div class="sl-name">A little scrambled</div><div class="sl-lvl">Play tries the save before it</div>${acts}</div>`;
    const team = info.team.filter(id => id !== info.hero).map(id => `<i>${portrait(id)}</i>`).join('');
    const more = [info.playSec != null ? played(info.playSec) : '', when(info.at)].filter(Boolean).join(' · ');
    return `<div class="sl-card ${last ? 'last' : ''} ${ask ? 'asking' : ''}" data-n="${n}" ${k}>${top}
      <div class="sl-face">${portrait(info.hero)}</div>
      <div class="sl-name">${esc(info.name)}</div><div class="sl-lvl">Level ${info.lvl}</div>
      <div class="sl-team">${team}</div>
      <div class="sl-facts"><span>${glyph('sun')}Day ${info.day}</span><span>${glyph('coin')}${Math.floor(info.coins).toLocaleString('en-US')}</span></div>
      <div class="sl-when">${esc(more)}</div>${acts}</div>`;
  }
  slotAction(s, n) {
    const h = this.ui._titleH || {};
    if (s === 'back') return this.closeSlots();
    if (s === 'play') return h.play?.(n);
    if (s === 'new') return h.newGame?.(n);
    if (s === 'over' || s === 'del') { this.ask = { n, what: s }; return this.renderSlots(); }
    if (s === 'no') { this.ask = null; return this.renderSlots(); }
    if (s === 'yes') {
      const what = this.ask?.what; this.ask = null;
      if (what === 'over') return h.newGame?.(n);
      h.remove?.(n);
      if (!h.hasSave?.() && this.picking === 'load') this.picking = 'new'; // (nothing left to load: the empties start new ones)
      this.renderSlots(); this.sync();
    }
  }
  slotButtons() { return [...this.root.querySelectorAll('.sl-row .btn'), this.$.back]; }
  markPad() { this.slotButtons().forEach((b, i) => b.classList.toggle('pad-focus', i === this._pf)); }
  /** the pad while the picker is up (ui.padTitle): left / right walk the cards' buttons, down goes to Back and up comes
   *  off it, A presses, B backs out. → true when the picker has the pad */
  pad(A) {
    if (!this.picking) return false;
    const btns = this.slotButtons(), backI = btns.length - 1;
    if (this._pf == null || !btns[this._pf]) this._pf = 0;
    const was = this._pf;
    if (this._pf === backI) { if (A.nav === 'up' || A.nav === 'left' || A.nav === 'right') this._pf = this._up ?? 0; }
    else if (A.nav === 'right') this._pf = (this._pf + 1) % backI;
    else if (A.nav === 'left') this._pf = (this._pf + backI - 1) % backI;
    else if (A.nav === 'down') { this._up = this._pf; this._pf = backI; }
    if (this._pf !== was) this.ui.sfx?.('hover');
    this.markPad();
    if (A.padHit('A')) { A.padConsume('A'); btns[this._pf].click(); }
    else if (A.padHit('B')) { A.padConsume('B'); this.escape(); }
    return true;
  }
  show() {
    this.closeSlots();
    this.sync();
    this.root.classList.remove('out');
    this.root.classList.add('show');
  }
  hide() {
    if (!this.root.classList.contains('show')) return;
    this.root.classList.add('out');
    clearTimeout(this._t);
    this._t = setTimeout(() => this.root.classList.remove('show', 'out'), 900);
  }
}
