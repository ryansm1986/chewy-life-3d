// Baked Disney-style heroes (tools/blender/disney → public/rigs/<id>_disney.{json,bin,png,_n.png}): skinned models
// driven by the same Animator as the kit rigs. The skeleton comes from Blender; every bone becomes a Group at its rest
// position with no rotation, so the Animator's rest-relative poses work unchanged. Face bones: a jaw that drops for
// talking and barking, eyelids that close to blink, lip corners that lift when happy; each ear has a base and a tip
// bone that ride the Animator's springs (rig.earGain).
//
//   await loadHeroModels(['chewy', 'moka'])   // missing files just leave that hero on the procedural kit
//   if (heroModelReady('moka')) rig = buildHeroModel('moka')
//
// Rig contract (same as the kit rigs + the baked extras): root, parts{ body, head, armL/R, handL/R, legL/R, earL/R
// (userData.tip = the tip bone), tail, back, jaw, lids, lidsLow, lips, eyes: [], brows: [], eyeballs }, mat, outMat,
// propMat (vertex-coloured toon for held props), meshes, skin, outline, skeleton, height, disney, bakedDisney,
// sharedGeo, earGain, hero (id), dispose().
import * as THREE from 'three';
import { makeToon, makeOutline } from '../gfx/materials.js';

const BASE = import.meta.env?.BASE_URL ?? '/';

// Runtime tuning per hero. palm/back: attachment points in model units (× meta.scale) under hand_* / chest.
// earFlip: the ears hang (Moka's pendant ears): each ear bone sits under a mount turned half round, so the
// Animator's spring drive (tuned on Chewy's perked flaps) swings a hanging ear back when running and lifts it out
// on a flick, instead of forward.
export const HERO_MODELS = {
  chewy: { file: 'chewy_disney', name: 'Chewy', outline: '#2a1812', earGain: 2.2, palm: [0, -0.045, 0.012], back: [0, 0.02, -0.125] },
  // the "Toybox" Chewy (tools/blender/work/codex/chewy-b, the codex-blender skill): the default Chewy model; the
  // Storybook (Disney) one above stays selectable (Settings > Toybox Chewy, ?chewymodel=disney) and is the fallback
  chewyToy: { file: 'chewy_b', name: 'Chewy', outline: '#2a1812', earGain: 1.6, tint: [1.05, 1.12, 1.18], palm: [0, -0.055, 0.015], back: [0, 0.13, -0.17] }, // tint: under the warm toon light and grade the painted chocolate reads maroon; a cool lift brings back the sheet's chocolate
  // the Toybox Shadow (tools/blender/codex/assets/shadow-toy, built by an Opus agent with the toybox-character skill): a
  // quadruped. darkGrade: the grade pass lifts dark pixels toward violet (post.js uLift), so his slate-black coat read
  // purple; [desat, r, g, b] pulls the hue out of the dark texels and biases them (0..255 sRGB units) against the lift
  shadow: { file: 'shadow_toy', name: 'Shadow', outline: '#1c181e', earGain: 0, sitDrop: 0.08, darkGrade: [1, -4, 14, -9] },
  // the Toybox Rosie (tools/blender/codex/assets/rosie-toy, built by an Opus agent with the toybox-character skill): a
  // villager, not a playable hero (game.js hands her Villager this rig); hat: the nightcap anchor on her curls [x, y, z, scale]; wave: 'out' waves and cheers outward, squint: her happy lids [upper, lower] (animator.js);
  // darkGrade: the warm grade turned her chocolate hair maroon (a tint would grey her skin), so only the dark texels shift
  rosie: { file: 'rosie_toy', name: 'Rosie', outline: '#4e2a18', earGain: 0, darkGrade: [0.4, -10, 6, 4], wave: 'out', squint: [0.40, -0.26], palm: [0, -0.05, 0.012], back: [0, 0.1, -0.15], hat: [0, 0.44, -0.03, 1.15] },
  // the Toybox Moka (tools/blender/codex/assets/moka-toy, the toybox-character skill, Opus builder): the default Moka; the
  // Storybook one below stays the fallback. Its attach points and grade are set when the rig lands.
  mokaToy: { file: 'moka_toy', name: 'Moka', outline: '#2a1510', earGain: 0.45, darkGrade: [0.2, 4, 16, 12], wave: 'front', palm: [0, -0.054, 0.009], back: [0, 0.02, -0.13] },
  moka: { file: 'moka_disney', name: 'Moka', outline: '#2a1510', earGain: 1.7, earFlip: true, palm: [0, -0.045, 0.012], back: [0, 0.02, -0.13] },
};

