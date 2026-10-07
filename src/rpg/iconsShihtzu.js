// The Shih Tzu's painted icons (docs/SHIHTZU.md), in rpg/icons.js' look: the flail item art (twelve bases by variant +
// colours [ball, rope, handle]) and his skill art. icons.js calls these with its drawing kit K (ICON_KIT: paint, vol,
// volR, shine, sparkle, glow, drawBone, …), so this module imports nothing from it (no import cycle). Art is drawn
// around 0,0 in a 64 box.
export const STZ_SKILL_TREE = {
  woefulWallop: 'flail', weightOfWorld: 'flail', tugOfWoe: 'flail', maelstrom: 'flail', ironTopknot: 'flail', steadfastSulk: 'flail', heaviestSigh: 'flail',
  drippingPaw: 'hex', lingeringGloom: 'hex', grumbleCloud: 'hex', caseOfMopes: 'hex', grudgeLedger: 'hex', mournfulAwoo: 'hex', everlastingGloom: 'hex',
  ghostPups: 'tome', veryGoodGhosts: 'tome', borrowedWarmth: 'tome', boneWard: 'tome', midnightReading: 'tome', wayhomeLantern: 'tome', grandpawsGhost: 'tome',
};
export const STZ_SKILL_BG = {
  flail: ['#fbeefb', '#c8a0c8', '#6a3a6a'], hex: ['#e6fcf6', '#8edcc8', '#2f7a6a'], tome: ['#eef4fb', '#a8bcd8', '#4a5a7a'],
};
export const STZ_PASSIVE = ['weightOfWorld', 'ironTopknot', 'lingeringGloom', 'grudgeLedger', 'veryGoodGhosts', 'midnightReading'];
const INKC = '#4a2c2a', GHOST = '#5ce0c0', GHOST_LT = '#bff6e6', PLUM = '#7a4a7a', CREAM = '#fffaf0', BALL = '#3a3442';

/** a paw print path (pad + four toes) centred on x, y, about 2s across */
function pawPath(g, x, y, s) {
  g.beginPath(); g.ellipse(x, y + s * 0.32, s * 0.55, s * 0.45, 0, 0, Math.PI * 2);
  for (const [dx, dy, r] of [[-0.62, -0.28, 0.22], [-0.22, -0.62, 0.24], [0.22, -0.62, 0.24], [0.62, -0.28, 0.22]]) { g.moveTo(x + dx * s + r * s, y + dy * s); g.ellipse(x + dx * s, y + dy * s, r * s, r * s * 1.18, 0, 0, Math.PI * 2); }
}
/** the braided rope: a fat plum stroke with darker braid ticks along it */
function rope(g, K, pts, col = PLUM, w = 4.2) {
  const path = () => { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); if (pts.length === 3) g.quadraticCurveTo(pts[1][0], pts[1][1], pts[2][0], pts[2][1]); else g.bezierCurveTo(pts[1][0], pts[1][1], pts[2][0], pts[2][1], pts[3][0], pts[3][1]); };
  path(); K.stroke(g, INKC, w + 2.4); path(); K.stroke(g, col, w);
  g.save(); g.setLineDash([2.2, 2.6]); path(); K.stroke(g, K.D(col, 0.35), w * 0.45); g.restore();
}
/** the rubber-nub ball: a dark rubber ball, round nubs, a teal paw print */
function nubBall(g, K, x, y, r, col = BALL, glowCol = GHOST, v = 'nub') {
  const nubs = v === 'squeak' ? 0 : v === 'bramble' ? 10 : 7;
  for (let i = 0; i < nubs; i++) { const a = i / nubs * Math.PI * 2 + 0.3; K.circ(g, x + Math.cos(a) * r * 0.98, y + Math.sin(a) * r * 0.98, r * (v === 'bramble' ? 0.2 : 0.24)); K.paint(g, K.volR(g, col, x + Math.cos(a) * r, y + Math.sin(a) * r, r * 0.25, 0.4, 0.3), 1.4); }
  K.circ(g, x, y, r); K.paint(g, K.volR(g, col, x, y, r, 0.45, 0.35), 1.9);
  if (v === 'knot') { g.save(); g.beginPath(); K.circ(g, x, y, r); g.clip(); for (const a of [-0.6, 0.5]) { g.beginPath(); g.ellipse(x, y, r * 1.1, r * 0.4, a, 0, Math.PI * 2); K.stroke(g, K.D(col, 0.35), 2); } g.restore(); }
  if (v === 'comet') { g.save(); g.beginPath(); K.circ(g, x, y, r); g.clip(); g.beginPath(); g.arc(x - r * 0.3, y + r * 0.3, r * 0.9, -1.2, 0.6); K.stroke(g, K.L(col, 0.5), 2.2); g.restore(); }
  if (v === 'rawhide') { g.beginPath(); g.moveTo(x - r * 0.8, y - r * 0.2); g.quadraticCurveTo(x, y + r * 0.5, x + r * 0.8, y - r * 0.1); K.stroke(g, K.D(col, 0.3), 1.6); }
  pawPath(g, x, y + r * 0.08, r * 0.46); g.fillStyle = glowCol; g.fill();
  if (v === 'lantern' || v === 'nub') K.glow(g, x, y, r * 1.5, glowCol, 0.35);
  K.shine(g, x - r * 0.38, y - r * 0.45, r * 0.3, r * 0.17, -0.6, 0.85);
}

