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
import { capTexture } from '../core/deck.js';

const BASE = import.meta.env?.BASE_URL ?? '/';
const OFF_DARK = typeof location !== 'undefined' && /[?&]off=[^&]*\bdark\b/.test(location.search); // (?off=dark: no darkGrade / darkNeutral, for bisecting render bugs)

// Runtime tuning per hero. palm/back: attachment points in model units (× meta.scale) under hand_* / chest.
// earFlip: the ears hang (Moka's pendant ears): each ear bone sits under a mount turned half round, so the
// Animator's spring drive (tuned on Chewy's perked flaps) swings a hanging ear back when running and lifts it out
// on a flick, instead of forward.
// sayaMount (optional; a biped hero with a scabbard, i.e. the samurai Chewy): where the Bone Katana's hilt sits when the
// blade is sheathed. Absent (today's chewy_b): the sheathed katana rides on his back (`back`), as before.
//   sayaMount: { mouth: [x, y, z], dir: [x, y, z], up: [x, y, z], bone: 'hips', roll: 0, out: 0.012 }
//   · mouth: the saya mouth (where the blade goes in), in model units (× meta.scale, the export's --scale, like palm /
//     back) on the game's axes: Y up, +Z the way he faces, +X his left. Blender's saya_mount.json gives both
//     (`mouth_game`; game [x, y, z] = Blender [x, z, −y]). The export's `--height 1.2` only writes meta.height, it
//     doesn't rescale the mesh, so the mount needs no height scaling.
//   · dir: the unit blade-entry direction, from the mouth toward the saya's tip (`blade_entry_dir_game`); the hilt
//     points along −dir.
//   · up (optional, `edge_up_game`): the way the katana's edge faces in the saya (edge-up in the obi); else roll: a
//     turn of the hilt about the saya axis, radians. bone: the bone the saya is skinned to (default 'hips', rigid);
//     out: how far the tsuba stands proud of the mouth (m; 0 = flush).
//   The rig then carries parts.saya: a group at the mouth whose +Y runs down the saya (player.js hangs the hilt on it).
// fumaMount (optional; Poe): where the fūma prop (public/models/poe-fuma.glb, its own file: the exporter merges every
// skinned mesh, so it can't live inside the rig) rides on her back — the Blender agent's fuma_mount.json:
//   fumaMount: { pos: [x, y, z], quat: [x, y, z, w], bone: 'chest', scale: 1 }
//   · pos: the hub centre in model units (× meta.scale, like palm / back) on the game's axes; quat: the prop's
//     orientation in model space, game axes (its spin axis is the prop's +Y); bone: the bone it's carried by.
//   The rig then carries parts.fumaMount: a group at the hub turned to that orientation (actors/poeGear.js dressPoe).
export const HERO_MODELS = {
  chewy: { file: 'chewy_disney', name: 'Chewy', outline: '#2a1812', earGain: 2.2, palm: [0, -0.045, 0.012], back: [0, 0.02, -0.125] },
  // the "Toybox" Chewy (tools/blender/work/codex/chewy-b, the codex-blender skill): the samurai's fallback, and selectable
  // (Settings > Hero models > Toybox, ?chewymodel=toy); the Storybook (Disney) one above is the last fallback
  chewyToy: { file: 'chewy_b', name: 'Chewy', outline: '#2a1812', earGain: 1.6, tint: [1.05, 1.12, 1.18], palm: [0, -0.055, 0.015], back: [0, 0.13, -0.17] }, // tint: under the warm toon light and grade the painted chocolate reads maroon; a cool lift brings back the sheet's chocolate
  // the samurai Chewy (tools/blender/work/codex/chewy-samurai, sheet E "Black and Gold"; docs/HEROES.md §8): the default
  // Chewy (chewyModel() 'samurai'), falling back to chewy_b, then the Storybook one. The skeleton and the face rig are
  // chewy_b's, and so is the fur's paint (and its tint, which keeps his eye whites and muzzle white). sayaMount from
  // that folder's export/saya_mount.json (model metres, game axes; the scabbard is 0.553 m long, the mouth's inner slot
  // 12 mm deep, so the tsuba sits flush). darkGrade's 5th value gates it to the near-neutral cloth (chroma under it) and darkNeutral
  // holds that cloth neutral black after lighting and the grade (DARK_NEUTRAL below), so the haori and hakama don't go
  // navy or violet while the chocolate fur, just as dark, is left alone. darkFur gives the rest of him the same lift
  // counter (his fur shadows stay brown, not maroon) and furGrade takes the fur to the sheet's chocolate: measured in
  // game, the lit fur reads #895134 (h20 s0.45, the sheet's light fur #9A5A3A) and the cloth #2f2c34 (sheet #1E1C22).
  // anim: per-model Animator tuning (barkTuck: the bark's inward arm tuck ×, sitThigh: the sit's thigh angle).
  // doubleSided (optional): draw a model with some inward-facing faces double-sided. chewy_samurai needed it until its
  // round-5 re-export fixed the haori winding (every outer cloth face now faces out; the build checks it).
  chewySamurai: { file: 'chewy_samurai', name: 'Chewy', outline: '#2a1812', earGain: 1.6, tint: [1.05, 1.12, 1.18], palm: [0, -0.055, 0.015], back: [0, 0.13, -0.17],
    darkGrade: [1, 0, 0, 0, 0.12], furGrade: [0.15, -2, -4, 6], darkNeutral: 0.9, darkFur: 1, anim: { barkTuck: 0.5, sitThigh: -1.0 },
    sayaMount: { mouth: [0.222, 0.440, 0.214], dir: [0.2676, -0.4738, -0.8390], up: [0.144, 0.881, -0.451], bone: 'hips', out: 0 } },
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
  // the Toybox Poe (docs/POE.md §8; tools/blender/work/codex/poe-toy, the toybox-character skill, Opus builder): the
  // 37-bone biped rig public/rigs/poe_toy.*, with no fūma in it: the prop is public/models/poe-fuma.glb (actors/poeGear.js
  // FUMA_MODEL), on her back at `fumaMount` (that folder's export/fuma_mount.json, model space, game axes; scale 1 = the
  // prop's own size, 0.8 m across), in her paw at `palm` (the right paw's grip, the paw's centre off the wrist bone; the
  // left mirrors it) and in flight. `back`: the chest-frame spot on her back (the coat's back is at z −0.30 there).
  // squint: the rebuilt lids read a clean happy "^ ^" at upper 0.58 / lower −0.24 (the default 0.488 left a ragged
  // sliver). earGain 0.5: the agent's safe swing (the left ear is damped in the weights, LEFT_EAR_K 0.12, to keep it
  // out of the festival mask; the Animator takes [left, right] gains too, equal here). The coat is the sheet's true
  // #2E2A30, a near-neutral black (chroma 0.02): the samurai's gated grade (see chewySamurai above) holds it a warm
  // charcoal under the village, Burrow and region light instead of violet: darkGrade's gate (5th value) keeps it to
  // the coat and the dark lids / nose / lips, darkNeutral evens it after lighting, darkFur gives her moss and mustard
  // darks the same lift counter (no furGrade: she has no coloured fur). Measured in game: see docs/POE.md §8.
  poeToy: { file: 'poe_toy', name: 'Poe', outline: '#1c181e', earGain: 0.5, squint: [0.58, -0.24], wave: 'out', palm: [-0.044, -0.054, 0.006], back: [0, 0.048, -0.3],
    darkGrade: [1, 7, 4, -2, 0.1], darkNeutral: 0.85, darkFur: 1,
    fumaMount: { pos: [0, 0.628, -0.35], quat: [0, 0.741451, 0.671007, 0], bone: 'chest', scale: 1 } },
  // the Toybox Shih Tzu dark knight (docs/SHIHTZU.md §8; tools/blender/codex/assets/shihtzu-toy, the toybox-character skill,
  // Opus builder; sheet B "Gloomhowl Warlock-Knight"): the 37-bone biped rig public/rigs/shihtzu_toy.*, the tome on his left
  // hip baked in, the toy flail a separate prop (public/models/shihtzu-flail.glb: actors/shihtzuGear.js FLAIL_MODEL, its
  // rope and ball on a verlet chain). lidTilt: his eyes face ~31° outward, so the lids hinge on tilted axes (animator.js
  // lidTurn; the README's hinge (0.852, 0, ∓0.523)); squint [0.74, −0.36]: a content, half-lidded smile ([0.70, −0.44]
  // glares from 45°); earGain 0.5 (the agent's). palm: the right mitten's grip centre off hand_R (prop_mount.json
  // one_handed.position_in_hand_frame); the left mirrors it. flailMount: where the flail rides on his back when it's put
  // away, like a baldric: the handle up his right shoulder blade, its bone pommel poking up between the ears, the rope
  // slung down across the cape to the ball, hooked at his left hip behind the tome (shihtzuGear.js BACK_HOOK); model
  // space, game axes, like fumaMount. The coat: the sheet's black
  // #2C2A30 graded like Poe's (the samurai's gated tools: darkGrade's 5th value gates it to the near-neutral black fur, nose
  // and lids; a slightly warmer lift, so it reads a neutral warm charcoal, not violet), and whiteCap holds his cream fur
  // under its own colour (the Burrow's key light blew it out to a glowing peach). Measured in game: docs/SHIHTZU.md §8.
  shihtzuToy: { file: 'shihtzu_toy', name: 'Floofy', outline: '#1c181e', earGain: 0.5, squint: [0.74, -0.36], lidTilt: 0.5507, wave: 'out', palm: [-0.040, -0.054, 0.004], back: [0, 0.06, -0.27],
    darkGrade: [1, 12, 7, -3, 0.1], darkNeutral: 0.9, darkFur: 1, whiteCap: 1,
    flailMount: { pos: [-0.128, 0.683, -0.335], quat: [0, 0, 0.9842, 0.1771], bone: 'chest', scale: 1 } },
  // the Toybox Golden Retriever dragoon (docs/GOLDEN.md §8; tools/blender/codex/assets/golden-toy, the toybox-character
  // skill, Opus builder; sheet C "Emberleaf Dragon Guard"): the 37-bone biped rig public/rigs/golden_toy.*, the javelin
  // quiver on his spine baked in, the toy lance and the javelin separate props (public/models/golden-lance.glb,
  // golden-javelin.glb: actors/goldenGear.js). earGain 0.5 (the agent's), the default squint (his lids are sized for
  // +0.488 / −0.24). palm: the right mitten's grip centre off hand_R (prop_mount.rig.json palms.R
  // palm_offset_in_hand_frame_game; the left mirrors it). lanceMount: where the lance rides on his back when it's put
  // away (model space, game axes, like fumaMount): slung ~45° across his back over the ear drapes and behind the quiver's
  // caps, the pommel out past his left hip (his plumed tail is at the right), the head up past his right shoulder. The
  // coat grade and the cream cap: see GOLDEN.md §8 (measured in game against the sheet's #C47A3A).
  goldenToy: { file: 'golden_toy', name: 'Foosy', outline: '#3a2212', earGain: 0.5, wave: 'out', palm: [-0.0405, -0.0288, 0.0029], back: [0, 0.1, -0.3],
    warmGrade: [0.15, 6, 8, 18, 18, 36], warmCap: 1.05,
    lanceMount: { pos: [0.17, 0.63, -0.43], quat: [-0.0277, 0.0114, 0.38, 0.9245], bone: 'chest', scale: 1 } },
  // Shadow in his dragon whelp outfit (tools/blender/codex/assets/shadow-whelp: a re-dress of shadow_toy, the same quad
  // skeleton and face; ROADMAP H-5): worn only while the dragoon is the active hero (actors/whelp.js swaps it in with a
  // poof). earDamp: his own ears come up through slits in the hood, so their spring swing is held to this fraction (the
  // flight damps it further); the wings are props (public/models/shadow-whelp-wing.glb) flapped by whelp.js.
  shadowWhelp: { file: 'shadow_whelp', name: 'Shadow', outline: '#1c181e', earGain: 0, earDamp: 0.6, sitDrop: 0.08, darkGrade: [1, -4, 14, -9] },
};

