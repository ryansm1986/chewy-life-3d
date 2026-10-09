// The guided tutorials (docs/TUTORIALS.md): their steps, run by world/tutorials.js.
//  - switch: Moka, right after she joins: Tab to play her, her spells, find Chewy, switch back, what's shared.
//  - house:  Shadow, after Rosie's welcome (once Moka's arrival scene is over): the cottage (inside: the chest, the bed,
//            the stove), the garden bed (till, plant, water), the Pantry, and where seeds come from.
//  - fishing: Kero, as soon as you have a rod: the bank, the cast, the wait, the bite, the reel, the Fish Log. Its lines
//            follow the device (touch: tap Fish, tap the screen, hold the screen; the menu's Journal); the fish
//            always lands (R-12).
//  - makeHome: Shadow, the next time you're in the cottage after the house tour (docs/HOUSING.md §7): the household
//            jobs, B to decorate, a cushion from storage, moving and turning it, a wallpaper, the Home Rating, and where
//            more furniture comes from.
//  - remodel: Tanu, the first time a mailbox is opened: the house card (Upgrade / Remodel / Enter), the style sets, a
//            swatch, the cost.
//  - charge: Shadow, back in town after the first Burrow trip (docs/CHARGE.md §4): hold right-click to charge a skill to
//            Stage Ⅰ and let go, the charge perks in the K panel's Charge card, tap vs hold.
//  - meetPoe: Poe, in town after she joins (docs/POE.md §6): tap Tab for the next hero, hold Tab for the hero wheel and
//            pick her, her fūma and her trees, and the mini portraits.
//  - meetShihtzu: the Shih Tzu, in town after he joins (docs/SHIHTZU.md §5): the hero wheel with four, his flail (the
//            combo and Woeful Wallop), Dripping Paw and the hexes, the Gloom Blanket, his trees. His name reads
//            CLASSES.shihtzu.name (the owner's to pick).
//  - meetGolden: Foosy, in town after he joins (docs/GOLDEN.md §5): the hero wheel with five, his lance (the reach combo,
//            Sunbeam Thrust), Bonk Dart, Shadow the dragon whelp taking off beside him (keyed on his flight), his trees.
//            His name reads CLASSES.golden.name.
import * as THREE from 'three';
import { POND } from './layout.js';
import { SKILLS } from '../rpg/skills.js';
import { pantryIcon } from '../life/pantryIcons.js';
import { PANTRY } from '../life/pantry.js';
import { FURNITURE, SURFACES, tabOf } from '../home/furniture.js';
import { CLASSES } from '../rpg/classes.js';
import { Actions } from '../core/actions.js';

const V = (x, z) => new THREE.Vector3(x, 0, z);
const dist = (G, p) => Math.hypot(G.player.pos.x - p.x, G.player.pos.z - p.z);
const npc = (G, id) => G.npcs?.find(n => n.id === id && n.visible !== false) || null;
const me = G => G.heroes?.name?.() || 'Chewy';
const prompt = '.hud .prompt.show';

// ------------------------------------------------------------------ the fishing guide (Kero)
const kero = G => G.npcs?.find(n => n.id === 'kero') || null;
const touch = () => Actions.device === 'touch'; // (the lines in touch's words: the director re-says them when the device changes)
const tt = (t, k) => () => (touch() ? t : k);
// the reel card's coach callouts: on the side away from the hero (ui/reel.js .side) when there's room for them there,
// else on the roomier side; all pointing from just past the card
const reelCalls = G => {
  const R = G.ui?.reel, b = R?.$?.card?.getBoundingClientRect?.(), need = 230 * Math.max(0.62, G.ui?.scale || 1);
  let sd = R?.side === 'l' ? 'left' : 'right';
  if (b?.width) { const room = { left: b.left, right: innerWidth - b.right }, other = sd === 'left' ? 'right' : 'left'; if (room[sd] < need && room[other] > room[sd]) sd = other; }
  const edge = '.reel.show .rl-card';
  return [{ el: '.reel.show .rl-zone', edge, text: touch() ? 'Your zone: *hold the screen* to lift it' : 'Your zone: *hold F* to lift it', side: sd }, { el: '.reel.show .rl-fish', edge, text: 'The fish', side: sd, at: 0.5 }, { el: '.reel.show .rl-meter', edge, text: 'Catch meter: fill it up!', side: sd, at: 0.12 }];
};
/** a bank spot on the koi pond, on the side nearest the player (any hour, wherever Kero has wandered) */
function pondSpot(G) {
  const F = G.life.fishing, P = G.player.pos, c = { x: POND.x, z: POND.z }, a0 = Math.atan2(P.z - c.z, P.x - c.x);
  for (let k = 0; k < 16; k++) {
    const a = a0 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.39, r = POND.r + 1.2;
    const s = F.bankSpotNear(c.x + Math.cos(a) * r, c.z + Math.sin(a) * r, c);
    if (s) return s;
  }
  return { x: 152.5, z: 146, face: -Math.PI / 2 };
}
/** Kero stops his day and stands on the bank beside the spot (he walks over if he's close, else he hops over — out of
 *  his house too, at night) until the first catch is in. */
