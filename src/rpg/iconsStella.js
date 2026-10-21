// Stella the Sun Oracle's painted icons (docs/STELLA.md), in rpg/icons.js' look: the sun wagasa item art (twelve bases by
// variant + colours [canopy, rays, finial]) and her skill art. icons.js calls these with its drawing kit K (ICON_KIT:
// paint, vol, volR, shine, sparkle, glow, …), so this module imports nothing from it (no import cycle). Art is drawn
// around 0,0 in a 64 box. Her magic is sunlight (a white core, sun gold, pale gold, dawn rose: rays, sun discs and motes),
// never orange flames: that's Chewy's Blazing Ball and Foosy's embers.
export const STL_SKILL_TREE = {
  goldenRay: 'ray', innerLight: 'ray', glint: 'ray', prism: 'ray', sunlit: 'ray', solarRay: 'ray', sundial: 'ray',
  solarFlare: 'flare', sunKissed: 'flare', skippingSun: 'flare', sunspot: 'flare', sunburn: 'flare', littleSun: 'flare', risingSun: 'flare',
  morningLight: 'dawn', sunnyDisposition: 'dawn', kindLight: 'dawn', halo: 'dawn', stlZoomies: 'dawn', sunDog: 'dawn', daybreak: 'dawn',
};
export const STL_SKILL_BG = {
  ray: ['#fffbe8', '#f6d880', '#b8861a'], flare: ['#fff1e8', '#f6b08a', '#c0502a'], dawn: ['#fff3f2', '#f4b8b0', '#b85a6a'],
};
export const STL_PASSIVE = ['innerLight', 'sunlit', 'sunKissed', 'sunburn', 'sunnyDisposition', 'stlZoomies'];

const TAU = Math.PI * 2;
const INKC = '#4a2c2a';
// "Midday": her robe, petticoat, obi, beads; her coat and eyes
const SAFFRON = '#f0c24e', SUNSET = '#d9573e', AMBER = '#dfa23c';
const FUR = '#a9a6a2', FUR_LT = '#cfccc6', FUR_DK = '#85817c', EYE = '#7fb2e0', NOSE = '#8f7474';
// her sunlight
const CORE = '#fffaf0', GOLD = '#ffd36a', PALE = '#fff1b8', ROSE = '#f7b8a8';
const WOOD = '#6b4630';
const SHADOW_BLK = '#34303f', SHADOW_WHT = '#f4ece0';
const YOKAI = '#b9a6dc', HORN = '#fff4de', BLUSH = '#ff9ab8', HEART = '#ff7f9e';
const PAPER = [SUNSET, SAFFRON, AMBER]; // the Paper Wagasa, the prop as painted

// ------------------------------------------------------------------ pieces
const hexA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
function swoosh(g, K, draw, w = 4, col = CORE) { draw(); K.stroke(g, INKC, w + 2.6); draw(); K.stroke(g, col, w); }

/** a chunky tassel hanging from (x, y): a cord, a bead, the bell of threads */
function tassel(g, K, x, y, s = 1, col = AMBER) {
  g.save(); g.translate(x, y); g.scale(s, s);
  g.beginPath(); g.moveTo(0, 0); g.lineTo(0, 4.4); K.stroke(g, INKC, 2.6); g.beginPath(); g.moveTo(0, 0); g.lineTo(0, 4.4); K.stroke(g, K.D(col, 0.2), 1.1);
  K.circ(g, 0, 4.6, 2); K.paint(g, K.volR(g, col, 0, 4.6, 2, 0.5, 0.3), 1.1);
  const y0 = 6.4, y1 = 15;
  g.beginPath(); g.moveTo(-1.7, y0); g.quadraticCurveTo(-3.8, y0 + 3, -3.4, y1); g.quadraticCurveTo(0, y1 + 1.8, 3.4, y1); g.quadraticCurveTo(3.8, y0 + 3, 1.7, y0); g.closePath();
  K.paint(g, K.vol(g, col, -3.6, y0, 3.6, y1, 0.42, 0.3), 1.3);
  for (const k of [-1.3, 0, 1.3]) { g.beginPath(); g.moveTo(k * 0.8, y0 + 3); g.lineTo(k * 1.25, y1 - 0.2); K.stroke(g, K.D(col, 0.3), 0.7); }
  K.rr(g, -2.4, y0 - 0.4, 4.8, 2, 0.9); K.paint(g, K.L(col, 0.35), 0.9);
  g.restore();
}

/** the sun wagasa, open, seen from above-front: (x, y) the middle of its rim, s its scale, rot its turn (the finial up at
 *  −y before turning); cols [canopy, rays, finial]; v the base's variant; o: { el: the view's elevation (rad), tassels:
 *  0–4, shaft: false to leave the shaft out, tasselCol }. → { tip: the finial's disc, rim(a): a point on the rim } in the
 *  caller's space. The canopy's a dome in 3D projected, so its sunburst panels converge on the finial as a real one's do. */
