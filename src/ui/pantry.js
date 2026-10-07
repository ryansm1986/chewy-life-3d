// The Pantry (docs/HOMESTEAD.md §1) in the inventory panel: category tabs, a grid of counters in the Bag's look, a
// detail card (Eat for dishes, planting tips for seeds) and tooltips. Also: the seed picker (F on tilled soil) and the
// pick-up feedback (toast with the icon and a "New!" badge for a first discovery, the icon flying into the bag).
import { el, esc, fmt, replay, setText } from './dom.js';
import { glyph } from './glyphs.js';
import { padGlyph, keyCap } from './padGlyphs.js';
import { Panel } from './panel.js';
import { PANTRY, KINDS, KIND_INFO, CROPS, RARE_NAMES, RARE_COLORS, LOVED, pantryList, sellPrice } from '../life/pantry.js';
import { pantryIcon } from '../life/pantryIcons.js';
import { VILLAGERS } from '../actors/roster.js';
import { Vector3 } from 'three';

import { BUFFS, TIER_NAMES } from '../life/meals.js';
const TAB_ICON = { all: 'turnipSeed', seed: 'carrotSeed', crop: 'carrot', fish: 'koi', forage: 'honey', dish: 'onigiri' };
const nameOf = id => id === 'rosie' ? 'Rosie' : VILLAGERS.find(v => v.id === id)?.spec.name || id;

/** Short facts about a pantry item (detail card + tooltip). */
export function pantryFacts(id, st) {
  const d = PANTRY[id]; if (!d) return [];
  const out = [];
  if (d.kind === 'seed') { const C = CROPS[d.crop]; out.push(`${glyph('sun')}Ripe in <b>${C.days}</b> watered days${C.regrow ? ` · fruits again every ${C.regrow}` : ''}`); }
  if (d.food) { const B = BUFFS[d.food.buff]; out.push(`${glyph('heart')}Heals <b>${Math.round(d.food.heal * 100)}%</b> life`); if (B) out.push(`${glyph(B.glyph)}Well Fed: <b>${B.name} ${TIER_NAMES[d.food.tier]}</b> <span class="pt-dim">(${B.text(d.food.tier)}, ${d.food.mins} min)</span>`); }
  const loved = (d.lovedBy || []).map(nameOf), liked = (d.likedBy || []).map(nameOf);
  if (loved.length) out.push(`${glyph('heart')}<b>${loved.join(', ')}</b> ${loved.length > 1 ? 'love' : 'loves'} this!`);
  else if (liked.length) out.push(`${glyph('gift')}${liked.join(' & ')} ${liked.length > 1 ? 'like' : 'likes'} this`);
  return out;
}
export function pantryTipHTML(id, st, extra = {}) {
  const d = PANTRY[id]; if (!d) return '';
  const K = KIND_INFO[d.kind], n = st?.pantry?.[id] || 0, rc = d.rare ? RARE_COLORS[d.rare] : K.color;
  const hints = extra.hints?.length ? `<div class="tt-hints">${extra.hints.map(h => `<span>${h}</span>`).join('')}</div>` : '';
  const price = extra.price ? `<div class="tt-price ${extra.price.afford === false ? 'bad' : ''}">${extra.price.label}: ${glyph('coin')}<b>${fmt(extra.price.value)}</b></div>` : '';
  return `<div class="tt-item tt-pantry" style="--rc:${rc}"><div class="tt-name">${esc(d.name)}</div>
    <div class="tt-kind"><span>${K.one}${d.rare ? ` · ${RARE_NAMES[d.rare]}` : ''}</span><span class="jp">${esc(d.jp)}</span></div>
    <div class="tt-d">${esc(d.desc)}</div>${pantryFacts(id, st).map(f => `<div class="tt-l tt-fact">${f}</div>`).join('')}
    <div class="tt-dim">You have ${n} · worth ${glyph('coin')}${d.value}</div>${price}${hints}</div>`;
}

