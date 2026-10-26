// Quest moments (ROADMAP UX-2; docs/QUESTS.md): quests as an adventure, not a line in the tracker.
//  1. The quest card (§1): taking a story, zone or villager quest queues a storybook card (ui/questCard.js) for the next
//     calm moment (never in a fight, dialogue, a scene, build or decorate; after banners and transitions). It must be
//     pressed ("Let's go!": Enter or F, the pad's A, a tap). "Let's go!" sets Shadow leading the way to it when
//     Settings › Shadow leads the way is on Quests (or Always) and the quest points somewhere now. A villager's daily
//     request gets a compact slip instead (a toast with their face, the goal and the reward): it never stops play.
//     The queue is saved (state.quests.cards), so a card taken just before a save still shows after the load.
//  2. The place title (§3): entering the area the current step targets (a den or zone dungeon floor, a zone, a Blossom
//     Hollow district, a room: world/questLore.js stepArea) fades in a storybook heading for about 2.5 s ("The King of
//     Squish · Mossy Burrow · Floor 2 of 2 · Defeat King Mochi") with a soft sting (audio/music.js STINGS.place). On an
//     arrival it takes the area banner's place (the same spot, as the screen opens). Once per step and area (the quest's
//     record keeps `tt`); never over a boss card, the den picker, a panel or a dialogue (it waits while you stay); not
//     for repeatable requests.
//  3. Shadow's lines (§2): at the quest's places (its dungeon's door, arriving in its area, by a find's or a rescue's
//     mark, the boss in sight, the way home) he says a line, the quest's own (`lines`) or his template for the step;
//     once per place and step (q.sl), never in a fight, never over a guide, a dialogue, a banner, a card or a tip; only
//     where you are (a crew's work gets none).
//  4. The hand-in (§4): a quest whose steps are done waits for its giver (Story.stepsDone, q.handIn): the arrow, the pin
//     and Shadow point at them where they are now (the map's People lookup), the place title fires near them; talking to
//     them plays the scene (their happy hop and hearts, a line about the crew if one did it, their thank-you), the
//     reward flies from their paws into the bag and the coins, and the "Quest complete" stamp (completed) replaces the
//     banner; the next quest starts after it.
// The QA's quiet sessions (?nointro without ?qcard, or ?nocard; remembered for the tab, as the guides') keep the old
// "New Quest" banner and no cards, so the flows that never meet a guide never meet a card either; s46 drives them. The
// lines, the hand-in and the stamp are the same in every session.
import { Events } from '../core/events.js';
import { heroText } from '../rpg/classes.js';
import { REGIONS } from '../regions/index.js';
import { VILLAGES, ZONE_NPCS } from '../regions/village/data.js';
import { ZONE_QUESTS, QUEST_ITEMS } from './zoneQuests.js';
import { crewThanks } from './heroQuests.js'; // (a hero's homeland quest: their own words about the crew, ROADMAP Z-H3)
import { goalOf, rewardList, stepArea, areasHere, districtAt, districtName, bare, lineFor, LINE_BEATS } from './questLore.js';
import { people, places, personSpot, personWhere } from './mapData.js'; // (the map's "where is this person now": read only)
import { LANDMARKS } from './layout.js';
import { DUNGEONS, isBurrow } from '../dungeon/defs.js';
import { rewardFly, rewardChips } from '../ui/questCard.js';
import { registerDebug } from '../debug/registry.js';
import { Vector3 } from 'three';

const CALM_CARD = 0.6;   // s of calm before a card opens
const POLL = 0.25;       // s between the place checks (a district walked into)
const GIVER_R = 14;      // m: this near a giver (where they are now) is "with them" (the hand-in's place title)
const DOOR_R = 7, NEAR_R = 10, BOSS_R = 26, BOSS_NEAR = 15; // m: the dungeon's door, a find's or rescue's mark (on the screen by then), the boss in sight (on the screen within 26 m, or within 15 m: he notices you at 9) (Shadow's lines)
const LINE_GAP = 4;      // s between two of Shadow's lines
const STAMP_S = 3.0;     // s the "Quest complete" stamp stays
const HOP_BEAT_MS = 550; // ms of the giver's happy hop and hearts before their thank-you opens
const _v = new Vector3();
/** Shadow's line as his tip card: his face, his blue, "Shadow". Normal priority, so the next toast doesn't push it out
 *  before it's read; lineTick takes it down if a fight starts */
