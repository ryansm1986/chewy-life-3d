// The run chip (docs/ZONES.md §5.2; ROADMAP Z-E3): in a tier or Spirit run, a small pill under the minimap's column
// (the HUD's top-right stack, so it keeps inside the safe area like the rest of it) with the run's tier and an icon per
// modifier; hover (or a long press) lists the modifiers and the summed reward. It reads G.dungeon.tr (dungeon/tierRun.js).
import { el, esc } from './dom.js';
import { simpleTip } from './tooltip.js';
import { modIcon, lanternIcon } from './lanternIcons.js';
import { ZONE_MODS, rewardText } from '../rpg/zoneMods.js';
import { Events } from '../core/events.js';

export class RunChip {
  constructor(ui) {
    this.ui = ui;
    this.el = el('div', 'run-chip');
    (ui.layers.hud.querySelector('.hud-tr') || ui.layers.hud).appendChild(this.el);
    ui.tip.bind(this.el, () => this.tip());
    Events.on('mode:changed', () => setTimeout(() => this.refresh(), 0));
    this.refresh();
  }
  get tr() { const G = this.ui.G; return G?.mode === 'dungeon' ? G.dungeon?.tr || null : null; }
  refresh() {
    const tr = this.tr, E = this.el;
    if (!tr || !(tr.R.tier > 0 || tr.R.spirit > 0)) { E.classList.remove('on'); E.innerHTML = ''; this.sig = ''; return; }
    const sig = tr.label + tr.R.mods.join();
    if (sig !== this.sig) {
      this.sig = sig;
      E.classList.toggle('spirit', tr.R.spirit > 0);
      E.innerHTML = `<span class="rc-l">${lanternIcon()}</span><b>${esc(tr.label)}</b>${tr.R.mods.map(id => `<i style="--mc:${ZONE_MODS[id].color}">${modIcon(ZONE_MODS[id].icon)}</i>`).join('')}`;
    }
    E.classList.add('on');
  }
  tip() {
    const tr = this.tr; if (!tr) return '';
    const list = tr.R.mods.map(id => `<div class="rc-tm"><b>${esc(ZONE_MODS[id].name)}</b> — ${esc(ZONE_MODS[id].desc)}</div>`).join('') || '<div class="rc-tm">No modifiers</div>';
    return simpleTip(`${esc(tr.label)} <span class="jp">霊灯</span>`, `${list}<div class="rc-rw">${esc(rewardText(tr.rewards))}</div>`);
  }
}
