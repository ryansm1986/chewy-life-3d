// Hero roster: which hero the player controls, switching between them (with a zoom-out / zoom-in transition), and the
// heroes nobody is playing living in Blossom Hollow as villagers (docs/HEROES.md §4-6, docs/POE.md §6).
// Any number of heroes (classes.js HERO_IDS: Chewy, Moka, Poe): tap Tab for the next joined hero in roster order, hold
// Tab for the hero wheel (ui/heroWheel.js) to pick one; the HUD shows a mini portrait per benched hero.
//
// One controlled body: G.player (the Player actor) always embodies the ACTIVE hero — switching swaps its rig, class and
// weapons (Player.setHero) and relinks state.player / state.equipment (actions.setActiveHero), so every system that
// holds G.player or reads G.state.player keeps working. Each hero that isn't being played is a Villager built with that
// hero's rig (`hero: true`), running the same daily routines as the rest of the cast.
// Multiplayer seam (docs/MULTIPLAYER.md): a remote player's hero is just another "controlled body"; the roster and the
// NPC-mode handoff here are what a session host would drive per connected player.
import * as THREE from 'three';
import { CLASSES, HERO_IDS } from '../rpg/classes.js';
import { setLootClass } from '../rpg/items.js';
import { CAST } from './charKit.js';
import { Villager } from './npc.js';
import { Player } from './player.js';
import { Events } from '../core/events.js';
import { Input } from '../core/input.js';
import { HeroWheel } from '../ui/heroWheel.js';
import { PoeJoin } from './poeJoin.js';

const V = (x, z) => new THREE.Vector3(x, 0, z);
const ease = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const pick = a => a[Math.floor(Math.random() * a.length)];
const SWITCH_CD = 2;
const WHEEL_HOLD = 0.26; // s: Tab held this long opens the hero wheel (a shorter press is a tap: the next hero)
// where a hero who hasn't joined yet waits: Moka by the fountain (she joins in town), Poe in the Bamboo region (she joins
// there: docs/POE.md §5) — so she isn't in town until she has joined
const JOIN_AT = { moka: 'fountain', poe: 'bamboo' };
const ARRIVE_PITCH = { chewy: 1, moka: 1.12, poe: 1.22 };
// where a hero stands when whisked home from the Burrow (beside Chewy's house door; they share the house)
const HOME_OFS = { chewy: [1.6, 1.0], moka: [-0.2, 1.7], poe: [-1.5, 1.2] };

// what the hero you are NOT playing says when you walk up to them ({me} = the active hero's name)
const HERO_CHAT = {
  chewy: [
    ['{me}! Is it my turn? Shadow keeps giving me the zoomies look.', 'My Bone Katana is polished and ready. Well — licked. Same thing.'],
    ['I tried reading one of your books, {me}. I got to page two and took a nap on it.', 'It was a very good nap.'],
    ["Kuma gave me a melon-pan. I only ate half! …Okay, I ate all of it.", 'Want to go bonk some yokai?'],
    ['Did you know the koi in the pond follow you if you wag at them?', "I've been doing it for an hour. They love me."],
  ],
  moka: [
    ["Oh, hi {me}! I've been reading about the yokai of the Burrow.", 'Did you know kasa-obake HATE being folded? Useful!'],
    ['I practised Wet Dog Shake by the fountain. Kero was… not amused.', 'Shall I take a turn in the Burrow?'],
    ['The mallards at the pond say hello. I speak a little duck.', '*quack*. That means "let\'s go on an adventure".'],
    ["{me}, you have mud on your ears again. Here — *splash*.", "There. Now we're ready for anything."],
  ],
  poe: [
    ['*whispers* {me}! Don\'t look now, but I have been shadowing you for an hour.', '…You saw me? But I was behind a lantern! A very thin lantern.'],
    ['I have perfected the Silent Step. Not one creak. *snort* …That was the wind.', 'Shall I take a turn in the Burrow? The yokai will never hear me coming.'],
    ["I practised Substitution on Kuma's melon-pan. Now there's a chew-toy log on his counter.", 'He has not noticed yet. A true shinobi leaves no trace!'],
    ['Ah… ah… *ACHOO!* …That was a decoy sneeze. To confuse my enemies.', '{me}, you have crumbs on your nose. A shinobi notices these things.'],
  ],
};

