// Village build palette: bottom drawer with category tabs, building cards (cost + requirements), zone tools, bulldoze.
import { el, esc, fmt, replay } from './dom.js';
import { glyph, glyphURL, MATERIALS } from './glyphs.js';
import { Panel } from './panel.js';

const CATS = {
  home: { name: 'Homes', jp: '家', g: 'home', c: '#8fe0c0' },
  shop: { name: 'Shops', jp: '店', g: 'shop', c: '#8fd0ff' },
  craft: { name: 'Crafts', jp: '工房', g: 'craft', c: '#ffcf4a' },
  service: { name: 'Services', jp: '施設', g: 'service', c: '#c3b3ff' },
  decor: { name: 'Decor', jp: '飾り', g: 'decor', c: '#ffbcd6' },
  special: { name: 'Special', jp: '特別', g: 'special', c: '#ff9a7a' },
};
const ZONES = [['R', 'Homes zone', 'home', '#5ec79a'], ['C', 'Shops zone', 'shop', '#5aa8ff'], ['W', 'Workshop zone', 'craft', '#e8a92a']];
const COVERS = { water: ['#5aaaff', 'Water'], light: ['#ffd24a', 'Light'], joy: ['#ff82be', 'Joy'], health: ['#5ed69a', 'Health'], learn: ['#a88cff', 'Learning'] };
const OVERLAYS = [['', 'Zones'], ['water', 'Water'], ['light', 'Light'], ['joy', 'Joy'], ['health', 'Health'], ['learn', 'Learn']];

