// The kitchen (docs/HOMESTEAD.md §4): cooking stations, the cooking moment in the world, eating and Well Fed.
//  - Stations: Chewy's cottage ("Cook something" in its menu), a campfire camp by the arrival point of every Burrow
//    floor and outdoor region (simple recipes only), and Rosie's oven ("Bake with Rosie"). Each opens the Cook panel
//    (ui/cook.js), which calls cookBatch(): the player stirs a pot (the campfire's, or a little stove pot set down in
//    front of them) with a ladle while the panel's pot bubbles, then the dish pops into the pantry.
//  - Eating (the Pantry's Eat, or G for the quick meal): a munch with the dish in paw, crumbs, the heal, and the Well
//    Fed buff (life/meals.js; it lives on the hero, is folded into computeStats and ticks down here while playing).
//  - The HUD: a Well Fed chip with the dish icon and a timer (game.js syncBuffs → mealBuff()).
import * as THREE from 'three';
import { Events } from '../core/events.js';
import { makeToon } from '../gfx/materials.js';
import { PANTRY } from './pantry.js';
import { RECIPES, STATIONS, cookbookOf, matchMix, fallbackMix, cookableAt, knows } from './cooking.js';
import { BUFFS, TIER_NAMES, mealActive, mealLabel } from './meals.js';
import { campfireGeo, flameGeos, stovePotGeo, brothGeo } from './kitchenModels.js';
import { pantryIcon } from './pantryIcons.js';

const rand = (a, b) => a + Math.random() * (b - a);
const wait = ms => new Promise(r => setTimeout(r, ms));
// own materials: these meshes live in combat-world scenes, whose teardown disposes what it finds (gfx/dispose.js)
let _m = null;
const mats = () => (_m ||= {
  body: makeToon({ vertexColors: true, brush: 0.15, brushScale: 0.5, rim: 0.4, term: [-0.06, 0.34], shadowSat: 0.35 }),
  flameOut: new THREE.MeshBasicMaterial({ color: '#ff8a2a', transparent: true, opacity: 0.92, toneMapped: false, depthWrite: false }),
  flameIn: new THREE.MeshBasicMaterial({ color: '#ffe27a', transparent: true, opacity: 0.95, toneMapped: false, depthWrite: false }),
  broth: makeToon({ vertexColors: true, rim: 0.2, brush: 0.05, emissive: '#5a2a08' }),
});

