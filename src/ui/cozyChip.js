// The crews chip (docs/COZY.md §10; ROADMAP CZ-2): in the HUD's top-right stack under the minimap (and the run chip), a
// backpack with "2 crews out · back in about 1 h", and a "!" while a report waits. Hover (or a long press) lists the
// crews; a click or a tap opens the Expedition Board's Away view (or its Reports when one waits), to look: crews are
// sent from the board itself. Hidden when nobody is out and nothing waits. Reads G.cozy (cozy/expeditionRun.js).
import './cozy.css';
import { el, esc } from './dom.js';
import { simpleTip } from './tooltip.js';
import { cozyIcon } from './cozyIcons.js';
import { backIn } from '../cozy/clock.js';
import { CLASSES } from '../rpg/classes.js';
import { Events } from '../core/events.js';

const nm = k => CLASSES[k.split(':')[1]]?.name || k.split(':')[1];

export class CozyChip {
  constructor(ui) {
    this.ui = ui; this.sig = null; this.t = 0;
    this.el = el('button', 'cz-chip');
    this.el.setAttribute('aria-label', 'Crews out');
    (ui.layers.hud.querySelector('.hud-tr') || ui.layers.hud).appendChild(this.el);
    ui.tip.bind(this.el, () => this.tip());
    this.el.addEventListener('click', e => { e.stopPropagation(); this.open(); });
    Events.on('cozy:changed', () => this.refresh());
    Events.on('mode:changed', () => setTimeout(() => this.refresh(), 0));
    setInterval(() => this.refresh(), 1000);
    this.refresh();
  }
  get C() { return this.ui.G?.cozy; }
  open() {
    const C = this.C; if (!C) return;
    this.ui.open('expeditions', { view: C.exp.unread() ? 'reports' : 'away', at: 'chip' });
  }
  refresh() {
    const C = this.C, E = this.el;
    if (!C || this.ui.mode === 'title') { E.classList.remove('on'); this.sig = ''; return; }
    const list = C.exp.list(), unread = C.exp.unread();
    if (!list.length && !unread) { E.classList.remove('on'); this.sig = ''; return; }
    const next = list.length ? Math.min(...list.map(e => (e.hold ? 0 : C.exp.left(e)))) : null;
    const words = list.length ? `${list.length} crew${list.length > 1 ? 's' : ''} out · ${list.some(e => e.hold) && next <= 0 ? 'one is camped' : backIn(next).replace(/^back in /, 'next back in ')}` : `${unread} report${unread > 1 ? 's' : ''} waiting`;
    const sig = words + '|' + unread;
    if (sig !== this.sig) {
      this.sig = sig;
      E.innerHTML = `<span class="cz-ic">${cozyIcon('pack')}</span><b>${esc(words)}</b>${unread ? '<i class="cz-bang">!</i>' : ''}`;
    }
    E.classList.toggle('news', !!unread);
    E.classList.add('on');
  }
  tip() {
    const C = this.C; if (!C) return '';
    const list = C.exp.list(), unread = C.exp.unread();
    const rows = list.map(e => `<div class="cz-tr"><b>${esc(e.crew.map(nm).join(' & '))}</b> · ${esc(e.name)}<br><span class="tt-dim">${e.hold ? 'Camped at the edge of the village' : esc(backIn(C.exp.left(e)))}</span></div>`).join('');
    return simpleTip('Crews <span class="jp">遠征</span>', `${rows || '<div class="cz-tr">No crews out.</div>'}${unread ? `<div class="cz-tr news">${unread} report${unread > 1 ? 's' : ''} waiting on the Expedition Board</div>` : ''}<div class="cz-tr tt-dim">Click to see the board's ${unread ? 'reports' : 'crews'}</div>`);
  }
}
