// Big map (the same provider as the minimap), its People and Places directories (ui/mapDir.js), and the quest journal.
import { el, esc, fmt } from './dom.js';
import { glyph } from './glyphs.js';
import { padGlyph } from './padGlyphs.js';
import { Panel } from './panel.js';
import { drawPlaceholderMap } from './hud.js';
import { FishLogView } from './fishlog.js';
import { GuidesView } from './tutorial.js';
import { CrewLogView } from './crewLog.js';
import { cozyIcon } from './cozyIcons.js';
import { pantryIcon } from '../life/pantryIcons.js';
import { simpleTip } from './tooltip.js';
import { MapDirectory } from './mapDir.js';
import { people, places, tipFor, CAT_COLOR } from '../world/mapData.js';
import { iconSVG } from '../world/mapArt.js';
import { mapRot } from '../world/minimap.js';
import { Actions } from '../core/actions.js';
import './map.css';

// Each area's key (UX-1): [text, swatch] (ui/mapDir.js drawSwatch draws each with the maps' own art; '|' parts)
const C = CAT_COLOR;
const KEY_PEOPLE = [['You', 'you'], ['Shadow', 'shadow'], ['Someone (their initial)', 'pip|#f78fb6|M'], ['Has something for you', 'flag|!'], ['On their quest', 'flag|?']];
const KEY_MARKS = [['Your pin', 'pin'], ['Quest objective', 'star'], ['Off the minimap: this way', 'edge']];
const KEY_VILLAGE = [
  ...KEY_PEOPLE, ['A friendship gift', 'flag|gift'], ['Townsfolk and hires', 'pip|#8fd0ff||4.6'], ...KEY_MARKS,
  ['Your cottage', 'badge|home|#ff5c8a'], ['Shops and stalls', `badge|shop|${C.shop}`], ['Services', `badge|special|${C.service}`], ['A Stash Chest (each opens the shared stash)', `badge|chest|${C.service}`], ['Boards', `badge|scroll|${C.board}`],
  ["A villager's home", `badge|home|${C.home}`], ['Workshops and gathering', `badge|leaf|${C.gather}`], ['Gates and regions', `badge|map|${C.gate}`], ['The Town Portal (while one is open)', 'badge|portal|#9b7be6'],
  ["Shadow's dig spot", 'dig'], ['Gather spot', 'node'], ['Buildings (their roofs)', 'roof'], ['Paths and plazas', 'path'], ['Trees', 'tree'], ['Districts', 'district'],
];
// an outdoor zone (docs/COZY.md §6.2–§7): the wild areas, today's sightings, the scavenging marks
const KEY_REGION = [
  ...KEY_PEOPLE, ...KEY_MARKS, ['Wild area', 'wild'], ['Sighting', 'sight'], ['Monsters', 'mon'], ['Elites', 'elite'],
  ['The village', `badge|home|${C.landmark}`], ['Shops', `badge|shop|${C.shop}`], ['Services and shrines', `badge|sparkle|${C.service}`], ['Chest', `badge|chest|${C.gather}`],
  ["Wayfarer's Stone, the dungeon", `badge|map|${C.gate}`], ["The boss's clearing", 'badge|skull|#e8506e'], ["Shadow's dig spot", 'dig'], ['Gather spot', 'node'], ['The trail', 'trail'], ['Thicket', 'thicket'],
];
const KEY_DUNGEON = [
  ['You', 'you'], ['Shadow', 'shadow'], ...KEY_MARKS, ['Monsters', 'mon'], ['Elites', 'elite'], ['Boss', 'boss'],
  ['Stairs down', `badge|draw:stairs|${C.gate}`], ['Portal home', `badge|draw:portal|${C.gate}`], ['Chest', `badge|chest|${C.gather}`], ['Shrine', `badge|sparkle|${C.service}`], ['Opened, or its blessing used', 'badge|chest|#a89c94|dim'],
  ['Waypoint', 'badge|torii|#5ec8b0'], ["The boss's room", 'badge|skull|#e8506e'], ['Not explored yet', 'fog'], ["Shadow's dig spot", 'dig'],
];
const KEY_HOME = [
  ['You', 'you'], ['Shadow', 'shadow'], ['A guest', 'pip|#f78fb6|M'], ...KEY_MARKS.slice(0, 1),
  ['The bed', `badge|moon|${C.service}`], ['The stash', `badge|chest|${C.service}`], ['The kitchen', `badge|fire|${C.service}`], ['The workbench', `badge|craft|${C.service}`], ['The door', `badge|door|${C.gate}`],
  ['Furniture', 'furn'], ['Rugs', 'rug'],
];
// the filter chips: the marks' layers on both maps (Settings' mapLayers; homes, landmarks and gates always show)
const CHIPS = [['people', 'People', 'chat'], ['shops', 'Shops', 'shop'], ['services', 'Services', 'special'], ['quests', 'Quests', 'scroll'], ['gather', 'Gathering', 'leaf'], ['wild', 'Wild', 'draw:claw']];
const ZMIN = 0.8, ZMAX = 6;
export class MapPanel extends Panel {
  constructor(ui) { super(ui, { name: 'map', title: 'Map', side: 'center', cls: 'p-map', icon: 'map' }); this.sel = null; this.hover = null; this.view = null; this.areaKey = ''; this.ptrs = new Map(); }
  init() {
    this.body.innerHTML = `<div class="mp-wrap"><div class="mp-frame"><canvas class="mp-cv"></canvas><div class="mp-vig"></div><div class="mp-compass"><i class="mp-rose">${glyph('sakura')}</i><b>N</b></div>
        <div class="mp-cross pad-only"></div>
        <div class="mp-ctl"><button class="mp-b mp-zin" title="Zoom in">${glyph('plus')}</button><button class="mp-b mp-zout" title="Zoom out"><i class="mp-minus"></i></button><button class="mp-b mp-me" title="Back to you">${glyph('paw')}</button></div>
        <div class="mp-chips">${CHIPS.map(([k, n, ic]) => `<button class="mp-chip on" data-l="${k}" title="Show or hide: ${n}">${iconSVG(ic)}<span>${n}</span></button>`).join('')}</div>
        <div class="mp-tip kbm-only">${glyph('paw')}Drag to move · the wheel zooms · click someone to pin them</div><div class="mp-tip touch-only">${glyph('paw')}Drag to move · pinch to zoom · tap someone to pin them</div><div class="mp-tip pad-only"><span class="kc sm pad">${padGlyph('LS')}</span>move <span class="kc sm pad">${padGlyph('LT')}</span><span class="kc sm pad">${padGlyph('RT')}</span>zoom <span class="kc sm pad">${padGlyph('A')}</span>pin</div></div>
      <div class="mp-side"><div class="mp-loc"><b class="mp-name">Blossom Hollow</b></div><div class="mp-dir"></div></div></div>`;
    const q = s => this.body.querySelector(s);
    this.cv = q('.mp-cv'); this.frame = q('.mp-frame'); this.rose = q('.mp-compass');
    this.dir = new MapDirectory(this, q('.mp-dir'));
    this.dir.demo = () => this.demo('people'); this.dir.demoPlaces = () => this.demo('places'); // (tools/qa/map-shots.mjs)
    this.chips = [...this.body.querySelectorAll('.mp-chip')];
    q('.mp-chips').addEventListener('click', e => { const b = e.target.closest('.mp-chip'); if (b) this.toggleLayer(b.dataset.l); });
    this.paintChips();
    q('.mp-zin').addEventListener('click', () => this.zoomBy(1.4));
    q('.mp-zout').addEventListener('click', () => this.zoomBy(1 / 1.4));
    q('.mp-me').addEventListener('click', () => this.centreOnYou());
    const cv = this.cv;
    cv.addEventListener('wheel', e => { e.preventDefault(); const [x, y] = this.local(e); this.zoomBy(e.deltaY > 0 ? 1 / 1.15 : 1.15, x, y); }, { passive: false });
    cv.addEventListener('dblclick', e => { const [x, y] = this.local(e); this.zoomBy(1.6, x, y); });
    cv.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      try { cv.setPointerCapture(e.pointerId); } catch (x) { /* */ }
      const [x, y] = this.local(e);
      this.ptrs.set(e.pointerId, { x, y, x0: x, y0: y });
      this.moved = this.ptrs.size > 1 ? true : 0;
      if (this.ptrs.size === 2) { const [a, b] = [...this.ptrs.values()]; this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, span: this.view?.span || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; }
    });
    cv.addEventListener('pointermove', e => {
      const [x, y] = this.local(e), p = this.ptrs.get(e.pointerId);
      if (!p) { if (e.pointerType === 'mouse') this.hoverAt(x, y, e); return; }
      const dx = x - p.x, dy = y - p.y; p.x = x; p.y = y;
      if (this.ptrs.size >= 2 && this.pinch) {
        const [a, b] = [...this.ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y) || 1, mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        this.panBy(mx - this.pinch.mx, my - this.pinch.my); this.pinch.mx = mx; this.pinch.my = my;
        this.setSpan(this.pinch.span * this.pinch.d / d, mx, my); return;
      }
      if (this.moved !== true && Math.hypot(x - p.x0, y - p.y0) > 5) { this.moved = true; this.frame.classList.add('grab'); this.ui.tip.hide(cv); }
      if (this.moved === true) this.panBy(dx, dy);
    });
    const up = e => {
      const p = this.ptrs.get(e.pointerId); if (!p) return;
      this.ptrs.delete(e.pointerId); if (this.ptrs.size < 2) this.pinch = null;
      if (!this.ptrs.size) { this.frame.classList.remove('grab'); if (this.moved !== true && e.type === 'pointerup') this.tapAt(p.x, p.y); this.moved = 0; }
    };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') { this.hover = null; this.ui.tip.hide(cv); } });
  }
  get G() { return this.ui.G; }
  /** the filter chips: a layer on or off on both maps (Settings' mapLayers) */
  toggleLayer(k) {
    const L = { ...(this.ui.settings.mapLayers || {}) }; L[k] = L[k] === false; this.ui.setSetting('mapLayers', L);
    this.paintChips(); this.dirty = true; this.ui.minimap.redraw(); this.ui.sfx?.('tick');
  }
  /** the chips: on or off (Settings' mapLayers), greyed and disabled where this map has nothing of their kind */
  paintChips() {
    const L = this.ui.settings.mapLayers || {}, n = this.provider()?.layerCounts || null;
    for (const b of this.chips || []) {
      const on = L[b.dataset.l] !== false, none = !!n && !n[b.dataset.l];
      b.classList.toggle('on', on); b.setAttribute('aria-pressed', on);
      if (b.disabled !== none) { b.disabled = none; b.classList.toggle('none', none); b.title = none ? `${b.textContent.trim()}: nothing on this map` : `Show or hide: ${b.textContent.trim()}`; }
    }
  }
  provider() { return this.ui.hud?.mm?.provider || null; }
  /** the People list's heading for the area's own people (a zone's village, the room, the floor) */
  areaName() { return this.provider()?.areaName?.() || 'Here'; }
  /** a provider that takes a view (pan and zoom): the village's; the zones', dungeons' and rooms' still zoom only */
  pans() { return !!this.provider()?.views; }
  /** the people and places (the village provider's cache, else this panel's own) */
  lists() {
    const P = this.provider(); if (P?.lists) return P.lists();
    const now = performance.now();
    if (!this._L || now - this._LT > 250) { try { this._L = { people: people(this.G), places: places(this.G) }; } catch (e) { this._L = { people: [], places: [] }; } this._LT = now; }
    return this._L;
  }
  entry(key) { if (!key) return null; const L = this.lists(); return L.people.find(e => e.key === key) || L.places.find(e => e.key === key) || null; }
  size() { return Math.max(200, Math.round(this.frame?.clientWidth || 560)); }
  local(e) { const r = this.cv.getBoundingClientRect(), s = this.size() / (r.width || 1); return [(e.clientX - r.left) * s, (e.clientY - r.top) * s]; }
  // ---- the view (world centre, metres across) and the zoom the pad and the QA read (1 = the whole island)
  homeSpan() { return this.provider()?.homeView?.().span || 224; }
  get zoom() { return this.pans() ? this.homeSpan() / (this.view?.span || this.homeSpan()) : this._zoom || 1; }
  set zoom(z) { if (this.pans()) this.setSpan(this.homeSpan() / z); else this._zoom = Math.max(0.5, Math.min(3, z)); }
  rot() { const P = this.provider(); return P?.rot ? P.rot() : mapRot(this.G.engine.rig.yaw); }
  /** the farthest out: 0.8, or a fitted view's own (fitFree) */
  zMin() { return Math.min(ZMIN, this._zFit || ZMIN); }
  /** screen (canvas CSS px) ⇄ world */
  toWorld(sx, sy) { const v = this.view, n = this.size(), k = n / v.span, r = this.rot(), c = Math.cos(r), s = Math.sin(r), dx = (sx - n / 2) / k, dy = (sy - n / 2) / k; return [v.cx + dx * c + dy * s, v.cz - dx * s + dy * c]; }
  clampView() {
    const v = this.view, b = this.provider()?.bounds?.() || { x0: 0, z0: 0, x1: 224, z1: 224 }, hs = this.homeSpan();
    v.span = Math.max(hs / ZMAX, Math.min(hs / this.zMin(), v.span));
    const m = v.span * 0.3, fit = (c, a0, a1) => { const lo = a0 + v.span / 2 - m, hi = a1 - v.span / 2 + m; return lo > hi ? (a0 + a1) / 2 : Math.max(lo, Math.min(hi, c)); };
    v.cx = fit(v.cx, b.x0, b.x1); v.cz = fit(v.cz, b.z0, b.z1);
  }
  /** a new span, keeping the world spot under (sx, sy) where it is (the middle when none) */
  setSpan(span, sx = null, sy = null) {
    if (!this.pans()) { this._zoom = Math.max(0.5, Math.min(3, this.homeSpan() / span)); this.dirty = true; return; }
    const v = this.view; if (!v) return;
    const hs = this.homeSpan(), ns = Math.max(hs / ZMAX, Math.min(hs / this.zMin(), span)), [wx, wz] = sx == null ? [v.cx, v.cz] : this.toWorld(sx, sy), f = ns / v.span;
    v.cx = wx + (v.cx - wx) * f; v.cz = wz + (v.cz - wz) * f; v.span = ns; this.clampView();
    this.dirty = true;
  }
  zoomBy(f, sx = null, sy = null) { if (!this.pans()) { this._zoom = Math.max(0.5, Math.min(3, (this._zoom || 1) * f)); this.dirty = true; return; } this.setSpan((this.view?.span || this.homeSpan()) / f, sx, sy); }
  panBy(dx, dy) {
    if (!this.pans() || !this.view) return;
    const v = this.view, k = this.size() / v.span, r = this.rot(), c = Math.cos(r), s = Math.sin(r);
    v.cx -= (dx * c + dy * s) / k; v.cz -= (-dx * s + dy * c) / k; this.clampView(); this.dirty = true;
  }
  /** glide the view to a spot (the pick's centring, Back to you) */
  glideTo(x, z, span = null) { this.glide = { x, z, span: span ?? this.view.span, t: 0 }; this.dirty = true; }
  centreOnYou() { const p = this.G.player?.pos; if (!p || !this.pans()) return; this.glideTo(p.x, p.z, Math.min(this.view.span, this.homeSpan() / 2.4)); this.ui.sfx?.('tick'); }
  centreOn(key, zoomIn = false) {
    const e = this.entry(key); if (!e?.pos || !this.pans()) return false;
    if (e.kind === 'person' && !e.visible && !e.you && !e.shadow && !e.npc) return false;
    const p = e.kind === 'person' && e.npc && e.npc.visible === false ? (e.npc.homeRec?.door || e.pos) : e.pos;
    if (this.G.mode !== 'village' && this.G.mode !== 'interior' && e.kind) { /* (another area's: nothing to centre on here) */ }
    this.glideTo(p.x, p.z, zoomIn ? Math.min(this.view.span, this.homeSpan() / 3) : Math.min(this.view.span, this.homeSpan() / 1.8));
    return true;
  }
  /** pick a person or place: the map centres on them, their mark pulses, and (pin) they're pinned */
  select(key, { pin = false, centre = true } = {}) {
    const e = this.entry(key); if (!e) return;
    this.sel = key;
    if (centre && this.G.mode === 'village') this.centreOn(key);
    if (pin && !e.you && !e.shadow && !e.away && this.G.mapPin) { this.G.mapPin.set(e); this.ui.sfx?.('select'); }
    this.dir.render(true); this.dirty = true;
  }
  /** "Shadow, take me there": pinned, and he leads the way (the map closes so you can follow him) */
  takeMeThere() {
    const e = this.entry(this.sel); if (!e) return;
    const G = this.G; if (!G.mapPin?.is(e.key)) G.mapPin?.set(e);
    const ok = G.mapPin?.lead?.();
    this.ui.sfx?.('click');
    if (ok) this.ui.close('map'); else this.dir.render(true);
  }
  hitAt(x, y) {
    const P = this.provider(), H = (P?.bigHits || P?.hits) || []; let best = null, bd = 1e9; // (the big map's own marks: the disc keeps its own)
    for (const h of H) { if (!h.e) continue; const d = Math.hypot(h.x - x, h.y - y); if (d < h.r + 4 && d < bd) { bd = d; best = h; } }
    return best;
  }
  hoverAt(x, y, ev) {
    const h = this.hitAt(x, y), key = h?.e?.key || null;
    if (key !== this.hover) { this.hover = key; this.dirty = true; }
    this.frame.classList.toggle('over', !!h);
    if (!h) { this.ui.tip.hide(this.cv); return; }
    const t = tipFor(this.G, h.e, this.lists().places); if (!t) return;
    if (ev) { this.ui.tip.x = ev.clientX; this.ui.tip.y = ev.clientY; }
    this.ui.tip.show(simpleTip(esc(t.title), t.text), 'tt-map', this.cv);
  }
  tapAt(x, y) {
    const h = this.hitAt(x, y);
    if (h?.e?.key) { this.select(h.e.key, { pin: true, centre: false }); if (h.e.kind === 'person') this.dir.tab = 'people'; else if (h.e.kind === 'place') this.dir.tab = 'places'; this.dir.render(true); this.scrollToSel(); }
    else if (h?.e && Actions.device === 'touch') { const t = tipFor(this.G, h.e, this.lists().places); if (t) this.ui.toast?.(`${t.title}`, { icon: 'pin' }); }
  }
  scrollToSel() { const r = this.dir.$.list.querySelector('.mp-row.sel'); try { r?.scrollIntoView({ block: 'nearest' }); } catch (e) { /* */ } }
  /** a fitted home view (a floor's: what you've seen) moved into the part of the map the zoom buttons (left) and the
   *  chips (the foot) leave free, so nothing seen sits under them (a phone's buttons take a fifth of its map) */
  fitFree(size) {
    const c = this.cv.getBoundingClientRect(), z = this.cv.offsetWidth ? c.width / this.cv.offsetWidth : 1, q = s => this.body.querySelector(s)?.getBoundingClientRect();
    const ctl = q('.mp-ctl'), chips = q('.mp-chips');
    const L = ctl?.width ? Math.max(0, (ctl.right - c.left) / z) : 0, B = chips?.width ? Math.max(0, (c.bottom - chips.top) / z) : 0;
    const fw = size - L - 4, fh = size - B - 4; if (fw < size * 0.5 || fh < size * 0.5) return;
    const v = this.view; v.span *= size / Math.min(fw, fh); this._zFit = this.homeSpan() / v.span;
    const k = size / v.span, ox = L / 2, oy = -B / 2, r = this.rot(), cs = Math.cos(r), sn = Math.sin(r);
    v.cx -= (ox * cs + oy * sn) / k; v.cz -= (-ox * sn + oy * cs) / k;
  }
  // ---- open, render, draw
  onOpen() {
    const ak = this.G?.mode === 'dungeon' ? `d:${this.G.dungeon?.def?.id || this.G.dungeon?.region?.id || ''}:${this.G.dungeon?.floor ?? ''}` : this.G?.mode || '';
    if (ak !== this.areaKey || !this.view) { this.areaKey = ak; const h = this.provider()?.homeView?.(); this.view = h ? { cx: h.cx, cz: h.cz, span: h.span } : { cx: 112, cz: 112, span: 224 }; this._zoom = 1; this.sel = null; this.hover = null; this._fit = !!this.provider()?.fitFree; this._zFit = 0; }
    if (this.G?.mapPin?.cur && !this.sel) this.sel = this.G.mapPin.cur.key;
    const f = this.opts?.focus;
    if (f && this.entry(f)) { this.sel = f; this.centreOn(f, true); const e = this.entry(f); this.dir.tab = e.kind === 'place' ? 'places' : 'people'; }
    this.acc = 0; this.listAcc = 0; this.dir.render(true); this.draw(); this.paintChips(); this.scrollToSel();
  }
  onClose() { this.ui.tip.hide(this.cv); this.glide = null; this.ptrs.clear(); this.pinch = null; }
  keyMode() { const dun = this.ui.mode === 'dungeon', region = dun && !!this.G?.dungeon?.isRegion; return region ? 'region' : this.ui.mode; }
  legendRows() { const m = this.keyMode(); return m === 'village' ? KEY_VILLAGE : m === 'region' ? KEY_REGION : m === 'dungeon' ? KEY_DUNGEON : KEY_HOME; }
  render() {
    const dun = this.ui.mode === 'dungeon', home = this.ui.mode === 'interior';
    const loc = this.ui.hud?.cache.loc;
    this.body.querySelector('.mp-name').textContent = dun ? (loc?.name || this.G?.dungeon?.def?.name || 'Down below') : home ? (loc?.name || 'Home') : 'Blossom Hollow'; // (the floor's name from its mode: the HUD's, else its dungeon's)
    this.frame.classList.toggle('pans', this.pans());
    this.dir?.render(true);
  }
  /** the pad on the map (ui/padNav.js, while the map is the top panel): LS moves the map under the crosshair, which
   *  snaps to the mark nearest it; A there pins it (once the stick has moved the map); LT / RT and RS zoom; R3 back to you */
  padFrame(dt, A) {
    const z = (A.padDown('RT') ? 1 : 0) - (A.padDown('LT') ? 1 : 0) + A.aim().y;
    if (Math.abs(z) > 0.1) this.zoomBy(1 + z * dt * 1.6);
    const lx = A.axes[0] || 0, ly = A.axes[1] || 0, m = Math.hypot(lx, ly);
    if (m > 0.18 && this.pans()) { const s = Math.min(1, (m - 0.18) / 0.72), sp = 340 * s * s * dt; this.panBy(-lx / m * sp, -ly / m * sp); this.stickT = performance.now(); this.glide = null; }
    if (A.padHit('R3')) { A.padConsume('R3'); this.centreOnYou(); }
    if (A.dnav) this.stickT = -1e9; // (the D-pad: the focus is the list's again, so is A)
    // the crosshair: the mark nearest the map's middle
    const n = this.size(), mid = this.hitAt(n / 2, n / 2), recent = performance.now() - (this.stickT || -1e9) < 2500;
    this.frame.classList.toggle('aiming', recent);
    if (recent) {
      const key = mid?.e?.key || null;
      if (key !== this.hover) { this.hover = key; this.dirty = true; if (mid) { const r = this.cv.getBoundingClientRect(); this.ui.tip.x = r.left + r.width / 2; this.ui.tip.y = r.top + r.height / 2; const t = tipFor(this.G, mid.e, this.lists().places); if (t) this.ui.tip.show(simpleTip(esc(t.title), t.text), 'tt-map', this.cv); } else this.ui.tip.hide(this.cv); }
      if (key && A.padHit('A')) { A.padConsume('A'); this.select(key, { pin: true, centre: false }); this.dir.tab = mid.e.kind === 'place' ? 'places' : 'people'; this.dir.render(true); this.scrollToSel(); return true; }
    }
    if (recent && A.padHit('Y') && this.sel && this.entry(this.sel)) { A.padConsume('Y'); this.takeMeThere(); return true; } // (else Y is the focused row's: ui/padNav.js)
    return false;
  }
  padHints() { return this.pans() ? [['LS', 'Move'], ['LT+RT', 'Zoom'], ['R3', 'To you']] : [['LT+RT', 'Zoom']]; }
  update(dt) {
    if (!this.isOpen) return;
    if (this.glide && this.view) { // (an eased glide to a pick)
      const g = this.glide, v = this.view, k = 1 - Math.exp(-dt * 9); g.t += dt;
      v.cx += (g.x - v.cx) * k; v.cz += (g.z - v.cz) * k; v.span += (g.span - v.span) * k; this.clampView();
      if (g.t > 1.2 || (Math.hypot(g.x - v.cx, g.z - v.cz) < 0.05 && Math.abs(g.span - v.span) < 0.05)) this.glide = null;
      this.dirty = true;
    }
    this.acc = (this.acc || 0) + dt; this.listAcc = (this.listAcc || 0) + dt;
    if (this.dirty || this.acc > 1 / 20) { this.acc = 0; this.dirty = false; this.draw(); }
    if (this.listAcc > 0.5) { this.listAcc = 0; this.dir.render(false); this.paintChips(); }
  }
  draw() {
    const cv = this.cv, size = this.size(), dpr = Math.min(2.5, (devicePixelRatio || 1) * (cv.currentCSSZoom || 1)); // (the UI's zoom too: sharp on the Deck)
    if (cv.width !== Math.round(size * dpr)) { cv.width = cv.height = Math.round(size * dpr); }
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, size, size);
    const pp = this.ui.hud.playerPos();
    const P = this.provider(), t = this.G?.engine?.time ?? performance.now() / 1000;
    if (this._fit && this.view) { this._fit = false; this.fitFree(size); }
    g.save();
    try {
      if (P?.views && this.view) P.drawMap(g, size, { ...this.view, rot: this.rot() }, { big: true, time: t, sel: this.sel, hover: this.hover });
      else if (P?.drawBig) P.drawBig(g, size, pp, { zoom: this.zoom });
      else if (P?.draw) P.draw(g, size, pp, { big: true, zoom: this.zoom });
      else drawPlaceholderMap(g, size, pp, this.ui.mode);
    } catch (e) { if (!this._err) { this._err = 1; console.warn('[ui] map provider', e); } }
    g.restore();
    if (!P?.ownHud) { // (the old providers: the pink arrow in the middle)
      const facing = this.G?.player?.facing ?? 0;
      g.save(); g.translate(size / 2, size / 2);
      const pulse = 1 + Math.sin(performance.now() / 250) * 0.15;
      g.fillStyle = 'rgba(255,143,176,.25)'; g.beginPath(); g.arc(0, 0, 18 * pulse, 0, Math.PI * 2); g.fill();
      g.rotate(Math.PI - facing);
      g.beginPath(); g.moveTo(0, -12); g.lineTo(9, 9); g.lineTo(0, 4.5); g.lineTo(-9, 9); g.closePath();
      g.fillStyle = '#ff5c8a'; g.strokeStyle = '#fff'; g.lineWidth = 4; g.lineJoin = 'round'; g.stroke(); g.fill();
      g.strokeStyle = '#4a2c2a'; g.lineWidth = 1.6; g.stroke();
      g.restore();
    }
    // the compass: north where it is (the map turns with the camera)
    const turns = P?.ownHud ? !this.ui.settings.mmNorth : true, a = turns ? (P?.rot ? P.rot() : mapRot(this.G.engine.rig.yaw)) : 0;
    if (this.rose && Math.abs((this._roseA ?? 99) - a) > 0.003) { this._roseA = a; this.rose.style.setProperty('--rot', `${(a * 180 / Math.PI).toFixed(1)}deg`); }
  }
  /** QA (tools/qa/map-shots.mjs): pick Rosie (or the first with something for you), or Rosie's Treats */
  demo(tab) {
    this.dir.tab = tab;
    const L = this.lists();
    const e = tab === 'people' ? (L.people.find(p => p.id === 'rosie') || L.people.find(p => p.visible && !p.you && !p.shadow)) : (L.places.find(p => p.id === 'rosieShop') || L.places[0]);
    if (!e) return false;
    this.select(e.key, { pin: true, centre: true }); this.scrollToSel();
    return true;
  }
}

