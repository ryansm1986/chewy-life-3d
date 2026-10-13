// Zone villagers' quests (docs/ZONES.md §3; ROADMAP Z-D4): 4–6 per village, with their objectives in the zone's dungeon,
// written with the Z-A5 quest steps (world/questSteps.js). Pure (no three.js): node-tested in tools/test-rpg.mjs.
//
//   ZONE_QUESTS[id] = { title, giver, zone, hook, goal, desc, steps, reward, prereq?: [questIds], offer: line, thanks: line }
//   - hook: the quest card's line in the giver's voice (short: the offer is the long ask); goal: [action, place] (the
//     card's goal line). docs/QUESTS.md §0; test-rpg checks every quest has both.
//   - steps: kill / boss with dungeon filters, find { item, n, dungeon, floor, from }, rescue { npc, dungeon, floor }
//     (lead: true: Shadow has the captive's scent and leads the way: the gate, the stairs, the cage; ROADMAP R-17),
//     dungeonFloor { dungeon, n }, and a closing talk { npc } back in the village ("tell them"), so the giver shows a
//     turn-in '!' and the reward comes from them.
//   - offered once the village is saved (the dungeon gate opens then, docs/ZONES.md §2), when every prereq is done.
//   - story.js reads them through Story.def(id) (they live in state.quests like any quest).
//
// Phase C's provider: dungeonObjectives(state, { dungeon, floor, zone, tier }) → what the active quests need placed on
// that floor: [{ kind: 'cage', npc, label, quest }, { kind: 'drop', item, n, label, from: 'champion'|'unique'|'chest', quest }].
// C places them and emits 'villager:rescued' { npc, zone, dungeon, floor } and 'quest:find' { item, n, zone, dungeon, floor }.
import { ZONE_NPCS } from '../regions/village/data.js';

/** quest items (the 'find' steps): names and the glyph the toasts / pickups show */
export const QUEST_ITEMS = {
  tk_ledger: { name: "Chiku's Ledger", icon: 'book', zone: 'bamboo', desc: 'A bamboo-bound shop ledger, chewed at one corner.' },
  tk_windScroll: { name: 'The Wind Scroll', icon: 'scroll', zone: 'bamboo', desc: "The Kaze Dojo's oldest scroll: the secret of the silent step." },
  tk_heartwood: { name: 'Bamboo Heartwood', icon: 'wood', zone: 'bamboo', desc: 'Golden core-wood from a culm older than the village.' },
  ak_charm: { name: 'Lucky Charm', icon: 'clover', zone: 'maple', desc: 'One of Benji\'s lucky charms: a little red bag on a cord. Slightly chewed.' },
  ak_chestnut: { name: 'Golden Chestnut', icon: 'coin', zone: 'maple', desc: 'A chestnut as golden as an autumn sunset, for Okami Yae\'s chestnut rice.' },
  sk_pearlScale: { name: 'Pearl Scale', icon: 'gem', zone: 'tidepool', desc: 'A scale that shines like moonlight on the water.' },
  sk_seaGlass: { name: 'Sea Glass', icon: 'gem', zone: 'tidepool', desc: 'A piece of sea glass worn smooth by the tide. Blue, white, amber… or green.' },
  yk_snowOre: { name: 'Snow Ore', icon: 'gem', zone: 'onsen', desc: 'Blue-white ore from the ice caverns. Cold as a grudge; rings like a bell.' },
  yk_mittens: { name: 'Fluffy Mittens', icon: 'gift', zone: 'onsen', desc: 'A pair of Mikan\'s fluffiest mittens. Slightly damp.' },
};
export const questItemName = id => QUEST_ITEMS[id]?.name || id;

