// Touch controls (docs/CONTROLS.md §12, ROADMAP CT-5): the on-screen controls for phones and tablets, and the touch
// device's pointer handling. They show while touch is the active device (core/actions.js: body.touch-active) and play is
// on (not on the title, in a menu, a dialogue, build or decorate mode):
//  - the floating stick (left half; the right half when mirrored): it appears where the thumb lands, walks with the
//    analogue push and sprints when pushed out to its outer ring. A short tap there is a world tap.
//  - the cluster (bottom right): the attack button (the LMB slot, with the pad's A behaviour: game.js), the five skill
//    slots (RMB, 1–4) on an arc round it, the roll button and the weapon-set badge. The HUD's own hotbar slots move in,
//    so their icons, cooldown sweeps, charge sweep, stage pips and perk badges keep working; they go home when another
//    device plays. Hold a skill to charge it (a ring fills round the button). Aim (Settings › Controls › Touch): Auto
//    (the soft lock, else the facing: combat/padAim.js) or Drag (drag off a skill: a ground mark shows where it goes,
//    back onto the button cancels, letting go casts). An empty slot opens the skill chooser.
//  - the belt between the orbs (the HUD's potion and meal slots, moved in).
//  - top right: the hero button (a tap: the next hero; a hold: the hero wheel, which stays up for a tap on a card), the
//    bag and the menu. The minimap opens the map.
//  - the world: a tap locks a foe, walks to someone or something and uses it, or walks there (game.js touchTap); two
//    fingers pinch the camera's zoom.
// The actions go through core/touch.js (Touch.hold / release / pulse, the stick and aim vectors), so game.js, the charge
// machine and the hero wheel read touch exactly as they read the keyboard and the pad.
import * as THREE from 'three';
import './touch.css';
import { Actions } from '../core/actions.js';
import { Touch } from '../core/touch.js';
import { Input } from '../core/input.js';
import { Events } from '../core/events.js';
import { el, setCls, replay, clamp } from './dom.js';
import { glyph } from './glyphs.js';
import { portrait } from './portraits.js';
import { chargeable } from '../rpg/charge.js';

const SLOT_ACTS = ['attack', 'skillAlt', 'skill1', 'skill2', 'skill3', 'skill4'];
const BELT_ACT = { heart: 'potionHeart', zoom: 'potionZoom', rejuv: 'potionR' };
const DEG = Math.PI / 180;
// the cluster in CSS px at size 1 (a phone in landscape), from the safe area's bottom-right corner to each centre:
// [in from the side, up from the bottom, diameter]; the skills sit on an arc round the attack button
const LAY = { attack: [70, 56, 84], arcR: 116, arcA0: -8, arcStep: 29, skill: 52, roll: [246, 36, 54], swap: [22, 124, 40], top: 48, gap: 7, margin: 10 };
const STICK = { r: 58, knob: 52, sprint: 1.24, follow: 1.7, dz: 0.12, min: 0.26, rest: [104, 100] };
const AIM_DEAD = 18, AIM_FULL = 140; // px: a drag past AIM_DEAD off a skill aims; AIM_FULL is the farthest (combat/padAim.js: 9 m)
const TAP_MS = 380, TAP_PX = 16, STICK_TAP_MS = 230, HOLD_MS = 220;
const ROLL_SVG = `<svg viewBox="0 0 32 32"><path d="M9.2 22.6A9 9 0 1 0 8.6 10" fill="none" stroke="#4a2c2a" stroke-width="6.2" stroke-linecap="round"/><path d="M9.2 22.6A9 9 0 1 0 8.6 10" fill="none" stroke="#fff" stroke-width="2.8" stroke-linecap="round"/>
  <path d="M4.6 6.4l4.6 4.4 4.6-3.6" fill="none" stroke="#4a2c2a" stroke-width="6.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M4.6 6.4l4.6 4.4 4.6-3.6" fill="none" stroke="#fff" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="17.6" cy="17" r="3.4" fill="#ff8fb0" stroke="#4a2c2a" stroke-width="2"/></svg>`;
const DECO_SVG = (() => { // the attack button's frame: a cream band with gold and pink dots, like the orbs'
  const dots = Array.from({ length: 12 }, (_, i) => { const a = i / 12 * Math.PI * 2 - Math.PI / 2; return `<circle cx="${(50 + Math.cos(a) * 45.5).toFixed(1)}" cy="${(50 + Math.sin(a) * 45.5).toFixed(1)}" r="2.6" fill="${i % 2 ? '#ffcf4a' : '#ff8fb0'}" stroke="#4a2c2a" stroke-width="1.2"/>`; }).join('');
  return `<svg class="tc-deco" viewBox="0 0 100 100"><circle cx="50" cy="50" r="45.5" fill="none" stroke="#4a2c2a" stroke-width="10.5"/><circle cx="50" cy="50" r="45.5" fill="none" stroke="#fff6e8" stroke-width="6.5"/>${dots}</svg>`;
})();

