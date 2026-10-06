// Maple Roots: the Maple Root Halls (docs/ZONES.md §8.2; ROADMAP Z-C1). Halls of earth under the roots of Momiji
// Hollow's great maple: the hollow's own assets (regions/assets/mapleFlora.js, mapleProps.js) dress them, so the dungeon
// reads as the same autumn valley gone underground.
//  - floor (shader): packed umber earth with ochre and rust drifts, fine roots crawling out of the wall foot, root-heaved
//    flagstones on the trodden runs and down the corridors (dark earth and red leaves in the joints), olive moss cushions
//    with glowing fungus pinheads, a carpet of fallen momiji (red, orange, gold, a few dried brown), leaf drifts banked
//    against the walls, a cool root-water channel through some chambers (decor b) with leaves drifting on the current,
//    round stone plazas with a maple-leaf mon in the shrine and treasure rooms; the arena: a ring of fitted stones round
//    a leaf-strewn earthen hall with a great momiji leaf of pale stone set in the floor.
//  - walls: layered earth and clay with clods, bedded pebbles, mica glints and dark maple roots threading down from the
//    lip; a heavy overhanging brow with a fringe of hair roots (a red leaf caught here and there); above the brow the
//    great roots lie heaped and heave up into the dark, beds of fallen leaves only along the brow.
//  - light: a dim, cool-violet base, warm amber lantern pools (red chochin on posts, stone toro), a few amber shafts
//    through cracks in the roof (roofShafts, capped) and thin crack-light where leaves sift down; a dark cool band along
//    every wall foot.
//  - dressing: great roots buttressing out of the brow and diving into the floor (some girdled in shimenawa), root
//    niches with hanging paper lanterns, glowing shelf fungus, jizō in alcoves, curtains of hanging roots; at the foot
//    mushrooms, leaf litter and piles, chestnut burrs; along the walls and in the corners mid-scale clusters (root
//    tangles, fallen branches, leaf drifts, sake-barrel stacks, lantern groups, mushroom clusters), the middle of every
//    chamber kept clear for the fight; root knees breaking the floor, the channel's stepping stones.
//  - rooms: the hollow-root shrine, the sake cellar, the tanuki den, the root cellar (rice, bales, hoshigaki), a lantern
//    walk, the fungus grotto, fallen branches; the arrival framed by a torii; the treasure dais; the stairs under a root
//    arch.
//  - the arena (Danzaburō's hall under the great root crown): great roots rising round the far rim into the dark, root
//    knees and stone lanterns on the near side (world.arenaLanterns), a torii at the mouth, the sake-barrel shrine with
//    bales and a lantern line on the far side, a broad capped amber shaft.
//  - ambience: momiji sifting down from the cracks, dust in the shafts, glowing spores over the moss.
import * as THREE from 'three';
import { SH, M, MD, col } from '../dungeonWorld.js';
import { tube, puff, paint, merge } from '../../gfx/geom.js';
import { mulberry32, clamp, TAU, rand } from '../../core/util.js';
import * as F from '../../regions/assets/mapleFlora.js';
import * as Pr from '../../regions/assets/mapleProps.js';
import * as BF from '../../regions/assets/bambooFlora.js';
import * as BP from '../../regions/assets/bambooProps.js';
import { V } from '../../regions/assets/bambooKit.js';
import { G as BG, C as BC } from '../../world/buildings/kit.js';
import { roof } from '../../world/buildings/roofs.js';
import { shimenawa, sack } from '../../world/buildings/props2.js';
import { lanternPost } from '../../world/buildings/props.js';
import { mapleFx, MCOL, F as FX } from '../../regions/bosses/fx_tanuki.js';
import { addPiece, placer, finishPlacer, disposePlacer, topSpan, grad, freeAt, glc as g, toCam, CAM, CAMX, CAMZ, CELL, inStream, kitDecal, roofShafts, wallSpots } from './common.js';

// ------------------------------------------------------------------ palette (the hollow's, a shade darker underground)
const P = {
  slabA: '#978672', slabB: '#ae9c84', jointA: '#4a3426', jointB: '#6a4a34', mossDk: '#3a4626', mossLt: '#66743a',
  leafA: '#c43a28', leafB: '#e0662e', leafC: '#eaa83a', leafD: '#8a4a2c', bark0: '#3c2a20', bark1: '#6c4e3c',
  lantern: '#ffb468', sig: '#ffc884', paper: '#d8402e', fungus: '#ffb060', spore: '#9ff0d8',
};
const LEAVES = ['#c8402c', '#e2602e', '#f08a34', '#f2b440', '#a8382a', '#d86a30'];

