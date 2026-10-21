// The heroes arrive in Blossom Hollow (ROADMAP Z-H3; docs/ZONES.md §3.1, docs/HEROES.md §6). HeroManager owns one Arrivals
// (G.arrivals) and calls update(dt) every frame; the rules and the quests are data in world/heroQuests.js.
//
// When a zone opens and the arrival before it is done, its arrival is due. The next calm moment in town (no dialogue,
// panel, banner, card, guide, scene, build mode, fishing or dig; a few seconds of it) its island scene starts
// (the scene registered for entry.scene: actors/poeJoin.js, shihtzuJoin.js, stellaJoin.js, goldenJoin.js), plays its gag,
// asks for help, joins the hero (heroes.js joinPoe…) and calls finished(): the arrival is recorded
// (state.flags.arrivals[zone] = { how, quest, day, by }) and the zone's main story quest starts with its card. A scene that's interrupted before its locked part (leaving town, a hero switch,
// a knock-out) drops itself; the arrival is due again a little later.
//   - The village saved before they came (a crew, an old save): the scene's plea becomes a thank-you and no quest starts.
//   - A hero who joined some other way (an old save's zone scene, ?hero=, the debug menu): no arrival; their quest starts
//     quietly with its card while their village still needs saving (questsOwed).
//   - A crew saves the village while the quest runs: its record names the crew (the giver's line at the hand-in).
//   - The hand-in is the giver's: talk to them in town (heroes.js talk), or, when you're playing them, their own little
//     scene at the next calm moment wherever you are (selfHandIn: the hop, their line to Shadow, the reward, the stamp).
//     Away on an expedition, it waits until they're home.
// The QA's quiet sessions (?nointro without ?arrive, or ?noarrive; remembered for the tab, as the guides' and the cards')
// keep the arrivals off, so the flows that set heroes' flags by hand never meet one. The hand-ins work in every session.
import { Events } from '../core/events.js';
import { CLASSES } from '../rpg/classes.js';
import { regionUnlocked } from '../regions/index.js';
import { ARRIVALS, arrivalOf, arrivalDue, arrivalDone, arrivalRec, questPlan, questsOwed, arrivalHint, heroQuestDef, heroQuestOf, whoName } from '../world/heroQuests.js';
import { memberInfo } from '../cozy/expeditions.js';
import { registerDebug } from '../debug/registry.js';

const CALM_S = 2.5;     // s of calm in town before an arrival starts
const RETRY_S = 10;     // s after an interrupted scene before it is due again
const SELF_CALM = 1.2;  // s of calm before a hand-in to the hero you play

