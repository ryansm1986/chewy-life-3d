// The Expedition Board (docs/COZY.md §4.1, §10; ROADMAP CZ-2): pick an objective, pick a crew from the benched heroes,
// read the odds, the trip's length and the rewards, pack lunches, send them off; see the crews out and read their
// reports. Opened by F at the board beside the Wayfarer's Post (cozy/expeditionBoard.js → ui.open('expeditions',
// { at: 'board' })), and from the HUD chip and the away card to look (sending is done at the board). Data from G.cozy
// (cozy/expeditionRun.js); the numbers from the pure cozy modules, so the panel never imports world code.
//   - tabs: Story · Errands · Away · Reports (LB / RB on a pad);
//   - Story and Errands: the objectives on the left; the objective, the crew (click to add or remove, up to 4; Y "best
//     crew", X "clear" on a pad), the lunches and potions, the power bar and the odds, and Send off on the right;
//     Enter sends;
//   - Away: the crews out with their progress ("back in about 2 h"), and "Call them home";
//   - Reports: each crew's report (the outcome, a line from each member, the loot, the XP); unread ones carry a dot.
// Phones: two columns like the Spirit Lantern: the objective on the left (a ◀ ▶ picker instead of the list), unscrolled;
// the crew scrolling on the right; 44 px targets, the 12 px floor (expeditions.css).
import './expeditions.css';
import './cozy.css';
import { esc, rarityColor } from './dom.js';
import { glyph } from './glyphs.js';
import { padGlyph } from './padGlyphs.js';
import { Panel } from './panel.js';
import { portrait } from './portraits.js';
import { materialIconURL } from './rpg.js';
import { MATERIALS } from './glyphs.js';
import { pantryIcon } from '../life/pantryIcons.js';
import { PANTRY } from '../life/pantry.js';
import { cozyIcon } from './cozyIcons.js';
import { aboutHours, backIn, backBy } from '../cozy/clock.js';
import { xpFor, MAX_CREW, ODDS, oddsOf } from '../cozy/expeditions.js';

const VIEWS = [['story', 'Story', 'story'], ['errands', 'Errands', 'errand'], ['away', 'Away', 'away'], ['reports', 'Reports', 'report']];
const RESULT = { success: ['Success!', 'check', '#3aa860'], partial: ['Partly done', 'away', '#e0952a'], setback: ['Muddy and tired', 'cross', '#c86a5a'], beaten: ['You beat us to it!', 'heart', '#d86a9a'], recalled: ['Called home', 'pack', '#7a8aa8'] };
const matIcon = k => `<img class="ex-mi" src="${materialIconURL(k)}" alt="" draggable="false">`;
const listNames = a => (a.length <= 1 ? a[0] || '' : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);
const fmtN = n => (n >= 10000 ? `${Math.round(n / 1000)}k` : String(Math.round(n)));

