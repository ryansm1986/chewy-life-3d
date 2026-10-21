# The inventory grids: the bag and the stash (ROADMAP R-19, R-20, R-21, R-22)

Status: **built** (2026-10-11). Checkpoint 1: the storage model, the stash's tabs, the Stash Chest (docs/HOUSING.md §10,
docs/VILLAGE_PLAN.md §14). Checkpoint 2: item sizes, Sort and the stash's filter, Lost & Found, and Treats.

## 1. The owner's requests (2026-10-11)
- R-19: "I'd also like to be able to upgrade to more stash tabs." (docs/HOUSING.md §10)
- R-20: "I'd also like to move to a more Diablo style inventory system where items take up different sizes. I don't want
  it to be as egregious as Diablo 2, but like a shirt should be at least two squares. A sword should take up two
  squares. Small items like rings or whatever can take up one, but we need to be able to put more of an emphasis on
  inventory management."
- R-21: "I'd also like to add a sort stash or sort inventory option. So items can easily be sorted. I'd also like filter
  options for stash. So it will only display items of a certain type."
- R-22: "I want to rename gems to something more on brand." The owner's pick: **Treats**.

## 2. The storage model
- **Every container is a grid of placed items**, stored by anchor in a flat array: `cells[off + y * w + x]` holds the
  item whose top-left cell is (x, y); the other cells its footprint covers stay null. So the save keeps its shape.
  - **The bag**: `state.inventory`, one 10 × 4 grid (`bagGrid(st)`). Kept at 10 × 4: the point is more management.
  - **The stash**: `state.stash`, one 10 × 6 grid per tab; tab t is indices `[t * 60, t * 60 + 60)` (`tabGrid(st, t)`).
  - **Lost & Found**: `state.lostFound`, a 10-wide grid in pages of 10 × 6, absent when empty (`lostGrid(st)`).
- **`src/rpg/grid.js`** (pure, node-tested): `itemSize(item)` → `[w, h]`; `cover(g, ignore)` (which anchor covers each
  cell); `fitsAt(g, item, x, y, ignore)` → `{ ok, out, under }`; `findSpot(g, item)` (top-left first, row by row);
  `placed(g)` → `[{ item, i, x, y, w, h }]`; `gridProblems` (overlaps, footprints off the grid); and Sort's
  `sortGroup`, `packOrder`, `packGrid`.
- **`src/rpg/stash.js`**: the tabs, `stashSpot` / `stashPut`, Lost & Found (`lostPut`, `lostTidy`), `stow` (the bag,
  then the stash, then Lost & Found), and the save migrations (`migrateStash`, `packSave`).

## 3. The sizes (`WEAPON_SIZE`, `SLOT_SIZE`; nothing over 4 cells)
Checked against every base in `src/rpg/items.js` (test-rpg: every gear base has a size of 1–4 cells).

| Footprint | Items |
|---|---|
| **1 × 1** | collars and charms (the jewellery), the tennis balls (Chewy's ball weapons), treats, keys, gifts and anything else that isn't gear |
| **1 × 2** (tall) | swords (every Bone Katana), the Shih Tzu's flails |
| **2 × 1** (wide) | hats, boots, paws |
| **2 × 2** | outfits (the shirt), Poe's fūma shuriken |
| **1 × 3** (tall) | Moka's staffs, the dragoon's lances |

Calls against the starting table: **boots and paws are 2 × 1** (a pair side by side) rather than 1 × 2: their icons are
a pair, and on a 4-row bag two 1 × 2 pairs crowded the weapons' columns. Materials and potions never enter the grids
(they're counters and the belt).

## 4. The rules everywhere an item moves (G.actions)
- **`moveItem(from, to)`**: a grid ref's `i` is the anchor the item goes to. Onto free cells it goes there; onto exactly
  one item a stack of the same joins it, else the two **swap** (the other goes back where the first came from, else the
  first spot with room) and the result is `{ swap: ref }`, so the UI hands you the other one, as in Diablo; onto two or
  more, off the grid or into Lost & Found it refuses.
- **equip** puts the old piece where the new one was if it fits, else the first spot with room (no room: refused);
  **unequip**, **pickup** and **buyItem** need a spot that fits ("No room in your bag"; a buy costs nothing then).
- **Loot on the ground** with no room stays there with "No room in your bag" (once, as before).
- **Rewards and finds** (`story.giveItem`, `actions.stowItem`): the bag, then the stash ("sent to your stash"), then
  **Lost & Found** ("waits in the stash's Lost & Found"). **An item is never lost.**
- The quick move (Ctrl+Click, the pad's X) and right-click go to the first spot that fits, top-left first (the stash's
  open tab first, then the first tab with room).
- **The Bonesmith** writes the reworked item back into its own anchor (the footprint is the same base's slot or type).

## 5. Lost & Found
- A tab of its own (amber, a chest glyph) after the bought tabs, while it holds anything. It doesn't count against the
  six, it **only gives back** (nothing can be put in), and it's gone once it's empty. It grows a page of 10 × 6 when it
  fills. Its footer says "Rewards and finds that found no room wait here".

## 6. The grid on screen (ui/inventory.js `layoutGrid`, ui/itemGrid.css)
- Each item's anchor cell spans its footprint (CSS grid `grid-area`) and shows the item's icon drawn into it (rpg/icons.js
  `itemIconSized`: the art re-composed for the footprint; a long weapon stands upright in a tall one, scaled to fill it,
  with the same cream sticker rim and rarity glow). The cells it covers hide. The paper doll's weapon stands upright too.
- **The drag**: the held item rides the cursor at its footprint's size. Over a grid, its footprint shows where it would
  go, centred on the pointer: **green** onto free cells, **gold** onto exactly one item (a swap), **red** where it can't
  go. A click or a release puts it there.
- **The pad**: the focus steps by cell and an item is one stop (padNav's spatial walk over the slot elements, which are
  the items); the held item's footprint follows the focus (its top-left at the focused cell, kept on the grid).
- **Touch**: a tap picks up; a press over the grid shows the footprint under the finger; lifting puts it down.
  A long press shows the tooltip (as before).
- Socket dots wear their treat's colour.

## 6b. The green arrow and Power (UX-3)
- A cell with gear that is better for the hero being played, or fills an empty slot, and that the hero can wear now
  shows a bobbing green ▲ in its corner. This applies to the bag, the stash and Lost & Found. Each item tooltip leads with
  its Power and a better / worse verdict. See docs/STATS.md §1.

## 7. Sort (R-21)
- A **Sort** button on the bag (its old one, now this) and on the open stash tab; **R3** on the pad in either (the hint
  bar says "R3 Sort"). Touch: the buttons (44 px).
- The order (`packOrder`): the type group (weapons, outfits, hats, paws and boots, collars and charms, treats, the
  rest), then the biggest footprint first within it (so it packs tidily), then rarity (set, unique, rare, magic,
  normal), then item level, then a fixed tie-break (base, name, uid).
- The packing (`packGrid`): each item at the first spot it fits **after the one before it**, else in a gap before it, so
  the groups read left to right and down. If the type order leaves gaps it can't fill, it packs the biggest first
  whatever the type; if even that can't fit (it shouldn't happen), nothing moves and a toast says so. Sorting twice gives
  the same layout; it never drops an item.

## 8. The stash's filter (R-21)
- Chips under the drawer: **All · Weapons · Armour** (hats, outfits, paws, boots) **· Jewellery** (collars, charms)
  **· Treats · Other**. An item that doesn't match fades strongly and takes no hover or pick-up; it keeps its place (the
  grid stays spatial), and nothing can be dropped onto it (its footprint shows red).
- Each tab's header counts its matches. The choice is remembered on this device (`localStorage['chewy3d.stashFilter']`,
  in try/catch). On a phone the chips are icons (the open one named), 44 px on the screen.