function wagasa(g, K, x, y, s = 1, rot = 0, cols = PAPER, v = 'paper', o = {}) {
  const [can = SUNSET, ray = SAFFRON, fin = AMBER] = cols || [];
  const lantern = v === 'lantern', dawn = v === 'dawn';
  const R = 24, H = lantern ? 16 : 11, p = lantern ? 2.3 : 1.5, N = v === 'marigold' ? 20 : 16;
  const el = o.el ?? 0.6, se = Math.sin(el), ce = Math.cos(el);
  const sc = v === 'marigold' ? 0.085 : 0.05; // the scallops' depth
  const z = r => H * (1 - Math.pow(Math.min(1, r / R), p));
  const P = (r, a) => [r * Math.cos(a), r * Math.sin(a) * se - z(r) * ce];
  // (the back of the dome turns away from the eye past this radius: where its normal stops facing the camera)
  const fold = a => { const sn = Math.sin(a); if (sn >= -1e-3) return Infinity; return Math.pow((se / ce) * Math.pow(R, p) / (H * p * -sn), 1 / (p - 1)); };
  const rOut = (a, u) => Math.min(R * (1 + sc * Math.sin(Math.PI * u)), fold(a));
  const cs = Math.cos(rot), sn = Math.sin(rot);
  const toParent = ([lx, ly]) => [x + s * (lx * cs - ly * sn), y + s * (lx * sn + ly * cs)];
  const apexY = -z(0) * ce, finY = apexY - 5.6;
  const out = { tip: toParent([0, finY]), rim: a => toParent(P(R, a)), at: toParent };
  const tasselCol = o.tasselCol ?? (v === 'marigold' || v === 'golden' ? SUNSET : AMBER);
  g.save(); g.translate(x, y); g.rotate(rot); g.scale(s, s);
  // the shaft and its crook (under the canopy)
  if (o.shaft !== false) {
    const yb = (o.shaftLen ?? 27) * ce;
    const sh = () => { g.beginPath(); g.moveTo(0, 0); g.lineTo(0, yb); g.arc(-3.8, yb, 3.8, 0, Math.PI * 0.92); };
    sh(); K.stroke(g, INKC, 5); sh(); K.stroke(g, K.lin(g, -1.5, 0, 1.5, 0, [[0, '#8f6448'], [1, WOOD]]), 3);
    g.beginPath(); g.moveTo(0, yb - 9); g.lineTo(0, yb - 3); K.stroke(g, INKC, 5.4); g.beginPath(); g.moveTo(0, yb - 9); g.lineTo(0, yb - 3); K.stroke(g, can, 3.4); // (the grip's cord wrap)
    for (const t of [yb - 7.4, yb - 5.6, yb - 3.8]) { g.beginPath(); g.moveTo(-1.6, t - 0.5); g.lineTo(1.6, t + 0.5); K.stroke(g, K.L(can, 0.45), 0.7); }
  }
  // behind the canopy: a corona's halo of rays, a sunburst's ray tips
  if (v === 'corona') { // a soft corona of light all round the canopy
    const [cx, cy] = P(R * 0.3, Math.PI / 2);
    g.fillStyle = K.rad(g, cx, cy, R * 1.45, [[0.55, hexA(PALE, 0.95)], [0.8, hexA(PALE, 0.45)], [1, hexA(PALE, 0)]]);
    g.beginPath(); for (let i = 0; i < 24; i++) { const a = i / 24 * TAU, w = 0.07, k = i % 2 ? 1.28 : 1.42; const [ax, ay] = P(R * 0.9, a - w), [bx, by] = P(R * k, a), [ex, ey] = P(R * 0.9, a + w); g.moveTo(ax, ay); g.lineTo(bx, by); g.lineTo(ex, ey); g.closePath(); } g.fill();
  }
  if (v === 'sunburst') { // the sun's own rays past the rim, all round
    g.beginPath(); for (let i = 0; i < N; i++) { const a = Math.PI / 2 + (i - 0.5) * TAU / N, w = 0.09; const [ax, ay] = P(R * 0.95, a - w), [bx, by] = P(R * 1.24, a), [ex, ey] = P(R * 0.95, a + w); g.moveTo(ax, ay); g.lineTo(bx, by); g.lineTo(ex, ey); g.closePath(); }
    K.paint(g, K.L(fin === '#fff8e0' ? GOLD : fin, 0.1), 1.1);
  }
  // the canopy: N panels, back to front; one ink layer under every panel makes the outline, then each panel's fill
  const W = [];
  for (let i = 0; i < N; i++) { const a0 = Math.PI / 2 + (i - 0.5) * TAU / N, a1 = a0 + TAU / N; W.push({ i, a0, a1, am: (a0 + a1) / 2 }); }
  W.sort((A, B) => Math.sin(A.am) - Math.sin(B.am));
  const panel = w => {
    const S = 6, U = 8, r0 = rOut(w.a0, 0), r1 = rOut(w.a1, 1);
    let q = P(0, w.a0); g.moveTo(q[0], q[1]);
    for (let t = 1; t <= S; t++) { q = P(r0 * t / S, w.a0); g.lineTo(q[0], q[1]); }
    for (let u = 1; u <= U; u++) { const a = w.a0 + (w.a1 - w.a0) * u / U; q = P(rOut(a, u / U), a); g.lineTo(q[0], q[1]); }
    for (let t = S - 1; t >= 0; t--) { q = P(r1 * t / S, w.a1); g.lineTo(q[0], q[1]); }
    g.closePath();
  };
  g.beginPath(); for (const w of W) panel(w); K.stroke(g, INKC, 3.6);
  const [ax, ay] = P(0, 0);
  for (const w of W) {
    const f = Math.max(0, Math.min(1, 0.52 + 0.5 * (-0.62 * Math.cos(w.am) + 0.42 * Math.sin(w.am))));
    const base = dawn ? (w.i % 2 ? K.L(can, 0.18) : can) : (w.i % 2 ? ray : can);
    const tone = f > 0.5 ? K.L(base, (f - 0.5) * 0.6) : K.D(base, (0.5 - f) * 0.6);
    const [rx, ry] = P(R, w.am);
    g.beginPath(); panel(w);
    g.fillStyle = dawn ? K.lin(g, ax, ay, rx, ry, [[0, K.L(ray, 0.25)], [0.45, K.L(ray, 0.05)], [0.8, tone], [1, K.D(tone, 0.08)]])
      : K.lin(g, ax, ay, rx, ry, [[0, K.L(tone, 0.32)], [0.5, tone], [0.85, K.D(tone, 0.1)], [1, K.D(tone, 0.22)]]);
    g.fill();
    K.stroke(g, hexA(K.D(can, 0.5), 0.5), 0.8);
  }
  // patterns on the paper (clipped to the canopy)
  g.save(); g.beginPath(); for (const w of W) panel(w); g.clip();
  const ring = (r0, r1) => { // the visible part of a ring on the dome, as one band
    const pts0 = [], pts1 = [];
    for (let i = 0; i <= 64; i++) { const a = -Math.PI / 2 + i / 64 * TAU; if (fold(a) < r1) continue; pts0.push(P(r1, a)); pts1.push(P(r0, a)); }
    if (pts0.length < 2) return false;
    g.beginPath(); pts0.forEach(([px, py], i) => i ? g.lineTo(px, py) : g.moveTo(px, py)); for (let i = pts1.length - 1; i >= 0; i--) g.lineTo(pts1[i][0], pts1[i][1]); g.closePath();
    return true;
  };
  if (v === 'shrine' && ring(R * 0.76, R * 0.84)) K.paint(g, fin, 0.9);
  if (v === 'lantern') {
    for (const rr of [R * 0.5, R * 0.8]) { g.beginPath(); let first = true; for (let i = 0; i <= 64; i++) { const a = -Math.PI / 2 + i / 64 * TAU; if (fold(a) < rr) { first = true; continue; } const [px, py] = P(rr, a); if (first) { g.moveTo(px, py); first = false; } else g.lineTo(px, py); } K.stroke(g, hexA(K.D(can, 0.45), 0.8), 1.1); }
    const [gx, gy] = P(R * 0.45, Math.PI / 2);
    g.fillStyle = K.rad(g, gx, gy, R * 0.9, [[0, hexA(PALE, 0.7)], [0.5, hexA(PALE, 0.25)], [1, hexA(PALE, 0)]]); g.fillRect(-R * 1.2, -R, R * 2.4, R * 2);
  }
  if (v === 'festival') for (const w of W) { if (w.i % 2 || fold(w.am) < R * 0.75) continue; for (const t of [0.48, 0.78]) { const [px, py] = P(R * t, w.am); K.ell(g, px, py, 1.5, 1.5 * (0.5 + se)); g.fillStyle = 'rgba(255,250,236,0.95)'; g.fill(); } }
  if (v === 'solstice') { // a gold crescent moon on the front panels: the longest day's turn
    const [mx, my] = P(R * 0.6, Math.PI / 2 - 0.35);
    crescent(g, mx, my, 5.6, mx + 3, my - 2.2, 4.8); K.paint(g, K.vol(g, ray, mx - 5, my - 5, mx + 4, my + 5, 0.4, 0.2), 1);
    K.sparkle(g, mx + 7, my - 5, 2.4, CORE);
  }
  if (dawn) { const [gx, gy] = P(R * 0.2, Math.PI / 2); g.fillStyle = K.rad(g, gx, gy, R * 0.8, [[0, hexA(CORE, 0.55)], [1, hexA(CORE, 0)]]); g.fillRect(-R * 1.2, -R, R * 2.4, R * 2); }
  g.restore();
  // the sun at the crown: a round cap of the rays' colour, where the panels meet
  g.beginPath();
  for (let i = 0; i <= 40; i++) { const a = i / 40 * TAU; const [px, py] = P(Math.min(R * 0.22, fold(a)), a); i ? g.lineTo(px, py) : g.moveTo(px, py); }
  g.closePath(); K.paint(g, K.lin(g, -5, apexY - 3, 5, apexY + 4, [[0, K.L(dawn ? CORE : ray, 0.5)], [1, dawn ? PALE : ray]]), 1.1);
  // the paper's sheen, top-left
  { const [hx, hy] = P(R * 0.5, Math.PI * 0.92); K.shine(g, hx + 1, hy - 1, 5.5, 1.6, -0.55, 0.55); }
  // the finial: a short stem, then the sun disc (twelve short rays) — or the daystar's star
  g.beginPath(); g.moveTo(0, apexY + 0.5); g.lineTo(0, finY + 2); K.stroke(g, INKC, 3.2); g.beginPath(); g.moveTo(0, apexY + 0.5); g.lineTo(0, finY + 2); K.stroke(g, WOOD, 1.6);
  if (v === 'daystar') {
    g.beginPath(); for (let i = 0; i < 8; i++) { const a = -Math.PI / 2 + i * Math.PI / 4, q = i % 2 ? 2.2 : 6.4; i ? g.lineTo(Math.cos(a) * q, finY + Math.sin(a) * q) : g.moveTo(Math.cos(a) * q, finY + Math.sin(a) * q); } g.closePath();
    K.paint(g, K.volR(g, fin, 0, finY, 6.4, 0.3, 0.25), 1.1);
    K.glow(g, 0, finY, 12, '#fff6c0', 0.7);
  } else {
    g.beginPath();
    for (let i = 0; i < 12; i++) { const a = i / 12 * TAU, d = 0.17; g.moveTo(Math.cos(a - d) * 3.4, finY + Math.sin(a - d) * 3.4); g.lineTo(Math.cos(a) * 5.6, finY + Math.sin(a) * 5.6); g.lineTo(Math.cos(a + d) * 3.4, finY + Math.sin(a + d) * 3.4); g.closePath(); }
    K.paint(g, K.L(fin, 0.3), 0.9);
    K.circ(g, 0, finY, 3.5); K.paint(g, K.volR(g, fin, 0, finY, 3.5, 0.55, 0.3), 1.2);
    K.circ(g, -1, finY - 1.1, 1); g.fillStyle = 'rgba(255,255,255,0.85)'; g.fill();
  }
  g.restore();
  // the tassels hang straight down whatever the wagasa's turn
  const n = o.tassels ?? 4;
  const TA = n >= 4 ? [Math.PI / 2 - 1.25, Math.PI / 2 - 0.42, Math.PI / 2 + 0.42, Math.PI / 2 + 1.25] : n === 3 ? [Math.PI / 2 - 0.95, Math.PI / 2, Math.PI / 2 + 0.95] : n === 2 ? [Math.PI / 2 - 0.7, Math.PI / 2 + 0.7] : n === 1 ? [Math.PI / 2] : [];
  for (const a of TA) { const [tx, ty] = toParent(P(R * 0.98, a)); tassel(g, K, tx, ty - s * 0.6, s * (o.tasselScale ?? 1), tasselCol); }
  return out;
}

