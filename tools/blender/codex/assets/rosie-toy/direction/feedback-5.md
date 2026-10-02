# Rig review: installed in the game, one round of face fixes

Your rig is in the game: the village Rosie, her portrait and the test page now use `rosie_toy`. **Approved and locked**:
- the skeleton and its pivots (the lowered thigh pivots were the right call);
- the body, costume and skirt weights (walk and run are clean);
- the collar, arms, hair and bow;
- the jaw: talking and the open smile read cute in the game;
- the neck fix.

On the game side, I grade her hair (the game's warm light turned it maroon), so **don't change any colours**. The arm values for
the wave and the happy hop are mine to tune in the game (your known issue 4), so leave them.

My in-game frames are in `D:/projects/chewy-life-3d/tools/blender/work/codex/rosie-face/`:
- `face.png`: rest, talk, blink, jaw, happy;
- `look.png` and `look2.png`: the light test at yaw ±0.6.

## 1. Normals: a wavy shading edge across her face (the main item, visible all the time)
- The game's toon shader puts a hard light-to-shade band where N·L crosses about 0.1. Roughly:
  `band = smoothstep(-0.04, 0.34, N·L)`, mixed 25% with a half-Lambert. The sun is high and to one side.
- On her face that boundary is a **wavy, ragged line**: down between the eyes, or beside the nose depending on the yaw (`look.png`,
  `look2.png`). It moves with the light, so it's shading, not a texture or a cast shadow. Its waviness means the **exported vertex
  normals aren't smooth** across the face.
- On your analytic skin the boundary should be a clean, smooth curve. My guess is that a later step (the mouth cut, the lid holes,
  joining or applying modifiers in the rig script) recomputed the face normals from the triangles, or split them.
- **To do**:
  - Make the exported normals of every skin vertex the **analytic surface normals** again, including around the cuts. The exporter
    reads `mesh.corner_normals`, so check what it sees: the angle between the exported normal and the analytic normal over the face
    should be < 2°.
  - **Verify with a toon test render in Blender**: a sun at the game's angle (about 50° up, from the side) with a hard
    two-tone ramp (Shader to RGB → Constant ColorRamp at about 0.1–0.15). Render the face front and 3/4 at yaw ±0.6.
  - The light/shade boundary must be a smooth curve everywhere on the face, the hair and the arms: no waves, no zigzags.
  - Put that render in `preview/toon-check.png`.

## 2. Blink reads as a dark outlined eye
- In the game (`face.png`, "blink"), the closed eye shows the lid skin framed by **dark bands above and below**: the painted upper
  lash band still shows along the top, the lid's own lash is at the bottom, and the edges are ragged. From normal game distance it
  reads as a dark-ringed eye, not a closed one.
- It must read as **skin with one soft ∪ lash curve plus the 3 flicks**:
  - at 1.22 the lid must also cover the painted lash band above the opening (or blend into it with no visible top edge);
  - fix the faint light edge along the lid's top and the ragged outer-lower corner.
- Check it in the toon test render too: the game's band shading makes any step between the lid and the skin show.

## 3. Happy: make the squint read happy, not heavy-lidded
- You're right that a rigid lid with a dark lash strip makes the top band read heavy. Two changes to try (keep the 1.22 blink and the
  hidden rest):
  - **Thin the lid's dark lash strip**: about her open-eye lash thickness at the centre, tapering to the corners. Then at +0.488 only
    a thin dark edge shows over a skin-coloured lid, not a thick dark band.
  - Let the **lower lid's arch rise a little higher in the middle** (about 35% at the centre, 20% at the corners), so the visible eye
    becomes a smiling crescent.
- If it still reads heavy, tell me, and I'll lower the game's squint value for Rosie only. That's a game-side switch, so no
  geometry hacks.

## Re-render
- `preview/face.png`, at the front, both game yaws and the 3/4.
- `preview/toon-check.png`.
- Re-export with the same command, with no warnings and still deterministic. The approved GLB stays untouched.

Report as before (the `HERO_EXPORT` line, the normal-angle stats, known issues), then stop.
