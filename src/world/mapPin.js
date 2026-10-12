// The map pin (ROADMAP UX-1, docs/MAP.md): picking a person or a place on the big map pins them, and the pin becomes
// G.questTarget's answer (after a guide's step), so the quest arrow, the minimap's edge pin and Shadow all point at it.
// A person's pin follows them as they walk (their door while they're indoors). Away from where the pin is (indoors, in
// a zone or a dungeon) it points at the way back: the door mat, the Wayfarer's Stone, the way out. It clears itself
// when you get there (a little toast), when you pin something else, or with Unpin; a quest the Journal or the tracker
// asks Shadow to follow takes over from it.
//   G.mapPin.set(entry) · clear(why) · cur { key, label, kind, area, entry } · target() · lead() ("Shadow, take me there")
import { Events } from '../core/events.js';
import { people, places, personSpot, areaKey } from './mapData.js';
import { registerDebug } from '../debug/registry.js';

const ARRIVE = 3.0, ARRIVE_NPC = 2.4, ARM = 4.5; // m: you're there; you have to have been this far off first

export class MapPin {
  constructor(G) { this.G = G; this.cur = null; this._t = 0; }
  /** pin a directory entry (a person or a place); → the pin */
  set(e) {
    if (!e || e.away || (!e.pos && !e.npc)) return null;
    const G = this.G, P = G.player?.pos;
    this.cur = { key: e.key, label: e.name, kind: e.kind, area: e.area || 'village', entry: e, armed: !P || !e.pos || Math.hypot(P.x - e.pos.x, P.z - e.pos.z) > ARM, at: performance.now() };
    if (G.lead?.focus) G.lead.focus = null; // (the Journal's Follow Shadow gives way to the pin)
    Events.emit('map:pin', { key: e.key, label: e.name });
    return this.cur;
  }
  clear(why = 'unpin') {
    if (!this.cur) return;
    const c = this.cur; this.cur = null;
    Events.emit('map:unpin', { key: c.key, why });
  }
  /** is this entry the one pinned? */
  is(key) { return !!this.cur && this.cur.key === key; }
  /** the entry again from the live lists (a person's record can be replaced: a townsfolk who moved out) */
  fresh() {
    const c = this.cur; if (!c) return null;
    const e = c.entry;
    if (e.kind === 'person' && e.area === 'village' && e.npc && !(this.G.npcs || []).includes(e.npc) && !e.you && !e.shadow) {
      const n = people(this.G).find(p => p.key === c.key); if (!n) { this.clear('gone'); return null; } c.entry = n;
    }
    if (e.kind === 'place' && e.portal && !this.G.townPortal?.village) { this.clear('gone'); return null; } // (the Town Portal closed)
    if (e.kind === 'place' && e.b && !this.G.sim?.list.some(r => r.data === e.b)) {
      const n = places(this.G).find(p => p.key === c.key); if (!n) { this.clear('gone'); return null; } c.entry = n;
    }
    return c.entry;
  }
  /** G.questTarget's answer while pinned: { pos, label, kind, pin, icon } (or the way to where the pin is) */
  target() {
    const G = this.G, c = this.cur; if (!c || G.titleActive || G.playerDead) return null;
    const e = this.fresh(); if (!e) return null;
    const tag = (pos, label, kind) => (pos ? { pos, label, kind, pin: c.key, icon: 'pin', lead: false } : null);
    if (c.area !== 'village') { // (a zone's, a floor's or a room's own: only while you're there; tick lets it go when you leave)
      if (c.area !== areaKey(G)) return null;
      return tag(e.npc ? e.npc.pos : e.pos, e.name, e.kind === 'person' ? 'npc' : 'place');
    }
    {
      if (G.mode === 'village') {
        const pos = e.kind === 'person' ? personSpot(G, e) : e.pos;
        const label = e.kind === 'person' && e.npc && e.npc.visible === false ? `${e.name} (indoors)` : e.name;
        return tag(pos, label, e.kind === 'person' ? 'npc' : 'place');
      }
      if (G.mode === 'interior') {
        const H = G.housing, guest = e.npc && H?.hosts?.includes(e.npc);
        if (guest) return tag(e.npc.pos, e.name, 'npc');
        return tag(H?.world?.doorMatPos, `Outside · ${e.name}`, 'place');
      }
      const D = G.mode === 'dungeon' ? G.dungeon : null;
      return D?.exitPos ? tag(D.exitPos, `${D.kind === 'region' ? "The Wayfarer's Stone" : 'The way out'} · ${e.name}`, 'place') : null;
    }
    return null;
  }
  /** a few times a second: you got there */
  tick(dt) {
    const c = this.cur; if (!c || (this._t -= dt) > 0) return;
    this._t = 0.25;
    const G = this.G, here = areaKey(G);
    if (c.area !== 'village' && c.area !== here) { this.clear('left'); return; } // (you left that zone, floor or room)
    if (c.area === 'village' && G.mode !== 'village') return;
    const t = this.target(), P = G.player?.pos; if (!t?.pos || !P) return;
    const d = Math.hypot(t.pos.x - P.x, t.pos.z - P.z);
    if (!c.armed) { if (d > ARM) c.armed = true; return; }
    if (d < (c.kind === 'person' ? ARRIVE_NPC : ARRIVE)) {
      G.ui?.toast?.(c.kind === 'person' ? `You found ${c.label}!` : `You're at ${c.label}`, { icon: 'pin', color: '#ff8fb0' });
      this.clear('arrived');
    }
  }
  /** "Shadow, take me there": he leads the way to the pin now, at any Settings › Shadow leads the way (again: he stops) */
  lead() { const L = this.G.lead; if (!L || !this.cur) return false; return L.toPin ? L.toPin() : L.toggle(); }
}

