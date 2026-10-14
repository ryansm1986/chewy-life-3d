// The heroes arrive in Blossom Hollow and start their homeland's story (ROADMAP Z-H3; docs/ZONES.md §3.1, docs/QUESTS.md
// §9). Pure (no three.js, no DOM): node-tested in tools/test-rpg.mjs "HERO ARRIVALS".
//
// When a zone opens (regions/index.js regionUnlocked: a hero's level, or the zone before it cleared by you or a crew), its
// arrival comes to Blossom Hollow: the zone's hero (or, for the Tide Pool until Stella is ready, a messenger) plays their
// old gag in town, asks for help for their home village and, a hero, joins at once; then the zone's main story quest
// starts with its card: travel to the zone, save its village, and bring the news back to whoever asked.
//
//   ARRIVALS: one entry per zone, in the zones' order: { zone, who, scene, quest, hero }
//     who    the hero id (CLASSES), or a zone villager (ZONE_NPCS) for a messenger who doesn't join
//     scene  the island scene that plays it (actors/arrivals.js SCENES); Stella replaces Kaizo by changing this entry
//     quest  the HERO_QUESTS id the arrival starts
//     hero   true: they join the pack (flags[`${who}Joined`]); false: a messenger, who goes home after asking
//   Each arrival waits for the one before it (Moka joined, for the first), and for its zone to open.
//
//   HERO_QUESTS[id] = { title, giver, zone, heroQuest: true, hook, goal, desc, steps, reward, handIn, thanks, selfThanks?,
//                       crew, crewSelf?, lines, next: null }
//     steps: visit the zone (questSteps.js `visit`: done on arriving there, or once its village is saved), then
//     villageSaved; the hand-in is the giver's (Story.handInFor: a hero, a Blossom Hollow villager or a zone villager)
//     thanks      the giver's line at the hand-in; selfThanks: the hero's own line when you play them (to Shadow)
//     crew        the giver's first line when a crew saved the village ({crew}); crewSelf: when the giver was in it ({others})
import { CLASSES } from '../rpg/classes.js';
import { REGIONS, regionUnlocked } from '../regions/index.js';
import { VILLAGES, ZONE_NPCS } from '../regions/village/data.js';
import { zoneOf } from '../rpg/zones.js';

export const ARRIVALS = [
  { zone: 'bamboo', who: 'poe', scene: 'poe', quest: 'hq_takemori', hero: true },
  { zone: 'maple', who: 'shihtzu', scene: 'shihtzu', quest: 'hq_akane', hero: true },
  // the Tide Pool's hero, Stella the Weimaraner (ROADMAP H-6), is still a concept: Captain Kaizo brings the news for now.
  // Her arrival replaces this entry: { zone: 'tidepool', who: 'stella', scene: 'stella', quest: 'hq_shiokaze', hero: true }
  { zone: 'tidepool', who: 'sk_kaizo', scene: 'kaizo', quest: 'hq_shiokaze', hero: false },
  { zone: 'onsen', who: 'golden', scene: 'golden', quest: 'hq_yukimi', hero: true },
];
export const arrivalOf = key => ARRIVALS.find(a => a.who === key || a.zone === key || a.quest === key) || null;
/** the hero (or messenger) who comes before this arrival: Moka for the first (she joins in town on a new game) */
export const prevOf = a => { const i = ARRIVALS.indexOf(a); return i > 0 ? ARRIVALS[i - 1] : { who: 'moka', hero: true, zone: null }; };
/** where the wheel says they'll come from: "Will arrive when the Bamboo opens" */
export const ZONE_SHORT = { bamboo: 'the Bamboo', maple: 'Momiji Hollow', tidepool: 'the Tide Pool', onsen: 'the Onsen' };