- The bag has no chips: the owner asked for the stash, and the bag's footer has no room on the phone.

## 9. Treats (R-22)
- Gems are **Treats** wherever the player reads them; the code keeps its names (`kind: 'gem'`, `GEMS`, `makeGem`,
  `gemType`, the sfx). "Socket" stays: you socket a treat.

  | Was | Now |
  |---|---|
  | Ruby Jerky | Ruby Jerky |
  | Blueberry Gem | **Blueberry Bite** |
  | Lemon Drop | Lemon Drop |
  | Stinky Cheese | Stinky Cheese |
  | Diamond Biscuit | Diamond Biscuit |
  | Honeycomb Topaz | **Honey Chew** |

- **Tiers** (`GEM_TIERS`): Chipped → **Crumbly**, the plain tier unnamed, Perfect → **Gourmet**. The tooltip's subtitle:
  "Crumbly Treat", "Treat", "Gourmet Treat".
- **The icons** (rpg/icons.js `drawTreat`, `drawGem`): a jerky strip, a blueberry bite with its crown, a wrapped lemon
  drop, a cheese wedge with its whiff, a baked bone biscuit with icing and a sugar diamond, an amber honey chew with a
  drip. Each keeps its colour. Crumbly is a broken piece (a jagged bite out of it, inked) with crumbs; Gourmet is whole
  with a gold ribbon bow, sparkles and a glow.
- **The dropped treat** (combat/groundLoot.js `treatGeo`): the same six in 3D, a Crumbly one smaller and a Gourmet one a
  little bigger and brighter. (The briefing said dungeon/lootModels.js, but that file holds the chests and pots; dropped
  treats are drawn by groundLoot.js.)
- **The save**: `renameTreat` (items.js) gives every treat its name from its type and tier, in the bag, every stash tab,
  Lost & Found and socketed in every hero's gear; normalizeHeroes runs it on every load. Idempotent.
- Elsewhere: the Sightings bounty's chip ("a treat", a candy glyph `treat`), the debug menu's **Treats** grant.

## 10. The save migration (R-20)
- `packSave` (rpg/stash.js), once per save (`state.gridV < 1`): every stash tab and the bag are packed in Sort's order;
  what doesn't fit in its own tab or the bag goes to the stash's first tab with room, then Lost & Found. Later, any grid
  whose footprints overlap or hang off it is repacked the same way. **Never drops an item**; a second load leaves a
  packed save alone (`gridV: 1` on a new game).
- s44 h) and s45 i) load real saves and count the items before and after (uids, exactly); test-rpg checks the packer.

## 11. QA
- `tools/qa/s45-inventory-grid.mjs` (in run-all): footprints, the drag's red / gold / green and the swap, the quick
  move and Lost & Found, no room (loot, a shop, rewards), Sort (the bag, a tab, R3), the filter, the pad, touch, Treats
  and an old save's rename and packing.
- `tools/qa/s44-stash.mjs`: the stash's tabs and chests; its migration check counts items and checks Sort's order.
- test-rpg: "ITEM SIZES, SORT, LOST & FOUND, TREATS".
- Shots: `tools/qa/stash-shots.mjs grid treats` (the grids on the desktop, the Deck, a phone and an iPad; carrying a
  2 × 2 red and green; Sort before and after; each filter; Lost & Found; the treat sheet; treats on the ground).
