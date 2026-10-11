// Scenario 40: controller menus on the bumpers (ROADMAP CT-11, docs/CONTROLS.md §14), with a real virtual pad
// (tools/qa/pad-lib.mjs) on the Steam Deck's screen: 1280×800, where a first start picks the Deck preset (UI 1.15, the
// safe area).
//  a) build mode (§14.5): the game menu's Build; the palette's tab strip (LB / RB glyphs, the Tools tab, the toolbar
//     hidden); RB / LB walk the tabs and wrap; the D-pad walks the grid without picking anything; the side card shows the
//     focused piece (no tooltip over the world); a locked card says why; A picks the Park Bench up and the palette folds
//     to the tab strip with its chip; the stick moves it, RT / LT rotate it; A builds; Y undoes (its cost back); X once
//     arms the remove (the prompt asks again), X again removes it (half back), Y brings it back (the refund taken back);
//     the D-pad nudges a tile; B puts it back (the palette opens on its card); a stick push from the palette folds it to
//     the cursor, LB opens it again; the Tools tab: paths (hold A and move) and a zone, each undone with Y; LT / RT with
//     nothing in hand turn the camera; View cycles the overlays; Menu opens the game menu over build mode, nothing
//     reaches the world while it's up, B closes it and build mode carries on as it was; the mouse gets its own palette
//     back (and Ctrl+Z undoes); B with nothing in hand leaves.
//  c) the tabbed menu (§14.4): Menu opens it on the Game page the first time (the strip, the pause, the panel under the
//     strip); RB through all seven pages and round, LB back; LT / RT step a page's own tabs (the Bag's views, the skill
//     trees, the Journal, Settings' four pages under the strip); the Charge drawer on a right-stick flick; nothing reaches
//     the world while it's up; B puts a held item back, then closes it all; Menu reopens it on the last page and closes
//     it; the keyboard's I still opens the bag alone.
//  b) decorate mode (§14.6): in through the Game page; the tabs, the grid, the side card and the Home Rating; a piece
//     picked up, moved, turned and placed, Y undoes; from the room A picks a placed piece up, B puts it back where it was,
//     X stores the piece under the cursor, Y brings it back; a wallpaper put up at once and taken down; LT / RT zoom;
//     Menu over decorate and back; B leaves.
//  g) the decorating guide ("Make it home", R-13) end to end on the pad, every line in the pad's words.
// Shots in tools/qa/tmp/ct11/ (a*: build mode; c-*: every page of the menu; b*: decorate; g*: the guide).
//   usage: node tools/qa/s40-pad-menus.mjs        S40_ONLY=a,c,b,g (sections)   SHOT_DIR=…   BASE=<a production
//   bundle's URL> (a and b need no /src import, so they run on the built game too)
import fs from 'node:fs';
import path from 'node:path';
import { launch, boot, sleep, makeReport, tap, waitMode, BASE } from './lib.mjs';
import { installPad, padDown, padUp, padTap, padStick, padReset } from './pad-lib.mjs';