export class BuildPanel extends Panel {
  constructor(ui) { super(ui, { name: 'build', title: 'Build', jp: '建てる', side: 'bottom', cls: 'p-build', icon: 'hammer' }); this.cat = null; this.sel = null; this.tool = null; }
  init() {
    this.extra.innerHTML = `<div class="tabs bd-tabs"></div><div class="bd-tools">
        <span class="bd-tl">Zones</span>${ZONES.map(([z, n, g, c]) => `<button class="zone" data-z="${z}" style="--zc:${c}" title="${n}"><b>${z}</b>${glyph(g)}</button>`).join('')}
        <button class="zone erase" data-z="zone0" title="Erase zones">${glyph('x')}</button>
        <span class="bd-sep"></span>
        <button class="zone path" data-z="path" title="Lay stone paths"><i class="pth"></i></button>
        <button class="zone path erase" data-z="path0" title="Remove paths"><i class="pth"></i>${glyph('x', 'mini')}</button>
        <span class="bd-sep"></span>
        <button class="zone bull" data-z="bulldoze" title="Bulldoze">${glyph('shovel')}</button>
      </div>`;
    this.body.innerHTML = `<div class="bd-main"><div class="bd-cards"></div>
      <div class="bd-side">
        <div class="bd-stats"></div>
        <div class="bd-rank"></div>
        <div class="bd-ov">${OVERLAYS.map(([m, n]) => `<button class="ovl" data-m="${m}" style="--oc:${COVERS[m]?.[0] || '#ff8fb0'}">${n}</button>`).join('')}</div>
        <div class="bh-t">Pick a building or a tool</div>
        <div class="bh-k"><span class="kc sm">${glyph('mouseL')}</span>place <span class="kc sm">R</span>rotate <span class="kc sm">Esc</span>cancel</div>
      </div></div>`;
    this.$ = { tabs: this.extra.querySelector('.bd-tabs'), cards: this.body.querySelector('.bd-cards'), hint: this.body.querySelector('.bh-t'), tools: this.extra.querySelector('.bd-tools'), stats: this.body.querySelector('.bd-stats'), rank: this.body.querySelector('.bd-rank'), ov: this.body.querySelector('.bd-ov') };
    this.$.ov.addEventListener('click', e => { const b = e.target.closest('.ovl'); if (!b) return; this.overlay = this.overlay === b.dataset.m ? '' : b.dataset.m; this.opts.onOverlay?.(this.overlay || null); this.markOverlay(); this.ui.sfx?.('tab'); });
    this.$.tabs.addEventListener('click', e => { const t = e.target.closest('.tab'); if (t) { this.cat = t.dataset.c; this.render(true); this.ui.sfx?.('tab'); } });
    this.$.cards.addEventListener('click', e => { const c = e.target.closest('.card'); if (c) this.pick(c); });
    this.$.cards.addEventListener('wheel', e => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { this.$.cards.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });
    this.$.cards.addEventListener('mouseover', e => {
      const c = e.target.closest('.card'); if (!c || c === this._hov) return; this._hov = c;
      const it = this.find(c.dataset.id); if (!it) return;
      this.ui.tip.show(this.tip(it), '', c);
    });
    this.$.cards.addEventListener('mouseout', e => { const c = e.target.closest('.card'); if (c && !c.contains(e.relatedTarget)) { this._hov = null; this.ui.tip.hide(c); } });
    this.$.tools.addEventListener('click', e => {
      const b = e.target.closest('.zone'); if (!b) return;
      const z = b.dataset.z;
      this.sel = null; this.markSel();
      this.setTool(z);
      if (z === 'bulldoze') this.opts.onBulldoze?.();
      else if (z === 'path' || z === 'path0') this.opts.onPath?.(z === 'path0');
      else this.opts.onZone?.(z === 'zone0' ? null : z);
      replay(b, 'pressed', 300);
      this.ui.sfx?.('select');
    });
  }
  onOpen() { this.ui.root.classList.add('building'); this.overlay = ''; this.markOverlay(); this.updateStats(); clearInterval(this._st); this._st = setInterval(() => this.updateStats(), 700); }
  markOverlay() { for (const b of this.$.ov.querySelectorAll('.ovl')) b.classList.toggle('on', b.dataset.m === this.overlay); this.$.ov.style.display = this.opts.onOverlay ? '' : 'none'; }
  updateStats() {
    if (!this.isOpen) return;
    const S = this.opts.stats?.() || this.st.village?.stats || null;
    if (!S) { this.$.stats.innerHTML = ''; return; }
    const hp = Math.round((S.happiness ?? 0.5) * 100);
    const h = `<span title="Villagers">${glyph('home')}<b>${S.population ?? 0}</b><small>villager${S.population === 1 ? '' : 's'}</small></span><span title="Happiness">${glyph('heart')}<b>${hp}%</b><small>happy</small></span>`;
    if (h !== this._stH) { this._stH = h; this.$.stats.innerHTML = h; }
    this.renderRank(S.rankInfo || (S.rank ? { rank: S.rank, pop: S.population ?? 0 } : null));
    if (S.demand) this.ui.hud.setRCI(S.demand);
  }
  // "Village rank" progress: ★ Rank 2 ▓▓▓░░ 18/28 → Rank 3 unlocks …
  renderRank(R) {
    const box = this.$.rank;
    if (!R) { if (this._rkH) { this._rkH = ''; box.innerHTML = ''; } return; }
    const top = R.next == null;
    const frac = top ? 1 : Math.max(0, Math.min(1, (R.pop - (R.cur || 0)) / Math.max(1, R.next - (R.cur || 0))));
    const un = R.unlocks || [];
    const unl = un.length ? `unlocks <b>${un.slice(0, 2).map(esc).join(', ')}</b>${un.length > 2 ? ` +${un.length - 2} more` : ''}` : 'a prouder village';
    const h = `<div class="rk-top" title="Village rank grows with villagers"><span class="rk-badge">${glyph('star')}<b>${R.rank}</b></span><span class="rk-l">Rank ${R.rank}</span>
        <span class="rk-bar"><i style="width:${(frac * 100).toFixed(1)}%"></i></span><span class="rk-n">${top ? 'max' : `${R.pop}/${R.next}`}</span></div>
      <div class="rk-next">${top ? 'Top rank — Blossom Hollow is famous!' : `${R.next - R.pop} more villager${R.next - R.pop === 1 ? '' : 's'} → Rank ${R.rank + 1} ${unl}`}</div>`;
    if (h === this._rkH) return;
    const up = this._rkRank != null && R.rank > this._rkRank;
    this._rkH = h; this._rkRank = R.rank; box.innerHTML = h;
    if (up) replay(box, 'rankup', 900);
  }
  onClose() { this.ui.root.classList.remove('building'); clearInterval(this._st); this.sel = null; this.tool = null; this.opts.onClose?.(); }
  find(id) { for (const c of this.opts.categories || []) for (const it of c.items || []) if (it.id === id) return it; return null; }
  afford(cost = {}) {
    const st = this.st;
    const miss = {};
    for (const [k, v] of Object.entries(cost)) {
      const have = k === 'coins' ? st.coins || 0 : st.materials?.[k] || 0;
      if (have < v) miss[k] = true;
    }
    return miss;
  }
  costHTML(cost = {}) {
    const miss = this.afford(cost);
    return Object.entries(cost).filter(([, v]) => v > 0).map(([k, v]) => `<span class="cost ${miss[k] ? 'bad' : ''}">${glyph(MATERIALS[k]?.g || (k === 'coins' ? 'coin' : 'sparkle'))}${fmt(v)}</span>`).join('');
  }
  tip(it) {
    const lock = it.locked ? `<div class="tt-l tt-req bad">${glyph('lock')} ${esc(typeof it.locked === 'string' ? it.locked : it.req || 'Locked')}</div>` : '';
    const miss = Object.keys(this.afford(it.cost));
    return `<div class="tt-simple"><div class="tt-h">${esc(it.name)}${it.jp ? ` <span class="jp">${esc(it.jp)}</span>` : ''}</div>
      ${it.desc ? `<div class="tt-d">${esc(it.desc)}</div>` : ''}
      ${it.size ? `<div class="tt-l tt-dim">Size ${it.size[0]}×${it.size[1]}</div>` : ''}
      ${it.effect ? `<div class="tt-l" style="color:#8fe0c0">${esc(it.effect)}</div>` : ''}
      ${it.cover?.kind && COVERS[it.cover.kind] ? `<div class="tt-l" style="color:${COVERS[it.cover.kind][0]}">● Provides ${COVERS[it.cover.kind][1].toLowerCase()} within ${it.cover.r || '?'} tiles</div>` : ''}
      <div class="tt-costs">${this.costHTML(it.cost)}</div>${lock}
      ${miss.length && !it.locked ? `<div class="tt-l tt-req bad">Not enough ${miss.map(k => MATERIALS[k]?.name || k).join(', ')}</div>` : ''}</div>`;
  }
  setTool(t) {
    this.tool = t;
    for (const b of this.$.tools.querySelectorAll('.zone')) b.classList.toggle('on', b.dataset.z === t);
    this.$.hint.textContent = t === 'bulldoze' ? 'Click a building to remove it' : t === 'zone0' ? 'Drag to erase zones' : t === 'path' ? 'Drag to lay stone paths' : t === 'path0' ? 'Drag to remove paths' : t ? `Drag to paint the ${ZONES.find(z => z[0] === t)?.[1]}` : this.sel ? `Placing ${this.find(this.sel)?.name || ''}…` : 'Pick a building or a tool';
  }
  pick(c) {
    const it = this.find(c.dataset.id); if (!it) return;
    if (it.locked) { replay(c, 'deny', 400); this.ui.sfx?.('deny'); return; }
    if (Object.keys(this.afford(it.cost)).length) { replay(c, 'deny', 400); this.ui.toast(`Need more materials for ${it.name}`, { icon: 'wood', color: '#ff8f7a' }); return; }
    this.sel = this.sel === it.id ? null : it.id;
    this.setTool(null);
    this.markSel();
    replay(c, 'picked', 500);
    this.ui.sfx?.('select');
    if (this.sel) this.opts.onSelect?.(it.id, it); else this.opts.onCancel?.();
  }
  markSel() {
    for (const c of this.$.cards.children) c.classList.toggle('sel', c.dataset.id === this.sel);
    this.setTool(this.tool);
  }
  // game can clear the selection after placing
  clearSelection() { this.sel = null; this.tool = null; if (this.built) { this.markSel(); this.setTool(null); } }
  render(tabChanged) {
    const cats = this.opts.categories || [];
    for (const b of this.$.tools.querySelectorAll('.zone')) {
      const z = b.dataset.z;
      b.style.display = (z === 'bulldoze' ? this.opts.onBulldoze : z.startsWith('path') ? this.opts.onPath : this.opts.onZone) ? '' : 'none';
    }
    for (const b of this.$.tools.querySelectorAll('.bd-sep')) b.style.display = this.opts.onPath ? '' : 'none';
    if (!this.cat || !cats.find(c => c.id === this.cat)) this.cat = cats[0]?.id || null;
    const tabsSig = cats.map(c => c.id + (c.items || []).length).join();
    if (tabsSig !== this._tabsSig) {
      this._tabsSig = tabsSig;
      this.$.tabs.innerHTML = cats.map(c => { const C = CATS[c.id] || { g: 'sparkle', c: '#ffcf4a' }; return `<button class="tab" data-c="${c.id}" style="--tc:${C.c}" title="${esc(C.jp || '')}">${glyph(C.g)}<span>${esc(c.name || C.name)}</span></button>`; }).join('');
    }
    for (const t of this.$.tabs.children) t.classList.toggle('on', t.dataset.c === this.cat);
    const cat = cats.find(c => c.id === this.cat);
    const C = CATS[this.cat] || { g: 'sparkle', c: '#ffcf4a' };
    const items = cat?.items || [];
    const sig = this.cat + '|' + items.map(i => i.id + (i.locked ? 'L' : '') + Object.keys(this.afford(i.cost)).join('')).join();
    if (sig !== this._cardSig) {
      this._cardSig = sig;
      this.$.cards.innerHTML = items.length ? items.map((it, i) => {
        const poor = Object.keys(this.afford(it.cost)).length > 0;
        const icon = it.icon ? `<img src="${it.icon}" alt="" draggable="false">` : `<img src="${glyphURL(it.glyph || C.g)}" alt="" class="gi" draggable="false">`;
        const built = it.locked === 'Already built';
        return `<div class="card ${it.locked ? 'locked' : ''} ${built ? 'built' : ''} ${poor && !built ? 'poor' : ''}" data-id="${esc(it.id)}" style="--i:${i};--cc:${C.c}">
          <div class="cd-art">${icon}${it.size ? `<span class="cd-size">${it.size[0]}×${it.size[1]}</span>` : ''}${it.zone ? `<span class="cd-zone z-${it.zone}">${it.zone}</span>` : ''}</div>
          <div class="cd-n">${esc(it.name)}</div>
          <div class="cd-cost">${this.costHTML(it.cost)}</div>
          ${it.cover?.kind && COVERS[it.cover.kind] ? `<span class="cd-cover" style="--cv:${COVERS[it.cover.kind][0]}" title="${COVERS[it.cover.kind][1]}"></span>` : ''}
          ${built ? `<div class="cd-built">${glyph('check')}<span>Built</span></div>` : it.locked ? `<div class="cd-lock">${glyph('lock')}<span>${esc(typeof it.locked === 'string' ? it.locked : it.req || 'Locked')}</span></div>` : ''}
        </div>`;
      }).join('') : `<div class="bd-empty">${glyph('sakura')}Nothing here yet — keep growing the village!</div>`;
      if (tabChanged) { this.$.cards.scrollLeft = 0; replay(this.$.cards, 'swap', 400); }
      this.markSel();
    }
  }
}

