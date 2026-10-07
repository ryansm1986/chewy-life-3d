// Pawhaven UI — HTML/CSS overlay above the canvas. See docs/ARCHITECTURE.md (UI section) for the contract.
import './style.css';
import './hud.css';
import './panels.css';
import './fx.css';
import './life.css';
import './home.css';
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
import { BuildPanel, InspectCard } from './build.js';
import { QuestArrow } from './questArrow.js';
import { TutorialUI } from './tutorial.js';
import { ChargeHud } from './chargeHud.js';
import { ShopPanel } from './shop.js';
import { MapPanel, QuestPanel, normQuest } from './map.js';
import { TravelPanel } from './travel.js';
import { MenuPanel } from './menu.js';
import { SeedPickerPanel, pantryGain, pantryTipHTML } from './pantry.js';
import { CookPanel } from './cook.js';
import { CraftPanel } from './craft.js';
import { GiftPickerPanel } from './gift.js';
import { DecoratePanel, HomeHud } from './decorate.js';
import { HouseCardPanel, RemodelPanel, Preview } from './remodel.js';
import { ReelBar } from './reel.js';
import { Title } from './title.js';
import { Prewarm } from './prewarm.js';
import { itemName, itemIconURL, skillIconURL } from './rpg.js';
import { Actions } from '../core/actions.js';
import { normKey } from '../core/input.js';
import { installPadGlyphs, touchWording } from './padGlyphs.js';
import { PadNav } from './padNav.js';
import { PadCursor } from './padCursor.js';
import { deckLike, mobileLike, DECK } from '../core/deck.js';
import { installDesktop } from './desktop.js';
import { TouchControls } from './touch.js';
import { Mobile } from './mobile.js';
import './deck.css'; // (last: the Deck's text floor outranks the panels' own sizes)
import { Vector3 } from 'three';

