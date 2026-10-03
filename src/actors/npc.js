// Villagers: a little daily life. Each villager follows a loose schedule (G.day.hour) and picks activities from slots
// derived from the real village (see villageLife.js): sit on benches and the fountain rim, mind a shop counter, browse,
// water flower beds, tend the veggie patch, fish at the water's edge, admire statues, read the notice board, crank the
// well, sweep yards, soak in the hot spring. They stroll along the paths (grid A*), stop to chat with each other
// (facing, gestures, emotes, babble), greet and watch Chewy, and never walk through Chewy, Shadow or each other
// (look-ahead sidestep + soft separation). Everybody has a bedtime: at night they walk to their doorstep, turn to the
// door, step in (warm light spill, door sound) and are tucked in; in the morning they step back out the same way.
// Chewy can knock on a door at night: the villager shuffles out in a nightcap, yawns, mumbles a sleepy hello and a
// goodnight (no shop / request menus), waves and goes back to bed. A villager an active quest step needs waits up on
// the doorstep instead (and talks normally). Talking to Chewy pauses everything.
import * as THREE from 'three';
import { Actor } from './actor.js';
import { buildHumanoid } from './charKit.js';
import { rand, chance, dist, pick, clamp, damp, angleDiff } from '../core/util.js';
import { Events } from '../core/events.js';
import { Input } from '../core/input.js';
import { VillageLife, propGeo, nightcapGeo, ROD_TIP, CAN_SPOUT, BROOM_HEAD } from './villageLife.js';
import { gibberish } from '../audio/babble.js';
import { SEAT_LIFT } from './lifePoses.js';
import { NIGHT_CHAT } from '../world/story.js';
import { heroText } from '../rpg/classes.js';

const PLAYER_VR = 0.36, PET_VR = 0.34;
const _dir = new THREE.Vector3(), _prev = new THREE.Vector3(), _w = new THREE.Vector3();
const lineMat = new THREE.LineBasicMaterial({ color: '#fff8ec', transparent: true, opacity: 0.8 });

// activity definitions (slot kind -> how to do it)
const ACT = {
  bench: { pose: 'sitBench', seat: true, dur: [24, 55], emote: ['note', 'heart', 'sparkle'] },
  rim: { pose: 'sitBench', seat: true, dur: [14, 32], emote: ['sparkle', 'note'] },
  counter: { pose: 'shopkeep', dur: [40, 80], fidget: ['bow', 'lookAround', 'stretch', 'nod'], chatty: true },
  browse: { pose: 'read', dur: [8, 15], fidget: ['scratchHead', 'nod', 'clap'], emote: ['?', 'heart', '!'], chatty: true },
  farm: { pose: ['tend', 'water'], dur: [18, 34], fidget: ['stretch'], emote: ['note', 'sparkle'] },
  garden: { pose: 'water', dur: [9, 16], emote: ['note', 'heart'] },
  fish: { pose: 'fish', dur: [30, 60] },
  admire: { pose: 'admire', dur: [8, 16], fidget: ['clap', 'lookAround'], emote: ['sparkle', 'heart', 'note'], chatty: true },
  sweep: { pose: 'sweep', dur: [12, 22], fidget: ['stretch'], emote: ['note'] },
  well: { pose: 'crank', dur: [4, 6] },
  board: { pose: 'read', dur: [6, 11], fidget: ['scratchHead', 'nod'], emote: ['?', '!', 'note'], chatty: true },
  lantern: { pose: 'admire', dur: [14, 26], fidget: ['yawn', 'lookAround'], emote: ['sparkle', 'heart'], chatty: true },
  onsen: { hide: true, dur: [35, 60] },
};
const PROP_FOR = { sweep: 'broom', water: 'can', fish: 'rod' };
const SEATED = new Set(['sitBench', 'sitDoze', 'sitWave', 'standUp']);
// schedule: base weights per part of day (named villagers without a home stay out at night)
function schedule(h, night) {
  if (night) return { bench: 3, rim: 1.2, lantern: 3, onsen: 1.2, chat: 1, stroll: 0.5, idle: 1.5 };
  if (h < 9.5) return { sweep: 3, garden: 3, farm: 2.2, well: 1.6, board: 1.6, stroll: 1.5, bench: 1, rim: 0.6, admire: 1, chat: 2.4, counter: 1.2, fish: 0.8, idle: 0.8 };
  if (h < 17) return { counter: 2.5, browse: 2.2, farm: 1.4, fish: 2, admire: 1.8, bench: 2, rim: 1.4, stroll: 2.2, chat: 3.4, board: 1, garden: 0.8, well: 0.6, idle: 0.8 };
  return { bench: 3, rim: 1.6, onsen: 3, admire: 1.6, lantern: 1.8, chat: 3.6, stroll: 1.5, fish: 1.2, idle: 0.8 };
}
const LIKES = {
  mochi: { admire: 2.5, rim: 2, bench: 1.5, garden: 1.5 },
  usagi: { garden: 3, farm: 3.5 },
  kuma: { counter: 4, browse: 1.5, sweep: 1.5 },
  kitsune: { lantern: 3, board: 2.5, sweep: 2.5, admire: 1.5 },
  pan: { bench: 3.5, rim: 2, chat: 1.5 },
  tanu: { counter: 3.5, browse: 2.5, chat: 2 },
  kero: { fish: 5, admire: 1.5 },
  // the heroes on their day off (docs/HEROES.md §5): Chewy fishes, naps on benches and bothers everyone for a chat;
  // Moka reads the notice board, browses the shops and sits by the fountain (water!)
  chewy: { fish: 2.5, bench: 2, chat: 2.5, admire: 1.5, stroll: 1.5 },
  moka: { board: 3.5, browse: 2.5, rim: 2.5, fish: 1.8, garden: 1.6, chat: 2 },
};
const FOLK_LIKES = ['bench', 'garden', 'farm', 'fish', 'counter', 'browse', 'admire', 'sweep', 'chat', 'onsen', 'board'];
// bedtimes [in, out] in game hours. Rosie keeps her shop lit a little later; Kitsune (lantern gazing) and Kero (night
// fishing, the hot spring) are the night owls, but the whole cast is tucked in by 23:30. Townsfolk head home at dusk
// (19:15-20:00) and wake 5:30-6:30, staggered so doors open one by one.
const BED = { chewy: [22.4, 7.0], moka: [22.0, 6.6], rosie: [22.9, 6.6], mochi: [21.6, 7.0], usagi: [20.8, 6.0], kuma: [21.0, 5.8], kitsune: [23.3, 7.6], pan: [22.2, 8.0], tanu: [22.6, 7.2], kero: [23.0, 6.4] };
// nightcap colours (townsfolk pick one from their id)
const CAP_COLOR = { chewy: '#e0443a', moka: '#5cc8b8', rosie: '#ff8fb0', mochi: '#ffb3cf', usagi: '#9fe0c0', kuma: '#8fb8ff', kitsune: '#c9a0ff', pan: '#ffd36e', tanu: '#8fd0ff', kero: '#ffb07a' };
const CAP_FOLK = ['#8fb8ff', '#ffb3cf', '#9fe0c0', '#c9a0ff', '#ffd36e', '#ffb07a'];

