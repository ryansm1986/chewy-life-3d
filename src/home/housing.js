// Housing (docs/HOUSING.md): entering houses (G.mode = 'interior'), the cottage's household jobs (the bed, the chest,
// the stove), hosting characters inside, and decorate mode (decorate.js). installHousing(G) from game.js builds
// G.housing. The village stays alive while you're inside: the worlds swap (G.swapWorld) inside the iris and swap
// back on the way out; the interior world is one persistent InteriorWorld that loads / unloads a house per visit.
import * as THREE from 'three';
import { Events } from '../core/events.js';
import { VFX } from '../gfx/vfx.js';
import { U } from '../gfx/materials.js';
import { Combat } from '../combat/combat.js';
import { InteriorWorld, ORIGIN } from './interiorWorld.js';
import { InteriorMinimap } from './interiorMap.js';
import { Decorator } from './decorate.js';
import { defaultInterior } from './defaults.js';
import { LAYOUTS, layoutFor, CELL } from './rooms.js';
import { FURNITURE, SURFACES, STARTER_STORAGE, furnitureOf } from './furniture.js';
import { frontCell, facing, cellsOf } from './placement.js';
import { installFurnitureSources } from './sources.js';
import { furnitureTemplate } from './furnitureMesh.js';
import { migrateInterior } from './grow.js';
import { Exteriors } from './exteriors.js';
import { BUILDINGS, sizeOf, getTemplate, templateStats, STYLED_CAP } from '../world/buildings/index.js';
import { cleanStyle, remodelCost, STYLE_SETS } from '../world/buildings/styles.js';
import { homeRating, starText, COTTAGE_TASTE } from './rating.js';
import { assignOwners, HOME_TYPES } from './owners.js';
import { VILLAGERS } from '../actors/roster.js';
import { clamp, lerp, pick } from '../core/util.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const USE_LABEL = { sleep: 'Sleep until morning 💤', stash: 'Open the treasure chest', cook: 'Cook something 🍳', craft: 'Use the workbench 🔨' };

export function installHousing(G) {
  const H = G.housing = new Housing(G);
  // a new household starts with a few pieces in storage (old saves get them once, on their first visit home)
  if (!G.state.flags.furnitureStarter && !G.state.furniture) { G.state.flags.furnitureStarter = true; const s = furnitureOf(G.state); for (const [id, n] of Object.entries(STARTER_STORAGE)) s[id] = (s[id] || 0) + n; }
  installFurnitureSources(G); // (Tanu's Trinkets, the workbench, the finds: home/sources.js)
  // the named villagers' homes: saved owners (assigned once; old saves get theirs now), and their door prompts
  H.assignOwners();
  Events.on('village:changed', () => H.assignOwners());
  // the houses' outsides: mailboxes, remodelled fences, the upgrade's scaffold (home/exteriors.js)
  H.templates = { getTemplate, templateStats, STYLED_CAP }; // (the game's own template cache, for QA and perf: a test's import may be another module instance under Vite)
  H.ext = new Exteriors(G, H);
  H.ext.sync();
  Events.on('village:changed', () => H.ext.sync());
  // old saves: the cottage was furnished before the workbench existed, so it waits in storage
  if (!G.state.flags.furnitureWorkbench) {
    G.state.flags.furnitureWorkbench = true;
    const c = H.cottage()?.data;
    if (c?.interior?.items && !c.interior.items.some(it => it.id === 'workbench')) G.actions.addFurniture('workbench', 1, { src: 'gift', silent: true });
  }
  // what the household already has counts as found (the first real find shows "New!": home/sources.js)
  if (!G.state.flags.furnitureFoundInit) {
    G.state.flags.furnitureFoundInit = true;
    const f = G.state.furnitureFound ||= {}, day = G.state.day || 1, c = H.cottage()?.data;
    for (const id of Object.keys(G.state.furniture || {})) f[id] ||= day;
    for (const it of c?.interior?.items || defaultInterior('chewyHouse', c?.level || 1).items) f[it.id] ||= day;
  }
  return H;
}
const TASTES = Object.fromEntries(VILLAGERS.map(v => [v.id, v.home || null]));
// the village rank an upgrade to each level needs (docs/HOUSING.md §5: "requires the plot's max and rank")
export const UPGRADE_RANK = { 2: 1, 3: 2 };
const NAMES = Object.fromEntries(VILLAGERS.map(v => [v.id, v.spec.name]));
// the owner's reactions on the way out (docs/HOUSING.md §4)
const LOVE = ['I love it! It finally feels like *me* in here!', 'Oh my… look at it! Thank you, Chewy!', 'It\'s perfect. I\'m never leaving this room. Well — maybe for snacks.'];
const HMM = ['Ooh, you moved things around! Maybe {tip}?', 'It\'s getting cosier… I think {tip} would really finish it.', 'Thank you! It\'s lovely. Though… {tip}, maybe?'];
const BYE = ['Thanks for visiting! Come again soon~', 'Bye bye! Mind the step~', 'See you around, Chewy!'];

