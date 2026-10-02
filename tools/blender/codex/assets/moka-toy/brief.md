# Asset brief: moka-toy (the Toybox Moka model, phase 1: the model)

## What it is
**Moka**, the game's second playable hero: a **Boykin Spaniel mage** (water, starlight and duck magic). The player switches between
her and Chewy all the time, so they stand side by side. The owner picked design **Option C "Star Scholar"**: the attached
`refs/sheet.png` is **the blueprint**, so match it closely.

It's the same toy line as:
- the new Chewy (`refs/sheet-B.png`, and `refs/chewy-toy-game-crop.png` in the game);
- the new Rosie (`refs/rosie-sheet-A.png`);
- the new Shadow (`refs/shadow-sheet-A.png`).
Match their style and finish.

`refs/moka-current-turnaround.png` and `refs/moka-current-game.png` are her current model, marked **"not this"**: its long,
realistic snout, its small separate eyes and its stick limbs are what this replaces.

This task has two phases:
- **Phase 1 (now)**: the model in a neutral A-pose, until the director rates it 9/10 and the owner signs off.
- **Phase 2 (later)**: rigging to the game's 37-bone hero contract.
Build rig-ready, but don't rig yet.

**Proven technique to reuse.** The two characters built before this one got their heads and hair right this way:
- `D:/projects/chewy-life-3d/tools/blender/work/codex/rosie-opus/build_rosie-opus.py` (Rosie, the latest, by your predecessor):
  - the head as one smooth blend of rounded volumes, with every skin vertex on that surface and its exact normal;
  - eye sockets as a smooth recess, so the eyes sit inside the profile;
  - big merged clay curl lobes with analytic normals;
  - a painted atlas;
  - a deterministic build.
