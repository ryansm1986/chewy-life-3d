// Homes (zone R): L1 tiny cottage 2x2, L2 porch house 3x3, L3 two-storey blossom villa 3x3.
// Variant (seed mod 8) picks roof style/colour, wall tint, door, windows and yard props.
// Exterior styles (styles.js, docs/HOUSING.md §6): a remodelled home reads B.style through lookOf(), every field falling
// back to the variant's own choice. With no style each builder takes exactly the village's own path; a styled part whose
// structure differs (another door, window, roof shape or fence) goes through swap(), so a remodel keeps the yard as it was.
import { C, G, PI, ROOF_LIST, WALL_TINTS, ROOFS, shade, mixc } from './kit.js';
import { roof } from './roofs.js';
import { foundation, walls, onFace, shoji, roundWindow, latticeWindow, door, doorway, noren, norenMark, engawa, posts, chimney, stepStones, flowerBox, hood, fence, bunting, FLOWERS } from './parts.js';
import { chochin, pot, barrel, crate, bush, tree, flowerPatch, mailbox } from './props.js';
import { choppingBlock, firewood, laundry, wateringCan, hedge, veggieBed } from './props2.js';
import { fenceSection } from './decor.js';
import { eaveCharm, charm, broom, stoopStone, rainChain, futon, asagao, weeds } from './trim.js';
import { styleOf } from './styles.js';
import { mulberry32 } from '../../core/util.js';

const CHARMS = ['teru', 'garlic', 'persimmon', 'gourd', 'furin', 'teru'];
// zabuton cushion + tea tray set out on an engawa (local, deck top at y=0)
function teaSet(B) {
  const cush = G.box(0.3, 0.05, 0.3, 0.02); cush.translate(0, 0.025, 0); B.add(cush, B.dpick(['#e86a6a', '#6a8ac8', '#8ac070', '#e8a04a']));
  const tray = G.box(0.26, 0.02, 0.18, 0); tray.translate(0.34, 0.01, 0.02); B.add(tray, C.woodDark);
  const pot = G.sph(0.05, 7, 5); pot.scale(1, 0.85, 1); pot.translate(0.3, 0.06, 0.02); B.add(pot, '#8aa88a');
  const cup = G.cyl(0.022, 0.018, 0.04, 6); cup.translate(0.4, 0.04, 0.04); B.add(cup, '#fff6ea');
}

export const LAMP = { color: '#ffb468', intensity: 3.2, radius: 5.5, flicker: 0.6, nightOnly: true };
const mossOf = c => (c === ROOFS.slate || c === ROOFS.teal || c === ROOFS.moss ? 0.35 : 0.05);

// small yard props at [x,z] spots
export function yardProps(B, spots) {
  for (const [x, z] of spots) {
    const k = B.int(0, 5);
    B.at([x, 0, z], B.rand(0, PI * 2), () => {
      if (k === 0) pot(B, { plant: 'flowers', flowers: [B.pick(FLOWERS), B.pick(FLOWERS)] });
      else if (k === 1) barrel(B, { r: 0.16, h: 0.34 });
      else if (k === 2) crate(B, { s: 0.3 });
      else if (k === 3) bush(B, { r: 0.26, flowers: B.chance(0.6) ? [B.pick(FLOWERS)] : null });
      else if (k === 4) pot(B, { plant: 'pine', r: 0.15, color: '#7a8aa8' });
      else flowerPatch(B, { w: 0.5, d: 0.4, n: 6 });
    });
  }
}

// ------------------------------------------------------------------ exterior styles
// The resolved look of a home: colours with the variant's own fallbacks, and the timber family of a chosen trim (frames,
// posts, beams and railings take the trim; brackets, deck beams, the noren rod and gable timbers a deeper tone of it;
// decks, flower boxes and the koshi wainscot a paler one). With no style every value is the old default.
const lum = c => { const x = parseInt(c.slice(1), 16); return ((x >> 16) * 0.299 + ((x >> 8) & 255) * 0.587 + (x & 255) * 0.114) / 255; };
function lookOf(B, own) {
  const S = styleOf(B), raw = S.raw, tr = raw.trim != null;
  const frame = S.trim(C.timber), wall = S.wall(own.wall), dark = tr ? mixc(frame, '#4a3228', 0.32) : C.woodDark;
  const doorWood = S.doorColor(C.woodLight);
  return {
    S, raw, roof: S.roof(own.roof), wall, frame, dark, doorWood,
    doorPanel: raw.doorColor != null ? shade(doorWood, 0.8) : frame,
    deck: tr ? mixc(C.woodLight, frame, 0.35) : C.woodLight,
    boxWood: tr ? mixc(frame, C.woodMid, 0.4) : undefined,
    // (pale trims: the boards a weathered shade darker, so they still read against light plaster)
    koshi: k => (tr && k ? (lum(frame) > 0.7 ? mixc(shade(frame, 0.86), '#c8b8a8', 0.2) : mixc(frame, '#f2dcc0', 0.18)) : k),
    roofX: { under: tr ? mixc('#9a6a52', frame, 0.5) : undefined, timber: tr ? dark : undefined, gableWood: tr ? mixc(C.woodMid, frame, 0.6) : undefined, gableColor: raw.wall != null ? wall : undefined },
  };
}

