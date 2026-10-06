// Tide Caves: the sea caves under the Shiokaze Tidepools (docs/ZONES.md §8.2; ROADMAP Z-C1). The tidepools' own assets
// (regions/assets/tidepoolAssets.js: kelp, anemones, urchins, starfish, shells, coral, the giant clam, driftwood, the
// wreck, net racks, the sea torii, the driftwood gateway) dress them, so the dungeon reads as the same coast gone
// underground: wet, dim, the pools glowing.
//  - floor (shader): cool wet sand with tide ripples and shell grit, dark basalt shelves breaking through it (barnacled
//    rims, little glowing pools in their hollows), hexagonal basalt flags on the trodden runs and down the corridors,
//    mats of wrack, sea lettuce and red weed (decor r), painted shells and starfish (decor a), wrack banked along the
//    wall foot; glowing tide pools and tide channels (decor b: a barnacled rim, a sandy bed, caustics, bioluminescent
//    sparks, little fish); a round basalt dais in the shrine rooms; the treasure's gold chest stands sunk in a pool.
//  - the arena (Umibōzu's cove): a sea pool on the far side from the camera (the boss rises from it), a shore that
//    breathes in and out, wet sand, a ring of hex basalt round the beach and a seigaiha (wave) mosaic of shell inlaid in
//    the sand that glows with the sigil.
//  - walls: columnar basalt (tall facets, dark joints, cross joints) with the tide's zones from the foot up: a black wet
//    band, barnacles and mussels, pink coralline crust, green weed, a pale high-water line with orange lichen over it;
//    a heavy overhanging brow (the sea-cut notch) hung with kelp; above it dark wet boulders heave up into the dark,
//    weed and barnacles along the brow, glowing algae in the cracks.
//  - light: a dim cool base, warm amber pools from glass-float lanterns on driftwood posts (the room lights), a few pale
//    moonlight shafts through blowholes (roofShafts, capped), the pools' own teal glow, a dark band along the wall foot.
//  - dressing: kelp curtains, float niches, seeps, nets hung on the rock, anemone ledges; at the wall foot anemones,
//    urchins, starfish, shells, kelp, barnacled stones; mid-scale clusters along the walls and in the corners (rock piles,
//    driftwood heaps, net and float clusters, kelp drifts, crab burrows, lantern groups); the middle of every chamber
//    kept clear for the fight.
//  - rooms: the Ebisu sea shrine, a wrecked boat, the fishermen's camp, the wedded rocks, a coral garden, a flotsam beach,
//    a crab colony; tide pools and a tide channel with stepping stones; the arrival under a driftwood gateway; the
//    sunken treasure with its giant clam; the stairs down between float lanterns.
//  - ambience: drips from the brows into the pools, bubbles, plankton sparks over the water, motes in the moonlight.
import * as THREE from 'three';
import { SH, M, col } from '../dungeonWorld.js';
import { tube, puff, paint, merge } from '../../gfx/geom.js';
import { mulberry32, clamp, TAU, rand } from '../../core/util.js';
import * as TA from '../../regions/assets/tidepoolAssets.js';
import { kitPiece, lump, ribbon, nz } from '../../regions/assets/tidepoolKit.js';
import * as Pr from '../../regions/assets/bambooProps.js';
import { G as BG, C as BC } from '../../world/buildings/kit.js';
import { roof } from '../../world/buildings/roofs.js';
import { shimenawa, net, bucket, fishRack } from '../../world/buildings/props2.js';
import { crate } from '../../world/buildings/props.js';
import { glassFloats } from '../../world/buildings/trim.js';
import { addPiece, disposePlacer, topSpan, grad, freeAt, glc as g, toCam, CAM, CAMX, CAMZ, CELL, inStream, kitDecal, roofShafts, wallSpots } from './common.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const PI = Math.PI;
const cc = h => new THREE.Color(h); // (a fresh colour: dungeonWorld's col() is a shared cache, never mutate it)
const angD = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

// ------------------------------------------------------------------ palette (the coast's, cooled and darkened underground)
const P = {
  sandA: '#8a8476', sandB: '#a29c8a', basA: '#454e56', basB: '#5e6870', salt: '#aab6b2', joint: '#262c30',
  weedA: '#2c2a1a', weedB: '#4a4626', lettuce: '#4e7c3c', red: '#6e3a40',
  lantern: '#ffbe72', sig: '#7ff4ff', teal: '#3ad8e0', spark: '#b8fff8',
};

// ------------------------------------------------------------------ floor shader helpers (floorPars)
const PARS = /* glsl */`
uniform vec4 uSea;
// hexagonal tiling: pointy-top cells of in-radius 0.5 in q units -> the offset from the cell centre (id = the centre)
vec2 hexOf(vec2 q, out vec2 id) {
  vec2 r = vec2(1.0, 1.7320508), hh = r * 0.5;
  vec2 a = mod(q, r) - hh, b = mod(q - hh, r) - hh;
  vec2 gv = dot(a, a) < dot(b, b) ? a : b;
  id = q - gv; return gv;
}
float hexEdge(vec2 gv) { vec2 a = abs(gv); return 0.5 - max(dot(a, vec2(0.5, 0.8660254)), a.x); } // 0 at the edge .. 0.5
// seigaiha: fans of concentric arcs in rows, each row in front of the one behind -> the fan's radial coordinate
// (0 centre .. 1 rim), or -1 outside every fan
float seigaiha(vec2 q) {
  float j0 = floor(q.y * 2.0), best = 1e3, rr = -1.0;
  for (int dj = -1; dj <= 0; dj++) {
    float j = j0 + float(dj), off = mod(j, 2.0);
    for (int di = -1; di <= 1; di++) {
      vec2 c = vec2((floor((q.x - off) * 0.5) + float(di)) * 2.0 + off, j * 0.5);
      vec2 d = q - c; float r = length(d);
      if (r < 1.0 && d.y >= 0.0 && j < best) { best = j; rr = r; }
    }
  }
  return rr;
}
`;