function claimKero(G, T) {
  const k = kero(G), s = T.data.spot; if (!k || !s || k.tutClaim) return;
  const W = G.world, F = G.life.fishing, fx = Math.sin(s.face), fz = Math.cos(s.face);
  let at = null;
  for (const [u, v] of [[1.5, 0], [-1.5, 0], [1.6, -0.6], [-1.6, -0.6], [0.6, -1.4], [-0.6, -1.4]]) { // beside it, along the bank (or a step behind)
    const x = s.x + fz * u + fx * v, z = s.z - fx * u + fz * v;
    if (W.walkable?.(x, z) && !F.water(x, z) && !W.collision?.solidAt?.(x, z, 0.3)) { at = { x, z }; break; }
  }
  at ||= { x: s.x - fx * 1.3, z: s.z - fz * 1.3 };
  const out = !k.visible || k.state === 'inside' || k.state === 'hidden' || k.state === 'door';
  k.retire(); // (let go of seats, chats and props; wakes him up if he was in bed)
  k.door = null; k.doorScale = 1; k.doorLift = 0; k.sleepy = false; k.sleepyWait = 0; k.knocked = false; k.state = 'idle';
  k.frozen = true; k.tutClaim = true; k.talking = false;
  const d = Math.hypot(k.pos.x - at.x, k.pos.z - at.z);
  if (out || d > 11) { k.setPos(at.x, at.z); k.faceTo(s.x + fx * 3, s.z + fz * 3); k.facing = k.faceTarget; G.vfx?.dust?.(k.pos, { n: 6, color: '#ffffff', size: 0.5 }); }
  else k.scriptWalk = { x: at.x, z: at.z, speed: 1.3, t: 0, done: () => { k.faceTo(s.x + fx * 3, s.z + fz * 3); } };
  T.data.keroAt = at;
}
function releaseKero(G) {
  const k = kero(G); if (!k?.tutClaim) return;
  k.tutClaim = false; k.frozen = false; k.scriptWalk = null; k.state = 'idle'; k.t = 2 + Math.random() * 2; k.anim?.play?.('wave');
}
const fishing = {
  title: 'Fishing with Kero', narrator: 'kero', color: '#8fd0ff', priority: 2,
  blurb: 'Cast, wait for the bite, win the reel, and fill your Fish Log.',
  offer: 'Kero can walk you through casting, the bite and the reel.',
  icon: () => pantryIcon('koi'),
  trigger: G => (G.state.fishing?.rod || 0) >= 1,
  locked: G => ((G.state.fishing?.rod || 0) >= 1 ? null : 'Get a rod from Kero first (from day 2)'),
  // (start and resume: the spot and Kero beside it, whichever step a reload resumes at)
  onStart: (G, T) => { T.data.spot = pondSpot(G); if (!['log', 'wrap'].includes(T.S.fishing?.step)) claimKero(G, T); },
  onEnd: G => { if (G.life?.fishing) G.life.fishing.tut = null; releaseKero(G); },
  steps: [
    { id: 'walk', say: "Ribbit! Let's try it right now. Come and stand on the bank here, beside me.", objective: 'Walk to the marked spot on the bank',
      onEnter: (G, T) => claimKero(G, T),
      target: (G, T) => ({ pos: V(T.data.spot.x, T.data.spot.z), label: 'Fishing spot' }),
      done: (G, T) => dist(G, T.data.spot) < 1.3 || (G.life.fishing.target?.spot === 'pond' && !G.life.fishing.target.blocked) },
    { id: 'cast', say: tt('Face the water and tap *Fish* (or the attack button) to cast. Nice and easy.', 'Face the water and press *F* to cast. Nice and easy.'),
      objective: tt('Face the water and tap *Fish* to cast', 'Face the water and press *F* to cast'),
      // (the first cast: a sure bite after 3.2 s, a long window and a bite that comes back, a wide zone, and it always lands)
      onEnter: G => { G.life.fishing.tut = { biteAfter: 3.2, window: 2, fish: 'crucian', zone: 0.42, drain: 0.4, floor: 0.05, forgiveEarly: true, retryBite: true }; },
      target: (G, T) => (G.life.fishing.target && !G.life.fishing.target.blocked ? null : { pos: V(T.data.spot.x, T.data.spot.z), label: 'Fishing spot' }),
      highlight: () => prompt, waitFor: 'fishing:cast', allow: { switching: false } },
    { id: 'wait', resumeAt: 'cast', say: tt("Now watch the float — don't tap yet! Little dips are *nibbles*: the fish is only tasting.", "Now watch the float — don't press yet! Little dips are *nibbles*: the fish is only tasting."), objective: 'Watch the float… wait for the big splash',
      on: {
        'fishing:nibble': (p, T) => T.say("A nibble… not yet. Wait for the *big splash* and the \"!\""),
        'fishing:early': (p, T) => T.say(touch() ? 'Patience! That was only a nibble. Wait for the splash, then tap the screen.' : 'Patience! That was only a nibble. Wait for the splash, then press *F*.'),
        'fishing:end': (p, T) => { if (p.result !== 'catch') T.goto('cast', { say: 'You reeled in. Cast again whenever you like — *F* facing the water.' }); },
      }, waitFor: 'fishing:bite' },
    // (the bite's "NOW!" is the big cue at the float itself, ui/reel.js, not a flash in the middle of the screen over it)
    { id: 'bite', resumeAt: 'cast', say: tt('NOW! Tap the screen!', 'NOW! Press *F*!'), objective: tt('Tap the screen — quick!', 'Press *F* — quick!'),
      on: {
        'fishing:miss': (p, T) => T.goto('wait', { say: "Ribbit… a little slow, but it's coming back! Watch for the next splash." }),
        'fishing:end': (p, T) => T.goto('cast', { say: "Ribbit… you reeled in. Cast again whenever you like!" }),
      },
      waitFor: 'fishing:reel' },
    { id: 'reel', resumeAt: 'cast', say: tt('Hold a finger anywhere on the screen to lift the green zone, and let go to let it sink. Keep the fish inside it to fill the meter!', 'Hold *F* to lift the green zone, let go to let it sink. Keep the fish inside it to fill the meter!'), objective: 'Keep the fish in the green zone until the meter is full',
      callouts: reelCalls,
      on: { 'fishing:end': (p, T) => { if (p.result !== 'catch') T.goto('cast', { say: p.result === 'escape' ? 'It wriggled free! Keep the green zone right on the fish. Cast again!' : 'Cast again — you nearly had it!' }); } },
      waitFor: 'fish:caught' },
    { id: 'log', say: tt('A crucian carp! Every catch goes into your *Fish Log*. Tap the menu button, then *Journal*, then the Fish Log tab.', 'A crucian carp! Every catch goes into your *Fish Log*. Open your Journal (*J*), then the Fish Log tab.'),
      objective: tt('Menu → *Journal* → Fish Log', 'Open the Journal (*J*) → Fish Log'),
      onEnter: G => { G.life.fishing.tut = null; releaseKero(G); }, // (the first fish is in: Kero gets on with his day)
      // (touch has no Journal button on the HUD: the menu button, then the menu's Journal)
      highlight: G => (G.ui.isOpen('quests') ? '.p-quests .q-tabs .tab[data-t="fish"]' : !touch() ? '.hud .mb[data-open="quests"]' : G.ui.isOpen('menu') ? '.p-menu [data-a="open:quests"]' : '.tc.on .tc-menu'),
      allow: { panels: ['quests', 'menu'] }, done: G => G.ui.isOpen('quests') && G.ui.panels.quests.tab === 'fish' },
    { id: 'wrap', say: 'Different fish bite in the river, at the sea and at night. Sell them at my Fishing Hut, or cook them at home. Catch two more for my quest — ribbit!', objective: "Catch 3 fish for Kero's quest — try other spots and times",
      ack: true, allow: { panels: ['quests'] } },
  ],
};

// ------------------------------------------------------------------ the house tour (Shadow)
const homeTiles = G => G.life?.garden?.beds?.[0]?.tiles || [];
const anyTile = (G, f) => homeTiles(G).some(i => f(G.life.garden.rec(i) || {}, i));
const hasSeeds = G => Object.keys(G.state.pantry || {}).some(k => PANTRY[k]?.kind === 'seed' && G.state.pantry[k] > 0);
// the cottage tour (indoors since docs/HOUSING.md §1): the household jobs are furniture now
const TOUR = [
  ['stash', 'Your treasure chest! The stash is shared — Moka can use it too.'],
  ['sleep', 'Your bed! Sleep skips to morning: your crops grow, the village pays its daily income, and the game saves.'],
  ['cook', 'And the kitchen stove! Cook your crops and fish into yummy dishes.'],
];
const USE_NAME = { stash: 'Treasure chest', sleep: 'Bed', cook: 'Kitchen stove' };
const useSpot = (G, use) => { const it = G.mode === 'interior' ? G.world.interactables.find(i => i.use === use) : null; return it ? { pos: it.pos, label: USE_NAME[use] } : null; };
const matSpot = G => { const it = G.mode === 'interior' ? G.world.interactables.find(i => i.door) : null; return it ? { pos: it.pos, label: 'Door mat' } : null; };
const house = {
  title: 'Home, sweet home', narrator: 'shadow', color: '#ffb07a', priority: 1,
  blurb: 'Chewy\'s Cottage: the treasure chest, the bed and the stove inside, the garden bed and the Pantry.',
  offer: 'Shadow can show you around the cottage and the garden.',
  icon: () => pantryIcon('turnip'),
  trigger: G => G.state.quests?.done?.includes('welcome') && !G.introJoinPending,
  steps: [
    { id: 'door', say: G => `Yip yip! Follow me, ${me(G)} — this is home!`, objective: "Go to Chewy's Cottage",
      target: G => ({ pos: G.heroes.homeDoor(), label: "Chewy's Cottage" }), done: G => dist(G, G.heroes.homeDoor()) < 2.6 },
    { id: 'enter', say: 'Press *F* at the door to go inside.', objective: 'Press *F* at the cottage door',
      target: G => ({ pos: G.heroes.homeDoor(), label: "Chewy's Cottage" }), highlight: () => prompt, waitFor: 'home:enter' },
    { id: 'inside', resumeAt: 'enter', say: 'Home sweet home! Let me show you around…', objective: 'Look around the cottage', allow: { interior: true, dialogue: true, panels: ['stash', 'cook'] },
      onEnter: (G, T) => { T.data.ti = -1; T.data.tt = 0.8; T.data.tgt = null; },
      tick: (G, T, dt) => { // the arrow hops from the chest to the bed to the stove, then the door mat
        if (G.mode !== 'interior') return;
        T.data.tt -= dt;
        if (T.data.tt > 0 || T.data.ti >= TOUR.length) return;
        T.data.ti++; T.data.tt = 3.2;
        if (T.data.ti < TOUR.length) { const [use, line] = TOUR[T.data.ti]; T.data.tgt = useSpot(G, use); if (T.data.tgt) T.say(line); else T.data.tt = 0; }
        else { T.data.tgt = matSpot(G); T.say("Use them any time with *F*. Now step on the door mat and press *F* — or just walk out — and I'll show you the garden!"); }
      },
      target: (G, T) => T.data.tgt, waitFor: 'home:exit' },
    { id: 'garden', objective: 'Go to your garden bed', allow: { panels: ['stash'] },
      onEnter: (G, T) => {
        const F = G.state.flags;
        if (!hasSeeds(G) && !F.shadowSeeds) { F.shadowSeeds = true; G.actions.addPantry('turnipSeed', 3, { src: 'gift' }); G.ui?.pantryGain?.('turnipSeed', 3, {}); T.data.gift = true; }
      },
      say: (G, T) => (T.data.gift ? 'And this is your garden bed! Here — a housewarming present: *3 turnip seeds*. Woof!' : "And this is your garden bed! Let's grow something."),
      target: G => { const g = G.life.garden, i = homeTiles(G)[5] ?? homeTiles(G)[0]; return { pos: g.centre(i), label: 'Garden bed' }; },
      done: G => G.life.garden.target != null || dist(G, G.life.garden.centre(homeTiles(G)[5] ?? homeTiles(G)[0])) < 2 },
    { id: 'till', say: 'Stand at a tile and press *F*: the hoe tills the soil.', objective: 'Till a tile (*F*)',
      target: G => (G.life.garden.target == null ? { pos: G.life.garden.centre(homeTiles(G)[5] ?? homeTiles(G)[0]), label: 'Garden bed' } : null),
      highlight: () => prompt, waitFor: 'garden:till', done: G => !anyTile(G, (r, i) => G.life.garden.usable(i) && !G.life.garden.tilled(i)) },
    { id: 'plant', say: 'Now press *F* again and pick a seed to plant.', objective: 'Plant a seed (*F*, then pick one)', allow: { panels: ['seeds'] },
      highlight: G => (G.ui.isOpen('seeds') ? '.p-seeds .sp-card.on' : prompt), waitFor: 'garden:plant',
      done: (G, T) => !hasSeeds(G) && !G.ui.isOpen('seeds') && (T.say("No seeds left — Usagi sells them. Let's keep going!"), true) },
    { id: 'water', say: 'And water it with *F*! A watered crop grows one stage every night.', objective: 'Water your seedling (*F*)',
      highlight: () => prompt, waitFor: 'garden:water', done: G => !anyTile(G, r => r.crop && !r.wet) },
    { id: 'pantry', say: 'Your crops, fish and dishes all live in the *Pantry*. Press *P* (or click here)!', objective: 'Open the Pantry (*P*)', allow: { panels: ['inventory'] },
      highlight: G => (G.ui.isOpen('inventory') ? null : '.hud .mb[data-open="pantry"]'), done: G => G.ui.isOpen('inventory') && G.ui.panels.inventory.view === 'pantry' },
    { id: 'wrap', say: 'Sleep at home to make crops grow overnight. And Usagi sells more seeds at her stall in the South Meadows — follow the arrow any time!', objective: "Usagi's Seed Stall sells more seeds",
      target: G => (G.seedStall ? { pos: G.seedStall.pos, label: "Usagi's Seed Stall" } : null), ack: true, allow: { panels: ['inventory'] } },
  ],
};

