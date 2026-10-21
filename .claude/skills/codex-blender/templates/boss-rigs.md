# Boss part rigs (what the game drives; for the Blender boss briefs, 2026-10-21)

GLB rules for all of them (src/regions/monsters/enemyModels.js partsOf): a **flat** hierarchy (every part a top-level
node, its translation = its pivot in model space; the game computes parent offsets), identity rotation and scale,
vertex colours only (UVs stripped), a `body` part required. In these builders `L` is −x and `R` is +x.

## tenguMaster (tengu.js buildTengu) — ~1.15 units tall, def.scale 2.3
- body (origin): geta, legs, hakama, robe, obi, pompom sashes, ruff, the left arm in a mudra, tail feathers
- head (0, 0.72, 0.02): skull, eyes, brows, beak, tokin cap; jaw (model (0, 0.805, 0.192)): opens down 0…1.05 rad about X;
  lids (head pivot): closed eyes, visibility toggled
- fanArm (0.19, 0.645, 0): sleeve, claw hand, the whole fan; rotation x −1.5…1.25, y −0.2…0.3, z −1.35…0.55
- fanTip: an empty at model (0.27, 0.945, 0.16) (the gust origin)
- wingL (−0.1, 0.63, −0.14), wingR (0.1, 0.63, −0.14): each built pointing along ±x from its pivot; rotation (0, wingY 0…1.3,
  wingZ −0.45…0.9 + flap ±0.5), mirrored
- head rotation (−0.3…0.3, 0, tilt 0…0.25); the whole hover group leans, crouches, spins (tornado cast)
- material: TENGU_OUT (fresnel; dark colours get a blue-violet sheen) + LUM_CAP; outline #2a1622 0.014
- GLB parts: body, head, jaw, lids, fanArm, fanTip (empty), wingL, wingR

## karasuKozo (tengu.js buildKozo) — ~0.83 tall, scale 1
- body: round robe, head, eyes, brows, beak, mini tokin, pompoms, yellow feet; wingL (−0.16, 0.36, −0.08), wingR (0.16, 0.36, −0.08)
- wings rotation (0, ±0.35, ±(0.2 + flap 0…1.2)); 2 variants (robe #ece2ca / #dfe8f4); not cached: needs an enemySpec hookup
- GLB parts: body, wingL, wingR

## danzaburo (tanuki.js buildDanzaburo) — ~1.3 tall with the hat leaf, SCALE 2.4 (giant: ×1.38)
- tanuki form: body (legs, torso, straw sash); belly (0, 0.36, 0.165) + bellyTip empty (+0.24 z); tail (0, 0.2, −0.26);
  armL (−0.31, 0.5, 0.03, with the tokkuri), armR (0.31, 0.5, 0.03); head (0, 0.74, 0.03); jaw (head + (0, 0.03, 0.245),
  scaled 0.001…1.7); blush (head + (0, 0.085, 0), scaled 0…1); hat (head + (0, 0.27, −0.06), rest rotation (−0.42, 0, 0.1));
  leaf (hat + (0, 0.16, 0), rest rotation (0.35, 0, −0.25); model ≈ (−0.016, 1.155, −0.095))
- rock form: rock (pivot the boulder centre (0, 0.47, 0), radius 0.47: the roll spins about it), rockLeaf
- kettle form: kettle (origin), lid (0, 0.48, 0: rattles), khead (0, 0.52, 0.2) + kLeaf, spout empty (0, 0.41, 0.56)
- moves: belly scale 1…1.3 + wobble; armL x −2.6…0.5, z −1.6…0.6; armR x −2.5…0.5, z −0.5…1.6; head x −0.55…0.3, y ±0.06,
  z ±0.2; tail (±0.06, ±0.6, 0); lid y = 0.48 + rattle (hard-coded) and z ±0.18; khead (±0.05, ±0.15, 0)
- fight reads parts.bellyTip, parts.leaf, parts.spout, parts.head
- material: EDGE_OUT + LUM_CAP; outline #2a1622 0.014
- GLB parts: body, belly, bellyTip, tail, armL, armR, head, jaw, blush, hat, leaf, rock, rockLeaf, kettle, lid, khead, kLeaf, spout

## umibozu (umibozu.js buildUmibozu; fx_umibozu.js) — y −0.62…1.19, y 0 = the waterline, S 4.4
- body (merged): the lathe body, shoulders, brows, blush, dimples, forehead pearl, 19 juzu beads + mother bead + tassel,
  kelp, starfish, barnacles
- eyeL (−0.2, 0.79, 0.457) rotY −0.34, eyeR (0.2, 0.79, 0.457) rotY +0.34 (MeshBasic, colours > 1: keep the boost in code),
  pupils at eye + (0, −0.02, 0.052) (x set ±0.03, y −0.035 absolutely); eyes scale y 1 → 0.08 to blink
- mouth (0, 0.6, 0.491): smile (visibility), open (scale 0.001…1), cheeks (scale 0.001…1.1; lobes ±0.25)
- sheet (a transparent shell from the body geometry ×1.012), foam: procedural
- hands: world-space, metres: wrist at the origin, fingers along +z, palm facing −y (a separate GLB); arms (32 instanced
  spheres on a Bézier): procedural
- GLB parts: body, eyeL, eyeR, pupilL, pupilR, mouthSmile, mouthOpen, cheeks; + umibozu-hand.glb

## yukiOnna / yukiMirror (yukionna.js buildYuki) — ~1.2 tall, S 2.4
- body (kimono lathe + obi + bow); head (0, 0.87, 0) with face (thin outline 0.0035, no shadow), lids, mouthO, puff (at the
  head pivot); hairB (0, 1.0, −0.05); slR (0.172, 0.725, 0), slL (−0.172, 0.725, 0); shawl (0, 0.7, 0: y set to 0.7 ± 0.012)
- moves: head (−0.3…0.16, y, 0…0.14); slR (−2.7…−0.22 ± 0.3, y, 0.06…2.1), slL (−1.6…−0.22, lZ −2.1…−0.06); hairB x
  −0.3…0.15 + sway; shawl small; lids visibility; mouthO / puff scale 0.001…1; the hover group leans, spins (11 rad/s)
- material: a 512² CanvasTexture kimono (UVs on the kimono + sleeves) → for a GLB: bake the pattern into vertex colours
  (big flat shapes) and drop the map; YUKI_OUT fresnel rim + crystal glow (g > 0.7, b > 0.85, r < 0.82, b − r > 0.18),
  uMirror glass band for the copies
- GLB parts: body, head, face, lids, mouthO, puff, hairB, slR, slL, shawl

## kasaLord, oniChef (dungeon/monsters.js) — single merged meshes, already on the GLB path (ENEMY_MODELS kasaLord / oniChef)