export class Arrivals {
  constructor(G, H, { enabled = true } = {}) {
    this.G = G; this.H = H; this.enabled = enabled;
    this.scenes = {};     // scene id → its island scene: { start(entry, plan), update(dt), reset(), state, busy, active }
    this.cur = null;      // { a, plan } while a scene plays
    this.calmT = 0; this.coolT = 0; this.selfT = 0; this.owedT = 0;
    this.stats = { why: null, started: 0, finished: 0, owed: 0, self: 0, last: null };
    Events.on('village:saved', e => this.onSaved(e));
    Events.on('mode:changed', () => { this.calmT = 0; this.selfT = 0; });
    this.registerDebug();
  }
  register(id, scene) { this.scenes[id] = scene; return scene; }
  get st() { return this.G.state; }
  opened = z => regionUnlocked(this.st, z).ok;
  /** an arrival's scene is on (Shadow's tips and the guides wait for it) */
  get active() { return !!this.cur || Object.values(this.scenes).some(s => s.active); }
  /** a scene's locked part (the save waits: core/autosave.js) */
  get busy() { return Object.values(this.scenes).some(s => s.busy); }
  /** the arrival due now (its scene built), or null */
  due() { return arrivalDue(this.st, { opened: this.opened, scenes: this.scenes }); }
  /** the hero wheel's line for a hero not met yet (heroes.js roster) */
  hintFor(id) { const a = arrivalOf(id); return arrivalHint(this.st, id, { opened: this.opened, inTown: this.G.mode === 'village', running: !!this.cur && this.cur.a.who === id && this.scenes[a?.scene]?.state !== 'wait' }); }
  /** why an arrival can't start now (null: it can) */
  why() {
    const G = this.G, ui = G.ui, P = G.player;
    if (!ui?.ready || G.titleActive || G.playerDead || !P) return 'busy';
    if (G.mode !== 'village') return 'away';
    if (ui.iris?.active || G.leavingDungeon) return 'transition';
    if (ui.dlg?.active) return 'dialogue';
    if (ui.anyModal?.() || ui.tutorial?.offering) return 'panel';
    if (ui.banners?.busy) return 'banner';
    if (G.questMoments?.cardPending || G.questMoments?.handing) return 'card';
    if (G.tutorials?.busy) return 'guide';
    if (G.build?.active || G.buildMode || G.housing?.decor?.active || G.decorFocus) return 'build';
    if (G.introFocus || G.cutscene || G.heroSwitching || G.heroFocus || P.controlLocked || G.introJoinPending) return 'scene';
    if (G.life?.fishing?.s || G.cozy?.scav?.busy || G.cozy?.scav?.session) return 'busy';
    if (this.st.quests?.active?.some(q => q.id === 'welcome')) return 'welcome'; // (Rosie's welcome comes first)
    return null;
  }
  update(dt) {
    const G = this.G;
    for (const s of Object.values(this.scenes)) s.update(dt);
    if (this.cur && this.scenes[this.cur.a.scene]?.state === 'off') { this.cur = null; this.coolT = RETRY_S; } // (dropped before its end)
    this.selfTick(dt);
    if (!this.enabled || G.mode !== 'village' || G.titleActive) { this.calmT = 0; return; }
    if (this.cur) return;
    this.coolT = Math.max(0, this.coolT - dt);
    const w = this.why(); this.stats.why = w;
    if (w) { this.calmT = 0; return; }
    this.calmT += dt;
    if (this.calmT < CALM_S || this.coolT > 0) return;
    // a hero who joined some other way: their quest, quietly (the card), while their village still needs saving
    if ((this.owedT -= dt) <= 0) { this.owedT = 2; for (const a of questsOwed(this.st, { opened: this.opened })) { this.startQuest(a, 'owed'); this.calmT = 0; return; } }
    const a = this.due(); if (!a) return;
    this.begin(a);
  }
  /** start an arrival's scene now (the debug menu passes force: whatever the rules say) */
  begin(a, { force = false } = {}) {
    const sc = this.scenes[a.scene]; if (!sc) return false;
    if (!force && arrivalDone(this.st, a)) return false;
    const plan = questPlan(this.st, a);
    this.cur = { a, plan }; this.calmT = 0;
    this.stats.started++; this.stats.last = { zone: a.zone, who: a.who, plan };
    sc.start(a, plan);
    Events.emit('arrival:start', { zone: a.zone, who: a.who, plan });
    return true;
  }
  /** the scene is over (the hero has joined, or the messenger has asked): record it (by: who came; extra: the scene's own
   *  notes, Stella's keeps Kaizo's old record) and start the quest */
  finished(who, extra = null) {
    const a = arrivalOf(who) || this.cur?.a; if (!a) return;
    const plan = this.cur?.a === a ? this.cur.plan : questPlan(this.st, a);
    (this.st.flags.arrivals ||= {})[a.zone] = { how: 'scene', quest: plan, day: this.G.day?.day || 1, by: a.who, ...(extra || {}) };
    this.cur = null; this.coolT = 4; this.stats.finished++;
    if (plan === 'start') this.startQuest(a, 'arrival');
    Events.emit('arrival:done', { zone: a.zone, who: a.who, plan });
    this.G.save?.();
  }
  startQuest(a, how) {
    const S = this.G.story; if (!S || questPlan(this.st, a) !== 'start') return false;
    if (how === 'owed') this.stats.owed++;
    S.start(a.quest); // (not silent: its card on the next calm moment, world/questMoments.js)
    if (how === 'owed') (this.st.flags.arrivals ||= {})[a.zone] ||= { how: 'old', quest: 'start', day: this.G.day?.day || 1, by: a.who };
    Events.emit('arrival:quest', { zone: a.zone, quest: a.quest, how });
    return true;
  }
  /** the dialogue lines a scene says when the village was already saved: by you, or by a crew */
  savedBy(zone) { return this.st.zones?.[zone]?.savedBy === 'crew' ? 'crew' : 'hero'; }