// ------------------------------------------------------------------ floor shader
const FLOOR = /* glsl */`
  {
    // the water first (decor b: the pools and the tide channels), everything else keeps off it
    float sb = dc.b + (vn(p * 1.6 + 2.0) - 0.5) * 0.07;
    float bank = smoothstep(0.14, 0.34, sb), wat = smoothstep(0.42, 0.5, sb);
    // the cave sand: cool grey-beige, wet hollows and drier drifts, a fine grit
    float bigS = fbm(p * 0.045 + 11.0), bigT = vn(p * 0.022 + 3.0);
    c = mix(c, c * vec3(1.06, 1.02, 0.92), smoothstep(0.56, 0.8, bigS) * 0.5);
    c = mix(c, c * vec3(0.7, 0.78, 0.82), smoothstep(0.44, 0.2, bigS) * 0.6);
    c = mix(c, c * vec3(0.92, 0.98, 1.0), smoothstep(0.55, 0.82, bigT) * 0.4);
    c *= 0.93 + 0.1 * vn(p * 2.7 + 5.0);
    c = mix(c, c * vec3(0.93, 0.96, 1.0), 0.4); // the cave's cool shade
    float tr = smoothstep(0.2, 0.62, dc.g + (vn(p * 1.1) - 0.5) * 0.3);
    // ripple marks the tide left in the sand: wavy troughs and lit crests, fading at the walls and on the runs
    {
      float ra = 0.6 + vn(p * 0.03 + 21.0) * 1.1;
      float ph = dot(p, vec2(cos(ra), sin(ra))) * 4.4 + vn(p * 0.5 + 9.0) * 5.0;
      float rp = sin(ph), rk = smoothstep(0.8, 2.2, wd) * (1.0 - tr) * smoothstep(0.32, 0.58, vn(p * 0.08 + 4.0)) * (1.0 - bank);
      c *= 1.0 + (smoothstep(0.55, 1.0, rp) * 0.09 - smoothstep(-0.3, -0.95, rp) * 0.13) * rk;
    }
    // shell grit and little pebbles in patches, each lit from the upper left
    {
      vec2 gc; vec3 gv = vor(p * 3.4 + 61.0, gc);
      float gk = step(0.8, gv.z) * smoothstep(0.48, 0.7, vn(p * 0.22 + 33.0)) * smoothstep(0.6, 1.4, wd) * (1.0 - bank);
      float gs = smoothstep(0.19, 0.12, gv.x) * gk, gl = clamp(dot(normalize(-gc + 1e-4), vec2(0.54, 0.84)) * 0.5 + 0.5, 0.0, 1.0);
      float hh = h1(floor(p * 3.4 + 61.0) + gv.z);
      vec3 gcol = hh < 0.8 ? mix(${g('#4e5254')}, ${g('#7a7a74')}, hh * 1.25) : hh < 0.93 ? ${g('#b8b0a2')} : ${g('#b88a84')};
      c = mix(c, c * 0.7, smoothstep(0.25, 0.17, length(gc + vec2(0.03, -0.03))) * gk * 0.5);
      c = mix(c, gcol * (0.8 + 0.3 * gl), gs);
    }
    // dark basalt shelves breaking through the sand: cracked, a wet margin, barnacles round the rim, pools in the hollows
    float shN = vn(p * 0.15 + 5.0) + (vn(p * 0.9 + 2.0) - 0.5) * 0.12;
    float shelf = smoothstep(0.755, 0.79, shN) * smoothstep(0.8, 1.8, wd) * (1.0 - tr * 0.8) * (1.0 - bank);
    { // the shelf's shadow on the sand (cast away from the light, so the rock reads as raised)
      vec2 ps = p + vec2(0.54, 0.84) * 0.42; float shS = vn(ps * 0.15 + 5.0) + (vn(ps * 0.9 + 2.0) - 0.5) * 0.12;
      c = mix(c, c * vec3(0.5, 0.55, 0.6), smoothstep(0.755, 0.79, shS) * (1.0 - shelf) * smoothstep(0.8, 1.8, wd) * (1.0 - tr * 0.8) * (1.0 - bank) * 0.65);
    }
    if (shN > 0.7) {
      vec2 bc; vec3 bvr = vor(p * 0.6 + 41.0, bc);
      vec3 bcol = mix(${g('#5e686e')}, ${g('#7e888a')}, bvr.z) * (0.88 + 0.14 * vn(p * 4.0));
      bcol *= 1.0 - smoothstep(0.06, 0.0, bvr.y) * 0.4;
      { // the lit lip of the shelf toward the light, its far edge in shade
        vec2 pa = p - vec2(0.54, 0.84) * 0.25, pb = p + vec2(0.54, 0.84) * 0.25;
        float shA = vn(pa * 0.15 + 5.0) + (vn(pa * 0.9 + 2.0) - 0.5) * 0.12, shB = vn(pb * 0.15 + 5.0) + (vn(pb * 0.9 + 2.0) - 0.5) * 0.12;
        bcol *= 1.0 + 0.32 * smoothstep(0.79, 0.755, shB) - 0.22 * smoothstep(0.79, 0.755, shA);
      }
      bcol *= 0.92 + 0.14 * clamp(dot(normalize(-bc + 1e-4), vec2(0.54, 0.84)) * 0.5 + 0.5, 0.0, 1.0);
      vec2 bq = p * 8.0; vec2 bi = floor(bq); vec2 bo = fract(bq) - 0.5 - (h2(bi) - 0.5) * 0.5;
      float rimS = smoothstep(0.77, 0.79, shN) * (1.0 - smoothstep(0.79, 0.84, shN));
      float barn = step(0.62, h1(bi + 7.0)) * step(0.45, vn(p * 1.4 + 2.0)) * smoothstep(0.2, 0.12, length(bo)) * rimS;
      bcol = mix(bcol, mix(${g('#ecdcc0')}, ${g('#5a5450')}, smoothstep(0.07, 0.0, length(bo))), barn * 0.9);
      c = mix(c, c * vec3(0.62, 0.66, 0.68), smoothstep(0.71, 0.755, shN) * (1.0 - shelf) * 0.5);
      c = mix(c, bcol, shelf);
      float hn = vn(p * 0.85 + 13.0), hol = smoothstep(0.76, 0.79, hn) * smoothstep(0.82, 0.86, shN) * shelf;
      vec3 hw = mix(${g('#031218')}, ${g('#0c3c44')}, smoothstep(0.95, 0.77, hn) * 0.6 + vn(p * 1.1 + uTime * 0.07) * 0.3);
      c = mix(c, c * 0.5, smoothstep(0.73, 0.77, hn) * smoothstep(0.82, 0.86, shN) * shelf * 0.7);
      c = mix(c, hw, hol * 0.92);
      c = mix(c, ${g('#bfe8e4')}, hol * smoothstep(0.86, 0.92, vn(p * 2.4 + uTime * 0.15)) * 0.35); // a wet sheen on the pool
      fG += ${g(P.teal)} * hol * (0.04 + 0.04 * smoothstep(0.79, 0.77, hn)) + ${g(P.spark)} * twinkle(p, 3.6, 0.82) * hol * 1.0;
    }
    // hexagonal basalt flags on the trodden runs (decor g) and down the corridors: salt-dusted rims, the odd sunken one
    float fk = max(tr, rid == 0 ? smoothstep(0.7, 1.7, wd) : 0.0) * (1.0 - bank);
    if (fk > 0.01) {
      vec2 hid; vec2 hv = hexOf(p * 1.22 + 7.0, hid); float he = hexEdge(hv), hh = h1(hid);
      float on = smoothstep(0.3, 0.38, fk + (hh - 0.5) * 0.55);
      float lit = clamp(dot(normalize(-hv + 1e-4), vec2(0.54, 0.84)) * 0.5 + 0.5, 0.0, 1.0);
      vec3 st = mix(${g(P.basA)}, ${g(P.basB)}, hh) * (0.9 + 0.12 * vn(p * 5.0));
      st *= 0.9 + 0.16 * lit * smoothstep(0.0, 0.18, he);
      st = mix(st, st * vec3(0.84, 0.98, 0.86), smoothstep(0.55, 0.82, vn(p * 1.7 + hh * 9.0)) * 0.45); // a green film
      st = mix(st, ${g(P.salt)}, smoothstep(0.07, 0.03, he) * smoothstep(0.03, 0.06, he) * 0.45);      // salt rim
      st = mix(st, st * 0.66, step(0.86, hh) * 0.7);                                                     // sunk, wet
      vec3 flag = mix(${g(P.joint)}, st, smoothstep(0.0, 0.035, he));
      fG += ${g('#cfeff0')} * twinkle(p * 1.3, 3.0, 0.9) * on * 0.25; // wet glints on the stone
      c = mix(c, c * 0.74, smoothstep(0.0, 0.25, fk) * (1.0 - on) * 0.3);
      c = mix(c, flag, on);
    }
    // stranded kelp (decor r): ribbons of olive-brown, ochre and red weed lying on damp sand, a shadow under each, a wet
    // sheen; fewer toward a patch's thin edge
    float lu = smoothstep(0.32, 0.64, dc.r + (fbm(p * 0.7 + 4.0) - 0.5) * 0.5) * (1.0 - wat);
    if (lu > 0.001) {
      c = mix(c, c * vec3(0.74, 0.74, 0.7), smoothstep(0.1, 0.55, lu) * 0.45);
      for (int L = 0; L < 2; L++) {
        float ks = 1.45 + float(L) * 0.85;
        vec2 kc; vec3 kv = vor(p * ks + 9.0 + float(L) * 17.0, kc);
        float ka = kv.z * 37.0; vec2 kq = vec2(cos(ka) * kc.x - sin(ka) * kc.y, sin(ka) * kc.x + cos(ka) * kc.y) / ks;
        float hl = 0.24 + kv.z * 0.16, bend = sin(kq.x * 6.0 + kv.z * 20.0) * 0.06;
        float w = (0.07 + 0.04 * h1(vec2(kv.z, 3.0 + float(L)))) * (1.0 - smoothstep(hl * 0.5, hl, abs(kq.x))) * (0.85 + 0.3 * sin(kq.x * 17.0 + kv.z * 9.0));
        float on = step(abs(kq.x), hl) * step(0.42 - lu * 0.32, h1(vec2(kv.z * 7.0, float(L) + 2.0)));
        float rib = on * smoothstep(w, w * 0.55, abs(kq.y - bend));
        float hk = h1(vec2(kv.z * 13.0, float(L)));
        vec3 kcol = hk < 0.45 ? ${g('#4e4422')} : hk < 0.75 ? ${g('#5e5228')} : hk < 0.88 ? ${g('#5e3026')} : ${g('#3a3c1e')};
        kcol *= 0.82 + 0.3 * smoothstep(-w, w, kq.y - bend);
        kcol = mix(kcol, kcol * 0.7, smoothstep(0.012, 0.0, abs(kq.y - bend)) * 0.6); // the midrib
        c = mix(c, c * 0.62, on * smoothstep(w * 1.9, w, abs(kq.y - bend + 0.025)) * 0.55 * smoothstep(0.15, 0.4, lu));
        c = mix(c, kcol, rib * smoothstep(0.15, 0.4, lu));
        fG += ${g('#fff0d0')} * rib * twinkle(p * 2.0, 4.0, 0.86) * 0.35;
      }
    }
    // shells and starfish lying on the sand (decor a)
    float fa = smoothstep(0.2, 0.6, dc.a) * (1.0 - bank) * (1.0 - lu * 0.4) * step(0.7, wd);
    if (fa > 0.01) {
      vec2 fc = floor(p * 2.4); vec2 fo = fract(p * 2.4) - 0.5 - (h2(fc + 3.0) - 0.5) * 0.45; float fh = h1(fc + 17.0);
      float has = step(0.62, fh) * fa, an = h1(fc + 5.0) * 6.2832, ca = cos(an), sa = sin(an);
      vec2 q = vec2(ca * fo.x - sa * fo.y, sa * fo.x + ca * fo.y) / 2.4; // metres
      float rq = length(q), aq = atan(q.y, q.x);
      vec3 scol; float shp;
      if (fh > 0.9) { // a starfish
        shp = smoothstep(1.0, 0.86, rq / (0.075 * (0.36 + 0.64 * pow(0.5 + 0.5 * cos(aq * 5.0), 1.6))));
        scol = h1(fc + 9.0) > 0.5 ? ${g('#e8683a')} : h1(fc + 9.0) > 0.25 ? ${g('#c84a5a')} : ${g('#9a5ac8')};
        scol *= 0.86 + 0.24 * step(0.5, h1(floor(q * 60.0)));
      } else { // a scallop fan with ribs, cream, peach or pink
        vec2 sq = q + vec2(0.0, 0.025);
        shp = smoothstep(0.052, 0.046, length(sq)) * step(-0.012, sq.y);
        float sf = h1(fc + 23.0);
        scol = sf < 0.4 ? ${g('#ece2d0')} : sf < 0.7 ? ${g('#f0b8a0')} : ${g('#e8a8b8')};
        scol *= 0.8 + 0.22 * step(0.0, sin(atan(sq.y, sq.x) * 11.0));
      }
      c = mix(c, c * 0.62, smoothstep(0.1, 0.0, rq - 0.06) * has * 0.35);
      c = mix(c, scol, shp * has);
    }
    // wrack banked against the wall foot: dark weed strands, a bleached shell here and there
    {
      float df = (1.0 - smoothstep(0.55, 1.5, wd + (vn(p * 0.7) - 0.5) * 0.6)) * smoothstep(0.35, 0.6, vn(p * 0.33 + 17.0)) * (1.0 - bank);
      vec2 wc2; vec3 wv = vor(p * 4.0 + 51.0, wc2);
      float wa = wv.z * 40.0; vec2 wq = vec2(cos(wa) * wc2.x - sin(wa) * wc2.y, sin(wa) * wc2.x + cos(wa) * wc2.y);
      float strand = smoothstep(1.0, 0.4, length(wq / vec2(0.45, 0.08)));
      vec3 wr = mix(mix(${g('#24221a')}, ${g('#3e3a22')}, vn(p * 3.0)), wv.z > 0.5 ? ${g('#5a5228')} : ${g('#2e3818')}, strand * 0.7);
      c = mix(c, wr, df * 0.75);
    }
    // damp hollows and little puddles that catch the light (and the odd spark of plankton in them)
    float pn = vn(p * 0.34 + 41.0) + (vn(p * 1.6 + 3.0) - 0.5) * 0.05, away = smoothstep(1.6, 2.6, wd) * (1.0 - tr * 0.8) * (1.0 - bank) * smoothstep(0.5, 0.62, vn(p * 0.045 + 7.0));
    float wet = smoothstep(0.77, 0.82, pn) * away, pud = smoothstep(0.835, 0.85, pn) * away;
    { float pw2 = vn(p * 0.6 + 77.0), foot = (1.0 - smoothstep(0.7, 1.5, wd)) * (1.0 - bank);
      wet = max(wet, smoothstep(0.76, 0.82, pw2) * foot); pud = max(pud, smoothstep(0.82, 0.84, pw2) * foot); }
    c = mix(c, c * vec3(0.6, 0.66, 0.7), wet * 0.7);
    c = mix(c, mix(${g('#14303a')}, ${g('#3a6a70')}, smoothstep(0.85, 0.95, pn) * 0.4 + vn(p * 0.8 + uTime * 0.05) * 0.3), pud);
    fG += ${g(P.spark)} * (twinkle(p, 3.2, 0.7) * pud * 1.6 + pud * 0.04);
    // the wet sand near the water and along the foot glitters with plankton
    fG += ${g('#8ff8f0')} * twinkle(p * 1.7 + 3.0, 2.6, 0.975) * bank * (1.0 - wat) * 0.7;
    // the pools and channels: a barnacled rim of soaked rock, then glowing water over a sandy bed
    if (bank > 0.001) {
      vec2 pc; vec3 pv = vor(p * 2.6 + 17.0, pc);
      vec3 rk = mix(${g('#2c3438')}, ${g('#4a545a')}, pv.z) * (0.84 + 0.22 * clamp(dot(normalize(-pc + 1e-4), vec2(0.54, 0.84)) * 0.5 + 0.5, 0.0, 1.0));
      rk = mix(rk, ${g('#c07a88')}, smoothstep(0.6, 0.7, vn(p * 2.2 + 5.0)) * 0.45);
      vec2 bq = p * 9.0; vec2 bi = floor(bq); vec2 bo = fract(bq) - 0.5 - (h2(bi) - 0.5) * 0.5;
      float barn = step(0.6, h1(bi + 7.0)) * step(0.42, vn(p * 1.5 + 9.0)) * smoothstep(0.2, 0.12, length(bo)) * (1.0 - wat);
      rk = mix(rk, mix(${g('#e8e2d2')}, ${g('#5e5854')}, smoothstep(0.07, 0.0, length(bo))), barn * 0.9);
      c = mix(c, c * vec3(0.55, 0.62, 0.66), bank * 0.85);
      c = mix(c, rk, smoothstep(0.2, 0.4, sb) * (1.0 - wat) * 0.92);
      if (wat > 0.0) {
        vec2 fl = p * 0.9 + vec2(uTime * 0.13, uTime * 0.09);
        float rip = vn(fl * 1.7) * 0.6 + vn(fl * 3.9 + 3.0) * 0.4, deep = smoothstep(0.55, 0.95, sb);
        vec3 bed = mix(${g('#b8b498')}, ${g('#7e928a')}, vn(p * 2.0)) * (0.9 + 0.2 * vn(p * 7.0));
        vec3 w = mix(bed * vec3(0.32, 0.6, 0.62), ${g('#0c4a56')}, 0.45 + deep * 0.35);
        w = mix(w, ${g('#03121c')}, deep * 0.75);
        w = mix(w, mix(${g('#0e5a62')}, ${g('#3a9a98')}, rip), 0.22 * (1.0 - deep * 0.7));
        float caus = smoothstep(0.07, 0.0, abs(vn(fl * 2.6 + 7.0) - 0.5)) * smoothstep(0.35, 0.8, vn(fl * 0.8 + 3.0)) * (0.6 + 0.4 * vn(fl * 5.0));
        w = mix(w, ${g('#8ae8e0')}, caus * 0.22 * (1.0 - deep * 0.7));
        // little fish wandering in the pools (one to a 3 m cell, drawn where it swims in the water), a shadow on the bed
        {
          vec2 fcl = floor(p / 3.0); float fh = h1(fcl + 41.0);
          if (fh > 0.4) {
            float ft = uTime * (0.22 + fh * 0.3) + fh * 20.0;
            vec2 fc = (fcl + 0.5 + vec2(sin(ft), sin(ft * 1.3 + 1.0)) * 0.3) * 3.0;
            vec2 fv = normalize(vec2(cos(ft), 1.3 * cos(ft * 1.3 + 1.0)) + 1e-4);
            if (texture2D(uDeco, fc / uSize).b > 0.55) {
              vec2 dq = p - fc; vec2 lq = vec2(dot(dq, fv), dot(dq, vec2(-fv.y, fv.x)));
              float wig = sin(uTime * 9.0 + fh * 30.0) * 0.012 * smoothstep(0.0, -0.12, lq.x);
              float body = smoothstep(1.0, 0.8, length(vec2(lq.x / 0.12, (lq.y - wig) / 0.045)));
              float tail = step(lq.x, -0.1) * step(-0.2, lq.x) * step(abs(lq.y - wig * 2.0), (-0.1 - lq.x) * 0.9);
              float sh = smoothstep(1.0, 0.6, length(vec2((lq.x + 0.03) / 0.14, (lq.y + 0.04) / 0.06)));
              w = mix(w, w * 0.6, sh * 0.5);
              vec3 fcol = fh > 0.8 ? ${g('#ff9a4a')} : fh > 0.6 ? ${g('#ffd27a')} : ${g('#e85a5a')};
              w = mix(w, mix(fcol, vec3(1.0), step(0.04, lq.x) * step(lq.x, 0.07) * 0.6), max(body, tail));
            }
          }
        }
        float edge = smoothstep(0.42, 0.47, sb) * (1.0 - smoothstep(0.47, 0.56, sb));
        w = mix(w, ${g('#e8fffa')}, edge * (0.42 + 0.25 * sin(uTime * 2.2 + p.x * 2.0 + p.y)));
        c = mix(c, w, wat);
        float br = 0.75 + 0.25 * sin(uTime * 0.9 + vn(p * 0.3) * 6.0);
        fG += ${g(P.teal)} * wat * (0.035 + 0.075 * (1.0 - deep) + 0.03 * rip) * br;
        fG += ${g(P.spark)} * (twinkle(p + vec2(uTime * 0.05, 0.0), 3.4, 0.72) * wat * 1.2 + caus * wat * (0.05 + 0.04 * (1.0 - deep)));
      }
    }
    // the shrine rooms: a round dais of fitted basalt at the room's heart, a ring of pale shell inlaid round it
    if (rid > 0) {
      vec4 R = uRoom[rid - 1]; vec4 K = uRoomK[rid - 1];
      if (K.x > 4.5 && K.x < 5.5) {
        vec2 ctr = (R.xy + R.zw) * 0.5; float rr = clamp(min(R.z - R.x, R.w - R.y) * 0.5 - 4.0, 1.6, 2.9);
        vec2 d0 = p - ctr; float r0 = length(d0), a0 = atan(d0.y, d0.x);
        if (r0 < rr + 1.0) {
          float ci = floor(r0 / 0.9), rad = (ci + 0.5) * 0.9, ns = max(1.0, floor(6.28318 * rad / 1.05)), off = h1(vec2(ci, 2.0));
          float uu = (a0 / 6.28318 + 0.5 + off) * ns, sj = floor(uu), fr = fract(r0 / 0.9), arc = min(fract(uu), 1.0 - fract(uu)) * 6.28318 * rad / ns;
          float gap = smoothstep(0.0, 0.07, min(fr, 1.0 - fr) * 0.9) * smoothstep(0.0, 0.06, arc);
          vec3 sc = mix(${g(P.basA)}, ${g(P.basB)}, h1(vec2(ci, sj))) * (0.92 + 0.1 * vn(p * 5.0));
          if (ci < 0.5) { sc = mix(${g(P.basB)}, ${g(P.salt)}, 0.35); gap = 1.0; }
          float inP = smoothstep(rr + 0.4, rr, r0);
          float shellR = smoothstep(0.1, 0.03, abs(r0 - rr - 0.25)) * (0.6 + 0.4 * step(0.4, fract(a0 * 9.0)));
          c = mix(c, c * 0.72, smoothstep(rr + 0.9, rr + 0.3, r0) * (1.0 - inP) * 0.5);
          c = mix(c, mix(${g(P.joint)}, sc, gap), inP);
          c = mix(c, ${g('#b8b0a2')}, shellR * 0.7);
        }
      }
    }
    // the cave closes in: a cool, dark band along every wall foot (the rock overhead shades it), the glows muted there
    float encl = smoothstep(0.5, 2.6, wd);
    c *= mix(vec3(0.36, 0.44, 0.5), vec3(1.0), encl);
    fG *= 0.45 + 0.55 * encl;
  }
`;
// the arena: Umibōzu's cove. The sea fills the far side of the ring beyond a shoreline (uSea: the sea direction xy, the
// shore's distance from the centre z, w on); a wash line breathes in and out over the wet sand; a ring of hex basalt runs
// round the beach and a seigaiha mosaic of shell is inlaid in the sand, glowing with the sigil (uSigDim < 1 sinks it
// while the boss winds up).
const ARENA = /* glsl */`
  if (uBoss.w > 0.5) {
    vec2 d = p - uBoss.xy; float r = length(d), R = uBoss.z;
    if (r < R + 3.2) {
      vec2 sd = uSea.w > 0.5 ? uSea.xy : vec2(-0.7071, -0.7071), tn = vec2(-sd.y, sd.x);
      float al = dot(d, sd), la = dot(d, tn), e0 = uSea.w > 0.5 ? uSea.z : 99.0;
      // the wash: the waterline breathes up and down the sand (slow swell + small wavelets along the shore)
      float sw = 0.5 + 0.5 * sin(uTime * 0.55);
      float edgeL = e0 + 0.2 - sw * 0.45 + 0.16 * sin(la * 0.6 + uTime * 0.8) + 0.08 * sin(la * 1.9 - uTime * 1.3);
      float u = al - edgeL;              // < 0 the beach, > 0 the sea
      float beach = 1.0 - smoothstep(-0.04, 0.04, u);
      // ---- the beach: firm wet sand, darker and glossier toward the water, ripples, shell grit
      {
        vec3 sand = mix(${g('#7e7a6e')}, ${g('#958e7e')}, smoothstep(0.3, 0.7, fbm(p * 0.09 + 5.0))) * (0.92 + 0.1 * vn(p * 2.6));
        float ph = dot(d, tn) * 3.6 + vn(p * 0.4 + 3.0) * 5.0, rp = sin(ph);
        sand *= 1.0 + smoothstep(0.55, 1.0, rp) * 0.07 - smoothstep(-0.3, -0.95, rp) * 0.1;
        float wetB = 1.0 - smoothstep(-3.6, -0.4, al - e0);
        sand = mix(sand, sand * vec3(0.56, 0.64, 0.68), wetB * 0.75);
        // the last wash's lace: a thin foam line left on the sand, sliding back down
        float lace = smoothstep(0.08, 0.0, abs(al - (e0 - 0.35 - (1.0 - sw) * 0.9) + 0.06 * sin(la * 2.3 + uTime))) * wetB;
        sand = mix(sand, ${g('#dff4f0')}, lace * 0.5);
        fG += ${g('#cffff8')} * twinkle(p * 1.4, 3.0, 0.9) * wetB * 0.7;
        c = mix(c, sand, beach * smoothstep(R + 2.4, R + 1.2, r));
      }
      // ---- little rock pools near the rim (decor b): a barnacled rim, glowing water
      {
        float sb2 = dc.b + (vn(p * 1.6 + 2.0) - 0.5) * 0.07, bk = smoothstep(0.14, 0.34, sb2) * beach, wt = smoothstep(0.42, 0.5, sb2) * beach;
        if (bk > 0.001) {
          vec2 bq = p * 9.0; vec2 bi = floor(bq); vec2 bo = fract(bq) - 0.5 - (h2(bi) - 0.5) * 0.5;
          vec3 rk = mix(${g('#2c3438')}, ${g('#4a545a')}, vn(p * 3.0)) * (0.85 + 0.2 * vn(p * 7.0));
          rk = mix(rk, mix(${g('#ecdcc0')}, ${g('#5e5854')}, smoothstep(0.07, 0.0, length(bo))), step(0.62, h1(bi + 7.0)) * smoothstep(0.2, 0.12, length(bo)) * 0.9);
          c = mix(c, c * vec3(0.55, 0.62, 0.66), bk * 0.85);
          c = mix(c, rk, smoothstep(0.2, 0.4, sb2) * (1.0 - wt) * 0.9 * beach);
          vec2 fl = p * 0.9 + vec2(uTime * 0.13, uTime * 0.09); float rip = vn(fl * 1.7), dp = smoothstep(0.55, 0.95, sb2);
          vec3 w = mix(${g('#0c4a56')}, ${g('#03121c')}, dp * 0.7);
          w = mix(w, ${g('#8ae8e0')}, smoothstep(0.07, 0.0, abs(vn(fl * 2.6 + 7.0) - 0.5)) * 0.2 * (1.0 - dp * 0.6));
          w = mix(w, ${g('#e8fffa')}, smoothstep(0.42, 0.47, sb2) * (1.0 - smoothstep(0.47, 0.56, sb2)) * 0.45);
          c = mix(c, w, wt);
          fG += ${g(P.teal)} * wt * (0.04 + 0.06 * (1.0 - dp) + 0.03 * rip) + ${g(P.spark)} * twinkle(p + vec2(uTime * 0.05, 0.0), 3.4, 0.72) * wt * 1.1;
        }
      }
      // ---- a ring of hex basalt flags round the beach (it dissolves toward the water)
      {
        float r0 = R - 2.9;
        float inRing = smoothstep(r0 - 0.06, r0 + 0.06, r) * (1.0 - smoothstep(R + 1.0, R + 1.3, r)) * (1.0 - smoothstep(e0 - 2.2, e0 - 0.8, al));
        vec2 hid; vec2 hv = hexOf(p * 1.05 + 3.0, hid); float he = hexEdge(hv), hh = h1(hid);
        float on = step(0.12, hh) * inRing * (1.0 - smoothstep(0.1, 0.2, dc.b));
        float lit = clamp(dot(normalize(-hv + 1e-4), vec2(0.54, 0.84)) * 0.5 + 0.5, 0.0, 1.0);
        vec3 st = mix(${g(P.basA)}, ${g(P.basB)}, hh) * (0.9 + 0.12 * vn(p * 5.0)) * (0.9 + 0.16 * lit * smoothstep(0.0, 0.18, he));
        st = mix(st, ${g(P.salt)}, smoothstep(0.07, 0.03, he) * smoothstep(0.03, 0.06, he) * 0.4);
        st = mix(st, st * vec3(0.84, 0.98, 0.86), smoothstep(0.55, 0.85, vn(p * 1.3 + hh * 7.0)) * 0.45);
        c = mix(c, c * 0.7, inRing * (1.0 - on) * 0.4);
        c = mix(c, mix(${g(P.joint)}, st, smoothstep(0.0, 0.035, he)), on * beach);
        fG += ${g('#cfeff0')} * twinkle(p * 1.2, 3.0, 0.9) * on * beach * 0.25;
      }
      // ---- the seigaiha: fans of wave arcs in pale shell, inlaid in a disc on the beach, a rim of round pebbles
      {
        vec2 mc0 = uBoss.xy - sd * 2.4; vec2 dm = p - mc0; float rm = length(dm), Rm = min(4.3, max(2.5, e0 + 2.4 - 3.0));
        float disc = 1.0 - smoothstep(Rm - 0.05, Rm + 0.05, rm);
        float fan = seigaiha(vec2(dot(dm, tn), dot(dm, sd)) / 1.05 + vec2(0.5, 0.25));
        float arcs = fan < 0.0 ? 0.0 : smoothstep(0.38, 0.46, abs(fract(fan * 3.4 + 0.5) - 0.5)) * step(0.1, fan) * (0.55 + 0.45 * smoothstep(0.25, 0.7, vn(p * 1.3 + 4.0)));
        float rim = smoothstep(0.07, 0.0, abs(rm - Rm - 0.28) - 0.05) + smoothstep(0.05, 0.0, abs(rm - Rm) - 0.02);
        vec2 dq = vec2((fract(atan(dm.y, dm.x) / 6.28318 * 52.0) - 0.5) * rm * 6.28318 / 52.0, rm - Rm - 0.62);
        float dots = smoothstep(0.13, 0.08, length(dq));
        float pulse = 0.6 + 0.4 * sin(uTime * 1.4 - rm * 0.5);
        vec3 shell = mix(${g('#d8d0c0')}, ${g('#f0e8dc')}, vn(p * 3.0)) * (0.92 + 0.08 * vn(p * 9.0));
        vec3 sigC = mix(c * 0.8, mix(shell, uSig, 0.25), 0.35 + 0.65 * uSigDim);
        float sig = max(arcs * disc * 0.8, max(rim, dots)) * beach;
        c = mix(c, c * 0.78, disc * beach * 0.2);
        c = mix(c, sigC, sig * (0.3 + 0.24 * uSigDim));
        c *= 1.0 - (1.0 - uSigDim) * 0.16 * disc * beach;
        fG += uSig * sig * 0.12 * pulse * uSigDim * uSigDim;
      }
      // ---- the sea: the foam line, glowing teal shallows over rippled sand, then the deep with plankton and swells
      if (uSea.w > 0.5 && u > -0.06) {
        float dpt = smoothstep(0.0, 6.5, u);
        vec2 fl = p * 0.55 + vec2(uTime * 0.05, -uTime * 0.04);
        float rip = vn(fl * 1.6) * 0.6 + vn(fl * 3.7 + 3.0) * 0.4;
        vec3 bed = mix(${g('#8c8c7c')}, ${g('#5e7068')}, vn(p * 1.4)) * (1.0 + 0.08 * sin(dot(d, tn) * 3.6 + vn(p * 0.4 + 3.0) * 5.0));
        vec3 w = mix(bed * vec3(0.32, 0.62, 0.64), ${g('#0e5a64')}, 0.5);
        w = mix(w, ${g('#041a28')}, smoothstep(0.08, 0.7, dpt));
        w = mix(w, ${g('#020c14')}, smoothstep(0.55, 1.0, dpt) * 0.7);
        w = mix(w, mix(${g('#0e5a62')}, ${g('#3a9a98')}, rip), 0.22 * (1.0 - dpt * 0.7));
        float caus = smoothstep(0.045, 0.0, abs(vn(fl * 2.4 + 7.0) - 0.5)) * smoothstep(0.3, 0.75, vn(fl * 0.8 + 3.0)) * (1.0 - smoothstep(0.1, 0.45, dpt));
        w = mix(w, ${g('#c8fff4')}, caus * 0.32);
        float swl = smoothstep(0.86, 1.0, sin(u * 1.5 - uTime * 0.9 + vn(p * 0.2) * 3.0)) * smoothstep(0.15, 0.4, dpt);
        w = mix(w, ${g('#3a90a0')}, swl * 0.35);
        float foam = smoothstep(0.42, 0.0, u) * (0.75 + 0.25 * vn(p * 3.0 + uTime * 0.6));
        foam = max(foam, smoothstep(0.9, 1.0, sin(u * 5.0 - uTime * 2.2 + rip * 3.0)) * (1.0 - smoothstep(0.4, 2.2, u)) * 0.6);
        w = mix(w, ${g('#eefffb')}, clamp(foam, 0.0, 1.0) * 0.85);
        float wk = smoothstep(-0.06, 0.06, u);
        c = mix(c, w, wk);
        float br = 0.8 + 0.2 * sin(uTime * 0.7 + al * 0.4);
        fG += ${g(P.teal)} * wk * (0.12 * (1.0 - smoothstep(0.0, 0.5, dpt)) + 0.03) * br;
        fG += ${g(P.spark)} * twinkle(p * 0.9 + vec2(uTime * 0.03, 0.0), 2.4, 0.8) * wk * (0.5 + 0.8 * dpt);
        fG += ${g('#eaffff')} * foam * wk * 0.06;
      }
      // the rock closes in round the cove too
      float encl = smoothstep(0.5, 2.6, wd);
      c *= mix(vec3(0.4, 0.48, 0.54), vec3(1.0), encl);
    }
  }
`;
// ------------------------------------------------------------------ wall shader (kind 1: the rock face, 3: the top)
const WALL = /* glsl */`
    if (vWall.z > 2.5) { // above the brow: dark wet boulders heaving up into the dark, weed and barnacles along the brow,
      // glowing algae in the cracks; it fades toward the back as the rock rises out of sight
      vec2 p = vCWorld.xz; float o = vWall.y, Dd = max(vWall.w, 0.6);
      vec2 q = p * 0.8 + uSeed; vec2 qi = floor(q), qf = fract(q); float md = 8.0, md2 = 8.0; vec2 mc = vec2(0.0), mr = vec2(0.0);
      for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) { vec2 gg = vec2(float(i), float(j)); vec2 rr = gg + h2(qi + gg) * 0.85 + 0.075 - qf; float dd = dot(rr, rr); if (dd < md) { md2 = md; md = dd; mc = qi + gg; mr = rr; } else if (dd < md2) md2 = dd; }
      float edge = sqrt(md2) - sqrt(md), bh = h1(mc + uSeed);
      vec3 c = mix(${g('#3a4246')}, ${g('#545c5e')}, bh) * (0.9 + 0.12 * vn(p * 3.0));
      float lit = clamp(dot(normalize(-mr + 1e-4), vec2(0.54, 0.84)) * 0.5 + 0.5, 0.0, 1.0);
      c *= 0.8 + 0.32 * lit * smoothstep(0.0, 0.5, edge);
      c *= 1.0 - smoothstep(0.1, 0.0, edge) * 0.55;
      wG += ${g('#7ff0e8')} * smoothstep(0.06, 0.0, edge) * twinkle(p * 1.3, 2.4, 0.84) * 0.4;  // glowing algae in the cracks
      float wb = smoothstep(0.85, 0.1, o + (fbm(p * 0.9 + 3.0) - 0.5) * 0.9) * smoothstep(0.3, 0.6, fbm(p * 1.3 + uSeed));
      vec3 wc = mix(${g('#2c321a')}, ${g('#5a5e2c')}, smoothstep(0.3, 0.8, fbm(p * 2.2))) * (0.9 + 0.14 * vn(p * 9.0));
      wc = mix(wc, ${g('#3e6a34')}, smoothstep(0.62, 0.7, vn(p * 1.7 + 9.0)) * 0.6);
      c = mix(c, wc, wb * 0.85);

      c *= mix(1.0, 0.28, smoothstep(0.1, Dd + 0.3, o));
      c *= 1.0 + 0.45 * smoothstep(0.5, 0.0, o); // the lit rim along the brow: its silhouette against the dark
      diffuseColor.rgb *= c * 1.12;
    } else if (vWall.z > 0.5 && vWall.z < 1.5) { // the rock face
      float u = vWall.x, v = vWall.y, lip = vWall.w * 0.9;
      diffuseColor.rgb *= mix(1.0, 0.8, smoothstep(0.62, 0.86, v / max(vWall.w, 0.1))) * (1.0 + 0.3 * smoothstep(0.84, 0.92, v / max(vWall.w, 0.1))); // the brow's shadow, then its lit nose
      // basalt in big upright blocks (a voronoi stretched tall: columns gone round and broken by the sea), each its own
      // tone, a dark crack between, a lit upper edge, fine horizontal sheeting in the stone
      {
        vec2 q = vec2(u * 0.62, v * 0.42); vec2 qi = floor(q), qf = fract(q); float md = 8.0, md2 = 8.0; vec2 mc = vec2(0.0), mr = vec2(0.0);
        for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) { vec2 gg = vec2(float(i), float(j)); vec2 rr = gg + h2(qi + gg + uSeed) * 0.85 + 0.075 - qf; float dd = dot(rr, rr); if (dd < md) { md2 = md; md = dd; mc = qi + gg; mr = rr; } else if (dd < md2) md2 = dd; }
        float edge = sqrt(md2) - sqrt(md);
        diffuseColor.rgb *= 0.82 + 0.26 * h1(mc + uSeed);
        diffuseColor.rgb *= 1.0 - smoothstep(0.08, 0.0, edge) * 0.42;
        diffuseColor.rgb *= 1.0 + smoothstep(0.16, 0.03, edge) * step(0.0, -mr.y) * 0.3; // wet basalt: a lit upper edge on every block
        wG += ${g('#9fd8e0')} * smoothstep(0.1, 0.02, edge) * step(0.0, -mr.y) * 0.05;
        diffuseColor.rgb *= 0.95 + 0.05 * sin(v * 23.0 + vn(vec2(u * 0.8, v * 2.0)) * 5.0);
      }
      diffuseColor.rgb *= mix(vec3(0.94, 0.98, 1.04), vec3(1.05, 1.0, 0.94), smoothstep(0.3, 0.7, vn(vec2(u * 0.07, 1.0))));
      // the tide's zones, from the foot up: the black wet band, barnacles and mussels, pink crust, green weed, the pale
      // high-water line and orange lichen above it
      float hw = 1.25 + (vn(vec2(u * 0.25, 7.0)) - 0.5) * 0.34;
      diffuseColor.rgb *= mix(1.0, 0.8, 1.0 - smoothstep(hw - 0.15, hw + 0.05, v)); // soaked below the line
      float foot = 1.0 - smoothstep(0.06, 0.3, v + (vn(vec2(u * 1.3, 3.0)) - 0.5) * 0.14);
      diffuseColor.rgb = mix(diffuseColor.rgb, ${g('#1a2024')}, foot * 0.75);
      wG += ${g('#9ef0e8')} * twinkle(vec2(u * 2.2, v * 3.0), 3.0, 0.93) * (1.0 - smoothstep(0.1, 0.45, v)) * 0.45;
      vec2 bq = vec2(u, v) * 9.0; vec2 bi = floor(bq); vec2 bo = fract(bq) - 0.5 - (h2(bi + uSeed) - 0.5) * 0.7;
      float bz = smoothstep(0.04, 0.22, v) * (1.0 - smoothstep(0.55, 0.95, v + (vn(vec2(u * 0.9, 2.0)) - 0.5) * 0.3));
      diffuseColor.rgb = mix(diffuseColor.rgb, ${g('#c8b894')}, bz * 0.55); // the barnacle band: a cream stripe from afar
      float barn = step(1.0 - bz * 0.5, h1(bi + 5.0)) * step(0.4, vn(vec2(u, v) * 2.2 + 3.0)) * smoothstep(0.2, 0.11, length(bo));
      diffuseColor.rgb = mix(diffuseColor.rgb, mix(${g('#f0e6d0')}, ${g('#4a4440')}, smoothstep(0.08, 0.0, length(bo))), barn * 0.9);
      vec2 mq = vec2(u * 6.0, v * 7.0); vec2 mi = floor(mq); vec2 mo = fract(mq) - 0.5 - (h2(mi + 13.0) - 0.5) * 0.6; float mh = h1(mi + 31.0 + uSeed);
      float mz = smoothstep(0.16, 0.3, v) * (1.0 - smoothstep(0.5, 0.78, v)) * smoothstep(0.58, 0.72, vn(vec2(u * 0.8, 9.0))) * step(0.45, vn(vec2(u, v) * 2.5 + 11.0));
      float mus = step(0.5, mh) * smoothstep(1.0, 0.7, length(mo / vec2(0.36, 0.2))) * mz;
      diffuseColor.rgb = mix(diffuseColor.rgb, mix(${g('#1a1e30')}, ${g('#4a5a8a')}, smoothstep(-0.05, 0.2, mo.y)), mus * 0.9);
      float pk = smoothstep(0.62, 0.72, vn(vec2(u * 1.1, v * 1.6) + 11.0)) * (1.0 - smoothstep(0.3, 0.62, v));
      diffuseColor.rgb = mix(diffuseColor.rgb, ${g('#8a5a64')}, pk * 0.35);
      float wk = smoothstep(0.6, 0.7, vn(vec2(u * 1.4, v * 2.2) + 23.0)) * smoothstep(0.4, 0.7, v) * (1.0 - smoothstep(hw - 0.25, hw, v));
      diffuseColor.rgb = mix(diffuseColor.rgb, ${g('#46663a')} * (0.85 + 0.25 * vn(vec2(u * 6.0, v * 6.0))), wk * 0.55);
      diffuseColor.rgb = mix(diffuseColor.rgb, ${g('#d8ccb0')}, smoothstep(0.1, 0.0, abs(v - hw + (vn(vec2(u * 2.0, 5.0)) - 0.5) * 0.08)) * 0.55); // the pale high-water line
      float lchB = smoothstep(hw + 0.02, hw + 0.12, v) * (1.0 - smoothstep(hw + 0.3, hw + 0.6, v + (vn(vec2(u * 1.1, 4.0)) - 0.5) * 0.3));
      diffuseColor.rgb = mix(diffuseColor.rgb, ${g('#c88a3a')} * (0.85 + 0.3 * vn(vec2(u * 5.0, v * 5.0))), lchB * smoothstep(0.35, 0.6, vn(vec2(u * 0.9, 6.0))) * 0.6); // a band of orange lichen over it
      vec2 lq = vec2(u, v) * 3.2; vec2 lqi = floor(lq); vec2 lqo = fract(lq) - 0.5 - (h2(lqi + 7.0) - 0.5) * 0.7;
      float lz = smoothstep(hw, hw + 0.15, v) * (1.0 - smoothstep(hw + 0.5, hw + 1.1, v));
      diffuseColor.rgb = mix(diffuseColor.rgb, ${g('#e8a03a')}, step(0.78, h1(lqi + 3.0 + uSeed)) * smoothstep(0.24 + 0.1 * h1(lqi), 0.1, length(lqo * vec2(1.0, 1.4))) * lz * 0.8);
      // seeps: wet streaks running down from the brow, glinting
      float sk = smoothstep(0.62, 0.82, vn(vec2(u * 1.7, 2.0))) * smoothstep(lip, lip * 0.2, v);
      diffuseColor.rgb *= 1.0 - sk * 0.3;
      wG += ${g('#9ef0e8')} * sk * twinkle(vec2(u * 2.0, v * 3.0 + uTime * 0.6), 3.0, 0.9) * 0.9;
      // kelp hanging from under the brow: a dark weedy band right under the lip, then fronds of varied length
      float dv = lip - v;
      if (dv < 1.4) {
        float cu2 = u / 0.17, ci2 = floor(cu2), fx = fract(cu2) - 0.5;
        float len = (0.15 + 0.95 * h1(vec2(ci2, 5.0) + uSeed)) * step(0.3, h1(vec2(ci2, 11.0)));
        float t = clamp(dv / max(len, 1e-3), 0.0, 1.0), wdt = mix(0.42, 0.12, t * t) + sin(dv * 9.0 + ci2) * 0.04;
        float fr = step(dv, len) * smoothstep(wdt, wdt - 0.1, abs(fx + sin(dv * 3.0 + ci2) * 0.12));
        fr = max(fr, smoothstep(0.14 + 0.06 * sin(u * 3.0), 0.02, dv));
        vec3 kc = mix(${g('#2e3016')}, ${g('#6e6a2c')}, smoothstep(0.0, 0.4, 1.0 - dv / max(len, 0.1)) * 0.6 + h1(vec2(ci2, 2.0)) * 0.4);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.7, smoothstep(0.0, 0.06, dv - len) * (1.0 - smoothstep(0.06, 0.14, dv - len)) * step(0.3, h1(vec2(ci2, 11.0))) * 0.6);
        diffuseColor.rgb = mix(diffuseColor.rgb, kc, fr * step(dv, 1.35));
        wG += ${g('#9ef0e8')} * fr * twinkle(vec2(u * 3.0, v * 2.0), 3.0, 0.97) * 0.3;
      }
      diffuseColor.rgb *= mix(0.62, 1.0, smoothstep(0.0, 0.45, v));
      wG += diffuseColor.rgb * 0.07; // (a faint fill so the far walls frame the room in the dim cave)
    }`;

