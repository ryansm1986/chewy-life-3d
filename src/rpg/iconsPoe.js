// Poe's painted icons (docs/POE.md), in rpg/icons.js' look: the fūma item art (twelve bases by variant + colours) and
// her skill art. icons.js calls these with its drawing kit K (ICON_KIT: paint, vol, volR, shine, sparkle, glow, …), so
// this module imports nothing from it (no import cycle). Art is drawn around 0,0 in a 64 box.
export const POE_SKILL_TREE = {
  fumaThrow: 'shuriken', shurikenMastery: 'shuriken', kunaiFan: 'shuriken', shadowStitch: 'shuriken', whirlingFuma: 'shuriken', shurikenRain: 'shuriken', thousandStars: 'shuriken',
  smokeBomb: 'jutsu', ninjutsuMastery: 'jutsu', puffBall: 'jutsu', shadowClone: 'jutsu', substitution: 'jutsu', thunderPaw: 'jutsu', smokeDragon: 'jutsu',
  shadowStep: 'shadow', swiftWind: 'shadow', afterimageDash: 'shadow', vanish: 'shadow', caltropFlip: 'shadow', bullseyeMark: 'shadow', phantomBarrage: 'shadow',
};
export const POE_SKILL_BG = {
  shuriken: ['#fff6dc', '#e8c870', '#a88a2a'], jutsu: ['#f2ecff', '#b8a8e0', '#5a4a8a'], shadow: ['#eef6e6', '#9cc48a', '#3d6038'],
};
export const POE_PASSIVE = ['shurikenMastery', 'ninjutsuMastery', 'swiftWind'];
const CREAM = '#fffaf0', BONE = '#f6ecd2', MUSTARD = '#e0b840', INKC = '#4a2c2a';

// ------------------------------------------------------------------ the fūma: four bone arms on the diagonals round a mustard hub
export function drawFuma(g, v, cols, noShadow, K, s = 1) {
  const [blade = BONE, hub = MUSTARD, acc = '#3d6038'] = cols || [];
  if (!noShadow) K.shadow(g, 25, 16, 3.4);
  g.save(); g.scale(s, s); g.rotate(-0.12);
  const bend = v === 'crescent' ? 0.32 : v === 'dragon' || v === 'smoke' ? 0.18 : 0;
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + i * Math.PI / 2 + bend * 0.4;
    g.save(); g.rotate(a);
    if (bend) g.rotate(bend * 0.5);
    K.drawBone(g, 15.5, 0, 21, 3.4, 4.6, bend * 0.6, blade, 1.9);
    // the hinge collar near the hub, in the accent colour
    g.beginPath(); g.ellipse(8.2, 0, 1.5, 4.2, 0, 0, Math.PI * 2); K.paint(g, acc, 1.2);
    if (v === 'bamboo') for (const x of [13, 18]) { g.beginPath(); g.moveTo(x, -3.1); g.lineTo(x, 3.1); K.stroke(g, K.D(blade, 0.35), 1.2); }
    if (v === 'star' || v === 'kitsune') { K.roundStar(g, 27.5, 0, 3.2, 1.5, 5, 0); K.paint(g, acc, 1); }
    g.restore();
  }
  // the hub ring with its six holes
  K.circ(g, 0, 0, 8.2); K.paint(g, K.volR(g, hub, 0, 0, 8.2, 0.55, 0.32), 2);
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + 0.5; K.circ(g, Math.cos(a) * 5.4, Math.sin(a) * 5.4, 1.15); g.fillStyle = K.D(hub, 0.55); g.fill(); }
  K.circ(g, 0, 0, 2.5); g.fillStyle = INKC; g.fill();
  K.shine(g, -3, -3.6, 2.2, 1.2, -0.6, 0.85);
  if (v === 'royal') K.sparkle(g, 21, -20, 3, '#fff6c0');
  g.restore();
}

