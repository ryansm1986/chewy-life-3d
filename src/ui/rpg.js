// Bridge to src/rpg/* (written by the rpg layer). Uses an eager glob so the UI never hard-fails when a
// module is missing, and adapts to small naming differences. Everything here has a UI-side fallback.
import { glyphURL, SLOT_GLYPH } from './glyphs.js';

const mods = import.meta.glob('../rpg/*.js', { eager: true });
const M = name => mods[`../rpg/${name}.js`] || {};
const pick = (mod, ...names) => { for (const n of names) if (typeof mod[n] === 'function' || (mod[n] && typeof mod[n] === 'object')) return mod[n]; return null; };

export const rpg = {
  get items() { return M('items'); },
  get stats() { return M('stats'); },
  get skills() { return M('skills'); },
  get loot() { return M('loot'); },
  get actions() { return M('actions'); },
  get icons() { return M('icons'); },
  has: name => !!mods[`../rpg/${name}.js`],
};

// ------------------------------------------------------------------ icons
const RARE_TINT = { normal: '#fff6e8', magic: '#cfe0ff', rare: '#fff1b0', unique: '#ffd7a8', set: '#c9f5d2' };
export function itemIconURL(item) {
  if (!item) return '';
  const f = pick(rpg.icons, 'itemIcon', 'iconFor', 'itemIconURL', 'drawItemIcon', 'icon');
  if (f) { try { const u = f(item); if (u) return typeof u === 'string' ? u : u.toDataURL?.() || ''; } catch (e) { /* fall through */ } }
  const kind = item.kind;
  let g = SLOT_GLYPH[item.slot] || 'gift';
  if (item.slot === 'weapon') g = item.wtype === 'ball' ? 'ball' : 'sword';
  if (kind === 'gem') g = 'gem'; else if (kind === 'key') g = 'key'; else if (kind === 'gift') g = 'gift';
  else if (kind === 'material') g = item.base in MATERIAL_G ? MATERIAL_G[item.base] : 'petal';
  return glyphURL(g);
}
const MATERIAL_G = { wood: 'wood', stone: 'stone', petal: 'petal', crystal: 'crystal', bone: 'bone', mochi: 'mochi', silk: 'silk', lantern: 'lantern' };
export const rarityTint = r => RARE_TINT[r] || RARE_TINT.normal;

const POT_G = { heart: 'potionHeart', zoom: 'potionZoom', rejuv: 'potionRejuv' };
export function potionIconURL(k) {
  const f = rpg.icons.potionIcon;
  if (f) { try { const u = f(k); if (u) return u; } catch (e) { /* ignore */ } }
  return glyphURL(POT_G[k] || 'potionHeart');
}
export function materialIconURL(k) {
  const f = rpg.icons.materialIcon;
  if (f) { try { const u = f(k); if (u) return u; } catch (e) { /* ignore */ } }
  return glyphURL(MATERIAL_G[k] || 'sparkle');
}
export function potionInfo(k) { const P = rpg.items.POTIONS?.[k]; return P ? { name: P.name, desc: P.desc, price: P.price, color: P.color } : null; }

const SKILL_FALLBACK_G = { attack: 'swords', attack_ball: 'ball', chomp: 'bone', fetch: 'ball' };
// hotbar / popover icon: the basic 'attack' follows the equipped weapon (bone sword vs tennis ball)
export function hotbarIconURL(id, derived) { return skillIconURL(id === 'attack' && derived?.weaponType === 'ball' ? 'attack_ball' : id); }
export const plural = (n, word, pl = word + 's') => `${n} ${n === 1 ? word : pl}`;
export function skillIconURL(id) {
  if (!id) return '';
  const f = pick(rpg.icons, 'skillIcon', 'skillIconURL');
  if (f) { try { const u = f(id); if (u) return typeof u === 'string' ? u : u.toDataURL?.() || ''; } catch (e) { /* ignore */ } }
  const def = skillDef(id);
  if (def?.glyph) return glyphURL(def.glyph);
  const tree = def?.tree;
  return glyphURL(SKILL_FALLBACK_G[id] || (tree === 'fetch' ? 'ball' : tree === 'spirit' ? 'paw' : tree === 'bone' ? 'bone' : 'sparkle'));
}

// ------------------------------------------------------------------ skills
export const TREES = [
  { id: 'bone', name: 'Bone Arts', jp: '骨の技', color: '#ffb36a', bg: ['#fff3e0', '#ffe0c2'], glyph: 'bone' },
  { id: 'fetch', name: 'Fetch Mastery', jp: '取ってこい', color: '#5ec79a', bg: ['#effff6', '#cdf3e0'], glyph: 'ball' },
  { id: 'spirit', name: 'Pack Spirit', jp: '群れの魂', color: '#9a8cff', bg: ['#f3f0ff', '#dcd6ff'], glyph: 'paw' },
];