export class Housing {
  constructor(G) {
    this.G = G; this.world = null; this.vfx = null; this.combat = null;
    this.rec = null; this.home = null; this.hosts = [];
    this.decor = new Decorator(G, this);
    this.busy = false;
  }
  get inside() { return this.G.mode === 'interior'; }
  get S() { return this.world?.S; }
  // ---------------------------------------------------------------- data
  cottage() { return this.G.sim?.list.find(r => r.data.type === 'chewyHouse') || null; }
  /** the saved interior of a building record's data (created with the default furnishing on first use: a villager's
   *  home gets their personality layout, their own pieces marked `own`) */
  interiorOf(b) {
    let I = b.interior;
    const want = layoutFor(b.type, b.level || 1).id;
    // (a villager's home still on the first, barer default — nothing of yours in it — gets the fuller one: v 2)
    if (I?.items && b.owner && (I.v || 1) < 2 && I.items.every(it => it.own)) I = null;
    if (!I?.items) {
      I = b.interior = defaultInterior(b.type, b.level || 1, b.owner || null);
      if (b.owner) { I.ownWall = I.wall; I.ownFloor = I.floor; } // (their own wallpaper and floor: never yours to take)
    }
    I.items = I.items.filter(it => FURNITURE[it.id]); // (an item removed from the catalog)
    if (!LAYOUTS[I.layout]) I.layout = want;
    // the house grew (an upgrade, or the village's own growth): the room is bigger and the furniture keeps its place
    if (I.layout !== want) {
      const r = migrateInterior(I, want);
      Object.assign(I, r.interior);
      const back = r.stored.filter(it => !it.own); // (a villager's own pieces stay theirs: nothing to store)
      for (const it of back) this.G.actions?.addFurniture?.(it.id, 1, { src: 'store', silent: true });
      if (back.length) { this.G.ui?.toast?.(`${back.length} piece${back.length > 1 ? 's' : ''} went back into storage`, { icon: 'home', color: '#ffd8a8' }); Events.emit('furniture:changed', { src: 'grow' }); }
      Events.emit('home:grew', { type: b.type, layout: want, stored: back.length });
    }
    return I;
  }
  // ---------------------------------------------------------------- the house card, upgrades, remodels (§5-6)
  /** a house's name: its owner's home, the cottage, or its kind */
  houseName(b) {
    if (b.type === 'chewyHouse') return "Chewy's Cottage";
    if (b.owner) return `${this.nameOf(b.owner)}'s Home`;
    const v = BUILDINGS[b.type]?.variants; return Array.isArray(v) ? v[(b.level || 1) - 1] : BUILDINGS[b.type]?.name || 'House';
  }
  /** the village rank (QA can pin it: G.housing.testRank) */
  rank() { return this.testRank ?? this.G.sim?.stats?.rank ?? 1; }
  /** can it be upgraded now? → { ok, max, why, cost, next, rank } */
  upgradeInfo(b) {
    const G = this.G, def = BUILDINGS[b.type], sim = G.sim, nl = (b.level || 1) + 1;
    if (!def?.levelCost || nl > (def.levels || 1)) return { ok: false, max: true, why: 'Fully grown!' };
    if (sim.atCap(b)) return { ok: false, max: true, why: 'Fully grown for its plot!' };
    const cost = def.levelCost[nl - 1] || {}, rank = UPGRADE_RANK[nl] || 1;
    if (this.rank() < rank) return { ok: false, cost, next: nl, rank, why: `Needs village rank ${rank}` };
    const block = sim.growBlock(b); if (block) return { ok: false, cost, next: nl, rank, why: `No room to grow: ${block}` };
    if (this.ext?.busy) return { ok: false, cost, next: nl, rank, why: 'The builders are busy — just a moment!' };
    if (!G.actions.hasMaterials(cost)) return { ok: false, cost, next: nl, rank, why: 'Not enough materials', poor: true };
    return { ok: true, cost, next: nl, rank };
  }
  /** spend the level cost; the scaffold goes up and the house grows inside it, keeping its look (village.js levelUp) */
  upgrade(rec) {
    const G = this.G, b = rec?.data; if (!b) return false;
    const u = this.upgradeInfo(b);
    if (!u.ok) { G.ui?.toast?.(u.why, { icon: 'home', color: '#ffb0bc' }); Events.emit('sfx', 'ui_error'); return false; }
    if (!G.actions.spendMaterials(u.cost)) return false;
    const size = sizeOf(b.type, u.next), [w, d] = b.rot % 2 ? [size[1], size[0]] : size;
    G.ui?.close?.('houseCard');
    const h = getTemplate(b.type, u.next, b.seed, b.style || null).height; // (the scaffold covers the new, taller house)
    const sp = G.sim.growSpot(b), at = sp.why ? null : G.sim.worldPos({ ...b, x: sp.x, z: sp.z, level: u.next }); // (where the bigger house will stand)
    this.ext.construct(rec, [w, d], h, () => {
      const ok = G.sim.levelUp(b);
      if (!ok) { for (const [k, n] of Object.entries(u.cost)) if (k === 'coins') G.actions.addCoins(n); else G.actions.addMaterial(k, n); return null; } // (refund: it couldn't grow after all)
      this.ext.sync();
      G.save?.();
      return G.sim.list.find(r => r.data === b) || null;
    }, at);
    G.ui?.toast?.(`The builders are on it! ${this.houseName(b)} is growing to level ${u.next}`, { icon: 'build', color: '#ffd84a' });
    Events.emit('house:upgrade', { type: b.type, level: u.next });
    return true;
  }
  /** what a new look costs, and whether the household can pay (sets: their rank) → { cost, ok, why } */
  remodelInfo(b, style) {
    const G = this.G, st = cleanStyle(style), cost = remodelCost(b.style, st);
    const set = st?.set && STYLE_SETS[st.set], rank = this.rank();
    if (set && set.rank > rank && st.set !== cleanStyle(b.style)?.set) return { cost, ok: false, why: `${set.name} unlocks at village rank ${set.rank}` };
    if (!Object.keys(cost).length) return { cost, ok: false, why: 'Nothing changed yet', same: true };
    if (!G.actions.hasMaterials(cost)) return { cost, ok: false, why: 'Not enough materials', poor: true };
    return { cost, ok: true };
  }
  /** apply a new look: pay, rebuild the house with it (same seed, same level), its fence follows */
  remodel(rec, style) {
    const G = this.G, b = rec?.data; if (!b) return false;
    const st = cleanStyle(style), r = this.remodelInfo(b, st);
    if (!r.ok) { if (!r.same) { G.ui?.toast?.(r.why, { icon: 'home', color: '#ffb0bc' }); Events.emit('sfx', 'ui_error'); } return false; }
    if (!G.actions.spendMaterials(r.cost)) return false;
    if (st) b.style = st; else delete b.style;
    const sim = G.sim;
    sim.despawn(rec);
    const nrec = sim.spawnModel(b, true);
    sim.refreshTiles?.();
    G.villageLife && (G.villageLife.dirty = true, G.villageLife.doorCache?.clear?.());
    this.ext.sync();
    Events.emit('village:changed');
    Events.emit('house:remodel', { type: b.type, style: st });
    G.save?.();
    return nrec;
  }
  /** a house with a card: Chewy's cottage and the homes (and the cast's shops, which they live in) */
  isHouse(b) { return b?.type === 'chewyHouse' || BUILDINGS[b?.type]?.cat === 'home' || (!!b?.owner && HOME_TYPES.includes(b.type)); }
  openHouseCard(rec) {
    const G = this.G; if (!rec || !G.ui?.open) return false;
    G.ui.open('houseCard', { rec });
    G.state.flags.mailboxOpened = (G.state.flags.mailboxOpened || 0) + 1; // (the Remodel guide: world/guides.js)
    Events.emit('sfx', 'ui_open');
    Events.emit('mailbox:open', { type: rec.data.type });
    return true;
  }
  // ---------------------------------------------------------------- owners, doors, ratings (docs/HOUSING.md §1, §4)
  /** saved owners: the cast without a home get the nearest free one (home/owners.js); then their door prompts */
  assignOwners() {
    const G = this.G, list = G.state.village?.buildings; if (!list || !G.sim) return;
    const anchors = Object.fromEntries(VILLAGERS.map(v => [v.id, v.anchor]));
    const got = assignOwners(list, anchors);
    this.syncDoors();
    if (got.length && G.villageLife) G.villageLife.onChanged(); // (villagers move into their homes: re-resolve)
  }
  /** an owned home without a door prompt gets one (new owners, rebuilt buildings) */
  syncDoors() {
    const G = this.G, W = G.village?.world || G.sim?.world; if (!W) return;
    for (const rec of G.sim.list) {
      const b = rec.data;
      if (!b.owner || !HOME_TYPES.includes(b.type) || rec.inter) continue;
      rec.inter = this.doorInter(b, rec.door);
      W.interactables.push(rec.inter);
    }
  }
  /** the one door interactable of a villager's home: visit, knock at night, or a word on why not (village.js
   *  interactionFor builds it for owned homes; the night knock (villageLife.tuckIn) shares it) */
  doorInter(b, door) {
    if (!b.owner || !HOME_TYPES.includes(b.type)) return null;
    const H = this;
    return { pos: door, radius: 1.3, building: b, knockable: true, home: true, get label() { return H.doorLabel(b); }, set label(v) { /* (computed) */ }, onInteract: () => H.doorUse(b) };
  }
  recOf(b) { return this.G.sim?.list.find(r => r.data === b) || null; }
  ownerNpc(b) { return b?.owner ? this.G.npcs?.find(n => n.id === b.owner && !n.folk) || null : null; }
  nameOf(id) { return NAMES[id] || id; }
  tasteOf(b) { return b?.type === 'chewyHouse' ? COTTAGE_TASTE : TASTES[b?.owner] || null; }
  /** the rating of a building's interior (its default furnishing if nobody has been in yet) */
  ratingOf(b) { return homeRating(this.interiorOf(b), this.tasteOf(b)); }
  starsOf(b) { if (b.homeStars == null) b.homeStars = this.ratingOf(b).stars; return b.homeStars; }
  /** an accepted request to decorate this villager's home (story.js 'decorate' steps) */
  decorateRequest(id) {
    const S = this.G.story; if (!S) return null;
    for (const q of S.Q.active) { const d = S.def(q.id), s = d?.steps[q.step]; if (s?.type === 'decorate' && s.npc === id) return { q, d, s }; }
    return null;
  }
  /** may Chewy go into this villager's home now? → { ok, why, decorate } */
  access(b) {
    const G = this.G, id = b.owner, v = this.ownerNpc(b);
    if (!v) return { ok: false, why: 'away' };
    if (v.bedNow || v.state === 'hidden') return { ok: false, why: 'asleep' };
    if (v.tutClaim || v.frozen || v.talking || v.door || v.knocked) return { ok: false, why: 'busy' };
    const f = G.story?.friend?.(id), req = this.decorateRequest(id), invited = !!f?.invited;
    if ((f?.hearts || 0) >= 1 || invited || req) return { ok: true, decorate: invited || !!req };
    return { ok: false, why: 'stranger' };
  }
  doorLabel(b) {
    const G = this.G, name = this.nameOf(b.owner), rec = this.recOf(b), L = G.villageLife, k = rec && L?.knocks.get(rec);
    if (k?.who.size) { const f = L.knockFirst(k); return f ? `Knock on ${f.name}'s door` : 'Knock'; }
    const a = this.access(b);
    if (a.ok) { this.prewarm(b); return `Visit ${name}  ${starText(this.starsOf(b))}`; }
    return a.why === 'asleep' ? `${name} is asleep` : `${name}'s home`;
  }
  /** build the furniture a home needs a few pieces per frame while you stand at its door, so going in doesn't hitch
   *  (the sculpted pieces take 30-110 ms each the first time; templates are cached for the session) */
  prewarm(b) {
    const W = this.warmed ||= new WeakSet(); if (W.has(b)) return; W.add(b); // (not on b: that's saved)
    const ids = [...new Set(this.interiorOf(b).items.map(it => it.id))];
    const step = () => { const t0 = performance.now(); while (ids.length && performance.now() - t0 < 6) furnitureTemplate(ids.shift()); if (ids.length) setTimeout(step, 30); };
    setTimeout(step, 0);
  }
  doorUse(b) {
    const G = this.G, rec = this.recOf(b), L = G.villageLife, k = rec && L?.knocks.get(rec);
    if (k?.who.size) return L.knock(rec);
    const a = this.access(b), name = this.nameOf(b.owner);
    if (a.ok) return this.enter(rec);
    const msg = a.why === 'asleep' ? `${name} is fast asleep. Shh…` : a.why === 'busy' ? `${name} is busy right now — try again in a moment.` : a.why === 'away' ? 'Nobody\'s home.' : `${name} doesn't know you very well yet. Have a chat first! (♥ 1 to visit)`;
    G.ui?.toast?.(msg, { icon: 'home', color: '#ffb07a' });
    Events.emit('sfx', 'ui_error');
    return false;
  }
  /** who may go in, and what the door says: → { ok, label, why } */
  doorFor(rec) {
    if (rec?.data.type === 'chewyHouse') return { ok: true, label: "Enter Chewy's Cottage" };
    if (rec?.data.owner && HOME_TYPES.includes(rec.data.type)) { const a = this.access(rec.data); return { ok: a.ok, label: this.doorLabel(rec.data), why: a.why }; }
    return { ok: false, label: null, why: null };
  }
  /** decorating allowed here? (the cottage: always; a villager's home: once they've invited you, or for a request) */
  canDecorate() {
    if (!this.inside || !this.rec) return false;
    const b = this.rec.data;
    if (b.type === 'chewyHouse') return true;
    const f = this.G.story?.friend?.(b.owner);
    return !!(b.owner && (f?.invited || this.decorateRequest(b.owner)));
  }
  /** the rating of the room you're in, now (the decorate palette's chip) */
  ratingNow() { return this.rec ? homeRating(this.world?.items ? { ...this.rec.data.interior, items: this.world.items } : this.interiorOf(this.rec.data), this.tasteOf(this.rec.data)) : null; }

