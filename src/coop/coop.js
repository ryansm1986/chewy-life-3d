// Couch co-op (docs/COOP.md): 2-4 controllers on one screen, each playing one of the heroes who has joined the pack.
//
// Player 1 is the game as it always was: G.player, G.skills, G.derived, the keyboard, the mouse, touch and the first
// pad (Actions). Players 2-4 each have a pad (coop/pads.js) and a "slot": their hero's body (a Player), a SkillRunner,
// a PadAim, an AutoAim and an actions closure of their own. The game has hundreds of reads of G.player / G.skills /
// G.derived / G.state.player, so rather than thread a "which hero" through all of them, a slot's systems run inside
// its context: with(slot, fn) swaps those globals (and Actions.view, the pad that Actions answers for) to the slot's
// for the length of fn, and swaps them back after. The game is single-threaded, so nothing else can see the swap.
//  - What runs in a slot's context: its input, regen, body and skills each frame (update); every monster, in the
//    context of the hero it is after (foeUpdate: so its bites, AoEs and hitPlayer land on that hero); projectiles and
//    ground zones, in the context they were made in (combat.js); an interact by that player; timers set while in it
//    (setTimeout is wrapped: a skill's delayed hit stays that hero's).
//  - Events: an event raised in a slot's context goes to its listeners in player 1's context (the HUD and the panels
//    show player 1), except the hero's own: 'player:dead' downs that hero and 'player:levelup' celebrates over them
//    (never player 1's banner and restore), and the sounds, steps and charge rumbles stay in the slot (its pad buzzes).
// Also here: joining (any spare pad's A or Menu opens a join card: pick a hero, A), leaving, each player's hero switch
// (LB tap: the next free hero, hold: the picker), the shared camera (it frames everyone and pulls back as the pack
// spreads; a leash keeps everyone on screen), downed and revived heroes, shared XP and the per-pad menus. The HUD,
// the join card and the shared bag panes draw from this state (ui/coopHud.js, ui/coopPanes.js).
import * as THREE from 'three';
import { Actions } from '../core/actions.js';
import { Events } from '../core/events.js';
import { PadReader, listPads } from './pads.js';
import { Player } from '../actors/player.js';
import { SkillRunner } from '../combat/skillRunner.js';
import { PadAim } from '../combat/padAim.js';
import { AutoAim, TARGETING, targetingOf } from '../combat/autoTarget.js';
import { createActions } from '../rpg/actions.js';
import { CLASSES, HERO_IDS } from '../rpg/classes.js';
import { setLootClass } from '../rpg/items.js';
import { skillRuntime } from '../rpg/skills.js';
import { registerDebug } from '../debug/registry.js';
import { U } from '../gfx/materials.js';

export const MAX_PLAYERS = 4;
/** each player's colour: their ring, card, cursor and name tag (P1 gold, P2 sky, P3 mint, P4 rose) */
export const PLAYER_COLORS = ['#ffc23d', '#4fc3ff', '#6fe08a', '#ff7ac0'];
const SLOT_ACTS = ['attack', 'skillAlt', 'skill1', 'skill2', 'skill3', 'skill4'];
const WHEEL_HOLD = 0.26; // s: LB held this long opens the hero picker (as Tab / LB does for player 1: actors/heroes.js)
const REVIVE_R = 1.9, REVIVE_T = 1.6, DOWN_AUTO = 20, REVIVE_LIFE = 0.4, AUTO_LIFE = 0.25;
// the camera and the leash, on screen (NDC, -1..1): the camera pulls back (up to EXTRA m) until everyone is inside
// the BOX; a hero can't step past the EDGE; one CATCH_UP m from player 1 (stuck) sparkles back beside them
const BOX_X = 0.62, BOX_UP = 0.56, BOX_DOWN = 0.42, EDGE_X = 0.9, EDGE_UP = 0.86, EDGE_DOWN = 0.7, EXTRA = 16, CATCH_UP = 46; // (DOWN: the skill bar's side of the screen)
// a hero's events that don't go to player 1's listeners (see the header)
const NATURAL = new Set(['sfx', 'footstep', 'emote', 'player:roll', 'charge:start', 'charge:stage', 'charge:release', 'charge:cancel', 'charge:spinout', 'input:rumble']);
// interactables that take the whole pack somewhere (a door, the Burrow, stairs, a portal, the Travel Map, a bed): they
// run as player 1's, so the mode change carries everyone (mode:changed regroups the pack)
const PACK_MOVE = /\b(enter|go (in|out|home|inside|outside|back|down|up|deeper)|deeper|leave|exit|way out|travel|descend|ascend|stairs|burrow|portal|wayfarer|sleep|nap|bed|door|step (in|out)|head (in|out|home)|return)\b/i;

const _v = new THREE.Vector3(), _a = new THREE.Vector3();

class Slot {
  constructor(n, pad = null) {
    this.n = n; this.color = PLAYER_COLORS[n - 1]; this.pad = pad; this.primary = n === 1;
    this.hero = null; this.body = null;
    this.c = {}; // the context: what with() swaps in (G.player, G.skills, G.derived, the state's hero, Actions.view…)
    this.downed = null;  // { t, rev } while knocked out (a teammate beside them revives them)
    this.pane = null;    // the open bag pane's name (ui/coopPanes.js), or null
    this.tab = null; this.picker = null; this.padA = false; this.prompt = null; this.lostT = 0; this.joinT = 0;
    this.gone = false;
  }
}

