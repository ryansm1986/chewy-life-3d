// The Journal's "Crews" tab (docs/COZY.md §10; ROADMAP CZ-10): the expeditions' log. At the top the crews still out
// (their faces, the job, a progress bar, "back in about 2 h") and the totals (trips home, successes, keepsakes); then
// every report the board keeps (the newest first: the outcome's stamp, the job and its place, the crew, when they came
// back, what they brought). A row opens that report on the Expedition Board (to read, from anywhere: sending is done at
// the board itself). Data from G.cozy (cozy/expeditionRun.js); styles in cozy.css (.cl-*).
import { el, esc } from './dom.js';
import { glyph } from './glyphs.js';
import { portrait } from './portraits.js';
import { cozyIcon } from './cozyIcons.js';
import { backIn, aboutHours } from '../cozy/clock.js';
import { CLASSES } from '../rpg/classes.js';
import { FURNITURE } from '../home/furniture.js';

const RES = { success: ['Success', 'check', '#3aa860'], partial: ['Partly done', 'away', '#e0952a'], setback: ['Muddy and tired', 'cross', '#c86a5a'], beaten: ['You beat them to it', 'heart', '#d86a9a'], recalled: ['Called home', 'pack', '#7a8aa8'] };
const ago = h => (h < 0.75 ? 'just now' : h < 20 ? `${aboutHours(h)} ago` : h < 36 ? 'yesterday' : `${Math.round(h / 24)} days ago`);

export class CrewLogView {
  constructor(ui) {
    this.ui = ui;
    this.root = el('div', 'cl-wrap');
    this.root.addEventListener('click', e => {
      const b = e.target.closest('[data-rep], [data-board]'); if (!b) return;
      this.ui.sfx?.('select');
      this.ui.close('quests', true);
      if (b.dataset.rep) this.ui.open('expeditions', { view: 'reports', report: b.dataset.rep, at: 'journal' });
      else this.ui.open('expeditions', { view: this.ui.G?.cozy?.exp.list().length ? 'away' : 'reports', at: 'journal' });
    });
  }
  get C() { return this.ui.G?.cozy; }
  name(k) { return (k.startsWith('hire:') ? this.C?.guild?.nameOf?.(k) : '') || CLASSES[k.split(':')[1]]?.name || k.split(':')[1]; }
  face(k) { const inner = k.startsWith('hire:') ? this.C?.guild?.faceHTML?.(k) || '' : portrait(k.split(':')[1]); return `<span class="cl-face">${inner}</span>`; }
  names(crew) { const n = crew.map(k => this.name(k)); return n.length <= 1 ? n[0] || '' : `${n.slice(0, -1).join(', ')} & ${n[n.length - 1]}`; }
  /** the count of each kind the Journal's tab badge shows: the reports kept */
  count() { return this.C?.exp.reports().length || 0; }
  render(force = false) {
    const C = this.C, st = this.ui.G?.state; if (!C || !st) { this.root.innerHTML = ''; return; }
    const out = C.exp.list(), reps = [...C.exp.reports()].reverse(), now = C.clock.h, E = st.cozy?.exp || {};
    const sig = JSON.stringify([out.map(e => [e.uid, Math.round(C.exp.left(e) * 2)]), reps.map(r => [r.uid, r.read, Math.round((now - (r.at || 0)) * 2)])]);
    if (!force && sig === this._sig) return; this._sig = sig;
    const wins = Object.values(E.done || {}).reduce((a, n) => a + n, 0), keep = reps.filter(r => r.loot?.trophy).length;
    const outRows = out.map(e => { const left = C.exp.left(e), f = Math.max(0, Math.min(1, 1 - left / e.hours)); return `<div class="cl-out" style="--pc:${e.place?.color || '#8fd0ff'}"><span class="cl-faces">${e.crew.map(k => this.face(k)).join('')}</span><div class="cl-t"><b>${esc(e.name)}</b><span>${esc(this.names(e.crew))} · ${e.hold ? 'camped at the edge of the village' : esc(backIn(left))}</span><i class="cl-bar" style="--f:${f.toFixed(3)}"><i></i></i></div></div>`; }).join('');
    const rows = reps.map(r => {
      const R = RES[r.result] || RES.success, L = r.loot || {}, mats = Object.values(L.mats || {}).reduce((a, n) => a + n, 0);
      const news = r.saved ? `${r.saved.village} saved!` : r.cleared ? `The ${r.cleared.dungeon} cleared!` : r.quest?.done ? `${r.quest.title}: done` : r.quest?.turnIn ? `${r.quest.title}: tell ${r.quest.giver || 'them'}` : '';
      const loot = [L.coins ? `<span>${glyph('coin')}${L.coins}</span>` : '', mats ? `<span>${glyph('wood')}${mats}</span>` : '', L.items?.length ? `<span>${glyph('gift')}${L.items.length}</span>` : '', L.trophy ? `<span class="tro" title="${esc(FURNITURE[L.trophy]?.name || 'A keepsake')}">${glyph('home')}keepsake</span>` : ''].join('');
      return `<button class="cl-rep${r.read ? '' : ' unread'}" data-rep="${esc(r.uid)}" style="--rc:${R[2]}">
        <span class="cl-st">${cozyIcon(R[1])}</span>
        <span class="cl-t"><b>${esc(r.name)}</b><span>${esc(R[0])} · ${esc(this.names(r.crew))}${r.place?.label ? ` · ${esc(r.place.label)}` : ''}</span>${news ? `<em>${glyph('star')}${esc(news)}</em>` : ''}</span>
        <span class="cl-side"><small>${esc(ago(Math.max(0, now - (r.at || 0))))}</small><span class="cl-loot">${loot}</span></span>${r.read ? '' : '<i class="cl-dot"></i>'}</button>`;
    }).join('');
    this.root.innerHTML = `<div class="cl-top"><span class="cl-ic">${cozyIcon('board')}</span>
        <div class="cl-nums"><div><b>${reps.length}</b><span>reports</span></div><div><b>${wins}</b><span>successes</span></div><div><b>${out.length}</b><span>out now</span></div><div><b>${keep}</b><span>keepsakes</span></div></div>
        <button class="btn sm cl-go" data-board="1">${cozyIcon('board')}Board</button></div>
      ${outRows ? `<div class="cl-sh">${cozyIcon('away')}On the road</div><div class="cl-outs">${outRows}</div>` : ''}
      <div class="cl-sh">${cozyIcon('report')}The log</div>
      <div class="cl-list">${rows || `<p class="cl-empty">${cozyIcon('pack')}<span>No crews have come home yet. Send one from the Expedition Board, by the Wayfarer's Post.</span></p>`}</div>`;
  }
}