export class ExpeditionPanel extends Panel {
  constructor(ui) {
    super(ui, { name: 'expeditions', title: 'Expedition Board', jp: '遠征', side: 'center', cls: 'p-exp', icon: 'map' });
    this.view = 'story'; this.sel = {}; this.crew = []; this.lunch = false; this.potions = 0; this.armed = null;
  }
  get C() { return this.G?.cozy; }
  init() {
    this.body.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b || b.disabled) return;
      if (b.dataset.v) this.setView(b.dataset.v);
      else if (b.dataset.o) this.pick(b.dataset.o);
      else if (b.dataset.m) this.toggle(b.dataset.m);
      else if (b.dataset.step) this.step(+b.dataset.step);
      else if (b.dataset.a === 'best') this.best();
      else if (b.dataset.a === 'clear') this.clear();
      else if (b.dataset.a === 'lunch') { if (!this.lunchLocked()) { this.lunch = !this.lunch; this.ui.sfx('tick'); this.render(); } }
      else if (b.dataset.pot) this.stepPotions(+b.dataset.pot);
      else if (b.dataset.a === 'go') this.go();
      else if (b.dataset.a === 'recall') this.recall(b.dataset.u);
      else if (b.dataset.a === 'take') { const n = this.C?.exp.take(b.dataset.u); if (n) this.ui.sfx('bag'); this.render(); }
    });
    this.onKey = e => {
      if (!this.isOpen || this.ui.dlg?.active || this.ui._order[this.ui._order.length - 1] !== 'expeditions') return;
      if (e.key === 'Enter' && (this.view === 'story' || this.view === 'errands')) { this.go(); e.preventDefault(); }
    };
    addEventListener('keydown', this.onKey);
    this.G?.events?.on?.('cozy:changed', () => { if (this.isOpen) this.render(); });
  }
  onOpen() {
    const C = this.C; if (!C) return;
    this.atBoard = this.opts.at === 'board';
    const want = this.opts.view;
    if (want) this.view = want;
    else if (C.exp.unread()) this.view = 'reports';
    else if (this.view === 'away' || this.view === 'reports' || !this.list(this.view).length) this.view = this.list('story').length ? 'story' : 'errands';
    if (this.opts.report) this.sel.reports = this.opts.report;
    else this.newestUnread();
    this.crew = this.crew.filter(k => this.member(k) && !this.memberWhy(k));
    this.render();
    clearInterval(this._tick); this._tick = setInterval(() => this.live(), 1000);
  }
  onClose() { clearInterval(this._tick); this._tick = null; }
  // ---------------------------------------------------------------- data
  list(view = this.view) {
    const C = this.C; if (!C) return [];
    if (view === 'story' || view === 'errands') return C.exp.objectives(view);
    if (view === 'away') return C.exp.list();
    if (view === 'reports') return [...C.exp.reports()].reverse();
    return [];
  }
  keyOf(x) { return x.uid || x.id; }
  current() { const L = this.list(); if (!L.length) return null; return L.find(x => this.keyOf(x) === this.sel[this.view]) || L[0]; }
  members() { return this.C?.exp.members() || []; }
  member(k) { return this.members().find(m => m.key === k) || null; }
  memberWhy(k) { const m = this.member(k); if (!m) return 'Unknown'; if (m.active) return 'Playing now'; if (m.away) return 'Away'; if (m.tired > 0) return 'Resting'; return ''; }
  supplies(o) {
    const C = this.C, n = this.crew.length, need = o ? C.exp.mealsNeeded(o, this.crew) : 0;
    const meals = (this.lunch || need > 0) && n ? C.exp.pickMeals(n) : {};
    return { meals, potions: this.potions };
  }
  lunchLocked() { const o = this.current(); return !!o && (o.supplies?.meals || 0) > 0; }
  info(o = this.current()) { if (!o?.id || !this.C) return null; return this.C.exp.info(o.id, this.crew, this.supplies(o)); }
  // ---------------------------------------------------------------- actions
  setView(v) { if (v === this.view) return; this.view = v; this.armed = null; if (v === 'reports') this.newestUnread(); this.ui.sfx('tab'); this.render(); }
  /** a report waiting to be read is the one shown (the newest), not whichever was read last time */
  newestUnread() { const u = [...(this.C?.exp.reports() || [])].reverse().find(r => !r.read); if (u) this.sel.reports = u.uid; }
  pick(id) {
    if (this.sel[this.view] === id) return;
    this.sel[this.view] = id; this.armed = null; this.ui.sfx('pick');
    if (this.view === 'reports') this.C?.exp.read(id);
    this.render();
  }
  step(d) {
    const L = this.list(); if (L.length < 2) return;
    const i = Math.max(0, L.indexOf(this.current()));
    this.pick(this.keyOf(L[(i + d + L.length) % L.length]));
  }
  toggle(k) {
    const i = this.crew.indexOf(k);
    if (i >= 0) { this.crew.splice(i, 1); this.ui.sfx('tick'); this.render(); return; }
    const why = this.memberWhy(k), m = this.member(k);
    if (why) { this.ui.sfx('deny'); this.ui.toast(`${m?.name || ''}: ${why === 'Playing now' ? "you're playing them: switch to someone else to send them" : why === 'Away' ? `away on ${m.away.obj}` : `resting for ${Math.ceil(m.tired)} h more (a meal cures it)`}`, { color: '#ffd8a8', duration: 3 }); return; }
    if (this.crew.length >= MAX_CREW) { this.ui.sfx('deny'); this.flash('.ex-crew'); return; }
    this.crew.push(k); this.ui.sfx('pick'); this.render();
  }
  /** the strongest rested heroes, one at a time, until it's a sure thing (or the crew is full) */
  best() {
    const o = this.current(); if (!o?.id) return;
    const free = this.members().filter(m => !this.memberWhy(m.key)).sort((a, b) => b.power - a.power);
    this.crew = [];
    for (const m of free) {
      if (this.crew.length >= MAX_CREW) break;
      this.crew.push(m.key);
      const I = this.info(o);
      if (I && I.odds.key === 'sure' && I.checks.every(c => c.ok)) break;
    }
    this.ui.sfx('tab'); this.render(); this.flash('.ex-crew');
  }
  clear() { this.crew = []; this.potions = 0; this.ui.sfx('tick'); this.render(); }
  stepPotions(d) {
    const have = this.G?.state?.potions?.heart || 0, v = Math.max(0, Math.min(3, have, this.potions + d));
    if (v === this.potions) { this.ui.sfx('deny'); return; }
    this.potions = v; this.ui.sfx('tick'); this.render();
  }
  go() {
    const o = this.current(); if (!o?.id || !this.C) return;
    if (!this.atBoard) { this.ui.sfx('deny'); this.ui.toast("Send crews from the Expedition Board by the Wayfarer's Post", { color: '#ffd8a8' }); return; }
    const r = this.C.exp.send(o.id, this.crew, this.supplies(o));
    if (!r?.ok) { this.ui.toast(r?.why || "They can't go yet", { color: '#ffb0a0' }); return; }
    this.crew = []; this.potions = 0; this.lunch = false;
    this.sel.away = r.e.uid; this.view = 'away';
    this.render(); this.flash('.ex-trip');
  }
  recall(uid) {
    const now = performance.now();
    if (!(this.armed?.u === uid && now - this.armed.t < 2500)) { this.armed = { u: uid, t: now }; this.ui.sfx('tick'); this.render(); return; }
    this.armed = null;
    const rep = this.C?.exp.cancel(uid);
    if (rep) { this.sel.reports = rep.uid; this.view = 'reports'; this.C.exp.read(rep.uid); }
    this.render();
  }
  flash(sel) { const e = this.body.querySelector(sel); if (!e) return; e.classList.remove('ex-flash'); void e.offsetWidth; e.classList.add('ex-flash'); }
  /** once a second while open: the Away view's bars and words (no re-render: the focus stays put) */
  live() {
    if (!this.isOpen || this.view !== 'away') return;
    for (const p of this.body.querySelectorAll('[data-prog]')) {
      const e = this.C?.exp.list().find(x => x.uid === p.dataset.prog); if (!e) { this.render(); return; }
      const left = this.C.exp.left(e), f = Math.max(0, Math.min(1, 1 - left / e.hours));
      p.style.setProperty('--f', f.toFixed(3));
      const t = p.parentElement?.querySelector('.ex-left'); if (t) t.textContent = e.hold ? 'Camped at the edge of the village' : backIn(left);
    }
  }
  // ---------------------------------------------------------------- render
  render() {
    const B = this.body, C = this.C; if (!C) { B.innerHTML = ''; return; }
    const v = this.view, L = this.list(), cur = this.current();
    if (cur) this.sel[v] = this.keyOf(cur);
    if (v === 'reports' && cur && !cur.read) C.exp.read(cur.uid);
    const counts = { story: this.list('story').length, errands: this.list('errands').length, away: C.exp.list().length, reports: C.exp.reports().length }, unread = C.exp.unread();
    const tabs = VIEWS.map(([k, label, ic]) => `<button class="tab ex-tab${v === k ? ' on' : ''}" data-v="${k}" style="--tc:${{ story: '#e8a05a', errands: '#6ac08a', away: '#6aa0e0', reports: '#d8789a' }[k]}">${cozyIcon(ic)}<span class="ex-tl">${label}</span>${k === 'reports' && unread ? `<i class="tab-n ex-new">${unread}</i>` : counts[k] ? `<i class="tab-n">${counts[k]}</i>` : ''}</button>`).join('');
    const items = L.map(x => this.card(x, cur)).join('') || `<div class="ex-empty">${this.emptyText(v)}</div>`;
    const pick = L.length ? `<div class="ex-pick"><button class="btn sm ex-arr" data-step="-1" ${L.length < 2 ? 'disabled' : ''} aria-label="Previous">‹</button><div><b>${esc(cur ? cur.name : '')}</b><span>${L.indexOf(cur) + 1} of ${L.length}</span></div><button class="btn sm ex-arr" data-step="1" ${L.length < 2 ? 'disabled' : ''} aria-label="Next">›</button></div>` : '';
    let main = '';
    if (v === 'story' || v === 'errands') main = cur ? this.objectiveMain(cur) : `<div class="ex-det ex-none">${cozyIcon('board')}<p>${this.emptyText(v)}</p></div>`;
    else if (v === 'away') main = cur ? this.awayMain(cur) : `<div class="ex-det ex-none">${cozyIcon('away')}<p>No crews are out right now. Pick a story job or an errand and send a crew!</p></div>`;
    else main = cur ? this.reportMain(cur) : `<div class="ex-det ex-none">${cozyIcon('report')}<p>No reports yet. When a crew comes home, their report waits here.</p></div>`;
    B.innerHTML = `<div class="ex" data-view="${v}">
      <div class="tabs ex-tabs">${tabs}</div>
      <div class="ex-list">${items}</div>
      ${pick}
      ${main}
    </div>`;
  }
  emptyText(v) {
    if (v === 'story') return "Nothing the story needs a crew for right now. Errands are always welcome!";
    if (v === 'errands') return 'Every errand for today is taken. New ones come with the next world day.';
    return '';
  }
  card(x, cur) {
    const on = x === cur ? ' sel' : '';
    if (this.view === 'story' || this.view === 'errands') {
      const mats = Object.keys(x.rewards?.mats?.pool || {}).slice(0, 3).map(matIcon).join('');
      return `<button class="ex-obj${on}" data-o="${esc(x.id)}" style="--pc:${x.place.color}"><span class="ex-oic">${cozyIcon(x.kind === 'errand' ? 'errand' : 'story')}</span><span class="ex-ot"><b>${esc(x.name)}</b><span class="ex-op">${esc(x.place.label)}</span><span class="ex-om">${cozyIcon('clock')}${esc(aboutHours(x.hours))}<span class="sep">·</span>${cozyIcon('power')}${x.need ?? this.C.exp.info(x.id, [], {})?.need ?? x.power}</span></span><span class="ex-omats">${mats}</span></button>`;
    }
    if (this.view === 'away') {
      const left = this.C.exp.left(x), f = Math.max(0, Math.min(1, 1 - left / x.hours));
      return `<button class="ex-obj ex-awc${on}" data-o="${esc(x.uid)}" style="--pc:${x.place?.color || '#8fd0ff'}"><span class="ex-faces">${x.crew.map(k => this.face(k, true)).join('')}</span><span class="ex-ot"><b>${esc(x.name)}</b><span class="ex-op">${x.hold ? 'Camped at the edge of the village' : esc(backIn(left))}</span><span class="ex-mini" data-prog="${x.uid}" style="--f:${f.toFixed(3)}"><i></i></span></span></button>`;
    }
    const R = RESULT[x.result] || RESULT.success;
    return `<button class="ex-obj ex-repc${on}${x.read ? '' : ' unread'}" data-o="${esc(x.uid)}" style="--pc:${R[2]}"><span class="ex-oic">${cozyIcon(R[1])}</span><span class="ex-ot"><b>${esc(x.name)}</b><span class="ex-op">${esc(R[0])} · ${esc(this.crewNames(x.crew))}</span></span>${x.read ? '' : '<i class="ex-dot"></i>'}</button>`;
  }
  face(k, sm = false) {
    const m = this.member(k), id = m?.id || k.split(':')[1];
    return `<span class="ex-face${sm ? ' sm' : ''}" style="--hc:${m?.color || '#8fd0ff'}">${portrait(id)}</span>`;
  }
  crewNames(crew) { const n = crew.map(k => this.member(k)?.name || k.split(':')[1]); return n.length <= 1 ? n[0] || '' : `${n.slice(0, -1).join(', ')} & ${n[n.length - 1]}`; }
  rewardsRow(o, I) {
    const R = o.rewards || {}, st = this.G.state, out = [];
    const lv = this.crew.length ? Math.round(this.crew.reduce((a, k) => a + (this.member(k)?.lvl || 1), 0) / this.crew.length) : Math.max(1, ...this.members().filter(m => !m.active).map(m => m.lvl), 1);
    const xp = xpFor(o, lv, 'success', I ? Math.min(1, I.need / o.power) : 1);
    out.push(`<span class="ex-rw xp" title="XP for each hero in the crew (a level-up or two for the ones behind)"><b>+${fmtN(xp)}</b> XP each</span>`);
    if (R.coins) out.push(`<span class="ex-rw" title="Coins">${glyph('coin')}<b>${R.coins[0]}–${R.coins[1]}</b></span>`);
    const mats = Object.keys(R.mats?.pool || {});
    if (mats.length) out.push(`<span class="ex-rw mats" title="${mats.map(k => MATERIALS[k]?.name || k).join(', ')}">${mats.map(matIcon).join('')}<b>${R.mats.n[0]}–${R.mats.n[1]}</b></span>`);
    if (R.pantry?.pool?.length) out.push(`<span class="ex-rw" title="${R.pantry.pool.map(k => PANTRY[k]?.name || k).join(', ')}">${R.pantry.pool.slice(0, 2).map(k => `<img class="ex-mi" src="${pantryIcon(k)}" alt="">`).join('')}</span>`);
    for (const r of R.items || []) out.push(`<span class="ex-rw item" style="--rc:${rarityColor(r)}">${glyph('gift')}<b>a ${r}</b></span>`);
    if (R.itemChance?.magic) out.push(`<span class="ex-rw item dim" style="--rc:${rarityColor('magic')}" title="Sometimes a magic item">${glyph('gift')}<b>maybe</b></span>`);
    if (R.find) out.push(`<span class="ex-rw dim" title="Sometimes a piece of furniture">${glyph('home')}<b>a find?</b></span>`);
    if (o.binds?.village) out.push(`<span class="ex-rw big">${glyph('star')}<b>The village saved!</b></span>`);
    void st;
    return out.join('');
  }
  objectiveMain(o) {
    const C = this.C, I = this.info(o), st = this.G.state;
    const hour = this.G.day?.hour ?? 12, mNeed = C.exp.mealsNeeded(o, this.crew);
    const gates = (I?.checks || []).map(c => `<div class="ex-gate ${c.ok ? 'ok' : 'no'}">${cozyIcon(c.ok ? 'check' : 'cross')}<span>${esc(c.label)}${!c.ok && c.have ? ` <em>(${esc(c.have)})</em>` : ''}</span></div>`).join('');
    const members = this.members().filter(m => !m.active || true).map(m => {
      const on = this.crew.includes(m.key), why = this.memberWhy(m.key);
      const tag = on ? `<span class="ex-mtag on">${glyph('check')}In the crew</span>` : m.active ? '<span class="ex-mtag dim">Playing now</span>' : m.away ? `<span class="ex-mtag away">${cozyIcon('pack')}${esc(backIn(m.away.left))}</span>` : m.tired > 0 ? `<span class="ex-mtag tired">Resting ${Math.ceil(m.tired)} h</span>` : '<span class="ex-mtag">Ready</span>';
      return `<button class="ex-mem${on ? ' on' : ''}${why ? ' no' : ' can'}" data-m="${m.key}" style="--hc:${m.color}" title="${esc(m.name)}: power ${Math.round(m.power)}${why ? ` · ${why}` : ''}">${this.face(m.key)}<b>${esc(m.name)}</b><span class="ex-mlv">Lv ${m.lvl} · ${cozyIcon('power')}${Math.round(m.power)}</span>${tag}</button>`;
    }).join('');
    const need = I?.need || o.power, have = I?.power || 0, max = Math.max(need * 1.5, have * 1.08, 1);
    const odds = I && this.crew.length ? I.odds : null;
    const pk = Object.values(this.supplies(o).meals).reduce((a, b) => a + b, 0), dishes = Object.entries(st.pantry || {}).filter(([k, n]) => PANTRY[k]?.kind === 'dish' && n > 0).reduce((a, [, n]) => a + n, 0);
    const lunchOn = (this.lunch || mNeed > 0) && this.crew.length > 0;
    const lunchSub = mNeed > 0 ? `${mNeed} needed · ${dishes} in the pantry` : o.supplies?.mealSure ? `${dishes ? 'Makes it a sure thing' : 'Cook a dish first'}` : `${dishes} in the pantry`;
    const pots = st.potions?.heart || 0;
    const why = !this.atBoard ? "Send crews from the Expedition Board by the Wayfarer's Post" : I?.ok ? '' : I?.why || '';
    const goSub = I?.ok ? `${esc(this.crewNames(this.crew))} · ${esc(backBy(hour, o.hours))}` : esc(why);
    return `<div class="ex-det" style="--pc:${o.place.color}">
        <div class="ex-dh"><span class="ex-dic">${cozyIcon(o.kind === 'errand' ? 'errand' : 'story')}</span><div class="ex-dt"><b>${esc(o.name)}</b><span class="ex-dp">${esc(o.place.label)}${o.place.jp ? ` <span class="jp">${esc(o.place.jp)}</span>` : ''}</span></div><span class="ex-kind">${o.kind === 'errand' ? 'Errand' : 'Story'}</span></div>
        <p class="ex-desc">${esc(o.desc || '')}</p>
        <div class="ex-facts"><div>${cozyIcon('clock')}<b>${esc(aboutHours(o.hours))}</b><span>${esc(backBy(hour, o.hours))}</span></div><div>${cozyIcon('power')}<b>${need}</b><span>power needed</span></div><div>${cozyIcon('lunch')}<b>${o.supplies?.meals ? '1 each' : 'optional'}</b><span>lunches</span></div></div>
        ${gates ? `<div class="ex-gates">${gates}</div>` : ''}
        <div class="ex-rews">${this.rewardsRow(o, I)}</div>
      </div>
      <div class="ex-crewbox">
        <div class="ex-sh">${cozyIcon('crew')}<b>Crew</b><em>${this.crew.length} of ${MAX_CREW}</em><span class="ex-sp"></span><button class="btn sm" data-a="best">${glyph('star')}Best crew</button><button class="btn sm" data-a="clear" ${this.crew.length || this.potions ? '' : 'disabled'}>${glyph('x')}Clear</button></div>
        <div class="ex-crew">${members || '<div class="ex-empty">Nobody else has joined the pack yet.</div>'}</div>
        <div class="ex-sup">
          <button class="ex-tog${lunchOn ? ' on' : ''}${mNeed > 0 ? ' locked' : ''}" data-a="lunch" ${this.crew.length ? '' : 'disabled'}>${cozyIcon('lunch')}<span><b>Pack lunches${pk ? ` ×${pk}` : ''}</b><small>${esc(lunchSub)}</small></span><i class="ex-sw"></i></button>
          <div class="ex-pots" title="Heart Treats for the road: +3% each">${cozyIcon('heart')}<span><b>Heart Treats</b><small>+3% each · ${pots} on your belt</small></span><button class="btn sm" data-pot="-1" ${this.potions ? '' : 'disabled'}>−</button><b class="ex-pn">${this.potions}</b><button class="btn sm" data-pot="1" ${this.potions < Math.min(3, pots) ? '' : 'disabled'}>+</button></div>
        </div>
      </div>
      <div class="ex-gobar">
        <div class="ex-bar" title="${odds ? `${Math.round(odds.p * 100)}% chance${odds.lunch ? ' (packed lunches)' : ''}` : ''}">
          <div class="ex-meter${odds ? ` k-${odds.key}` : ''}"><i class="ex-fill" style="width:${(have / max * 100).toFixed(1)}%"></i><i class="ex-need" style="left:${(need / max * 100).toFixed(1)}%"><span>${need}</span></i></div>
          <div class="ex-odds"${odds ? ` style="--oc:${odds.color}"` : ''}>${odds ? `<b>${esc(odds.word)}</b><em>${Math.round(have)} vs ${need} · ${Math.round(odds.p * 100)}%</em>` : '<b class="dim">Pick a crew</b>'}</div>
        </div>
        <button class="btn ex-go" data-a="go" ${I?.ok && this.atBoard ? '' : 'disabled'}>${cozyIcon('pack')}<span><b>Send off!</b><small>${goSub || '&nbsp;'}</small></span></button>
        <div class="ex-foot kbm-only"><span class="kc sm">Enter</span> send off <span class="sep">·</span> click a friend to add them</div>
        <div class="ex-foot pad-only"><span class="kc sm pad">${padGlyph('Y')}</span> best crew <span class="sep">·</span> <span class="kc sm pad">${padGlyph('X')}</span> clear <span class="sep">·</span> <span class="kc sm pad">${padGlyph('LB')}</span><span class="kc sm pad">${padGlyph('RB')}</span> tabs</div>
      </div>`;
  }
  awayMain(e) {
    const left = this.C.exp.left(e), f = Math.max(0, Math.min(1, 1 - left / e.hours)), O = ODDS.find(x => x.key === e.odds) || oddsOf(e.r || 1);
    const armed = this.armed?.u === e.uid;
    const sup = Object.entries(e.supplies?.meals || {}).map(([k, n]) => `<img class="ex-mi" src="${pantryIcon(k)}" alt="" title="${esc(PANTRY[k]?.name || k)}">${n > 1 ? `×${n}` : ''}`).join('') + (e.supplies?.potions ? ` ${cozyIcon('heart')}×${e.supplies.potions}` : '');
    return `<div class="ex-det ex-trip" style="--pc:${e.place?.color || '#8fd0ff'}">
        <div class="ex-dh"><span class="ex-dic">${cozyIcon('away')}</span><div class="ex-dt"><b>${esc(e.name)}</b><span class="ex-dp">${esc(e.place?.label || '')}</span></div><span class="ex-kind">On the road</span></div>
        <div class="ex-walk">${e.crew.map(k => `<div class="ex-wm">${this.face(k)}<b>${esc(this.member(k)?.name || '')}</b><span>Lv ${this.member(k)?.lvl || 1}</span></div>`).join('')}</div>
        <div class="ex-progw"><div class="ex-prog" data-prog="${e.uid}" style="--f:${f.toFixed(3)}"><i></i><span class="ex-paw">${cozyIcon('pack')}</span></div><div class="ex-progt"><b class="ex-left">${e.hold ? 'Camped at the edge of the village' : esc(backIn(left))}</b><span>${esc(aboutHours(e.hours))} trip · <em style="color:${O.color}">${esc(O.word)}</em> (${Math.round((e.p ?? 1) * 100)}%)</span></div></div>
        ${e.hold ? '<p class="ex-desc">They\'ll move in once you step out of the zone, so the siege you\'re standing in stays as it is.</p>' : ''}
        ${sup ? `<div class="ex-supl">Packed: ${sup}</div>` : ''}
      </div>
      <div class="ex-gobar"><button class="btn ex-recall${armed ? ' armed' : ''}" data-a="recall" data-u="${e.uid}">${glyph('home')}<span><b>${armed ? 'Press again to call them home' : 'Call them home'}</b><small>No rewards · the lunches come back</small></span></button></div>`;
  }
  reportMain(r) {
    const R = RESULT[r.result] || RESULT.success, L = r.loot || {};
    const lines = (r.lines || []).map(l => `<div class="ex-line">${this.face(l.who)}<p><b>${esc(l.name || this.member(l.who)?.name || '')}</b>${esc(l.text)}</p></div>`).join('');
    const loot = [];
    if (L.coins) loot.push(`<span class="ex-lt">${glyph('coin')}<b>${L.coins}</b></span>`);
    for (const [k, n] of Object.entries(L.mats || {})) loot.push(`<span class="ex-lt" title="${esc(MATERIALS[k]?.name || k)}">${matIcon(k)}<b>${n}</b></span>`);
    for (const [k, n] of Object.entries(L.pantry || {})) loot.push(`<span class="ex-lt" title="${esc(PANTRY[k]?.name || k)}"><img class="ex-mi" src="${pantryIcon(k)}" alt=""><b>${n}</b></span>`);
    for (const it of L.items || []) loot.push(`<span class="ex-lt item" style="--rc:${rarityColor(it.rarity)}">${glyph('gift')}<b>${esc(it.name)}</b></span>`);
    if (L.furniture) loot.push(`<span class="ex-lt">${glyph('home')}<b>A furniture find!</b></span>`);
    const xp = r.crew.map(k => { const lv = r.levels?.[k]; return r.xp?.[k] ? `<span class="ex-xp">${this.face(k, true)}<b>+${fmtN(r.xp[k])} XP</b>${lv ? `<em>Lv ${lv[0]} → ${lv[1]}!</em>` : ''}</span>` : ''; }).join('');
    return `<div class="ex-det ex-rep" style="--pc:${R[2]}">
        <div class="ex-dh"><span class="ex-stamp">${cozyIcon(R[1])}<b>${esc(R[0])}</b></span><div class="ex-dt"><b>${esc(r.name)}</b><span class="ex-dp">${esc(r.place?.label || '')}</span></div></div>
        ${r.saved ? `<div class="ex-saved">${glyph('star')}<div><b>${esc(r.saved.village)} is saved!</b><span>${r.saved.freed?.length ? `${esc(listNames(r.saved.freed))} ${r.saved.freed.length > 1 ? 'are' : 'is'} free · ` : ''}${esc(r.saved.captain)} fled into the Depths</span></div>${r.saved.jp ? `<i class="jp">${esc(r.saved.jp)}</i>` : ''}</div>` : ''}
        ${r.desc ? `<p class="ex-desc ex-flav">${esc(r.desc)}</p>` : ''}
        ${r.note ? `<p class="ex-note">${esc(r.note)}</p>` : ''}
        <div class="ex-lines">${lines}</div>
        <div class="ex-sh">${glyph('chest')}<b>Brought home</b></div>
        <div class="ex-loot">${loot.join('') || '<span class="ex-dim">Nothing this time, just stories.</span>'}</div>
        ${xp ? `<div class="ex-xps">${xp}</div>` : ''}
        ${r.items?.length ? `<div class="ex-wait">${glyph('bag')}<span>${r.items.length} item${r.items.length > 1 ? 's wait' : ' waits'} here: your bag was full.</span><button class="btn sm mint" data-a="take" data-u="${r.uid}">Take all</button></div>` : ''}
      </div>`;
  }
}
