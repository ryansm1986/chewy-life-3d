// The cozy path's runtime (docs/COZY.md §4, §12; ROADMAP CZ-1, CZ-2): the world clock's ticks and time away, the
// expeditions on the road, their return and its world effects, the away heroes' comings and goings, and the Cozy debug
// section. The decisions are the pure modules' (cozy/clock.js, state.js, objectives.js, expeditions.js).
//
//   installCozy(G, village) → G.cozy = {
//     clock: { h, day, add(h) },
//     exp: { send(objId, crew, supplies), cancel(uid), list(), reports(), objectives(view), info(objId, crew, supplies),
//            read(uid), take(uid), unread(), finishAll() },
//     guild: null, scav: null,                     // phases D and C
//     tick(dt), heroAway(id), awayInfo(id), pulse(now?), awayNow(), board,
//   }
//   game.js calls G.cozy.tick(dt) every frame (dt is 0 while paused: the clock stops like the day clock); services.js's
//   sleep adds the hours it skips (G.cozy.clock.add).
//   Events: 'expedition:sent' { uid, obj, crew }, 'expedition:back' { uid, obj, result }, 'cozy:changed' (the board,
//   the chip), 'hero:away' { id, away }.
//   The story side (COZY §3, §12; CZ-9): G.story.crewObjectives(state) lists the story's crew routes (world/story.js);
//   a quest route completes its fight steps through G.story.crewResult (a boss's quest unique waits for your own win);
//   a siege relief saves the village through rpg/zones.js saveVillage(…, 'crew') and 'village:saved' { crew: true },
//   and leaves zones[z].celebrate (with the crew's names) for the next arrival (regions/village/village.js plays it);
//   a dungeon clear counts dungeon.crew, opens the next zone, wakes the Lantern (rpg/zones.js recordCrewClear, the
//   Deep Burrow's on Tamamo) and fires 'dungeon:cleared' / 'tier:unlocked' with crew: true. A full success brings the
//   boss's or the captain's trophy (furniture). "You beat us to it!" (COZY §4.9) for every kind: a quest step, a clear or
//   a save you finished first brings the crew home early.
import * as THREE from 'three';
import { Events } from '../core/events.js';
import { mulberry32 } from '../core/util.js';
import { registerDebug } from '../debug/registry.js';
import { generateItem } from '../rpg/items.js';
import { CLASSES, HERO_IDS } from '../rpg/classes.js';
import { zoneOf, saveVillage, recordCrewClear, noteFloor } from '../rpg/zones.js';
import { zoneUnlockOnClear } from '../rpg/zoneProgress.js';
import { REGIONS } from '../regions/index.js';
import { DUNGEONS, ZONE_DUNGEON } from '../dungeon/defs.js';
import { MONSTERS } from '../dungeon/monsters.js';
import { pickFind } from '../home/finds.js';
import { VILLAGES, ZONE_NPCS } from '../regions/village/data.js';
import { tickClock, addHours, catchUp, markWall, worldDay, backIn, backBy, aboutHours, SECS_PER_HOUR, OFFLINE_CAP_H } from './clock.js';
import { normalizeCozy, cozyOf, expOf, heroAway, heroKey, parseMember, unreadReports, tiredLeft, memberAway } from './state.js';
import { objective, storyObjectives, villageObjectives, errandsFor, objectivePower, reliefOpen, objectiveOpen } from './objectives.js';
import { ZONE_QUESTS, questItemName } from '../world/zoneQuests.js';
import { canSend, resolve, partialProgress, rollLoot, xpFor, crewLines, startExpedition, finishExpedition, hoursLeft, brokenExpeditions, memberInfo, pickMeals, mealsNeeded, heroPower, tripHours, crewSoft, crewHaul, mealsPacked } from './expeditions.js';
import { guildState, hireOf, hireReturn, porterMats } from './guild.js';
import { addExpeditionBoard } from './expeditionBoard.js';

const GAP_MS = 5000; // a frame loop that stalls this long (a hidden tab, a frozen window) counts as time away

export function installCozy(G, village) {
  const run = new CozyRun(G, village);
  return run;
}