// ------------------------------------------------------------------ cached kit pieces / geometry
const cache = new Map();
const cached = (k, fn) => { if (!cache.has(k)) cache.set(k, fn()); return cache.get(k); };
const RK = ['#454e54', '#535d62', '#636c70', '#4c555a'].map(cc);
const RK_TOP = cc('#7e888a'), RK_WET = cc('#20272c'), RK_BARN = cc('#d8d2c4'), RK_WEED = cc('#4a5028'), RK_PINK = cc('#8a6a70');
/** paint a cave rock: dark banded basalt, salt-dusted tops, a soaked foot crusted with barnacles and weed, pink crust */
function paintCave(g0, { wetTo = 0.32, seed = 0, barn = 0.6, weed = 0.5 } = {}) {
  return paint(g0, (p, n, o) => {
    const band = Math.floor(p.y * 2.4 + p.x * 0.2 + nz(p.x * 0.8 + seed, p.z * 0.8) * 1.2);
    o.copy(RK[((band % 4) + 4) % 4]).multiplyScalar(0.86 + 0.22 * clamp(n.y + 0.45));
    if (n.y > 0.55) o.lerp(RK_TOP, 0.2 + 0.16 * clamp(nz(p.x * 2 + seed, p.z * 2)));
    const w = clamp((wetTo - p.y) * 3.2 + nz(p.x * 3, p.z * 3) * 0.25);
    if (w > 0) {
      o.lerp(RK_WET, w * 0.72);
      if (p.y > 0.02 && nz(p.x * 9 + seed, p.y * 9 + p.z * 9) > 0.62 - barn * 0.4) o.lerp(RK_BARN, 0.72);
      if (p.y < wetTo * 0.6 && nz(p.x * 5 - seed, p.z * 5 + p.y * 4) > 0.55 - weed * 0.3) o.lerp(RK_WEED, 0.6);
    }
    if (n.y < 0.35 && n.y > -0.2 && nz(p.x * 4 + seed * 2, p.y * 6 + p.z * 4) > 0.62) o.lerp(RK_PINK, 0.25);
  });
}
/** a few real barnacle cones on a rock's wet flanks (sampled off its surface) */
function barnacled(g0, seed, n = 18, wetTo = 0.4) {
  const r = mulberry32(seed * 71 + 3), pos = g0.attributes.position, nor = g0.attributes.normal, parts = [g0];
  for (let i = 0, k = 0; i < pos.count * 3 && k < n; i++) {
    const j = Math.floor(r() * pos.count), y = pos.getY(j); if (y < 0.03 || y > wetTo || nor.getY(j) > 0.6) continue;
    const nn = V(nor.getX(j), nor.getY(j), nor.getZ(j)).normalize(), s = 0.7 + r() * 0.7;
    for (let m = 0, c = 2 + Math.floor(r() * 3); m < c; m++) {
      const b = new THREE.CylinderGeometry(0.012 * s, 0.03 * s, 0.036 * s, 6, 1, true);
      b.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), nn)); b.translate(pos.getX(j) + (r() - 0.5) * 0.1 * s, y + (r() - 0.5) * 0.06 * s, pos.getZ(j) + (r() - 0.5) * 0.1 * s);
      parts.push(paint(b, (p, nn2, o) => o.set('#ece6d8').multiplyScalar(0.84 + 0.16 * r())));
    }
    k++;
  }
  return merge(parts);
}
/** a dark wet cave boulder (barnacles on its foot) */
function caveRock(seed = 0, R = 0.6, sq = 0.62, cones = true) {
  return cached(`crock:${seed}:${R}:${sq}:${cones}`, () => {
    const g0 = paintCave(lump(V(0, R * 0.22, 0), R, { detail: 2, noise: 0.3, squash: sq, seed: seed + 11 }), { wetTo: R * 0.55, seed });
    return cones ? barnacled(g0, seed, Math.round(R * 22), R * 0.55) : g0;
  });
}
/** a ring of barnacled stones round a pool of radius R, open toward local +z by `gap` (half-angle, 0 = none) */
function rimRocks(seed, R, gap = 0) {
  return cached(`rim:${seed}:${R.toFixed(2)}:${gap}`, () => {
    const r = mulberry32(seed * 7 + 3), parts = [], n = Math.round(R * 5.2);
    for (let k = 0; k < n; k++) {
      const a = k / n * TAU + (r() - 0.5) * 0.2;
      if (gap && Math.abs(angD(a, PI / 2)) < gap) continue;
      const rr = R * (1.02 + r() * 0.1), s = 0.22 + r() * 0.26;
      parts.push(lump(V(Math.cos(a) * rr, s * 0.12, Math.sin(a) * rr), s, { detail: 1, noise: 0.35, squash: 0.5 + r() * 0.2, seed: seed * 31 + k }));
    }
    return paintCave(merge(parts), { wetTo: 0.3, seed, barn: 0.8 });
  });
}
// the tidepools' own little sea life, built once (geometry shared by every placement)
const LIFE = {
  anem: k => cached('anem' + k, () => TA.anemone(k + 1).reed), star: k => cached('star' + k, () => TA.starfish(k + 5).body),
  urch: k => cached('urch' + k, () => TA.urchin(k + 1).body), shell: k => cached('shell' + k, () => TA.shell(k + 1, ['scallop', 'spiral', 'cowrie', 'scallop'][k % 4]).body),
  kelp: k => cached('kelp' + k, () => TA.kelp(k, 0.6).reed), coral: k => cached('coral' + k, () => TA.coral(k + 1).body),
  drift: k => cached('drift' + k, () => tintVC(TA.driftwood(k + 1, 1.5 + k * 0.5).body, [0.5, 0.46, 0.4])), // (sea-grey, not sun-bleached)
  peb: k => cached('peb' + k, () => TA.pebbles(k + 1, 9, 0.6).stone),
};
/** scale a geometry's vertex colours per channel (in place) */
function tintVC(g0, k) { const c = g0.attributes.color; for (let i = 0; i < c.count; i++) c.setXYZ(i, c.getX(i) * k[0], c.getY(i) * k[1], c.getZ(i) * k[2]); return g0; }
/** stamp a piece of sea life into a batch (clutter by default: no shadows) */
function life(B, geo, x, y, z, rot = 0, s = 1, mul = 0.82, tilt = null) { B.addVC(geo, M(x, y, z, s, s, s, tilt ? tilt[0] : 0, rot, tilt ? tilt[1] : 0), mul); }
/** a tidepool asset's buckets (rock / body / reed / stone / cloth / glow…) baked into the world's batches */
function bake(W, out, x, y, z, rot = 0, s = 1, { B = W.solid, mul = 0.82 } = {}) {
  const m = M(x, y, z, s, s, s, 0, rot, 0).clone();
  for (const k of ['rock', 'body', 'reed', 'stone', 'grass', 'cloth', 'leaf', 'water']) if (out[k]?.isBufferGeometry) B.addVC(out[k], m, mul);
  for (const k of ['glow', 'hot']) if (out[k]?.isBufferGeometry) W.glow.addVC(out[k], m);
}

/** the room light: a bleached driftwood post with a crooked arm, an amber glass float glowing in a rope net hung from it
 *  (local +z: the arm's side) */
function floatLantern(seed = 0, h = 1.55) {
  return cached(`flan:${seed}:${h}`, () => kitPiece(seed * 13 + 3, B => {
    const r = mulberry32(seed * 31 + 7), lean = (r() - 0.5) * 0.14, tint = ['#ffb45a', '#ffc070', '#ffa64e', '#ffbe68'][seed % 4];
    const post = [{ p: V(0, -0.05, 0), r: 0.085 }, { p: V(lean * 0.3, h * 0.45, 0.02), r: 0.07 }, { p: V(lean * 0.8, h * 0.8, -0.01), r: 0.06 }, { p: V(lean, h, -0.02), r: 0.05 }];
    B.add(tube(post, 7, true), (p, n, o) => o.set('#c4baa8').lerp(cc('#e4ddd0'), clamp(n.y * 0.5 + 0.4)).multiplyScalar(0.82 + 0.18 * Math.abs(Math.sin(p.y * 13 + p.x * 9))));
    const top = V(lean, h - 0.06, -0.02), tip = V(lean, h + 0.04, 0.5);
    B.add(tube([{ p: top, r: 0.045 }, { p: top.clone().lerp(tip, 0.5).add(V(0, 0.07, 0)), r: 0.036 }, { p: tip, r: 0.028 }], 6, true), '#d2c8b6');
    const knot = BG.torus(0.05, 0.016, 4, 8); knot.rotateX(PI / 2); knot.translate(lean, h * 0.62, 0.0); B.add(knot, '#b89a64');
    const fy = h - 0.44, fz = 0.46;
    const cord = BG.cyl(0.008, 0.008, 0.3, 4); cord.translate(lean, fy + 0.3, fz); B.add(cord, '#c8b078');
    const fl = BG.sph(0.15, 14, 10); fl.translate(lean, fy, fz); B.glow(fl, tint, { tint: 0.85, flicker: 0.4 });
    for (const ry of [0, PI / 3, -PI / 3]) { const t = BG.torus(0.153, 0.009, 3, 16); t.rotateY(ry); t.translate(lean, fy, fz); B.add(t, '#a88a58'); }
    const eq = BG.torus(0.153, 0.009, 3, 16); eq.rotateX(PI / 2); eq.translate(lean, fy, fz); B.add(eq, '#a88a58');
    const cap = BG.cyl(0.035, 0.045, 0.04, 6); cap.translate(lean, fy + 0.16, fz); B.add(cap, '#7a5e40');
    const shellC = BG.cone(0.03, 0.07, 6); shellC.rotateX(PI); shellC.translate(lean + 0.07, h * 0.62 - 0.08, 0.04); B.add(shellC, '#f0d8c8');
    for (let k = 0; k < 3; k++) { const a = k / 3 * TAU + r(), d = 0.17 + r() * 0.05; B.add(paintCave(lump(V(Math.cos(a) * d, 0.03, Math.sin(a) * d), 0.09 + r() * 0.05, { detail: 1, noise: 0.35, squash: 0.6, seed: seed * 5 + k }), { wetTo: 0.1, seed: k }), null); }
    B.light([lean, fy, fz], { color: P.lantern, intensity: 2.2, radius: 5, flicker: 0.5, nightOnly: false });
  }, 0.02));
}
/** a little sea shrine to Ebisu: a driftwood hokora on a barnacled rock, a rope and shide, a red sea bream and sake on
 *  the offering shelf, a glass float hung from the eave, a round little stone Ebisu with his rod (local +z: the front) */