// ------------------------------------------------------------------ the Pantry view (inside the inventory panel)
export class PantryView {
  constructor(panel) {
    this.panel = panel; this.ui = panel.ui; this.kind = 'all'; this.sel = null; this.cells = [];
    const root = this.root = el('div', 'pantry');
    root.innerHTML = `
      <div class="tabs pt-tabs">${['all', ...KINDS].map(k => `<button class="tab" data-k="${k}" style="--tc:${k === 'all' ? '#ff8fb0' : KIND_INFO[k].color}"><img class="pt-ti" src="${pantryIcon(TAB_ICON[k])}" alt="">${k === 'all' ? 'All' : KIND_INFO[k].name}<span class="tab-n">0</span></button>`).join('')}</div>
      <div class="pt-card"><div class="pt-art"><img alt=""></div><div class="pt-info"><div class="pt-name"><b></b><span class="jp"></span><i class="pt-kind"></i></div><div class="pt-desc"></div><div class="pt-facts"></div></div><div class="pt-act"></div></div>
      <div class="grid g10 pt-grid"></div>
      <div class="pt-empty">${glyph('sakura')}<span>Your pantry is empty — grow, fish and cook to fill it!</span></div>`;
    this.$ = { tabs: root.querySelector('.pt-tabs'), card: root.querySelector('.pt-card'), art: root.querySelector('.pt-art img'), name: root.querySelector('.pt-name b'), jp: root.querySelector('.pt-name .jp'), kind: root.querySelector('.pt-kind'), desc: root.querySelector('.pt-desc'), facts: root.querySelector('.pt-facts'), act: root.querySelector('.pt-act'), grid: root.querySelector('.pt-grid'), empty: root.querySelector('.pt-empty') };
    this.$.tabs.addEventListener('click', e => { const t = e.target.closest('.tab'); if (!t || t.dataset.k === this.kind) return; this.kind = t.dataset.k; this._sig = null; this.render(); replay(this.$.grid, 'swap', 400); this.ui.sfx?.('tab'); });
    const G = this.$.grid;
    G.addEventListener('click', e => { const s = e.target.closest('.pslot'); if (s?.dataset.id) { this.select(s.dataset.id); this.ui.sfx?.('select'); } });
    G.addEventListener('contextmenu', e => { const s = e.target.closest('.pslot'); if (!s?.dataset.id) return; e.preventDefault(); if (PANTRY[s.dataset.id]?.food) this.eat(s.dataset.id, s); });
    G.addEventListener('mouseover', e => { const s = e.target.closest('.pslot'); if (!s || s === this._hov) return; this._hov = s; const id = s.dataset.id; if (!id) return; this.ui.pantrySeen?.add(id); s.classList.remove('new'); this.ui.tip.show(pantryTipHTML(id, this.st, { hints: PANTRY[id].food ? ['<b>Right-click</b> eat', '<b>Click</b> details'] : ['<b>Click</b> details'] }), 'item', s); });
    G.addEventListener('mouseout', e => { const s = e.target.closest('.pslot'); if (s && !s.contains(e.relatedTarget)) { this._hov = null; this.ui.tip.hide(s); } });
    this.$.act.addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (b?.dataset.act === 'eat' && this.sel) this.eat(this.sel, b); });
  }
  get st() { return this.ui.G?.state || {}; }
  list() { return pantryList(this.st, this.kind === 'all' ? null : this.kind); }
  select(id) { this.sel = id; this._csig = null; this.renderCard(); for (const c of this.cells) c.classList.toggle('sel', c.dataset.id === id); }
  eat(id, from) {
    const A = this.ui.G?.actions; if (!A?.eat) return;
    const r = A.eat(id);
    if (!r) { if (from) replay(from, 'deny', 450); this.ui.sfx?.('deny'); this.ui.toast?.(this.ui.G.actions.life() <= 0 ? "Can't eat right now!" : 'Nothing left to eat!', { color: '#ff8a8a' }); return; }
    if (from) { const rc = from.getBoundingClientRect(); this.ui.burst(rc.left + rc.width / 2, rc.top + rc.height / 2, { n: 12, colors: ['#ff8fb0', '#ffcf4a', '#8fe0c0'], spread: 60 }); }
    this.render();
  }
  render() {
    const st = this.st, all = pantryList(st), list = this.list();
    // tab counts
    for (const t of this.$.tabs.querySelectorAll('.tab')) {
      const k = t.dataset.k; t.classList.toggle('on', k === this.kind);
      setText(t.querySelector('.tab-n'), String(k === 'all' ? all.length : all.filter(e => e.def.kind === k).length));
    }
    if (this.sel && !list.some(e => e.id === this.sel)) this.sel = null;
    if (!this.sel && list.length) this.sel = list[0].id;
    const sig = this.kind + '|' + list.map(e => e.id + ':' + e.n).join(',') + '|' + this.sel;
    if (sig !== this._sig) {
      this._sig = sig;
      const n = Math.max(30, Math.ceil(list.length / 10) * 10);
      while (this.cells.length < n) { const s = el('div', 'slot pslot'); s.style.setProperty('--i', this.cells.length); this.$.grid.appendChild(s); this.cells.push(s); }
      this.cells.forEach((s, i) => {
        s.style.display = i < n ? '' : 'none';
        const e = list[i];
        const key = e ? e.id + ':' + e.n : '';
        if (s._k === key) { s.classList.toggle('sel', !!e && e.id === this.sel); return; }
        const had = s._k; s._k = key;
        s.className = 'slot pslot' + (e ? ' has k-' + e.def.kind : '') + (e && e.id === this.sel ? ' sel' : '') + (e && !this.ui.pantrySeen?.has(e.id) && this.ui.pantryNew?.has(e.id) ? ' new' : '');
        s.dataset.id = e ? e.id : '';
        if (e) s.style.setProperty('--kc', e.def.rare ? RARE_COLORS[e.def.rare] : KIND_INFO[e.def.kind].color);
        s.innerHTML = e ? `<img src="${pantryIcon(e.id)}" alt="" draggable="false"><b class="qty">${e.n > 999 ? '999+' : e.n}</b>` : '';
        if (e && had && had.split(':')[0] === e.id && +had.split(':')[1] < e.n) replay(s, 'pop', 500);
      });
    }
    this.$.empty.classList.toggle('on', !list.length);
    this.renderCard();
  }
  renderCard() {
    const id = this.sel, d = PANTRY[id], st = this.st;
    const csig = id + '|' + (st.pantry?.[id] || 0);
    if (csig === this._csig) return; this._csig = csig;
    this.$.card.classList.toggle('none', !d);
    if (!d) { this.$.act.innerHTML = ''; return; }
    const K = KIND_INFO[d.kind];
    this.$.card.style.setProperty('--kc', d.rare ? RARE_COLORS[d.rare] : K.color);
    this.$.art.src = pantryIcon(id);
    setText(this.$.name, d.name); setText(this.$.jp, d.jp);
    this.$.kind.textContent = d.rare ? RARE_NAMES[d.rare] : K.one;
    this.$.desc.textContent = d.desc;
    const n = st.pantry?.[id] || 0;
    this.$.facts.innerHTML = [`${glyph('bag')}You have <b>×${n}</b> · worth ${glyph('coin')}<b>${d.value}</b>`, ...pantryFacts(id, st)].map(f => `<div>${f}</div>`).join('');
    if (d.food) this.$.act.innerHTML = `<button class="btn pink pt-eat" data-act="eat">${glyph('heart')}Eat</button><small>or right-click</small>`;
    else if (d.kind === 'seed') this.$.act.innerHTML = `<div class="pt-hint">${glyph('leaf')}<span>Press ${keyCap('interact', { sm: true })} at your garden bed to plant</span></div>`;
    else if (d.kind === 'crop') this.$.act.innerHTML = `<div class="pt-hint">${glyph('coin')}<span>Usagi pays <b>${sellPrice(id, 'usagi')}</b> at her stall</span></div>`;
    else if (d.kind === 'fish') this.$.act.innerHTML = `<div class="pt-hint">${glyph('coin')}<span>Kero pays <b>${sellPrice(id, 'kero')}</b> at the Fishing Hut</span></div>`;
    else this.$.act.innerHTML = '';
    replay(this.$.card, 'swap', 350);
  }
}