  // ---------------------------------------------------------------- going in and out
  enter(rec = this.cottage(), o = {}) {
    const G = this.G;
    if (!rec || this.busy || G.mode !== 'village' || G.playerDead || G.heroSwitching || G.build?.active) return false;
    const d = this.doorFor(rec); if (!d.ok) return false;
    this.busy = true;
    G.player.controlLocked = true; G.player.moveTarget = null; G.player.interactTarget = null;
    Events.emit('sfx', 'door_open', { vol: 0.8 });
    const go = () => { try { this.goIn(rec, o); } finally { this.busy = false; } };
    if (G.ui?.transition && !o.instant) G.ui.transition(go, { shape: 'circle', inMs: 560, outMs: 700, hold: 260 }); else go();
    return true;
  }
  goIn(rec) {
    const G = this.G, E = G.engine, P = G.player, sh = G.companion;
    const t0 = performance.now();
    G.skills?.clearAll?.(); if (G.skills) G.skills.queued = null;
    G.life?.tools?.cancel?.();
    G.ui?.closeAll?.();
    const b = rec.data, I = this.interiorOf(b), layout = LAYOUTS[I.layout] || layoutFor(b.type, b.level);
    const owner = b.type !== 'chewyHouse' ? b.owner || null : null;
    this.rec = rec; this.home = { type: b.type, name: owner ? `${this.nameOf(owner)}'s Home` : layout.name || "Chewy's Cottage", household: b.type === 'chewyHouse', owner };
    const r0 = homeRating(I, this.tasteOf(b)), f = owner ? G.story?.friend?.(owner) : null;
    this.visit = { owner, stars: r0.stars, score: r0.score, best: Math.max(f?.homeBest || 0, r0.stars), sig: JSON.stringify(I.items) + I.wall + I.floor };
    if (f) f.homeBest = this.visit.best;
    this.wasNight = null; this.decor.undoStack.length = 0; // (undo never reaches into another house)
    this.walkOutAt = performance.now() + 1500; // (keys still held from walking up to the door don't walk you straight back out)
    const W = this.world ||= new InteriorWorld(E);
    if (!this.vfx) { this.vfx = new VFX(E, W.scene); this.vfx.setLightPool(W.lightPool); }
    this.combat ||= new Combat(G, W);
    W.load({ layout, interior: I, name: this.home.name, household: this.home.household, vfx: this.vfx });
    this.refreshInteractables();
    G.swapWorld(W, this.vfx, this.combat);
    G.mode = 'interior';
    // the player on the door mat facing in, Shadow beside
    const m = W.doorMatPos, out = W.doorOut;
    P.setPos(m.x, m.z); P.facing = P.faceTarget = Math.atan2(-out.x, -out.z); P.moveTarget = null; P.interactTarget = null; P.route?.clear?.();
    sh.setPos(m.x - out.z * 0.75 - out.x * 0.85, m.z + out.x * 0.75 - out.z * 0.85); sh.hold = null; sh.wanderTarget = null; // (beside, a step further in)
    P.controlLocked = false;
    this.hostBenched();
    if (owner) this.hostOwner(owner);
    // camera: closer, clamped to the room
    const rig = E.rig;
    this.cam = { dist: rig.distTarget, min: rig.minDist, max: rig.maxDist, yaw: rig.yawTarget };
    rig.minDist = 10; rig.maxDist = 19; rig.distTarget = 15; rig.yawTarget = Math.PI / 4; rig.clearBias?.();
    rig.focus.copy(P.pos).setY(0.6); this.biasFocus(rig.focus); this.clampFocus(rig.focus); rig.snap();
    // the indoor look
    this.saveLook(); this.applyLook(true);
    G.ui?.setLocation?.(this.home.name);
    this.map ||= new InteriorMinimap(G, this);
    G.ui?.minimap?.setProvider?.(this.map);
    try { E.renderer.compile(W.scene, E.camera); } catch (e) { /* (compiled at the first draw instead) */ }
    Events.emit('mode:changed', { mode: 'interior', home: this.home.type });
    if (this.home.household) G.state.flags.homeVisits = (G.state.flags.homeVisits || 0) + 1; // (the Make it home guide)
    Events.emit('home:enter', { type: b.type, id: b.id, household: this.home.household });
    this.enterMs = performance.now() - t0;
  }
  exit(o = {}) {
    const G = this.G;
    if (this.busy || G.mode !== 'interior') return false;
    this.busy = true;
    if (this.decor.active) this.decor.exit();
    if (!o.instant && !o.reacted && this.visit?.owner && this.hosted(this.visit.owner) && G.ui?.dialogue) { // the owner has a word first
      this.react().finally(() => { this.busy = false; this.exit({ ...o, reacted: true }); });
      return true;
    }
    G.player.controlLocked = true;
    Events.emit('sfx', 'door_open', { vol: 0.7, pitch: 0.9 });
    const go = () => { try { this.goOut(); } finally { this.busy = false; } };
    if (G.ui?.transition && !o.instant) G.ui.transition(go, { shape: 'circle', inMs: 560, outMs: 700, hold: 220 }); else go();
    return true;
  }
  /** the owner reacts to their room on the way out (docs/HOUSING.md §4): a new star → "I love it!" with hearts (the first
   *  time each star is reached); changed but no new star → a gentle hint; an accepted request is checked here too */
  async react() {
    const G = this.G, V = this.visit, rec = this.rec, b = rec?.data; if (!V || !b) return;
    const v = this.hosted(V.owner); if (!v) return;
    const I = this.interiorOf(b), r = homeRating(I, this.tasteOf(b)), changed = JSON.stringify(I.items) + I.wall + I.floor !== V.sig;
    b.homeStars = r.stars;
    const f = G.story?.friend?.(V.owner), news = r.stars > V.best ? r.stars - V.best : 0;
    const req = this.decorateRequest(V.owner);
    const out = req ? G.story?.checkDecorate?.(V.owner, I, this.tasteOf(b), true) : null; // { done, missing } (completed after their thank-you)
    if (!changed && !req) { v.anim.play('wave'); G.ui?.toast?.(pick(BYE), { icon: 'home', color: '#ffd8a8' }); return; }
    const lines = [];
    if (news) lines.push(pick(LOVE).replace('*me*', `*${this.nameOf(V.owner)}*`) + `  ${'★'.repeat(r.stars)}`);
    else if (changed && !out?.done) lines.push(pick(HMM).replace('{tip}', r.tips[0] || 'a little lamp'));
    if (out && !out.done && out.missing?.length) lines.push(`For my request, I'd still love ${out.missing.join(' and ')}!`);
    if (out?.done) lines.push('And that\'s everything I asked for! You\'re the best decorator in Blossom Hollow!');
    if (!lines.length) lines.push(pick(BYE));
    G.player.controlLocked = true;
    v.faceTo(G.player.pos.x, G.player.pos.z); v.anim.play(news || out?.done ? 'happy' : 'nod');
    if (news || out?.done) { this.vfx?.emote?.(v, 'heart', 2); this.vfx?.sparkle?.(v.pos.clone().setY(v.pos.y + 1.4), { n: 22, color: '#ff8fb0', r: 0.7, rise: 1.2 }); Events.emit('sfx', 'gift_loved'); }
    try { await G.ui.dialogue({ speaker: this.nameOf(V.owner), portrait: G.portrait?.(V.owner), lines, voice: v.spec?.voice }); } finally { G.player.controlLocked = false; }
    if (news && f) { f.homeBest = r.stars; G.story?.addHearts?.(V.owner, 10 * news); }
    if (out?.done) G.story?.checkDecorate?.(V.owner, I, this.tasteOf(b)); // (the request completes: banner, hearts, the reward)
    V.best = Math.max(V.best, r.stars); V.sig = JSON.stringify(I.items) + I.wall + I.floor;
    Events.emit('home:rated', { owner: V.owner, stars: r.stars, score: r.score, news });
  }
  goOut() {
    const G = this.G, E = G.engine, P = G.player, sh = G.companion, rec = this.rec;
    G.ui?.closeAll?.();
    if (rec?.data) { const b = rec.data, r = homeRating(this.interiorOf(b), this.tasteOf(b)); b.homeStars = r.stars; } // (the door chip and b.happy: village.js)
    G.life?.kitchen && (G.life.kitchen.station = null);
    this.unhostAll();
    G.swapWorld(G.village.world, G.village.vfx, G.village.combat);
    this.world.unload(); this.vfx.clear(); this.combat.clear();
    G.mode = 'village';
    // out on the doorstep, facing the street
    const door = rec?.door || G.heroes?.homeDoor?.(), th = -(rec?.data.rot || 0) * Math.PI / 2, fx = Math.sin(th), fz = Math.cos(th);
    const D = G.villageLife?.doorInfo?.(rec);
    const st = D?.step || { x: door.x + fx * 0.6, z: door.z + fz * 0.6 };
    P.setPos(st.x, st.z); P.facing = P.faceTarget = Math.atan2(fx, fz); P.moveTarget = null; P.interactTarget = null; P.route?.clear?.();
    sh.setPos(st.x + fx * 0.8 + fz * 0.6, st.z + fz * 0.8 - fx * 0.6);
    P.controlLocked = false;
    const rig = E.rig, c = this.cam || { dist: 22, min: 12, max: 66, yaw: Math.PI / 4 };
    rig.minDist = c.min; rig.maxDist = c.max; rig.distTarget = 22; rig.yawTarget = c.yaw;
    rig.focus.copy(P.pos); rig.snap();
    this.restoreLook();
    G.ui?.setLocation?.(null);
    G.ui?.minimap?.setProvider?.(G.villageMinimap);
    const type = rec?.data.type, owner = this.visit?.owner || null;
    this.rec = null; this.home = null; this.visit = null;
    Events.emit('mode:changed', { mode: 'village', from: 'interior' });
    Events.emit('home:exit', { type, owner, stars: rec?.data.homeStars });
    G.sim?.simulate?.(true); // (the rating feeds the home's happiness)
    G.interactCooldown = performance.now() + 400;
    G.save?.();
  }