const scratch = () => ({ buckets: { body: [], glow: [], hot: [], cloth: [], leaf: [], water: [], jet: [] } });
// build fn on random streams of its own (salt: the call site), leaving the Builder's main and detail streams untouched
function iso(B, fn, salt) {
  const r = B.r, dr = B._dr;
  B.r = mulberry32((B.seed * 2654435761 + salt * 40503) >>> 0); B._dr = mulberry32((B.seed * 2246822519 + salt * 69069 + 1) >>> 0);
  try { return fn(); } finally { B.r = r; B._dr = dr; }
}
// A styled part whose structure differs from the variant's own. The Builder's two random streams also place everything
// built after it (yard props, trees, stones, trim), so the own part is first replayed into a scratch bucket (the streams
// advance exactly as in the unstyled build: a remodel never reshuffles the yard), then the chosen part is built on
// streams of its own. Lights, smoke and animated parts the replay registered are dropped.
function swap(B, own, styled, salt) {
  if (own) {
    const cur = B.cur, nl = B.lights.length, ns = B.smoke.length, na = B.anims.length;
    B.cur = scratch();
    try { own(); } finally { B.cur = cur; B.lights.length = nl; B.smoke.length = ns; B.anims.length = na; }
  }
  return styled ? iso(B, styled, salt) : undefined;
}

// A window opening in the current face frame. o.own: the variant's kind ('shoji' with w, h | 'round' with r); the style
// may ask for shoji, round or lattice (a lattice with o.bay stands out from the wall under a little tiled cap).
function buildWin(B, Lk, kind, o) {
  const w = o.w ?? o.r * 2 + 0.1, h = o.h ?? o.r * 2 - 0.04, frame = Lk.frame, boxWood = Lk.boxWood;
  if (kind === 'round') return roundWindow(B, { r: o.r ?? Math.min(0.3, h * 0.56, w * 0.5), lattice: 'fine', box: o.box, flowers: o.flowers, frame, boxWood });
  if (kind === 'lattice') return latticeWindow(B, { w, h, frame, bay: o.bay, roof: Lk.roof, wood: Lk.dark, box: o.box, flowers: o.flowers, boxWood });
  return shoji(B, { w, h, box: o.box, flowers: o.flowers, frame, boxWood });
}
function windowAt(B, Lk, o, salt) {
  const kind = Lk.S.window(o.own);
  if (kind === o.own) return buildWin(B, Lk, kind, o);
  swap(B, () => buildWin(B, Lk, o.own, o), () => buildWin(B, Lk, kind, o), salt);
}
// The front door: the variant's own door() while no door style or colour is chosen (a chosen trim only recolours it),
// else a remodel doorway() of the chosen (or the own) style in the chosen colour. o: { w, h, own }
function doorAt(B, Lk, o, salt) {
  const own = () => door(B, { w: o.w, h: o.h, style: o.own, frame: Lk.frame, wood: C.woodLight });
  if (Lk.raw.door == null && Lk.raw.doorColor == null) return own();
  swap(B, own, () => doorway(B, { w: o.w, h: o.h, style: Lk.raw.door ?? o.own, frame: Lk.frame, wood: Lk.doorWood, panel: Lk.doorPanel }), salt);
}
// The noren over the door. own: { color, sym } or null (the variant has none); the style recolours it, changes its
// crest, takes it down ('none') or hangs one where there was none (crest defSym unless one is chosen).
function norenAt(B, Lk, own, o, defSym, salt) {
  const color = Lk.S.noren(own ? own.color : null), sym = Lk.S.norenSym(own ? own.sym : defSym);
  const mk = (c, s) => () => noren(B, { w: o.w, h: o.h, y: o.y, z: o.z, color: c, strips: 2, symbol: () => norenMark(s), symScale: o.symScale, rod: Lk.dark });
  if (!!color === !!own) { if (color) mk(color, sym)(); return; }
  swap(B, own ? mk(own.color, own.sym) : null, color ? mk(color, sym) : null, salt);
}
// The roof: own / styled = roof() options. A different shape (or moss, which draws on the detail stream) is swapped;
// geoAt then rebuilds whatever hangs off the roof's geometry (chimney courses, rain-chain cups) the same way.
function roofAt(B, own, styled, salt) {
  const same = own.type === styled.type && (own.ridge ?? 'x') === (styled.ridge ?? 'x') && (own.moss ?? 0) === (styled.moss ?? 0);
  if (same) { const info = roof(B, styled); return { info, own: info, swapped: false }; }
  let oi; const info = swap(B, () => { oi = roof(B, own); }, () => roof(B, styled), salt);
  return { info, own: oi, swapped: true };
}
function geoAt(B, R, fn, salt) { if (!R.swapped) fn(R.info); else swap(B, () => fn(R.own), () => fn(R.info), salt); }

