// Scenario 42: the Burrow's four dens (docs/ZONES.md §4.1; ROADMAP Z-H1, the owner's pick 2026-10-11: "I'd like the
// dungeons to be 2 floors and a boss"). Waits key on game state.
//  a) the picker at the Burrow door: F there opens it; a new save shows four dens, only the Mossy Burrow open, its card
//     (band, boss, yokai); 1–4 choose, Enter sets off, a sealed den refuses; the panel fits the screen
//  b) every den end to end, picked at the door: floor 1 (its theme, its band, the stairs) → floor 2 (its boss in the big
//     chamber, no stairs) → the boss falls → the den cleared, the next den open (the Moonlit Sanctum: the Deep Burrow's
//     Lantern), a toast that says so → the portal home; the picker then shows it cleared and the next one open
//  c) the story quests on the dens: their step texts, the pointer (the door from the village, the way out of another
//     den, the stairs, the boss), "The King of Squish" done by its own den
//  d) the save migration: old saves (the endless Burrow's deepest floor 3, 5, 6, 12, 15, 20, 21 and a cozy save whose
//     story was done by crews) reload into the dens with the quests' progress kept (a den cleared only once its boss fell);
//     a second reload changes nothing
//  e) a crew run: "The King of Squish" by a crew: the Mossy Burrow counts the crew's win, the Fox Shrine opens, the
//     report says so
//  f) the pad: the focus starts on the way in, the D-pad goes into the pins, A picks one, A on the way in sets off
//  g) touch (a phone): the panel fits; tap a sealed den (its card says what opens it), tap the Mossy Burrow, tap the way in
import { launch, boot, waitMode, sleep, makeReport, BASE, drainDialogue } from './lib.mjs';
import { launchTouch, PHONE } from './touch-lib.mjs';
import { installPad, padTap } from './pad-lib.mjs';
import { panelFit } from './ui-audit-lib.mjs';

const R = makeReport('S42 the Burrow\'s four dens');
const DENS = ['mossyBurrow', 'foxShrine', 'oniKitchen', 'moonSanctum'];
const THEMES = { mossyBurrow: ['burrow', 'burrow'], foxShrine: ['shrine', 'shrine'], oniKitchen: ['kitchen', 'kitchen'], moonSanctum: ['crystal', 'moon'] };
const BOSS = { mossyBurrow: 'mochiKing', foxShrine: 'kasaLord', oniKitchen: 'oniChef', moonSanctum: 'nineTails' };
const BAND = { mossyBurrow: [2, 6], foxShrine: [7, 11], oniKitchen: [12, 16], moonSanctum: [17, 21] };
const { browser, page, errors, warns } = await launch({ w: 1600, h: 900 });
const ev = (f, a) => page.evaluate(f, a);
const until = (f, a, timeout = 20000) => page.waitForFunction(f, a, { timeout });
const waitDen = (id, floor) => until(([id, floor]) => window.G.mode === 'dungeon' && window.G.dungeon?.def?.id === id && window.G.dungeon.floor === floor && !window.G.ui?.iris?.active, [id, floor], 60000);
const toVillage = async () => { await ev(() => window.G.returnToVillage()); await waitMode(page, 'village', 40000); };
const openPicker = async (select) => { await ev(s => { window.G.ui.close('burrow', true); window.G.openBurrowMenu(s ? { select: s } : {}); }, select); await until(() => window.G.ui.isOpen('burrow') && document.querySelectorAll('.p-burrow .dn-pin').length === 4); };
const pickerState = () => ev(() => ({ open: window.G.ui.isOpen('burrow'), sel: document.querySelector('.p-burrow .dn-pin.sel')?.dataset.id || null, locked: [...document.querySelectorAll('.p-burrow .dn-pin.locked')].map(p => p.dataset.id), cleared: [...document.querySelectorAll('.p-burrow .dn-pin.cleared')].map(p => p.dataset.id), card: document.querySelector('.p-burrow .dn-card')?.textContent.replace(/\s+/g, ' ').trim() || '', go: !!document.querySelector('.p-burrow .dn-go'), mode: window.G.mode }));
const armour = () => ev(() => { const G = window.G; clearInterval(window.__inv); window.__inv = setInterval(() => { if (G.player) { G.player.invuln = true; G.actions.restoreAll?.(); } }, 250); });
// an old save in localStorage (the game's own saves on leaving are held off), then a reload
async function reloadWith(mut) {
  await ev(mut => {
    const G = window.G; G.save(); const st = JSON.parse(localStorage.getItem('chewy3d.save'));
    new Function('st', mut)(st);
    const txt = JSON.stringify(st); localStorage.setItem('chewy3d.save', txt);
    const keep = () => localStorage.setItem('chewy3d.save', txt);
    addEventListener('beforeunload', keep); addEventListener('pagehide', keep); document.addEventListener('visibilitychange', keep); addEventListener('unload', keep);
  }, mut);
  await page.goto(`${BASE}/?notitle&nointro&notut&hour=11&dseed=1`, { waitUntil: 'load' });
  await until(() => window.__ready === true && window.G?.player && window.G.burrow, null, 60000);
}
const BASE_DONE = ['welcome', 'burrow1', 'homes', 'lights'];