export class Villager extends Actor {
  constructor(world, G, spec, { id, anchor, home = null, wander = 5, role = 'villager', rig = null } = {}) {
    super(world, rig || buildHumanoid(spec), { radius: 0.28, speed: 1.6, name: spec.name });
    this.G = G; this.id = id || spec.name.toLowerCase(); this.spec = spec;
    this.anchor = new THREE.Vector3(anchor.x, 0, anchor.z);
    this.home = home; this.wanderR = wander; this.role = role;
    this.state = 'idle'; this.t = rand(0, 3); this.target = null;
    this.talking = false; this.greeted = 0;
    this.setPos(anchor.x + rand(-1, 1), anchor.z + rand(-1, 1));
    this.faceTarget = rand(0, Math.PI * 2);
    this.interact = { pos: this.pos, radius: 1.3, label: `Talk to ${spec.name}`, onInteract: () => this.interacted(), actor: this };
    // daily life
    this.life = null; this.warm = false;
    this.act = null; this.chat = null; this.benchChat = null; this.chatCD = rand(4, 20); this.chatTalk = 0;
    this.goal = null; this.path = null; this.pi = 0; this.needPath = false;
    this.walkT = 0; this.walkMax = 30; this.stuckT = 0; this.sideT = 0; this.sideDir = 1; this.pauseT = 0;
    this.seated = false; this.fidgetT = rand(4, 10); this.look = 0; this.wasTalking = false;
    this.prop = null; this.propKind = null; this.props = null; this.line = null; this.bobber = null;
    this.likes = LIKES[this.id] || null;
    // home & bedtime (see villageLife.homeFor / doorInfo)
    this.homeRec = null; this.homeInfo = null; this._hv = -1; this.bedNow = false; this.homeTries = 0;
    this.door = null; this.doorScale = 1; this.doorLift = 0; this.knocked = false; this.knockT = 0; this.needT = 0; this.needOut = false;
    this.knockWait = 0; this.sleepy = false; this.sleepyWait = 0; this.zzzT = 0; this.cap = null; // woken by a knock
    // a hero nobody is playing (heroes.js): lives in Chewy's house, no hearts / gifts / quests
    this.hero = role === 'hero'; this.homeFixed = this.hero;
    this.frozen = false; // Moka before she joins: waits by the fountain
  }
  dispose() {
    this.line?.geometry.dispose(); // the fishing line (props and the bobber share cached geometry)
    super.dispose();
  }
  /** Leaving town for good (a hero about to be played): let go of seats, chats, door prompts. */
  retire() {
    this.clearTask();
    if (this.benchChat) this.endBenchChat();
    this.setNightcap(false);
    if (this.homeRec) this.life?.wakeUp(this, this.homeRec);
    this.talking = false; this.visible = true;
  }
  // waiting to be met (Moka by the fountain): reads a little, looks up and waves when the player comes close
  frozenTick(dt, p, pd) {
    const w = this.scriptWalk; // a scripted entrance (heroes.introJoin): trot to a spot, then carry on
    if (w) {
      w.t += dt;
      if (this.moveTo(w.x, w.z, dt, w.speed, 0.2) || w.t > 8) { this.scriptWalk = null; w.done?.(); }
      return;
    }
    this.greeted -= dt;
    if (p && pd < 7) { this.faceTo(p.pos.x, p.pos.z); if (this.greeted <= 0 && pd < 4.5 && !this.talking) { this.greeted = 12; this.anim.play('wave'); this.emote('!'); } }
    else if (!this.anim.action && (this.fidgetT -= dt) <= 0) { this.fidgetT = rand(5, 9); this.anim.play(pick(['lookAround', 'nod', 'stretch'])); }
  }
  get hour() { return this.G.day?.hour ?? 12; }
  update(dt) {
    const G = this.G;
    const life = this.life || (this.life = VillageLife.get(G));
    if (this.frozen) {
      const p = G.player, pd = p ? dist(p.pos.x, p.pos.z, this.pos.x, this.pos.z) : 99;
      if (this.talking && p) this.faceTo(p.pos.x, p.pos.z); else this.frozenTick(dt, p, pd);
      this.interact.pos = this.pos; this.anim.talk = this.talking ? 0.8 : 0;
      super.update(dt);
      return;
    }
    if (!life) return this.legacyUpdate(dt);
    life.frame();
    if (this._hv !== life.ver) this.resolveHome(life);
    const p = G.player;
    const pd = p ? dist(p.pos.x, p.pos.z, this.pos.x, this.pos.z) : 99;
    const inBed = this.inBed(), need = inBed && this.questNeed(dt);
    if (this.knocked && !this.door && !this.talking) { // answered the door: back to bed once the chat is over
      this.knockT += dt;
      if (this.wasTalking || this.knockT > 4) this.knocked = false;
    }
    const bed = this.bedNow = inBed && !need && !(this.knocked && this.knockT >= this.knockWait); // (a knock: a moment to get to the door)
    if (this.sleepy && !inBed && !this.talking && !this.knocked && !this.door && this.sleepyWait <= 0) { this.sleepy = false; this.setNightcap(false); } // knocked up at dawn: it's morning now
    if (!this.warm) { this.warm = true; if (life.warmup()) { if (bed) this.tuckIn(true); else if (chance(0.75)) this.decide(true); } }
    // someone else (intro, tests, story) reset us to idle: drop whatever we were doing
    if (this.state === 'idle' && (this.act || this.goal || this.chat)) this.clearTask();
    this.chatCD -= dt;
    if (this.talking) {
      if (!this.wasTalking) this.onTalk();
      if (p) { this.faceTo(p.pos.x, p.pos.z); this.faceTarget += this.faceBias || 0; }
      if (this.sleepy) this.drowsyTick(dt);
    } else if (this.door) {
      this.doorTick(dt, pd);
    } else if (this.sleepyWait > 0) { // just opened the door mid-yawn: blink at Chewy, then mumble
      this.sleepyWait -= dt;
      if (p) this.faceTo(p.pos.x, p.pos.z);
      if (this.sleepyWait <= 0) this.sleepyAnswer();
    } else if (bed) {
      this.nightTick(dt, pd);
    } else if (!this.visible && this.state !== 'inside') {
      this.stepOut(); // morning (staggered), a knock at the door, or a quest step needs us: out through the front door
    } else if (need && this.role !== 'shop' && this.homeInfo) {
      this.porchTick(dt, p, pd); // past bedtime but Chewy still has business with us: wait up on the doorstep
    } else {
      this.greetTick(dt, p, pd);
      switch (this.state) {
        case 'idle': this.idleTick(dt, p, pd); break;
        case 'walk': this.walkTick(dt); break;
        case 'act': this.actTick(dt, p, pd); break;
        case 'chat': this.chatTick(dt); break;
        case 'inside': this.insideTick(dt); break;
        default: this.state = 'idle'; this.t = 1;
      }
    }
    this.wasTalking = this.talking;
    if (this.visible && !this.seated && !this.door) this.separate(dt);
    this.interact.pos = this.pos;
    this.chatTalk = damp(this.chatTalk, this.talkWant(), 10, dt);
    this.anim.talk = this.talking ? 0.8 : this.chatTalk;
    super.update(dt);
    if (this.doorScale !== 1) { this.rig.root.scale.multiplyScalar(this.doorScale); this.shadow.scale.multiplyScalar(this.doorScale); }
    if (this.visible) this.post(dt, p, pd);
  }
  // ------------------------------------------------------------------ decisions
  decide(teleport = false) {
    const life = this.life;
    this.t = rand(2, 4);
    if (this.role === 'shop') return this.decideShop(teleport);
    const h = this.hour, night = this.G.day?.isNight?.() ?? false;
    const base = schedule(h, night);
    if (!this.likes) { this.likes = {}; for (let i = 0; i < 2; i++) this.likes[pick(FOLK_LIKES)] = 2.4; }
    let sum = 0; const opts = this._opts || (this._opts = []); opts.length = 0;
    for (const k in base) {
      let w = base[k] * (this.likes[k] || 1);
      if (teleport && (k === 'chat' || k === 'stroll' || k === 'idle' || k === 'onsen')) w *= 0.2;
      if (k === 'chat' && this.chatCD > 0) continue;
      if (k === 'onsen' && !this.folk && this.G.story?.markerFor?.(this.id)) continue; // Chewy needs them: stay visible
      if (ACT[k] && !this.freeSlot(k)) continue;
      if (w > 0) { opts.push(k, w); sum += w; }
    }
    let r = Math.random() * sum, kind = 'idle';
    for (let i = 0; i < opts.length; i += 2) { r -= opts[i + 1]; if (r <= 0) { kind = opts[i]; break; } }
    const near = this.home && (chance(0.35) || (this.homeInfo && this.hoursToBed() < 1.2)) ? this.home : this.anchor;
    if (kind === 'chat') {
      const pn = life.partner(this);
      if (pn) return this.startChat(pn);
      kind = 'stroll';
    }
    if (kind === 'stroll') {
      const q = life.nav.randomPathNear(this.anchor.x, this.anchor.z, 20); // (the 2x town: strolls reach the next street)
      if (q) { if (teleport) { this.setPos(q.x, q.z); this.anim.first = true; return; } return this.go(q.x, q.z, { kind: 'stroll', speed: rand(0.7, 0.85) }); }
      kind = 'idle';
    }
    if (ACT[kind]) {
      const sl = life.claim(this, kind, near, this.folk ? 38 : 30, teleport) || (near !== this.anchor ? life.claim(this, kind, this.anchor, 30, teleport) : null);
      if (sl) {
        if (teleport) return this.beginAct(sl, true);
        const sp = sl.spot || sl;
        return this.go(sp.ax ?? sp.x, sp.az ?? sp.z, { kind: 'slot', slot: sl, speed: kind === 'onsen' || kind === 'counter' ? 1 : 0.9 });
      }
    }
    // idle a while near the anchor (the old wander keeps them from freezing in one spot)
    if (chance(0.5)) {
      const a = rand(0, Math.PI * 2), rr = rand(1, this.wanderR);
      const x = this.anchor.x + Math.cos(a) * rr, z = this.anchor.z + Math.sin(a) * rr;
      if (this.world.walkable?.(x, z) !== false && !this.world.collision?.solidAt(x, z, 0.3)) return this.go(x, z, { kind: 'wander', speed: 0.75 });
    }
    this.state = 'idle'; this.t = rand(3, 7);
  }
  freeSlot(kind) { const l = this.life.byKind.get(kind); if (!l) return false; for (const s of l) if (!s.by && !s.dead) return true; return false; }
  // Rosie minds her shop front: sweep in the morning, stand at the counter, tiny wanders (never strays)
  decideShop(teleport) {
    const a = this.anchor, h = this.hour, r = Math.random();
    let sl = null;
    if (h > 5.5 && h < 10.5 && r < 0.4) sl = { kind: 'sweep', x: a.x + rand(-0.5, 0.5), z: a.z + rand(-0.5, 0.5), face: rand(0, Math.PI * 2), virtual: true, dur: [8, 14] };
    else if (r < 0.78) sl = { kind: 'counter', x: a.x, z: a.z, face: Math.PI / 4 + rand(-0.3, 0.3), virtual: true, dur: [12, 26] };
    if (sl) {
      if (teleport || dist(sl.x, sl.z, this.pos.x, this.pos.z) < 0.35) return this.beginAct(sl, teleport);
      return this.go(sl.x, sl.z, { kind: 'slot', slot: sl, speed: 0.8 });
    }
    const ang = rand(0, Math.PI * 2), rr = rand(0.4, this.wanderR);
    const x = a.x + Math.cos(ang) * rr, z = a.z + Math.sin(ang) * rr;
    if (this.world.walkable?.(x, z) !== false && !this.world.collision?.solidAt(x, z, 0.3)) return this.go(x, z, { kind: 'wander', speed: 0.8 });
    this.state = 'idle'; this.t = rand(2, 5);
  }
  // ------------------------------------------------------------------ walking
  go(x, z, o) {
    this.goal = { x, z, speed: 1, ...o };
    this.path = null; this.pi = 0; this.needPath = true;
    this.state = 'walk'; this.walkT = 0; this.stuckT = 0; this.sideT = 0; this.pauseT = 0;
  }
  walkTick(dt) {
    const g = this.goal; if (!g) { this.state = 'idle'; this.t = 1; return; }
    if (g.slot?.dead) return this.giveUp(); // its building was bulldozed
    if (this.needPath) {
      const d = dist(g.x, g.z, this.pos.x, this.pos.z);
      if (d < 3 && this.life.nav.clear(this.pos.x, this.pos.z, g.x, g.z, 254, -1)) this.path = [g.x, g.z];
      else {
        const r = this.life.path(this.pos.x, this.pos.z, g.x, g.z);
        if (r.busy) return; // out of path budget this frame
        this.path = r.pts;
      }
      this.needPath = false; this.pi = 0;
      if (!this.path) return this.giveUp();
      let len = 0, px = this.pos.x, pz = this.pos.z;
      for (let i = 0; i < this.path.length; i += 2) { len += Math.hypot(this.path[i] - px, this.path[i + 1] - pz); px = this.path[i]; pz = this.path[i + 1]; }
      this.walkMax = len / (this.speed * g.speed) * 1.8 + 6;
    }
    const r = this.followPath(dt, g.speed);
    if (r === 1) this.arrive(); else if (r === -1) this.giveUp();
    else if ((g.kind === 'stroll' || g.kind === 'wander') && this.chatCD <= 0 && (this.passT = (this.passT || 0) - dt) <= 0) {
      // bumping into a friend on the way: stop for a chat
      this.passT = 0.6;
      const pn = this.life.partner(this, 2.6);
      if (pn && chance(0.45)) this.startChat(pn);
    }
  }
  followPath(dt, mul) {
    if (this.pauseT > 0) { this.pauseT -= dt; return 0; }
    const P = this.path, pos = this.pos;
    let i = this.pi;
    let tx = P[i], tz = P[i + 1], last = i >= P.length - 2;
    let dx = tx - pos.x, dz = tz - pos.z, d = Math.hypot(dx, dz);
    if (!last && d < 0.45) { this.pi = i += 2; tx = P[i]; tz = P[i + 1]; last = i >= P.length - 2; dx = tx - pos.x; dz = tz - pos.z; d = Math.hypot(dx, dz); }
    const near = this.goal?.near || 0.13;
    if (last && (d < near || (near > 0.2 && d < near * 3 && this.stuckT > 0.8))) return 1; // (doorsteps: close, or wedged against the porch, counts)
    _dir.set(dx / d, 0, dz / d);
    const slow = this.steer(_dir, dt);
    const k = last ? Math.min(1, d / (this.speed * mul * dt + 1e-6)) : 1;
    const want = this.speed * mul * slow * k * dt;
    const moved = this.step(_dir, dt, mul * slow * k);
    this.walkT += dt;
    if (want > 1e-4 && moved < want * 0.35) this.stuckT += dt; else this.stuckT = Math.max(0, this.stuckT - dt * 2);
    if (this.stuckT > 0.7 && this.sideT <= 0) { this.sideT = 0.8; this.sideDir = chance(0.5) ? 1 : -1; }
    if (this.stuckT > 3.5 || this.walkT > this.walkMax) return -1;
    return 0;
  }
  // look-ahead avoidance: bend the heading around Chewy, Shadow and other villagers (keep left when head-on),
  // slow down near Chewy. Returns a speed multiplier.
  steer(dir, dt) {
    const G = this.G;
    this._lat = 0; this._slow = 1;
    if (G.player && !G.playerDead) this.avoid(dir, G.player, PLAYER_VR, true);
    if (G.companion?.pos) this.avoid(dir, G.companion, PET_VR, true);
    for (const n of G.npcs) if (n !== this && n.visible && !n.seated) this.avoid(dir, n, n.radius, false);
    let lat = this._lat;
    if (this.sideT > 0) { this.sideT -= dt; lat += this.sideDir * 1.3; }
    if (lat) {
      const rx = -dir.z, rz = dir.x;
      dir.x += rx * lat; dir.z += rz * lat;
      const l = Math.hypot(dir.x, dir.z) || 1; dir.x /= l; dir.z /= l;
    }
    return this._slow;
  }
  avoid(dir, e, er, soft) {
    const ox = e.pos.x - this.pos.x, oz = e.pos.z - this.pos.z;
    const along = ox * dir.x + oz * dir.z; if (along <= 0 || along > 1.7) return;
    const side = ox * -dir.z + oz * dir.x, clear = this.radius + er + 0.24;
    if (side >= clear || side <= -clear) return;
    const w = (1 - along / 1.7) * (1 - Math.abs(side) / clear);
    this._lat += (Math.abs(side) < 0.06 ? -1 : side > 0 ? -1 : 1) * w * 2.4; // pass on the far side; head-on: keep left
    if (soft && along < 1.1) this._slow = Math.min(this._slow, 0.5 + along * 0.4);
  }
  arrive() {
    const g = this.goal; this.goal = null; this.path = null;
    switch (g.kind) {
      case 'slot': return this.beginAct(g.slot, false);
      case 'chat': return this.chatArrive();
      case 'home': return this.enterDoor(this.G.player ? dist(this.G.player.pos.x, this.G.player.pos.z, this.pos.x, this.pos.z) : 99);
      case 'porch': this.state = 'porch'; this.t = rand(2, 4); return;
      default: {
        this.state = 'idle'; this.t = rand(2, 5);
        const pn = this.chatCD <= 0 && chance(0.4) ? this.life.partner(this, 6) : null;
        if (pn) return this.startChat(pn);
        if (g.kind === 'stroll' && chance(0.35)) this.anim.play(pick(['lookAround', 'stretch']));
      }
    }
  }
  giveUp() {
    const g = this.goal; this.goal = null; this.path = null;
    if (g?.slot) this.life.release(g.slot, this);
    if (g?.kind === 'chat') this.endChat(false);
    this.state = 'idle'; this.t = rand(1, 3);
  }
  // ------------------------------------------------------------------ activities
  beginAct(sl, instant) {
    const def = ACT[sl.kind];
    let pose = Array.isArray(def.pose) ? pick(def.pose) : def.pose;
    const h = this.hour, late = h >= 21 || h < 5.5;
    if (def.seat && ((late && chance(0.7)) || (this.id === 'pan' && chance(0.5)) || chance(0.08))) pose = 'sitDoze'; // sleepyheads
    const dur = sl.dur || def.dur;
    this.act = { slot: sl, spot: sl.spot || sl, def, kind: sl.kind, pose, t: rand(dur[0], dur[1]), phase: 'do', k: 0, fidgetT: rand(4, 9), emoteT: rand(5, 11), biteT: rand(7, 16), seq: 0, fx: 0 };
    this.state = 'act';
    if (def.hide) { // hot spring: slip inside for a soak
      this.visible = false; this.state = 'inside'; this.t = this.act.t; return;
    }
    if (def.seat) {
      if (instant) {
        const sp = this.act.spot;
        this.pos.set(sp.x, sl.seatY - this.seatDrop(), sp.z); this.facing = this.faceTarget = sl.face; this.sync();
        this.seated = true; this.anim.play(pose); this.anim.action.t = 1; this.anim.first = true;
      } else { this.act.phase = 'turn'; this.act.k = 0; this.faceTarget = sl.face; }
      return;
    }
    if (instant) { this.setPos(sl.x, sl.z); this.facing = sl.face; this.anim.first = true; }
    this.faceTarget = sl.face;
    this.anim.play(pose);
    this.setProp(PROP_FOR[pose] || null);
  }
  actTick(dt, p, pd) {
    const a = this.act;
    if (!a) { this.state = 'idle'; this.t = 1; return; }
    const sl = a.slot, sp = a.spot || sl;
    if (sl.dead) { this.endAct(); this.state = 'idle'; this.t = 1; return; }
    if (a.phase === 'turn') { // at the bench: turn around, then hop onto the seat
      a.k += dt;
      if (Math.abs(angleDiff(this.facing, sl.face)) < 0.35 || a.k > 0.7) { a.phase = 'sit'; a.k = 0; this.anim.play(a.pose); this.seated = true; }
      return;
    }
    if (a.phase === 'sit' || a.phase === 'rise') {
      a.k = Math.min(1, a.k + dt / 0.38);
      const u = a.phase === 'sit' ? a.k : 1 - a.k, e = u * u * (3 - 2 * u);
      this.pos.x = sp.ax + (sp.x - sp.ax) * e; this.pos.z = sp.az + (sp.z - sp.az) * e;
      const gy = this.world.heightAt(sp.ax, sp.az);
      this.pos.y = gy + (sl.seatY - this.seatDrop() - gy) * e;
      if (a.k >= 1) {
        if (a.phase === 'sit') a.phase = 'do';
        else { this.seated = false; this.setPos(sp.ax, sp.az); this.endAct(); this.state = 'idle'; this.t = rand(1.5, 3.5); }
      }
      return;
    }
    // ---- doing it
    a.t -= dt;
    if (a.faceHold > 0) a.faceHold -= dt; else this.faceTarget = sl.face;
    this.ensurePose();
    const busy = this.anim.action && this.anim.action.name !== a.pose;
    if (!this.seated && !busy && (pd > 1.4)) { // nudged off the spot: shuffle back
      const d = dist(sl.x, sl.z, this.pos.x, this.pos.z);
      if (d > 0.3) { _dir.set((sl.x - this.pos.x) / d, 0, (sl.z - this.pos.z) / d); this.step(_dir, dt, 0.5); this.faceTarget = sl.face; }
    }
    // standing fidgets and little emotes
    a.fidgetT -= dt; a.emoteT -= dt;
    if (a.def.fidget && a.fidgetT <= 0 && !busy) { a.fidgetT = rand(7, 14); this.anim.play(pick(a.def.fidget)); }
    if (a.emoteT <= 0) { a.emoteT = rand(8, 16); if (pd < 26) this.emote(a.pose === 'sitDoze' ? 'zzz' : a.def.emote ? pick(a.def.emote) : null); }
    if (a.pose === 'sitDoze' && a.emoteT > 4 && a.emoteT < 4 + dt) this.emote('zzz');
    if (a.kind === 'fish') this.fishTick(dt, a, pd);
    if (a.kind === 'bench' && this.seated && !this.benchChat && sl.pair?.by && sl.pair.by !== this && sl.pair.by.seated && sl.pair.by.act?.phase === 'do' && this.chatCD <= 0 && a.pose !== 'sitDoze' && sl.pair.by.act.pose !== 'sitDoze' && chance(dt * 0.25)) this.startBenchChat(sl.pair.by);
    if (this.benchChat) this.benchChatTick(dt);
    if (a.t <= 0 && !busy && !this.benchChat) {
      if (this.seated) {
        // don't stand up into Chewy
        if (p && dist(p.pos.x, p.pos.z, sp.ax, sp.az) < 0.8) { a.t = 1; return; }
        this.anim.play('standUp'); a.phase = 'rise'; a.k = 0;
      } else {
        const after = a.kind === 'farm' || a.kind === 'sweep' ? 'stretch' : a.kind === 'well' ? 'drink' : null;
        this.endAct(); this.state = 'idle'; this.t = rand(1.5, 3.5);
        if (after) this.anim.play(after);
      }
    }
  }
  // how far below the seat top the actor's feet origin goes so its rump rests on the seat: read from the baked rig
  // (lowest vertex skinned to the body bone), so it follows character redesigns and spec.scale
  seatDrop() {
    if (this._seatDrop != null) return this._seatDrop;
    let low = 0.25;
    try {
      const skin = this.rig.skin, bi = this.rig.skeleton?.bones.indexOf(this.rig.parts.body);
      if (skin && bi >= 0) {
        const P = skin.geometry.attributes.position, SI = skin.geometry.attributes.skinIndex; let m = Infinity;
        for (let i = 0; i < P.count; i++) if (SI.getX(i) === bi && P.getY(i) < m) m = P.getY(i);
        if (m < Infinity) low = m;
      }
    } catch (e) { /* keep the default */ }
    return (this._seatDrop = SEAT_LIFT + low * (this.rig.spec.scale || 1) - 0.035);
  }
  // half the body's width (widest of the body and head, from the baked rig) for bench seating; follows redesigns
  halfWidth() {
    if (this._hw != null) return this._hw;
    let w = 0.24;
    try {
      const skin = this.rig.skin, B = this.rig.skeleton?.bones, P = this.rig.parts;
      const b0 = B ? B.indexOf(P.body) : -1, b1 = B ? B.indexOf(P.head) : -1;
      if (skin && (b0 >= 0 || b1 >= 0)) {
        const pos = skin.geometry.attributes.position, SI = skin.geometry.attributes.skinIndex; let m = 0;
        for (let i = 0; i < pos.count; i++) { const b = SI.getX(i); if (b === b0 || b === b1) m = Math.max(m, Math.abs(pos.getX(i))); }
        if (m > 0) w = m;
      }
    } catch (e) { /* keep the default */ }
    return (this._hw = w * (this.rig.spec.scale || 1));
  }
  ensurePose() {
    const a = this.act; if (!a || this.anim.action) return;
    this.anim.play(a.pose);
    if (this.seated) this.anim.action.t = 1; // resume seated without re-sitting
  }
  fishTick(dt, a, pd) {
    a.biteT -= dt;
    if (a.seq === 0 && a.biteT <= 0) {
      a.seq = 1; a.biteT = 1.0;
      this.anim.play('reel'); this.emote('!');
      if (pd < 22) Events.emit('sfx', 'splash', { pos: this.bobber ? this.bobber.position : this.pos, vol: 0.45, pitch: 1.3 });
      this.splash();
    } else if (a.seq === 1 && a.biteT <= 0) {
      a.seq = 0; a.biteT = rand(9, 18);
      if (chance(0.6)) { this.emote(pick(['heart', 'sparkle'])); this.anim.play('clap'); } else { this.emote('sweat'); this.anim.play('scratchHead'); }
    }
  }
  endAct() {
    const a = this.act; if (!a) return;
    if (!a.slot.virtual) this.life.release(a.slot, this);
    this.act = null;
    if (this.benchChat) this.endBenchChat();
    this.setProp(null);
    if (this.anim.action && (this.anim.action.def.hold || SEATED.has(this.anim.action.name))) this.anim.stop();
    const sp = a.spot || a.slot;
    if (this.seated) { this.seated = false; if (sp.ax != null) this.setPos(sp.ax, sp.az); this.anim.first = true; }
  }
  insideTick(dt) {
    this.t -= dt;
    if (this.t > 0) return;
    const sl = this.act?.slot;
    this.endAct();
    this.visible = true; this.state = 'idle'; this.t = rand(2, 4);
    if (sl) { this.setPos(sl.x, sl.z); this.anim.first = true; }
    this.faceTarget = (sl?.face ?? 0) + Math.PI;
    this.emote('sparkle'); this.anim.play('stretch');
    this.G.vfx?.dust?.(this.pos, { n: 4, color: '#ffffff', size: 0.5 });
  }
  idleTick(dt, p, pd) {
    this.t -= dt;
    if (pd < 2.2 && p) this.faceTo(p.pos.x, p.pos.z);
    this.fidgetT -= dt;
    if (this.fidgetT <= 0 && !this.anim.action) {
      this.fidgetT = rand(6, 12);
      const h = this.hour;
      this.anim.play(h < 9 || h > 20 ? pick(['yawn', 'stretch', 'lookAround']) : pick(['lookAround', 'scratchHead', 'stretch', 'nod']));
    }
    if (this.t <= 0) this.decide(false);
  }
  // ------------------------------------------------------------------ home, bedtime, doors
  resolveHome(life) {
    this._hv = life.ver;
    const rec = life.homeFor(this);
    if (rec !== this.homeRec) { if (this.homeRec) life.wakeUp(this, this.homeRec); this.homeRec = rec; }
    this.homeInfo = rec ? life.doorInfo(rec) : null;
    if (rec) this.home = rec.door; // townsfolk: the sim's door point (follows upgrades); named cast: their assigned house
    if (rec && !this.visible && this.state === 'hidden') life.tuckIn(this, rec); // re-register the knock prompt
  }
  bedHours() {
    if (this._bed) return this._bed;
    if (BED[this.id]) return (this._bed = BED[this.id]);
    const f = ((parseInt(this.id.replace(/\D/g, ''), 10) || 0) * 0.618034 + 0.13) % 1;
    return (this._bed = this.folk ? [19.25 + f * 0.75, 5.55 + f * 0.9] : [21.2 + f, 6.4 + f]);
  }
  inBed() {
    if (!this.homeInfo && !this.home) return false; // homeless (no house built for us yet): the old stay-out routine
    const h = this.hour, [b, w] = this.bedHours();
    return h >= b || h < w;
  }
  hoursToBed() { return (this.bedHours()[0] - this.hour + 24) % 24; }
  // an active quest step needs Chewy to talk to us (or hand something over): stay reachable
  questNeed(dt) {
    if (this.folk) return false;
    if ((this.needT -= dt) > 0) return this.needOut;
    this.needT = 0.8;
    const G = this.G, S = G.story, Q = G.state?.quests;
    let need = false;
    if (S?.def && Q?.active) for (const q of Q.active) {
      const s = S.def(q.id)?.steps?.[q.step];
      if (!s || s.npc !== this.id) continue;
      if (s.type === 'talk' || (s.type === 'deliver' && (G.state.materials?.[s.mat] || 0) >= s.n)) { need = true; break; }
    }
    return (this.needOut = need);
  }
  nightTick(dt, pd) {
    if (this.state === 'inside') { this.endAct(); this.tuckIn(true); return; } // out of the hot spring and straight home, unseen
    if (!this.visible) return;
    const H = this.homeInfo, tx = H ? H.step.x : this.home.x, tz = H ? H.step.z : this.home.z;
    const d = dist(tx, tz, this.pos.x, this.pos.z);
    if (d < 0.6) return this.enterDoor(pd);
    // long past bedtime (a clock jump, a nap at home) and nobody watching: already home
    if (pd > 12 && (this.hour - this.bedHours()[0] + 24) % 24 > 1 && !this.onScreen()) return this.tuckIn(true);
    if (!(this.state === 'walk' && this.goal?.kind === 'home')) {
      this.clearTask();
      if (++this.homeTries > 3) return d < 2.5 ? this.enterDoor(pd) : this.tuckIn(false); // lost: don't jitter at a wall all night
      this.go(tx, tz, { kind: 'home', speed: this.hoursToBed() > 22.5 ? 1.2 : 1.35, near: 0.55 });
    }
    this.walkTick(dt);
  }
  onScreen() {
    const cam = this.G.engine?.camera; if (!cam) return true;
    _w.set(this.pos.x, this.pos.y + 0.6, this.pos.z).project(cam);
    return _w.z < 1 && Math.abs(_w.x) < 1.1 && Math.abs(_w.y) < 1.15;
  }
  // hidden inside for the night (silent = nobody saw it happen)
  tuckIn(silent) {
    this.clearTask();
    if (this.seated) this.seated = false;
    if (this.sleepy || this.cap) { this.sleepy = false; this.sleepyWait = 0; this.setNightcap(false); }
    if (!silent && this.visible) this.G.vfx?.dust?.(this.pos, { n: 5, color: '#ffffff', size: 0.45 });
    this.door = null; this.doorScale = 1; this.doorLift = 0; this.homeTries = 0;
    this.visible = false; this.state = 'hidden';
    this.life?.tuckIn(this, this.homeRec);
  }
  // the goodnight beat: (wave at Chewy if he's close) -> turn to the door -> it opens (light spill + sound) -> step in
  enterDoor(pd = 99) {
    const H = this.homeInfo;
    this.clearTask();
    if (!H) return this.tuckIn(false);
    const p = this.G.player, bye = p && !this.G.playerDead && (this.sleepy || (pd < 6 && chance(0.75)));
    const sh = clamp(dist(H.step.x, H.step.z, this.pos.x, this.pos.z) / 1.6, 0.4, 1.5); // shuffle onto the step
    this.door = { dir: 'in', t: 0, H, sx: this.pos.x, sz: this.pos.z, sh, bye: bye ? (this.sleepy ? 1.7 : 1.15) : 0, open: false };
    this.state = 'door'; this.homeTries = 0;
    if (bye) { this.faceTo(p.pos.x, p.pos.z); this.anim.play('wave'); this.emote(this.sleepy || chance(0.5) ? 'zzz' : 'heart'); }
  }
  // morning (or a knock): the door opens and we step out onto the doorstep
  stepOut() {
    const H = this.homeInfo;
    this.life?.wakeUp(this, this.homeRec);
    this.visible = true; this.anim.first = true; this.homeTries = 0;
    if (!H) { if (this.home) this.setPos(this.home.x, this.home.z); this.state = 'idle'; this.t = rand(0.5, 2); return; }
    this.setPos(H.inner.x, H.inner.z); this.facing = this.faceTarget = H.face + Math.PI;
    this.door = { dir: 'out', t: 0, H, open: false };
    this.state = 'door'; this.doorScale = 0.62; this.doorLift = 1;
  }
  answerDoor() {
    if (this.visible || this.door || this.knocked) return;
    this.knocked = true; this.knockT = 0;
    // woken up: a sleepy answer (nightcap, yawn, a drowsy goodnight) — unless a quest step needs us, then a normal chat
    this.sleepy = this.inBed() && !this.needOut && this.G.story?.markerFor?.(this.id) !== '!';
    this.knockWait = this.sleepy ? 1.3 : 0.3; // shuffling to the door takes a moment
    if (this.sleepy) this.setNightcap(true);
  }
  interacted() {
    if (this.sleepy) { // off back to bed: a sleepy wave is all Chewy gets now
      if (!this.talking && this.anim.action?.name !== 'wave') { this.anim.play('wave'); this.emote('zzz'); }
      return;
    }
    this.G.talkTo?.(this);
  }
  // the nightcap (the day hat, if any, goes on the hook: its baked bone is scaled away) — on the head's hat anchor
  setNightcap(on) {
    const P = this.rig.parts, head = P.head, anchor = P.hatAnchor;
    if (on && !this.cap && head) {
      const f = ((parseInt(this.id.replace(/\D/g, ''), 10) || this.id.length) * 7) % CAP_FOLK.length;
      const m = this.cap = new THREE.Mesh(nightcapGeo(CAP_COLOR[this.id] || CAP_FOLK[f]), this.rig.propMat || this.rig.mat);
      m.scale.setScalar(anchor?.userData.hatScale ?? 1); // sculpted (Disney-style) heads carry a smaller hat anchor
      m.castShadow = true;
      if (anchor && anchor.parent === head) m.position.copy(anchor.position); else m.position.set(0, 0.4, 0);
      m.rotation.set(-0.1, 0.35, -0.12);
      head.add(m);
      if (anchor) anchor.scale.setScalar(0.001);
      P.hatBone?.scale.setScalar(0.001); // (Moka's sculpted wizard hat)
    } else if (!on && this.cap) {
      this.cap.parent?.remove(this.cap); this.cap = null;
      if (anchor) anchor.scale.setScalar(anchor.userData.hatScale ?? 1);
      P.hatBone?.scale.setScalar(1);
    }
    this.interact.label = this.cap ? `Goodnight, ${this.spec.name}` : `Talk to ${this.spec.name}`;
  }
  // Chewy knocked after bedtime: two drowsy lines and a goodnight, no menus (story.js NIGHT_CHAT)
  sleepyAnswer() {
    const G = this.G, P = G.player;
    if (this.talking) return;
    const L = NIGHT_CHAT[this.folk ? 'folk' : this.id] || NIGHT_CHAT.folk;
    this.talking = true; if (P) P.controlLocked = true;
    this.zzzT = 2.5;
    const done = () => {
      this.talking = false; if (P) P.controlLocked = false;
      G.interactCooldown = performance.now() + 350; Input.consume('f');
    };
    const say = G.ui?.dialogue ? G.ui.dialogue({ speaker: this.spec.name, portrait: G.portrait?.(this.id), lines: [pick(L.hi), pick(L.bye)].map(l => heroText(l, G.state)), choices: [{ text: 'Sorry! Sleep tight 🌙' }], voice: this.spec.voice }) : Promise.resolve(null);
    say.then(done, done);
  }
  // listening half asleep: a drowsy sway with a nod-off every few seconds, a "zzz" now and then
  drowsyTick(dt) {
    if (!this.anim.action) this.anim.play('drowsy');
    if ((this.zzzT -= dt) <= 0) { this.zzzT = rand(3.5, 5); this.emote('zzz'); }
  }
  doorTick(dt, pd) {
    const D = this.door, H = D.H, pos = this.pos;
    D.t += dt;
    const lerpTo = (ax, az, bx, bz, e) => { pos.x = ax + (bx - ax) * e; pos.z = az + (bz - az) * e; pos.y = this.world.heightAt(pos.x, pos.z) + 0.16 * this.doorLift; };
    if (D.dir === 'in') {
      const t = D.t - D.bye;
      if (t < 0) return; // waving goodnight
      if (t < D.sh) { // shuffle onto the doorstep, turn to the door
        this.faceTarget = H.face; this.doorLift = 0;
        const u = t / D.sh; lerpTo(D.sx, D.sz, H.step.x, H.step.z, u * (2 - u));
        return;
      }
      if (!D.open) { D.open = true; this.doorFx(H, pd); if (this.anim.action?.name === 'wave') this.anim.stop(); }
      const u = clamp((t - D.sh) / 0.7), e = u * u * (3 - 2 * u);
      this.faceTarget = H.face; this.doorLift = e;
      lerpTo(H.step.x, H.step.z, H.inner.x, H.inner.z, e);
      this.doorScale = 1 - 0.4 * e * e;
      if (u >= 1) this.tuckIn(true);
      return;
    }
    // stepping out
    if (!D.open) { D.open = true; this.doorFx(H, pd); }
    const u = clamp(D.t / 0.75), e = u * u * (3 - 2 * u);
    this.faceTarget = H.face + Math.PI; this.doorLift = 1 - e;
    lerpTo(H.inner.x, H.inner.z, H.step.x, H.step.z, e);
    this.doorScale = 0.62 + 0.38 * Math.sqrt(e);
    if (u < 1) return;
    this.door = null; this.doorScale = 1; this.doorLift = 0; this.state = 'idle'; this.t = rand(1.5, 3);
    if (this.knocked && this.sleepy) { // woken up: a big yawn, "zzz", then a mumbled hello (update → sleepyAnswer)
      this.sleepyWait = 1.0; this.emote('zzz'); this.anim.play('sleepyYawn');
      if (pd < 18) Events.emit('sfx', 'yawn', { pos: this.pos, pitch: this.spec.voice || 1, vol: 0.9 });
    } else if (this.knocked) { // Chewy knocked: blink at him, then chat
      this.emote('?');
      this.G.talkTo?.(this);
    } else {
      this.anim.play(this.hour < 9 ? pick(['stretch', 'yawn']) : 'stretch');
      if (pd < 26) this.emote(pick(['sparkle', 'note', 'heart']));
    }
  }
  // the door opening: warm light spilling out (a short LightPool flash) + a soft glow + the door sound
  doorFx(H, pd) {
    if (pd > 28) return;
    const y = this.world.heightAt(H.door.x, H.door.z);
    _w.set(H.door.x + H.fx * 0.2, y + 0.8, H.door.z + H.fz * 0.2);
    const night = this.G.day?.isNight?.() ? 1 : 0.25;
    this.G.vfx?.light?.(_w, '#ffbf73', 2.2 + 2.6 * night, 3.2, 1.1);
    if (night > 0.5) this.G.vfx?.flash?.(_w, '#ffcf8a', 0.9, 0.55);
    if (pd < 18) Events.emit('sfx', 'door_open', { pos: this.pos, vol: 0.32 });
  }
  // waiting up on the doorstep (quest target after bedtime): look out for Chewy, yawn now and then
  porchTick(dt, p, pd) {
    const H = this.homeInfo;
    this.greetTick(dt, p, pd);
    if (this.state === 'walk' && this.goal?.kind === 'porch') { this.walkTick(dt); return; }
    if (this.state !== 'porch') {
      if (this.state === 'walk' || this.act || this.chat) this.clearTask();
      if (dist(H.step.x, H.step.z, this.pos.x, this.pos.z) > 0.7) { this.go(H.step.x, H.step.z, { kind: 'porch', speed: 1, near: 0.5 }); return; }
      this.state = 'porch';
    }
    if (p && pd < 3.2) this.faceTo(p.pos.x, p.pos.z); else this.faceTarget = H.face + Math.PI;
    this.fidgetT -= dt;
    if (this.fidgetT <= 0 && !this.anim.action) { this.fidgetT = rand(5, 9); this.anim.play(pick(['yawn', 'lookAround', 'stretch'])); if (chance(0.3)) this.emote('zzz'); }
  }
  // ------------------------------------------------------------------ greeting Chewy
  greetTick(dt, p, pd) {
    this.greeted -= dt;
    if (!p || pd >= 3.2 || this.greeted > 0 || p.anim.speed <= 0.2 || this.state === 'inside' || this.door) return;
    if (this.act?.pose === 'sitDoze') return; // fast asleep
    this.greeted = 25;
    Events.emit('emote', { actor: this, kind: chance(0.5) ? 'heart' : 'note' });
    Events.emit('sfx', 'villager_greet', { pos: this.pos, pitch: this.spec.voice || 1 });
    if (this.chat || this.benchChat) return; // a nod from the conversation is enough
    if (this.act && this.act.phase !== 'do') return;
    if (this.seated) { this.anim.play('sitWave'); return; }
    this.faceTo(p.pos.x, p.pos.z);
    const wave = chance(0.5) ? 'wave' : this.act?.kind === 'counter' ? 'bow' : 'happy';
    if (this.state === 'act') { this.act.faceHold = 1.6; this.anim.play(wave); return; }
    if (this.state === 'walk') { this.pauseT = 1.8; this.anim.play(wave); return; }
    this.state = 'idle'; this.t = 2.2; this.target = null;
    this.anim.play(wave);
  }
  // ------------------------------------------------------------------ Chewy talks to us: stop everything and turn to him
  onTalk() {
    if (this.door) { // mid door beat: finish it on the doorstep
      const H = this.door.H; this.door = null; this.doorScale = 1; this.doorLift = 0;
      this.setPos(H.step.x, H.step.z);
    }
    this.clearTask();
    this.state = 'idle'; this.t = rand(2.5, 4);
  }
  clearTask() {
    if (this.chat) this.endChat(false);
    if (this.act) this.endAct();
    if (this.goal?.slot) this.life?.release(this.goal.slot, this);
    this.goal = null; this.path = null; this.pauseT = 0;
    if (this.anim.action?.def.hold) this.anim.stop();
  }
  // ------------------------------------------------------------------ chatting with another villager
  chatReady() {
    if (!this.visible || this.talking || this.chat || this.benchChat || this.chatCD > 0 || this.seated || !this.warm) return false;
    if (this.bedNow) return false;
    if (this.state === 'idle') return true;
    if (this.state === 'walk') return this.goal?.kind === 'stroll' || this.goal?.kind === 'wander';
    if (this.state === 'act') return !!this.act.def.chatty && this.act.phase === 'do';
    return false;
  }
  startChat(b) {
    // the partner stays put (keeps its activity slot) and we walk up to it
    const C = { a: this, b, phase: 'approach', t: 0, dur: rand(7, 12), speaker: this, swapT: rand(1.6, 2.6), emoteT: rand(1, 2.2) };
    this.chat = C; b.chat = C;
    if (b.state === 'walk') { if (b.goal?.slot) this.life.release(b.goal.slot, b); b.goal = null; b.path = null; }
    if (b.state !== 'act') { b.state = 'chat'; if (b.anim.action?.def.hold) b.anim.stop(); }
    b.faceTo(this.pos.x, this.pos.z);
    let dx = this.pos.x - b.pos.x, dz = this.pos.z - b.pos.z; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
    let x = b.pos.x + dx * 1.0, z = b.pos.z + dz * 1.0;
    for (let i = 1; i < 6 && (this.world.collision?.solidAt(x, z, 0.28) || !this.world.walkable(x, z)); i++) {
      const a = Math.atan2(dx, dz) + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.7;
      x = b.pos.x + Math.sin(a) * 1.0; z = b.pos.z + Math.cos(a) * 1.0;
    }
    this.go(x, z, { kind: 'chat', speed: 1 });
  }
  chatArrive() {
    const C = this.chat; if (!C) { this.state = 'idle'; this.t = 1; return; }
    C.phase = 'talk'; C.t = 0;
    for (const v of [C.a, C.b]) {
      v.state = 'chat';
      if (v.anim.action?.def.hold) v.anim.stop();
      v.setProp(null);
    }
    C.a.anim.play('chat');
    C.b.anim.play(chance(0.5) ? 'wave' : 'happy'); C.b.emote(chance(0.5) ? '!' : 'note');
  }
  chatTick(dt) {
    const C = this.chat;
    if (!C) { this.state = this.act ? 'act' : 'idle'; this.t = 1; return; }
    const other = C.a === this ? C.b : C.a;
    if (C.phase === 'approach') { // only the partner sits in 'chat' state while we walk over
      this.faceTo(other.pos.x, other.pos.z);
      C.t += dt; if (C.t > 12) this.endChat(false);
      return;
    }
    this.faceTo(other.pos.x, other.pos.z);
    if (C.a !== this) return; // the initiator drives the conversation
    C.t += dt; C.swapT -= dt; C.emoteT -= dt;
    const pd = this.G.player ? dist(this.G.player.pos.x, this.G.player.pos.z, this.pos.x, this.pos.z) : 99;
    if (C.swapT <= 0) {
      C.swapT = rand(1.6, 3.2);
      C.speaker = chance(0.75) ? other : this; // mostly take turns
      const listener = C.speaker === this ? other : this;
      if (!C.speaker.anim.action || C.speaker.anim.action.name !== 'chat') C.speaker.anim.play('chat');
      if (!listener.anim.action || listener.anim.action.name === 'chat') listener.anim.play(chance(0.25) ? 'nod' : 'listen');
      if (pd < 15) Events.emit('sfx', 'villager_chatter', { pos: C.speaker.pos, pitch: C.speaker.spec.voice || 1, vol: 0.4, text: gibberish(2 + ((Math.random() * 2) | 0)), voice: (C.speaker.spec.voice || 1) < 0.95 ? 'deep' : C.speaker.id === 'rosie' ? 'kid' : 'cute' });
    }
    if (C.emoteT <= 0) {
      C.emoteT = rand(2.2, 3.8);
      if (pd < 26) C.speaker.emote(pick(['note', 'heart', 'sparkle', '?', '!', 'note', 'heart']));
      if (chance(0.3)) (C.speaker === this ? other : this).anim.play(pick(['laugh', 'nod', 'clap']));
    }
    if (!this.anim.action) this.anim.play(C.speaker === this ? 'chat' : 'listen');
    if (!other.anim.action) other.anim.play(C.speaker === other ? 'chat' : 'listen');
    if (C.t > C.dur) {
      const end = pick(['laugh', 'wave', 'happy']);
      this.anim.play(end); other.anim.play(end === 'laugh' ? 'laugh' : 'wave');
      if (pd < 26) this.emote('heart');
      this.endChat(true);
    }
  }
  talkWant() {
    if (this.chat?.phase === 'talk') return this.chat.speaker === this ? 0.75 : 0;
    if (this.benchChat) return this.benchChat.speaker === this ? 0.7 : 0;
    return 0;
  }
  endChat(ok) {
    const C = this.chat; if (!C) return;
    for (const v of [C.a, C.b]) {
      if (v.chat !== C) continue;
      v.chat = null; v.chatCD = rand(30, 60);
      if (v.goal?.kind === 'chat') { v.goal = null; v.path = null; }
      if (v.anim.action?.def.hold) v.anim.stop();
      if (v.act) { v.state = 'act'; if (v.act.slot && !v.act.slot.virtual && !ok) { /* keep the slot */ } v.setProp(PROP_FOR[v.act.pose] || null); }
      else if (v.state === 'chat' || v.state === 'walk') { v.state = 'idle'; v.t = rand(1.2, 3); }
    }
  }
  // two villagers side by side on one bench: turn heads and chat
  startBenchChat(b) {
    const C = { a: this, b, t: 0, dur: rand(8, 14), speaker: this, swapT: rand(1.5, 2.5), emoteT: rand(1, 2) };
    this.benchChat = C; b.benchChat = C;
  }
  benchChatTick(dt) {
    const C = this.benchChat; if (C.a !== this) return;
    const other = C.b;
    if (!other.benchChat || !other.seated || !this.seated) return this.endBenchChat();
    C.t += dt; C.swapT -= dt; C.emoteT -= dt;
    const pd = this.G.player ? dist(this.G.player.pos.x, this.G.player.pos.z, this.pos.x, this.pos.z) : 99;
    if (C.swapT <= 0) {
      C.swapT = rand(1.6, 3); C.speaker = C.speaker === this ? other : this;
      if (pd < 15) Events.emit('sfx', 'villager_chatter', { pos: C.speaker.pos, pitch: C.speaker.spec.voice || 1, vol: 0.35, text: gibberish(2), voice: (C.speaker.spec.voice || 1) < 0.95 ? 'deep' : 'cute' });
    }
    if (C.emoteT <= 0) { C.emoteT = rand(2.5, 4); if (pd < 26) C.speaker.emote(pick(['note', 'heart', 'sparkle', '!', '?'])); }
    if (C.t > C.dur) this.endBenchChat();
  }
  endBenchChat() {
    const C = this.benchChat; if (!C) return;
    for (const v of [C.a, C.b]) if (v.benchChat === C) { v.benchChat = null; v.chatCD = rand(25, 50); }
  }
  // ------------------------------------------------------------------ body contact
  // soft separation (monster.js style): never inside Chewy / Shadow / each other; seated villagers are immovable
  separate(dt) {
    const G = this.G, R = this.radius, pos = this.pos;
    let px = 0, pz = 0;
    for (const n of G.npcs) {
      if (n === this || !n.visible || n.seated) continue;
      const dx = pos.x - n.pos.x, dz = pos.z - n.pos.z, mn = R + n.radius;
      if (dx > mn || dx < -mn || dz > mn || dz < -mn) continue;
      const d2 = dx * dx + dz * dz; if (d2 >= mn * mn) continue;
      let d = Math.sqrt(d2), nx, nz;
      if (d < 1e-4) { const a = (this.id.charCodeAt(0) * 2.39996) % 6.283; nx = Math.cos(a); nz = Math.sin(a); d = 0; } else { nx = dx / d; nz = dz / d; }
      const share = this.talking ? 0 : n.talking ? 1 : 0.5;
      px += nx * (mn - d) * share; pz += nz * (mn - d) * share;
    }
    for (let i = 0; i < 2; i++) { // keep off Chewy and Shadow (they are never pushed)
      const e = i ? G.companion : G.player, er = i ? PET_VR : PLAYER_VR;
      if (!e?.pos || (i === 0 && G.playerDead) || e.visible === false) continue;
      const dx = pos.x - e.pos.x, dz = pos.z - e.pos.z, mn = R + er, d2 = dx * dx + dz * dz;
      if (d2 >= mn * mn) continue;
      const d = Math.sqrt(d2); if (d < 1e-4) { px += 1e-3; continue; }
      px += dx / d * (mn - d); pz += dz / d * (mn - d);
    }
    const L = Math.hypot(px, pz);
    if (L < 1e-5) return;
    const k = Math.min(1, Math.max(0.05, dt * 10) / L);
    _prev.copy(pos); pos.x += px * k; pos.z += pz * k;
    this.world.collision?.resolve(pos, R, _prev);
    pos.y = this.world.heightAt(pos.x, pos.z);
  }
  // ------------------------------------------------------------------ after the animator: head tracking + props
  post(dt, p, pd) {
    let tx = null, tz = 0;
    const C = this.chat, B = this.benchChat;
    if (C && C.phase === 'talk') { const o = C.a === this ? C.b : C.a; tx = o.pos.x; tz = o.pos.z; }
    else if (B) { const o = B.a === this ? B.b : B.a; tx = o.pos.x; tz = o.pos.z; }
    else if (p && !this.talking && pd < (this.state === 'walk' ? 2.6 : 4.2) && this.anim.action?.name !== 'sitDoze') { tx = p.pos.x; tz = p.pos.z; }
    let want = 0;
    if (tx !== null) want = clamp(angleDiff(this.facing, Math.atan2(tx - this.pos.x, tz - this.pos.z)), -1.1, 1.1);
    else if (this.act?.slot.look) want = 0;
    this.look = damp(this.look, want, 5, dt);
    const head = this.rig.parts.head;
    if (Math.abs(this.look) > 1e-3) head.rotation.y += this.look;
    if (this.act?.slot.look && this.state === 'act') head.rotation.x -= this.act.slot.look * 0.25; // gaze up at statues / blossoms
    if (this.prop) this.poseProp(dt, pd);
  }
  setProp(kind) {
    if (this.propKind === kind) return;
    if (this.prop) this.prop.parent?.remove(this.prop);
    this.prop = null; this.propKind = kind;
    if (this.line) { this.line.parent?.remove(this.line); this.bobber.parent?.remove(this.bobber); }
    if (!kind) return;
    const P = this.props || (this.props = {});
    let m = P[kind];
    if (!m) { m = P[kind] = new THREE.Mesh(propGeo(kind), this.rig.propMat || this.rig.mat); m.castShadow = true; }
    m.rotation.set(0, 0, 0); m.position.set(0, -0.02, 0.02);
    this.rig.parts.handR.add(m); this.prop = m;
    if (kind === 'rod') {
      if (!this.line) {
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
        this.line = new THREE.Line(g, lineMat); this.line.frustumCulled = false;
        this.bobber = new THREE.Mesh(propGeo('bobber'), this.rig.propMat || this.rig.mat); this.bobber.castShadow = false;
      }
      this.world.scene.add(this.line, this.bobber);
    }
  }
  // keep props at a designed world pitch whatever the arm is doing (the arm pitch is body.x + arm.x)
  poseProp(dt, pd) {
    const P = this.rig.parts, m = this.prop, pitch = P.body.rotation.x + P.armR.rotation.x, t = this.anim.t;
    const a = this.anim.action, at = a?.def.hold ? a.t : 0;
    if (this.propKind === 'broom') {
      m.rotation.x = -0.5 - pitch;
      P.handR.getWorldPosition(_w);
      const off = clamp(0.76 - (_w.y - this.pos.y - 0.02) / Math.cos(0.5), 0, 0.5); // straw tip on the ground
      m.position.set(0, off * Math.cos(m.rotation.x), off * Math.sin(m.rotation.x));
      if (a?.name === 'sweep' && pd < 18) {
        this.act && (this.act.fx -= dt);
        if (this.act && this.act.fx <= 0) { this.act.fx = rand(0.45, 0.8); m.updateWorldMatrix(true, false); _w.copy(BROOM_HEAD).applyMatrix4(m.matrixWorld); this.G.vfx?.dust?.(_w, { n: 1, size: 0.16, color: '#eadcc4' }); }
      }
    } else if (this.propKind === 'can') {
      const pour = a?.name === 'water' ? 0.5 + 0.5 * Math.sin(at * 1.3) : 0;
      m.rotation.x = 0.15 + 0.55 * pour - pitch;
      if (pour > 0.55 && pd < 20 && this.act) {
        this.act.fx -= dt;
        if (this.act.fx <= 0) {
          this.act.fx = 0.06; m.updateWorldMatrix(true, false); _w.copy(CAN_SPOUT).applyMatrix4(m.matrixWorld);
          this.G.vfx?.dot?.spawn({ x: _w.x + rand(-0.02, 0.02), y: _w.y, z: _w.z + rand(-0.02, 0.02), vx: Math.sin(this.facing) * 0.5, vz: Math.cos(this.facing) * 0.5, vy: -0.4, grav: 7, life: 0.4, size: 0.07, color: '#8fd8ff', alpha: 0.9, alpha1: 0.3 });
        }
      }
    } else if (this.propKind === 'rod') {
      m.rotation.x = -0.35 - pitch * 0.7;
      const sl = this.act?.slot;
      if (sl?.bobX != null && this.line) {
        const bob = this.bobber, reel = a?.name === 'reel' ? Math.sin(clamp(a.t / a.dur) * Math.PI) : 0;
        bob.position.set(sl.bobX, 0.02 + Math.sin(t * 2.2) * 0.012 - reel * 0.05, sl.bobZ);
        m.updateWorldMatrix(true, false); _w.copy(ROD_TIP).applyMatrix4(m.matrixWorld);
        const arr = this.line.geometry.attributes.position.array;
        arr[0] = _w.x; arr[1] = _w.y; arr[2] = _w.z; arr[3] = bob.position.x; arr[4] = bob.position.y + 0.03; arr[5] = bob.position.z;
        this.line.geometry.attributes.position.needsUpdate = true;
      }
    }
  }
  splash() {
    const b = this.bobber; if (!b || !this.G.vfx?.dot) return;
    for (let i = 0; i < 6; i++) { const a = i / 6 * 6.283; this.G.vfx.dot.spawn({ x: b.position.x, y: 0.05, z: b.position.z, vx: Math.cos(a) * 0.8, vz: Math.sin(a) * 0.8, vy: 1.6, grav: 7, life: 0.5, size: 0.09, color: '#e8faff', alpha: 0.9, alpha1: 0 }); }
  }
  emote(kind) { if (kind) Events.emit('emote', { actor: this, kind }); }
  // ------------------------------------------------------------------ fallback (no village sim, e.g. isolated test scenes)
  legacyUpdate(dt) {
    const G = this.G, p = G.player;
    const night = G.day?.isNight?.() && this.home;
    const pd = p ? dist(p.pos.x, p.pos.z, this.pos.x, this.pos.z) : 99;
    if (this.talking) {
      if (p) { this.faceTo(p.pos.x, p.pos.z); this.faceTarget += this.faceBias || 0; }
    } else if (night) {
      if (this.visible && this.moveTo(this.home.x, this.home.z, dt, 1.2, 0.35)) this.visible = false;
    } else {
      if (!this.visible) { this.visible = true; if (this.home) this.setPos(this.home.x, this.home.z); }
      this.t -= dt;
      if (this.state === 'idle') {
        if (pd < 2.2) this.faceTo(p.pos.x, p.pos.z);
        if (this.t <= 0) {
          const a = rand(0, Math.PI * 2), r = rand(1, this.wanderR);
          const x = this.anchor.x + Math.cos(a) * r, z = this.anchor.z + Math.sin(a) * r;
          if (this.world.walkable?.(x, z) !== false) { this.target = new THREE.Vector3(x, 0, z); this.state = 'walk'; this.t = 8; } else this.t = 0.5;
        }
      } else if (this.state === 'walk') {
        if (this.moveTo(this.target.x, this.target.z, dt, 1, 0.2) || this.t <= 0) { this.state = 'idle'; this.t = rand(2, 6); }
      }
    }
    this.interact.pos = this.pos;
    this.anim.talk = this.talking ? 0.8 : 0;
    super.update(dt);
  }
}
