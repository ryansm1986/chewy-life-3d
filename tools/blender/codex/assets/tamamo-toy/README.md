# tamamo-toy (boss, ROADMAP EN-1)

Tamamo, the Nine-Tailed, the Moon Sanctum's boss (the Burrow's last), in the Toybox style, built and rigged by an Opus
agent (the toybox-character pipeline) from the pick, Option A "Moon Fox Queen" (`concepts/sheet-A.png`). Model approved
by Claude at 9/10 after 2 rounds (boxy furisode sleeves, mitten paws, the closed "ω"), rigged in 1 (37-bone biped,
no export warnings), 2026-10-21.

- Rig: `public/rigs/tamamo_toy.{json,bin,png,_n.png}` (installed with `tools/blender/codex/install_rig.py`), the
  `HERO_MODELS.tamamo` entry (`lidTilt` 0.5236: her eyes face 30° outward). The regalia (fox mask, kanzashi) are in it.
- Her tail: `public/models/tamamo-tail.glb` (vertex colours, root at the origin): `BUILD.tamamo` in
  `src/dungeon/monsters.js` fans nine instances of it on the rig's `tail1` bone; the foxfire wisps stay procedural.
- Rebuild: `build_tamamo-toy.py` (model), `rig_tamamo-toy.py` (rig), then `hero_export.py` (see `rig-brief.md`).