// Yard fences: the variant's own fence or hedge (ownFn), or a run of the chosen style in the chosen colour from x0 to x1
// along the current frame's x (face to +z; flip turns it round; dz moves it out, clear of the foundation stones).
// Hedges take the fence colour as their flowers.
const HEDGE_FLOWERS = { white: ['#ffffff', '#fff0f6', '#ffe8f0'], pink: ['#ffb0d0', '#ff8fb8', '#ffd0e4'], sea: ['#8fb8ec', '#a8a0e8', '#bcd4f4'] };
function fenceRun(B, Lk, kind, x0, x1, h, flip, dz = 0) {
  if (flip) return B.at([0, 0, 0], PI, () => fenceRun(B, Lk, kind, -x1, -x0, h, false, dz));
  if (dz) return B.at([0, 0, dz], 0, () => fenceRun(B, Lk, kind, x0, x1, h, false, 0));
  const cid = Lk.raw.fenceColor;
  if (kind === 'hedge') return hedge(B, x0, x1, { h: h * 0.72, d: 0.24, color: cid === 'dark' ? '#3f7440' : undefined, flowers: HEDGE_FLOWERS[cid] || null });
  const L = x1 - x0, n = Math.max(1, Math.round(L / 0.85)), seg = L / n, color = Lk.S.fenceColor(null);
  for (let i = 0; i < n; i++) B.at([x0 + (i + 0.5) * seg, 0, 0], 0, () => fenceSection(B, kind, h, color, { L: seg, left: i === 0, right: i === n - 1 }));
}
function fenceAt(B, Lk, ownKind, ownFn, [x0, x1, h, flip = false, dz = 0], salt) {
  const kind = Lk.S.fence(ownKind);
  if (kind === ownKind && Lk.raw.fenceColor == null) return ownFn();
  swap(B, ownFn, () => fenceRun(B, Lk, kind, x0, x1, h, flip, dz), salt);
}