function umiHokora(seed = 0) {
  return cached('umiHokora:' + seed, () => kitPiece(seed * 17 + 9, B => {
    B.add(paintCave(lump(V(0, 0.1, 0), 0.75, { detail: 2, noise: 0.25, squash: 0.42, seed: seed + 3, sx: 1.25 }), { wetTo: 0.18, seed, barn: 0.8 }), null);
    B.at([0, 0.34, -0.05], 0, () => {
      const base = BG.box(0.92, 0.1, 0.78, 0.03); base.translate(0, 0.05, 0); B.add(base, '#6e6660');
      const box = BG.box(0.72, 0.62, 0.56, 0.03); box.translate(0, 0.41, 0); B.add(box, (p, n, o) => o.set('#8a7a66').lerp(cc('#b4a690'), clamp(n.y * 0.4 + 0.3)).multiplyScalar(0.86 + 0.14 * Math.abs(Math.sin(p.x * 28))));
      for (const sx of [-1, 1]) { const d = BG.box(0.3, 0.44, 0.03, 0.01); d.translate(sx * 0.17, 0.38, 0.29); B.add(d, '#3a2c26'); for (let k = 0; k < 3; k++) { const l = BG.box(0.28, 0.016, 0.02, 0); l.translate(sx * 0.17, 0.22 + k * 0.13, 0.31); B.add(l, '#c8b48c'); } }
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const pp = BG.box(0.06, 0.7, 0.06, 0.01); pp.translate(sx * 0.36, 0.43, sz * 0.28); B.add(pp, '#5e4a3c'); }
      roof(B, { type: 'gable', w: 0.8, d: 0.66, y0: 0.72, over: 0.26, gOver: 0.2, H: 0.4, curve: 0.3, lift: 0.07, liftW: 0.32, thick: 0.07, ribW: 0.2, color: '#4e6870', moss: 0.45, mossColor: '#6a8a52', pastel: 0.04 });
      shimenawa(B, { w: 0.7, y: 0.66, sag: 0.06, z: 0.34, r: 0.026 });
      const sh = BG.box(0.62, 0.04, 0.2, 0.01); sh.translate(0, 0.07, 0.48); B.add(sh, '#7a6650'); // the offering shelf
      // a red sea bream on a little stand, two white sake flasks
      const st = BG.cyl(0.08, 0.1, 0.05, 8); st.translate(-0.12, 0.115, 0.5); B.add(st, '#e8e0d0');
      const fish = BG.sph(0.1, 10, 7); fish.scale(1.2, 0.62, 0.32); fish.translate(-0.12, 0.2, 0.5); B.add(fish, (p, n, o) => o.set('#e8504a').lerp(cc('#ffd0b8'), clamp(-n.y * 1.2)));
      const tail = BG.cone(0.06, 0.08, 4); tail.rotateZ(PI / 2); tail.scale(1, 1, 0.3); tail.translate(-0.25, 0.22, 0.5); B.add(tail, '#d8403a');
      for (const sx of [0.1, 0.2]) { const fl = BG.lathe([[0.001, 0], [0.04, 0], [0.05, 0.05], [0.03, 0.11], [0.014, 0.14], [0.02, 0.16], [0.001, 0.16]], 8); fl.translate(sx, 0.09, 0.48); B.add(fl, '#f4eee2'); }
      // a glass float hung from the eave
      const fl = BG.sph(0.085, 10, 8); fl.translate(0.3, 0.52, 0.42); B.glow(fl, '#8ff0e0', { tint: 0.8, flicker: 0.2 });
      const cord = BG.cyl(0.006, 0.006, 0.18, 4); cord.translate(0.3, 0.69, 0.42); B.add(cord, '#c8b078');
    });
    // round little stone Ebisu beside it: a fat body, a smiling head in an eboshi cap, a rod over his shoulder
    B.at([0.72, 0.18, 0.28], -0.4, () => {
      const s = '#a8a4a0', body = BG.sph(0.16, 10, 8); body.scale(1, 1.05, 0.9); body.translate(0, 0.16, 0); B.add(body, s);
      const head = BG.sph(0.1, 10, 8); head.translate(0, 0.38, 0.01); B.add(head, s);
      const cap = BG.cone(0.08, 0.12, 8); cap.rotateX(-0.5); cap.translate(0, 0.49, -0.03); B.add(cap, '#5a5654');
      const rod = BG.cyl(0.008, 0.012, 0.7, 4); rod.rotateZ(-0.7); rod.translate(0.2, 0.42, 0.06); B.add(rod, '#6a5440');
      const tai = BG.sph(0.07, 8, 6); tai.scale(1.2, 0.7, 0.4); tai.translate(-0.1, 0.16, 0.14); B.add(tai, '#c8504a');
    });
    B.light([0.3, 0.86, 0.4], { color: '#9ff0e8', intensity: 1.2, radius: 3.5, flicker: 0.2, nightOnly: false });
  }, 0.02));
}
/** an empty giant crab shell lying on the sand (a heikegani's moult: the scowling samurai face on its back), two claws */
function crabHusk(seed = 0) {
  return cached('husk:' + seed, () => kitPiece(seed * 7 + 5, B => {
    const sh = BG.sph(0.62, 18, 10, 0, TAU, 0, PI / 2); sh.scale(1.25, 0.55, 1.0);
    B.add(sh, (p, n, o) => {
      o.set('#b8584a').lerp(cc('#e8a888'), clamp(n.y * 0.5)).multiplyScalar(0.8 + 0.2 * clamp(n.y + 0.3));
      const fx = p.x / 0.78, fz = p.z / 0.62; // the face pattern: brow ridges, deep eye pits, a grimace
      if (Math.abs(fz + 0.1 - Math.abs(fx) * 0.35) < 0.07 && Math.abs(fx) < 0.6) o.multiplyScalar(0.6);
      if (Math.hypot(Math.abs(fx) - 0.32, fz - 0.05) < 0.12) o.multiplyScalar(0.5);
      if (Math.abs(fz - 0.42 + Math.cos(fx * 4) * 0.06) < 0.04 && Math.abs(fx) < 0.36) o.multiplyScalar(0.55);
      if (nz(p.x * 12, p.z * 12) > 0.55) o.lerp(cc('#efe6d6'), 0.5);
    });
    B.at([0, 0, 0], 0, () => { for (const sx of [-1, 1]) { for (let k = 0; k < 3; k++) { const a = sx * (0.5 + k * 0.3), l = BG.cyl(0.04, 0.03, 0.5, 5); l.rotateZ(PI / 2 - 0.25); l.rotateY(a); l.translate(Math.cos(a) * 0.62 * sx, 0.06, -Math.sin(a) * 0.5); B.add(l, '#a8483c'); } } });
    for (const [x, z, ry] of [[1.05, 0.6, 0.6], [-0.9, 0.9, -0.9]]) {
      const cl = BG.sph(0.2, 10, 8); cl.scale(1.5, 0.7, 0.8); cl.rotateY(ry); cl.translate(x, 0.12, z); B.add(cl, (p, n, o) => o.set('#c4604e').lerp(cc('#3a1c1c'), clamp((Math.abs(p.x - x) - 0.15) * 3)));
      const pin = BG.cone(0.07, 0.26, 6); pin.rotateZ(-PI / 2); pin.rotateY(ry); pin.translate(x + Math.cos(ry) * 0.32, 0.12, z - Math.sin(ry) * 0.32); B.add(pin, '#3a1c1c');
    }
  }, 0.01));
}
/** a weathered brazier on three stones (the fishermen's warm fire) */
function brazier(seed = 0) {
  return cached('brazier:' + seed, () => kitPiece(seed * 3 + 1, B => {
    for (let k = 0; k < 3; k++) { const a = k / 3 * TAU; B.add(paintCave(lump(V(Math.cos(a) * 0.3, 0.06, Math.sin(a) * 0.3), 0.15, { detail: 1, noise: 0.3, squash: 0.7, seed: k + seed }), { wetTo: 0.05 }), null); }
    const bowl = BG.lathe([[0.001, 0.0], [0.3, 0.02], [0.4, 0.2], [0.37, 0.22], [0.27, 0.06], [0.001, 0.06]], 12); bowl.translate(0, 0.16, 0); B.add(bowl, '#3a3434');
    for (let k = 0; k < 5; k++) { const a = k / 5 * TAU, l = BG.cyl(0.04, 0.04, 0.42, 5); l.rotateZ(PI / 2); l.rotateY(a); l.translate(Math.cos(a) * 0.08, 0.3 + (k % 2) * 0.04, Math.sin(a) * 0.08); B.add(l, '#d4cab8'); }
    const coals = BG.sph(0.26, 10, 6, 0, TAU, 0, PI / 2); coals.scale(1, 0.4, 1); coals.translate(0, 0.27, 0); B.glow(coals, '#ff7a2a', { tint: 1, flicker: 0.8, hot: true });
    B.light([0, 0.7, 0], { color: '#ffa04a', intensity: 3, radius: 6, flicker: 0.9, nightOnly: false });
  }, 0.01));
}
/** wedded rocks: two barnacled basalt stacks tied together by a great rope with paper streamers (local x span) */
function weddedPair(seed = 0) {
  return cached('wed:' + seed, () => kitPiece(seed * 11 + 2, B => {
    const stack = (x, H, R, sd) => { let y = 0; for (let k = 0; k < 3; k++) { const r = R * (1 - k * 0.2), sq = 0.9 + k * 0.15; B.add(paintCave(lump(V(x + (k % 2 ? 0.05 : -0.04), y + r * sq * 0.8, 0), r, { detail: 2, noise: 0.28, squash: sq, seed: sd + k }), { wetTo: 0.5, seed: sd, barn: 0.9 }), null); y += r * sq * (H / (R * 2.9)); } return y; };
    const ha = stack(-1.2, 2.6, 0.8, seed * 3 + 1), hb = stack(1.15, 2.0, 0.65, seed * 3 + 5);
    const p0 = V(-0.62, ha * 0.86, 0.1), p1 = V(0.62, hb * 0.84, 0.15), pts = [];
    for (let k = 0; k <= 14; k++) { const t = k / 14; pts.push({ p: p0.clone().lerp(p1, t).add(V(0, -Math.sin(t * PI) * 0.36, 0)), r: 0.07 * (0.8 + Math.sin(t * PI) * 0.4) }); }
    B.add(tube(pts, 7, false), (p, n, o) => o.set('#e4d098').multiplyScalar(0.84 + 0.16 * Math.sin(p.x * 30 + p.y * 20)));
    for (let k = 1; k < 5; k++) {
      const t = k / 5, q = p0.clone().lerp(p1, t).add(V(0, -Math.sin(t * PI) * 0.36 - 0.07, 0));
      for (let j = 0; j < 3; j++) { const gg = BG.plane(0.08, 0.11, 1, 1); gg.translate(q.x + (j % 2 ? 0.025 : -0.025), q.y - 0.06 - j * 0.1, q.z + 0.08); B.cloth(gg, '#ffffff', { x0: q.x - 0.05, x1: q.x + 0.05, yTop: q.y, yBot: q.y - 0.36 }); }
    }
  }, 0.01));
}
/** a sea stack worn by the tide: a tall leaning column of basalt with a waist cut by the waves, a shoulder rock at its
 *  foot, barnacles and weed up to the high-water mark */
function cavePillar(seed = 0) {
  return cached('pillar:' + seed, () => {
    const r = mulberry32(seed * 41 + 5), H = 2.4 + r() * 0.6, lean = (r() - 0.5) * 0.3;
    const g0 = new THREE.CylinderGeometry(1, 1, 1, 14, 16, false); g0.translate(0, 0.5, 0);
    const p = g0.attributes.position, ph = r() * TAU;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i), a = Math.atan2(p.getZ(i), p.getX(i)), rr = Math.hypot(p.getX(i), p.getZ(i));
      const prof = 0.78 - 0.2 * Math.exp(-(((y - 0.3) / 0.13) ** 2)) - 0.18 * y + 0.06 * Math.sin(y * 9 + ph) + (y > 0.94 ? -(y - 0.94) * 4 : 0);
      const k = prof * (1 + 0.14 * nz(Math.cos(a) * 1.4 + seed, Math.sin(a) * 1.4 + y * 2.4) + 0.07 * Math.sin(a * 3 + ph)) * (rr > 0 ? 1 : 0) * (y > 0.999 ? rr : 1);
      p.setXYZ(i, Math.cos(a) * k * 0.75 + lean * y * y * H, y * H + (y > 0.999 ? 0.12 * (1 - rr * rr) : 0), Math.sin(a) * k * 0.75);
    }
    g0.deleteAttribute('uv'); const ng = g0.toNonIndexed(); ng.computeVertexNormals(); g0.dispose();
    const parts = [ng, lump(V(0.55, 0.18, 0.3), 0.5, { detail: 2, noise: 0.3, squash: 0.6, seed: seed * 3 + 1 }), lump(V(-0.4, 0.12, -0.45), 0.36, { detail: 1, noise: 0.35, squash: 0.6, seed: seed * 3 + 2 })];
    return barnacled(paintCave(merge(parts), { wetTo: 0.9, seed, barn: 0.9 }), seed, 30, 1.0);
  });
}
/** a lattice of salvaged planks laid on the sand (the arrival's landing; local x along the boards) */
function planks(seed = 0) {
  return cached('planks:' + seed, () => kitPiece(seed + 21, B => {
    for (let i = 0; i < 6; i++) { const b = BG.box(1.7 + B.wob(0.2), 0.05, 0.24, 0.012); b.rotateY(B.wob(0.06)); b.translate(B.wob(0.1), 0.025, (i - 2.5) * 0.27); B.add(b, B.pick(['#a89a86', '#b8aa94', '#9a8c7a', '#c4b8a4'])); }
    for (const x of [-0.6, 0.6]) { const s = BG.box(0.08, 0.04, 1.7, 0.01); s.translate(x, 0.01, 0); B.add(s, '#6e6052'); }
  }, 0.01));
}

// ------------------------------------------------------------------ the wall kit
const floatCols = ['#8fd0ff', '#8fe0c0', '#ffc070', '#a8e8ff'];
function kelpCurtain(W, s) { // brown-olive kelp fronds and pale strands dangling from the brow's nose, a weed fringe
  const q = W.krng, WD = W.wallDeco;
  for (let i = 0, n = 5 + Math.floor(q() * 4); i < n; i++) {
    const o = (i / (n - 1) - 0.5) * 1.8 + (q() - 0.5) * 0.2, bx = s.x + s.tx * o, bz = s.z + s.tz * o, len = 0.7 + q() * 1.2, w0 = 0.07 + q() * 0.05, sw = (q() - 0.5) * 0.3;
    const at = (off, y) => V(bx - s.nx * off + s.tx * sw * (1 - y / s.h), y, bz - s.nz * off + s.tz * sw * (1 - y / s.h));
    const top = s.h * 0.9, pts = [];
    for (let k = 0; k <= 6; k++) { const t = k / 6; pts.push({ p: at(0.6 + Math.sin(t * 3 + i) * 0.06, top - len * t), w: w0 * (1 - t * 0.6) * (0.8 + 0.4 * Math.sin(t * 7 + i)) }); }
    const side = V(s.tx, 0, s.tz), fr = ribbon(pts, side), c0 = cc(['#3a3a1a', '#4a4620', '#2e3618'][i % 3]), c1 = cc(['#8a7e3a', '#a09040', '#6e7a34'][i % 3]);
    WD.addGeo(fr, bx, bz, null, (x, y, z, nx, ny, nz2, oc) => oc.copy(c0).lerp(c1, clamp((top - y) / len)));
    const back = fr.clone(); back.index.array.reverse(); WD.addGeo(back, bx, bz, null, (x, y, z, nx, ny, nz2, oc) => oc.copy(c0).lerp(c1, clamp((top - y) / len)).multiplyScalar(0.8));
  }
  for (let k = 0, m = 6 + Math.floor(q() * 4); k < m; k++) { const o = (k / (m - 1) - 0.5) * 1.9, len = 0.2 + q() * 0.4; WD.add(SH.sphLo(), M(s.x + s.tx * o - s.nx * 0.58, s.h * 0.9 - len * 0.4, s.z + s.tz * o - s.nz * 0.58, 0.1 + q() * 0.05, len * 0.6, 0.07, 0, Math.atan2(-s.nx, -s.nz), 0), null, grad('#2e3216', '#5e5a28')); }
  W.kitState.drips.push({ x: s.x - s.nx * 0.65, y: s.h * 0.86, z: s.z - s.nz * 0.65, t: q() * 3 });
}
function floatNiche(W, s, addLight) { // a sea-worn hollow in the rock with a glass float glowing in it, shells for an offering
  const q = W.krng, WD = W.wallDeco, y = Math.min(1.25, s.h * 0.42), face = Math.atan2(-s.nx, -s.nz), cx = s.x - s.nx * 0.02, cz = s.z - s.nz * 0.02;
  WD.add(SH.disc(), M(cx, y + 0.34, cz, 0.42, 0.03, 0.52, PI / 2, face, 0), col('#151c20'));
  for (let k = 0; k < 7; k++) { const a = PI * (k / 6), ox = Math.cos(a) * 0.48, oy = Math.sin(a) * 0.58; WD.add(SH.rock(), M(cx + s.tx * ox - s.nx * 0.05, y + 0.34 + oy * 0.95, cz + s.tz * ox - s.nz * 0.05, 0.11, 0.09, 0.08, q(), q() * TAU, q()), null, grad('#3e464c', '#68727a', 1, 1.2, -0.1)); }
  WD.add(SH.box(), M(cx - s.nx * 0.16, y - 0.06, cz - s.nz * 0.16, 0.7, 0.08, 0.36, 0, face, 0), null, grad('#4a5258', '#7a8488'));
  const fc = floatCols[Math.floor(q() * 4)];
  W.wallGlow.add(SH.sph(), M(cx - s.nx * 0.2, y + 0.16, cz - s.nz * 0.2, 0.16, 0.16, 0.16), col(fc === '#ffc070' ? '#ffb45a' : fc));
  WD.add(SH.hoop(), M(cx - s.nx * 0.2, y + 0.16, cz - s.nz * 0.2, 0.165, 0.165, 0.165), col('#a88a58'));
  WD.add(SH.hoop(), M(cx - s.nx * 0.2, y + 0.16, cz - s.nz * 0.2, 0.165, 0.165, 0.165, PI / 2, face, 0), col('#a88a58'));
  for (let k = 0; k < 3; k++) life(WD, LIFE.shell(k), cx - s.nx * 0.18 + s.tx * (k - 1) * 0.2, y - 0.02, cz - s.nz * 0.18 + s.tz * (k - 1) * 0.2, q() * TAU, 1.2);
  const hc = fc === '#ffc070' ? P.lantern : '#9ff0e8';
  W.halos.add(cx - s.nx * 0.4, y + 0.22, cz - s.nz * 0.4, 1.4, hc, 0.5, 1);
  addLight(cx - s.nx * 0.8, y + 0.5, cz - s.nz * 0.8, hc, 3.5, 5, 0.4);
}
function seep(W, s) { // a trickle down the face into a little glowing pool at its foot, and the odd drip
  const q = W.krng, WG = W.wallGlow, top = s.h * 0.62, x = s.x - s.nx * 0.17, z = s.z - s.nz * 0.17, face = Math.atan2(-s.nx, -s.nz);
  for (let k = 0; k < 2; k++) WG.add(SH.box(), M(x + s.tx * (k - 0.5) * 0.08, 0.02, z + s.tz * (k - 0.5) * 0.08, 0.035 - k * 0.012, top, 0.012, 0, face, 0), null, (px, py, pz, nx, ny, nz2, o) => o.copy(col('#3a9a92')).lerp(col('#c8fff4'), 0.25 + 0.3 * Math.sin(py * 13 + k * 2)));
  W.floorGlows.add(x - s.nx * 0.5, 0.05, z - s.nz * 0.5, 0.8, '#7ff0e0', 0.3, 1);
  for (let k = 0; k < 4; k++) W.wallDeco.add(SH.rock(), M(x - s.nx * (0.35 + q() * 0.4) + s.tx * (q() - 0.5) * 0.8, 0.03, z - s.nz * (0.35 + q() * 0.4) + s.tz * (q() - 0.5) * 0.8, 0.08 + q() * 0.08, 0.05, 0.08, q(), q() * TAU, 0), null, grad('#2c3438', '#5a6468'));
  W.kitState.drips.push({ x, y: top, z, t: q() * 3 });
}
function netOnFace(W, S, i, n) { // an old fishing net hung on two pegs across a straight stretch of the face, floats in it
  const a = S[i], b = S[Math.min(n - 1, i + 6)]; if (!b || Math.abs(a.h - b.h) > 0.5) return false;
  const L = Math.hypot(b.x - a.x, b.z - a.z); if (L < 1.6 || L > 3.4) return false;
  const mx = (a.x + b.x) / 2 - (a.nx + b.nx) * 0.12, mz = (a.z + b.z) / 2 - (a.nz + b.nz) * 0.12, y = Math.min(a.h, b.h) * 0.62;
  const tx = (b.x - a.x) / L, tz = (b.z - a.z) / L, rot = Math.atan2(tx, tz) - PI / 2, nx = -tz, nz2 = tx;
  const facing = (nx * -a.nx + nz2 * -a.nz) > 0 ? rot : rot + PI;
  const k = Math.round(L * 2) / 2, seed = Math.floor(W.krng() * 3);
  const pc = cached(`netface:${k}:${seed}`, () => kitPiece(seed * 5 + 7, B => {
    net(B, { w: k * 0.9, h: 1.05, yTop: 0, color: '#b8a888' });
    for (const sx of [-1, 1]) { const p = BG.cyl(0.035, 0.03, 0.24, 6); p.rotateX(PI / 2); p.translate(sx * k * 0.45, 0.02, -0.04); B.add(p, '#5e4a3a'); }
    for (let f = 0; f < 3; f++) { const fl = BG.sph(0.075, 8, 6); fl.translate((f - 1) * k * 0.25, -0.5 - (f % 2) * 0.2, 0.06); B.glow(fl, floatCols[(f + seed) % 4], { tint: 0.6 }); }
  }, 0.01));
  addPiece(W, pc, mx, mz, facing, { y, wall: true, mul: 0.8 });
  return true;
}
function anemoneLedge(W, s) { // a little shelf of rock jutting from the face at the foot, crowded with anemones and a starfish
  const q = W.krng, WD = W.wallDeco, x = s.x - s.nx * 0.3, z = s.z - s.nz * 0.3, face = Math.atan2(-s.nx, -s.nz);
  WD.add(SH.rock(), M(x, 0.22, z, 0.7, 0.24, 0.42, 0.05, face, 0), null, grad('#2a3236', '#5a646a', 1, 1.1, 0));
  for (let k = 0; k < 5; k++) { const o = (q() - 0.5) * 1.1; life(WD, LIFE.anem(Math.floor(q() * 4)), x + s.tx * o - s.nx * (q() - 0.3) * 0.25, 0.38, z + s.tz * o - s.nz * (q() - 0.3) * 0.25, q() * TAU, 1.3 + q() * 0.6, 0.9); }
  life(WD, LIFE.star(Math.floor(q() * 3)), x - s.nx * 0.3, 0.12, z - s.nz * 0.3, q() * TAU, 1.3, 0.85, [0.9, 0]);
  for (let k = 0; k < 3; k++) life(W.clutter, LIFE.urch(k % 2), x - s.nx * (0.5 + q() * 0.3) + s.tx * (q() - 0.5) * 1.2, 0, z - s.nz * (0.5 + q() * 0.3) + s.tz * (q() - 0.5) * 1.2, q() * TAU, 1.1);
}
function dressWalls(W, addLight) {
  const r = W.rng, WD = W.wallDeco, CL = W.clutter;
  for (const { S, len, seed } of W.wallSamples) {
    const n = S.length; let lastSeg = -1;
    for (let i = 0; i < n; i++) { // set pieces on the camera-facing runs, one per ~5.5 m
      const s = S[i], seg = Math.floor(s.u / 5.5);
      if (seg === lastSeg || s.u > len - 2 || s.f < 0.3 || s.h < 1.8) continue;
      if (W.L.arena && Math.hypot(s.x - W.L.arena.x, s.z - W.L.arena.z) < W.L.arena.r + 1.5) continue; // (the arena dresses its own rim)
      lastSeg = seg;
      const hsh = mulberry32(seg * 7919 + seed * 104729)();
      if (hsh < 0.3) kelpCurtain(W, s);
      else if (hsh < 0.44) floatNiche(W, s, addLight);
      else if (hsh < 0.56) seep(W, s);
      else if (hsh < 0.68) { if (!netOnFace(W, S, i, n)) kelpCurtain(W, s); }
      else if (hsh < 0.84) anemoneLedge(W, s);
    }
    for (let i = 0; i < n; i++) { // the wall foot: anemones, urchins, starfish, shells, kelp, barnacled stones, pebbles
      const s = S[i]; if (r() > 0.26) continue;
      const far = s.f > 0.15, k = r(), fx = s.x - s.nx * 0.45, fz = s.z - s.nz * 0.45;
      if (!W.walkable(fx, fz) || W.keepClear(fx, fz) || inStream(W, fx, fz)) continue;
      if (far && k < 0.16) for (let j = 0; j < 3; j++) life(CL, LIFE.anem(Math.floor(r() * 4)), fx + s.tx * (j - 1) * 0.3 + (r() - 0.5) * 0.15, 0, fz + s.tz * (j - 1) * 0.3 + (r() - 0.5) * 0.15, r() * TAU, 1.2 + r() * 0.6, 0.9);
      else if (k < 0.27) for (let j = 0, m = 1 + Math.floor(r() * 3); j < m; j++) life(CL, LIFE.urch(j % 2), fx + (r() - 0.5) * 0.6, 0, fz + (r() - 0.5) * 0.6, r() * TAU, 1 + r() * 0.4);
      else if (k < 0.37) life(CL, LIFE.star(Math.floor(r() * 3)), fx, 0.01, fz, r() * TAU, 1.2 + r() * 0.5);
      else if (k < 0.5) for (let j = 0; j < 3; j++) life(CL, LIFE.shell(Math.floor(r() * 4)), fx + (r() - 0.5) * 0.7, 0.005, fz + (r() - 0.5) * 0.7, r() * TAU, 1.2 + r() * 0.6, 0.85);
      else if (far && k < 0.62) life(CL, LIFE.kelp(Math.floor(r() * 3)), fx + s.nx * 0.1, 0, fz + s.nz * 0.1, r() * TAU, 0.9 + r() * 0.5, 0.85);
      else if (k < 0.74) life(W.solid, caveRock(Math.floor(r() * 4), 0.3, 0.6, false), fx + s.nx * 0.1, -0.04, fz + s.nz * 0.1, r() * TAU, 0.7 + r() * 0.6, 0.9);
      else if (k < 0.8) life(CL, LIFE.peb(Math.floor(r() * 2)), fx, 0, fz, r() * TAU, 0.8 + r() * 0.5, 0.75);
      else if (k < 0.86) crab(W, fx - s.nx * 0.2, fz - s.nz * 0.2, r() * TAU, r);
    }
  }
  dressTops(W);
}
// above the brow: kelp draping over its nose, weed mounds, barnacled boulders, the odd shell and starfish; nothing tall
// further back, where the rock heaves up into the dark
function dressTops(W) {
  const r = mulberry32(W.L.floor * 9173 + 5), WD = W.wallDeco;
  let drapes = 0, n = 0;
  for (const { S } of W.wallSamples) {
    let next = r() * 2.6;
    for (const s of S) {
      if (s.u < next) continue;
      const sp = topSpan(s); if (!sp) continue;
      next = s.u + 1.5 + r() * 1.6;
      const far = s.f > 0.15, k = r(), o = sp.o0 + 0.08 + r() * 0.45, y = sp.yAt(o);
      const x = s.x + s.nx * o + s.tx * (r() - 0.5) * 0.6, z = s.z + s.nz * o + s.tz * (r() - 0.5) * 0.6;
      if (far && k < 0.2 && drapes < 40) { drapes++; drape(W, s, r); }
      else if (k < 0.42) WD.add(SH.hemiLo(), M(x, y - 0.06, z, 0.3 + r() * 0.3, 0.14 + r() * 0.08, 0.26 + r() * 0.24, 0, r() * TAU, 0), null, (px, py, pz, nx, ny, nz2, oc) => oc.copy(col('#2a3018')).lerp(col(r() < 0.3 ? '#5a8a3e' : '#5e5a2a'), clamp(ny * 0.8)));
      else if (k < 0.6) life(WD, caveRock(4 + Math.floor(r() * 3), 0.3, 0.55, false), x, y - 0.06, z, r() * TAU, 0.8 + r() * 0.8, 0.8);
      else if (k < 0.7) life(WD, LIFE.shell(Math.floor(r() * 4)), x, y + 0.01, z, r() * TAU, 1.4, 0.8);
      else if (k < 0.76) life(WD, LIFE.star(Math.floor(r() * 3)), x, y + 0.02, z, r() * TAU, 1.3, 0.8);
      n++;
    }
  }
  W.topCount = { drapes, n };
}
function drape(W, s, q) { // kelp draped over the brow's nose, hanging down in front of the face
  const WD = W.wallDeco;
  for (let i = 0, m = 2 + Math.floor(q() * 2); i < m; i++) {
    const o = (q() - 0.5) * 1.4, bx = s.x + s.tx * o, bz = s.z + s.tz * o, len = 0.5 + q() * 0.9, w0 = 0.08 + q() * 0.05;
    const at = (off, y) => V(bx - s.nx * off, y, bz - s.nz * off);
    const pts = [{ p: at(-0.1, s.h * 1.1), w: w0 }, { p: at(0.35, s.h * 1.08), w: w0 }, { p: at(0.62, s.h * 0.99), w: w0 * 0.95 }, { p: at(0.66, s.h * 0.9), w: w0 * 0.9 }, { p: at(0.65, s.h * 0.9 - len * 0.5), w: w0 * 0.7 }, { p: at(0.63, s.h * 0.9 - len), w: w0 * 0.25 }];
    const fr = ribbon(pts, V(s.tx, 0, s.tz)), c0 = cc('#3a3a1a'), c1 = cc('#8a7e3a');
    WD.addGeo(fr, bx, bz, null, (x, y, z, nx, ny, nz2, oc) => oc.copy(c0).lerp(c1, clamp(0.3 + nx * 0 + (s.h - y) * 0.4)));
    const back = fr.clone(); back.index.array.reverse(); WD.addGeo(back, bx, bz, null, (x, y, z, nx, ny, nz2, oc) => oc.copy(c0).lerp(c1, 0.2));
  }
}