// ------------------------------------------------------------------ switching heroes (Moka)
const skillName = id => (id === 'attack' ? 'my staff bonk' : SKILLS[id]?.name || id);
const sw = {
  title: 'Two heroes', narrator: 'moka', color: '#5ce0d0', priority: 0,
  blurb: 'Switch between Chewy and Moka, and what the pack shares.',
  offer: 'Moka can show you how to switch heroes.',
  icon: null,
  trigger: G => !!G.heroes?.joined('moka'),
  locked: G => (G.heroes?.joined('moka') ? null : 'Meet Moka by the fountain first'),
  onEnd: G => { const H = (G.state.flags.hints ||= {}); H.tabSwitch = true; }, // (Shadow's old Tab tip retires)
  steps: [
    { id: 'tab', say: 'Press *Tab* — or click here — to play as me!', objective: 'Switch to Moka (*Tab*)', allow: { switching: true },
      onEnter: G => { (G.state.flags.hints ||= {}).tabSwitch = true; },
      highlight: G => (G.heroSwitching ? null : '.hud .hsw'), done: G => G.state.activeHero === 'moka' && !G.heroSwitching },
    { id: 'spells', objective: G => `Say hi to ${G.heroes.name('chewy')} — he's hanging out in town`,
      say: G => { const P = G.state.player, set = P.mouseSets?.[P.activeWeapon || 0] || P.hotbar || []; return `I fight with spells! Left-click is *${skillName(set[0] || 'attack')}*, right-click is *${skillName(set[1] || 'splash')}*. And look — Chewy is hanging out in town now.`; },
      highlight: () => '.hud .hb.mouse',
      target: G => { const c = G.heroes.villagers?.chewy; return c ? { pos: c.pos, label: 'Chewy', npc: true } : null; },
      // (a moment to read first: right after the swap Chewy can be standing just beside Moka)
      done: (G, T) => { const c = G.heroes.villagers?.chewy; return G.state.activeHero !== 'moka' || (T.cur.t > 3 && c && dist(G, c.pos) < 3.2); } },
    { id: 'back', say: 'Talk to him to switch back — or press *Tab* when the swirl is ready.', objective: 'Switch back to Chewy (talk to him, or *Tab*)', skippable: true,
      allow: { dialogue: true, switching: true }, highlight: G => (G.ui.dlg?.active || G.heroSwitching ? null : '.hud .hsw'),
      target: G => { const c = G.heroes.villagers?.chewy; return c ? { pos: c.pos, label: 'Chewy', npc: true } : null; },
      done: G => G.state.activeHero === 'chewy' && !G.heroSwitching },
    { id: 'wrap', say: "We share the bag and the coins, but weapons are ours alone: the sword and ball for Chewy, my staff for me. We each level up on our own, and Well Fed is per hero too. Have fun, and let's go splash some yokai!", objective: 'Two heroes, one pack', ack: true },
  ],
};