  // ---------------------------------------------------------------- the indoor look
  saveLook() {
    const E = this.G.engine, post = E.post;
    this.look0 = { cloud: U.uCloudShadow.value, wind: U.uWindStr.value, focus: post?.tilt?.focusArea, feather: post?.tilt?.feather };
  }
  applyLook(first) {
    const G = this.G, post = G.engine.post, day = G.day;
    const n = day ? day.sample(day.hour).night : 0;
    this.world.applyLight(n);
    U.uCloudShadow.value = 0; U.uWindStr.value = 0.12; U.uNight.value = n * 0.45;
    U.uRimColor.value.set('#ffe2b4').lerp(_rim.set('#b8b0ff'), n * 0.6);
    U.uSkyHor.value.set('#ffe8cc');
    if (!post) return;
    const g = post.grade.uniforms;
    g.get('uLift').value.set(lerp(0.016, 0.01, n), lerp(0.008, 0.006, n), lerp(0.02, 0.045, n));
    g.get('uGain').value.set(lerp(1.02, 0.98, n), 1.0, lerp(0.97, 1.01, n));
    g.get('uSat').value = lerp(1.04, 1.0, n);
    if (first) { g.get('uVigColor').value.set(0.32, 0.2, 0.22); g.get('uVignette').value = 1.12; }
    post.bloom.intensity = lerp(0.7, 1.15, n); post.bloom.luminanceMaterial.threshold = lerp(0.82, 0.6, n);
    if (post.tilt && first) { post.tilt.focusArea = 0.9; post.tilt.feather = 0.28; }
  }
  restoreLook() {
    const G = this.G, post = G.engine.post, l = this.look0 || {};
    U.uCloudShadow.value = l.cloud ?? 0.28; U.uWindStr.value = l.wind ?? 1;
    if (post) {
      post.grade.uniforms.get('uVigColor').value.set(0.55, 0.45, 0.65); post.grade.uniforms.get('uVignette').value = 1.0;
      if (post.tilt && l.focus != null) { post.tilt.focusArea = l.focus; post.tilt.feather = l.feather; }
    }
    G.day?.apply();
  }
  /** indoors the camera looks a little past the player toward the back walls, so their windows and wall items stay in
   *  the picture */
  biasFocus(f) {
    const yaw = this.G.engine.rig.yaw;
    f.x += -Math.sin(yaw) * 0.85; f.z += -Math.cos(yaw) * 0.85; f.y = Math.max(f.y, 1.0);
    return f;
  }
  /** keep the camera's focus inside the room (a little margin), so it never drifts out over the void */
  clampFocus(f, pad = 1.2) {
    const S = this.S; if (!S) return f;
    const x0 = ORIGIN + pad, z0 = ORIGIN + pad, x1 = ORIGIN + S.W * CELL - pad, z1 = ORIGIN + S.D * CELL - pad;
    f.x = x1 > x0 ? clamp(f.x, x0, x1) : (x0 + x1) / 2; f.z = z1 > z0 ? clamp(f.z, z0, z1) : (z0 + z1) / 2;
    return f;
  }

