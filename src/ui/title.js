// Title screen over the live 3D scene: bouncing logo, paw-print trail, falling petals, New / Continue / Settings.
import { el, esc } from './dom.js';
import { glyph } from './glyphs.js';
import { portrait } from './portraits.js';

const LETTER_COLORS = ['#fff6e8', '#ffc4d6', '#ffe79a', '#c9f5e4', '#cfeaff', '#e4dcff'];

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
        <div class="ti-kana"><span>ポーヘイブン</span></div>
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
          <button class="btn big" data-a="continue">${glyph('paw')}Continue</button>
          <button class="btn big" data-a="settings">${glyph('gear')}Settings</button>
        </div>
      </div>
      <div class="ti-foot">v0.1 · made with love for Chewy &amp; Shadow ♡</div>`;
    ui.layers.title.appendChild(r);
    r.addEventListener('click', e => {
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
      else if (a === 'newGame') h.newGame?.();
      else if (a === 'continue') h.continue?.();
    });
  }
  sync() {
    const h = this.ui._titleH || {};
    const hs = typeof h.hasSave === 'function' ? h.hasSave() : h.hasSave;
    const c = this.root.querySelector('[data-a="continue"]');
    c.disabled = hs === false || !h.continue;
    c.classList.toggle('dis', c.disabled);
  }
  show() {
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