// ------------------------------------------------------------------ skill art
function ribbon(g, K, draw, w = 4, col = CREAM) { draw(); K.stroke(g, INKC, w + 2.6); draw(); K.stroke(g, col, w); }
function puffs(g, K, list, col = '#f0eaf6') { // a cartoon smoke cloud: overlapping balls, one ink outline
  g.save(); g.fillStyle = INKC; for (const [x, y, r] of list) { K.circ(g, x, y, r + 1.6); g.fill(); } g.restore();
  for (const [x, y, r] of list) { K.circ(g, x, y, r); g.fillStyle = K.volR(g, col, x, y, r, 0.6, 0.18); g.fill(); }
  for (const [x, y, r] of list.slice(0, 3)) K.shine(g, x - r * 0.35, y - r * 0.4, r * 0.3, r * 0.18, -0.6, 0.8);
}
function curl(g, K, x, y, r, col = '#9a8ab8') { g.beginPath(); for (let i = 0; i <= 24; i++) { const t = i / 24, a = t * 4.4 + 0.5, rr = r * (0.25 + 0.75 * t); const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr; i ? g.lineTo(px, py) : g.moveTo(px, py); } K.stroke(g, col, 1.8); }
function inkPuddle(g, K, x, y, rx, ry) { K.ell(g, x, y, rx, ry); g.fillStyle = K.rad(g, x, y, rx, [[0, '#2a2236'], [0.75, '#3a2c4a'], [1, '#6a5a8a']]); g.fill(); K.ell(g, x, y, rx, ry); K.stroke(g, INKC, 1.6); K.ell(g, x - rx * 0.2, y - ry * 0.2, rx * 0.4, ry * 0.25); g.fillStyle = 'rgba(160,140,220,0.45)'; g.fill(); }
function kunai(g, K, x, y, s, rot) {
  g.save(); g.translate(x, y); g.rotate(rot); g.scale(s, s);
  g.beginPath(); g.moveTo(0, -14); g.lineTo(3.6, -4); g.lineTo(1.6, -2.6); g.lineTo(1.6, 6); g.lineTo(-1.6, 6); g.lineTo(-1.6, -2.6); g.lineTo(-3.6, -4); g.closePath();
  K.paint(g, K.vol(g, '#e8ecf4', -4, -14, 4, 6, 0.5, 0.3), 1.6);
  K.circ(g, 0, 8.6, 2.4); K.stroke(g, INKC, 1.6);
  g.restore();
}
function miniStar(g, K, x, y, r) { // a little four-armed bone shuriken
  g.save(); g.translate(x, y); g.rotate(0.4);
  g.beginPath(); for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2, rr = i % 2 ? r * 0.38 : r; const px = Math.cos(a) * rr, py = Math.sin(a) * rr; i ? g.lineTo(px, py) : g.moveTo(px, py); } g.closePath();
  K.paint(g, K.vol(g, BONE, -r, -r, r, r, 0.4, 0.25), Math.max(1.1, r * 0.22));
  K.circ(g, 0, 0, r * 0.22); g.fillStyle = MUSTARD; g.fill();
  g.restore();
}
function pugHead(g, K, x, y, r, col, a = 1) { // a round pug head silhouette with rose ears and a lighter muzzle
  g.save(); g.globalAlpha = a; g.translate(x, y);
  for (const s of [-1, 1]) { K.ell(g, s * r * 0.85, -r * 0.35, r * 0.34, r * 0.46, s * 0.6); K.paint(g, K.D(col, 0.2), 1.6); }
  K.ell(g, 0, 0, r, r * 0.92); K.paint(g, K.volR(g, col, 0, 0, r, 0.35, 0.3), 1.8);
  K.ell(g, 0, r * 0.32, r * 0.48, r * 0.34); g.fillStyle = K.D(col, 0.3); g.fill();
  for (const s of [-1, 1]) { K.circ(g, s * r * 0.38, -r * 0.08, r * 0.14); g.fillStyle = '#c88a3a'; g.fill(); }
  g.restore();
}
function caltrop(g, K, x, y, s) { // a bone caltrop: three stubby spikes on the floor and one pointing up
  g.save(); g.translate(x, y); g.scale(s, s);
  for (const [dx, dy] of [[-5, 2.5], [5, 2.5], [0, -1.5]]) { g.beginPath(); g.moveTo(0, 0); g.lineTo(dx - 1.6, dy); g.lineTo(dx + 1.6, dy); g.closePath(); K.paint(g, BONE, 1.2); }
  g.beginPath(); g.moveTo(-1.8, 0); g.lineTo(0, -7.5); g.lineTo(1.8, 0); g.closePath(); K.paint(g, K.vol(g, BONE, -2, -8, 2, 0, 0.4, 0.2), 1.3);
  g.restore();
}
/** → true when it drew `id` (icons.js falls through to its own art otherwise) */
export function drawPoeSkill(g, id, K) {
  switch (id) {
    case 'attack_fuma': { // basic attack with the fūma: one held fūma and two quick slash arcs
      drawFuma(g, 'bone', null, true, K, 0.62);
      for (let i = 0; i < 2; i++) ribbon(g, K, () => { g.beginPath(); g.arc(-4, 4, 21 - i * 6, -2.6 + i * 0.2, -0.9 - i * 0.1); }, 2.6 - i * 0.6);
      K.sparkle(g, 18, -16, 3, '#fff6c0');
      return true;
    }
    case 'fumaThrow': { // the fūma whirling out on its boomerang loop (out and back)
      g.save(); g.setLineDash([3, 3.4]); g.beginPath(); g.moveTo(-22, 20); g.bezierCurveTo(-8, -22, 26, -16, 10, 4); g.bezierCurveTo(2, 12, -12, 16, -18, 14); K.stroke(g, INKC, 2.1); g.restore();
      g.beginPath(); g.moveTo(-18, 14); g.lineTo(-13, 11); g.moveTo(-18, 14); g.lineTo(-13.4, 17.6); K.stroke(g, INKC, 2.2);
      for (let i = 0; i < 3; i++) ribbon(g, K, () => { g.beginPath(); g.arc(4, -5, 15 + i * 3.4, 2.4 + i * 0.25, 3.3 + i * 0.25); }, 1.8);
      g.save(); g.translate(5, -6); drawFuma(g, 'bone', null, true, K, 0.62); g.restore();
      return true;
    }
    case 'smokeBomb': { // POOF: a big puff with curls, a pepper bomb's spark
      K.glow(g, 0, 4, 26, '#d8cff0', 0.55);
      puffs(g, K, [[-10, 6, 10], [8, 4, 11], [-2, -7, 10], [14, -9, 7], [-16, -6, 6]]);
      curl(g, K, -4, -5, 6); curl(g, K, 10, 4, 5);
      K.circ(g, 15, 18, 5.4); K.paint(g, K.volR(g, '#3a3444', 15, 18, 5.4, 0.45, 0.3), 1.8);
      g.beginPath(); g.moveTo(17, 13.4); g.quadraticCurveTo(20, 9, 23, 10); K.stroke(g, '#c98f5e', 1.6); K.sparkle(g, 23.5, 9.5, 3.4, '#ffd860');
      return true;
    }
    case 'shadowStep': { // gone into the ink and out again behind them: two puddles, a dark swoosh, a crit star
      inkPuddle(g, K, -14, 18, 11, 4.2); inkPuddle(g, K, 14, -2, 10, 3.8);
      ribbon(g, K, () => { g.beginPath(); g.moveTo(-14, 14); g.bezierCurveTo(-12, -14, 8, -22, 14, -6); }, 4.2, '#7a6ab0');
      g.beginPath(); g.moveTo(14, -6); g.lineTo(9, -10); g.moveTo(14, -6); g.lineTo(15.5, -12.4); K.stroke(g, INKC, 2.4);
      ribbon(g, K, () => { g.beginPath(); g.arc(14, -12, 12, -2.2, -0.4); }, 2.4);
      K.roundStar(g, 22, -21, 6, 3, 5); K.paint(g, K.volR(g, '#ffd860', 22, -21, 6, 0.55, 0.3), 1.6);
      return true;
    }
    // ---------------------------------------------------------------- the masteries (passives)
    case 'shurikenMastery': { // a fūma pinned dead centre in a practice target
      for (const [r, c] of [[24, '#f4c04a'], [17, '#fff6e8'], [10, '#e8a020']]) { K.circ(g, 0, 2, r); K.paint(g, c, r === 24 ? 2 : 1.2); }
      g.save(); g.translate(0, 2); drawFuma(g, 'bone', null, true, K, 0.55); g.restore();
      K.sparkle(g, 20, -20, 3.4, '#fff6c0'); K.sparkle(g, -21, -14, 2.4, '#fff6c0');
      return true;
    }
    case 'ninjutsuMastery': { // an open jutsu scroll with a seal sigil glowing over it
      K.glow(g, 0, -6, 20, '#b8a8e0', 0.55);
      K.rr(g, -20, 6, 40, 14, 3); K.paint(g, K.vol(g, '#fff6e2', -20, 6, 20, 20, 0.3, 0.2), 1.8);
      for (const x of [-22, 22]) { K.rr(g, x - 3, 3, 6, 20, 3); K.paint(g, '#c98f5e', 1.6); }
      for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(-13 + i * 9, 10); g.lineTo(-9 + i * 9, 16); K.stroke(g, '#7a6aa8', 1.4); }
      K.circ(g, 0, -9, 11); K.stroke(g, '#7a6aa8', 2.4); for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; g.beginPath(); g.moveTo(Math.cos(a) * 7, -9 + Math.sin(a) * 7); g.lineTo(Math.cos(a) * 10, -9 + Math.sin(a) * 10); K.stroke(g, '#7a6aa8', 1.4); }
      K.circ(g, 0, -9, 3.6); g.fillStyle = '#ffd860'; g.fill();
      return true;
    }
    case 'swiftWind': { // paw prints running off on gusts of wind
      for (const [x, y, s] of [[-14, 14, 0.8], [2, 4, 0.95], [16, -8, 1.1]]) { g.save(); g.translate(x, y); g.scale(s, s); g.rotate(-0.7); K.ell(g, 0, 3, 5, 4.2); K.paint(g, '#3d6038', 1.4); for (const [px, py] of [[-5, -3], [-2, -6.5], [2, -6.5], [5, -3]]) { K.ell(g, px, py, 1.7, 2); g.fillStyle = '#3d6038'; g.fill(); } g.restore(); }
      for (const [y, w] of [[-18, 20], [-11, 14], [20, 16]]) ribbon(g, K, () => { g.beginPath(); g.moveTo(-24, y); g.quadraticCurveTo(-24 + w * 0.5, y - 4, -24 + w, y); }, 1.8);
      return true;
    }
    // ---------------------------------------------------------------- Shuriken Arts
    case 'kunaiFan': { // three kunai fanned out, flying up-right, with speed lines
      for (const [x, y, s] of [[-18, 14, 0.9], [-12, 20, 0.8], [-21, 6, 0.75]]) { g.beginPath(); g.moveTo(x, y); g.lineTo(x - 7 * s, y + 7 * s); K.stroke(g, 'rgba(74,44,42,0.5)', 1.6); }
      kunai(g, K, 2, -2, 1.45, 0.78); kunai(g, K, 10, 8, 1.3, 1.25); kunai(g, K, -6, -12, 1.3, 0.3);
      K.sparkle(g, 22, -20, 3, '#fff6c0');
      return true;
    }
    case 'shadowStitch': { // a foe's shadow pinned to the floor by three kunai, stitched with thread
      inkPuddle(g, K, 0, 14, 22, 8);
      g.save(); g.setLineDash([2.5, 2.5]); g.beginPath(); g.ellipse(0, 14, 15, 5, 0, 0, Math.PI * 2); K.stroke(g, '#e8dcff', 1.6); g.restore();
      for (const [x, y] of [[-10, 12], [10, 12], [0, 18]]) { g.beginPath(); g.moveTo(x - 2.4, y - 2.4); g.lineTo(x + 2.4, y + 2.4); g.moveTo(x + 2.4, y - 2.4); g.lineTo(x - 2.4, y + 2.4); K.stroke(g, '#fffaf0', 1.6); }
      kunai(g, K, -13, -2, 1.15, Math.PI - 0.35); kunai(g, K, 13, -2, 1.15, Math.PI + 0.35); kunai(g, K, 0, -6, 1.25, Math.PI);
      return true;
    }
    case 'whirlingFuma': { // a planted fūma spinning as a buzz-saw: a blur disc, inward arrows, dust
      g.save(); g.setLineDash([3, 3]); g.beginPath(); g.ellipse(0, 16, 24, 7, 0, 0, Math.PI * 2); K.stroke(g, INKC, 1.6); g.restore();
      for (const s of [-1, 1]) { g.beginPath(); g.moveTo(s * 27, 16); g.lineTo(s * 19, 15); K.stroke(g, INKC, 2); g.beginPath(); g.moveTo(s * 19, 15); g.lineTo(s * 22.5, 12.5); g.moveTo(s * 19, 15); g.lineTo(s * 22.5, 18); K.stroke(g, INKC, 2); }
      K.ell(g, 0, 4, 21, 9); g.fillStyle = 'rgba(255,250,240,0.55)'; g.fill(); K.stroke(g, 'rgba(74,44,42,0.5)', 1.4);
      g.save(); g.translate(0, 2); g.scale(1, 0.55); drawFuma(g, 'bone', null, true, K, 0.66); g.restore();
      for (let i = 0; i < 3; i++) ribbon(g, K, () => { g.beginPath(); g.ellipse(0, 4, 17 + i * 3, 7 + i * 1.3, 0, 3.4 + i * 0.4, 4.6 + i * 0.4); }, 1.4);
      return true;
    }
    case 'shurikenRain': { // tiny bone shuriken falling on a target ring
      g.save(); g.setLineDash([3, 3]); g.beginPath(); g.ellipse(2, 18, 22, 7, 0, 0, Math.PI * 2); K.stroke(g, '#c8901a', 1.8); g.restore();
      for (const [x, y, s] of [[-14, -16, 0.8], [6, -20, 0.9], [18, -6, 0.75], [-4, -2, 1], [10, 8, 0.85]]) {
        g.beginPath(); g.moveTo(x - 9 * s, y - 11 * s); g.lineTo(x - 2, y - 2.5); K.stroke(g, 'rgba(74,44,42,0.45)', 1.5);
        miniStar(g, K, x, y, 6.5 * s);
      }
      return true;
    }
    case 'thousandStars': { // a spiral galaxy of little shuriken round a golden middle
      K.glow(g, 0, 0, 26, '#ffd860', 0.55);
      for (let arm = 0; arm < 3; arm++) for (let i = 0; i < 4; i++) { const t = i / 3, a = arm * Math.PI * 2 / 3 + t * 2.3, r = 6 + t * 18; miniStar(g, K, Math.cos(a) * r, Math.sin(a) * r, 3.2 + t * 2.6); }
      g.beginPath(); for (let i = 0; i <= 30; i++) { const t = i / 30, a = t * 2.3, r = 6 + t * 18; const x = Math.cos(a) * r, y = Math.sin(a) * r; i ? g.lineTo(x, y) : g.moveTo(x, y); } K.stroke(g, 'rgba(255,250,240,0.7)', 1.6);
      K.circ(g, 0, 0, 5); K.paint(g, K.volR(g, MUSTARD, 0, 0, 5, 0.6, 0.3), 1.6);
      return true;
    }
    // ---------------------------------------------------------------- Ninjutsu
    case 'puffBall': { // a round bouncing fireball with a dotted hop and a flame tail
      g.save(); g.setLineDash([2.5, 3]); g.beginPath(); g.moveTo(-26, 20); g.quadraticCurveTo(-18, 2, -10, 18); g.quadraticCurveTo(-4, 6, 2, 14); K.stroke(g, INKC, 1.6); g.restore();
      for (const [x, y, r] of [[-6, 2, 6], [-12, 6, 4.5], [-17, 9, 3]]) { K.circ(g, x, y, r); g.fillStyle = '#ffb04a'; g.fill(); }
      K.circ(g, 8, -2, 14); K.paint(g, K.rad(g, 8, -2, 14.5, [[0, '#fff6c0'], [0.35, '#ffd060'], [0.75, '#ff8a3a'], [1, '#e8503a']], 3, -7), 2);
      for (const [x, y] of [[0, -14], [9, -18], [17, -12]]) { g.beginPath(); g.moveTo(x - 3, y + 4); g.quadraticCurveTo(x, y - 6, x + 3, y + 4); g.closePath(); K.paint(g, '#ff8a3a', 1.4); }
      K.shine(g, 3, -7, 3.6, 2.2, -0.6, 0.85);
      return true;
    }
    case 'shadowClone': { // her round head and two smoky copies POOFing out either side
      puffs(g, K, [[-16, 18, 7], [16, 18, 7], [0, 21, 6]], '#ece6f6');
      for (const s of [-1, 1]) pugHead(g, K, s * 15, 2, 9, '#7a6ab0', 0.75);
      pugHead(g, K, 0, -4, 12, '#3a3530', 1);
      return true;
    }
    case 'substitution': { // a chew-toy log in a puff of smoke, and the curved hop she made away from it
      puffs(g, K, [[-12, 6, 9], [-2, 2, 8], [-18, -4, 6]], '#ece6f6');
      g.save(); g.translate(-8, 12); g.rotate(-0.25);
      K.rr(g, -15, -6, 30, 12, 6); K.paint(g, K.vol(g, '#b07a4a', -15, -6, 15, 6, 0.4, 0.3), 1.8);
      K.ell(g, 15, 0, 3.6, 6); K.paint(g, '#f0d8a8', 1.6); K.ell(g, 15, 0, 1.6, 2.8); K.stroke(g, '#8a5a34', 1);
      for (const x of [-6, 2]) { g.beginPath(); g.moveTo(x, -6); g.lineTo(x, 6); K.stroke(g, '#8a5a34', 1.2); }
      K.circ(g, -9, -7.5, 2.2); K.paint(g, '#ff8fb0', 1);
      g.restore();
      g.save(); g.setLineDash([3, 3]); g.beginPath(); g.moveTo(-2, -6); g.quadraticCurveTo(10, -26, 22, -10); K.stroke(g, INKC, 2); g.restore();
      g.beginPath(); g.moveTo(22, -10); g.lineTo(16, -12); g.moveTo(22, -10); g.lineTo(21, -16); K.stroke(g, INKC, 2.2);
      K.sparkle(g, 24, -4, 3, '#fff6c0');
      return true;
    }
    case 'thunderPaw': { // a glowing paw print with a lightning bolt dropping onto it
      K.glow(g, 0, 10, 24, '#fff27a', 0.5);
      g.save(); g.translate(0, 13); g.scale(1, 0.6);
      K.ell(g, 0, 4, 11, 9); K.paint(g, '#ffe070', 2); for (const [x, y] of [[-11, -8], [-4, -13], [4, -13], [11, -8]]) { K.ell(g, x, y, 4, 4.6); K.paint(g, '#ffe070', 2); }
      g.restore();
      g.beginPath(); g.moveTo(4, -28); g.lineTo(-6, -8); g.lineTo(1, -8); g.lineTo(-5, 8); g.lineTo(9, -12); g.lineTo(2, -12); g.lineTo(10, -28); g.closePath();
      K.paint(g, K.vol(g, '#fff27a', -6, -28, 10, 8, 0.5, 0.25), 2);
      K.sparkle(g, -16, -10, 3, '#ffffff'); K.sparkle(g, 18, 2, 2.6, '#ffffff');
      return true;
    }
    case 'smokeDragon': { // a smoke dragon uncoiling in an S, its round cloud head leading
      const body = [[-22, 20, 6], [-15, 14, 7], [-8, 16, 7.5], [-1, 10, 8], [4, 2, 8]];
      puffs(g, K, body, '#e8e0f4');
      K.circ(g, 12, -10, 12); K.paint(g, K.volR(g, '#efe8fa', 12, -10, 12, 0.6, 0.18), 2);
      for (const [x, y, r] of [[2, -18, 5], [12, -22, 5.5], [21, -17, 4.8]]) { K.circ(g, x, y, r); K.paint(g, '#d8ccf0', 1.6); }
      for (const s of [-1, 1]) { K.ell(g, 12 + s * 4.5, -10, 2, 2.7); g.fillStyle = INKC; g.fill(); }
      g.beginPath(); g.arc(12, -5, 3.5, 0.3, Math.PI - 0.3); K.stroke(g, INKC, 1.6);
      for (const s of [-1, 1]) { g.beginPath(); g.moveTo(12 + s * 6, -6); g.quadraticCurveTo(12 + s * 14, -4, 12 + s * 17, 2); K.stroke(g, INKC, 1.5); }
      return true;
    }
    // ---------------------------------------------------------------- Shadow Step
    case 'afterimageDash': { // three of her in a row, fading into smoke behind the leader, with speed streaks
      for (const [x, a] of [[-16, 0.35], [-6, 0.6]]) pugHead(g, K, x, 2, 10, '#7a6ab0', a);
      pugHead(g, K, 8, 0, 11, '#3a3530', 1);
      for (const y of [-6, 4, 12]) { g.beginPath(); g.moveTo(-26, y); g.lineTo(-12, y); K.stroke(g, 'rgba(74,44,42,0.55)', 1.6); }
      return true;
    }
    case 'vanish': { // she's there… a dashed outline, a few sparkles and a puff
      g.save(); g.setLineDash([3, 2.6]); g.beginPath(); g.ellipse(0, 0, 14, 12.5, 0, 0, Math.PI * 2); K.stroke(g, '#7a6ab0', 2); for (const s of [-1, 1]) { g.beginPath(); g.ellipse(s * 13, -4, 4, 6, s * 0.5, 0, Math.PI * 2); K.stroke(g, '#7a6ab0', 1.8); } g.restore();
      for (const [x, y, r] of [[-16, -16, 3], [18, -10, 2.6], [12, 18, 2.4], [-14, 14, 2]]) K.sparkle(g, x, y, r, '#cfd8ff');
      puffs(g, K, [[-6, 20, 5], [5, 21, 5.5]], '#ece6f6');
      return true;
    }
    case 'caltropFlip': { // a backflip arc over a scatter of bone caltrops
      g.save(); g.setLineDash([3, 3]); g.beginPath(); g.arc(4, 2, 18, Math.PI * 1.05, Math.PI * 2.05); K.stroke(g, INKC, 2); g.restore();
      g.beginPath(); g.moveTo(22, 3); g.lineTo(18, -2); g.moveTo(22, 3); g.lineTo(24.5, -3); K.stroke(g, INKC, 2.2);
      for (const [x, y, s] of [[-14, 18, 1], [0, 21, 1.1], [13, 17, 0.9], [-4, 13, 0.8]]) caltrop(g, K, x, y, s);
      return true;
    }
    case 'bullseyeMark': { // a red and cream target with a tiny brush painting it
      for (const [r, c] of [[17, '#e8503a'], [12, '#fff6e8'], [7.5, '#e8503a'], [3.2, '#fff6e8']]) { K.circ(g, -2, 4, r); K.paint(g, c, r === 17 ? 2 : 0); }
      g.save(); g.translate(14, -12); g.rotate(0.7);
      K.rr(g, -2, -10, 4, 16, 2); K.paint(g, '#c98f5e', 1.6); K.rr(g, -2.5, 4, 5, 3, 1); K.paint(g, '#d8b040', 1.2);
      g.beginPath(); g.moveTo(-2.5, 7); g.quadraticCurveTo(0, 15, 2.5, 7); g.closePath(); K.paint(g, '#e8503a', 1.4);
      g.restore();
      for (const [x, y] of [[8, 0], [5, 4]]) { K.circ(g, x, y, 1.6); g.fillStyle = '#e8503a'; g.fill(); }
      return true;
    }
    case 'phantomBarrage': { // a flurry of crossing cuts from every side over an ink puddle, a crit star
      inkPuddle(g, K, 0, 18, 18, 6);
      for (const [a, r] of [[-0.6, 22], [0.5, 20], [1.6, 21], [2.6, 19]]) ribbon(g, K, () => { g.beginPath(); g.moveTo(Math.cos(a) * r, Math.sin(a) * r * 0.8 - 2); g.lineTo(-Math.cos(a) * r, -Math.sin(a) * r * 0.8 - 2); }, 2.4);
      K.roundStar(g, 16, -18, 6, 3, 5); K.paint(g, K.volR(g, '#ffd860', 16, -18, 6, 0.55, 0.3), 1.6);
      return true;
    }
  }
  // (any other id: its tree's emblem, so the K panel always reads)
  const t = POE_SKILL_TREE[id];
  if (!t) return false;
  if (t === 'shuriken') { drawFuma(g, 'bone', null, true, K, 0.78); return true; }
  if (t === 'jutsu') { puffs(g, K, [[-8, 4, 10], [8, 2, 10.5], [0, -8, 9]]); curl(g, K, 0, -4, 6); return true; }
  kunai(g, K, -6, 2, 1.5, 0.7); kunai(g, K, 8, 0, 1.3, -0.5); return true;
}