export class Coop {
  constructor(G, opts = {}) {
    this.G = G; this.opts = opts;
    this.p1 = new Slot(1); this.p1.c = {};
    this.slots = [this.p1];
    this.cur = null;            // the slot whose context is in (null: player 1's)
    this.readers = new Map();   // pad index → PadReader (every pad that isn't player 1's)
    this.joins = new Map();     // pad index → { reader, list, i, t, none } (a join card up)
    this.cam = { on: 0, lx: 0, lz: 0 };
    this.lootT = 0; this.lootI = 0; this.wiping = false; this.sessions = [];
    this.kits = {}; // player n → { actions, skills, padAim, autoAim }: reused when that player joins again (no listener per join)
    this.ui = null; this.panes = null; // (ui/coopHud.js, ui/coopPanes.js register here)
    this.wrap();
    Events.on('mode:changed', () => this.regroup());
    Events.on('hero:switched', () => { if (this.G.player) this.G.player._coopSlot = this.p1; });
  }
  get active() { return this.slots.length > 1; }
  get others() { return this.slots.slice(1); }
  /** the player playing hero `id` (not player 1), or null */
  holder(id) { for (let i = 1; i < this.slots.length; i++) if (this.slots[i].hero === id) return this.slots[i]; return null; }
  claimed(id) { return !!this.holder(id); }
  slotOf(body) { return body?._coopSlot || (body === this.G.player && !this.cur ? this.p1 : null); }
  bodyOf(s) { return s.primary ? (this.cur ? this.p1.c.player : this.G.player) : s.body; }
  heroOf(s) { return s.primary ? (this.cur ? this.p1.c.activeHero : this.G.state.activeHero) : s.hero; }
  isDown(s) { return s.primary ? !!(this.cur ? this.p1.c.playerDead : this.G.playerDead) : !!s.downed; }

  // ------------------------------------------------------------------ the context
  store(s) {
    const G = this.G, st = G.state, c = s.c;
    c.player = G.player; c.skills = G.skills; c.derived = G.derived; c.padAim = G.padAim; c.autoAim = G.autoAim; c.playerDead = G.playerDead; c.actions = G.actions;
    c.sPlayer = st.player; c.sEquip = st.equipment; c.activeHero = st.activeHero;
    c.view = Actions.view; c.device = Actions.device; c.apAim = Actions.padAim;
  }
  load(s) {
    const G = this.G, st = G.state, c = s.c;
    G.player = c.player; G.skills = c.skills; G.derived = c.derived; G.padAim = c.padAim; G.autoAim = c.autoAim; G.playerDead = c.playerDead; G.actions = c.actions;
    st.player = c.sPlayer; st.equipment = c.sEquip; st.activeHero = c.activeHero;
    Actions.view = c.view; Actions.device = c.device; Actions.padAim = c.apAim;
  }
  /** run fn as player `s`: G.player is their hero, Actions reads their pad. Nests; returns fn's result. */
  with(s, fn) {
    const prev = this.cur || this.p1;
    if (!s || s.gone) s = this.p1;
    if (s === prev) return fn();
    this.store(prev); this.load(s); this.cur = s.primary ? null : s;
    try { return fn(); } finally { this.store(s); this.load(prev); this.cur = prev.primary ? null : prev; }
  }
  primary(fn) { return this.with(this.p1, fn); }
  /** setTimeout and Events.emit, once: a timer set in a slot's context fires in it; an event raised in one is routed */
  wrap() {
    const C = this, st0 = window.setTimeout.bind(window);
    window.setTimeout = function (fn, ms, ...a) {
      const s = C.cur;
      if (!s || typeof fn !== 'function') return st0(fn, ms, ...a);
      return st0(() => C.with(s.gone ? C.p1 : s, () => fn(...a)), ms);
    };
    const emit0 = Events.emit;
    Events.emit = function (name, ...args) {
      const s = C.cur;
      if (!s) return emit0(name, ...args);
      if (name === 'player:dead') return C.down(s);
      if (name === 'player:levelup') return C.levelUp(s, args[0]);
      if (NATURAL.has(name) || name.startsWith('coop:')) return emit0(name, ...args);
      if (name === 'equip:changed') s.body?.setWeapon(C.G.derived?.weaponType || 'sword'); // (that hero's weapon in their paw)
      if (name === 'item:drop' && args[0] && !args[0].pos && s.body) args[0] = { ...args[0], pos: s.body.pos.clone() }; // (it lands at their feet)
      return C.primary(() => emit0(name, ...args));
    };
  }

