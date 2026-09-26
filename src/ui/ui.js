// Chewy Life UI — HTML/CSS overlay above the canvas. See docs/ARCHITECTURE.md (UI section) for the contract.
import './style.css';
import './hud.css';
import './panels.css';
import './fx.css';
import { Events as CoreEvents } from '../core/events.js';
import { el, clamp, isTyping, esc, rarityColor } from './dom.js';
import { glyph } from './glyphs.js';
import { Tooltip } from './tooltip.js';
import { Hud } from './hud.js';
import { Floats, Toasts, Banners, LootLabels, Iris, burst, flyToBag } from './fx.js';
import { ItemDrag, InventoryPanel, StashPanel } from './inventory.js';
import { CharacterPanel } from './character.js';
import { SkillsPanel } from './skills.js';
import { Dialogue } from './dialogue.js';
import { BuildPanel } from './build.js';
import { ShopPanel } from './shop.js';
import { MapPanel, QuestPanel, normQuest } from './map.js';
import { MenuPanel } from './menu.js';
import { Title } from './title.js';
import { itemName, itemIconURL, skillIconURL } from './rpg.js';
import { Vector3 } from 'three';

const SETTINGS_KEY = 'chewy3d.settings';
const DEFAULT_SETTINGS = { quality: 2, music: 0.7, sfx: 0.8, uiScale: 1, shake: true, showFps: false };
const NON_BLOCKING = new Set(['build']); // panels that don't pause gameplay input
// UI sound names → src/audio sfx ids (learn / equip / level-up / toast sounds are already bound to game events by the audio module)
const SFX_MAP = { open: 'ui_open', close: 'ui_close', tab: 'ui_tab', deny: 'ui_error', coin: 'ui_coin', buy: 'ui_buy', hover: 'ui_hover',
  select: 'ui_click', assign: 'ui_click', stat: 'ui_click', pick: 'ui_click', drop: 'ui_click', sort: 'ui_click', tick: 'ui_click', bag: 'ui_click', click: 'ui_click' };

