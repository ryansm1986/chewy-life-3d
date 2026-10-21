# Simple stats (ROADMAP UX-3)

The owner asked on 2026-10-18 for a simpler stat system: "I want to simplify our stat system to make it easier for younger
audiences." Of the proposals, the owner picked **layer 1**: easier to read and to decide, with the rules underneath
unchanged. Saves, the balance tools (`tools/charge-sim.mjs`, `tools/hero-balance.mjs`) and the derived stats contract
(`rpg/stats.js`) are the same as before. Layer 2 was not picked: three attributes, one elemental guard, about 8 bonus kinds,
level-only gear requirements and easy sockets.

Code: `src/rpg/power.js` (Power, the summary and Shadow's auto points), `ui/character.js`, `ui/tooltip.js`
(`powerBox`, `simpleGearTip`, `TIP`), `ui/inventory.js` (`paintSlot`'s arrow), `ui/padNav.js` (L3), `ui/coopPanes.js`
(the co-op Stats tab), `rpg/items.js` (`STAT_TEXT`), `rpg/actions.js` (`resetStats`, `setAutoStats`, `spendAutoNow`).
QA: test-rpg "SIMPLE STATS", `tools/qa/s51-simple-stats.mjs`, and the Stats checks in s50.

## 1. One Power number, and "is this better?"

- **A hero's Power** is `heroPower(derived)`, about 100 for a new hero and a couple of thousand at level 60 in good gear.
  - The formula is 4 × √(offense × toughness), times small factors for Zoom, speed, cooldowns, Shadow and luck.
  - Offense is the average hit, with elemental adds, × big hits × hits a second × skill levels.
  - Toughness is effective Life: Life plus regen, life on kill, prickly and heal on hit, divided by the damage that gets
    through after defense, the four guards, block, dodge and damage reduction.
  - The square root makes Power grow like either half, so gear that adds only toughness or only damage still shows up.
- **A piece of gear's Power** is what it adds: Power with it on, minus Power with that slot empty, for the hero who would
  wear it.
  - Weapons count with their own hand out, so Chewy's ball counts in the ball hand.
  - The **verdict** compares it with the piece on now (`itemPower(...).delta`):

    | Verdict | Tooltip text | When |
    |---|---|---|
    | `better` | "▲ Better!" | it beats the piece on now |
    | `worse` | "▼ Not as good" | the piece on now is better |
    | `same` | "= About the same" | within 0.5 % |
    | `empty` | "✦ Nothing on there: wear it!" | nothing is in that slot |
    | `worn` | "✓ Wearing it" | this is the piece on now |

  - Another hero's weapon gets "Better for Moka!" and the like, once that hero has joined. Before that the tooltip says
    "Moka's weapon".
  - A piece the hero can't wear yet shows a red line: "Needs level 12", "Needs 34 Strength".
  - Results are cached per hero state (level, attributes, worn uids, skill total, meal).
- **The green arrow**: a bag, stash or Lost & Found cell shows a bobbing green ▲ on gear that is better, or fills an
  empty slot, for the hero being played, and that the hero can wear now (`isUpgrade`). In co-op each pane shows the
  arrows for its own hero.
- **Simple tooltips** (the default) show:
  - the name and kind;
  - the Power box;
  - Damage or Defense;
  - every bonus in plain words;
  - Treats as dots;
  - a set as one line ("Part of …, 2/5 worn");
  - a unique's flavour line.

  iLvl, the requirement list, the stat-by-stat comparison, set bonus tiers and sell value move to the details.
- **Details**: hold **Shift**, or press **L3** on the pad with the focus on a piece of gear (it stays on until pressed
  again). The footer says "L3 Details" and then "L3 Less". Settings › Item details › Full shows the details all the time,
  which is the way on touch screens. The full tooltip keeps the Power box on top. The co-op panes always show the simple
  tooltip.

## 2. The Character screen

From the top:

1. The hero's portrait, name, level and XP, and a gold **Power** badge. It pops when Power goes up.
2. **Six big numbers**, each with a one-line hint and a plain tooltip (`statSummary`):

   | Number | Shows | Hint line |
   |---|---|---|
   | Attack | the average hit | "Big hit N%" |
   | Life | maximum Life | regen a second |
   | Zoom | maximum Zoom | regen a second |
   | Defense | Defense | "Hurt N% less" |
   | Speed | hits a second | run bonus |
   | Luck | magic find | coin find |

   A tile pops when its number changes.
3. **Points**:
   - **Shadow picks** (§3) and **Start over** (§4);
   - the "N points to spend!" banner with **Pick for me**, shown when points are waiting;
   - the four attributes, each with what it does *for this hero* (`attrFx`: "Katana hits harder", "Jutsu hit harder,
     more Zoom", …) and a ★ on the hero's best one (`mainStat`).
4. **All the numbers**: the old full sheet in a drawer, in plain words, grouped as Attack, Toughness, Guards and Other.
   It is remembered open or closed (Settings `statsAll`).

**Plain words**:

| Old words | New words |
|---|---|
| Crit | Big hit |
| Resist | guard ("Fire hurts 12% less") |
| Life steal | Heal on hit |
| Magic find | Treasure luck |
| Coin find | Coin luck |
| Thorns | Prickly |
| Pierce | Fly-through |
| Cooldown reduction | Sooner skills |
| All skills | Every skill |

The bonuses on items use the new words everywhere. `STAT_TEXT` was rewritten, and the tooltips build each line again
from it, so items in old saves read the new words too. `affix.text` keeps whatever it was made with.

## 3. Shadow picks the points

- On by default for every hero, old saves included: `P.autoStats !== false`. It is per hero.
- At a level up, `addXp`, `addXpTo` (a benched hero) and `prepareJoin` (a late joiner) spend the new points with
  `spendAuto`, and a toast says where they went ("Shadow picked your points! +2 Strength · +2 Vitality · +1 Dexterity").
  The `player:levelup` event carries `auto`, the gains.
- **The plan** (`AUTO_PLAN`, points per 5):

  | Hero | Plan |
  |---|---|
  | Chewy | 2 Strength 2 Vitality 1 Dexterity (2 Dexterity 1 Strength with the ball in his main hand) |
  | Moka | 3 Energy 2 Vitality |
  | Poe | 2 Dexterity 2 Vitality 1 Energy |
  | Floofy | 2 Strength 2 Vitality 1 Energy |
  | Foosy | 2 Strength 2 Vitality 1 Dexterity |
  | Stella | 3 Energy 2 Vitality |

  Each point goes where the hero is furthest behind the plan, so points placed by hand even out over the next levels.
- Off: the points wait as before, with the + buttons (Shift+click spends 5) and **Pick for me** (`spendAutoNow`).
  Turning it back on spends what's waiting.
- Co-op: in a player's Stats tab, **Y** switches it for that player's hero, **X** is Pick for me, and **A** spends a
  point by hand.
- Points set directly (the QA, the debug menu's +5 / +50) are not spent until the next level up or Pick for me.

## 4. Starting over is free

- **Start over** on the Character screen (`resetStats`) gives every stat point back, free. With Shadow picking, the
  points go straight back by the plan, which also tidies a hand-made spread.
- The dojo's "Forget and relearn" (`respec`: skill points, charge perks and stat points) is free now. It used to cost
  40 + 25 × level coins. With Shadow picking, the stat points are placed again at once, and the skill points wait for K.

## 5. Not done (layer 2, if the owner wants it later)

- Three attributes instead of four.
- One elemental guard instead of four.
- About 8 kinds of bonus.
- Level-only gear requirements. A Moka with 8 Strength still can't wear 45-Strength paws, and Shadow's plan doesn't
  aim at requirements.
- Treats into any socket with one press.

The cozy path's crew power (`cozy/expeditions.js heroPower`, 10 × level × gear) is a different number from this Power.