  // ------------------------------------------------------------------ joining and leaving
  /** heroes a player could pick now: joined, not away on an expedition, not being played */
  freeHeroes(except = null) {
    const H = this.G.heroes, act = this.heroOf(this.p1);
    return HERO_IDS.filter(id => id !== act && H.joined(id) && !H.away(id) && (!this.claimed(id) || this.holder(id) === except));
  }
  /** '' when a join can happen now, else why not */
  canJoin() {
    const G = this.G, ui = G.ui;
    if (this.slots.length >= MAX_PLAYERS) return 'The pack is full (4 players)';
    if (G.titleActive) return 'Start the game first, then join!';
    if (G.build?.active || G.housing?.decor?.active) return 'Join when building is done!';
    if (G.leavingDungeon || G.heroSwitching) return 'Not right now!';
    if (ui?.iris?.active || ui?.isPaused?.()) return 'Not right now!';
    return '';
  }
  pollPads(rdt) {
    const P1 = Actions.padIndex;
    for (const g of listPads()) if (g.index !== P1 && !this.readers.has(g.index)) this.readers.set(g.index, new PadReader(g.index));
    for (const [i, r] of this.readers) {
      if (i === P1 && !Actions.claimed.has(i)) { this.readers.delete(i); this.joins.delete(i); continue; } // (player 1 picked this pad up)
      r.poll(rdt);
    }
  }
  /** a spare pad's presses: A or Menu opens its join card; in the card the D-pad / stick picks a hero, A joins, B backs out */
  joinInput(rdt) {
    for (const [i, r] of this.readers) {
      if (Actions.claimed.has(i)) continue;
      const J = this.joins.get(i);
      if (!J) {
        if (!r.connected || !(r.pPressed.has('A') || r.pPressed.has('Menu'))) continue;
        const why = this.canJoin(), list = this.freeHeroes();
        this.joins.set(i, { reader: r, list, i: 0, t: 0, n: 0, why: why || (list.length ? '' : this.noHeroWhy()) });
        this.joins.get(i).n = this.nextNumber(i);
        Events.emit('sfx', 'ui_open', { vol: 0.6 });
        Events.emit('coop:joincard', { pad: i, open: true });
        continue;
      }
      J.t += rdt;
      J.n = this.nextNumber(i); // (the number they'll really get: cards open together count in pad order)
      if (!r.connected) { this.joins.delete(i); Events.emit('coop:joincard', { pad: i, open: false }); continue; }
      J.list = this.freeHeroes(); J.why = this.canJoin() || (J.list.length ? '' : this.noHeroWhy());
      if (J.i >= J.list.length) J.i = Math.max(0, J.list.length - 1);
      const nav = r.nav;
      if ((nav === 'left' || nav === 'up') && J.list.length > 1) { J.i = (J.i + J.list.length - 1) % J.list.length; Events.emit('sfx', 'ui_tab', { vol: 0.5 }); }
      if ((nav === 'right' || nav === 'down') && J.list.length > 1) { J.i = (J.i + 1) % J.list.length; Events.emit('sfx', 'ui_tab', { vol: 0.5 }); }
      if (r.pPressed.has('B') || (J.why && J.t > 3.5)) { this.joins.delete(i); Events.emit('sfx', 'ui_close', { vol: 0.5 }); Events.emit('coop:joincard', { pad: i, open: false }); continue; }
      if (r.pPressed.has('A') && J.t > 0.15 && !J.why && J.list[J.i]) {
        this.joins.delete(i); Events.emit('coop:joincard', { pad: i, open: false });
        r.pPressed.clear(); // (the A that joins isn't also their first press: no swing, no chat with whoever stands near)
        const ns = this.join(r, J.list[J.i], { n: J.n }); if (ns) ns.padA = true; // (the number the card showed)
      }
    }
  }
  /** the player number a join card's pad would get now: the lowest free one, after any cards opened before it */
  nextNumber(pad) {
    const used = new Set(this.slots.map(s => s.n));
    let n = 1;
    for (const [i] of this.joins) { do n++; while (used.has(n)); if (i === pad) return n; }
    do n++; while (used.has(n)); return n;
  }
  noHeroWhy() {
    const H = this.G.heroes;
    if (HERO_IDS.some(id => id !== this.heroOf(this.p1) && H.joined(id) && H.away(id) && !this.claimed(id))) return 'Everyone else is out on an expedition';
    return H.joined('moka') ? 'Every hero is being played' : 'Meet Moka by the fountain first!';
  }
  /** Player n joins as `hero` with pad reader r: their hero pops in beside player 1. → the slot, or null */
  join(r, hero, { quiet = false, n: want = 0 } = {}) {
    const G = this.G, H = G.heroes;
    if (this.canJoin() || !this.freeHeroes().includes(hero)) return null;
    const used = new Set(this.slots.map(s => s.n));
    let n = want > 1 && want <= MAX_PLAYERS && !used.has(want) ? want : 2; while (used.has(n)) n++;
    const s = new Slot(n, r);
    const h = G.state.heroes[hero];
    s.hero = hero;
    s.c = { player: null, skills: null, derived: null, padAim: null, autoAim: null, playerDead: false, actions: null, sPlayer: h.player, sEquip: h.equipment, activeHero: hero, view: r.view, device: 'pad', apAim: null };
    Actions.claimed.add(r.index);
    const P1 = this.bodyOf(this.p1);
    const at = this.spotNear(P1.pos, n);
    if (G.mode === 'village') H.removeVillager(hero); // (they were about town: now they're played)
    else if (G.mode === 'interior') { const v = G.housing?.hosted?.(hero); if (v) G.housing.unhost(v); H.removeVillager(hero); }
    this.with(s, () => {
      if (h.player.life === 0) h.player.life = null;
      const K = this.kits[n] ||= {};
      G.actions = K.actions ||= createActions(G); // (its own potion heal-over-time)
      G.actions.ensureMouseSets?.(); G.actions.recompute(true); // (→ G.derived, this hero's)
      const body = G.player = new Player(G.world, G, hero);
      body._coopSlot = s; s.body = body;
      body.setPos(at.x, at.z); body.facing = body.faceTarget = P1.facing; body.sync();
      body.setWeapon(G.derived.weaponType || 'sword');
      if (!K.skills) { K.skills = new SkillRunner(G); K.skills.charge.bindKeys(i => !!SLOT_ACTS[i] && Actions.held(SLOT_ACTS[i])); }
      G.skills = K.skills; G.skills.clearAll?.(); G.skills.queued = null; G.skills.cds = H.cds[hero] || {};
      G.padAim = K.padAim ||= new PadAim(G); G.autoAim = K.autoAim ||= new AutoAim(G);
      G.padAim.clear();
      G.playerDead = false;
    });
    this.slots.push(s); this.slots.sort((a, b) => a.n - b.n);
    s.joinT = 0;
    if (!quiet) {
      G.vfx?.heroSwap?.(s.body.pos.clone(), { from: s.color, to: CLASSES[hero].color });
      Events.emit('sfx', 'hero_arrive', { pitch: 1.05, vol: 0.8 });
      r.view.rumble(0.3, 0.5, 160);
    }
    Events.emit('coop:joined', { n, hero, pad: r.index });
    this.ui?.joined?.(s);
    return s;
  }
  /** Player s leaves: their hero heads home (in town they carry on with their day right there) */
  leave(s, { quiet = false } = {}) {
    if (!s || s.primary || s.gone) return false;
    const G = this.G, H = G.heroes, body = s.body;
    this.panes?.close?.(s, true);
    this.with(s, () => {
      G.skills.clearAll?.(); G.skills.queued = null; G.padAim.clear(); G.padAim.hideRing?.(); G.autoAim?.clear?.();
      H.cds[s.hero] = G.skills.cds;
      G.state.player.life = null; G.state.player.zoom = null; // (home to rest)
    });
    const p = body.pos.clone(), face = body.facing;
    if (!quiet) { G.vfx?.heroSwap?.(p.clone(), { from: CLASSES[s.hero].color, to: s.color }); Events.emit('sfx', 'portal', { vol: 0.4 }); }
    body.dropStaff?.(); body.dropFuma?.(); body.dropFlail?.(); body.dropLance?.(); body.dropParasol?.();
    body.dispose();
    U.uBenders.value[s.n]?.set(0, -999, 0, 0); // (their grass bending)
    s.gone = true;
    this.slots = this.slots.filter(x => x !== s);
    Actions.claimed.delete(s.pad.index);
    if (G.mode === 'village') { const v = H.spawnVillager(s.hero, p.x, p.z, face); v.warm = true; v.state = 'idle'; v.t = 2.2; v.greeted = 20; v.anim.play('wave'); }
    Events.emit('coop:left', { n: s.n, hero: s.hero });
    this.ui?.left?.(s);
    if (!this.active) this.G.engine.rig.extraDistTarget = 0;
    return true;
  }
  /** a free spot beside player 1 for player n (open ground, not in a wall) */
  spotNear(c, n) {
    const W = this.G.world, rig = this.G.engine.rig, { f, r } = rig.groundAxes();
    const side = n % 2 ? -1 : 1, back = n > 3 ? 1 : 0;
    for (const k of [1.3, 1.9, 0.9, 2.6]) for (const s of [side, -side]) {
      const x = c.x + r.x * s * k - f.x * back * 0.9, z = c.z + r.z * s * k - f.z * back * 0.9;
      if ((W.walkable?.(x, z) ?? true) && !W.collision?.solidAt?.(x, z, 0.35)) return { x, z };
    }
    return { x: c.x + 0.6, z: c.z + 0.6 };
  }

