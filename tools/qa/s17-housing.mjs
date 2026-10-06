// Scenario 17: housing (docs/HOUSING.md). Phase 1: interiors and decorating —
//  a) the cottage door goes inside (G.mode 'interior', the iris, the door mat back out to the same door); the room's
//     household jobs: the bed (sleep: a new morning, still inside), the chest (the stash), the stove (the Cook panel)
//  b) decorate mode through the real mouse and keys: B, place a cushion from storage, R rotates, a side table, a vase on
//     it, a photo on the back wall, a rug under furniture; the door can't be blocked; pick up the table (the vase
//     rides along), store it, Ctrl+Z; wallpaper and floor from the palette (storage counts, undo)
//  c) persistence: the interior and the storage survive save / reload; an old save with no interior gets the default
//  d) the benched hero is home at night: hosted inside, and back in the village after
//  e) 10 enter / exit cycles: no geometry / texture / listener / interactable / light-source growth, enter time
// Phase 2 (the villagers' homes):
//  f) every named villager owns one home (saved b.owner) with one door prompt; an old save gets the same owners
//  g) the door: a stranger can't go in, a friend visits (the owner hosts you, restored after), a knock at night
//  h) a decorate request: decorating their home, their own pieces stay theirs, the reaction, hearts, the rating's
//     happiness
//  i) the invitation at three hearts: redecorate any time; their own wallpaper stays theirs
// Phase 3 (upgrades and exteriors):
//  j) every home's mailbox opens its house card (Upgrade / Remodel / Enter)
//  k) upgrading a home: the level cost is spent, the scaffold goes up, the house grows and keeps its seed and style;
//     inside, the room is bigger and every piece came along
//  l) remodelling through the panel: a style set (the live preview follows), Apply pays and rebuilds the house with
//     the style (its template key), its yard fence follows; the look survives a reload
//  m) Chewy's cottage grows to L2 and L3: the furniture comes along, the household jobs still work
//  n) the styled-template cache stays under its cap; remodel cycles grow nothing
// Phase 4 (the guides, with the director on: ?tut):
//  o) "Make it home" (Shadow): it starts the next time you're in the cottage after the house tour; the jobs; B (the
//     Decorate button spotlit); a cushion from storage (its card spotlit); pick up, turn, put down; a wallpaper (the tab
//     and the card spotlit); the Home Rating chip; the wrap-up; in the Guides tab
//  p) "Remodel" (Tanu): it starts when a mailbox is first opened, over the house card; Remodel; a set; a swatch; the
//     cost; Remodel applies it and ends the guide; an old save that had been inside the cottage is offered Make it home
// SHOTS=<dir> saves screenshots of the key moments.
import path from 'node:path';
import { launch, boot, sleep, makeReport, tap, waitMode, installProbes, drainDialogue, BASE } from './lib.mjs';