export class QuestPanel extends Panel {
  constructor(ui) { super(ui, { name: 'quests', title: 'Journal', side: 'left', cls: 'p-quests', icon: 'book' }); this.sel = null; this.tab = 'active'; }
  init() {
    this.body.innerHTML = `<div class="tabs q-tabs"><button class="tab on" data-t="active">${glyph('scroll')}Active <b class="tab-n">0</b></button><button class="tab" data-t="done">${glyph('check')}Done <b class="tab-n">0</b></button><button class="tab fl-tab" data-t="fish" style="--tc:#6ab8ff"><img class="pt-ti" src="${pantryIcon('koi')}" alt="">Fish Log <b class="tab-n">0</b></button><button class="tab cl-tab" data-t="crews" style="--tc:#8fc0f0">${cozyIcon('pack')}Crews <b class="tab-n">0</b></button><button class="tab gd-tab" data-t="guides" style="--tc:#c3b3ff">${glyph('book')}Guides</button></div>
      <div class="q-wrap"><div class="q-list"></div><div class="q-detail"></div></div>`;
    this.$ = { list: this.body.querySelector('.q-list'), det: this.body.querySelector('.q-detail'), wrap: this.body.querySelector('.q-wrap') };
    this.fish = new FishLogView(this.ui); this.body.appendChild(this.fish.root); // (docs/HOMESTEAD.md)
    this.guides = new GuidesView(this.ui); this.body.appendChild(this.guides.root); // (replay the tutorials: docs/TUTORIALS.md)
    this.crews = new CrewLogView(this.ui); this.body.appendChild(this.crews.root); // (the expeditions' log: docs/COZY.md §10)
    this.body.querySelector('.q-tabs').addEventListener('click', e => { const t = e.target.closest('.tab'); if (t) { if (t.dataset.t !== this.tab) this.ui.sfx?.('tab'); this.tab = t.dataset.t; this.sel = null; this._sig = null; this.render(); } });
    this.$.list.addEventListener('click', e => { const q = e.target.closest('.q-item'); if (q) { this.sel = q.dataset.id; this._sig = null; this.render(); this.ui.sfx?.('tab'); } });
    // Follow Shadow: he leads the way to this quest's objective (again: he stops; actors/shadowLead.js, ROADMAP R-17)
    this.$.det.addEventListener('click', e => { const b = e.target.closest('.qd-lead'); if (!b || b.disabled) return; const L = this.ui.G?.lead; if (!L) return; const on = L.toggle(b.dataset.q); this.ui.sfx?.('click'); this._sig = null; if (on) this.ui.close?.('quests'); else this.render(); });
  }
  onOpen() { if (this.opts?.tab) { this.tab = this.opts.tab; this._sig = null; this.render(); } }
  render() {
    const all = this.ui.questList(true);
    const act = all.filter(q => !q.done), done = all.filter(q => q.done);
    const tabs = this.body.querySelectorAll('.q-tabs .tab');
    for (const t of tabs) t.classList.toggle('on', t.dataset.t === this.tab);
    tabs[0].querySelector('.tab-n').textContent = act.length; tabs[1].querySelector('.tab-n').textContent = done.length;
    tabs[2].querySelector('.tab-n').textContent = Object.keys(this.st.fishLog || {}).length;
    tabs[3].querySelector('.tab-n').textContent = this.crews.count();
    this.$.wrap.style.display = ['fish', 'guides', 'crews'].includes(this.tab) ? 'none' : ''; this.fish.root.style.display = this.tab === 'fish' ? '' : 'none'; this.guides.root.style.display = this.tab === 'guides' ? '' : 'none'; this.crews.root.style.display = this.tab === 'crews' ? '' : 'none';
    if (this.tab === 'fish') { this.fish.render(); return; }
    if (this.tab === 'guides') { this.guides._sig = null; this.guides.render(); return; }
    if (this.tab === 'crews') { this.crews.render(); return; }
    const list = this.tab === 'active' ? act : done;
    if (!this.sel || !list.find(q => q.id === this.sel)) this.sel = list[0]?.id || null;
    const L = this.ui.G?.lead, leadQ = L?.active && L.intent ? L.intent.t.quest : null; // (Follow Shadow: this quest's objective here, and is he on it)
    const can = this.tab === 'active' && this.sel && !!this.ui.G?.story?.target?.(this.sel) && this.ui.G?.mode !== 'interior';
    const sig = this.tab + this.sel + JSON.stringify(list) + can + leadQ;
    if (sig === this._sig) return; this._sig = sig;
    // the list is rebuilt (and its items' entrance plays) only when the quests or the tab change; picking another quest
    // just moves the highlight
    const listSig = this.tab + JSON.stringify(list);
    if (listSig !== this._listSig) {
      this._listSig = listSig;
      this.$.list.innerHTML = list.map((q, i) => {
        const n = q.objectives.length, k = q.objectives.filter(o => o.done).length;
        return `<div class="q-item ${q.id === this.sel ? 'on' : ''} ${q.done ? 'done' : ''}" data-id="${esc(q.id)}" style="--i:${i}"><div class="qi-ic">${glyph(q.done ? 'check' : q.main ? 'star' : 'scroll')}</div><div class="qi-t"><b>${esc(q.name)}</b><span>${q.giver ? esc(q.giver) + ' · ' : ''}${k}/${n}</span></div></div>`;
      }).join('') || `<div class="bd-empty">${glyph('sakura')}${this.tab === 'active' ? 'No quests yet — talk to villagers!' : 'Nothing finished yet.'}</div>`;
    } else for (const el of this.$.list.querySelectorAll('.q-item')) el.classList.toggle('on', el.dataset.id === this.sel);
    const q = list.find(x => x.id === this.sel);
    this.$.det.innerHTML = q ? `<div class="qd-h"><div class="qd-n">${esc(q.name)}</div>${q.giver ? `<div class="qd-g">from <b>${esc(q.giver)}</b></div>` : ''}</div>
      ${q.desc ? `<div class="qd-desc">${esc(q.desc)}</div>` : ''}
      <div class="qd-objs">${q.objectives.map(o => `<div class="qo ${o.done ? 'done' : ''}"><i class="qo-box">${o.done ? glyph('check') : ''}</i><span class="qo-t">${esc(o.text)}</span>${o.need > 1 ? `<span class="qo-bar"><i style="width:${Math.min(100, (o.have / o.need) * 100)}%"></i></span><span class="qo-n">${Math.min(o.have, o.need)}/${o.need}</span>` : ''}</div>`).join('')}</div>
      ${q.rewards ? `<div class="qd-rw"><span class="qd-rh">Rewards</span>${q.rewards}</div>` : ''}
      ${!q.done && L ? `<button class="btn sm qd-lead${leadQ === q.id ? ' on' : ''}" data-q="${esc(q.id)}"${can || leadQ === q.id ? '' : ' disabled title="Nothing to lead to from here"'}>${glyph('paw')}${leadQ === q.id ? 'Shadow is leading · stop' : 'Follow Shadow'}</button>` : ''}` : `<div class="qd-empty">${glyph('book')}</div>`;
  }
}

