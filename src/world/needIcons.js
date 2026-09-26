// Floating need bubbles over village buildings that can't grow (shown in build mode only; owned by VillageSim).
// A little painted bubble above every zoned building: path sign / water drop / broken heart / lantern / plus / expand arrows.
import * as THREE from 'three';
import { clamp, ease } from '../core/util.js';

const NEED_ORDER = ['road', 'water', 'joy', 'light', 'care', 'room'];
export class NeedIcons {
  constructor(sim) {
    this.sim = sim; this.on = false; this.k = 0; this.acc = 1; this.items = new Map(); this.tex = new Map();
    this.group = new THREE.Group(); this.group.name = 'needIcons'; this.group.visible = false; this.group.renderOrder = 998;
    sim.world.scene.add(this.group);
  }
  setVisible(on) { this.on = !!on; if (on) { this.acc = 1; this.group.visible = true; } }
  texture(kinds) {
    const key = kinds.join('+');
    let t = this.tex.get(key);
    if (!t) { t = new THREE.CanvasTexture(drawNeedBubble(kinds)); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; this.tex.set(key, t); }
    return t;
  }
  refresh() {
    const seen = new Set();
    for (const rec of this.sim.list) {
      const b = rec.data, kinds = this.sim.needsFor(b).sort((a, c) => NEED_ORDER.indexOf(a) - NEED_ORDER.indexOf(c));
      if (!kinds.length) continue;
      seen.add(b.id);
      const key = kinds.join('+');
      let it = this.items.get(b.id);
      if (!it) {
        const mat = new THREE.SpriteMaterial({ map: this.texture(kinds), transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false, toneMapped: false });
        const s = new THREE.Sprite(mat); s.renderOrder = 998; s.center.set(0.5, 0);
        this.group.add(s);
        it = { s, key, rec, t: 0, ph: Math.random() * 6.28 };
        this.items.set(b.id, it);
      } else if (it.key !== key) { it.key = key; it.s.material.map = this.texture(kinds); it.s.material.needsUpdate = true; it.t = 0; }
      it.rec = rec; it.n = kinds.length;
    }
    for (const [id, it] of this.items) if (!seen.has(id)) { this.group.remove(it.s); it.s.material.dispose(); this.items.delete(id); }
  }
  update(dt, t) {
    this.k = clamp(this.k + (this.on ? dt : -dt) / 0.18);
    this.group.visible = this.k > 0.001;
    if (!this.group.visible) return;
    if (this.on) { this.acc += dt; if (this.acc > 0.5) { this.acc = 0; this.refresh(); } }
    const cam = this.sim.G.engine?.camera; if (!cam) return;
    // constant on-screen size (~42 px tall) whatever the zoom
    const unit = 2 * Math.tan((cam.fov || 20) * Math.PI / 360) / Math.max(1, innerHeight);
    for (const it of this.items.values()) {
      it.t += dt;
      const g = it.rec.group, h = (it.rec.model.height || 2.4) * g.scale.y;
      const pop = it.t < 0.4 ? ease.outBack(Math.min(1, it.t / 0.4)) : 1;
      const px = 42 * pop * this.k, aspect = it.s.material.map.image.width / it.s.material.map.image.height;
      it.s.scale.set(px * unit * aspect, px * unit, 1);
      it.s.position.set(g.position.x, g.position.y + h + 0.35 + Math.sin(t * 2.6 + it.ph) * 0.14, g.position.z);
    }
  }
}

