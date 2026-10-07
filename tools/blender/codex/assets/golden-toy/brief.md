# Asset brief: golden-toy (the Toybox Golden Retriever dragoon; phase 1, the model)

## What it is
The **Golden Dragoon** (a working name) is a **male Golden Retriever dragoon**, the game's fifth playable hero. He's
sunny, brave and boundlessly enthusiastic. He fights with a long dog-toy lance and toy javelins, leaps into dives, and
flies with Shadow as his dragon whelp (a separate task).
The owner picked **Option C, "Emberleaf Dragon Guard"**: `refs/sheet.png` is **the blueprint**, so match it closely.
He belongs to the same toy line as:
- the samurai Chewy (`refs/chewy-samurai-sheet-E.png`, `refs/sheet-B.png`, `refs/chewy-toy-game-crop.png`);
- Poe (`refs/poe-sheet-D.png`);
- Moka (`refs/moka-sheet.png`);
- Shadow (`refs/shadow-sheet-A.png`);
- the cast lineup (`refs/cast-lineup.png`).

This task has two phases:
- **Phase 1 (now)**: the model in a neutral A-pose, until the director rates it 9/10 and the owner signs off.
- **Phase 2 (later)**: rigging to the 37-bone biped hero contract.
Build rig-ready, but don't rig yet.

## Measure the sheet first
**Measure on the sheet yourself**, scripted, with ruled crops or colour extents, not by eye. Write `measurements.json`
with the targets below as fractions of W (the head width at the cheeks, excluding the ears) and H (crown to chin,
excluding the helmet crest). Show your measurements next to the model's in every report. If the views disagree, follow
the head close-ups for the face and the turnaround for the body, and say so.

Targets to measure and match:
- **Height**: the crown at chewy-b.glb's crown height, plus the helmet crest; about 2.4 heads (the sheet says 1.05 m).
- **Head**: a friendly rounded head with a **medium toy muzzle** (like Chewy's, not long) and a big happy open smile as
  his default, the tongue visible.
- **Eyes**:
  - centres, opening, iris and pupil as on the sheet, with warm dark-brown irises (#603b27) and the toy-line construction;
  - they face about 30° outward, set into the curve;
  - the iris bottom is at or above the nose top.
- **Nose**: a rounded dark-brown nose with a highlight.
- **Ears**:
  - long, **feathered floppy ears**, big soft red-gold (#c47a3a) masses with lighter (#e0a868) feathering, hanging to
    about the jaw or shoulder;
  - thick, clay-like volumes, never strands or cards. Check them from both 45° yaws.
- **Fur**:
  - a **fluffy cream chest ruff**;
  - feathering on the backs of the legs and forearms;
  - a big **plumed tail**, all as smooth sculpted masses.
  - The coat is red-gold #c47a3a, with light fur #e0a868 on the muzzle, ruff and feathering.
- **The helmet**:
  - an emerald (#3a9a6a) open-face **dragon-head crest helm** with brass (#c8a050) horns or spikes and a little dragon
    face on top;
  - **the face fully open**, and the ears coming out under it.
  - It must not hide the eyes from 45° above.
- **The armour**:
  - emerald **scale-pattern** plates on the chest and shoulders (sculpted or painted scales, readable at the game camera),
    with brass trim and a round brass belt medallion;
  - a layered emerald tabard with a **leaf-dragon emblem**;
  - brown leather straps;
  - a **back quiver** of javelins (emerald, brass caps).
  - Measure each piece's heights and widths as fractions of the crown height.

## The weapon props (separate GLBs)
- **`public/models/golden-lance.glb`**, as on the callout:
  - about 1.6 m long;
  - a braided rope-toy shaft in cream and tan bands;
  - an emerald **rubber dragon-flame spearhead**;
  - a brass collar and a plush felt **dragon-wing guard** (emerald);
  - a **tennis-ball pommel**.
  - The pivot is at the main grip. Write both grip points (main and off-hand) to `prop_mount.json`.
- **`public/models/golden-javelin.glb`**: a chunky squeaky toy dart with a brass round rubber tip, a rope shaft and emerald
  felt fletching, with its pivot at the grip.
- **The quiver** on his back is part of the body mesh, with its javelin tips visible.

## Technical
- A neutral A-pose (arms about 40° from vertical if needed), facing **−Y**, standing on z = 0, centred.
- **≤ 30k triangles**. One material with **one 2048² painted atlas**, plus small prop materials. No fur strands or cards.
- **The toon band**: keep the face finely tessellated where it curves fast. Render `preview/toon-check.png`.
- **Rig-ready**:
  - eyeballs as separate spheres;
  - loops around the lids and mouth;
  - the ears, tail, tabard panels and ruff as separate pieces with bend loops;
  - enough loops at the joints;
  - hidden surface deleted;
  - `joints.json` with chewy-b's joint names.
- Output: `public/models/golden-toy.glb`.
- Previews with `--character`: the turnaround, head, `portrait.png`, `game.png` from both yaws, and the same-scale
  comparisons (`cmp-head`, `cmp-front`, `cmp-side`, `cmp-back`, `cmp-eyes`, and `cmp-cast` next to chewy-b).

## Done when (phase 1)
- The comparisons read as the same character as `sheet.png`, within about 5% on your measured targets.
- He's appealing in `portrait.png`.
- At 45° the face, the ears, the emerald helm and armour and the quiver read, and nothing reads as spikes or flat cards.
- ≤ 30k triangles, one atlas, ground, −Y, no warnings, and `joints.json`, `measurements.json` and the prop GLBs written.
- **Watch the colour**: his emerald must stay distinct from Poe's moss green (#5A8A4A) in the game. The sheet's #3A9A6A is
  a bluer, brighter green; keep it that way.
