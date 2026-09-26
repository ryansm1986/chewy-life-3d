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
| **LMB on a monster** · **Shift+LMB** | Attack with your left-click skill |
| **RMB**, **1–4** | Cast hotbar skills at the cursor (hold to keep casting / channel) |
| **Space** | Dodge roll |
| **Q / E / R** | Heart Treat · Zoom Juice · Rejuvenation |
| **X** | Swap **Bone Sword** ⇄ **Red Tennis Ball** |
| **I · C · K · J · M** | Bag · Character · Skills · Quests · Map |
| **B** | Build mode (village): place buildings, paint R/C/W zones, lay paths, bulldoze · **R** rotate |
| **T** | Return to the village from the Burrow |
| **Mouse wheel** | Zoom · **Esc** menu / close |

## What's inside
**Blossom Hollow (the village)**
- Painterly toon renderer: soft terminators, lavender shadows, sun-side rim light, brush-stroke texture, drifting cloud shadows, bloom, AO and tilt-shift.
- Japanese vegetation that sways with rolling wind gusts: sakura, momiji maples, cloud-pruned pines, bamboo groves, hydrangeas, azaleas, susuki grass, flower meadows and a GPU grass field that parts around Chewy and Shadow.
- A full day/night cycle: golden-hour light shafts, sunsets, moonlit nights with glowing windows, lanterns and fireflies. Drifting sakura petals, butterflies, koi in the pond and chimney smoke.
- **Village planning**: paint *Homes*, *Shops* and *Workshops* zones and villagers build (and upgrade) there on their own when there is demand (RCI meter). Buildings need path access, water and joy to grow; services (wells, lanterns, parks, shrines, onsen, clinic, school) cover an area — toggle coverage overlays in build mode. Daily income from rent, shops and workshops. Village ranks unlock more buildings.
- Humanoid animal villagers (cat, bunny, bear, fox, panda, tanuki, frog, duck…) with friendship hearts, daily chats, gifts they love, and requests. New townsfolk move in as homes fill up.
- Rosie's story questline, Rosie's Treats shop, Chewy's cottage (stash + sleep), Blossom Hall ledger, notice board and the Bonesmith (reforge, sockets, tier upgrades).

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
Dev pages live under `/?test=…` (`sandbox`, `chars`, `monsters`, `dungeon`, `buildings`, `ui`, `rpg`, `audio`, `portraits`).

## Testing
- `node tools/test-rpg.mjs` — ~4.8M checks on items, affixes, stats, levelling and drop tables.
- `node tools/qa/run-all.mjs` — browser scenario suite (needs `npm run dev`): village↔Burrow round trips and leak checks,
  combat stress with every skill, all four bosses, death, village sim + save/load, inventory edge cases, dialogue/story,
  input edge cases. Each scenario (`tools/qa/s*.mjs`) can also run on its own.
- `node tools/shot.mjs --url "/?..." --out name` — headless screenshot harness used for visual iteration.
