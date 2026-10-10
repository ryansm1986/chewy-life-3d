// Story quests (Rosie), villager friendship (hearts, gifts, daily chats) and villager requests.
import { heroText } from '../rpg/classes.js';
import { Events } from '../core/events.js';
import { BUILDINGS } from './buildings/index.js';
import { VILLAGERS } from '../actors/roster.js';
import { generateItem, makeUnique, UNIQUE_IDS } from '../rpg/items.js';
import { rand, randInt, pick, uid } from '../core/util.js';
import { PANTRY, CROPS, CROP_IDS, pantryList } from '../life/pantry.js';
import { RECIPES } from '../life/cooking.js';
import { MATERIALS } from '../ui/glyphs.js';
import { pantryIcon } from '../life/pantryIcons.js';
import { meetsNeed, homeRating, starText } from '../home/rating.js';
import { FURNITURE } from '../home/furniture.js';
import { stepGain, zoneStepDone, zoneStepHave, destOf, reachIsHere, REACH_R } from './questSteps.js';
import { DUNGEONS } from '../dungeon/defs.js';
import { ZONE_QUESTS, dungeonObjectives as zoneObjectives, offersFor } from './zoneQuests.js'; // (zone villagers' quests: docs/ZONES.md §3)
import { ZONE_NPCS } from '../regions/village/data.js';
import { storyObjectives, villageObjectives, CREW_STEP_TYPES } from '../cozy/objectives.js'; // (the cozy path's crew routes: docs/COZY.md §3)

// step types: talk(npc) | collect(material,n) | kill(monster?,n) | boss(id) | floor(n) | build(type,n) | pop(n) | zone(n)
//   | fish(n) (catch n fish: life/fishing.js 'fish:caught') | plant(n) / harvest(n) (life/garden.js) | cook(n) dishes
//   | deliver(npc, mat, n, pantry?) (a material, or with pantry: true a pantry good — crops, fish, dishes)
//   | decorate(npc, need) (decorate their home: need = { tag?, n?, rug?, light?, stars?, ids? } — home/rating.js
//     meetsNeed, checked when you leave their home: docs/HOUSING.md §4)
//   | reach(at, x, z) (walk to a spot: world/questSteps.js, polled by reachTick)
//   any step may say lead: true (or lead(G, q) → bool) — Shadow leads the way to it (actors/shadowLead.js, ROADMAP R-17:
//     its text, or its giver's line, says so)
//   the zones (docs/ZONES.md §3, rules in world/questSteps.js): kill / boss take optional zone, dungeon, floor and tier
//   filters | find(item, n) | rescue(npc) | dungeonFloor(dungeon, n) | tier(dungeon, n) | villageSaved(zone)
export const QUESTS = {
  welcome: { title: 'Welcome Home, Chewy', giver: 'rosie', desc: 'Rosie wants to show you around Blossom Hollow.', steps: [{ type: 'talk', npc: 'rosie', text: 'Say hi to Rosie' }], reward: { coins: 50, xp: 20 }, next: 'burrow1' },
  burrow1: { title: 'Something Squishy', giver: 'rosie', desc: 'Strange squeaks echo from the Burrow on the shrine hill. Go take a peek!', steps: [{ type: 'kill', n: 8, text: 'Defeat yokai in the Burrow', lead: (G, q) => G.state.flags?.burrowChoice === 'self' && !(q.prog > 0) }, { type: 'collect', mat: 'mochi', n: 3, text: 'Bring back Mochi Jelly' }], reward: { coins: 120, xp: 80, potions: { heart: 3 } }, next: 'homes' },
  homes: { title: 'A Home for Everyone', giver: 'rosie', desc: 'New friends want to move in! Paint a homes zone (B → Zones) next to a path and let the village grow.', steps: [{ type: 'build', btype: 'home', n: 9, text: 'Grow the village to 9 homes' }], reward: { coins: 200, xp: 120, mats: { wood: 20, stone: 10 } }, next: 'lights' },
  lights: { title: 'Lights of Blossom Hollow', giver: 'rosie', desc: 'Nights are a little spooky. Place lanterns so everyone can find their way home.', steps: [{ type: 'buildAny', btypes: ['stoneLantern', 'streetLamp', 'lanternString'], n: 3, text: 'Build 3 more lanterns' }], reward: { coins: 150, xp: 150, mats: { lantern: 3 } }, next: 'king' },
  king: { title: 'The King of Squish', giver: 'rosie', desc: 'A giant mochi with a crown is hogging Floor 5. Time to deflate that ego!', steps: [{ type: 'floor', n: 5, text: 'Reach Floor 5' }, { type: 'boss', id: 'mochiKing', text: 'Defeat King Mochi' }], reward: { coins: 500, xp: 600, skillPts: 1, unique: true }, next: 'shrine' },
  shrine: { title: 'A Shrine for Wishes', giver: 'kitsune', desc: 'Kitsune says a shrine would make the whole village happier. (Needs village rank 2.)', steps: [{ type: 'build', btype: 'shrine', n: 1, text: 'Build a Blossom Shrine' }], reward: { coins: 300, xp: 400 }, next: 'umbrella' },
  umbrella: { title: 'Umbrella Trouble', giver: 'rosie', desc: 'Umbrellas keep hopping out of the Burrow at night. Their lord waits on Floor 10.', steps: [{ type: 'floor', n: 10, text: 'Reach Floor 10' }, { type: 'boss', id: 'kasaLord', text: 'Defeat Lord Karakasa' }], reward: { coins: 1200, xp: 2500, skillPts: 1, unique: true }, next: 'onsen' },
  onsen: { title: 'Hot Spring Dreams', giver: 'kuma', desc: 'Kuma dreams of a steamy hot spring for sore paws. (Needs village rank 3.)', steps: [{ type: 'build', btype: 'onsen', n: 1, text: 'Build a Hot Spring' }, { type: 'pop', n: 30, text: 'Reach 30 villagers' }], reward: { coins: 800, xp: 3000 }, next: 'oni' },
  oni: { title: "Oni's Kitchen Nightmare", giver: 'rosie', desc: 'Someone is stealing all the dumplings. The trail leads to Floor 15.', steps: [{ type: 'floor', n: 15, text: 'Reach Floor 15' }, { type: 'boss', id: 'oniChef', text: 'Defeat Oni Chef Gorobei' }], reward: { coins: 3000, xp: 12000, skillPts: 1, unique: true }, next: 'tails' },
  // the homestead (docs/HOMESTEAD.md): offered from day 2 (life/fishSocial.js); Kero hands over the rod at the talk step
  keroRod: { title: "Pond Guardian's Apprentice", giver: 'kero', desc: 'Kero the pond guardian has a spare fishing rod — and opinions about floats. Go and find him.', steps: [{ type: 'talk', npc: 'kero', text: 'Visit Kero, the pond guardian' }, { type: 'fish', n: 3, text: 'Catch 3 fish' }], reward: { coins: 150, xp: 60, hearts: 10 }, next: null },
  // Usagi's starter-pack quest (offered with the starter seeds, life/index.js) leads into Rosie's taste test
  firstSprouts: { title: 'First Sprouts', giver: 'usagi', desc: 'Usagi can\'t wait to see your first harvest! Plant seeds in your garden bed (F), water them every day and pick what grows.', steps: [{ type: 'plant', n: 3, text: 'Plant 3 seeds' }, { type: 'harvest', n: 3, text: 'Harvest 3 crops' }], reward: { coins: 120, xp: 50, hearts: 10, recipe: 'carrotSoup', pantry: { strawberrySeed: 2 } }, next: 'tasteTest' },
  tasteTest: { title: 'Taste Test', giver: 'rosie', desc: 'Rosie wants to taste your cooking! Cook at home (your cottage), at a campfire in the Burrow, or bake with her at the shop.', steps: [{ type: 'cook', n: 3, text: 'Cook 3 dishes' }, { type: 'talk', npc: 'rosie', text: 'Let Rosie have a taste' }], reward: { coins: 200, xp: 80, hearts: 10, recipe: 'strawberryMochi', mats: { mochi: 2 } }, next: null },
  tails: { title: 'Nine Tails of Moonlight', giver: 'kitsune', desc: 'The old fox spirit Tamamo stirs on Floor 20. Kitsune believes only a good boy can calm her.', steps: [{ type: 'floor', n: 20, text: 'Reach Floor 20' }, { type: 'boss', id: 'nineTails', text: 'Calm Tamamo, the Nine-Tailed' }], reward: { coins: 10000, xp: 40000, skillPts: 2, unique: true }, next: null },
};