  // ------------------------------------------------------------------ switching heroes
  canSwitchTo(s, to) {
    const G = this.G, H = G.heroes;
    if (!to || to === s.hero) return 'Nobody to switch with';
    if (!H.joined(to)) return 'Not met yet';
    if (H.away(to)) return `${H.name(to)} is away on an expedition`;
    if (to === this.heroOf(this.p1) || (this.claimed(to) && this.holder(to) !== s)) return `${H.name(to)} is being played`;
    if (s.downed || s.pane) return 'Not right now!';
    if (G.mode === 'interior') return 'Switch outside!';
    if (G.ui?.anyModal?.() || G.ui?.dlg?.active || G.leavingDungeon) return 'Not right now!';
    if (s.body?.leap || s.body?.dash) return 'busy';
    return '';
  }
  nextFree(s) {
    const list = this.freeHeroes(s), i0 = HERO_IDS.indexOf(s.hero);
    for (let k = 1; k <= HERO_IDS.length; k++) { const id = HERO_IDS[(i0 + k) % HERO_IDS.length]; if (id !== s.hero && list.includes(id)) return id; }
    return null;
  }
  /** player s becomes hero `to` right where they stand (the old hero heads home, or carries on in town) */
  switchHero(s, to) {
    if (s.primary) return this.primary(() => this.G.heroes.switchTo(to));
    const G = this.G, H = G.heroes, why = this.canSwitchTo(s, to);
    if (why) { if (why !== 'busy') { G.ui?.float?.(s.body.pos.clone().setY(s.body.pos.y + 1.7), why, { kind: 'status', color: s.color }); Events.emit('sfx', 'ui_error'); } return false; }
    const from = s.hero;
    this.with(s, () => {
      const P = s.body;
      G.skills.clearAll?.(); G.skills.queued = null; G.padAim.clear();
      if (G.mode === 'village') { H.removeVillager(to); const v = H.spawnVillager(from, P.pos.x, P.pos.z, P.facing); v.warm = true; v.state = 'idle'; v.t = 2.2; v.greeted = 20; v.anim.play('wave'); }
      else { H.removeVillager(to); }
      H.cds[from] = G.skills.cds; G.skills.cds = H.cds[to] || {};
      const old = G.state.heroes[from].player; old.life = null; old.zoom = null;
      s.hero = to;
      G.state.activeHero = to; G.state.player = G.state.heroes[to].player; G.state.equipment = G.state.heroes[to].equipment;
      if (G.state.player.life === 0) G.state.player.life = null;
      G.actions.ensureMouseSets?.(); G.actions.recompute(true);
      P.setHero(to); P.setWeapon(G.derived.weaponType || 'sword'); P.sync();
      G.vfx?.heroSwap?.(P.pos.clone(), { from: CLASSES[from].color, to: CLASSES[to].color });
      Events.emit('sfx', 'hero_swap', { vol: 0.7 });
      Events.emit('sfx', 'hero_arrive', { pitch: 1.05 });
    });
    Events.emit('coop:switched', { n: s.n, from, to });
    this.ui?.switched?.(s, from, to);
    return true;
  }