const SETTINGS_KEY = 'chewy3d.settings';
const DEFAULT_SETTINGS = { quality: 2, music: 0.7, sfx: 0.8, uiScale: 1, shake: true, showFps: false, chargeMode: 0, sprintMode: 0, rumble: true, aimAssist: 0.7, padGlyphs: 0, binds: null, fpsCap: 0, touchSize: 1, touchOpacity: 0.85, touchLeft: false, touchAim: 0, haptics: true }; // touch*: Settings › Controls › Touch (ui/touch.js: button size, opacity, left-handed, aim 0 auto · 1 drag), haptics; chargeMode: 0 hold to charge · 1 off · 2 toggle (docs/CHARGE.md); sprintMode: 0 hold Shift · 1 toggle (actors/sprint.js); rumble, aimAssist (0..1), padGlyphs (0 auto · 1 Xbox · 2 PlayStation), binds ({ kbm, pad } overrides): Settings › Controls (core/actions.js, docs/CONTROLS.md); quality 3 is the Steam Deck preset, fpsCap 0 off · 1 60 · 2 40 (core/deck.js)
const CONTROL_SETTINGS = new Set(['rumble', 'padGlyphs', 'binds']);
const PAD_SLOTS = ['attack', 'skillAlt', 'skill1', 'skill2', 'skill3', 'skill4'];
const NON_BLOCKING = new Set(['build', 'decorate']); // panels that don't pause gameplay input
// UI sound names → src/audio sfx ids (learn / equip / level-up / toast sounds are already bound to game events by the audio module)
const SFX_MAP = { open: 'ui_open', close: 'ui_close', tab: 'ui_tab', deny: 'ui_error', coin: 'ui_coin', buy: 'ui_buy', hover: 'ui_hover', equip: 'ui_equip', learn: 'ui_learn',
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
    // the graphics preset the engine booted with (core/deck.js: the saved one, ?q=, or the first start's pick: Deck on a
    // Deck-like screen); a Deck-like screen's first start also sizes the UI up (1.15) and keeps it in a safe area
    const fresh = (() => { try { return localStorage.getItem(SETTINGS_KEY) == null; } catch (e) { return true; } })(), deck = deckLike();
    if (G?.engine?.preset != null && (fresh || G.engine.params?.has('q'))) this.settings.quality = G.engine.preset;
    if (fresh && deck) this.settings.uiScale = DECK.uiScale;
    if (fresh && mobileLike()) this.settings.fpsCap = 1; // (a phone or tablet: capped at 60, kind to the battery on a 120 Hz screen)
    let root = document.getElementById('ui');
    if (!root) { root = el('div'); root.id = 'ui'; document.body.appendChild(root); }
    this.root = root;
    root.innerHTML = '';
    root.classList.add('ui-root');
    root.classList.toggle('deck-ui', deck); // (deck.css: the safe area and the Deck's text floor)
    const L = n => { const d = el('div', 'layer l-' + n); root.appendChild(d); return d; };
    this.layers = { world: L('world'), hud: L('hud'), panels: L('panels'), dlg: L('dlg'), msg: L('msg'), title: L('title'), fx: L('fx'), over: L('over'), iris: L('iris') };
    this.tip = new Tooltip(this.layers.over);
    this.hud = new Hud(this, this.layers.hud);
    this.floats = new Floats(this.layers.world);
    this.labels = new LootLabels(this.layers.world);
    this.toasts = new Toasts(this.layers.msg);
    this.banners = new Banners(this.layers.msg, this.layers.fx); this.banners.hold = () => !!this.dlg?.active;
    this.iris = new Iris(this.layers.iris);
    this.inspectCard = new InspectCard(this, this.layers.over);
    this.qarrow = new QuestArrow(this, this.layers.world);
    this.drag = new ItemDrag(this);
    this.reel = new ReelBar(this, this.layers.hud); // the fishing reel bar (docs/HOMESTEAD.md)
    this.tutorial = new TutorialUI(this, this.layers.over); // guided tutorials (docs/TUTORIALS.md; driven by world/tutorials.js)
    this.dlg = new Dialogue(this);
    this.titleScreen = new Title(this);
    this.panels = {
      inventory: new InventoryPanel(this), stash: new StashPanel(this), character: new CharacterPanel(this), skills: new SkillsPanel(this),
      quests: new QuestPanel(this), map: new MapPanel(this), travel: new TravelPanel(this), shop: new ShopPanel(this), build: new BuildPanel(this), menu: new MenuPanel(this),
      seeds: new SeedPickerPanel(this), // (F on tilled soil: docs/HOMESTEAD.md)
      cook: new CookPanel(this), // (the kitchen, campfires, Rosie's oven)
      gift: new GiftPickerPanel(this), // ("Give a gift" in a villager's chat)
      decorate: new DecoratePanel(this), // (decorate mode indoors: docs/HOUSING.md)
      craft: new CraftPanel(this), // (the workbench: docs/HOUSING.md §3)
      houseCard: new HouseCardPanel(this), remodel: new RemodelPanel(this), // (a house's mailbox: Upgrade / Remodel / Enter — docs/HOUSING.md §5-6)
    };
    this.homeHud = new HomeHud(this); // (indoors: the house name, the Decorate button)
    this.chargeHud = new ChargeHud(this); // (the hotbar's charge ring + stage pips: docs/CHARGE.md)
    this.skills = this.panels.skills;
    // popover + skill drag ghost
    this.pop = el('div', 'pop-wrap'); this.pop.innerHTML = '<div class="pop-box"></div>'; this.layers.over.appendChild(this.pop);
    this.skGhost = el('div', 'cursor-item skill'); this.skGhost.innerHTML = '<div class="ci-in"><img alt=""></div>'; this.layers.over.appendChild(this.skGhost);
    this.fpsEl = el('div', 'fps'); this.layers.over.appendChild(this.fpsEl);
    this._fpsAcc = 0; this._fpsN = 0;
    this.applyScale();
    addEventListener('resize', () => this.applyScale());
    addEventListener('keydown', e => this.onKey(e));
    addEventListener('keyup', e => { if (Actions.isKey('lootLabels', normKey(e))) this.labels.setVisible(false); if (e.key === 'Alt') e.preventDefault(); }); // (hold Z: the loot labels)
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
    this.applyControls();
    installDesktop(this); // (the desktop app: Settings › Full screen; nothing in a browser — ui/desktop.js)
    this.refreshCaps = installPadGlyphs(this); // (keycaps ⇄ gamepad glyphs when the device changes: ui/padGlyphs.js)
    this.padNav = new PadNav(this); this.padCursor = new PadCursor(this); // (the gamepad in panels; in build and decorate mode: docs/CONTROLS.md §3)
    this.mobile = new Mobile(this); // (phones and tablets: the layout, the menus on touch, rotate, full screen: ui/mobile.js)
    this.touch = new TouchControls(this); // (the on-screen controls while touch plays: ui/touch.js, docs/CONTROLS.md §12)
    this.setMode(G?.mode && G.mode !== 'title' ? G.mode : this.mode);
    this.ready = true;
    (this.prewarm = new Prewarm(this)).start(); // the menus' lazy setup, done ahead in idle time after boot (ui/prewarm.js)
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
    on('pantry:changed', () => { this.panels.inventory.refresh(); this.panels.shop.refresh(); this.panels.cook.refresh(); });
    on('recipe:learned', () => this.panels.cook.refresh());
    on('furniture:changed', () => { this.panels.inventory.refresh(); this.panels.decorate.refresh(); });
    for (const ev of ['coins:changed', 'materials:changed', 'village:changed']) on(ev, () => { this.panels.houseCard.refresh(); this.panels.remodel.refresh(); });
    on('materials:changed', () => this.panels.cook.refresh());
    on('fish:caught', () => this.panels.quests.refresh());
    on('hotbar:changed', () => this.panels.skills.refresh());
    on('boss:dead', () => this.setBoss(null));
  },

  // ------------------------------------------------------------------ frame
  update(dt = 1 / 60) {
    if (!this.ready) return;
    const cam = this.G?.engine?.camera;
    this.padInput(); // (the gamepad in menus and dialogue)
    this.floats.update(dt, cam, this.scale);
    this.labels.update(dt, cam, this.scale);
    if (this.mode !== 'title') this.hud.update(dt);
    this.qarrow.update(dt, cam);
    this.tutorial?.update(dt);
    if (this.mode !== 'title') this.chargeHud?.update(dt);
    this.mobile?.update(dt); this.touch?.update(dt);
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
    if (mode !== 'village') this.inspectCard?.hide();
    if (mode === 'dungeon' && !this.hud.cache.loc) this.hud.setLocation('The Burrow', 'B1F');
    if (mode === 'village') this.hud.setLocation(null);
    if (mode !== 'interior' && this.isOpen('decorate')) this.close('decorate');
    this.homeHud?.setMode(mode);
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
    if (name === 'build' || name === 'decorate') { this.close('inventory'); for (const q of ['character', 'skills', 'quests', 'shop', 'stash', 'cook']) this.close(q); }
    else if (p.side !== 'center' && this.isOpen('build')) this.close('build');
    else if (p.side !== 'center' && name !== 'decorate' && this.isOpen('decorate')) this.close('decorate');
    // (a homestead stall, which trades only in pantry goods, shows the Pantry beside it rather than the Bag)
    if ((name === 'shop' || name === 'stash') && !this.isOpen('inventory')) { this.panels.inventory.open(name === 'shop' ? { view: opts?.noBagSell ? 'pantry' : 'bag' } : {}); this._autoInv = true; this._order.push('inventory'); }
    if (!p.isOpen) p._openAt = performance.now(); // (hidesHitches: when it finished opening)
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
  toggle(name, opts) { this._user = true; try { if (this.isOpen(name)) this.close(name); else this.open(name, opts); } finally { this._user = false; } },
  isOpen(name) { return !!this.panels[name]?.isOpen; },
  closeAll() { for (const n of Object.keys(this.panels)) this.close(n, true); this.hidePopover(); this.drag?.cancel(); },
  anyModal() {
    if (!this.ready) return false;
    if (this.mode === 'title' || this.dlg.active || this.iris.active) return true;
    for (const [n, p] of Object.entries(this.panels)) if (p.isOpen && !NON_BLOCKING.has(n)) return true;
    return false;
  },
  isPaused() { return this.ready && (this.mode === 'title' || this.isOpen('menu') || !!this.mobile?.portrait); }, // (a phone held upright: the rotate overlay, ui/mobile.js)
  /** A moment a one-off hitch can't be seen, for heavy cache-filling work (building templates: world/village.js, the
   *  townsfolk rig pool: game.js, the build palette's thumbnails: ui/prewarm.js): the title screen, or a menu / dialogue
   *  that has been up past its open animation (`ms`). Not the open itself: that frame is the one the player watches
   *  (ROADMAP R-8: work that started on every open made each first open stutter). */
  hidesHitches(ms = 800) {
    if (!this.ready) return false;
    if (this.mode === 'title') return true;
    if (this.iris.active) return false;
    // (the newest of what's up counts: a panel opened alongside another, e.g. the bag beside a shop, has no stamp of its own)
    let up = false, newest = 0;
    if (this.dlg.active) { up = true; newest = this._dlgAt || 0; }
    for (const [n, p] of Object.entries(this.panels)) if (p.isOpen && !NON_BLOCKING.has(n)) { up = true; newest = Math.max(newest, p._openAt || 0); }
    return up && performance.now() - newest > ms;
  },
  _raise(p) { this._z = (this._z || 10) + 1; if (p.wrap) p.wrap.style.zIndex = this._z; },
  openBuild(opts) {
    if (this.mode !== 'village') { this.toast('You can only build in the village!', { icon: 'hammer' }); return; }
    const B = this.G?.build;
    if (B?.enter) { B.active ? B.exit() : B.enter(); return; }
    this.toggle('build', opts);
  },
  setBuildProvider(fn) { this._buildProvider = fn; },
  // build-mode hover card (data from VillageSim.inspect) at screen position x,y; null hides it
  /** the house preview renderer (the house card and the Remodel panel share it) */
  remodelPreview() { return (this._rmPreview ||= new Preview(this.G.engine)); },
  buildInspect(info, x, y) { if (!this.ready) return; if (!info || this.mode !== 'village' || this.dlg.active || this.isOpen('menu')) this.inspectCard.hide(); else this.inspectCard.show(info, x, y); },
  refreshItems() { for (const n of ['inventory', 'stash', 'character', 'shop']) this.panels[n].refresh(); },
  /** P: the inventory panel on its Pantry tab (or closed again). */
  togglePantry() {
    const inv = this.panels.inventory;
    if (this.isOpen('inventory') && inv.view === 'pantry') { this._user = true; try { this.close('inventory'); } finally { this._user = false; } return; }
    if (this.isOpen('inventory')) { inv.setView('pantry'); this.sfx('tab'); return; }
    this.toggle('inventory', { view: 'pantry' });
  },
  /** A pantry item was gained in the world: toast ("New!" on a first discovery) and the icon flies into the bag. */
  pantryGain(id, n, o) { pantryGain(this, id, n, o); },
  pantryTipHTML(id, extra) { return pantryTipHTML(id, this.G?.state, extra); },
  /** The paged gift picker → Promise<key | null>. o: { name, portrait, items: [{ key, name, n, pantry, love }] } */
  pickGift(o) {
    if (!this.ready) return Promise.resolve(null);
    return new Promise(res => this.open('gift', { ...o, onPick: res }));
  },

  // ------------------------------------------------------------------ keyboard
  onKey(e) {
    if (e.key === 'Alt') e.preventDefault(); // (Alt+LMB attacks in place: a lone Alt must not focus the browser's menu)
    const nk = normKey(e), act = a => Actions.isKey(a, nk); // (the keys go through the action layer's bindings: Settings › Controls)
    if (!this.ready || isTyping() || e.repeat && !act('lootLabels')) return;
    const code = e.code, k = e.key;
    if (this.iris.active) { e.preventDefault(); return; }
    if (k === 'Alt') return;
    if (act('lootLabels') && !e.ctrlKey && !e.metaKey && !e.altKey) { this.labels.setVisible(true); return; } // hold Z: every loot label (Ctrl+Z stays the decorate undo)
    if (this.mode === 'title') { if (k === 'Escape' && this.isOpen('menu')) this.close('menu'); return; }
    if (this.dlg.active) { if (this.dlg.key(k, e)) e.preventDefault(); return; }
    if (k === 'Escape') { e.preventDefault(); this.back(); return; }
    if (this.isOpen('menu')) return;
    const panel = ['inventory', 'character', 'skills', 'quests', 'map'].find(act); // (Tab switches heroes: game.js)
    if (panel === 'inventory' && this.isOpen('inventory') && this.panels.inventory.view === 'pantry') { e.preventDefault(); this.panels.inventory.setView('bag'); this.sfx('tab'); return; }
    if (panel) { e.preventDefault(); this.toggle(panel, panel === 'inventory' ? { view: 'bag' } : undefined); return; }
    if (act('pantry')) { e.preventDefault(); this.togglePantry(); return; } // the Pantry (docs/HOMESTEAD.md)
    if (act('build')) { if (this.mode === 'village' && !this.G?.build && this._buildProvider) this.openBuild(); return; } // the game toggles G.build itself
    const dig = /^Digit([1-4])$/.exec(code);
    if (dig) {
      const slot = +dig[1] + 1;
      if (this.isOpen('skills') && this.skills.hoverId) { this.skills.assign(slot, this.skills.hoverId); e.preventDefault(); return; }
      if (!this.anyModal() && act(PAD_SLOTS[slot])) this.hud.flashSlot(slot);
      return;
    }
    const sk = PAD_SLOTS.indexOf(PAD_SLOTS.slice(2).find(act)); // (a hotbar key rebound off the digits)
    if (sk > 1 && !this.anyModal()) this.hud.flashSlot(sk);
    if ((act('potionHeart') || act('potionZoom')) && !this.anyModal()) this.hud.flashBelt(act('potionHeart') ? 'heart' : 'zoom');
  },
  /** Esc (and the pad's B / Menu): a popover, a held item, a build pick, decorate's hand, the top panel — else the menu */
  back() {
    if (this.pop.classList.contains('show')) { this.hidePopover(); return; }
    if (this.drag.held) { this.drag.cancel(); return; }
    if (this.isOpen('build') && (this.panels.build.sel || this.panels.build.tool)) { this.panels.build.clearSelection(); this.panels.build.opts.onCancel?.(); return; }
    if (this.isOpen('decorate') && this.G?.housing?.decor?.onEscape?.()) return; // (decorating: Esc drops what's in hand first)
    const top = [...this._order].reverse().find(n => this.panels[n]?.isOpen);
    this._user = true; try { if (top) this.close(top); else this.open('menu'); } finally { this._user = false; }
  },

  // ------------------------------------------------------------------ the gamepad in menus and dialogue (docs/CONTROLS.md §3)
  // CT-1's bridge: Menu = Esc (the menu, or close the top panel), B = back out of a panel, View = the map, a held D-pad ▼
  // shows the loot labels, A / B / the D-pad drive dialogue (advance, leave, pick a choice). Hotbar and belt flashes for
  // pad presses. (CT-2 adds spatial focus navigation for every panel.)
  padInput() {
    const A = Actions;
    const lh = A.device === 'pad' && A.heldTime('lootLabels') > 0.25 && !this.anyModal();
    if (lh !== !!this._padLabels) { this._padLabels = lh; this.labels.setVisible(lh); }
    if (A.device !== 'pad') { this.padNav?.update(); this.padCursor?.update(); return; } // (they hide their ring, hints and cursor)
    if (this.dlg.active && this.mode !== 'title') return this.padDialogue(); // (every frame: the focused choice shows as soon as the choices do)
    if (this.mode === 'title' && !this.isOpen('menu') && !this.iris.active) return this.padTitle();
    if (this.panels.menu?.wait) { this.panels.menu.padCapture(); return; } // (Settings › Controls is waiting for a button)
    if (this.iris.active) return;
    if (this.padCursor?.update()) return; // build and decorate mode: the virtual cursor and the palette (ui/padCursor.js)
    // View: the map (or, while a guide waits for "Got it!", that); Menu: Esc
    const mapOk = !this._order.some(n => n !== 'map' && this.panels[n]?.isOpen && !NON_BLOCKING.has(n));
    if (A.pressed('map', 'pad') && this.tutorial?.root.classList.contains('on') && this.tutorial.$.obj.classList.contains('ack') && !this.anyModal()) { A.consume('map', 'pad'); this.tutorial.onAck?.(); return; }
    if (A.pressed('map', 'pad') && mapOk && !this.isOpen('menu')) { A.consume('map', 'pad'); this._user = true; try { this.toggle('map'); } finally { this._user = false; } return; }
    if (A.pressed('menu', 'pad')) { A.consume('menu', 'pad'); if (this.tutorial?.offering) this.tutorial.answerOffer(false); else this.back(); return; }
    if (this.tutorial?.offering && A.padHit('B')) { A.padConsume('B'); this.tutorial.answerOffer(false); return; }
    if (this.padNav?.update()) return; // a panel, the popover or the guide's offer: spatial focus navigation (ui/padNav.js)
    if (!this.anyModal()) {
      PAD_SLOTS.forEach((a, i) => { if (A.pressed(a, 'pad')) this.hud.flashSlot(i); });
      if (A.pressed('potionHeart', 'pad')) this.hud.flashBelt('heart');
      if (A.pressed('potionZoom', 'pad')) this.hud.flashBelt('zoom');
    }
  },
  nonBlocking(n) { return NON_BLOCKING.has(n); },
  /** the title screen: the D-pad / stick moves a focus over New Game · Continue · Settings (Continue first), A presses it */
  padTitle() {
    const A = Actions, T = this.titleScreen;
    const btns = [...T.root.querySelectorAll('.ti-btns .btn')].filter(b => !b.disabled);
    if (!btns.length) return;
    if (T._padSel == null || !btns[T._padSel]) T._padSel = Math.max(0, btns.findIndex(b => b.dataset.a === 'continue'));
    if (A.nav === 'right' || A.nav === 'down') { T._padSel = (T._padSel + 1) % btns.length; this.sfx('hover'); }
    if (A.nav === 'left' || A.nav === 'up') { T._padSel = (T._padSel + btns.length - 1) % btns.length; this.sfx('hover'); }
    btns.forEach((b, i) => b.classList.toggle('pad-focus', i === T._padSel));
    if (A.padHit('A')) { A.padConsume('A'); btns[T._padSel].click(); }
  },
  padDialogue() {
    const A = Actions, D = this.dlg;
    const picking = D.choices?.length && D.i >= D.lines.length - 1 && !D.typing;
    const btns = picking ? [...D.$.ch.querySelectorAll('.dch')] : [];
    if (btns.length) {
      if (D._padSel == null || D._padSel >= btns.length || btns[D._padSel]?.dataset.i == null) D._padSel = 0;
      if (A.nav === 'down' || A.nav === 'right') D._padSel = (D._padSel + 1) % btns.length;
      if (A.nav === 'up' || A.nav === 'left') D._padSel = (D._padSel + btns.length - 1) % btns.length;
      btns.forEach((b, i) => b.classList.toggle('pad-focus', i === D._padSel));
      if (A.nav) this.sfx('hover');
      if (A.padHit('A')) { A.padConsume('A'); D.choose(+btns[D._padSel].dataset.i); D._padSel = null; return; }
    } else { D._padSel = null; if (A.padHit('A')) { A.padConsume('A'); D.key('Enter'); return; } }
    if (A.padHit('B')) { A.padConsume('B'); D.key('Escape'); }
  },

  // ------------------------------------------------------------------ settings
  onSetting(fn) { this._settingFns.push(fn); return () => { this._settingFns = this._settingFns.filter(f => f !== fn); }; },
  setSetting(k, v) {
    if (this.settings[k] === v) return;
    this.settings[k] = v;
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings)); } catch (e) { /* ignore */ }
    this.applySettings();
    if (CONTROL_SETTINGS.has(k)) this.applyControls();
    for (const f of this._settingFns) { try { f(k, v, this.settings); } catch (e) { console.error('[ui] onSetting handler', e); } }
    if (k === 'sfx') this.sfx('tick');
  },
  /** Settings › Controls → the action layer: the rebinds, rumble, the glyph style (aim assist is read live: combat/padAim.js) */
  applyControls() {
    const s = this.settings;
    Actions.setOptions({ rumble: s.rumble !== false, glyphs: s.padGlyphs || 0 });
    const b = s.binds || {}, sig = JSON.stringify(b);
    if (sig !== this._bindSig) { this._bindSig = sig; Actions.setOverrides(b); }
  },
  /** the device changed (ui/padGlyphs.js already redrew the tagged caps): redraw what prints key names in text */
  onDevice(p) {
    this.tutorial?.redraw?.(); if (this.hud?.cache) this.hud.cache.prompt = null; if (this.isOpen('menu')) this.panels.menu.render?.();
    if (p?.device !== 'pad') { for (const b of this.root.querySelectorAll('.pad-focus')) b.classList.remove('pad-focus'); if (this.dlg) this.dlg._padSel = null; }
    for (const n of ['inventory', 'shop', 'stash']) this.panels[n]?.refresh?.(); // (their footers' mouse / pad wording)
  },
  /** save the action layer's current overrides (after a rebind in the Controls panel) */
  saveBinds() { this.setSetting('binds', JSON.parse(JSON.stringify(Actions.over))); },
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
  toast(text, opts = {}) { if (!this.ready) return null; return this.toasts.show(typeof text === 'string' ? Actions.resolve(text) : text, opts); }, // ({action} tokens; on the pad, "press F" names its button)
  banner(title, sub = '', opts = {}) { if (!this.ready) return; this.banners.show(title, typeof sub === 'string' ? Actions.resolve(sub) : sub, opts); this.events.emit('ui:banner', { title, style: opts.style }); }, // (the sub line's "Tap Tab…": the pad's or touch's own words)
  heroCard(o) { if (this.ready) this.hud?.heroCard?.(o); },
  float(worldPos, text, opts = {}) { if (!this.ready || !worldPos) return; this.floats.spawn(worldPos, String(text), opts); },
  dialogue(opts) { if (!this.ready) return Promise.resolve(-1); this.hidePopover(); this.tip.hide(); if (!this.dlg.active) this._dlgAt = performance.now(); return this.dlg.open(opts); },
  setTarget(info) { if (this.ready) this.hud.setTarget(info); },
  setBoss(info) { if (this.ready) this.hud.setBoss(info); },
  setInteract(text, opts) { if (this.ready) this.hud.setInteract(this.mode === 'title' || this.dlg.active ? null : Actions.device === 'touch' && text ? touchWording(text) : text, opts); }, // (touch: "Click to build · R to rotate" in its words)
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
