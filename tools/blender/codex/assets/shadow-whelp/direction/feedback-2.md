# Round 2 feedback (shadow-whelp): about 8.5/10, adorable and faithful

## Approved and locked
- The hood (fit, ear slits with piping, horns and spikes), the back coat with spikes and stars, the bib and the tail cover.
- The lock (0.0), the outward winding and the determinism.
- **The 2048×2304 atlas**: OK. WebGL2 handles NPOT textures. Note it in the archive README.
- Weighting the tail cover to body, tail1 and tail2 is right, since the quad contract has only those two tail bones.
- **The ear extremes**: the game will damp the ear swing for the whelp variant (an `earGain` on its HERO_MODELS entry), so no
  geometry change is needed.

## Fixes (the wings only)
1. **Bigger, peachier wings, matching the sheet callout.**
   - **Scale**: the span to about **0.42 m** (×1.25).
   - **The membrane**: warmer **peach-tan, about #f2c48a**, with the soft shading the sheet has, not pale cream. Keep it
     thick and felt-like with the scalloped trailing edge.
   - **The arm and fingers**: make the emerald arm and leading finger **chunkier** (about 1.5× the thickness), and give the
     wing **3 finger struts** fanning to the scallop points, as on the sheet. Today it reads like a thin umbrella frame from the
     game camera.
2. **Mount the wings at the shoulders**, like the sheet: your y 0.155 position.
   - **The flap range** in the game will be capped at **−30° to +60°**, which you said is clean there. A cute pet flap doesn't
     need +90.
   - Re-check the clearances over that range with the bigger wing, and update `wing_mount.json`. Also write
     `"flapRange": [-30, 60]` into it.
3. Re-render `cmp-sheet.png`, `flying.png` (flaps −30, +30, +60) and `game-45.png` from both yaws with the new wings.

Then stop. The owner sees him before the rig. Same process rules.