  // ------------------------------------------------------------------ the frame
  /** game.js, after player 1's body and skills: the pads, the join cards, players 2-4, the downed, the leash */
  update(dt, rdt) {
    const G = this.G;
    if (G.titleActive) return;
    this.pollPads(rdt);
    this.joinInput(rdt);
    // a lost controller: that hero waits (60 s), then heads home
    for (const s of this.others) {
      s.joinT += rdt;
      if (s.pad.connected) { if (s.lostT > 0.5) Events.emit('coop:pad', { n: s.n, connected: true }); s.lostT = 0; }
      else { const was = s.lostT; s.lostT += rdt; if (was <= 0.5 && s.lostT > 0.5) Events.emit('coop:pad', { n: s.n, connected: false }); if (s.lostT > 60) this.leave(s); }
    }
    if (!this.active) return;
    const modal = !!(G.ui?.anyModal?.() || G.ui?.dlg?.active);
    if (modal) this.shareModalInput();
    for (const s of this.others) {
      if (s.gone) continue;
      s.pad.view.locked = !!s.pane || s.lostT > 0.5 || modal;
      this.with(s, () => {
        if (!s.downed && !s.pane && !modal && s.lostT <= 0.5 && !G.build?.active && !G.housing?.decor?.active) this.input(s, dt);
        else { s.prompt = null; if (!s.pane) s.tab = null; s.picker = null; G.padAim.clear(); }
        if (!s.downed) G.actions.tickRegen(dt);
        s.body.paneOpen = !!s.pane;
        s.body.update(dt);
        G.skills.update(dt, this.opts.skillInput);
        if (s.pane) this.panes?.input?.(s, rdt);
      });
    }
    if (this.p1.pane) this.panes?.input?.(this.p1, rdt);
    const B1 = this.bodyOf(this.p1); if (B1) B1.paneOpen = !!this.p1.pane;
    this.updateDowned(dt);
    this.leash();
    this.rotateLoot(dt);
  }
  /** a dialogue, shop or menu (they're shared, one at a time): any player's pad can answer it (player 1's pad reads) */
  shareModalInput() {
    let any = false;
    for (const s of this.others) {
      if (s.pane || s.lostT > 0.5) continue;
      const r = s.pad;
      for (const t of r.pPressed) { Actions.pPressed.add(t); any = true; }
      for (const t of r.cur) Actions.cur.add(t);
      if (r.nav && !Actions.nav) { Actions.nav = r.nav; any = true; }
      if (r.dnav && !Actions.dnav) Actions.dnav = r.dnav;
    }
    if (any && Actions.device !== 'pad') Actions.setDevice('pad');
  }
  /** a player's pad, in their context: the hero switch, the aim, A, the skills, the potions, Menu */
  input(s, dt) {
    const G = this.G, V = s.pad.view, P = s.body, A = G.actions;
    // LB: a tap is the next free hero, a hold the picker (left / right, let go to pick)
    if (V.pressed('hero')) { V.consume('hero'); s.tab = { t: 0 }; }
    if (s.tab) {
      if (V.held('hero')) {
        s.tab.t += dt;
        if (!s.picker && s.tab.t >= WHEEL_HOLD) { const list = [s.hero, ...this.freeHeroes(s).filter(id => id !== s.hero)]; s.picker = { list, i: 0, t: 0 }; Events.emit('sfx', 'ui_open', { vol: 0.5 }); }
      } else {
        const T = s.tab; s.tab = null;
        if (s.picker) { const id = s.picker.list[s.picker.i]; s.picker = null; if (id && id !== s.hero) this.switchHero(s, id); else Events.emit('sfx', 'ui_close', { vol: 0.4 }); }
        else if (T.t < WHEEL_HOLD) { const to = this.nextFree(s); if (to) this.switchHero(s, to); else { G.ui?.float?.(P.pos.clone().setY(P.pos.y + 1.7), this.noHeroWhy(), { kind: 'status', color: s.color }); Events.emit('sfx', 'ui_error'); } }
      }
    }
    if (s.picker) {
      const K = s.picker, n = K.list.length, nav = s.pad.nav; K.t += dt;
      if (n > 1 && (nav === 'left' || nav === 'up')) { K.i = (K.i + n - 1) % n; Events.emit('sfx', 'ui_tab', { vol: 0.45 }); }
      if (n > 1 && (nav === 'right' || nav === 'down')) { K.i = (K.i + 1) % n; Events.emit('sfx', 'ui_tab', { vol: 0.45 }); }
      G.padAim.clear(); s.prompt = null;
      return;
    }
    if (V.pressed('menu')) { V.consume('menu'); if (this.panes?.open) this.panes.open(s); return; }
    if (V.pressed('map')) { V.consume('map'); this.primary(() => G.ui?.toggle?.('map')); return; }
    const hb = G.state.player.hotbar, indoors = G.mode === 'interior';
    const tmode = targetingOf(G.ui?.settings, 'pad'), auto = tmode === TARGETING.AUTO;
    G.padAim.update(dt);
    const aim = G.padAim.point.clone(), lock = G.padAim.lock;
    const cast = id => {
      if (auto) return G.autoAim.aimFor(id, { fallback: aim });
      if (!lock) return [aim, null];
      const R = skillRuntime(id, G.state, G.derived);
      if (!R || !G.skills.isMelee?.(id, R) || lock.breakable) return [lock.pos, lock];
      const reach = G.skills.reach(R, lock), dx = lock.pos.x - P.pos.x, dz = lock.pos.z - P.pos.z, d = Math.hypot(dx, dz);
      if (d <= reach + 1.8) return [lock.pos, lock];
      const k = Math.min(d, reach * 0.8) / d;
      return [new THREE.Vector3(P.pos.x + dx * k, P.pos.y, P.pos.z + dz * k), null];
    };
    const list = this.opts.interactList?.() || G.world.interactables || [];
    const it = G.padAim.pickInteract(list);
    const aCtx = !!it && !G.padAim.foeNear();
    const lmbCharge = G.skills.charge.owns(0);
    if (V.pressed('attack') && aCtx && performance.now() > (G.interactCooldown || 0)) { s.padA = true; V.consume('attack'); this.interact(s, it); return; }
    else if (!V.held('attack')) s.padA = false;
    else if (!s.padA && !indoors && (G.mode === 'dungeon' || lmbCharge)) { const id0 = hb[0] || 'attack'; const [t, tg] = cast(id0); G.skills.charge.feed(0, id0, t, tg); }
    if (!indoors && hb[1] && V.held('skillAlt')) G.skills.charge.feed(1, hb[1], ...cast(hb[1]));
    if (!indoors) for (let k = 1; k <= 4; k++) if (V.held(SLOT_ACTS[k + 1]) && hb[k + 1]) G.skills.charge.feed(k + 1, hb[k + 1], ...cast(hb[k + 1]));
    if (V.pressed('potionHeart')) this.potion(s, 'heart');
    if (V.pressed('potionZoom')) this.potion(s, 'zoom');
    if (V.pressed('meal')) G.life?.kitchen?.quickEat?.();
    if (V.pressed('swap')) { A.swapWeapons(); P.setWeapon(G.derived.weaponType || 'sword'); Events.emit('sfx', 'ui_equip'); G.vfx.sparkle(P.pos.clone().setY(0.8), { n: 6 }); }
    if (it && V.pressed('interact') && performance.now() > (G.interactCooldown || 0)) { V.consume('interact'); this.interact(s, it); }
    s.prompt = it ? { label: it.label, act: aCtx ? 'interact' : 'interactAlt' } : null;
  }
  potion(s, key) {
    const G = this.G, P = s.body, eff = G.actions.usePotion(key);
    if (!eff) return;
    if (!P.anim.busy() && !P.leap && !P.dash && !G.skills.channel) P.anim.play('drink');
    Events.emit('sfx', 'potion_drink');
    if (key === 'zoom') G.vfx.sparkle(P.pos.clone().setY(0.8), { n: 12, color: '#8fc8ff' }); else G.vfx.heal(P.pos.clone());
  }
  /** player s uses something: a villager talks to them; a door, gate, stairs or portal moves the whole pack (as player 1) */
  interact(s, it) {
    const G = this.G, npc = (G.npcs || []).find(n => n.interact === it);
    if (!npc && (it.door || PACK_MOVE.test(it.label || ''))) { this.primary(() => it.onInteract()); return; }
    const was = this.sessions.map(x => x.busy());
    this.with(s, () => it.onInteract());
    this.sessions.forEach((x, k) => { if (!was[k] && x.busy()) x.owner = s; }); // (a cast, a dig, a gather or a cook started: theirs)
  }
  /** fishing, a dig, a gather and the cook panel each run a session that reads G.player every frame: while one that a
   *  player 2-4 started is going, its update runs as them (life/fishing.js, cozy/scavengeWorld.js, life/tools, kitchen) */
  ownSessions() {
    const G = this.G, L = G.life, list = this.sessions = [];
    const own = (obj, busy) => {
      if (!obj?.update) return;
      const f = obj.update, rec = { owner: null, busy };
      obj.update = (...a) => {
        const o = rec.owner;
        if (o && (o.gone || !busy())) rec.owner = null;
        return rec.owner && this.active ? this.with(rec.owner, () => f.apply(obj, a)) : f.apply(obj, a);
      };
      list.push(rec);
    };
    own(L?.fishing, () => !!L.fishing.s);
    own(L?.tools, () => !!L.tools.busy);
    own(L?.kitchen, () => !!(L.kitchen.busy || (L.kitchen.station && G.ui?.isOpen?.('cook'))));
    own(G.cozy?.scav, () => !!G.cozy.scav.busy);
  }

