# Townsfolk bunnies (folk-bunny-toy): Blender source (Z-D6, 2026-11-04)

Two random townsfolk bunnies, the owner's picks A (Hana, white, upright ears, a flower, mint overalls) and B (Momo, fawn, lop ears, lavender beret, peach smock, cream apron) from the Codex sheet `sheet.png` (folk-bunny-concept). Game ids `folk_bunny_a`, `folk_bunny_b` (HERO_MODELS lidTilt 0.3607 / 0.3287, lidClose 0.52 / 0.485, squint [0.06 / 0.056, -0.26], shutLash y -0.068); a random townsfolk bunny is one of them by its seed (heroModels FOLK_TOY).

Build: `build_folk-bunny-toy.py -- --design a|b|all` (Usagi / Chiku machinery), rig: `rig_folk-bunny-toy.py -- --design a|b` with `rig_lids.py`. Lid lesson: the first rig's hinge sat ~9 cm behind the eye and the shut lid domed 7 mm (a grey disc on white fur); the deep hinge (23 cm behind, 0.08 eye-heights below, picked from 16 scored candidates) with lidClose lies flat (2.6 mm, set by the eyeball itself). The squint is absolute: scale it by the new close angle.
