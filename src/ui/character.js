// Character sheet, simple first (docs/STATS.md, ROADMAP UX-3): the hero's Power, six big friendly numbers (Attack,
// Life, Zoom, Defense, Speed, Luck), the four attributes with Shadow's auto points (on by default) and a free Start over,
// and every derived stat in a drawer ("All the numbers") for older players, remembered open (Settings: statsAll).
import { esc, fmt, replay, setText } from './dom.js';
import { glyph } from './glyphs.js';
import { portrait } from './portraits.js';
import { Panel } from './panel.js';
import { xpProgress } from './rpg.js';
import { simpleTip } from './tooltip.js';
import { HERO_TEXT, CLASSES } from '../rpg/classes.js';
import { statSummary, attrFx, mainStat, autoOn } from '../rpg/power.js';

const ATTR = [
  { k: 'str', n: 'Strength', g: 'swords', c: '#ff8f7a', tip: 'Makes Strength weapons (katana, flail, lance) hit harder, and lets heroes wear heavy gear.' },
  { k: 'dex', n: 'Dexterity', g: 'ball', c: '#ffcf4a', tip: 'Makes balls, the fūma and javelins hit harder, and gives a few more big hits and a little Defense.' },
  { k: 'vit', n: 'Vitality', g: 'heart', c: '#ff8fb0', tip: 'Every point gives more Life, and Life comes back a little faster.' },
  { k: 'ene', n: 'Energy', g: 'bolt', c: '#8fd0ff', tip: 'Every point gives more Zoom for skills. Staffs, the wagasa and magic (jutsu, hexes, the whelp) hit harder with it too.' },
];
// the six big numbers: [key, name, glyph, colour, value(s), sub line(s), tip]
const TILES = [
  ['attack', 'Attack', 'swords', '#ff8f7a', s => fmt(s.attack), s => `Big hit ${s.crit}%`, 'How hard an average hit lands (fire, frost, zap and stink adds too). A big hit does even more!'],
  ['life', 'Life', 'heart', '#ff7aa2', s => fmt(s.life), s => `+${s.lifeRegen} a second`, 'How many bumps you can take. Keep the pink orb full!'],
  ['zoom', 'Zoom', 'bolt', '#6fb8ff', s => fmt(s.zoom), s => `+${s.zoomRegen} a second`, 'The energy your skills use. It fills back up on its own.'],
  ['defense', 'Defense', 'shield', '#7fc9a8', s => fmt(s.defense), s => `Hurt ${s.hurtLess}% less`, 'Armour from your gear: yokai bumps hurt less.'],
  ['speed', 'Speed', 'boots', '#ffb44a', s => `${s.speed}`, s => (s.run ? `Run +${s.run}%` : 'hits a second'), 'How many hits you make every second, and how fast you run.'],
  ['luck', 'Luck', 'clover', '#8bd86a', s => `+${s.luck}%`, s => `Coins +${s.coins}%`, 'Better treasure from yokai and chests, and more coins.'],
];

const n0 = v => Math.round(+v || 0);
const n1 = v => { v = +v || 0; return Math.abs(v) < 10 && v % 1 ? v.toFixed(1) : String(Math.round(v)); };
const pct = v => `${n1(v)}%`;
const range = v => (Array.isArray(v) ? `${n0(v[0])}–${n0(v[1])}` : n1(v));
const has = v => (Array.isArray(v) ? v[0] || v[1] : +v);