  // ------------------------------------------------------------------ downed and revived
  /** 'player:dead' in a slot's context, or player 1 knocked out with someone still standing: down, not out */
  down(s) {
    const G = this.G;
    if (this.isDown(s)) return true;
    const run = () => {
      G.playerDead = true;
      const P = G.player;
      G.skills?.clearAll?.(); P.moveTarget = null; P.interactTarget = null;
      P.anim.play('die');
      Events.emit('sfx', 'player_die', { vol: 0.6 });
      Actions.rumble(0.6, 0.7, 300);
    };
    this.with(s, run);
    if (!s.primary) s.downed = { t: 0, rev: 0 }; else this.p1.downed = { t: 0, rev: 0 };
    const B = this.bodyOf(s); this.primary(() => G.ui?.float?.(B.pos.clone().setY(B.pos.y + 1.8), 'Needs a hand!', { kind: 'status', color: s.color })); // (drawn as player 1's view, over their head)
    Events.emit('coop:downed', { n: s.n });
    if (this.slots.every(x => this.isDown(x))) this.wipe();
    return true;
  }
  /** game.js 'player:dead' for player 1: with a teammate standing, player 1 is downed too (→ true) */
  onP1Dead() {
    if (!this.active || this.cur) return false;
    if (!this.others.some(s => !s.downed && !s.gone)) return false;
    this.down(this.p1);
    return true;
  }
  wipe() {
    // the whole pack is down: Shadow drags everyone home (player 1's knock-out flow; mode:changed revives the rest)
    if (this.wiping) return;
    this.wiping = true; this.p1.downed = null;
    this.primary(() => this.G.partyWipe?.());
  }
  revive(s, frac, why = 'friend') {
    const G = this.G;
    s.downed = null;
    this.with(s, () => {
      G.playerDead = false;
      G.actions.restoreAll();
      G.state.player.life = Math.max(1, Math.round(G.derived.lifeMax * frac));
      const P = G.player; P.anim.stop(); P.anim.play('happy');
      G.vfx?.heal?.(P.pos.clone());
      G.vfx?.sparkle?.(P.pos.clone().setY(0.9), { n: 18, color: s.color, r: 0.6 });
      Events.emit('sfx', 'ui_levelup', { vol: 0.45, pitch: 1.3 });
      Actions.rumble(0.2, 0.4, 140);
    });
    Events.emit('coop:revived', { n: s.n, why });
  }
  updateDowned(dt) {
    if (this.wiping) return;
    for (const s of this.slots) {
      const D = s.downed; if (!D) continue;
      const P = this.bodyOf(s); if (!P) continue;
      D.t += dt;
      let n = 0;
      for (const o of this.slots) { if (o === s || this.isDown(o)) continue; const B = this.bodyOf(o); if (B && Math.hypot(B.pos.x - P.pos.x, B.pos.z - P.pos.z) < REVIVE_R) n++; }
      D.helpers = n;
      if (n) D.rev += dt * (1 + 0.5 * (n - 1)); else D.rev = Math.max(0, D.rev - dt * 0.5);
      if (D.rev >= REVIVE_T) this.revive(s, REVIVE_LIFE, 'friend');
      else if (D.t >= DOWN_AUTO) this.revive(s, AUTO_LIFE, 'shadow');
    }
  }
  /** a mode change (a floor, a zone, home, a house): everyone comes along, beside player 1; the downed get back up */
  regroup() {
    this.wiping = false;
    if (!this.active) return;
    const G = this.G, P1 = this.bodyOf(this.p1);
    const home = G.mode === 'village';
    for (const s of this.slots) {
      if (s.downed || (s.primary && G.playerDead)) { if (s.primary) { s.downed = null; continue; } this.revive(s, home ? 1 : 0.5, 'regroup'); }
    }
    for (const s of this.others) {
      const B = s.body;
      if (B.world !== G.world) B.changeWorld(G.world);
      this.with(s, () => { G.skills.clearAll?.(); G.padAim.clear(); G.padAim.hideRing?.(); if (home) G.actions.restoreAll(); });
      const at = this.spotNear(P1.pos, s.n);
      B.setPos(at.x, at.z); B.moveTarget = null; B.interactTarget = null; B.facing = B.faceTarget = P1.facing; B.sync();
      B.paneOpen = !!s.pane;
    }
    this.cam.snap = true;
  }
  /** swapWorld (game.js): the other heroes go to the new world with player 1 */
  changeWorld(world) { for (const s of this.others) if (s.body.world !== world) s.body.changeWorld(world); }

