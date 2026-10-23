// The Burrow door's den picker (docs/ZONES.md §4.1; ROADMAP Z-H1): a painted cut-through of the shrine hill, its tunnel
// winding down past the Burrow's four dens (the Mossy Burrow, the Fox Shrine, Oni's Kitchen, the Moonlit Sanctum), a pin on
// each, and the picked den's card beside it (its floors, level band, boss, yokai, the story quest that points there) with
// the way in. The dens open in order (the next once the den before it is cleared): a locked den is sealed in the art and
// its card says what opens it. Opened by F at the Burrow door (world/village.js → G.openBurrowMenu → world/burrowDoor.js
// G.burrow.open → ui.open('burrow', { select })). Data from G.burrow.list(), so the panel never imports world code.
//   - the Travel Map's look and controls (its .tv-* classes: panels.css): 1–4 choose, Enter sets off; a pad's D-pad
//     moves between the pins and the card (ui/padNav.js), A on a pin picks it, A on the button sets off; a tap picks;
//   - phones: the art at 0.76 beside the card, which scrolls with the button always in sight (dens.css).
import './dens.css';
import { esc } from './dom.js';
import { glyph } from './glyphs.js';
import { padGlyph } from './padGlyphs.js';
import { Panel } from './panel.js';

const W = 560, H = 440;
// the dens' chambers in the painted hill (0..1 of the art), the tunnel's way between them, and the hill's own spots
const SPOT = [{ x: 0.275, y: 0.335 }, { x: 0.72, y: 0.53 }, { x: 0.29, y: 0.725 }, { x: 0.705, y: 0.9 }];
const MOUTH = { x: 0.5, y: 0.158 };
const FIT = { hard: 'A bit tough for you yet', easy: 'An easy stroll for you now', good: 'Just right for your level' };