// ------------------------------------------------------------------ making the cottage home (Shadow, docs/HOUSING.md §7)
const inCottage = G => G.mode === 'interior' && !!G.housing?.home?.household;
const houseDone = G => !!G.state.flags.tutorials?.house?.done;
const JOBS = [['sleep', 'Bed'], ['stash', 'Treasure chest'], ['cook', 'Kitchen stove'], ['craft', 'Workbench']];
const decoOpen = G => !!G.housing?.decor?.active;
const store = G => G.state.furniture || {};
const cushionId = G => ['zabutonBlue', 'zabutonPink'].find(id => store(G)[id] > 0) || 'zabutonBlue';
const wallpaperId = G => Object.keys(store(G)).find(id => SURFACES[id]?.kind === 'wall' && store(G)[id] > 0 && id !== G.world?.wallId) || null;
// the Home Rating's favourite-piece tip (home/rating.js names one, R-13): the piece it names when it's in storage
const likes = G => G.housing?.tasteOf?.(G.housing.rec?.data)?.likesFurniture || [];
const favHave = G => { const id = G.housing?.ratingNow?.()?.has?.fav; return id && store(G)[id] > 0 ? id : null; };
const favCard = G => { const id = favHave(G); if (!id) return null; const P = G.ui.panels.decorate; return P.tab !== 'all' && tabOf(FURNITURE[id]) !== P.tab ? '.p-decor .tab[data-t="all"]' : `.p-decor .card[data-id="${id}"]`; };
const dev3 = (t, p, k) => () => (Actions.device === 'touch' ? t : Actions.device === 'pad' ? p : k); // (touch, pad, keys and mouse: said again when the device changes)
/** the way into decorate mode: the HUD's Decorate button (mouse), or the menu's Decorate (touch: its menu button; the pad: Start) */
const decoBtn = G => (Actions.device === 'touch' || Actions.device === 'pad' ? (G.ui?.isOpen?.('menu') ? '.p-menu [data-a="decorate"]' : touch() ? '.tc.on .tc-menu' : null) : '.home-tools .deco-btn');
const favLine = (G, id) => `Your *${FURNITURE[id].name}* is one of your favourites: see the heart on its card? ${touch() ? 'Tap it' : 'Pick it'}, then ${FURNITURE[id].mount === 'wall' ? 'hang it on a wall' : 'put it down'}${touch() ? ' with *Set down*' : ''}!`;
const makeHome = {
  title: 'Make it home', narrator: 'shadow', color: '#ff8fb0', priority: 3, indoors: true,
  blurb: 'Decorate the cottage: place, turn and move furniture, change the wallpaper, and the Home Rating.',
  offer: 'Shadow has ideas for making the cottage extra cosy.',
  icon: () => pantryIcon('strawberry'),
  trigger: G => houseDone(G) && inCottage(G),
  past: G => houseDone(G) && !!(G.state.flags.homeVisits || G.housing?.cottage?.()?.data.interior), // (an old save: you've been inside before)
  locked: G => (houseDone(G) ? null : 'Finish "Home, sweet home" first'),
  steps: [
    { id: 'home', say: G => `Let's make the cottage really feel like home, ${me(G)}! Pop inside — *F* at the door.`, objective: "Go into Chewy's Cottage", allow: { interior: true },
      target: G => (G.mode === 'village' ? { pos: G.heroes.homeDoor(), label: "Chewy's Cottage" } : null), highlight: G => (dist(G, G.heroes.homeDoor()) < 2.6 ? prompt : null),
      done: G => inCottage(G) },
    { id: 'jobs', say: 'The bed, the chest, the stove and the workbench all work with *F*. But it could be cosier in here…', objective: 'Look around the cottage', allow: { interior: true },
      onEnter: (G, T) => { T.data.ji = -1; T.data.jt = 0; },
      tick: (G, T, dt) => { if ((T.data.jt -= dt) > 0) return; T.data.ji = (T.data.ji + 1) % JOBS.length; T.data.jt = 1.6; },
      target: (G, T) => { const [use, label] = JOBS[Math.max(0, T.data.ji)]; const it = G.mode === 'interior' ? G.world.interactables.find(i => i.use === use) : null; return it ? { pos: it.pos, label } : null; },
      done: (G, T) => T.cur.t > 6.6 },
    // (R-13: every line in the device's words; touch and the pad reach Decorate through the menu, the HUD's button is
    //  the mouse's. The rating step's tip is one you can follow: the favourite it names, hung or put down)
    { id: 'decorate', say: dev3('Tap the menu button, then *Decorate*!', 'Open the menu (*Esc*) and pick *Decorate*!', 'Press *B* — or the *Decorate* button — to decorate!'),
      objective: dev3('Menu → *Decorate*', 'Menu (*Esc*) → *Decorate*', 'Press *B* to decorate'), allow: { interior: true, panels: ['decorate', 'menu'] },
      highlight: G => (decoOpen(G) ? null : decoBtn(G)), done: G => decoOpen(G) },
    { id: 'place', resumeAt: 'decorate', say: dev3('This is your storage. Tap the cushion, slide it where you like it, then tap *Set down*.', 'This is your storage. Pick the cushion, move the paw over the floor and press *F* to put it down.', 'This is your storage. Pick the cushion, then click the floor to put it down.'),
      objective: 'Place the cushion on the floor', allow: { interior: true, panels: ['decorate', 'menu'] },
      onEnter: G => { if (!(store(G).zabutonBlue > 0) && !(store(G).zabutonPink > 0)) G.actions.addFurniture('zabutonBlue', 1, { src: 'gift' }); },
      highlight: G => (!decoOpen(G) ? decoBtn(G) : G.housing.decor.sel ? (touch() ? '.tc-place' : null) : `.p-decor .card[data-id="${cushionId(G)}"]`),
      waitFor: { event: 'decor:place', test: p => FURNITURE[p.id]?.mount !== 'wall' } },
    { id: 'move', resumeAt: 'decorate', say: dev3('Woof! Now tap it to pick it up, *Turn* it, slide it somewhere new and tap *Set down*.', 'Woof! Now press *F* on it to pick it up, turn it with *Y*, and press *F* again somewhere new.', 'Woof! Now click it to pick it up, press *R* to turn it, and click again to put it down somewhere new.'),
      objective: dev3('Pick it up, *Turn* it, *Set down*', 'Pick it up, turn it (*Y*), put it down', 'Pick it up, turn it (*R*), put it down'), allow: { interior: true, panels: ['decorate', 'menu'] },
      highlight: G => (!decoOpen(G) ? decoBtn(G) : touch() && G.housing.decor.hold ? ['.tc-rot', '.tc-place'] : null), waitFor: 'decor:move' },
    { id: 'wallpaper', resumeAt: 'decorate', say: 'Ooh, and new wallpaper! Open *Wallpaper & Floors* and pick one.', objective: 'Change the wallpaper', allow: { interior: true, panels: ['decorate', 'menu'] },
      onEnter: G => { if (!wallpaperId(G)) G.actions.addFurniture('wp_dots', 1, { src: 'gift' }); },
      highlight: G => { if (!decoOpen(G)) return decoBtn(G); const P = G.ui.panels.decorate; if (P.tab !== 'surface') return '.p-decor .tab[data-t="surface"]'; const w = wallpaperId(G); return w ? `.p-decor .card[data-id="${w}"]` : null; },
      waitFor: { event: 'decor:surface', test: p => p.kind === 'wall' } },
    { id: 'rating', resumeAt: 'decorate', allow: { interior: true, panels: ['decorate', 'menu'] }, ack: true,
      // (a favourite in storage: the starter Pack Photo, or a gift when none is there and the tip asks for one)
      onEnter: G => { const R = G.housing?.ratingNow?.(); if (R && R.has.loved < 3 && !favHave(G) && likes(G).includes('packPhoto') && !G.world?.items?.some(i => i.id === 'packPhoto')) G.actions.addFurniture('packPhoto', 1, { src: 'gift' }); },
      say: G => `See the stars? That's your *Home Rating*, and its tip says what would make it even cosier. ${favHave(G) ? favLine(G, favHave(G)) : 'Follow the tips and watch the stars go up!'}`,
      objective: G => { const id = favHave(G); return id ? `Try the tip: ${FURNITURE[id].mount === 'wall' ? 'hang' : 'place'} the ${FURNITURE[id].name}` : 'The Home Rating'; },
      highlight: G => { if (!decoOpen(G)) return decoBtn(G); const c = !G.housing.decor.sel && !G.housing.decor.hold && favCard(G); return c ? [c, '.p-decor .dc-rate'] : touch() && G.housing.decor.sel ? ['.tc-place', '.p-decor .dc-rate'] : '.p-decor .dc-rate'; },
      waitFor: { event: 'decor:place', test: (p, G) => likes(G).includes(p.id) } }, // (or Got it!)
    { id: 'wrap', say: dev3("Tanu sells furniture at his stall on Market Street, the workbench makes it, and the villagers love help decorating their homes — ask them \"Need any help?\". Tap *Done* when you're done!", "Tanu sells furniture at his stall on Market Street, the workbench makes it, and the villagers love help decorating their homes — ask them \"Need any help?\". Press *B* when you're done!", "Tanu sells furniture at his stall on Market Street, the workbench makes it, and the villagers love help decorating their homes — ask them \"Need any help?\". Press *B* when you're done!"),
      objective: 'More furniture: Tanu, the workbench, finds', allow: { interior: true, panels: ['decorate', 'menu'] }, ack: true },
  ],
};

// ------------------------------------------------------------------ remodelling a house (Tanu, docs/HOUSING.md §7)
const cardOpen = G => G.ui?.isOpen?.('houseCard'), remOpen = G => G.ui?.isOpen?.('remodel');
const nearestMailbox = G => { let best = null, bd = 1e9; for (const m of G.housing?.ext?.mail?.values?.() || []) { const d = dist(G, m.inter.pos); if (d < bd) { bd = d; best = m; } } return best; };
const remodel = {
  title: 'Remodel', narrator: 'tanu', color: '#8fe0c0', priority: 4, startPanels: ['houseCard', 'remodel'],
  blurb: 'A house\'s mailbox: Upgrade, Remodel and Enter, the style sets, the swatches and what it costs.',
  offer: 'Tanu can show you how to give a house a whole new look.',
  icon: null,
  trigger: G => !!G.state.flags.mailboxOpened,
  locked: () => null,
  steps: [
    { id: 'mailbox', say: 'Psst! Every house has a mailbox. Press *F* at one to open its house card.', objective: 'Open a mailbox (*F*)', allow: { panels: ['houseCard', 'remodel'] },
      target: G => { const m = nearestMailbox(G); return m ? { pos: m.inter.pos, label: 'Mailbox' } : null; }, highlight: () => prompt,
      done: G => cardOpen(G) || remOpen(G) },
    { id: 'card', resumeAt: 'mailbox', say: "Here's the house card! *Upgrade* grows the house — it keeps its look and everything inside. *Enter* goes in. And *Remodel*… that's my favourite. Click it!", objective: 'Click *Remodel*', allow: { panels: ['houseCard', 'remodel'] },
      highlight: G => (cardOpen(G) ? '.p-house .hc-btns' : null),
      callouts: G => (cardOpen(G) ? [{ el: '.p-house .hc-up', text: 'What the next level costs', side: 'left' }] : []),
      done: G => remOpen(G) },
    { id: 'sets', resumeAt: 'mailbox', say: 'These are the style sets: a whole new look in one click. Try one — the picture shows it at once!', objective: 'Pick a style set', allow: { panels: ['houseCard', 'remodel'] },
      highlight: G => (remOpen(G) ? '.p-remodel .rm-sets' : '.p-house .hc-rem'), waitFor: { event: 'remodel:draft', test: p => p.kind === 'set' } },
    { id: 'swatch', resumeAt: 'mailbox', say: 'And every part has its own swatches. Tap one to change just that bit — a roof colour, say.', objective: 'Change one part', allow: { panels: ['houseCard', 'remodel'] },
      highlight: G => (remOpen(G) ? '.p-remodel .rm-fields' : '.p-house .hc-rem'), waitFor: { event: 'remodel:draft', test: p => p.kind === 'field' } },
    { id: 'cost', resumeAt: 'mailbox', say: "Here's what it costs. *Remodel* builds it, *As it was* puts it back. Your house, your rules — hee hee!", objective: 'Remodel it — or keep the old look', allow: { panels: ['houseCard', 'remodel'] },
      highlight: G => (remOpen(G) ? '.p-remodel .rm-foot' : null), ack: true, waitFor: 'house:remodel' },
  ],
};