class CozyRun {
  constructor(G, village) {
    this.G = G; this.village = village;
    normalizeCozy(G.state);
    this.checkT = 0; this.away = null; this.cardShown = false; this.boardMarkT = 0;
    const self = this;
    G.cozy = {
      clock: { get h() { return cozyOf(G.state).clock.h; }, get day() { return worldDay(cozyOf(G.state).clock.h); }, add: h => self.addHours(h) },
      exp: {
        send: (id, crew, supplies) => self.send(id, crew, supplies),
        cancel: uid => self.recall(uid),
        list: () => expOf(G.state).active,
        reports: () => expOf(G.state).reports,
        objectives: view => self.objectives(view),
        info: (id, crew, supplies) => self.info(id, crew, supplies),
        read: uid => self.read(uid),
        take: uid => self.takeItems(uid),
        unread: () => unreadReports(G.state),
        finishAll: () => self.finishAll(),
        town: () => self.town(),
        left: e => hoursLeft(G.state, e),
        objective: id => objective(G.state, id),
        pickMeals: n => pickMeals(G.state.pantry, n),
        mealsNeeded: (o, crew) => mealsNeeded(o, crew),
        members: () => self.members(),
        tripHours: (o, crew) => tripHours(o, crew || [], G.state), // (a Scout in the crew: 15% off)
      },
      guild: null, scav: null,
      tick: dt => self.tick(dt),
      pulse: now => self.pulse(now),
      heroAway: id => heroAway(G.state, id),
      awayInfo: id => self.awayInfo(id),
      awayNow: () => self.away,
      showAway: () => self.showAwayCard(true),
    };
    // the story's crew routes (COZY §12): the Board's Story tab; CZ-9's reroute replaces this with its own
    if (G.story && !G.story.crewObjectives) G.story.crewObjectives = st => storyObjectives(st);
    // time away since the last run (an old save: none, and the mark is set now)
    const a = catchUp(G.state, Date.now());
    if (a.hours > 0 || a.backwards) this.away = { ...a, load: true, returned: [], fresh: true };
    this.audit();
    Events.on('village:saved', e => { if (!e?.crew) this.beaten(e?.zone); });
    // you finished a quest step or a dungeon clear first (COZY §4.9): looked at on the next tick, never inside the change
    Events.on('quest:update', () => { this.beatT = 0.25; });
    Events.on('dungeon:cleared', e => { if (!e?.crew) this.beatT = 0.25; });
    Events.on('mode:changed', e => this.onMode(e));
    Events.on('meal:eaten', () => this.cure(heroKey(G.state.activeHero), 'A good meal: rested again!'));
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') this.pulse(); });
    this.board = addExpeditionBoard(G, village);
    G.cozy.board = this.board;
    this.registerDebug();
  }
  get st() { return this.G.state; }
  changed() { Events.emit('cozy:changed'); }
  addHours(h) { addHours(this.st, h); this.check(); this.changed(); return cozyOf(this.st).clock.h; }

  // ------------------------------------------------------------------ the clock and time away
  /** the wall-clock mark, every frame: a stall longer than GAP_MS (the tab was hidden) counts as time away */
  pulse(now = Date.now()) {
    const c = cozyOf(this.st).clock;
    if (c.wall > 0 && now - c.wall > GAP_MS) {
      const a = catchUp(this.st, now);
      if (a.hours > 0) {
        const A = this.away && !this.away.shown ? this.away : null;
        this.away = A ? { ...A, ms: A.ms + a.ms, raw: A.raw + a.raw, hours: A.hours + a.hours, capped: A.capped || a.capped } : { ...a, load: false, returned: [], fresh: true };
        this.check(true);
        this.changed();
      }
      return a;
    }
    markWall(this.st, now);
    return null;
  }
  tick(dt) {
    const G = this.G;
    this.pulse();
    if (dt > 0) tickClock(this.st, dt);
    if (G.titleActive) return;
    if ((this.checkT -= dt) <= 0 && dt > 0) { this.checkT = 0.5; this.check(); }
    if (this.away && !this.away.shown) this.maybeAwayCard();
    if (this.beatT > 0 && (this.beatT -= Math.max(dt, 1 / 60)) <= 0) this.beatenAll();
    if ((this.boardMarkT -= Math.max(dt, 1 / 60)) <= 0) { this.boardMarkT = 0.4; this.board?.setMark?.(this.boardMark()); }
    this.board?.update?.(dt);
  }
  boardMark() { const E = expOf(this.st); return unreadReports(this.st) ? '!' : E.active.length ? 'busy' : null; }
  /** crews whose time is up come home (quiet: they came home while you were away: the card tells it) */
  check(quiet = false) {
    const E = expOf(this.st);
    if (this.G.titleActive) return;
    const q = quiet || !!(this.away && !this.away.shown);
    for (const e of [...E.active]) {
      if (hoursLeft(this.st, e) > 0) continue;
      const o = objective(this.st, e.obj);
      if (o?.kind === 'siege' && this.inZone(o.binds.village)) { // the hold rule (COZY §4.5): it waits until you leave the zone
        if (!e.hold) { e.hold = true; this.G.ui?.toast?.(`Your crew is camped at the edge of ${VILLAGES[o.binds.village]?.name || 'the village'}. They'll move in when you step back.`, { icon: 'map', color: '#ffd8a8', duration: 6 }); this.changed(); }
        continue;
      }
      this.complete(e, o, null, q);
    }
  }
  inZone(zone) { const D = this.G.mode === 'dungeon' ? this.G.dungeon : null; return !!D && D.kind === 'region' && D.zoneId === zone; }

