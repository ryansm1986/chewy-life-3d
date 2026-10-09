// The Sightings board (docs/COZY.md §6.3, §10; ROADMAP CZ-4): today's three named packs in the wild areas, each with
// its bounty, and your Guild renown and title. Opened at Blossom Hollow's Sightings board (beside the Wayfarer's Post),
// a saved zone village's notice board, and (phase D) the Adventurers' Guild: ui.open('sightings', { at }).
// Data from G.peaceful (cozy/peacefulRun.js), so the UI never imports world code. Mouse: click "Travel Map"; pad: the
// cards and their buttons are padNav targets (A); touch / phone: one column, 52 design px targets, 14 design px text.
import './sightings.css';
import { esc, fmt } from './dom.js';
import { glyph } from './glyphs.js';
import { Panel } from './panel.js';
import { aboutHours } from '../cozy/clock.js';
import { KINDS } from '../cozy/sightings.js';

const ZONE = { bamboo: ['Bamboo Grove', '#6fbf73'], maple: ['Momiji Hollow', '#e8703a'], tidepool: ['Shiokaze Tidepools', '#2fb8c8'], onsen: ['Yukimi Onsen', '#8a9ad8'] };
const KIND_IC = { unique: 'star', champion: 'shield', swarm: 'oni' };

export class SightingsPanel extends Panel {
  constructor(ui) { super(ui, { name: 'sightings', title: 'Sightings', jp: '目撃情報', side: 'center', cls: 'p-sight', icon: 'pin' }); }
  init() {
    this.body.addEventListener('click', e => {
      const b = e.target.closest('.sg-go'); if (!b || b.disabled) return;
      this.ui.sfx?.('tab'); this.ui.close('sightings', true); this.ui.open('travel', { select: b.dataset.zone });
    });
  }
  render() {
    const P = this.G?.peaceful; if (!P) { this.body.innerHTML = ''; return; }
    const L = P.sightings(), R = P.renown(), here = this.G.dungeon?.isRegion ? this.G.dungeon.regionId : null, at = this.opts?.at;
    const where = at === 'guild' ? "Pinned up inside the Adventurers' Guild" : at && ZONE[at] ? `${this.G.dungeon?.village?.def?.name || ZONE[at][0]}'s notice board` : 'Posted by the Wayfarer\'s Post';
    const card = (s, i) => {
      const Z = ZONE[s.zone] || [s.zone, '#c8a0ff'], K = KINDS[s.kind] || { label: s.kind }, B = s.bounty || {};
      const mats = Object.entries(B.mats || {}).map(([k, n]) => `<span class="sg-chip" title="${esc(k)}">${glyph(k)}${n}</span>`).join('');
      const act = s.done ? '<span class="sg-stamp">討伐<small>Bounty claimed</small></span>'
        : here === s.zone ? `<button class="btn sm sg-go here" data-zone="${s.zone}" disabled>${glyph('pin')}You're here</button>`
        : `<button class="btn sm sky sg-go" data-zone="${s.zone}">${glyph('map')}Travel Map</button>`;
      return `<div class="sg-card${s.done ? ' done' : ''}" style="--pc:${Z[1]};--i:${i}" data-id="${esc(s.id)}">
        <div class="sg-kind" data-k="${s.kind}">${glyph(KIND_IC[s.kind] || 'oni')}<span>${esc(K.label)}</span></div>
        <div class="sg-t"><b>${esc(s.name)}</b><span>${esc(s.line)}.</span><em>${glyph('pin')}${esc(s.areaName.replace(/^the /, 'The '))} · ${esc(Z[0])} · Lv ${s.lvl}</em></div>
        <div class="sg-bounty"><span class="sg-bh">Bounty</span><span class="sg-chip coin">${glyph('coin')}${fmt(B.coins || 0)}</span>${mats}${B.gem ? `<span class="sg-chip gem">${glyph('gem')}a gem</span>` : ''}<span class="sg-chip ren">${glyph('star')}+${s.renown}</span></div>
        <div class="sg-act">${act}</div></div>`;
    };
    const left = Math.max(0, P.hoursLeft()), nx = R.next;
    this.body.innerHTML = `<div class="sg">
      <div class="sg-hd"><span class="sg-claw"><i></i><i></i><i></i></span><div class="sg-hdt"><b>Wild yokai sightings</b><span>${esc(where)}. Packs spotted today in the wild places: beat one for its bounty.</span></div>
        <div class="sg-ren" title="Renown: cosmetic, a title on your Guild card"><b>${R.n}</b><span>renown</span><em>${esc(R.title)}</em>${nx ? `<small>${nx.at - R.n} to ${esc(nx.title)}</small>` : ''}</div></div>
      <div class="sg-list">${L.length ? L.map(card).join('') : `<p class="sg-empty">${glyph('map')}No sightings yet. Once a zone opens on the Travel Map, its wild places start talking.</p>`}</div>
      <div class="sg-foot">${glyph('moon')}New sightings with the next world day, ${esc(aboutHours(left).replace(/^about /, 'in about '))}.${R.total ? ` <span>${R.total} bount${R.total === 1 ? 'y' : 'ies'} claimed.</span>` : ''}</div>
    </div>`;
  }
}