const OUT = process.env.SHOT_DIR || path.resolve('tools/qa/tmp/ct11');
fs.mkdirSync(OUT, { recursive: true });
const ONLY = process.env.S40_ONLY || '';
const R = makeReport('S40 pad menus: build and decorate on the bumpers, the tabbed menu, the decorating guide (CT-11)');
const { browser, page, errors, warns } = await launch({ w: 1280, h: 800 });
const ev = (f, a) => page.evaluate(f, a);
const wait = (f, a, timeout = 8000) => page.waitForFunction(f, a, { timeout, polling: 'raf' }).then(() => true, () => false);
const shot = n => page.screenshot({ path: path.join(OUT, n + '.png') });
const press = async (b, ms = 40) => { await padTap(page, b, ms); await sleep(page, 160); };
const frames = (n = 3) => ev(n => new Promise(r => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
// the build palette's pad state
const BS = () => ev(() => {
  const G = window.G, P = G.ui.panels.build, C = G.ui.padCursor, T = G.build.tool, pn = P.panel;
  return { st: C.state, cat: P.cat, cur: C.cur?.dataset?.id || C.cur?.dataset?.z || null, tool: T ? T.type || (T.kind === 'zone' ? 'zone' + T.zone : T.kind + (T.erase ? '0' : '')) : null, rot: G.build.rot,
    fold: pn.classList.contains('pc-fold'), pal: pn.classList.contains('pc-pal'), ring: G.ui.padNav.ring.classList.contains('on'), dim: C.root.classList.contains('dim'),
    hints: C.hintsEl.textContent.replace(/\s+/g, ' ').trim(), prompt: G.ui.hud.cache?.prompt ?? null, promptT: document.querySelector('.hud .prompt .pr-t')?.textContent || '',
    side: P.$.pd.textContent.replace(/\s+/g, ' ').trim(), held: P.$.held.classList.contains('on') ? P.$.held.textContent.replace(/\s+/g, ' ').trim() : '',
    undo: G.build.undoStack.length, last: G.build.undoStack.at(-1)?.kind || null, coins: G.state.coins, tip: !!G.ui.tip.on };
});
// the tabbed menu's state (ui/padMenu.js)
const PAGE_PANELS = ['inventory', 'character', 'skills', 'quests', 'map', 'menu'];
const PMS = () => ev(P => {
  const U = window.G.ui, M = U.padMenu, sr = M.root.querySelector('.pm-row')?.getBoundingClientRect(), open = P.filter(k => U.isOpen(k));
  return { active: M.active, cur: M.current(), on: M.root.querySelector('.pm-tab.on')?.dataset.k || null, tabs: [...M.root.querySelectorAll('.pm-tab')].map(t => t.dataset.k), bumps: M.root.querySelectorAll('.pm-row > .pm-b').length === 2 ? 'LB,RB' : '',
    paused: U.isPaused(), open, panelTop: Math.round(Math.min(9999, ...open.map(k => U.panels[k].panel.getBoundingClientRect().top))), stripBottom: sr ? Math.round(sr.bottom) : 0, hints: U.padNav.hintsEl.textContent.replace(/\s+/g, ' ').trim() };
}, PAGE_PANELS);
// decorate's pad state
const DS = () => ev(() => {
  const G = window.G, C = G.ui.padCursor, D = G.housing.decor, P = G.ui.panels.decorate, pn = P.panel;
  return { st: C.state, tab: P.tab, cur: C.cur?.dataset.id || null, sel: D.sel, hold: D.hold?.it.id || null, n: D.items.length, pal: pn.classList.contains('pc-pal'), fold: pn.classList.contains('pc-fold'),
    bumps: P.$.bumps.filter(b => b.offsetParent).map(b => b.dataset.pg).join(), grid: getComputedStyle(P.$.cards).display, side: P.$.pd.textContent.replace(/\s+/g, ' ').trim(),
    held: P.$.held.classList.contains('on') ? P.$.held.textContent.replace(/\s+/g, ' ').trim() : '', rating: P.$.rate.style.display !== 'none' && P.$.rate.offsetParent !== null, hints: C.hintsEl.textContent.replace(/\s+/g, ' ').trim() };
});
// the paw over a room's cell (interiorWorld's ORIGIN 2 m, 0.5 m cells; wall 'n' / 'w': on that back wall, y metres up)
const cellTo = (cx, cz, y = 0, wall = null) => ev(([cx, cz, y, wall]) => {
  const G = window.G, O = 2, Cc = 0.5, v = new (G.engine.camera.position.constructor)(O + (cx + 0.5) * Cc, y, O + (cz + 0.5) * Cc);
  if (wall === 'n') v.z = O + cz * Cc + 0.02; if (wall === 'w') v.x = O + cx * Cc + 0.02;
  v.project(G.engine.camera); const C = G.ui.padCursor; C.x = (v.x * 0.5 + 0.5) * innerWidth; C.y = (-v.y * 0.5 + 0.5) * innerHeight;
}, [cx, cz, y, wall]);
// a spot on screen over a tile the test wants (the cursor jumps there, as a long stick push would)
const cursorTo = (x, z) => ev(([x, z]) => { const G = window.G, C = G.ui.padCursor, h = G.sim.world.heightAt(x, z); const v = { x, y: h, z }; const V = new (G.engine.camera.position.constructor)(v.x, v.y, v.z).project(G.engine.camera); C.x = (V.x * 0.5 + 0.5) * innerWidth; C.y = (-V.y * 0.5 + 0.5) * innerHeight; return [C.x | 0, C.y | 0]; }, [x, z]);

try {
  await boot(page, 'fresh&nointro&notut&hour=10');
  const prof = await ev(() => ({ preset: window.G.engine.preset, ui: window.G.ui.settings.uiScale, deck: window.G.ui.root.classList.contains('deck-ui') }));
  R.check('the Deck profile picks itself at 1280×800 (the Deck preset, UI 1.15, the safe area)', prof.preset === 3 && prof.ui === 1.15 && prof.deck, JSON.stringify(prof));
  await ev(() => {
    const G = window.G, st = G.state; st.flags.hints = { all: true }; st.coins = 5000; for (const k of ['wood', 'stone', 'petal', 'crystal', 'bone']) st.materials[k] = 99; G.ui.toasts?.retire?.(0);
    const W = G.world, c = W.landmarks.plaza, open = (x, z) => W.walkable(x, z) && !W.collision.solidAt(x, z, 0.8) && !G.sim.buildingAt(x, z); // (the plaza's open middle)
    for (let r = 0; r < 40; r += 1.5) for (let a = 0; a < 12; a++) { const x = c.x + Math.cos(a / 6 * Math.PI) * r, z = c.z + 4 + Math.sin(a / 6 * Math.PI) * r; let ok = true; for (let s = -7; s <= 7 && ok; s += 1) for (let t = -7; t <= 7 && ok; t += 1) if (!open(x + s, z + t)) ok = false; if (ok) { G.player.setPos(x, z); G.engine.rig.focus.copy(G.player.pos); G.engine.rig.snap(); return; } }
  });
  await installPad(page);
  await padStick(page, 'left', 0, -0.5); await sleep(page, 250); await padStick(page, 'left', 0, 0); await sleep(page, 400);

  if (!ONLY || ONLY.includes('a')) {
    // ---------------------------------------------------------------- a) build mode
    // in through the game menu's Build (the pad's way in)
    await press('Menu'); await wait(() => window.G.ui.isOpen('menu'));
    await ev(() => { const N = window.G.ui.padNav, b = document.querySelector('.p-menu [data-a="build"]'); N.focus(b, N.candidates([document.querySelector('.p-menu')])); });
    await press('A'); await wait(() => window.G.build.active && window.G.ui.padCursor.state === 'pal'); await sleep(page, 700);
    const a0 = await BS();
    const strip = await ev(() => { const P = window.G.ui.panels.build, vis = e => !!e && e.offsetParent !== null && e.getBoundingClientRect().width > 2; return { bumps: P.$.bumps.filter(vis).map(b => b.dataset.pg), tabs: [...P.$.tabs.querySelectorAll('.tab')].filter(vis).map(t => t.dataset.c), toolbar: vis(P.$.tools), grid: getComputedStyle(P.$.cards).display, navHints: window.G.ui.padNav.hintsEl.classList.contains('on') }; });
    R.check('build mode opens on the palette: LB and RB glyphs at the tab strip\'s ends, a Tools tab, the toolbar hidden, the cards a grid, the focus ring on the first card, the cursor dimmed, the side card names it', a0.st === 'pal' && a0.pal && !a0.fold && a0.ring && a0.dim && strip.bumps.join() === 'LB,RB' && strip.tabs.at(-1) === 'tools' && !strip.toolbar && strip.grid === 'grid' && !!a0.cur && a0.side.length > 4 && !strip.navHints && !a0.tip, JSON.stringify({ a0, strip }));
    await shot('a1-palette');
    // the tabs: RB forward, LB back, both wrap
    const tabs = strip.tabs, seen = [a0.cat];
    for (let i = 0; i < tabs.length; i++) { await press('RB'); seen.push((await BS()).cat); }
    await press('LB'); const wrapL = (await BS()).cat;
    R.check('RB walks every category tab (Landmarks → … → Tools) and wraps to the first; LB goes back (wrapping to Tools)', seen.join() === [...tabs, tabs[0]].join() && wrapL === tabs.at(-1), JSON.stringify({ tabs, seen, wrapL }));
    // the grid: the D-pad browses, nothing is picked
    while ((await BS()).cat !== 'decor') await press('RB');
    const g0 = await BS(); await press('DRight'); const g1 = await BS(); await press('DDown'); const g2 = await BS(); await press('DUp'); await press('DLeft'); const g3 = await BS();
    const cols = await ev(() => { const cs = [...window.G.ui.panels.build.$.cards.querySelectorAll('.card')]; return cs.filter(c => c.offsetTop === cs[0].offsetTop).length; });
    const idx = id => ev(id => [...window.G.ui.panels.build.$.cards.querySelectorAll('.card')].findIndex(c => c.dataset.id === id), id);
    const i1 = await idx(g1.cur), i2 = await idx(g2.cur);
    R.check('the D-pad walks the grid (▶ the next card, ▼ a row down, ▲ ◀ back) and only browses: nothing in hand, the side card follows the focus', g0.cur !== g1.cur && (i2 === i1 + cols || (i2 > i1 && i2 === (await ev(() => window.G.ui.panels.build.$.cards.children.length - 1)))) && g3.cur === g0.cur && !g1.tool && !g2.tool && g1.side !== g0.side, JSON.stringify({ g0: g0.cur, g1: g1.cur, g2: g2.cur, g3: g3.cur, cols, i1, i2, side: [g0.side, g1.side] }));
    await shot('a2-grid-focus');
    // a locked card says why and stays in the palette
    const lockId = await ev(() => { const c = window.G.ui.panels.build.$.cards.querySelector('.card.locked:not(.built)'); return c?.dataset.id || null; });
    let lockOk = true;
    if (lockId) {
      for (let i = 0; i < 16 && (await BS()).cur !== lockId; i++) await press('DRight');
      const t0 = await ev(() => window.QA.toasts.length); await press('A');
      const L = await BS(); const toast = await ev(n => window.QA.toasts.slice(n).join(' | '), t0);
      lockOk = L.st === 'pal' && !L.tool && /rank|built/i.test(toast + L.side);
      R.check('A on a locked card: nothing in hand, the palette stays, it says why (the village rank)', lockOk, JSON.stringify({ lockId, st: L.st, tool: L.tool, toast, side: L.side }));
    } else R.note('no locked card in Decor at this rank: skipped');
    // pick up the Park Bench
    for (let i = 0; i < 16 && (await BS()).cur !== 'bench'; i++) await press(i < 8 ? 'DLeft' : 'DRight');
    await press('A'); await sleep(page, 250);
    const h0 = await BS();
    R.check('A picks the Park Bench up: the palette folds to the tab strip with its chip (name, size, cost), the cursor is bright, the hints name Move · Build · Rotate · Put back', h0.st === 'hold' && h0.tool === 'bench' && h0.fold && !h0.ring && !h0.dim && /Park Bench/.test(h0.held) && /1×1/.test(h0.held) && /Move/.test(h0.hints) && /Build/.test(h0.hints) && /Rotate/.test(h0.hints) && /Put back/.test(h0.hints), JSON.stringify(h0));
    await shot('a3-holding');
    // move it, rotate it
    const v0 = await ev(() => ({ ...window.G.controls.vcursor }));
    await padStick(page, 'left', 0.6, 0.2); await sleep(page, 260); await padStick(page, 'left', 0, 0); await sleep(page, 120);
    const v1 = await ev(() => ({ ...window.G.controls.vcursor })), pv = await ev(() => window.G.player.pos.toArray());
    const r0 = (await BS()).rot; await press('RT'); const r1 = (await BS()).rot; await press('LT'); await press('LT'); const r2 = (await BS()).rot;
    R.check('the stick moves the piece (the hero stays put); RT turns it a quarter, LT back', Math.hypot(v1.x - v0.x, v1.y - v0.y) > 40 && r1 === (r0 + 1) % 4 && r2 === (r0 + 3) % 4, JSON.stringify({ v0: [v0.x | 0, v0.y | 0], v1: [v1.x | 0, v1.y | 0], r0, r1, r2, pv }));
    await press('RT');
    // build it (a clear spot), undo it, build again
    let placed = null;
    for (const [x, y] of [[0, 0], [0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5], [0.5, 0.5], [-0.5, -0.5]]) {
      if (x || y) { await padStick(page, 'left', x, y); await sleep(page, 200); await padStick(page, 'left', 0, 0); }
      await sleep(page, 150);
      if (await ev(() => window.G.build.ghostOk)) { const c0 = (await BS()).coins; await press('A'); const b = await BS(); if (b.last === 'place') { placed = { c0, c1: b.coins, id: await ev(() => window.G.build.undoStack.at(-1).b.id) }; break; } }
    }
    await shot('a4-built');
    await press('Y'); const u1 = await BS(); const goneU = await ev(id => !window.G.sim.S.buildings.some(b => b.id === id), placed?.id);
    R.check('A builds it (its cost spent), Y undoes it (it goes, its whole cost back), the bench still in hand', !!placed && placed.c1 < placed.c0 && goneU && u1.coins === placed.c0 && u1.tool === 'bench', JSON.stringify({ placed, u1: { coins: u1.coins, tool: u1.tool, undo: u1.undo } }));
    await press('A'); const p2 = await BS(); const id2 = await ev(() => window.G.build.undoStack.at(-1)?.b?.id);
    // X once arms the remove (the prompt asks again), X again removes it (half back), Y brings it back
    await press('X'); await frames(4); const x1 = await BS();
    await shot('a5-remove-confirm');
    await press('X'); const x2 = await BS(); const goneX = await ev(id => !window.G.sim.S.buildings.some(b => b.id === id), id2);
    await press('Y'); const x3 = await BS(); const backX = await ev(id => window.G.sim.S.buildings.some(b => b.id === id), id2);
    R.check('X once over the new bench asks again ("Press X again to remove the Park Bench"); X again removes it (half its cost back); Y puts it back (the refund taken back)', p2.last === 'place' && /again to remove the Park Bench/.test(x1.promptT + x1.prompt) && goneX && x2.coins > p2.coins && x2.last === 'remove' && backX && x3.coins === p2.coins, JSON.stringify({ p2: p2.coins, x1: x1.promptT, x2: x2.coins, x3: x3.coins, goneX, backX }));
    // the D-pad nudges the piece a tile
    const n0 = await ev(() => window.G.build.lastCur && { x: window.G.build.lastCur.x, z: window.G.build.lastCur.z });
    await press('DRight'); await frames(3); const n1 = await ev(() => window.G.build.lastCur && { x: window.G.build.lastCur.x, z: window.G.build.lastCur.z });
    await press('DUp'); await frames(3); const n2 = await ev(() => window.G.build.lastCur && { x: window.G.build.lastCur.x, z: window.G.build.lastCur.z });
    const d1 = Math.abs(n1.x - n0.x) + Math.abs(n1.z - n0.z), d2 = Math.abs(n2.x - n1.x) + Math.abs(n2.z - n1.z);
    R.check('the D-pad nudges the piece in hand one tile (▶ along one grid axis, ▲ along the other)', d1 === 1 && d2 === 1 && (n1.x !== n0.x) !== (n2.x !== n1.x), JSON.stringify({ n0, n1, n2 }));
    // B puts it back: the palette opens on its card
    await press('B'); const pb = await BS();
    R.check('B puts the bench back: nothing in hand, the palette opens (unfolded) with the focus on the Park Bench', pb.st === 'pal' && !pb.tool && !pb.fold && pb.cur === 'bench' && pb.ring, JSON.stringify(pb));
    // a stick push folds the palette to the cursor; a light touch doesn't; LB opens it again on its tab
    await padStick(page, 'left', 0.15, 0); await sleep(page, 200); const s0 = await BS(); await padStick(page, 'left', 0, 0);
    await padStick(page, 'left', -0.7, 0); await sleep(page, 250); await padStick(page, 'left', 0, 0); await sleep(page, 120); const s1 = await BS();
    await shot('a6-cursor');
    await press('LB'); const s2 = await BS();
    R.check('in the palette a light stick touch does nothing; a push folds it and frees the cursor (the hints: Palette · Done); LB opens the palette again on the same tab', s0.st === 'pal' && s1.st === 'cur' && s1.fold && !s1.dim && /Palette/.test(s1.hints) && /Done/.test(s1.hints) && s2.st === 'pal' && s2.cat === s1.cat && !s2.fold, JSON.stringify({ s0: s0.st, s1: { st: s1.st, hints: s1.hints }, s2: { st: s2.st, cat: s2.cat } }));
    // LT / RT with nothing in hand turn the camera; View cycles the overlays
    const y0 = await ev(() => window.G.engine.rig.yawTarget); await press('RT'); const y1 = await ev(() => window.G.engine.rig.yawTarget); await press('LT'); const y2 = await ev(() => window.G.engine.rig.yawTarget);
    await press('View'); const ov = await ev(() => window.G.sim.overlayMode);
    R.check('with nothing in hand RT / LT turn the camera a quarter; View cycles the coverage overlays', Math.abs(Math.abs(y1 - y0) - Math.PI / 2) < 0.01 && Math.abs(y2 - y0) < 0.01 && ov && ov !== 'build', JSON.stringify({ y0, y1, y2, ov }));
    await press('View'); for (let i = 0; i < 6 && (await ev(() => window.G.sim.overlayMode)) !== 'build'; i++) await press('View');
    // the Tools tab: lay a path over grass (hold A and move), undo it; paint a zone, undo it
    while ((await BS()).cat !== 'tools') await press('RB');
    await shot('a7-tools');
    const spot = await ev(() => { // grass a stroke can pave: three free tiles in a row near the camera's focus
      const G = window.G, sim = G.sim, GRASS = 0, W = 224, f = G.engine.rig.focus; // (world/layout.js T.GRASS: no module import, so this runs on the built bundle too)
      const ok = (x, z) => sim.terrain.tiles[z * W + x] === GRASS && sim.occ[z * W + x] < 0 && sim.reserveTile[z * W + x] < 0;
      for (let r = 2; r < 22; r++) for (let a = 0; a < 24; a++) { const x = Math.round(f.x + Math.cos(a / 12 * Math.PI) * r), z = Math.round(f.z + Math.sin(a / 12 * Math.PI) * r); if (ok(x, z) && ok(x + 1, z) && ok(x + 2, z) && ok(x, z + 1) && ok(x + 1, z + 1) && ok(x + 2, z + 1)) return [x, z]; }
      return null;
    });
    for (let i = 0; i < 8 && (await BS()).cur !== 'path'; i++) await press('DRight');
    await press('A'); const t1 = await BS();
    let paved = 0, unpaved = false;
    if (spot) {
      await cursorTo(spot[0] + 0.5, spot[1] + 0.5); await frames(3);
      await padDown(page, 'A'); await frames(3);
      for (let k = 1; k <= 2; k++) { await cursorTo(spot[0] + k + 0.5, spot[1] + 0.5); await frames(4); }
      await padUp(page, 'A'); await frames(3);
      paved = await ev(() => window.G.build.undoStack.at(-1)?.kind === 'path' ? window.G.build.undoStack.at(-1).tiles.length : 0);
      await shot('a8-path');
      await press('Y');
      unpaved = await ev(([x, z]) => { const s = window.G.sim; return [0, 1, 2].every(k => s.terrain.tiles[z * 224 + x + k] === 0); }, spot); // (T.GRASS)
    }
    R.check('the Tools tab\'s Lay paths: A takes it, holding A and moving paves a stroke, Y lifts the whole stroke', t1.tool === 'path' && t1.fold && paved >= 2 && unpaved, JSON.stringify({ t1: t1.tool, spot, paved, unpaved }));
    await press('B'); // (back to the palette, on Lay paths)
    for (let i = 0; i < 8 && (await BS()).cur !== 'R'; i++) await press('DLeft');
    await press('A'); const zt = await BS();
    const zoneSpot = await ev(() => { // a free, open plot for homes (plots.js ZONE_TYPES[1]: 'home'), found through the sim
      const sim = window.G.sim, seen = new Set();
      for (let z = 4; z < 220; z += 2) for (let x = 4; x < 220; x += 2) { const p = sim.plotOf(x, z); if (!p || seen.has(p)) continue; seen.add(p); if (!p.fixed && sim.plotOpen(p) && sim.plotFree(p) && p.allows.includes('home') && !p.zone && !sim.zone[(p.z + 1) * 224 + p.x + 1]) return [p.x + p.w / 2, p.z + p.d / 2, p.id]; }
      return null;
    });
    let zoned = false, unzoned = false;
    if (zoneSpot) {
      await ev(([x, z]) => { const G = window.G; (G.buildFocus || (G.buildFocus = G.player.pos.clone())).set(x, G.buildFocus.y, z); }, zoneSpot); await sleep(page, 600);
      await cursorTo(zoneSpot[0], zoneSpot[1]); await frames(3);
      await press('A', 60); await frames(4);
      zoned = await ev(() => window.G.build.undoStack.at(-1)?.kind === 'zone');
      await shot('a9-zone');
      await press('Y'); await frames(2);
      unzoned = await ev(([x, z]) => !window.G.sim.zone[Math.floor(z) * 224 + Math.floor(x)], zoneSpot);
    }
    R.check('the Homes zone: A paints a free plot, Y takes the zone back off', zt.tool === 'zone1' && zoned && unzoned, JSON.stringify({ zt: zt.tool, zoneSpot, zoned, unzoned }));
    await press('B');
    // Menu over build mode: the game menu; nothing reaches the world; B closes it and build mode carries on
    const m0 = await BS(); const pp0 = await ev(() => window.G.player.pos.toArray());
    await press('Menu'); await wait(() => window.G.ui.isOpen('menu')); await sleep(page, 300);
    await shot('a10-menu');
    await padStick(page, 'left', 0.9, 0); await sleep(page, 400); await padStick(page, 'left', 0, 0);
    await press('X'); await press('Y');
    const mm = await ev(() => ({ menu: window.G.ui.isOpen('menu'), build: window.G.build.active, pos: window.G.player.pos.toArray(), roll: window.G.player.rollT || 0 }));
    await press('B'); await wait(() => !window.G.ui.isOpen('menu')); await frames(4); const m1 = await BS();
    const still = Math.hypot(mm.pos[0] - pp0[0], mm.pos[2] - pp0[2]) < 0.05;
    R.check('Menu opens the game menu over build mode; the stick, X and Y reach nothing in the world meanwhile; B closes it and build mode carries on as it was', mm.menu && mm.build && still && m1.st === m0.st && m1.cat === m0.cat && m1.undo === m0.undo, JSON.stringify({ mm, m0: { st: m0.st, cat: m0.cat, undo: m0.undo }, m1: { st: m1.st, cat: m1.cat, undo: m1.undo }, still }));
    // the mouse gets its own palette back; Ctrl+Z undoes too
    await press('LB'); await press('LB'); // (a building tab, not Tools)
    await page.mouse.move(400, 300); await page.mouse.move(470, 340, { steps: 5 }); await frames(4);
    const mouse = await ev(() => { const P = window.G.ui.panels.build, pn = P.panel, vis = e => !!e && e.offsetParent !== null; return { dev: window.G.controls.device, pal: pn.classList.contains('pc-pal'), fold: pn.classList.contains('pc-fold'), toolbar: vis(P.$.tools), toolsTab: vis(P.$.tabs.querySelector('[data-c="tools"]')), grid: getComputedStyle(P.$.cards).display, cursor: window.G.ui.padCursor.root.classList.contains('on') }; });
    const k0 = await ev(() => window.G.build.undoStack.length);
    await page.keyboard.down('Control'); await tap(page, 'z', 60); await page.keyboard.up('Control'); await frames(3); // (held across frames, as a hand presses it)
    const k1 = await ev(() => window.G.build.undoStack.length);
    R.check('a mouse move gives the mouse its palette back (the toolbar, no Tools tab, the card row, no paw cursor); Ctrl+Z undoes in build mode', mouse.dev === 'kbm' && !mouse.pal && !mouse.fold && mouse.toolbar && !mouse.toolsTab && mouse.grid === 'flex' && !mouse.cursor && (k0 === 0 || k1 === k0 - 1), JSON.stringify({ mouse, k0, k1 }));
    // B with nothing in hand leaves
    await padStick(page, 'left', 0, -0.5); await sleep(page, 150); await padStick(page, 'left', 0, 0); await frames(3);
    const st0 = (await BS()).st;
    await press('B'); const off = await wait(() => !window.G.build.active && !window.G.controls.vcursor.on, null, 3000);
    R.check('B with nothing in hand leaves build mode (the cursor and the palette go)', off && !(await ev(() => window.G.ui.isOpen('build'))), JSON.stringify({ st0, off }));
  }

  if (!ONLY || ONLY.includes('c')) {
    // ---------------------------------------------------------------- c) the tabbed menu (§14.4)
    await padReset(page); await padStick(page, 'left', 0, -0.4); await sleep(page, 120); await padStick(page, 'left', 0, 0); await frames(3);
    await ev(() => { const G = window.G; G.ui.closeAll(); G.ui.padMenu.last = 'game'; G.state.coins = Math.max(G.state.coins, 500); });
    await press('Menu'); await wait(() => window.G.ui.padMenu.active); await sleep(page, 400);
    const c0 = await PMS();
    R.check('Menu opens the tabbed menu on the Game page the first time: the strip names the seven pages with LB and RB at its ends, the game pauses, the panel starts under the strip', c0.active && c0.cur === 'game' && c0.tabs.join() === 'inventory,character,skills,quests,map,game,settings' && c0.bumps === 'LB,RB' && c0.paused && c0.panelTop >= c0.stripBottom - 1 && c0.on === 'game', JSON.stringify(c0));
    await shot('c-game');
    // RB through every page and round; LB back
    const seenC = [c0.cur];
    for (let i = 0; i < 7; i++) {
      await press('RB'); await sleep(page, 350); const s = await PMS(); seenC.push(s.cur);
      if (i < 6) await shot('c-' + s.cur);
      if (!(s.open.length === 1 && s.on === s.cur && s.panelTop >= s.stripBottom - 1)) R.note('page ' + s.cur + ' ' + JSON.stringify(s));
    }
    await press('LB'); await sleep(page, 300); const cl = (await PMS()).cur;
    R.check('RB walks every page (Game → Settings → Bag … Map → Game, one panel open at a time, the strip raising it, each panel under the strip); LB goes back (wrapping)', seenC.join() === 'game,settings,inventory,character,skills,quests,map,game' && cl === 'map', JSON.stringify({ seenC, cl }));
    // the sub-tabs on LT / RT: the Bag's views, the skill trees, the Journal's tabs, Settings' pages
    const go = async k => { for (let i = 0; i < 8 && (await PMS()).cur !== k; i++) await press('RB'); await sleep(page, 250); };
    await go('inventory');
    const bv = [await ev(() => window.G.ui.panels.inventory.view)]; await press('RT'); bv.push(await ev(() => window.G.ui.panels.inventory.view)); await press('RT'); bv.push(await ev(() => window.G.ui.panels.inventory.view)); await press('LT'); bv.push(await ev(() => window.G.ui.panels.inventory.view));
    const bagHints = (await PMS()).hints;
    await press('LT'); // (back to the Bag view)
    await go('skills');
    const t0 = await ev(() => window.G.ui.panels.skills.tree); await press('RT'); const t1 = await ev(() => window.G.ui.panels.skills.tree); await press('LT'); const t2 = await ev(() => window.G.ui.panels.skills.tree);
    // the Charge drawer's skill strip: a right-stick flick (it was LT / RT before CT-11)
    const k0 = await ev(() => window.G.ui.panels.skills.chg.id); await padStick(page, 'right', 0.9, 0); await frames(3); await padStick(page, 'right', 0, 0); await frames(3); const k1 = await ev(() => window.G.ui.panels.skills.chg.id);
    const skHints = (await PMS()).hints;
    await shot('c-skills-drawer');
    await go('quests');
    const q0 = await ev(() => window.G.ui.panels.quests.tab); await press('RT'); const q1 = await ev(() => window.G.ui.panels.quests.tab);
    await go('settings');
    const sp = [await ev(() => window.G.ui.padMenu.settingsPage())];
    for (let i = 0; i < 4; i++) { await press('RT'); await sleep(page, 200); sp.push(await ev(() => ({ p: window.G.ui.padMenu.settingsPage(), view: window.G.ui.panels.menu.view, dev: window.G.ui.panels.menu.dev }))); if (i === 0) await shot('c-settings-controller'); }
    const subStrip = await ev(() => [...document.querySelectorAll('.pm-strip .pm-st')].map(e => e.textContent + (e.classList.contains('on') ? '*' : '')).join(','));
    await press('LT'); const spL = await ev(() => window.G.ui.padMenu.settingsPage()); await press('RT');
    R.check('LT / RT step a page\'s own tabs: the Bag ⇄ Pantry ⇄ Furniture, the skill trees, the Journal\'s tabs, and Settings\' pages (General → Controller → Keyboard & mouse → Touch → General, named under the strip); the hints say LB RB Pages · LT RT Tabs', bv.join() === 'bag,pantry,furniture,pantry' && t1 !== t0 && t2 === t0 && q1 !== q0 && sp[0] === 'general' && sp[1].p === 'pad' && sp[1].view === 'controls' && sp[2].p === 'kbm' && sp[3].p === 'touch' && sp[4].p === 'general' && sp[4].view === 'settings' && spL === 'touch' && /General/.test(subStrip) && /Pages/.test(bagHints) && /Tabs/.test(bagHints), JSON.stringify({ bv, t0, t1, t2, q0, q1, sp, spL, subStrip, bagHints }));
    R.check('the K panel\'s Charge drawer steps with a right-stick flick (its LT / RT went to the skill trees); the hints name it', k1 && k1 !== k0 && /Charge skill/.test(skHints), JSON.stringify({ k0, k1, skHints }));
    // nothing reaches the world while the menu is up: the stick, A, X, Y, RT on the Bag page
    await go('inventory');
    const w0 = await ev(() => ({ pos: window.G.player.pos.toArray(), casts: window.__casts40 = 0, roll: window.G.player.rollT || 0 }));
    await ev(() => { const G = window.G; if (!G.skills.__s40) { G.skills.__s40 = true; const rc = G.skills.tryCast.bind(G.skills); G.skills.tryCast = (...a) => { window.__casts40 = (window.__casts40 || 0) + 1; return rc(...a); }; } });
    await padStick(page, 'left', 0.9, 0); await sleep(page, 400); await padStick(page, 'left', 0, 0);
    for (const b of ['X', 'Y', 'RT']) await press(b);
    const w1 = await ev(() => ({ pos: window.G.player.pos.toArray(), casts: window.__casts40 || 0, menu: window.G.ui.padMenu.active }));
    const still = Math.hypot(w1.pos[0] - w0.pos[0], w1.pos[2] - w0.pos[2]) < 0.05;
    R.check('nothing reaches the world while the menu is up (the stick, X, Y and RT on the Bag page: the hero stays put, no skill casts)', still && w1.casts === 0 && w1.menu, JSON.stringify({ w0: w0.pos, w1 }));
    // B: a held item first, then the whole menu; Menu reopens on the last page used, Menu again closes it
    const slot = await ev(async () => { const G = window.G, I = await import('/src/rpg/items.js').catch(() => null); if (I && !G.state.inventory.some(Boolean)) G.actions.pickup(I.generateItem({ ilvl: 2, rarity: 'normal', slot: 'boots' })); return G.state.inventory.findIndex(Boolean); });
    let held = null, bOne = null;
    for (let i = 0; i < 3 && (await ev(() => window.G.ui.panels.inventory.view)) !== 'bag'; i++) await press('LT'); // (RT above stepped the Bag to its Pantry)
    if (slot >= 0) {
      await ev(i => { const N = window.G.ui.padNav, e = document.querySelector(`.slot[data-c="inv"][data-i="${i}"]`); N.focus(e, N.candidates([document.querySelector('.p-inv')])); }, slot);
      await press('A'); held = await ev(() => !!window.G.ui.drag.held);
      await press('B'); bOne = await ev(() => ({ held: !!window.G.ui.drag.held, menu: window.G.ui.padMenu.active, bag: window.G.ui.isOpen('inventory') }));
    } else R.note('no bag item to hold (the bundle has no items module): the held-item step is skipped');
    await press('B'); await frames(3); const bTwo = await ev(() => ({ menu: window.G.ui.padMenu.active, open: Object.keys(window.G.ui.panels).filter(k => window.G.ui.isOpen(k)), strip: window.G.ui.padMenu.root.classList.contains('on') }));
    await press('Menu'); await sleep(page, 300); const re = (await PMS()).cur; await press('Menu'); await frames(3); const reOff = await ev(() => !window.G.ui.padMenu.active && !window.G.ui.isOpen('inventory'));
    R.check('B puts a held item back first, then closes the whole menu (no panel left, the strip gone); Menu reopens it on the last page (the Bag), Menu again closes it', (slot < 0 || (held && !bOne.held && bOne.menu && bOne.bag)) && !bTwo.menu && !bTwo.open.length && !bTwo.strip && re === 'inventory' && reOff, JSON.stringify({ slot, held, bOne, bTwo, re, reOff }));
    // the keyboard keeps its single panels: I opens the bag alone (no strip)
    await page.mouse.move(300, 300); await page.mouse.move(340, 320, { steps: 4 }); await tap(page, 'i', 60); await frames(4);
    const kb = await ev(() => ({ bag: window.G.ui.isOpen('inventory'), menu: window.G.ui.padMenu.active, pm: window.G.ui.root.classList.contains('pm-on'), dev: window.G.controls.device }));
    await tap(page, 'i', 60); await frames(3);
    R.check('the keyboard keeps its single panels: I opens the bag alone, with no strip', kb.bag && !kb.menu && !kb.pm && kb.dev === 'kbm', JSON.stringify(kb));
    await padStick(page, 'left', 0, -0.5); await sleep(page, 150); await padStick(page, 'left', 0, 0); await frames(3);
  }

  if (!ONLY || ONLY.includes('b')) {
    // ---------------------------------------------------------------- b) decorate mode (§14.6)
    await ev(() => window.G.ui.closeAll());
    await ev(() => window.G.openHome()); await waitMode(page, 'interior'); await sleep(page, 900);
    await ev(() => { const G = window.G; for (const [id, n] of [['zabutonBlue', 1], ['sideTable', 2], ['wp_stripes', 1], ['scrollCrane', 1]]) G.actions.addFurniture(id, n); G.ui.toasts?.retire?.(0); });
    // in through the tabbed menu's Game page
    await press('Menu'); await wait(() => window.G.ui.padMenu.active); for (let i = 0; i < 8 && (await PMS()).cur !== 'game'; i++) await press('RB');
    await ev(() => { const N = window.G.ui.padNav, b = document.querySelector('.p-menu [data-a="decorate"]'); N.focus(b, N.candidates([document.querySelector('.p-menu')])); });
    await press('A'); await wait(() => window.G.housing.decor.active && window.G.ui.padCursor.state === 'pal'); await sleep(page, 700);
    const d0 = await DS();
    R.check('the Game page\'s Decorate opens decorate mode on its palette: LB and RB at the tab strip\'s ends, the cards a grid, the focus on one, the side card names it, the Home Rating stays', d0.st === 'pal' && d0.pal && d0.bumps === 'LB,RB' && d0.grid === 'grid' && !!d0.cur && d0.side.length > 4 && d0.rating, JSON.stringify(d0));
    await shot('b1-palette');
    // the tabs, the grid: browsing only
    const tabsD = await ev(() => [...document.querySelectorAll('.p-decor .dc-tabs .tab')].map(t => t.dataset.t)), seenD = [d0.tab];
    for (let i = 0; i < tabsD.length; i++) { await press('RB'); seenD.push((await DS()).tab); }
    await press('LB'); const wrapD = (await DS()).tab;
    for (let i = 0; i < 8 && (await DS()).tab !== 'all'; i++) await press('RB');
    const g0d = await DS(); await press('DRight'); const g1d = await DS();
    R.check('decorate\'s tabs on RB (All → … → Wallpaper & Floors → All) and LB (wrapping); the D-pad browses the grid with nothing in hand, the side card following', seenD.join() === [...tabsD, tabsD[0]].join() && wrapD === tabsD.at(-1) && g1d.cur !== g0d.cur && !g1d.sel && g1d.side !== g0d.side, JSON.stringify({ tabsD, seenD, wrapD, g0: g0d.cur, g1: g1d.cur }));
    // pick the side table, move it, rotate it, place it, undo it
    for (let i = 0; i < 40 && (await DS()).cur !== 'sideTable'; i++) await press('DRight');
    await press('A'); const h0d = await DS();
    await shot('b2-holding');
    let placedD = null;
    for (const [cx, cz] of [[5, 5], [6, 5], [5, 6], [7, 6], [4, 4], [8, 7], [3, 6]]) {
      await cellTo(cx, cz); await frames(3);
      if (await ev(() => window.G.housing.decor.ghostOk)) { const r0 = await ev(() => window.G.housing.decor.rot); await press('RT'); const r1 = await ev(() => window.G.housing.decor.rot); const n0 = (await DS()).n; await press('A'); const s = await DS(); if (s.n === n0 + 1) { placedD = { cx, cz, r0, r1, n0 }; break; } }
    }
    await shot('b3-placed');
    const st0 = await ev(() => window.G.state.furniture.sideTable || 0);
    await press('Y'); const u0 = await DS(); const st1 = await ev(() => window.G.state.furniture.sideTable || 0);
    R.check('A picks the Side Table up (folded, its chip), the cursor moves it, RT turns it, A places it; Y undoes it (back in storage)', h0d.st === 'hold' && h0d.fold && /Side Table/.test(h0d.held) && !!placedD && placedD.r1 === (placedD.r0 + 1) % 4 && u0.n === placedD.n0 && st1 === st0 + 1, JSON.stringify({ h0d, placedD, u0n: u0.n, st0, st1 }));
    // place one again, then from the room: the cursor on it, A picks it up, B puts it back where it was; X stores it; Y brings it back
    for (let i = 0; i < 40 && (await DS()).cur !== 'sideTable'; i++) await press('DRight');
    await press('A'); await cellTo(placedD?.cx ?? 5, placedD?.cz ?? 5); await frames(3); await press('A');
    const k2 = await ev(() => { const it = window.G.housing.decor.items.findLast(i => i.id === 'sideTable'); return it ? { k: it.k, x: it.x, z: it.z, rot: it.rot } : null; });
    if ((await DS()).sel) await press('B'); // (one left in hand: back to the palette)
    await padStick(page, 'left', 0.65, 0); await sleep(page, 120); await padStick(page, 'left', 0, 0); await frames(2); // (a real push: a light touch keeps the palette)
    await cellTo((k2?.x ?? 5), (k2?.z ?? 5)); await frames(4);
    const cur0 = await DS();
    await press('A'); const mv0 = await DS();
    await press('LT'); await press('B'); const mv1 = await DS(); const k3 = await ev(k => { const it = window.G.housing.decor.items.find(i => i.k === k); return it ? { x: it.x, z: it.z, rot: it.rot } : null; }, k2?.k);
    await shot('b4-cursor');
    await cellTo((k2?.x ?? 5), (k2?.z ?? 5)); await frames(4);
    const n2 = (await DS()).n; await press('X'); const xs = await DS(); await press('Y'); const xy = await DS();
    R.check('from the room: the cursor over the table, A picks it up (moving it), LT turns it, B puts it back exactly where it was (the cursor stays); X stores the piece under the cursor, Y brings it back', cur0.st === 'cur' && /Move it/.test(cur0.hints) && mv0.hold === 'sideTable' && mv1.st === 'cur' && !mv1.hold && k3 && k3.x === k2.x && k3.z === k2.z && k3.rot === k2.rot && xs.n === n2 - 1 && xy.n === n2, JSON.stringify({ k2, cur0: { st: cur0.st, hints: cur0.hints }, mv0: mv0.hold, mv1: mv1.st, k3, n2, xs: xs.n, xy: xy.n }));
    // a wallpaper from its tab: A puts it up at once (the palette stays); Y takes it down
    await press('LB'); for (let i = 0; i < 8 && (await DS()).tab !== 'surface'; i++) await press('RB');
    for (let i = 0; i < 12 && (await DS()).cur !== 'wp_stripes'; i++) await press('DRight');
    const wl0 = await ev(() => window.G.world.wallId); await press('A'); const wl1 = await ev(() => window.G.world.wallId); const wst = (await DS()).st;
    await shot('b5-wallpaper');
    await press('Y'); const wl2 = await ev(() => window.G.world.wallId);
    R.check('Wallpaper & Floors: A on the stripes puts them up at once (the palette stays), Y takes them down again', wl1 === 'wp_stripes' && wl1 !== wl0 && wst === 'pal' && wl2 === wl0, JSON.stringify({ wl0, wl1, wl2, wst }));
    // LT / RT zoom with nothing in hand; Menu over decorate and back; B leaves
    const z0 = await ev(() => window.G.engine.rig.distTarget); await padDown(page, 'RT'); await sleep(page, 500); await padUp(page, 'RT'); const z1 = await ev(() => window.G.engine.rig.distTarget);
    await press('Menu'); await sleep(page, 300); const dm = await ev(() => ({ menu: window.G.ui.padMenu.active, decor: window.G.housing.decor.active }));
    await press('B'); await frames(4); const dm2 = await DS();
    await press('B'); const dOff = await wait(() => !window.G.housing.decor.active, null, 3000);
    R.check('with nothing in hand LT / RT zoom; Menu opens the tabbed menu over decorate and B comes back to it as it was; B with nothing in hand leaves', z1 !== z0 && dm.menu && dm.decor && dm2.st === 'pal' && dOff, JSON.stringify({ z0, z1, dm, dm2: dm2.st, dOff }));
    await ev(() => window.G.housing.exit?.()); await waitMode(page, 'village'); await sleep(page, 400);
  }

  if (!ONLY || ONLY.includes('g')) {
    // ---------------------------------------------------------------- b) the decorating guide ("Make it home", R-13) on the pad
    await page.goto(`${BASE}/?fresh&nointro&tut&hour=11&dseed=1`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__ready === true && window.G?.player, null, { timeout: 60000 }); await sleep(page, 600);
    await ev(() => { const G = window.G; G.sim.tickT = -1e9; clearInterval(window.__freeze); window.__freeze = setInterval(() => { G.sim.tickT = -1e9; }, 200); G.state.flags.hints = { garden: 1, build: 1, travel: 1, skills: 1, stats: 1, loot: 1, potion: 1 }; G.state.flags.tutorials = { house: { done: true, step: 'wrap' } }; });
    await installPad(page); await padStick(page, 'left', 0, -0.4); await sleep(page, 150); await padStick(page, 'left', 0, 0); await sleep(page, 1500);
    const stepIs = (step, timeout = 15000) => page.waitForFunction(s => window.G.tutorials.active === 'makeHome' && window.G.tutorials.cur?.step?.id === s && window.G.tutorials.cur.entered && !window.G.tutorials.paused, step, { timeout }).then(() => true, () => false);
    const say = () => ev(() => ({ say: document.querySelector('.ts-tx')?.innerHTML || '', obj: document.querySelector('.to-tx')?.innerHTML || '', step: window.G.tutorials.cur?.step?.id || null }));
    const glyphs = h => (h.match(/kc sm pad/g) || []).length;
    // the door: A (the context interact)
    await ev(() => { const G = window.G, d = G.heroes.homeDoor(); G.player.setPos(d.x + 0.6, d.z + 0.3); G.player.moveTarget = null; G.interactCooldown = 0; }); await sleep(page, 500);
    await press('A'); await waitMode(page, 'interior');
    const sJobs = await stepIs('jobs');
    const sDeco = await stepIs('decorate', 15000); const lDeco = await say();
    await press('Menu'); await sleep(page, 400);
    for (let i = 0; i < 8 && (await PMS()).cur !== 'game'; i++) await press('RB');
    await ev(() => { const N = window.G.ui.padNav, b = document.querySelector('.p-menu [data-a="decorate"]'); N.focus(b, N.candidates([document.querySelector('.p-menu')])); });
    await press('A');
    const sPlace = await stepIs('place', 8000); await sleep(page, 600); const lPlace = await say();
    await shot('g1-place');
    for (let i = 0; i < 40 && (await DS()).cur !== 'zabutonBlue'; i++) await press('DRight');
    await press('A');
    for (const [cx, cz] of [[9, 6], [8, 6], [9, 7], [7, 5], [10, 6], [6, 7]]) { await cellTo(cx, cz); await frames(3); if (await ev(() => window.G.housing.decor.ghostOk)) { await press('A'); break; } }
    const sMove = await stepIs('move', 8000); await sleep(page, 400); const lMove = await say();
    const cush = await ev(() => { const it = window.G.housing.decor.items.findLast(i => i.id === 'zabutonBlue'); return it ? [it.x, it.z] : null; });
    if ((await DS()).st === 'pal') { await padStick(page, 'left', 0.65, 0); await sleep(page, 100); await padStick(page, 'left', 0, 0); }
    await cellTo(cush[0], cush[1]); await frames(4); await press('A'); await press('RT');
    for (const [dx, dz] of [[1, 0], [0, 1], [-1, 0], [2, 0], [0, -1], [1, 1]]) { await cellTo(cush[0] + dx, cush[1] + dz); await frames(3); if (await ev(() => window.G.housing.decor.ghostOk)) { await press('A'); break; } }
    const sWall = await stepIs('wallpaper', 8000); await sleep(page, 400); const lWall = await say();
    await press('LB'); for (let i = 0; i < 8 && (await DS()).tab !== 'surface'; i++) await press('RB');
    for (let i = 0; i < 12 && (await DS()).cur !== 'wp_stripes'; i++) await press('DRight');
    await press('A');
    const sRate = await stepIs('rating', 8000); await sleep(page, 600);
    const fav = await ev(() => { const R = window.G.housing.ratingNow(); return R?.tips?.length ? (window.G.state.furniture.packPhoto > 0 ? 'packPhoto' : null) : null; });
    let hung = false;
    if (fav) {
      for (let i = 0; i < 8 && (await DS()).tab !== 'all'; i++) await press('RB');
      for (let i = 0; i < 40 && (await DS()).cur !== fav; i++) await press('DRight');
      await press('A');
      for (const cx of [6, 7, 5, 8, 3, 9, 4, 2]) { await cellTo(cx, 0, 1.3, 'n'); await frames(3); if (await ev(() => window.G.housing.decor.ghostOk)) { await press('A'); hung = true; break; } }
    }
    const sWrap = await stepIs('wrap', 8000); await sleep(page, 400); const lWrap = await say();
    await shot('g2-wrap');
    await press('View'); await sleep(page, 900);
    const done = await ev(() => ({ rec: window.G.state.flags.tutorials.makeHome, active: window.G.tutorials.active }));
    const padWords = [lDeco, lPlace, lMove, lWall].every(l => glyphs(l.say + l.obj) > 0) && !/\*|press \*?F|with \*?Y\b|\(Esc\)/.test(lPlace.say + lMove.say + lMove.obj + lDeco.say);
    R.check('the decorating guide ("Make it home") end to end on the pad: A at the door; Menu → Game → Decorate; the cushion from the grid, A on the floor; picked up with A, turned with RT, put down; the stripes from Wallpaper & Floors; the favourite hung; View for Got it! — every line naming the pad\'s buttons (glyphs, no F / Y / Esc)', sJobs && sDeco && sPlace && sMove && sWall && sRate && (hung || !fav) && sWrap && done.rec?.done && !done.active && padWords, JSON.stringify({ sJobs, sDeco, sPlace, sMove, sWall, sRate, fav, hung, sWrap, done, words: [lDeco.say, lPlace.say, lMove.say, lMove.obj, lWall.say].map(s => s.replace(/<svg[\s\S]*?<\/svg>/g, '◆').slice(0, 140)), wrap: lWrap.say.replace(/<svg[\s\S]*?<\/svg>/g, '◆').slice(-60) }));
  }
} catch (e) {
  R.check('scenario ran to the end', false, String(e?.stack || e).slice(0, 600));
} finally {
  await padReset(page).catch(() => {});
  const failed = R.finish(errors, warns);
  await browser.close();
  process.exit(failed ? 1 : 0);
}
