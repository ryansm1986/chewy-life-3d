// The pinnacle fight, "The Four Seasons" (docs/ZONES.md §5.3 as built; ROADMAP Z-E4). On every 10th Spirit tier the last
// boss of a tier dungeon is the four zone bosses, one season each, in the floor's ring (the data and the layout:
// pinnacleLayout.js). A TierRun owns one on that floor (tr.pin); DungeonMode asks it before a boss's death counts as the
// clear (seasonFalls). The fights are the bosses' own (regions/bosses/*: their moves, waves and second phases, retuned
// for the ring as in their own dungeons); this adds what makes the four one fight:
//  - the seasons in turn: Spring (Master Tengu), Summer (Umibōzu), Autumn (Danzaburō), Winter (Yuki-onna). Each one's
//    life is a share of a full boss's (SEASON_LIFE, on top of the Spirit tier's multiplier). When one falls, its adds
//    vanish and its shots fizzle, a card names the next season, and the next boss rises opposite the hero 3.6 s later.
//    A season leaves only coins and potions where it falls; its items wait for the Pinnacle hoard (onDrops): when Winter
//    falls the four hoards become one, curated to ~15 of higher worth (curate), and rise in a wide ring round the Lantern
//    chest once the Victory banner has gone (dropRing).
//  - Winter's whiteout is thinned here (PIN_WHITEOUT, via m.woMul): her lantern circles stay clear, her own hall is unchanged.
//  - the echoes: a fallen season stays as a spirit at the ring's edge (a translucent, glowing copy of its boss, at a
//    quarter of the ring each, none at the mouth) and keeps one of its moves going, so the later seasons fight with the
//    earlier ones' mechanics mixed in: Spring's GALE (a lane of wind from its spirit through the hero: it hurts and
//    shoves), Summer's INK RAIN (three circles round the hero: a hit and a chill), Autumn's ROLLING LEAF-BOULDER (a lane
//    from its spirit across the ring). One echo at a time, every 8.5 / 7.2 / 6.2 s in Summer / Autumn / Winter, and
//    only in the boss's quiet moments (no telegraph up, DungeonMode.sigDimT, and not in one of its moves, bossBusy):
//    and the boss holds its next move until the echo has landed (hold): every echo is its own clear, readable beat.
//  - the season's air: its petals, motes, leaves or snow drifting round the hero, and a soft light of its colour over the
//    ring (no screen tint: the bosses' own effects carry the weather).
//  - the end: Winter falling stills them all (the spirits burst into their season), the Lantern chest carries the
//    pinnacle's unique (PINNACLE_UNIQUE; dungeon/tierRun.js clearDrops) and the banner says so.
// QA: s30 (the seasons in turn, the echoes, the clear and the unique), tools/qa/pinnacle-shots.mjs (each phase at the game
// camera, with its adds and an echo in flight).
import * as THREE from 'three';
import { SEASONS, SEASON_LIFE, PINNACLE_BOSSES } from './pinnacleLayout.js';
import { MONSTERS, buildMonster } from './monsters.js';
import { tele, chill } from '../regions/monsters/bamboo.js';
import { pushPlayer } from '../regions/bosses/kitA.js';
import { generateItem } from '../rpg/items.js';
import { Events } from '../core/events.js';
import { rand, TAU, clamp } from '../core/util.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
/** echo cadence (s) by the season now fighting (Spring has no echoes yet), its first delay, and the moves' tuning */
export const ECHO = { gap: [0, 8.5, 7.2, 6.2], first: 6.5, wait: 0.25,
  gale: { r: 1.5, time: 1.3, dmg: 0.5, push: 11 },
  ink: { r: 1.7, time: 1.15, n: 3, spread: 2.8, dmg: 0.42, chill: 1.4 },
  roll: { r: 1.45, time: 1.45, dmg: 0.6, speed: 22 } };
