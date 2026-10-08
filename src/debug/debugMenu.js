// The debug menu (docs/DEBUG.md, ROADMAP R-10): lazy-loaded by ./access.js only once debug is on. A Panel in the UI's
// own list ('debug'), so the pad's focus ring and glyph hints, the phone's one-panel layout (the title bar at the
// bottom, 44 px targets, the 12 px floor) and Esc / B / ✕ all work as in every other menu. Its tabs are the section
// registry (./registry.js): the core sections (./debugActions.js) plus whatever features register (the cozy path).
// Save safety: the first time it opens on a save it offers a backup (a copy in its own slot, Restore in the Save tab),
// and every action that changes the game marks the save `state.debugUsed` (a badge in this menu only).
import { Panel } from '../ui/panel.js';
import { glyph } from '../ui/glyphs.js';
import { esc, replay } from '../ui/dom.js';
import { debugSections, registryVersion } from './registry.js';
import { registerCoreSections } from './debugActions.js';
import { installToggles, tickToggles, resetToggles } from './debugToggles.js';
import { BUG_SVG } from './access.js';
import './debug.css';

const SAVE_KEY = 'chewy3d.save', BACKUP_KEY = 'chewy3d.save.debugBackup';
const val = c => (c && typeof c === 'object' && 'value' in c ? c.value : c);
const lab = c => (c && typeof c === 'object' && 'label' in c ? c.label : String(c));
const same = (a, b) => a === b || (a && b && typeof a === 'object' && JSON.stringify(a) === JSON.stringify(b));

class DebugPanel extends Panel {
  constructor(ui, M) { super(ui, { name: 'debug', title: 'Debug', jp: 'デバッグ', side: 'center', cls: 'p-debug', icon: 'key' }); this.M = M; this.tab = null; this.forms = {}; this.armed = null; }
  init() {
    this.extra.innerHTML = '<span class="dbg-badge" title="This save has been changed with the debug tools">Debug save</span>';
    this.body.addEventListener('click', e => this.onClick(e));
  }
  sections() { return debugSections(); }
  render() {
    const secs = this.sections(); if (!secs.length) return;
    if (!secs.some(s => s.id === this.tab)) this.tab = secs[0].id;
    const S = secs.find(s => s.id === this.tab), G = this.G, st = G.state;
    this._ver = registryVersion();
    this.extra.querySelector('.dbg-badge').classList.toggle('on', !!st.debugUsed);
    const offer = !st.flags?.debugBackupAsked ? `<div class="dbg-offer"><div class="dbg-offer-t">${BUG_SVG}<span><b>Back up this save first?</b> Debug actions change your save. A backup can be restored from the Save tab.</span></div><div class="dbg-offer-b"><button class="btn sm mint" data-x="backup">${glyph('save')}Back up</button><button class="btn sm" data-x="skip">No thanks</button></div></div>` : '';
    const tabs = `<div class="tabs dbg-tabs">${secs.map(s => `<button class="tab${s.id === this.tab ? ' on' : ''}" data-tab="${esc(s.id)}">${glyph(s.icon)}<span>${esc(s.title)}</span></button>`).join('')}</div>`;
    let html = '';
    S.actions.forEach((a, i) => { html += this.row(S, a, i); });
    if (!S.actions.length && !S.note) html = '<p class="dbg-note">Nothing here yet.</p>';
    this.body.innerHTML = `${tabs}${offer}<div class="dbg-sec" data-sec="${esc(S.id)}">${S.note ? `<p class="dbg-note">${esc(S.note)}</p>` : ''}${html}</div>`;
  }
  row(S, a, i) {
    const G = this.G, k = `${S.id}:${i}`, hint = typeof a.hint === 'function' ? a.hint(G) : a.hint;
    const head = a.group ? `<div class="dbg-h">${esc(a.group)}</div>` : '';
    if (a.note && !a.label) return `${head}<p class="dbg-note">${esc(a.note)}</p>`;
    const name = `<div class="set-n dbg-n"><span>${esc(a.label)}${hint ? `<small>${esc(hint)}</small>` : ''}</span></div>`;
    if (a.toggle) return `${head}<div class="set-row dbg-row"><div class="set-n dbg-n"><span>${esc(a.label)}${hint ? `<small>${esc(hint)}</small>` : ''}</span></div><button class="tog${a.get?.(G) ? ' on' : ''}" data-k="${k}" aria-label="${esc(a.label)}"><i></i></button></div>`;
    if (a.choices) {
      const cs = typeof a.choices === 'function' ? a.choices(G) : a.choices;
      return `${head}<div class="set-row dbg-row${a.wide || cs.length > 6 ? ' wide' : ''}">${name}<div class="dbg-chips">${cs.map((c, j) => `<button class="btn sm dbg-chip" data-k="${k}" data-v="${j}">${esc(lab(c))}</button>`).join('')}</div></div>`;
    }
    if (a.fields) {
      const F = this.forms[k] ||= Object.fromEntries(a.fields.map(f => [f.key, f.multi ? [...(f.value || [])] : f.value]));
      const fields = a.fields.map(f => {
        const cs = typeof f.choices === 'function' ? f.choices(G) : f.choices;
        return `<div class="dbg-f"><span class="dbg-fl">${esc(f.label)}</span><div class="dbg-chips">${cs.map((c, j) => { const on = f.multi ? F[f.key].some(v => same(v, val(c))) : same(F[f.key], val(c)); return `<button class="btn sm dbg-chip pick${on ? ' on' : ''}" data-k="${k}" data-f="${esc(f.key)}" data-v="${j}">${esc(lab(c))}</button>`; }).join('')}</div></div>`;
      }).join('');
      return `${head}<div class="dbg-form">${name}${fields}<div class="dbg-go"><button class="btn mint" data-k="${k}" data-go="1">${glyph('play')}${esc(a.go || 'Go')}</button></div></div>`;
    }
    return `${head}<div class="set-row dbg-row">${name}<button class="btn sm${a.confirm ? ' pink' : ' sky'}" data-k="${k}">${esc(a.confirm ? a.label.split(' ')[0] : 'Go')}</button></div>`;
  }
  async onClick(e) {
    const t = e.target.closest('[data-tab], [data-x], [data-k]'); if (!t || t.disabled) return;
    const G = this.G;
    if (t.dataset.tab) { if (this.tab !== t.dataset.tab) { this.tab = t.dataset.tab; this.ui.sfx('tab'); this.render(); this.body.scrollTop = 0; } return; }
    if (t.dataset.x) { G.state.flags.debugBackupAsked = true; if (t.dataset.x === 'backup') this.M.toast(this.M.backup()); this.render(); return; }
    const [sid, i] = t.dataset.k.split(':'), S = this.sections().find(s => s.id === sid), a = S?.actions[+i]; if (!a) return;
    if (t.dataset.f) { // a form's chip: pick it (or toggle it, on a multi-pick)
      const f = a.fields.find(x => x.key === t.dataset.f), cs = typeof f.choices === 'function' ? f.choices(G) : f.choices, v = val(cs[+t.dataset.v]), F = this.forms[t.dataset.k];
      if (f.multi) { const j = F[f.key].findIndex(x => same(x, v)); if (j >= 0) F[f.key].splice(j, 1); else F[f.key].push(v); } else F[f.key] = v;
      this.ui.sfx('tick'); this.render(); return;
    }
    if (a.confirm && this.armed !== t.dataset.k) { // two taps for the drastic ones
      this.armed = t.dataset.k; clearTimeout(this._armT); this._armT = setTimeout(() => { this.armed = null; this.refresh(); }, 3000);
      t.textContent = 'Sure? Tap again'; t.classList.add('armed'); this.ui.sfx('select'); return;
    }
    this.armed = null;
    let v;
    if (a.toggle) v = !a.get?.(G);
    else if (a.choices) { const cs = typeof a.choices === 'function' ? a.choices(G) : a.choices; v = val(cs[+t.dataset.v]); }
    else if (a.fields) v = { ...this.forms[t.dataset.k] };
    replay(t, 'pressed', 300);
    await this.M.run(a, v);
  }
}