/** a crescent: the circle (x1, y1, R1) with the circle (x2, y2, r2) bitten out of it (a path through their crossings) */
function crescent(g, x1, y1, R1, x2, y2, r2) {
  const dx = x2 - x1, dy = y2 - y1, d = Math.hypot(dx, dy), th = Math.atan2(dy, dx);
  const a = (d * d + R1 * R1 - r2 * r2) / (2 * d), h = Math.sqrt(Math.max(0, R1 * R1 - a * a));
  const al = Math.atan2(h, a), be = Math.atan2(h, a - d);
  g.beginPath(); g.arc(x1, y1, R1, th + al, th + TAU - al, false); g.arc(x2, y2, r2, th - be, th + be, true); g.closePath();
}

/** her sign: a sun disc with twelve short rays (a white core, sun gold) */
function sunDisc(g, K, x, y, r, o = {}) {
  const n = o.n ?? 12, col = o.col ?? GOLD, len = o.len ?? 1.6, lw = o.lw ?? Math.max(1, r * 0.16);
  if (o.glow !== false) K.glow(g, x, y, r * 2.8, '#ffe9a0', o.glowA ?? 0.6);
  g.beginPath();
  for (let i = 0; i < n; i++) { const a = i / n * TAU + (o.rot ?? 0), d = Math.PI / n * 0.55; g.moveTo(x + Math.cos(a - d) * r * 1.05, y + Math.sin(a - d) * r * 1.05); g.lineTo(x + Math.cos(a) * r * len, y + Math.sin(a) * r * len); g.lineTo(x + Math.cos(a + d) * r * 1.05, y + Math.sin(a + d) * r * 1.05); g.closePath(); }
  K.paint(g, o.rayCol ?? PALE, lw * 0.75);
  K.circ(g, x, y, r); K.paint(g, K.volR(g, col, x, y, r, 0.6, 0.22), lw);
  if (o.core !== false) { K.circ(g, x - r * 0.08, y - r * 0.08, r * 0.55); g.fillStyle = K.rad(g, x - r * 0.08, y - r * 0.08, r * 0.55, [[0, 'rgba(255,253,245,0.95)'], [1, 'rgba(255,250,240,0)']]); g.fill(); }
  K.shine(g, x - r * 0.38, y - r * 0.45, r * 0.3, r * 0.16, -0.6, 0.8);
}
/** a soft-rayed sun (rounded petals of light round a disc), the friendly kind: Hinata, Sunny Disposition */
function softSun(g, K, x, y, r, o = {}) {
  const n = o.n ?? 10;
  if (o.glow !== false) K.glow(g, x, y, r * 2.4, '#ffe9a0', 0.6);
  g.beginPath();
  for (let i = 0; i < n; i++) { const a = i / n * TAU + (o.rot ?? -Math.PI / 2), w = Math.PI / n * 0.7; const bx = x + Math.cos(a) * r * 0.9, by = y + Math.sin(a) * r * 0.9, tx = x + Math.cos(a) * r * 1.55, ty = y + Math.sin(a) * r * 1.55;
    g.moveTo(x + Math.cos(a - w) * r * 0.92, y + Math.sin(a - w) * r * 0.92); g.quadraticCurveTo(x + Math.cos(a - w * 0.6) * r * 1.45, y + Math.sin(a - w * 0.6) * r * 1.45, tx, ty); g.quadraticCurveTo(x + Math.cos(a + w * 0.6) * r * 1.45, y + Math.sin(a + w * 0.6) * r * 1.45, x + Math.cos(a + w) * r * 0.92, y + Math.sin(a + w) * r * 0.92); g.lineTo(bx, by); g.closePath(); }
  K.paint(g, K.rad(g, x, y, r * 1.6, [[0.55, '#fff6d0'], [1, o.tipCol ?? GOLD]]), 1.3);
  K.circ(g, x, y, r); K.paint(g, K.volR(g, o.col ?? '#ffd860', x, y, r, 0.55, 0.2), 1.7);
  K.shine(g, x - r * 0.4, y - r * 0.5, r * 0.28, r * 0.14, -0.6, 0.8);
}
/** a sun's face: 'content' (closed happy eyes), 'beam' (open sparkly eyes, an open smile) */
function sunFace(g, K, x, y, r, mood = 'content') {
  const ex = r * 0.36, ey = y - r * 0.08;
  for (const k of [-1, 1]) {
    if (mood === 'content') { g.beginPath(); g.arc(x + k * ex, ey + r * 0.06, r * 0.17, Math.PI * 1.1, Math.PI * 1.9); K.stroke(g, '#5a3018', Math.max(1.2, r * 0.11)); }
    else { K.ell(g, x + k * ex, ey, r * 0.13, r * 0.17); g.fillStyle = '#4a2818'; g.fill(); K.circ(g, x + k * ex - r * 0.04, ey - r * 0.07, r * 0.06); g.fillStyle = '#fff'; g.fill(); }
    K.ell(g, x + k * r * 0.58, y + r * 0.2, r * 0.16, r * 0.1); g.fillStyle = hexA(BLUSH, 0.85); g.fill();
  }
  if (mood === 'beam') { g.beginPath(); g.moveTo(x - r * 0.28, y + r * 0.2); g.quadraticCurveTo(x, y + r * 0.72, x + r * 0.28, y + r * 0.2); g.closePath(); K.paint(g, '#c84a4a', Math.max(1, r * 0.08)); K.ell(g, x, y + r * 0.42, r * 0.13, r * 0.08); g.fillStyle = '#ff8fa0'; g.fill(); }
  else { g.beginPath(); g.arc(x, y + r * 0.14, r * 0.25, Math.PI * 0.15, Math.PI * 0.85); K.stroke(g, '#5a3018', Math.max(1.1, r * 0.1)); }
}
/** a beam of sunlight from (x0, y0) to (x1, y1), w0 wide at its start and w1 at its end: an ink edge, pale gold edges
 *  round a white core, soft glows along it (on the FX layer) */
function beam(g, K, x0, y0, x1, y1, w0, w1, o = {}) {
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy), nx = -dy / L, ny = dx / L;
  const col = o.col ?? GOLD;
  if (o.glow !== false) for (let t = 0.15; t <= 1.001; t += 0.28) K.glow(g, x0 + dx * t, y0 + dy * t, (w0 + (w1 - w0) * t) * 1.8 + 3, '#ffe9a0', 0.4);
  const quad = k => { g.beginPath(); g.moveTo(x0 + nx * w0 * k / 2, y0 + ny * w0 * k / 2); g.lineTo(x1 + nx * w1 * k / 2, y1 + ny * w1 * k / 2); g.lineTo(x1 - nx * w1 * k / 2, y1 - ny * w1 * k / 2); g.lineTo(x0 - nx * w0 * k / 2, y0 - ny * w0 * k / 2); g.closePath(); };
  quad(1);
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, mw = (w0 + w1) / 4;
  g.fillStyle = K.lin(g, mx + nx * mw, my + ny * mw, mx - nx * mw, my - ny * mw, [[0, col], [0.5, o.core ?? CORE], [1, col]]);
  g.fill(); if (o.ink !== false) K.stroke(g, INKC, o.lw ?? 1.3);
  quad(0.36); g.fillStyle = hexA(CORE, 0.9); g.fill();
}
/** a four-point glint star, ink-rimmed */
function glintStar(g, K, x, y, r, col = CORE, lw = 1.3) {
  g.beginPath();
  g.moveTo(x, y - r); g.quadraticCurveTo(x + r * 0.16, y - r * 0.16, x + r, y); g.quadraticCurveTo(x + r * 0.16, y + r * 0.16, x, y + r);
  g.quadraticCurveTo(x - r * 0.16, y + r * 0.16, x - r, y); g.quadraticCurveTo(x - r * 0.16, y - r * 0.16, x, y - r); g.closePath();
  K.paint(g, K.rad(g, x, y, r, [[0, '#ffffff'], [0.35, col], [1, PALE]]), lw);
}
/** a light mote: a tiny glowing bead */
function mote(g, K, x, y, r = 1.8, col = PALE) { K.glow(g, x, y, r * 3.2, '#ffe9a0', 0.55); K.circ(g, x, y, r); K.paint(g, K.volR(g, col, x, y, r, 0.6, 0.15), 0.9); }
/** a heart, ink-rimmed and shiny */
function heart(g, K, x, y, s, col = HEART) { K.heartPath(g, x, y, s); K.paint(g, K.vol(g, col, x - s, y - s, x + s, y + s, 0.45, 0.3), Math.max(1.2, s * 0.12)); K.shine(g, x - s * 0.48, y - s * 0.3, s * 0.24, s * 0.13, -0.6, 0.8); }

