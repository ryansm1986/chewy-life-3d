// Pause menu: Resume / Settings / Controls / Save / Quit. Settings fire UI.onSetting callbacks and persist.
// Controls (docs/CONTROLS.md §1): the bindings per device (Keyboard & mouse | Controller), click one to rebind it (the
// next key, mouse button or pad button; Esc / Menu cancels; a binding taken from another action swaps with it), Reset,
// and the controller's rumble, aim assist and button glyphs. While the pad plays, the main view also has a row of the
// panels (the Menu button is how the pad reaches the bag, character, skills, journal and map) and Home.
import { el, esc, replay } from './dom.js';
import { glyph } from './glyphs.js';
import { cozyIcon } from './cozyIcons.js';
import { Panel } from './panel.js';
import { Actions, ACTIONS, ACTION_GROUPS, PAD_BINDABLE } from '../core/actions.js';
import { normKey } from '../core/input.js';
import { padGlyph } from './padGlyphs.js';
import { PRESET_NAMES } from '../core/deck.js';
import { DESKTOP, quitGame } from './desktop.js';
import { AUTOSAVE_LABELS } from '../core/autosave.js';
import { LEAD_LABELS } from './leadUI.js'; // (Settings › Shadow leads the way: ROADMAP R-17)
import { TARGET_KEYS, TARGET_LABELS, TARGETING, targetingOf, targetingHint } from '../combat/autoTarget.js';
import { version as VERSION } from '../../package.json'; // (Settings › About; seven taps on it ask for the debug password: src/debug/access.js)

const MOUSE_CAP = { mouse0: () => glyph('mouseL'), mouse2: () => glyph('mouseR') };
// Settings › Controls › Touch: what each on-screen control does (ui/touch.js, docs/CONTROLS.md §12)
const TOUCH_HELP = [['Move', 'The stick: put a thumb down on the left (the right, left-handed)'], ['Sprint', 'Push the stick out to its glowing ring'], ['Attack · talk · use', 'The big button (it shows a paw when it will talk or use)'], ['Skills', 'The buttons round it: tap to cast, hold to charge'], ['Aim', 'Auto: the nearest foe, else where you face. Drag: drag off a skill, back onto it to cancel'], ['Target', 'Tap a monster'], ['Walk · talk · open', 'Tap the ground, a friend or a door'], ['Roll', 'The mint button'], ['Potions · meal', 'The belt between the orbs'], ['Swap weapons', 'The small badge by the big button'], ['Hero', 'Tap the portrait: the next hero. Hold it: the hero wheel'], ['Zoom', 'Pinch with two fingers'], ['Map · bag · menu', 'Tap the minimap; the buttons beside it']];
// Settings › Controls › Targeting (CT-8, docs/CONTROLS.md §13): one row per device tab, its own key, and a line under it
const TGT_ROW = dev => `<div class="set-row ctl-tgt" title="Off: you aim. Assist: a light snap onto foes near your aim. Auto: skills pick the best foe or group all round you."><div class="set-n">${glyph('pin')}Targeting</div><div class="seg" data-k="${TARGET_KEYS[dev]}" style="--w:78px">${TARGET_LABELS.map((n, i) => `<button data-v="${i}">${n}</button>`).join('')}<i class="seg-pill"></i></div></div><div class="ctl-tgt-h" data-tgt="${dev}" style="margin:-2px 6px 6px;font:500 12.5px var(--font);opacity:.72"></div>`;
const QUICK = [['inventory', 'bag', 'Bag'], ['character', 'star', 'Character'], ['skills', 'sparkle', 'Skills'], ['quests', 'book', 'Journal'], ['map', 'map', 'Map']];

