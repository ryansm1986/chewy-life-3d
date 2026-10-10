// Chewy the samurai's icons (docs/HEROES.md §8) in the painted sticker look of rpg/icons.js (its drawing kit K is passed
// in, like the other icon sets): the Bone Katana item icon (every sword base's: it's the one katana he carries), and the skill art for the Bone Blade and Pack Spirit trees
// (Fetch Mastery's tennis-ball icons are unchanged). Everything is drawn on the icon's 64-unit canvas centred on 0, 0.
import { SAMURAI } from '../gfx/samuraiPalette.js';

const BONE = '#f6ecd6', GOLD = SAMURAI.gold, RED = '#c8382e', PINK = '#ffb8cc', PETAL = '#ffd0dc';

// ------------------------------------------------------------------ the Bone Katana
/** the katana along +x from x0 (pommel) to x1 (tip), gently curved toward −y: cols [blade, wrap, accent]. bone (the
 *  default): the game's blade (charKit.js katanaGeo, ROADMAP R-15), one long curved bone with a dog-bone knob pair at
 *  each end; bone: false the classic pointed blade (a blade of moonlight: Moonlit Blades) */
export function katanaShape(g, K, { x0 = -27, x1 = 28, cols = null, scale = 1, edge = true, bone = true } = {}) {
  const { INK, L, D, rr, circ, ell, lin, vol, volR, paint, stroke, shine, hexA } = K;
  const [blade = BONE, wrap = RED, acc = '#f2e4c6'] = cols || [];
  const bladeC = L(blade, 0.25), gx = x0 + 13 * scale, tx = gx + 4 * scale; // grip end, tsuba
  const cur = t => -5 * scale * t * t, hw = t => (3.4 - 0.9 * t) * scale; // the sori and the half width
  // pommel: a bone knob, two lobes
  for (const s of [-1, 1]) { circ(g, x0 + 1, s * 2.4 * scale, 2.9 * scale); paint(g, volR(g, L(blade, 0.15), x0 + 1, s * 2.4 * scale, 2.9 * scale), 1.5); }
  // the wrapped grip
  rr(g, x0 + 2, -2.6 * scale, gx - x0 - 2, 5.2 * scale, 2.4 * scale); paint(g, vol(g, wrap, x0, -3, gx, 3, 0.3, 0.3), 1.6);
  g.save(); rr(g, x0 + 2, -2.6 * scale, gx - x0 - 2, 5.2 * scale, 2.4 * scale); g.clip();
  g.strokeStyle = hexA('#fff4e0', 0.85); g.lineWidth = 1;
  for (let x = x0 + 3; x < gx + 3; x += 3.2 * scale) { g.beginPath(); g.moveTo(x, -2.6 * scale); g.lineTo(x - 3 * scale, 2.6 * scale); g.moveTo(x - 3 * scale, -2.6 * scale); g.lineTo(x, 2.6 * scale); g.stroke(); }
  g.restore();
  const lw = 1.9 * Math.min(1, scale + 0.15), fill = () => lin(g, 0, -5 * scale, 0, 5 * scale, [[0, L(bladeC, 0.55)], [0.45, bladeC], [1, D(bladeC, 0.2)]]);
  const bx = tx + 2, n = 24;
  if (bone && x1 - bx > 10 * scale) {
    // the bone: a shaft that flares into a knob pair at each end. One outline round the lot: every part's ink stroke
    // first (twice the width), then every fill over them, so only the outer silhouette keeps its ink
    const kr = 2.9 * scale, d = kr * 0.8, xb = bx + kr * 1.2, xt = x1 - kr * 0.95, cAt = x => cur((x - bx) / (x1 - bx));
    const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    const top = [], bot = [];
    for (let i = 0; i <= n; i++) {
      const u = i / n, x = xb + (xt - xb) * u, c = cAt(x), w = scale * (1.75 + 1.05 * ((1 - sm(0, 0.3, u)) + sm(0.7, 1, u)));
      top.push([x, c - w]); bot.push([x, c + w * 0.92]);
    }
    const knobs = [[xb - kr * 0.15, -1], [xb - kr * 0.15, 1], [xt + kr * 0.15, -1], [xt + kr * 0.15, 1]].map(([x, s]) => [x, cAt(x) + s * d]);
    const shaft = () => { g.beginPath(); top.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); for (let i = n; i >= 0; i--) g.lineTo(bot[i][0], bot[i][1]); g.closePath(); };
    g.save(); g.lineJoin = 'round'; g.strokeStyle = INK; g.lineWidth = lw * 2;
    for (const [x, y] of knobs) { circ(g, x, y, kr); g.stroke(); }
    shaft(); g.stroke();
    g.fillStyle = fill(); for (const [x, y] of knobs) { circ(g, x, y, kr); g.fill(); }
    shaft(); g.fill();
    g.restore();
    // the knobs' shine, the white edge between them and a soft shade down the back
    for (const [x, y] of knobs) shine(g, x - kr * 0.3, y - kr * 0.38, kr * 0.36, kr * 0.22, -0.4, 0.8);
    if (edge) {
      g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = 1.1; g.beginPath(); for (let i = 3; i <= n - 3; i++) { const [x, y] = bot[i]; i === 3 ? g.moveTo(x, y - 1.1) : g.lineTo(x, y - 1.1); } g.stroke();
      g.strokeStyle = hexA(D(bladeC, 0.3), 0.5); g.lineWidth = 0.9; g.beginPath(); for (let i = 4; i <= n - 4; i++) { const [x, y] = top[i]; i === 4 ? g.moveTo(x, y + 1.3) : g.lineTo(x, y + 1.3); } g.stroke();
    }
  } else if (x1 > bx) {
    // the classic blade: fill, ink the long edges, a white edge line and a faint hamon
    const top = [], bot = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = bx + (x1 - bx) * t, c = cur(t), h = hw(t) * (t > 0.86 ? Math.sqrt(Math.max(0.02, 1 - ((t - 0.86) / 0.14) ** 2)) : 1);
      top.push([x, c - h]); bot.push([x, c + h * 0.85]);
    }
    g.beginPath(); top.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); for (let i = n; i >= 0; i--) g.lineTo(bot[i][0], bot[i][1]); g.closePath();
    g.fillStyle = fill(); g.fill();
    g.strokeStyle = INK; g.lineWidth = lw; g.stroke();
    if (edge) {
      g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = 1.1; g.beginPath(); for (let i = 1; i < n - 2; i++) { const [x, y] = bot[i]; i === 1 ? g.moveTo(x, y - 1.2) : g.lineTo(x, y - 1.2); } g.stroke();
      g.strokeStyle = hexA(D(bladeC, 0.25), 0.55); g.lineWidth = 0.9; g.beginPath(); for (let i = 1; i < n - 3; i++) { const t = i / n, x = top[i][0], y = cur(t) + Math.sin(i * 1.9) * 0.5; i === 1 ? g.moveTo(x, y) : g.lineTo(x, y); } g.stroke();
    }
  }
  // the gold collar and the round gold tsuba with the paw print cut through it
  rr(g, tx, -3.6 * scale, 3.2 * scale, 7.2 * scale, 1); paint(g, vol(g, L(acc, 0.1), tx, -4, tx + 3, 4, 0.35, 0.25), 1.3);
  ell(g, tx - 0.5 * scale, 0, 2.6 * scale, 7.6 * scale); paint(g, vol(g, GOLD, tx - 3, -8, tx + 2, 8, 0.5, 0.3), 1.6);
  g.fillStyle = D(GOLD, 0.6);
  for (const [dy, r] of [[-4.6, 0.8], [-2.2, 0.85], [2.2, 0.85], [4.6, 0.8]]) { ell(g, tx - 0.5 * scale, dy * scale, 0.7 * scale, r * scale); g.fill(); }
  ell(g, tx - 0.4 * scale, 0, 0.9 * scale, 1.6 * scale); g.fill();
  shine(g, tx - 1.4 * scale, -4.5 * scale, 0.8 * scale, 1.8 * scale, 0, 0.75);
}
/** a sword item's icon: every sword base is carried as the Bone Katana (charKit.js katanaGeo), so each is drawn as it in
 *  the item's tint [blade, wrap, accent] (handle bottom-left, tip top-right, like every weapon icon); fx: a late tier's
 *  flourish (glow: a soft aura in its accent, stars: sparkles on the blade, gem: a jewel on the collar) */