/** a little yokai (the foes): a round lilac imp with stub horns; face 'plain' | 'spiral' (dazzled) | 'burnt' | 'gilded' */
function yokai(g, K, x, y, s = 1, face = 'plain', col = YOKAI) {
  g.save(); g.translate(x, y); g.scale(s, s);
  for (const k of [-1, 1]) { g.beginPath(); g.moveTo(k * 3.2, -8.6); g.quadraticCurveTo(k * 5, -15.5, k * 7.6, -15); g.quadraticCurveTo(k * 8, -11, k * 7.6, -7.2); g.closePath(); K.paint(g, K.vol(g, HORN, k * 3, -15, k * 8, -7, 0.3, 0.2), 1.3); }
  g.beginPath(); g.moveTo(-11, 2); g.bezierCurveTo(-11.5, -12, 11.5, -12, 11, 2); g.lineTo(11, 7); g.quadraticCurveTo(8.2, 11, 5.5, 7.5); g.quadraticCurveTo(2.8, 11, 0, 7.5); g.quadraticCurveTo(-2.8, 11, -5.5, 7.5); g.quadraticCurveTo(-8.2, 11, -11, 7); g.closePath();
  K.paint(g, face === 'gilded' ? K.lin(g, -10, -10, 10, 10, [[0, '#fff2b8'], [0.45, '#ffd36a'], [1, '#c8902a']]) : K.vol(g, col, -11, -10, 11, 10, 0.4, 0.3), 1.6);
  const E = '#2e2240';
  if (face === 'spiral') {
    for (const k of [-1, 1]) { g.beginPath(); for (let i = 0; i <= 26; i++) { const t = i / 26, a = t * 4.6 * Math.PI * k, rr = 3.4 * t; const px = k * 4.4 + Math.cos(a) * rr, py = -2 + Math.sin(a) * rr; i ? g.lineTo(px, py) : g.moveTo(px, py); } K.stroke(g, E, 1.1); }
    g.beginPath(); g.moveTo(-3, 4.4); g.quadraticCurveTo(-1.5, 3, 0, 4.4); g.quadraticCurveTo(1.5, 5.8, 3, 4.4); K.stroke(g, E, 1.2);
  } else if (face === 'burnt') {
    for (const k of [-1, 1]) { g.beginPath(); g.moveTo(k * 6.2, -4.4); g.lineTo(k * 3.4, -2.6); g.lineTo(k * 6.2, -0.8); K.stroke(g, E, 1.4); K.ell(g, k * 7, 2.4, 2.4, 1.5); g.fillStyle = hexA('#ff7a8a', 0.75); g.fill(); }
    K.circ(g, 0, 0.8, 2.9); K.paint(g, K.volR(g, '#ff6a7e', 0, 0.8, 2.9, 0.5, 0.2), 1.1); K.circ(g, -0.9, -0.1, 0.8); g.fillStyle = '#fff'; g.fill();
    g.beginPath(); g.moveTo(-2.4, 5.4); g.quadraticCurveTo(0, 4.2, 2.4, 5.4); K.stroke(g, E, 1.2);
    g.beginPath(); g.moveTo(9.4, -9.4); g.quadraticCurveTo(11.6, -6.4, 9.4, -5.2); g.quadraticCurveTo(7.4, -6.4, 9.4, -9.4); g.closePath(); K.paint(g, '#bfe8ff', 0.9); // a sweat drop
  } else {
    for (const k of [-1, 1]) { K.ell(g, k * 4.2, -2, 1.6, 2); g.fillStyle = E; g.fill(); K.circ(g, k * 4.2 - 0.5, -2.7, 0.6); g.fillStyle = '#fff'; g.fill(); }
    if (face === 'gilded') { g.beginPath(); g.arc(0, 3, 2.6, Math.PI * 0.15, Math.PI * 0.85); K.stroke(g, E, 1.2); }
    else { g.beginPath(); g.moveTo(-2.4, 4.6); g.quadraticCurveTo(0, 3.4, 2.4, 4.6); K.stroke(g, E, 1.2); }
  }
  if (face === 'gilded') K.shine(g, -5, -6, 3, 1.4, -0.6, 0.85); else K.shine(g, -5.4, -6, 2.6, 1.2, -0.6, 0.7);
  g.restore();
}

