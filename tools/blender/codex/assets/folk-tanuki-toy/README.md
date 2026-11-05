# Townsfolk tanuki (folk-tanuki-toy): Blender source (Z-D6, 2026-11-04)

Two random townsfolk tanuki, the owner's picks A (Momo, ivory shirt, green overalls, a peach flower) and B (Bun, butter smock, cream pocket, powder-blue neckerchief) from the Codex sheet `sheet.png` (folk-tanuki-concept). Game ids `folk_tanuki_a`, `folk_tanuki_b` (HERO_MODELS lidTilt 0.169 / 0.217, lidClose 1.10 / 0.62, squint [0.12, -0.28], shutLashColor ['#e8d8c8'] x2, darkGrade [0.3, 8, 4, -10]: without it the mask goes purple); a random townsfolk tanuki is one of them by its seed (heroModels FOLK_TOY).

Build: `build_folk-tanuki-toy.py --design a|b|all` (from the folk-panda family build), rig: `rig_folk-tanuki-toy.py` with `rig_lids.py`; `gameface.mjs` serves a patched heroModels.js to judge darkGrade / shutLashColor before the entries have them. Round 2: round cup ears (no horn from 45 deg), B's curved hem. Known: in the run pose A's knee shows below the shorts and B's pocket flaps.
