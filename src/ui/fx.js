// Visual effects layer: floating combat text (pooled), toasts, banners, confetti/sparkle bursts,
// fly-to-bag pickups, loot labels over ground items and the paw/circle iris transition.
import * as THREE from 'three';
import { el, esc, letters, clamp, fmt, wait, rarityColor } from './dom.js';
import { glyph } from './glyphs.js';
import { itemIconURL } from './rpg.js';

const V = new THREE.Vector3();
function project(camera, x, y, z) {
  V.set(x, y, z).project(camera);
  return { x: (V.x * 0.5 + 0.5) * innerWidth, y: (-V.y * 0.5 + 0.5) * innerHeight, ok: V.z < 1 && V.z > -1 };
}
const RARITY_COL = { magic: '#6ea8ff', rare: '#ffd84a', unique: '#ff9a3c', set: '#5ee07a' };
const PALETTE = ['#ff8fb0', '#ffcf4a', '#8fe0c0', '#8fd0ff', '#c3b3ff', '#fff6e8', '#ffbcd6'];

// ------------------------------------------------------------------ floating text
const KIND = {
  dmg: { life: 0.95, rise: 0.9, size: 1 },
  crit: { life: 1.35, rise: 1.2, size: 1.6 },
  hurt: { life: 1.0, rise: 0.8, size: 1.05 },
  heal: { life: 1.15, rise: 1.1, size: 1 },
  xp: { life: 1.5, rise: 1.4, size: 0.85 },
  coins: { life: 1.3, rise: 1.2, size: 0.95 },
  miss: { life: 0.9, rise: 1.0, size: 0.85 },
  block: { life: 0.9, rise: 1.0, size: 0.85 },
  status: { life: 1.4, rise: 1.4, size: 0.85 },
};
// Numeric dmg/crit floats that land near the same world spot within MERGE_MS become one number (summed, crit style if
// any hit was a crit, with a little scale bump). At most MAX_FLOATS live at once — the oldest non-crit fades out fast.
const MERGE_MS = 150, MERGE_R2 = 0.65 * 0.65, MAX_FLOATS = 14, FADE = 0.12;
const NUM_RE = /^([+\-−]?)(\d+)(!?)$/;
export class Floats {
  constructor(layer) {
    this.root = el('div', 'floats'); layer.appendChild(this.root);
    this.pool = []; this.active = [];
  }
  spawn(pos, text, opts = {}) {
    let kind = KIND[opts.kind] ? opts.kind : 'dmg';
    const now = performance.now();
    const y0 = (pos.y || 0) + (opts.yOff ?? 0);
    const num = (kind === 'dmg' || kind === 'crit') ? NUM_RE.exec(text) : null;
    if (num) {
      const sign = num[1] === '−' ? '-' : num[1], col = opts.color || '';
      for (let i = this.active.length - 1; i >= 0; i--) {
        const o = this.active[i];
        if (!o.num || o.dying || now - o.born > MERGE_MS || o.sign !== sign || o.col !== col) continue;
        const dx = o.x - pos.x, dy = o.y - y0, dz = o.z - pos.z;
        if (dx * dx + dy * dy + dz * dz > MERGE_R2) continue;
        o.val += +num[2]; o.hits++;
        if (kind === 'crit' && o.kind !== 'crit') { o.kind = 'crit'; o.life = Math.max(o.life, KIND.crit.life); o.rise = KIND.crit.rise; o.base = KIND.crit.size * (opts.scale || 1); o.n.className = 'fl k-crit'; }
        o.size = o.base * Math.min(1.45, 1 + 0.07 * (o.hits - 1));
        o.bump = 1;
        this.paint(o);
        return o;
      }
    }
    const K = KIND[kind];
    if (this.active.length > 260) this.release(0);
    let n = this.pool.pop();
    if (!n) { n = el('div'); this.root.appendChild(n); }
    n.className = 'fl k-' + kind;
    n.style.color = opts.color || '';
    n.style.opacity = '0';
    const base = K.size * (opts.scale || 1);
    const f = { n, x: pos.x, y: y0, z: pos.z, t: 0, born: now, life: K.life, rise: K.rise, base, size: base, kind, text, bump: 0,
      num: !!num, sign: num ? (num[1] === '−' ? '-' : num[1]) : '', val: num ? +num[2] : 0, hits: 1, col: opts.color || '',
      drift: (Math.random() - 0.5) * (kind === 'crit' ? 24 : 30), stack: 0, stackX: 0, push: 0, pushT: 0, sx: 0, sy: 0, rot: kind === 'crit' ? (Math.random() - 0.5) * 16 : (Math.random() - 0.5) * 6 };
    this.paint(f);
    // stacking: a new number near young ones pushes them up into a tidy zig-zag column instead of overlapping
    const cam = this.camera;
    if (cam) {
      const p = project(cam, f.x, f.y, f.z); f.sx = p.x; f.sy = p.y;
      let k = 0;
      const h = 26 * base;
      for (const o of this.active) if (!o.dying && o.t < 0.7 && Math.abs(o.sx - p.x) < 70 && Math.abs(o.sy - p.y) < 48) { o.pushT += h; k++; }
      if (k) { f.stackX = (k % 2 ? 1 : -1) * Math.min(26, 10 + k * 4); f.drift *= 0.35; }
    }
    this.active.push(f);
    this.cap();
    return f;
  }
  paint(f) {
    const text = f.num ? `${f.sign}${f.val}${f.kind === 'crit' ? '!' : ''}` : f.text;
    let html = esc(text);
    if (f.kind === 'crit') html = `${glyph('star', 'fl-star')}<span>${esc(text)}</span>`;
    else if (f.kind === 'coins') html = `${glyph('coin')}<span>${esc(text)}</span>`;
    else if (f.kind === 'xp') html = `<span>${esc(text)}</span>`;
    f.n.innerHTML = html;
  }
  // keep at most MAX_FLOATS live: the oldest non-crit (else the oldest) fades out quickly
  cap() {
    let live = 0;
    for (const o of this.active) if (!o.dying) live++;
    while (live > MAX_FLOATS) {
      let victim = null;
      for (const o of this.active) if (!o.dying && o.kind !== 'crit' && (!victim || o.born < victim.born)) victim = o;
      if (!victim) for (const o of this.active) if (!o.dying && (!victim || o.born < victim.born)) victim = o;
      if (!victim) break;
      victim.dying = FADE; live--;
    }
  }
  release(i) { const f = this.active[i]; f.n.style.opacity = '0'; f.n.style.transform = 'translate3d(-999px,-999px,0)'; this.pool.push(f.n); this.active.splice(i, 1); }
  update(dt, camera, scale) {
    this.camera = camera;
    if (!camera) return;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const f = this.active[i];
      f.t += dt;
      if (f.dying) { f.dying -= dt; if (f.dying <= 0) { this.release(i); continue; } }
      if (f.pushT > f.push) f.push += (f.pushT - f.push) * (1 - Math.exp(-18 * dt));
      const u = f.t / f.life;
      if (u >= 1) { this.release(i); continue; }
      const rise = f.rise * (1 - (1 - u) * (1 - u));
      const p = project(camera, f.x, f.y + rise, f.z);
      if (!p.ok) { f.n.style.opacity = '0'; continue; }
      // pop: overshoot then settle, slight shrink at the end
      const a = f.t;
      let s = a < 0.09 ? 0.35 + (a / 0.09) * 1.05 : a < 0.24 ? 1.4 - ((a - 0.09) / 0.15) * 0.4 : 1 - Math.max(0, u - 0.7) * 0.6;
      if (f.kind === 'crit' && a < 0.35) s *= 1 + Math.sin(a * 40) * 0.06 * (1 - a / 0.35);
      if (f.bump > 0) { s *= 1 + 0.3 * f.bump; f.bump = Math.max(0, f.bump - dt * 6); }
      s *= f.size * scale;
      let op = u < 0.65 ? 1 : 1 - (u - 0.65) / 0.35;
      if (f.dying) op *= Math.max(0, f.dying / FADE);
      const x = p.x + (f.drift * u + (f.stackX || 0)) * scale, y = p.y - (f.stack + f.push) * scale;
      f.n.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) translate(-50%,-50%) rotate(${(f.rot * (1 - u)).toFixed(1)}deg) scale(${s.toFixed(3)})`;
      f.n.style.opacity = op.toFixed(3);
    }
  }
}

// ------------------------------------------------------------------ toasts
// Max 4 live toasts; identical texts merge into one (×N badge, timer restarts); bursts are rate-limited
// through a small queue so a chatty village sim can never flood the DOM.
export class Toasts {
  constructor(layer) { this.root = el('div', 'toasts'); layer.appendChild(this.root); this.live = []; this.q = []; this.last = 0; this.timer = null; }
  show(text, opts = {}) {
    if (typeof opts === 'string') opts = { icon: opts };
    text = String(text ?? '');
    if (!text) return null;
    const key = text + '|' + (opts.sub || '');
    const dup = this.live.find(t => t._key === key && !t._dying);
    if (dup) { this.bumpDup(dup, opts); return dup; }
    const qd = this.q.find(x => x.key === key);
    if (qd) { qd.n++; return null; }
    this.q.push({ key, text, opts, n: 1 });
    if (this.q.length > 8) this.q.splice(0, this.q.length - 8);
    this.pump();
    return null;
  }
  pump() {
    if (this.timer || !this.q.length) return;
    const wait = Math.max(0, this.last + 140 - performance.now());
    this.timer = setTimeout(() => {
      this.timer = null;
      const x = this.q.shift();
      if (x) { this.last = performance.now(); const t = this.make(x.text, x.opts); if (x.n > 1) this.bumpDup(t, x.opts, x.n - 1); }
      this.pump();
    }, wait);
  }
  make(text, opts) {
    const icon = opts.icon || 'sparkle';
    const col = opts.color || (opts.rarity ? rarityColor(opts.rarity) : '#ff8fb0');
    const ic = opts.iconURL ? `<img src="${opts.iconURL}" alt="">` : (/^[a-zA-Z]+$/.test(icon) ? glyph(icon) : `<span class="emo">${esc(icon)}</span>`);
    const dur = opts.duration || 3.6;
    const t = el('div', 'toast' + (opts.rarity ? ' r-' + opts.rarity : ''));
    t._key = text + '|' + (opts.sub || ''); t._dur = dur; t._n = 1;
    t.style.setProperty('--tc', col);
    t.style.setProperty('--dur', dur + 's');
    t.innerHTML = `<div class="t-ic">${ic}</div><div class="t-tx">${opts.html ? text : esc(text)}${opts.sub ? `<small>${esc(opts.sub)}</small>` : ''}</div><b class="t-n"></b><div class="t-bar"></div>`;
    this.root.appendChild(t);
    this.live.push(t);
    // hard cap: retire the oldest live toasts (they finish their exit animation, then leave the DOM)
    const alive = this.live.filter(x => !x._dying);
    for (let i = 0; i < alive.length - 4; i++) this.kill(alive[i], true);
    t._to = setTimeout(() => this.kill(t), dur * 1000);
    t.addEventListener('click', () => this.kill(t));
    return t;
  }
  bumpDup(t, opts, add = 1) {
    t._n += add;
    const n = t.querySelector('.t-n'); n.textContent = '×' + t._n; n.classList.remove('pop'); void n.offsetWidth; n.classList.add('pop');
    clearTimeout(t._to); t._to = setTimeout(() => this.kill(t), (t._dur || 3.6) * 1000);
    const bar = t.querySelector('.t-bar'); bar.style.animation = 'none'; void bar.offsetWidth; bar.style.animation = '';
  }
  kill(t, fast) {
    if (!t || t._dying) return;
    t._dying = true; clearTimeout(t._to);
    t.style.setProperty('--h', t.offsetHeight + 'px');
    t.classList.add('out');
    setTimeout(() => { t.remove(); const i = this.live.indexOf(t); if (i >= 0) this.live.splice(i, 1); }, fast ? 260 : 520);
  }
}

// ------------------------------------------------------------------ bursts / confetti
export function burst(layer, x, y, { n = 14, colors = PALETTE, spread = 90, size = 1, kind = 'mix', life = 0.8 } = {}) {
  const wrap = el('div', 'burst'); wrap.style.left = x + 'px'; wrap.style.top = y + 'px';
  let h = '';
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
    const d = spread * (0.55 + Math.random() * 0.6);
    const shape = kind === 'mix' ? ['dot', 'star', 'petal'][i % 3] : kind;
    const c = colors[i % colors.length];
    h += `<i class="bp ${shape}" style="--dx:${(Math.cos(a) * d).toFixed(0)}px;--dy:${(Math.sin(a) * d).toFixed(0)}px;--c:${c};--s:${(size * (0.6 + Math.random() * 0.7)).toFixed(2)};--r:${(Math.random() * 540 - 270).toFixed(0)}deg;--t:${(life * (0.8 + Math.random() * 0.4)).toFixed(2)}s"></i>`;
  }
  wrap.innerHTML = h;
  layer.appendChild(wrap);
  setTimeout(() => wrap.remove(), life * 1400 + 200);
}
function confettiHTML(n = 46) {
  let h = '';
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.5;
    const d = 160 + Math.random() * 260;
    const shape = ['rect', 'petal', 'star', 'dot'][i % 4];
    h += `<i class="cf ${shape}" style="--dx:${(Math.cos(a) * d).toFixed(0)}px;--dy:${(Math.sin(a) * d * 0.8).toFixed(0)}px;--fall:${(220 + Math.random() * 220).toFixed(0)}px;--c:${PALETTE[i % PALETTE.length]};--r:${(Math.random() * 1080 - 540).toFixed(0)}deg;--d:${(Math.random() * 0.15).toFixed(2)}s;--t:${(1.6 + Math.random() * 0.9).toFixed(2)}s"></i>`;
  }
  return h;
}

// ------------------------------------------------------------------ banners
export class Banners {
  constructor(layer, fxLayer) { this.root = el('div', 'banners'); layer.appendChild(this.root); this.q = []; this.busy = false; this.fxLayer = fxLayer; }
  show(title, sub = '', opts = {}) {
    const style = opts.style || 'default';
    // area banners replace each other; others queue
    if (style === 'area') this.q = this.q.filter(b => b.style !== 'area');
    const key = style + '|' + title + '|' + sub;
    if (this.q.some(b => b.key === key) || (this.busy && this.cur === key)) return;
    this.q.push({ key, title, sub, style, dur: opts.duration, jp: opts.jp });
    if (this.q.length > 3) this.q.splice(0, this.q.length - 3);
    if (!this.busy) this.next();
  }
  async next() {
    // hold queued banners while a dialogue is on screen (they would cover the conversation)
    if (this.q.length && this.hold?.()) { this.busy = true; clearTimeout(this._ht); this._ht = setTimeout(() => this.next(), 300); return; }
    const b = this.q.shift();
    if (!b) { this.busy = false; this.cur = null; return; }
    this.busy = true; this.cur = b.key;
    if (this.root.children.length > 2) for (const c of [...this.root.children].slice(0, -1)) c.remove();
    let dur = b.dur || { levelup: 2.8, area: 3.2, boss: 2.0, quest: 2.8, default: 2.4 }[b.style] || 2.4;
    if (this.q.length) dur *= 0.7;
    this.root.dataset.style = b.style; // boss banners sit in the top band, clear of the arena
    const n = el('div', `bn bn-${b.style}`);
    const L = letters(b.title, 'lt');
    if (b.style === 'levelup') {
      n.innerHTML = `<div class="bn-rays"></div><div class="bn-ring"></div><div class="bn-conf">${confettiHTML()}</div>
        <div class="bn-jp">レベルアップ！</div><div class="bn-title">${L}</div>${b.sub ? `<div class="bn-sub">${esc(b.sub)}</div>` : ''}`;
    } else if (b.style === 'area') {
      n.innerHTML = `${b.jp ? `<div class="bn-jp">${esc(b.jp)}</div>` : ''}<div class="bn-title">${L}</div>
        <svg class="bn-brush" viewBox="0 0 400 30" preserveAspectRatio="none"><path d="M8 18 C80 8 160 22 230 14 S350 10 392 16" pathLength="1"/><path class="thin" d="M40 24 C120 20 220 26 330 21" pathLength="1"/></svg>
        ${b.sub ? `<div class="bn-sub">${esc(b.sub)}</div>` : ''}`;
    } else if (b.style === 'boss') {
      n.innerHTML = `<div class="bn-vig"></div><div class="bn-streak"></div><div class="bn-warn">${glyph('oni')}<span>BOSS</span>${glyph('oni')}</div><div class="bn-title">${L}</div>${b.sub ? `<div class="bn-sub">${esc(b.sub)}</div>` : ''}`;
    } else if (b.style === 'quest') {
      n.innerHTML = `<div class="bn-rays gold"></div><div class="bn-scroll">${glyph('scroll')}</div><div class="bn-title">${L}</div>${b.sub ? `<div class="bn-sub">${esc(b.sub)}</div>` : ''}<div class="bn-conf">${confettiHTML(24)}</div>`;
    } else {
      n.innerHTML = `<div class="bn-title">${L}</div>${b.sub ? `<div class="bn-sub">${esc(b.sub)}</div>` : ''}`;
    }
    this.root.appendChild(n);
    // shown for `dur`, or until dismiss(style) cuts it short (e.g. the boss banner leaves as soon as the fight starts)
    const shownAt = performance.now();
    await new Promise(res => { const cur = this.live = { style: b.style, shownAt, done: res }; cur.timer = setTimeout(res, dur * 1000); });
    clearTimeout(this.live?.timer); this.live = null;
    n.classList.add('out');
    await wait(b.style === 'boss' ? 420 : 650);
    n.remove();
    this.next();
  }
  /** Retire banners of `style`: queued ones are dropped, the live one leaves once it has been up `minShown` seconds. */
  dismiss(style, minShown = 0.9) {
    for (const b of this.q) if (b.style === style) b.dur = Math.min(b.dur || 99, minShown);
    const L = this.live;
    if (!L || L.style !== style || L.dismissing) return;
    L.dismissing = true;
    clearTimeout(L.timer);
    L.timer = setTimeout(L.done, Math.max(0, minShown * 1000 - (performance.now() - L.shownAt)));
  }
}

// ------------------------------------------------------------------ fly-to-bag
export function flyToBag(layer, item, from, toRect, onArrive) {
  const src = typeof item === 'string' ? item : itemIconURL(item);
  const n = el('div', 'fly');
  n.innerHTML = `<img src="${src}" alt="">`;
  if (item && item.rarity) n.style.setProperty('--rc', rarityColor(item.rarity));
  layer.appendChild(n);
  const tx = toRect.left + toRect.width / 2, ty = toRect.top + toRect.height / 2;
  const mx = (from.x + tx) / 2 + (Math.random() - 0.5) * 80, my = Math.min(from.y, ty) - 140 - Math.random() * 60;
  const kf = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12, it = 1 - t;
    const x = it * it * from.x + 2 * it * t * mx + t * t * tx, y = it * it * from.y + 2 * it * t * my + t * t * ty;
    const s = i === 0 ? 0.3 : t < 0.2 ? 1.25 : 1.2 - t * 0.75;
    kf.push({ transform: `translate3d(${x}px,${y}px,0) translate(-50%,-50%) scale(${s}) rotate(${t * 360}deg)`, opacity: t > 0.92 ? 0.4 : 1 });
  }
  const a = n.animate(kf, { duration: 780, easing: 'cubic-bezier(.45,.05,.55,.95)', fill: 'forwards' });
  a.onfinish = () => { n.remove(); onArrive?.(); };
}

// ------------------------------------------------------------------ loot labels
export class LootLabels {
  constructor(layer) {
    this.root = el('div', 'loot'); layer.appendChild(this.root);
    this.map = new Map(); this.all = false; this.cb = null; this.hidden = false;
    this.root.addEventListener('mousedown', e => {
      const l = e.target.closest('.ll'); if (!l) return;
      e.stopPropagation(); e.preventDefault();
      const o = this.map.get(l.dataset.id);
      if (o) { l.classList.add('click'); if (o.onClick) o.onClick(o.id, o); else this.cb?.(o.id, o); }
    });
  }
  add({ id, name, color, worldPos, rarity, always, qty, onClick }) {
    id = String(id);
    if (this.map.has(id)) this.remove(id, true);
    if (!rarity && color) rarity = Object.keys(RARITY_COL).find(k => RARITY_COL[k] === String(color).toLowerCase());
    const n = el('div', 'll' + (rarity ? ' r-' + rarity : ''));
    n.dataset.id = id;
    n.style.setProperty('--rc', color || rarityColor(rarity));
    n.innerHTML = `<span>${esc(name)}${qty > 1 ? ` <small>×${qty}</small>` : ''}</span>`;
    this.root.appendChild(n);
    const o = { id, n, pos: new THREE.Vector3(worldPos.x, worldPos.y ?? 0, worldPos.z), always: always ?? ['rare', 'unique', 'set'].includes(rarity), t: 0, w: n.offsetWidth || 100, h: n.offsetHeight || 26, vis: null, x: 0, y: 0, onClick };
    this.map.set(id, o);
    return o;
  }
  remove(id, instant) {
    id = String(id);
    const o = this.map.get(id); if (!o) return;
    this.map.delete(id);
    if (instant) o.n.remove();
    else { o.n.classList.add('gone'); setTimeout(() => o.n.remove(), 260); }
  }
  move(id, worldPos) { const o = this.map.get(String(id)); if (o) o.pos.set(worldPos.x, worldPos.y ?? 0, worldPos.z); }
  clear() { for (const id of [...this.map.keys()]) this.remove(id, true); }
  setVisible(all) { this.all = !!all; this.root.classList.toggle('all', this.all); }
  onClick(fn) { this.cb = fn; }
  update(dt, camera, scale) {
    if (!camera || !this.map.size) return;
    const placed = [];
    const list = [];
    for (const o of this.map.values()) {
      o.t += dt;
      const vis = !this.hidden && (this.all || o.always || o.t < 3.2);
      if (vis !== o.vis) { o.vis = vis; o.n.classList.toggle('show', vis); }
      if (!vis) continue;
      const p = project(camera, o.pos.x, o.pos.y + 0.35, o.pos.z);
      if (!p.ok || p.x < -100 || p.y < -50 || p.x > innerWidth + 100 || p.y > innerHeight + 50) { o.n.classList.remove('show'); o.vis = null; continue; }
      o.x = p.x; o.y = p.y;
      list.push(o);
    }
    list.sort((a, b) => b.y - a.y);
    for (const o of list) {
      const w = o.w * scale, h = o.h * scale + 2;
      let y = o.y;
      for (let guard = 0; guard < 20; guard++) {
        let hit = false;
        for (const r of placed) if (Math.abs(r.x - o.x) < (r.w + w) / 2 && Math.abs(r.y - y) < (r.h + h) / 2) { y = r.y - (r.h + h) / 2 - 1; hit = true; }
        if (!hit) break;
      }
      placed.push({ x: o.x, y, w, h });
      o.n.style.transform = `translate3d(${o.x.toFixed(1)}px,${y.toFixed(1)}px,0) translate(-50%,-100%) scale(${scale})`;
    }
  }
}

// ------------------------------------------------------------------ iris transition
function ell(cx, cy, rx, ry, deg) {
  const a = (deg * Math.PI) / 180, dx = rx * Math.cos(a), dy = rx * Math.sin(a);
  return `M${(cx - dx).toFixed(2)} ${(cy - dy).toFixed(2)}a${rx} ${ry} ${deg} 1 0 ${(2 * dx).toFixed(2)} ${(2 * dy).toFixed(2)}a${rx} ${ry} ${deg} 1 0 ${(-2 * dx).toFixed(2)} ${(-2 * dy).toFixed(2)}Z`;
}
const PAW = 'M0 36 C-24 36 -31 18 -25 6 C-19 -6 -8 -4 0 -4 C8 -4 19 -6 25 6 C31 18 24 36 0 36Z '
  + ell(-33, -8, 8.5, 11, -25) + ell(-13, -26, 9.5, 12, -8) + ell(13, -26, 9.5, 12, 8) + ell(33, -8, 8.5, 11, 25);
export class Iris {
  constructor(layer) {
    this.root = el('div', 'iris');
    this.root.innerHTML = `<svg width="100%" height="100%"><defs>
      <pattern id="ui-iris-pat" width="90" height="90" patternUnits="userSpaceOnUse" patternTransform="rotate(-12)">
        <g transform="translate(22 24) scale(.28)" fill="#ffd3e1"><path d="${PAW}"/></g>
        <g transform="translate(67 68) scale(.22)" fill="#ffe3c2"><path d="${PAW}"/></g>
      </pattern>
      <mask id="ui-iris-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="100%" height="100%"><rect width="100%" height="100%" fill="#fff"/><g class="hole"><path d="${PAW}" fill="#000"/></g></mask></defs>
      <g mask="url(#ui-iris-mask)"><rect width="100%" height="100%" fill="#fff6e8"/><rect width="100%" height="100%" fill="url(#ui-iris-pat)"/></g>
      <g class="rimg"><path class="rim" d="${PAW}" fill="none" stroke="#4a2c2a" stroke-width="3"/></g></svg>
      <div class="iris-load"><div class="il-paws">${[0, 1, 2].map(i => `<i style="--i:${i}">${glyph('paw')}</i>`).join('')}</div><div class="il-t">Loading<span>…</span></div></div>`;
    layer.appendChild(this.root);
    this.hole = this.root.querySelector('.hole');
    this.rimg = this.root.querySelector('.rimg');
    this.active = false;
  }
  _set(s, cx, cy, circle) {
    const tr = `translate(${cx.toFixed(1)} ${cy.toFixed(1)}) scale(${Math.max(0.0001, s).toFixed(4)})`;
    this.hole.setAttribute('transform', tr);
    this.rimg.setAttribute('transform', tr + ' ');
    this.rimg.firstElementChild.setAttribute('stroke-width', (3 / Math.max(0.05, s)).toFixed(2));
  }
  // log-space zoom so the paw shape stays readable for most of the animation
  _anim(from, to, ms, easeFn, cx, cy) {
    const la = Math.log(Math.max(from, 0.05)), lb = Math.log(Math.max(to, 0.05));
    return new Promise(res => {
      const t0 = performance.now();
      const step = now => {
        const u = clamp((now - t0) / ms);
        this._set(Math.exp(la + (lb - la) * easeFn(u)), cx, cy);
        if (u < 1) requestAnimationFrame(step); else res();
      };
      requestAnimationFrame(step);
    });
  }
  async play(mid, opts = {}) {
    if (this.active) { await mid?.(); return; }
    this.active = true;
    const shape = opts.shape || 'paw';
    this.root.classList.toggle('circle', shape === 'circle');
    this.hole.firstElementChild.setAttribute('d', shape === 'circle' ? 'M-40 0a40 40 0 1 0 80 0a40 40 0 1 0-80 0Z' : PAW);
    this.rimg.firstElementChild.setAttribute('d', shape === 'circle' ? 'M-40 0a40 40 0 1 0 80 0a40 40 0 1 0-80 0Z' : PAW);
    const cx = opts.x ?? innerWidth / 2, cy = opts.y ?? innerHeight / 2;
    const big = Math.hypot(innerWidth, innerHeight) / (shape === 'circle' ? 70 : 22);
    this.root.classList.add('on');
    this._set(big, cx, cy);
    const inOut = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
    const antic = t => (t < 0.12 ? -0.04 * Math.sin((t / 0.12) * Math.PI) : inOut((t - 0.12) / 0.88)); // tiny grow before closing
    await this._anim(big, 0.12, opts.inMs || 760, antic, cx, cy);
    this._set(0.0001, cx, cy);
    this.root.classList.add('covered');
    const t0 = performance.now();
    try { await mid?.(); } catch (e) { console.error('[ui] transition mid failed', e); }
    await wait(Math.max(0, (opts.hold ?? 520) - (performance.now() - t0)));
    this.root.classList.remove('covered');
    await wait(120);
    const ox = innerWidth / 2, oy = innerHeight / 2;
    await this._anim(0.12, big, opts.outMs || 900, inOut, ox, oy);
    this.root.classList.remove('on');
    this.active = false;
  }
}