export const UI = {
  G: null, mode: 'title', scale: 1, ready: false,
  layers: {}, panels: {}, seen: new Set(), settings: { ...DEFAULT_SETTINGS },
  _settingFns: [], _titleH: {}, _menuH: {}, _buildProvider: null, _questProvider: null, _order: [], _fire() {},

  // ------------------------------------------------------------------ init
  init(G) {
    if (this.ready) { this.G = G; return this; }
    this.G = G;
    try { Object.assign(this.settings, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')); } catch (e) { /* private mode */ }
    if (G?.engine?.quality != null && localStorage.getItem(SETTINGS_KEY) == null) this.settings.quality = G.engine.quality;
    let root = document.getElementById('ui');
    if (!root) { root = el('div'); root.id = 'ui'; document.body.appendChild(root); }
    this.root = root;
    root.innerHTML = '';
    root.classList.add('ui-root');
    const L = n => { const d = el('div', 'layer l-' + n); root.appendChild(d); return d; };
    this.layers = { world: L('world'), hud: L('hud'), panels: L('panels'), dlg: L('dlg'), msg: L('msg'), title: L('title'), fx: L('fx'), over: L('over'), iris: L('iris') };
    this.tip = new Tooltip(this.layers.over);
    this.hud = new Hud(this, this.layers.hud);
    this.floats = new Floats(this.layers.world);
    this.labels = new LootLabels(this.layers.world);
    this.toasts = new Toasts(this.layers.msg);
    this.banners = new Banners(this.layers.msg, this.layers.fx);
    this.iris = new Iris(this.layers.iris);
    this.drag = new ItemDrag(this);
    this.dlg = new Dialogue(this);
    this.titleScreen = new Title(this);
    this.panels = {
      inventory: new InventoryPanel(this), stash: new StashPanel(this), character: new CharacterPanel(this), skills: new SkillsPanel(this),
      quests: new QuestPanel(this), map: new MapPanel(this), shop: new ShopPanel(this), build: new BuildPanel(this), menu: new MenuPanel(this),
    };
    this.skills = this.panels.skills;
    // popover + skill drag ghost
    this.pop = el('div', 'pop-wrap'); this.pop.innerHTML = '<div class="pop"></div>'; this.layers.over.appendChild(this.pop);
    this.skGhost = el('div', 'cursor-item skill'); this.skGhost.innerHTML = '<div class="ci-in"><img alt=""></div>'; this.layers.over.appendChild(this.skGhost);
    this.fpsEl = el('div', 'fps'); this.layers.over.appendChild(this.fpsEl);
    this._fpsAcc = 0; this._fpsN = 0;
    this.applyScale();
    addEventListener('resize', () => this.applyScale());
    addEventListener('keydown', e => this.onKey(e));
    addEventListener('keyup', e => { if (e.key === 'Alt') { this.labels.setVisible(false); e.preventDefault(); } });
    addEventListener('blur', () => this.labels.setVisible(false));
    // LMB/RMB press flashes on the world canvas
    addEventListener('mousedown', e => {
      if (e.target?.id !== 'game' || this.mode === 'title' || this.anyModal()) return;
      if (e.button === 0) this.hud.flashSlot(0); else if (e.button === 2) this.hud.flashSlot(1);
    }, true);
    if (this._mmPending) this.hud.mm.provider = this._mmPending;
    if (this._lootCb) this.labels.onClick(this._lootCb);
    if (this._skillProv) this.hud.cd.provider = this._skillProv;
    root.addEventListener('mouseover', e => { const t = e.target.closest?.('button, .slot, .node, .card, .hb, .belt, .sh-item, .q-item, .ll'); if (t && t !== this._hovEl) { this._hovEl = t; this.sfx('hover'); } });
    this.bindEvents();
    this.applySettings(true);
    this.setMode(G?.mode && G.mode !== 'title' ? G.mode : this.mode);
    this.ready = true;
    return this;
  },

  get events() { return this.G?.events || CoreEvents; },

  bindEvents() {
    const E = this.events;
    const on = (n, f) => E.on(n, f);
    on('inv:changed', () => this.refreshItems());
    on('equip:changed', () => this.refreshItems());
    on('stats:changed', () => this.refreshItems());
    on('coins:changed', () => { this.panels.shop.refresh(); this.panels.inventory.refresh(); this.panels.build.refresh(); });
    on('materials:changed', () => this.panels.build.refresh());
    on('skill:learned', () => this.panels.skills.refresh());
    on('player:levelup', p => this.levelUp(p?.lvl ?? this.G?.state?.player?.lvl));
    on('item:pickup', p => { const it = p?.item || p; if (!it || it.kind === 'material' || it.kind === 'potion') return; requestAnimationFrame(() => this.pickup(it, p?.pos || p?.worldPos, true)); });
    on('quest:update', () => { this.hud.cache.qAcc = 0; this.panels.quests.refresh(); });
    on('toast', p => (typeof p === 'string' ? this.toast(p) : p?.text && this.toast(p.text, p)));
    on('mode:changed', p => this.setMode(p?.mode || p));
    on('village:changed', () => this.panels.build.refresh());
    on('potions:changed', () => this.panels.shop.refresh());
    on('hotbar:changed', () => this.panels.skills.refresh());
    on('boss:dead', () => this.setBoss(null));
  },

  // ------------------------------------------------------------------ frame
  update(dt = 1 / 60) {
    if (!this.ready) return;
    const cam = this.G?.engine?.camera;
    this.floats.update(dt, cam, this.scale);
    this.labels.update(dt, cam, this.scale);
    if (this.mode !== 'title') this.hud.update(dt);
    this.panels.map.update?.(dt);
    if (this.settings.showFps) {
      this._fpsAcc += dt; this._fpsN++;
      if (this._fpsAcc > 0.5) { this.fpsEl.textContent = `${Math.round(this._fpsN / this._fpsAcc)} fps`; this._fpsAcc = 0; this._fpsN = 0; }
    }
  },

  // ------------------------------------------------------------------ modes
  setMode(mode) {
    if (!mode) return;
    const prev = this.mode;
    this.mode = mode;
    if (!this.root) return;
    this.root.dataset.mode = mode;
    this.hud.setMode(mode);
    if (mode === 'title') { this.closeAll(); this.titleScreen.show(); this.labels.clear(); this.setTarget(null); this.setBoss(null); }
    else if (prev === 'title') this.titleScreen.hide();
    if (mode !== 'village' && this.isOpen('build')) this.close('build');
    if (mode === 'dungeon' && !this.hud.cache.loc) this.hud.setLocation('The Burrow', 'B1F');
    if (mode === 'village') this.hud.setLocation(null);
  },

  // ------------------------------------------------------------------ panels
  open(name, opts) {
    const p = this.panels[name]; if (!p || !this.ready) return;
    if (name === 'build') { if (this.mode !== 'village') return; opts = opts || this._lastBuild || this._buildProvider?.() || { categories: [] }; this._lastBuild = opts; }
    if (this.mode === 'title' && name !== 'menu') return;
    if (this.isOpen('menu') && name !== 'menu') return;
    if (p.side === 'left' || p.side === 'right') for (const q of Object.values(this.panels)) if (q !== p && q.isOpen && q.side === p.side) this.close(q.name, true);
    if (p.side === 'center') for (const q of Object.values(this.panels)) if (q !== p && q.isOpen && q.side === 'center') this.close(q.name, true);
    if (name === 'menu' || name === 'map') { this.drag.cancel(); this.hidePopover(); }
    if (name === 'build') { this.close('inventory'); for (const q of ['character', 'skills', 'quests', 'shop', 'stash']) this.close(q); }
    else if (p.side !== 'center' && this.isOpen('build')) this.close('build');
    if ((name === 'shop' || name === 'stash') && !this.isOpen('inventory')) { this.panels.inventory.open(); this._autoInv = true; this._order.push('inventory'); }
    p.open(opts || {});
    this._order = this._order.filter(n => n !== name); this._order.push(name);
    this._raise(p);
    this.root.classList.toggle('paused', this.isOpen('menu'));
    this.root.classList.toggle('has-panel', this._order.some(n => this.panels[n]?.isOpen));
    if (name === 'inventory' || name === 'shop' || name === 'stash') this.panels.inventory.refresh();
    this.G?.events?.emit?.('ui:open', { name });
  },
  close(name, silent) {
    const p = this.panels[name]; if (!p || !p.isOpen) return;
    p.close();
    this._order = this._order.filter(n => n !== name);
    if (name === 'inventory') { this.drag.cancel(); if (this.isOpen('shop')) this.close('shop'); if (this.isOpen('stash')) this.close('stash'); }
    if ((name === 'shop' || name === 'stash') && this._autoInv) { this._autoInv = false; this.close('inventory'); }
    if (name === 'skills') this.hidePopover();
    this.root.classList.toggle('paused', this.isOpen('menu'));
    this.root.classList.toggle('has-panel', this._order.some(n => this.panels[n]?.isOpen));
    this.panels.inventory.refresh();
    this.G?.events?.emit?.('ui:close', { name });
  },
  toggle(name, opts) { if (this.isOpen(name)) this.close(name); else this.open(name, opts); },
  isOpen(name) { return !!this.panels[name]?.isOpen; },
  closeAll() { for (const n of Object.keys(this.panels)) this.close(n, true); this.hidePopover(); this.drag?.cancel(); },
  anyModal() {
    if (!this.ready) return false;
    if (this.mode === 'title' || this.dlg.active || this.iris.active) return true;
    for (const [n, p] of Object.entries(this.panels)) if (p.isOpen && !NON_BLOCKING.has(n)) return true;
    return false;
  },
  isPaused() { return this.ready && (this.mode === 'title' || this.isOpen('menu')); },
  _raise(p) { this._z = (this._z || 10) + 1; if (p.wrap) p.wrap.style.zIndex = this._z; },
  openBuild(opts) {
    if (this.mode !== 'village') { this.toast('You can only build in the village!', { icon: 'hammer' }); return; }
    const B = this.G?.build;
    if (B?.enter) { B.active ? B.exit() : B.enter(); return; }
    this.toggle('build', opts);
  },
  setBuildProvider(fn) { this._buildProvider = fn; },
  refreshItems() { for (const n of ['inventory', 'stash', 'character', 'shop']) this.panels[n].refresh(); },

  // ------------------------------------------------------------------ keyboard
  onKey(e) {
    if (!this.ready || isTyping() || e.repeat && e.key !== 'Alt') { if (e.key === 'Alt') e.preventDefault(); return; }
    const code = e.code, k = e.key;
    if (this.iris.active) { e.preventDefault(); return; }
    if (k === 'Alt') { e.preventDefault(); this.labels.setVisible(true); return; }
    if (this.mode === 'title') { if (k === 'Escape' && this.isOpen('menu')) this.close('menu'); return; }
    if (this.dlg.active) { if (this.dlg.key(k, e)) e.preventDefault(); return; }
    if (k === 'Escape') {
      e.preventDefault();
      if (this.pop.classList.contains('show')) { this.hidePopover(); return; }
      if (this.drag.held) { this.drag.cancel(); return; }
      if (this.isOpen('build') && (this.panels.build.sel || this.panels.build.tool)) { this.panels.build.clearSelection(); this.panels.build.opts.onCancel?.(); return; }
      const top = [...this._order].reverse().find(n => this.panels[n]?.isOpen);
      if (top) this.close(top); else this.open('menu');
      return;
    }
    if (this.isOpen('menu')) return;
    const map = { KeyI: 'inventory', KeyC: 'character', KeyK: 'skills', KeyJ: 'quests', KeyM: 'map', Tab: 'map' };
    if (map[code]) { e.preventDefault(); this.toggle(map[code]); return; }
    if (code === 'KeyB') { if (this.mode === 'village' && !this.G?.build && this._buildProvider) this.openBuild(); return; } // the game toggles G.build itself
    const dig = /^Digit([1-4])$/.exec(code);
    if (dig) {
      const slot = +dig[1] + 1;
      if (this.isOpen('skills') && this.skills.hoverId) { this.skills.assign(slot, this.skills.hoverId); e.preventDefault(); return; }
      if (!this.anyModal()) this.hud.flashSlot(slot);
      return;
    }
    if ((code === 'KeyQ' || code === 'KeyE') && !this.anyModal()) this.hud.flashBelt(code === 'KeyQ' ? 'heart' : 'zoom');
  },

  // ------------------------------------------------------------------ settings
  onSetting(fn) { this._settingFns.push(fn); return () => { this._settingFns = this._settingFns.filter(f => f !== fn); }; },
  setSetting(k, v) {
    if (this.settings[k] === v) return;
    this.settings[k] = v;
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings)); } catch (e) { /* ignore */ }
    this.applySettings();
    for (const f of this._settingFns) { try { f(k, v, this.settings); } catch (e) { console.error('[ui] onSetting handler', e); } }
    if (k === 'sfx') this.sfx('tick');
  },
  applySettings() {
    this.fpsEl.classList.toggle('show', !!this.settings.showFps);
    this.applyScale();
  },
  applyScale() {
    const s = clamp(Math.min(innerWidth / 1600, innerHeight / 900) * (this.settings.uiScale || 1), 0.62, 1.6);
    this.scale = s;
    this.root?.style.setProperty('--ui-scale', s.toFixed(4));
  },
  onTitle(h) { this._titleH = h || {}; this.titleScreen?.sync(); },
  onMenu(h) { this._menuH = h || {}; },
  sfx(name) {
    const m = SFX_MAP[name]; if (!m) return;
    if (name === 'hover') { const t = performance.now(); if (t - (this._hovT || 0) < 70) return; this._hovT = t; }
    try { this.G?.audio?.play?.(m); } catch (e) { /* ignore */ }
  },

  // ------------------------------------------------------------------ messages
  toast(text, opts = {}) { if (!this.ready) return null; return this.toasts.show(text, opts); },
  banner(title, sub = '', opts = {}) { if (!this.ready) return; this.banners.show(title, sub, opts); },
  float(worldPos, text, opts = {}) { if (!this.ready || !worldPos) return; this.floats.spawn(worldPos, String(text), opts); },
  dialogue(opts) { if (!this.ready) return Promise.resolve(-1); this.hidePopover(); this.tip.hide(); return this.dlg.open(opts); },
  setTarget(info) { if (this.ready) this.hud.setTarget(info); },
  setBoss(info) { if (this.ready) this.hud.setBoss(info); },
  setInteract(text, opts) { if (this.ready) this.hud.setInteract(this.mode === 'title' || this.dlg.active ? null : text, opts); },
  onInteract(fn) { this._fire = n => { if (n === 'interact') fn(); }; },
  setRCI(v) { if (this.ready) this.hud.setRCI(v); },
  setLocation(name, sub) { if (this.ready) this.hud.setLocation(name, sub); },
  setBuffs(list) { if (this.ready) this.hud.setBuffs(list); },
  setSkillProvider(p) { this._skillProv = p; if (this.hud) this.hud.cd.provider = p; },
  setQuestProvider(fn) { this._questProvider = fn; if (this.ready) { this.hud.cache.qAcc = 0; this.panels.quests.refresh(); } },
  questList(all) {
    let list = [];
    try {
      if (this._questProvider) list = (this._questProvider() || []).map(q => normQuest(q, q?.done));
      else {
        const q = this.G?.state?.quests || {};
        list = (q.active || []).map(x => normQuest(x, false));
        if (all) list = list.concat((q.done || []).map(x => normQuest(x, true)));
      }
    } catch (e) { list = []; }
    list = list.filter(Boolean);
    return all ? list : list.filter(q => !q.done || q.objectives.length);
  },
  // HUD celebration for a level-up (the big banner is shown by whoever calls UI.banner(..., {style:'levelup'}))
  levelUp(lvl) {
    const r = this.hud.life.el.getBoundingClientRect(), r2 = this.hud.$.xp.getBoundingClientRect();
    this.burst(r.left + r.width / 2, r.top + r.height / 2, { n: 20, spread: 110 });
    this.burst(r2.left + 20, r2.top + r2.height / 2, { n: 14, spread: 70, kind: 'star', colors: ['#ffcf4a', '#fff3b8', '#c3a6ff'] });
    this.ring(r2.left + 20, r2.top + r2.height / 2, '#ffcf4a');
  },

  // item picked up in the world → toast + icon flies into the bag. Deduped per item uid (event + explicit call).
  pickup(item, worldPos, fromEvent) {
    if (!this.ready || !item) return;
    const key = item.uid || item.name;
    const now = performance.now();
    this._flown = this._flown || new Map();
    if (key && now - (this._flown.get(key) || -1e9) < 1500) return;
    if (key) this._flown.set(key, now);
    let from = { x: innerWidth / 2, y: innerHeight / 2 };
    const cam = this.G?.engine?.camera;
    const wp = worldPos || this.hud.playerPos();
    if (cam && wp) { const v = new Vector3(wp.x, (wp.y || 0) + (worldPos ? 0 : 0.8), wp.z).project(cam); from = { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight }; }
    this.flyToBag(itemIconURL(item), from, item);
    if (item.rarity && item.rarity !== 'normal' || item.kind === 'gem' || item.kind === 'gift' || item.kind === 'key') {
      this.toast(itemName(item), { iconURL: itemIconURL(item), color: rarityColor(item.rarity), rarity: item.rarity, sub: item.rarity === 'unique' ? 'Unique find!' : item.rarity === 'set' ? 'Set item!' : item.rarity === 'rare' ? 'Rare find!' : 'Picked up', silent: true });
    }
  },
  pickupFly(item, worldPos) { this.pickup(item, worldPos); },
  flyToBag(icon, from, item) {
    const bagVisible = this.mode !== 'title';
    const to = this.isOpen('inventory') ? this.panels.inventory.panel.getBoundingClientRect() : this.hud.bagRect();
    const tr = this.isOpen('inventory') ? { left: to.left + to.width / 2 - 20, top: to.top + to.height - 120, width: 40, height: 40 } : to;
    if (!bagVisible) return;
    flyToBag(this.layers.fx, icon || item, from, tr, () => { this.hud.bumpBag(); this.sfx('bag'); });
  },
  burst(x, y, opts) { burst(this.layers.fx, x, y, { size: this.scale, ...opts }); },
  ring(x, y, color = '#ffcf4a') {
    const r = el('div', 'ring'); r.style.left = x + 'px'; r.style.top = y + 'px'; r.style.setProperty('--c', color);
    this.layers.fx.appendChild(r); setTimeout(() => r.remove(), 800);
  },

  // ------------------------------------------------------------------ popover (hotbar assignment etc.)
  popover(anchor, html, onClick, dir = 'up') {
    const p = this.pop, inner = p.firstElementChild;
    inner.innerHTML = html;
    const r = anchor.getBoundingClientRect();
    p.dataset.dir = dir;
    p.style.transform = `translate3d(${(r.left + r.width / 2) | 0}px,${(dir === 'up' ? r.top - 6 : r.bottom + 6) | 0}px,0)`;
    p.classList.remove('show'); void p.offsetWidth; p.classList.add('show');
    this.tip.hide();
    inner.onclick = e => { if (onClick(e)) this.hidePopover(); };
    clearTimeout(this._popT);
    this._popT = setTimeout(() => {
      this._popOff = e => { if (!p.contains(e.target)) this.hidePopover(); };
      addEventListener('pointerdown', this._popOff, true);
    }, 0);
  },
  hidePopover() {
    if (!this.pop) return;
    this.pop.classList.remove('show');
    if (this._popOff) { removeEventListener('pointerdown', this._popOff, true); this._popOff = null; }
  },

  // ------------------------------------------------------------------ skill drag → hotbar
  dragSkill(id, x, y) {
    this.skGhost.querySelector('img').src = skillIconURL(id);
    this.skGhost.style.transform = `translate3d(${x}px,${y}px,0)`;
    this.skGhost.classList.remove('show'); void this.skGhost.offsetWidth; this.skGhost.classList.add('show');
    this.root.classList.add('dragging-skill');
    this.tip.hide();
  },
  dragSkillMove(x, y) {
    this.skGhost.style.transform = `translate3d(${x}px,${y}px,0)`;
    const hb = document.elementFromPoint(x, y)?.closest?.('.hb');
    if (hb !== this._hbHover) { this._hbHover?.classList.remove('drop-hover'); hb?.classList.add('drop-hover'); this._hbHover = hb; }
  },
  dragSkillEnd(id, x, y) {
    this.skGhost.classList.remove('show');
    this.root.classList.remove('dragging-skill');
    this._hbHover?.classList.remove('drop-hover'); this._hbHover = null;
    const hb = document.elementFromPoint(x, y)?.closest?.('.hb');
    if (hb) this.skills.assign(+hb.dataset.i, id);
  },

  // ------------------------------------------------------------------ transition
  transition(midFn, opts = {}) { if (!this.ready) return Promise.resolve(midFn?.()); this.tip.hide(); return this.iris.play(midFn, opts); },

  // ------------------------------------------------------------------ minimap
  minimap: {
    setProvider(p) { UI.hud && (UI.hud.mm.provider = p, UI.hud.mm.acc = 1); UI._mmPending = p; },
    redraw() { if (UI.hud) UI.hud.mm.acc = 1; },
  },
};

// loot labels facade: UI.lootLabel.add({...}) / remove(id) / setVisible(all) / onClick(fn) / move(id,pos) / clear()
UI.lootLabel = {
  add: o => UI.labels?.add(o),
  remove: id => UI.labels?.remove(id),
  move: (id, p) => UI.labels?.move(id, p),
  setVisible: all => UI.labels?.setVisible(all),
  onClick: fn => { UI._lootCb = fn; if (UI.labels) UI.labels.onClick(fn); },
  clear: () => UI.labels?.clear(),
};

export default UI;