/** each spirit's size against its boss (Umibōzu is huge: his rises half-size at the edge) */
const STATUE_K = [0.85, 0.42, 0.85, 0.9];
/** Winter's whiteout in the pinnacle: thinner than in her hall (Yuki-onna reads m.woMul; Spirit's life makes it a long phase) */
export const PIN_WHITEOUT = 0.62;
/** the Pinnacle hoard: every season's items, curated to a few of higher worth, rising round the Lantern chest once the
 *  Victory banner has gone (so their labels never cover it) */
export const HOARD = { items: 15, gems: 2, potions: 3, coinPiles: 4, maxRares: 5, perRare: 6, at: 4.4, r: [2.8, 5.4], toward: 3 };
const RANK = { unique: 6, set: 5, rare: 4, magic: 2, normal: 1 };
const MOVES = ['gale', 'ink', 'roll'];
const CALM = new Set(['idle', 'rest', 'sit']);
/** is the season's boss in one of its moves (each fight keeps its own state: m.tg Tengu, m.tk Danzaburō, m.B Umibōzu,
 *  m.Y Yuki-onna)? An echo waits for its quiet moments, as it waits for DungeonMode.sigDimT */
export function bossBusy(b) {
  if (!b) return false;
  if (b.tg) return !CALM.has(b.tg.st);
  if (b.tk) return !CALM.has(b.tk.st);
  if (b.Y) return !!b.Y.busy;
  if (b.B) return !!b.B.busy;
  return b.state === 'windup' || b.state === 'attack';
}

