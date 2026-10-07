// The Golden Retriever dragoon's painted icons (docs/GOLDEN.md), in rpg/icons.js' look: the lance item art (twelve bases
// by variant + colours [head, shaft, pommel]) and his skill art. icons.js calls these with its drawing kit K (ICON_KIT:
// paint, vol, volR, shine, sparkle, glow, …), so this module imports nothing from it (no import cycle). Art is drawn
// around 0,0 in a 64 box.
export const GLD_SKILL_TREE = {
  sunbeamThrust: 'lance', knightsVow: 'lance', sunfallJump: 'lance', pinwheelSweep: 'lance', steadyPaws: 'lance', gallantCharge: 'lance', starfallLance: 'lance',
  bonkDart: 'javelin', keenNose: 'javelin', tailwagVolley: 'javelin', trueFlight: 'javelin', goodRetriever: 'javelin', emberleafJavelin: 'javelin', sunshower: 'javelin',
  emberBreath: 'whelp', bestFriends: 'whelp', divebombSwoop: 'whelp', wingShield: 'whelp', warmHeart: 'whelp', mightyRoar: 'whelp', dragonHeart: 'whelp',
};
export const GLD_SKILL_BG = {
  lance: ['#eefaf2', '#9cd6b4', '#2f7a55'], javelin: ['#fff8e6', '#e8c880', '#9a6a2a'], whelp: ['#fff0e6', '#f4b08a', '#b8502a'],
};
export const GLD_PASSIVE = ['knightsVow', 'steadyPaws', 'keenNose', 'goodRetriever', 'bestFriends', 'warmHeart'];
const INKC = '#4a2c2a', EMER = '#3a9a6a', BRASS = '#c8a050', ROPE = '#f4e8d0', BAND = '#e0a868', BALLC = '#d6c85c', FUR = '#c47a3a', FUR_LT = '#e0a868', CREAM = '#fffaf0', EMBER = '#ff9a4a', PEACH = '#f2c48a';
const SHADOW_BLK = '#34303f', SHADOW_WHT = '#f4ece0';

// ------------------------------------------------------------------ pieces
/** the toy lance along a line from the pommel (x0, y0) to the tip (x1, y1): rope shaft with bands, the felt wing guard,
 *  the rubber flame head, the tennis-ball pommel. cols: [head, shaft, pommel]; v: the head's shape */
