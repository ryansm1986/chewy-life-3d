# Townsfolk pandas (folk-panda-toy): Blender source (Z-D6, 2026-11-04)

Two random townsfolk pandas, the owner's picks A (Hana, coral shirt, sage overalls, a flower) and B (Momo, lilac tunic, cream apron, beret; 0.99 m) from the Codex sheet `sheet.png` (folk-panda-concept). Game ids `folk_panda_a`, `folk_panda_b` (HERO_MODELS lidTilt 0.263 / 0.224, lidClose 0.42 / 0.50, squint [0.09 / 0.11, -0.30], shutLash [0.10, 0.028, -0.046, 0.05, 0.0055], shutLashColor light, darkGrade [1, -4, 14, -9]); a random townsfolk panda is one of them by its seed (heroModels FOLK_TOY).

Build: `build_folk-panda-toy.py -- --design a|b|all` (Hokuto's machinery, re-measured), rig: `rig_folk-panda-toy.py` (`scratch/cycle.sh` runs rig, export and the game check). The rig uses a lighter mesh on flat areas to fit the lids and mouth under 22k.