export class MenuPanel extends Panel {
  constructor(ui) { super(ui, { name: 'menu', title: 'Paused', jp: '一時停止', side: 'center', cls: 'p-menu', icon: 'gear' }); this.view = 'main'; }
  build() {
    super.build();
    this.back = el('div', 'modal-bg');
    this.wrap.prepend(this.back);
    this.back.addEventListener('click', () => this.ui.close('menu'));
  }
  init() {
    this.body.innerHTML = `<div class="mn-views">
      <div class="mn-v mn-main">
        <div class="mn-hero"><div class="mn-paws">${glyph('paw')}${glyph('paw')}${glyph('paw')}</div><div class="mn-zz"><b class="mn-who">Chewy</b> is taking a little break<span>z</span><span>z</span><span>z</span></div></div>
        <div class="mn-quick">${QUICK.map(([n, g, l]) => `<button class="btn" data-a="open:${n}">${glyph(g)}${l}</button>`).join('')}<button class="btn" data-a="build">${glyph('hammer')}Build</button><button class="btn" data-a="decorate">${glyph('home')}Decorate</button><button class="btn" data-a="home">${glyph('home')}Home</button><button class="btn mn-crews" data-a="crews">${cozyIcon('pack')}Crews<i class="mn-crews-n"></i></button></div>
        <div class="mn-btns">
          <button class="btn big mint" data-a="resume">${glyph('play')}Resume</button>
          <button class="btn big" data-a="settings">${glyph('gear')}Settings</button>
          <button class="btn big" data-a="controls">${glyph('question')}Controls</button>
          <button class="btn big sky" data-a="save">${glyph('save')}Save game</button>
          <button class="btn big pink" data-a="quit">${glyph('exit')}Quit to title</button>${DESKTOP ? `
          <button class="btn big" data-a="exitGame">${glyph('door')}Quit game</button>` : ''}
        </div>
      </div>
      <div class="mn-v mn-settings">
        <div class="set-row" title="Deck: tuned for the Steam Deck. Mobile: for phones and tablets (a lighter picture, smaller shadows, fewer particles). Grass and scenery detail change at the next start."><div class="set-n">${glyph('eye')}Graphics</div><div class="seg" data-k="quality">${PRESET_NAMES.map((n, i) => `<button data-v="${i}">${n}</button>`).join('')}<i class="seg-pill"></i></div></div>
        <div class="set-row" title="Caps the frame rate: 40 is a steady fallback on the Steam Deck, 30 saves a phone's battery"><div class="set-n">${glyph('play')}Frame cap</div><div class="seg" data-k="fpsCap">${['Off', '60', '40', '30'].map((n, i) => `<button data-v="${i}">${n}</button>`).join('')}<i class="seg-pill"></i></div></div>
        <div class="set-row"><div class="set-n">${glyph('music')}Music</div><div class="sld"><input type="range" min="0" max="100" data-k="music"><b></b></div></div>
        <div class="set-row"><div class="set-n">${glyph('sound')}Sound FX</div><div class="sld"><input type="range" min="0" max="100" data-k="sfx"><b></b></div></div>
        <div class="set-row"><div class="set-n">${glyph('sparkle')}UI size</div><div class="sld"><input type="range" min="80" max="125" data-k="uiScale"><b></b></div></div>
        <div class="set-row"><div class="set-n">${glyph('bolt')}Screen shake</div><button class="tog" data-k="shake"><i></i></button></div>
        <div class="set-row" title="Hold a skill's button to charge it. Toggle: press once to start charging, again to release. Off: holding repeats the skill."><div class="set-n">${glyph('zap')}Charge on hold</div><div class="seg" data-k="chargeMode">${['On', 'Off', 'Toggle'].map((n, i) => `<button data-v="${i}">${n}</button>`).join('')}<i class="seg-pill"></i></div></div>
        <div class="set-row" title="Hold Shift while moving to sprint (+40% speed). Toggle: tap Shift to start sprinting; tap it again, or stop, to walk."><div class="set-n">${glyph('boots')}Sprint (Shift)</div><div class="seg" data-k="sprintMode">${['Hold', 'Toggle'].map((n, i) => `<button data-v="${i}">${n}</button>`).join('')}<i class="seg-pill"></i></div></div>
        <div class="set-row" title="Digging with Shadow. Hold: hold the button and let go in the golden band for a Perfect dig. Tap: one press digs by itself (a normal find)."><div class="set-n">${glyph('paw')}Dig with Shadow</div><div class="seg" data-k="digMode">${['Hold', 'Tap'].map((n, i) => `<button data-v="${i}">${n}</button>`).join('')}<i class="seg-pill"></i></div></div>
        <div class="set-row" title="Shadow walks ahead to the objective on a real path, waits for you, and stops short of yokai (a fight always comes first). Quests: on the steps that say he leads the way. Always: to the active objective. Off: only when you ask him (L, R3 out of a fight, a tap on the quest tracker, or the Journal's Follow Shadow)."><div class="set-n">${glyph('paw')}Shadow leads the way</div><div class="seg" data-k="shadowLead" style="--w:78px">${LEAD_LABELS.map((n, i) => `<button data-v="${i}">${n}</button>`).join('')}<i class="seg-pill"></i></div></div>
        <div class="set-row" title="The reel. Relaxed: a wider catch zone, half the drain, a longer bite and early presses forgiven. Auto: Relaxed on a touch screen, Normal with keys or a controller."><div class="set-n">${glyph('wave')}Fishing</div><div class="seg" data-k="fishMode" style="--w:78px">${['Auto', 'Normal', 'Relaxed'].map((n, i) => `<button data-v="${i}">${n}</button>`).join('')}<i class="seg-pill"></i></div></div>
        <div class="set-row" title="Saves on its own every few minutes of play, and after quests, level ups, building and big finds. Off: only those milestones, and when you leave."><div class="set-n">${glyph('save')}Autosave</div><div class="seg" data-k="autosave">${AUTOSAVE_LABELS.map((n, i) => `<button data-v="${i}">${n}</button>`).join('')}<i class="seg-pill"></i></div></div>
        <div class="set-row"><div class="set-n">${glyph('star')}Show FPS</div><button class="tog" data-k="showFps"><i></i></button></div>${DESKTOP ? `
        <div class="set-row" title="Off: a window (F11 or Alt+Enter switch too)"><div class="set-n">${glyph('eye')}Full screen</div><button class="tog" data-k="fullscreen"><i></i></button></div>` : ''}
        <div class="set-row" title="Keys and controller buttons, rumble, aim assist"><div class="set-n">${glyph('question')}Controls</div><button class="btn sm" data-a="controls">Change…</button></div>
        <div class="set-row mn-about" title="Pawhaven, a cozy adventure with Chewy and friends"><div class="set-n">${glyph('sakura')}About</div><button class="btn sm mn-ver" data-a="version">Pawhaven v${VERSION}</button></div>
        <div class="set-row mn-debug" title="Testing tools: F10 or \` , the bug button, Select + Start on a pad"><div class="set-n">${glyph('key')}Debug tools: on</div><div class="mn-dbg-b"><button class="btn sm" data-a="debugOpen">Open</button><button class="btn sm pink" data-a="debugOff">Turn off</button></div></div>
        <div class="mn-foot"><button class="btn" data-a="back">${glyph('swap')}Back</button></div>
      </div>
      <div class="mn-v mn-controls">
        <div class="ctl-tabs"><button data-dev="kbm">Keyboard &amp; mouse</button><button data-dev="pad">Controller</button><button data-dev="touch">Touch</button></div>
        <div class="ctl-kbm">
          ${TGT_ROW('kbm')}
        </div>
        <div class="ctl-opts">
          ${TGT_ROW('pad')}
          <div class="set-row" title="Light pulses on hits and charged releases"><div class="set-n">${glyph('bolt')}Rumble</div><button class="tog" data-k="rumble"><i></i></button></div>
          <div class="set-row" title="Assist's soft lock on the foe nearest your aim: how wide its cone is. In Auto: how much the right stick snaps to a foe while it aims (0: not at all)"><div class="set-n">${glyph('eye')}Aim assist</div><div class="sld"><input type="range" min="0" max="100" data-k="aimAssist"><b></b></div></div>
          <div class="set-row" title="Auto follows the controller (the Steam Deck shows Xbox letters)"><div class="set-n">${glyph('star')}Button glyphs</div><div class="seg" data-k="padGlyphs" style="--w:96px">${['Auto', 'Xbox', 'PlayStation'].map((n, i) => `<button data-v="${i}">${n}</button>`).join('')}<i class="seg-pill"></i></div></div>
        </div>
        <div class="ctl-touch">
          <div class="set-row" title="How big the on-screen buttons and the stick are"><div class="set-n">${glyph('sparkle')}Button size</div><div class="sld"><input type="range" min="75" max="135" data-k="touchSize"><b></b></div></div>
          <div class="set-row" title="How see-through the buttons are while you aren't pressing them"><div class="set-n">${glyph('eye')}Opacity</div><div class="sld"><input type="range" min="30" max="100" data-k="touchOpacity"><b></b></div></div>
          <div class="set-row" title="The buttons on the left, the stick on the right"><div class="set-n">${glyph('paw')}Left-handed</div><button class="tog" data-k="touchLeft"><i></i></button></div>
          ${TGT_ROW('touch')}
          <div class="set-row" title="A little buzz on presses, charges and hits (phones that can)"><div class="set-n">${glyph('bolt')}Haptics</div><button class="tog" data-k="haptics"><i></i></button></div>
          <div class="set-row" title="Ask: when full screen closes during play, the game pauses and one tap goes back. Off: stay in the window (no full screen on the first tap either)."><div class="set-n">${glyph('eye')}Full screen</div><div class="seg" data-k="touchFs" style="--w:96px">${['Ask', 'Off'].map((n, i) => `<button data-v="${i}">${n}</button>`).join('')}<i class="seg-pill"></i></div></div>
          <div class="set-row" title="Room kept clear of itch.io's own buttons over the game. Auto: on itch, when the game is in the page. Top or Side if they ever cover something; Off for none."><div class="set-n">${glyph('star')}itch.io buttons</div><div class="seg" data-k="itchInset" style="--w:78px">${['Auto', 'Top', 'Side', 'Off'].map((n, i) => `<button data-v="${i}">${n}</button>`).join('')}<i class="seg-pill"></i></div></div>
        </div>
        <div class="ctl-list"></div>
        <div class="ctl-note"></div>
        <div class="mn-foot"><button class="btn" data-a="resetBinds">${glyph('sort')}Reset</button><button class="btn" data-a="back">${glyph('swap')}Back</button></div>
      </div></div>`;
    this.dev = 'kbm';
    this.body.addEventListener('click', e => {
      const tab = e.target.closest('.ctl-tabs button'); if (tab) { this.cancelWait(); this.dev = tab.dataset.dev; this.ui.sfx('tab'); this.renderControls(); return; }
      const bb = e.target.closest('.ctl-b'); if (bb) { this.startWait(bb.dataset.bind); return; }
      const b = e.target.closest('[data-a]'); if (b) { this.act(b.dataset.a); replay(b, 'pressed', 300); return; }
      const s = e.target.closest('.seg button'); if (s) { const k = s.parentElement.dataset.k; this.ui.setSetting(k, +s.dataset.v); if (/^target/.test(k) && this.view === 'controls') this.renderControls(); else this.sync(); return; } // (Targeting: the touch help follows it)
      const t = e.target.closest('.tog'); if (t) { this.ui.setSetting(t.dataset.k, !this.ui.settings[t.dataset.k]); this.sync(); }
    });
    this.body.addEventListener('input', e => {
      const r = e.target.closest('input[type=range]'); if (!r) return;
      const k = r.dataset.k, v = +r.value;
      this.ui.setSetting(k, k === 'uiScale' ? v / 100 : v / 100);
      this.sync();
    });
  }
  act(a) {
    const h = this.ui._menuH || {};
    if (a.startsWith('open:')) { this.ui.close('menu'); this.ui._user = true; try { this.ui.open(a.slice(5), a === 'open:inventory' ? { view: 'bag' } : undefined); } finally { this.ui._user = false; } return; } // (the pad's way to the panels)
    if (a === 'crews') { this.ui.close('menu'); const C = this.ui.G?.cozy; this.ui.open('expeditions', { view: C?.exp.unread() ? 'reports' : C?.exp.list().length ? 'away' : 'reports', at: 'menu' }); return; } // (the crews' status: the board's Away and Reports, to read: docs/COZY.md §10)
    if (a === 'home') { this.ui.close('menu'); if (this.ui.G?.mode === 'dungeon') this.ui.G.returnToVillage?.(); return; }
    if (a === 'build') { this.ui.close('menu'); const B = this.ui.G?.build; if (B && !B.active && this.ui.G.mode === 'village') B.enter(); return; } // (the pad's way into build mode)
    if (a === 'decorate') { this.ui.close('menu'); const D = this.ui.G?.housing?.decor; if (D && !D.active && this.ui.G.mode === 'interior') D.enter(); return; }
    if (a === 'version') { this.ui.G?.debug?.versionTap(); return; } // (seven taps: the debug password prompt)
    if (a === 'debugOpen') { this.ui.G?.debug?.open(); return; }
    if (a === 'debugOff') { this.ui.G?.debug?.disable(); this.sync(); return; }
    if (a === 'resetBinds') { this.cancelWait(); Actions.resetBindings(this.dev); this.ui.saveBinds(); this.note(this.dev === 'pad' ? 'Controller buttons reset.' : 'Keys reset.'); this.renderControls(); return; }
    if (a === 'resume') this.ui.close('menu');
    else if (a === 'settings' || a === 'controls') this.setView(a);
    else if (a === 'back') this.setView(this.view === 'controls' && this._backTo === 'settings' ? 'settings' : this.opts.from === 'title' ? 'close' : 'main');
    else if (a === 'save') { const r = h.save?.(); if (r !== false) this.ui.toast('Game saved!', { icon: 'save', color: '#8fd0ff' }); }
    else if (a === 'quit') { this.ui.close('menu'); h.quit ? h.quit() : this.ui.setMode('title'); }
    else if (a === 'exitGame') quitGame(this.ui); // (the desktop app: save, then close: ui/desktop.js)
  }
  setView(v) {
    if (v === 'close') { this.ui.close('menu'); return; }
    if (v === 'controls' && this.view !== 'controls') { this._backTo = this.view; this.dev = Actions.device; this.renderControls(); }
    if (v !== 'controls') this.cancelWait();
    this.view = v;
    this.panel.dataset.view = v;
    this.setTitle(v === 'settings' ? 'Settings' : v === 'controls' ? 'Controls' : 'Paused', v === 'settings' ? '設定' : v === 'controls' ? '操作' : '一時停止');
    const vv = this.body.querySelector('.mn-' + v);
    if (vv) replay(vv, 'enter', 500);
    this.sync();
  }
  onOpen() {
    const who = this.panel.querySelector('.mn-who'); if (who) who.textContent = this.ui.G?.state?.player?.name || 'Chewy'; // whoever is being played
    this.setView(this.opts.view || 'main'); this.panel.classList.toggle('from-title', this.opts.from === 'title'); }
  sync() {
    const s = this.ui.settings;
    for (const seg of this.body.querySelectorAll('.seg')) { // (Graphics, Charge on hold, ...)
      const v = s[seg.dataset.k] ?? 0;
      for (const b of seg.querySelectorAll('button')) b.classList.toggle('on', +b.dataset.v === v);
      seg.style.setProperty('--sel', v);
    }
    for (const r of this.body.querySelectorAll('input[type=range]')) {
      const k = r.dataset.k, v = Math.round((s[k] ?? 1) * 100);
      if (+r.value !== v) r.value = v;
      r.style.setProperty('--p', ((v - r.min) / (r.max - r.min) * 100).toFixed(1) + '%');
      r.nextElementSibling.textContent = k === 'uiScale' || k === 'aimAssist' || k === 'touchSize' || k === 'touchOpacity' ? v + '%' : v;
    }
    for (const t of this.body.querySelectorAll('.tog')) t.classList.toggle('on', k0(s, t.dataset.k));
    for (const h of this.body.querySelectorAll('.ctl-tgt-h')) h.textContent = targetingHint(h.dataset.tgt, targetingOf(s, h.dataset.tgt)); // (CT-8)
    const h = this.ui._menuH || {};
    this.body.querySelector('[data-a="save"]').style.display = h.save ? '' : 'none';
    const mode = this.ui.G?.mode, show = (a, on) => { const b = this.body.querySelector(`[data-a="${a}"]`); if (b) b.style.display = on ? '' : 'none'; };
    const dbg = this.body.querySelector('.mn-debug'); if (dbg) dbg.style.display = this.ui.G?.debug?.on ? '' : 'none'; // (Settings › About: debug tools on this device)
    const CZ = this.ui.G?.cozy, nOut = CZ?.exp.list().length || 0, nUn = CZ?.exp.unread() || 0; show('crews', !!CZ && (nOut + (CZ.exp.reports().length || 0)) > 0); // (once a crew has been sent: their status, read-only)
    const cn = this.body.querySelector('.mn-crews-n'); if (cn) { cn.textContent = nUn ? '!' : nOut ? String(nOut) : ''; cn.classList.toggle('news', !!nUn); cn.style.display = nUn || nOut ? '' : 'none'; }
    show('home', mode === 'dungeon'); show('build', mode === 'village' && !this.ui.G?.build?.active); show('decorate', mode === 'interior' && !!this.ui.G?.housing?.canDecorate?.());
  }
  render() { this.sync(); if (this.view === 'controls') this.renderControls(); }
  onClose() { this.cancelWait(); }

