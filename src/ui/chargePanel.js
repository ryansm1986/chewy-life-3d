// The K panel's Charge drawer (docs/CHARGE.md §4): a paper card docked to the skill tree's right edge that shows one
// active skill's charge: its charged release, the stage strip (Ⅰ Ⅱ Ⅲ with times, locked ones greyed), and its four
// perks as linked nodes (skill → perks) with rank pips, level gates and a detail box with the exact numbers and a
// little animated preview per perk family. Click a perk to buy its next rank with a skill point.
// R-16: which skill it shows is picked on the drawer itself: a strip of the tree's chargeable skills at its top (learned
// ones bright, unlearned dimmed but open to preview, the shown one raised with its points spent). The tree's active
// nodes also carry a ⚡ chip (points spent; it glows when a perk can be bought) that picks it, learning or assigning a
// skill picks it, the pad's LT / RT step through the strip, and each tree remembers its pick.
import { el, esc, replay } from './dom.js';
import { glyph } from './glyphs.js';
import { padGlyph } from './padGlyphs.js';
import { Touch } from '../core/touch.js';
import { skillIconURL, treeInfo, effLevel } from './rpg.js';
import { CHARGE, NUMERAL, stageTimes, chargeInfo, canLearnPerk, perksOf, maxStage, chargeable } from '../rpg/charge.js';
import { SKILLS } from '../rpg/skills.js';
import { aimWords } from '../combat/autoTarget.js';

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

const PICK_LABEL = 'Choose a skill to charge', DOCK = 134; // (DOCK: the drawer's top down the panel's edge, charge.css)
const PICK_HTML = 'Choose a skill<span class="chg-pll"> to charge</span>'; // (the pad's LT / RT glyphs take the tail's room: charge.css)
/** a tree's chargeable skills in the order the strip shows them (top to bottom, left to right, as the tree reads) */
export const chargeSkillsOf = tree => Object.keys(CHARGE).filter(id => SKILLS[id]?.tree === tree && chargeable(id)).sort((a, b) => SKILLS[a].row - SKILLS[b].row || SKILLS[a].col - SKILLS[b].col);

