// Scenario 47: the heroes arrive in Blossom Hollow and start their homeland's story (ROADMAP Z-H3; docs/ZONES.md §3.1,
// docs/QUESTS.md §9, docs/POE.md §5, docs/SHIHTZU.md §5, docs/GOLDEN.md §5). a-i: Poe; j-p: Floofy, Captain Kaizo, Foosy.
//  a) the trigger and the order: nothing before Moka joins or before the Bamboo opens (the wheel says when she'll come);
//     at level 4 Poe's arrival is due and starts on a calm moment in town (not over a dialogue or a card); the old Bamboo
//     scene never plays in the grove
//  b) her scene on the island, end to end: she tails you round the plaza (on screen, on the maps as a person), freezes
//     when you look, sneezes when you walk up; the staging (your marks in the clear, Shadow on his, villagers walking
//     round); the dialogue and her plea (Takemori is under siege); she joins (the cottage), vanishes; the arrival recorded;
//     the quest card ("Takemori Under Siege", her hook, the goal), Let's go!
//  c) the quest by you: the pointer to the Wayfarer's Post; arriving in the Bamboo finishes the travel step (the place
//     title, Shadow's line); Takemori saved: the hand-in waits; back in town the pointer and her "!" point at Poe; talking
//     to her: her hop, her thanks, the reward (the skill point, the scroll), the stamp
//  d) saved by a crew: the quest goes straight to the hand-in, her line about the crew first (Moka's crew; and when she
//     went too, "Moka and I…")
//  e) playing Poe herself: Takemori saved, her own little hand-in wherever you are (her line to Shadow), the stamp
//  f) old saves, each with a second reload: Poe joined in the bamboo already (no arrival; her quest starts quietly with
//     its card); Takemori saved before she came (the thank-you, no quest); the Bamboo open and no Poe (she arrives next
//     time in town; a reload mid-wait doesn't strand her)
//  g) the pad (the Deck's 1280×800): the scene's dialogue and choices with A and the D-pad, the card with A
//  h) touch (a phone): taps read the scene on, a tap picks a choice, a tap on "Let's go!"
//  i) the debug menu's Arrivals: Play an arrival (Poe again, her quest again), Reset the arrivals
//  j) Floofy's trigger (after Poe; Momiji Hollow open by level 11, or the Bamboo's dungeon cleared by you or a crew; the
//     wheel says when), Kaizo's (after Floofy; the Tide Pool open), Foosy's (after Kaizo's visit; the Onsen open); in
//     Momiji Hollow and at the Onsen the old scenes never play
//  k) Floofy on the Shrine Road at dusk, end to end: he kneels on the paving lighting his lanterns (the maps, the pointer,
//     Shadow's tip); walk up: "Halt, traveller", the staging in plain view on the paving, the lick, his plea (Akane,
//     Strawgrin), the snuff and fade, he joins, his card; his quest by you (travel, Akane saved, his thanks, the reward)
//  l) the dusk rule: golden hour near, he waits for it; by day he comes at once and says he's early
//  m) Captain Kaizo: his boat on the beach (the maps, the pointer, Shadow's tip); "Ahoy there!", the staging on the sand,
//     his plea (Shiokaze, Brineclaw); he rows home (the camera watching), then his card; the quest's hand-in at his lookout
//  n) Foosy: he marches in and stands guard by the fountain; the vow, the ball, the fetch, the whelp costume, his plea
//     (Yukimi, Frostbelly), he joins, his card
//  o) checkpoint 2's old saves, each with a second reload: Floofy joined in the maples (no arrival, his quest quietly);
//     Akane relieved by a crew before he came (the thank-you, no quest); Shiokaze relieved before Kaizo came (his
//     thank-you, no quest); Foosy joined at the Onsen and no Kaizo yet (Kaizo still comes, Foosy's quest quietly);
//     Momiji Hollow open and no Floofy (he arrives next time in town, a reload mid-wait doesn't strand him)
//  p) the pad on the Deck (Foosy's scene and card), touch on a phone (Kaizo's)
// S47_ONLY=abc runs some parts. SHOTS=1 saves frames to tools/qa/tmp/s47/.
import fs from 'node:fs';
import { launch, boot, sleep, waitMode, makeReport, drainDialogue } from './lib.mjs';
import { launchTouch, PHONE } from './touch-lib.mjs';
import { installPad, padTap } from './pad-lib.mjs';

const R = makeReport('S47 hero arrivals: Poe, Floofy, Captain Kaizo and Foosy come to Blossom Hollow, their homeland quests, crews, old saves, pad and touch');
const want = k => !process.env.S47_ONLY || process.env.S47_ONLY.includes(k);
const SHOTS = !!process.env.SHOTS, OUT = 'tools/qa/tmp/s47'; if (SHOTS) fs.mkdirSync(OUT, { recursive: true });
const allErrors = [], allWarns = [];
let browser, page, errors, warns, ev, until;
const open = async ({ w = 1280, h = 720, touch = false } = {}) => {
  const T = touch ? await launchTouch({ w: PHONE.w, h: PHONE.h, dpr: PHONE.dpr, ua: PHONE.ua }) : await launch({ w, h });
  ({ browser, page, errors, warns } = T);
  ev = (f, a) => page.evaluate(f, a); until = (f, a, timeout = 20000) => page.waitForFunction(f, a, { timeout });
  return T;
};
const close = async () => { allErrors.push(...errors); allWarns.push(...warns); await browser.close(); };
const shot = async n => { if (SHOTS) await page.screenshot({ path: `${OUT}/${n}.png` }); };
/** a calm town: the sim frozen, the welcome done, Moka joined (unless moka: false), the tips that would talk over it seen */
const setup = ({ moka = true, lvl = 1 } = {}) => ev(({ moka, lvl }) => {
  const G = window.G; G.sim.tickT = -1e9; clearInterval(window.__freeze); window.__freeze = setInterval(() => { G.sim.tickT = -1e9; }, 200);
  G.state.quests.active = G.state.quests.active.filter(q => q.id !== 'welcome'); G.state.quests.cards = [];
  G.state.flags.hints = { ...(G.state.flags.hints || {}), garden: 1, build: 1, travel: 1, skills: 1, stats: 1, loot: 1, potion: 1, fight: 1, dig: 1, scavDig: 1, sprint: 1 };
  if (moka) { G.state.flags.mokaJoined = true; const v = G.heroes.villagers.moka; if (v) { v.frozen = false; v.waitingToJoin = false; } }
  G.state.player.lvl = lvl; G.actions.recompute(); if (G.day) G.day.paused = true;
  if (!G.ui.__dlgLog) { const raw = G.ui.dialogue.bind(G.ui); G.ui.dialogue = o => { (window.__said ||= []).push(...(o?.lines || []).map(l => l.text || l)); return raw(o); }; G.ui.__dlgLog = true; } window.__said = [];
  window.__ev = []; for (const n of ['arrival:start', 'arrival:done', 'arrival:quest', 'poe:joinScene', 'shihtzu:joinScene', 'golden:joinScene', 'kaizo:arrive', 'quest:card', 'quest:place', 'quest:line', 'quest:handedIn', 'hero:joined']) G.events.on(n, p => window.__ev.push([n, JSON.stringify(p || {})]));
}, { moka, lvl });
const evs = n => ev(n => window.__ev.filter(e => e[0] === n).map(e => JSON.parse(e[1])), n);
const J = () => ev(() => { const G = window.G, S = G.heroes.poeJoin, P = G.player; return { state: S.state, vis: !!S.poe?.visible, frozen: !!S.frozen, act: S.poe?.anim.action?.name || null, d: S.poe ? Math.round(Math.hypot(S.poe.pos.x - P.pos.x, S.poe.pos.z - P.pos.z) * 10) / 10 : null, on: !!S.poe && S.onScreen(S.poe.pos.x, S.poe.pos.y, S.poe.pos.z), joined: !!G.state.flags.poeJoined, cur: G.arrivals.cur?.a?.who || null, due: G.arrivals.due()?.who || null }; });
/** walk round the plaza (a circuit of marks) until the scene leaves its wait */
const walkPlaza = async (laps = 3) => {
  const marks = [[-4, 7], [-8, 2], [-7, -5], [0, -7], [7, -5], [8, 2], [4, 7]];
  for (let lap = 0; lap < laps; lap++) for (const [dx, dz] of marks) {
    if ((await ev(() => window.G.heroes.poeJoin.state)) !== 'wait') return;
    await ev(([dx, dz]) => { const G = window.G, F = G.world.landmarks.fountain; G.player.moveTarget = new G.THREE.Vector3(F.x + dx, 0, F.z + dz); }, [dx, dz]);
    await until(() => !window.G.player.moveTarget || window.G.heroes.poeJoin.state !== 'wait', null, 6000).catch(() => {});
  }
};
/** walk on round the plaza while she tails you, n marks */
const walkTail = async n => {
  const marks = [[-4, 7], [-8, 2], [-7, -5], [0, -7], [7, -5], [8, 2], [4, 7]];
  for (let i = 0; i < n; i++) {
    if ((await ev(() => window.G.heroes.poeJoin.state)) !== 'tail') return;
    await ev(([dx, dz]) => { const G = window.G, F = G.world.landmarks.fountain; G.player.moveTarget = new G.THREE.Vector3(F.x + dx, 0, F.z + dz); }, marks[i % marks.length]);
    await until(() => !window.G.player.moveTarget || window.G.heroes.poeJoin.state !== 'tail', null, 6000).catch(() => {});
  }
};
/** walk up to her: caught */
const catchHer = async () => {
  await ev(() => { const S = window.G.heroes.poeJoin, P = window.G.player; if (S.poe && S.state === 'tail') P.moveTarget = new window.G.THREE.Vector3(S.poe.pos.x, 0, S.poe.pos.z); });
  await until(() => window.G.heroes.poeJoin.state === 'caught' || window.G.heroes.poeJoin.state === 'talk', null, 12000).catch(() => {});
};
/** answer the scene's dialogues until it's done (picks: the choices, in order) */
const drainScene = async (picks, phase = 'done') => {
  const chosen = [];
  for (let i = 0; i < 16; i++) {
    if (await ev(p => window.__ev.some(e => e[0] === 'poe:joinScene' && JSON.parse(e[1]).phase === p), phase)) break;
    await until(() => window.G.ui.dlg?.active || window.__ev.some(e => e[0] === 'poe:joinScene' && JSON.parse(e[1]).phase === 'done'), null, 10000).catch(() => {});
    chosen.push(...await drainDialogue(page, picks));
  }
  return chosen;
};
const dlgText = () => ev(() => (window.G.ui.dlg?.lines || []).map(l => l.text || l).join(' '));
const cardOpen = () => until(() => window.G.questMoments.open && document.querySelector('.p-qcard'), null, 20000);
const quest = id => ev(id => { const G = window.G, q = G.state.quests.active.find(x => x.id === id); return q ? { step: q.step, handIn: !!q.handIn, crewBy: q.crewBy || null, crewWith: q.crewWith ?? null } : G.state.quests.done.includes(id) ? 'done' : null; }, id);
/** a full arrival, quickly: the walk, the catch, the dialogue (the card closed after) */
const playPoe = async (picks = [1, 0]) => {
  await until(() => window.G.heroes.poeJoin.state === 'wait', null, 20000).catch(() => {});
  await walkPlaza(); await until(() => window.G.heroes.poeJoin.state === 'tail', null, 20000).catch(() => {});
  await sleep(page, 2200); await catchHer();
  return drainScene(picks);
};
/** save, then load the save again (the second reload of an old save) */
const reload = async (qs = 'notitle&notut&arrive&qcard&hour=11') => { await ev(() => { window.G.save(); }); await boot(page, qs); };
/** put a hand-made save in place (an old one) and load it */
const loadSave = async (mut, qs = 'notitle&notut&arrive&qcard&hour=11') => {
  await ev(mut => { const G = window.G; G.save(); const s = JSON.parse(localStorage.getItem('chewy3d.save')); new Function('s', mut)(s); window.__ignoreSave = true; localStorage.setItem('chewy3d.save', JSON.stringify(s)); removeEventListener('beforeunload', G.save); G.save = () => {}; }, mut);
  await boot(page, qs);
};
// ------------------------------------------------------------------ Floofy, Captain Kaizo and Foosy (checkpoint 2)
const SCN = {
  shihtzu: { key: 'stzJoin', show: 'kneel', ev: 'shihtzu:joinScene', zone: 'maple', quest: 'hq_akane', lvl: 11 },
  kaizo: { key: 'kaizoArrive', show: 'land', ev: 'kaizo:arrive', zone: 'tidepool', quest: 'hq_shiokaze', lvl: 18 },
  golden: { key: 'gldJoin', show: 'guard', ev: 'golden:joinScene', zone: 'onsen', quest: 'hq_yukimi', lvl: 26 },
};
/** a calm town with the arrivals before this one behind us (joined, recorded, their quests done); lvl: the level */
const setupFor = (who, { lvl = SCN[who].lvl, saved = null } = {}) => setup({ lvl }).then(() => ev(({ who, saved }) => {
  const G = window.G, F = G.state.flags, Q = G.state.quests, done = (h, z, q) => { if (h) F[h + 'Joined'] = true; (F.arrivals ||= {})[z] = { how: 'scene', quest: 'start', day: 1 }; if (!Q.done.includes(q)) Q.done.push(q); };
  F.hints = { ...F.hints, stzRumour: 1, gldRumour: 1 };
  const order = [['poe', 'bamboo', 'hq_takemori'], ['shihtzu', 'maple', 'hq_akane'], [null, 'tidepool', 'hq_shiokaze']];
  const n = { shihtzu: 1, kaizo: 2, golden: 3 }[who];
  for (let i = 0; i < n; i++) done(...order[i]);
  if (saved) { const z = { shihtzu: 'maple', kaizo: 'tidepool', golden: 'onsen' }[who]; G.state.zones[z].village = 'saved'; G.state.zones[z].savedBy = saved; }
  G.heroes.spawnBench?.();
}, { who, saved }));
const A = who => ev(k => { const G = window.G, S = G.heroes[k], a = S.knight || S.kaizo, P = G.player; return { state: S.state, vis: !!a?.visible, act: a?.anim.action?.name || null, d: a ? Math.round(Math.hypot(a.pos.x - P.pos.x, a.pos.z - P.pos.z) * 10) / 10 : null, cur: G.arrivals.cur?.a?.who || null, due: G.arrivals.due()?.who || null }; }, SCN[who].key);
const phase = (who, p) => ev(([n, p]) => window.__ev.some(e => e[0] === n && JSON.parse(e[1]).phase === p), [SCN[who].ev, p]);
/** you come up to them: 6 m off (where it's walkable), then walk to them */
const walkUp = who => ev(k => { const G = window.G, J = G.heroes[k], a = J.knight || J.kaizo, P = G.player, W = G.world; for (const r of [6, 7, 5, 8]) for (let i = 0; i < 16; i++) { const t = i / 16 * Math.PI * 2, x = a.pos.x + Math.sin(t) * r, z = a.pos.z + Math.cos(t) * r; if (W.walkable(x, z) !== false && !W.collision?.solidAt?.(x, z, 0.35)) { P.setPos(x, z); P.moveTarget = new G.THREE.Vector3(a.pos.x, 0, a.pos.z); return true; } } return false; }, SCN[who].key);
/** answer a scene's dialogues to its end (picks: the choices, in order) */
const drainTo = async (who, picks) => {
  const C = SCN[who], chosen = [];
  for (let i = 0; i < 40; i++) {
    if ((await phase(who, 'done')) && !(await ev(() => window.G.ui.dlg?.active))) break;
    await until(n => window.G.ui.dlg?.active || window.__ev.some(e => e[0] === n && JSON.parse(e[1]).phase === 'done'), C.ev, 15000).catch(() => {});
    chosen.push(...await drainDialogue(page, picks));
  }
  return chosen;
};
/** a whole arrival, quickly: wait for them to show, walk up, answer to the end */
const playScene = async (who, picks = [0, 0, 0, 0]) => {
  const C = SCN[who];
  await until(([k, s]) => window.G.heroes[k].state === s, [C.key, C.show], 60000).catch(() => {});
  if (who === 'golden') await sleep(page, 1400); // (at attention a moment first)
  await walkUp(who);
  await until(n => window.G.ui.dlg?.active, null, 20000).catch(() => {});
  return drainTo(who, [...picks]);
};
/** the staging as the dialogue opens: the marks, in plain view from the camera, on the paving, Shadow on his */
const staged = who => ev(k => {
  const G = window.G, S = G.heroes[k], a = S.knight || S.kaizo, st = S.stg, P = G.player, sh = G.companion, V = S.view, cam = G.engine.camera.position;
  const scr = (x, z) => (V?.occ ? V.screened(x, z, [0.3, 0.7, 1.05], 0.2, cam) : null), tile = (x, z) => G.world.terrain?.tile?.(x, z);
  const proj = p => { const v = p.clone(); v.y += 0.9; v.project(G.engine.camera); return [+((v.x + 1) / 2).toFixed(2), +((1 - v.y) / 2).toFixed(2)]; };
  const pav = (x, z) => [1, 2, 4].includes(tile(x, z)), sea = (x, z) => { for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; for (const r of [2, 3.5, 5]) if (G.world.walkable(x + Math.sin(a) * r, z + Math.cos(a) * r) === false) return true; } return false; };
  return { speaker: G.ui.dlg?.opts?.speaker || null, locked: P.controlLocked, fb: !!st?.fallback, clear: st?.clear ?? null, meHid: scr(P.pos.x, P.pos.z), themHid: a ? scr(a.pos.x, a.pos.z) : null, mePaved: pav(P.pos.x, P.pos.z), themPaved: a ? pav(a.pos.x, a.pos.z) : null, meBeach: sea(P.pos.x, P.pos.z), themBeach: a ? sea(a.pos.x, a.pos.z) : null, sh: sh?.hold ? Math.round(Math.hypot(sh.pos.x - sh.hold.x, sh.pos.z - sh.hold.z) * 10) / 10 : null, keep: !!G.sceneKeepOut, you: proj(P.pos), them: a ? proj(a.pos) : null, d: a ? +Math.hypot(a.pos.x - P.pos.x, a.pos.z - P.pos.z).toFixed(1) : null };
}, SCN[who].key);
const inFrame = p => p && p[0] > 0.08 && p[0] < 0.92 && p[1] > 0.08 && p[1] < 0.78;
const said = () => ev(() => (window.__said || []).join(' '));
const debugRun = (label, val) => ev(async ([label, val]) => { const G = window.G, { DEBUG_SECTIONS } = await import('/src/debug/registry.js'), a = DEBUG_SECTIONS.get('heroes').actions.find(x => x.label === label); return a.run(G, val); }, [label, val]);