/** → the menu's handle for access.js: open / close / frame / shutdown, backup / restore */
export function installDebugMenu(G, access) {
  const ui = G.ui;
  installToggles(G);
  const M = {
    get isOpen() { return !!ui?.isOpen?.('debug'); },
    open(o) { if (!ui) return; ui._user = true; try { ui.open('debug', o); } finally { ui._user = false; } },
    close() { ui?.close?.('debug'); },
    frame(dt) { tickToggles(G, dt); const p = ui?.panels?.debug; if (p?.isOpen && p._ver !== registryVersion()) p.render(); },
    shutdown() { resetToggles(G); },
    toast(text, o = {}) { if (!text) return; const T = ui?.toasts; const opts = { icon: 'key', color: '#ffb0c8', ...o }; if (T?.show) T.show(text, opts); else ui?.toast?.(text, opts); },
    /** run one action: the toast, the save's debug mark, the menu redrawn (closed first for the ones that travel) */
    async run(a, v) {
      if (!a.noMark) G.state.debugUsed = true;
      if (a.closes) M.close();
      let r;
      try { r = await a.run(G, v); } catch (e) { console.error('[debug]', a.label, e); r = `${a.label}: it failed (${e.message})`; }
      M.toast(r === undefined ? `${a.label} ✓` : r);
      if (!a.noMark) G.save?.();
      ui?.panels?.debug?.refresh();
      return r;
    },
    backupInfo() { try { const b = JSON.parse(localStorage.getItem(BACKUP_KEY) || 'null'); return b?.save ? b : null; } catch (e) { return null; } },
    /** the save as it is now, into the backup slot */
    backup() {
      try { G.save?.(); const s = localStorage.getItem(SAVE_KEY); if (!s) return 'Nothing saved yet to back up'; localStorage.setItem(BACKUP_KEY, JSON.stringify({ at: Date.now(), save: s })); return 'Save backed up ♡'; }
      catch (e) { return `Couldn't back up: ${e.message}`; }
    },
    /** the backup back as the save, and a reload onto it (nothing saves over it on the way out) */
    restore() {
      const b = M.backupInfo(); if (!b) return 'No backup to restore';
      try { G.saveBlocked = true; localStorage.setItem(SAVE_KEY, b.save); sessionStorage.setItem('chewy3d.skipTitle', 'debug'); } catch (e) { G.saveBlocked = false; return `Couldn't restore: ${e.message}`; }
      const u = new URL(location.href); u.searchParams.delete('fresh'); // (a ?fresh page would ignore the save)
      setTimeout(() => location.replace(u.toString()), 350);
      return 'Restoring the backup…';
    },
  };
  access.backup = M.backup; access.restore = M.restore; access.backupInfo = M.backupInfo;
  registerCoreSections(G, M);
  if (ui?.panels) ui.panels.debug = new DebugPanel(ui, M);
  return M;
}
