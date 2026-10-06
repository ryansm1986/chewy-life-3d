// Onsen Caverns: the onsen ice caverns (docs/ZONES.md §8.2; ROADMAP Z-C1). Ice caves under Yukimi Onsen: the springs'
// own assets (regions/assets/onsenProps.js, onsenFlora.js) dress them, so the dungeon reads as the same place gone
// underground. Blue ice and dark rock, with warm pockets of steam and lantern light.
//  - floor (shader): packed snow (pillowy humps lit from the upper left, wind ripples), frozen slate flags on the trodden
//    runs and down the corridors (snow packed in the joints), fresh snow cushions with rime stars, glare-ice patches
//    (deep blue, cracked plates, trapped bubbles, a sheen), snow banked against the wall foot, dark slate pebbles in
//    snow caps; a melt-water rill through some chambers (decor b: thawed banks, shelf ice over dark running water);
//    HOT-SPRING POCKETS (kit uniform uPools): steaming teal pools with the lantern-orange glow in them, a ring of thawed,
//    wet dark stone and moss round each, slush at its rim (kind 1: a frozen pool, solid ice); round plazas of frosted
//    slate in the shrine and treasure rooms; the arena: a ring of fitted slate round a frozen lake inlaid with a snowflake.
//  - walls: dark slate strata sheathed in translucent blue ice (layered, cracked, frozen bubbles, frost on the sheet's
//    rim), ice flows running down from the brow, snow on the ledges; a heavy overhanging icy brow with an icicle fringe;
//    above it the rock heaves up into the dark under snow.
//  - light: a dim cool base, warm lantern pools, the springs' warm glow and steam, a few pale shafts falling through ice
//    in the roof (kit buildShafts), and a dark cool band along every wall foot.
//  - dressing: ice crystals bursting out of the rock, frozen falls, icicle curtains, lantern niches, steaming vents, ropes
//    of shide; drifts, frost grass, ice chunks and icicle shards at the wall foot; yukimi lanterns (the room lights); along
//    the walls and in the corners mid-scale clusters (ice crystals, drift heaps, frozen barrels, lantern groups, steaming
//    vents), the middle of every chamber kept clear for the fight.
//  - rooms: a hot-spring pocket (a bench, oke buckets, a snow monkey soaking), the old bath corner (duckboards, stools,
//    towels), a frozen fall, an ice-crystal grove, a lantern walk, a snowed-in shrine with jizō, a frozen storeroom; the
//    arrival framed by a snow torii; a treasure dais.
//  - the arena (Yuki-onna's frozen hall): yukimi lanterns round the ring (world.arenaLanterns: their warmth is safe
//    ground in her whiteout), a snow torii at the mouth, a frozen fall and a little shrine on the far side, ice crystals,
//    a pale shaft.
//  - ambience: snow sifting down from the cracks, steam curling off the springs and vents, drips from the icicles, motes
//    in the shafts.
import * as THREE from 'three';
import { SH, M, MD, col } from '../dungeonWorld.js';
import { tube, puff } from '../../gfx/geom.js';
import { mulberry32, clamp, TAU, rand } from '../../core/util.js';
import * as F from '../../regions/assets/onsenFlora.js';
import * as Pr from '../../regions/assets/onsenProps.js';
import { kit, slab } from '../../regions/assets/bambooProps.js';
import { jizo } from '../../regions/assets/mapleProps.js';
import { V } from '../../regions/assets/bambooKit.js';
import { G as BG, C as BC } from '../../world/buildings/kit.js';
import { roof } from '../../world/buildings/roofs.js';
import { shimenawa, bucket, firewood, sack } from '../../world/buildings/props2.js';
import { barrel, crate, chochin } from '../../world/buildings/props.js';
import { addPiece, finishPlacer, disposePlacer, topSpan, grad, freeAt, glc as g, toCam, CAM, CAMX, CAMZ, CELL, inStream, kitDecal, roofShafts, wallSpots } from './common.js';

// ------------------------------------------------------------------ palette
const P = {
  snow: '#dfe8f3', snowSh: '#b0c2da', snowBlue: '#93acd2', slabA: '#7e899e', slabB: '#97a2b6', joint: '#d6e2f0',
  iceDk: '#2a568f', ice: '#4f82c2', iceLt: '#8fbfea', iceHi: '#e0f2ff', rock: '#4a5468', rockLt: '#6c788e', rockDk: '#2c3444',
  lantern: '#ffbe78', warm: '#ffa860', steam: '#ffe6d2', sig: '#bfe8ff',
};
const SNOW = new THREE.Color(P.snow), SNOW_SH = new THREE.Color(P.snowSh), SNOW_BLUE = new THREE.Color(P.snowBlue); // (not col(): dungeonWorld.js imports this module, so its exports aren't live yet at load)
const POOL_MAX = 16;

// ------------------------------------------------------------------ floor shader
const PARS = /* glsl */`
uniform vec4 uPools[${POOL_MAX}];
float sdSegI(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
// a six-armed snowflake (two side branches an arm, a hexagonal ring at the heart), signed distance
float flakeSD(vec2 d, float Rt) {
  float r = length(d), a = atan(d.y, d.x), s = 1.0471976;
  a = mod(a + s * 0.5, s) - s * 0.5; vec2 q = vec2(cos(a), abs(sin(a))) * r;
  float sd = sdSegI(q, vec2(Rt * 0.24, 0.0), vec2(Rt, 0.0)) - Rt * 0.05;
  sd = min(sd, sdSegI(q, vec2(Rt * 0.48, 0.0), vec2(Rt * 0.48, 0.0) + vec2(0.5, 0.866) * Rt * 0.3) - Rt * 0.038);
  sd = min(sd, sdSegI(q, vec2(Rt * 0.74, 0.0), vec2(Rt * 0.74, 0.0) + vec2(0.5, 0.866) * Rt * 0.18) - Rt * 0.032);
  float hex = r * cos(a) - Rt * 0.17; // (q.x: the hexagon's apothem along this sector)
  sd = min(sd, abs(hex) - Rt * 0.035);
  return sd;
}
`;
const FLOOR = /* glsl */`
  {
    // packed snow: soft blue-white, broad cool drifts of colour, a fine grain, gentle low humps lit from the upper left,
    // wind ripples in places and a crisp sparkle
    float bigS = fbm(p * 0.04 + 11.0);
    c = mix(c, c * vec3(0.9, 0.95, 1.06), smoothstep(0.5, 0.8, bigS) * 0.5);
    c = mix(c, c * vec3(1.03, 1.02, 1.0), smoothstep(0.42, 0.2, bigS) * 0.4);
    c *= 0.975 + 0.035 * vn(p * 4.3 + 5.0);
    float hc = fbm(p * 0.16 + 21.0), hx = fbm(p * 0.16 + vec2(21.3, 21.0)) - hc, hz = fbm(p * 0.16 + vec2(21.0, 21.3)) - hc;
    c *= 1.0 + clamp((-hx * 0.54 - hz * 0.84) * 4.0, -0.07, 0.07);
    float rip = sin(dot(p, vec2(0.55, 1.25)) * 3.1 + fbm(p * 0.3 + 4.0) * 6.0);
    c *= 1.0 - 0.05 * smoothstep(0.55, 1.0, rip) * smoothstep(0.5, 0.75, vn(p * 0.11 + 2.0)) * smoothstep(1.2, 2.4, wd);
    fG += ${g('#e8f6ff')} * twinkle(p, 5.0, 0.9) * 0.35 * smoothstep(1.0, 2.0, wd);
    float sb = dc.b + (vn(p * 1.6 + 2.0) - 0.5) * 0.07;            // the melt rill (decor b)
    float bank = smoothstep(0.14, 0.34, sb), wat = smoothstep(0.42, 0.5, sb);
    // frozen slate flags on the trodden runs (decor g) and down the corridors, snow packed in the joints
    float tr = smoothstep(0.34, 0.74, dc.g + (vn(p * 1.1) - 0.5) * 0.26);
    float fk = max(tr, rid == 0 ? smoothstep(0.7, 1.7, wd) : 0.0) * (1.0 - bank);
    if (fk > 0.01) {
      vec2 tc; vec3 v = vor(p * 1.05 + 3.0, tc);
      float on = smoothstep(0.34, 0.42, fk + (v.z - 0.5) * 0.6);  // stones drop out one by one toward a run's rim
      float lit = clamp(dot(normalize(-tc + 1e-4), vec2(0.54, 0.84)) * 0.5 + 0.5, 0.0, 1.0);
      vec3 st = mix(${g(P.slabA)}, ${g(P.slabB)}, v.z) * (0.9 + 0.12 * vn(p * 5.0));
      st *= 0.9 + 0.16 * lit * smoothstep(0.0, 0.35, v.x);
      st = mix(st, st * vec3(0.9, 0.97, 1.1), smoothstep(0.5, 0.8, vn(p * 1.7 + v.z * 9.0)) * 0.5);
      st = mix(st, ${g('#d8e4f2')}, smoothstep(0.13, 0.04, v.y) * 0.5 * smoothstep(0.4, 0.75, vn(p * 2.0 + 3.0))); // frost feathering in from the joints
      vec3 jc = mix(${g(P.joint)}, ${g('#bccbe0')}, vn(p * 2.3));
      vec3 flag = mix(jc, st, smoothstep(0.03, 0.08, v.y));
      c = mix(c, c * 0.88, smoothstep(0.0, 0.25, fk) * (1.0 - on) * 0.3);
      c = mix(c, flag, on);
    }
    // fresh snow (decor r): raised drifts of bright, clean snow, their side toward the light catching it and the far side
    // in a soft blue shade (the drift's own height is the decor value: a second look-up toward the light gives the
    // slope), a crisp blue shadow line at the foot; rime stars on them (decor a)
    float nzL = (fbm(p * 0.7 + 4.0) - 0.5) * 0.5;
    float lu = smoothstep(0.26, 0.6, dc.r + nzL) * (1.0 - wat);
    if (lu > 0.001) {
      float luL = smoothstep(0.26, 0.6, texture2D(uDeco, (p + vec2(0.54, 0.84) * 0.6) / uSize).r + nzL);
      float lob = lu - (vn(p * 2.3 + 7.0) - 0.5) * 0.16;
      float sl = clamp((lu - luL) * 1.6, -1.0, 1.0);
      vec3 sc = ${g(P.snow)} * (1.0 + 0.04 * vn(p * 1.1 + 2.0));
      sc = mix(sc, ${g(P.snowBlue)}, clamp(-sl, 0.0, 1.0) * 0.55);
      sc *= 1.0 + clamp(sl, 0.0, 1.0) * 0.1;
      c = mix(c, c * vec3(0.7, 0.78, 0.94), smoothstep(0.1, 0.26, lob) * (1.0 - smoothstep(0.26, 0.4, lob)) * 0.6);
      c = mix(c, sc, smoothstep(0.26, 0.36, lob));
      fG += ${g('#eef8ff')} * twinkle(p + 3.0, 4.2, 0.82) * lu * 0.5;
      float fa = smoothstep(0.2, 0.6, dc.a) * smoothstep(0.35, 0.7, lu);
      if (fa > 0.01) {
        vec2 fc = floor(p * 3.2); vec2 fo = fract(p * 3.2) - 0.5 - (h2(fc + 3.0) - 0.5) * 0.5; float fh = h1(fc + 17.0);
        float has = step(0.66, fh) * fa, fr = length(fo), fan = atan(fo.y, fo.x);
        float arm = smoothstep(0.022, 0.0, abs(sin(fan * 3.0)) * fr) * smoothstep(0.15, 0.1, fr);
        c = mix(c, c * 0.84, smoothstep(0.17, 0.12, length(fo - vec2(0.025, -0.025))) * has * 0.3);
        c = mix(c, vec3(1.0), arm * has * 0.8);
        fG += ${g('#dff4ff')} * arm * has * twinkle(p, 3.2, 0.5) * 0.5;
      }
    }
    // glare ice: smooth deep-blue sheets, long branching cracks, trapped bubbles and a sheen, a frosted rim
    float gi0 = vn(p * 0.17 + 21.0) + (vn(p * 0.9 + 4.0) - 0.5) * 0.06;
    float giK = smoothstep(1.6, 2.6, wd) * (1.0 - tr) * (1.0 - bank) * (1.0 - lu);
    float gi = smoothstep(0.76, 0.775, gi0) * giK;
    if (gi0 > 0.7 && giK > 0.01) {
      c = mix(c, c * vec3(0.86, 0.92, 1.02), smoothstep(0.7, 0.76, gi0) * (1.0 - gi) * 0.4 * giK);
      if (gi > 0.001) {
        float dep = smoothstep(0.76, 0.88, gi0);
        vec3 ice = mix(${g(P.iceLt)}, ${g(P.ice)}, dep);
        ice = mix(ice, ${g(P.iceDk)}, dep * smoothstep(0.4, 0.8, vn(p * 0.5 + 2.0)) * 0.5);
        ice *= 0.96 + 0.06 * vn(p * 1.3);
        vec2 bc = floor(p * 4.0); vec2 bo = fract(p * 4.0) - 0.5 - (h2(bc + 7.0) - 0.5) * 0.6; float bh = h1(bc + 9.0);
        float bub = step(0.82, bh) * smoothstep(0.03, 0.0, abs(length(bo) - 0.05 - 0.05 * bh));
        ice = mix(ice, ${g(P.iceHi)}, bub * 0.6 * dep);
        float crk = smoothstep(0.014, 0.0, abs(vn(p * 0.42 + 9.0) - 0.5)) + smoothstep(0.01, 0.0, abs(vn(p * 0.95 + 3.0) - 0.5)) * 0.6 * step(0.5, vn(p * 0.3 + 1.0));
        ice = mix(ice, ${g('#eef8ff')}, clamp(crk, 0.0, 1.0) * 0.65);
        float sh = smoothstep(0.7, 1.0, sin(dot(p, vec2(0.62, 0.78)) * 1.1 + vn(p * 0.3) * 3.0));
        ice = mix(ice, ${g('#d8eeff')}, sh * 0.22);
        ice = mix(ice, ${g('#e4eef8')}, (1.0 - smoothstep(0.76, 0.79, gi0)) * 0.7);
        c = mix(c, ice, gi);
        fG += ${g('#cfeaff')} * twinkle(p, 2.6, 0.84) * gi * 0.7;
      }
    }
    // snow banked against the wall foot in soft humps
    {
      float df = (1.0 - smoothstep(0.5, 1.6, wd + (vn(p * 0.7) - 0.5) * 0.7)) * smoothstep(0.3, 0.55, vn(p * 0.3 + 17.0)) * (1.0 - bank);
      float dh = fbm(p * 0.6 + 13.0), dx2 = fbm(p * 0.6 + vec2(13.2, 13.0)) - dh, dz2 = fbm(p * 0.6 + vec2(13.0, 13.2)) - dh;
      c = mix(c, ${g(P.snow)} * (0.97 + clamp((-dx2 * 0.54 - dz2 * 0.84) * 5.0, -0.1, 0.08)), df * 0.8);
    }
    // the melt rill: thawed dark banks with pebbles, then shelf ice over dark running water
    if (bank > 0.001) {
      vec2 pc2; vec3 pv = vor(p * 3.3 + 17.0, pc2);
      float peb = smoothstep(0.17, 0.11, pv.x) * step(0.4, pv.z);
      float plit = clamp(dot(normalize(-pc2 + 1e-4), vec2(0.54, 0.84)) * 0.5 + 0.5, 0.0, 1.0);
      vec3 pcol = mix(${g('#7c8698')}, ${g('#4e586a')}, pv.z) * (0.82 + 0.26 * plit);
      c = mix(c, c * vec3(0.5, 0.56, 0.66), bank * 0.85);
      c = mix(c, pcol, peb * bank * (1.0 - wat) * 0.9);
      if (wat > 0.0) {
        vec2 fl = p * 0.9 + vec2(uTime * 0.28, uTime * 0.18);
        float rp = vn(fl * 1.7) * 0.6 + vn(fl * 3.9 + 3.0) * 0.4;
        vec3 w = mix(${g('#1e4a66')}, ${g('#4a90b0')}, rp);
        w = mix(w, ${g('#163a56')}, smoothstep(0.62, 0.95, sb) * 0.45);
        float caus = smoothstep(0.035, 0.0, abs(vn(fl * 2.4 + 7.0) - 0.5)) * smoothstep(0.35, 0.75, vn(fl * 0.7 + 3.0));
        w = mix(w, ${g('#c8ecff')}, caus * 0.3);
        float shelf = 1.0 - smoothstep(0.52, 0.64, sb + (vn(p * 2.2 + 5.0) - 0.5) * 0.18);
        vec2 sc2; vec3 sv = vor(p * 2.0 + 9.0, sc2);
        vec3 sice = mix(${g('#9ec4e4')}, ${g('#d4e8f8')}, sv.z) * (1.0 - smoothstep(0.04, 0.0, sv.y) * 0.3);
        w = mix(w, sice, shelf * 0.92);
        c = mix(c, w, wat);
        fG += ${g('#bfe8ff')} * twinkle(p + vec2(uTime * 0.3, 0.0), 3.6, 0.75) * wat * (1.0 - shelf) * 1.1;
      }
    }
    // the hot-spring pockets (kit uniform uPools: x, z, r, kind): snow melted back off a ring of wet dark stone, moss by
    // the water, slush at the rim; the water warm teal, rippling, the steam's lantern-orange glowing in it (kind 1: a
    // frozen pool, solid blue ice with radial cracks; kind 2: a vent's little steaming puddle)
    for (int i = 0; i < ${POOL_MAX}; i++) {
      vec4 Q = uPools[i];
      if (Q.z <= 0.0) continue;
      vec2 d = p - Q.xy; float R = Q.z, r = length(d);
      if (r > R + 3.2) continue;
      float a = atan(d.y, d.x), wob = (vn(vec2(a * 1.6 + Q.x, Q.y)) - 0.5) * 0.5 + (vn(p * 1.4) - 0.5) * 0.25, rr = r + wob;
      bool frozen = Q.w > 0.5 && Q.w < 1.5;
      float tw = Q.w > 1.5 ? 0.55 : 1.0; // (a vent puddle thaws a smaller ring)
      if (!frozen) {
        float thaw = 1.0 - smoothstep(R + 0.7 * tw, R + 1.35 * tw, rr);
        float slush = smoothstep(R + 0.6 * tw, R + 1.0 * tw, rr) * (1.0 - smoothstep(R + 1.3 * tw, R + 2.0 * tw, rr));
        vec2 tc3; vec3 tv = vor(p * 1.6 + Q.xy, tc3);
        vec3 wet = mix(${g('#3a4458')}, ${g('#5a6680')}, tv.z) * (0.86 + 0.18 * clamp(dot(normalize(-tc3 + 1e-4), vec2(0.54, 0.84)) * 0.5 + 0.5, 0.0, 1.0));
        wet *= 1.0 - smoothstep(0.05, 0.0, tv.y) * 0.4;
        float mz = (1.0 - smoothstep(R + 0.1, R + 0.6 * tw, rr)) * smoothstep(0.38, 0.6, vn(p * 2.1 + 7.0));
        wet = mix(wet, mix(${g('#2e4e4c')}, ${g('#4a6e62')}, vn(p * 5.0)), mz * 0.45 * step(Q.w, 0.5));
        wet = mix(wet, wet * vec3(1.1, 1.0, 0.92), (1.0 - smoothstep(R, R + 1.2 * tw, rr)) * 0.25); // warmed by the glow
        c = mix(c, mix(c, ${g('#8a96a8')}, 0.5) * 0.86, slush * 0.6);
        c = mix(c, wet, thaw);
      } else {
        c = mix(c, c * vec3(0.8, 0.87, 1.0), (1.0 - smoothstep(R, R + 1.2, rr)) * 0.5);
      }
      float wat2 = 1.0 - smoothstep(R - 0.04, R + 0.04, r + wob * 0.25);
      if (wat2 > 0.0) {
        vec3 w2;
        if (!frozen) {
          vec2 fl = p * 1.3 + vec2(sin(uTime * 0.3 + Q.x), cos(uTime * 0.25 + Q.y)) * 0.6;
          float rp = vn(fl * 1.8) * 0.6 + vn(fl * 4.0 + 3.0) * 0.4;
          // (milky-blue onsen water: pale and shallow at the rim, deep teal-blue in the middle, rings spreading from the
          // spout, a glint of the steam's orange glow riding the ripples)
          w2 = mix(${g('#2a6e8a')}, ${g('#5aa8c0')}, rp);
          w2 = mix(w2, ${g('#6cb4c8')}, smoothstep(R - 0.45, R, r) * 0.5);
          w2 = mix(w2, ${g('#123e5a')}, smoothstep(0.15, R * 0.75, R - r) * 0.75);
          float ring = smoothstep(0.07, 0.0, abs(fract(r * 1.6 - uTime * 0.4) - 0.5) - 0.43) * (1.0 - r / R);
          w2 = mix(w2, ${g('#d8f4ff')}, ring * 0.32);
          float gl2 = smoothstep(0.58, 0.8, vn(fl * 2.2 + 5.0)) * smoothstep(0.0, 0.5, R - r);
          w2 = mix(w2, ${g('#ffc690')}, gl2 * 0.35);
          fG += ${g('#ff9a50')} * 0.03 * wat2 + ${g('#e8fbff')} * twinkle(p + vec2(uTime * 0.2, 0.0), 3.0, 0.78) * wat2 * 0.9;
        } else {
          vec2 ic2; vec3 iv2 = vor(p * 0.9 + Q.xy, ic2);
          w2 = mix(${g(P.iceLt)}, ${g(P.iceDk)}, smoothstep(0.0, R, R - r) * 0.8) * (0.92 + 0.1 * iv2.z);
          float rad = smoothstep(0.03, 0.0, abs(fract(a / 6.28318 * 9.0 + vn(vec2(r * 0.8, 1.0)) * 0.3) - 0.5) - 0.47) * step(0.25, r / R);
          w2 = mix(w2, ${g('#eef8ff')}, clamp(smoothstep(0.03, 0.0, iv2.y) + rad, 0.0, 1.0) * 0.6);
          w2 = mix(w2, ${g('#e4eef8')}, smoothstep(R - 0.35, R, r) * 0.6);
          fG += ${g('#cfeaff')} * twinkle(p, 2.8, 0.78) * wat2 * 0.8;
        }
        c = mix(c, w2, wat2);
      }
    }
    // the shrine and treasure rooms: a round plaza of fitted, frosted slate at the room's heart
    if (rid > 0) {
      vec4 Rm = uRoom[rid - 1]; vec4 K = uRoomK[rid - 1];
      if (K.x > 3.5 && K.x < 5.5) {
        vec2 ctr = (Rm.xy + Rm.zw) * 0.5; float rr2 = clamp(min(Rm.z - Rm.x, Rm.w - Rm.y) * 0.5 - 3.0, 1.6, 4.6);
        vec2 d0 = p - ctr; float r0 = length(d0), a0 = atan(d0.y, d0.x);
        if (r0 < rr2 + 1.0) {
          float ci = floor(r0 / 0.9), rad0 = (ci + 0.5) * 0.9, ns = max(1.0, floor(6.28318 * rad0 / 1.05)), off = h1(vec2(ci, 2.0));
          float uu = (a0 / 6.28318 + 0.5 + off) * ns, sj = floor(uu), frr = fract(r0 / 0.9), arc = min(fract(uu), 1.0 - fract(uu)) * 6.28318 * rad0 / ns;
          float gap = smoothstep(0.0, 0.07, min(frr, 1.0 - frr) * 0.9) * smoothstep(0.0, 0.06, arc);
          vec3 sc = mix(${g(P.slabA)}, ${g(P.slabB)}, h1(vec2(ci, sj))) * (0.92 + 0.1 * vn(p * 5.0));
          sc = mix(sc, ${g('#dbe6f2')}, smoothstep(0.5, 0.85, vn(p * 1.4 + ci)) * 0.35);
          if (ci < 0.5) { sc = mix(${g(P.slabB)}, ${g('#eef4fa')}, 0.35); gap = 1.0; }
          float inP = smoothstep(rr2 + 0.4, rr2, r0);
          c = mix(c, c * vec3(0.76, 0.82, 0.94), smoothstep(rr2 + 0.9, rr2 + 0.3, r0) * (1.0 - inP) * 0.5);
          c = mix(c, mix(${g(P.joint)}, sc, gap), inP);
        }
      }
    }
    // the cave closes in: a cool, dark band along every wall foot (the rock overhead shades it), the glows muted there
    float encl = smoothstep(0.5, 2.6, wd);
    c *= mix(vec3(0.34, 0.42, 0.58), vec3(1.0), encl);
    fG *= 0.45 + 0.55 * encl;
  }
`;
// the arena: a ring of fitted, frosted slate round a frozen lake (deep blue ice, cracked plates, trapped bubbles, a
// sheen), inlaid with Yuki-onna's snowflake and two rings, a dotted ring of frost stones near the lake's rim, all
// breathing with the sigil colour; uSigDim < 1 sinks it while the boss winds up
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
      sc = mix(sc, ${g('#d6e2f0')}, smoothstep(0.55, 0.85, vn(p * 1.3 + ci)) * 0.35);
      vec3 ring = mix(mix(${g(P.joint)}, ${g('#b8c8dc')}, vn(p * 2.0)), sc, gap);
      c = mix(c, ring, inRing);
      // the frozen lake
      float lake = 1.0 - smoothstep(r0 - 0.1, r0 + 0.05, r);
      vec2 ic; vec3 iv = vor(p * 0.32 + 3.0, ic);
      float dep = smoothstep(r0, 0.0, r);
      vec3 ice = mix(${g('#7eaede')}, ${g('#3e70b0')}, dep * 0.75) * (0.92 + 0.1 * iv.z);
      ice = mix(ice, ${g(P.iceDk)}, smoothstep(0.45, 0.85, vn(p * 0.18 + 5.0)) * dep * 0.5);
      vec2 bc = floor(p * 3.0); vec2 bo = fract(p * 3.0) - 0.5 - (h2(bc + 7.0) - 0.5) * 0.6; float bh = h1(bc + 9.0);
      ice = mix(ice, ${g(P.iceHi)}, step(0.84, bh) * smoothstep(0.03, 0.0, abs(length(bo) - 0.05 - 0.06 * bh)) * 0.55);
      ice = mix(ice, ${g('#e8f6ff')}, clamp(smoothstep(0.03, 0.0, iv.y) + smoothstep(0.014, 0.0, abs(vn(p * 0.9 + iv.z * 4.0) - 0.5)) * 0.5, 0.0, 1.0) * 0.6);
      ice = mix(ice, ${g('#d4ecff')}, smoothstep(0.7, 1.0, sin(dot(p, vec2(0.62, 0.78)) * 0.55 + vn(p * 0.16) * 3.0)) * 0.18);
      c = mix(c, c * vec3(0.72, 0.8, 0.94), smoothstep(r0 + 0.5, r0 - 0.1, r) * smoothstep(r0 - 1.2, r0 - 0.2, r) * 0.6);
      c = mix(c, ice, lake * 0.95);
      c = mix(c, ${g('#e6eef8')}, lake * smoothstep(r0 - 0.7, r0 - 0.05, r) * 0.6); // (frost creeping in from the ring)
      c = mix(c, ${g('#b8cce4')}, lake * smoothstep(0.58, 0.78, fbm(p * 0.14 + 7.0)) * 0.4 * (0.7 + 0.3 * vn(p * 2.0))); // drifts of rime dusting the ice
      // her snowflake: a filled inlay of pale frost with a crisp edge, two rings round it, a dotted ring of round stones
      float Rt = min(4.3, r0 * 0.34);
      float sd = flakeSD(d, Rt);
      float fillT = smoothstep(0.03, -0.03, sd), edgeT = smoothstep(0.09, 0.03, abs(sd));
      float circ = smoothstep(0.06, 0.0, abs(r - Rt * 1.12) - 0.05) + smoothstep(0.05, 0.0, abs(r - Rt * 1.22) - 0.03);
      vec2 dq = vec2((fract(a / 6.28318 * 44.0) - 0.5) * r * 6.28318 / 44.0, r - (r0 - 1.0));
      float dots = smoothstep(0.17, 0.11, length(dq));
      float sig = max(max(edgeT, circ), dots) * lake, fill = fillT * lake;
      float pulse = 0.6 + 0.4 * sin(uTime * 1.6 - r * 0.3);
      vec3 frostI = mix(${g('#d8e6f4')}, ${g('#f2f8ff')}, vn(p * 3.0));
      vec3 sigC = mix(c * 0.8, mix(frostI, uSig, 0.3), 0.35 + 0.65 * uSigDim);
      c = mix(c, frostI * 0.86, fill * 0.42);
      c = mix(c, c * 0.62, smoothstep(0.0, 0.6, edgeT * lake) * (1.0 - fill) * 0.35);
      c = mix(c, sigC, sig * (0.36 + 0.3 * uSigDim));
      c *= 1.0 - (1.0 - uSigDim) * 0.18 * lake;
      fG += uSig * (sig * 0.12 + fill * 0.02) * pulse * uSigDim * uSigDim;
      fG += ${g('#cfeaff')} * twinkle(p, 2.2, 0.84) * lake * (1.0 - fill) * 0.6;
    }
  }