// ------------------------------------------------------------------ floor shader
// a momiji leaf in leaf space (the tip toward +x, the stem toward -x): signed distance-ish (< 0 inside), radius R
const PARS = /* glsl */`
float momijiD(vec2 q, float R) {
  float r = length(q), an = atan(q.y, q.x);
  float x = abs(fract(an * 1.11408 + 0.5) - 0.5), s = abs(an) / 3.14159; // (x: from the nearest lobe's midline, 0..0.5)
  float k = max(0.0, (1.0 - 2.0 * x) * (1.0 + 1.3 * x)) * (1.0 + 0.05 * sin(an * 38.0)), L = 1.0 - 0.1 * s - 0.8 * s * s * s; // lanceolate, pointed, serrated
  return r - R * (0.2 + 0.8 * k * L);
}
`;
const FLOOR = /* glsl */`
  {
    // packed cave earth: warm umber with ochre and rust clay drifts, cool damp hollows and a fine grit
    float bigS = fbm(p * 0.045 + 11.0), bigT = vn(p * 0.022 + 3.0);
    c = mix(c, c * vec3(1.08, 0.98, 0.86), smoothstep(0.56, 0.8, bigS) * 0.45);
    c = mix(c, c * vec3(0.84, 0.86, 0.96), smoothstep(0.44, 0.2, bigS) * 0.45);
    c = mix(c, c * vec3(1.04, 0.92, 0.86), smoothstep(0.55, 0.82, bigT) * 0.35);
    c *= 0.93 + 0.1 * vn(p * 2.7 + 5.0);
    c = mix(c, c * vec3(0.97, 0.96, 1.0), 0.3); // (a touch of the cave's cool shade)
    c = mix(c, c * vec3(1.04, 1.0, 0.94) * 1.05, smoothstep(0.4, 0.75, vn(p * 0.075 + 51.0)) * 0.6); // (the swept patches: paler packed earth)
    // darker humus drifts, grit and pebbles in patches, each lit from the upper left
    c = mix(c, c * vec3(0.8, 0.76, 0.76), smoothstep(0.55, 0.78, vn(p * 0.12 + 8.0)) * 0.5);
    {
      vec2 gc; vec3 gv = vor(p * 3.1 + 61.0, gc);
      float gk = step(0.72, gv.z) * smoothstep(0.42, 0.68, vn(p * 0.22 + 33.0)) * smoothstep(0.6, 1.4, wd);
      float gs = smoothstep(0.2, 0.13, gv.x) * gk, gl = clamp(dot(normalize(-gc + 1e-4), vec2(0.54, 0.84)) * 0.5 + 0.5, 0.0, 1.0);
      c = mix(c, c * 0.7, smoothstep(0.26, 0.18, length(gc + vec2(0.03, -0.03))) * gk * 0.5);
      c = mix(c, mix(${g('#76604e')}, ${g('#b09a82')}, h1(floor(p * 3.1 + 61.0) + gv.z)) * (0.8 + 0.3 * gl), gs);
    }
    float tr0 = smoothstep(0.3, 0.6, dc.g); // (the trodden runs: roots worn away under the flags)
    float sb = dc.b + (vn(p * 1.6 + 2.0) - 0.5) * 0.07;            // the root-water channel (decor b)
    float bank = smoothstep(0.14, 0.34, sb), wat = smoothstep(0.42, 0.5, sb);
    // fine roots crawling out of the wall foot across the earth: a warped isoline, raised (a dark halo, a lit core)
    {
      vec2 q = p * 0.36 + vec2(vn(p * 0.9 + 4.0), vn(p * 0.9 + 9.0)) * 1.4;
      float rf = abs(vn(q + 17.0) - 0.5), wall = 1.0 - smoothstep(0.9, 3.4, wd + (vn(p * 0.5) - 0.5) * 1.2), near = (0.15 + 0.85 * wall) * smoothstep(0.5, 0.7, vn(p * 0.17 + 3.0)) * (1.0 - bank) * (1.0 - tr0);
      float w = 0.014 + 0.026 * wall;
      c = mix(c, c * 0.66, smoothstep(w * 2.6, w, rf) * near * 0.45);
      vec3 rc = mix(${g('#4a3224')}, ${g('#8a6448')}, smoothstep(w, 0.0, rf)) * (0.88 + 0.2 * vn(p * 6.0));
      c = mix(c, rc, smoothstep(w, w * 0.45, rf) * near);
    }
    // root-heaved flagstones on the trodden runs (decor g) and down the corridors: dark earth and red leaves in the joints
    float tr = smoothstep(0.2, 0.62, dc.g + (vn(p * 1.1) - 0.5) * 0.3);
    float fk = max(tr, rid == 0 ? smoothstep(0.7, 1.7, wd) : 0.0) * (1.0 - bank);
    if (fk > 0.01) {
      vec2 tc; vec3 v = vor(p * 0.9 + 3.0, tc);
      float on = smoothstep(0.3, 0.38, fk + (v.z - 0.5) * 0.55);  // stones drop out one by one toward a run's rim
      float lit = clamp(dot(normalize(-tc + 1e-4), vec2(0.54, 0.84)) * 0.5 + 0.5, 0.0, 1.0);
      vec3 st = mix(${g(P.slabA)}, ${g(P.slabB)}, v.z) * (0.9 + 0.12 * vn(p * 5.0));
      st *= 0.92 + 0.14 * lit * smoothstep(0.0, 0.35, v.x);
      st = mix(st, st * vec3(1.06, 0.9, 0.8), smoothstep(0.5, 0.85, vn(p * 1.7 + v.z * 9.0)) * 0.5); // rust stains
      float ca = v.z * 23.0; vec2 cn = vec2(cos(ca), sin(ca)); // a hairline crack across some stones (heaved by the roots)
      st *= 1.0 - smoothstep(0.03, 0.0, abs(dot(-tc, cn))) * step(0.66, fract(v.z * 7.31)) * smoothstep(0.02, 0.1, v.y) * 0.5;
      vec3 jc = mix(${g(P.jointA)}, ${g(P.jointB)}, vn(p * 2.3));
      jc = mix(jc, ${g('#6a2a1e')}, step(0.8, h1(floor(p * 6.0))) * 0.4); // (a red leaf wedged in a joint here and there)
      vec3 flag = mix(jc, st, smoothstep(0.02, 0.065, v.y));
      c = mix(c, c * 0.76, smoothstep(0.0, 0.25, fk) * (1.0 - on) * 0.3);
      c = mix(c, flag, on);
    }
    // olive moss cushions (decor r): a shade at the rim, then dappled velvet; glowing fungus pinheads in them (decor a)
    float lu = smoothstep(0.26, 0.6, dc.r + (fbm(p * 0.7 + 4.0) - 0.5) * 0.5) * (1.0 - wat);
    if (lu > 0.001) {
      float g1 = fbm(p * 0.95 + 9.0);
      vec3 mc = mix(${g(P.mossDk)}, ${g(P.mossLt)}, smoothstep(0.25, 0.75, g1));
      float hc = fbm(p * 0.62 + 21.0), hx = fbm(p * 0.62 + vec2(21.14, 21.0)) - hc, hz = fbm(p * 0.62 + vec2(21.0, 21.14)) - hc;
      mc *= 0.95 + clamp((-hx * 0.54 - hz * 0.84) * 9.0, -0.14, 0.18);
      mc *= 0.92 + 0.12 * vn(p * 13.0);
      float lob = lu - (vn(p * 3.1 + 7.0) - 0.5) * 0.22;
      c = mix(c, c * 0.66, smoothstep(0.08, 0.26, lob) * (1.0 - smoothstep(0.26, 0.44, lob)) * 0.7);
      c = mix(c, mc, smoothstep(0.26, 0.4, lob));
      float fa = smoothstep(0.2, 0.6, dc.a) * smoothstep(0.35, 0.7, lu);
      if (fa > 0.01) {
        vec2 fc = floor(p * 4.2); vec2 fo = fract(p * 4.2) - 0.5 - (h2(fc + 3.0) - 0.5) * 0.55; float fh = h1(fc + 17.0);
        float has = step(0.6, fh) * fa, cap = smoothstep(0.11, 0.065, length(fo));
        c = mix(c, c * 0.7, smoothstep(0.15, 0.09, length(fo - vec2(0.03, -0.03))) * has * 0.5);
        c = mix(c, fh > 0.9 ? ${g('#ffe2a8')} : ${g('#c8fff0')}, cap * has);
        fG += (fh > 0.9 ? ${g('#ffb468')} : ${g('#6ff0cc')}) * cap * has * (0.3 + 0.2 * sin(uTime * 1.3 + fh * 30.0));
      }
    }
    // a carpet of fallen momiji: red, orange, gold and dried brown, drifting thicker toward the walls (and the accent patches)
    {
      vec2 lc; vec3 lv = vor(p * 2.4 + 31.0, lc);
      float bare = smoothstep(0.35, 0.7, vn(p * 0.075 + 51.0)); // (swept, bare earth in places, thick litter in others)
      float lp = step(0.93 + bare * 0.06 - smoothstep(2.6, 0.8, wd) * 0.2 - smoothstep(0.2, 0.7, dc.a) * 0.2 - smoothstep(0.55, 0.8, vn(p * 0.11 + 23.0)) * 0.1, lv.z) * (1.0 - bank) * step(0.55, wd);
      if (lp > 0.0) {
        float la = lv.z * 71.0, cs = cos(la), sn = sin(la); vec2 q = vec2(cs * lc.x - sn * lc.y, sn * lc.x + cs * lc.y);
        float hh = h1(vec2(lv.z * 37.0, 5.0)), R = 0.27 + 0.08 * h1(vec2(lv.z * 13.0, 2.0));
        vec3 lcol = hh < 0.34 ? ${g(P.leafA)} : hh < 0.6 ? ${g(P.leafB)} : hh < 0.82 ? ${g(P.leafC)} : ${g(P.leafD)};
        float ld = momijiD(q, R), leaf = smoothstep(0.012, -0.012, ld);
        float stem = smoothstep(0.016, 0.004, abs(q.y)) * step(-R * 0.75, q.x) * step(q.x, -R * 0.15);
        c = mix(c, c * 0.72, smoothstep(0.06, -0.02, momijiD(q - vec2(0.03, -0.03), R)) * lp * 0.5);
        c = mix(c, lcol * (0.85 + 0.25 * smoothstep(R, 0.0, length(q))), max(leaf, stem) * lp);
        c = mix(c, lcol * 0.7, leaf * lp * smoothstep(0.008, 0.0, abs(q.y)) * step(0.0, q.x) * 0.6); // the midrib
      }
    }
    // leaf drifts banked against the wall foot
    {
      float df = max((1.0 - smoothstep(0.55, 1.5, wd + (vn(p * 0.7) - 0.5) * 0.6)) * smoothstep(0.32, 0.58, vn(p * 0.33 + 17.0)), smoothstep(0.4, 0.75, dc.a + (vn(p * 1.3 + 9.0) - 0.5) * 0.35) * 0.9 * (1.0 - smoothstep(0.3, 0.5, dc.r))) * (1.0 - bank) * (1.0 - tr0 * 0.7); // (and leaf beds in the open: decor a)
      if (df > 0.01) { // a mulch of deep reds and browns, thick with leaves
        vec3 dcol = mix(${g('#5e2a1e')}, ${g('#86442a')}, vn(p * 3.1 + 5.0)) * (0.85 + 0.2 * vn(p * 9.0));
        c = mix(c, dcol, df * 0.8);
        vec2 lc; vec3 lv = vor(p * 3.4 + 77.0, lc);
        float la = lv.z * 61.0, cs = cos(la), sn = sin(la); vec2 q = vec2(cs * lc.x - sn * lc.y, sn * lc.x + cs * lc.y);
        float hh = h1(vec2(lv.z * 41.0, 3.0)), on = step(0.3, lv.z) * smoothstep(0.2, 0.55, df), lf = smoothstep(0.012, -0.012, momijiD(q, 0.34)) * on;
        vec3 lcol = hh < 0.3 ? ${g(P.leafA)} : hh < 0.55 ? ${g(P.leafB)} : hh < 0.75 ? ${g(P.leafC)} : ${g(P.leafD)};
        c = mix(c, c * 0.68, smoothstep(0.06, -0.02, momijiD(q - vec2(0.03, -0.03), 0.34)) * on * 0.5);
        c = mix(c, lcol * 0.9 * (0.85 + 0.2 * smoothstep(0.34, 0.0, length(q))), lf);
      }
    }
    // damp hollows and little puddles catching the lantern light (small, scattered)
    float pn = vn(p * 0.34 + 41.0) + (vn(p * 1.6 + 3.0) - 0.5) * 0.05, away = smoothstep(1.6, 2.6, wd) * (1.0 - tr * 0.8) * (1.0 - bank) * smoothstep(0.5, 0.62, vn(p * 0.045 + 7.0));
    float wet = smoothstep(0.77, 0.82, pn) * away, pud = smoothstep(0.82, 0.835, pn) * away;
    c = mix(c, c * 0.64, wet * 0.7);
    vec3 pw = mix(${g('#3a3634')}, ${g('#8a8278')}, smoothstep(0.83, 0.95, pn) * 0.5 + vn(p * 0.8 + uTime * 0.05) * 0.3);
    c = mix(c, pw, pud);
    fG += ${g('#ffd8a8')} * (twinkle(p, 3.2, 0.72) * pud * 1.6 + pud * 0.04);
    // the root-water channel: dark wet banks with pebbles, then a cool clear run over a stony bed, red leaves riding it
    if (bank > 0.001) {
      vec2 pc; vec3 pv = vor(p * 3.3 + 17.0, pc);
      float peb = smoothstep(0.17, 0.11, pv.x) * step(0.4, pv.z);
      float plit = clamp(dot(normalize(-pc + 1e-4), vec2(0.54, 0.84)) * 0.5 + 0.5, 0.0, 1.0);
      vec3 pcol = mix(${g('#a89480')}, ${g('#786656')}, pv.z) * (0.82 + 0.26 * plit);
      c = mix(c, c * vec3(0.56, 0.54, 0.58), bank * 0.8);
      c = mix(c, pcol, peb * bank * (1.0 - wat) * 0.9);
      if (wat > 0.0) {
        vec2 fl = p * 0.9 + vec2(uTime * 0.3, uTime * 0.19);
        float rip = vn(fl * 1.7) * 0.6 + vn(fl * 3.9 + 3.0) * 0.4;
        vec3 bed = mix(pcol * vec3(0.62, 0.66, 0.66), ${g('#2a4442')}, 0.55 - peb * 0.3);
        vec3 w = mix(bed, mix(${g('#2c5a56')}, ${g('#68a098')}, rip), 0.5);
        w = mix(w, ${g('#1c3a38')}, smoothstep(0.62, 0.95, sb) * 0.45); // deeper down the middle
        float caus = smoothstep(0.035, 0.0, abs(vn(fl * 2.4 + 7.0) - 0.5)) * smoothstep(0.35, 0.75, vn(fl * 0.7 + 3.0));
        w = mix(w, ${g('#d8f0e4')}, caus * 0.25);
        { // fallen leaves riding the current
          vec2 lc2; vec3 lv2 = vor(p * 1.5 - vec2(uTime * 0.36, uTime * 0.23) + 5.0, lc2);
          if (lv2.z > 0.72) {
            float la = lv2.z * 53.0 + uTime * 0.4 * (lv2.z - 0.85), cs = cos(la), sn = sin(la); vec2 q = vec2(cs * lc2.x - sn * lc2.y, sn * lc2.x + cs * lc2.y);
            float hh = h1(vec2(lv2.z * 29.0, 1.0)), lf = smoothstep(0.012, -0.012, momijiD(q, 0.3));
            w = mix(w, w * 0.6, smoothstep(0.08, -0.02, momijiD(q - vec2(0.05, -0.05), 0.3)) * 0.5);
            w = mix(w, (hh < 0.45 ? ${g(P.leafA)} : hh < 0.8 ? ${g(P.leafB)} : ${g(P.leafC)}) * 0.92, lf);
          }
        }
        float edge = smoothstep(0.42, 0.47, sb) * (1.0 - smoothstep(0.47, 0.56, sb));
        w = mix(w, ${g('#f2fff8')}, edge * (0.5 + 0.25 * sin(uTime * 3.0 + p.x * 2.0 + p.y)));
        c = mix(c, w, wat);
        fG += ${g('#d8fff0')} * (twinkle(p + vec2(uTime * 0.3, 0.0), 3.6, 0.72) * wat * 1.2 + caus * wat * 0.05);
      }
    }
    // the shrine and treasure rooms: a round plaza of fitted stones at the room's heart, a maple-leaf mon at its centre
    if (rid > 0) {
      vec4 R = uRoom[rid - 1]; vec4 K = uRoomK[rid - 1];
      if (K.x > 3.5 && K.x < 5.5) {
        vec2 ctr = (R.xy + R.zw) * 0.5; float rr = clamp(min(R.z - R.x, R.w - R.y) * 0.5 - 3.0, 1.8, 4.6);
        vec2 d0 = p - ctr; float r0 = length(d0), a0 = atan(d0.y, d0.x);
        if (r0 < rr + 1.0) {
          float ci = floor((r0 - 0.5) / 0.9), rad = 0.5 + (ci + 0.5) * 0.9, ns = max(1.0, floor(6.28318 * rad / 1.05)), off = h1(vec2(ci, 2.0));
          float uu = (a0 / 6.28318 + 0.5 + off) * ns, sj = floor(uu), fr = fract((r0 - 0.5) / 0.9), arc = min(fract(uu), 1.0 - fract(uu)) * 6.28318 * rad / ns;
          float gap = smoothstep(0.0, 0.07, min(fr, 1.0 - fr) * 0.9) * smoothstep(0.0, 0.06, arc);
          vec3 sc = mix(${g(P.slabA)}, ${g(P.slabB)}, h1(vec2(ci, sj))) * (0.92 + 0.1 * vn(p * 5.0));
          if (r0 < 1.45) { // the mon: a pale round stone with a rust-red momiji inlaid
            sc = mix(${g(P.slabB)}, vec3(0.86, 0.8, 0.72), 0.25) * (0.94 + 0.06 * vn(p * 7.0)); gap = smoothstep(1.45, 1.38, r0);
            vec2 mq = vec2(-d0.x - d0.y, d0.x - d0.y) * 0.7071; float md = momijiD(mq + vec2(0.3, 0.0), 1.15);
            sc = mix(sc, ${g('#8a3a26')} * (0.9 + 0.12 * vn(p * 9.0)), smoothstep(0.02, -0.02, md));
            sc = mix(sc, sc * 0.62, smoothstep(0.035, 0.0, abs(md)) * 0.7);
          }
          sc *= 0.84; float inP = smoothstep(rr + 0.4, rr, r0);
          c = mix(c, c * 0.72, smoothstep(rr + 0.9, rr + 0.3, r0) * (1.0 - inP) * 0.5);
          c = mix(c, mix(mix(${g(P.jointA)}, ${g(P.jointB)}, vn(p * 2.0)), sc, gap), inP);
        }
      }
    }
    // the earth closes in: a cool, dark band along every wall foot (the roof overhead shades it), the glows muted there
    float encl = smoothstep(0.5, 2.6, wd);
    c *= mix(vec3(0.4, 0.4, 0.52), vec3(1.0), encl);
    fG *= 0.45 + 0.55 * encl;
  }
`;
// the arena: a ring of fitted stones round an earthen hall thick with fallen leaves, a great momiji of pale stone set in
// the floor (its tip to the far side), two rings and a dotted circle, breathing faintly with the sigil colour;
// uSigDim < 1 sinks it while the boss winds up
const ARENA = /* glsl */`
  if (uBoss.w > 0.5) {
    vec2 d = p - uBoss.xy; float r = length(d), R = uBoss.z, a = atan(d.y, d.x);
    if (r < R + 3.0) {
      float r0 = R - 3.2;
      float inRing = smoothstep(r0 - 0.06, r0 + 0.06, r) * (1.0 - smoothstep(R + 1.05, R + 1.3, r));
      float ci = floor((r - r0) / 1.1), fr = fract((r - r0) / 1.1), rad = r0 + (ci + 0.5) * 1.1;
      float ns = floor(6.28318 * rad / 1.3), uu = (a / 6.28318 + 0.5 + h1(vec2(ci, 7.0))) * ns, sj = floor(uu);
      float arc = min(fract(uu), 1.0 - fract(uu)) * 6.28318 * rad / ns;
      float gap = smoothstep(0.0, 0.065, min(fr, 1.0 - fr) * 1.1) * smoothstep(0.0, 0.065, arc);
      vec3 sc = mix(${g(P.slabA)}, ${g(P.slabB)}, h1(vec2(ci, sj) + 3.0)) * (0.9 + 0.12 * vn(p * 5.0));
      sc *= 0.93 + 0.1 * smoothstep(0.0, 0.45, min(fr, 1.0 - fr)) * smoothstep(0.0, 0.5, arc);
      sc = mix(sc, sc * vec3(1.05, 0.9, 0.8), smoothstep(0.55, 0.85, vn(p * 1.3 + ci)) * 0.45);
      vec3 jc = mix(${g(P.jointA)}, ${g(P.jointB)}, vn(p * 2.0)); jc = mix(jc, ${g('#6a2a1e')}, step(0.8, h1(floor(p * 6.0))) * 0.4);
      c = mix(c, mix(jc, sc, gap), inRing);
      float hall = 1.0 - smoothstep(r0 - 0.1, r0 + 0.05, r);
      vec3 ec = mix(${g('#9a7e6a')}, ${g('#b29878')}, smoothstep(0.3, 0.75, fbm(p * 0.9 + 9.0))) * (0.92 + 0.12 * vn(p * 11.0));
      c = mix(c, c * 0.7, smoothstep(r0 + 0.5, r0 - 0.1, r) * smoothstep(r0 - 1.2, r0 - 0.2, r) * 0.6);
      c = mix(c, ec, hall * 0.9);
      // the great leaf: pale stone set in the earth (a filled inlay with a crisp edge, five veins), two rings round it
      vec2 tip = vec2(-0.7071, -0.7071); float Rt = min(5.2, r0 * 0.42);
      vec2 lq = vec2(dot(d, tip), dot(d, vec2(-tip.y, tip.x))) + vec2(Rt * 0.24, 0.0);
      float ld = momijiD(lq, Rt), fillT = smoothstep(0.03, -0.03, ld), edgeT = smoothstep(0.1, 0.03, abs(ld));
      float vein = 0.0;
      for (int k = 0; k < 7; k++) { float th = (float(k) - 3.0) * 0.8976; vec2 vd = vec2(cos(th), sin(th)); float al = dot(lq, vd); vein = max(vein, smoothstep(0.07, 0.025, abs(lq.x * vd.y - lq.y * vd.x)) * step(0.0, al) * smoothstep(Rt * 0.85, Rt * 0.3, al)); }
      float circ = smoothstep(0.06, 0.0, abs(r - Rt * 1.14) - 0.05) + smoothstep(0.05, 0.0, abs(r - Rt * 1.24) - 0.03);
      vec2 dq = vec2((fract(a / 6.28318 * 44.0) - 0.5) * r * 6.28318 / 44.0, r - (r0 - 1.0));
      float dots = smoothstep(0.13, 0.08, length(dq)) * 0.65;
      float sig = max(max(edgeT, circ), dots) * hall, fill = fillT * hall * (1.0 - 0.4 * smoothstep(0.55, 0.8, fbm(p * 1.3 + 4.0)));
      float pulse = 0.6 + 0.4 * sin(uTime * 1.4 - r * 0.3);
      vec3 stoneI = mix(${g(P.slabA)}, ${g(P.slabB)}, vn(p * 3.0)) * (0.92 + 0.08 * vn(p * 9.0));
      vec3 sigC = mix(c * 0.8, mix(stoneI, uSig, 0.25), 0.35 + 0.65 * uSigDim);
      c = mix(c, stoneI * 0.84, fill * 0.74);
      c = mix(c, c * 0.66, vein * fillT * hall * 0.55);
      c = mix(c, c * 0.6, smoothstep(0.0, 0.6, edgeT * hall) * (1.0 - fill) * 0.35);
      c = mix(c, sigC, sig * (0.45 + 0.35 * uSigDim));
      c *= 1.0 - (1.0 - uSigDim) * 0.18 * hall;
      fG += uSig * (sig * 0.2 + fill * 0.035) * pulse * uSigDim * uSigDim;
      // fallen leaves over all of it, drifting thick toward the rim (fewer on the inlay: swept for the master)
      vec2 lc; vec3 lv = vor(p * 2.2 + 13.0, lc);
      float lp = step(0.92 - smoothstep(r0 - 4.0, r0 + 0.5, r) * 0.22 + fillT * 0.06 - smoothstep(0.55, 0.8, vn(p * 0.11 + 23.0)) * 0.1, lv.z) * hall;
      if (lp > 0.0) {
        float la = lv.z * 71.0, cs = cos(la), sn = sin(la); vec2 q = vec2(cs * lc.x - sn * lc.y, sn * lc.x + cs * lc.y);
        float hh = h1(vec2(lv.z * 37.0, 5.0)), lf = smoothstep(0.012, -0.012, momijiD(q, 0.3));
        vec3 lcol = hh < 0.34 ? ${g(P.leafA)} : hh < 0.6 ? ${g(P.leafB)} : hh < 0.82 ? ${g(P.leafC)} : ${g(P.leafD)};
        c = mix(c, c * 0.72, smoothstep(0.06, -0.02, momijiD(q - vec2(0.03, -0.03), 0.3)) * lp * 0.5);
        c = mix(c, lcol * (0.85 + 0.25 * smoothstep(0.3, 0.0, length(q))), lf * lp);
      }
    }
  }
`;
// ------------------------------------------------------------------ wall shader (kind 1: the earthen face, 3: the top)
const WALL = /* glsl */`
    if (vWall.z > 2.5) { // above the brow: the great roots lie heaped side by side and heave up into the dark, leaf beds
      // only along the brow; it fades toward the back as the roots rise out of sight
      vec2 p = vCWorld.xz; float o = vWall.y, Dd = max(vWall.w, 0.6);
      float ang = vn(p * 0.05 + uSeed) * 6.28318; vec2 dr = vec2(cos(ang), sin(ang));
      float s = dot(p, vec2(-dr.y, dr.x)) * 1.35 + (vn(p * 0.45 + 3.0) - 0.5) * 2.4, along = dot(p, dr);
      float si = floor(s), sf = fract(s), rh = h1(vec2(si, uSeed + 3.0));
      vec3 c = mix(${g('#6a5242')}, ${g('#94765c')}, rh) * (0.82 + 0.24 * vn(vec2(along * 2.4, si * 7.0)));
      c *= 1.0 - smoothstep(0.62, 0.92, abs(sin(along * 9.0 + rh * 20.0 + sf * 2.0))) * 0.18; // bark furrows
      c *= 0.5 + 0.56 * sin(sf * 3.14159);                    // each root round in section, lit on its crown
      c = mix(c, ${g('#22160f')}, smoothstep(0.13, 0.0, min(sf, 1.0 - sf)) * 0.75); // dark earth between them
      c = mix(c, ${g('#3a2a20')} * (0.8 + 0.3 * vn(p * 3.0)), step(0.76, rh) * 0.8);   // a gap of bare soil
      float lb = smoothstep(0.95, 0.15, o + (fbm(p * 0.9 + 3.0) - 0.5) * 0.9) * smoothstep(0.28, 0.55, fbm(p * 1.2 + uSeed));
      c = mix(c, mix(${g('#6a2e20')}, ${g('#8a4a2a')}, vn(p * 4.0)), lb * 0.85); // the leaf mulch
      {
        vec2 cc = floor(p * 3.4); vec2 lo = fract(p * 3.4) - 0.5 - (h2(cc + uSeed) - 0.5) * 0.4; float lh = h1(cc + 7.0);
        float la = lh * 60.0, cs = cos(la), sn = sin(la); vec2 q = vec2(cs * lo.x - sn * lo.y, sn * lo.x + cs * lo.y);
        float lr = length(q), lx = abs(fract(atan(q.y, q.x) * 1.11408 + 0.5) - 0.5), lk = max(0.0, (1.0 - 2.0 * lx) * (1.0 + 1.3 * lx)), lf = smoothstep(0.02, 0.0, lr - 0.3 * (0.25 + 0.75 * lk)) * step(0.35, lh) * lb;
        vec3 lcol = lh < 0.55 ? ${g('#c43a28')} : lh < 0.75 ? ${g('#e2662e')} : lh < 0.9 ? ${g('#eaa83a')} : ${g('#8a4a2c')};
        c = mix(c, lcol * (0.85 + 0.2 * smoothstep(0.3, 0.0, lr)), lf);
      }
      wG += ${g('#ffd8a0')} * smoothstep(0.06, 0.0, min(sf, 1.0 - sf)) * twinkle(p * 1.3, 2.4, 0.9) * 0.25;
      c *= mix(1.0, 0.36, smoothstep(0.3, Dd + 0.4, o));
      diffuseColor.rgb *= c * 1.16;
    } else if (vWall.z > 0.5 && vWall.z < 1.5) { // the earthen face
      float u = vWall.x, v = vWall.y, lip = vWall.w * 0.9;
      diffuseColor.rgb *= mix(1.0, 0.72, smoothstep(0.62, 0.88, v / max(vWall.w, 0.1))); // in the brow's shadow
      // layered earth: ochre, umber and rust clay bands, tilted, a drift along the face
      float wv = v * 1.5 + u * 0.06 + (vn(vec2(u * 0.15, 3.0)) - 0.5) * 0.9;
      float bi = floor(wv), bf = fract(wv), bh = h1(vec2(bi, uSeed + 7.0));
      vec3 st = bh < 0.25 ? vec3(1.1, 0.98, 0.82) : bh < 0.5 ? vec3(0.8, 0.78, 0.8) : bh < 0.72 ? vec3(1.08, 0.86, 0.74) : bh < 0.88 ? vec3(0.92, 0.9, 0.86) : vec3(1.18, 1.08, 0.9);
      diffuseColor.rgb *= mix(vec3(1.0), st, 0.85) * (0.9 + 0.16 * vn(vec2(u * 2.3, v * 7.0 + bi)));
      diffuseColor.rgb *= 1.0 - smoothstep(0.08, 0.0, min(bf, 1.0 - bf)) * 0.3;
      diffuseColor.rgb *= 1.0 + smoothstep(0.1, 0.0, 1.0 - bf) * 0.1; // (each band's top lip catches the light)
      // runnels: darker streaks washed down the face
      diffuseColor.rgb *= 1.0 - smoothstep(0.6, 0.85, vn(vec2(u * 2.1, 5.0 + v * 0.3))) * 0.22 * smoothstep(0.1, 0.6, v);
      // clods: a voronoi of big facets, each its own tone, a dark crack between and a lit top edge
      {
        vec2 q = vec2(u * 0.55, v * 0.85); vec2 qi = floor(q), qf = fract(q); float md = 8.0, md2 = 8.0; vec2 mc = vec2(0.0), mr = vec2(0.0);
        for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) { vec2 gg = vec2(float(i), float(j)); vec2 rr = gg + h2(qi + gg) * 0.85 + 0.075 - qf; float dd = dot(rr, rr); if (dd < md) { md2 = md; md = dd; mc = qi + gg; mr = rr; } else if (dd < md2) md2 = dd; }
        float edge = sqrt(md2) - sqrt(md);
        diffuseColor.rgb *= 0.93 + 0.1 * h1(mc + uSeed);
        diffuseColor.rgb *= 1.0 - smoothstep(0.06, 0.0, edge) * 0.2 * step(0.45, h1(mc + 3.0));
      }
      // pebbles bedded in the earth
      {
        vec2 pq = vec2(u, v) * 3.2; vec2 pi = floor(pq); vec2 pf = fract(pq) - 0.5 - (h2(pi + uSeed) - 0.5) * 0.5; float ph = h1(pi + 11.0);
        float peb = step(0.82, ph) * smoothstep(0.17, 0.12, length(pf * vec2(1.0, 1.3)));
        diffuseColor.rgb = mix(diffuseColor.rgb, ${g('#a89a8c')} * (0.85 + 0.3 * smoothstep(-0.1, 0.1, -pf.y)), peb * 0.85);
      }
      // maple roots threading down the face from the lip: dark bark, tapering, ringed, a shade along their edges
      {
        float ru = u * 0.55 + sin(v * 1.6 + h1(vec2(floor(u * 0.55), 4.0)) * 6.0) * 0.18, rc = floor(ru);
        float rlen = 0.9 + h1(vec2(rc, 8.0)) * 2.0, has = step(0.42, h1(vec2(rc, 2.0 + uSeed))) * step(lip - v, rlen) * step(v, lip + 0.1);
        float rw = (0.09 + 0.07 * h1(vec2(rc, 3.0))) * (1.0 - 0.6 * clamp((lip - v) / rlen, 0.0, 1.0)), rd = abs(fract(ru) - 0.5);
        vec3 rcol = mix(${g('#2e1e16')}, ${g('#80604a')}, smoothstep(rw, 0.0, rd + (fract(ru) - 0.5) * 0.6) * 0.85 + 0.15 * vn(vec2(u * 9.0, v * 2.0)));
        rcol *= 0.9 + 0.15 * sin(v * 26.0 + ru * 9.0);
        diffuseColor.rgb *= 1.0 - smoothstep(rw * 1.9, rw, rd) * has * 0.32;
        diffuseColor.rgb = mix(diffuseColor.rgb, rcol, smoothstep(rw, rw * 0.6, rd) * has);
      }
      // a fringe of hair roots under the lip (a solid dark band, then threads of varied length), a red leaf caught on some
      float dv = lip - v;
      if (dv < 1.2) {
        float cu = u / 0.15, ci = floor(cu), fx = fract(cu) - 0.5;
        float len = (0.08 + 0.75 * h1(vec2(ci, 5.0) + uSeed)) * step(0.35, h1(vec2(ci, 11.0)));
        float hair = step(dv, len) * smoothstep(0.2, 0.08, abs(fx + sin(dv * 9.0 + ci) * 0.12) * (1.0 + dv / max(len, 0.05)));
        hair = max(hair, smoothstep(0.1 + 0.05 * sin(u * 3.0), 0.02, dv));
        diffuseColor.rgb = mix(diffuseColor.rgb, ${g('#3a2a20')} * (0.85 + 0.3 * h1(vec2(ci, 3.0))), hair * 0.9);
        float lt = step(0.84, h1(vec2(ci, 21.0 + uSeed))) * step(0.1, len) * smoothstep(0.075, 0.045, length(vec2(fx * 0.15, dv - len)));
        diffuseColor.rgb = mix(diffuseColor.rgb, h1(vec2(ci, 7.0)) > 0.5 ? ${g('#d8482e')} : ${g('#f09a3a')}, lt);
      }
      // mica glints and a damp darker foot
      wG += ${g('#ffd8a0')} * twinkle(vec2(u * 1.6, v * 2.2), 2.6, 0.93) * 0.45;
      diffuseColor.rgb *= mix(0.66, 1.0, smoothstep(0.0, 0.45, v));
    }`;