function lance(g, K, x0, y0, x1, y1, cols = null, v = 'flame', w = 3.4) {
  const [head = EMER, shaft = ROPE, pom = BALLC] = cols || [];
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
  g.save(); g.translate(x0, y0); g.rotate(a);
  const hs = L * 0.2, gx = L - hs; // the head's length, the guard's place
  // shaft
  K.rr(g, 2, -w / 2, gx - 2, w, w / 2); K.paint(g, K.lin(g, 0, -w / 2, 0, w / 2, [[0, K.L(shaft, 0.3)], [1, K.D(shaft, 0.15)]]), 1.5);
  for (let x = 6; x < gx - 3; x += 5.2) { g.beginPath(); g.moveTo(x, -w / 2); g.lineTo(x + 2, w / 2); K.stroke(g, K.D(shaft === ROPE ? BAND : shaft, 0.15), 1.2); }
  // the guard: a felt wing either side
  for (const k of [-1, 1]) { g.beginPath(); g.moveTo(gx - 1, 0); g.quadraticCurveTo(gx - 4, k * 6.5, gx - 2.5, k * 8.5); g.quadraticCurveTo(gx + 1.5, k * 5, gx + 2, 0); g.closePath(); K.paint(g, K.vol(g, head, gx - 4, k * 8, gx + 2, 0, 0.35, 0.3), 1.3); }
  K.rr(g, gx - 1.6, -w * 0.75, 3.2, w * 1.5, 1); K.paint(g, BRASS, 1.2);
  // the head
  g.beginPath();
  if (v === 'leaf') { g.moveTo(gx + 1, 0); g.quadraticCurveTo(gx + hs * 0.5, -hs * 0.36, L, 0); g.quadraticCurveTo(gx + hs * 0.5, hs * 0.36, gx + 1, 0); }
  else if (v === 'star' || v === 'sun') { const cx = gx + hs * 0.55, r = hs * 0.45; for (let i = 0; i < 10; i++) { const an = i / 10 * Math.PI * 2, rr = i % 2 ? r * 0.5 : r; i ? g.lineTo(cx + Math.cos(an) * rr, Math.sin(an) * rr) : g.moveTo(cx + rr, 0); } g.closePath(); }
  else if (v === 'squeak' || v === 'comet') { K.ell(g, gx + hs * 0.55, 0, hs * 0.48, hs * 0.36); }
  else { g.moveTo(gx + 1, -2.5); g.quadraticCurveTo(gx + hs * 0.4, -hs * 0.42, gx + hs * 0.55, -hs * 0.18); g.lineTo(gx + hs * 0.62, -hs * 0.32); g.quadraticCurveTo(gx + hs * 0.85, -hs * 0.16, L, 0); g.quadraticCurveTo(gx + hs * 0.85, hs * 0.16, gx + hs * 0.62, hs * 0.32); g.lineTo(gx + hs * 0.55, hs * 0.18); g.quadraticCurveTo(gx + hs * 0.4, hs * 0.42, gx + 1, 2.5); g.closePath(); }
  K.paint(g, K.vol(g, head, gx, -hs * 0.4, L, hs * 0.4, 0.35, 0.3), 1.6);
  K.shine(g, gx + hs * 0.5, -hs * 0.12, hs * 0.18, hs * 0.07, 0, 0.7);
  // pommel
  K.circ(g, 0, 0, w * 1.15); K.paint(g, K.volR(g, pom, 0, 0, w * 1.15, 0.45, 0.35), 1.5);
  g.beginPath(); g.arc(-w * 0.9, 0, w * 0.9, -1, 1); K.stroke(g, '#fffbe8', 1);
  g.restore();
}
/** a toy javelin from (x0, y0) (the fletching) to (x1, y1) (the gold rubber tip) */
function javelin(g, K, x0, y0, x1, y1, s = 1) {
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
  g.save(); g.translate(x0, y0); g.rotate(a);
  K.rr(g, 2, -1.4 * s, L - 4, 2.8 * s, 1.2 * s); K.paint(g, K.lin(g, 0, -1.5, 0, 1.5, [[0, '#fffaf0'], [1, '#e6d4b4']]), 1.2);
  for (const k of [-1, 1]) { g.beginPath(); g.moveTo(1, 0); g.lineTo(-2, k * 5 * s); g.lineTo(7 * s, k * 1.2); g.closePath(); K.paint(g, EMER, 1.1); }
  K.circ(g, L - 1.5 * s, 0, 3.4 * s); K.paint(g, K.volR(g, BRASS, L - 1.5 * s, 0, 3.4 * s, 0.4, 0.35), 1.3);
  K.shine(g, L - 2.6 * s, -1.4 * s, 1.1 * s, 0.6 * s, 0, 0.8);
  g.restore();
}
/** Shadow the whelp's head: the emerald hood with brass horns, his Boston face peeking out (the blaze, the big eyes) */
function whelpHead(g, K, x, y, s = 1, mouth = false) {
  g.save(); g.translate(x, y); g.scale(s, s);
  for (const k of [-1, 1]) { g.beginPath(); g.moveTo(k * 6, -9); g.quadraticCurveTo(k * 11, -20, k * 9, -21); g.quadraticCurveTo(k * 5, -16, k * 3, -10); g.closePath(); K.paint(g, SHADOW_BLK, 1.4); g.beginPath(); g.moveTo(k * 6, -10.5); g.quadraticCurveTo(k * 9, -17, k * 8.4, -18.6); g.quadraticCurveTo(k * 6, -15, k * 4.6, -11); g.closePath(); g.fillStyle = '#f0a0a8'; g.fill(); } // his ears up through the slits
  g.beginPath(); g.ellipse(0, 0, 13, 12, 0, Math.PI * 1.02, Math.PI * 1.98); g.lineTo(13, 3); g.quadraticCurveTo(0, -2, -13, 3); g.closePath(); // (the hood: a cap over the brow)
  K.circ(g, 0, 1, 10.5); K.paint(g, K.volR(g, SHADOW_BLK, 0, 1, 10.5, 0.4, 0.25), 1.6); // his face
  g.beginPath(); g.moveTo(-2, -9); g.lineTo(2, -9); g.lineTo(3.4, 5); g.lineTo(-3.4, 5); g.closePath(); g.fillStyle = SHADOW_WHT; g.fill(); // the blaze
  K.ell(g, 0, 6, 6, 4.6); K.paint(g, SHADOW_WHT, 1.3);
  K.ell(g, 0, 3.6, 2, 1.4); g.fillStyle = '#212d28'; g.fill();
  for (const k of [-1, 1]) { K.circ(g, k * 4.6, -1.5, 2.6); g.fillStyle = '#c88732'; g.fill(); K.circ(g, k * 4.6, -1.5, 1.4); g.fillStyle = '#1e1a1c'; g.fill(); K.circ(g, k * 4.0, -2.3, 0.7); g.fillStyle = '#fff'; g.fill(); }
  if (mouth) { K.ell(g, 0, 8.6, 2.6, 2); g.fillStyle = '#e8506a'; g.fill(); }
  // the hood: an emerald cap, a brass rim and two brass horns
  g.beginPath(); g.ellipse(0, -4, 12.5, 9, 0, Math.PI, 0); g.quadraticCurveTo(0, -6.5, -12.5, -4); g.closePath(); K.paint(g, K.vol(g, EMER, -12, -13, 12, -4, 0.35, 0.3), 1.6);
  for (const k of [-1, 1]) { g.beginPath(); g.moveTo(k * 2.5, -11.5); g.quadraticCurveTo(k * 4, -17, k * 2, -19); g.quadraticCurveTo(k * 0.6, -15, k * 0.2, -12); g.closePath(); K.paint(g, BRASS, 1.2); }
  g.restore();
}
/** a felt dragon wing: emerald arm and fingers, peach membrane; side: −1 the left wing (spreads left) */
function wing(g, K, x, y, s = 1, side = 1, up = 0) {
  g.save(); g.translate(x, y); g.scale(s * side, s); g.rotate(-up);
  g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(8, -12, 20, -14); g.quadraticCurveTo(19, -6, 22, -2); g.quadraticCurveTo(17, -1, 16, 3); g.quadraticCurveTo(11, 2, 9, 6); g.quadraticCurveTo(5, 3, 0, 4); g.closePath();
  K.paint(g, K.lin(g, 0, -14, 0, 6, [[0, '#f8d6a8'], [1, PEACH]]), 1.6);
  g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(8, -12, 20, -14); K.stroke(g, INKC, 4.4); g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(8, -12, 20, -14); K.stroke(g, EMER, 2.6);
  for (const [ex, ey] of [[22, -2], [16, 3], [9, 6]]) { g.beginPath(); g.moveTo(12, -11); g.lineTo(ex, ey); K.stroke(g, EMER, 1.6); }
  g.restore();
}
/** an ember: a little flame flicker */
function ember(g, K, x, y, s = 1, col = EMBER) {
  g.beginPath(); g.moveTo(x, y - 6 * s); g.quadraticCurveTo(x + 4.5 * s, y - 0.5 * s, x + 2.4 * s, y + 3 * s); g.quadraticCurveTo(x, y + 4.4 * s, x - 2.4 * s, y + 3 * s); g.quadraticCurveTo(x - 4.5 * s, y - 0.5 * s, x, y - 6 * s); g.closePath();
  K.paint(g, K.lin(g, x, y - 6 * s, x, y + 4 * s, [[0, '#ffe08a'], [1, col]]), 1.1);
}
/** a small emerald leaf */
function leaf(g, K, x, y, s = 1, rot = 0, col = '#7cc45a') {
  g.save(); g.translate(x, y); g.rotate(rot); g.scale(s, s);
  g.beginPath(); g.moveTo(-5, 0); g.quadraticCurveTo(0, -4, 5, 0); g.quadraticCurveTo(0, 4, -5, 0); g.closePath(); K.paint(g, col, 1.1);
  g.beginPath(); g.moveTo(-4, 0); g.lineTo(4, 0); K.stroke(g, K.D(col, 0.3), 0.8);
  g.restore();
}
function swoosh(g, K, draw, w = 4, col = CREAM) { draw(); K.stroke(g, INKC, w + 2.6); draw(); K.stroke(g, col, w); }
/** sun rays behind something (n rays from x, y) */
function rays(g, K, x, y, r0, r1, n = 8, col = '#ffe9a0', a = 0.9) {
  g.save(); g.globalAlpha *= a;
  for (let i = 0; i < n; i++) { const an = i / n * Math.PI * 2 + 0.2; g.beginPath(); g.moveTo(x + Math.cos(an) * r0, y + Math.sin(an) * r0); g.lineTo(x + Math.cos(an) * r1, y + Math.sin(an) * r1); K.stroke(g, col, 3); }
  g.restore();
}
/** the golden dragoon's head (for the passives): red-gold, the feathered ears, the emerald crest helm */
function goldenHead(g, K, x, y, s = 1, mood = 'happy') {
  g.save(); g.translate(x, y); g.scale(s, s);
  for (const k of [-1, 1]) { g.beginPath(); g.ellipse(k * 11, 3, 6, 11, k * 0.25, 0, Math.PI * 2); K.paint(g, K.vol(g, FUR, k * 11 - 6, -8, k * 11 + 6, 14, 0.35, 0.25), 1.5); }
  K.circ(g, 0, 0, 11); K.paint(g, K.volR(g, FUR, 0, 0, 11, 0.4, 0.25), 1.6);
  K.ell(g, 0, 5, 6.5, 4.6); K.paint(g, FUR_LT, 1.2);
  K.ell(g, 0, 2.6, 2.4, 1.7); g.fillStyle = '#603b27'; g.fill();
  for (const k of [-1, 1]) { if (mood === 'happy') { g.beginPath(); g.arc(k * 4.6, -2, 2.2, Math.PI * 1.1, Math.PI * 1.9); K.stroke(g, '#3a2418', 1.6); } else { K.circ(g, k * 4.6, -2, 2.2); g.fillStyle = '#603b27'; g.fill(); K.circ(g, k * 4.1, -2.7, 0.7); g.fillStyle = '#fff'; g.fill(); } }
  K.ell(g, 0, 8, 2.6, 2.2); g.fillStyle = '#e8687a'; g.fill();
  g.beginPath(); g.ellipse(0, -6, 10, 6.5, 0, Math.PI, 0); g.quadraticCurveTo(0, -8.5, -10, -6); g.closePath(); K.paint(g, K.vol(g, EMER, -10, -12, 10, -6, 0.35, 0.3), 1.5);
  K.rr(g, -10, -7.4, 20, 2.4, 1.2); K.paint(g, BRASS, 1);
  g.beginPath(); g.moveTo(-4, -12); g.quadraticCurveTo(0, -18, 6, -15); g.quadraticCurveTo(8, -13, 5, -12); g.closePath(); K.paint(g, EMER, 1.2); // the little dragon
  g.restore();
}

