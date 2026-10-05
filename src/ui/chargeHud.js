// Hotbar charge feedback (docs/CHARGE.md §4): the charging slot fills with a radial sweep in the skill's colour, its
// rim fills clockwise like the ring at the hero's feet, and stage pips (Ⅰ Ⅱ Ⅲ) pop above it as stages are reached
// (greyed when there isn't enough zoom). Slots whose skill has charge perks wear a small ⚡ badge.
// Reads G.skills.charge.view every frame (combat/charge.js); DOM writes happen only when something changed.
import './charge.css';
import { el, setVar, setCls, replay } from './dom.js';
import { glyph } from './glyphs.js';
import { hasPerks, chargeable } from '../rpg/charge.js';

const NUM = ['Ⅰ', 'Ⅱ', 'Ⅲ'];
const RIM = 'M30 2.5H44A13.5 13.5 0 0 1 57.5 16V44A13.5 13.5 0 0 1 44 57.5H16A13.5 13.5 0 0 1 2.5 44V16A13.5 13.5 0 0 1 16 2.5Z'; // starts at 12 o'clock, clockwise

export class ChargeHud {
  constructor(ui) {
    this.ui = ui; this.slots = null; this.badgeT = 0; this.cur = -1;
  }
  get G() { return this.ui.G; }
  attach() {
    const hs = this.ui.hud?.slots; if (!hs) return false;
    this.slots = hs.map(o => {
      const s = o.el, inn = s.querySelector('.hb-in');
      const sweep = el('div', 'hc-sweep'); inn.insertBefore(sweep, inn.firstChild); // (under the icon)
      const rim = el('div', 'hc-rim'); rim.innerHTML = `<svg viewBox="0 0 60 60"><path class="hc-r0" d="${RIM}"/><path class="hc-r1" pathLength="100" d="${RIM}"/></svg>`;
      const pips = el('div', 'hc-pips'); pips.innerHTML = NUM.map(n => `<i><b>${n}</b></i>`).join('');
      const badge = el('span', 'hb-perk'); badge.innerHTML = glyph('bolt');
      s.append(rim, pips, badge);
      return { o, s, sweep, rim, pips: [...pips.children], pipsEl: pips, badge, k: -1, lit: 0, id: undefined, perk: null };
    });
    return true;
  }
  update(dt) {
    const G = this.G; if (!G?.skills) return;
    if (!this.slots && !this.attach()) return;
    const V = G.skills.charge?.view, on = !!V?.on;
    // which slot is charging
    const cur = on ? V.slot : -1;
    if (cur !== this.cur) {
      if (this.cur >= 0) { const S = this.slots[this.cur]; setCls(S.s, 'charging', false); setCls(S.s, 'full', false); S.k = -1; S.lit = 0; }
      this.cur = cur;
      if (cur >= 0) { const S = this.slots[cur]; setCls(S.s, 'charging', true); S.s.style.setProperty('--cc', '#' + V.color.getHexString()); }
    }
    if (cur >= 0) {
      const S = this.slots[cur], k = Math.round(V.k * 100) / 100;
      if (k !== S.k) { S.k = k; setVar(S.s, '--k', k.toFixed(2)); }
      const lit = V.max + 4 * (V.lit[0] + 2 * V.lit[1] + 4 * V.lit[2]) + 32 * (V.aff[0] + 2 * V.aff[1] + 4 * V.aff[2]) + (V.full ? 256 : 0) + 512; // (a number: no string per frame)
      if (lit !== S.lit) {
        const was = S.lit;
        S.lit = lit;
        for (let i = 0; i < 3; i++) {
          const p = S.pips[i], show = i < V.max;
          p.hidden = !show; if (!show) continue;
          const isLit = V.lit[i] === 1;
          if (isLit && !p.classList.contains('lit') && was) replay(p, 'pop', 520);
          setCls(p, 'lit', isLit); setCls(p, 'nz', V.aff[i] !== 1 && !isLit);
        }
        setCls(S.s, 'full', V.full);
        if (V.full && was && !(was & 256)) replay(S.s, 'chfull', 600);
      }
    }
    // ⚡ badges (perk changes are rare: a light poll)
    this.badgeT -= dt;
    if (this.badgeT <= 0) {
      this.badgeT = 0.4;
      const st = G.state, hb = st?.player?.hotbar || [];
      for (let i = 0; i < this.slots.length; i++) {
        const S = this.slots[i], id = hb[i] || null, p = !!(id && hasPerks(st, id)), c = !!(id && chargeable(id));
        if (p !== S.perk) { S.perk = p; setCls(S.badge, 'on', p); if (p && S.id === id) replay(S.badge, 'pop', 520); }
        if (c !== S.able) { S.able = c; setCls(S.s, 'chargeable', c); }
        S.id = id;
      }
    }
  }
}