// ------------------------------------------------------------------ geometry helpers
const cache = new Map();
const cached = (k, fn) => { if (!cache.has(k)) cache.set(k, fn()); return cache.get(k); };
const pathLen = pts => { let L = 0; for (let i = 1; i < pts.length; i++) L += pts[i].p.distanceTo(pts[i - 1].p); return L; };
const _ca = new THREE.Color(), _cb = new THREE.Color();
/** a root / branch tube painted with bark: furrows running along it (uv), lit crown, moss and caught leaves on top */
function barkGeo(pts, { radial = 7, cap = true, c0 = '#5a4232', c1 = '#ae8c6c', moss = 0, leafy = 0, seed = 0 } = {}) {
  const gg = tube(pts, radial, cap), uv = gg.attributes.uv, L = pathLen(pts);
  const a = col(c0), b = col(c1), mc = col('#525e2c'), mh = col('#7a8640'), l0 = col('#c8402c'), l1 = col('#f0a03a');
  return paint(gg, (p, n, o, i) => {
    const u = uv.getX(i), v = uv.getY(i), fur = Math.sin(u * TAU * 3 + Math.sin(v * L * 1.7 + seed) * 1.6 + seed), ring = (v * L / 0.42 + seed * 0.37) % 1;
    o.copy(a).lerp(b, clamp(0.38 + 0.36 * fur + n.y * 0.3));
    if (ring > 0.9) o.multiplyScalar(0.72); // (bark plates)
    const top = n.y + Math.sin(p.x * 3.3 + p.z * 2.9 + seed) * 0.25;
    if (moss && top > 1 - moss) o.lerp(mc, 0.6).lerp(mh, clamp((top - 1 + moss) * 2) * 0.4);
    if (leafy && top > 0.7 && Math.sin(p.x * 23 + p.z * 19 + p.y * 7 + seed) > 1 - leafy) o.copy(_ca.copy(l0).lerp(l1, Math.sin(p.x * 41 + p.z * 13) * 0.5 + 0.5));
  });
}
/** bake a world-space bark tube into a chunked batch, anchored at its first point (the cut-away's anchor) */
function addBark(Bt, pts, o = {}, mul = 1) {
  const ax = pts[0].p.x, az = pts[0].p.z;
  Bt.addVC(barkGeo(pts.map(q => ({ p: V(q.p.x - ax, q.p.y, q.p.z - az), r: q.r })), o), M(ax, 0, az, 1), mul);
}
const earthP = grad('#4e3a2c', '#8a6e56', 1, 1.2, -0.1);
const stoneP = grad('#6e6058', '#a89a8c', 1, 1.2, -0.1);
/** a flat seven-lobed momiji (one-sided, facing +z, the tip toward +y): pointed lobes, a pale heart, deep tips */
const leafGeo = (i, size = 0.11) => cached(`leaf:${i}:${size}`, () => {
  const sh = new THREE.Shape(), N = 28;
  for (let k = 0; k <= N; k++) {
    const phi = -Math.PI + k / N * TAU, xq = phi * 3.5 / Math.PI + 0.5, x0 = Math.abs(xq - Math.floor(xq) - 0.5), sa = Math.abs(phi) / Math.PI, L = 1 - 0.1 * sa - 0.8 * sa * sa * sa;
    const rr = size * (0.2 + 0.8 * Math.max(0, (1 - 2 * x0) * (1 + 1.3 * x0)) * L), x = Math.sin(phi) * rr, y = Math.cos(phi) * rr;
    if (k) sh.lineTo(x, y); else sh.moveTo(x, y);
  }
  const gg = new THREE.ShapeGeometry(sh); gg.deleteAttribute('uv');
  const c = col(LEAVES[i % LEAVES.length]), dark = c.clone().multiplyScalar(0.72), light = c.clone().lerp(col('#ffe8b8'), 0.22);
  return paint(gg, (p, n, o) => o.copy(light).lerp(dark, clamp((Math.hypot(p.x, p.y) / size - 0.25) * 1.3)));
});
const _qn = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0), _nn = new THREE.Vector3();
/** lay a leaf in a Builder at (x, y, z), its face along the normal n (default up), spun at random */
function layLeaf(B, r, x, y, z, n = _up, size = 0.11) {
  const lg = leafGeo(Math.floor(r() * 6), size).clone();
  lg.rotateZ(r() * TAU); lg.rotateX(-Math.PI / 2); lg.applyQuaternion(_qn.setFromUnitVectors(_up, n)); lg.translate(x, y, z);
  B.add(lg, null);
}
/** a few flat momiji scattered round a point in a Builder (dry leaves on a prop) */
function strewLeaves(B, r, x, z, R, n, y = 0.012) {
  for (let k = 0; k < n; k++) { const a = r() * TAU, d = Math.sqrt(r()) * R; layLeaf(B, r, x + Math.cos(a) * d, y + r() * 0.012, z + Math.sin(a) * d, _nn.set((r() - 0.5) * 0.3, 1, (r() - 0.5) * 0.3).normalize(), 0.09 + r() * 0.03); }
}
/** a heap of fallen momiji: a mounded mulch of deep reds and browns in soft patches, shingled with leaves */
function leafHeapPc(seed, R, h) {
  return cached(`heap:${seed}:${R}:${h}`, () => BP.kit(seed * 13 + 7, B => {
    const r = mulberry32(seed * 91 + 7), pal = ['#5e2a1e', '#7e3624', '#9a4a28', '#6e4630', '#4e3022'].map(c => col(c));
    const body = puff(V(0, 0, 0), R, { detail: 2, noise: 0.2, squash: h / R, seed: seed + 3 });
    B.add(body, (p, n, o) => { const t = clamp(Math.sin(p.x * 5.1 + seed) * Math.cos(p.z * 4.3 - seed) * 0.5 + 0.5) * 3.99, k = Math.floor(t); o.copy(pal[k]).lerp(pal[k + 1], t - k).multiplyScalar(0.7 + 0.32 * clamp(n.y)); });
    const n = Math.round(26 * R * R + 8);
    for (let i = 0; i < n; i++) {
      const a = r() * TAU, u = Math.sqrt(r()) * 0.97, px = Math.cos(a) * u * R, pz = Math.sin(a) * u * R, py = h * Math.sqrt(Math.max(0, 1 - u * u)) + 0.008;
      layLeaf(B, r, px, py, pz, _nn.set(px / (R * R), py / (h * h), pz / (R * R)).normalize(), 0.1 + r() * 0.04);
    }
  }, 0.01));
}
/** a patch of fallen leaves lying flat (a dozen momiji over ~1.6 m), baked into the floor's low clutter (no shadows) */
const litterPc = seed => cached('litter:' + seed, () => BP.kit(seed * 5 + 1, B => strewLeaves(B, mulberry32(seed * 37 + 3), 0, 0, 0.8, 9 + seed % 3 * 2, 0.008), 0.004));
function litter(W, x, z, s = 1, seed = 0, rot = 0, y = 0) { W.clutter.addVC(litterPc(Math.abs(Math.round(seed)) % 4).body, M(x, y, z, s, 1, s, 0, rot, 0), 0.82); }
/** bake a leaf heap into the floor's chunks (radius / height snapped so the pieces cache) */
function heap(W, x, z, R, h, seed, rot = 0, y = 0) {
  const Rq = Math.max(0.3, Math.round(R * 10) / 10), hq = Math.max(0.1, Math.round(h * 20) / 20);
  addPiece(W, leafHeapPc(seed & 3, Rq, hq), x, z, rot, { y: y + 0.02, mul: 0.9 });
}

// ------------------------------------------------------------------ cached kit pieces (world/buildings Builder)
/** a paper lantern hung from a dark post with a crook arm (red or cream paper; local +z: the arm's side) */
function chochinPost(seed = 0, h = 1.75) {
  return cached(`cpost:${seed}:${h}`, () => BP.kit(seed * 7 + 3, B => {
    lanternPost(B, { h, color: seed % 3 === 2 ? '#f4e6c8' : P.paper });
    const r = mulberry32(seed * 31 + 5);
    strewLeaves(B, r, 0, 0, 0.45, 5);
  }, 0.008));
}
/** a little hollow-root shrine: a stone plinth, a weathered wooden hokora with lattice doors, a copper-green gable roof
 *  hung with shimenawa, an offering box, a tokkuri of sake and two tiny stone tanuki (local +z faces the visitor) */
function hokora(seed = 0) {
  return cached('hokora:' + seed, () => BP.kit(seed * 13 + 5, B => {
    const base = BG.box(1.5, 0.3, 1.2, 0.05); base.translate(0, 0.15, 0); B.add(base, (p, n, o) => o.set('#a49688').multiplyScalar(n.y > 0.5 ? 1 : 0.84));
    const st = BG.box(1.0, 0.12, 0.3, 0.03); st.translate(0, 0.06, 0.74); B.add(st, '#968878');
    B.at([0, 0.3, -0.05], 0, () => {
      const box = BG.box(0.86, 0.8, 0.7, 0.03); box.translate(0, 0.4, 0); B.add(box, (p, n, o) => o.set('#8a6448').multiplyScalar(0.86 + 0.14 * Math.sin(p.x * 30) * 0.5 + 0.07));
      for (const sx of [-1, 1]) { const d = BG.box(0.36, 0.56, 0.03, 0.01); d.translate(sx * 0.2, 0.38, 0.36); B.add(d, '#3e2a22'); for (let k = 0; k < 4; k++) { const l = BG.box(0.34, 0.018, 0.02, 0); l.translate(sx * 0.2, 0.16 + k * 0.14, 0.38); B.add(l, '#d8b484'); } }
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const p = BG.box(0.07, 0.86, 0.07, 0.01); p.translate(sx * 0.43, 0.43, sz * 0.35); B.add(p, '#5e4232'); }
      roof(B, { type: 'gable', w: 0.94, d: 0.78, y0: 0.82, over: 0.3, gOver: 0.24, H: 0.46, curve: 0.3, lift: 0.08, liftW: 0.36, thick: 0.08, ribW: 0.22, color: '#5e8a78', moss: 0.35, mossColor: '#8a7a3a', pastel: 0.05 });
      shimenawa(B, { w: 0.82, y: 0.78, sag: 0.07, z: 0.42, r: 0.028 });
      const ob = BG.box(0.42, 0.2, 0.24, 0.02); ob.translate(0, 0.1, 0.62); B.add(ob, '#6e4e38');
      for (let k = 0; k < 4; k++) { const s = BG.box(0.38, 0.02, 0.022, 0); s.translate(0, 0.21, 0.54 + k * 0.05); B.add(s, '#3e2a22'); }
      const bell = BG.sph(0.06, 8, 6); bell.translate(0, 0.94, 0.5); B.add(bell, BC.gold);
      const rope = BG.cyl(0.012, 0.012, 0.5, 4); rope.translate(0.05, 0.62, 0.52); B.add(rope, '#e84a3a');
      const tk = BG.lathe([[0.001, 0], [0.05, 0.01], [0.06, 0.06], [0.04, 0.11], [0.02, 0.14], [0.024, 0.17], [0.001, 0.18]], 8); tk.translate(-0.28, 0.2, 0.6); B.add(tk, '#f4ece0');
    });
    for (const sx of [-1, 1]) B.at([sx * 0.95, 0, 0.5], -sx * 0.3, () => { // two round stone tanuki in straw hats
      const pl = BG.box(0.32, 0.22, 0.32, 0.04); pl.translate(0, 0.11, 0); B.add(pl, '#968878');
      const s = '#c4b8ac', body = BG.sph(0.15, 10, 8); body.scale(1, 1.05, 0.95); body.translate(0, 0.36, 0); B.add(body, s);
      const bel = BG.sph(0.1, 8, 6); bel.scale(1, 1, 0.6); bel.translate(0, 0.34, 0.08); B.add(bel, '#dcd2c6');
      const head = BG.sph(0.1, 10, 8); head.translate(0, 0.56, 0.02); B.add(head, s);
      for (const e of [-1, 1]) { const ear = BG.sph(0.03, 6, 4); ear.translate(e * 0.07, 0.65, 0); B.add(ear, s); }
      const hat = BG.cone(0.15, 0.07, 10); hat.translate(0, 0.66, 0); B.add(hat, '#d8b46a');
      const bib = BG.cone(0.1, 0.1, 10); bib.rotateX(Math.PI); bib.scale(1, 1, 0.7); bib.translate(0, 0.46, 0.06); B.add(bib, BC.red);
    });
    B.light([0, 0.9, 0.55], { color: '#ffd8a0', intensity: 1.2, radius: 4, flicker: 0.4, nightOnly: false });
  }, 0.02));
}
/** a tangle of old maple roots spilling out of the wall foot, leaves and a mushroom cluster in it; local -z = the wall */
function rootTangle(seed = 0) {
  return cached('roots:' + seed, () => BP.kit(seed * 23 + 9, B => {
    const r = mulberry32(seed * 53 + 1), m = 4 + Math.floor(r() * 3);
    for (let i = 0; i < m; i++) {
      const x0 = (r() - 0.5) * 1.6, len = 1.0 + r() * 1.5, side = (r() - 0.5) * 1.6, thick = i < 2, R = (thick ? 0.15 : 0.06) + r() * 0.04;
      const pts = [];
      for (let k = 0; k <= 6; k++) { const t = k / 6; pts.push({ p: V(x0 + side * t * t + Math.sin(t * 5 + i) * 0.12, (thick ? 0.6 : 0.35) * (1 - t) * (1 - t) + 0.04 + Math.sin(t * Math.PI) * 0.07, -0.25 + t * len), r: R * (1 - t * 0.72) }); }
      B.add(barkGeo(pts, { radial: thick ? 7 : 5, moss: thick ? 0.35 : 0, leafy: 0.08, seed: i + seed }), null);
    }
    for (let k = 0; k < 3; k++) { const g0 = puff(V((r() - 0.5) * 1.4, 0.05, -0.1 + r() * 0.3), 0.13 + r() * 0.08, { detail: 1, noise: 0.35, squash: 0.7, seed: seed + 9 + k }); B.add(g0, (p, n, o) => o.set('#5a4636').lerp(col('#8a705a'), clamp(n.y))); }
    strewLeaves(B, r, 0, 0.4, 0.9, 10, 0.02);
  }, 0.01));
}
/** a fallen maple branch on the floor: a forked limb, twigs, a few leaves still on it and more around (along local x) */
function fallenBranch(seed = 0) {
  return cached('branch:' + seed, () => BP.kit(seed * 31 + 4, B => {
    const r = mulberry32(seed * 61 + 7), L = 2.4 + r() * 0.6;
    const main = []; for (let k = 0; k <= 6; k++) { const t = k / 6; main.push({ p: V(-L / 2 + t * L, 0.1 - t * 0.04 + Math.sin(t * Math.PI) * 0.06, Math.sin(t * 4 + seed) * 0.12), r: 0.11 * (1 - t * 0.55) }); }
    B.add(barkGeo(main, { radial: 6, moss: 0.25, seed }), null);
    for (let f = 0; f < 3; f++) {
      const t0 = 0.3 + f * 0.22, b0 = main[Math.round(t0 * 6)].p, sd = f % 2 ? 1 : -1, l2 = 0.7 + r() * 0.5;
      const pts = [{ p: b0.clone(), r: 0.05 }, { p: b0.clone().add(V(l2 * 0.5, 0.05, sd * l2 * 0.4)), r: 0.035 }, { p: b0.clone().add(V(l2 * 0.9, 0.03, sd * l2 * 0.75)), r: 0.015 }];
      B.add(barkGeo(pts, { radial: 4, seed: f + seed }), null);
      for (let k = 0; k < 3; k++) { const lg = leafGeo(Math.floor(r() * 6)).clone(); lg.rotateX(-Math.PI / 2 + 0.5); lg.rotateY(r() * TAU); const q = pts[2].p; lg.translate(q.x + (r() - 0.5) * 0.2, q.y + 0.05, q.z + (r() - 0.5) * 0.2); B.add(lg, null); }
    }
    strewLeaves(B, r, 0, 0.2, 1.4, 16);
  }, 0.01));
}
/** a root knee: a great root breaking the floor in a low arch and diving back in, rootlets either end (along local x) */
function rootKnee(seed = 0, L = 2.0) {
  return cached(`knee:${seed}:${L}`, () => BP.kit(seed * 19 + 2, B => {
    const r = mulberry32(seed * 41 + 3), H = 0.28 + r() * 0.2, R = 0.13 + r() * 0.05;
    const pts = []; for (let k = 0; k <= 8; k++) { const t = k / 8; pts.push({ p: V(-L / 2 + t * L, -0.12 + Math.sin(t * Math.PI) * (H + 0.12), Math.sin(t * 3 + seed) * 0.1), r: R * (0.9 + 0.2 * Math.sin(t * Math.PI)) }); }
    B.add(barkGeo(pts, { radial: 7, moss: 0.3, leafy: 0.1, seed }), null);
    for (const e of [-1, 1]) for (let k = 0; k < 2; k++) { const a = (r() - 0.5) * 1.6 + (e < 0 ? Math.PI : 0), x0 = e * L * 0.42; B.add(barkGeo([{ p: V(x0, 0.03, 0), r: 0.05 }, { p: V(x0 + Math.cos(a) * 0.45, 0.04, Math.sin(a) * 0.45), r: 0.03 }, { p: V(x0 + Math.cos(a) * 0.8, -0.04, Math.sin(a) * 0.8), r: 0.012 }], { radial: 4, seed: k }), null); }
    for (let k = 0; k < 4; k++) { const e = k % 2 ? 1 : -1, g0 = puff(V(e * L * (0.4 + r() * 0.12), 0.02, (r() - 0.5) * 0.4), 0.1 + r() * 0.06, { detail: 1, noise: 0.35, squash: 0.5, seed: seed + k }); B.add(g0, (p, n, o) => o.set('#4e3a2c').lerp(col('#7a604a'), clamp(n.y))); }
    strewLeaves(B, r, 0, 0, L * 0.5, 7);
  }, 0.01));
}
/** a cut maple stump: ringed top, bark, glowing shelf fungus up one side, mushrooms at its foot */
function stump(seed = 0) {
  return cached('stump:' + seed, () => BP.kit(seed * 29 + 7, B => {
    const r = mulberry32(seed * 43 + 1), R = 0.36 + r() * 0.1, H = 0.42 + r() * 0.2;
    const pts = [{ p: V(0, -0.05, 0), r: R * 1.2 }, { p: V(0, H * 0.3, 0), r: R }, { p: V(0, H, 0), r: R * 0.95 }];
    B.add(barkGeo(pts, { radial: 10, cap: false, moss: 0.2, seed }), null);
    const top = BG.disc(R * 0.95, 14); top.rotateX(-Math.PI / 2); top.translate(0, H, 0);
    B.add(top, (p, n, o) => { const d = Math.hypot(p.x, p.z) / (R * 0.95); o.set('#c8a07a').lerp(col('#8a6448'), (Math.sin(d * 28) * 0.5 + 0.5) * 0.45 + d * 0.3); });
    for (let k = 0; k < 4; k++) { const a = (k - 1.5) * 0.35, y = H * (0.25 + k * 0.17), sh = BG.sph(0.13 - k * 0.015, 10, 5); sh.scale(1, 0.32, 0.8); sh.translate(Math.cos(a) * (R + 0.06), y, Math.sin(a) * (R + 0.06)); B.glow(sh, k % 2 ? '#c86a2a' : '#a8582a', { flicker: 0.1 }); }
    for (let k = 0; k < 5; k++) { const a = r() * TAU; roots5(B, r, Math.cos(a) * R, Math.sin(a) * R, a); }
    strewLeaves(B, r, 0, 0, 0.9, 8);
  }, 0.01));
}
function roots5(B, r, x, z, a) { B.add(barkGeo([{ p: V(x * 0.9, 0.12, z * 0.9), r: 0.07 }, { p: V(x * 1.3 + Math.cos(a) * 0.15, 0.03, z * 1.3 + Math.sin(a) * 0.15), r: 0.045 }, { p: V(x * 1.4 + Math.cos(a) * 0.4, -0.05, z * 1.4 + Math.sin(a) * 0.4), r: 0.015 }], { radial: 5 }), null); }
/** a drying rack hung with strings of hoshigaki (dried persimmons) under a straw rain cover (along local x) */
function hoshigakiRack(seed = 0) {
  return cached('hoshi:' + seed, () => BP.kit(seed * 11 + 6, B => {
    const r = mulberry32(seed * 7 + 2), W = 1.5, H = 1.55;
    for (const sx of [-1, 1]) { const p = BG.cyl(0.04, 0.05, H + 0.1, 6); p.translate(sx * W / 2, (H + 0.1) / 2, 0); B.add(p, '#5a4232'); }
    const bar = BG.cyl(0.03, 0.03, W + 0.3, 6); bar.rotateZ(Math.PI / 2); bar.translate(0, H, 0); B.add(bar, '#6e5240');
    const cover = BG.box(W + 0.4, 0.05, 0.5, 0.02); cover.rotateX(0.12); cover.translate(0, H + 0.14, 0); B.add(cover, (p, n, o) => o.set('#c8a058').multiplyScalar(0.86 + 0.12 * Math.sin(p.x * 60)));
    for (let i = 0; i < 6; i++) {
      const x = -W / 2 + 0.18 + i * (W - 0.36) / 5, n = 5 + Math.floor(r() * 2);
      const cord = BG.cyl(0.006, 0.006, n * 0.12 + 0.05, 3); cord.translate(x, H - (n * 0.12) / 2, 0); B.add(cord, '#c8a868');
      for (let k = 0; k < n; k++) { const f = BG.sph(0.052, 8, 6); f.scale(1, 0.82, 0.9); f.translate(x + (r() - 0.5) * 0.02, H - 0.1 - k * 0.12, 0); B.add(f, (p, nn, o) => o.set(k % 3 ? '#c8642a' : '#b0502a').lerp(col('#e89048'), clamp(nn.y) * 0.4)); const cx = BG.cyl(0.03, 0.02, 0.02, 4); cx.translate(x, H - 0.06 - k * 0.12, 0); B.add(cx, '#4a3a22'); }
    }
    strewLeaves(B, r, 0, 0.3, 0.8, 6);
  }, 0.01));
}
/** a low table laid with a tokkuri and cups on a straw zabuton or two (the sake cellar) */
function sakeTable(seed = 0) {
  return cached('stable:' + seed, () => BP.kit(seed * 5 + 9, B => {
    const top = BG.box(1.0, 0.07, 0.6, 0.02); top.translate(0, 0.32, 0); B.add(top, (p, n, o) => o.set('#7a5440').multiplyScalar(n.y > 0.5 ? 1 : 0.8));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const l = BG.box(0.06, 0.3, 0.06, 0.01); l.translate(sx * 0.42, 0.15, sz * 0.24); B.add(l, '#4e3628'); }
    const tk = BG.lathe([[0.001, 0], [0.07, 0.01], [0.09, 0.08], [0.06, 0.16], [0.03, 0.2], [0.035, 0.24], [0.001, 0.25]], 10); tk.translate(-0.2, 0.355, 0.05); B.add(tk, (p, n, o) => o.set(p.y > 0.47 && p.y < 0.5 ? '#3a5aa8' : '#f4ece0'));
    for (const [x, z] of [[0.12, 0.1], [0.28, -0.08], [0.05, -0.14]]) { const c = BG.cyl(0.045, 0.035, 0.05, 8); c.translate(x, 0.38, z); B.add(c, '#f6f0e4'); const s = BG.disc(0.038, 8); s.rotateX(-Math.PI / 2); s.translate(x, 0.402, z); B.add(s, '#e8d8a8'); }
    for (const sz of [-1, 1]) { const zb = BG.box(0.5, 0.07, 0.5, 0.03); zb.translate(0, 0.035, sz * 0.62); B.add(zb, (p, n, o) => o.set(sz > 0 ? '#c8a058' : '#b8484a').multiplyScalar(0.9 + 0.1 * Math.sin(p.x * 50))); }
  }, 0.01));
}
/** two great roots rising out of the floor and twisting together into an arch overhead (a hollow-root doorway); local
 *  x across the arch, +z its face */
