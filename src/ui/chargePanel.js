// The K panel's Charge drawer (docs/CHARGE.md §4): a paper card docked to the skill tree's right edge that shows one
// active skill's charge: its charged release, the stage strip (Ⅰ Ⅱ Ⅲ with times, locked ones greyed), and its four
// perks as linked nodes (skill → perks) with rank pips, level gates and a detail box with the exact numbers and a
// little animated preview per perk family. Click a perk to buy its next rank with a skill point. The tree's active
// skill nodes carry a ⚡ chip (points spent; it glows when a perk can be bought) that picks the skill shown here.
import { el, esc, replay } from './dom.js';
import { glyph } from './glyphs.js';
import { skillIconURL, treeInfo, effLevel } from './rpg.js';
import { CHARGE, NUMERAL, stageTimes, chargeInfo, canLearnPerk, perksOf, maxStage, chargeable } from '../rpg/charge.js';
import { SKILLS } from '../rpg/skills.js';

const INK = '#4a2c2a';
// perk family icons: chunky ink-outlined shapes in the tree colour (--tc) like the rest of the panel
const ICON = {
  stages: () => `<svg viewBox="0 0 40 40"><g stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"><path d="M8 25l5-5 5 5-5 5z" style="fill:var(--tc)"/><path d="M15.5 17l5-5 5 5-5 5z" style="fill:var(--tc)"/><path d="M23 9l5-5 5 5-5 5z" fill="#fff6e0"/></g></svg>`,
  quick: () => `<svg viewBox="0 0 40 40"><g stroke="${INK}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="23" cy="22" r="11" fill="#fff6e0"/><path d="M23 22l0-6.5M23 22l5 3" fill="none"/><path d="M20 8h6M23 8v3" fill="none"/><path d="M4 17h6M3 23h7M5 29h6" style="stroke:var(--tc)" stroke-width="3"/></g></svg>`,
  focus: () => `<svg viewBox="0 0 40 40"><g stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"><path d="M18 5c5 8 10 13 10 19a10 10 0 0 1-20 0c0-6 5-11 10-19z" fill="#8fd0ff"/><path d="M13 25h10" stroke="#fff" stroke-width="3.2" stroke-linecap="round"/></g><circle cx="31" cy="11" r="6" style="fill:var(--tc)" stroke="${INK}" stroke-width="2.4"/><path d="M28.5 11h5" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/></svg>`,
  split: () => `<svg viewBox="0 0 40 40"><g stroke="${INK}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" style="fill:var(--tc)"><path d="M8 32L20 8" fill="none"/><path d="M8 32L33 20" fill="none"/><path d="M8 32L31 31" fill="none"/><path d="M17 7l5 0-1 5z"/><path d="M31 16l4 4-5 2z"/><path d="M28 28l5 3-5 3z"/></g><circle cx="8" cy="32" r="4" fill="#fff6e0" stroke="${INK}" stroke-width="2.4"/></svg>`,
  wide: () => `<svg viewBox="0 0 40 40"><path d="M6 30a17 17 0 0 1 28 0" fill="none" stroke="${INK}" stroke-width="9" stroke-linecap="round"/><path d="M6 30a17 17 0 0 1 28 0" fill="none" style="stroke:var(--tc)" stroke-width="4.6" stroke-linecap="round"/><path d="M12 30a10 10 0 0 1 16 0" fill="none" stroke="#fff6e0" stroke-width="3" stroke-linecap="round"/></svg>`,
  echo: () => `<svg viewBox="0 0 40 40"><g fill="none" stroke-linecap="round"><circle cx="16" cy="20" r="9" stroke="${INK}" stroke-width="6"/><circle cx="16" cy="20" r="9" style="stroke:var(--tc)" stroke-width="3"/><path d="M28 10a14 14 0 0 1 0 20" stroke="${INK}" stroke-width="5"/><path d="M28 10a14 14 0 0 1 0 20" stroke="#fff6e0" stroke-width="2.4"/><path d="M33 7a19 19 0 0 1 0 26" stroke="${INK}" stroke-width="4" opacity=".5"/></g></svg>`,
  unique: () => `<svg viewBox="0 0 40 40"><path d="M20 3l4.8 10.4 11.2 1.3-8.3 7.6 2.3 11.1L20 27.7 10 33.4l2.3-11.1L4 14.7l11.2-1.3z" fill="#ffd24a" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/><circle cx="20" cy="19" r="4.6" style="fill:var(--tc)" stroke="${INK}" stroke-width="2"/></svg>`,
};
const famOf = p => (p.kind === 'unique' ? 'unique' : p.id in ICON ? p.id : 'unique');
// tiny animated previews (SMIL) of what a perk family does
const PREVIEW = {
  stages: (id, col) => `<svg viewBox="0 0 90 60"><g stroke="${INK}" stroke-width="2.4" stroke-linejoin="round">${[0, 1, 2].map(i => `<path d="M${18 + i * 26} 30l9-9 9 9-9 9z" fill="#fff6e0"><animate attributeName="fill" values="#fff6e0;${col};${col};#fff6e0" keyTimes="0;${0.15 + i * 0.22};0.85;1" dur="2.4s" repeatCount="indefinite"/></path>`).join('')}</g></svg>`,
  quick: (id, col) => `<svg viewBox="0 0 90 60"><circle cx="28" cy="30" r="17" fill="none" stroke="#e8d6c0" stroke-width="7"/><circle cx="28" cy="30" r="17" fill="none" stroke="${col}" stroke-width="7" stroke-dasharray="107" stroke-dashoffset="107" transform="rotate(-90 28 30)"><animate attributeName="stroke-dashoffset" values="107;0;0" keyTimes="0;.85;1" dur="2.2s" repeatCount="indefinite"/></circle><circle cx="68" cy="30" r="17" fill="none" stroke="#e8d6c0" stroke-width="7"/><circle cx="68" cy="30" r="17" fill="none" stroke="${col}" stroke-width="7" stroke-dasharray="107" stroke-dashoffset="107" transform="rotate(-90 68 30)"><animate attributeName="stroke-dashoffset" values="107;0;0" keyTimes="0;.47;1" dur="2.2s" repeatCount="indefinite"/></circle><text x="28" y="34" text-anchor="middle" font-size="11" font-weight="700" fill="${INK}">1×</text><text x="68" y="34" text-anchor="middle" font-size="11" font-weight="700" fill="${INK}">fast</text></svg>`,
  focus: (id, col) => `<svg viewBox="0 0 90 60"><rect x="12" y="24" width="66" height="12" rx="6" fill="#e8d6c0" stroke="${INK}" stroke-width="2"/><rect x="12" y="24" width="66" height="12" rx="6" fill="#8fd0ff"><animate attributeName="width" values="66;48;30;48;66" dur="2.6s" repeatCount="indefinite"/></rect><text x="45" y="52" text-anchor="middle" font-size="10" font-weight="700" fill="${INK}">less zoom per stage</text></svg>`,
  split: (id, col) => `<svg viewBox="0 0 90 60"><circle cx="14" cy="30" r="5" fill="${col}" stroke="${INK}" stroke-width="2"/>${[-18, 0, 18].map(a => `<g transform="rotate(${a} 14 30)"><circle cx="14" cy="30" r="4.5" fill="#fff6e0" stroke="${INK}" stroke-width="2"><animate attributeName="cx" values="14;80" dur="1.3s" repeatCount="indefinite"/><animate attributeName="opacity" values="1;1;0" keyTimes="0;.8;1" dur="1.3s" repeatCount="indefinite"/></circle></g>`).join('')}</svg>`,
  wide: (id, col) => `<svg viewBox="0 0 90 60"><path d="M20 46a26 26 0 0 1 50 0" fill="none" stroke="${col}" stroke-width="7" stroke-linecap="round"><animate attributeName="d" values="M30 46a16 16 0 0 1 30 0;M14 48a32 32 0 0 1 62 0;M30 46a16 16 0 0 1 30 0" dur="2s" repeatCount="indefinite"/></path><circle cx="45" cy="48" r="4" fill="${INK}"/></svg>`,
  echo: (id, col) => `<svg viewBox="0 0 90 60">${[0, 0.55].map(b => `<circle cx="45" cy="30" r="6" fill="none" stroke="${col}" stroke-width="5"><animate attributeName="r" values="4;26" dur="1.6s" begin="${b}s" repeatCount="indefinite"/><animate attributeName="opacity" values="${b ? '0.55' : '1'};0" dur="1.6s" begin="${b}s" repeatCount="indefinite"/></circle>`).join('')}<circle cx="45" cy="30" r="5" fill="#fff6e0" stroke="${INK}" stroke-width="2"/></svg>`,
  unique: (id, col) => `<svg viewBox="0 0 90 60"><image href="${skillIconURL(id)}" x="27" y="4" width="36" height="36"/>${[[14, 14, 0], [76, 18, 0.4], [70, 48, 0.8], [18, 46, 1.2]].map(([x, y, b]) => `<path d="M${x} ${y - 6}l2 4 4 2-4 2-2 4-2-4-4-2 4-2z" fill="#ffd24a" stroke="${INK}" stroke-width="1.4"><animate attributeName="opacity" values="0;1;0" dur="1.6s" begin="${b}s" repeatCount="indefinite"/></path>`).join('')}<text x="45" y="54" text-anchor="middle" font-size="9.5" font-weight="700" fill="${INK}">unique</text></svg>`,
};