const flagsOf = state => state?.flags || {};
const joinedOf = (state, id) => id === 'chewy' || !!flagsOf(state)[`${id}Joined`];
/** the record of an arrival played (or settled for an old save): state.flags.arrivals[zone] = { how, day } */
export const arrivalRec = (state, a) => flagsOf(state).arrivals?.[a.zone] || null;
/** is this arrival behind us? A hero: joined (however they joined: this arrival, an old zone scene, ?hero=, the debug
 *  menu); a messenger: their visit recorded */
export function arrivalDone(state, a) {
  if (!a) return true;
  return a.hero ? joinedOf(state, a.who) : !!arrivalRec(state, a);
}
/** the arrivals whose scenes exist (the table may name a scene still to build: it waits, and so do the ones after it) */
export const playable = (a, scenes) => !scenes || !!scenes[a.scene];
/** The arrival due now (its zone open, the one before it done, itself not done) → the entry, or null. The first not
 *  done blocks the rest, so they come in the zones' order. opened(zone): the zone open (regionUnlocked by default). */
export function arrivalDue(state, { opened = z => regionUnlocked(state, z).ok, scenes = null } = {}) {
  for (const a of ARRIVALS) {
    if (arrivalDone(state, a)) continue;
    const p = prevOf(a);
    if (!(p.hero ? joinedOf(state, p.who) : arrivalDone(state, p))) return null;
    if (!opened(a.zone) || !playable(a, scenes)) return null;
    return a;
  }
  return null;
}
/** the quest an arrival brings, as it stands: 'start' (the village still needs saving), 'saved' (it was saved before they
 *  came: a crew, an old save — they come to say thank you, and no quest starts) or 'had' (the quest is already running or
 *  done) */
export function questPlan(state, a) {
  const Q = state?.quests || {};
  if ((Q.active || []).some(q => q.id === a.quest) || (Q.done || []).includes(a.quest)) return 'had';
  return zoneOf(state, a.zone).village === 'saved' ? 'saved' : 'start';
}
/** Old saves (and a hero joined by other means: an old zone scene, ?hero=, the debug menu): a hero who has already joined
 *  gets no second arrival, but their zone's quest still starts (quietly, with its card) while their village needs
 *  saving and the zone is open → the entries whose quest should start now */
export function questsOwed(state, { opened = z => regionUnlocked(state, z).ok } = {}) {
  return ARRIVALS.filter(a => a.hero && joinedOf(state, a.who) && opened(a.zone) && questPlan(state, a) === 'start' && !arrivalRec(state, a)?.noQuest);
}
/** a name for the giver of an arrival (a hero's class name, or the zone villager's) */
export const whoName = a => (a.hero ? CLASSES[a.who]?.name : ZONE_NPCS[a.who]?.name) || a.who;
/** The hero wheel's line for a hero not met yet (heroes.js roster): when they'll come. inTown: you're in Blossom Hollow */
export function arrivalHint(state, id, { opened = z => regionUnlocked(state, z).ok, inTown = true, running = false } = {}) {
  const a = arrivalOf(id); if (!a || !a.hero) return null;
  if (running) return 'Arriving in Blossom Hollow now!';
  if (!opened(a.zone)) return `Will arrive when ${ZONE_SHORT[a.zone] || REGIONS[a.zone]?.name || a.zone} opens`;
  for (let p = prevOf(a); p && p.who !== 'moka'; p = prevOf(p)) { // (the one before still to come: they come in order)
    if (!arrivalDone(state, p)) return p.hero ? `Will arrive after ${CLASSES[p.who]?.name || p.who} joins` : `Will arrive after ${whoName(p)} comes by`;
    if (p.hero) break;
  }
  if (!joinedOf(state, 'moka')) return 'Will arrive after Moka joins';
  return inTown ? 'On the way to Blossom Hollow…' : 'Will be waiting in Blossom Hollow';
}
/** the village a hero quest saves, by name */
export const villageName = zone => VILLAGES[zone]?.name || REGIONS[zone]?.name || zone;

