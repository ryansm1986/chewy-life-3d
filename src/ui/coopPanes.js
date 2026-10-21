// Couch co-op's shared bag panes (docs/COOP.md §5): each player's own window on their hero (the paper doll, the stats,
// the skills) and the SHARED bag, driven by their own controller with a cursor in their colour. Several can be open at
// once: they share the screen (one: a centred card; two: the halves; three or four: the quadrants, by player), glide to
// their new places when one opens or closes (FLIP), and are drawn at a fixed design size and scaled to their region
// (CSS zoom: the text stays crisp), with a compact landscape layout ('wide') for the quadrants and a tall one otherwise.
//
// The core (coop/coop.js) owns when a pane may open and what it does to the game: s.pane (the tab's name while open)
// freezes that hero, monsters ignore them, and everyone in their bag in a fight pauses it. It calls C.panes.input(s) each
// frame inside that player's context, so G.actions / G.state.player / .equipment are their hero's; everything here that
// changes the game runs through C.with(s, …) for the same reason. Rendering happens outside any context (its own rAF) and
// reads each pane's hero with C.with as well. Player 1 opens theirs from ui.js (the pad's Menu, I / C / K) and also drives
// it with the keyboard and the mouse.
//
// Layout geometry is explicit: every section of a pane sits at design coordinates from LAYOUT (set inline from here, CSS
// only paints), so the cursor, the footprint, the other players' markers and the tooltip are placed from the same
// numbers, without measuring mid-animation.
import './coopPanes.css';
import { Events } from '../core/events.js';
import { Actions } from '../core/actions.js';
import { Input } from '../core/input.js';
import { el, esc, fmt, setText, replay, rarityColor } from './dom.js';
import { glyph } from './glyphs.js';
import { padGlyph } from './padGlyphs.js';
import { portrait } from './portraits.js';
import { EQUIP_SLOTS, makeSlot, paintSlot, layoutGrid } from './inventory.js';
import { itemTipHTML } from './tooltip.js';
import { itemIconURL, itemIconSizedURL, itemName, equipSlotsFor, xpProgress, treesFor, treeInfo, skillList, skillDef, skillIconURL, hotbarIconURL, skillInfoLines, canLearnSkill, skillTraining, effLevel } from './rpg.js';
import { bagGrid, cover, fitsAt, itemSize, BAG_W, BAG_H } from '../rpg/grid.js';
import { CLASSES, WEAPON_CLASS } from '../rpg/classes.js';
import { targetSlot } from '../rpg/items.js';
import { statSummary, attrFx, mainStat, autoOn } from '../rpg/power.js';
import { registerDebug } from '../debug/registry.js';

const TABS = ['bag', 'stats', 'skills'];
const TAB_NAME = { bag: 'Bag', stats: 'Stats', skills: 'Skills' };
const TAB_GLYPH = { bag: 'bag', stats: 'star', skills: 'sparkle' };
const STAT_KEYS = ['str', 'dex', 'vit', 'ene'];
const ATTR = {
  str: { n: 'Strength', g: 'swords', c: '#ff8f7a', fx: 'Katana damage, heavier gear' },
  dex: { n: 'Dexterity', g: 'ball', c: '#ffcf4a', fx: 'Throws and fūma, block, crits' },
  vit: { n: 'Vitality', g: 'heart', c: '#ff8fb0', fx: 'More Life and Life regen' },
  ene: { n: 'Energy', g: 'bolt', c: '#8fd0ff', fx: 'More Zoom, spell and jutsu damage' },
};
const HB_ACTS = ['attack', 'skillAlt', 'skill1', 'skill2', 'skill3', 'skill4'];
const SLOT_LABEL = { weapon: 'Weapon', weaponAlt: 'Second weapon', hat: 'Hat', outfit: 'Outfit', collar: 'Collar', charm1: 'Charm', charm2: 'Charm', boots: 'Boots', paws: 'Paws' };
const RARE = new Set(['rare', 'unique', 'set']);
const KB_TOK = { A: 'Enter', B: 'Esc', X: 'X', Y: 'R', LB: 'Q', RB: 'E', View: 'Esc' };

// ------------------------------------------------------------------ the two layouts (design px)
// card: the pane's design size; top / body / foot: the header (with the tabs), the tab's view, the hint bar (in the
// card's padding box: inside its 4 px border). bag: the doll and the grid (in the body); doll: each equip slot [x, y, tall].
const LAYOUT = {
  tall: {
    w: 640, h: 860, cell: 52, gap: 6, gp: 8,
    top: { x: 14, y: 12, w: 604, h: 138 }, body: { x: 14, y: 162, w: 604, h: 632 }, foot: { x: 14, y: 804, w: 604, h: 40 },
    bag: { doll: { x: 7, y: 0, w: 590, h: 238 }, label: { x: 7, y: 248, w: 590, h: 22 }, grid: { x: 7, y: 274 }, sum: { x: 7, y: 528, w: 590, h: 42 } },
    dollSide: 'up', slot: 56, tallH: 108,
    doll: { weapon: [14, 22, 1], weaponAlt: [512, 22, 1], hat: [104, 10], collar: [104, 86], outfit: [104, 162], charm1: [430, 10], charm2: [430, 86], paws: [430, 162], boots: [267, 172] },
    stats: { banner: { x: 0, y: 0, w: 604, h: 46 }, attr: { x: 0, y: 58, w: 604, h: 56, step: 64 }, der: { x: 0, y: 330, w: 604, rowH: 34, cols: 2 } },
    skills: { colW: 194, colGap: 11, headH: 36, rowY: 44, rowH: 58, hb: { y: 470, h: 96, slot: 66 } },
    tipW: 330,
  },
  wide: {
    w: 720, h: 440, cell: 46, gap: 5, gp: 7,
    top: { x: 12, y: 10, w: 688, h: 58 }, body: { x: 12, y: 76, w: 688, h: 310 }, foot: { x: 12, y: 392, w: 688, h: 32 },
    bag: { doll: { x: 0, y: 25, w: 154, h: 207 }, label: { x: 169, y: 0, w: 519, h: 20 }, grid: { x: 169, y: 22 }, sum: { x: 0, y: 246, w: 688, h: 38 } },
    dollSide: 'left', slot: 48, tallH: 101,
    doll: { weapon: [0, 0, 1], weaponAlt: [0, 106, 1], hat: [53, 0], outfit: [53, 53], paws: [53, 106], boots: [53, 159], collar: [106, 0], charm1: [106, 53], charm2: [106, 106] },
    stats: { banner: { x: 0, y: 0, w: 330, h: 38 }, attr: { x: 0, y: 46, w: 330, h: 56, step: 64 }, der: { x: 346, y: 0, w: 342, rowH: 28, cols: 1 } },
    skills: { colW: 222, colGap: 11, headH: 28, rowY: 30, rowH: 31, hb: { y: 252, h: 56, slot: 46 } },
    tipW: 300,
  },
};
const gridW = L => BAG_W * L.cell + (BAG_W - 1) * L.gap + 2 * L.gp;
const gridH = L => BAG_H * L.cell + (BAG_H - 1) * L.gap + 2 * L.gp;

const now = () => performance.now();
const sfx = (id, vol = 0.7, pitch) => Events.emit('sfx', id, pitch ? { vol, pitch } : { vol });
const iconOf = it => { const [w, h] = itemSize(it); return w * h > 1 ? itemIconSizedURL(it, w, h) : itemIconURL(it); };

export function installCoopPanes(G, C) {
  if (!G?.ui?.root || C.panes?.mgr) return C.panes;
  const M = new CoopPanes(G, C);
  C.panes = { mgr: M, open: (s, tab) => M.open(s, tab), close: (s, silent) => M.close(s, silent), input: (s, rdt) => M.input(s, rdt), isOpen: s => M.isOpen(s), key: (k, act) => M.key(k, act), layout: () => M.layout(false) };
  return C.panes;
}

class CoopPanes {
  constructor(G, C) {
    this.G = G; this.C = C; this.ui = G.ui;
    this.panes = new Map(); // slot → pane
    this.fake = { G, seen: G.ui.seen }; // (paintSlot's ui: G.state / G.derived read inside each pane's context)
    const L = this.layer = el('div', 'layer l-coop');
    this.dim = el('div', 'cp-dim'); L.appendChild(this.dim);
    this.fx = el('div', 'cp-fx'); L.appendChild(this.fx);
    const hud = this.ui.layers?.hud; if (hud?.parentNode) hud.after(L); else this.ui.root.appendChild(L);
    this.raf = 0; this.ticks = new Set(); this.ver = 0;
    const dirty = () => this.dirtyAll();
    for (const ev of ['inv:changed', 'equip:changed', 'stats:changed', 'coins:changed', 'hotbar:changed', 'skill:learned', 'perk:learned', 'hero:switched', 'player:levelup', 'coop:levelup', 'input:device']) Events.on(ev, dirty);
    Events.on('mode:changed', p => { if ((p?.mode || p) === 'title') for (const s of [...this.panes.keys()]) this.close(s, true); });
    Events.on('coop:left', () => this.layout(true));
    addEventListener('resize', () => this.layout(false));
    registerDebug('coop', [
      { id: 'coopPanesAll', group: 'Couch co-op', label: "Open every player's bag pane", run: () => { for (const s of C.slots) this.open(s); return `${this.panes.size} panes open`; } },
      { id: 'coopPanesClose', group: 'Couch co-op', label: 'Close every bag pane', run: () => { for (const s of [...this.panes.keys()]) this.close(s); return 'Closed'; } },
    ]);
  }
  get L() { return LAYOUT; }
  isOpen(s) { const P = this.panes.get(s); return !!P && !P.closing; }
  dirtyAll() { this.ver++; for (const P of this.panes.values()) P.dirty = true; }
  ctx(P, fn) { return this.C.with(P.s, fn); }

