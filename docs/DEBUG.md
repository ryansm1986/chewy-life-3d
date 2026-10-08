# Debug tools (ROADMAP R-10)

An in-game menu to unlock and test anything quickly: heroes, zones, the story, tiers, travel, the village, items,
combat and time. It is **off by default**, needs a **password**, and costs a player with debug off nothing: the menu is
its own lazy-loaded chunk that is never fetched until debug is on.

## Turning it on

Both ways in ask for the password first, in a small prompt: the password (ask the owner). The repo is public, so it is
never written in tracked files: not in the code, the tests or these docs.

- **The URL**: add `?debug` (for example `http://localhost:5173/?debug`). The prompt opens as soon as the game is up.
- **Seven taps** (for itch, the iPad, the Steam Deck and the desktop app, where adding to the URL is awkward): open the
  menu (Esc, the pad's Menu button, or the gear button on touch), then **Settings**, scroll to **About**, and tap or
  click **Pawhaven v0.x.y** seven times in a row. Pauses of more than a second and a half start the count again; the
  last three taps count down in a toast.

The prompt:
- a text field: a touch keyboard comes up on a phone or iPad; with a pad, A focuses the field (on the Steam Deck, Steam
  + X brings up its keyboard);
- **Unlock** or Enter checks it. The right password turns debug on and **remembers it on this device**
  (`localStorage['chewy3d.debug']`), so it isn't asked again;
- a wrong one gets a gentle "Hmm, that's not it" and a shake. After five wrong tries, a 30-second breather.

**Turning it off**: Settings › About › *Debug tools: on* › **Turn off** (or the Save tab's *Turn debug tools off*). That
forgets it on this device, closes the menu and ends the session's combat toggles. Seven taps turn it on again.

**The password is a casual deterrent, not security.** It runs on the player's own device, so anyone reading the bundle
can set the flag by hand. Only its SHA-256 hash is in the code (`PASS_HASH` in `src/debug/registry.js`). To change it:

```
node -e "require('crypto').subtle.digest('SHA-256', new TextEncoder().encode('NEW-PASSWORD')).then(b => console.log(Buffer.from(b).toString('hex')))"
```

and paste the printed hex over `PASS_HASH`.

**The QA and the password**: s35, prod-smoke's `debug` case and test-rpg's DEBUG TOOLS checks read it from
`PAWHAVEN_DEBUG_PASS`, or else from the git-ignored file `tools/qa/.debug-pass` (one line; `tools/qa/debug-pass.mjs`
reads it). With neither, the right-password checks print a SKIP line instead of failing, and everything else still
runs: debug is turned on through the same path a right password ends in (the remembered flag), and the prompt is
tested with a wrong password only. After changing the password, update that local file.

## Opening the menu (once it's on)

| Device | How |
|---|---|
| Keyboard | **F10** or the **backquote** key (left of 1) opens and closes it |
| Mouse or touch | the little **bug button** left of the minimap (and of the touch hero / bag / menu buttons). On a phone it hides while a panel is open |
| Pad (Steam Deck too) | **Select + Start** (View + Menu) together. Whichever went down first doesn't also open the map or the pause menu |
| Settings | About › *Debug tools: on* › **Open**; or a few taps on the version |

It's a normal panel: Esc, B or ✕ close it; LB / RB switch its tabs; the pad's focus ring and glyph hints work in it;
on a phone it uses the one-panel layout (the title bar at the bottom, 44 px targets, the 12 px text floor). It doesn't
open on the title screen (start or continue first). Under automation (the QA's browsers) the bug button only shows with
`?debug` in the URL or while the menu is open, so other tools' screenshots stay clean.

## Save safety
- **The first time the menu opens on a save** it offers *Back up this save first*. The backup is a copy of the save in
  its own slot (`localStorage['chewy3d.save.debugBackup']`). The **Save** tab can back up again, and **Restore the
  backup** (two taps) puts it back and reloads onto it, straight into the game (nothing saves over it on the way out).
- Every action that changes the game marks the save **`state.debugUsed = true`**. That shows only as a small *Debug
  save* badge in this menu's header, never in the normal UI.
- The combat toggles are for this session only and are never saved.

## What each action does

Every action is one tap and says what it did in a toast. The ones that travel close the menu first.

**Heroes**
- *Join every hero*: Moka, Poe, Floofy and Foosy join at once, through the same calls their scenes end in
  (`joinPoe` / `joinShihtzu` / `joinGolden`, Moka's `prepareJoin` and flag), skipping the scenes and the banners.
- *Switch to*: any hero (joining them first if needed), with the switch cooldown skipped.
- *Set level*: the active hero, all of them, or one, to 1, 10, 20, 30, 45 or 60. Up adds that level's stat and skill
  points; down is a fresh start at that level (points back, gear kept).
- *Skill points* +1 / +10 / +50, *Stat points* +5 / +50 / +250, *Max every skill* (the active hero's skills at 20),
  *Reset skills* (two taps: every point back, as the Forget-Me-Not Tea).
- *Shadow's whelp outfit*: with Foosy (the normal rule), on, or off, for the session.

**World**
- *Open every zone*: all four zones open on the Travel Map.
- *Save every village*: each zone village's siege is over and its buildings reopen (`G.zoneDebug.saveVillage`). If you're
  in a zone, leave and come back to see it.
- *Clear every dungeon*: the four zone dungeons' first clears (each opens the next zone and its Lantern's T1) and the
  Burrow down to floor 20 with Tamamo (its waypoints, and the Deep Burrow's Lantern).
- *Jump to chapter*: the main story (Welcome Home … Nine Tails of Moonlight, or all done): the chapters before it are
  done, it starts at its first step. *Next quest step*, *Complete the quest* (rewards and all).
- *Play again* (joining scenes): a hero isn't joined any more (level and gear kept), so their scene and rumour play
  again. Not the hero you're playing.
- *Reset every guide* / *Mark every guide done*.

**Tiers**
- *Open T1–T5 everywhere*: every Spirit Lantern (the four zone dungeons and the Deep Burrow).
- *Spirit tier* 1 / 9 / 10 / 20: the Spirit endgame opens up to that tier.
- *Tier run*: a dungeon, a tier (T1, T3, T5, Spirit 1, 9, 10) and any modifiers, then *Set off* (`G.tierDebug.run`).
- *Open the Lantern*: a dungeon's Spirit Lantern panel. *The pinnacle*: Spirit 10's Four Seasons.

**Travel** (closes the menu; waits for the arrival)
- Blossom Hollow; *Chewy's Cottage* (inside).
- Each zone: its trail, its village, its dungeon gate, and its wild areas once the cozy path adds them (CZ-3).
- The Burrow B1–B20; each zone dungeon's floor 1, floor 2 or the boss arena; the Deep Burrow's floors (tier 1).

**Village**
- *Coins* +1k / +100k, *Every material* +100 / +999.
- *Unlock every building and recipe*: village rank 5 (every district and building) and every workbench and cooking
  recipe.
- *Village rank* 1–5: at least that rank (`state.village.rankFloor`; the villagers can push it higher). Its districts
  open at once, even on day 1.
- *All furniture and decor*: two of every piece, one of every wallpaper and floor, in storage.
- *Pantry*: everything (seeds, crops, fish and forage ×20, meals ×10), only seeds, or only meals.

**Items**
- *Gear set*: a level and a rarity (magic, rare, unique, set): a full set equipped on the active hero, the old gear to
  the bag.
- *Potions* (a full belt), *Gems* (three perfect ones of each kind).
- *Uniques*: any of them to the bag, in three rows: the endgame and pinnacle ones, the zone bosses', and the rest.
- *Identify all* has nothing to do: Pawhaven has no unidentified items.

**Combat** (this session only)
- *God mode*, *One-hit kills*, *No cooldowns*, *Endless zoom* (zoom is the mana), *Hero speed ×2*, *Freeze monsters*.
- *FPS and draw calls*: a small overlay (fps, frame ms, draw calls and triangles of the whole frame, GPU geometries and
  textures).
- *Kill every monster here*; *Spawn a pack*: a kind, a count (3, 8, 16, 30) and a leader (none, champion, unique)
  next to the hero, alerted.

**Time**
- *Time of day* (6 am … midnight), *Skip to the next morning*, *Skip a whole day* (through 6:00, so the crops grow and
  the village has its morning).
- *Weather* (in a zone, until you leave): clear, snow, petals, leaves, fireflies, mist, or the zone's own.

**Cozy**: empty for now. The cozy path (ROADMAP CZ-*, docs/COZY.md) adds its own actions here.

**Save**: back up, restore (two taps), turn debug off.

## For code: adding actions
The tabs are a registry (`src/debug/registry.js`, always loaded and tiny), so a feature registers its own actions
from its own code without loading or editing the menu:

```js
import { registerDebug } from '../debug/registry.js';
registerDebug('cozy', [
  { label: 'Skip 8 game hours', run: G => { /* … */ return 'Skipped 8 hours'; } },          // a button
  { label: 'Crew size', choices: [1, 2, 3], run: (G, n) => `Crew of ${n}` },                // one tap per choice
  { label: 'Send a crew', fields: [{ key: 'zone', label: 'Zone', choices: ['bamboo', 'maple'], value: 'bamboo' }], go: 'Send', run: (G, v) => `${v.zone}` },
  { label: 'Show wages', toggle: true, get: G => !!G.x, run: (G, on) => '' },
  { note: 'Words under the section' },
], { title: 'Cozy', icon: 'leaf', order: 90 });
```

`run` returns the toast (or nothing: "<label> ✓"); `closes: true` closes the menu first; `confirm: true` asks for a
second tap; `noMark: true` leaves `debugUsed` alone; `group` puts a small heading above it; `choices` may be a
function of G. Use the game's own code paths (actions, Story, `G.enterDungeon`, `G.tierDebug`, …) rather than poking the
save.

## Files
- `src/debug/registry.js`: the registry, the password hash and the SHA-256 check (with a JS fallback where Web Crypto
  is missing, as on a dev server opened over the LAN). Always loaded.
- `src/debug/access.js` + `access.css`: the prompt (`DebugGatePanel`), F10 / backquote, Select + Start, the bug
  button, the seven taps, `G.debug`. Always loaded.
- `src/debug/debugMenu.js` + `debug.css` (the panel, backup and restore), `debugActions.js` (the sections),
  `debugToggles.js` (the combat toggles and the perf overlay): the lazy chunk.
- Hooks in shared files: `game.js` (install, `G.debug.frame` after `Actions.poll`, `G.saveBlocked` in `save()`),
  `ui/menu.js` (Settings › About), `ui/ui.js` (`overTitle` panels), `world/village.js` (`rankFloor`, `checkRings(force)`).
- QA: `tools/qa/s35-debug.mjs` (shots in `tools/qa/tmp/s35-debug/`), prod-smoke's `debug` case (and the `village`
  case checks the chunk isn't fetched), test-rpg's DEBUG TOOLS checks.
