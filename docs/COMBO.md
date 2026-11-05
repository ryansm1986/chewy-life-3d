# Combo chains: tap again to chain, per-skill combo perks

Status: **built** (2026-11-03). The sibling of [CHARGE](CHARGE.md) (the hold-button tree). The owner (2026-11-03): "I feel
like we could also add a fast or combo attack tree in addition to the hold button tree." Their answers:
- **scope: the weapon strikes**, where rapid chaining feels natural (§2);
- **Combo and Charge both work, freely, on the same skill**: taps chain the combo, holds charge; points can go in either
  tree. A held charge released while a chain is live lands as the chain's finisher;
- **the perks are only cheaper chains and faster attacks**: "Cheaper chains and faster attacks. I don't want a movement
  speed buff." No move-speed effect anywhere in this system, no longer chains, no unique finishers.

## 1. Feel (how it plays)
- **A tap is the normal cast**, as today (on mouse buttons, number keys, the pad and touch: every hotbar press goes
  through the Charge controller's `feed`, then `SkillRunner.tryCast`, where the chain lives, so they all chain the same).
- **Tap the same skill again to chain it**: step 1 → step 2 → step 3, the **finisher**, then the chain starts over.
  - The **chain window** is **0.55 s** from the moment the step is over: its swing and recovery done, the hero free to
    act again (for Fūma Throw: the fūma home in Poe's paw). A press during the recovery is **buffered** (it waits for the
    swing to end, then chains), so mashing works and so does a rhythm.
  - The window holds while the next press is in (a tap is only known on release, up to Charge's 0.18 s grace) and while
    that press is charging.
  - **Any other skill** (the basic Attack too), **a roll**, a hero switch, a floor change, death or **the window running
    out** drops the chain. Walking doesn't.
- **Holding still charges** (CHARGE.md §1: the grace stays, taps never charge by accident). A **held charge released while
  a chain is live lands as the chain's finisher**: it gets the finisher bonus and ends the chain (even after step 1). It
  pays its charged cost and plays at its own speed: the cost and speed perks are the taps'. A charge outside a chain
  doesn't start one.
- **The finisher reads clearly but small**: a pop of sparkles at the weapon paw in the skill's colour as it goes, and where
  it lands a ring and a star burst at the first foe it hits (pooled; capped like Charge's bursts, so it never sheets the
  screen), and a bright chime.
- **The hotbar**: while a chain is live, the slot shows three small pips along its foot (1 · 2 · ★), lit up to the step
  done, the next one breathing while the window runs; a finisher flashes all three.

## 2. Which skills chain (the combo table)
Cooldown-free, non-channel, spammable strikes. Shouts, summons, buffs, leaps and cooldown skills stay charge-only.

| Hero | Skills that chain |
|---|---|
| Chewy | Crescent Chomp (`chomp`), Swallow Return (`swallow`), Power Throw (`throw`) |
| Moka | Splash Bolt (`splash`), Kibble Missiles (`kibble`) |
| Poe | Fūma Throw (`fumaThrow`), Fūma Flurry (`fumaFlurry`), Kunai Fan (`kunaiFan`) |
| Floofy (Shih Tzu) | Woeful Wallop (`woefulWallop`), Glum Bonk (`glumBonk`) |
| Foosy (Golden) | Sunbeam Thrust (`sunbeamThrust`), Eager Jabs (`eagerJabs`), Bonk Dart (`bonkDart`) |
| Stella | Golden Ray (`goldenRay`), Solar Flare (`solarFlare`): her two spammable parasol spells |

15 skills. Stella's other cooldown-free actives were left out: Prism, Skipping Sun and Solar Ray (a channel) are her row-2+
spells, and Kind Light is a heal. Kunai Fan stays, with gentler cost perks (§3).

## 3. Numbers: the base chain and the perks
- **Base chain (no perks)**: steps 2 and 3 play the normal cast; the **finisher hits +15% harder** (every damage number
  of the cast: its hit, its burn). Sustained: **+5%** over the same taps with no chain.
- **Perks** (the same skill points as everything else; gated by the skill's own hard level like Charge perks; refunded
  by Rosie's tea like `chargePerks`). One set for every strike:

| Perk | Ranks · skill level | What a rank does |
|---|---|---|
| **Quick Hands** | 3 · Lv 1 / 3 / 6 | Steps 2 and the finisher play **5% faster** per rank (attack speed: the cast's animation and its hit frame together; +15% at 3) |
| **Light Touch** | 2 · Lv 2 / 5 | Steps 2 and the finisher cost **15% less zoom** per rank (−30% at 2) |
| **Free Finisher** | 1 · Lv 8 | A tapped finisher costs **no zoom** |
| **Tempo** (capstone) | 1 · Lv 10 | A finisher that lands gives **+8% attack speed for 3 s** to every Combo strike (never move speed) |

  - **Kunai Fan** is the one exception: its fans cost twice the others' and a tapping Poe runs out of zoom even in a short
    fight, so any saving is extra fans (with the common numbers it chained at ×1.56). Its Light Touch is **5%** a rank and
    its finisher perk is the **Thrifty Finisher** (a tapped finisher **40% off**).
- **Balance** (`node tools/combo-sim.mjs`; asserted by `tools/test-rpg.mjs`): the charge sim's model (a skill-build hero
  at level 30, the skill at 12, the same damage models, 70% packs / 30% single targets, the basic Attack filling any wait
  for zoom), a 60 s fight from a full pool:
  - no perks: **×1.05** for every strike (Kunai Fan ×1.04);
  - every perk: **×1.23–1.25** (median ×1.24): inside the +10–30% band; Quick Hands alone ×1.15–1.16, Tempo ×1.11–1.14
    (Fūma Throw ×1.11: the fūma's flight is most of its cycle); the chain itself bursts at ×1.15 the taps' damage rate;
  - in a 60 s fight from a full pool only Kunai Fan is short of zoom, so the cost perks count there and in long fights:
    over **3 minutes** (the pool runs dry) the full set is ×1.22–1.45 (Eager Jabs, the costliest of the common-numbered
    strikes, is the top; Woeful Wallop and Sunbeam Thrust ×1.36–1.37; the test caps it at ×1.5).

## 4. UI and feedback
- **K panel**: the Charge drawer gets a second tab, **Combo**, beside its ⚡ Charge tag (on trees with a combo skill).
  The Combo pane is the Charge card's twin: a strip of the tree's combo skills (learned bright, unlearned dimmed but open
  to preview), the skill's chain (Tap · Chain · Finisher, each with its zoom and speed at the hero's numbers), its four
  perks as linked nodes with rank pips and level gates, and a detail box (Now / Next with exact numbers; why one can't be
  bought). Learned perks glow; click buys a rank.
- **The tree**: each combo skill's node carries a small chain chip (points spent; it glows when a perk can be bought);
  clicking it shows that skill's Combo pane. The skill tooltip gains a "Tap again to chain" section.
- **Hotbar**: the chain pips while a chain is live (§1); slots whose skill has combo perks wear a small chain badge beside
  Charge's ⚡.
- **First-time guide**: "Tap, tap, finish!" (Shadow). Once the charge guide is done and the hero has cast a combo strike
  in a fight (`flags.comboTut`), it starts back in town (with a combo strike on the right mouse button): chain to a
  finisher, then K and the Combo tab.

## 5. Implementation notes
- **Data / rules**: `src/rpg/combo.js` (pure): the table (`COMBO`, attached as `SKILLS[id].combo`), the constants
  (`WINDOW`, `STEPS`, `FINISH_PCT`, `QUICK_PER_RANK`, `LIGHT_PER_RANK`, `TEMPO`), `comboRuntime(R, step, k, o)` (the
  step's cost, the finisher's damage, `R.combo`), `stepSpeed`, `stepCost`, `comboSteps`, `canLearnComboPerk` /
  `learnComboPerk`, `comboPerkPoints`, `migrateComboPerks`.
- **State**: `state.player.comboPerks = { [skillId]: { [perkId]: rank } }`, per hero (on `player`, so `normalizeHeroes`
  keeps it); `normalizeHeroes` gives every hero `{}` (older saves).
- **The chain**: `src/combat/combo.js` (`ComboController`, `G.skills.chain`), wired into `SkillRunner.tryCast` once, for
  every skill: `plan(id, charge)` before the cast (which step this cast would be), `comboRuntime` on its runtime,
  `commit` after it (the step starts; a finisher's looks and events). The step's speed reaches every hero's cast because
  it scales the **animator action** the cast started (and any action it chains into while the step runs): its duration
  and clock together, so the hit frames and events stay in sync whichever helper the cast used for its own speed
  (`animSpeed`, `castRate`, `castMul`).
- **Events**: `combo:step` { id, step }, `combo:finish` { id, charged }, `combo:drop` { id, step, reason }, `combo:land`
  { id }, `comboPerk:learned`. Action: `learnComboPerk(id, perkId)`.

## 6. QA
- `tools/test-rpg.mjs`: the table covers every listed strike that exists (cooldown-free, non-channel), the perks' costs and
  gates, `comboRuntime` math, migration, the respec refund, the balance band (`tools/combo-sim.mjs`).
- `tools/qa/s59-combo.mjs`: real inputs: chain to a finisher with taps on several heroes, the window drop, the buffered
  tap, another skill and a roll drop it, a hold-charge finisher, each perk's effect (speed, cost, free finisher, Tempo),
  the K panel's Combo pane (buying, gates), pad / touch parity, and the guide.
- `s19-charge.mjs` must still pass; `prod-smoke`.

## 7. As built
- **Code map**: rules `src/rpg/combo.js`; the chain `src/combat/combo.js` (`ComboController`, `G.skills.chain`; its debug
  actions: the menu's **Combo** section, grant every perk / clear and refund / log the steps); the finisher's looks
  `src/gfx/comboFx.js` (Charge's pooled ground ring and SpellFX sparkles); sounds `src/audio/combo.sfx.js`
  (`combo_step`, `combo_finish`); the K panel's pane `src/ui/comboPanel.js` inside `ChargeDrawer` (`mode`, `setMode`,
  `chooseCombo`); the hotbar `src/ui/comboHud.js`; styles `src/ui/combo.css`; the sim `tools/combo-sim.mjs` (its damage
  models are the charge sim's, exported as `tapDamage`); the look tool `tools/qa/combo-shots.mjs` (time frozen at the
  finisher's landing).
- **The hooks in `SkillRunner.tryCast`** (five one-liners): the busy queue keeps a *tapped* combo strike until its own step
  ends (`bufferFor`; a held key's repeats under Charge on hold: Off keep 0.25 s, so letting go never fires one more);
  `usable()` judges a chained step at its own cost (`zoomFor`: a Free Finisher goes off on an empty pool); `plan` +
  `apply` on the runtime; `commit` after the cast. `combat.hitMonster` tells the chain about a player hit (its first one
  after a finisher is the landing: the ring, Tempo). Shadow's bites (`source: 'shadow'`) don't count.
- **The window** opens when the step is over (the hero no longer busy, and for Fūma Throw the fūma home: `waitKey`), so a
  slow hero isn't punished for a long swing; it holds while the next press is in (a tap waits for its release) or charging.
- **Speed**: the step's action (and any it chains into while the step runs) has its duration and clock divided together,
  so every event (the hit, a release) stays on its frame; a held charge's release is never sped up. Fūma Throw's flight
  speed is scaled too (`speedKeys`), since the fūma's return is what lets the next throw go.
- **The K panel**: the Combo tab sits beside the Charge tag (hidden on trees with no combo skill: Pack Spirit, Duck Hunt,
  the hexes, the tome, the whelp, Dawn, Ninjutsu, Shadow Step); clicking either tag switches the card. The pane reuses
  the Charge card's classes, so it fits, scales and reads the same; its strip remembers a pick per tree; the drawer's fit
  measures the shown card's tallest skill. Spending a point (a learn, a perk) no longer re-measures every skill of the
  tree inside the click: the old height holds and the measure runs 0.4 s later (it cost ~45 ms on a tablet, enough to
  split a double-tap on a node into two taps). A phone's folded sheet keeps its one Charge tag (a second tag pushed it left over the tree's right-hand nodes, where s19's double-tap lands); the open sheet shows both tabs, inside its scrolling edge. The
  tree's chain chip sits at a combo node's top-right corner (hidden while the node is locked); on touch its hit area
  reaches only up and out, clear of the node's middle: Chrome's touch adjustment snaps a finger near the middle onto
  any clickable it overlaps, and a tap there must still learn, a double-tap still assign (s19 i).
- **QA**: `tools/qa/s59-combo.mjs` (a–f, `S59_ONLY`), in run-all; `node tools/test-rpg.mjs` (the COMBO CHAINS block);
  looks reviewed with `tools/qa/combo-shots.mjs` (`tools/qa/tmp/combo-shots/`) and s59's shots (`tools/qa/tmp/s59/`).
