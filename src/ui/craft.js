// The Workbench panel (docs/HOUSING.md §3): opened at the cottage's workbench or the Lumber workshop's
// (G.openWorkbench, home/sources.js). In the Cook panel's look (it shares the p-cook styles, life.css): the recipe list
// on the left (known and makeable first, then the rest you know, then "???" with where the recipe comes from), the
// chosen piece on the right (its 3D thumbnail, set, size, tags, what's in storage), the materials with have / need, a
// ×N stepper and Craft. While it's made, a little bench takes over the card: the materials drop onto it, a hammer
// taps away in a puff of sawdust, the piece builds up from its silhouette and pops out, then flies to your storage.
import './craft.css';
import { esc, replay } from './dom.js';
import { glyph, glyphURL } from './glyphs.js';
import { Panel } from './panel.js';
import { Events } from '../core/events.js';
import { PANTRY } from '../life/pantry.js';
import { pantryIcon } from '../life/pantryIcons.js';
import { FURNITURE, SETS, CATS, CELL } from '../home/furniture.js';
import { RECIPES, RECIPE_IDS, knowsRecipe, maxCraft, ingredientsOf, haveOf, recipeHint, workbenchOf } from '../home/recipes.js';
import { craftTime } from '../home/sources.js';
import { furnitureThumb } from './decorate.js';
import { VILLAGERS } from '../actors/roster.js';

const NAMES = Object.fromEntries([['rosie', 'Rosie'], ['tanu', 'Tanu'], ...VILLAGERS.map(v => [v.id, v.spec.name])]);
const TAG_NAME = { cozy: 'Cozy', warm: 'Warm', nature: 'Nature', water: 'Water', lantern: 'Lantern', bookish: 'Bookish', sweet: 'Sweet', music: 'Music', retro: 'Retro', festive: 'Festive', elegant: 'Elegant', cute: 'Cute' };
const ingName = e => (e.kind === 'mat' ? e.k[0].toUpperCase() + e.k.slice(1) : PANTRY[e.k]?.name || e.k);
const sizeText = d => (d.mount === 'wall' ? `${d.size[0] * CELL} × ${d.size[1] * CELL} m, on a wall` : d.mount === 'table' ? 'on a table' : d.mount === 'ceiling' ? 'hangs from the ceiling' : `${d.size[0] * CELL} × ${d.size[1] * CELL} m`);
const DUST = 9;

