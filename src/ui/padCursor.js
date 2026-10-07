// The gamepad in build mode and decorate mode (docs/CONTROLS.md §2–3, ROADMAP CT-2): a virtual cursor.
//   - The left stick moves a paw cursor over the screen (Actions.vcursor; world/buildMode.js and home/decorate.js aim
//     with Actions.pointer(), so the ghost, the tile highlight and the snapping work as with the mouse). Pushed against
//     an edge it pans the camera; the right stick pans it too.
//   - The palette: the D-pad ◀ ▶ moves along the cards (and the build tools) and picks what it lands on; ▲ ▼ switch the
//     category. A places / paints / picks up, B cancels (and with nothing in hand leaves the mode), Y or RB rotate, X
//     removes (build: the building under the cursor, press twice; decorate: stores the piece in hand), LB undoes
//     (decorate), LT / RT turn the camera (build) or zoom (decorate), View cycles the coverage overlays (build).
//   - A footer of glyph hints, and the focus ring on the picked card.
import { Actions } from '../core/actions.js';
import { el } from './dom.js';
import { padGlyph } from './padGlyphs.js';

const SPEED = 820; // px/s at full tilt (at UI scale 1)
const EDGE = 54;   // px from the screen edge where the cursor pans the camera

export class PadCursor {
  constructor(ui) {
    this.ui = ui; this.on = false; this.x = 0; this.y = 0; this._t = 0;
    this.root = el('div', 'pad-cursor'); this.root.innerHTML = '<i class="pc-paw"></i><i class="pc-dot"></i>';
    this.hintsEl = el('div', 'pad-hints pc-hints');
    ui.layers.over.appendChild(this.root); ui.layers.over.appendChild(this.hintsEl);
  }
  get G() { return this.ui.G; }
  get mode() { const G = this.G; return G?.build?.active ? 'build' : G?.housing?.decor?.active ? 'decor' : null; }
  /** per frame from UI.padInput → true while the virtual cursor is in charge */
  update() {
    const A = Actions, G = this.G, m = this.mode, now = performance.now(), dt = Math.min(0.05, (now - (this._t || now)) / 1000); this._t = now;
    if (A.device !== 'pad' && !this.on) return false;
    const live = A.device === 'pad' && !!m && !this.ui.anyModal() && !this.ui.dlg?.active && !this.ui.pop?.classList.contains('show');
    if (!live) { this.stop(); return false; }
    if (!this.on || this.mode0 !== m) { this.on = true; this.mode0 = m; this.x = innerWidth / 2; this.y = innerHeight * (m === 'build' ? 0.46 : 0.42); this.root.classList.add('on'); }
    const rig = G.engine.rig, { f, r } = rig.groundAxes(), s = Math.max(0.6, this.ui.scale || 1);
    // the left stick: the cursor; pushed into an edge, the camera follows
    const mv = A.move(); let px = 0, py = 0;
    if (mv.pad && mv.mag > 0) {
      if (!this._moving) { this._moving = true; this.ui.tip.hide(); } // (a picked card's tooltip steps aside once the cursor moves)
      this.x += mv.x * mv.mag * SPEED * s * dt; this.y -= mv.y * mv.mag * SPEED * s * dt;
      if (this.x < EDGE && mv.x < 0) px = mv.x * mv.mag; else if (this.x > innerWidth - EDGE && mv.x > 0) px = mv.x * mv.mag;
      if (this.y < EDGE && mv.y > 0) py = mv.y * mv.mag; else if (this.y > innerHeight - EDGE && mv.y < 0) py = mv.y * mv.mag;
    }
    else this._moving = false;
    this.x = Math.max(8, Math.min(innerWidth - 8, this.x)); this.y = Math.max(8, Math.min(innerHeight - 8, this.y));
    // the right stick pans too
    const rs = A.aim(); px += rs.x * rs.mag; py += rs.y * rs.mag;
    if (px || py) this.pan(m, f, r, px, py, dt);
    // LT / RT: turn the camera a quarter (build) or zoom (decorate)
    if (m === 'build') { if (A.padHit('LT')) { rig.yawTarget += Math.PI / 2; this.ui.sfx('tab'); } if (A.padHit('RT')) { rig.yawTarget -= Math.PI / 2; this.ui.sfx('tab'); } }
    else { const z = (A.padDown('RT') ? 1 : 0) - (A.padDown('LT') ? 1 : 0); if (z) { this._zacc = (this._zacc || 0) + z * dt * 6; while (Math.abs(this._zacc) >= 1) { rig.zoom(Math.sign(this._zacc)); this._zacc -= Math.sign(this._zacc); } } }
    const V = A.vcursor; V.on = true; V.x = this.x; V.y = this.y; V.nx = (this.x / innerWidth) * 2 - 1; V.ny = -(this.y / innerHeight) * 2 + 1; V.overUI = false;
    this.root.style.transform = `translate(${this.x.toFixed(1)}px,${this.y.toFixed(1)}px)`;
    // the palette
    if (A.nav) this.palette(m, A.nav);
    if (m === 'build' && A.padHit('View')) { A.padConsume('View'); this.overlayNext(); }
    // B with nothing in hand: leave the mode (buildMode / decorate cancel what's in hand first and consume it)
    if (A.padHit('B')) { A.padConsume('B'); if (m === 'build') G.build.exit(); else G.housing.decor.exit(); this.stop(); return true; }
    if (m === 'decor' && A.padHit('Y') && !this.hand()) { A.padConsume('Y'); const c = this.cur; if (c?.isConnected && c.dataset.id && this.ui.panels.decorate.tab === 'surface') c.click(); }
    this.drawRing();
    this.hints(m);
    return true;
  }
  stop() {
    if (!this.on) return;
    this.on = false; Actions.vcursor.on = false;
    this.root.classList.remove('on'); this.hintsEl.classList.remove('on'); this.ui.padNav?.ring.classList.remove('on');
  }
  hand() { const G = this.G; return this.mode === 'build' ? !!G.build.tool : !!(G.housing.decor.sel || G.housing.decor.hold); }
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
  /** the palette's rows: build: the tools, then the current category's cards; decorate: the cards */
  row(m) {
    const P = m === 'build' ? this.ui.panels.build : this.ui.panels.decorate; if (!P?.$) return { P: null };
    const cards = [...P.$.cards.querySelectorAll('.card')];
    return { P, cards, tools: m === 'build' ? [...P.$.tools.querySelectorAll('.zone')] : [], tabs: [...P.$.tabs.querySelectorAll('.tab')] };
  }
  palette(m, nav) {
    const R = this.row(m); if (!R.P) return;
    this.lane ??= 'cards';
    if (nav === 'up' || nav === 'down') {
      // ▲ ▼: the categories (build: the tools row sits above the first category)
      const tabs = R.tabs, i = Math.max(0, tabs.findIndex(t => t.classList.contains('on')));
      if (m === 'build' && this.lane === 'tools') { if (nav === 'down') { this.lane = 'cards'; this.cur = null; } this.ui.sfx('tab'); return; }
      if (m === 'build' && nav === 'up' && i === 0) { this.lane = 'tools'; this.cur = null; this.ui.sfx('tab'); return; }
      const n = tabs[(i + (nav === 'down' ? 1 : -1) + tabs.length) % tabs.length];
      if (n) { n.click(); this.cur = null; this.lane = 'cards'; }
      return;
    }
    const list = this.lane === 'tools' ? R.tools : R.cards.filter(c => c.dataset.id);
    if (!list.length) return;
    let i = list.indexOf(this.cur);
    i = i < 0 ? (nav === 'right' ? 0 : list.length - 1) : (i + (nav === 'right' ? 1 : -1) + list.length) % list.length;
    const c = list[i]; this.cur = c;
    try { c.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (x) { /* */ }
    this.ui.sfx('hover');
    // what the highlight lands on is picked (a locked building, or a wallpaper — which costs one — only shows its tooltip)
    const surf = m === 'decor' && this.ui.panels.decorate.tab === 'surface';
    const T = this.ui.tip, r = c.getBoundingClientRect(); T.x = r.right - 4; T.y = r.top + 10;
    c.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    clearTimeout(this._tipT); this._tipT = setTimeout(() => this.ui.tip.hide(), 2600); // (its tooltip, briefly: the world is what you're looking at)
    if (c.classList.contains('locked') || surf) return;
    if (m === 'decor' && (c.classList.contains('sel') || this.G.housing.decor.sel === c.dataset.id)) return;
    c.click();
  }
  overlayNext() {
    const P = this.ui.panels.build, bs = [...(P?.$?.ov?.querySelectorAll('.ovl') || [])]; if (!bs.length) return;
    const i = bs.findIndex(b => b.classList.contains('on'));
    if (i === bs.length - 1) bs[i].click(); else bs[i + 1].click(); // (…, the last one, then none)
  }
  drawRing() {
    const R = this.ui.padNav?.ring, c = this.cur; if (!R) return;
    if (!c || !c.isConnected) { R.classList.remove('on'); return; }
    const r = c.getBoundingClientRect(), pad = 4;
    R.style.transform = `translate(${(r.left - pad).toFixed(1)}px,${(r.top - pad).toFixed(1)}px)`;
    R.style.width = `${(r.width + pad * 2).toFixed(1)}px`; R.style.height = `${(r.height + pad * 2).toFixed(1)}px`; R.style.borderRadius = '18px';
    R.classList.add('on');
  }
  hints(m) {
    const G = this.G, hand = this.hand();
    const list = [['DLeft+DRight', 'Pick'], ['DUp+DDown', 'Category']];
    if (m === 'build') {
      const t = G.build.tool;
      list.push(['A', !t ? 'Open a house' : t.kind === 'bulldoze' ? 'Remove' : t.kind === 'building' ? 'Build' : 'Paint'], ['Y', t?.kind === 'building' ? 'Rotate' : ''], ['X', 'Remove'], ['LT+RT', 'Turn'], ['View', 'Overlay'], ['B', hand ? 'Cancel' : 'Done']);
    } else {
      const D = G.housing.decor, surf = this.ui.panels.decorate?.tab === 'surface';
      list.push(['A', D.hold || D.sel ? 'Place' : 'Pick up'], ['Y', hand ? 'Rotate' : surf ? 'Use it' : ''], ['X', D.hold ? 'Store' : ''], ['LB', 'Undo'], ['LT+RT', 'Zoom'], ['B', hand ? 'Cancel' : 'Done']);
    }
    list.splice(2, 0, ['LS', 'Cursor']);
    const sig = list.map(x => x.join(':')).join('|') + Actions.padStyle;
    const H = this.hintsEl;
    if (sig !== this._sig) { this._sig = sig; H.innerHTML = list.filter(x => x[1]).map(([b, t]) => `<span class="ph-i">${b.split('+').map(t2 => `<span class="kc pad">${padGlyph(t2)}</span>`).join('')}<b>${t}</b></span>`).join(''); }
    H.classList.add('on');
    // top centre: the world and the prompt above the palette stay clear
    const w = H.offsetWidth;
    H.style.transform = `translate(${Math.max(8, (innerWidth - w) / 2).toFixed(0)}px,${Math.round(14 * (this.ui.scale || 1)) + (this.ui.root?.classList.contains('deck-ui') ? 10 : 0)}px)`; // (+10: the Deck's safe area)
  }
}
