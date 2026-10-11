// The gamepad in build mode and decorate mode (docs/CONTROLS.md §2–3 and §14.5–14.6, ROADMAP CT-2 and CT-11).
//   - Each input keeps to its own job: the D-pad and the bumpers drive the palette, the sticks the world, and A acts on
//     whichever has the focus. Three states, the same in both modes:
//       palette: the palette is up and the focus ring is on a card (LB / RB the tabs, the D-pad the grid, A picks it up);
//       cursor:  the palette folds to its tab strip and the paw cursor is bright (a left-stick push from the palette);
//       holding: a building, a tool or a piece is in hand (the palette folded, with its chip).
//   - The left stick moves the paw (Actions.vcursor; world/buildMode.js and home/decorate.js aim with Actions.pointer(),
//     so the ghost, the highlight and the snapping work as with the mouse). Pushed into an edge it pans the camera; the
//     right stick pans it too. The D-pad in the world nudges it a tile (decorate: a 0.5 m cell).
//   - B puts what's in hand back (from the palette: the palette opens on its card; a piece moved in the room goes back
//     where it was), and with nothing in hand leaves the mode. LB / RB from the world open the palette (on its tab).
//     LT / RT with nothing in hand turn the camera (build) or zoom (decorate); in hand the mode's own file rotates the
//     piece with them. View cycles build mode's coverage overlays. Menu opens the tabbed menu (ui/padMenu.js).
//   - buildMode.js and decorate.js take A, X, Y (undo) and LT / RT in hand once the world has the focus
//     (Actions.vcursor.world). A footer of glyph hints names what works now; the focus ring marks the palette's card.
import { Vector3 } from 'three';
import { Actions } from '../core/actions.js';
import { el } from './dom.js';
import { padGlyph } from './padGlyphs.js';
import { FURNITURE, SURFACES, CELL } from '../home/furniture.js';

const SPEED = 820; // px/s at full tilt (at UI scale 1)
const EDGE = 54;   // px from the screen edge where the cursor pans the camera
const PUSH = 0.3;  // a left-stick push past this leaves the palette for the cursor
const _v = new Vector3();