export function treeInfo(id) {
  const base = TREES.find(t => t.id === id) || TREES[0];
  const r = (rpg.skills.TREES || []).find(t => t.id === id);
  return r ? { ...base, name: r.name || base.name, desc: r.desc || '', sub: r.sub || '' } : base;
}

let _skillCache = null, _skillSrc = null;
// Normalised skill list: [{id, name, tree, row, col, maxLvl, reqLvl, prereq:[ids], desc, cost(lvl), cd, synergies:[{id, text}], raw}]
export function skillList() {
  const S = rpg.skills;
  const src = S.SKILLS || S.skills || S.SKILL_DEFS || S.default || null;
  if (src && src === _skillSrc && _skillCache) return _skillCache;
  if (!src) return _skillCache || (_skillCache = MOCK_SKILLS.map(norm));
  _skillSrc = src;
  const arr = Array.isArray(src) ? src : Object.entries(src).map(([id, d]) => ({ id, ...d }));
  _skillCache = arr.filter(d => d && d.id !== 'attack').map(norm);
  return _skillCache;
}
export function skillDef(id) {
  if (!id) return null;
  if (id === 'attack') {
    const A = rpg.skills.ATTACK;
    return { id: 'attack', name: A?.name || 'Attack', tree: null, desc: A?.desc || 'A trusty swing (or throw) with your equipped weapon.', maxLvl: 1, reqLvl: 1, prereq: [], synergies: [], kind: 'active', passive: false, cost: () => 0, cd: 0, raw: A || {} };
  }
  return skillList().find(s => s.id === id) || null;
}
// effective level including +skills gear
export function effLevel(id, state, derived) {
  const f = rpg.skills.effectiveLevel;
  if (f) { try { return f(id, state, derived); } catch (e) { /* ignore */ } }
  const base = state?.player?.skills?.[id] || 0; if (!base) return 0;
  const d = skillDef(id);
  return base + (derived?.allSkills || 0) + (derived?.treeSkills?.[d?.tree] || 0);
}
// {ok, why}
export function canLearnSkill(id, state) {
  const f = rpg.skills.canLearn;
  if (f) { try { const r = f(id, state); return typeof r === 'object' ? r : { ok: !!r, why: '' }; } catch (e) { /* ignore */ } }
  const s = skillDef(id), p = state?.player || {};
  const lvl = p.skills?.[id] || 0;
  if (!s) return { ok: false, why: 'Unknown skill' };
  if (lvl >= s.maxLvl) return { ok: false, why: 'Mastered!' };
  if ((p.lvl || 1) < s.reqLvl + lvl) return { ok: false, why: `Requires level ${s.reqLvl + lvl}` };
  for (const q of s.prereq) if (!(p.skills?.[q] > 0)) return { ok: false, why: `Requires ${skillDef(q)?.name || q}` };
  if ((p.skillPts || 0) <= 0) return { ok: false, why: 'No skill points' };
  return { ok: true, why: '' };
}
// {ok, why} — can the skill be cast right now (zoom / weapon)?
export function skillUsable(id, state, derived, zoomNow) {
  const f = rpg.skills.usable;
  if (f) { try { return f(id, state, derived, zoomNow); } catch (e) { /* ignore */ } }
  const c = skillCost(id, state);
  return c > (zoomNow ?? 1e9) ? { ok: false, why: 'Not enough zoom!' } : { ok: true, why: '' };
}
function norm(d) {
  const pos = d.pos || d.grid || null;
  const row = d.row ?? d.tier ?? (pos ? pos[0] : 0);
  const col = d.col ?? d.column ?? (pos ? pos[1] : 1);
  const prereq = [].concat(d.pre || d.prereq || d.prereqs || d.requires || d.req?.skills || d.parents || []).filter(Boolean).map(p => (typeof p === 'string' ? p : p.id));
  const costF = typeof d.cost === 'function' ? d.cost : typeof d.zoom === 'function' ? d.zoom : typeof d.mana === 'function' ? d.mana
    : (lvl => +(d.cost ?? d.zoom ?? d.zoomCost ?? d.mana ?? 0) || 0);
  let syn = d.syn || d.synergies || d.synergy || [];
  if (!Array.isArray(syn)) syn = Object.entries(syn).map(([id, v]) => ({ id, text: typeof v === 'string' ? v : `+${v}% per level` }));
  syn = syn.map(s => (typeof s === 'string' ? { id: s, text: '' } : { id: s.id, text: s.text || (s.p != null ? `+${s.p}% damage per point` : '') }));
  const kind = d.kind || d.type || (d.passive ? 'passive' : 'active');
  const reqLvl = typeof d.req === 'number' ? d.req : (d.reqLvl ?? d.lvlReq ?? d.req?.lvl ?? d.level ?? (1 + (+row || 0) * 6));
  return {
    id: d.id, name: d.name || d.id, tree: d.tree || d.treeId || 'bone', row: +row || 0, col: +col || 0,
    maxLvl: d.maxLvl ?? d.max ?? d.maxLevel ?? rpg.skills.MAX_SKILL_LVL ?? 20, reqLvl,
    prereq, desc: d.desc || d.description || '', cost: costF, cd: d.cd ?? d.cooldown ?? 0, synergies: syn,
    kind, passive: kind === 'passive' || kind === 'aura' || !!d.passive, wep: d.wep || null,
    glyph: d.glyph, raw: d,
  };
}