export class Kitchen {
  constructor(G, tools) {
    this.G = G; this.tools = tools; this.busy = false; this.camp = null; this.campWorld = null; this.station = null; this.tex = new Map();
    Events.on('meal:eaten', e => this.onEaten(e));
    Events.on('meal:expired', e => {
      this.G.ui?.toast?.(`The ${BUFFS[e.buff]?.name.toLowerCase() || 'well fed'} feeling fades…`, { iconURL: pantryIcon(e.id), color: '#c8b8a8', sub: 'Well Fed wore off · eat another dish' });
      Events.emit('sfx', 'ui_close', { vol: 0.5 });
    });
  }
  // ---------------------------------------------------------------- stations
  /** Open the Cook panel. station: 'kitchen' | 'campfire' | 'oven'; at: the station's world position (closes it if
   *  the player wanders off) */
  open(station = 'kitchen', at = null) {
    const G = this.G; if (!G.ui?.open) return;
    cookbookOf(G.state);
    this.station = { kind: station, at: (at || G.player.pos).clone() };
    G.ui.open('cook', { station });
    Events.emit('sfx', 'ui_open');
  }
  cookTime(n = 1) { return 1250 + Math.min(650, (n - 1) * 110); }
  /** One cooking moment (the Cook panel awaits it). o: { id, n } a recipe, or { picks } a free mix ("Try a mix").
   *  → { id, n, learned, fallback, mix } | { fail } */
  async cookBatch(o) {
    const G = this.G, A = G.actions, st = G.state, station = this.station?.kind || 'kitchen';
    if (this.busy) return { fail: 'busy' };
    // what will come out (a mix: the recipe it matches here, else a sensible fallback)
    let id = o.id, learned = false, fallback = false;
    if (o.picks) { const pv = this.previewMix(o.picks); if (pv.fail) return pv; ({ id, learned, fallback } = pv); }
    else if (!RECIPES[id] || !cookableAt(id, station)) return { fail: 'Not here' };
    this.busy = true;
    const P = G.player, dur = this.cookTime(o.n || 1);
    P.controlLocked = true; P.moveTarget = null; P.interactTarget = null;
    const potAt = this.potSpot(station);
    P.faceTo(potAt.x, potAt.z); P.facing = P.faceTarget;
    const ladle = this.tools.hold('ladle'); if (ladle) ladle.rotation.x = 1.05; // (bowl down, into the pot)
    P.anim.play('cook');
    const stove = station === 'campfire' ? null : this.placeStove(potAt);
    Events.emit('sfx', 'cook_sizzle');
    const t0 = performance.now();
    this.cooking = { at: potAt, stove, t: 0 };
    await wait(dur * 0.55); Events.emit('sfx', 'cook_bubble');
    await wait(Math.max(0, dur - (performance.now() - t0)));
    // the dish
    const r = A.cook(id, o.picks ? 1 : o.n || 1, { picks: o.picks || null, learn: learned, src: station });
    this.cooking = null;
    if (P.anim.action?.name === 'cook') P.anim.stop();
    this.tools.release();
    P.controlLocked = false; G.interactCooldown = performance.now() + 300;
    P.anim.play('clap');
    if (stove) setTimeout(() => this.removeStove(stove), 650);
    this.busy = false;
    if (!r) return { fail: 'Missing ingredients' };
    Events.emit('sfx', 'cook_ding');
    G.vfx?.sparkle?.(potAt.clone().setY(potAt.y + 0.6), { n: 14, color: '#ffe8a0', r: 0.4, rise: 0.9 });
    this.puffSteam(potAt, 8);
    return { id, n: r.n, learned, fallback, mix: !!o.picks };
  }
  /** What a free mix makes at this station → { id, learned, fallback } | { fail } (nothing is spent) */
  previewMix(picks) {
    const st = this.G.state, station = this.station?.kind || 'kitchen';
    let id = matchMix(picks, station), fallback = false;
    if (!id) { id = fallbackMix(picks); fallback = !!id; }
    if (!id || !cookableAt(id, station)) return { fail: station === 'oven' ? "That won't bake into anything… try a real recipe!" : "Hmm… that won't make anything edible." };
    return { id, learned: !fallback && !knows(st, id), fallback };
  }
  /** where the pot is: the campfire's, or 0.8 m in front of the player */
  potSpot(station) {
    const G = this.G, P = G.player;
    if (station === 'campfire' && this.camp) return this.camp.pos.clone().setY(this.camp.pos.y + 1.02);
    const x = P.pos.x + Math.sin(P.facing) * 0.8, z = P.pos.z + Math.cos(P.facing) * 0.8;
    return new THREE.Vector3(x, G.world.heightAt?.(x, z) ?? P.pos.y, z);
  }
  placeStove(at) {
    const G = this.G, M = mats(), g = new THREE.Group();
    const pot = new THREE.Mesh(stovePotGeo(), M.body); pot.castShadow = true; g.add(pot);
    const broth = new THREE.Mesh(brothGeo(0.13, '#f2b45a'), M.broth); broth.position.y = 0.34; g.add(broth);
    g.position.copy(at); g.scale.setScalar(0.01); g.name = 'kitchen:stove';
    G.world.scene.add(g);
    G.vfx?.add?.(null, (dt, t) => { if (!g.parent) return false; const k = Math.min(1, t / 0.25); g.scale.setScalar(k < 1 ? 0.01 + 1.1 * Math.sin(k * Math.PI / 2) : 1 + 0.03 * Math.sin(t * 9)); return t < 6; }, 6);
    Events.emit('sfx', 'harvest_pop', { vol: 0.35, pitch: 0.8 });
    return { g, broth, world: G.world };
  }
  removeStove(s) {
    const t0 = performance.now();
    const step = () => { const k = Math.min(1, (performance.now() - t0) / 220); s.g.scale.setScalar(1 - k); if (k < 1 && s.g.parent) requestAnimationFrame(step); else s.g.parent?.remove(s.g); };
    step();
  }
  puffSteam(p, n = 3) {
    const v = this.G.vfx; if (!v?.smoke) return;
    for (let i = 0; i < n; i++) v.smoke.spawn({ x: p.x + rand(-0.08, 0.08), y: p.y + 0.15, z: p.z + rand(-0.08, 0.08), vx: rand(-0.1, 0.1), vy: rand(0.5, 0.9), vz: rand(-0.1, 0.1), life: rand(0.9, 1.4), size: 0.18, size1: 0.6, color: '#fff8f0', alpha: 0.6, alpha1: 0, spin: rand(-1, 1) });
  }