// ------------------------------------------------------------------ floor props, room lights, centrepieces
function buildProps(W) {
  const r = W.rng, CL = W.clutter;
  for (const p of W.L.props) {
    const wp = W.cellToWorld(p.x, p.y), wl = Math.hypot(p.wx, p.wy) || 1, dx = p.wx / wl, dz = p.wy / wl;
    const hug = p.kind === 'floor' ? 0 : p.kind === 'corner' ? 0.45 : 0.4;
    const x = wp.x + dx * hug * CELL * 0.5 + (r() - 0.5) * (p.kind === 'floor' ? 1.0 : 0.6), z = wp.z + dz * hug * CELL * 0.5 + (r() - 0.5) * (p.kind === 'floor' ? 1.0 : 0.6);
    if (inStream(W, x, z, 0.2)) continue;
    const k = p.r, collide = rad => W.collision.addCircle(x, z, rad);
    if (p.kind === 'corner') {
      if (k < 0.34) { life(W.solid, caveRock(Math.floor(r() * 4), 0.6, 0.62), x, -0.05, z, r() * TAU, (p.big ? 0.95 : 0.7) + r() * 0.3, 0.9); for (let i = 0; i < 2; i++) life(CL, LIFE.anem(Math.floor(r() * 4)), x + (r() - 0.5) * 1.2, 0, z + (r() - 0.5) * 1.2, r() * TAU, 1.3); if (p.big) collide(0.5); }
      else if (k < 0.55) { life(W.solid, LIFE.drift(Math.floor(r() * 3)), x, -0.03, z, r() * TAU, 0.8 + r() * 0.3, 0.8); for (let i = 0; i < 3; i++) life(CL, LIFE.shell(Math.floor(r() * 4)), x + (r() - 0.5) * 1.2, 0.005, z + (r() - 0.5) * 1.2, r() * TAU, 1.3); if (p.big) collide(0.45); }
      else if (k < 0.72) { for (let i = 0; i < 3; i++) life(W.solid, LIFE.coral(Math.floor(r() * 4)), x + (r() - 0.5) * 0.6, 0, z + (r() - 0.5) * 0.6, r() * TAU, 1.6 + r() * 0.8, 0.9); life(CL, LIFE.star(Math.floor(r() * 3)), x + 0.4, 0.01, z - 0.3, r() * TAU, 1.3); }
      else if (k < 0.86) { life(CL, LIFE.kelp(Math.floor(r() * 3)), x, 0, z, r() * TAU, 1.1 + r() * 0.5, 0.85); life(CL, LIFE.kelp(Math.floor(r() * 3)), x + 0.35, 0, z - 0.25, r() * TAU, 0.8, 0.85); life(CL, LIFE.urch(0), x - 0.3, 0, z + 0.3, r() * TAU, 1.2); }
      else { for (let i = 0; i < 3; i++) life(CL, LIFE.peb(i % 2), x + (r() - 0.5) * 0.8, 0, z + (r() - 0.5) * 0.8, r() * TAU, 1); life(CL, LIFE.shell(Math.floor(r() * 4)), x, 0.005, z, r() * TAU, 1.4); }
    } else if (p.kind === 'edge') {
      if (k < 0.2) for (let i = 0; i < 2; i++) life(CL, LIFE.anem(Math.floor(r() * 4)), x + (r() - 0.5) * 0.5, 0, z + (r() - 0.5) * 0.5, r() * TAU, 1.2 + r() * 0.5, 0.9);
      else if (k < 0.36) life(CL, LIFE.shell(Math.floor(r() * 4)), x, 0.005, z, r() * TAU, 1.3 + r() * 0.5, 0.85);
      else if (k < 0.48) life(CL, LIFE.star(Math.floor(r() * 3)), x, 0.01, z, r() * TAU, 1.2 + r() * 0.4);
      else if (k < 0.6) life(CL, LIFE.urch(Math.floor(r() * 2)), x, 0, z, r() * TAU, 1.1 + r() * 0.3);
      else if (k < 0.7 && p.big) { life(W.solid, caveRock(Math.floor(r() * 4), 0.45, 0.6), x, -0.06, z, r() * TAU, 0.8 + r() * 0.3, 0.9); collide(0.35); }
      else if (k < 0.8) life(CL, LIFE.kelp(Math.floor(r() * 3)), x, 0, z, r() * TAU, 0.8 + r() * 0.4, 0.85);
      else if (k < 0.9) life(CL, LIFE.peb(Math.floor(r() * 2)), x, 0, z, r() * TAU, 0.9);
      else life(CL, LIFE.coral(Math.floor(r() * 4)), x, 0, z, r() * TAU, 1.5, 0.9);
    } else {
      if (k < 0.45) life(CL, LIFE.shell(Math.floor(r() * 4)), x, 0.005, z, r() * TAU, 1.2 + r() * 0.5, 0.85);
      else if (k < 0.7) life(CL, LIFE.peb(Math.floor(r() * 2)), x, 0, z, r() * TAU, 0.8 + r() * 0.4, 0.75);
      else if (k < 0.85) life(CL, LIFE.star(Math.floor(r() * 3)), x, 0.01, z, r() * TAU, 1.1);
    }
  }
}
function buildLights(W) { // every room light is a glass float lantern on a driftwood post standing off the wall
  const at = W.L.at, T = W.theme;
  for (const l of W.L.lights) {
    const wp = W.cellToWorld(l.x, l.y);
    let dx = (at(l.x + 1, l.y) ? 0 : 1) - (at(l.x - 1, l.y) ? 0 : 1), dz = (at(l.x, l.y + 1) ? 0 : 1) - (at(l.x, l.y - 1) ? 0 : 1);
    const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
    const x = wp.x + dx * 0.35, z = wp.z + dz * 0.35, face = Math.atan2(-dx, -dz);
    if (inStream(W, x, z, 0.2)) continue;
    addPiece(W, floatLantern(Math.floor(W.rng() * 4), 1.55), x, z, face, { lights: false, mul: 0.8 });
    const fx = x - dx * 0.46, fz = z - dz * 0.46, fy = 1.55 - 0.44;
    W.halos.add(fx, fy, fz, 1.2, T.light, 0.42, 1);
    W.floorGlows.add(x - dx * 1.0, 0.04, z - dz * 1.0, 2.3, '#ffa858', 0.22, 1); // (the warm pool on the floor)
    W.lightPool.addSource({ pos: V(x - dx * 1.5, 1.3, z - dz * 1.5), color: col(T.light).clone(), intensity: (T.lightI ?? 9) * 0.8, radius: 10, flicker: 0.8 });
    W.collision.addCircle(x, z, 0.3);
  }
}
function buildCenterpieces(W) {
  const r = W.rng, CL = W.clutter;
  for (const c of W.L.centers || []) {
    const p = W.cellToWorld(c.x, c.y);
    if (c.r < 0.34) { // a glowing tide pool (painted by decoMap) ringed with barnacled stones, the giant clam in it
      poolLife(W, { x: p.x, z: p.z, r: 2.0 }, r, true);
      bake(W, CLAM(1), p.x + 0.3, -0.12, p.z - 0.2, r() * TAU, 1.0);
      W.collision.addCircle(p.x + 0.3, p.z - 0.2, 0.55);
    } else if (c.r < 0.67) { // a barnacled sea stack in a skirt of kelp, a rope round it hung with shide
      life(W.solid, cavePillar(Math.floor(r() * 3)), p.x, -0.05, p.z, r() * TAU, 1.1, 0.9);
      const rope = []; for (let k = 0; k <= 24; k++) { const a = k / 24 * TAU; rope.push({ p: V(p.x + Math.cos(a) * 0.86, 0.95 + Math.sin(a * 2) * 0.04, p.z + Math.sin(a) * 0.86), r: 0.035 }); }
      W.solid.addGeo(tube(rope, 5, false), p.x, p.z, null, (px, py, pz, nx, ny, nz2, o) => o.set('#e4d098').multiplyScalar(0.84 + 0.16 * Math.sin(Math.atan2(pz - p.z, px - p.x) * 40)));
      for (let i = 0; i < 7; i++) { const a = i / 7 * TAU + r() * 0.4, d = 1.15 + r() * 0.4; life(CL, LIFE.kelp(i % 3), p.x + Math.cos(a) * d, 0, p.z + Math.sin(a) * d, r() * TAU, 1.1 + r() * 0.5, 0.85); }
      for (let i = 0; i < 3; i++) { const a = r() * TAU; life(CL, LIFE.star(i % 3), p.x + Math.cos(a) * 0.95, 0.4 + r() * 0.5, p.z + Math.sin(a) * 0.95, a, 1.4, 0.85, [1.2, 0]); }
      W.collision.addCircle(p.x, p.z, 0.95);
    } else { // a little Ebisu shrine with a red sea torii before it and two float lanterns
      addPiece(W, umiHokora(Math.floor(r() * 2)), p.x, p.z - 0.6, 0, { mul: 0.85 });
      addPiece(W, Pr.torii(5, { w: 1.7, h: 2.0 }), p.x, p.z + 1.4, 0, { mul: 0.9 });
      for (const s2 of [-1, 1]) addPiece(W, floatLantern(2 + (s2 > 0 ? 1 : 0), 1.2), p.x + s2 * 1.5, p.z + 0.4, s2 > 0 ? -PI / 2 : PI / 2, { mul: 0.8, lightK: 0.6 });
      W.collision.addCircle(p.x, p.z - 0.6, 0.85); for (const s2 of [-1, 1]) { W.collision.addCircle(p.x + s2 * 0.85, p.z + 1.4, 0.18); W.collision.addCircle(p.x + s2 * 1.5, p.z + 0.4, 0.22); }
    }
  }
}
/** a pool's rim of barnacled stones (the wall-side half, or all round), anemones, urchins and starfish in it, a light */
function poolLife(W, pl, r, round = false) {
  const CL = W.clutter, R = pl.r, face = pl.face ?? 0;
  if (round) life(W.solid, rimRocks(Math.floor(r() * 4), R, 0.5), pl.x, -0.03, pl.z, CAM, 1, 0.9); // (local +z: the open side)
  else life(W.solid, rimRocks(4 + Math.floor(r() * 3), R, 1.2), pl.x, -0.03, pl.z, face, 1, 0.9);
  for (let k = 0, n = Math.round(R * 3); k < n; k++) { const a = r() * TAU, d = Math.sqrt(r()) * R * 0.75; life(CL, LIFE.anem(k % 4), pl.x + Math.cos(a) * d, -0.06, pl.z + Math.sin(a) * d, r() * TAU, 1.2 + r() * 0.5, 0.95); }
  for (let k = 0, n = Math.round(R * 1.5); k < n; k++) { const a = r() * TAU, d = Math.sqrt(r()) * R * 0.7; life(CL, LIFE.urch(k % 2), pl.x + Math.cos(a) * d, -0.06, pl.z + Math.sin(a) * d, r() * TAU, 1.1); }
  for (let k = 0; k < 2; k++) { const a = r() * TAU, d = R * 0.5 * r(); life(CL, LIFE.coral(k % 4), pl.x + Math.cos(a) * d, -0.06, pl.z + Math.sin(a) * d, r() * TAU, 1.3 + r() * 0.5, 0.95); }
  for (let k = 0; k < 2; k++) { const a = r() * TAU, d = R * (1.0 + r() * 0.1); life(CL, LIFE.star(k % 3), pl.x + Math.cos(a) * d, 0.18, pl.z + Math.sin(a) * d, r() * TAU, 1.3, 0.85, [0.3, 0.2]); }
  W.floorGlows.add(pl.x, 0.05, pl.z, R * 1.1, '#5ff0f0', 0.1, 1);
  W.lightPool.addSource({ pos: V(pl.x, 1.2, pl.z), color: col('#6ff0e8').clone(), intensity: 2.2, radius: 6, flicker: 0.15 });
  W.kitState.bubbles.push({ x: pl.x, z: pl.z, r: R * 0.7 });
}

