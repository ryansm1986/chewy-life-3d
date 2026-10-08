// The Spirit Lantern (docs/ZONES.md §5, §5.2 as built; ROADMAP Z-E3): the tier device that stands by every tier
// dungeon's door — each zone dungeon's gate (regions/dungeonGate.js installGate) and the Burrow door in Blossom Hollow
// (the Deep Burrow's: installBurrowLantern). A hexagonal stone tōrō with a paper firebox, a shimenawa with shide round
// its pillar and a hōju on its roof. Asleep (the dungeon not yet cleared once) its paper is dark and cold; lit, a
// violet-blue spirit flame glows in the box, three ofuda drift round it and motes rise. F opens the Lantern panel
// (ui/lantern.js) through G.lantern (installLanternApi: the panel never imports world code).
import * as THREE from 'three';
import { DUNGEONS } from '../dungeon/defs.js';
import { tierRecord, tierOpen, spiritOpen, spiritMax, spiritBest, lastSetup, rememberSetup, TIER_MAX } from '../rpg/zones.js';
import { cleanMods } from '../rpg/zoneMods.js';
import { runLevel } from '../rpg/tiers.js';
import { paint, merge, tube } from '../gfx/geom.js';
import { makeToon, makeOutline } from '../gfx/materials.js';
import { glowTexture } from '../gfx/textures.js';
import { Events } from '../core/events.js';
import { rand, TAU, clamp } from '../core/util.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const C = h => new THREE.Color(h);
export const LANTERN_COLOR = '#b8a6ff', LANTERN_CORE = '#9fe4ff';
const nz = (x, y, z) => Math.sin(x * 7.1 + z * 3.3) * Math.cos(y * 5.7 - x * 2.2) * 0.5 + Math.sin(x * 19 + y * 13 + z * 11) * 0.25;