export class TouchControls {
  constructor(ui) {
    this.ui = ui; this.T = Touch; this.ptrs = new Map(); this.stickP = null; this.pinch = null; this.on = false; this.homed = true; // (T: the touch device, for the QA)
    this.u = 1; this.aimOffIn = 0; this.aimP = null; this.wheelHold = false; this.cache = {}; this.boxes = [];
    this.layer = el('div', 'layer l-touch');
    ui.root.insertBefore(this.layer, ui.layers.panels);
    this.root = el('div', 'tc'); this.layer.appendChild(this.root);
    this.build();
    this.mark = new AimMark();
    const cv = document.getElementById('game') || ui.G?.engine?.renderer?.domElement;
    if (cv) {
      cv.addEventListener('pointerdown', e => this.onCanvasDown(e));
      cv.addEventListener('touchstart', e => e.preventDefault(), { passive: false }); // (no compatibility mouse events, no page zoom or scroll)
    }
    addEventListener('pointermove', e => this.onMove(e), { passive: true });
    addEventListener('pointerup', e => this.onUp(e, false));
    addEventListener('pointercancel', e => this.onUp(e, true));
    addEventListener('blur', () => this.releaseAll());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.releaseAll(); });
    addEventListener('resize', () => { this.layoutT = 0; });
    // no page zoom: Safari's gesture events and any two-finger touchmove
    document.addEventListener('gesturestart', e => e.preventDefault());
    document.addEventListener('touchmove', e => { if (e.cancelable && e.touches && e.touches.length > 1) e.preventDefault(); }, { passive: false });
    Events.on('input:device', p => this.onDevice(p?.device));
    Events.on('hero:wheel', () => this.fitWheel());
    ui.onSetting(k => { if (k === 'haptics' || /^touch/.test(k)) this.applySettings(); });
    // haptics: a tick per charge stage, a thump on a charged release, being hurt and knocked out
    Events.on('charge:stage', () => this.buzz(12));
    Events.on('charge:release', p => { if (p?.ok && p.stage > 0) this.buzz(16 + 8 * p.stage); });
    Events.on('sfx', n => { if (n === 'player_hurt') this.buzz(22); else if (n === 'player_die') this.buzz(70); });
    // the HUD: the interact prompt and the minimap answer a tap; the bag's fly-to target is the touch bag button
    const hud = ui.hud, prompt = hud.$.prompt, mm = hud.root.querySelector('.mm-wrap');
    prompt.addEventListener('touchstart', e => { e.preventDefault(); }, { passive: false });
    prompt.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse') return; e.preventDefault(); e.stopPropagation(); Touch.pulse('interact'); this.buzz(8); replay(prompt, 'pressed', 250); });
    mm?.addEventListener('pointerup', e => { if (e.pointerType !== 'mouse' && Actions.device === 'touch' && !ui.anyModal()) { ui._user = true; try { ui.toggle('map'); } finally { ui._user = false; } } });
    const bagRect = hud.bagRect.bind(hud), bump = hud.bumpBag.bind(hud);
    hud.bagRect = () => (this.on ? this.$.bag.getBoundingClientRect() : bagRect());
    hud.bumpBag = () => { bump(); if (this.on) replay(this.$.bag, 'gulp', 500); };
    this.applySettings();
    // a touch-first device (a phone or tablet, no mouse) starts on touch: the controls are up before the first tap
    try { if (matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches) Actions.setDevice('touch'); } catch (e) { /* no matchMedia */ }
    if (Actions.device === 'touch') this.onDevice('touch');
  }
  get G() { return this.ui.G; }

  // ---------------------------------------------------------------- DOM
  build() {
    this.root.innerHTML = `
      <div class="tc-scrim"></div>
      <div class="tc-stick rest"><div class="tc-base"><i class="tc-chev n"></i><i class="tc-chev e"></i><i class="tc-chev s"></i><i class="tc-chev w"></i><div class="tc-sprint"></div></div><div class="tc-knob">${glyph('paw')}</div></div>
      <div class="tc-cluster">
        <div class="tc-b tc-slot tc-attack" data-slot="0">${DECO_SVG}<i class="tc-use">${glyph('paw')}</i></div>
        ${[1, 2, 3, 4, 5].map(i => `<div class="tc-b tc-slot tc-skill" data-slot="${i}"><div class="tc-aimdir"><i></i></div><i class="tc-x">${glyph('x')}</i></div>`).join('')}
        <div class="tc-b tc-roll"><div class="tc-face">${ROLL_SVG}</div></div>
        <div class="tc-b tc-swap"></div>
      </div>
      <div class="tc-belt"></div>
      <div class="tc-top">
        <div class="tc-b tc-hero" hidden><div class="tc-hface"></div><svg class="tc-hcd" viewBox="0 0 40 40"><circle cx="20" cy="20" r="17.5"/></svg><span class="tc-hlv"></span><span class="tc-hsw">${glyph('swap')}</span></div>
        <div class="tc-b tc-sq tc-bag">${glyph('bag')}</div>
        <div class="tc-b tc-sq tc-menu">${glyph('gear')}<span class="tc-dot"></span></div>
      </div>
      <div class="tc-edit">
        <div class="tc-b tc-eb tc-place" data-e="place"><i>${glyph('check')}</i><b>Place</b></div>
        <div class="tc-b tc-eb tc-rot" data-e="rot"><i>${glyph('swap')}</i><b>Turn</b></div>
        <div class="tc-b tc-eb tc-cancel" data-e="cancel"><i>${glyph('x')}</i><b>Cancel</b></div>
        <div class="tc-b tc-eb tc-store" data-e="store"><i>${glyph('chest')}</i><b>Store</b></div>
        <div class="tc-b tc-eb tc-undo" data-e="undo"><i>${glyph('sort')}</i><b>Undo</b></div>
        <div class="tc-b tc-eb tc-done" data-e="done"><i>${glyph('check')}</i><b>Done</b></div>
      </div>
      <div class="tc-pings"></div>
      <i class="tc-safe"></i>`;
    const q = s => this.root.querySelector(s);
    this.$ = {
      stick: q('.tc-stick'), base: q('.tc-base'), knob: q('.tc-knob'), cluster: q('.tc-cluster'),
      slots: [...this.root.querySelectorAll('.tc-slot')], roll: q('.tc-roll'), swap: q('.tc-swap'), belt: q('.tc-belt'),
      hero: q('.tc-hero'), hface: q('.tc-hface'), hcd: q('.tc-hcd circle'), hlv: q('.tc-hlv'), bag: q('.tc-bag'), menu: q('.tc-menu'), dot: q('.tc-dot'),
      pings: q('.tc-pings'), safe: q('.tc-safe'), edit: q('.tc-edit'), eb: Object.fromEntries([...this.root.querySelectorAll('.tc-eb')].map(e => [e.dataset.e, e])),
    };
    for (const [k, e] of Object.entries(this.$.eb)) this.bind(e, { up: (p, c) => { if (!c && p.moved < 40) this.editAct(k); } });
    this.$.slots.forEach((s, i) => this.bind(s, this.slotH(i)));
    this.bind(this.$.roll, { down: () => Touch.pulse('roll') });
    this.bind(this.$.swap, { down: () => Touch.pulse('swap') });
    this.bind(this.$.hero, this.heroH());
    this.bind(this.$.bag, { up: (p, c) => { if (!c && p.moved < 40) this.openPanel('inventory', { view: 'bag' }); } });
    this.bind(this.$.menu, { up: (p, c) => { if (!c && p.moved < 40) { this.ui._user = true; try { this.ui.back(); } finally { this.ui._user = false; } } } });
  }
  openPanel(n, o) { const ui = this.ui; ui._user = true; try { ui.toggle(n, o); } finally { ui._user = false; } }
  /** pointer handling for one button: h = { down(p), move(p), up(p, cancelled), tick(p) } */
  bind(elm, h) {
    elm.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse') return;
      e.preventDefault(); e.stopPropagation();
      if (!this.on && !(this.editOn && elm.classList.contains('tc-eb'))) return;
      try { elm.setPointerCapture(e.pointerId); } catch (err) { /* (not capturable) */ }
      const r = elm.getBoundingClientRect();
      const p = { kind: 'btn', el: elm, h, id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, t0: performance.now(), moved: 0, cx: r.left + r.width / 2, cy: r.top + r.height / 2, rad: r.width / 2 };
      this.ptrs.set(e.pointerId, p);
      elm.classList.add('down');
      this.buzz(7);
      h.down?.(p);
    });
    elm.addEventListener('touchstart', e => e.preventDefault(), { passive: false }); // (no compatibility mouse events or click)
    elm.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); }, true); // (a long press is a charge, not the skill chooser)
    elm.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); }, true);
  }

  // ---------------------------------------------------------------- the HUD's slots move in (and home again)
  onDevice(dev) {
    if (dev === 'touch') { this.adopt(); this.layoutT = 0; }
    else { this.releaseAll(); this.home(); this.setOn(false); }
  }
  adopt() {
    const hud = this.ui.hud; if (!hud?.slots || !this.homed) return;
    this.homed = false;
    this.order ||= [...hud.$.hotbar.children];
    hud.slots.forEach((s, i) => {
      if (!s.el.querySelector('.tc-ring')) s.el.appendChild(el('div', 'tc-ring'));
      this.$.slots[i].appendChild(s.el);
    });
    this.$.swap.appendChild(hud.wsBadge);
    for (const b of hud.belt) this.$.belt.appendChild(b.el);
    this.$.belt.appendChild(hud.mealSlot.el);
    for (const b of [...hud.belt.map(b => [b.el, BELT_ACT[b.k], b.k]), [hud.mealSlot.el, 'meal', 'meal']]) {
      const [elm, act, k] = b;
      if (elm._tcBound) continue;
      elm._tcBound = true;
      this.bind(elm, { down: () => { Touch.pulse(act); if (k !== 'meal') hud.flashBelt(k); } });
    }
    this.ui.root.classList.add('touch-ui');
  }
  home() {
    const hud = this.ui.hud; if (this.homed || !hud) return;
    this.homed = true;
    const bar = hud.$.hotbar;
    for (const c of this.order || []) bar.appendChild(c); // (the original order: the six slots, the badge, the separator, the belt, the meal)
    this.ui.root.classList.remove('touch-ui');
  }

  // ---------------------------------------------------------------- settings and layout
  applySettings() {
    const s = this.ui.settings;
    this.mirror = !!s.touchLeft;
    this.aimMode = s.touchAim === 1 ? 1 : 0;
    Touch.opts.haptics = s.haptics !== false;
    this.root.style.setProperty('--op', String(clamp(s.touchOpacity ?? 0.85, 0.3, 1)));
    this.root.classList.toggle('mirror', this.mirror);
    this.layoutT = 0;
  }
  safe() {
    if (this.ui.mobile) return this.ui.mobile.safe(); // (env() or the QA's ?safe=: ui/mobile.js)
    const cs = getComputedStyle(this.$.safe), px = v => parseFloat(v) || 0;
    return { l: px(cs.left), t: px(cs.top), r: px(cs.right), b: px(cs.bottom) };
  }
  layout() {
    const W = innerWidth, H = innerHeight, s = this.ui.settings, $ = this.$;
    const sf = this.safe(); this.sf = sf;
    const base = clamp(Math.min(W, H * 1.9) / 844, 0.9, 1.3);
    const u = this.u = base * clamp(s.touchSize ?? 1, 0.75, 1.35);
    this.root.style.setProperty('--u', u.toFixed(3));
    this.ui.root.classList.toggle('tc-short', H < 520);
    if (H < 520 && !this.qFolded) { this.qFolded = true; this.ui.hud.$.qt?.classList.add('collapsed'); } // (a phone: the quest tracker starts folded; its toggle opens it)
    const m = LAY.margin, mir = this.mirror;
    const ax = mir ? sf.l + m : W - sf.r - m, ay = H - sf.b - m, sx = mir ? 1 : -1;
    const place = (e, dx, dy, d) => { e.style.left = (ax + sx * dx * u).toFixed(1) + 'px'; e.style.top = (ay - dy * u).toFixed(1) + 'px'; e.style.setProperty('--d', (d * u).toFixed(1) + 'px'); };
    const [atx, aty, atd] = LAY.attack;
    place($.slots[0], atx, aty, atd);
    for (let k = 0; k < 5; k++) { const a = (LAY.arcA0 + LAY.arcStep * k) * DEG; place($.slots[k + 1], atx + LAY.arcR * Math.cos(a), aty + LAY.arcR * Math.sin(a), LAY.skill); }
    place($.roll, LAY.roll[0], LAY.roll[1], LAY.roll[2]);
    place($.swap, LAY.swap[0], LAY.swap[1], LAY.swap[2]);
    const ext = (dx, d) => ax + sx * (dx + d / 2) * u; // (the cluster's inner edge: the roll button's far side)
    this.clusterBox = mir ? [0, 0, ext(LAY.roll[0], LAY.roll[2]), H] : [ext(LAY.roll[0], LAY.roll[2]), 0, W, H];
    // the top row: left of the minimap
    const mm = this.ui.hud.root.querySelector('.mm-wrap')?.getBoundingClientRect();
    const tw = LAY.top * u, tg = LAY.gap * u, right = mm && mm.width ? mm.left - 10 : W - sf.r - 150, top = Math.max(sf.t, mm?.top || 0) + 8 + tw / 2;
    [$.menu, $.bag, $.hero].forEach((e, i) => { e.style.left = (right - tw / 2 - i * (tw + tg)).toFixed(1) + 'px'; e.style.top = top.toFixed(1) + 'px'; });
    // the stick's resting place
    this.rest = { x: mir ? W - sf.r - STICK.rest[0] * u : sf.l + STICK.rest[0] * u, y: H - sf.b - STICK.rest[1] * u };
    $.stick.style.setProperty('--r', (STICK.r * u).toFixed(1) + 'px');
    $.stick.style.setProperty('--k', (STICK.knob * u).toFixed(1) + 'px');
    if (!this.stickP) this.stickRest();
    this.layoutBelt();
    // what the quest arrow keeps out of (ui/questArrow.js avoid): the top-left card, the top-right column, the cluster
    const hs = this.ui.scale || 1, bb = els => els.reduce((b, e) => { const r = e.getBoundingClientRect(); return r.width ? [Math.min(b[0], r.left), Math.min(b[1], r.top), Math.max(b[2], r.right), Math.max(b[3], r.bottom)] : b; }, [1e9, 1e9, -1e9, -1e9]);
    const cl = bb([...$.slots, $.roll, $.swap]), tr = bb([this.ui.hud.$.tr, $.menu, $.bag, $.hero]);
    this.boxes = [[0, 0, 300 * hs, 250 * hs], [tr[0] - 8, 0, W, tr[3] + 8], [cl[0] - 10, cl[1] - 10, cl[2] + 10, H]];
    // the free band along the top, between the top-left card and hero / bag / menu: a guide's dock sits in it on a phone (mobile.css)
    const tl = this.ui.hud.root.querySelector('.hud-tl')?.getBoundingClientRect(), bl = Math.min(tl?.width ? tl.right : 1e9, 300 * hs) + 8;
    this.ui.root.style.setProperty('--tc-band-l', bl.toFixed(1) + 'px'); this.ui.root.style.setProperty('--tc-band-w', Math.max(220, tr[0] - 8 - bl).toFixed(1) + 'px');
  }
  /** the belt sits in the gap between the orbs: the HUD's dock is sized to it (touch.css) and the belt follows the dock */
  layoutBelt() {
    const B = this.$.belt, kids = [...B.children].filter(e => getComputedStyle(e).display !== 'none'), hud = this.ui.hud, R = this.ui.root.style;
    const bw = kids.length * 50 * this.u + Math.max(0, kids.length - 1) * 6 * this.u;
    R.setProperty('--tc-belt-w', Math.max(40, bw + 6).toFixed(1) + 'px');
    // the orbs and belt stay centred, but clear of the cluster (a phone is too narrow for both in the middle)
    const W = innerWidth, gw = hud.$.bc.getBoundingClientRect().width, hl = hud.root.getBoundingClientRect().left, cl = this.clusterBox;
    let cx = W / 2;
    if (cl) cx = this.mirror ? Math.max(cx, cl[2] + 12 + gw / 2) : Math.min(cx, cl[0] - 12 - gw / 2);
    R.setProperty('--tc-bc-x', (cx - hl).toFixed(1) + 'px');
    const d = hud.$.dock?.getBoundingClientRect();
    if (d && d.width) { B.style.left = (d.left + d.width / 2).toFixed(1) + 'px'; B.style.top = (d.bottom + 2).toFixed(1) + 'px'; }
    this.beltSig = kids.length;
  }

  // ---------------------------------------------------------------- per frame (UI.update)
  shouldShow() {
    const ui = this.ui, G = this.G;
    return Actions.device === 'touch' && !!G && ui.mode !== 'title' && !G.titleActive && !ui.anyModal() && !ui.iris?.active && !G.build?.active && !G.housing?.decor?.active;
  }
  setOn(on) {
    if (on === this.on) return;
    this.on = on;
    this.root.classList.toggle('on', on);
    if (!on) { this.releaseAll(true); this.mark.hide(); }
  }
  update(dt) {
    if (Actions.device === 'touch' && this.homed) this.adopt();
    this.setOn(this.shouldShow());
    this.editTick(dt);
    if (this.wheelHold && !this.G?.heroes?.wheelOpen) this.endWheelHold(); // (a card was picked, or it closed)
    if (this.ui.root.classList.contains('tc-wheel') && !(this.G?.heroes?.wheelOpen && Actions.device === 'touch')) this.ui.root.classList.remove('tc-wheel');
    if (!this.on) return;
    this.layoutT = (this.layoutT || 0) - dt;
    if (this.layoutT <= 0) { this.layoutT = 4; this.layout(); } // (also on a resize, a setting, a device switch: layoutT = 0)
    else { const n = [...this.$.belt.children].filter(e => e.classList.contains('has') || !/b-(rejuv|meal)/.test(e.className)).length; if (n !== this.beltSig) this.layoutBelt(); }
    for (const p of this.ptrs.values()) if (p.kind === 'btn') p.h.tick?.(p);
    if (this.aimOffIn > 0 && --this.aimOffIn === 0) this.aimOff();
    this.tickHud();
    this.tickMark();
  }
  tickHud() {
    const G = this.G, H = G.heroes, $ = this.$, c = this.cache;
    // the hero button: the next hero's face, the switch cooldown
    const nx = H?.next?.() || null;
    if (nx !== c.nx) { if (!c.nx !== !nx) this.layoutT = 0; c.nx = nx; $.hero.hidden = !nx; if (nx) { $.hface.innerHTML = portrait(nx); replay($.hero, 'heroswap', 600); } } // (the button comes or goes: lay out again, the top band changes)
    if (nx) {
      const f = Math.round((H.T ? 1 : clamp((H.cd || 0) / 2)) * 100) / 100;
      if (f !== c.hcd) { c.hcd = f; $.hcd.style.strokeDashoffset = String((1 - f) * 110); setCls($.hero, 'cooling', f > 0); }
      const lv = G.state.heroes?.[nx]?.player?.lvl || 1; if (lv !== c.hlv) { c.hlv = lv; $.hlv.textContent = String(lv); }
    }
    // the menu's dot: skill and stat points to spend
    const p = G.state.player, pts = (p.skillPts || 0) + (p.statPts || 0);
    if (pts !== c.pts) { c.pts = pts; $.dot.textContent = pts > 0 ? String(pts) : ''; setCls($.dot, 'on', pts > 0); }
    // the attack button shows a paw while it would talk / use (game.js: the pad's A behaviour)
    const ctx = !!G.ui?.hud?.$.prompt.classList.contains('show') && !(G.padAim?.foeNear?.());
    if (ctx !== c.ctx) { c.ctx = ctx; setCls($.slots[0], 'ctx', ctx); }
  }

  // ---------------------------------------------------------------- pointers
  onCanvasDown(e) {
    if (e.pointerType === 'mouse') return;
    e.preventDefault();
    const x = e.clientX, y = e.clientY, now = performance.now(), G = this.G;
    // the hero wheel left up for a tap on a card: a tap anywhere else closes it
    if (this.wheelHold && G?.heroes?.wheelOpen) { G.heroes.pickFromWheel(null); this.endWheelHold(); return; }
    const p = { kind: 'tap', id: e.pointerId, x0: x, y0: y, x, y, lx: x, ly: y, t0: now, moved: 0 };
    this.ptrs.set(e.pointerId, p);
    try { e.target.setPointerCapture?.(e.pointerId); } catch (err) { /* */ }
    if (this.editOn) return this.editDown(p); // (build and decorate mode)
    if (!this.on) return; // (a menu: a tap on the world may still read a dialogue on, onUp)
    // fishing: the screen is the reel (a tap casts and strikes, a hold reels; a drag on the stick's side walks away)
    if (G?.life?.fishing?.s && !G.ui?.anyModal?.()) { p.kind = 'fish'; Touch.hold('reel'); return; }
    // a second finger on the world: pinch zoom (with a free tap, or with the stick's finger before it has walked)
    const other = [...this.ptrs.values()].find(q => q !== p && (q.kind === 'tap' || (q.kind === 'stick' && now - q.t0 < 260 && q.moved < 14)));
    if (other) {
      if (other.kind === 'stick') this.stickEnd(other, true);
      other.kind = p.kind = 'pinch';
      this.pinch = { a: other, b: p, d: Math.hypot(p.x - other.x, p.y - other.y) || 1 };
      return;
    }
    const side = this.mirror ? x > innerWidth * 0.5 : x < innerWidth * 0.5;
    if (side && !this.stickP) { p.kind = 'stick'; this.stickStart(p); }
  }
  onMove(e) {
    const p = this.ptrs.get(e.pointerId); if (!p) return;
    p.x = e.clientX; p.y = e.clientY; p.moved = Math.max(p.moved, Math.hypot(p.x - p.x0, p.y - p.y0));
    if (p.kind === 'stick') this.stickMove(p);
    else if (p.kind === 'btn') p.h.move?.(p);
    else if (p.kind === 'edit' || p.kind === 'epan') this.editMove(p);
    else if (p.kind === 'fish' && p.moved > 26 && (this.mirror ? p.x0 > innerWidth / 2 : p.x0 < innerWidth / 2) && !this.stickP) { Touch.release('reel'); p.kind = 'stick'; this.stickStart(p); }
    else if (p.kind === 'pinch' && this.pinch) {
      const P = this.pinch, d = Math.hypot(P.a.x - P.b.x, P.a.y - P.b.y) || 1;
      Input.mouse.wheel += (P.d / d - 1) * 10; // (fingers apart: closer; game.js turns the wheel into rig.zoom)
      P.d = d;
    }
  }
  onUp(e, cancelled) {
    const p = this.ptrs.get(e.pointerId); if (!p) return;
    this.ptrs.delete(e.pointerId);
    const quick = performance.now() - p.t0;
    if (p.kind === 'btn') { p.el.classList.remove('down'); p.h.up?.(p, cancelled); }
    else if (p.kind === 'edit' || p.kind === 'epan') this.editUp(p, cancelled, quick);
    else if (p.kind === 'fish') Touch.release('reel');
    else if (p.kind === 'stick') { const tap = !cancelled && quick < STICK_TAP_MS && p.moved < TAP_PX * 0.7; this.stickEnd(p); if (tap) this.worldTap(p.x0, p.y0); }
    else if (p.kind === 'pinch') { const P = this.pinch; if (P) { const o = P.a === p ? P.b : P.a; this.pinch = null; if (this.ptrs.has(o.id)) { o.kind = 'tap'; o.t0 = -1e9; } } }
    else if (p.kind === 'tap' && !cancelled && quick < TAP_MS && p.moved < TAP_PX) {
      const D = this.ui.dlg;
      if (!this.on && D?.active && !this.ui.iris?.active) D.advance?.(); // (a dialogue: a tap anywhere on the world reads on, as a tap on its box does)
      else this.worldTap(p.x0, p.y0);
    }
  }
  // ---------------------------------------------------------------- build and decorate mode on touch
  // Touch drives the modes' own mouse paths: Actions.tcursor is the pointer they aim with (Actions.pointer), and the
  // buttons send the click and the keys they read (Input: a one-frame LMB, R). One finger: with nothing in hand it pans
  // the view and a tap clicks (a house's card, a piece to pick up); with a building or a piece in hand it moves it (a
  // tap puts it there, a drag slides it) and Place builds or sets it down; a zone or path brush paints where it drags.
  // Two fingers pan and pinch. Turn, Cancel, Store and Undo, and Done leaves the mode. On a phone the palette folds to
  // its tab bar while something is in hand (.tc-placing).
  editMode() { const G = this.G; return G?.build?.active ? 'build' : G?.housing?.decor?.active ? 'decor' : null; }
  /** what the hand holds: 'paint' (a zone or path brush), 'place' (a building, the bulldozer, a piece), or 'none' */
  editState() {
    const G = this.G, m = this.editMode();
    if (m === 'build') { const t = G.build.tool; return !t ? 'none' : t.kind === 'zone' || t.kind === 'path' ? 'paint' : 'place'; }
    if (m === 'decor') { const D = G.housing.decor; return D.sel || D.hold ? 'place' : 'none'; }
    return 'none';
  }
  editTick(dt) {
    const ui = this.ui, m = Actions.device === 'touch' && !ui.anyModal() && !ui.iris?.active ? this.editMode() : null, on = !!m;
    if (on !== !!this.editOn) {
      this.editOn = on; this.root.classList.toggle('edit', on);
      if (on) { this.setCursor(innerWidth * 0.45, innerHeight * 0.4); this.editSig = null; }
      else { Actions.tcursor.on = false; for (const [id, p] of this.ptrs) if (p.kind === 'edit' || p.kind === 'epan') { if (p.paint) this.mouseUp(); this.ptrs.delete(id); } ui.root.classList.remove('tc-placing'); }
    }
    if (!on) return;
    if (!this.u || this.u === 1) this.layout(); // (sizes before the first play frame)
    const st = this.editState(), G = this.G, D = G.housing?.decor, B = G.build;
    const sig = m + st + (m === 'build' ? B.tool?.kind : !!D?.hold) + (this.mobilePhone() ? 1 : 0);
    if (sig !== this.editSig) {
      this.editSig = sig;
      const show = (k, v) => setCls(this.$.eb[k], 'hide', !v);
      const bull = m === 'build' && B.tool?.kind === 'bulldoze';
      show('place', st === 'place'); show('rot', st === 'place' && !bull); show('cancel', st !== 'none');
      show('store', m === 'decor' && !!D?.hold); show('undo', m === 'decor'); show('done', true);
      this.$.eb.place.querySelector('b').textContent = bull ? 'Remove' : m === 'decor' ? 'Set down' : 'Build';
      ui.root.classList.toggle('tc-placing', st !== 'none' && this.mobilePhone());
      this.editLayT = 0;
    }
    this.editLayT = (this.editLayT || 0) - (dt || 0.016);
    if (this.editLayT <= 0) { this.editLayT = 0.5; this.layoutEdit(); }
  }
  mobilePhone() { return !!this.ui.mobile?.phone; }
  /** the edit buttons: Place and Turn on the thumb's side above the palette, Cancel / Store / Undo / Done on the other */
  layoutEdit() {
    const W = innerWidth, H = innerHeight, sf = this.sf || this.safe(), u = this.u || 1, $ = this.$;
    const pal = [...this.ui.root.querySelectorAll('.pw.side-bottom .panel')].map(e => e.getBoundingClientRect()).find(r => r.height > 0 && r.top < H);
    const mir = this.mirror, sideA = x => (mir ? sf.l + x : W - sf.r - x), sideB = x => (mir ? W - sf.r - x : sf.l + x);
    const palTop = pal ? pal.top : H - sf.b;
    let bottom = palTop - 12;
    // the palette's ✕ pokes up over its top corner (a tablet's palette ends under the thumb's buttons): keep Place's label clear of it
    const px = [...this.ui.root.querySelectorAll('.pw.side-bottom .ph-x')].map(e => e.getBoundingClientRect()).find(r => r.width > 0);
    if (px?.width && px.top < palTop && Math.abs((px.left + px.right) / 2 - sideA(48 * u)) < 100 * u) bottom = Math.min(bottom, px.top - 28);
    const put = (e, x, y, d) => { e.style.left = x.toFixed(1) + 'px'; e.style.top = y.toFixed(1) + 'px'; e.style.setProperty('--d', (d * u).toFixed(1) + 'px'); };
    put($.eb.place, sideA(48 * u), bottom - 38 * u, 72); put($.eb.rot, sideA(48 * u), bottom - 112 * u, 56);
    // Cancel / Store / Undo / Done: a column up the side, or, under a tall palette (a phone's open one), a row along its top
    const ks = ['cancel', 'store', 'undo', 'done'].filter(k => !$.eb[k].classList.contains('hide')), y0 = bottom - 30 * u, step = 64 * u;
    const column = y0 - (ks.length - 1) * step >= sf.t + 160 * u;
    ks.forEach((k, i) => put($.eb[k], sideB(40 * u + (column ? 0 : i * 68 * u)), column ? y0 - i * step : y0, 56));
  }
  editAct(k) {
    const G = this.G, m = this.editMode(); if (!m) return;
    const B = G.build, D = G.housing?.decor;
    if (k === 'place') this.click();
    else if (k === 'rot') this.keyTap('r');
    else if (k === 'cancel') { if (m === 'build') B.setTool(null); else D?.cancel?.(); }
    else if (k === 'store') D?.storeHeld?.();
    else if (k === 'undo') D?.undo?.();
    else if (k === 'done') { if (m === 'build') B.exit(); else D?.exit?.(); }
    this.editSig = null;
  }
  editDown(p) {
    const other = [...this.ptrs.values()].find(q => q !== p && (q.kind === 'edit' || q.kind === 'epan'));
    if (other) { // two fingers: pan and pinch (a stroke of paint in progress ends)
      if (other.paint) { other.paint = false; this.mouseUp(); }
      other.kind = p.kind = 'epan'; this.epan = { a: other, b: p, d: Math.hypot(p.x - other.x, p.y - other.y) || 1, cx: (p.x + other.x) / 2, cy: (p.y + other.y) / 2 };
      return;
    }
    p.kind = 'edit';
    const st = this.editState();
    if (st === 'paint') { this.setCursor(p.x, p.y); this.mouseDown(); p.paint = true; }
    else if (st === 'place') { this.setCursor(p.x, p.y); p.drag = 'cursor'; }
    else p.drag = 'pan';
  }
  editMove(p) {
    if (p.kind === 'epan' && this.epan) {
      const E = this.epan, cx = (E.a.x + E.b.x) / 2, cy = (E.a.y + E.b.y) / 2, d = Math.hypot(E.a.x - E.b.x, E.a.y - E.b.y) || 1;
      this.pan(cx - E.cx, cy - E.cy); Input.mouse.wheel += (E.d / d - 1) * 10; E.cx = cx; E.cy = cy; E.d = d;
    } else if (p.paint || p.drag === 'cursor') this.setCursor(p.x, p.y);
    else if (p.drag === 'pan' && p.moved > TAP_PX * 0.6) this.pan(p.x - p.lx, p.y - p.ly);
    p.lx = p.x; p.ly = p.y;
  }
  editUp(p, cancelled, quick) {
    if (p.kind === 'epan') { const E = this.epan; if (E) { const o = E.a === p ? E.b : E.a; this.epan = null; if (this.ptrs.has(o.id)) { o.kind = 'edit'; o.drag = 'pan'; o.lx = o.x; o.ly = o.y; } } return; }
    if (p.paint) { this.mouseUp(); return; }
    if (!cancelled && p.drag === 'pan' && p.moved < TAP_PX && quick < TAP_MS) { this.setCursor(p.x0, p.y0); this.click(); } // (a tap with nothing in hand: a house's card, a piece to pick up)
  }
  setCursor(x, y) { const c = Actions.tcursor; c.on = true; c.x = x; c.y = y; c.nx = x / innerWidth * 2 - 1; c.ny = -(y / innerHeight) * 2 + 1; c.overUI = false; Input.mouse.overUI = false; }
  /** a one-frame left click at the cursor, as Input sees a sub-frame one */
  click() { Input.mouse.overUI = false; Input.mDown.add(0); Input.mPressed.add(0); Input.mUpLatch.add(0); }
  mouseDown() { Input.mouse.overUI = false; Input.mDown.add(0); Input.mPressed.add(0); Input.mUpLatch.delete(0); }
  mouseUp() { Input.mReleased.add(0); if (Input.mPressed.has(0)) Input.mUpLatch.add(0); else Input.mDown.delete(0); }
  keyTap(k) { Input.keys.add(k); Input.pressed.add(k); Input.upLatch.add(k); }
  /** pan the build or decorate view by a screen drag (the ground under the finger follows it) */
  pan(dx, dy) {
    const G = this.G, E = G.engine, rig = E.rig, foc = G.build?.active ? G.buildFocus : G.decorFocus; if (!foc) return;
    const { f, r } = rig.groundAxes(), mpp = 2 * (rig.dist + (rig.distBias || 0)) * Math.tan(E.camera.fov * Math.PI / 360) / innerHeight;
    foc.addScaledVector(r, -dx * mpp).addScaledVector(f, dy * mpp / Math.max(0.3, Math.sin(rig.pitch)));
    if (G.decorFocus === foc) G.housing?.clampFocus?.(foc, -1.2);
  }

  /** the quest arrow's edge point, moved out of the HUD corners (down out of the top ones, sideways out of the cluster) */
  avoidArrow(x, y) {
    const [tl, tr, cl] = this.boxes; if (!cl) return [x, y];
    const inside = (b) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3];
    if (inside(tl)) y = tl[3] + 8; if (inside(tr)) y = tr[3] + 8;
    if (inside(cl)) x = this.mirror ? cl[2] + 8 : cl[0] - 8;
    return [x, y];
  }
  worldTap(x, y) { if (this.on) Touch.taps.push({ x, y, t: performance.now() }); }
  /** a small ring where a tap landed (game.js touchTap: 'walk', 'use', 'foe') */
  ping(x, y, kind = 'walk') {
    const r = el('i', 'tc-ping ' + kind); r.style.left = x + 'px'; r.style.top = y + 'px';
    this.$.pings.appendChild(r); setTimeout(() => r.remove(), 520);
  }
  releaseAll(keepWheel) {
    for (const p of this.ptrs.values()) { if (p.kind === 'btn') { p.el.classList.remove('down', 'aiming', 'cancel'); } }
    this.ptrs.clear(); this.pinch = null;
    if (this.stickP) this.stickEnd(this.stickP, true);
    const hero = keepWheel && this.wheelHold;
    Touch.releaseAll();
    if (hero) Touch.hold('hero'); else this.wheelHold = false;
    this.aimP = null; this.aimOffIn = 0;
  }
  buzz(ms) { if (Actions.device === 'touch') Touch.buzz(ms); }

  // ---------------------------------------------------------------- the floating stick
  stickStart(p) {
    const r = STICK.r * this.u, W = innerWidth, H = innerHeight, sf = this.sf || { l: 0, r: 0, t: 0, b: 0 };
    this.stickP = p;
    p.bx = clamp(p.x0, sf.l + r + 6, W - sf.r - r - 6); p.by = clamp(p.y0, sf.t + r + 6, H - sf.b - r - 6);
    const S = this.$.stick; S.classList.remove('rest'); S.classList.add('live');
    S.style.transform = `translate3d(${p.bx}px,${p.by}px,0)`;
    Touch.stick.on = true; Touch.stick.mag = 0; Touch.stick.x = 0; Touch.stick.y = 0;
    this.stickMove(p);
  }
  stickMove(p) {
    const R = STICK.r * this.u, S = this.$.stick;
    let dx = p.x - p.bx, dy = p.y - p.by, d = Math.hypot(dx, dy);
    if (d > R * STICK.follow) { const k = (d - R * STICK.follow) / d; p.bx += dx * k; p.by += dy * k; dx = p.x - p.bx; dy = p.y - p.by; d = Math.hypot(dx, dy); S.style.transform = `translate3d(${p.bx}px,${p.by}px,0)`; } // (the base follows a long push)
    const k = d / R, T = Touch.stick;
    if (k < STICK.dz) { T.mag = 0; T.x = 0; T.y = 0; }
    else { const s = Math.min(1, (k - STICK.dz) / (0.9 - STICK.dz)); T.mag = STICK.min + (1 - STICK.min) * s; T.x = dx / d; T.y = -dy / d; }
    const sprint = k >= STICK.sprint;
    if (sprint !== T.sprint) { T.sprint = sprint; if (sprint) { Touch.hold('sprint'); this.buzz(10); } else Touch.release('sprint'); S.classList.toggle('sprint', sprint); }
    const kk = Math.min(d, R) / (d || 1);
    this.$.knob.style.transform = `translate3d(${(dx * kk).toFixed(1)}px,${(dy * kk).toFixed(1)}px,0)`;
  }
  stickEnd(p) {
    if (this.stickP !== p) return;
    this.stickP = null;
    const T = Touch.stick; T.on = false; T.mag = 0; T.x = 0; T.y = 0;
    if (T.sprint) { T.sprint = false; Touch.release('sprint'); }
    this.$.stick.classList.remove('sprint', 'live');
    this.stickRest();
  }
  stickRest() {
    const S = this.$.stick, r = this.rest || { x: 120, y: innerHeight - 110 };
    S.classList.add('rest');
    S.style.transform = `translate3d(${r.x.toFixed(1)}px,${r.y.toFixed(1)}px,0)`;
    this.$.knob.style.transform = 'translate3d(0,0,0)';
  }

  // ---------------------------------------------------------------- the skill buttons
  /** slot i: the attack (0) always holds (A: tap, hold to charge, repeat); skills hold too in Auto aim, and in Drag
   *  aim a drag off the button aims: a charge holds from the press, any other skill casts when let go */
  slotH(i) {
    const act = SLOT_ACTS[i];
    return {
      down: p => {
        const G = this.G, id = G?.state?.player?.hotbar?.[i];
        if (!id) { p.empty = true; return; }
        p.drag = i > 0 && this.aimMode === 1;
        p.holdNow = !p.drag || (chargeable(id) && (this.ui.settings.chargeMode ?? 0) === 0);
        if (p.holdNow) Touch.hold(act);
        this.ui.hud.flashSlot(i);
      },
      move: p => {
        if (!p.drag || p.empty) return;
        const dx = p.x - p.cx, dy = p.y - p.cy, d = Math.hypot(dx, dy);
        if (!p.aiming && d > AIM_DEAD) { p.aiming = true; p.el.classList.add('aiming'); }
        if (!p.aiming) return;
        const cancel = d < p.rad * 0.7;
        if (cancel !== !!p.cancel) { p.cancel = cancel; p.el.classList.toggle('cancel', cancel); if (cancel) this.buzz(6); }
        const A = Touch.aim;
        A.on = !cancel; A.x = dx / (d || 1); A.y = -dy / (d || 1); A.mag = clamp((d - AIM_DEAD) / (AIM_FULL - AIM_DEAD), 0.04, 1);
        this.aimP = p; this.aimOffIn = 0;
        p.el.querySelector('.tc-aimdir').style.transform = `rotate(${Math.atan2(dy, dx).toFixed(3)}rad)`;
      },
      tick: p => { // a still press on a drag-aimed skill that doesn't charge: past a moment it holds (repeats) as in Auto
        if (p.drag && !p.empty && !p.holdNow && !p.held && !p.aiming && performance.now() - p.t0 > HOLD_MS) { p.held = true; Touch.hold(act); }
      },
      up: (p, cancelled) => {
        p.el.classList.remove('aiming', 'cancel');
        if (p.empty) { if (!cancelled && p.moved < TAP_PX * 2) this.ui.hud.openAssign(i, p.el); return; }
        if (cancelled || p.cancel) { if (p.holdNow) this.G?.skills?.charge?.cancel?.('cancel'); Touch.release(act); this.aimOff(); return; }
        if (p.holdNow || p.held) Touch.release(act); else Touch.pulse(act);
        if (p.aiming) this.aimOffIn = 2; // (the aim holds through the cast's frame: game.js feeds it, the charge releases with it)
      },
    };
  }
  aimOff() { const A = Touch.aim; A.on = false; A.mag = 0; this.aimP = null; this.aimOffIn = 0; }
  tickMark() {
    const G = this.G, A = Touch.aim, P = G?.player, pa = G?.padAim;
    const p = this.aimP, aiming = !!(p && this.ptrs.has(p.id) && p.aiming);
    if (!aiming || !P || !pa || G.mode === 'interior') { this.mark.hide(); return; }
    this.mark.show(G, P.pos, pa.lock ? pa.lock.pos : pa.point, !!pa.lock, !!p.cancel, A.mag);
  }

  // ---------------------------------------------------------------- the hero button
  heroH() {
    return {
      down: p => {
        const H = this.G?.heroes;
        if (H?.wheelOpen) { H.pickFromWheel(null); this.endWheelHold(); p.skip = true; return; } // (a tap on it while the wheel is up closes it)
        Touch.hold('hero');
      },
      move: p => { // with the wheel up, the finger slides onto a card
        const H = this.G?.heroes; if (p.skip || !H?.wheelOpen || p.moved < 20) return;
        const card = document.elementFromPoint(p.x, p.y)?.closest?.('.hw-card');
        const i = card ? H.wheel.cards.findIndex(c => c.el === card) : -1;
        if (i >= 0) H.wheel.select(i);
      },
      up: (p, cancelled) => {
        if (p.skip) return;
        const H = this.G?.heroes;
        if (H?.wheelOpen) {
          const card = !cancelled && p.moved >= 20 ? document.elementFromPoint(p.x, p.y)?.closest?.('.hw-card') : null;
          if (card) { const i = H.wheel.cards.findIndex(c => c.el === card); H.wheel.select(i); Touch.release('hero'); return; } // (heroes.js: letting go picks the highlight)
          this.wheelHold = true; return; // (the wheel stays up, 'hero' still held, for a tap on a card or anywhere to close)
        }
        Touch.release('hero'); // (a tap: the next hero)
      },
    };
  }
  endWheelHold() { this.wheelHold = false; Touch.release('hero'); }
  /** the hero wheel on touch: a scrim behind it, the toasts, tips, quest arrow and world labels hidden (touch.css:
   *  .tc-wheel), and the wheel fitted into the free play area (inside the safe area, above the orbs and belt, beside
   *  the thumb cluster and the top-right buttons). The ring when it fits at 85% or more (a tablet); else the cards in a
   *  row under a pill hub (a phone), so 5 or more heroes stay readable. */
  fitWheel() {
    const H = this.G?.heroes, wh = H?.wheel, R = this.ui.root;
    R.classList.toggle('tc-wheel', !!H?.wheelOpen && Actions.device === 'touch');
    if (!wh || Actions.device !== 'touch') return;
    const W = innerWidth, Hh = innerHeight, sf = this.sf || this.safe(), cards = wh.cards, n = cards.length;
    const bc = this.ui.hud.$.bc.getBoundingClientRect(), hr = (this.$.hero.hidden ? this.$.bag : this.$.hero).getBoundingClientRect(), cl = this.clusterBox;
    let L = sf.l + 10, Rr = W - sf.r - 10;
    if (cl) { if (this.mirror) L = Math.max(L, cl[2] + 8); else Rr = Math.min(Rr, cl[0] - 8, hr.width ? hr.left - 8 : Rr); }
    const T = sf.t + 8, B = Math.min(Hh - sf.b - 8, bc.height ? bc.top - 6 : Hh);
    const FW = Math.max(200, Rr - L), FH = Math.max(160, B - T);
    let ex = 0, ey = 0;
    for (const c of cards) { ex = Math.max(ex, Math.abs(parseFloat(c.el.style.getPropertyValue('--x')) || 0)); ey = Math.max(ey, Math.abs(parseFloat(c.el.style.getPropertyValue('--y')) || 0)); }
    const kRing = Math.min(1, FW / (2 * ex * 1.08 + 170), FH / (2 * ey * 1.08 + 196));
    const SP = 146, kRow = Math.min(1, FW / (SP * n + 16), FH / 252);
    const row = kRing < 0.85 && kRow > kRing, k = row ? kRow : kRing;
    wh.root.classList.toggle('tc-row', row);
    if (row) cards.forEach((c, i) => { c.el.style.setProperty('--x', `${((i - (n - 1) / 2) * SP).toFixed(1)}px`); c.el.style.setProperty('--y', '40px'); });
    const st = wh.root.style;
    st.setProperty('--tc-wl', L.toFixed(1) + 'px'); st.setProperty('--tc-wt', T.toFixed(1) + 'px');
    st.setProperty('--tc-ww', FW.toFixed(1) + 'px'); st.setProperty('--tc-wh', FH.toFixed(1) + 'px');
    st.setProperty('--tc-wheel', Math.max(0.4, k).toFixed(3));
  }
}