  // ------------------------------------------------------------------ the crews (docs/COZY.md §3.2)
  /** a crew relieved a village whose hero quest is running: its record names them, so the giver's hand-in has their line
   *  and Shadow says no way-home line (he wasn't there) */
  onSaved(e) {
    if (!e?.crew) return;
    const id = heroQuestOf(e.zone), q = id && this.st.quests?.active?.find(x => x.id === id); if (!q) return;
    const d = heroQuestDef(this.st, id, q), keys = this.st.zones?.[e.zone]?.celebrateCrew || [];
    const names = keys.map(k => memberInfo(this.st, k)?.name).filter(Boolean);
    const lead = names[0] || 'Your crew';
    q.crewBy = names.length > 1 ? `${lead}'s crew` : lead;
    if (keys.includes(`hero:${d.giver}`)) { const o = keys.filter(k => k !== `hero:${d.giver}`).map(k => memberInfo(this.st, k)?.name).filter(Boolean); q.crewWith = o.length <= 1 ? o[0] || '' : `${o.slice(0, -1).join(', ')} and ${o[o.length - 1]}`; }
    q.crewSteps = d.steps.map((s, i) => i); // (every step: the crew went, and saved it)
  }

  // ------------------------------------------------------------------ the hand-in when you play the giver
  /** a hero quest waiting for its hand-in whose giver is the hero you're playing → its record, or null */
  selfDue() {
    const act = this.st.activeHero || 'chewy';
    for (const q of this.st.quests?.active || []) { const d = heroQuestDef(this.st, q.id, q); if (d && q.handIn && d.giver === act) return q; }
    return null;
  }
  selfTick(dt) {
    const G = this.G, q = this.selfDue();
    if (!q || this.selfBusy || this.H.switching) { this.selfT = 0; return; }
    const w = G.questMoments?.why?.() || (G.questMoments?.handing ? 'handing' : null) || (G.ui?.dlg?.active ? 'dialogue' : null);
    if (w) { this.selfT = 0; return; }
    if ((this.selfT += dt) >= SELF_CALM) { this.selfT = 0; this.selfHandIn(q); }
  }
  /** a benched hero whose homeland quest waits for its hand-in (the one at home in the cottage: home/housing.js
   *  hostBenched), or null */
  handInGiver() {
    const act = this.st.activeHero || 'chewy';
    for (const q of this.st.quests?.active || []) { const d = heroQuestDef(this.st, q.id, q); if (d && q.handIn && d.giver !== act && this.H.villagers[d.giver]) return d.giver; }
    return null;
  }
  /** their happy hop and hearts, their line to Shadow, the reward from their paws and the stamp */
  async selfHandIn(q) {
    const G = this.G, P = G.player, d = heroQuestDef(this.st, q.id, q), sh = G.companion; if (!P || !d || !G.questMoments?.handInScene) return;
    this.selfBusy = true; this.stats.self++;
    P.controlLocked = true; P.moveTarget = null; G.skills?.charge?.cancel?.('scene', true);
    try {
      if (sh) { P.faceTo(sh.pos.x, sh.pos.z); sh.faceTo?.(P.pos.x, P.pos.z); G.vfx?.emote?.(sh, 'heart', 1.6); }
      const name = this.H.name(d.giver), portrait = G.portrait?.(d.giver);
      const say = lines => G.ui.dialogue({ speaker: name, portrait, lines });
      await G.questMoments.handInScene(P, [{ q, d }], say, { self: true });
    } finally { P.controlLocked = false; this.selfBusy = false; }
  }

