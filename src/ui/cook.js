// The Cook panel (docs/HOMESTEAD.md §4): opened at Chewy's kitchen, a campfire or Rosie's oven (life/kitchen.js).
// Recipes: the cookbook on the left (what you can make here and how many, then recipes for other stations, then "???"
// with a hint of what's in them and who might teach you), the chosen dish on the right (its heal and Well Fed buff,
// ingredients with have / need, a ×N stepper and Cook). Try a mix: put up to four ingredients in the pot; a known
// combination makes its dish, an unknown one is a discovery, anything else a sensible fallback. While it cooks, a pot
// bubbles over the card (the ingredients drop in, the steam rises, the dish pops out and flies to the pantry).
import { el, esc, replay } from './dom.js';
import { glyph } from './glyphs.js';
import { Panel } from './panel.js';
import { PANTRY, RARE_NAMES, RARE_COLORS, KIND_INFO } from '../life/pantry.js';
import { pantryIcon } from '../life/pantryIcons.js';
import { RECIPES, RECIPE_IDS, STATIONS, cookbookOf, maxCook, haveOf, wildIds, cookableAt, hintFor } from '../life/cooking.js';
import { BUFFS, TIER_NAMES } from '../life/meals.js';
import { VILLAGERS } from '../actors/roster.js';

const NAMES = Object.fromEntries([['rosie', 'Rosie'], ...VILLAGERS.map(v => [v.id, v.spec.name])]);
const WILD = { fish: { name: 'Any fish', icon: 'crucian' }, crop: { name: 'Any veggies', icon: 'carrot' } };
const ingName = k => (WILD[k] ? WILD[k].name : k.startsWith('mat:') ? k.slice(4)[0].toUpperCase() + k.slice(5) : PANTRY[k]?.name || k);
const MIX_MAX = 4;