const R = makeReport('S17 housing');
const { browser, page, errors, warns } = await launch({ w: 1600, h: 900 });
const G = (fn, arg) => page.evaluate(fn, arg);
const SHOTS = process.env.SHOTS;
const snap = async n => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 's17_' + n + '.png') }); };
const enter = async () => { await G(() => { window.G.openHome(); }); await waitMode(page, 'interior'); await sleep(page, 300); };
const exit = async () => { await G(() => { window.G.world.interactables.find(i => i.door).onInteract(); }); await waitMode(page, 'village'); await sleep(page, 300); };
// the screen point of a room cell (or a wall cell at height y on the north / west wall)
const cellXY = (cx, cz, y = 0, wall = null) => G(([cx, cz, y, wall]) => {
  const G = window.G, O = 2, C = 0.5, v = new G.THREE.Vector3(O + (cx + 0.5) * C, y, O + (cz + 0.5) * C);
  if (wall === 'n') v.z = O + cz * C + 0.02; if (wall === 'w') v.x = O + cx * C + 0.02;
  v.project(G.engine.camera); return [(v.x * 0.5 + 0.5) * innerWidth, (-v.y * 0.5 + 0.5) * innerHeight];
}, [cx, cz, y, wall]);
const hover = async (cx, cz, y = 0, wall = null) => { const [x, yy] = await cellXY(cx, cz, y, wall); await page.mouse.move(x - 3, yy - 3); await sleep(page, 60); await page.mouse.move(x, yy); await sleep(page, 160); };
const click = async (cx, cz, y = 0, wall = null) => { await hover(cx, cz, y, wall); const [x, yy] = await cellXY(cx, cz, y, wall); await page.mouse.down(); await sleep(page, 50); await page.mouse.up(); await sleep(page, 220); void x; void yy; };
const D = () => G(() => { const D = window.G.housing.decor, W = window.G.world; return { active: D.active, sel: D.sel, hold: D.hold?.it.id || null, ok: D.ghostOk, cand: D.lastCand, items: W.items.map(i => ({ ...i })), store: { ...(window.G.state.furniture || {}) }, prompt: document.querySelector('.hud .prompt')?.textContent?.slice(1) || '' }; });
const pick = id => G(id => { const c = document.querySelector(`.p-decor .card[data-id="${id}"]`); c?.click(); return !!c; }, id);
const tab = t => G(t => document.querySelector(`.p-decor .tab[data-t="${t}"]`)?.click(), t);
try {
  await boot(page, 'fresh&nointro&hour=11');
  await G(() => { const G = window.G; G.sim.tickT = -1e9; clearInterval(window.__freeze); window.__freeze = setInterval(() => { G.sim.tickT = -1e9; }, 200); });
  // ---------------------------------------------------------------- a) in and out, the household jobs
  const door0 = await G(() => { const G = window.G, d = G.heroes.homeDoor(); G.player.setPos(d.x + 0.6, d.z + 0.3); return { lbl: G.village.world.interactables.find(i => i.building?.type === 'chewyHouse')?.label, vInter: G.village.world.interactables.length }; });
  await sleep(page, 300);
  await G(() => { window.G.interactCooldown = 0; }); await tap(page, 'f', 70);
  await waitMode(page, 'interior'); await sleep(page, 500);
  const in1 = await G(() => { const G = window.G, W = G.world; return { mode: G.mode, ms: Math.round(G.housing.enterMs), loc: document.querySelector('.hud .loc-t')?.textContent, jobs: W.interactables.map(i => i.use || (i.door ? 'door' : i.label)), onMat: Math.hypot(G.player.pos.x - W.doorMatPos.x, G.player.pos.z - W.doorMatPos.z) < 0.3, shadow: G.companion.world === W, items: W.items.length, draws: W.batches.map.size, lights: W.lightPool.sources.size, deco: getComputedStyle(document.querySelector('.home-tools')).display }; });
  await snap('inside');
  R.check(`F at the cottage door goes inside (${in1.ms} ms): the player on the door mat, Shadow along, the bed / chest / stove / door mat as interactables, the Decorate button`, door0.lbl === "Enter Chewy's Cottage" && in1.mode === 'interior' && in1.onMat && in1.shadow && ['door', 'sleep', 'stash', 'cook'].every(j => in1.jobs.includes(j)) && /Cottage/.test(in1.loc) && in1.deco !== 'none' && in1.items >= 12, JSON.stringify({ door0, in1 }));
  const useAt = async use => { await G(use => { const G = window.G, it = G.world.interactables.find(i => i.use === use); G.player.setPos(it.pos.x, it.pos.z); G.player.moveTarget = null; G.interactCooldown = 0; }, use); await sleep(page, 200); await tap(page, 'f', 70); await sleep(page, 600); };
  await useAt('stash');
  const stash = await G(() => window.G.ui.isOpen('stash'));
  await G(() => window.G.ui.closeAll()); await sleep(page, 300);
  await useAt('cook');
  const cook = await G(() => ({ open: window.G.ui.isOpen('cook'), station: window.G.ui.panels.cook.station }));
  await G(() => window.G.ui.closeAll()); await sleep(page, 300);
  const day0 = await G(() => window.G.day.day);
  await useAt('sleep'); await page.waitForFunction(() => !window.G.ui.iris.active, null, { timeout: 15000 }); await sleep(page, 1200);
  const slept = await G(() => ({ day: window.G.day.day, hour: +window.G.day.hour.toFixed(1), mode: window.G.mode, locked: window.G.player.controlLocked }));
  R.check('inside: F at the chest opens the stash, at the stove the kitchen Cook panel, at the bed a night\'s sleep (a new morning, still inside)', stash && cook.open && cook.station === 'kitchen' && slept.day === day0 + 1 && slept.hour < 7 && slept.mode === 'interior' && !slept.locked, JSON.stringify({ stash, cook, day0, slept }));
  await G(() => { window.G.ui.banners?.clear?.(); });
  // ---------------------------------------------------------------- b) decorating through the mouse
  await G(() => { const G = window.G, W = G.world, m = W.doorMatPos; G.player.setPos(m.x, m.z - 0.6); }); // (one step in from the mat)
  await tap(page, 'b', 70); await sleep(page, 900);
  const d0 = await D();
  const pal = await G(() => ({ open: window.G.ui.isOpen('decorate'), cards: [...document.querySelectorAll('.p-decor .card')].map(c => c.dataset.id) }));
  await snap('decorate');
  R.check('B indoors opens decorate mode: the palette lists the storage (with the starter furniture)', d0.active && pal.open && ['zabutonBlue', 'sideTable', 'flowerVase', 'packPhoto', 'pottedFern'].every(id => pal.cards.includes(id)), JSON.stringify({ d0: { active: d0.active, store: d0.store }, pal }));
  // a cushion on an open floor cell
  await tab('furniture'); await sleep(page, 200);
  await pick('zabutonBlue'); await sleep(page, 200);
  await click(9, 6);
  const d1 = await D();
  const cush = d1.items.find(i => i.id === 'zabutonBlue');
  R.check('pick the cushion in the palette, click the floor: it is placed and leaves storage', !!cush && cush.mount === 'floor' && !d1.store.zabutonBlue && !d1.sel, JSON.stringify({ cush, store: d1.store, sel: d1.sel }));
  // the door can't be blocked; a 1x1 side table rotated with R, then placed
  await tab('furniture'); await sleep(page, 150);
  await pick('sideTable'); await sleep(page, 200);
  await hover(7, 9);
  const blocked = await D();
  await tap(page, 'r', 60); await sleep(page, 150);
  await click(9, 4);
  const d2 = await D();
  const table = d2.items.find(i => i.id === 'sideTable');
  R.check("the door mat can't be covered (red ghost, \"Don't block the door!\"); R turns the piece; a click places it", blocked.ok === false && /door/i.test(blocked.prompt) && table && table.rot === 1, JSON.stringify({ blocked: { ok: blocked.ok, prompt: blocked.prompt, cand: blocked.cand }, table }));
  // a vase on the side table (tabletop), a photo on the north wall, a rug under the table
  await tab('tabletop'); await sleep(page, 150);
  await pick('flowerVase'); await sleep(page, 200);
  await click(9, 4, 0.55);
  const d3 = await D();
  const vase = d3.items.find(i => i.id === 'flowerVase');
  await tab('wall'); await sleep(page, 150);
  await pick('packPhoto'); await sleep(page, 200);
  await click(7, 0, 1.3, 'n');
  const d4 = await D();
  const photo = d4.items.find(i => i.id === 'packPhoto');
  await snap('placed');
  R.check('a tabletop vase snaps onto the side table, a photo onto the north wall', vase?.mount === 'table' && vase.on === table.k && photo?.mount === 'wall' && photo.side === 'n' && photo.y >= 1 && photo.y <= 1.6, JSON.stringify({ vase, photo }));
  // move the table: the vase rides along; then store it (the vase too); undo brings both back
  await click(9, 4, 0.15);
  const held = await D();
  await click(9, 7);
  const d5 = await D();
  const t2 = d5.items.find(i => i.id === 'sideTable'), v2 = d5.items.find(i => i.id === 'flowerVase');
  R.check('click a placed table to pick it up, click again to put it down: the vase on it moves along', held.hold === 'sideTable' && t2 && t2.z === 7 && v2 && v2.on === t2.k && v2.z === 7, JSON.stringify({ held: held.hold, t2, v2 }));
  await click(9, 7, 0.15);
  await G(() => document.querySelector('.p-decor .dc-store').click()); await sleep(page, 300);
  const d6 = await D();
  await page.keyboard.down('Control'); await tap(page, 'z', 60); await page.keyboard.up('Control'); await sleep(page, 300);
  const d7 = await D();
  R.check('Store puts the table and its vase back into storage; Ctrl+Z undoes it', !d6.items.some(i => i.id === 'sideTable') && d6.store.sideTable === 1 && d6.store.flowerVase === 1 && d7.items.some(i => i.id === 'sideTable') && d7.items.some(i => i.id === 'flowerVase') && !d7.store.sideTable, JSON.stringify({ d6: d6.store, d7: { store: d7.store, n: d7.items.length } }));
  // wallpaper and floor
  await tab('surface'); await sleep(page, 200);
  await pick('fl_checker'); await sleep(page, 200);
  await pick('wp_stripes'); await sleep(page, 300);
  const s1 = await G(() => ({ I: { wall: window.G.housing.rec.data.interior.wall, floor: window.G.housing.rec.data.interior.floor }, W: { wall: window.G.world.wallId, floor: window.G.world.floorId }, store: { ...window.G.state.furniture } }));
  await snap('surfaces');
  await page.keyboard.down('Control'); await tap(page, 'z', 60); await page.keyboard.up('Control'); await sleep(page, 300);
  const s2 = await G(() => ({ wall: window.G.world.wallId, store: window.G.state.furniture.wp_stripes || 0 }));
  await pick('wp_stripes'); await sleep(page, 300);
  R.check('wallpaper and floor apply from the palette (out of storage), and undo puts the old wallpaper back', s1.I.wall === 'wp_stripes' && s1.I.floor === 'fl_checker' && s1.W.wall === 'wp_stripes' && !s1.store.wp_stripes && !s1.store.fl_checker && s2.wall === 'wp_plaster' && s2.store === 1, JSON.stringify({ s1, s2 }));
  await tap(page, 'b', 70); await sleep(page, 500);
  const off = await G(() => ({ active: window.G.housing.decor.active, open: window.G.ui.isOpen('decorate'), locked: window.G.player.controlLocked }));
  R.check('B again leaves decorate mode', !off.active && !off.open && !off.locked, JSON.stringify(off));
  // ---------------------------------------------------------------- c) persistence
  const before = await G(() => JSON.stringify(window.G.housing.rec.data.interior));
  await exit();
  await G(() => window.G.save());
  await page.goto(`${BASE}/?notitle&nointro&hour=11`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true && window.G?.player, null, { timeout: 60000 }); await sleep(page, 800); await installProbes(page);
  await G(() => { const G = window.G; G.sim.tickT = -1e9; clearInterval(window.__freeze); window.__freeze = setInterval(() => { G.sim.tickT = -1e9; }, 200); }); // (no village growth in the leak numbers)
  await enter();
  const after = await G(() => ({ I: JSON.stringify(window.G.housing.rec.data.interior), drawn: window.G.world.items.length, wall: window.G.world.wallId }));
  R.check('the decorated interior and the storage survive a save and reload', after.I === before && after.wall === 'wp_stripes', JSON.stringify({ same: after.I === before, wall: after.wall }));
  await exit();
  // ---------------------------------------------------------------- d) the benched hero, home at night
  await G(() => { const G = window.G; G.state.flags.mokaJoined = true; const v = G.heroes.villagers.moka; v.waitingToJoin = false; v.frozen = false; G.day.hour = 23.2; v.visible = false; v.state = 'inside'; });
  await enter();
  const host = await G(() => { const G = window.G, v = G.heroes.villagers.moka; return { hosted: G.housing.hosts.includes(v), world: v.world === G.world, visible: v.visible, inter: G.world.interactables.includes(v.interact), pose: v.anim.action?.name }; });
  await snap('moka_home');
  await exit();
  const unhost = await G(() => { const G = window.G, v = G.heroes.villagers.moka; return { world: v.world === G.village.world, visible: v.visible, state: v.state, frozen: v.frozen, hosts: G.housing.hosts.length }; });
  R.check('at night Moka is home: she is inside the cottage (a guest you can talk to), and back in the village after', host.hosted && host.world && host.visible && host.inter && unhost.world && !unhost.visible && ['inside', 'hidden'].includes(unhost.state) && !unhost.frozen && !unhost.hosts, JSON.stringify({ host, unhost }));
  await G(() => { window.G.day.hour = 11; });
  // ---------------------------------------------------------------- e) round trips: nothing piles up
  const mem = () => G(() => { const G = window.G, r = G.engine.renderer; return { lst: window.QA.Events.listenerCount?.() ?? -1, geo: r.info.memory.geometries, tex: r.info.memory.textures, progs: r.info.programs?.length || 0, npcs: G.npcs.length, props: G.npcs.reduce((a, n) => a + Object.keys(n.props || {}).length + (n.line ? 2 : 0), 0), lines: G.npcs.filter(n => n.line).length, vInter: G.village.world.interactables.length, vSrc: (() => { const own = new Set(); for (const r of G.sim.list) for (const l of r.lights) own.add(l); let n = 0, f = []; for (const s of G.village.world.lightPool.sources) if (!own.has(s)) { n++; if (s.pos) f.push(`${s.pos.x.toFixed(1)},${s.pos.z.toFixed(1)}`); } window.__fs = f; return n; })(), vB: G.sim.list.length, vKids: G.village.world.scene.children.length - 2 * G.npcs.length - G.npcs.reduce((a, n) => a + (n.line?.parent === G.village.world.scene) + (n.bobber?.parent === G.village.world.scene), 0), /* (a villager's fishing line and bobber are in the scene only while the rod is out) */ iSrc: G.housing.world?.lightPool.sources.size ?? 0, iKids: G.housing.world?.scene.children.length ?? 0, iCols: G.housing.world ? [...G.housing.world.collision.map.values()].reduce((a, l) => a + l.length, 0) : 0 }; });
  const hist = [], ms = [];
  for (let i = 0; i < 10; i++) {
    await enter(); ms.push(await G(() => Math.round(window.G.housing.enterMs)));
    await exit(); hist.push(await mem());
  }
  const a = hist[2], b = hist[hist.length - 1];
  R.note(`cycles: ${hist.map(h => `geo ${h.geo} tex ${h.tex} vInter ${h.vInter} iKids ${h.iKids} iSrc ${h.iSrc} iCols ${h.iCols}`).join(' | ')}; enter ms ${ms.join(',')}`);
  // (the village carries on meanwhile: townsfolk move in with their own rigs, and villagers pick up a broom or a fishing
  //  rod for the first time — their props, line and bobber are made once and kept — so those are set aside, and so are
  //  the line and bobber a villager has out in the village scene at the moment of counting)
  const folk = b.npcs - a.npcs, geoN = b.geo - a.geo - folk * 4 - (b.props - a.props), texN = b.tex - a.tex - folk - (b.props > a.props ? 1 : 0), progN = b.progs - a.progs - (b.lines > a.lines && !a.lines ? 1 : 0);
  // (a leak grows every cycle; a texture made once mid-run — a villager's first emote or effect — steps up once and then
  //  holds: allow that one step when the last five cycles are flat)
  const flat = k => hist.slice(5).every(h => h[k] === hist[5][k]);
  R.check('10 enter / exit cycles: no growth in geometries, textures, programs, event listeners, village interactables or light sources, and the empty interior holds nothing', geoN <= 2 && texN <= (flat('tex') ? 1 : 0) && progN <= 1 && b.lst === a.lst && a.lst > 0 && b.vInter === a.vInter && b.vSrc === a.vSrc && Math.abs(b.vKids - a.vKids) <= 2 && b.iSrc === a.iSrc && b.iSrc <= 1 && b.iCols === 0 && b.iKids === a.iKids, JSON.stringify({ a, b, folk, geoN, texN, progN, foreign: await G(() => window.__fs?.slice(-4)) }));
  R.check(`entering is quick (median ${ms.sort((x, y) => x - y)[5]} ms of work inside the iris)`, ms.sort((x, y) => x - y)[5] < 300, ms.join(','));
  // walking out: S on the door mat takes you outside (after a moment's grace on the way in)
  await enter(); await sleep(page, 1300);
  await G(() => { const G = window.G, m = G.world.doorMatPos; G.player.setPos(m.x, m.z - 0.1); G.player.moveTarget = null; });
  await page.keyboard.down('s'); await sleep(page, 700); await page.keyboard.up('s');
  await page.waitForFunction(() => window.G.mode === 'village' && !window.G.ui.iris.active, null, { timeout: 8000 }).catch(() => {});
  const walked = await G(() => ({ mode: window.G.mode, d: +window.G.player.pos.distanceTo(window.G.heroes.homeDoor()).toFixed(2) }));
  R.check('S on the door mat walks you out of the door, onto the cottage doorstep', walked.mode === 'village' && walked.d < 2, JSON.stringify(walked));
  // ================================================================ phase 2: the villagers' homes (docs/HOUSING.md §1, §4)
  // ---------------------------------------------------------------- f) saved owners, and the old-save migration
  const CAST = ['mochi', 'usagi', 'kuma', 'kitsune', 'pan', 'tanu', 'kero'];
  const owners = () => G(cast => { const G = window.G, B = G.state.village.buildings; return { map: Object.fromEntries(cast.map(id => [id, B.filter(b => b.owner === id).map(b => b.id)])), lives: G.npcs.filter(n => cast.includes(n.id)).every(n => !n.homeRec || n.homeRec.data.owner === n.id), doors: G.sim.list.filter(r => r.data.owner).every(r => r.inter?.knockable && G.village.world.interactables.includes(r.inter)) }; }, CAST);
  const o1 = await owners();
  R.check('every named villager owns one home (saved b.owner), lives there, and its door has the one visit / knock prompt', CAST.every(id => o1.map[id].length === 1) && o1.lives && o1.doors, JSON.stringify(o1));
  await G(() => { for (const b of window.G.state.village.buildings) delete b.owner; window.G.save(); }); // (a save from before phase 2)
  await page.goto(`${BASE}/?notitle&nointro&hour=11`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true && window.G?.player, null, { timeout: 60000 }); await sleep(page, 800); await installProbes(page);
  await G(() => { const G = window.G; G.sim.tickT = -1e9; clearInterval(window.__freeze); window.__freeze = setInterval(() => { G.sim.tickT = -1e9; }, 200); });
  const o2 = await owners();
  R.check('an old save without owners gets the same owners on its first load (deterministic)', JSON.stringify(o2.map) === JSON.stringify(o1.map) && o2.doors, JSON.stringify({ o1: o1.map, o2: o2.map }));
  // ---------------------------------------------------------------- g) the door: a stranger, a friend's visit, a knock at night
  const atDoor = id => G(id => { const G = window.G, rec = G.sim.list.find(r => r.data.owner === id), D = G.villageLife.doorInfo(rec); G.player.setPos(D.step.x, D.step.z); G.player.moveTarget = null; G.interactCooldown = 0; return rec.inter.label; }, id);
  const kp0 = await G(() => { const v = window.G.npcs.find(n => n.id === 'kuma'); return { x: v.pos.x, z: v.pos.z }; });
  const l0 = await atDoor('kuma'); await sleep(page, 200);
  await tap(page, 'f', 70); await sleep(page, 900);
  const m0 = await G(() => window.G.mode);
  await G(() => window.G.story.addHearts('kuma', 10));
  const l1 = await atDoor('kuma'); await sleep(page, 200);
  await tap(page, 'f', 70); await waitMode(page, 'interior'); await sleep(page, 600);
  const vin = await G(() => { const G = window.G, H = G.housing, v = G.npcs.find(n => n.id === 'kuma'); return { name: H.home.name, hosted: H.hosts.includes(v), world: v.world === G.world, frozen: v.frozen, talk: G.world.interactables.includes(v.interact), can: H.canDecorate(), items: G.world.items.length, own: G.world.items.every(i => i.own), layout: G.world.layout.id, rating: H.ratingNow().stars }; });
  await snap('kuma_home');
  await tap(page, 'b', 70); await sleep(page, 400);
  const noDecor = await G(() => !window.G.housing.decor.active);
  await exit(); await sleep(page, 400);
  const vout = await G(p0 => { const G = window.G, v = G.npcs.find(n => n.id === 'kuma'); return { world: v.world === G.village.world, visible: v.visible, frozen: v.frozen, near: Math.hypot(v.pos.x - p0.x, v.pos.z - p0.z) < 3, hosts: G.housing.hosts.length }; }, kp0);
  R.check('a stranger can\'t go in ("Kuma\'s home"); with a heart the door says "Visit Kuma ★★★☆☆": inside, Kuma hosts you in his own furnished home', /^Kuma's home$/.test(l0) && m0 === 'village' && /^Visit Kuma/.test(l1) && /★/.test(l1) && vin.name === "Kuma's Home" && vin.hosted && vin.world && vin.frozen && vin.talk && vin.items >= 8 && vin.own, JSON.stringify({ l0, m0, l1, vin }));
  R.check('…but no decorating there without an invitation or a request; on the way out Kuma goes back to the village as he was', !vin.can && noDecor && vout.world && vout.visible && !vout.frozen && vout.near && !vout.hosts, JSON.stringify({ can: vin.can, noDecor, vout }));
  // night: Kuma is tucked in; the same door knocks (no second prompt), and he comes to the door
  const night = await G(() => { const G = window.G, v = G.npcs.find(n => n.id === 'kuma'); G.day.hour = 23.6; v.warm = false; v.update(0.016); if (v.visible) v.tuckIn?.(true); const rec = G.sim.list.find(r => r.data.owner === 'kuma'); const near = G.village.world.interactables.filter(i => Math.hypot(i.pos.x - rec.door.x, i.pos.z - rec.door.z) < 1.6).length; return { hidden: !v.visible, label: rec.inter.label, near }; });
  await atDoor('kuma'); await sleep(page, 200);
  await tap(page, 'f', 70); await sleep(page, 600);
  const knocked = await G(() => { const v = window.G.npcs.find(n => n.id === 'kuma'); return { knocked: !!v.knocked || !!v.door || v.visible, mode: window.G.mode }; });
  await page.waitForFunction(() => window.G.ui?.dlg?.active, null, { timeout: 8000 }).catch(() => {});
  await drainDialogue(page); await sleep(page, 300);
  R.check('at night the one door prompt says "Knock on Kuma\'s door" and knocking wakes him (no separate knock prompt)', night.hidden && /Knock on Kuma's door/.test(night.label) && night.near === 1 && knocked.knocked && knocked.mode === 'village', JSON.stringify({ night, knocked }));
  await G(() => { const G = window.G; G.day.hour = 11; for (const v of G.npcs) if (!v.folk) { v.knocked = false; v.warm = false; } });
  await sleep(page, 2500);
  // ---------------------------------------------------------------- h) a decorate request: rating, hearts, happiness
  const r0 = await G(() => { const G = window.G, S = G.story, npc = G.npcs.find(n => n.id === 'kuma'); const ts = S.decorateRequests(npc), t = ts[0];
    const qid = 'req_kuma'; S.Q.requests[qid] = { def: { title: "Kuma's Request", giver: 'kuma', desc: t.text, steps: t.steps, reward: { coins: 50, xp: 40, hearts: 12, ...(t.reward || {}) }, request: true, next: null } }; S.start(qid);
    const b = G.sim.list.find(r => r.data.owner === 'kuma').data; G.sim.simulate(true);
    for (const id of ['ragRug', 'irori', 'andonLamp', 'zabutonPink', 'pumpkinLamp', 'teaSet']) G.actions.addFurniture(id, 1, { src: 'test' });
    return { n: ts.length, need: t.steps[0].need, gift: t.reward?.furniture, hearts: S.friend('kuma').pts, happy: b.happy, type: b.type, stars: b.homeStars ?? null, target: S.target()?.label || null }; });
  await atDoor('kuma'); await sleep(page, 200);
  await tap(page, 'f', 70); await waitMode(page, 'interior'); await sleep(page, 500);
  await tap(page, 'b', 70); await sleep(page, 700);
  const dec = await G(async () => { const G = window.G, D = G.housing.decor, W = G.world, P = await import('/src/home/placement.js');
    const [px, pz] = W.cellAt(G.player.pos.x, G.player.pos.z), guests = G.housing.hosts.map(v => { const [x, z] = W.cellAt(v.pos.x, v.pos.z); return { x, z }; });
    const spot = (id, mount) => { for (let z = 2; z < W.S.D - 2; z++) for (let x = 0; x < W.S.W; x++) { const c = { k: 999, id, mount, x, z, rot: 0 }; if (P.canPlace(W.layout, W.items, c, { player: { x: px, z: pz }, guests }).ok) return c; } return null; };
    const out = {};
    for (const [id, mount] of [['ragRug', 'rug'], ['irori', 'floor'], ['andonLamp', 'floor'], ['pumpkinLamp', 'floor']]) { const c = spot(id, mount); if (c) { D.select(id); D.place({ id, mount, x: c.x, z: c.z, rot: 0 }); out[id] = [c.x, c.z]; } }
    // a villager's own piece can be moved but not taken
    const own = W.items.find(i => i.own && i.mount === 'floor' && !W.items.some(o => o.on === i.k));
    const before = { n: W.items.length, store: { ...G.state.furniture } };
    D.pickUp(own); D.storeHeld(); const stillThere = W.items.includes(own); D.cancel(true);
    return { out, own: own.id, stillThere, nAfter: W.items.length, nBefore: before.n, rating: G.housing.ratingNow().stars, chip: document.querySelector('.p-decor .dc-stars')?.textContent || '' }; });
  await snap('kuma_decorate');
  await tap(page, 'b', 70); await sleep(page, 400);
  await G(() => window.G.housing.exit());
  await page.waitForFunction(() => window.G.ui?.dlg?.active, null, { timeout: 8000 }).catch(() => {});
  await snap('kuma_react');
  const said = await G(() => (window.G.ui?.dlg?.lines || []).map(l => l.text || l).join(' | '));
  await drainDialogue(page);
  await waitMode(page, 'village'); await sleep(page, 2600);
  const r1 = await G(() => { const G = window.G, S = G.story, b = G.sim.list.find(r => r.data.owner === 'kuma').data; G.sim.simulate(true); return { active: S.Q.active.some(q => q.id === 'req_kuma'), hearts: S.friend('kuma').pts, best: S.friend('kuma').homeBest, stars: b.homeStars, happy: b.happy, store: { ...G.state.furniture } }; });
  R.check('a decorate request ("2 warm things and a rug") opens Kuma\'s home to decorating; his own pieces can be moved but not taken; the palette shows the Home Rating', r0.n >= 2 && r0.need?.rug && Object.keys(dec.out).length === 4 && dec.stillThere && dec.nAfter === dec.nBefore && /★/.test(dec.chip), JSON.stringify({ r0, dec }));
  R.check('leaving, Kuma loves it: the request completes (hearts, a piece for your storage), a new star gives hearts, and the rating raises the home\'s happiness', !r1.active && r1.hearts >= r0.hearts + 12 && r1.stars > (r0.stars ?? 3) && r1.best === r1.stars && (r0.type !== 'home' || r1.happy > r0.happy + 0.04) && (!r0.gift || (r1.store[r0.gift] || 0) >= 1), JSON.stringify({ said: said.slice(0, 160), r0: { hearts: r0.hearts, stars: r0.stars, happy: r0.happy, type: r0.type }, r1 }));
  // ---------------------------------------------------------------- i) the invitation at three hearts
  await G(() => { const G = window.G, S = G.story, v = G.npcs.find(n => n.id === 'usagi'); S.addHearts('usagi', 30 - S.friend('usagi').pts); S.friend('usagi').talkedDay = G.day.day; G.talkTo(v); });
  await page.waitForFunction(() => window.G.ui?.dlg?.active, null, { timeout: 5000 }).catch(() => {});
  const invFirst = await G(() => (window.G.ui?.dlg?.lines || []).map(l => l.text || l).join(' | '));
  await drainDialogue(page); await sleep(page, 400);
  const inv = await G(f => ({ invited: !!window.G.story.friend('usagi').invited, toast: (window.QA?.toasts || []).find(t => /invited/.test(t)) || null, first: f.slice(0, 100), locked: window.G.player.controlLocked }), invFirst);
  await sleep(page, 600);
  await atDoor('usagi'); await sleep(page, 200);
  await tap(page, 'f', 70); await waitMode(page, 'interior'); await sleep(page, 500);
  const ui = await G(() => { const H = window.G.housing; return { can: H.canDecorate(), name: H.home.name, wall: H.rec.data.interior.wall, ownWall: H.rec.data.interior.ownWall }; });
  await tap(page, 'b', 70); await sleep(page, 500);
  const ud = await G(() => ({ active: window.G.housing.decor.active, has: window.G.state.furniture.wp_stripes || 0 }));
  await G(() => { window.G.actions.addFurniture('wp_dots', 1, { src: 'test' }); window.G.housing.decor.applySurface('wp_dots'); }); await sleep(page, 300);
  const us = await G(() => ({ store: { ...window.G.state.furniture }, wall: window.G.world.wallId }));
  await snap('usagi_home');
  await tap(page, 'b', 70); await sleep(page, 300);
  await G(() => window.G.housing.exit({ instant: true })); await sleep(page, 500);
  R.check('at three hearts a villager invites you ("Make yourself at home!") and you can redecorate their home any time; their own wallpaper is not yours to take', inv.invited && inv.toast && !inv.locked && ui.can && ud.active && ui.ownWall === ui.wall && us.wall === 'wp_dots' && !us.store[ui.ownWall], JSON.stringify({ inv, ui, ud, us }));
  // ================================================================ phase 3: upgrades and exteriors (docs/HOUSING.md §5-6)
  await G(() => { const G = window.G; G.state.coins = 99999; for (const k of ['wood', 'stone', 'petal', 'silk', 'lantern', 'crystal']) G.state.materials[k] = 300; G.housing.testRank = 3; G.day.hour = 11; });
  // ---------------------------------------------------------------- j) the mailbox and the house card
  const mb = await G(() => { const G = window.G, rec = G.sim.list.find(r => r.data.owner === 'usagi'), m = G.housing.ext.mail.get(rec.data); G.player.setPos(m.x + 0.35, m.z + 0.35); G.player.moveTarget = null; G.interactCooldown = 0;
    return { n: G.housing.ext.mail.size, homes: G.sim.list.filter(r => r.data.type === 'home' && r.data.plot).length, inter: G.village.world.interactables.filter(i => i.mailbox && G.state.village.buildings.includes(i.building)).length, level: rec.data.level }; });
  await sleep(page, 300); await tap(page, 'f', 70); await sleep(page, 700);
  const card = await G(() => ({ open: window.G.ui.isOpen('houseCard'), name: document.querySelector('.p-house .hc-name')?.textContent, up: !document.querySelector('.p-house .hc-upb')?.disabled, cost: document.querySelectorAll('.p-house .rm-c').length, enter: getComputedStyle(document.querySelector('.p-house .hc-in')).display !== 'none', pic: (document.querySelector('.p-house .hc-pic img')?.src || '').length > 1000 }));
  await snap('house_card');
  R.check('every home has a mailbox (F) that opens its house card: its picture, name, the upgrade cost, Upgrade / Remodel / Enter', mb.n >= mb.homes && mb.inter === mb.n && card.open && card.name === "Usagi's Home" && card.up && card.cost >= 2 && card.enter && card.pic, JSON.stringify({ mb, card }));
  // ---------------------------------------------------------------- k) upgrading a home
  const u0 = await G(async () => { const G = window.G, rec = G.sim.list.find(r => r.data.owner === 'usagi'), b = rec.data; G.housing.interiorOf(b); const I0 = JSON.parse(JSON.stringify(b.interior)); window.__I0 = I0;
    return { level: b.level, seed: b.seed, coins: G.state.coins, wood: G.state.materials.wood, n: I0.items.length, layout: I0.layout, key: rec.model.tplKey }; });
  await G(() => document.querySelector('.p-house .hc-upb').click());
  await sleep(page, 700);
  const mid = await G(() => ({ scaffold: !!window.G.village.world.scene.getObjectByName('scaffold'), busy: window.G.housing.ext.busy }));
  await snap('upgrade_scaffold');
  await page.waitForFunction(() => !window.G.housing.ext.busy, null, { timeout: 10000 }).catch(() => {});
  await sleep(page, 900);
  await snap('upgrade_done');
  const u1 = await G(() => { const G = window.G, rec = G.sim.list.find(r => r.data.owner === 'usagi'), b = rec.data; return { level: b.level, seed: b.seed, coins: G.state.coins, wood: G.state.materials.wood, key: rec.model.tplKey, scaffold: !!G.village.world.scene.getObjectByName('scaffold') }; });
  await G(() => { const G = window.G, rec = G.sim.list.find(r => r.data.owner === 'usagi'); G.housing.enter(rec); });
  await waitMode(page, 'interior'); await sleep(page, 700);
  const uin = await G(() => { const G = window.G, I = G.housing.rec.data.interior, I0 = window.__I0; return { layout: I.layout, n: I.items.length, kept: I0.items.every(a => I.items.some(b => b.id === a.id && b.k === a.k)), W: G.world.layout.id }; });
  await snap('upgrade_inside');
  await G(() => window.G.housing.exit({ instant: true })); await waitMode(page, 'village'); await sleep(page, 400);
  R.check(`Upgrade spends the level cost, a scaffold goes up (${mid.scaffold}), and the house grows to the next level keeping its seed (its look)`, u1.level === u0.level + 1 && u1.seed === u0.seed && u1.coins < u0.coins && u1.wood < u0.wood && mid.busy && !u1.scaffold && u1.key.split(':')[2] === u0.key.split(':')[2], JSON.stringify({ u0, mid, u1 }));
  R.check('inside, the room is the bigger one and every piece came along', uin.layout === (u0.layout === 'home1' ? 'home2' : 'home3') && uin.W === uin.layout && uin.kept && uin.n === u0.n, JSON.stringify(uin));
  // ---------------------------------------------------------------- l) remodelling
  const geo0 = await G(() => window.G.engine.renderer.info.memory.geometries);
  await G(() => { const G = window.G, rec = G.sim.list.find(r => r.data.owner === 'usagi'); G.ui.open('remodel', { rec }); });
  await sleep(page, 800);
  const pv0 = await G(() => document.querySelector('.p-remodel .rm-pv img')?.src || '');
  await G(() => document.querySelector('.p-remodel .rm-set[data-id="seaside"]').click()); await sleep(page, 700);
  const pv1 = await G(() => ({ src: document.querySelector('.p-remodel .rm-pv img')?.src || '', badge: document.querySelector('.p-remodel .rm-badge')?.textContent, cost: document.querySelectorAll('.p-remodel .rm-cost .rm-c').length, can: !document.querySelector('.p-remodel .rm-apply').disabled }));
  await G(() => document.querySelector('.p-remodel .rm-o[data-k="roof"][data-v="sakura"]').click()); await sleep(page, 500);
  await snap('remodel_panel');
  const pv2 = await G(() => ({ badge: document.querySelector('.p-remodel .rm-badge')?.textContent, on: document.querySelector('.p-remodel .rm-o[data-k="roof"][data-v="sakura"]')?.classList.contains('on') }));
  await G(() => document.querySelector('.p-remodel .rm-o[data-k="roof"][data-v="sea"]').click()); await sleep(page, 400);
  const c0 = await G(() => window.G.state.coins);
  await G(() => document.querySelector('.p-remodel .rm-apply').click()); await sleep(page, 1500);
  const rm = await G(() => { const G = window.G, rec = G.sim.list.find(r => r.data.owner === 'usagi'), b = rec.data, plot = b.plot; return { style: b.style, key: rec.model.tplKey, closed: !G.ui.isOpen('remodel'), coins: G.state.coins, fence: !!G.village.world.scene.getObjectByName('yardFence:' + plot), door: G.village.world.interactables.includes(rec.inter), mail: G.housing.ext.mail.has(b) }; });
  await G(() => { const G = window.G, rec = G.sim.list.find(r => r.data.owner === 'usagi'); G.player.setPos(rec.door.x + 2.2, rec.door.z + 2.2); });
  await sleep(page, 900); await snap('remodel_village');
  R.check('the Remodel panel previews a style set live ("Seaside"), a changed part makes it "Your own mix", the cost shows', pv0.length > 1000 && pv1.src !== pv0 && pv1.badge === 'Seaside' && pv1.cost >= 1 && pv1.can && pv2.badge === 'Your own mix' && pv2.on, JSON.stringify({ pv1: { badge: pv1.badge, cost: pv1.cost, can: pv1.can }, pv2 }));
  R.check('Remodel pays, rebuilds the house in its style (a styled template), its fence follows, its door and mailbox stay', rm.style?.set === 'seaside' && /\|/.test(rm.key) && rm.key.includes('fence=rope') && rm.closed && rm.coins < c0 && rm.fence && rm.door && rm.mail, JSON.stringify(rm));
  await G(() => window.G.save());
  await page.goto(`${BASE}/?notitle&nointro&hour=11`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true && window.G?.player, null, { timeout: 60000 }); await sleep(page, 1200); await installProbes(page);
  await G(() => { const G = window.G; G.sim.tickT = -1e9; clearInterval(window.__freeze); window.__freeze = setInterval(() => { G.sim.tickT = -1e9; }, 200); G.state.coins = 99999; for (const k of ['wood', 'stone', 'petal', 'silk', 'lantern', 'crystal']) G.state.materials[k] = 300; G.housing.testRank = 3; });
  const rl = await G(() => { const G = window.G, rec = G.sim.list.find(r => r.data.owner === 'usagi'); return { set: rec.data.style?.set, key: rec.model.tplKey, level: rec.data.level, fence: !!G.village.world.scene.getObjectByName('yardFence:' + rec.data.plot) }; });
  R.check('the new look and the new level survive a save and reload (the fence too)', rl.set === 'seaside' && rl.key === rm.key && rl.level === u1.level && rl.fence, JSON.stringify(rl));
  // ---------------------------------------------------------------- m) Chewy's cottage grows
  const cg = [];
  for (const lv of [2, 3]) {
    await G(() => { const G = window.G; G.housing.upgrade(G.housing.cottage()); });
    await page.waitForFunction(() => !window.G.housing.ext.busy, null, { timeout: 10000 }).catch(() => {});
    await sleep(page, 900);
    await snap('cottage_L' + lv);
    await G(() => window.G.openHome()); await waitMode(page, 'interior'); await sleep(page, 700);
    cg.push(await G(() => { const G = window.G, c = G.housing.rec.data; return { level: c.level, layout: G.world.layout.id, n: G.world.items.length, jobs: G.world.interactables.filter(i => i.use).map(i => i.use).sort().join(), seed: c.seed }; }));
    await snap('cottage_in_L' + lv);
    await G(() => window.G.housing.exit({ instant: true })); await waitMode(page, 'village'); await sleep(page, 400);
  }
  R.check("Chewy's cottage grows to L2 and L3 on its plot (same seed); inside, the bigger cottage keeps every piece and the bed, chest, stove and workbench still work", cg[0].level === 2 && cg[1].level === 3 && cg[0].layout === 'cottage2' && cg[1].layout === 'cottage3' && cg[1].n >= cg[0].n && cg[0].n >= 17 && cg.every(c => c.jobs === 'cook,craft,sleep,stash') && cg[0].seed === cg[1].seed, JSON.stringify(cg));
  // ---------------------------------------------------------------- n) the cache cap; no growth over remodel cycles
  const cap = await G(async () => {
    const Bi = window.G.housing.templates, St = await import('/src/world/buildings/styles.js'), roofs = Object.keys(St.ROOF_COLORS), walls = Object.keys(St.WALLS);
    for (let i = 0; i < 40; i++) Bi.getTemplate('home', 1, i % 8, { roof: roofs[i % roofs.length], wall: walls[(i * 3) % walls.length] });
    return { ...Bi.templateStats(), cap: Bi.STYLED_CAP };
  });
  const cyc = [];
  for (let i = 0; i < 6; i++) {
    await G(i => { const G = window.G, rec = G.sim.list.find(r => r.data.owner === 'usagi'); G.housing.remodel(rec, i % 2 ? { roof: 'plum' } : { roof: 'moss', wall: 'mint' }); }, i);
    await sleep(page, 300);
    cyc.push(await G(() => window.G.engine.renderer.info.memory.geometries));
  }
  R.check(`the styled-template cache stays under its cap (${cap.styled} of ${cap.cap}); remodelling back and forth grows no geometry (${cyc.join(',')})`, cap.styled <= cap.cap + 4 && cyc[5] <= cyc[1] + 2 && cyc[4] <= cyc[2] + 2, JSON.stringify({ cap: { styled: cap.styled, cap: cap.cap, all: cap.all }, cyc, geo0 }));
  // ================================================================ phase 4: the guides (docs/HOUSING.md §7)
  const tut = () => G(() => { const t = window.G.tutorials; return { active: t.active, step: t.cur?.step?.id || null, paused: t.paused, say: document.querySelector('.ts-tx')?.textContent || '', obj: document.querySelector('.to-tx')?.textContent || '', n: document.querySelector('.to-n')?.textContent || '', dock: document.querySelector('.tut')?.classList.contains('on') }; });
  const stepIs = (id, step, timeout = 15000) => page.waitForFunction(([id, step]) => window.G.tutorials.active === id && window.G.tutorials.cur?.step?.id === step && window.G.tutorials.cur.entered && !window.G.tutorials.paused, [id, step], { timeout });
  const ringOn = sel => G(sel => { const r = document.querySelector('.tut-spot').getBoundingClientRect(), e = document.querySelector(sel); if (!e || !document.querySelector('.tut').classList.contains('spot')) return false; const b = e.getBoundingClientRect(); return Math.abs((r.left + r.width / 2) - (b.left + b.width / 2)) < 8 && Math.abs((r.top + r.height / 2) - (b.top + b.height / 2)) < 8; }, sel);
  const clickSel = sel => G(sel => { const e = document.querySelector(sel); e?.click(); return !!e; }, sel);
  await boot(page, 'fresh&nointro&tut&hour=11');
  await G(() => { const G = window.G; G.sim.tickT = -1e9; clearInterval(window.__freeze); window.__freeze = setInterval(() => { G.sim.tickT = -1e9; }, 200); G.state.flags.hints = { garden: 1, build: 1, travel: 1, skills: 1, stats: 1, loot: 1, potion: 1 }; G.state.flags.tutorials = { house: { done: true, step: 'wrap' } }; });
  await sleep(page, 2500);
  const g0 = await G(() => ({ en: window.G.tutorials.enabled, active: window.G.tutorials.active }));
  // ---------------------------------------------------------------- o) Make it home
  await enter();
  await stepIs('makeHome', 'jobs', 15000); await sleep(page, 800);
  const m1 = await tut();
  await snap('guide_home_jobs');
  await stepIs('makeHome', 'decorate', 12000); await sleep(page, 700);
  const m2 = { ...(await tut()), ring: await ringOn('.home-tools .deco-btn') };
  await snap('guide_home_b');
  await tap(page, 'b', 70);
  await stepIs('makeHome', 'place', 8000); await sleep(page, 900);
  const m3 = { ...(await tut()), ring: await ringOn('.p-decor .card[data-id="zabutonBlue"]') };
  await snap('guide_home_cushion');
  await pick('zabutonBlue'); await sleep(page, 250); await click(9, 6);
  await stepIs('makeHome', 'move', 8000); await sleep(page, 500);
  const m4 = await tut();
  await click(9, 6, 0.06); await sleep(page, 200); await tap(page, 'r', 60); await sleep(page, 200); await click(10, 6);
  await stepIs('makeHome', 'wallpaper', 8000); await sleep(page, 600);
  const m5a = await ringOn('.p-decor .tab[data-t="surface"]');
  await tab('surface'); await sleep(page, 500);
  const m5b = await ringOn('.p-decor .card[data-id="wp_stripes"]');
  await snap('guide_home_wallpaper');
  await pick('wp_stripes'); await sleep(page, 400);
  await stepIs('makeHome', 'rating', 8000); await sleep(page, 700);
  const m6 = { ...(await tut()), ring: await ringOn('.p-decor .dc-rate') };
  await snap('guide_home_rating');
  await clickSel('.to-ok'); await stepIs('makeHome', 'wrap', 6000); await sleep(page, 600);
  const m7 = await tut();
  await snap('guide_home_wrap');
  await clickSel('.to-ok'); await sleep(page, 900);
  const m8 = await G(() => ({ rec: window.G.state.flags.tutorials.makeHome, active: window.G.tutorials.active, items: window.G.world.items.filter(i => i.id === 'zabutonBlue').length, wall: window.G.world.wallId }));
  R.check('"Make it home" starts in the cottage after the house tour (Shadow): the household jobs, then B with the Decorate button spotlit', g0.en && m1.active === 'makeHome' && m1.dock && /bed|chest|stove/i.test(m1.say) && m2.ring && /B/.test(m2.say), JSON.stringify({ g0, m1, m2 }));
  R.check('…the cushion\'s card spotlit, placed, picked up, turned and moved; the wallpaper tab and card spotlit; the Home Rating chip; the wrap-up (Tanu, the workbench, villagers); done', m3.ring && /cushion/i.test(m3.say) && /R/.test(m4.say) && m5a && m5b && m6.ring && /Rating/.test(m6.say) && /Tanu/.test(m7.say) && /workbench/.test(m7.say) && m8.rec?.done && !m8.rec.skipped && !m8.active && m8.items >= 1 && m8.wall === 'wp_stripes', JSON.stringify({ m3, m4, m5a, m5b, m6, m7, m8 }));
  await tap(page, 'b', 70); await sleep(page, 400);
  await G(() => window.G.housing.exit({ instant: true })); await waitMode(page, 'village'); await sleep(page, 1200);
  // ---------------------------------------------------------------- p) Remodel
  await G(() => { const G = window.G; G.state.coins = 99999; for (const k of ['wood', 'stone', 'petal', 'silk', 'lantern']) G.state.materials[k] = 300; G.housing.testRank = 3; const rec = G.sim.list.find(r => r.data.owner === 'mochi'), m = G.housing.ext.mail.get(rec.data); G.player.setPos(m.x + 0.35, m.z + 0.35); G.player.moveTarget = null; G.interactCooldown = 0; });
  await sleep(page, 400); await tap(page, 'f', 70);
  await stepIs('remodel', 'card', 10000); await sleep(page, 700);
  const rg1 = { ...(await tut()), ring: await G(() => document.querySelector('.tut').classList.contains('spot')), card: await G(() => window.G.ui.isOpen('houseCard')) };
  await snap('guide_remodel_card');
  await clickSel('.p-house .hc-rem');
  await stepIs('remodel', 'sets', 8000); await sleep(page, 800);
  const rg2 = { ...(await tut()), ring: await ringOn('.p-remodel .rm-sets') };
  await snap('guide_remodel_sets');
  await clickSel('.p-remodel .rm-set[data-id="cottage"]');
  await stepIs('remodel', 'swatch', 8000); await sleep(page, 600);
  const rg3 = { ...(await tut()), ring: await ringOn('.p-remodel .rm-fields') };
  await clickSel('.p-remodel .rm-o[data-k="roof"][data-v="sakura"]');
  await stepIs('remodel', 'cost', 8000); await sleep(page, 600);
  const rg4 = { ...(await tut()), ring: await ringOn('.p-remodel .rm-foot') };
  await snap('guide_remodel_cost');
  await clickSel('.p-remodel .rm-apply'); await sleep(page, 1500);
  const rg5 = await G(() => ({ rec: window.G.state.flags.tutorials.remodel, active: window.G.tutorials.active, style: window.G.sim.list.find(r => r.data.owner === 'mochi').data.style }));
  R.check('"Remodel" starts when a mailbox is first opened (Tanu, over the house card): Upgrade / Remodel / Enter, then the set cards, a swatch and the cost spotlit; Remodel applies it and ends the guide', rg1.active === 'remodel' && rg1.card && /Upgrade/.test(rg1.say) && /Enter/.test(rg1.say) && rg2.ring && rg3.ring && rg4.ring && /costs/.test(rg4.say) && rg5.rec?.done && !rg5.active && rg5.style?.roof === 'sakura', JSON.stringify({ rg1, rg2, rg3, rg4, rg5 }));
  // the Guides tab lists both; an old save that had been inside the cottage (no record of the guide) is offered it once
  await G(() => window.G.ui.closeAll()); await sleep(page, 300);
  await page.keyboard.press('KeyJ'); await sleep(page, 500);
  await clickSel('.p-quests .q-tabs .tab[data-t="guides"]'); await sleep(page, 500);
  const gl = await G(() => [...document.querySelectorAll('.gd-card')].map(c => c.className.replace('gd-card ', '') + ':' + c.querySelector('b').textContent));
  await snap('guide_list');
  await G(() => { const G = window.G; G.ui.closeAll(); delete G.state.flags.tutorials.makeHome; G.save(); });
  await page.goto(`${BASE}/?notitle&tut&hour=11`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true && window.G?.player, null, { timeout: 60000 }); await installProbes(page);
  await G(() => { window.G.state.flags.hints = { garden: 1, build: 1, travel: 1, skills: 1, stats: 1, loot: 1, potion: 1 }; });
  await page.waitForFunction(() => document.querySelector('.tut-offer')?.classList.contains('on'), null, { timeout: 20000 }).catch(() => {});
  const of = await G(() => ({ on: document.querySelector('.tut-offer')?.classList.contains('on'), t: document.querySelector('.tf-t b')?.textContent }));
  await snap('guide_offer');
  await clickSel('.tf-no'); await sleep(page, 300);
  R.check('the Guides tab lists Make it home and Remodel (done); an old save that had been inside the cottage is offered "Make it home" once', gl.some(x => /^done/.test(x) && /Make it home/.test(x)) && gl.some(x => /^done/.test(x) && /Remodel/.test(x)) && of.on && of.t === 'Make it home', JSON.stringify({ gl, of }));
} catch (e) { errors.push('[harness] ' + e.stack); }
const failed = R.finish(errors, warns);
await browser.close();
process.exit(failed ? 1 : 0);