// ------------------------------------------------------------------ build-mode hover card
// Follows the cursor over the village: a building's residents/jobs and needs (✓/✗ with coverage bars), or an empty
// zoned lot's demand / room / path, plus what blocks growth or the next level. Data comes from VillageSim.inspect().
const NEED_COL = { road: '#c9a878', water: '#5aaaff', light: '#ffd24a', joy: '#ff82be', health: '#5ed69a', learn: '#a88cff', care: '#5ed69a', demand: '#8fe0c0', lot: '#ffcf4a' };
const CAT_G = { home: 'home', shop: 'shop', craft: 'craft', service: 'service', decor: 'decor', special: 'special' };
const ZONE_COL = { R: '#5ec79a', C: '#5aa8ff', W: '#e8a92a' };
export class InspectCard {
  constructor(ui, layer) {
    this.ui = ui;
    this.wrap = el('div', 'bi-wrap');
    this.box = el('div', 'bi');
    this.wrap.appendChild(this.box);
    layer.appendChild(this.wrap);
    this.on = false; this.sig = ''; this.w = 0; this.h = 0;
  }
  show(info, x, y) {
    if (!info) return this.hide();
    const sig = info === this._info ? this.sig : JSON.stringify(info);
    this._info = info;
    if (sig !== this.sig) {
      const swap = this.on && info.id !== this._id;
      this.sig = sig; this._id = info.id ?? info.title;
      this.box.innerHTML = this.html(info);
      this.box.style.setProperty('--hc', info.kind === 'zone' ? ZONE_COL[info.zone] || '#ffcf4a' : info.zone ? ZONE_COL[info.zone] : '#ff8fb0');
      this.box.classList.toggle('bad', !info.ok);
      const r = this.box.getBoundingClientRect(); this.w = r.width; this.h = r.height;
      if (swap) replay(this.box, 'swap', 260);
    }
    if (!this.on) { this.on = true; this.wrap.classList.remove('show'); void this.wrap.offsetWidth; this.wrap.classList.add('show'); }
    this.place(x, y);
  }
  place(x, y) {
    const pad = 12, s = this.ui.scale || 1, bp = this.ui.panels.build;
    const floor = bp?.isOpen && bp.panel ? bp.panel.getBoundingClientRect().top : innerHeight;
    let px = x + 26 * s, py = y + 22 * s;
    if (px + this.w > innerWidth - pad) px = x - this.w - 22 * s;
    if (py + this.h > floor - pad) py = Math.max(pad, Math.min(y - this.h - 18 * s, floor - this.h - pad));
    px = Math.max(pad, px); py = Math.max(pad, py);
    this.wrap.style.transform = `translate3d(${px | 0}px,${py | 0}px,0)`;
  }
  hide() { if (!this.on) return; this.on = false; this.wrap.classList.remove('show'); }
  html(I) {
    const icon = I.kind === 'zone' ? `<span class="bi-z" style="--zc:${ZONE_COL[I.zone]}">${I.zone}</span>` : glyph(CAT_G[I.cat] || 'home');
    const stats = (I.stats || []).map(s => `<span>${glyph(s.g)}${esc(s.text)}</span>`).join('');
    const row = l => {
      const c = NEED_COL[l.kind] || '#c3b3ff';
      const bar = l.have != null ? `<span class="bi-bar ${l.ok ? 'ok' : 'no'}"><i style="width:${Math.round(Math.min(1, l.have) * 100)}%"></i>${l.need != null ? `<u style="left:${Math.round(l.need * 100)}%"></u>` : ''}</span>` : '';
      const mark = l.info && l.ok == null ? '' : `<b class="bi-m ${l.ok ? 'ok' : 'no'}">${l.ok ? '✓' : '✗'}</b>`;
      return `<div class="bi-row ${l.ok ? 'ok' : 'no'} ${l.info ? 'soft' : ''} ${bar ? 'hasbar' : ''}" style="--nc:${c}">${mark}<span class="bi-t">${esc(l.text)}</span>${bar}${l.val ? `<span class="bi-v">${esc(l.val)}</span>` : ''}</div>`;
    };
    const need = (I.lines || []).filter(l => !l.info), soft = (I.lines || []).filter(l => l.info);
    const covers = I.kind === 'building' && !I.zone; // services / decor: "gives …" lines
    let rows = need.map(row).join('');
    if (soft.length) rows += (need.length ? `<div class="bi-sh">${I.kind === 'zone' ? 'Comfort here · for level 2' : 'Comfort'}</div>` : covers ? '' : '<div class="bi-sh">Comfort</div>') + soft.map(row).join('');
    const head = I.needFor ? `<div class="bi-sh">To reach level ${I.needFor}</div>` : I.kind === 'zone' ? '<div class="bi-sh">To grow here</div>' : '';
    const bl = (I.blockers || []).map(b => `<div class="bi-bl">${glyph('x')}<span>${esc(b)}</span></div>`).join('');
    const hint = (I.hint ? `<div class="bi-ok ${I.ok ? '' : 'dim'}">${I.ok ? glyph('sparkle') : ''}<span>${esc(I.hint)}</span></div>` : '') + (I.note ? `<div class="bi-note">${esc(I.note)}</div>` : '');
    return `<div class="bi-h"><span class="bi-ic">${icon}</span><div class="bi-ti"><b>${esc(I.title)}</b>${I.sub ? `<small>${esc(I.sub)}</small>` : ''}</div></div>
      ${stats ? `<div class="bi-stats">${stats}</div>` : ''}${head}${rows ? `<div class="bi-rows">${rows}</div>` : ''}${bl}${hint}`;
  }
}