  // ---------------------------------------------------------------- per frame (game.js, interior mode)
  update(dt, t, rdt = dt) {
    const G = this.G, W = this.world; if (!W || G.mode !== 'interior') return;
    this.lookT = (this.lookT || 0) - rdt;
    if (this.lookT <= 0) {
      this.lookT = 0.25; this.applyLook(false);
      const night = !!G.day?.isNight?.(); // (the village's day / night music carries on indoors)
      if (this.wasNight != null && night !== this.wasNight && !G.ui?.isOpen?.('shop')) { G.audio?.music?.(night ? 'village_night' : 'village_day', { fade: 4 }); G.audio?.ambience?.(night ? 'night' : 'village', { fade: 4 }); }
      this.wasNight = night;
    }
    W.updateSun();
    W.lightPool.update(dt, G.engine.rig.target, G.engine.time, 0.3 + 0.7 * W.night);
    W.update(dt, t);
    for (let i = this.hosts.length - 1; i >= 0; i--) { const v = this.hosts[i]; if (!G.npcs.includes(v)) { this.hosts.splice(i, 1); continue; } v.update(dt); }
    this.decor.update(dt, rdt);
    // walking out: on the outer half of the door mat, pushing out through the doorway (with the 45° camera that's S
    // or A for a south door), or stepping into the doorway itself (InteriorWorld.inDoorway: it's walkable)
    const P = G.player, d = P.inputDir, o = W.doorOut;
    const pushing = W.inDoorway(P.pos.x, P.pos.z, -0.3) && d && d.lengthSq() > 0.5 && d.x * o.x + d.z * o.z > 0.35;
    this.pushOut = pushing ? (this.pushOut || 0) + rdt : 0;
    if (!P.controlLocked && !this.decor.active && !this.busy && performance.now() > this.walkOutAt && (this.pushOut > 0.12 || W.inDoorway(P.pos.x, P.pos.z, 0.02))) { this.pushOut = 0; this.exit(); }
  }