// Disney style (baked heroes + sculpted kit) or the classic toon kit: ?chewy=disney|classic overrides the saved choice
export function heroStyle() {
  const p = new URLSearchParams(location.search).get('chewy');
  if (p) return p;
  try { return localStorage.getItem('chewy.style') || 'disney'; } catch { return 'disney'; }
}
export function setHeroStyle(s) { try { localStorage.setItem('chewy.style', s); } catch { /* private mode */ } }
// which baked Chewy: 'toy' (the Toybox model, default) or 'disney' (Storybook); ?chewymodel= overrides the saved choice
export function chewyModel() {
  const p = new URLSearchParams(location.search).get('chewymodel');
  if (p) return p;
  try { return localStorage.getItem('chewy.model') || 'toy'; } catch { return 'toy'; }
}
export function setChewyModel(m) { try { localStorage.setItem('chewy.model', m); } catch { /* private mode */ } }
// the Toybox heroes load first, falling back to the Storybook model (the "Toybox heroes" setting / ?chewymodel= picks)
const TOY = { chewy: 'chewyToy', moka: 'mokaToy' };
const cfgFor = id => (TOY[id] && chewyModel() === 'toy' ? [HERO_MODELS[TOY[id]], HERO_MODELS[id]] : [HERO_MODELS[id]]);

const ASSETS = new Map();  // id -> { meta, buf, tex, ntex, geo?, olGeo? }
const LOADING = new Map(); // id -> Promise<boolean>
export const heroModelReady = id => ASSETS.has(id);

/** Load one baked hero (resolves true when ready, false when its files are missing or the classic style is on). */
export function loadHeroModel(id, force = false) {
  if (ASSETS.has(id)) return Promise.resolve(true);
  if (LOADING.has(id) && !force) return LOADING.get(id);
  const cfgs = cfgFor(id);
  if (!cfgs[0] || (!force && heroStyle() !== 'disney')) { const p = Promise.resolve(false); LOADING.set(id, p); return p; }
  const p = (async () => {
    for (const cfg of cfgs) {
      try {
        const dir = `${BASE}rigs/`;
        const res = await fetch(`${dir}${cfg.file}.json`);
        if (!res.ok) throw new Error(`${cfg.file}.json ${res.status}`);
        const meta = await res.json();
        const tl = new THREE.TextureLoader();
        const [buf, tex, ntex] = await Promise.all([
          fetch(dir + meta.bin).then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); }),
          tl.loadAsync(dir + meta.tex), meta.normalTex ? tl.loadAsync(dir + meta.normalTex) : null,
        ]);
        tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; if (ntex) ntex.colorSpace = THREE.NoColorSpace;
        ASSETS.set(id, { meta, buf, tex, ntex, cfg });
        return true;
      } catch (e) { // ([chewy] warnings are what tools/qa/prod-smoke.mjs watches for: only the last fallback warns)
        const last = cfg === cfgs[cfgs.length - 1];
        (last ? console.warn : console.info)(`[${id}] ${cfg.name}'s baked model (${cfg.file}) unavailable, ${last ? 'using the procedural rig' : 'trying the next one'}:`, e?.message || e?.target?.src || String(e));
      }
    }
    return false;
  })();
  LOADING.set(id, p);
  return p;
}

/** Load several baked heroes; resolves { id: ready } (never rejects). */
export async function loadHeroModels(ids = ['chewy', 'moka'], force = false) {
  const ok = await Promise.all(ids.map(id => loadHeroModel(id, force)));
  return Object.fromEntries(ids.map((id, i) => [id, ok[i]]));
}

