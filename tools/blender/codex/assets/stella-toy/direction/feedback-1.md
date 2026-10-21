# stella-toy: feedback round 1 (7/10)

A strong first build. The eyes match the sheet very closely, the palette reads, the toon band is clean, and the budget
is respected. The problems are mostly in the head's overall shape and the lower face, which make her read longer-faced
(more like a rabbit or a donkey) than the sheet's round, cheeky toy face.

## Locked (don't change)
- The eyes: globes, the blue iris construction, the lashes, lids, pink lid shadow, catchlights, and their 32° outward
  angle and positions (±0.277 W, z 0.465).
- The brows' shape and position.
- The robe's palette (periwinkle, pearl pink, sea glass), the pearls, the obi knot and tails, and the back bow.
- The parasol's construction (I'll judge its colour in the game).
- **Height: keep the crown at 1.24 m**, slightly taller than Chewy. "1.10 m" on the sheet is just its label.

## Fixes
1. **The head's width profile.** In `cmp-head` front, the model is widest at the brows and narrows to a small chin, an
   inverted pear. The sheet is a squircle that's **widest at the cheeks**, with full, round cheeks and a broad muzzle
   base; the cranium above the brows is narrower and lower.
   - Measure the head's silhouette width (inside the ears) on the sheet's head close-up and on the model's at z = 0.10,
     0.25, 0.40, 0.60, 0.80 and 0.95 W above the chin, and match the sheet within 4%. I expect:
     - the cheek band (z 0.15–0.35) to need about +10–15%;
     - the brow and temple band (z 0.6–0.85) about −5%;
     - the crown to be a flatter, rounder arc, not a dome.
   - Keep the crown height (1.034 W) and the eye positions fixed while doing this. Move the cheeks and temples, not the
     eyes.
2. **The forehead.** The bare dome above the brows reads too tall and too smooth. With fix 1 the crown arc gets flatter
   and wider. Also bring the ear roots up and forward onto the top corners of the head, so they frame the forehead as on
   the sheet: the ears' inner edges start about 0.30 W from the centreline at the crown line.
3. **The nose is too pale.** The sheet's nose is a **darker mauve-brown**: render it about #7c5c5e in the light, with a
   soft #a07a7c top highlight; on the model it reads pale pink.
   - Make it a crisper rounded triangle with a slightly flatter top edge, as on the sheet. Keep its size.
   - Fix the 0.07 W forward offset at z 0.33 that you noted, so the nose bridge sits on the sheet's profile.
4. **The mouth reads too faint and too low.** The sheet's mouth is a clear **"w"**: a short philtrum line straight down
   from the nose, then two smile arcs curling up into **dimpled corners**.
   - The model's crease is a long, very faint arc well below the nose, so it reads as a long chin. Keep your measured
     corner and centre positions, but:
     - deepen the crease's shadow so it reads in the toon light (a darker line where the upper lip overhangs, about the
       ink weight of the lash line's lower edge);
     - add the **philtrum** (a sculpted groove from the nose bottom to the mouth centre);
     - curl the corners up with small cheek-puff dimples;
     - make the lower lip and chin area **fuller and rounder**, so the jaw doesn't taper.
   - Check it in `portrait-front.png` against the sheet's front head close-up.
5. **The neck is too long.** The model shows a grey neck stalk between the chin and the collar: in `cmp-front` and
   `portrait-front`, about 0.18 W of neck shows.
   - On the sheet, the head sits **on** the collar and the pearls touch the underside of the jaw, with almost no neck
     visible from the front (at most 0.05 W).
   - Lower the head (or shorten the neck) so the chin sits just above the pearl line. Keep the crown at 1.24 m overall:
     lengthen the body or skirts to make up the difference, see fix 6.
6. **Skirt lengths and the pink layer.** On the sheet's front view, the periwinkle robe ends at about 62% of the
   way from the obi to the feet, and the **pink scalloped layer is tall**: about 35% of the obi-to-ground height, its
   scallops big and round. On the model the pink layer is a thin frill.
   - Measure both on the turnaround and match them, keeping the scallop lobes thick and round.
   - The hems must still clear the feet for walking.
7. **Bell sleeves.** On the sheet the sleeves flare to about 1.4× the upper-arm width at the cuff, a real bell; the
   model's are nearly straight tubes. Widen them, keeping the cuffs' rolled pink edges.
8. **The fur tone.** In the renders the coat reads a little warm and khaki next to the sheet's cool silver-grey. Sample
   the rendered fur in `cmp-front` at the cheek and forehead, and compare it with the sheet's at the same spots. Nudge
   the atlas toward the sheet's #a9a6a2 / #cfccc6, cooler, with a faint mauve. I'll fine-tune it in the game with a tint
   if needed.
9. **Small items:**
   - add the faint star sparkles on the robe (painted, a few, as on the sheet);
   - lower the far ear's root slightly so its top doesn't rise above the crown line at 45°;
   - soften the neck junction at the back.

## Next report
Show `cmp-head`, `cmp-front`, `cmp-side`, `portrait-front` and the 45° game shots, plus the width-profile table from
fix 1 (sheet against model at the six heights) and the nose and mouth crops side by side.