export function drawKatanaItem(g, cols, noShadow, K, fx = null) {
  if (!noShadow) K.shadow(g, 25, 15, 3.2);
  const acc = cols?.[2] || '#f2e4c6';
  g.save(); g.translate(0, 1); g.rotate(-Math.PI / 4); // (scale 1.3 from -28 to 29: the knob pairs stay inside the 64 box)
  if (fx?.glow) for (const x of [-1, 9, 18, 26]) K.glow(g, x, -1.5 - x * 0.16, 10, acc, 0.5);
  katanaShape(g, K, { cols, x0: -28, x1: 29, scale: 1.3 });
  if (fx?.gem) { K.ell(g, -3.9, 0, 1.9, 2.4); K.paint(g, K.volR(g, '#e8364a', -3.9, 0, 2.2), 1.1); K.shine(g, -4.4, -0.9, 0.6, 0.45, 0, 0.9); }
  if (fx?.stars) { K.sparkle(g, 6, -3.4, 2.3, '#fff6c0'); K.sparkle(g, 17, -4.8, 1.7, '#fff6c0'); }
  if (fx?.glow) K.sparkle(g, 27, -12, 2.6, '#ffffff');
  g.restore();
}

// ------------------------------------------------------------------ small motifs
function petal(g, K, x, y, s = 1, rot = 0, col = PETAL) {
  g.save(); g.translate(x, y); g.rotate(rot); g.scale(s, s);
  g.beginPath(); g.moveTo(0, 4); g.bezierCurveTo(-4, 1.5, -3.4, -3, -1.2, -4); g.lineTo(0, -2.8); g.lineTo(1.2, -4); g.bezierCurveTo(3.4, -3, 4, 1.5, 0, 4); g.closePath();
  K.paint(g, K.lin(g, 0, -4, 0, 4, [[0, '#fff4f8'], [1, col]]), 1.1); g.restore();
}
function blossom(g, K, x, y, r) {
  g.save(); g.translate(x, y);
  for (let k = 0; k < 5; k++) { g.rotate(Math.PI * 2 / 5); g.beginPath(); g.ellipse(0, -r * 0.6, r * 0.42, r * 0.56, 0, 0, Math.PI * 2); K.paint(g, '#ffe4ec', 1.1); }
  K.circ(g, 0, 0, r * 0.24); K.paint(g, GOLD, 0.9); g.restore();
}
function pawMon(g, K, x, y, r, col = GOLD) {
  g.fillStyle = col; K.ell(g, x, y + r * 0.25, r * 0.42, r * 0.34); g.fill();
  for (const [dx, dy] of [[-0.46, -0.16], [-0.17, -0.46], [0.17, -0.46], [0.46, -0.16]]) { K.ell(g, x + dx * r, y + dy * r, r * 0.16, r * 0.2); g.fill(); }
}
function kabutoTiny(g, K, x, y, s) {
  g.save(); g.translate(x, y); g.scale(s, s);
  g.beginPath(); g.moveTo(-9, 1); g.quadraticCurveTo(-9, -9, 0, -9); g.quadraticCurveTo(9, -9, 9, 1); g.closePath(); K.paint(g, K.vol(g, SAMURAI.lacquer, -9, -9, 9, 1, 0.3, 0.2), 1.4);
  g.beginPath(); g.moveTo(-11, 1); g.lineTo(11, 1); g.lineTo(9, 4); g.lineTo(-9, 4); g.closePath(); K.paint(g, '#2e2a34', 1.2);
  g.beginPath(); g.arc(0, -8, 6, Math.PI * 1.05, Math.PI * 1.95); K.stroke(g, K.INK, 3.6); g.beginPath(); g.arc(0, -8, 6, Math.PI * 1.05, Math.PI * 1.95); K.stroke(g, GOLD, 2.2);
  K.circ(g, 0, -4, 1.8); K.paint(g, GOLD, 0.8);
  g.restore();
}
/** a bone-white crescent: the outer arc of radius r from a0 to a1, fat in the middle */
function crescent(g, K, x, y, r, a0, a1, w) {
  const n = 20; g.beginPath();
  for (let i = 0; i <= n; i++) { const t = i / n, a = a0 + (a1 - a0) * t; i ? g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r) : g.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
  for (let i = n; i >= 0; i--) { const t = i / n, a = a0 + (a1 - a0) * t, rr = r - w * Math.sin(t * Math.PI); g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  g.closePath();
}

// ------------------------------------------------------------------ the skill art
/** → true if this id is one of Chewy's samurai skills (drawn), else false (icons.js draws it) */
export function drawSamuraiSkill(g, id, K) {
  const { INK, TAU, L, D, rr, circ, ell, lin, vol, volR, paint, stroke, shine, sparkle, roundStar, heartPath, glow, hexA } = K;
  const CREAM = '#fffaf0';
  switch (id) {
    case 'chomp': { // Crescent Chomp: the draw-cut's bone-white crescent sweeping out of the hip
      glow(g, 4, 0, 24, '#fff4dc', 0.5);
      crescent(g, K, 4, 10, 25, Math.PI * 1.02, Math.PI * 1.95, 9); paint(g, lin(g, -20, -15, 28, 10, [[0, '#fff6e6'], [1, '#ffe8c0']]), 2);
      crescent(g, K, 4, 10, 25, Math.PI * 1.02, Math.PI * 1.95, 2.2); g.fillStyle = GOLD; g.fill();
      g.save(); g.translate(-6, 14); g.rotate(-0.55); katanaShape(g, K, { x0: -14, x1: 26, scale: 0.72 }); g.restore();
      sparkle(g, 22, -12, 3.6, '#ffffff'); sparkle(g, -18, -8, 2.2, '#fff6c0');
      return true;
    }
    case 'boneMastery': { // Way of the Bone: the katana over the dojo's gold star, its red cord tied in a knot
      roundStar(g, 0, 2, 17, 8.5, 5); paint(g, volR(g, '#ffcf4a', 0, 2, 17, 0.5, 0.3), 1.8);
      g.save(); g.rotate(-Math.PI / 4); katanaShape(g, K, { x0: -26, x1: 27, scale: 0.85 }); g.restore();
      g.beginPath(); g.moveTo(-15, 15); g.quadraticCurveTo(-20, 24, -24, 20); g.moveTo(-15, 15); g.quadraticCurveTo(-10, 25, -6, 23); stroke(g, INK, 3.4); g.beginPath(); g.moveTo(-15, 15); g.quadraticCurveTo(-20, 24, -24, 20); g.moveTo(-15, 15); g.quadraticCurveTo(-10, 25, -6, 23); stroke(g, RED, 2);
      return true;
    }
    case 'whirl': { // Whirlwind Stance: the blade's ring of cuts swirling, cherry petals caught in it
      for (let i = 0; i < 2; i++) { crescent(g, K, 0, 2, 22 - i * 7, i * 2.6 + 0.3, i * 2.6 + 3.7, 5.5 - i * 1.5); paint(g, lin(g, -20, -20, 20, 20, [[0, '#fff6e6'], [1, '#ffe6c8']]), 1.7); }
      for (const [x, y, s, r] of [[17, -14, 0.9, 0.4], [-19, 9, 0.8, -0.8], [-6, -19, 0.7, 1.4], [20, 12, 0.75, 2.2], [-15, -13, 0.6, 0.2]]) petal(g, K, x, y, s, r);
      g.save(); g.translate(0, 2); g.rotate(0.35); katanaShape(g, K, { x0: -16, x1: 19, scale: 0.72, edge: false }); g.restore();
      return true;
    }
    case 'dig': { // Helmet Splitter: the overhead cut striking down into a split in the ground
      g.beginPath(); g.moveTo(-27, 22); g.quadraticCurveTo(-14, 12, 0, 14); g.quadraticCurveTo(14, 12, 27, 22); g.closePath(); paint(g, vol(g, '#a07450', -27, 12, 27, 22), 2);
      g.beginPath(); g.moveTo(0, 13); g.lineTo(-3, 17); g.lineTo(1, 19); g.lineTo(-2, 23); g.moveTo(0, 13); g.lineTo(7, 16); g.lineTo(10, 21); g.moveTo(-1, 14); g.lineTo(-10, 17); stroke(g, INK, 1.8);
      roundStar(g, 0, 11, 9, 4.5, 8, 0.2); paint(g, '#fff4c8', 1.4);
      g.save(); g.translate(1, -6); g.rotate(Math.PI / 2 + 0.06); katanaShape(g, K, { x0: -21, x1: 19, scale: 0.8 }); g.restore();
      for (const [x, y, r] of [[-17, 1, 2.8], [15, -1, 2.4], [-21, 10, 2], [20, 8, 1.8]]) { circ(g, x, y, r); paint(g, volR(g, '#b8845a', x, y, r), 1.3); }
      for (const [x, y] of [[-9, -20], [10, -20]]) { g.beginPath(); g.moveTo(x, y); g.lineTo(x * 0.6, y + 7); stroke(g, INK, 3); g.beginPath(); g.moveTo(x, y); g.lineTo(x * 0.6, y + 7); stroke(g, CREAM, 1.6); }
      return true;
    }
    case 'guard': { // Unbending Stance: the blade held level across a lacquered shield with the gold paw mon
      g.beginPath(); g.moveTo(0, -22); g.quadraticCurveTo(12, -16, 20, -16); g.quadraticCurveTo(21, 8, 0, 22); g.quadraticCurveTo(-21, 8, -20, -16); g.quadraticCurveTo(-12, -16, 0, -22); g.closePath();
      paint(g, vol(g, '#3a3440', -20, -22, 20, 22, 0.35, 0.3), 2.2);
      g.beginPath(); g.moveTo(0, -17); g.quadraticCurveTo(9, -12, 15.5, -12.5); g.quadraticCurveTo(16, 5, 0, 16.5); g.quadraticCurveTo(-16, 5, -15.5, -12.5); g.quadraticCurveTo(-9, -12, 0, -17); g.closePath(); stroke(g, GOLD, 1.6);
      pawMon(g, K, 0, -1, 11);
      g.save(); g.translate(0, 9); g.rotate(-0.08); katanaShape(g, K, { x0: -26, x1: 27, scale: 0.7 }); g.restore();
      shine(g, -11, -12, 3, 1.5, -0.5, 0.6);
      return true;
    }
    case 'frenzy': { // Flowing Water: a curling wave and the cut riding it
      g.beginPath(); g.moveTo(-26, 18); g.quadraticCurveTo(-22, -6, -2, -12); g.quadraticCurveTo(14, -16, 20, -4); g.quadraticCurveTo(10, -10, 4, -2); g.quadraticCurveTo(0, 6, 10, 10); g.quadraticCurveTo(20, 14, 26, 18); g.closePath();
      paint(g, lin(g, 0, -16, 0, 18, [[0, '#dff4ff'], [0.5, '#7ec4f0'], [1, '#3a7ac8']]), 2);
      for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(4, -2, 4 + i * 3.5, Math.PI * 0.9, Math.PI * 1.9); stroke(g, hexA('#ffffff', 0.85 - i * 0.2), 1.4); }
      for (const [x, y, r] of [[18, -14, 2.2], [23, -8, 1.5], [12, -18, 1.4]]) { circ(g, x, y, r); paint(g, '#ffffff', 0.9); }
      for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(-26 + i * 2, -18 + i * 6); g.lineTo(-14 + i * 3, -18 + i * 6); stroke(g, INK, 3); g.beginPath(); g.moveTo(-26 + i * 2, -18 + i * 6); g.lineTo(-14 + i * 3, -18 + i * 6); stroke(g, CREAM, 1.6); }
      return true;
    }
    case 'bonestorm': { // Sakura Storm: spectral bone blades wheeling round a cherry blossom, petals flying
      glow(g, 0, 0, 22, '#ffd8e6', 0.7);
      g.strokeStyle = hexA('#ffffff', 0.5); g.lineWidth = 1.4; g.beginPath(); g.arc(0, 0, 17, 0, TAU); g.stroke();
      for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU - 0.4; g.save(); g.translate(Math.cos(a) * 17, Math.sin(a) * 17); g.rotate(a + Math.PI / 2); g.globalAlpha = 0.92; katanaShape(g, K, { x0: -8, x1: 9, scale: 0.4, cols: ['#fff8f4', '#e8b8c8', '#f8e0e8'], edge: false }); g.restore(); }
      blossom(g, K, 0, 0, 8);
      for (const [x, y, s, r] of [[21, -18, 0.7, 0.5], [-22, 16, 0.6, -1]]) petal(g, K, x, y, s, r);
      return true;
    }
    case 'woof': { // Kiai!: the shout: a comic burst with two bold marks, zigzag rings rolling out
      for (let i = 0; i < 2; i++) { g.beginPath(); for (let k = 0; k <= 24; k++) { const a = k / 24 * TAU, r = (18 + i * 6) + (k % 2 ? 2 : -1); k ? g.lineTo(Math.cos(a) * r, Math.sin(a) * r * 0.9) : g.moveTo(Math.cos(a) * r, Math.sin(a) * r * 0.9); } g.closePath(); stroke(g, hexA(INK, 0.55 - i * 0.2), 1.8); }
      g.beginPath(); for (let k = 0; k < 22; k++) { const a = k / 22 * TAU, r = k % 2 ? 9.5 : 15.5; k ? g.lineTo(Math.cos(a) * r, Math.sin(a) * r * 0.9) : g.moveTo(Math.cos(a) * r, Math.sin(a) * r * 0.9); } g.closePath(); paint(g, '#fffaf0', 2.2);
      for (const x of [-3.5, 3.5]) { rr(g, x - 1.9, -8, 3.8, 9.5, 1.8); paint(g, GOLD, 1.3); circ(g, x, 4.8, 1.9); paint(g, GOLD, 1.2); }
      return true;
    }
    case 'goodboy': { // Code of the Good Boy: a little scroll of the code sealed with a red heart, a halo above
      g.beginPath(); g.ellipse(0, -18, 11, 3.6, 0, 0, TAU); stroke(g, INK, 4.8); g.beginPath(); g.ellipse(0, -18, 11, 3.6, 0, 0, TAU); stroke(g, '#ffe070', 2.8);
      rr(g, -15, -11, 30, 25, 3); paint(g, vol(g, '#fff6e6', -15, -11, 15, 14, 0.3, 0.15), 1.8);
      for (const y of [-11, 14]) { rr(g, -18, y - 2.6, 36, 5.2, 2.6); paint(g, vol(g, '#b8845a', -18, y - 3, 18, y + 3), 1.5); }
      for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(-10 + i * 7, -6); g.lineTo(-10 + i * 7, 4); stroke(g, hexA(INK, 0.55), 1.6); }
      heartPath(g, 6, 6, 5.5); paint(g, '#e8475c', 1.4);
      sparkle(g, 18, -8, 2.6, '#fff6c0');
      return true;
    }
    case 'zoom': { // Flash Draw: the white-hot cut along the path, the hilt going home at its end
      glow(g, 0, 2, 22, '#fff6e6', 0.4);
      g.beginPath(); g.moveTo(-27, 14); g.lineTo(26, -10); stroke(g, hexA(GOLD, 0.6), 7); g.beginPath(); g.moveTo(-27, 14); g.lineTo(26, -10); stroke(g, '#ffffff', 3);
      for (const [x, y] of [[-14, 8], [2, 1], [16, -6]]) sparkle(g, x, y, 2.6, '#fffaf0');
      for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(-25 + i * 3, -12 + i * 6); g.lineTo(-13 + i * 3, -12 + i * 6); stroke(g, INK, 2.8); g.beginPath(); g.moveTo(-25 + i * 3, -12 + i * 6); g.lineTo(-13 + i * 3, -12 + i * 6); stroke(g, CREAM, 1.4); }
      g.save(); g.translate(14, 15); g.rotate(-0.42); // the sheathing: the hilt at the saya's mouth
      rr(g, -2, -3.2, 18, 6.4, 3); paint(g, vol(g, '#2a2630', -2, -3, 16, 3), 1.6);
      g.restore();
      g.save(); g.translate(12, 16); g.rotate(-0.42 + Math.PI); katanaShape(g, K, { x0: -14, x1: -3, scale: 0.62, edge: false }); g.restore();
      return true;
    }
    case 'packcall': { // Pack Call: the ghostly pups in their tiny kabuto
      for (const [x, y, s, a] of [[-10, 6, 0.95, 0.85], [10, 0, 1.1, 0.95]]) {
        g.save(); g.translate(x, y); g.scale(s, s); g.globalAlpha = a;
        for (const k of [-1, 1]) { g.beginPath(); g.moveTo(k * 4, -8); g.quadraticCurveTo(k * 12, -20, k * 14, -16); g.quadraticCurveTo(k * 14, -8, k * 9, -2); g.closePath(); paint(g, lin(g, 0, -20, 0, 0, [[0, '#e8f0ff'], [1, '#a8c0ff']]), 1.6); }
        g.beginPath(); g.moveTo(-10, -2); g.bezierCurveTo(-11, -13, 11, -13, 10, -2); g.lineTo(10, 8); g.quadraticCurveTo(7, 12, 5, 8); g.quadraticCurveTo(2.5, 12, 0, 8); g.quadraticCurveTo(-2.5, 12, -5, 8); g.quadraticCurveTo(-7, 12, -10, 8); g.closePath();
        paint(g, lin(g, 0, -12, 0, 12, [[0, '#ffffff'], [1, '#b8ccff']]), 1.6);
        for (const k of [-1, 1]) { circ(g, k * 4, -1, 2); g.fillStyle = '#2a2a48'; g.fill(); circ(g, k * 4 - 0.6, -1.6, 0.7); g.fillStyle = '#fff'; g.fill(); }
        ell(g, 0, 3, 1.8, 1.2); g.fillStyle = '#2a2a48'; g.fill();
        g.globalAlpha = 1; kabutoTiny(g, K, 0, -6, 0.85);
        g.restore();
      }
      sparkle(g, -18, -16, 2.4, '#ffffff'); sparkle(g, 20, 16, 2.2, '#ffffff');
      return true;
    }
    case 'treat': { // Onigiri Toss: a glowing rice ball with its nori band, healing crumbs flying
      glow(g, 0, 2, 20, '#fff4d8', 0.6);
      g.beginPath(); g.moveTo(0, -17); g.quadraticCurveTo(4, -17, 6, -13); g.lineTo(17, 8); g.quadraticCurveTo(19, 14, 13, 15); g.lineTo(-13, 15); g.quadraticCurveTo(-19, 14, -17, 8); g.lineTo(-6, -13); g.quadraticCurveTo(-4, -17, 0, -17); g.closePath();
      paint(g, vol(g, '#fffaf0', -18, -17, 18, 15, 0.3, 0.15), 2);
      rr(g, -8, 3, 16, 12, 2); paint(g, vol(g, '#2c3a30', -8, 3, 8, 15, 0.25, 0.3), 1.6);
      for (const [x, y] of [[-6, -5], [3, -8], [8, -1], [-1, -1]]) { ell(g, x, y, 1.1, 0.7, 0.5); g.fillStyle = hexA('#d8ccb8', 0.9); g.fill(); }
      for (const [x, y, s] of [[-17, -14, 3.2], [16, -13, 2.6], [20, 2, 2]]) { g.save(); g.translate(x, y); rr(g, -s * 0.35, -s, s * 0.7, s * 2, 1); g.fillStyle = '#8fe0a0'; g.fill(); rr(g, -s, -s * 0.35, s * 2, s * 0.7, 1); g.fill(); g.restore(); }
      return true;
    }
    case 'howl': { // War Banner Howl: the black nobori with the gold paw mon, planted and flying
      g.beginPath(); g.moveTo(-14, 27); g.lineTo(-14, -25); stroke(g, INK, 4.4); g.beginPath(); g.moveTo(-14, 27); g.lineTo(-14, -25); stroke(g, '#3a3440', 2.6);
      g.beginPath(); g.moveTo(-15, -21); g.lineTo(13, -21); stroke(g, INK, 3.6); g.beginPath(); g.moveTo(-15, -21); g.lineTo(13, -21); stroke(g, '#3a3440', 2);
      circ(g, -14, -26, 2.6); paint(g, GOLD, 1.2); circ(g, 14, -21, 1.8); paint(g, GOLD, 1);
      g.beginPath(); g.moveTo(-12, -20); g.lineTo(13, -20); g.quadraticCurveTo(16, -2, 12, 21); g.quadraticCurveTo(0, 18, -12, 21); g.closePath();
      paint(g, vol(g, SAMURAI.banner, -12, -20, 14, 21, 0.25, 0.25), 2);
      rr(g, -12, -20, 25, 4.5, 1); paint(g, SAMURAI.bannerTrim, 1.2);
      g.beginPath(); g.arc(1, -3, 7, 0, TAU); stroke(g, SAMURAI.crest, 1.6); pawMon(g, K, 1, -3, 9, SAMURAI.crest);
      for (let i = 0; i < 2; i++) { g.beginPath(); g.arc(18, -6, 4 + i * 4, -1, 0.9); stroke(g, INK, 2.6); g.beginPath(); g.arc(18, -6, 4 + i * 4, -1, 0.9); stroke(g, CREAM, 1.3); }
      return true;
    }
    case 'moonhowl': { // Moonlit Blades: the moon, and blades of its light falling point-first
      g.beginPath(); g.arc(-6, -13, 10, 0.75, TAU - 0.75); g.arc(-0.5, -16, 8.5, TAU - 1.05, 1.05, true); g.closePath(); paint(g, vol(g, '#fff6c0', -16, -23, 4, -3, 0.4, 0.15), 1.8);
      for (const [x, y, s] of [[-12, 6, 0.42], [3, 10, 0.5], [16, 4, 0.4]]) {
        g.save(); g.translate(x, y); g.rotate(Math.PI / 2);
        katanaShape(g, K, { x0: -16, x1: 13, scale: s, cols: ['#eef2ff', '#9fb4ff', '#dfe6ff'], edge: false, bone: false }); // (pointed: gfx/bladeFx.js moonBlade)
        g.restore();
        ell(g, x, y + 14 * s + 7, 4.5 * s + 2, 1.6); g.fillStyle = hexA('#dfe8ff', 0.85); g.fill();
      }
      sparkle(g, 12, -17, 3.2, '#ffffff'); sparkle(g, 21, -6, 2, '#ffffff');
      return true;
    }
  }
  return false;
}
