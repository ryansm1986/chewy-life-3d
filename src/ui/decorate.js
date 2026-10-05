// Decorate mode UI (docs/HOUSING.md §2): the bottom palette (your furniture storage by tab, with counts and 3D
// thumbnails; wallpapers and floors on the last tab) and, indoors, the HUD's Decorate button. The game side is
// home/decorate.js (opts: house(), state(), onSelect, onSurface, onStore, onUndo, onCancel, onClose).
import { el, esc, replay } from './dom.js';
import { glyph, glyphURL } from './glyphs.js';
import { Panel } from './panel.js';
import { FURNITURE, SURFACES, SURFACE_IDS, TABS, SETS, CATS, CELL, storageList, tabOf } from '../home/furniture.js';
import { furnitureGroup } from '../home/furnitureMesh.js';
import { surfaceSwatch } from '../home/surfaces.js';

const TAG_NAME = { cozy: 'Cozy', warm: 'Warm', nature: 'Nature', water: 'Water', lantern: 'Lantern', bookish: 'Bookish', sweet: 'Sweet', music: 'Music', retro: 'Retro', festive: 'Festive', elegant: 'Elegant', cute: 'Cute' };

/** a furniture item's 3D thumbnail (cached; null until rendered) */
export function furnitureThumb(G, id, now = true) {
  const T = G?.thumbs; if (!T) return null;
  const key = 'furn:' + id;
  if (T.cache.has(key)) return T.cache.get(key);
  if (!now) return null;
  const d = FURNITURE[id];
  const foot = d.mount === 'wall' ? [d.size[0] * CELL, 0.3] : [d.size[0] * CELL, d.size[1] * CELL];
  return T.object(key, () => furnitureGroup(id), { foot, min: 0.28, dir: d.mount === 'wall' ? [0.55, 0.45, 1.2] : [1, 1.05, 1.2] });
}
export function furnitureTipHTML(id, n = null) {
  const d = FURNITURE[id] || SURFACES[id]; if (!d) return '';
  const set = SETS[d.set], cat = d.kind ? (d.kind === 'wall' ? 'Wallpaper' : 'Floor') : CATS[d.cat]?.name;
  const size = d.kind ? '' : d.mount === 'wall' ? `${d.size[0] * CELL} × ${d.size[1] * CELL} m on a wall` : `${d.size[0] * CELL} × ${d.size[1] * CELL} m`;
  return `<div class="tt-simple tt-furn"><div class="tt-h">${esc(d.name)} <span class="jp">${esc(d.jp || '')}</span></div>
    <div class="tt-l tt-dim">${esc(cat || '')}${size ? ' · ' + size : ''}${set ? ` · <b style="color:${set.color}">${esc(set.name)}</b>` : ''}</div>
    <div class="tt-d">${esc(d.desc || '')}</div>
    ${(d.tags || []).length ? `<div class="tt-l fu-tags">${d.tags.map(t => `<span>${TAG_NAME[t] || t}</span>`).join('')}</div>` : ''}
    ${n != null ? `<div class="tt-l tt-dim">In storage: <b>${n}</b></div>` : ''}</div>`;
}

