// Buildings public API.
//   BUILDINGS                         catalog (see catalog.js)
//   buildModel(id, {level, seed})     → { group, lights, door, footprint, height, glow, smoke, update?, id, level, variant }
//   setNight(model, t 0..1)           window / lantern glow (shared materials: any model sets them all)
//   bridgeDeckHeight(localZ)          walkable deck height of the arched bridge (local space)
// Geometry is cached per (id, level, variant) where variant = seed mod VARIANTS; meshes are cheap instances.
import * as THREE from 'three';
import { Builder, instantiate, MATS } from './kit.js';
import { BUILDINGS, CATEGORIES, sizeOf } from './catalog.js';
import { MODELS } from './models.js';
import { bridgeDeckHeight } from './decor.js';
import { clamp, lerp } from '../../core/util.js';

export { BUILDINGS, CATEGORIES, sizeOf, bridgeDeckHeight };
export const VARIANTS = 8;

const cache = new Map();
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
export function variantOf(seed = 0) { return (((seed | 0) % VARIANTS) + VARIANTS) % VARIANTS; }

export function getTemplate(id, level = 1, seed = 0) {
  const def = BUILDINGS[id];
  if (!def) throw new Error(`[buildings] unknown id ${id}`);
  level = clamp(level | 0, 1, def.levels || 1);
  const v = variantOf(seed);
  const key = `${id}:${level}:${v}`;
  let tpl = cache.get(key);
  if (!tpl) {
    const B = new Builder((hashStr(id) + level * 977 + v * 7919) >>> 0);
    B.variant = v; B.level = level; B.id = id;
    B.footprint = [...sizeOf(id, level)];
    MODELS[id](B, level, v);
    tpl = B.finish();
    tpl.tris = Object.values(tpl.geos).reduce((a, g) => a + g.attributes.position.count / 3, 0)
      + tpl.anims.reduce((a, an) => a + Object.values(an.geos).reduce((b, g) => b + g.attributes.position.count / 3, 0), 0);
    cache.set(key, tpl);
  }
  return tpl;
}

export function buildModel(id, { level = 1, seed = 0 } = {}) {
  const tpl = getTemplate(id, level, seed);
  const inst = instantiate(tpl);
  inst.group.name = `building:${id}`;
  const parts = inst.parts;
  const model = {
    id, level: clamp(level | 0, 1, BUILDINGS[id].levels || 1), seed, variant: variantOf(seed),
    group: inst.group,
    lights: tpl.lights.map(l => ({ pos: l.pos.clone(), color: l.color.clone(), intensity: l.intensity, radius: l.radius, flicker: l.flicker, nightOnly: l.nightOnly })),
    door: tpl.door.clone(), footprint: [...tpl.footprint], height: tpl.height,
    glow: inst.glow, smoke: tpl.smoke.map(p => p.clone()), tris: tpl.tris,
    update: parts.length ? (dt, t) => animate(parts, t) : null,
  };
  inst.group.userData.building = model;
  return model;
}

const _q = new THREE.Quaternion();
function animate(parts, t) {
  for (const { node, a } of parts) {
    const ph = t * a.speed + a.phase;
    if (a.kind === 'swing') node.quaternion.setFromAxisAngle(a.axis, Math.sin(ph) * a.amp + Math.sin(ph * 2.3) * a.amp * 0.15);
    else if (a.kind === 'spin') node.quaternion.setFromAxisAngle(a.axis, ph);
    else if (a.kind === 'bob') node.position.set(a.pivot.x, a.pivot.y + Math.sin(ph) * a.amp, a.pivot.z);
    else if (a.kind === 'pulse') { const s = 1 + Math.sin(ph) * a.amp; node.scale.set(1 / Math.sqrt(s), s, 1 / Math.sqrt(s)); }
  }
}

// Glow materials are shared between all buildings, so this is idempotent per frame.
export function setNight(model, t) {
  t = clamp(t, 0, 1);
  const list = model?.glow || [MATS().glow, MATS().hot];
  for (const m of list) m.emissiveIntensity = lerp(m.userData.dayI ?? 0, m.userData.nightI ?? 2, t);
}
export function setNightAll(t) { setNight(null, t); }

export function clearCache() { for (const tpl of cache.values()) { for (const g of Object.values(tpl.geos)) g.dispose(); for (const a of tpl.anims) for (const g of Object.values(a.geos)) g.dispose(); } cache.clear(); }