/** a floppy-eared pup's face, front on: Stella herself by default (silver-grey, blue eyes); mood 'calm' | 'happy' */
function pupHead(g, K, x, y, s = 1, mood = 'calm', fur = FUR, muzzle = FUR_LT) {
  g.save(); g.translate(x, y); g.scale(s, s);
  const furD = K.D(fur, 0.14);
  for (const k of [-1, 1]) { // the long ears hang either side
    g.beginPath(); g.moveTo(k * 5, -9); g.bezierCurveTo(k * 14.5, -11, k * 16.5, -2, k * 16, 7); g.bezierCurveTo(k * 15.6, 14, k * 10.6, 15.4, k * 9.8, 9.5); g.bezierCurveTo(k * 9.4, 4, k * 9, -2, k * 5.5, -4); g.closePath();
    K.paint(g, K.vol(g, furD, k * 6, -10, k * 17, 15, 0.25, 0.3), 1.5);
  }
  K.ell(g, 0, 0, 10.5, 10); K.paint(g, K.volR(g, fur, 0, 0, 10.5, 0.35, 0.25), 1.6);
  for (const k of [-1, 1]) { g.beginPath(); g.moveTo(k * 3.5, -9.6); g.quadraticCurveTo(k * 11, -12.2, k * 13.4, -5.6); g.quadraticCurveTo(k * 9.8, -6.6, k * 7, -5.4); g.closePath(); K.paint(g, furD, 1.2); } // the ears' fold over the crown
  K.ell(g, 0, 4.8, 5.6, 4); K.paint(g, K.vol(g, muzzle, -5, 1, 5, 9, 0.35, 0.15), 1.2);
  K.ell(g, 0, 2.7, 2.3, 1.6); g.fillStyle = NOSE; g.fill(); K.ell(g, -0.7, 2.2, 0.8, 0.4); g.fillStyle = 'rgba(255,255,255,0.7)'; g.fill();
  for (const k of [-1, 1]) {
    if (mood === 'happy') { g.beginPath(); g.arc(k * 4.4, -1, 2.1, Math.PI * 1.1, Math.PI * 1.9); K.stroke(g, '#3a2a2a', 1.5); }
    else { K.circ(g, k * 4.4, -1.6, 2.3); K.paint(g, fur === FUR ? EYE : '#5a3a22', 0.9); K.circ(g, k * 4.4, -1.4, 1.2); g.fillStyle = '#22283a'; g.fill(); K.circ(g, k * 4.4 - 0.8, -2.4, 0.65); g.fillStyle = '#fff'; g.fill(); }
    K.ell(g, k * 7.2, 3.2, 1.8, 1.1); g.fillStyle = hexA(BLUSH, 0.6); g.fill();
  }
  g.beginPath(); g.moveTo(-2, 5.6); g.quadraticCurveTo(-1, 6.8, 0, 5.6); g.quadraticCurveTo(1, 6.8, 2, 5.6); K.stroke(g, INKC, 1);
  g.restore();
}
/** Shadow's face (a black-and-white Boston terrier), front on: bat ears up, the white blaze, big round eyes */
function shadowHead(g, K, x, y, s = 1, mood = 'happy') {
  g.save(); g.translate(x, y); g.scale(s, s);
  for (const k of [-1, 1]) { g.beginPath(); g.moveTo(k * 3.4, -8); g.quadraticCurveTo(k * 9, -21, k * 12.4, -19.5); g.quadraticCurveTo(k * 13.2, -11, k * 10, -4); g.closePath(); K.paint(g, SHADOW_BLK, 1.5); g.beginPath(); g.moveTo(k * 5.6, -9); g.quadraticCurveTo(k * 9.4, -17, k * 11, -16.4); g.quadraticCurveTo(k * 11.4, -11, k * 9.4, -6.6); g.closePath(); g.fillStyle = '#f0a0a8'; g.fill(); }
  K.circ(g, 0, 0, 10.5); K.paint(g, K.volR(g, SHADOW_BLK, 0, 0, 10.5, 0.4, 0.25), 1.6);
  g.beginPath(); g.moveTo(-1.6, -10.2); g.lineTo(1.6, -10.2); g.lineTo(3.2, 3); g.lineTo(-3.2, 3); g.closePath(); g.fillStyle = SHADOW_WHT; g.fill();
  K.ell(g, 0, 5.4, 6, 4.4); K.paint(g, SHADOW_WHT, 1.2);
  K.ell(g, 0, 3, 2.2, 1.5); g.fillStyle = '#1e1a1c'; g.fill();
  for (const k of [-1, 1]) {
    if (mood === 'happy') { g.beginPath(); g.arc(k * 4.8, -1.4, 2.2, Math.PI * 1.1, Math.PI * 1.9); K.stroke(g, '#f4ece0', 1.5); }
    else { K.circ(g, k * 4.8, -1.8, 2.6); g.fillStyle = '#c88732'; g.fill(); K.circ(g, k * 4.8, -1.8, 1.4); g.fillStyle = '#1e1a1c'; g.fill(); K.circ(g, k * 4.2, -2.6, 0.7); g.fillStyle = '#fff'; g.fill(); }
  }
  K.ell(g, 0, 8.2, 2.4, 1.8); g.fillStyle = '#e8506a'; g.fill();
  g.restore();
}
/** Stella mid-zoomies, in profile running right: the lean grey coat, ears streaming back, her sunset obi */
function zoomDog(g, K, x, y, s = 1) {
  g.save(); g.translate(x, y); g.scale(s, s);
  const leg = (x0, y0, x1, y1, col) => { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); K.stroke(g, INKC, 5.6); g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); K.stroke(g, col, 3.3); };
  leg(5, 2, 15, 7.5, FUR_DK); leg(-8, 2, -17, 9, FUR_DK); // the far legs
  g.beginPath(); g.moveTo(-11, -2); g.quadraticCurveTo(-17, -4, -21, -10.5); K.stroke(g, INKC, 4.4); g.beginPath(); g.moveTo(-11, -2); g.quadraticCurveTo(-17, -4, -21, -10.5); K.stroke(g, FUR, 2.3);
  g.beginPath(); g.ellipse(-1, 0, 13, 6.2, -0.06, 0, TAU); K.paint(g, K.vol(g, FUR, -14, -6, 12, 6, 0.4, 0.25), 1.6);
  g.save(); g.beginPath(); g.ellipse(-1, 0, 12.4, 5.6, -0.06, 0, TAU); g.clip(); K.rr(g, -3.6, -7, 4.6, 14, 1); g.fillStyle = SUNSET; g.fill(); g.restore(); // the obi
  g.beginPath(); g.moveTo(-2, -5); g.quadraticCurveTo(-7, -11, -11, -10); g.quadraticCurveTo(-8, -7, -4, -4.6); g.closePath(); K.paint(g, SUNSET, 1.1); // its bow's tail, flying
  leg(7, 3, 19, 5.4, FUR); leg(-9, 3, -20, 4.4, FUR);
  K.circ(g, 12.6, -6.4, 6.2); K.paint(g, K.volR(g, FUR, 12.6, -6.4, 6.2, 0.4, 0.25), 1.5);
  g.beginPath(); g.moveTo(15.6, -9); g.quadraticCurveTo(22.6, -8.6, 23.4, -5.6); g.quadraticCurveTo(23, -2.6, 16.4, -2.4); g.closePath(); K.paint(g, K.vol(g, FUR_LT, 16, -9, 24, -2, 0.3, 0.2), 1.3);
  K.ell(g, 23, -6.6, 1.5, 1.2); g.fillStyle = NOSE; g.fill();
  g.beginPath(); g.moveTo(18.4, -2.6); g.quadraticCurveTo(18.6, 1.8, 20.6, 1.6); g.quadraticCurveTo(21.8, 0.4, 20.6, -2.6); g.closePath(); K.paint(g, '#ff8fa0', 0.9); // tongue out
  K.circ(g, 14.4, -8, 1.5); g.fillStyle = EYE; g.fill(); K.circ(g, 14.7, -8, 0.8); g.fillStyle = '#22283a'; g.fill(); K.circ(g, 14.1, -8.6, 0.45); g.fillStyle = '#fff'; g.fill();
  g.beginPath(); g.moveTo(11.6, -11.2); g.bezierCurveTo(7, -16.4, 1, -16.6, -4, -14.6); g.bezierCurveTo(0, -12.4, 5, -9.6, 9.4, -7.4); g.closePath(); K.paint(g, K.vol(g, K.D(FUR, 0.14), -4, -16, 12, -7, 0.3, 0.25), 1.3); // the ear, streaming back
  g.restore();
}
/** her paw held up, palm out: grey, with mauve-pink pads */
function pawUp(g, K, x, y, s = 1) {
  g.save(); g.translate(x, y); g.scale(s, s);
  K.rr(g, -6.6, 2, 13.2, 14, 5); K.paint(g, K.vol(g, FUR, -7, 2, 7, 16, 0.3, 0.25), 1.6); // the wrist
  K.rr(g, -6.6, 10, 13.2, 6, 2); g.fillStyle = SAFFRON; g.fill(); K.rr(g, -6.6, 10, 13.2, 6, 2); K.stroke(g, INKC, 1.3); // her robe's sleeve
  g.beginPath(); g.ellipse(0, 0, 11, 9, 0, 0, TAU); K.paint(g, K.volR(g, FUR, 0, 0, 11, 0.35, 0.25), 1.6);
  const pad = '#c4a0a0';
  K.ell(g, 0, 2.4, 4.6, 3.6); K.paint(g, K.volR(g, pad, 0, 2.4, 4.6, 0.4, 0.2), 1);
  for (const [px, py] of [[-6.4, -2.4], [-2.4, -5.4], [2.4, -5.4], [6.4, -2.4]]) { K.ell(g, px, py, 1.9, 2.3); K.paint(g, K.volR(g, pad, px, py, 2.2, 0.4, 0.2), 0.9); }
  g.restore();
}

// ------------------------------------------------------------------ the wagasa item
export function drawParasol(g, v, cols, noShadow, K, s = 1) {
  if (!noShadow) K.shadow(g, 26, 18, 3.4);
  if (v === 'golden' || v === 'corona' || v === 'lantern' || v === 'daystar') K.glow(g, 2, -6, 30, v === 'lantern' ? '#ffe0a0' : '#fff0b0', 0.55);
  wagasa(g, K, 1 * s, -3.5 * s, 1.1 * s, 0.32, cols, v, { tassels: 3, tasselScale: 0.78 });
  if (v === 'morning' || v === 'daystar' || v === 'golden') { K.sparkle(g, -20 * s, -18 * s, 3.4 * s, '#ffffff'); K.sparkle(g, 24 * s, 16 * s, 2.4 * s, '#fff6c0'); }
}

