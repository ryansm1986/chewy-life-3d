# tanuki-toy (enemy, ROADMAP EN-1)

The Tanuki Bandit (the Burrow's acorn thrower, Danzaburō's gang) in the Toybox style, built and rigged by an Opus agent
(the toybox-character pipeline) from the pick, Option A "Acorn Bandit" (`concepts/sheet-A.png`). Model approved by
Claude at 9/10 after 2 rounds (the quiff read as a knob, the scarf knot as a bow tie, a cheek lump), rigged in 1
(37-bone biped, no export warnings), 2026-10-21.

- Rigs: `public/rigs/tanuki_toy.*` (navy gi) and `tanuki_toy_maroon.*` (installed with `install_rig.py`); the
  `HERO_MODELS.tanukiBandit` / `tanukiBanditMaroon` entries (earGain 1.0: his rig is safe to it). `BUILD.tanuki` in
  `src/dungeon/monsters.js` builds the baked rig fresh per spawn (no cloneRig) when it's loaded.
- Known limits (rig): the raised-arm / attack poses push the sleeve tops into his big cheeks; the tail wag's base passes
  the sash.
- Rebuild: `build_tanuki-toy.py` (model), `rig_tanuki-toy.py` (rig, both colourways), then `hero_export.py`.
