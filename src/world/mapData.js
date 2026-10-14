// Who and what the maps show (ROADMAP UX-1, docs/MAP.md): the People and Places directories, the markers on both maps
// and the "where are they now" line, all from the live game (G.npcs, the heroes and hires, the village's buildings, its
// boards, stalls and landmarks). Entries:
//   person { key, kind: 'person', group: 'quest' | 'shop' | 'town' | 'hero' | 'hire', id, name, role, color, initial,
//            npc, pos (live), visible (out of doors, on this map), badge: '!' | '?' | 'gift' | null, prio, home? }
//   place  { key, kind: 'place', cat: 'shop' | 'service' | 'board' | 'home' | 'gather' | 'landmark' | 'gate', id, name,
//            sub, icon, color, pos, prio, b? (the building record) }
// Groups and categories double as the filter chips' layers (People, Shops, Services, Quests, Gathering, Wild).
import { DISTRICTS, plotAt } from './plots.js';
import { LANDMARKS, nearestOnStreets, POND, BAMBOO, HILL, WORLD } from './layout.js';
import { BUILDINGS } from './buildings/index.js';
import { variantName } from './mapArt.js';
import { HIRE_CLASSES } from '../cozy/guild.js';
import { DEN_IDS, theDen } from '../dungeon/defs.js';

export const GROUPS = [['quest', 'Something for you'], ['shop', 'Shopkeepers'], ['town', 'Townsfolk'], ['hero', 'Heroes'], ['hire', 'Hires'], ['zone', 'Villagers']];
export const CATS = [['shop', 'Shops'], ['service', 'Services'], ['board', 'Boards'], ['home', 'Homes'], ['gather', 'Gathering'], ['landmark', 'Landmarks'], ['gate', 'Gates & regions']];
export const CAT_COLOR = { shop: '#5aa8f0', service: '#9a7ae8', board: '#c98f5e', home: '#ff7fa6', gather: '#5ec46a', landmark: '#f0a830', gate: '#8a56d8' };

// the named cast: a colour that reads on the map (their outfit's), and what they do
const CAST = {
  rosie: { color: '#ff5c8a', role: "Rosie's Treats", group: 'shop' },
  kuma: { color: '#b87444', role: 'Baker · Market Street', group: 'shop' },
  usagi: { color: '#6ab8f0', role: 'Gardener · the Seed Stall', group: 'shop' },
  tanu: { color: '#55944a', role: "Tanu's Trinkets", group: 'shop' },
  hachi: { color: '#d4834a', role: "The Adventurers' Guild", group: 'shop' },
  mochi: { color: '#f78fb6', role: 'Painter', group: 'town' },
  kitsune: { color: '#7a6ad8', role: 'Shrine keeper', group: 'town' },
  pan: { color: '#f06a7c', role: 'Kemari champion', group: 'town' },
  kero: { color: '#4fb05a', role: 'Guardian of the koi pond', group: 'town' },
};
const HERO_COLOR = { chewy: '#2c3a6a', moka: '#3fb8a0', poe: '#6a9a3a', shihtzu: '#8a5aa8', golden: '#2f9a6a' };
const FOLK_COLOR = ['#ff8fb0', '#8fd0ff', '#ffc14a', '#7ad8a8', '#b89aff', '#ff9a6a', '#6a8aff', '#ff6a7a', '#a0d060'];
const colorOf = n => CAST[n.id]?.color || n.spec?.outfit?.topColor || n.spec?.outfit?.scarf || n.spec?.outfit?.hatColor || FOLK_COLOR[(n.id || '').length % FOLK_COLOR.length];