try {
  // ================================================================ a) the picker at the Burrow door
  await boot(page, 'fresh&nointro&notut&hour=11');
  await ev(() => { const G = window.G; G.state.flags.burrowTut = true; G.state.flags.mokaJoined = true; G.state.player.lvl = 4; G.actions.recompute(); });
  const door = await ev(() => { const G = window.G, it = G.world.interactables.find(i => i.label === 'Enter the Burrow'); if (!it) return null; G.player.setPos(it.pos.x, it.pos.z); G.interactCooldown = 0; return { x: it.pos.x, z: it.pos.z }; });
  const nearest = await ev(() => { const G = window.G, P = G.player; let best = null, bd = 1e9; for (const it of G.world.interactables) { const d = Math.hypot(it.pos.x - P.pos.x, it.pos.z - P.pos.z); if (d < (it.radius || 1.4) + 0.4 && d < bd) { bd = d; best = it.label; } } return best; });
  for (let i = 0; i < 3 && !(await ev(() => window.G.ui.isOpen('burrow'))); i++) { await page.keyboard.press('f'); await until(() => window.G.ui.isOpen('burrow'), null, 1500).catch(() => {}); } // (F, the interact key: the frame's own nearest interactable)
  await until(() => window.G.ui.isOpen('burrow'));
  await until(() => document.querySelectorAll('.p-burrow .dn-pin').length === 4);
  const a0 = await pickerState();
  const art = await ev(() => { const cv = document.querySelector('.p-burrow canvas'), g = cv.getContext('2d'), px = (u, v) => [...g.getImageData(Math.floor(cv.width * u), Math.floor(cv.height * v), 1, 1).data]; return { w: cv.width, sky: px(0.1, 0.05), deep: px(0.5, 0.97), den1: px(0.2, 0.36) }; });
  const fit0 = await ev(panelFit);
  R.check('a) F at the Burrow door opens the den picker: four dens, only the Mossy Burrow open and picked, its card (Lv 2–6, King Mochi, its yokai, two floors then the boss\'s chamber); the painted hill drawn; the panel fits', !!door && nearest === 'Enter the Burrow' && a0.open && a0.sel === 'mossyBurrow' && a0.locked.join() === 'foxShrine,oniKitchen,moonSanctum' && /Mossy Burrow/.test(a0.card) && /Lv 2–6/.test(a0.card) && /King Mochi the Squishy/.test(a0.card) && /Mochi Slime/.test(a0.card) && /2, then the boss's chamber/.test(a0.card) && a0.go && art.w > 500 && art.sky.join() !== art.deep.join() && !fit0.length, { a0, art, fit0 });
  await page.keyboard.press('2'); await until(() => document.querySelector('.p-burrow .dn-pin.sel')?.dataset.id === 'foxShrine');
  const a1 = await pickerState();
  await page.keyboard.press('Enter'); await sleep(page, 400); // (a refusal: nothing to wait for)
  const a2 = await pickerState();
  R.check('a) 2 picks the Fox Shrine: sealed, its card says what opens it ("Beat King Mochi in the Mossy Burrow"), no way in; Enter refuses (still at the door)', a1.sel === 'foxShrine' && !a1.go && /Beat King Mochi in the Mossy Burrow to open it/.test(a1.card) && /Lord Karakasa/.test(a1.card) && a2.open && a2.mode === 'village', { a1, a2 });
  await page.keyboard.press('1'); await until(() => document.querySelector('.p-burrow .dn-pin.sel')?.dataset.id === 'mossyBurrow');
  await page.keyboard.press('Enter');
  await waitDen('mossyBurrow', 1);
  const a3 = await ev(() => ({ panel: window.G.ui.isOpen('burrow'), loc: window.G.ui.hud?.cache?.loc || null, kind: window.G.dungeon.kind }));
  R.check('a) 1 and Enter set off: into the Mossy Burrow, floor 1 (B1F), the picker closed', !a3.panel && a3.kind === 'burrow' && a3.loc?.name === 'Mossy Burrow' && a3.loc?.sub === 'B1F', a3);
  await toVillage();

  // ================================================================ b) every den end to end
  await ev(() => { const G = window.G; G.state.player.lvl = 30; G.state.player.stats.vit = 300; G.actions.recompute(); G.actions.restoreAll(); window.__ev = []; for (const n of ['dungeon:cleared', 'den:opened', 'tier:unlocked']) G.events.on(n, e => window.__ev.push([n, JSON.parse(JSON.stringify(e || {}))])); });
  await armour();
  for (const [k, id] of DENS.entries()) {
    const next = DENS[k + 1] || null;
    await openPicker(id);
    const p0 = await pickerState();
    await ev(() => { window.G.state.player.lvl = 30; });
    await page.click('.p-burrow .dn-go');
    await waitDen(id, 1);
    const f1 = await ev(id => { const G = window.G, D = G.dungeon, L = D.layout, inter = G.world.interactables.map(i => i.label); return { theme: L.theme, mlvl: L.mlvl, stairs: !!D.stairsPos, label: inter.find(l => /deeper/.test(l)) || null, way: inter.includes('Return to Blossom Hollow'), best: G.state.dungeon.dens[id].bestFloor, waypoint: !!L.waypoint, monsters: D.monsters.length }; }, id);
    R.check(`b) ${id}: picked at the door (open, its pin chosen), floor 1 is its ${THEMES[id][0]} theme at the band's top for a level-30 hero (Lv ${BAND[id][1] - 1}), with stairs to floor 2, a way home, no waypoint, ${f1.monsters} monsters; its record notes floor 1`,
      !p0.locked.includes(id) && p0.sel === id && f1.theme === THEMES[id][0] && f1.mlvl === BAND[id][1] - 1 && f1.stairs && /Burrow deeper \(Floor 2\)/.test(f1.label || '') && f1.way && !f1.waypoint && f1.best >= 1 && f1.monsters > 30, { p0: { sel: p0.sel, locked: p0.locked }, f1 });
    await ev(() => { const G = window.G, it = G.world.interactables.find(i => /deeper/.test(i.label)); G.player.setPos(it.pos.x + 0.4, it.pos.z); it.onInteract(); });
    await waitDen(id, 2);
    const f2 = await ev(id => { const G = window.G, D = G.dungeon, L = D.layout, B = L.bossRoom, b = D.boss, c = D.world.cellToWorld(B.cx, B.cy); return { theme: L.theme, boss: b?.id || null, bossLvl: b?.level, big: Math.min(B.w, B.h), atCentre: b ? Math.hypot(b.pos.x - c.x, b.pos.z - c.z) < 3 : false, stairs: !!D.stairsPos, treasure: L.rooms.some(r => r.kind === 'treasure'), best: G.state.dungeon.dens[id].bestFloor, far: Math.hypot(D.startPos.x - c.x, D.startPos.z - c.z) }; }, id);
    R.check(`b) ${id}: its stairs lead to floor 2 (${THEMES[id][1]}): ${BOSS[id]} in the big chamber (${f2.big * 2} m) ${f2.far.toFixed(0)} m from the arrival, Lv ${f2.bossLvl}; no stairs; a treasure room; floor 2 noted`, f2.theme === THEMES[id][1] && f2.boss === BOSS[id] && f2.big >= 15 && f2.atCentre && !f2.stairs && f2.treasure && f2.best === 2 && f2.bossLvl === BAND[id][1] + 2 && f2.far > 30, f2);
    await ev(() => { window.__ev.length = 0; window.QA.toasts.length = 0; const G = window.G, b = G.dungeon.boss; G.player.setPos(b.pos.x + 3, b.pos.z); b.life = 1; G.combat.hitMonster(b, { dmgPct: 500 }); });
    await until(() => window.__ev.some(e => e[0] === 'dungeon:cleared'), null, 8000);
    await until(() => window.G.world.interactables.some(i => i.label === 'Return to Blossom Hollow' && i.pos.distanceTo(window.G.dungeon.exitPos) > 0.5), null, 8000);
    await until(next => (next ? window.QA.toasts.some(t => /is open! Pick it at the Burrow door/.test(t)) : window.QA.toasts.some(t => /Deep Burrow/.test(t))), next, 12000).catch(() => {});
    const cl = await ev(([id, next]) => { const G = window.G, L = G.burrow.list(); return { clear: window.__ev.find(e => e[0] === 'dungeon:cleared')?.[1] || null, opened: window.__ev.find(e => e[0] === 'den:opened')?.[1] || null, rec: G.state.dungeon.dens[id], nextOpen: next ? L.find(d => d.id === next).open : null, deep: G.state.dungeon.deep?.tier?.unlocked || 0, tierEv: window.__ev.find(e => e[0] === 'tier:unlocked')?.[1] || null, toast: window.QA.toasts.filter(t => /is open!|Deep Burrow/.test(t)).slice(-1)[0] || null }; }, [id, next]);
    R.check(next ? `b) ${id}: its boss falls → dungeon:cleared { id: ${id}, kind: burrow, first, opened: ${next} }, the den cleared, ${next} open, and a toast to say so` : `b) ${id}: Tamamo falls → the den cleared, the Deep Burrow's Tier 1 opens (tier:unlocked) and the Spirit Lantern by the door wakes (a toast)`,
      cl.clear?.id === id && cl.clear.kind === 'burrow' && cl.clear.first === true && cl.rec.cleared === 1 && (next ? cl.clear.opened === next && cl.opened?.id === next && cl.nextOpen && /is open! Pick it at the Burrow door/.test(cl.toast || '') : cl.deep === 1 && cl.tierEv?.id === 'burrowDeep' && /Deep Burrow/.test(cl.toast || '')), cl);
    await ev(() => { const G = window.G, D = G.dungeon, it = G.world.interactables.filter(i => i.label === 'Return to Blossom Hollow' && i.pos.distanceTo(D.exitPos) > 0.5).pop(); G.player.setPos(it.pos.x + 0.4, it.pos.z); it.onInteract(); });
    await waitMode(page, 'village', 40000);
    await openPicker();
    const p1 = await pickerState();
    R.check(`b) ${id}: the portal where the boss fell leads home; the picker shows it Cleared${next ? ` and ${next} open` : ', every den open'}`, p1.cleared.includes(id) && (!next || !p1.locked.includes(next)) && p1.mode === 'village', { cleared: p1.cleared, locked: p1.locked, sel: p1.sel });
    await ev(() => window.G.ui.close('burrow', true));
  }
  const allClear = await ev(() => { const G = window.G; return { n: G.burrow.list().filter(d => d.done).length, lantern: G.burrowLantern?.lit ?? null, pick: G.burrow.pick() }; });
  R.check('b) all four dens cleared; the picker still opens on a den (the deepest)', allClear.n === 4 && allClear.pick === 'moonSanctum', allClear);

  // ================================================================ c) the story quests on the dens
  await ev(() => { const G = window.G, D = G.state.dungeon; D.dens = {}; G.state.quests.active = [{ id: 'king', step: 0, prog: 0 }]; G.state.quests.done = ['welcome', 'burrow1', 'homes', 'lights']; G.events.emit('quest:update'); });
  const texts = await ev(() => { const S = window.G.story; return ['king', 'umbrella', 'oni', 'tails'].map(q => [S.def(q).steps[0].text, S.def(q).steps[1].text]); });
  const ui0 = await ev(() => window.G.story.uiList().find(q => q.id === 'king'));
  const ptr0 = await ev(() => { const t = window.G.questTarget(); return t ? { label: t.label, quest: t.quest } : null; });
  R.check('c) the quests name their dens ("Reach the Mossy Burrow\'s second floor", "Reach the Fox Shrine\'s second floor", "…of Oni\'s Kitchen", "Reach the Moonlit Sanctum\'s second floor"); from the village the pointer goes to the Burrow door, naming the den', texts[0][0] === "Reach the Mossy Burrow's second floor" && texts[1][0] === "Reach the Fox Shrine's second floor" && texts[2][0] === "Reach the second floor of Oni's Kitchen" && texts[3][0] === "Reach the Moonlit Sanctum's second floor" && texts[0][1] === 'Defeat King Mochi' && ui0?.steps?.[0]?.need === 2 && ui0.steps[0].have === 0 && ptr0?.label === 'The Burrow: Mossy Burrow' && ptr0.quest === 'king', { texts, ui0: ui0?.steps, ptr0 });
  await ev(() => window.G.enterDungeon({ id: 'foxShrine', floor: 1 })); await waitDen('foxShrine', 1);
  const ptr1 = await ev(() => window.G.questTarget()?.label || null);
  await ev(() => window.G.enterDungeon({ id: 'mossyBurrow', floor: 1 })); await waitDen('mossyBurrow', 1);
  const ptr2 = await ev(() => ({ label: window.G.questTarget()?.label || null, have: window.G.story.uiList().find(q => q.id === 'king')?.steps?.[0]?.have }));
  await ev(() => { const G = window.G, it = G.world.interactables.find(i => /deeper/.test(i.label)); G.player.setPos(it.pos.x + 0.4, it.pos.z); it.onInteract(); });
  await waitDen('mossyBurrow', 2);
  await until(() => window.G.state.quests.active.find(q => q.id === 'king')?.step === 1, null, 5000).catch(() => {});
  const ptr3 = await ev(() => ({ step: window.G.state.quests.active.find(q => q.id === 'king')?.step, label: window.G.questTarget()?.label || null, boss: window.G.dungeon.boss?.name }));
  await ev(() => { const G = window.G, b = G.dungeon.boss; b.life = 1; G.combat.hitMonster(b, { dmgPct: 500 }); });
  await until(() => window.G.state.quests.active.find(q => q.id === 'king')?.handIn, null, 8000).catch(() => {});
  const c4 = await ev(() => ({ handIn: !!window.G.state.quests.active.find(q => q.id === 'king')?.handIn, ptr: window.G.questTarget()?.label || null, fox: window.G.burrow.list().find(d => d.id === 'foxShrine').open }));
  await toVillage();
  // the hand-in (docs/QUESTS.md §4): home, the pointer is Rosie; telling her finishes the quest
  c4.home = await ev(() => window.G.questTarget()?.label || null);
  await ev(() => { const G = window.G, n = G.npcs.find(x => x.id === 'rosie'); G.player.setPos(n.pos.x + 1.2, n.pos.z); G.story.talk(n); });
  await sleep(page, 500); await drainDialogue(page); await sleep(page, 300);
  c4.done = await ev(() => window.G.state.quests.done.includes('king'));
  R.check('c) the pointer: in another den the way out (back to the door); in the Mossy Burrow the stairs; on floor 2 the step is done and the pointer finds King Mochi; his fall opens the Fox Shrine and leaves "The King of Squish" waiting for its hand-in (the pointer: the way out, then Rosie at home); telling Rosie completes it', ptr1 === 'The way out' && ptr2.label === 'Stairs down' && ptr2.have === 1 && ptr3.step === 1 && ptr3.label === ptr3.boss && !!ptr3.boss && c4.handIn && c4.ptr === 'The way out' && c4.home === 'Rosie' && c4.done && c4.fox, { ptr1, ptr2, ptr3, c4 });

  // ================================================================ d) the save migration (old endless-Burrow saves)
  const den = () => ev(() => { const G = window.G; return { dens: G.burrow.list().map(d => `${d.cleared ? 'C' : d.crew ? 'K' : d.open ? 'o' : '-'}${d.bestFloor}`).join(' '), deep: G.state.dungeon.deep?.tier?.unlocked || 0, deepest: G.state.dungeon.deepest, q: G.state.quests.active.map(q => `${q.id}:${q.step}`).join(','), json: JSON.stringify(G.state.dungeon.dens) }; });
  const CASES = [ // (a den is cleared once its boss fell: deepest past its boss floor, or its quest done; at the boss floor itself, floor 2 reached)
    { deepest: 3, active: [{ id: 'king', step: 0, prog: 0 }], done: BASE_DONE, want: 'o1 -0 -0 -0', q: 'king:0', deep: 0, note: 'floor 3, King Mochi\'s quest just begun' },
    { deepest: 5, active: [{ id: 'king', step: 0, prog: 0 }], done: BASE_DONE, want: 'o2 -0 -0 -0', q: 'king:1', deep: 0, note: 'exactly floor 5: the King reached, not beaten; the Fox Shrine stays sealed; the quest\'s floor step holds' },
    { deepest: 6, active: [{ id: 'shrine', step: 0, prog: 0 }], done: [...BASE_DONE, 'king'], want: 'C2 o1 -0 -0', q: 'shrine:0', deep: 0, note: 'floor 6: past the King, so he fell' },
    { deepest: 12, active: [{ id: 'oni', step: 0, prog: 0 }], done: [...BASE_DONE, 'king', 'shrine', 'umbrella', 'onsen'], want: 'C2 C2 o1 -0', q: 'oni:0', deep: 0, note: 'floor 12, the Oni quest begun' },
    { deepest: 15, active: [{ id: 'oni', step: 0, prog: 0 }], done: [...BASE_DONE, 'king', 'shrine', 'umbrella', 'onsen'], want: 'C2 C2 o2 -0', q: 'oni:1', deep: 0, note: 'floor 15 reached: the Oni quest\'s floor step holds, Gorobei still to beat' },
    { deepest: 20, active: [{ id: 'tails', step: 1, prog: 0 }], done: [...BASE_DONE, 'king', 'shrine', 'umbrella', 'onsen', 'oni'], want: 'C2 C2 C2 o2', q: 'tails:1', deep: 0, note: 'floor 20, Tamamo\'s step: not calmed yet, the Deep Burrow asleep' },
    { deepest: 21, active: [], done: [...BASE_DONE, 'king', 'shrine', 'umbrella', 'onsen', 'oni', 'tails'], want: 'C2 C2 C2 C2', q: '', deep: 1, note: 'floor 21: past Tamamo' },
    { deepest: 0, active: [{ id: 'onsen', step: 0, prog: 0 }], done: [...BASE_DONE, 'king', 'shrine', 'umbrella'], want: 'K2 K2 o0 -0', q: 'onsen:0', deep: 0, note: 'a cozy save: King Mochi and Karakasa beaten by crews' },
  ];
  for (const C of CASES) {
    await reloadWith(`st.dungeon = { deepest: ${C.deepest}, waypoints: [1, 6, 11, 16].filter(f => f <= ${Math.max(1, C.deepest)}), seed: st.dungeon?.seed || 7 }; st.quests = { active: ${JSON.stringify(C.active)}, done: ${JSON.stringify(C.done)}, requests: {} };`);
    await until(q => window.G.state.quests.active.map(x => `${x.id}:${x.step}`).join(',') === q, C.q, 9000).catch(() => {}); // (Story's first progress pass: a floor step the record already holds moves on)
    const m1 = await den();
    await ev(() => window.G.save());
    await page.goto(`${BASE}/?notitle&nointro&notut&hour=11&dseed=1`, { waitUntil: 'load' });
    await until(() => window.__ready === true && window.G?.player && window.G.burrow, null, 60000);
    const m2 = await den();
    R.check(`d) an old save (${C.note}) → the dens ${C.want}, the quest at ${C.q}${C.deep ? ', the Deep Burrow\'s T1 open' : ''}; deepest kept; a second reload changes nothing`, m1.dens === C.want && m1.q === C.q && m1.deep === C.deep && m1.deepest === C.deepest && m2.json === m1.json && m2.q === m1.q, { m1: { dens: m1.dens, q: m1.q, deep: m1.deep, deepest: m1.deepest }, same: m2.json === m1.json });
  }

  // ================================================================ e) a crew run: "The King of Squish" by a crew
  await page.goto(`${BASE}/?fresh&nointro&notut&hour=11&dseed=1`, { waitUntil: 'load' });
  await until(() => window.__ready === true && window.G?.player && window.G.cozy?.exp, null, 60000);
  const crew = await ev(async () => {
    const G = window.G, { DEBUG_SECTIONS } = await import('/src/debug/registry.js');
    G.state.flags.burrowTut = true; G.state.quests.active = [{ id: 'king', step: 0, prog: 0 }]; G.state.quests.done = ['welcome', 'burrow1', 'homes', 'lights'];
    DEBUG_SECTIONS.get('cozy').actions.find(a => a.label === 'Give a sure-thing crew').run(G);
    G.state.pantry = { ...(G.state.pantry || {}), onigiri: 6 }; G.state.potions.heart = 6;
    const crewIds = ['hero:moka', 'hero:poe'], out = { tries: 0 };
    const won = () => G.state.quests.done.includes('king') || !!G.state.quests.active.find(q => q.id === 'king')?.handIn; // (a crew's win: the hand-in waits for you, docs/QUESTS.md §4)
    for (let t = 0; t < 4 && !won(); t++) {
      out.tries++; const T = G.state.cozy.exp.tired; for (const k in T) delete T[k];
      out.listed = G.cozy.exp.objectives('story').some(o => o.id === 'quest:king');
      const r = G.cozy.exp.send('quest:king', crewIds, { meals: { onigiri: 2 }, potions: 3 }); out.sent = !!r?.ok; out.why = r?.why || null; if (!r?.ok) break;
      G.cozy.exp.finishAll(); await new Promise(q => setTimeout(q, 300));
      out.rep = G.cozy.exp.reports().at(-1); out.result = out.rep?.result;
    }
    return { ...out, done: won(), handIn: !!G.state.quests.active.find(q => q.id === 'king')?.handIn, rep2: /Rosie wants to hear/.test(out.rep?.quest?.handIn ? `${out.rep.quest.giver} wants to hear` : ''), rec: G.state.dungeon.dens?.mossyBurrow || null, fox: G.burrow.list().find(d => d.id === 'foxShrine').open, den: out.rep?.den || null, place: out.rep?.place?.label || null };
  });
  // its hand-in: Rosie hears about the crew, and the quest is done
  await ev(() => { const G = window.G, n = G.npcs.find(x => x.id === 'rosie'); G.player.setPos(n.pos.x + 1.2, n.pos.z); G.story.talk(n); });
  await page.waitForFunction(() => window.G.ui.dlg.active, null, { timeout: 8000 }).catch(() => {}); // (her hop first, then her words)
  crew.crewLine = await ev(() => /crew/.test(window.G.ui.dlg.lines?.map(l => l.text).join(' ') || ''));
  await drainDialogue(page); await sleep(page, 300);
  crew.handedIn = await ev(() => window.G.state.quests.done.includes('king'));
  R.check('e) "The King of Squish" by a crew (on the Board, sent, home): the quest\'s fight done and its hand-in waiting (the report: Rosie wants to hear all about it), the Mossy Burrow counts the crew\'s win (not yours), the Fox Shrine opens, and the report says so; Rosie\'s hand-in has a line about the crew and finishes it', crew.listed && crew.sent && crew.done && crew.handIn && crew.rep2 && crew.crewLine && crew.handedIn && crew.rec?.crew === 1 && crew.rec.cleared === 0 && crew.fox && crew.den?.opened === 'the Fox Shrine' && /Mossy Burrow/.test(crew.place || ''), { ...crew, rep: undefined });

  // ================================================================ f) the pad
  await installPad(page);
  await ev(() => { const G = window.G; G.state.dungeon.dens = {}; G.ui.closeAll?.(); });
  await openPicker();
  await padTap(page, 'DLeft'); // (the pad becomes the device; focus moves from the way in into the pins)
  await until(() => window.G.ui.padNav.cur?.classList.contains('dn-pin'), null, 4000).catch(() => {});
  const f0 = await ev(() => ({ cur: window.G.ui.padNav.cur?.dataset.id || window.G.ui.padNav.cur?.className || null, ring: window.G.ui.padNav.ring.classList.contains('on'), hints: !!document.querySelector('.p-burrow .tv-foot.pad-only') }));
  // walk the pins to the Mossy Burrow, A to pick it, then right to the way in and A
  for (let i = 0; i < 6 && (await ev(() => window.G.ui.padNav.cur?.dataset.id)) !== 'mossyBurrow'; i++) { await padTap(page, 'DUp'); await sleep(page, 120); }
  await padTap(page, 'A'); await until(() => document.querySelector('.p-burrow .dn-pin.sel')?.dataset.id === 'mossyBurrow', null, 3000).catch(() => {});
  const fSel = await ev(() => document.querySelector('.p-burrow .dn-pin.sel')?.dataset.id);
  for (let i = 0; i < 6 && !(await ev(() => window.G.ui.padNav.cur?.classList.contains('dn-go'))); i++) { await padTap(page, 'DRight'); await sleep(page, 120); }
  const fGo = await ev(() => !!window.G.ui.padNav.cur?.classList.contains('dn-go'));
  await padTap(page, 'A');
  const fIn = await waitDen('mossyBurrow', 1).then(() => true).catch(() => false);
  R.check('f) the pad: the D-pad moves the focus ring into the pins, A on the Mossy Burrow picks it, right to the way in, A sets off', f0.ring && /dn-pin|mossy|fox|oni|moon/.test(String(f0.cur)) && fSel === 'mossyBurrow' && fGo && fIn, { f0, fSel, fGo, fIn });
  await toVillage();
} catch (e) { errors.push('[harness] ' + e.stack); }
await browser.close();

// ================================================================ g) touch (a phone)
{
  const T = await launchTouch(PHONE), tp = T.page;
  try {
    await boot(tp, 'fresh&nointro&notut&hour=11');
    await tp.evaluate(() => { window.G.state.flags.burrowTut = true; window.G.openBurrowMenu(); });
    await tp.waitForFunction(() => window.G.ui.isOpen('burrow') && document.querySelectorAll('.p-burrow .dn-pin').length === 4, null, { timeout: 10000 });
    await tp.waitForTimeout(500); // (the panel's open spring: panelFit measures the settled box)
    const fit = await tp.evaluate(panelFit);
    const tg = await tp.evaluate(() => { const p = document.querySelector('.p-burrow .dn-pin[data-id="oniKitchen"]').getBoundingClientRect(), g = document.querySelector('.p-burrow .dn-go').getBoundingClientRect(); return { pin: [Math.round(p.width), Math.round(p.height)], go: [Math.round(g.width), Math.round(g.height)], goIn: g.bottom <= innerHeight && g.top >= 0 }; });
    await tp.tap('.p-burrow .dn-pin[data-id="oniKitchen"]');
    await tp.waitForFunction(() => document.querySelector('.p-burrow .dn-pin.sel')?.dataset.id === 'oniKitchen', null, { timeout: 4000 });
    const lockedCard = await tp.evaluate(() => ({ go: !!document.querySelector('.p-burrow .dn-go'), text: document.querySelector('.p-burrow .tv-st.locked')?.textContent.trim() || '' }));
    await tp.tap('.p-burrow .dn-pin[data-id="mossyBurrow"]');
    await tp.waitForFunction(() => document.querySelector('.p-burrow .dn-pin.sel')?.dataset.id === 'mossyBurrow' && document.querySelector('.p-burrow .dn-go'), null, { timeout: 4000 });
    await tp.tap('.p-burrow .dn-go');
    const tIn = await tp.waitForFunction(() => window.G.mode === 'dungeon' && window.G.dungeon?.def?.id === 'mossyBurrow' && !window.G.ui.iris.active, null, { timeout: 60000 }).then(() => true).catch(() => false);
    R.check('g) a phone: the picker fits the screen (44 px targets: a pin with its name, the way in, in sight); a tap on a sealed den shows what opens it, a tap on the Mossy Burrow and on the way in sets off', !fit.length && tg.pin[0] >= 44 && tg.pin[1] >= 44 && tg.go[1] >= 44 && tg.goIn && !lockedCard.go && /Beat Lord Karakasa in the Fox Shrine to open it/.test(lockedCard.text) && tIn, { fit, tg, lockedCard, tIn });
  } catch (e) { errors.push('[harness touch] ' + e.stack); }
  errors.push(...T.errors);
  await T.browser.close();
}
const failed = R.finish(errors, warns);
process.exit(failed ? 1 : 0);