const D = 'bambooDepths', DM = 'mapleRoots', DT = 'tideCaves', DO = 'onsenCaverns'; // (dungeon/defs.js ids)
export const ZONE_QUESTS = {
  // ---------------------------------------------------------------- Takemori Village (bamboo)
  tk_roots: {
    title: 'Roots of the Grove', giver: 'tk_sasa', zone: 'bamboo',
    hook: "The yokai crawled up from the Bamboo Depths, dear. Go and see how deep the trouble goes.", goal: ["Reach floor 2", "the Bamboo Depths"],
    lines: { door: "The old caves under the grove… They smell of bamboo shoots and bad manners.", arrive: "Grandma Sasa wants to know how deep it goes. To the stairs!", home: "Two floors of yokai! Let's tell Grandma Sasa. She'll pat my head. Probably." },
    desc: 'Grandma Sasa says the yokai crawled up from the Bamboo Depths, the old caves under the grove. Go down and see how deep the trouble goes.',
    steps: [{ type: 'dungeonFloor', dungeon: D, n: 2, text: 'Reach floor 2 of the Bamboo Depths' }, { type: 'talk', npc: 'tk_sasa', text: 'Tell Grandma Sasa what you saw' }],
    reward: { coins: 260, xp: 320, hearts: 10, furniture: 'bambooLantern' },
    offer: "The yokai didn't come from nowhere, dear. They crawled up from the Bamboo Depths — the old caves under the roots. Would you go and see how deep it goes?",
    thanks: 'Two floors of them? Goodness. The grove remembers you now — take this lantern, it was my grandmother\'s.',
  },
  tk_ledger: {
    title: 'The Missing Ledger', giver: 'tk_chiku', zone: 'bamboo',
    hook: "A big blue yokai ran off with my ledger! Every IOU in Takemori is in that book!", goal: ["Find Chiku's Ledger", "the Bamboo Depths, floor 1"],
    lines: { door: "Chiku's ledger is in there somewhere. I can smell ink and nervous coins!", arrive: "Sniff… paper and ink! One of the big yokai has Chiku's ledger.", near: "There! That big blue one is clutching the ledger!", home: "We got the ledger! Only a little chewed, and it wasn't me. Let's take it to Chiku!" },
    desc: 'A champion yokai ran off into the Bamboo Depths with Chiku\'s shop ledger. Every IOU in the village is in it!',
    steps: [{ type: 'find', item: 'tk_ledger', n: 1, dungeon: D, floor: 1, from: 'champion', text: "Find Chiku's Ledger (Bamboo Depths, floor 1)" }, { type: 'talk', npc: 'tk_chiku', text: 'Bring the ledger back to Chiku' }],
    reward: { coins: 220, xp: 240, hearts: 10, pantry: { bamboo: 4 } },
    offer: 'A big blue yokai ran off with my ledger! It went down into the Bamboo Depths — floor one, I think. Without it I don\'t know who owes me bamboo shoots!',
    thanks: 'My ledger! And only a little chewed. Here — shoots from the back room, the good ones.',
  },
  tk_windScroll: {
    title: 'The Wind Scroll', giver: 'tk_kazemaru', zone: 'bamboo',
    hook: "The sickle-weasels took the Wind Scroll. Teach twelve of them some manners, then bring it home.", goal: ["Defeat 12 Kamaitachi, win back the Wind Scroll", "the Bamboo Depths"],
    lines: { door: "Swish, swish… sickle-weasels. Let's teach them manners, like Master Kazemaru said!", arrive: ["Kamaitachi! Twelve of them, and every one so rude.", "The Wind Scroll is on this floor. I can smell old paper and silence."], near: "That one has the scroll! Get it back!", home: "The Wind Scroll is safe! Master Kazemaru might even smile. A tiny bit." },
    desc: 'Kamaitachi stole the Kaze Dojo\'s oldest scroll. Master Kazemaru wants it back — and wants the thieves to learn some manners.',
    steps: [{ type: 'kill', monster: 'kamaitachi', dungeon: D, n: 12, text: 'Defeat 12 Kamaitachi in the Bamboo Depths' }, { type: 'find', item: 'tk_windScroll', n: 1, dungeon: D, floor: 2, from: 'unique', text: 'Recover the Wind Scroll (floor 2, a unique yokai has it)' }, { type: 'talk', npc: 'tk_kazemaru', text: 'Return the scroll to Master Kazemaru' }],
    reward: { coins: 340, xp: 420, hearts: 12, furniture: 'bambooBench' },
    prereq: ['tk_roots'],
    offer: 'The sickle-weasels took the Wind Scroll. A scroll about silence, stolen by the noisiest yokai in the grove. Teach twelve of them some manners — and bring it home.',
    thanks: 'You move quietly for one so fluffy. Poe chose her friends well. Keep the bench; a sensei needs only the floor.',
  },
  tk_kome: {
    title: 'The Missing Cook', giver: 'tk_fuku', zone: 'bamboo',
    hook: "They took Kome, my cook! The rice won't cook itself. Oh, look: your Shadow already has her scent!", goal: ["Rescue Kome", "the Bamboo Depths, floor 2"],
    lines: { door: "I've got Kome's scent: rice and miso! She's in there. Follow me!", arrive: "She's on this floor! Rice, miso and… sniffles. Let's hurry!", near: "Kome! She's in that cage! Let's get her out!", home: "Kome is safe! Let's tell Okami Fuku. Maybe there'll be rice balls. For me too?" },
    desc: 'Kome, the inn\'s cook, was carried off into the Bamboo Depths. Okami Fuku is worried sick (and so is everyone\'s stomach). Shadow has her scent: follow him!',
    steps: [{ type: 'rescue', npc: 'tk_kome', dungeon: D, floor: 2, text: 'Rescue Kome from the Bamboo Depths (floor 2)', lead: true }, { type: 'talk', npc: 'tk_fuku', text: 'Let Okami Fuku know Kome is safe' }],
    reward: { coins: 280, xp: 300, hearts: 12, pantry: { onigiri: 3, misoSoup: 2 } },
    offer: 'They took Kome — my cook! Dragged her down into the Depths, all the way to the second floor I\'d wager. Please, bring her home. The rice won\'t cook itself.',
    thanks: 'Kome! You\'re home! …Ahem. Thank you, truly. Have some of her rice balls — she made them before she even took her apron off.',
  },
  tk_heartwood: {
    title: 'Heartwood', giver: 'tk_takumi', zone: 'bamboo',
    hook: "Ordinary bamboo won't do for my frames. I need golden heartwood, and the yokai have been hoarding it.", goal: ["Find 3 Bamboo Heartwood in the chests", "the Bamboo Depths, floor 2"],
    lines: { door: "Golden heartwood… Takumi says the yokai hid it in their chests.", arrive: "The chests are on this floor. Let's open every single one!", home: "Three pieces of heartwood! It smells of honey and sunshine. Let's bring it to Takumi!" },
    desc: 'Takumi needs golden heartwood to rebuild what the yokai smashed. It only grows deep under the grove.',
    steps: [{ type: 'find', item: 'tk_heartwood', n: 3, dungeon: D, floor: 2, from: 'chest', text: 'Find 3 Bamboo Heartwood (floor 2 chests)' }, { type: 'talk', npc: 'tk_takumi', text: 'Bring the heartwood to Takumi' }],
    reward: { coins: 260, xp: 300, hearts: 10, furniture: 'bambooPlanter', mats: { wood: 12 } },
    offer: 'They smashed half my workshop. Ordinary bamboo won\'t do for the frames — I need heartwood. Old culms, deep under the grove. The Depths\' chests on the second floor, if the yokai have been hoarding.',
    thanks: 'Ohh, look at that grain. I\'ll make you something proper with this. Here, this planter came out too nice to sell.',
  },
  tk_tengu: {
    title: 'Wings Over the Grove', giver: 'tk_sasa', zone: 'bamboo',
    hook: "Master Tengu waits at the bottom of the Depths. Proud, old and very rude. End his little war.", goal: ["Defeat Master Tengu", "the bottom of the Bamboo Depths"],
    lines: { door: "Master Tengu is at the very bottom. Proud, old and very rude, Grandma Sasa said.", arrive: "Feathers everywhere! The Tengu's nest is down here somewhere.", boss: "Feathers on the wind… Master Tengu is just ahead! They say his nose is even bigger than mine!", home: "The grove is singing again! Let's go and tell Grandma Sasa." },
    desc: 'Master Tengu leads the yokai of the grove from the bottom of the Bamboo Depths. Grandma Sasa asks you to end it.',
    steps: [{ type: 'boss', dungeon: D, text: 'Defeat the boss of the Bamboo Depths' }, { type: 'talk', npc: 'tk_sasa', text: 'Return to Grandma Sasa' }],
    reward: { coins: 800, xp: 1400, hearts: 16, unique: true },
    prereq: ['tk_roots'],
    offer: 'The one behind it all waits at the bottom of the Depths. Master Tengu — proud, old, and very rude. End his little war, and the grove will sing again.',
    thanks: 'Listen… do you hear it? The bamboo is singing. Takemori owes you everything, little one.',
  },
  // ---------------------------------------------------------------- Akane Hamlet (maple): the Maple Roots
  ak_roots: {
    title: 'Under the Red Hills', giver: 'ak_kaede', zone: 'maple',
    hook: "The straw soldiers marched up out of the Maple Roots. Go down, child, and see how deep they reach.", goal: ["Reach floor 2", "the Maple Roots"],
    lines: { door: "Under the fallen maple… It smells of old leaves and straw soldiers.", arrive: "Elder Kaede asked how deep they go. To the stairs!", home: "Two floors of straw soldiers! Elder Kaede has to hear about this." },
    desc: 'Elder Kaede says the straw soldiers marched up out of the Maple Roots, the old halls under the fallen maple. Go down and see how deep they reach.',
    steps: [{ type: 'dungeonFloor', dungeon: DM, n: 2, text: 'Reach floor 2 of the Maple Roots' }, { type: 'talk', npc: 'ak_kaede', text: 'Tell Elder Kaede what you saw' }],
    reward: { coins: 380, xp: 1000, hearts: 10, furniture: 'mapleWreath' },
    offer: 'The scarecrows came up from the Maple Roots — the halls under the great maple that fell long ago. Would you go down and see how deep the trouble runs?',
    thanks: 'Two floors of them… The roots remember everything, child. Take this wreath — the leaves on it never fall.',
  },
  ak_tobi: {
    title: 'The Lost Apprentice', giver: 'ak_ochiyo', zone: 'maple',
    hook: "My apprentice Tobi was carried off. Please bring him home, before he breaks their cups too.", goal: ["Rescue Tobi", "the Maple Roots, floor 2"],
    lines: { door: "I've got Tobi's scent: tea leaves and grumbling. This way!", arrive: "Tobi's on this floor! I can hear him complaining already.", near: "There he is, in the cage! Still complaining. Let's get him out!", home: "Tobi's safe! Ochiyo will be calm about it. Very calm. Let's tell her!" },
    desc: 'Tobi, Ochiyo\'s apprentice, was carried off into the Maple Roots. She is calm about it. Very calm. Too calm. Shadow has his scent: follow him!',
    steps: [{ type: 'rescue', npc: 'ak_tobi', dungeon: DM, floor: 2, text: 'Rescue Tobi from the Maple Roots (floor 2)', lead: true }, { type: 'talk', npc: 'ak_ochiyo', text: 'Bring the news to Ochiyo' }],
    reward: { coins: 420, xp: 1100, hearts: 12, furniture: 'teaSet' },
    offer: 'My apprentice, Tobi… the yokai took him down into the Roots. The second hall, I think — I heard him complaining all the way. Please. Bring him home before he breaks their cups too.',
    thanks: 'Tobi. You are home. …Go and wash, you smell of mushrooms. Thank you, truly — take this tea set. It has never once been dropped. Not by me.',
  },
  ak_charms: {
    title: 'Benji\'s Lucky Charms', giver: 'ak_benji', zone: 'maple',
    hook: "Those big ugly yokai took my lucky charms! The good ones! Get them back, there's something nice in it.", goal: ["Win back 3 Lucky Charms from the champions", "the Maple Roots, floor 1"],
    lines: { door: "Benji's lucky charms are in there. Lucky for us!", arrive: "The big yokai have the charms. I can smell them, they smell lucky!", near: "That big one's wearing a charm! Get it!", home: "Three lucky charms! I feel luckier already. Let's take them to Benji!" },
    desc: 'The yokai looted Benji\'s stock of lucky charms. Big ones carried them off into the Maple Roots. Benji wants them back "for the customers".',
    steps: [{ type: 'find', item: 'ak_charm', n: 3, dungeon: DM, floor: 1, from: 'champion', text: 'Recover 3 Lucky Charms (Maple Roots, floor 1 champions)' }, { type: 'talk', npc: 'ak_benji', text: 'Return the charms to Benji' }],
    reward: { coins: 360, xp: 900, hearts: 10, furniture: 'acornStool' },
    offer: 'Those big ugly yokai took my lucky charms! The good ones! They ran into the Maple Roots — the first hall. Get them back and you can have… something. Something nice!',
    thanks: 'My charms! Lucky, lucky, lucky — oh, this one\'s chewed. Still lucky. Here, a stool. Genuine acorn. Mostly.',
  },
  ak_straw: {
    title: 'Straw Soldiers', giver: 'ak_inaho', zone: 'maple',
    hook: "The scarecrows down there aren't like mine. They're mean. Taro and Hanako are scared.", goal: ["Stop 15 Kakashi", "the Maple Roots"],
    lines: { door: "Mean scarecrows… Let's make the terraces safe for Taro and Hanako!", arrive: "Kakashi everywhere! Fifteen of them, and all so grumpy.", home: "The terraces are safe! Inaho's going to beam. Let's go and tell her." },
    desc: 'Inaho is upset: somebody is turning scarecrows into yokai down in the Maple Roots. The bad scarecrows need stopping before they reach the terraces.',
    steps: [{ type: 'kill', monster: 'kakashi', dungeon: DM, n: 15, text: 'Defeat 15 Kakashi in the Maple Roots' }, { type: 'talk', npc: 'ak_inaho', text: 'Tell Inaho the terraces are safe' }],
    reward: { coins: 340, xp: 880, hearts: 10, pantry: { rice: 4, onigiri: 2 } },
    prereq: ['ak_roots'],
    offer: 'The scarecrows down in the Roots aren\'t like mine. They\'re mean. Could you stop fifteen of them? Then Taro and Hanako can stop being scared.',
    thanks: 'Taro says thank you. Hanako says thank you too, but quieter. Here — rice from the top terrace, the sweetest.',
  },
  ak_chestnuts: {
    title: 'Golden Chestnuts', giver: 'ak_yae', zone: 'maple',
    hook: "No golden chestnuts, no chestnut rice, no happy guests! The yokai stuffed them all in their chests.", goal: ["Find 5 Golden Chestnuts in the chests", "the Maple Roots, floor 2"],
    lines: { door: "Golden chestnuts! Okami Yae's chestnut rice! Let's go, let's go!", arrive: "The chests are on this floor. I can smell roasted chestnuts!", home: "Five golden chestnuts! Chestnut rice tonight! Let's take them to Okami Yae." },
    desc: 'Okami Yae\'s famous chestnut rice needs golden chestnuts, and the only ones left were hoarded in the Maple Roots\' chests.',
    steps: [{ type: 'find', item: 'ak_chestnut', n: 5, dungeon: DM, floor: 2, from: 'chest', text: 'Find 5 Golden Chestnuts (Maple Roots, floor 2 chests)' }, { type: 'talk', npc: 'ak_yae', text: 'Bring the chestnuts to Okami Yae' }],
    reward: { coins: 400, xp: 1000, hearts: 10, furniture: 'pumpkinLamp' },
    offer: 'No golden chestnuts, no chestnut rice, no happy guests! The yokai stuffed them all into their treasure chests, down on the second floor of the Roots. Would you, dear?',
    thanks: 'Golden as the sunset! The whole inn will smell of chestnut rice tonight. Take this lamp — it glows like a harvest moon.',
  },
  ak_danzaburo: {
    title: 'The Tanuki Lord', giver: 'ak_kaede', zone: 'maple',
    hook: "Danzaburō was a good neighbour once. Go and remind him of his manners. Firmly.", goal: ["Defeat Danzaburō", "the bottom of the Maple Roots"],
    lines: { door: "Danzaburō sits at the very bottom. He used to be a good neighbour…", arrive: "Leaves and sake… The old tanuki lord is down here somewhere.", boss: "Sake and leaves, just ahead… Danzaburō is close! Let's remind him of his manners.", home: "The hills are quiet again! Let's tell Elder Kaede." },
    desc: 'Danzaburō, the old tanuki lord of the hills, rules the bottom of the Maple Roots and sends the straw soldiers up. Elder Kaede asks you to end it.',
    steps: [{ type: 'boss', dungeon: DM, text: 'Defeat the boss of the Maple Roots' }, { type: 'talk', npc: 'ak_kaede', text: 'Return to Elder Kaede' }],
    reward: { coins: 1100, xp: 4200, hearts: 16, unique: true },
    prereq: ['ak_roots'],
    offer: 'At the bottom of the Roots sits Danzaburō. He was a good neighbour once. Remind him of his manners, Chewy — firmly.',
    thanks: 'The hills are quiet, and the leaves fall only for the wind. Akane will tell this story for sixty autumns more.',
  },
  // ---------------------------------------------------------------- Shiokaze Port (tidepool): the Tide Caves
  sk_tide: {
    title: 'Where the Tide Breathes', giver: 'sk_kaizo', zone: 'tidepool',
    hook: "The sea caves breathe out crabs this year, matey. Go down to the second cave and tell me what's there.", goal: ["Reach floor 2", "the Tide Caves"],
    lines: { door: "The caves breathe in… and out. And they smell of crab!", arrive: "Captain Kaizo wants to know what's in the second cave. Onward, matey!", home: "Two caves deep! Let's report to Captain Kaizo. Can I be first mate?" },
    desc: 'Old Captain Kaizo says the crabs and kappa came up out of the Tide Caves under the cliffs. He wants to know how far down they go.',
    steps: [{ type: 'dungeonFloor', dungeon: DT, n: 2, text: 'Reach floor 2 of the Tide Caves' }, { type: 'talk', npc: 'sk_kaizo', text: 'Report to Captain Kaizo' }],
    reward: { coins: 560, xp: 2200, hearts: 10, furniture: 'glassFloats' },
    offer: 'The sea caves breathe with the tide, matey — in and out. And this year they breathed out crabs. Go down to the second cave and tell me what\'s down there.',
    thanks: 'Two caves deep, eh? You\'ve got sea legs after all. Take these floats — they came off my old ship. They still remember the waves.',
  },
  sk_kaito: {
    title: 'Man Overboard', giver: 'sk_funaki', zone: 'tidepool',
    hook: "Kaito. The kappa took him. Second cave. Bring him back. …Please.", goal: ["Rescue Kaito", "the Tide Caves, floor 2"],
    lines: { door: "I've got Kaito's scent: salt and sawdust. Follow me!", arrive: "Kaito's on this floor! I can hear him shouting about Umibōzu.", near: "There's Kaito! Let's get that cage open!", home: "Kaito's safe! Let's tell Funaki. He'll say nothing. Very happily." },
    desc: 'Kaito, Funaki\'s deckhand, was dragged into the Tide Caves by the kappa. Funaki says nothing; his hammer says a lot. Shadow has his scent: follow him!',
    steps: [{ type: 'rescue', npc: 'sk_kaito', dungeon: DT, floor: 2, text: 'Rescue Kaito from the Tide Caves (floor 2)', lead: true }, { type: 'talk', npc: 'sk_funaki', text: 'Tell Funaki that Kaito is safe' }],
    reward: { coins: 620, xp: 2400, hearts: 12, mats: { wood: 16 } },
    offer: 'Kaito. The kappa took him. Down to the second cave — I heard him shouting about Umibōzu. Bring him back. Please.',
    thanks: '…Good. Good. Kaito, hold this plank. — Thank you. Take the timber; I won\'t need it, I\'m building a boat that doesn\'t sink with deckhands in it.',
  },
  sk_scales: {
    title: 'The Shining Catch', giver: 'sk_saba', zone: 'tidepool',
    hook: "Pearl-scales! The big yokai in the first cave are covered in them. Three would make a dazzling display!", goal: ["Collect 3 Pearl Scales from the champions", "the Tide Caves, floor 1"],
    lines: { door: "Pearl-scales… shiny, shiny! The big yokai in the first cave have them.", arrive: "Something's shimmering on this floor. Pearl-scales!", near: "That big one is all sparkly! It has a pearl-scale!", home: "Three pearl-scales! Saba's display is going to dazzle. Let's go!" },
    desc: 'The champion yokai of the Tide Caves wear pearl-scales that shine like moonlight on the water. Saba would pay handsomely for three.',
    steps: [{ type: 'find', item: 'sk_pearlScale', n: 3, dungeon: DT, floor: 1, from: 'champion', text: 'Collect 3 Pearl Scales (Tide Caves, floor 1 champions)' }, { type: 'talk', npc: 'sk_saba', text: 'Bring the scales to Saba' }],
    reward: { coins: 600, xp: 2100, hearts: 10, pantry: { seaBream: 2, sushiPlatter: 1 } },
    offer: 'Pearl-scales! The big yokai in the first cave are covered in them. Three would make the finest display the market has ever seen. Interested?',
    thanks: 'Look at them shine! Clear as a happy fish\'s eye. Here — sea bream for luck, and a platter, because heroes should eat well.',
  },
  sk_glass: {
    title: 'Sea Glass', giver: 'sk_nami', zone: 'tidepool',
    hook: "The yokai hoard sea glass in their chests! Any colour but green. Unless it's a really nice green.", goal: ["Find 5 pieces of Sea Glass in the chests", "the Tide Caves, floor 2"],
    lines: { door: "Sea glass in the chests! Any colour but green… unless it's a really nice green.", arrive: "The chests are on this floor. I hope there's blue!", home: "Five pieces of sea glass, even a nice green one! Let's take them to Nami!" },
    desc: 'Nami heard the yokai hoard sea glass in the chests of the Tide Caves — including blue, white and (she hopes) not green.',
    steps: [{ type: 'find', item: 'sk_seaGlass', n: 5, dungeon: DT, floor: 2, from: 'chest', text: 'Find 5 pieces of Sea Glass (Tide Caves, floor 2 chests)' }, { type: 'talk', npc: 'sk_nami', text: 'Bring the sea glass to Nami' }],
    reward: { coins: 540, xp: 2000, hearts: 10, furniture: 'shellLamp' },
    offer: 'The yokai keep sea glass in their treasure chests, down in the second cave! I need more for my collection. Any colour but green. Unless it\'s a really nice green.',
    thanks: 'Blue! And amber! And… green. It\'s a really nice green. Here, a shell lamp — it glows like the bay at night.',
  },
  sk_crabs: {
    title: 'Crabs Under the Stilts', giver: 'sk_shinju', zone: 'tidepool',
    hook: "Every morning, grumpy crabs with faces under my stilts! Teach fifteen of them to stay home.", goal: ["Defeat 15 Heike-gani", "the Tide Caves"],
    lines: { door: "Grumpy crabs with faces… they come from in there. Let's go!", arrive: "Heike-gani! Fifteen grumpy faces. Pinch them before they pinch us!", home: "No more crabs under the stilts! Let's tell Okami Shinju." },
    desc: 'Okami Shinju\'s guests keep finding Heike-gani under the inn. They come up from the Tide Caves. Thin them out.',
    steps: [{ type: 'kill', monster: 'heikegani', dungeon: DT, n: 15, text: 'Defeat 15 Heike-gani in the Tide Caves' }, { type: 'talk', npc: 'sk_shinju', text: 'Let Okami Shinju know' }],
    reward: { coins: 520, xp: 2000, hearts: 10, furniture: 'waveRug' },
    prereq: ['sk_tide'],
    offer: 'Every morning, crabs under the stilts! Big grumpy ones with faces! They come up from the caves. Would you teach fifteen of them to stay home?',
    thanks: 'Not a single crab this morning. The guests slept like pearls. Take this rug — it\'s the colour of the bay at noon.',
  },
  sk_umibozu: {
    title: 'The Sea Monk', giver: 'sk_kaizo', zone: 'tidepool',
    hook: "Umibōzu's awake down there, and the tide won't settle. Go and tuck him in, matey.", goal: ["Defeat Umibōzu", "the bottom of the Tide Caves"],
    lines: { door: "Umibōzu is down there, big as a storm cloud. My tail's a little shaky.", arrive: "The tide's rumbling… The sea monk is on this floor!", boss: "The water's rumbling… Umibōzu is just ahead, and he's HUGE! Let's tuck him in!", home: "The tide's breathing slow again! Captain Kaizo will want to hear everything." },
    desc: 'Umibōzu, the sea monk big as a storm cloud, woke at the bottom of the Tide Caves. Captain Kaizo asks you to put him back to sleep.',
    steps: [{ type: 'boss', dungeon: DT, text: 'Defeat the boss of the Tide Caves' }, { type: 'talk', npc: 'sk_kaizo', text: 'Return to Captain Kaizo' }],
    reward: { coins: 1600, xp: 8800, hearts: 16, unique: true },
    prereq: ['sk_tide'],
    offer: 'He\'s down there, matey. Umibōzu. The tide won\'t settle while he\'s awake. Go and tuck him in — with your paws.',
    thanks: 'Listen to that — the tide\'s breathing slow again. You\'ve a place on my ship any day, sailor.',
  },
  // ---------------------------------------------------------------- Yukimi Spa Village (onsen): the Onsen Caverns
  yk_caverns: {
    title: 'The Cold Below', giver: 'yk_shirayuki', zone: 'onsen',
    hook: "The springs are cooling, little one. The cold creeps up from the caverns. Go two halls deep and see.", goal: ["Reach floor 2", "the Onsen Caverns"],
    lines: { door: "Brrr! The cold comes from in there. Let's be brave and fluffy.", arrive: "Granny Shirayuki asked how deep the ice goes. Two halls down!", home: "Ice that hums! Let's tell Granny Shirayuki. She'll know what it means." },
    desc: 'Granny Shirayuki says the cold creeping into the springs comes from the Onsen Caverns. Go down and see how deep the ice has reached.',
    steps: [{ type: 'dungeonFloor', dungeon: DO, n: 2, text: 'Reach floor 2 of the Onsen Caverns' }, { type: 'talk', npc: 'yk_shirayuki', text: 'Tell Granny Shirayuki what you found' }],
    reward: { coins: 760, xp: 4200, hearts: 10, furniture: 'cypressBucket' },
    offer: 'The springs are cooling, little one. The cold comes up from the caverns under the mountain. Would you go down — two halls deep — and see?',
    thanks: 'Ice that hums… yes. Just as my grandmother said. Take this bucket; it\'s cypress, and it smells of every bath I\'ve ever loved.',
  },
  yk_hokuto: {
    title: 'The Hiccuping Apprentice', giver: 'yk_tetsu', zone: 'onsen',
    hook: "My apprentice. The snow spirits took him to the second cavern. Listen for hiccups.", goal: ["Rescue Hokuto", "the Onsen Caverns, floor 2"],
    lines: { door: "I've got Hokuto's scent: soot and snowflakes. Follow me!", arrive: "Listen… hic! Hic! Hokuto's on this floor!", near: "There he is, hiccuping in a cage! Let's get him out!", home: "Hokuto's safe! No more hiccups… almost. Let's tell Tetsu." },
    desc: 'Hokuto, Tetsu\'s apprentice, was carried off into the Onsen Caverns. You can probably find him by the hiccups, and Shadow already has his scent: follow him!',
    steps: [{ type: 'rescue', npc: 'yk_hokuto', dungeon: DO, floor: 2, text: 'Rescue Hokuto from the Onsen Caverns (floor 2)', lead: true }, { type: 'talk', npc: 'yk_tetsu', text: 'Tell Tetsu that Hokuto is safe' }],
    reward: { coins: 820, xp: 4600, hearts: 12, mats: { crystal: 2, stone: 14 } },
    offer: 'My apprentice. The snow spirits took him to the second cavern. Listen for hiccups. Bring him back to the forge.',
    thanks: '…Hokuto. Go and warm your paws. — Thank you. Here: crystal and stone, the best I have. Bring them back and I\'ll fold you something.',
  },
  yk_ore: {
    title: 'Snow Ore', giver: 'yk_tetsu', zone: 'onsen',
    hook: "Snow ore. Blue-white, cold as a grudge. Four pieces from their chests, and the forge sings again.", goal: ["Find 4 Snow Ore in the chests", "the Onsen Caverns, floor 1"],
    lines: { door: "Snow ore, cold as a grudge. Tetsu needs four pieces!", arrive: "The chests on this floor smell of frost and metal.", home: "Four pieces of snow ore! Hear it ring? Let's take it to Tetsu." },
    desc: 'Tetsu\'s forge needs fresh snow ore, and the yokai have been hoarding it in the chests of the Onsen Caverns.',
    steps: [{ type: 'find', item: 'yk_snowOre', n: 4, dungeon: DO, floor: 1, from: 'chest', text: 'Find 4 Snow Ore (Onsen Caverns, floor 1 chests)' }, { type: 'talk', npc: 'yk_tetsu', text: 'Bring the snow ore to Tetsu' }],
    reward: { coins: 720, xp: 3800, hearts: 10, mats: { crystal: 1, stone: 10 } },
    offer: 'Snow ore. Blue-white, cold as a grudge. The yokai locked it in their chests in the first cavern. Four pieces, and the forge sings again.',
    thanks: 'Hear it ring? That\'s good ore. Take some of my stock — fair trade. The forge is yours to use.',
  },
  yk_mittens: {
    title: 'The Mitten Thieves', giver: 'yk_mikan', zone: 'onsen',
    hook: "They took my fluffiest mittens! The big yokai are wearing them, I just know it!", goal: ["Win back 3 pairs of Fluffy Mittens from the champions", "the Onsen Caverns, floor 1"],
    lines: { door: "Mikan's fluffy mittens are in there! On yokai paws!", arrive: "The big yokai on this floor are wearing mittens. So unfair!", near: "That one's wearing Mikan's mittens! Get them back!", home: "Three pairs of mittens, a little damp, still fluffy! Let's take them to Mikan." },
    desc: 'The biggest yokai of the Onsen Caverns stole Mikan\'s fluffiest mittens. All of them. She wants three pairs back.',
    steps: [{ type: 'find', item: 'yk_mittens', n: 3, dungeon: DO, floor: 1, from: 'champion', text: 'Recover 3 pairs of Fluffy Mittens (Onsen Caverns, floor 1 champions)' }, { type: 'talk', npc: 'yk_mikan', text: 'Return the mittens to Mikan' }],
    reward: { coins: 700, xp: 3600, hearts: 10, furniture: 'onsenNoren', pantry: { honey: 3 } },
    offer: 'They took my mittens! The fluffy ones! The big yokai in the first cavern are wearing them, I just know it! Three pairs, please — my customers\' paws are freezing!',
    thanks: 'My mittens! A little damp, still fluffy. Here — a noren for your door and honey for your buns. Warm paws, warm heart!',
  },
  yk_snowmen: {
    title: 'Too Many Snowmen', giver: 'yk_yuzu', zone: 'onsen',
    hook: "Snowmen keep sitting in my baths! They melt, the water goes cold, and the monkeys complain!", goal: ["Stop 12 Yuki-daruma", "the Onsen Caverns"],
    lines: { door: "Snowmen that sit in hot baths… They come up from in there!", arrive: "Yuki-daruma! Twelve of them. Let's roll them back where they belong.", home: "No more snowmen in the baths! The monkeys can soak again. Let's tell Yuzu!" },
    desc: 'Yuki-daruma keep rolling up from the caverns and sitting in Yuzu\'s baths. Snowmen in hot baths. It\'s a mess.',
    steps: [{ type: 'kill', monster: 'yukidaruma', dungeon: DO, n: 12, text: 'Defeat 12 Yuki-daruma in the Onsen Caverns' }, { type: 'talk', npc: 'yk_yuzu', text: 'Tell Yuzu the baths are safe' }],
    reward: { coins: 720, xp: 3800, hearts: 10, furniture: 'lilyTub' },
    prereq: ['yk_caverns'],
    offer: 'Snowmen in my baths! They melt, the water goes cold, the monkeys complain! Twelve of them, down in the caverns — stop them before they come up for a soak.',
    thanks: 'Not a single snowman in the water! The monkeys are delighted. Here, a little tub — for soaking at home.',
  },
  yk_yukionna: {
    title: 'The Snow Woman', giver: 'yk_shirayuki', zone: 'onsen',
    hook: "Yuki-onna is awake, deep below. She isn't wicked, only cold. Help her sleep, and the springs will warm.", goal: ["Calm Yuki-onna", "the bottom of the Onsen Caverns"],
    lines: { door: "Yuki-onna sleeps at the bottom… only she isn't sleeping. Let's be gentle.", arrive: "Snowflakes falling indoors… She's on this floor.", boss: "It's getting colder… she's just ahead. Not wicked, only cold. Let's help her rest.", home: "The steam rises straight again! Granny Shirayuki will be so happy." },
    desc: 'Yuki-onna woke at the bottom of the Onsen Caverns, and her cold is creeping into the springs. Granny Shirayuki asks you to let her rest again.',
    steps: [{ type: 'boss', dungeon: DO, text: 'Defeat the boss of the Onsen Caverns' }, { type: 'talk', npc: 'yk_shirayuki', text: 'Return to Granny Shirayuki' }],
    reward: { coins: 2100, xp: 15000, hearts: 16, unique: true },
    prereq: ['yk_caverns'],
    offer: 'She is awake, deep below. Yuki-onna, the snow woman. She isn\'t wicked, only cold. Help her sleep, and the springs will warm again.',
    thanks: 'Feel that? The steam is rising straight. Sixty-one thousand, two hundred and thirteen snowfalls — and the warmest one of all.',
  },
};
export const ZONE_QUEST_IDS = Object.keys(ZONE_QUESTS);
export const questsOf = giver => ZONE_QUEST_IDS.filter(id => ZONE_QUESTS[id].giver === giver);
export const zoneQuestsIn = zone => ZONE_QUEST_IDS.filter(id => ZONE_QUESTS[id].zone === zone);