function rootArch(seed = 0, w = 2.6, h = 2.8) {
  return cached(`arch:${seed}:${w}:${h}`, () => BP.kit(seed * 37 + 1, B => {
    const r = mulberry32(seed * 17 + 9);
    // three roots twisting round each other up one side and over to the far foot (a rope of roots)
    for (let sI = 0; sI < 3; sI++) {
      const pts = [], N = 22, ph = sI / 3 * TAU, R0 = sI === 2 ? 0.11 : 0.17;
      for (let k = 0; k <= N; k++) {
        const t = k / N, a = t * Math.PI, cx = -Math.cos(a) * w * 0.5 * (1 + 0.12 * Math.sin(t * Math.PI)), cy = Math.sin(a) * h - 0.15;
        const tx = Math.sin(a) * w * 0.5, ty = Math.cos(a) * h, tl = Math.hypot(tx, ty) || 1, nx = -ty / tl, ny = tx / tl, phi = t * TAU * 1.4 + ph, rr = 0.2 * (1 - 0.35 * Math.sin(t * Math.PI)) + 0.25 * Math.max(0, Math.abs(t - 0.5) - 0.38) / 0.12; // (the strands splay at the feet)
        pts.push({ p: V(cx + nx * Math.cos(phi) * rr, cy + ny * Math.cos(phi) * rr - (k === 0 || k === N ? 0.25 : 0), Math.sin(phi) * rr), r: R0 * (1.15 - 0.4 * Math.sin(t * Math.PI)) * (1 + 0.1 * Math.sin(t * 11 + sI)) });
      }
      B.add(barkGeo(pts, { radial: 7, moss: 0.22, leafy: 0.1, seed: seed + sI * 7, c0: '#34241c', c1: '#7a5a46' }), null);
    }
    for (const e of [-1, 1]) {
      for (let k = 0; k < 3; k++) { const a = (r() - 0.5) * 1.2 + (e > 0 ? 0 : Math.PI), x0 = e * w * 0.52; B.add(barkGeo([{ p: V(x0, 0.1, 0), r: 0.08 }, { p: V(x0 + Math.cos(a) * 0.5, 0.04, Math.sin(a) * 0.5), r: 0.05 }, { p: V(x0 + Math.cos(a) * 0.95, -0.05, Math.sin(a) * 0.95), r: 0.015 }], { radial: 5, seed: k }), null); }
    }
    for (let k = 0; k < 7; k++) { // hair roots hanging from the crown of the arch
      const x = (k / 6 - 0.5) * w * 0.7, y0 = h * 0.9 - Math.abs(x) * 0.25, len = 0.3 + r() * 0.5;
      B.add(barkGeo([{ p: V(x, y0, 0.05), r: 0.025 }, { p: V(x + (r() - 0.5) * 0.1, y0 - len * 0.6, 0.08), r: 0.015 }, { p: V(x + (r() - 0.5) * 0.15, y0 - len, 0.1), r: 0.005 }], { radial: 3, c0: '#4a3428', c1: '#7a5c46' }), null);
    }
    shimenawa(B, { w: w * 0.8, y: h * 0.82, sag: 0.18, z: 0.22, r: 0.05 });
    for (let k = 0; k < 4; k++) { const x = (k / 3 - 0.5) * w * 0.6; B.at([x, h * 0.74 - Math.abs(x) * 0.05, 0.25], 0, () => { for (let j = 0; j < 3; j++) { const pl = BG.plane(0.08, 0.1); pl.translate(j % 2 ? 0.025 : -0.025, -0.05 - j * 0.09, 0.01); B.cloth(pl, '#ffffff', { x0: -0.06, x1: 0.06, yTop: 0, yBot: -0.3 }); } }); }
  }, 0.01));
}
/** a sake-barrel pyramid on a low wooden stand (komodaru 3-2-1), straw rope round the stand (local +z faces out) */
function barrelPyramid(W, x, z, rot, { s = 1, stand = true, n = 6 } = {}) {
  const tx = Math.cos(rot), tz = -Math.sin(rot), y0 = stand ? 0.22 * s : 0;
  if (stand) addPiece(W, cached('stand:' + s, () => BP.kit(3, B => { const b = BG.box(1.95, 0.22, 0.8, 0.03); b.translate(0, 0.11, 0); B.add(b, (p, nn, o) => o.set('#6a4c38').multiplyScalar(nn.y > 0.5 ? 1 : 0.78)); for (let k = 0; k < 5; k++) { const l = BG.box(0.02, 0.2, 0.82, 0); l.translate(-0.8 + k * 0.4, 0.11, 0); B.add(l, '#4a3428'); } }, 0.01)), x, z, rot, { s });
  const rows = n >= 6 ? [[-0.62, 0], [0, 0], [0.62, 0], [-0.31, 0.53], [0.31, 0.53], [0, 1.06]] : [[-0.31, 0], [0.31, 0], [0, 0.53]];
  for (const [u, y] of rows) addPiece(W, Pr.komodaru(Math.round(u * 10 + y * 7 + x) & 7), x + tx * u * s, z + tz * u * s, rot, { y: y0 + y * s, s, mul: 0.82 });
}

// ------------------------------------------------------------------ the wall kit
const at = (s, o, y, lat = 0) => V(s.x - s.nx * o + s.tx * lat, y, s.z - s.nz * o + s.tz * lat); // o: metres out into the room
/** a great maple root buttressing out of the brow, arching over the wall foot and diving into the floor, a side root
 *  splitting off, rootlets and clods where it goes in; some girdled in a shimenawa with shide (a sacred root) */
