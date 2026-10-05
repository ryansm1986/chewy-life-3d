// Buildings public API.
//   BUILDINGS                         catalog (see catalog.js)
//   buildModel(id, {level, seed, style}) → { group, lights, door, footprint, height, glow, smoke, update?, id, level,
//                                       variant, style, tplKey } (style: an exterior style, styles.js; releaseModel when gone)
//   setNight(model, t 0..1)           window / lantern glow (shared materials: any model sets them all)
//   bridgeDeckHeight(localZ)          walkable deck height of the arched bridge (local space)
// Geometry is cached per (id, level, variant[, style hash]) where variant = seed mod VARIANTS; meshes are cheap instances.
// Styled templates (a remodelled house) are capped (STYLED_CAP): the least recently used ones no live model uses are
// evicted and disposed. Unstyled templates are the village's shared look and are never evicted.
import * as THREE from 'three';
import { Builder, instantiate, MATS } from './kit.js';
import { BUILDINGS, CATEGORIES, sizeOf } from './catalog.js';
import { MODELS } from './models.js';
import { bridgeDeckHeight } from './decor.js';
import { cleanStyle, styleKey } from './styles.js';
import { clamp, lerp } from '../../core/util.js';

export { BUILDINGS, CATEGORIES, sizeOf, bridgeDeckHeight };
export const VARIANTS = 8;
export const STYLED_CAP = 24;

const cache = new Map();
let tick = 0;
// How dressed-up a model is (B.detail, 0 humble .. 2 rich): trim, eave charms, tile-end discs, window dressing.
// Per level for levelled buildings; landmarks are rich, workshops stay humble.
const DETAIL = {
  home: [0, 1, 2], shop: [0, 1, 2], farm: [0, 1], lumber: [0, 1], kiln: [0, 1], fishingHut: [0, 1],
  townHall: 2, rosieShop: 2, shrine: 2, chewyHouse: 1, clinic: 1, school: 1, onsen: 1, boneSmith: 1,
};
function detailOf(id, level) { const d = DETAIL[id]; return Array.isArray(d) ? d[Math.min(d.length, level) - 1] : d ?? 1; }
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
export function variantOf(seed = 0) { return (((seed | 0) % VARIANTS) + VARIANTS) % VARIANTS; }

// is this variant's template already built (building it costs 5-20 ms)?
export const templateKey = (id, level, seed, style = null) => { const def = BUILDINGS[id], sk = styleKey(style); return `${id}:${clamp(level | 0, 1, def?.levels || 1)}:${variantOf(seed)}${sk ? '|' + sk : ''}`; };
export function hasTemplate(id, level = 1, seed = 0, style = null) { if (!BUILDINGS[id]) return false; return cache.has(templateKey(id, level, seed, style)); }
export function getTemplate(id, level = 1, seed = 0, style = null) {
  const def = BUILDINGS[id];
  if (!def) throw new Error(`[buildings] unknown id ${id}`);
  level = clamp(level | 0, 1, def.levels || 1);
  const v = variantOf(seed), st = cleanStyle(style);
  const key = templateKey(id, level, seed, st);
  let tpl = cache.get(key);
  if (!tpl) {
    // (the same Builder seed with or without a style: a remodel keeps every random choice, only the chosen parts change)
    const B = new Builder((hashStr(id) + level * 977 + v * 7919) >>> 0);
    B.variant = v; B.level = level; B.id = id; B.detail = detailOf(id, level); B.style = st;
    B.footprint = [...sizeOf(id, level)];
    MODELS[id](B, level, v);
    tpl = B.finish();
    tpl.tris = Object.values(tpl.geos).reduce((a, g) => a + g.attributes.position.count / 3, 0)
      + tpl.anims.reduce((a, an) => a + Object.values(an.geos).reduce((b, g) => b + g.attributes.position.count / 3, 0), 0);
    tpl.key = key; tpl.styled = !!st; tpl.users = 0;
    cache.set(key, tpl);
    if (tpl.styled) evictStyled();
  }
  tpl.used = ++tick;
  return tpl;
}
/** drop the least recently used styled templates beyond the cap that no live model uses */
function evictStyled() {
  const styled = [...cache.values()].filter(t => t.styled);
  if (styled.length <= STYLED_CAP) return;
  styled.sort((a, b) => a.used - b.used);
  for (const t of styled) { if (styled.length <= STYLED_CAP) break; if (t.users > 0) continue; disposeTpl(t); cache.delete(t.key); styled.splice(styled.indexOf(t), 1); }
}
function disposeTpl(tpl) { for (const g of Object.values(tpl.geos)) g.dispose(); for (const a of tpl.anims) for (const g of Object.values(a.geos)) g.dispose(); }
/** template cache stats (QA): { all, styled, keys } */
export const templateStats = () => ({ all: cache.size, styled: [...cache.values()].filter(t => t.styled).length, keys: [...cache.keys()] });
/** a model is gone (its building despawned): its template may be evicted again */
export function releaseModel(model) { const t = model?.tplKey && cache.get(model.tplKey); if (t && model._held) { t.users = Math.max(0, t.users - 1); model._held = false; } }

export function buildModel(id, { level = 1, seed = 0, style = null } = {}) {
  const tpl = getTemplate(id, level, seed, style);
  tpl.users++;
  const inst = instantiate(tpl);
  inst.group.name = `building:${id}`;
  const parts = inst.parts;
  const model = {
    id, level: clamp(level | 0, 1, BUILDINGS[id].levels || 1), seed, variant: variantOf(seed), style: cleanStyle(style), tplKey: tpl.key, _held: true,
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

export function clearCache() { for (const tpl of cache.values()) disposeTpl(tpl); cache.clear(); }