export class HeroManager {
  constructor(G) {
    this.G = G;
    this.villagers = {}; // heroId → Villager (the heroes nobody is playing)
    this.cds = {};       // heroId → that hero's skill cooldowns while benched
    this.cd = 0;         // switch cooldown (s)
    this.T = null;       // running transition
    this.tab = null;     // a Tab press being timed (tap = next hero, hold = the wheel)
    this.wheel = null;   // ui/heroWheel.js (made on first use)
    this.poeJoin = new PoeJoin(G, this); // Poe's joining scene in the Bamboo Grove + the rumour in town (actors/poeJoin.js)
    // back in town: a hero who joined while you were out (Poe, in the bamboo) moves into the cottage
    Events.on('mode:changed', p => { if (p?.mode === 'village') this.spawnBench(); });
    setLootClass(this.active);
  }
  get active() { return this.G.state.activeHero || 'chewy'; }
  cls(id = this.active) { return CLASSES[id] || CLASSES.chewy; }
  name(id = this.active) { return this.cls(id).name; }
  joined(id) { return id === 'chewy' || !!this.G.state.flags?.[`${id}Joined`]; }
  /** heroes the player could switch to right now (joined and not the active one), in roster order */
  bench() { return HERO_IDS.filter(id => id !== this.active && this.joined(id)); }
  /** the next joined hero after `from` in roster order (wrapping round): what a Tab tap switches to */
  next(from = this.active) {
    const n = HERO_IDS.length, i0 = HERO_IDS.indexOf(from);
    for (let k = 1; k < n; k++) { const id = HERO_IDS[(i0 + k) % n]; if (id !== this.active && this.joined(id)) return id; }
    return null;
  }
  get wheelOpen() { return !!this.wheel?.open; }
  get switching() { return !!this.T; }

  // ------------------------------------------------------------------ heroes as villagers
  homeDoor() {
    const rec = this.G.sim?.list.find(r => r.data.type === 'chewyHouse');
    const L = this.G.village.world.landmarks;
    return rec ? rec.door.clone() : V(L.chewyHouse.x + 2.2, L.chewyHouse.z);
  }
  homeSpot(id) { const d = this.homeDoor(), o = HOME_OFS[id] || [1, 1]; return V(d.x + o[0], d.z + o[1]); }
  /** Boot: every hero that isn't being played goes about their day in town (Moka waits by the fountain until she joins;
   *  Poe isn't in town until she has joined: she's out in the bamboo). */
  spawnBench() {
    const L = this.G.village.world.landmarks;
    for (const id of HERO_IDS) {
      if (id === this.active || this.villagers[id]) continue;
      if (!this.joined(id) && JOIN_AT[id] !== 'fountain') continue;
      const at = this.joined(id) ? this.homeSpot(id) : V(L.plaza.x + 2.4, L.plaza.z - 1.2);
      const v = this.spawnVillager(id, at.x, at.z);
      if (!this.joined(id)) { v.waitingToJoin = true; v.frozen = true; v.faceTo(L.spawn.x, L.spawn.z); }
    }
  }
  spawnVillager(id, x, z, face = null) {
    const G = this.G, W = G.village.world, L = W.landmarks;
    const rig = Player.buildRig(undefined, id);
    const v = new Villager(W, G, CAST[id], { id, anchor: { x: L.plaza.x, z: L.plaza.z }, home: this.homeDoor(), wander: 6, role: 'hero', rig });
    v.hero = true;
    v.interact.label = `Talk to ${this.name(id)}`;
    v.setPos(x, z);
    if (face != null) { v.facing = v.faceTarget = face; v.sync(); }
    G.npcs.push(v); this.villagers[id] = v;
    return v;
  }
  /** Take a hero out of town (they are about to be played). → where they were { x, z, face } */
  removeVillager(id) {
    const G = this.G, v = this.villagers[id];
    if (!v) return null;
    const inside = !v.visible || v.state === 'inside';
    const d = inside ? (v.homeInfo?.door || v.home || v.pos) : v.pos;
    const at = { x: d.x, z: d.z, face: v.facing, inside };
    v.retire();
    const i = G.npcs.indexOf(v); if (i >= 0) G.npcs.splice(i, 1);
    v.dispose();
    delete this.villagers[id];
    return at;
  }