  // ------------------------------------------------------------------ open / close
  open(s, tab) {
    const C = this.C, G = this.G;
    if (!s || s.gone || G.titleActive) return false;
    if (!C.active && !s.primary) return false;
    let P = this.panes.get(s);
    if (P && !P.closing) { if (tab && tab !== P.tab) this.setTab(P, tab); return true; }
    if (P) { P.anim?.cancel(); P.el.remove(); this.panes.delete(s); }
    if (s.primary) {
      const U = this.ui;
      U.drag?.cancel?.(); U.tip?.hide?.(); U.hidePopover?.();
      if (U.padMenu?.active) U.padMenu.close();
      for (const n of ['inventory', 'character', 'skills', 'quests', 'map']) if (U.isOpen(n)) U.close(n, true);
      const B = G.player; if (B) { B.paneOpen = true; B.moveTarget = null; B.interactTarget = null; }
    }
    P = this.build(s);
    P.tab = TABS.includes(tab) ? tab : 'bag';
    s.pane = P.tab;
    this.panes.set(s, P);
    // the cursor starts on the first thing in the bag
    const first = this.ctx(P, () => { const g = bagGrid(G.state); for (let i = 0; i < g.w * g.h; i++) if (g.cells[i]) return i; return 0; });
    P.cur = { z: 'grid', x: first % BAG_W, y: (first / BAG_W) | 0 };
    this.layout(true, P);
    sfx('ui_open', 0.75);
    C.inputOf(s).rumble?.(0.12, 0.25, 70);
    Events.emit('coop:pane', { n: s.n, open: true, tab: P.tab });
    this.loop();
    return true;
  }
  close(s, silent = false) {
    const P = this.panes.get(s); if (!P || P.closing) return false;
    P.closing = true; P.hold = null; P.assign = null; P.confirm = null;
    s.pane = null;
    if (P.body1) { P.body1.paneOpen = false; P.body1 = null; }
    this.hideTip(P);
    const to = this.originRect(P), from = P.el.getBoundingClientRect();
    P.anim?.cancel();
    const done = () => { P.el.remove(); if (this.panes.get(s) === P) this.panes.delete(s); this.syncDim(); };
    if (from.width > 2) {
      const sc = Math.min(to.width / from.width, to.height / from.height), dx = to.left + to.width / 2 - (from.left + from.width / 2), dy = to.top + to.height / 2 - (from.top + from.height / 2);
      P.el.style.pointerEvents = 'none';
      P.anim = P.el.animate([{ transform: 'none', opacity: 1 }, { transform: `translate(${dx}px,${dy}px) scale(${sc})`, opacity: 0 }], { duration: 240, easing: 'cubic-bezier(.5,0,.75,.2)', fill: 'forwards' });
      P.anim.onfinish = done;
    } else done();
    this.layout(true);
    if (!silent) sfx('ui_close', 0.7);
    Events.emit('coop:pane', { n: s.n, open: false });
    this.dirtyAll();
    return true;
  }
  /** player 1's keys (ui.js onKey, in co-op): Esc backs out, I / C / K go to a tab (the same one again closes). → handled */
  key(k, act) {
    const s = this.C.p1, P = this.panes.get(s), tab = act === 'inventory' ? 'bag' : act === 'character' ? 'stats' : act === 'skills' ? 'skills' : null;
    if (!P || P.closing) { if (tab) { this.open(s, tab); return true; } return false; }
    if (k === 'Escape') { this.back(P); return true; }
    if (tab) { if (tab === P.tab) this.close(s); else this.setTab(P, tab); return true; }
    return true; // (the pane has the keyboard: the arrows, Enter, R, X, Q / E are read in input())
  }
  /** B, Esc: a held item goes back, an assign or a confirm is let go, else the pane closes */
  back(P) {
    if (P.confirm) { P.confirm = null; P.dirty = true; sfx('ui_close', 0.5); return; }
    if (P.hold) { this.cancelHold(P); return; }
    if (P.assign) { P.assign = null; P.sk = P.assignFrom || P.sk; P.dirty = true; sfx('ui_close', 0.5); return; }
    this.close(P.s);
  }

  // ------------------------------------------------------------------ the DOM
  build(s) {
    const P = { s, n: s.n, kind: null, dirty: true, tab: 'bag', cur: { z: 'grid', x: 0, y: 0 }, st: { i: 0 }, sk: { z: 'tree', t: 0, r: 0 }, hold: null, assign: null, confirm: null, marks: new Map(), tipKey: null, tipVer: -1, hdrT: 0 };
    const e = P.el = el('div', 'cp-pane');
    e.dataset.n = s.n; e.style.setProperty('--pc', s.color);
    e.innerHTML = `<div class="cp-in"><div class="cp-card">
      <div class="cp-top">
        <div class="cp-head">
          <div class="cp-por"><div class="cp-por-in"></div><b class="cp-pn">P${s.n}</b></div>
          <div class="cp-id"><div class="cp-name"><span class="cp-hn"></span><span class="cp-lv">Lv <b></b></span></div><div class="cp-title"></div><div class="cp-xp"><i></i></div></div>
          <div class="cp-bars"><div class="cp-bar life"><i></i><span></span></div><div class="cp-bar zoom"><i></i><span></span></div></div>
          <div class="cp-wallet"><div class="cp-coins">${glyph('coin')}<b>0</b></div><div class="cp-share">shared</div></div>
        </div>
        <div class="cp-tabs">${TABS.map((t, i) => `<button class="cp-tab" data-t="${t}" style="--i:${i}">${glyph(TAB_GLYPH[t])}<span>${TAB_NAME[t]}</span><b class="cp-badge"></b></button>`).join('')}<i class="cp-ind"></i></div>
      </div>
      <div class="cp-body">
        <section class="cp-v cp-v-bag">
          <div class="cp-doll"><div class="cp-dpor"></div></div>
          <div class="cp-glabel">${glyph('bag')}<span>Shared bag</span><em>· the whole pack's</em></div>
          <div class="cp-grid"></div>
          <div class="cp-sum"></div>
        </section>
        <section class="cp-v cp-v-stats"><div class="cp-banner"></div><div class="cp-attrs"></div><div class="cp-der"></div></section>
        <section class="cp-v cp-v-skills"><div class="cp-trees"></div><div class="cp-hb"></div></section>
        <div class="cp-marks"></div>
        <div class="cp-fp"></div>
        <div class="cp-ghost"><img alt=""></div>
        <div class="cp-cur"><b>P${s.n}</b></div>
      </div>
      <div class="cp-foot"><div class="cp-hints"></div></div>
      <div class="cp-msg"></div>
      <div class="cp-confirm"><div class="cp-cbox"></div></div>
    </div><div class="tt cp-tt"></div></div>`;
    const q = sel => e.querySelector(sel);
    Object.assign(P, {
      in: q('.cp-in'), card: q('.cp-card'), top: q('.cp-top'), body: q('.cp-body'), foot: q('.cp-foot'), hints: q('.cp-hints'), msg: q('.cp-msg'), tt: q('.cp-tt'), confirmEl: q('.cp-confirm'),
      cursor: q('.cp-cur'), fp: q('.cp-fp'), ghost: q('.cp-ghost'), gimg: q('.cp-ghost img'), marksEl: q('.cp-marks'),
      views: { bag: q('.cp-v-bag'), stats: q('.cp-v-stats'), skills: q('.cp-v-skills') },
      dollEl: q('.cp-doll'), dpor: q('.cp-dpor'), gridEl: q('.cp-grid'), sumEl: q('.cp-sum'), glabel: q('.cp-glabel'),
      banner: q('.cp-banner'), attrsEl: q('.cp-attrs'), derEl: q('.cp-der'), treesEl: q('.cp-trees'), hbEl: q('.cp-hb'),
      $: { por: q('.cp-por-in'), hn: q('.cp-hn'), lv: q('.cp-lv b'), title: q('.cp-title'), xp: q('.cp-xp i'), life: q('.cp-bar.life i'), lifeT: q('.cp-bar.life span'), zoom: q('.cp-bar.zoom i'), zoomT: q('.cp-bar.zoom span'), coins: q('.cp-coins b'), tabs: q('.cp-tabs'), ind: q('.cp-ind') },
    });
    P.eq = {};
    for (const k of EQUIP_SLOTS) { const sl = makeSlot('equip', k, 'eq cp-eq'); P.dollEl.appendChild(sl); P.eq[k] = sl; }
    P.cells = [];
    for (let i = 0; i < BAG_W * BAG_H; i++) { const sl = makeSlot('inv', i, 'cp-c'); sl.style.setProperty('--i', i); P.gridEl.appendChild(sl); P.cells.push(sl); }
    P.attrs = STAT_KEYS.map((k, i) => {
      const a = ATTR[k], r = el('div', 'cp-attr'); r.dataset.k = k; r.dataset.i = i; r.style.setProperty('--ac', a.c);
      r.innerHTML = `<span class="cp-ag">${glyph(a.g)}</span><span class="cp-an"><b>${a.n}</b><small>${a.fx}</small></span><span class="cp-av"><b>0</b><small></small></span><span class="cp-plus">${glyph('plus')}</span>`;
      P.attrsEl.appendChild(r); return r;
    });
    if (s.primary) { P.body1 = this.G.player; this.bindMouse(P); }
    this.layer.appendChild(e);
    return P;
  }
  /** a layout's geometry onto the DOM: the sections, the doll's slots, the grid's cell size */
  applyKind(P, kind) {
    const L = LAYOUT[kind], put = (e, r) => { if (!e || !r) return; e.style.left = r.x + 'px'; e.style.top = r.y + 'px'; if (r.w != null) e.style.width = r.w + 'px'; if (r.h != null) e.style.height = r.h + 'px'; };
    P.kind = kind;
    P.el.classList.toggle('cp-tall', kind === 'tall'); P.el.classList.toggle('cp-wide', kind === 'wide');
    P.in.style.width = L.w + 'px'; P.in.style.height = L.h + 'px';
    put(P.top, L.top); put(P.body, L.body); put(P.foot, L.foot);
    put(P.dollEl, L.bag.doll); put(P.glabel, L.bag.label); put(P.gridEl, { ...L.bag.grid, w: gridW(L), h: gridH(L) }); put(P.sumEl, L.bag.sum);
    P.card.style.setProperty('--cell', L.cell + 'px'); P.card.style.setProperty('--gap', L.gap + 'px'); P.card.style.setProperty('--gp', L.gp + 'px');
    for (const k of EQUIP_SLOTS) { const [x, y, t] = L.doll[k], sl = P.eq[k]; put(sl, { x, y, w: L.slot, h: t ? L.tallH : L.slot }); sl.classList.toggle('tall', !!t); }
    const S = L.stats; put(P.banner, S.banner);
    P.attrs.forEach((r, i) => put(r, { x: S.attr.x, y: S.attr.y + i * S.attr.step, w: S.attr.w, h: S.attr.h }));
    put(P.derEl, { x: S.der.x, y: S.der.y, w: S.der.w });
    P.treeSig = ''; P.tipKey = null; P.dirty = true;
    for (const c of P.cells) c._sig = undefined;
    for (const k of EQUIP_SLOTS) P.eq[k]._sig = undefined;
  }