const LINE_TOAST = G => ({ iconURL: G.portrait?.('shadow') || null, icon: 'paw', color: '#9fd0ff', sub: 'Shadow', duration: 6, priority: 'normal' });
/** a toast of Shadow's (a tip or a line) is up */
const shadowTalking = ui => !!ui?.toasts?.live?.some(t => !t._dying && (t._pri <= 0 || /\|Shadow$/.test(t._key || '')));
/** a giver's line about the crew that did their quest (the hand-in: docs/QUESTS.md §4) */
const CREW_LINES = {
  rosie: '{crew} came by and told me the whole story! You sent the best friends in the world.',
  kitsune: '{crew} brought word from the deep places. A good leader sends good friends.',
  kuma: '{crew} came in covered in dust and very proud. Good friends, those.',
  kero: "{crew} told me everything. Ribbit. Knowing whom to send is a pond guardian's skill too.",
  usagi: '{crew} hopped by with the news! Hop hop!',
};
const crewLine = (giver, crew) => (CREW_LINES[giver] || '{crew} came back with the news! Thank you for sending them.').replace('{crew}', crew);
/** the giver's line about the crew a quest's record names: a hero quest's own (crew, or crewSelf when the giver went
 *  too: q.crewWith, the others' names, '' when they went alone), else the giver's CREW_LINES */
const crewWords = (q, d) => (q.crewBy ? (d.heroQuest && crewThanks(d, q.crewBy, { others: q.crewWith ?? null, solo: q.crewWith === '' })) || crewLine(d.giver, q.crewBy) : null);

export function installQuestMoments(G, o = {}) {
  const M = G.questMoments = new QuestMoments(G, o);
  M.registerDebug();
  return M;
}

export class QuestMoments {
  constructor(G, { cards = true } = {}) {
    this.G = G; this.cards = cards;
    this.calmT = 0; this.pollT = 0; this.open = null;
    this.last = []; this.pend = new Set(); // (the area keys of the last check; keys entered but not yet titled)
    this.stats = { cards: 0, slips: 0, titles: 0, lastTitle: null, lastCard: null, why: null, lines: 0, lineWhy: null, handIns: 0, lastHandIn: null, stamps: 0 };
    this.lineQ = []; this.said = []; this.lineGap = 0; // (Shadow's lines waiting for a calm moment; the last ones said, for the QA)
    // (after Story's own mode:changed: a floor step it completes on arrival has moved on, and the title names the next)
    Events.on('mode:changed', () => this.arrive());
  }
  get Q() { return this.G.state.quests; }
  def(id) { return this.G.story?.def?.(id); }
  zoneName = z => REGIONS[z]?.name || z;
  npcName = id => this.G.story?.nameOf?.(id) || ZONE_NPCS[id]?.name || id;

