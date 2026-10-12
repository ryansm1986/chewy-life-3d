// The Town Portal (docs/ZONES.md §4.2; ROADMAP Z-H2, the owner's request 2026-10-11: "a way to tp back to town and back
// to the same spot in the dungeon"; the pick: free, any time). In any dungeon floor (the Burrow's dens, the zone
// dungeons, the Deep Burrow's tier runs) T, the Game page's Town Portal or the touch HUD's portal button casts it: a short
// cast (CAST_S) while a moon gate grows in front of the hero; then the hero and Shadow step through to Blossom Hollow,
// where its other end waits by the plaza. Stepping back in rebuilds that floor exactly as it was left.
//   - Not mid-fight: once a floor's boss is engaged (aggro, its intro, a blow traded) until it falls, a toast says why.
//   - The floor isn't kept alive in memory (the phone's memory diet: docs/CONTROLS.md §12.7): its run (seeds, plan, tier,
//     modifiers, the hero level its monsters were sized for) and a snapshot of what changed go into the save
//     (state.portal), and stepping back in builds the floor from the same seeds, then puts the snapshot back:
//       the monsters beaten stay gone (by spawn order, DungeonMode._sid), the rest stand where they were, as hurt as
//       they were; opened chests stay open (the boss's treasure and Lantern chests too, still shut if they were); broken
//       pots stay broken; touched shrines stay spent; the loot on the ground lies where it lay; a fallen boss stays
//       fallen, its way home and stairs back where they rose; the floor-cleared cache isn't paid twice.
//   - One portal at a time: casting another replaces it. Setting off into any dungeon another way (a den, a zone gate, a
//     tier run, debug travel) or sending a crew into that dungeon closes it, with a toast. It survives a save and a
//     reload. Only the portal's round trip resumes a floor: the floor's own way home still ends the run.
//   - The pointer, the map and the minimap read G.townPortal.village (its spot and label: the map's rows are UX-1's).
// G.townPortal: press() (T / the menu / touch: → true when it handled it in a dungeon floor), can() (→ null or why
// not), open (the snapshot, or null), village ({ pos, label } of the return portal, or null), resume(), close(why),
// arrive(D, run) (game.js after a floor starts: puts a resumed floor back → the hero's spot), update(dt, t, vfx) (the
// village frame: the return portal's swirl).
import * as THREE from 'three';
import { Events } from '../core/events.js';
import { Actions } from '../core/actions.js';
import { DUNGEONS, theDen } from './defs.js';
import { THEMES } from './gen.js';
import { portalModel } from './portalModel.js';
import { objective } from '../cozy/objectives.js';
import { registerDebug } from '../debug/registry.js';
import { BOSS_SHORT } from '../world/burrowDoor.js';

/** the cast, in seconds */
export const CAST_S = 1.0;
/** where the return portal stands in Blossom Hollow: on the plaza's paving east of the fountain, a sakura planter behind
 *  it (world/layout.js PLAZA 112, 121), its face to the south-east: to the game camera (engine.js rig yaw π/4) and the
 *  spawn */
export const VILLAGE_SPOT = { x: 117.3, z: 121.6, faceTo: { x: 127.3, z: 131.6 } };
/** the return portal's interactable label (the map's HERE / SPOTS rows match its start) */
export const PORTAL_LABEL = 'Step into the Town Portal';
const HOME_COLORS = ['#ff9cc2', '#7fcaff', '#fff2f6']; // (Blossom Hollow from a floor: sakura, sky, a pale blossom heart)
const SNAP_V = 1;
const r2 = v => Math.round(v * 100) / 100;

/** where a run is, in a sentence: "the Fox Shrine, floor 2", "the Bamboo Depths, floor 1 (Tier 3)" */
export function placeName(run) {
  const d = DUNGEONS[run?.id]; if (!d) return 'the dungeon';
  const n = d.kind === 'burrow' ? theDen(d.id) : `the ${d.name.replace(/^The /, '')}`;
  const t = run.spirit > 0 ? ` (Spirit ${run.spirit})` : run.tier > 0 ? ` (Tier ${run.tier})` : '';
  return `${n}, floor ${run.floor}${t}`;
}
/** a floor's colours for the return portal's swirl: its theme's accent (a touch of lavender), the portals' sky blue warmed
 *  by its light, a pale heart of its floor: every return portal reads as a portal, each in its own place's colours */
