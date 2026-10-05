# Chewy Life 3D 🐶🌸

A cozy, hand-painted **3D isometric** village life-sim in the spirit of *Hello Kitty Island Adventure*, with
**SimCity-style village planning** and a **Diablo 2-style dungeon crawler** — starring **Chewy** the chocolate pup,
his Boston terrier sidekick **Shadow**, and **Rosie**, a little girl with curly brown hair who runs the village treat shop.

## Play
- Double-click **`Play Chewy Life.cmd`** (installs dependencies the first time, builds the game in about a second, then opens it in your browser at http://localhost:4173), or
- `npm install` then `npm run dev` and open http://localhost:5173

Chrome / Edge recommended (WebGL2). Saves automatically to the browser's local storage.

## Controls
| Key / Mouse | Action |
|---|---|
| **WASD** or **click** | Walk (hold the mouse to keep walking) |
| **F** / click a villager | Talk · interact (shops, chests, shrines, portals, stairs) |
| **F** at a door | Go inside: Chewy's Cottage, or a villager's home when you're friends (at night: knock) · **F** on the door mat (or walk out) to leave |
| **F** at a mailbox | The house card: **Upgrade** · **Remodel** · **Enter** (also: click a house in Build mode) |
| **F** at your garden bed | Till · plant (pick a seed: **1–9**) · water · harvest — whatever the tile needs |
| **F** facing water | Fish: **F** when the float dips, then **hold F** (or the mouse) to keep the fish in the green |
| **LMB on a monster** · **Shift+LMB** | Attack with your left-click skill |
| **RMB**, **1–4** | Cast hotbar skills at the cursor (hold to keep casting / channel) |
| **Space** | Dodge roll |
| **Q / E / R** | Heart Treat · Zoom Juice · Rejuvenation |
| **X** | Swap **Bone Sword** ⇄ **Red Tennis Ball** |
| **G** | Eat your quick meal (the last dish you ate) |
| **Tab** | Switch heroes (Chewy ⇄ Moka) |
| **I · P · C · K · J · M** | Bag · Pantry · Character · Skills · Journal (quests, Fish Log) · Map |
| **B** | Build mode (village): place buildings, paint R/C/W zones, lay paths, bulldoze · **R** rotate |
| **B** indoors | Decorate: pick from storage, click to place / pick up · **R** rotate · **Delete** store · **Ctrl+Z** undo · WASD pans |
| **T** | Return to the village from the Burrow |
| **Mouse wheel** | Zoom · **Esc** menu / close |

## What's inside
**Blossom Hollow (the village)**
- Painterly toon renderer: soft terminators, lavender shadows, sun-side rim light, brush-stroke texture, drifting cloud shadows, bloom, AO and tilt-shift.
- Japanese vegetation that sways with rolling wind gusts: sakura, momiji maples, cloud-pruned pines, bamboo groves, hydrangeas, azaleas, susuki grass, flower meadows and a GPU grass field that parts around Chewy and Shadow.
- A full day/night cycle: golden-hour light shafts, sunsets, moonlit nights with glowing windows, lanterns and fireflies. Drifting sakura petals, butterflies, koi in the pond and chimney smoke.
- **Village planning**: paint *Homes*, *Shops* and *Workshops* zones and villagers build (and upgrade) there on their own when there is demand (RCI meter). Buildings need path access, water and joy to grow; services (wells, lanterns, parks, shrines, onsen, clinic, school) cover an area — toggle coverage overlays in build mode. Daily income from rent, shops and workshops. Village ranks unlock more buildings.
- Humanoid animal villagers (cat, bunny, bear, fox, panda, tanuki, frog, duck…) with friendship hearts, daily chats, gifts they love, and requests. New townsfolk move in as homes fill up.
- Rosie's story questline, Rosie's Treats shop, Blossom Hall ledger, notice board and the Bonesmith (reforge, sockets, tier upgrades).

**Homes (housing)**
- **Go inside**: Chewy's Cottage (the bed, the treasure chest, the kitchen stove and the workbench are furniture you use with *F*; the benched hero is often home) and the named villagers' homes, each furnished to their personality — Kuma's bakery kitchen, Kitsune's shrine corner, Kero's lily tub…
- **Decorate** (*B* indoors): 73 cozy pieces in seven sets (Cottage Basics, Tea House, Bamboo Grove, Maple Hollow, Tidepool, Onsen Lodge, Festival), on the floor, rugs, tabletops, the walls and the ceiling, plus wallpapers and floors. Every room has a **Home Rating** (★–★★★★★) with a tip on what would make it cosier.
- **Getting furniture**: **Tanu's Trinkets** on Market Street (a daily stock, buy-back at half price), the **workbench** (14 recipes: in the cottage and at the Lumber workshop) and rare **finds** in the regions and the Burrow.
- **Decorating for others**: villagers ask for help ("2 warm things and a rug", "make it a 4-star home"), love new stars (hearts) and, at three hearts, invite you to redecorate any time. A better-rated home is a happier one.
- **Upgrades and remodels**: every home has a mailbox. **Upgrade** a house (the builders' scaffold goes up and it grows, keeping its look and everything inside — the cottage too, to three levels); **Remodel** its outside with a live preview: four style sets (Machiya, Cottage, Tea House, Seaside) or any mix of roof, walls, trim, door, windows, noren, fence and festival bunting.

**Guided tutorials**
- Shadow shows you around Chewy's Cottage and the garden and then helps you make it home (decorating), Moka teaches you to switch heroes, Kero walks you through your first catch, and Tanu shows you how to remodel a house: a speech card, an objective card with *Skip*, bouncing arrows in the world and spotlights on the buttons that matter. Replay any guide from the Journal's **Guides** tab.

**The homestead (farming, fishing, cooking)**
- **Farming**: till, plant, water and harvest in Chewy's garden bed and the village's Veggie Patch fields. Eight crops grow a stage every watered night (a dry day only waits; nothing dies), strawberries keep fruiting, and sprinklers water their neighbours. Seeds come from **Usagi's Seed Stall** and as loot in the Burrow.
- **Fishing**: Kero's quest gives you a rod. Cast at any pond, river or beach (and the regions' waters; ice-fish on the frozen pond of Yukimi Onsen), wait for the bite, then win the reel minigame. There are 15 fish by place, time of day and rarity, with sizes, records and a **Fish Log** in the Journal; Kero gives gifts at milestones and buys fish.
- **Cooking**: 15 recipes in your cottage kitchen, at campfires in the Burrow and the regions, or baked in Rosie's oven. Learn recipes from friends, quests and Rosie's cookbook, or discover them with *Try a mix*. Dishes heal and give a **Well Fed** buff (Hearty, Swift, Strong, Lucky, Zen) that follows you into the Burrow.
- **The Pantry** (P) holds it all. Villagers love their favourite dishes as gifts, ask for crops, fish and dishes, and the shops buy them: Rosie dishes, Kero fish, Usagi crops.

**The Burrow (the dungeon)**
- Procedurally generated floors across four biomes — Mossy Burrow, Crystal Grotto, Fox Shrine Tunnels, Oni's Kitchen — with torches, glowing mushrooms and crystals, light shafts, breakable pots, chests, shrines, waypoints and stairs down.
- Cute yokai monsters (mochi slimes, dust bunnies, kinoko, lantern ghosts, kasa-obake, fox-fire wisps, oni imps, tanuki bandits) in packs led by **champions** and **uniques** with D2-style modifiers (fire enchanted, frosty aura, teleporting, vampiric…).
- Bosses every 5 floors: **King Mochi**, **Lord Karakasa**, **Oni Chef Gorobei**, **Tamamo the Nine-Tailed**.
- **Three skill trees × 7 skills** (Bone Arts, Fetch Mastery, Pack Spirit) with synergies, 60 levels, stat points.
- **Loot**: normal / magic / rare / unique / set items with affixes, sockets and treat gems; loot beams for rares+; potions, materials and coins.
- **Shadow** fights by your side, faints and gets back up; call spirit pups, throw squeaky decoys and heal with treats.

## Tech
Three.js r186 + Vite, plain ES modules, all art procedural (no image assets): characters, buildings, vegetation, monsters,
icons and portraits are generated in code; all music and sound effects are synthesized with the Web Audio API.
Dev pages live under `/?test=…` (`sandbox`, `chars`, `monsters`, `dungeon`, `buildings` (`&style=all`), `ui`, `rpg`, `audio`, `portraits`, `furniture`, `furnsheet` (catalog sheets and room vignettes), `stall`, `upgrade`).

## Testing
- `node tools/test-rpg.mjs` — ~4.9M checks on items, affixes, stats, levelling and drop tables, plus the homestead's math (pantry, recipes and mixes, Well Fed, growth, fish, the reel) and housing's (the furniture catalog, room shells, placement rules, the Home Rating, owners, styles, interiors growing, the shop, recipes and finds).
- `node tools/qa/prod-smoke.mjs` — builds the game, serves the bundle and checks the UI/audio load with no errors (run before shipping launcher changes)
- `node tools/qa/run-all.mjs` — browser scenario suite (needs `npm run dev`): village↔Burrow round trips and leak checks,
  combat stress with every skill, all four bosses, death, village sim + save/load, inventory edge cases, dialogue/story,
  input edge cases, the regions, the village plan, the homestead (s15: farming, fishing, cooking), the guided tutorials (s16), housing (s17: interiors, decorating, villagers' homes, ratings, requests, upgrades, remodels, the housing guides) and getting furniture (s18). Each scenario (`tools/qa/s*.mjs`) can also run on its own.
- `node tools/qa/village-perf.mjs 2` / `node tools/qa/homestead-perf.mjs 2` / `node tools/qa/housing-perf.mjs 2` — frame-time snapshots (the village; a full garden and a reel in progress; entering homes, a 60-piece room, remodels).
- `node tools/shot.mjs --url "/?..." --out name` — headless screenshot harness used for visual iteration.
