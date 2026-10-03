// The gift picker (docs/HOMESTEAD.md §4): "Give a gift" opens a paged grid of everything giftable — dishes first, then
// fish, crops and forage from the pantry, then crafting materials — 12 to a page. A villager's loved dish wears a big
// pink heart, the things they like a small one. Click (or 1-9 on this page) gives it; ◀ ▶ / A D turn pages; Esc
// keeps it. world/story.js giftFlow awaits ui.pickGift() and does the hearts and the reaction.
import { esc, replay } from './dom.js';
import { glyph } from './glyphs.js';
import { Panel } from './panel.js';
import { PANTRY, KIND_INFO, RARE_COLORS } from '../life/pantry.js';
import { pantryIcon } from '../life/pantryIcons.js';
import { pantryTipHTML } from './pantry.js';
import { materialIconURL } from './rpg.js';
import { portraitHTML } from './portraits.js';

const PER = 12;

export class GiftPickerPanel extends Panel {
  constructor(ui) { super(ui, { name: 'gift', title: 'Give a gift', jp: 'プレゼント', side: 'center', cls: 'p-gift', icon: 'gift' }); this.page = 0; }
  init() {
    this.body.innerHTML = `<div class="gf-to"><div class="gf-por"></div><div class="gf-tt"><b></b><small></small></div></div>
      <div class="gf-pages"><button class="btn sm gf-prev">${glyph('play')}</button><div class="gf-grid"></div><button class="btn sm gf-next">${glyph('play')}</button></div>
      <div class="gf-dots"></div>
      <div class="gf-foot"><span><span class="kc sm">1</span>–<span class="kc sm">9</span> give</span><span><span class="kc sm">◀</span><span class="kc sm">▶</span> page</span><span><span class="kc sm">Esc</span> never mind</span></div>`;
    const q = s => this.body.querySelector(s);
    this.$ = { por: q('.gf-por'), who: q('.gf-tt b'), sub: q('.gf-tt small'), grid: q('.gf-grid'), dots: q('.gf-dots'), prev: q('.gf-prev'), next: q('.gf-next') };
    this.$.prev.addEventListener('click', () => this.turn(-1));
    this.$.next.addEventListener('click', () => this.turn(1));
    this.$.dots.addEventListener('click', e => { const d = e.target.closest('[data-p]'); if (d) { this.page = +d.dataset.p; this.renderPage(); } });
    this.$.grid.addEventListener('click', e => { const c = e.target.closest('.gf-card'); if (c) this.pick(c.dataset.key); });
    this.$.grid.addEventListener('mouseover', e => { const c = e.target.closest('.gf-card'); if (!c || c === this._hov) return; this._hov = c; this.ui.tip.show(this.tipFor(c.dataset.key), 'item', c); });
    this.$.grid.addEventListener('mouseout', e => { const c = e.target.closest('.gf-card'); if (c && !c.contains(e.relatedTarget)) { this._hov = null; this.ui.tip.hide(c); } });
    this.onKeyDown = e => {
      if (!this.isOpen) return;
      const m = /^Digit([1-9])$/.exec(e.code);
      if (m) { const it = this.items[this.page * PER + +m[1] - 1]; if (it) { e.preventDefault(); e.stopPropagation(); this.pick(it.key); } return; }
      if (e.code === 'ArrowRight' || e.code === 'KeyD') { e.preventDefault(); e.stopPropagation(); this.turn(1); }
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') { e.preventDefault(); e.stopPropagation(); this.turn(-1); }
    };
  }
  get items() { return this.opts.items || []; }
  get pages() { return Math.max(1, Math.ceil(this.items.length / PER)); }
  onOpen() {
    const o = this.opts;
    this.page = 0; this.picked = false;
    this.$.por.innerHTML = portraitHTML(o.portrait || o.id || 'rosie');
    this.$.who.textContent = `A gift for ${o.name || 'them'}`;
    const loved = this.items.filter(i => i.love === 'loved').length, liked = this.items.filter(i => i.love === 'liked').length;
    this.$.sub.innerHTML = loved ? `${glyph('heart')}You have something ${esc(o.name)} <b>loves</b>!` : liked ? `${glyph('heart')}${esc(o.name)} likes a few of these` : `One gift a day. Hearts mark their favourites.`;
    this.renderPage(true);
    addEventListener('keydown', this.onKeyDown, true);
  }
  onClose() {
    removeEventListener('keydown', this.onKeyDown, true); this.ui.tip.hide();
    if (!this.picked) { this.picked = true; this.opts.onPick?.(null); } // (closed with Esc / the X: never mind)
  }
  turn(d) {
    const n = this.pages; if (n <= 1) { replay(this.$.grid, 'deny', 300); return; }
    this.page = (this.page + d + n) % n; this.renderPage(); this.ui.sfx?.('tab');
    replay(this.$.grid, d > 0 ? 'pgNext' : 'pgPrev', 350);
  }
  renderPage(first) {
    const it = this.items.slice(this.page * PER, this.page * PER + PER);
    this.$.grid.innerHTML = it.map((e, i) => {
      const P = e.pantry ? PANTRY[e.key] : null, icon = P ? pantryIcon(e.key) : materialIconURL(e.key), kc = P ? (P.rare ? RARE_COLORS[P.rare] : KIND_INFO[P.kind].color) : '#c8b8a8';
      return `<div class="gf-card ${e.love || ''}" data-key="${e.key}" style="--i:${i};--kc:${kc}"><span class="kc sm gf-k">${i < 9 ? i + 1 : ''}</span>
        <div class="gf-art"><img src="${icon}" alt="" draggable="false"></div><b>${esc(e.name)}</b><small>×${e.n}</small>
        ${e.love ? `<i class="gf-heart">${glyph('heart')}${e.love === 'loved' ? '<em>Loves!</em>' : ''}</i>` : ''}</div>`;
    }).join('') + Array.from({ length: Math.max(0, (first ? PER : PER) - it.length) }, () => '<div class="gf-card empty"></div>').join('');
    this.$.dots.innerHTML = this.pages > 1 ? Array.from({ length: this.pages }, (_, p) => `<i data-p="${p}" class="${p === this.page ? 'on' : ''}"></i>`).join('') : '';
    this.$.prev.classList.toggle('dis', this.pages <= 1); this.$.next.classList.toggle('dis', this.pages <= 1);
  }
  tipFor(key) {
    const e = this.items.find(x => x.key === key); if (!e) return '';
    const hint = e.love === 'loved' ? `<b>${esc(this.opts.name)}</b> loves this! (+16 ♥)` : e.love === 'liked' ? `${esc(this.opts.name)} likes this (+8 ♥)` : 'A kind thought (+3 ♥)';
    if (e.pantry) return pantryTipHTML(key, this.st, { hints: [hint, '<b>Click</b> give'] });
    return `<div class="tt-item"><div class="tt-name">${esc(e.name)}</div><div class="tt-d">A crafting material. You have ${e.n}.</div><div class="tt-hints"><span>${hint}</span><span><b>Click</b> give</span></div></div>`;
  }
  pick(key) {
    if (this.picked) return;
    this.picked = true;
    const cb = this.opts.onPick;
    this.ui.close('gift');
    this.ui.sfx?.('select');
    cb?.(key);
  }
}
