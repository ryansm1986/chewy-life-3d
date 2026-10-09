// The Adventurers' Guild panel (docs/COZY.md §5, §10; ROADMAP CZ-7, CZ-8): Old Hachi at the top with a word for you,
// the Guild's level, the roster count and the day's wages, the two boards that hang inside the door (the Expedition
// Board, opened to send crews from here, and the Sightings), and three tabs:
//   - Hire: today's three candidates (a class, a level, their power, what they suit, their perk, the sign-on fee and the
//     daily wage) and Sign on;
//   - Roster: every hire (level and XP, morale hearts, power, wage, where they are: in town, away, resting, on a break),
//     Pay back wages, Dismiss (press twice); the free bunks up to the cap, the locked ones up to 9;
//   - Guild: the upgrade card (what the next level brings, its cost and rank) and the two tools (the Forager's Basket,
//     Shadow's Bandana).
// Opened at the Guild's door (village.js interactionFor → G.cozy.guild.open), and by Old Hachi's talk. Data from
// G.cozy.guild (cozy/guildRun.js) and the pure cozy/guild.js, so the panel never imports world code.
// Mouse; pad (padNav: LB / RB the tabs, A on a card's button); touch and phones (one column of cards, 52 design px
// targets, the 14 design px floor: guild.css).
import './guild.css';
import './cozy.css';
import { esc, fmt } from './dom.js';
import { glyph, MATERIALS } from './glyphs.js';
import { Panel } from './panel.js';
import { materialIconURL } from './rpg.js';
import { cozyIcon } from './cozyIcons.js';
import { aboutHours, backIn } from '../cozy/clock.js';
import { HIRE_CLASSES, ROSTER_CAP, GUILD_MAX } from '../cozy/guild.js';