// Disney style (baked heroes + sculpted kit) or the classic toon kit: ?chewy=disney|classic overrides the saved choice
export function heroStyle() {
  const p = new URLSearchParams(location.search).get('chewy');
  if (p) return p;
  try { return localStorage.getItem('chewy.style') || 'disney'; } catch { return 'disney'; }
}
export function setHeroStyle(s) { try { localStorage.setItem('chewy.style', s); } catch { /* private mode */ } }
// which baked heroes (Settings > Hero models; ?chewymodel= overrides the saved choice): 'samurai' (the default: the
// samurai Chewy, the other heroes Toybox), 'toy' (the Toybox Chewy, chewy_b, and the Toybox heroes) or 'disney' (the
// Storybook heroes). A saved 'toy' from before the samurai (it was the default then) moves to 'samurai' once
// (chewy.modelV 2); after that the saved choice is kept.
export const CHEWY_MODELS = ['samurai', 'toy', 'disney'];
export function chewyModel() {
  const p = new URLSearchParams(location.search).get('chewymodel');
  if (p) return p;
  try {
    let m = localStorage.getItem('chewy.model');
    if (localStorage.getItem('chewy.modelV') !== '2') { if (m === 'toy') localStorage.setItem('chewy.model', m = 'samurai'); localStorage.setItem('chewy.modelV', '2'); }
    return m || 'samurai';
  } catch { return 'samurai'; }
}
export function setChewyModel(m) { try { localStorage.setItem('chewy.model', m); localStorage.setItem('chewy.modelV', '2'); } catch { /* private mode */ } }
/** the Toybox heroes (vs the Storybook ones): with the samurai Chewy or the Toybox one */
export const toyHeroes = (m = chewyModel()) => m === 'samurai' || m === 'toy';
// the Toybox heroes load first, falling back to the Storybook model; the samurai Chewy falls back to the Toybox one
const TOY = { chewy: 'chewyToy', moka: 'mokaToy', poe: 'poeToy', shihtzu: 'shihtzuToy', golden: 'goldenToy' };
const cfgFor = id => (id === 'chewy' && chewyModel() === 'samurai' ? ['chewySamurai', 'chewyToy', 'chewy'] : TOY[id] && toyHeroes() ? [TOY[id], id] : [id])
  .map(k => HERO_MODELS[k]).filter(c => c && !c.pending); // (a hero with no Storybook model, or one still pending, skips it)

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
        capTexture(tex); if (ntex) capTexture(ntex); // (the Mobile preset: skins at 1024, core/deck.js)
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
// the saya mouth as a group under its bone: at the mouth, +Y down the scabbard (the blade's way in), turned by `roll`
// (bones sit at their rest positions with no rotation, so model-space offsets are local offsets)
/** a prop mount from model-space numbers (pos, quat): a group parented to `bone` (its rest frame has no rotation) */
function propMount(name, m, B, abs, S) {
  const bone = B[m.bone || 'chest'] || B.chest || B.spine; if (!bone || !m.pos) return null;
  const g = new THREE.Group(); g.name = name;
  const bn = abs[bone.name] || new THREE.Vector3();
  g.position.set(m.pos[0] * S - bn.x, m.pos[1] * S - bn.y, m.pos[2] * S - bn.z);
  if (m.quat) g.quaternion.set(m.quat[0], m.quat[1], m.quat[2], m.quat[3]).normalize();
  g.userData.scale = m.scale ?? 1;
  bone.add(g);
  return g;
}
function sayaGroup(m, B, abs, S) {
  const bone = B[m.bone || 'hips'] || B.hips || B.spine; if (!bone || !m.mouth || !m.dir) return null;
  const g = new THREE.Group(); g.name = 'saya';
  const bn = abs[bone.name] || new THREE.Vector3();
  g.position.set(m.mouth[0] * S - bn.x, m.mouth[1] * S - bn.y, m.mouth[2] * S - bn.z);
  const d = new THREE.Vector3(...m.dir).normalize();
  if (m.up) { // the katana's frame (charKit.js katanaGeo): +Y the blade, −X its edge: the edge faces `up`
    const e = new THREE.Vector3(...m.up); e.addScaledVector(d, -e.dot(d)).normalize();
    const x = e.clone().negate(), z = new THREE.Vector3().crossVectors(x, d);
    g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, d, z));
  } else g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
  if (m.roll) g.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), m.roll));
  g.userData.out = m.out ?? 0.012;
  bone.add(g);
  return g;
}

