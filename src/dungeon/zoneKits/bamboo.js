// Bamboo Depths: the bamboo shrine caves (docs/ZONES.md §8.2; ROADMAP Z-C1). Mossy stone caves under the Whispering
// Bamboo Grove: the grove's own assets (regions/assets/bambooFlora.js, bambooProps.js) dress them, so the dungeon
// reads as the same place gone underground.
//  - floor (shader): sage cave earth, old stone flags on the trodden runs and down the corridors (moss in the joints,
//    as the grove's trail), jade moss cushions with star flowers, fallen bamboo blades, damp hollows, a stream through
//    some chambers (decor b: dark wet banks, pebbles, clear running water), round stone plazas in the shrine and
//    treasure rooms; the arena: a ring of fitted stones round a moss lawn inlaid with the wind tomoe.
//  - walls: grey-green layered rock with chunky facets, seepage streaks and pale bamboo rhizomes, swelling out into a
//    heavy overhanging brow (moss tongues and hanging roots under it); above the brow the rock heaves up into the dark
//    (the cave goes on overhead), moss and ferns only along the brow, young culms leaning out of its cracks.
//  - light: a cool dim base, warm lantern pools, a few bright shafts falling through cracks in the roof (kit
//    buildShafts), and a dark, cool band along every wall foot (the rock overhead shades it).
//  - dressing: culms bursting out of the rock, shimenawa ropes with paper shide, lantern niches, seeps, moss curtains,
//    ferns, hostas and takenoko at the wall foot; stone lanterns (the room lights); rhizomes on the floor; along the
//    walls and in the corners, mid-scale clusters (root tangles, fallen bamboo, moss boulders, lantern groups, leaf
//    drifts), the middle of every chamber kept clear for the fight. Floor: bedrock shelves, root lines, leaf drifts.
//  - rooms: a hokora grotto or the ruined shrine, a bamboo thicket, a shishi-odoshi garden, a lantern walk, the charm
//    wall, a harvest camp, fallen culms; streams with stepping stones; the arrival framed by a torii; a treasure dais.
//  - the arena (Master Tengu's hollow): stone lanterns round the ring (world.arenaLanterns), a torii at the mouth, the
//    sacred rock in shimenawa, wind chimes, gohei, a broad shaft of light.
//  - ambience: falling bamboo leaves, fireflies over the moss, drips from the lips, mist on the streams, the clack of a
//    shishi-odoshi.
import * as THREE from 'three';
import { SH, M, MD, col } from '../dungeonWorld.js';
import { tube, puff, paint } from '../../gfx/geom.js';
import { mulberry32, clamp, TAU, rand } from '../../core/util.js';
import { Events } from '../../core/events.js';
import { makeToon } from '../../gfx/materials.js';
import * as F from '../../regions/assets/bambooFlora.js';
import * as Pr from '../../regions/assets/bambooProps.js';
import { CardSet, V, cols, UP } from '../../regions/assets/bambooKit.js';
import { G as BG, C as BC } from '../../world/buildings/kit.js';
import { roof } from '../../world/buildings/roofs.js';
import { shimenawa } from '../../world/buildings/props2.js';
import { rock as kitRock, mossyStone } from '../../world/buildings/props.js';
import { emaRack, omikuji } from '../../world/buildings/trim.js';
import { addPiece, placer, finishPlacer, disposePlacer, topSpan, topFade, grad, freeAt, glc as g, toCam, CAM, CAMX, CAMZ, CELL, decoAt, inStream, kitDecal, roofShafts, wallSpots } from './common.js';

// ------------------------------------------------------------------ palette (the grove's, a shade darker underground)
const P = {
  slabA: '#a8a494', slabB: '#c0bba8', jointA: '#46643a', jointB: '#5e7e44', mossDk: '#33602c', mossLt: '#5e8a40', mossHi: '#7ea452', mossSh: '#284c24',
  leafA: '#d6c070', leafB: '#c2a662', leafC: '#a6b458', leafD: '#e2d696', lantern: '#ffc27a', sig: '#d6ff9a',
};
const LEAF = { fresh: cols('#6fbe4c', '#82c856', '#96d262', '#5eae46', '#a8da6c'), young: cols('#8cd05c', '#9ed866', '#b0e072', '#7cc452', '#c0e67e') };
const CULM = ['#6cbf4a', '#7ccb56', '#5eb244', '#4f9a44', '#9ccc5c'];

// ------------------------------------------------------------------ floor shader
const FLOOR = /* glsl */`
  {
    // the cave earth: sage-grey soil with warm ochre and cool damp drifts and a fine grit
    float bigS = fbm(p * 0.045 + 11.0), bigT = vn(p * 0.022 + 3.0);
    c = mix(c, c * vec3(1.1, 1.0, 0.8), smoothstep(0.56, 0.8, bigS) * 0.55);
    c = mix(c, c * vec3(0.8, 0.9, 0.86), smoothstep(0.44, 0.2, bigS) * 0.55);
    c = mix(c, c * vec3(0.93, 1.05, 0.9), smoothstep(0.55, 0.82, bigT) * 0.4);
    c *= 0.93 + 0.1 * vn(p * 2.7 + 5.0);
    c = mix(c, c * vec3(0.92, 1.0, 1.02), 0.6); // cool cave shade
    // exposed bedrock: smooth grey shelves breaking through the earth, cracked, a dark rim where the soil meets them
    float shN = vn(p * 0.16 + 5.0) + (vn(p * 0.9 + 2.0) - 0.5) * 0.12;
    float shelf = smoothstep(0.71, 0.75, shN) * smoothstep(0.8, 1.8, wd);
    if (shN > 0.65) {
      vec2 bc; vec3 bvr = vor(p * 0.55 + 41.0, bc);
      vec3 bcol = mix(${g('#7c8078')}, ${g('#969890')}, bvr.z) * (0.9 + 0.1 * vn(p * 4.0));
      bcol *= 1.0 - smoothstep(0.05, 0.0, bvr.y) * step(0.5, h1(floor(p * 0.55 + 41.0))) * 0.22;
      c = mix(c, c * 0.72, smoothstep(0.65, 0.71, shN) * (1.0 - shelf) * 0.55);
      c = mix(c, bcol, shelf);
    }
    // the bare earth isn't bare: darker humus drifts, and grit and pebbles scattered in patches, each lit from the upper left
    c = mix(c, c * vec3(0.78, 0.85, 0.8), smoothstep(0.55, 0.78, vn(p * 0.12 + 8.0)) * 0.55);
    {
      vec2 gc; vec3 gv = vor(p * 3.1 + 61.0, gc);
      float gk = step(0.7, gv.z) * smoothstep(0.42, 0.68, vn(p * 0.22 + 33.0)) * smoothstep(0.6, 1.4, wd);
      float gs = smoothstep(0.2, 0.13, gv.x) * gk, gl = clamp(dot(normalize(-gc + 1e-4), vec2(0.54, 0.84)) * 0.5 + 0.5, 0.0, 1.0);
      c = mix(c, c * 0.7, smoothstep(0.26, 0.18, length(gc + vec2(0.03, -0.03))) * gk * 0.5);
      c = mix(c, mix(${g('#74766a')}, ${g('#a6a494')}, h1(floor(p * 3.1 + 61.0) + gv.z)) * (0.8 + 0.3 * gl), gs);
    }
    float sb = dc.b + (vn(p * 1.6 + 2.0) - 0.5) * 0.07;            // the stream (decor b)
    float bank = smoothstep(0.14, 0.34, sb), wat = smoothstep(0.42, 0.5, sb);
    // old stone flags on the trodden runs (decor g) and down the corridors, moss in the joints
    float tr = smoothstep(0.2, 0.62, dc.g + (vn(p * 1.1) - 0.5) * 0.3);
    float fk = max(tr, rid == 0 ? smoothstep(0.7, 1.7, wd) : 0.0) * (1.0 - bank);
    if (fk > 0.01) {
      vec2 tc; vec3 v = vor(p * 0.92 + 3.0, tc);
      float on = smoothstep(0.3, 0.38, fk + (v.z - 0.5) * 0.55);  // stones drop out one by one toward a run's rim
      float lit = clamp(dot(normalize(-tc + 1e-4), vec2(0.54, 0.84)) * 0.5 + 0.5, 0.0, 1.0);
      vec3 st = mix(${g(P.slabA)}, ${g(P.slabB)}, v.z) * (0.9 + 0.12 * vn(p * 5.0));
      st *= 0.92 + 0.14 * lit * smoothstep(0.0, 0.35, v.x);
      st = mix(st, st * vec3(0.86, 0.97, 0.82), smoothstep(0.52, 0.82, vn(p * 1.7 + v.z * 9.0)) * 0.55); // lichen bloom
      vec3 jc = mix(${g(P.jointA)}, ${g(P.jointB)}, vn(p * 2.3));
      vec3 flag = mix(jc, st, smoothstep(0.02, 0.065, v.y));
      c = mix(c, c * 0.76, smoothstep(0.0, 0.25, fk) * (1.0 - on) * 0.3);
      c = mix(c, flag, on);
    }
    // jade moss cushions (decor r): a shade at the rim, then dappled moss; star flowers and clover in them (decor a)
    float lu = smoothstep(0.26, 0.6, dc.r + (fbm(p * 0.7 + 4.0) - 0.5) * 0.5) * (1.0 - wat);
    if (lu > 0.001) {
      float g1 = fbm(p * 0.95 + 9.0);
      vec3 mc = mix(${g(P.mossDk)}, ${g(P.mossLt)}, smoothstep(0.25, 0.75, g1));
      vec2 gc; vec3 gv = vor(p * 4.4 + 9.0, gc);
      float ga = gv.z * 31.0, gcs = cos(ga), gsn = sin(ga); vec2 gq = vec2(gcs * gc.x - gsn * gc.y, gsn * gc.x + gcs * gc.y);
      float dab = smoothstep(1.0, 0.25, length(gq / vec2(0.36, 0.16)));
      mc = mix(mc, gv.z > 0.55 ? ${g(P.mossHi)} : ${g(P.mossSh)}, dab * 0.3);
      // cushions: a soft height field lit from the upper left, so the moss reads as velvet humps, not paint
      float hc = fbm(p * 0.62 + 21.0), hx = fbm(p * 0.62 + vec2(21.14, 21.0)) - hc, hz = fbm(p * 0.62 + vec2(21.0, 21.14)) - hc;
      mc *= 0.95 + clamp((-hx * 0.54 - hz * 0.84) * 9.0, -0.14, 0.18);
      mc *= 0.92 + 0.12 * vn(p * 13.0);
      float lob = lu - (vn(p * 3.1 + 7.0) - 0.5) * 0.22; // a ragged, lobed rim
      c = mix(c, c * 0.66, smoothstep(0.08, 0.26, lob) * (1.0 - smoothstep(0.26, 0.44, lob)) * 0.7);
      c = mix(c, mc, smoothstep(0.26, 0.4, lob));
      float fa = smoothstep(0.2, 0.6, dc.a) * smoothstep(0.35, 0.7, lu);
      if (fa > 0.01) {
        vec2 fc = floor(p * 3.6); vec2 fo2 = fract(p * 3.6) - 0.5 - (h2(fc + 3.0) - 0.5) * 0.55; float fh2 = h1(fc + 17.0);
        float has = step(0.55, fh2) * fa;
        vec3 fcol = fh2 > 0.86 ? ${g('#fff8f0')} : fh2 > 0.72 ? ${g('#fff2a0')} : ${g('#eef2ff')};
        float fr = length(fo2), pet = smoothstep(0.12, 0.08, fr * (1.0 + 0.35 * cos(atan(fo2.y, fo2.x) * 5.0)));
        c = mix(c, c * 0.72, smoothstep(0.16, 0.1, length(fo2 - vec2(0.03, -0.03))) * has * 0.5);
        c = mix(c, fcol, pet * has);
        c = mix(c, ${g('#ffc83a')}, smoothstep(0.035, 0.018, fr) * has);
      }
    }
    // fallen bamboo blades, drifting toward the walls
    {
      vec2 lc; vec3 lv = vor(p * 2.2 + 31.0, lc);
      float lp = step(0.86 - smoothstep(2.6, 0.8, wd) * 0.16 - tr * 0.04, lv.z) * (1.0 - bank) * step(0.7, wd);
      if (lp > 0.0) {
        float la = lv.z * 71.0, cs = cos(la), sn = sin(la); vec2 q = vec2(cs * lc.x - sn * lc.y, sn * lc.x + cs * lc.y);
        float hh = h1(vec2(lv.z * 37.0, 5.0));
        vec3 lcol = hh < 0.42 ? ${g(P.leafA)} : hh < 0.7 ? ${g(P.leafB)} : hh < 0.9 ? ${g(P.leafC)} : ${g(P.leafD)};
        float w = 0.05 * (1.0 - abs(q.x) / 0.24) + 0.004;
        float leaf = step(abs(q.x), 0.24) * smoothstep(w, w * 0.6, abs(q.y));
        c = mix(c, c * 0.78, step(abs(q.x - 0.02), 0.25) * smoothstep(w * 1.6, w * 0.9, abs(q.y + 0.025)) * lp * 0.45);
        c = mix(c, lcol * (0.9 + 0.2 * smoothstep(-0.03, 0.03, q.y)), leaf * lp);
        c = mix(c, lcol * 0.74, leaf * lp * smoothstep(0.006, 0.0, abs(q.y)) * 0.6);
      }
    }
    // leaf drifts banked against the wall foot
    {
      float df = (1.0 - smoothstep(0.55, 1.5, wd + (vn(p * 0.7) - 0.5) * 0.6)) * smoothstep(0.35, 0.6, vn(p * 0.33 + 17.0)) * (1.0 - bank);
      vec2 dq = floor(p * 9.0); float dh = h1(dq);
      c = mix(c, mix(${g('#7a6440')}, ${g('#b89a5c')}, dh) * (0.85 + 0.2 * h1(dq + 3.0)), df * 0.85);
    }
    // damp hollows and little puddles that catch the light
    // (small and scattered: a low-frequency field once flooded whole rooms in a pale sheet; now ~1-3 m pools, only in
    // some parts of the floor)
    float pn = vn(p * 0.34 + 41.0) + (vn(p * 1.6 + 3.0) - 0.5) * 0.05, away = smoothstep(1.6, 2.6, wd) * (1.0 - tr * 0.8) * (1.0 - bank) * smoothstep(0.5, 0.62, vn(p * 0.045 + 7.0));
    float wet = smoothstep(0.76, 0.81, pn) * away, pud = smoothstep(0.81, 0.825, pn) * away;
    { float pw2 = vn(p * 0.6 + 77.0), foot = (1.0 - smoothstep(0.7, 1.5, wd)) * (1.0 - bank); // and pools along the wall foot, under the drips
      wet = max(wet, smoothstep(0.76, 0.82, pw2) * foot); pud = max(pud, smoothstep(0.82, 0.84, pw2) * foot); }
    c = mix(c, c * 0.66, wet * 0.7);
    vec3 pw = mix(${g('#3e6e66')}, ${g('#8cc8b8')}, smoothstep(0.83, 0.95, pn) * 0.5 + vn(p * 0.8 + uTime * 0.05) * 0.3);
    c = mix(c, pw, pud);
    fG += ${g('#c8fff0')} * (twinkle(p, 3.2, 0.7) * pud * 2.0 + pud * 0.05);
    // the stream: dark wet banks with pebbles, then clear running water over a stony bed
    if (bank > 0.001) {
      vec2 pc; vec3 pv = vor(p * 3.3 + 17.0, pc);
      float peb = smoothstep(0.17, 0.11, pv.x) * step(0.4, pv.z);
      float plit = clamp(dot(normalize(-pc + 1e-4), vec2(0.54, 0.84)) * 0.5 + 0.5, 0.0, 1.0);
      vec3 pcol = mix(${g('#b6b2a2')}, ${g('#868a7a')}, pv.z) * (0.82 + 0.26 * plit);
      c = mix(c, c * vec3(0.6, 0.68, 0.64), bank * 0.8);
      c = mix(c, pcol, peb * bank * (1.0 - wat) * 0.9);
      if (wat > 0.0) {
        vec2 fl = p * 0.9 + vec2(uTime * 0.33, uTime * 0.21);
        float rip = vn(fl * 1.7) * 0.6 + vn(fl * 3.9 + 3.0) * 0.4;
        vec3 bed = mix(pcol * vec3(0.7, 0.85, 0.82), ${g('#2c6a60')}, 0.55 - peb * 0.3);
        vec3 w = mix(bed, mix(${g('#2e7a6c')}, ${g('#74c4ac')}, rip), 0.5);
        w = mix(w, ${g('#1e5850')}, smoothstep(0.62, 0.95, sb) * 0.45); // deeper down the middle
        float caus = smoothstep(0.035, 0.0, abs(vn(fl * 2.4 + 7.0) - 0.5)) * smoothstep(0.35, 0.75, vn(fl * 0.7 + 3.0));
        w = mix(w, ${g('#c8f4e4')}, caus * 0.3);
        float edge = smoothstep(0.42, 0.47, sb) * (1.0 - smoothstep(0.47, 0.56, sb));
        w = mix(w, ${g('#f4fffa')}, edge * (0.55 + 0.25 * sin(uTime * 3.0 + p.x * 2.0 + p.y)));
        c = mix(c, w, wat);
        fG += ${g('#c8fff0')} * (twinkle(p + vec2(uTime * 0.3, 0.0), 3.6, 0.7) * wat * 1.4 + caus * wat * 0.06);
      }
    }
    // the shrine and treasure rooms: a round plaza of fitted stones at the room's heart
    if (rid > 0) {
      vec4 R = uRoom[rid - 1]; vec4 K = uRoomK[rid - 1];
      if (K.x > 3.5 && K.x < 5.5) {
        vec2 ctr = (R.xy + R.zw) * 0.5; float rr = clamp(min(R.z - R.x, R.w - R.y) * 0.5 - 3.0, 1.6, 4.6);
        vec2 d0 = p - ctr; float r0 = length(d0), a0 = atan(d0.y, d0.x);
        if (r0 < rr + 1.0) {
          float ci = floor(r0 / 0.9), rad = (ci + 0.5) * 0.9, ns = max(1.0, floor(6.28318 * rad / 1.05)), off = h1(vec2(ci, 2.0));
          float uu = (a0 / 6.28318 + 0.5 + off) * ns, sj = floor(uu), fr = fract(r0 / 0.9), arc = min(fract(uu), 1.0 - fract(uu)) * 6.28318 * rad / ns;
          float gap = smoothstep(0.0, 0.07, min(fr, 1.0 - fr) * 0.9) * smoothstep(0.0, 0.06, arc);
          vec3 sc = mix(${g(P.slabA)}, ${g(P.slabB)}, h1(vec2(ci, sj))) * (0.92 + 0.1 * vn(p * 5.0));
          if (ci < 0.5) { sc = mix(${g(P.slabB)}, vec3(1.0, 0.96, 0.88), 0.3); gap = 1.0; }
          float inP = smoothstep(rr + 0.4, rr, r0);
          c = mix(c, c * 0.72, smoothstep(rr + 0.9, rr + 0.3, r0) * (1.0 - inP) * 0.5);
          c = mix(c, mix(mix(${g(P.jointA)}, ${g(P.jointB)}, vn(p * 2.0)), sc, gap), inP);
        }
      }
    }
    // the cave closes in: a cool, dark band along every wall foot (the rock overhead shades it), the glows muted there
    float encl = smoothstep(0.5, 2.6, wd);
    c *= mix(vec3(0.42, 0.5, 0.55), vec3(1.0), encl);
    fG *= 0.45 + 0.55 * encl;
  }
`;
// the arena: a ring of fitted stones round a moss lawn inlaid with the tengu's wind tomoe (three commas chasing round
// the centre), a dotted circle, all breathing with the sigil colour; uSigDim < 1 sinks it while the boss winds up
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
      sc = mix(sc, sc * vec3(0.86, 0.97, 0.82), smoothstep(0.55, 0.85, vn(p * 1.3 + ci)) * 0.5);
      vec3 ring = mix(mix(${g(P.jointA)}, ${g(P.jointB)}, vn(p * 2.0)), sc, gap);
      c = mix(c, ring, inRing);
      float lawn = 1.0 - smoothstep(r0 - 0.1, r0 + 0.05, r);
      vec3 mc = mix(${g(P.mossDk)}, ${g(P.mossLt)}, smoothstep(0.3, 0.75, fbm(p * 0.9 + 9.0))) * (0.92 + 0.12 * vn(p * 11.0));
      c = mix(c, c * 0.7, smoothstep(r0 + 0.5, r0 - 0.1, r) * smoothstep(r0 - 1.2, r0 - 0.2, r) * 0.6);
      c = mix(c, mc * 0.86, lawn * 0.92);
      // the wind tomoe: three commas of pale stone set in the moss (a filled inlay with a crisp edge), two rings round it,
      // and a ring of round stones near the lawn's rim
      float Rt = min(4.5, r0 * 0.35), fillT = 0.0, edgeT = 0.0;
      for (int k = 0; k < 3; k++) {
        float th = float(k) * 2.0944 + 0.6;
        vec2 hc = vec2(cos(th), sin(th)) * Rt * 0.42; float hr = Rt * 0.27;
        float sd = length(d - hc) - hr;
        float da = mod(th - a + 12.56637, 6.28318), t = da / 2.4;
        if (t < 1.0 && t > 0.0) sd = min(sd, abs(r - Rt * (0.42 + t * 0.5)) - hr * (1.0 - t) * 0.92);
        fillT = max(fillT, smoothstep(0.03, -0.03, sd));
        edgeT = max(edgeT, smoothstep(0.09, 0.03, abs(sd)));
      }
      float circ = smoothstep(0.06, 0.0, abs(r - Rt * 1.12) - 0.05) + smoothstep(0.05, 0.0, abs(r - Rt * 1.22) - 0.03);
      vec2 dq = vec2((fract(a / 6.28318 * 44.0) - 0.5) * r * 6.28318 / 44.0, r - (r0 - 1.0));
      float dots = smoothstep(0.17, 0.11, length(dq));
      float sig = max(max(edgeT, circ), dots) * lawn, fill = fillT * lawn * (1.0 - 0.45 * smoothstep(0.55, 0.8, fbm(p * 1.3 + 4.0))); // (moss creeping over the old stone)
      float pulse = 0.6 + 0.4 * sin(uTime * 1.6 - r * 0.3);
      vec3 stoneI = mix(${g(P.slabA)}, ${g(P.slabB)}, vn(p * 3.0)) * (0.92 + 0.08 * vn(p * 9.0));
      vec3 sigC = mix(c * 0.8, mix(stoneI, uSig, 0.25), 0.35 + 0.65 * uSigDim);
      c = mix(c, stoneI * 0.84, fill * 0.74);
      c = mix(c, c * 0.6, smoothstep(0.0, 0.6, edgeT * lawn) * (1.0 - fill) * 0.35);
      c = mix(c, sigC, sig * (0.45 + 0.35 * uSigDim));
      c *= 1.0 - (1.0 - uSigDim) * 0.18 * lawn;
      fG += uSig * (sig * 0.22 + fill * 0.04) * pulse * uSigDim * uSigDim;
    }
  }
