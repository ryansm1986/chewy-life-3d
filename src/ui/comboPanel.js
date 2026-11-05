// The K panel's Combo pane (docs/COMBO.md §4): the Charge drawer's second tab (ui/chargePanel.js), the Charge card's twin
// for the weapon strikes that chain. One combo skill at a time: a strip of the tree's combo skills, the skill's chain
// (Tap · Chain · Finisher with its zoom and speed at the hero's numbers), its four perks as linked nodes with rank pips
// and level gates, and a detail box (Now / Next with the exact numbers). Click a perk to buy its next rank.
// Built from the Charge card's classes (charge.css) so the two read as one drawer; its own bits are in combo.css.
import './combo.css';
import { el, esc, replay } from './dom.js';
import { Touch } from '../core/touch.js';
import { skillIconURL, treeInfo } from './rpg.js';
import { COMBO, WINDOW, STEPS, FINISH_PCT, comboSkillsOf, comboPerksOf, canLearnComboPerk, comboSteps, comboable } from '../rpg/combo.js';
import { SKILLS, skillRuntime } from '../rpg/skills.js';

const INK = '#4a2c2a';
/** the chain-link mark (the tab, the tree's chip, the hotbar badge): two linked rings in the tree colour (--tc) */
export const CHAIN_SVG = `<svg class="cmb-ln" viewBox="0 0 32 32"><g fill="none" stroke-linecap="round"><rect x="2.5" y="12.5" width="16" height="9" rx="4.5" transform="rotate(-38 10.5 17)" stroke="${INK}" stroke-width="6.2"/><rect x="2.5" y="12.5" width="16" height="9" rx="4.5" transform="rotate(-38 10.5 17)" style="stroke:var(--cc,var(--tc,#ffc24a))" stroke-width="3"/><rect x="13.5" y="10.5" width="16" height="9" rx="4.5" transform="rotate(-38 21.5 15)" stroke="${INK}" stroke-width="6.2"/><rect x="13.5" y="10.5" width="16" height="9" rx="4.5" transform="rotate(-38 21.5 15)" stroke="#fff6e0" stroke-width="3"/><path d="M8.6 13.2l2.4 3" stroke="${INK}" stroke-width="2.4"/></g></svg>`;
// perk icons (the Charge card's chunky ink style): Quick Hands a stopwatch with speed lines, Light Touch a feather on a
// zoom drop, Free Finisher a star with a "0", Tempo a little metronome
const ICON = {
  quick: () => `<svg viewBox="0 0 40 40"><g stroke="${INK}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="23" cy="22" r="11" fill="#fff6e0"/><path d="M23 22l0-6.5M23 22l5 3" fill="none"/><path d="M20 8h6M23 8v3" fill="none"/><path d="M4 17h6M3 23h7M5 29h6" style="stroke:var(--tc)" stroke-width="3"/></g></svg>`,
  light: () => `<svg viewBox="0 0 40 40"><g stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"><path d="M15 9c4 7 8 11 8 16a8 8 0 0 1-16 0c0-5 4-9 8-16z" fill="#8fd0ff"/><path d="M33 6C24 9 20 17 19 30c6-3 13-11 14-24z" fill="#fff6e0"/><path d="M33 6L21 27" fill="none" style="stroke:var(--tc)" stroke-width="2.4"/></g></svg>`,
  free: () => `<svg viewBox="0 0 40 40"><path d="M20 3l4.8 10.4 11.2 1.3-8.3 7.6 2.3 11.1L20 27.7 10 33.4l2.3-11.1L4 14.7l11.2-1.3z" fill="#ffd24a" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/><ellipse cx="20" cy="19.5" rx="4.4" ry="5.6" fill="#fff6e0" stroke="${INK}" stroke-width="2.4"/><path d="M16.5 24.5l7-10" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/></svg>`,
  tempo: () => `<svg viewBox="0 0 40 40"><g stroke="${INK}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"><path d="M14 6h12l7 28H7z" style="fill:var(--tc)"/><path d="M11 27h18" fill="none"/><path d="M20 27L28 9" fill="none" stroke-width="3"/><circle cx="26" cy="13" r="3.4" fill="#fff6e0"/></g></svg>`,
};
// tiny animated previews (SMIL), like the Charge card's
const PREVIEW = {
  quick: (col) => `<svg viewBox="0 0 90 60">${[0, 1, 2].map(i => `<circle cx="${18 + i * 27}" cy="30" r="9" fill="#e8d6c0" stroke="${INK}" stroke-width="2"><animate attributeName="fill" values="#e8d6c0;${col};#e8d6c0" keyTimes="0;.15;1" dur="${i ? 0.9 : 1.2}s" begin="${[0, 0.6, 1.1][i]}s" repeatCount="indefinite"/></circle>`).join('')}<text x="45" y="55" text-anchor="middle" font-size="9.5" font-weight="700" fill="${INK}">a faster chain</text></svg>`,
  light: (col) => `<svg viewBox="0 0 90 60"><rect x="12" y="22" width="66" height="12" rx="6" fill="#e8d6c0" stroke="${INK}" stroke-width="2"/><rect x="12" y="22" width="66" height="12" rx="6" fill="#8fd0ff"><animate attributeName="width" values="66;56;46;66" keyTimes="0;.33;.66;1" dur="2.4s" repeatCount="indefinite"/></rect><text x="45" y="50" text-anchor="middle" font-size="10" font-weight="700" fill="${INK}">less zoom per step</text></svg>`,
  free: (col) => `<svg viewBox="0 0 90 60"><circle cx="16" cy="28" r="7" fill="#8fd0ff" stroke="${INK}" stroke-width="2"/><circle cx="38" cy="28" r="7" fill="#8fd0ff" stroke="${INK}" stroke-width="2"/><path d="M66 15l3.6 7.6 8.4 1-6.2 5.6 1.7 8.3L66 33.3l-7.5 4.2 1.7-8.3L54 23.6l8.4-1z" fill="#ffd24a" stroke="${INK}" stroke-width="2"><animateTransform attributeName="transform" type="scale" values="1;1.12;1" additive="sum" dur="1.2s" repeatCount="indefinite"/></path><text x="45" y="54" text-anchor="middle" font-size="10" font-weight="700" fill="${INK}">the ★ is free</text></svg>`,
  tempo: (col) => `<svg viewBox="0 0 90 60"><path d="M45 44L45 14" stroke="${INK}" stroke-width="3" stroke-linecap="round"><animateTransform attributeName="transform" type="rotate" values="-28 45 46;28 45 46;-28 45 46" dur="0.9s" repeatCount="indefinite"/></path><circle cx="45" cy="46" r="5" fill="${col}" stroke="${INK}" stroke-width="2"/><text x="45" y="58" text-anchor="middle" font-size="9.5" font-weight="700" fill="${INK}">quicker after ★</text></svg>`,
};
const STEP_GLYPH = ['', '1', '2', '★'];