export class DenPanel extends Panel {
  constructor(ui) { super(ui, { name: 'burrow', title: 'The Burrow', side: 'center', cls: 'p-burrow', icon: 'torii' }); this.sel = null; }
  init() {
    this.body.innerHTML = `<div class="tv-wrap dn-wrap">
      <div class="tv-map dn-map"><canvas class="tv-cv"></canvas><div class="tv-pins"></div><div class="dn-hill"><b>${glyph('torii')}Shrine Hill</b></div></div>
      <div class="tv-side"><div class="tv-card dn-card"></div>
        <div class="tv-foot kbm-only"><span class="kc sm">1</span>–<span class="kc sm">4</span> choose <span class="sep">·</span> <span class="kc sm">Enter</span> set off</div><div class="tv-foot pad-only"><span class="kc sm pad">${padGlyph('DUp')}</span><span class="kc sm pad">${padGlyph('DDown')}</span> choose <span class="sep">·</span> <span class="kc sm pad">${padGlyph('A')}</span> on the card: set off</div></div>
    </div>`;
    this.cv = this.body.querySelector('.tv-cv');
    this.pins = this.body.querySelector('.tv-pins');
    this.card = this.body.querySelector('.dn-card');
    this.pins.addEventListener('click', e => { const p = e.target.closest('.tv-pin'); if (p) this.select(p.dataset.id, true); });
    this.card.addEventListener('click', e => { if (e.target.closest('.dn-go')) this.go(); });
    this.onKey = e => {
      if (!this.isOpen || this.ui.dlg?.active || this.ui._order[this.ui._order.length - 1] !== 'burrow') return;
      if (/^[1-4]$/.test(e.key)) { const it = this.list()[+e.key - 1]; if (it) { this.select(it.id, true); e.preventDefault(); } }
      if (e.key === 'Enter') { this.go(); e.preventDefault(); }
    };
    addEventListener('keydown', this.onKey);
  }
  list() { return this.G?.burrow?.list?.() || []; }
  onOpen() {
    const L = this.list();
    this.sel = (this.opts.select && L.some(d => d.id === this.opts.select) ? this.opts.select : null) || this.G?.burrow?.pick?.() || L[0]?.id || null;
    this.drawArt();
    this.render();
    this.ui.sfx?.('open');
  }
  refresh() { if (this.isOpen) { this.drawArt(); this.render(); } }
  select(id, user) { if (this.sel === id) return; this.sel = id; this.render(); if (user) this.ui.sfx?.('tab'); }
  go() {
    const d = this.list().find(x => x.id === this.sel);
    if (!d || !d.open) { this.ui.sfx?.('deny'); this.card.querySelector('.tv-st')?.animate?.([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }], { duration: 260 }); return; }
    this.G.burrow.enter(d.id);
  }
  render() {
    const L = this.list();
    this.pins.innerHTML = L.map((d, i) => {
      const s = SPOT[i] || SPOT[0];
      const cls = ['tv-pin', 'dn-pin', d.open ? 'open' : 'locked', d.id === this.sel ? 'sel' : '', d.done ? 'cleared' : ''].join(' ');
      return `<button class="${cls}" data-id="${d.id}" style="left:${s.x * 100}%;top:${s.y * 100}%;--pc:${d.colors.accent || '#ffb070'}" title="${esc(d.open ? d.name : d.why || 'Sealed')}">
        <span class="tv-pin-ic">${glyph(d.open ? d.icon : 'lock')}</span><span class="tv-pin-n"><b>${d.n}</b>${esc(d.name)}</span>
        ${d.done ? `<span class="tv-stamp${d.cleared ? '' : ' crew'}" title="${d.cleared ? `Cleared ×${d.cleared}` : 'Cleared by a crew'}">${d.cleared ? 'Cleared' : 'Saved'}</span>` : ''}${d.quest && d.open ? '<span class="dn-q" title="A story quest leads here">!</span>' : ''}</button>`;
    }).join('');
    const d = L.find(x => x.id === this.sel) || L[0]; if (!d) { this.card.innerHTML = ''; return; }
    const beat = d.cleared ? `<em class="tv-beat">beaten ×${d.cleared}</em>` : d.crew ? '<em class="tv-beat">beaten by a crew</em>' : '';
    const sofar = !d.done && d.open && d.bestFloor > 0 ? `<div class="dn-prow"><span>So far</span><b>You've reached floor ${d.bestFloor}${d.bestFloor >= d.floors ? `: ${esc(d.bossShort)} waits` : ''}</b></div>` : ''; // (your progress, on its own row)
    const status = !d.open ? `<div class="tv-st locked">${glyph('lock')}<span>${esc(d.why || 'Sealed for now')}</span></div>`
      : `<button class="btn tv-go dn-go${d.the.length > 18 ? ' long' : ''}">${glyph(d.icon)}<span>Into ${esc(d.the)}!</span></button>`;
    this.card.style.setProperty('--pc', d.colors.accent || '#ffb070');
    this.card.innerHTML = `<div class="tv-wm">${glyph(d.icon)}</div><div class="tv-hd"><span class="tv-ic">${glyph(d.open ? d.icon : 'lock')}</span><div><b>${esc(d.name)}</b><span class="tv-sub">Den ${d.n} of ${L.length}</span></div></div>
      <p class="tv-sub">${esc(d.blurb)}</p>
      <div class="tv-rows">
        <div><span>Floors</span><b>${d.floors}, then the boss's chamber</b></div>
        <div><span>Level</span><b>Lv ${d.levels[0]}–${d.levels[1]}</b></div>
        <div class="fit ${d.fit}"><span>For you (Lv ${d.hero})</span><b>${FIT[d.fit]}</b></div>
        <div><span>Boss</span><b>${esc(d.boss)} ${beat}</b></div>
        ${sofar}
        <div class="dn-yokai"><span>Yokai</span><b>${d.monsters.map(esc).join(', ')}</b></div>
        ${d.quest ? `<div class="dn-qrow"><span>Quest</span><b>${esc(d.quest.text)} <em class="tv-beat">${esc(d.quest.title)}</em></b></div>` : ''}
        ${d.deep ? `<div class="dn-deep"><span>Deeper</span><b>${d.deep.lit ? 'The Spirit Lantern by the door is lit: the Deep Burrow\'s tier runs' : 'Calm Tamamo and the Spirit Lantern by the door wakes'}</b></div>` : ''}
      </div>
      ${status}`;
  }
  // ---------------------------------------------------------------- the painted hill
  // A cut-through of Shrine Hill at dusk: the sky, the grassy brow with its torii and the Burrow's mouth, then the earth in
  // bands growing cooler and darker with depth (topsoil, clay, rock, the deep), roots, pebbles, the tunnel winding down,
  // and the four dens as lit pockets in their own colours (sealed ones dim, behind a stone plug).
  drawArt() {
    const cv = this.cv, dpr = Math.min(2, devicePixelRatio || 1);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const L = this.list();
    const R = (seed => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; })(91);
    const rgb = h => { const n = parseInt(String(h || '#888888').slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
    const mix = (a, b, t) => { const A = rgb(a), B = rgb(b); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`; };
    const grass = y0 => x => y0 - 30 * Math.exp(-(((x - W * 0.5) / (W * 0.32)) ** 2)) + Math.sin(x * 0.03) * 2;
    const top = grass(78);
    // the sky: a dusk wash, two soft clouds, a few petals
    const sky = g.createLinearGradient(0, 0, 0, 90); sky.addColorStop(0, '#ffcfc4'); sky.addColorStop(1, '#ffeedd');
    g.fillStyle = sky; g.fillRect(0, 0, W, 96);
    g.fillStyle = 'rgba(255,255,255,.7)';
    for (const [cx, cy, s] of [[84, 30, 1], [470, 22, 0.8]]) { g.beginPath(); g.ellipse(cx, cy, 34 * s, 9 * s, 0, 0, Math.PI * 2); g.ellipse(cx + 18 * s, cy - 6 * s, 18 * s, 9 * s, 0, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#ffb8cc'; for (let i = 0; i < 9; i++) { const x = 40 + R() * (W - 80), y = 10 + R() * 50; g.beginPath(); g.ellipse(x, y, 3, 1.8, R() * 3, 0, Math.PI * 2); g.fill(); }
    // the earth in bands (each boundary a gentle wave)
    const bands = [['#d2aa80', '#c49a70'], ['#b98d6c', '#a87e60'], ['#8e7a8e', '#7e6a80'], ['#544e7c', '#3e3a64']], bY = [top, x => 168 + Math.sin(x * 0.021 + 1) * 7, x => 262 + Math.sin(x * 0.018 + 3) * 8, x => 350 + Math.sin(x * 0.02 + 5) * 7, () => H + 4];
    bands.forEach(([a, b], k) => {
      const gr = g.createLinearGradient(0, k ? 150 + k * 90 : 60, 0, 170 + k * 92); gr.addColorStop(0, a); gr.addColorStop(1, b);
      g.beginPath(); g.moveTo(0, bY[k](0)); for (let x = 0; x <= W; x += 8) g.lineTo(x, bY[k](x)); for (let x = W; x >= 0; x -= 8) g.lineTo(x, bY[k + 1](x)); g.closePath();
      g.fillStyle = gr; g.fill();
      if (k) { g.beginPath(); for (let x = 0; x <= W; x += 8) (x ? g.lineTo : g.moveTo).call(g, x, bY[k](x)); g.strokeStyle = 'rgba(58,34,40,.22)'; g.lineWidth = 2; g.stroke(); }
    });
    // pebbles and specks (lighter up top, a few glints down deep)
    for (let i = 0; i < 150; i++) {
      const x = R() * W, y = 96 + R() * (H - 96), d = (y - 90) / (H - 90);
      g.fillStyle = d > 0.72 && R() < 0.3 ? `rgba(180,200,255,${0.25 + R() * 0.3})` : `rgba(${d < 0.5 ? '90,60,44' : '40,30,56'},${0.12 + R() * 0.14})`;
      g.beginPath(); g.ellipse(x, y, 2 + R() * 3.2, 1.4 + R() * 2, R() * 3, 0, Math.PI * 2); g.fill();
    }
    // roots hanging from the grass
    g.strokeStyle = 'rgba(110,72,46,.55)'; g.lineCap = 'round';
    for (let i = 0; i < 16; i++) { const x = 30 + i * 33 + R() * 14, y = top(x) + 6, len = 18 + R() * 30; g.lineWidth = 2.2 - R(); g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + (R() - 0.5) * 22, y + len * 0.6, x + (R() - 0.5) * 18, y + len); g.stroke(); }
    // the grassy brow
    const gg = g.createLinearGradient(0, 40, 0, 96); gg.addColorStop(0, '#a8d878'); gg.addColorStop(1, '#78ae52'); g.fillStyle = gg;
    g.beginPath(); g.moveTo(0, top(0)); for (let x = 0; x <= W; x += 6) g.lineTo(x, top(x)); for (let x = W; x >= 0; x -= 6) g.lineTo(x, top(x) + 14); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(58,34,40,.55)'; g.lineWidth = 3; g.beginPath(); for (let x = 0; x <= W; x += 6) (x ? g.lineTo : g.moveTo).call(g, x, top(x)); g.stroke();
    g.fillStyle = '#5e9442'; for (let x = 6; x < W; x += 11) { const y = top(x); g.beginPath(); g.moveTo(x - 3, y + 1); g.lineTo(x, y - 6 - (x % 3) * 2); g.lineTo(x + 3, y + 1); g.fill(); }
    // the torii and the Burrow's mouth on the brow
    const mx = MOUTH.x * W, my = MOUTH.y * H;
    { const tx = mx - 92, ty = top(tx); g.fillStyle = '#e8503a'; g.strokeStyle = '#4a2c2a'; g.lineWidth = 2;
      for (const ox of [-11, 11]) { g.fillRect(tx + ox - 2.5, ty - 30, 5, 30); g.strokeRect(tx + ox - 2.5, ty - 30, 5, 30); }
      g.beginPath(); g.moveTo(tx - 20, ty - 33); g.quadraticCurveTo(tx, ty - 38, tx + 20, ty - 33); g.lineTo(tx + 19, ty - 29); g.lineTo(tx - 19, ty - 29); g.closePath(); g.fillStyle = '#3a2830'; g.fill();
      g.fillStyle = '#e8503a'; g.fillRect(tx - 15, ty - 25, 30, 4); g.strokeRect(tx - 15, ty - 25, 30, 4); }
    { const tx = mx + 104, ty = top(tx) + 2, lit = !!L[L.length - 1]?.deep?.lit; // (the Spirit Lantern by the door: a little stone tōrō, its spirit flame lit once Tamamo is calmed)
      g.fillStyle = '#a49e94'; g.strokeStyle = '#4a2c2a'; g.lineWidth = 1.6;
      const box = (x0, y0, w, h) => { g.fillRect(x0, y0, w, h); g.strokeRect(x0, y0, w, h); };
      box(tx - 7, ty - 4, 14, 4); box(tx - 2.5, ty - 15, 5, 11); box(tx - 6, ty - 18, 12, 3);
      g.fillStyle = lit ? '#e8deff' : '#d8d0c4'; box(tx - 5, ty - 26, 10, 8);
      g.fillStyle = '#6c6862'; g.beginPath(); g.moveTo(tx - 10, ty - 26); g.lineTo(tx, ty - 33); g.lineTo(tx + 10, ty - 26); g.closePath(); g.fill(); g.stroke();
      if (lit) { const lg = g.createRadialGradient(tx, ty - 22, 1, tx, ty - 22, 20); lg.addColorStop(0, 'rgba(184,166,255,.75)'); lg.addColorStop(1, 'rgba(184,166,255,0)'); g.fillStyle = lg; g.fillRect(tx - 22, ty - 44, 44, 44); } }
    g.fillStyle = '#7a5a40'; g.beginPath(); g.ellipse(mx, my + 2, 27, 21, 0, Math.PI, 0); g.lineTo(mx + 27, my + 10); g.lineTo(mx - 27, my + 10); g.closePath(); g.fill();
    g.fillStyle = '#2a2034'; g.beginPath(); g.ellipse(mx, my + 4, 19, 15, 0, Math.PI, 0); g.lineTo(mx + 19, my + 12); g.lineTo(mx - 19, my + 12); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(58,34,40,.7)'; g.lineWidth = 2.5; g.beginPath(); g.ellipse(mx, my + 2, 27, 21, 0, Math.PI, 0); g.stroke();
    // the tunnel: the mouth → each den in turn (past the last open den: a dotted, crumbled way)
    const pts = [[mx, my + 12], ...SPOT.map(s => [s.x * W, s.y * H])];
    const seg = (a, b, k) => { const [x0, y0] = a, [x1, y1] = b, cx = (x0 + x1) / 2 + (k % 2 ? -1 : 1) * 40, cy = (y0 + y1) / 2 - 8; g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(cx, cy, x1, y1); };
    const openN = L.filter(d => d.open).length;
    for (let k = 0; k < SPOT.length; k++) {
      const live = k < openN;
      g.setLineDash(live ? [] : [4, 9]);
      seg(pts[k], pts[k + 1], k); g.strokeStyle = live ? 'rgba(58,34,40,.75)' : 'rgba(30,22,40,.45)'; g.lineWidth = live ? 19 : 6; g.stroke();
      if (live) { seg(pts[k], pts[k + 1], k); g.strokeStyle = mix('#f2dcc0', '#c8b8d8', k / 3); g.lineWidth = 12; g.stroke(); seg(pts[k], pts[k + 1], k); g.setLineDash([2, 12]); g.strokeStyle = 'rgba(140,100,70,.45)'; g.lineWidth = 3; g.stroke(); }
    }
    g.setLineDash([]);
    // the dens
    L.forEach((d, i) => this.drawDen(g, d, SPOT[i].x * W, SPOT[i].y * H, i, R, mix));
    // the Deep Burrow's spirit glow under the last den, once the Lantern is lit
    const last = L[L.length - 1];
    if (last?.deep?.lit) { const x = SPOT[3].x * W, y = H; const sg = g.createRadialGradient(x, y, 4, x, y, 120); sg.addColorStop(0, 'rgba(184,166,255,.5)'); sg.addColorStop(1, 'rgba(184,166,255,0)'); g.fillStyle = sg; g.fillRect(x - 130, y - 130, 260, 130); }
    // a soft vignette (the paper's edge)
    const vg = g.createRadialGradient(W / 2, H / 2, H * 0.38, W / 2, H / 2, H * 0.82); vg.addColorStop(0, 'rgba(255,246,232,0)'); vg.addColorStop(1, 'rgba(70,40,60,.3)');
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
  }
  /** one den's chamber: a domed cave in the earth, lit in its theme's colours, its floor and motifs (a sealed den: dim,
   *  a stone plug where the tunnel meets it) */
  drawDen(g, d, x, y, i, R, mix) {
    const c = d.colors, rx = 116, ryT = 52, ryB = 22, open = d.open, fy = y + 6; // (fy: the cave's floor line)
    const TAU = Math.PI * 2, hex = h => (h || '#ffc88a').slice(1).match(/../g).map(v => parseInt(v, 16)).join(',');
    const dome = (k = 1) => { g.beginPath(); for (let s = 0; s <= 40; s++) { const a = s / 40 * TAU, up = Math.sin(a) < 0, rr = 1 + 0.045 * Math.sin(a * 3 + i * 1.7) + 0.03 * Math.sin(a * 5 + i); const px = x + Math.cos(a) * rx * k * rr, py = y + Math.sin(a) * (up ? ryT : ryB) * k * rr; s ? g.lineTo(px, py) : g.moveTo(px, py); } g.closePath(); };
    const FLOOR = ['#7fb35a', '#a8604a', '#5a4038', '#4a4a7a'][i], FLOOR_HI = ['#a4d070', '#c88a64', '#7a5a48', '#6c6ca8'][i];
    if (open) { // its light spills into the earth round it
      const hg = g.createRadialGradient(x, y - 6, rx * 0.4, x, y - 6, rx * 1.4); hg.addColorStop(0, `rgba(${hex(c.light)},.38)`); hg.addColorStop(1, `rgba(${hex(c.light)},0)`);
      g.fillStyle = hg; g.fillRect(x - rx * 1.45, y - ryT * 2.6, rx * 2.9, ryT * 4.2);
    }
    g.save();
    dome(1.04); g.fillStyle = 'rgba(30,20,36,.5)'; g.fill(); // (the cave's dark edge in the earth)
    dome(); const fg = g.createRadialGradient(x, fy - 4, 6, x, y - ryT * 0.25, rx * 0.95);
    fg.addColorStop(0, mix(c.light || '#ffc88a', '#ffffff', 0.5)); fg.addColorStop(0.45, mix(c.floor2 || c.floor || '#c8a888', c.light || '#ffc88a', 0.3)); fg.addColorStop(1, mix(c.fog || '#2c2230', c.wall2 || c.wall || '#6a5048', 0.5));
    g.fillStyle = fg; g.fill(); g.clip();
    // the back wall's soft strata
    g.strokeStyle = `rgba(${hex(c.wall2 || c.wall)},.35)`; g.lineWidth = 2;
    for (let k = 1; k <= 3; k++) { g.beginPath(); for (let px = x - rx; px <= x + rx; px += 8) { const py = y - ryT * (0.15 + k * 0.2) + Math.sin(px * 0.08 + k + i) * 2.5; px === x - rx ? g.moveTo(px, py) : g.lineTo(px, py); } g.stroke(); }
    // the floor: the den's own (moss, shrine planks, kitchen tiles, moonlit stone), its top edge soft
    const edge = px => fy + Math.sin(px * 0.12 + i) * 1.6;
    g.fillStyle = FLOOR; g.beginPath(); g.moveTo(x - rx * 1.1, y + ryB * 1.2); for (let px = x - rx * 1.1; px <= x + rx * 1.1; px += 6) g.lineTo(px, edge(px)); g.lineTo(x + rx * 1.1, y + ryB * 1.2); g.closePath(); g.fill();
    g.strokeStyle = FLOOR_HI; g.lineWidth = 2.5; g.beginPath(); for (let px = x - rx * 1.1; px <= x + rx * 1.1; px += 6) px === x - rx * 1.1 ? g.moveTo(px, edge(px)) : g.lineTo(px, edge(px)); g.stroke();
    g.strokeStyle = 'rgba(0,0,0,.14)'; g.lineWidth = 1.2;
    if (i === 1) for (let px = x - rx; px < x + rx; px += 14) { g.beginPath(); g.moveTo(px, fy + 3); g.lineTo(px - 4, fy + ryB); g.stroke(); } // (planks)
    if (i === 2) { for (let px = x - rx; px < x + rx; px += 12) { g.beginPath(); g.moveTo(px, fy + 2); g.lineTo(px, fy + ryB); g.stroke(); } g.beginPath(); g.moveTo(x - rx, fy + 9); g.lineTo(x + rx, fy + 9); g.stroke(); } // (tiles)
    const glow = (gx, gy, r, col, a = 0.6) => { const q = g.createRadialGradient(gx, gy, 1, gx, gy, r); q.addColorStop(0, `rgba(${hex(col)},${a})`); q.addColorStop(1, `rgba(${hex(col)},0)`); g.fillStyle = q; g.fillRect(gx - r, gy - r, r * 2, r * 2); };
    if (i === 0) { // hanging roots, moss tufts, red-capped mushrooms, a fairy ring, a little mochi
      g.strokeStyle = 'rgba(110,72,46,.7)'; g.lineWidth = 2; for (const ox of [-70, -38, 30, 66]) { g.beginPath(); g.moveTo(x + ox, y - ryT); g.quadraticCurveTo(x + ox + 6, y - ryT * 0.6, x + ox - 2, y - ryT * 0.35); g.stroke(); }
      g.fillStyle = '#a4d070'; for (const [ox, s] of [[-84, 1], [-48, 0.8], [58, 1.1], [92, 0.7]]) { g.beginPath(); g.ellipse(x + ox, fy + 1, 13 * s, 7 * s, 0, Math.PI, 0); g.fill(); }
      for (const [ox, s] of [[-64, 1.15], [76, 0.95], [-26, 0.7]]) { const mx2 = x + ox, my2 = fy + 1; g.fillStyle = '#f4ead8'; g.fillRect(mx2 - 2.4 * s, my2 - 10 * s, 4.8 * s, 10 * s); g.fillStyle = '#e8503a'; g.beginPath(); g.ellipse(mx2, my2 - 10 * s, 10 * s, 6.5 * s, 0, Math.PI, 0); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(mx2 - 4 * s, my2 - 13 * s, 1.6 * s, 0, TAU); g.arc(mx2 + 3 * s, my2 - 14 * s, 1.3 * s, 0, TAU); g.fill(); }
      for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; glow(x + 28 + Math.cos(a) * 14, fy - 2 + Math.sin(a) * 4, 6, '#fff0a0', 0.8); }
      const bx = x + 40, by = fy - 1; g.fillStyle = '#ffd6e4'; g.strokeStyle = 'rgba(74,44,42,.8)'; g.lineWidth = 1.5; g.beginPath(); g.ellipse(bx, by - 7, 10, 8, 0, Math.PI, 0); g.quadraticCurveTo(bx + 11, by + 1, bx, by + 1); g.quadraticCurveTo(bx - 11, by + 1, bx - 10, by - 7); g.fill(); g.stroke();
      g.fillStyle = '#4a2c2a'; g.beginPath(); g.arc(bx - 3.5, by - 7, 1.3, 0, TAU); g.arc(bx + 3.5, by - 7, 1.3, 0, TAU); g.fill(); g.fillStyle = 'rgba(255,120,150,.6)'; g.beginPath(); g.arc(bx - 6, by - 4.5, 1.6, 0, TAU); g.arc(bx + 6, by - 4.5, 1.6, 0, TAU); g.fill();
    } else if (i === 1) { // a row of vermilion torii, paper lanterns
      for (const [ox, s] of [[-76, 0.8], [-38, 0.95], [52, 0.9], [86, 0.75]]) { const bx = x + ox, by = fy + 1; g.fillStyle = '#e8503a'; g.fillRect(bx - 10 * s, by - 34 * s, 4 * s, 34 * s); g.fillRect(bx + 6 * s, by - 34 * s, 4 * s, 34 * s); g.fillStyle = '#3a2228'; g.beginPath(); g.moveTo(bx - 16 * s, by - 37 * s); g.quadraticCurveTo(bx, by - 41 * s, bx + 16 * s, by - 37 * s); g.lineTo(bx + 15 * s, by - 34 * s); g.lineTo(bx - 15 * s, by - 34 * s); g.closePath(); g.fill(); g.fillStyle = '#e8503a'; g.fillRect(bx - 12 * s, by - 29 * s, 24 * s, 3 * s); }
      for (const ox of [-58, 70, 18, -12]) { const lx = x + ox, ly = y - ryT * 0.55 + (ox % 7); g.strokeStyle = 'rgba(58,34,40,.6)'; g.lineWidth = 1; g.beginPath(); g.moveTo(lx, y - ryT); g.lineTo(lx, ly - 7); g.stroke(); glow(lx, ly, 18, '#ffbe6e', 0.55); g.fillStyle = '#ff9a5a'; g.beginPath(); g.ellipse(lx, ly, 5, 7, 0, 0, TAU); g.fill(); g.fillStyle = '#3a2228'; g.fillRect(lx - 3, ly - 8, 6, 2); g.fillRect(lx - 3, ly + 6, 6, 2); }
    } else if (i === 2) { // pots on the boil over embers, steam, a string of dumplings
      for (const [ox, s] of [[-66, 1.1], [10, 0.9], [70, 1]]) { const px = x + ox, py = fy + 1; glow(px, py - 2, 22 * s, '#ff8c3c', 0.8); g.fillStyle = '#3a2a2a'; g.beginPath(); g.ellipse(px, py - 9 * s, 13 * s, 10 * s, 0, 0, TAU); g.fill(); g.fillStyle = '#5a4040'; g.fillRect(px - 15 * s, py - 19 * s, 30 * s, 4 * s); g.fillStyle = '#ffb04a'; for (const fx of [-6, 0, 6]) { g.beginPath(); g.moveTo(px + fx * s - 3, py); g.lineTo(px + fx * s, py - 7 * s); g.lineTo(px + fx * s + 3, py); g.fill(); }
        g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 2.2; g.beginPath(); g.moveTo(px - 3, py - 21 * s); g.bezierCurveTo(px - 10, py - 30 * s, px + 6, py - 34 * s, px - 1, py - 44 * s); g.stroke(); }
      g.strokeStyle = 'rgba(58,34,40,.6)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x - 50, y - ryT * 0.7); g.quadraticCurveTo(x - 10, y - ryT * 0.45, x + 30, y - ryT * 0.7); g.stroke();
      g.fillStyle = '#fff4e4'; for (let k = 0; k < 5; k++) { const t = k / 4; g.beginPath(); g.ellipse(x - 50 + t * 80, y - ryT * 0.7 + Math.sin(t * Math.PI) * ryT * 0.22 + 4, 4.5, 3.5, 0, 0, TAU); g.fill(); }
    } else { // crystals up from the floor and down from the dome, a crescent moon's light, stars
      glow(x + 34, y - ryT * 0.45, 40, '#dce6ff', 0.75);
      g.fillStyle = '#f4f6ff'; g.beginPath(); g.arc(x + 34, y - ryT * 0.45, 9, 0, TAU); g.fill(); g.fillStyle = mix(c.fog || '#10122a', '#5a5a8a', 0.55); g.beginPath(); g.arc(x + 38.5, y - ryT * 0.45 - 3.5, 8, 0, TAU); g.fill();
      const shard = (bx, by, h, col, down = false) => { const k = down ? 1 : -1; g.fillStyle = col; g.beginPath(); g.moveTo(bx - 6, by); g.lineTo(bx, by + k * h); g.lineTo(bx + 6, by); g.closePath(); g.fill(); g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.moveTo(bx - 1, by); g.lineTo(bx, by + k * (h - 4)); g.lineTo(bx + 2.5, by); g.fill(); };
      for (const [ox, h, col] of [[-86, 24, '#a8e8ff'], [-70, 16, '#ffc8f0'], [-48, 28, '#c8b8ff'], [62, 22, '#a8e8ff'], [84, 15, '#ffc8f0']]) { glow(x + ox, fy - h * 0.4, h, col, 0.35); shard(x + ox, fy + 1, h, col); }
      for (const [ox, h, col] of [[-60, 14, '#c8b8ff'], [-20, 10, '#a8e8ff'], [76, 12, '#c8b8ff']]) shard(x + ox, y - ryT * 0.98, h, col, true);
      g.fillStyle = 'rgba(255,255,255,.85)'; for (let k = 0; k < 10; k++) { g.beginPath(); g.arc(x - 90 + R() * 180, y - ryT * 0.85 + R() * ryT * 0.6, 0.8 + R(), 0, TAU); g.fill(); }
    }
    g.restore();
    // the rim: ink, a thin line of the den's colour inside it
    dome(); g.strokeStyle = 'rgba(58,34,40,.82)'; g.lineWidth = 3; g.stroke();
    dome(0.95); g.strokeStyle = mix(c.accent || '#ffd0a0', '#ffffff', 0.35); g.globalAlpha = open ? 0.5 : 0.18; g.lineWidth = 2; g.stroke(); g.globalAlpha = 1;
    if (!open) { // sealed: dimmed, with a stone plug where the tunnel comes in
      dome(); g.fillStyle = 'rgba(52,44,70,.55)'; g.fill();
      const sx = x + (i % 2 ? -1 : 1) * rx * 0.86, sy = y - ryT * 0.3;
      g.fillStyle = '#8a8496'; g.strokeStyle = 'rgba(40,30,50,.8)'; g.lineWidth = 2;
      for (const [ox, oy, r] of [[0, 0, 12], [-8, 10, 9], [9, 9, 8], [2, -11, 8]]) { g.beginPath(); g.arc(sx + ox, sy + oy, r, 0, TAU); g.fill(); g.stroke(); }
    }
  }
}