export class PadCursor {
  constructor(ui) {
    this.ui = ui; this.on = false; this.x = 0; this.y = 0; this._t = 0; this.bst = 'pal';
    this.root = el('div', 'pad-cursor'); this.root.innerHTML = '<i class="pc-paw"></i><i class="pc-dot"></i>';
    this.hintsEl = el('div', 'pad-hints pc-hints');
    ui.layers.over.appendChild(this.root); ui.layers.over.appendChild(this.hintsEl);
  }
  get G() { return this.ui.G; }
  get mode() { const G = this.G; return G?.build?.active ? 'build' : G?.housing?.decor?.active ? 'decor' : null; }
  /** the mode's pad state now: 'pal' | 'cur' | 'hold' (null while the cursor is off) */
  get state() { return !this.mode0 || !this.on ? null : this.handKey() ? 'hold' : this.bst; }
  /** the open mode's palette panel */
  get P() { return this.mode0 === 'decor' ? this.ui.panels.decorate : this.ui.panels.build; }
  /** per frame from UI.padInput → true while the virtual cursor is in charge */
  update() {
    const A = Actions, m = this.mode, now = performance.now(), dt = Math.min(0.05, (now - (this._t || now)) / 1000); this._t = now;
    if (!m) this.mode0 = null; // (the mode is over: the next one starts fresh; the menu or a mouse move over it only pauses this)
    if (A.device !== 'pad' && !this.on) { if (this._paused) this.stop(); return false; }
    const live = A.device === 'pad' && !!m && !this.ui.anyModal() && !this.ui.dlg?.active && !this.ui.pop?.classList.contains('show');
    if (!live) { if (A.device === 'pad' && m) this.pause(); else this.stop(); return false; } // (the menu or a dialogue over the mode: it waits as it is)
    if (!this.on || this.mode0 !== m) {
      if (this.on || this._paused) this.stop();
      this.on = true; this.root.classList.add('on');
      if (this.mode0 !== m) { // a fresh start
        this.mode0 = m; this.x = innerWidth / 2; this.y = innerHeight * (m === 'build' ? 0.4 : 0.42);
        this.cur = null; this._focusKey = null; this.bst = 'pal'; this._held = null; this._heldKind = null;
      }
    }
    this._paused = false;
    const N = this.ui.padNav; if (N?.hintsEl.classList.contains('on')) { N.blur(); N.cur = null; N.scopeKey = ''; N.hintsEl.classList.remove('on'); } // (a panel's glyph footer, left over from the menu that brought us here)
    // Menu: the tabbed menu over the mode; closing it comes back here as it was
    if (A.pressed('menu', 'pad')) { A.consume('menu', 'pad'); this.ui.padMenu ? this.ui.padMenu.open() : this.ui.open('menu'); return true; }
    // View answers a guide's "Got it!" first (the decorating guide's last steps), as it does in play (ui.js padInput)
    const T = this.ui.tutorial; if (A.pressed('map', 'pad') && T?.root.classList.contains('on') && T.$.obj.classList.contains('ack')) { A.consume('map', 'pad'); T.onAck?.(); }
    return this.edit(dt, m);
  }
  /** a menu or a dialogue over the mode: the cursor and its hints hide, the palette keeps its pad layout */
  pause() {
    if (!this.on) return;
    this.on = false; this._paused = true; Actions.vcursor.on = false;
    this.root.classList.remove('on'); this.hintsEl.classList.remove('on');
  }
  stop() {
    if (!this.on && !this._paused) return;
    this.on = false; this._paused = false; Actions.vcursor.on = false; Actions.vcursor.world = false;
    this.root.classList.remove('on', 'dim'); this.hintsEl.classList.remove('on'); this.ui.padNav?.ring.classList.remove('on');
    for (const P of [this.ui.panels.build, this.ui.panels.decorate]) if (P?.panel) P.panel.classList.remove('pc-pal', 'pc-fold', 'pc-hold');
    this._fEl?.classList.remove('pc-f'); this._fEl = null;
    const B = this.ui.panels.build; if (B?.isOpen && B.cat === 'tools') B.render(true); // (the mouse and touch: the toolbar again)
    this.ui.root?.classList.remove('pc-up', 'pc-folded');
    this.cur = null;
  }
  // ---------------------------------------------------------------- the modes' hands
  /** what's in hand, as a key ('b:<building>' · 'z:<tool>' · 'f:<furniture>'), or null */
  handKey() {
    const G = this.G;
    if (this.mode0 === 'build') { const t = G.build.tool; return t ? this.toolKey(t) : null; }
    const D = G.housing?.decor, id = D?.hold?.it.id || D?.sel; return id ? 'f:' + id : null;
  }
  hand() { return !!this.handKey(); }
  toolKey(t) { return t.kind === 'building' ? 'b:' + t.type : 'z:' + (t.kind === 'bulldoze' ? 'bulldoze' : t.kind === 'path' ? (t.erase ? 'path0' : 'path') : ({ 1: 'R', 2: 'C', 3: 'W' }[t.zone] || 'zone0')); }
  /** B or a bumper with something in hand: it goes back (a piece from the palette: the palette opens on its card; a piece
   *  moved in the room: back where it was, the cursor stays) */
  putBack(P) {
    const G = this.G, k = this.handKey(); if (!k) return;
    if (this.mode0 === 'build') { P.clearSelection(); G.build.setTool(null); this.bst = 'pal'; }
    else { const moved = !!G.housing.decor.hold; G.housing.decor.cancel(); this.bst = moved ? 'cur' : 'pal'; }
    this._held = null;
    if (this.bst === 'pal') this.focusKey(P, k);
    this.ui.sfx('close');
  }
  exitMode() { const G = this.G; if (this.mode0 === 'build') G.build.exit(); else G.housing.decor.exit(); this.stop(); this.mode0 = null; }