// ------------------------------------------------------------------ skill art
/** → true when it drew `id` (icons.js falls through to its own art otherwise) */
export function drawStellaSkill(g, id, K) {
  switch (id) {
    case 'attack_parasol': { // the Sunsweep: the open wagasa swept round, a crescent of sunlight flung off its rim
      for (let i = 0; i < 2; i++) swoosh(g, K, () => { g.beginPath(); g.arc(-8, 10, 24 + i * 5, Math.PI * 1.08, Math.PI * 1.38); }, 2.2 - i * 0.5);
      sunArc(g, K, -6, 8, 30, -1.45, 0.25, 8);
      wagasa(g, K, -8, 6, 0.6, 0.85, PAPER, 'paper', { el: 0.5, tassels: 2, tasselScale: 0.8 });
      K.sparkle(g, 22, -16, 3.2, '#ffffff'); K.sparkle(g, 26, 12, 2.4, '#fff6c0');
      return true;
    }
    case 'goldenRay': { // the finial's sun disc fires a straight ray of gold through a line of foes
      yokai(g, K, 6, -4, 0.62); yokai(g, K, 20, -16, 0.5);
      const w = wagasa(g, K, -16, 16, 0.42, 0.82, PAPER, 'paper', { el: 0.45, tassels: 2, tasselScale: 0.8 });
      const [tx, ty] = w.tip;
      beam(g, K, tx, ty, 30, -26, 5, 8.5);
      for (const [x, y, r] of [[6, -5, 3.4], [19.6, -16, 2.8]]) sunDisc(g, K, x, y, r, { glow: false, lw: 1 });
      sunDisc(g, K, tx, ty, 4.2, { lw: 1.1 });
      return true;
    }
    case 'innerLight': { // a small sun glowing in her upheld paw (passive mastery)
      K.glow(g, 0, -6, 26, '#ffe9a0', 0.55);
      pawUp(g, K, 0, 12, 1.15);
      sunDisc(g, K, 0, -10, 8.4, { lw: 1.4 });
      for (const [x, y, r] of [[-15, -18, 1.8], [15, -20, 1.5], [-18, 0, 1.3], [18, -4, 1.6]]) mote(g, K, x, y, r);
      return true;
    }
    case 'glint': { // the finial flashes like a mirror: a glint star fanning rays in a cone, a dazzled yokai
      const sx = -14, sy = -12;
      g.save(); g.beginPath(); g.moveTo(sx, sy); g.lineTo(30, 0); g.lineTo(18, 30); g.closePath(); g.fillStyle = K.lin(g, sx, sy, 22, 16, [[0, 'rgba(255,248,220,0.95)'], [1, 'rgba(255,230,150,0.15)']]); g.fill(); g.restore();
      for (const a of [0.3, 0.6, 0.9]) { g.beginPath(); g.moveTo(sx + Math.cos(a) * 9, sy + Math.sin(a) * 9); g.lineTo(sx + Math.cos(a) * 34, sy + Math.sin(a) * 34); K.stroke(g, hexA('#ffffff', 0.9), 1.8); }
      yokai(g, K, 12, 10, 0.88, 'spiral');
      for (const [x, y] of [[3, -6], [22, -3]]) { K.starPath(g, x, y, 2.8, 1.3, 5); K.paint(g, '#ffe44a', 0.9); }
      K.glow(g, sx, sy, 16, '#fff6c0', 0.8);
      glintStar(g, K, sx, sy, 12, '#fff8d8', 1.5);
      return true;
    }
    case 'prism': { // a little sun-glass prism splits one ray into a fan of five
      beam(g, K, -30, 10, -9, 4, 5, 5, { glow: false });
      for (let i = -2; i <= 2; i++) { const a = -0.28 + i * 0.27; beam(g, K, 4, 2, 4 + Math.cos(a) * 26, 2 + Math.sin(a) * 26, 2.4, 4.4, { glow: false, lw: 1.1 }); }
      for (let i = -2; i <= 2; i++) { const a = -0.28 + i * 0.27; K.glow(g, 4 + Math.cos(a) * 24, 2 + Math.sin(a) * 24, 6, '#ffe9a0', 0.6); }
      g.beginPath(); g.moveTo(-2, -12); g.lineTo(9, 9); g.lineTo(-13, 9); g.closePath();
      K.paint(g, K.lin(g, -12, -12, 10, 10, [[0, 'rgba(240,252,255,0.95)'], [0.5, 'rgba(200,232,248,0.9)'], [1, 'rgba(255,236,190,0.95)']]), 1.8);
      g.beginPath(); g.moveTo(-2, -12); g.lineTo(-2.6, 9); K.stroke(g, 'rgba(74,44,42,0.35)', 1);
      g.beginPath(); g.moveTo(-4.6, -5); g.lineTo(-8.6, 4); K.stroke(g, 'rgba(255,255,255,0.95)', 1.6);
      K.sparkle(g, 3, -6, 2.6, '#ffffff');
      return true;
    }
    case 'sunlit': { // a gilded foe, three gold glints over it (passive)
      K.glow(g, 0, 6, 24, '#ffe9a0', 0.55);
      yokai(g, K, 0, 9, 1.2, 'gilded');
      for (const [x, y] of [[-12, -15], [0, -20], [12, -15]]) { g.beginPath(); g.moveTo(x, y - 5.6); g.lineTo(x + 3.6, y); g.lineTo(x, y + 5.6); g.lineTo(x - 3.6, y); g.closePath(); K.paint(g, K.lin(g, x - 3, y - 5, x + 3, y + 5, [[0, '#fff6c0'], [0.5, GOLD], [1, '#d8a030']]), 1.2); K.shine(g, x - 0.9, y - 1.6, 1, 0.6, -0.6, 0.85); }
      K.sparkle(g, -17, 6, 2.6, '#ffffff'); K.sparkle(g, 18, 2, 2.2, '#ffffff');
      return true;
    }
    case 'solarRay': { // sunlight through a burning glass: a thin white-gold beam focused off the lens
      for (const k of [-1, 0, 1]) { g.beginPath(); g.moveTo(-28 + k * 4, -26 - k * 4); g.lineTo(-14 + k * 3, -12 - k * 3); K.stroke(g, hexA('#fff6c0', 0.95), 2.2); }
      g.beginPath(); g.moveTo(-10, -8); g.lineTo(-2, -12); g.lineTo(24, 14); g.closePath(); g.fillStyle = 'rgba(255,240,180,0.45)'; g.fill(); // the focusing cone
      beam(g, K, -8, -4, 24, 14, 3.4, 2.4, { lw: 1.1 });
      g.beginPath(); g.moveTo(-14, 2); g.lineTo(-22, 14); K.stroke(g, INKC, 5); g.beginPath(); g.moveTo(-14, 2); g.lineTo(-22, 14); K.stroke(g, WOOD, 3); // the lens' handle
      K.circ(g, -10, -6, 9.6); K.paint(g, K.lin(g, -18, -14, -2, 2, [[0, 'rgba(240,252,255,0.95)'], [1, 'rgba(190,226,246,0.9)']]), 1.6);
      K.circ(g, -10, -6, 9.6); K.stroke(g, INKC, 4.6); K.circ(g, -10, -6, 9.6); K.stroke(g, AMBER, 2.6);
      g.beginPath(); g.arc(-10, -6, 6, Math.PI * 1.05, Math.PI * 1.45); K.stroke(g, '#ffffff', 1.8);
      K.glow(g, 24, 14, 10, '#fff6c0', 0.9); glintStar(g, K, 24, 14, 7, '#fff8d8', 1.2);
      return true;
    }
    case 'sundial': { // ultimate: a sundial face from above, the wagasa its gnomon, columns of light at the hours
      const cx = 0, cy = 10, rx = 26, ry = 11;
      const col = (a, back) => { const x = cx + Math.cos(a) * rx * 0.86, y = cy + Math.sin(a) * ry * 0.86, w = back ? 2.6 : 3.4, h = back ? 16 : 20;
        g.fillStyle = K.lin(g, 0, y - h, 0, y, [[0, 'rgba(255,246,200,0)'], [0.4, 'rgba(255,240,180,0.75)'], [1, 'rgba(255,255,250,0.98)']]);
        g.beginPath(); g.moveTo(x - w * 0.6, y - h); g.lineTo(x + w * 0.6, y - h); g.lineTo(x + w, y); g.lineTo(x - w, y); g.closePath(); g.fill();
        K.ell(g, x, y, w * 1.3, w * 0.5); g.fillStyle = 'rgba(255,255,255,0.95)'; g.fill(); };
      const HOURS = [-Math.PI * 0.82, -Math.PI * 0.5, -Math.PI * 0.18, Math.PI * 0.08, Math.PI * 0.36, Math.PI * 0.64, Math.PI * 0.92];
      K.ell(g, cx, cy + 2, rx + 1, ry + 1); K.paint(g, K.D('#e6d2a8', 0.25), 1.6); // the plate's edge
      K.ell(g, cx, cy, rx, ry); K.paint(g, K.lin(g, -rx, cy - ry, rx, cy + ry, [[0, '#fff6e0'], [1, '#e8d4a8']]), 1.8);
      K.ell(g, cx, cy, rx * 0.72, ry * 0.72); K.stroke(g, hexA('#b8861a', 0.7), 1);
      for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; g.beginPath(); g.moveTo(cx + Math.cos(a) * rx * 0.76, cy + Math.sin(a) * ry * 0.76); g.lineTo(cx + Math.cos(a) * rx * 0.92, cy + Math.sin(a) * ry * 0.92); K.stroke(g, '#b8861a', 1.4); }
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + 18, cy + 5); K.stroke(g, 'rgba(90,60,40,0.4)', 3); // the gnomon's shadow on the hour
      for (const a of HOURS) if (Math.sin(a) < 0) col(a, true);
      const w = wagasa(g, K, -3, -12, 0.46, -0.22, PAPER, 'paper', { el: 0.5, tassels: 2, tasselScale: 0.8, shaft: false });
      g.beginPath(); g.moveTo(-2.4, -10); g.lineTo(cx, cy); K.stroke(g, INKC, 3.6); g.beginPath(); g.moveTo(-2.4, -10); g.lineTo(cx, cy); K.stroke(g, WOOD, 2); // its shaft planted in the dial
      for (const a of HOURS) if (Math.sin(a) >= 0) col(a, false);
      sunDisc(g, K, w.tip[0], w.tip[1], 2.6, { lw: 0.9, glowA: 0.8 });
      return true;
    }
    case 'solarFlare': { // a burst of light: a white core, a ring of soft rays, a rose rim
      K.glow(g, 0, 0, 30, '#ffe9a0', 0.6);
      softSun(g, K, 0, 0, 13, { n: 12, glow: false, tipCol: ROSE, col: '#ffe48a', rot: -Math.PI / 2 + 0.26 });
      for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; g.beginPath(); g.moveTo(Math.cos(a) * 22.5, Math.sin(a) * 22.5); g.lineTo(Math.cos(a) * 27, Math.sin(a) * 27); K.stroke(g, INKC, 3.6); g.beginPath(); g.moveTo(Math.cos(a) * 22.5, Math.sin(a) * 22.5); g.lineTo(Math.cos(a) * 27, Math.sin(a) * 27); K.stroke(g, ROSE, 1.8); }
      K.circ(g, 0, 0, 8); g.fillStyle = K.rad(g, 0, 0, 8, [[0, '#ffffff'], [0.6, 'rgba(255,252,240,0.95)'], [1, 'rgba(255,240,190,0)']]); g.fill();
      K.sparkle(g, 0, 0, 7, '#ffffff');
      return true;
    }
    case 'sunKissed': { // a heart-shaped glow round a sun with a rosy kiss on its cheek (passive mastery)
      K.heartPath(g, 0, 3, 23); g.fillStyle = K.rad(g, 0, 0, 26, [[0, 'rgba(255,230,200,0.95)'], [0.6, 'rgba(250,180,170,0.75)'], [1, 'rgba(240,140,150,0.6)']]); g.fill();
      K.heartPath(g, 0, 3, 23); K.stroke(g, hexA('#c8506a', 0.9), 1.8);
      softSun(g, K, -1, 1, 9.4, { glow: false });
      sunFace(g, K, -1, 1, 9.4, 'content');
      g.save(); g.translate(9, 8); g.rotate(-0.35); // the kiss
      g.beginPath(); g.moveTo(-4.6, 0); g.quadraticCurveTo(-2.6, -3.2, 0, -1.2); g.quadraticCurveTo(2.6, -3.2, 4.6, 0); g.quadraticCurveTo(0, 4.6, -4.6, 0); g.closePath(); K.paint(g, K.vol(g, '#e8506a', -4, -3, 4, 3, 0.35, 0.25), 1.1);
      g.beginPath(); g.moveTo(-4, 0.1); g.quadraticCurveTo(0, 0.9, 4, 0.1); K.stroke(g, '#9a2a40', 0.8);
      g.restore();
      return true;
    }
    case 'skippingSun': { // a gold disc skimming over the water, three skip rings behind it
      g.beginPath(); g.moveTo(-28, 12); for (let x = -28; x <= 28; x += 7) g.quadraticCurveTo(x + 3.5, 9.5, x + 7, 12); g.lineTo(28, 26); g.lineTo(-28, 26); g.closePath();
      K.paint(g, K.lin(g, 0, 10, 0, 26, [[0, '#9fe0ee'], [1, '#4aa8c8']]), 1.8);
      for (const [x, r] of [[-20, 6], [-8, 5], [3, 4]]) { K.ell(g, x, 16, r, r * 0.36); K.stroke(g, INKC, 2.8); K.ell(g, x, 16, r, r * 0.36); K.stroke(g, '#ffffff', 1.4); }
      g.save(); g.setLineDash([2.6, 3]); g.beginPath(); g.moveTo(-20, 15); g.quadraticCurveTo(-14, 2, -8, 15); g.quadraticCurveTo(-2.5, 5, 3, 15); g.quadraticCurveTo(8, 2, 13, 3); K.stroke(g, hexA('#fff6c0', 0.95), 1.8); g.restore();
      for (let i = 0; i < 3; i++) swoosh(g, K, () => { g.beginPath(); g.moveTo(2 - i * 2, -8 + i * 5); g.lineTo(9 - i * 1, -8 + i * 5); }, 1.6, '#fff6c0');
      sunDisc(g, K, 16, -4, 7.6, { lw: 1.3 });
      g.beginPath(); g.moveTo(-6, 22); g.lineTo(6, 22); K.stroke(g, hexA('#fff6c0', 0.8), 1.4);
      return true;
    }
    case 'sunspot': { // a patch of fierce sunlight on the ground, from above, its rays turning
      K.ell(g, 0, 8, 27, 14); K.paint(g, K.lin(g, 0, -6, 0, 22, [[0, '#b8dc8a'], [1, '#7ab05a']]), 1.8);
      K.ell(g, 0, 8, 19, 9.5); g.fillStyle = K.rad(g, 0, 8, 19, [[0, '#ffffff'], [0.35, '#fff3c0'], [0.75, 'rgba(255,211,106,0.75)'], [1, 'rgba(255,211,106,0)']]); g.fill();
      for (let i = 0; i < 8; i++) { const a0 = i / 8 * TAU; g.beginPath(); for (let t = 0; t <= 10; t++) { const u = t / 10, a = a0 + u * 0.9, r = 7 + u * 13; const px = Math.cos(a) * r, py = 8 + Math.sin(a) * r * 0.5; t ? g.lineTo(px, py) : g.moveTo(px, py); } K.stroke(g, INKC, 3.6); g.beginPath(); for (let t = 0; t <= 10; t++) { const u = t / 10, a = a0 + u * 0.9, r = 7 + u * 13; const px = Math.cos(a) * r, py = 8 + Math.sin(a) * r * 0.5; t ? g.lineTo(px, py) : g.moveTo(px, py); } K.stroke(g, i % 2 ? GOLD : CORE, 1.9); }
      sunDisc(g, K, 0, -16, 6.4, { lw: 1.2 });
      for (const x of [-4, 4]) { g.beginPath(); g.moveTo(x, -6); g.lineTo(x * 1.6, 2); K.stroke(g, hexA('#fffaf0', 0.9), 1.6); }
      return true;
    }
    case 'sunburn': { // a yokai with a sunburnt pink nose, a little gold shimmer (passive)
      yokai(g, K, 0, 7, 1.35, 'burnt');
      for (const x of [-8, 0, 8]) { g.beginPath(); g.moveTo(x, -18); g.quadraticCurveTo(x + 2.4, -21, x, -24); g.quadraticCurveTo(x - 2.4, -27, x, -30); K.stroke(g, hexA('#ffd36a', 0.95), 1.6); }
      K.sparkle(g, -18, -6, 3, '#fff6c0'); K.sparkle(g, 19, -10, 2.4, '#ffffff'); K.sparkle(g, 18, 14, 2, '#fff6c0');
      return true;
    }
    case 'littleSun': { // Hinata: a cheerful little round sun with a smiling face, soft rays
      softSun(g, K, 0, -2, 13, { n: 9 });
      sunFace(g, K, 0, -2, 13, 'beam');
      for (const x of [-6, 6]) { g.beginPath(); g.arc(x, 22, 4, Math.PI * 1.15, Math.PI * 1.85); K.stroke(g, hexA('#ffffff', 0.85), 1.6); }
      K.sparkle(g, 19, -18, 3.2, '#ffffff'); K.sparkle(g, -21, 12, 2.4, '#fff6c0');
      return true;
    }
    case 'risingSun': { // ultimate: a great sun rising out of the sea, a crown of rays
      K.glow(g, 0, 6, 30, '#ffe9a0', 0.6);
      for (let i = 0; i < 9; i++) { const a = Math.PI + (i + 0.5) / 9 * Math.PI, long = i % 2 === 0, r1 = long ? 28 : 23.5, d = long ? 0.11 : 0.09;
        g.beginPath(); g.moveTo(Math.cos(a - d) * 17, 6 + Math.sin(a - d) * 17); g.lineTo(Math.cos(a) * r1, 6 + Math.sin(a) * r1); g.lineTo(Math.cos(a + d) * 17, 6 + Math.sin(a + d) * 17); g.closePath(); K.paint(g, K.lin(g, 0, 6, Math.cos(a) * r1, 6 + Math.sin(a) * r1, [[0, PALE], [1, long ? GOLD : '#ffe6a0']]), 1.3); }
      g.save(); g.beginPath(); g.rect(-30, -30, 60, 37); g.clip();
      K.circ(g, 0, 6, 15); K.paint(g, K.volR(g, '#ffd04a', 0, 6, 15, 0.6, 0.15), 2);
      K.circ(g, 0, 6, 9); g.fillStyle = K.rad(g, 0, 6, 9, [[0, 'rgba(255,253,240,0.9)'], [1, 'rgba(255,250,230,0)']]); g.fill();
      g.restore();
      g.beginPath(); g.moveTo(-28, 7); for (let x = -28; x < 28; x += 8) g.quadraticCurveTo(x + 4, 4, x + 8, 7); g.lineTo(26, 20); g.quadraticCurveTo(0, 25, -26, 20); g.closePath();
      K.paint(g, K.lin(g, 0, 6, 0, 22, [[0, '#8fd4e8'], [1, '#4a90c0']]), 1.9);
      for (const [y, w] of [[11, 10], [15, 6.5], [18.5, 3.6]]) { g.beginPath(); g.moveTo(-w, y); g.lineTo(w, y); K.stroke(g, hexA('#fff1b8', 0.95), 2); }
      return true;
    }
    case 'morningLight': { // the first light of morning: a low sun pouring soft rose-gold rays down over a heart (the pack mended)
      K.glow(g, 0, -6, 30, '#ffe0c8', 0.7);
      // a soft fan of morning light under the sun (no ink: light, not ribbons), brighter streaks in it
      g.beginPath(); g.moveTo(-3, -12); g.lineTo(3, -12); g.lineTo(27, 26); g.lineTo(-27, 26); g.closePath();
      g.fillStyle = K.lin(g, 0, -12, 0, 26, [[0, 'rgba(255,244,210,0.95)'], [0.6, 'rgba(255,214,190,0.6)'], [1, 'rgba(255,200,185,0.08)']]); g.fill();
      for (const x1 of [-20, -7, 7, 20]) { g.beginPath(); g.moveTo(-0.8, -12); g.lineTo(0.8, -12); g.lineTo(x1 + 2.6, 26); g.lineTo(x1 - 2.6, 26); g.closePath(); g.fillStyle = K.lin(g, 0, -12, 0, 26, [[0, 'rgba(255,253,240,0.95)'], [1, 'rgba(255,240,225,0)']]); g.fill(); }
      softSun(g, K, 0, -15, 8.6, { n: 10, col: '#ffd070', tipCol: '#ffb8a0' });
      heart(g, K, 0, 11, 13, '#ff8fa8');
      K.sparkle(g, -4.6, 6.4, 3, '#ffffff');
      for (const [x, y, r] of [[-22, -8, 1.7], [21, -12, 1.5], [-25, 6, 1.3], [24, 2, 1.3], [-14, 24, 1.2], [15, 25, 1.2]]) mote(g, K, x, y, r, '#ffe0d0');
      return true;
    }
    case 'sunnyDisposition': { // a smiling sun face, all cosy in a little knitted scarf (passive mastery)
      softSun(g, K, 0, -3, 14, { n: 10 });
      sunFace(g, K, 0, -4, 14, 'content');
      g.beginPath(); g.moveTo(-12, 7); g.quadraticCurveTo(0, 13.5, 12, 7); g.lineTo(12.4, 11.6); g.quadraticCurveTo(0, 18, -12.4, 11.6); g.closePath(); K.paint(g, K.vol(g, SUNSET, -12, 6, 12, 18, 0.35, 0.25), 1.5);
      g.beginPath(); g.moveTo(5, 12); g.quadraticCurveTo(8, 18, 6, 25); g.lineTo(11, 24.4); g.quadraticCurveTo(12, 18, 10, 11.2); g.closePath(); K.paint(g, K.vol(g, SUNSET, 5, 12, 12, 25, 0.35, 0.25), 1.4);
      for (const x of [-7, -2, 3, 8]) { g.beginPath(); g.moveTo(x, 10.2 + Math.abs(x) * 0.05); g.lineTo(x, 14.2 - Math.abs(x) * 0.12); K.stroke(g, K.D(SUNSET, 0.3), 0.8); }
      for (const x of [6.4, 8.2, 10]) { g.beginPath(); g.moveTo(x - 0.4, 24.6); g.lineTo(x - 0.8, 27.4); K.stroke(g, INKC, 1.3); }
      return true;
    }
    case 'kindLight': { // a soft rose-gold ray landing on a heart
      beam(g, K, -26, -26, 4, 4, 5, 11, { col: '#ffc8b0', core: '#fffaf0' });
      heart(g, K, 8, 9, 13, '#ff8fa8');
      for (const [a, r] of [[-0.3, 17], [0.5, 17], [1.3, 16], [2.2, 17]]) { g.beginPath(); g.moveTo(8 + Math.cos(a) * r, 10 + Math.sin(a) * r); g.lineTo(8 + Math.cos(a) * (r + 5), 10 + Math.sin(a) * (r + 5)); K.stroke(g, INKC, 3.4); g.beginPath(); g.moveTo(8 + Math.cos(a) * r, 10 + Math.sin(a) * r); g.lineTo(8 + Math.cos(a) * (r + 5), 10 + Math.sin(a) * (r + 5)); K.stroke(g, '#ffe8a8', 1.8); }
      K.sparkle(g, 3, 4, 3.4, '#ffffff');
      return true;
    }
    case 'halo': { // a golden halo ring over a friend's head, a faint dome of light round them
      K.ell(g, 0, 4, 25, 25); g.fillStyle = K.rad(g, 0, 6, 25, [[0, 'rgba(255,250,230,0)'], [0.7, 'rgba(255,240,190,0.25)'], [1, 'rgba(255,236,170,0.6)']]); g.fill();
      g.beginPath(); g.arc(0, 4, 25, Math.PI * 1.08, Math.PI * 1.92); K.stroke(g, hexA('#ffffff', 0.85), 1.6);
      pupHead(g, K, 0, 8, 1.05, 'happy', '#d6a26a', '#f4dcb8');
      K.ell(g, 0, -12, 11, 3.6); K.stroke(g, INKC, 5.8); K.ell(g, 0, -12, 11, 3.6); K.stroke(g, K.lin(g, -11, -12, 11, -12, [[0, '#fff2b0'], [0.5, GOLD], [1, '#e0a030']]), 3.4);
      g.beginPath(); g.ellipse(0, -12, 11, 3.6, 0, Math.PI * 1.1, Math.PI * 1.45); K.stroke(g, '#ffffff', 1.2);
      K.glow(g, 0, -12, 16, '#fff0a0', 0.6);
      K.sparkle(g, 15, -18, 2.6, '#ffffff');
      return true;
    }
    case 'stlZoomies': { // Stella mid-zoomies: ears flying, speed lines, a trail of light motes (passive)
      for (let i = 0; i < 3; i++) swoosh(g, K, () => { g.beginPath(); g.moveTo(-28, -8 + i * 7); g.lineTo(-16 + i * 2, -8 + i * 7); }, 1.8, '#fff6e0');
      for (const [x, y, r] of [[-24, 14, 1.8], [-16, 20, 1.5], [-26, -14, 1.4], [-10, 22, 1.2]]) mote(g, K, x, y, r);
      zoomDog(g, K, 2, 4, 1.05);
      K.sparkle(g, 24, -16, 3, '#ffffff');
      return true;
    }
    case 'sunDog': { // Shadow aglow, a halo ring round him, a bright mock sun either side: the sun dogs
      K.glow(g, 0, 2, 28, '#ffe9a0', 0.7);
      K.circ(g, 0, 0, 23); K.stroke(g, hexA('#fff6d0', 0.9), 2.2);
      shadowHead(g, K, 0, 4, 1.15, 'alert');
      for (const k of [-1, 1]) { K.glow(g, k * 23, 0, 9, '#fff6c0', 0.95); glintStar(g, K, k * 23, 0, 6.4, '#fff6d0', 1.1); K.circ(g, k * 23, 0, 2.2); g.fillStyle = '#ffffff'; g.fill(); }
      return true;
    }
    case 'daybreak': { // ultimate: dawn breaking over the hills, rays fanning up, rose to gold
      K.glow(g, 0, 12, 30, '#ffd8c0', 0.7);
      for (let i = 0; i < 7; i++) { const a = Math.PI + (i + 0.5) / 7 * Math.PI, t = Math.abs(i - 3) / 3; beam(g, K, Math.cos(a) * 9, 12 + Math.sin(a) * 9, Math.cos(a) * 30, 12 + Math.sin(a) * 30, 2.2, 5.6, { glow: false, col: t > 0.5 ? ROSE : t > 0 ? '#ffd0a0' : GOLD, lw: 1.1 }); }
      g.save(); g.beginPath(); g.rect(-30, -30, 60, 42); g.clip(); K.circ(g, 0, 12, 8.4); K.paint(g, K.volR(g, '#ffd860', 0, 12, 8.4, 0.6, 0.15), 1.6); g.restore();
      g.beginPath(); g.moveTo(-28, 14); g.quadraticCurveTo(-16, 5, -4, 13); g.quadraticCurveTo(8, 7, 18, 12); g.quadraticCurveTo(24, 9, 28, 12); g.lineTo(26, 24); g.quadraticCurveTo(0, 28, -26, 24); g.closePath();
      K.paint(g, K.lin(g, 0, 6, 0, 26, [[0, '#c8a8c8'], [1, '#8a6a9a']]), 1.9);
      g.beginPath(); g.moveTo(-24, 15.4); g.quadraticCurveTo(-16, 8.4, -6, 13.6); K.stroke(g, hexA('#ffd8c8', 0.9), 1.5);
      for (const [x, y] of [[-16, -12], [14, -16]]) { g.beginPath(); g.moveTo(x - 3, y); g.quadraticCurveTo(x - 1.5, y - 2, x, y); g.quadraticCurveTo(x + 1.5, y - 2, x + 3, y); K.stroke(g, INKC, 1.3); }
      return true;
    }
  }
  return false;
}
/** a crescent of sunlight: the arc of radius r round (x, y) from a0 to a1, w thick in its middle, bright on its outer edge */
function sunArc(g, K, x, y, r, a0, a1, w) {
  const S = 28;
  g.beginPath();
  for (let i = 0; i <= S; i++) { const a = a0 + (a1 - a0) * i / S; const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r; i ? g.lineTo(px, py) : g.moveTo(px, py); }
  for (let i = S; i >= 0; i--) { const t = i / S, a = a0 + (a1 - a0) * t, rr = r - w * Math.pow(Math.sin(Math.PI * t), 0.8); g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  g.closePath();
  for (let t = 0.2; t <= 0.81; t += 0.3) { const a = a0 + (a1 - a0) * t; K.glow(g, x + Math.cos(a) * (r - w / 2), y + Math.sin(a) * (r - w / 2), w * 1.8, '#ffe9a0', 0.5); }
  K.paint(g, K.rad(g, x, y, r, [[Math.max(0, (r - w) / r - 0.02), GOLD], [(r - w * 0.45) / r, PALE], [1, CORE]]), 1.5);
}
