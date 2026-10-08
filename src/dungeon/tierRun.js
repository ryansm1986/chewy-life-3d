// A tier or Spirit run's floor (docs/ZONES.md §5, §5.1 as built; ROADMAP Z-E1, Z-E2, Z-E4). A DungeonMode with a tier,
// a Spirit tier or modifiers owns one (mode.tr) and runs the run-wide parts the layout and spawn hooks can't
// (rpg/zoneMods.js does those: pack sizes, extra packs, promotions, chests, shrines; every monster's stats):
//  - rewards: every kill's xp × (1 + xp bonus), drops rolled with the rarity bonus as magic find, and the quantity bonus
//    as extra items (and fuller coin piles); chests the same; the boss's hoard also takes the boss-loot bonus.
//  - Elemental: combat.hitPlayer (this floor's own Combat) folds the extra element into a modded monster's hit (the
//    hero's resistance to it applies), with that element's flourish (fire embers, a frost chill, zap sparks); the
//    monsters' footprint rings take the element's colour.
//  - Haunted: a share of the fallen (every elite) rise again as a Yūrei a beat later (dungeon/zoneMonsters/spirit.js),
//    up to a cap alive at once; ghosts pay a third of the xp and drop only coins and potions.
//  - Night March: a darker grade and cooler, dimmer cave light (the lanterns and the hero's own light stay: the floor
//    still reads), the hero's light a little stronger; monsters notice you from 14 m (mode.alertR) and fight harder.
//  - Hard Ground: G.regenMul (rpg/actions.js tickRegen) 0.7 while on the floor.
//  - Boss's Wrath: at 40% life the boss flies into a wrath: it enrages, calls a wave of the dungeon's monsters, and
//    every 8 s sends a telegraphed shockwave ring out round it.
//  - Cursed Shrines: a shrine's blessing comes with a curse (combat.buffs.cursed: +25% damage taken for 20 s).
//  - the pinnacle (every 10th Spirit tier's boss floor, layout.pinnacle): the Four Seasons, dungeon/pinnacle.js (this.pin).
//  - the clear (the run's last boss): the Lantern chest rises (rpg/tiers.js clearChest), the banner names the tier
//    opened (or the Spirit endgame), the events fire (DungeonMode.clearDungeon).
import * as THREE from 'three';
import { MONSTERS } from './monsters.js';
import { extraItems, ZONE_MODS } from '../rpg/zoneMods.js';
import { runLabel, clearChest } from '../rpg/tiers.js';
import { generateItem, makeUnique, makeGem, GEM_TYPES, UNIQUES } from '../rpg/items.js';
import { ZONE_UNIQUE } from '../rpg/zoneProgress.js';
import { Pinnacle } from './pinnacle.js';
import { PINNACLE_UNIQUE } from './pinnacleLayout.js';
import { playerDamageTaken } from '../rpg/stats.js';
import { tele, chill } from '../regions/monsters/bamboo.js';
import { makeOutline } from '../gfx/materials.js';
import { Events } from '../core/events.js';
import { RNG, rand, TAU } from '../core/util.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const EL_COLOR = { fire: '#ff8a3c', frost: '#8fd0ff', zap: '#ffe44a' };
/** an elemental monster's ink contour: a deep shade of its element (champions keep their bright, wider elite contour) */
const EL_INK = { fire: '#b8361a', frost: '#1f62a8', zap: '#94700a' };
/** the Spirit endgame's uniques (rpg/items.js UNIQUES tagged spirit: never rolled at random) */
export const ENDGAME_UNIQUES = () => Object.values(UNIQUES).filter(u => u.spirit && !u.pinnacle).map(u => u.id);
const RING_MATS = new Map(), INK_MATS = new Map();

