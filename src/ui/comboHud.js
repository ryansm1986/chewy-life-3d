// Hotbar combo feedback (docs/COMBO.md §1, §4): while a chain is live, its slot shows three small pips along its foot
// (1 · 2 · ★), lit up to the step done, the next one breathing while the window runs; a finisher flashes them all and
// gives the slot a little pop in the skill's colour. Slots whose skill has combo perks wear a small chain badge beside
// Charge's ⚡. Reads G.skills.chain.view every frame (combat/combo.js); DOM writes happen only when something changed.
import './combo.css';
import { el, setCls, replay } from './dom.js';
import { CHAIN_SVG } from './comboPanel.js';
import { COMBO, hasComboPerks } from '../rpg/combo.js';

export class ComboHud {
  constructor(ui) { this.ui = ui; this.slots = null; this.badgeT = 0; this.cur = -1; this.fin = -1; }
  get G() { return this.ui.G; }
  attach() {
    const hs = this.ui.hud?.slots; if (!hs) return false;
    this.slots = hs.map(o => {
      const s = o.el, inn = s.querySelector('.hb-in');
      const pips = el('div', 'hcm-pips'); pips.innerHTML = '<i></i><i></i><i></i>';
      inn.appendChild(pips);
      const badge = el('span', 'hb-cmb'); badge.innerHTML = CHAIN_SVG;
      s.appendChild(badge);
      return { s, pips: [...pips.children], badge, sig: -1, perk: null, id: undefined };
    });
    return true;
  }
  update(dt) {
    const G = this.G; if (!G?.skills?.chain) return;
    if (!this.slots && !this.attach()) return;
    const V = G.skills.chain.view, hb = G.state?.player?.hotbar || [];
    // the chain's slot (the slot holding the chained skill)
    const cur = V.on ? hb.indexOf(V.id) : -1;
    if (cur !== this.cur) {
      if (this.cur >= 0) { const S = this.slots[this.cur]; if (S) { setCls(S.s, 'chain', false); S.sig = -1; } }
      this.cur = cur;
      if (cur >= 0) { const S = this.slots[cur]; setCls(S.s, 'chain', true); S.s.style.setProperty('--cc', COMBO[V.id]?.color || '#ffc24a'); }
    }
    if (cur >= 0) {
      const S = this.slots[cur], sig = V.step + (V.k < 1 ? 8 : 0);
      if (sig !== S.sig) { S.sig = sig; S.pips.forEach((p, i) => { setCls(p, 'lit', i < V.step); setCls(p, 'next', i === V.step && V.k < 1); }); }
    }
    // the finisher's flash
    const fin = V.flash > 0 ? hb.indexOf(V.flashId) : -1;
    if (fin !== this.fin) {
      if (this.fin >= 0 && this.slots[this.fin]) setCls(this.slots[this.fin].s, 'chfin', false);
      this.fin = fin;
      if (fin >= 0) { const S = this.slots[fin]; S.s.style.setProperty('--cc', COMBO[V.flashId]?.color || '#ffc24a'); S.pips.forEach(p => setCls(p, 'next', false)); replay(S.s, 'chfin', 450); S.sig = -1; }
    }
    // chain badges (perk changes are rare: a light poll)
    this.badgeT -= dt;
    if (this.badgeT <= 0) {
      this.badgeT = 0.4;
      const st = G.state;
      for (let i = 0; i < this.slots.length; i++) {
        const S = this.slots[i], id = hb[i] || null, p = !!(id && hasComboPerks(st, id));
        if (p !== S.perk) { S.perk = p; setCls(S.badge, 'on', p); if (p && S.id === id) replay(S.badge, 'pop', 520); }
        S.id = id;
      }
    }
  }
}