  // ------------------------------------------------------------------ 1. the card
  /** Story.start(id) (not silent): → true when the moment is taken here (a card queued, or a request's slip), false for
   *  the old "New Quest" banner (the QA's quiet sessions) */
  accepted(id, d) {
    if (!this.cards || !d) return false;
    if (d.request) { this.slip(id, d); return true; }
    const Q = this.Q, C = (Q.cards ||= []);
    if (!C.includes(id)) C.push(id);
    return true;
  }
  /** a card is waiting or open (the guides wait for it: world/tutorials.js calm) */
  get cardPending() { return !!this.open || (this.cards && !!this.Q.cards?.some(id => this.live(id))); }
  /** one of Shadow's quest lines is up (or was a moment ago), or waiting to be said: his one-off tips wait (game.js
   *  hintHold), so they never stack under a line, and a line due goes before the next tip (a new game's tips come back
   *  to back, and a line waiting for a gap between them would miss its moment) */
  get speaking() {
    const now = performance.now();
    if (now < this.lineGap - (LINE_GAP - 1.5) * 1000) return true;
    if (this.lineQ.some(e => now < e.until && this.live(e.q.id) && e.q.step === e.step)) return true;
    return !!this.G.ui?.toasts?.live?.some(t => !t._dying && this.said.some(x => t._key === `${x[3]}|Shadow`));
  }
  live(id) { return this.Q.active.some(q => q.id === id); }
  /** what the card shows for a quest */
  cardData(id) {
    const G = this.G, S = G.story, d = this.def(id); if (!d) return null;
    const lead = this.wouldLead(id);
    return {
      id, kind: d.request ? 'request' : ZONE_QUESTS[id] ? 'zone' : 'story', title: d.title, giver: d.giver, name: d.giverName || S?.nameOf?.(d.giver) || d.giver, // (giverName: a shorter one for the card's name plate)
      portrait: G.portrait?.(d.giver) || null, hook: heroText(d.hook || d.desc || '', G.state),
      goal: goalOf(d, { zoneName: this.zoneName, npcName: this.npcName }).map(t => heroText(t, G.state)), rewards: rewardList(d.reward), lead,
    };
  }
  /** "Let's go!" sets Shadow leading the way: Settings › Shadow leads the way on Quests or Always, the quest pointing
   *  somewhere now, and no guide running or about to (its own steps lead) */
  wouldLead(id) {
    const G = this.G, set = G.ui?.settings?.shadowLead ?? 1;
    const T = G.tutorials; // (a guide running, about to start or offered leads the way itself: a new game's first card is read before Moka's guide)
    return set >= 1 && !!G.lead && !T?.cur && !T?.pending?.size && !T?.offers?.length && !!G.story?.target?.(id)?.pos;
  }
  /** why a card can't open now (null: it can) */
  why() {
    const G = this.G, ui = G.ui, P = G.player;
    if (!ui?.ready || G.titleActive || G.playerDead) return 'busy';
    if (ui.iris?.active || G.leavingDungeon) return 'transition';
    if (ui.dlg?.active) return 'dialogue';
    if (ui.anyModal?.() || ui.tutorial?.offering) return 'panel';
    if (ui.banners?.busy) return 'banner';
    if (G.build?.active || G.buildMode || G.housing?.decor?.active || G.decorFocus) return 'build';
    if (shadowTalking(ui)) return 'tip'; // (Shadow's one-line tip or one of his lines is up: his words first)
    if (G.introFocus || G.cutscene || G.heroSwitching || G.heroFocus || P?.controlLocked || G.arrivals?.busy) return 'scene'; // (an arrival's scene: Captain Kaizo rowing home first)
    if (G.dungeon?.village?.celebrate) return 'celebration';
    if (G.life?.fishing?.s || G.cozy?.scav?.busy || G.cozy?.scav?.session) return 'busy';
    if (this.fight()) return 'fight';
    return null;
  }
  /** a fight on: Shadow's calm clock (his fight, an aggroed foe near the hero, the hero hurt), a boss awake, a foe on you */
  fight() {
    const G = this.G, D = G.mode === 'dungeon' ? G.dungeon : null; if (!D) return false;
    if (G.lead && G.lead.calmT < 2) return true;
    const b = D.boss; if (b?.alive && (b.aggro || (b.introDone && b.pos.distanceTo(G.player.pos) < 30))) return true;
    return !!G.combat?.nearest?.(G.player.pos, 'ally', 14, e => e.aggro && !e.breakable);
  }
  update(dt) {
    if ((this.pollT -= dt) <= 0) { this.pollT = POLL; this.placeTick(); this.lineTick(); }
    if (!this.cards || this.open) return;
    const C = this.Q.cards; if (!C?.length) { this.calmT = 0; return; }
    for (let i = C.length - 1; i >= 0; i--) if (!this.live(C[i])) C.splice(i, 1); // (done before its card showed: the banner said so)
    if (!C.length) return;
    const w = this.why(); this.stats.why = w;
    this.calmT = w ? 0 : this.calmT + dt;
    if (this.calmT >= CALM_CARD) this.showCard(C[0]);
  }
  /** open a quest's card now (the queue, or the debug menu) */
  showCard(id, { force = false } = {}) {
    const G = this.G, o = this.cardData(id); if (!o || !G.ui?.open) return false;
    const C = this.Q.cards || []; const k = C.indexOf(id); if (k >= 0) C.splice(k, 1);
    this.open = id; this.calmT = 0; this.stats.cards++; this.stats.lastCard = id;
    G.ui.open('questCard', { ...o, onClose: how => this.cardClosed(id, how, o) });
    Events.emit('sfx', 'ui_quest');
    Events.emit('quest:card', { id, open: true, force });
    return true;
  }
  cardClosed(id, how, o) {
    const G = this.G;
    this.open = null;
    if (how === 'go' && o?.lead && this.live(id) && this.wouldLead(id) && G.lead?.intent?.t?.quest !== id) G.lead.toggle(id); // (Shadow on it: "This way!")
    Events.emit('quest:card', { id, open: false, how });
    G.save?.();
  }
  /** a request's compact slip: the giver's face, the goal and the reward, in the toast column (it never stops play) */
  slip(id, d) {
    const G = this.G, r = d.reward || {};
    // (a decorate ask's stars as words: "Make Kero's home ★★★★☆" → "Make Kero's home a 4★ home")
    const act = goalOf(d, { zoneName: this.zoneName, npcName: this.npcName })[0].replace(/\s*([★☆]{2,})\s*$/, (m, st) => ` a ${(st.match(/★/g) || []).length}★ home`);
    const pay = [r.coins ? `${r.coins} coins` : '', r.xp ? `${r.xp} XP` : '', r.furniture ? 'a gift for your home' : '', r.hearts ? 'friendship' : ''].filter(Boolean).join(' · ');
    G.ui?.toast?.(`New request: ${heroText(act, G.state)}`, { iconURL: G.portrait?.(d.giver) || null, icon: 'scroll', color: '#ffd84a', sub: `${this.npcName(d.giver)}${pay ? ' · ' + pay : ''}`, duration: 5 });
    Events.emit('sfx', 'ui_quest');
    this.stats.slips++;
  }