export class Pinnacle {
  constructor(mode) {
    this.mode = mode; this.G = mode.G;
    this.k = 0; this.busy = false; this.wait = 0; this.done = false;
    this.statues = []; this.hoard = []; this.echoT = ECHO.first; this.echoI = 0; this.weatherT = 0; this.light = null;
    this.stats = { seasons: [SEASONS[0].key], echoes: { gale: 0, ink: 0, roll: 0 }, echoHits: 0, falls: 0 }; // (QA)
  }
  get A() { return this.mode.layout.arena; }
  get season() { return SEASONS[this.k]; }
  // ------------------------------------------------------------------ build / start
  build() { // the four and their adds, built behind the iris (a season rising mid-fight never hitches on a first build)
    const ids = new Set(PINNACLE_BOSSES);
    for (const id of PINNACLE_BOSSES) for (const a of MONSTERS[id]?.adds || []) ids.add(a);
    this.mode.warmMonsters?.([...ids].filter(id => MONSTERS[id]));
  }
  start() {
    const G = this.G, M = this.mode;
    setTimeout(() => { if (G.dungeon === M && !this.done) G.ui?.toast?.('The Four Seasons stir in the deepest ring…', { icon: 'lantern', color: '#c8b8ff' }); }, 5200);
  }
  // ------------------------------------------------------------------ the seasons
  /** a season's boss: its share of a boss's life (once) */
  share(b) {
    b._pinLife = true; b._season = this.k;
    const s = SEASON_LIFE[this.k] ?? 1;
    b.lifeMax = Math.max(1, Math.round(b.lifeMax * s)); b.life = b.lifeMax; b.stats.life = b.lifeMax;
    if (b.id === 'yukiOnna') b.woMul = PIN_WHITEOUT; // (her whiteout, thinned for the pinnacle only)
    if (b.B && 'lastLife' in b.B) b.B.lastLife = b.life; // (Umibōzu reads a drop in life as a hit)
  }
  /** DungeonMode.onMonsterDeath, for its boss: true when this was a season (not the last), so the floor isn't cleared */
  seasonFalls(m) {
    if (this.done || m !== this.mode.boss) return false;
    if (this.k >= SEASONS.length - 1) { this.finale(m); return false; }
    const G = this.G, M = this.mode, S = this.season;
    this.stats.falls++;
    M.clearBossFight?.(m); G.ui?.setBoss?.(null); M.boss = null;
    this.seasonBurst(m.pos, S, 1);
    this.raiseStatue(this.k, m.pos);
    this.k++; this.busy = true; this.wait = 3.6; this.echoT = ECHO.first;
    const N = this.season;
    G.engine.post.pulse(N.glow, 0.1);
    setTimeout(() => { if (G.dungeon === M && !this.done) G.ui?.banner?.(`${N.name} ${N.jp}`, N.sub, { style: 'quest', duration: 2.2 }); }, 900);
    Events.emit('pinnacle:season', { season: N.key, n: this.k + 1, from: S.key, ...M.where?.() });
    Events.emit('sfx', 'portal');
    return true;
  }
  spawnNext() {
    const G = this.G, M = this.mode, A = this.A, P = G.player, S = this.season;
    this.busy = false;
    let dx = A.x - (P?.pos.x ?? A.x), dz = A.z - (P?.pos.z ?? A.z); const L = Math.hypot(dx, dz) || 1;
    let x = A.x + dx / L * A.r * 0.3, z = A.z + dz / L * A.r * 0.3;
    if (!M.world.walkable(x, z)) { x = A.x; z = A.z; }
    const b = M.spawnMonster(S.boss, { level: M.layout.mlvl + 2, x, z, rng: () => M.rng.next() });
    M.boss = b; this.share(b);
    this.stats.seasons.push(S.key);
    const p = V(x, M.world.heightAt(x, z), z);
    G.vfx.pillar?.(p, { color: S.color, r: 1.2, h: 7, life: 1.2, opacity: 0.55 });
    this.seasonBurst(p, S, 0.8);
    this.setLight();
    setTimeout(() => { if (G.dungeon === M && b.alive && !b.introDone) b.alert(); }, 700);
  }
  finale(m) {
    const G = this.G, M = this.mode;
    this.done = true; this.stats.falls++;
    m.victorySub = 'All four seasons have fallen!'; // (DungeonMode.onBossDefeated's Victory banner)
    for (const st of this.statues) { st.fade = -1; this.seasonBurst(st.pos, SEASONS[st.k], 1.2); }
    this.seasonBurst(m.pos, this.season, 1.4);
    if (this.light) { M.world.lightPool.removeSource(this.light); this.light = null; }
    Events.emit('pinnacle:cleared', { ...M.where?.() });
  }
  /** TierRun.onDrops: a fallen season leaves only its coins and potions mid-fight (a ring kept clear of loot labels); its
   *  items and gems join the last boss's hoard */
  onDrops(m, drops, isBoss) {
    if (m._season == null) return;
    for (let i = drops.length - 1; i >= 0; i--) if (isBoss || drops[i].type === 'item' || drops[i].type === 'gem') this.hoard.push(...drops.splice(i, 1)); // (Winter's whole drop joins it: nothing lands under the banner)
    if (!isBoss) return;
    const hoard = this.curate(this.hoard, m.level); this.hoard.length = 0; this.stats.hoard = hoard.length;
    const G = this.G, M = this.mode, at = M.tr?.chestAt?.clone() || m.pos.clone();
    setTimeout(() => this.dropRing(hoard, at), HOARD.at * 1000); // (after the Victory banner: dungeonMode's 3.6 s)
    void G;
  }
  /** the four hoards → one: the best items by rarity (then worth), the dross traded up for a few more rares, the best
   *  gems, the coins in a few full piles, a few potions */
  curate(all, lvl) {
    const items = all.filter(d => d.type === 'item' && d.item), gems = all.filter(d => d.type === 'gem' && d.item), out = [];
    const score = it => (RANK[it.rarity] || 1) * 1e6 + (it.value || 0);
    items.sort((a, b) => score(b.item) - score(a.item));
    const keep = items.slice(0, HOARD.items), cut = items.length - keep.length;
    let rares = Math.min(HOARD.maxRares, Math.floor(cut / HOARD.perRare)); // (the dross becomes a few more rares)
    for (let i = keep.length - 1; i >= 0 && rares > 0; i--) if ((RANK[keep[i].item.rarity] || 1) < RANK.rare) { keep[i] = { type: 'item', item: generateItem({ ilvl: lvl, rarity: 'rare', rng: Math.random }) }; rares--; }
    while (rares-- > 0 && keep.length < HOARD.items + 3) keep.push({ type: 'item', item: generateItem({ ilvl: lvl, rarity: 'rare', rng: Math.random }) });
    out.push(...keep);
    gems.sort((a, b) => (b.item.gemTier || 0) - (a.item.gemTier || 0)); out.push(...gems.slice(0, HOARD.gems));
    const coins = all.filter(d => d.type === 'coins').reduce((n, d) => n + (d.n || 0), 0);
    for (let i = 0; i < HOARD.coinPiles && coins > 0; i++) out.push({ type: 'coins', n: Math.round(coins / HOARD.coinPiles) });
    out.push(...all.filter(d => d.type === 'potion').slice(0, HOARD.potions));
    out.push(...all.filter(d => !['item', 'gem', 'coins', 'potion'].includes(d.type))); // (seeds, forage, a furniture find: as they came)
    return out;
  }
  /** the hoard rises out of the chest's glow and lands in a wide ring round it (never a column on the hero) */
  dropRing(hoard, at) {
    const G = this.G, M = this.mode, L = M.loot, W = M.world; if (G.dungeon !== M || !L) return;
    const A = this.A, dx = A.x - at.x, dz = A.z - at.z, dl = Math.hypot(dx, dz) || 1, k = Math.min(HOARD.toward, dl) / dl;
    const c = V(at.x + dx * k, at.y || 0, at.z + dz * k); // (the ring's centre: the chest, drawn toward the middle of the ring, so the whole circle lies on open floor)
    const n = hoard.length, a0 = rand(0, TAU), from = at.clone().setY((at.y || 0) + 1.2);
    G.vfx.ring(c.clone().setY(0.06), { color: '#e8deff', r0: 0.5, r1: HOARD.r[1] + 0.6, life: 0.8, opacity: 0.7 });
    G.vfx.sparkle(at.clone().setY(1), { n: 40, color: '#fff2a0', r: 1.4, rise: 1.8 });
    Events.emit('sfx', 'chest_open');
    hoard.forEach((d, i) => {
      let to = null;
      for (let t = 0; t < 6 && !to; t++) {
        const a = a0 + (i + rand(-0.3, 0.3)) / n * TAU, r = rand(HOARD.r[0], HOARD.r[1]) - t * 0.35, x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
        if (W.walkable(x, z) && Math.hypot(x - at.x, z - at.z) > 2.3) to = V(x, W.heightAt(x, z), z);
      }
      if (!to) { const a = a0 + i / n * TAU; to = V(c.x + Math.cos(a) * 2.6, 0, c.z + Math.sin(a) * 2.6); if (!W.walkable(to.x, to.z)) to.copy(c); to.y = W.heightAt(to.x, to.z); }
      setTimeout(() => { if (G.dungeon === M) L.spawn(d, from, to); }, i * 55);
    });
  }
  // ------------------------------------------------------------------ the spirits at the ring's edge
  statueSpot(k) {
    const A = this.A, mo = this.mode.layout.arenaMouth, am = mo ? Math.atan2(mo.z - A.z, mo.x - A.x) : 0;
    const a = am + Math.PI / 4 + k * Math.PI / 2, r = A.r * (k === 1 ? 0.9 : 0.84);
    return { x: A.x + Math.cos(a) * r, z: A.z + Math.sin(a) * r, face: Math.atan2(A.x - (A.x + Math.cos(a) * r), A.z - (A.z + Math.sin(a) * r)) };
  }
  raiseStatue(k, from) {
    const M = this.mode, S = SEASONS[k], id = S.boss, sp = this.statueSpot(k);
    let model;
    try { model = buildMonster(id, 0); } catch (e) { console.warn('[pinnacle] spirit model failed', e); return; }
    const mats = this.ghostMats(S), root = model.root;
    root.traverse(o => {
      if (o.isMesh) {
        const ink = o === model.outline || (model.subs || []).includes(o) || o.material?.side === THREE.BackSide;
        if (ink) { o.visible = false; return; }
        o.material = o.isSkinnedMesh ? mats.skin : mats.mesh; o.castShadow = false; o.receiveShadow = false; o.renderOrder = 8;
      } else if (o.isSprite || o.isPoints) o.visible = false;
    });
    const sc = (MONSTERS[id].scale || 1) * STATUE_K[k];
    if (model.rig) root.scale.setScalar(sc); else (model.pivot || root).scale.setScalar(sc);
    const y0 = M.world.heightAt(sp.x, sp.z) + (k === 1 ? -0.8 : 0.35);
    root.position.set(sp.x, y0, sp.z); root.rotation.y = sp.face;
    M.world.scene.add(root);
    const st = { k, model, root, mats, pos: V(sp.x, y0, sp.z), y0, t: 0, fade: 0, a: 0, flare: 0, from: from?.clone?.() || null };
    this.statues.push(st);
    this.G.vfx.sparkle?.(st.pos.clone().setY(y0 + 1.2), { n: 18, color: S.glow, r: 1.2, rise: 1.4 });
  }
  ghostMats(S) { // a spirit's body: the season's colour, softly lit, see-through (never additive: it must not glow the ring white)
    const make = () => new THREE.MeshLambertMaterial({ color: new THREE.Color(S.color).lerp(new THREE.Color('#ffffff'), 0.1), emissive: new THREE.Color(S.color), emissiveIntensity: 0.45, transparent: true, opacity: 0, depthWrite: false });
    return { mesh: make(), skin: make() };
  }
  animStatues(dt) {
    const t = this.G.engine?.time || 0;
    for (let i = this.statues.length - 1; i >= 0; i--) {
      const st = this.statues[i];
      st.t += dt; st.flare = Math.max(0, st.flare - dt * 1.6);
      const want = st.fade < 0 ? 0 : 0.52 + st.flare * 0.3;
      st.a += (want - st.a) * Math.min(1, dt * (st.fade < 0 ? 2.5 : 1.4));
      st.mats.mesh.opacity = st.mats.skin.opacity = st.a;
      st.mats.mesh.emissiveIntensity = st.mats.skin.emissiveIntensity = 0.45 + st.flare * 0.35;
      st.root.position.y = st.y0 + Math.sin(t * 1.3 + st.k * 1.7) * 0.18 + st.flare * 0.4;
      if (st.fade < 0 && st.a < 0.02) { this.dropStatue(st); this.statues.splice(i, 1); }
    }
  }
  dropStatue(st) {
    st.root.parent?.remove(st.root);
    st.mats.mesh.dispose(); st.mats.skin.dispose();
  }
  // ------------------------------------------------------------------ the echoes
  /** the boss's quiet moment: no telegraph of its own up, not in a move, the intro done */
  quiet() { const M = this.mode; return (M.sigDimT || 0) <= 0.05 && !bossBusy(M.boss) && performance.now() >= (M.introUntil || 0); }
  echoes(dt) {
    const M = this.mode, avail = this.statues.filter(s => s.fade >= 0 && s.a > 0.2);
    if (!avail.length) return;
    this.echoT -= dt; if (this.echoT > 0) return;
    if (!this.quiet()) { this.echoT = ECHO.wait; return; } // (never over the boss's own moves)
    const st = avail[this.echoI++ % avail.length];
    this.echoT = ECHO.gap[this.k] || 7;
    this[MOVES[st.k]](st);
    this.hold(M.boss, ECHO[MOVES[st.k]].time + 0.45);
  }
  /** the boss waits out an echo before its next move (each fight's own cooldown: Tengu / Danzaburō S.gcd, Yuki-onna
   *  Y.gcd, Umibōzu's breather B.restT), so the two never stack */
  hold(b, t) {
    if (!b) return;
    for (const S of [b.tg, b.tk, b.Y]) if (S && typeof S.gcd === 'number') S.gcd = Math.max(S.gcd, t);
    if (b.B && !b.Y && typeof b.B.restT === 'number') b.B.restT = Math.max(b.B.restT, t);
  }
  /** an echo's hit: half a blow of the season boss now fighting (or the floor's level) */
  echoHit(k, o) {
    const M = this.mode, b = M.boss, d = b?.stats?.dmg || [40, 60];
    const n = Math.round((d[0] + d[1]) * 0.5 * k);
    const r = M.combat.hitPlayer(n, { level: b?.level || M.layout.mlvl, src: b || null, ...o });
    if (r) this.stats.echoHits++;
    return r;
  }
  gale(st) { // Spring: a lane of wind from its spirit through the hero
    const G = this.G, M = this.mode, P = G.player, T = ECHO.gale, A = this.A; if (!P) return;
    this.stats.echoes.gale++; st.flare = 1;
    const x0 = st.pos.x, z0 = st.pos.z, dx = P.pos.x - x0, dz = P.pos.z - z0, L = Math.hypot(dx, dz) || 1, ux = dx / L, uz = dz / L, len = Math.min(A.r * 2.1, L + A.r);
    tele(G, { shape: 'lane', x: x0, z: z0, dir: Math.atan2(ux, uz), r: T.r, len, time: T.time, color: '#ff6a9a' });
    Events.emit('sfx', 'tengu_fan_wind', { pos: st.pos });
    setTimeout(() => {
      if (G.dungeon !== M || this.done) return;
      for (let i = 0; i < 40; i++) { const s = rand(0, len); G.vfx.petal.spawn({ x: x0 + ux * s + rand(-T.r, T.r) * uz, y: rand(0.3, 1.8), z: z0 + uz * s - rand(-T.r, T.r) * ux, vx: ux * rand(8, 13), vy: rand(-0.3, 0.6), vz: uz * rand(8, 13), life: rand(0.5, 0.8), size: rand(0.18, 0.3), size1: 0.12, color: i % 3 ? '#ffc0d6' : '#ffffff', alpha: 0.95, alpha1: 0, drag: 2, spin: rand(-6, 6) }); }
      const px = P.pos.x - x0, pz = P.pos.z - z0, along = px * ux + pz * uz, side = Math.abs(px * uz - pz * ux);
      if (!G.playerDead && along > -0.5 && along < len && side < T.r + (P.radius || 0.3)) { if (this.echoHit(T.dmg, { element: 'phys', from: st.pos, knock: 0.4 })) pushPlayer(G, ux, uz, T.push); }
    }, T.time * 1000);
  }
  ink(st) { // Summer: ink falls in three circles round the hero, a chill where it lands
    const G = this.G, M = this.mode, P = G.player, T = ECHO.ink; if (!P) return;
    this.stats.echoes.ink++; st.flare = 1;
    const spots = [[P.pos.x, P.pos.z]], a0 = rand(0, TAU);
    for (let i = 1; i < T.n; i++) { const a = a0 + i * TAU / T.n; const x = P.pos.x + Math.cos(a) * T.spread, z = P.pos.z + Math.sin(a) * T.spread; if (M.world.walkable(x, z)) spots.push([x, z]); }
    for (const [x, z] of spots) tele(G, { shape: 'circle', x, z, r: T.r, time: T.time, color: '#3a8ad0' });
    Events.emit('sfx', 'umi_ink', { pos: st.pos });
    setTimeout(() => {
      if (G.dungeon !== M || this.done) return;
      let hit = false;
      for (const [x, z] of spots) {
        const p = V(x, M.world.heightAt(x, z), z);
        G.vfx.ring(p, { color: '#5ac8f0', r0: 0.3, r1: T.r * 1.1, life: 0.4, opacity: 0.8 });
        G.vfx.decal(p, { r: T.r * 0.9, color: '#1c2a44', life: 3.2, opacity: 0.5 });
        for (let i = 0; i < 8; i++) { const a = rand(0, TAU), s = rand(1.5, 3.2); G.vfx.dot.spawn({ x, y: 0.3, z, vx: Math.cos(a) * s, vy: rand(2, 4), vz: Math.sin(a) * s, life: rand(0.4, 0.6), size: rand(0.12, 0.2), size1: 0.05, color: i % 2 ? '#1c2a44' : '#5ac8f0', alpha: 1, alpha1: 0.4, grav: 12, drag: 1 }); }
        if (!hit && !G.playerDead && Math.hypot(P.pos.x - x, P.pos.z - z) < T.r + (P.radius || 0.3)) hit = true;
      }
      Events.emit('sfx', 'umi_splat', { pos: P.pos });
      if (hit && this.echoHit(T.dmg, { element: 'frost', from: P.pos, knock: 0.2 }) && M.boss) chill(M.boss, T.chill, 0.3);
    }, T.time * 1000);
  }
  roll(st) { // Autumn: a mossy leaf-boulder rolls from its spirit across the ring
    const G = this.G, M = this.mode, P = G.player, T = ECHO.roll, A = this.A; if (!P) return;
    this.stats.echoes.roll++; st.flare = 1;
    const x0 = st.pos.x, z0 = st.pos.z, dx = P.pos.x - x0, dz = P.pos.z - z0, L = Math.hypot(dx, dz) || 1, ux = dx / L, uz = dz / L, len = Math.min(A.r * 2.1, L + A.r * 0.8);
    tele(G, { shape: 'lane', x: x0, z: z0, dir: Math.atan2(ux, uz), r: T.r, len, time: T.time, color: '#ff8a3a' });
    Events.emit('sfx', 'danza_doron', { pos: st.pos });
    setTimeout(() => {
      if (G.dungeon !== M || this.done) return;
      const dur = len / T.speed;
      for (let i = 0, n = Math.ceil(len / 1.6); i <= n; i++) setTimeout(() => {
        if (G.dungeon !== M) return;
        const s = len * i / n, p = V(x0 + ux * s, 0, z0 + uz * s); p.y = M.world.heightAt(p.x, p.z);
        G.vfx.dustRing(p, 1.1, 8);
        for (let j = 0; j < 3; j++) G.vfx.petal.spawn({ x: p.x + rand(-0.6, 0.6), y: rand(0.3, 1.2), z: p.z + rand(-0.6, 0.6), vx: rand(-1, 1), vy: rand(1, 2.5), vz: rand(-1, 1), life: rand(0.7, 1.1), size: rand(0.2, 0.3), size1: 0.14, color: j % 2 ? '#e8603a' : '#ffb03a', alpha: 0.95, alpha1: 0, drag: 1.5, grav: 3, spin: rand(-5, 5) });
      }, dur * 1000 * i / n);
      G.engine.rig.shake(0.25);
      const px = P.pos.x - x0, pz = P.pos.z - z0, along = px * ux + pz * uz, side = px * uz - pz * ux;
      if (!G.playerDead && along > -0.5 && along < len && Math.abs(side) < T.r + (P.radius || 0.3)) setTimeout(() => {
        if (G.dungeon !== M || this.done) return;
        if (this.echoHit(T.dmg, { element: 'phys', from: V(x0 + ux * along, 0, z0 + uz * along), knock: 1 })) pushPlayer(G, Math.sign(side || 1) * uz, -Math.sign(side || 1) * ux, 8);
      }, clamp(along / T.speed, 0, dur) * 1000);
      Events.emit('sfx', 'danza_roll', { pos: st.pos });
    }, T.time * 1000);
  }
  // ------------------------------------------------------------------ the season's air
  seasonBurst(p, S, k = 1) {
    const G = this.G, n = Math.round(26 * k);
    for (let i = 0; i < n; i++) { const a = rand(0, TAU), s = rand(1.5, 4.5); (S.key === 'winter' || S.key === 'summer' ? G.vfx.dot : G.vfx.petal).spawn({ x: p.x, y: (p.y || 0) + rand(0.6, 2.2), z: p.z, vx: Math.cos(a) * s, vy: rand(0.5, 3), vz: Math.sin(a) * s, life: rand(0.9, 1.5), size: rand(0.16, 0.3), size1: 0.08, color: i % 3 ? S.color : S.glow, alpha: 0.95, alpha1: 0, drag: 1.4, grav: 1.5, spin: rand(-6, 6) }); }
    G.vfx.ring(V(p.x, (p.y || 0) + 0.05, p.z), { color: S.color, r0: 0.4, r1: 5 * k, life: 0.7, opacity: 0.6 });
  }
  setLight() {
    const W = this.mode.world, A = this.A, S = this.season;
    if (this.light) W.lightPool.removeSource(this.light);
    this.light = W.lightPool.addSource({ pos: V(A.x, 6, A.z), color: new THREE.Color(S.color), intensity: 2.4, radius: A.r + 4, flicker: 0.04, priority: 4 });
  }
  weather(dt) {
    const G = this.G, P = G.player, S = this.season; if (!P) return;
    this.weatherT += dt * 16;
    while (this.weatherT >= 1) {
      this.weatherT -= 1;
      const x = P.pos.x + rand(-11, 11), z = P.pos.z + rand(-9, 9);
      if (S.key === 'spring') G.vfx.petal.spawn({ x, y: rand(4, 6), z, vx: rand(0.4, 1.2), vy: rand(-1.4, -0.9), vz: rand(-0.3, 0.3), life: 4.5, size: rand(0.16, 0.24), size1: 0.16, color: Math.random() < 0.7 ? '#ffc6da' : '#ffffff', alpha: 0.85, alpha1: 0, spin: rand(-3, 3) });
      else if (S.key === 'summer') { if (Math.random() < 0.35) G.vfx.spark.spawn({ x, y: rand(0.3, 1.6), z, vx: rand(-0.2, 0.2), vy: rand(0.15, 0.4), vz: rand(-0.2, 0.2), life: rand(2, 3), size: rand(0.09, 0.14), size1: 0.04, color: '#9ff4ff', alpha: 0.55, alpha1: 0 }); }
      else if (S.key === 'autumn') G.vfx.petal.spawn({ x, y: rand(4, 6), z, vx: rand(0.6, 1.6), vy: rand(-1.6, -1.0), vz: rand(-0.4, 0.4), life: 4.2, size: rand(0.2, 0.3), size1: 0.2, color: ['#e8603a', '#ffb03a', '#c8402e'][(Math.random() * 3) | 0], alpha: 0.9, alpha1: 0, spin: rand(-4, 4) });
      else G.vfx.dot.spawn({ x, y: rand(4, 6), z, vx: rand(-0.2, 0.4), vy: rand(-1.1, -0.7), vz: rand(-0.2, 0.2), life: 5.5, size: rand(0.07, 0.12), size1: 0.06, color: '#ffffff', alpha: 0.85, alpha1: 0 });
    }
  }
  // ------------------------------------------------------------------ per frame
  update(dt) {
    const M = this.mode, b = M.boss;
    this.animStatues(dt);
    if (this.done) return;
    if (b && !b._pinLife) this.share(b);
    if (b?.alive && b.aggro && !this.light) this.setLight();
    if (this.busy) { this.wait -= dt; if (this.wait <= 0) this.spawnNext(); }
    if (b?.alive && b.aggro && b.introDone) { this.weather(dt); this.echoes(dt); }
  }
  dispose() {
    for (const st of this.statues) this.dropStatue(st);
    this.statues.length = 0;
    if (this.light) { this.mode.world.lightPool?.removeSource(this.light); this.light = null; }
  }
}
