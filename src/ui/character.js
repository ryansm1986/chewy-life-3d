// Character sheet: attributes with + buttons and every derived stat grouped with explanations.
import { el, esc, fmt, replay, setText } from './dom.js';
import { glyph } from './glyphs.js';
import { portrait } from './portraits.js';
import { Panel } from './panel.js';
import { xpProgress } from './rpg.js';
import { simpleTip } from './tooltip.js';

const ATTR = [
  { k: 'str', n: 'Strength', jp: '力', g: 'swords', c: '#ff8f7a', tip: 'Adds damage to Bone Sword attacks (Chewy) and lets you wear heavier gear.' },
  { k: 'dex', n: 'Dexterity', jp: '速', g: 'ball', c: '#ffcf4a', tip: 'Adds damage to thrown balls, improves block chance and crit chance a little.' },
  { k: 'vit', n: 'Vitality', jp: '体', g: 'heart', c: '#ff8fb0', tip: 'Each point grants extra Life and a bit of Life regeneration.' },
  { k: 'ene', n: 'Energy', jp: '気', g: 'bolt', c: '#8fd0ff', tip: 'Each point grants extra Zoom (skill energy) and Zoom regeneration. With a staff (Moka) it also adds +1% spell damage.' },
];

const n0 = v => Math.round(+v || 0);
const n1 = v => { v = +v || 0; return Math.abs(v) < 10 && v % 1 ? v.toFixed(1) : String(Math.round(v)); };
const pct = v => `${n1(v)}%`;
const range = v => (Array.isArray(v) ? `${n0(v[0])}–${n0(v[1])}` : n1(v));
const has = v => (Array.isArray(v) ? v[0] || v[1] : +v);

const GROUPS = [
  { id: 'off', name: 'Offense', jp: '攻撃', g: 'swords', rows: [
    ['Damage', d => `${n0(d.dmgMin)}–${n0(d.dmgMax)}`, 'Damage range of a basic attack with your active weapon.', 1],
    ['Damage bonus', d => `+${pct(d.dmgPct)}`, 'Percent bonus applied to all weapon and skill damage.', 1],
    ['Attack speed', d => (d.aspd ? `${(+d.aspd).toFixed(2)}/s` : pct(d.atkSpeed)), 'How many attacks per second you perform.', 1],
    ['Crit chance', d => pct(d.crit), 'Chance for a hit to be a critical strike (big gold numbers!).', 1],
    ['Crit damage', d => `+${pct(d.critDmg)}`, 'Extra damage dealt by critical strikes.', 1],
    ['Cast speed', d => `+${pct(d.castSpeed)}`, 'Faster skill casting animations.', 0, d => d.castSpeed],
    ['Life steal', d => pct(d.lifeSteal), 'Percent of damage dealt returned as Life.', 0, d => d.lifeSteal],
    ['Zoom steal', d => pct(d.zoomSteal), 'Percent of damage dealt returned as Zoom.', 0, d => d.zoomSteal],
    ['Fire damage', d => range(d.fireDmg), 'Extra fire damage added to attacks. Burns!', 0, d => has(d.fireDmg), '#ff9a3c'],
    ['Frost damage', d => range(d.frostDmg), 'Extra frost damage added to attacks. Slows foes.', 0, d => has(d.frostDmg), '#8fd0ff'],
    ['Zap damage', d => range(d.zapDmg), 'Extra zap damage added to attacks.', 0, d => has(d.zapDmg), '#ffe44a'],
    ['Stink damage', d => range(d.stinkDmg), 'Stink damage over time. Pee-yew.', 0, d => has(d.stinkDmg), '#9ad86a'],
    ['Pierce', d => pct(d.pierce), 'Chance for thrown balls to pass through enemies.', 0, d => d.pierce],
  ] },
  { id: 'def', name: 'Defense', jp: '防御', g: 'shield', rows: [
    ['Life', d => n0(d.lifeMax), 'Maximum Life. Keep the pink orb full!', 1],
    ['Zoom', d => n0(d.zoomMax), 'Maximum Zoom — the energy skills spend.', 1],
    ['Defense', d => n0(d.def), 'Reduces physical damage taken.', 1],
    ['Block', d => pct(d.block), 'Chance to completely block an incoming hit.', 1],
    ['Life regen', d => `${n1(d.lifeRegen)}/s`, 'Life restored every second.', 1],
    ['Zoom regen', d => `${n1(d.zoomRegen)}/s`, 'Zoom restored every second.', 1],
    ['Thorns', d => n0(d.thorns), 'Damage reflected to attackers that hit you in melee.', 0, d => d.thorns],
    ['Life on kill', d => n0(d.lifeOnKill), 'Life restored whenever you defeat a monster.', 0, d => d.lifeOnKill],
  ] },
  { id: 'res', name: 'Resists', jp: '耐性', g: 'sakura', res: true, rows: [
    ['Fire', 'resFire', '#ff9a3c', 'fire'], ['Frost', 'resFrost', '#8fd0ff', 'frost'], ['Zap', 'resZap', '#ffe44a', 'zap'], ['Stink', 'resStink', '#9ad86a', 'stink'],
  ] },
  { id: 'misc', name: 'Other', jp: 'その他', g: 'clover', rows: [
    ['Move speed', d => `+${pct(d.moveSpeed)}`, 'How fast you trot around.', 1],
    ['Magic find', d => `+${pct(d.mf)}`, 'Better chance that dropped items are Magic, Rare or Unique.', 1],
    ['Coin find', d => `+${pct(d.gf)}`, 'More coins from monsters and chests.', 1],
    ['XP bonus', d => `+${pct(d.xpBonus)}`, 'Extra experience from every defeated monster.', 0, d => d.xpBonus],
    ['Cooldown', d => `−${pct(d.cdr)}`, 'Cooldown reduction for all skills.', 0, d => d.cdr],
    ['All skills', d => `+${n0(d.allSkills)}`, 'Bonus levels to every skill you know.', 0, d => d.allSkills],
    ['Shadow damage', d => `+${pct(d.shadowDmg)}`, "Bonus to Shadow's bites and pounces.", 1],
    ['Shadow life', d => `+${pct(d.shadowLife)}`, "Bonus to Shadow's maximum Life.", 1],
  ] },
];