const doneOf = state => new Set(state?.quests?.done || []);
const activeOf = state => state?.quests?.active || [];
/** the quests this villager can offer right now (village saved, prereqs done, not taken or finished) */
export function offersFor(state, giver, villageSaved) {
  if (!villageSaved) return [];
  const done = doneOf(state), act = activeOf(state);
  return questsOf(giver).filter(id => !done.has(id) && !act.some(q => q.id === id) && (ZONE_QUESTS[id].prereq || []).every(p => done.has(p)));
}

/** Phase C's provider: the active zone quests' current-step needs on one dungeon floor (see the header). A step with no
 *  floor counts as floor 1; a step's tier (at least) and zone filters apply. */
export function dungeonObjectives(state, { dungeon, floor = 1, zone = null, tier = 0 } = {}, defs = null) {
  const out = [];
  for (const q of activeOf(state)) {
    const d = (defs && defs(q.id)) || ZONE_QUESTS[q.id]; if (!d) continue;
    const s = d.steps?.[q.step]; if (!s) continue;
    if (s.type !== 'rescue' && s.type !== 'find') continue;
    if (s.dungeon && s.dungeon !== dungeon) continue;
    if (!s.dungeon && (!s.zone || s.zone !== zone)) continue;
    if ((s.floor ?? 1) !== floor) continue;
    if (s.tier && (tier || 0) < s.tier) continue;
    if (s.type === 'rescue') out.push({ kind: 'cage', npc: s.npc, label: `Free ${ZONE_NPCS[s.npc]?.name || s.npc}`, quest: q.id });
    else { const left = Math.max(1, (s.n || 1) - (q.prog || 0)); out.push({ kind: 'drop', item: s.item, n: left, label: questItemName(s.item), from: s.from || 'champion', quest: q.id }); }
  }
  return out;
}