// Lines describing a skill at a level: tries rpg describers, then generic fields.
export function skillInfoLines(id, lvl, G) {
  const S = rpg.skills;
  const f = pick(S, 'skillTooltip', 'describeSkill', 'describe', 'skillLines');
  if (f) {
    try {
      const r = f(id, lvl, G?.derived, G?.state);
      if (r) return Array.isArray(r) ? r.map(x => (typeof x === 'string' ? x : x.text || '')) : typeof r === 'string' ? [r] : r.lines || [];
    } catch (e) { /* fall through */ }
  }
  const d = skillDef(id); if (!d) return [];
  const raw = d.raw || {};
  const out = [];
  if (typeof raw.info === 'function') { try { const r = raw.info(lvl, G?.derived); return Array.isArray(r) ? r : [String(r)]; } catch (e) { /* ignore */ } }
  if (typeof raw.dmg === 'function') { try { const v = raw.dmg(lvl, G?.derived); out.push(`Damage: ${Array.isArray(v) ? v.join('–') : v}`); } catch (e) { /* ignore */ } }
  const c = d.cost(lvl); if (c) out.push(`Zoom cost: ${Math.round(c * 10) / 10}`);
  if (d.cd) out.push(`Cooldown: ${typeof d.cd === 'function' ? d.cd(lvl) : d.cd}s`);
  return out;
}

export function skillCost(id, state) {
  const d = skillDef(id); if (!d) return 0;
  const lvl = Math.max(1, effLevel(id, state, null) || state?.player?.skills?.[id] || 1);
  try { return +d.cost(lvl) || 0; } catch (e) { return 0; }
}

// ------------------------------------------------------------------ xp
export function xpForLevel(lvl) {
  const S = rpg.stats;
  const f = pick(S, 'xpForLevel', 'xpToNext', 'xpNeeded', 'xpNext', 'xpForNext');
  if (f) { try { const v = f(lvl); if (v > 0) return v; } catch (e) { /* ignore */ } }
  if (Array.isArray(S.XP_TABLE)) return S.XP_TABLE[lvl] || S.XP_TABLE[S.XP_TABLE.length - 1];
  return Math.round(100 * Math.pow(lvl, 1.55));
}
// Some stats modules keep xp as a running total; we compute progress for the current level.
export function xpProgress(p) {
  const S = rpg.stats;
  const f = pick(S, 'xpProgress');
  if (f) { try { const r = f(p); if (r) return r; } catch (e) { /* ignore */ } }
  const need = xpForLevel(p.lvl || 1), cur = +p.xp || 0;
  return { cur, need, frac: need > 0 && isFinite(need) ? Math.max(0, Math.min(1, cur / need)) : 0 };
}