  // ---------------------------------------------------------------- interactables: the door mat, household jobs, guests
  refreshInteractables() {
    const W = this.world, G = this.G; if (!W) return;
    const keep = this.hosts.map(v => v.interact);
    W.interactables.length = 0;
    if (W.doorMatPos) W.interactables.push({ pos: W.doorMatPos.clone(), radius: 0.85, label: 'Go outside', onInteract: () => this.exit(), door: true });
    if (this.home?.household) {
      for (const it of W.items) {
        const d = FURNITURE[it.id]; if (!d?.use || it.mount !== 'floor') continue;
        const pos = W.frontOf(it), [fx, fz] = facing(it.rot);
        const c = W.matrixOf(it); const ctr = V().setFromMatrixPosition(c);
        const p = V(lerp(ctr.x, pos.x, 0.62), 0, lerp(ctr.z, pos.z, 0.62)); // (between the item's middle and the cell in front)
        W.interactables.push({ pos: p, radius: 0.95, label: USE_LABEL[d.use], use: d.use, item: it.k, onInteract: () => this.use(d.use, it, ctr, fx, fz) });
      }
    }
    for (const i of keep) W.interactables.push(i);
  }
  use(kind, it, at) {
    const G = this.G;
    G.player.faceTo(at.x, at.z);
    if (kind === 'sleep') { Events.emit('home:use', { use: 'sleep' }); G.sleep?.(); }
    else if (kind === 'stash') { Events.emit('sfx', 'chest_open', { vol: 0.7 }); G.ui?.open?.('stash'); Events.emit('home:use', { use: 'stash' }); }
    else if (kind === 'cook') { G.life?.kitchen?.open('kitchen', G.player.pos.clone()); Events.emit('home:use', { use: 'cook' }); }
    else if (kind === 'craft') { G.openWorkbench?.('home'); Events.emit('home:use', { use: 'craft' }); }
  }
  /** the interior was edited (decorate): redraw furniture, colliders, lights and the jobs' interactables */
  refresh(hidden = null) {
    const W = this.world; if (!W) return;
    W.setFurniture(W.items, hidden);
    this.refreshInteractables();
  }