// ------------------------------------------------------------------ the flail item
export function drawFlail(g, v, cols, noShadow, K, s = 1) {
  const [ball = BALL, ropeC = PLUM, handle = '#f4f0ea'] = cols || [];
  if (!noShadow) K.shadow(g, 25, 18, 3.4);
  g.save(); g.scale(s, s);
  K.drawBone(g, -15, 14, 22, 3.2, 4.4, -0.85, handle, 1.9);
  rope(g, K, [[-8.6, 6.4], [-6, -6], [2, -12], [8, -9]], ropeC, 4);
  nubBall(g, K, 13, -9, 11, ball, v === 'lantern' ? '#ffe9a0' : GHOST, v);
  g.restore();
}

// ------------------------------------------------------------------ skill art
function swoosh(g, K, draw, w = 4, col = CREAM) { draw(); K.stroke(g, INKC, w + 2.6); draw(); K.stroke(g, col, w); }
function tome(g, K, x, y, s) { // his closed spell-tome: plum cover, silver corners, a ghostlight paw clasp
  g.save(); g.translate(x, y); g.scale(s, s);
  K.rr(g, -12, -15, 24, 30, 3.4); K.paint(g, K.vol(g, '#6a3a6a', -12, -15, 12, 15, 0.35, 0.3), 1.9);
  K.rr(g, -9, -12, 18, 24, 2); K.stroke(g, '#c8a0c8', 1.2);
  for (const [cx, cy] of [[-12, -15], [12, -15], [-12, 15], [12, 15]]) { K.circ(g, cx * 0.86, cy * 0.86, 2.4); K.paint(g, '#d8dce6', 1.2); }
  pawPath(g, 0, -1, 4.6); g.fillStyle = GHOST_LT; g.fill();
  g.restore();
}
function ghostPup(g, K, x, y, s, a = 0.95) { // a friendly floppy-eared ghost pup
  g.save(); g.translate(x, y); g.scale(s, s); g.globalAlpha *= a;
  K.glow(g, 0, 0, 16, GHOST, 0.35);
  for (const k of [-1, 1]) { g.beginPath(); g.ellipse(k * 8.6, -2, 3.4, 7, k * 0.35, 0, Math.PI * 2); K.paint(g, '#9fe8d4', 1.4); }
  g.beginPath(); g.moveTo(-8, 0); g.bezierCurveTo(-9, -12, 9, -12, 8, 0); g.lineTo(8, 7); g.quadraticCurveTo(5.5, 10, 4, 7); g.quadraticCurveTo(2, 10, 0, 7); g.quadraticCurveTo(-2, 10, -4, 7); g.quadraticCurveTo(-5.5, 10, -8, 7); g.closePath();
  K.paint(g, K.lin(g, 0, -10, 0, 9, [[0, '#ffffff'], [1, '#bff6e6']]), 1.5);
  for (const k of [-1, 1]) { K.circ(g, k * 3.2, -2.4, 1.6); g.fillStyle = '#2a3a3a'; g.fill(); }
  K.ell(g, 0, 1, 1.5, 1); g.fillStyle = '#2a3a3a'; g.fill();
  g.restore();
}
/** a lumpy cloud (centre x, y; width w), filled `col`, ink-rimmed; face: 'grumpy' | 'sad' | null */
function cloud(g, K, x, y, w, col, face = null) {
  const r = w / 4;
  g.beginPath();
  for (const [dx, dy, rr] of [[-1.25, 0.25, 0.85], [-0.45, -0.45, 1.1], [0.55, -0.35, 1], [1.3, 0.25, 0.8], [0.4, 0.55, 0.85], [-0.55, 0.6, 0.8]]) { g.moveTo(x + dx * r + rr * r, y + dy * r); g.arc(x + dx * r, y + dy * r, rr * r, 0, Math.PI * 2); }
  K.stroke(g, INKC, 3.8); g.fillStyle = K.lin(g, x, y - r * 1.5, x, y + r * 1.4, [[0, K.L(col, 0.45)], [0.6, col], [1, K.D(col, 0.25)]]); g.fill(); // (the ink under the fill: one outline round the whole lump)
  if (face) {
    g.fillStyle = '#2a1f30';
    for (const k of [-1, 1]) { K.ell(g, x + k * r * 0.45, y + r * 0.1, r * 0.13, r * 0.18); g.fill(); }
    g.strokeStyle = '#2a1f30'; g.lineWidth = 1.4; g.lineCap = 'round';
    if (face === 'grumpy') { g.beginPath(); g.moveTo(x - r * 0.75, y - r * 0.3); g.lineTo(x - r * 0.25, y - r * 0.12); g.moveTo(x + r * 0.75, y - r * 0.3); g.lineTo(x + r * 0.25, y - r * 0.12); g.stroke(); }
    g.beginPath(); g.arc(x, y + r * (face === 'sad' ? 0.75 : 0.62), r * 0.28, 1.15 * Math.PI, 1.85 * Math.PI); g.stroke();
  }
}
/** a crescent: the circle (x1, y1, R) with the circle (x2, y2, r) bitten out of it (a path through their intersections) */
function crescent(g, x1, y1, R, x2, y2, r) {
  const dx = x2 - x1, dy = y2 - y1, d = Math.hypot(dx, dy), a = (R * R - r * r + d * d) / (2 * d), h = Math.sqrt(Math.max(0, R * R - a * a));
  const px = x1 + a * dx / d, py = y1 + a * dy / d, ix = -dy / d * h, iy = dx / d * h;
  const A1 = Math.atan2(py + iy - y1, px + ix - x1), A2 = Math.atan2(py - iy - y1, px - ix - x1);
  const B1 = Math.atan2(py + iy - y2, px + ix - x2), B2 = Math.atan2(py - iy - y2, px - ix - x2);
  g.beginPath(); g.arc(x1, y1, R, A1, A2, false); g.arc(x2, y2, r, B2, B1, true); g.closePath();
}
/** a falling ghostlight drop */
function drop(g, K, x, y, s = 1, col = GHOST) {
  g.beginPath(); g.moveTo(x, y - 4 * s); g.quadraticCurveTo(x + 3 * s, y + 0.5 * s, x, y + 2.6 * s); g.quadraticCurveTo(x - 3 * s, y + 0.5 * s, x, y - 4 * s); g.closePath(); K.paint(g, col, 1.1);
}
/** a little musical note */
function note(g, K, x, y, s = 1, col = '#e8dcf0') {
  K.ell(g, x, y, 3.2 * s, 2.4 * s, -0.4); K.paint(g, col, 1.3);
  g.beginPath(); g.moveTo(x + 2.8 * s, y - 0.8 * s); g.lineTo(x + 2.8 * s, y - 11 * s); g.quadraticCurveTo(x + 7 * s, y - 9 * s, x + 6.4 * s, y - 5 * s); K.stroke(g, INKC, 1.6);
}
/** the white topknot tied with its plum band (and a silver bead) */
function topknot(g, K, x, y, s = 1) {
  for (const [dx, dy, r] of [[0, -2, 8], [-5, -8, 6], [5, -9, 6], [0, -14, 5.4]]) { K.circ(g, x + dx * s, y + dy * s, r * s); K.paint(g, K.volR(g, '#fbf7f2', x + dx * s, y + dy * s, r * s, 0.4, 0.2), 1.5); }
  K.rr(g, x - 8 * s, y + 3 * s, 16 * s, 5 * s, 2.2 * s); K.paint(g, K.vol(g, PLUM, x, y + 3 * s, x, y + 8 * s, 0.35, 0.3), 1.5);
  K.circ(g, x, y + 5.5 * s, 2.2 * s); K.paint(g, '#d8dce6', 1.1);
}
/** a lantern: plum frame, pale-teal glass, a ghostlight flame */
function lantern(g, K, x, y, s = 1) {
  K.glow(g, x, y, 22 * s, GHOST, 0.45);
  g.beginPath(); g.arc(x, y - 15 * s, 4 * s, Math.PI, 0); K.stroke(g, INKC, 2.2 * s);
  K.rr(g, x - 9 * s, y - 13 * s, 18 * s, 4 * s, 1.5 * s); K.paint(g, '#6a3a6a', 1.4);
  K.rr(g, x - 7.5 * s, y - 9 * s, 15 * s, 17 * s, 2 * s); K.paint(g, K.lin(g, x, y - 9 * s, x, y + 8 * s, [[0, '#e8fff8'], [1, '#9fe8d4']]), 1.5);
  for (const k of [-1, 1]) { g.beginPath(); g.moveTo(x + k * 7.5 * s, y - 9 * s); g.lineTo(x + k * 7.5 * s, y + 8 * s); K.stroke(g, '#6a3a6a', 2 * s); }
  g.beginPath(); g.moveTo(x, y - 6 * s); g.quadraticCurveTo(x + 4.5 * s, y + 1 * s, x, y + 4 * s); g.quadraticCurveTo(x - 4.5 * s, y + 1 * s, x, y - 6 * s); K.paint(g, GHOST, 1.1);
  K.rr(g, x - 9 * s, y + 8 * s, 18 * s, 4 * s, 1.5 * s); K.paint(g, '#6a3a6a', 1.4);
}
/** an open book (the ledger, the midnight reading): two cream pages in a plum cover */
function openBook(g, K, x, y, s = 1) {
  g.beginPath(); g.moveTo(x - 22 * s, y - 8 * s); g.quadraticCurveTo(x - 11 * s, y - 13 * s, x, y - 8 * s); g.quadraticCurveTo(x + 11 * s, y - 13 * s, x + 22 * s, y - 8 * s); g.lineTo(x + 22 * s, y + 12 * s); g.quadraticCurveTo(x + 11 * s, y + 7 * s, x, y + 12 * s); g.quadraticCurveTo(x - 11 * s, y + 7 * s, x - 22 * s, y + 12 * s); g.closePath();
  K.paint(g, '#6a3a6a', 1.8);
  g.beginPath(); g.moveTo(x - 20 * s, y - 9 * s); g.quadraticCurveTo(x - 10 * s, y - 13 * s, x, y - 9 * s); g.lineTo(x, y + 9 * s); g.quadraticCurveTo(x - 10 * s, y + 5 * s, x - 20 * s, y + 9 * s); g.closePath(); K.paint(g, K.lin(g, x - 20 * s, y, x, y, [[0, '#fffaf0'], [1, '#e8dcc8']]), 1.3);
  g.beginPath(); g.moveTo(x + 20 * s, y - 9 * s); g.quadraticCurveTo(x + 10 * s, y - 13 * s, x, y - 9 * s); g.lineTo(x, y + 9 * s); g.quadraticCurveTo(x + 10 * s, y + 5 * s, x + 20 * s, y + 9 * s); g.closePath(); K.paint(g, K.lin(g, x + 20 * s, y, x, y, [[0, '#fffaf0'], [1, '#e8dcc8']]), 1.3);
}
/** → true when it drew `id` (icons.js falls through to its own art otherwise) */
export function drawShihtzuSkill(g, id, K) {
  switch (id) {
    case 'attack_flail': { // the basic attack with the flail: the flail mid-swing and two whooshes
      for (let i = 0; i < 2; i++) swoosh(g, K, () => { g.beginPath(); g.arc(-6, 8, 22 - i * 6, -2.4 + i * 0.15, -0.6 - i * 0.1); }, 2.6 - i * 0.6);
      drawFlail(g, 'nub', null, true, K, 0.8);
      return true;
    }
    case 'woefulWallop': { // one huge sweeping wallop: a wide whoosh, the ball at its end, a sad little sigh-puff
      swoosh(g, K, () => { g.beginPath(); g.arc(-4, 14, 26, -2.9, -0.35); }, 5.2, '#f6eef8');
      swoosh(g, K, () => { g.beginPath(); g.arc(-4, 14, 18, -2.7, -0.6); }, 2.4, '#e6d0ec');
      nubBall(g, K, 19, 2, 9.5);
      K.drawBone(g, -18, 18, 14, 2.6, 3.6, -0.6, '#f4f0ea', 1.6);
      for (const [x, y, r] of [[-18, -14, 4.6], [-12.5, -17, 3.6], [-22, -18, 3]]) { K.circ(g, x, y, r); K.paint(g, K.volR(g, '#e8e2ee', x, y, r, 0.5, 0.2), 1.3); }
      return true;
    }
    case 'drippingPaw': { // a ghostlight paw print, dripping
      K.glow(g, 0, 0, 26, GHOST, 0.45);
      pawPath(g, 0, -3, 15); g.fillStyle = INKC; g.fill(); g.save(); g.translate(0, 0); pawPath(g, 0, -3, 15); K.stroke(g, INKC, 3); g.restore();
      pawPath(g, 0, -3, 13.4); g.fillStyle = K.lin(g, 0, -18, 0, 12, [[0, GHOST_LT], [1, GHOST]]); g.fill();
      for (const [x, l] of [[-5, 13], [3, 9], [8, 6]]) { g.beginPath(); g.moveTo(x - 2, 6); g.quadraticCurveTo(x - 2.6, 6 + l, x, 8 + l); g.quadraticCurveTo(x + 2.6, 6 + l, x + 2, 6); g.closePath(); K.paint(g, GHOST, 1.4); }
      K.shine(g, -4, -2, 3.2, 1.8, -0.5, 0.8);
      return true;
    }
    // ---------------------------------------------------------------- Flail Arts
    case 'weightOfWorld': { // the heaviest chew toy in the world, sunk into the floor (passive)
      g.beginPath(); g.ellipse(0, 16, 24, 6, 0, 0, Math.PI * 2); K.paint(g, K.lin(g, 0, 10, 0, 22, [[0, '#d8c8b8'], [1, '#a89080']]), 1.6);
      for (const [x0, x1] of [[-20, -12], [12, 21]]) { g.beginPath(); g.moveTo(x0, 15); g.lineTo((x0 + x1) / 2, 18); g.lineTo(x1, 16); K.stroke(g, INKC, 1.4); }
      nubBall(g, K, 0, 1, 14);
      for (const k of [-1, 1]) { g.beginPath(); g.moveTo(k * 21, -12); g.lineTo(k * 21, -2); K.stroke(g, INKC, 2.2); g.beginPath(); g.moveTo(k * 21 - 3, -5); g.lineTo(k * 21, -1); g.lineTo(k * 21 + 3, -5); K.stroke(g, INKC, 2.2); }
      return true;
    }
    case 'tugOfWoe': { // the rope flung out and looped round, hauled back (the chevrons)
      rope(g, K, [[-24, 14], [-8, 14], [2, -2], [12, -6]], PLUM, 3.6);
      g.beginPath(); g.ellipse(13, -6, 9, 6.5, -0.3, 0, Math.PI * 2); K.stroke(g, INKC, 6); g.beginPath(); g.ellipse(13, -6, 9, 6.5, -0.3, 0, Math.PI * 2); K.stroke(g, PLUM, 3.6);
      nubBall(g, K, 19, -14, 7);
      for (const x of [-16, -8]) { g.beginPath(); g.moveTo(x + 4, -16); g.lineTo(x, -11); g.lineTo(x + 4, -6); K.stroke(g, INKC, 4.2); g.beginPath(); g.moveTo(x + 4, -16); g.lineTo(x, -11); g.lineTo(x + 4, -6); K.stroke(g, GHOST_LT, 2); }
      return true;
    }
    case 'maelstrom': { // the ball whirled overhead: a gloom swirl and the ball riding it
      K.glow(g, 0, 0, 26, GHOST, 0.3);
      for (let i = 0; i < 3; i++) swoosh(g, K, () => { g.beginPath(); g.arc(0, 2, 22 - i * 7, -0.2 + i * 2.1, 1.9 + i * 2.1); }, 3.2 - i * 0.5, i ? '#e6dcef' : '#f6eef8');
      K.drawBone(g, -3, 6, 12, 2.2, 3.2, -0.9, '#f4f0ea', 1.4);
      nubBall(g, K, 15, -12, 8);
      return true;
    }
    case 'ironTopknot': { // the topknot that nothing disturbs, ringed in iron (passive)
      K.circ(g, 0, 0, 24); K.paint(g, K.volR(g, '#c8ccd8', 0, 0, 24, 0.35, 0.3), 2);
      K.circ(g, 0, 0, 19); K.paint(g, K.volR(g, '#eef0f6', 0, 0, 19, 0.3, 0.2), 1.4);
      topknot(g, K, 0, 6, 1.05);
      K.shine(g, -11, -13, 4, 2, -0.7, 0.8);
      return true;
    }
    case 'steadfastSulk': { // a small, very offended rain cloud over the flail held up like a shield
      cloud(g, K, 0, -12, 34, '#cfc8dc', 'grumpy');
      for (const [x, y] of [[-8, 4], [0, 8], [8, 3]]) drop(g, K, x, y, 0.9, '#9fe8d8');
      nubBall(g, K, 0, 17, 8);
      for (const k of [-1, 1]) { g.beginPath(); g.arc(0, 17, 12, k > 0 ? -0.5 : Math.PI - 0.6, k > 0 ? 0.6 : Math.PI + 0.5); K.stroke(g, INKC, 1.6); }
      return true;
    }
    case 'heaviestSigh': { // the floor cracked in the shape of a bone, the shockwaves rolling off it
      for (let i = 0; i < 3; i++) { g.beginPath(); g.ellipse(0, 8, 14 + i * 6, 5 + i * 2.6, 0, Math.PI * 1.05, Math.PI * 1.95); K.stroke(g, i ? '#e6dcef' : '#f6eef8', 2.6 - i * 0.6); }
      K.drawBone(g, 0, 10, 30, 3.8, 5.2, 0, '#5a4660', 2.2);
      g.beginPath(); g.moveTo(-11, 10); g.lineTo(11, 10); K.stroke(g, GHOST, 1.6);
      for (const [x, y, a] of [[-19, 12, 2.3], [19, 12, 0.8], [-6, 14, 1.9], [7, 14, 1.2]]) { g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 6, y + Math.sin(a) * 6); g.lineTo(x + Math.cos(a) * 9 + 2, y + Math.sin(a) * 9); K.stroke(g, INKC, 1.4); }
      for (const [x, y, r] of [[-6, -14, 5], [1, -18, 4], [7, -15, 3.4]]) { K.circ(g, x, y, r); K.paint(g, K.volR(g, '#e8e2ee', x, y, r, 0.5, 0.2), 1.3); }
      return true;
    }
    // ---------------------------------------------------------------- Gloom Hexes
    case 'lingeringGloom': { // gloom that stays for tea: a curl of gloom with a teacup-shaped drip (passive)
      const puffs = () => { g.beginPath(); for (const [x, y, r] of [[-10, 4, 9], [2, -4, 11], [12, 6, 8], [-2, 10, 8]]) { g.moveTo(x + r, y); g.arc(x, y, r, 0, Math.PI * 2); } };
      puffs(); K.stroke(g, INKC, 3.4); puffs(); g.fillStyle = K.lin(g, 0, -15, 0, 18, [[0, '#e6e0ee'], [0.6, '#b8b0c8'], [1, '#948aa8']]); g.fill();
      g.beginPath(); g.arc(4, -2, 6, 0.3, Math.PI * 1.6); K.stroke(g, '#6a6078', 1.6);
      drop(g, K, -14, 17, 1); drop(g, K, 15, 18, 0.8);
      return true;
    }
    case 'grumbleCloud': { // the grumpy storm cloud, raining gloom
      K.glow(g, 0, 8, 22, GHOST, 0.25);
      cloud(g, K, 0, -8, 44, '#a8a0bc', 'grumpy');
      for (const [x, y] of [[-14, 12], [-5, 17], [5, 13], [14, 18]]) drop(g, K, x, y, 1);
      return true;
    }
    case 'caseOfMopes': { // a foe with the mopes: a droopy face under its own little rain cloud
      K.circ(g, 0, 9, 15); K.paint(g, K.volR(g, '#d8d2e4', 0, 9, 15, 0.4, 0.3), 1.8);
      for (const k of [-1, 1]) { g.beginPath(); g.arc(k * 5.5, 7, 3, 0.15 * Math.PI, 0.85 * Math.PI); K.stroke(g, INKC, 1.8); }
      g.beginPath(); g.arc(0, 18, 4, 1.15 * Math.PI, 1.85 * Math.PI); K.stroke(g, INKC, 1.8);
      cloud(g, K, 0, -16, 26, '#a8a0bc', null);
      for (const x of [-5, 4]) drop(g, K, x, -6, 0.7, '#9fe8d8');
      return true;
    }
    case 'grudgeLedger': { // the ledger of slights: tally marks and a paw stamp (passive)
      openBook(g, K, 0, 2, 1.05);
      g.strokeStyle = INKC; g.lineWidth = 1.3;
      for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(-17 + i * 3, -3); g.lineTo(-17 + i * 3, 4); g.stroke(); }
      g.beginPath(); g.moveTo(-18.5, 2); g.lineTo(-6, -1.5); g.stroke();
      for (const y of [7, 10]) { g.beginPath(); g.moveTo(-18, y); g.lineTo(-5, y - 0.6); g.stroke(); }
      pawPath(g, 11, 2, 5.4); g.fillStyle = GHOST; g.fill();
      return true;
    }
    case 'mournfulAwoo': { // the long mournful awoo: a crescent moon, rising notes, rings of sound
      K.glow(g, 6, -10, 18, '#e8ecff', 0.4);
      crescent(g, 8, -12, 10, 13, -15.5, 8.6); K.paint(g, K.lin(g, 0, -22, 0, -2, [[0, '#fffbe0'], [1, '#f0e2a8']]), 1.5);
      for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(-14, 18, 10 + i * 7, -1.35, -0.25); K.stroke(g, i % 2 ? '#bff6e6' : '#e8dcf0', 2.4 - i * 0.5); }
      note(g, K, -12, 2, 1); note(g, K, -2, -10, 0.85, GHOST_LT); note(g, K, 14, 10, 0.75);
      return true;
    }
    case 'everlastingGloom': { // the great paw falling, and its hex jumping on in smaller paws
      K.glow(g, -2, -2, 26, GHOST, 0.4);
      pawPath(g, -4, -5, 13.5); g.fillStyle = INKC; g.fill();
      pawPath(g, -4, -5, 12); g.fillStyle = K.lin(g, 0, -18, 0, 10, [[0, GHOST_LT], [1, GHOST]]); g.fill();
      for (const [x, y, s2] of [[13, 10, 4.6], [20, 19, 3.4]]) { pawPath(g, x, y, s2 + 1); g.fillStyle = INKC; g.fill(); pawPath(g, x, y, s2); g.fillStyle = GHOST; g.fill(); }
      g.save(); g.setLineDash([2, 3]); g.beginPath(); g.moveTo(5, 6); g.quadraticCurveTo(10, 2, 12, 6); g.moveTo(16, 13); g.quadraticCurveTo(20, 11, 20, 16); K.stroke(g, '#2f9a86', 1.6); g.restore();
      K.shine(g, -8, -6, 3, 1.7, -0.5, 0.8);
      return true;
    }
    // ---------------------------------------------------------------- Ghostlight Tome
    case 'ghostPups': { // the tome, and the ghost pups tumbling out of it
      tome(g, K, -10, 10, 0.72);
      ghostPup(g, K, 8, -6, 1.05); ghostPup(g, K, -8, -12, 0.75, 0.9);
      return true;
    }
    case 'veryGoodGhosts': { // a very good ghost: a pup with a gold star (passive)
      ghostPup(g, K, -2, 3, 1.35);
      g.save(); K.roundStar(g, 15, -14, 8, 4, 5); K.paint(g, K.volR(g, '#ffd84a', 15, -14, 8, 0.5, 0.25), 1.5); g.restore();
      return true;
    }
    case 'borrowedWarmth': { // two ghostlight threads drawing warmth into a heart
      for (const [x0, y0, cx, cy] of [[-24, -16, -14, 6], [24, -18, 14, 4]]) { g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(cx, cy, 0, 6); K.stroke(g, INKC, 4); g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(cx, cy, 0, 6); K.stroke(g, GHOST, 2.4); }
      for (const [x, y] of [[-15, -4], [13, -6]]) { K.circ(g, x, y, 2.6); K.paint(g, '#ffc8a0', 1); }
      K.glow(g, 0, 8, 16, '#ffc8a0', 0.5);
      g.save(); g.translate(0, 9); g.beginPath(); g.moveTo(0, 9); g.bezierCurveTo(-14, 0, -9, -12, 0, -5); g.bezierCurveTo(9, -12, 14, 0, 0, 9); g.closePath(); K.paint(g, K.lin(g, 0, -10, 0, 9, [[0, '#ffb0c4'], [1, '#e8607a']]), 1.8); g.restore();
      K.shine(g, -4, 5, 2.6, 1.5, -0.6, 0.85);
      return true;
    }
    case 'boneWard': { // the ward: spectral chew-bones circling a ghostlight core
      K.glow(g, 0, 0, 20, GHOST, 0.4);
      K.circ(g, 0, 0, 7); K.paint(g, K.volR(g, '#bff6e6', 0, 0, 7, 0.5, 0.3), 1.4);
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + 0.3; K.drawBone(g, Math.cos(a) * 17, Math.sin(a) * 17, 11, 2, 2.9, a + Math.PI / 2, '#eef8f4', 1.4); }
      return true;
    }
    case 'midnightReading': { // reading by ghostlight under the moon (passive)
      K.glow(g, 0, 4, 22, GHOST, 0.35);
      openBook(g, K, 0, 9, 0.95);
      crescent(g, -10, -14, 8, -6, -16.5, 7); K.paint(g, K.lin(g, 0, -22, 0, -6, [[0, '#fffbe0'], [1, '#f0e2a8']]), 1.4);
      for (const [x, y] of [[8, -18], [16, -10]]) K.sparkle?.(g, x, y, 3.4, '#ffffff', 1);
      return true;
    }
    case 'wayhomeLantern': { // the lantern he sets out for lost pups
      lantern(g, K, 0, 0, 1.25);
      return true;
    }
    case 'grandpawsGhost': { // Grandpaw: a big, kindly old ghost Shih Tzu with spectacles and a droopy moustache
      g.save(); g.translate(0, 2);
      K.glow(g, 0, 0, 28, GHOST, 0.35);
      for (const k of [-1, 1]) { g.beginPath(); g.ellipse(k * 15, 2, 5.4, 11, k * 0.3, 0, Math.PI * 2); K.paint(g, '#8edcc8', 1.5); }
      g.beginPath(); g.moveTo(-13, 2); g.bezierCurveTo(-15, -20, 15, -20, 13, 2); g.lineTo(13, 13); g.quadraticCurveTo(9, 17, 7, 13); g.quadraticCurveTo(3.5, 17, 0, 13); g.quadraticCurveTo(-3.5, 17, -7, 13); g.quadraticCurveTo(-9, 17, -13, 13); g.closePath();
      K.paint(g, K.lin(g, 0, -18, 0, 15, [[0, '#ffffff'], [1, '#bff6e6']]), 1.6);
      for (const k of [-1, 1]) { K.circ(g, k * 5.4, -4, 3.9); K.stroke(g, '#c8ccd8', 1.6); g.beginPath(); g.arc(k * 5.4, -3.5, 1.8, 1.1 * Math.PI, 1.9 * Math.PI); K.stroke(g, '#2a3a3a', 1.3); }
      g.beginPath(); g.moveTo(-1.6, -4); g.lineTo(1.6, -4); K.stroke(g, '#c8ccd8', 1.3);
      g.beginPath(); g.ellipse(0, 10, 4.6, 6, 0, 0, Math.PI * 2); K.paint(g, '#f8fffc', 1.3); // (the beard)
      for (const k of [-1, 1]) { g.beginPath(); g.moveTo(k * 0.8, 1.4); g.bezierCurveTo(k * 6, 0.5, k * 8.5, 5, k * 7.6, 10.5); g.bezierCurveTo(k * 6, 9, k * 3.5, 6, k * 0.8, 4.6); g.closePath(); K.paint(g, K.lin(g, 0, 0, 0, 11, [[0, '#ffffff'], [1, '#d8f6ee']]), 1.4); } // (the droopy moustache)
      K.ell(g, 0, 1, 2.4, 1.7); g.fillStyle = '#2a3a3a'; g.fill();
      for (const [x, y, r] of [[0, -18, 3.6], [-2.5, -21.5, 2.6], [2.4, -22, 2.4]]) { K.circ(g, x, y, r); K.paint(g, '#f8fffc', 1.1); }
      g.restore();
      lantern(g, K, -19, 15, 0.45);
      return true;
    }
    default: return false;
  }
}