// ------------------------------------------------------------------ hold to power up (Shadow, docs/CHARGE.md §4)
const rmbSkill = G => { const P = G.state.player, set = P.mouseSets?.[P.activeWeapon || 0] || P.hotbar || []; return set[1] || P.hotbar?.[1] || null; };
const chargeOff = G => G.ui?.settings?.chargeMode === 1;
const skillsOpen = G => G.ui?.isOpen?.('skills');
const charge = {
  title: 'Hold to power up!', narrator: 'shadow', color: '#ffd84a', priority: 5,
  blurb: 'Hold a skill to charge it, let go for a bigger cast, and the charge perks in the Skills panel.',
  offer: 'Shadow knows a trick for making your skills hit harder.',
  icon: null,
  trigger: G => houseDone(G) && !!G.state.flags.burrowTut,
  locked: G => (G.state.flags.burrowTut ? null : 'Visit the Burrow first'),
  steps: [
    { id: 'hold', objective: 'Hold right-click until the ring lights up, then let go', skippable: true,
      say: G => (chargeOff(G) ? 'Charging is turned off in Settings (Charge on hold) — turn it back on any time to try this!' : `Back from the Burrow! Here's a trick, ${me(G)}: *hold* right-click instead of tapping. The ring fills up to *Ⅰ* — let go when it lights up!`),
      highlight: () => '.hud .hb.mouse',
      on: {
        'charge:release': (p, T) => { if (!(p.stage >= 1)) T.say('That was a tap — hold a little longer, until the ring lights up!'); },
        'charge:cancel': (p, T) => { if (p.reason !== 'modal') T.say('A roll drops the charge. No harm done — hold it again!'); },
      },
      waitFor: { event: 'charge:release', test: p => p.stage >= 1 && p.ok }, done: G => chargeOff(G) },
    { id: 'perks', say: G => `${SKILLS[rmbSkill(G)]?.charge?.title || 'A charged cast'}! It hits harder and bigger, and costs a little more zoom. Skill points buy *charge perks* too — more stages, a quicker wind-up, and a trick for every skill. Press *K* to see!`,
      objective: 'Open your Skills (*K*)', allow: { panels: ['skills'] },
      highlight: G => (skillsOpen(G) ? null : '.hud .mb[data-open="skills"]'), done: G => skillsOpen(G) },
    { id: 'card', resumeAt: 'perks', say: "This is the *Charge* card: the skill's stages and its four perks. The *⚡* on a skill picks it here — a glowing one means a perk is ready to buy.", objective: 'The Charge card', allow: { panels: ['skills'] },
      highlight: G => (skillsOpen(G) ? '.p-skills .chg-drawer' : '.hud .mb[data-open="skills"]'),
      callouts: G => (skillsOpen(G) ? [{ el: '.p-skills .chg-stages', text: 'Stages Ⅰ Ⅱ Ⅲ', side: 'right' }, { el: '.p-skills .chg-perks', text: 'Perks: click to buy', side: 'right' }] : []),
      ack: true },
    { id: 'wrap', say: "Tap for a quick cast, hold for a big one — every active skill can charge. A roll drops a charge, but bumps and bites won't. Woof!", objective: 'Hold any skill to power it up', ack: true, allow: { panels: ['skills'] } },
  ],
};

// ------------------------------------------------------------------ three heroes: tap Tab, hold Tab (Poe, docs/POE.md §6)
const wheelOpen = G => !!G.heroes?.wheelOpen;
const meetPoe = {
  title: 'Meet Poe', narrator: 'poe', color: '#5a8a4a', priority: 1,
  blurb: 'Tap Tab for the next hero, hold Tab for the hero wheel, and Poe’s fūma.',
  offer: 'Poe can show you how to pick a hero with the hero wheel.',
  icon: null,
  trigger: G => !!G.heroes?.joined('poe') && G.state.activeHero !== 'poe',
  past: G => !!G.heroes?.joined('poe'),
  locked: G => (G.heroes?.joined('poe') ? null : 'Meet Poe in the Bamboo Grove first'),
  steps: [
    { id: 'tap', say: G => `A ninja reports for duty! *Tap Tab* — a quick press — and you play the next hero in the pack, ${me(G)}.`, objective: 'Tap *Tab* to switch to the next hero', allow: { switching: true },
      onEnter: (G, T) => { T.data.from = G.state.activeHero; },
      highlight: G => (G.heroSwitching ? null : '.hud .hsw'), done: (G, T) => G.state.activeHero !== T.data.from && !G.heroSwitching },
    { id: 'hold', say: G => (G.state.activeHero === 'poe' ? "Hi! Now *hold Tab*: the hero wheel! Point at whoever you like — or press their number — and let go." : "Now *hold Tab*: the hero wheel! Point at me — or press my number — and let go. Very stealthy. Very fast."),
      objective: 'Hold *Tab*, pick a hero, let go', allow: { switching: true },
      highlight: G => (G.heroSwitching ? null : wheelOpen(G) ? (G.state.activeHero === 'poe' ? '.hero-wheel .hw-ring' : '.hero-wheel .hw-card[data-id="poe"]') : '.hud .hsw'),
      waitFor: { event: 'hero:wheel', test: p => !!p?.id } },
    { id: 'fuma', say: G => (G.state.activeHero === 'poe'
        ? 'Ta-da! Left-click: my *fūma slashes*. Right-click: *Fūma Throw* — it flies out and comes back, so stay put and catch it! My trees are Shuriken Arts, Ninjutsu and Shadow Step (*K*).'
        : 'When you play me: left-click is my *fūma slashes*, right-click is *Fūma Throw* — it comes back, so stay put and catch it! My trees are Shuriken Arts, Ninjutsu and Shadow Step.'),
      objective: 'Poe: the fūma, three trees', allow: { switching: true }, highlight: G => (G.heroSwitching ? null : '.hud .hb.mouse'), ack: true },
    { id: 'wrap', say: 'The little portraits by yours are the heroes in town: click one to play them. Tap *Tab* for the next, hold *Tab* to pick. Now — to the Burrow! *Snrrk.* …That was not a snort.', objective: 'Tap Tab: next · hold Tab: pick', ack: true, highlight: () => '.hud .hsw' },
  ],
};

// ------------------------------------------------------------------ four heroes: the Shih Tzu (docs/SHIHTZU.md §5)
const STZ = CLASSES.shihtzu.name; // (the owner's to pick: one place, classes.js)
const meetShihtzu = {
  title: `Meet ${STZ}`, narrator: 'shihtzu', color: '#8a4a8a', priority: 1,
  blurb: `The hero wheel with four, and ${STZ}'s flail, hexes and the Gloom Blanket.`,
  offer: `${STZ} can show you his flail and his hexes.`,
  icon: null,
  trigger: G => !!G.heroes?.joined('shihtzu') && G.state.activeHero !== 'shihtzu',
  past: G => !!G.heroes?.joined('shihtzu'),
  locked: G => (G.heroes?.joined('shihtzu') ? null : 'Meet him in Momiji Hollow first'),
  steps: [
    { id: 'hold', say: G => (G.state.activeHero === 'shihtzu' ? 'Good. You chose the gloom. *Hold Tab* again whenever the pack needs another paw.' : `The pack is four now, ${me(G)}. *Hold Tab*: the hero wheel. Choose me — the one in plum. Solemnly. …Or press my number.`),
      objective: 'Hold *Tab*, pick him, let go', allow: { switching: true },
      highlight: G => (G.heroSwitching ? null : wheelOpen(G) ? '.hero-wheel .hw-card[data-id="shihtzu"]' : '.hud .hsw'),
      done: G => G.state.activeHero === 'shihtzu' && !G.heroSwitching },
    { id: 'flail', say: 'Left-click: my *flail*. Three swings — the third a slam over the top. Right-click: *Woeful Wallop*: one great sigh and a sweep that sends them tumbling. I mean every one.',
      objective: 'His flail: left-click, right-click', allow: { switching: true }, highlight: G => (G.heroSwitching ? null : '.hud .hb.mouse'), ack: true },
    { id: 'hex', say: 'Press *1*: *Dripping Paw*. A hex — gloom that stings every half second. Hex a foe again and it stings harder, three stacks deep.',
      objective: 'Press 1: Dripping Paw, a hex that stacks', allow: { switching: true }, highlight: G => (G.heroSwitching ? null : '.hud .hb[data-i="2"]'), ack: true },
    { id: 'blanket', say: 'And the *Gloom Blanket*: every hexed foe near me makes me a little harder to hurt. Hex them, then stand your ground. Knights do not run. …Much.',
      objective: 'Hexed foes nearby: he takes less damage', allow: { switching: true }, ack: true },
    { id: 'wrap', say: 'My trees are Flail Arts, Gloom Hexes and the Ghostlight Tome (*K*): ghost pups, a lantern, and Grandpaw. Grandpaw sends his regards. To the Burrow.',
      objective: 'K: Flail Arts, Gloom Hexes, Ghostlight Tome', ack: true, highlight: () => '.hud .mb[data-open="skills"]' },
  ],
};