export function homeL1(B) {
  const v = B.variant;
  const roofOwn = ROOF_LIST[(v * 3 + 1) % 5], wallOwn = WALL_TINTS[(v * 5 + 2) % WALL_TINTS.length];
  const Lk = lookOf(B, { roof: roofOwn, wall: wallOwn }), roofCol = Lk.roof;
  const w = 1.42, d = 1.2, h = 1.4, y0 = 0.24, zc = -0.14;
  const style = v % 3; // 0 hip, 1 gable facing front, 2 gable along x
  const side = v & 1 ? 1 : -1;
  // the roof the style asks for: a hip cottage turned gable shows its gable to the street (a machiya keeps its eaves
  // to the street); irimoya on this little roof is a hip with gable ends
  const ownType = style === 0 ? 'hip' : 'gable', ownRidge = style === 1 ? 'z' : 'x';
  const type = Lk.S.roofType(ownType);
  const ridge = type !== 'gable' || ownType === 'gable' ? ownRidge : Lk.raw.set === 'machiya' ? 'x' : 'z';
  const front = type === 'gable' && ridge === 'z'; // the gable end faces the street (no door hood)
  B.push([0, 0, zc]);
  foundation(B, { w, d, h: y0 });
  const koshi = Lk.koshi(v % 4 < 2 ? B.pick(['#c9a27a', '#b88e6a', '#d8b48a']) : null);
  walls(B, { w, d, h, y0, plaster: Lk.wall, frame: Lk.frame, koshi, koshiSkip: ['f'] });
  const blk = { w, d };
  const dx = side * 0.3;
  onFace(B, blk, 'f', dx, y0, () => {
    doorAt(B, Lk, { w: 0.62, h: 1.12, own: ['shoji', 'round', 'wood'][(v >> 1) % 3] }, 11);
    const ownHood = style !== 1, hd = () => hood(B, 0.95, 1.28, roofCol, 0.34, Lk.dark);
    if (ownHood === !front) { if (ownHood) hd(); } else swap(B, ownHood ? () => hood(B, 0.95, 1.28, roofOwn) : null, front ? null : hd, 12);
    norenAt(B, Lk, null, { w: 0.56, h: 0.34, y: 1.2, z: 0.17, symScale: 0.15 }, ['sakura', 'leaf', 'flower', 'heart'][v % 4], 13);
  });
  onFace(B, blk, 'f', -side * 0.36, y0 + 0.84, () => windowAt(B, Lk, { own: 'shoji', w: 0.44, h: 0.42, box: true, bay: true }, 21));
  onFace(B, blk, 'r', 0, y0 + 0.84, () => windowAt(B, Lk, v % 2 ? { own: 'round', r: 0.24, box: true } : { own: 'shoji', w: 0.56, h: 0.44, box: true }, 22));
  onFace(B, blk, 'l', 0.1, y0 + 0.84, () => windowAt(B, Lk, { own: 'shoji', w: 0.5, h: 0.42 }, 23));
  onFace(B, blk, 'b', 0, y0 + 0.84, () => windowAt(B, Lk, { own: 'shoji', w: 0.5, h: 0.42 }, 24));
  const rb = { w, d, y0: y0 + h, over: 0.34, gOver: 0.24, curve: 0.4, lift: 0.18, liftW: 0.5, thick: 0.13, ribW: 0.24, ribAmp: 0.035, course: 0.28, courseAmp: 0.028 };
  const R = roofAt(B,
    { ...rb, type: ownType, ridge: ownRidge, H: style === 0 ? 0.72 : 0.7, color: roofOwn, moss: mossOf(roofOwn) },
    { ...rb, type, ridge, H: type === 'gable' ? 0.7 : 0.72, color: roofCol, moss: mossOf(roofCol), tg: 0.62, ...Lk.roofX }, 31);
  const info = R.info;
  if (v % 2 === 0) geoAt(B, R, I => chimney(B, -side * 0.35, -0.26, I.yAt(-side * 0.35, -0.26) - 0.25, I.ridgeY + 0.02, 0.85), 32);
  B.at([dx + side * 0.48, y0 + h + 0.02, d / 2 + 0.22], 0, () => chochin(B, { r: 0.1, h: 0.2, cord: 0.08, color: v % 4 === 3 ? C.pink : C.red }));
  B.light([dx + side * 0.48, 1.25, d / 2 + 0.3], LAMP);
  // a humble cottage's touches: a charm under the eave, a door stone, a broom against the side wall
  eaveCharm(B, info, -side * 0.5, d / 2 + 0.16, CHARMS[(v + 1) % CHARMS.length]);
  stoopStone(B, dx, y0 * 0.7, d / 2 + 0.2, 0.48);
  onFace(B, blk, side > 0 ? 'r' : 'l', side > 0 ? 0.4 : -0.4, 0, () => B.at([0, 0, 0.1], 0, () => broom(B), 1, 0, side * 0.12));
  // morning glories climbing strings up to the side window on some cottages; weeds at the wall foot on all
  if (v % 4 === 2) onFace(B, blk, 'l', 0.1, 0, () => B.at([0, 0, 0.16], 0, () => asagao(B, 0.56, y0 + 1.1)));
  for (const f of v % 4 === 2 ? ['b'] : ['b', 'l']) onFace(B, blk, f, 0, 0, () => B.at([0, 0, 0.14], 0, () => weeds(B, f === 'b' ? w - 0.3 : d - 0.3, 3)));
  // festival bunting: down the barge boards of a street gable, else along the front eave
  if (Lk.S.bunting) iso(B, () => {
    if (front) { const zf = d / 2 + 0.2, X = w / 2 + 0.24; bunting(B, [[-X, info.underAt(-X, zf) - 0.04, zf], [0, info.underAt(0, zf) - 0.07, zf], [X, info.underAt(X, zf) - 0.04, zf]], { sag: 0.05, size: 0.13, gap: 0.14 }); }
    else { const zf = d / 2 + 0.31, X = w / 2 + 0.22; bunting(B, [[-X, info.underAt(-X, zf) - 0.04, zf], [X, info.underAt(X, zf) - 0.04, zf]], { sag: 0.16, size: 0.13, gap: 0.14 }); }
  }, 41);
  B.pop();
  stepStones(B, dx, zc + d / 2 + 0.3, dx + 0.1, 0.98, 2);
  // a lived-in yard: firewood by the chimney wall, the axe left in its block, a low hedge or a mailbox out front
  if (v % 2 === 0) B.at([-side * 0.84, 0, zc - 0.05], -side * PI / 2, () => firewood(B, { w: 0.62, h: 0.4, d: 0.2 }));
  if (v % 4 === 0) B.at([-side * 0.68, 0, 0.7], B.rand(0, 1), () => choppingBlock(B));
  else if (v % 4 === 3) {
    const x0 = side > 0 ? -0.95 : 0.25, x1 = side > 0 ? -0.25 : 0.95;
    B.at([0, 0, 0.9], 0, () => fenceAt(B, Lk, 'hedge', () => hedge(B, x0, x1, { h: 0.3, d: 0.22, flowers: ['#ffb0d0', '#ffffff'] }), [x0, x1, 0.42], 51));
  } else yardProps(B, [[-side * 0.72, 0.72]]);
  yardProps(B, [[side * 0.8, -0.8]]);
  if (v % 2 === 1) B.at([side * 0.84, 0, 0.8], side * 0.3, () => mailbox(B, ['#e8403a', '#4a78c8', '#6ab06a', '#e8903a'][(v >> 1) % 4]), 0.8);
  if (v % 3 === 1) { B.at([-side * 0.2, 0, 0.78], 0, () => flowerPatch(B, { w: 0.5, d: 0.3, n: 6 })); B.at([-side * 0.52, 0, 0.62], 0.6, () => wateringCan(B)); }
  B.door.set(dx, 0, 0.95);
  B.height = info.ridgeY + 0.35;
}

