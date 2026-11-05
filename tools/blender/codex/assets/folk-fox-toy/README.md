# Townsfolk foxes (folk-fox-toy): Blender source (Z-D6, 2026-11-04)

Two random townsfolk foxes, the owner's picks A (Hana, cream shirt, sage overalls, a flower) and C (Yume, lilac dress, mustard satchel) from the Codex sheet `sheet.png` (folk-fox-concept). Game ids `folk_fox_a`, `folk_fox_c` (`public/rigs/folk_fox_<x>_toy.*`, HERO_MODELS lidTilt 0.5236, squint [0.14, -0.26], Mikan's shutLash); a random townsfolk fox (roster.js `townsfolk`) is one of them by its seed (heroModels FOLK_TOY).

Build: `build_folk-fox-toy.py --design a|c|all` (assembled from `src/p*.py` by `src/assemble.py`; Mikan's build re-measured), rig: `rig_folk-fox-toy.py -- --design a|c` (Mikan's rig, hinge radius per eye). Round 2: the soft satchel, the ear ledge, higher tails. Known: the 0.85 blink lid bump at 45 deg (Mikan's).