export class TierRun {
  constructor(mode) {
    this.mode = mode; this.G = mode.G; this.R = mode.runMods; this.run = mode.run;
    this.rng = new RNG(((mode.run?.packSeed || 1) * 13 + 7) >>> 0);
    this.ghostQ = []; this.ghostsAlive = 0; this.wrath = null; this.seenT = 0;
    this.stats = { ghosts: 0, extraItems: 0, curses: 0, wrath: 0, elHits: 0, shock: 0 }; // (QA: s30, the shots)
    this.pin = mode.layout?.pinnacle ? new Pinnacle(mode) : null; // (the Four Seasons: Spirit 10, 20, …)
  }
  get rewards() { return this.R.rewards; }
  get label() { return runLabel(this.R); }
  /** the rarity bonus as magic find (+25% rarity = +25 MF) */
  get mfBonus() { return Math.round((this.rewards.rarity || 0) * 100); }
  /** the run's xp multiplier for a kill (ghosts pay a third) */
  xpMul(m) { return (1 + (this.rewards.xp || 0)) * (m?._ghost ? 0.35 : 1); }
  // ------------------------------------------------------------------ build / start
  /** DungeonMode.build, after the world: what must be in place before the monsters spawn */
  build() {
    const M = this.mode, Ru = this.R.run;
    if (Ru.alertR) M.alertR = Ru.alertR; // (Monster.update's notice radius: Night March)
    if (this.R.monster.el) this.wrapHits();
    if (Ru.haunted) M.warmMonsters?.(['yurei']);
    this.pin?.build();
  }
  /** DungeonMode.start, once the grade is set and the packs are out */
  start() {
    const G = this.G, R = this.R;
    if (R.run.night) this.night();
    if (R.run.regen !== 1) G.regenMul = R.run.regen;
    this.decorateAll();
    this.pin?.start();
    const names = R.mods.map(id => ZONE_MODS[id].short || ZONE_MODS[id].name);
    if (R.tier > 0 || R.spirit > 0 || names.length) setTimeout(() => { if (G.dungeon === this.mode) G.ui?.toast?.(`${this.label}${names.length ? ': ' + names.join(' · ') : ''}`, { icon: 'lantern', color: R.spirit ? '#c8b8ff' : '#ffd88a' }); }, 3000);
  }
  // ------------------------------------------------------------------ Night March
  night() {
    const W = this.mode.world, post = this.G.engine.post, gr = post.grade.uniforms, M = this.mode;
    const save = this.nightSaved = { hemi: W.hemi?.intensity, sun: W.sun?.intensity, sunC: W.sun?.color.clone(), gain: gr.get('uGain').value.clone(), sat: gr.get('uSat').value, vig: gr.get('uVignette').value, vigC: gr.get('uVigColor').value.clone() };
    if (W.hemi) { W.hemi.intensity *= 0.52; W.hemi.color.lerp(new THREE.Color('#7a86c8'), 0.35); }
    if (W.sun) { W.sun.intensity *= 0.42; W.sun.color.lerp(new THREE.Color('#9fb0ff'), 0.55); }
    if (W.scene.background?.isColor) W.scene.background.multiplyScalar(0.55);
    if (W.scene.fog) W.scene.fog.color.multiplyScalar(0.55);
    gr.get('uGain').value.multiplyScalar(0.92).z *= 1.05;
    gr.get('uSat').value = save.sat * 0.9;
    gr.get('uVignette').value = 1.2; gr.get('uVigColor').value.set(0.12, 0.1, 0.22);
    if (M.playerLight) { M.playerLight.intensity *= 1.2; M.playerLight.radius *= 1.25; }
  }
  // ------------------------------------------------------------------ Elemental
  wrapHits() {
    const C = this.mode.combat, G = this.G, tr = this;
    if (!C || C._trRaw) return;
    const raw = C._trRaw = C.hitPlayer;
    C.hitPlayer = function (dmg, o = {}) {
      const e = o?.src?._el;
      if (!e || !(dmg > 0)) return raw.call(this, dmg, o);
      // the extra element folded into the one hit: what the hero takes is the hit after its own mitigation plus pct of it
      // after the hero's resistance to that element
      const el0 = o.element || 'phys', D = G.derived || {}, lv = o.level || 1;
      const a = playerDamageTaken(D, dmg, el0, lv), b = playerDamageTaken(D, dmg * e.pct, e.el, lv);
      const r = raw.call(this, dmg * (a + b) / Math.max(1, a), o);
      if (r) { tr.stats.elHits++; tr.elHit(e.el, o.src); }
      return r;
    };
  }
  elHit(el, src) {
    const G = this.G, P = G.player; if (!P) return;
    const c = EL_COLOR[el];
    for (let i = 0; i < 7; i++) { const a = rand(0, TAU); G.vfx.spark.spawn({ x: P.pos.x + Math.cos(a) * 0.25, y: P.pos.y + rand(0.3, 1.1), z: P.pos.z + Math.sin(a) * 0.25, vx: Math.cos(a) * 1.6, vy: rand(0.6, 1.8), vz: Math.sin(a) * 1.6, life: rand(0.35, 0.55), size: rand(0.14, 0.24), size1: 0.03, color: c, alpha: 1, alpha1: 0, drag: 2 }); }
    if (el === 'frost' && src?.mode) chill(src, 0.9, 0.25);
  }
  /** an elemental floor's monsters wear their element: a contour in its deep shade and its colour in the footprint ring
   *  (champions and uniques keep their elite contour and ring) */
  decorate(m) {
    m._trSeen = true;
    const e = m._el; if (!e || m.eliteColor) return;
    if (m.shadow?.material?.uniforms) {
      let mat = RING_MATS.get(e.el);
      if (!mat) { mat = m.shadow.material.clone(); mat.uniforms.uCol.value = new THREE.Color(EL_COLOR[e.el]); mat.uniforms.uRingA.value = 0.66; RING_MATS.set(e.el, mat); }
      m.shadow.material = mat;
    }
    if (m.model?.outline) {
      let ink = INK_MATS.get(e.el);
      if (!ink) INK_MATS.set(e.el, ink = makeOutline(EL_INK[e.el], 0.021));
      m.model.outline.material = ink; for (const o of m.model.subs || []) o.material = ink;
    }
  }
  decorateAll() { for (const m of this.mode.monsters) if (!m._trSeen) this.decorate(m); }
  // ------------------------------------------------------------------ deaths: Haunted
  onMonsterDeath(m) {
    if (m._ghost) { this.ghostsAlive = Math.max(0, this.ghostsAlive - 1); return; }
    const H = this.R.run.haunted;
    if (!H || m.def?.boss || m.bossAdd || m.vanished || m.breakable) return;
    const p = m.rank === 'normal' ? H.normal : H.elite;
    if (this.ghostsAlive + this.ghostQ.length >= H.cap || !this.rng.chance(p)) return;
    this.ghostQ.push({ t: 0.75, x: m.pos.x, z: m.pos.z, level: m.level });
    const G = this.G; // a cold wisp gathering where it fell
    for (let i = 0; i < 8; i++) G.vfx.spark.spawn({ x: m.pos.x + rand(-0.4, 0.4), y: m.pos.y + rand(0.05, 0.3), z: m.pos.z + rand(-0.4, 0.4), vy: rand(0.6, 1.4), life: rand(0.7, 1), size: rand(0.14, 0.22), size1: 0.03, color: i % 2 ? '#cfeeff' : '#8fd8ff', alpha: 0.9, alpha1: 0 });
  }
  riseGhost(q) {
    const M = this.mode, G = this.G;
    if (!M.world.walkable(q.x, q.z)) return;
    const g = M.spawnMonster('yurei', { level: q.level, rank: 'normal', variant: this.rng.chance(0.3) ? 1 : 0, x: q.x, z: q.z, rng: () => this.rng.next() });
    g._ghost = true; g.aggro = true; this.ghostsAlive++; this.stats.ghosts++;
    G.vfx.ring(V(q.x, g.pos.y + 0.05, q.z), { color: '#bfe6ff', r0: 0.2, r1: 1.2, life: 0.6, opacity: 0.7 });
  }
  // ------------------------------------------------------------------ rewards
  /** a kill's drops (after the zone's thinning): ghosts keep only coins and potions; the quantity bonus adds items
   *  (and fills the coin piles); the boss's hoard also takes the boss-loot bonus; a Spirit unique pack's leader may carry
   *  an endgame unique */
  onDrops(m, drops, isBoss) {
    if (m._ghost) { for (let i = drops.length - 1; i >= 0; i--) if (drops[i].type !== 'coins' && drops[i].type !== 'potion') drops.splice(i, 1); return; }
    const Rw = this.rewards, q = (Rw.qty || 0) + (isBoss ? Rw.boss || 0 : 0), mf = (this.G.derived?.mf || 0) + this.mfBonus;
    const items = drops.filter(d => d.type === 'item').length, n = extraItems(items, q, () => this.rng.next());
    for (let i = 0; i < n; i++) drops.push({ type: 'item', item: generateItem({ ilvl: m.level, mf, rank: isBoss ? 'hoard' : m.rank, rng: this.rng }) });
    if (Rw.qty > 0) for (const d of drops) if (d.type === 'coins') d.n = Math.round(d.n * (1 + Rw.qty * 0.5));
    this.stats.extraItems += n;
    if (this.R.spirit > 0 && m.rank === 'unique' && this.rng.chance(this.R.info.leaderUnique)) { const u = this.endgameUnique(m.level); if (u) drops.push(u); }
    this.pin?.onDrops(m, drops, isBoss); // (the pinnacle: each season's items wait for Winter's hoard)
  }
  /** a chest's drops: the quantity bonus as extra items; the run's clear chest adds its own hoard (clearDrops) */
  onChest(chest, drops) {
    const Rw = this.rewards, mf = (this.G.derived?.mf || 0) + this.mfBonus, lvl = this.mode.layout.mlvl;
    const n = extraItems(drops.filter(d => d.type === 'item').length, Rw.qty || 0, () => this.rng.next());
    for (let i = 0; i < n; i++) drops.push({ type: 'item', item: generateItem({ ilvl: lvl, mf, rank: 'chest', rng: this.rng }) });
    this.stats.extraItems += n;
    if (chest.tierClear) drops.push(...this.clearDrops(chest.tierClear));
  }
  endgameUnique(lvl) {
    const ids = ENDGAME_UNIQUES(); if (!ids.length) return null;
    try { return { type: 'item', item: makeUnique(ids[Math.floor(this.rng.next() * ids.length)], Math.max(lvl, 60), this.rng) }; } catch (e) { return null; }
  }
  /** the Lantern chest's own hoard (rpg/tiers.js clearChest): rares, magic finds, a gem, coins, rejuv; a first T5 clear's
   *  zone unique (or the dungeon's first clear ever: its boss unique, so a debug tier run never loses it); a Spirit run's
   *  chance at an endgame unique; the pinnacle's own unique */
  clearDrops(tc) {
    const s = tc.spec, lvl = this.mode.layout.mlvl + 2, mf = (this.G.derived?.mf || 0) + this.mfBonus, out = [];
    out.push({ type: 'coins', n: Math.round((lvl * 14 + 40) * s.coinMul) });
    for (let i = 0; i < s.rares; i++) out.push({ type: 'item', item: generateItem({ ilvl: lvl, rarity: 'rare', rng: this.rng }) });
    for (let i = 0; i < s.magic; i++) out.push({ type: 'item', item: generateItem({ ilvl: lvl, mf: mf + 100, rank: 'chest', rng: this.rng }) });
    if (s.gem) out.push({ type: 'gem', item: makeGem(GEM_TYPES[Math.floor(this.rng.next() * GEM_TYPES.length)], s.gemTier) });
    for (let i = 0; i < s.rejuv; i++) out.push({ type: 'potion', key: 'rejuv' });
    const zu = tc.zone && ZONE_UNIQUE[tc.zone];
    if (zu && (s.zoneUnique || tc.first)) { try { out.push({ type: 'item', item: makeUnique(zu, lvl, this.rng) }); } catch (e) { /* */ } }
    if (s.endgameChance > 0 && this.rng.chance(s.endgameChance)) { const u = this.endgameUnique(lvl); if (u) out.push(u); }
    if (s.pinnacle && tc.pinnacleUnique) { try { out.push({ type: 'item', item: makeUnique(tc.pinnacleUnique, Math.max(60, lvl), this.rng) }); } catch (e) { /* */ } }
    return out;
  }
  // ------------------------------------------------------------------ the shrines' curse
  onShrine(type) {
    const C = this.R.run.curse; if (!C) return;
    const G = this.G, M = this.mode, P = G.player;
    M.combat.buffs.cursed = { t: C.t, pct: C.pct };
    this.stats.curses++;
    setTimeout(() => { if (G.dungeon !== M) return; G.ui?.toast?.(`…but the shrine was cursed! You take ${C.pct}% more damage for ${C.t} s`, { color: '#c88aff', icon: 'skull' }); Events.emit('sfx', 'ghost_wail'); }, 900);
    if (P) for (let i = 0; i < 14; i++) { const a = rand(0, TAU); G.vfx.spark.spawn({ x: P.pos.x + Math.cos(a) * 0.5, y: P.pos.y + rand(0.2, 1.4), z: P.pos.z + Math.sin(a) * 0.5, vx: -Math.cos(a) * 0.6, vy: rand(0.2, 0.8), vz: -Math.sin(a) * 0.6, life: rand(0.6, 1), size: rand(0.16, 0.26), size1: 0.04, color: i % 2 ? '#b88aff' : '#6a4ab8', alpha: 0.95, alpha1: 0 }); }
    void type;
  }
  // ------------------------------------------------------------------ Boss's Wrath
  startWrath(b) {
    const G = this.G, M = this.mode;
    this.wrath = { b, t: 4.5, n: 0 }; this.stats.wrath++;
    b.enraged = true; b.stats.atkMul = (b.stats.atkMul || 1) * 1.3; b.speed *= 1.12;
    G.ui?.toast?.(`${b.name} flies into a wrath!`, { color: '#ff6a7a', icon: 'oni' });
    Events.emit('sfx', 'boss_roar');
    G.engine.rig.shake(0.7); G.engine.post.pulse('#ff9a8a', 0.14);
    G.vfx.ring(b.pos, { color: '#ff4a5a', r0: 0.5, r1: 8, life: 0.8 }); G.vfx.dustRing(b.pos, 5, 24);
    const roster = (M.def?.monsters || M.theme?.monsters || []).filter(id => MONSTERS[id]);
    if (roster.length) M.summonAround(b, roster[Math.floor(this.rng.next() * roster.length)], 4);
  }
  shockwave(b) {
    const G = this.G, M = this.mode, p = b.pos.clone(), R = Math.min(6.5, 4 + b.bodyR * 1.4), T = 1.1;
    this.stats.shock++;
    tele(G, { x: p.x, z: p.z, r: R, time: T, color: '#ff3a4a' });
    M.bossTelegraph?.(T);
    setTimeout(() => {
      if (G.dungeon !== M || !b.alive) return;
      G.vfx.ring(p, { color: '#ff6a5a', r0: 0.6, r1: R * 1.05, life: 0.45 }); G.vfx.dustRing(p, R * 0.9, 22); G.engine.rig.shake(0.45);
      Events.emit('sfx', 'explosion_small', { pos: p });
      const P = G.player, d = P ? Math.hypot(P.pos.x - p.x, P.pos.z - p.z) : 99;
      if (d < R + (P?.radius || 0.3) && !G.playerDead) M.combat.hitPlayer(Math.round((b.stats.dmg[0] + b.stats.dmg[1]) * 0.45), { element: 'fire', level: b.level, from: p, knock: 1.2, src: b });
    }, T * 1000);
  }
  // ------------------------------------------------------------------ per frame
  update(dt) {
    const M = this.mode;
    this.pin?.update(dt);
    for (let i = this.ghostQ.length - 1; i >= 0; i--) { const q = this.ghostQ[i]; q.t -= dt; if (q.t <= 0) { this.ghostQ.splice(i, 1); this.riseGhost(q); } }
    if ((this.seenT -= dt) <= 0) { this.seenT = 0.25; if (this.R.monster.el) this.decorateAll(); }
    const b = M.boss, Bw = this.R.boss.wrath;
    if (Bw && b?.alive && b.aggro && !this.wrath && b.life / b.lifeMax <= Bw) this.startWrath(b);
    const W = this.wrath;
    if (W && W.b.alive) { W.t -= dt; if (W.t <= 0) { W.t = 8; this.shockwave(W.b); } if (Math.random() < dt * 10) this.G.vfx.spark.spawn({ x: W.b.pos.x + rand(-1, 1) * W.b.bodyR, y: W.b.pos.y + rand(0.2, 2), z: W.b.pos.z + rand(-1, 1) * W.b.bodyR, vy: rand(0.8, 1.6), life: 0.6, size: 0.26, size1: 0.04, color: '#ff6a5a', alpha: 0.9, alpha1: 0 }); }
    // elemental motes over the awake monsters near the hero
    const el = this.R.monster.el, P = this.G.player;
    if (el && P) {
      const c = EL_COLOR[el];
      for (const m of M.monsters) {
        if (!m.aggro || Math.random() > dt * 2.4) continue;
        const dx = m.pos.x - P.pos.x, dz = m.pos.z - P.pos.z; if (dx * dx + dz * dz > 300) continue;
        this.G.vfx.spark.spawn({ x: m.pos.x + rand(-0.3, 0.3), y: m.pos.y + rand(0.15, 0.8) * (m.scale || 1), z: m.pos.z + rand(-0.3, 0.3), vx: rand(-0.2, 0.2), vy: rand(0.7, 1.4), vz: rand(-0.2, 0.2), life: 0.65, size: 0.2, size1: 0.03, color: c, alpha: 0.95, alpha1: 0 });
      }
    }
  }
  // ------------------------------------------------------------------ the clear
  /** the run's last boss fell (DungeonMode.onBossDefeated → after clearDungeon recorded it): the Lantern chest, the banner */
  onBossDefeated(b, clear) {
    const G = this.G, M = this.mode, R = this.R;
    this.wrath = null;
    if (!clear || !(R.tier > 0 || R.spirit > 0)) return;
    const spec = clearChest(R, clear.firstTier);
    const p = M.openSpotNear(b.pos.clone(), 4.4, 1.2, M.zr?.firstChestAt || null);
    this.chestAt = p;
    setTimeout(() => {
      if (G.dungeon !== M) return;
      const chest = M.makeChest(p, 'gold');
      chest.tierClear = { spec, first: clear.first, zone: M.zoneId, tier: R.tier, spirit: R.spirit, pinnacleUnique: clear.pinnacleUnique || (spec.pinnacle && this.pin ? PINNACLE_UNIQUE : null) };
      G.vfx?.pillar?.(p, { color: R.spirit ? '#c8b8ff' : '#ffd88a', life: 1.6, r: 1.0, h: 7 }); G.vfx?.sparkle?.(p.clone().setY(1), { n: 30, color: R.spirit ? '#e8deff' : '#fff2a0', r: 1 });
      M.world.interactables.push({ pos: p, radius: 1.3, label: 'Open the Lantern chest', onInteract() { if (chest.opened) return; chest.open(); M.world.interactables.splice(M.world.interactables.indexOf(this), 1); } });
      M.world.collision.addCircle(p.x, p.z, 0.5);
    }, 2500);
    setTimeout(() => {
      if (G.dungeon !== M) return;
      const sub = clear.spiritOpened ? 'The Spirit endgame is open at every Spirit Lantern!' : clear.tierUnlocked ? `Tier ${clear.tierUnlocked} is open at the Spirit Lantern` : R.spirit ? `Spirit ${R.spirit + 1} is open at every Spirit Lantern` : 'The Lantern chest rises…';
      if (this.pin) G.ui?.toast?.(`The Four Seasons are stilled! ${sub}`, { icon: 'lantern', color: '#c8b8ff' }); // (the pinnacle: no second banner over its hoard's labels; the Victory banner said it)
      else G.ui?.banner?.(`${M.def.name}: ${this.label} cleared!`, sub, { style: 'quest' });
    }, clear.first && M.zr ? 6200 : 4300);
  }
  dispose() {
    const G = this.G, M = this.mode;
    if (this.R.run.regen !== 1) G.regenMul = 1;
    const C = M.combat; if (C?._trRaw) { C.hitPlayer = C._trRaw; C._trRaw = null; }
    const S = this.nightSaved;
    if (S) { const gr = G.engine.post.grade.uniforms; gr.get('uGain').value.copy(S.gain); gr.get('uSat').value = S.sat; gr.get('uVignette').value = S.vig; gr.get('uVigColor').value.copy(S.vigC); this.nightSaved = null; }
    this.ghostQ.length = 0; this.wrath = null;
    this.pin?.dispose();
  }
}

// ------------------------------------------------------------------ debug
/** ?run=<dungeon>:<tier>[:<mods,…>[:<spirit>]] enters a run at boot (e.g. ?run=bambooDepths:5:swarming,teeming,rally);
 *  G.tierDebug: unlock(id, tier), clearAll(tier) (every tier dungeon cleared up to it), run(id, tier, mods, spirit) */
export function installTierDebug(G, params, { recordDungeonClear, TIER_DUNGEONS }) {
  const run = (id, tier = 1, mods = [], spirit = 0, floor = 1) => G.enterDungeon({ id, floor, tier, spirit, mods });
  G.tierDebug = {
    run,
    clearAll(tier = 5, ids = TIER_DUNGEONS) { for (const id of ids) for (let t = 0; t <= tier; t++) recordDungeonClear(G.state, id, t); return true; },
    unlock(id, tier = 5) { for (let t = 0; t < tier; t++) recordDungeonClear(G.state, id, t); return true; },
  };
  const q = params?.get?.('run');
  if (q) { const [id, t, mods, sp] = q.split(':'); setTimeout(() => run(id, +t || 0, mods ? mods.split(',').filter(Boolean) : [], +sp || 0), 120); }
}