export function homeL2(B) {
  const v = B.variant;
  const roofOwn = ROOF_LIST[(v * 2 + 3) % 5], wallOwn = WALL_TINTS[(v * 3 + 1) % WALL_TINTS.length];
  const Lk = lookOf(B, { roof: roofOwn, wall: wallOwn }), roofCol = Lk.roof, frame = Lk.frame;
  const w = 2.3, d = 1.7, h = 1.5, y0 = 0.3, zc = -0.52;
  const side = v & 1 ? 1 : -1;
  B.push([0, 0, zc]);
  foundation(B, { w, d, h: y0 });
  walls(B, { w, d, h, y0, plaster: Lk.wall, frame, koshi: Lk.koshi(v % 3 === 0 ? '#c9a27a' : null), koshiSkip: ['f'] });
  const blk = { w, d };
  const dx = side * 0.42;
  onFace(B, blk, 'f', dx, y0, () => {
    doorAt(B, Lk, { w: 0.9, h: 1.28, own: v % 2 ? 'lattice' : 'shoji' }, 11);
    const sym = ['sakura', 'leaf', 'flower', 'heart'][v % 4];
    norenAt(B, Lk, v % 3 !== 1 ? { color: [C.indigo, '#7a4a6a', '#3f6f5a', '#8a5040'][v % 4], sym } : null, { w: 0.84, h: 0.42, y: 1.34, z: 0.16, symScale: 0.18 }, sym, 13);
  });
  onFace(B, blk, 'f', -side * 0.55, y0 + 0.8, () => windowAt(B, Lk, { own: 'shoji', w: 0.78, h: 0.55, bay: true }, 21));
  onFace(B, blk, 'r', -0.1, y0 + 0.84, () => windowAt(B, Lk, { own: 'shoji', w: 0.62, h: 0.5, box: true }, 22));
  onFace(B, blk, 'l', 0, y0 + 0.88, () => windowAt(B, Lk, { own: 'round', r: 0.28 }, 23));
  onFace(B, blk, 'b', 0.4, y0 + 0.84, () => windowAt(B, Lk, { own: 'shoji', w: 0.6, h: 0.5 }, 24));
  onFace(B, blk, 'b', -0.5, y0 + 0.84, () => windowAt(B, Lk, { own: 'shoji', w: 0.5, h: 0.5 }, 25));
  const ownType = ['hip', 'irimoya', 'gable', 'irimoya'][v % 4];
  const rb = { w, d, y0: y0 + h, over: 0.42, gOver: 0.3, H: 0.95, curve: 0.42, lift: 0.26, liftW: 0.8, thick: 0.15, ribW: 0.27, gable: v % 4 === 1 ? 'wood' : 'plaster' };
  const R = roofAt(B, { ...rb, type: ownType, color: roofOwn, moss: mossOf(roofOwn) }, { ...rb, type: Lk.S.roofType(ownType), color: roofCol, moss: mossOf(roofCol), ...Lk.roofX }, 31);
  // porch (engawa) + lean-to roof on posts
  const pd = 0.72;
  engawa(B, { x0: -w / 2 - 0.05, x1: w / 2 + 0.05, z: d / 2, depth: pd, y: y0 + 0.02, step: false, wood: Lk.deck, beam: Lk.dark });
  const postTop = y0 + h - 0.24;
  posts(B, [-w / 2 + 0.02, w / 2 - 0.02], d / 2 + pd - 0.06, postTop, frame, 0.06);
  const beam = G.box(w + 0.1, 0.11, 0.1, 0.02); beam.translate(0, postTop - 0.02, d / 2 + pd - 0.06); B.add(beam, frame);
  const pz = d / 2 + pd / 2 - 0.04;
  let porch;
  B.at([0, 0, pz], 0, () => { porch = roof(B, {
    type: 'shed', w: w + 0.05, d: pd, y0: postTop + 0.04, over: 0.18, gOver: 0.12, H: 0.3, curve: 0.3, lift: 0.14, liftW: 0.4,
    thick: 0.1, ribW: 0.27, ribAmp: 0.035, course: 0, color: roofCol, under: Lk.roofX.under,
  }); });
  for (const sx of [-1, 1]) B.at([sx * (w / 2 - 0.3), postTop - 0.06, d / 2 + pd - 0.02], 0, () => chochin(B, { r: 0.11, h: 0.22, cord: 0.04, color: v % 3 === 2 ? C.pink : C.red }));
  B.light([0, 1.35, d / 2 + pd + 0.2], LAMP);
  // porch life: a wind chime on the beam, drying persimmons (or a rain charm), a rain chain at the corner,
  // a cushion and a tea tray on the engawa
  B.at([-side * 0.12, postTop - 0.08, d / 2 + pd - 0.06], 0, () => charm(B, 'furin', { color: ['#bfe6ff', '#ffd0e0', '#d8f0c0'][v % 3] }));
  if (v % 2 === 0) for (let i = 0; i < 3; i++) B.at([-side * (0.42 + i * 0.1), postTop - 0.07, d / 2 + pd - 0.07], 0, () => charm(B, 'persimmon'));
  else B.at([-side * 0.5, postTop - 0.08, d / 2 + pd - 0.06], 0, () => charm(B, 'teru', { color: ['#ff7a8a', '#6ab0ff', '#ffd24a', '#8fe0c0'][(v >> 1) % 4] }));
  { const cx = -side * (w / 2 - 0.02), cz = d / 2 + pd + 0.08; rainChain(B, cx, porch.underAt(cx, cz - pz), cz, 0); }
  B.at([-side * 0.36, y0 + 0.02, d / 2 + 0.52], side > 0 ? PI : 0, () => teaSet(B));
  onFace(B, blk, 'b', 0, 0, () => B.at([0, 0, 0.14], 0, () => weeds(B, w - 0.4, 3)));
  B.at([side * -0.75, y0 + 0.02, d / 2 + 0.3], 0, () => pot(B, { plant: v % 2 ? 'pine' : 'flowers', r: 0.13, flowers: [B.pick(FLOWERS)] }));
  if (v % 3 === 0) B.at([-side * 0.2, y0 + 0.02, d / 2 + 0.22], PI, () => crate(B, { s: 0.24 }));
  if (v % 3 !== 2) geoAt(B, R, I => chimney(B, side * -0.6, -0.35, I.yAt(side * -0.6, -0.35) - 0.3, I.ridgeY - 0.02), 32);
  // festival bunting along the porch eave
  if (Lk.S.bunting) iso(B, () => {
    const zf = d / 2 + pd + 0.08, X = w / 2 + 0.08, y = x => porch.underAt(x, zf - pz) - 0.02;
    bunting(B, [[-X, y(-X), zf], [0, y(0), zf], [X, y(X), zf]], { sag: 0.09 });
  }, 41);
  B.pop();
  const sz = zc + d / 2 + pd;
  stepStones(B, dx, sz + 0.15, dx + side * 0.1, 1.4, 2);
  const line = v % 3 !== 2, hedged = v % 2 === 0;
  // laundry drying along the side yard, firewood on the other wall, a hedge or a mailbox by the path
  if (line) B.at([-side * 1.34, 0, -0.5], PI / 2, () => laundry(B, { L: 1.3, h: 1.15, colors: [['#ffffff', '#8fd0ff', '#ff9ec0', '#ffe07a'], ['#fff6ea', '#ffb86a', '#8fe0c0', '#ffffff'], ['#c8a8ff', '#ffffff', '#ff8fb0', '#8fd0ff']][v % 3] }));
  if (v % 4 !== 1) B.at([side * 1.3, 0, -0.55], side * PI / 2, () => firewood(B, { w: 0.8, h: 0.44, d: 0.22 }));
  if (hedged) {
    const x0 = side > 0 ? -1.45 : 0.3, x1 = side > 0 ? -0.3 : 1.45;
    B.at([0, 0, 1.4], 0, () => fenceAt(B, Lk, 'hedge', () => hedge(B, x0, x1, { flowers: v % 4 === 0 ? ['#ffb0d0', '#ffffff'] : null }), [x0, x1, 0.5], 51));
  }
  yardProps(B, v % 2 ? [[side * 1.2, 1.15]] : [[side * 1.2, 1.15], [-side * 1.25, 1.2]]);
  if (!line) yardProps(B, [[-side * 1.25, -1.2]]);
  if (v % 2 === 1) B.at([-side * 1.2, 0, 1.22], -side * 0.3, () => mailbox(B, ['#e8403a', '#4a78c8', '#6ab06a', '#e8903a'][(v >> 1) % 4]), 0.85);
  B.at([-side * 0.55, 0, 1.15], 0, () => flowerPatch(B, { w: 0.7, d: 0.4, n: 8 }));
  if (v % 4 === 1) B.at([side * 1.2, 0, -0.2], PI / 2, () => fenceAt(B, Lk, 'bamboo', () => fence(B, [-0.8, 0], [0.8, 0], { style: 'bamboo', h: 0.55 }), [-0.8, 0.8, 0.52, side < 0, 0.13], 52));
  B.door.set(dx, 0, 1.4);
  B.height = R.info.ridgeY + 0.3;
}