const visit = (zone, text) => ({ type: 'visit', zone, text });
const saved = (zone, text) => ({ type: 'villageSaved', zone, text });
export const HERO_QUESTS = {
  // ---------------------------------------------------------------- Poe: Takemori Village (the Bamboo)
  hq_takemori: {
    title: 'Takemori Under Siege', giver: 'poe', zone: 'bamboo', heroQuest: true,
    hook: "Takemori is under siege! I… came to fetch help. Very stealthily.",
    goal: ['Save Takemori Village', 'the Whispering Bamboo Grove'],
    desc: "Poe tiptoed all the way to Blossom Hollow to fetch help: yokai have Takemori Village, her home in the bamboo, under siege. Take the Wayfarer's Post to the grove, break their camps and drive off their captain.",
    steps: [visit('bamboo', "Travel to the Bamboo Grove (the Wayfarer's Post)"), saved('bamboo', 'Save Takemori Village')],
    reward: { coins: 400, xp: 500, skillPts: 1, furniture: 'hangingScroll' },
    handIn: { text: 'Tell Poe that Takemori is safe' },
    thanks: "Takemori is safe? You saved my whole village… *sniff* That's not crying. A shinobi's eyes just leak when she's proud. Take this scroll, it's from the dojo.",
    selfThanks: "We did it, Shadow! Takemori is safe, and nobody saw us coming. …Everybody saw us coming. Good boy anyway.",
    crew: "{crew} snuck into Takemori and chased the siege off! Almost as quietly as I would have.",
    crewSelf: "{others} and I chased the siege out of Takemori! I was the stealthy part. Thank you for sending us.",
    lines: { arrive: [null, "Takemori is just up the trail! I can smell yokai camping in the square. Let's go!"], home: "Takemori is safe! Let's tell Poe. She'll say she isn't crying." },
    next: null,
  },
  // ---------------------------------------------------------------- Floofy: Akane Hamlet (the Maple)
  hq_akane: {
    title: 'The Gloom over Akane', giver: 'shihtzu', zone: 'maple', heroQuest: true,
    hook: "Akane Hamlet has fallen under the gloom. Not the good kind. The ghostlights cannot hold it back alone.",
    goal: ['Save Akane Hamlet', 'Momiji Hollow'],
    desc: "Floofy, the Knight of the Gloomhowl, came down the Maple road to ask for help: yokai have Akane Hamlet under siege, and his ghostlights can't keep them out. Take the Wayfarer's Post to Momiji Hollow and break the siege.",
    steps: [visit('maple', "Travel to Momiji Hollow (the Wayfarer's Post)"), saved('maple', 'Save Akane Hamlet')],
    reward: { coins: 1000, xp: 3000, skillPts: 1, furniture: 'yokaiLantern' },
    handIn: { text: 'Tell Floofy that Akane is safe' },
    thanks: "Akane is free of the gloom. …Knights do not cry. It is the lantern smoke. Take this lantern. It winks. I did not teach it that.",
    selfThanks: "It is done, Shadow. The gloom has lifted over Akane. …You may lick my face. Once. Solemnly.",
    crew: "{crew} lifted the gloom over Akane. The ghost pups followed them home. They follow everyone home.",
    crewSelf: "{others} and I lifted the gloom over Akane. I was very hard to knock over. Thank you for sending us.",
    lines: { arrive: [null, "Akane is just down the maple road. The gloom is thickest in the square. Ears up!"], home: "Akane is safe! Let's tell Floofy. He'll say it's the lantern smoke." },
    next: null,
  },
  // ---------------------------------------------------------------- Captain Kaizo (a messenger, for now): Shiokaze Port (the Tide Pool)
  hq_shiokaze: {
    title: 'Trouble at Shiokaze Port', giver: 'sk_kaizo', giverName: 'Captain Kaizo', zone: 'tidepool', heroQuest: true, // (the card's name plate: "Old Captain Kaizo" won't fit)
    hook: "Shiokaze Port's under siege, matey! Crabs in the nets, kappa on the roofs. I rowed all night to find you.",
    goal: ['Save Shiokaze Port', 'the Shiokaze Tidepools'],
    desc: "Old Captain Kaizo rowed all night from Shiokaze Port to ask for help: crabs and kappa have the harbour under siege. Take the Wayfarer's Post to the Tidepools and break the siege. He'll be waiting at his lookout.",
    steps: [visit('tidepool', "Travel to the Tidepools (the Wayfarer's Post)"), saved('tidepool', 'Save Shiokaze Port')],
    reward: { coins: 1800, xp: 7000, skillPts: 1, furniture: 'festivalLantern' },
    handIn: { text: 'Tell Captain Kaizo the port is safe' },
    thanks: "The nets are clear and the kappa are off my roof! You've the heart of a sea dog, matey. Take this lantern, it hung on my old ship.",
    crew: "{crew} sailed in and chased the siege back to sea! You know how to pick a crew, matey.",
    lines: { arrive: [null, "I can smell the sea! Shiokaze Port is just down the shore. Let's help Captain Kaizo!"], home: "The port is safe! Let's tell Captain Kaizo. Can I be first mate now?" },
    next: null,
  },
  // ---------------------------------------------------------------- Foosy: Yukimi Spa Village (the Onsen)
  hq_yukimi: {
    title: 'The Siege of Yukimi', giver: 'golden', zone: 'onsen', heroQuest: true,
    hook: "Yukimi Spa is besieged by snow and yokai! I guarded the springs alone as long as I could. Will you come?",
    goal: ['Save Yukimi Spa Village', 'Yukimi Onsen'],
    desc: "Foosy of the Emberleaf Guard held the springs of Yukimi alone until he couldn't, then came for help: yokai have Yukimi Spa Village under siege. Take the Wayfarer's Post to the Onsen and break the siege.",
    steps: [visit('onsen', "Travel to Yukimi Onsen (the Wayfarer's Post)"), saved('onsen', 'Save Yukimi Spa Village')],
    reward: { coins: 2600, xp: 14000, skillPts: 1, furniture: 'daruma' },
    handIn: { text: 'Tell Foosy the springs are safe' },
    thanks: "The springs are safe! I knew it. I absolutely knew it. …A knight does not wag. It is the wind. Take this daruma; I painted in one eye for you.",
    selfThanks: "The springs are safe, Shadow! My vow is kept. …Mostly kept. We fetched a ball in the middle of it.",
    crew: "{crew} broke the siege of Yukimi! I shall write them a ballad. A short one. With a ball in it.",
    crewSelf: "{others} and I broke the siege of Yukimi! I guarded everyone with my whole heart. Thank you for sending us.",
    lines: { arrive: [null, "Brrr, snow! Yukimi Spa is just up the trail. I can smell yokai in the hot springs!"], home: "The springs are safe! Let's tell Foosy. He'll say a knight doesn't wag." },
    next: null,
  },
};
export const HERO_QUEST_IDS = Object.keys(HERO_QUESTS);
/** the hero quest a zone's arrival brings */
export const heroQuestOf = zone => HERO_QUEST_IDS.find(id => HERO_QUESTS[id].zone === zone) || null;
/** the giver's first line at the hand-in when a crew saved their village: crew (the crew's names), others (the crew
 *  without the giver, when they went too) → the line */
export function crewThanks(d, crew, { others = null, solo = false } = {}) {
  if (solo) return d.crewSolo || (d.crewSelf ? d.crewSelf.replace('{others} and I', 'I').replace(/Thank you for sending us\.?/, 'Thank you for sending me.') : null);
  if (others != null && d.crewSelf) return d.crewSelf.replace('{others}', others);
  return d.crew ? d.crew.replace('{crew}', crew) : null;
}
