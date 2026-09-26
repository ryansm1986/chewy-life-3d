# Chewy Life 3D — Architecture & Contracts

A cozy, hand-painted, isometric 3D village life-sim (Hello Kitty Island Adventure vibes) with
SimCity-style village planning and a Diablo-2-style dungeon ("The Burrow"). Three.js r186 + Vite, plain ES modules (no TS).
Quality bar: **8.5/10 polish** — every screen should feel finished, animated and cute.

## Cast
- **Chewy** — main character. Humanoid chibi chocolate-brown dog (#8a4a2c), lighter muzzle, **white chest blaze**,
  amber eyes, semi-floppy rose ears. Wears a navy gi (#2c3a6a) with red scarf + red sash. Weapons: **Bone Sword** (melee)
  or **Red Tennis Ball** (thrown, returns). `X` swaps weapons.
- **Shadow** — sidekick Boston terrier (quadruped, black #1e1c24 + white muzzle/blaze/chest, big bat ears, round eyes, blue collar). Follows and fights (D2 mercenary style).
- **Rosie** — human little girl, curly brown hair, brown eyes, fair skin, rosy cheeks, pink dress + red bow. Runs "Rosie's Treats" shop & gives quests.
- Villagers — humanoid cartoony animals (cat, bunny, bear, fox, panda, tanuki, frog, duck…).
- Monsters — cute Japanese yokai (mochi slimes, dust bunnies, lantern ghosts, umbrella kasa-obake, mushroom kinoko, oni imps, tanuki bandits) + bosses.

## Running / testing
- `npm run dev` (Vite on :5173; it is usually already running in the background).
- Screenshot harness: `node tools/shot.mjs --url "/?test=NAME&..." --out NAME [--wait ms] [--eval "js"] [--snap name] [--key k] [--click x,y]`
  → PNGs saved to the scratchpad `shots/` folder (path printed). Console errors/warnings are printed. ALWAYS check them.
- Isolated dev scenes: `src/tests/NAME.js` exporting `default function()`; open with `/?test=NAME`. Each module owner makes
  their own test page. Set `window.__ready = true` when the scene is ready to screenshot.
- Post debug: `&off=ao,tilt,main,smaa` disables passes, `&raw` renders without post, `&q=0|1|2` quality, `&hour=13` time of day.

## Visual style guide
- Look: bright, saturated pastel, **hand-painted**. Soft toon terminator, cool lavender shadows, warm golden rim light,
  painterly brush-noise, drifting cloud shadows, bloom on emissives, subtle tilt-shift, AO.
- **All lit meshes use `makeToon()`** from `src/gfx/materials.js` (never MeshStandardMaterial). Options: `color`, `vertexColors`,
  `map`, `emissive`, `brush` (0-0.35), `rim` (0-0.8), `term:[a,b]`, `wind:'grass'|'tree'|'leaf'|'cloth'|'reed'`, `objectBrush:true` for moving actors,
  `noFlip:true` for double-sided cards, `noShadowCast`. If a material has wind/alphaTest, call `applyDepth(mesh)` so shadows match.
- Prefer **one merged geometry per object with vertex colors** (`src/gfx/geom.js`: `paint`, `solid`, `merge`, `xf`, `tube`, `branch`, `puff`, `RoundedBox`)
  → few draw calls. Unlit glow/VFX: `makeGlow()`. Character outlines: `makeOutline()` (inverted hull) — characters only.
- Shapes: chunky, rounded, slightly wonky/handmade, exaggerated (big roofs & eaves, round windows, thick doors). Nothing razor-sharp.
- Scale: **1 unit = 1 tile ≈ 1 m**. Chewy is ~1.15 tall. Doors ~1.4 high. One story ≈ 1.6 walls + 1.2–2 roof.
- Palette:
  - wood dark `#6b4a3a`, wood light `#c98f5e`, plaster `#fff3e0`, stone `#d9d0c8`/`#a89ca8`, paper `#fffaf0`
  - roofs: slate-blue `#5d6f9e`, teal `#3f8f8a`, terracotta `#d86a4a`, moss `#6e9a5a`, plum `#8a5a8a`
  - accents: lantern red `#e8503a`, gold `#f4c04a`, indigo noren `#2f4a7a`, sakura `#ffbcd6`
  - UI: cream `#fff6e8`, ink brown `#4a2c2a`, pink `#ff8fb0`, gold `#ffcf4a`, mint `#8fe0c0`, sky `#8fd0ff`
- Night: windows/lanterns glow (emissive > 1 so bloom catches them), fireflies, lantern light pools. Light sources are
  registered with the world's `LightPool` (`addSource({pos, color, intensity, radius, flicker, nightOnly})`) — never add raw PointLights.

## Core modules (owned by the lead — read, don't rewrite)
- `src/core/util.js` math, RNG (`RNG`, `mulberry32`), `Noise`, easing, colors. `src/core/events.js` event bus `Events.on/emit`.
- `src/core/input.js` `Input.down(k)/hit(k)/mouseDown(b)/mouseHit(b)`, `Input.mouse.{x,y,nx,ny,overUI,wheel}`. Keys are lowercase letters, digits, `space`, `shift`, `escape`, `tab`, `alt`…
- `src/core/engine.js` `Engine` (renderer, `rig` camera, `post`, `tick()`, `render()`, `mouseGround()`), `LightPool`.
- `src/gfx/*` materials, post, sky (DayNight), water, textures, geom. `src/world/terrain.js`, `vegetation.js`, `layout.js`, `villageWorld.js`.

## Game context `G` (src/game.js)
```js
G = { engine, input, events, state /* persistent save */, derived /* computed stats */, actions, ui, audio, vfx,
      mode: 'title'|'village'|'dungeon', world, player, companion, day }
```

## Persistent state `G.state` (JSON-serialisable, saved to localStorage)
```js
state = {
  version: 1,
  player: { name:'Chewy', lvl:1, xp:0, stats:{str:10,dex:10,vit:12,ene:8}, statPts:0, skillPts:1,
            skills:{ chomp:1 }, hotbar:['attack','chomp',null,null,null,null], // [LMB, RMB, 1, 2, 3, 4]
            life:null, zoom:null, activeWeapon:0 },           // life/zoom current (null = full)
  coins: 120,
  materials: { wood:20, stone:10, petal:0, crystal:0, bone:0, mochi:0, silk:0, lantern:0 },
  potions: { heart:3, zoom:2, rejuv:0 },                      // belt counters: Q = heart, E = zoom
  inventory: Array(40).fill(null),                            // 10x4 grid, one item per cell (uniform cells)
  equipment: { weapon:null, weaponAlt:null, hat:null, outfit:null, collar:null, charm1:null, charm2:null, boots:null, paws:null },
  stash: Array(60).fill(null),
  quests: { active:[], done:[] }, friends: { /* villagerId: {hearts, talkedDay, gifts} */ },
  village: { /* owned by the village sim */ },
  dungeon: { deepest:0, waypoints:[1] },
  day: 1, hour: 8.5, flags: {},
}
```

## Items
```js
Item = {
  uid, kind:'gear'|'gem'|'material'|'gift'|'key',
  base:'boneSword',            // key into ITEM_BASES
  slot:'weapon'|'hat'|'outfit'|'collar'|'charm'|'boots'|'paws', wtype:'sword'|'ball' (weapons only),
  rarity:'normal'|'magic'|'rare'|'unique'|'set', name, ilvl, req:{lvl, str?, dex?},
  dmg:[min,max] (weapons), aspd (attacks/s, weapons), def (armor pieces),
  affixes:[{ id, stat, value, text }],   // stat keys = derived stat keys below
  uniqueId?, setId?, sockets:0, gems:[], qty? (stackables), value (coins), flavor?,
  icon:{ shape, colors:[...] }           // drawn by src/rpg/icons.js (canvas → dataURL, cached)
}
```
Rarity colours: normal `#f4efe6`, magic `#6ea8ff`, rare `#ffd84a`, unique `#ff9a3c`, set `#5ee07a`.

## Derived stats `G.derived` (computeStats(state) in src/rpg/stats.js)
`str dex vit ene lifeMax zoomMax lifeRegen zoomRegen dmgMin dmgMax dmgPct aspd atkSpeed castSpeed moveSpeed crit critDmg def block
 resFire resFrost resZap resStink (cap 75) lifeSteal zoomSteal fireDmg:[a,b] frostDmg zapDmg stinkDmg mf gf thorns
 allSkills treeSkills:{bone,fetch,spirit} xpBonus pierce cdr lifeOnKill shadowDmg shadowLife weaponType:'sword'|'ball'`

## Actions `G.actions` (src/rpg/actions.js) — every mutation of player/inventory goes through these, and they emit events
`equip(invIdx)`, `unequip(slot)`, `swapWeapons()`, `moveItem(from:{c:'inv'|'stash'|'equip', i}, to:{c,i})`, `dropItem(from)`,
`pickup(item)→bool`, `usePotion('heart'|'zoom'|'rejuv')`, `sellItem(from)`, `buyItem(item, price)`, `learnSkill(id)`, `addStat(key)`,
`setHotbar(slot, skillId)`, `addXp(n)`, `addCoins(n)`, `spendCoins(n)→bool`, `addMaterial(k,n)`, `hasMaterials(cost)`, `spendMaterials(cost)→bool`, `recompute()`.

## Events (Events.emit(name, payload))
`inv:changed`, `equip:changed`, `stats:changed`, `coins:changed`, `materials:changed`, `potions:changed`, `player:levelup {lvl}`,
`skill:learned {id,lvl}`, `item:pickup {item}`, `item:drop {item}`, `quest:update`, `toast {text, icon, color}`,
`mode:changed {mode}`, `village:changed`, `friend:changed {id}`, `boss:spawn`, `boss:dead`, `player:dead`.

## UI (src/ui/) — HTML/CSS overlay above the canvas (`#ui`), lots of spring/bounce animations
`UI.init(G)`, `UI.update(dt)`, `UI.toggle(name)` / `open` / `close` / `isOpen` / `anyModal()` for
`inventory|character|skills|quests|map|build|menu|shop|stash`, `UI.toast(text,opts)`, `UI.banner(title, sub, {style})`,
`UI.float(worldPos, text, {kind:'dmg'|'crit'|'heal'|'xp'|'coins'|'miss'|'status', color})`,
`UI.dialogue({speaker, portrait, lines, choices})→Promise`, `UI.setTarget(info|null)`, `UI.setBoss(info|null)`,
`UI.setInteract(text|null)`, `UI.transition(fn)`, `UI.lootLabel(add/remove)`.

## Buildings (src/world/buildings/)
`BUILDINGS[id] = { name, cat:'home'|'shop'|'craft'|'service'|'decor'|'special', size:[w,d], cost:{coins,wood,stone,…},
 levels, desc, cover?:{kind:'water'|'joy'|'light'|'health'|'learn', r}, zone?:'R'|'C'|'W' }`
`buildModel(id, {level, seed}) → { group, lights:[{pos,color,intensity,radius,nightOnly}], door:Vector3, footprint:[w,d], height, glow:[materials] }`
`setNight(model, t)` → window/lantern emissive.