  // ------------------------------------------------------------------ the board's lists
  town() {
    const S = this.G.sim?.stats || {}, built = {};
    for (const b of this.st.village?.buildings || []) built[b.type] = (built[b.type] || 0) + 1;
    return { rank: S.rank || 1, pop: S.population || 0, built, guild: this.st.cozy?.guild?.level || 0 };
  }
  objectives(view) {
    const st = this.st;
    if (view === 'story') return (this.G.story?.crewObjectives?.(st) || storyObjectives(st)).filter(o => !this.sentOn(o.id));
    if (view === 'village') return (this.G.story?.villageObjectives?.(st) || villageObjectives(st)).filter(o => !this.sentOn(o.id)); // (the zone villagers' quests: COZY §3.2)
    if (view === 'errands') { const E = expOf(st), day = worldDay(cozyOf(st).clock.h); return errandsFor(st, day).filter(o => !(E.errands.day === day && E.errands.taken.includes(o.id)) && !this.sentOn(o.id)); }
    return [];
  }
  sentOn(id) { return expOf(this.st).active.some(e => e.obj === id); }
  /** the crew cards: every joined hero (the one being played and the away ones included, with why they can't go) */
  members() {
    const st = this.st, out = [];
    for (const id of HERO_IDS) {
      if (id !== 'chewy' && !st.flags?.[`${id}Joined`]) continue;
      const key = heroKey(id), info = memberInfo(st, key);
      const away = heroAway(st, id), tired = tiredLeft(st, key);
      out.push({ ...info, active: id === st.activeHero, away: away ? { obj: away.name, left: hoursLeft(st, away) } : null, tired });
    }
    for (const H of guildState(st).hires) { // the Guild's hires (phase D, cozy/guild.js): after the heroes
      const key = `hire:${H.id}`, info = memberInfo(st, key); if (!info) continue;
      const away = memberAway(st, key);
      out.push({ ...info, active: false, away: away ? { obj: away.name, left: hoursLeft(st, away) } : null, tired: tiredLeft(st, key), onBreak: !!H.onBreak });
    }
    return out;
  }
  info(id, crew = [], supplies = {}) {
    const o = objective(this.st, id); if (!o) return null;
    return { o, ...canSend(this.st, o, crew, supplies, this.town()) };
  }
  awayInfo(id) {
    const e = heroAway(this.st, id); if (!e) return null;
    const left = hoursLeft(this.st, e);
    return { uid: e.uid, obj: e.name, left, label: e.hold ? 'Camped by the village' : backIn(left) };
  }

  // ------------------------------------------------------------------ send
  send(id, crew = [], supplies = {}) {
    const G = this.G, st = this.st, o = objective(st, id);
    if (!o || !objectiveOpen(st, o) || this.sentOn(id)) return { ok: false, why: 'That job is taken' };
    const sup = { meals: { ...(supplies.meals || {}) }, potions: Math.max(0, Math.min(3, supplies.potions || 0, st.potions?.heart || 0)) };
    const chk = canSend(st, o, crew, sup, this.town());
    if (!chk.ok) { Events.emit('sfx', 'ui_error'); return chk; }
    // the supplies are spent now (they ate the lunches, whatever happens); nothing on a hero is ever at risk
    if (Object.keys(sup.meals).length && !G.actions.spendPantry(sup.meals, { quiet: true, src: 'expedition' })) return { ok: false, why: 'The lunches went missing!' };
    if (sup.potions > 0) { st.potions.heart -= sup.potions; Events.emit('potions:changed', st.potions); }
    const frac = o.power > 0 ? Math.min(1, chk.need / o.power) : 1;
    const e = startExpedition(st, o, crew, sup, { r: chk.r, need: chk.need, power: chk.power, odds: chk.odds.key, p: chk.odds.p, lunch: !!chk.odds.lunch || chk.meals.have >= crew.length, hours: tripHours(o, crew, st), seed: (Math.random() * 2 ** 32) >>> 0, frac });
    e.place = { label: o.place.label, color: o.place.color, area: o.place.area };
    for (const k of crew) { const m = parseMember(k); if (m?.type === 'hero') this.leaveTown(m.id); }
    const names = this.crewNames(crew);
    G.ui?.toast?.(`${names} set${crew.length > 1 ? '' : 's'} off: ${o.name}`, { icon: 'map', color: '#8fd0ff', sub: `A trip of ${aboutHours(e.hours)} · ${backBy(G.day?.hour ?? 12, e.hours)}` });
    Events.emit('sfx', 'ui_quest');
    Events.emit('expedition:sent', { uid: e.uid, obj: e.obj, crew: [...crew] });
    for (const k of crew) { const m = parseMember(k); if (m?.type === 'hero') Events.emit('hero:away', { id: m.id, away: true }); }
    G.save?.();
    this.changed();
    return { ok: true, e };
  }
  crewNames(crew) {
    const n = crew.map(k => memberInfo(this.st, k)?.name || '?');
    return n.length <= 1 ? n[0] || '' : `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`;
  }
  /** a hero sets off: in town they walk off toward the Wayfarer's Post and are gone */
  leaveTown(id) {
    const G = this.G, H = G.heroes, v = H?.villagers?.[id];
    if (!v) return;
    const L = G.village?.world?.landmarks?.travel || null;
    const near = L && Math.hypot(v.pos.x - L.x, v.pos.z - L.z) < 24; // (from across town they just head off: no long walk)
    if (G.mode === 'village' && v.visible && near && v.state !== 'inside') {
      v.frozen = true; v.talking = false; v.leaving = true;
      v.anim?.play?.('wave');
      v.scriptWalk = { x: L.x - 1.2, z: L.z + 0.4, speed: 1.8, t: 0, done: () => { if (!v.leaving) return; G.vfx?.poof?.(v.pos.clone().setY(v.pos.y + 0.6), { color: '#f2e6cc', n: 8, size: 0.4 }); H.removeVillager(id); } };
    } else H.removeVillager(id);
  }
  /** a hero is back: in town they walk in from the Wayfarer's Post and wave */
  walkIn(id) {
    const G = this.G, H = G.heroes;
    if (!H || id === this.st.activeHero || G.mode !== 'village') return;
    const v0 = H.villagers?.[id];
    if (v0) { if (v0.leaving) { v0.leaving = false; v0.scriptWalk = null; v0.frozen = false; v0.state = 'idle'; v0.t = 2; v0.anim?.play?.('wave'); G.vfx?.emote?.(v0, 'heart', 2); } return; } // (back before they'd even left town)
    const L = G.village?.world?.landmarks?.travel; if (!L) { H.spawnBench?.(); return; }
    const k = Object.keys(H.villagers).length % 3;
    const v = H.spawnVillager(id, L.x + 1.2 + k * 0.5, L.z + 1.4 - k * 0.3);
    v.warm = true; v.frozen = true;
    v.scriptWalk = { x: L.x + 4.4 + k * 0.8, z: L.z + 4.8 - k * 0.6, speed: 1.7, t: 0, done: () => { v.frozen = false; v.state = 'idle'; v.t = 2; v.greeted = 20; v.anim?.play?.('wave'); G.vfx?.emote?.(v, 'heart', 2); } };
  }