/** game.js, after Shadow's lead is installed: G.mapPin, and G.questTarget answering with the pin (a guide's step first) */
export function installMapPin(G) {
  const pin = G.mapPin = new MapPin(G);
  const base = G.questTarget;
  if (base && !base.__pin) {
    G.questTarget = () => { const g = G.tutorials?.target?.(); if (g) return base(); const t = pin.cur ? pin.target() : null; return t || base(); };
    G.questTarget.__pin = true; G.questTarget.__lead = base.__lead;
    G.questTarget.base = base; // (the objective under the pin: the maps still star it)
  }
  // the Town Portal's other end comes and goes (dungeon/townPortal.js): the lists again at once, its pin let go with it
  Events.on('portal:village', ({ on } = {}) => {
    for (const P of [G.villageMinimap, G.ui?.hud?.mm?.provider]) if (P) P._LT = 0;
    if (!on && pin.cur?.entry?.portal) pin.clear('gone');
  });
  registerDebug('village', [
    { group: 'The maps (UX-1)', label: 'Pin Rosie', run: G => { const e = people(G).find(p => p.id === 'rosie'); return e && G.mapPin.set(e) ? 'Pinned Rosie' : 'No Rosie here'; } },
    { label: 'Pin the farthest place', run: G => { const P = G.player.pos, L = places(G).filter(p => p.pos && !p.node).sort((a, b) => Math.hypot(b.pos.x - P.x, b.pos.z - P.z) - Math.hypot(a.pos.x - P.x, a.pos.z - P.z)); return L[0] && G.mapPin.set(L[0]) ? `Pinned ${L[0].name}` : 'Nothing to pin'; } },
    { label: 'Clear the pin', run: G => { G.mapPin.clear('debug'); return 'Pin cleared'; } },
    { label: 'Repaint the village map', run: G => { const V = G.villageMinimap; if (!V) return 'No village map'; V.art.tHash = -1; V.rebuild(); return `Painted: terrain ${V.art.stats.terrainMs} ms, composite ${V.art.stats.compositeMs} ms`; } },
    { label: 'Map timings', run: G => { const V = G.villageMinimap, s = V?.stats; return s ? `The disc: ${s.draws} draws, ${(s.ms / Math.max(1, s.draws)).toFixed(3)} ms avg (${s.maxMs.toFixed(1)} max); art: terrain ${V.art.stats.terrainMs} ms, composite ${V.art.stats.compositeMs} ms, ${V.art.stats.builds} builds` : 'No village map'; } },
  ]);
  return pin;
}