export class CharacterPanel extends Panel {
  constructor(ui) { super(ui, { name: 'character', title: 'Character', jp: 'ステータス', side: 'left', cls: 'p-char', icon: 'star' }); }
  init() {
    const b = this.body;
    b.innerHTML = `
      <div class="ch-head">
        <div class="ch-por">${portrait('chewy')}</div>
        <div class="ch-id">
          <div class="ch-name">Chewy <span class="jp">チューイ</span></div>
          <div class="ch-cls">Level <b class="ch-lv">1</b> · Pup of the Blossom Dojo</div>
          <div class="ch-xp"><i></i></div>
          <div class="ch-xpl"><span>Experience</span><b class="ch-xpt"></b></div>
        </div>
      </div>
      <div class="ch-pts"><span class="ch-pts-b">${glyph('sparkle')}<b>0</b> <span class="ch-pts-w">points</span> to spend!</span><span class="tt-dim">Shift+click spends 5</span></div>
      <div class="attrs">${ATTR.map(a => `
        <div class="attr" data-k="${a.k}" style="--ac:${a.c}">
          <div class="at-ic">${glyph(a.g)}</div>
          <div class="at-n">${a.n}<span class="jp">${a.jp}</span></div>
          <div class="at-v"><b>10</b><small></small></div>
          <button class="at-plus" title="Add a point">${glyph('plus')}</button>
        </div>`).join('')}
      </div>
      <div class="dgroups">${GROUPS.map(g => `<div class="dg dg-${g.id}"><div class="dg-h">${glyph(g.g)}${g.name}<span class="jp">${g.jp}</span></div><div class="dg-rows"></div></div>`).join('')}</div>`;
    this.$ = { lv: b.querySelector('.ch-lv'), xp: b.querySelector('.ch-xp i'), xpT: b.querySelector('.ch-xpt'), pts: b.querySelector('.ch-pts'), ptsN: b.querySelector('.ch-pts b'), ptsW: b.querySelector('.ch-pts-w') };
    for (const a of ATTR) {
      const row = b.querySelector(`.attr[data-k="${a.k}"]`);
      this.ui.tip.bind(row.querySelector('.at-ic'), () => simpleTip(`${a.n} <span class="jp">${a.jp}</span>`, a.tip));
      this.ui.tip.bind(row.querySelector('.at-n'), () => simpleTip(`${a.n} <span class="jp">${a.jp}</span>`, a.tip));
      row.querySelector('.at-plus').addEventListener('click', e => this.add(a.k, e.shiftKey ? 5 : 1, row));
    }
    b.addEventListener('mouseover', e => {
      const r = e.target.closest('.dr'); if (!r || r === this._hov) return; this._hov = r;
      this.ui.tip.show(simpleTip(r.dataset.n, r.dataset.t), '', r);
    });
    b.addEventListener('mouseout', e => { const r = e.target.closest('.dr'); if (r && !r.contains(e.relatedTarget)) { this._hov = null; this.ui.tip.hide(r); } });
  }
  add(k, n, row) {
    const A = this.G.actions; if (!A?.addStat) return;
    let added = 0;
    for (let i = 0; i < n && (this.st.player?.statPts || 0) > 0; i++) { if (A.addStat(k) === false) break; added++; }
    if (!added) { replay(row, 'deny', 400); return; }
    A.recompute?.();
    replay(row, 'boost', 600);
    const r = row.querySelector('.at-plus').getBoundingClientRect();
    this.ui.burst(r.left + r.width / 2, r.top + r.height / 2, { n: 12, spread: 60, colors: [getComputedStyle(row).getPropertyValue('--ac').trim() || '#ffcf4a', '#fff6e8', '#ffcf4a'] });
    this.ui.sfx?.('stat');
    this.render();
  }
  render() {
    const st = this.st, p = st.player || {}, d = this.d;
    const hero = st.activeHero || 'chewy';
    if (hero !== this._hero) { // whoever is being played
      this._hero = hero;
      const b = this.body;
      b.querySelector('.ch-por').innerHTML = portrait(hero);
      b.querySelector('.ch-name').innerHTML = `${esc(p.name || 'Chewy')} <span class="jp">${hero === 'moka' ? 'モカ' : 'チューイ'}</span>`;
      b.querySelector('.ch-cls').innerHTML = `Level <b class="ch-lv">${p.lvl || 1}</b> · ${hero === 'moka' ? 'Tidewater Mage of the Hollow' : 'Pup of the Blossom Dojo'}`;
      this.$.lv = b.querySelector('.ch-lv');
      b.dataset.hero = hero;
    }
    setText(this.$.lv, String(p.lvl || 1));
    const x = xpProgress(p);
    this.$.xp.style.width = (x.frac * 100).toFixed(1) + '%';
    setText(this.$.xpT, `${fmt(x.cur)} / ${fmt(x.need)} XP · ${Math.floor(x.frac * 100)}%`);
    const pts = p.statPts || 0;
    setText(this.$.ptsN, String(pts));
    setText(this.$.ptsW, pts === 1 ? 'point' : 'points');
    this.$.pts.classList.toggle('on', pts > 0);
    for (const a of ATTR) {
      const row = this.body.querySelector(`.attr[data-k="${a.k}"]`);
      const base = p.stats?.[a.k] ?? 0, tot = d[a.k] ?? base;
      setText(row.querySelector('.at-v b'), String(Math.round(tot)));
      const bonus = Math.round(tot - base);
      setText(row.querySelector('.at-v small'), bonus ? `${base} ${bonus > 0 ? '+' : '−'} ${Math.abs(bonus)}` : '');
      row.classList.toggle('bonus', bonus > 0);
      row.classList.toggle('can', pts > 0);
    }
    for (const g of GROUPS) {
      const box = this.body.querySelector(`.dg-${g.id} .dg-rows`);
      let h = '';
      if (g.res) {
        for (const [n, k, c, gl] of g.rows) {
          const v = Math.round(+d[k] || 0), cap = 75;
          const w = Math.max(0, Math.min(100, (Math.max(0, v) / cap) * 100));
          h += `<div class="dr res ${v < 0 ? 'neg' : ''} ${v >= cap ? 'cap' : ''}" style="--c:${c}" data-n="${n} resistance" data-t="Reduces ${n.toLowerCase()} damage taken by ${v}%.<br><span class='tt-dim'>Maximum 75%. Deeper Burrow floors lower your resistances.</span>">
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
