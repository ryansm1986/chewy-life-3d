# Model brief: heikegani_brineclaw (Captain Brineclaw, the Tidepools' siege captain)

The same contract, Tide Pool note and part conventions as `brief.md`, **one more variant file** of your approved
Samurai Shell crab: `D:/projects/chewy-life-3d/public/models/heikegani_brineclaw.glb`. Captain Brineclaw is the big crab
general who leads the siege of the Shiokaze village (see him today, procedural, in
`D:/projects/chewy-life-3d/tools/blender/work/codex/captains/tidepool-besieged-square-a.png`, the big coral crab in the
middle). He must look like **the boss of your crabs**: the same toy finish, face style and crest, but his own shape.

## His shape (from the game's look for him: `look` in `src/regions/village/captains.js`, read-only)
- A **wider, rounder, higher** shell than the soldiers (about 1.2× as wide, 1.15× as deep, a higher dome) with a **rolled
  lip** all round its rim; coral colours: shell **#ea6440**, belly #f8e6c8, legs #d8583a, claws **#f4703f**, tips #3a1c1c,
  trim/studs #ffd257, face lines #3a1418, eye whites #fff6e6, crest #ffc83a, mon #e8403a.
- **Three** stubby, extra-thick legs a side (`leg_L1…L3`, `leg_R1…R3`, ~1.9× as thick as the soldiers', a little shorter).
- **Big claws** (~1.5× the soldiers'), held up in front as a shield; the same gauntlet cuffs and studs.
- The stalk eyes on **long stalks** (about 2× the soldiers'), lifting the cute cross eyes clear of the higher dome.
- The samurai face and the crescent crest as on your soldiers, scaled to him; a proud, grizzled general look (a scar or
  heavier brows are welcome).
- The game adds his **banner flag** on his back (at the shell's rear) and may add a helmet over the crest: leave the
  shell's top-back clear for the flag pole.

## Parts and scale
The same names and rules as your soldiers (`body`, `claws`, `leg_L1…L3`, `leg_R1…R3`, each leg's origin at its hip,
the claws' one axle), but **his own pivots** (the game reads this file's pivots for him). Build at ×1.0 like the
soldiers' file (the game scales him ×1.8). ≤ 6,000 triangles.

## Done when
He reads as the soldiers' general at the 45° camera (at ×1.8, 12 m and 24 m), the claw axle and legs pass your claw and
walk checks, and the file has the parts above.