  // ---------------------------------------------------------------- guests (the benched hero lives at the cottage)
  hostBenched() {
    const G = this.G, H = G.heroes; if (!this.home?.household || !H) return;
    const id = H.next?.(), v = id && H.villagers[id];
    if (!v || v.waitingToJoin) return;
    const home = !v.visible || v.state === 'inside' || v.state === 'hidden';
    if (!home) return;
    this.hostHero(v);
  }
  /** a free floor spot for a guest, near the table if there is one (else the room's middle) */
  guestSpot(near = null) {
    const W = this.world, S = W.S, items = W.items, solid = new Set(), busy = new Set();
    for (const it of items) if (it.mount === 'floor' && !FURNITURE[it.id]?.walk) for (const [x, z] of cellsOf(it)) solid.add(x + ',' + z);
    for (const k of S.doorKeep) busy.add(k);
    for (const v of this.hosts) { const [x, z] = W.cellAt(v.pos.x, v.pos.z); busy.add(x + ',' + z); }
    const P = this.G.player; { const [x, z] = W.cellAt(P.pos.x, P.pos.z); busy.add(x + ',' + z); }
    const tbl = near || items.find(it => it.id === 'chabudai') || items.find(it => it.mount === 'floor' && FURNITURE[it.id]?.cat === 'table');
    const tc = tbl ? cellsOf(tbl) : null;
    let best = null, bd = 1e9;
    for (let z = 0; z < S.D; z++) for (let x = 0; x < S.W; x++) {
      if (busy.has(x + ',' + z)) continue;
      // a clear 3 x 3 patch of floor (nobody stands half inside a table or squeezed against a wall)
      let ok = true;
      for (let dz = -1; dz <= 1 && ok; dz++) for (let dx = -1; dx <= 1; dx++) if (!S.isFloor(x + dx, z + dz) || solid.has((x + dx) + ',' + (z + dz))) { ok = false; break; }
      if (!ok) continue;
      // near the table (two cells out from its edge), off the front row by the door
      const d = tc ? Math.abs(Math.min(...tc.map(([a, b]) => Math.max(Math.abs(a - x), Math.abs(b - z)))) - 2) * 2 + Math.hypot(x - S.W / 2, z - S.D / 2) * 0.15 : Math.hypot(x - S.W / 2, z - S.D / 2);
      const score = d + (z > S.D - 3 ? 4 : 0);
      if (score < bd) { bd = score; best = [x, z]; }
    }
    return best ? W.cellCentre(best[0], best[1]) : W.centre.clone();
  }
  /** the villager whose home this is: they let you in and wait inside (a guest of their own home, restored after) */
  hostOwner(id) {
    const v = this.G.npcs?.find(n => n.id === id && !n.folk); if (!v || this.hosted(id)) return null;
    if (v.chat) v.endChat?.(false);
    if (v.benchChat) v.endBenchChat?.();
    v.clearTask?.();
    const it = this.world.items.find(i => (TASTES[id]?.likesFurniture || []).includes(i.id) && i.mount === 'floor');
    return this.hostHero(v, null, { pose: null, near: it || null });
  }
  hostHero(v, at = null, o = {}) {
    const W = this.world, night = (this.G.day?.isNight?.() ?? false);
    v.hostSave = { world: v.world, visible: v.visible, state: v.state, pos: v.pos.clone(), facing: v.facing, frozen: v.frozen, cap: !!v.cap, label: v.interact.label };
    v.interact.label = `Talk to ${v.name}`;
    v.door = null; v.doorScale = 1; v.doorLift = 0; v.knocked = false; v.sleepyWait = 0;
    v.changeWorld(W); v.visible = true; v.frozen = true; v.talking = false; v.scriptWalk = null;
    const m = W.doorMatPos, nearDoor = at && m && Math.hypot(at.x - m.x, at.z - m.z) < 1.4;
    const p = at && !nearDoor ? at : this.guestSpot(o.near || null); // (never on the door mat)
    v.setPos(p.x, p.z);
    const look = W.centre; v.faceTo(look.x, look.z); v.facing = v.faceTarget;
    const pose = o.pose !== undefined ? o.pose : night ? 'drowsy' : 'read';
    if (pose) v.anim.play(pose); else v.anim.stop();
    if (night) v.setNightcap?.(true); // (in their nightcap, up past bedtime with a book)
    v.hostTick = (dt, P, pd) => this.guestTick(v, dt, P, pd, pose);
    this.hosts.push(v);
    if (!W.interactables.includes(v.interact)) W.interactables.push(v.interact);
    return v;
  }
  guestTick(v, dt, P, pd, pose) {
    v.greeted = (v.greeted || 0) - dt;
    if (P && pd < 2.6) { v.faceTo(P.pos.x, P.pos.z); if (v.greeted <= 0) { v.greeted = 14; v.anim.play('wave'); } }
    else if (!pose && P && pd < 7) v.faceTo(P.pos.x, P.pos.z); // (a host keeps an eye on their guest)
    if (!v.anim.action && pose) v.anim.play(pose);
    if (pose === 'drowsy' && (v.zzzT = (v.zzzT || 0) - dt) <= 0) { v.zzzT = 4.5; v.emote?.('zzz'); }
  }
  /** a guest goes back to the village where they were (the world swap on the way out) */
  unhost(v) {
    const i = this.hosts.indexOf(v); if (i < 0) return null;
    this.hosts.splice(i, 1);
    const W = this.world, at = { x: v.pos.x, z: v.pos.z, face: v.facing };
    const k = W?.interactables.indexOf(v.interact); if (k >= 0) W.interactables.splice(k, 1);
    const s = v.hostSave; v.hostSave = null; v.hostTick = null;
    if (v.world !== s.world) v.changeWorld(s.world);
    v.anim.stop(); v.frozen = s.frozen; v.visible = s.visible; v.state = s.state === 'act' || s.state === 'walk' ? 'idle' : s.state;
    if (!s.cap) v.setNightcap?.(false);
    v.interact.label = s.label;
    v.setPos(s.pos.x, s.pos.z); v.facing = v.faceTarget = s.facing;
    return at;
  }
  unhostAll() { for (const v of [...this.hosts]) this.unhost(v); }
  /** the hosted villager with this id (heroes.js: switching heroes inside) */
  hosted(id) { return this.hosts.find(v => v.id === id) || null; }
}
const _rim = new THREE.Color();