  // ------------------------------------------------------------------ 2. the place title
  /** where you are: the area keys and the words for a title there */
  here() {
    const G = this.G, D = G.mode === 'dungeon' ? G.dungeon : null, P = G.player;
    let w;
    if (D?.kind === 'region') w = { mode: 'region', zone: D.zoneId, name: D.region?.name || this.zoneName(D.zoneId) };
    else if (D) { const def = D.def || {}; w = { mode: 'dungeon', dungeon: def.id, floor: D.floor, name: def.name || '', floors: def.floors, tier: D.tr?.label || '' }; }
    else if (G.mode === 'village' && P) {
      const k = districtAt(P.pos.x, P.pos.z); w = { mode: 'village', district: k, name: districtName(k), givers: [] };
      for (const q of this.Q.active) { const s = G.story?.stepOf?.(q); if ((s?.type === 'talk' || s?.type === 'deliver') && s.npc && !ZONE_NPCS[s.npc] && !w.givers.includes(s.npc) && this.withGiver(s.npc, k)) w.givers.push(s.npc); } // (the villagers a talk or a hand-in step wants: with them now)
    }
    else if (G.mode === 'interior') { const H = G.housing?.home; w = { mode: 'interior', room: H?.owner || (H?.household ? 'home' : null), name: H?.name || '' }; }
    else w = { mode: G.mode };
    w.keys = areasHere(w);
    return w;
  }
  /** an arrival (a floor, a zone, home, a room): everything here counts as entered, and an area banner may give way */
  arrive() { this.last = []; this.pend.clear(); this.placeTick(true); }
  placeTick(arrival = false) {
    const G = this.G; if (!G.story || !G.state?.quests) return;
    const w = this.here(), keys = w.keys;
    for (const k of keys) if (!this.last.includes(k)) this.pend.add(k);
    for (const k of [...this.pend]) if (!keys.includes(k)) this.pend.delete(k); // (left again before it could show)
    this.last = keys;
    if (!this.pend.size) return;
    const hit = this.due();
    if (!hit) { this.pend.clear(); return; } // (nothing of a quest's here: forget them, they were entered)
    // an arrival's own area banner gives way at once (behind the iris): the place title says where you are too, and
    // shows once the screen is open (a first floor's build can outlast a banner's whole life behind it)
    if (arrival) G.ui?.banners?.drop?.('area');
    if ((this.stats.titleWhy = this.titleBlocked())) return; // (it waits while you stay: the keys stay pending)
    const { q, d, s, a } = hit;
    q.tt = (q.tt || []).filter(t => t.startsWith(q.step + '|'));
    q.tt.push(`${q.step}|${a.key}`);
    this.pend.delete(a.key);
    this.showTitle(q, d, s, a, w); // (one at a time; another quest's title for the same arrival waits for the next check)
  }
  /** the first active quest whose current step's area was just entered and hasn't had its title → { q, d, s, a } */
  due() {
    for (const q of this.Q.active) {
      const d = this.def(q.id); if (!d || d.request) continue;
      const s = this.G.story?.stepOf?.(q, d) || d.steps?.[q.step], a = stepArea(s); if (!a || !this.pend.has(a.key)) continue; // (a hand-in step too: its giver)
      if ((q.tt || []).includes(`${q.step}|${a.key}`)) continue;
      return { q, d, s, a };
    }
    return null;
  }
  /** why a place title can't show now → a reason, or null */
  titleBlocked() {
    const G = this.G, ui = G.ui; if (!ui?.ready || G.titleActive || G.playerDead) return 'busy';
    if (ui.iris?.active || G.leavingDungeon) return 'transition'; // (behind a transition: when it opens)
    if (ui.dlg?.active) return 'dialogue';
    if (G.cutscene || G.introFocus) return 'scene'; // (the opening and Rosie's welcome: world/opening.js, game.js intro)
    if (ui.isOpen?.('burrow') || ui.anyModal?.()) return 'panel'; // (never over a dialogue, the den picker or a panel)
    const L = ui.banners?.live; return L?.style === 'boss' || L?.style === 'victory' ? 'boss' : null; // (never over a boss's card or its Victory)
  }
  /** the words: the quest on the ribbon, the place, the floor and the step */
  titleOf(q, d, s, a, w) {
    let name = w.name;
    if (a.kind === 'zone' && s.type === 'talk' && VILLAGES[a.zone]) name = VILLAGES[a.zone].name; // (the way home: the giver's village)
    if (a.kind === 'giver') name = this.giverPlace(a.npc); // (where the giver is now: "Rosie's Treats", "Koi Pond")
    const floor = w.mode === 'dungeon' && w.floor ? `${w.tier ? w.tier + ' · ' : ''}Floor ${w.floor}${Number.isFinite(w.floors) ? ` of ${w.floors}` : ''}` : '';
    // (a floor step seen from a floor above it: where to go now)
    const n = s.type === 'floor' ? (s.n || 1) : s.type === 'dungeonFloor' ? (s.n || 1) : 0;
    const what = n && w.mode === 'dungeon' && w.floor < n ? `Find the stairs down to floor ${n}` : heroText(bare(s.text), this.G.state);
    return { kicker: d.title, title: name || d.title, sub: [floor, what].filter(Boolean).join(' · ') };
  }
  showTitle(q, d, s, a, w) {
    const G = this.G, ui = G.ui, t = this.titleOf(q, d, s, a, w);
    ui.banner?.(t.title, t.sub, { style: 'place', kicker: t.kicker, onShow: () => this.sting() });
    this.stats.titles++; this.stats.lastTitle = { quest: q.id, step: q.step, key: a.key, ...t };
    if (!(s.type === 'talk' && s.npc === d.giver && (s.handIn || q.step === d.steps.length - 1))) this.queueLine(q, d, s, 'arrive', 25); // (Shadow's line for it, once the title's gone; the way home has its own)
    Events.emit('quest:place', { quest: q.id, step: q.step, area: a.key, title: t.title });
  }
  sting() { const A = this.G.audio; try { A?.duck?.(0.55, 2.2); A?.sting?.('place'); } catch (e) { /* (no audio yet) */ } }