- `D:/projects/chewy-life-3d/tools/blender/codex/assets/shadow-toy/build_shadow-toy.py` (Shadow).
Read both. You may copy or adapt their code (Rosie's curl, eye and face machinery especially). Her direction notes are in
`rosie-opus/feedback-2.md` and `feedback-3.md`, and Shadow's in `tools/blender/codex/assets/shadow-toy/direction/`. Read them for
what the director checks.

## Measured targets
The director measured these on `refs/sheet.png`. **Check them yourself on the sheet**; if they disagree with it, say so and follow
the sheet's proportions. Shadow's builder caught a director error that way.
- W = the face width at the cheeks (fur face, not the ear curls). z is the height above the chin, in W.
- Close-ups for measuring are in `refs/grid-*.png`: front, side, back and head front, upscaled crops of the sheet.

**Size:**
- The total height to the hat tip is about **1.35 m**.
- The chin is at about **0.68 m**.
- The skull crown under the hat is at about **1.08 m**.
- W ≈ **0.46 m**.
- The head is slightly wider than tall: chin to crown ≈ 0.88 W.
- Feet on z = 0.

**Head as a ball:**
- The face wraps a rounded skull. In profile, the forehead, cheek and chin form one convex arc.
- **Only the short muzzle and the nose project.**
- Each eye faces about 30–35° outward, set into the head's curve.
- The far eye is hidden in the side view, and no eyeball or lash lies on the profile silhouette.
- Do the socket recess as Rosie's build does it: smooth, with no frown creases.

**Eyes** (her biggest appeal feature):
- centres at x = ±0.275 W, z 0.37;
- opening ≈ 0.32 W wide × 0.30 W tall;
- a big **golden-amber iris** #e8a93a (darker ring #b8741e at the rim), ≈ 78% of the opening width × 90% of its height, tucked
  toward the nose, with a white crescent on the outer side;
- pupil ≈ 70% of the iris, #211811;
- two catchlights;
- a thick dark upper lash line (#211811) with a small outer wing and **2–3 short lashes** at the outer corner;
- sclera #fff6e8.

**Muzzle and nose:**
- A **short, rounded toy muzzle**: in profile it projects about 0.10 W in front of the cheeks. It's a soft ball, not a snout, and
  sits slightly lighter than the fur (#8c5a40).
- **Nose**: a rounded liver button #4a2418 with a highlight, 0.14 W wide × 0.10 W tall, centred at z 0.26 on the muzzle tip.

**Mouth:** a small closed "ω" smile, 0.28 W wide at z 0.16, with a short line up to the nose.

**Brows:** soft dark-brown arcs (#4e2c1e), 0.18 W long × 0.04 W thick, tapering, at z 0.67, x ±0.24 W.

**Blush:** soft ovals #d98d7e at about 60%, 0.22 × 0.14 W, at x ±0.385 W, z 0.19.

**Topknot:** one big sculpted curl on the forehead centre, 0.24 W wide, from z 0.62 to the hat brim (about z 0.85), coming out from
under the brim.

**Ears** (her strongest silhouette feature):
- Long pendant spaniel ears made of **big merged curl lobes** (Rosie's curl technique), rooted on the head sides under the hat brim,
  just behind and above the eyes.
- They hang to the **sash** (about 0.18 m below the chin).
- Each ear is a column of about 5–6 big lobes: about 0.34 W wide and **≥ 0.22 W thick front to back**. They're thick volumes,
  never cards, and must read from both 45° game yaws.
- Across both ears at shoulder height the outer width is about **2.0 W**.
- A **seafoam ribbon bow** (#4fc4b4: two loops and a knot, thick) ties each ear at about 0.2 W below the chin, with a 1–2-lobe
  curl tuft below the bow. The bows face outward-front, as on the sheet.
- In profile the ears hang behind the cheeks.
- Make each ear a **separate piece**: the game swings them on a spring.

**Hat** (one rigid piece on the head):
- A seafoam #3fb0a0 wizard hat. The brim is about **1.5 W** across, soft, and rolled at its edge.
- It's **tipped back**: the front brim's lower edge sits at about z 0.85 at the centre (above the brows), and the brim drops to
  about eye height only at the sides, outside the face.
- In profile the front brim is clearly higher than the back.
- The cone rises about 0.65 W above the band. Its tip bends over toward her left (+X) and down, and a gold **crescent-moon charm**
  (#f4c04a, chunky, about 0.12 W) hangs from it on a short loop.
- A violet band #8a6ad8, about 0.12 W tall.
- **Reading glasses** rest on the band's front: two round lenses about 0.24 W across, lavender-tinted (opaque in the atlas is
  fine), in thick gold frames with a bridge and short side arms tucked into the band.
- **The brim must never hide her eyes from the 45° game camera**: both irises must be fully visible in `game-45.png` from both yaws.

**Body, limbs, paws:**
- Chunky toy limbs like Chewy's, with fur on the arms and legs: #7a4a34 with the darker #603a26 in creases.
- **Mitten paws** with a thumb lobe. The right paw is softly closed so it can grip a staff later; record its palm centre.
- The legs show from the robe hem down.
- **Broad rounded feet** with toe lobes, about 0.19 m wide each, with a slight gap between the feet.
- **Tail**: a curly fur tuft (two or three lobes, about 0.13 m), poking out of the back split of the outer robe at about 0.35 m.

**Costume:**
- **Inner robe**: lavender #b8a4e8 kimono-style, with a crossed V neckline edged in gold #f4c04a.
  - Wide sleeves to just above the wrists, gold-trimmed at the cuff, with the paws coming out.
  - Its skirt is a slightly darker lavender (#a894dc), hem at about 0.25 m.
- **Sash**: violet #8a6ad8, about 0.06 m tall, at the waist (about 0.50 m).
- **Outer robe**: lavender, **open down the front**, with gold trim on every edge.
  - Gold stars and sparkles near the hem, front and back.
  - It flares to **mid-calf** (hem about 0.15 m) with a back split for the tail.
  - It must clear the legs for walking and running, so make the panels loopable.
- **Stole**: seafoam #4fc4b4, two vertical panels from behind the neck down the front to the waist, about 0.08 m wide and
  thick-edged.
  - Each ends in a **chunky gold tassel** bunch at the waist: a few fat strands merged, no thin strings.
- **Satchel**: brown leather #603a26, about 0.17 × 0.13 × 0.05 m, at her **left hip**.
  - A rounded flap with a **gold star**.
  - The strap runs from her right shoulder across the chest; make it ≥ 2.5 cm wide and with thickness, never a thin line.
- **Rubber-duck charm** (#ffd24a, bill #e99536, about 0.06 m) hanging from the sash at her right front, as on the sheet.

**Palette** (sheet swatches): fur #7a4a34, curls #8c5a40, shade/satchel #603a26, eyes #e8a93a, nose #4a2418, hat #3fb0a0, stole
and ear ties #4fc4b4, robe #b8a4e8, sash/band #8a6ad8, gold #f4c04a, duck #ffd24a, sclera #fff6e8, lid/pupil #211811, blush #d98d7e.

## Technical
- A neutral A-pose (arms about 25–30° out, clear of the ears), facing **−Y**, standing on z = 0, centred.
- **≤ 32k triangles**; the head, ears, hat and eyes may take up to 55%. One material with **one 2048² painted atlas**. No hair
  strands or fur cards. Smooth silhouettes, with no polygon steps at portrait size.
- **Rig-ready** (phase 2 is the 37-bone hero contract, like the Toybox Chewy):
  - eyeballs as separate pieces;
  - loops around the eyelids and the mouth;
  - the ears as separate pieces with loops along their length;
  - the hat as a separate rigid piece;
  - the tail separate;
  - the robe panels and skirts with loops;
  - loops at the joints;
  - hidden body surface deleted.
  Write `joints.json` with the same keys as Rosie's build, plus `palm_R` / `palm_L`.
- Output **`D:/projects/chewy-life-3d/public/models/moka-toy.glb`**.

## Review deliverables (every round)
- The standard preview with `--character`.
- Same-scale comparisons against `refs/sheet.png`, built with compare.py:
  - `cmp-head.png` (front and 3/4);
  - `cmp-side.png` (side, nose-aligned);
  - `cmp-back.png`;
  - `comparison.png` (the full turnaround vs the sheet's row).
- **`cmp-family.png`**: your Moka next to the Toybox Chewy (`D:/projects/chewy-life-3d/public/models/chewy-b.glb`), front and 3/4,
  at the same scale. They must read as one toy line and as clearly different dogs.
- `portrait.png` (3/4 head and shoulders, studio light).
- `game-45.png` (45° down, yaw ±45°, long lens).

## Done when (phase 1)
- The turnaround and head comparisons read as the same character as `sheet.png`, within about 5% on the measured targets.
- The head reads as a round ball in every view, and in profile only the muzzle and nose project.
- `portrait.png` looks appealing and polished, in the same finish as the Toybox Chewy and Rosie.
- `game-45.png` shows both eyes clear of the brim from both yaws, and no part reads as a thin spike: the ribbons, the strap, the
  tassels, the moon charm and the glasses frames.
- ≤ 32k triangles, one atlas, stands on the ground, faces −Y, no preview warnings, and `joints.json` written.
