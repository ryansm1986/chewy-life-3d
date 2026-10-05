// Pause menu: Resume / Settings / Controls / Save / Quit. Settings fire UI.onSetting callbacks and persist.
import { el, esc, replay } from './dom.js';
import { glyph } from './glyphs.js';
import { Panel } from './panel.js';

const CONTROLS = [
  [['LMB'], 'Move / attack / talk'], [['RMB'], 'Use right-click skill'], [['1', '2', '3', '4'], 'Hotbar skills (hold to charge)'], [['Q', 'E'], 'Heart / Zoom potion'], [['G'], 'Quick meal'],
  [['F'], 'Interact'], [['X'], 'Swap weapons'], [['I'], 'Bag'], [['P'], 'Pantry'], [['C'], 'Character'], [['K'], 'Skills'], [['J'], 'Journal'],
  [['M'], 'Map'], [['Tab'], 'Switch hero'], [['B'], 'Build (village)'], [['Alt'], 'Show loot labels'], [['Esc'], 'Close / menu'],
];

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
        <div class="mn-btns">
          <button class="btn big mint" data-a="resume">${glyph('play')}Resume</button>
          <button class="btn big" data-a="settings">${glyph('gear')}Settings</button>
          <button class="btn big" data-a="controls">${glyph('question')}Controls</button>
          <button class="btn big sky" data-a="save">${glyph('save')}Save game</button>
          <button class="btn big pink" data-a="quit">${glyph('exit')}Quit to title</button>
        </div>
      </div>
      <div class="mn-v mn-settings">
        <div class="set-row"><div class="set-n">${glyph('eye')}Graphics</div><div class="seg" data-k="quality">${['Low', 'Medium', 'High'].map((n, i) => `<button data-v="${i}">${n}</button>`).join('')}<i class="seg-pill"></i></div></div>
        <div class="set-row"><div class="set-n">${glyph('music')}Music</div><div class="sld"><input type="range" min="0" max="100" data-k="music"><b></b></div></div>
        <div class="set-row"><div class="set-n">${glyph('sound')}Sound FX</div><div class="sld"><input type="range" min="0" max="100" data-k="sfx"><b></b></div></div>
        <div class="set-row"><div class="set-n">${glyph('sparkle')}UI size</div><div class="sld"><input type="range" min="80" max="125" data-k="uiScale"><b></b></div></div>
        <div class="set-row"><div class="set-n">${glyph('bolt')}Screen shake</div><button class="tog" data-k="shake"><i></i></button></div>
        <div class="set-row" title="Hold a skill's button to charge it. Toggle: press once to start charging, again to release. Off: holding repeats the skill."><div class="set-n">${glyph('zap')}Charge on hold</div><div class="seg" data-k="chargeMode">${['On', 'Off', 'Toggle'].map((n, i) => `<button data-v="${i}">${n}</button>`).join('')}<i class="seg-pill"></i></div></div>
        <div class="set-row"><div class="set-n">${glyph('star')}Show FPS</div><button class="tog" data-k="showFps"><i></i></button></div>
        <div class="set-row"><div class="set-n">${glyph('sparkle')}Disney style</div><button class="tog" data-k="disneyChewy"><i></i></button></div>
        <div class="set-row"><div class="set-n">${glyph('star')}Toybox heroes</div><button class="tog" data-k="toyChewy"><i></i></button></div>
        <div class="mn-foot"><button class="btn" data-a="back">${glyph('swap')}Back</button></div>
      </div>
      <div class="mn-v mn-controls">
        <div class="ctl-grid">${CONTROLS.map(([ks, t]) => `<div class="ctl"><span class="ctl-k">${ks.map(k => `<span class="kc">${k === 'LMB' ? glyph('mouseL') : k === 'RMB' ? glyph('mouseR') : k}</span>`).join('')}</span><span class="ctl-t">${t}</span></div>`).join('')}</div>
        <div class="mn-foot"><button class="btn" data-a="back">${glyph('swap')}Back</button></div>
      </div></div>`;
    this.body.addEventListener('click', e => {
      const b = e.target.closest('[data-a]'); if (b) { this.act(b.dataset.a); replay(b, 'pressed', 300); return; }
      const s = e.target.closest('.seg button'); if (s) { this.ui.setSetting(s.parentElement.dataset.k, +s.dataset.v); this.sync(); return; }
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
    if (a === 'resume') this.ui.close('menu');
    else if (a === 'settings' || a === 'controls') this.setView(a);
    else if (a === 'back') this.setView(this.opts.from === 'title' ? 'close' : 'main');
    else if (a === 'save') { const r = h.save?.(); if (r !== false) this.ui.toast('Game saved!', { icon: 'save', color: '#8fd0ff' }); }
    else if (a === 'quit') { this.ui.close('menu'); h.quit ? h.quit() : this.ui.setMode('title'); }
  }
  setView(v) {
    if (v === 'close') { this.ui.close('menu'); return; }
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
    for (const seg of this.body.querySelectorAll('.seg')) { // (Graphics, Charge on hold)
      const v = s[seg.dataset.k] ?? 0;
      for (const b of seg.querySelectorAll('button')) b.classList.toggle('on', +b.dataset.v === v);
      seg.style.setProperty('--sel', v);
    }
    for (const r of this.body.querySelectorAll('input[type=range]')) {
      const k = r.dataset.k, v = Math.round((s[k] ?? 1) * 100);
      if (+r.value !== v) r.value = v;
      r.style.setProperty('--p', ((v - r.min) / (r.max - r.min) * 100).toFixed(1) + '%');
      r.nextElementSibling.textContent = k === 'uiScale' ? v + '%' : v;
    }
    for (const t of this.body.querySelectorAll('.tog')) t.classList.toggle('on', !!s[t.dataset.k]);
    const h = this.ui._menuH || {};
    this.body.querySelector('[data-a="save"]').style.display = h.save ? '' : 'none';
  }
  render() { this.sync(); }
}