const INK = '#4a2c2a';
const wrap = inner => `<svg class="gl" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${inner}</svg>`;
const ol = (shapes, fill, w = 4) => `<g fill="${INK}" stroke="${INK}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round">${shapes}</g><g fill="${fill}">${shapes}</g>`;
const line = (d, c = INK, w = 2) => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const shine = (x, y, rx = 2.4, ry = 1.4) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" transform="rotate(-35 ${x} ${y})" fill="#fff" opacity=".7"/>`;
const paw = (x, y, k, c) => `<g fill="${c}"><ellipse cx="${x}" cy="${y + 1.2 * k}" rx="${3.2 * k}" ry="${2.6 * k}"/><circle cx="${x - 3.4 * k}" cy="${y - 2.2 * k}" r="${1.35 * k}"/><circle cx="${x - 1.2 * k}" cy="${y - 4 * k}" r="${1.35 * k}"/><circle cx="${x + 1.2 * k}" cy="${y - 4 * k}" r="${1.35 * k}"/><circle cx="${x + 3.4 * k}" cy="${y - 2.2 * k}" r="${1.35 * k}"/></g>`;
// the classes' and the panel's own icons, in the cozy icons' hand
const ICONS = {
  guard: () => ol('<circle cx="16" cy="16" r="12"/>', '#b8bccc') + `<circle cx="16" cy="16" r="8.5" fill="none" stroke="#8a8ea0" stroke-width="2"/>` + paw(16, 17, 0.9, '#c8473a') + shine(11, 10),
  archer: () => line('M10 4 C26 9 26 23 10 28', INK, 5.4) + line('M10 4 C26 9 26 23 10 28', '#c8904a', 2.6) + line('M10 4 L10 28', '#fff6ea', 1.6) + line('M5 16 H24', INK, 2.6) + `<path d="M24 16 L19.5 13 L19.5 19 Z" fill="#8a8ea0" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>` + `<path d="M5 16 L8 13 M5 16 L8 19" stroke="#e86a7a" stroke-width="2.4" stroke-linecap="round"/>`,
  scout: () => `<g transform="rotate(-30 16 16)">${ol('<rect x="3" y="12" width="12" height="8" rx="2"/><rect x="14" y="10.5" width="9" height="11" rx="2"/><rect x="22" y="9" width="7" height="14" rx="2"/>', '#e8c060')}${line('M15 12 V20 M22.5 11 V21', '#a8803a', 1.6)}</g>` + shine(9, 12),
  healer: () => ol('<rect x="5" y="10" width="22" height="17" rx="5"/>', '#fff6ea') + ol('<path d="M9 10 C9 4 23 4 23 10"/>', 'none', 3) + line('M9 10 C9 5 23 5 23 10', '#e8a0b0', 2) + paw(16, 19, 0.85, '#e86a8a'),
  porter: () => ol('<rect x="6" y="9" width="20" height="19" rx="7"/>', '#c08a5a') + ol('<path d="M7 14 C7 8 25 8 25 14 L25 17 C20 19 12 19 7 17 Z"/>', '#9a6a42') + ol('<rect x="5" y="3.5" width="22" height="6" rx="3"/>', '#efd8a8') + line('M11 4 V9.5 M21 4 V9.5', '#c8473a', 2.2),
  hire: () => ol('<rect x="6" y="4" width="20" height="24" rx="3"/>', '#fff3d8') + line('M10 10 H22 M10 14 H22 M10 18 H17', '#b49a80', 1.8) + ol('<circle cx="21" cy="22" r="5"/>', '#e8503a', 2.6) + paw(21, 22.6, 0.55, '#fff'),
  roster: () => paw(10, 13, 1.05, INK) + paw(10, 13, 0.82, '#ffb07a') + paw(22, 11, 0.95, INK) + paw(22, 11, 0.74, '#8fd0ff') + paw(16, 23, 1.0, INK) + paw(16, 23, 0.78, '#8fe0c0'),
  lodge: () => ol('<path d="M3 14 L16 5 L29 14 Z"/>', '#3f7a72') + ol('<rect x="6" y="13" width="20" height="14" rx="1.5"/>', '#fbf0dc') + ol('<rect x="13" y="18" width="6" height="9"/>', '#c48c5a', 2.6) + ol('<circle cx="16" cy="11" r="2.6"/>', '#f2c04a', 2),
  up: () => ol('<path d="M16 4 L27 15 H20 V28 H12 V15 H5 Z"/>', '#8fe0a0') + shine(13, 11),
  basket: () => line('M9 14 C9 5 23 5 23 14', INK, 5.4) + line('M9 14 C9 5 23 5 23 14', '#c8904a', 2.4) + ol('<path d="M5 14 H27 L24 27 H8 Z"/>', '#e0b070') + line('M9 18 H23 M10 22 H22', '#b07a40', 1.6) + `<circle cx="12" cy="12" r="2.4" fill="#ff8fb0" stroke="${INK}" stroke-width="1.4"/><circle cx="19" cy="11.5" r="2.2" fill="#8fe0a0" stroke="${INK}" stroke-width="1.4"/>`,
  bandana: () => ol('<path d="M4 11 C10 6 22 6 28 11 L16 27 Z"/>', '#e0952a') + `<circle cx="11" cy="12" r="1.3" fill="#fff6ea"/><circle cx="18" cy="11" r="1.3" fill="#fff6ea"/><circle cx="16" cy="17" r="1.3" fill="#fff6ea"/><circle cx="21" cy="14.5" r="1.1" fill="#fff6ea"/>` + line('M26 10 L30 7 M27 12 L30.5 12', INK, 2.2),
};
const gIcon = k => wrap((ICONS[k] || ICONS.hire)());
const matIcon = k => `<img class="gd-mi" src="${materialIconURL(k)}" alt="" draggable="false">`;
const hearts = n => `<span class="gd-hearts" title="Morale">${[1, 2, 3].map(i => `<i class="${i <= n ? 'on' : ''}">${cozyIcon('heart')}</i>`).join('')}</span>`;
const VIEWS = [['hire', 'Hire', 'hire', '#e8a05a'], ['roster', 'Roster', 'roster', '#6aa0e0'], ['guild', 'Guild', 'lodge', '#6ac08a']];