  // ------------------------------------------------------------------ the maps and the pointer
  /** the arriving hero or messenger, while in town, as the maps' People entries (world/mapData.js) */
  people() {
    const out = [];
    for (const [id, sc] of Object.entries(this.scenes)) { const e = sc.person?.(); if (e) out.push({ ...e, scene: id }); }
    return out;
  }
  /** where to look for an arrival that waits at its spot (the pointer: game.js questTarget) → { pos, label, kind } | null */
  target() {
    if (this.G.mode !== 'village') return null;
    for (const sc of Object.values(this.scenes)) { const t = sc.target?.(); if (t) return t; }
    return null;
  }

  // ------------------------------------------------------------------ the debug menu (docs/DEBUG.md: Heroes)
  registerDebug() {
    const self = this, label = a => (a.hero ? CLASSES[a.who]?.name : whoName(a)) || a.who;
    registerDebug('heroes', [
      { group: 'Arrivals (Z-H3)', label: 'Play an arrival', hint: 'In Blossom Hollow, now: the hero (or messenger) comes again, their quest starts again', closes: true,
        choices: () => ARRIVALS.filter(a => self.scenes[a.scene]).map(a => ({ label: label(a), value: a.who })),
        run: (G, who) => {
          const a = arrivalOf(who); if (!a || !self.scenes[a.scene]) return 'Not built yet';
          if (G.mode !== 'village') return 'Go back to Blossom Hollow first';
          if (self.cur) { self.scenes[self.cur.a.scene]?.reset?.(true); self.cur = null; }
          self.forget(a); self.begin(a, { force: true }); return `${label(a)} is on the way…`;
        } },
      { label: 'Reset the arrivals', confirm: true, hint: 'Every arrival hero not joined, their quests forgotten: they come again', run: G => {
        if (self.cur) { self.scenes[self.cur.a.scene]?.reset?.(true); self.cur = null; }
        for (const a of ARRIVALS) self.forget(a);
        self.coolT = 0; return 'The arrivals will play again';
      } },
      { label: 'Arrivals on', toggle: true, hint: 'Off in the QA\'s quiet sessions', get: () => self.enabled, run: (G, on) => { self.enabled = !!on; return on ? 'Arrivals: on' : 'Arrivals: off'; } },
    ], { title: 'Heroes', icon: 'paw', order: 10 });
  }
  /** an arrival undone: the hero not joined (their villager gone), the record and their quest forgotten */
  forget(a) {
    const G = this.G, st = this.st;
    if (a.hero && a.who !== 'chewy') {
      if (st.activeHero === a.who) return; // (you're playing them: leave them be)
      st.flags[`${a.who}Joined`] = false;
      if (this.H.villagers[a.who]) this.H.removeVillager(a.who);
    }
    if (st.flags.arrivals) delete st.flags.arrivals[a.zone];
    const Q = st.quests; Q.active = Q.active.filter(q => q.id !== a.quest); Q.done = Q.done.filter(id => id !== a.quest); if (Q.cards) Q.cards = Q.cards.filter(id => id !== a.quest);
    Events.emit('quest:update');
    void G;
  }
}
/** the quiet QA sessions (?nointro without ?arrive, or ?noarrive): remembered for the tab, like the guides and the cards */
export function arrivalsOn(params) {
  let off = params.has('noarrive') || (params.has('nointro') && !params.has('arrive'));
  try { if (params.has('arrive')) sessionStorage.removeItem('chewy3d.noarrive'); else if (off) sessionStorage.setItem('chewy3d.noarrive', '1'); else off = !!sessionStorage.getItem('chewy3d.noarrive'); } catch (e) { /* storage unavailable */ }
  return !off;
}