// ------------------------------------------------------------------ five heroes: Foosy the dragoon (docs/GOLDEN.md §5)
const GLD = CLASSES.golden.name;
const whelpUp = G => G.state.activeHero === 'golden' && !!G.companion?.whelp?.on && G.companion.whelp.air > 0.9 && G.companion.whelp.lift > 0.6;
const meetGolden = {
  title: `Meet ${GLD}`, narrator: 'golden', color: '#d8903a', priority: 1,
  blurb: `The hero wheel with five, ${GLD}'s lance and javelins, and Shadow the dragon whelp.`,
  offer: `${GLD} can show you his lance, his javelins and Shadow's wings.`,
  icon: null,
  trigger: G => !!G.heroes?.joined('golden') && G.state.activeHero !== 'golden',
  past: G => !!G.heroes?.joined('golden'),
  locked: G => (G.heroes?.joined('golden') ? null : 'Meet him at the hot springs of Yukimi first'),
  steps: [
    { id: 'hold', say: G => (G.state.activeHero === 'golden' ? 'Reporting for duty! *Hold Tab* whenever the pack needs another paw.' : `The pack is five now, ${me(G)}! *Hold Tab*: the hero wheel. Choose me — the one in emerald. With honour. …Or press my number.`),
      objective: 'Hold *Tab*, pick him, let go', allow: { switching: true },
      highlight: G => (G.heroSwitching ? null : wheelOpen(G) ? '.hero-wheel .hw-card[data-id="golden"]' : '.hud .hsw'),
      done: G => G.state.activeHero === 'golden' && !G.heroSwitching },
    { id: 'lance', say: 'Left-click: my *lance*. Two long thrusts and a swat — I can reach them from further away than anyone. Right-click: *Sunbeam Thrust*, one big earnest lunge down a whole line of them.',
      objective: 'His lance: left-click, right-click', allow: { switching: true }, highlight: G => (G.heroSwitching ? null : '.hud .hb.mouse'), ack: true },
    { id: 'javelin', say: 'Press *1*: *Bonk Dart*. A toy javelin from my quiver — the gold tip bonks, and whoever stands beside gets a little bonk too. They never stab. They bonk.',
      objective: 'Press 1: Bonk Dart', allow: { switching: true }, highlight: G => (G.heroSwitching ? null : '.hud .hb[data-i="2"]'), ack: true },
    { id: 'whelp', say: G => `And while you play me, Shadow wears his *dragon wings*! Walk a little — watch him take off and fly beside us. He lands when we rest, and walks indoors. Every dragoon needs a dragon.`,
      objective: 'Walk a little: Shadow takes off', allow: { switching: true }, done: (G, T) => (T.cur?.t || 0) > 3 && whelpUp(G) }, // (time to read it: he may be up already)
    { id: 'wrap', say: 'My trees are Lance Arts, Javelins and the Whelp Bond (*K*): Shadow breathes embers, swoops, shields you and roars. A very small roar. To the springs — I mean, to the Burrow!',
      objective: 'K: Lance Arts, Javelins, Whelp Bond', ack: true, highlight: () => '.hud .mb[data-open="skills"]' },
  ],
};

// ------------------------------------------------------------------ the cozy path (docs/COZY.md §11; ROADMAP CZ-11)
// Every line follows the device: keys (*F* is the pad's A through keyHint), the pad's own words, and touch's ("tap",
// "the attack button"); the director says a function's line again when the device changes.
const dev = () => Actions.device;
const dv = (t, p, k) => () => (dev() === 'touch' ? t : dev() === 'pad' ? p : k); // touch, pad, keys and mouse
const expOpen = G => !!G.ui?.isOpen?.('expeditions');
const expP = G => G.ui?.panels?.expeditions;
const atBoard = G => expOpen(G) && !!expP(G)?.atBoard;
const boardPos = G => G.cozy?.board?.it?.pos || null;
const PEEK = 'quest:burrow1';
const peekListed = G => !!G.cozy?.exp.objectives('story').some(o => o.id === PEEK);
const peekOut = G => !!G.cozy?.exp.list().some(e => e.obj === PEEK);
const peekReport = G => [...(G.cozy?.exp.reports() || [])].reverse().find(r => r.obj === PEEK) || null;
/** the friend the Board guide sends: Moka (the burrow1 choice), else the first hero (then hire) free to go */
const crewKey = G => {
  const mem = G.cozy?.exp.members() || [], free = m => !m.active && !m.away && !m.onBreak && !(m.tired > 0);
  const m = mem.find(x => x.key === 'hero:moka' && free(x)) || mem.find(x => x.type === 'hero' && free(x)) || mem.find(free);
  return m ? { key: m.key, name: m.name } : null;
};
const crewName = (G, T) => (T.data.crew ||= crewKey(G))?.name || 'a friend';
/** the board's panel on a job card: Peek into the Burrow when it's offered, else whatever job the view shows */
const showJob = G => { const P = expP(G); if (!P || !expOpen(G)) return; if (!['story', 'village', 'errands'].includes(P.view)) P.setView(peekListed(G) ? 'story' : 'errands'); if (peekListed(G) && P.view === 'story') P.pick(PEEK); };
const board = {
  title: 'The Expedition Board', narrator: 'shadow', color: '#8fc0f0', priority: 2,
  blurb: 'Send friends on a job from the board by the Wayfarer\'s Post: the job, the crew, the odds, Send off!, and the crews chip.',
  offer: 'Shadow can show you how to send a crew off on a job while you stay home.',
  icon: null,
  trigger: () => false, // (it starts from Rosie's burrow1 question, "Send Moka", or as an offer the first time a fighter opens the board: cozy/cozyGuide.js)
  past: G => houseDone(G) && !!G.state.quests?.done?.includes('burrow1'), // (an old save past the Burrow's first quest)
  locked: G => (G.cozy?.board ? null : 'The board stands by the Wayfarer\'s Post'),
  onStart: (G, T) => { T.data.crew = null; },
  steps: [
    { id: 'walk', say: G => `Woof! ${crewKey(G)?.name || 'Your friend'} is packing a bag! The *Expedition Board* is by the Wayfarer's Post, at the west end of town. Follow me!`, objective: 'Go to the Expedition Board',
      target: G => (boardPos(G) ? { pos: boardPos(G), label: 'Expedition Board' } : null), allow: { panels: ['expeditions'] },
      done: G => atBoard(G) || (boardPos(G) && dist(G, boardPos(G)) < 3.2) },
    { id: 'open', say: dv('Tap the board, or the attack button, to read it.', 'Press *F* at the board to read it.', 'Press *F* at the board to read it.'), objective: dv('Tap the board to open it', 'Open the board (*F*)', 'Open the board (*F*)'),
      target: G => (atBoard(G) || !boardPos(G) ? null : { pos: boardPos(G), label: 'Expedition Board' }), highlight: G => (atBoard(G) ? null : prompt), allow: { panels: ['expeditions'] },
      done: G => atBoard(G) },
    { id: 'job', resumeAt: 'open', allow: { panels: ['expeditions'] }, ack: true, objective: 'The job card',
      onEnter: G => showJob(G),
      say: G => (peekListed(G) ? "This is the job: *Peek into the Burrow*. The card says how long it takes, how much *power* the crew needs, and what they'll bring home." : 'Each card is a job: how long it takes, how much *power* the crew needs, and what comes home. Story jobs move the story on; errands bring materials.'),
      tick: (G, T) => { if (!expOpen(G)) T.goto('open'); },
      highlight: () => '.p-exp .ex-det' },
    { id: 'crew', resumeAt: 'open', allow: { panels: ['expeditions'] },
      onEnter: (G, T) => { T.data.crew = crewKey(G); showJob(G); },
      say: (G, T) => { const n = crewName(G, T); return dev() === 'touch' ? `Now tap *${n}'s card* to put ${n === 'Moka' ? 'her' : 'them'} in the crew.` : dev() === 'pad' ? `Now move to *${n}'s card* and press *F* to put ${n === 'Moka' ? 'her' : 'them'} in the crew.` : `Now click *${n}'s card* to put ${n === 'Moka' ? 'her' : 'them'} in the crew.`; },
      objective: (G, T) => `Add ${crewName(G, T)} to the crew`,
      tick: (G, T) => { if (!expOpen(G)) T.goto('open'); },
      highlight: (G, T) => (T.data.crew ? `.p-exp .ex-mem[data-m="${T.data.crew.key}"]` : '.p-exp .ex-crew'),
      done: (G, T) => !!expP(G)?.crew?.length && (!T.data.crew || expP(G).crew.includes(T.data.crew.key)) },
    { id: 'send', resumeAt: 'open', allow: { panels: ['expeditions'] }, skippable: true,
      say: G => `${peekListed(G) ? 'Rosie packed the lunch, so the odds are good. ' : 'The bar shows the crew\'s power against the job\'s: the odds are in words beside it. '}${dev() === 'touch' ? 'Tap *Send off!*' : dev() === 'pad' ? 'Move to *Send off!* and press *F*.' : 'Click *Send off!*, or press Enter.'}`,
      objective: dv('Tap Send off!', 'Send them off (*F* on Send off!)', 'Click Send off!'),
      tick: (G, T) => { if (!expOpen(G)) T.goto('open'); },
      highlight: () => '.p-exp .ex-go', waitFor: 'expedition:sent' },
    { id: 'away', allow: { panels: ['expeditions'] }, objective: dv('Close the board (✕)', 'Close the board (B)', 'Close the board (Esc)'),
      say: (G, T) => `${crewName(G, T)}'s off! The trip shows under *Away*, with when they'll be back. ${dev() === 'touch' ? 'Tap ✕ to close the board.' : dev() === 'pad' ? 'Press B to close the board.' : 'Press Esc to close the board.'}`,
      highlight: G => (expOpen(G) ? '.p-exp .ex-trip, .p-exp .ex-det' : null), done: G => !expOpen(G) },
    { id: 'chip', objective: 'The crews chip', ack: true,
      say: G => `See the backpack by the map? That's the crew: ${G.cozy?.exp.list()[0] ? G.cozy.exp.left(G.cozy.exp.list()[0]) >= 0.75 ? `back in about ${Math.max(1, Math.round(G.cozy.exp.left(G.cozy.exp.list()[0])))} hours` : 'back any moment' : 'off on the road'}. ${dev() === 'touch' ? 'Tap it' : dev() === 'pad' ? 'The pause menu\'s *Crews*' : 'Click it'} to see how they're doing. Let's dig while we wait!`,
      highlight: () => '.hud .cz-chip.on' },
  ],
};