// ------------------------------------------------------------------ the arena: Umibōzu's cove
/** the cove's sea: a direction away from the camera (the boss rises on the far side), never toward the way in */
function seaOf(W) {
  const ks = W.kitState; if (ks.sea !== undefined) return ks.sea;
  const L = W.L, ar = L.arena, mo = L.arenaMouth;
  if (!ar) return (ks.sea = null);
  const ma = mo ? Math.atan2(mo.z - ar.z, mo.x - ar.x) : null;
  let best = [-CAMX, -CAMZ], bs = -1e9;
  for (let k = 0; k < 72; k++) {
    const a = k / 72 * TAU, dx = Math.cos(a), dz = Math.sin(a);
    if (ma != null && Math.abs(angD(a, ma)) < 1.8) continue; // (the shore keeps well clear of the way in)
    const sc = -toCam(dx, dz);
    if (sc > bs + 1e-6) { bs = sc; best = [dx, dz]; }
  }
  return (ks.sea = { x: ar.x, z: ar.z, r: ar.r, sx: best[0], sz: best[1], e: 6.5 });
}
/** the sea is water nobody walks on: the world's walkable() ends at the shoreline; the boss's code reads the record */
function installSea(W, sea) {
  const base = Object.getPrototypeOf(W).walkable, R2 = (sea.r + 3) ** 2;
  const inSea = (x, z) => { const dx = x - sea.x, dz = z - sea.z; return dx * dx + dz * dz < R2 && dx * sea.sx + dz * sea.sz >= sea.e; };
  W.walkable = function (x, z) { return base.call(this, x, z) && !inSea(x, z); };
  W.waterAt = (x, z) => (inSea(x, z) ? 1 : 0);
  W.waterLevel = 0.04;
  W.L.arenaSea = [sea.sx, sea.sz];
  W.inSea = inSea;
}
function buildArena(W) {
  const A0 = W.arena, L = W.L, ar = L.arena, mouth = L.arenaMouth; if (!A0 || !ar) return;
  const sea = seaOf(W); installSea(W, sea);
  const q = W.krng, CL = W.clutter, HA = W.halos, { sx, sz, e } = sea, tx = -sz, tz = sx;
  const at = (al, la) => [ar.x + sx * al + tx * la, ar.z + sz * al + tz * la];
  const chord = al => Math.sqrt(Math.max(0, (ar.r - 0.6) ** 2 - al * al)); // half-width of the ring at depth al
  const ma = mouth ? Math.atan2(mouth.z - ar.z, mouth.x - ar.x) : PI / 4;
  W.arenaLanterns = [];
  // glass-float lanterns on driftwood posts round the beach: a gap at the mouth, none by the sea
  const n = 12;
  for (let i = 0; i < n; i++) {
    const a = ma + (i + 0.5) / n * TAU;
    if (Math.abs(angD(a, ma)) < 0.42) continue;
    const rr = ar.r - 1.7, x = ar.x + Math.cos(a) * rr, z = ar.z + Math.sin(a) * rr;
    if ((x - ar.x) * sx + (z - ar.z) * sz > e - 1.6 || !W.walkable(x, z)) continue;
    const face = Math.atan2(ar.x - x, ar.z - z);
    addPiece(W, floatLantern(i % 4, 1.75), x, z, face, { lights: false, mul: 0.8 });
    W.collision.addCircle(x, z, 0.3);
    const fx = x + Math.sin(face) * 0.46, fz = z + Math.cos(face) * 0.46;
    W.arenaLanterns.push(V(fx, 1.3, fz));
    HA.add(fx, 1.31, fz, 1.5, P.lantern, 0.5, 1);
    if (i % 2 === 0) W.lightPool.addSource({ pos: V(fx, 1.6, fz), color: col(P.lantern).clone(), intensity: 6.5, radius: 9, flicker: 0.7 });
    if (i % 3 === 1) { life(CL, LIFE.shell(i % 4), x + Math.cos(a) * 0.6, 0.005, z + Math.sin(a) * 0.6, i, 1.4); life(CL, LIFE.star(i % 3), x - Math.sin(a) * 0.7, 0.01, z + Math.cos(a) * 0.7, i * 2, 1.3); }
    // between the lanterns, against the rock: barnacled stones, anemones, kelp washed up
    const a2 = a + PI / n, bx = ar.x + Math.cos(a2) * (ar.r - 0.9), bz = ar.z + Math.sin(a2) * (ar.r - 0.9);
    if (W.walkable(bx, bz) && Math.abs(angD(a2, ma)) > 0.5 && (bx - ar.x) * sx + (bz - ar.z) * sz < e - 1.2) {
      life(W.solid, caveRock(i % 4, 0.55, 0.6), bx, -0.06, bz, i * 1.7, 0.9 + (i % 3) * 0.2, 0.9); W.collision.addCircle(bx, bz, 0.5);
      for (let j = 0; j < 3; j++) { const ja = a2 + (j - 1) * 0.06, jr = ar.r - 1.9 - (j % 2) * 0.4; life(CL, j === 1 ? LIFE.kelp(i % 3) : LIFE.anem((i + j) % 4), ar.x + Math.cos(ja) * jr, 0, ar.z + Math.sin(ja) * jr, i + j, 1.3, 0.92); }
    }
  }
  if (mouth) { // the driftwood gateway over the way in (its rope hung with floats), facing the corridor
    const gx = ar.x + Math.cos(ma) * (ar.r - 0.4), gz = ar.z + Math.sin(ma) * (ar.r - 0.4), yaw = Math.atan2(Math.cos(ma), Math.sin(ma));
    addPiece(W, GATE(8), gx, gz, yaw, { s: 1.15, mul: 0.82 });
    const px = -Math.sin(ma), pz = Math.cos(ma);
    for (const s of [-1, 1]) W.collision.addCircle(gx + px * s * 1.9, gz + pz * s * 1.9, 0.26);
    W.arenaGate = { x: gx, z: gz, yaw, w: 3.8 };
  }
  // the sea side: barnacled boulders where the shore meets the rock, kelp in the shallows, a sea stack, and the red sea
  // torii standing in the water off one end of the beach; the boss rises between them
  const side = mouth && Math.sin(angD(ma, Math.atan2(sz, sx))) > 0 ? -1 : 1; // (the torii goes to the end away from the mouth)
  for (const s of [-1, 1]) {
    for (let k = 0; k < 7; k++) {
      const al = e - 0.6 + k * 0.9 + q() * 0.4, la = s * (chord(al) - 0.3 - q() * 0.8), [x, z] = at(al, la);
      life(W.solid, caveRock(k % 4, 0.55 + q() * 0.35, 0.58), x, -0.08, z, q() * TAU, 0.9 + q() * 0.6, 0.9);
      if (k % 2 === 0) { const [kx, kz] = at(al + 0.5, la - s * 0.9); life(CL, LIFE.kelp(k % 3), kx, -0.05, kz, q() * TAU, 1.3 + q() * 0.6, 0.85); }
      if (k % 3 === 1) { const [ax, az] = at(al - 0.3, la - s * 0.6); for (let j = 0; j < 3; j++) life(CL, LIFE.anem(j + k), ax + (q() - 0.5) * 0.5, -0.04, az + (q() - 0.5) * 0.5, q() * TAU, 1.4, 0.95); }
    }
    const al = e + 3.4, la = s * (chord(al) - 2.4), [x, z] = at(al, la), face = Math.atan2(-sx, -sz);
    if (s === side) { addPiece(W, cached('seaTorii', () => TA.seaTorii(2)), x, z, face, { s: 0.85, y: -0.25, mul: 0.85, lightK: 0.5 }); W.halos.add(x, 1.4, z, 3.2, '#ffd8a0', 0.12); }
    else { life(W.solid, cavePillar(2), x, -0.2, z, q() * TAU, 1.45, 0.88); for (let j = 0; j < 5; j++) { const a = j / 5 * TAU; life(CL, LIFE.kelp(j % 3), x + Math.cos(a) * 1.3, -0.05, z + Math.sin(a) * 1.3, a, 1.4, 0.85); } }
  }
  // the beach's rim: its little rock pools (rims, anemones, a glow), driftwood washed up, glass floats strayed from a net
  for (const pl of W.kitState.arenaPools) {
    life(W.solid, rimRocks(5 + Math.floor(q() * 3), pl.r * 1.05, 0), pl.x, -0.03, pl.z, q() * TAU, 1, 0.9);
    for (let k = 0; k < 3; k++) { const a = q() * TAU, d = Math.sqrt(q()) * pl.r * 0.6; life(CL, LIFE.anem(k), pl.x + Math.cos(a) * d, -0.05, pl.z + Math.sin(a) * d, a, 1.3, 0.95); }
    life(CL, LIFE.star(Math.floor(q() * 3)), pl.x + pl.r * 1.1, 0.16, pl.z, q() * TAU, 1.3, 0.85, [0.3, 0.2]);
    W.floorGlows.add(pl.x, 0.05, pl.z, pl.r * 1.2, '#5ff0f0', 0.12, 1); W.kitState.bubbles.push({ x: pl.x, z: pl.z, r: pl.r * 0.6 });
    W.collision.addCircle(pl.x, pl.z, pl.r * 0.9);
  }
  for (let k = 0, n = 0; k < 14 && n < 5; k++) {
    const a = q() * TAU, rr = ar.r - 1.9 - q() * 0.8, x = ar.x + Math.cos(a) * rr, z = ar.z + Math.sin(a) * rr;
    if (!W.walkable(x, z) || (ma != null && Math.abs(angD(a, ma)) < 0.7) || (x - ar.x) * sx + (z - ar.z) * sz > e - 1.5 || W.collision.solidAt(x, z, 0.6)) continue;
    if (n % 2 === 0) { life(W.solid, LIFE.drift(n % 3), x, -0.03, z, a + PI / 2 + (q() - 0.5) * 0.6, 0.9 + q() * 0.3, 0.82); W.collision.addCircle(x, z, 0.4); }
    else for (let j = 0; j < 3; j++) { const fx = x + (q() - 0.5) * 0.9, fz = z + (q() - 0.5) * 0.9; W.glow.add(SH.sph(), M(fx, 0.12, fz, 0.12, 0.12, 0.12), col(floatCols[(j + n) % 4])); CL.add(SH.hoop(), M(fx, 0.12, fz, 0.125, 0.125, 0.125), col('#a88a58')); }
    n++;
  }
  // moonlight through a blowhole falls on the water where he sleeps: a broad shaft, a pale pool on the sea, a cool light
  { const [mx, mz] = at(e + 3.2, 0);
    for (let i = 0; i < 3; i++) W.shaftBatch.add(mx + (q() - 0.5) * 2.4, mz + (q() - 0.5) * 2.4, 2.2 + q() * 1.6, 13, 0.26, q() * TAU, 0.16, 0.1 + q() * 0.04, q() * 10);
    W.floorGlows.add(mx, 0.06, mz, 4.6, '#cfefff', 0.16);
    W.lightPool.addSource({ pos: V(mx, 6, mz), color: col('#cfe8ff').clone(), intensity: 4, radius: 14, flicker: 0.05 });
    W.kitState.shafts.push({ x: mx, z: mz }); }
  // a soft fill over the beach so the fight reads, and the sea's own glow along the shore
  W.lightPool.addSource({ pos: V(ar.x - sx * 3, 7, ar.z - sz * 3), color: col('#e8f4ff').clone(), intensity: 2.6, radius: 15, flicker: 0.05 });
  for (const s of [-0.6, 0.6]) { const [x, z] = at(e + 0.8, s * chord(e) * 0.7); W.lightPool.addSource({ pos: V(x, 0.8, z), color: col('#5ff0f0').clone(), intensity: 3, radius: 7, flicker: 0.2 }); }
  W.kitState.bubbles.push({ x: at(e + 3, 0)[0], z: at(e + 3, 0)[1], r: 5 });
}

// a few pale moonlight shafts falling through blowholes in the cave roof (not one in every room), dust motes in them
function buildShafts(W) { roofShafts(W, { max: 4, chance: 0.5, pool: '#d4f0ff', light: '#d4ecff', a0: 0.13, a1: 0.04, lightI: 4.5 }); }

// ------------------------------------------------------------------ the stairs down
function buildLandmarks(W) {
  const L = W.L; if (!L.stairs) return;
  const c = W.cellToWorld(L.stairs.x, L.stairs.y), q = W.krng, rx = CAMX, rz = -CAMZ;
  const ok = (x, z, pad = 0.25) => W.walkable(x, z) && !W.collision.solidAt(x, z, pad);
  for (let i = 0; i < 12; i++) { const a = i / 12 * TAU + q() * 0.1, R = 1.4 + q() * 0.06, x = c.x + Math.cos(a) * R, z = c.z + Math.sin(a) * R; if (W.walkable(x, z)) W.clutter.addVC(Pr.slab(i + 1, { R: 0.3, moss: 0.25, tone: ['#56606a', '#4a545c', '#626c72'][i % 3] }), M(x, -0.04, z, 1, 1, 1, 0, -a, 0)); }
  // the driftwood gateway over the way down, turned to the camera, and a float lantern either side
  const tx = c.x - CAMX * 0.6, tz = c.z - CAMZ * 0.6;
  if (ok(tx, tz, 0.1)) { addPiece(W, GATE(5), tx, tz, CAM, { s: 0.74, mul: 0.82 }); for (const e of [-1, 1]) W.collision.addCircle(tx + rx * e * 1.22, tz + rz * e * 1.22, 0.2); }
  for (const e of [-1, 1]) { const x = c.x + rx * e * 2.1 - CAMX * 0.2, z = c.z + rz * e * 2.1 - CAMZ * 0.2; if (ok(x, z)) { addPiece(W, floatLantern(e > 0 ? 1 : 3, 1.3), x, z, CAM + e * 0.6, { mul: 0.8, lightK: 0.7 }); W.collision.addCircle(x, z, 0.26); } }
  for (let i = 0; i < 4; i++) { const a = CAM + PI + (i - 1.5) * 0.5, x = c.x + Math.cos(a) * 2.2, z = c.z + Math.sin(a) * 2.2; if (ok(x, z, 0.1)) life(W.clutter, i % 2 ? LIFE.kelp(i % 3) : LIFE.anem(i), x, 0, z, a, 1.2, 0.88); }
}