`;
// ------------------------------------------------------------------ wall shader (kind 1: rock face, 3: the top)
const WALL = /* glsl */`
    if (vWall.z > 2.5) { // above the brow: dark boulders under snow heaving up into the dark, ice glinting in the cracks;
      // the snow lies deepest along the brow and the rock fades out of sight toward the back
      vec2 p = vCWorld.xz; float o = vWall.y, Dd = max(vWall.w, 0.6);
      vec2 q = p * 0.75 + uSeed; vec2 qi = floor(q), qf = fract(q); float md = 8.0, md2 = 8.0; vec2 mc = vec2(0.0), mr = vec2(0.0);
      for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) { vec2 gg = vec2(float(i), float(j)); vec2 rr = gg + h2(qi + gg) * 0.85 + 0.075 - qf; float dd = dot(rr, rr); if (dd < md) { md2 = md; md = dd; mc = qi + gg; mr = rr; } else if (dd < md2) md2 = dd; }
      float edge = sqrt(md2) - sqrt(md), bh = h1(mc + uSeed);
      vec3 c = mix(${g('#3c4558')}, ${g('#566078')}, bh) * (0.9 + 0.12 * vn(p * 3.0));
      float lit = clamp(dot(normalize(-mr + 1e-4), vec2(0.54, 0.84)) * 0.5 + 0.5, 0.0, 1.0);
      c *= 0.8 + 0.3 * lit * smoothstep(0.0, 0.5, edge);
      c *= 1.0 - smoothstep(0.1, 0.0, edge) * 0.5;
      // snow: thick along the brow, on the boulders' lit tops further back
      float sn = smoothstep(0.9, 0.15, o + (fbm(p * 0.9 + 3.0) - 0.5) * 0.9) + smoothstep(0.35, 0.75, lit) * smoothstep(0.15, 0.4, edge) * 0.6;
      vec3 scol = mix(${g('#aabcd8')}, ${g('#e2eaf4')}, lit * 0.8 + 0.2) * (0.94 + 0.08 * vn(p * 7.0));
      c = mix(c, scol, clamp(sn, 0.0, 1.0) * 0.9);
      wG += ${g('#bfe4ff')} * smoothstep(0.05, 0.0, edge) * twinkle(p * 1.3, 2.4, 0.86) * 0.3;
      c *= mix(1.0, 0.26, smoothstep(0.1, Dd + 0.3, o));
      diffuseColor.rgb *= c * 1.08;
    } else if (vWall.z > 0.5 && vWall.z < 1.5) { // the rock face, sheathed in ice
      float u = vWall.x, v = vWall.y, lip = vWall.w * 0.9;
      diffuseColor.rgb *= mix(1.0, 0.72, smoothstep(0.62, 0.88, v / max(vWall.w, 0.1))); // in the brow's shadow
      // dark slate strata with a colour drift along the face
      float wv = v * 1.2 + u * 0.08 + (vn(vec2(u * 0.15, 3.0)) - 0.5) * 0.8;
      float bi = floor(wv), bf = fract(wv), bh = h1(vec2(bi, uSeed + 7.0));
      vec3 st = bh < 0.34 ? vec3(1.02, 1.02, 1.08) : bh < 0.67 ? vec3(0.84, 0.88, 0.96) : vec3(1.1, 1.1, 1.14);
      diffuseColor.rgb *= mix(vec3(1.0), st, 0.7);
      diffuseColor.rgb *= 1.0 - smoothstep(0.06, 0.0, min(bf, 1.0 - bf)) * 0.24;
      // chunky blocks: a voronoi of big facets, each its own tone, a dark crack between and a lit top edge
      {
        vec2 q = vec2(u * 0.85, v * 1.25); vec2 qi = floor(q), qf = fract(q); float md = 8.0, md2 = 8.0; vec2 mc = vec2(0.0), mr = vec2(0.0);
        for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) { vec2 gg = vec2(float(i), float(j)); vec2 rr = gg + h2(qi + gg) * 0.85 + 0.075 - qf; float dd = dot(rr, rr); if (dd < md) { md2 = md; md = dd; mc = qi + gg; mr = rr; } else if (dd < md2) md2 = dd; }
        float edge = sqrt(md2) - sqrt(md);
        diffuseColor.rgb *= 0.88 + 0.18 * h1(mc + uSeed);
        diffuseColor.rgb *= 1.0 - smoothstep(0.09, 0.0, edge) * 0.34;
        diffuseColor.rgb *= 1.0 + smoothstep(0.12, 0.02, edge) * step(0.0, -mr.y) * 0.12;
      }
      vec3 rockC = diffuseColor.rgb;
      // the ice sheath: sheets of translucent blue ice over the rock (thicker toward the brow), layered, cracked, with
      // frozen bubbles and a white frost rim where a sheet thins out
      float sf = fbm(vec2(u * 0.2, v * 0.3) + uSeed * 1.7) + smoothstep(0.2, 0.9, v / max(lip, 0.1)) * 0.22;
      float sheet = smoothstep(0.5, 0.56, sf);
      if (sf > 0.44) {
        float dep = smoothstep(0.56, 0.78, sf);
        vec3 ice = mix(${g(P.iceLt)}, ${g(P.ice)}, dep);
        ice = mix(ice, rockC * vec3(0.7, 0.85, 1.25), (1.0 - dep) * 0.35);   // thin ice: the rock shows through, tinted
        float lay = fract(v * 2.6 + vn(vec2(u * 0.6, 2.0)) * 0.8);
        ice *= 0.94 + 0.1 * smoothstep(0.0, 0.2, lay) * smoothstep(1.0, 0.75, lay);
        ice = mix(ice, ice * 1.18 + 0.03, smoothstep(0.06, 0.0, abs(lay - 0.5)) * 0.4);
        vec2 bq = vec2(u, v) * 5.0; vec2 bqi = floor(bq); vec2 bo = fract(bq) - 0.5 - (h2(bqi) - 0.5) * 0.5; float bhh = h1(bqi + 4.0);
        ice = mix(ice, ${g(P.iceHi)}, step(0.86, bhh) * smoothstep(0.035, 0.0, abs(length(bo) - 0.06 - 0.08 * bhh)) * 0.7);
        float crk = smoothstep(0.02, 0.0, abs(vn(vec2(u * 0.9, v * 1.4) + 9.0) - 0.5)) * step(0.4, vn(vec2(u * 0.3, v * 0.2) + 3.0));
        ice = mix(ice, ${g('#eef8ff')}, crk * 0.7);
        float rimF = smoothstep(0.44, 0.5, sf) * (1.0 - smoothstep(0.5, 0.56, sf));
        diffuseColor.rgb = mix(diffuseColor.rgb, ${g('#dfeaf6')}, rimF * 0.7);
        diffuseColor.rgb = mix(diffuseColor.rgb, ice, sheet);
        wG += ${g('#cfeaff')} * sheet * twinkle(vec2(u * 1.3, v * 1.8), 2.4, 0.88) * 0.8;
      }
      // ice flows running down from under the brow, thinning toward the floor
      float ru = u * 0.9 + sin(v * 1.6 + h1(vec2(floor(u * 0.9), 4.0)) * 6.0) * 0.1, rc = floor(ru);
      float flen = 0.6 + h1(vec2(rc, 8.0)) * 1.8, flow = step(0.72, h1(vec2(rc, 2.0 + uSeed))) * step(lip - v, flen) * step(v, lip);
      float fw = mix(0.12, 0.04, clamp((lip - v) / max(flen, 0.1), 0.0, 1.0));
      flow *= smoothstep(fw, fw * 0.5, abs(fract(ru) - 0.5));
      vec3 fcol = mix(${g('#a8d2f2')}, ${g('#e8f6ff')}, smoothstep(-0.04, 0.05, fract(ru) - 0.5));
      diffuseColor.rgb = mix(diffuseColor.rgb, fcol, flow * 0.9);
      // snow on the ledges (the upper faces of the strata)
      float ledge = smoothstep(0.09, 0.0, bf) * step(0.42, h1(vec2(bi, 9.0 + uSeed))) * smoothstep(0.3, 0.9, v) * (1.0 - sheet * 0.6);
      diffuseColor.rgb = mix(diffuseColor.rgb, ${g('#dce6f2')} * (0.9 + 0.16 * vn(vec2(u * 3.0, v * 4.0))), ledge * 0.85);
      // the icicle fringe under the lip: a band of ice right under it, then tapered icicles of varied length
      float dv = lip - v;
      if (dv < 1.2) {
        float cu = u / 0.17, ci = floor(cu), fx = fract(cu) - 0.5;
        float len = (0.12 + 0.75 * h1(vec2(ci, 5.0) + uSeed)) * step(0.22, h1(vec2(ci, 11.0)));
        float t = clamp(dv / max(len, 1e-3), 0.0, 1.0), wdt = mix(0.46, 0.02, t);
        float ic = step(dv, len) * smoothstep(wdt, wdt - 0.08, abs(fx));
        ic = max(ic, smoothstep(0.1 + 0.05 * sin(u * 3.0), 0.02, dv));
        vec3 icol = mix(${g('#e6f4ff')}, ${g('#8cc0ee')}, t * 0.75) * (1.0 + smoothstep(0.1, 0.0, abs(fx + 0.12)) * 0.12);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.7, smoothstep(0.0, 0.06, dv - len) * (1.0 - smoothstep(0.06, 0.14, dv - len)) * step(0.22, h1(vec2(ci, 11.0))) * 0.5);
        diffuseColor.rgb = mix(diffuseColor.rgb, icol, ic * step(dv, 1.15));
      }
      // frost speckles, and a dark, cold foot with a rime line
      vec2 lq = vec2(u, v) * 5.0; vec2 lqi = floor(lq); float lch = h1(lqi + 3.0 + uSeed);
      diffuseColor.rgb = mix(diffuseColor.rgb, ${g('#e4eef8')}, step(0.93, lch) * smoothstep(0.22, 0.1, length(fract(lq) - 0.5)) * 0.6);
      diffuseColor.rgb *= mix(0.66, 1.0, smoothstep(0.0, 0.42, v));
      diffuseColor.rgb = mix(diffuseColor.rgb, ${g('#c8d6ea')} * 0.7, smoothstep(0.05, 0.0, abs(v - 0.16 - 0.04 * sin(u * 2.3))) * 0.5);
    }`;

// ------------------------------------------------------------------ painters
const cache = new Map();
const cached = (k, fn) => { if (!cache.has(k)) cache.set(k, fn()); return cache.get(k); };
const _c1 = new THREE.Color(), _c2 = new THREE.Color();
/** Batch painter for ice (local y 0..1 of the template: root → tip): deep at the root, pale toward the tip, a white tip,
 *  the facets lit from the upper left */
function icePaint(deep = P.ice, pale = P.iceLt, tip = P.iceHi) {
  const a = col(deep).clone(), b = col(pale).clone(), w = col(tip).clone();
  return (px, py, pz, nx, ny, nz, o, lx, ly) => { const t = clamp(ly); o.copy(a).lerp(b, t * 0.8 + 0.12).lerp(w, clamp((t - 0.72) / 0.28) * 0.75); o.multiplyScalar(0.82 + 0.28 * clamp(-nx * 0.3 + nz * 0.5 + ny * 0.5 + 0.45)); };
}
/** Batch painter: snow (white on top, blue in the shade underneath) */
const snowP = (px, py, pz, nx, ny, nz, o) => o.copy(SNOW).lerp(SNOW_SH, clamp(0.45 - ny) * 0.8).lerp(SNOW_BLUE, clamp(-ny) * 0.5);
/** Batch painter: dark slate with snow lying on its upper faces */
function rockSnowP(c0 = '#4a5468', c1 = '#6c788e', amt = 1) {
  const a = col(c0).clone(), b = col(c1).clone();
  return (px, py, pz, nx, ny, nz, o) => { o.copy(a).lerp(b, clamp(ny * 0.5 + 0.45)); const k = clamp((ny - 0.42 + Math.sin(px * 7.1 + pz * 5.3) * 0.12) * 3.2) * amt; if (k > 0) o.lerp(SNOW, k * 0.9); };
}
/** Builder painter (p, n, o) for ice pieces measured from y0 over height h */
const iceB = (y0, h, deep = P.ice, pale = P.iceLt) => (p, n, o) => { const t = clamp((p.y - y0) / h); o.set(deep).lerp(_c1.set(pale), t * 0.8 + 0.12).lerp(_c2.set(P.iceHi), clamp((t - 0.75) / 0.25) * 0.75).multiplyScalar(0.84 + 0.24 * clamp(n.y * 0.5 + n.z * 0.4 + 0.45)); };
const snowB = (p, n, o) => o.copy(SNOW).lerp(SNOW_SH, clamp(0.45 - n.y) * 0.8).lerp(SNOW_BLUE, clamp(-n.y) * 0.5);
const rockB = (c0 = '#4a5468', c1 = '#707c92') => (p, n, o) => { o.set(c0).lerp(_c1.set(c1), clamp(n.y * 0.5 + 0.45)); const k = clamp((n.y - 0.45 + Math.sin(p.x * 9.1 + p.z * 6.3) * 0.12) * 3) ; if (k > 0) o.lerp(SNOW, k * 0.9); };
/** a soft snow pillow (flattened puff) in a Builder piece */
function pillow(B, p, r, sq = 0.4, seed = 0) { const gg = puff(V(0, 0, 0), r, { detail: 1, noise: 0.22, squash: sq, seed }); gg.translate(p[0], p[1], p[2]); B.add(gg, snowB); }

// ------------------------------------------------------------------ kit pieces (cached Builder pieces)
/** a cluster of hexagonal ice crystals bursting out of a snowy rock (local +z faces the room) */
function iceCluster(seed = 0, { n = 6, H = 1.4, spread = 0.45 } = {}) {
  return cached(`icl:${seed}:${n}:${H}:${spread}`, () => kit(seed * 13 + 3, B => {
    const r = mulberry32(seed * 71 + 5);
    const base = puff(V(0, 0.08, 0), 0.5, { detail: 1, noise: 0.3, squash: 0.45, seed: seed + 2 }); base.scale(1.2, 1, 1); B.add(base, rockB());
    for (let i = 0; i < n; i++) {
      const big = i === 0, a = i / n * TAU + r() * 0.6, d = big ? 0 : spread * (0.4 + r() * 0.6), h = H * (big ? 1 : 0.35 + r() * 0.5), rad = 0.07 + h * 0.11;
      const lean = big ? 0.12 : 0.25 + r() * 0.45, ax = Math.cos(a), az = Math.sin(a);
      const pr = BG.cyl(rad * 0.92, rad, h, 6); pr.translate(0, h / 2, 0);
      const tip = BG.cone(rad * 0.92, rad * 2.2, 6); tip.translate(0, h + rad * 1.1, 0);
      for (const gg of [pr, tip]) { gg.rotateY(r() * TAU); gg.rotateZ(-ax * lean); gg.rotateX(az * lean); gg.translate(ax * d, 0.02, az * d); B.add(gg, iceB(0, h + rad * 2.2, P.ice, P.iceLt)); }
    }
    for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + 0.4; pillow(B, [Math.cos(a) * 0.55, 0.06, Math.sin(a) * 0.45], 0.2 + r() * 0.1, 0.4, seed + k); }
    for (let k = 0; k < 3; k++) { const s = BG.cone(0.05, 0.2, 6); s.rotateZ(Math.PI / 2 - 0.2); s.rotateY(r() * TAU); s.translate((r() - 0.5) * 1.2, 0.04, 0.3 + r() * 0.4); B.add(s, iceB(0, 0.2)); }
  }, 0.008));
}
/** two frozen barrels and an oke under snow, icicles round their rims (an old storeroom's leftovers) */
function frozenBarrels(seed = 0) {
  return cached('fbar:' + seed, () => kit(seed * 11 + 7, B => {
    const r = mulberry32(seed * 31 + 9);
    for (const [x, z, s, tilt] of [[-0.32, -0.05, 1, 0], [0.36, 0.08, 0.86, 0], [0.0, 0.5, 0.72, 1.35]]) {
      B.at([x, tilt ? 0.18 : 0, z], r() * TAU, () => {
        B.push([0, 0, 0], 0, 1, 0, tilt);
        barrel(B, { r: 0.24 * s, h: 0.5 * s, wood: '#8a6a4e', lid: true });
        B.pop();
        if (!tilt) {
          pillow(B, [0, 0.5 * s + 0.04, 0], 0.24 * s, 0.4, seed + x * 10);
          for (let k = 0; k < 7; k++) { const a = k / 7 * TAU + r(), L = 0.08 + r() * 0.16, ic = BG.cone(0.025, L, 5); ic.rotateX(Math.PI); ic.translate(Math.cos(a) * 0.255 * s, 0.47 * s - L / 2, Math.sin(a) * 0.255 * s); B.add(ic, (p, n, o) => o.set('#e4f4ff').lerp(_c1.set('#8cc4f0'), 0.4)); }
        }
      });
    }
    B.at([0.62, 0, -0.42], 0.4, () => bucket(B, { r: 0.14, h: 0.18 }));
    pillow(B, [0.62, 0.17, -0.42], 0.12, 0.5, seed + 5);
    for (let k = 0; k < 3; k++) pillow(B, [(k - 1) * 0.5, 0.03, -0.32 + (k % 2) * 0.1], 0.3, 0.35, seed + 11 + k);
  }, 0.01));
}
/** a little hokora under snow: a stone plinth, a wooden shrine box with lattice doors, a gable roof heaped with snow and
 *  fringed with icicles, a shimenawa, an offering box, two round stone foxes in red bibs with snow caps (+z faces in) */
function snowHokora(seed = 0) {
  return cached('shok:' + seed, () => kit(seed * 13 + 5, B => {
    const base = BG.box(1.5, 0.32, 1.2, 0.05); base.translate(0, 0.16, 0); B.add(base, (p, n, o) => { o.set('#8c94a6').multiplyScalar(n.y > 0.5 ? 1 : 0.84); if (n.y > 0.5) o.lerp(SNOW, 0.6); });
    const stp = BG.box(1.0, 0.12, 0.3, 0.03); stp.translate(0, 0.06, 0.74); B.add(stp, '#8a92a4');
    B.at([0, 0.32, -0.05], 0, () => {
      const box = BG.box(0.86, 0.8, 0.7, 0.03); box.translate(0, 0.4, 0); B.add(box, (p, n, o) => o.set('#8a6448').multiplyScalar(0.88 + 0.07 * Math.sin(p.x * 30)));
      for (const sx of [-1, 1]) { const dd = BG.box(0.36, 0.56, 0.03, 0.01); dd.translate(sx * 0.2, 0.38, 0.36); B.add(dd, '#3e2a24'); for (let k = 0; k < 4; k++) { const l = BG.box(0.34, 0.018, 0.02, 0); l.translate(sx * 0.2, 0.16 + k * 0.14, 0.38); B.add(l, '#d8b484'); } }
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const pp = BG.box(0.07, 0.86, 0.07, 0.01); pp.translate(sx * 0.43, 0.43, sz * 0.35); B.add(pp, '#5e4234'); }
      roof(B, { type: 'gable', w: 0.94, d: 0.78, y0: 0.82, over: 0.3, gOver: 0.24, H: 0.46, curve: 0.3, lift: 0.08, liftW: 0.36, thick: 0.08, ribW: 0.22, color: '#e8eef8', edge: '#4a5064', moss: 0, pastel: 0 });
      for (let i = 0; i < 4; i++) pillow(B, [(i - 1.5) * 0.36, 1.3, (i % 2 ? 0.08 : -0.08)], 0.3, 0.38, seed + i);
      for (let i = 0; i < 9; i++) { const x = -0.6 + i * 0.15, L = 0.08 + ((i * 7 + seed) % 5) * 0.035, ic = BG.cone(0.022, L, 5); ic.rotateX(Math.PI); ic.translate(x, 0.84 - L / 2, 0.66); B.add(ic, (p, n, o) => o.set('#e6f4ff').lerp(_c1.set('#90c6f2'), 0.35)); }
      shimenawa(B, { w: 0.82, y: 0.78, sag: 0.07, z: 0.42, r: 0.028 });
      const ob = BG.box(0.42, 0.2, 0.24, 0.02); ob.translate(0, 0.1, 0.62); B.add(ob, '#6e5040');
      pillow(B, [0, 0.22, 0.62], 0.16, 0.35, seed + 9);
      const bell = BG.sph(0.06, 8, 6); bell.translate(0, 0.94, 0.5); B.add(bell, BC.gold);
      const rope = BG.cyl(0.012, 0.012, 0.5, 4); rope.translate(0.05, 0.62, 0.52); B.add(rope, '#e84a3a');
    });
    for (const sx of [-1, 1]) B.at([sx * 0.95, 0, 0.5], -sx * 0.3, () => {
      const pl = BG.box(0.32, 0.24, 0.32, 0.04); pl.translate(0, 0.12, 0); B.add(pl, '#8a92a2');
      const s = '#cfd2da', body = BG.sph(0.14, 10, 8); body.scale(0.9, 1.15, 0.9); body.translate(0, 0.38, 0); B.add(body, s);
      const head = BG.sph(0.1, 10, 8); head.translate(0, 0.6, 0.03); B.add(head, s);
      const sn = BG.cone(0.05, 0.13, 8); sn.rotateX(Math.PI / 2); sn.translate(0, 0.58, 0.14); B.add(sn, s);
      for (const e of [-1, 1]) { const ear = BG.cone(0.04, 0.12, 6); ear.rotateZ(-e * 0.25); ear.translate(e * 0.06, 0.72, 0.01); B.add(ear, s); }
      const bib = BG.cone(0.12, 0.12, 10); bib.rotateX(Math.PI); bib.scale(1, 1, 0.7); bib.translate(0, 0.47, 0.05); B.add(bib, BC.red);
      pillow(B, [0, 0.72, 0.0], 0.09, 0.55, seed + sx * 3);
    });
    B.light([0, 0.9, 0.55], { color: '#ffd0a0', intensity: 1.2, radius: 4, flicker: 0.4, nightOnly: false });
  }, 0.02));
}
/** a shimenawa rope with paper shide strung along local x between two pegs, snow along its top (+z = out of the face) */
function shideRope(L, seed = 0) {
  const k = Math.round(L * 4) / 4;
  return cached(`sshide:${k}:${seed}`, () => kit(seed * 3 + 1, B => {
    shimenawa(B, { w: k, y: 0, sag: 0.18 + k * 0.03, z: 0.06, r: 0.042 });
    for (const sx of [-1, 1]) { const p = BG.cyl(0.035, 0.03, 0.26, 6); p.rotateX(Math.PI / 2); p.translate(sx * k / 2, 0.02, -0.02); B.add(p, '#5e4232'); }
    const n = Math.max(3, Math.round(k * 2.2));
    for (let i = 0; i < n; i++) { const t = (i + 0.5) / n - 0.5, x = t * k, sag = (0.18 + k * 0.03) * (1 - 4 * t * t); const sp = BG.sph(0.07, 6, 4); sp.scale(1.6, 0.5, 1); sp.translate(x, 0.045 - sag, 0.06); B.add(sp, snowB); }
    for (let i = 0; i < n + 2; i++) { const t = (i + 0.5) / (n + 2) - 0.5, x = t * k * 0.92, sag = (0.18 + k * 0.03) * (1 - 4 * t * t), L2 = 0.06 + ((i * 5 + seed) % 4) * 0.04, ic = BG.cone(0.014, L2, 4); ic.rotateX(Math.PI); ic.translate(x + 0.04, -0.05 - sag - L2 / 2, 0.08); B.add(ic, (p, nn, o) => o.set('#e6f4ff')); }
  }, 0.01));
}
/** the old bath's duckboard deck (sunoko) with two oke, a little wooden stool and a towel on it (+z faces in) */
function bathDeck(seed = 0) {
  return cached('deck:' + seed, () => kit(seed * 7 + 2, B => {
    for (const x of [-0.72, 0, 0.72]) { const b = BG.box(0.08, 0.06, 1.3, 0.01); b.translate(x, 0.03, 0); B.add(b, '#6a4c38'); }
    for (let i = 0; i < 9; i++) { const s = BG.box(1.7, 0.035, 0.11, 0.01); s.translate(0, 0.075, -0.56 + i * 0.14); B.add(s, (p, n, o) => o.set(i % 3 ? '#b88a5e' : '#a87c52').multiplyScalar(n.y > 0.5 ? 1 : 0.8)); }
    B.at([-0.45, 0.09, -0.15], 0.3, () => bucket(B, { r: 0.15, h: 0.18, water: true }));
    B.at([-0.12, 0.09, 0.28], -0.5, () => { bucket(B, { r: 0.13, h: 0.16 }); B.at([0, 0.16, 0], 0.4, () => bucket(B, { r: 0.12, h: 0.14 })); });
    B.at([0.45, 0.09, 0.0], 0.2, () => { // a koshikake: a low wooden bath stool
      const top = BG.box(0.42, 0.05, 0.26, 0.02); top.translate(0, 0.24, 0); B.add(top, '#c8996a');
      for (const sx of [-1, 1]) { const leg = BG.box(0.05, 0.22, 0.24, 0.01); leg.translate(sx * 0.16, 0.11, 0); B.add(leg, '#a87a50'); }
      const tw = BG.box(0.3, 0.04, 0.18, 0.02); tw.translate(0.02, 0.285, 0); B.add(tw, (p, n, o) => o.set(Math.sin(p.x * 60) > 0.6 ? '#4a7ac8' : '#f4f2ee'));
    });
    for (let k = 0; k < 3; k++) pillow(B, [-0.8 + k * 0.8, 0.1, -0.62], 0.2, 0.3, seed + k);
  }, 0.01));
}
/** a towel rack: two posts and a rail hung with tenugui (white with blue stripes, one red), snow along the rail */
function towelRack(seed = 0) {
  return cached('towel:' + seed, () => kit(seed * 5 + 9, B => {
    for (const sx of [-1, 1]) { const p = BG.cyl(0.04, 0.05, 1.3, 6); p.translate(sx * 0.6, 0.65, 0); B.add(p, '#6a4a36'); const f = BG.box(0.18, 0.06, 0.3, 0.02); f.translate(sx * 0.6, 0.03, 0); B.add(f, '#5a3e2e'); }
    const rail = BG.cyl(0.03, 0.03, 1.38, 6); rail.rotateZ(Math.PI / 2); rail.translate(0, 1.22, 0); B.add(rail, '#7a5640');
    const sp = BG.box(1.32, 0.06, 0.1, 0.03); sp.translate(0, 1.27, 0); B.add(sp, snowB);
    const cols = ['#f4f2ee', '#f4f2ee', '#e8504a'];
    for (let i = 0; i < 3; i++) { const x = -0.38 + i * 0.38, tw = BG.plane(0.3, 0.62, 1, 4); tw.translate(x, 0.9, 0.035); B.cloth(tw, (p, n, o) => o.set(cols[i]).lerp(_c1.set(i === 2 ? '#ffd0c0' : '#3a6ec0'), i === 2 ? (Math.abs(p.y - 0.74) < 0.03 ? 1 : 0) : (Math.abs(Math.sin(p.y * 22)) > 0.92 ? 0.85 : 0)), { x0: x - 0.15, x1: x + 0.15, yTop: 1.21, yBot: 0.59 }); }
  }, 0.01));
}
/** a snow monkey soaking to the shoulders: a fluffy grey-brown head, a pink face, a snow cap (y = 0 at the water) */
function snowMonkey(seed = 0) {
  return cached('monkey:' + seed, () => kit(seed + 31, B => {
    const fur = seed % 2 ? '#a89888' : '#9c8c80', face = '#f09a8a';
    const sp = (r, c, p, s = [1, 1, 1]) => { const gg = BG.sph(r, 10, 8); gg.scale(...s); gg.translate(...p); B.add(gg, c); };
    sp(0.22, fur, [0, 0.06, 0], [1.15, 0.7, 1.05]); sp(0.16, fur, [0, 0.27, 0.03]);
    sp(0.1, face, [0, 0.26, 0.135], [1.15, 1, 0.6]);
    for (const k of [-1, 1]) { sp(0.016, '#2a1a18', [k * 0.034, 0.285, 0.19]); sp(0.04, face, [k * 0.14, 0.28, 0.03]); sp(0.025, '#ffb0b0', [k * 0.06, 0.245, 0.185], [1, 0.6, 0.5]); }
    sp(0.022, '#d86a5e', [0, 0.24, 0.2], [1.2, 0.7, 0.6]);
    sp(0.09, '#f6f9ff', [0, 0.42, 0], [1.25, 0.45, 1.15]);
    for (const k of [-1, 1]) sp(0.06, fur, [k * 0.2, 0.06, 0.12], [1, 0.6, 1]); // (arms on the rim of the water)
  }, 0.005));
}
/** an ice stalagmite: a tall faceted spike of blue ice over a dark rock core (the rock shows at the foot), drip ridges
 *  running down it, a pale tip, a smaller twin leaning off it, a snow mound and ice crystals round the foot */
function iceSpire(seed = 0) {
  return cached('spire:' + seed, () => kit(seed * 29 + 7, B => {
    const r = mulberry32(seed * 41 + 5);
    const spike = (x, z, H, R0, lean, rot) => {
      const pts = []; for (let k = 0; k <= 8; k++) { const t = k / 8; pts.push([Math.max(0.004, R0 * Math.pow(1 - t, 0.85) * (1 + 0.1 * Math.sin(t * 9 + seed))), t * H]); }
      const gg = BG.lathe(pts, 7);
      { const P0 = gg.attributes.position; for (let i = 0; i < P0.count; i++) { const px = P0.getX(i), py = P0.getY(i), pz = P0.getZ(i), a = Math.atan2(pz, px), w = 1 + 0.12 * Math.sin(a * 3 + py * 2.3 + seed) ; P0.setX(i, px * w); P0.setZ(i, pz * w); } }
      gg.rotateY(rot); gg.rotateZ(lean); gg.translate(x, -0.05, z);
      B.add(gg, (p, n, o) => {
        const t = clamp((p.y + 0.05) / H), a = Math.atan2(p.z - z, p.x - x), ridge = Math.sin(a * 7 + seed) > 0.55 ? 1 : 0;
        o.set('#3e4860').lerp(_c1.set(P.ice), clamp(t * 3.2 - 0.25)).lerp(_c2.set(P.iceLt), clamp((t - 0.35) * 1.6) * 0.7 + ridge * 0.18);
        if (t > 0.85) o.lerp(_c2.set(P.iceHi), (t - 0.85) * 4);
        o.multiplyScalar(0.84 + 0.24 * clamp(n.x * -0.35 + n.z * 0.5 + n.y * 0.3 + 0.5));
      });
    };
    spike(0, 0, 2.5, 0.48, 0.05, r() * TAU);
    spike(0.42, 0.18, 1.3, 0.26, -0.32, r() * TAU);
    spike(-0.3, 0.32, 0.8, 0.18, 0.4, r() * TAU);
    const base = puff(V(0, 0.05, 0), 0.75, { detail: 1, noise: 0.3, squash: 0.32, seed: seed + 2 }); B.add(base, snowB);
    for (let q = 0; q < 5; q++) { const a = q / 5 * TAU + r(), d = 0.75 + r() * 0.2, h = 0.2 + r() * 0.3, cr = BG.cyl(0.04, 0.05, h, 6); cr.translate(0, h / 2, 0); const tp = BG.cone(0.04, 0.1, 6); tp.translate(0, h + 0.05, 0); for (const gg of [cr, tp]) { gg.rotateZ(Math.cos(a) * -0.5); gg.rotateX(Math.sin(a) * 0.5); gg.translate(Math.cos(a) * d, 0.02, Math.sin(a) * d); B.add(gg, iceB(0, h + 0.1)); } }
    for (let q = 0; q < 4; q++) { const a = r() * TAU; pillow(B, [Math.cos(a) * 0.95, 0.03, Math.sin(a) * 0.9], 0.24 + r() * 0.12, 0.35, seed + q); }
  }, 0.012));
}
/** a cold brazier: an iron bowl on three legs heaped with snow over dead coals (the storeroom) */
function coldBrazier(seed = 0) {
  return cached('braz:' + seed, () => kit(seed + 41, B => {
    for (let i = 0; i < 3; i++) { const a = i / 3 * TAU, l = BG.cyl(0.03, 0.025, 0.5, 5); l.rotateZ(0.25); l.rotateY(-a); l.translate(Math.cos(a) * 0.2, 0.25, Math.sin(a) * 0.2); B.add(l, '#3a3a44'); }
    const bowl = BG.lathe([[0.001, 0], [0.18, 0.01], [0.3, 0.12], [0.32, 0.2], [0.29, 0.2], [0.17, 0.05], [0.001, 0.04]], 12); bowl.translate(0, 0.45, 0); B.add(bowl, '#4a4650');
    pillow(B, [0, 0.62, 0], 0.27, 0.45, seed);
  }, 0.01));
}
/** a woodcutter's store under snow: firewood under a little roof, sacks and a crate (the storeroom) */
function storePile(seed = 0) {
  return cached('store:' + seed, () => kit(seed * 3 + 51, B => {
    B.at([0, 0, -0.1], 0, () => firewood(B, { w: 1.2, h: 0.62, d: 0.34, roofed: true }));
    for (let i = 0; i < 3; i++) pillow(B, [(i - 1) * 0.42, 0.86, -0.1], 0.24, 0.3, seed + i);
    B.at([1.0, 0, 0.3], 0.3, () => crate(B, { s: 0.42, wood: '#a88a64', lid: true, stencil: false }));
    pillow(B, [1.0, 0.4, 0.3], 0.22, 0.4, seed + 5);
    B.at([-1.0, 0, 0.32], -0.2, () => { sack(B, { r: 0.18, color: '#e8dcc4' }); B.at([0.3, 0, 0.12], 0.6, () => sack(B, { r: 0.15, color: '#d8c8a8' })); });
    pillow(B, [-1.0, 0.36, 0.32], 0.16, 0.5, seed + 7);
    for (let i = 0; i < 3; i++) pillow(B, [(i - 1) * 0.9, 0.02, 0.55], 0.36, 0.32, seed + 9 + i);
  }, 0.01));
}
/** a red paper chōchin hung from a short post with a snow cap (a warm accent along a trail) */
function lanternPost(seed = 0) {
  return cached('lpost:' + seed, () => kit(seed + 61, B => {
    const post = BG.cyl(0.05, 0.06, 1.7, 6); post.translate(0, 0.85, 0); B.add(post, '#5e4434');
    const arm = BG.box(0.5, 0.05, 0.05, 0.01); arm.translate(0.22, 1.62, 0); B.add(arm, '#5e4434');
    pillow(B, [0, 1.72, 0], 0.08, 0.6, seed); pillow(B, [0.24, 1.66, 0], 0.06, 0.5, seed + 1);
    B.at([0.4, 1.6, 0], 0, () => chochin(B, { r: 0.15, h: 0.32, cord: 0.08, color: seed % 3 ? '#e04a3a' : '#fff0d0' }));
    const ft = BG.cyl(0.14, 0.18, 0.12, 6); ft.translate(0, 0.06, 0); B.add(ft, '#7a8294');
    pillow(B, [0, 0.12, 0], 0.18, 0.4, seed + 3);
  }, 0.01));
}

// ------------------------------------------------------------------ hot-spring pools (the floor shader's uPools)
function addPool(W, x, z, R, kind = 0, o = {}) {
  const ks = W.kitState; if (ks.pools.length >= POOL_MAX) return null;
  const pl = { x, z, R, kind, i: ks.pools.length, ...o };
  ks.poolU[pl.i].set(x, z, R, kind); ks.pools.push(pl);
  return pl;
}
/** the stone rim, the warm light, the steam (kind 0) or the frost (kind 1) of a pool; colliders keep the water clear */
function dressPool(W, pl, { spout = null } = {}) {
  if (pl.dressed) return; pl.dressed = true;
  const q = W.krng, warm = pl.kind !== 1;
  addPiece(W, Pr.springRim(Math.floor(q() * 4), Math.round(pl.R * 4) / 4, { spout: spout ?? (warm && q() < 0.5) }), pl.x, pl.z, q() * TAU);
  W.collision.addCircle(pl.x, pl.z, pl.R + 0.25);
  if (warm) {
    W.floorGlows.add(pl.x, 0.05, pl.z, pl.R + 1.8, '#ff9a50', 0.16, 1);
    W.halos.add(pl.x, 0.7, pl.z, pl.R * 2.2, '#ffb070', 0.16);
    W.lightPool.addSource({ pos: V(pl.x, 1.4, pl.z), color: col('#ffb478').clone(), intensity: 4.2, radius: pl.R + 5, flicker: 0.2 });
    W.kitState.steam.push({ x: pl.x, z: pl.z, R: pl.R });
  } else {
    W.floorGlows.add(pl.x, 0.05, pl.z, pl.R + 1.2, '#bfe4ff', 0.16);
  }
}

// ------------------------------------------------------------------ the wall kit
function crystalsInRock(W, s, addLight) { // 3–5 ice crystals bursting out of the rock face, a frost collar where they break out
  const q = W.krng, WD = W.wallDeco, ox = -s.nx, oz = -s.nz, y0 = s.h * (0.3 + q() * 0.22), n = 3 + Math.floor(q() * 3), paint = icePaint();
  for (let i = 0; i < n; i++) {
    const mid = i === Math.floor(n / 2), o = (i - (n - 1) / 2) * 0.24 + (q() - 0.5) * 0.12, x = s.x - s.nx * 0.12 + s.tx * o, z = s.z - s.nz * 0.12 + s.tz * o, y = y0 + (q() - 0.5) * 0.3;
    const lean = 0.35 + q() * 0.6, side = (q() - 0.5) * 0.9, d = V(ox * lean + s.tx * side * 0.4, 0.6 + q() * 0.5, oz * lean + s.tz * side * 0.4).normalize();
    const L = (0.45 + q() * 0.6) * (mid ? 1.5 : 1), R = 0.07 + L * 0.13;
    WD.add(SH.crys(), MD(x, y, z, d, R, L, R, q() * TAU), null, paint);
  }
  const cx = s.x - s.nx * 0.2, cz = s.z - s.nz * 0.2;
  for (let k = 0; k < 4; k++) WD.add(SH.rock(), M(cx + s.tx * (k - 1.5) * 0.18, y0 - 0.06 + (q() - 0.5) * 0.1, cz + s.tz * (k - 1.5) * 0.18, 0.1 + q() * 0.06, 0.07, 0.09, q(), q() * TAU, q()), null, rockSnowP('#3e4658', '#5c667c'));
  WD.add(SH.sphLo(), M(cx, y0 - 0.12, cz, 0.34, 0.09, 0.16, 0, Math.atan2(ox, oz), 0), null, snowP);
  W.halos.add(cx - s.nx * 0.3, y0 + 0.4, cz - s.nz * 0.3, 1.5, '#9fd0ff', 0.16);
  addLight(cx - s.nx * 0.9, y0 + 0.6, cz - s.nz * 0.9, '#a8d4ff', 2.2, 4, 0.05);
}
function icefall(W, s) { // a frozen cascade hanging from the brow's nose to the floor, an ice apron at its foot, icicles
  const q = W.krng, WD = W.wallDeco, n = 4 + Math.floor(q() * 3), top = s.h * 0.92, face = Math.atan2(-s.nx, -s.nz);
  const iceT = (px, py, pz, nx, ny, nz, o) => { const t = clamp(py / top); o.copy(col('#7aaee4')).lerp(col('#dff0ff'), t * 0.6 + clamp(-nx * s.nx - nz * s.nz) * 0.25).multiplyScalar(0.86 + 0.2 * clamp(ny * 0.4 + 0.6)); };
  for (let i = 0; i < n; i++) {
    const o = (i - (n - 1) / 2) * 0.24 + (q() - 0.5) * 0.08, len = top * (0.6 + q() * 0.4), R = 0.11 + q() * 0.07, bx = s.x + s.tx * o, bz = s.z + s.tz * o;
    const pts = []; for (let k = 0; k <= 6; k++) { const t = k / 6, y = top - t * len, off = 0.6 + Math.sin(t * Math.PI) * 0.1 + q() * 0.03; pts.push({ p: V(bx - s.nx * off + s.tx * Math.sin(t * 5 + i) * 0.04, y, bz - s.nz * off + s.tz * Math.sin(t * 5 + i) * 0.04), r: R * (1 - t * 0.5) * (0.85 + Math.sin(t * 9 + i * 2) * 0.15) }); }
    WD.addGeo(tube(pts, 7, true), bx, bz, null, iceT);
  }
  const fx = s.x - s.nx * 0.75, fz = s.z - s.nz * 0.75;
  WD.add(SH.sph(), M(fx, 0.02, fz, 0.85, 0.24, 0.5, 0, face, 0), null, (px, py, pz, nx, ny, nz, o) => o.copy(col('#a8d0f0')).lerp(col('#eef8ff'), clamp(ny)).multiplyScalar(0.9));
  for (let k = 0; k < 10; k++) { const o2 = (k / 9 - 0.5) * 1.6, L = 0.15 + q() * 0.4; WD.add(SH.cone(), M(s.x - s.nx * 0.62 + s.tx * o2, s.h * 0.97, s.z - s.nz * 0.62 + s.tz * o2, 0.04, L, 0.04, Math.PI, 0, 0), null, (px, py, pz, nx, ny, nz, o, lx, ly) => o.copy(col('#e8f6ff')).lerp(col('#8cc4f4'), ly * 0.7)); }
  WD.add(SH.sphLo(), M(s.x - s.nx * 0.5, s.h * 1.05, s.z - s.nz * 0.5, 0.95, 0.16, 0.34, 0, face, 0), null, snowP);
  W.kitState.drips.push({ x: s.x - s.nx * 0.62, y: s.h * 0.93, z: s.z - s.nz * 0.62, t: q() * 3 });
}
function icicleCurtain(W, s) { // big icicles hanging from the brow's nose, broken shards below, a snow lip over them
  const q = W.krng, WD = W.wallDeco, CL = W.clutter, n = 8 + Math.floor(q() * 6), face = Math.atan2(-s.nx, -s.nz);
  const paint = (px, py, pz, nx, ny, nz, o, lx, ly) => o.copy(col('#e8f6ff')).lerp(col('#86bdf0'), ly * 0.75).multiplyScalar(0.9 + 0.14 * clamp(nz * 0.5 + 0.5));
  for (let k = 0; k < n; k++) { const o2 = (k / (n - 1) - 0.5) * 1.9 + (q() - 0.5) * 0.1, L = 0.25 + q() * q() * 1.1, R = 0.035 + L * 0.05; WD.add(SH.cone(), M(s.x - s.nx * (0.58 + q() * 0.06) + s.tx * o2, s.h * 0.95, s.z - s.nz * (0.58 + q() * 0.06) + s.tz * o2, R, L, R, Math.PI, q() * TAU, (q() - 0.5) * 0.1), null, paint); }
  WD.add(SH.sphLo(), M(s.x - s.nx * 0.5, s.h * 1.04, s.z - s.nz * 0.5, 1.05, 0.15, 0.32, 0, face, 0), null, snowP);
  for (let k = 0; k < 3; k++) { const x = s.x - s.nx * (0.9 + q() * 0.6) + s.tx * (q() - 0.5) * 1.4, z = s.z - s.nz * (0.9 + q() * 0.6) + s.tz * (q() - 0.5) * 1.4; if (W.walkable(x, z)) CL.add(SH.cone(), M(x, 0.04, z, 0.04, 0.22 + q() * 0.16, 0.04, Math.PI / 2, q() * TAU, 0), null, paint); }
  W.kitState.drips.push({ x: s.x - s.nx * 0.6, y: s.h * 0.9, z: s.z - s.nz * 0.6, t: q() * 3 });
}
function lanternNiche(W, s, addLight) { // a carved alcove with a little yukimi lantern on its ledge, snow on the ledge
  const q = W.krng, WD = W.wallDeco, y = Math.min(1.2, s.h * 0.4), face = Math.atan2(-s.nx, -s.nz);
  const cx = s.x - s.nx * 0.02, cz = s.z - s.nz * 0.02;
  WD.add(SH.disc(), M(cx, y + 0.38, cz, 0.44, 0.03, 0.6, Math.PI / 2, face, 0), col('#1c2230'));
  for (let k = 0; k < 7; k++) { const a = Math.PI * (k / 6), ox = Math.cos(a) * 0.5, oy = Math.sin(a) * 0.62; WD.add(SH.rock(), M(cx + s.tx * ox - s.nx * 0.05, y + 0.38 + oy * 0.95, cz + s.tz * ox - s.nz * 0.05, 0.11, 0.09, 0.08, q(), q() * TAU, q()), null, rockSnowP('#56607a', '#7a86a0')); }
  WD.add(SH.box(), M(cx - s.nx * 0.16, y - 0.06, cz - s.nz * 0.16, 0.72, 0.08, 0.36, 0, face, 0), null, grad('#6a748a', '#8a94a8'));
  WD.add(SH.sphLo(), M(cx - s.nx * 0.2, y - 0.01, cz - s.nz * 0.2, 0.36, 0.05, 0.16, 0, face, 0), null, snowP);
  addPiece(W, Pr.yukimiLantern(5 + Math.floor(q() * 3), { s: 0.42 }), cx - s.nx * 0.2, cz - s.nz * 0.2, face, { y: y - 0.02, wall: true, lights: false, mul: 0.78 });
  W.halos.add(cx - s.nx * 0.42, y + 0.4, cz - s.nz * 0.42, 1.5, P.lantern, 0.55, 1);
  addLight(cx - s.nx * 0.8, y + 0.6, cz - s.nz * 0.8, P.lantern, 4, 5.5, 0.6);
  for (let k = 0; k < 6; k++) { const o2 = (k / 5 - 0.5) * 0.9, L = 0.08 + q() * 0.18; WD.add(SH.cone(), M(cx + s.tx * o2 - s.nx * 0.12, y + 0.98, cz + s.tz * o2 - s.nz * 0.12, 0.022, L, 0.022, Math.PI, 0, 0), null, (px, py, pz, nx, ny, nz, o, lx, ly) => o.copy(col('#e8f6ff')).lerp(col('#8cc4f4'), ly * 0.6)); }
}
function steamVent(W, s, addLight) { // a warm fissure at the foot of the rock: an ember glow inside, a steaming puddle below
  const q = W.krng, WD = W.wallDeco, WG = W.wallGlow, face = Math.atan2(-s.nx, -s.nz), cx = s.x - s.nx * 0.25, cz = s.z - s.nz * 0.25;
  WD.add(SH.disc(), M(cx, 0.42, cz, 0.08, 0.03, 0.42, Math.PI / 2, face, 0), col('#1a1016'));
  WG.add(SH.disc(), M(cx - s.nx * 0.012, 0.36, cz - s.nz * 0.012, 0.035, 0.02, 0.3, Math.PI / 2, face, 0), col('#ff9a40'));
  for (let k = 0; k < 6; k++) { const side = k % 2 ? 1 : -1, yy = 0.05 + (k >> 1) * 0.28; WD.add(SH.rock(), M(cx + s.tx * side * (0.13 + q() * 0.06) - s.nx * 0.05, yy, cz + s.tz * side * (0.2 + q() * 0.08) - s.nz * 0.05, 0.12, 0.13, 0.1, q(), q() * TAU, q()), null, grad('#2e3038', '#4a4c56')); }
  const px = s.x - s.nx * 0.95, pz = s.z - s.nz * 0.95;
  if (W.walkable(px, pz)) { addPool(W, px, pz, 0.5, 2); W.collision.addCircle(px, pz, 0.45); for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; W.clutter.add(SH.rock(), M(px + Math.cos(a) * 0.58, 0.04, pz + Math.sin(a) * 0.58, 0.1 + q() * 0.05, 0.07, 0.09, q(), q() * TAU, q()), null, grad('#30333c', '#4c505c')); } }
  W.halos.add(cx - s.nx * 0.3, 0.6, cz - s.nz * 0.3, 1.4, '#ff9a50', 0.3, 1);
  W.floorGlows.add(px, 0.05, pz, 1.6, '#ff8a40', 0.22, 1);
  addLight(px, 0.9, pz, '#ffa060', 3.5, 5, 0.25);
  W.kitState.vents.push({ x: cx - s.nx * 0.2, y: 0.5, z: cz - s.nz * 0.2, px, pz });
}
function shideOnFace(W, S, i, n) { // a shimenawa with shide (snow along it, little icicles) across a straight stretch
  const a = S[i], b = S[Math.min(n - 1, i + 6)]; if (!b || Math.abs(a.h - b.h) > 0.5) return;
  const L = Math.hypot(b.x - a.x, b.z - a.z); if (L < 1.6 || L > 3.6) return;
  const mx = (a.x + b.x) / 2 - (a.nx + b.nx) * 0.1, mz = (a.z + b.z) / 2 - (a.nz + b.nz) * 0.1, y = Math.min(a.h, b.h) * 0.56;
  const tx = (b.x - a.x) / L, tz = (b.z - a.z) / L, rot = Math.atan2(tx, tz) - Math.PI / 2;
  const nx = -tz, nz = tx, facing = (nx * -a.nx + nz * -a.nz) > 0 ? rot : rot + Math.PI;
  addPiece(W, shideRope(L, Math.floor(W.krng() * 4)), mx, mz, facing, { y, wall: true });
}
function dressWalls(W, addLight) {
  const r = W.rng, WD = W.wallDeco, CL = W.clutter;
  let vents = 0;
  for (const { S, len, seed } of W.wallSamples) {
    const n = S.length;
    let lastSeg = -1;
    for (let i = 0; i < n; i++) { // set pieces on the camera-facing runs, one per ~5.5 m
      const s = S[i], seg = Math.floor(s.u / 5.5);
      if (seg === lastSeg || s.u > len - 2 || s.f < 0.3 || s.h < 1.8) continue;
      if (W.L.arena && Math.hypot(s.x - W.L.arena.x, s.z - W.L.arena.z) < W.L.arena.r + 1.5) continue; // (the arena dresses its own rim)
      lastSeg = seg;
      const hsh = mulberry32(seg * 7919 + seed * 104729)();
      if (hsh < 0.25) crystalsInRock(W, s, addLight);
      else if (hsh < 0.4) icefall(W, s);
      else if (hsh < 0.52) lanternNiche(W, s, addLight);
      else if (hsh < 0.62 && vents < 6 && W.walkable(s.x - s.nx * 0.95, s.z - s.nz * 0.95) && !W.keepClear(s.x - s.nx * 0.95, s.z - s.nz * 0.95, 0.5)) { vents++; steamVent(W, s, addLight); }
      else if (hsh < 0.72) shideOnFace(W, S, i, n);
      else if (hsh < 0.88) icicleCurtain(W, s);
    }
    for (let i = 0; i < n; i++) { // the wall foot: drifts, snowy rocks, frost grass, ice chunks, icicle shards, pebbles
      const s = S[i]; if (r() > 0.26) continue;
      const k = r(), fx = s.x - s.nx * 0.45, fz = s.z - s.nz * 0.45;
      if (!W.walkable(fx, fz) || W.keepClear(fx, fz) || inStream(W, fx, fz) || W.collision.solidAt(fx, fz, 0.1)) continue;
      if (k < 0.28) CL.addVC(F.drift(Math.floor(r() * 4), { R: 0.7 + r() * 0.5, h: 0.32 })['d:body'], M(fx + s.nx * 0.15, -0.04, fz + s.nz * 0.15, 1, 1, 1, 0, r() * TAU, 0));
      else if (k < 0.4) CL.addVC(F.snowRock(Math.floor(r() * 4), { R: 0.26 + r() * 0.16 })['d:body'], M(fx, -0.04, fz, 1, 1, 1, 0, r() * TAU, 0));
      else if (k < 0.52) CL.addVC(F.frostGrass(Math.floor(r() * 4))['d:grass'], M(fx, 0, fz, 0.9 + r() * 0.5, 0.9 + r() * 0.5, 0.9 + r() * 0.5, 0, r() * TAU, 0));
      else if (k < 0.66) for (let j = 0; j < 3; j++) CL.add(SH.rock(), M(fx + (r() - 0.5) * 0.7, 0.05, fz + (r() - 0.5) * 0.7, 0.07 + r() * 0.08, 0.06 + r() * 0.05, 0.07 + r() * 0.07, r(), r() * TAU, r()), null, (px, py, pz, nx, ny, nz, o) => o.copy(col('#9ccaee')).lerp(col('#e8f6ff'), clamp(ny * 0.6 + 0.3)));
      else if (k < 0.76) for (let j = 0; j < 2; j++) CL.add(SH.cone(), M(fx + (r() - 0.5) * 0.6, 0.035, fz + (r() - 0.5) * 0.6, 0.035, 0.18 + r() * 0.16, 0.035, Math.PI / 2, r() * TAU, 0), null, (px, py, pz, nx, ny, nz, o, lx, ly) => o.copy(col('#e8f6ff')).lerp(col('#8cc4f4'), ly * 0.7));
      else if (k < 0.9) for (let j = 0; j < 3; j++) W.ddPebble(CL, fx + (r() - 0.5) * 0.7, fz + (r() - 0.5) * 0.7, 0.06 + r() * 0.08, col('#6c7890'), '#eef4fa');
    }
  }
  dressTops(W);
}
// above the brow: snow mounds and drifts along it, snowy rocks, ice crystals poking up out of the cracks (the far walls),
// icicles hanging over the nose; nothing tall further back, where the rock heaves up into the dark
function dressTops(W) {
  const r = mulberry32(W.L.floor * 9173 + 5), WD = W.wallDeco;
  let crys = 0, ics = 0;
  const icePt = (px, py, pz, nx, ny, nz, o, lx, ly) => o.copy(col('#e8f6ff')).lerp(col('#8cc4f4'), ly * 0.7);
  for (const { S } of W.wallSamples) {
    let next = r() * 2.6;
    for (const s of S) {
      if (s.u < next) continue;
      const sp = topSpan(s); if (!sp) continue;
      next = s.u + 1.5 + r() * 1.6;
      const far = s.f > 0.15, k = r(), o = sp.o0 + 0.08 + r() * 0.45, y = sp.yAt(o);
      const x = s.x + s.nx * o + s.tx * (r() - 0.5) * 0.6, z = s.z + s.nz * o + s.tz * (r() - 0.5) * 0.6;
      if (far && s.f > 0.35 && k < 0.14 && crys < 16) { crys++; const paint = icePaint(); for (let i = 0, m = 2 + Math.floor(r() * 3); i < m; i++) WD.add(SH.crys(), MD(x + (r() - 0.5) * 0.5, y - 0.05, z + (r() - 0.5) * 0.5, V((r() - 0.5) * 0.7 - s.nx * 0.3, 1, (r() - 0.5) * 0.7 - s.nz * 0.3).normalize(), 0.08 + r() * 0.05, 0.4 + r() * 0.5, 0.08 + r() * 0.05, r() * TAU), null, paint); }
      else if (k < 0.4) WD.addVC(F.drift(Math.floor(r() * 4), { R: 0.5 + r() * 0.4, h: 0.26 })['d:body'], M(x, y - 0.08, z, 1, 1, 1, 0, r() * TAU, 0));
      else if (far && k < 0.62 && ics < 60) { ics++; for (let i = 0, m = 3 + Math.floor(r() * 4); i < m; i++) { const o2 = (r() - 0.5) * 1.2, L = 0.12 + r() * r() * 0.6; WD.add(SH.cone(), M(s.x - s.nx * 0.6 + s.tx * o2, s.h * 0.94, s.z - s.nz * 0.6 + s.tz * o2, 0.03 + L * 0.04, L, 0.03 + L * 0.04, Math.PI, 0, 0), null, icePt); } }
      else if (k < 0.78) for (let i = 0; i < 2; i++) WD.add(SH.rock(), M(x + (r() - 0.5) * 0.5, y + 0.04, z + (r() - 0.5) * 0.5, 0.16 + r() * 0.14, 0.12 + r() * 0.08, 0.16 + r() * 0.12, r(), r() * TAU, 0), null, rockSnowP('#3a4254', '#566076', 0.9));
    }
  }
  W.topCount = { crys, ics };
}

// ------------------------------------------------------------------ floor props, room lights, centrepieces
const icicleP = (px, py, pz, nx, ny, nz, o, lx, ly) => o.copy(col('#e8f6ff')).lerp(col('#8cc4f4'), ly * 0.7);
const iceChunkP = (px, py, pz, nx, ny, nz, o) => o.copy(col('#94c4ec')).lerp(col('#e8f6ff'), clamp(ny * 0.6 + 0.3));
function buildProps(W) {
  const r = W.rng, B = W.solid, CL = W.clutter;
  for (const p of W.L.props) {
    const wp = W.cellToWorld(p.x, p.y), wl = Math.hypot(p.wx, p.wy) || 1, dx = p.wx / wl, dz = p.wy / wl;
    const hug = p.kind === 'floor' ? 0 : p.kind === 'corner' ? 0.45 : 0.4;
    const x = wp.x + dx * hug * CELL * 0.5 + (r() - 0.5) * (p.kind === 'floor' ? 1.0 : 0.6), z = wp.z + dz * hug * CELL * 0.5 + (r() - 0.5) * (p.kind === 'floor' ? 1.0 : 0.6);
    if (inStream(W, x, z, 0.2)) continue;
    const face = p.kind === 'floor' ? r() * TAU : Math.atan2(-dx, -dz) + (r() - 0.5) * 0.6, k = p.r;
    const collide = rad => W.collision.addCircle(x, z, rad);
    if (p.kind === 'corner') {
      if (k < 0.3 && p.big) { addPiece(W, iceCluster(Math.floor(r() * 4), { H: 1.2 + r() * 0.5 }), x, z, face, { s: 0.85 + r() * 0.3 }); collide(0.55); }
      else if (k < 0.55) { B.addVC(F.snowRock(Math.floor(r() * 4), { R: 0.55 + r() * 0.2 })['d:body'], M(x, -0.06, z, 1, 1, 1, 0, r() * TAU, 0)); CL.addVC(F.drift(Math.floor(r() * 4), { R: 0.9, h: 0.3 })['d:body'], M(x - dz * 0.6, -0.04, z + dx * 0.6, 1, 1, 1, 0, r() * TAU, 0)); if (p.big) collide(0.5); }
      else if (k < 0.72 && p.big) { addPiece(W, frozenBarrels(Math.floor(r() * 3)), x, z, face, { s: 0.95 }); collide(0.6); }
      else if (k < 0.86) { addPiece(W, iceSpire(Math.floor(r() * 3)), x, z, r() * TAU, { s: 0.55 + r() * 0.15 }); collide(0.45); }
      else { CL.addVC(F.frostGrass(Math.floor(r() * 4))['d:grass'], M(x, 0, z, 1.1, 1.1, 1.1, 0, r() * TAU, 0)); for (let i = 0; i < 2; i++) CL.add(SH.cone(), M(x + (r() - 0.5) * 0.8, 0.035, z + (r() - 0.5) * 0.8, 0.035, 0.2 + r() * 0.15, 0.035, Math.PI / 2, r() * TAU, 0), null, icicleP); }
    } else if (p.kind === 'edge') {
      if (k < 0.24) CL.addVC(F.frostGrass(Math.floor(r() * 4))['d:grass'], M(x, 0, z, 0.9 + r() * 0.5, 0.9 + r() * 0.5, 0.9 + r() * 0.5, 0, r() * TAU, 0));
      else if (k < 0.4) for (let i = 0; i < 3; i++) CL.add(SH.rock(), M(x + (r() - 0.5) * 0.7, 0.05, z + (r() - 0.5) * 0.7, 0.07 + r() * 0.08, 0.06 + r() * 0.04, 0.07 + r() * 0.07, r(), r() * TAU, r()), null, iceChunkP);
      else if (k < 0.54) CL.addVC(F.drift(Math.floor(r() * 4), { R: 0.6 + r() * 0.3, h: 0.24 })['d:body'], M(x, -0.04, z, 1, 1, 1, 0, r() * TAU, 0));
      else if (k < 0.66) CL.addVC(F.snowRock(Math.floor(r() * 4), { R: 0.24 + r() * 0.12 })['d:body'], M(x, -0.03, z, 1, 1, 1, 0, r() * TAU, 0));
      else if (k < 0.76 && p.big) { const paint = icePaint(); for (let i = 0; i < 3; i++) B.add(SH.crys(), MD(x + (r() - 0.5) * 0.5, -0.02, z + (r() - 0.5) * 0.5, V((r() - 0.5) * 0.6, 1, (r() - 0.5) * 0.6).normalize(), 0.08 + r() * 0.04, 0.35 + r() * 0.5, 0.08 + r() * 0.04, r() * TAU), null, paint); collide(0.25); }
      else if (k < 0.86) for (let i = 0; i < 2; i++) CL.add(SH.cone(), M(x + (r() - 0.5) * 0.6, 0.035, z + (r() - 0.5) * 0.6, 0.035, 0.18 + r() * 0.16, 0.035, Math.PI / 2, r() * TAU, 0), null, icicleP);
      else if (k < 0.93 && p.big) { addPiece(W, Pr.oke(Math.floor(r() * 3)), x, z, face); collide(0.3); }
      else for (let i = 0; i < 4; i++) W.ddPebble(CL, x + (r() - 0.5) * 0.7, z + (r() - 0.5) * 0.7, 0.06 + r() * 0.07, col('#6c7890'), '#eef4fa');
    } else {
      if (k < 0.5) CL.add(SH.sphLo(), M(x, -0.02, z, 0.3 + r() * 0.25, 0.09, 0.26 + r() * 0.2, 0, r() * TAU, 0), null, snowP);
      else if (k < 0.75) for (let i = 0; i < 3; i++) CL.add(SH.rock(), M(x + (r() - 0.5) * 0.6, 0.04, z + (r() - 0.5) * 0.6, 0.05 + r() * 0.06, 0.04, 0.05 + r() * 0.05, r(), r() * TAU, r()), null, iceChunkP);
      else for (let i = 0; i < 3; i++) W.ddPebble(CL, x + (r() - 0.5) * 0.6, z + (r() - 0.5) * 0.6, 0.05 + r() * 0.06, col('#6c7890'), '#eef4fa');
    }
  }
}
function buildLights(W) { // every room light is a yukimi lantern standing off the wall, its fire the room's warm pool
  const at = W.L.at, T = W.theme;
  for (const l of W.L.lights) {
    const wp = W.cellToWorld(l.x, l.y);
    let dx = (at(l.x + 1, l.y) ? 0 : 1) - (at(l.x - 1, l.y) ? 0 : 1), dz = (at(l.x, l.y + 1) ? 0 : 1) - (at(l.x, l.y - 1) ? 0 : 1);
    const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
    const x = wp.x + dx * 0.35, z = wp.z + dz * 0.35, face = Math.atan2(-dx, -dz);
    if (inStream(W, x, z, 0.2)) continue;
    addPiece(W, Pr.yukimiLantern(Math.floor(W.rng() * 8), { s: 0.82 }), x, z, face, { lights: false, mul: 0.8 });
    W.halos.add(x, 0.9 * 0.82, z, 1.15, T.light, 0.32, 1);
    W.floorGlows.add(x - dx * 0.9, 0.04, z - dz * 0.9, 2.4, '#ffa050', 0.22, 1);
    W.lightPool.addSource({ pos: V(x - dx * 1.6, 1.3, z - dz * 1.6), color: col(T.light).clone(), intensity: (T.lightI ?? 9) * 0.8, radius: 10, flicker: 0.9 });
    W.collision.addCircle(x, z, 0.5);
  }
}
function buildCenterpieces(W) {
  const r = W.rng, B = W.solid, ks = W.kitState;
  for (const c of W.L.centers || []) {
    const p = W.cellToWorld(c.x, c.y);
    if (c.r < 0.38) { // a hot spring at the chamber's heart: the rim, oke and a bench, a lantern, a snow monkey soaking
      const pl = ks.pools.find(q => q.center && Math.hypot(q.x - p.x, q.z - p.z) < 1); if (!pl) continue;
      dressPool(W, pl, { spout: true });
      const ma = r() * TAU; addPiece(W, snowMonkey(Math.floor(r() * 2)), p.x + Math.cos(ma) * pl.R * 0.55, p.z + Math.sin(ma) * pl.R * 0.55, ma + Math.PI + 0.4, { y: -0.04 });
      const ba = CAM + Math.PI + (r() - 0.5) * 0.6, bx = p.x + Math.cos(ba) * (pl.R + 1.4), bz = p.z + Math.sin(ba) * (pl.R + 1.4);
      if (W.walkable(bx, bz)) { addPiece(W, Pr.bench(0), bx, bz, Math.atan2(p.x - bx, p.z - bz)); W.collision.addCircle(bx, bz, 0.5); }
      const oa = ba + 1.3, ox = p.x + Math.cos(oa) * (pl.R + 0.9), oz = p.z + Math.sin(oa) * (pl.R + 0.9);
      if (W.walkable(ox, oz)) { addPiece(W, Pr.oke(1), ox, oz, r() * TAU); W.collision.addCircle(ox, oz, 0.3); }
    } else if (c.r < 0.7) { // an ice spire on a snow mound, small crystal clusters round it, frosted stones
      addPiece(W, iceSpire(Math.floor(r() * 3)), p.x, p.z, r() * TAU, { s: 1.15 });
      W.clutter.addVC(F.drift(2, { R: 1.6, h: 0.42 })['d:body'], M(p.x, -0.1, p.z, 1, 1, 1, 0, r() * TAU, 0));
      for (let i = 0; i < 3; i++) { const a = i / 3 * TAU + r(), d = 1.5 + r() * 0.3; addPiece(W, iceCluster(i + 4, { n: 4, H: 0.8, spread: 0.3 }), p.x + Math.cos(a) * d, p.z + Math.sin(a) * d, a, { s: 0.7 + r() * 0.2 }); }
      for (let i = 0; i < 9; i++) { const a = i / 9 * TAU; B.add(SH.rock(), M(p.x + Math.cos(a) * 2.2, 0.08, p.z + Math.sin(a) * 2.2, 0.2 + r() * 0.08, 0.15, 0.2, r(), r() * TAU, 0), null, rockSnowP('#5a6478', '#7c88a0')); }
      W.halos.add(p.x, 1.6, p.z, 3.6, '#9fd0ff', 0.16);
      W.lightPool.addSource({ pos: V(p.x, 2.2, p.z), color: col('#a8d8ff').clone(), intensity: 4, radius: 7, flicker: 0.05 });
      W.collision.addCircle(p.x, p.z, 1.6);
    } else { // a snowed-in hokora with a snow torii before it and a pair of yukimi lanterns
      addPiece(W, snowHokora(Math.floor(r() * 3)), p.x, p.z - 0.6, 0);
      addPiece(W, Pr.snowTorii(5, { w: 1.8, h: 2.1 }), p.x, p.z + 1.4, 0);
      for (const s2 of [-1, 1]) addPiece(W, Pr.yukimiLantern(9 + s2, { s: 0.66 }), p.x + s2 * 1.55, p.z + 0.4, 0, { mul: 0.8, lightK: 0.6 });
      W.collision.addCircle(p.x, p.z - 0.6, 0.85); for (const s2 of [-1, 1]) { W.collision.addCircle(p.x + s2 * 0.9, p.z + 1.4, 0.18); W.collision.addCircle(p.x + s2 * 1.55, p.z + 0.4, 0.42); }
    }
  }
  for (const pl of ks.pools) if (!pl.center) dressPool(W, pl); // (the rooms' own springs, laid out with the decor map)
}

// ------------------------------------------------------------------ the arena: Yuki-onna's frozen hall
function buildArena(W) {
  const A = W.arena, L = W.L, ar = L.arena, mouth = L.arenaMouth; if (!A || !ar) return;
  const B = W.solid, HA = W.halos, q = W.krng;
  const ma = mouth ? Math.atan2(mouth.z - ar.z, mouth.x - ar.x) : Math.PI / 4;
  W.arenaLanterns = [];
  const n = 9; // (her whiteout clears one ellipse per lantern: at most 9 of them, plus the hero's)
  for (let i = 0; i < n; i++) { // yukimi lanterns round the ring, a gap at the mouth
    const a = ma + (i + 0.5) / n * TAU;
    if (Math.abs(Math.atan2(Math.sin(a - ma), Math.cos(a - ma))) < 0.42) continue;
    const rr = ar.r - 1.75, x = ar.x + Math.cos(a) * rr, z = ar.z + Math.sin(a) * rr;
    if (!W.walkable(x, z)) continue;
    addPiece(W, Pr.yukimiLantern(11 + i, { s: 1.0 }), x, z, Math.atan2(ar.x - x, ar.z - z), { lights: false, mul: 0.8 });
    W.collision.addCircle(x, z, 0.55);
    W.arenaLanterns.push(V(x, 1.0, z));
    HA.add(x, 0.92, z, 1.8, P.lantern, 0.55, 1);
    W.floorGlows.add(x, 0.05, z, 2.6, '#ffa050', 0.2, 1);
    if (i % 2 === 0) W.lightPool.addSource({ pos: V(x, 1.6, z), color: col(P.lantern).clone(), intensity: 7, radius: 9, flicker: 0.8 });
    // between the lanterns: ice crystals and drifts against the rim
    const b = a + Math.PI / n, bx = ar.x + Math.cos(b) * (ar.r - 0.6), bz = ar.z + Math.sin(b) * (ar.r - 0.6);
    if (i % 2 && W.walkable(bx, bz)) { addPiece(W, iceCluster(20 + i, { n: 5, H: 1.3 }), bx, bz, Math.atan2(ar.x - bx, ar.z - bz), { s: 0.9 }); W.collision.addCircle(bx, bz, 0.5); }
    else if (W.walkable(bx, bz)) W.clutter.addVC(F.drift(i % 4, { R: 1.1, h: 0.34 })['d:body'], M(bx, -0.05, bz, 1, 1, 1, 0, b, 0));
  }
  if (mouth) { // the snow torii over the way in (it faces the corridor), lanterns flanking it
    const tx = ar.x + Math.cos(ma) * (ar.r - 0.4), tz = ar.z + Math.sin(ma) * (ar.r - 0.4), yaw = Math.atan2(Math.cos(ma), Math.sin(ma));
    addPiece(W, Pr.snowTorii(2, { w: 3.8, h: 3.6 }), tx, tz, yaw);
    const px = -Math.sin(ma), pz = Math.cos(ma);
    for (const s of [-1, 1]) { W.collision.addCircle(tx + px * s * 1.9, tz + pz * s * 1.9, 0.22); const lx = tx + px * s * 2.8 - Math.cos(ma) * 0.6, lz = tz + pz * s * 2.8 - Math.sin(ma) * 0.6; if (W.walkable(lx, lz)) { addPiece(W, Pr.yukimiLantern(31 + s, { s: 0.7 }), lx, lz, yaw, { mul: 0.8, lightK: 0.5 }); W.collision.addCircle(lx, lz, 0.42); } }
    W.arenaGate = { x: tx, z: tz, yaw, w: 3.8 };
  }
  { // her frozen shrine across from the way in, on the far side from the camera: a frozen fall against the rock, a little
    // hokora under snow before it, big ice crystals either side
    let ra = ma + Math.PI; if (Math.cos(ra) * CAMX + Math.sin(ra) * CAMZ > -0.2) ra = Math.PI * 1.25 + (Math.sin(ma - Math.PI * 1.25) > 0 ? -0.75 : 0.75);
    const fx = ar.x + Math.cos(ra) * (ar.r - 0.9), fz = ar.z + Math.sin(ra) * (ar.r - 0.9), face = Math.atan2(ar.x - fx, ar.z - fz);
    addPiece(W, Pr.frozenFall(3, { W: 4.2, H: 3.8 }), fx, fz, face);
    W.collision.addCircle(fx, fz, 1.6);
    const hx = ar.x + Math.cos(ra) * (ar.r - 3.2), hz = ar.z + Math.sin(ra) * (ar.r - 3.2);
    addPiece(W, snowHokora(7), hx, hz, face, { s: 1.15 }); W.collision.addCircle(hx, hz, 0.95);
    for (const e of [-1, 1]) { const a2 = ra + e * 0.26, cx = ar.x + Math.cos(a2) * (ar.r - 2.0), cz = ar.z + Math.sin(a2) * (ar.r - 2.0); addPiece(W, iceCluster(30 + e, { n: 7, H: 2.1, spread: 0.55 }), cx, cz, Math.atan2(ar.x - cx, ar.z - cz), { s: 1.0 }); W.collision.addCircle(cx, cz, 0.7); }
    W.halos.add(fx, 1.8, fz, 5, '#cfeaff', 0.14);
    W.lightPool.addSource({ pos: V(hx, 2.4, hz), color: col('#bfe0ff').clone(), intensity: 4, radius: 8, flicker: 0.05 });
  }
  // a pale shaft falling into the hall through the ice in the roof, a soft pool under it (capped: 3 planes of ≤ 0.12)
  for (let i = 0; i < 3; i++) W.shaftBatch.add(ar.x + (q() - 0.5) * 3, ar.z + (q() - 0.5) * 3, 2.6 + q() * 1.6, 13, 0.28, q() * TAU, 0.18, 0.09 + q() * 0.03, q() * 10);
  W.floorGlows.add(ar.x, 0.05, ar.z, 4.4, '#e0f0ff', 0.12);
  W.lightPool.addSource({ pos: V(ar.x, 7, ar.z), color: col('#e0eeff').clone(), intensity: 3.2, radius: 16, flicker: 0.05 });
}

// a few pale shafts falling through ice in the cave roof (not in every room): two narrow planes each, a cool pool and a
// light under them, snow motes drifting in them (kit update). Capped as the bamboo's.
function buildShafts(W) { roofShafts(W, { max: 4, chance: 0.55, pool: '#d6ecff', poolA: 0.34, light: '#cfe4ff', lightI: 4.5, a0: 0.13, a1: 0.04 }); }

// ------------------------------------------------------------------ the stairs down
function buildLandmarks(W) {
  const L = W.L;
  if (!L.stairs) return;
  const c = W.cellToWorld(L.stairs.x, L.stairs.y), q = W.krng, rx = CAMX, rz = -CAMZ;
  const ok = (x, z, pad = 0.25) => W.walkable(x, z) && !W.collision.solidAt(x, z, pad);
  for (let i = 0; i < 12; i++) { const a = i / 12 * TAU + q() * 0.1, R = 1.4 + q() * 0.06, x = c.x + Math.cos(a) * R, z = c.z + Math.sin(a) * R; if (W.walkable(x, z)) W.clutter.addVC(Pr.stoneStep(i + 1, { R: 0.3 }).body, M(x, -0.02, z, 1, 1, 1, 0, -a, 0)); }
  const tx = c.x - CAMX * 0.6, tz = c.z - CAMZ * 0.6;
  if (ok(tx, tz, 0.1)) { addPiece(W, Pr.snowTorii(7, { w: 2.3, h: 2.4 }), tx, tz, CAM); for (const e of [-1, 1]) W.collision.addCircle(tx + rx * e * 1.15, tz + rz * e * 1.15, 0.18); }
  for (const e of [-1, 1]) { const x = c.x + rx * e * 2.1 - CAMX * 0.2, z = c.z + rz * e * 2.1 - CAMZ * 0.2; if (ok(x, z)) { addPiece(W, Pr.yukimiLantern(20 + e, { s: 0.72 }), x, z, CAM, { mul: 0.8, lightK: 0.6 }); W.collision.addCircle(x, z, 0.42); } }
  for (let i = 0; i < 3; i++) { const a = CAM + Math.PI + (i - 1) * 0.6, x = c.x + Math.cos(a) * 2.3, z = c.z + Math.sin(a) * 2.3; if (ok(x, z, 0.1)) W.clutter.addVC(F.drift(i, { R: 0.7, h: 0.28 })['d:body'], M(x, -0.04, z, 1, 1, 1, 0, a, 0)); }
}

// ------------------------------------------------------------------ decor-map clutter, wall clusters, the rill
function buildDressing(W) {
  const r = W.drng, L = W.L, K = W.decoK, TW = W.decoW, TH = W.decoH, D = W.deco, dist = W.wallDist, CL = W.clutter;
  const free = (x, z, pad = 0.25) => freeAt(W, x, z, pad);
  const n = { tuft: 0, lump: 0, pebble: 0, ice: 0 };
  for (let tz = 0; tz < TH; tz++) for (let tx = 0; tx < TW; tx++) {
    const k = (tz * TW + tx) * 4, lush = D[k], path = D[k + 1], stream = D[k + 2], acc = D[k + 3];
    const x = (tx + 0.1 + r() * 0.8) * CELL / K, z = (tz + 0.1 + r() * 0.8) * CELL / K;
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    if (!L.at(cx, cz)) continue;
    const wd = dist[cz * L.W + cx], roll = r();
    if (stream > 0.12) { // frost grass and ice chips on the rill's thawed banks
      if (stream < 0.36 && roll < 0.14 && free(x, z, 0.05)) { CL.addVC(F.frostGrass(Math.floor(r() * 4))['d:grass'], M(x, 0, z, 0.9, 0.9, 0.9, 0, r() * TAU, 0)); n.tuft++; }
      continue;
    }
    if (lush > 0.42 && roll < 0.32 * lush) { // snow lumps and frost tufts on the fresh-snow cushions
      if (!free(x, z, 0.05)) continue;
      if (r() < 0.35) { CL.addVC(F.frostGrass(Math.floor(r() * 4))['d:grass'], M(x, 0, z, 0.8 + r() * 0.4, 0.8 + r() * 0.4, 0.8 + r() * 0.4, 0, r() * TAU, 0)); n.tuft++; }
      else { CL.add(SH.sphLo(), M(x, -0.03, z, 0.22 + r() * 0.22, 0.1 + r() * 0.05, 0.2 + r() * 0.2, 0, r() * TAU, 0), null, snowP); n.lump++; }
    } else if (wd === 1 && roll < 0.3) { // the wall foot: ice chips, pebbles, icicle shards
      if (!free(x, z, 0.02)) continue;
      const kk = r();
      if (kk < 0.4) { for (let i = 0; i < 2; i++) CL.add(SH.rock(), M(x + (r() - 0.5) * 0.5, 0.04, z + (r() - 0.5) * 0.5, 0.06 + r() * 0.06, 0.05, 0.06 + r() * 0.05, r(), r() * TAU, r()), null, iceChunkP); n.ice++; }
      else if (kk < 0.78) { for (let i = 0, m = 2 + Math.floor(r() * 3); i < m; i++) W.ddPebble(CL, x + (r() - 0.5) * 0.7, z + (r() - 0.5) * 0.7, 0.05 + r() * 0.08, col('#6c7890'), '#eef4fa'); n.pebble++; }
      else { CL.add(SH.cone(), M(x, 0.035, z, 0.035, 0.2 + r() * 0.14, 0.035, Math.PI / 2, r() * TAU, 0), null, icicleP); n.ice++; }
    } else if (path > 0.2 && path < 0.55 && roll < 0.07) { // grit along the flag runs' edges
      if (!free(x, z, 0.02)) continue;
      for (let i = 0; i < 2; i++) W.ddPebble(CL, x + (r() - 0.5) * 0.5, z + (r() - 0.5) * 0.5, 0.04 + r() * 0.05, col('#7a849a'), '#e4ecf6');
      n.pebble += 2;
    } else if (acc > 0.35 && roll < 0.08) { if (free(x, z, 0.05)) { CL.addVC(F.frostGrass(Math.floor(r() * 4))['d:grass'], M(x, 0, z, 0.7, 0.7, 0.7, 0, r() * TAU, 0)); n.tuft++; } }
    else if (wd >= 2 && lush < 0.1 && path < 0.2 && roll < 0.025 && free(x, z, 0.02)) { // the open snow: lumps, pebble clusters, an ice chip
      const kk = r();
      if (kk < 0.4) { CL.add(SH.sphLo(), M(x, -0.03, z, 0.2 + r() * 0.2, 0.08 + r() * 0.04, 0.18 + r() * 0.18, 0, r() * TAU, 0), null, snowP); n.lump++; }
      else if (kk < 0.85) { for (let i = 0, m = 2 + Math.floor(r() * 3); i < m; i++) W.ddPebble(CL, x + (r() - 0.5) * 0.8, z + (r() - 0.5) * 0.8, 0.05 + r() * 0.07, col('#6c7890'), '#eef4fa'); n.pebble++; }
      else { CL.add(SH.rock(), M(x, 0.05, z, 0.12 + r() * 0.1, 0.08 + r() * 0.05, 0.12 + r() * 0.08, r(), r() * TAU, r()), null, iceChunkP); n.ice++; }
    }
  }
  wallClusters(W); rillStones(W); trailLanterns(W);
  W.dressCount = n;
}
// mid-scale dressing hugging the walls and corners of every chamber (ice-crystal clusters, drift heaps with frozen
// barrels, lantern groups, steaming vents, snowy boulders): 4–6 a chamber, 4.5 m apart, off the corridor mouths and the
// room dressing's claims; the middle stays clear for the fight. All baked into the floor's chunks (no new draw calls).
function wallClusters(W) {
  let lit = 0, vents = 0;
  W.clusterCount = wallSpots(W, ({ s, x: px, z: pz, corner, far, face, r }) => {
    const k = r();
    if (k < 0.28) { addPiece(W, iceCluster(Math.floor(r() * 4) + 8, { n: 6, H: 1.3 + r() * 0.6, spread: 0.5 }), px + s.nx * 0.25, pz + s.nz * 0.25, face + (r() - 0.5) * 0.5, { s: (corner ? 1.1 : 0.9) + r() * 0.25 }); W.collision.addCircle(px + s.nx * 0.25, pz + s.nz * 0.25, 0.6); }
    else if (k < 0.46) { // a drift heaped against the foot, a frozen barrel half buried in it, ice chips
      W.clutter.addVC(F.drift(Math.floor(r() * 4), { R: 1.3, h: 0.42 })['d:body'], M(px + s.nx * 0.3, -0.06, pz + s.nz * 0.3, 1, 1, 1, 0, r() * TAU, 0));
      addPiece(W, frozenBarrels(Math.floor(r() * 3) + 3), px + s.nx * 0.2, pz + s.nz * 0.2, face + (r() - 0.5) * 0.6, { s: 0.9 }); W.collision.addCircle(px + s.nx * 0.2, pz + s.nz * 0.2, 0.6);
    } else if (k < 0.64) { // snowy boulders, a big one and a couple of small, frost grass between
      W.solid.addVC(F.snowRock(Math.floor(r() * 4), { R: corner ? 0.78 : 0.62 })['d:body'], M(px + s.nx * 0.2, -0.08, pz + s.nz * 0.2, 1, 1, 1, 0, r() * TAU, 0)); W.collision.addCircle(px + s.nx * 0.2, pz + s.nz * 0.2, 0.62);
      for (let j = 0; j < 2; j++) { const o = (j ? 1 : -1) * (0.9 + r() * 0.4), x = px + s.tx * o - s.nx * 0.2, z = pz + s.tz * o - s.nz * 0.2; if (freeAt(W, x, z, 0.2)) W.clutter.addVC(F.snowRock(Math.floor(r() * 4), { R: 0.3 + r() * 0.12 })['d:body'], M(x, -0.04, z, 1, 1, 1, 0, r() * TAU, 0)); }
      W.clutter.addVC(F.frostGrass(Math.floor(r() * 4))['d:grass'], M(px - s.nx * 0.6 + s.tx * 0.5, 0, pz - s.nz * 0.6 + s.tz * 0.5, 1.1, 1.1, 1.1, 0, r() * TAU, 0));
    } else if (k < 0.8 && far) { // a group of yukimi lanterns, one lit
      const on = lit < 6; if (on) lit++;
      addPiece(W, Pr.yukimiLantern(30 + Math.floor(r() * 6), { s: 0.72 }), px + s.nx * 0.2, pz + s.nz * 0.2, face, { lights: false, mul: 0.8 }); W.collision.addCircle(px + s.nx * 0.2, pz + s.nz * 0.2, 0.42);
      for (const e of [-1, 1]) { const x = px + s.tx * e * 0.95 - s.nx * 0.15, z = pz + s.tz * e * 0.95 - s.nz * 0.15; if (freeAt(W, x, z, 0.15)) { addPiece(W, Pr.yukimiLantern(40 + e + Math.floor(r() * 4), { s: 0.42 + r() * 0.1 }), x, z, face + (r() - 0.5) * 0.4, { lights: false, mul: 0.74 }); W.collision.addCircle(x, z, 0.24); } }
      if (on) { W.halos.add(px + s.nx * 0.2, 0.68, pz + s.nz * 0.2, 1.0, P.lantern, 0.3, 1); W.floorGlows.add(px - s.nx * 0.5, 0.04, pz - s.nz * 0.5, 1.9, '#ffa050', 0.2, 1); W.lightPool.addSource({ pos: V(px - s.nx * 0.9, 1.1, pz - s.nz * 0.9), color: col(P.lantern).clone(), intensity: 5, radius: 6, flicker: 0.8 }); }
      W.clutter.addVC(F.drift(Math.floor(r() * 4), { R: 0.7, h: 0.24 })['d:body'], M(px - s.nx * 0.5 + s.tx * 0.5, -0.04, pz - s.nz * 0.5 + s.tz * 0.5, 1, 1, 1, 0, r() * TAU, 0));
    } else if (k < 0.9 && vents < 4 && W.kitState.pools.length < POOL_MAX) { // a steaming vent in the floor: a ring of dark wet rocks, an ember glow, a puddle
      vents++;
      const x = px + s.nx * 0.1, z = pz + s.nz * 0.1;
      addPool(W, x, z, 0.55, 2);
      for (let j = 0; j < 7; j++) { const a = j / 7 * TAU; W.solid.add(SH.rock(), M(x + Math.cos(a) * 0.65, 0.05, z + Math.sin(a) * 0.65, 0.13 + r() * 0.05, 0.09, 0.11, r(), r() * TAU, r()), null, grad('#2e3038', '#4a4e5a')); }
      W.collision.addCircle(x, z, 0.7);
      W.floorGlows.add(x, 0.05, z, 1.8, '#ff8a40', 0.24, 1);
      W.lightPool.addSource({ pos: V(x, 0.9, z), color: col('#ffa060').clone(), intensity: 3.2, radius: 5, flicker: 0.3 });
      W.kitState.vents.push({ x, y: 0.1, z, px: x, pz: z });
    } else { // a few icicle shards and ice chips in a drift
      W.clutter.addVC(F.drift(Math.floor(r() * 4), { R: 1.0, h: 0.3 })['d:body'], M(px + s.nx * 0.2, -0.05, pz + s.nz * 0.2, 1, 1, 1, 0, r() * TAU, 0));
      for (let j = 0; j < 4; j++) W.clutter.add(SH.cone(), M(px + (r() - 0.5) * 1.6, 0.04, pz + (r() - 0.5) * 1.2, 0.04, 0.2 + r() * 0.2, 0.04, Math.PI / 2, r() * TAU, 0), null, icicleP);
      for (let j = 0; j < 3; j++) W.clutter.add(SH.rock(), M(px + (r() - 0.5) * 1.4, 0.05, pz + (r() - 0.5) * 1.2, 0.08 + r() * 0.06, 0.06, 0.08, r(), r() * TAU, r()), null, iceChunkP);
    }
  });
}
function rillStones(W) { // stepping stones across each rill, ice chips along its banks, mist (kit update)
  const r = W.drng;
  for (const st of W.kitState.streams) {
    const pts = st.pts; if (pts.length < 2) continue;
    const mid = Math.floor(pts.length / 2), a = pts[Math.max(0, mid - 1)], b = pts[Math.min(pts.length - 1, mid + 1)];
    const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1, cx = (a[0] + b[0]) / 2, cz = (a[1] + b[1]) / 2, ax = -dz / l, az = dx / l;
    for (let k = -2; k <= 2; k++) { const x = cx + ax * k * 0.66 + (r() - 0.5) * 0.15, z = cz + az * k * 0.66 + (r() - 0.5) * 0.15; if (W.walkable(x, z)) W.clutter.addVC(slab(k + 9, { R: 0.34, h: 0.1, moss: 0, tone: '#8a94a8' }), M(x, -0.02, z, 1, 1, 1, 0, r() * TAU, 0)); }
    for (let i = 0; i < pts.length - 1; i++) for (let t = 0; t < 1; t += 0.25) {
      const p0 = pts[i], p1 = pts[i + 1], x0 = p0[0] + (p1[0] - p0[0]) * t, z0 = p0[1] + (p1[1] - p0[1]) * t, ex = p1[0] - p0[0], ez = p1[1] - p0[1], el = Math.hypot(ex, ez) || 1;
      for (const e of [-1, 1]) { const d = 1.25 + r() * 0.35, x = x0 - ez / el * e * d, z = z0 + ex / el * e * d; if (W.walkable(x, z) && r() < 0.6) W.clutter.add(SH.rock(), M(x, 0.04, z, 0.08 + r() * 0.06, 0.05, 0.08, r(), r() * TAU, r()), null, r() < 0.5 ? iceChunkP : grad('#4e586a', '#7c8698')); }
    }
    for (let i = 1; i < pts.length - 1; i += 2) W.kitState.mists.push({ x: pts[i][0], z: pts[i][1] });
  }
}
function trailLanterns(W) { // a red paper chōchin on a post beside a trail in some rooms (a warm accent)
  const r = W.drng, L = W.L, HA = W.halos;
  let placed = 0;
  for (const rm of L.rooms) {
    if (rm.kind === 'boss' || rm.kind === 'start' || r() < 0.45 || placed >= 7) continue;
    for (let t = 0; t < 40; t++) {
      const x = (rm.x + r() * rm.w) * CELL, z = (rm.y + r() * rm.h) * CELL, [, path] = W.decoAt(x, z);
      if (path < 0.25 || path > 0.5 || !W.walkable(x, z) || W.keepClear(x, z, 0.5) || W.collision.solidAt(x, z, 0.7) || W.noClutterAt?.(x, z) || inStream(W, x, z, 0.12)) continue;
      const a = r() * TAU, seed = Math.floor(r() * 3);
      addPiece(W, lanternPost(seed), x, z, a);
      const lx = x + Math.cos(-a) * 0.4, lz = z + Math.sin(-a) * 0.4; // (the arm's local +x, turned by the yaw)
      HA.add(lx, 1.45, lz, 1.2, seed % 3 ? '#ff9a6a' : '#ffd8a0', 0.5, 1);
      W.lightPool.addSource({ pos: V(lx, 1.4, lz), color: col('#ffb47a').clone(), intensity: 3.2, radius: 5, flicker: 0.6 });
      W.collision.addCircle(x, z, 0.14);
      placed++;
      break;
    }
  }
}
// the melt rill (decor b): one chamber may get a rill running wall to wall; the hot-spring pools: at a chamber's heart
// (some centrepieces) and against a far wall of some chambers. Both are painted into the decor map before the room
// dressing (prepRoom adds the rill to the room's runner lanes; the pools' rims carry colliders), so pieces keep off them.
function decoMap(W, { curve, disc, cellsOf }) {
  const L = W.L, r = mulberry32(L.floor * 3313 + (L.rooms[1]?.x || 0) * 7 + 5), at = L.at, ks = W.kitState, dist = W.wallDist;
  const blocked = (x, z, pad = 2.4) => [...L.chests, ...L.shrines, ...(L.slots || []), ...(L.pots || [])].some(c => Math.hypot((c.x + 0.5) * CELL - x, (c.y + 0.5) * CELL - z) < pad) || L.spawns.some(sp => sp.boss && Math.hypot((sp.x + 0.5) * CELL - x, (sp.y + 0.5) * CELL - z) < 4)
    || Math.hypot((L.start.x + 0.5) * CELL - x, (L.start.y + 0.5) * CELL - z) < 7 || (L.stairs && Math.hypot((L.stairs.x + 0.5) * CELL - x, (L.stairs.y + 0.5) * CELL - z) < 5);
  // the rill
  const want = r() < 0.5 ? 1 : 0;
  const cand = L.rooms.filter(rm => (rm.kind === 'camp' || rm.kind === 'objective') && rm.w >= 9 && rm.h >= 9 && !(L.centers || []).some(c => L.roomId[c.y * L.W + c.x] === rm.id));
  for (let i = cand.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [cand[i], cand[j]] = [cand[j], cand[i]]; }
  for (const rm of cand) {
    if (ks.streams.length >= want) break;
    const cells = cellsOf(rm); if (cells.length < 60) continue;
    const cx = (rm.cx + 0.5) * CELL, cz = (rm.cy + 0.5) * CELL, a = r() * Math.PI, dx = Math.cos(a), dz = Math.sin(a);
    const reach = sgn => { let s = 0; for (; s < 30; s += 0.5) { const x = cx + dx * sgn * s, z = cz + dz * sgn * s, gx = Math.floor(x / CELL), gz = Math.floor(z / CELL); if (!at(gx, gz)) break; if (L.roomId[gz * L.W + gx] !== rm.id) return -1; } return s; };
    const s1 = reach(1), s0 = reach(-1); if (s1 < 3 || s0 < 3) continue;
    const pts = [], N = 6, px = -dz, pz = dx, ph = r() * TAU;
    for (let k = 0; k <= N; k++) { const t = -s0 - 0.6 + (s0 + s1 + 1.2) * k / N, wig = Math.sin(k * 1.3 + ph) * 1.1; pts.push([cx + dx * t + px * wig, cz + dz * t + pz * wig]); }
    if (pts.some(([x, z]) => blocked(x, z, 2.4))) continue;
    for (let k = 0; k < N; k++) curve(pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1], 1.4, 2, 1);
    ks.streams.push({ room: rm.id, pts });
  }
  // the springs: the centrepieces' (c.r < 0.38), then against a far wall in a couple of other chambers
  for (const c of L.centers || []) if (c.r < 0.38) { const x = (c.x + 0.5) * CELL, z = (c.y + 0.5) * CELL; const pl = addPool(W, x, z, 1.75, 0, { center: true, room: L.roomId[c.y * L.W + c.x] }); if (pl) disc(x, z, 2.7, 2, 1, 0.05); }
  const rooms = L.rooms.filter(rm => rm.kind === 'camp' || rm.kind === 'objective' || rm.kind === 'shrine').filter(rm => !ks.pools.some(pl => pl.room === rm.id) && !ks.streams.some(st => st.room === rm.id));
  for (let i = rooms.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [rooms[i], rooms[j]] = [rooms[j], rooms[i]]; }
  let placed = 0;
  for (const rm of rooms) {
    if (placed >= 2) break;
    const cells = cellsOf(rm).filter(([x, y]) => dist[y * L.W + x] === 2);
    let best = null, bs = -1e9;
    for (let t = 0; t < 40 && cells.length; t++) {
      const [cx, cy] = cells[Math.floor(r() * cells.length)];
      // the wall it backs onto: the nearest rock along the eight directions
      let wx = 0, wz = 0; for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) if (!at(cx + ox * 2, cy + oy * 2) || !at(cx + ox * 3, cy + oy * 3)) { wx += ox; wz += oy; }
      if (!wx && !wz) continue;
      const x = (cx + 0.5) * CELL, z = (cy + 0.5) * CELL;
      if (blocked(x, z, 3.2) || L.spawns.some(sp => !sp.boss && Math.hypot((sp.x + 0.5) * CELL - x, (sp.y + 0.5) * CELL - z) < 4.2) || W.decoAt(x, z)[2] > 0.05) continue;
      let mouth = false; for (const [mx, my] of cellsOf(rm)) { if (Math.hypot(mx - cx, my - cy) > 3.2) continue; for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (at(mx + ox, my + oy) && L.roomId[(my + oy) * L.W + mx + ox] !== rm.id) mouth = true; }
      if (mouth) continue;
      const s = -toCam(wx, wz) + r() * 0.5; // (the far walls first: the camera looks at the pool across the room)
      if (s > bs) { bs = s; best = { x, z }; }
    }
    if (!best) continue;
    const R = 1.05 + r() * 0.45, pl = addPool(W, best.x, best.z, R, 0, { room: rm.id }); if (!pl) break;
    disc(best.x, best.z, R + 1.0, 2, 1, 0.05); placed++;
  }
}

// ------------------------------------------------------------------ room purposes (roomDressing.js RoomDresser = D)
function prep(D, A) { // the room's rill joins its runner lanes so nothing stands in the water
  if (A._onsenPrep) return; A._onsenPrep = true;
  for (const st of D.W.kitState.streams) if (st.room === A.rm.id) for (let k = 0; k < st.pts.length - 1; k++) A.lanes.push([st.pts[k][0], st.pts[k][1], st.pts[k + 1][0], st.pts[k + 1][1], 1.25, 1]);
}
const farFacing = s => s && toCam(s.fx, s.fz) > 0.25; // a wall spot whose wall is on the far side (it faces the camera)
const poolIn = (W, A) => W.kitState.pools.find(pl => pl.room === A.rm.id && pl.kind === 0);
const ROOMS = {
  springs(D, A) { // a hot-spring pocket: the room's pool (or a new one against a far wall) with a bench, oke, a lantern, towels and a snow monkey
    prep(D, A); const W = D.W;
    let pl = poolIn(W, A);
    if (!pl) {
      let s = null; for (let t = 0; t < 10 && !farFacing(s); t++) s = D.spot(A, 2.1, { mode: 'wall', hug: 0.35, camPref: 1.8, core: 1.4 });
      if (!s) { ROOMS.bathhouse(D, A); return; }
      const R = 1.2 + D.r() * 0.3, [x, z] = D.lp(s, 0, 0.6);
      pl = addPool(W, x, z, R, 0, { room: A.rm.id }); if (!pl) return;
      D.claim(x, z, R + 1.6, true, R + 1.6, R + 0.4); dressPool(W, pl);
    } else D.claim(pl.x, pl.z, pl.R + 1.4, true, pl.R + 1.4, pl.R + 0.4);
    const toP = Math.atan2(pl.x - A.cx, pl.z - A.cz); // (the room's heart → the pool)
    const ma = toP + Math.PI + (D.r() - 0.5) * 0.8; addPiece(W, snowMonkey(Math.floor(D.r() * 2)), pl.x + Math.cos(ma) * pl.R * 0.5, pl.z + Math.sin(ma) * pl.R * 0.5, ma + Math.PI, { y: -0.04 });
    const side = (D.r() < 0.5 ? 1 : -1);
    const put = (ang, d, fn) => { const x = pl.x + Math.sin(ang) * d, z = pl.z + Math.cos(ang) * d; if (D.ok(x, z, 0.35)) { fn(x, z); return true; } return false; };
    put(toP + Math.PI + side * 0.9, pl.R + 1.3, (x, z) => { addPiece(W, Pr.bench(1), x, z, Math.atan2(pl.x - x, pl.z - z)); D.coll(x, z, 0.5); });
    put(toP + Math.PI - side * 1.1, pl.R + 1.0, (x, z) => { addPiece(W, Pr.oke(2), x, z, D.r() * TAU); D.coll(x, z, 0.3); });
    put(toP + Math.PI - side * 1.8, pl.R + 1.4, (x, z) => { addPiece(W, Pr.yukimiLantern(50, { s: 0.7 }), x, z, Math.atan2(pl.x - x, pl.z - z), { mul: 0.8, lightK: 0.6 }); D.coll(x, z, 0.42); });
    put(toP + Math.PI + side * 1.9, pl.R + 1.6, (x, z) => { addPiece(W, towelRack(0), x, z, Math.atan2(pl.x - x, pl.z - z)); D.coll(x, z, 0.35); });
  },
  bathhouse(D, A) { // the old bath corner: a duckboard deck with oke and a stool, a towel rack, a noren-hung lantern
    prep(D, A); const W = D.W;
    let s = null; for (let t = 0; t < 6 && !farFacing(s); t++) s = D.spot(A, 1.4, { mode: 'wall', hug: 0.6, camPref: 1.6, core: 0.9 });
    if (s) D.claim(s.x, s.z, 1.4, true, 1.4, 0.9); else s = D.put(A, 1.4, { mode: 'wall', hug: 0.6, camPref: 1.6, core: 0.9 });
    if (!s) return;
    addPiece(W, bathDeck(Math.floor(D.r() * 3)), s.x, s.z, s.face); D.coll(s.x, s.z, 0.95);
    const [tx, tz] = D.lp(s, 1.6, -0.1); if (D.ok(tx, tz, 0.3)) { addPiece(W, towelRack(1), tx, tz, s.face); D.coll(tx, tz, 0.35); }
    const [lx, lz] = D.lp(s, -1.55, 0.2); if (D.ok(lx, lz, 0.3)) { addPiece(W, Pr.yukimiLantern(52, { s: 0.6 }), lx, lz, s.face, { mul: 0.8, lightK: 0.6 }); D.coll(lx, lz, 0.38); }
    const [ox, oz] = D.lp(s, 0.6, 1.4); if (D.ok(ox, oz, 0.2)) { addPiece(W, Pr.oke(0), ox, oz, D.r() * TAU); D.coll(ox, oz, 0.28); }
  },
  icefall(D, A) { // a frozen waterfall against a far wall: its frozen plunge pool, ice crystals and shards round its foot
    prep(D, A); const W = D.W;
    let s = null; for (let t = 0; t < 10 && !farFacing(s); t++) s = D.spot(A, 1.8, { mode: 'wall', hug: 0.4, camPref: 2, core: 1.2 });
    if (!farFacing(s)) { ROOMS.crystals(D, A); return; }
    D.claim(s.x, s.z, 1.8, true, 2.0, 1.2);
    addPiece(W, Pr.frozenFall(Math.floor(D.r() * 3), { W: 2.8, H: 3.0 }), s.x, s.z, s.face, { s: 0.95 }); D.coll(s.x, s.z, 1.3);
    const [px, pz] = D.lp(s, 0, 1.7);
    if (D.ok(px, pz, 0.3)) { const pl = addPool(W, px, pz, 1.1, 1, { room: A.rm.id }); if (pl) dressPool(W, pl); }
    for (const e of [-1, 1]) { const [x, z] = D.lp(s, e * 2.0, 0.5); if (D.ok(x, z, 0.35)) { addPiece(W, iceCluster(12 + e, { n: 5, H: 1.1 }), x, z, s.face, { s: 0.8 }); D.coll(x, z, 0.45); } }
    for (let i = 0; i < 4; i++) { const [x, z] = D.lp(s, D.rnd(-2, 2), D.rnd(2.6, 3.4)); if (D.ok(x, z, 0.05)) D.CL.add(SH.cone(), M(x, 0.04, z, 0.04, 0.2 + D.r() * 0.2, 0.04, Math.PI / 2, D.r() * TAU, 0), null, icicleP); }
  },
  crystals(D, A) { // an ice-crystal grove crowding the far side of the room, a soft blue glow among them
    prep(D, A); const W = D.W;
    let n = 0;
    for (let t = 0; t < 8 && n < 3; t++) {
      const s = D.spot(A, 1.0, { mode: 'wall', hug: 0.6, camPref: 2, core: 0.55 }); if (!farFacing(s)) continue;
      D.claim(s.x, s.z, 1.0, true, 1.1, 0.6); n++;
      addPiece(W, iceCluster(16 + n, { n: 7, H: 1.6 + D.r() * 0.6, spread: 0.55 }), s.x, s.z, s.face, { s: 0.95 + D.r() * 0.2 }); D.coll(s.x, s.z, 0.6);
      for (let i = 0; i < 2; i++) { const [x, z] = D.lp(s, D.rnd(-1.2, 1.2), D.rnd(0.6, 1.3)); if (D.ok(x, z, 0.05)) { const paint = icePaint(); for (let j = 0; j < 2; j++) W.solid.add(SH.crys(), MD(x + D.rnd(-0.2, 0.2), -0.02, z + D.rnd(-0.2, 0.2), V(D.rnd(-0.4, 0.4), 1, D.rnd(-0.4, 0.4)).normalize(), 0.07, 0.3 + D.r() * 0.3, 0.07, D.r() * TAU), null, paint); } }
      W.halos.add(s.x, 1.2, s.z, 2.2, '#9fd0ff', 0.16);
      if (n === 1) D.light(s.x + s.fx * 1.2, 1.6, s.z + s.fz * 1.2, '#a8d8ff', 3.5, 6, 0.05);
    }
  },
  lanterns(D, A) { // a lantern walk: pairs of yukimi lanterns along the room's main trail
    prep(D, A); const W = D.W;
    const ln = A.lanes.filter(l => !l[5]).sort((a, b) => Math.hypot(b[2] - b[0], b[3] - b[1]) - Math.hypot(a[2] - a[0], a[3] - a[1]))[0]; if (!ln) return;
    const len = Math.hypot(ln[2] - ln[0], ln[3] - ln[1]); if (len < 3) return;
    const ux = (ln[2] - ln[0]) / len, uz = (ln[3] - ln[1]) / len, nx = -uz, nz = ux;
    let n = 0;
    for (let t = 2.2; t < len - 1.5 && n < 6; t += 2.6) for (const e of [-1, 1]) {
      const x = ln[0] + ux * t + nx * e * 1.8, z = ln[1] + uz * t + nz * e * 1.8;
      if (!D.ok(x, z, 0.4) || !D.fits(A, x, z, 0.42, { collide: true, core: 0.36 }, 'open', true, 0, 0)) continue;
      D.claim(x, z, 0.42, true, 0.45, 0.36); n++;
      addPiece(W, Pr.yukimiLantern(50 + n, { s: 0.66 }), x, z, Math.atan2(-nx * e, -nz * e), { lights: false, mul: 0.8 }); D.coll(x, z, 0.4);
      W.halos.add(x, 0.6, z, 1.3, P.lantern, 0.5, 1); if (n % 2) D.light(x, 1.1, z, P.lantern, 3, 5, 0.6);
    }
  },
  shrine(D, A) { // a snowed-in shrine: the hokora against a far wall, a row of jizō in red bibs with snow on their heads, a torii
    prep(D, A); const W = D.W;
    let s = null; for (let t = 0; t < 6 && !farFacing(s); t++) s = D.spot(A, 1.6, { mode: 'wall', hug: 0.55, camPref: 1.6, core: 0.75 });
    if (s) D.claim(s.x, s.z, 1.6, true, 1.6, 0.75); else s = D.put(A, 1.6, { mode: 'wall', hug: 0.55, camPref: 1.6, core: 0.75 });
    if (!s) return;
    addPiece(W, snowHokora(Math.floor(D.r() * 3)), s.x, s.z, s.face); D.coll(s.x, s.z, 0.85);
    for (const e of [-1, 1]) for (let i = 0; i < 2; i++) {
      const [x, z] = D.lp(s, e * (1.5 + i * 0.7), 0.3 + i * 0.12); if (!D.ok(x, z, 0.22)) continue;
      const m = addPiece(W, jizo(i + (e > 0 ? 2 : 0)), x, z, s.face + e * 0.12, { s: 0.85 }); D.coll(x, z, 0.26);
      if (m) W.solid.add(SH.sphLo(), M(x, 1.0 * 0.85 + 0.2, z, 0.13, 0.06, 0.13), null, snowP);
    }
    const [tx, tz] = D.lp(s, 0, 2.1); if (D.ok(tx, tz, 0.15)) { addPiece(W, Pr.snowTorii(3, { w: 1.7, h: 2.0 }), tx, tz, s.face); D.coll(tx + Math.cos(s.face) * 0.85, tz - Math.sin(s.face) * 0.85, 0.16); D.coll(tx - Math.cos(s.face) * 0.85, tz + Math.sin(s.face) * 0.85, 0.16); }
  },
  storeroom(D, A) { // a frozen storeroom: firewood and sacks under snow, frozen barrels, a cold brazier
    prep(D, A); const W = D.W;
    const s = D.put(A, 1.8, { mode: 'wall', hug: 0.55, camPref: 1.2, core: 0.75 }); if (!s) return;
    addPiece(W, storePile(Math.floor(D.r() * 3)), s.x, s.z, s.face); D.coll(s.x, s.z, 0.85);
    const [bx, bz] = D.lp(s, 1.9, 0.5); if (D.ok(bx, bz, 0.4)) { addPiece(W, frozenBarrels(Math.floor(D.r() * 3) + 6), bx, bz, s.face, { s: 0.85 }); D.coll(bx, bz, 0.55); }
    const [cx, cz] = D.lp(s, -0.4, 1.6); if (D.ok(cx, cz, 0.3)) { addPiece(W, coldBrazier(0), cx, cz, D.r() * TAU); D.coll(cx, cz, 0.32); }
  },
};
function extras(D, A) { // every room: ice crystals against its far walls, an ice spire in the bigger ones, snowy rocks
  prep(D, A); const W = D.W;
  for (let t = 0, n = 0, want = A.cells.length > 70 ? 2 : 1; t < 10 && n < want; t++) {
    const s = D.spot(A, 0.8, { mode: 'wall', hug: 0.65, camPref: 2.4, core: 0.42 }); if (!farFacing(s)) continue;
    D.claim(s.x, s.z, 0.8, true, 0.9, 0.42); n++;
    addPiece(W, iceCluster(n + Math.floor(D.r() * 4), { n: 5, H: 1.1 + D.r() * 0.5 }), s.x, s.z, s.face, { s: 0.8 + D.r() * 0.2 }); D.coll(s.x, s.z, 0.42);
  }
  if (A.cells.length > 60) { const s = D.put(A, 1.1, { core: 0.75, ring: 1.6 }); if (s) { addPiece(W, iceSpire(Math.floor(D.r() * 3)), s.x, s.z, D.r() * TAU, { s: 0.78 + D.r() * 0.2 }); D.coll(s.x, s.z, 0.7); } }
  for (let i = 0, n = 1 + Math.floor(D.r() * 2); i < n; i++) { const s = D.put(A, 0.45, { mode: 'wall', hug: 0.7, core: 0.25 }); if (s) { W.solid.addVC(F.snowRock(i, { R: 0.36 })['d:body'], M(s.x, -0.05, s.z, 1, 1, 1, 0, D.r() * TAU, 0)); D.coll(s.x, s.z, 0.3); } }
}
function arrival(D, A) { // the way home: a snow torii framing the exit portal, yukimi lanterns either side, a goza landing
  const W = D.W, L = D.L, px = (L.start.x + 0.5) * CELL - 1.6, pz = (L.start.y + 0.5) * CELL - 1.6;
  D.decal(1, px, pz, 1.25, 0.85, -Math.PI / 4, 3);
  const tx = px - CAMX * 0.5, tz = pz - CAMZ * 0.5;
  if (W.walkable(tx, tz)) { addPiece(W, Pr.snowTorii(9, { w: 2.3, h: 2.6 }), tx, tz, CAM); for (const e of [-1, 1]) D.coll(tx + CAMX * e * 1.15, tz - CAMZ * e * 1.15, 0.16); }
  for (const e of [-1, 1]) { const x = px + CAMX * e * 2.0, z = pz - CAMZ * e * 2.0; if (W.walkable(x, z) && !W.collision.solidAt(x, z, 0.2)) { addPiece(W, Pr.yukimiLantern(60 + e, { s: 0.66 }), x, z, CAM, { mul: 0.8, lightK: 0.6 }); D.coll(x, z, 0.4); } }
  D.claim(px, pz, 1.4, false);
}
function hoard(D, A) { // the treasure dais: the gold chest on a goza mat, a little snow torii behind it, ice crystals and lanterns
  const W = D.W;
  for (const c of D.L.chests) {
    if (c.quality !== 'gold' || D.roomAt((c.x + 0.5) * CELL, (c.y + 0.5) * CELL) !== A.rm.id) continue;
    const x0 = (c.x + 0.5) * CELL, z0 = (c.y + 0.5) * CELL;
    W.kitDecal(1, x0, z0, 1.35, 1.1, CAM, 3);
    const tx = x0 - CAMX * 1.3, tz = z0 - CAMZ * 1.3;
    if (W.walkable(tx, tz) && !W.collision.solidAt(tx, tz, 0.1)) { addPiece(W, Pr.snowTorii(12, { w: 1.7, h: 2.0 }), tx, tz, CAM); for (const e of [-1, 1]) D.coll(tx + CAMX * e * 0.85, tz - CAMZ * e * 0.85, 0.14); }
    for (const e of [-1, 1]) { const x = x0 + CAMX * e * 1.8 - CAMX * 0.5, z = z0 - CAMZ * e * 1.8 - CAMZ * 0.5; if (W.walkable(x, z) && !W.collision.solidAt(x, z, 0.2)) { addPiece(W, Pr.yukimiLantern(70 + e, { s: 0.6 }), x, z, CAM, { mul: 0.8, lightK: 0.55 }); D.coll(x, z, 0.36); } }
    for (const e of [-1, 1]) { const x = x0 - CAMX * 2.2 + CAMX * e * 1.9, z = z0 - CAMZ * 2.2 - CAMZ * e * 1.9; if (W.walkable(x, z) && !W.collision.solidAt(x, z, 0.3)) { addPiece(W, iceCluster(40 + e, { n: 6, H: 1.4 }), x, z, CAM, { s: 0.85 }); D.coll(x, z, 0.5); } }
  }
  D.hoard(A);
}
function corridor(D, x, z, face, q) {
  const W = D.W;
  if (inStream(W, x, z, 0.2)) return;
  if (q < 0.3) D.CL.addVC(F.frostGrass(Math.floor(D.r() * 4))['d:grass'], M(x, 0, z, 0.8, 0.8, 0.8, 0, D.r() * TAU, 0));
  else if (q < 0.5) D.CL.addVC(F.drift(Math.floor(D.r() * 4), { R: 0.6, h: 0.22 })['d:body'], M(x, -0.04, z, 1, 1, 1, 0, D.r() * TAU, 0));
  else if (q < 0.66) for (let i = 0; i < 2; i++) D.CL.add(SH.rock(), M(x + (D.r() - 0.5) * 0.5, 0.04, z + (D.r() - 0.5) * 0.5, 0.07, 0.05, 0.06, D.r(), D.r() * TAU, D.r()), null, iceChunkP);
  else if (q < 0.84) D.CL.add(SH.cone(), M(x, 0.035, z, 0.035, 0.2 + D.r() * 0.15, 0.035, Math.PI / 2, D.r() * TAU, 0), null, icicleP);
  else for (let i = 0; i < 3; i++) W.ddPebble(D.CL, x + (D.r() - 0.5) * 0.5, z + (D.r() - 0.5) * 0.5, 0.05 + D.r() * 0.06, col('#6c7890'), '#eef4fa');
}

// ------------------------------------------------------------------ ambience
const _flakeFn = (q, dt) => { q.ph += dt * q.w; q.vx = q.bx + Math.sin(q.ph) * 0.18; q.vz = q.bz + Math.cos(q.ph * 0.7) * 0.14; };
function update(W, dt, t, vfx, focus) {
  const ks = W.kitState; if (!vfx || !focus) return;
  const near = (x, z, R) => (x - focus.x) ** 2 + (z - focus.z) ** 2 < R * R;
  // snow motes turning slowly in the shafts of light
  for (const s of ks.shafts || []) {
    if (!near(s.x, s.z, 18) || Math.random() > dt * 2.4) continue;
    vfx.dot.spawn({ x: s.x + rand(-0.6, 0.6), y: rand(0.6, 3.4), z: s.z + rand(-0.6, 0.6), vx: rand(-0.05, 0.05), vy: -rand(0.06, 0.14), vz: rand(-0.05, 0.05), life: rand(2.5, 4), size: rand(0.04, 0.07), color: '#f4faff', alpha: 0.8, alpha1: 0, fadeIn: 0.8 });
  }
  // snow sifting down from the cracks overhead (sparse, slow)
  ks.snowAcc = (ks.snowAcc || 0) + dt * 2.4;
  while (ks.snowAcc > 1) {
    ks.snowAcc--;
    const x = focus.x + rand(-13, 13), z = focus.z + rand(-11, 11); if (!W.walkable(x, z)) continue;
    const q = vfx.dot.spawn({ x, y: rand(4.5, 7), z, vy: -rand(0.35, 0.6), life: 11, size: rand(0.05, 0.09), color: '#f4f9ff', alpha: 0.85, alpha1: 0.6, fadeIn: 0.8, fn: _flakeFn });
    if (q) { q.ph = rand(0, TAU); q.w = rand(0.8, 1.6); q.bx = rand(-0.08, 0.08); q.bz = rand(-0.08, 0.08); }
  }
  // steam curling off the springs (warm-lit, faint: overlapping wisps must never become a sheet) and an ember of light
  for (const s of ks.steam) {
    if (!near(s.x, s.z, 18)) continue;
    if (Math.random() < dt * (0.9 + s.R * 0.4)) { const a = rand(0, TAU), rr = Math.sqrt(Math.random()) * s.R * 0.8; vfx.smoke.spawn({ x: s.x + Math.cos(a) * rr, y: 0.12, z: s.z + Math.sin(a) * rr, vx: rand(-0.08, 0.08), vy: rand(0.28, 0.45), vz: rand(-0.08, 0.08), life: rand(2.6, 3.6), size: 0.5, size1: 1.7, color: P.steam, alpha: 0.11, alpha1: 0, fadeIn: 0.9 }); }
    if (Math.random() < dt * 0.5) vfx.glow.spawn({ x: s.x + rand(-s.R, s.R) * 0.6, y: rand(0.3, 1.2), z: s.z + rand(-s.R, s.R) * 0.6, vy: rand(0.15, 0.3), life: rand(1.5, 2.5), size: rand(0.07, 0.11), color: '#ffb478', alpha: 0.7, alpha1: 0, fadeIn: 0.5 });
  }
  for (const v of ks.vents) {
    if (!near(v.x, v.z, 16)) continue;
    if (Math.random() < dt * 1.1) vfx.smoke.spawn({ x: v.x + rand(-0.15, 0.15), y: v.y, z: v.z + rand(-0.15, 0.15), vx: rand(-0.05, 0.05), vy: rand(0.35, 0.6), vz: rand(-0.05, 0.05), life: rand(2, 3), size: 0.3, size1: 1.3, color: P.steam, alpha: 0.12, alpha1: 0, fadeIn: 0.6 });
  }
  // drips off the icicles
  for (const d of ks.drips) {
    if (!near(d.x, d.z, 22)) continue;
    d.t -= dt; if (d.t > 0) continue; d.t = rand(1.6, 3.6);
    vfx.dot.spawn({ x: d.x + rand(-0.5, 0.5), y: d.y, z: d.z + rand(-0.05, 0.05), vy: -0.4, life: Math.sqrt(2 * d.y / 12) + 0.05, size: 0.06, color: '#d8f2ff', alpha: 0.95, alpha1: 0.8, grav: 12 });
  }
  // a faint cold mist over the rill
  for (const m of ks.mists) {
    if (!near(m.x, m.z, 16) || Math.random() > dt * 0.3) continue;
    vfx.smoke.spawn({ x: m.x + rand(-0.6, 0.6), y: 0.12, z: m.z + rand(-0.6, 0.6), vx: rand(-0.08, 0.08), vy: rand(0.04, 0.09), vz: rand(-0.08, 0.08), life: rand(2.6, 3.6), size: 0.6, size1: 1.5, color: '#e8f4ff', alpha: 0.06, alpha1: 0, fadeIn: 1.0 });
  }
}

export const ONSEN_KIT = {
  id: 'iceCavern',
  floorGLSL: FLOOR, bossGLSL: ARENA, wallGLSL: WALL, floorPars: PARS,
  floorUniforms: W => ({ uPools: { value: W.kitState.poolU } }),
  // the face swells out into a heavy overhanging icy brow (0.6 m over the room at 0.9 h), snow on its nose, then the rock
  // heaves up behind under snow (1.1 h → 1.3 h) before it drops away into the void: the walls imply the roof
  profile: (h, D, j) => [[-0.36, -0.02, 'foot', 1], [-0.26 + j[0], 0.22 * h, 'rock', 1], [-0.14 + j[1], 0.46 * h, 'rock', 1], [-0.18 + j[2], 0.66 * h, 'rock', 1],
    [-0.34 + j[2], 0.8 * h, 'rock', 1], [-0.58 + j[2] * 0.6, 0.91 * h, 'rock', 1], [-0.58 + j[2] * 0.6, 0.91 * h, 'lip', 0], [-0.62, 0.99 * h, 'lip', 0], [-0.46, 1.06 * h, 'snow', 0],
    [-0.16, 1.1 * h, 'snow', 0], [-0.16, 1.1 * h, 'top', 3], [D * 0.5 + 0.2, 1.2 * h + j[3], 'top', 3], [D + 0.2, 1.3 * h + j[3] * 0.6, 'top', 3],
    [D + 0.2, 1.3 * h, 'topBack', 0], [D * 1.15 + 0.35, 0.55 * h, 'back', 0], [D * 1.25 + 0.45, -0.02, 'void', 0]],
  roles: { foot: ['#323a4a', '#383f50'], rock: ['#5c6680', '#66708a'], lip: ['#8ab8e2', '#9cc6ea'], snow: ['#d4e0ee', '#e0e9f4'], top: ['#ffffff', '#f4f6fa'], topBack: ['#1a2230', '#1e2634'], back: ['#080c16', '#0a0e18'] },
  wallH: [3.1, 0.9, 0.5], ds: 0.5, brush: 0.22,
  deco: { lush: 0.9, crack: 0, acc: 0.9, path: 1 }, sig: P.sig, cap: '#4a5670',
  init(W) {
    W.kitState = { drips: [], streams: [], mists: [], shafts: [], steam: [], vents: [], pools: [], poolU: Array.from({ length: POOL_MAX }, () => new THREE.Vector4(0, 0, 0, 0)) };
    W.kitDecal = (...a) => kitDecal(W, ...a); W.arenaLanterns = [];
  },
  decoMap, dressWalls, buildProps, buildLights, buildShafts, buildCenterpieces, buildArena, buildLandmarks, buildDressing, update,
  finish(W) { return finishPlacer(W); },
  dispose(W) { disposePlacer(W); },
  purposes: ['springs', 'bathhouse', 'icefall', 'crystals', 'lanterns', 'shrine', 'storeroom'], dupes: ['springs', 'shrine'],
  rooms: ROOMS, extras, arrival, hoard, corridor,
  seal: { color: '#bfe8ff', rope: '#ecd8a0' }, // the arena seal's look (dungeon/zoneRun.js)
};