export class ComboPane {
  constructor(drawer) {
    this.d = drawer; this.ui = drawer.ui; this.id = null; this.hover = null; this.sig = null;
    this.sel = {}; // (each tree's pick)
    const p = this.el = el('div', 'cmb-pane'); p.hidden = true;
    p.innerHTML = `<div class="chg-pl cmb-pl"><span class="chg-plt">Choose a skill to chain</span></div>
      <div class="chg-pick cmb-pick" role="group" aria-label="Choose a skill to chain"></div>
      <div class="chg-head"><div class="chg-ic"><img alt="" draggable="false"></div><div class="chg-ht"><b class="chg-name"></b><span class="chg-sub"></span></div></div>
      <div class="chg-blurb"></div>
      <div class="chg-stages cmb-steps"></div>
      <div class="chg-row"><svg class="chg-links" viewBox="0 0 300 70" preserveAspectRatio="none"></svg><div class="chg-perks cmb-perks"></div></div>
      <div class="chg-detail"><div class="chg-prev"></div><div class="chg-dt"></div></div>
      <div class="chg-foot">Tap the skill again to chain <span class="sep">·</span> Hold to charge a finisher <span class="sep">·</span> Rosie's tea refunds perks</div>`;
    const q = s => p.querySelector(s);
    this.$ = { pl: q('.cmb-pl .chg-plt'), pick: q('.cmb-pick'), ic: q('.chg-ic img'), name: q('.chg-name'), sub: q('.chg-sub'), blurb: q('.chg-blurb'), steps: q('.cmb-steps'), perks: q('.cmb-perks'), links: q('.chg-links'), prev: q('.chg-prev'), dt: q('.chg-dt') };
    const P = this.$.perks;
    P.addEventListener('mouseover', e => { const n = e.target.closest('.chg-pk'); if (!n || n.dataset.p === this.hover) return; this.hover = n.dataset.p; this.detail(); this.ui.sfx?.('hover'); });
    P.addEventListener('click', e => { const n = e.target.closest('.chg-pk'); if (n) this.learn(n.dataset.p, n); });
    const K = this.$.pick;
    K.addEventListener('click', e => { const b = e.target.closest('.chg-sk'); if (b) this.choose(b.dataset.k); });
    K.addEventListener('mouseover', e => { const b = e.target.closest('.chg-sk'); if (b && !Touch.fromTouch(e)) this.label(b.dataset.k); });
    K.addEventListener('mouseout', e => { if (!K.contains(e.relatedTarget)) this.label(null); });
  }
  get G() { return this.ui.G; }
  get st() { return this.G?.state || {}; }
  /** a tree's pick (its memory, else its first learned combo skill, else its first) */
  pick(tree) {
    if (this.id && SKILLS[this.id]?.tree === tree) return;
    const ids = comboSkillsOf(tree), mem = this.sel[tree];
    this.id = (ids.includes(mem) && mem) || ids.find(id => (this.st.player?.skills?.[id] || 0) > 0) || ids[0] || null; this.hover = null; this.sig = null;
  }
  /** a skill was learned / assigned / picked elsewhere: its tree remembers it */
  select(id) { if (comboable(id)) { this.sel[SKILLS[id].tree] = id; if (SKILLS[id].tree === SKILLS[this.id]?.tree && id !== this.id) { this.id = id; this.hover = null; this.sig = null; } } }
  show(id) {
    if (!comboable(id)) return;
    this.sel[SKILLS[id].tree] = id;
    if (id !== this.id) { this.id = id; this.hover = null; this.sig = null; replay(this.d.el, 'swap', 420); }
  }
  /** the strip (a click, a tap, the pad's A) */
  choose(id) {
    if (!comboable(id)) return;
    this.show(id); this.d.render();
    this.d.sp._treeSig = null; this.d.sp.render();
    this.ui.tip?.hide(); this.ui.sfx?.('tab');
  }
  cycle(dir) {
    const ids = comboSkillsOf(this.d.sp.tree); if (!ids.length) return;
    const i = ids.indexOf(this.id);
    this.choose(ids[((i < 0 ? 0 : i + dir) % ids.length + ids.length) % ids.length]);
  }
  label(id) {
    const def = id && SKILLS[id], lvl = def ? this.st.player?.skills?.[id] || 0 : 0;
    if (def) this.$.pl.textContent = `${def.name}${lvl ? '' : ' · not learned yet'}`; else this.$.pl.textContent = 'Choose a skill to chain';
    this.$.pl.parentElement.classList.toggle('named', !!def);
  }
  renderPick(tree) {
    const K = this.$.pick, ids = comboSkillsOf(tree), st = this.st, pl = st.player || {};
    const sig = `${tree}|${this.id}|${pl.skillPts}|${pl.lvl}|${ids.map(i => pl.skills?.[i] || 0).join()}|${JSON.stringify(pl.comboPerks || {})}`;
    if (sig === this._pickSig) return;
    this._pickSig = sig;
    if (K.dataset.tree !== tree) {
      K.dataset.tree = tree;
      K.innerHTML = ids.map(id => `<button class="chg-sk" data-k="${id}" aria-label="${esc(SKILLS[id].name)}"><img src="${skillIconURL(id)}" alt="" draggable="false"><b class="chg-skn" hidden></b></button>`).join('');
      this.label(null);
    }
    for (const b of K.children) {
      const id = b.dataset.k, cs = comboChipState(id, st), on = id === this.id, lvl = pl.skills?.[id] || 0;
      b.classList.toggle('sel', on); if (b.getAttribute('aria-pressed') !== String(on)) b.setAttribute('aria-pressed', String(on));
      b.classList.toggle('unl', lvl <= 0); b.classList.toggle('can', !!cs?.can);
      const n = b.lastElementChild, s = cs?.spent ? String(cs.spent) : '';
      if (n.textContent !== s) n.textContent = s;
      if (n.hidden !== !s) n.hidden = !s;
    }
  }
  draw() {
    const id = this.id, c = COMBO[id], def = SKILLS[id];
    if (!c || !def) return;
    const st = this.st, pl = st.player || {}, k = comboPerksOf(st, id), lvl = pl.skills?.[id] || 0, T = treeInfo(def.tree);
    this.renderPick(def.tree);
    const sig = `${id}|${lvl}|${pl.skillPts}|${JSON.stringify(k)}|${pl.lvl}`;
    if (sig === this.sig) return;
    this.sig = sig;
    this.el.style.setProperty('--cc', c.color);
    this.$.ic.src = skillIconURL(id);
    this.$.name.textContent = `${def.name} combo`;
    this.$.sub.textContent = lvl ? `level ${lvl} · tap, tap, finish!` : 'not learned yet';
    this.$.blurb.textContent = `Tap again within ${WINDOW}s of a swing ending to chain it. The third tap is the finisher: +${FINISH_PCT}% damage. Hold to charge one as the finisher instead.`;
    const R0 = lvl ? skillRuntime(id, st, this.G?.derived) : null, steps = comboSteps(id, k, R0);
    this.$.steps.innerHTML = steps.map(s => `<div class="chg-st on cmb-st ${s.step === STEPS ? 'fin' : ''}"><b>${STEP_GLYPH[s.step]}</b><span>${R0 ? `${s.cost} zoom` : s.name}</span>${s.speed > 1 ? `<i class="cmb-fast">×${s.speed}</i>` : ''}</div>`).join('<i class="chg-sta"></i>');
    const perks = Object.values(c.perks);
    this.$.perks.innerHTML = perks.map(p => {
      const r = k[p.id] || 0, can = canLearnComboPerk(id, p.id, st), gate = p.req[Math.min(r, p.req.length - 1)];
      const state = r >= p.ranks ? 'max' : can.ok ? 'can' : r > 0 ? 'some' : lvl >= p.req[0] ? 'open' : 'locked';
      return `<div class="chg-pk ${state} ${p.kind === 'unique' ? 'uniq' : ''}" data-p="${p.id}"><div class="chg-pi">${ICON[p.icon]()}</div>
        <div class="chg-pips">${Array.from({ length: p.ranks }, (_, i) => `<i class="${i < r ? 'on' : ''}"></i>`).join('')}</div>
        ${state === 'locked' || (state !== 'max' && lvl < gate) ? `<span class="chg-gate">Lv ${gate}</span>` : ''}<span class="chg-pn">${esc(p.name)}</span></div>`;
    }).join('');
    const n = perks.length;
    this.$.links.innerHTML = perks.map((p, i) => { const x = 300 * (i + 0.5) / n, lit = (k[p.id] || 0) > 0; return `<path class="chg-lk ${lit ? 'lit' : ''}" d="M${x} 6L${x} 64"/>`; }).join('') + `<path class="chg-lk spine" d="M${300 * 0.5 / n} 6L${300 * (n - 0.5) / n} 6"/>`;
    this.el.style.setProperty('--tc', T.color);
    this.detail();
  }
  detail() {
    const id = this.id, c = COMBO[id]; if (!c) return;
    const st = this.st, k = comboPerksOf(st, id), p = c.perks[this.hover] || null, lvl = st.player?.skills?.[id] || 0;
    const R0 = lvl ? skillRuntime(id, st, this.G?.derived) : null;
    if (!p) {
      const steps = comboSteps(id, k, R0);
      this.$.prev.innerHTML = `<img src="${skillIconURL(id)}" alt="">`;
      this.$.dt.innerHTML = `<div class="chg-dh">Tap again to chain <span>hover a perk for its numbers</span></div>${steps.map(s => `<div class="chg-dl"><b>${STEP_GLYPH[s.step]}</b> ${s.step === STEPS ? `Finisher · ${s.dmgPct != null ? `${s.dmgPct}%` : `+${FINISH_PCT}%`}` : s.step === 1 ? 'Tap' : 'Tap again'} <i>${R0 ? `${s.cost} zoom` : ''}${s.speed > 1 ? ` · ${Math.round((s.speed - 1) * 100)}% faster` : ''}</i></div>`).join('')}`;
      return;
    }
    const r = k[p.id] || 0, can = canLearnComboPerk(id, p.id, st), cost = R0?.cost;
    const cur = r > 0 ? p.info(r, cost) : null, next = r < p.ranks ? p.info(r + 1, cost) : null;
    this.$.prev.innerHTML = (PREVIEW[p.icon] || PREVIEW.quick)(treeInfo(SKILLS[id].tree).color);
    this.$.dt.innerHTML = `<div class="chg-dh">${esc(p.name)} <span>${p.kind === 'unique' ? 'Unique' : 'Common'} · ${r}/${p.ranks}</span></div>
      ${p.desc !== cur && p.desc !== next ? `<div class="chg-dd">${esc(p.desc)}</div>` : ''}
      ${cur ? `<div class="chg-dl"><b>Now</b> ${esc(cur)}</div>` : ''}
      ${next ? `<div class="chg-dl next"><b>${r ? 'Next' : 'Rank 1'}</b> ${esc(next)}</div>` : '<div class="chg-dl max">✦ Mastered ✦</div>'}
      ${next ? `<div class="chg-dr ${can.ok ? 'ok' : 'bad'}">${can.ok ? 'Click to learn (1 skill point)' : esc(can.why)}</div>` : ''}`;
  }
  learn(perkId, n) {
    const id = this.id, A = this.G?.actions;
    const can = canLearnComboPerk(id, perkId, this.st);
    if (!can.ok) { replay(n, 'deny', 420); this.ui.sfx?.('deny'); if (can.why && can.why !== 'Mastered!') this.ui.toast(can.why, { icon: 'lock', color: '#ff8fb0', duration: 2 }); return; }
    if (A?.learnComboPerk?.(id, perkId) === false) return;
    this.sig = null; this.hover = perkId; this.d.render(); this.d.sp._treeSig = null; this.d.sp.render();
    const nn = this.$.perks.querySelector(`.chg-pk[data-p="${perkId}"]`) || n, r = nn.getBoundingClientRect(), T = treeInfo(SKILLS[id].tree);
    replay(nn, 'learned-pop', 800);
    this.ui.burst(r.left + r.width / 2, r.top + r.height / 2, { n: 16, spread: 70, kind: 'star', colors: [T.color, '#fff6e8', '#ffcf4a'] });
    this.ui.ring(r.left + r.width / 2, r.top + r.height / 2, T.color);
    this.ui.sfx?.('learn');
  }
  /** the pane's layout height for the tallest combo skill of the tree (the drawer's fit: chargePanel.js tallest) */
  tallest(drawerEl) {
    const keep = { id: this.id, hover: this.hover };
    let h = 0;
    for (const id of comboSkillsOf(SKILLS[this.id]?.tree)) { this.id = id; this.hover = null; this.sig = null; this.draw(); h = Math.max(h, drawerEl.offsetHeight); }
    this.id = keep.id; this.hover = keep.hover; this.sig = null; this.draw();
    return h;
  }
}

