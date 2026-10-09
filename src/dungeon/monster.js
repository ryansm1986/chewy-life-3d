// Monster entity: stats (rpg/stats), model + animation, and a small state-machine AI with telegraphed attacks.
import * as THREE from 'three';
import { MONSTERS, MonsterAnim } from './monsters.js';
import { hordeOf } from './horde.js';
import { crowdOf, NOGRID, PAD } from './crowd.js';
import { attackToken, releaseToken, alertBubble } from './tokens.js';
import { monsterStats, applyRandomMods, MONSTER_MODS } from '../rpg/stats.js';
import { Animator } from '../actors/animator.js';
import { makeOutline } from '../gfx/materials.js';
import { Events } from '../core/events.js';
import { rand, randInt, clamp, TAU, dist, dampAngle, pick, chance } from '../core/util.js';

export const KIND_MAP = { mochi: 'mochi', dustbunny: 'dust', kinoko: 'kinoko', lantern: 'lantern', kasa: 'kasa', wisp: 'kitsune', oni: 'oni', tanuki: 'tanuki', mochiKing: 'mochi', kasaLord: 'kasa', oniChef: 'oni', nineTails: 'kitsune' };
const UNIQUE_A = ['Squishy', 'Grumpy', 'Sneaky', 'Wobbly', 'Fluffmaw', 'Bitter', 'Sticky', 'Gloomy', 'Crunchy', 'Soggy', 'Rascal', 'Snoot'];
const UNIQUE_B = ['the Sticky', 'Nibblebane', 'the Crumb-Snatcher', 'Toebiter', 'the Loud', 'Crumbclaw', 'the Sleepy', 'Sockthief', 'the Unpettable', 'Pillowhog', 'the Snack Bandit', 'Grumblepaw'];
const _p = new THREE.Vector3(), _p0 = new THREE.Vector3(), _dir = new THREE.Vector3(), _dir2 = new THREE.Vector3(); // (temps: the AI's per-frame directions allocate nothing)
const PLAYER_VR = 0.36; // Chewy's visual body radius (his collision radius is 0.3)
/** collision sub-steps for a move of `len` m by a body of radius r (1 unless the step is longer than the radius) */
const subSteps = (len, r) => (len > r && r > 0 ? Math.min(8, Math.ceil(len / r)) : 1);
// big-body hit tints: warm and saturated so they add little luminance (≈ 0.08 at amp 0.2) — pale bosses sit near the bloom threshold
const SOFT_TINT = new THREE.Color('#ff8a7a'), SOFT_CRIT = new THREE.Color('#ffc070');
// Boss telegraph colours, picked against each arena's sigil (burrow pink, shrine gold, kitchen orange, sanctum blue):
// King Mochi's slam is a deep red on pink, Lord Karakasa's spin a crimson on gold, Oni Chef's fire pots a hot
// lemon-white on the orange checker, Tamamo's foxfire / blinks warm gold / pink on the blue sanctum.
export const TELE = { slam: '#ff2a48', spin: '#ff3050', firepot: '#fff05a', barrage: '#ffc83a', blinkFrom: '#ff7ab8', blinkTo: '#fff0a8' };