  // ---------------------------------------------------------------- per frame: either mode
  edit(dt, m) {
    const A = Actions, G = this.G, P = this.P, rig = G.engine.rig, { f, r } = rig.groundAxes(), build = m === 'build';
    if (!P?.$) return true;
    // the hand emptied by itself (a unique building or the last piece placed, a moved piece put down, the mouse, touch):
    // a piece from the palette opens it on that card, a piece moved in the room leaves the cursor where it is
    const heldNow = this.handKey(), kind = build ? 'pal' : G.housing.decor.hold ? 'cur' : 'pal';
    if (this._held && !heldNow) { this.bst = this._heldKind || 'pal'; if (this.bst === 'pal') this.focusKey(P, this._held); }
    this._held = heldNow; if (heldNow) this._heldKind = kind;
    // LB / RB: the category tabs; from the world the first press opens the palette on its tab (what's in hand goes back)
    if (A.padHit('LB') || A.padHit('RB')) {
      const d = A.padHit('RB') ? 1 : -1; A.padConsume('LB'); A.padConsume('RB');
      if (this.hand()) { this.putBack(P); this.bst = 'pal'; if (!this.cur) this.cur = this.firstCard(P); }
      else if (this.bst !== 'pal') { this.bst = 'pal'; this.ui.sfx('tab'); }
      else this.tabStep(P, d);
    }
    // B: put it back; with nothing in hand, done
    if (A.padHit('B')) { A.padConsume('B'); if (this.hand()) this.putBack(P); else { this.exitMode(); return true; } }
    // the left stick: the cursor (a push from the palette folds it)
    const mv = A.move();
    if (this.bst === 'pal' && !this.hand() && mv.pad && mv.mag > PUSH) { this.bst = 'cur'; this.ui.sfx('tab'); }
    const world = this.hand() || this.bst !== 'pal';
    this.sticks(m, f, r, dt, world);
    // the D-pad: the palette's grid, or in the world a nudge (a tile; decorate: a 0.5 m cell)
    if (A.dnav) { if (world) this.nudge(A.dnav, f, r, build ? 1 : CELL); else this.gridStep(P, A.dnav); }
    // A on a card: pick it up (in the world, the mode's own file takes A)
    if (!world && A.padHit('A')) { A.padConsume('A'); this.pickFocused(P); }
    // LT / RT with nothing in hand (or a build tool that doesn't turn): turn the camera a quarter (build) or zoom (decorate)
    if (build) { if (G.build.tool?.kind !== 'building') { if (A.padHit('LT')) { A.padConsume('LT'); rig.yawTarget += Math.PI / 2; this.ui.sfx('tab'); } if (A.padHit('RT')) { A.padConsume('RT'); rig.yawTarget -= Math.PI / 2; this.ui.sfx('tab'); } } }
    else if (!this.hand()) { const z = (A.padDown('RT') ? 1 : 0) - (A.padDown('LT') ? 1 : 0); if (z) { this._zacc = (this._zacc || 0) + z * dt * 6; while (Math.abs(this._zacc) >= 1) { rig.zoom(Math.sign(this._zacc)); this._zacc -= Math.sign(this._zacc); } } }
    if (build && A.padHit('View')) { A.padConsume('View'); this.overlayNext(); }
    this.publish(this.hand() || this.bst !== 'pal');
    this.syncPalette(P);
    this.drawRing(this.bst === 'pal' && !this.hand() ? this.cur : null);
    this.hints(m);
    return true;
  }
  /** the left stick: the cursor (pushed into an edge, the camera follows) and the right stick: pan */
  sticks(m, f, r, dt, cursorOn = true) {
    const A = Actions, s = Math.max(0.6, this.ui.scale || 1), mv = A.move();
    let px = 0, py = 0;
    if (cursorOn && mv.pad && mv.mag > 0) {
      if (!this._moving) { this._moving = true; this.ui.tip.hide(); }
      this.x += mv.x * mv.mag * SPEED * s * dt; this.y -= mv.y * mv.mag * SPEED * s * dt;
      if (this.x < EDGE && mv.x < 0) px = mv.x * mv.mag; else if (this.x > innerWidth - EDGE && mv.x > 0) px = mv.x * mv.mag;
      if (this.y < EDGE && mv.y > 0) py = mv.y * mv.mag; else if (this.y > this.floorY() - EDGE && mv.y < 0) py = mv.y * mv.mag;
    } else this._moving = false;
    this.x = Math.max(8, Math.min(innerWidth - 8, this.x)); this.y = Math.max(8, Math.min(this.floorY() - 8, this.y));
    const rs = A.aim(); px += rs.x * rs.mag; py += rs.y * rs.mag;
    if (px || py) this.pan(m, f, r, px, py, dt);
  }
  /** the lowest the cursor goes: above the palette (folded, it's the tab strip alone) */
  floorY() { const P = this.P; const t = P?.isOpen && P.panel ? P.panel.getBoundingClientRect().top : innerHeight; return Math.max(innerHeight * 0.5, Math.min(innerHeight, t)); }
  publish(world) {
    const V = Actions.vcursor; V.on = true; V.world = world; V.x = this.x; V.y = this.y; V.nx = (this.x / innerWidth) * 2 - 1; V.ny = -(this.y / innerHeight) * 2 + 1; V.overUI = false;
    this.root.style.transform = `translate(${this.x.toFixed(1)}px,${this.y.toFixed(1)}px)`;
    this.root.classList.toggle('dim', !world); // (the palette has the focus: the cursor waits, dimmed)
  }
  pan(m, f, r, x, y, dt) {
    const G = this.G;
    if (m === 'build') {
      const B = G.buildFocus || (G.buildFocus = G.player.pos.clone());
      B.addScaledVector(r, x * 18 * dt).addScaledVector(f, y * 18 * dt);
    } else {
      const D = G.housing.decor; D.focus.addScaledVector(r, x * 6 * dt).addScaledVector(f, y * 6 * dt); G.housing.clampFocus?.(D.focus, -1.2);
    }
  }

