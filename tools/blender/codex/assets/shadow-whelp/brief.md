# Asset brief: shadow-whelp (Shadow's dragon whelp outfit, a re-dress plus wing props)

## What it is
**Shadow**, the cast's Boston terrier and the hero's companion, wears a **little dragon whelp costume** while the owner plays
the new Golden Retriever dragoon. In that outfit he **flies** beside the hero like a small dragon pet. With every other hero
he's his normal self, so this is a **separate variant**, not a replacement.

The blueprint is the "SHADOW WHELP" callout on `refs/golden-sheet-C.png` (front and side, flying). The costume is in the
dragoon's colours:
- an **emerald** (#3a9a6a) soft hood with two little **brass** (#c8a050) horns and a row of brass felt spikes down the back,
  with his own tall ears coming **through slits**;
- **emerald felt dragon wings** with cream (#f4e8d0) membranes, bat-wing style;
- a **spiky tail cover** with felt spikes;
- a cream **belly-scale bib**.
He's still clearly Shadow: his face, black-and-white coat and bat ears are **unchanged**. See `refs/shadow-sheet-A.png` and
the installed model.

## Re-dress, with Shadow locked
Shadow's approved Toybox model is archived at `tools/blender/codex/assets/shadow-toy/` (`build_shadow-toy.py`,
`rig_shadow-toy.py`, `README.md`, `joints-rig.json`). The game uses `public/rigs/shadow_toy.*` on the **21-bone quad
contract** (`hero_export.py --contract quad`).
- **Build from a copy of the archive** in this task folder. Run the archived build **unchanged** (check its MD5) and add
  the costume pieces.
- **Prove the lock**: Shadow's head, face, eyes, ears, body, legs, paws and tail vertices must be identical (0.0) to an
  unmodified build, and his atlas regions pixel-identical. Write `lock-check.json`. The same method was used for the
  samurai Chewy; see `tools/blender/codex/assets/chewy-samurai/lock_check.py`.
- **The costume**:
  - the hood fits his skull (and the ear slits fit his ears) without poking through at rest or in his ear-spring motion;
  - the bib and the back spikes follow his body;
  - the tail cover follows tail1–tail4.
  - Delete no Shadow geometry: the costume sits on top.
- **The wings are separate props**, `public/models/shadow-whelp-wing.glb`: **one** wing, which the game mirrors for the
  other side.
  - The pivot is at the wing root (the shoulder attachment).
  - The membrane is in the wing's plane, and a `*glow*` material is optional; none is needed.
  - About 0.32 m span per wing at Shadow's scale: big enough to read from the game camera, small enough to stay cute.
  - **The game flaps it** by rotating it about its root, so make the membrane a thick, rounded felt shape that reads from
    any angle (never a thin card), with 3–4 finger struts.
  - Write the left and right wing root mounts (in the body bone's frame and in model space, game axes) to `wing_mount.json`.

## The rig
After the director approves the model, rig it to the **same 21-bone quad contract**:
- reuse Shadow's rig and weights exactly for the locked parts;
- weight the hood to the head, the bib and back spikes to the body, and the tail cover to the tail bones.
- Export as **`shadow_whelp`** (`hero_export.py --contract quad`) into this task's `export/`. **Don't write
  `public/rigs/`**.
- The **flying pose** is the game's job (the body tilted, legs tucked, wings flapping), but render a **flying test**: the
  front legs tucked, the hind legs trailing, the body pitched about 15° nose-up, with the wing props mounted at ±30°, ±60°
  and ±90° flap angles, so the director can judge it.

## Technical
- About Shadow's current triangle count plus 30% at most, for the costume. One atlas: put the costume into free atlas
  space or a second small material, and report which.
- Previews with `--character`:
  - the model, front, 3/4, side and back, plus the 45° `game.png` from both yaws;
  - a comparison next to the sheet's whelp callout;
  - `cmp-shadow.png`: normal Shadow beside the whelp Shadow at the same scale;
  - the flying test render.
- **Process safety**: launch every Blender run through a PID-logging launcher with a timeout, and stop only those PIDs.

## Done when
- He reads unmistakably as **Shadow in a cute emerald dragon whelp costume**, matching the sheet callout.
- The lock check is 0.0.
- The wings read from both 45° game yaws at every flap angle, with no thin cards.
- The flying test is cute.
- Phase 1 stops for the director's and owner's review. The rig follows on their go.