let GEO = null; // (one stone mass, one paper box, one charm, built once and shared: never disposed per lantern)
function geometry() {
  if (GEO) return GEO;
  const stone = C('#9c978d'), stoneHi = C('#c4beb0'), stoneLo = C('#6c6862'), moss = C('#6f9e4c'), mossHi = C('#9cc664'), slate = C('#4c4860'), slateHi = C('#7a7496'), cord = C('#8a62e0'), cordHi = C('#c4a8ff');
  const stonePaint = (lift = 0, mossy = 1) => (p, n, o) => {
    const k = clamp(0.45 + n.y * 0.35 + nz(p.x * 3, p.y * 3, p.z * 3) * 0.2 + lift);
    o.copy(stoneLo).lerp(stone, clamp(k * 1.7)).lerp(stoneHi, clamp(k * 1.5 - 0.75));
    const m = nz(p.x * 5 + 1, p.y * 2.5, p.z * 5);
    if (mossy && n.y > 0.45 && m > 0.12) o.lerp(moss, 0.6).lerp(mossHi, clamp((m - 0.3) * 2) * 0.5); // (moss on the ledges)
    if (n.y < -0.3) o.multiplyScalar(0.8);
  };
  const hex = (rt, rb, h, y, seg = 6, rot = 0, hs = 1) => { const g = new THREE.CylinderGeometry(rt, rb, h, seg, hs); g.rotateY(rot); g.translate(0, y, 0); return g; };
  const S = [];
  // the plinth: a wide low hexagon, a second step, chamfered
  S.push(paint(hex(0.66, 0.74, 0.2, 0.1), stonePaint(0.02)), paint(hex(0.5, 0.57, 0.16, 0.28), stonePaint(0.06)));
  // the pillar: stout, octagonal, two carved bands
  S.push(paint(hex(0.16, 0.19, 0.8, 0.76, 8), stonePaint(0, 0.4)));
  for (const y of [0.5, 1.02]) S.push(paint(hex(0.2, 0.2, 0.05, y, 8), stonePaint(0.12, 0)));
  // the platform (chūdai) with a ring of lotus petals under it
  S.push(paint(hex(0.48, 0.38, 0.15, 1.24), stonePaint(0.1)));
  for (let i = 0; i < 12; i++) { const a = i / 12 * TAU, g = new THREE.SphereGeometry(0.1, 8, 6); g.scale(1, 0.45, 0.6); g.rotateY(-a); g.translate(Math.cos(a) * 0.36, 1.17, Math.sin(a) * 0.36); S.push(paint(g, stonePaint(0.12, 0))); }
  // the firebox: six chunky posts, a sill and a lintel
  for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i / 6 * TAU, g = new THREE.BoxGeometry(0.1, 0.48, 0.1); g.rotateY(-a); g.translate(Math.cos(a) * 0.34, 1.565, Math.sin(a) * 0.34); S.push(paint(g, stonePaint(0.06, 0))); }
  S.push(paint(hex(0.41, 0.43, 0.07, 1.345), stonePaint(0.1, 0)), paint(hex(0.44, 0.41, 0.08, 1.83), stonePaint(0.1, 0)));
  // the roof (kasa): dark slate, its hexagonal cap swept down and in (a concave sag), the six corners curling up, thick eaves
  { let g = new THREE.CylinderGeometry(0.05, 0.82, 0.52, 6, 6, true); const P = g.attributes.position;
    for (let i = 0; i < P.count; i++) { const x = P.getX(i), y = P.getY(i), z = P.getZ(i), r = Math.hypot(x, z) / 0.82, a = Math.atan2(z, x), cn = Math.pow(Math.abs(Math.sin(a * 3)), 8); // (a hexagon's corners sit at 30° + k·60°)
      P.setY(i, y - r * (1 - r) * 0.28 + cn * r * r * r * 0.16); }
    g = g.toNonIndexed(); g.computeVertexNormals(); g.translate(0, 2.1, 0); // (flat faces: the six slopes read as a hipped roof, not a cone)
    // (each slope its own shade, by which way it faces: the hipped roof reads from the high game camera too)
    S.push(paint(g, (p, n, o) => { const r = Math.hypot(p.x, p.z), face = 0.82 + 0.22 * (n.x * -0.55 + n.z * -0.35); o.copy(slate).lerp(slateHi, clamp(0.25 + nz(p.x * 4, p.y * 2, p.z * 4) * 0.2)).multiplyScalar(face); if (r > 0.3 && r < 0.62 && nz(p.x * 7, 3, p.z * 7) > 0.4) o.lerp(moss, 0.4); })); }
  for (let i = 0; i < 6; i++) { // the hip ridges, apex to corner, capped in a lighter stone
    const a = Math.PI / 6 + i / 6 * TAU, pts = []; for (let k = 0; k <= 6; k++) { const t = k / 6, r = 0.05 + 0.77 * t; pts.push({ p: V(Math.cos(a) * r, 2.36 - 0.52 * t - (r / 0.82) * (1 - r / 0.82) * 0.28 + Math.pow(r / 0.82, 3) * 0.16 + 0.02, Math.sin(a) * r), r: 0.03 }); }
    S.push(paint(tube(pts, 5, false), (p, n, o) => o.set('#9a94b8').lerp(C('#c8c2de'), clamp(n.y))));
  }
  S.push(paint(hex(0.8, 0.76, 0.06, 1.86), (p, n, o) => o.copy(slate).multiplyScalar(n.y < -0.5 ? 0.6 : 0.85)));
  for (let i = 0; i < 6; i++) { // (warabite: a little fern-curl rolled up at each corner)
    const a = Math.PI / 6 + i / 6 * TAU, cx = Math.cos(a), cz = Math.sin(a), pts = [];
    for (let k = 0; k <= 8; k++) { const t = k / 8, ang = t * 4.4, rr = 0.06 * (1 - t * 0.5); pts.push({ p: V(cx * (0.8 + Math.sin(ang) * rr), 2.0 + rr - Math.cos(ang) * rr, cz * (0.8 + Math.sin(ang) * rr)), r: 0.036 * (1 - t * 0.45) }); }
    S.push(paint(tube(pts, 6, true), (p, n, o) => o.copy(slateHi).lerp(C('#9a94b6'), clamp(n.y))));
  }
  // the hōju on top: a stepped base and an onion-shaped jewel with its point
  { const b = new THREE.CylinderGeometry(0.08, 0.12, 0.08, 8); b.translate(0, 2.32, 0); S.push(paint(b, stonePaint(0.1, 0)));
    const h = new THREE.SphereGeometry(0.115, 14, 10); const P = h.attributes.position; for (let i = 0; i < P.count; i++) { const y = P.getY(i); if (y > 0) { const k = y / 0.115; P.setX(i, P.getX(i) * (1 - k * k * 0.8)); P.setZ(i, P.getZ(i) * (1 - k * k * 0.8)); P.setY(i, y * 1.8); } }
    h.computeVertexNormals(); h.translate(0, 2.45, 0); S.push(paint(h, stonePaint(0.25, 0))); }
  // the shimenawa round the pillar, its shide zigzags hanging in front
  const rope = []; for (let k = 0; k <= 24; k++) { const a = k / 24 * TAU; rope.push({ p: V(Math.cos(a) * 0.22, 0.86 + Math.sin(a * 2) * 0.01, Math.sin(a) * 0.22), r: 0.042 }); }
  S.push(paint(tube(rope, 6, false), (p, n, o) => o.set('#e6cf86').lerp(C('#b89848'), clamp(0.5 + Math.sin(Math.atan2(p.z, p.x) * 18 + p.y * 30) * 0.5) * 0.55)));
  for (const a of [Math.PI / 2 - 0.55, Math.PI / 2 + 0.55]) {
    const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(0.07, 0); s.lineTo(0.07, -0.08); s.lineTo(0.025, -0.1); s.lineTo(0.07, -0.18); s.lineTo(0.025, -0.2); s.lineTo(0.07, -0.29); s.lineTo(0, -0.29); s.lineTo(0, -0.2); s.lineTo(0.045, -0.18); s.lineTo(0, -0.1); s.lineTo(0.045, -0.08); s.lineTo(0, 0);
    const g = new THREE.ShapeGeometry(s); g.translate(-0.035, 0.84, 0); g.rotateY(-a + Math.PI / 2); g.translate(Math.cos(a) * 0.25, 0, Math.sin(a) * 0.25);
    S.push(paint(g, (p, n, o) => o.set('#fffaf0')));
  }
  // two violet silk tassels hanging from the front corners of the roof: the spirit's colour on the stone
  for (const a of [Math.PI / 6, Math.PI / 2]) { // (the two front corners)
    const x = Math.cos(a) * 0.74, z = Math.sin(a) * 0.74;
    S.push(paint(tube([{ p: V(x, 1.92, z), r: 0.016 }, { p: V(x * 1.01, 1.74, z * 1.01), r: 0.016 }], 5, false), (p, n, o) => o.copy(cord)));
    const k = new THREE.SphereGeometry(0.035, 8, 6); k.translate(x * 1.01, 1.73, z * 1.01); S.push(paint(k, (p, n, o) => o.copy(cordHi)));
    const t = new THREE.CylinderGeometry(0.026, 0.042, 0.15, 10, 1); t.translate(x * 1.01, 1.635, z * 1.01); S.push(paint(t, (p, n, o) => { o.copy(cord).lerp(cordHi, clamp((p.y - 1.56) * 7) * 0.6); if (Math.sin(Math.atan2(p.z - z, p.x - x) * 10) > 0.6) o.multiplyScalar(0.85); })); // (the tassel's silk fringe)
    const tb = new THREE.SphereGeometry(0.042, 10, 6, 0, TAU, Math.PI / 2, Math.PI / 2); tb.translate(x * 1.01, 1.56, z * 1.01); S.push(paint(tb, (p, n, o) => o.copy(cord).multiplyScalar(0.9)));
  }
  const stoneGeo = merge(S); stoneGeo.userData.shared = true;
  // the paper box: six panels with a kumiko lattice painted on (lit by the material's emissive)
  const pb = new THREE.CylinderGeometry(0.305, 0.305, 0.44, 6, 4, true); pb.translate(0, 1.58, 0);
  const paperGeo = paint(pb, (p, n, o) => { const a = Math.atan2(p.z, p.x) - Math.PI / 6, u = ((a / TAU * 6) % 1 + 1) % 1, v = (p.y - 1.36) / 0.44; o.set('#fff6fc'); if (Math.abs(u - 0.5) < 0.03 || Math.abs(v - 0.5) < 0.03 || Math.abs(v - 0.18) < 0.025 || Math.abs(v - 0.82) < 0.025) o.set('#6a5a86'); });
  paperGeo.userData.shared = true;
  // an ofuda: a paper charm with a red seal stripe
  const ch = new THREE.PlaneGeometry(0.11, 0.3, 1, 3); const charmGeo = paint(ch, (p, n, o) => { o.set('#fffaf0'); if (Math.abs(p.x) < 0.02 && p.y > -0.1 && p.y < 0.11) o.set('#d8403a'); if (p.y > 0.12) o.set('#e8dcc0'); });
  charmGeo.userData.shared = true;
  return (GEO = { stoneGeo, paperGeo, charmGeo });
}

