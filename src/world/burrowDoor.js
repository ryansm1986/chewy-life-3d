// The Burrow door in Blossom Hollow and its four dens (docs/ZONES.md §4.1; ROADMAP Z-H1, the owner's pick 2026-10-11):
// what the door's picker (ui/dens.js, the 'burrow' panel) reads and does, through G.burrow, so the panel never imports
// world code; and the dens' debug rows (the Dens tab: docs/DEBUG.md).
//   G.burrow.list()        one card per den, in order: its name, blurb, band, boss, yokai, colours, open / cleared, why
//                          it's locked, the story quest that points into it
//   G.burrow.open(opts)    the picker (opts.select: a den id to show first); the Burrow door's F calls it
//   G.burrow.enter(id)     into that den's floor 1 (an open den only) → true
// The records and the rule (the Mossy Burrow open from the start, each next den once the one before is cleared) are
// rpg/dens.js; the floors are dungeon/defs.js floorPlan + gen.js.
import { DUNGEONS, DEN_IDS, theDen } from '../dungeon/defs.js';
import { THEMES } from '../dungeon/gen.js';
import { MONSTERS } from '../dungeon/monsters.js';
import { denRecord, denOpen, denCleared, prevDen, deepestOpenDen, migrateBurrowDens, recordDenClear, OLD_BOSS_FLOOR } from '../rpg/dens.js';
import { tierRecord } from '../rpg/zones.js';
import { registerDebug } from '../debug/registry.js';
import { Events } from '../core/events.js';

/** the bosses as the cards and the locked lines say them */
export const BOSS_SHORT = { mochiKing: 'King Mochi', kasaLord: 'Lord Karakasa', oniChef: 'Oni Chef Gorobei', nineTails: 'Tamamo' };
/** each den's line on its card, and the glyph on its pin */
const DEN_CARD = {
  mossyBurrow: { blurb: 'Soft moss, fairy rings and squeaky mochi. King Mochi holds court in the deepest hollow.', icon: 'mochi' },
  foxShrine: { blurb: 'Vermilion gates and hopping paper umbrellas. Lord Karakasa waits beneath the great torii.', icon: 'torii' },
  oniKitchen: { blurb: 'Bubbling pots and stolen dumplings. Gorobei guards his kitchen, cleaver in hand.', icon: 'fire' },
  moonSanctum: { blurb: 'Crystal caves wind down to a moonlit fox shrine, where Tamamo of the nine tails stirs.', icon: 'moon' },
};

