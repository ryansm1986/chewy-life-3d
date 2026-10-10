# Pawhaven 🐶🌸

A cozy, hand-painted **3D isometric** village life-sim in the spirit of *Hello Kitty Island Adventure*, with
**SimCity-style village planning** and a **Diablo 2-style dungeon crawler** — starring **Chewy** the chocolate pup,
his Boston terrier sidekick **Shadow**, and **Rosie**, a little girl with curly brown hair who runs the village treat shop.

## Play
- Double-click **`Play Chewy Life.cmd`** (installs dependencies the first time, builds the game in about a second, then opens it in your browser at http://localhost:4173), or
- `npm install` then `npm run dev` and open http://localhost:5173

Chrome / Edge recommended (WebGL2). Saves automatically to the browser's local storage: on every trip between places,
after quests, level ups, building and big finds, when the tab is hidden or closed, and every couple of minutes of play
(Settings › *Autosave*: Off · 1 min · 2 min · 5 min; a little paw "saving…" shows in the corner). The save before the
latest is kept as a backup and loads by itself if the latest one is ever damaged.

**itch.io** (<https://holiestdiver.itch.io/pawhaven>): `npm run push:itch` builds, tests and pushes with butler;
`npm run build:itch` makes an upload-ready zip in `release/` (`npm run test:itch` also boots it in an itch-style iframe).

**Desktop app** (Windows and Linux; the way onto a **Steam Deck**): `npm run build:desktop` makes
`release/desktop/Pawhaven-<version>-win-x64.zip` / `-portable.exe` and `-linux-x64.AppImage` / `.tar.gz`. It opens
full screen (F11 or Settings › *Full screen* for a window), plays with a controller and keeps its saves in its own folder.
[docs/DESKTOP.md](docs/DESKTOP.md) has the Deck steps (Add a Non-Steam Game, the controller template, saves,
troubleshooting).
Sign-in, upload steps and page settings are in [docs/ITCH.md](docs/ITCH.md).

**Debug tools** (for testing: unlock every hero and zone, jump the story, travel anywhere, spawn items, god mode…):
add `?debug` to the URL, or tap the version in Settings › About seven times, then enter the password. Then F10, the backquote key,
the bug button or Select + Start on a pad. See [docs/DEBUG.md](docs/DEBUG.md).

## Controls
| Key / Mouse | Action |
|---|---|
| **WASD** or **click** | Walk (hold the mouse to keep walking) |
| **Shift** (hold while moving) | Sprint: +40% speed, free; it pauses while you attack, cast, charge or roll · Settings › *Sprint*: Hold or Toggle |
| **F** / click a villager | Talk · interact (shops, chests, shrines, portals, stairs) |
| **F** at a door | Go inside: Chewy's Cottage, or a villager's home when you're friends (at night: knock) · **F** on the door mat (or walk out) to leave |
| **F** at a mailbox | The house card: **Upgrade** · **Remodel** · **Enter** (also: click a house in Build mode) |
| **F** at your garden bed | Till · plant (pick a seed: **1–9**) · water · harvest — whatever the tile needs |
| **F** facing water | Fish: **F** when the float dips, then **hold F** (or the mouse) to keep the fish in the green |
| **LMB on a monster** · **Alt+LMB** | Attack with your left-click skill (Alt: in place, at the cursor) |
| **RMB**, **1–4** | Cast hotbar skills at the cursor · **tap** for a quick cast, **hold** to charge (Ⅰ → Ⅱ → Ⅲ, let go to release; channels spin / beam while held) · Settings › *Charge on hold*: On · Off · Toggle |
| **Space** | Dodge roll |
| **Q / E / R** | Heart Treat · Zoom Juice · Rejuvenation |
| **X** | Swap **Bone Katana** ⇄ **Red Tennis Ball** |
| **G** | Eat your quick meal (the last dish you ate) |
| **Tab** | Switch heroes: tap for the next (Chewy → Moka → Poe), hold for the hero wheel (point or 1–3, let go) |
| **Z** (hold) | Show every loot label |
| **L** | Shadow leads the way to the objective (press again: he stays close) · or click a quest in the tracker, or the Journal's *Follow Shadow* · Settings › *Shadow leads the way*: Off · Quests (he leads on his own when a quest says so) · Always |
| **I · P · C · K · J · M** | Bag · Pantry · Character · Skills · Journal (quests, Fish Log) · Map |
| **B** | Build mode (village): place buildings, paint R/C/W zones, lay paths, bulldoze · **R** rotate |
| **B** indoors | Decorate: pick from storage, click to place / pick up · **R** rotate · **Delete** store · **Ctrl+Z** undo · WASD pans |
| **T** | Return to the village from the Burrow |
| **Mouse wheel** | Zoom · **Esc** menu / close |

**Controller** (Xbox names; the Steam Deck matches, a PlayStation pad shows its own symbols). The game follows whichever
device you used last: the prompts change and the cursor hides while the pad plays. Settings › *Controls* rebinds both
devices and sets rumble, aim assist and the glyph style.

| Button | Action |
|---|---|
| **Left stick** | Move (analogue speed) · click **L3** to sprint (it stays on while you keep moving) |
| **Right stick** | Aim skills and attacks; with no input the aim follows your walk and the soft lock (a small ring under the foe) |
| **A** | Attack the locked foe (melee steps in from close by) · talks / interacts when something is highlighted and no foe is near (the **A** prompt) |
| **X** · **Y** · **RB** · **RT** · **LT** | The right-click skill · hotbar skills 1–4 (**tap** to cast, **hold** to charge) |
| **B** | Dodge roll · closes a panel |
| **LB** | Tap: the next hero · hold: the hero wheel (point with the right stick, let go) |
| **D-pad** ◀ ▶ ▲ ▼ | Heart potion · Zoom potion · quick meal · interact (hold: every loot label) |
| **L3 + R3** | Swap weapon sets |
| **R3** (no foe about) | Shadow leads the way to the objective (in a fight R3 picks the next target) |
| **View** · **Menu** | The map · the game menu (the bag, character, skills, journal, map, home) |
| In dialogue | **A** next line / choose · **D-pad** pick a choice · **B** leave |
| In menus | **D-pad** / stick move the focus · **A** select · **B** back · **LB / RB** tabs · **X / Y** the action named in the hint bar (bag: drop / equip; skills: charge perks / assign; shops: sell all) · the tooltip follows the focus |
| Build · decorate | From the game menu (**Menu**). **Left stick** moves the paw cursor (right stick pans) · **D-pad** ◀ ▶ pick from the palette, ▲ ▼ category · **A** place / paint / pick up · **Y** or **RB** rotate · **X** remove (build: press twice) / store (decorate) · **LB** undo · **LT / RT** turn (build) / zoom (decorate) · **B** cancel, then leave |
| Fishing | **A** (or **RT**) cast, strike and hold to reel · push the stick or **B** to stop |

**Steam Deck.** On the Deck's 1280×800 screen the first start picks the *Deck* graphics preset (lighter shadows and
effects, Medium grass), a larger UI (115%) and a safe margin round the screen. Settings › *Graphics* switches between
Low, Medium, High and Deck (grass and scenery detail change at the next start), and *Frame cap* holds 60 or 40 fps.

**Touch** (phones and tablets, in landscape; a phone held upright shows a "turn your phone" card and pauses). The
controls appear on a touch screen and hide again when you use a key, the mouse or a pad.

| Control | Action |
|---|---|
| **Left thumb**, anywhere on the left half | A floating stick: move (analogue); push it out to its ring to sprint (the ring turns gold) |
| **Attack** (the big round button, bottom right) | Attack the locked foe · hold to charge or keep swinging · it shows a paw and talks / uses when something is close and no foe is near |
| **The five skills** round it · **roll** | Tap to cast, hold to charge (a ring fills) · the mint button rolls · the small badge swaps weapon sets |
| **The belt** between the orbs | Heart potion · Zoom potion · quick meal |
| **Top right** | The hero button (tap: the next hero; hold: the hero wheel, then tap a card) · the bag · the menu · the minimap opens the map |
| **A tap in the world** | On a monster: lock it · on a villager, door or anything usable: walk over and use it · elsewhere: walk there |
| **Two fingers** | Pinch to zoom |
| **Menus** | Tap to pick and click (tap an item, then the slot to put it in) · drag to move items · **double-tap** for the right-click (equip, use, assign) · **long-press** for the details · the ✕ closes (on a phone a panel's title, tabs and ✕ sit at its bottom, by the thumbs) |
| **Build · decorate** | Pick from the palette, then touch or drag the piece into place and use the buttons: **Build** / **Set down** · **Turn** · **Cancel** · **Store** · **Undo** · **Done** · zones and paths: drag to paint · with nothing in hand one finger pans (a tap opens a house's card or picks a piece up) · two fingers pan and pinch |
| **Fishing** | Tap attack to cast and strike · hold anywhere to reel |

Settings › *Controls* › *Touch* sets the button size and opacity, a left-handed layout, the skill aim (**Auto**: at the
nearest foe in front; **Drag**: drag off a skill to aim it, drag back onto it to cancel) and haptics. On a phone or tablet
the first start picks the *Mobile* graphics preset (a 1:1 pixel ratio, no ambient occlusion, light shadows, Low grass,
half the particles, 1024-px hero skins, a 60 fps cap). On Android Chrome the first tap goes full screen; iPhones play in
the browser bar (Safari has no full screen for pages), or full screen from *Add to Home Screen* when the game is served on
its own (on itch, use itch's full-screen view).

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
- Shadow shows you around Chewy's Cottage and the garden and then helps you make it home (decorating), Moka teaches you to switch heroes (and Poe, once she joins, the hero wheel), Kero walks you through your first catch, Tanu shows you how to remodel a house, and back from the Burrow Shadow shows you how to hold a skill to power it up: a speech card, an objective card with *Skip*, bouncing arrows in the world and spotlights on the buttons that matter. Replay any guide from the Journal's **Guides** tab.
- **Both paths from the start**: Rosie asks *"Go yourself, or send Moka?"* about the Burrow's squeaks. Go yourself and Shadow's fight tips follow you in; send Moka and Shadow walks you through **the Expedition Board** (the job, the crew, Send off!, the crews chip). Either way **Shadow's Nose** shows gathering and digging next, Old Hachi explains **the Adventurers' Guild** once it's built, and Shadow points out the wild places on your first visit to a saved zone. The other path is always offered later. Every line follows your device: keys, the pad's buttons, or touch.

**The cozy path (no fighting needed)**
- **Expeditions**: send benched heroes and Guild hires on story jobs, village quests and errands from the **Expedition Board** by the Wayfarer's Post. Pick a crew, pack lunches, read the odds, and they come home hours later (on the world clock, which keeps a little time while the game is closed) with the job done, materials, XP and a report. Crews can relieve the besieged villages, make the zone dungeons' first clears and take on the Burrow's boss quests: the whole story can be finished without a fight (the boss uniques and gems wait for your own first clear; crews bring keepsakes).
- **The Adventurers' Guild** (village rank 2): Old Hachi's lodge, where you sign on hires in five classes (Guard, Archer, Scout, Healer, Porter), pay their daily wages and keep their morale up.
- **Peaceful zones**: once a zone's village is saved its trail goes quiet, apart from two marked **wild areas** and the daily **Sightings** bounties for fighters.
- **Scavenging**: gather driftwood, stones, petals, silk and sea glass in every peaceful area, and dig up what **Shadow's nose** finds (let go in the golden band for a Perfect dig).
- The HUD's backpack chip shows the crews out; the Journal's **Crews** tab keeps their reports.

**The homestead (farming, fishing, cooking)**
- **Farming**: till, plant, water and harvest in Chewy's garden bed and the village's Veggie Patch fields. Eight crops grow a stage every watered night (a dry day only waits; nothing dies), strawberries keep fruiting, and sprinklers water their neighbours. Seeds come from **Usagi's Seed Stall** and as loot in the Burrow.
- **Fishing**: Kero's quest gives you a rod. Cast at any pond, river or beach (and the regions' waters; ice-fish on the frozen pond of Yukimi Onsen), wait for the bite, then win the reel minigame. There are 15 fish by place, time of day and rarity, with sizes, records and a **Fish Log** in the Journal; Kero gives gifts at milestones and buys fish.
- **Cooking**: 15 recipes in your cottage kitchen, at campfires in the Burrow and the regions, or baked in Rosie's oven. Learn recipes from friends, quests and Rosie's cookbook, or discover them with *Try a mix*. Dishes heal and give a **Well Fed** buff (Hearty, Swift, Strong, Lucky, Zen) that follows you into the Burrow.
- **The Pantry** (P) holds it all. Villagers love their favourite dishes as gifts, ask for crops, fish and dishes, and the shops buy them: Rosie dishes, Kero fish, Usagi crops.

**The Burrow (the dungeon)**
- Procedurally generated floors across four biomes — Mossy Burrow, Crystal Grotto, Fox Shrine Tunnels, Oni's Kitchen — with torches, glowing mushrooms and crystals, light shafts, breakable pots, chests, shrines, waypoints and stairs down.
- Cute yokai monsters (mochi slimes, dust bunnies, kinoko, lantern ghosts, kasa-obake, fox-fire wisps, oni imps, tanuki bandits) in packs led by **champions** and **uniques** with D2-style modifiers (fire enchanted, frosty aura, teleporting, vampiric…).
- Bosses every 5 floors: **King Mochi**, **Lord Karakasa**, **Oni Chef Gorobei**, **Tamamo the Nine-Tailed**.
- **Three skill trees × 7 skills** (Bone Blade, Fetch Mastery, Pack Spirit) with synergies, 60 levels, stat points.
- **Chewy the samurai**: a black-and-gold haori and hakama, and a Bone Katana drawn from the saya at his hip for quick-draw cuts, two-handed swings, stances and battle cries; a combo ends with the katana slid home into its saya.
- **Poe the pug ninja**, the third hero: met in the Whispering Bamboo Grove, where she "stealthily" tails you (snorting) until a sneeze gives her away. A giant bone fūma shuriken thrown out and back, and three trees — Shuriken Arts (kunai fans, buzz-saws, shuriken rain), Ninjutsu (smoke bombs, shadow clones, a fire puff ball, thunder paw, a smoke dragon) and Shadow Step (backstabs, afterimage dashes, vanish, caltrops, bullseye marks) — all 18 actives chargeable (docs/POE.md).
- **Charged abilities**: hold any active skill to charge it (a ring fills to Stage Ⅰ, Ⅱ, Ⅲ) and let go for a bigger version — a rolling shockwave cleave, a piercing fastball, a giant squeaker, a meteor shower… Skill points buy **charge perks** per skill in the K panel's Charge card: more stages, a quicker wind-up, extra projectiles and a unique trick for every skill.
- **Loot**: normal / magic / rare / unique / set items with affixes, sockets and treat gems; loot beams for rares+; potions, materials and coins.
- **Shadow** fights by your side, faints and gets back up; call spirit pups, throw squeaky decoys and heal with treats.

## Tech
Three.js r186 + Vite, plain ES modules, all art procedural (no image assets): characters, buildings, vegetation, monsters,
icons and portraits are generated in code; all music and sound effects are synthesized with the Web Audio API.
Dev pages live under `/?test=…` (`sandbox`, `chars`, `monsters`, `dungeon`, `buildings` (`&style=all`), `ui`, `rpg`, `audio`, `portraits`, `furniture`, `furnsheet` (catalog sheets and room vignettes), `stall`, `upgrade`).

## Testing
- `node tools/test-rpg.mjs` — ~4.9M checks on items, affixes, stats, levelling and drop tables, plus the homestead's math (pantry, recipes and mixes, Well Fed, growth, fish, the reel) and housing's (the furniture catalog, room shells, placement rules, the Home Rating, owners, styles, interiors growing, the shop, recipes and finds), and the charged abilities (every table, stage times, costs, perk gating, the balance layer and the DPS-band sim, `tools/charge-sim.mjs`).
- `node tools/qa/prod-smoke.mjs` — builds the game, serves the bundle and checks the UI/audio load with no errors (run before shipping launcher changes)
- `node tools/qa/run-all.mjs` — browser scenario suite (needs `npm run dev`): village↔Burrow round trips and leak checks,
  combat stress with every skill, all four bosses, death, village sim + save/load, inventory edge cases, dialogue/story,
  input edge cases, the regions, the village plan, the homestead (s15: farming, fishing, cooking), the guided tutorials (s16, the cozy path's guides too), housing (s17: interiors, decorating, villagers' homes, ratings, requests, upgrades, remodels, the housing guides), getting furniture (s18) and charged abilities (s19: the hold, the perks, the channels, every skill, the K panel, dash bounds, the guide, perf) and Poe (s20: her joining scene, an old save and the rumour, the Meet Poe guide, every skill, a real charge, perf) and the zones' foundations (s21: the sprint, Alt+LMB, the Z loot labels, dungeon definitions, rerolling floors, the zone save state and its migration, the new quest steps). Each scenario (`tools/qa/s*.mjs`) can also run on its own.
- `node tools/qa/village-perf.mjs 2` / `node tools/qa/homestead-perf.mjs 2` / `node tools/qa/housing-perf.mjs 2` — frame-time snapshots (the village; a full garden and a reel in progress; entering homes, a 60-piece room, remodels).
- `node tools/shot.mjs --url "/?..." --out name` — headless screenshot harness used for visual iteration.
- Touch and phones: `node tools/qa/s27-touch.mjs` (real multi-touch through CDP on an 844×390 phone), `tools/qa/touch-shots.mjs`
  (phone and tablet screenshots), `tools/qa/mobile-ui.mjs` (every menu at phone size: no text under 12 px, no target
  under 44 px, nothing cut off), `tools/qa/mobile-perf.mjs` (the Mobile preset with the CPU throttled).