/** the chain chip on a combo skill's node in the tree: points spent on its combo perks, glowing when one can be bought */
export function comboChipState(id, st) {
  if (!comboable(id)) return null;
  const c = COMBO[id], k = comboPerksOf(st, id);
  let spent = 0; for (const q in k) spent += k[q] || 0;
  const can = Object.keys(c.perks).some(p => canLearnComboPerk(id, p, st).ok);
  return { spent, can };
}
/** the skill tooltip's section: "Tap again to chain", with the chain at the hero's numbers */
export function comboTipHTML(id, st, d) {
  if (!comboable(id)) return '';
  const lvl = st?.player?.skills?.[id] || 0, R0 = lvl ? skillRuntime(id, st, d) : null, steps = comboSteps(id, comboPerksOf(st, id), R0);
  const fin = steps[STEPS - 1];
  return `<div class="tt-sect cmb"><div class="tt-sh">⛓ Tap again to chain · ${esc(SKILLS[id].name)}</div><div class="tt-l">Tap, tap, then a <b>finisher</b>: ${fin?.dmgPct != null ? `${fin.dmgPct}% damage` : `+${FINISH_PCT}% damage`}${R0 ? ` (${fin.cost} zoom)` : ''}</div><div class="tt-l tt-dim">Tap again within ${WINDOW}s of a swing ending. Another skill or a roll drops the chain; hold to charge the finisher.</div></div>`;
}