`;
// ------------------------------------------------------------------ wall shader (kind 1: rock face, 3: the top)
const WALL = /* glsl */`
    if (vWall.z > 2.5) { // above the brow: dark wet boulders heaving up into the dark (the cave goes on overhead), moss and
      // fern beds only along the brow, a wet glint in the cracks; it fades toward the back as the rock rises out of sight
      vec2 p = vCWorld.xz; float o = vWall.y, Dd = max(vWall.w, 0.6);
      vec2 q = p * 0.75 + uSeed; vec2 qi = floor(q), qf = fract(q); float md = 8.0, md2 = 8.0; vec2 mc = vec2(0.0), mr = vec2(0.0);
      for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) { vec2 gg = vec2(float(i), float(j)); vec2 rr = gg + h2(qi + gg) * 0.85 + 0.075 - qf; float dd = dot(rr, rr); if (dd < md) { md2 = md; md = dd; mc = qi + gg; mr = rr; } else if (dd < md2) md2 = dd; }
      float edge = sqrt(md2) - sqrt(md), bh = h1(mc + uSeed);
      vec3 c = mix(${g('#545c52')}, ${g('#727a6c')}, bh) * (0.9 + 0.12 * vn(p * 3.0));
      float lit = clamp(dot(normalize(-mr + 1e-4), vec2(0.54, 0.84)) * 0.5 + 0.5, 0.0, 1.0);
      c *= 0.8 + 0.3 * lit * smoothstep(0.0, 0.5, edge);
      c *= 1.0 - smoothstep(0.1, 0.0, edge) * 0.5;
      wG += ${g('#9ef0d8')} * smoothstep(0.05, 0.0, edge) * twinkle(p * 1.3, 2.4, 0.86) * 0.35;
      float mb = smoothstep(0.85, 0.1, o + (fbm(p * 0.9 + 3.0) - 0.5) * 0.9) * smoothstep(0.3, 0.6, fbm(p * 1.3 + uSeed));
      vec3 mcol = mix(${g('#2c4e26')}, ${g('#5a8a3e')}, smoothstep(0.3, 0.8, fbm(p * 2.2))) * (0.9 + 0.14 * vn(p * 9.0));
      c = mix(c, mcol, mb * 0.85);
      c *= mix(1.0, 0.3, smoothstep(0.1, Dd + 0.3, o));
      diffuseColor.rgb *= c * 1.12;
    } else if (vWall.z > 0.5 && vWall.z < 1.5) { // the rock face
      float u = vWall.x, v = vWall.y, lip = vWall.w * 0.9;
      diffuseColor.rgb *= mix(1.0, 0.74, smoothstep(0.62, 0.88, v / max(vWall.w, 0.1))); // in the brow's shadow
      // layered grey-green stone: tilted strata with a colour drift along the face
      float wv = v * 1.2 + u * 0.08 + (vn(vec2(u * 0.15, 3.0)) - 0.5) * 0.8;
      float bi = floor(wv), bf = fract(wv), bh = h1(vec2(bi, uSeed + 7.0));
      vec3 st = bh < 0.34 ? vec3(1.06, 1.04, 0.94) : bh < 0.67 ? vec3(0.86, 0.93, 0.88) : vec3(1.12, 1.1, 1.0);
      diffuseColor.rgb *= mix(vec3(1.0), st, 0.7);
      diffuseColor.rgb *= 1.0 - smoothstep(0.06, 0.0, min(bf, 1.0 - bf)) * 0.22;
      diffuseColor.rgb *= mix(vec3(0.95, 0.98, 1.0), vec3(1.05, 1.02, 0.92), smoothstep(0.3, 0.7, vn(vec2(u * 0.07, 1.0))));
      // chunky blocks: a voronoi of big facets, each its own tone, a dark crack between and a lit top edge
      {
        vec2 q = vec2(u * 0.85, v * 1.25); vec2 qi = floor(q), qf = fract(q); float md = 8.0, md2 = 8.0; vec2 mc = vec2(0.0), mr = vec2(0.0);
        for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) { vec2 gg = vec2(float(i), float(j)); vec2 rr = gg + h2(qi + gg) * 0.85 + 0.075 - qf; float dd = dot(rr, rr); if (dd < md) { md2 = md; md = dd; mc = qi + gg; mr = rr; } else if (dd < md2) md2 = dd; }
        float edge = sqrt(md2) - sqrt(md);
        diffuseColor.rgb *= 0.88 + 0.18 * h1(mc + uSeed);
        diffuseColor.rgb *= 1.0 - smoothstep(0.09, 0.0, edge) * 0.34;
        diffuseColor.rgb *= 1.0 + smoothstep(0.12, 0.02, edge) * step(0.0, -mr.y) * 0.12;
      }
      // wet seepage streaks running down the face
      float sk = smoothstep(0.62, 0.82, vn(vec2(u * 1.7, 2.0))) * smoothstep(lip, lip * 0.2, v);
      diffuseColor.rgb *= 1.0 - sk * 0.32 * (0.6 + 0.4 * vn(vec2(u * 6.0, v * 0.8)));
      wG += ${g('#9ef0d8')} * sk * twinkle(vec2(u * 2.0, v * 3.0 + uTime * 0.6), 3.0, 0.9) * 0.9;
      // moss on the ledges (upper faces of the strata)
      float ledge = smoothstep(0.08, 0.0, bf) * step(0.45, h1(vec2(bi, 9.0 + uSeed))) * smoothstep(0.3, 0.9, v);
      diffuseColor.rgb = mix(diffuseColor.rgb, ${g('#6e9e48')} * (0.86 + 0.24 * vn(vec2(u * 3.0, v * 4.0))), ledge * 0.8);
      // pale bamboo rhizomes threading down from the lip, node rings and all
      float ru = u * 0.8 + sin(v * 2.2 + h1(vec2(floor(u * 0.8), 4.0)) * 6.0) * 0.14, rc = floor(ru);
      float rlen = 0.5 + h1(vec2(rc, 8.0)) * 1.4, root = step(0.7, h1(vec2(rc, 2.0 + uSeed))) * step(lip - v, rlen) * step(v, lip);
      root *= smoothstep(0.075, 0.035, abs(fract(ru) - 0.5)) * smoothstep(rlen, rlen * 0.6, lip - v);
      vec3 rcol = mix(${g('#a88e60')}, ${g('#dcc490')}, smoothstep(-0.04, 0.04, fract(ru) - 0.5));
      rcol *= 1.0 - step(0.88, fract((lip - v) * 3.0)) * 0.35;
      diffuseColor.rgb = mix(diffuseColor.rgb, rcol, root * 0.92);
      // moss tongues hanging from the lip: a solid band right under it, then rounded drips of varied length
      float dv = lip - v;
      if (dv < 1.1) {
        float cu = u / 0.21, ci = floor(cu), fx = fract(cu) - 0.5;
        float len = (0.1 + 0.7 * h1(vec2(ci, 5.0) + uSeed)) * step(0.28, h1(vec2(ci, 11.0)));
        float t = clamp(dv / max(len, 1e-3), 0.0, 1.0), wdt = mix(0.5, 0.15, t * t);
        float drip = step(dv, len) * smoothstep(wdt, wdt - 0.09, abs(fx));
        drip = max(drip, smoothstep(0.12 + 0.06 * sin(u * 3.0), 0.02, dv));
        vec3 mc2 = mix(${g('#3e7030')}, ${g('#8cba58')}, smoothstep(0.0, 0.35, 1.0 - dv / max(len, 0.1)) * 0.7 + h1(vec2(ci, 2.0)) * 0.3);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.72, smoothstep(0.0, 0.06, dv - len) * (1.0 - smoothstep(0.06, 0.14, dv - len)) * step(0.28, h1(vec2(ci, 11.0))) * 0.6);
        diffuseColor.rgb = mix(diffuseColor.rgb, mc2, drip * step(dv, 1.05));
      }
      // lichen speckles, and a damp darker foot
      vec2 lq = vec2(u, v) * 5.0; vec2 lqi = floor(lq); float lch = h1(lqi + 3.0 + uSeed);
      diffuseColor.rgb = mix(diffuseColor.rgb, ${g('#c8d48a')}, step(0.92, lch) * smoothstep(0.24, 0.12, length(fract(lq) - 0.5)) * 0.6);
      diffuseColor.rgb *= mix(0.68, 1.0, smoothstep(0.0, 0.42, v));
    }`;

// ------------------------------------------------------------------ cached kit pieces (world/buildings Builder)
const cache = new Map();
const cached = (k, fn) => { if (!cache.has(k)) cache.set(k, fn()); return cache.get(k); };
const MOSS = '#74a852', MOSS_HI = '#a6cc68';
// a bamboo pole a -> b with node rings (kit geometry)
function pole(B, a, b, r, color = '#8cbf5a', node = '#5e8e42') {
  B.add(tube([{ p: a, r }, { p: b, r: r * 0.95 }], 6, false), (p, n, o) => o.set(color).multiplyScalar(0.88 + 0.16 * clamp(n.y + 0.5)));
  const d = b.clone().sub(a).normalize(), nn = Math.max(1, Math.round(a.distanceTo(b) / 0.36));
  for (let k = 1; k < nn; k++) { const q = a.clone().lerp(b, k / nn), t = BG.torus(r * 1.02, r * 0.18, 3, 7); t.lookAt(d); t.translate(q.x, q.y, q.z); B.add(t, node); }
}
/** a little hokora: a stone plinth, a wooden shrine box with lattice doors, a mossy gable roof, shimenawa, an offering
 *  box and two round stone fox guardians in red bibs (local +z faces the visitor) */
function hokora(seed = 0) {
  return cached('hokora:' + seed, () => Pr.kit(seed * 13 + 5, B => {
    const base = BG.box(1.5, 0.32, 1.2, 0.05); base.translate(0, 0.16, 0); B.add(base, (p, n, o) => { o.set('#aaa4a8').multiplyScalar(n.y > 0.5 ? 1 : 0.84); if (n.y > 0.5 && Math.sin(p.x * 7 + p.z * 5) > 0.4) o.lerp(col(MOSS), 0.6); });
    const st = BG.box(1.0, 0.12, 0.3, 0.03); st.translate(0, 0.06, 0.74); B.add(st, '#9c96a0');
    B.at([0, 0.32, -0.05], 0, () => {
      const box = BG.box(0.86, 0.8, 0.7, 0.03); box.translate(0, 0.4, 0); B.add(box, (p, n, o) => o.set('#94704e').multiplyScalar(0.86 + 0.14 * Math.sin(p.x * 30) * 0.5 + 0.07));
      for (const sx of [-1, 1]) { const d = BG.box(0.36, 0.56, 0.03, 0.01); d.translate(sx * 0.2, 0.38, 0.36); B.add(d, '#4a3228'); for (let k = 0; k < 4; k++) { const l = BG.box(0.34, 0.018, 0.02, 0); l.translate(sx * 0.2, 0.16 + k * 0.14, 0.38); B.add(l, '#d8b484'); } }
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const p = BG.box(0.07, 0.86, 0.07, 0.01); p.translate(sx * 0.43, 0.43, sz * 0.35); B.add(p, '#6a4a3a'); }
      roof(B, { type: 'gable', w: 0.94, d: 0.78, y0: 0.82, over: 0.3, gOver: 0.24, H: 0.46, curve: 0.3, lift: 0.08, liftW: 0.36, thick: 0.08, ribW: 0.22, color: '#5f7466', moss: 0.75, mossColor: '#72a64e', pastel: 0.05 });
      shimenawa(B, { w: 0.82, y: 0.78, sag: 0.07, z: 0.42, r: 0.028 });
      const ob = BG.box(0.42, 0.2, 0.24, 0.02); ob.translate(0, 0.1, 0.62); B.add(ob, '#7a5a44');
      for (let k = 0; k < 4; k++) { const s = BG.box(0.38, 0.02, 0.022, 0); s.translate(0, 0.21, 0.54 + k * 0.05); B.add(s, '#4a3228'); }
      const bell = BG.sph(0.06, 8, 6); bell.translate(0, 0.94, 0.5); B.add(bell, BC.gold);
      const rope = BG.cyl(0.012, 0.012, 0.5, 4); rope.translate(0.05, 0.62, 0.52); B.add(rope, '#e84a3a');
    });
    for (const sx of [-1, 1]) B.at([sx * 0.95, 0, 0.5], -sx * 0.3, () => { // round stone foxes with red bibs
      const pl = BG.box(0.32, 0.24, 0.32, 0.04); pl.translate(0, 0.12, 0); B.add(pl, '#9a949c');
      const s = '#d0c8c4', body = BG.sph(0.14, 10, 8); body.scale(0.9, 1.15, 0.9); body.translate(0, 0.38, 0); B.add(body, s);
      const head = BG.sph(0.1, 10, 8); head.translate(0, 0.6, 0.03); B.add(head, s);
      const sn = BG.cone(0.05, 0.13, 8); sn.rotateX(Math.PI / 2); sn.translate(0, 0.58, 0.14); B.add(sn, s);
      for (const e of [-1, 1]) { const ear = BG.cone(0.04, 0.12, 6); ear.rotateZ(-e * 0.25); ear.translate(e * 0.06, 0.72, 0.01); B.add(ear, s); }
      const bib = BG.cone(0.12, 0.12, 10); bib.rotateX(Math.PI); bib.scale(1, 1, 0.7); bib.translate(0, 0.47, 0.05); B.add(bib, BC.red);
    });
    B.light([0, 0.9, 0.55], { color: '#ffd8a0', intensity: 1.2, radius: 4, flicker: 0.4, nightOnly: false });
  }, 0.02));
}
/** a shimenawa rope with paper shide strung along local x between two wooden pegs (for a rock face; local +z = out) */
function shideRope(L, seed = 0) {
  const k = Math.round(L * 4) / 4;
  return cached(`shide:${k}:${seed}`, () => Pr.kit(seed * 3 + 1, B => {
    shimenawa(B, { w: k, y: 0, sag: 0.18 + k * 0.03, z: 0.06, r: 0.042 });
    for (const sx of [-1, 1]) { const p = BG.cyl(0.035, 0.03, 0.26, 6); p.rotateX(Math.PI / 2); p.translate(sx * k / 2, 0.02, -0.02); B.add(p, '#6a4a34'); }
  }, 0.01));
}
/** stacked cut culms on two crossbars (the harvest camp) */
function culmStack(seed = 0) {
  return cached('stack:' + seed, () => Pr.kit(seed * 7 + 2, B => {
    const r = mulberry32(seed * 31 + 9);
    for (const x of [-0.6, 0.6]) { const b = BG.box(0.1, 0.12, 0.7, 0.02); b.translate(x, 0.06, 0); B.add(b, '#7a5a40'); }
    const rows = [[5, 0.13], [4, 0.33], [3, 0.53]];
    for (const [n, y] of rows) for (let i = 0; i < n; i++) {
      const z = (i - (n - 1) / 2) * 0.17 + (r() - 0.5) * 0.02, rr = 0.075 + r() * 0.012, L = 1.55 + r() * 0.3, c = CULM[Math.floor(r() * CULM.length)];
      pole(B, V(-L / 2, y, z), V(L / 2, y, z), rr, c, '#5a8a40');
      for (const sx of [-1, 1]) { const e = BG.disc(rr, 8); e.rotateY(sx * Math.PI / 2); e.translate(sx * L / 2, y, z); B.add(e, '#e8e0a8'); }
    }
    const rope = BG.torus(0.3, 0.02, 4, 12); rope.rotateY(Math.PI / 2); rope.translate(0.2, 0.33, 0); rope.scale(1, 1.25, 1); B.add(rope, '#d8c08a');
  }, 0.01));
}
/** a woven basket heaped with takenoko shoots */
function shootBasket(seed = 0) {
  return cached('basket:' + seed, () => Pr.kit(seed * 5 + 3, B => {
    const r = mulberry32(seed * 17 + 3);
    const bk = BG.lathe([[0.001, 0], [0.26, 0], [0.33, 0.12], [0.36, 0.3], [0.33, 0.32], [0.31, 0.14], [0.22, 0.04], [0.001, 0.04]], 12);
    B.add(bk, (p, n, o) => { o.set('#c8a468').multiplyScalar(0.84 + 0.18 * (Math.sin(p.y * 70) > 0 ? 1 : 0) * (Math.sin(Math.atan2(p.z, p.x) * 18) > 0 ? 1 : 0.6)); });
    const rim = BG.torus(0.345, 0.025, 4, 14); rim.rotateX(Math.PI / 2); rim.translate(0, 0.31, 0); B.add(rim, '#a8844e');
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * TAU + r(), d = i ? 0.16 : 0, h = 0.22 + r() * 0.1;
      const s = BG.cone(0.075, h, 8); s.rotateZ((r() - 0.5) * 0.5); s.translate(Math.cos(a) * d, 0.3 + h / 2, Math.sin(a) * d);
      B.add(s, (p, n, o) => o.set('#b08452').lerp(col('#c8c068'), clamp((p.y - 0.3) / h * 1.4 - 0.4)).multiplyScalar(0.86 + 0.2 * clamp(n.y + 0.4)));
    }
  }, 0.01));
}
/** a gohei: a wooden wand on a stone foot with zigzag paper streamers */
function gohei(seed = 0, h = 1.5) {
  return cached(`gohei:${seed}:${h}`, () => Pr.kit(seed * 11 + 4, B => {
    const ft = BG.cyl(0.14, 0.18, 0.12, 8); ft.translate(0, 0.06, 0); B.add(ft, '#9a949c');
    const st = BG.cyl(0.02, 0.025, h, 5); st.translate(0, h / 2 + 0.08, 0); B.add(st, '#c8a878');
    for (const sx of [-1, 1]) for (let j = 0; j < 4; j++) { const pl = BG.plane(0.08, 0.11); pl.translate(sx * (0.05 + (j % 2) * 0.025), h - 0.02 - j * 0.1, 0); B.cloth(pl, '#ffffff', { x0: -0.1, x1: 0.1, yTop: h + 0.05, yBot: h - 0.45 }); }
  }, 0.005));
}
/** a mossy standing stone with an ofuda charm pasted on its face */
function stoneMarker(seed = 0) {
  return cached('marker:' + seed, () => Pr.kit(seed * 19 + 6, B => {
    const g0 = puff(V(0, 0.42, 0), 0.34, { detail: 2, noise: 0.24, squash: 1.0, seed: seed + 3 }); g0.scale(0.8, 1.6, 0.6); g0.translate(0, -0.3, 0);
    B.add(g0, (p, n, o) => { o.set('#aaa6a0').multiplyScalar(0.84 + 0.18 * clamp(n.y + 0.5)); if (n.y > 0.35 && Math.sin(p.x * 11 + p.z * 9) > -0.2) o.lerp(col(MOSS), 0.7); });
    const of = BG.plane(0.11, 0.3); of.translate(0, 0.42, 0.22); B.add(of, (p, n, o) => { o.set('#fffaf0'); if (Math.abs(p.x) < 0.02 && Math.abs(p.y - 0.42) < 0.11) o.set('#c8403a'); });
    for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + 0.4, m = puff(V(Math.cos(a) * 0.3, 0.03, Math.sin(a) * 0.24), 0.08 + k * 0.01, { detail: 1, noise: 0.4, squash: 0.45, seed: seed + k }); B.add(m, MOSS); }
  }, 0.01));
}

/** a mossy rock pillar: three lumpy stones stacked off-true, thick moss on every ledge, a young culm leaning on it */
function rockPillar(seed = 0) {
  return cached('pillar:' + seed, () => Pr.kit(seed * 29 + 7, B => {
    const r = mulberry32(seed * 41 + 5);
    let y = 0, x = 0, z = 0, k = 0;
    for (const [R, sq] of [[0.85, 0.75], [0.62, 0.95], [0.42, 1.1]]) {
      const g0 = puff(V(x, y + R * sq * 0.8, z), R, { detail: 2, noise: 0.3, squash: sq, seed: seed * 3 + k++ });
      B.add(mossyStone(g0, { amt: 0.62, sc: 2 / R, seed: seed + k, lift: R * 0.06, stone: ['#868a7c', '#b8b8a6'], moss: '#557e3e', hi: '#8ab05a' }), null);
      y += R * sq * 1.45; x += (r() - 0.5) * 0.25; z += (r() - 0.5) * 0.25;
    }
    pole(B, V(0.55, -0.05, 0.3), V(0.85, 2.6, 0.55), 0.05, '#7cc456');
    for (let q = 0; q < 5; q++) { const a = r() * TAU, m = puff(V(Math.cos(a) * 0.9, 0.05, Math.sin(a) * 0.9), 0.14 + r() * 0.1, { detail: 1, noise: 0.4, squash: 0.45, seed: seed + q }); B.add(m, (p, n, o) => o.set(MOSS).lerp(col(MOSS_HI), clamp(n.y) * 0.4)); }
  }, 0.02));
}

/** a tangle of old roots (a thick dark tree root, pale bamboo rhizomes) spilling out of the wall foot; local -z = the wall */
function rootTangle(seed = 0) {
  return cached('roots:' + seed, () => Pr.kit(seed * 23 + 9, B => {
    const r = mulberry32(seed * 53 + 1), m = 4 + Math.floor(r() * 3);
    for (let i = 0; i < m; i++) {
      const x0 = (r() - 0.5) * 1.6, len = 1.0 + r() * 1.5, side = (r() - 0.5) * 1.6, thick = i === 0, R = (thick ? 0.12 : 0.05) + r() * 0.04;
      const pts = [];
      for (let k = 0; k <= 6; k++) { const t = k / 6; pts.push({ p: V(x0 + side * t * t + Math.sin(t * 5 + i) * 0.12, (thick ? 0.5 : 0.3) * (1 - t) * (1 - t) + 0.035 + Math.sin(t * Math.PI) * 0.05, -0.2 + t * len), r: R * (1 - t * 0.75) }); }
      B.add(tube(pts, thick ? 7 : 5, true), (p, n, o) => o.set(thick ? '#5e4836' : '#a08458').lerp(col(thick ? '#86684c' : '#d2ba88'), clamp(n.y * 0.6 + 0.3)).multiplyScalar(0.86 + 0.16 * Math.sin(p.z * 9 + i)));
      for (let k = 1; k < 4; k++) { const q = pts[k + 1].p, a = r() * TAU, g = BG.cyl(0.005, 0.012, 0.22 + r() * 0.2, 3); g.rotateZ(Math.PI / 2 - 0.3); g.rotateY(a); g.translate(q.x, q.y - 0.02, q.z); B.add(g, '#c4ac82'); }
    }
    for (let k = 0; k < 3; k++) { const g0 = puff(V((r() - 0.5) * 1.2, 0.06, 0.05 + r() * 0.3), 0.14 + r() * 0.1, { detail: 1, noise: 0.4, squash: 0.5, seed: seed + k }); B.add(g0, (p, n, o) => o.set('#3a6a2e').lerp(col('#78a64e'), clamp(n.y) * 0.5)); }
    for (let k = 0; k < 3; k++) { const g0 = puff(V((r() - 0.5) * 1.4, 0.05, -0.1 + r() * 0.2), 0.12 + r() * 0.08, { detail: 1, noise: 0.35, squash: 0.7, seed: seed + 9 + k }); B.add(g0, (p, n, o) => o.set('#6e7266').lerp(col('#a2a496'), clamp(n.y))); }
  }, 0.01));
}
/** dry fallen bamboo: one culm leaning on the wall, two lying at its foot (a broken end with splinters), dead leaves */
function fallenBamboo(seed = 0) {
  return cached('fallen:' + seed, () => Pr.kit(seed * 31 + 4, B => {
    const r = mulberry32(seed * 61 + 7), dry = ['#b8b06a', '#a8a462', '#c4b878', '#9cae5e'];
    pole(B, V(-0.8 + r() * 0.3, 1.75, -0.28), V(0.35, 0.07, 0.95), 0.07, dry[0], '#7a7440');
    pole(B, V(-1.25, 0.075, 0.55), V(1.05, 0.075, 0.2 + r() * 0.2), 0.075, dry[1], '#7a7440');
    pole(B, V(0.15, 0.065, 1.35), V(1.35, 0.065, 0.55), 0.062, dry[2 + (seed % 2)], '#76703e');
    for (let k = 0; k < 5; k++) { const sp = BG.cone(0.02, 0.18 + r() * 0.1, 3); sp.rotateZ(-Math.PI / 2 + (r() - 0.5) * 0.6); sp.rotateY((r() - 0.5) * 0.8); sp.translate(1.1 + r() * 0.06, 0.08, 0.2 + (r() - 0.5) * 0.1); B.add(sp, '#d8cc8a'); }
    for (let k = 0; k < 16; k++) { const lf = BG.plane(0.24, 0.05); lf.rotateX(-Math.PI / 2); lf.rotateY(r() * TAU); lf.translate((r() - 0.5) * 2.6, 0.012 + r() * 0.01, 0.2 + r() * 1.2); B.add(lf, ['#c8b46a', '#b09a58', '#a6b458', '#d6c47a'][k % 4]); }
  }, 0.01));
}

// ------------------------------------------------------------------ geometry helpers
const _cc = new THREE.Color();
// a culm tube's painter (world y): green with node bands every ~0.4 m, a waxy powder band under each node
const culmPainter = (base, y0) => { const b = col(base), dark = b.clone().multiplyScalar(0.58), powder = b.clone().lerp(col('#eef4dc'), 0.42); return (px, py, pz, nx, ny, nz, o) => { const k = ((py - y0) / 0.42) % 1; o.copy(b).multiplyScalar(0.84 + 0.2 * clamp(ny * 0.4 + 0.6)); if (k > 0.92) o.copy(dark); else if (k > 0.84) o.lerp(powder, 0.6); }; };
// leaf sprays and clusters for a culm top (Placer 'culmLeaf' cards, the grove's bamboo atlas)
function leafCrown(C, r, top, out, size = 1, pal = LEAF.fresh) {
  const pk = () => pal[Math.floor(r() * pal.length)];
  for (let k = 0, n = 3 + Math.floor(r() * 2); k < n; k++) {
    const a = k / n * TAU + r() * 0.6, d = V(Math.cos(a), 0, Math.sin(a)).lerp(out, 0.5).normalize(), sl = (0.8 + r() * 0.4) * size;
    const p0 = top.clone().add(V(0, -r() * 0.3, 0)), p1 = p0.clone().addScaledVector(d, sl * 0.45).add(V(0, 0.1, 0)), p2 = p1.clone().addScaledVector(d, sl * 0.3).add(V(0, -sl * 0.5, 0));
    C.spray([p0, p1, p2], V(-d.z, 0, d.x), 0.5 * size, V(0, 1, 0).addScaledVector(d, 0.4).normalize(), k % 2 ? 'S1' : 'S2', pk(), pk());
  }
  for (let k = 0; k < 2; k++) C.cluster(r, top.clone().add(V((r() - 0.5) * 0.4, -0.15 - k * 0.4, (r() - 0.5) * 0.4)), UP, (1.0 + r() * 0.4) * size, k ? 'C1' : 'C2', pk(), 0.5, UP);
}

// ------------------------------------------------------------------ the wall kit
function culmsThroughRock(W, s, PL) { // 2–3 culms bursting out of the rock face, arching up and out over the room, leafy tops
  const q = W.krng, WD = W.wallDeco, C = new CardSet(), out = V(-s.nx, 0, -s.nz);
  const n = 2 + Math.floor(q() * 2), y0 = s.h * (0.3 + q() * 0.2);
  for (let i = 0; i < n; i++) {
    const o = (i - (n - 1) / 2) * 0.32 + (q() - 0.5) * 0.1, bx = s.x + s.tx * o, bz = s.z + s.tz * o, R = 0.06 + q() * 0.03;
    const lean = 0.5 + q() * 0.6, H = 2.6 + q() * 1.6, side = (q() - 0.5) * 0.5;
    const pts = [], N = 8;
    for (let k = 0; k <= N; k++) {
      const t = k / N, outK = 0.15 + lean * t * t * 1.0 + t * 1.1, up = t * H; // (out past the brow before it rises)
      pts.push({ p: V(bx + s.nx * 0.35 * (1 - t * 3 > 0 ? 1 - t * 3 : 0) + out.x * outK + s.tx * side * t, y0 + up, bz + s.nz * 0.35 * (1 - t * 3 > 0 ? 1 - t * 3 : 0) + out.z * outK + s.tz * side * t), r: R * (1 - t * 0.45) });
    }
    WD.addGeo(tube(pts, 6, true), bx, bz, null, culmPainter(CULM[Math.floor(q() * CULM.length)], y0));
    // a collar of broken rock and moss where it bursts out
    for (let k = 0; k < 3; k++) WD.add(SH.rock(), M(bx + out.x * 0.12 + s.tx * (k - 1) * 0.12, y0 - 0.05, bz + out.z * 0.12 + s.tz * (k - 1) * 0.12, 0.09 + q() * 0.06, 0.07, 0.09, q(), q() * TAU, q()), null, grad('#7a7e70', '#a8ac98', 1, 1.2, -0.1));
    WD.add(SH.sphLo(), M(bx + out.x * 0.1, y0 - 0.1, bz + out.z * 0.1, 0.18, 0.08, 0.14, 0, Math.atan2(out.x, out.z), 0), null, grad('#4e7e38', '#8ab458'));
    const top = pts[N].p;
    leafCrown(C, q, top, out, 0.85 + q() * 0.25);
    // twigs with clusters on the upper half
    for (let k = 4; k < N; k += 2) { const p = pts[k].p, d = V(Math.cos(q() * TAU), 0, Math.sin(q() * TAU)).lerp(out, 0.5).normalize(); C.cluster(q, p.clone().addScaledVector(d, 0.45).add(V(0, 0.15, 0)), V(0, 1, 0).addScaledVector(d, 0.35).normalize(), 0.9 + q() * 0.3, q() < 0.5 ? 'C1' : 'C2', LEAF.fresh[Math.floor(q() * 5)], 0.4, UP); }
  }
  const cg = C.geo(); cg.computeBoundingSphere(); PL.put('culmLeaf', cg, 0, 0, 0);
}
function shideOnFace(W, S, i, n) { // a shimenawa rope with shide across a straight stretch of the face
  const a = S[i], b = S[Math.min(n - 1, i + 6)]; if (!b || Math.abs(a.h - b.h) > 0.5) return;
  const L = Math.hypot(b.x - a.x, b.z - a.z); if (L < 1.6 || L > 3.6) return;
  const mx = (a.x + b.x) / 2 - (a.nx + b.nx) * 0.1, mz = (a.z + b.z) / 2 - (a.nz + b.nz) * 0.1, y = Math.min(a.h, b.h) * 0.56;
  const tx = (b.x - a.x) / L, tz = (b.z - a.z) / L, rot = Math.atan2(tx, tz) - Math.PI / 2; // local +x along the run
  const nx = -tz, nz = tx; // (the face's outward normal for this run: local +z must point away from the wall)
  const facing = (nx * -a.nx + nz * -a.nz) > 0 ? rot : rot + Math.PI;
  addPiece(W, shideRope(L, Math.floor(W.krng() * 4)), mx, mz, facing, { y, wall: true });
}
function lanternNiche(W, s, addLight) { // a carved alcove with a little stone lantern on its ledge
  const q = W.krng, WD = W.wallDeco, y = Math.min(1.25, s.h * 0.42), face = Math.atan2(-s.nx, -s.nz);
  const cx = s.x - s.nx * 0.02, cz = s.z - s.nz * 0.02;
  WD.add(SH.disc(), M(cx, y + 0.36, cz, 0.42, 0.03, 0.56, Math.PI / 2, face, 0), col('#2a2f26')); // the dark hollow of the niche
  for (let k = 0; k < 7; k++) { const a = Math.PI * (k / 6), ox = Math.cos(a) * 0.48, oy = Math.sin(a) * 0.6; WD.add(SH.rock(), M(cx + s.tx * ox - s.nx * 0.05, y + 0.36 + oy * 0.95, cz + s.tz * ox - s.nz * 0.05, 0.11, 0.09, 0.08, q(), q() * TAU, q()), null, grad('#7c8070', '#aeae9a', 1, 1.2, -0.1)); }
  WD.add(SH.box(), M(cx - s.nx * 0.16, y - 0.06, cz - s.nz * 0.16, 0.7, 0.08, 0.36, 0, face, 0), null, grad('#8a8e7c', '#b4b4a0'));
  addPiece(W, Pr.lantern(17 + Math.floor(q() * 4), { s: 0.48, pad: false }), cx - s.nx * 0.18, cz - s.nz * 0.18, face, { y: y - 0.02, wall: true, lights: false, mul: 0.64 });
  W.halos.add(cx - s.nx * 0.4, y + 0.42, cz - s.nz * 0.4, 1.6, P.lantern, 0.6, 1);
  addLight(cx - s.nx * 0.8, y + 0.6, cz - s.nz * 0.8, P.lantern, 4, 5.5, 0.6);
  for (let k = 0; k < 3; k++) WD.add(SH.sphLo(), M(cx - s.nx * 0.12 + s.tx * (k - 1) * 0.28, y + 0.82 + (k % 2) * 0.05, cz - s.nz * 0.12 + s.tz * (k - 1) * 0.28, 0.14, 0.07, 0.1), null, grad('#4a7e36', '#8ab658'));
}
function seep(W, s) { // a thin trickle of water down the face, a small pool at its foot and the odd drip
  const q = W.krng, WG = W.wallGlow, top = s.h * 0.62, x = s.x - s.nx * 0.17, z = s.z - s.nz * 0.17, face = Math.atan2(-s.nx, -s.nz);
  for (let k = 0; k < 2; k++) WG.add(SH.box(), M(x + s.tx * (k - 0.5) * 0.08, 0.02, z + s.tz * (k - 0.5) * 0.08, 0.035 - k * 0.012, top, 0.012, 0, face, 0), null, (px, py, pz, nx, ny, nz, o) => o.copy(col('#5ab4a0')).lerp(col('#d8fff4'), 0.3 + 0.3 * Math.sin(py * 13 + k * 2)));
  W.floorGlows.add(x - s.nx * 0.5, 0.05, z - s.nz * 0.5, 0.8, '#9ff0e0', 0.3, 1);
  for (let k = 0; k < 4; k++) W.wallDeco.add(SH.rock(), M(x - s.nx * (0.35 + q() * 0.4) + s.tx * (q() - 0.5) * 0.8, 0.03, z - s.nz * (0.35 + q() * 0.4) + s.tz * (q() - 0.5) * 0.8, 0.08 + q() * 0.08, 0.05, 0.08, q(), q() * TAU, 0), null, grad('#5a6460', '#9aa8a0'));
  W.kitState.drips.push({ x, y: top, z, t: q() * 3 });
}
function mossCurtain(W, s, PL) { // a curtain of hanging moss and roots from under the brow, a fern sprouting from a crack below
  const q = W.krng, WD = W.wallDeco, face = Math.atan2(-s.nx, -s.nz), fx = s.x - s.nx * 0.56, fz = s.z - s.nz * 0.56;
  for (let k = 0, m = 5 + Math.floor(q() * 4); k < m; k++) {
    const o = (k / (m - 1) - 0.5) * 1.5, len = 0.35 + q() * 0.75;
    WD.add(SH.sphLo(), M(fx + s.tx * o, s.h * 0.92 - len * 0.5, fz + s.tz * o, 0.12 + q() * 0.06, len * 0.6, 0.08, 0, face, 0), null, (px, py, pz, nx, ny, nz, o2) => o2.copy(col('#3e7030')).lerp(col('#90bc5c'), clamp((py - s.h * 0.4) / (s.h * 0.5))));
  }
  hangingRoots(W, s, q, 3);
  PL.multi(F.fern(Math.floor(q() * 4), { big: 0.6 }), s.x - s.nx * 0.2, s.h * 0.48, s.z - s.nz * 0.2, { rot: q() * TAU, tiltX: 0.9, s: 0.9 });
}
/** pale roots dangling in the air from the brow's nose (the face leans back under it), thinning to threads */
function hangingRoots(W, s, q, n = 2) {
  const WD = W.wallDeco;
  for (let i = 0; i < n; i++) {
    const o = (q() - 0.5) * 1.6, bx = s.x + s.tx * o, bz = s.z + s.tz * o, len = 0.6 + q() * 1.1, R = 0.022 + q() * 0.02, sw = (q() - 0.5) * 0.25;
    const at = (off, y) => V(bx - s.nx * off + s.tx * sw * (1 - y / s.h), y, bz - s.nz * off + s.tz * sw * (1 - y / s.h));
    const pts = [{ p: at(0.1, s.h * 1.1), r: R * 1.3 }, { p: at(0.45, s.h * 1.07), r: R * 1.2 }, { p: at(0.64, s.h * 0.98), r: R }, { p: at(0.66, s.h * 0.88), r: R * 0.8 }, { p: at(0.64 + sw * 0.3, s.h * 0.88 - len * 0.6), r: R * 0.5 }, { p: at(0.62 + sw * 0.5, s.h * 0.88 - len), r: R * 0.2 }];
    WD.addGeo(tube(pts, 5, true), bx, bz, null, (x, y, z, nx, ny, nz, oc) => oc.copy(col('#8a7250')).lerp(col('#cdb68a'), clamp(nx * nx * 0.3 + 0.4 + (y - s.h * 0.8) * 0.3)));
  }
}
function dressWalls(W, addLight) {
  const r = W.rng, PL = placer(W), WD = W.wallDeco;
  let youngAtFoot = 0;
  for (const { S, len, seed } of W.wallSamples) {
    const n = S.length;
    let lastSeg = -1;
    for (let i = 0; i < n; i++) { // set pieces on the camera-facing runs, one per ~5.5 m
      const s = S[i], seg = Math.floor(s.u / 5.5);
      if (seg === lastSeg || s.u > len - 2 || s.f < 0.3 || s.h < 1.8) continue;
      if (W.L.arena && Math.hypot(s.x - W.L.arena.x, s.z - W.L.arena.z) < W.L.arena.r + 1.5) continue; // (the arena dresses its own rim)
      lastSeg = seg;
      const hsh = mulberry32(seg * 7919 + seed * 104729)();
      if (hsh < 0.4) culmsThroughRock(W, s, PL);
      else if (hsh < 0.54) shideOnFace(W, S, i, n);
      else if (hsh < 0.66) lanternNiche(W, s, addLight);
      else if (hsh < 0.75) seep(W, s);
      else if (hsh < 0.88) mossCurtain(W, s, PL);
    }
    for (let i = 0; i < n; i++) { // the wall foot: ferns, takenoko, hostas, moss, pebbles, litter, the odd young stand
      const s = S[i]; if (r() > 0.24) continue;
      const far = s.f > 0.15, k = r(), fx = s.x - s.nx * 0.45, fz = s.z - s.nz * 0.45;
      if (!W.walkable(fx, fz) || W.keepClear(fx, fz) || inStream(W, fx, fz)) continue;
      if (far && k < 0.22) PL.multi(F.fern(Math.floor(r() * 4), { big: 0.75 + r() * 0.4 }), fx, 0, fz, { rot: r() * TAU });
      else if (k < 0.34) for (let j = 0, m = 1 + Math.floor(r() * 3); j < m; j++) PL.multi(F.shoot(Math.floor(r() * 6)), fx + s.tx * (j - 1) * 0.35 + (r() - 0.5) * 0.2, 0, fz + s.tz * (j - 1) * 0.35, { rot: r() * TAU, s: 0.7 + r() * 0.5 });
      else if (far && k < 0.46) PL.multi(F.hosta(Math.floor(r() * 3), r() < 0.5 ? 'blue' : 'variegated'), fx, 0, fz, { rot: r() * TAU, s: 0.8 + r() * 0.3 });
      else if (k < 0.58) PL.multi(F.mossMound(Math.floor(r() * 4)), fx + s.nx * 0.1, -0.02, fz + s.nz * 0.1, { rot: r() * TAU, s: 0.6 + r() * 0.5 });
      else if (k < 0.7) for (let j = 0; j < 3; j++) WD.add(SH.rock(), M(fx + (r() - 0.5) * 0.7, 0.04, fz + (r() - 0.5) * 0.7, 0.07 + r() * 0.08, 0.05 + r() * 0.04, 0.07 + r() * 0.07, r(), r() * TAU, r()), null, grad('#7a7e70', '#b8b8a6', 1, 1.2, -0.1));
      else if (k < 0.82) PL.multi(F.litter(Math.floor(r() * 4), 'bamboo'), fx, 0.005, fz, { rot: r() * TAU, s: 0.8 + r() * 0.5 });
      else if (far && s.f > 0.5 && k < 0.88 && youngAtFoot < 14 && W.walkable(fx - s.nx * 0.3, fz - s.nz * 0.3)) { youngAtFoot++; PL.multi(F.stand('young', Math.floor(r() * 2)), fx + s.nx * 0.15, -0.05, fz + s.nz * 0.15, { rot: r() * TAU, s: 0.85 }); W.collision.addCircle(fx + s.nx * 0.15, fz + s.nz * 0.15, 0.32); }
    }
  }
  dressTops(W, addLight);
}
// above the brow: young culms and ferns leaning out of its cracks (the far walls), moss beds, roots draping over the
// nose, loose stones; nothing tall further back, where the rock heaves up into the dark
function dressTops(W, addLight) {
  const r = mulberry32(W.L.floor * 9173 + 5), PL = placer(W), WD = W.wallDeco;
  let culms = 0, roots = 0;
  for (const { S } of W.wallSamples) {
    let next = r() * 2.6;
    for (const s of S) {
      if (s.u < next) continue;
      const sp = topSpan(s); if (!sp) continue;
      next = s.u + 1.6 + r() * 1.6;
      const far = s.f > 0.15, k = r(), o = sp.o0 + 0.08 + r() * 0.45, y = sp.yAt(o);
      const x = s.x + s.nx * o + s.tx * (r() - 0.5) * 0.6, z = s.z + s.nz * o + s.tz * (r() - 0.5) * 0.6;
      if (far && s.f > 0.4 && k < 0.13 && culms < 14) { culms++; PL.multi(F.stand('young', Math.floor(r() * 2)), x, y - 0.06, z, { rot: r() * TAU, s: 0.66 + r() * 0.18 }); }
      else if (k < 0.32) PL.multi(F.fern(Math.floor(r() * 4), { big: 0.55 + r() * 0.35 }), x - s.nx * 0.12, y - 0.03, z - s.nz * 0.12, { rot: r() * TAU, tiltX: 0.45 });
      else if (k < 0.46) PL.multi(F.mossMound(Math.floor(r() * 4)), x, y - 0.05, z, { rot: r() * TAU, s: 0.6 + r() * 0.4 });
      else if (far && k < 0.6 && roots < 36) { roots++; hangingRoots(W, s, r, 2); }
      else if (k < 0.72) for (let i = 0; i < 2; i++) WD.add(SH.rock(), M(x + (r() - 0.5) * 0.5, y + 0.04, z + (r() - 0.5) * 0.5, 0.16 + r() * 0.14, 0.12 + r() * 0.08, 0.16 + r() * 0.12, r(), r() * TAU, 0), null, grad('#4e564c', '#6e7666', 1, 1.2, -0.1));
    }
  }
  W.topCount = { culms, roots };
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
    const farWall = toCam(dx, dz) < -0.25; // the wall it hugs is on the far side: tall things are fine here
    const collide = rad => W.collision.addCircle(x, z, rad);
    if (p.kind === 'corner') {
      if (k < 0.3 && farWall && p.big) { PL.multi(F.stand('young', Math.floor(r() * 2)), x, -0.05, z, { rot: r() * TAU, s: 0.75 + r() * 0.2 }); collide(0.45); for (let i = 0; i < 2; i++) PL.multi(F.shoot(Math.floor(r() * 6)), x + (r() - 0.5) * 1.1, 0, z + (r() - 0.5) * 1.1, { rot: r() * TAU }); }
      else if (k < 0.55) { PL.multi(F.mossBoulder(Math.floor(r() * 4), { moss: 0.7 }), x, -0.06, z, { rot: r() * TAU, s: 0.7 + r() * 0.4 }); PL.multi(F.fern(Math.floor(r() * 4), { big: 0.8 }), x - dz * 0.6, 0, z + dx * 0.6, { rot: r() * TAU }); if (p.big) collide(0.5); }
      else if (k < 0.72 && p.big) { addPiece(W, culmStack(Math.floor(r() * 3)), x, z, face + Math.PI / 2, { s: 0.85 }); collide(0.6); }
      else if (k < 0.86) { addPiece(W, stoneMarker(Math.floor(r() * 4)), x, z, face, { s: 0.9 + r() * 0.3 }); PL.multi(F.mossMound(Math.floor(r() * 4)), x + dz * 0.5, -0.02, z - dx * 0.5, { s: 0.6 }); collide(0.28); }
      else { PL.multi(F.hosta(Math.floor(r() * 3), 'blue'), x, 0, z, { rot: r() * TAU }); PL.multi(F.shoot(Math.floor(r() * 6)), x + 0.4, 0, z - 0.3, { rot: r() * TAU }); }
    } else if (p.kind === 'edge') {
      if (k < 0.24) PL.multi(F.fern(Math.floor(r() * 4), { big: 0.7 + r() * 0.4 }), x, 0, z, { rot: r() * TAU });
      else if (k < 0.4) for (let i = 0, m = 1 + Math.floor(r() * 2); i < m; i++) PL.multi(F.shoot(Math.floor(r() * 6)), x + (r() - 0.5) * 0.5, 0, z + (r() - 0.5) * 0.5, { rot: r() * TAU, s: 0.7 + r() * 0.5 });
      else if (k < 0.52) PL.multi(F.litter(Math.floor(r() * 4), 'bamboo'), x, 0.005, z, { rot: r() * TAU });
      else if (k < 0.62) PL.multi(F.mossMound(Math.floor(r() * 4)), x, -0.02, z, { rot: r() * TAU, s: 0.5 + r() * 0.4 });
      else if (k < 0.72 && p.big) { PL.multi(F.mossBoulder(Math.floor(r() * 4)), x, -0.08, z, { rot: r() * TAU, s: 0.5 + r() * 0.3 }); collide(0.35); }
      else if (k < 0.8) PL.multi(F.hosta(Math.floor(r() * 3), r() < 0.5 ? 'variegated' : 'gold'), x, 0, z, { rot: r() * TAU, s: 0.8 });
      else if (k < 0.88) for (let i = 0; i < 4; i++) B.add(SH.rock(), M(x + (r() - 0.5) * 0.7, 0.03, z + (r() - 0.5) * 0.7, 0.06 + r() * 0.07, 0.04, 0.06 + r() * 0.06, r(), r() * TAU, r()), null, grad('#7a7e70', '#bcbaa8', 1, 1.2, -0.1));
      else if (k < 0.94 && p.big) { addPiece(W, gohei(Math.floor(r() * 3), 1.2), x, z, face); collide(0.16); }
      else PL.multi(F.shoot(Math.floor(r() * 6)), x, 0, z, { rot: r() * TAU });
    } else {
      if (k < 0.5) PL.multi(F.litter(Math.floor(r() * 4), 'bamboo'), x, 0.005, z, { rot: r() * TAU, s: 1 + r() * 0.5 });
      else if (k < 0.75) PL.multi(F.shoot(Math.floor(r() * 6)), x, 0, z, { rot: r() * TAU, s: 0.6 + r() * 0.4 });
      else for (let i = 0; i < 3; i++) B.add(SH.rock(), M(x + (r() - 0.5) * 0.6, 0.03, z + (r() - 0.5) * 0.6, 0.05 + r() * 0.06, 0.04, 0.05 + r() * 0.05, r(), r() * TAU, r()), null, grad('#7a7e70', '#bcbaa8', 1, 1.2, -0.1));
    }
  }
}
function buildLights(W) { // every room light is a mossy stone lantern standing off the wall, its fire the room's warm pool
  const at = W.L.at, T = W.theme;
  for (const l of W.L.lights) {
    const wp = W.cellToWorld(l.x, l.y);
    let dx = (at(l.x + 1, l.y) ? 0 : 1) - (at(l.x - 1, l.y) ? 0 : 1), dz = (at(l.x, l.y + 1) ? 0 : 1) - (at(l.x, l.y - 1) ? 0 : 1);
    const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
    const x = wp.x + dx * 0.35, z = wp.z + dz * 0.35, face = Math.atan2(-dx, -dz);
    if (inStream(W, x, z, 0.2)) continue;
    addPiece(W, Pr.lantern(Math.floor(W.rng() * 8), { s: 0.95 }), x, z, face, { lights: false, mul: 0.64 });
    const fy = 0.08 + 0.86 * 0.95;
    W.halos.add(x, fy, z, 1.1, T.light, 0.3, 1);
    W.floorGlows.add(x - dx * 0.9, 0.04, z - dz * 0.9, 2.3, '#ffb060', 0.22, 1); // (the warm pool on the floor)
    W.lightPool.addSource({ pos: V(x - dx * 1.6, 1.3, z - dz * 1.6), color: col(T.light).clone(), intensity: (T.lightI ?? 9) * 0.8, radius: 10, flicker: 0.9 });
    W.collision.addCircle(x, z, 0.36);
  }
}
function buildCenterpieces(W) {
  const r = W.rng, PL = placer(W), B = W.solid;
  for (const c of W.L.centers || []) {
    const p = W.cellToWorld(c.x, c.y);
    if (c.r < 0.34) { // a spring pool fed by a shishi-odoshi, mossy stones and iris round it
      W.kitDecal(4, p.x, p.z, 2.0, 1.7, r() * TAU, 1);
      const sx = p.x - 2.3, sz = p.z + 0.4, s = Pr.shishiOdoshi(0);
      addPiece(W, s.pc, sx, sz, Math.PI * 0.5);
      W.kitState.rockers.push({ x: sx, z: sz, s, rot: Math.PI * 0.5 });
      for (let i = 0; i < 10; i++) { const a = i / 10 * TAU + r() * 0.3, rr = 2.2 + r() * 0.3; if (Math.abs(a - Math.PI) < 0.5) continue; PL.multi(F.mossBoulder(Math.floor(r() * 4), { moss: 0.5, sq: 0.5 }), p.x + Math.cos(a) * rr, -0.12, p.z + Math.sin(a) * rr * 0.86, { rot: r() * TAU, s: 0.4 + r() * 0.25 }); }
      for (let i = 0; i < 3; i++) { const a = r() * TAU; PL.multi(F.fern(Math.floor(r() * 4), { big: 0.7 }), p.x + Math.cos(a) * 2.8, 0, p.z + Math.sin(a) * 2.5, { rot: r() * TAU }); }
      W.collision.addCircle(p.x, p.z, 1.7); W.collision.addCircle(sx, sz, 0.55);
      W.lightPool.addSource({ pos: V(p.x, 1.2, p.z), color: col('#9ff0d8'), intensity: 5, radius: 7, flicker: 0.15 });
    } else if (c.r < 0.67) { // a sacred bamboo island: a young stand on a moss knoll, ringed with stones and a rope
      PL.multi(F.mossMound(1), p.x, -0.06, p.z, { s: 2.2 });
      PL.multi(F.stand('young', 0), p.x, 0.02, p.z, { rot: r() * TAU, s: 1.0 });
      PL.multi(F.stand('young', 1), p.x + 0.5, 0.02, p.z - 0.4, { rot: r() * TAU, s: 0.8 });
      for (let i = 0; i < 9; i++) { const a = i / 9 * TAU; B.add(SH.rock(), M(p.x + Math.cos(a) * 1.55, 0.08, p.z + Math.sin(a) * 1.55, 0.2 + r() * 0.08, 0.16, 0.2, r(), r() * TAU, 0), null, grad('#8a8a7c', '#c4c0ae', 1, 1.2, -0.1)); }
      for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + 0.4; addPiece(W, gohei(i, 1.0), p.x + Math.cos(a) * 1.25, p.z + Math.sin(a) * 1.25, -a + Math.PI / 2); }
      const rope = []; for (let k = 0; k <= 24; k++) { const a = k / 24 * TAU + 0.4; rope.push({ p: V(p.x + Math.cos(a) * 1.25, 0.75 - Math.abs(Math.sin(a * 2)) * 0.1, p.z + Math.sin(a) * 1.25), r: 0.03 }); }
      B.addGeo(tube(rope, 5, false), p.x, p.z, null, (px, py, pz, nx, ny, nz, o) => o.set('#ecd8a0').multiplyScalar(0.86 + 0.14 * Math.sin(Math.atan2(pz - p.z, px - p.x) * 40)));
      W.collision.addCircle(p.x, p.z, 1.35);
    } else { // a little hokora with a torii before it and a pair of lanterns
      addPiece(W, hokora(Math.floor(r() * 3)), p.x, p.z - 0.6, 0);
      addPiece(W, Pr.torii(5, { w: 1.7, h: 2.0 }), p.x, p.z + 1.4, 0);
      for (const s2 of [-1, 1]) addPiece(W, Pr.lantern(9 + s2, { s: 0.7 }), p.x + s2 * 1.5, p.z + 0.4, 0, { mul: 0.64 });
      W.collision.addCircle(p.x, p.z - 0.6, 0.85); for (const s2 of [-1, 1]) { W.collision.addCircle(p.x + s2 * 0.85, p.z + 1.4, 0.18); W.collision.addCircle(p.x + s2 * 1.5, p.z + 0.4, 0.3); }
    }
  }
}

// ------------------------------------------------------------------ the arena: Master Tengu's hollow
function buildArena(W) {
  const A = W.arena, L = W.L, ar = L.arena, mouth = L.arenaMouth; if (!A || !ar) return;
  const B = W.solid, PL = placer(W), HA = W.halos;
  const ma = mouth ? Math.atan2(mouth.z - ar.z, mouth.x - ar.x) : Math.PI / 4;
  W.arenaLanterns = [];
  const n = 10;
  for (let i = 0; i < n; i++) { // stone lanterns round the ring, a gap at the mouth
    const a = ma + (i + 0.5) / n * TAU;
    if (Math.abs(Math.atan2(Math.sin(a - ma), Math.cos(a - ma))) < 0.42) continue;
    const rr = ar.r - 1.75, x = ar.x + Math.cos(a) * rr, z = ar.z + Math.sin(a) * rr;
    if (!W.walkable(x, z)) continue;
    addPiece(W, Pr.lantern(11 + i, { s: 1.0 }), x, z, Math.atan2(ar.x - x, ar.z - z), { lights: false, mul: 0.64 });
    W.collision.addCircle(x, z, 0.36);
    const p = V(x, 1.0, z); W.arenaLanterns.push(p);
    HA.add(x, 0.95, z, 1.8, P.lantern, 0.6, 1);
    if (i % 2 === 0) W.lightPool.addSource({ pos: V(x, 1.6, z), color: col(P.lantern), intensity: 7, radius: 9, flicker: 0.8 });
    if (i % 3 === 1) PL.multi(F.fern(i % 4, { big: 0.8 }), x + Math.cos(a) * 0.7, 0, z + Math.sin(a) * 0.7, { rot: a });
  }
  if (mouth) { // the torii over the way in (it faces the corridor), two gohei and lanterns flanking it
    const tx = ar.x + Math.cos(ma) * (ar.r - 0.4), tz = ar.z + Math.sin(ma) * (ar.r - 0.4), yaw = Math.atan2(Math.cos(ma), Math.sin(ma));
    addPiece(W, Pr.torii(2, { w: 3.8, h: 3.6 }), tx, tz, yaw);
    const px = -Math.sin(ma), pz = Math.cos(ma);
    for (const s of [-1, 1]) { W.collision.addCircle(tx + px * s * 1.9, tz + pz * s * 1.9, 0.22); addPiece(W, gohei(s + 2, 1.6), tx + px * s * 2.7 - Math.cos(ma) * 0.6, tz + pz * s * 2.7 - Math.sin(ma) * 0.6, yaw); }
    W.arenaGate = { x: tx, z: tz, yaw, w: 3.8 };
  }
  { // the sacred rock in shimenawa across from the way in, on the far side from the camera; wind chimes beside it
    let ra = ma + Math.PI; if (Math.cos(ra) * CAMX + Math.sin(ra) * CAMZ > -0.2) ra = Math.PI * 1.25 + (Math.sin(ma - Math.PI * 1.25) > 0 ? -0.75 : 0.75); const rr = ar.r - 2.9, x = ar.x + Math.cos(ra) * rr, z = ar.z + Math.sin(ra) * rr;
    addPiece(W, Pr.iwakura(1, { R: 1.25 }), x, z, ra);
    W.collision.addCircle(x, z, 1.25);
    const cx = ar.x + Math.cos(ra + 0.5) * (ar.r - 2.3), cz = ar.z + Math.sin(ra + 0.5) * (ar.r - 2.3);
    addPiece(W, Pr.chimes(0, { L: 3.0, h: 2.4 }), cx, cz, ra + 0.55 + Math.PI / 2);
    for (let k = 0; k < 4; k++) { const a = ra + (k - 1.5) * 0.35; PL.multi(F.mossMound(k), ar.x + Math.cos(a) * (ar.r - 1.0), -0.03, ar.z + Math.sin(a) * (ar.r - 1.0), { s: 0.8 }); }
    W.halos.add(x, 1.4, z, 4.5, '#e8ffc8', 0.18);
  }
  // a broad shaft of green-gold light falling into the hollow through the open roof, a soft pool under it
  for (let i = 0; i < 4; i++) W.shaftBatch.add(ar.x + (W.rng() - 0.5) * 3, ar.z + (W.rng() - 0.5) * 3, 2.4 + W.rng() * 1.8, 13, 0.28, W.rng() * TAU, 0.18, 0.11 + W.rng() * 0.05, W.rng() * 10);
  W.floorGlows.add(ar.x, 0.05, ar.z, 4.2, '#f4ffd0', 0.14);
  W.lightPool.addSource({ pos: V(ar.x, 7, ar.z), color: col('#f4ffd8'), intensity: 3.5, radius: 16, flicker: 0.05 });
}

// a few bright shafts falling through cracks in the cave roof (not one in every room): two narrow planes each, a pool of
// cool light and a light under them, dust motes drifting in them (kit update). Capped: two planes at most 0.19 each.
function buildShafts(W) { roofShafts(W, { max: 5, chance: 0.58, pool: '#e6ffd8', light: '#eaffe0' }); }

// ------------------------------------------------------------------ the stairs down
function buildLandmarks(W) {
  const L = W.L, PL = placer(W);
  if (!L.stairs) return;
  const c = W.cellToWorld(L.stairs.x, L.stairs.y), q = W.krng, rx = CAMX, rz = -CAMZ;
  const ok = (x, z, pad = 0.25) => W.walkable(x, z) && !W.collision.solidAt(x, z, pad);
  for (let i = 0; i < 12; i++) { const a = i / 12 * TAU + q() * 0.1, R = 1.4 + q() * 0.06, x = c.x + Math.cos(a) * R, z = c.z + Math.sin(a) * R; if (W.walkable(x, z)) W.clutter.addVC(Pr.slab(i + 1, { R: 0.3, moss: 0.55 }), M(x, -0.04, z, 1, 1, 1, 0, -a, 0)); }
  // a small torii over the way down, turned to the camera, and a lantern either side
  const tx = c.x - CAMX * 0.6, tz = c.z - CAMZ * 0.6;
  if (ok(tx, tz, 0.1)) { addPiece(W, Pr.torii(7, { w: 2.3, h: 2.4 }), tx, tz, CAM); for (const e of [-1, 1]) W.collision.addCircle(tx + rx * e * 1.15, tz + rz * e * 1.15, 0.18); }
  for (const e of [-1, 1]) { const x = c.x + rx * e * 2.0 - CAMX * 0.2, z = c.z + rz * e * 2.0 - CAMZ * 0.2; if (ok(x, z)) { addPiece(W, Pr.lantern(20 + e, { s: 0.8 }), x, z, CAM, { mul: 0.64 }); W.collision.addCircle(x, z, 0.3); } }
  for (let i = 0; i < 3; i++) { const a = CAM + Math.PI + (i - 1) * 0.6, x = c.x + Math.cos(a) * 2.2, z = c.z + Math.sin(a) * 2.2; if (ok(x, z, 0.1)) PL.multi(F.fern(i, { big: 0.7 }), x, 0, z, { rot: a }); }
}

// ------------------------------------------------------------------ decor-map clutter, rhizomes, streams
function buildDressing(W) {
  const r = W.drng, L = W.L, K = W.decoK, TW = W.decoW, TH = W.decoH, D = W.deco, dist = W.wallDist, PL = placer(W), CL = W.clutter;
  const free = (x, z, pad = 0.25) => freeAt(W, x, z, pad);
  const n = { moss: 0, fern: 0, litter: 0, pebble: 0, shoot: 0 };
  for (let tz = 0; tz < TH; tz++) for (let tx = 0; tx < TW; tx++) {
    const k = (tz * TW + tx) * 4, lush = D[k], path = D[k + 1], stream = D[k + 2], acc = D[k + 3];
    const x = (tx + 0.1 + r() * 0.8) * CELL / K, z = (tz + 0.1 + r() * 0.8) * CELL / K;
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    if (!L.at(cx, cz)) continue;
    const wd = dist[cz * L.W + cx], roll = r();
    if (stream > 0.12) { // reeds and iris on the stream banks, a stepping stone now and then in the water
      if (stream < 0.36 && roll < 0.16 && free(x, z, 0.05)) { W.ddTuft(CL, x, z, 1.0 + r() * 0.6, '#3e7a3a', '#9cc866'); n.moss++; }
      continue;
    }
    if (lush > 0.42 && roll < 0.42 * lush) { // moss tufts and little ferns on the cushions
      if (!free(x, z, 0.05)) continue;
      if (r() < 0.22) { PL.multi(F.fern(Math.floor(r() * 4), { big: 0.45 + r() * 0.3 }), x, 0, z, { rot: r() * TAU }); n.fern++; }
      else { W.ddTuft(CL, x, z, 0.7 + r() * 0.5, '#3c6a2c', '#a4cc6a'); n.moss++; }
    } else if (wd === 1 && roll < 0.3) { // the wall foot: litter, pebbles, shoots
      if (!free(x, z, 0.02)) continue;
      const kk = r();
      if (kk < 0.5) { PL.multi(F.litter(Math.floor(r() * 4), 'bamboo'), x, 0.005, z, { rot: r() * TAU, s: 0.7 + r() * 0.5 }); n.litter++; }
      else if (kk < 0.82) { for (let i = 0, m = 2 + Math.floor(r() * 3); i < m; i++) W.ddPebble(CL, x + (r() - 0.5) * 0.7, z + (r() - 0.5) * 0.7, 0.05 + r() * 0.08, col('#8e9282'), '#a8bc84'); n.pebble++; }
      else { PL.multi(F.shoot(Math.floor(r() * 6)), x, 0, z, { rot: r() * TAU, s: 0.5 + r() * 0.4 }); n.shoot++; }
    } else if (path > 0.2 && path < 0.55 && roll < 0.08) { // grit along the flag runs' edges
      if (!free(x, z, 0.02)) continue;
      for (let i = 0; i < 2; i++) W.ddPebble(CL, x + (r() - 0.5) * 0.5, z + (r() - 0.5) * 0.5, 0.04 + r() * 0.05, col('#b0ac9a'));
      n.pebble += 2;
    } else if (acc > 0.35 && roll < 0.08) { if (free(x, z, 0.05)) { PL.multi(F.litter(Math.floor(r() * 4), 'bamboo'), x, 0.005, z, { rot: r() * TAU, s: 0.6 }); n.litter++; } }
    else if (wd >= 2 && lush < 0.1 && path < 0.2 && roll < 0.05 && free(x, z, 0.02)) { // the open earth: a little litter, pebble clusters, the odd stone
      const kk = r();
      if (kk < 0.45) { PL.multi(F.litter(Math.floor(r() * 4), 'bamboo'), x, 0.005, z, { rot: r() * TAU, s: 0.6 + r() * 0.4 }); n.litter++; }
      else if (kk < 0.85) { for (let i = 0, m = 2 + Math.floor(r() * 3); i < m; i++) W.ddPebble(CL, x + (r() - 0.5) * 0.8, z + (r() - 0.5) * 0.8, 0.05 + r() * 0.07, col('#8a8c7e'), r() < 0.3 ? '#7ea858' : null); n.pebble++; }
      else { CL.add(SH.rock(), M(x, 0.04, z, 0.16 + r() * 0.12, 0.1 + r() * 0.06, 0.14 + r() * 0.1, r(), r() * TAU, r()), null, grad('#666a5e', '#9a9c8c', 1, 1.2, -0.1)); n.pebble++; }
    }
  }
  wallClusters(W); rhizomes(W); streamStones(W); poleLanterns(W);
  W.dressCount = n;
}
// mid-scale dressing hugging the walls and corners of every chamber (root tangles, fallen bamboo, moss boulders, a group
// of stone lanterns, leaf drifts): 4–6 a chamber, 4.5 m apart, off the corridor mouths and the room dressing's claims;
// the middle stays clear for the fight. All baked into the floor's chunks (no new draw calls) or the flora Placer.
function wallClusters(W) {
  const PL = placer(W); let lit = 0;
  W.clusterCount = wallSpots(W, ({ s, x: px, z: pz, corner, far, face, r }) => {
    const k = r();
    if (k < 0.3) { addPiece(W, rootTangle(Math.floor(r() * 4)), px + s.nx * 0.3, pz + s.nz * 0.3, face + (r() - 0.5) * 0.5, { s: 0.9 + r() * 0.3 }); W.collision.addCircle(px + s.nx * 0.45, pz + s.nz * 0.45, 0.4); }
    else if (k < 0.5) { addPiece(W, fallenBamboo(Math.floor(r() * 3)), px + s.nx * 0.2, pz + s.nz * 0.2, face + (r() < 0.5 ? 0 : Math.PI * 0.08), { s: 0.95 }); W.collision.addCircle(px, pz, 0.45); PL.multi(F.litter(Math.floor(r() * 4), 'bamboo'), px - s.nx * 0.5, 0.005, pz - s.nz * 0.5, { rot: r() * TAU, s: 1.2 }); }
    else if (k < 0.72) { // moss boulders, a big one and a couple of small, ferns between
      PL.multi(F.mossBoulder(Math.floor(r() * 4), { moss: 0.75 }), px + s.nx * 0.2, -0.08, pz + s.nz * 0.2, { rot: r() * TAU, s: (corner ? 1.15 : 0.95) + r() * 0.3 }); W.collision.addCircle(px + s.nx * 0.2, pz + s.nz * 0.2, 0.62);
      for (let j = 0; j < 2; j++) { const o = (j ? 1 : -1) * (0.9 + r() * 0.4), x = px + s.tx * o - s.nx * 0.2, z = pz + s.tz * o - s.nz * 0.2; if (freeAt(W, x, z, 0.2)) PL.multi(F.mossBoulder(Math.floor(r() * 4), { moss: 0.6 }), x, -0.06, z, { rot: r() * TAU, s: 0.42 + r() * 0.2 }); }
      PL.multi(F.fern(Math.floor(r() * 4), { big: 0.75 }), px - s.nx * 0.6 + s.tx * 0.5, 0, pz - s.nz * 0.6 + s.tz * 0.5, { rot: r() * TAU });
    } else if (k < 0.84 && far) { // a group of stone lanterns, one lit
      const on = lit < 6; if (on) lit++;
      addPiece(W, Pr.lantern(30 + Math.floor(r() * 6), { s: 0.82 }), px + s.nx * 0.2, pz + s.nz * 0.2, face, { lights: false, mul: 0.64 }); W.collision.addCircle(px + s.nx * 0.2, pz + s.nz * 0.2, 0.32);
      for (const e of [-1, 1]) { const x = px + s.tx * e * 0.85 - s.nx * 0.15, z = pz + s.tz * e * 0.85 - s.nz * 0.15; if (freeAt(W, x, z, 0.15)) { addPiece(W, Pr.lantern(40 + e + Math.floor(r() * 4), { s: 0.48 + r() * 0.12, pad: false }), x, z, face + (r() - 0.5) * 0.4, { lights: false, mul: 0.6 }); W.collision.addCircle(x, z, 0.18); } }
      if (on) { W.halos.add(px + s.nx * 0.2, 0.86, pz + s.nz * 0.2, 1.0, P.lantern, 0.3, 1); W.floorGlows.add(px - s.nx * 0.5, 0.04, pz - s.nz * 0.5, 1.9, '#ffb060', 0.2, 1); W.lightPool.addSource({ pos: V(px - s.nx * 0.9, 1.1, pz - s.nz * 0.9), color: col(P.lantern), intensity: 5, radius: 6, flicker: 0.8 }); }
      PL.multi(F.mossMound(Math.floor(r() * 4)), px - s.nx * 0.5 + s.tx * 0.4, -0.02, pz - s.nz * 0.5 + s.tz * 0.4, { s: 0.6 });
    } else { // a leaf drift heaped against the foot, pebbles in it, a shoot pushing through
      for (let j = 0; j < 3; j++) PL.multi(F.litter(Math.floor(r() * 4), 'bamboo'), px + s.tx * (j - 1) * 0.8 + s.nx * 0.2, 0.005 + j * 0.002, pz + s.tz * (j - 1) * 0.8 + s.nz * 0.2, { rot: r() * TAU, s: 1.2 + r() * 0.4 });
      for (let j = 0; j < 4; j++) W.ddPebble(W.clutter, px + (r() - 0.5) * 1.6, pz + (r() - 0.5) * 1.2, 0.06 + r() * 0.08, col('#7e8274'), r() < 0.5 ? '#7ea858' : null);
      PL.multi(F.shoot(Math.floor(r() * 6)), px + s.nx * 0.3, 0, pz + s.nz * 0.3, { rot: r() * TAU, s: 0.8 });
    }
  });
}
function rhizomes(W) { // pale bamboo rhizomes crawling out of the wall foot across the floor, node rings and rootlets
  const r = W.drng, B = W.solid;
  for (const { S } of W.wallSamples) {
    let next = 3 + r() * 5;
    for (const s of S) {
      if (s.u < next) continue;
      next = s.u + 4 + r() * 4;
      if (r() < 0.15) continue;
      const len = 1.4 + r() * 1.8, side = (r() - 0.5) * 1.4;
      const ex = s.x - s.nx * len + s.tx * side, ez = s.z - s.nz * len + s.tz * side;
      const mx = (s.x + ex) / 2 - s.nx * 0.1, mz = (s.z + ez) / 2 - s.nz * 0.1;
      if (!freeAt(W, ex, ez, 0.15) || !freeAt(W, mx, mz, 0.1) || inStream(W, mx, mz, 0.15)) continue;
      const R0 = 0.06 + r() * 0.03, arch = 0.08 + r() * 0.08;
      const pts = [{ p: V(s.x + s.nx * 0.25, 0.3, s.z + s.nz * 0.25), r: R0 * 1.2 }, { p: V(s.x - s.nx * 0.2, 0.1, s.z - s.nz * 0.2), r: R0 }, { p: V(mx, arch, mz), r: R0 * 0.9 }, { p: V(ex + (s.x - ex) * 0.15, 0.03, ez + (s.z - ez) * 0.15), r: R0 * 0.6 }, { p: V(ex, -0.05, ez), r: R0 * 0.35 }];
      B.addGeo(tube(pts, 6, false), s.x, s.z, null, (x, y, z, nx, ny, nz, o) => { o.copy(col('#a88c5e')).lerp(col('#dcc694'), clamp(ny * 0.5 + 0.35)); const k = (Math.hypot(x - s.x, z - s.z) / 0.3) % 1; if (k > 0.86) o.multiplyScalar(0.7); });
      for (let i = 0; i < 3; i++) { const t = 0.3 + i * 0.22, px = s.x + (ex - s.x) * t, pz = s.z + (ez - s.z) * t, a = r() * TAU; B.add(SH.cyl6(), MD(px, 0.04, pz, V(Math.cos(a), -0.3, Math.sin(a)).normalize(), 0.008, 0.18 + r() * 0.12, 0.008), col('#c8b48a')); }
      if (r() < 0.5) W.ddTuft(W.clutter, mx - s.tx * 0.3, mz - s.tz * 0.3, 0.7, '#3e7030', '#9cc466');
    }
  }
}
function streamStones(W) { // stepping stones across each stream, and mist over it (kit update)
  const r = W.drng;
  for (const st of W.kitState.streams) {
    const pts = st.pts; if (pts.length < 2) continue;
    // stones where the room's main trail would cross: the middle of the run, across the flow
    const mid = Math.floor(pts.length / 2), a = pts[Math.max(0, mid - 1)], b = pts[Math.min(pts.length - 1, mid + 1)];
    const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1, cx = (a[0] + b[0]) / 2, cz = (a[1] + b[1]) / 2, ax = -dz / l, az = dx / l;
    for (let k = -2; k <= 2; k++) { const x = cx + ax * k * 0.66 + (r() - 0.5) * 0.15, z = cz + az * k * 0.66 + (r() - 0.5) * 0.15; if (W.walkable(x, z)) W.clutter.addVC(Pr.slab(k + 9, { R: 0.34, h: 0.1, moss: 0.45, tone: '#9a988a' }), M(x, -0.02, z, 1, 1, 1, 0, r() * TAU, 0)); }
    for (let i = 0; i < pts.length - 1; i++) for (let t = 0; t < 1; t += 0.2) { // river pebbles along both banks
      const a = pts[i], b = pts[i + 1], x0 = a[0] + (b[0] - a[0]) * t, z0 = a[1] + (b[1] - a[1]) * t, ex = b[0] - a[0], ez = b[1] - a[1], el = Math.hypot(ex, ez) || 1;
      for (const e of [-1, 1]) { const d = 1.25 + r() * 0.35, x = x0 - ez / el * e * d, z = z0 + ex / el * e * d; if (W.walkable(x, z) && r() < 0.7) W.ddPebble(W.clutter, x, z, 0.06 + r() * 0.08, col(r() < 0.5 ? '#8e9282' : '#b0ae9e'), r() < 0.4 ? '#7ea858' : null); }
    }
    for (let i = 1; i < pts.length - 1; i += 2) W.kitState.mists.push({ x: pts[i][0], z: pts[i][1] });
  }
}
function poleLanterns(W) { // a paper lantern hung from a bamboo pole beside a trail in some rooms
  const r = W.drng, L = W.L, B = W.solid, GL = W.glow, HA = W.halos;
  let placed = 0;
  for (const rm of L.rooms) {
    if (rm.kind === 'boss' || rm.kind === 'start' || r() < 0.4 || placed >= 8) continue;
    for (let t = 0; t < 40; t++) {
      const x = (rm.x + r() * rm.w) * CELL, z = (rm.y + r() * rm.h) * CELL, [, path] = W.decoAt(x, z);
      if (path < 0.25 || path > 0.5 || !W.walkable(x, z) || W.keepClear(x, z, 0.5) || W.collision.solidAt(x, z, 0.7) || W.noClutterAt?.(x, z) || inStream(W, x, z, 0.12)) continue;
      const lean = (r() - 0.5) * 0.06, a = r() * TAU, ca = Math.cos(a), sa = Math.sin(a);
      B.addGeo(tube([{ p: V(x, 0, z), r: 0.04 }, { p: V(x + lean, 1.55, z), r: 0.034 }], 6, false), x, z, null, culmPainter('#8cbf5a', 0));
      B.addGeo(tube([{ p: V(x + lean, 1.5, z), r: 0.022 }, { p: V(x + ca * 0.42, 1.62, z + sa * 0.42), r: 0.016 }], 5, false), x, z, null, culmPainter('#9cc862', 1.5));
      const lx = x + ca * 0.38, lz = z + sa * 0.38;
      B.add(SH.cyl(), M(lx, 1.32, lz, 0.006, 0.28, 0.006), col('#2a2020'));
      GL.add(SH.barrel(), M(lx, 0.98, lz, 0.13, 0.32, 0.13), null, (px, py, pz, nx, ny, nz, o) => { o.set('#ffd8a0'); if (Math.abs(Math.sin((py - 0.98) * 60)) > 0.94) o.set('#e8a060'); });
      B.add(SH.cyl(), M(lx, 1.3, lz, 0.09, 0.03, 0.09), col('#3a2a2a')); B.add(SH.cyl(), M(lx, 0.96, lz, 0.09, 0.03, 0.09), col('#3a2a2a'));
      HA.add(lx, 1.14, lz, 1.3, '#ffc47a', 0.55, 1);
      W.lightPool.addSource({ pos: V(lx, 1.2, lz), color: col('#ffc47a'), intensity: 3.5, radius: 5, flicker: 0.6 });
      W.collision.addCircle(x, z, 0.12);
      placed++;
      break;
    }
  }
}
// the streams (decor b): one or two chambers get a stream running wall to wall (painted into the deco map before
// the room dressing, so the rooms' pieces keep off it: prepRoom adds it to the room's runner lanes)
function decoMap(W, { curve, cellsOf }) {
  const L = W.L, r = mulberry32(L.floor * 3313 + (L.rooms[1]?.x || 0) * 7 + 3), at = L.at, ks = W.kitState;
  const want = r() < 0.75 ? 1 + (r() < 0.35 ? 1 : 0) : 0;
  const cand = L.rooms.filter(rm => (rm.kind === 'camp' || rm.kind === 'objective') && rm.w >= 9 && rm.h >= 9);
  for (let i = cand.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [cand[i], cand[j]] = [cand[j], cand[i]]; }
  const blocked = (x, z) => [...L.chests, ...L.shrines, ...(L.slots || [])].some(c => Math.hypot((c.x + 0.5) * CELL - x, (c.y + 0.5) * CELL - z) < 2.4) || L.spawns.some(sp => sp.boss && Math.hypot((sp.x + 0.5) * CELL - x, (sp.y + 0.5) * CELL - z) < 4);
  for (const rm of cand) {
    if (ks.streams.length >= want) break;
    const cells = cellsOf(rm); if (cells.length < 60) continue;
    const cx = (rm.cx + 0.5) * CELL, cz = (rm.cy + 0.5) * CELL, a = r() * Math.PI, dx = Math.cos(a), dz = Math.sin(a);
    // walk out from the heart both ways to the walls (staying in this room)
    const reach = sgn => { let s = 0; for (; s < 30; s += 0.5) { const x = cx + dx * sgn * s, z = cz + dz * sgn * s, gx = Math.floor(x / CELL), gz = Math.floor(z / CELL); if (!at(gx, gz)) break; if (L.roomId[gz * L.W + gx] !== rm.id) return -1; } return s; };
    const s1 = reach(1), s0 = reach(-1); if (s1 < 3 || s0 < 3) continue;
    const pts = [], N = 6, px = -dz, pz = dx, ph = r() * TAU;
    for (let k = 0; k <= N; k++) { const t = -s0 - 0.6 + (s0 + s1 + 1.2) * k / N, wig = Math.sin(k * 1.3 + ph) * 1.1; pts.push([cx + dx * t + px * wig, cz + dz * t + pz * wig]); }
    if (pts.some(([x, z]) => blocked(x, z))) continue;
    for (let k = 0; k < N; k++) curve(pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1], 1.5, 2, 1);
    ks.streams.push({ room: rm.id, pts });
  }
}

// ------------------------------------------------------------------ room purposes (roomDressing.js RoomDresser = D)
function prep(D, A) { // the room's stream joins its runner lanes so nothing stands in the water
  if (A._bambooPrep) return; A._bambooPrep = true;
  for (const st of D.W.kitState.streams) if (st.room === A.rm.id) for (let k = 0; k < st.pts.length - 1; k++) A.lanes.push([st.pts[k][0], st.pts[k][1], st.pts[k + 1][0], st.pts[k + 1][1], 1.25, 1]);
}
const farFacing = s => s && toCam(s.fx, s.fz) > 0.25; // a wall spot whose wall is on the far side (it faces the camera)
const ROOMS = {
  grotto(D, A) { // the ruined shrine in a big room's heart, else a hokora against a far wall with lanterns and an offering
    prep(D, A); const W = D.W;
    if (A.big) {
      const s = D.put(A, 3.3, { mode: 'center', spread: 3.2, core: 1.6, ring: 0 });
      if (s) { const pc = Pr.ruinedShrine(0); addPiece(W, pc, s.x, s.z, 0, { lightK: 0.7, halo: 0.3 }); for (const c of pc.cols || []) D.coll(s.x + c.x, s.z + c.z, c.r); return; }
    }
    let s = null; for (let t = 0; t < 6 && !farFacing(s); t++) s = D.spot(A, 1.5, { mode: 'wall', hug: 0.55, camPref: 1.6, core: 0.65 });
    if (s) D.claim(s.x, s.z, 1.5, true, 1.5, 0.65); else s = D.put(A, 1.5, { mode: 'wall', hug: 0.55, camPref: 1.6, core: 0.65 });
    if (!s) return;
    addPiece(W, hokora(Math.floor(D.r() * 3)), s.x, s.z, s.face);
    D.coll(s.x, s.z, 0.8);
    for (const e of [-1, 1]) { const [x, z] = D.lp(s, e * 1.25, 0.9); if (D.ok(x, z, 0.3)) { addPiece(W, Pr.lantern(30 + e, { s: 0.7 }), x, z, s.face, { mul: 0.64 }); D.coll(x, z, 0.28); } }
    const [gx, gz] = D.lp(s, 0, 1.5); if (D.ok(gx, gz, 0.2)) addPiece(W, gohei(1, 1.1), gx + 0.6, gz, s.face);
    for (let i = 0; i < 4; i++) { const [x, z] = D.lp(s, D.rnd(-1.6, 1.6), D.rnd(-0.3, 0.6)); if (D.ok(x, z, 0.1)) placer(W).multi(F.mossMound(i), x, -0.03, z, { s: 0.6 }); }
  },
  thicket(D, A) { // young bamboo crowding the far side of the room, shoots, ferns and a fallen culm
    prep(D, A); const W = D.W, PL = placer(W);
    let n = 0;
    for (let t = 0; t < 8 && n < 3; t++) {
      const s = D.spot(A, 0.9, { mode: 'wall', hug: 0.6, camPref: 2, core: 0.45 }); if (!farFacing(s)) continue;
      D.claim(s.x, s.z, 0.9, true, 1.0, 0.5); n++;
      PL.multi(F.stand(D.r() < 0.4 ? 'clump' : 'young', Math.floor(D.r() * 2)), s.x, -0.05, s.z, { rot: D.r() * TAU, s: 0.7 + D.r() * 0.2 }); D.coll(s.x, s.z, 0.45);
      for (let i = 0; i < 3; i++) { const [x, z] = D.lp(s, D.rnd(-1.2, 1.2), D.rnd(0.4, 1.4)); if (D.ok(x, z, 0.05)) PL.multi(F.shoot(Math.floor(D.r() * 6)), x, 0, z, { rot: D.r() * TAU, s: 0.6 + D.r() * 0.5 }); }
      const [fx, fz] = D.lp(s, D.rnd(-0.9, 0.9), 1.0); if (D.ok(fx, fz, 0.1)) PL.multi(F.fern(Math.floor(D.r() * 4), { big: 0.9 }), fx, 0, fz, { rot: D.r() * TAU });
    }
    if (n) ROOMS._fallen(D, A, 1);
  },
  clapper(D, A) { // a shishi-odoshi feeding a little koi pool, stepping stones, a bench and a lantern
    prep(D, A); const W = D.W, PL = placer(W);
    const s = D.put(A, 2.4, { core: 1.0, decal: true }); if (!s) return;
    D.decal(4, s.x, s.z, 1.7, 1.35, s.face, 1);
    const [sx, sz] = D.lp(s, -2.0, 0.1), sh = Pr.shishiOdoshi(0);
    if (D.ok(sx, sz, 0.3)) { addPiece(W, sh.pc, sx, sz, s.face + Math.PI * 0.5); W.kitState.rockers.push({ x: sx, z: sz, s: sh, rot: s.face + Math.PI * 0.5 }); D.coll(sx, sz, 0.55); }
    D.coll(s.x, s.z, 1.25);
    const [bx, bz] = D.lp(s, 0.6, 2.3); if (D.ok(bx, bz, 0.4)) { addPiece(W, Pr.bambooBench(0), bx, bz, s.face + Math.PI); D.coll(bx, bz, 0.5); }
    const [lx, lz] = D.lp(s, 2.1, -0.6); if (D.ok(lx, lz, 0.3)) { addPiece(W, Pr.lantern(40, { s: 0.75 }), lx, lz, s.face, { mul: 0.64 }); D.coll(lx, lz, 0.28); }
    for (let i = 0; i < 5; i++) { const a = s.face + 0.6 + i * 0.5, x = s.x + Math.cos(a) * 2.0, z = s.z + Math.sin(a) * 1.7; if (D.ok(x, z, 0.05)) PL.multi(F.mossBoulder(i, { moss: 0.5, sq: 0.5 }), x, -0.12, z, { rot: a, s: 0.35 + D.r() * 0.2 }); }
    for (let i = 0; i < 3; i++) { const [x, z] = D.lp(s, D.rnd(-1.8, 1.8), D.rnd(-1.7, -1.3)); if (D.ok(x, z, 0.05)) D.W.ddTuft(D.CL, x, z, 1.2, '#3e7a3a', '#9cc866'); }
  },
  lanterns(D, A) { // a lantern walk: pairs of stone lanterns along the room's main trail, moss cushions between
    prep(D, A); const W = D.W;
    const ln = A.lanes.filter(l => !l[5]).sort((a, b) => Math.hypot(b[2] - b[0], b[3] - b[1]) - Math.hypot(a[2] - a[0], a[3] - a[1]))[0]; if (!ln) return;
    const len = Math.hypot(ln[2] - ln[0], ln[3] - ln[1]); if (len < 3) return;
    const ux = (ln[2] - ln[0]) / len, uz = (ln[3] - ln[1]) / len, nx = -uz, nz = ux;
    let n = 0;
    for (let t = 2.2; t < len - 1.5 && n < 6; t += 2.6) for (const e of [-1, 1]) {
      const x = ln[0] + ux * t + nx * e * 1.8, z = ln[1] + uz * t + nz * e * 1.8;
      if (!D.ok(x, z, 0.35) || !D.fits(A, x, z, 0.35, { collide: true, core: 0.3 }, 'open', true, 0, 0)) continue;
      D.claim(x, z, 0.35, true, 0.4, 0.3); n++;
      addPiece(W, Pr.lantern(50 + n, { s: 0.75 }), x, z, Math.atan2(-nx * e, -nz * e), { lights: false, mul: 0.64 }); D.coll(x, z, 0.28);
      W.halos.add(x, 0.7, z, 1.4, P.lantern, 0.55, 1); if (n % 2) D.light(x, 1.1, z, P.lantern, 3, 5, 0.6);
    }
  },
  charms(D, A) { // the charm wall: an ema rack, an omikuji line, a shimenawa on two stakes with shide, gohei
    prep(D, A); const W = D.W;
    const s = D.put(A, 1.6, { mode: 'wall', hug: 0.6, camPref: 1.4, core: 0.55 }); if (!s) return;
    const pc = Pr.kit(31 + Math.floor(D.r() * 3), B => {
      B.at([-0.75, 0, 0], 0, () => emaRack(B, { w: 0.9, h: 1.0 }));
      B.at([0.75, 0, 0], 0, () => omikuji(B, { w: 0.9, h: 0.95 }));
    }, 0.01);
    addPiece(W, pc, s.x, s.z, s.face); D.coll(s.x, s.z, 0.6);
    for (const e of [-1, 1]) { const [x, z] = D.lp(s, e * 1.6, 0.8); if (D.ok(x, z, 0.15)) { addPiece(W, gohei(e + 5, 1.3), x, z, s.face); D.coll(x, z, 0.14); } }
    const [mx, mz] = D.lp(s, 0, 1.4); if (D.ok(mx, mz, 0.1)) addPiece(W, stoneMarker(2), mx, mz, s.face, { s: 0.8 });
  },
  harvest(D, A) { // a harvest camp: cut culms on a rack, baskets of takenoko, a bamboo fence
    prep(D, A); const W = D.W;
    const s = D.put(A, 1.8, { mode: 'wall', hug: 0.55, camPref: 1.2, core: 0.7 }); if (!s) return;
    addPiece(W, culmStack(Math.floor(D.r() * 3)), s.x, s.z, s.face + Math.PI / 2); D.coll(s.x, s.z, 0.8);
    for (const lx of [-1.5, 1.4]) { const [x, z] = D.lp(s, lx, 0.7); if (D.ok(x, z, 0.3)) { addPiece(W, shootBasket(Math.floor(D.r() * 3)), x, z, D.r() * TAU); D.coll(x, z, 0.3); } }
    const f = D.put(A, 1.6, { mode: 'wall', hug: 0.7, camPref: 1, core: 0.35 });
    if (f) { const [fx, fz] = D.lp(f, -1.4, 0); addPiece(W, Pr.fence(2, { L: 2.8 }), fx, fz, f.face); D.coll(f.x, f.z, 0.3); }
  },
  fallen(D, A) { prep(D, A); ROOMS._fallen(D, A, 2 + Math.floor(D.r() * 2)); },
  _fallen(D, A, n) { // fallen culms lying across the floor (walked over), a mossy boulder, a stump with a shoot
    const W = D.W, PL = placer(W), B = W.solid;
    for (let i = 0; i < n; i++) {
      const s = D.put(A, 1.6, { collide: false }); if (!s) continue;
      const a = D.r() * TAU, L = 2.4 + D.r() * 1.4, ux = Math.cos(a), uz = Math.sin(a), R = 0.07 + D.r() * 0.03;
      const pts = []; for (let k = 0; k <= 6; k++) { const t = k / 6 - 0.5; pts.push({ p: V(s.x + ux * t * L, R * 0.9 + Math.sin((t + 0.5) * Math.PI) * 0.04, s.z + uz * t * L), r: R }); }
      if (!pts.every(q => W.walkable(q.p.x, q.p.z))) continue;
      B.addGeo(tube(pts, 6, true), s.x, s.z, null, (px, py, pz, nx, ny, nz, o) => { const k = (((px - s.x) * ux + (pz - s.z) * uz) / 0.42 + 9) % 1; o.copy(col('#b8b46a')).lerp(col('#d8cc8a'), clamp(ny * 0.4 + 0.4)); if (k > 0.92) o.multiplyScalar(0.62); if (ny > 0.5 && Math.sin(px * 6 + pz * 5) > 0.5) o.lerp(col('#7ca856'), 0.4); });
      PL.multi(F.litter(i, 'bamboo'), s.x + uz * 0.4, 0.005, s.z - ux * 0.4, { rot: a, s: 0.8 });
    }
    const b = D.put(A, 0.8); if (b) { PL.multi(F.mossBoulder(Math.floor(D.r() * 4), { moss: 0.7 }), b.x, -0.07, b.z, { rot: D.r() * TAU, s: 0.7 }); D.coll(b.x, b.z, 0.42); }
  },
};
function extras(D, A) { // every room: bamboo against its far walls, a mossy rock pillar in the bigger ones, stone markers, ferns, the stream's reeds
  prep(D, A); const W = D.W, PL = placer(W);
  for (let t = 0, n = 0, want = A.cells.length > 70 ? 3 : 2; t < 10 && n < want; t++) { // bamboo crowding the far walls (the camera looks past them)
    const s = D.spot(A, 0.8, { mode: 'wall', hug: 0.65, camPref: 2.4, core: 0.42 }); if (!farFacing(s)) continue;
    D.claim(s.x, s.z, 0.8, true, 0.9, 0.42); n++;
    PL.multi(F.stand(D.r() < 0.35 ? 'clump' : 'young', Math.floor(D.r() * 2)), s.x, -0.05, s.z, { rot: D.r() * TAU, s: 0.72 + D.r() * 0.2 }); D.coll(s.x, s.z, 0.42);
    for (let i = 0; i < 2; i++) { const [x, z] = D.lp(s, D.rnd(-1, 1), D.rnd(0.5, 1.2)); if (D.ok(x, z, 0.05)) PL.multi(F.shoot(Math.floor(D.r() * 6)), x, 0, z, { rot: D.r() * TAU, s: 0.6 + D.r() * 0.5 }); }
  }
  if (A.cells.length > 60) { const s = D.put(A, 1.1, { core: 0.75, ring: 1.6 }); if (s) { addPiece(W, rockPillar(Math.floor(D.r() * 4)), s.x, s.z, D.r() * TAU, { s: 0.85 + D.r() * 0.3 }); D.coll(s.x, s.z, 0.75); PL.multi(F.fern(Math.floor(D.r() * 4), { big: 0.8 }), s.x + 0.9, 0, s.z + 0.5, { rot: D.r() * TAU }); } }
  for (let i = 0, n = 1 + Math.floor(D.r() * 2); i < n; i++) { const s = D.put(A, 0.45, { mode: 'wall', hug: 0.7, core: 0.25 }); if (s) { if (D.r() < 0.5) { addPiece(W, stoneMarker(i), s.x, s.z, s.face, { s: 0.8 + D.r() * 0.3 }); D.coll(s.x, s.z, 0.25); } else PL.multi(F.fern(Math.floor(D.r() * 4), { big: 0.9 }), s.x, 0, s.z, { rot: D.r() * TAU }); } }
  for (const st of W.kitState.streams) if (st.room === A.rm.id) for (let k = 0; k < st.pts.length; k++) {
    const [x, z] = st.pts[k], a = D.r() * TAU, d = 1.55 + D.r() * 0.3, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
    if (D.ok(px, pz, 0.05) && !inStream(W, px, pz, 0.28) && D.r() < 0.6) PL.multi(F.hosta(k % 3, 'blue'), px, 0, pz, { rot: a, s: 0.7 });
  }
}
function arrival(D, A) { // the way home: a torii framing the exit portal, lanterns either side, a slab landing
  const W = D.W, L = D.L, px = (L.start.x + 0.5) * CELL - 1.6, pz = (L.start.y + 0.5) * CELL - 1.6;
  D.decal(1, px, pz, 1.25, 0.85, -Math.PI / 4, 3);
  const tx = px - CAMX * 0.5, tz = pz - CAMZ * 0.5;
  if (W.walkable(tx, tz)) { addPiece(W, Pr.torii(9, { w: 2.2, h: 2.5 }), tx, tz, CAM); for (const e of [-1, 1]) D.coll(tx + CAMX * e * 1.1, tz - CAMZ * e * 1.1, 0.16); }
  for (const e of [-1, 1]) { const x = px + CAMX * e * 1.9, z = pz - CAMZ * e * 1.9; if (W.walkable(x, z) && !W.collision.solidAt(x, z, 0.2)) { addPiece(W, Pr.lantern(60 + e, { s: 0.75 }), x, z, CAM, { mul: 0.64 }); D.coll(x, z, 0.28); } }
  D.claim(px, pz, 1.4, false);
}
function hoard(D, A) { // the treasure dais: the gold chest on stone steps, a little torii behind it, gohei and coins
  const W = D.W;
  for (const c of D.L.chests) {
    if (c.quality !== 'gold' || D.roomAt((c.x + 0.5) * CELL, (c.y + 0.5) * CELL) !== A.rm.id) continue;
    const x0 = (c.x + 0.5) * CELL, z0 = (c.y + 0.5) * CELL;
    W.kitDecal(1, x0, z0, 1.35, 1.1, CAM, 3);
    const tx = x0 - CAMX * 1.3, tz = z0 - CAMZ * 1.3;
    if (W.walkable(tx, tz) && !W.collision.solidAt(tx, tz, 0.1)) { addPiece(W, Pr.torii(12, { w: 1.6, h: 1.9 }), tx, tz, CAM); for (const e of [-1, 1]) D.coll(tx + CAMX * e * 0.8, tz - CAMZ * e * 0.8, 0.14); }
    for (const e of [-1, 1]) { const x = x0 + CAMX * e * 1.7 - CAMX * 0.5, z = z0 - CAMZ * e * 1.7 - CAMZ * 0.5; if (W.walkable(x, z) && !W.collision.solidAt(x, z, 0.2)) { addPiece(W, gohei(e + 8, 1.2), x, z, CAM); D.coll(x, z, 0.14); } }
  }
  D.hoard(A);
}
function corridor(D, x, z, face, q) {
  const W = D.W, PL = placer(W);
  if (inStream(W, x, z, 0.2)) return;
  if (q < 0.3) PL.multi(F.fern(Math.floor(D.r() * 4), { big: 0.55 + D.r() * 0.3 }), x, 0, z, { rot: D.r() * TAU });
  else if (q < 0.5) PL.multi(F.shoot(Math.floor(D.r() * 6)), x, 0, z, { rot: D.r() * TAU, s: 0.6 + D.r() * 0.4 });
  else if (q < 0.66) PL.multi(F.mossMound(Math.floor(D.r() * 4)), x, -0.02, z, { rot: D.r() * TAU, s: 0.5 });
  else if (q < 0.84) PL.multi(F.litter(Math.floor(D.r() * 4), 'bamboo'), x, 0.005, z, { rot: D.r() * TAU });
  else for (let i = 0; i < 3; i++) W.ddPebble(D.CL, x + (D.r() - 0.5) * 0.5, z + (D.r() - 0.5) * 0.5, 0.05 + D.r() * 0.06, col('#8e9282'), '#a8bc84');
}

// ------------------------------------------------------------------ ambience
const _bladeFn = (q, dt) => { q.ph += dt * q.w; q.vx = q.bx + Math.sin(q.ph) * 0.45; q.vz = q.bz + Math.cos(q.ph * 0.7) * 0.3; q.rot += Math.sin(q.ph * 1.3) * dt * 1.6; };
function update(W, dt, t, vfx, focus) {
  const ks = W.kitState; if (!vfx || !focus) return;
  // dust motes turning slowly in the shafts of light
  for (const s of ks.shafts || []) {
    if ((s.x - focus.x) ** 2 + (s.z - focus.z) ** 2 > 18 * 18 || Math.random() > dt * 2.2) continue;
    vfx.dot.spawn({ x: s.x + rand(-0.6, 0.6), y: rand(0.6, 3.2), z: s.z + rand(-0.6, 0.6), vx: rand(-0.04, 0.04), vy: -rand(0.03, 0.08), vz: rand(-0.04, 0.04), life: rand(2.5, 4), size: rand(0.035, 0.06), color: '#f4ffe0', alpha: 0.7, alpha1: 0, fadeIn: 0.8 });
  }
  // bamboo blades drifting down from the cracks above
  ks.leafAcc = (ks.leafAcc || 0) + dt * 2.6;
  while (ks.leafAcc > 1) {
    ks.leafAcc--;
    const x = focus.x + rand(-13, 13), z = focus.z + rand(-11, 11); if (!W.walkable(x, z)) continue;
    const q = vfx.leaf.spawn({ x, y: rand(4.5, 7), z, vy: -rand(0.45, 0.7), life: 9, size: rand(0.16, 0.22), stretch: 3.2, color: ['#d6c070', '#b8c060', '#a6c456', '#e0d090'][Math.floor(Math.random() * 4)], alpha: 0.95, alpha1: 0.9, fadeIn: 0.6, fn: _bladeFn });
    q.ph = rand(0, TAU); q.w = rand(1.2, 2.2); q.bx = rand(-0.15, 0.15); q.bz = rand(-0.15, 0.15);
  }
  // fireflies over the moss
  ks.flyAcc = (ks.flyAcc || 0) + dt * 2.2;
  while (ks.flyAcc > 1) {
    ks.flyAcc--;
    const x = focus.x + rand(-11, 11), z = focus.z + rand(-9, 9); if (!W.walkable(x, z) || W.decoAt(x, z)[0] < 0.2) continue;
    vfx.glow.spawn({ x, y: rand(0.3, 1.6), z, vx: rand(-0.25, 0.25), vy: rand(-0.05, 0.12), vz: rand(-0.25, 0.25), life: rand(2.5, 4), size: rand(0.08, 0.13), color: '#d8ff7a', alpha: 0.9, alpha1: 0, fadeIn: 0.8, flicker: rand(4, 7) });
  }
  // drips from the seeps, each ringing the pool below
  for (const d of ks.drips) {
    if ((d.x - focus.x) ** 2 + (d.z - focus.z) ** 2 > 22 * 22) continue;
    d.t -= dt; if (d.t > 0) continue; d.t = rand(1.4, 3.2);
    vfx.dot.spawn({ x: d.x + rand(-0.04, 0.04), y: d.y, z: d.z, vy: -0.4, life: Math.sqrt(2 * d.y / 12) + 0.05, size: 0.07, color: '#bff4ff', alpha: 0.95, alpha1: 0.8, grav: 12 });
  }
  // mist breathing over the streams
  for (const m of ks.mists) { // (sparse and faint: overlapping wisps must never become a sheet)
    if ((m.x - focus.x) ** 2 + (m.z - focus.z) ** 2 > 16 * 16 || Math.random() > dt * 0.3) continue;
    vfx.smoke.spawn({ x: m.x + rand(-0.6, 0.6), y: 0.12, z: m.z + rand(-0.6, 0.6), vx: rand(-0.08, 0.08), vy: rand(0.04, 0.09), vz: rand(-0.08, 0.08), life: rand(2.6, 3.6), size: 0.6, size1: 1.5, color: '#e8fff4', alpha: 0.06, alpha1: 0, fadeIn: 1.0 });
  }
  // the shishi-odoshi rock and clack
  for (const k of ks.rockers) {
    if (!k.mesh) continue;
    const c = Pr.shishiCycle(t + k.x * 0.3); k.mesh.rotation.z = c.a;
    if (c.clackWindow && !k.clacked) { k.clacked = true; if ((k.x - focus.x) ** 2 + (k.z - focus.z) ** 2 < 20 * 20) Events.emit('sfx', 'env_shishi_odoshi', { pos: k.mesh.position }); } else if (!c.clackWindow) k.clacked = false;
  }
}
function finish(W) {
  // the shishi-odoshi rockers are loose meshes (animated): one shared toon material, their geometry cached by the kit
  const ks = W.kitState;
  if (ks.rockers.length) {
    const mat = (ks.rockMat ||= makeToon({ vertexColors: true, rim: 0.35, brush: 0.14 }));
    for (const k of ks.rockers) {
      const m = new THREE.Mesh(k.s.rocker.geo, mat); m.castShadow = true;
      const q = k.s.rocker.pivot.clone().applyAxisAngle(UP, k.rot);
      m.position.set(k.x + q.x, q.y, k.z + q.z); m.rotation.order = 'YXZ'; m.rotation.y = k.rot;
      W.scene.add(m); k.mesh = m;
    }
  }
  return finishPlacer(W);
}

export const BAMBOO_KIT = {
  id: 'bambooCave',
  floorGLSL: FLOOR, bossGLSL: ARENA, wallGLSL: WALL,
  // the face swells out into a heavy overhanging brow (0.6 m over the room at 0.9 h), a moss fringe on its nose, then
  // the rock heaves up behind (1.1 h → 1.3 h) before it drops away into the void: the walls imply the roof
  profile: (h, D, j) => [[-0.36, -0.02, 'foot', 1], [-0.26 + j[0], 0.22 * h, 'rock', 1], [-0.14 + j[1], 0.46 * h, 'rock', 1], [-0.18 + j[2], 0.66 * h, 'rock', 1],
    [-0.34 + j[2], 0.8 * h, 'rock', 1], [-0.58 + j[2] * 0.6, 0.91 * h, 'rock', 1], [-0.58 + j[2] * 0.6, 0.91 * h, 'lip', 0], [-0.6, 0.99 * h, 'lip', 0], [-0.44, 1.06 * h, 'moss', 0],
    [-0.16, 1.1 * h, 'moss', 0], [-0.16, 1.1 * h, 'top', 3], [D * 0.5 + 0.2, 1.2 * h + j[3], 'top', 3], [D + 0.2, 1.3 * h + j[3] * 0.6, 'top', 3],
    [D + 0.2, 1.3 * h, 'topBack', 0], [D * 1.15 + 0.35, 0.55 * h, 'back', 0], [D * 1.25 + 0.45, -0.02, 'void', 0]],
  roles: { foot: ['#4a5246', '#525a4c'], rock: ['#7c8274', '#8a9080'], lip: ['#3e5a34', '#46623a'], moss: ['#46703a', '#4e7a40'], top: ['#ffffff', '#f4f4f0'], topBack: ['#30382f', '#363e34'], back: ['#141c18', '#18201c'] },
  wallH: [3.1, 0.9, 0.5], ds: 0.5, brush: 0.24,
  deco: { lush: 1.0, crack: 0, acc: 0.9, path: 1 }, sig: P.sig, cap: '#5e7e4c',
  init(W) { W.kitState = { rockers: [], drips: [], streams: [], mists: [], shafts: [] }; W.kitDecal = (...a) => kitDecal(W, ...a); W.arenaLanterns = []; },
  decoMap, dressWalls, buildProps, buildLights, buildShafts, buildCenterpieces, buildArena, buildLandmarks, buildDressing, finish, update,
  dispose(W) { disposePlacer(W); },
  purposes: ['grotto', 'thicket', 'clapper', 'lanterns', 'charms', 'harvest', 'fallen'], dupes: ['clapper', 'grotto'],
  rooms: ROOMS, extras, arrival, hoard, corridor,
  seal: { color: '#d6ff9a', rope: '#ecd8a0' }, // the arena seal's look (dungeon/zoneRun.js)
};