export class CookPanel extends Panel {
  constructor(ui) { super(ui, { name: 'cook', title: 'Cooking', jp: 'りょうり', side: 'left', cls: 'p-cook', icon: 'fire' }); this.tab = 'book'; this.sel = null; this.qty = 1; this.picks = {}; }
  get K() { return this.G?.life?.kitchen; }
  init() {
    this.extra.innerHTML = `<div class="tabs ck-tabs"><button class="tab on" data-t="book" style="--tc:#ff8fb0">${glyph('book')}Recipes<span class="tab-n">0</span></button><button class="tab" data-t="mix" style="--tc:#8fe0c0">${glyph('sparkle')}Try a mix</button></div>`;
    this.body.innerHTML = `<div class="ck">
      <div class="ck-list"></div>
      <div class="ck-main">
        <div class="ck-det"></div>
        <div class="ck-mix">
          <div class="mx-top"><b>${glyph('fire')}Into the pot…</b><small>Up to ${MIX_MAX} ingredients. A real recipe teaches you its dish!</small></div>
          <div class="mx-slots"></div>
          <div class="mx-grid"></div>
          <div class="mx-go"><button class="btn big mint ck-mixgo">${glyph('sparkle')}Cook it!</button><button class="btn sm mx-clear">${glyph('x')}Clear</button></div>
        </div>
        <div class="ck-pot"><div class="kp-glow"></div><div class="kp-steam"><i></i><i></i><i></i><i></i></div><div class="kp-drops"></div>
          <div class="kp-pot"><div class="kp-broth"><i></i><i></i><i></i><i></i></div><div class="kp-ear l"></div><div class="kp-ear r"></div></div>
          <div class="kp-fire"><i></i><i></i><i></i></div>
          <svg class="kp-ring" viewBox="0 0 100 100"><circle cx="50" cy="50" r="44"/><circle class="fill" cx="50" cy="50" r="44"/></svg>
          <div class="kp-out"><div class="kp-plate"><img alt=""></div><b></b><small></small></div>
        </div>
      </div>
    </div>
    <div class="ck-foot"><span><span class="kc sm">↑</span><span class="kc sm">↓</span> choose</span><span><span class="kc sm">F</span> / <span class="kc sm">Enter</span> cook</span><span><span class="kc sm">Esc</span> close</span></div>`;
    const q = s => this.body.querySelector(s);
    this.$ = { list: q('.ck-list'), main: q('.ck-main'), det: q('.ck-det'), mix: q('.ck-mix'), slots: q('.mx-slots'), grid: q('.mx-grid'), pot: q('.ck-pot'), drops: q('.kp-drops'), out: q('.kp-out'), ring: q('.kp-ring .fill'), tabN: this.extra.querySelector('.tab-n') };
    this.extra.querySelector('.ck-tabs').addEventListener('click', e => { const t = e.target.closest('.tab'); if (t && t.dataset.t !== this.tab) { this.setTab(t.dataset.t); this.ui.sfx?.('tab'); } });
    this.$.list.addEventListener('click', e => { const r = e.target.closest('.ck-row'); if (!r) return; if (this.tab !== 'book') this.setTab('book'); this.select(r.dataset.id); this.ui.sfx?.('select'); });
    this.$.det.addEventListener('click', e => {
      const b = e.target.closest('[data-q]'); if (b) { const m = maxCook(this.st, this.sel); this.qty = b.dataset.q === 'max' ? Math.max(1, m) : Math.max(1, Math.min(Math.max(1, m), this.qty + +b.dataset.q)); this.renderDet(); this.ui.sfx?.('tick'); return; }
      if (e.target.closest('.ck-go')) this.cook();
    });
    this.$.grid.addEventListener('click', e => { const c = e.target.closest('.mx-it'); if (!c) return; this.addPick(c.dataset.id); });
    this.$.slots.addEventListener('click', e => { const c = e.target.closest('.mx-slot.has'); if (!c) return; const k = c.dataset.id; if (--this.picks[k] <= 0) delete this.picks[k]; this.renderMix(); this.ui.sfx?.('tick'); });
    this.$.mix.querySelector('.ck-mixgo').addEventListener('click', () => this.cook());
    this.$.mix.querySelector('.mx-clear').addEventListener('click', () => { this.picks = {}; this.renderMix(); this.ui.sfx?.('tick'); });
    const tipFor = t => {
      const id = t.dataset.tip; if (!id) return null;
      if (id.startsWith('mat:')) return `<div class="tt-item"><div class="tt-name">${esc(ingName(id))}</div><div class="tt-d">A crafting material from the Burrow. You have ${this.st.materials?.[id.slice(4)] || 0}.</div></div>`;
      return this.ui.pantryTipHTML ? this.ui.pantryTipHTML(id) : null;
    };
    this.body.addEventListener('mouseover', e => { const t = e.target.closest('[data-tip]'); if (!t || t === this._hov) return; this._hov = t; const h = tipFor(t); if (h) this.ui.tip.show(h, 'item', t); });
    this.body.addEventListener('mouseout', e => { const t = e.target.closest('[data-tip]'); if (t && !t.contains(e.relatedTarget)) { this._hov = null; this.ui.tip.hide(t); } });
    this.onKeyDown = e => {
      if (!this.isOpen || this.cooking) return;
      if (e.code === 'KeyF' || e.code === 'Enter') { e.preventDefault(); e.stopPropagation(); this.cook(); return; }
      if (this.tab === 'book' && (e.code === 'ArrowDown' || e.code === 'ArrowUp')) {
        e.preventDefault(); e.stopPropagation();
        const ids = this.order, k = ids.indexOf(this.sel); this.select(ids[(k + (e.code === 'ArrowDown' ? 1 : -1) + ids.length) % ids.length]); this.ui.sfx?.('tick');
      }
    };
  }
  get station() { return this.opts.station || 'kitchen'; }
  onOpen() {
    const S = STATIONS[this.station];
    this.setTitle(S.name, S.jp);
    this.panel.dataset.station = this.station;
    this.cooking = false; this.$.pot.className = 'ck-pot';
    cookbookOf(this.st);
    this.sel = null; this.qty = 1; this.picks = {};
    this.setTab(this.opts.tab || 'book', true);
    addEventListener('keydown', this.onKeyDown, true);
  }
  onClose() { removeEventListener('keydown', this.onKeyDown, true); this.ui.tip.hide(); }
  setTab(t, quiet) {
    this.tab = t;
    for (const b of this.extra.querySelectorAll('.ck-tabs .tab')) b.classList.toggle('on', b.dataset.t === t);
    this.panel.classList.toggle('mixing', t === 'mix');
    this._sig = null; this.render();
    if (!quiet) replay(this.$.main, 'swap', 350);
  }
  // ---------------------------------------------------------------- the cookbook list
  /** known & cookable here (makeable first), then this station's unknown ones, then the rest */
  get order() {
    const st = this.st, kn = st.cookbook?.known || {}, here = id => cookableAt(id, this.station);
    const known = RECIPE_IDS.filter(id => id in kn), unk = RECIPE_IDS.filter(id => !(id in kn));
    const a = known.filter(here).sort((x, y) => (maxCook(st, y) > 0) - (maxCook(st, x) > 0) || PANTRY[x].food.tier - PANTRY[y].food.tier || PANTRY[x].value - PANTRY[y].value);
    return [...a, ...unk.filter(here), ...known.filter(id => !here(id)), ...unk.filter(id => !here(id))];
  }
  render() {
    if (!this.built || !this.isOpen) return;
    const st = this.st, kn = st.cookbook?.known || {}, ids = this.order;
    if (!this.sel || !ids.includes(this.sel)) this.sel = ids[0];
    const sig = this.tab + '|' + this.sel + '|' + this.qty + '|' + JSON.stringify(st.pantry || {}) + (st.materials?.mochi || 0) + '|' + Object.keys(kn).join() + '|' + JSON.stringify(this.picks);
    if (sig === this._sig) return; this._sig = sig;
    this.$.tabN.textContent = Object.keys(kn).length;
    this.$.list.innerHTML = ids.map((id, i) => {
      const d = PANTRY[id], known = id in kn, here = cookableAt(id, this.station), m = known && here ? maxCook(st, id) : 0, B = BUFFS[d.food.buff];
      const tag = !here ? `<i class="ck-tag">${glyph(RECIPES[id].at.includes('oven') ? 'shop' : 'home')}${RECIPES[id].at.includes('oven') ? 'Oven' : 'Kitchen'}</i>` : known ? `<i class="ck-n ${m ? 'ok' : ''}">×${m}</i>` : '';
      return `<div class="ck-row ${known ? 'known' : 'unk'} ${here ? '' : 'away'} ${id === this.sel ? 'on' : ''} ${m ? 'can' : ''}" data-id="${id}" style="--i:${i};--bc:${B.color}">
        <div class="ck-ic"><img class="${known ? '' : 'sil'}" src="${pantryIcon(id)}" alt="" draggable="false"></div>
        <div class="ck-t"><b>${known ? esc(d.name) : '???'}</b><small>${known ? `${glyph(B.glyph)}${B.name} ${TIER_NAMES[d.food.tier]}` : esc(hintFor(id, NAMES).how)}</small></div>${tag}</div>`;
    }).join('');
    if (this.tab === 'book') this.renderDet(); else this.renderMix();
  }
  select(id) { this.sel = id; this.qty = 1; this._sig = null; this.render(); }
  renderDet() {
    const st = this.st, id = this.sel; if (!id) { this.$.det.innerHTML = ''; return; }
    const d = PANTRY[id], R = RECIPES[id], known = id in (st.cookbook?.known || {}), here = cookableAt(id, this.station), B = BUFFS[d.food.buff], m = known && here ? maxCook(st, id) : 0;
    this.qty = Math.max(1, Math.min(this.qty, Math.max(1, m)));
    const rc = RARE_COLORS[d.rare || 0], H = hintFor(id, NAMES);
    const ing = R.ing.map(({ k, n }) => {
      const have = haveOf(st, k), ok = have >= n * (known ? this.qty : 1), icon = WILD[k] ? pantryIcon(wildIds(k, st)[0] || WILD[k].icon) : k.startsWith('mat:') ? null : pantryIcon(k);
      const art = icon ? `<img src="${icon}" alt="" draggable="false">` : `<span class="ck-mat">${glyph(k.slice(4))}</span>`;
      return known ? `<div class="ck-i ${ok ? 'ok' : 'bad'} ${WILD[k] ? 'wild' : ''}" data-tip="${WILD[k] ? '' : k}"><div class="ck-ia">${art}</div><b>${esc(ingName(k))}</b><small><em>${have}</em>/${n * this.qty}</small></div>`
        : `<div class="ck-i unk"><div class="ck-ia"><span class="q">?</span></div><b>${esc(ingName(k))}</b></div>`;
    }).join('');
    const where = !here ? `<div class="ck-away">${glyph(R.at.includes('oven') ? 'shop' : 'home')}<span>Cook this at ${R.at.includes('oven') ? "Rosie's oven — ask her to <b>Bake with Rosie</b>" : R.at.includes('kitchen') ? 'your <b>kitchen</b> at home' : 'a campfire'}.</span></div>` : '';
    const go = known && here ? `<div class="ck-go-row"><div class="ck-q"><button class="btn sm" data-q="-1">−</button><b>${this.qty}</b><button class="btn sm" data-q="1">+</button><button class="btn sm" data-q="max">Max</button></div>
        <button class="btn big pink ck-go ${m ? '' : 'dis'}">${glyph('fire')}Cook ×${this.qty}</button></div>${m ? '' : '<div class="ck-short">Missing ingredients — grow, fish or forage for them!</div>'}`
      : !known ? `<div class="ck-how">${glyph('book')}<span>Not in your cookbook yet: <b>${esc(H.how)}</b>. Or try mixing ${esc(H.ingredients.join(' + '))} in <b>Try a mix</b>…</span></div>` : '';
    this.$.det.innerHTML = `<div class="ck-hero" style="--rc:${rc};--bc:${B.color}">
        <div class="ck-art ${known ? '' : 'unk'}"><img class="${known ? '' : 'sil'}" src="${pantryIcon(id)}" alt="" draggable="false"></div>
        <div class="ck-info"><div class="ck-name"><b>${known ? esc(d.name) : '???'}</b>${known ? `<span class="jp">${esc(d.jp)}</span>` : ''}${d.rare ? `<i class="ck-rare" style="--rc:${rc}">${RARE_NAMES[d.rare]}</i>` : ''}</div>
          <div class="ck-desc">${known ? esc(d.desc) : 'A dish you have yet to learn.'}</div>
          <div class="ck-eff"><span class="ck-chip heal">${glyph('heart')}Heals <b>${Math.round(d.food.heal * 100)}%</b></span><span class="ck-chip buff">${glyph(B.glyph)}<b>${B.name} ${TIER_NAMES[d.food.tier]}</b>· ${d.food.mins} min</span></div>
          <div class="ck-btext">${esc(B.text(d.food.tier))}${known && (st.cookbook.cooked?.[id] || 0) ? ` · cooked ×${st.cookbook.cooked[id]}` : ''}</div></div></div>
      <div class="ck-ing-h">${glyph('leaf')}Ingredients</div><div class="ck-ing">${ing}</div>${where}${go}`;
  }
  // ---------------------------------------------------------------- Try a mix
  mixItems() {
    const st = this.st, out = [];
    for (const [id, n] of Object.entries(st.pantry || {})) { const d = PANTRY[id]; if (n > 0 && d && ['crop', 'fish', 'forage'].includes(d.kind)) out.push({ id, n, kind: d.kind, v: d.value }); }
    out.sort((a, b) => ['crop', 'fish', 'forage'].indexOf(a.kind) - ['crop', 'fish', 'forage'].indexOf(b.kind) || a.v - b.v);
    if ((st.materials?.mochi || 0) > 0) out.push({ id: 'mat:mochi', n: st.materials.mochi, kind: 'mat' });
    return out;
  }
  addPick(id) {
    const tot = Object.values(this.picks).reduce((a, n) => a + n, 0), have = id.startsWith('mat:') ? this.st.materials?.[id.slice(4)] || 0 : this.st.pantry?.[id] || 0;
    if (tot >= MIX_MAX || (this.picks[id] || 0) >= have) { replay(this.$.slots, 'deny', 400); this.ui.sfx?.('deny'); return; }
    this.picks[id] = (this.picks[id] || 0) + 1; this.renderMix(); this.ui.sfx?.('select');
    replay(this.$.slots.querySelectorAll('.mx-slot.has')[tot], 'gain', 400);
  }
  renderMix() {
    const st = this.st, flat = Object.entries(this.picks).flatMap(([k, n]) => Array(n).fill(k));
    const art = k => (k.startsWith('mat:') ? `<span class="ck-mat">${glyph(k.slice(4))}</span>` : `<img src="${pantryIcon(k)}" alt="" draggable="false">`);
    this.$.slots.innerHTML = Array.from({ length: MIX_MAX }, (_, i) => flat[i] ? `<div class="mx-slot has" data-id="${flat[i]}" data-tip="${flat[i]}">${art(flat[i])}</div>` : `<div class="mx-slot"><span>${i + 1}</span></div>`).join('');
    const items = this.mixItems();
    this.$.grid.innerHTML = items.length ? items.map((e, i) => { const left = e.n - (this.picks[e.id] || 0), K = KIND_INFO[e.kind]; return `<div class="mx-it ${left ? '' : 'out'}" data-id="${e.id}" data-tip="${e.id}" style="--i:${i};--kc:${K?.color || '#c8b8e8'}">${art(e.id)}<b>${left}</b></div>`; }).join('')
      : `<div class="mx-empty">${glyph('leaf')}Nothing to cook with yet — harvest crops, catch fish or forage!</div>`;
    this.$.mix.querySelector('.ck-mixgo').classList.toggle('dis', !flat.length);
  }
  // ---------------------------------------------------------------- cooking
  async cook() {
    const K = this.K; if (!K || this.cooking) return;
    const st = this.st;
    let o, icons;
    if (this.tab === 'mix') {
      if (!Object.keys(this.picks).length) return;
      const pv = K.previewMix(this.picks);
      if (pv.fail) { this.ui.toast?.(pv.fail, { icon: 'fire', color: '#ffb07a' }); replay(this.$.slots, 'deny', 400); this.ui.sfx?.('deny'); return; }
      o = { picks: { ...this.picks } };
      icons = Object.entries(this.picks).flatMap(([k, n]) => Array(n).fill(k.startsWith('mat:') ? null : pantryIcon(k)));
    } else {
      const id = this.sel;
      if (!(id in (st.cookbook?.known || {})) || !cookableAt(id, this.station) || maxCook(st, id) < 1) { replay(this.$.det.querySelector('.ck-go') || this.$.det, 'deny', 400); this.ui.sfx?.('deny'); return; }
      o = { id, n: Math.min(this.qty, maxCook(st, id)) };
      icons = RECIPES[id].ing.flatMap(({ k, n }) => Array(Math.min(3, n)).fill(k.startsWith('mat:') ? null : pantryIcon(WILD[k] ? wildIds(k, st)[0] || WILD[k].icon : k)));
    }
    this.cooking = true;
    const dur = K.cookTime(o.n || 1);
    this.potStart(icons, dur);
    const r = await K.cookBatch(o);
    if (!this.isOpen) { this.cooking = false; return; }
    if (r.fail) { this.potEnd(); this.ui.toast?.(r.fail, { icon: 'fire', color: '#ffb07a' }); this.cooking = false; return; }
    this.potDone(r);
    if (o.picks) this.picks = {};
    setTimeout(() => {
      const img = this.$.out.querySelector('img'), rc = img.getBoundingClientRect();
      this.ui.flyToBag?.(pantryIcon(r.id), { x: rc.left + rc.width / 2, y: rc.top + rc.height / 2 });
      this.potEnd(); this.cooking = false;
      if (r.learned || o.picks) { this.setTab('book', true); this.sel = r.id; }
      this._sig = null; this.render();
    }, 1250);
  }
  potStart(icons, dur) {
    const P = this.$.pot;
    P.style.setProperty('--dur', dur + 'ms');
    this.$.drops.innerHTML = icons.map((src, i) => `<i style="--i:${i};--x:${(i - (icons.length - 1) / 2) * 26}px">${src ? `<img src="${src}" alt="">` : glyph('mochi')}</i>`).join('');
    P.className = 'ck-pot on';
    void P.offsetWidth; P.classList.add('go');
  }
  potDone(r) {
    const d = PANTRY[r.id], P = this.$.pot, o = this.$.out;
    o.querySelector('img').src = pantryIcon(r.id);
    o.querySelector('b').textContent = `${d.name}${r.n > 1 ? ` ×${r.n}` : ''}!`;
    o.querySelector('small').innerHTML = r.learned ? `${glyph('sparkle')}New recipe discovered!` : r.fallback ? 'Not quite a recipe… but tasty!' : 'Into the pantry~';
    P.classList.add('done'); if (r.learned) P.classList.add('learned');
    const rc = o.getBoundingClientRect();
    this.ui.burst?.(rc.left + rc.width / 2, rc.top + rc.height * 0.35, { n: r.learned ? 26 : 16, spread: r.learned ? 120 : 80, colors: ['#ffcf4a', '#fff3b8', '#ff8fb0', '#8fe0c0'] });
    if (r.learned) this.ui.burst?.(rc.left + rc.width / 2, rc.top + rc.height * 0.35, { n: 12, spread: 90, kind: 'star', colors: ['#ffcf4a', '#fff3b8'] });
  }
  potEnd() { this.$.pot.className = 'ck-pot'; }
}