// ------------------------------------------------------------------ items
export function itemName(item) {
  if (!item) return '';
  const nf = pick(rpg.items, 'itemName', 'displayName');
  if (nf) { try { const n = nf(item); if (n) return n; } catch (e) { /* ignore */ } }
  return item.name || baseName(item.base) || 'Item';
}
export function baseName(base) {
  const B = rpg.items.ITEM_BASES || rpg.items.BASES;
  return (B && B[base] && B[base].name) || (base ? base.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()) : '');
}
export function equipSlotsFor(item) {
  if (!item || item.kind !== 'gear') return [];
  if (item.slot === 'weapon') return ['weapon', 'weaponAlt'];
  if (item.slot === 'charm') return ['charm1', 'charm2'];
  return [item.slot];
}
export function meetsReq(item, state, derived) {
  const r = item?.req; if (!r) return { ok: true };
  const lvl = state?.player?.lvl || 1;
  const d = derived || {};
  const st = state?.player?.stats || {};
  const res = { ok: true, lvl: true, str: true, dex: true };
  if (r.lvl && r.lvl > lvl) { res.ok = false; res.lvl = false; }
  if (r.str && r.str > (d.str ?? st.str ?? 0)) { res.ok = false; res.str = false; }
  if (r.dex && r.dex > (d.dex ?? st.dex ?? 0)) { res.ok = false; res.dex = false; }
  return res;
}
export function sellPrice(item) {
  const f = pick(rpg.items, 'sellPrice', 'sellValue');
  if (f) { try { return f(item); } catch (e) { /* ignore */ } }
  return Math.max(1, Math.round((item?.value || 1) * (item?.qty || 1)));
}
export function buyPrice(item) {
  const f = pick(rpg.items, 'buyPrice', 'priceOf');
  if (f) { try { return f(item); } catch (e) { /* ignore */ } }
  return Math.max(1, Math.round((item?.value || 5) * (item?.qty || 1)));
}
// rpg-provided tooltip → normalised {html} | null
export function rpgItemTooltip(item, ctx) {
  const f = pick(rpg.items, 'itemTooltip', 'tooltip', 'itemLines');
  if (!f) return null;
  try { return f(item, ctx?.state, ctx?.derived); } catch (e) { console.warn('[ui] itemTooltip failed', e); return null; }
}

// ------------------------------------------------------------------ mock skills (used only until src/rpg/skills.js exists)
const MOCK_SKILLS = [
  { id: 'chomp', name: 'Chomp', tree: 'bone', row: 0, col: 1, maxLvl: 20, desc: 'A mighty bite that heals a little.', cost: 2, glyph: 'bone' },
  { id: 'boneToss', name: 'Bone Toss', tree: 'bone', row: 1, col: 0, prereq: ['chomp'], desc: 'Hurl a spinning bone.', cost: 4, glyph: 'bone' },
  { id: 'toughHide', name: 'Tough Hide', tree: 'bone', row: 1, col: 2, passive: true, desc: '+Defense and block.', glyph: 'shield' },
  { id: 'boneWall', name: 'Bone Wall', tree: 'bone', row: 2, col: 1, prereq: ['boneToss'], desc: 'Summon a wall of bones.', cost: 8, glyph: 'bone' },
  { id: 'marrowBurst', name: 'Marrow Burst', tree: 'bone', row: 3, col: 0, prereq: ['boneWall'], desc: 'Explosive bones.', cost: 10, glyph: 'fire' },
  { id: 'skeleKing', name: 'Skele-King', tree: 'bone', row: 5, col: 1, prereq: ['marrowBurst'], desc: 'The ultimate bone art.', cost: 24, glyph: 'skull' },
  { id: 'fetch', name: 'Fetch!', tree: 'fetch', row: 0, col: 0, desc: 'Throw the ball — it bounces back.', cost: 3, glyph: 'ball' },
  { id: 'zoomies', name: 'Zoomies', tree: 'fetch', row: 0, col: 2, desc: 'Dash in a burst of speed.', cost: 5, glyph: 'bolt' },
  { id: 'ricochet', name: 'Ricochet', tree: 'fetch', row: 2, col: 0, prereq: ['fetch'], desc: 'Ball bounces between foes.', cost: 6, glyph: 'ball' },
  { id: 'multiBall', name: 'Multi-Ball', tree: 'fetch', row: 3, col: 1, prereq: ['ricochet', 'zoomies'], desc: 'Three balls at once!', cost: 9, glyph: 'ball' },
  { id: 'howl', name: 'Howl', tree: 'spirit', row: 0, col: 1, desc: 'Rally the pack.', cost: 6, glyph: 'paw' },
  { id: 'goodBoy', name: 'Good Boy Aura', tree: 'spirit', row: 1, col: 0, passive: true, prereq: ['howl'], desc: 'Life regen aura.', glyph: 'heart' },
  { id: 'packBond', name: 'Pack Bond', tree: 'spirit', row: 2, col: 2, prereq: ['howl'], desc: 'Shadow grows stronger.', glyph: 'shadowDog' },
  { id: 'spiritWolf', name: 'Spirit Wolf', tree: 'spirit', row: 4, col: 1, prereq: ['packBond'], desc: 'Summon a ghostly wolf.', cost: 15, glyph: 'moon' },
];