// "All the numbers" (the drawer)
const GROUPS = [
  { id: 'off', name: 'Attack', g: 'swords', rows: [
    ['Damage', d => `${n0(d.dmgMin)}–${n0(d.dmgMax)}`, 'From your weakest to your strongest hit with this weapon.', 1],
    ['Hits harder', d => `+${pct(d.dmgPct)}`, 'Extra damage for every attack and skill.', 1],
    ['Hits a second', d => (d.aspd ? `${(+d.aspd).toFixed(2)}` : pct(d.atkSpeed)), 'How many attacks you make every second.', 1],
    ['Big hit chance', d => pct(d.crit), 'The chance a hit is a big hit (big gold numbers!).', 1],
    ['Big hit damage', d => `+${pct(d.critDmg)}`, 'How much more a big hit deals.', 1],
    ['Skill speed', d => `+${pct(d.castSpeed)}`, 'Skills come out faster.', 0, d => d.castSpeed],
    ['Heal on hit', d => pct(d.lifeSteal), 'Some of the damage you deal comes back as Life.', 0, d => d.lifeSteal],
    ['Zoom on hit', d => pct(d.zoomSteal), 'Some of the damage you deal comes back as Zoom.', 0, d => d.zoomSteal],
    ['Fire damage', d => range(d.fireDmg), 'Extra fire on every hit. Burns!', 0, d => has(d.fireDmg), '#ff9a3c'],
    ['Frost damage', d => range(d.frostDmg), 'Extra frost on every hit. Slows yokai down.', 0, d => has(d.frostDmg), '#8fd0ff'],
    ['Zap damage', d => range(d.zapDmg), 'Extra zap on every hit.', 0, d => has(d.zapDmg), '#ffe44a'],
    ['Stink damage', d => range(d.stinkDmg), 'Stink that keeps hurting for a while. Pee-yew.', 0, d => has(d.stinkDmg), '#9ad86a'],
    ['Fly-through', d => n0(d.pierce), 'How many yokai a thrown ball flies through.', 0, d => d.pierce],
  ] },
  { id: 'def', name: 'Toughness', g: 'shield', rows: [
    ['Life', d => n0(d.lifeMax), 'How many bumps you can take.', 1],
    ['Zoom', d => n0(d.zoomMax), 'The energy your skills use.', 1],
    ['Defense', d => n0(d.def), 'Yokai bumps hurt less.', 1],
    ['Block', d => pct(d.block), 'The chance to block a hit completely.', 1],
    ['Life back', d => `${n1(d.lifeRegen)}/s`, 'Life that comes back every second.', 1],
    ['Zoom back', d => `${n1(d.zoomRegen)}/s`, 'Zoom that comes back every second.', 1],
    ['Prickly', d => n0(d.thorns), 'Yokai that bump you up close get hurt too.', 0, d => d.thorns],
    ['Life per yokai', d => n0(d.lifeOnKill), 'Life back for every yokai you beat.', 0, d => d.lifeOnKill],
  ] },
  { id: 'res', name: 'Guards', g: 'sakura', res: true, rows: [
    ['Fire', 'resFire', '#ff9a3c', 'fire'], ['Frost', 'resFrost', '#8fd0ff', 'frost'], ['Zap', 'resZap', '#ffe44a', 'zap'], ['Stink', 'resStink', '#9ad86a', 'stink'],
  ] },
  { id: 'misc', name: 'Other', g: 'clover', rows: [
    ['Run speed', d => `+${pct(d.moveSpeed)}`, 'How fast you trot around.', 1],
    ['Treasure luck', d => `+${pct(d.mf)}`, 'Better treasure: more Magic, Rare and Unique finds.', 1],
    ['Coin luck', d => `+${pct(d.gf)}`, 'More coins from yokai and chests.', 1],
    ['More XP', d => `+${pct(d.xpBonus)}`, 'More experience from every yokai.', 0, d => d.xpBonus],
    ['Sooner skills', d => `−${pct(d.cdr)}`, 'Skills come back sooner.', 0, d => d.cdr],
    ['Every skill', d => `+${n0(d.allSkills)}`, 'Extra levels for every skill you know.', 0, d => d.allSkills],
    ['Shadow bites', d => `+${pct(d.shadowDmg)}`, 'Shadow bites and pounces harder.', 1],
    ['Shadow life', d => `+${pct(d.shadowLife)}`, 'Shadow gets more Life.', 1],
  ] },
];