export class GuildPanel extends Panel {
  constructor(ui) {
    super(ui, { name: 'guild', title: "Adventurers' Guild", jp: '冒険者ギルド', side: 'center', cls: 'p-guild', icon: 'paw' });
    this.view = 'hire'; this.armed = null;
  }
  get C() { return this.G?.cozy?.guild; }
  init() {
    this.body.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b || b.disabled) return;
      const C = this.C; if (!C) return;
      if (b.dataset.v) this.setView(b.dataset.v);
      else if (b.dataset.board === 'exp') { this.ui.close('guild', true); this.ui.open('expeditions', { at: 'guild' }); this.ui.sfx('open'); }
      else if (b.dataset.board === 'sight') { this.ui.close('guild', true); this.ui.open('sightings', { at: 'guild' }); this.ui.sfx('open'); }
      else if (b.dataset.hire != null) { const r = C.hire(+b.dataset.hire); if (!r.ok) { this.ui.toast(r.why, { color: '#ffb0a0' }); } else this.flash(`[data-card="${r.h.id}"]`); this.render(); }
      else if (b.dataset.pay) { const r = C.payBack(b.dataset.pay); if (!r.ok) this.ui.toast(r.why, { color: '#ffb0a0' }); this.render(); }
      else if (b.dataset.dismiss) this.dismiss(b.dataset.dismiss);
      else if (b.dataset.a === 'upgrade') { if (C.upgrade()) { this.ui.close('guild', true); } else this.render(); }
      else if (b.dataset.tool) { const r = C.buyTool(b.dataset.tool); if (!r.ok) this.ui.toast(r.why, { color: '#ffb0a0' }); this.render(); }
    });
    this.G?.events?.on?.('cozy:changed', () => { if (this.isOpen) this.render(); });
  }
  onOpen() {
    const v = this.opts.view;
    if (v && VIEWS.some(x => x[0] === v)) this.view = v;
    else if (!this.C?.roster().length) this.view = 'hire';
    this.armed = null;
    this.render();
    clearInterval(this._tick); this._tick = setInterval(() => { if (this.isOpen && this.view === 'roster') this.render(); }, 2000);
  }
  onClose() { clearInterval(this._tick); this._tick = null; }
  setView(v) { if (v === this.view) return; this.view = v; this.armed = null; this.ui.sfx('tab'); this.render(); }
  dismiss(id) {
    const now = performance.now();
    if (!(this.armed?.id === id && now - this.armed.t < 2500)) { this.armed = { id, t: now }; this.ui.sfx('tick'); this.render(); return; }
    this.armed = null;
    const r = this.C.dismiss(id);
    if (!r.ok) this.ui.toast(r.why, { color: '#ffb0a0' });
    this.render();
  }
  flash(sel) { requestAnimationFrame(() => { const e = this.body.querySelector(sel); if (!e) return; e.classList.remove('gd-flash'); void e.offsetWidth; e.classList.add('gd-flash'); }); }
  // ---------------------------------------------------------------- render
  render() {
    const B = this.body, C = this.C, G = this.G; if (!C || !G) { B.innerHTML = ''; return; }
    const st = G.state, L = C.level || 0, roster = C.roster(), cap = ROSTER_CAP[Math.max(1, L)], wages = C.dailyWages();
    const hachi = C.faceHTML('hachi');
    const say = this.hachiSays(roster);
    const tabs = VIEWS.map(([k, label, ic, c]) => `<button class="tab gd-tab${this.view === k ? ' on' : ''}" data-v="${k}" style="--tc:${c}">${gIcon(ic)}<span class="gd-tl">${label}</span>${k === 'roster' ? `<i class="tab-n">${roster.length}</i>` : ''}</button>`).join('');
    let main = '';
    if (this.view === 'hire') main = this.hireView(roster, cap);
    else if (this.view === 'roster') main = this.rosterView(roster, cap, L);
    else main = this.guildView(L);
    B.innerHTML = `<div class="gd" data-view="${this.view}">
      <div class="gd-hd">
        <span class="gd-hachi">${hachi}</span>
        <div class="gd-say"><b>Old Hachi <span class="jp">ハチ</span></b><p>${esc(say)}</p></div>
        <div class="gd-stats">
          <span class="gd-lv" title="The Guild's level">${gIcon('lodge')}<b>Level ${L}</b></span>
          <span class="gd-st" title="Hires on the roster / the roster's cap">${gIcon('roster')}<b>${roster.length}/${cap}</b><em>hires</em></span>
          <span class="gd-st" title="Wages a world day (24 game hours), paid from your coins">${glyph('coin')}<b>${wages}</b><em>a day</em></span>
        </div>
      </div>
      <div class="gd-boards">
        <button class="btn gd-board" data-board="exp">${cozyIcon('board')}<span><b>Expedition Board</b><small>Send crews from here</small></span></button>
        <button class="btn gd-board sight" data-board="sight">${glyph('pin')}<span><b>Sightings</b><small>Today's wild bounties</small></span></button>
      </div>
      <div class="tabs gd-tabs">${tabs}</div>
      <div class="gd-main">${main}</div>
    </div>`;
  }
  hachiSays(roster) {
    const v = this.view, C = this.C;
    if (v === 'hire') return roster.length >= ROSTER_CAP[Math.max(1, C.level)] ? "Every bunk's taken. A bigger lodge, or a kind goodbye, if you want new blood." : 'Good folk, all three. Pick the one whose trade suits the job: a Guard for a siege, a Scout for a hunt.';
    if (v === 'roster') return roster.some(h => h.owed) ? 'Wages first, adventures second. That\'s the Guild\'s only rule.' : roster.length ? 'They come home tired and leave cheerful. Pay them, feed them, send them out.' : 'Nobody on the roster yet. The Hire tab has today\'s faces.';
    return C.level >= GUILD_MAX ? 'Finest lodge on the island. Hmph. Mostly thanks to you.' : 'A bigger lodge, more bunks. And Shadow\'s nose could use a bandana, if you ask me.';
  }
  face(key, sm = false, color = '#c8a070') { return `<span class="gd-face${sm ? ' sm' : ''}" style="--hc:${color}">${this.C.faceHTML(key)}</span>`; }
  clsChip(cls) { const K = HIRE_CLASSES[cls]; return `<span class="gd-cls" style="--cc:${K.color}">${gIcon(cls)}<b>${esc(K.name)}</b></span>`; }
  hireView(roster, cap) {
    const list = this.C.candidates(), left = this.C.newDayIn();
    const cards = list.map(c => {
      const K = HIRE_CLASSES[c.cls], ok = c.check.ok;
      const btn = c.taken ? `<span class="gd-signed">${glyph('check')}Signed on</span>`
        : `<button class="btn gd-sign${ok ? '' : ' no'}" data-hire="${c.i}" ${ok ? '' : 'disabled'} title="${esc(c.check.why || '')}">${gIcon('hire')}<span><b>Sign on</b><small>${glyph('coin')}${c.fee}${ok ? '' : ` · ${esc(c.check.why)}`}</small></span></button>`;
      return `<div class="gd-cand${c.taken ? ' taken' : ''}" style="--cc:${K.color}" data-card="${c.key}">
        <div class="gd-ribbon">${gIcon(c.cls)}<b>${esc(K.name)}</b><span class="jp">${K.jp}</span></div>
        ${this.face(c.key, false, K.color)}
        <div class="gd-nm"><b>${esc(c.name)}</b><span>Level ${c.lvl}</span></div>
        <div class="gd-rows">
          <div title="Crew power (a hero of the same level is about 1.5×)">${cozyIcon('power')}<b>${Math.round(c.power)}</b><span>power</span></div>
          <div title="A class that suits the job adds 15% to the crew">${cozyIcon('check')}<span>Best on <b>${esc(K.suitWord)}</b> (+15%)</span></div>
          ${K.perkWord ? `<div class="perk">${glyph('star')}<span>${esc(K.perkWord)}</span></div>` : `<div class="perk">${glyph('shield')}<span>${esc(K.look)}</span></div>`}
          <div title="Paid from your coins each world day (24 game hours)">${glyph('coin')}<span>Wage <b>${c.wage}</b> a day</span></div>
        </div>
        ${btn}
      </div>`;
    }).join('');
    return `<div class="gd-cands">${cards}</div>
      <div class="gd-foot">${glyph('moon')}New faces with the next world day, ${esc(aboutHours(left).replace(/^about /, 'in about '))}.<span class="sep">·</span>Roster ${roster.length} of ${cap}</div>`;
  }
  rosterView(roster, cap, L) {
    const cards = roster.map(h => {
      const K = h.K, armed = this.armed?.id === h.id;
      const where = h.away ? `<span class="gd-where away">${cozyIcon('pack')}${esc(h.away.hold ? 'Camped by the village' : backIn(h.away.left))}<em>${esc(h.away.name)}</em></span>`
        : h.onBreak ? `<span class="gd-where brk">${cozyIcon('cross')}On a break: owed ${h.owed}</span>`
        : h.tired > 0 ? `<span class="gd-where tired">${cozyIcon('clock')}Resting ${Math.ceil(h.tired)} h</span>`
        : `<span class="gd-where ok">${cozyIcon('check')}In town, ready</span>`;
      const xpf = h.lvl >= h.cap ? 1 : Math.max(0, Math.min(1, h.xp / h.xpNext));
      const pay = h.owed ? `<button class="btn sm gd-pay" data-pay="${h.id}">${glyph('coin')}Pay ${h.owed}</button>` : '';
      const dis = `<button class="btn sm gd-dis${armed ? ' armed' : ''}" data-dismiss="${h.id}" ${h.away ? 'disabled title="Out on an expedition"' : ''}>${armed ? 'Press again' : 'Dismiss'}</button>`;
      return `<div class="gd-hire${h.onBreak ? ' brk' : ''}${h.away ? ' out' : ''}" style="--cc:${K.color}" data-card="${h.id}">
        ${this.face(h.key, true, K.color)}
        <div class="gd-ht"><b>${esc(h.name)}</b>${this.clsChip(h.cls)}</div>
        <div class="gd-hl"><span>Lv ${h.lvl}</span><span class="gd-xp" title="${h.lvl >= h.cap ? `Level ${h.cap} is the most this Guild can train` : `${Math.round(h.xp)} / ${h.xpNext} XP`}"><i style="width:${(xpf * 100).toFixed(1)}%"></i></span>${hearts(h.hearts)}</div>
        <div class="gd-hs"><span title="Crew power">${cozyIcon('power')}<b>${Math.round(h.power)}</b></span><span title="Wage a world day">${glyph('coin')}<b>${h.wage}</b>/day</span><span class="mood">${esc(h.moraleWord)}</span></div>
        ${where}
        <div class="gd-hb">${pay}${dis}</div>
      </div>`;
    });
    for (let i = roster.length; i < cap; i++) cards.push(`<div class="gd-hire free">${gIcon('hire')}<b>A free bunk</b><span>Sign someone on in the Hire tab</span></div>`);
    for (let i = cap; i < ROSTER_CAP[GUILD_MAX]; i += 3) cards.push(`<div class="gd-hire lock">${glyph('lock')}<b>${ROSTER_CAP[Math.min(GUILD_MAX, L + 1 + Math.floor((i - cap) / 3))] - i} more bunks</b><span>Guild level ${Math.min(GUILD_MAX, L + 1 + Math.floor((i - cap) / 3))}</span></div>`);
    return `<div class="gd-roster">${cards.join('')}</div>
      <div class="gd-foot">${glyph('coin')}Wages ${this.C.dailyWages()} coins a world day, paid from your coins.<span class="sep">·</span>Hires level up on expeditions, up to level ${10 + 10 * Math.max(1, L)}.</div>`;
  }
  guildView(L) {
    const u = this.C.upgradeInfo(), st = this.G.state, mats = st.materials || {};
    const perk = (k, a, b) => `<div class="gd-pk"><span>${k}</span><b>${a}</b>${b != null && b !== a ? `<i>${glyph('play')}</i><b class="new">${b}</b>` : ''}</div>`;
    const cost = c => Object.entries(c || {}).map(([k, n]) => { const have = k === 'coins' ? st.coins || 0 : mats[k] || 0; return `<span class="gd-cost${have >= n ? '' : ' short'}" title="${esc(k === 'coins' ? 'Coins' : MATERIALS[k]?.name || k)}">${k === 'coins' ? glyph('coin') : matIcon(k)}<b>${fmt(n)}</b>${have >= n ? '' : `<em>${fmt(have)}</em>`}</span>`; }).join('');
    const now = u.now, then = u.then;
    const up = u.max ? `<div class="gd-max">${glyph('star')}<b>The grandest lodge on the island!</b><span>Every bunk, a crew of five, and the lookout over it all.</span></div>`
      : `<div class="gd-costs">${cost(u.cost)}</div><div class="gd-rank${(this.G.sim?.stats?.rank || 1) >= (u.rank || 1) ? ' ok' : ''}">${cozyIcon((this.G.sim?.stats?.rank || 1) >= (u.rank || 1) ? 'check' : 'cross')}Village rank ${u.rank || 1}</div>
        <button class="btn gd-up" data-a="upgrade" ${u.ok ? '' : 'disabled'}>${gIcon('up')}<span><b>Upgrade to level ${u.next}</b><small>${esc(u.ok ? 'The builders put up the scaffold' : u.why)}</small></span></button>`;
    const tools = this.C.tools().map(t => `<div class="gd-tool${t.owned ? ' owned' : ''}">
        <span class="gd-tic">${gIcon(t.key)}</span><div class="gd-tt"><b>${esc(t.name)}</b><span>${esc(t.desc)}</span>${t.owned ? '' : `<div class="gd-costs sm">${cost(t.cost)}</div>`}</div>
        ${t.owned ? `<span class="gd-own">${glyph('check')}Yours</span>` : `<button class="btn sm gd-buy" data-tool="${t.key}" ${t.ok ? '' : 'disabled'}>Buy</button>`}
      </div>`).join('');
    return `<div class="gd-up-card">
        <div class="gd-uh">${gIcon('lodge')}<div><b>${esc(['', "Adventurers' Guild", "Adventurers' Guild Hall", "Grand Adventurers' Guild"][L] || "Adventurers' Guild")}</b><span>Level ${L} of ${GUILD_MAX}</span></div></div>
        <div class="gd-pks">${perk('Roster', now.roster, then?.roster)}${perk('Crew size', now.crew, then?.crew)}${perk('Hires up to level', now.levelCap, then?.levelCap)}${perk('Hire power', `+${now.power}%`, then ? `+${then.power}%` : null)}</div>
        ${up}
      </div>
      <div class="gd-tools"><div class="gd-sh">${glyph('star')}<b>Hachi's odds and ends</b><em>for the cozy work</em></div>${tools}</div>`;
  }
}
