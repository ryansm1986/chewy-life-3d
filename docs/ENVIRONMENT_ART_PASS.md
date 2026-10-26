# Pawhaven — waterfall & bridge visual upgrade

**Status:** Design + implementation task for Codex. **Scope:** Blossom Hollow's northern waterfall and main river bridge, plus a small amount of connected bank dressing. Keep this separate from feature development, saves, and release work.

## Intent
The existing village is a cozy, hand-painted, Japanese-inspired 3D isometric game. Its water and bridge should feel handcrafted, rich, charming, and lively — **not realistic, photogrammetric, visually noisy, or performance-heavy**. Make the waterfall and bridges feel like scenic destinations players want to revisit.

## Current implementation (read these before touching code)
- `src/world/waterfall.js` — animated curved shader water sheet, falling spray, mist, soft rainbow.
- `src/gfx/water.js` — water/shoreline color and foam.
- `src/world/buildings/decor.js` — `bridge(B)`, `BRIDGE`, `bridgeDeckHeight()`: vermilion taiko bridge; arched wood walkway, rails, gold-capped posts, supports and stone abutments.
- `src/world/details.js` — `bridge()` bank rocks, reeds, boats, lanterns; `northPath()` waterfall trail details.
- `src/world/layout.js` — `LANDMARKS.waterfall`, `LANDMARKS.bridgeW`, `BASIN`, `RIVER`. Never hardcode replacement world coordinates.
- `src/world/village.js` — bridge gameplay placement, decks and collisions. **Preserve `bridgeDeckHeight()`, model footprint, walkability and deck handling**.
- `src/world/terrain.js` and `src/world/mapArt.js` — terrain and minimap integration.
- `CLAUDE.md`, `docs/ROADMAP.md`, `docs/VILLAGE_PLAN.md` — existing project conventions, quality and verification.
- Tech: Three.js 0.186 / Vite. Existing procedural geometry, toon materials and shared animation uniforms should be reused.

## Stage 1 — mockups from the actual game
Create **three genuinely distinct, cohesive concepts**, each showing **waterfall + bridge** together in the established Pawhaven art style:

1. **Mossy Storybook** — waterfall over stacked stone with irregular ledges, soft moss, cascading water ribbons and varied foam; bridge with sculpted timbers, warm lacquer, subtle gilding and lush banks.
2. **Sakura Festival** — rock-framed falls, drifting petals, blooming waterside trees, delicate lantern/string accents, ornamental bridge rails and inviting footpath.
3. **Hidden Spirit Falls** — bolder layered chute and plunge pool, restrained bioluminescent glints/fireflies at twilight, engraved stone/details and a slightly magical bridge accent.

Create each as **code-backed Three.js in-game mockup**, NOT text-only concepts or standalone AI concept images. Allow comparing the candidates without disturbing saved game state, such as a development-only query parameter or an isolated preview scene. Capture actual **before/after screenshots** of the normal isometric gameplay camera with side-by-side presentation. Include wide overview and closer waterfall and bridge views, plus twilight/night where relevant. Save a clearly named contact sheet and short notes under `docs/mockups/environment/`. If a screenshot environment can't run, still create functioning preview code and document exactly how to capture the screenshots locally; do not claim unseen renders were verified.

Quality target: attractive **at the camera scale the player actually uses**, believable silhouette from distance, easy-to-read paths, coherent palette. Three variants should be unmistakably different at first glance. Don't make all three small color variations.

## Stage 2 — implement best cohesive direction
After prototyping, select the strongest compatible direction (or thoughtfully combine strongest elements), state the reasons in the PR, and implement it in main runtime code **on this branch only**; no release or merge. Preserve existing features. Specific upgrades:

### Waterfall
- Build dimensional stone/rock banks and an appealing natural spillway framing the fall.
- Add layered falling water ribbons/sheets with brighter crest/edge streaks, a convincing plunge-pool impact, moving foam loops, bubbles, splash accents and a light mist veil.
- Bring the waterfall into the surrounding terrain with moss, small rocks, wet stone color variation, reeds/ferns and a few restrained nature details.
- Existing rainbow must remain subtle, daytime/lighting aware; avoid an opaque wall of blue, texture swimming or unnatural clipping against rock.
- Animate effects gracefully with distance/quality scaling; keep alpha blending under control and avoid full-screen washout.

### Bridge
- Keep the existing walkable, curved vermilion taiko bridge and collision/placement behavior; improve the craft of the geometry rather than swapping it for another type.
- Add readable plank seams and thickness, more convincing structural trusses/bracing, refined curved railing layers, ornamental giboshi finials and tasteful gold/black trim.
- Add tiny handcrafted touches (wood grain, fittings, optional hanging ornaments or lanterns), with detail scaled for play camera rather than hundreds of invisible polygons.
- Carefully improve approach/abutments/riverbank rocks and plants without obstructing the crossing, entrances, AI navigation or fishing access.
- Reuse instancing/materials where useful. Avoid z-fighting and excessive tiny per-piece meshes.

## Constraints
- All work should integrate naturally with the game's **existing Three.js/procedural art code**. No unnecessary new runtime dependencies, paid art packs, or unrelated Blender character/model work.
- Keep `LANDMARKS` authoritative. Do not change town layout, save format, quest gameplay, bridge height function, navigation/collision or build placement.
- Make features deterministic where appropriate; avoid flickering random layout between reloads. Optional small VFX randomness is fine.
- Respect `CLAUDE.md` line endings for touched files, refrain from whole-file reformatting, do not publish to itch.io/desktop or merge.
- Avoid altering other agents' work and recheck shared files before editing.
- Desktop, mobile preset/Steam Deck performance must remain good; scale down VFX and complexity on low detail settings when available.

## Acceptance & evidence
- **Three real in-engine visual mockup variants**, screenshots/contact sheet + chosen rationale (or accurately noted runtime limitations).
- Implemented code on this branch; original bridge remains traversable, water feels richer and world details improve.
- Screenshots from gameplay camera before/after, daylight and evening; inspect them and fix clipping, bright washout, artifacting or scale problems.
- Run `npm run build`, `node tools/test-rpg.mjs` and relevant QA; where available `node tools/qa/prod-smoke.mjs`. Review any harness OS-specific Chrome paths and adapt locally instead of assuming Windows.
- Report changed files, visual results and tests on the PR. Do **not** merge or deploy. 