// ------------------------------------------------------------------ decor-map clutter, wall clusters, channels
function buildDressing(W) {
  const r = W.drng, L = W.L, K = W.decoK, TW = W.decoW, TH = W.decoH, D = W.deco, dist = W.wallDist, CL = W.clutter;
  const free = (x, z, pad = 0.25) => freeAt(W, x, z, pad);
  const n = { weed: 0, shell: 0, pebble: 0, life: 0 };
  for (let tz = 0; tz < TH; tz++) for (let tx = 0; tx < TW; tx++) {
    const k = (tz * TW + tx) * 4, lush = D[k], path = D[k + 1], water = D[k + 2], acc = D[k + 3];
    const x = (tx + 0.1 + r() * 0.8) * CELL / K, z = (tz + 0.1 + r() * 0.8) * CELL / K;
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    if (!L.at(cx, cz)) continue;
    const wd = dist[cz * L.W + cx], roll = r();
    if (W.inSea?.(x, z)) continue;
    if (water > 0.12) { // weed and anemones on the pools' banks, now and then an urchin in the water
      if (water < 0.36 && roll < 0.16 && free(x, z, 0.05)) { W.ddTuft(CL, x, z, 0.9 + r() * 0.5, '#2e3618', '#7a8638'); n.weed++; }
      else if (water > 0.6 && roll < 0.05) { life(CL, LIFE.urch(Math.floor(r() * 2)), x, -0.06, z, r() * TAU, 1.1); n.life++; }
      continue;
    }
    if (lush > 0.42 && roll < 0.18 * lush) { // a frond of stranded kelp lying on the patch, now and then a tuft
      if (!free(x, z, 0.05)) continue;
      if (r() < 0.6) { life(CL, LIFE.kelp(Math.floor(r() * 3)), x, 0.02, z, r() * TAU, 0.6 + r() * 0.4, 0.8, [1.35, 0.2]); n.weed++; }
      else { W.ddTuft(CL, x, z, 0.55 + r() * 0.4, '#3a3218', '#8a7232'); n.weed++; }
    } else if (wd === 1 && roll < 0.3) { // the wall foot: shells, pebbles, a starfish
      if (!free(x, z, 0.02)) continue;
      const kk = r();
      if (kk < 0.45) { life(CL, LIFE.shell(Math.floor(r() * 4)), x, 0.005, z, r() * TAU, 1.1 + r() * 0.5, 0.85); n.shell++; }
      else if (kk < 0.85) { for (let i = 0, m = 2 + Math.floor(r() * 3); i < m; i++) W.ddPebble(CL, x + (r() - 0.5) * 0.7, z + (r() - 0.5) * 0.7, 0.05 + r() * 0.08, col('#4e565c'), r() < 0.3 ? '#d8d2c4' : null); n.pebble++; }
      else { life(CL, LIFE.star(Math.floor(r() * 3)), x, 0.01, z, r() * TAU, 1.2); n.life++; }
    } else if (path > 0.2 && path < 0.55 && roll < 0.07) { // grit along the flag runs' edges
      if (!free(x, z, 0.02)) continue;
      for (let i = 0; i < 2; i++) W.ddPebble(CL, x + (r() - 0.5) * 0.5, z + (r() - 0.5) * 0.5, 0.04 + r() * 0.05, col('#5a646a'));
      n.pebble += 2;
    } else if (acc > 0.35 && roll < 0.08) { if (free(x, z, 0.05)) { life(CL, LIFE.shell(Math.floor(r() * 4)), x, 0.005, z, r() * TAU, 1.3, 0.85); n.shell++; } }
    else if (wd >= 2 && lush < 0.1 && path < 0.2 && roll < 0.045 && free(x, z, 0.02)) { // the open sand: a shell, pebbles, the odd stone
      const kk = r();
      if (kk < 0.45) { life(CL, LIFE.shell(Math.floor(r() * 4)), x, 0.005, z, r() * TAU, 1.1 + r() * 0.4, 0.85); n.shell++; }
      else if (kk < 0.85) { for (let i = 0, m = 2 + Math.floor(r() * 3); i < m; i++) W.ddPebble(CL, x + (r() - 0.5) * 0.8, z + (r() - 0.5) * 0.8, 0.05 + r() * 0.07, col('#4a5258'), r() < 0.25 ? '#e2dccc' : null); n.pebble++; }
      else { CL.add(SH.rock(), M(x, 0.04, z, 0.16 + r() * 0.12, 0.1 + r() * 0.06, 0.14 + r() * 0.1, r(), r() * TAU, r()), null, grad('#2e363a', '#5a646a', 1, 1.2, -0.1)); n.pebble++; }
    }
  }
  wallClusters(W); channelStones(W); poolsDress(W);
  W.dressCount = n;
}
// mid-scale dressing hugging the walls and corners of every chamber (rock piles with barnacles, driftwood heaps, net and
// float clusters, kelp drifts, crab burrows, a group of float lanterns): 4–6 a chamber, the middle kept clear
function wallClusters(W) {
  let lit = 0;
  W.clusterCount = wallSpots(W, ({ s, x: px, z: pz, corner, far, face, r }) => {
    const k = r(), CL = W.clutter;
    if (far && k > 0.7 && lit < 10) { // a group of float lanterns, one lit (warm pools against the cool rock)
      lit++;
      addPiece(W, floatLantern(Math.floor(r() * 4), 1.4), px + s.nx * 0.2, pz + s.nz * 0.2, face, { lights: false, mul: 0.8 }); W.collision.addCircle(px + s.nx * 0.2, pz + s.nz * 0.2, 0.28);
      for (const e2 of [-1, 1]) { const x = px + s.tx * e2 * 0.8 - s.nx * 0.1, z = pz + s.tz * e2 * 0.8 - s.nz * 0.1; if (freeAt(W, x, z, 0.15)) { W.glow.add(SH.sph(), M(x, 0.12, z, 0.12, 0.12, 0.12), col(floatCols[(lit + e2 + 4) % 4])); W.clutter.add(SH.hoop(), M(x, 0.12, z, 0.125, 0.125, 0.125), col('#a88a58')); } }
      const lx = px + s.nx * 0.2 + Math.sin(face) * 0.46, lz = pz + s.nz * 0.2 + Math.cos(face) * 0.46; W.halos.add(lx, 0.96, lz, 1.0, P.lantern, 0.4, 1); W.floorGlows.add(px - s.nx * 0.5, 0.04, pz - s.nz * 0.5, 2.1, '#ffa858', 0.24, 1); W.lightPool.addSource({ pos: V(px - s.nx * 0.9, 1.1, pz - s.nz * 0.9), color: col(P.lantern).clone(), intensity: 5, radius: 6, flicker: 0.8 });
      return;
    }
    if (k < 0.28) { // a rock pile: a big barnacled boulder and two small, anemones and a starfish between
      life(W.solid, caveRock(Math.floor(r() * 4), 0.7, 0.62), px + s.nx * 0.2, -0.08, pz + s.nz * 0.2, r() * TAU, (corner ? 1.2 : 1.0) + r() * 0.3, 0.9); W.collision.addCircle(px + s.nx * 0.2, pz + s.nz * 0.2, 0.62);
      for (let j = 0; j < 2; j++) { const o = (j ? 1 : -1) * (0.95 + r() * 0.4), x = px + s.tx * o - s.nx * 0.2, z = pz + s.tz * o - s.nz * 0.2; if (freeAt(W, x, z, 0.2)) life(W.solid, caveRock(4 + Math.floor(r() * 3), 0.4, 0.6), x, -0.06, z, r() * TAU, 0.8 + r() * 0.4, 0.9); }
      for (let j = 0; j < 3; j++) life(CL, LIFE.anem(Math.floor(r() * 4)), px - s.nx * 0.7 + s.tx * (r() - 0.5) * 1.4, 0, pz - s.nz * 0.7 + s.tz * (r() - 0.5) * 1.4, r() * TAU, 1.3 + r() * 0.5, 0.95);
      life(CL, LIFE.star(Math.floor(r() * 3)), px - s.nx * 0.5 + s.tx * 0.6, 0.25, pz - s.nz * 0.5 + s.tz * 0.6, r() * TAU, 1.4, 0.85, [0.5, 0.2]);
    } else if (k < 0.46) { // a driftwood heap: bleached logs crossed against the wall, shells and a float in the tangle
      for (let j = 0; j < 2; j++) life(W.solid, LIFE.drift(Math.floor(r() * 3)), px + s.nx * 0.1 + s.tx * (j - 0.5) * 0.7, -0.03 + j * 0.12, pz + s.nz * 0.1 + s.tz * (j - 0.5) * 0.7, face + PI / 2 + (r() - 0.5) * 0.8, 0.9 + r() * 0.3, 0.82);
      W.collision.addCircle(px, pz, 0.6);
      for (let j = 0; j < 4; j++) life(CL, LIFE.shell(Math.floor(r() * 4)), px - s.nx * 0.6 + s.tx * (r() - 0.5) * 1.6, 0.005, pz - s.nz * 0.6 + s.tz * (r() - 0.5) * 1.6, r() * TAU, 1.3);
      W.glow.add(SH.sph(), M(px - s.nx * 0.3 + s.tx * 0.5, 0.12, pz - s.nz * 0.3 + s.tz * 0.5, 0.12, 0.12, 0.12), col(floatCols[Math.floor(r() * 4)]));
    } else if (k < 0.62) { // a net and floats cluster: a heap of net, crates, buoys, a bucket and a coil of rope
      addPiece(W, netPile(Math.floor(r() * 3)), px + s.nx * 0.2, pz + s.nz * 0.2, face + (r() - 0.5) * 0.5, { mul: 0.82 }); W.collision.addCircle(px + s.nx * 0.2, pz + s.nz * 0.2, 0.6);
    } else if (k < 0.76) { // a kelp drift stranded at the foot: a heap of fronds, shells, a crab picking at it
      for (let j = 0; j < 5; j++) life(CL, LIFE.kelp(j % 3), px + s.tx * (j - 2) * 0.35 + s.nx * 0.15, 0, pz + s.tz * (j - 2) * 0.35 + s.nz * 0.15, r() * TAU, 0.8 + r() * 0.5, 0.82, [1.2, 0.3]);
      CL.add(SH.hemiLo(), M(px + s.nx * 0.1, -0.02, pz + s.nz * 0.1, 1.1, 0.16, 0.5, 0, face, 0), null, (x, y, z, nx, ny, nz2, o) => o.copy(col('#2a2a14')).lerp(col('#5e5428'), clamp(ny * 0.7)));
      for (let j = 0; j < 3; j++) life(CL, LIFE.shell(Math.floor(r() * 4)), px - s.nx * 0.55 + s.tx * (r() - 0.5) * 1.4, 0.005, pz - s.nz * 0.55 + s.tz * (r() - 0.5) * 1.4, r() * TAU, 1.3);
      crab(W, px - s.nx * 0.8, pz - s.nz * 0.8, r() * TAU, r);
    } else if (k < 0.86) { // a crab burrow: sand mounds holed by the crabs, two of them out sunning, a starfish
      for (let j = 0; j < 3; j++) { const x = px + s.tx * (j - 1) * 0.7 - s.nx * (0.2 + r() * 0.3), z = pz + s.tz * (j - 1) * 0.7 - s.nz * (0.2 + r() * 0.3); CL.add(SH.hemiLo(), M(x, -0.02, z, 0.36 + r() * 0.12, 0.14, 0.32, 0, r() * TAU, 0), null, grad('#6a665a', '#8e887a')); CL.add(SH.cyl6(), M(x, 0.1, z, 0.06, 0.04, 0.06), col('#1a1a18')); }
      crab(W, px - s.nx * 1.0 + s.tx * 0.5, pz - s.nz * 1.0 + s.tz * 0.5, r() * TAU, r); crab(W, px - s.nx * 0.7 - s.tx * 0.9, pz - s.nz * 0.7 - s.tz * 0.9, r() * TAU, r);
    } else if (far) { // a group of float lanterns, one lit
      const on = lit < 10; if (on) lit++;
      addPiece(W, floatLantern(Math.floor(r() * 4), 1.4), px + s.nx * 0.2, pz + s.nz * 0.2, face, { lights: false, mul: 0.8 }); W.collision.addCircle(px + s.nx * 0.2, pz + s.nz * 0.2, 0.28);
      for (const e2 of [-1, 1]) { const x = px + s.tx * e2 * 0.8 - s.nx * 0.1, z = pz + s.tz * e2 * 0.8 - s.nz * 0.1; if (freeAt(W, x, z, 0.15)) { W.glow.add(SH.sph(), M(x, 0.12, z, 0.12, 0.12, 0.12), col(floatCols[(lit + e2 + 4) % 4])); W.clutter.add(SH.hoop(), M(x, 0.12, z, 0.125, 0.125, 0.125), col('#a88a58')); } }
      if (on) { const lx = px + s.nx * 0.2 + Math.sin(face) * 0.46, lz = pz + s.nz * 0.2 + Math.cos(face) * 0.46; W.halos.add(lx, 0.96, lz, 1.0, P.lantern, 0.4, 1); W.floorGlows.add(px - s.nx * 0.5, 0.04, pz - s.nz * 0.5, 1.9, '#ffa858', 0.2, 1); W.lightPool.addSource({ pos: V(px - s.nx * 0.9, 1.1, pz - s.nz * 0.9), color: col(P.lantern).clone(), intensity: 5, radius: 6, flicker: 0.8 }); }
    } else return false;
  });
}
/** a little red crab (two claws up), static on the sand */
function crab(W, x, z, a, r) {
  const CL = W.clutter, c = r() < 0.75 ? '#d8503a' : '#4a84c8';
  CL.add(SH.sphLo(), M(x, 0.05, z, 0.11, 0.06, 0.08, 0, a, 0), col(c));
  for (const s of [-1, 1]) {
    CL.add(SH.sphLo(), M(x + Math.cos(a) * 0.1 * s - Math.sin(a) * 0.08, 0.08, z - Math.sin(a) * 0.1 * s - Math.cos(a) * 0.08, 0.045, 0.035, 0.03, 0, a, 0), col(c));
    for (let k = 0; k < 3; k++) CL.add(SH.cyl6(), M(x + Math.cos(a) * 0.08 * s + Math.sin(a) * (k - 1) * 0.05, 0.0, z - Math.sin(a) * 0.08 * s + Math.cos(a) * (k - 1) * 0.05, 0.01, 0.07, 0.01, 0, a, s * 1.0), col(c));
  }
  for (const s of [-1, 1]) CL.add(SH.blob(), M(x + Math.cos(a) * 0.035 * s - Math.sin(a) * 0.06, 0.12, z - Math.sin(a) * 0.035 * s - Math.cos(a) * 0.06, 0.016, 0.016, 0.016), col('#1a1416'));
}
/** a heap of net with floats, a crate, two buoys, a bucket and a coil of rope (local -z = the wall) */
function netPile(seed = 0) {
  return cached('netpile:' + seed, () => kitPiece(seed * 9 + 4, B => {
    const heap = BG.sph(0.5, 12, 6, 0, TAU, 0, PI / 2); heap.scale(1.3, 0.5, 0.9); B.add(heap, (p, n, o) => o.set('#a89878').multiplyScalar(0.7 + 0.3 * (Math.abs(Math.sin(p.x * 40)) > 0.85 || Math.abs(Math.sin(p.z * 40)) > 0.85 ? 1.2 : 0.8)));
    for (let k = 0; k < 4; k++) { const f = BG.sph(0.09, 8, 6); f.translate((k - 1.5) * 0.3, 0.22 + (k % 2) * 0.06, 0.1 + (k % 2) * 0.12); B.glow(f, floatCols[(k + seed) % 4], { tint: 0.6 }); }
    B.at([0.85, 0, -0.15], 0.3, () => crate(B, { s: 0.36, wood: '#6a8aa8' }));
    for (let i = 0; i < 2; i++) { const b = BG.sph(0.16, 12, 9); b.scale(1, 1.15, 1); b.translate(-0.95 + i * 0.32, 0.17, 0.25 - i * 0.12); B.add(b, (p, n, o) => o.set(Math.abs(p.y - 0.17) < 0.055 ? '#f4ece0' : '#d24a3a')); }
    B.at([0.5, 0, 0.55], 0, () => bucket(B, { r: 0.13, h: 0.18, color: '#7a90a8', water: true }));
    for (let k = 0; k < 4; k++) { const t = BG.torus(0.22 - k * 0.032, 0.028, 5, 14); t.rotateX(PI / 2); t.translate(-0.4, 0.03 + k * 0.04, 0.62); B.add(t, '#d4c08c'); }
  }, 0.01));
}
function channelStones(W) { // stepping stones of dark basalt across each tide channel, weed on its banks
  const r = W.drng;
  for (const st of W.kitState.channels) {
    const pts = st.pts; if (pts.length < 2) continue;
    const mid = Math.floor(pts.length / 2), a = pts[Math.max(0, mid - 1)], b = pts[Math.min(pts.length - 1, mid + 1)];
    const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1, cx = (a[0] + b[0]) / 2, cz = (a[1] + b[1]) / 2, ax = -dz / l, az = dx / l;
    for (let k = -2; k <= 2; k++) { const x = cx + ax * k * 0.66 + (r() - 0.5) * 0.15, z = cz + az * k * 0.66 + (r() - 0.5) * 0.15; if (W.walkable(x, z)) W.clutter.addVC(Pr.slab(k + 9, { R: 0.34, h: 0.1, moss: 0.2, tone: '#4e585e' }), M(x, -0.02, z, 1, 1, 1, 0, r() * TAU, 0)); }
    for (let i = 0; i < pts.length - 1; i++) for (let t = 0; t < 1; t += 0.25) {
      const p0 = pts[i], p1 = pts[i + 1], x0 = p0[0] + (p1[0] - p0[0]) * t, z0 = p0[1] + (p1[1] - p0[1]) * t, ex = p1[0] - p0[0], ez = p1[1] - p0[1], el = Math.hypot(ex, ez) || 1;
      for (const e of [-1, 1]) { const d = 1.25 + r() * 0.35, x = x0 - ez / el * e * d, z = z0 + ex / el * e * d; if (!W.walkable(x, z) || r() > 0.6) continue; if (r() < 0.5) W.ddPebble(W.clutter, x, z, 0.06 + r() * 0.08, col('#4a5258'), r() < 0.4 ? '#e2dccc' : null); else life(W.clutter, LIFE.anem(Math.floor(r() * 4)), x, 0, z, r() * TAU, 1.2, 0.95); }
    }
    for (let i = 1; i < pts.length - 1; i += 2) W.kitState.bubbles.push({ x: pts[i][0], z: pts[i][1], r: 0.8 });
  }
}
function poolsDress(W) { // the extra pools by the walls: their rims and life (the treasure pool and the centrepieces dress their own)
  const r = W.drng;
  for (const pl of W.kitState.pools) if (pl.kind === 'wall') poolLife(W, pl, r, false);
}
// the water (decor b): one or two chambers get a tide channel running wall to wall, some chambers a tide pool by a wall,
// the spring centrepieces and the treasure's gold chest a pool of their own (painted before the room dressing, so the
// rooms' pieces keep off them: prep() adds them to the room's runner lanes)
function decoMap(W, { disc, curve, cellsOf }) {
  const L = W.L, r = mulberry32(L.floor * 3313 + (L.rooms[1]?.x || 0) * 7 + 3), at = L.at, ks = W.kitState, CELL2 = CELL;
  const blocked = (x, z, pad = 2.4) => [...L.chests.filter(c => c.quality !== 'gold'), ...L.shrines, ...(L.slots || []), ...(L.stairs ? [L.stairs] : [])].some(c => Math.hypot((c.x + 0.5) * CELL2 - x, (c.y + 0.5) * CELL2 - z) < pad)
    || Math.hypot((L.start.x + 0.5) * CELL2 - x, (L.start.y + 0.5) * CELL2 - z) < 5.5 || (W.arena && Math.hypot(W.arena.x - x, W.arena.z - z) < W.arena.R + 3.5);
  const roomOf = (x, z) => { const cx = Math.floor(x / CELL2), cz = Math.floor(z / CELL2); return at(cx, cz) ? L.roomId[cz * L.W + cx] : -1; };
  // the cove's beach: a few little rock pools near the rim (never by the sea or the way in)
  if (L.arena) {
    const sea = seaOf(W), ar = L.arena, mo = L.arenaMouth, ma = mo ? Math.atan2(mo.z - ar.z, mo.x - ar.x) : null;
    for (let k = 0, n = 0; k < 24 && n < 5; k++) {
      const a = r() * TAU, rr = ar.r - 2.7, x = ar.x + Math.cos(a) * rr, z = ar.z + Math.sin(a) * rr;
      if (ma != null && Math.abs(angD(a, ma)) < 0.7) continue;
      if ((x - ar.x) * sea.sx + (z - ar.z) * sea.sz > sea.e - 2.5) continue;
      if (ks.arenaPools.some(q => Math.hypot(q.x - x, q.z - z) < 5)) continue;
      const R = 0.9 + r() * 0.4; disc(x, z, R * 1.3, 2, 1, 0.16); ks.arenaPools.push({ x, z, r: R }); n++;
    }
  }
  // the centrepieces' tide pools
  for (const c of L.centers || []) if (c.r < 0.34) { const x = (c.x + 0.5) * CELL2, z = (c.y + 0.5) * CELL2; disc(x, z, 2.6, 2, 1, 0.14); ks.pools.push({ x, z, r: 2.0, kind: 'center', room: roomOf(x, z) }); }
  // the treasure: its gold chest sunk in a glowing pool
  for (const c of L.chests) {
    if (c.quality !== 'gold') continue;
    const rid = roomOf((c.x + 0.5) * CELL2, (c.y + 0.5) * CELL2), rm = L.rooms[rid - 1]; if (!rm || rm.kind !== 'treasure') continue;
    const x = (c.x + 0.5) * CELL2, z = (c.y + 0.5) * CELL2; disc(x, z, 2.7, 2, 1, 0.1); ks.pools.push({ x, z, r: 2.1, kind: 'treasure', room: rid });
  }
  // tide channels across the camp chambers, wall to wall
  const want = r() < 0.75 ? 1 + (r() < 0.35 ? 1 : 0) : 0;
  const cand = L.rooms.filter(rm => (rm.kind === 'camp' || rm.kind === 'objective') && rm.w >= 9 && rm.h >= 9);
  for (let i = cand.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [cand[i], cand[j]] = [cand[j], cand[i]]; }
  const bossNear = (x, z) => L.spawns.some(sp => sp.boss && Math.hypot((sp.x + 0.5) * CELL2 - x, (sp.y + 0.5) * CELL2 - z) < 4);
  for (const rm of cand) {
    if (ks.channels.length >= want) break;
    const cells = cellsOf(rm); if (cells.length < 60) continue;
    const cx = (rm.cx + 0.5) * CELL2, cz = (rm.cy + 0.5) * CELL2, a = r() * PI, dx = Math.cos(a), dz = Math.sin(a);
    const reach = sgn => { let s = 0; for (; s < 30; s += 0.5) { const x = cx + dx * sgn * s, z = cz + dz * sgn * s, gx = Math.floor(x / CELL2), gz = Math.floor(z / CELL2); if (!at(gx, gz)) break; if (L.roomId[gz * L.W + gx] !== rm.id) return -1; } return s; };
    const s1 = reach(1), s0 = reach(-1); if (s1 < 3 || s0 < 3) continue;
    const pts = [], N = 6, px = -dz, pz = dx, ph = r() * TAU;
    for (let k = 0; k <= N; k++) { const t = -s0 - 0.6 + (s0 + s1 + 1.2) * k / N, wig = Math.sin(k * 1.3 + ph) * 1.1; pts.push([cx + dx * t + px * wig, cz + dz * t + pz * wig]); }
    if (pts.some(([x, z]) => blocked(x, z) || bossNear(x, z) || ks.pools.some(p => Math.hypot(p.x - x, p.z - z) < p.r + 2))) continue;
    for (let k = 0; k < N; k++) curve(pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1], 1.3, 2, 1);
    ks.channels.push({ room: rm.id, pts });
  }
  // tide pools against the walls of some chambers (a wall spot two cells in, clear of the room's things)
  const dist = W.wallDist; let extra = 2 + Math.floor(r() * 3);
  const rooms = L.rooms.filter(rm => (rm.kind === 'camp' || rm.kind === 'objective') && !ks.channels.some(c => c.room === rm.id) && !ks.pools.some(p => p.room === rm.id));
  for (let i = rooms.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [rooms[i], rooms[j]] = [rooms[j], rooms[i]]; }
  for (const rm of rooms) {
    if (extra <= 0) break;
    const cells = cellsOf(rm).filter(([x, y]) => dist[y * L.W + x] === 2);
    for (let t = 0; t < 20; t++) {
      const cl = cells[Math.floor(r() * cells.length)]; if (!cl) break;
      const x = (cl[0] + 0.5) * CELL2, z = (cl[1] + 0.5) * CELL2;
      if (blocked(x, z, 3.2) || bossNear(x, z) || L.spawns.some(sp => Math.hypot((sp.x + 0.5) * CELL2 - x, (sp.y + 0.5) * CELL2 - z) < 2.6)) continue;
      // facing: from the nearest wall into the room
      let fx = 0, fz = 0; for (let k = 0; k < 8; k++) { const a = k / 8 * TAU, ok = at(Math.floor((x + Math.cos(a) * 4.2) / CELL2), Math.floor((z + Math.sin(a) * 4.2) / CELL2)); if (!ok) { fx -= Math.cos(a); fz -= Math.sin(a); } }
      if (!fx && !fz) continue;
      const R = 1.5 + r() * 0.5;
      disc(x, z, R * 1.3, 2, 1, 0.16); ks.pools.push({ x, z, r: R, kind: 'wall', room: rm.id, face: Math.atan2(fx, fz) }); extra--;
      break;
    }
  }
}