/** everyone the maps know of, in the village (the heroes and hires away on a crew are listed with no position) */
export function people(G) {
  const out = [], st = G.state, P = G.player, home = G.mode === 'village' || G.mode === 'interior';
  const hosted = new Set((G.housing?.hosts || []).map(v => v.id));
  for (const n of G.npcs || []) {
    if (!n?.pos || n.retired) continue;
    let group = 'town', role = 'Townsfolk', prio = 2;
    const C = CAST[n.id];
    if (C) { group = C.group; role = C.role; prio = 6; }
    else if (n.hero) { group = 'hero'; role = G.heroes?.cls?.(n.id)?.title || 'Hero'; prio = 5; }
    else if (n.hire) { const h = (st.cozy?.guild?.hires || []).find(x => x.id === n.hire); group = 'hire'; role = `${HIRE_CLASSES[h?.cls]?.name || 'Hire'}${h?.lvl ? ' · level ' + h.lvl : ''}`; prio = 3; }
    else if (n.guildmaster) { group = 'shop'; role = "The Adventurers' Guild"; prio = 6; }
    let badge = null;
    try { badge = G.story?.markerFor?.(n.id) || null; } catch (e) { badge = null; }
    if (n.waitingToJoin) badge = '!';
    if (badge === '!' || badge === '?') { group = 'quest'; prio += 3; }
    const name = n.hero ? G.heroes?.name?.(n.id) || n.name : n.name;
    out.push({ key: `p:${n.id}`, kind: 'person', group, id: n.id, name, role, color: n.hero ? HERO_COLOR[n.id] || colorOf(n) : colorOf(n), initial: (name || '?')[0].toUpperCase(),
      npc: n, pos: n.pos, visible: home && (n.visible !== false) && !hosted.has(n.id), indoors: n.visible === false || hosted.has(n.id), hosted: hosted.has(n.id), badge, prio, named: !!C || n.hero || n.guildmaster, area: 'village' });
  }
  // you, and Shadow
  if (P) {
    const hid = st.activeHero || 'chewy', name = G.heroes?.name?.(hid) || 'Chewy';
    out.push({ key: 'p:you', kind: 'person', group: 'hero', id: hid, name, role: 'You', color: HERO_COLOR[hid] || '#ff5c8a', initial: name[0], you: true, pos: P.pos, visible: false, badge: null, prio: 9, named: true });
  }
  const sh = G.companion;
  if (sh) out.push({ key: 'p:shadow', kind: 'person', group: 'hero', id: 'shadow', name: sh.whelp?.on ? 'Shadow (whelp)' : 'Shadow', role: 'Your pup', color: '#26232c', initial: 'S', shadow: true, pos: sh.pos, visible: true, badge: null, prio: 8, named: true });
  // a hero (or messenger) arriving in town (actors/arrivals.js, ROADMAP Z-H3): a person while they're about
  if (home) for (const e of G.arrivals?.people?.() || []) if (e?.pos) out.push({ ...e, visible: G.mode === 'village' && e.visible !== false });
  // the heroes and hires out with a crew (no position: "away")
  for (const h of G.heroes?.roster?.() || []) if (h.joined && !h.active && !G.heroes.villagers?.[h.id] && G.heroes.away?.(h.id)) out.push({ key: `p:${h.id}`, kind: 'person', group: 'hero', id: h.id, name: h.name, role: h.title || 'Hero', color: HERO_COLOR[h.id] || '#8fd0ff', initial: h.name[0], away: true, pos: null, visible: false, prio: 1, named: true });
  for (const h of st.cozy?.guild?.hires || []) if (!(G.npcs || []).some(n => n.hire === h.id)) out.push({ key: `p:hire_${h.id}`, kind: 'person', group: 'hire', id: `hire_${h.id}`, name: h.name, role: `${HIRE_CLASSES[h.cls]?.name || 'Hire'} · away with a crew`, color: HIRE_CLASSES[h.cls]?.color || '#8fd0ff', initial: (h.name || '?')[0], away: true, pos: null, visible: false, prio: 1 });
  return out;
}