export class CharacterPanel extends Panel {
  constructor(ui) { super(ui, { name: 'character', title: 'Character', side: 'left', cls: 'p-char', icon: 'star' }); }
  init() {
    const b = this.body;
    b.innerHTML = `
      <div class="ch-head">
        <div class="ch-por">${portrait('chewy')}</div>
        <div class="ch-id">
          <div class="ch-name">Chewy</div>
          <div class="ch-cls">Level <b class="ch-lv">1</b> · Pup of the Blossom Dojo</div>
          <div class="ch-xp"><i></i></div>
          <div class="ch-xpl"><span>Experience</span><b class="ch-xpt"></b></div>
        </div>
        <div class="ch-pow" data-focus>${glyph('bolt')}<span>Power</span><b>0</b></div>
      </div>
      <div class="ch-tiles">${TILES.map(([k, n, g, c]) => `
        <div class="ch-tile" data-k="${k}" data-focus style="--tc:${c}"><div class="ct-ic">${glyph(g)}</div><div class="ct-n">${n}</div><b class="ct-v">0</b><small class="ct-s"></small></div>`).join('')}
      </div>
      <div class="ch-ptsbox">
        <div class="ch-ph">
          <span class="ch-pt">${glyph('sparkle')}Points</span>
          <button class="ch-auto" title="Shadow picks your points at every level up">${glyph('paw')}<span>Shadow picks</span><span class="ch-tog"><i></i></span></button>
          <button class="ch-reset" title="Every point back, free">${glyph('swap')}<span>Start over</span></button>
        </div>
        <div class="ch-pts"><span class="ch-pts-b">${glyph('sparkle')}<b>0</b> <span class="ch-pts-w">points</span> to spend!</span><button class="ch-pick">${glyph('paw')}Pick for me</button><span class="tt-dim ch-shift">Shift+click spends 5</span></div>
        <div class="attrs">${ATTR.map(a => `
          <div class="attr" data-k="${a.k}" style="--ac:${a.c}">
            <div class="at-ic">${glyph(a.g)}<span class="at-best">★</span></div>
            <div class="at-n">${a.n}<span class="at-fx"></span></div>
            <div class="at-v"><b>10</b><small></small></div>
            <button class="at-plus" title="Add a point">${glyph('plus')}</button>
          </div>`).join('')}
        </div>
      </div>
      <button class="ch-more">${glyph('scroll')}<span>All the numbers</span><i class="ch-chev"></i></button>
      <div class="dgroups">${GROUPS.map(g => `<div class="dg dg-${g.id}"><div class="dg-h">${glyph(g.g)}${g.name}</div><div class="dg-rows"></div></div>`).join('')}</div>`;
    this.$ = {
      lv: b.querySelector('.ch-lv'), xp: b.querySelector('.ch-xp i'), xpT: b.querySelector('.ch-xpt'), pts: b.querySelector('.ch-pts'), ptsN: b.querySelector('.ch-pts b'), ptsW: b.querySelector('.ch-pts-w'),
      pow: b.querySelector('.ch-pow'), powN: b.querySelector('.ch-pow b'), auto: b.querySelector('.ch-auto'), reset: b.querySelector('.ch-reset'), pick: b.querySelector('.ch-pick'), more: b.querySelector('.ch-more'), groups: b.querySelector('.dgroups'),
    };
    const tip = this.ui.tip;
    tip.bind(this.$.pow, () => simpleTip(`${glyph('bolt')}Power`, 'Everything about your hero in one number: how hard they hit and how much they can take. Better gear and more levels make it grow!'));
    for (const [k, n, , , , , t] of TILES) tip.bind(b.querySelector(`.ch-tile[data-k="${k}"]`), () => simpleTip(n, t));
    for (const a of ATTR) {
      const row = b.querySelector(`.attr[data-k="${a.k}"]`), fx = () => simpleTip(a.n, `<b>${esc(this.heroName())}:</b> ${esc(attrFx(this.hero(), a.k))}.${row.classList.contains('main') ? ` <b class="tt-best">★ The best one for ${esc(this.heroName())}</b>` : ''}<br><span class="tt-dim">${a.tip}</span>`);
      tip.bind(row.querySelector('.at-ic'), fx); tip.bind(row.querySelector('.at-n'), fx);
      row.querySelector('.at-plus').addEventListener('click', e => this.add(a.k, e.shiftKey ? 5 : 1, row));
    }
    tip.bind(this.$.auto, () => simpleTip(`${glyph('paw')}Shadow picks`, autoOn(this.st.player) ? 'On: at every level up Shadow puts your points where your hero needs them most. Turn it off to pick them yourself.' : 'Off: you pick your own points with the + buttons. Turn it on and Shadow picks them for you.'));
    tip.bind(this.$.reset, () => simpleTip(`${glyph('swap')}Start over`, autoOn(this.st.player) ? 'Every stat point back, free, and Shadow puts them where your hero needs them most.' : 'Every stat point back, free, to spend again.'));
    this.$.auto.addEventListener('click', () => this.toggleAuto());
    this.$.reset.addEventListener('click', () => this.resetPts());
    this.$.pick.addEventListener('click', () => this.pickForMe());
    this.$.more.addEventListener('click', () => this.toggleMore());
    b.addEventListener('mouseover', e => {
      const r = e.target.closest('.dr'); if (!r || r === this._hov) return; this._hov = r;
      this.ui.tip.show(simpleTip(r.dataset.n, r.dataset.t), '', r);
    });
    b.addEventListener('mouseout', e => { const r = e.target.closest('.dr'); if (r && !r.contains(e.relatedTarget)) { this._hov = null; this.ui.tip.hide(r); } });
    this.syncMore();
  }
  hero() { return this.st.player?.cls || this.st.activeHero || 'chewy'; }
  heroName() { return this.st.player?.name || CLASSES[this.hero()]?.name || 'Chewy'; }
  add(k, n, row) {
    const A = this.G.actions; if (!A?.addStat) return;
    let added = 0;
    for (let i = 0; i < n && (this.st.player?.statPts || 0) > 0; i++) { if (A.addStat(k) === false) break; added++; }
    if (!added) { replay(row, 'deny', 400); return; }
    A.recompute?.();
    this.cheer(row, row.querySelector('.at-plus'));
    this.render();
  }
  /** the points' little celebration over an attribute row */
  cheer(row, from) {
    replay(row, 'boost', 600);
    const r = (from || row).getBoundingClientRect();
    this.ui.burst(r.left + r.width / 2, r.top + r.height / 2, { n: 12, spread: 60, colors: [getComputedStyle(row).getPropertyValue('--ac').trim() || '#ffcf4a', '#fff6e8', '#ffcf4a'] });
    this.ui.sfx?.('stat');
  }
  cheerGains(g) {
    let any = false;
    for (const k in g || {}) { const row = this.body.querySelector(`.attr[data-k="${k}"]`); if (row && g[k] > 0) { this.cheer(row); any = true; } }
    return any;
  }
  toggleAuto() {
    const A = this.G.actions, on = !autoOn(this.st.player);
    const g = A?.setAutoStats?.(on);
    replay(this.$.auto, 'boost', 500); this.ui.sfx?.('tick');
    this.render(); this.cheerGains(g);
  }
  pickForMe() {
    const g = this.G.actions?.spendAutoNow?.();
    this.render(); if (!this.cheerGains(g)) replay(this.$.pick, 'deny', 400);
  }
  resetPts() {
    const A = this.G.actions; if (!A?.resetStats) return;
    const n = A.resetStats();
    if (!n) { replay(this.$.reset, 'deny', 400); return; }
    this.render();
    const P = this.st.player, base = CLASSES[this.hero()]?.base || {}, g = {};
    for (const a of ATTR) if (P.stats[a.k] > (base[a.k] ?? 0)) g[a.k] = 1; // (Shadow placed them again)
    replay(this.$.reset, 'boost', 500);
    if (!this.cheerGains(g)) this.ui.sfx?.('stat');
  }
  toggleMore() {
    this.ui.setSetting('statsAll', !this.ui.settings.statsAll);
    this.syncMore();
    this.ui.sfx?.('tick');
    if (this.ui.settings.statsAll) { this.render(); requestAnimationFrame(() => this.$.groups.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })); }
  }
  syncMore() {
    const on = !!this.ui.settings.statsAll;
    this.body.classList.toggle('ch-all', on);
    setText(this.$.more.querySelector('span'), on ? 'Fewer numbers' : 'All the numbers');
  }
  render() {
    const st = this.st, p = st.player || {}, d = this.d;
    const hero = st.activeHero || 'chewy';
    if (hero !== this._hero) { // whoever is being played
      this._hero = hero;
      const b = this.body;
      b.querySelector('.ch-por').innerHTML = portrait(hero);
      b.querySelector('.ch-name').textContent = p.name || 'Chewy';
      b.querySelector('.ch-cls').innerHTML = `Level <b class="ch-lv">${p.lvl || 1}</b> · ${HERO_TEXT[hero]?.motto || (hero === 'moka' ? 'Tidewater Mage of the Hollow' : 'Pup of the Blossom Dojo')}`;
      this.$.lv = b.querySelector('.ch-lv');
      b.dataset.hero = hero;
      this._pow = undefined; this._tiles = null;
    }
    setText(this.$.lv, String(p.lvl || 1));
    const x = xpProgress(p);
    this.$.xp.style.width = (x.frac * 100).toFixed(1) + '%';
    setText(this.$.xpT, `${fmt(x.cur)} / ${fmt(x.need)} XP · ${Math.floor(x.frac * 100)}%`);
    // Power and the six numbers (a change pops)
    const S = statSummary(d);
    if (this._pow !== S.power) { const up = this._pow !== undefined && S.power > this._pow; this._pow = S.power; setText(this.$.powN, fmt(S.power)); if (up) replay(this.$.pow, 'pop', 600); }
    const prev = this._tiles || {};
    this._tiles = {};
    for (const [k, , , , vf, sf] of TILES) {
      const t = this.body.querySelector(`.ch-tile[data-k="${k}"]`), v = vf(S), s = sf(S);
      this._tiles[k] = v;
      setText(t.querySelector('.ct-v'), v); setText(t.querySelector('.ct-s'), s);
      if (prev[k] !== undefined && prev[k] !== v) replay(t, 'boost', 600);
    }
    // the points
    const pts = p.statPts || 0, auto = autoOn(p), cls = this.hero(), main = mainStat(cls, st.equipment);
    setText(this.$.ptsN, String(pts));
    setText(this.$.ptsW, pts === 1 ? 'point' : 'points');
    this.$.pts.classList.toggle('on', pts > 0);
    this.$.auto.classList.toggle('on', auto); this.$.auto.querySelector('.ch-tog').classList.toggle('on', auto);
    this.body.classList.toggle('ch-autoon', auto);
    const base = CLASSES[cls]?.base || {};
    const spent = ATTR.some(a => (p.stats?.[a.k] ?? 0) > (base[a.k] ?? 0));
    this.$.reset.disabled = !spent;
    for (const a of ATTR) {
      const row = this.body.querySelector(`.attr[data-k="${a.k}"]`);
      const b0 = p.stats?.[a.k] ?? 0, tot = d[a.k] ?? b0;
      setText(row.querySelector('.at-v b'), String(Math.round(tot)));
      const bonus = Math.round(tot - b0);
      setText(row.querySelector('.at-v small'), bonus ? `${bonus > 0 ? '+' : '−'}${Math.abs(bonus)} gear` : '');
      setText(row.querySelector('.at-fx'), attrFx(cls, a.k));
      row.classList.toggle('bonus', bonus > 0);
      row.classList.toggle('can', pts > 0);
      row.classList.toggle('main', a.k === main);
    }
    if (!this.ui.settings.statsAll) return; // (the drawer's rows: only while it's open)
    for (const g of GROUPS) {
      const box = this.body.querySelector(`.dg-${g.id} .dg-rows`);
      let h = '';
      if (g.res) {
        for (const [n, k, c, gl] of g.rows) {
          const v = Math.round(+d[k] || 0), cap = 75;
          const w = Math.max(0, Math.min(100, (Math.max(0, v) / cap) * 100));
          h += `<div class="dr res ${v < 0 ? 'neg' : ''} ${v >= cap ? 'cap' : ''}" style="--c:${c}" data-n="${n} guard" data-t="${n} hurts ${v}% less.<br><span class='tt-dim'>At most 75%. Deeper Burrow floors lower your guards.</span>">
            <span class="dr-ic">${glyph(gl)}</span><span class="dr-n">${n}</span><span class="rbar"><i style="width:${w}%"></i></span><b>${v}%</b></div>`;
        }
      } else {
        for (const [n, f, tip, always, show, col] of g.rows) {
          if (!always && !(show && show(d))) continue;
          h += `<div class="dr" data-n="${esc(n)}" data-t="${esc(tip)}"><span class="dr-n"${col ? ` style="color:${col}"` : ''}>${n}</span><span class="dr-dots"></span><b>${f(d)}</b></div>`;
        }
      }
      if (box._h !== h) { box._h = h; box.innerHTML = h; }
    }
  }
}