function rootButtress(W, s, q) {
  if (s.thick < 1.4) return false;
  const h = s.h, side = (q() - 0.5) * 1.4, sg = q() < 0.5 ? -1 : 1, R = 0.25 + q() * 0.09;
  let k = 1.6 + q() * 0.7;
  for (; k > 1.15; k -= 0.15) { const e = at(s, k, 0, side + 0.5 * sg); if (freeAt(W, e.x, e.z, 0.45) && !inStream(W, e.x, e.z, 0.12) && !W.keepClear(e.x, e.z, 0.9) && W.walkable(e.x + s.tx, e.z + s.tz) && W.walkable(e.x - s.tx, e.z - s.tz)) break; }
  if (k <= 1.15) return false;
  const path = [[-0.9, 1.24 * h, -0.1, 1.15], [-0.2, 1.14 * h, 0, 1.12], [0.5, 1.04 * h, 0.05, 1.06], [0.95 + k * 0.1, 0.86 * h, 0.14, 1], [k * 0.86, 0.6 * h, 0.28, 0.94], [k * 1.0, 0.32 * h, 0.4, 0.92], [k * 1.04, 0.1, 0.5, 1.08], [k + 0.12, -0.2, 0.55, 0.9]];
  const pts = path.map(([o, y, l, rk]) => ({ p: at(s, o, y, side + l * sg), r: R * rk }));
  addBark(W.wallDeco, pts, { radial: 9, moss: 0.32, leafy: 0.1, seed: Math.floor(q() * 50) });
  // knots along it, a side root, rootlets and clods at the foot
  for (const t of [3, 4]) { const p = pts[t].p; W.wallDeco.add(SH.sphLo(), M(p.x, p.y + R * 0.4, p.z, R * 0.45, R * 0.35, R * 0.45, q(), q() * TAU, 0), null, grad(P.bark0, P.bark1)); }
  { const b = pts[4].p, e = at(s, k * 0.8, -0.15, side - 0.6 * sg); addBark(W.wallDeco, [{ p: b.clone(), r: R * 0.55 }, { p: b.clone().lerp(e, 0.45).add(V(0, -0.15, 0)), r: R * 0.45 }, { p: e, r: R * 0.32 }], { radial: 6, moss: 0.2, seed: 3 }); W.collision.addCircle(e.x, e.z, R * 0.6); }
  const foot = pts[6].p;
  for (let i = 0; i < 3; i++) { const a = q() * TAU, L = 0.5 + q() * 0.4; addBark(W.solid, [{ p: V(foot.x, 0.1, foot.z), r: R * 0.32 }, { p: V(foot.x + Math.cos(a) * L * 0.55, 0.04, foot.z + Math.sin(a) * L * 0.55), r: R * 0.2 }, { p: V(foot.x + Math.cos(a) * L, -0.04, foot.z + Math.sin(a) * L), r: 0.012 }], { radial: 4 }); }
  for (let i = 0; i < 4; i++) W.wallDeco.add(SH.rock(), M(foot.x + (q() - 0.5) * 0.8, 0.04, foot.z + (q() - 0.5) * 0.8, 0.1 + q() * 0.07, 0.07, 0.1, q(), q() * TAU, q()), null, earthP);
  W.collision.addCircle(foot.x, foot.z, R * 1.35);
  if (q() < 0.3) { // a sacred root: a straw rope round it and three zigzag shide
    const a = pts[3].p, b = pts[4].p, c = a.clone().lerp(b, 0.4), t = b.clone().sub(a).normalize(), n1 = new THREE.Vector3().crossVectors(t, V(0, 1, 0)).normalize(), n2 = new THREE.Vector3().crossVectors(t, n1).normalize(), rr = R * 1.12;
    const ring = []; for (let i = 0; i <= 18; i++) { const an = i / 18 * TAU; ring.push({ p: c.clone().addScaledVector(n1, Math.cos(an) * rr).addScaledVector(n2, Math.sin(an) * rr), r: 0.045 }); }
    W.wallDeco.addGeo(tube(ring, 5, false), c.x, c.z, null, (px, py, pz, nx, ny, nz, o) => o.set('#e8d29a').multiplyScalar(0.84 + 0.16 * Math.sin((px + pz) * 60)));
    for (let i = 0; i < 3; i++) { const an = (i - 1) * 0.8 - Math.PI / 2, p0 = c.clone().addScaledVector(n1, Math.cos(an) * rr).addScaledVector(n2, Math.sin(an) * rr); for (let j = 0; j < 3; j++) W.wallDeco.add(SH.box(), M(p0.x + (j % 2 ? 0.03 : -0.03) * s.tx, p0.y - 0.06 - j * 0.09, p0.z + (j % 2 ? 0.03 : -0.03) * s.tz, 0.07, 0.09, 0.006, 0, Math.atan2(-s.nx, -s.nz), 0), col('#fffaf0')); }
  }
  return true;
}
/** pale-dark hair roots dangling from the brow's nose, thinning to threads */
function hangingRoots(W, s, q, n = 2) {
  const WD = W.wallDeco;
  for (let i = 0; i < n; i++) {
    const o = (q() - 0.5) * 1.6, bx = s.x + s.tx * o, bz = s.z + s.tz * o, len = 0.6 + q() * 1.2, R = 0.024 + q() * 0.022, sw = (q() - 0.5) * 0.25;
    const pt = (off, y) => V(bx - s.nx * off + s.tx * sw * (1 - y / s.h), y, bz - s.nz * off + s.tz * sw * (1 - y / s.h));
    const pts = [{ p: pt(0.1, s.h * 1.1), r: R * 1.3 }, { p: pt(0.47, s.h * 1.07), r: R * 1.2 }, { p: pt(0.66, s.h * 0.98), r: R }, { p: pt(0.68, s.h * 0.88), r: R * 0.8 }, { p: pt(0.66 + sw * 0.3, s.h * 0.88 - len * 0.6), r: R * 0.5 }, { p: pt(0.64 + sw * 0.5, s.h * 0.88 - len), r: R * 0.2 }];
    WD.addGeo(tube(pts, 5, true), bx, bz, null, (x, y, z, nx, ny, nz, oc) => oc.copy(col('#3e2c22')).lerp(col('#7e624c'), clamp(nx * nx * 0.3 + 0.35 + (y - s.h * 0.8) * 0.25)));
    if (q() < 0.4) { const tp = pts[5].p; WD.add(SH.leaf(), M(tp.x, tp.y + 0.02, tp.z, 0.1, 0.06, 0.1, 1.2, q() * TAU, 0.3), col(LEAVES[Math.floor(q() * 6)])); }
  }
}
function rootNiche(W, s, addLight) { // a hollow carved in the earth, framed by two roots, a red paper lantern hung in it
  const q = W.krng, WD = W.wallDeco, y = Math.min(1.25, s.h * 0.42), face = Math.atan2(-s.nx, -s.nz), cx = s.x - s.nx * 0.02, cz = s.z - s.nz * 0.02;
  WD.add(SH.disc(), M(cx, y + 0.38, cz, 0.48, 0.03, 0.62, Math.PI / 2, face, 0), col('#1e1410'));
  for (const e of [-1, 1]) { const pts = []; for (let k = 0; k <= 6; k++) { const t = k / 6, a = Math.PI * t; pts.push({ p: V(cx + s.tx * e * (0.55 - 0.08 * Math.sin(a)) - s.nx * (0.08 + Math.sin(a) * 0.1), y - 0.25 + t * 1.45, cz + s.tz * e * (0.55 - 0.08 * Math.sin(a)) - s.nz * (0.08 + Math.sin(a) * 0.1)), r: 0.08 - t * 0.03 }); } pts.push({ p: V(cx - s.nx * 0.1 + s.tx * e * 0.1, y + 1.3, cz - s.nz * 0.1 + s.tz * e * 0.1), r: 0.04 }); addBark(WD, pts, { radial: 5, seed: e + 4 }); }
  const lx = cx - s.nx * 0.3, lz = cz - s.nz * 0.3;
  addPiece(W, cached('nicheLamp', () => BP.kit(41, B => { const cord = BG.cyl(0.01, 0.01, 0.3, 4); cord.translate(0, 0.15, 0); B.add(cord, '#2a1e18'); B.at([0, 0, 0], 0, () => { const c = BG.cyl(0.075, 0.085, 0.04, 10); c.translate(0, -0.02, 0); B.add(c, '#2a2226'); }); const pts = []; for (let k = 0; k <= 10; k++) { const t = k / 10; pts.push([Math.max(0.001, 0.15 * (0.45 + 0.55 * Math.sin(t * Math.PI))), -0.04 - t * 0.32]); } const pg = BG.lathe(pts, 12); B.glow(pg, '#e8503a', { flicker: 1, tint: 0.5 }); const b = BG.cyl(0.085, 0.075, 0.04, 10); b.translate(0, -0.38, 0); B.add(b, '#2a2226'); }, 0.005)), lx, lz, face, { y: y + 0.82, wall: true, lights: false });
  W.halos.add(lx - s.nx * 0.2, y + 0.6, lz - s.nz * 0.2, 1.5, '#ff8a5a', 0.5, 1);
  addLight(lx - s.nx * 0.7, y + 0.6, lz - s.nz * 0.7, P.lantern, 4, 5.5, 0.7);
  for (let k = 0; k < 3; k++) WD.add(SH.rock(), M(cx - s.nx * (0.2 + q() * 0.2) + s.tx * (k - 1) * 0.3, 0.04, cz - s.nz * (0.2 + q() * 0.2) + s.tz * (k - 1) * 0.3, 0.08, 0.05, 0.08, q(), q() * TAU, 0), null, earthP);
}
function shelfFungus(W, s, addLight) { // glowing bracket fungus stacked up the earthen face, mushrooms at its foot
  const q = W.krng, WG = W.wallGlow, face = Math.atan2(-s.nx, -s.nz), n = 3 + Math.floor(q() * 3);
  for (let k = 0; k < n; k++) {
    const o = (q() - 0.5) * 1.0, y = 0.5 + k * 0.32 + q() * 0.1, x = s.x - s.nx * 0.18 + s.tx * o, z = s.z - s.nz * 0.18 + s.tz * o, R = 0.2 - k * 0.022 + q() * 0.04;
    WG.add(SH.sphLo(), M(x, y, z, R, R * 0.28, R * 0.72, 0.1, face, 0), null, (px, py, pz, nx, ny, nz, oc) => oc.copy(col('#8a4a1e')).lerp(col('#d8904a'), clamp(ny * 0.8 + 0.2)).lerp(col('#ffd890'), clamp(Math.hypot(px - x, pz - z) / R - 0.7) * 0.6));
  }
  W.halos.add(s.x - s.nx * 0.5, 0.95, s.z - s.nz * 0.5, 1.8, P.fungus, 0.3, 0.3);
  addLight(s.x - s.nx * 0.9, 1.0, s.z - s.nz * 0.9, '#ffa860', 3, 4.5, 0.25);
  const PL = placer(W);
  for (let k = 0; k < 2; k++) PL.multi(F.mushrooms(Math.floor(q() * 4), q() < 0.5 ? 'shimeji' : 'shiitake'), s.x - s.nx * 0.45 + s.tx * (k - 0.5) * 0.7, 0, s.z - s.nz * 0.45 + s.tz * (k - 0.5) * 0.7, { rot: q() * TAU, s: 0.9 + q() * 0.4 });
}
function jizoNiche(W, s) { // a little stone jizō in a red bib standing in an alcove, an offering of persimmons, a candle
  const q = W.krng, WD = W.wallDeco, face = Math.atan2(-s.nx, -s.nz), cx = s.x - s.nx * 0.05, cz = s.z - s.nz * 0.05;
  WD.add(SH.disc(), M(cx, 0.75, cz, 0.55, 0.03, 0.72, Math.PI / 2, face, 0), col('#1e1410'));
  for (let k = 0; k < 9; k++) { const a = Math.PI * (k / 8), ox = Math.cos(a) * 0.58, oy = Math.sin(a) * 0.7; WD.add(SH.rock(), M(cx + s.tx * ox - s.nx * 0.05, 0.12 + oy * 1.05, cz + s.tz * ox - s.nz * 0.05, 0.11, 0.09, 0.08, q(), q() * TAU, q()), null, stoneP); }
  addPiece(W, Pr.jizo(Math.floor(q() * 4)), cx - s.nx * 0.32, cz - s.nz * 0.32, face, { s: 0.78, wall: true, mul: 0.85 });
  const cdx = cx - s.nx * 0.62 + s.tx * 0.32, cdz = cz - s.nz * 0.62 + s.tz * 0.32;
  W.wallDeco.add(SH.cyl(), M(cdx, 0, cdz, 0.03, 0.14, 0.03), col('#f4ece0'));
  W.wallGlow.add(SH.cone(), M(cdx, 0.14, cdz, 0.018, 0.06, 0.018), col('#ffd27a'));
  W.halos.add(cdx, 0.22, cdz, 0.7, '#ffc070', 0.55, 1);
}
function leafCrack(W, s, addLight) { // a crack in the brow: thin amber light through it, leaves sifting down onto a heap
  const q = W.krng, ks = W.kitState; if (ks.cracks.length >= 9) return false;
  const face = Math.atan2(-s.nx, -s.nz), fx = s.x - s.nx * 1.15, fz = s.z - s.nz * 1.15;
  if (!freeAt(W, fx, fz, 0.3) || inStream(W, fx, fz, 0.15) || W.keepClear(fx, fz, 0.6)) return false;
  for (let k = 0; k < 2; k++) W.shaftBatch.add(fx + s.tx * (k - 0.5) * 0.35, fz + s.tz * (k - 0.5) * 0.35, 0.5 + q() * 0.3, 7, 0, face + (k - 0.5) * 0.5, 0, 0.07 + q() * 0.03, q() * 10);
  W.floorGlows.add(fx, 0.04, fz, 1.2, '#ffd0a0', 0.2);
  heap(W, fx, fz, 0.55 + q() * 0.25, 0.22 + q() * 0.1, Math.floor(q() * 4), q() * TAU, -0.02);
  addLight(fx, 2.2, fz, '#ffcf96', 2.5, 5, 0.05);
  ks.cracks.push({ x: fx, z: fz, y: 5.5, fx, fz });
  return true;
}
function dressWalls(W, addLight) {
  const r = W.rng, PL = placer(W), WD = W.wallDeco;
  for (const { S, len, seed } of W.wallSamples) {
    const n = S.length;
    let lastSeg = -1;
    for (let i = 0; i < n; i++) { // set pieces on the camera-facing runs, one per ~5.5 m
      const s = S[i], seg = Math.floor(s.u / 5.5);
      if (seg === lastSeg || s.u > len - 2 || s.f < 0.3 || s.h < 1.8) continue;
      if (W.L.arena && Math.hypot(s.x - W.L.arena.x, s.z - W.L.arena.z) < W.L.arena.r + 1.5) continue; // (the arena dresses its own rim)
      lastSeg = seg;
      const hsh = mulberry32(seg * 7919 + seed * 104729)(), q = W.krng;
      if (hsh < 0.34) { if (!rootButtress(W, s, q)) hangingRoots(W, s, q, 3); }
      else if (hsh < 0.48) rootNiche(W, s, addLight);
      else if (hsh < 0.6) shelfFungus(W, s, addLight);
      else if (hsh < 0.69) jizoNiche(W, s);
      else if (hsh < 0.8) { if (!leafCrack(W, s, addLight)) hangingRoots(W, s, q, 3); }
      else if (hsh < 0.92) hangingRoots(W, s, q, 4 + Math.floor(q() * 2));
    }
    for (let i = 0; i < n; i++) { // the wall foot: mushrooms, leaf litter and little heaps, stones, burrs, a fern
      const s = S[i]; if (r() > 0.24) continue;
      const far = s.f > 0.15, k = r(), fx = s.x - s.nx * 0.45, fz = s.z - s.nz * 0.45;
      if (!W.walkable(fx, fz) || W.keepClear(fx, fz) || inStream(W, fx, fz)) continue;
      if (k < 0.18) PL.multi(F.mushrooms(Math.floor(r() * 4), ['shiitake', 'shimeji', 'amanita'][Math.floor(r() * 3)]), fx, 0, fz, { rot: r() * TAU, s: 0.9 + r() * 0.5 });
      else if (k < 0.4) litter(W, fx, fz, 0.8 + r() * 0.5, Math.floor(r() * 4), r() * TAU, 0.005);
      else if (far && k < 0.5) heap(W, fx + s.nx * 0.1, fz + s.nz * 0.1, 0.45 + r() * 0.2, 0.18 + r() * 0.1, Math.floor(r() * 4), r() * TAU, -0.02);
      else if (k < 0.62) for (let j = 0; j < 3; j++) WD.add(SH.rock(), M(fx + (r() - 0.5) * 0.7, 0.04, fz + (r() - 0.5) * 0.7, 0.07 + r() * 0.08, 0.05 + r() * 0.04, 0.07 + r() * 0.07, r(), r() * TAU, r()), null, stoneP);
      else if (k < 0.7) PL.multi(F.burrs(Math.floor(r() * 3)), fx, 0, fz, { rot: r() * TAU });
      else if (far && k < 0.78) PL.multi(BF.fern(Math.floor(r() * 4), { big: 0.6 + r() * 0.3 }), fx, 0, fz, { rot: r() * TAU });
      else if (k < 0.84) PL.multi(BF.mossMound(Math.floor(r() * 4)), fx + s.nx * 0.1, -0.03, fz + s.nz * 0.1, { rot: r() * TAU, s: 0.5 + r() * 0.4 });
      else if (k < 0.88) W.mushrooms(W.glow, fx, 0, fz, '#e8a050', 0.42 + r() * 0.18, null);
    }
  }
  dressTops(W);
}
// above the brow: leaf beds and small heaps along the nose, hair roots draping over it, mushrooms, a root coiling out of
// the heap; nothing tall further back, where the roots heave up into the dark
function dressTops(W) {
  const r = mulberry32(W.L.floor * 9173 + 5), PL = placer(W), WD = W.wallDeco;
  let roots = 0, coils = 0;
  for (const { S } of W.wallSamples) {
    let next = r() * 2.6;
    for (const s of S) {
      if (s.u < next) continue;
      const sp = topSpan(s); if (!sp) continue;
      next = s.u + 1.6 + r() * 1.6;
      const far = s.f > 0.15, k = r(), o = sp.o0 + 0.08 + r() * 0.45, y = sp.yAt(o);
      const x = s.x + s.nx * o + s.tx * (r() - 0.5) * 0.6, z = s.z + s.nz * o + s.tz * (r() - 0.5) * 0.6;
      if (k < 0.22) litter(W, x, z, 0.9 + r() * 0.4, Math.floor(r() * 4), r() * TAU, y + 0.01);
      else if (far && k < 0.36) heap(W, x, z, 0.5 + r() * 0.3, 0.2 + r() * 0.12, Math.floor(r() * 4), r() * TAU, y - 0.06);
      else if (far && k < 0.52 && roots < 40) { roots++; hangingRoots(W, s, r, 2); }
      else if (k < 0.6) PL.multi(F.mushrooms(Math.floor(r() * 4), r() < 0.5 ? 'amanita' : 'shiitake'), x, y - 0.02, z, { rot: r() * TAU, s: 0.9 });
      else if (far && k < 0.68 && coils < 16) { // a root coiling up out of the heap and back down
        coils++; const a = r() * TAU, L = 1.0 + r() * 0.8, R = 0.07 + r() * 0.05, ux = Math.cos(a), uz = Math.sin(a);
        addBark(WD, [0, 0.25, 0.5, 0.75, 1].map(t => ({ p: V(x + ux * (t - 0.5) * L, y - 0.1 + Math.sin(t * Math.PI) * (0.35 + R), z + uz * (t - 0.5) * L), r: R * (1 - Math.abs(t - 0.5) * 0.5) })), { radial: 6, moss: 0.3, seed: coils });
      }
      else if (k < 0.78) for (let i = 0; i < 2; i++) WD.add(SH.rock(), M(x + (r() - 0.5) * 0.5, y + 0.04, z + (r() - 0.5) * 0.5, 0.15 + r() * 0.12, 0.1 + r() * 0.07, 0.15 + r() * 0.1, r(), r() * TAU, 0), null, grad('#3e3028', '#5e4a3c', 1, 1.2, -0.1));
    }
  }
  W.topCount = { roots, coils };
}

// ------------------------------------------------------------------ floor props, room lights, centrepieces
function buildProps(W) {
  const r = W.rng, B = W.solid, PL = placer(W);
  for (const p of W.L.props) {
    const wp = W.cellToWorld(p.x, p.y), wl = Math.hypot(p.wx, p.wy) || 1, dx = p.wx / wl, dz = p.wy / wl;
    const hug = p.kind === 'floor' ? 0 : p.kind === 'corner' ? 0.45 : 0.4;
    const x = wp.x + dx * hug * CELL * 0.5 + (r() - 0.5) * (p.kind === 'floor' ? 1.0 : 0.6), z = wp.z + dz * hug * CELL * 0.5 + (r() - 0.5) * (p.kind === 'floor' ? 1.0 : 0.6);
    if (inStream(W, x, z, 0.2)) continue;
    const face = p.kind === 'floor' ? r() * TAU : Math.atan2(-dx, -dz) + (r() - 0.5) * 0.6, k = p.r;
    const collide = rad => W.collision.addCircle(x, z, rad);
    if (p.kind === 'corner') {
      if (k < 0.26 && p.big) { addPiece(W, rootTangle(Math.floor(r() * 4)), x, z, face, { s: 0.8 + r() * 0.2 }); collide(0.5); }
      else if (k < 0.46) { heap(W, x, z, 0.7 + r() * 0.3, 0.3 + r() * 0.12, Math.floor(r() * 4), r() * TAU, -0.03); PL.multi(F.mushrooms(Math.floor(r() * 4), 'shiitake'), x - dz * 0.7, 0, z + dx * 0.7, { rot: r() * TAU }); if (p.big) collide(0.45); }
      else if (k < 0.62 && p.big) { barrelPyramid(W, x, z, face, { s: 0.85, stand: false, n: 3 }); collide(0.65); }
      else if (k < 0.78) { addPiece(W, Pr.jizo(Math.floor(r() * 4)), x, z, face, { s: 0.85, mul: 0.85 }); litter(W, x + dz * 0.5, z - dx * 0.5, 0.8, Math.floor(r() * 4), 0, 0.005); collide(0.28); }
      else { PL.multi(F.mushrooms(Math.floor(r() * 4), 'amanita'), x, 0, z, { rot: r() * TAU, s: 1.2 }); PL.multi(F.burrs(Math.floor(r() * 3)), x + 0.4, 0, z - 0.3, { rot: r() * TAU }); }
    } else if (p.kind === 'edge') {
      if (k < 0.22) PL.multi(F.mushrooms(Math.floor(r() * 4), ['shiitake', 'shimeji', 'amanita'][Math.floor(r() * 3)]), x, 0, z, { rot: r() * TAU, s: 0.9 + r() * 0.4 });
      else if (k < 0.42) litter(W, x, z, 0.8 + r() * 0.4, Math.floor(r() * 4), r() * TAU, 0.005);
      else if (k < 0.52) heap(W, x, z, 0.45 + r() * 0.2, 0.2, Math.floor(r() * 4), r() * TAU, -0.02);
      else if (k < 0.62) PL.multi(F.burrs(Math.floor(r() * 3)), x, 0, z, { rot: r() * TAU });
      else if (k < 0.72 && p.big) { addPiece(W, Pr.komodaru(Math.floor(r() * 6)), x, z, face, { mul: 0.82 }); collide(0.3); }
      else if (k < 0.8) PL.multi(BF.mossMound(Math.floor(r() * 4)), x, -0.03, z, { rot: r() * TAU, s: 0.5 + r() * 0.4 });
      else if (k < 0.9) for (let i = 0; i < 4; i++) B.add(SH.rock(), M(x + (r() - 0.5) * 0.7, 0.03, z + (r() - 0.5) * 0.7, 0.06 + r() * 0.07, 0.04, 0.06 + r() * 0.06, r(), r() * TAU, r()), null, stoneP);
      else if (p.big) { addPiece(W, rootKnee(Math.floor(r() * 4), 1.6), x, z, face + Math.PI / 2, { s: 0.8 }); }
    } else {
      if (k < 0.3) litter(W, x, z, 1 + r() * 0.5, Math.floor(r() * 4), r() * TAU, 0.005);
      else if (k < 0.6) PL.multi(F.mushrooms(Math.floor(r() * 4), 'shimeji'), x, 0, z, { rot: r() * TAU, s: 0.7 + r() * 0.3 });
      else for (let i = 0; i < 3; i++) B.add(SH.rock(), M(x + (r() - 0.5) * 0.6, 0.03, z + (r() - 0.5) * 0.6, 0.05 + r() * 0.06, 0.04, 0.05 + r() * 0.05, r(), r() * TAU, r()), null, stoneP);
    }
  }
}
function buildLights(W) { // the room lights: red paper lanterns on posts and stone toro off the wall, each a warm pool
  const at2 = W.L.at, T = W.theme; let i = 0;
  for (const l of W.L.lights) {
    const wp = W.cellToWorld(l.x, l.y);
    let dx = (at2(l.x + 1, l.y) ? 0 : 1) - (at2(l.x - 1, l.y) ? 0 : 1), dz = (at2(l.x, l.y + 1) ? 0 : 1) - (at2(l.x, l.y - 1) ? 0 : 1);
    const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
    const x = wp.x + dx * 0.35, z = wp.z + dz * 0.35, face = Math.atan2(-dx, -dz);
    if (inStream(W, x, z, 0.2)) continue;
    let fy;
    if (i++ % 3 === 2) { addPiece(W, BP.lantern(Math.floor(W.rng() * 8), { s: 0.95 }), x, z, face, { lights: false, mul: 0.62 }); fy = 0.9; W.halos.add(x, fy, z, 1.1, T.light, 0.3, 1); }
    else { // the post stands at the wall, its arm (and lantern) out over the room
      addPiece(W, chochinPost(i, 1.75), x, z, face, { lights: false, mul: 0.8 });
      const hx = x - dx * 0.34, hz = z - dz * 0.34; fy = 1.4; W.halos.add(hx, fy, hz, 1.5, '#ff8a5a', 0.45, 1);
    }
    W.floorGlows.add(x - dx * 1.1, 0.04, z - dz * 1.1, 3.1, '#ffa860', 0.26, 1);
    W.lightPool.addSource({ pos: V(x - dx * 1.6, 1.4, z - dz * 1.6), color: col(T.light).clone(), intensity: (T.lightI ?? 9) * 0.8, radius: 10, flicker: 0.9 });
    W.collision.addCircle(x, z, 0.3);
  }
}
function buildCenterpieces(W) {
  const r = W.rng, PL = placer(W), B = W.solid;
  for (const c of W.L.centers || []) {
    const p = W.cellToWorld(c.x, c.y);
    if (c.r < 0.34) { // the sacred root: a hollow-root arch girdled in shimenawa, a little hokora sheltering under it
      const ax = p.x - CAMX * 0.4, az = p.z - CAMZ * 0.4;
      addPiece(W, rootArch(Math.floor(r() * 3), 3.2, 3.0), ax, az, CAM);
      addPiece(W, hokora(Math.floor(r() * 3)), p.x - CAMX * 0.5, p.z - CAMZ * 0.5, CAM, { mul: 0.9 });
      for (const e of [-1, 1]) { const lx = p.x + CAMX * 1.1 + CAMX * e * 1.6, lz = p.z + CAMZ * 1.1 - CAMZ * e * 1.6; addPiece(W, chochinPost(e + 7, 1.5), lx, lz, CAM, { lights: false, mul: 0.8 }); W.halos.add(lx + CAMX * 0.34, 1.2, lz + CAMZ * 0.34, 1.3, '#ff8a5a', 0.45, 1); W.collision.addCircle(lx, lz, 0.2); }
      W.lightPool.addSource({ pos: V(p.x + CAMX * 1.6, 1.4, p.z + CAMZ * 1.6), color: col(P.lantern), intensity: 6, radius: 7, flicker: 0.6 });
      for (const e of [-1, 1]) W.collision.addCircle(ax + CAMX * e * 1.6, az - CAMZ * e * 1.6, 0.42);
      W.collision.addCircle(p.x - CAMX * 0.5, p.z - CAMZ * 0.5, 0.85);
      for (let i = 0; i < 3; i++) { const a = r() * TAU; litter(W, p.x + Math.cos(a) * 2.6, p.z + Math.sin(a) * 2.4, 1.1, i, a, 0.005); }
    } else if (c.r < 0.67) { // a great mound of fallen leaves ringed with stones, a stone tanuki sat at its foot, glowing mushrooms
      heap(W, p.x, p.z, 1.6, 0.75, 3, r() * TAU, -0.05);
      for (let i = 0; i < 11; i++) { const a = i / 11 * TAU; B.add(SH.rock(), M(p.x + Math.cos(a) * 1.95, 0.08, p.z + Math.sin(a) * 1.95, 0.2 + r() * 0.08, 0.15, 0.2, r(), r() * TAU, 0), null, stoneP); }
      addPiece(W, Pr.tanuki(Math.floor(r() * 3), { s: 1.0 }), p.x + CAMX * 1.35, p.z + CAMZ * 1.35, CAM, { mul: 0.85 });
      for (let i = 0; i < 3; i++) { const a = CAM + Math.PI + (i - 1) * 0.9; W.mushrooms(W.glow, p.x + Math.cos(a) * 1.55, 0, p.z + Math.sin(a) * 1.55, i % 2 ? '#7ae0c8' : '#e8a050', 0.55, W.halos); }
      W.collision.addCircle(p.x, p.z, 1.6); W.collision.addCircle(p.x + CAMX * 1.35, p.z + CAMZ * 1.35, 0.4);
      W.lightPool.addSource({ pos: V(p.x, 1.2, p.z), color: col('#9ff0d8'), intensity: 3.5, radius: 6, flicker: 0.15 });
    } else { // the sake offering: barrels stacked on a stand, a lantern line behind, two tanuki statues guarding it
      barrelPyramid(W, p.x - CAMX * 0.4, p.z - CAMZ * 0.4, CAM, { s: 0.9 });
      const tx = Math.cos(CAM), tz = -Math.sin(CAM);
      addPiece(W, Pr.lanternLine(3, { L: 3.6, h: 2.3 }), p.x - CAMX * 1.2 - tx * 1.8, p.z - CAMZ * 1.2 - tz * 1.8, CAM, { mul: 0.85, lightK: 0.8, halo: 0.4 });
      for (const e of [-1, 1]) { const x = p.x + tx * e * 1.6 + CAMX * 0.5, z = p.z + tz * e * 1.6 + CAMZ * 0.5; addPiece(W, Pr.tanuki(e > 0 ? 1 : 2, { s: 0.85 }), x, z, CAM + e * 0.3, { mul: 0.85 }); W.collision.addCircle(x, z, 0.35); }
      for (const e of [-1, 1]) W.collision.addCircle(p.x - CAMX * 1.2 - tx * 1.8 + tx * (e + 1) * 1.8, p.z - CAMZ * 1.2 - tz * 1.8 + tz * (e + 1) * 1.8, 0.12);
      W.collision.addCircle(p.x - CAMX * 0.4, p.z - CAMZ * 0.4, 1.1);
      for (let i = 0; i < 4; i++) { const a = r() * TAU; litter(W, p.x + Math.cos(a) * 2.2, p.z + Math.sin(a) * 2.2, 1, i, a, 0.005); }
    }
  }
}