/** a Spirit Lantern model → { root, setLit(on), update(dt, t, vfx, near), dispose } (its light comes from the caller's pool) */
export function lanternModel() {
  const { stoneGeo, paperGeo, charmGeo } = geometry();
  const root = new THREE.Group(); root.name = 'spiritLantern';
  const stoneMat = makeToon({ vertexColors: true, rim: 0.35, brush: 0.16 });
  const stone = new THREE.Mesh(stoneGeo, stoneMat); stone.castShadow = true; stone.receiveShadow = true;
  stone.add(new THREE.Mesh(stoneGeo, makeOutline('#3a2a40', 0.016)));
  const paperMat = makeToon({ vertexColors: true, rim: 0.2, side: THREE.DoubleSide, emissive: '#2a2640', emissiveIntensity: 1 });
  const paper = new THREE.Mesh(paperGeo, paperMat);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: C(LANTERN_COLOR), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  glow.position.set(0, 1.58, 0); glow.scale.setScalar(1.3);
  const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: C(LANTERN_CORE), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  flame.position.set(0, 1.56, 0); flame.scale.set(0.4, 0.58, 1);
  const charmMat = makeToon({ vertexColors: true, rim: 0.3, side: THREE.DoubleSide, emissive: '#ffe8f8', emissiveIntensity: 0.15 });
  const charms = [0, 1, 2].map(i => { const m = new THREE.Mesh(charmGeo, charmMat); m.userData.ph = i / 3 * TAU; m.visible = false; return m; });
  root.add(stone, paper, glow, flame, ...charms);
  const S = { lit: false, k: 0 };
  return {
    root, paper, get lit() { return S.lit; },
    setLit(on) { S.lit = !!on; for (const c of charms) c.visible = S.lit; },
    update(dt, t, vfx, near) {
      S.k += ((S.lit ? 1 : 0) - S.k) * Math.min(1, dt * 2.5);
      const fl = 0.85 + Math.sin(t * 5.3) * 0.06 + Math.sin(t * 11.7) * 0.04;
      paperMat.emissive.copy(C('#2a2640')).lerp(C('#c8b4ff'), S.k * fl);
      glow.material.opacity = S.k * 0.55 * fl; glow.scale.setScalar(1.3 + Math.sin(t * 2) * 0.08);
      flame.material.opacity = S.k * 0.95 * fl; flame.scale.set(0.4 + Math.sin(t * 9) * 0.04, 0.58 + Math.sin(t * 7) * 0.06, 1);
      for (const c of charms) { const a = t * 0.55 + c.userData.ph; c.position.set(Math.cos(a) * 0.95, 1.5 + Math.sin(t * 1.3 + c.userData.ph * 2) * 0.16, Math.sin(a) * 0.95); c.rotation.set(Math.sin(t * 2 + c.userData.ph) * 0.25, -a + Math.PI / 2, Math.sin(t * 1.7 + c.userData.ph) * 0.2); }
      if (S.lit && near && vfx && Math.random() < dt * 5) { const p = root.getWorldPosition(_w); vfx.spark?.spawn?.({ x: p.x + rand(-0.25, 0.25), y: p.y + 1.6 + rand(0, 0.3), z: p.z + rand(-0.25, 0.25), vy: rand(0.4, 0.8), life: 1.2, size: 0.16, size1: 0.02, color: Math.random() < 0.5 ? LANTERN_COLOR : LANTERN_CORE, alpha: 0.9, alpha1: 0 }); }
    },
    dispose() { stoneMat.dispose(); paperMat.dispose(); charmMat.dispose(); glow.material.dispose(); flame.material.dispose(); root.removeFromParent(); },
  };
}
const _w = new THREE.Vector3();

