// The Fish Log (docs/HOMESTEAD.md §3): a tab in the Journal. Every fish as a card (its silhouette and "???" until
// caught), where and when it bites, the best size and the count, the completion bar with Kero's gift milestones.
import { el, esc } from './dom.js';
import { glyph } from './glyphs.js';
import { PANTRY, RARE_NAMES, RARE_COLORS } from '../life/pantry.js';
import { pantryIcon, toolIcon } from '../life/pantryIcons.js';
import { FISH_IDS, SPOTS, TIMES, MILESTONES, fishHabits } from '../life/fishData.js';

const ROD = ['No rod yet', 'Bamboo Rod', 'Moonlit Rod'];

export class FishLogView {
  constructor(ui) {
    this.ui = ui; this.sel = null;
    const r = this.root = el('div', 'fl-wrap');
    r.innerHTML = `<div class="fl-top"><div class="fl-count"><b>0</b><span>/ ${FISH_IDS.length} kinds</span></div><div class="fl-prog"><i class="fl-fill"></i>${MILESTONES.map(m => `<span class="fl-ms" data-m="${m}" style="left:${(m / FISH_IDS.length) * 100}%">${glyph('gift')}<b>${m}</b></span>`).join('')}</div><div class="fl-rod"><img alt=""><span></span></div></div>
      <div class="fl-body"><div class="fl-grid"></div><div class="fl-det"></div></div>`;
    this.$ = { count: r.querySelector('.fl-count b'), fill: r.querySelector('.fl-fill'), grid: r.querySelector('.fl-grid'), det: r.querySelector('.fl-det'), rodImg: r.querySelector('.fl-rod img'), rod: r.querySelector('.fl-rod span') };
    this.$.grid.addEventListener('click', e => { const c = e.target.closest('.fl-card'); if (c) { this.sel = c.dataset.id; this._sig = null; this.render(); this.ui.sfx?.('select'); } });
  }
  get st() { return this.ui.G?.state || {}; }
  render() {
    const st = this.st, L = st.fishLog || {}, F = st.fishing || {}, n = Object.keys(L).length;
    if (!this.sel) this.sel = FISH_IDS.find(id => L[id]) || FISH_IDS[0];
    const sig = JSON.stringify(L) + '|' + (F.rod || 0) + '|' + (F.milestones || []).join() + '|' + this.sel;
    if (sig === this._sig) return; this._sig = sig;
    this.$.count.textContent = n;
    this.$.fill.style.width = (n / FISH_IDS.length) * 100 + '%';
    for (const m of this.root.querySelectorAll('.fl-ms')) { const k = +m.dataset.m; m.classList.toggle('got', n >= k); m.classList.toggle('claimed', (F.milestones || []).includes(k)); }
    this.$.rodImg.src = F.rod ? toolIcon('rod' + F.rod) : toolIcon('rod1'); this.$.rodImg.classList.toggle('sil', !F.rod);
    this.$.rod.textContent = ROD[F.rod || 0];
    this.$.grid.innerHTML = FISH_IDS.map((id, i) => {
      const e = L[id], d = PANTRY[id], rc = RARE_COLORS[d.rare || 0];
      return `<div class="fl-card ${e ? 'got' : 'unseen'} ${id === this.sel ? 'on' : ''} r${d.rare || 0}" data-id="${id}" style="--i:${i};--rc:${rc}"><img class="${e ? '' : 'sil'}" src="${pantryIcon(id)}" alt="" draggable="false">${e ? `<b>${e.best} cm</b>` : '<b class="q">?</b>'}${e && e.n > 1 ? `<i class="fl-n">×${e.n}</i>` : ''}</div>`;
    }).join('');
    const id = this.sel, e = L[id], d = PANTRY[id], where = fishHabits(id);
    this.$.det.innerHTML = `<div class="fl-art ${e ? '' : 'unseen'}" style="--rc:${RARE_COLORS[d.rare || 0]}"><img class="${e ? '' : 'sil'}" src="${pantryIcon(id)}" alt=""></div>
      <div class="fl-name">${e ? esc(d.name) : '???'} ${e ? `<span class="jp">${esc(d.jp)}</span>` : ''}</div>
      <div class="fl-rare" style="--rc:${RARE_COLORS[d.rare || 0]}">${d.rare ? RARE_NAMES[d.rare] : 'Common'}</div>
      ${e ? `<div class="fl-desc">${esc(d.desc)}</div>
        <div class="fl-stats"><div>${glyph('star')}<span>Best</span><b>${e.best} cm</b></div><div>${glyph('wave')}<span>Caught</span><b>×${e.n}</b></div><div>${glyph('sun')}<span>First</span><b>Day ${e.day} · ${esc(SPOTS[e.spot]?.name || '?')}</b></div></div>`
        : `<div class="fl-desc dim">Not caught yet.</div>`}
      <div class="fl-where">${glyph('map')}<span>${e ? 'Bites at' : 'Rumoured to bite at'}: <b>${where.map(esc).join(' · ')}</b></span></div>`;
  }
}
export const FISH_TIMES = TIMES;