export function installBurrowDoor(G) {
  const st = () => G.state;
  const card = (id, i) => {
    const d = DUNGEONS[id], r = denRecord(st(), id), open = denOpen(st(), id), p = prevDen(id), hero = st().player?.lvl || 1;
    const lv = [d.levels[0], d.levels[1] + d.floors - 1]; // (floor 1 at the band, the last floor one more a floor: the monsters' whole range)
    const fit = hero < lv[0] - 1 ? 'hard' : hero > lv[1] + 2 ? 'easy' : 'good';
    const kinds = [...new Set([...(d.themes || [d.theme])].reverse().flatMap(t => THEMES[t]?.monsters || []))].map(k => MONSTERS[k]?.name).filter(Boolean).slice(0, 4); // (the boss floor's first, at most four)
    const T = THEMES[d.themes?.[d.floors - 1] || d.theme] || {}, T0 = THEMES[d.themes?.[0] || d.theme] || {};
    const q = (st().quests?.active || []).find(x => x.id === d.quest || (i === 0 && x.id === 'burrow1'));
    const qd = q && G.story?.def?.(q.id), qs = qd?.steps?.[q.step];
    return {
      id, n: i + 1, name: d.name, the: theDen(id), blurb: DEN_CARD[id]?.blurb || '', icon: DEN_CARD[id]?.icon || 'paw', floors: d.floors,
      levels: lv, hero, fit, boss: MONSTERS[d.boss]?.name || d.boss, bossShort: BOSS_SHORT[d.boss] || MONSTERS[d.boss]?.name || '', monsters: kinds,
      colors: { floor: T0.floor?.[0], wall: T0.wall?.[0], top: T0.top?.[0], accent: T.accent, light: T.light, fog: T.fog, floor2: T.floor?.[0], wall2: T.wall?.[0], top2: T.top?.[2] || T.top?.[0] },
      open, cleared: r.cleared, crew: r.crew, bestFloor: r.bestFloor, done: r.cleared > 0 || r.crew > 0,
      why: open ? null : `Beat ${BOSS_SHORT[DUNGEONS[p].boss] || 'the boss'} in ${theDen(p)} to open it`,
      quest: qd && qs ? { title: qd.title, text: qs.text } : null,
      deep: id === DEN_IDS[DEN_IDS.length - 1] ? { lit: (tierRecord(st(), 'burrowDeep')?.tier.unlocked || 0) > 0 } : null,
    };
  };
  G.burrow = {
    list: () => DEN_IDS.map(card),
    /** the den the picker shows first: one with a story quest pointing into it, else the deepest open one not yet cleared */
    pick() { const L = this.list(); return (L.find(c => c.open && c.quest) || L.slice().reverse().find(c => c.open && !c.done) || L.find(c => c.id === deepestOpenDen(st())) || L[0]).id; },
    open(opts = {}) {
      if (G.mode !== 'village') return false;
      if (!G.ui?.open) return this.enter(deepestOpenDen(st()));
      G.ui.open('burrow', { select: opts.select || this.pick() });
      return true;
    },
    enter(id) {
      if (!DUNGEONS[id] || DUNGEONS[id].kind !== 'burrow' || !denOpen(st(), id)) { G.ui?.sfx?.('deny'); return false; }
      G.ui?.close?.('burrow', true);
      G.audio?.play?.('portal');
      G.enterDungeon({ id, floor: 1 });
      return true;
    },
  };
  Events.on('den:opened', () => G.ui?.panels?.burrow?.refresh?.());

  // the Dens tab of the debug menu (docs/DEBUG.md)
  const name = id => DUNGEONS[id].name;
  const clearTo = (G, k) => { const s = G.state; for (let i = 0; i <= k; i++) if (!denCleared(s, DEN_IDS[i])) recordDenClear(s, DEN_IDS[i]); tierRecord(s, 'burrowDeep'); G.burrowLantern?.refresh?.(); Events.emit('quest:update'); G.save?.(); };
  registerDebug('dens', [
    { label: 'Clear the dens up to', hint: 'Each one beaten once, so the next opens (the Moonlit Sanctum also wakes the Deep Burrow)', choices: DEN_IDS.map((id, k) => ({ label: name(id), value: k })), run: (G, k) => { clearTo(G, k); return `Cleared: ${DEN_IDS.slice(0, k + 1).map(name).join(', ')}`; } },
    { label: 'Reset the dens', confirm: true, hint: 'Only the Mossy Burrow open, nothing cleared (the quests stay as they are)', run: G => { const D = G.state.dungeon; D.dens = {}; D.deepest = 0; Events.emit('quest:update'); G.save?.(); return 'The dens are fresh: only the Mossy Burrow is open'; } },
    { label: 'Migrate an old save', hint: 'The endless Burrow\'s deepest floor → the dens (rpg/dens.js); the dens are reset first', choices: [3, 5, 6, 9, 12, 15, 20, 21, 25].map(n => ({ label: `Floor ${n}`, value: n })),
      run: (G, n) => { const D = G.state.dungeon; D.dens = {}; D.deepest = n; migrateBurrowDens(G.state); tierRecord(G.state, 'burrowDeep'); G.burrowLantern?.refresh?.(); Events.emit('quest:update'); G.save?.(); const L = G.burrow.list(); return `Floor ${n}: ${L.map(c => `${c.name} ${c.done ? 'cleared' : c.open ? `open (floor ${c.bestFloor})` : 'locked'}`).join(' · ')}`; } },
    { label: 'The door\'s picker', closes: true, run: G => (G.burrow.open() ? 'The Burrow door' : 'Only in Blossom Hollow') },
    { note: `Old floors → dens: 1–5 the Mossy Burrow, 6–10 the Fox Shrine, 11–15 Oni's Kitchen, 16–20 the Moonlit Sanctum. A den is cleared once the old save got past its boss floor (${Object.values(OLD_BOSS_FLOOR).map(f => f + 1).join(', ')}) or its quest is done; at the boss floor itself, floor 2 is reached and the boss still waits.` },
  ], { title: 'Dens', icon: 'torii', order: 22 });
  return G.burrow;
}