// ------------------------------------------------------------------ the arena: Danzaburō's hall under the great root crown
function buildArena(W) {
  const A = W.arena, L = W.L, ar = L.arena, mouth = L.arenaMouth; if (!A || !ar) return;
  const B = W.solid, PL = placer(W), HA = W.halos, q = W.krng;
  const ma = mouth ? Math.atan2(mouth.z - ar.z, mouth.x - ar.x) : Math.PI / 4;
  W.arenaLanterns = [];
  const n = 12;
  for (let i = 0; i < n; i++) { // round the rim: great roots rising into the dark on the far half, root knees and lanterns on the near
    const a = ma + (i + 0.5) / n * TAU;
    if (Math.abs(Math.atan2(Math.sin(a - ma), Math.cos(a - ma))) < 0.42) continue;
    const ca = Math.cos(a), sa = Math.sin(a), farSide = ca * CAMX + sa * CAMZ < -0.2;
    if (farSide && i % 3 !== 1) { // a great root: out of the floor, up the rim and bending away overhead into the dark
      // (it pours down over the rim from the root crown above and sweeps sideways into the hall's floor: it stays at the
      // rim and never hides the fight)
      const rr = ar.r - 0.55, x = ar.x + ca * rr, z = ar.z + sa * rr, R = 0.36 + q() * 0.1, tx = -sa, tz = ca, sw = q() < 0.5 ? -1 : 1;
      const path = [[1.6, 4.0, -1.6, 0.9], [0.8, 3.7, -1.15, 0.97], [0.0, 3.15, -0.7, 1.02], [-0.75, 2.3, -0.3, 1.06], [-1.35, 1.3, 0, 1.08], [-1.75, 0.45, 0.2, 1.15], [-2.05, -0.2, 0.32, 1.2]]; // (the crown lies low, in frame)
      const pts = path.map(([o, y, l, k]) => ({ p: V(x + ca * o + tx * l * sw, y, z + sa * o + tz * l * sw), r: R * k }));
      addBark(B, pts, { radial: 10, moss: 0.4, leafy: 0.12, seed: i, c0: '#5e4634', c1: '#bc9a76' });
      for (const e of [-1, 1]) addBark(B, [{ p: V(x + tx * e * 0.25, 0.3, z + tz * e * 0.25), r: R * 0.5 }, { p: V(x - ca * 0.6 + tx * e * 0.9, 0.08, z - sa * 0.6 + tz * e * 0.9), r: R * 0.32 }, { p: V(x - ca * 1.1 + tx * e * 1.4, -0.12, z - sa * 1.1 + tz * e * 1.4), r: R * 0.12 }], { radial: 6, moss: 0.25, c1: '#9a7a5c' });
      for (let k = 0; k < 4; k++) { const tp = pts[1 + k].p, L = 0.4 + q() * 0.5; addBark(B, [{ p: tp.clone().add(V(0, -R * 0.6, 0)), r: 0.03 }, { p: tp.clone().add(V((q() - 0.5) * 0.2, -R * 0.6 - L * 0.6, (q() - 0.5) * 0.2)), r: 0.018 }, { p: tp.clone().add(V((q() - 0.5) * 0.3, -R * 0.6 - L, (q() - 0.5) * 0.3)), r: 0.006 }], { radial: 3 }); } // hair roots dangling off it
      W.collision.addCircle(pts[5].p.x, pts[5].p.z, R * 1.4);
      W.lightPool.addSource({ pos: V(x - ca * 3.2, 2.4, z - sa * 3.2), color: col('#ffc890'), intensity: 4, radius: 6.5, flicker: 0.3 });
      if (i % 4 === 0) { // girdled in a shimenawa with shide
        const c = pts[4].p.clone().setY(1.45), ring = []; for (let k = 0; k <= 20; k++) { const an = k / 20 * TAU; ring.push({ p: V(c.x + Math.cos(an) * R * 1.15, c.y + Math.sin(an * 2) * 0.04, c.z + Math.sin(an) * R * 1.15), r: 0.06 }); }
        B.addGeo(tube(ring, 5, false), c.x, c.z, null, (px, py, pz, nx, ny, nz, o) => o.set('#e8d29a').multiplyScalar(0.84 + 0.16 * Math.sin((px + pz) * 50)));
        for (let k = 0; k < 3; k++) { const an = Math.atan2(-sa, -ca) + (k - 1) * 0.5, px = c.x + Math.cos(an) * R * 1.18, pz = c.z + Math.sin(an) * R * 1.18; for (let j = 0; j < 3; j++) B.add(SH.box(), M(px, c.y - 0.08 - j * 0.1, pz, 0.08, 0.1, 0.006, 0, -an + Math.PI / 2, 0), col('#fffaf0')); }
      }
      continue;
    }
    const rr = ar.r - 1.75, x = ar.x + ca * rr, z = ar.z + sa * rr;
    if (!W.walkable(x, z)) continue;
    addPiece(W, BP.lantern(11 + i, { s: 1.0 }), x, z, Math.atan2(ar.x - x, ar.z - z), { lights: false, mul: 0.62 });
    W.collision.addCircle(x, z, 0.36);
    W.arenaLanterns.push(V(x, 1.0, z));
    HA.add(x, 0.95, z, 1.8, P.lantern, 0.55, 1);
    if (i % 2 === 0) W.lightPool.addSource({ pos: V(x, 1.6, z), color: col(P.lantern), intensity: 7, radius: 9, flicker: 0.8 });
    if (!farSide) { // the near rim: a root knee, a leaf heap and glowing mushrooms by every lantern (low: the camera looks over them)
      const kx = ar.x + ca * (ar.r - 0.6), kz = ar.z + sa * (ar.r - 0.6); addPiece(W, rootKnee(i % 4, 2.2), kx, kz, Math.atan2(-ca, -sa), { s: 1.0 });
      const tx = -sa, tz = ca; heap(W, x + tx * 1.3 + ca * 0.5, z + tz * 1.3 + sa * 0.5, 0.6, 0.25, i, a);
      W.mushrooms(W.glow, x - tx * 1.1 + ca * 0.4, 0, z - tz * 1.1 + sa * 0.4, i % 2 ? '#7ae0c8' : '#e8a050', 0.5, W.halos);
      W.floorGlows.add(x - ca * 0.6, 0.04, z - sa * 0.6, 2.4, '#ffa860', 0.2, 1);
    }
    litter(W, x + ca * 0.8, z + sa * 0.8, 1.2, i % 4, a, 0.005);
  }
  if (mouth) { // a vermilion torii over the way in (it faces the corridor), red paper lanterns on posts flanking it
    const tx = ar.x + Math.cos(ma) * (ar.r - 0.4), tz = ar.z + Math.sin(ma) * (ar.r - 0.4), yaw = Math.atan2(Math.cos(ma), Math.sin(ma));
    addPiece(W, BP.torii(2, { w: 3.8, h: 3.6 }), tx, tz, yaw);
    const px = -Math.sin(ma), pz = Math.cos(ma);
    for (const s of [-1, 1]) {
      W.collision.addCircle(tx + px * s * 1.9, tz + pz * s * 1.9, 0.22);
      const lx = tx + px * s * 2.7 - Math.cos(ma) * 0.6, lz = tz + pz * s * 2.7 - Math.sin(ma) * 0.6;
      addPiece(W, chochinPost(s + 4, 1.9), lx, lz, yaw + Math.PI, { lights: false, mul: 0.8 }); W.collision.addCircle(lx, lz, 0.2);
      HA.add(lx - Math.cos(ma) * 0.34, 1.55, lz - Math.sin(ma) * 0.34, 1.5, '#ff8a5a', 0.45, 1); W.arenaLanterns.push(V(lx, 1.5, lz));
    }
    W.arenaGate = { x: tx, z: tz, yaw, w: 3.8 };
  }
  { // the sake-barrel shrine on the far side from the camera: barrels on a stand, a lantern line, bales, tanuki statues
    let ra = ma + Math.PI; if (Math.cos(ra) * CAMX + Math.sin(ra) * CAMZ > -0.2) ra = Math.PI * 1.25 + (Math.sin(ma - Math.PI * 1.25) > 0 ? -0.75 : 0.75);
    const rr = ar.r - 2.6, x = ar.x + Math.cos(ra) * rr, z = ar.z + Math.sin(ra) * rr, face = Math.atan2(ar.x - x, ar.z - z), tx = Math.cos(face), tz = -Math.sin(face);
    barrelPyramid(W, x, z, face, { s: 1.0 });
    W.collision.addCircle(x, z, 1.2);
    const lx = x - Math.sin(face) * 0.9 - tx * 2.6, lz = z - Math.cos(face) * 0.9 - tz * 2.6;
    addPiece(W, Pr.lanternLine(5, { L: 5.2, h: 2.6 }), lx, lz, face, { mul: 0.85, lightK: 0.8, halo: 0.4 });
    for (const t of [0.25, 0.5, 0.75]) W.arenaLanterns.push(V(lx + tx * 5.2 * t, 2.1, lz + tz * 5.2 * t));
    W.collision.addCircle(lx, lz, 0.12); W.collision.addCircle(lx + tx * 5.2, lz + tz * 5.2, 0.12);
    for (const e of [-1, 1]) {
      const bx = x + tx * e * 2.0 - Math.sin(face) * 0.2, bz = z + tz * e * 2.0 - Math.cos(face) * 0.2;
      addPiece(W, Pr.bale(e + 3), bx, bz, face + Math.PI / 2 + e * 0.2, { mul: 0.82 }); W.collision.addCircle(bx, bz, 0.6);
      const sx = x + tx * e * 1.25 + Math.sin(face) * 1.0, sz = z + tz * e * 1.25 + Math.cos(face) * 1.0;
      addPiece(W, Pr.tanuki(e > 0 ? 1 : 2, { s: 1.15 }), sx, sz, face + e * 0.25, { mul: 0.85 }); W.collision.addCircle(sx, sz, 0.45);
    }
    for (const e of [-1, 1]) { const wx = x + tx * e * 3.2 - Math.sin(face) * 0.6, wz = z + tz * e * 3.2 - Math.cos(face) * 0.6; addPiece(W, Pr.sheaf(e + 6), wx, wz, face, { mul: 0.85 }); W.collision.addCircle(wx, wz, 0.3); }
    for (let k = 0; k < 4; k++) { const a = ra + (k - 1.5) * 0.3; heap(W, ar.x + Math.cos(a) * (ar.r - 0.9), ar.z + Math.sin(a) * (ar.r - 0.9), 0.7, 0.3, k, a, -0.03); }
    W.halos.add(x, 1.3, z, 4.0, '#ffd8a0', 0.14);
  }
  // a broad shaft of amber light falling into the hall through a crack in the root crown, a soft pool under it (capped)
  for (let i = 0; i < 4; i++) W.shaftBatch.add(ar.x + (W.rng() - 0.5) * 3, ar.z + (W.rng() - 0.5) * 3, 2.4 + W.rng() * 1.8, 13, 0.28, W.rng() * TAU, 0.18, 0.1 + W.rng() * 0.05, W.rng() * 10);
  W.floorGlows.add(ar.x, 0.05, ar.z, 4.2, '#ffe0b8', 0.13);
  W.lightPool.addSource({ pos: V(ar.x, 7, ar.z), color: col('#ffe2c0'), intensity: 3.5, radius: 16, flicker: 0.05 });
  W.kitState.cracks.push({ x: ar.x, z: ar.z, y: 8, fx: ar.x, fz: ar.z, big: true });
}

// a few bright shafts falling through cracks in the roof (not one in every room): two narrow planes each, a pool of
// amber light and a light under them, dust motes in them (kit update). Capped: two planes at most 0.19 each.
function buildShafts(W) { roofShafts(W, { max: 4, chance: 0.5, a0: 0.13, a1: 0.04, pool: '#ffd8b0', poolA: 0.2, light: '#ffd2a0', lightI: 3.2 }); }

// ------------------------------------------------------------------ the stairs down: a hollow under a root arch
function buildLandmarks(W) {
  const L = W.L, PL = placer(W);
  if (!L.stairs) return;
  const c = W.cellToWorld(L.stairs.x, L.stairs.y), q = W.krng, rx = CAMX, rz = -CAMZ;
  const ok = (x, z, pad = 0.25) => W.walkable(x, z) && !W.collision.solidAt(x, z, pad);
  for (let i = 0; i < 12; i++) { const a = i / 12 * TAU + q() * 0.1, R = 1.4 + q() * 0.06, x = c.x + Math.cos(a) * R, z = c.z + Math.sin(a) * R; if (W.walkable(x, z)) W.clutter.addVC(BP.slab(i + 1, { R: 0.3, moss: 0.25, tone: '#a8957c' }), M(x, -0.04, z, 1, 1, 1, 0, -a, 0)); }
  // the root arch over the way down, turned to the camera, a red paper lantern either side
  const tx = c.x - CAMX * 0.7, tz = c.z - CAMZ * 0.7;
  if (ok(tx, tz, 0.1)) { addPiece(W, rootArch(5, 2.7, 2.6), tx, tz, CAM); for (const e of [-1, 1]) W.collision.addCircle(tx + rx * e * 1.4, tz + rz * e * 1.4, 0.3); }
  for (const e of [-1, 1]) { const x = c.x + rx * e * 2.2 - CAMX * 0.2, z = c.z + rz * e * 2.2 - CAMZ * 0.2; if (ok(x, z)) { addPiece(W, chochinPost(20 + e, 1.6), x, z, CAM, { lights: false, mul: 0.8 }); W.collision.addCircle(x, z, 0.2); W.halos.add(x + CAMX * 0.34, 1.3, z + CAMZ * 0.34, 1.4, '#ff8a5a', 0.45, 1); W.lightPool.addSource({ pos: V(x + CAMX * 0.8, 1.3, z + CAMZ * 0.8), color: col(P.lantern), intensity: 4, radius: 5.5, flicker: 0.7 }); } }
  for (let i = 0; i < 3; i++) { const a = CAM + Math.PI + (i - 1) * 0.6, x = c.x + Math.cos(a) * 2.3, z = c.z + Math.sin(a) * 2.3; if (ok(x, z, 0.1)) heap(W, x, z, 0.55, 0.22, i, a, -0.02); }
}

