// The guided tutorials (docs/TUTORIALS.md): their steps, run by world/tutorials.js.
//  - switch: Moka, right after she joins: Tab to play her, her spells, find Chewy, switch back, what's shared.
//  - house:  Shadow, after Rosie's welcome (once Moka's arrival scene is over): the cottage, its menu, the garden bed
//            (till, plant, water), the Pantry, and where seeds come from.
//  - fishing: Kero, as soon as you have a rod: the bank, the cast, the wait, the bite, the reel, the Fish Log.
import * as THREE from 'three';
import { POND } from './layout.js';
import { SKILLS } from '../rpg/skills.js';
import { pantryIcon } from '../life/pantryIcons.js';
import { PANTRY } from '../life/pantry.js';

const V = (x, z) => new THREE.Vector3(x, 0, z);
const dist = (G, p) => Math.hypot(G.player.pos.x - p.x, G.player.pos.z - p.z);
const npc = (G, id) => G.npcs?.find(n => n.id === id && n.visible !== false) || null;
const me = G => G.heroes?.name?.() || 'Chewy';
const prompt = '.hud .prompt.show';

// ------------------------------------------------------------------ the fishing guide (Kero)
const kero = G => G.npcs?.find(n => n.id === 'kero') || null;
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
    { id: 'cast', say: 'Face the water and press *F* to cast. Nice and easy.', objective: 'Face the water and press *F* to cast',
      onEnter: G => { G.life.fishing.tut = { biteAfter: 3.2, window: 1.2, fish: 'crucian', zone: 0.34, drain: 0.55, forgiveEarly: true }; },
      target: (G, T) => (G.life.fishing.target && !G.life.fishing.target.blocked ? null : { pos: V(T.data.spot.x, T.data.spot.z), label: 'Fishing spot' }),
      highlight: () => prompt, waitFor: 'fishing:cast', allow: { switching: false } },
    { id: 'wait', resumeAt: 'cast', say: "Now watch the float — don't press yet! Little dips are *nibbles*: the fish is only tasting.", objective: 'Watch the float… wait for the big splash',
      on: {
        'fishing:nibble': (p, T) => T.say("A nibble… not yet. Wait for the *big splash* and the \"!\""),
        'fishing:early': (p, T) => T.say("Patience! That was only a nibble. Wait for the splash, then press *F*."),
        'fishing:end': (p, T) => { if (p.result !== 'catch') T.goto('cast', { say: 'You reeled in. Cast again whenever you like — *F* facing the water.' }); },
      }, waitFor: 'fishing:bite' },
    { id: 'bite', resumeAt: 'cast', say: 'NOW! Press *F*!', objective: 'Press *F* — quick!', flash: ['NOW!', 'Press *F*'],
      on: { 'fishing:end': (p, T) => T.goto('cast', { say: "Ribbit… too slow, but that's fine — the fish will be back. Cast again!" }) },
      waitFor: 'fishing:reel' },
    { id: 'reel', resumeAt: 'cast', say: 'Hold *F* to lift the green zone, let go to let it sink. Keep the fish inside it to fill the meter!', objective: 'Keep the fish in the green zone until the meter is full',
      callouts: () => [{ el: '.reel.show .rl-zone', text: 'Your zone: *hold F* to lift it', side: 'left' }, { el: '.reel.show .rl-fish', text: 'The fish', side: 'left', at: 0.5 }, { el: '.reel.show .rl-meter', text: 'Catch meter: fill it up!', side: 'right' }],
      on: { 'fishing:end': (p, T) => { if (p.result !== 'catch') T.goto('cast', { say: p.result === 'escape' ? 'It wriggled free! Keep the green zone right on the fish. Cast again!' : 'Cast again — you nearly had it!' }); } },
      waitFor: 'fish:caught' },
    { id: 'log', say: 'A crucian carp! Every catch goes into your *Fish Log*. Open your Journal (*J*), then the Fish Log tab.', objective: 'Open the Journal (*J*) → Fish Log',
      onEnter: G => { G.life.fishing.tut = null; releaseKero(G); }, // (the first fish is in: Kero gets on with his day)
      highlight: G => (G.ui.isOpen('quests') ? '.p-quests .q-tabs .tab[data-t="fish"]' : '.hud .mb[data-open="quests"]'),
      allow: { panels: ['quests'] }, done: G => G.ui.isOpen('quests') && G.ui.panels.quests.tab === 'fish' },
    { id: 'wrap', say: 'Different fish bite in the river, at the sea and at night. Sell them at my Fishing Hut, or cook them at home. Catch two more for my quest — ribbit!', objective: "Catch 3 fish for Kero's quest — try other spots and times",
      ack: true, allow: { panels: ['quests'] } },
  ],
};

// ------------------------------------------------------------------ the house tour (Shadow)
const homeTiles = G => G.life?.garden?.beds?.[0]?.tiles || [];
const anyTile = (G, f) => homeTiles(G).some(i => f(G.life.garden.rec(i) || {}, i));
const hasSeeds = G => Object.keys(G.state.pantry || {}).some(k => PANTRY[k]?.kind === 'seed' && G.state.pantry[k] > 0);
const MENU = [
  [/stash/i, 'Your treasure chest! The stash is shared — Moka can use it too.'],
  [/sleep/i, 'Sleep skips to morning: your crops grow, the village pays its daily income, and the game saves.'],
  [/cook/i, 'And the kitchen! Cook your crops and fish into yummy dishes.'],
];
const house = {
  title: 'Home, sweet home', narrator: 'shadow', color: '#ffb07a', priority: 1,
  blurb: 'Chewy\'s Cottage: the stash, sleep and the kitchen, the garden bed and the Pantry.',
  offer: 'Shadow can show you around the cottage and the garden.',
  icon: () => pantryIcon('turnip'),
  trigger: G => G.state.quests?.done?.includes('welcome') && !G.introJoinPending,
  steps: [
    { id: 'door', say: G => `Yip yip! Follow me, ${me(G)} — this is home!`, objective: "Go to Chewy's Cottage",
      target: G => ({ pos: G.heroes.homeDoor(), label: "Chewy's Cottage" }), done: G => dist(G, G.heroes.homeDoor()) < 2.6 },
    { id: 'enter', say: 'Press *F* at the door to go inside.', objective: 'Press *F* at the cottage door',
      target: G => ({ pos: G.heroes.homeDoor(), label: "Chewy's Cottage" }), highlight: () => prompt, waitFor: 'home:menu' },
    { id: 'menu', resumeAt: 'enter', say: 'This is the cottage menu. Let me show you…', objective: 'Look around the cottage menu', allow: { dialogue: true, panels: ['stash'] },
      onEnter: (G, T) => { T.data.mi = -1; T.data.mt = 0; },
      tick: (G, T, dt) => {
        const ch = [...document.querySelectorAll('.dlg-ch .dch')];
        if (!ch.length) return;
        T.data.mt -= dt;
        if (T.data.mt > 0 || T.data.mi >= MENU.length) return;
        T.data.mi++; T.data.mt = 2.8;
        if (T.data.mi < MENU.length) {
          const [re, line] = MENU[T.data.mi], b = ch.find(x => re.test(x.textContent));
          T.data.hl = b || null; if (b) T.say(line); else T.data.mt = 0;
        } else { T.data.hl = ch.find(x => /leave/i.test(x.textContent)) || null; T.say('Pick anything you like — or *Leave*, and I\'ll show you the garden!'); }
      },
      highlight: (G, T) => T.data.hl, waitFor: 'home:menuClosed' },
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

export const GUIDES = { switch: sw, house, fishing };
export const GUIDE_IDS = Object.keys(GUIDES);