// Shadow's nose: a gather node, a dig spot (the hold and the golden band), the HUD's materials; on the crew path, the
// crew's return (the report spotlit) and Rosie's thank-you
const scavFree = G => (G.cozy?.scav?.nodes() || []).filter(n => !n.taken && n.on);
const nearNode = (G, kind) => { let best = null, bd = 1e9; for (const n of scavFree(G)) { const d = dist(G, n) + (kind && n.kind !== kind ? 40 : 0) + (n.kind === 'mulberry' ? 80 : 0); if (d < bd) { bd = d; best = n; } } return best; }; // (the old mulberry last: a tree you gather under, its one cocoon a day)
const nearSpot = (G, states) => { let best = null, bd = 1e9; for (const s of G.cozy?.scav?.spots() || []) { if (!states.includes(s.state)) continue; const d = dist(G, s); if (d < bd) { bd = d; best = s; } } return best; };
const NODE_NAME = { driftwood: 'driftwood', riverStone: 'river stones', petalDrift: 'petal drift', mulberry: 'old mulberry' };
const digTap = G => G.ui?.settings?.digMode === 1;
const crewPath = G => G.state.flags?.burrowChoice === 'crew';
/** Rosie's burrow1 question is still to come (cozy/cozyGuide.js asks it): unanswered, burrow1 not done and untouched
 *  (also in the 2.5 s between the welcome and burrow1's start), never in the Burrow */
const choiceOpen = G => { const F = G.state.flags || {}, Q = G.state.quests || {}, q = Q.active?.find(x => x.id === 'burrow1'); if (F.burrowChoice || F.burrowTut || Q.done?.includes('burrow1')) return false; return !q || (q.step === 0 && !(q.prog > 0)); };
const nose = {
  title: "Shadow's Nose", narrator: 'shadow', color: '#e0b070', priority: 6,
  blurb: 'Gather driftwood, stones and petals, dig up what Shadow sniffs out (let go in the gold!), and where it all goes.',
  offer: 'Shadow can show you how to find building materials without a single fight.',
  icon: () => pantryIcon('shiitake'),
  // after the house tour once Rosie's Burrow question is answered (on the crew path, after the Board guide)
  trigger: G => houseDone(G) && G.mode === 'village' && !choiceOpen(G) && (!crewPath(G) || !!G.state.flags.tutorials?.board?.done),
  past: G => houseDone(G) && (!!G.state.quests?.done?.includes('burrow1') || (G.state.cozy?.scav?.stats?.gathered || 0) > 0),
  locked: G => (houseDone(G) ? null : 'Finish "Home, sweet home" first'),
  onStart: (G, T) => { T.data.crew = crewPath(G) && (peekOut(G) || (peekReport(G) && !peekReport(G).read)); },
  steps: [
    { id: 'gather', objective: dv('Gather something (tap it)', 'Gather something (*F*)', 'Gather something (*F*)'),
      onEnter: (G, T) => { T.data.node = nearNode(G, 'driftwood') || nearNode(G); },
      say: (G, T) => { const n = T.data.node, w = NODE_NAME[n?.kind] || 'something shiny'; return `Yip! Time for my nose. Building stuff doesn't need fighting: see the ${w}? Walk up and ${dev() === 'touch' ? 'tap it, or the attack button' : 'press *F*'} to gather it. The little glowing ring means it's ready.`; },
      target: (G, T) => { const n = T.data.node && scavFree(G).find(x => x.id === T.data.node.id) || nearNode(G); return n ? { pos: V(n.x, n.z), label: 'Gather spot' } : null; },
      highlight: G => (document.querySelector(prompt) && scavFree(G).some(n => dist(G, n) < 2.2) ? prompt : null), waitFor: 'scavenge:gather' }, // (the prompt only when it's the gather's: the board's own "Read" is up right after the Board guide)
    { id: 'sniff', objective: 'Follow Shadow: he smells something!',
      say: 'Sniff… sniff… I smell something buried! Follow me: when I paw the ground and sit, that\'s the spot.',
      target: G => { const s = nearSpot(G, ['found']) || nearSpot(G, ['hidden']); return s ? { pos: V(s.x, s.z), label: 'Shadow smells something' } : null; },
      done: G => !!nearSpot(G, ['found']) || !nearSpot(G, ['hidden']) },
    { id: 'dig', objective: G => (digTap(G) ? dv('Tap to dig', 'Dig (*F*)', 'Dig (*F*)')() : dv('Hold to dig, let go in the gold', 'Hold *F*, let go in the gold', 'Hold *F*, let go in the gold')()),
      say: G => (digTap(G) ? `Here! ${dev() === 'touch' ? 'Tap the attack button' : 'Press *F*'} and we'll dig it up together.` : `Here! ${dev() === 'touch' ? '*Hold* the attack button' : '*Hold F*'} to dig. The ring fills up: let go while it's in the *gold band* for a Perfect dig. Any other time still digs it up. Nothing is ever lost!`),
      target: G => { const s = nearSpot(G, ['found']); return s ? { pos: V(s.x, s.z), label: 'Dig here' } : null; },
      highlight: G => (G.cozy?.scav?.busy ? null : document.querySelector(prompt) ? prompt : null),
      on: { 'scavenge:dig': (p, T) => { T.data.perfect = !!p.perfect; } },
      waitFor: 'scavenge:dig' },
    { id: 'mats', objective: 'Your materials', ack: true,
      say: (G, T) => `${T.data.perfect ? 'A PERFECT DIG! Woof woof, a bonus find! ' : digTap(G) ? 'We got it! ' : 'We got it! Next time, let go in the gold for a bonus. '}Everything we find goes into your *materials*, up here: wood, stone, petals, silk, bones… All the gather spots fill up again every day, and I sniff out new dig spots each morning.`,
      highlight: G => (G.ui?.root?.classList.contains('tc-short') ? null : '.hud .mats') },
    { id: 'back', objective: 'Wait for the crew to come home', skippable: true,
      say: G => `${peekOut(G) ? 'The crew is still out. Gather and dig a little more: the chip by the map shows a *!* when they\'re home.' : 'The crew is home!'}`,
      highlight: () => '.hud .cz-chip.on',
      done: (G, T) => !T.data.crew || !peekOut(G) },
    { id: 'report', allow: { panels: ['expeditions', 'menu'] }, skippable: true,
      objective: "Read the crew's report", // (short: on a phone it sits in the board's title band; the line says how)
      say: G => `They're back! ${dev() === 'touch' ? 'Tap the backpack chip' : dev() === 'pad' ? 'Open the menu and pick *Crews*' : 'Click the backpack chip'} to read their report.`,
      highlight: G => (expOpen(G) ? '.p-exp .ex-rep' : dev() === 'pad' && G.ui?.isOpen?.('menu') ? '.p-menu [data-a="crews"]' : '.hud .cz-chip.on'),
      done: (G, T) => !T.data.crew || !peekReport(G) || (peekReport(G).read && (!expOpen(G) || T.cur.t > 4)) },
    { id: 'wrap', ack: true,
      // (on the crew path Rosie has the last word, the turn-in: COZY §11. Her line is said with her as the speaker, once the
      //  board is closed: a phone hides the speech card while a panel is up)
      onEnter: (G, T) => { if (T.data.crew && peekReport(G)?.result === 'success') T.say(`${crewKey(G)?.name || 'Your friend'} brought my Mochi Jelly home, and the squeaks are all sorted! Thank you, ${me(G)}, and thank you, Shadow. Both ways help!`, 'rosie'); },
      say: (G, T) => (T.data.crew && peekReport(G)?.result === 'success' ? '' : "Gather spots, dig spots, errands from the board: that's everything a home needs. And if you ever want a scrap, the Burrow is always squeaky. Woof!"),
      objective: 'Gather, dig, send crews: build without a fight' },
  ],
};

