// "While you were away…" (docs/COZY.md §4.4.1; ROADMAP CZ-1): a small centre card, shown once after a load (or a hidden
// tab coming back) on the first calm moment, when the time away did something: how long you were away and how many
// world hours that counted (the cap is 8), each crew that came home with its outcome and a "See report" link to the
// Board, and the crews still out. Phases C and D add their lines (the driftwood washed back up; wages paid). One
// button: "Welcome back!" (Enter, Esc, A, B or a tap). Opened by cozy/expeditionRun.js → ui.open('awayCard', {…}).
import './cozy.css';
import { esc } from './dom.js';
import { Panel } from './panel.js';
import { portrait } from './portraits.js';
import { cozyIcon } from './cozyIcons.js';
import { realSpan, aboutHours, backIn } from '../cozy/clock.js';
import { CLASSES } from '../rpg/classes.js';

const RES = { success: ['came home with good news', 'check'], partial: ['got partway, and will try again', 'away'], setback: ['came home muddy and tired', 'cross'], beaten: ['found you had beaten them to it', 'heart'], recalled: ['came home early', 'pack'] };
const who = k => k.split(':')[1];
const hireName = k => (k.startsWith('hire:') ? globalThis.G?.cozy?.guild?.nameOf?.(k) : null); // (the Guild's hires: cozy/guildRun.js)
const names = crew => { const n = crew.map(k => hireName(k) || CLASSES[who(k)]?.name || who(k)); return n.length <= 1 ? n[0] || 'The crew' : `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`; };
const face = k => (k.startsWith('hire:') ? globalThis.G?.cozy?.guild?.faceHTML?.(k) || '' : portrait(who(k)));

export class AwayCardPanel extends Panel {
  constructor(ui) { super(ui, { name: 'awayCard', title: 'Welcome back', jp: 'おかえり', side: 'center', cls: 'p-away', icon: 'home' }); }
  init() {
    this.body.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.a === 'ok') this.ui.close('awayCard');
      else if (b.dataset.rep) { this.ui.close('awayCard', true); this.ui.open('expeditions', { view: 'reports', report: b.dataset.rep }); }
    });
    this.onKey = e => {
      if (!this.isOpen || this.ui._order[this.ui._order.length - 1] !== 'awayCard') return;
      if (e.key === 'Enter') { this.ui.close('awayCard'); e.preventDefault(); }
    };
    addEventListener('keydown', this.onKey);
  }
  render() {
    const o = this.opts || {}, B = this.body;
    const ms = o.ms || 0, h = o.hours || 0;
    const hrs = h < 1 ? 'Less than a game hour' : `${Math.abs(h - Math.round(h)) < 0.05 ? '' : 'About '}${Math.round(h)} game hour${Math.round(h) === 1 ? '' : 's'}`;
    const time = h > 0 ? `You were away ${realSpan(ms)}. ${hrs} passed${o.capped ? ', the most an absence counts' : ''}.` : 'Here is what your crews have been up to.';
    const reps = (o.reports || []).map(r => {
      const R = RES[r.result] || RES.success;
      return `<div class="aw-row" data-r="${r.result}"><span class="aw-faces">${r.crew.map(k => `<span class="aw-face">${face(k)}</span>`).join('')}</span><div class="aw-t"><b>${esc(names(r.crew))}</b><span>${esc(R[0])}: ${esc(r.name)}</span></div><span class="aw-ic">${cozyIcon(R[1])}</span><button class="btn sm sky" data-rep="${r.uid}">See report</button></div>`;
    }).join('');
    const out = (o.out || []).map(e => `<div class="aw-row out"><span class="aw-faces">${e.crew.map(k => `<span class="aw-face">${face(k)}</span>`).join('')}</span><div class="aw-t"><b>${esc(names(e.crew))}</b><span>still out: ${esc(e.name)}</span></div><em class="aw-left">${e.hold ? 'camped by the village' : esc(backIn(e.left))}</em></div>`).join('');
    // scavenging (phase C, cozy/scavengeWorld.js): the areas a crossed world day refilled
    const fresh = (o.refills || []).map(t => `<div class="aw-row refill"><span class="aw-ic">${cozyIcon('errand')}</span><div class="aw-t"><span>${esc(t)}</span></div></div>`).join('');
    // the Guild (phase D, cozy/guildRun.js): wages paid, short, and the hires whose morale moved
    const guild = (o.guild || []).map(t => `<div class="aw-row refill"><span class="aw-ic">${cozyIcon('crew')}</span><div class="aw-t"><span>${esc(t)}</span></div></div>`).join('');
    B.innerHTML = `<div class="aw">
      <div class="aw-hd"><span class="aw-lic">${cozyIcon('board')}</span><div><b>While you were away…</b><span>${esc(time)}</span></div></div>
      ${reps ? `<div class="aw-sh">Back home</div><div class="aw-list">${reps}</div>` : ''}
      ${out ? `<div class="aw-sh">On the road</div><div class="aw-list">${out}</div>` : ''}
      ${fresh ? `<div class="aw-sh">Around the island</div><div class="aw-list">${fresh}</div>` : ''}
      ${guild ? `<div class="aw-sh">At the Guild</div><div class="aw-list">${guild}</div>` : ''}
      ${!reps && !out && !fresh && !guild ? `<p class="aw-quiet">All quiet in Blossom Hollow. ${h > 0 ? `${aboutHours(h).replace(/^about /, 'About ')} went by.` : ''}</p>` : ''}
      <button class="btn big pink aw-ok" data-a="ok">${cozyIcon('heart')}Welcome back!</button>
    </div>`;
  }
}
