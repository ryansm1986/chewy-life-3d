// Quest target pointer. Reads G.questTarget() → { pos:Vector3, label, kind:'npc'|'place' } | null every frame:
//  • off-screen  → a bouncy arrow pinned to the screen edge, pointing at the target, with a label + distance
//  • on-screen but farther than ~6 m → a small bobbing pin above the target
//  • within ~2.5 m, while a panel / dialogue / build mode is up, or with no target → hidden
import * as THREE from 'three';
import { el, esc, clamp, damp } from './dom.js';
import { glyph } from './glyphs.js';

const V = new THREE.Vector3();
const NEAR = 2.5, MARK_MIN = 6;
const ICON = { npc: 'chat', place: 'pin' };

export class QuestArrow {
  constructor(ui, layer) {
    this.ui = ui;
    this.root = el('div', 'qa');
    this.root.innerHTML = `<div class="qa-pt"><div class="qa-rot"><svg viewBox="0 0 40 40" class="qa-tri"><path d="M20 2 L34 26 Q20 20 6 26 Z" fill="#ff8fb0" stroke="#4a2c2a" stroke-width="3.2" stroke-linejoin="round"/><path d="M20 8 L27 21 Q20 18 13 21 Z" fill="#ffd6e3"/></svg></div>
      <div class="qa-b"><span class="qa-ic"></span></div><div class="qa-tail"></div></div>
      <div class="qa-l"><b class="qa-n"></b><span class="qa-d"></span></div>`;
    layer.appendChild(this.root);
    this.$ = { pt: this.root.querySelector('.qa-pt'), rot: this.root.querySelector('.qa-rot'), ic: this.root.querySelector('.qa-ic'), l: this.root.querySelector('.qa-l'), n: this.root.querySelector('.qa-n'), d: this.root.querySelector('.qa-d') };
    this.mode = null; this.x = innerWidth / 2; this.y = innerHeight / 2; this.ang = 0; this.t = 0; this.sig = ''; this.dist = -1;
  }
  target() {
    const G = this.ui.G;
    if (typeof G?.questTarget !== 'function') return null;
    try { const t = G.questTarget(); return t && t.pos ? t : null; } catch (e) { return null; }
  }
  blocked() {
    const ui = this.ui, G = ui.G;
    return ui.mode === 'title' || !G || G.titleActive || G.playerDead || G.player?.controlLocked || G.introFocus || G.build?.active || G.buildMode || ui.anyModal() || ui.root.classList.contains('building') || ui.root.classList.contains('dlg-open');
  }
  setMode(m) {
    if (m === this.mode) return;
    const was = this.mode;
    this.mode = m;
    this.root.classList.toggle('show', !!m);
    this.root.classList.toggle('edge', m === 'edge');
    this.root.classList.toggle('mark', m === 'mark');
    if (m && !was) { this.root.classList.remove('pop'); void this.root.offsetWidth; this.root.classList.add('pop'); this.snap = true; }
  }
  // slide an edge point along its edge out of the HUD corners (quest tracker, minimap + purse, demand + build button)
  avoid(x, y, W, H, s, mL, mT, mR, mB) {
    const boxes = [[0, 0, 300 * s, 250 * s], [W - 260 * s, 0, W, 345 * s], [W - 230 * s, H - 260 * s, W, H]];
    const onSide = x <= mL + 12 * s || x >= W - mR - 12 * s;
    for (const [x0, y0, x1, y1] of boxes) {
      if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      if (onSide) y = y0 <= 0 ? y1 + 8 * s : y0 - 8 * s;
      else x = x0 <= 0 ? x1 + 8 * s : x0 - 8 * s;
    }
    return [x, y];
  }
  update(dt, cam) {
    this.t += dt;
    const tgt = cam ? this.target() : null;
    // villagers stay in Blossom Hollow: an NPC objective has no meaning while down in the Burrow
    if (!tgt || this.blocked() || (tgt.kind === 'npc' && this.ui.mode === 'dungeon')) { this.setMode(null); return; }
    const pp = this.ui.hud.playerPos();
    const dist = Math.hypot(tgt.pos.x - pp.x, tgt.pos.z - pp.z);
    if (dist < NEAR) { this.setMode(null); return; }
    const W = innerWidth, H = innerHeight, s = this.ui.scale || 1;
    V.set(tgt.pos.x, (tgt.pos.y || 0) + (tgt.kind === 'npc' ? 2.9 : 2.2), tgt.pos.z).project(cam);
    const behind = V.z > 1;
    let sx = (V.x * 0.5 + 0.5) * W, sy = (-V.y * 0.5 + 0.5) * H;
    if (behind) { sx = W - sx; sy = H - sy; }
    // safe area: keep clear of the quest tracker / minimap corners and the orb + hotbar dock
    const mL = 56 * s, mR = 56 * s, mT = 64 * s, mB = 190 * s;
    const on = !behind && sx > mL && sx < W - mR && sy > mT && sy < H - mB;
    let mode = on ? (dist > MARK_MIN ? 'mark' : null) : 'edge';
    this.setMode(mode);
    if (!mode) return;
    // label (only rebuilt when it changes)
    const sig = (tgt.label || '') + '|' + (tgt.kind || '');
    if (sig !== this.sig) {
      this.sig = sig;
      this.$.ic.innerHTML = glyph(ICON[tgt.kind] || 'scroll');
      this.$.n.textContent = tgt.label || 'Quest'; this.lw = 0;
      this.root.dataset.kind = tgt.kind || 'place';
      this.root.classList.remove('pop'); void this.root.offsetWidth; this.root.classList.add('pop');
    }
    const dm = Math.round(dist);
    if (dm !== this.dist) { this.dist = dm; this.$.d.textContent = `${dm} m`; this.lw = 0; }
    if (!this.lw) { this.lw = this.$.l.offsetWidth || 110; this.lh = this.$.l.offsetHeight || 24; }
    let x, y, ang = this.ang;
    if (mode === 'mark') {
      x = sx; y = sy - Math.abs(Math.sin(this.t * 3.2)) * 9 * s;
    } else {
      // intersect the ray from the safe-area centre toward the target with the safe-area rectangle
      const cx = W / 2, cy = (mT + H - mB) / 2;
      let dx = sx - cx, dy = sy - cy;
      if (Math.abs(dx) + Math.abs(dy) < 1e-3) dy = 1;
      const hx = (W - mL - mR) / 2 - 8 * s, hy = (H - mT - mB) / 2 - 8 * s;
      const k = Math.min(Math.abs(dx) > 1e-6 ? hx / Math.abs(dx) : 1e9, Math.abs(dy) > 1e-6 ? hy / Math.abs(dy) : 1e9);
      ang = Math.atan2(dy, dx);
      const bounce = Math.abs(Math.sin(this.t * 4.2)) * 10 * s;
      const ux = Math.cos(ang), uy = Math.sin(ang);
      [x, y] = this.avoid(cx + dx * k, cy + dy * k, W, H, s, mL, mT, mR, mB);
      x += ux * bounce; y += uy * bounce;
    }
    if (this.snap) { this.x = x; this.y = y; this.ang = ang; this.snap = false; }
    else {
      this.x = damp(this.x, x, 14, dt); this.y = damp(this.y, y, 14, dt);
      let da = ang - this.ang; da = Math.atan2(Math.sin(da), Math.cos(da)); this.ang += da * clamp(dt * 12);
    }
    this.root.style.transform = `translate3d(${this.x.toFixed(1)}px,${this.y.toFixed(1)}px,0) scale(${s.toFixed(3)})`;
    if (mode === 'edge') {
      this.$.rot.style.transform = `rotate(${(this.ang * 180 / Math.PI + 90).toFixed(1)}deg)`;
      // label sits on the inner side of the badge so it never clips off-screen
      const lx = -Math.cos(this.ang) * (this.lw / 2 + 30), ly = -Math.sin(this.ang) * (this.lh / 2 + 30);
      this.$.l.style.transform = `translate(${lx.toFixed(1)}px,${ly.toFixed(1)}px) translate(-50%,-50%)`;
    } else this.$.l.style.transform = '';
  }
}