export class ChargeDrawer {
  constructor(panel) {
    this.sp = panel; this.ui = panel.ui; this.id = null; this.hover = null; this.sig = null;
    const d = this.el = el('div', 'chg-drawer');
    d.innerHTML = `<div class="chg-tag">${glyph('zap')}<span>Charge</span><i class="chg-jp">溜め</i></div>
      <div class="chg-head"><div class="chg-ic"><img alt="" draggable="false"></div><div class="chg-ht"><b class="chg-name"></b><span class="chg-sub"></span></div></div>
      <div class="chg-blurb"></div>
      <div class="chg-stages"></div>
      <div class="chg-row"><svg class="chg-links" viewBox="0 0 300 70" preserveAspectRatio="none"></svg><div class="chg-perks"></div></div>
      <div class="chg-detail"><div class="chg-prev"></div><div class="chg-dt"></div></div>
      <div class="chg-foot">${glyph('mouseL')}Buy a rank <span class="sep">·</span> Hold the skill's key to charge <span class="sep">·</span> Rosie's tea refunds perks</div>`;
    panel.panel.appendChild(d);
    this.$ = { ic: d.querySelector('.chg-ic img'), name: d.querySelector('.chg-name'), sub: d.querySelector('.chg-sub'), blurb: d.querySelector('.chg-blurb'), stages: d.querySelector('.chg-stages'), perks: d.querySelector('.chg-perks'), links: d.querySelector('.chg-links'), prev: d.querySelector('.chg-prev'), dt: d.querySelector('.chg-dt') };
    const P = this.$.perks;
    P.addEventListener('mouseover', e => { const n = e.target.closest('.chg-pk'); if (!n || n.dataset.p === this.hover) return; this.hover = n.dataset.p; this.detail(); this.ui.sfx?.('hover'); });
    P.addEventListener('click', e => { const n = e.target.closest('.chg-pk'); if (n) this.learn(n.dataset.p, n); });
  }
  get G() { return this.ui.G; }
  get st() { return this.G?.state || {}; }
  /** show a skill's charge (null: the tree's first learned active skill) */
  show(id) { if (id && chargeable(id)) { this.id = id; this.hover = null; this.sig = null; replay(this.el, 'swap', 420); } this.render(); }
  pick(tree) {
    if (this.id && SKILLS[this.id]?.tree === tree) return;
    const ids = Object.keys(CHARGE).filter(id => SKILLS[id].tree === tree).sort((a, b) => SKILLS[a].row - SKILLS[b].row);
    this.id = ids.find(id => (this.st.player?.skills?.[id] || 0) > 0) || ids[0] || null; this.hover = null; this.sig = null;
  }
  render() {
    const id = this.id, c = CHARGE[id], def = SKILLS[id];
    if (!c || !def) { this.el.hidden = true; return; }
    this.el.hidden = false;
    const st = this.st, pl = st.player || {}, k = perksOf(st, id), lvl = pl.skills?.[id] || 0, T = treeInfo(def.tree);
    const sig = `${id}|${lvl}|${pl.skillPts}|${JSON.stringify(k)}|${pl.lvl}`;
    if (sig === this.sig) return;
    this.sig = sig;
    this.el.style.setProperty('--tc', T.color);
    this.$.ic.src = skillIconURL(id);
    this.$.name.textContent = c.title;
    this.$.sub.textContent = `${def.name}${lvl ? ` · level ${lvl}` : ' · not learned yet'}`;
    this.$.blurb.textContent = c.blurb;
    const times = stageTimes(c, k), max = maxStage(id, st);
    this.$.stages.innerHTML = [1, 2, 3].map(s => `<div class="chg-st ${s <= max ? 'on' : 'off'}"><b>${NUMERAL[s]}</b><span>${Math.round(times[s - 1] * 100) / 100}s</span>${s > max ? glyph('lock') : ''}</div>`).join('<i class="chg-sta"></i>');
    // the perk row: skill → its four perks
    const perks = Object.values(c.perks);
    this.$.perks.innerHTML = perks.map(p => {
      const r = k[p.id] || 0, can = canLearnPerk(id, p.id, st), gate = p.req[Math.min(r, p.req.length - 1)];
      const state = r >= p.ranks ? 'max' : can.ok ? 'can' : r > 0 ? 'some' : lvl >= p.req[0] && !(p.needs && Object.keys(p.needs).some(q => (k[q] || 0) < p.needs[q])) ? 'open' : 'locked';
      return `<div class="chg-pk ${state} ${p.kind === 'unique' ? 'uniq' : ''}" data-p="${p.id}"><div class="chg-pi">${ICON[famOf(p)]()}</div>
        <div class="chg-pips">${Array.from({ length: p.ranks }, (_, i) => `<i class="${i < r ? 'on' : ''}"></i>`).join('')}</div>
        ${state === 'locked' || (state !== 'max' && lvl < gate) ? `<span class="chg-gate">Lv ${gate}</span>` : ''}<span class="chg-pn">${esc(p.name)}</span></div>`;
    }).join('');
    const n = perks.length;
    this.$.links.innerHTML = perks.map((p, i) => { const x = 300 * (i + 0.5) / n, lit = (k[p.id] || 0) > 0; return `<path class="chg-lk ${lit ? 'lit' : ''}" d="M${x} 6L${x} 64"/>`; }).join('') + `<path class="chg-lk spine" d="M${300 * 0.5 / n} 6L${300 * (n - 0.5) / n} 6"/>`;
    this.detail();
  }
  detail() {
    const id = this.id, c = CHARGE[id]; if (!c) return;
    const st = this.st, k = perksOf(st, id), p = c.perks[this.hover] || null;
    if (!p) {
      // no perk hovered: the charged release at the hero's current numbers
      const info = chargeInfo(id, st, this.G?.derived);
      this.$.prev.innerHTML = `<img src="${skillIconURL(id)}" alt="">`;
      this.$.dt.innerHTML = `<div class="chg-dh">Hold to charge <span>hover a perk for its numbers</span></div>${info.map(s => `<div class="chg-dl ${s.locked ? 'locked' : ''}"><b>${NUMERAL[s.stage]}</b> ${esc(s.lines[0])} <i>${s.t}s · ${s.cost} zoom</i>${s.locked ? ' <i class="lk">· needs Deeper Charge</i>' : ''}</div>`).join('')}`;
      return;
    }
    const r = k[p.id] || 0, can = canLearnPerk(id, p.id, st);
    const cur = r > 0 ? p.info(r, c) : null, next = r < p.ranks ? p.info(r + 1, c) : null;
    this.$.prev.innerHTML = (PREVIEW[famOf(p)] || PREVIEW.unique)(id, treeInfo(SKILLS[id].tree).color);
    this.$.dt.innerHTML = `<div class="chg-dh">${esc(p.name)} <span>${p.kind === 'unique' ? 'Unique' : p.kind === 'stage' ? 'Stages' : 'Common'} · ${r}/${p.ranks}</span></div>
      ${p.desc !== cur && p.desc !== next ? `<div class="chg-dd">${esc(p.desc)}</div>` : ''}
      ${p.pct != null && p.id !== 'wide' ? '<div class="chg-dd chg-ps">Its damage grows with the charge: half at Ⅰ, ¾ at Ⅱ, full at Ⅲ.</div>' : ''}
      ${cur ? `<div class="chg-dl"><b>Now</b> ${esc(cur)}</div>` : ''}
      ${next ? `<div class="chg-dl next"><b>${r ? 'Next' : 'Rank 1'}</b> ${esc(next)}</div>` : '<div class="chg-dl max">✦ Mastered ✦</div>'}
      ${next ? `<div class="chg-dr ${can.ok ? 'ok' : 'bad'}">${can.ok ? `Click to learn (1 skill point)` : esc(can.why)}${can.need && !can.ok && /level/.test(can.why) ? '' : ''}</div>` : ''}`;
  }
  learn(perkId, n) {
    const id = this.id, A = this.G?.actions;
    const can = canLearnPerk(id, perkId, this.st);
    if (!can.ok) { replay(n, 'deny', 420); this.ui.sfx?.('deny'); if (can.why && can.why !== 'Mastered!') this.ui.toast(can.why, { icon: 'lock', color: '#ff8fb0', duration: 2 }); return; }
    if (A?.learnPerk?.(id, perkId) === false) return;
    this.sig = null; this.hover = perkId; this.render(); this.sp._treeSig = null; this.sp.render();
    const nn = this.$.perks.querySelector(`.chg-pk[data-p="${perkId}"]`) || n, r = nn.getBoundingClientRect(), T = treeInfo(SKILLS[id].tree);
    replay(nn, 'learned-pop', 800);
    this.ui.burst(r.left + r.width / 2, r.top + r.height / 2, { n: 16, spread: 70, kind: 'star', colors: [T.color, '#fff6e8', '#ffcf4a'] });
    this.ui.ring(r.left + r.width / 2, r.top + r.height / 2, T.color);
    this.ui.sfx?.('learn');
  }
}

/** the ⚡ chip on an active skill node in the tree: points spent on its perks, glowing when one can be bought */
export function chipState(id, st) {
  if (!chargeable(id)) return null;
  const c = CHARGE[id], k = perksOf(st, id);
  let spent = 0; for (const q in k) spent += k[q] || 0;
  const can = Object.keys(c.perks).some(p => canLearnPerk(id, p, st).ok);
  return { spent, can };
}
/** tooltip section for a skill: "Hold to charge" with the current stage numbers */
export function chargeTipHTML(id, st, d) {
  const c = CHARGE[id]; if (!c) return '';
  const info = chargeInfo(id, st, d);
  return `<div class="tt-sect chg"><div class="tt-sh">⚡ Hold to charge · ${esc(c.title)}</div>${info.map(s => `<div class="tt-l ${s.locked ? 'tt-dim' : ''}"><b>${NUMERAL[s.stage]}</b> ${esc(s.lines[0])}${s.locked ? ' (Deeper Charge)' : ''}</div>`).join('')}<div class="tt-l tt-dim">${esc(c.blurb)}</div></div>`;
}