export function placeColors(theme) {
  const T = THEMES[theme] || {}, mix = (a, b, k) => '#' + new THREE.Color(a).lerp(new THREE.Color(b), k).getHexString();
  return [mix(T.accent || '#ffc88a', '#c8a8ff', 0.2), mix('#8fd0ff', T.light || '#ffc88a', 0.25), mix(T.floor?.[2] || T.floor?.[0] || '#fff0d0', '#fff8fc', 0.7)];
}

// ------------------------------------------------------------------ the snapshot (pure data: it goes into the save)
/** What changed on this floor since it was built → the snapshot (state.portal) */
export function snapshotFloor(G, D) {
  const P = G.player, L = D.layout, run = D.run || {};
  const live = new Map(); for (const m of D.monsters) if (m.alive && m._sid != null) live.set(m._sid, m);
  const alive = [], dead = [];
  for (let i = 0; i < (D.spawned || 0); i++) {
    const m = live.get(i);
    if (m) alive.push([i, m.id, r2(m.pos.x), r2(m.pos.z), Math.round(m.life / m.lifeMax * 1000) / 1000]);
    else dead.push([i, D.spawnKinds?.[i] || null]);
  }
  const chests = { opened: [], late: [] };
  for (const c of D.chests || []) {
    if (c.layoutIdx != null) { if (c.opened) chests.opened.push(c.layoutIdx); continue; }
    chests.late.push({ x: r2(c.pos.x), z: r2(c.pos.z), q: c.quality, opened: !!c.opened, label: c.label || (c.tierClear ? 'Open the Lantern chest' : 'Open the treasure chest'), firstClear: c.firstClear || null, tierClear: c.tierClear || null });
  }
  const loot = [], Z = D.zr;
  for (const e of D.loot?.list || []) {
    const { quest, ...d } = e.d || {}; // (a zone dungeon's quest item: its objective record is re-linked by index on the way back)
    try { loot.push({ d: JSON.parse(JSON.stringify(d)), x: r2(e.to.x), z: r2(e.to.z), qi: quest && Z ? Z.drops.indexOf(quest) : -1 }); } catch (er) { /* a drop that can't be saved stays behind */ }
  }
  const bossDead = !!L.boss && D.bossSid != null && !live.has(D.bossSid);
  return {
    v: SNAP_V, made: Date.now(), place: placeName(run), theme: L.theme,
    run: { id: run.id, floor: run.floor, tier: run.tier || 0, spirit: run.spirit || 0, mods: [...(run.mods || [])], seed: run.seed, packSeed: run.packSeed, heroLvl: run.heroLvl },
    hero: { x: r2(P.pos.x), z: r2(P.pos.z), face: r2(P.facing || 0) },
    n: D.spawned || 0, alive, dead, chests, loot,
    pots: (D.pots || []).map((p, i) => (p.alive ? -1 : i)).filter(i => i >= 0),
    shrines: (D.shrines || []).map((s, i) => (s.used ? i : -1)).filter(i => i >= 0),
    cleared: !!D.floorCleared,
    // a zone dungeon's objectives: the list the floor was built with (so the cages and marked packs stand where they stood
    // and the packs' dice roll the same), which cages are open, which quest items dropped or were picked up
    zr: Z ? { obj: JSON.parse(JSON.stringify(Z.objectives || [])), cages: Z.cages.map(c => !!c.open), drops: Z.drops.map(q => ({ dropped: !!q.dropped, taken: !!q.taken })) } : null,
    boss: bossDead ? { dead: true, x: r2(D.victoryAt?.x ?? P.pos.x), z: r2(D.victoryAt?.z ?? P.pos.z) } : null,
  };
}
/** the nearest open floor to (x, z) within r m (a monster saved pressed against a wall's edge), or null */
function openNear(W, x, z, r = 1.5) {
  if (W.walkable(x, z)) return { x, z };
  for (let d = 0.25; d <= r + 1e-6; d += 0.25) for (let k = 0; k < 12; k++) {
    const a = k / 12 * Math.PI * 2, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
    if (W.walkable(px, pz)) return { x: px, z: pz };
  }
  return null;
}
/** Put a snapshot back on a freshly built floor of the same run (after DungeonMode.start) → the hero's spot */
export function restoreFloor(G, D, S) {
  const W = D.world, by = new Map(); for (const m of D.monsters) if (m._sid != null) by.set(m._sid, m);
  for (const [i, kind] of S.dead || []) { const m = by.get(i); if (m && (!kind || m.id === kind)) D.dropSilently(m); }
  for (const [i, kind, x, z, f] of S.alive || []) {
    const m = by.get(i); if (!m || m.id !== kind) continue;
    const at = openNear(W, x, z); if (at) { m.pos.x = at.x; m.pos.z = at.z; m.pos.y = W.heightAt?.(at.x, at.z) ?? m.pos.y; }
    m.life = Math.max(1, Math.round(m.lifeMax * (f > 0 ? f : 1))); m.sync?.();
  }
  for (const i of S.chests?.opened || []) (D.chests || []).find(c => c.layoutIdx === i)?.markOpened();
  for (const c of S.chests?.late || []) {
    const p = new THREE.Vector3(c.x, W.heightAt?.(c.x, c.z) || 0, c.z), chest = D.makeChest(p, c.q);
    if (c.firstClear) chest.firstClear = c.firstClear; if (c.tierClear) chest.tierClear = c.tierClear; chest.label = c.label;
    W.collision.addCircle(p.x, p.z, 0.5);
    if (c.opened) chest.markOpened();
    else W.interactables.push({ pos: p, radius: 1.3, label: c.label, onInteract() { if (chest.opened) return; chest.open(); W.interactables.splice(W.interactables.indexOf(this), 1); } });
  }
  for (const i of S.pots || []) D.pots?.[i]?.smash?.();
  for (const i of S.shrines || []) D.shrines?.[i]?.spend?.();
  if (S.zr) D.zr?.restore?.(S.zr);
  const A = G.audio, own = !!A && Object.prototype.hasOwnProperty.call(A, 'play'), play = A?.play;
  if (A) A.play = () => null; // (the ground's loot lands without a clatter of drop sounds)
  try {
    for (const e of S.loot || []) { const d = { ...e.d }; if (e.qi >= 0 && D.zr?.drops[e.qi]) d.quest = D.zr.drops[e.qi]; D.placeLoot(d, e.x, e.z); }
  } finally { if (A) { if (own) A.play = play; else delete A.play; } }
  if (S.boss?.dead) D.restoreVictory(new THREE.Vector3(S.boss.x, 0, S.boss.z));
  if (S.cleared) D.floorCleared = true;
  return S.hero;
}