/** A fresh rig of a loaded hero (shares the geometry; own bones, skeleton and materials). */
// cfg.darkGrade, on the painted texel before lighting (sRGB-ish): texels darker than luminance 0.30 blend toward their own
// grey by x and take the yzw offset, fading out by 0.42 (the dark-coat counterpart of a tint, which would move the whites
// too). Portraits render without the grade pass and zero the uniform (gfx/portraits.js). An optional 5th value gates it
// to the near-neutral darks: texels whose chroma (max − min, sRGB) is over it are left alone (the samurai's black cloth
// against his chocolate fur, which is just as dark).
// cfg.darkNeutral (0..1, with a gated darkGrade): black cloth can't be held black by its albedo alone: the toon light's
// slate shadow tint and the grade pass's additive lift of the darks (post.js uLift) leave a near-black texel only their
// blue. So after lighting, the masked texels mix toward their own grey (uDarkNeutral) plus the counter of the current
// lift (U.uGradeLift, × uDarkLift): the grade then lifts them to an even dark grey. Portraits have no grade pass and
// zero uDarkLift (gfx/portraits.js).
// cfg.furGrade [desat, r, g, b] (with a gate): the same for the coloured mid-darks the gate leaves out (chroma over the
// gate and under 0.45, luminance under 0.5: the samurai's chocolate fur and nose, not his red cord, gold or whites),
// so the fur can be corrected without a tint, which would colour his eye whites and cream muzzle too.
const DARK_GRADE = (gate, fur) => /* glsl */`
  {
    vec3 sc = pow(max(diffuseColor.rgb, 0.0), vec3(1.0 / 2.2));
    float l = dot(sc, vec3(0.2126, 0.7152, 0.0722));
    float w = clamp((0.42 - l) / 0.12, 0.0, 1.0);${gate == null ? '' : `
    float ch = max(sc.r, max(sc.g, sc.b)) - min(sc.r, min(sc.g, sc.b)), gn = 1.0 - smoothstep(${(gate * 0.6).toFixed(4)}, ${gate.toFixed(4)}, ch);${fur ? `
    sc += (1.0 - smoothstep(0.5, 0.6, l)) * (1.0 - gn) * (1.0 - smoothstep(0.4, 0.5, ch)) * (uFurGrade.x * (vec3(l) - sc) + uFurGrade.yzw);` : ''}
    w *= gn;
    cDark = w;`}
    sc += w * (uDarkGrade.x * (vec3(l) - sc) + uDarkGrade.yzw);
    diffuseColor.rgb = pow(max(sc, 0.0), vec3(2.2));
  }`;