export function homeL3(B) {
  const v = B.variant;
  const roofOwn = ROOF_LIST[(v * 4 + 2) % 5], wallOwn = WALL_TINTS[(v * 2 + 3) % WALL_TINTS.length];
  const Lk = lookOf(B, { roof: roofOwn, wall: wallOwn }), roofCol = Lk.roof, frame = Lk.frame;
  const w = 2.3, d = 1.8, h = 1.4, y0 = 0.3, zc = -0.45;
  const side = v & 1 ? 1 : -1;
  B.push([0, 0, zc]);
  foundation(B, { w, d, h: y0 });
  walls(B, { w, d, h, y0, plaster: Lk.wall, frame, koshi: Lk.koshi('#c9a27a'), koshiSkip: ['f'] });
  const blk = { w, d };
  const dx = side * 0.45;
  onFace(B, blk, 'f', dx, y0, () => {
    doorAt(B, Lk, { w: 0.86, h: 1.2, own: 'lattice' }, 11);
    norenAt(B, Lk, { color: ['#b0406a', C.indigo, '#6a4a8a', '#3f6f5a'][v % 4], sym: 'sakura' }, { w: 0.8, h: 0.38, y: 1.24, z: 0.16, symScale: 0.2 }, 'sakura', 13);
  });
  onFace(B, blk, 'f', -side * 0.52, y0 + 0.78, () => windowAt(B, Lk, { own: 'shoji', w: 0.78, h: 0.5, box: true, flowers: ['#ff9ec0', '#ffffff'], bay: true }, 21));
  onFace(B, blk, 'r', 0, y0 + 0.8, () => windowAt(B, Lk, { own: 'shoji', w: 0.9, h: 0.5 }, 22));
  onFace(B, blk, 'l', 0, y0 + 0.8, () => windowAt(B, Lk, { own: 'shoji', w: 0.9, h: 0.5 }, 23));
  onFace(B, blk, 'b', 0, y0 + 0.8, () => windowAt(B, Lk, { own: 'shoji', w: 0.9, h: 0.5 }, 24));
  // pent roof on back + sides; the front becomes a balcony over a porch
  const low = roof(B, { type: 'skirt', w, d, y0: y0 + h, over: 0.34, H: 0.7, curve: 0.35, lift: 0.2, liftW: 0.6, thick: 0.12, ribW: 0.26, color: roofCol, tTop: 0.46, skip: ['f'], under: Lk.roofX.under });
  const y2 = low.topY;
  const w2 = 1.9, d2 = 1.3, h2 = 1.2, z2 = -0.12;
  walls(B, { w: w2, d: d2, h: h2, y0: y2, cz: z2, plaster: Lk.wall, frame });
  const blk2 = { w: w2, d: d2, cz: z2 };
  onFace(B, blk2, 'f', 0, y2 + 0.05, () => {
    // the balcony door: shoji, or a koshi lattice when the windows are lattice
    const own = () => door(B, { w: 1.0, h: 1.0, style: 'shoji', frame, wood: Lk.raw.trim != null ? mixc(frame, C.woodLight, 0.4) : C.woodLight });
    if (Lk.S.window(null) === 'lattice') swap(B, own, () => doorway(B, { w: 1.0, h: 1.0, style: 'lattice', frame, wood: frame, panel: frame }), 26);
    else own();
  });
  onFace(B, blk2, 'r', 0, y2 + 0.66, () => windowAt(B, Lk, { own: 'round', r: 0.25 }, 27));
  onFace(B, blk2, 'l', 0, y2 + 0.66, () => windowAt(B, Lk, { own: 'round', r: 0.25 }, 28));
  onFace(B, blk2, 'b', 0, y2 + 0.62, () => windowAt(B, Lk, { own: 'shoji', w: 0.8, h: 0.5 }, 29));
  B.push([0, 0, z2]);
  const ownType = v % 2 ? 'irimoya' : 'hip';
  const rb = { w: w2, d: d2, y0: y2 + h2, over: 0.4, H: 0.9, curve: 0.45, lift: 0.3, liftW: 0.7, thick: 0.15, ribW: 0.27, gable: 'ornate', tg: 0.5 };
  const R = roofAt(B, { ...rb, type: ownType, color: roofOwn, moss: mossOf(roofOwn) * 0.5 }, { ...rb, type: Lk.S.roofType(ownType), color: roofCol, moss: mossOf(roofCol) * 0.5, ...Lk.roofX }, 31);
  const top = R.info;
  B.pop();
  // balcony deck spanning from the upper wall to past the ground-floor front, on posts
  const zb0 = z2 + d2 / 2, zb1 = d / 2 + 0.5, bw = w + 0.2, by = y2;
  const fr = G.box(w + 0.04, by - (y0 + h) + 0.08, 0.12, 0.02); fr.translate(0, (by + y0 + h) / 2 - 0.04, d / 2 - 0.04); B.add(fr, frame);
  const deck = G.box(bw, 0.12, zb1 - zb0, 0.03); deck.translate(0, by - 0.06, (zb0 + zb1) / 2); B.add(deck, Lk.deck);
  const fascia = G.box(bw + 0.04, 0.16, 0.1, 0.03); fascia.translate(0, by - 0.1, zb1); B.add(fascia, frame);
  for (const sx of [-1, 1]) { const f2 = G.box(0.1, 0.16, zb1 - zb0, 0.03); f2.translate(sx * bw / 2, by - 0.1, (zb0 + zb1) / 2); B.add(f2, frame); }
  posts(B, [-bw / 2 + 0.08, bw / 2 - 0.08], zb1 - 0.08, by - 0.12, frame, 0.065);
  engawa(B, { x0: -w / 2, x1: w / 2, z: d / 2, depth: 0.5, y: y0 + 0.02, step: false, wood: Lk.deck, beam: Lk.dark });
  // railing
  const rh = 0.46;
  const rail = G.box(bw + 0.04, 0.06, 0.07, 0.02); rail.translate(0, by + rh, zb1); B.add(rail, frame);
  for (const sx of [-1, 1]) { const r2 = G.box(0.07, 0.06, zb1 - zb0, 0.02); r2.translate(sx * bw / 2, by + rh, (zb0 + zb1) / 2); B.add(r2, frame); }
  const nb = 12;
  for (let i = 0; i <= nb; i++) { const b = G.box(0.035, rh, 0.035, 0.008); b.translate(-bw / 2 + i * bw / nb, by + rh / 2, zb1); B.add(b, frame); }
  for (const sx of [-1, 1]) for (let i = 1; i < 4; i++) { const b = G.box(0.035, rh, 0.035, 0.008); b.translate(sx * bw / 2, by + rh / 2, zb0 + i * (zb1 - zb0) / 4); B.add(b, frame); }
  B.at([-side * 0.55, by + rh + 0.03, zb1], 0, () => flowerBox(B, { w: 0.62, d: 0.14, h: 0.12, colors: ['#ff8fb0', '#ffffff'], wood: Lk.boxWood }));
  B.at([side * 0.7, by + rh + 0.03, zb1], 0, () => flowerBox(B, { w: 0.5, d: 0.14, h: 0.12, colors: ['#ffd24a', '#ff8fb0'], wood: Lk.boxWood }));
  B.at([side * 0.75, by, zb0 + 0.25], 0, () => pot(B, { plant: 'flowers', r: 0.1, flowers: ['#ff9ec0', '#ffd24a'] }));
  // lanterns: under the balcony + at the upper eave
  for (const sx of [-1, 1]) B.at([sx * (w / 2 - 0.25), by - 0.14, zb1 - 0.12], 0, () => chochin(B, { r: 0.11, h: 0.22, cord: 0.02, color: C.pink }));
  B.light([0, 1.3, zb1 + 0.3], { ...LAMP, color: '#ffb0a0' });
  B.at([side * (w2 / 2 + 0.05), y2 + h2 + 0.02, z2 + d2 / 2 + 0.3], 0, () => chochin(B, { r: 0.11, h: 0.22, cord: 0.05, color: C.red }));
  if (v % 2 === 0) geoAt(B, R, I => chimney(B, -side * 0.5, z2 - 0.25, I.yAt(-side * 0.5, -0.25) - 0.2, I.ridgeY, 0.9), 32);
  // villa life: a futon airing over the balcony rail, a wind chime and persimmons under the upper eave,
  // rain chains off the lower roof, a cushion on the veranda
  futon(B, side * 0.12, by + rh + 0.03, zb1, { w: 0.6, color: ['#ff9ec0', '#8fc8ff', '#ffd27a', '#b8e0a0'][v % 4], pattern: ['#ffffff', '#fff6ea', '#e8604a', '#ffffff'][v % 4] });
  B.at([-side * 0.3, y2 + h2 - 0.02, z2 + d2 / 2 + 0.26], 0, () => charm(B, 'furin', { color: ['#ffd0e0', '#bfe6ff'][v % 2] }));
  for (let i = 0; i < 2; i++) B.at([side * (0.25 + i * 0.12), y2 + h2 - 0.02, z2 + d2 / 2 + 0.24], 0, () => charm(B, v % 2 ? 'persimmon' : 'garlic'));
  { const cx = -side * (w2 / 2 + 0.12), cz = d2 / 2 + 0.2; geoAt(B, R, I => rainChain(B, cx, I.underAt(cx, cz), z2 + cz, by, { color: '#c8a060' }), 33); }
  B.at([-side * 0.5, y0 + 0.02, d / 2 + 0.3], side > 0 ? PI : 0, () => teaSet(B));
  // festival bunting under the upper eave and along the balcony fascia
  if (Lk.S.bunting) iso(B, () => {
    const zl = d2 / 2 + 0.37, X = w2 / 2 + 0.26;
    bunting(B, [[-X, top.underAt(-X, zl) - 0.05, z2 + zl], [X, top.underAt(X, zl) - 0.05, z2 + zl]], { sag: 0.17, size: 0.12 });
    const zf = zb1 + 0.07, xb = bw / 2 - 0.04;
    bunting(B, [[-xb, by - 0.16, zf], [0, by - 0.16, zf], [xb, by - 0.16, zf]], { sag: 0.08, phase: 3 });
  }, 41);
  B.pop();
  // blossom tree + garden
  B.at([-side * 1.12, 0, 1.08], 0, () => tree(B, { kind: 'sakura', s: 0.62 }));
  stepStones(B, dx, zc + d / 2 + 0.6, dx, 1.45, 2);
  yardProps(B, [[side * 1.22, 1.22], [side * 1.25, -1.2]]);
  B.at([-side * 0.1, 0, 1.28], 0, () => flowerPatch(B, { w: 0.45, d: 0.3, n: 5, colors: ['#ff9ec0', '#ffffff', '#ffbcd6'] }));
  // kitchen garden on the side, firewood on the far wall, a watering can by the flowers
  B.at([side * 1.33, 0, -0.35], PI / 2, () => veggieBed(B, { w: 0.9, d: 0.28 }));
  B.at([-side * 1.3, 0, -0.7], -side * PI / 2, () => firewood(B, { w: 0.7, h: 0.42, d: 0.2 }));
  B.at([-side * 0.45, 0, 1.3], 0.5, () => wateringCan(B, v % 2 ? '#e8807a' : '#6ab0d8'));
  B.door.set(dx, 0, 1.45);
  B.height = top.ridgeY + 0.3;
}