  // ------------------------------------------------------------------ the return
  /** bring a crew home: forced = 'beaten' | 'recalled' | 'broken' (COZY §4.9, §9), else the roll */
  complete(e, o, forced = null, quiet = false, why = '') {
    const G = this.G, st = this.st, A = G.actions, rng = mulberry32(e.seed || 1);
    let result, progress = null, note = '', r = e.r;
    if (forced === 'broken' || !o) { result = 'partial'; note = why || 'They came home early.'; }
    else if (forced) result = forced;
    else if (!objectiveOpen(st, o)) result = 'beaten'; // (the village was saved while they were out)
    else {
      const needNow = objectivePower(st, o); r = e.power / Math.max(1, Math.min(e.need, needNow)); // (camps you broke meanwhile count: COZY §4.9)
      const res = resolve(r, rng, o, e.lunch, crewSoft(st, e.crew)); // (a Healer turns a setback into a partial)
      result = res.result;
      if (result === 'partial') progress = partialProgress(st, o, r);
    }
    const refund = forced === 'broken' || result === 'beaten' || result === 'recalled' || !o;
    if (refund) {
      for (const [k, n] of Object.entries(e.supplies?.meals || {})) A.addPantry(k, n, { silent: true, src: 'expedition' });
      if (e.supplies?.potions) A.addPotion('heart', e.supplies.potions);
    }
    // the rewards
    const loot = o && forced !== 'broken' ? rollLoot(o, result, rng, e.frac || 1) : { coins: 0, mats: {}, pantry: {}, items: [], find: false };
    if (crewHaul(st, e.crew)) loot.mats = porterMats(loot.mats, true); // (a Porter: +25% materials)
    const xp = {}, levels = {}, fed = mealsPacked(e.supplies?.meals).fed >= e.crew.length;
    for (const k of e.crew) {
      const m = parseMember(k);
      if (m?.type === 'hire' && o && forced !== 'broken') { // a hire: XP on their own curve, morale from the trip (cozy/guild.js)
        const H = hireOf(st, m.id); if (!H) continue;
        const g = hireReturn(st, m.id, { xp: xpFor(o, H.lvl, result, e.frac || 1), result, fed });
        if (g?.gained) xp[k] = g.gained;
        if (g && g.to > g.from) { levels[k] = [g.from, g.to]; Events.emit('hire:levelup', { id: m.id, lvl: g.to, from: g.from }); }
        continue;
      }
      if (m?.type !== 'hero' || !o || forced === 'broken') continue;
      const P = st.heroes?.[m.id]?.player; if (!P) continue;
      const n = xpFor(o, P.lvl, result, e.frac || 1);
      if (n > 0) { const g = A.addXpTo ? A.addXpTo(m.id, n) : { gained: 0 }; xp[k] = g.gained; if (g.lvl > g.from) levels[k] = [g.from, g.lvl]; }
    }
    if (loot.coins) A.addCoins(loot.coins);
    for (const [k, n] of Object.entries(loot.mats)) A.addMaterial(k, n);
    for (const [k, n] of Object.entries(loot.pantry)) A.addPantry(k, n, { src: 'expedition' });
    let furniture = null;
    if (loot.find && o?.rewards?.findWhere) { furniture = pickFind(o.rewards.findWhere, G.sim?.stats?.rank || 1, rng); A.addFurniture?.(furniture, 1, { src: 'expedition' }); }
    const items = loot.items.map(x => generateItem({ ilvl: x.ilvl, rarity: x.rarity, rng }));
    const waiting = items.filter(it => !A.pickup(it));
    // the world: a siege's relief or its broken camps
    let saved = null, story = null, cleared = null, deep = null;
    if (o?.kind === 'siege') {
      if (result === 'success') saved = this.relieve(o.binds.village, e, quiet);
      else if (result === 'partial' && progress?.camps) this.breakCamps(o.binds.village, progress.camps);
    }
    const label = this.crewLabel(e.crew);
    if (o?.binds?.quest && (result === 'success' || result === 'partial')) { // a Blossom Hollow quest's fight (COZY §3.1)
      const at = result === 'partial' ? G.story?.def?.(o.binds.quest)?.steps?.[st.quests.active.find(q => q.id === o.binds.quest)?.step ?? -1] : null;
      story = G.story?.crewResult?.(o.binds.quest, result, { crew: label }) || null;
      if (story && o.boss) story.owed = result === 'success' && !!st.quests.owed?.[o.boss];
      if (result === 'partial') note = at?.type === 'kill' ? 'They chased off half of the yokai. The rest are hiding: you, or another crew, can finish it.' : at?.type === 'floor' ? `They made it down to floor ${o.level}. ${MONSTERS[o.boss]?.name || 'The boss'} is still there, waiting.` : `They found ${MONSTERS[o.boss]?.name || 'the boss'}, but not the way past. Next time!`;
      if (result === 'success' && o.deep) deep = this.wakeDeep();
    }
    if (o?.binds?.zq && (result === 'success' || result === 'partial')) { // a zone villager's quest step (COZY §3.2)
      story = this.zoneQuestResult(o, result, label);
      if (result === 'partial') note = o.step?.type === 'kill' ? 'They chased off half of them. The rest are hiding: you, or another crew, can finish it.' : o.step?.type === 'find' && (o.step.n || 1) > 1 ? 'They found some of them. The rest are still down there.' : 'They found the trail: the next try is a sure thing for a crew as strong.';
    }
    if (o?.binds?.dungeon) { // a zone dungeon's first clear (COZY §3.2)
      if (result === 'success') cleared = this.crewClear(o.binds.dungeon, label);
      else if (result === 'partial') { noteFloor(st, o.binds.dungeon, 2); note = `They made it down to floor 2 of the ${DUNGEONS[o.dungeonId]?.name || 'dungeon'}. The next try needs 30% less.`; }
    }
    if (loot.trophy) A.addFurniture?.(loot.trophy, 1, { src: 'trophy' }); // (a keepsake for your home: COZY §4.6)
    const lines = crewLines(st, e.crew, result === 'recalled' ? 'setback' : result, rng);
    if (result === 'partial' && o?.kind === 'siege' && progress?.camps) note = `${progress.camps} camp${progress.camps > 1 ? 's' : ''} broken. The captain still holds the square.`;
    if (result === 'beaten') note = 'You beat us to it! The lunches are back in the pantry.';
    if (result === 'recalled') note = 'Called home early: no rewards, and the lunches are back in the pantry.';
    const rep = finishExpedition(st, e, o, { result, progress, xp, levels, lines, items: waiting, note, loot: { coins: loot.coins, mats: loot.mats, pantry: loot.pantry, items: items.map(it => ({ name: it.name, rarity: it.rarity, uid: it.uid })), furniture, trophy: loot.trophy || null } });
    if (story) rep.quest = story; // (the story news: the quest done, or what's left; the Journal names the crew)
    if (cleared) rep.cleared = cleared;
    if (deep) rep.deep = deep;
    rep.place = e.place || o?.place || null;
    if (o?.desc && o.kind === 'errand') rep.desc = o.desc; // (the errand's own line, under the report's header)
    if (forced === 'broken') for (const k of e.crew) delete expOf(st).tired[k]; // (no rest after a trip cut short)
    if (saved) rep.saved = saved; // (the news goes in the report: the zone's own banner waits for your arrival there)
    // the crew comes home
    for (const k of e.crew) { const m = parseMember(k); if (m?.type === 'hero') { Events.emit('hero:away', { id: m.id, away: false }); this.walkIn(m.id); } }
    if (this.away && !this.away.shown && quiet) this.away.returned.push(rep.uid);
    else this.announce(rep, e);
    Events.emit('expedition:back', { uid: e.uid, obj: e.obj, result });
    G.save?.();
    this.changed();
    return rep;
  }
  announce(rep, e) {
    const G = this.G, names = this.crewNames(rep.crew), lead = memberInfo(this.st, rep.crew[0])?.name || 'The crew';
    const where = rep.kind === 'errand' ? rep.name.replace(/^[A-Z]/, c => c.toLowerCase()) : rep.place?.label || rep.name;
    const word = { success: 'is back', partial: 'is back (partly done)', setback: 'is back, muddy and tired', beaten: 'is back early', recalled: 'came home' }[rep.result] || 'is back';
    const ups = Object.entries(rep.levels || {}).map(([k, [, to]]) => `${memberInfo(this.st, k)?.name || ''} is level ${to} now!`);
    const news = rep.saved ? `${rep.saved.village} is saved! ` : rep.cleared ? `The ${rep.cleared.dungeon} is clear! ` : rep.quest?.done ? `${rep.quest.title}: done! ` : '';
    G.ui?.toast?.(`${rep.crew.length > 1 ? `${lead}'s crew` : lead} ${word}: ${rep.kind === 'errand' ? where : rep.name}!`, { icon: 'map', color: rep.result === 'success' ? '#8fe0c0' : '#ffd8a8', sub: `${news}${ups.length ? `${ups.join(' ')} · the report is on the board` : `${names} · the report is on the Expedition Board`}`, duration: 6 });
    Events.emit('sfx', rep.result === 'success' ? 'ui_quest_done' : 'rune_chime');
    void e;
  }
  /** a siege relieved by a crew (COZY §3.2): the camps fall, the cages open, the captain flees, the village is saved →
   *  { village, zone, captain, freed: [names] } for the report (null if it was already saved). No banner here: the
   *  village's own banner and celebration play on your next arrival in that zone (onMode). */
  relieve(zone, e, quiet) {
    const G = this.G, st = this.st, Z = zoneOf(st, zone), V = VILLAGES[zone], freed = [];
    Z.celebrateCrew = e.crew.filter(k => parseMember(k)).slice(0, 5); // (who stands in the square on your next arrival: village.js)
    Z.quests.freed ||= [];
    for (const c of V?.camps || []) if (c.cage && !Z.quests.freed.includes(c.cage)) {
      Z.quests.freed.push(c.cage); freed.push(ZONE_NPCS[c.cage]?.name || c.cage);
      G.story?.addHearts?.(c.cage, 10);
      Events.emit('villager:rescued', { npc: c.cage, zone, dungeon: null, floor: 0, village: V.id, crew: true });
    }
    const first = saveVillage(st, zone, 'crew');
    if (!first) return null;
    Z.celebrate = true;
    Events.emit('village:saved', { zone, village: V.id, crew: true });
    void quiet; void e;
    return { village: V.name, jp: V.jp, zone, captain: objective(st, `relief:${zone}`)?.captain || 'The captain', freed };
  }
  breakCamps(zone, n) {
    const Z = zoneOf(this.st, zone), V = VILLAGES[zone]; if (!V) return;
    for (const c of V.camps) if (!Z.siegeCamps.some(s => s.id === c.id)) Z.siegeCamps.push({ id: c.id, cleared: false });
    for (const s of Z.siegeCamps) { if (n <= 0) break; if (!s.cleared) { s.cleared = true; n--; } }
  }
  /** A crew home from a zone villager's quest step (COZY §3.2): a success does the step (the quest item comes back with
   *  them, a rescued villager walks home to the village, a floor reached is noted); a partial keeps half a count. The
   *  turn-in talk stays yours. → { title, done: false, step, item?, rescued? } for the report */
  zoneQuestResult(o, result, crew) {
    const G = this.G, st = this.st, s = o.step, qid = o.binds.zq, Q = ZONE_QUESTS[qid];
    const q = st.quests?.active?.find(x => x.id === qid); if (!q || !Q || q.step !== o.binds.step) return null;
    const zone = o.place.zone, out = { title: Q.title, done: false, step: s.text, giver: ZONE_NPCS[Q.giver]?.name || '' };
    if (result === 'success') {
      if (s.type === 'dungeonFloor') noteFloor(st, zone, s.n || 1);
      if (s.type === 'find') out.item = (s.n > 1 ? `${s.n} × ` : '') + questItemName(s.item);
      G.story?.completeStep?.(qid, o.binds.step, { crew });
      if (s.type === 'rescue') { out.rescued = ZONE_NPCS[s.npc]?.name || s.npc; Events.emit('villager:rescued', { npc: s.npc, zone, dungeon: o.place.dungeon, floor: s.floor || 1, crew: true }); G.story?.addHearts?.(s.npc, 10); }
      out.turnIn = true;
    } else if ((s.type === 'kill' || s.type === 'find') && (s.n || 1) > 1) {
      const half = Math.ceil((s.n || 1) / 2); if ((q.prog || 0) < half) { q.prog = half; Events.emit('quest:update'); }
    }
    return out;
  }
  /** "Moka" or "Moka's crew": who the Journal and the reports say did it */
  crewLabel(crew) { const lead = memberInfo(this.st, crew[0])?.name || 'A'; return crew.length > 1 ? `${lead}'s crew` : lead; }
  /** a zone dungeon's first clear by a crew (COZY §3.2, §14.2) → { dungeon, zone, opened, lantern } for the report */
  crewClear(zone, crew) {
    const G = this.G, st = this.st, did = ZONE_DUNGEON[zone], D = DUNGEONS[did], Z = zoneOf(st, zone);
    if (!D || Z.dungeon.cleared > 0 || Z.dungeon.crew > 0) return null;
    const r = recordCrewClear(st, did); // (dungeon.crew + the Lantern's T1; dungeon.cleared stays: your own first clear keeps the boss unique)
    noteFloor(st, zone, D.floors || 2); // (the crew went all the way down: a quest's "reach floor 2" holds)
    const opened = zoneUnlockOnClear(st, zone);
    for (const q of [...(st.quests?.active || [])]) { // any quest waiting on this dungeon's boss: done by the crew
      const d = G.story?.def?.(q.id), s = d?.steps?.[q.step];
      if (s?.type === 'boss' && s.dungeon === did) G.story.completeStep(q.id, q.step, { crew });
    }
    Events.emit('dungeon:cleared', { id: did, kind: 'zone', tier: 0, spirit: 0, floor: D.floors || 2, zone, boss: D.boss, first: false, crew: true });
    if (r?.tierUnlocked) Events.emit('tier:unlocked', { id: did, zone, tier: 1, crew: true });
    G.story?.progress?.('any');
    if (G.mode === 'dungeon' && G.dungeon?.kind === 'region' && G.dungeon.zoneId === zone) G.dungeon.gate?.lantern?.refresh?.(); // (standing by its gate: the Lantern lights live)
    return { dungeon: D.name, zone, opened: opened ? REGIONS[opened]?.name || opened : null, openedId: opened || null, lantern: !!r?.tierUnlocked, boss: MONSTERS[D.boss]?.name || 'the boss' };
  }
  /** a crew calmed Tamamo: the Spirit Lantern by the Burrow door wakes (the Deep Burrow's T1, COZY §3.1) */
  wakeDeep() {
    const r = recordCrewClear(this.st, 'burrowDeep');
    if (r?.tierUnlocked) Events.emit('tier:unlocked', { id: 'burrowDeep', zone: null, tier: 1, crew: true });
    return { lantern: !!r?.tierUnlocked };
  }
  /** you finished a quest step or a clear first (COZY §4.9): the crews whose objective is no longer on offer come home */
  beatenAll() {
    for (const e of [...expOf(this.st).active]) {
      const o = objective(this.st, e.obj);
      if (!o || o.kind === 'siege' || o.kind === 'errand') continue;
      if (!objectiveOpen(this.st, o)) this.complete(e, o, 'beaten');
    }
  }
  /** you finished it first (COZY §4.9): the crew on that objective comes home early */
  beaten(zone) {
    for (const e of [...expOf(this.st).active]) {
      const o = objective(this.st, e.obj);
      if (o?.kind === 'siege' && o.binds.village === zone) this.complete(e, o, 'beaten');
    }
  }
  /** call a crew home now: no rewards, the supplies back */
  recall(uid) {
    const e = expOf(this.st).active.find(x => x.uid === uid); if (!e) return null;
    return this.complete(e, objective(this.st, e.obj), 'recalled');
  }
  finishAll() {
    const E = expOf(this.st), h = cozyOf(this.st).clock.h;
    for (const e of E.active) e.start = Math.min(e.start, h - e.hours);
    this.check();
    return E.active.length;
  }
  /** expeditions saved mid-trip that can't go on (COZY §9) come home at once, as a partial with the supplies back */
  audit() {
    for (const { e, why } of brokenExpeditions(this.st, id => objective(this.st, id))) this.complete(e, objective(this.st, e.obj), 'broken', true, `${why}: they came home early, and the lunches are back in the pantry.`);
  }
  onMode(e) {
    const G = this.G;
    if (e?.mode === 'village' || (e?.mode === 'dungeon' && G.dungeon?.kind !== 'region')) this.check(); // (a held relief moves in once you've left)
    if (e?.mode === 'dungeon' && G.dungeon?.kind === 'region') { // a crew's save is celebrated on the next arrival: the village's own scene (regions/village/village.js), or this banner where there's no village
      const zone = G.dungeon.zoneId, Z = zone && G.state.zones?.[zone];
      if (Z?.celebrate && Z.village === 'saved' && !G.dungeon.village) {
        Z.celebrate = false;
        const V = VILLAGES[zone];
        setTimeout(() => {
          if (G.mode !== 'dungeon' || G.dungeon?.kind !== 'region' || G.dungeon?.zoneId !== zone) return; // (only ever in that zone, outdoors)
          G.ui?.banner?.(`${V?.name || 'The village'} is saved!`, `${V?.jp || ''} · your crew drove the siege off`, { style: 'quest' });
          Events.emit('sfx', 'ui_levelup');
          const p = G.dungeon.villagePos || G.player.pos;
          for (let i = 0; i < 4; i++) setTimeout(() => G.vfx?.sparkle?.(new THREE.Vector3(p.x + (Math.random() - 0.5) * 6, (G.player.pos.y || 0) + 2 + Math.random(), p.z + (Math.random() - 0.5) * 6), { n: 16, color: ['#ff8fb0', '#ffd24a', '#8fe0c0', '#8fd0ff'][i], r: 0.8, rise: 1.2 }), i * 400);
        }, 2200);
      }
    }
    this.changed();
  }
  cure(key, msg) {
    const E = expOf(this.st);
    if (!(E.tired[key] > cozyOf(this.st).clock.h)) return;
    delete E.tired[key];
    this.G.ui?.toast?.(msg, { icon: 'heart', color: '#8fe0c0' });
    this.changed();
  }
  read(uid) { const r = expOf(this.st).reports.find(x => x.uid === uid); if (r && !r.read) { r.read = true; this.changed(); } return r || null; }
  takeItems(uid) {
    const r = expOf(this.st).reports.find(x => x.uid === uid); if (!r?.items?.length) return 0;
    const before = r.items.length;
    r.items = r.items.filter(it => !this.G.actions.pickup(it));
    if (r.items.length) this.G.ui?.toast?.('Your bag is full: the rest waits here', { color: '#ffd8a8' });
    this.changed();
    return before - r.items.length;
  }

  // ------------------------------------------------------------------ "While you were away…"
  awaySays() {
    const A = this.away; if (!A) return false;
    if (A.returned.length || A.refills?.length || A.guild?.length) return true; // (refills: the nodes a crossed world day brought back, cozy/scavengeWorld.js; guild: wages and morale, cozy/guildRun.js)
    return A.hours >= 0.5 && expOf(this.st).active.length > 0;
  }
  maybeAwayCard() {
    const G = this.G, ui = G.ui, A = this.away;
    if (!A || A.shown) return;
    if (!this.awaySays()) { if (!A.fresh) A.shown = true; A.fresh = false; return; } // (one frame to let due crews come home first)
    if (!ui?.ready || G.titleActive || ui.dlg?.active || ui.banners?.busy || ui.iris?.active || ui.anyModal?.() || G.heroes?.switching || G.playerDead || G.leavingDungeon || G.tutorials?.busy || ui.tutorial?.offering) return;
    this.showAwayCard();
  }
  showAwayCard(force = false) {
    const A = this.away || (force ? { ms: 0, hours: 0, returned: [], load: true } : null), ui = this.G.ui;
    if (!A || !ui?.open) return false;
    A.shown = true;
    const E = expOf(this.st);
    ui.open('awayCard', {
      ms: A.ms, hours: A.hours, capped: A.capped, load: A.load, cap: OFFLINE_CAP_H,
      reports: A.returned.map(uid => E.reports.find(r => r.uid === uid)).filter(Boolean),
      out: E.active.map(e => ({ uid: e.uid, name: e.name, crew: e.crew, left: hoursLeft(this.st, e), hold: e.hold })),
      refills: A.refills || [], guild: A.guild || [],
    });
    return true;
  }

  // ------------------------------------------------------------------ the Cozy debug section (docs/DEBUG.md)
  registerDebug() {
    const self = this, st = () => this.G.state;
    const fmt = h => `${Math.round(h * 10) / 10}`;
    registerDebug('cozy', [
      { group: 'The world clock', label: 'Add world hours', hint: 'Crews come home if their time is up', choices: [{ label: '+1 h', value: 1 }, { label: '+8 h', value: 8 }, { label: '+24 h', value: 24 }], run: (G, h) => { self.addHours(h); return `+${h} world hours (now ${fmt(cozyOf(st()).clock.h)} h, world day ${worldDay(cozyOf(st()).clock.h)})`; } },
      { label: 'Finish every expedition now', run: () => { const n = expOf(st()).active.length; if (!n) return 'No crews are out'; self.finishAll(); return `${n} crew${n > 1 ? 's' : ''} called back`; } },
      { group: 'Time away', label: 'Simulate an 8 h absence', hint: 'As if the game was closed 4 min 40 s ago', closes: true, run: () => { const c = cozyOf(st()).clock; c.wall = Date.now() - OFFLINE_CAP_H * SECS_PER_HOUR * 1000 - 1000; self.pulse(); if (!self.awaySays()) self.showAwayCard(true); return 'Welcome back: 8 world hours counted'; } },
      { label: 'Set the clock back a day', hint: 'The tamper guard: no time counts', run: () => { const c = cozyOf(st()).clock, h0 = c.h; c.wall = Date.now() + 24 * 3600 * 1000; const a = catchUp(st(), Date.now()); return a.backwards && c.h === h0 ? `The clock went back: 0 hours counted (the mark stays a day ahead)` : 'Hmm, time counted'; } },
      { label: 'Reset the time-away mark', hint: 'Back to now', noMark: true, run: () => { cozyOf(st()).clock.wall = Date.now(); return 'The mark is now'; } },
      { group: 'Crews', label: 'Give a sure-thing crew', hint: 'Moka and Poe join and level up for every open job', run: G => self.debugCrew(G) },
      { label: 'Show the away card', noMark: true, closes: true, run: () => { self.showAwayCard(true); return ''; } },
    ], { title: 'Cozy', icon: 'leaf', order: 90, note: 'The world clock, time away and expeditions (docs/COZY.md).' });
  }
  debugCrew(G) {
    const st = this.st, H = G.heroes, want = ['moka', 'poe'].filter(id => id !== st.activeHero);
    if (want.length < 2) want.push(...['shihtzu', 'golden'].filter(id => id !== st.activeHero).slice(0, 2 - want.length));
    for (const id of want) if (!H.joined(id)) { if (id === 'moka') { G.actions.prepareJoin?.('moka'); st.flags.mokaJoined = true; } else H.join(id); }
    const jobs = [...storyObjectives(st), ...errandsFor(st, worldDay(cozyOf(st).clock.h))];
    const need = Math.max(...jobs.map(o => objectivePower(st, o)), 12);
    const per = need * 1.25 / want.length;
    for (const id of want) { const P = st.heroes[id].player; while (heroPower(st, id) < per && P.lvl < 60) { P.lvl++; P.statPts += 5; P.skillPts += 1; } }
    H.spawnBench?.();
    this.changed();
    return `${want.map(id => `${CLASSES[id].name} L${st.heroes[id].player.lvl}`).join(' and ')}: a sure thing for every open job`;
  }
}