export class CraftPanel extends Panel {
  constructor(ui) { super(ui, { name: 'craft', title: 'Workbench', jp: 'さぎょうだい', side: 'left', cls: 'p-cook p-craft', icon: 'hammer' }); this.sel = null; this.qty = 1; this.queue = []; }
  init() {
    this.extra.innerHTML = `<div class="tabs ck-tabs cr-tabs"><button class="tab on" style="--tc:#ffb07a">${glyph('scroll')}Recipes<span class="tab-n">0</span></button></div>`;
    this.body.innerHTML = `<div class="ck cr">
      <div class="ck-list cr-list"></div>
      <div class="ck-main">
        <div class="ck-det cr-det"></div>
        <div class="cr-work"><div class="cw-glow"></div>
          <div class="cw-piece"><img class="ghost" alt=""><img class="fill" alt=""></div>
          <div class="cw-bench"><i class="cw-leg l"></i><i class="cw-leg r"></i><i class="cw-vice"></i><i class="cw-saw"></i></div>
          <div class="cw-drops"></div>
          <div class="cw-hammer">${glyph('hammer')}</div>
          <div class="cw-dust">${Array.from({ length: DUST }, (_, i) => `<i style="--k:${i};--dx:${Math.round(Math.cos(i * 0.7 + 0.4) * (36 + (i % 3) * 14))}px;--dy:${Math.round(-18 - Math.abs(Math.sin(i * 1.3)) * 46)}px"></i>`).join('')}</div>
          <svg class="kp-ring cw-ring" viewBox="0 0 100 100"><circle cx="50" cy="50" r="44"/><circle class="fill" cx="50" cy="50" r="44"/></svg>
          <div class="cw-out"><div class="cw-plate"><img alt=""></div><b></b><small></small></div>
        </div>
      </div>
    </div>
    <div class="ck-foot"><span><span class="kc sm">↑</span><span class="kc sm">↓</span> choose</span><span><span class="kc sm">F</span> / <span class="kc sm">Enter</span> craft</span><span><span class="kc sm">Esc</span> close</span></div>`;
    const q = s => this.body.querySelector(s);
    this.$ = { list: q('.cr-list'), main: q('.ck-main'), det: q('.cr-det'), work: q('.cr-work'), drops: q('.cw-drops'), ghost: q('.cw-piece .ghost'), fill: q('.cw-piece .fill'), out: q('.cw-out'), tabN: this.extra.querySelector('.tab-n') };
    this.$.list.addEventListener('click', e => { const r = e.target.closest('.ck-row'); if (!r || this.busy) return; this.select(r.dataset.id); this.ui.sfx?.('select'); });
    this.$.det.addEventListener('click', e => {
      const b = e.target.closest('[data-q]');
      if (b) { const m = maxCraft(this.st, this.sel); this.qty = b.dataset.q === 'max' ? Math.max(1, m) : Math.max(1, Math.min(Math.max(1, m), this.qty + +b.dataset.q)); this._sig = null; this.render(); this.ui.sfx?.('tick'); return; }
      if (e.target.closest('.ck-go')) this.craft();
    });
    const tipFor = t => {
      const k = t.dataset.tip; if (!k) return null;
      if (k.startsWith('mat:')) { const m = k.slice(4); return `<div class="tt-item"><div class="tt-name">${esc(m[0].toUpperCase() + m.slice(1))}</div><div class="tt-d">A crafting material from the Burrow and the regions. You have ${this.st.materials?.[m] || 0}.</div></div>`; }
      return this.ui.pantryTipHTML ? this.ui.pantryTipHTML(k) : null;
    };
    this.body.addEventListener('mouseover', e => { const t = e.target.closest('[data-tip]'); if (!t || t === this._hov) return; this._hov = t; const h = tipFor(t); if (h) this.ui.tip.show(h, 'item', t); });
    this.body.addEventListener('mouseout', e => { const t = e.target.closest('[data-tip]'); if (t && !t.contains(e.relatedTarget)) { this._hov = null; this.ui.tip.hide(t); } });
    this.onKeyDown = e => {
      if (!this.isOpen || this.busy) return;
      if (e.code === 'KeyF' || e.code === 'Enter') { e.preventDefault(); e.stopPropagation(); this.craft(); return; }
      if (e.code === 'ArrowDown' || e.code === 'ArrowUp') {
        e.preventDefault(); e.stopPropagation();
        const ids = this.order, k = ids.indexOf(this.sel); this.select(ids[(k + (e.code === 'ArrowDown' ? 1 : -1) + ids.length) % ids.length]); this.ui.sfx?.('tick');
      }
    };
  }
  onOpen() {
    this.setTitle(this.opts.title || 'Workbench', this.opts.jp || 'さぎょうだい');
    this.panel.dataset.where = this.opts.where || 'home';
    workbenchOf(this.st);
    this.busy = false; this.$.work.className = 'cr-work';
    this.sel = null; this.qty = 1; this._sig = null;
    this.render();
    replay(this.$.main, 'swap', 350);
    addEventListener('keydown', this.onKeyDown, true);
    const re = () => { this._sig = null; this.refresh(); };
    this._offs = ['materials:changed', 'pantry:changed', 'furniture:changed', 'workbench:learned'].map(n => Events.on(n, re));
  }
  onClose() { removeEventListener('keydown', this.onKeyDown, true); for (const off of this._offs || []) off?.(); this._offs = null; this.ui.tip.hide(); this.queue.length = 0; }
  // ---------------------------------------------------------------- the recipe list
  /** known and makeable first, then the rest you know, then the ones you don't (catalog order inside each) */
  get order() {
    const st = this.st, known = RECIPE_IDS.filter(id => knowsRecipe(st, id));
    return [...known.filter(id => maxCraft(st, id) > 0), ...known.filter(id => maxCraft(st, id) <= 0), ...RECIPE_IDS.filter(id => !knowsRecipe(st, id))];
  }
  thumb(out, big = false) {
    const u = furnitureThumb(this.G, out, false);
    if (!u) this.queue.push(out);
    return `<img src="${u || glyphURL('home')}" alt="" draggable="false" data-th="${out}" class="${u ? '' : 'fu-wait'}${big ? ' big' : ''}">`;
  }
  render() {
    if (!this.built || !this.isOpen) return;
    const st = this.st, ids = this.order;
    if (!this.sel || !ids.includes(this.sel)) this.sel = ids[0];
    const sig = this.sel + '|' + this.qty + '|' + JSON.stringify(st.materials || {}) + '|' + JSON.stringify(st.pantry || {}) + '|' + JSON.stringify(st.workbench?.known || {}) + '|' + JSON.stringify(st.furniture || {});
    if (sig === this._sig) return; this._sig = sig;
    this.queue.length = 0;
    this.$.tabN.textContent = `${RECIPE_IDS.filter(id => knowsRecipe(st, id)).length}/${RECIPE_IDS.length}`;
    this.$.list.innerHTML = ids.map((id, i) => {
      const R = RECIPES[id], d = FURNITURE[R.out], known = knowsRecipe(st, id), m = known ? maxCraft(st, id) : 0, set = SETS[d.set], H = recipeHint(id, NAMES);
      const tag = known ? `<i class="ck-n ${m ? 'ok' : ''}">×${m}</i>` : `<i class="ck-tag">${glyph(R.learn === 'shop' ? 'shop' : 'heart')}${R.learn === 'shop' ? 'Tanu' : 'Gift'}</i>`;
      return `<div class="ck-row cr-row ${known ? 'known' : 'unk'} ${id === this.sel ? 'on' : ''} ${m ? 'can' : ''}" data-id="${id}" style="--i:${i};--bc:${set?.color || '#ffb07a'}">
        <div class="ck-ic">${this.thumb(R.out).replace('class="', `class="${known ? '' : 'sil '}`)}</div>
        <div class="ck-t"><b>${known ? esc(d.name) : '???'}</b><small>${known ? `${glyph('home')}${esc(set?.name || '')} · ${esc(CATS[d.cat]?.name || '')}` : esc(H.how)}</small></div>${tag}</div>`;
    }).join('');
    this.renderDet();
    if (this.queue.length) this.pump();
  }
  select(id) { if (!id) return; this.sel = id; this.qty = 1; this._sig = null; this.render(); replay(this.$.det, 'swap', 300); }
  renderDet() {
    const st = this.st, id = this.sel; if (!id) { this.$.det.innerHTML = ''; return; }
    const R = RECIPES[id], d = FURNITURE[R.out], set = SETS[d.set], known = knowsRecipe(st, id), m = known ? maxCraft(st, id) : 0, H = recipeHint(id, NAMES);
    this.qty = Math.max(1, Math.min(this.qty, Math.max(1, m)));
    const n = known ? this.qty : 1;
    const ing = ingredientsOf(id).map(e => {
      const have = haveOf(st, e.kind, e.k), ok = have >= e.n * n, tip = e.kind === 'mat' ? 'mat:' + e.k : e.k;
      const art = e.kind === 'mat' ? `<span class="ck-mat">${glyph(e.k)}</span>` : `<img src="${pantryIcon(e.k)}" alt="" draggable="false">`;
      return known ? `<div class="ck-i ${ok ? 'ok' : 'bad'}" data-tip="${tip}"><div class="ck-ia">${art}</div><b>${esc(ingName(e))}</b><small><em>${have}</em>/${e.n * n}</small></div>`
        : `<div class="ck-i unk"><div class="ck-ia"><span class="q">?</span></div><b>${esc(ingName(e))}</b></div>`;
    }).join('');
    const inStore = st.furniture?.[R.out] || 0, made = st.workbench?.crafted?.[id] || 0;
    const go = known ? `<div class="ck-go-row"><div class="ck-q"><button class="btn sm" data-q="-1">−</button><b>${this.qty}</b><button class="btn sm" data-q="1">+</button><button class="btn sm" data-q="max">Max</button></div>
        <button class="btn big pink ck-go ${m ? '' : 'dis'}">${glyph('hammer')}Craft ×${this.qty}</button></div>${m ? '' : `<div class="ck-short">Missing materials — ${R.pantry && Object.keys(R.pantry).length ? 'grow, fish or forage, and ' : ''}dig some up in the Burrow!</div>`}`
      : `<div class="ck-how">${glyph(R.learn === 'shop' ? 'shop' : 'heart')}<span>Not on your workbench yet: <b>${esc(H.how)}</b>${R.learn === 'shop' ? " — look for the scroll at Tanu's Trinkets on Market Street." : ' — help them make their home lovely.'}</span></div>`;
    this.$.det.innerHTML = `<div class="ck-hero cr-hero" style="--bc:${set?.color || '#ffb07a'};--rc:#fff">
        <div class="ck-art cr-art ${known ? '' : 'unk'}">${this.thumb(R.out, true).replace('class="', `class="${known ? '' : 'sil '}`)}</div>
        <div class="ck-info"><div class="ck-name"><b>${known ? esc(d.name) : '???'}</b>${known ? `<span class="jp">${esc(d.jp || '')}</span>` : ''}<i class="cr-set">${esc(set?.name || '')}</i></div>
          <div class="ck-desc">${known ? esc(d.desc || '') : 'A piece you have yet to learn to make.'}</div>
          <div class="ck-eff"><span class="ck-chip">${glyph('home')}<b>${esc(CATS[d.cat]?.name || '')}</b>· ${esc(sizeText(d))}</span>${d.light ? `<span class="ck-chip cr-glow">${glyph('lantern')}<b>Glows</b></span>` : ''}</div>
          ${known && d.tags?.length ? `<div class="cr-tags">${d.tags.map(t => `<span>${TAG_NAME[t] || t}</span>`).join('')}</div>` : ''}
          <div class="ck-btext">${known ? `In storage ×${inStore}${made ? ` · crafted ×${made}` : ''}${R.n > 1 ? ` · makes ${R.n}` : ''}` : ''}</div></div></div>
      <div class="ck-ing-h">${glyph('wood')}Materials</div><div class="ck-ing">${ing}</div>${go}`;
  }
  // render missing thumbnails a few per frame
  pump() {
    if (this._pumping) return; this._pumping = true;
    const step = () => {
      const t0 = performance.now();
      while (this.queue.length && performance.now() - t0 < 10) {
        const id = this.queue.shift(), u = furnitureThumb(this.G, id, true);
        if (u) for (const img of this.body.querySelectorAll(`img[data-th="${id}"]`)) { img.src = u; img.classList.remove('fu-wait'); }
      }
      if (this.queue.length && this.isOpen) requestAnimationFrame(step); else this._pumping = false;
    };
    requestAnimationFrame(step);
  }
  // ---------------------------------------------------------------- crafting
  async craft() {
    const WB = this.G?.workbench, st = this.st, id = this.sel;
    if (!WB || this.busy || !id) return;
    if (!knowsRecipe(st, id) || maxCraft(st, id) < 1) { replay(this.$.det.querySelector('.ck-go') || this.$.det, 'deny', 400); this.ui.sfx?.('deny'); return; }
    const n = Math.min(this.qty, maxCraft(st, id)), R = RECIPES[id];
    this.busy = true;
    this.workStart(id, n, craftTime(n));
    const r = await WB.craft(id, n);
    if (!this.isOpen) { this.busy = false; return; }
    if (!r.ok) { this.workEnd(); this.ui.toast?.(r.fail || "That didn't work…", { icon: 'hammer', color: '#ffb07a' }); this.busy = false; return; }
    this.workDone(r);
    setTimeout(() => {
      const img = this.$.out.querySelector('img'), rc = img.getBoundingClientRect();
      this.ui.flyToBag?.(img.src, { x: rc.left + rc.width / 2, y: rc.top + rc.height / 2 });
      this.workEnd(); this.busy = false;
      this._sig = null; this.render();
    }, 1350);
    void R;
  }
  workStart(id, n, dur) {
    const W = this.$.work, out = RECIPES[id].out, u = furnitureThumb(this.G, out, true) || glyphURL('home');
    W.style.setProperty('--dur', dur + 'ms');
    this.$.ghost.src = u; this.$.fill.src = u;
    const icons = ingredientsOf(id).flatMap(e => Array(Math.min(3, e.n * n)).fill(e));
    this.$.drops.innerHTML = icons.slice(0, 7).map((e, i, a) => `<i style="--i:${i};--x:${(i - (a.length - 1) / 2) * 34}px">${e.kind === 'mat' ? glyph(e.k) : `<img src="${pantryIcon(e.k)}" alt="">`}</i>`).join('');
    W.className = 'cr-work on';
    void W.offsetWidth; W.classList.add('go');
  }
  workDone(r) {
    const d = FURNITURE[r.out], W = this.$.work, o = this.$.out;
    o.querySelector('img').src = furnitureThumb(this.G, r.out, true) || glyphURL('home');
    o.querySelector('b').textContent = `${d.name}${r.n > 1 ? ` ×${r.n}` : ''}!`;
    o.querySelector('small').innerHTML = r.first ? `${glyph('sparkle')}New! Sent to your storage ♡` : `${glyph('home')}Sent to your storage ♡`;
    W.classList.add('done'); if (r.first) W.classList.add('first');
    const rc = o.getBoundingClientRect();
    this.ui.burst?.(rc.left + rc.width / 2, rc.top + rc.height * 0.35, { n: r.first ? 26 : 16, spread: r.first ? 120 : 80, colors: ['#ffcf4a', '#fff3b8', '#ffb07a', '#8fe0c0'] });
    if (r.first) this.ui.burst?.(rc.left + rc.width / 2, rc.top + rc.height * 0.35, { n: 12, spread: 90, kind: 'star', colors: ['#ffcf4a', '#fff3b8'] });
  }
  workEnd() { this.$.work.className = 'cr-work'; }
}