  // ------------------------------------------------------------------ monsters, loot, XP
  /** crowd.js: one monster's update, as the hero it's after (its bites and AoEs land on that hero) */
  foeUpdate(m, dt) {
    const s = this.foeTarget(m);
    if (!s) { const G = this.G; return this.primary(() => { const pd = G.playerDead; G.playerDead = true; try { m.update(dt); } finally { G.playerDead = pd; } }); } // (nobody to chase: everyone's down or in their bag)
    return this.with(s, () => m.update(dt));
  }
  /** the hero a monster goes after: the nearest standing one not in their bag (sticky, so it doesn't dither) */
  foeTarget(m) {
    let best = null, bd = 1e9, cur = m._coopT;
    for (const s of this.slots) {
      if (this.isDown(s) || s.pane) continue;
      const B = this.bodyOf(s); if (!B || B.hidden) continue;
      let d = Math.hypot(B.pos.x - m.pos.x, B.pos.z - m.pos.z);
      if (s === cur) d -= 2.5;
      if (d < bd) { bd = d; best = s; }
    }
    m._coopT = best;
    return best;
  }
  /** the standing heroes' bodies (enemy projectiles: combat/projectile.js) */
  pushBodies(out) { for (const s of this.slots) if (!this.isDown(s)) { const B = this.bodyOf(s); if (B) out.push(B); } return out; }
  /** the nearest standing hero to (x, z): ground loot's magnet (combat/groundLoot.js) */
  nearest(x, z, max = 1e9) {
    let best = null, bd = max;
    for (const s of this.slots) { if (this.isDown(s) || s.pane) continue; const B = this.bodyOf(s); if (!B) continue; const d = Math.hypot(B.pos.x - x, B.pos.z - z); if (d < bd) { bd = d; best = B; } } // (in their bag: not walking over anything)
    return best;
  }
  /** XP for a kill or a quest: every hero in the pack gets it (each with their own catch-up and level-ups) */
  shareXp(n) {
    let got = 0;
    for (const s of this.slots) { const g = this.with(s, () => this.G.actions.addXp(n)); if (s.primary) got = g; }
    return got;
  }
  /** 'player:levelup' in a slot's context: their own sparkle, sound and a small banner (never player 1's restore) */
  levelUp(s, p) {
    const G = this.G, P = s.body;
    G.vfx?.levelUp?.(P.pos.clone());
    G.actions.restoreAll();
    Events.emit('sfx', 'ui_levelup', { vol: 0.7 });
    this.primary(() => G.ui?.toast?.(`P${s.n} · ${P.name} is now level ${p?.lvl ?? G.state.player.lvl}!`, { icon: 'star', color: s.color }));
    Events.emit('coop:levelup', { n: s.n, lvl: p?.lvl });
    return true;
  }
  /** what drops is for the whole pack: the loot class takes turns through everyone's heroes */
  rotateLoot(dt) {
    if ((this.lootT -= dt) > 0) return;
    this.lootT = 1.3;
    const ids = this.slots.map(s => this.heroOf(s)).filter(Boolean);
    this.lootI = (this.lootI + 1) % ids.length;
    setLootClass(ids[this.lootI]);
  }

