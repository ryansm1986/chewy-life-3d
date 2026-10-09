// The peaceful overworld's runtime glue (docs/COZY.md §6; ROADMAP CZ-3 / CZ-4): G.peaceful, the Sightings board's data
// and bounties, the boards (Blossom Hollow's beside the Expedition Board, every saved zone village's notice board), the
// wild areas for the scavenging (CZ-5's setWild), and the Cozy debug tab's "Peaceful zones and the wild" actions.
//   G.peaceful = {
//     isPeaceful(zone)            the zone spawns only its wild packs (cozy/peaceful.js isPeaceful)
//     wildAreas(zone)             its wild areas [{ id, name, jp, x, z, r, packs, entry }] (from the cached plan)
//     wildAt(zone, x, z, pad)     the area at a point, or null
//     override(zone, v)           the debug override (true / false / null), applied on the next visit
//     sightings(force)            today's sightings (re-rolled when the world day turns: cozy/sightings.js)
//     card(zone)                  the Travel Map card's rows: { wild: [names], peaceful, sightings: [...] }
//     renown()                    { n, title, next }
//     addSightings(layout, zone)  RegionMode.build: today's live sightings there join the spawns (tagged, kept)
//     claim(id, pos, mode)        a sighting's pack is down: the bounty (loot at pos), renown, 'sighting:cleared'
//   }
// The spawn rule itself runs in RegionMode.build; the leash, the entry toast and the bounty trigger in cozy/wildWorld.js.
import * as THREE from 'three';
import { REGIONS, REGION_IDS, regionUnlocked } from '../regions/index.js';
import { regionPlan, RCELL } from '../regions/layoutGen.js';
import { MONSTERS } from '../dungeon/monsters.js';
import { makeGem, GEM_TYPES } from '../rpg/items.js';
import { Events } from '../core/events.js';
import { mulberry32 } from '../core/util.js';
import { worldHours, worldDay } from './clock.js';
import { isPeaceful, wildAt, titled, wildLevel, setPeacefulOverride, peacefulOverride } from './peaceful.js';
import { sightingsOf, sightingsToday, clearSighting, renownTitle, nextTitle, KINDS, rollSightings } from './sightings.js';
import { addSightingsBoard } from './sightingsBoard.js';
import { registerDebug } from '../debug/registry.js';

/** a zone's wild areas from its (cached) plan */
export function zoneWild(zone) { const d = REGIONS[zone]; return d ? regionPlan(d).wild || [] : []; }
const hashStr = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