const CHAT = {
  rosie: ['Did you know Shadow snores? Like a tiny tractor.', 'I baked strawberry mochi! …Shadow ate three.', "If you find anything shiny in the Burrow, I'll trade you treats for it!", 'The sakura are extra fluffy this year. I think they like you, Chewy.'],
  mochi: ['I painted the sunrise again. It came out… purple. Very avant-garde.', 'Petals make the best paintbrushes. Don\'t tell Usagi.', 'Purrr… sorry, I was napping standing up.'],
  usagi: ['The hydrangeas turned blue overnight! Magic, or just soil acidity?', 'Hop hop! Have you tried the flower beds by the plaza?', 'A bench near my garden would be lovely…'],
  kuma: ['Fresh melon-pan! Mind the crumbs.', 'The secret ingredient is honey. The other secret ingredient is more honey.', 'My oven hums a little song when it\'s happy.'],
  kitsune: ['The shrine lanterns whisper when the moon is full.', 'Nine tails is a lot of grooming, you know.', 'The Burrow is older than the village. Much older.'],
  pan: ['Zzz… oh! Hi Chewy. I was practicing kemari. In my dreams.', 'Bamboo is a food, a flute and a bed. Perfect plant.', 'Want to nap together sometime? Professionally?'],
  tanu: ['This leaf hat? Pure fashion. Definitely not a disguise.', 'I can get you a great deal on a slightly haunted umbrella.', 'Coins make the nicest jingle, don\'t they?'],
  kero: ['The koi told me it will rain on Tuesday. They are rarely wrong.', 'Ribbit. That means "hello" and also "nice scarf".', 'Please do not skip stones in my pond. The koi are sensitive.'],
};
// a villager's loved dish (life/pantry.js LOVED): their own special thank-you
const LOVED_LINES = {
  usagi: ['Carrot soup?! Hop hop HOP! It\'s my absolute favourite in the whole wide world!'],
  rosie: ['Strawberry mochi… for ME? *sniff* You remembered! I\'m going to cry into it. Happily!'],
  kuma: ['Honey cake! Oh my, oh my. The glaze is perfect. You have a baker\'s paws, Chewy.'],
  kero: ['A salt-grilled trout. …Ribbit. This is the best thing that has happened to me all season.'],
  pan: ['Melon bread… crunchy outside, fluffy inside… I\'m going to nap SO well after this. Zzz…'],
  mochi: ['A whole sushi platter?! Purrrr… I\'m going to paint it before I eat it. Then eat the painting. No wait.'],
  kitsune: ['The Moon Koi Bento… The old songs speak of this dish. You honour the shrine, little one.'],
};
const GIFT_LINES = { love: ['For me?! You shouldn\'t have! (Please do again.)', 'This is exactly what I wanted!!'], like: ['Oh, how thoughtful! Thank you, Chewy!', 'That\'s sweet of you.'], meh: ['Oh! …Thank you. I\'ll find a use for it. Somewhere.'] };
// Knocking after bedtime (npc.js sleepyAnswer): a drowsy hello (hi) and a goodnight (bye) per villager; 'folk' = townsfolk.
export const NIGHT_CHAT = {
  rosie: { hi: ["Mmh… Chewy? It's so late… *yawn* The shop's closed, silly.", "Chewy?! …Oh. I thought you were the tooth fairy. *yawn*"], bye: ["Come back in the morning and I'll have warm mochi. Night night~", "Tell Shadow goodnight from me… zzz…"] },
  mochi: { hi: ["Mmh… Chewy? It's so late… *yawn* I was dreaming in watercolours.", "Purrr… whuh? Oh, it's you. I was curled up in a moonbeam."], bye: ["Let's paint the sunrise tomorrow… if I wake up for it. Goodnight~", "Nine more naps… goodnight, Chewy."] },
  usagi: { hi: ["Chewy? *yawn* The carrots are asleep… and so was I.", "Mmh… is it morning? No? Then why is my nose twitching?"], bye: ["Hop along home, okay? The flowers need their beauty sleep too.", "Goodnight… dream of dandelions~"] },
  kuma: { hi: ["Hrrmm…? *yawn* The dough is rising, little one… and so will I. At dawn.", "Mmph. Chewy? The bakery's asleep. So is its baker."], bye: ["I'll save you a warm melon-pan. Now off to bed… goodnight.", "Sleep tight. Honey dreams…"] },
  kitsune: { hi: ["Oh… Chewy. Even foxes sleep eventually. *yawn*", "The lanterns said you'd come knocking. They didn't say how late…"], bye: ["Go home now, the moon will walk you there. Goodnight.", "Sleep well. Mind the shadows on the way~"] },
  pan: { hi: ["Zzz… zzz… huh? Chewy? I was napping. Professionally.", "*yawn* …Is it breakfast? It feels like second dinner."], bye: ["Back to bed… this pillow won't hug itself. Nighty night.", "Zzz… goodnight, Chewy… zzz…"] },
  tanu: { hi: ["Whuh—! Oh, Chewy. *yawn* Shop's closed. Even for good boys.", "Mmh… if this is about the umbrella, it was only a LITTLE haunted."], bye: ["Come by tomorrow for the sleepyhead discount. Goodnight~", "Night night. Don't tell anyone I sleep in a teapot."] },
  kero: { hi: ["Ribb… *yawn* …it. Chewy? The koi are asleep. So was I.", "Croak… mmh. The pond is so quiet at night, isn't it?"], bye: ["Goodnight, Chewy. Dream of lily pads.", "Sleep well. Ribbit means goodnight too."] },
  folk: { hi: ["Mmh… Chewy? It's so late… *yawn*", "Oh! You startled me… I was already in my pyjamas. *yawn*", "*yawn* …Is everything okay? It's the middle of the night!"], bye: ["Get some sleep, okay? Goodnight~", "See you in the morning, Chewy. Sweet dreams!", "Shh… the whole village is asleep. Goodnight!"] },
};
// a decorate request's extra thank-you: a workbench recipe (home/recipes.js, learn: 'reward')
const CRAFT_REWARD = { mochi: 'catTower', kero: 'fishTank' };
const HEART_REWARDS = { 3: { coins: 100, text: 'Here, a little something for being such a good friend!' }, 6: { item: 'magic', text: 'I found this and thought of you!' }, 9: { item: 'rare', text: 'You\'re my best friend in the whole village. Take this, please!' } };
const REACH_POS = new WeakMap(); // reach step → { w: world, p: its spot on that world's ground } (never on the step: it's saved)