  // ------------------------------------------------------------------ the camera and the leash
  /** game.js's camera: the middle of the pack, pulled back as it spreads (until everyone sits inside a comfortable
   *  box on screen, up to EXTRA m further out) */
  frame(rig) {
    const { f, r } = rig.groundAxes(), cam = this.G.engine.camera;
    let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9, y = 0, n = 0;
    for (const s of this.slots) {
      const B = this.bodyOf(s); if (!B) continue;
      const x = B.pos.x * r.x + B.pos.z * r.z, z = B.pos.x * f.x + B.pos.z * f.z;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); y += B.pos.y; n++;
    }
    if (!n) return;
    const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2 - (maxZ - minZ) * 0.08; // (a touch toward the camera: the pack sits a little high, clear of the skill bar)
    rig.focus.set(r.x * cx + f.x * cz, y / n + 0.6, r.z * cx + f.z * cz);
    // how much further out the camera must be for everyone to sit in the box: screen offsets shrink as 1 / distance
    _a.copy(rig.target).project(cam);
    let k = 0;
    for (const s of this.slots) {
      const B = this.bodyOf(s); if (!B) continue;
      _v.copy(B.pos).setY(B.pos.y + 0.7).project(cam);
      const dy = _v.y - _a.y; k = Math.max(k, Math.abs(_v.x - _a.x) / BOX_X, dy > 0 ? dy / BOX_UP : -dy / BOX_DOWN);
    }
    const D = rig.dist + rig.distBias + rig.extraDist, base = rig.dist + rig.distBias;
    rig.extraDistTarget = Math.max(0, Math.min(EXTRA, D * k - base));
    if (this.cam.snap) { this.cam.snap = false; rig.extraDist = 0; rig.target.copy(rig.focus); }
  }
  /** nobody walks off the screen: a hero who'd step past its edge (EDGE_*, on screen) stays where they were,
   *  which pushes the camera back until it's all the way out; one far off (stuck behind) sparkles back to player 1 */
  leash() {
    const G = this.G, cam = G.engine.camera, P1 = this.bodyOf(this.p1);
    const last = this.lastPos ||= new Map();
    for (const s of this.slots) {
      const B = this.bodyOf(s); if (!B) continue;
      const L = last.get(B);
      const jump = L && (B.pos.x - L.x) ** 2 + (B.pos.z - L.z) ** 2 > 6.25; // (a teleport, a blink or a regroup, not a walk: never undone)
      if (!this.isDown(s) && L && !jump && !B.leap && !B.dash) {
        if (!s.primary && Math.hypot(B.pos.x - P1.pos.x, B.pos.z - P1.pos.z) > CATCH_UP) { // (stuck, or left behind: back beside player 1 in a sparkle)
          const at = this.spotNear(P1.pos, s.n);
          G.vfx?.sparkle?.(B.pos.clone().setY(0.8), { n: 10, color: s.color }); B.setPos(at.x, at.z); B.moveTarget = null; G.vfx?.sparkle?.(B.pos.clone().setY(0.8), { n: 14, color: s.color });
        } else {
          _v.copy(B.pos).setY(B.pos.y + 0.7).project(cam);
          const out = Math.max(Math.abs(_v.x) / EDGE_X, _v.y > 0 ? _v.y / EDGE_UP : -_v.y / EDGE_DOWN);
          if (out > 1) {
            _a.set(L.x, B.pos.y + 0.7, L.z).project(cam);
            const was = Math.max(Math.abs(_a.x) / EDGE_X, _a.y > 0 ? _a.y / EDGE_UP : -_a.y / EDGE_DOWN);
            if (out > was + 1e-4) { B.pos.x = L.x; B.pos.z = L.z; B.pos.y = B.world.heightAt(L.x, L.z); B.sync(); B.leashed = 0.2; } // (only ever held back from going further out)
          }
        }
      }
      if (L) L.copy(B.pos); else last.set(B, B.pos.clone());
    }
    if (last.size > 8) for (const B of [...last.keys()]) if (!this.slots.some(s => this.bodyOf(s) === B)) last.delete(B);
  }

  /** game.js updateOcclusion: players 2-4's cut-away circles (uOcclB: screen px, radius, view depth; w -1e4 = off) */
  occlusion(out, r, pr) {
    const cam = this.G.engine.camera, o = this.others;
    for (let i = 0; i < out.length; i++) {
      const s = o[i], B = s?.body;
      if (!B || B.world !== this.G.world) { out[i].set(-9999, -9999, 1, -1e4); continue; }
      _v.copy(B.pos).setY(B.pos.y + 0.55);
      const depth = -_v.clone().applyMatrix4(cam.matrixWorldInverse).z;
      _v.project(cam);
      out[i].set((_v.x * 0.5 + 0.5) * innerWidth * pr, (_v.y * 0.5 + 0.5) * innerHeight * pr, r, depth);
    }
  }

  // ------------------------------------------------------------------ for the HUD and the panes
  /** every player has their bag open (a dungeon or a zone then pauses: game.js) */
  allPaned() { return this.active && this.slots.every(s => !!s.pane || this.isDown(s)) && this.slots.some(s => !!s.pane); }
  /** a player's buttons for a pane (ui/coopPanes.js): players 2-4 their pad's view; player 1 the action layer (their
   *  pad, the keyboard). { nav, dnav, padHit(t), padDown(t), padConsume(t), pressed(a), held(a), consume(a), rumble() } */
  inputOf(s) {
    if (!s.primary) { const V = s.pad.view; return { get nav() { return s.pad.nav; }, get dnav() { return s.pad.dnav; }, padHit: t => s.pad.pPressed.has(t), padDown: t => s.pad.cur.has(t), padConsume: t => s.pad.pPressed.delete(t), pressed: a => V.pressed(a), held: a => V.held(a), consume: a => V.consume(a), move: () => V.move(), aim: () => V.aim(), rumble: (a, b, ms) => V.rumble(a, b, ms), device: 'pad' }; }
    return { get nav() { return Actions.nav; }, get dnav() { return Actions.dnav; }, padHit: t => Actions.padHit(t), padDown: t => Actions.padDown(t), padConsume: t => Actions.padConsume(t), pressed: a => Actions.pressed(a), held: a => Actions.held(a), consume: a => Actions.consume(a), move: () => Actions.move(), aim: () => Actions.aim(), rumble: (a, b, ms) => Actions.rumble(a, b, ms), get device() { return Actions.device; } };
  }
  /** a player's hero card: { n, color, hero, name, lvl, life, lifeMax, zoom, zoomMax, xp, xpNext, downed, pane, prompt, picker, lost } */
  card(s) {
    const G = this.G;
    return this.with(s, () => {
      const P = G.state.player, D = G.derived, A = G.actions;
      return {
        n: s.n, color: s.color, hero: this.heroOf(s), name: CLASSES[this.heroOf(s)]?.name, cls: CLASSES[this.heroOf(s)],
        lvl: P.lvl, life: A.life(), lifeMax: D.lifeMax, zoom: A.zoom(), zoomMax: D.zoomMax, xp: P.xp, statPts: P.statPts, skillPts: P.skillPts,
        hotbar: P.hotbar, cds: G.skills ? P.hotbar.map(id => (id ? G.skills.cooldownFrac(id) : 0)) : [],
        downed: s.downed ? { t: s.downed.t, rev: s.downed.rev / REVIVE_T, auto: s.downed.t / DOWN_AUTO, helpers: s.downed.helpers || 0 } : null,
        pane: s.pane, prompt: s.prompt, picker: s.picker, lost: s.lostT > 0.5,
      };
    });
  }
  /** debug / QA: a virtual pad joins as hero (tools/qa/s49-coop.mjs drives real virtual pads instead) */
  debugJoin(hero, index) {
    let r = this.readers.get(index);
    if (!r) { r = new PadReader(index); this.readers.set(index, r); }
    return this.join(r, hero || this.freeHeroes()[0]);
  }
}

/** game.js: G.coop, after the input routing and the skills exist */
export function installCoop(G, opts) {
  const C = G.coop = new Coop(G, opts);
  if (G.player) G.player._coopSlot = C.p1;
  C.ownSessions();
  // the HUD's player cards, the join card and the pickers; the shared bag panes (lazy chunks: only the UI needs them)
  if (G.ui) {
    import('../ui/coopHud.js').then(m => m.installCoopHud?.(G, C)).catch(e => console.warn('[coop] hud', e.message));
    import('../ui/coopPanes.js').then(m => m.installCoopPanes?.(G, C)).catch(e => console.warn('[coop] panes', e.message));
  }
  registerDebug('coop', [
    { id: 'coopLeaveAll', group: 'Couch co-op', label: 'Everyone but player 1 leaves', run: () => { for (const s of C.others) C.leave(s); return 'Players 2-4 left'; } },
    { id: 'coopDown', group: 'Couch co-op', label: 'Knock out player 2', run: () => { const s = C.others[0]; if (!s) return 'Nobody to knock out'; C.down(s); return 'Player 2 is down'; } },
  ]);
  return C;
}