const TYPES = { f4: Float32Array, i2: Int16Array, u1: Uint8Array, u2: Uint16Array, u4: Uint32Array };
function geometry(A) {
  if (A.geo) return A;
  const g = new THREE.BufferGeometry();
  for (const L of A.meta.layout) {
    const a = new TYPES[L.type](A.buf, L.offset, L.count);
    if (L.name === 'index') g.setIndex(new THREE.BufferAttribute(a, 1));
    else g.setAttribute(L.name, new THREE.BufferAttribute(a, L.itemSize, L.normalized));
  }
  g.computeBoundingSphere();
  const ol = new THREE.BufferGeometry();  // ink hull: every part but the eyeballs, tongue (and lashes): they come last
  for (const k in g.attributes) ol.setAttribute(k, g.attributes[k]);
  ol.setIndex(g.index); ol.setDrawRange(0, A.meta.outlineIndexCount); ol.boundingSphere = g.boundingSphere;
  A.geo = g; A.olGeo = ol;
  return A;
}

const HALF_TURN = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);

/** A fresh rig of a loaded hero (shares the geometry; own bones, skeleton and materials). */
// cfg.darkGrade, on the painted texel before lighting (sRGB-ish): texels darker than luminance 0.30 blend toward their own
// grey by x and take the yzw offset, fading out by 0.42 (the dark-coat counterpart of a tint, which would move the whites
// too). Portraits render without the grade pass and zero the uniform (gfx/portraits.js).
const DARK_GRADE = /* glsl */`
  {
    vec3 sc = pow(max(diffuseColor.rgb, 0.0), vec3(1.0 / 2.2));
    float l = dot(sc, vec3(0.2126, 0.7152, 0.0722));
    float w = clamp((0.42 - l) / 0.12, 0.0, 1.0);
    sc += w * (uDarkGrade.x * (vec3(l) - sc) + uDarkGrade.yzw);
    diffuseColor.rgb = pow(max(sc, 0.0), vec3(2.2));
  }`;