  // ------------------------------------------------------------------ the layout manager
  /** one pane: a centred card; two: the halves (in player order); three or four: the quadrants, each player's own by
   *  their number (P1 top left … P4 bottom right: a pane keeps its place as others open, close or leave) */
  layout(animate = true, fresh = null) {
    const list = [...this.panes.values()].filter(P => !P.closing).sort((a, b) => a.n - b.n), n = list.length;
    this.syncDim(n);
    if (!n) return;
    const W = innerWidth, H = innerHeight, deck = this.ui.root.classList.contains('deck-ui');
    const M = deck ? 8 : 12, GAP = deck ? 8 : 12;
    const cap = Math.max(0.7, (this.ui.scale || 1) * 1.3);
    const halfW = (W - 2 * M - GAP) / 2, halfH = (H - 2 * M - GAP) / 2;
    // three or four: the compact wide layout; one or two: the tall one, unless the screen is so short that it would come
    // out small and the wide one fits clearly bigger (a phone held sideways, a short laptop window)
    const fit = (L, w, h) => Math.min(w / L.w, h / L.h, cap), rw = n === 1 ? W - 2 * M : halfW, rh = H - 2 * M;
    const kind = n >= 3 ? 'wide' : fit(LAYOUT.tall, rw, rh) < 0.75 && fit(LAYOUT.wide, rw, rh) > fit(LAYOUT.tall, rw, rh) * 1.15 ? 'wide' : 'tall';
    list.forEach((P, i) => {
      let r;
      if (n === 1) r = { x: M, y: M, w: W - 2 * M, h: H - 2 * M };
      else if (n === 2) r = { x: M + i * (halfW + GAP), y: M, w: halfW, h: H - 2 * M };
      else { const q = Math.min(3, Math.max(0, P.n - 1)); r = { x: M + (q % 2) * (halfW + GAP), y: M + (q >> 1) * (halfH + GAP), w: halfW, h: halfH }; }
      const L = LAYOUT[kind], k = Math.min(r.w / L.w, r.h / L.h, cap), bw = L.w * k, bh = L.h * k;
      const to = { left: Math.round(r.x + (r.w - bw) / 2), top: Math.round(r.y + (r.h - bh) / 2), width: bw, height: bh };
      const placed = !!P.k, old = placed ? P.el.getBoundingClientRect() : null, kindChange = P.kind && P.kind !== kind;
      if (P.kind !== kind) this.applyKind(P, kind);
      if (P === fresh || kindChange) { this.hideTip(P); P.tipHold = now() + 430; } // (its tooltip waits for it to settle)
      P.k = k; P.in.style.zoom = k.toFixed(4);
      P.bounds = { x0: (r.x - to.left) / k, y0: (r.y - to.top) / k, x1: (r.x + r.w - to.left) / k, y1: (r.y + r.h - to.top) / k }; // (its region, for the tooltip)
      Object.assign(P.el.style, { left: to.left + 'px', top: to.top + 'px', width: bw + 'px', height: bh + 'px' });
      if (P === fresh) { this.render(P); this.grow(P, to); }
      else if (animate && old && old.width > 2 && (Math.abs(old.left - to.left) > 1 || Math.abs(old.top - to.top) > 1 || Math.abs(old.width - to.width) > 1)) {
        if (kindChange) this.render(P);
        this.flip(P, old, to, kindChange);
      }
    });
  }
  syncDim(n = [...this.panes.values()].filter(P => !P.closing).length) {
    this.dim.classList.toggle('on', n > 0);
    this.dim.dataset.n = n;
  }
  flip(P, from, to, uniform) {
    P.anim?.cancel();
    let sx = from.width / to.width, sy = from.height / to.height;
    if (uniform) sx = sy = Math.min(sx, sy);
    const dx = from.left + from.width / 2 - (to.left + to.width / 2), dy = from.top + from.height / 2 - (to.top + to.height / 2);
    P.anim = P.el.animate([{ transform: `translate(${dx}px,${dy}px) scale(${sx},${sy})` }, { transform: 'none' }], { duration: 290, easing: 'cubic-bezier(.2,.8,.2,1)' });
    if (uniform) for (const e of [P.top, P.body, P.foot]) e.animate([{ opacity: 0 }, { opacity: 0, offset: 0.2 }, { opacity: 1 }], { duration: 320, easing: 'ease-out' }); // (a new layout: the card glides, its contents fade back in on it)
  }
  /** a new pane grows out of its player's card (the HUD's, if it has one), else the bottom edge of its place */
  grow(P, to) {
    const o = this.originRect(P), sc = Math.max(0.08, Math.min(o.width / to.width, o.height / to.height));
    const dx = o.left + o.width / 2 - (to.left + to.width / 2), dy = o.top + o.height / 2 - (to.top + to.height / 2);
    P.anim?.cancel();
    const mid = `translate(${dx * 0.05}px,${dy * 0.05}px) scale(1.018)`;
    P.anim = P.el.animate([
      { transform: `translate(${dx}px,${dy}px) scale(${sc})`, opacity: 0, easing: 'cubic-bezier(.25,.75,.3,1)' },
      { transform: `translate(${dx * 0.8}px,${dy * 0.8}px) scale(${sc + (1 - sc) * 0.25})`, opacity: 1, offset: 0.12, easing: 'cubic-bezier(.2,.7,.25,1)' },
      { transform: mid, opacity: 1, offset: 0.74, easing: 'ease-in-out' },
      { transform: 'none', opacity: 1 },
    ], { duration: 400 });
    for (const e of [P.top, P.body, P.foot]) e.animate([{ opacity: 0 }, { opacity: 0, offset: 0.3 }, { opacity: 1 }], { duration: 400, easing: 'ease-out' }); // (the card first, its contents a beat after)
  }
  originRect(P) {
    const W = innerWidth, H = innerHeight, card = document.querySelector(`[data-coop-card="${P.n}"]`) || [...document.querySelectorAll('.coop-hud .ch-card')].find(c => c.querySelector('.ch-p')?.textContent === `P${P.n}`); // (ui/coopHud.js's player card)
    if (card) { const r = card.getBoundingClientRect(); if (r.width > 4 && r.height > 4) return r; }
    if (P.s.primary) { const o = this.ui.root.querySelector('.hud .orb'); if (o) { const r = o.getBoundingClientRect(); if (r.width > 4) return r; } }
    const q = Math.max(0, P.n - 1), x = q % 2 ? W * 0.78 : W * 0.22;
    return { left: x - 80, top: H - 70, width: 160, height: 60 };
  }

  // ------------------------------------------------------------------ the frame
  loop() { if (!this.raf) this.raf = requestAnimationFrame(() => this.tick()); }
  tick() {
    this.raf = 0;
    if (!this.panes.size) return;
    const t = now();
    if (!this.C.active) { const P = this.panes.get(this.C.p1); if (P && !P.closing) this.close(this.C.p1, true); }
    for (const P of this.panes.values()) {
      if (P.closing) continue;
      if (P.s.gone) { this.close(P.s, true); continue; }
      this.checkHold(P);
      if (P.tipWait && t >= P.tipWait.at) { const w = P.tipWait; P.tipWait = null; this.showTip(P, w.html, w.r); }
      if (P.dirty) { P.dirty = false; this.render(P); }
      else if (t - P.hdrT > 180) this.ctx(P, () => this.renderHead(P)); // (life and zoom regen: no events)
      else if (P.curDirty) this.ctx(P, () => this.renderFocus(P));
    }
    this.syncMarks();
    for (const f of this.ticks) f(t);
    this.loop();
  }
  /** a number counts up (or down) to its value */
  tickTo(e, v, fmtF = String) {
    if (!e) return;
    if (e._v == null) { e._v = v; e.textContent = fmtF(v); return; }
    if (e._to === v) return;
    e._from = e._v; e._to = v; e._t0 = now();
    if (e._fn) this.ticks.delete(e._fn);
    e._fn = t => { const k = Math.min(1, (t - e._t0) / 420), ease = 1 - Math.pow(1 - k, 3); e._v = Math.round(e._from + (e._to - e._from) * ease); setText(e, fmtF(e._v)); if (k >= 1) { this.ticks.delete(e._fn); e._fn = null; e._v = e._to; } };
    this.ticks.add(e._fn);
    replay(e, 'cp-tick', 420);
  }