  // ---------------------------------------------------------------- the campfire camp (Burrow floors and regions)
  ensureCamp() {
    const G = this.G, W = G.world;
    if (W === this.campWorld) return;
    this.campWorld = W; this.camp = null;
    if (G.mode !== 'dungeon' || !G.dungeon?.startPos || !W?.scene) return;
    const spot = this.campSpot(W, G.dungeon.startPos);
    if (!spot) return;
    const M = mats(), F = flameGeos(), grp = new THREE.Group(); grp.name = 'kitchen:campfire';
    const y = W.heightAt?.(spot.x, spot.z) ?? 0;
    const body = new THREE.Mesh(campfireGeo(), M.body); body.castShadow = true; body.receiveShadow = true; grp.add(body);
    const outer = new THREE.Mesh(F.outer, M.flameOut), inner = new THREE.Mesh(F.inner, M.flameIn); outer.position.y = inner.position.y = 0.05; grp.add(outer, inner);
    const broth = new THREE.Mesh(brothGeo(0.19, '#e89a4a'), M.broth); broth.position.y = 0.62 + 0.22; grp.add(broth);
    grp.position.set(spot.x, y, spot.z); grp.rotation.y = spot.yaw; grp.scale.setScalar(1.2);
    W.scene.add(grp);
    W.collision?.addCircle(spot.x, spot.z, 0.95, 'camp');
    W.lightPool?.addSource?.({ pos: new THREE.Vector3(spot.x, y + 0.9, spot.z), color: new THREE.Color('#ffb070'), intensity: 6, radius: 7, flicker: 0.6 });
    const pos = new THREE.Vector3(spot.x, y, spot.z);
    const inter = { pos, radius: 1.45, label: 'Cook at the campfire 🔥', onInteract: () => this.open('campfire', pos) };
    W.interactables.push(inter);
    this.camp = { pos, grp, outer, inner, broth, inter, world: W };
  }
  /** a clear spot 3-5 m from the arrival point, away from the exit stone and every interactable */
  campSpot(W, S) {
    const clear = (x, z) => {
      if (!W.walkable?.(x, z) || W.collision?.solidAt?.(x, z, 1.0)) return false;
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; if (!W.walkable(x + Math.cos(a) * 1.25, z + Math.sin(a) * 1.25)) return false; }
      if (W.waterAt?.(x, z) > 0.02 || W.terrain?.iceAt?.(x, z)) return false;
      return !W.interactables.some(it => Math.hypot(it.pos.x - x, it.pos.z - z) < 2.6);
    };
    for (const r of [3.4, 4.2, 5.0, 2.9, 6.0]) for (let k = 0; k < 16; k++) {
      const a = 0.35 + (k % 2 ? -1 : 1) * Math.ceil(k / 2) * 0.39; // (fanning out from the arrival point's right-hand side)
      const x = S.x + Math.cos(a) * r, z = S.z + Math.sin(a) * r;
      if (clear(x, z)) return { x, z, yaw: Math.atan2(S.x - x, S.z - z) };
    }
    return null;
  }

  // ---------------------------------------------------------------- eating
  onEaten({ id, heal, meal, replaced }) {
    const G = this.G, P = G.player; if (!P) return;
    const d = PANTRY[id], B = BUFFS[meal?.buff];
    if (!P.anim.busy() && !P.leap && !P.dash) { P.anim.play('munch'); this.dishInPaws(id); }
    G.vfx?.heal?.(P.pos.clone());
    if (B) G.vfx?.sparkle?.(P.pos.clone().setY(P.pos.y + 1.2), { n: 12, color: B.color, r: 0.55, rise: 1.0 });
    Events.emit('sfx', 'eat_munch');
    setTimeout(() => Events.emit('sfx', 'meal_buff'), 420);
    if (heal > 0) G.ui?.float?.(P.pos.clone().setY(P.pos.y + 1.6), `+${Math.round(heal)}`, { kind: 'heal' });
    const sub = B ? `Well Fed: ${mealLabel(meal)} · ${Math.round(meal.dur / 60)} min — ${B.text(meal.tier)}${replaced && replaced.dish !== id ? ` (replaces ${BUFFS[replaced.buff]?.name})` : ''}` : 'Delicious';
    G.ui?.toast?.(`Yum! ${d.name}${heal > 0 ? ` <span class="t-heal">+${Math.round(heal)} ♥</span>` : ''}`, { html: true, iconURL: pantryIcon(id), color: B?.color || '#ff8fb0', sub, duration: 4.5 });
  }
  /** the dish shows up in the hero's paws for the munch */
  dishInPaws(id) {
    const G = this.G, P = G.player, tex = this.texFor(id);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
    sp.renderOrder = 25; sp.scale.setScalar(0.42);
    G.vfx?.add?.(sp, (dt, t) => {
      const f = P.facing, k = Math.min(1, t / 0.15) * (1 - Math.max(0, (t - 0.85) / 0.25));
      sp.position.set(P.pos.x + Math.sin(f) * 0.32, P.pos.y + 0.95 + Math.sin(t * 19) * 0.015, P.pos.z + Math.cos(f) * 0.32);
      sp.scale.setScalar(0.42 * Math.max(0.01, k) * (1 - 0.25 * Math.min(1, t / 0.9)));
      if (Math.random() < dt * 14 && t < 0.85 && G.vfx?.dot) G.vfx.dot.spawn({ x: sp.position.x, y: sp.position.y - 0.05, z: sp.position.z, vx: rand(-0.6, 0.6), vy: rand(0.3, 1.0), vz: rand(-0.6, 0.6), grav: 6, life: 0.45, size: 0.05, color: '#f2d8a8', alpha: 1, alpha1: 0.4 });
      if (t >= 1.1) { sp.material.dispose(); return false; }
      return true;
    }, 1.15);
  }
  texFor(id) {
    let t = this.tex.get(id); if (t) return t;
    t = new THREE.TextureLoader().load(pantryIcon(id)); t.colorSpace = THREE.SRGBColorSpace;
    this.tex.set(id, t); return t;
  }
  /** G: eat the quick meal (the last dish eaten, else the most filling dish in the pantry) */
  quickEat() {
    const G = this.G, st = G.state, c = cookbookOf(st);
    const id = this.quickId();
    if (!id) { G.ui?.toast?.('No dishes in the pantry — cook something at home or at a campfire!', { icon: 'heart', color: '#ff8fb0' }); G.ui?.hud?.flashMeal?.(false); return null; }
    const r = G.actions.eat(id);
    G.ui?.hud?.flashMeal?.(!!r);
    if (r) c.quick = id;
    return r;
  }
  quickId() {
    const st = this.G.state, c = st.cookbook || {}, P = st.pantry || {};
    if (c.quick && P[c.quick] > 0) return c.quick;
    let best = null;
    for (const [id, n] of Object.entries(P)) { const f = PANTRY[id]?.food; if (n > 0 && f && (!best || f.heal > PANTRY[best].food.heal)) best = id; }
    return best;
  }
  /** the HUD chip (game.js syncBuffs) */
  mealBuff() {
    const m = this.G.state.player?.meal; if (!mealActive(m)) return null;
    const B = BUFFS[m.buff];
    return { id: 'meal', name: `Well Fed · ${B.name} ${TIER_NAMES[m.tier]} — ${PANTRY[m.dish]?.name || ''}: ${B.text(m.tier)}`, iconURL: pantryIcon(m.dish), color: B.color, time: m.left, meal: true };
  }

  // ---------------------------------------------------------------- per frame
  update(dt) {
    const G = this.G;
    this.ensureCamp();
    if (!G.titleActive && !G.playerDead && dt > 0) G.actions.tickMeal?.(dt);
    // the campfire: flickering tongues, embers, steam off the pot
    const c = this.camp;
    if (c && c.world === G.world) {
      const t = performance.now() / 1000;
      c.outer.scale.set(1 + 0.08 * Math.sin(t * 13), 0.9 + 0.18 * Math.sin(t * 9.1) + 0.06 * Math.sin(t * 23), 1 + 0.08 * Math.cos(t * 11));
      c.inner.scale.set(1, 0.85 + 0.2 * Math.sin(t * 12.3 + 1), 1); c.outer.rotation.y = t * 0.7; c.inner.rotation.y = -t * 1.1;
      c.broth.position.y = 0.84 + 0.008 * Math.sin(t * 7); // (group space)
      if (G.player.pos.distanceToSquared(c.pos) < 26 * 26 && G.vfx) {
        if (Math.random() < dt * 7) G.vfx.glow?.spawn({ x: c.pos.x + rand(-0.12, 0.12), y: c.pos.y + 0.35, z: c.pos.z + rand(-0.12, 0.12), vy: rand(0.6, 1.3), vx: rand(-0.15, 0.15), vz: rand(-0.15, 0.15), life: 0.7, size: 0.16, size1: 0.02, color: '#ffb050', alpha: 0.95, alpha1: 0 });
        if (Math.random() < dt * 2.2) this.puffSteam(c.pos.clone().setY(c.pos.y + 0.85), 1);
      }
    }
    // stirring: steam and bubbles off the pot, a ladle tap now and then
    const k = this.cooking;
    if (k) {
      k.t += dt;
      if (Math.random() < dt * 9) this.puffSteam(k.at.clone().setY(k.at.y + (k.stove ? 0.25 : 0)), 1);
      if (k.stove) k.stove.broth.position.y = 0.34 + 0.01 * Math.sin(k.t * 14);
      if ((k.tick = (k.tick || 0) - dt) <= 0) { k.tick = 0.42; Events.emit('sfx', 'cook_stir', { pitch: rand(0.9, 1.15), vol: 0.5 }); }
    }
    // walked away from the station: the Cook panel closes
    const s = this.station;
    if (s && G.ui?.isOpen?.('cook') && !this.busy && (G.player.pos.distanceToSquared(s.at) > 25 || (s.kind === 'campfire' && this.camp?.world !== G.world))) G.ui.close('cook');
  }
}
export { STATIONS };