// Old Hachi's guide, the first time the Adventurers' Guild stands: hire a candidate, the roster card, a crew of two,
// the wages in the morning banner
const guildOpen = G => !!G.ui?.isOpen?.('guild');
const guildP = G => G.ui?.panels?.guild;
const guildDoor = G => { const r = G.cozy?.guild?.rec?.(); return r?.door ? V(r.door.x, r.door.z) : null; };
const rosterN = G => G.state.cozy?.guild?.hires?.length || 0;
const guildGuide = {
  title: "The Adventurers' Guild", narrator: 'hachi', color: '#3f7a72', priority: 3,
  blurb: 'Old Hachi\'s lodge: sign a hire on, read the roster card, send a crew of two, and the wages.',
  offer: "Old Hachi can show you how hiring adventurers works.",
  icon: null,
  trigger: G => !!G.cozy?.guild?.built?.() && G.mode === 'village',
  past: G => !!G.cozy?.guild?.built?.(),
  locked: G => (G.cozy?.guild?.built?.() ? null : 'Build the Adventurers\' Guild first (village rank 2)'),
  onStart: G => { G.cozy?.guild?.faceHTML?.('hachi'); }, // (registers his bust for the speech card)
  steps: [
    { id: 'door', allow: { panels: ['guild'] }, objective: dv('Go into the Guild (tap the door)', 'Go into the Guild (*F* at the door)', 'Go into the Guild (*F* at the door)'),
      say: G => `Hmph. So you built it, ${me(G)}. Come in, come in: ${dev() === 'touch' ? 'tap the door' : '*F* at the door'}. Mind the step.`,
      target: G => (guildOpen(G) || !guildDoor(G) ? null : { pos: guildDoor(G), label: "Adventurers' Guild" }),
      highlight: G => (guildOpen(G) ? null : guildDoor(G) && dist(G, guildDoor(G)) < 3 ? prompt : null), done: G => guildOpen(G) },
    { id: 'hire', resumeAt: 'door', allow: { panels: ['guild'] }, skippable: true, objective: 'Sign on a hire',
      onEnter: (G, T) => { T.data.had = rosterN(G); const P = guildP(G); if (P && guildOpen(G) && P.view !== 'hire') P.setView('hire'); },
      say: G => `Today's three. Pick one whose trade suits the work: a Guard for a siege, a Scout for a hunt, a Porter to carry more home. ${dev() === 'touch' ? 'Tap *Sign on*' : dev() === 'pad' ? '*F* on *Sign on*' : 'Click *Sign on*'}: the fee's on the button.`,
      highlight: G => (!guildOpen(G) ? null : guildP(G)?.view === 'hire' ? '.p-guild .gd-cands' : '.p-guild .gd-tab[data-v="hire"]'),
      tick: (G, T) => { if (!guildOpen(G) && T.cur.t > 1) T.goto('door'); },
      done: (G, T) => rosterN(G) > (T.data.had ?? 0) || (rosterN(G) > 0 && T.cur.t > 0.2 && T.data.had > 0) },
    { id: 'roster', resumeAt: 'door', allow: { panels: ['guild'] }, ack: true, objective: 'The roster card',
      onEnter: G => { const P = guildP(G); if (P && guildOpen(G) && P.view !== 'roster') P.setView('roster'); },
      say: 'Your roster. Each card: their *power* (a crew adds it up), their *class*, their mood in *hearts*, and the *wage* they want each day. Happy hires work harder.',
      highlight: G => (guildOpen(G) ? (guildP(G)?.view === 'roster' ? '.p-guild .gd-hire:not(.free):not(.lock)' : '.p-guild .gd-tab[data-v="roster"]') : null),
      callouts: G => (guildOpen(G) && guildP(G)?.view === 'roster' && !G.ui.root.classList.contains('m-phone') ? [{ el: '.p-guild .gd-hire .gd-cls', text: 'Class', side: 'right' }, { el: '.p-guild .gd-hire .gd-hearts', text: 'Morale', side: 'right' }, { el: '.p-guild .gd-hire .gd-hs', text: 'Power · wage', side: 'right' }] : []),
      tick: (G, T) => { if (!guildOpen(G)) T.goto('door'); } },
    { id: 'board', resumeAt: 'door', allow: { panels: ['guild', 'expeditions'] }, skippable: true, objective: 'Open the Expedition Board',
      say: G => `Hires go out like your heroes do, and two make a crew. The *Expedition Board* hangs right here: ${dev() === 'touch' ? 'tap it' : dev() === 'pad' ? '*F* on it' : 'click it'}.`,
      highlight: G => (guildOpen(G) ? '.p-guild .gd-board[data-board="exp"]' : null), done: G => expOpen(G) },
    { id: 'two', allow: { panels: ['guild', 'expeditions'] }, skippable: true, objective: 'Put two in a crew',
      onEnter: G => showJob(G),
      say: G => `Put a hire and a friend in the crew: ${dev() === 'touch' ? 'tap' : dev() === 'pad' ? '*F* on' : 'click'} two cards. A class that suits the job adds *+15%*. Send them, or not: your call.`,
      highlight: G => (expOpen(G) ? '.p-exp .ex-crew' : null), done: G => (expP(G)?.crew?.length || 0) >= 2 || !!G.cozy?.exp.list().some(e => e.crew.length >= 2) },
    { id: 'wages', ack: true, allow: { panels: ['guild', 'expeditions'] }, objective: 'Wages, every morning',
      say: 'One more thing. Wages come out of your coins each morning: the day\'s banner says *Guild wages*. Pay them, feed them, send them out. That\'s the whole trade. Hmph.' },
  ],
};

export const GUIDES = { switch: sw, house, fishing, makeHome, remodel, charge, meetPoe, meetShihtzu, meetGolden, board, nose, guild: guildGuide };
export const GUIDE_IDS = Object.keys(GUIDES);