/**
 * Stand a Spirit Lantern for dungeon `id` in a world: { scene, lightPool, collision, interactables } at (x, y, z), turned
 * `yaw`. → { pos, model, it, refresh(), update(dt, t, vfx, heroPos), dispose() }. Lit once the dungeon has a tier open.
 */
export function placeLantern(G, W, id, { x, y = 0, z, yaw = 0, lightI = 3 }) {
  const def = DUNGEONS[id], model = lanternModel();
  model.root.position.set(x, y, z); model.root.rotation.y = yaw; W.scene.add(model.root);
  W.collision?.addCircle?.(x, z, 0.62);
  const pos = V(x, y, z);
  let light = null;
  const h = {
    id, pos, model,
    refresh() {
      const on = tierOpen(G.state, id) > 0;
      if (on && !model.lit && !light) light = W.lightPool?.addSource?.({ pos: V(x, y + 1.6, z), color: C(LANTERN_COLOR), intensity: lightI, radius: 6, flicker: 0.25 });
      if (!on && light) { W.lightPool?.removeSource?.(light); light = null; }
      model.setLit(on);
      return on;
    },
    update(dt, t, vfx, hero) { model.update(dt, t, vfx, !hero || (hero.x - x) ** 2 + (hero.z - z) ** 2 < 600); },
    dispose() { if (light) W.lightPool?.removeSource?.(light); model.dispose(); },
  };
  const it = h.it = {
    pos: V(x, y, z + 0.0), radius: 1.6,
    get label() { return tierOpen(G.state, id) > 0 ? `Spirit Lantern: ${def?.name || 'tiers'}` : 'Spirit Lantern (asleep)'; },
    onInteract: () => G.lantern?.open?.(id),
  };
  W.interactables.push(it);
  h.refresh();
  return h;
}