export class DecoratePanel extends Panel {
  constructor(ui) { super(ui, { name: 'decorate', title: 'Decorate', jp: '模様替え', side: 'bottom', cls: 'p-build p-decor', icon: 'home' }); this.tab = 'all'; this.queue = []; }
  init() {
    this.extra.innerHTML = `<div class="tabs bd-tabs dc-tabs">${TABS.map(t => `<button class="tab" data-t="${t.id}" style="--tc:${t.color}">${glyph(t.glyph)}<span>${esc(t.name)}</span><span class="tab-n">0</span></button>`).join('')}</div>`;
    this.body.innerHTML = `<div class="bd-main"><div class="bd-cards dc-cards"></div>
      <div class="bd-side dc-side">
        <div class="dc-house"><b class="dc-name"></b><span class="dc-surf"></span></div>
        <div class="dc-rate" title="Home Rating"><span class="dc-stars"></span><small class="dc-tip"></small></div>
        <div class="bh-t dc-hint">Pick something to place</div>
        <div class="dc-btns"><button class="btn sm dc-store" title="Put it back in storage (Delete)">${glyph('chest')}Store</button><button class="btn sm dc-undo" title="Undo (Ctrl+Z)">${glyph('swap')}Undo</button><button class="btn sm pink dc-done" title="Done (B)">${glyph('check')}Done</button></div>
        <div class="bh-k dc-keys"><span><span class="kc sm">${glyph('mouseL')}</span>place</span><span><span class="kc sm">R</span>rotate</span><span><span class="kc sm">Esc</span>cancel</span></div>
      </div></div>`;
    this.$ = { tabs: this.extra.querySelector('.dc-tabs'), cards: this.body.querySelector('.dc-cards'), name: this.body.querySelector('.dc-name'), surf: this.body.querySelector('.dc-surf'), rate: this.body.querySelector('.dc-rate'), stars: this.body.querySelector('.dc-stars'), tip: this.body.querySelector('.dc-tip'), hint: this.body.querySelector('.dc-hint'), store: this.body.querySelector('.dc-store'), undo: this.body.querySelector('.dc-undo'), done: this.body.querySelector('.dc-done') };
    this.$.tabs.addEventListener('click', e => { const t = e.target.closest('.tab'); if (t && t.dataset.t !== this.tab) { this.tab = t.dataset.t; this._sig = null; this.render(); replay(this.$.cards, 'swap', 400); this.ui.sfx?.('tab'); } });
    this.$.cards.addEventListener('click', e => {
      const c = e.target.closest('.card'); if (!c) return;
      const id = c.dataset.id;
      if (SURFACES[id]) { if (c.classList.contains('locked')) { replay(c, 'deny', 400); this.ui.sfx?.('deny'); return; } this.opts.onSurface?.(id); replay(c, 'picked', 500); }
      else { this.opts.onSelect?.(id); replay(c, 'picked', 500); }
    });
    this.$.cards.addEventListener('wheel', e => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { this.$.cards.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });
    this.$.cards.addEventListener('mouseover', e => { const c = e.target.closest('.card'); if (!c || c === this._hov) return; this._hov = c; this.ui.tip.show(furnitureTipHTML(c.dataset.id, this.st.furniture?.[c.dataset.id] || 0), '', c); });
    this.$.cards.addEventListener('mouseout', e => { const c = e.target.closest('.card'); if (c && !c.contains(e.relatedTarget)) { this._hov = null; this.ui.tip.hide(c); } });
    this.$.store.addEventListener('click', () => { this.opts.onStore?.(); this.ui.sfx?.('click'); });
    this.$.undo.addEventListener('click', () => { this.opts.onUndo?.(); this.ui.sfx?.('click'); });
    this.$.done.addEventListener('click', () => { this.ui._user = true; try { this.ui.close('decorate'); } finally { this.ui._user = false; } });
  }
  onOpen() { this.ui.root.classList.add('decorating'); this._sig = null; this._stars = null; this.render(); }
  onClose() { this.ui.root.classList.remove('decorating'); this.queue.length = 0; this.opts.onClose?.(); }
  list() {
    const st = this.st;
    if (this.tab === 'surface') {
      const h = this.opts.house?.() || {};
      return SURFACE_IDS.map(id => ({ id, def: SURFACES[id], n: SURFACES[id].free || (h.own || []).includes(id) ? Infinity : st.furniture?.[id] || 0, on: id === h.wall || id === h.floor })).filter(e => e.n > 0 || e.on);
    }
    return storageList(st, this.tab === 'all' ? null : this.tab).filter(e => !SURFACES[e.id]);
  }
  render() {
    if (!this.built) return;
    const st = this.st, h = this.opts.house?.() || {}, s = this.opts.state?.() || {};
    // tabs with counts
    const all = storageList(st);
    for (const t of this.$.tabs.children) {
      const id = t.dataset.t; t.classList.toggle('on', id === this.tab);
      const n = id === 'all' ? all.filter(e => !SURFACES[e.id]).reduce((a, e) => a + e.n, 0) : id === 'surface' ? all.filter(e => SURFACES[e.id]).reduce((a, e) => a + e.n, 0) : all.filter(e => !SURFACES[e.id] && tabOf(e.def) === id).reduce((a, e) => a + e.n, 0);
      t.querySelector('.tab-n').textContent = n > 99 ? '99+' : String(n);
    }
    this.$.name.textContent = h.name || 'Home';
    this.$.surf.innerHTML = [h.wall, h.floor].filter(Boolean).map(id => `<i title="${esc(SURFACES[id]?.name || id)}" style="background-image:url(${surfaceSwatch(id)})"></i>`).join('');
    // the Home Rating (home/rating.js): the stars, and the best next step
    const R = h.rating;
    if (R) {
      const stars = '★'.repeat(R.stars) + '☆'.repeat(5 - R.stars);
      if (this.$.stars.textContent !== stars) { this.$.stars.textContent = stars; if (this._stars != null && R.stars > this._stars) replay(this.$.rate, 'gain', 600); }
      this._stars = R.stars;
      this.$.tip.textContent = R.stars >= 5 ? (h.owner ? "They'll love it!" : 'A five-star home!') : R.tips[0] ? `Try: ${h.owner ? R.tips[0] : R.tips[0].replace(/their/, 'your')}` : ''; // (your own home: your favourite pieces)
    }
    this.$.rate.style.display = R ? '' : 'none';
    const holding = s.holding ? FURNITURE[s.holding] : null, sel = s.sel ? FURNITURE[s.sel] : null;
    this.$.hint.textContent = holding ? `Moving the ${holding.name}` : sel ? `Placing the ${sel.name}` : this.tab === 'surface' ? 'Click a wallpaper or floor to use it' : 'Pick something to place · click furniture to move it';
    this.$.store.disabled = !holding; this.$.store.classList.toggle('on', !!holding);
    this.$.undo.disabled = !s.canUndo;
    const list = this.list();
    const sig = this.tab + '|' + list.map(e => `${e.id}:${e.n}:${e.on ? 1 : 0}`).join(',') + '|' + (s.sel || '');
    if (sig === this._sig) return;
    this._sig = sig;
    this.queue.length = 0;
    const G = this.G;
    this.$.cards.innerHTML = list.length ? list.map((e, i) => {
      const surf = !!SURFACES[e.id], d = e.def, set = SETS[d.set];
      const art = surf ? `<img src="${surfaceSwatch(e.id)}" alt="" class="dc-sw" draggable="false">` : (() => { const u = furnitureThumb(G, e.id, false); if (!u) this.queue.push(e.id); return `<img src="${u || glyphURL('home')}" alt="" class="${u ? '' : 'gi dc-wait'}" data-th="${e.id}" draggable="false">`; })();
      const count = surf ? (d.free || (e.on && !e.n) ? '' : `<span class="dc-n">×${e.n}</span>`) : `<span class="dc-n">×${e.n}</span>`;
      return `<div class="card dc-card ${e.on ? 'built dc-on' : ''} ${s.sel === e.id ? 'sel' : ''}" data-id="${esc(e.id)}" style="--i:${i};--cc:${set?.color || '#ffcf4a'}">
        <div class="cd-art">${art}${count}</div><div class="cd-n">${esc(d.name)}</div>
        ${e.on ? `<div class="cd-built">${glyph('check')}<span>On</span></div>` : ''}</div>`;
    }).join('') : `<div class="bd-empty">${glyph('sakura')}${this.tab === 'surface' ? 'No wallpapers or floors in storage yet.' : 'Nothing in storage here yet.'}</div>`;
    this.pump();
  }
  // render missing thumbnails a few per frame (no hitch when the palette opens)
  pump() {
    if (this._pumping) return;
    this._pumping = true;
    const step = () => {
      const t0 = performance.now();
      while (this.queue.length && performance.now() - t0 < 10) {
        const id = this.queue.shift(), u = furnitureThumb(this.G, id, true);
        const img = this.$.cards.querySelector(`img[data-th="${id}"]`);
        if (img && u) { img.src = u; img.classList.remove('gi', 'dc-wait'); }
      }
      if (this.queue.length && this.isOpen) requestAnimationFrame(step); else this._pumping = false;
    };
    requestAnimationFrame(step);
  }
}

// indoors: the house name chip and the Decorate button in the HUD's bottom-right corner
export class HomeHud {
  constructor(ui) {
    this.ui = ui;
    const br = ui.hud?.$?.br; if (!br) return;
    this.root = el('div', 'home-tools');
    this.root.innerHTML = `<button class="build-btn deco-btn" title="Decorate (B)">${glyph('home')}<span class="bb-l">Decorate</span><span class="kc">B</span></button>`;
    br.insertBefore(this.root, br.firstChild);
    this.btn = this.root.querySelector('.deco-btn');
    this.btn.addEventListener('click', () => { const D = this.ui.G?.housing?.decor; if (D) { D.toggle(); replay(this.btn, 'pressed', 250); } });
  }
  setMode(mode) {
    if (!this.root) return;
    const H = this.ui.G?.housing;
    this.root.classList.toggle('can', mode === 'interior' && !!H?.canDecorate?.());
  }
}