const DARK_NEUTRAL = /* glsl */`
  {
    float dl = dot(outgoingLight, vec3(0.299, 0.587, 0.114));
    vec3 lift = uGradeLift * uDarkLift, lf = vec3(max(lift.r, max(lift.g, lift.b))) - lift;
    outgoingLight = mix(outgoingLight, vec3(dl) + lf, cDark * uDarkNeutral);
    // the rest of him (his fur in shadow, which the lift turns maroon) takes uDarkFur of the counter, weighted the way the
    // grade weights its lift, so his darks lift evenly instead of toward violet
    outgoingLight += lf * (1.0 - cDark) * uDarkFur * (1.0 - smoothstep(0.0, 0.55, dl));
  }`;
// cfg.whiteCap (k): white fur under a strong warm key light (the Burrow's, with the bloom) blows out to a glowing peach:
// on the bright, near-neutral texels (a cream coat, not the blush or the eyes' colours) the lit colour keeps the fur's
// own hue and never goes past k × its albedo (as the katana's bone does: charKit.js BONE_LIFT). The Shih Tzu's white
// blaze, muzzle, beard and topknot.
export const WHITE_CAP = /* glsl */`
  {
    vec3 a = diffuseColor.rgb;
    float mx = max(max(a.r, a.g), a.b), mn = min(min(a.r, a.g), a.b);
    float wht = smoothstep(0.42, 0.66, mx) * (1.0 - smoothstep(0.22, 0.42, (mx - mn) / max(mx, 1e-3)));
    float L = dot(outgoingLight, vec3(0.333)), La = dot(a, vec3(0.333)) + 1e-3;
    outgoingLight = mix(outgoingLight, a * (L / La), wht * 0.65);
    outgoingLight = mix(outgoingLight, min(outgoingLight, a * uWhiteCap), wht);
  }`;