  // ------------------------------------------------------------------ 4. the hand-in (docs/QUESTS.md §4)
  /** a Blossom Hollow villager where the map's People list has them now (mapData.js): themselves, or their door while
   *  they're indoors → { npc, entry, spot } | null */
  giverAt(id) {
    const G = this.G, n = G.npcs?.find(x => x.id === id); if (!n?.pos) return null;
    const e = { npc: n, pos: n.pos }, spot = personSpot(G, e);
    return spot ? { npc: n, entry: e, spot, indoors: n.visible === false } : null;
  }
  /** the hand-in's pointer in the village: the giver now (their door while indoors) → { pos, label, kind } | null */
  giverTarget(id) {
    const g = this.giverAt(id); if (!g) return null;
    return { pos: g.spot, label: g.indoors ? `${this.npcName(id)} (indoors)` : this.npcName(id), kind: g.indoors ? 'place' : 'npc' };
  }
  /** where the giver is, as a title ("Rosie's Treats", "Market Street", "Koi Pond"): the map's "where are they now" words */
  giverPlace(id) {
    const G = this.G, e = people(G).find(p => p.id === id); if (!e) return '';
    const w = String(personWhere(G, e, places(G)) || '').replace(/^In Blossom Hollow · /, '');
    const t = w.replace(/^(Indoors at|by|on|in|near)\s+/i, '').replace(/^the\s+/i, '');
    return t && !/^(Indoors|You)$/i.test(t) ? t[0].toUpperCase() + t.slice(1) : districtName(districtAt(e.pos?.x, e.pos?.z)) || 'Blossom Hollow';
  }
  /** a giver you're with: within GIVER_R of where they are now, or in the district they're in now */
  withGiver(id, here) {
    const g = this.giverAt(id), P = this.G.player; if (!g || !P) return false;
    if (Math.hypot(P.pos.x - g.spot.x, P.pos.z - g.spot.z) < GIVER_R) return true;
    const k = districtAt(g.spot.x, g.spot.z); return !!k && k === here;
  }
  /** Talking to a giver with quests to take in (Story.talk, regions/village/talk.js): for each, their happy hop and hearts,
   *  a line about the crew when one did it, their thank-you, then the quest completes (Story.handIn) with the reward flying
   *  from their paws and the stamp (completed). list: [{ q, d }]; say: their dialogue */
  async handInScene(npc, list, say, o = {}) {
    this.handing = (this.handing || 0) + 1; // (a hand-in is playing: the QA's drainDialogue waits through its beat)
    try { await this.handInPlay(npc, list, say, o); } finally { this.handing--; }
  }
  /** o.self: the giver is the hero you play (a hero's homeland quest: actors/arrivals.js selfHandIn): no turning to you,
   *  their own line to Shadow (selfThanks) */
  async handInPlay(npc, list, say, o = {}) {
    const G = this.G, P = G.player;
    for (const { q, d } of list) {
      if (!this.live(q.id)) continue;
      if (P && npc.faceTo && !o.self) npc.faceTo(P.pos.x, P.pos.z);
      npc.anim?.play?.('happy');
      if (npc.emote) npc.emote('heart', 2.2); else G.vfx?.emote?.(npc, 'heart', 2.2);
      const head = npc.pos?.clone ? npc.pos.clone().setY(npc.pos.y + 1.5) : null;
      if (head) G.vfx?.sparkle?.(head, { n: 16, color: '#ff8fb0', r: 0.6, rise: 1.2 });
      Events.emit('sfx', 'gift_loved');
      // a beat to see the hop and the hearts before the dialogue box covers the bottom of the screen (talk locks control)
      await new Promise(r => setTimeout(r, HOP_BEAT_MS));
      const lines = [], crew = crewWords(q, d);
      if (crew) lines.push(crew);
      if (!(o.self && crew)) lines.push((o.self && d.selfThanks) || d.thanks || `Thank you, Chewy! You've made my day.`); // (you play the giver and a crew did it: their line about the crew is the thank-you)
      await say(lines);
      this.stats.handIns++; this.stats.lastHandIn = { id: q.id, crew: q.crewBy || null, giver: d.giver };
      Events.emit('quest:handedIn', { id: q.id, giver: d.giver, crew: q.crewBy || null });
      G.story.handIn(q.id, { from: npc });
    }
  }
  /** Story.complete: the "Quest complete" stamp on its card (a banner: it waits behind a dialogue, never blocks) and the
   *  reward flying into the bag and the coin counter, from the giver (from) or from you. → true (the old banner is not shown) */
  completed(q, d, { from = null } = {}) {
    const G = this.G, ui = G.ui; if (!ui?.ready) return false;
    const rewards = rewardList(d.reward), name = this.npcName(d.giver);
    const src = this.screenOf(from?.pos, 1.3) || this.screenOf(G.player?.pos, 1.0) || { x: innerWidth / 2, y: innerHeight / 2 };
    if (rewards.length) rewardFly(ui, src, rewards);
    ui.banner(d.title, d.giver ? `${name} says thank you!` : '', { style: 'stamp', chips: rewardChips(rewards), duration: STAMP_S, onShow: () => { Events.emit('sfx', 'ui_quest_done'); Events.emit('sfx', 'quest_stamp'); } });
    if (!from) G.vfx?.sparkle?.(G.player.pos.clone().setY(G.player.pos.y + 1.2), { n: 14, color: '#ffd84a', r: 0.6, rise: 1.2 });
    this.stats.stamps++;
    return true;
  }
  /** a world spot well inside the view (not under the HUD's bottom bar): the boss "in sight" */
  inView(p) { const v = this.screenOf(p, 1); return !!v && v.x > innerWidth * 0.06 && v.x < innerWidth * 0.94 && v.y > innerHeight * 0.1 && v.y < innerHeight * 0.8; }
  /** a world spot on the screen (lift m up) → { x, y } in CSS px, or null */
  screenOf(p, lift = 0) {
    const cam = this.G.engine?.camera; if (!p || !cam) return null;
    _v.set(p.x, (p.y || 0) + lift, p.z).project(cam);
    if (_v.z > 1 || _v.z < -1) return null;
    return { x: (_v.x * 0.5 + 0.5) * innerWidth, y: (-_v.y * 0.5 + 0.5) * innerHeight };
  }