  // ---------------------------------------------------------------- Controls: bindings per device, rebinding
  /** a binding's caps: keycaps / mouse glyphs, or pad glyphs */
  caps(id, dev) {
    const ts = Actions.binds(id, dev);
    if (!ts.length) return '<span class="none">—</span>';
    if (dev === 'pad') return ts.map(t => `<span class="kc pad">${padGlyph(t)}</span>`).join('');
    if (id === 'camTurn') return '<span class="kc">Q</span><span class="kc">E</span>';
    return ts.map(t => t.includes('+') ? t.split('+').map(k => `<span class="kc">${Actions.tokenName(k, 'kbm')}</span>`).join('') : `<span class="kc">${MOUSE_CAP[t]?.() || Actions.tokenName(t, 'kbm')}</span>`).join('');
  }
  renderControls() {
    if (!this.panel) return;
    const dev = this.dev || 'kbm', list = this.body.querySelector('.ctl-list'); if (!list) return;
    this.panel.dataset.dev = dev;
    for (const b of this.body.querySelectorAll('.ctl-tabs button')) b.classList.toggle('on', b.dataset.dev === dev);
    const kb = this.body.querySelector('.ctl-kbm'); if (kb) kb.hidden = dev !== 'kbm'; // (the keyboard tab's Targeting row)
    let html = '';
    if (dev === 'touch') { // (touch has no bindings: what each control does, ui/touch.js; the aim rows follow Targeting, CT-8)
      const tm = targetingOf(this.ui.settings, 'touch'), help = TOUCH_HELP.map(([t, d]) => [t, t === 'Aim' ? (tm === TARGETING.AUTO ? 'Auto: skills pick the best foe or group all round you' : tm === TARGETING.ASSIST ? 'Assist: the foe in front of you, else where you face' : 'Off: drag off a skill to aim it, back onto it to cancel') : t === 'Target' && tm === TARGETING.AUTO ? 'Tap a monster, or flick the stick toward one' : d]);
      list.innerHTML = help.map(([t, d]) => `<div class="ctl-row"><span class="ctl-t">${esc(t)}</span><span class="ctl-h">${esc(d)}</span></div>`).join(''); this.sync(); return;
    }
    for (const [g, title] of ACTION_GROUPS) {
      const rows = Object.entries(ACTIONS).filter(([id, A]) => A.group === g && (Actions.binds(id, dev).length || Actions.rebindable(id, dev)));
      if (!rows.length) continue;
      html += `<div class="ctl-g">${esc(title)}</div>` + rows.map(([id, A]) => {
        const lock = !Actions.rebindable(id, dev), wait = this.wait?.id === id && this.wait.dev === dev;
        const label = dev === 'kbm' && A.kbmLabel ? A.kbmLabel : A.label;
        return `<div class="ctl-row" data-row="${id}"><span class="ctl-t">${esc(label)}</span><button class="ctl-b${lock ? ' locked' : ''}${wait ? ' wait' : ''}" data-bind="${id}"${lock ? ' disabled' : ''} title="${lock ? 'Fixed' : 'Click to change'}">${wait ? (dev === 'pad' ? 'Press a button…' : 'Press a key…') : this.caps(id, dev)}</button></div>`;
      }).join('');
    }
    list.innerHTML = html;
    this.sync();
  }
  note(t) { const n = this.body.querySelector('.ctl-note'); if (n) n.textContent = t || ''; }
  startWait(id) {
    const dev = this.dev || 'kbm'; if (!Actions.rebindable(id, dev)) return;
    this.cancelWait();
    this.wait = { id, dev, t: performance.now() };
    this.note(dev === 'pad' ? 'Press a button on the controller (Menu cancels).' : 'Press a key, or the middle or a side mouse button (Esc cancels).');
    this.ui.sfx('select');
    if (dev === 'kbm') {
      this._kd = e => { e.preventDefault(); e.stopPropagation(); const k = normKey(e); if (k === 'escape') this.cancelWait(true); else this.finishWait(k); };
      this._md = e => { if (performance.now() - this.wait.t < 120) return; if (e.button === 0 || e.button === 2) { if (!e.target.closest?.('.ctl-b')) this.cancelWait(true); return; } e.preventDefault(); e.stopPropagation(); this.finishWait('mouse' + e.button); };
      addEventListener('keydown', this._kd, true); addEventListener('mousedown', this._md, true);
    }
    this.renderControls();
  }
  /** per frame from UI.padInput while a pad rebind waits: the first pad button pressed (Menu cancels) → true (handled) */
  padCapture() {
    const w = this.wait; if (!w) return false;
    if (w.dev !== 'pad') return false;
    const t = [...Actions.pPressed].find(x => PAD_BINDABLE.includes(x) || x === 'L3+R3');
    for (const x of [...Actions.pPressed]) Actions.padConsume(x);
    if (!t) return true;
    if (t === 'Menu') this.cancelWait(true); else this.finishWait(t);
    return true;
  }
  finishWait(token) {
    const w = this.wait; if (!w) return;
    const r = Actions.rebind(w.id, w.dev, token);
    this.cancelWait();
    if (r?.blocked) { this.note(`${Actions.tokenName(token, w.dev)} is fixed for ${ACTIONS[r.blocked].label}.`); this.ui.sfx('deny'); this.renderControls(); return; }
    this.ui.saveBinds();
    this.note(r?.swapped ? `${ACTIONS[w.id].label} → ${Actions.tokenName(token, w.dev)} (swapped with ${ACTIONS[r.swapped].label})` : `${ACTIONS[w.id].label} → ${Actions.tokenName(token, w.dev)}`);
    this.ui.sfx('assign');
    this.renderControls();
    const row = this.body.querySelector(`[data-row="${w.id}"]`); if (row) replay(row, 'flash', 700);
  }
  cancelWait(say) {
    if (this._kd) { removeEventListener('keydown', this._kd, true); removeEventListener('mousedown', this._md, true); this._kd = this._md = null; }
    const was = this.wait; this.wait = null;
    if (was && say) { this.note('Unchanged.'); this.renderControls(); }
  }
}
// a toggle's setting (rumble defaults on: undefined counts as on)
const k0 = (s, k) => (k === 'rumble' ? s[k] !== false : !!s[k]);
