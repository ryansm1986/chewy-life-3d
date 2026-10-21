# Phase 3: Stella becomes the Sun Oracle (a recolour and a new prop)

The owner redirected Stella's theme to a **Sun Oracle**, and picked **Option B, "Midday"**:
`refs/sheet-sun.png`, the blueprint for this phase. **The shapes and the rig do not change**: same meshes, same weights,
same lids, mouth and bones. This phase is:
1. **a repaint of the costume** in the atlas;
2. **a new parasol prop**, the sun wagasa.
Keep round 4's look everywhere else, plus your last fixes: the nose #8F7474 and the mid-blink lid corner.

## 1. The costume repaint (atlas only; the same geometry and UVs)
Measure the colours on `refs/sheet-sun.png`. Codex's notes for Option B:

| Part | Hex |
|---|---|
| Wrap top, bell sleeves, outer skirt | **#F0C24E** saffron |
| Petticoat layers (pink and sheer), cuff trim, painted sun motifs | **#FFF9EC** warm white |
| Obi, its knot and tails, the back bow, the collar trim | **#D9573E** sunset red |
| Necklace beads (was pearls), the two obi beads (was sea glass) | **#DFA23C** amber, with a soft highlight |

- **Motifs** replace the star sparkles:
  - a **sun disc with rays** on each sleeve (as on the sheet's sleeves);
  - **teardrop sun rays** pointing outward on the outer skirt's scallops (pale #FFF9EC on saffron);
  - a few small suns on the back.
  - Keep them big and few, so they read at the 45° game camera.
- **Shading**: the same shade-by-tone charts as before (light, base, shade for each colour block), so the toon
  light reads. Keep the saffron in **mid-light tones**: no pure-white or pale-yellow areas, which bloom in the game's warm
  light (the Burrow). The white petticoat is warm white (#FFF9EC), never pure #FFFFFF.
- **The beads** become amber sun beads, the same spheres.
- **The fur, eyes, nose, inner ears and face** stay exactly as now.
- **Validation**: the atlas changes only in the costume charts. Widen `validate.py`'s lock to the costume charts and
  hold everything else (fur, face, eyes, lids, cavity, tongue, nose) pixel-identical.

## 2. The sun wagasa (`public/models/stella-parasol.glb`, replacing the jellyfish parasol)
As on the sheet's callout: a Japanese oil-paper parasol.
- **Canopy**: about 0.75 m across, with a slightly peaked wagasa profile (not a dome). A **sunburst**: alternating
  saffron #F0C24E rays and red #D9573E paper panels from a centre ring, the visible **bamboo ribs** in gold #E8B44A,
  and a pale #FFF9EC underside with the ribs radiating.
- **Finial**: a **gold sun disc** (#E8B44A) on top, with a `*_glow` material kept a little under pure white (a value
  about 0.9) so it doesn't bloom.
- **Tassels**: 8 chunky amber (#DFA23C) tassels hanging from the rib tips, about 0.08–0.12 m. They're rounded,
  thick, tapered shapes, never thin threads.
- **Shaft**: red lacquer (#D9573E), about 0.8 m, with a curved crook handle as on the sheet.
- **For the game's code** (the class agent's `stellaGear.js`, STELLA.md §8.1):
  - keep the **grip at the origin and the shaft along +Y**, the same grip position on the shaft as the old parasol so
    the rig's mounts still fit;
  - add an **empty named `finial`** at the centre of the sun disc;
  - give the sun disc the material named `*_glow`;
  - make **each tassel its own mesh named `tassel_0` … `tassel_7`**, with its origin where it hangs, so the game can
    sway it;
  - ≤ 6k triangles.
- Update `prop_mount.json` and `prop_mount.rig.json` if the grip or the carry changes. The carry over the right
  shoulder must keep the canopy **behind her head** from both 45° yaws: the old parasol's canopy covered her face from
  the right yaw. Suggest a carry angle that clears it.

## Deliverables
- The model GLB rebuilt (`public/models/stella-toy.glb`, the same shapes, the new atlas).
- The rig rebuilt with the new atlas, and the exporter run (`--name stella_toy --height 1.24`) with no warnings. Leave
  it in `export/`; **don't install**.
- `stella-parasol.glb`.
- **Renders**:
  - the turnaround and `cmp-front` / `cmp-head` against `sheet-sun.png`;
  - `portrait.png`, `portrait-front.png`;
  - `game-45.png` from both yaws;
  - a parasol sheet (side, top, below);
  - the carry from both yaws.
- Update the archive in `tools/blender/codex/assets/stella-toy/`: the scripts, `refs/sheet-sun.png`, this brief, and
  the README's game settings.
- **Report**: the `HERO_EXPORT` line, the colour checks (sheet vs render at matched spots), the triangle counts and the
  validation result. Then stop.