// ------------------------------------------------------------------ the Burrow door's lantern (Blossom Hollow)
/** the Deep Burrow's lantern beside the Burrow's gate in the village; lights up live when Tamamo falls */
export function installBurrowLantern(G, village, at) {
  const x = at.x, z = at.z, y = village.heightAt(x, z);
  const h = placeLantern(G, village, 'burrowDeep', { x, y, z, yaw: at.yaw || 0 });
  Events.on('tier:unlocked', e => { if (e?.id === 'burrowDeep') h.refresh(); });
  G.burrowLantern = h;
  return h;
}

// ------------------------------------------------------------------ G.lantern: what the panel reads and does
/** the Lantern's data and actions for ui/lantern.js (pure reads of the save, plus open / enter) */
export function installLanternApi(G) {
  G.lantern = {
    /** everything the panel shows for one dungeon */
    info(id) {
      const def = DUNGEONS[id], rec = tierRecord(G.state, id); if (!def || !rec) return null;
      const open = tierOpen(G.state, id), sMax = spiritMax(G.state), last = lastSetup(G.state, id);
      const hero = G.state.player?.lvl || 1;
      return {
        id, name: def.name, kind: def.kind, zone: def.zone, levels: def.levels, floors: def.floors, boss: def.boss, hero,
        tierOpen: open, tierMax: TIER_MAX, cleared: rec.tier.cleared.slice(), clears: rec.cleared, spiritOpen: spiritOpen(G.state), spiritMax: sMax, spiritBest: spiritBest(G.state), spiritHere: rec.spirit.best,
        last, level: run => runLevel(def.levels, 1, run, hero),
      };
    },
    /** open the panel at a dungeon's lantern (asleep: a toast says why) */
    open(id) {
      const def = DUNGEONS[id];
      if (!(tierOpen(G.state, id) > 0)) {
        G.ui?.toast?.(def?.kind === 'deep' ? 'The Spirit Lantern sleeps. Beat Tamamo on Burrow floor 20 to wake it.' : `The Spirit Lantern sleeps. Clear the ${def?.name || 'dungeon'} once to wake it.`, { icon: 'lantern', color: '#c8b8ff' });
        Events.emit('sfx', 'ui_deny'); return false;
      }
      if (G.ui?.open) { G.ui._user = true; try { G.ui.open('lantern', { dungeon: id }); } finally { G.ui._user = false; } }
      Events.emit('sfx', 'portal');
      return true;
    },
    /** set off: remember the setup, close the panel, enter floor 1 of the run */
    enter(id, run) {
      const r = { tier: Math.max(0, Math.min(tierOpen(G.state, id), run.tier | 0)), spirit: Math.max(0, Math.min(spiritMax(G.state), run.spirit | 0)) };
      if (r.spirit > 0) r.tier = TIER_MAX; else if (r.tier < 1) return false;
      r.mods = cleanMods(run.mods || [], r);
      rememberSetup(G.state, id, r);
      G.ui?.close?.('lantern', true);
      G.enterDungeon({ id, floor: 1, ...r });
      return true;
    },
  };
  return G.lantern;
}