// ------------------------------------------------------------------ room purposes (roomDressing.js RoomDresser = D)
function prep(D, A) { // the room's water (channel, pools) joins its runner lanes so nothing stands in it
  if (A._tidePrep) return; A._tidePrep = true;
  const ks = D.W.kitState;
  for (const st of ks.channels) if (st.room === A.rm.id) for (let k = 0; k < st.pts.length - 1; k++) A.lanes.push([st.pts[k][0], st.pts[k][1], st.pts[k + 1][0], st.pts[k + 1][1], 1.1, 1]);
  for (const pl of ks.pools) if (pl.room === A.rm.id) A.lanes.push([pl.x, pl.z, pl.x, pl.z, pl.r + 0.5, 1]);
}
const farFacing = s => s && toCam(s.fx, s.fz) > 0.25; // a wall spot whose wall is on the far side (it faces the camera)
const wallSpot = (D, A, rad, o = {}) => { let s = null; for (let t = 0; t < 6 && !farFacing(s); t++) s = D.spot(A, rad, { mode: 'wall', hug: 0.55, camPref: 1.6, ...o }); if (s) D.claim(s.x, s.z, rad, true, rad, o.core ?? rad * 0.5); return s; };
const ROOMS = {
  shrine(D, A) { // the Ebisu sea shrine against a far wall: the hokora on its rock, a red torii before it, float lanterns
    prep(D, A); const W = D.W;
    const s = wallSpot(D, A, 1.7, { core: 0.75 }); if (!s) return;
    addPiece(W, umiHokora(Math.floor(D.r() * 2)), s.x, s.z, s.face, { mul: 0.85 }); D.coll(s.x, s.z, 0.85);
    const [tx, tz] = D.lp(s, 0, 1.75); if (D.ok(tx, tz, 0.3)) { addPiece(W, Pr.torii(6, { w: 1.6, h: 1.95 }), tx, tz, s.face, { mul: 0.9 }); for (const e of [-1, 1]) { const [px, pz] = D.lp(s, e * 0.8, 1.75); D.coll(px, pz, 0.16); } }
    for (const e of [-1, 1]) { const [x, z] = D.lp(s, e * 1.55, 0.7); if (D.ok(x, z, 0.3)) { addPiece(W, floatLantern(e > 0 ? 0 : 2, 1.25), x, z, s.face - e * 0.9, { mul: 0.8, lightK: 0.6 }); D.coll(x, z, 0.24); } }
    for (let i = 0; i < 5; i++) { const [x, z] = D.lp(s, D.rnd(-1.6, 1.6), D.rnd(0.2, 1.2)); if (D.ok(x, z, 0.1)) life(D.CL, LIFE.shell(i % 4), x, 0.005, z, D.r() * TAU, 1.4, 0.88); }
  },
  wreck(D, A) { // a fishing boat stranded against a far wall, heeled over: nets, floats, an oar, a crab trap
    prep(D, A); const W = D.W;
    let s = wallSpot(D, A, 2.0, { core: 1.1, hug: 0.45 }); if (!s) s = D.put(A, 1.8, { mode: 'wall', hug: 0.5, core: 1.0 }); if (!s) return;
    const [wx, wz] = D.lp(s, 0, 0.4);
    addPiece(W, A_WRECK(), wx, wz, s.face + PI / 2 + (D.r() - 0.5) * 0.4, { s: 0.85, mul: 0.8, lightK: 0.6 });
    D.coll(wx, wz, 1.3); { const [x2, z2] = D.lp(s, 1.1, 0.0); D.coll(x2, z2, 0.8); const [x3, z3] = D.lp(s, -1.1, 0.0); D.coll(x3, z3, 0.8); }
    for (let i = 0; i < 4; i++) { const [x, z] = D.lp(s, D.rnd(-2, 2), D.rnd(1.2, 2.2)); if (D.ok(x, z, 0.1)) life(D.CL, i % 2 ? LIFE.shell(i) : LIFE.star(i % 3), x, 0.005, z, D.r() * TAU, 1.4, 0.85); }
  },
  nets(D, A) { // the fishermen's cave camp: a net rack with floats, a brazier, a fish-drying rack, crates and a bucket
    prep(D, A); const W = D.W;
    const s = wallSpot(D, A, 2.0, { core: 0.9 }); if (!s) return;
    addPiece(W, A_NETRACK(), s.x, s.z, s.face, { s: 0.92, mul: 0.8 }); D.coll(s.x, s.z, 0.75); { const [x2, z2] = D.lp(s, 1.8, 0.2); D.coll(x2, z2, 0.45); }
    const [bx, bz] = D.lp(s, -0.2, 2.0); if (D.ok(bx, bz, 0.5)) fire(D, bx, bz);
    const f = D.put(A, 1.0, { mode: 'wall', hug: 0.7, camPref: 1, core: 0.35 });
    if (f) { addPiece(W, fishRackPiece(), f.x, f.z, f.face, { mul: 0.85 }); D.coll(f.x, f.z, 0.3); }
  },
  wedded(D, A) { // meoto-iwa: two barnacled stacks tied with a great rope against a far wall, kelp round their feet
    prep(D, A); const W = D.W;
    const s = wallSpot(D, A, 2.2, { core: 1.0, hug: 0.5 }); if (!s) return;
    addPiece(W, weddedPair(Math.floor(D.r() * 2)), s.x, s.z, s.face, { mul: 0.9 });
    for (const e of [-1.2, 1.15]) { const [x, z] = D.lp(s, e, 0); D.coll(x, z, 0.7); }
    for (let i = 0; i < 6; i++) { const [x, z] = D.lp(s, D.rnd(-2, 2), D.rnd(0.6, 1.4)); if (D.ok(x, z, 0.05)) life(D.CL, LIFE.kelp(i % 3), x, 0, z, D.r() * TAU, 1.1 + D.r() * 0.5, 0.85); }
    const [lx, lz] = D.lp(s, 2.3, 0.8); if (D.ok(lx, lz, 0.3)) { addPiece(W, floatLantern(1, 1.3), lx, lz, s.face - 0.8, { mul: 0.8, lightK: 0.6 }); D.coll(lx, lz, 0.24); }
  },
  coral(D, A) { // a coral garden on a sandy mound: coral heads, anemones, urchins and a giant clam, glowing softly
    prep(D, A); const W = D.W;
    const s = D.put(A, 1.8, { core: 0.8, ring: 1.4 }); if (!s) return;
    D.CL.add(SH.hemiLo(), M(s.x, -0.04, s.z, 1.6, 0.22, 1.3, 0, s.face, 0), null, grad('#6a665a', '#948e7e'));
    bake(W, CLAM(2), s.x + 0.2, 0.02, s.z - 0.1, s.face, 0.95);
    for (let i = 0; i < 9; i++) { const a = i / 9 * TAU + D.r() * 0.4, d = 0.7 + D.r() * 0.7; life(W.solid, LIFE.coral(i % 4), s.x + Math.cos(a) * d, 0.04, s.z + Math.sin(a) * d * 0.85, D.r() * TAU, 1.7 + D.r() * 0.9, 0.95); }
    for (let i = 0; i < 6; i++) { const a = D.r() * TAU, d = 1.2 + D.r() * 0.6; life(D.CL, LIFE.anem(i % 4), s.x + Math.cos(a) * d, 0, s.z + Math.sin(a) * d, a, 1.4, 0.95); }
    D.coll(s.x, s.z, 0.7);
    W.floorGlows.add(s.x, 0.05, s.z, 2.2, '#c8a0ff', 0.12, 1);
    D.light(s.x, 1.0, s.z, '#c8b0ff', 2.6, 5, 0.2);
  },
  drift(D, A) { // a flotsam beach: driftwood logs lying across the floor, a broken oar, crates, floats, shells
    prep(D, A); const W = D.W;
    for (let i = 0, n = 2 + Math.floor(D.r() * 2); i < n; i++) {
      const s = D.put(A, 1.3, { collide: false }); if (!s) continue;
      life(W.solid, LIFE.drift(i % 3), s.x, -0.04, s.z, D.r() * TAU, 0.9 + D.r() * 0.4, 0.82);
      for (let j = 0; j < 2; j++) { const [x, z] = D.lp(s, D.rnd(-1, 1), D.rnd(-0.8, 0.8)); if (D.ok(x, z, 0.05)) life(D.CL, LIFE.shell(j + i), x, 0.005, z, D.r() * TAU, 1.3, 0.88); }
    }
    const c = D.put(A, 0.9, { mode: 'wall', hug: 0.6, core: 0.45 });
    if (c) { addPiece(W, netPile(2), c.x, c.z, c.face, { mul: 0.82, s: 0.85 }); D.coll(c.x, c.z, 0.5); const [bx, bz] = D.lp(c, 1.5, 0.6); if (D.ok(bx, bz, 0.5)) fire(D, bx, bz); }
  },
  crabs(D, A) { // the crab colony: a giant empty heikegani shell on the sand, burrow mounds, little crabs, a shell midden
    prep(D, A); const W = D.W;
    const s = D.put(A, 1.6, { mode: 'wall', hug: 0.5, camPref: 1.2, core: 0.8 }); if (!s) return;
    const [hx, hz] = D.lp(s, 0, 0.5); addPiece(W, crabHusk(0), hx, hz, s.face + (D.r() - 0.5) * 0.6, { mul: 0.85 }); D.coll(hx, hz, 0.75);
    for (let i = 0; i < 5; i++) { const [x, z] = D.lp(s, D.rnd(-2, 2), D.rnd(1.0, 2.2)); if (D.ok(x, z, 0.1)) crab(W, x, z, D.r() * TAU, D.r); }
    for (let i = 0; i < 3; i++) { const [x, z] = D.lp(s, D.rnd(-2.2, 2.2), D.rnd(0.2, 1.6)); if (D.ok(x, z, 0.2)) { D.CL.add(SH.hemiLo(), M(x, -0.02, z, 0.36, 0.13, 0.3, 0, D.r() * TAU, 0), null, grad('#6a665a', '#8e887a')); D.CL.add(SH.cyl6(), M(x, 0.09, z, 0.06, 0.04, 0.06), col('#1a1a18')); } }
    for (let i = 0; i < 8; i++) { const [x, z] = D.lp(s, D.rnd(-1.4, 1.4) + 1.6, D.rnd(-0.2, 0.8)); if (D.ok(x, z, 0.02)) life(D.CL, LIFE.shell(i % 4), x, 0.005 + i * 0.002, z, D.r() * TAU, 1.3, 0.88); }
    const [bx, bz] = D.lp(s, -2.0, 1.0); if (D.ok(bx, bz, 0.5)) fire(D, bx, bz);
  },
};
/** a fishermen's brazier (a warm pool, sparks): its own light and floor glow */
function fire(D, x, z) { const W = D.W; addPiece(W, brazier(0), x, z, D.r() * TAU, { mul: 0.9, lightK: 0.9 }); D.coll(x, z, 0.45); W.kitState.fires.push({ x, y: 0.45, z }); W.floorGlows.add(x, 0.04, z, 2.2, '#ff9a48', 0.22, 1); }
const A_WRECK = () => cached('wreck', () => TA.wreck(3));
const CLAM = k => cached('clam' + k, () => TA.giantClam(k)), GATE = k => cached('gate' + k, () => TA.arenaGate(k));
const A_NETRACK = () => cached('netrack', () => TA.netRack(5));
const fishRackPiece = () => cached('fishrack', () => kitPiece(13, B => { fishRack(B, { w: 1.1, n: 5 }); }, 0.01));
function extras(D, A) { // every room: a barnacled stack in the bigger ones, rock piles at the walls, the pools' life
  prep(D, A); const W = D.W;
  if (A.cells.length > 60) { const s = D.put(A, 1.1, { core: 0.75, ring: 1.6 }); if (s) { life(W.solid, cavePillar(Math.floor(D.r() * 3)), s.x, -0.05, s.z, D.r() * TAU, 0.85 + D.r() * 0.3, 0.9); D.coll(s.x, s.z, 0.72); for (let i = 0; i < 3; i++) { const a = D.r() * TAU; life(D.CL, LIFE.kelp(i % 3), s.x + Math.cos(a) * 1.0, 0, s.z + Math.sin(a) * 1.0, a, 1.1, 0.85); } } }
  for (let i = 0, n = 1 + Math.floor(D.r() * 2); i < n; i++) { const s = D.put(A, 0.5, { mode: 'wall', hug: 0.7, core: 0.3 }); if (s) { if (D.r() < 0.5) { life(W.solid, caveRock(Math.floor(D.r() * 4), 0.5, 0.6), s.x, -0.06, s.z, D.r() * TAU, 0.9, 0.9); D.coll(s.x, s.z, 0.4); } else for (let j = 0; j < 3; j++) life(D.CL, LIFE.anem(j), s.x + (D.r() - 0.5) * 0.6, 0, s.z + (D.r() - 0.5) * 0.6, D.r() * TAU, 1.4, 0.95); } }
  for (const st of W.kitState.channels) if (st.room === A.rm.id) for (let k = 0; k < st.pts.length; k++) {
    const [x, z] = st.pts[k], a = D.r() * TAU, d = 1.5 + D.r() * 0.3, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
    if (D.ok(px, pz, 0.05) && !inStream(W, px, pz, 0.28) && D.r() < 0.6) life(D.CL, LIFE.kelp(k % 3), px, 0, pz, a, 0.9, 0.85);
  }
}
function arrival(D, A) { // the way home: a driftwood gateway framing the exit portal, float lanterns, a plank landing
  const W = D.W, L = D.L, px = (L.start.x + 0.5) * CELL - 1.6, pz = (L.start.y + 0.5) * CELL - 1.6;
  addPiece(W, planks(0), px, pz, -PI / 4, { mul: 0.8 });
  const tx = px - CAMX * 0.5, tz = pz - CAMZ * 0.5;
  if (W.walkable(tx, tz)) { addPiece(W, GATE(3), tx, tz, CAM, { s: 0.7, mul: 0.82 }); for (const e of [-1, 1]) D.coll(tx + CAMX * e * 1.16, tz - CAMZ * e * 1.16, 0.18); }
  for (const e of [-1, 1]) { const x = px + CAMX * e * 2.0, z = pz - CAMZ * e * 2.0; if (W.walkable(x, z) && !W.collision.solidAt(x, z, 0.2)) { addPiece(W, floatLantern(e > 0 ? 0 : 3, 1.3), x, z, CAM - e * 0.5, { mul: 0.8, lightK: 0.6 }); D.coll(x, z, 0.24); } }
  D.claim(px, pz, 1.4, false);
}
function hoard(D, A) { // the sunken treasure: the gold chest in its glowing pool, rocks round it, a giant clam, a red torii
  const W = D.W;
  for (const c of D.L.chests) {
    if (c.quality !== 'gold' || D.roomAt((c.x + 0.5) * CELL, (c.y + 0.5) * CELL) !== A.rm.id) continue;
    const x0 = (c.x + 0.5) * CELL, z0 = (c.y + 0.5) * CELL, R = 2.1;
    life(W.solid, rimRocks(9, R, 0.75), x0, -0.03, z0, CAM, 1, 0.9); // (open toward the camera: the way in)
    for (let k = 0; k < 7; k++) { const a = CAM + PI + (k - 3) * 0.32, rr = R * (1.08 + (k % 2) * 0.1); W.collision.addCircle(x0 + Math.cos(a) * rr, z0 + Math.sin(a) * rr, 0.3); }
    bake(W, CLAM(1), x0 - CAMX * 1.1 + CAMZ * 0.9, -0.1, z0 - CAMZ * 1.1 - CAMX * 0.9, CAM + 0.6, 1.0);
    const tx = x0 - CAMX * 2.9, tz = z0 - CAMZ * 2.9;
    if (W.walkable(tx, tz) && !W.collision.solidAt(tx, tz, 0.1)) { addPiece(W, Pr.torii(12, { w: 1.6, h: 1.9 }), tx, tz, CAM, { mul: 0.9 }); for (const e of [-1, 1]) D.coll(tx + CAMX * e * 0.8, tz - CAMZ * e * 0.8, 0.14); }
    for (let k = 0; k < 5; k++) { const a = TAU * k / 5 + 0.4, d = R * 0.6; life(D.CL, LIFE.anem(k % 4), x0 + Math.cos(a) * d, -0.05, z0 + Math.sin(a) * d, a, 1.3, 0.95); }
    for (let k = 0; k < 6; k++) { const a = D.r() * TAU, d = 0.9 + D.r() * 1.0; W.glow.add(SH.sph(), M(x0 + Math.cos(a) * d, 0.03, z0 + Math.sin(a) * d, 0.035, 0.035, 0.035), col('#fff4fa')); } // pearls
    W.halos.add(x0, 0.5, z0, 3.0, '#9ff0f0', 0.16);
    W.lightPool.addSource({ pos: V(x0, 1.2, z0), color: col('#7ff0e8').clone(), intensity: 3.5, radius: 6, flicker: 0.15 });
    W.kitState.bubbles.push({ x: x0, z: z0, r: R * 0.7 });
  }
  D.hoard(A);
}
function corridor(D, x, z, face, q) {
  const W = D.W, CL = D.CL;
  if (inStream(W, x, z, 0.2)) return;
  if (q < 0.25) life(CL, LIFE.shell(Math.floor(D.r() * 4)), x, 0.005, z, D.r() * TAU, 1.2 + D.r() * 0.4, 0.85);
  else if (q < 0.42) life(CL, LIFE.kelp(Math.floor(D.r() * 3)), x, 0, z, D.r() * TAU, 0.7 + D.r() * 0.3, 0.85);
  else if (q < 0.56) life(CL, LIFE.urch(Math.floor(D.r() * 2)), x, 0, z, D.r() * TAU, 1.0);
  else if (q < 0.68) life(CL, LIFE.star(Math.floor(D.r() * 3)), x, 0.01, z, D.r() * TAU, 1.1);
  else if (q < 0.74) for (let i = 0; i < 2; i++) life(CL, LIFE.anem(Math.floor(D.r() * 4)), x + (D.r() - 0.5) * 0.4, 0, z + (D.r() - 0.5) * 0.4, D.r() * TAU, 1.1, 0.95);
  else if (q < 0.82) crab(W, x, z, D.r() * TAU, D.r);
  else for (let i = 0; i < 3; i++) W.ddPebble(CL, x + (D.r() - 0.5) * 0.5, z + (D.r() - 0.5) * 0.5, 0.05 + D.r() * 0.06, col('#4a5258'), D.r() < 0.4 ? '#e2dccc' : null);
}

// ------------------------------------------------------------------ ambience
function update(W, dt, t, vfx, focus) {
  const ks = W.kitState; if (!vfx || !focus) return;
  // motes turning slowly in the moonlight shafts
  for (const s of ks.shafts || []) {
    if ((s.x - focus.x) ** 2 + (s.z - focus.z) ** 2 > 18 * 18 || Math.random() > dt * 2.0) continue;
    vfx.dot.spawn({ x: s.x + rand(-0.6, 0.6), y: rand(0.6, 3.2), z: s.z + rand(-0.6, 0.6), vx: rand(-0.04, 0.04), vy: -rand(0.03, 0.08), vz: rand(-0.04, 0.04), life: rand(2.5, 4), size: rand(0.035, 0.06), color: '#e8f8ff', alpha: 0.65, alpha1: 0, fadeIn: 0.8 });
  }
  // drips from the brows and the seeps (each falls into the wet foot below)
  for (const d of ks.drips) {
    if ((d.x - focus.x) ** 2 + (d.z - focus.z) ** 2 > 22 * 22) continue;
    d.t -= dt; if (d.t > 0) continue; d.t = rand(1.2, 3.0);
    vfx.dot.spawn({ x: d.x + rand(-0.04, 0.04), y: d.y, z: d.z, vy: -0.4, life: Math.sqrt(2 * d.y / 12) + 0.05, size: 0.07, color: '#bff4ff', alpha: 0.95, alpha1: 0.8, grav: 12 });
  }
  // bubbles rising in the pools, plankton sparks drifting over the water
  for (const b of ks.bubbles) {
    if ((b.x - focus.x) ** 2 + (b.z - focus.z) ** 2 > 18 * 18) continue;
    if (Math.random() < dt * (1.2 + b.r * 0.5)) { const a = rand(0, TAU), d = Math.sqrt(Math.random()) * b.r; vfx.dot.spawn({ x: b.x + Math.cos(a) * d, y: 0.02, z: b.z + Math.sin(a) * d, vy: rand(0.15, 0.3), life: rand(0.4, 0.8), size: rand(0.03, 0.06), color: '#e8fffc', alpha: 0.8, alpha1: 0 }); }
    if (Math.random() < dt * (0.8 + b.r * 0.4)) { const a = rand(0, TAU), d = Math.sqrt(Math.random()) * b.r; vfx.glow.spawn({ x: b.x + Math.cos(a) * d, y: rand(0.08, 0.5), z: b.z + Math.sin(a) * d, vx: rand(-0.12, 0.12), vy: rand(0.02, 0.08), vz: rand(-0.12, 0.12), life: rand(1.8, 3), size: rand(0.06, 0.1), color: '#7ff8f0', alpha: 0.85, alpha1: 0, fadeIn: 0.6, flicker: rand(3, 6) }); }
  }
  // the fishermen's braziers: a spark now and then
  for (const f of ks.fires) {
    if ((f.x - focus.x) ** 2 + (f.z - focus.z) ** 2 > 20 * 20 || Math.random() > dt * 4) continue;
    vfx.glow.spawn({ x: f.x + rand(-0.12, 0.12), y: f.y, z: f.z + rand(-0.12, 0.12), vy: rand(0.6, 1.1), life: 0.7, size: 0.16, size1: 0.02, color: '#ffb060', alpha: 0.9, alpha1: 0 });
  }
}
function finish(W) { return []; }

export const TIDEPOOL_KIT = {
  id: 'seaCave',
  floorGLSL: FLOOR, bossGLSL: ARENA, wallGLSL: WALL, floorPars: PARS,
  floorUniforms(W) { const s = seaOf(W); return { uSea: { value: s ? new THREE.Vector4(s.sx, s.sz, s.e, 1) : new THREE.Vector4(1, 0, 99, 0) } }; },
  // the face recedes into the sea-cut notch at the foot, then swells out into a heavy overhanging brow (0.62 m over the
  // room at 0.9 h) hung with kelp; behind it the rock heaves up (1.1 h → 1.3 h) before it drops away into the void
  profile: (h, D, j) => [[-0.34, -0.02, 'foot', 1], [-0.2 + j[0], 0.18 * h, 'rock', 1], [-0.1 + j[1], 0.42 * h, 'rock', 1], [-0.16 + j[2], 0.64 * h, 'rock', 1],
    [-0.34 + j[2], 0.8 * h, 'rock', 1], [-0.6 + j[2] * 0.6, 0.91 * h, 'rock', 1], [-0.6 + j[2] * 0.6, 0.91 * h, 'lip', 0], [-0.62, 0.99 * h, 'lip', 0], [-0.44, 1.06 * h, 'weed', 0],
    [-0.16, 1.1 * h, 'weed', 0], [-0.16, 1.1 * h, 'top', 3], [D * 0.5 + 0.2, 1.2 * h + j[3], 'top', 3], [D + 0.2, 1.3 * h + j[3] * 0.6, 'top', 3],
    [D + 0.2, 1.3 * h, 'topBack', 0], [D * 1.15 + 0.35, 0.55 * h, 'back', 0], [D * 1.25 + 0.45, -0.02, 'void', 0]],
  roles: { foot: ['#2e363a', '#343c40'], rock: ['#6c767c', '#788288'], lip: ['#4a4a2c', '#545432'], weed: ['#5a5430', '#646036'], top: ['#ffffff', '#f4f4f0'], topBack: ['#1e262a', '#242c30'], back: ['#0a1216', '#0e161a'] },
  wallH: [3.2, 0.9, 0.5], ds: 0.5, brush: 0.24,
  deco: { lush: 0.4, crack: 0, acc: 1.0, path: 1 }, sig: P.sig, cap: '#3e4a4e',
  init(W) { W.kitState = { drips: [], channels: [], pools: [], bubbles: [], fires: [], shafts: [], arenaPools: [] }; W.kitState.streams = W.kitState.channels; // (the look tools tour the 'streams')
    W.kitDecal = (...a) => kitDecal(W, ...a); W.arenaLanterns = []; },
  decoMap, dressWalls, buildProps, buildLights, buildShafts, buildCenterpieces, buildArena, buildLandmarks, buildDressing, finish, update,
  dispose(W) { disposePlacer(W); },
  purposes: ['shrine', 'wreck', 'nets', 'wedded', 'coral', 'drift', 'crabs'], dupes: ['shrine', 'coral'],
  rooms: ROOMS, extras, arrival, hoard, corridor,
  seal: { color: '#8ff4ff', rope: '#e4d098' }, // the arena seal's look (dungeon/zoneRun.js)
};