// ---------------------------------------------------------------- the ground aim mark (drag-to-aim)
// A trail of cream chevrons from the hero toward the aim and a ring where it lands (none on a locked foe: padAim's ring
// is there). Two flat planes on canvas textures, normal blending (it never washes the screen out), drawn over the
// ground; greyed when the drag is back on its button (let go: cancelled).
class AimMark {
  constructor() { this.group = null; this.world = null; this.t = 0; }
  make() {
    const tcv = document.createElement('canvas'); tcv.width = 64; tcv.height = 64;
    const g = tcv.getContext('2d'); g.lineCap = 'round'; g.lineJoin = 'round';
    for (const [w, col] of [[13, '#4a2c2a'], [6.5, '#fff6e8']]) { g.beginPath(); g.moveTo(14, 20); g.lineTo(32, 42); g.lineTo(50, 20); g.lineWidth = w; g.strokeStyle = col; g.stroke(); }
    const tt = new THREE.CanvasTexture(tcv); tt.colorSpace = THREE.SRGBColorSpace; tt.wrapT = THREE.RepeatWrapping; tt.anisotropy = 4;
    const tg = new THREE.PlaneGeometry(0.62, 1); tg.translate(0, -0.5, 0); tg.rotateX(-Math.PI / 2); // (spans z 0..1: scale.z is the length)
    const mat = o => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false, opacity: 0.92, polygonOffset: true, polygonOffsetFactor: -4, ...o });
    this.trail = new THREE.Mesh(tg, mat({ map: tt })); this.trail.renderOrder = 8; this.trail.frustumCulled = false;
    const N = 256, rcv = document.createElement('canvas'); rcv.width = rcv.height = N;
    const r = rcv.getContext('2d'), c = N / 2; r.lineCap = 'round';
    for (const [w, col] of [[22, '#4a2c2a'], [12, '#fff6e8']]) { r.beginPath(); r.arc(c, c, 98, 0, Math.PI * 2); r.lineWidth = w; r.strokeStyle = col; r.stroke(); }
    r.setLineDash([22, 18]); r.beginPath(); r.arc(c, c, 98, 0, Math.PI * 2); r.lineWidth = 5; r.strokeStyle = '#ff8fb0'; r.stroke(); r.setLineDash([]);
    r.beginPath(); r.arc(c, c, 16, 0, Math.PI * 2); r.fillStyle = '#ffcf4a'; r.fill(); r.lineWidth = 7; r.strokeStyle = '#4a2c2a'; r.stroke();
    const rt = new THREE.CanvasTexture(rcv); rt.colorSpace = THREE.SRGBColorSpace; rt.anisotropy = 4;
    const rg = new THREE.PlaneGeometry(1.7, 1.7); rg.rotateX(-Math.PI / 2);
    this.ring = new THREE.Mesh(rg, mat({ map: rt })); this.ring.renderOrder = 8; this.ring.frustumCulled = false;
    this.group = new THREE.Group(); this.group.name = 'touchAimMark'; this.group.add(this.trail, this.ring);
  }
  show(G, from, to, locked, cancel, mag) {
    if (!this.group) this.make();
    const W = G.world;
    if (this.world !== W || this.group.parent !== W.scene) { this.group.removeFromParent(); W.scene.add(this.group); this.world = W; }
    this.group.visible = true;
    this.t += 1 / 60;
    const dx = to.x - from.x, dz = to.z - from.z, d = Math.hypot(dx, dz) || 1e-3, ux = dx / d, uz = dz / d;
    const y = Math.max(from.y, to.y ?? from.y) + 0.07, start = 0.55, len = Math.max(0.2, d - start - (locked ? 0.7 : 0.5));
    this.trail.position.set(from.x + ux * start, y, from.z + uz * start);
    this.trail.rotation.y = Math.atan2(ux, uz);
    this.trail.scale.set(1, 1, len);
    const map = this.trail.material.map; map.repeat.set(1, len / 0.55); map.offset.y = (this.t * 1.6) % 1;
    this.ring.visible = !locked;
    this.ring.position.set(to.x, (to.y ?? y) + 0.07, to.z);
    this.ring.rotation.y += 0.02;
    const s = 0.9 + 0.35 * mag; this.ring.scale.set(s, 1, s);
    const col = cancel ? '#b9b0b8' : '#ffffff', op = cancel ? 0.45 : 0.92;
    for (const m of [this.trail.material, this.ring.material]) { m.color.set(col); m.opacity = op; }
  }
  hide() { if (this.group) this.group.visible = false; }
}