  // ------------------------------------------------------------------ switching
  /** '' when a switch to `to` can start now, otherwise a short reason for the player */
  canSwitch(to = this.next()) {
    const G = this.G, P = G.player, ui = G.ui;
    if (!this.bench().length) return this.joined('moka') ? 'Nobody to switch with' : 'Moka is waiting by the fountain!';
    if (!to || to === this.active || !this.joined(to)) return 'Nobody to switch with';
    if (this.T) return 'busy';
    if (this.cd > 0) return 'busy';
    if (G.playerDead || G.titleActive || G.leavingDungeon || G.build?.active) return 'Not right now!';
    if (ui?.dlg?.active || ui?.anyModal?.() || ui?.iris?.active || P.controlLocked) return 'Not right now!';
    if (P.leap || P.dash) return 'busy';
    if (G.mode === 'interior' && !G.housing?.hosted(to)) return `${this.name(to)} is out and about — switch outside!`; // (indoors you swap with the hero who's home)
    if (G.housing?.decor?.active) return 'Not while decorating!';
    return '';
  }
  switchTo(to = this.next(), { quiet = false } = {}) {
    const G = this.G, P = G.player, why = this.canSwitch(to);
    if (why) {
      if (!quiet && why !== 'busy') { G.ui?.float?.(P.pos.clone().setY(P.pos.y + 1.7), why, { kind: 'status', color: '#9fd0ff' }); Events.emit('sfx', 'ui_error'); }
      return false;
    }
    const rig = G.engine.rig;
    G.skills?.clearAll?.();
    G.skills && (G.skills.queued = null);
    P.moveTarget = null; P.interactTarget = null; P.pendingLoot = null; P.controlLocked = true;
    this.T = { t: 0, from: this.active, to, mode: G.mode, dist0: rig.distTarget, pitch0: rig.pitch, focus0: P.pos.clone(), swapped: false };
    G.heroSwitching = true;
    G.ui?.heroCard?.({ id: to, name: this.name(to), title: this.cls(to).title, color: this.cls(to).color, portrait: G.portrait?.(to) });
    Events.emit('sfx', 'hero_swap');
    Events.emit('hero:switching', { from: this.active, to });
    return true;
  }
  // ------------------------------------------------------------------ Tab: tap for the next hero, hold for the wheel
  /** game.js calls this from handleInput (play input only). → true while the wheel is open (it takes the input) */
  tabInput(dt) {
    if (Input.hit('tab')) { Input.consume?.('tab'); this.tab = { t: 0 }; }
    // the wheel's own keys first: a number key pressed in the same frame Tab is let go of still picks that hero
    const open = this.wheelOpen;
    if (open) this.wheel.input();
    const T = this.tab;
    if (T) {
      if (Input.down('tab')) {
        T.t += dt;
        // (once per hold: after a key pick or Esc it stays shut until Tab is pressed again)
        if (!T.wheel && !this.wheelOpen && T.t >= WHEEL_HOLD && this.bench().length && !this.T) { T.wheel = true; this.openWheel(); }
      } else { // released: a tap switches to the next hero; letting go of a held Tab picks the wheel's highlight
        this.tab = null;
        if (this.wheelOpen) this.wheel.release(); else if (!T.wheel) this.switchTo();
      }
    }
    return open || this.wheelOpen;
  }
  openWheel() {
    const G = this.G;
    this.wheel ||= new HeroWheel(G, this);
    this.wheel.show();
    Events.emit('sfx', 'ui_open', { vol: 0.6 });
    Events.emit('hero:wheel', { open: true });
  }
  /** the wheel's choice (null: closed without picking) */
  pickFromWheel(id) {
    this.wheel?.hide();
    Events.emit('hero:wheel', { open: false, id });
    if (!id || id === this.active) return false;
    return this.switchTo(id);
  }
  /** what the wheel shows for each hero of the roster: { id, name, title, color, lvl, active, joined, ready, why } */
  roster() {
    return HERO_IDS.map(id => {
      const C = this.cls(id), joined = this.joined(id), active = id === this.active;
      const why = active ? 'Playing now' : joined ? this.canSwitch(id) : JOIN_AT[id] === 'fountain' ? 'Waiting by the fountain' : 'Somewhere in the bamboo…';
      return { id, name: joined || active ? C.name : '???', title: joined || active ? C.title : 'Not met yet', color: C.color, lvl: this.G.state.heroes?.[id]?.player?.lvl || 1, active, joined: joined || active, ready: !active && joined && !why, why: why === 'busy' ? 'Just a moment…' : why };
    });
  }
  update(dt) {
    this.cd = Math.max(0, this.cd - dt);
    this.poeJoin.update(dt);
    // a Tab press or the wheel can't outlive play input (a dialogue, a menu, a switch starting)
    const ui = this.G.ui;
    if ((this.tab || this.wheelOpen) && (this.G.player?.controlLocked || ui?.dlg?.active || ui?.anyModal?.() || this.G.titleActive || this.T)) { this.tab = null; if (this.wheelOpen) this.pickFromWheel(null); }
    this.wheel?.update?.(dt);
    const T = this.T; if (!T) return;
    const G = this.G, rig = G.engine.rig, P = G.player;
    T.t += dt;
    const OUT = 0.5, PAN = T.mode === 'village' ? Math.min(1.1, 0.35 + (T.panLen || 0) * 0.02) : 0.3, IN = 0.6;
    const far = T.mode === 'interior' ? T.dist0 + 6 : Math.max(T.dist0 + 16, T.mode === 'village' ? 40 : 36); // high enough to read as "zooming out to the map" (indoors just a step back: the room is all there is)
    if (T.t < OUT) { // pull back
      const k = ease(T.t / OUT);
      rig.distTarget = T.dist0 + (far - T.dist0) * k; rig.pitch = T.pitch0 + 0.26 * k;
      G.heroFocus = T.focus0;
    } else if (!T.swapped) { // the hand-off, while the camera is up high
      T.swapped = true;
      this.swap(T);
      T.panFrom = T.focus0.clone(); T.panTo = P.pos.clone(); T.panLen = T.panFrom.distanceTo(T.panTo);
    } else if (T.t < OUT + PAN) { // glide across town to the other hero
      G.heroFocus = T.panFrom.clone().lerp(T.panTo, ease((T.t - OUT) / PAN));
    } else if (T.t < OUT + PAN + IN) { // and swoop back in
      const k = ease((T.t - OUT - PAN) / IN);
      rig.distTarget = far + (T.dist0 - far) * k; rig.pitch = T.pitch0 + 0.26 * (1 - k);
      G.heroFocus = null;
    } else {
      rig.distTarget = T.dist0; rig.pitch = T.pitch0; G.heroFocus = null;
      P.controlLocked = false; G.heroSwitching = false; this.T = null; this.cd = SWITCH_CD;
      G.save?.();
      Events.emit('hero:switched', { from: T.from, to: T.to });
    }
  }
  swap(T) {
    const G = this.G, P = G.player, sh = G.companion, { from, to } = T;
    const old = { x: P.pos.x, z: P.pos.z, face: P.facing };
    let arrive;
    if (T.mode === 'interior') { // at home: the other hero was in the room with you, and the old hero stays in it
      const H = G.housing, v0 = H.hosted(to), at = v0 ? H.unhost(v0) : null;
      this.removeVillager(to);
      arrive = at || old;
      const h = this.homeSpot(from), v = this.spawnVillager(from, h.x, h.z);
      v.warm = true; v.state = 'inside'; v.visible = false;
      H.hostHero(v, { x: old.x, z: old.z });
      v.anim.play('wave');
    } else if (T.mode === 'village') {
      const at = this.removeVillager(to);                 // wherever the other hero was in town…
      arrive = at || old;
      const v = this.spawnVillager(from, old.x, old.z, old.face); // …and the old hero carries on right here
      v.warm = true; v.state = 'idle'; v.t = 2.2; v.greeted = 20; // (no boot warm-up teleport: a wave, then back to their day)
      v.anim.play('wave');
    } else {
      this.removeVillager(to);
      const h = this.homeSpot(from);                      // whisked home to Chewy's house
      this.spawnVillager(from, h.x, h.z).warm = true;
      arrive = old;                                       // the new hero tags in on the same spot
      // (the Burrow: the tag-in, a starlight column that blooms from the old hero's colour into the new one's — below)
      Events.emit('sfx', 'portal', { vol: 0.55 });
    }
    // per-hero skill cooldowns
    if (G.skills) { this.cds[from] = G.skills.cds; G.skills.cds = this.cds[to] || {}; }
    G.actions.setActiveHero(to);
    setLootClass(to);
    P.setHero(to);
    P.setPos(arrive.x, arrive.z);
    P.facing = P.faceTarget = arrive.face ?? old.face;
    P.sync();
    // Shadow joins whoever is being played
    if (sh && sh.pos.distanceTo(P.pos) > 6) { sh.setPos(P.pos.x + 0.9, P.pos.z + 0.6); sh.state = 'follow'; }
    G.vfx?.heroSwap?.(P.pos.clone(), { from: this.cls(from).color, to: this.cls(to).color }); // starlight column + paw glyph (spellFx)
    G.engine.post?.pulse?.(this.cls(to).color, 0.18); // a soft wash of the new hero's colour at the hand-off
    Events.emit('sfx', 'hero_arrive', { pitch: ARRIVE_PITCH[to] || 1 });
  }