export class Story {
  constructor(G) {
    this.G = G;
    const Q = G.state.quests;
    Q.active ||= []; Q.done ||= []; Q.requests ||= {};
    if (!Q.active.length && !Q.done.length) this.start('welcome', true);
    for (const id of Q.done) { const nx = QUESTS[id]?.next; if (nx && !Q.done.includes(nx) && !Q.active.some(q => q.id === nx)) this.start(nx, true); }
    Events.on('monster:killed', e => this.progress('kill', e));
    Events.on('boss:dead', e => this.progress('boss', e));
    Events.on('mode:changed', e => { if (e.mode === 'dungeon') this.progress('floor', e); });
    Events.on('village:changed', () => this.progress('build'));
    Events.on('materials:changed', () => this.progress('collect'));
    Events.on('fish:caught', e => this.progress('fish', e));
    Events.on('garden:plant', e => this.progress('plant', e));
    Events.on('garden:harvest', e => this.progress('harvest', e));
    Events.on('dish:cooked', e => this.progress('cook', e));
    // the zones (docs/ZONES.md §8): quest items, rescues, dungeon clears / tiers, saved villages (phase D emits the first two)
    Events.on('quest:find', e => this.progress('find', e));
    Events.on('villager:rescued', e => this.progress('rescue', e));
    Events.on('dungeon:cleared', e => this.progress('tier', e));
    Events.on('village:saved', e => this.progress('villageSaved', e));
    setInterval(() => this.progress('pop'), 5000);
    // the cozy path (docs/COZY.md §3, §12): the crew routes the Expedition Board lists under Story, and the quest uniques a
    // crew left waiting for your own first win over that boss
    this.crewObjectives = st => storyObjectives(st);
    this.villageObjectives = st => villageObjectives(st); // (the zone villagers' quests: the Board's Village quests tab)
    Events.on('boss:dead', e => this.payOwed(e));
  }
  get Q() { return this.G.state.quests; }
  def(id) { return QUESTS[id] || ZONE_QUESTS[id] || this.Q.requests?.[id]?.def; }
  start(id, silent = false) {
    if (this.Q.active.some(q => q.id === id) || this.Q.done.includes(id)) return;
    this.Q.active.push({ id, step: 0, prog: 0 });
    const d = this.def(id);
    if (!silent) { this.G.ui?.banner?.('New Quest', d.title, { style: 'quest' }); Events.emit('sfx', 'ui_quest'); }
    Events.emit('quest:update');
    this.progress('any');
  }
  stepDone(q, s) {
    const G = this.G, st = G.state;
    switch (s.type) {
      case 'collect': return (st.materials[s.mat] || 0) >= s.n;
      case 'deliver': return !!q.delivered;
      case 'decorate': return !!q.decorated;
      case 'build': return st.village.buildings.filter(b => b.type === s.btype).length >= s.n + (q.base || 0);
      case 'buildAny': return st.village.buildings.filter(b => s.btypes.includes(b.type)).length >= s.n + (q.base || 0);
      case 'pop': return (G.sim?.stats.population || 0) >= s.n;
      case 'floor': return (st.dungeon.deepest || 0) >= s.n;
      case 'dungeonFloor': case 'tier': case 'villageSaved': return zoneStepDone(s, st);
      default: return q.prog >= (s.n || 1);
    }
  }
  progress(kind, e) {
    let changed = false;
    for (const q of [...this.Q.active]) {
      const d = this.def(q.id); if (!d) continue;
      const s = d.steps[q.step]; if (!s) continue;
      if (s.type === 'buildAny' && q.base === undefined) q.base = this.G.state.village.buildings.filter(b => s.btypes.includes(b.type)).length;
      const gain = stepGain(s, kind, e); // kill / boss (with their zone filters), find, rescue: world/questSteps.js
      if (gain === 'set') { q.prog = Math.max(q.prog, s.n || 1); changed = true; } else if (gain) { q.prog += gain; changed = true; }
      if (kind === 'fish' && s.type === 'fish') { q.prog++; changed = true; }
      if ((kind === 'plant' || kind === 'harvest' || kind === 'cook') && s.type === kind) { q.prog += kind === 'cook' ? e?.n || 1 : 1; changed = true; }
      if (this.stepDone(q, s)) {
        q.step++; q.prog = 0; changed = true;
        if (q.step >= d.steps.length) this.complete(q, d);
        else this.G.ui?.toast?.(`Quest updated: ${d.steps[q.step].text}`, { color: '#ffd84a' });
      }
    }
    if (changed) Events.emit('quest:update');
  }
  complete(q, d) {
    const G = this.G, A = G.actions, r = d.reward || {};
    this.Q.active.splice(this.Q.active.indexOf(q), 1);
    this.Q.done.push(q.id);
    if (d.giver && d.giver !== 'rosie' || d.request) { /* reward delivered on completion */ }
    if (r.coins) A.addCoins(r.coins);
    if (r.xp) A.addXp(r.xp);
    if (r.skillPts) A.addSkillPts(r.skillPts);
    if (r.mats) for (const k in r.mats) A.addMaterial(k, r.mats[k]);
    if (r.potions) for (const k in r.potions) A.addPotion(k, r.potions[k]);
    if (r.unique) { // (a crew's win leaves the unique waiting for your own: docs/COZY.md §0.3)
      const bi = d.steps.findIndex((s, i) => s.type === 'boss' && q.crewSteps?.includes(i));
      if (bi >= 0) this.owe(d.steps[bi], d, q); else this.giveItem(makeUnique(pick(UNIQUE_IDS), Math.max(5, G.state.player.lvl)));
    }
    if (r.pantry) for (const k in r.pantry) { A.addPantry(k, r.pantry[k], { src: 'quest' }); G.ui?.pantryGain?.(k, r.pantry[k], {}); }
    if (r.recipe) setTimeout(() => G.life?.teach?.(r.recipe, { from: d.giver, src: 'quest' }), 1800);
    if (r.furniture) setTimeout(() => { A.addFurniture?.(r.furniture, 1, { src: 'quest' }); G.ui?.toast?.(`${this.nameOf(d.giver)} gave you a ${FURNITURE[r.furniture]?.name || r.furniture}! (in your furniture storage)`, { icon: 'home', color: '#ffb07a' }); }, 1800);
    if (r.craft) setTimeout(() => G.teachRecipe?.(r.craft, { from: d.giver }), 2400); // (a workbench recipe: home/sources.js)
    if (d.request && d.steps.some(s => s.pantry)) setTimeout(() => G.life?.onRequestDone?.(d.giver), 2200);
    if (r.hearts && d.giver) this.addHearts(d.giver, r.hearts);
    G.ui?.banner?.('Quest Complete!', d.title, { style: 'quest' });
    Events.emit('sfx', 'ui_levelup');
    G.vfx?.levelUp?.(G.player.pos.clone());
    if (d.request) { delete this.Q.requests[q.id]; const k = this.Q.done.lastIndexOf(q.id); if (k >= 0) this.Q.done.splice(k, 1); }
    if (d.next) setTimeout(() => this.start(d.next), 2500);
    Events.emit('quest:update');
  }
  // ------------------------------------------------------------------ the cozy path: steps done by a crew (docs/COZY.md §3, §4.9)
  /** Complete step i of an active quest (it must be the current one). crew: who did it (the Journal says "done by …").
   *  The quest moves on as if you'd done it; a last step completes the quest. → true if it moved */
  completeStep(id, i, { crew = null } = {}) {
    const q = this.Q.active.find(x => x.id === id), d = q && this.def(id);
    if (!d || q.step !== i || !d.steps[i]) return false;
    if (crew) { (q.crewSteps ||= []).includes(i) || q.crewSteps.push(i); q.crewBy = crew; }
    q.step++; q.prog = 0;
    if (q.step >= d.steps.length) this.complete(q, d);
    else this.G.ui?.toast?.(`Quest updated: ${d.steps[q.step].text}`, { color: '#ffd84a' });
    Events.emit('quest:update');
    this.progress('any'); // (a state-derived next step that already holds: burrow1's Mochi Jelly the crew brought home)
    return true;
  }
  /** A crew came home from a quest's route (cozy/expeditionRun.js). success: every fight step left is done (burrow1's
   *  kills and its Mochi Jelly; a Burrow boss's floor and the boss); partial: what they managed (half of burrow1's kills;
   *  a boss quest's floor), so you or the next crew only do the rest. → { title, done, steps } for the report */
  crewResult(id, result, { crew = '' } = {}) {
    const d = this.def(id), q0 = this.Q.active.find(x => x.id === id); if (!d || !q0) return null;
    const out = { title: d.title, done: false, steps: 0 };
    const cur = () => { const q = this.Q.active.find(x => x.id === id); const s = q && d.steps[q.step]; return q && s && CREW_STEP_TYPES.has(s.type) && (s.type !== 'collect' || s.mat === 'mochi') ? { q, s } : null; };
    if (result === 'success') {
      for (let k = 0, c; k < 6 && (c = cur()); k++) if (this.completeStep(id, c.q.step, { crew })) out.steps++; else break;
    } else if (result === 'partial') {
      const c = cur();
      if (c?.s.type === 'kill') { const half = Math.ceil((c.s.n || 1) / 2); if ((c.q.prog || 0) < half) { c.q.prog = half; out.steps = 0.5; Events.emit('quest:update'); } }
      else if (c?.s.type === 'floor' && this.completeStep(id, c.q.step, { crew })) out.steps = 1;
    }
    out.done = this.Q.done.includes(id) || (!this.Q.active.some(x => x.id === id) && !!d.request);
    return out;
  }
  /** a quest unique a crew's win left for you: owed until you beat that boss yourself (docs/COZY.md §0.3, §14.1) */
  owe(s, d, q) {
    const key = s.id || (s.dungeon ? `dungeon:${s.dungeon}` : null); if (!key) return;
    (this.Q.owed ||= {})[key] = { quest: q.id, title: d.title };
  }
  /** your own win over a boss pays the quest unique its crew route left waiting */
  payOwed(e) {
    const O = this.Q.owed; if (!O || !e) return;
    for (const key of [e.id, e.dungeon ? `dungeon:${e.dungeon}` : null]) {
      const w = key && O[key]; if (!w) continue;
      delete O[key];
      const G = this.G;
      setTimeout(() => { this.giveItem(makeUnique(pick(UNIQUE_IDS), Math.max(5, G.state.player.lvl))); G.ui?.toast?.(`${w.title}: the treasure your crew left for you is yours!`, { icon: 'star', color: '#ffd84a', duration: 5 }); }, 3200);
      Events.emit('quest:update');
    }
  }
  // complete any active 'talk to <npc>' step
  markTalk(id) {
    let hit = false;
    for (const q of this.Q.active) { const d = this.def(q.id); const s = d?.steps[q.step]; if (s?.type === 'talk' && s.npc === id) { q.prog = 1; hit = true; } }
    if (hit) this.progress('talk');
    return hit;
  }
  // what marker (if any) should float above this NPC: '!' = has something for you, '?' = waiting on your progress
  markerFor(id) {
    if (id === 'moka' && !this.G.state.flags?.mokaJoined) return '!'; // waiting by the fountain to meet the pack
    for (const q of this.Q.active) { const d = this.def(q.id); const s = d?.steps[q.step]; if (s?.type === 'talk' && s.npc === id) return '!'; }
    const f = this.G.state.friends[id];
    if (f?.pendingReward) return 'gift';
    const lm = this.G.life?.markerFor?.(id); if (lm) return lm; // (the homestead: Kero's Fish Log gifts)
    if (this.Q.active.some(q => { const d = this.def(q.id); return d && d.giver === id && !d.request; })) return '?';
    return null;
  }
  // put a reward item in the bag; if it's full, into the stash; if that's full too, at Chewy's feet
  giveItem(item) {
    const G = this.G;
    if (G.actions.pickup(item)) return true;
    const st = G.state.stash, i = st.indexOf(null);
    if (i >= 0) { st[i] = item; Events.emit('inv:changed', { c: 'stash' }); G.ui?.toast?.(`Bag full — ${item.name} was sent to your stash at home`, { color: '#ffd84a' }); return true; }
    const loot = G.mode === 'dungeon' ? G.dungeon?.loot : G.villageLoot;
    loot?.drop(G.player.pos.clone(), [{ type: 'item', item }]);
    G.ui?.toast?.(`Bag and stash full — ${item.name} is on the ground`, { color: '#ffd84a' });
    return true;
  }
  // hand over requested materials when talking to the giver
  tryDeliver(id) {
    const G = this.G;
    for (const q of this.Q.active) {
      const d = this.def(q.id), s = d?.steps[q.step];
      if (s?.type !== 'deliver' || s.npc !== id) continue;
      if (this.haveFor(s) < s.n) return { need: s };
      if (s.pantry) G.actions.spendPantry({ [s.mat]: s.n }, { src: 'request' }); else G.actions.spendMaterials({ [s.mat]: s.n });
      q.delivered = true;
      this.progress('deliver');
      return { done: s };
    }
    return null;
  }
  /** how many of a deliver step's goods the household has (materials, or pantry goods for a homestead request) */
  haveFor(s) { const st = this.G.state; return s.pantry ? st.pantry?.[s.mat] || 0 : st.materials[s.mat] || 0; }
  // where the current objective is, for the on-screen quest pointer → { pos, label, kind, quest, step, lead } | null
  // (only: that quest's objective; lead: the step says Shadow leads the way, actors/shadowLead.js)
  target(only = null) {
    const G = this.G, st = G.state;
    const act = this.Q.active.filter(q => this.def(q.id) && (!only || q.id === only));
    const order = [...act.filter(q => !this.def(q.id).request), ...act.filter(q => this.def(q.id).request)];
    const tag = (t, q, s) => Object.assign(t, { quest: q.id, step: q.step, lead: typeof s.lead === 'function' ? !!s.lead(G, q) : !!s.lead });
    // (Blossom Hollow's villagers only while you're in the village: their records stay in G.npcs while you're in a
    // region, at village coordinates: ROADMAP R-4, the welcome quest's pointer at Rosie from inside a zone)
    const npcPos = id => { const n = G.mode === 'village' && G.npcs?.find(x => x.id === id && x.visible); return n ? { pos: n.pos, label: n.name, kind: 'npc' } : null; };
    for (const q of order) {
      const d = this.def(q.id), s = d.steps[q.step]; if (!s) continue;
      if (s.type === 'talk') { const t = npcPos(s.npc) || this.zoneTalkTarget(s) || this.homeTalkTarget(s); if (t) return tag(t, q, s); continue; }
      if (s.type === 'decorate') { // their home's door (inside it: nothing to point at)
        const rec = G.mode === 'village' && G.sim?.list.find(r => r.data.owner === s.npc);
        if (rec) return tag({ pos: rec.door, label: `${this.nameOf(s.npc)}'s home`, kind: 'place' }, q, s);
        continue;
      }
      if (s.type === 'deliver') { if (this.haveFor(s) >= s.n) { const t = npcPos(s.npc); if (t) return tag(t, q, s); } continue; }
      const t = this.placeFor(s, destOf(s)); if (t) return tag(t, q, s);
    }
    return null;
  }
  /** The pointer for a step that's somewhere you travel to (world/questSteps.js destOf): from the village, the Burrow's
   *  gate or the Wayfarer's Post for a zone; in a zone's region, its dungeon gate (phase C: mode.gatePos) or its village
   *  (phase D: mode.villagePos); in the right dungeon, the stairs until the floor, then the boss or the objective's mark
   *  (phase D: mode.questMark(step)); anywhere else, the way out. Burrow quests point nowhere in an outdoor region. */
  placeFor(s, dest) {
    const G = this.G, D = G.mode === 'dungeon' ? G.dungeon : null;
    if (!dest || (G.mode !== 'village' && !D)) return null;
    const at = (pos, label) => (pos ? { pos, label, kind: 'place' } : null);
    const zone = dest.zone || null, burrow = dest.dungeon === 'burrow';
    if (G.mode === 'village') {
      if (dest.home) return dest.reach ? at(this.reachPos(s), s.label || s.text) : null; // (a reach step at home: its spot)
      if (burrow) { const gate = G.sim?.list.find(r => r.data.type === 'dungeonGate'); return gate ? at(gate.door, 'The Burrow') : null; }
      const tp = zone && G.world.landmarks?.travel; if (!tp) return null;
      const p = this._postPos ||= { x: tp.x, y: G.world.heightAt?.(tp.x, tp.z) || 0, z: tp.z };
      return at(p, "The Wayfarer's Post");
    }
    const here = D.kind === 'region' ? null : D.def?.id;
    if (dest.home) return at(D.exitPos, D.kind === 'region' ? "The Wayfarer's Stone" : 'The way out'); // (a reach step at home, from out here)
    if (dest.dungeon && here === dest.dungeon) { // in the right dungeon
      if (dest.floor && D.floor < dest.floor) return at(D.stairsPos, 'Stairs down');
      if (dest.floor && D.floor > dest.floor) return at(D.exitPos, 'The way out');
      if (dest.boss) return D.boss?.alive ? at(D.boss.pos, D.boss.name) : at(D.stairsPos, 'Stairs down');
      if (dest.reach) return at(this.reachPos(s), s.label || s.text);
      if (dest.mark) return at(D.questMark?.(s), s.text);
      return null;
    }
    if (burrow) return null; // (a Burrow step: nothing to point at in a region / a zone dungeon, as before)
    if (D.kind === 'region' && D.zoneId === zone) { // the step's zone, outdoors
      if (dest.reach && !dest.dungeon) return at(this.reachPos(s), s.label || s.text);
      if (dest.village) return at(D.villagePos, 'The village');
      if (dest.dungeon) return at(D.gatePos, DUNGEONS[dest.dungeon]?.name || 'The dungeon');
      return dest.boss && D.boss?.alive ? at(D.boss.pos, D.boss.name) : null;
    }
    if (dest.dungeon && D.kind === 'zone' && here !== dest.dungeon) return at(D.exitPos, 'The way out'); // (another zone's dungeon)
    if (zone && D.zoneId !== zone) return at(D.exitPos, D.kind === 'region' ? "The Wayfarer's Stone" : 'The way out'); // (somewhere else: travel on)
    return null;
  }
  /** a reach step's spot on this world's ground (cached per world) */
  reachPos(s) {
    const W = this.G.world; let c = REACH_POS.get(s);
    if (!c || c.w !== W) REACH_POS.set(s, c = { w: W, p: { x: s.x, y: W?.heightAt?.(s.x, s.z) || 0, z: s.z } });
    return c.p;
  }
  /** where the hero is, for reach steps: { home, zone, dungeon (a floor's dungeon id; null in a region), floor } */
  whereNow() {
    const G = this.G, D = G.mode === 'dungeon' ? G.dungeon : null;
    return { home: G.mode === 'village', zone: D?.zoneId || null, dungeon: D && D.kind !== 'region' ? D.def?.id || null : null, floor: D?.floor ?? null };
  }
  /** reach steps: the hero at the spot completes it (polled a few times a second by actors/shadowLead.js) */
  reachTick(dt) {
    if ((this._reachT = (this._reachT || 0) - dt) > 0) return;
    this._reachT = 0.2;
    const P = this.G.player; if (!P || this.G.playerDead) return;
    let hit = false, w = null;
    for (const q of this.Q.active) {
      const s = this.def(q.id)?.steps[q.step]; if (s?.type !== 'reach') continue;
      if (!reachIsHere(s, w ||= this.whereNow())) continue;
      if (Math.hypot(P.pos.x - s.x, P.pos.z - s.z) < (s.r || REACH_R)) { q.prog = 1; hit = true; }
    }
    if (hit) this.progress('reach');
  }
  // quest objects for the UI tracker / journal
  uiList() {
    const G = this.G, st = G.state;
    const stepView = (q, s, i) => {
      const done = i < q.step;
      let have = 0, need = s.n || 1;
      if (i === q.step) {
        if (s.type === 'collect' || s.type === 'deliver') have = this.haveFor(s);
        else if (s.type === 'build') have = st.village.buildings.filter(b => b.type === s.btype).length;
        else if (s.type === 'buildAny') have = st.village.buildings.filter(b => s.btypes.includes(b.type)).length - (q.base || 0);
        else if (s.type === 'pop') have = G.sim?.stats.population || 0;
        else if (s.type === 'floor') have = Math.min(s.n, st.dungeon.deepest || 0);
        else have = zoneStepHave(s, st) ?? (q.prog || 0);
      }
      const crew = done && q.crewSteps?.includes(i) && q.crewBy; // (done by a crew: docs/COZY.md §4.10)
      return { text: crew ? `${s.text} · done by ${q.crewBy}` : s.text, have: done ? need : Math.min(need, have), need, done, crew: crew || null };
    };
    const act = this.Q.active.map(q => { const d = this.def(q.id); if (!d) return null; return { id: q.id, title: d.title, desc: d.desc, giver: this.nameOf(d.giver), main: !d.request, steps: d.steps.map((s, i) => stepView(q, s, i)).slice(0, q.step + 1), reward: d.reward }; }).filter(Boolean);
    const done = this.Q.done.filter(id => QUESTS[id]).map(id => ({ id, title: QUESTS[id].title, desc: QUESTS[id].desc, giver: this.nameOf(QUESTS[id].giver), main: true, steps: QUESTS[id].steps.map(s => ({ text: s.text, have: 1, need: 1, done: true })), reward: QUESTS[id].reward, done: true }));
    return act; // (completed quests live in state.quests.done)
  }
  /** A zone villager's talk step (a zone quest's turn-in, world/zoneQuests.js): the villager, out in their village; the
   *  village in their zone's region; the way out of a dungeon; the way to the zone from anywhere else (placeFor). */
  zoneTalkTarget(s) {
    const n = ZONE_NPCS[s.npc]; if (!n) return null;
    const G = this.G, D = G.mode === 'dungeon' ? G.dungeon : null;
    if (D?.kind === 'region' && D.zoneId === n.zone) { const p = D.village?.npcPos?.(s.npc); return p ? { pos: p, label: n.name, kind: 'npc' } : D.villagePos ? { pos: D.villagePos, label: 'The village', kind: 'place' } : null; }
    if (D && D.kind !== 'region') return D.exitPos ? { pos: D.exitPos, label: 'The way out', kind: 'place' } : null;
    return this.placeFor(s, { zone: n.zone, village: true });
  }
  /** A Blossom Hollow villager's talk step while you're out (ROADMAP R-4): the way home from a zone (its Wayfarer's
   *  Stone) or a dungeon (the way out); nothing indoors. */
  homeTalkTarget(s) {
    if (ZONE_NPCS[s.npc]) return null;
    const D = this.G.mode === 'dungeon' ? this.G.dungeon : null;
    return D?.exitPos ? { pos: D.exitPos, label: D.kind === 'region' ? "The Wayfarer's Stone" : 'The way out', kind: 'place' } : null;
  }
  /** Phase C's provider (docs/ZONES.md §3): what the active quests need placed on a dungeon floor →
   *  [{ kind: 'cage', npc, label, quest }, { kind: 'drop', item, n, label, from, quest }] (world/zoneQuests.js) */
  dungeonObjectives(o = {}) { return zoneObjectives(this.G.state, o, id => this.def(id)); }
  /** the zone quests a villager can offer now (their village saved, prereqs done) */
  zoneOffers(id, zone) { return offersFor(this.G.state, id, this.G.state.zones?.[zone]?.village === 'saved'); }
  // ------------------------------------------------------------------ friendship
  friend(id) { return (this.G.state.friends[id] ||= { hearts: 0, pts: 0, talkedDay: 0, giftDay: 0, rewards: [] }); }
  addHearts(id, pts) {
    const f = this.friend(id), before = f.hearts;
    f.pts += pts; f.hearts = Math.min(10, Math.floor(f.pts / 10));
    if (f.hearts > before) {
      this.G.ui?.toast?.(`♥ ${this.nameOf(id)} likes you more! (${f.hearts}/10)`, { color: '#ff8fb0' });
      const npc = this.G.npcs?.find(n => n.id === id); if (npc) this.G.vfx?.emote?.(npc, 'heart', 2);
      for (const lvl of Object.keys(HEART_REWARDS)) if (f.hearts >= +lvl && !f.rewards.includes(+lvl)) { f.rewards.push(+lvl); f.pendingReward = +lvl; }
    }
    Events.emit('friend:changed', { id });
  }
  nameOf(id) { return id === 'rosie' ? 'Rosie' : VILLAGERS.find(v => v.id === id)?.spec.name || ZONE_NPCS[id]?.name || id; }
  likesOf(id) { return id === 'rosie' ? ['petal', 'mochi', 'crystal'] : VILLAGERS.find(v => v.id === id)?.likes || []; }
  // full conversation flow for a villager
  async talk(npc) {
    const G = this.G, ui = G.ui, id = npc.id, f = this.friend(id), day = G.day?.day || 1;
    const portrait = G.portrait?.(id);
    // villagers' lines are written to Chewy: heroText addresses whoever is being played
    const say = (lines, choices) => ui?.dialogue ? ui.dialogue({ speaker: npc.name, portrait, lines: lines.map(l => heroText(l, this.G.state)), choices: choices?.map(c => ({ ...c, text: heroText(c.text, this.G.state) })), voice: npc.spec.voice }) : Promise.resolve(null);
    if (f.talkedDay !== day) { f.talkedDay = day; this.addHearts(id, 2); }
    // story talk steps
    this.markTalk(id);
    if (!npc.folk && this.G.life?.onTalk) await this.G.life.onTalk(npc, say); // (the homestead: Kero's rod, gifts, records)
    // an invitation (3 hearts and a home of their own): visit and redecorate any time (docs/HOUSING.md §4)
    if (!npc.folk && f.hearts >= 3 && !f.invited && G.sim?.list.some(r => r.data.owner === id)) {
      f.invited = day;
      await say(['You know what? Make yourself at home! Pop in any time you like — and if you want to move things around, go right ahead~']);
      G.ui?.toast?.(`${this.nameOf(id)} invited you over! You can visit and decorate their home any time`, { icon: 'home', color: '#ff8fb0' });
      Events.emit('sfx', 'ui_quest'); Events.emit('friend:invited', { id });
    }
    // pending heart reward
    if (f.pendingReward && HEART_REWARDS[f.pendingReward]?.item && G.actions.firstFree('inv') < 0) {
      await say(["I have a present for you… but your bag looks stuffed! I'll keep it safe until you have room."]);
    } else if (f.pendingReward) {
      const R = HEART_REWARDS[f.pendingReward]; f.pendingReward = null;
      await say([R.text]);
      if (R.coins) G.actions.addCoins(R.coins);
      if (R.item) this.giveItem(generateItem({ ilvl: G.state.player.lvl + 2, rarity: R.item }));
      Events.emit('sfx', 'ui_quest');
    }
    const dv = !npc.folk && this.tryDeliver(id);
    const thanks = dv?.done ? [`${dv.done.n} ${dv.done.mat}! Oh, thank you so much, Chewy!`] : [];
    if (dv?.done) { npc.anim.play('happy'); G.vfx?.emote?.(npc, 'heart', 2); }
    if (npc.folk) { await say([pick(['Blossom Hollow is the coziest village ever!', 'I just moved in! My new home smells like fresh cedar.', 'Have you seen the koi pond? So peaceful.', 'The Burrow gives me the shivers… you are so brave, Chewy!', 'I love the lanterns at night.', 'Shadow let me pet him! Best day ever.'])]); return; }
    const lines = [...thanks];
    const quest = this.Q.active.find(q => this.def(q.id)?.giver === id);
    if (id === 'rosie' && quest) lines.push(this.def(quest.id).desc);
    else lines.push(pick(CHAT[id] || ['Hello Chewy!']));
    const req = this.Q.requests[`req_${id}`];
    const choices = [{ text: 'Chat' }, { text: 'Give a gift 🎁' }];
    if (!req && this.canRequest(id)) choices.push({ text: 'Need any help? 📝' });
    if (id === 'rosie') choices.push({ text: "Open Rosie's shop 🍰" });
    if (id === 'rosie' && G.life?.kitchen) choices.push({ text: 'Bake with Rosie 🧁' }); // her oven (docs/HOMESTEAD.md §4)
    if (id === 'usagi' && G.openSeedStall) choices.push({ text: 'Seeds, please! 🌱' }); // her Seed Stall (docs/HOMESTEAD.md)
    if (id === 'kero' && G.openFishHut) choices.push({ text: 'Fishing gear & fish trades 🎣' }); // his Fishing Hut
    if (id === 'tanu' && G.openTrinkets) choices.push({ text: 'Furniture, please! 🪑' }); // Tanu's Trinkets (docs/HOUSING.md §3)
    choices.push({ text: 'Bye!' });
    const c = await say(lines, choices);
    const pickText = choices[c]?.text || '';
    if (pickText.startsWith('Chat')) await say([pick(CHAT[id] || ['…']), `(Friendship: ${'♥'.repeat(f.hearts)}${'♡'.repeat(10 - f.hearts)})`]);
    else if (pickText.startsWith('Give')) await this.giftFlow(npc, say, G.ui?.pickGift ? o => G.ui.pickGift(o) : null);
    else if (pickText.startsWith('Bake')) G.life?.kitchen?.open('oven', npc.pos);
    else if (pickText.startsWith('Need')) await this.requestFlow(npc, say);
    else if (pickText.startsWith('Open')) G.openShop?.();
    else if (pickText.startsWith('Seeds')) await G.openSeedStall?.();
    else if (pickText.startsWith('Fishing')) G.openFishHut?.();
    else if (pickText.startsWith('Furniture')) G.openTrinkets?.();
  }
  /** Everything giftable for this villager: pantry dishes, then fish, crops and forage (no seeds), then materials.
   *  → [{ key, name, n, pantry, love: 'loved' | 'liked' | null }] */
  giftItems(id) {
    const st = this.G.state, ORDER = ['dish', 'fish', 'crop', 'forage'], rank = l => (l === 'loved' ? 0 : l === 'liked' ? 1 : 2);
    const pan = pantryList(st).filter(e => ORDER.includes(e.def.kind)).map(e => ({ key: e.id, name: e.def.name, n: e.n, pantry: true, kind: e.def.kind, v: e.def.value,
      love: e.def.lovedBy?.includes(id) ? 'loved' : e.def.likedBy?.includes(id) ? 'liked' : null }));
    pan.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || rank(a.love) - rank(b.love) || b.v - a.v);
    const mats = Object.entries(st.materials).filter(([, n]) => n > 0).map(([k, n]) => ({ key: k, name: MATERIALS[k]?.name || k, n, pantry: false, love: this.likesOf(id).includes(k) ? 'liked' : null }));
    return [...pan, ...mats];
  }
  /** "Give a gift": pickGift(o) → Promise<key|null> (the paged gift picker, ui/gift.js); without one, a paged
   *  dialogue menu. Loved dishes +16 hearts with their own line, liked things +8, anything else +3. */
  async giftFlow(npc, say, pickGift = null) {
    const G = this.G, id = npc.id, f = this.friend(id), day = G.day?.day || 1;
    if (f.giftDay === day) return say(['You already gave me something today! Save some for tomorrow~']);
    const items = this.giftItems(id);
    if (!items.length) return say(['Aww, your pockets are empty! That\'s okay.']);
    let key = null;
    if (pickGift) key = await pickGift({ id, name: npc.name, portrait: G.portrait?.(id), items });
    else for (let page = 0; ;) {
      const sl = items.slice(page * 5, page * 5 + 5), more = items.length > page * 5 + 5;
      const c = await say([page ? 'Anything else in there?' : 'Ooh, a present? What is it?'], [...sl.map(e => ({ text: `${e.name} (${e.n})${e.love ? ' ♥' : ''}` })), ...(more ? [{ text: 'More… ▸' }] : []), { text: 'Never mind' }]);
      if (c == null) return;
      if (c < sl.length) { key = sl[c].key; break; }
      if (more && c === sl.length) { page++; continue; }
      return;
    }
    const it = key && items.find(e => e.key === key); if (!it) return;
    if (it.pantry ? !G.actions.spendPantry({ [key]: 1 }, { quiet: true, src: 'gift' }) : !G.actions.spendMaterials({ [key]: 1 })) return;
    f.giftDay = day;
    const pts = it.love === 'loved' ? 16 : it.love === 'liked' ? 8 : 3;
    this.addHearts(id, pts);
    G.vfx?.emote?.(npc, it.love ? 'heart' : 'sparkle', 2);
    npc.anim.play('happy');
    if (it.love === 'loved') { G.vfx?.sparkle?.(npc.pos.clone().setY(npc.pos.y + 1.4), { n: 22, color: '#ff8fb0', r: 0.7, rise: 1.2 }); G.vfx?.sparkle?.(npc.pos.clone().setY(npc.pos.y + 1.4), { n: 10, color: '#fff3b8', r: 0.5, rise: 1.4 }); }
    Events.emit('sfx', it.love === 'loved' ? 'gift_loved' : it.love ? 'ui_levelup' : 'ui_coin');
    G.ui?.toast?.(`${it.love === 'loved' ? `${this.nameOf(id)} LOVES it!` : it.love ? `${this.nameOf(id)} likes it!` : `${this.nameOf(id)} thanks you`} <span class="t-heal">+${pts} ♥</span>`, { html: true, iconURL: it.pantry ? pantryIcon(key) : null, icon: it.pantry ? null : 'heart', color: '#ff8fb0', sub: `${it.name} for ${this.nameOf(id)} · ${this.friend(id).hearts}/10 hearts` });
    Events.emit('gift:given', { id, key, love: it.love, pts });
    const line = it.love === 'loved' ? pick(LOVED_LINES[id] || GIFT_LINES.love) : pick(it.love ? GIFT_LINES.love : GIFT_LINES.like);
    return say([line]);
  }
  /** Requests for crops, fish and dishes (docs/HOMESTEAD.md §4): a crop the stall sells at this rank, a fish once you
   *  have a rod, a dish you know how to cook once you've cooked something. */
  homesteadRequests(npc) {
    const G = this.G, st = G.state, id = npc.id, out = [], rank = G.sim?.stats?.rank || 1;
    const deliver = (mat, n, text, ask) => ({ steps: [{ type: 'deliver', mat, n, pantry: true, npc: id, text }], text: ask });
    const crops = CROP_IDS.filter(c => CROPS[c].rank <= rank);
    if (crops.length) { const c = pick(crops), n = randInt(2, 4); out.push(deliver(c, n, `Bring ${n} ${PANTRY[c].name.toLowerCase()} to ${npc.name}`, `Could you bring me ${n} ${PANTRY[c].name.toLowerCase()}? Fresh from your garden, if you can!`)); }
    if (st.fishing?.rod) {
      const seen = Object.keys(st.fishLog || {}).filter(f => (PANTRY[f]?.rare || 0) < 2), f = pick(seen.length ? seen : ['crucian', 'koi', 'loach']);
      out.push(deliver(f, 1, `Bring a ${PANTRY[f].name.toLowerCase()} to ${npc.name}`, `I'm craving a ${PANTRY[f].name.toLowerCase()}… could you catch one for me?`));
    }
    const cooked = Object.keys(st.cookbook?.cooked || {}).filter(r => RECIPES[r] && (PANTRY[r].food?.tier || 1) <= 2);
    if (cooked.length) { const r = pick(cooked); out.push(deliver(r, 1, `Cook ${PANTRY[r].name} for ${npc.name}`, `Would you cook me some ${PANTRY[r].name.toLowerCase()}? I heard yours is the best!`)); }
    return out;
  }
  /** Decorate requests (docs/HOUSING.md §4), for a villager with a home of their own: something in their style plus a
   *  rug, one more star, or one of the pieces they love. The reward: hearts, coins and a piece for your storage. */
  decorateRequests(npc) {
    const G = this.G, id = npc.id, rec = G.sim?.list.find(r => r.data.owner === id), taste = VILLAGERS.find(v => v.id === id)?.home;
    if (!rec || !taste || !G.housing) return [];
    const I = G.housing.interiorOf(rec.data), r = homeRating(I, taste), tag = taste.style.find(t => t !== 'cozy') || taste.style[0];
    const have = new Set(I.items.map(it => it.id)), gift = taste.likesFurniture.find(x => !have.has(x) && !(G.state.furniture?.[x] > 0)) || pick(taste.likesFurniture);
    const out = [];
    const craft = CRAFT_REWARD[id] && !G.state.workbench?.known?.[CRAFT_REWARD[id]] ? CRAFT_REWARD[id] : null; // (Mochi and Kero teach you a recipe the first time)
    const dec = (need, text, ask) => ({ steps: [{ type: 'decorate', npc: id, need, text }], text: ask, reward: { furniture: gift, ...(craft ? { craft } : {}) } });
    out.push(dec({ tag, n: 2, rug: true }, `Decorate ${npc.name}'s home: 2 ${tag} things and a rug`, `Could you help me make my home a bit more ${tag}? Two ${tag} things and a rug would be perfect! You can come in and move things around~`));
    if (r.stars < 5) out.push(dec({ stars: r.stars + 1 }, `Make ${npc.name}'s home ${starText(r.stars + 1)}`, `My home feels a little plain… Could you make it a ${r.stars + 1}-star home? I'll leave the door open for you!`));
    const want = taste.likesFurniture.find(x => !have.has(x));
    if (want) out.push(dec({ ids: [want] }, `Put a ${FURNITURE[want].name.toLowerCase()} in ${npc.name}'s home`, `I've always dreamed of a ${FURNITURE[want].name.toLowerCase()} in my home… Tanu might sell one, or maybe you could make one?`));
    return out;
  }
  /** On the way out of a villager's home (home/housing.js react): does their decorate request's need hold now? Completes
   *  it if so (unless dry: just asking). → { done, missing } or null when there's no such request */
  checkDecorate(id, interior, taste = null, dry = false) {
    for (const q of this.Q.active) {
      const d = this.def(q.id), s = d?.steps[q.step];
      if (s?.type !== 'decorate' || s.npc !== id) continue;
      const m = meetsNeed(interior, s.need || {}, taste);
      if (m.ok) { if (!dry) { q.decorated = true; this.progress('decorate'); } return { done: true, missing: [] }; }
      return { done: false, missing: m.missing };
    }
    return null;
  }
  canRequest(id) { const f = this.friend(id); return (f.reqDay || 0) !== (this.G.day?.day || 1); }
  /** A gathering ask in place of a kill ask (docs/COZY.md §3.1): driftwood, river stones or petals, things Blossom
   *  Hollow's own gather nodes and Shadow's digs give (cozy/scavenge.js) */
  scavengeRequest(npc) {
    const id = npc.id, [mat, n, line] = pick([
      ['wood', randInt(5, 8), 'Could you gather some driftwood from the beach for me? I\'m mending my fence, and the tide always brings the best bits.'],
      ['stone', randInt(4, 7), 'I\'d love some smooth river stones for my garden path. The ones by the bridge are the prettiest!'],
      ['petal', randInt(3, 5), 'Could you sweep up some sakura petals for me? I\'m making petal tea. Don\'t tell Shadow, he eats them.'],
      ['bone', randInt(2, 3), 'Shadow keeps digging up the oddest little bones… Could you bring me a few? It\'s for a wind chime. Don\'t ask.'],
    ]);
    return { steps: [{ type: 'deliver', mat, n, npc: id, text: `Bring ${n} ${mat} to ${npc.name}` }], text: line, scavenge: true };
  }
  async requestFlow(npc, say) {
    const G = this.G, id = npc.id, f = this.friend(id);
    const lvl = G.state.player.lvl;
    const mat = pick(['wood', 'stone', 'petal', 'mochi', 'silk', 'lantern', 'crystal', 'bone']);
    const templates = [
      { steps: [{ type: 'deliver', mat, n: randInt(2, 5), npc: id, text: `Bring ${mat} to ${npc.name}` }], text: `Could you bring me some ${mat}? I'm making something special!` },
      { steps: [{ type: 'kill', n: randInt(10, 20), text: 'Defeat yokai in the Burrow' }], text: 'The yokai keep knocking over my flower pots… could you shoo some away?' },
      { steps: [{ type: 'buildAny', btypes: ['bench', 'flowerBed', 'sakuraPlanter'], n: 1, text: 'Build a bench, flower bed or planter' }], text: 'The village could use somewhere cute to sit. Would you build something?' },
      ...this.homesteadRequests(npc), // (appended: the first three keep their places)
      ...this.decorateRequests(npc), // (appended: docs/HOUSING.md §4)
    ];
    let t = pick(templates);
    // the cozy path (docs/COZY.md §3.1): half the "defeat yokai" asks become a scavenging ask instead, so a player who
    // never fights gets as many requests (and "Maybe later" never costs a heart)
    if (t === templates[1] && Math.random() < 0.5) t = this.scavengeRequest(npc);
    const c = await say([t.text], [{ text: 'Leave it to me!' }, { text: 'Maybe later' }]);
    if (c !== 0) return;
    f.reqDay = G.day?.day || 1;
    const qid = `req_${id}`;
    this.Q.requests[qid] = { def: { title: `${npc.name}'s Request`, giver: id, desc: t.text, steps: t.steps, reward: { coins: 40 + lvl * 12, xp: 30 + lvl * 20, hearts: 12, ...(t.reward || {}) }, request: true, next: null } };
    this.start(qid);
  }
}