// cfg.warmGrade [desat, r, g, b, hue0, hue1] (r, g, b: 0..255 sRGB offsets; hues in degrees): the dragoon's red-gold coat.
// Warm, saturated texels whose hue lies in [hue0, hue1] (his fur, #C47A3A at 28°, and its light feathering, #E0A868 at
// 32°; not the brass at 40° or the blush at 10°) blend toward their own grey by desat and take the offset, before
// lighting: the warm key light, the toon's shadow tint and the grade's saturation and warm gain (post.js) pushed the
// coat to a flat, blue-less orange (#C47A3A read #CB7100 in the village). Portraits render ungraded and zero it.
// cfg.warmCap (k, with warmGrade): the same texels under a strong warm key light (the Burrow's, the Onsen's mist, with the
// bloom) blew out to a pale glowing peach: their lit colour keeps the fur's own hue and never passes k × its albedo (as
// the white cap does for cream fur: WHITE_CAP).
const WARM_PARS = /* glsl */`
uniform vec4 uWarmGrade;
uniform vec2 uWarmHue;
uniform float uWarmCap;
float warmW(vec3 sc) { // sc: sRGB-ish albedo; 1 on the coat's hue band (saturated, red-led, hue in uWarmHue)
  float mx = max(sc.r, max(sc.g, sc.b)), mn = min(sc.r, min(sc.g, sc.b)), ch = mx - mn;
  float hue = sc.r >= mx && ch > 1e-3 ? 60.0 * (sc.g - sc.b) / ch : -99.0;
  return smoothstep(0.18, 0.3, ch) * smoothstep(uWarmHue.x - 4.0, uWarmHue.x, hue) * (1.0 - smoothstep(uWarmHue.y, uWarmHue.y + 3.0, hue));
}`;
const WARM_GRADE = /* glsl */`
  {
    vec3 sc = pow(max(diffuseColor.rgb, 0.0), vec3(1.0 / 2.2));
    float w = warmW(sc), l = dot(sc, vec3(0.2126, 0.7152, 0.0722));
    sc += w * (uWarmGrade.x * (vec3(l) - sc) + uWarmGrade.yzw);
    diffuseColor.rgb = pow(max(sc, 0.0), vec3(2.2));
  }`;