// ------------------------------------------------------------------ the portal in the game
export function installTownPortal(G, village) {
  const st = () => G.state;
  let cast = null, vp = null, vInter = null, vLight = null, vCol = null;
  const T = {
    get open() { return st().portal?.v ? st().portal : null; },
    get village() { return vInter ? { pos: vInter.pos, label: vInter.label, x: VILLAGE_SPOT.x, z: VILLAGE_SPOT.z } : null; },
    get casting() { return !!cast; },
    /** why the portal can't be cast now (a toast's text), '' to ignore the press quietly, or null: it can */
    can() {
      const D = G.mode === 'dungeon' ? G.dungeon : null;
      if (!D || D.isRegion) return 'Town Portals open in dungeons. Out here, the Wayfarer\'s Stone takes you home.';
      if (G.playerDead || G.leavingDungeon || G.ui?.iris?.active || G.ui?.dlg?.active || cast) return '';
      const b = D.boss;
      if (b?.alive && (b.aggro || b.introDone || b.engaged)) return `No portal mid-fight: ${BOSS_SHORT[b.id] || String(b.name || 'the boss').split(',')[0].replace(/ the [A-Z].*$/, '')} won't let you slip away!`;
      const pin = D.tr?.pin; if (pin && !pin.done && (pin.busy || pin.k > 0)) return 'No portal mid-fight: the Four Seasons are still stirring!'; // (the pinnacle: from its first season until the last falls)
      return null;
    },
    /** T, the Game page's Town Portal, the touch button → true when handled here (a dungeon floor), false elsewhere */
    press() {
      const D = G.mode === 'dungeon' ? G.dungeon : null;
      if (!D || D.isRegion) return false;
      const why = this.can();
      if (why) { G.ui?.toast?.(why, { icon: 'lock', color: '#ffb0a0', key: 'portal-refuse' }); Events.emit('sfx', 'ui_error'); Events.emit('portal:refused', { why }); }
      if (why != null) return true;
      startCast(D);
      return true;
    },
    resume() {
      const S = this.open; if (!S || G.mode !== 'village') return false;
      Events.emit('sfx', 'portal');
      const P = G.player; G.vfx?.sparkle?.(P.pos.clone().setY(P.pos.y + 0.9), { n: 20, color: HOME_COLORS[1], r: 0.6, rise: 1.2 });
      G.enterDungeon({ ...S.run, resume: S });
      return true;
    },
    /** close the open portal (why: the toast's tail; quiet: no toast) */
    close(why = '', quiet = false) {
      const S = this.open; if (!S) return false;
      delete st().portal; hideVillage();
      if (!quiet) G.ui?.toast?.(`The Town Portal to ${S.place} closed${why ? ': ' + why : ''}`, { icon: 'torii', color: '#c8b8ff' });
      Events.emit('portal:closed', { why }); G.save?.();
      return true;
    },
    /** game.js, right after a floor starts: a resumed floor gets its snapshot back → the hero's spot (or null) */
    arrive(D, run) {
      if (cast && cast.D !== D) cast = null; // (a cast cut short by leaving its floor: the floor and its gate are gone)
      const S = run?.resume; if (!S) return null;
      let at = null;
      try { at = restoreFloor(G, D, S); } catch (e) { console.warn('[portal] restore', e); }
      delete st().portal; hideVillage();
      setTimeout(() => { if (G.dungeon === D) G.ui?.toast?.(`Back in ${S.place}, just as you left it`, { icon: 'torii', color: '#c8b8ff' }); }, 900);
      Events.emit('portal:resumed', { id: S.run.id, floor: S.run.floor });
      return at;
    },
    /** the village frame: the return portal's swirl and motes */
    update(dt, t, vfx) { vp?.update(dt, t, vfx); },
    snapshot: () => (G.dungeon && !G.dungeon.isRegion ? snapshotFloor(G, G.dungeon) : null), // (QA)
  };
  G.townPortal = T;

  /** where the cast's gate rises: 1.7 m from the hero, away from the camera (so the hero stands before it, in view), on
   *  open floor with a clear line from the hero (else turned a little, else nearer, else where the hero faces) */
  function gateSpot(D) {
    const P = G.player, W = D.world, cam = G.engine?.camera?.position;
    const a0 = cam ? Math.atan2(P.pos.x - cam.x, P.pos.z - cam.z) : P.facing || 0;
    const ok = (x, z) => W.walkable(x, z) && W.walkable((x + P.pos.x) / 2, (z + P.pos.z) / 2) && !W.collision?.solidAt?.(x, z, 0.6) && !W.interactables.some(i => Math.hypot(i.pos.x - x, i.pos.z - z) < 1.6); // (not on a chest, the stairs or the floor's own way home)
    for (const d of [1.7, 1.3]) for (const da of [0, 0.5, -0.5, 1, -1, 1.6, -1.6, Math.PI]) {
      const a = a0 + da, x = P.pos.x + Math.sin(a) * d, z = P.pos.z + Math.cos(a) * d;
      if (ok(x, z)) return { x, z };
    }
    const f = P.facing || 0; return { x: P.pos.x + Math.sin(f) * 0.9, z: P.pos.z + Math.cos(f) * 0.9 };
  }
  function startCast(D) {
    const P = G.player, { x, z } = gateSpot(D);
    const model = portalModel({ colors: HOME_COLORS });
    model.group.position.set(x, D.world.heightAt?.(x, z) || 0, z); model.group.rotation.y = Math.atan2(P.pos.x - x, P.pos.z - z); model.group.scale.setScalar(0.85);
    model.open(0);
    D.world.scene.add(model.group);
    const light = D.world.lightPool.addSource({ pos: new THREE.Vector3(x, 1.4, z), color: new THREE.Color(HOME_COLORS[1]), intensity: 0, radius: 6 });
    cast = { D, t: 0, at: P.pos.clone(), model, light, done: false };
    P.moveTarget = null; P.anim?.play?.('cast');
    G.vfx?.ring?.(model.group.position.clone().setY(0.05), { color: HOME_COLORS[0], r0: 0.3, r1: 1.4, life: 0.8 });
    Events.emit('sfx', 'portal'); Events.emit('portal:cast', { id: D.def?.id, floor: D.floor });
    (st().flags.hints ||= {}).portal = true; // (found it: Shadow's tip about it isn't needed any more)
    (D.spinners ||= []).push(tickCast);
  }
  function endCast(ok) {
    const c = cast; if (!c) return; cast = null;
    const i = c.D.spinners?.indexOf(tickCast); if (i >= 0) c.D.spinners.splice(i, 1);
    if (!ok) { c.model.dispose(); c.D.world.lightPool.removeSource(c.light); G.ui?.toast?.('The portal fizzled: hold still while it opens', { icon: 'torii', color: '#c8b8ff', key: 'portal-fizzle' }); Events.emit('portal:fizzled', {}); }
  }
  function tickCast(dt, t) {
    const c = cast; if (!c) return;
    const P = G.player, D = c.D;
    if (G.dungeon !== D || G.playerDead || P.rollT > 0 || Math.hypot(P.pos.x - c.at.x, P.pos.z - c.at.z) > 0.45 || Actions.move().mag > 0.3) { endCast(false); return; }
    c.t += dt;
    const k = Math.min(1, c.t / CAST_S), e = 1 - (1 - k) ** 3;
    c.model.open(e); c.model.group.scale.setScalar(0.85 + 0.15 * e); c.model.update(dt, t, G.vfx, 2.5); c.light.intensity = 4 * e;
    P.faceTarget = Math.atan2(c.model.group.position.x - P.pos.x, c.model.group.position.z - P.pos.z);
    if (Math.random() < dt * 22) { const a = Math.random() * Math.PI * 2, rr = 1.6 + Math.random(); G.vfx?.spark?.spawn?.({ x: c.model.group.position.x + Math.cos(a) * rr, y: 0.3 + Math.random() * 1.6, z: c.model.group.position.z + Math.sin(a) * rr, vx: -Math.cos(a) * 1.4, vz: -Math.sin(a) * 1.4, vy: 0.2, life: 0.7, size: 0.14, color: HOME_COLORS[Math.random() < 0.5 ? 0 : 2], alpha: 0.85, alpha1: 0 }); }
    if (k < 1 || c.done) return;
    c.done = true; endCast(true);
    // through: the snapshot goes into the save, the hero and Shadow step in, Blossom Hollow
    const S = snapshotFloor(G, D);
    if (st().portal) Events.emit('portal:replaced', { place: st().portal.place });
    st().portal = S;
    G.vfx?.sparkle?.(P.pos.clone().setY(P.pos.y + 0.9), { n: 24, color: HOME_COLORS[0], r: 0.7, rise: 1.4 });
    Events.emit('portal:opened', { id: S.run.id, floor: S.run.floor, place: S.place });
    showVillage();
    G._portalHome = arrivalSpot();
    G.returnToVillage();
  }
  // ---- the return portal in Blossom Hollow
  function arrivalSpot() { const s = VILLAGE_SPOT, f = s.faceTo, dx = f.x - s.x, dz = f.z - s.z, L = Math.hypot(dx, dz) || 1; return { x: s.x + dx / L * 2.1, z: s.z + dz / L * 2.1, face: Math.atan2(dx, dz) }; }
  function showVillage() {
    const S = T.open; if (!S || !village?.scene) return;
    const cols = placeColors(S.theme);
    if (!vp) {
      vp = portalModel({ colors: cols }); vCol = cols.join();
      const s = VILLAGE_SPOT, y = village.heightAt?.(s.x, s.z) || 0;
      vp.group.position.set(s.x, y, s.z); vp.group.rotation.y = Math.atan2(s.faceTo.x - s.x, s.faceTo.z - s.z);
      village.scene.add(vp.group);
      vp.col = village.collision?.addCircle?.(s.x, s.z, 0.75, 'townPortal');
      vLight = village.lightPool?.addSource?.({ pos: new THREE.Vector3(s.x, y + 1.3, s.z), color: new THREE.Color(cols[1]), intensity: 2, radius: 4.5, flicker: 0.12 }); // (a soft glow on the paving round it, brighter by night)
      const a = vp.group.rotation.y;
      vInter = { pos: new THREE.Vector3(s.x + Math.sin(a) * 1.0, y, s.z + Math.cos(a) * 1.0), radius: 1.5, label: `${PORTAL_LABEL} (${S.place})`, onInteract: () => T.resume(), townPortal: true };
      village.interactables.push(vInter);
    } else if (vCol !== cols.join()) { vp.setColors(cols); vCol = cols.join(); }
    vInter.label = `${PORTAL_LABEL} (${S.place})`;
    Events.emit('portal:village', { on: true });
  }
  function hideVillage() {
    if (!vp) return;
    vp.dispose(); if (vp.col) village.collision?.remove?.(vp.col);
    if (vLight) village.lightPool?.removeSource?.(vLight);
    const i = village.interactables.indexOf(vInter); if (i >= 0) village.interactables.splice(i, 1);
    vp = null; vInter = null; vLight = null; vCol = null;
    Events.emit('portal:village', { on: false });
  }
  if (T.open) showVillage(); // (a save with an open portal)

  // ---- what closes it: setting off into a dungeon another way, a crew into that dungeon
  const enter = G.enterDungeon;
  G.enterDungeon = (arg = 1) => {
    if (T.open && !(arg && typeof arg === 'object' && arg.resume)) {
      const d = DUNGEONS[typeof arg === 'object' ? arg?.id : null], tier = typeof arg === 'object' && (arg.tier > 0 || arg.spirit > 0);
      T.close(tier ? 'you set off on a tier run' : d ? `you set off into ${d.kind === 'burrow' ? theDen(d.id) : 'the ' + d.name.replace(/^The /, '')}` : 'you set off into another dungeon');
    }
    return enter(arg);
  };
  Events.on('expedition:sent', e => {
    const S = T.open; if (!S || !e?.obj) return;
    const o = objective(G.state, e.obj), id = S.run.id, zone = DUNGEONS[id]?.zone;
    if (o && (o.place?.dungeon === id || o.den === id || (zone && (o.binds?.dungeon === zone || o.place?.dungeon === DUNGEONS[id]?.id)))) T.close('a crew set off into it');
  });
  // a cast cut short by leaving its floor another way (the stairs taken mid-cast, a knock-out): forgotten, its floor gone
  Events.on('mode:changed', () => { if (cast && G.dungeon !== cast.D) cast = null; });
  // ---- Shadow's tip, once, on a dungeon floor (docs/TUTORIALS.md: the hints)
  Events.on('mode:changed', e => {
    if (e?.mode !== 'dungeon' || G.dungeon?.isRegion) return;
    setTimeout(() => {
      if (G.mode !== 'dungeon' || G.dungeon?.isRegion || cast) return; // (not over a cast: the tip would follow the hero home)
      const dev = Actions.device;
      G.hint?.('portal', dev === 'touch' ? 'Need a break? Tap the portal button by the map for a Town Portal home. It brings you right back here!'
        : dev === 'pad' ? 'Need a break? Open the menu ({menu}) and pick Town Portal to pop home. It brings you right back here!'
          : 'Need a break? Press T for a Town Portal home. It brings you right back here!');
    }, 9000);
  });
  // ---- debug (the Dens tab: docs/DEBUG.md)
  registerDebug('dens', [
    { group: 'The Town Portal', label: 'Cast it now', hint: 'On a dungeon floor: no cast time', closes: true, run: G => { const D = G.dungeon; if (!D || D.isRegion) return 'Only on a dungeon floor'; const why = T.can(); if (why) return why || 'Not now'; startCast(D); if (cast) cast.t = CAST_S; return 'Through the portal'; } },
    { label: 'Close the portal', run: G => (T.close('closed by debug') ? 'Closed' : 'No portal open') },
    { label: 'The snapshot', hint: 'What a portal would save here', run: G => { const S = T.snapshot() || T.open; return S ? `${S.place}: ${S.alive.length} standing, ${S.dead.length} beaten, ${S.chests.opened.length + S.chests.late.filter(c => c.opened).length} chests open, ${S.loot.length} on the ground, ${(JSON.stringify(S).length / 1024).toFixed(1)} KB` : 'Nothing to snapshot'; } },
  ]);
  return T;
}
