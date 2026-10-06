# Round 1: the owner's pick is Option E, "Black and Gold". Start the re-dress.

`refs/sheet.png` is now **Option E** (the old red Option B is kept as `refs/sheet-B-red.png`, for reference only). The
shapes are Option B's: the haori cut and length, the kimono, the hakama, the cord, the saya and the arm wraps. The brief's
measured targets still stand, except for the colours and the decisions below.

## The palette (from sheet E; replace the brief's colours)
| Part | Colour |
|---|---|
| Haori | black **#1E1C22**, with a soft cool sheen and visible fold highlights so it reads as black fabric, not a flat silhouette |
| Haori collar band (the front edges) | black, with a thin **gold #E8B84A edge** along both front edges, as on the sheet |
| Mon crests | **gold #E8B84A** paw prints: two on the chest, one big one on the back |
| Kimono | charcoal **#34303A**, with a **cream #F4ECE0 inner collar line** at the neck; keep the cream crisp, as it's the light edge between the fur and the cloth |
| Hakama | black **#24222A**, with the pleats readable through soft highlights |
| Haori cord and saya sageo | red **#D8402E** |
| Saya | black, with **gold** fittings: the mouth ring and the end cap |
| Arm wraps | unchanged cream |

Put them all in the one `OUTFIT` dict you planned.

## Decisions on your three issues
1. **The lopsided haori: yes.** Follow the sheet. The saya side is narrower so the saya clears the locked paw, about
   0.88 W at the hem overall. Check that it doesn't read as lopsided from the front and both 45° yaws; it shouldn't, since
   the saya covers that side.
2. **A tail vent: yes.** Add a rounded slit at the centre back of the haori so the locked tail comes through cleanly. It's
   period-correct, and it should look intentional, with its edges finished like the hem.
3. **The back crest: follow sheet E**, measured on its back view. That's about 0.3 W across, centred around 0.40–0.45 of
   the crown height; take your measurement.

## Readability (this outfit is the darkest option)
Chocolate fur next to black cloth must still separate at the game camera. Check `game.png` from both 45° yaws for:
- the cream inner collar and the arm wraps reading as clear light edges;
- the gold trim and crests reading crisp;
- the black having enough sheen that the haori, kimono and hakama read as separate layers.

The game's grade pass lifts very dark pixels toward violet, so **paint the true sheet colours**. I'll correct the cast in
the game with a runtime grade if needed; don't lift them yourself.

Go ahead with phase 1 (the model), and stop after the report as before. Write your status into `report.md` in the task
folder this time if you can; if the harness blocks it again, just put the report in your reply.