// ------------------------------------------------------------------ decor-map clutter, roots, the channel
function buildDressing(W) {
  const r = W.drng, L = W.L, K = W.decoK, TW = W.decoW, TH = W.decoH, D = W.deco, dist = W.wallDist, PL = placer(W), CL = W.clutter;
  const free = (x, z, pad = 0.25) => freeAt(W, x, z, pad);
  const n = { moss: 0, shroom: 0, litter: 0, pebble: 0, leaf: 0 };
  for (let tz = 0; tz < TH; tz++) for (let tx = 0; tx < TW; tx++) {
    const k = (tz * TW + tx) * 4, lush = D[k], path = D[k + 1], stream = D[k + 2], acc = D[k + 3];
    const x = (tx + 0.1 + r() * 0.8) * CELL / K, z = (tz + 0.1 + r() * 0.8) * CELL / K;
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    if (!L.at(cx, cz)) continue;
    const wd = dist[cz * L.W + cx], roll = r();
    if (stream > 0.12) { // rushes on the channel's banks
      if (stream < 0.36 && roll < 0.14 && free(x, z, 0.05)) { W.ddTuft(CL, x, z, 1.0 + r() * 0.5, '#4a5a2e', '#a8a058'); n.moss++; }
      continue;
    }
    if (lush > 0.42 && roll < 0.36 * lush) { // tufts and little mushrooms on the moss cushions
      if (!free(x, z, 0.05)) continue;
      if (r() < 0.22) { PL.multi(F.mushrooms(Math.floor(r() * 4), r() < 0.6 ? 'shimeji' : 'shiitake'), x, 0, z, { rot: r() * TAU, s: 0.7 + r() * 0.4 }); n.shroom++; }
      else { W.ddTuft(CL, x, z, 0.7 + r() * 0.4, '#3e4a26', '#9a9a50'); n.moss++; }
    } else if (wd === 1 && roll < 0.3) { // the wall foot: litter, fallen leaves, pebbles
      if (!free(x, z, 0.02)) continue;
      const kk = r();
      if (kk < 0.45) { litter(W, x, z, 0.7 + r() * 0.5, Math.floor(r() * 4), r() * TAU, 0.005); n.litter++; }
      else if (kk < 0.75) { for (let i = 0; i < 3; i++) W.ddLeaf(CL, x + (r() - 0.5) * 0.6, z + (r() - 0.5) * 0.6, 1.0 + r() * 0.5, col(LEAVES[Math.floor(r() * 6)])); n.leaf += 3; }
      else { for (let i = 0, m = 2 + Math.floor(r() * 3); i < m; i++) W.ddPebble(CL, x + (r() - 0.5) * 0.7, z + (r() - 0.5) * 0.7, 0.05 + r() * 0.08, col('#8a7a6a'), null); n.pebble++; }
    } else if (path > 0.2 && path < 0.55 && roll < 0.08) { // grit and a leaf along the flag runs' edges
      if (!free(x, z, 0.02)) continue;
      W.ddPebble(CL, x + (r() - 0.5) * 0.5, z + (r() - 0.5) * 0.5, 0.04 + r() * 0.05, col('#b0a08a')); W.ddPebble(CL, x + (r() - 0.5) * 0.5, z + (r() - 0.5) * 0.5, 0.03 + r() * 0.04, col('#9a8a78'));
      n.pebble += 2;
    } else if (acc > 0.35 && roll < 0.1) { if (free(x, z, 0.05)) { litter(W, x, z, 0.7, Math.floor(r() * 4), r() * TAU, 0.005); n.litter++; } }
    else if (wd >= 2 && lush < 0.1 && path < 0.2 && roll < 0.05 && free(x, z, 0.02)) { // the open earth: a few leaves, pebbles, the odd stone
      const kk = r();
      if (kk < 0.22) { for (let i = 0; i < 2; i++) W.ddLeaf(CL, x + (r() - 0.5) * 0.6, z + (r() - 0.5) * 0.6, 1.0 + r() * 0.4, col(LEAVES[Math.floor(r() * 6)])); n.leaf += 2; }
      else if (kk < 0.85) { for (let i = 0, m = 2 + Math.floor(r() * 3); i < m; i++) W.ddPebble(CL, x + (r() - 0.5) * 0.8, z + (r() - 0.5) * 0.8, 0.05 + r() * 0.07, col('#887868'), null); n.pebble++; }
      else { CL.add(SH.rock(), M(x, 0.04, z, 0.16 + r() * 0.12, 0.1 + r() * 0.06, 0.14 + r() * 0.1, r(), r() * TAU, r()), null, stoneP); n.pebble++; }
    }
  }
  wallClusters(W); floorRoots(W); streamStones(W); poleLanterns(W);
  W.dressCount = n;
}
// mid-scale dressing hugging the walls and corners of every chamber (root tangles, fallen branches, leaf drifts, sake
// barrels, lantern groups, mushroom clusters): 4–6 a chamber, 4.5 m apart, off the corridor mouths and the room
// dressing's claims; the middle stays clear for the fight. All baked into the floor's chunks or the flora Placer.
function wallClusters(W) {
  const PL = placer(W); let lit = 0;
  W.clusterCount = wallSpots(W, ({ s, x: px, z: pz, corner, far, face, r }) => {
    const k = r();
    if (k < 0.24) { addPiece(W, rootTangle(Math.floor(r() * 4)), px + s.nx * 0.3, pz + s.nz * 0.3, face + (r() - 0.5) * 0.5, { s: 0.9 + r() * 0.3 }); W.collision.addCircle(px + s.nx * 0.45, pz + s.nz * 0.45, 0.4); }
    else if (k < 0.4) { addPiece(W, fallenBranch(Math.floor(r() * 3)), px + s.nx * 0.1, pz + s.nz * 0.1, face + Math.PI / 2 + (r() - 0.5) * 0.4, { s: 0.95 }); W.collision.addCircle(px + s.nx * 0.1, pz + s.nz * 0.1, 0.35); }
    else if (k < 0.56) { // a leaf drift heaped against the foot: two piles, loose leaves, a mushroom
      heap(W, px + s.nx * 0.2, pz + s.nz * 0.2, (corner ? 0.95 : 0.8) + r() * 0.25, 0.36 + r() * 0.12, Math.floor(r() * 4), r() * TAU, -0.04); W.collision.addCircle(px + s.nx * 0.2, pz + s.nz * 0.2, 0.55);
      const o = (r() < 0.5 ? -1 : 1) * (1.0 + r() * 0.3); heap(W, px + s.tx * o, pz + s.tz * o, 0.5, 0.22, Math.floor(r() * 4), r() * TAU, -0.03);
      for (let j = 0; j < 2; j++) litter(W, px - s.nx * 0.7 + s.tx * (j - 0.5) * 1.2, pz - s.nz * 0.7 + s.tz * (j - 0.5) * 1.2, 1.1, Math.floor(r() * 4), r() * TAU, 0.005);
    } else if (k < 0.68 && far) { // sake barrels: a little stack and a lone one
      barrelPyramid(W, px + s.nx * 0.25, pz + s.nz * 0.25, face, { s: 0.85, stand: false, n: 3 }); W.collision.addCircle(px + s.nx * 0.25, pz + s.nz * 0.25, 0.6);
      const o = (r() < 0.5 ? -1 : 1) * 1.05, x = px + s.tx * o - s.nx * 0.1, z = pz + s.tz * o - s.nz * 0.1; if (freeAt(W, x, z, 0.2)) { addPiece(W, Pr.komodaru(Math.floor(r() * 6)), x, z, face + (r() - 0.5), { mul: 0.82 }); W.collision.addCircle(x, z, 0.28); }
      litter(W, px - s.nx * 0.6, pz - s.nz * 0.6, 1, Math.floor(r() * 4), r() * TAU, 0.005);
    } else if (k < 0.8 && far) { // a group of lanterns: a paper lantern on its post (lit) and two little stone toro
      const on = lit < 10; if (on) lit++;
      addPiece(W, chochinPost(30 + Math.floor(r() * 6), 1.55), px + s.nx * 0.25, pz + s.nz * 0.25, face, { lights: false, mul: 0.8 }); W.collision.addCircle(px + s.nx * 0.25, pz + s.nz * 0.25, 0.2);
      for (const e of [-1, 1]) { const x = px + s.tx * e * 0.85 - s.nx * 0.1, z = pz + s.tz * e * 0.85 - s.nz * 0.1; if (freeAt(W, x, z, 0.15)) { addPiece(W, BP.lantern(40 + e + Math.floor(r() * 4), { s: 0.48 + r() * 0.12, pad: false }), x, z, face + (r() - 0.5) * 0.4, { lights: false, mul: 0.6 }); W.collision.addCircle(x, z, 0.18); } }
      if (on) { W.halos.add(px - s.nx * 0.09, 1.2, pz - s.nz * 0.09, 1.3, '#ff8a5a', 0.45, 1); W.floorGlows.add(px - s.nx * 0.7, 0.04, pz - s.nz * 0.7, 2.6, '#ffa860', 0.24, 1); W.lightPool.addSource({ pos: V(px - s.nx * 0.9, 1.2, pz - s.nz * 0.9), color: col(P.lantern), intensity: 5, radius: 6, flicker: 0.8 }); }
    } else { // a mushroom cluster round a mossy stump, glowing caps among them
      addPiece(W, stump(Math.floor(r() * 3)), px + s.nx * 0.2, pz + s.nz * 0.2, face + Math.PI, { s: 0.9 + r() * 0.3 }); W.collision.addCircle(px + s.nx * 0.2, pz + s.nz * 0.2, 0.45);
      for (let j = 0; j < 3; j++) { const o = (j - 1) * 0.75, x = px + s.tx * o - s.nx * 0.45, z = pz + s.tz * o - s.nz * 0.45; if (freeAt(W, x, z, 0.1)) PL.multi(F.mushrooms(Math.floor(r() * 4), ['shiitake', 'amanita', 'shimeji'][j]), x, 0, z, { rot: r() * TAU, s: 0.9 + r() * 0.4 }); }
      W.mushrooms(W.glow, px - s.nx * 0.5 + s.tx * 0.4, 0, pz - s.nz * 0.5 + s.tz * 0.4, '#7ae0c8', 0.5, W.halos);
    }
  });
}
function floorRoots(W) { // maple roots crawling out of the wall foot across the earth and diving back in, rootlets off them
  const r = W.drng, B = W.solid;
  for (const { S } of W.wallSamples) {
    let next = 3 + r() * 5;
    for (const s of S) {
      if (s.u < next) continue;
      next = s.u + 4.5 + r() * 4;
      if (r() < 0.2) continue;
      const len = 1.5 + r() * 2.0, side = (r() - 0.5) * 1.4;
      const ex = s.x - s.nx * len + s.tx * side, ez = s.z - s.nz * len + s.tz * side;
      const mx = (s.x + ex) / 2 - s.nx * 0.1, mz = (s.z + ez) / 2 - s.nz * 0.1;
      if (!freeAt(W, ex, ez, 0.15) || !freeAt(W, mx, mz, 0.1) || inStream(W, mx, mz, 0.15)) continue;
      const R0 = 0.08 + r() * 0.05, arch = 0.06 + r() * 0.1;
      const pts = [{ p: V(s.x + s.nx * 0.25, 0.32, s.z + s.nz * 0.25), r: R0 * 1.25 }, { p: V(s.x - s.nx * 0.2, 0.1, s.z - s.nz * 0.2), r: R0 }, { p: V(mx, arch, mz), r: R0 * 0.9 }, { p: V(ex + (s.x - ex) * 0.15, 0.03, ez + (s.z - ez) * 0.15), r: R0 * 0.6 }, { p: V(ex, -0.06, ez), r: R0 * 0.35 }];
      addBark(B, pts, { radial: 6, moss: 0.25, leafy: 0.06, seed: Math.floor(s.u) });
      for (let i = 0; i < 2; i++) { const t = 0.35 + i * 0.3, px = s.x + (ex - s.x) * t, pz = s.z + (ez - s.z) * t, a = r() * TAU, L = 0.3 + r() * 0.3; addBark(B, [{ p: V(px, 0.05, pz), r: 0.03 }, { p: V(px + Math.cos(a) * L, -0.03, pz + Math.sin(a) * L), r: 0.01 }], { radial: 3 }); }
      if (r() < 0.5) W.ddLeaf(W.clutter, mx - s.tx * 0.3, mz - s.tz * 0.3, 1.2, col(LEAVES[Math.floor(r() * 6)]));
    }
  }
}
function streamStones(W) { // stepping stones across each channel, a fallen log bridge on some, river pebbles on the banks
  const r = W.drng;
  for (const st of W.kitState.streams) {
    const pts = st.pts; if (pts.length < 2) continue;
    const mid = Math.floor(pts.length / 2), a = pts[Math.max(0, mid - 1)], b = pts[Math.min(pts.length - 1, mid + 1)];
    const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1, cx = (a[0] + b[0]) / 2, cz = (a[1] + b[1]) / 2, ax = -dz / l, az = dx / l;
    for (let k = -2; k <= 2; k++) { const x = cx + ax * k * 0.66 + (r() - 0.5) * 0.15, z = cz + az * k * 0.66 + (r() - 0.5) * 0.15; if (W.walkable(x, z)) W.clutter.addVC(BP.slab(k + 9, { R: 0.34, h: 0.1, moss: 0.35, tone: '#9a8a78' }), M(x, -0.02, z, 1, 1, 1, 0, r() * TAU, 0)); }
    for (let i = 0; i < pts.length - 1; i++) for (let t = 0; t < 1; t += 0.2) {
      const p0 = pts[i], p1 = pts[i + 1], x0 = p0[0] + (p1[0] - p0[0]) * t, z0 = p0[1] + (p1[1] - p0[1]) * t, ex = p1[0] - p0[0], ez = p1[1] - p0[1], el = Math.hypot(ex, ez) || 1;
      for (const e of [-1, 1]) { const d = 1.25 + r() * 0.35, x = x0 - ez / el * e * d, z = z0 + ex / el * e * d; if (W.walkable(x, z) && r() < 0.6) { if (r() < 0.7) W.ddPebble(W.clutter, x, z, 0.06 + r() * 0.08, col(r() < 0.5 ? '#8a7a6a' : '#a89a88'), null); else W.ddLeaf(W.clutter, x, z, 1.2, col(LEAVES[Math.floor(r() * 6)])); } }
    }
  }
}
function poleLanterns(W) { // a red paper lantern on a post beside a trail in some rooms, a lantern line along a wall in others
  const r = W.drng, L = W.L; let placed = 0;
  for (const rm of L.rooms) {
    if (rm.kind === 'boss' || rm.kind === 'start' || r() < 0.2 || placed >= 11) continue;
    for (let t = 0; t < 40; t++) {
      const x = (rm.x + r() * rm.w) * CELL, z = (rm.y + r() * rm.h) * CELL, [, path] = W.decoAt(x, z);
      if (path < 0.25 || path > 0.5 || !W.walkable(x, z) || W.keepClear(x, z, 0.5) || W.collision.solidAt(x, z, 0.7) || W.noClutterAt?.(x, z) || inStream(W, x, z, 0.12)) continue;
      const a = r() * TAU;
      addPiece(W, chochinPost(50 + placed, 1.6), x, z, a, { lights: false, mul: 0.8 });
      const lx = x + Math.sin(a) * 0.34, lz = z + Math.cos(a) * 0.34;
      W.halos.add(lx, 1.25, lz, 1.3, '#ff8a5a', 0.45, 1);
      W.lightPool.addSource({ pos: V(lx, 1.2, lz), color: col('#ffb468'), intensity: 4, radius: 6, flicker: 0.6 }); W.floorGlows.add(lx, 0.04, lz, 2.2, '#ffa860', 0.18, 1);
      W.collision.addCircle(x, z, 0.14);
      placed++;
      break;
    }
  }
}
// the root-water channels (decor b): one chamber in two gets a channel running wall to wall (painted into the deco map
// before the room dressing, so the rooms' pieces keep off it: prep adds it to the room's runner lanes)
function decoMap(W, { curve, cellsOf }) {
  const L = W.L, r = mulberry32(L.floor * 3313 + (L.rooms[1]?.x || 0) * 7 + 5), at2 = L.at, ks = W.kitState;
  const want = r() < 0.7 ? 1 + (r() < 0.25 ? 1 : 0) : 0;
  const cand = L.rooms.filter(rm => (rm.kind === 'camp' || rm.kind === 'objective') && rm.w >= 9 && rm.h >= 9);
  for (let i = cand.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [cand[i], cand[j]] = [cand[j], cand[i]]; }
  const blocked = (x, z) => [...L.chests, ...L.shrines, ...(L.slots || [])].some(c => Math.hypot((c.x + 0.5) * CELL - x, (c.y + 0.5) * CELL - z) < 2.4) || L.spawns.some(sp => sp.boss && Math.hypot((sp.x + 0.5) * CELL - x, (sp.y + 0.5) * CELL - z) < 4);
  for (const rm of cand) {
    if (ks.streams.length >= want) break;
    const cells = cellsOf(rm); if (cells.length < 60) continue;
    const cx = (rm.cx + 0.5) * CELL, cz = (rm.cy + 0.5) * CELL, a = r() * Math.PI, dx = Math.cos(a), dz = Math.sin(a);
    const reach = sgn => { let s = 0; for (; s < 30; s += 0.5) { const x = cx + dx * sgn * s, z = cz + dz * sgn * s, gx = Math.floor(x / CELL), gz = Math.floor(z / CELL); if (!at2(gx, gz)) break; if (L.roomId[gz * L.W + gx] !== rm.id) return -1; } return s; };
    const s1 = reach(1), s0 = reach(-1); if (s1 < 3 || s0 < 3) continue;
    const pts = [], N = 6, px = -dz, pz = dx, ph = r() * TAU;
    for (let k = 0; k <= N; k++) { const t = -s0 - 0.6 + (s0 + s1 + 1.2) * k / N, wig = Math.sin(k * 1.3 + ph) * 1.1; pts.push([cx + dx * t + px * wig, cz + dz * t + pz * wig]); }
    if (pts.some(([x, z]) => blocked(x, z))) continue;
    for (let k = 0; k < N; k++) curve(pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1], 1.4, 2, 1);
    ks.streams.push({ room: rm.id, pts });
  }
}