export function installPeaceful(G, village) {
  const st = () => G.state;
  const topLvl = () => { let n = st().player?.lvl || 1; for (const h of Object.values(st().heroes || {})) n = Math.max(n, h.player?.lvl || 1); return n; };
  const zonesInfo = () => REGION_IDS.filter(id => regionUnlocked(st(), id).ok).map(id => ({
    zone: id, areas: zoneWild(id).map(a => ({ id: a.id, name: a.name })), lvl: wildLevel(REGIONS[id].levels, topLvl()),
    monsters: REGIONS[id].monsters.filter(m => MONSTERS[m]).map(m => ({ id: m, name: MONSTERS[m].name })),
  }));
  const day = () => worldDay(worldHours(st()));
  const api = G.peaceful = {
    isPeaceful: zone => isPeaceful(st(), zone),
    wildAreas: zoneWild,
    wildAt: (zone, x, z, pad = 0) => wildAt(zoneWild(zone), x, z, pad),
    override: (zone, v) => setPeacefulOverride(zone, v),
    /** today's sightings (re-rolled when the world day turns, or forced) */
    sightings: (force = false) => sightingsToday(st(), day(), zonesInfo(), force),
    /** world hours until tomorrow's sightings */
    hoursLeft: () => (day() + 1) * 24 - worldHours(st()),
    renown: () => { const n = sightingsOf(st()).renown; return { n, title: renownTitle(n), next: nextTitle(n), total: sightingsOf(st()).total }; },
    card: zone => ({ wild: zoneWild(zone).map(a => a.name), peaceful: isPeaceful(st(), zone), sightings: api.sightings().filter(s => s.zone === zone) }),
    addSightings(layout, zone) {
      for (const s of api.sightings().filter(q => q.zone === zone && !q.done)) { const sp = sightingSpawn(layout, s, wildLevel(REGIONS[zone].levels, topLvl())); if (sp) layout.spawns.push(sp); }
    },
    claim(id, pos, mode) {
      const before = sightingsOf(st()).renown, s = clearSighting(st(), id); if (!s) return null;
      const R = api.renown(), B = s.bounty || {}, drops = [];
      if (B.coins) drops.push({ type: 'coins', n: B.coins });
      for (const [key, n] of Object.entries(B.mats || {})) if (n > 0) drops.push({ type: 'material', key, n });
      if (B.gem) { const r = mulberry32(hashStr(s.id)); drops.push({ type: 'gem', item: makeGem(GEM_TYPES[Math.floor(r() * GEM_TYPES.length)], s.lvl >= 40 ? 2 : s.lvl >= 20 ? 1 : 0) }); }
      if (mode?.loot && drops.length) { pos.y = mode.world.heightAt(pos.x, pos.z) + 0.3; G.vfx?.ring?.(pos, { color: '#ff6a6a', r0: 0.3, r1: 2.6, life: 0.6 }); G.vfx?.sparkle?.(pos.clone().setY(pos.y + 0.6), { n: 24, color: '#ffd0d0', r: 1, rise: 1.4 }); mode.loot.drop(pos, drops); }
      Events.emit('sighting:cleared', { id: s.id, zone: s.zone, area: s.area, kind: s.kind, name: s.name, renown: R.n, gained: s.renown });
      G.ui?.toast?.(`Bounty! ${s.name} is beaten`, { icon: 'star', color: '#ff8a8a', sub: `+${s.renown} renown · ${R.title}` });
      if (renownTitle(before) !== R.title) setTimeout(() => G.ui?.toast?.(`A new title: ${R.title}!`, { icon: 'star', color: '#ffd84a', sub: `${R.n} renown on the Sightings board` }), 1600);
      G.audio?.play?.('ui_quest');
      return s;
    },
  };
  // the scavenging (CZ-5) keeps its nodes out of the wild areas (it also reads the plan's 'wild' discs)
  G.cozy?.scav?.setWild?.((zone, x, z) => !!api.wildAt(zone, x, z, 2.5));
  // the boards: Blossom Hollow's by the Wayfarer's Post; a saved zone village's notice board (RegionMode → zoneBoard)
  if (village) api.board = addSightingsBoard(G, village);
  api.zoneBoard = mode => zoneBoard(G, mode);
  registerDebugActions(G, api, topLvl);
  return api;
}

/** a sighting's spawn in this visit's layout: a free cell inside its wild area, away from the other packs there */
function sightingSpawn(layout, s, lvl) {
  const a = (layout.wild || []).find(w => w.id === s.area); if (!a) return null;
  const r = mulberry32(hashStr(s.id + ':' + (layout.visit || 0))), others = layout.spawns.filter(p => p.wild === a.id);
  let cell = null;
  for (let i = 0; i < 40 && !cell; i++) {
    const t = r() * Math.PI * 2, d = Math.sqrt(r()) * (a.r - 3.5), x = a.x + Math.cos(t) * d, z = a.z + Math.sin(t) * d;
    const cx = Math.floor(x / RCELL), cy = Math.floor(z / RCELL);
    if (!layout.at(cx, cy) || others.some(p => Math.hypot(p.x - cx, p.y - cy) * RCELL < (i < 25 ? 5 : 3))) continue;
    cell = { x: cx, y: cy };
  }
  if (!cell) cell = others[0] ? { x: others[0].x, y: others[0].y } : null;
  if (!cell) return null;
  return { x: cell.x, y: cell.y, rank: KINDS[s.kind]?.rank || 'normal', count: s.count, lvl, wild: a.id, keep: true, sighting: s.id, sightingOf: s, monster: s.monster };
}

/** a saved zone village's notice board reads the Sightings too (docs/COZY.md §6.3) */
function zoneBoard(G, mode) {
  const v = mode.village; if (!v?.saved) return null;
  const sp = (v.decor?.spots || []).find(s => s.pose === 'read'); if (!sp) return null;
  const it = { pos: new THREE.Vector3(sp.x, mode.world.heightAt(sp.x, sp.z), sp.z), radius: 1.5, label: 'Read the Sightings board', onInteract: () => G.ui?.open?.('sightings', { at: mode.regionId }) };
  mode.world.interactables.push(it);
  return it;
}

