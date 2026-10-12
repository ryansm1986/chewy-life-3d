# The maps: the HUD minimap and the big map (ROADMAP UX-1)

The owner's request (2026-10-10): "Can we make the map and mini map much nicer with details. I want to be able to find
people and places easier."

Checkpoint 1 (§8, approved 2026-10-10) covered Blossom Hollow: the new art for both maps, people and place markers, the
People and Places directories, the pin and "Shadow, take me there". Checkpoint 2 (§9) brings the same to zones, dungeon
floors and rooms, adds the filter chips, tones the trees down at full zoom-out and makes the phone's pinned card one
strip.

## 1. What the maps are for
- **Finding people**: who is where right now, who has something for you, and a way to get to them.
- **Finding places**: shops, services, boards, homes, gathering spots, landmarks, gates.
- **Reading the island**: water, shores, paths, plazas, trees, buildings by their roofs, districts, at a glance.
- **Never clutter**: the small disc shows only what's near and what matters; the big map adds names as you zoom in.

## 2. The art (src/world/mapArt.js)
Cozy and in the game's palette: the UI's cream (`#fff6e8`) and ink (`#4a2c2a`), the buildings' own roof colours, the
game's own glyphs for icons. Nothing static is drawn per frame.

### 2.1 The cached layers (VillageArt)
| Layer | What | Drawn again |
|---|---|---|
| Terrain (`art.terrain`) | Per pixel at 2 samples a metre from the heightfield, then drawn up smooth: water by depth (shallow aqua to deep blue, a soft ripple, light streaks), a two-pass foam glow at every shore (the land's silhouette cast as a white glow into the water), grass in meadow patches with a cooler green up the hills, soft relief lit from the north-west (warm lit faces, lavender shade), sand, warm stone on the cliffs, the garden's soil rows, the districts' soft tints (opened rings in their colour, locked ones lilac) | when the land's tiles change (a hash over every tile but paths and plazas), or a ring opens |
| Composite (`art.base`) | The terrain, then the paving (paths and plazas from a blurred tile field cut at two levels: a warm edge and the paving, with a cobble's worth of variation, so streets are smooth strokes with round corners), the stub streets of rings not open yet (dashed), the garden's fence, the woodland floor (every tree's shade at a metre a pixel, drawn up soft: woods read darker the denser), trees as soft crowns (a shade side, the crown, a lit side; sakura, momiji, pine, round, ginkgo, bamboo, bushes; lily pads), and every building: a shadow on the camera side, the roof in two planes about its ridge in the model's own colour (`roofColor(b)`: the variant's roof, or the player's remodel), an ink line; bespoke marks for the fountain, parks, farms, the Burrow's torii and hill, bridges and small decor | on `village:changed` and `garden:till` (`provider.dirty`) |

5 canvas pixels a metre (1120² on the 224 m island); 4 on the Low and Mobile presets. Timings on the dev machine: the
terrain 48 ms, the composite 12 ms (both lazy: the next draw after a change).

**The far copy** (`art.baseFar`, checkpoint 2, the owner's call: "tone them down a bit"): the same ground and buildings
with softer trees (three crowns in four, smaller, a third of the way to the grass under them, no lit side, a stronger
woodland wash), so the buildings and marks stand out at full zoom-out. The big map shows it up to zoom 1.4 and
cross-fades to the full detail by 2.2; the HUD disc always shows the full detail.

### 2.2 The marks (drawn each frame, upright, pre-rendered once into small canvases)
| Mark | Look | Notes |
|---|---|---|
| You | the HUD's pink arrow with a white rim | turned to your facing |
| Shadow | the black Boston terrier's head: bat ears, white blaze and muzzle | |
| A named villager, a hero, Old Hachi | a pip in their colour (their outfit's), a white rim, their initial | 5.5 px on the disc, 7 on the big map |
| Townsfolk, hires | smaller pips; letters on the big map past zoom 2.2 | |
| Something for you | a gold `!` on the pip (`story.markerFor`: a talk step, Moka waiting) | also `?` (their quest is on) and a pink ♥ (a friendship gift) |
| A place | a cream token ringed in its category's colour with the game's glyph (`ui/glyphs.js`, `cozy:` for `ui/cozyIcons.js`) | Rosie's Treats a mochi, shops an awning, the Guild a shield, the Burrow an oni, boards a scroll, the Expedition Board its board, the Wayfarer's Post a map, … |
| A landmark | its name on the map (water names blue) | the plaza, the market square, the pond, the river, the beach, the bridge, the waterfall, the bamboo, Shrine Hill |
| The pin | a pink teardrop with a white dot and a pulse round its foot | |
| The quest objective | the gold star (as before) | the objective under the pin (`G.questTarget.base`) |
| Off the disc | a pin-pink (the pin, with its distance in metres) or gold (the objective) arrow on the rim, pointing out | |
| Shadow's dig spots, gather nodes, a quest dig | as before (`scavMarks`) | nodes on the big map only |
| District names | as before, fading out as you zoom in; a locked ring's "opens at rank N" | |

The Key tab on the big map draws every one of these with the same code (`ui/mapDir.js drawSwatch`).

### 2.3 A zone (RegionArt, checkpoint 2)
Painted once as the region is entered (behind the iris): the region's own map colours (`RegionWorld.mapColor`: grass,
moss, litter, sand, snow, rock, ice, water by depth) at two samples a metre (one on the light presets) with soft relief,
the foam at every shore, the thickets (cells nobody walks) as soft darker masses, the glades as sunny clearings with a
few flowers, the trail as a smooth path in its own stone, the zone village (its square; each house's footprint turned
as it stands, its roof in the village's own map colour `theme.MAP`, its lanterns) and the dungeon's gate. About 80 ms on
the dev machine.

### 2.4 A dungeon floor (DungeonArt, checkpoint 2; the dungeon pass after the director's review)
Painted once on the floor's entry (behind the iris): a blurred walkable field cut at three levels (the floor, a wall rim
inked in the theme's wall colour, its mossy or icy top, then the dark rock). The floor is one clean warm tone (the
theme's first) with a very soft tone drift, the rooms' tints (the start warm, a treasure room gold, a shrine lilac, the
boss's red) washed in from a blurred cell field, so there are no seams; each band's edge is blended over about a pixel,
so drawn up at full zoom it stays smooth (no steps); the lights are warm pools. About 50 to 65 ms on the dev machine.
- **The flagstones** are not in the bitmap: zoomed in on the big map (from 6 px a metre, full by 11) the floor's own
  outline (`DungeonArt.path`: marching squares on the same field, in metres) is filled with a stone pattern
  (`floorTile()`: a 2 m tile at 64 px a metre, three offset rows, each stone its own faint tone, mortar and a lit edge),
  so they stay crisp at any zoom. Not on the HUD disc.
- **The fog** is the provider's. What you've seen is the floor you could walk to within 7 cells of where you've been (a
  flood over the walkable cells, so a passage behind the rock stays hidden), every cell next to it and the rock two
  cells out, so the fog's edge lies in the rock and never over the inked rim. The fog canvas is four pixels a cell: the
  unseen mask box-blurred twice (round, soft edges; no steps) and cut so it is whole by the seen edge (nothing unseen
  shows through), its edge billowed by a cloud noise, in the floor's own dusk with a soft mottle and a paler mist where
  it thins: where an explored room opens into the unknown, the floor goes into the cloud, not a smear. Each reveal
  repaints only the cells it changed (about 0.3 to 0.5 ms a step, only when new cells come into view). s41 k checks it
  leaks nothing: every seen floor cell joins where you've been through seen floor, and every floor cell with nothing
  seen round it is under whole fog.

### 2.5 A room (InteriorArt, home/interiorMap.js, checkpoint 2)
40 pixels a metre: the floor in its surface's pattern (honey or walnut planks, tatami, checker tiles, river stones), the
rugs (dashed edges), every piece of furniture as a soft rounded shape in its kind's colour with a shadow and a lit top
(the bed's pillow, the stove's fire, the chest's gold band), the back walls in the wallpaper's colour on wood, the
cut-down front walls thin, the door mat. Drawn again when its signature (the surfaces, every piece's spot) changes.

## 3. People and places (src/world/mapData.js)
- `people(G)`: everyone in `G.npcs` (Rosie, the named cast, the heroes in town, Old Hachi, the Guild's hires, the
  townsfolk), you, Shadow, and the heroes and hires out with a crew (listed, no position). Each has a group, a role, a
  colour, an initial, a badge and a priority. Groups: **Something for you** (a `!` or `?`: they move to the top), **Shopkeepers**
  (Rosie, Kuma, Usagi, Tanu, Old Hachi), **Townsfolk** (Mochi, Kitsune, Pan, Kero, the townsfolk), **Heroes**, **Hires**.
- `places(G)`: the village's buildings (homes only when someone named lives there, and your cottage), the interactables
  the directory knows by their label (the Wayfarer's Post, the Expedition and Sightings boards, the workbench, the Spirit
  Lantern, the Seed Stall, Tanu's Trinkets), the full gathering nodes, and the named landmarks. Categories: shops,
  services, boards, homes, gathering, landmarks, gates and regions (the filter chips' layers in checkpoint 2).
- `personWhere(G, e)`: "by Rosie's Treats", "on Pond Walk", "in South Meadows", "Indoors at Usagi's home", "Visiting your
  cottage", "In the Hot Spring", "Away with a crew"; from a zone, a dungeon or a room it starts "In Blossom Hollow ·".
  Distances only where you stand in the same world.
- `tipFor(G, e)`: a mark's tooltip (name; role or what it is; where; how far).
- The village provider caches both lists for 250 ms (both maps and the directory share them).
- **Adding a marker** (for the other features' owners): a village building shows by itself once its type has a row in
  `B_ICON` (its glyph and category; its name and line come from `BUILDINGS[type]`); a village interactable shows once
  its label matches a row in `SPOTS`; a zone's, a floor's or a room's interactable once its label matches a row in
  `HERE` (the name, the line, the glyph, the category, the priority; `seen` for the fog). A new kind also wants a line
  in its area's Key (`KEY_*` in ui/map.js). Floors are named from their mode (the HUD's location, else `D.def.name`),
  never by number.

## 4. The pin (src/world/mapPin.js)
- `G.mapPin.set(entry)` · `clear(why)` · `cur` · `target()` · `lead()`; events `map:pin`, `map:unpin`.
- **`G.questTarget` answers with the pin** after a guide's step (tutorials keep the first word): so the quest arrow, the
  minimap and Shadow all point at it. `G.questTarget.base` is the objective underneath (the maps still star it).
- A person's pin follows them; while they're indoors it points at their door ("Kuma (indoors)").
- Away from the village it points at the way back: indoors the door mat ("Outside · Rosie"), in a zone the Wayfarer's
  Stone, on a dungeon floor the way out.
- It clears when you get there (2.4 m for a person, 3 m for a place, once you've been 4.5 m away: a toast "You found
  Rosie!" / "You're at Rosie's Treats"), on Unpin, when something else is pinned, or when the Journal or the tracker asks
  Shadow to follow a quest (`Lead.toggle(quest)` clears it). Pinning drops the Journal's Follow Shadow focus.
- **"Shadow, take me there"** (`Lead.toPin`, actors/shadowLead.js): R-17's lead, asked for the pin at any Settings › Shadow
  leads the way. The pin's lead key is `m:<entry key>` (current while it's pinned), so he re-plans as a villager walks
  (the lead's own rule: the objective moved 3 m) and stops when the pin clears. The map closes so you can follow him.
- The quest arrow shows the pin's glyph on a pink badge (`.qa.pinned`).

## 5. The minimap (world/minimap.js VillageMinimap, ui/minimapUI.js)
- **Turns with the camera** as before (the default), or **North up**: Settings › Play › Minimap (`ui.settings.mmNorth`).
  The big map follows the same setting. The **N badge** now sits where north really is on the ring.
- **Zoom**: a lens chip on the ring's lower right cycles 28 · 40 · 64 m across (`ui.settings.mmZoom`, default 40, the old
  span); on the village's disc only for now (the zones', dungeons' and rooms' discs keep their span). On touch it is 36 px
  with a reach of 44 px on the phone's 0.62 HUD.
- **Caps** (by priority: the pin, `!`, the named cast, hires, townsfolk; then distance): up to 9 named pips and 6 others,
  8 place badges (no landmarks, no homes but yours, nothing of priority under 3), kept 13 px apart.
- **Edges**: the pin and the objective off the disc sit on its rim, the pin with its distance.
- **Tooltips**: the mouse over a mark names it; a held finger does on touch; a mouse click opens the big map (on the
  mark clicked); a tap still opens it on touch.
- **Night**: a navy multiply over the map and the windows lit (per frame, from the building list in view).
- The HUD draws its own cone and arrow only for the old providers (`provider.ownHud`).

## 6. The big map (ui/map.js MapPanel, ui/mapDir.js)
- **Layout**: the map (560 px; 336 on a phone, its buttons 52 px under the phone's 0.86 menus) beside a side column: where you are, the tabs **People · Places · Key**,
  a search box (the keyboard), the list, and the picked one's card. The panel is 940 px wide.
- **The view**: `view { cx, cz, span }` (world metres), `zoom = homeSpan / span` from 0.8 (or a fitted floor's own) to 6, the centre kept so the
  island fills at least most of the view. The QA's `panels.map.zoom` still reads and sets it.
- **Mouse**: drag pans, the wheel zooms about the cursor, a double click zooms in, a hover names a mark, a click picks it.
  Buttons: zoom in, zoom out, back to you.
- **Touch**: drag pans, pinch zooms, a tap picks a mark.
- **Pad** (CONTROLS §14's convention: LB / RB stay the tabbed menu's pages; the map has no sub-tabs, so LT / RT zoom):

| Button | On the map |
|---|---|
| LS | moves the map under a crosshair in its middle; the mark nearest the crosshair is named (a tooltip) |
| A | pins the mark under the crosshair (after the stick moved the map), else the focused row |
| D-pad | walks the directory's rows and tabs (the stick is the map's here) |
| LT / RT, RS | zoom |
| R3 | back to you |
| Y | "Shadow, take me there" (the focused row; or the crosshair's pick while aiming) |
| X | unpin (the focused row, when it's the pin) |
| LB / RB | the tabbed menu's pages; the map opened alone (View): People · Places · Key |
| B | close |

- **Labels**: district names fade out by zoom 2.7; landmark names fade in from 0.9; place names from 1.3; the named cast's
  names from 2.1, everyone's from 2.9; the picked one's always. Names are placed in priority order and never overlap a
  badge, a pip or another name. They dodge the marks drawn over them (you, Shadow, the pin, the objective's star): a
  name whose spot lies under one moves above its mark, else right, else left (the picked one's too, or it keeps its
  spot when none is clear); a name blocked only by other names or badges is left out, as before. `nameQA` keeps the
  last big draw's name boxes and mark boxes for the QA.
- **Zoomed in** past the cache's detail (k > 1.25 × its pixels a metre), the buildings in view are drawn again crisp.
- **Picking** a person or place (a row, a click, a tap, the crosshair's A): the map glides to them, their mark pulses,
  they're pinned. The card: their name and role, where they are and how far, Pinned, **Shadow, take me there**, Unpin.
- **Opening on a mark**: `ui.open('map', { focus: key })` (the minimap's click).

## 7. The provider contract
A provider is what `ui.minimap.setProvider` takes. Since checkpoint 2 every area's is an `ArtMap` (world/minimap.js):
`VillageMinimap`, `RegionMinimap`, `DungeonMinimap`, `InteriorMinimap` (home/interiorMap.js). The shared renderer draws
the art's base (and far copy) turned and cropped to the view, then calls the area's hooks: `under` (in the turned frame:
the village's crisp buildings, night windows and dig marks; a zone's wild rings, sightings and boss ring; a floor's fog),
`over` (screen space: monsters) and `labels` (district names; a zone's wild areas), with the marks in between. People and
places are drawn only where their `area` is the one you're in. The old shape (`draw(ctx, size, pp, { big, zoom })`)
still works for a provider without `views` (the big map zooms it, no pan). The contract:
- `drawMap(ctx, size, { cx, cz, span, rot }, { mini, big, time, sel, hover, layers })`;
- `homeView()`, `bounds()`, `rot()`;
- `hits` and `bigHits` (`[{ x, y, r, e }]`: the marks of the disc's and the big map's last draws, each in its canvas's CSS
  px: both draw while the map is open, so each keeps its own list), `edges` (the disc's rim marks);
- `lists()` (`{ people, places }`);
- `ownHud` (it draws its own arrow and cone on the disc).

## 8. As built: checkpoint 1 (2026-10-10)
- New: `src/world/mapArt.js`, `src/world/mapData.js`, `src/world/mapPin.js`, `src/ui/mapDir.js`, `src/ui/minimapUI.js`,
  `src/ui/map.css`, `tools/qa/s41-maps.mjs` (in run-all: parts a–i, §9's parts join it), `tools/qa/map-shots.mjs` (before / after shots: desktop 1600×900, the Deck 1280×800 with `&deck`, a
  phone 844×390 at DPR 3; the village, a zone, a dungeon floor and an interior; the HUD, a minimap crop, the map, the
  People and Places picks, the Key, the market zoomed in, the pin on the HUD).
- Changed: `world/minimap.js` (VillageMinimap rewritten on the new art; `mapRot`, `MM_SPANS` exported; the dungeon,
  region and interior providers unchanged), `ui/map.js` (MapPanel rewritten; the Journal unchanged), `ui/padNav.js` (the
  map's pad: `padFrame`, `padHints`, the D-pad only for the focus there, the row handler, the start focus), `ui/hud.js`
  (one line: an `ownHud` provider draws its own cone and arrow), `ui/ui.js` (the minimap UI, the two settings),
  `ui/menu.js` (Settings › Minimap), `ui/questArrow.js` (a target's own icon, `.pinned`), `actors/shadowLead.js` (the
  pin's key, `toPin`, `askNow`; a quest asked for by name clears the pin), `game.js` (`installMapPin`, the pin's tick).
- **Perf**: the HUD disc's draw is 0.07 ms on its own (measured per frame in a quiet page) and 0.11 to 0.65 ms inside the
  game's frame on the dev machine with its GPU shared (noisy; s41 i: 0.114 ms a draw, 0.027 ms a frame at its 15 draws a
  second). The lists cost 0.1 ms four times a second. The big map draws at 20 Hz while open (each frame while dragging or
  gliding). Both maps draw at the device pixels times the UI's CSS zoom (sharp under the Deck's 1.15), the marks cached
  at 2× at least.
- **Debug** (Village › The maps): pin Rosie, pin the farthest place, clear the pin, repaint, the timings (docs/DEBUG.md).
- **QA** (2026-10-10): test-rpg; s41 10/10; s13 10/10, s23 48/48, s25 45/45, s32 12/12, s33 29/29, s40 32/32; deck-ui,
  mobile-ui, desktop-ui and prod-smoke pass. s39 25/26: e) "he drops the lead and fights at once" fails the same way on
  HEAD (54dccd1, run on its own worktree): when the hero has walked past his stop before the pack wakes, the lead's state
  stays `heel` through the fight (his combat AI runs instead of `tick`), so the check never sees `fight`. Not UX-1's.
- Shots: `tools/qa/tmp/ux1/before/`, `tools/qa/tmp/ux1/after/`.

## 9. As built: checkpoint 2 (2026-10-11)
The owner's calls on checkpoint 1: carry on with zones, floors and rooms in the same style; keep the pin at once; tone
the trees down a bit at full zoom-out (§2.1's far copy). The director's: the phone's pinned card as one strip, and s39 e)
fixed (below).
- **Areas** (`mapData.js`): `areaKey(G)` ('village', 'zone:<id>', 'dun:<dungeon>:<floor>', 'room:<building>'); every
  entry carries its `area`. `zonePeople` (the zone village's villagers: their role, the shop they keep, their `!`),
  `herePlaces` (the world's interactables by their label: chests, the stairs, the portal home or the way out, the
  Wayfarer's Stone, the dungeon, shrines, the waypoint, the campfire, the Sightings board, the Spirit Lantern, the
  zone's shops, inn, dojo and houses, its old shrines, the gathering nodes; indoors the bed, the stash, the kitchen, the
  workbench and the door; plus the layout's own: a zone's village, wild areas and the boss's clearing, a floor's boss
  room and waypoint). A chest, the stairs, a shrine or the boss show once their spot is seen.
- **People**: the area's own people head the list under its name ("Takemori Village", "In this room"); Blossom Hollow's
  stay listed below them, "In Blossom Hollow · …", their distances only from the village.
- **The pin**: an area's own entries are pinned there and let go when you leave (`map:unpin` 'left'); the village's
  still point the way back from anywhere (§4).
- **Zones**: the whole region is painted (a zone is a place with a trail and a village, so no fog over the land; the
  reveal still gates the chests, shrines and the boss's clearing). Its wild areas' rings, today's sightings and the
  monsters near you as before.
- **Dungeon floors**: §2.4's floor, flagstones and fog; the stairs, chests, shrines, the boss and the waypoint as badges
  once seen (an opened chest or a used shrine stays, dimmed: "Chest (opened)", "Shrine (used)", from the layout's
  chests and shrines with no interactable left); the portal home always; monsters near you (a boss red, uniques gold,
  champions blue). The big map's home view fits what you've seen at the map's turn (a floor turned 45° needs more
  across), moved into the part of the map its zoom buttons and chips leave free (`MapPanel.fitFree`: a phone's buttons
  take a fifth of its map), and the floor's names read from there out.
- **Rooms**: §2.5; the guests visiting as pips in People ("visiting").
- **The Key**: one per area (village, zone, floor, room), every mark drawn with the maps' own art (`drawSwatch`), and
  drawn again once a glyph has loaded (`markVersion`).
- **The filter chips** (People · Shops · Services · Quests · Gathering · Wild) along the big map's foot, kept in
  Settings' `mapLayers`; a chip with nothing of its kind on this map is greyed and disabled (the provider's
  `layerCounts`, counted as its lists refresh: Wild in the village, Shops, People and Wild on a floor); each hides its kind on both maps (Services: services and boards; Quests: the objective's star,
  the `!` flags and quest digs; Gathering: workshops, gathering spots, nodes and Shadow's digs; Wild: the wild rings and
  sightings). Homes, landmarks, gates, the pin, Shadow and you always show; People off still shows anyone with a `!`
  while Quests is on. On touch they're icon chips (48 px, a 44 px reach on a phone).
- **The phone's pinned card** is one strip: "Rosie · 9 m", Take me there, ✕ (52 px buttons under the phone's 0.86).
- **s39 e)** (it failed on HEAD too): a fight now drops the lead from `heel` as well (`Lead.watch`), so a hero who
  walked on past his stop into the pack has him fighting at once, and leading on after the calm.
- **The lens chip** zooms every area's disc now (a room's span scales with the room).
- **The art behind the iris**: a zone's and a floor's art paints as its provider is made (mid-transition, where a hitch
  hides), not on the first draw after it.

### 9.1 The dungeon pass (the director's review of checkpoint 2, 2026-10-11)
The village, the zone, the room and the phone's pin strip were approved and locked; the floors were about 7/10. Done:
- **The floor** (§2.4): one clean warm tone with the rooms' tints washed in (no seams), the band edges blended so they
  stay smooth drawn up, the light pools a warm wash (never lighter), the inked rim kept; **flagstones** as a pattern
  clipped to the floor's outline on the big map, crisp at any zoom.
- **The fog** (§2.4): a flood reveal over the walkable cells (nothing behind the rock), painted at four pixels a cell,
  blurred twice and cut whole at the seen edge, billowed by a cloud noise with a paler mist where it thins; repainted
  only where a reveal changed it. s41 k: 0 seen floor cells out of reach, 0 of 796 deep unseen ones under thin fog.
- **Names dodge the marks** (§6 Labels): no name under you, Shadow, the pin or the star ("Portal home", "The way out"
  move above, right or left); the overlap test between names was fixed too (it read a box's far corner as its size, so
  names were dropped that had room: zoomed in, the village shows a few more names, none overlapping). s41 n.
- **Opened chests and used shrines** stay on the map, dimmed ("Chest (opened)", "Shrine (used)"), with a line in the Key.
- **The chips** with nothing of their kind on this map are greyed and disabled (s41 m, n).
- **The home view** of a floor fits what you've seen at the map's turn and inside the part the buttons and chips leave
  free (a phone's buttons covered the floor's left edge and its pin).
- **The explored floors' shots** (`tools/qa/map-shots.mjs` xdun: the Burrow's floor 6, its waypoint, stairs, chests, an
  opened one and its shrine; xboss: floor 5, the boss's room; `dseed=2`, `QS_XDUN=…` / `QS_XBOSS=…` for another floor):
  sheets `tools/qa/tmp/ux1/explored-xdun.png`, `explored-xboss.png`, `compare3-dungeon.png`, `compare3-zdun.png`,
  `compare3-village.png`.
- **QA**: test-rpg; s41 16/16 (j's lead now starts at the Wayfarer's Stone: a spot picked round the villager could land
  in a pocket the thickets close off, or by a wild pack), s39 26/26, s1, s13, s22, s23 48/48, s25 45/45, s30 24/24,
  s32 12/12, s33 29/29, s35 32/32, s40 32/32, s19 55/55; deck-ui, mobile-ui, desktop-ui and prod-smoke pass (deck-ui
  and mobile-ui failed once each with four browsers on the machine and passed alone). The horde (`profile-horde
  --quick`, the disc up) on a busy machine (other programs up to 82% of the CPU, another game holding the GPU): Burrow
  @150 p50 8.6 ms (HEAD 8.1 to 8.6 this morning), p95 15.5, failing the gate as HEAD did under load; the disc's draw on
  a floor 0.25 ms with 80 monsters (0.06 ms a frame). The full run-all (on a snapshot of checkpoint 2, before this pass):
  38 of 42 pass; s19 (two double-taps), s30 (the Haunted ghosts), s35 b (seven taps) and the horde gate failed under the
  load and pass on their own (s19 55/55, s30 24/24, s35 32/32).

### 9.2 Follow-ups (2026-10-11, after checkpoint 2's approval)
- **The Stash Chest** (R-18, the storage agent's buildable `stashChest`): a Services place on both maps (the `chest`
  glyph; `B_ICON`, `PRIO` 5), "The shared stash · every chest opens it", and a line in the village's Key. Several can be
  built: the maps show each, the Places list one row (`TWINS` in mapData.js: the nearest, or the pinned one, "the
  nearest of 2"); picking it pins that chest. Sheet `tools/qa/tmp/ux1/stash-chest.png`.
- **The Burrow's dens** (Z-H1): the Burrow door's line reads the dens (`densLine`: "Four dens: pick one at the door",
  "Dens cleared: 2 of 4 · next, Oni's Kitchen", "All 4 dens cleared"), read only from `state.dungeon.dens`. A floor's
  title is the den's name (the HUD's location); its area key `dun:<den>:<floor>` (the fog and the pin are per floor).
  The explored-floor shots enter the dens by id (`DEN_XDUN=foxShrine:1`, `DEN_XBOSS=mossyBurrow:2`, `dseed=6`).
- **The Town Portal's other end** (Z-H2, dungeon/townPortal.js): while a portal is open, a place by the plaza on both
  maps (the `portal` glyph in a violet ring, Gates and regions, priority 9): "Town Portal · Back to the Fox Shrine,
  floor 2", from its interactable's label (a `SPOTS` row with its catch). It comes and goes with the interactable: the
  lists refresh at once on `portal:village`, and a pin on it is let go when it closes. Picking it pins it; Shadow leads
  to it as to any place. A line in the village's Key. Sheet `tools/qa/tmp/ux1/town-portal.png`.