// ------------------------------------------------------------------ the seed picker (F on tilled soil)
export class SeedPickerPanel extends Panel {
  constructor(ui) { super(ui, { name: 'seeds', title: 'Plant Seeds', jp: 'たねまき', side: 'center', cls: 'p-seeds', icon: 'leaf' }); }
  init() {
    this.body.innerHTML = `<div class="sp-row"></div><div class="sp-foot kbm-only"><span><span class="kc sm">1</span>–<span class="kc sm">9</span> pick</span><span><span class="kc sm">F</span> / <span class="kc sm">Enter</span> plant</span><span><span class="kc sm">Esc</span> not now</span></div><div class="sp-foot pad-only"><span><span class="kc sm pad">${padGlyph('DRight')}</span> choose</span><span><span class="kc sm pad">${padGlyph('A')}</span> plant</span><span><span class="kc sm pad">${padGlyph('B')}</span> not now</span></div>`;
    this.row = this.body.querySelector('.sp-row');
    this.row.addEventListener('click', e => { const c = e.target.closest('.sp-card'); if (c) this.pick(c.dataset.id); });
    this.row.addEventListener('mouseover', e => { const c = e.target.closest('.sp-card'); if (c && c.dataset.id !== this.hl) this.highlight(c.dataset.id); });
    this.onKeyDown = e => {
      if (!this.isOpen) return;
      const m = /^Digit([1-9])$/.exec(e.code);
      if (m) { const id = this.opts.seeds?.[+m[1] - 1]; if (id) { e.preventDefault(); e.stopPropagation(); this.pick(id); } return; }
      if (e.code === 'KeyF' || e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); e.stopPropagation(); this.pick(this.hl); return; }
      if (e.code === 'ArrowRight' || e.code === 'ArrowLeft' || e.code === 'KeyD' || e.code === 'KeyA') { e.preventDefault(); const s = this.opts.seeds || [], k = s.indexOf(this.hl), d = e.code === 'ArrowRight' || e.code === 'KeyD' ? 1 : -1; this.highlight(s[(k + d + s.length) % s.length]); this.ui.sfx?.('tick'); }
    };
  }
  onOpen() {
    const st = this.st, seeds = this.opts.seeds || [];
    this.row.innerHTML = seeds.map((id, i) => { const d = PANTRY[id], C = CROPS[d.crop]; return `<div class="sp-card" data-id="${id}" style="--i:${i};--kc:${C.color}"><span class="kc sm sp-k">${i + 1}</span><div class="sp-art"><img src="${pantryIcon(id)}" alt=""></div><b>${esc(PANTRY[d.crop].name)}</b><small>×${st.pantry?.[id] || 0} · ${C.days} days${C.regrow ? ' ↺' : ''}</small></div>`; }).join('');
    this.highlight(this.opts.last || seeds[0]);
    addEventListener('keydown', this.onKeyDown, true);
  }
  onClose() { removeEventListener('keydown', this.onKeyDown, true); }
  highlight(id) { this.hl = id; for (const c of this.row.querySelectorAll('.sp-card')) c.classList.toggle('on', c.dataset.id === id); }
  pick(id) {
    if (!id) return;
    const cb = this.opts.onPick;
    this.ui.close('seeds');
    this.ui.sfx?.('select');
    cb?.(id);
  }
}