function drawNeedBubble(kinds) {
  const H = 112, S = 80, pad = 14, W = pad * 2 + kinds.length * S + (kinds.length - 1) * 6;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), ink = '#4a2c2a';
  const pill = (x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
  // bubble + tail
  const bh = 92;
  g.lineJoin = 'round';
  const shape = () => { pill(5, 5, W - 10, bh - 10, (bh - 10) / 2); g.moveTo(W / 2 - 11, bh - 6); g.lineTo(W / 2, H - 4); g.lineTo(W / 2 + 11, bh - 6); };
  shape(); g.fillStyle = ink; g.strokeStyle = ink; g.lineWidth = 9; g.stroke(); g.fill();
  pill(9, 9, W - 18, bh - 18, (bh - 18) / 2); g.fillStyle = '#ff7f96'; g.fill();
  pill(14, 14, W - 28, bh - 28, (bh - 28) / 2); const gr = g.createLinearGradient(0, 14, 0, bh - 14); gr.addColorStop(0, '#fffdf6'); gr.addColorStop(1, '#ffe9d4'); g.fillStyle = gr; g.fill();
  g.beginPath(); g.moveTo(W / 2 - 7, bh - 12); g.lineTo(W / 2, H - 14); g.lineTo(W / 2 + 7, bh - 12); g.closePath(); g.fillStyle = '#ff7f96'; g.fill();
  kinds.forEach((k, i) => { g.save(); g.translate(pad + S / 2 + i * (S + 6), bh / 2 - 1); NEED_DRAW[k]?.(g, ink); g.restore(); });
  return c;
}
const NEED_DRAW = {
  road(g, ink) { // wooden signpost with an arrow
    g.lineWidth = 4; g.strokeStyle = ink; g.lineJoin = 'round';
    g.fillStyle = '#b07a4e'; g.beginPath(); g.rect(-4, -12, 8, 38); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(-22, -24); g.lineTo(14, -24); g.lineTo(25, -14); g.lineTo(14, -4); g.lineTo(-22, -4); g.closePath(); g.fillStyle = '#f0c98a'; g.fill(); g.stroke();
    g.fillStyle = '#e0c8a8'; g.beginPath(); g.ellipse(0, 26, 20, 6, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    g.strokeStyle = '#8a5a36'; g.lineWidth = 3; g.beginPath(); g.moveTo(-15, -14); g.lineTo(9, -14); g.stroke();
  },
  water(g, ink) { // water drop
    g.beginPath(); g.moveTo(0, -28); g.bezierCurveTo(8, -14, 22, -2, 22, 10); g.arc(0, 10, 22, 0, Math.PI); g.bezierCurveTo(-22, -2, -8, -14, 0, -28); g.closePath();
    const gr = g.createLinearGradient(0, -28, 0, 32); gr.addColorStop(0, '#9fd6ff'); gr.addColorStop(1, '#3f8fe8'); g.fillStyle = gr; g.fill(); g.lineWidth = 4.5; g.strokeStyle = ink; g.stroke();
    g.fillStyle = 'rgba(255,255,255,.85)'; g.beginPath(); g.ellipse(-8, 6, 4.5, 8, 0.3, 0, Math.PI * 2); g.fill();
  },
  joy(g, ink) { // broken heart: two halves split along a zigzag, tipped apart
    const crack = [[0, -13], [-5, -3], [4, 5], [-3, 14], [0, 26]];
    const half = side => {
      g.beginPath();
      if (side < 0) { g.moveTo(0, 26); g.bezierCurveTo(-30, 6, -28, -24, -12, -24); g.bezierCurveTo(-4, -24, 0, -18, 0, -13); }
      else { g.moveTo(0, -13); g.bezierCurveTo(0, -18, 4, -24, 12, -24); g.bezierCurveTo(28, -24, 30, 6, 0, 26); }
      const pts = side < 0 ? crack : [...crack].reverse();
      for (const [x, y] of pts) g.lineTo(x, y);
      g.closePath();
    };
    for (const side of [-1, 1]) {
      g.save(); g.translate(side * 4, 1); g.rotate(side * 0.16);
      half(side); const gr = g.createLinearGradient(0, -24, 0, 26); gr.addColorStop(0, '#ffb3c8'); gr.addColorStop(1, '#ff5f8a'); g.fillStyle = gr; g.fill(); g.lineWidth = 4.5; g.lineJoin = 'round'; g.strokeStyle = ink; g.stroke();
      if (side < 0) { g.fillStyle = 'rgba(255,255,255,.75)'; g.beginPath(); g.ellipse(-14, -12, 5, 3, -0.6, 0, Math.PI * 2); g.fill(); }
      g.restore();
    }
  },
  light(g, ink) { // paper lantern
    g.lineWidth = 4; g.strokeStyle = ink;
    g.fillStyle = '#6b4a3a'; g.beginPath(); g.rect(-10, -28, 20, 7); g.fill(); g.stroke(); g.beginPath(); g.rect(-10, 20, 20, 7); g.fill(); g.stroke();
    g.beginPath(); g.ellipse(0, 0, 21, 22, 0, 0, Math.PI * 2); const gr = g.createRadialGradient(-5, -5, 3, 0, 0, 24); gr.addColorStop(0, '#fff3b0'); gr.addColorStop(1, '#ff9a3c'); g.fillStyle = gr; g.fill(); g.stroke();
    g.lineWidth = 2.2; for (const x of [-9, 0, 9]) { g.beginPath(); g.ellipse(0, 0, Math.abs(x) + 0.5, 21, 0, 0, Math.PI * 2); g.stroke(); }
  },
  care(g, ink) { // mint plus
    g.beginPath(); const a = 9, b = 25; g.moveTo(-a, -b); g.lineTo(a, -b); g.lineTo(a, -a); g.lineTo(b, -a); g.lineTo(b, a); g.lineTo(a, a); g.lineTo(a, b); g.lineTo(-a, b); g.lineTo(-a, a); g.lineTo(-b, a); g.lineTo(-b, -a); g.lineTo(-a, -a); g.closePath();
    g.fillStyle = '#5ed69a'; g.fill(); g.lineWidth = 4.5; g.lineJoin = 'round'; g.strokeStyle = ink; g.stroke();
    g.fillStyle = 'rgba(255,255,255,.7)'; g.fillRect(-5, -21, 4, 10);
  },
  room(g, ink) { // expand arrows
    g.lineWidth = 4; g.strokeStyle = ink; g.lineJoin = 'round';
    g.fillStyle = '#ffe9a8'; g.beginPath(); g.rect(-13, -13, 26, 26); g.fill(); g.stroke();
    for (let i = 0; i < 4; i++) { g.save(); g.rotate(i * Math.PI / 2 + Math.PI / 4); g.beginPath(); g.moveTo(-7, -21); g.lineTo(0, -31); g.lineTo(7, -21); g.closePath(); g.fillStyle = '#ffb43a'; g.fill(); g.stroke(); g.restore(); }
  },
};