  // ---------------------------------------------------------------- the palette
  /** the palette's state on the panel and the UI root (pad.css: the grid, folded, the toasts and the prompt clear of it) */
  syncPalette(P) {
    const hold = this.hand(), fold = hold || this.bst !== 'pal', pn = P.panel;
    pn.classList.add('pc-pal'); pn.classList.toggle('pc-fold', fold); pn.classList.toggle('pc-hold', hold);
    this.ui.root.classList.toggle('pc-up', !fold); this.ui.root.classList.toggle('pc-folded', fold);
    // the focus: still on the page (a re-render makes new cards: find its twin), else the first card
    if (!this.cur?.isConnected) this.cur = this.findKey(P, this._focusKey) || null;
    if (!this.cur && !fold) this.cur = this.firstCard(P);
    if (this._fEl !== this.cur) { this._fEl?.classList.remove('pc-f'); this.cur?.classList.add('pc-f'); this._fEl = this.cur; if (this.cur) { this._focusKey = cardKey(this.cur); this.scrollTo(this.cur); } }
    const now = performance.now(), want = fold ? null : this.cur, tk = this.handKey() || '';
    if (this._pdFor !== want || this._hcFor !== tk || now - (this._pdT || 0) > 500) { // (the costs and counts follow the storage: twice a second)
      this._pdFor = want; this._hcFor = tk; this._pdT = now;
      P.padDetail(want);
      P.heldChip(this.mode0 === 'build' ? this.G.build.tool : P.opts.state?.());
    }
  }
  firstCard(P) { const cs = [...P.$.cards.querySelectorAll('.card')]; return cs.find(c => c.dataset.z || !c.classList.contains('locked')) || cs[0] || null; }
  findKey(P, k) { if (!k) return null; return P.$.cards.querySelector(k.startsWith('z:') ? `.card[data-z="${k.slice(2)}"]` : `.card[data-id="${CSS.escape(k.slice(2))}"]`); }
  /** focus a card by its key, on the tab that holds it (a building's category or Tools; decorate: this tab, else All, or
   *  Wallpaper & Floors) */
  focusKey(P, k) {
    if (this.mode0 === 'decor' && !SURFACES[k.slice(2)] && !(this.G.state.furniture?.[k.slice(2)] > 0)) { this._focusKey = null; this.cur = this.firstCard(P); return; } // (the last one was placed: this tab's first card)
    if (!this.findKey(P, k)) {
      const id = k.slice(2), want = this.mode0 === 'decor' ? (SURFACES[id] ? 'surface' : 'all') : k.startsWith('z:') ? 'tools' : (P.opts.categories || []).find(c => (c.items || []).some(i => i.id === id))?.id;
      const t = want && P.$.tabs.querySelector(this.mode0 === 'decor' ? `.tab[data-t="${want}"]` : `.tab[data-c="${want}"]`); if (t && !t.classList.contains('on')) t.click();
    }
    this._focusKey = k; this.cur = this.findKey(P, k);
  }
  scrollTo(c) { const box = c.parentElement; if (!box) return; const r = c.getBoundingClientRect(), b = box.getBoundingClientRect(); if (r.top < b.top + 4 || r.bottom > b.bottom - 4) { try { c.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (x) { /* */ } } }
  tabStep(P, d) {
    const tabs = [...P.$.tabs.querySelectorAll('.tab')].filter(t => t.offsetParent);
    if (tabs.length < 2) return;
    let i = tabs.findIndex(t => t.classList.contains('on')); if (i < 0) i = 0;
    tabs[(i + d + tabs.length) % tabs.length].click(); // (the panel: the category, a fresh render, its sound)
    this.cur = this.firstCard(P); this._focusKey = this.cur ? cardKey(this.cur) : null;
  }
  /** the D-pad over the grid: ◀ ▶ along a row (onto the next row at its end), ▲ ▼ a row up or down (the last card of a shorter row) */
  gridStep(P, dir) {
    const cs = [...P.$.cards.querySelectorAll('.card')]; if (!cs.length) return;
    const i = cs.indexOf(this.cur); if (i < 0) { this.cur = this.firstCard(P); return; }
    const top0 = cs[0].offsetTop, cols = Math.max(1, cs.filter(c => c.offsetTop === top0).length);
    const n = dir === 'left' ? i - 1 : dir === 'right' ? i + 1 : dir === 'up' ? i - cols : Math.min(cs.length - 1, i + cols);
    if (n < 0 || n >= cs.length || (dir === 'down' && Math.floor(n / cols) === Math.floor(i / cols))) { this.bump(); return; }
    this.cur = cs[n]; this.ui.sfx('hover');
  }
  /** A on the focused card: pick it up (a locked or unaffordable one says why and stays; decorate's wallpaper and floors
   *  are used at once) */
  pickFocused(P) {
    const c = this.cur?.isConnected ? this.cur : null; if (!c) return;
    if (this.mode0 === 'decor') {
      const id = c.dataset.id;
      if (SURFACES[id]) { c.click(); return; } // (DecoratePanel: a locked one shakes, else it goes on the wall or the floor)
      if (FURNITURE[id]) this.G.housing.decor.select(id);
      return;
    }
    if (c.dataset.z) { P.pickTool(c.dataset.z); return; }
    const it = P.find(c.dataset.id); if (!it) return;
    if (it.locked) { this.ui.toast(it.locked === 'Already built' ? `The ${it.name} is already built` : `${it.name}: ${it.locked}`, { color: '#ffb0bc', duration: 2 }); }
    P.pick(c); // (BuildPanel: the deny shake, "Need more materials", or the pick → buildMode's tool)
  }
  /** the D-pad in the world: the cursor a step along the grid's axis nearest that way on screen */
  nudge(dir, f, r, step) {
    const G = this.G, V = Actions.vcursor, h = (x, z) => (this.mode0 === 'build' ? G.sim.world.heightAt(x, z) : 0);
    const p = G.engine.mouseGround(V.nx, V.ny, h); if (!p) return;
    const ax = (vx, vz) => (Math.abs(vx) >= Math.abs(vz) ? [Math.sign(vx) || 1, 0] : [0, Math.sign(vz) || 1]);
    const right = ax(r.x, r.z), up = right[0] ? [0, Math.sign(f.z) || -1] : [Math.sign(f.x) || 1, 0];
    const [sx, sz] = dir === 'right' ? right : dir === 'left' ? [-right[0], -right[1]] : dir === 'up' ? up : [-up[0], -up[1]];
    const x = p.x + sx * step, z = p.z + sz * step;
    _v.set(x, h(x, z), z).project(G.engine.camera);
    this.x = Math.max(8, Math.min(innerWidth - 8, (_v.x * 0.5 + 0.5) * innerWidth)); this.y = Math.max(8, Math.min(this.floorY() - 8, (-_v.y * 0.5 + 0.5) * innerHeight));
    this.ui.sfx('hover');
  }

  // ---------------------------------------------------------------- shared
  overlayNext() {
    const P = this.ui.panels.build, bs = [...(P?.$?.ov?.querySelectorAll('.ovl') || [])]; if (!bs.length) return;
    const i = bs.findIndex(b => b.classList.contains('on'));
    if (i === bs.length - 1) bs[i].click(); else bs[i + 1].click(); // (…, the last one, then none; the hint bar names it)
  }
  bump() { const R = this.ui.padNav?.ring; if (!R) return; R.classList.remove('bump'); void R.offsetWidth; R.classList.add('bump'); this.ui.sfx('deny'); }
  drawRing(c) {
    const R = this.ui.padNav?.ring; if (!R) return;
    if (!c || !c.isConnected) { R.classList.remove('on'); return; }
    const r = c.getBoundingClientRect(), pad = 4;
    R.style.transform = `translate(${(r.left - pad).toFixed(1)}px,${(r.top - pad).toFixed(1)}px)`;
    R.style.width = `${(r.width + pad * 2).toFixed(1)}px`; R.style.height = `${(r.height + pad * 2).toFixed(1)}px`; R.style.borderRadius = '18px';
    R.classList.add('on');
  }
  hints(m) {
    const G = this.G, st = this.state, list = [];
    if (m === 'build') {
      const t = G.build.tool, under = this.underCursor(), ovb = this.ui.panels.build.$?.ov?.querySelector('.ovl.on'), ov = ovb && ovb.dataset.m ? `Overlay: ${ovb.textContent}` : 'Overlay';
      if (st === 'pal') {
        const c = this.cur, it = c?.dataset.id ? this.ui.panels.build.find(c.dataset.id) : null;
        list.push(['LB+RB', 'Category'], ['DPad', 'Choose'], ['A', c?.dataset.z || (it && !it.locked) ? 'Pick up' : ''], ['LS', 'Cursor'], ['Y', 'Undo'], ['LT+RT', 'Turn'], ['View', ov], ['B', 'Done']);
      } else if (st === 'cur') {
        list.push(['LS', 'Cursor'], ['A', under?.house ? 'Open its card' : ''], ['X', under?.removable ? 'Remove' : ''], ['Y', 'Undo'], ['LB+RB', 'Palette'], ['LT+RT', 'Turn'], ['View', ov], ['B', 'Done']);
      } else {
        const b = t.kind === 'building';
        list.push(['LS', 'Move'], ['A', t.kind === 'bulldoze' ? 'Remove' : b ? 'Build' : 'Paint'], ['LT+RT', b ? 'Rotate' : 'Turn'], ['X', t.kind !== 'bulldoze' && under?.removable ? 'Remove' : ''], ['Y', 'Undo'], ['DPad', 'Nudge'], ['B', 'Put back']);
      }
    } else {
      const D = G.housing.decor;
      if (st === 'pal') {
        const id = this.cur?.dataset.id;
        list.push(['LB+RB', 'Category'], ['DPad', 'Choose'], ['A', id ? (SURFACES[id] ? 'Use it' : 'Pick up') : ''], ['LS', 'Cursor'], ['Y', 'Undo'], ['LT+RT', 'Zoom'], ['B', 'Done']);
      } else if (st === 'cur') {
        const it = Actions.vcursor.world ? D.itemAtMouse() : null;
        list.push(['LS', 'Cursor'], ['A', it ? 'Move it' : ''], ['X', it && !it.own ? 'Store' : ''], ['Y', 'Undo'], ['LB+RB', 'Palette'], ['LT+RT', 'Zoom'], ['B', 'Done']);
      } else {
        const id = D.hold?.it.id || D.sel, wall = FURNITURE[id]?.mount === 'wall';
        list.push(['LS', 'Move'], ['A', D.hold ? 'Put down' : 'Place'], ['LT+RT', wall ? '' : 'Rotate'], ['X', D.hold ? 'Store' : ''], ['Y', 'Undo'], ['DPad', 'Nudge'], ['B', 'Put back']);
      }
    }
    const sig = list.map(x => x.join(':')).join('|') + Actions.padStyle;
    const H = this.hintsEl;
    if (sig !== this._sig) { this._sig = sig; H.innerHTML = list.filter(x => x[1]).map(([b, t]) => `<span class="ph-i">${b.split('+').map(t2 => `<span class="kc pad">${padGlyph(t2)}</span>`).join('')}<b>${t}</b></span>`).join(''); }
    H.classList.add('on');
    // top centre: the world and the prompt above the palette stay clear; under a guide's dock while one talks (its speech
    // and objective sit at the top centre too: the decorating guide)
    const w = H.offsetWidth; let y = Math.round(14 * (this.ui.scale || 1)) + (this.ui.root?.classList.contains('deck-ui') ? 10 : 0); // (+10: the Deck's safe area)
    const T = this.ui.tutorial; if (T?.root.classList.contains('on')) { const r = T.$.dock?.getBoundingClientRect(); if (r && r.height > 4 && r.top < innerHeight * 0.4) y = Math.max(y, Math.round(r.bottom + 8)); }
    H.style.transform = `translate(${Math.max(8, (innerWidth - w) / 2).toFixed(0)}px,${y}px)`;
  }
  /** what's under the cursor in build mode (for the hints): a house, a building that can go */
  underCursor() {
    const G = this.G, B = G.build; if (!B?.active || !Actions.vcursor.world) return null;
    const c = B.lastCur; const b = c ? G.sim.buildingAt(c.x, c.z) : null; if (!b) return null;
    return { b, house: !!G.housing?.isHouse?.(b), removable: !B.keepWhy(b) };
  }
}
/** a card's key: 'b:<building id>', 'z:<tool>' (build) or 'f:<furniture or surface id>' (decorate) */
const cardKey = c => (c.dataset.z ? 'z:' + c.dataset.z : (c.classList.contains('dc-card') ? 'f:' : 'b:') + c.dataset.id);