// ------------------------------------------------------------------ the lance item
export function drawLance(g, v, cols, noShadow, K, s = 1) {
  if (!noShadow) K.shadow(g, 25, 20, 3.4);
  g.save(); g.scale(s, s);
  lance(g, K, -22, 22, 24, -24, cols, v, 3.6);
  g.restore();
}

// ------------------------------------------------------------------ skill art
/** → true when it drew `id` (icons.js falls through to its own art otherwise) */
export function drawGoldenSkill(g, id, K) {
  switch (id) {
    case 'attack_lance': { // the reach combo: the lance thrust far out, two speed lines along it
      for (let i = 0; i < 2; i++) swoosh(g, K, () => { g.beginPath(); g.moveTo(-24 + i * 6, 6 + i * 8); g.lineTo(8 + i * 6, -10 + i * 8); }, 2.4 - i * 0.5);
      lance(g, K, -20, 18, 25, -20);
      return true;
    }
    case 'sunbeamThrust': { // the lunge: a sunbeam down the line, the lance at its heart
      K.glow(g, 6, -6, 24, '#ffe9a0', 0.55);
      g.beginPath(); g.moveTo(-26, 16); g.lineTo(26, -14); g.lineTo(26, -4); g.lineTo(-26, 22); g.closePath(); g.fillStyle = K.lin(g, -26, 0, 26, 0, [[0, 'rgba(255,240,180,0)'], [1, 'rgba(255,240,180,0.85)']]); g.fill();
      rays(g, K, 20, -12, 8, 15, 7);
      lance(g, K, -24, 20, 22, -14);
      return true;
    }
    case 'knightsVow': { // a paw on the heart, a sunny little crest: his promise
      K.glow(g, 0, -2, 22, '#ffe9a0', 0.4);
      goldenHead(g, K, 0, -4, 1.3, 'happy');
      g.beginPath(); g.moveTo(-6, 18); g.bezierCurveTo(-16, 10, -10, 2, -3, 8); g.bezierCurveTo(4, 2, 10, 10, 0, 18); g.closePath(); // (no: a heart badge below)
      K.paint(g, '#ff8fb0', 1.4);
      return true;
    }
    case 'sunfallJump': { // the Jump: a speck against the sun, then the dive (a dashed arc down to a crack)
      K.circ(g, 12, -16, 10); K.paint(g, K.volR(g, '#ffd84a', 12, -16, 10, 0.4, 0.3), 1.6); rays(g, K, 12, -16, 12, 18, 9);
      g.save(); g.setLineDash([3, 3]); g.beginPath(); g.moveTo(-24, 22); g.quadraticCurveTo(-18, -22, 4, -10); K.stroke(g, INKC, 2); g.restore();
      lance(g, K, 2, -22, -10, 18, null, 'flame', 3);
      for (const k of [-1, 1]) { g.beginPath(); g.moveTo(-10, 22); g.lineTo(-10 + k * 9, 26); K.stroke(g, INKC, 2); }
      return true;
    }
    case 'pinwheelSweep': { // the lance swung all the way round: a ring of whooshes
      for (let i = 0; i < 4; i++) swoosh(g, K, () => { g.beginPath(); g.arc(0, 2, 22, i * Math.PI / 2 + 0.2, i * Math.PI / 2 + 1.1); }, 3.4);
      lance(g, K, -18, 16, 18, -12);
      return true;
    }
    case 'steadyPaws': { // braced: the pommel planted, the point lowered, a foe running onto it (a bonk star)
      lance(g, K, -24, 14, 22, 2, null, 'flame', 3.4);
      K.rr(g, -26, 18, 18, 5, 2); K.paint(g, '#c9a27a', 1.4); // the ground he's dug into
      K.sparkle?.(g, 20, -2, 7, '#fff2c8');
      for (const k of [-1, 1]) { g.beginPath(); g.moveTo(14, -10 + k * 2); g.lineTo(24, -16 + k * 4); K.stroke(g, INKC, 1.6); }
      return true;
    }
    case 'gallantCharge': { // the charge: the lance levelled, speed lines streaming behind, dust
      for (let i = 0; i < 4; i++) swoosh(g, K, () => { g.beginPath(); g.moveTo(-26, -12 + i * 7); g.lineTo(-8, -12 + i * 7); }, 1.8);
      lance(g, K, -16, 4, 26, 0);
      for (const [x, y, r] of [[-20, 18, 4], [-12, 20, 3], [-26, 22, 2.6]]) { K.circ(g, x, y, r); K.paint(g, '#efe2c8', 1.2); }
      return true;
    }
    case 'starfallLance': { // the lance falling as a star, wreathed in embers and leaves
      K.glow(g, 2, 4, 26, '#ffd27a', 0.5);
      for (let i = 0; i < 3; i++) swoosh(g, K, () => { g.beginPath(); g.moveTo(-22 + i * 6, -24); g.lineTo(-4 + i * 5, 2); }, 1.6, '#fff2c8');
      lance(g, K, -16, -24, 8, 16, null, 'star', 3.2);
      ember(g, K, 16, 14, 1.2); ember(g, K, -6, 20, 0.9); leaf(g, K, 18, 2, 1.1, -0.6); leaf(g, K, -2, 22, 1, 0.4);
      return true;
    }
    case 'bonkDart': { // a javelin on a cheerful arc, a "bonk" star where it lands
      g.save(); g.setLineDash([3, 3.4]); g.beginPath(); g.moveTo(-24, 18); g.quadraticCurveTo(-8, -26, 12, -4); K.stroke(g, INKC, 2); g.restore();
      javelin(g, K, -6, -14, 14, 2, 1.3);
      K.sparkle?.(g, 18, 8, 9, '#fff2c8'); K.circ(g, 18, 8, 3); K.paint(g, '#ffe08a', 1.2);
      return true;
    }
    case 'keenNose': { // his nose, sniffing: three scent swirls
      goldenHead(g, K, -6, 4, 1.25, 'alert');
      for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(8, -2 + i * 5); g.bezierCurveTo(14, -8 + i * 5, 18, 2 + i * 5, 26, -4 + i * 5); K.stroke(g, INKC, 3); g.beginPath(); g.moveTo(8, -2 + i * 5); g.bezierCurveTo(14, -8 + i * 5, 18, 2 + i * 5, 26, -4 + i * 5); K.stroke(g, '#bfe9d2', 1.6); }
      return true;
    }
    case 'tailwagVolley': { // a fan of javelins, wide as a wag
      for (let i = -2; i <= 2; i++) { const a = -0.55 + i * 0.26; javelin(g, K, -18, 18, -18 + Math.cos(a) * 44, 18 + Math.sin(a) * 44, 1); }
      return true;
    }
    case 'trueFlight': { // one long straight javelin through three foes' bonk stars
      g.beginPath(); g.moveTo(-28, 12); g.lineTo(28, -12); K.stroke(g, '#fff2c8', 2);
      for (const x of [-12, 2, 16]) { K.sparkle?.(g, x, -x * 0.43 + 1, 5, '#fff2c8'); }
      javelin(g, K, -4, 2, 26, -11, 1.3);
      return true;
    }
    case 'goodRetriever': { // a javelin stuck in the ground, a paw scooping it, a little heart
      K.rr(g, -24, 18, 48, 5, 2); K.paint(g, '#a8d46a', 1.4);
      javelin(g, K, 4, 18, 14, -14, 1.3);
      g.beginPath(); g.ellipse(-8, 4, 8, 7, 0.3, 0, Math.PI * 2); K.paint(g, K.volR(g, FUR, -8, 4, 8, 0.4, 0.3), 1.5);
      for (const [x, y] of [[-14, -1], [-10, -4], [-5, -4]]) { K.circ(g, x, y, 2.2); K.paint(g, FUR_LT, 1); }
      K.heartPath?.(g, 18, -18, 6); if (K.heartPath) K.paint(g, '#ff8fb0', 1.3);
      return true;
    }
    case 'emberleafJavelin': { // a javelin wrapped in emberleaf, glowing, about to burst
      K.glow(g, 6, -4, 22, '#ffb05a', 0.55);
      javelin(g, K, -20, 18, 14, -12, 1.4);
      leaf(g, K, -2, 4, 1.3, -0.7, '#7cc45a'); leaf(g, K, 6, -3, 1.1, 0.6, '#5aa84a');
      for (const [x, y, s] of [[18, -18, 1.1], [22, -6, 0.8], [10, -22, 0.8]]) ember(g, K, x, y, s);
      return true;
    }
    case 'sunshower': { // javelins raining out of a sunny sky
      K.circ(g, -14, -18, 8); K.paint(g, K.volR(g, '#ffd84a', -14, -18, 8, 0.4, 0.3), 1.4); rays(g, K, -14, -18, 10, 15, 8);
      for (const [x, y] of [[-2, -6], [12, -14], [20, 2], [4, 10], [-14, 6]]) javelin(g, K, x - 3, y - 9, x + 3, y + 7, 0.85);
      return true;
    }
    case 'emberBreath': { // Shadow the whelp puffing a cone of embers
      whelpHead(g, K, -12, 0, 0.95, true);
      g.beginPath(); g.moveTo(-2, 8); g.lineTo(28, -6); g.quadraticCurveTo(30, 10, 28, 24); g.closePath(); g.fillStyle = K.lin(g, -2, 8, 28, 8, [[0, 'rgba(255,200,120,0.9)'], [1, 'rgba(255,150,80,0.15)']]); g.fill();
      for (const [x, y, s] of [[10, 8, 1], [18, 2, 0.9], [20, 14, 1.1], [26, 8, 0.8]]) ember(g, K, x, y, s);
      return true;
    }
    case 'bestFriends': { // the dragoon and the whelp, cheek to cheek, a heart between
      goldenHead(g, K, -9, 4, 1.05, 'happy'); whelpHead(g, K, 12, 6, 0.85);
      K.heartPath?.(g, 2, -18, 6); if (K.heartPath) K.paint(g, '#ff8fb0', 1.3);
      return true;
    }
    case 'divebombSwoop': { // the whelp diving, wings tucked, a splash of embers below
      g.save(); g.setLineDash([3, 3]); g.beginPath(); g.moveTo(-24, -22); g.quadraticCurveTo(-4, -20, 4, 4); K.stroke(g, INKC, 2); g.restore();
      wing(g, K, 4, -4, 0.8, -1, -0.6); wing(g, K, 10, -4, 0.8, 1, 0.6);
      whelpHead(g, K, 8, 2, 0.75);
      for (const [x, y, s] of [[-6, 20, 1], [8, 22, 1.1], [20, 20, 0.9]]) ember(g, K, x, y, s);
      return true;
    }
    case 'wingShield': { // the whelp spreading his wings like a shield, sparks bouncing off
      wing(g, K, -2, 2, 1.25, -1, 0.15); wing(g, K, 2, 2, 1.25, 1, 0.15);
      whelpHead(g, K, 0, 6, 0.8);
      for (const k of [-1, 1]) { g.beginPath(); g.moveTo(k * 26, -20); g.lineTo(k * 20, -14); K.stroke(g, INKC, 1.8); }
      return true;
    }
    case 'warmHeart': { // a heart with an ember inside that never goes out
      K.glow(g, 0, 2, 22, '#ffb05a', 0.5);
      if (K.heartPath) { K.heartPath(g, 0, 2, 20); K.paint(g, K.lin(g, 0, -16, 0, 22, [[0, '#ffb0c8'], [1, '#e8507a']]), 1.8); }
      ember(g, K, 0, 4, 1.7);
      return true;
    }
    case 'mightyRoar': { // a tiny roar: the whelp, mouth open, three big sound arcs (and a very small "rawr")
      whelpHead(g, K, -10, 4, 0.95, true);
      for (let i = 0; i < 3; i++) swoosh(g, K, () => { g.beginPath(); g.arc(-6, 6, 14 + i * 7, -0.7, 0.7); }, 2.4 - i * 0.4, '#ffe9a0');
      return true;
    }
    case 'dragonHeart': { // Shadow grown huge: a big whelp silhouette with wings out, a heart of embers
      K.glow(g, 0, 0, 28, '#ffb05a', 0.45);
      wing(g, K, -6, -4, 1.45, -1, 0.35); wing(g, K, 6, -4, 1.45, 1, 0.35);
      whelpHead(g, K, 0, 4, 1.15, true);
      ember(g, K, -18, 20, 1); ember(g, K, 18, 20, 1);
      return true;
    }
  }
  return false;
}