try {
  // ================================================================ a) the trigger and the order
  if (want('a')) {
    await open({ w: 1280, h: 720 });
    await boot(page, 'fresh&nointro&notut&arrive&qcard&hour=11');
    await setup({ moka: false, lvl: 6 }); await sleep(page, 4000);
    const a0 = await J();
    await ev(() => { const G = window.G; G.state.flags.mokaJoined = true; G.state.player.lvl = 3; G.actions.recompute(); }); await sleep(page, 4000);
    const a1 = { ...await J(), hint: await ev(() => window.G.heroes.roster().find(h => h.id === 'poe').why) };
    R.check('a) no arrival before Moka joins, nor before the Bamboo opens; the wheel says when she\'ll come', !a0.due && a0.state === 'off' && !a1.due && a1.state === 'off' && a1.hint === 'Will arrive when the Bamboo opens', { a0, a1 });
    // a dialogue going on: the arrival waits for it
    await ev(() => { const G = window.G; window.__d = G.ui.dialogue({ speaker: 'Rosie', portrait: G.portrait('rosie'), lines: ['Just a moment, sweetie!'] }); G.state.player.lvl = 4; G.actions.recompute(); });
    await sleep(page, 4000);
    const a2 = { ...await J(), why: await ev(() => window.G.arrivals.why()) };
    await drainDialogue(page);
    await until(() => window.G.heroes.poeJoin.state === 'wait', null, 15000).catch(() => {});
    const a3 = { ...await J(), hint: await ev(() => window.G.heroes.roster().find(h => h.id === 'poe').why), starts: (await evs('arrival:start')).length };
    R.check('a) level 4: Poe is due; she waits for a dialogue to end, then her arrival starts in town', a2.due === 'poe' && a2.state === 'off' && a2.why === 'dialogue' && a3.state === 'wait' && a3.cur === 'poe' && a3.starts === 1 && a3.hint === 'On the way to Blossom Hollow…', { a2, a3 });
    // the old scene: none in the grove (she's not joined, the Bamboo open)
    await ev(() => window.G.enterRegion('bamboo')); await waitMode(page, 'dungeon'); await sleep(page, 6000);
    const a4 = { ...await J(), scene: (await evs('poe:joinScene')).length };
    await ev(() => window.G.returnToVillage()); await waitMode(page, 'village'); await sleep(page, 500);
    const a5 = await J();
    R.check('a) in the Bamboo Grove the old scene never plays (no Poe, no tail); back in town her arrival comes again', a4.state === 'off' && !a4.vis && !a4.scene && a5.due === 'poe', { a4, a5 });
    await close();
  }
  // ================================================================ b) her scene on the island, end to end; c) the quest by you
  if (want('b') || want('c')) {
    await open({ w: 1920, h: 1080 });
    await boot(page, 'fresh&nointro&notut&arrive&qcard&hour=11');
    await setup({ lvl: 4 });
    await until(() => window.G.heroes.poeJoin.state === 'wait', null, 20000).catch(() => {});
    await walkPlaza(); await until(() => window.G.heroes.poeJoin.state === 'tail', null, 20000).catch(() => {});
    await ev(() => { window.G.player.moveTarget = null; }); // (stand still: she creeps up behind you, and never walks into you)
    await until(() => { const S = window.G.heroes.poeJoin; return S.state === 'tail' && S.poe && S.onScreen(S.poe.pos.x, S.poe.pos.y, S.poe.pos.z) && S.poe.anim.action?.name === 'sneakWalk'; }, null, 8000).catch(() => {});
    const b0 = { ...await J(), map: await ev(async () => { const M = await import('/src/world/mapData.js'); const e = M.people(window.G).find(p => p.key === 'p:arrival:poe'); return e ? { name: e.name, role: e.role, vis: e.visible, badge: e.badge } : null; }), hint: await ev(() => window.G.heroes.roster().find(h => h.id === 'poe').why) };
    await shot('b0-tail');
    R.check('b) round the plaza she tails you: crouched, a few metres back, on screen; on the maps a sneaky somebody ("???", "!")', b0.state === 'tail' && b0.vis && b0.act === 'sneakWalk' && b0.d > 2.5 && b0.d < 14 && b0.on && b0.map?.name === '???' && b0.map.vis && b0.map.badge === '!' && /arriving/i.test(b0.hint), b0);
    await ev(() => { const S = window.G.heroes.poeJoin, P = window.G.player; P.moveTarget = null; P.faceTo(S.poe.pos.x, S.poe.pos.z); P.facing = P.faceTarget; });
    await until(() => window.G.heroes.poeJoin.frozen || window.G.heroes.poeJoin.state !== 'tail', null, 3000).catch(() => {});
    const b1 = await J(); await shot('b1-freeze');
    R.check('b) look her way and she freezes stiff (a very convincing lantern post)', b1.frozen && b1.act === 'ninjaFreeze', b1);
    await catchHer();
    await until(() => window.G.ui.dlg?.active, null, 15000).catch(() => {});
    await sleep(page, 600);
    const b2 = await ev(() => { const G = window.G, S = G.heroes.poeJoin, st = S.stg, P = G.player, sh = G.companion, V = S.view, k = G.sceneKeepOut;
      const cam = G.engine.camera.position, scr = (x, z, hs) => (V ? V.screened(x, z, hs, 0.2, cam) : null);
      const proj = p => { const v = p.clone(); v.y += 0.9; v.project(G.engine.camera); return [+((v.x + 1) / 2).toFixed(2), +((1 - v.y) / 2).toFixed(2)]; };
      return { speaker: G.ui.dlg?.opts?.speaker, locked: P.controlLocked, st: st ? { moved: st.moved, fallback: !!st.fallback } : null, meHid: scr(P.pos.x, P.pos.z), herHid: S.poe ? scr(S.poe.pos.x, S.poe.pos.z) : null, sh: sh.hold?.poe ? Math.round(Math.hypot(sh.pos.x - sh.hold.x, sh.pos.z - sh.hold.z) * 10) / 10 : null, keep: !!k, near: G.npcs.filter(n => n.visible !== false && k && Math.hypot(n.pos.x - k.x, n.pos.z - k.z) < k.r - 0.6).map(n => n.id), you: proj(P.pos), her: S.poe ? proj(S.poe.pos) : null, d: S.poe ? +Math.hypot(S.poe.pos.x - P.pos.x, S.poe.pos.z - P.pos.z).toFixed(1) : null }; });
    await shot('b2-talk');
    const inFrame = p => p && p[0] > 0.1 && p[0] < 0.9 && p[1] > 0.1 && p[1] < 0.75;
    R.check('b) walk up to her: ACHOO! — caught; Poe talks, controls locked; your marks in plain view (no roof, tree or garland over you two), Shadow on his, the villagers walking round', b2.speaker === 'Poe' && b2.locked && b2.st && !b2.st.fallback && b2.meHid === false && b2.herHid === false && b2.sh != null && b2.sh < 0.6 && b2.keep && !b2.near.length && inFrame(b2.you) && inFrame(b2.her) && b2.d > 1.6 && b2.d < 3, b2);
    // the dialogue: the test, then the plea
    let plea = '';
    for (let i = 0; i < 30 && !/under siege/.test(plea); i++) { plea = await dlgText(); if (/under siege/.test(plea)) break; await drainDialogue(page, [1], 1); await sleep(page, 120); }
    await shot('b3-plea');
    const picked = await drainScene([0]);
    await until(() => window.__ev.some(e => e[0] === 'arrival:done'), null, 10000).catch(() => {});
    await sleep(page, 900);
    const b3 = await ev(() => { const G = window.G, v = G.heroes.villagers.poe, h = G.heroes.homeSpot('poe'); return { joined: !!G.state.flags.poeJoined, rec: G.state.flags.arrivals?.bamboo || null, act: G.state.quests.active.map(q => q.id), v: !!v, near: v ? Math.round(Math.hypot(v.pos.x - h.x, v.pos.z - h.z)) : -1, locked: G.player.controlLocked, actor: !!G.heroes.poeJoin.poe, keep: !!G.sceneKeepOut, hold: !!G.companion.hold, lvl: G.state.heroes.poe.player.lvl }; });
    R.check('b) her plea (Takemori is under siege, she came to fetch help); she joins (near the pack\'s level) and vanishes: a villager at the cottage; the arrival recorded, her quest started; nothing of the scene left', /Takemori is under siege/.test(plea) && b3.joined && b3.lvl >= 2 && b3.rec?.quest === 'start' && b3.act.includes('hq_takemori') && b3.v && b3.near < 12 && !b3.locked && !b3.actor && !b3.keep && !b3.hold && picked.length >= 1, { plea, b3, picked });
    await cardOpen().catch(() => {});
    await sleep(page, 500);
    const b4 = await ev(() => { const c = document.querySelector('.p-qcard'); return { open: window.G.questMoments.open, title: c?.querySelector('.qc-title, h2, .qc-t')?.textContent || c?.textContent?.slice(0, 80), text: c?.textContent || '', lead: !!c?.querySelector('.qc-lead') || /Shadow knows the way/.test(c?.textContent || '') }; });
    await shot('b4-card');
    R.check('b) the quest card: "Takemori Under Siege", her hook in her voice, the goal (Save Takemori Village · the Whispering Bamboo Grove), Shadow knows the way', b4.open === 'hq_takemori' && /Takemori Under Siege/.test(b4.text) && /I… came to fetch help/.test(b4.text) && /Save Takemori Village/.test(b4.text) && /Whispering Bamboo Grove/.test(b4.text) && b4.lead, { ...b4, text: b4.text.slice(0, 200) });
    await page.keyboard.press('Enter');
    await until(() => !window.G.questMoments.open, null, 6000).catch(() => {});
    const b5 = await ev(() => { const G = window.G, t = G.story.target('hq_takemori'); return { label: t?.label || null, lead: !!G.lead?.intent, step: G.state.quests.active.find(q => q.id === 'hq_takemori')?.step }; });
    R.check('b) Let\'s go!: the pointer at the Wayfarer\'s Post (the travel step), Shadow leading the way', b5.label === "The Wayfarer's Post" && b5.step === 0 && b5.lead, b5);
    if (want('c')) {
      // ---- c) the quest by you
      await ev(() => { window.G.lead?.stop?.('qa'); window.G.travel?.go ? window.G.travel.go('bamboo') : window.G.enterRegion('bamboo'); });
      await waitMode(page, 'dungeon', 30000); await sleep(page, 1500);
      await until(() => window.__ev.some(e => e[0] === 'quest:place' && JSON.parse(e[1]).quest === 'hq_takemori'), null, 12000).catch(() => {});
      const c0 = { q: await quest('hq_takemori'), title: await ev(() => window.G.questMoments.stats.lastTitle) };
      await shot('c0-title');
      R.check('c) arriving in the Bamboo finishes the travel step: "Save Takemori Village" next, its place title (the quest\'s ribbon, the grove)', c0.q?.step === 1 && c0.title?.quest === 'hq_takemori' && c0.title.kicker === 'Takemori Under Siege' && /Save Takemori Village/.test(c0.title.sub), c0);
      await ev(() => { for (const m of window.G.dungeon.monsters) { m.pos.set(-500, 0, -500); m.aggro = false; } });
      await until(() => window.__ev.some(e => e[0] === 'quest:line' && JSON.parse(e[1]).quest === 'hq_takemori' && JSON.parse(e[1]).beat === 'arrive'), null, 30000).catch(() => {});
      const c1 = (await evs('quest:line')).filter(l => l.quest === 'hq_takemori');
      R.check("c) Shadow's line on arriving (the quest's own)", c1.some(l => l.beat === 'arrive' && /Takemori is just up the trail/.test(l.text)), c1);
      await ev(() => window.G.zoneDebug.saveVillage('bamboo'));
      await until(() => !!window.G.state.quests.active.find(q => q.id === 'hq_takemori')?.handIn, null, 12000).catch(() => {});
      const c2 = { q: await quest('hq_takemori'), t: await ev(() => window.G.story.target('hq_takemori')?.label || null) };
      R.check('c) Takemori saved: the quest waits for its hand-in to Poe; the pointer to the Wayfarer\'s Stone', c2.q?.handIn && c2.t === "The Wayfarer's Stone", c2);
      await ev(() => window.G.returnToVillage()); await waitMode(page, 'village', 30000); await sleep(page, 1500);
      const c3 = await ev(() => { const G = window.G, t = G.story.target('hq_takemori'), v = G.heroes.villagers.poe; return { label: t?.label || null, at: t && v ? Math.round(Math.hypot(t.pos.x - (v.visible === false ? (v.homeInfo?.door || v.home).x : v.pos.x), t.pos.z - (v.visible === false ? (v.homeInfo?.door || v.home).z : v.pos.z))) : -1, mark: G.story.markerFor('poe'), text: G.story.uiList().find(q => q.id === 'hq_takemori')?.steps.slice(-1)[0]?.text }; });
      R.check('c) back in town the pointer and her "!" point at Poe; the step reads "Tell Poe that Takemori is safe"', /Poe/.test(c3.label || '') && c3.at >= 0 && c3.at < 2 && c3.mark === '!' && c3.text === 'Tell Poe that Takemori is safe', c3);
      const before = await ev(() => ({ coins: window.G.state.coins, pts: window.G.state.heroes.chewy.player.skillPts, scroll: window.G.state.furniture?.hangingScroll || 0, stamps: window.G.questMoments.stats.stamps }));
      // (bedtime: she's indoors at the cottage; the pointer says so, and inside she's the one at home: home/housing.js)
      const cIn = await ev(() => { const G = window.G, v = G.heroes.villagers.poe; v.state = 'inside'; v.visible = false; const t = G.story.target('hq_takemori'); return { label: t?.label || null, giver: G.arrivals.handInGiver() }; });
      await ev(() => { window.G.housing.enter(); });
      await until(() => window.G.mode === 'interior' && !window.G.ui.iris?.active, null, 15000).catch(() => {});
      await until(() => !!window.G.housing.hosted('poe'), null, 8000).catch(() => {});
      const cHost = await ev(() => { const G = window.G, v = G.housing.hosted('poe'); if (v) { G.player.setPos(v.pos.x + 0.9, v.pos.z + 0.5); G.talkTo(v); } return { hosted: !!v, mode: G.mode }; });
      await until(() => window.G.ui.dlg?.active, null, 8000).catch(() => {});
      const thanks = await dlgText(); await shot('c4-handin');
      await drainDialogue(page);
      await until(() => window.G.state.quests.done.includes('hq_takemori'), null, 8000).catch(() => {});
      await sleep(page, 2600);
      const c4 = await ev(b => ({ done: window.G.state.quests.done.includes('hq_takemori'), coins: window.G.state.coins - b.coins, pts: window.G.state.heroes.chewy.player.skillPts - b.pts, scroll: (window.G.state.furniture?.hangingScroll || 0) - b.scroll, stamps: window.G.questMoments.stats.stamps - b.stamps, handed: window.__ev.filter(e => e[0] === 'quest:handedIn').map(e => JSON.parse(e[1]).id) }), before);
      R.check('c) at bedtime she is indoors: the pointer says so; in the cottage she is the hero at home; talking to her: her thanks ("You saved my whole village…"), the quest done, the reward (400 coins, a skill point, the Hanging Scroll), the stamp', /indoors/.test(cIn.label || '') && cIn.giver === 'poe' && cHost.hosted && cHost.mode === 'interior' && /You saved my whole village/.test(thanks) && c4.done && c4.coins >= 400 && c4.pts >= 1 && c4.scroll === 1 && c4.stamps >= 1 && c4.handed.includes('hq_takemori'), { cIn, cHost, thanks, c4 });
    }
    await close();
  }
  // ================================================================ d) saved by a crew
  if (want('d')) {
    await open({ w: 1280, h: 720 });
    await boot(page, 'fresh&nointro&notut&arrive&qcard&hour=11');
    await setup({ lvl: 4 });
    await playPoe([1, 0]);
    await until(() => window.G.state.quests.active.some(q => q.id === 'hq_takemori'), null, 8000).catch(() => {});
    await cardOpen().catch(() => {}); await page.keyboard.press('Escape'); await sleep(page, 300);
    // a real relief: Moka's crew (she's strong enough), the trip skipped on the world clock
    const sent = await ev(() => { const G = window.G; G.state.heroes.moka.player.lvl = 30; G.state.pantry = { roastedVeggies: 6 }; G.state.cozy.guild && (G.state.cozy.guild.level = 3); const r = G.cozy.exp.send('relief:bamboo', ['hero:moka'], { meals: { roastedVeggies: 1 } }); return { ok: !!r?.ok, why: r?.why || null }; });
    for (let k = 0; k < 6 && (await ev(() => window.G.state.zones.bamboo.village)) !== 'saved'; k++) { await ev(() => { window.G.cozy.clock.add(4); }); await sleep(page, 1500); }
    await until(() => !!window.G.state.quests.active.find(q => q.id === 'hq_takemori')?.handIn, null, 15000).catch(() => {});
    const d0 = { sent, q: await quest('hq_takemori'), saved: await ev(() => ({ v: window.G.state.zones.bamboo.village, by: window.G.state.zones.bamboo.savedBy })) };
    R.check('d) Moka\'s crew relieves Takemori: the quest goes straight to its hand-in, its record naming the crew', d0.sent.ok && d0.saved.v === 'saved' && d0.saved.by === 'crew' && d0.q?.handIn && d0.q.crewBy === 'Moka', d0);
    await until(() => !window.G.heroes.away('moka') && !!window.G.heroes.villagers.poe, null, 10000).catch(() => {});
    await ev(() => { const G = window.G, v = G.heroes.villagers.poe; v.state = 'idle'; v.visible = true; G.player.setPos(v.pos.x + 1.2, v.pos.z + 0.6); G.talkTo(v); });
    await until(() => window.G.ui.dlg?.active, null, 8000).catch(() => {});
    const d1 = await dlgText(); await drainDialogue(page);
    await until(() => window.G.state.quests.done.includes('hq_takemori'), null, 8000).catch(() => {});
    const lines = (await evs('quest:line')).filter(l => l.quest === 'hq_takemori' && l.beat === 'home');
    R.check('d) at the hand-in Poe\'s first line is about the crew ("Moka snuck into Takemori…"), then her thanks; Shadow says no way-home line (he wasn\'t there)', /^Moka snuck into Takemori/.test(d1) && /You saved my whole village/.test(d1) && !lines.length && (await quest('hq_takemori')) === 'done', { d1, lines });
    // the giver went too: "Moka and I…" (the crew's record as the relief leaves it)
    const d2 = await ev(() => { const G = window.G, A = G.arrivals, Q = G.state.quests; Q.done = Q.done.filter(id => id !== 'hq_takemori'); Q.active.push({ id: 'hq_takemori', step: 1, prog: 0 }); G.state.zones.bamboo.village = 'besieged'; G.state.zones.bamboo.celebrateCrew = ['hero:moka', 'hero:poe']; G.state.zones.bamboo.village = 'saved'; G.state.zones.bamboo.savedBy = 'crew'; A.onSaved({ zone: 'bamboo', crew: true }); const q = Q.active.find(x => x.id === 'hq_takemori'); return { crewBy: q.crewBy, crewWith: q.crewWith }; });
    R.check('d) when Poe went with the crew, her record says who else did ("Moka"), for her line "Moka and I chased the siege out…"', d2.crewBy === "Moka's crew" && d2.crewWith === 'Moka', d2);
    await close();
  }
  // ================================================================ e) playing Poe herself
  if (want('e')) {
    await open({ w: 1280, h: 720 });
    await boot(page, 'fresh&nointro&notut&arrive&qcard&hour=11');
    await setup({ lvl: 4 });
    await playPoe([0, 0]);
    await until(() => window.G.state.quests.active.some(q => q.id === 'hq_takemori'), null, 8000).catch(() => {});
    await cardOpen().catch(() => {}); await page.keyboard.press('Escape'); await sleep(page, 300);
    await ev(() => { const G = window.G; G.heroes.cd = 0; G.heroes.switchTo('poe', { quiet: true }); });
    await until(() => window.G.state.activeHero === 'poe' && !window.G.heroes.switching, null, 15000).catch(() => {});
    await ev(() => window.G.enterRegion('bamboo')); await waitMode(page, 'dungeon', 30000); await sleep(page, 1200);
    await ev(() => { for (const m of window.G.dungeon.monsters) { m.pos.set(-500, 0, -500); m.aggro = false; } window.G.zoneDebug.saveVillage('bamboo'); });
    await until(() => window.G.ui.dlg?.active && window.G.ui.dlg.opts?.speaker === 'Poe', null, 30000).catch(() => {});
    const e0 = { text: await dlgText(), speaker: await ev(() => window.G.ui.dlg?.opts?.speaker), hero: await ev(() => window.G.state.activeHero) };
    await shot('e0-self');
    await drainDialogue(page);
    await until(() => window.G.state.quests.done.includes('hq_takemori'), null, 8000).catch(() => {});
    const e1 = await ev(() => ({ done: window.G.state.quests.done.includes('hq_takemori'), self: window.G.arrivals.stats.self, locked: window.G.player.controlLocked }));
    R.check('e) playing Poe, Takemori saved: her own hand-in where she is (her line to Shadow: "We did it, Shadow!"), the quest done, controls back', e0.hero === 'poe' && e0.speaker === 'Poe' && /We did it, Shadow/.test(e0.text) && e1.done && e1.self === 1 && !e1.locked, { e0, e1 });
    await close();
  }
  // ================================================================ f) old saves, each with a second reload
  if (want('f')) {
    await open({ w: 1280, h: 720 });
    // 1. Poe joined in the bamboo already (an old save), Takemori besieged, no quest
    await boot(page, 'fresh&nointro&notut&hour=11'); await setup({ lvl: 6 });
    await loadSave("s.flags.mokaJoined = true; s.flags.poeJoined = true; delete s.flags.arrivals; s.quests.active = s.quests.active.filter(q => q.id !== 'hq_takemori' && q.id !== 'welcome'); s.quests.done = s.quests.done.filter(id => id !== 'hq_takemori'); s.quests.cards = [];");
    await setup({ lvl: 6 });
    await until(() => window.G.state.quests.active.some(q => q.id === 'hq_takemori'), null, 20000).catch(() => {});
    await sleep(page, 2000);
    const f1 = await ev(() => { const G = window.G; return { act: G.state.quests.active.filter(q => q.id === 'hq_takemori').length, scene: G.heroes.poeJoin.state, starts: window.__ev.filter(e => e[0] === 'arrival:start').length, owed: window.__ev.filter(e => e[0] === 'arrival:quest').map(e => JSON.parse(e[1]).how), card: G.questMoments.open === 'hq_takemori' || (G.state.quests.cards || []).includes('hq_takemori'), rec: G.state.flags.arrivals?.bamboo?.how }; });
    await page.keyboard.press('Escape'); await sleep(page, 300);
    await reload(); await setup({ lvl: 6 }); await sleep(page, 6000);
    const f1b = await ev(() => ({ act: window.G.state.quests.active.filter(q => q.id === 'hq_takemori').length, scene: window.G.heroes.poeJoin.state, starts: window.__ev.filter(e => e[0] === 'arrival:start').length }));
    R.check('f) an old save with Poe joined in the bamboo: no arrival, her quest starts quietly (its card); a second reload: still one quest, no arrival', f1.act === 1 && f1.scene === 'off' && !f1.starts && f1.owed.includes('owed') && f1.card && f1.rec === 'old' && f1b.act === 1 && f1b.scene === 'off' && !f1b.starts, { f1, f1b });
    // 2. Takemori saved before she came (a crew), Poe not joined
    await loadSave("s.flags.mokaJoined = true; s.flags.poeJoined = false; delete s.flags.arrivals; s.quests.active = s.quests.active.filter(q => q.id !== 'hq_takemori' && q.id !== 'welcome'); s.quests.done = s.quests.done.filter(id => id !== 'hq_takemori'); s.quests.cards = []; s.zones.bamboo.village = 'saved'; s.zones.bamboo.savedBy = 'crew';");
    await setup({ lvl: 6 });
    const p2 = await playPoe([1, 0]);
    await until(() => window.__ev.some(e => e[0] === 'arrival:done'), null, 10000).catch(() => {});
    const f2 = await ev(() => { const G = window.G; return { joined: !!G.state.flags.poeJoined, quest: G.state.quests.active.some(q => q.id === 'hq_takemori') || G.state.quests.done.includes('hq_takemori'), rec: G.state.flags.arrivals?.bamboo || null, done: window.__ev.filter(e => e[0] === 'arrival:done').map(e => JSON.parse(e[1]).plan) }; });
    const said = await ev(() => window.__said || null);
    await reload(); await setup({ lvl: 6 }); await sleep(page, 6000);
    const f2b = await ev(() => ({ scene: window.G.heroes.poeJoin.state, quest: window.G.state.quests.active.some(q => q.id === 'hq_takemori'), starts: window.__ev.filter(e => e[0] === 'arrival:start').length }));
    const thank = (said || []).join(' ');
    R.check('f) Takemori saved before she came: she still arrives and joins, with a thank-you (your crew chased the yokai off) and no plea, no quest; a second reload: no second arrival, still no quest', f2.joined && !f2.quest && f2.rec?.quest === 'saved' && f2.done.includes('saved') && /your crew already chased the yokai off/.test(thank) && /thank-you visit/.test(thank) && !/under siege/.test(thank) && f2b.scene === 'off' && !f2b.quest && !f2b.starts, { f2, f2b, p2, thank: thank.slice(0, 300) });
    // 3. the Bamboo open and no Poe: she arrives the next time you're in town; a reload mid-wait doesn't strand her
    await loadSave("s.flags.mokaJoined = true; s.flags.poeJoined = false; delete s.flags.arrivals; s.quests.active = s.quests.active.filter(q => q.id !== 'hq_takemori' && q.id !== 'welcome'); s.quests.done = s.quests.done.filter(id => id !== 'hq_takemori'); s.quests.cards = []; s.zones.bamboo.village = 'besieged'; s.zones.bamboo.savedBy = null;");
    await setup({ lvl: 6 });
    await until(() => window.G.heroes.poeJoin.state === 'wait', null, 20000).catch(() => {});
    const f3 = await J();
    await reload(); await setup({ lvl: 6 });
    await until(() => window.G.heroes.poeJoin.state === 'wait', null, 20000).catch(() => {});
    const f3b = await J();
    R.check('f) the Bamboo open and no Poe: she arrives the next time you\'re in town; a reload mid-wait: she comes again', f3.state === 'wait' && f3.cur === 'poe' && f3b.state === 'wait' && f3b.cur === 'poe' && !f3b.joined, { f3, f3b });
    await close();
  }
  // ================================================================ g) the pad (the Deck)
  if (want('g')) {
    await open({ w: 1280, h: 800 });
    await boot(page, 'fresh&nointro&notut&arrive&qcard&hour=11');
    await installPad(page); await padTap(page, 'DDown');
    await ev(() => { const G = window.G; if (G.ui.dlg.active) G.ui.dlg.finish(-1); }); await until(() => !window.G.ui.dlg.active && !window.G.player.controlLocked, null, 8000).catch(() => {});
    await setup({ lvl: 4 });
    await until(() => window.G.heroes.poeJoin.state === 'wait', null, 20000).catch(() => {});
    await walkPlaza(); await until(() => window.G.heroes.poeJoin.state === 'tail', null, 20000).catch(() => {}); await sleep(page, 2200); await catchHer();
    await until(() => window.G.ui.dlg?.active, null, 15000).catch(() => {});
    await shot('g0-deck-talk');
    let picks = 0, steps = 0;
    for (; steps < 80; steps++) {
      const s = await ev(() => { const D = window.G.ui.dlg, done = window.__ev.some(e => e[0] === 'poe:joinScene' && JSON.parse(e[1]).phase === 'done'); return { a: !!D.active, picking: !!(D.active && D.choices?.length && D.i >= D.lines.length - 1 && !D.typing), done }; });
      if (s.done) break;
      if (!s.a) { await sleep(page, 250); continue; }
      if (s.picking) { picks++; await padTap(page, 'DDown'); await sleep(page, 120); }
      await padTap(page, 'A'); await sleep(page, 220);
    }
    await cardOpen().catch(() => {}); await until(() => window.G.ui.padNav?.cur?.classList.contains('qc-go'), null, 5000).catch(() => {});
    const g0 = await ev(() => ({ dev: window.G.controls.device, joined: !!window.G.state.flags.poeJoined, open: window.G.questMoments.open, focus: window.G.ui.padNav?.cur?.className || '' }));
    await shot('g1-deck-card');
    await padTap(page, 'A'); await until(() => !window.G.questMoments.open, null, 6000).catch(() => {});
    const g1 = await ev(() => ({ open: window.G.questMoments.open, q: window.G.state.quests.active.some(q => q.id === 'hq_takemori') }));
    R.check('g) the pad on the Deck: A reads the scene on, the D-pad and A pick her choices; she joins; the card\'s focus on Let\'s go!, A presses it', g0.dev === 'pad' && g0.joined && picks >= 2 && g0.open === 'hq_takemori' && /qc-go/.test(g0.focus) && !g1.open && g1.q, { g0, g1, picks, steps });
    await close();
  }
  // ================================================================ h) touch (a phone)
  if (want('h')) {
    const T = await open({ touch: true });
    await boot(page, 'fresh&nointro&notut&arrive&qcard&hour=11');
    await setup({ lvl: 4 });
    await until(() => window.G.heroes.poeJoin.state === 'wait', null, 20000).catch(() => {});
    await walkPlaza(); await until(() => window.G.heroes.poeJoin.state === 'tail', null, 20000).catch(() => {}); await sleep(page, 2200); await catchHer();
    await until(() => window.G.ui.dlg?.active, null, 15000).catch(() => {});
    await sleep(page, 500); await shot('h0-phone-talk');
    let taps = 0, picked = 0;
    for (let i = 0; i < 90; i++) {
      const s = await ev(() => { const D = window.G.ui.dlg, done = window.__ev.some(e => e[0] === 'poe:joinScene' && JSON.parse(e[1]).phase === 'done'); const b = D.active && D.choices?.length && D.i >= D.lines.length - 1 && !D.typing ? [...document.querySelectorAll('.dlg .dch')].filter(e => e.offsetParent).map(e => { const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2, r.height]; }) : null; return { a: !!D.active, b, done }; });
      if (s.done) break;
      if (!s.a) { await sleep(page, 250); continue; }
      if (s.b?.length) { const c = s.b[0]; await T.F.tap(c[0], c[1]); picked++; if (c[2] < 44) picked = -99; await sleep(page, 450); continue; }
      await T.F.tap(420, 110); taps++; await sleep(page, 220);
    }
    await cardOpen().catch(() => {}); await sleep(page, 400); await shot('h1-phone-card');
    const go = await ev(() => { const b = document.querySelector('.p-qcard .qc-go')?.getBoundingClientRect(); return b ? [b.left + b.width / 2, b.top + b.height / 2, Math.min(b.width, b.height)] : null; });
    if (go) await T.F.tap(go[0], go[1]);
    await until(() => !window.G.questMoments.open, null, 6000).catch(() => {});
    const h0 = await ev(() => ({ joined: !!window.G.state.flags.poeJoined, open: window.G.questMoments.open, q: window.G.state.quests.active.some(q => q.id === 'hq_takemori'), phone: window.G.ui.root.classList.contains('m-phone') }));
    R.check('h) touch on a phone: taps read the scene on, a tap picks her choices (44 px buttons); she joins; a tap on Let\'s go! presses the card', h0.phone && h0.joined && picked >= 2 && taps >= 3 && go?.[2] >= 44 && !h0.open && h0.q, { h0, picked, taps, go });
    await close();
  }
  // ================================================================ i) the debug menu's Arrivals
  if (want('i')) {
    await open({ w: 1280, h: 720 });
    await boot(page, 'fresh&nointro&notut&arrive&qcard&hour=11');
    await setup({ lvl: 4 });
    await playPoe([1, 0]);
    await until(() => window.G.state.quests.active.some(q => q.id === 'hq_takemori'), null, 8000).catch(() => {});
    await cardOpen().catch(() => {}); await page.keyboard.press('Escape'); await sleep(page, 300);
    const i0 = await ev(async () => { const G = window.G, { DEBUG_SECTIONS } = await import('/src/debug/registry.js'), S = DEBUG_SECTIONS.get('heroes'), a = S.actions.find(x => x.label === 'Play an arrival'); const ch = typeof a.choices === 'function' ? a.choices(G) : a.choices; const msg = a.run(G, 'poe'); return { ch: ch.map(c => c.value), msg, joined: !!G.state.flags.poeJoined, q: G.state.quests.active.some(q => q.id === 'hq_takemori'), state: G.heroes.poeJoin.state, v: !!G.heroes.villagers.poe }; });
    await walkPlaza(); await until(() => window.G.heroes.poeJoin.state === 'tail', null, 20000).catch(() => {});
    const i1 = await J();
    R.check('i) debug › Play an arrival (Poe): she isn\'t joined, her quest forgotten, her scene starts again in town', i0.ch.includes('poe') && /on the way/.test(i0.msg) && !i0.joined && !i0.q && i0.state === 'wait' && !i0.v && i1.state === 'tail', { i0, i1 });
    await sleep(page, 2000); await catchHer(); await drainScene([1, 0]);
    await until(() => window.G.state.quests.active.some(q => q.id === 'hq_takemori'), null, 8000).catch(() => {});
    const i2 = await ev(async () => { const G = window.G, { DEBUG_SECTIONS } = await import('/src/debug/registry.js'), a = DEBUG_SECTIONS.get('heroes').actions.find(x => x.label === 'Reset the arrivals'); const msg = a.run(G); return { msg, joined: !!G.state.flags.poeJoined, q: G.state.quests.active.some(q => q.id === 'hq_takemori'), rec: G.state.flags.arrivals?.bamboo || null, due: G.arrivals.due()?.who || null }; });
    R.check('i) debug › Reset the arrivals: Poe not joined, her quest and record forgotten, her arrival due again', !i2.joined && !i2.q && !i2.rec && i2.due === 'poe' && /again/.test(i2.msg), i2);
    await close();
  }
  // ================================================================ j) Floofy's and Foosy's triggers, Kaizo's, and the order
  if (want('j')) {
    await open({ w: 1280, h: 720 });
    await boot(page, 'fresh&nointro&notut&arrive&qcard&hour=11');
    await setup({ lvl: 11 }); await ev(() => { window.G.arrivals.enabled = false; });
    const due = () => ev(() => window.G.arrivals.due()?.who || null), wheel = id => ev(id => window.G.heroes.roster().find(h => h.id === id).why, id);
    const j0 = { due: await due(), stz: await wheel('shihtzu') };
    // Poe joined (her quest done), level 5: Momiji Hollow shut
    await ev(() => { const G = window.G, F = G.state.flags; F.poeJoined = true; (F.arrivals ||= {}).bamboo = { how: 'scene', quest: 'start', day: 1 }; G.state.quests.done.push('hq_takemori'); G.state.player.lvl = 5; G.actions.recompute(); });
    const j1 = { due: await due(), stz: await wheel('shihtzu'), gld: await wheel('golden') };
    // the Burrow in the bamboo cleared by a crew, by you; level 11 alone
    await ev(() => { window.G.state.zones.bamboo.dungeon.crew = 1; }); const j2 = await due();
    await ev(() => { const z = window.G.state.zones.bamboo; z.dungeon.crew = 0; z.dungeon.cleared = 1; }); const j3 = await due();
    await ev(() => { const G = window.G; G.state.zones.bamboo.dungeon.cleared = 0; G.state.player.lvl = 11; G.actions.recompute(); }); const j4 = await due();
    R.check('j) Floofy: not before Poe joins (the wheel: "Will arrive after Poe joins"), nor before Momiji Hollow opens ("Will arrive when Momiji Hollow opens"); then due when the Bamboo\'s dungeon is cleared by a crew, by you, or at level 11', j0.due === 'poe' && j0.stz === 'Will arrive after Poe joins' && j1.due === null && j1.stz === 'Will arrive when Momiji Hollow opens' && j2 === 'shihtzu' && j3 === 'shihtzu' && j4 === 'shihtzu', { j0, j1, j2, j3, j4 });
    // Kaizo after Floofy, Foosy after Kaizo
    await ev(() => { const G = window.G, F = G.state.flags; G.state.player.lvl = 30; G.actions.recompute(); });
    const k0 = { due: await due(), gld: await wheel('golden') };
    await ev(() => { const G = window.G, F = G.state.flags; F.shihtzuJoined = true; F.arrivals.maple = { how: 'scene', quest: 'start', day: 1 }; G.state.quests.done.push('hq_akane'); G.state.player.lvl = 17; G.actions.recompute(); });
    const k1 = await due();
    await ev(() => { const G = window.G; G.state.zones.maple.dungeon.cleared = 1; }); const k2 = { due: await due(), gld: await wheel('golden') };
    await ev(() => { const G = window.G; G.state.zones.maple.dungeon.cleared = 0; G.state.player.lvl = 26; G.actions.recompute(); }); const k2b = { due: await due(), gld: await wheel('golden') };
    await ev(() => { const G = window.G; G.state.flags.arrivals.tidepool = { how: 'scene', quest: 'start', day: 1 }; G.state.quests.done.push('hq_shiokaze'); });
    const k3 = { due: await due(), gld: await wheel('golden') };
    R.check('j) the order holds: Captain Kaizo comes once Floofy has joined and the Tide Pool opens (level 18, or Momiji Hollow\'s dungeon cleared); Foosy once the Onsen opens and Kaizo has come (the wheel: "Will arrive when the Onsen opens", "…after Old Captain Kaizo comes by", then "On the way…")', k0.due === 'shihtzu' && k1 === null && k2.due === 'sk_kaizo' && k2.gld === 'Will arrive when the Onsen opens' && k2b.due === 'sk_kaizo' && k2b.gld === 'Will arrive after Old Captain Kaizo comes by' && k3.due === 'golden' && /On the way to Blossom Hollow/.test(k3.gld), { k0, k1, k2, k2b, k3 });
    // the old zone scenes never play: Momiji Hollow and the Onsen, their heroes not joined
    await ev(() => { const G = window.G, F = G.state.flags; F.shihtzuJoined = false; delete F.arrivals.maple; G.state.quests.done = G.state.quests.done.filter(q => q !== 'hq_akane'); G.arrivals.enabled = true; });
    await ev(() => window.G.enterRegion('maple')); await waitMode(page, 'dungeon', 30000); await sleep(page, 5000);
    const j5 = { ...await A('shihtzu'), scene: (await evs('shihtzu:joinScene')).length };
    await ev(() => window.G.returnToVillage()); await waitMode(page, 'village', 30000);
    await ev(() => { const G = window.G, F = G.state.flags; F.shihtzuJoined = true; F.arrivals.maple = { how: 'scene', quest: 'start', day: 1 }; G.state.quests.done.push('hq_akane'); delete F.arrivals.tidepool; G.arrivals.enabled = false; });
    await ev(() => window.G.enterRegion('onsen')); await waitMode(page, 'dungeon', 30000); await sleep(page, 5000);
    const j6 = { ...await A('golden'), scene: (await evs('golden:joinScene')).length };
    R.check('j) in Momiji Hollow and at the Onsen the old scenes never play (no knight at dusk, no guard by the springs)', j5.state === 'off' && !j5.vis && !j5.scene && j6.state === 'off' && !j6.vis && !j6.scene, { j5, j6 });
    await close();
  }
  // ================================================================ k) Floofy on the Shrine Road, end to end, at dusk; his quest
  if (want('k')) {
    await open({ w: 1920, h: 1080 });
    await boot(page, 'fresh&nointro&notut&arrive&qcard&hour=18.2');
    await setupFor('shihtzu');
    await until(() => window.G.heroes.stzJoin.state === 'kneel', null, 60000).catch(() => {});
    await until(() => window.G.heroes.stzJoin.lanterns.filter(L => L.want > 0).length >= 2, null, 8000).catch(() => {});
    await until(() => !!window.G.state.flags.hints?.stzLanternsTown, null, 10000).catch(() => {});
    const k0 = { ...await A('shihtzu'), lan: await ev(() => window.G.heroes.stzJoin.lanterns.length), paved: await ev(() => { const S = window.G.heroes.stzJoin; return [1, 2].includes(window.G.world.terrain.tile(S.spot.x, S.spot.z)); }), map: await ev(async () => { const M = await import('/src/world/mapData.js'); const e = M.people(window.G).find(p => p.key === 'p:arrival:shihtzu'); return e ? { name: e.name, role: e.role } : null; }), ptr: await ev(() => window.G.questTarget?.()?.label || null), tip: await ev(() => !!window.G.state.flags.hints?.stzLanternsTown), wheel: await ev(() => window.G.heroes.roster().find(h => h.id === 'shihtzu').why) };
    await shot('k0-kneel');
    R.check('k) Floofy kneels on the Shrine Road\'s paving by his three lanterns, lighting them; Shadow\'s tip; on the maps a somebody ("???", lighting lanterns), the pointer "Ghostlights on the Shrine Road"; the wheel: arriving now', k0.state === 'kneel' && k0.vis && k0.act === 'stzKneel' && k0.lan === 3 && k0.paved && k0.map?.name === '???' && /lanterns/i.test(k0.map.role) && k0.ptr === 'Ghostlights on the Shrine Road' && k0.tip && /arriving/i.test(k0.wheel), k0);
    await walkUp('shihtzu');
    await until(() => window.G.ui.dlg?.active, null, 20000).catch(() => {}); await sleep(page, 500);
    const k1 = { ...await staged('shihtzu'), text: await dlgText() };
    await shot('k1-halt');
    R.check('k) walk up: he rises, "Halt, traveller."; you two on the paving and in plain view, in frame, Shadow on his mark, the villagers kept round', k1.speaker === 'Floofy' && /Halt, traveller/.test(k1.text) && k1.locked && !k1.fb && k1.meHid === false && k1.themHid === false && k1.mePaved && k1.themPaved && k1.sh != null && k1.sh < 0.7 && k1.keep && inFrame(k1.you) && inFrame(k1.them), k1);
    await drainDialogue(page, []);
    await until(() => window.G.heroes.stzJoin.knight?.anim.action?.name === 'stzLicked', null, 6000).catch(() => {});
    const k2 = await A('shihtzu'); await shot('k2-lick');
    const pk = await drainTo('shihtzu', [0, 0]);
    await until(() => window.__ev.some(e => e[0] === 'arrival:done'), null, 10000).catch(() => {}); await sleep(page, 800);
    const all = await said();
    const k3 = await ev(() => { const G = window.G, v = G.heroes.villagers.shihtzu; return { joined: !!G.state.flags.shihtzuJoined, rec: G.state.flags.arrivals?.maple || null, act: G.state.quests.active.map(q => q.id), v: !!v, knight: !!G.heroes.stzJoin.knight, locked: G.player.controlLocked, keep: !!G.sceneKeepOut, hold: !!G.companion.hold }; });
    R.check('k) *slurp* (the ghost pup licks him); at dusk no "I am early"; his plea (Akane Hamlet, Captain Strawgrin); the tome snuffs the lanterns, he fades and joins; the arrival recorded, "The Gloom over Akane" started; nothing of the scene left', k2.act === 'stzLicked' && /Akane Hamlet/.test(all) && /Strawgrin/.test(all) && !/I am early/.test(all) && k3.joined && k3.rec?.quest === 'start' && k3.act.includes('hq_akane') && k3.v && !k3.knight && !k3.locked && !k3.keep && !k3.hold && pk.length >= 2, { k2: k2.act, k3, said: all.slice(0, 160) });
    await cardOpen().catch(() => {}); await sleep(page, 400);
    const k4 = await ev(() => { const c = document.querySelector('.p-qcard'); return { open: window.G.questMoments.open, text: c?.textContent || '' }; });
    await shot('k3-card');
    R.check('k) his card: "The Gloom over Akane", his hook, the goal (Save Akane Hamlet · Momiji Hollow)', k4.open === 'hq_akane' && /The Gloom over Akane/.test(k4.text) && /Not the good kind/.test(k4.text) && /Save Akane Hamlet/.test(k4.text) && /Momiji Hollow/.test(k4.text), { ...k4, text: k4.text.slice(0, 160) });
    await page.keyboard.press('Enter'); await until(() => !window.G.questMoments.open, null, 6000).catch(() => {});
    // his quest by you: the Maple road, Akane saved, the hand-in to him in town
    await ev(() => { window.G.lead?.stop?.('qa'); window.G.travel?.go ? window.G.travel.go('maple') : window.G.enterRegion('maple'); });
    await waitMode(page, 'dungeon', 30000);
    await until(() => window.G.state.quests.active.find(q => q.id === 'hq_akane')?.step === 1, null, 15000).catch(() => {});
    const k5 = await quest('hq_akane');
    await ev(() => { for (const m of window.G.dungeon.monsters) { m.pos.set(-500, 0, -500); m.aggro = false; } window.G.zoneDebug.saveVillage('maple'); });
    await until(() => !!window.G.state.quests.active.find(q => q.id === 'hq_akane')?.handIn, null, 12000).catch(() => {});
    const k6 = await quest('hq_akane');
    await ev(() => window.G.returnToVillage()); await waitMode(page, 'village', 30000); await sleep(page, 1200);
    const before = await ev(() => ({ coins: window.G.state.coins, pts: window.G.state.heroes.chewy.player.skillPts, lan: window.G.state.furniture?.yokaiLantern || 0 }));
    await ev(() => { const G = window.G, v = G.heroes.villagers.shihtzu; v.state = 'idle'; v.visible = true; G.player.setPos(v.pos.x + 1.2, v.pos.z + 0.6); G.talkTo(v); });
    await until(() => window.G.ui.dlg?.active, null, 8000).catch(() => {});
    const thanks = await dlgText(); await shot('k4-handin'); await drainDialogue(page);
    await until(() => window.G.state.quests.done.includes('hq_akane'), null, 8000).catch(() => {}); await sleep(page, 2400);
    const k7 = await ev(b => ({ done: window.G.state.quests.done.includes('hq_akane'), coins: window.G.state.coins - b.coins, pts: window.G.state.heroes.chewy.player.skillPts - b.pts, lan: (window.G.state.furniture?.yokaiLantern || 0) - b.lan }), before);
    R.check('k) the quest by you: arriving in Momiji Hollow finishes the travel step, Akane saved waits for the hand-in, back in town Floofy\'s thanks, the reward (1000 coins, a skill point, the Yokai Lantern)', k5?.step === 1 && k6?.handIn && /Akane/.test(thanks) && k7.done && k7.coins >= 1000 && k7.pts >= 1 && k7.lan === 1, { k5, k6, thanks: thanks.slice(0, 140), k7 });
    await close();
  }
  // ================================================================ l) the dusk rule: early, he waits for golden hour; by day he's early
  if (want('l')) {
    await open({ w: 1280, h: 720 });
    await boot(page, 'fresh&nointro&notut&arrive&qcard&hour=16.8');
    await setupFor('shihtzu');
    await until(() => window.G.heroes.stzJoin.state === 'wait' && window.G.heroes.stzJoin.t > 4, null, 30000).catch(() => {});
    const l0 = await ev(() => ({ state: window.G.heroes.stzJoin.state, dw: !!window.G.heroes.stzJoin.duskWait }));
    await ev(() => { window.G.day.hour = 17.7; });
    await until(() => window.G.heroes.stzJoin.state === 'kneel', null, 15000).catch(() => {});
    const l1 = await A('shihtzu');
    R.check('l) the dusk rule: at 4:48 pm (golden hour near) he waits for it; at golden hour (5:42 pm) he comes and kneels', l0.state === 'wait' && l0.dw && l1.state === 'kneel', { l0, l1 });
    await walkUp('shihtzu'); await until(() => window.G.ui.dlg?.active, null, 20000).catch(() => {});
    await drainTo('shihtzu', [1, 1]);
    const dusk = await said();
    // by day (11 am): he comes at once, and says he's early
    await ev(() => { window.G.day.hour = 11; window.__said = []; window.__ev = []; });
    const msg = await debugRun('Play an arrival', 'shihtzu');
    await until(() => window.G.heroes.stzJoin.state === 'kneel', null, 30000).catch(() => {});
    const l2 = await A('shihtzu');
    await walkUp('shihtzu'); await until(() => window.G.ui.dlg?.active, null, 20000).catch(() => {});
    const pk = await drainTo('shihtzu', [1, 1]);
    const day = await said();
    R.check('l) at golden hour no "I am early"; by day (debug › Play an arrival) he comes at once: "…It is not sunset. I am early. A knight is never late."; "Only if the ghost pups come too." gets "They were always coming."', !/I am early/.test(dusk) && /on the way/.test(msg) && l2.state === 'kneel' && /It is not sunset\. I am early\. A knight is never late\./.test(day) && /They were always coming/.test(day) && pk.includes('Only if the ghost pups come too.'), { msg, l2, dusk: dusk.slice(0, 80), day: day.slice(0, 200), pk });
    await close();
  }
  // ================================================================ m) Captain Kaizo's boat, his plea, his row home, his hand-in
  if (want('m')) {
    await open({ w: 1920, h: 1080 });
    await boot(page, 'fresh&nointro&notut&arrive&qcard&hour=11');
    await setupFor('kaizo');
    await until(() => window.G.heroes.kaizoArrive.state === 'land', null, 60000).catch(() => {});
    await until(() => !!window.G.state.flags.hints?.kaizoBoat, null, 10000).catch(() => {});
    const m0 = { ...await A('kaizo'), boat: await ev(() => { const S = window.G.heroes.kaizoArrive, b = S.boat; return b ? { on: !!b.parent, sand: [2, 4].includes(window.G.world.terrain.tile(b.position.x, b.position.z)) || window.G.world.walkable(b.position.x, b.position.z) } : null; }), map: await ev(async () => { const M = await import('/src/world/mapData.js'); const e = M.people(window.G).find(p => p.key === 'p:arrival:kaizo'); return e ? { name: e.name, role: e.role } : null; }), ptr: await ev(() => window.G.questTarget?.()?.label || null), tip: await ev(() => !!window.G.state.flags.hints?.kaizoBoat) };
    await shot('m0-boat');
    R.check('m) Captain Kaizo\'s boat is pulled up on the beach, him beside it; Shadow smells it (his tip); on the maps "Old Captain Kaizo, just landed on the beach", the pointer "A boat on the beach"', m0.state === 'land' && m0.vis && m0.boat?.on && m0.boat.sand && m0.map?.name === 'Old Captain Kaizo' && /landed/.test(m0.map.role) && m0.ptr === 'A boat on the beach' && m0.tip, m0);
    await walkUp('kaizo');
    await until(() => window.G.ui.dlg?.active, null, 20000).catch(() => {}); await sleep(page, 500);
    const m1 = { ...await staged('kaizo'), text: await dlgText() };
    await shot('m1-ahoy');
    R.check('m) walk up: "Ahoy there!"; you two on the beach (its sand) and in plain view, in frame, Shadow on his mark', m1.speaker === 'Old Captain Kaizo' && /Ahoy there/.test(m1.text) && m1.locked && !m1.fb && m1.meHid === false && m1.themHid === false && (m1.mePaved || m1.meBeach) && (m1.themPaved || m1.themBeach) && m1.sh != null && m1.sh < 0.7 && inFrame(m1.you) && inFrame(m1.them), m1);
    const pk = await drainTo('kaizo', [1, 0]);
    const m2 = await ev(() => ({ state: window.G.heroes.kaizoArrive.state, locked: window.G.player.controlLocked, card: window.G.questMoments.open, rec: window.G.state.flags.arrivals?.tidepool || null }));
    const all = await said();
    // (the drain ran to his "done": he rowed home; the card came after)
    await cardOpen().catch(() => {}); await sleep(page, 400);
    const m3 = await ev(() => { const c = document.querySelector('.p-qcard'), S = window.G.heroes.kaizoArrive; return { open: window.G.questMoments.open, text: c?.textContent || '', state: S.state, boat: !!S.boat, actor: !!S.kaizo, row: window.__ev.filter(e => e[0] === 'kaizo:arrive').map(e => JSON.parse(e[1]).phase) }; });
    await shot('m2-card');
    R.check('m) his plea (Shiokaze Port under siege, Captain Brineclaw); the camera watches him row home (the boat gone), then you\'re free and his card opens: "Trouble at Shiokaze Port", the goal (Save Shiokaze Port · the Shiokaze Tidepools)', /Shiokaze Port's under siege/.test(all) && /Brineclaw/.test(all) && pk.includes("Who's asking?") && !m2.locked && m2.rec?.quest === 'start' && m3.open === 'hq_shiokaze' && /Trouble at Shiokaze Port/.test(m3.text) && /Save Shiokaze Port/.test(m3.text) && m3.state === 'done' && !m3.boat && !m3.actor && m3.row.join(',') === 'land,talk,leave,done', { m2, m3: { ...m3, text: m3.text.slice(0, 160) }, all: all.slice(0, 120) });
    await page.keyboard.press('Enter'); await until(() => !window.G.questMoments.open, null, 6000).catch(() => {});
    // the quest: the Tidepools, Shiokaze saved, the hand-in at his lookout
    await ev(() => { window.G.lead?.stop?.('qa'); window.G.travel?.go ? window.G.travel.go('tidepool') : window.G.enterRegion('tidepool'); });
    await waitMode(page, 'dungeon', 30000); await page.waitForFunction(() => !!window.G.dungeon?.village?.villagers?.length, null, { timeout: 30000 }).catch(() => {});
    await until(() => window.G.state.quests.active.find(q => q.id === 'hq_shiokaze')?.step === 1, null, 15000).catch(() => {});
    const m4 = await quest('hq_shiokaze');
    await ev(() => { for (const m of window.G.dungeon.monsters) { m.pos.set(-500, 0, -500); m.aggro = false; } window.G.dungeon.village.saveNow(); });
    await until(() => !!window.G.state.quests.active.find(q => q.id === 'hq_shiokaze')?.handIn, null, 30000).catch(() => {});
    await until(() => !window.G.dungeon.village.celebrate && !window.G.ui.dlg?.active && !window.G.ui.banners?.busy, null, 30000).catch(() => {});
    const m5 = { q: await quest('hq_shiokaze'), t: await ev(() => window.G.story.target('hq_shiokaze')?.label || null) };
    const before = await ev(() => ({ coins: window.G.state.coins, pts: window.G.state.heroes.chewy.player.skillPts, lan: window.G.state.furniture?.festivalLantern || 0 }));
    await sleep(page, 1500);
    await ev(() => { const Vl = window.G.dungeon.village, v = Vl.villager('sk_kaizo'); window.G.player.setPos(v.pos.x + 0.8, v.pos.z + 0.8); Vl.talk(v); });
    await until(() => window.G.ui.dlg?.active, null, 8000).catch(() => {});
    const thanks = await dlgText(); await shot('m3-handin'); await drainDialogue(page);
    await until(() => window.G.state.quests.done.includes('hq_shiokaze'), null, 8000).catch(() => {}); await sleep(page, 2400);
    const m6 = await ev(b => ({ done: window.G.state.quests.done.includes('hq_shiokaze'), coins: window.G.state.coins - b.coins, pts: window.G.state.heroes.chewy.player.skillPts - b.pts, lan: (window.G.state.furniture?.festivalLantern || 0) - b.lan }), before);
    R.check('m) the quest: arriving in the Tidepools finishes the travel step; Shiokaze saved, the hand-in is his (the pointer to him); at his lookout his thanks ("The nets are clear…"), the reward (1800 coins, a skill point, the Festival Lantern)', m4?.step === 1 && m5.q?.handIn && /Kaizo/.test(m5.t || '') && /The nets are clear/.test(thanks) && m6.done && m6.coins >= 1800 && m6.pts >= 1 && m6.lan === 1, { m4, m5, thanks: thanks.slice(0, 140), m6 });
    await close();
  }
  // ================================================================ n) Foosy by the fountain, end to end
  if (want('n')) {
    await open({ w: 1920, h: 1080 });
    await boot(page, 'fresh&nointro&notut&arrive&qcard&hour=11');
    await setupFor('golden');
    await until(() => ['march', 'guard'].includes(window.G.heroes.gldJoin.state), null, 60000).catch(() => {});
    const n0 = await A('golden');
    await until(() => window.G.heroes.gldJoin.state === 'guard', null, 20000).catch(() => {});
    await until(() => !!window.G.state.flags.hints?.gldGuardTown, null, 10000).catch(() => {});
    const n1 = { ...await A('golden'), paved: await ev(() => { const S = window.G.heroes.gldJoin; return [1, 2].includes(window.G.world.terrain.tile(S.spot.x, S.spot.z)); }), fount: await ev(() => { const S = window.G.heroes.gldJoin, F = window.G.world.landmarks.fountain; return Math.round(Math.hypot(S.spot.x - F.x, S.spot.z - F.z) * 10) / 10; }), map: await ev(async () => { const M = await import('/src/world/mapData.js'); const e = M.people(window.G).find(p => p.key === 'p:arrival:golden'); return e ? { name: e.name, role: e.role } : null; }), ptr: await ev(() => window.G.questTarget?.()?.label || null), clear: await ev(() => window.G.heroes.gldJoin.stg?.clear) };
    await shot('n0-guard');
    R.check('n) Foosy marches in across the plaza and stands guard by the fountain (on the paving, at attention); Shadow\'s tip; on the maps "???, standing guard by the fountain", the pointer "A guard by the fountain"; the staging in the clear', (n0.state === 'march' || n0.state === 'guard') && n1.state === 'guard' && n1.vis && n1.act === 'gldAttention' && n1.paved && n1.fount < 6 && n1.map?.name === '???' && /guard/.test(n1.map.role) && n1.ptr === 'A guard by the fountain' && n1.clear, { n0, n1 });
    await sleep(page, 1400); await walkUp('golden');
    await until(() => window.G.ui.dlg?.active, null, 20000).catch(() => {}); await sleep(page, 500);
    const n2 = { ...await staged('golden'), text: await dlgText() };
    await shot('n1-halt');
    R.check('n) walk up: you to your mark beside him, he salutes: "Halt! Who approaches the fountain of Blossom Hollow?"; you two in plain view and in frame, Shadow on his mark', n2.speaker === 'Foosy' && /Halt! Who approaches the fountain/.test(n2.text) && n2.locked && n2.meHid === false && n2.themHid === false && n2.mePaved && n2.themPaved && n2.sh != null && n2.sh < 0.7 && inFrame(n2.you) && inFrame(n2.them) && n2.d > 2 && n2.d < 4, n2);
    await drainDialogue(page, []);
    await until(() => !!window.G.heroes.gldJoin.groundLance, null, 8000).catch(() => {});
    const n3 = await ev(() => ({ ball: !!window.G.heroes.gldJoin.ball, lance: !!window.G.heroes.gldJoin.groundLance }));
    await until(() => window.G.heroes.gldJoin.ballState?.held, null, 10000).catch(() => {});
    const n4 = await ev(() => ({ held: !!window.G.heroes.gldJoin.ballState?.held })); await shot('n2-fetch');
    await until(() => window.G.ui.dlg?.active, null, 10000).catch(() => {});
    const n5 = await dlgText();
    const giftSeen = page.waitForFunction(() => window.G.companion.whelp?.on && window.G.heroes.gldJoin.state === 'talk', null, { timeout: 60000, polling: 'raf' }).then(() => true).catch(() => false);
    const pk = await drainTo('golden', [0, 1]);
    await until(() => window.__ev.some(e => e[0] === 'arrival:done'), null, 10000).catch(() => {}); await sleep(page, 900);
    const all = await said();
    const n6 = await ev(() => { const G = window.G, v = G.heroes.villagers.golden; return { joined: !!G.state.flags.goldenJoined, rec: G.state.flags.arrivals?.onsen || null, act: G.state.quests.active.map(q => q.id), v: !!v, forced: G.companion.whelp?.forced ?? null, knight: !!G.heroes.gldJoin.knight, ball: !!G.heroes.gldJoin.ball, lance: !!G.heroes.gldJoin.groundLance, locked: G.player.controlLocked, hold: !!G.companion.hold }; });
    R.check('n) mid-vow ("…against all—") a tennis ball comes bouncing in, the lance drops, he fetches it, "—against all comers"; the whelp costume for Shadow; his plea (Yukimi besieged, Captain Frostbelly); he joins; "The Siege of Yukimi" started; Shadow\'s outfit off; nothing of the scene left', n3.ball && n3.lance && n4.held && /against all comers/.test(n5) && (await giftSeen) && /Frostbelly/.test(all) && /springs of Yukimi are besieged/.test(all) && pk.includes('Only if you bring the ball.') && /always going to bring the ball/.test(all) && n6.joined && n6.rec?.quest === 'start' && n6.act.includes('hq_yukimi') && n6.v && n6.forced == null && !n6.knight && !n6.ball && !n6.lance && !n6.locked && !n6.hold, { n3, n4, n5, n6, pk });
    await cardOpen().catch(() => {}); await sleep(page, 400);
    const n7 = await ev(() => { const c = document.querySelector('.p-qcard'); return { open: window.G.questMoments.open, text: c?.textContent || '' }; });
    await shot('n3-card');
    R.check('n) his card: "The Siege of Yukimi", his hook, the goal (Save Yukimi Spa Village · Yukimi Onsen)', n7.open === 'hq_yukimi' && /The Siege of Yukimi/.test(n7.text) && /Save Yukimi Spa/.test(n7.text), { ...n7, text: n7.text.slice(0, 160) });
    await close();
  }
  // ================================================================ o) checkpoint 2's old saves, each with a second reload; the crews
  if (want('o')) {
    await open({ w: 1280, h: 720 });
    await boot(page, 'fresh&nointro&notut&hour=11'); await setup({ lvl: 12 });
    // 1. Floofy joined in the maples already (an old save): no arrival; his quest starts quietly with its card
    await loadSave("s.flags.mokaJoined = true; s.flags.poeJoined = true; s.flags.shihtzuJoined = true; s.flags.arrivals = { bamboo: { how: 'scene', quest: 'start', day: 1 } }; s.quests.active = s.quests.active.filter(q => !['hq_akane', 'welcome'].includes(q.id)); s.quests.done = s.quests.done.filter(id => id !== 'hq_akane').concat(['hq_takemori']); s.quests.cards = [];");
    await setup({ lvl: 12 });
    await until(() => window.G.state.quests.active.some(q => q.id === 'hq_akane'), null, 20000).catch(() => {}); await sleep(page, 1500);
    const o1 = await ev(() => { const G = window.G; return { act: G.state.quests.active.filter(q => q.id === 'hq_akane').length, scene: G.heroes.stzJoin.state, starts: window.__ev.filter(e => e[0] === 'arrival:start').length, rec: G.state.flags.arrivals?.maple?.how, card: G.questMoments.open === 'hq_akane' || (G.state.quests.cards || []).includes('hq_akane') }; });
    await page.keyboard.press('Escape'); await sleep(page, 300);
    await reload(); await setup({ lvl: 12 }); await sleep(page, 5000);
    const o1b = await ev(() => ({ act: window.G.state.quests.active.filter(q => q.id === 'hq_akane').length, scene: window.G.heroes.stzJoin.state, starts: window.__ev.filter(e => e[0] === 'arrival:start').length }));
    R.check('o) an old save with Floofy joined in the maples: no arrival, "The Gloom over Akane" starts quietly with its card; a second reload: still one, no arrival', o1.act === 1 && o1.scene === 'off' && !o1.starts && o1.rec === 'old' && o1.card && o1b.act === 1 && o1b.scene === 'off' && !o1b.starts, { o1, o1b });
    // 2. Akane relieved by a crew before he came: he still arrives and joins, with a thank-you, and no quest
    await loadSave("s.flags.mokaJoined = true; s.flags.poeJoined = true; s.flags.shihtzuJoined = false; s.flags.arrivals = { bamboo: { how: 'scene', quest: 'start', day: 1 } }; s.quests.active = s.quests.active.filter(q => !['hq_akane', 'welcome'].includes(q.id)); s.quests.done = s.quests.done.filter(id => id !== 'hq_akane').concat(['hq_takemori']); s.quests.cards = []; s.zones.maple.village = 'saved'; s.zones.maple.savedBy = 'crew';");
    await setup({ lvl: 12 });
    await playScene('shihtzu', [0, 0]);
    await until(() => window.__ev.some(e => e[0] === 'arrival:done'), null, 10000).catch(() => {});
    const o2 = await ev(() => { const G = window.G; return { joined: !!G.state.flags.shihtzuJoined, quest: G.state.quests.active.some(q => q.id === 'hq_akane') || G.state.quests.done.includes('hq_akane'), rec: G.state.flags.arrivals?.maple || null }; });
    const t2 = await said();
    await reload(); await setup({ lvl: 12 }); await sleep(page, 5000);
    const o2b = await ev(() => ({ scene: window.G.heroes.stzJoin.state, quest: window.G.state.quests.active.some(q => q.id === 'hq_akane'), starts: window.__ev.filter(e => e[0] === 'arrival:start').length }));
    R.check('o) Akane relieved by a crew before he came: he arrives and joins with a thank-you ("your crew has already lifted it"), no plea, no quest; a second reload: no second arrival', o2.joined && !o2.quest && o2.rec?.quest === 'saved' && /your crew has already lifted it/.test(t2) && !/has fallen under the gloom\./.test(t2) && o2b.scene === 'off' && !o2b.quest && !o2b.starts, { o2, o2b, t2: t2.slice(0, 200) });
    // 3. Shiokaze relieved before Kaizo came: he rows over to say thank you; no quest
    await loadSave("s.flags.mokaJoined = true; s.flags.poeJoined = true; s.flags.shihtzuJoined = true; s.flags.arrivals = { bamboo: { how: 'scene', quest: 'start', day: 1 }, maple: { how: 'scene', quest: 'start', day: 1 } }; s.quests.active = s.quests.active.filter(q => !['hq_shiokaze', 'welcome'].includes(q.id)); s.quests.done = s.quests.done.filter(id => id !== 'hq_shiokaze').concat(['hq_takemori', 'hq_akane']); s.quests.cards = []; s.zones.tidepool.village = 'saved'; s.zones.tidepool.savedBy = 'crew';");
    await setup({ lvl: 18 });
    await playScene('kaizo', [0]);
    await until(() => window.__ev.some(e => e[0] === 'arrival:done'), null, 10000).catch(() => {});
    const o3 = await ev(() => ({ quest: window.G.state.quests.active.some(q => q.id === 'hq_shiokaze'), rec: window.G.state.flags.arrivals?.tidepool || null }));
    const t3 = await said();
    R.check('o) Shiokaze relieved by a crew before Kaizo came: he still rows over, says thank you (your crew chased the crabs back to sea), no quest', !o3.quest && o3.rec?.quest === 'saved' && /your crew already chased the crabs back to sea/.test(t3) && !/under siege\./.test(t3.replace('was under siege', '')), { o3, t3: t3.slice(0, 200) });
    // 4. Foosy joined at the Onsen already (an old save), Kaizo not come yet: Kaizo still comes; Foosy's quest starts quietly
    await loadSave("s.flags.mokaJoined = true; s.flags.poeJoined = true; s.flags.shihtzuJoined = true; s.flags.goldenJoined = true; s.flags.arrivals = { bamboo: { how: 'scene', quest: 'start', day: 1 }, maple: { how: 'scene', quest: 'start', day: 1 } }; s.quests.active = s.quests.active.filter(q => !['hq_shiokaze', 'hq_yukimi', 'welcome'].includes(q.id)); s.quests.done = s.quests.done.filter(id => !['hq_shiokaze', 'hq_yukimi'].includes(id)).concat(['hq_takemori', 'hq_akane']); s.quests.cards = [];");
    await setup({ lvl: 26 });
    await until(() => window.G.state.quests.active.some(q => q.id === 'hq_yukimi'), null, 20000).catch(() => {});
    await cardOpen().catch(() => {}); await page.keyboard.press('Escape'); await until(() => !window.G.questMoments.open, null, 6000).catch(() => {});
    await until(() => window.G.heroes.kaizoArrive.state === 'land', null, 40000).catch(() => {});
    const o4 = await ev(() => ({ yuk: window.G.state.quests.active.filter(q => q.id === 'hq_yukimi').length, kaizo: window.G.heroes.kaizoArrive.state, gld: window.G.heroes.gldJoin.state, rec: window.G.state.flags.arrivals?.onsen?.how }));
    R.check('o) an old save with Foosy joined at the Onsen and no Kaizo yet: Kaizo\'s boat still comes; "The Siege of Yukimi" starts quietly; no Foosy arrival', o4.yuk === 1 && o4.kaizo === 'land' && o4.gld === 'off' && o4.rec === 'old', o4);
    // 5. Momiji Hollow open and no Floofy: he arrives the next time you're in town; a reload mid-wait: he comes again
    await loadSave("s.flags.mokaJoined = true; s.flags.poeJoined = true; s.flags.shihtzuJoined = false; s.flags.arrivals = { bamboo: { how: 'scene', quest: 'start', day: 1 } }; s.quests.active = s.quests.active.filter(q => !['hq_akane', 'welcome'].includes(q.id)); s.quests.done = s.quests.done.filter(id => id !== 'hq_akane').concat(['hq_takemori']); s.quests.cards = []; s.zones.maple.village = 'besieged'; s.zones.maple.savedBy = null;");
    await setup({ lvl: 12 });
    await until(() => ['wait', 'kneel'].includes(window.G.heroes.stzJoin.state), null, 20000).catch(() => {});
    const o5 = await A('shihtzu');
    await reload(); await setup({ lvl: 12 });
    await until(() => ['wait', 'kneel'].includes(window.G.heroes.stzJoin.state), null, 20000).catch(() => {});
    const o5b = { ...await A('shihtzu'), joined: await ev(() => !!window.G.state.flags.shihtzuJoined) };
    R.check('o) Momiji Hollow open and no Floofy: he arrives the next time you\'re in town; a reload mid-wait: he comes again', ['wait', 'kneel'].includes(o5.state) && o5.cur === 'shihtzu' && ['wait', 'kneel'].includes(o5b.state) && o5b.cur === 'shihtzu' && !o5b.joined, { o5, o5b });
    await close();
  }
  // ================================================================ p) the pad on the Deck (Foosy), touch on a phone (Kaizo)
  if (want('p')) {
    await open({ w: 1280, h: 800 });
    await boot(page, 'fresh&nointro&notut&arrive&qcard&hour=11&deck');
    await installPad(page); await padTap(page, 'DDown');
    await ev(() => { const G = window.G; if (G.ui.dlg.active) G.ui.dlg.finish(-1); }); await until(() => !window.G.ui.dlg.active && !window.G.player.controlLocked, null, 8000).catch(() => {});
    await setupFor('golden');
    await until(() => window.G.heroes.gldJoin.state === 'guard', null, 60000).catch(() => {}); await sleep(page, 1400);
    await walkUp('golden'); await until(() => window.G.ui.dlg?.active, null, 20000).catch(() => {});
    await shot('p0-deck-vow');
    let picks = 0;
    for (let steps = 0; steps < 140; steps++) {
      const s = await ev(() => { const D = window.G.ui.dlg, done = window.__ev.some(e => e[0] === 'golden:joinScene' && JSON.parse(e[1]).phase === 'done'); return { a: !!D.active, picking: !!(D.active && D.choices?.length && D.i >= D.lines.length - 1 && !D.typing), done }; });
      if (s.done) break;
      if (!s.a) { await sleep(page, 250); continue; }
      if (s.picking) { picks++; await padTap(page, 'DDown'); await sleep(page, 120); }
      await padTap(page, 'A'); await sleep(page, 220);
    }
    await cardOpen().catch(() => {}); await until(() => window.G.ui.padNav?.cur?.classList.contains('qc-go'), null, 5000).catch(() => {});
    const p0 = await ev(() => ({ dev: window.G.controls.device, joined: !!window.G.state.flags.goldenJoined, open: window.G.questMoments.open, focus: window.G.ui.padNav?.cur?.className || '' }));
    await shot('p1-deck-card');
    await padTap(page, 'A'); await until(() => !window.G.questMoments.open, null, 6000).catch(() => {});
    R.check('p) the pad on the Deck: A reads Foosy\'s scene on, the D-pad and A pick his choices; he joins; the card\'s focus on Let\'s go!, A presses it', p0.dev === 'pad' && p0.joined && picks >= 2 && p0.open === 'hq_yukimi' && /qc-go/.test(p0.focus) && !(await ev(() => window.G.questMoments.open)), { p0, picks });
    await close();
    const T = await open({ touch: true });
    await boot(page, 'fresh&nointro&notut&arrive&qcard&hour=11');
    await setupFor('kaizo');
    await until(() => window.G.heroes.kaizoArrive.state === 'land', null, 60000).catch(() => {});
    await walkUp('kaizo'); await until(() => window.G.ui.dlg?.active, null, 20000).catch(() => {});
    await sleep(page, 500); await shot('p2-phone-ahoy');
    let taps = 0, picked = 0;
    for (let i = 0; i < 90; i++) {
      const s = await ev(() => { const D = window.G.ui.dlg, done = window.__ev.some(e => e[0] === 'kaizo:arrive' && JSON.parse(e[1]).phase === 'done'); const b = D.active && D.choices?.length && D.i >= D.lines.length - 1 && !D.typing ? [...document.querySelectorAll('.dlg .dch')].filter(e => e.offsetParent).map(e => { const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2, r.height]; }) : null; return { a: !!D.active, b, done }; });
      if (s.done) break;
      if (!s.a) { await sleep(page, 250); continue; }
      if (s.b?.length) { const c = s.b[0]; await T.F.tap(c[0], c[1]); picked++; if (c[2] < 44) picked = -99; await sleep(page, 450); continue; }
      await T.F.tap(420, 110); taps++; await sleep(page, 220);
    }
    await cardOpen().catch(() => {}); await sleep(page, 400); await shot('p3-phone-card');
    const go = await ev(() => { const b = document.querySelector('.p-qcard .qc-go')?.getBoundingClientRect(); return b ? [b.left + b.width / 2, b.top + b.height / 2, Math.min(b.width, b.height)] : null; });
    if (go) await T.F.tap(go[0], go[1]);
    await until(() => !window.G.questMoments.open, null, 6000).catch(() => {});
    const p1 = await ev(() => ({ rec: window.G.state.flags.arrivals?.tidepool?.quest || null, open: window.G.questMoments.open, q: window.G.state.quests.active.some(q => q.id === 'hq_shiokaze'), phone: window.G.ui.root.classList.contains('m-phone') }));
    R.check('p) touch on a phone: taps read Kaizo\'s scene on, a tap picks his choices (44 px buttons); his visit recorded; a tap on Let\'s go! presses the card', p1.phone && p1.rec === 'start' && picked >= 2 && taps >= 3 && go?.[2] >= 44 && !p1.open && p1.q, { p1, picked, taps, go });
    await close();
  }
} catch (e) { R.check('scenario ran to the end', false, String(e.stack || e).split('\n').slice(0, 3).join(' | ')); allErrors.push(...(errors || [])); await Promise.race([browser?.close().catch(() => {}), new Promise(r => setTimeout(r, 8000))]); }
process.exit(R.finish(allErrors, allWarns) ? 1 : 0);
