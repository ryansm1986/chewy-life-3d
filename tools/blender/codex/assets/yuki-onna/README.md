# yuki-onna (boss, ROADMAP EN-1)

Yuki-onna, the Frost Princess, Yukimi Onsen's boss (and her glass mirror copies), built in Blender by an Opus agent from
the pick, Option A "Frost Princess" (`concepts/sheet-A.png`). Approved by Claude at 9/10 after 2 rounds (the shawl's
loops rose above her shoulders like horns: lowered into a drape round the elbows), 2026-10-21.

- Contract: `.claude/skills/codex-blender/templates/boss-model-contract.md` (flat rigid named parts on the kit's pivots, model units).
- Parts, the same names as the kit's masters: body, head, face, lids, mouthO, puff, hairB, slR, slL, shawl.
  `glbMasters` in `src/regions/bosses/yukionna.js` hands them to `buildYuki`; the kimono pattern is in vertex colours,
  so the material drops its CanvasTexture map (`yukiMat(mirror, glb)`). Crystal colours glow through YUKI_OUT.
- Her idle pose is built so the game's idle values reproduce the sheet; the attack poses swing a little wider.
- Rebuild: copy this folder to `tools/blender/work/codex/yuki-onna/` and run
  `blender --background --factory-startup --python build_yuki-onna.py`. The script is deterministic.