const WARM_CAP = /* glsl */`
  {
    vec3 a = diffuseColor.rgb;
    float w = warmW(pow(max(a, 0.0), vec3(1.0 / 2.2))) * step(0.001, uWarmCap);
    float L = dot(outgoingLight, vec3(0.333)), La = dot(a, vec3(0.333)) + 1e-3;
    outgoingLight = mix(outgoingLight, a * (L / La), w * 0.5);
    outgoingLight = mix(outgoingLight, min(outgoingLight, a * uWarmCap), w);
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
  const palm = n => { const g = new THREE.Group(); g.name = n; g.position.set((n === 'handL' ? -1 : 1) * cfg.palm[0] * S, cfg.palm[1] * S, cfg.palm[2] * S); B[n === 'handR' ? 'hand_R' : 'hand_L'].add(g); return g; }; // (palm is the right paw's: the left mirrors its x)
  const back = quad ? null : new THREE.Group();
  if (back) { back.name = 'back'; back.position.set(cfg.back[0] * S, cfg.back[1] * S, cfg.back[2] * S); B.chest.add(back); }
  if (!quad) { B.ear_L.userData.tip = B.earTip_L; B.ear_R.userData.tip = B.earTip_R; } // (quadrupeds' upright ears swing whole)
  let hatAnchor = null; // where a villager's nightcap goes (npc.js setNightcap); without one it sits 0.4 above the head bone
  if (cfg.hat) { hatAnchor = new THREE.Group(); hatAnchor.name = 'hatAnchor'; hatAnchor.position.set(cfg.hat[0] * S, cfg.hat[1] * S, cfg.hat[2] * S); hatAnchor.userData.hatScale = cfg.hat[3] ?? 1; B.head.add(hatAnchor); }
  const saya = !quad && cfg.sayaMount ? sayaGroup(cfg.sayaMount, B, abs, S) : null; // (the sheathed katana's hilt: see HERO_MODELS)
  const fumaMount = !quad && cfg.fumaMount ? propMount('fumaMount', cfg.fumaMount, B, abs, S) : null; // (Poe's fūma on her back: see HERO_MODELS)
  const flailMount = !quad && cfg.flailMount ? propMount('flailMount', cfg.flailMount, B, abs, S) : null; // (the Shih Tzu's flail on his back: shihtzuGear.js)
  const lanceMount = !quad && cfg.lanceMount ? propMount('lanceMount', cfg.lanceMount, B, abs, S) : null; // (the dragoon's lance on his back: goldenGear.js)
  root.updateMatrixWorld(true);

  const dg = OFF_DARK ? null : cfg.darkGrade, gated = dg?.[4] != null, fg = gated && cfg.furGrade, neutral = gated && cfg.darkNeutral, wc = cfg.whiteCap, wg = OFF_DARK ? null : cfg.warmGrade;
  const v4 = a => new THREE.Vector4(a[0], a[1] / 255, a[2] / 255, a[3] / 255);
  const pars = dg ? ['uniform vec4 uDarkGrade;', gated && 'float cDark = 0.0;', fg && 'uniform vec4 uFurGrade;', neutral && 'uniform vec3 uGradeLift;\nuniform float uDarkNeutral;\nuniform float uDarkLift;\nuniform float uDarkFur;'] : [];
  if (wc) pars.push('uniform float uWhiteCap;');
  if (wg) pars.push(WARM_PARS);
  const colors = [dg && DARK_GRADE(dg[4], !!fg), wg && WARM_GRADE].filter(Boolean); // (the dark coat's grade, the warm coat's: see DARK_GRADE, WARM_GRADE)
  const outs = [neutral && DARK_NEUTRAL, wc && WHITE_CAP, wg && WARM_CAP].filter(Boolean); // (the cloth neutraliser: see DARK_NEUTRAL; the white cap: WHITE_CAP; the warm coat's cap: WARM_CAP)
  const mat = makeToon({
    map: tex, objectBrush: true, brush: 0, rim: 0.5, term: [-0.04, 0.34], shadowSat: 0.35,
    ...(pars.length && { fragPars: pars.filter(Boolean).join('\n') }),
    ...(colors.length && { fragColor: colors.join('\n') }),
    ...(outs.length && { fragOut: outs.join('\n') }),
    uniforms: {
      ...(dg && { uDarkGrade: { value: v4(dg) } }), ...(fg && { uFurGrade: { value: v4(fg) } }),
      ...(neutral && { uDarkNeutral: { value: cfg.darkNeutral }, uDarkLift: { value: 1 }, uDarkFur: { value: cfg.darkFur ?? 0 } }),
      ...(wc && { uWhiteCap: { value: wc } }),
      ...(wg && { uWarmGrade: { value: v4(wg) }, uWarmHue: { value: new THREE.Vector2(wg[4] ?? 18, wg[5] ?? 36) }, uWarmCap: { value: cfg.warmCap ?? 0 } }),
    },
  });
  if (ntex) { mat.normalMap = ntex; mat.normalScale.set(0.45, 0.45); }
  if (cfg.tint) mat.color.setRGB(...cfg.tint);
  if (cfg.doubleSided) mat.side = THREE.DoubleSide; // (a model with some inward-facing faces: see the doubleSided note in HERO_MODELS)
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
    foreL: B.forearm_L, foreR: B.forearm_R, wristL: B.hand_L, wristR: B.hand_R, saya, // (elbows / wrists: the samurai cuts bend them; animator.js)
    legL: B.thigh_L, legR: B.thigh_R, earL: B.ear_L, earR: B.ear_R, tail: B.tail1, back, hatAnchor, wave: cfg.wave, anim: cfg.anim, fumaMount, flailMount, lanceMount,
    jaw: B.jaw, lids: [B.lidU_L, B.lidU_R], lidsLow: [B.lidD_L, B.lidD_R], lips: [B.lip_L, B.lip_R], eyes: [], brows: [],
    eyeballs: [B.eye_L, B.eye_R],
  };
  return {
    spec: spec || { name: cfg.name }, hero: id, root, parts, mat, outMat, propMat, meshes: [skin], skin, outline, skeleton, height: meta.height,
    disney: true, bakedDisney: true, sharedGeo: true, earGain: cfg.earGain, model: cfg.file, quadruped: quad, sitDrop: cfg.sitDrop, squint: cfg.squint, lidTilt: cfg.lidTilt, earDamp: cfg.earDamp,
    dispose() { skeleton.dispose(); mat.dispose(); outMat.dispose(); propMat.dispose(); },
  };
}