// ------------------------------------------------------------------ pick-up feedback
/** A pantry gain: toast with the icon ("New!" on a first discovery) and the icon flying into the bag. */
export function pantryGain(ui, id, n = 1, { first = false, worldPos = null, quiet = false } = {}) {
  const d = PANTRY[id]; if (!d || !ui.ready) return;
  const icon = pantryIcon(id), K = KIND_INFO[d.kind];
  if (first) (ui.pantryNew ||= new Set()).add(id);
  if (!quiet) ui.toast(`${esc(d.name)}${n > 1 ? ` ×${n}` : ''}${first ? ' <b class="t-new">New!</b>' : ''}`, { iconURL: icon, html: true, color: d.rare ? RARE_COLORS[d.rare] : K.color, sub: first ? `Added to your Pantry · ${K.one}` : 'Pantry', group: 'loot' });
  let from = { x: innerWidth / 2, y: innerHeight / 2 };
  const cam = ui.G?.engine?.camera, wp = worldPos || ui.hud.playerPos?.();
  if (cam && wp) { const p = new Vector3(wp.x, wp.y || 0, wp.z).project(cam); from = { x: (p.x * 0.5 + 0.5) * innerWidth, y: (-p.y * 0.5 + 0.5) * innerHeight }; }
  ui.flyToBag(icon, from);
}