function registerDebugActions(G, api, topLvl) {
  const here = () => (G.dungeon?.isRegion ? G.dungeon : null);
  const zoneChoices = () => REGION_IDS.map(id => ({ label: REGIONS[id].name.split(' ').slice(-2).join(' '), value: id }));
  registerDebug('cozy', [
    { group: 'Peaceful zones and the wild', label: 'Show wild areas', toggle: true, hint: 'Rings at each wild area and its leash, in a zone',
      get: () => !!G.dungeon?.wild?.debugOn, run: (G2, on) => { const D = here(); if (!D?.wild) return 'Go to a zone first (the Travel tab)'; D.wild.showDebug(on); return on ? `${D.layout.wild.length} wild areas: ${D.layout.wild.map(a => titled(a.name)).join(', ')}` : 'Wild rings hidden'; } },
    { label: 'Go to a wild area', hint: 'In a zone: to its entry posts', closes: true,
      choices: () => { const D = here(); return D ? D.layout.wild.map(a => ({ label: titled(a.name), value: a.id })) : [{ label: '(go to a zone first)', value: '' }]; },
      run: (G2, id) => { const D = here(), a = D?.layout.wild.find(w => w.id === id); if (!a) return 'Go to a zone first'; const P = G.player, [x, z] = a.entry; P.setPos(x, z); G.engine.rig.focus.copy(P.pos); G.engine.rig.snap?.(); G.companion?.setPos?.(x + 0.8, z + 0.6); return `At ${a.name}`; } },
    { label: 'Peaceful on a zone', hint: 'Session only; re-enters the zone if you are in it',
      fields: [{ key: 'zone', label: 'Zone', choices: zoneChoices, value: 'bamboo' }, { key: 'mode', label: 'Spawns', choices: [{ label: 'Follow the save', value: 'auto' }, { label: 'Peaceful', value: 'on' }, { label: 'Besieged', value: 'off' }], value: 'on' }], go: 'Apply',
      run: (G2, v) => {
        setPeacefulOverride(v.zone, v.mode === 'auto' ? null : v.mode === 'on');
        const o = peacefulOverride(v.zone), now = isPeaceful(G.state, v.zone);
        if (here()?.regionId === v.zone) setTimeout(() => G.enterRegion?.(v.zone), 50);
        return `${REGIONS[v.zone].name}: ${now ? 'peaceful (only the wild areas)' : 'every camp spawns'}${o == null ? ' (from the save)' : ''}`;
      } },
    { group: 'The Sightings board', label: 'Spawn a sighting here', hint: 'In a zone: posts one in a wild area and spawns it now',
      choices: Object.keys(KINDS).map(k => ({ label: KINDS[k].label, value: k })),
      run: (G2, kind) => {
        const D = here(); if (!D) return 'Go to a zone first (the Travel tab)';
        const z = D.regionId, info = { zone: z, areas: D.layout.wild.map(a => ({ id: a.id, name: a.name })), lvl: wildLevel(D.region.levels, topLvl()), monsters: D.roster().map(m => ({ id: m, name: MONSTERS[m]?.name || m })) };
        api.sightings(); const S = sightingsOf(G.state);
        let s = null; for (let k = 0; k < 12 && !s; k++) s = rollSightings(S.day * 31 + S.list.length * 7 + k + 1000, [info], 3).find(q => q.kind === kind) || null;
        if (!s) return 'No wild area here';
        s.id = `d${S.day}:dbg${S.list.length}`; s.day = S.day; S.list.push(s);
        const sp = sightingSpawn(D.layout, s, info.lvl); if (!sp) return 'No room in the wild area';
        const n0 = D.monsters.length; D.spawnPack(sp); const mons = D.monsters.slice(n0); D.wild.tag(mons, sp.wild); D.wild.sighting(s, mons);
        return `${s.line} (${mons.length} yokai)`;
      } },
    { label: 'Refresh the sightings', hint: "Re-rolls today's three", run: () => { const L = api.sightings(true); return L.length ? L.map(s => s.name).join(', ') : 'No zone is open yet'; } },
    { label: 'Add renown', choices: [{ label: '+3', value: 3 }, { label: '+10', value: 10 }], run: (G2, n) => { const S = sightingsOf(G.state); S.renown += n; return `${S.renown} renown: ${renownTitle(S.renown)}`; } },
  ], { title: 'Cozy', icon: 'leaf', order: 90 });
}
