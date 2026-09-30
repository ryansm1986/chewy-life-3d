Your previous turn was cut off by an OpenAI capacity error just after your first test pass ("happy squint needs more lid
coverage, ear flap needs stronger tip weighting"). Your files from that pass exist: `chewy-b_rig.blend`, `export/` and
`preview/poses.png` / `face.png`. **Resume from there.**

I loaded your first export into the **actual game** (attached `face-actions.png`: in-game talk ×2, happy (mis-framed), bark;
and `rig-swing.png`, the game idle at the 45° camera). The body rig works well in game: walk, arms, the sword in the paw,
breathing and head motion are all good. Keep all of that. Fix:

1. **Finish your two open items**:
   - the happy squint (upper lid +0.4 with lower lid −0.45 must read as happy crescent eyes, "^ ^");
   - the ear tips (earTip −1.05 must visibly flip the flap up and back, and +0.6 must visibly fold it tighter, with a
     smooth bend at the fold and no skull intersection).
2. **The closed eye reads as a ring.** At blink (lidU +1.22) your `face.png` shows a full dark circle, because the painted rim
   around the eye opening stays visible around the closed lid.
   - The upper lid must **cover the whole opening including its painted rim** when closed.
   - The closed eye must read as **one soft, downward-curving lash line** (a "∪" smile-curve of lash, #1e120c, about
     2.5 mm thick, with the small outer wing), which is the lid's painted lower edge. No circle.
   - Keep the open eye exactly as approved.
3. **Artifact at rest: a crack at his left eye.** In the attached game shots there are **dark crack or scratch lines at the
   inner-lower corner of his LEFT eye** (image right), under the eye towards the nose. It's visible at rest from the game
   camera and in close-up. It's probably the lower lid shell or lash geometry poking through the skin at the game's
   neutral lidD = −0.1, or a UV seam. Nothing may show through the skin at rest, at blink or in a squint.
4. **Tearing at the mouth corner when open.** In the bark frame (jaw about +0.42, lips smiling) **red slivers** appear on his
   **left** cheek beside the mouth corner (image right): the cavity or lip is poking through the cheek. Fix the corner
   weights and geometry so the corner stays sealed and smooth at every jaw value from 0 to 0.42, with and without the
   lip smile offset (lip bones +7 mm up, 4 mm back).
5. Re-export with `hero_export.py` to `export/` (**no warnings**) and re-render `poses.png` and `face.png`. Add close
   crops of both eyes at rest from the 45° game camera and of both mouth corners at jaw 0.42.
