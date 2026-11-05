# Townsfolk cats (folk-cat-toy): Blender source (Z-D6, 2026-11-04)

Two random townsfolk cats, the owner's picks A (Momo, cream with a peach patch, sage overalls) and B (Kinako, ginger, wrap top, teal sash, blue bandana) from the Codex sheet `sheet.png` (folk-cat-concept). Game ids `folk_cat_a`, `folk_cat_b` (`public/rigs/folk_cat_<x>_toy.*`, HERO_MODELS lidTilt 0.522 / 0.499, squint [0.20, -0.30]); a random townsfolk cat (roster.js `townsfolk`) is one of them by its seed (heroModels FOLK_TOY, charKit folkToy).

Build: `build_folk-cat-toy.py -- --design a|b|all`, rig: `rig_folk-cat-toy.py -- --design a|b` (Kome's rig adapted). Round 2 fixed the ears (wedges growing from the head's side, not gumdrops) and slimmed B's bandana (13.5 mm off the skin). Known: a faint lid disc at the 0.85 blink frame, as Kome.