export function buildHeroModel(id, spec = null) {
  const A = ASSETS.get(id); if (!A) throw new Error(`hero model ${id} not loaded`);
  const cfg = A.cfg || HERO_MODELS[id];
  const { meta, tex, ntex } = A;
  const { geo, olGeo } = geometry(A);
  const root = new THREE.Group(); root.name = cfg.name;
  const B = {}, abs = {};
  for (const b of meta.bones) { B[b.name] = b.name === 'root' ? root : new THREE.Group(); B[b.name].name = b.name; abs[b.name] = new THREE.Vector3(...b.pos); }
  const tmp = new THREE.Vector3();
  for (const b of meta.bones) {
    if (!b.parent) continue;
    const parent = B[b.parent];
    if (cfg.earFlip && /^ear_[LR]$/.test(b.name)) { // a hanging ear: its bone lives in a half-turned mount
      const mount = new THREE.Group(); mount.name = `${b.name}_mount`;
      mount.position.copy(abs[b.name]).sub(abs[b.parent]); mount.quaternion.copy(HALF_TURN);
      parent.add(mount); mount.add(B[b.name]);
      continue;
    }
    parent.add(B[b.name]);
    parent.updateWorldMatrix(true, false);
    B[b.name].position.copy(parent.worldToLocal(tmp.copy(abs[b.name])));
  }
  // attachment points the game expects: the paws that hold the weapon, the spot on the back for a sheathed one
  const S = meta.scale, quad = meta.contract === 'quad';
  const palm = n => { const g = new THREE.Group(); g.name = n; g.position.set(cfg.palm[0] * S, cfg.palm[1] * S, cfg.palm[2] * S); B[n === 'handR' ? 'hand_R' : 'hand_L'].add(g); return g; };
  const back = quad ? null : new THREE.Group();
  if (back) { back.name = 'back'; back.position.set(cfg.back[0] * S, cfg.back[1] * S, cfg.back[2] * S); B.chest.add(back); }
  if (!quad) { B.ear_L.userData.tip = B.earTip_L; B.ear_R.userData.tip = B.earTip_R; } // (quadrupeds' upright ears swing whole)
  let hatAnchor = null; // where a villager's nightcap goes (npc.js setNightcap); without one it sits 0.4 above the head bone
  if (cfg.hat) { hatAnchor = new THREE.Group(); hatAnchor.name = 'hatAnchor'; hatAnchor.position.set(cfg.hat[0] * S, cfg.hat[1] * S, cfg.hat[2] * S); hatAnchor.userData.hatScale = cfg.hat[3] ?? 1; B.head.add(hatAnchor); }
  root.updateMatrixWorld(true);

  const dg = cfg.darkGrade;
  const mat = makeToon({
    map: tex, objectBrush: true, brush: 0, rim: 0.5, term: [-0.04, 0.34], shadowSat: 0.35,
    ...(dg && { fragPars: 'uniform vec4 uDarkGrade;', fragColor: DARK_GRADE, uniforms: { uDarkGrade: { value: new THREE.Vector4(dg[0], dg[1] / 255, dg[2] / 255, dg[3] / 255) } } }),
  });
  if (ntex) { mat.normalMap = ntex; mat.normalScale.set(0.45, 0.45); }
  if (cfg.tint) mat.color.setRGB(...cfg.tint);
  const outMat = makeOutline(cfg.outline, 0.0045);
  const propMat = makeToon({ vertexColors: true, objectBrush: true, brush: 0.025, rim: 0.6, term: [-0.02, 0.28], shadowSat: 0.4 }); // sword, ball, staff
  const bones = meta.bones.map(b => B[b.name]);
  const skeleton = new THREE.Skeleton(bones);
  const mk = (g, m, name) => {
    const sm = new THREE.SkinnedMesh(g, m); sm.name = name;
    root.add(sm); root.updateMatrixWorld(true); sm.bind(skeleton, sm.matrixWorld);
    sm.boundingSphere = g.boundingSphere.clone(); sm.boundingSphere.radius *= 1.4;
    return sm;
  };
  const skin = mk(geo, mat, 'body_skin'); skin.castShadow = true; skin.receiveShadow = true;
  const outline = mk(olGeo, outMat, 'outline_skin'); outline.castShadow = false;
  outline.visible = false; // film look: no ink hull (it also pokes through the eye, nose and mouth hollows)

  const parts = quad ? { // the kit Boston's parts (Animator.poseQuad): the legs hang off the root, the head and tail off the body
    body: B.body, head: B.head, legs: [B.legFL, B.legFR, B.legBL, B.legBR], earL: B.ear_L, earR: B.ear_R, tail: B.tail1,
    jaw: B.jaw, lids: [B.lidU_L, B.lidU_R], lidsLow: [B.lidD_L, B.lidD_R], lips: [B.lip_L, B.lip_R], eyes: [], brows: [],
    eyeballs: [B.eye_L, B.eye_R],
  } : {
    body: B.spine, head: B.head, armL: B.upperarm_L, armR: B.upperarm_R, handL: palm('handL'), handR: palm('handR'),
    legL: B.thigh_L, legR: B.thigh_R, earL: B.ear_L, earR: B.ear_R, tail: B.tail1, back, hatAnchor, wave: cfg.wave,
    jaw: B.jaw, lids: [B.lidU_L, B.lidU_R], lidsLow: [B.lidD_L, B.lidD_R], lips: [B.lip_L, B.lip_R], eyes: [], brows: [],
    eyeballs: [B.eye_L, B.eye_R],
  };
  return {
    spec: spec || { name: cfg.name }, hero: id, root, parts, mat, outMat, propMat, meshes: [skin], skin, outline, skeleton, height: meta.height,
    disney: true, bakedDisney: true, sharedGeo: true, earGain: cfg.earGain, model: cfg.file, quadruped: quad, sitDrop: cfg.sitDrop, squint: cfg.squint,
    dispose() { skeleton.dispose(); mat.dispose(); outMat.dispose(); propMat.dispose(); },
  };
}