  // ------------------------------------------------------------------ talking to the benched hero
  async talk(npc) {
    const G = this.G, id = npc.id, ui = G.ui;
    if (!ui?.dialogue) return;
    if (!this.joined(id)) return this.join(id, npc);
    const lines = pick(HERO_CHAT[id] || [['Hi!']]).map(s => s.replace(/\{me\}/g, this.name()));
    const lv = G.state.heroes?.[id]?.player?.lvl || 1, mine = G.state.player.lvl || 1;
    if (lv + 2 < mine) lines.push(`(${this.name(id)} is level ${lv} — the pack spirit helps them catch up: double XP!)`);
    npc.faceTo(G.player.pos.x, G.player.pos.z); npc.anim.play('wave');
    const c = await ui.dialogue({ speaker: this.name(id), portrait: G.portrait?.(id), lines, voice: CAST[id]?.voice, choices: [{ text: `Let's switch! (play as ${this.name(id)})` }, { text: 'See you later!' }] });
    if (c === 0) setTimeout(() => this.switchTo(id), 260);
  }
  /** A hero joins the pack: Moka's arrival scene (new games run it after Rosie's welcome); Poe's is her Bamboo scene
   *  (actors/poeJoin.js, docs/POE.md §5), which ends in joinPoe. */
  async join(id, npc = this.villagers[id]) {
    if (id === 'poe') return this.joinPoe();
    const G = this.G, ui = G.ui;
    if (id !== 'moka' || this.joined(id) || !ui?.dialogue) return;
    const P = G.player, portrait = G.portrait?.('moka'), me = this.name();
    if (npc) { npc.frozen = false; npc.waitingToJoin = false; npc.faceTo(P.pos.x, P.pos.z); npc.anim.play('wave'); G.vfx?.emote?.(npc, 'sparkle', 2); }
    const say = (lines, choices) => ui.dialogue({ speaker: 'Moka', portrait, lines, choices, voice: CAST.moka?.voice });
    G.actions.prepareJoin?.(id); // she arrives near the pack's level, with points to spend
    await say([`Oh! You must be ${me} — the brave pup from the Burrow notice at Rosie's shop!`, "I'm *Moka*. I've read every book about the Burrow… twice. The yokai down there are terribly rude to librarians.", 'I know a little water magic — well, a LOT of water magic — and some starlight tricks. And ducks. I know ducks.']);
    try { G.vfx?.spell?.prewarm?.(G.engine.renderer, G.engine.camera, true); } catch (e) { /* cosmetic */ } // her spell shaders compile behind the dialogue: no hitch on her first cast
    await say(['Could I join your pack? I brought my own staff!'], [{ text: 'Welcome to the pack, Moka! ♡' }, { text: 'The more paws the merrier!' }]);
    G.state.flags.mokaJoined = true;
    if (npc) { npc.anim.play('happy'); G.vfx?.emote?.(npc, 'heart', 2.4); G.vfx?.sparkle?.(npc.pos.clone().setY(0.8), { n: 24, color: '#5ce0d0', r: 0.8 }); }
    Events.emit('sfx', 'ui_quest');
    ui.banner?.('Moka joined the pack!', 'Press Tab to switch heroes', { style: 'levelup' });
    Events.emit('hero:joined', { id });
    G.save?.();
  }
  /** Poe joins the pack: the end of her Bamboo scene (actors/poeJoin.js), or at once for ?hero=poe and tests. She lives
   *  in Chewy's house with the others from now on (back in town: spawnBench on mode:changed). */
  async joinPoe() {
    const G = this.G;
    if (this.joined('poe')) return false;
    G.actions.prepareJoin?.('poe');
    G.state.flags.poeJoined = true;
    if (G.mode === 'village' && !this.villagers.poe && this.active !== 'poe') { const h = this.homeSpot('poe'); this.spawnVillager('poe', h.x, h.z).warm = true; }
    Events.emit('sfx', 'ui_quest');
    G.ui?.banner?.('Poe joined the pack!', 'Tap Tab for the next hero · hold Tab to pick', { style: 'levelup' });
    Events.emit('hero:joined', { id: 'poe' });
    G.save?.();
    return true;
  }
  /** New game, after Rosie's welcome: Moka hurries over from the plaza, the camera frames the pair, and she joins. */
  async introJoin() {
    const G = this.G, P = G.player, v = this.villagers.moka;
    if (!v || this.joined('moka') || !G.ui?.dialogue || G.mode !== 'village' || G.titleActive || G.ui.dlg?.active) return;
    const rig = G.engine.rig, { r } = rig.groundAxes();
    // start a few steps off to the side (open ground) and trot up to Chewy
    let from = null;
    for (const k of [6, -6, 5, -5, 7, -7, 4, -4]) {
      const x = P.pos.x + r.x * k, z = P.pos.z + r.z * k;
      if (G.world.walkable(x, z) && !G.world.collision.solidAt(x, z, 0.35)) { from = { x, z, k }; break; }
    }
    P.controlLocked = true;
    if (from) { v.setPos(from.x, from.z); G.vfx?.dust?.(v.pos, { n: 5, size: 0.4 }); }
    v.frozen = true; v.talking = false;
    const prevDist = rig.distTarget; rig.distTarget = 17;
    const to = { x: P.pos.x + (from ? r.x * Math.sign(from.k) * 1.6 : 1.2), z: P.pos.z + (from ? r.z * Math.sign(from.k) * 1.6 : 0.4) };
    await new Promise(res => { v.scriptWalk = { x: to.x, z: to.z, speed: 1.7, done: res, t: 0 }; });
    G.introFocus = P.pos.clone().lerp(v.pos, 0.5);
    P.faceTo(v.pos.x, v.pos.z);
    v.talking = true;
    try { await this.join('moka', v); } finally {
      v.talking = false; G.introFocus = null; rig.distTarget = prevDist; P.controlLocked = false;
      if (!G.tutorials?.enabled) G.ui?.toast?.('Tip: Tab switches heroes · talk to the other hero to switch too', { color: '#8fe0d0' }); // (else Moka's guide shows it)
    }
  }
}