// Normalise whatever shape quests arrive in → [{id,name,desc,giver,objectives:[{text,have,need,done}],done,rewards}]
export function normQuest(q, done) {
  if (!q) return null;
  if (typeof q === 'string') return { id: q, name: q.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()), objectives: [], done };
  const raw = q.objectives || q.steps || q.goals || q.tasks || [];
  let objectives = raw.map(o => (typeof o === 'string' ? { text: o, have: 0, need: 1, done: false } : {
    text: o.text || o.desc || o.name || '', have: +(o.have ?? o.cur ?? o.count ?? o.progress ?? (o.done ? 1 : 0)) || 0,
    need: +(o.need ?? o.goal ?? o.n ?? o.target ?? o.max ?? 1) || 1, done: !!(o.done ?? o.complete),
  }));
  objectives = objectives.map(o => ({ ...o, done: o.done || o.have >= o.need && o.need > 0 && (o.have > 0) }));
  if (!objectives.length && (q.goal || q.need)) objectives = [{ text: q.text || q.desc || '', have: +(q.progress ?? q.have ?? 0), need: +(q.goal ?? q.need), done: !!q.done }];
  const r = q.rewards || q.reward;
  let rewards = '';
  if (r) {
    if (typeof r === 'string') rewards = `<span>${esc(r)}</span>`;
    else rewards = [r.coins ? `<span>${glyph('coin')}${fmt(r.coins)}</span>` : '', r.xp ? `<span class="rw-xp">✦ ${fmt(r.xp)} XP</span>` : '', r.item ? `<span>${glyph('gift')}${esc(r.item.name || r.item)}</span>` : '', r.text ? `<span>${esc(r.text)}</span>` : ''].join('');
  }
  return { id: String(q.id ?? q.name ?? q.title), name: q.name || q.title || q.id, desc: q.desc || q.description || '', giver: q.giver || q.from || '', main: !!q.main, objectives, done: !!(done || q.done || q.complete), rewards };
}
