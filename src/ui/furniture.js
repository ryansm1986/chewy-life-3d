// The Furniture tab of the inventory panel (docs/HOUSING.md §2): your furniture storage (state.furniture) as a grid
// of counters in the Pantry's look, by palette tab, with a detail card. Placing happens at home in decorate mode.
import { el, esc, replay, setText } from './dom.js';
import { glyph, glyphURL } from './glyphs.js';
import { FURNITURE, SURFACES, TABS, SETS, CATS, CELL, storageList, tabOf } from '../home/furniture.js';
import { surfaceSwatch } from '../home/surfaces.js';
import { furnitureThumb, furnitureTipHTML } from './decorate.js';

const TAG_NAME = { cozy: 'Cozy', warm: 'Warm', nature: 'Nature', water: 'Water', lantern: 'Lantern', bookish: 'Bookish', sweet: 'Sweet', music: 'Music', retro: 'Retro', festive: 'Festive', elegant: 'Elegant', cute: 'Cute' };

export class FurnitureView {
  constructor(panel) {
    this.panel = panel; this.ui = panel.ui; this.tab = 'all'; this.sel = null; this.cells = []; this.queue = [];
    const root = this.root = el('div', 'fu-view');
    root.innerHTML = `
      <div class="tabs pt-tabs fu-tabs">${TABS.map(t => `<button class="tab" data-t="${t.id}" style="--tc:${t.color}" title="${esc(t.name)}">${glyph(t.glyph)}<span>${esc(t.id === 'surface' ? 'Surfaces' : t.name)}</span><span class="tab-n">0</span></button>`).join('')}</div>
      <div class="pt-card fu-card"><div class="pt-art"><img alt=""></div><div class="pt-info"><div class="pt-name"><b></b><span class="jp"></span><i class="pt-kind"></i></div><div class="pt-desc"></div><div class="pt-facts"></div></div><div class="pt-act"></div></div>
      <div class="grid g10 pt-grid fu-grid"></div>
      <div class="pt-empty">${glyph('sakura')}<span>Nothing in storage — it's all out in your home!</span></div>`;
    this.$ = { tabs: root.querySelector('.fu-tabs'), card: root.querySelector('.fu-card'), art: root.querySelector('.pt-art img'), name: root.querySelector('.pt-name b'), jp: root.querySelector('.pt-name .jp'), kind: root.querySelector('.pt-kind'), desc: root.querySelector('.pt-desc'), facts: root.querySelector('.pt-facts'), act: root.querySelector('.pt-act'), grid: root.querySelector('.fu-grid'), empty: root.querySelector('.pt-empty') };
    this.$.tabs.addEventListener('click', e => { const t = e.target.closest('.tab'); if (!t || t.dataset.t === this.tab) return; this.tab = t.dataset.t; this._sig = null; this.render(); replay(this.$.grid, 'swap', 400); this.ui.sfx?.('tab'); });
    const Gd = this.$.grid;
    Gd.addEventListener('click', e => { const s = e.target.closest('.pslot'); if (s?.dataset.id) { this.select(s.dataset.id); this.ui.sfx?.('select'); } });
    Gd.addEventListener('mouseover', e => { const s = e.target.closest('.pslot'); if (!s || s === this._hov) return; this._hov = s; const id = s.dataset.id; if (!id) return; this.ui.tip.show(furnitureTipHTML(id, this.st.furniture?.[id] || 0), 'item', s); });
    Gd.addEventListener('mouseout', e => { const s = e.target.closest('.pslot'); if (s && !s.contains(e.relatedTarget)) { this._hov = null; this.ui.tip.hide(s); } });
  }
  get st() { return this.ui.G?.state || {}; }
  get G() { return this.ui.G; }
  icon(id) { return SURFACES[id] ? surfaceSwatch(id) : furnitureThumb(this.G, id, false); }
  list() { return storageList(this.st, this.tab === 'all' ? null : this.tab); }
  select(id) { this.sel = id; this._csig = null; this.renderCard(); for (const c of this.cells) c.classList.toggle('sel', c.dataset.id === id); }
  render() {
    const all = storageList(this.st), list = this.list();
    for (const t of this.$.tabs.querySelectorAll('.tab')) {
      const k = t.dataset.t; t.classList.toggle('on', k === this.tab);
      setText(t.querySelector('.tab-n'), String(k === 'all' ? all.length : all.filter(e => tabOf(e.def) === k).length));
    }
    if (this.sel && !list.some(e => e.id === this.sel)) this.sel = null;
    if (!this.sel && list.length) this.sel = list[0].id;
    const sig = this.tab + '|' + list.map(e => e.id + ':' + e.n).join(',') + '|' + this.sel;
    if (sig !== this._sig) {
      this._sig = sig; this.queue.length = 0;
      const n = Math.max(30, Math.ceil(list.length / 10) * 10);
      while (this.cells.length < n) { const s = el('div', 'slot pslot'); s.style.setProperty('--i', this.cells.length); this.$.grid.appendChild(s); this.cells.push(s); }
      this.cells.forEach((s, i) => {
        s.style.display = i < n ? '' : 'none';
        const e = list[i], key = e ? e.id + ':' + e.n : '';
        if (s._k === key) { s.classList.toggle('sel', !!e && e.id === this.sel); return; }
        s._k = key;
        s.className = 'slot pslot' + (e ? ' has' : '') + (e && e.id === this.sel ? ' sel' : '');
        s.dataset.id = e ? e.id : '';
        if (!e) { s.innerHTML = ''; return; }
        s.style.setProperty('--kc', SETS[e.def.set]?.color || '#ffb07a');
        const u = this.icon(e.id); if (!u) this.queue.push(e.id);
        s.innerHTML = `<img src="${u || glyphURL('home')}" alt="" draggable="false" data-th="${e.id}" class="${u ? '' : 'fu-wait'}"><b class="qty">${e.n > 999 ? '999+' : e.n}</b>`;
      });
      this.pump();
    }
    this.$.empty.classList.toggle('on', !list.length);
    this.renderCard();
  }
  pump() {
    if (this._pumping) return; this._pumping = true;
    const step = () => {
      const t0 = performance.now();
      while (this.queue.length && performance.now() - t0 < 10) {
        const id = this.queue.shift(), u = furnitureThumb(this.G, id, true);
        for (const img of this.root.querySelectorAll(`img[data-th="${id}"]`)) if (u) { img.src = u; img.classList.remove('fu-wait'); }
      }
      if (this.queue.length && this.panel.isOpen) requestAnimationFrame(step); else { this._pumping = false; this._csig = null; this.renderCard(); }
    };
    requestAnimationFrame(step);
  }
  renderCard() {
    const id = this.sel, d = FURNITURE[id] || SURFACES[id], st = this.st;
    const csig = id + '|' + (st.furniture?.[id] || 0) + '|' + !!this.icon(id);
    if (csig === this._csig) return; this._csig = csig;
    this.$.card.classList.toggle('none', !d);
    if (!d) { this.$.act.innerHTML = ''; return; }
    const set = SETS[d.set];
    this.$.card.style.setProperty('--kc', set?.color || '#ffb07a');
    this.$.art.src = this.icon(id) || glyphURL('home');
    setText(this.$.name, d.name); setText(this.$.jp, d.jp || '');
    this.$.kind.textContent = d.kind ? (d.kind === 'wall' ? 'Wallpaper' : 'Floor') : CATS[d.cat]?.name || '';
    this.$.desc.textContent = d.desc || '';
    const n = st.furniture?.[id] || 0;
    const facts = [`${glyph('home')}In storage: <b>×${n}</b>${set ? ` · <b style="color:${set.color}">${esc(set.name)}</b>` : ''}`];
    if (!d.kind) facts.push(`${glyph('sparkle')}${d.mount === 'wall' ? `Hangs on a wall · ${d.size[0] * CELL} × ${d.size[1] * CELL} m` : d.mount === 'table' ? 'Goes on a table or a shelf' : d.mount === 'rug' ? `A rug · ${d.size[0] * CELL} × ${d.size[1] * CELL} m` : d.mount === 'ceiling' ? 'Hangs from the ceiling' : `${d.size[0] * CELL} × ${d.size[1] * CELL} m`}${d.light ? ' · it glows' : ''}`);
    if (d.tags?.length) facts.push(`${glyph('heart')}${d.tags.map(t => TAG_NAME[t] || t).join(' · ')}`);
    this.$.facts.innerHTML = facts.map(f => `<div>${f}</div>`).join('');
    this.$.act.innerHTML = `<div class="pt-hint">${glyph('home')}<span>At home, press <span class="kc sm">B</span> to decorate</span></div>`;
    replay(this.$.card, 'swap', 350);
  }
}
