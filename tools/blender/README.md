# Blender refine pipeline (refined character skins)

Characters are still designed in code (`src/actors/charKit.js`). This pipeline takes a finished procedural rig
through Blender and ships a better skin for it, keeping the procedural skeleton, so the Animator, poses, props,
x-ray, portraits and `cloneRig` all work unchanged.

```
node tools/blender/build.mjs [chewy shadow ...] [--tex=1024] [--tris=N] [--voxel=0.0035] [--fillet=16] [--aostr=0.55]
                              [--face=4] [--headscale=1.5] [--edges=2.5] [--uv=relax|smart] [--blend]
node tools/blender/compare.mjs [chewy shadow ...] [--faces] [--vs=DIR]   # procedural vs refined, or two refined versions
```
Needs the dev server (`npm run dev`) and Blender 4.x (`BLENDER` env var; default is the standard Windows install).
A full rebuild takes ~30–40 s per character (the first GPU bake after a Blender/driver update compiles OptiX kernels
for a few minutes).

## Steps
1. **Export** (`export-rigs.mjs` → `/?test=rigexport&who=NAME`): builds the rig unbaked at 5× tessellation (10× for
   heads, so the painted colour masks are evaluated densely where the atlas is sharpest) and dumps every part in root space with its bone, plus the eyes, nose,
   mouth and brows at game tessellation. Output: `work/NAME.json` (git-ignored).
2. **Refine** (`refine_rig.py`, headless Blender), per fusion group — head + ears + hat, body + tail + scarf, each arm
   with its hand, each leg with its foot (groups follow the joints that barely move; arms, legs and the head stay
   separate so big swings never stretch a seam):
   - voxel remesh of the union of the group's primitives → one watertight surface
   - concave-only relaxation → soft fillets where parts met, convex shapes kept
   - collapse-decimate to 70 % of the procedural shells' triangle count
   - one UV atlas: smart-project charts, then the **face is cut out as one seamless island** (seams only around it),
     all charts re-unwrapped with minimum stretch, texel density equalised, head ×1.5 and face ×4 texel area, packed
     tightly (2.5 px margins). The log prints texels/m per group: face ≈1000 (Chewy) / ≈1400 (Shadow), body ≈500–700
   - Cycles bakes: the original painted colours (+ blush / mouth lines) via selected-to-active (64 samples), then AO
     of the whole character tinted lavender and multiplied in
   - **edge cleanup**: the painted masks are per-vertex on/off, so colour borders come out as stair-steps. Each UV
     island is blurred on its own and every texel takes the flat colour nearby that best explains the blur, which
     moves borders onto smooth curves (only flat texels are candidates, so no grey halo; gradients are untouched)
   - islands dilated 12 px, sRGB PNG
   - skin weights from proximity to each bone's original parts: rigid except across fused seams (ear roots, tail base)
3. **Runtime** (`src/actors/refinedRigs.js`): `loadRefinedRigs(REFINED_CAST)` at boot; `buildHumanoid` / `buildBoston`
   call `applyRefined(R)` instead of `R.bake()` when a skin exists for that exact spec and part hierarchy.
   The skin samples its atlas through a `skinUv` attribute; `skinUv = -1` means vertex colour only. Eyes / nose /
   mouth carry it, and props that share `rig.mat` get it as their default (`material.defaultAttributeValues`), so
   swords and tools keep their own colours.

## When to re-run
- After changing a refined character's spec (`CAST.chewy`) or anything in charKit that shapes/paints them: the game
  warns `[rigs] ... re-run` for a spec change and falls back to the procedural skin for a hierarchy change.
- `tools/qa/prod-smoke.mjs` fails if Chewy or Shadow are not refined in the production build.

## Adding a character
Add it to `REFINED_CAST` (charKit.js); exportable names are `chewy`, `shadow`, `rosie` and the named villager ids
(see `src/tests/rigexport.js`). Random townsfolk are generated at runtime and stay procedural.

## Codex-built assets (the `codex-blender` skill)
Props and other hand-modelled assets can be made by the Codex CLI (GPT-6.1-Sol) under Claude's direction; see
`.claude/skills/codex-blender/SKILL.md`. Codex writes a deterministic `build_<task>.py` in
`work/codex/<task>/` and exports `public/models/<task>.glb`. `codex/preview.py` renders the standard review sheet
(game camera, front, side, top, a 1 m scale capsule, stats.json). In the game, `src/gfx/glbAssets.js` loads the
model with toon materials; check it at `/?test=glb&url=/models/<task>.glb`.
