// Run every QA scenario sequentially and print a summary.  usage: node tools/qa/run-all.mjs [s1 s3 ...]
// Needs the dev server on :5173 (npx vite --port 5173). Each scenario is also runnable on its own.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const ALL = ['gen-fuzz', 's1-roundtrip', 's2-combat', 's3-bosses', 's4-death', 's5-village-save', 's7-inventory', 's8-dialogue', 's9-input', 's10-misc', 's11-story-title', 's12-heroes', 's13-regions', 's14-village-plan', 's15-homestead', 's16-tutorials', 's17-housing', 's18-furniture-sources', 's19-charge', 's20-poe', 's21-zones', 's22-zone-dungeons', 's23-zone-villages', 's24-render-health', 's25-gamepad', 's26-deck', 's27-touch', 's28-shihtzu', 's29-golden', 's30-tiers', 's31-expeditions', 's32-peaceful', 's33-scavenge', 's34-guild', 's35-debug', 's36-autosave', 's37-cozy-story', 's38-autotarget', 's39-shadow-leads', 's40-pad-menus', 's41-maps', 's42-burrow-dens', 's43-town-portal', 's44-stash', 's45-inventory-grid', 's46-quest-moments', 's47-hero-arrivals', 's48-stella', 's49-coop', 's50-coop-panes', 's51-simple-stats', 's52-save-slots', 's53-expedition-rewards', 'profile-horde'];
// s31-expeditions: the cozy path's phase A (docs/COZY.md): the cozy route end to end with no fighting (Takemori saved by
// Moka alone), away heroes, the hold rule, time away, the pad and the phone; shots in tools/qa/tmp/s31-expeditions/.
// s33-scavenge: scavenging, the cozy path's phase C (docs/COZY.md §7): the nodes at home and in the zones, a gather, Shadow's
// nose, the hold-to-dig with the golden band on the keyboard, mouse, pad and touch, quest digs, Pound Mochi; shots in
// tools/qa/tmp/s33-scavenge/.
// s32-peaceful: the peaceful overworld (docs/COZY.md §6): a saved zone keeps only its wild areas' packs, the leash, the
// markers, the minimap and Travel Map, the Sightings board and its bounties, the pad and the phone; shots in tools/qa/tmp/s32-peaceful/.
// s34-guild: the Adventurers' Guild, the cozy path's phase D (docs/COZY.md §5): built from Build mode, Old Hachi and his
// talk, the panel and its boards, hires end to end (errands, a relief, levels, morale), wages over world days and time away,
// upgrades and tools, the debug actions, save and reload, the pad and the phone; shots in tools/qa/tmp/s34-guild/.
// s35-debug: the debug menu (docs/DEBUG.md; the cozy plan reserved s31–s34): the password, the lazy chunk, the actions,
// backup and restore, the pad and the phone; shots in tools/qa/tmp/s35-debug/.
// s36-autosave: the autosave (ROADMAP R-11): the timer on its own clock, event saves and the debounce, the boss-fight
// deferral, the .prev rotation and recovery, the quota, the paw glyph in the safe area; shots in tools/qa/tmp/s36-autosave/.
// s37-cozy-story: the story rerouted, the cozy path's phase E (docs/COZY.md §3): a fresh game to the first zone dungeon's
// crew clear with zero fights and no debug unlocks; the keepsakes in a room; all four sieges and their celebrations (parts
// a–c, ~5–10 min); shots in tools/qa/tmp/s37-cozy-story/.
// s37-full (opt-in: `run-all s37-full`, not in the default list): s37 with S37_FULL=1, which adds part d, the rest of the
// story from part a's save: the other three zones' reliefs and dungeons by crews with no fights (~1.5 h).
// s38-autotarget: auto targeting (docs/CONTROLS.md §13, ROADMAP CT-8): Settings › Controls › Targeting, every hero's skills
// hitting all round with no aim, walk up and flee on the pad and a phone, the picks, the mouse's Assist, the AoE marker; shots
// in tools/qa/tmp/ct8/ (all five heroes, ~8 min; S38_ONLY=a,b,… S38_HEROES=chewy,moka).
// s39-shadow-leads: Shadow leads the way (ROADMAP R-17): a guide's and a reach step's lead in the village (sprint, the hero
// stopping or far behind, the turns, the trail, the nose first), the setting, L / the tracker / the Journal, the pauses, no
// path, a zone, a dungeon floor's packs (stops short, fights, picks up), Foosy's whelp, the perf; shots in tools/qa/tmp/r17/.
// s40-pad-menus: controller menus on the bumpers (ROADMAP CT-11, docs/CONTROLS.md §14), a real virtual pad on the Deck's
// 1280×800: build mode's palette (LB / RB tabs, the grid, pick up, rotate, build, undo, remove, the Tools tab, Menu over it,
// the mouse's palette back); decorate and the tabbed menu join it in CT-11's next phases; shots in tools/qa/tmp/ct11/.
// s41-maps: the map and minimap (ROADMAP UX-1, docs/MAP.md): Blossom Hollow's markers and caps, the People and Places
// directory, a pick's pin (the quest arrow, the rim's edge pin, arriving), "Shadow, take me there", the mouse, the pad on
// the Deck, touch on a phone, Settings › Minimap and the lens, the disc's perf; shots in tools/qa/tmp/s41-maps/.
// s42-burrow-dens: the Burrow's four 2-floor dens (ROADMAP Z-H1, docs/ZONES.md §4.1): the door's picker (keys, the pad, a
// phone), every den end to end and the unlocks, the den quests and the pointer, old saves migrated, a crew's win.
// s43-town-portal: the Town Portal (ROADMAP Z-H2, docs/ZONES.md §4.2): a den's round trip by T (the floor rebuilt as left),
// a fizzle, no portal mid boss fight, a fallen boss kept, a zone dungeon's cages, closing and replacing, a save and reload,
// the pad's Game page, a phone's button and Shadow's tip.
// s44-stash: the stash outside and its tabs (ROADMAP R-18, R-19; docs/HOUSING.md "The stash"): the Stash Chest placed in
// build mode and opened on the keyboard, the pad and touch, the tabs bought, renamed and coloured, the quick move and a drop
// on a tab's header, the save migration from a real 0.5.1 save, a save and reload; shots in tools/qa/tmp/s44-stash/.
// s45-inventory-grid: items take up space (ROADMAP R-20 to R-22; docs/INVENTORY.md): footprints, the drag's footprint and
// swaps, no room (loot, a shop, rewards to Lost & Found), Sort, the stash's filter, the pad and touch, Treats and the save
// migrations; shots in tools/qa/tmp/s45-inventory-grid/.
// s46-quest-moments: quests as moments (ROADMAP UX-2; docs/QUESTS.md): the quest card on accept (keys, pad, touch; queued
// in a fight, a dialogue, build mode; kept over a reload), a request's slip, the quiet QA sessions' banner, the place titles.
// s48-stella: Stella, the sixth hero (docs/STELLA.md): her arrival and an old save (Kaizo's quest running), playing her in the
// village, a zone, the Burrow and a horde fight, every active tapped and charged with every perk, heals and sun shells on
// her and Shadow (Sun Dog, the 6 s wake), the `ally` aim, the wagasa's carry and casts, the pad and touch, a save and reload.
// s49-coop: couch co-op (docs/COOP.md): joining from a spare pad, players 2-4 walking and fighting as their heroes,
// the camera and the on-screen leash, monsters choosing a hero, shared XP, switching, downed and revived, the pack moving
// together (stairs, a zone, a house, home), a lost controller, a villager talking to player 2, leaving, save and reload.
// s50-coop-panes: couch co-op's shared bag panes (docs/COOP.md §5): one, two and four at once on the Deck's 1280×800,
// equip to the right hero, a carry seen live in another pane, drops at that hero, stats (Y Shadow picks), skills, leaving.
// s51-simple-stats: simple stats (docs/STATS.md, ROADMAP UX-3): Shadow picks the points, the Character screen's Power, six
// numbers, Start over and drawer, the bag's green arrows, simple item tooltips, Shift, Settings › Item details, L3 on a pad.
// s52-save-slots: save slots (ROADMAP SL-1, core/autosave.js + ui/title.js): three adventures, New Game into an empty slot, Load Game reloads onto another, Continue the last played, delete asks first, all full offers Start over, the pad, a damaged slot
// s53-expedition-rewards: a crew's haul waits in its report for Receive rewards (docs/COZY.md §4.5): nothing in the purse until pressed, the chip's "!", the fly to the purse and bag, a full bag (Take all), the trim and a reload keep it, Enter and the pad's A, the away card's "Get rewards"
// s47-hero-arrivals: the heroes arrive in Blossom Hollow (ROADMAP Z-H3; docs/ZONES.md §3.1): the triggers and the order, the
// island scene end to end, the card, the homeland quest by you, a crew and the hero you play, old saves, the pad, touch.
// s26-deck: the Steam Deck profile (CONTROLS §10). Its full panel sweep (tools/qa/deck-ui.mjs) and the frame times
// (tools/qa/deck-perf.mjs) run on their own.
// s24-render-health builds and serves its own production bundle (the NaN probe, flash-free sessions, menu first opens:
// ROADMAP R-7 / R-8).
// profile-horde: the horde perf gate (ROADMAP Z-B5) — 150 / 250 mixed monsters in a Burrow floor and a region for Chewy,
// Moka and Poe; FAILS when a 150 fight's CPU frame p95 is over max(8 ms, its floor-alone baseline + 3 ms) after one
// retry (ZONES §7.1; prints a machine-load verdict); 250 is reported only. ~5 min. `run-all s` skips it (scenario
// prefixes), `run-all profile` runs it alone.
const want = process.argv.slice(2);
const OPT_IN = { 's37-full': { file: 's37-cozy-story', env: { S37_FULL: '1' }, timeout: 150 } }; // (named entries, only when asked for)
const SLOW = { 's47-hero-arrivals': 30 }; // (minutes: suites that need more than the 15 by default: s47 plays four whole arrivals and their old saves)
const list = want.length ? [...ALL.filter(n => want.some(w => n.startsWith(w)) && !(n === 's37-cozy-story' && want.includes('s37-full'))), ...Object.keys(OPT_IN).filter(n => want.includes(n))] : ALL;
const summary = [];
for (const name of list) {
  const t0 = Date.now();
  const O = OPT_IN[name];
  const r = spawnSync(process.execPath, [path.join(dir, (O?.file || name) + '.mjs')], { encoding: 'utf8', timeout: (O?.timeout || SLOW[name] || 15) * 60 * 1000, maxBuffer: 64 * 1024 * 1024, env: { ...process.env, ...(O?.env || {}) } });
  const out = (r.stdout || '') + (r.stderr || '');
  process.stdout.write(out);
  const fails = out.split('\n').filter(l => /^\s+FAIL\s/.test(l)).map(l => l.replace(/^\s+FAIL\s+/, '').split('  — ')[0]);
  summary.push({ name, code: r.status, secs: ((Date.now() - t0) / 1000) | 0, fails });
}
console.log('\n================ QA SUMMARY ================');
for (const s of summary) {
  console.log(`${s.code === 0 ? 'PASS' : 'FAIL'}  ${s.name.padEnd(16)} ${String(s.secs).padStart(4)}s  ${s.fails.length ? s.fails.length + ' failing checks' : ''}`);
  for (const f of s.fails) console.log(`        - ${f}`);
}
process.exit(summary.some(s => s.code !== 0) ? 1 : 0);