  // ------------------------------------------------------------------ input (core: inside the slot's context, each frame)
  input(s, rdt) {
    const P = this.panes.get(s); if (!P || P.closing) return;
    const U = this.ui;
    if (U.dlg?.active || U.anyModal?.() || U.iris?.active || this.G.titleActive) return; // (a shared dialogue or menu is up: it answers first)
    const I = this.C.inputOf(s);
    const hit = t => { if (I.padHit(t)) { I.padConsume(t); return true; } return false; };
    const b = { A: hit('A'), B: hit('B'), X: hit('X'), Y: hit('Y'), LB: hit('LB'), RB: hit('RB'), View: hit('View'), Menu: hit('Menu') };
    let nav = I.nav;
    if (s.primary) { // the keyboard (Esc comes from ui.js key())
      const kh = k => { if (Input.hit(k)) { Input.consume(k); return true; } return false; };
      if (kh('enter') || kh('space')) b.A = true;
      if (kh('backspace')) b.B = true;
      if (kh('x') || kh('delete')) b.X = true;
      if (kh('r')) b.Y = true;
      if (kh('q')) b.LB = true;
      if (kh('e')) b.RB = true;
      nav = nav || this.kbNav(P, rdt);
    }
    if (nav || Object.values(b).some(Boolean)) P.active = now();
    if (P.confirm) {
      if (b.View || b.A) { this.leave(P); return; }
      if (b.B || b.Menu) { P.confirm = null; P.dirty = true; sfx('ui_close', 0.5); }
      return;
    }
    if (b.Menu) { if (P.hold) this.cancelHold(P, true); this.close(s); return; }
    if (b.View) { if (s.primary) this.gameMenu(P); else { P.confirm = { t: now() }; P.dirty = true; sfx('ui_open', 0.5); I.rumble?.(0.2, 0.3, 80); } return; }
    if (b.LB || b.RB) {
      if (P.hold || P.assign) { this.say(P, P.hold ? 'Put it down first' : 'Pick a hotbar slot first', 'bad'); sfx('ui_error', 0.5); }
      else this.setTab(P, (TABS.indexOf(P.tab) + (b.RB ? 1 : TABS.length - 1)) % TABS.length);
    }
    if (P.tab === 'bag') this.bagInput(P, nav, b, I);
    else if (P.tab === 'stats') this.statsInput(P, nav, b, I);
    else this.skillsInput(P, nav, b, I);
  }
  /** the arrows and WASD for player 1's keyboard, with a key repeat */
  kbNav(P, rdt) {
    const D = { up: ['up', 'w'], down: ['down', 's'], left: ['left', 'a'], right: ['right', 'd'] };
    for (const [d, ks] of Object.entries(D)) if (ks.some(k => Input.hit(k))) { ks.forEach(k => Input.consume(k)); P.kbRep = { d, t: 0.36 }; return d; }
    const R = P.kbRep;
    if (R && D[R.d].some(k => Input.down(k))) { R.t -= rdt; if (R.t <= 0) { R.t = 0.09; return R.d; } }
    else P.kbRep = null;
    return null;
  }
  setTab(P, t) {
    if (typeof t === 'number') t = TABS[t];
    if (!TABS.includes(t) || t === P.tab) return;
    const dir = TABS.indexOf(t) > TABS.indexOf(P.tab) ? 1 : -1;
    P.tab = t; P.s.pane = t; P.dirty = true;
    this.hideTip(P);
    this.render(P);
    P.views[t].animate([{ transform: `translateX(${dir * 34}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 230, easing: 'cubic-bezier(.2,.8,.2,1)' });
    sfx('ui_tab', 0.65);
    Events.emit('coop:pane', { n: P.n, open: true, tab: t });
  }
  gameMenu(P) {
    const U = this.ui, pad = Actions.device === 'pad';
    this.close(P.s, true);
    U._user = true;
    try { if (pad && U.padMenu) U.padMenu.open('game'); else U.open('menu'); } finally { U._user = false; }
  }
  leave(P) {
    const s = P.s;
    P.confirm = null;
    sfx('ui_close', 0.6);
    this.C.leave(s);
  }
  /** a short note in the pane (text, or html: true) */
  say(P, text, kind = '', html = false) {
    const m = P.msg; if (html) m.innerHTML = text; else m.textContent = text; m.className = 'cp-msg ' + kind;
    void m.offsetWidth; m.classList.add('show');
    clearTimeout(P._msgT); P._msgT = setTimeout(() => m.classList.remove('show'), 1900);
  }
  deny(P, I, why) {
    if (why) this.say(P, why, 'bad');
    sfx('ui_error', 0.55);
    (I || this.C.inputOf(P.s)).rumble?.(0.25, 0.35, 90);
    replay(P.cursor, 'cp-deny', 420);
  }
  bump(P) { replay(P.cursor, 'cp-bump', 260); }
  moved(P) { P.curDirty = true; sfx('ui_hover', 0.35); }

  // ------------------------------------------------------------------ the bag
  /** what the cursor is on: { z, ref, item, x, y, w, h } (grid cells: the item's footprint; the doll: its slot) */
  focus(P) {
    const G = this.G;
    if (P.cur.z === 'doll') { const k = P.cur.k; return { z: 'doll', k, ref: { c: 'equip', i: k }, item: this.ctx(P, () => G.state.equipment?.[k] || null) }; }
    const g = bagGrid(G.state), { x, y } = P.cur;
    if (P.hold) { const [w, h] = itemSize(P.hold.item), ax = Math.max(0, Math.min(BAG_W - w, x)), ay = Math.max(0, Math.min(BAG_H - h, y)); return { z: 'grid', ref: { c: 'inv', i: ay * BAG_W + ax }, item: null, x: ax, y: ay, w, h }; }
    const a = cover(g)[y * BAG_W + x];
    if (a >= 0) { const it = g.cells[a], [w, h] = itemSize(it), ax = a % BAG_W, ay = (a / BAG_W) | 0; return { z: 'grid', ref: { c: 'inv', i: a }, item: it, x: ax, y: ay, w: Math.min(w, BAG_W - ax), h: Math.min(h, BAG_H - ay) }; }
    return { z: 'grid', ref: { c: 'inv', i: y * BAG_W + x }, item: null, x, y, w: 1, h: 1 };
  }
  cellRect(P, x, y, w = 1, h = 1) {
    const L = LAYOUT[P.kind], g = L.bag.grid, st = L.cell + L.gap;
    return { x: g.x + L.gp + x * st, y: g.y + L.gp + y * st, w: w * L.cell + (w - 1) * L.gap, h: h * L.cell + (h - 1) * L.gap };
  }
  dollRect(P, k) { const L = LAYOUT[P.kind], [x, y, t] = L.doll[k], d = L.bag.doll; return { x: d.x + x, y: d.y + y, w: L.slot, h: t ? L.tallH : L.slot }; }
  focusRect(P, f = this.focus(P)) { return f.z === 'doll' ? this.dollRect(P, f.k) : this.cellRect(P, f.x, f.y, f.w, f.h); }
  /** a body-space design rect on the screen */
  screenRect(P, r) {
    const B = P.body.getBoundingClientRect(), L = LAYOUT[P.kind], kx = B.width / L.body.w, ky = B.height / L.body.h;
    return { left: B.left + r.x * kx, top: B.top + r.y * ky, width: r.w * kx, height: r.h * ky };
  }
  bagInput(P, nav, b, I) {
    if (nav) this.bagNav(P, nav);
    if (b.A) { if (P.hold) this.place(P, I); else this.bagA(P, I); }
    if (b.Y) { if (P.hold) this.cancelHold(P); else { const f = this.focus(P); if (f.item) this.lift(P, f); else this.bump(P); } }
    if (b.X) this.dropFocused(P, I);
    if (b.B) this.back(P);
  }
  bagNav(P, d) {
    const L = LAYOUT[P.kind];
    if (P.cur.z === 'grid') {
      const f = this.focus(P);
      let x = P.cur.x, y = P.cur.y, out = false;
      if (P.hold) {
        x = f.x + (d === 'right' ? 1 : d === 'left' ? -1 : 0); y = f.y + (d === 'down' ? 1 : d === 'up' ? -1 : 0);
        out = x < 0 || y < 0 || x > BAG_W - f.w || y > BAG_H - f.h;
      } else {
        if (d === 'left') x = f.x - 1; else if (d === 'right') x = f.x + f.w; else if (d === 'up') y = f.y - 1; else y = f.y + f.h;
        out = x < 0 || y < 0 || x >= BAG_W || y >= BAG_H;
      }
      if (!out) { P.cur = { z: 'grid', x, y }; this.moved(P); return; }
      if (d !== L.dollSide) { this.bump(P); return; }
      const r = this.focusRect(P, f), cx = r.x + r.w / 2, cy = r.y + r.h / 2;
      let best = null, bd = 1e9;
      for (const k of EQUIP_SLOTS) { const q = this.dollRect(P, k), dd = Math.hypot(q.x + q.w / 2 - cx, q.y + q.h / 2 - cy); if (dd < bd) { bd = dd; best = k; } }
      P.cur = { z: 'doll', k: best }; this.moved(P); return;
    }
    // the doll: the nearest slot that way, else into the grid
    const c = this.dollRect(P, P.cur.k), cx = c.x + c.w / 2, cy = c.y + c.h / 2;
    let best = null, bs = 1e9;
    for (const k of EQUIP_SLOTS) {
      if (k === P.cur.k) continue;
      const q = this.dollRect(P, k), dx = q.x + q.w / 2 - cx, dy = q.y + q.h / 2 - cy;
      const along = d === 'right' ? dx : d === 'left' ? -dx : d === 'down' ? dy : -dy, perp = Math.abs(d === 'left' || d === 'right' ? dy : dx);
      if (along <= 8) continue;
      const sc = along + perp * 2.2; if (sc < bs) { bs = sc; best = k; }
    }
    const toGrid = (L.dollSide === 'left' && d === 'right') || (L.dollSide === 'up' && d === 'down');
    if (best && !(toGrid && bs > 260)) { P.cur = { z: 'doll', k: best }; this.moved(P); return; }
    if (!toGrid) { this.bump(P); return; }
    const st = L.cell + L.gap, g = L.bag.grid;
    const w = P.hold ? itemSize(P.hold.item)[0] : 1, h = P.hold ? itemSize(P.hold.item)[1] : 1;
    if (L.dollSide === 'left') { const y = Math.max(0, Math.min(BAG_H - h, Math.floor((cy - g.y - L.gp) / st))); P.cur = { z: 'grid', x: 0, y }; }
    else { const x = Math.max(0, Math.min(BAG_W - w, Math.floor((cx - g.x - L.gp) / st))); P.cur = { z: 'grid', x, y: 0 }; }
    this.moved(P);
  }
  bagA(P, I) {
    const f = this.focus(P);
    if (!f.item) { this.bump(P); return; }
    if (f.z === 'doll') { this.unequip(P, f, I); return; }
    if (f.item.kind === 'gear') { this.equip(P, f, I); return; }
    this.lift(P, f); // (a treat, a key, a gift: A picks it up to move it)
  }
  /** why this hero can't wear it, in co-op words: whose it is (and who plays them) */
  whyNot(P, it, slot) {
    const G = this.G, why = G.actions.equipProblem(it, slot); if (!why) return '';
    const own = it.wtype && WEAPON_CLASS[it.wtype];
    if (own && own !== G.state.player.cls) { const h = this.C.slots.find(o => this.C.heroOf(o) === own); return `That's ${CLASSES[own]?.name || own}'s${h ? ` (P${h.n})` : ''}!`; }
    return why.replace(/ — switch heroes to use it!/, '');
  }
  equip(P, f, I) {
    const G = this.G, it = f.item;
    this.ctx(P, () => {
      const slot = targetSlot(it, G.state), why = this.whyNot(P, it, slot);
      if (why) { this.deny(P, I, why); return; }
      const from = this.screenRect(P, this.focusRect(P, f)), old = G.state.equipment[slot];
      if (!G.actions.equip(f.ref.i)) { this.deny(P, I); return; }
      sfx('ui_equip', 0.8); (I || this.C.inputOf(P.s)).rumble?.(0.15, 0.3, 70);
      this.render(P);
      const sl = P.eq[slot]; sl.classList.add('cp-await');
      this.fly(iconOf(it), from, this.screenRect(P, this.dollRect(P, slot)), () => { sl.classList.remove('cp-await'); replay(sl, 'pop', 500); });
      if (old) { const j = G.state.inventory.indexOf(old); if (j >= 0) { const [w, h] = itemSize(old), c = P.cells[j]; c.classList.add('cp-await'); this.fly(iconOf(old), this.screenRect(P, this.dollRect(P, slot)), this.screenRect(P, this.cellRect(P, j % BAG_W, (j / BAG_W) | 0, w, h)), () => { c.classList.remove('cp-await'); replay(c, 'pop', 500); }, 60); } }
    });
  }
  unequip(P, f, I) {
    const G = this.G, it = f.item;
    this.ctx(P, () => {
      const from = this.screenRect(P, this.dollRect(P, f.k));
      if (!G.actions.unequip(f.k)) { this.deny(P, I, 'No room in the bag'); return; }
      sfx('ui_equip', 0.65, 0.9);
      this.render(P);
      const j = G.state.inventory.indexOf(it);
      if (j >= 0) { const [w, h] = itemSize(it), c = P.cells[j]; c.classList.add('cp-await'); this.fly(iconOf(it), from, this.screenRect(P, this.cellRect(P, j % BAG_W, (j / BAG_W) | 0, w, h)), () => { c.classList.remove('cp-await'); replay(c, 'pop', 500); }); }
    });
  }
  lift(P, f) {
    P.hold = { from: f.ref, item: f.item };
    if (f.z === 'grid') P.cur = { z: 'grid', x: f.x, y: f.y };
    sfx('ui_click', 0.7, 1.15);
    this.dirtyAll();
  }
  cancelHold(P, quiet) {
    if (!P.hold) return;
    P.hold = null;
    if (!quiet) sfx('ui_click', 0.55, 0.85);
    this.dirtyAll();
  }
  /** someone else took the item this player holds: let go of it gently */
  checkHold(P) {
    if (!P.hold) return;
    const cur = this.ctx(P, () => this.G.actions.getItem(P.hold.from));
    if (cur === P.hold.item) return;
    P.hold = null;
    replay(P.ghost, 'cp-shake', 420); replay(P.cursor, 'cp-deny', 420);
    this.say(P, 'Someone else took that one!', 'soft');
    sfx('ui_error', 0.35);
    this.dirtyAll();
  }
  /** can the held item go where the cursor holds it? 'ok', 'swap' (onto exactly one item: you then hold that) or 'bad' */
  verdict(P, f = this.focus(P)) {
    const G = this.G, H = P.hold; if (!H) return 'bad';
    if (f.z === 'doll') return equipSlotsFor(H.item).includes(f.k) && !this.ctx(P, () => G.actions.equipProblem(H.item, f.k)) ? (this.ctx(P, () => G.state.equipment[f.k]) ? 'swap' : 'ok') : 'bad';
    const g = bagGrid(G.state), r = fitsAt(g, H.item, f.x, f.y, H.from.c === 'inv' ? H.from.i : -1);
    if (r.out || r.under.length > 1) return 'bad';
    if (r.under.length === 1) { if (H.from.c === 'equip' && !equipSlotsFor(g.cells[r.under[0]]).includes(H.from.i)) return 'bad'; return 'swap'; }
    return 'ok';
  }
  place(P, I) {
    const G = this.G, H = P.hold, f = this.focus(P);
    this.ctx(P, () => {
      let to;
      if (f.z === 'doll') {
        if (!equipSlotsFor(H.item).includes(f.k)) { this.deny(P, I, "That doesn't go there"); return; }
        const why = this.whyNot(P, H.item, f.k); if (why) { this.deny(P, I, why); return; }
        to = { c: 'equip', i: f.k };
      } else {
        if (this.verdict(P, f) === 'bad') { this.deny(P, I, H.from.c === 'equip' ? "That can't swap with your gear" : "It doesn't fit there"); return; }
        to = f.ref;
      }
      if (to.c === H.from.c && to.i === H.from.i) { this.cancelHold(P, true); sfx('ui_click', 0.6); return; }
      const r = G.actions.moveItem(H.from, to);
      if (r === false) { this.deny(P, I); return; }
      P.hold = null;
      if (to.c === 'equip' || H.from.c === 'equip') sfx('ui_equip', 0.75); else sfx('ui_click', 0.75, 0.95);
      (I || this.C.inputOf(P.s)).rumble?.(0.1, 0.22, 50);
      const tgt = to.c === 'equip' ? P.eq[to.i] : P.cells[to.i]; if (tgt) tgt._popNext = true;
      if (r?.swap) { const it2 = G.actions.getItem(r.swap); if (it2) { P.hold = { from: r.swap, item: it2 }; if (r.swap.c === 'inv' && P.cur.z === 'grid') P.cur = { z: 'grid', x: f.x, y: f.y }; } }
      this.dirtyAll();
      this.render(P);
    });
  }
  /** X: the focused (or held) item to the ground at this hero's paws (a rare one asks twice) */
  dropFocused(P, I) {
    const G = this.G, f = P.hold ? { ...this.focus(P), ref: P.hold.from, item: P.hold.item, held: true } : this.focus(P);
    if (!f.item) { this.bump(P); return; }
    if (RARE.has(f.item.rarity) && !(P.dropArm && P.dropArm.uid === f.item.uid && now() - P.dropArm.t < 2200)) { P.dropArm = { uid: f.item.uid, t: now() }; this.say(P, `${this.btn(P, 'X')} again to drop the ${esc(itemName(f.item))}`, 'warn', true); sfx('ui_tab', 0.5, 0.8); return; }
    P.dropArm = null;
    const at = f.held ? (f.ref.c === 'equip' ? this.dollRect(P, f.ref.i) : (() => { const [w, h] = itemSize(f.item); return this.cellRect(P, f.ref.i % BAG_W, (f.ref.i / BAG_W) | 0, w, h); })()) : this.focusRect(P, f);
    const sr = this.screenRect(P, at), icon = iconOf(f.item);
    P.hold = null;
    const it = this.dropAt(P.s, f.ref);
    if (!it) { this.deny(P, I); return; }
    this.poof(icon, sr, P.s.color);
    sfx('ui_click', 0.7, 0.75);
    (I || this.C.inputOf(P.s)).rumble?.(0.18, 0.2, 60);
    this.say(P, `Dropped the ${itemName(it)}`, '');
    this.dirtyAll();
  }
  /** drop an item at player s's hero (coop.js gives an 'item:drop' raised as them their hero's spot: game.js drops it there) */
  dropAt(s, ref) { return this.settle(this.C.with(s, () => this.G.actions.dropItem(ref))); }
  /** a dropped item isn't walked over at once by a teammate standing where it lands (the pack stands close while bags
   *  are open); stepping off and back picks it up as usual (combat/groundLoot.js triedAuto) */
  settle(it) {
    if (!it) return it;
    const G = this.G, mark = () => { const L = G.mode === 'dungeon' ? G.dungeon?.loot : G.villageLoot; const e = L?.list?.find(x => x.d?.item === it); if (e) e.triedAuto = true; return !!e; };
    setTimeout(() => { if (!mark()) setTimeout(mark, 120); }, 20);
    return it;
  }

  // ------------------------------------------------------------------ stats
  statsInput(P, nav, b, I) {
    if (nav === 'up' || nav === 'down') { const i = Math.max(0, Math.min(3, P.st.i + (nav === 'down' ? 1 : -1))); if (i !== P.st.i) { P.st.i = i; this.moved(P); } else this.bump(P); }
    else if (nav) this.bump(P);
    if (b.A) this.spend(P, STAT_KEYS[P.st.i], I);
    if (b.B) this.back(P);
    if (b.Y) this.autoToggle(P, I);
    if (b.X) this.pickAuto(P, I);
  }
  /** Y: Shadow's auto points on / off for this player's hero (docs/STATS.md §3); on spends what's waiting */
  autoToggle(P, I) {
    const G = this.G;
    this.ctx(P, () => {
      const on = !autoOn(G.state.player), g = G.actions.setAutoStats?.(on);
      sfx('ui_click', 0.8, on ? 1.3 : 0.9); (I || this.C.inputOf(P.s)).rumble?.(0.06, 0.14, 40);
      replay(P.banner, 'cp-up', 520);
      this.gainFx(P, g);
      this.render(P);
    });
  }
  /** X: Shadow spends the points waiting, once */
  pickAuto(P, I) {
    const G = this.G;
    this.ctx(P, () => {
      if (!(G.state.player.statPts > 0)) { this.deny(P, I, 'No points waiting'); return; }
      const g = G.actions.spendAutoNow?.();
      sfx('ui_click', 0.8, 1.2); (I || this.C.inputOf(P.s)).rumble?.(0.08, 0.18, 40);
      this.gainFx(P, g);
      this.render(P);
    });
  }
  /** each attribute that gained points pops with its +N */
  gainFx(P, g) {
    for (const k in g || {}) {
      const r = P.attrs[STAT_KEYS.indexOf(k)]; if (!r || !(g[k] > 0)) continue;
      replay(r, 'cp-up', 520);
      const fl = el('i', 'cp-plus1', `+${g[k]}`); r.appendChild(fl); setTimeout(() => fl.remove(), 900);
    }
  }
  spend(P, k, I) {
    const G = this.G;
    this.ctx(P, () => {
      if (!(G.state.player.statPts > 0)) { this.deny(P, I, autoOn(G.state.player) ? 'Shadow picks your points at every level up' : 'No points to spend: level up for more'); return; }
      if (!G.actions.addStat(k)) { this.deny(P, I); return; }
      sfx('ui_click', 0.8, 1.2); (I || this.C.inputOf(P.s)).rumble?.(0.08, 0.18, 40);
      const r = P.attrs[STAT_KEYS.indexOf(k)];
      replay(r, 'cp-up', 520);
      const fl = el('i', 'cp-plus1', '+1'); r.appendChild(fl); setTimeout(() => fl.remove(), 900);
      this.render(P);
    });
  }

  // ------------------------------------------------------------------ skills
  trees(P) { return this.ctx(P, () => treesFor(this.G.state.player.cls).map(t => ({ t, list: skillList().filter(s => s.tree === t.id).sort((a, b) => a.row - b.row || a.col - b.col) }))); }
  skillsInput(P, nav, b, I) {
    const T = P._trees || this.trees(P), K = P.sk;
    if (nav) {
      if (K.z === 'tree') {
        const n = T[K.t]?.list.length || 0;
        if (nav === 'up') { if (K.r > 0) { K.r--; this.moved(P); } else this.bump(P); }
        else if (nav === 'down') { if (K.r < n - 1) { K.r++; this.moved(P); } else { P.sk = { z: 'hb', i: Math.min(5, K.t * 2 + 1), t: K.t, r: K.r }; this.moved(P); } }
        else { const t = K.t + (nav === 'right' ? 1 : -1); if (t >= 0 && t < T.length) { K.t = t; K.r = Math.min(K.r, (T[t].list.length || 1) - 1); this.moved(P); } else this.bump(P); }
      } else {
        if (nav === 'left' || nav === 'right') { const i = K.i + (nav === 'right' ? 1 : -1); if (i >= 0 && i < 6) { K.i = i; this.moved(P); } else this.bump(P); }
        else if (nav === 'up' && !P.assign) { P.sk = { z: 'tree', t: Math.min(T.length - 1, Math.floor(K.i / 2)), r: (T[Math.min(T.length - 1, Math.floor(K.i / 2))]?.list.length || 1) - 1 }; this.moved(P); }
        else this.bump(P);
      }
    }
    const G = this.G;
    if (b.A) {
      if (P.assign) { const id = P.assign, i = P.sk.i; this.ctx(P, () => { if (G.actions.setHotbar(i, id)) { sfx('ui_equip', 0.7, 1.2); P.assign = null; P.sk = P.assignFrom || P.sk; this.render(P); const hs = P.hbEl.children[i + 1]; if (hs) replay(hs, 'pop', 500); } else this.deny(P, I, "That can't go there"); }); }
      else if (P.sk.z === 'tree') this.learn(P, T[P.sk.t]?.list[P.sk.r], I);
      else this.say(P, `${this.btn(P, 'Y')} on a skill puts it here`, '', true);
    }
    if (b.Y) {
      if (P.assign) { this.back(P); }
      else if (P.sk.z === 'tree') {
        const s = T[P.sk.t]?.list[P.sk.r];
        const ok = s && this.ctx(P, () => (G.state.player.skills?.[s.id] || 0) > 0) && !s.passive;
        if (!ok) this.deny(P, I, s?.passive ? 'Passive: always on' : 'Learn it first');
        else { P.assign = s.id; P.assignFrom = { ...P.sk }; const hb = this.ctx(P, () => G.state.player.hotbar || []); const at = hb.indexOf(s.id); const free = hb.findIndex((h, i) => i >= 2 && !h); P.sk = { z: 'hb', i: at >= 0 ? at : free >= 0 ? free : 2 }; sfx('ui_open', 0.5); P.dirty = true; }
      } else this.bump(P);
    }
    if (b.X && P.sk.z === 'hb' && !P.assign) {
      const i = P.sk.i;
      this.ctx(P, () => { if (i < 1 || !G.state.player.hotbar?.[i]) { this.bump(P); return; } if (G.actions.setHotbar(i, null)) { sfx('ui_click', 0.6, 0.8); this.render(P); } });
    }
    if (b.B) this.back(P);
  }
  learn(P, s, I) {
    if (!s) { this.bump(P); return; }
    const G = this.G;
    this.ctx(P, () => {
      const c = canLearnSkill(s.id, G.state);
      if (!c.ok || skillTraining(s.id)) { this.deny(P, I, skillTraining(s.id) ? 'Still in training!' : c.why); return; }
      if (!G.actions.learnSkill(s.id)) { this.deny(P, I); return; }
      sfx('ui_learn', 0.75); (I || this.C.inputOf(P.s)).rumble?.(0.15, 0.3, 80);
      this.render(P);
      const row = P.treesEl.querySelector(`.cp-skr[data-id="${s.id}"]`); if (row) replay(row, 'cp-learned', 650);
    });
  }

  // ------------------------------------------------------------------ the mouse (player 1)
  bindMouse(P) {
    const e = P.el;
    e.addEventListener('pointerdown', ev => {
      if (ev.button !== 0 && ev.button !== 2) return;
      const tab = ev.target.closest('.cp-tab'); if (tab) { if (!P.hold && !P.assign) this.setTab(P, tab.dataset.t); return; }
      if (P.confirm) return;
      const right = ev.button === 2;
      const slot = ev.target.closest('.slot[data-c]');
      if (slot && P.tab === 'bag') {
        this.pointAt(P, slot);
        ev.preventDefault();
        if (P.hold) { this.ctx(P, () => this.place(P)); return; }
        const f = this.focus(P);
        if (!f.item) return;
        if (right) this.ctx(P, () => this.bagA(P)); else this.lift(P, f);
        return;
      }
      const at = ev.target.closest('.cp-attr'); if (at && P.tab === 'stats') { P.st.i = +at.dataset.i; P.curDirty = true; this.spend(P, at.dataset.k); return; }
      const sk = ev.target.closest('.cp-skr'); if (sk && P.tab === 'skills') {
        P.sk = { z: 'tree', t: +sk.dataset.t, r: +sk.dataset.r }; P.curDirty = true;
        const T = P._trees || this.trees(P), s = T[P.sk.t]?.list[P.sk.r];
        if (right) this.skillsInput(P, null, { Y: true }, null); else if (P.assign) { this.back(P); } else this.learn(P, s);
        return;
      }
      const hs = ev.target.closest('.cp-hbs'); if (hs && P.tab === 'skills') { P.sk = { z: 'hb', i: +hs.dataset.i }; P.curDirty = true; if (P.assign) this.skillsInput(P, null, { A: true }, null); else if (right) this.skillsInput(P, null, { X: true }, null); return; }
    });
    e.addEventListener('contextmenu', ev => ev.preventDefault());
    e.addEventListener('pointerover', ev => {
      if (Actions.device === 'pad') return;
      const slot = ev.target.closest('.slot[data-c]'); if (slot && P.tab === 'bag') { this.pointAt(P, slot); return; }
      const at = ev.target.closest('.cp-attr'); if (at && P.tab === 'stats' && P.st.i !== +at.dataset.i) { P.st.i = +at.dataset.i; P.curDirty = true; return; }
      const sk = ev.target.closest('.cp-skr'); if (sk && P.tab === 'skills' && !P.assign) { P.sk = { z: 'tree', t: +sk.dataset.t, r: +sk.dataset.r }; P.curDirty = true; return; }
      const hs = ev.target.closest('.cp-hbs'); if (hs && P.tab === 'skills') { P.sk = { z: 'hb', i: +hs.dataset.i }; P.curDirty = true; }
    });
  }
  pointAt(P, slot) {
    if (slot.dataset.c === 'equip') { if (P.cur.z !== 'doll' || P.cur.k !== slot.dataset.i) { P.cur = { z: 'doll', k: slot.dataset.i }; P.curDirty = true; } return; }
    const i = +slot.dataset.i, x = i % BAG_W, y = (i / BAG_W) | 0;
    if (P.cur.z !== 'grid' || P.cur.x !== x || P.cur.y !== y) { P.cur = { z: 'grid', x, y }; P.curDirty = true; }
  }

  // ------------------------------------------------------------------ rendering (outside any context: each pane's own)
  render(P) {
    if (!P.kind) return;
    this.ctx(P, () => {
      this.renderHead(P);
      for (const t of TABS) P.views[t].classList.toggle('on', t === P.tab);
      P.marksEl.classList.toggle('off', P.tab !== 'bag');
      P.$.tabs.style.setProperty('--ti', TABS.indexOf(P.tab));
      for (const b of P.$.tabs.children) if (b.dataset?.t) b.classList.toggle('on', b.dataset.t === P.tab);
      if (P.tab === 'bag') this.renderBag(P); else if (P.tab === 'stats') this.renderStats(P); else this.renderSkills(P);
      this.renderFocus(P);
      this.renderConfirm(P);
    });
  }
  renderHead(P) {
    const G = this.G, C = this.C, s = P.s, hero = C.heroOf(s), pl = G.state.player, d = G.derived || {}, A = G.actions;
    P.hdrT = now();
    if (hero !== P.hero) {
      P.hero = hero; const cl = CLASSES[hero] || CLASSES.chewy;
      P.$.por.innerHTML = portrait(hero); P.dpor.innerHTML = portrait(hero);
      setText(P.$.hn, cl.name); setText(P.$.title, cl.title || '');
      P.el.style.setProperty('--hc', cl.color || '#ff8fb0');
      P.treeSig = ''; P._trees = null;
    }
    setText(P.$.lv, String(pl.lvl || 1));
    const xp = xpProgress(pl); P.$.xp.style.width = `${(xp.frac * 100).toFixed(1)}%`;
    const lf = A.life?.() ?? d.lifeMax, zm = A.zoom?.() ?? d.zoomMax;
    P.$.life.style.width = `${Math.max(0, Math.min(1, lf / (d.lifeMax || 1))) * 100}%`; setText(P.$.lifeT, `${Math.ceil(lf)} / ${Math.round(d.lifeMax || 0)}`);
    P.$.zoom.style.width = `${Math.max(0, Math.min(1, zm / (d.zoomMax || 1))) * 100}%`; setText(P.$.zoomT, `${Math.floor(zm)} / ${Math.round(d.zoomMax || 0)}`);
    this.tickTo(P.$.coins, G.state.coins || 0, fmt);
    const badge = (t, n) => { const e = P.$.tabs.querySelector(`.cp-tab[data-t="${t}"] .cp-badge`); setText(e, n > 0 ? String(n) : ''); e.classList.toggle('on', n > 0); };
    badge('stats', pl.statPts || 0); badge('skills', pl.skillPts || 0);
  }
  renderBag(P) {
    const G = this.G, st = G.state, eq = st.equipment || {}, d = G.derived || {}, cls = st.player.cls || 'chewy';
    layoutGrid(P.cells, bagGrid(st), this.fake);
    for (const k of EQUIP_SLOTS) { const it = eq[k], [w, h] = it ? itemSize(it) : [1, 1]; paintSlot(P.eq[k], it, this.fake, 1, (k === 'weapon' || k === 'weaponAlt') && h > 1 && w === 1 ? 2 : 1); }
    const aw = st.player.activeWeapon ? 'weaponAlt' : 'weapon';
    P.eq.weapon.classList.toggle('active', aw === 'weapon'); P.eq.weaponAlt.classList.toggle('active', aw === 'weaponAlt');
    // another hero's weapon: whose it is, on the cell
    for (const c of P.cells) {
      const it = c._cov ? null : st.inventory[+c.dataset.i], own = it?.wtype && WEAPON_CLASS[it.wtype];
      const key = own && own !== cls ? c._sig + '|' + own : '';
      if (c._whoK === key && (!key || c.querySelector('.cp-who'))) continue;
      c._whoK = key; c.querySelector('.cp-who')?.remove();
      if (key) { const w = el('i', 'cp-who'); w.style.setProperty('--wc', CLASSES[own]?.color || '#888'); w.innerHTML = portrait(own); c.appendChild(w); }
    }
    // holds: mine (lifted), the others' (outlined in their colour); while I hold gear, the doll slots it can go in
    const held = new Map();
    for (const O of this.panes.values()) if (!O.closing && O.hold && O.hold.from.c === 'inv') held.set(O.hold.from.i, O);
    for (const c of P.cells) {
      const O = held.get(+c.dataset.i), mine = O === P;
      c.classList.toggle('lifted', mine); c.classList.toggle('cp-held', !!O && !mine);
      if (O && !mine) c.style.setProperty('--hc2', O.s.color);
    }
    const ok = P.hold ? new Set(equipSlotsFor(P.hold.item)) : null;
    for (const k of EQUIP_SLOTS) { const e = P.eq[k]; e.classList.toggle('lifted', !!P.hold && P.hold.from.c === 'equip' && P.hold.from.i === k); e.classList.toggle('can-drop', !!ok && ok.has(k)); e.classList.toggle('no-drop', !!ok && !ok.has(k)); }
    // the stats under it
    const sum = [['swords', 'Damage', `${Math.round(d.dmgMin || 1)}–${Math.round(d.dmgMax || 3)}`], ['shield', 'Defense', Math.round(d.def || 0)], ['heart', 'Life', Math.round(d.lifeMax || 0)], ['bolt', 'Zoom', Math.round(d.zoomMax || 0)]];
    const html = sum.map(([g, n, v]) => `<div class="cp-si">${glyph(g)}<span>${n}</span><b>${v}</b></div>`).join('');
    if (P._sum !== html) { P._sum = html; P.sumEl.innerHTML = html; }
  }
  renderStats(P) {
    const G = this.G, pl = G.state.player, d = G.derived || {}, pts = pl.statPts || 0, auto = autoOn(pl), main = mainStat(pl.cls || 'chewy', G.state.equipment);
    const bn = `<span class="cp-bstar">${glyph(pts > 0 ? 'sparkle' : 'paw')}</span>${pts > 0 ? `<b>${pts}</b> ${pts === 1 ? 'point' : 'points'} to spend` : auto ? '<span class="cp-dimtxt">Shadow picks your points</span>' : '<span class="cp-dimtxt">No points: level up for 5 more</span>'}<span class="cp-auto${auto ? ' on' : ''}"><span class="tog${auto ? ' on' : ''}"><i></i></span></span>`;
    if (P._bn !== bn) { P._bn = bn; P.banner.innerHTML = bn; }
    P.banner.classList.toggle('on', pts > 0);
    STAT_KEYS.forEach((k, i) => {
      const r = P.attrs[i], base = pl.stats?.[k] || 0, tot = Math.round(d[k] ?? base), bonus = tot - base;
      this.tickTo(r.querySelector('.cp-av b'), tot);
      setText(r.querySelector('.cp-av small'), bonus > 0 ? `+${bonus} gear` : bonus < 0 ? `${bonus}` : '');
      setText(r.querySelector('.cp-an small'), attrFx(pl.cls || 'chewy', k)); // (what it does for this hero, docs/STATS.md §2)
      r.classList.toggle('can', pts > 0);
      r.classList.toggle('main', k === main);
    });
    const S = statSummary(d), n0 = v => Math.round(+v || 0);
    const rows = [
      ['Power', fmt(S.power), 'cp-pow'], ['Attack', fmt(S.attack)], ['Big hit chance', `${S.crit}%`], ['Life', fmt(S.life)],
      ['Zoom', fmt(S.zoom)], ['Defense', fmt(S.defense)], ['Speed', `${S.speed} a second`], ['Luck', `+${S.luck}%`],
    ];
    const res = `<div class="cp-dr cp-res"><span>Guards</span><b>${[['resFire', '#ff9a3c', 'fire'], ['resFrost', '#8fd0ff', 'frost'], ['resZap', '#ffe44a', 'zap'], ['resStink', '#9ad86a', 'stink']].map(([k, c, g]) => `<i style="--rc:${c}">${glyph(g)}${n0(d[k])}</i>`).join('')}</b></div>`;
    const html = rows.map(([a, b, c]) => `<div class="cp-dr${c ? ' ' + c : ''}"><span>${a}</span><b>${b}</b></div>`).join('') + res;
    if (P._der !== html) { P._der = html; P.derEl.innerHTML = html; }
  }
  renderSkills(P) {
    const G = this.G, pl = G.state.player, L = LAYOUT[P.kind], S = L.skills, T = P._trees || (P._trees = this.trees(P));
    const lvl = id => pl.skills?.[id] || 0, hb = pl.hotbar || [];
    const state = s => {
      const l = lvl(s.id);
      if (l >= s.maxLvl) return 'maxed';
      if (skillTraining(s.id)) return 'locked';
      const can = canLearnSkill(s.id, G.state).ok;
      if (can) return l > 0 ? 'learned can' : 'avail can';
      if (l > 0) return 'learned';
      return (pl.lvl || 1) >= s.reqLvl && s.prereq.every(q => lvl(q) > 0) ? 'avail' : 'locked';
    };
    const sig = P.kind + '|' + T.map(x => x.t.id + x.list.map(s => s.id + lvl(s.id) + state(s)).join()).join('/') + '|' + hb.join() + '|' + (P.assign || '') + '|' + Actions.device;
    if (sig === P.treeSig) return;
    P.treeSig = sig;
    const tok = i => this.slotTok(P, i);
    P.treesEl.innerHTML = T.map(({ t, list }, ti) => {
      const info = treeInfo(t.id), pts = list.reduce((a, s) => a + lvl(s.id), 0);
      return `<div class="cp-tree" style="left:${ti * (S.colW + S.colGap)}px;width:${S.colW}px;--tc:${info.color}"><div class="cp-th" style="height:${S.headH}px">${glyph(info.glyph)}<span>${esc(info.name)}</span><b>${pts}</b></div>${list.map((s, r) => {
        const l = lvl(s.id), hk = hb.indexOf(s.id);
        return `<div class="cp-skr ${state(s)}${s.passive ? ' passive' : ''}" data-id="${s.id}" data-t="${ti}" data-r="${r}" style="top:${S.rowY + r * S.rowH}px;height:${S.rowH - 4}px"><span class="cp-si2"><img src="${skillIconURL(s.id)}" alt=""></span><span class="cp-sn">${esc(s.name)}</span>${hk >= 0 ? `<span class="cp-hk">${tok(hk)}</span>` : ''}<b class="cp-sl">${l}/${s.maxLvl}</b></div>`;
      }).join('')}</div>`;
    }).join('');
    const hbY = S.hb.y;
    P.hbEl.style.top = hbY + 'px'; P.hbEl.style.height = S.hb.h + 'px';
    P.hbEl.innerHTML = `<span class="cp-hbl"><span>${P.assign ? `Put <b>${esc(skillDef(P.assign)?.name || '')}</b> on…` : 'Hotbar'}</span></span>` + hb.slice(0, 6).map((id, i) => `<div class="cp-hbs${P.assign ? ' pick' : ''}" data-i="${i}" style="width:${S.hb.slot}px;height:${S.hb.slot}px">${id ? `<img src="${hotbarIconURL(id, G.derived)}" alt="">` : ''}<span class="cp-hbk">${tok(i)}</span></div>`).join('');
    P.hbEl.classList.toggle('assign', !!P.assign);
  }
  /** a hotbar slot's button on this player's device */
  slotTok(P, i) {
    const pad = !P.s.primary || Actions.device === 'pad';
    if (pad) { const t = Actions.binds(HB_ACTS[i], 'pad')?.[0]; return t ? padGlyph(t, this.styleOf(P)) : ''; }
    return `<kbd>${esc(Actions.text(HB_ACTS[i], 'kbm') || '')}</kbd>`;
  }
  styleOf(P) {
    if (P.s.primary) return Actions.padStyle;
    const o = Actions.opts?.glyphs; if (o === 1) return 'xbox'; if (o === 2) return 'ps';
    const id = P.s.pad?.id || '';
    return !/xbox|xinput|045e|steam/i.test(id) && /054c|playstation|dualshock|dualsense|ps[345]|wireless controller/i.test(id) ? 'ps' : 'xbox';
  }
  /** the cursor, the held item's footprint, the tooltip and the hints for what the cursor is on */
  renderFocus(P) {
    P.curDirty = false;
    const L = LAYOUT[P.kind]; let r = null, key = null, make = null; // (the tooltip: what it's about, and how to draw it)
    P.fp.classList.remove('on'); P.ghost.classList.remove('on');
    if (P.tab === 'bag') {
      const f = this.focus(P); r = this.focusRect(P, f);
      if (f.item && !this.ui.seen.has(f.item.uid)) this.ui.seen.add(f.item.uid);
      if (P.hold) {
        const vd = this.verdict(P, f), [w, h] = itemSize(P.hold.item);
        const fr = f.z === 'doll' ? r : this.cellRect(P, f.x, f.y, w, h);
        Object.assign(P.fp.style, { transform: `translate(${fr.x - 3}px,${fr.y - 3}px)`, width: fr.w + 6 + 'px', height: fr.h + 6 + 'px' });
        P.fp.className = `cp-fp on ${vd}`;
        const src = iconOf(P.hold.item); if (P.gimg._src !== src) { P.gimg._src = src; P.gimg.src = src; }
        const gw = f.z === 'doll' ? Math.min(r.w, w * L.cell) : fr.w, gh = f.z === 'doll' ? Math.min(r.h, h * L.cell) : fr.h;
        Object.assign(P.ghost.style, { transform: `translate(${fr.x + (fr.w - gw) / 2}px,${fr.y + (fr.h - gh) / 2}px)`, width: gw + 'px', height: gh + 'px', '--rc': rarityColor(P.hold.item.rarity) });
        P.ghost.classList.add('on');
        r = fr;
        key = 'hold';
      } else if (f.item) {
        key = `i|${f.item.uid}|${f.ref.c}|${P.hero}`; make = () => this.itemTip(P, f);
      } else if (f.z === 'doll') {
        key = `e|${f.k}`; make = () => `<div class="tt-simple"><div class="tt-h">${SLOT_LABEL[f.k] || f.k}</div><div class="tt-d tt-dim">Empty: pick up gear and put it here</div></div>`;
      }
    } else if (P.tab === 'stats') {
      const S = L.stats.attr; r = { x: S.x, y: S.y + P.st.i * S.step, w: S.w, h: S.h };
    } else {
      const S = L.skills, K = P.sk, T = P._trees || (P._trees = this.trees(P));
      if (K.z === 'tree') {
        K.t = Math.min(K.t, T.length - 1); K.r = Math.min(K.r, (T[K.t]?.list.length || 1) - 1);
        r = { x: K.t * (S.colW + S.colGap) - 2, y: S.rowY + K.r * S.rowH - 2, w: S.colW + 4, h: S.rowH };
        const s = T[K.t]?.list[K.r];
        if (s) { key = `s|${s.id}`; make = () => this.skillTip(P, s); }
      } else {
        const x0 = this.hbX(P);
        r = { x: x0 + K.i * (S.hb.slot + 10) - 4, y: S.hb.y + S.hb.h - S.hb.slot - 4, w: S.hb.slot + 8, h: S.hb.slot + 8 };
      }
    }
    if (r) {
      P.cursor.style.transform = `translate(${r.x - 4}px,${r.y - 4}px)`;
      P.cursor.style.width = r.w + 8 + 'px'; P.cursor.style.height = r.h + 8 + 'px';
      P.cursor.classList.toggle('holding', !!P.hold);
      P.cursor.classList.add('on');
    } else P.cursor.classList.remove('on');
    const showing = P.tt.classList.contains('show');
    if (key !== P.tipKey) { // (a new focus: with a tooltip up it follows at once; else it comes up once the cursor settles)
      P.tipKey = key; P.tipVer = this.ver;
      if (!make) { P.tt.classList.remove('show'); P.tipWait = null; }
      else if (showing) this.showTip(P, make(), r);
      else P.tipWait = { html: make(), r, at: Math.max(now() + 170, P.tipHold || 0) };
    } else if (make && P.tipVer !== this.ver) { // (the same focus, something changed: redrawn in place)
      P.tipVer = this.ver;
      const html = make();
      if (showing) { if (P.tt._h !== html) this.showTip(P, html, r); else if (r) this.placeTip(P, r); } else if (P.tipWait) P.tipWait.html = html;
    } else if (showing && r) this.placeTip(P, r);
    this.renderHints(P);
  }
  /** a button on this player's device, inline (a pad glyph, or the key) */
  btn(P, t) { return !P.s.primary || Actions.device === 'pad' ? `<span class="cp-g">${padGlyph(t, this.styleOf(P))}</span>` : `<kbd>${KB_TOK[t] || t}</kbd>`; }
  hbX(P) { const S = LAYOUT[P.kind].skills, w = 6 * S.hb.slot + 5 * 10; return LAYOUT[P.kind].body.w - w; }
  itemTip(P, f) {
    const G = this.G, it = f.item;
    const compare = f.ref.c === 'equip' ? null : x => {
      const eq = G.state.equipment || {}, slots = equipSlotsFor(x); if (!slots.length) return null;
      if (x.slot === 'weapon') return eq[G.state.player.activeWeapon ? 'weaponAlt' : 'weapon'] || eq.weapon || null;
      for (const s of slots) if (eq[s]) return eq[s];
      return null;
    };
    const own = it.wtype && WEAPON_CLASS[it.wtype], other = !!own && own !== G.state.player.cls;
    let html = itemTipHTML(it, { state: G.state, derived: G.derived, compare: other ? null : compare, detail: false, more: false }); // (simple: Power and plain words, docs/STATS.md §1)
    html = this.trimTip(P, html, other);
    if (other) {
      const h = this.C.slots.find(o => this.C.heroOf(o) === own), cl = CLASSES[own];
      html = `<div class="cp-for" style="--wc:${cl?.color || '#888'}"><i>${portrait(own)}</i><span>${esc(cl?.name || own)}'s ${esc(it.wtype === 'fuma' ? 'fūma' : it.wtype)}${h ? ` · <b style="color:${h.color}">P${h.n}</b> plays ${esc(cl?.name || own)}` : ''}</span></div>` + html;
    } else if (f.ref.c === 'inv' && it.kind === 'gear') {
      const why = this.ctx(P, () => G.actions.equipProblem(it, targetSlot(it, G.state)));
      if (why) html = `<div class="cp-for bad"><span>${esc(why)}</span></div>` + html;
    }
    return html;
  }
  /** the item tooltip, trimmed for a pane: no sell value (nothing sells here), and in the compact layout no flavour
   *  line or "Moka's weapon" (the band over it says whose) */
  trimTip(P, html, other) {
    const T = this._tpl ||= document.createElement('template');
    T.innerHTML = html;
    for (const l of T.content.querySelectorAll('.tt-l, .tt-flavor')) {
      const tx = l.textContent.trim();
      if (/^Sell value/i.test(tx) || (other && /'s weapon$/i.test(tx)) || (P.kind === 'wide' && (l.classList.contains('tt-it') || l.classList.contains('tt-flavor') || / · .*scales with /.test(tx)))) l.remove();
    }
    for (const sep of T.content.querySelectorAll('.tt-sep')) { const n = sep.nextElementSibling; if (!n || n.classList.contains('tt-sep') || n.classList.contains('tt-cmpbox')) sep.remove(); }
    return T.innerHTML;
  }
  skillTip(P, s) {
    const G = this.G, pl = G.state.player, l = pl.skills?.[s.id] || 0, eff = effLevel(s.id, G.state, G.derived) || l;
    const lines = skillInfoLines(s.id, Math.max(1, eff), G).slice(0, P.kind === 'wide' ? 3 : 5);
    const c = canLearnSkill(s.id, G.state);
    const kind = s.passive ? (s.kind === 'aura' ? 'Aura' : 'Passive') : s.kind === 'summon' ? 'Summon' : s.kind === 'channel' ? 'Channel' : 'Active';
    return `<div class="tt-simple cp-sktip"><div class="tt-h">${esc(s.name)}</div><div class="tt-d tt-dim">${kind} · Level ${l}/${s.maxLvl}</div><div class="tt-d">${esc(s.desc || '')}</div>${lines.length ? `<div class="tt-sep"></div>${lines.map(x => `<div class="tt-l">${esc(x)}</div>`).join('')}` : ''}${!c.ok && c.why && c.why !== 'Mastered!' ? `<div class="tt-l tt-req bad">${esc(c.why)}</div>` : ''}</div>`;
  }
  showTip(P, html, r) {
    const t = P.tt;
    if (t._h !== html) { t._h = html; t.innerHTML = html; }
    t.style.maxWidth = LAYOUT[P.kind].tipW + 'px';
    const was = t.classList.contains('show');
    t.classList.add('show');
    if (!was) replay(t, 'cp-tin', 240);
    P.tipShownAt = now();
    this.placeTip(P, r);
  }
  /** beside the focus, inside the card: to its right (else left) when there's room, else above (else below) it */
  /** beside the focus: a lone card has room beside it on the screen (the tooltip goes out there); in a shared screen it
   *  stays in the pane's own region: the tall layout above the grid (over the doll), the wide one to the focus's side.
   *  (In .cp-in's design px: the card's outer box, its 4 px border in.) */
  placeTip(P, r) {
    const L = LAYOUT[P.kind], t = P.tt, tw = t.offsetWidth, th = t.offsetHeight, B = P.bounds || { x0: 0, y0: 0, x1: L.w, y1: L.h };
    const fx = 4 + L.body.x + r.x, fy = 4 + L.body.y + r.y, G = 12;
    const at = {
      outR: [L.w + G, fy], outL: [-G - tw, fy],
      right: [fx + r.w + G, fy], left: [fx - G - tw, fy],
      above: [fx + r.w / 2 - tw / 2, fy - th - G], below: [fx + r.w / 2 - tw / 2, fy + r.h + G],
    };
    at.over = at.above; // (above, over the header too: a long tooltip still leaves the grid clear)
    const room = B.x1 - L.w >= tw + G + 8 ? ['outR', 'outL'] : B.x0 <= -(tw + G + 8) ? ['outL'] : [];
    const order = [...room, ...(P.kind === 'tall' && P.tab === 'bag' && P.cur.z === 'grid' ? ['above', 'over', 'right', 'left', 'below'] : P.kind === 'tall' && P.tab === 'bag' ? ['right', 'left', 'below', 'above'] : ['right', 'left', 'above', 'below'])];
    const top = P.kind === 'tall' ? 4 + L.body.y - 4 : 10; // (the tall layout's tabs stay in sight when they can)
    const X0 = Math.max(B.x0, room.length ? B.x0 : 4) + 6, X1 = Math.min(B.x1, room.length ? B.x1 : L.w - 4) - 6, Y0 = Math.max(B.y0, 4) + 6, Y1 = Math.min(B.y1, L.h - 4) - 6;
    const fits = ([x, y], k) => (k === 'outR' || k === 'outL' ? x >= X0 && x + tw <= X1 : k === 'over' ? y >= Y0 : k === 'above' || k === 'below' ? y >= top && y + th <= Y1 : x >= X0 && x + tw <= X1);
    let [x, y] = at[order.find(k => fits(at[k], k)) || order[room.length]];
    x = Math.max(X0, Math.min(X1 - tw, x)); y = Math.max(Y0, Math.min(Y1 - th, y));
    t.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px)`;
  }
  hideTip(P) { P.tt.classList.remove('show'); P.tipKey = null; P.tipWait = null; }
  renderHints(P) {
    const pad = !P.s.primary || Actions.device === 'pad', st = this.styleOf(P);
    const h = (t, label) => `<span class="cp-h">${pad ? `<span class="cp-g">${padGlyph(t, st)}</span>` : `<kbd>${KB_TOK[t] || t}</kbd>`}${label}</span>`;
    const out = [];
    if (P.tab === 'bag') {
      const f = this.focus(P);
      if (P.hold) out.push(h('A', f.z === 'doll' ? 'Wear it' : 'Put down'), h('B', 'Put back'), h('X', 'Drop'));
      else if (f.item) {
        if (f.z === 'doll') out.push(h('A', 'Take off'), h('Y', 'Move'), h('X', 'Drop'));
        else out.push(h('A', f.item.kind === 'gear' ? 'Equip' : 'Move'), ...(f.item.kind === 'gear' ? [h('Y', 'Move')] : []), h('X', 'Drop'));
      }
    } else if (P.tab === 'stats') { // (docs/STATS.md §3: Y Shadow's auto points, X Shadow spends what's waiting)
      const pl = this.ctx(P, () => this.G.state.player), pts = pl?.statPts || 0;
      if (pts > 0) out.push(h('A', 'Spend a point'), h('X', 'Pick for me'));
      out.push(h('Y', autoOn(pl) ? 'Pick myself' : 'Shadow picks'));
    }
    else if (P.assign) out.push(h('A', 'Put it here'), h('B', 'Cancel'));
    else if (P.sk.z === 'hb') out.push(h('X', 'Clear'));
    else out.push(h('A', 'Learn'), h('Y', 'To hotbar'));
    if (!P.hold && !P.assign) out.push(pad ? `<span class="cp-h"><span class="cp-g">${padGlyph('LB', st)}</span><span class="cp-g">${padGlyph('RB', st)}</span>Tabs</span>` : `<span class="cp-h"><kbd>Q</kbd><kbd>E</kbd>Tabs</span>`);
    if (!P.hold && !P.assign) out.push(h('B', 'Close'));
    const right = pad ? `<span class="cp-h cp-hv"><span class="cp-g">${padGlyph('View', st)}</span>${P.s.primary ? 'Game menu' : 'Leave'}</span>` : '';
    const html = `<span class="cp-hl">${out.join('')}</span>${right}`;
    if (P._hints !== html) { P._hints = html; P.hints.innerHTML = html; }
  }
  renderConfirm(P) {
    const on = !!P.confirm;
    P.confirmEl.classList.toggle('on', on);
    if (!on) return;
    const st = this.styleOf(P), name = CLASSES[P.hero]?.name || 'Your hero';
    const html = `<div class="cp-ct">Leave the game?</div><div class="cp-cd">${esc(name)} heads home to rest. You can join again any time with ${padGlyph('A', st)}.</div><div class="cp-cb"><span class="cp-h"><span class="cp-g">${padGlyph('View', st)}</span><span class="cp-g">${padGlyph('A', st)}</span>Leave</span><span class="cp-h"><span class="cp-g">${padGlyph('B', st)}</span>Stay</span></div>`;
    const box = P.confirmEl.firstElementChild; if (box._h !== html) { box._h = html; box.innerHTML = html; }
  }
  /** the other players' cursors on each pane's shared grid (live), and what they hold */
  syncMarks() {
    const list = [...this.panes.values()].filter(P => !P.closing && P.kind);
    for (const P of list) {
      const seen = new Set();
      if (P.tab === 'bag') for (const O of list) {
        if (O === P || O.tab !== 'bag' || O.cur.z !== 'grid' || O.confirm) continue;
        const f = this.focus(O), r = this.cellRect(P, f.x, f.y, f.w, f.h);
        let m = P.marks.get(O.n);
        if (!m) { m = el('div', 'cp-mk'); m.innerHTML = `<b>P${O.n}</b><img alt="">`; m.style.setProperty('--mc', O.s.color); P.marksEl.appendChild(m); P.marks.set(O.n, m); void m.offsetWidth; }
        const sig = `${r.x}|${r.y}|${r.w}|${r.h}|${O.hold?.item?.uid || ''}`;
        if (m._sig !== sig) {
          m._sig = sig;
          Object.assign(m.style, { transform: `translate(${r.x - 3}px,${r.y - 3}px)`, width: r.w + 6 + 'px', height: r.h + 6 + 'px' });
          const img = m.querySelector('img'); if (O.hold) { const src = iconOf(O.hold.item); if (img._src !== src) { img._src = src; img.src = src; } }
          m.classList.toggle('holding', !!O.hold);
        }
        m.classList.add('on'); seen.add(O.n);
      }
      for (const [n, m] of P.marks) if (!seen.has(n)) { m.classList.remove('on'); if (!this.panes.has(this.C.slots.find(s => s.n === n))) { m.remove(); P.marks.delete(n); } }
    }
  }

  // ------------------------------------------------------------------ effects
  /** an item's icon flies from one screen rect to another (equip: the bag cell to its doll slot) */
  fly(src, a, b, done, delay = 0) {
    const g = el('div', 'cp-fly'); g.innerHTML = `<img src="${src}" alt="">`;
    Object.assign(g.style, { left: a.left + 'px', top: a.top + 'px', width: a.width + 'px', height: a.height + 'px' });
    this.fx.appendChild(g);
    const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2), s = Math.max(0.4, Math.min(1.6, Math.sqrt((b.width * b.height) / Math.max(1, a.width * a.height))));
    const lift = -Math.min(70, 24 + Math.hypot(dx, dy) * 0.18);
    const an = g.animate([
      { transform: 'translate(0,0) scale(1) rotate(0)', opacity: 1 },
      { transform: `translate(${dx * 0.5}px,${dy * 0.5 + lift}px) scale(${(1 + s) / 2 * 1.12}) rotate(-8deg)`, opacity: 1, offset: 0.5 },
      { transform: `translate(${dx}px,${dy}px) scale(${s}) rotate(0)`, opacity: 0.9 },
    ], { duration: 420, delay, easing: 'cubic-bezier(.35,.1,.25,1)', fill: 'both' });
    an.onfinish = () => { g.remove(); done?.(); };
  }
  /** a dropped item pops out of its cell */
  poof(src, r, color) {
    const g = el('div', 'cp-fly'); g.innerHTML = `<img src="${src}" alt="">`;
    Object.assign(g.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
    this.fx.appendChild(g);
    const an = g.animate([{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(1.35) translateY(-10px)', opacity: 1, offset: 0.35 }, { transform: 'scale(.2) translateY(40px) rotate(25deg)', opacity: 0 }], { duration: 480, easing: 'cubic-bezier(.3,.6,.4,1)' });
    an.onfinish = () => g.remove();
    try { this.ui.burst?.(r.left + r.width / 2, r.top + r.height / 2, { n: 12, spread: 60, kind: 'dot', colors: [color, '#fff3b8', '#ffffff'] }); } catch (e) { /* (fx only) */ }
  }
}