export class ChargeDrawer {
  constructor(panel) {
    this.sp = panel; this.ui = panel.ui; this.id = null; this.hover = null; this.sig = null;
    this.sel = {}; // (each tree's pick: { [tree]: skillId })
    const d = this.el = el('div', 'chg-drawer');
    d.innerHTML = `<div class="chg-tag">${glyph('zap')}<span>Charge</span><i class="chg-jp">溜め</i></div>
      <div class="chg-pl"><span class="chg-plt">${PICK_HTML}</span><i class="chg-plc"></i><span class="chg-plk pad-only"><span class="kc sm pad">${padGlyph('LT')}</span><span class="kc sm pad">${padGlyph('RT')}</span></span></div>
      <div class="chg-pick" role="group" aria-label="${PICK_LABEL}"></div>
      <div class="chg-head"><div class="chg-ic"><img alt="" draggable="false"></div><div class="chg-ht"><b class="chg-name"></b><span class="chg-sub"></span></div></div>
      <div class="chg-blurb"></div>
      <div class="chg-stages"></div>
      <div class="chg-row"><svg class="chg-links" viewBox="0 0 300 70" preserveAspectRatio="none"></svg><div class="chg-perks"></div></div>
      <div class="chg-detail"><div class="chg-prev"></div><div class="chg-dt"></div></div>
      <div class="chg-foot">${glyph('mouseL')}Buy a rank <span class="sep">·</span> Hold the skill's key to charge <span class="sep">·</span> Rosie's tea refunds perks</div>`;
    panel.panel.appendChild(d);
    this.$ = { ic: d.querySelector('.chg-ic img'), name: d.querySelector('.chg-name'), sub: d.querySelector('.chg-sub'), blurb: d.querySelector('.chg-blurb'), stages: d.querySelector('.chg-stages'), perks: d.querySelector('.chg-perks'), links: d.querySelector('.chg-links'), prev: d.querySelector('.chg-prev'), dt: d.querySelector('.chg-dt'), pick: d.querySelector('.chg-pick'), pl: d.querySelector('.chg-plt') };
    const P = this.$.perks;
    P.addEventListener('mouseover', e => { const n = e.target.closest('.chg-pk'); if (!n || n.dataset.p === this.hover) return; this.hover = n.dataset.p; this.detail(); this.ui.sfx?.('hover'); });
    P.addEventListener('click', e => { const n = e.target.closest('.chg-pk'); if (n) this.learn(n.dataset.p, n); });
    // the skill strip: a click (a tap, the pad's A) shows that skill; hovering names it in the strip's label
    const K = this.$.pick;
    K.addEventListener('click', e => { const b = e.target.closest('.chg-sk'); if (b) this.choose(b.dataset.k); });
    K.addEventListener('mouseover', e => { const b = e.target.closest('.chg-sk'); if (b && !Touch.fromTouch(e)) this.label(b.dataset.k); }); // (a tap's compat mouseover: no name left behind)
    K.addEventListener('mouseout', e => { if (!K.contains(e.relatedTarget)) this.label(null); }); // (the pad's focus leaving sends one with no relatedTarget)
    addEventListener('resize', () => { if (this.sp.isOpen) requestAnimationFrame(() => this.fit()); }, { passive: true });
  }
  get G() { return this.ui.G; }
  get st() { return this.G?.state || {}; }
  /** show a skill's charge (null: the tree's first learned active skill); it becomes its tree's pick */
  show(id) {
    if (id && chargeable(id)) {
      this.sel[SKILLS[id].tree] = id;
      if (id !== this.id) { this.id = id; this.hover = null; this.sig = null; replay(this.el, 'swap', 420); }
    }
    this.render();
  }
  /** a skill was learned, assigned or picked elsewhere: its tree's pick, and the drawer's when that tree is shown */
  select(id) {
    if (!id || !chargeable(id)) return;
    if (SKILLS[id].tree === this.sp.tree) this.show(id); else this.sel[SKILLS[id].tree] = id;
  }
  /** the strip (or the pad's LT / RT): show it, ring its node in the tree */
  choose(id) {
    if (!id || !chargeable(id)) return;
    this.show(id);
    this.sp._treeSig = null; this.sp.render();
    this.ui.tip?.hide();
    this.ui.sfx?.('tab');
  }
  /** step through the shown tree's strip (the pad's LT / RT): d = ±1, wrapping */
  cycle(d) {
    const ids = chargeSkillsOf(this.sp.tree); if (!ids.length) return;
    const i = ids.indexOf(this.id);
    this.choose(ids[((i < 0 ? 0 : i + d) % ids.length + ids.length) % ids.length]);
  }
  pick(tree) {
    if (this.id && SKILLS[this.id]?.tree === tree) return;
    const ids = chargeSkillsOf(tree), mem = this.sel[tree];
    this.id = (ids.includes(mem) && mem) || ids.find(id => (this.st.player?.skills?.[id] || 0) > 0) || ids[0] || null; this.hover = null; this.sig = null;
  }
  /** the strip's label: what it's for, or the hovered skill's name */
  label(id) {
    const def = id && SKILLS[id], lvl = def ? this.st.player?.skills?.[id] || 0 : 0;
    if (def) this.$.pl.textContent = `${def.name}${lvl ? '' : ' · not learned yet'}`; else this.$.pl.innerHTML = PICK_HTML;
    this.$.pl.parentElement.classList.toggle('named', !!def);
  }
  /** the strip: one button per chargeable skill of the tree (rebuilt when the tree changes; else its marks updated) */
  renderPick(tree) {
    const K = this.$.pick, ids = chargeSkillsOf(tree), st = this.st, pl = st.player || {};
    const sig = `${tree}|${this.id}|${pl.skillPts}|${pl.lvl}|${ids.map(i => pl.skills?.[i] || 0).join()}|${JSON.stringify(pl.chargePerks || {})}`;
    if (sig === this._pickSig) return;
    this._pickSig = sig;
    if (K.dataset.tree !== tree) {
      K.dataset.tree = tree;
      K.innerHTML = ids.map(id => `<button class="chg-sk" data-k="${id}" aria-label="${esc(SKILLS[id].name)}"><img src="${skillIconURL(id)}" alt="" draggable="false"><b class="chg-skn" hidden></b></button>`).join('');
      this.label(null);
    }
    for (const b of K.children) {
      const id = b.dataset.k, cs = chipState(id, st), on = id === this.id, lvl = pl.skills?.[id] || 0;
      b.classList.toggle('sel', on); if (b.getAttribute('aria-pressed') !== String(on)) b.setAttribute('aria-pressed', String(on));
      b.classList.toggle('unl', lvl <= 0); b.classList.toggle('can', !!cs?.can);
      const n = b.lastElementChild, s = cs?.spent ? String(cs.spent) : '';
      if (n.textContent !== s) n.textContent = s;
      if (n.hidden !== !s) n.hidden = !s;
    }
  }
  render() { this.draw(); this.fit(); }
  /** keep the drawer on the screen: docked 134 px down the panel's edge, it slides up that edge as far as it must when
   *  it would run off the bottom (a tall drawer at a big UI size on a 720 px screen), its tag staying on screen. It is
   *  placed for the tallest of the tree's skills, so it stays put while the strip switches between them. Laid out from
   *  the panel's wrapper and the drawer's own layout height, so the panel's open animation doesn't skew it. A phone's
   *  drawer is a sheet over the tree (mobile.css) */
  fit() {
    const d = this.el, pw = this.sp.panel?.parentElement, ui = this.ui;
    let top = DOCK;
    if (!d.hidden && this.sp.isOpen && pw && !ui.root?.classList.contains('m-phone')) {
      const z = d.currentCSSZoom ?? ui.scale ?? 1, sa = ui.mobile?.sf || { t: 0, b: 0 }, deck = ui.root?.classList.contains('deck-ui') ? 12 : 0;
      const pTop = pw.getBoundingClientRect().top, h = this.tallest() * z, bottom = innerHeight - sa.b - deck - 6;
      const over = pTop + (4 + DOCK) * z + h - bottom;
      if (over > 0) top = Math.max(12, (sa.t + deck + 8 + 20 * z - pTop) / z - 4, DOCK - over / z); // (the tag sticks 16 px out of the top)
    }
    const v = top === DOCK ? '' : `${top.toFixed(1)}px`;
    if (d.style.top !== v) d.style.top = v;
  }
  /** the drawer's layout height for the tallest skill of its tree (each drawn once, then the shown one again; cached
   *  until the tree, the hero's numbers or the drawer's width change) */
  tallest() {
    const d = this.el, tree = SKILLS[this.id]?.tree, pl = this.st.player || {};
    const key = `${tree}|${pl.lvl}|${pl.skillPts}|${JSON.stringify(pl.skills || {})}|${JSON.stringify(pl.chargePerks || {})}|${d.offsetWidth}|${this.ui.root?.className}`; // (not the shown skill: switching inside a tree reuses it)
    if (this._tall?.key === key) return Math.max(this._tall.h, d.offsetHeight);
    const keep = { id: this.id, hover: this.hover };
    let h = 0;
    for (const id of chargeSkillsOf(tree)) { this.id = id; this.hover = null; this.sig = null; this.draw(); h = Math.max(h, d.offsetHeight); }
    this.id = keep.id; this.hover = keep.hover; this.sig = null; this.draw();
    this._tall = { key, h };
    return Math.max(h, d.offsetHeight);
  }
  draw() {
    const id = this.id, c = CHARGE[id], def = SKILLS[id];
    if (!c || !def) { this.el.hidden = true; return; }
    this.el.hidden = false;
    const st = this.st, pl = st.player || {}, k = perksOf(st, id), lvl = pl.skills?.[id] || 0, T = treeInfo(def.tree);
    this.renderPick(def.tree);
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
      ${p.desc !== cur && p.desc !== next ? `<div class="chg-dd">${esc(aimWords(p.desc, id, { kind: 'target' }))}</div>` : ''}
      ${p.pct != null && p.id !== 'wide' ? '<div class="chg-dd chg-ps">Its damage grows with the charge: half at Ⅰ, ¾ at Ⅱ, full at Ⅲ.</div>' : ''}
      ${cur ? `<div class="chg-dl"><b>Now</b> ${esc(aimWords(cur, id, { kind: 'target' }))}</div>` : ''}
      ${next ? `<div class="chg-dl next"><b>${r ? 'Next' : 'Rank 1'}</b> ${esc(aimWords(next, id, { kind: 'target' }))}</div>` : '<div class="chg-dl max">✦ Mastered ✦</div>'}
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