// Contact disc under every monster: soft painted shadow + a thin footprint ring (ink for normal monsters, the elite
// colour for champions / uniques / bosses) so a pack reads as separate bodies instead of one blob.
const RING_MATS = new Map();
function ringMat(color, ringA) {
  const key = color + ringA; let m = RING_MATS.get(key);
  if (m) return m;
  m = new THREE.ShaderMaterial({
    uniforms: { uCol: { value: new THREE.Color(color) }, uRingA: { value: ringA } },
    vertexShader: 'varying vec2 vQ; void main() { vQ = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */`uniform vec3 uCol; uniform float uRingA; varying vec2 vQ;
      void main() {
        float r = length(vQ);
        float sh = (1.0 - smoothstep(0.05, 0.95, r)) * 0.42;
        float ring = smoothstep(0.075, 0.02, abs(r - 0.84)) * uRingA;
        vec3 c = mix(vec3(0.16, 0.08, 0.24), uCol, ring / max(ring + sh, 1e-3));
        gl_FragColor = vec4(c, clamp(sh + ring, 0.0, 0.85));
      }`,
    transparent: true, depthWrite: false,
  });
  RING_MATS.set(key, m);
  return m;
}
// (one instanced batch for every ring of the floor: dungeon/horde.js; ?noinst gives each its own plane mesh again)
function contactRing(H, r, color = '#2a1830', ringA = 0.32) { return H.ring(r, ringMat(color, ringA)); }

export class Monster {
  constructor(mode, id, { level = 1, rank = 'normal', variant = 0, x, z, leader = null, rng = Math.random } = {}) {
    const G = this.G = mode.G; this.mode = mode; this.world = mode.world; this.id = id;
    const def = this.def = MONSTERS[id];
    const v = def.variants?.[variant % (def.variants?.length || 1)] || {};
    const statRank = def.boss ? 'boss' : rank;
    this.stats = monsterStats(level, statRank, KIND_MAP[id]);
    if (v.element) this.stats.element = v.element;
    if (rank === 'champion' || rank === 'unique') applyRandomMods(this.stats, rng);
    this.rank = def.boss ? 'boss' : rank;
    this.team = 'enemy'; this.alive = true;
    if (def.boss && def.life && def.life !== 1) this.stats.life = Math.round(this.stats.life * def.life); // per-boss tuning
    this.lifeMax = this.stats.life; this.life = this.lifeMax;
    this.name = def.boss ? def.name : rank === 'unique' ? `${pick(UNIQUE_A)} ${pick(UNIQUE_B)}` : rank === 'champion' ? `Champion ${v.name || def.name}` : (v.name || def.name);
    const scale = (def.scale || 1) * (rank === 'champion' ? 1.15 : rank === 'unique' ? 1.3 : 1);
    this.scale = scale;
    const H = hordeOf(mode); // (the model cache, the instanced batches and the rig pool: dungeon/horde.js)
    this.model = H.build(id, variant);
    if (!this.model.rig) this.def = { ...def, scale }; else this.model.root.scale.setScalar(scale);
    this.anim = new MonsterAnim(this.model, { ...def, scale });
    this.kit = this.model.rig ? new Animator(this.model.rig) : null;
    if (this.model.rig) { this.model.rig.spec.scale = scale; }
    this.radius = def.radius * (scale / (def.scale || 1));
    if (def.boss) this.radius = def.radius;
    // visual body radius (incl. champion/unique scale) used to keep bodies apart; collision with rock keeps using radius
    this.bodyR = def.boss ? (def.vr || def.radius) : (def.vr || def.radius) * (scale / (def.scale || 1));
    this.height = (this.model.rig ? 1.15 : 1.0) * scale;
    this.pos = new THREE.Vector3(x, this.world.heightAt(x, z), z); // (pos.y = the ground: regions have terrain)
    this.facing = rand(0, TAU);
    this.speed = def.speed * this.stats.speedMul;
    this.status = {};
    this.state = 'idle'; this.stateT = 0; this.cd = rand(0.6, 2.4); this.aggro = false;
    this.leader = leader; this.wander = null; this.knock = new THREE.Vector3();
    // elite visuals
    const elite = rank === 'champion' || rank === 'unique' || def.boss;
    const eCol = def.boss ? (def.light || '#ff4a6a') : rank === 'unique' ? '#ffb030' : '#6aa8ff';
    this.shadow = contactRing(H, this.bodyR * 1.3, elite ? eCol : '#2a1830', elite ? 0.7 : 0.32);
    this.model._sc = scale; // (its culling sphere's scale)
    H.place(this.model);
    if (elite) {
      // champions / uniques get the D2-style coloured contour; bosses keep a crisp ink one (at 2-3x scale a coloured hull turns their brows & eyes pink)
      if (this.model.outline) { this.model.outline.material = def.boss ? makeOutline('#2a1622', 0.014) : makeOutline(eCol, 0.02); }
      this.eliteColor = def.boss ? '#ff4a6a' : eCol;
    }
    // bosses with a signature glow carry their own light (Tamamo's foxfire)
    if (def.light) this.light = this.world.lightPool.addSource({ pos: new THREE.Vector3(x, 3.6, z), color: new THREE.Color(def.light), intensity: 3.5, radius: 9, flicker: 0.35, priority: 6 });
    this.summoned = 0;
    this.telegraph = null;
    this.sync();
    def.onSpawn?.(this);
  }
  get level() { return this.stats.level; }
  // speech-bubble emote above the head (vfx.emote reads rig.height; big bosses would otherwise get it inside their body)
  emote(kind, life) { return this.G.vfx.emote(this._emoteAt ||= { pos: this.pos, rig: { height: this.height } }, kind, life); }
  // big / elite bodies get the soft hit flash and soft hit VFX (champion packs are re-ranked after construction)
  get big() { return !!this.def.boss || this.rank === 'champion' || this.rank === 'unique' || this.scale >= 1.4; }
  sync() {
    const r = this.model.root, gy = this.pos.y = this.world.heightAt(this.pos.x, this.pos.z);
    r.position.set(this.pos.x, gy + (this.kit ? (this.model.rig.offsetY || 0) : 0), this.pos.z);
    r.rotation.y = this.facing;
    this.shadow.position.set(this.pos.x, gy + 0.025, this.pos.z);
    if (this.light) this.light.pos.set(this.pos.x + Math.sin(this.facing) * 1.5, gy + 3.6, this.pos.z + Math.cos(this.facing) * 1.5);
    if (!NOGRID && this.alive) { crowdOf(this.mode).move(this); this.mode.combat?.moved?.(this); } // (the crowd grids: crowd.js, combat.js)
  }
  /** A point `k` m above the ground under this monster (VFX / projectile origins). */
  lift(k) { return new THREE.Vector3(this.pos.x, this.pos.y + k, this.pos.z); }
  heal(n) { this.life = Math.min(this.lifeMax, this.life + n); }
  takeDamage(dmg, { element = 'phys', crit = false, knock = 0, stun = 0, from = null } = {}) {
    if (!this.alive) return;
    this.life -= dmg;
    if (this.big) {
      // bosses / elites: a gentle warm tint (0.2, ~70 ms) that stays under the bloom threshold; at most ~4 blinks a second
      // so a stream of hits (Whirlwind Stance, Sakura Storm, pups) flickers instead of holding the body lit
      const tint = crit ? SOFT_CRIT : SOFT_TINT;
      if (this.anim.hit(tint, { amp: 0.2, dur: 0.07, gap: 0.22 }) && this.kit) {
        this.kit.hit(); this.kit.flash = 0.5; this.kit.flashColor.copy(tint).multiplyScalar(1.45); // Animator: emissive = c * flash² * 0.55 → 0.2
      }
    } else {
      this.anim.hit(crit ? '#ffe070' : '#ffffff');
      if (this.kit) this.kit.hit('#ffffff');
    }
    if (this.def.boss) this.mode.bossEngaged?.(this);
    if (!this.aggro) this.alert();
    const src = from || this.G.player.pos;
    if (knock > 0 && !this.def.boss) { const d = this.pos.clone().sub(src).setY(0); if (d.lengthSq() > 1e-4) this.knock.add(d.normalize().multiplyScalar(knock * 7 / Math.max(1, this.scale))); }
    if (stun > 0 && !this.def.boss) { this.status.stun = Math.max(this.status.stun || 0, stun); this.cancelAttack(); }
    // hit recovery: big hits stagger (not bosses)
    if (!this.def.boss && dmg > this.lifeMax * 0.18 && this.state === 'windup' && chance(0.6)) this.cancelAttack();
    if (this.life <= 0) this.die();
  }
  applyStatus(kind, dur, power = 0) {
    if (kind === 'burn') this.status.burn = { t: dur, dps: power };
    else if (kind === 'poison') this.status.poison = { t: dur, dps: power };
    else if (kind === 'slow' || kind === 'chill') this.status.slow = { t: dur, amt: power || 0.4 };
    else this.status[kind] = Math.max(this.status[kind] || 0, dur * (this.def.boss ? 0.35 : 1));
  }
  alert() {
    if (this.def.boss && !this.introDone) { this.introDone = true; this.mode.bossIntro?.(this); }
    this.aggro = true;
    if (this.state === 'idle' && alertBubble(this)) { this.emote('!', 0.9); } // (one "!" per pack, a few a second at most: tokens.js)
    if (NOGRID) { for (const m of this.mode.monsters) if (m !== this && m.alive && !m.aggro && dist(m.pos.x, m.pos.z, this.pos.x, this.pos.z) < 7) { m.aggro = true; } return; }
    const g = crowdOf(this.mode), near = g.near(this.pos.x, this.pos.z, 7 + PAD); // (the floor's monster grid: crowd.js)
    for (let i = 0; i < near.length; i++) { const m = near[i]; if (m !== this && m.alive && !m.aggro && dist(m.pos.x, m.pos.z, this.pos.x, this.pos.z) < 7) { m.aggro = true; } }
    g.release();
  }
  cancelAttack() { this.state = 'chase'; this.anim.wind = 0; this.anim.spin = 0; if (this.telegraph) { this.telegraph.t = 999; this.telegraph = null; } }
  die() {
    if (!this.alive) return;
    this.alive = false; this.life = 0; releaseToken(this);
    this.cancelAttack();
    if (this.light) { this.world.lightPool.removeSource(this.light); this.light = null; }
    const G = this.G;
    this.anim.deathT = 0;
    // a boss goes up in a smaller, lighter puff: 40 big opaque pink clouds used to fog the whole Victory frame
    G.vfx.poof(this.lift(0.4 * this.scale), { color: this.def.boss ? '#ffe8f2' : '#fff4fa', size: (this.def.boss ? 0.42 : 0.6) * this.scale, n: this.def.boss ? 20 : 14 });
    G.vfx.petals(this.lift(0.5), this.def.boss ? 40 : 6);
    Events.emit('sfx', 'monster_die', { pos: this.pos });
    if (this.stats.onDeath === 'fireNova') this.mode.fireNova(this);
    this.def.onDeath?.(this);
    this.mode.onMonsterDeath(this);
    setTimeout(() => this.dispose(), 480);
  }
  // A boss's summoned add when its master falls: out of the fight at once (no more attacks, can't be hit), then after
  // `delay` s it bursts into sparkles and squashes away. No xp, no loot.
  vanish(delay = 0) {
    if (!this.alive) return;
    this.alive = false; this.life = 0; this.vanished = true; releaseToken(this);
    this.cancelAttack(); this.knock.set(0, 0, 0);
    if (this.light) { this.world.lightPool.removeSource(this.light); this.light = null; }
    const M = this.mode, i = M.monsters.indexOf(this); if (i >= 0) M.monsters.splice(i, 1);
    M.combat?.remove(this);
    (M.dying ||= []).push(this); // keeps idling (deathT < 0) until its turn to poof
    const go = () => {
      if (this.disposed || this.G.dungeon !== M) return;
      const G = this.G, p = this.lift(Math.max(0.35, (this.height || 1) * 0.5));
      G.vfx.sparkle(p, { n: 14, color: '#fff2c8', r: 0.45 * this.scale, rise: 1.4, size: 0.3 });
      G.vfx.poof(p, { color: '#fff4fa', n: 7, size: 0.42 * this.scale });
      this.anim.deathT = 0;
      setTimeout(() => this.dispose(), 480);
    };
    if (delay > 0) setTimeout(go, delay * 1000); else go();
  }
  dispose() {
    const H = this.mode._horde;
    if (H && !H.disposed) H.dropRing(this.shadow); else this.world.scene.remove(this.shadow);
    // a pooled rig goes back to the Horde for the next spawn of its kind; cached geometry is shared, never freed here
    if (!(H && !H.disposed && H.recycle(this.model))) {
      this.world.scene.remove(this.model.root);
      this.model.root.traverse(o => { if (o.isMesh && !o.geometry?.userData?.shared) { o.geometry?.dispose(); } });
      this.model.rig?.skeleton?.dispose();
    }
    if (!this.shadow.geometry?.userData?.shared) this.shadow.geometry?.dispose();
    if (this.light) { this.world.lightPool.removeSource(this.light); this.light = null; }
    crowdOf(this.mode).remove(this); releaseToken(this);
    this.disposed = true;
  }
  // ------------------------------------------------------------------ AI
  update(dt) {
    this.model._uf = (this.model._uf || 0) + 1; // (its pose may change: the Horde recomputes its matrices)
    if (!this.alive) { this.anim.update(dt, false, 0); this.shadow.scale.setScalar(Math.max(0.01, 1 - clamp(this.anim.deathT / 0.45))); return; }
    this.separate(dt);
    const G = this.G, P = G.player, st = this.status;
    this.stateT += dt; this.cd -= dt * (this.stats.atkMul || 1) * (this.enraged ? 1.4 : 1);
    if (this._tok || this.cd <= 0) attackToken(this, dt); // (big packs take turns to wind up a ranged attack: tokens.js)
    let moving = false;
    // knockback slide
    if (this.knock.lengthSq() > 0.001) {
      // (sub-stepped like move(): a hard shove on a long frame can't carry the body through a pillar)
      const n = subSteps(this.knock.length() * dt, this.radius);
      for (let i = 0; i < n; i++) { _p.copy(this.pos); this.pos.addScaledVector(this.knock, dt / n); this.world.collision.resolve(this.pos, this.radius, _p); }
      this.knock.multiplyScalar(Math.exp(-9 * dt));
    }
    const stunned = st.stun > 0 || st.freeze > 0;
    const target = this.pickTarget();
    const slowMul = (st.slow?.t > 0 ? 1 - st.slow.amt : 1) * (this.enraged ? 1.25 : 1);
    if (!stunned && target) {
      const tx = target.pos.x, tz = target.pos.z;
      const d = dist(tx, tz, this.pos.x, this.pos.z);
      if (!this.aggro && d < (this.mode.alertR || 9) && this.mode.los(this.pos, target.pos)) this.alert(); // (alertR: a Night March run's monsters notice you from further off, dungeon/tierRun.js)
      if (st.fear > 0) { // run away
        const away = _dir.copy(this.pos).sub(target.pos).setY(0).normalize();
        this.move(away, dt, 1.1 * slowMul); moving = true;
      } else if (this.aggro) {
        const A = this.def.attack;
        if (this.def.ai) moving = this.def.ai(this, dt, target, d, slowMul); // region monsters / bosses: their own behaviour
        else if (this.def.pattern === 'kitsune') moving = this.kitsuneAI(dt, target, d, slowMul);
        else if (this.state === 'windup' || this.state === 'attack') moving = this.runAttack(dt, target, d);
        else if (this.state === 'rest') { // post-barrage breather: stands still, open to hits
          this.faceTo(target.pos.x, target.pos.z, dt * 0.3);
          if (this.stateT >= this.restDur) { this.state = 'chase'; this.stateT = 0; }
        } else {
          const want = A.type === 'ranged' || A.type === 'barrage' ? A.range * 0.7 : A.range * 0.85;
          const inRange = d < (A.type === 'ranged' || A.type === 'barrage' ? A.range : A.range + target.radius);
          if (inRange && this.cd <= 0 && this.mode.los(this.pos, target.pos)) this.startAttack(target, d);
          else if (d > want || !this.mode.los(this.pos, target.pos)) { this.chase(target, dt, slowMul); moving = true; }
          else if ((A.type === 'ranged' || A.type === 'barrage') && d < A.range * 0.4 && !this.def.noKite) { this.move(_dir.copy(this.pos).sub(target.pos).setY(0).normalize(), dt, 0.7 * slowMul); moving = true; }
          else this.faceTo(tx, tz, dt);
          // teleporting elites
          if (this.stats.teleport && this.stateT > this.stats.teleport && d > 3) { this.blink(target); }
        }
        // boss phases: summon minions at 66% / 33%
        if (this.def.boss && this.def.summon) {
          const frac = this.life / this.lifeMax;
          if ((frac < 0.66 && this.summoned === 0) || (frac < 0.33 && this.summoned === 1)) { this.summoned++; this.mode.summonAround(this, this.def.summon, this.def.summonN?.[this.summoned - 1] ?? 3 + this.summoned); G.ui?.toast?.(`${this.name} ${this.summoned === 1 ? 'calls for backup!' : 'is getting really mad!'}`, { color: '#ff8a9a', icon: 'oni' }); this.emote(this.summoned === 1 ? '!' : 'anger', 1.6); G.engine.rig.shake(0.4); if (this.summoned === 2) this.enraged = true; }
        }
      } else if (!this.leader) { // idle wander
        if (!this.wander || this.stateT > 4) { const h = this.home, a = rand(0, TAU), r = h ? h.r * Math.sqrt(Math.random()) : 0; this.wander = h ? new THREE.Vector3(h.x + Math.cos(a) * r, 0, h.z + Math.sin(a) * r) : this.pos.clone().add(new THREE.Vector3(rand(-3, 3), 0, rand(-3, 3))); this.stateT = 0; } // (home: a zone pack's camp disc, dungeon/zoneRun.js: it mills about inside it)
        if (dist(this.wander.x, this.wander.z, this.pos.x, this.pos.z) > 0.3 && this.stateT < 2.5) { this.move(_dir.copy(this.wander).sub(this.pos).setY(0).normalize(), dt, 0.35); moving = true; }
      } else if (this.leader.alive && dist(this.leader.pos.x, this.leader.pos.z, this.pos.x, this.pos.z) > 2.5) {
        this.move(_dir.copy(this.leader.pos).sub(this.pos).setY(0).normalize(), dt, 0.5); moving = true;
      }
    }
    // frost aura
    if (this.stats.aura && P && !G.playerDead) {
      const a = this.stats.aura;
      if (dist(P.pos.x, P.pos.z, this.pos.x, this.pos.z) < a.radius) { P.slowT = 0.3; P.slowAmt = a.slow; this.auraAcc = (this.auraAcc || 0) + dt; if (this.auraAcc > 1) { this.auraAcc = 0; this.mode.combat.hitPlayer(a.dps, { element: a.element, level: this.level, src: this }); } }
      if (Math.random() < dt * 8) G.vfx.spark.spawn({ x: this.pos.x + rand(-a.radius, a.radius) * 0.6, y: 0.3, z: this.pos.z + rand(-a.radius, a.radius) * 0.6, vy: 0.5, life: 0.8, size: 0.2, color: '#bfe8ff', alpha: 0.8, alpha1: 0 });
    }
    // elite shimmer
    if (this.eliteColor && Math.random() < dt * 6) G.vfx.spark.spawn({ x: this.pos.x + rand(-0.4, 0.4) * this.scale, y: rand(0.2, 1.1) * this.scale, z: this.pos.z + rand(-0.4, 0.4) * this.scale, vy: 0.6, life: 0.7, size: 0.22, color: this.eliteColor, alpha: 0.9, alpha1: 0 });
    this.def.update?.(this, dt, moving);
    this.anim.update(dt, moving, this.speed);
    if (this.kit) this.kit.update(dt, this.pos);
    this.sync();
  }
  // Keep packs readable: bodies never interpenetrate (visual radius incl. scale), nor stand inside Chewy / allies.
  // Each monster resolves its share of every overlap (half vs another monster, all of it vs a boss or an ally);
  // bosses are never shoved by their minions. The per-frame correction is rate-limited so crowds settle smoothly.
  separate(dt) {
    const G = this.G, P = G.player;
    if (this.def.boss) return; // bosses are never shoved (move() stops them walking into Chewy instead)
    if (!this.aggro && P && (this.pos.x - P.pos.x) ** 2 + (this.pos.z - P.pos.z) ** 2 > 900) return; // idle & off-screen: nothing to untangle
    let px = 0, pz = 0;
    const R = this.bodyR, g = NOGRID ? null : crowdOf(this.mode);
    const list = g ? g.near(this.pos.x, this.pos.z, (R + g.maxR) * 1.02 + PAD) : this.mode.monsters; // (neighbours only: crowd.js)
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      if (m === this || !m.alive) continue;
      const dx = this.pos.x - m.pos.x, dz = this.pos.z - m.pos.z, mn = (R + m.bodyR) * 1.02;
      if (dx > mn || dx < -mn || dz > mn || dz < -mn) continue;
      const d2 = dx * dx + dz * dz; if (d2 >= mn * mn) continue;
      let d = Math.sqrt(d2), nx, nz;
      if (d < 1e-4) { const a = (this.mode.monsters.indexOf(this) * 2.39996) % TAU; nx = Math.cos(a); nz = Math.sin(a); d = 0; } else { nx = dx / d; nz = dz / d; }
      const share = m.def.boss ? 1 : 0.5;
      px += nx * (mn - d) * share; pz += nz * (mn - d) * share;
    }
    g?.release();
    const keepOff = (e, er) => {
      const dx = this.pos.x - e.pos.x, dz = this.pos.z - e.pos.z, mn = R + er, d2 = dx * dx + dz * dz;
      if (d2 >= mn * mn) return;
      const d = Math.sqrt(d2); if (d < 1e-4) { px += 1e-3; return; }
      px += dx / d * (mn - d); pz += dz / d * (mn - d);
    };
    if (P && !G.playerDead) keepOff(P, PLAYER_VR);
    for (const e of this.mode.combat?.allies || this.mode.combat?.entities || []) if (e.team === 'ally' && e.alive && e !== P && e.pos && !e.untargetable) keepOff(e, Math.max(0.3, e.radius || 0.3));
    const L = Math.hypot(px, pz);
    if (L < 1e-5) return;
    const k = Math.min(1, Math.max(0.05, dt * 10) / L);
    _p.copy(this.pos); this.pos.x += px * k; this.pos.z += pz * k;
    this.world.collision.resolve(this.pos, this.radius * 0.8, _p);
  }
  pickTarget() {
    const G = this.G; let best = G.playerDead || G.player?.hidden ? null : G.player, bd = best ? dist(best.pos.x, best.pos.z, this.pos.x, this.pos.z) : 1e9; // (hidden: Poe in her smoke / Vanish — they lose her)
    for (const e of this.mode.combat.allies || this.mode.combat.entities) { // (the allies set holds the entities' allies in the same order)
      if (!e.alive || e.team !== 'ally' || e.untargetable) continue;
      const d = dist(e.pos.x, e.pos.z, this.pos.x, this.pos.z) - (e.tauntFor ? e.tauntFor(this) : e.taunt ? 6 : 0); // (Moka's Decoy Duck: tauntFor = must-bite within its lure)
      if (d < bd - 1) { bd = d; best = e; }
    }
    return best;
  }
  faceTo(x, z, dt) { this.facing = dampAngle(this.facing, Math.atan2(x - this.pos.x, z - this.pos.z), 10, dt); }
  move(dir, dt, mul = 1) {
    _p0.copy(this.pos);
    // fast movers (dashes, charges, long frames) take sub-steps no longer than their collision radius, each resolved,
    // so they can't tunnel through a pillar or a thin wall; at normal frame rates every move is one step, as before
    const r = this.radius * 0.8, sx = dir.x * this.speed * mul * dt, sz = dir.z * this.speed * mul * dt, n = subSteps(Math.hypot(sx, sz), r);
    for (let i = 0; i < n; i++) {
      _p.copy(this.pos);
      this.pos.x += sx / n; this.pos.z += sz / n;
      this.world.collision.resolve(this.pos, r, _p); // bodies are kept apart in separate()
    }
    const P = this.G.player;
    if (this.def.boss && P && !this.G.playerDead) { // a boss never steps into Chewy (it isn't pushed either)
      const mn = this.bodyR + PLAYER_VR, d1 = (this.pos.x - P.pos.x) ** 2 + (this.pos.z - P.pos.z) ** 2;
      if (d1 < mn * mn && d1 < (_p0.x - P.pos.x) ** 2 + (_p0.z - P.pos.z) ** 2) { this.pos.x = _p0.x; this.pos.z = _p0.z; }
    }
    this.facing = dampAngle(this.facing, Math.atan2(dir.x, dir.z), 10, dt);
  }
  chase(target, dt, mul) {
    let dir;
    if (this.mode.los(this.pos, target.pos)) dir = _dir.copy(target.pos).sub(this.pos).setY(0).normalize();
    else dir = this.mode.flowDir(this.pos, _dir) || _dir.copy(target.pos).sub(this.pos).setY(0).normalize();
    // surround instead of stacking: when a pack-mate already blocks the way in, slide around it (each monster keeps
    // its own side) so the pack fans out into a ring of readable bodies rather than a pile behind the front row
    if (!this.def.boss) {
      const dT = dist(target.pos.x, target.pos.z, this.pos.x, this.pos.z);
      if (dT < 4) {
        const g = NOGRID ? null : crowdOf(this.mode);
        const list = g ? g.near(this.pos.x, this.pos.z, (this.bodyR + g.maxR) * 1.2 + PAD) : this.mode.monsters;
        for (let i = 0; i < list.length; i++) { // (whichever blocker comes first, the turn is the same)
          const m = list[i];
          if (m === this || !m.alive) continue;
          const dx = m.pos.x - this.pos.x, dz = m.pos.z - this.pos.z, mn = (this.bodyR + m.bodyR) * 1.2;
          if (dx * dx + dz * dz > mn * mn || dx * dir.x + dz * dir.z <= 0) continue;
          const side = this.side ??= (Math.random() < 0.5 ? -1 : 1), a = side * 1.1;
          const c = Math.cos(a), s = Math.sin(a);
          dir = _dir2.set(dir.x * c - dir.z * s, 0, dir.x * s + dir.z * c);
          mul *= 0.7;
          break;
        }
        g?.release();
      }
    }
    this.move(dir, dt, mul);
  }
  // ---------------------------------------------------------------- Tamamo: telegraphed blinks + cast windows (no kiting)
  // Cycle: glide in to casting range → foxfire barrage (0.8 s wind-up, blue ring at her feet) → a 1.5–1.9 s cast window
  // where she stands still fanning herself (sweat drop + lavender circle = "hit me now") → if Chewy keeps crowding her,
  // a telegraphed blink (0.75 s: foxfire swirl at her feet + a ring where she will appear) to 5–6.5 m away → repeat.
  kitsuneAI(dt, target, d, slowMul) {
    const G = this.G, A = this.def.attack, en = !!this.enraged;
    this.blinkCd = (this.blinkCd ?? 2.5) - dt;
    // how long Chewy has been crowding her (keeps counting through her barrage and cast window)
    this.pressT = d < 3.4 ? (this.pressT || 0) + dt : Math.max(0, (this.pressT || 0) - dt * 0.5);
    const face = (k = 1) => this.faceTo(target.pos.x, target.pos.z, dt * k);
    switch (this.state) {
      case 'windup': case 'attack': {
        const was = this.state;
        const mv = this.runAttack(dt, target, d);
        if (was === 'attack' && this.state === 'chase') this.startCastWindow();
        return mv;
      }
      case 'cast': // vulnerable: stands still, slowly turning to track Chewy
        face(0.3);
        if (this.stateT >= this.castDur) { this.state = 'chase'; this.stateT = 0; this.kit?.stop(); }
        return false;
      case 'blinkwind': {
        face(0.5);
        const k = clamp(this.stateT / this.blinkDur);
        if (Math.random() < dt * 40) { const a = rand(0, TAU), r = this.bodyR * (1.3 - k * 0.8); G.vfx.undamped(() => G.vfx.spark.spawn({ x: this.pos.x + Math.cos(a) * r, y: rand(0.1, 0.6), z: this.pos.z + Math.sin(a) * r, vx: -Math.sin(a) * 3, vy: rand(1.5, 3.5), vz: Math.cos(a) * 3, life: 0.5, size: rand(0.25, 0.45), size1: 0.05, color: k > 0.6 ? '#dff0ff' : '#8ab8ff', alpha: 0.9, alpha1: 0, drag: 2 })); }
        if (this.stateT >= this.blinkDur) this.doBlink();
        return false;
      }
      case 'recover':
        face();
        if (this.stateT > 0.45) { this.state = 'chase'; this.stateT = 0; }
        return false;
      default: { // 'idle' / 'chase': hold a casting distance instead of running away
        const los = this.mode.los(this.pos, target.pos);
        if (this.pressT > (en ? 0.9 : 1.3) && this.blinkCd <= 0 && this.startBlink(target)) return false;
        if (d < A.range && this.cd <= 0 && los) { this.startAttack(target, d); return false; }
        if (d > 7 || !los) { this.chase(target, dt, slowMul); return true; }
        face();
        return false;
      }
    }
  }
  startCastWindow() {
    const G = this.G;
    this.state = 'cast'; this.stateT = 0; this.castDur = this.enraged ? 1.5 : rand(1.6, 1.9);
    this.kit?.play('wave', { speed: 1.3 / this.castDur });
    this.emote('sweat', this.castDur);
    G.vfx.decal(this.pos, { r: this.bodyR * 1.5, color: '#c8b8ff', additive: true, opacity: 0.4, life: this.castDur, spin: -0.8 });
  }
  startBlink(target) {
    const W = this.world, G = this.G;
    const clear = (x, z) => W.walkable(x, z) && !W.collision?.solidAt?.(x, z, this.radius) && [0, 1, 2, 3].every(i => W.walkable(x + Math.cos(i * TAU / 4) * this.radius, z + Math.sin(i * TAU / 4) * this.radius));
    // Chewy walks in straight lines: only land where he can come straight at her (no lantern / torii in between)
    const path = (x, z) => { for (let k = 0.1; k < 0.95; k += 0.08) { const px = x + (target.pos.x - x) * k, pz = z + (target.pos.z - z) * k; if (!W.walkable(px, pz) || W.collision?.solidAt?.(px, pz, 0.35)) return false; } return true; };
    let best = null;
    for (let i = 0; i < 24; i++) {
      const a = rand(0, TAU), r = rand(5, 6.5), x = target.pos.x + Math.cos(a) * r, z = target.pos.z + Math.sin(a) * r;
      if (!clear(x, z) || !path(x, z) || !this.mode.los(new THREE.Vector3(x, 0, z), target.pos)) continue;
      const sc = -Math.abs(dist(x, z, this.pos.x, this.pos.z) - 6); // a short hop, not across the room
      if (!best || sc > best.sc) best = { x, z, sc };
    }
    if (!best) { this.blinkCd = 1; return false; }
    this.state = 'blinkwind'; this.stateT = 0; this.blinkDur = this.enraged ? 0.55 : 0.75;
    this.blinkTo = new THREE.Vector3(best.x, 0, best.z);
    this.kit?.play('cast', { speed: 0.55 / this.blinkDur });
    // warm telegraphs: her arena sigil and foxfire are blue, so blue rings vanished into it (pink = where she leaves,
    // gold-white = where she lands)
    this.mode.bossTelegraph?.(this.blinkDur);
    G.vfx.telegraph(this.pos, this.bodyR * 1.4, this.blinkDur, TELE.blinkFrom);
    G.vfx.telegraph(this.blinkTo, this.bodyR * 1.2, this.blinkDur, TELE.blinkTo);
    G.vfx.ring(this.pos, { color: '#ffd89a', r0: this.bodyR * 1.8, r1: 0.3, life: this.blinkDur, opacity: 0.8 });
    Events.emit('sfx', 'ghost_wail', { pos: this.pos });
    return true;
  }
  doBlink() {
    const G = this.G, to = this.blinkTo, from = this.pos.clone();
    this.pos.set(to.x, this.world.heightAt(to.x, to.z), to.z);
    G.vfx.undamped(() => { // puffs of foxfire where she vanished and where she lands
      G.vfx.poof(from.setY(from.y + 0.8), { color: '#c8dcff', n: 16, size: 0.9 });
      G.vfx.sparks(from, { n: 12, color: '#9ac4ff', speed: 5, size: 0.4 });
      G.vfx.poof(this.lift(0.8), { color: '#c8dcff', n: 16, size: 0.9 });
    });
    G.vfx.ring(this.pos, { color: '#9ac4ff', r0: 0.3, r1: this.bodyR * 2.2, life: 0.4 });
    Events.emit('sfx', 'portal');
    this.state = 'recover'; this.stateT = 0; this.pressT = 0;
    this.blinkCd = this.enraged ? 3.5 : 5; this.cd = Math.min(this.cd, 0.7);
    this.kit?.stop();
    this.sync();
  }
  blink(target) {
    const a = rand(0, TAU); const x = target.pos.x + Math.cos(a) * 2.5, z = target.pos.z + Math.sin(a) * 2.5;
    if (!this.world.walkable(x, z)) return;
    this.G.vfx.poof(this.lift(0.4), { color: '#c9b8ff', n: 8 });
    this.pos.set(x, this.world.heightAt(x, z), z); this.stateT = 0;
    this.G.vfx.poof(this.lift(0.4), { color: '#c9b8ff', n: 8 });
    Events.emit('sfx', 'portal');
  }
  startAttack(target, d) {
    const A = this.def.attack;
    this.state = 'windup'; this.stateT = 0; this.atkTarget = target;
    this.atkPoint = target.pos.clone();
    this.anim.wind = 1;
    this.kit?.play(A.type === 'ranged' ? 'throw' : 'swing', { speed: 0.9 / A.windup * 0.4 });
    const vfx = this.G.vfx;
    if (this.def.boss) this.mode.bossTelegraph?.(A.windup + (A.proj === 'firepot' ? 1.3 : 0.1)); // the sigil steps back while it winds up
    if (A.type === 'aoe') this.telegraph = vfx.telegraph(this.pos, A.radius, A.windup, '#c8e070');
    else if (A.type === 'slam') { this.telegraph = vfx.telegraph(this.atkPoint, A.radius, A.windup, this.def.boss ? TELE.slam : '#ff5a6a'); }
    else if (A.type === 'spin') this.telegraph = vfx.telegraph(this.pos, A.radius, A.windup, this.def.boss ? TELE.spin : '#ff5a6a');
    else if (A.type === 'charge') { this.chargeDir = target.pos.clone().sub(this.pos).setY(0).normalize(); }
    else if (A.type === 'barrage' && A.proj === 'foxfire') { // foxfire gathers: blue ring at her feet + motes drawn in
      this.telegraph = vfx.telegraph(this.pos, this.bodyR * 1.6, A.windup, TELE.barrage);
      vfx.undamped(() => vfx.sparkle(this.lift(this.height * 0.45), { n: 14, color: '#9ac4ff', r: this.bodyR, life: A.windup, size: 0.35, rise: 0.4 }));
    }
    if (this.def.boss) { Events.emit('sfx', 'boss_roar'); this.mode.bossEngaged?.(this); }
  }
  runAttack(dt, target, d) {
    const A = this.def.attack, G = this.G, C = this.mode.combat;
    const roll = () => randInt(this.stats.dmg[0], this.stats.dmg[1]) + (this.stats.dmgFire ? randInt(...this.stats.dmgFire) : 0);
    if (this.state === 'windup') {
      if (A.type !== 'charge' && A.type !== 'slam') this.faceTo(target.pos.x, target.pos.z, dt);
      if (A.type === 'charge') this.facing = Math.atan2(this.chargeDir.x, this.chargeDir.z);
      if (this.stateT < A.windup) return false;
      this.state = 'attack'; this.stateT = 0; this.anim.wind = 0; this.anim.lunge = 1;
      const el = this.stats.element;
      switch (A.type) {
        case 'melee': {
          const hitD = dist(target.pos.x, target.pos.z, this.pos.x, this.pos.z);
          G.vfx.slash(this.pos, this.facing, { color: '#ffd0d0', arc: 1.6, r: 1.0 * this.scale, life: 0.18 });
          Events.emit('sfx', A.heavy ? 'swing_heavy' : 'swing');
          if (hitD < A.range + (target.radius || 0.3) + 0.3) this.dealTo(target, roll(), el);
          break;
        }
        case 'ranged': case 'barrage': {
          const n = A.type === 'barrage' ? (this.enraged ? (A.nEnraged || 9) : (A.n || 6)) : (this.stats.multishot || 1);
          const base = target.pos.clone().sub(this.pos).setY(0).normalize();
          const spread = A.type === 'barrage' ? 1.3 : 0.35;
          for (let i = 0; i < n; i++) {
            const a = n > 1 ? (i / (n - 1) - 0.5) * spread : 0;
            const dir = base.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), a);
            if (A.proj === 'firepot') { // a staggered rain of pots, each with its own landing circle
              const sp = A.spread || 2, blast = A.blast || 1.8, time = A.spread ? rand(0.85, 1.2) : 0.9;
              const to = target.pos.clone().add(new THREE.Vector3(rand(-sp, sp), 0, rand(-sp, sp)));
              const pot = C.spawn({ team: 'enemy', kind: 'firepot', pos: this.lift(1.2 * this.scale), lob: { to, h: 3.5, time }, onEnd: (p) => this.mode.explodeAt(p.pos, blast, Math.round(roll() * (A.dmgMul || 1)), 'fire', this) });
              pot.tele = G.vfx.telegraph(to, blast, time, this.def.boss ? TELE.firepot : '#ff7a3a'); // (fizzled with the pot on a boss defeat)
            } else {
              C.spawn({ team: 'enemy', kind: A.proj, pos: this.lift(0.6 * this.scale + 0.2), dir, speed: A.speed, range: A.range * 1.4, radius: 0.3, homing: A.proj === 'foxfire' ? (A.homing ?? 1.2) : 0, onHit: (e) => this.dealTo(e, Math.round(roll() * (A.dmgMul || 1)), el) }).homeTarget = target;
            }
          }
          Events.emit('sfx', A.proj === 'acorn' ? 'throw' : A.proj === 'foxfire' ? 'ghost_wail' : 'fire_whoosh', { pos: this.pos });
          break;
        }
        case 'aoe': {
          this.mode.sporeCloud(this.pos, A.radius, roll(), this);
          break;
        }
        case 'slam': {
          this.mode.explodeAt(this.atkPoint, A.radius, Math.round(roll() * 1.4), el, this, true);
          G.engine.rig.shake(0.8);
          break;
        }
        case 'spin': this.anim.spin = 1; this.spinT = 1.8; break;
        case 'charge': this.chargeT = 0.45; Events.emit('sfx', 'dash'); break;
      }
      this.telegraph = null;
      return false;
    }
    // attack follow-through
    if (A.type === 'charge' && this.chargeT > 0) {
      this.chargeT -= dt;
      this.move(this.chargeDir, dt, (A.dash || 8) / this.speed);
      if (!this.chargeHit && dist(target.pos.x, target.pos.z, this.pos.x, this.pos.z) < this.radius + (target.radius || 0.3) + 0.2) { this.chargeHit = true; this.dealTo(target, roll(), this.stats.element, 1.5); }
      if (Math.random() < 0.5) G.vfx.dust(this.pos, { n: 1 });
      return true;
    }
    if (A.type === 'spin' && this.spinT > 0) {
      this.spinT -= dt;
      this.move(_dir.copy(target.pos).sub(this.pos).setY(0).normalize(), dt, 0.6);
      this.spinAcc = (this.spinAcc || 0) + dt;
      if (this.spinAcc > 0.3) { this.spinAcc = 0; G.vfx.slash(this.pos, this.facing + rand(0, TAU), { color: '#ffd0e0', arc: 3, r: A.radius * 0.8, life: 0.25 }); if (dist(target.pos.x, target.pos.z, this.pos.x, this.pos.z) < A.radius) this.dealTo(target, Math.round(roll() * 0.5), this.stats.element); }
      if (this.spinT <= 0) this.anim.spin = 0;
      return true;
    }
    if (this.stateT > 0.35) {
      this.state = 'chase'; this.chargeHit = false; this.cd = A.cd * rand(0.85, 1.2);
      if (A.rest) { // bosses with a breather after a big volley say so: sweat drop + soft circle while they catch their breath
        this.state = 'rest'; this.stateT = 0; this.restDur = this.enraged ? A.rest * 0.75 : A.rest;
        this.emote('sweat', this.restDur);
        G.vfx.decal(this.pos, { r: this.bodyR * 1.4, color: '#ffd0a0', additive: true, opacity: 0.3, life: this.restDur, spin: -0.8 });
      }
    }
    return false;
  }
  dealTo(target, raw, element, knockMul = 1) {
    // blinded (Poe's smoke): a share of its blows go wide
    if (this.status.blind > 0 && Math.random() < (this.status.blindMiss || 0.4)) { this.G.ui?.float?.(target.pos.clone().setY(target.pos.y + 1.4), 'Miss!', { kind: 'status', color: '#ddd4ee' }); return; }
    const C = this.mode.combat;
    if (target === this.G.player) C.hitPlayer(raw, { element, level: this.level, from: this.pos, knock: (this.stats.knockback || 0.4) * knockMul, onHit: this.stats.onHit, src: this });
    else C.hitAlly(target, raw, { element, from: this.pos });
  }
}