// glyphs by building type, and which directory category it files under
const B_ICON = {
  chewyHouse: ['home', 'home'], rosieShop: ['mochi', 'shop'], townHall: ['special', 'service'], dungeonGate: ['oni', 'gate'], boneSmith: ['hammer', 'service'],
  guild: ['shield', 'service'], shop: ['shop', 'shop'], home: ['home', 'home'], farm: ['leaf', 'gather'], lumber: ['wood', 'gather'], kiln: ['stone', 'gather'],
  fishingHut: ['wave', 'gather'], clinic: ['heart', 'service'], school: ['book', 'service'], shrine: ['torii', 'service'], onsen: ['fire', 'service'],
  bulletinBoard: ['scroll', 'board'], park: ['clover', 'landmark'], chewyStatue: ['star', 'landmark'], fountain: ['drop', 'landmark'], waterTower: ['drop', 'service'],
  stashChest: ['chest', 'service'], // (the outdoor stash, R-18: any one opens the shared stash)
};
const PRIO = { chewyHouse: 9, rosieShop: 9, dungeonGate: 8, guild: 8, townHall: 7, boneSmith: 7, shop: 6, clinic: 6, school: 5, shrine: 6, onsen: 6, bulletinBoard: 6, farm: 4, lumber: 4, kiln: 4, fishingHut: 5, home: 3, park: 2, chewyStatue: 3, fountain: 4, waterTower: 2, stashChest: 5 };
// kinds built more than once that the Places list shows as one row (the nearest, "the nearest of n"); the maps show each
const TWINS = new Set(['stashChest']);
// the village's interactables the directory names (a label's start → the place)
const SPOTS = [
  [/^Read the Wayfarer's Post/, "Wayfarer's Post", 'To the regions · the Travel Map', 'map', 'gate', 8],
  [/^Read the Expedition Board/, 'Expedition Board', 'Send crews out', 'cozy:board', 'board', 7, true],
  [/^Read the Sightings board/, 'Sightings board', "Today's sightings in the zones", 'eye', 'board', 6],
  [/^Use the workbench/, 'Workbench', 'Craft and fix', 'craft', 'service', 6],
  [/^Spirit Lantern/, 'Spirit Lantern', 'The tiers', 'lantern', 'service', 5],
  [/Seed Stall/, "Usagi's Seed Stall", 'Seeds for the garden', 'clover', 'shop', 7],
  [/Trinkets/, "Tanu's Trinkets", 'Furniture and odd treasures', 'gem', 'shop', 7],
  // the Town Portal's other end by the plaza (dungeon/townPortal.js, Z-H2): only while one is open (its interactable comes
  // and goes with it; mapPin.js refreshes the lists on portal:village); "$1" is the floor it goes back to
  [/^Step into the Town Portal(?: \((.+)\))?/, 'Town Portal', 'Back to $1', 'portal', 'gate', 9, { color: '#9b7be6', portal: true }],
];
const NODE_NAME = { driftwood: 'Driftwood', riverStone: 'River stones', petalDrift: 'Petal drift', mulberry: 'Silk cocoons' };
// the island's named places (no building): where people are, and the Places list's landmarks
export const LANDMARK_PLACES = [
  ['plaza', 'Blossom Plaza', 'The fountain square', 'sakura', 'landmark', LANDMARKS.plaza, 6],
  ['market', 'Market Square', 'The stalls', 'shop', 'landmark', LANDMARKS.market, 4],
  ['pond', 'Koi Pond', 'Fishing · Kero keeps it', 'wave', 'gather', { x: POND.x - 6, z: POND.z - 6 }, 6],
  ['river', 'River by the bridge', 'Fishing', 'wave', 'gather', { x: LANDMARKS.bridgeW.x + 3, z: LANDMARKS.bridgeW.z + 5 }, 4],
  ['beach', 'The beach', 'Fishing · driftwood', 'wave', 'gather', LANDMARKS.beach, 5],
  ['bridge', 'Arched Bridge', 'Over the river, to the west trail', 'bamboo', 'landmark', LANDMARKS.bridgeW, 4],
  ['waterfall', 'The waterfall', 'Up the Waterfall Trail', 'drop', 'landmark', { x: LANDMARKS.basin.x, z: LANDMARKS.basin.z + 7 }, 4],
  ['bamboo', 'Bamboo rise', 'West of the river', 'bamboo', 'landmark', LANDMARKS.bamboo, 3],
  ['shrineHill', 'Shrine Hill', 'The Burrow and the lanterns', 'torii', 'landmark', { x: HILL.x - 6, z: HILL.z + 8 }, 4],
];
const at = (G, x, z) => ({ x, y: G.village?.world?.heightAt?.(x, z) || 0, z });

/** the village's places: its buildings (homes only when someone named lives there, or yours), boards, stalls, gates,
 *  gathering spots and landmarks */
export function places(G) {
  const out = [], sim = G.sim, W = G.village?.world; if (!sim || !W) return out;
  const nameOf = id => G.story?.nameOf?.(id) || id, hero = G.heroes?.name?.(G.state.activeHero || 'chewy') || 'Chewy';
  for (const r of sim.list) {
    const b = r.data, def = BUILDINGS[b.type], ic = B_ICON[b.type]; if (!def || !ic) continue;
    if (b.type === 'home' && !b.owner) continue;
    if ((b.type === 'park' || b.type === 'waterTower' || b.type === 'fountain') && !b.plot && b.type !== 'fountain') continue;
    let name = def.name, sub = '';
    if (b.type === 'chewyHouse') { name = 'Your cottage'; sub = `${hero}'s home · the stash, the bed, the stove`; }
    else if (b.type === 'home') { name = `${nameOf(b.owner)}'s home`; sub = variantName(b); }
    else if (b.type === 'shop') { name = b.owner ? `${nameOf(b.owner)}'s ${variantName(b)}` : variantName(b); sub = 'A shop on the high street'; }
    else if (b.type === 'rosieShop') sub = 'Treats, potions and quests';
    else if (b.type === 'townHall') sub = 'The village ledger';
    else if (b.type === 'dungeonGate') sub = densLine(G.state);
    else if (b.type === 'guild') { name = variantName(b); sub = 'Old Hachi signs on hires'; }
    else if (b.type === 'boneSmith') sub = 'Reforge, sockets, upgrades';
    else if (b.type === 'bulletinBoard') { name = 'Notice Board'; sub = 'Requests from the villagers'; }
    else if (b.type === 'fountain') { name = 'Plaza Fountain'; sub = 'The heart of the plaza'; }
    else if (b.type === 'stashChest') { name = 'Stash Chest'; sub = 'The shared stash · every chest opens it'; }
    else sub = def.desc?.split(/[.!—]/)[0] || '';
    const d = r.door || { x: b.x + 1, z: b.z + 1 };
    out.push({ key: `b:${b.id || b.type + b.x + '_' + b.z}`, kind: 'place', cat: ic[1], id: b.type, name, sub, icon: ic[0], color: b.type === 'chewyHouse' ? '#ff5c8a' : CAT_COLOR[ic[1]], pos: at(G, d.x, d.z), prio: PRIO[b.type] || 3, b, mine: b.type === 'chewyHouse', area: 'village', twin: TWINS.has(b.type) ? b.type : null });
  }
  for (const it of W.interactables || []) {
    if (!it?.label || !it.pos || it.pos.x < -100) continue;
    const S = SPOTS.find(s => s[0].test(it.label)); if (!S) continue;
    if (out.some(p => p.name === S[1])) continue;
    const m = it.label.match(S[0]), o = S[6] && typeof S[6] === 'object' ? S[6] : null;
    out.push({ key: `x:${S[1]}`, kind: 'place', cat: S[4], id: S[1], name: S[1], sub: S[2].replace('$1', m?.[1] || 'the dungeon'), icon: S[3], color: o?.color || CAT_COLOR[S[4]], pos: it.pos, prio: S[5], cozy: S[6] === true, portal: !!o?.portal, area: 'village' });
  }
  // the gathering nodes (full ones), and the named landmarks
  let nodes = []; try { nodes = G.mode === 'village' ? G.cozy?.scav?.nodes?.() || [] : []; } catch (e) { nodes = []; }
  for (const n of nodes) if (!n.taken) out.push({ key: `n:${n.id}`, kind: 'place', cat: 'gather', id: n.kind, name: NODE_NAME[n.kind] || 'Gather spot', sub: 'Gather it', icon: n.kind === 'driftwood' ? 'wood' : n.kind === 'riverStone' ? 'stone' : n.kind === 'mulberry' ? 'silk' : 'petal', color: CAT_COLOR.gather, pos: at(G, n.x, n.z), prio: 2, node: true, area: 'village' });
  for (const [id, name, sub, icon, cat, p, prio] of LANDMARK_PLACES) out.push({ key: `l:${id}`, kind: 'place', cat, id, name, sub, icon, color: CAT_COLOR[cat], pos: at(G, p.x, p.z), prio, landmark: true, area: 'village' });
  return out;
}

/** the Burrow door's line: its dens (state.dungeon.dens, rpg/dens.js; read only), how many are cleared and the one to try
 *  next (the first not cleared: each opens once the one before it is) */
export function densLine(state) {
  const R = state?.dungeon?.dens || {}, cleared = id => (R[id]?.cleared || 0) > 0 || (R[id]?.crew || 0) > 0;
  const n = DEN_IDS.length, done = DEN_IDS.filter(cleared).length;
  if (!done) return `${n === 4 ? 'Four' : n} dens: pick one at the door`;
  if (done >= n) return `All ${n} dens cleared`;
  const next = DEN_IDS.find((id, i) => !cleared(id) && (i === 0 || cleared(DEN_IDS[i - 1])));
  return `Dens cleared: ${done} of ${n}${next ? ` · next, ${theDen(next)}` : ''}`;
}
/** where a spot is, in words: by a place, on a street, in a district, or out on the island */
export function whereText(G, x, z, placesList = null) {
  let best = null, bd = 7;
  for (const p of placesList || []) { if (p.node || !p.pos) continue; const d = Math.hypot(p.pos.x - x, p.pos.z - z) - (p.landmark ? 3 : 0); if (d < bd) { bd = d; best = p; } }
  if (best) return best.mine ? 'by your cottage' : `by ${best.landmark && !/^The /.test(best.name) ? 'the ' : ''}${best.name.replace(/^The /, 'the ')}`;
  const s = nearestOnStreets(x, z); if (s && s.d < 2.2) return `on ${s.street.name}`;
  const pl = plotAt(Math.floor(x), Math.floor(z)); if (pl && DISTRICTS[pl.district]) return `in ${DISTRICTS[pl.district].name}`;
  let dn = null, dd = 26; for (const D of Object.values(DISTRICTS)) { const d = Math.hypot(D.label[0] - x, D.label[1] - z); if (d < dd) { dd = d; dn = D; } }
  if (dn) return `near ${dn.name}`;
  if (z > 186) return 'down by the sea';
  if (Math.hypot(x - BAMBOO.x, z - BAMBOO.z) < BAMBOO.r) return 'in the bamboo';
  if (z < 56) return 'up by the cliffs';
  return x < WORLD / 2 ? 'out in the west' : 'out in the east';
}
/** a person's whereabouts now (indoors at their home, visiting, away with a crew, or where they stand) */
export function personWhere(G, e, placesList) {
  if (e.area && e.area !== 'village') return hereWhere(G, e, placesList); // (a zone villager, a guest in the room)
  const w = whereNow(G, e, placesList);
  return G.mode === 'village' || e.you || e.shadow || e.away || !w ? w : `In Blossom Hollow · ${w}`; // (seen from a zone, a dungeon or a room)
}
/** someone in the area you're in (not the village): by the nearest of its places, else where the area is */
function hereWhere(G, e, placesList) {
  if (!e.pos) return '';
  if (e.npc?.visible === false) return 'Indoors';
  let best = null, bd = 9;
  for (const p of placesList || []) { if (p.node || !p.pos || p.area !== e.area) continue; const d = Math.hypot(p.pos.x - e.pos.x, p.pos.z - e.pos.z); if (d < bd) { bd = d; best = p; } }
  if (best) return `by ${best.landmark ? '' : 'the '}${best.name.replace(/^The /, '')}`.replace('by the the ', 'by the ');
  return G.mode === 'interior' ? 'In the room' : 'Out on the trail';
}
function whereNow(G, e, placesList) {
  if (e.away) return 'Away with a crew';
  if (e.you) return G.mode === 'village' ? `You · ${whereText(G, e.pos.x, e.pos.z, placesList)}` : 'You';
  if (e.hosted) return 'Visiting your cottage';
  const n = e.npc;
  if (n && n.visible === false) {
    if (n.state === 'inside' && n.act?.slot?.kind) return `In the ${n.act.slot.kind === 'onsen' ? 'Hot Spring' : n.act.slot.kind}`;
    const rec = n.homeRec, name = rec ? G.housing?.houseName?.(rec.data) : null;
    return name ? `Indoors at ${name}` : 'Indoors';
  }
  if (!e.pos) return '';
  return whereText(G, e.pos.x, e.pos.z, placesList);
}
/** the spot a pin on this person points at now: themselves, or their door while they're indoors */
export function personSpot(G, e) {
  const n = e.npc;
  if (n && n.visible === false) { const d = n.homeRec?.door || n.homeInfo?.door || n.home; if (d) return { x: d.x, y: d.y || 0, z: d.z }; }
  return e.pos;
}
/** a mark's tooltip words: { title, text } (the name; what they do or what it is; where they are and how far) */
export function tipFor(G, e, placesList) {
  if (!e) return null;
  const P = (e.area ? e.area === areaKey(G) : G.mode === 'village') ? G.player?.pos : null, far = p => (P && p ? ` · ${Math.round(Math.hypot(p.x - P.x, p.z - P.z))} m` : ''); // (how far: in the same world only)
  if (e.kind === 'person') {
    if (e.shadow) return { title: e.name, text: 'Your pup · he can lead the way' };
    const w = personWhere(G, e, placesList);
    return { title: e.name, text: `${e.role}${e.badge === '!' ? ' · has something for you' : e.badge === '?' ? ' · on their quest' : e.badge === 'gift' ? ' · a gift for you' : ''}<br>${w}${e.visible ? far(e.pos) : ''}` };
  }
  if (e.kind === 'quest') return { title: e.name, text: e.sub || 'Your quest' };
  return { title: e.name, text: `${e.sub || ''}${far(e.pos)}` };
}

// ------------------------------------------------------------------ the other areas (checkpoint 2: zones, dungeon floors, rooms)
/** where the hero is, as a pin's area: 'village', 'zone:<id>', 'dun:<dungeon>:<floor>', 'room:<building id>' */
export function areaKey(G) {
  if (G.mode === 'village') return 'village';
  if (G.mode === 'interior') return `room:${G.housing?.rec?.data?.id || G.housing?.rec?.data?.type || 'home'}`;
  const D = G.dungeon; if (!D) return G.mode || '';
  return D.isRegion ? `zone:${D.zoneId || D.regionId || D.region?.id || ''}` : `dun:${D.def?.id || 'burrow'}:${D.floor ?? ''}`;
}
const ZROLE = { elder: 'The village elder', shopkeeper: 'Shopkeeper', innkeeper: 'Innkeeper', cook: 'Cook', sensei: 'Sensei', craftsman: 'Craftsman', teaMaster: 'Tea master',
  farmer: 'Farmer', apprentice: 'Apprentice', fishmonger: 'Fishmonger', boatwright: 'Boatwright', deckhand: 'Deckhand', bathkeeper: 'Bath keeper', smith: 'Smith' };
/** a zone village's people (out in their village while you're in their zone) */
export function zonePeople(G, mode) {
  const V = mode?.village, out = []; if (!V?.villagers) return out;
  const area = areaKey(G), vname = V.def?.name || 'the village';
  for (const v of Object.values(V.villagers)) {
    if (!v?.pos || v.alive === false) continue;
    const def = v.def || {}, keep = (V.buildings || []).find(b => b.keeper === v.id);
    let badge = null; try { badge = G.story?.markerFor?.(v.id) || null; } catch (e) { badge = null; }
    const name = v.name || def.name || 'Villager';
    out.push({ key: `z:${v.id}`, kind: 'person', group: badge === '!' || badge === '?' ? 'quest' : keep ? 'shop' : 'zone', id: v.id, name, role: keep ? keep.name : `${ZROLE[def.role] || 'Villager'} · ${vname}`,
      color: v.spec?.outfit?.topColor || v.spec?.outfit?.scarf || v.spec?.fur || '#8fd0ff', initial: name[0].toUpperCase(), npc: v, pos: v.pos, visible: v.visible !== false, badge, prio: badge ? 8 : 5, named: true, area, zone: true });
  }
  return out;
}
// the interactables a zone, a dungeon floor or a room names (a label's start → the place); '$1' is the label's catch
const HERE = [
  [/^Open golden chest/, 'Golden chest', 'Treasure', 'chest', 'gather', 6, { seen: true, gold: true }],
  [/^Open chest/, 'Chest', 'Treasure', 'chest', 'gather', 4, { seen: true }],
  [/^Return to Blossom Hollow/, 'Portal home', 'Back to Blossom Hollow', 'draw:portal', 'gate', 9],
  [/^Return to the (.+)$/, 'The way out', 'Back to the $1', 'draw:portal', 'gate', 9],
  [/^Use Waypoint/, 'Waypoint', 'Come back to this floor', 'torii', 'service', 7],
  [/^Open the (?:treasure|Lantern) chest/, 'Treasure chest', "The boss's treasure", 'chest', 'gather', 7, { gold: true, notRoom: true }],
  [/^Touch the Wayfarer's Stone/, "Wayfarer's Stone", 'Home, or the Travel Map', 'map', 'gate', 9],
  [/^Burrow deeper|^Go deeper|^Down to/i, 'Stairs down', 'To the next floor', 'draw:stairs', 'gate', 9, { seen: true }],
  [/^Enter the (.+Dojo)$/, '$1', 'Training', 'swords', 'service', 6],
  [/^Enter (.+)$/, '$1', 'The dungeon', 'oni', 'gate', 8],
  [/^Touch the Waypoint Shrine/, 'Waypoint Shrine', 'Travel between waypoints', 'torii', 'service', 6],
  [/^Touch (.+)$/, '$1', 'A blessing for the run', 'sparkle', 'service', 6, { seen: true }],
  [/^Cook at the campfire/, 'Campfire', 'Cook a meal here', 'fire', 'service', 5],
  [/^Read the Sightings board/, 'Sightings board', "Today's sightings", 'eye', 'board', 6],
  [/^Spirit Lantern/, 'Spirit Lantern', 'The tiers', 'lantern', 'service', 5],
  [/^Shop at (.+)$/, '$1', 'A shop', 'shop', 'shop', 7],
  [/^Browse (?:the )?(.+)$/, '$1', 'A shop', 'shop', 'shop', 7],
  [/^Rest at (?:the )?(.+)$/, '$1', 'Rest a while', 'heart', 'service', 6],
  [/^Knock at (.+)$/, '$1', 'A home', 'home', 'home', 5],
  [/^Clap at the (.+)$/, 'The $1', 'An old shrine in the wilds', 'torii', 'landmark', 4],
  [/^Rest by the (.+)$/, 'The $1', 'A quiet spot', 'drop', 'landmark', 4],
  [/^(?:Gather|Pick up|Collect|Forage)(?: the)? ?(.*)$/, '$1', 'Gather it', 'leaf', 'gather', 2, { node: true }],
  [/^Sleep/, 'The bed', 'Sleep until morning', 'moon', 'service', 7],
  [/^Open the treasure chest/, 'The stash', 'Your treasure chest', 'chest', 'service', 7, { room: true }],
  [/^Cook something/, 'The kitchen', 'Cook a meal', 'fire', 'service', 7],
  [/^Use the workbench/, 'The workbench', 'Craft and fix', 'craft', 'service', 7],
  [/^Go outside/, 'The door', 'Back outside', 'door', 'gate', 9],
];
const cap = t => (t ? t[0].toUpperCase() + t.slice(1) : t);
/** the places of the world you're in now (a zone, a dungeon floor, a room): its interactables by their label, and the
 *  layout's own (a zone's village, wild areas and the boss's clearing; a floor's boss room and waypoint). seen(x, z):
 *  the fog's (a chest, the stairs, a shrine or the boss room show once seen) */
export function herePlaces(G, mode, seen = null) {
  const out = [], W = G.world, area = areaKey(G), L = mode?.layout, ok = (p, o) => !o?.seen || !seen || seen(p.x, p.z);
  for (const it of W?.interactables || []) {
    if (!it?.label || !it.pos || it.pos.x < -100) continue;
    const room = G.mode === 'interior', S = HERE.find(s => s[0].test(it.label) && !(s[6]?.room && !room) && !(s[6]?.notRoom && room)); if (!S) continue;
    const m = it.label.match(S[0]), c1 = (m?.[1] || '').trim(), name = cap(S[1].replace('$1', c1) || 'Gather spot');
    if (!ok(it.pos, S[6])) continue;
    out.push({ key: `h:${S[1] === '$1' ? name : S[1]}:${Math.round(it.pos.x)},${Math.round(it.pos.z)}`, kind: 'place', cat: S[4], id: name, name, sub: S[2].replace('$1', c1), icon: S[3], color: S[6]?.gold ? '#f4c04a' : CAT_COLOR[S[4]], pos: it.pos, prio: S[5], area, node: !!S[6]?.node });
  }
  if (mode?.isRegion && L) {
    const V = mode.village;
    if (V?.site) out.push({ key: 'l:zoneVillage', kind: 'place', cat: 'landmark', id: 'village', name: V.def?.name || 'The village', sub: V.def?.sub || 'The zone village', icon: 'home', color: CAT_COLOR.landmark, pos: { x: V.site.x, y: 0, z: V.site.z }, prio: 7, area, landmark: true });
    for (const a of L.wild || []) out.push({ key: `w:${a.name}`, kind: 'place', cat: 'wild', id: a.name, name: cap(a.name), sub: 'A wild area: its yokai stay inside', icon: 'draw:claw', color: '#8a56d8', pos: { x: a.entry?.[0] ?? a.x, y: 0, z: a.entry?.[1] ?? a.z }, prio: 6, area, wild: true });
    const A = L.arena; if (A && (!seen || seen(A.x, A.z))) out.push({ key: 'l:arena', kind: 'place', cat: 'gate', id: 'arena', name: "The boss's clearing", sub: mode.boss?.alive ? mode.boss.name || 'The boss' : 'Quiet now', icon: 'skull', color: '#e8506e', pos: { x: A.x, y: 0, z: A.z }, prio: 7, area });
  }
  if (L && !mode?.isRegion && G.mode === 'dungeon') { // (an opened chest, a used shrine: their interactables are gone, the map keeps them, dimmed)
    const CELL = 2, live = out.filter(p => p.icon === 'chest' || p.icon === 'sparkle');
    for (const [list, icon, name, sub, cat] of [[L.chests, 'chest', 'Chest (opened)', 'Already opened', 'gather'], [L.shrines, 'sparkle', 'Shrine (used)', 'Its blessing is spent', 'service']]) for (const c of list || []) {
      const x = (c.x + 0.5) * CELL, z = (c.y + 0.5) * CELL; if (seen && !seen(x, z)) continue;
      if (live.some(p => p.icon === icon && Math.hypot(p.pos.x - x, p.pos.z - z) < 2.6)) continue;
      out.push({ key: `o:${icon}:${c.x},${c.y}`, kind: 'place', cat, id: name, name, sub, icon, color: '#a89c94', pos: { x, y: 0, z }, prio: 2, area, dim: true });
    }
  }
  if (L && !mode?.isRegion) {
    const CELL = 2, B = L.bossRoom; if (B && (!seen || seen((B.cx + 0.5) * CELL, (B.cy + 0.5) * CELL))) out.push({ key: 'l:boss', kind: 'place', cat: 'gate', id: 'boss', name: mode.boss?.name || 'The boss', sub: mode.boss?.alive ? 'Its room' : 'Beaten', icon: 'skull', color: '#e8506e', pos: { x: (B.cx + 0.5) * CELL, y: 0, z: (B.cy + 0.5) * CELL }, prio: 8, area });
    const wp = L.waypoint; if (wp && !out.some(p => p.icon === 'torii' && p.cat === 'service') && (!seen || seen((wp.x + 0.5) * CELL, (wp.y + 0.5) * CELL))) out.push({ key: 'l:waypoint', kind: 'place', cat: 'service', id: 'waypoint', name: 'Waypoint', sub: 'Come back to this floor', icon: 'torii', color: '#5ec8b0', pos: { x: (wp.x + 0.5) * CELL, y: 0, z: (wp.y + 0.5) * CELL }, prio: 7, area });
  }
  return out;
}