  // ------------------------------------------------------------------ 2. Shadow's lines (docs/QUESTS.md §2)
  /** the words a line fills in */
  lineCtx(q, d, s) {
    const G = this.G, D = G.mode === 'dungeon' ? G.dungeon : null;
    return { giver: this.npcName(d.giver), npc: s?.npc ? this.npcName(s.npc) : 'them', item: s?.item ? (QUEST_ITEMS[s.item]?.name || s.item) : 'it', boss: D?.boss?.name || 'the boss' };
  }
  /** queue a beat's line for a quest's current step (once per step and beat: q.sl) */
  queueLine(q, d, s, beat, ttl = 20) {
    if (!q || !d || d.request || !s) return;
    const k = `${q.step}|${beat}`;
    q.sl = (q.sl || []).filter(t => t.startsWith(q.step + '|'));
    if (q.sl.includes(k) || this.lineQ.some(e => e.q === q && e.k === k)) return;
    const text = lineFor(d, q, s, beat, this.lineCtx(q, d, s)); if (!text) return;
    this.lineQ.push({ q, d, s, beat, k, text, until: performance.now() + ttl * 1000, step: q.step, at: this.spot() });
  }
  /** why Shadow can't say a line now (null: he can): never in a fight, never over a guide, a dialogue, a banner, a card,
   *  a panel or someone else's tip */
  lineWhy() {
    const G = this.G, ui = G.ui, P = G.player;
    if (!ui?.ready || G.titleActive || G.playerDead) return 'busy';
    if (ui.iris?.active || G.leavingDungeon) return 'transition';
    if (ui.dlg?.active) return 'dialogue';
    if (this.open || ui.anyModal?.() || ui.tutorial?.offering || this.cardPending) return 'panel';
    if (this.fight()) return 'fight';
    if (ui.banners?.busy) return 'banner';
    if (G.tutorials?.busy) return 'guide';
    if (ui.toasts?.busy || shadowTalking(ui)) return 'tip';
    if (G.build?.active || G.buildMode || G.housing?.decor?.active || G.decorFocus) return 'build';
    if (G.introFocus || G.cutscene || G.heroSwitching || G.heroFocus || P?.controlLocked) return 'scene';
    if (G.life?.fishing?.s || G.cozy?.scav?.busy || G.cozy?.scav?.session) return 'busy';
    if (performance.now() < this.lineGap) return 'gap';
    return null;
  }
  /** where you are, for a line that belongs to its place: the mode, and the zone or the dungeon floor */
  spot() { const G = this.G, D = G.mode === 'dungeon' ? G.dungeon : null; return D ? (D.kind === 'region' ? `zone:${D.zoneId}` : `dun:${D.def?.id}:${D.floor}`) : G.mode; }
  /** the beats the place gives now (polled): the door, a find's or a rescue's mark, the boss in sight, the way home */
  lineTick() {
    const G = this.G, P = G.player; if (!P || !G.story) return;
    const D = G.mode === 'dungeon' ? G.dungeon : null;
    for (const q of this.Q.active) {
      const d = this.def(q.id); if (!d || d.request) continue;
      const s = G.story.stepOf(q, d); if (!s) continue;
      const a = stepArea(s);
      // the door: the Burrow's (the village), a zone dungeon's gate (its zone), with the step's dungeon ahead
      if (a?.kind === 'dungeon') {
        const door = G.mode === 'village' && isBurrow(a.dungeon) ? LANDMARKS.dungeon : D?.kind === 'region' && DUNGEONS[a.dungeon]?.zone === D.zoneId ? D.gatePos : null;
        if (door && Math.hypot(P.pos.x - door.x, P.pos.z - door.z) < DOOR_R) this.queueLine(q, d, s, 'door', 16);
      }
      if (D && D.kind !== 'region') {
        // by a find's or a rescue's mark on its floor
        if ((s.type === 'find' || s.type === 'rescue') && (!s.dungeon || s.dungeon === D.def?.id) && (s.floor ?? 1) === D.floor) {
          const m = D.questMark?.(s); if (m && Math.hypot(P.pos.x - m.x, P.pos.z - m.z) < NEAR_R) this.queueLine(q, d, s, 'near', 8);
        }
        // the boss in sight, before the fight
        const b = D.boss;
        if ((s.type === 'boss' || s.type === 'tier') && b?.alive && !b.aggro && !b.introDone) {
          const bd = Math.hypot(P.pos.x - b.pos.x, P.pos.z - b.pos.z);
          if (bd < BOSS_NEAR || (bd < BOSS_R && this.inView(b.pos))) this.queueLine(q, d, s, 'boss', 6); // ("I can see his crown": on the screen, or close)
        }
      }
      // the way home: the objective done (yours, not a crew's: they did it, and Shadow wasn't there)
      if (s.type === 'talk' && s.npc === d.giver && (q.handIn || q.step === d.steps.length - 1) && q.step > 0 && d.giver !== G.state.activeHero) { // (you play the giver: their own scene, arrivals.js, no way home)
        const lastObj = q.handIn ? d.steps.length - 1 : q.step - 1;
        if (!q.crewSteps?.includes(lastObj)) this.queueLine(q, d, s, 'home', 600);
      }
    }
    // a fight: his line steps aside at once, as his tips do (never in a fight)
    if (this.fight()) for (const t of G.ui?.toasts?.live || []) if (!t._dying && this.said.some(x => t._key === `${x[3]}|Shadow`)) G.ui.toasts.kill(t, true);
    // say the first that's still true, when it can be said; drop the ones whose moment passed
    const now = performance.now();
    // (a place's line stays where it was due: the door's isn't said on the floor below; the way home goes anywhere)
    this.lineQ = this.lineQ.filter(e => now < e.until && this.live(e.q.id) && e.q.step === e.step && (e.beat === 'home' || e.at === this.spot()) && !(e.beat === 'boss' && this.fight()));
    if (!this.lineQ.length) return;
    const w = this.lineWhy(); this.stats.lineWhy = w; if (w) return;
    const e = this.lineQ.shift();
    this.say(e);
  }
  /** Shadow says it: his tip card (his face, his blue, "Shadow"), a bark and a little emote over him */
  say(e) {
    const G = this.G, ui = G.ui, sh = G.companion;
    e.q.sl = (e.q.sl || []).filter(t => t.startsWith(e.q.step + '|')); e.q.sl.push(e.k);
    const text = heroText(e.text, G.state);
    (ui.toasts?.show ? ui.toasts.show(text, LINE_TOAST(G)) : ui.toast?.(text, LINE_TOAST(G)));
    if (G.lead?.say) G.lead.say(null, e.beat === 'home' ? 'heart' : e.beat === 'boss' ? null : 'sparkle', true); // (his bark and a bark pose: actors/shadowLead.js)
    else if (sh) Events.emit('sfx', 'bark_small', { pos: sh.pos });
    this.lineGap = performance.now() + LINE_GAP * 1000;
    this.stats.lines++; this.said.push([e.q.id, e.step, e.beat, text]); if (this.said.length > 40) this.said.shift();
    Events.emit('quest:line', { quest: e.q.id, step: e.step, beat: e.beat, text });
  }