// ------------------------------------------------------------------ room purposes (roomDressing.js RoomDresser = D)
function prep(D, A) { // the room's channel joins its runner lanes so nothing stands in the water
  if (A._mapleRoomPrep) return; A._mapleRoomPrep = true;
  for (const st of D.W.kitState.streams) if (st.room === A.rm.id) for (let k = 0; k < st.pts.length - 1; k++) A.lanes.push([st.pts[k][0], st.pts[k][1], st.pts[k + 1][0], st.pts[k + 1][1], 1.25, 1]);
}
const farFacing = s => s && toCam(s.fx, s.fz) > 0.25; // a wall spot whose wall is on the far side (it faces the camera)
const wallSpot = (D, A, rad, o) => { let s = null; for (let t = 0; t < 6 && !farFacing(s); t++) s = D.spot(A, rad, { mode: 'wall', hug: 0.55, camPref: 1.6, ...o }); if (s) D.claim(s.x, s.z, rad, true, rad, o.core ?? rad * 0.6); return s; };
const lampAt = (D, x, z, face, seed, h = 1.5) => { const W = D.W; addPiece(W, chochinPost(seed, h), x, z, face, { lights: false, mul: 0.8 }); D.coll(x, z, 0.18); const lx = x + Math.sin(face) * 0.34, lz = z + Math.cos(face) * 0.34; W.halos.add(lx, h - 0.35, lz, 1.3, '#ff8a5a', 0.45, 1); D.light(lx, h - 0.3, lz, P.lantern, 3.5, 5, 0.6); };
const ROOMS = {
  shrine(D, A) { // the hollow-root shrine: a hokora under a root arch in a big room's heart, else a jizō trio against a far wall
    prep(D, A); const W = D.W;
    if (A.big) {
      const s = D.put(A, 2.6, { mode: 'center', spread: 3.0, core: 1.5, ring: 0 });
      if (s) {
        addPiece(W, rootArch(Math.floor(D.r() * 3) + 1, 3.0, 2.9), s.x - CAMX * 0.5, s.z - CAMZ * 0.5, CAM);
        addPiece(W, hokora(Math.floor(D.r() * 3)), s.x - CAMX * 0.6, s.z - CAMZ * 0.6, CAM, { mul: 0.9 });
        for (const e of [-1, 1]) D.coll(s.x - CAMX * 0.5 + CAMX * e * 1.5, s.z - CAMZ * 0.5 - CAMZ * e * 1.5, 0.4);
        D.coll(s.x - CAMX * 0.6, s.z - CAMZ * 0.6, 0.8);
        for (const e of [-1, 1]) { const x = s.x + CAMX * 1.2 + CAMX * e * 1.5, z = s.z + CAMZ * 1.2 - CAMZ * e * 1.5; if (D.ok(x, z, 0.2)) lampAt(D, x, z, CAM, 60 + e); }
        return;
      }
    }
    const s = wallSpot(D, A, 1.5, { core: 0.7 }) || D.put(A, 1.5, { mode: 'wall', hug: 0.55, camPref: 1.6, core: 0.7 }); if (!s) return;
    addPiece(W, Pr.jizoTrio(), s.x, s.z, s.face, { mul: 0.85 }); D.coll(s.x, s.z, 0.9);
    for (const e of [-1, 1]) { const [x, z] = D.lp(s, e * 1.45, 0.75); if (D.ok(x, z, 0.2)) lampAt(D, x, z, s.face, 62 + e, 1.4); }
    const [ox, oz] = D.lp(s, 0.8, 1.2); if (D.ok(ox, oz, 0.2)) { addPiece(W, Pr.komodaru(2), ox, oz, s.face, { mul: 0.82, s: 0.8 }); D.coll(ox, oz, 0.24); }
    for (let i = 0; i < 3; i++) { const [x, z] = D.lp(s, D.rnd(-1.6, 1.6), D.rnd(0.2, 0.9)); if (D.ok(x, z, 0.05)) litter(W, x, z, 1, i, D.r() * TAU, 0.005); }
  },
  brewery(D, A) { // the sake cellar: barrels on a stand, a lone barrel or two, a low table laid with sake on straw mats
    prep(D, A); const W = D.W;
    const s = wallSpot(D, A, 1.6, { core: 1.0 }); if (!s) return;
    barrelPyramid(W, s.x, s.z, s.face, { s: 0.95 }); D.coll(s.x, s.z, 1.1);
    for (const e of [-1, 1]) { const [x, z] = D.lp(s, e * 1.7, 0.3); if (D.ok(x, z, 0.3)) { addPiece(W, Pr.komodaru(e + 4), x, z, s.face + e * 0.4, { mul: 0.82 }); D.coll(x, z, 0.28); } }
    const t = D.put(A, 1.2, { core: 0.55, decal: true });
    if (t) { D.decal(1, t.x, t.z, 0.95, 0.75, t.face, 3); addPiece(W, sakeTable(Math.floor(D.r() * 3)), t.x, t.z, t.face, { mul: 0.9 }); D.coll(t.x, t.z, 0.55); }
  },
  tanuki(D, A) { // the tanuki den: a family of shigaraki tanuki against a far wall, leaf piles, a lantern, sake flasks
    prep(D, A); const W = D.W, PL = placer(W);
    const s = wallSpot(D, A, 1.7, { core: 0.9 }); if (!s) return;
    addPiece(W, Pr.tanuki(Math.floor(D.r() * 3), { s: 1.3 }), s.x, s.z, s.face, { mul: 0.85 }); D.coll(s.x, s.z, 0.5);
    for (const [lx, lz, sc] of [[-1.0, 0.5, 0.8], [1.05, 0.35, 0.95], [0.4, 1.0, 0.6]]) { const [x, z] = D.lp(s, lx, lz); if (D.ok(x, z, 0.3)) { addPiece(W, Pr.tanuki(Math.floor(D.r() * 3) + 3, { s: sc }), x, z, s.face + (D.r() - 0.5) * 0.6, { mul: 0.85 }); D.coll(x, z, 0.32 * sc); } }
    { const [x, z] = D.lp(s, -1.8, 0.2); if (D.ok(x, z, 0.3)) { heap(W, x, z, 0.7, 0.3, 1, D.r() * TAU, -0.03); D.coll(x, z, 0.4); } }
    { const [x, z] = D.lp(s, 1.9, 0.5); if (D.ok(x, z, 0.2)) lampAt(D, x, z, s.face, 66); }
  },
  cellar(D, A) { // the root cellar: rice sacks and straw bales, a rack of hoshigaki, baskets of chestnuts
    prep(D, A); const W = D.W, PL = placer(W);
    const s = wallSpot(D, A, 1.6, { core: 0.8 }); if (!s) return;
    addPiece(W, hoshigakiRack(Math.floor(D.r() * 3)), s.x, s.z, s.face, { mul: 0.9 }); for (const e of [-1, 1]) { const [x, z] = D.lp(s, e * 0.75, 0); D.coll(x, z, 0.12); }
    const b = D.put(A, 1.3, { mode: 'wall', hug: 0.6, camPref: 1, core: 0.7 });
    if (b) {
      addPiece(W, Pr.bale(Math.floor(D.r() * 4)), b.x, b.z, b.face + Math.PI / 2, { mul: 0.82 }); D.coll(b.x, b.z, 0.6);
      const sk = cached('sacks', () => BP.kit(7, B => { for (const [x, z, rr] of [[-0.25, 0, 0.18], [0.2, 0.05, 0.17], [0, 0.3, 0.16]]) B.at([x, 0, z], x * 3, () => sack(B, { r: rr, color: '#efe2c4', band: '#a8784a' })); B.at([0.02, 0.3, 0.1], 0.4, () => sack(B, { r: 0.15, color: '#e8d8b8', band: '#a8784a' })); }, 0.015));
      const [x, z] = D.lp(b, 1.3, 0.2); if (D.ok(x, z, 0.3)) { addPiece(W, sk, x, z, b.face, { mul: 0.86 }); D.coll(x, z, 0.4); }
    }
    for (let i = 0; i < 2; i++) { const [x, z] = D.lp(s, (i ? 1 : -1) * 1.4, 0.9); if (D.ok(x, z, 0.1)) PL.multi(F.burrs(i), x, 0, z, { rot: D.r() * TAU }); }
  },
  lanterns(D, A) { // a lantern walk: pairs of red paper lanterns on posts along the room's main trail, leaves between
    prep(D, A); const W = D.W, PL = placer(W);
    const ln = A.lanes.filter(l => !l[5]).sort((a, b) => Math.hypot(b[2] - b[0], b[3] - b[1]) - Math.hypot(a[2] - a[0], a[3] - a[1]))[0]; if (!ln) return;
    const len = Math.hypot(ln[2] - ln[0], ln[3] - ln[1]); if (len < 3) return;
    const ux = (ln[2] - ln[0]) / len, uz = (ln[3] - ln[1]) / len, nx = -uz, nz = ux;
    let n = 0;
    for (let t = 2.2; t < len - 1.5 && n < 6; t += 2.6) for (const e of [-1, 1]) {
      const x = ln[0] + ux * t + nx * e * 1.8, z = ln[1] + uz * t + nz * e * 1.8;
      if (!D.ok(x, z, 0.35) || !D.fits(A, x, z, 0.3, { collide: true, core: 0.25 }, 'open', true, 0, 0)) continue;
      D.claim(x, z, 0.3, true, 0.35, 0.25); n++;
      const face = Math.atan2(-nx * e, -nz * e);
      addPiece(W, chochinPost(70 + n, 1.6), x, z, face, { lights: false, mul: 0.8 }); D.coll(x, z, 0.16);
      const lx = x + Math.sin(face) * 0.34, lz = z + Math.cos(face) * 0.34; W.halos.add(lx, 1.25, lz, 1.3, '#ff8a5a', 0.45, 1); if (n % 2) D.light(lx, 1.2, lz, P.lantern, 3, 5, 0.6);
      litter(W, x - nx * e * 0.5, z - nz * e * 0.5, 0.8, n % 4, D.r() * TAU, 0.005);
    }
  },
  fungus(D, A) { // the fungus grotto: a fallen log grown with glowing brackets, mushroom clusters, glowing caps
    prep(D, A); const W = D.W, PL = placer(W);
    const s = D.put(A, 1.7, { mode: 'wall', hug: 0.65, camPref: 1.2, core: 0.6 }); if (!s) return;
    addPiece(W, fallenBranch(Math.floor(D.r() * 3)), s.x, s.z, s.face + Math.PI / 2, { s: 1.1 }); D.coll(s.x, s.z, 0.4);
    for (let k = 0; k < 4; k++) { const [x, z] = D.lp(s, -1.0 + k * 0.65, 0.12); W.glow.add(SH.sphLo(), M(x, 0.2 + (k % 2) * 0.06, z, 0.13, 0.04, 0.1, 0, s.face, 0), null, (px, py, pz, nx, ny, nz, o) => o.copy(col('#2a7a6a')).lerp(col('#9ff0d8'), clamp(ny))); }
    W.halos.add(s.x, 0.4, s.z, 2.2, P.spore, 0.25, 0.3); D.light(s.x, 0.8, s.z, P.spore, 3, 5, 0.2);
    for (let i = 0; i < 5; i++) { const [x, z] = D.lp(s, D.rnd(-1.8, 1.8), D.rnd(0.6, 1.5)); if (D.ok(x, z, 0.1)) { if (i % 2) W.mushrooms(W.glow, x, 0, z, i % 4 === 1 ? '#7ae0c8' : '#e8a050', 0.5, null); else PL.multi(F.mushrooms(i, i < 2 ? 'amanita' : 'shiitake'), x, 0, z, { rot: D.r() * TAU, s: 1.1 }); } }
  },
  fallen(D, A) { // fallen branches across the floor (walked over), a stump with brackets, loose leaves
    prep(D, A); const W = D.W;
    for (let i = 0, n = 2 + Math.floor(D.r() * 2); i < n; i++) { const s = D.put(A, 1.6, { collide: false }); if (!s) continue; addPiece(W, fallenBranch(i), s.x, s.z, D.r() * TAU, { s: 0.95 }); }
    const b = D.put(A, 0.7, { mode: 'wall', hug: 0.6 }); if (b) { addPiece(W, stump(Math.floor(D.r() * 3)), b.x, b.z, b.face, { s: 0.9 }); D.coll(b.x, b.z, 0.45); }
  },
};
function extras(D, A) { // every room: root knees breaking the floor, a rootTangle or leaf heap on a far wall, mushrooms by the channel
  prep(D, A); const W = D.W, PL = placer(W);
  for (let i = 0, want = A.cells.length > 70 ? 2 : 1; i < want; i++) { const s = D.put(A, 1.2, { core: 0.35, ring: 1.6 }); if (s) { addPiece(W, rootKnee(Math.floor(D.r() * 4), 2.0 + D.r() * 0.6), s.x, s.z, D.r() * TAU, { s: 0.9 + D.r() * 0.25 }); D.coll(s.x, s.z, 0.25); } }
  for (let t = 0, n = 0, want = A.cells.length > 70 ? 2 : 1; t < 8 && n < want; t++) {
    const s = D.spot(A, 0.8, { mode: 'wall', hug: 0.65, camPref: 2.4, core: 0.42 }); if (!farFacing(s)) continue;
    D.claim(s.x, s.z, 0.8, true, 0.9, 0.42); n++;
    if (D.r() < 0.5) { addPiece(W, rootTangle(Math.floor(D.r() * 4)), s.x, s.z, s.face, { s: 0.85 }); D.coll(s.x, s.z, 0.45); }
    else { heap(W, s.x, s.z, 0.75, 0.32, Math.floor(D.r() * 4), D.r() * TAU, -0.03); D.coll(s.x, s.z, 0.45); }
  }
  for (const st of W.kitState.streams) if (st.room === A.rm.id) for (let k = 0; k < st.pts.length; k++) {
    const [x, z] = st.pts[k], a = D.r() * TAU, d = 1.55 + D.r() * 0.3, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
    if (D.ok(px, pz, 0.05) && !inStream(W, px, pz, 0.28) && D.r() < 0.5) PL.multi(F.mushrooms(k % 4, 'shimeji'), px, 0, pz, { rot: a, s: 0.9 });
  }
}
function arrival(D, A) { // the way home: a vermilion torii framing the exit portal, paper lanterns either side, a mat
  const W = D.W, L = D.L, px = (L.start.x + 0.5) * CELL - 1.6, pz = (L.start.y + 0.5) * CELL - 1.6;
  D.decal(1, px, pz, 1.25, 0.85, -Math.PI / 4, 3);
  const tx = px - CAMX * 0.5, tz = pz - CAMZ * 0.5;
  if (W.walkable(tx, tz)) { addPiece(W, BP.torii(9, { w: 2.2, h: 2.5 }), tx, tz, CAM); for (const e of [-1, 1]) D.coll(tx + CAMX * e * 1.1, tz - CAMZ * e * 1.1, 0.16); }
  for (const e of [-1, 1]) { const x = px + CAMX * e * 1.9, z = pz - CAMZ * e * 1.9; if (W.walkable(x, z) && !W.collision.solidAt(x, z, 0.2)) { addPiece(W, chochinPost(80 + e, 1.5), x, z, CAM, { lights: false, mul: 0.8 }); D.coll(x, z, 0.18); W.halos.add(x + CAMX * 0.34, 1.15, z + CAMZ * 0.34, 1.3, '#ff8a5a', 0.45, 1); } }
  for (let i = 0; i < 3; i++) { const a = CAM + Math.PI + (i - 1) * 0.7, x = px + Math.cos(a) * 2.4, z = pz + Math.sin(a) * 2.4; if (W.walkable(x, z) && !W.collision.solidAt(x, z, 0.2)) litter(W, x, z, 1, i, a, 0.005); }
  D.claim(px, pz, 1.4, false);
}
function hoard(D, A) { // the treasure dais: the gold chest on a straw mat, a little torii behind it, sake barrels, a tanuki, coins
  const W = D.W;
  for (const c of D.L.chests) {
    if (c.quality !== 'gold' || D.roomAt((c.x + 0.5) * CELL, (c.y + 0.5) * CELL) !== A.rm.id) continue;
    const x0 = (c.x + 0.5) * CELL, z0 = (c.y + 0.5) * CELL;
    W.kitDecal(1, x0, z0, 1.35, 1.1, CAM, 3);
    const tx = x0 - CAMX * 1.3, tz = z0 - CAMZ * 1.3;
    if (W.walkable(tx, tz) && !W.collision.solidAt(tx, tz, 0.1)) { addPiece(W, BP.torii(12, { w: 1.6, h: 1.9 }), tx, tz, CAM); for (const e of [-1, 1]) D.coll(tx + CAMX * e * 0.8, tz - CAMZ * e * 0.8, 0.14); }
    for (const e of [-1, 1]) { const x = x0 + CAMX * e * 1.75 - CAMX * 0.5, z = z0 - CAMZ * e * 1.75 - CAMZ * 0.5; if (W.walkable(x, z) && !W.collision.solidAt(x, z, 0.25)) { if (e < 0) addPiece(W, Pr.komodaru(3), x, z, CAM, { mul: 0.82 }); else addPiece(W, Pr.tanuki(2, { s: 0.8 }), x, z, CAM + 0.4, { mul: 0.85 }); D.coll(x, z, 0.3); } }
  }
  D.hoard(A);
}
function corridor(D, x, z, face, q) {
  const W = D.W, PL = placer(W);
  if (inStream(W, x, z, 0.2)) return;
  if (q < 0.26) PL.multi(F.mushrooms(Math.floor(D.r() * 4), ['shiitake', 'shimeji', 'amanita'][Math.floor(D.r() * 3)]), x, 0, z, { rot: D.r() * TAU, s: 0.8 + D.r() * 0.3 });
  else if (q < 0.52) litter(W, x, z, 1, Math.floor(D.r() * 4), D.r() * TAU, 0.005);
  else if (q < 0.66) heap(W, x, z, 0.4, 0.16, Math.floor(D.r() * 4), D.r() * TAU, -0.02);
  else if (q < 0.8) for (let i = 0; i < 3; i++) W.ddLeaf(D.CL, x + (D.r() - 0.5) * 0.6, z + (D.r() - 0.5) * 0.6, 1.1, col(LEAVES[Math.floor(D.r() * 6)]));
  else for (let i = 0; i < 3; i++) W.ddPebble(D.CL, x + (D.r() - 0.5) * 0.5, z + (D.r() - 0.5) * 0.5, 0.05 + D.r() * 0.06, col('#8a7a6a'), null);
}

// ------------------------------------------------------------------ ambience
// (a leaf sways and spins on its way down, and fades out over its last half metre: it never pops on the floor)
const _leafFn = (q, dt) => { q.ph += dt * q.w; q.vx = q.bx + Math.sin(q.ph) * 0.42; q.vz = q.bz + Math.cos(q.ph * 0.7) * 0.3; q.rot += Math.sin(q.ph * 1.3) * dt * 2.2; if (q.y < 0.6) { q.a0 = q.a1 = 0.95 * clamp((q.y - 0.05) / 0.55); if (q.y < 0.06) q.t = q.life; } };
const _fall = { vy: 0, life: 9, size: 0.3, color: null, alpha: 0.95, alpha1: 0.95, fadeIn: 0.6, fn: _leafFn, spin: 0 };
function leafAt(fx, x, y, z, k = 1) {
  _fall.vy = -rand(0.4, 0.65); _fall.size = rand(0.2, 0.3) * k; _fall.color = MCOL.maple[(Math.random() * 4) | 0]; _fall.life = 20;
  const q = fx.p('n', FX.MAPLE, x, y, z, _fall); q.ph = rand(0, TAU); q.w = rand(1.2, 2.2); q.bx = rand(-0.12, 0.12); q.bz = rand(-0.12, 0.12);
}
function update(W, dt, t, vfx, focus) {
  const ks = W.kitState; if (!vfx || !focus) return;
  const fx = ks.fx ||= mapleFx(vfx, W);
  // dust motes turning slowly in the shafts of light
  for (const s of ks.shafts || []) {
    if ((s.x - focus.x) ** 2 + (s.z - focus.z) ** 2 > 18 * 18 || Math.random() > dt * 2.2) continue;
    vfx.dot.spawn({ x: s.x + rand(-0.6, 0.6), y: rand(0.6, 3.2), z: s.z + rand(-0.6, 0.6), vx: rand(-0.04, 0.04), vy: -rand(0.03, 0.08), vz: rand(-0.04, 0.04), life: rand(2.5, 4), size: rand(0.035, 0.06), color: '#fff0d8', alpha: 0.7, alpha1: 0, fadeIn: 0.8 });
  }
  // momiji sifting down from the cracks (thicker under them), and a few anywhere from the roots overhead
  for (const c of ks.cracks) {
    if ((c.fx - focus.x) ** 2 + (c.fz - focus.z) ** 2 > 20 * 20 || Math.random() > dt * (c.big ? 2.4 : 0.9)) continue;
    leafAt(fx, c.big ? c.x + rand(-2.5, 2.5) : c.x + (c.fx - c.x) * rand(0, 0.4) + rand(-0.4, 0.4), c.y, c.big ? c.z + rand(-2.5, 2.5) : c.z + (c.fz - c.z) * rand(0, 0.4) + rand(-0.4, 0.4));
  }
  ks.leafAcc = (ks.leafAcc || 0) + dt * 1.4;
  while (ks.leafAcc > 1) { ks.leafAcc--; const x = focus.x + rand(-13, 13), z = focus.z + rand(-11, 11); if (W.walkable(x, z)) leafAt(fx, x, rand(4.5, 6.5), z, 0.9); }
  // glowing spores drifting up off the moss
  ks.sporeAcc = (ks.sporeAcc || 0) + dt * 1.8;
  while (ks.sporeAcc > 1) {
    ks.sporeAcc--;
    const x = focus.x + rand(-11, 11), z = focus.z + rand(-9, 9); if (!W.walkable(x, z) || W.decoAt(x, z)[0] < 0.25) continue;
    vfx.glow.spawn({ x, y: rand(0.1, 0.6), z, vx: rand(-0.08, 0.08), vy: rand(0.12, 0.26), vz: rand(-0.08, 0.08), life: rand(2.5, 4), size: rand(0.06, 0.1), color: Math.random() < 0.8 ? P.spore : '#ffc880', alpha: 0.8, alpha1: 0, fadeIn: 0.8, flicker: rand(3, 6) });
  }
}
function finish(W) { return finishPlacer(W); }

export const MAPLE_KIT = {
  id: 'mapleHalls',
  floorGLSL: FLOOR, floorPars: PARS, bossGLSL: ARENA, wallGLSL: WALL,
  // the earthen face swells out into a heavy overhanging brow (0.6 m over the room at 0.9 h), a fringe of roots on its
  // nose, then the great roots heave up behind (1.1 h → 1.32 h) before they drop away into the void
  profile: (h, D, j) => [[-0.36, -0.02, 'foot', 1], [-0.26 + j[0], 0.22 * h, 'rock', 1], [-0.14 + j[1], 0.46 * h, 'rock', 1], [-0.18 + j[2], 0.66 * h, 'rock', 1],
    [-0.34 + j[2], 0.8 * h, 'rock', 1], [-0.6 + j[2] * 0.6, 0.91 * h, 'rock', 1], [-0.6 + j[2] * 0.6, 0.91 * h, 'lip', 0], [-0.64, 0.99 * h, 'lip', 0], [-0.46, 1.06 * h, 'roots', 0],
    [-0.16, 1.1 * h, 'roots', 0], [-0.16, 1.1 * h, 'top', 3], [D * 0.5 + 0.2, 1.22 * h + j[3], 'top', 3], [D + 0.2, 1.32 * h + j[3] * 0.6, 'top', 3],
    [D + 0.2, 1.32 * h, 'topBack', 0], [D * 1.15 + 0.35, 0.55 * h, 'back', 0], [D * 1.25 + 0.45, -0.02, 'void', 0]],
  roles: { foot: ['#64524a', '#6a584c'], rock: ['#a88e78', '#b49a82'], lip: ['#8a6e58', '#94785e'], roots: ['#a08262', '#aa8a68'], top: ['#ffffff', '#f4f4f0'], topBack: ['#2a1e18', '#30221c'], back: ['#120c0a', '#160e0c'] },
  wallH: [3.1, 0.9, 0.5], ds: 0.5, brush: 0.24,
  deco: { lush: 0.8, crack: 0, acc: 1.0, path: 1 }, sig: P.sig, cap: '#5a4232',
  init(W) { W.kitState = { streams: [], shafts: [], cracks: [] }; W.kitDecal = (...a) => kitDecal(W, ...a); W.arenaLanterns = []; },
  decoMap, dressWalls, buildProps, buildLights, buildShafts, buildCenterpieces, buildArena, buildLandmarks, buildDressing, finish, update,
  dispose(W) { disposePlacer(W); },
  purposes: ['shrine', 'brewery', 'tanuki', 'cellar', 'lanterns', 'fungus', 'fallen'], dupes: ['shrine', 'brewery'],
  rooms: ROOMS, extras, arrival, hoard, corridor,
  seal: { color: '#ffc884', rope: '#e8d29a' }, // the arena seal's look (dungeon/zoneRun.js)
};