  // ------------------------------------------------------------------ the debug menu (docs/DEBUG.md: Quests)
  registerDebug() {
    const self = this, act = G => G.state.quests.active.filter(q => self.def(q.id)).map(q => ({ label: self.def(q.id).title, value: q.id }));
    registerDebug('quests', [
      { group: 'The quest card (UX-2)', label: 'Show the quest card', hint: 'An active quest\'s card, now', closes: true, choices: G => { const a = act(G); return a.length ? a : [{ label: 'Something Squishy', value: 'burrow1' }]; },
        run: (G, id) => { if (!self.def(id)) return 'No such quest'; self.showCard(id, { force: true }); return ''; } },
      { label: 'Cards on accept', toggle: true, get: () => self.cards, run: (G, on) => { self.cards = !!on; return on ? 'Quest cards: on' : 'Quest cards: off (the old banner)'; } },
      { group: 'The place title', label: 'Show a place title here', closes: true, noMark: true, run: G => {
        const w = self.here(), q = G.state.quests.active.find(x => self.def(x.id) && !self.def(x.id).request), d = q && self.def(q.id);
        if (!d) return 'No quest running';
        const s = d.steps[q.step] || d.steps[0], t = self.titleOf(q, d, s, stepArea(s) || { kind: '' }, w);
        G.ui.banner(t.title, t.sub, { style: 'place', kicker: t.kicker, onShow: () => self.sting() }); return ''; } },
      { label: 'Forget the titles shown', hint: 'Each step shows its place titles again', run: G => { for (const q of G.state.quests.active) delete q.tt; return 'Place titles reset'; } },
      { group: "Shadow's lines", label: "Say Shadow's line", hint: "The first running quest's line for a beat, now", choices: LINE_BEATS.map(b => ({ label: b, value: b })), run: (G, beat) => {
        const q = G.state.quests.active.find(x => self.def(x.id) && !self.def(x.id).request), d = q && self.def(q.id); if (!d) return 'No quest running';
        const s = G.story.stepOf(q, d) || d.steps[0], text = lineFor(d, q, s, beat, self.lineCtx(q, d, s)); if (!text) return 'No line for that';
        self.say({ q, d, s, beat, k: `${q.step}|${beat}`, text, step: q.step }); return ''; } },
      { label: "Forget Shadow's lines", hint: 'He says each again at its place', run: G => { for (const q of G.state.quests.active) delete q.sl; self.lineQ = []; return "Shadow's lines reset"; } },
      { group: 'The hand-in', label: 'Finish this step', hint: 'The running quest moves on (its last step: the hand-in waits)', choices: G => act(G), run: (G, id) => {
        const q = G.state.quests.active.find(x => x.id === id), d = q && self.def(id); if (!d) return 'Not running';
        if (q.handIn || q.step >= d.steps.length) return 'Waiting for its hand-in';
        G.story.completeStep(id, q.step); const n = G.state.quests.active.find(x => x.id === id);
        return n?.handIn ? `${d.title}: ${G.story.stepOf(n, d).text}` : n ? `${d.title}: ${d.steps[n.step]?.text}` : `Completed: ${d.title}`; } },
      { label: 'Hand it in now', hint: "The giver's scene (in their village), else straight in", closes: true, choices: G => act(G), run: async (G, id) => {
        const q = G.state.quests.active.find(x => x.id === id), d = q && self.def(id); if (!d) return 'Not running';
        if (!q.handIn && q.step < d.steps.length - 1) { while (G.state.quests.active.includes(q) && !q.handIn && q.step < d.steps.length - 1) G.story.completeStep(id, q.step); }
        if (!q.handIn && d.steps[q.step]?.type !== 'talk') G.story.completeStep(id, q.step);
        const npc = G.mode === 'village' ? G.npcs?.find(n => n.id === d.giver && n.visible !== false) : null;
        if (npc && G.talkTo) { G.talkTo(npc); return ''; }
        const V = G.mode === 'dungeon' && G.dungeon?.kind === 'region' ? G.dungeon.village : null, zv = V?.villager?.(d.giver); // (a zone villager, in their village)
        if (zv && V.talk) { V.talk(zv); return ''; }
        G.story.handIn(id); return `Handed in: ${d.title}`; } },
    ], { title: 'Quests', icon: 'scroll', order: 25, note: "Quests as moments (ROADMAP UX-2, docs/QUESTS.md): the card, the place titles, Shadow's lines, the hand-in." });
  }
}
