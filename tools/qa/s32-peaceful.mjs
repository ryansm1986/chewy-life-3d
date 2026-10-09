// s32: the peaceful overworld, the wild areas and the Sightings board (docs/COZY.md §6, §10; ROADMAP CZ-3, CZ-4).
//   a) a saved zone is peaceful: no monster outside a wild area, the trail calm, the glades, the markers (the gateway's
//      posts, the edge tint), the one-time "gone quiet" toast; a besieged zone still fields its trail camps (and its wild
//      areas); a saved zone is cheaper (fewer monsters, no more draw calls on the trail)
//   b) the wild: the entry toast and 'wild:enter'; the packs a step above the strongest hero (within the band); the
//      leash (they chase to r + 6 m, then walk home); Poe's joining scene still starts in the calm grove
//   c) the minimap's violet rings and the sighting pins; the big map's legend; the Travel Map's rows and the red dot
//   d) the Sightings board: Blossom Hollow's board opens by F; three sightings; one spawns in its wild area, named and
//      pinned; beating it pays the bounty (loot, renown, 'sighting:cleared') and stamps the card; a new world day brings
//      three new ones; renown survives a reload; a saved zone village's notice board opens it too
//   e) the pad (A on the board's button opens the Travel Map) and the phone (fits, 44 px targets, the 12 px floor)
//   f) the debug actions (the Cozy tab): show wild areas, spawn a sighting, refresh, peaceful on a zone
//   Shots → tools/qa/tmp/s32-peaceful/. usage: node tools/qa/s32-peaceful.mjs [ONLY=abc]
import fs from 'node:fs';
import { launch, boot, sleep, waitMode, makeReport } from './lib.mjs';
import { installPad, padTap } from './pad-lib.mjs';
import { launchTouch } from './touch-lib.mjs';

const OUT = new URL('./tmp/s32-peaceful/', import.meta.url); fs.mkdirSync(OUT, { recursive: true });
const shot = (page, n) => page.screenshot({ path: new URL(n + '.png', OUT).pathname.replace(/^\/([A-Z]:)/, '$1') });
const R = makeReport('s32-peaceful');
const errs = [], warns = [];
const want = k => !process.env.ONLY || process.env.ONLY.includes(k);
const ev = (page, fn, arg) => page.evaluate(fn, arg);
const quiet = page => ev(page, () => { const G = window.G; for (const f of ['poeJoined', 'shihtzuJoined', 'goldenJoined']) G.state.flags[f] = true; G.heroes?.poeJoin?.reset?.(); G.heroes?.stzJoin?.reset?.(); G.heroes?.gldJoin?.reset?.(); });
const toRegion = async (page, id) => { await ev(page, z => window.G.enterRegion(z), id); await waitMode(page, 'dungeon'); await sleep(page, 900); };
const frame = page => ev(page, async () => { const R2 = window.G.engine.renderer; R2.info.autoReset = false; R2.info.reset(); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); const c = R2.info.render.calls; R2.info.autoReset = true; return c; });

if (want('a') || want('b') || want('c')) {
  const { browser, page, errors, warns: w } = await launch({ w: 1280, h: 720 });
  await boot(page, 'fresh&nointro&notut&villagesaved=bamboo');
  await ev(page, () => { const G = window.G; G.state.player.lvl = 8; G.actions.recompute?.(true); window.__ev = []; for (const n of ['wild:enter', 'wild:cleared', 'sighting:cleared']) G.events.on(n, p => window.__ev.push([n, p])); });
  // ---- a) peaceful
  await toRegion(page, 'bamboo');
  const a1 = await ev(page, () => {
    const G = window.G, D = G.dungeon, L = D.layout, out = D.monsters.filter(m => m.alive && !L.wild.some(a => Math.hypot(m.pos.x - a.x, m.pos.z - a.z) < a.r + 1.5));
    const posts = L.wild.map(a => { const ox = a.entry[0] - a.x, oz = a.entry[1] - a.z, l = Math.hypot(ox, oz), x = a.entry[0] + ox / l * 0.8, z = a.entry[1] + oz / l * 0.8, ux = Math.cos(Math.atan2(ox, oz)), uz = -Math.sin(Math.atan2(ox, oz)); return D.world.collision.solidAt(x + ux * 1.6, z + uz * 1.6, 0.25) && D.world.collision.solidAt(x - ux * 1.6, z - uz * 1.6, 0.25); });
    return { peaceful: D.peaceful, n: D.monsters.filter(m => m.alive).length, outside: out.length, allWild: D.monsters.every(m => !!m.wild), glades: L.glades.length, edge: !!D.world.scene.getObjectByName('wildEdge'), posts, areas: L.wild.map(a => a.name) };
  });
  await sleep(page, 3200);
  const toastQ = await ev(page, () => (window.QA?.toasts || []).concat([...document.querySelectorAll('.toast')].map(t => t.textContent)).some(t => /gone quiet/.test(t)) || window.G.state.flags.cozyQuiet_bamboo === true);
  await ev(page, () => { const G = window.G, P = G.dungeon.layout.plan, [x, z] = P.trail[Math.round(P.trail.length * 0.3)]; G.player.setPos(x, z); G.engine.rig.focus.copy(G.player.pos); G.engine.rig.snap?.(); });
  await sleep(page, 1200); const callsCalm = await frame(page); await shot(page, 'a-trail-calm');
  R.check('a) a saved zone: no monster outside the wild areas, the glades, the gateways and the edge tint, the "gone quiet" note', a1.peaceful && a1.n > 0 && !a1.outside && a1.allWild && a1.glades >= 2 && a1.edge && a1.posts.every(Boolean) && toastQ, { a1, toastQ });
  // ---- b) the wild
  await quiet(page);
  const b1 = await ev(page, async () => {
    const G = window.G, D = G.dungeon, a = D.layout.wild[0], P = G.player;
    P.setPos(a.entry[0], a.entry[1]); G.engine.rig.focus.copy(P.pos); G.engine.rig.snap?.();
    await new Promise(r => setTimeout(r, 600));
    const lv = [...new Set(D.monsters.filter(m => m.wild).map(m => m.level))];
    return { enter: window.__ev.some(([n, p]) => n === 'wild:enter' && p.area === a.id), lv };
  });
  await shot(page, 'b-wild-entry');
  const b2 = await ev(page, async () => {
    const G = window.G, D = G.dungeon, a = D.layout.wild[0], P = G.player, mons = D.wild.packs.get(a.id);
    const wait = (fn, max) => new Promise(res => { const t0 = performance.now(); const f = () => { if (fn() || performance.now() - t0 > max) res(fn()); else requestAnimationFrame(f); }; f(); });
    G.state.player.lvl = 40; G.actions.recompute?.(true); const heal = () => { if (G.dungeon === D) { G.actions.restoreAll(); requestAnimationFrame(heal); } }; heal();
    P.setPos(a.x, a.z); const aggro = await wait(() => mons.some(m => m.aggro), 10000);
    const dx = a.entry[0] - a.x, dz = a.entry[1] - a.z, l = Math.hypot(dx, dz); P.setPos(a.x + dx / l * (a.r + 24), a.z + dz / l * (a.r + 24));
    let peak = 0; const t0 = performance.now(); await wait(() => { for (const m of mons) if (m.alive) peak = Math.max(peak, Math.hypot(m.pos.x - a.x, m.pos.z - a.z) - a.r); return performance.now() - t0 > 7000; }, 8000);
    const home = await wait(() => mons.every(m => !m.alive || (!m.homing && !m.aggro && Math.hypot(m.pos.x - a.x, m.pos.z - a.z) < a.r + 6.5)), 20000);
    return { aggro, peak: +peak.toFixed(1), home };
  });
  R.check('b) the wild: the entry note, packs a step above the strongest hero (8 + 2 = 10, within 6…13), the leash: they chase to r + 6 m and walk home', b1.enter && b1.lv.length === 1 && b1.lv[0] === 10 && b2.aggro && b2.peak <= 7.5 && b2.home, { b1, b2 });
  // Poe's scene in the calm grove (a fresh flag, a walk out of the village)
  const pj = await ev(page, async () => {
    const G = window.G; G.state.flags.poeJoined = false; G.enterRegion('bamboo');
    await new Promise(r => { const f = () => (G.dungeon?.isRegion && !G.ui?.iris?.active && G.dungeon.monsters.length ? r() : requestAnimationFrame(f)); f(); });
    const J = G.heroes.poeJoin, P = G.player, tr = G.dungeon.layout.plan.trail; let i = 0, bd = 1e9; tr.forEach(([x, z], j) => { const d = Math.hypot(x - P.pos.x, z - P.pos.z); if (d < bd) { bd = d; i = j; } });
    const t0 = performance.now();
    await new Promise(res => { const f = () => { if (J.state !== 'off' && J.state !== 'wait' || performance.now() - t0 > 30000) return res(); if (i < tr.length - 2) { const nx = tr[i + 2], L = Math.hypot(nx[0] - P.pos.x, nx[1] - P.pos.z) || 1; if (L < 1) i++; else { P.setPos(P.pos.x + (nx[0] - P.pos.x) / L * 0.08, P.pos.z + (nx[1] - P.pos.z) / L * 0.08); P.facing = P.faceTarget = Math.atan2(nx[0] - P.pos.x, nx[1] - P.pos.z); } } requestAnimationFrame(f); }; f(); });
    return J.state;
  });
  R.check("b) Poe's joining scene starts in the calm, saved grove", pj === 'tail' || pj === 'caught' || pj === 'talk', pj);
  await quiet(page); await ev(page, () => { const G = window.G; G.ui.dlg?.finish?.(-1); G.heroes.poeJoin.reset?.(); });
  // ---- c) the minimap, the big map, the Travel Map
  await toRegion(page, 'bamboo');
  const c1 = await ev(page, async () => {
    const G = window.G, D = G.dungeon, a = D.layout.wild[0]; G.player.setPos(a.entry[0], a.entry[1]); G.engine.rig.focus.copy(G.player.pos); G.engine.rig.snap?.();
    await new Promise(r => setTimeout(r, 700));
    const cv = [...document.querySelectorAll('canvas')].find(c => c.closest('.hud') && c.width < 600 && c.width > 60);
    let violet = 0; if (cv) { const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; for (let i = 0; i < d.length; i += 4) if (d[i] > 120 && d[i + 2] > 200 && d[i + 1] < 140) violet++; }
    G.ui.open('map'); await new Promise(r => setTimeout(r, 500));
    const legend = [...document.querySelectorAll('.p-map .mp-legend div')].map(e => e.textContent);
    return { violet, legend };
  });
  await shot(page, 'c-bigmap'); await ev(page, () => window.G.ui.closeAll());
  await ev(page, () => window.G.openTravel({ select: 'bamboo' })); await sleep(page, 700);
  const c2 = await ev(page, () => ({ rows: [...document.querySelectorAll('.p-travel .tv-rows > div')].map(d => d.textContent.replace(/\s+/g, ' ').trim()), dot: !!document.querySelector('.tv-pin[data-id="bamboo"] .tv-sight') }));
  await shot(page, 'c-travel'); await ev(page, () => window.G.ui.closeAll());
  R.check('c) the minimap draws the violet rings; the map legend has wild areas, sightings and the dig spots; the Travel Map card lists the wild areas and the peace', c1.violet > 20 && ['Wild area', 'Sighting', "Shadow's dig spot"].every(t => c1.legend.includes(t)) && c2.rows.some(r => /^Wild ?the Kamaitachi Thicket/.test(r)) && c2.rows.some(r => /^Trail ?Peaceful/.test(r)) && c2.dot, { c1, c2 });
  // a besieged zone, for the comparison
  await ev(page, () => { window.G.peaceful.override('maple', false); }); await toRegion(page, 'maple');
  const a2 = await ev(page, () => { const D = window.G.dungeon, L = D.layout; return { peaceful: D.peaceful, n: D.monsters.filter(m => m.alive).length, trail: D.monsters.filter(m => m.alive && !m.wild && !m.siegeCamp && !m.siegeCaptain).length, wild: D.monsters.filter(m => m.wild).length, glades: L.glades.length }; });
  await ev(page, () => { const G = window.G, P = G.dungeon.layout.plan, [x, z] = P.trail[Math.round(P.trail.length * 0.3)]; G.player.setPos(x, z); G.engine.rig.focus.copy(G.player.pos); G.engine.rig.snap?.(); });
  await sleep(page, 1200); const callsBesieged = await frame(page);
  await ev(page, () => window.G.peaceful.override('maple', null));
  R.check('a) a besieged zone still fields its trail camps (and its wild areas); a saved one is cheaper', !a2.peaceful && a2.trail > 0 && a2.wild > 0 && !a2.glades && a2.n > a1.n, { a2, n: a1.n, callsCalm, callsBesieged });
  errs.push(...errors); warns.push(...w); await browser.close();
}

if (want('d') || want('e') || want('f')) {
  const { browser, page, errors, warns: w } = await launch({ w: 1280, h: 800 });
  await boot(page, 'fresh&nointro&notut&villagesaved=bamboo');
  await installPad(page); await padTap(page, 'A'); await sleep(page, 300); // (the pad is the device: its hints show)
  await ev(page, () => { const G = window.G; G.state.player.lvl = 14; G.actions.recompute?.(true); window.__ev = []; G.events.on('sighting:cleared', p => window.__ev.push(p)); });
  await quiet(page);
  // ---- d) Blossom Hollow's board, by F
  await ev(page, () => { const G = window.G, it = G.peaceful.board.it; G.player.setPos(it.pos.x, it.pos.z); G.player.moveTarget = null; G.ui.closeAll(); });
  await sleep(page, 300); await page.keyboard.press('f');
  await page.waitForFunction(() => window.G.ui.isOpen('sightings'), null, { timeout: 5000 }).catch(() => {});
  const d1 = await ev(page, () => ({ open: window.G.ui.isOpen('sightings'), cards: document.querySelectorAll('.p-sight .sg-card').length, list: window.G.peaceful.sightings().map(s => s.zone + ':' + s.kind) }));
  await shot(page, 'd-board');
  R.check("d) Blossom Hollow's Sightings board opens by F: three sightings in the open zones' wild areas", d1.open && d1.cards === 3 && d1.list.length === 3, d1);
  // ---- e) the pad: A on a card's button opens the Travel Map on its zone
  let e1 = await ev(page, () => { const nav = window.G.ui.padNav, b = document.querySelector('.p-sight .sg-go:not([disabled])'); if (!b) return null; nav.focus(b, []); return b.dataset.zone; });
  await sleep(page, 200); await padTap(page, 'DDown'); await sleep(page, 300); // (a d-pad step: the ring moves and the hints show)
  const cur = await ev(page, () => window.G.ui.padNav.cur?.dataset?.zone || null), hints = await ev(page, () => document.querySelector('.pad-hints')?.textContent || '');
  if (cur) e1 = cur;
  await padTap(page, 'A'); await sleep(page, 700);
  const e2 = await ev(page, () => ({ travel: window.G.ui.isOpen('travel'), sel: window.G.ui.panels.travel.sel }));
  await shot(page, 'e-pad-travel'); await ev(page, () => window.G.ui.closeAll());
  R.check('e) the pad: A on a sighting\'s button opens the Travel Map on its zone (the hint says so)', e1 && e2.travel && e2.sel === e1 && /Travel Map/.test(hints), { e1, e2, hints });
  // ---- d) a sighting in Bamboo: spawned in its wild area, named, pinned; beaten: the bounty
  const zone = 'bamboo';
  await ev(page, z => { const P = window.G.peaceful; if (!P.sightings().some(s => s.zone === z && !s.done)) { for (let k = 0; k < 20 && !P.sightings(true).some(s => s.zone === z); k++) window.G.cozy.clock.add(24); } }, zone);
  await toRegion(page, zone);
  const d2 = await ev(page, async () => {
    const G = window.G, D = G.dungeon, g = [...D.wild.sights.values()][0]; if (!g) return { none: true };
    const a = D.layout.wild.find(w => w.id === g.s.area), inside = g.monsters.every(m => Math.hypot(m.pos.x - a.x, m.pos.z - a.z) < a.r + 1.5);
    const named = g.s.kind === 'swarm' || g.monsters.some(m => m.name === g.s.name), pins = D.wild.pins().length;
    const r0 = G.peaceful.renown().n, loot0 = D.loot.list.length;
    G.player.setPos(g.monsters[0].pos.x + 2, g.monsters[0].pos.z); for (const m of g.monsters) if (m.alive) m.takeDamage(1e9);
    await new Promise(r => setTimeout(r, 1600));
    const s = G.peaceful.sightings().find(q => q.id === g.s.id);
    return { id: g.s.id, kind: g.s.kind, inside, named, pins, done: s.done, renown: G.peaceful.renown().n - r0, loot: D.loot.list.length - loot0, ev: window.__ev.length, pinsAfter: D.wild.pins().length };
  });
  await shot(page, 'd-bounty');
  R.check('d) a sighting spawns in its wild area, named and pinned; beating it pays the bounty (loot, renown, the event) and clears the pin', !d2.none && d2.inside && d2.named && d2.pins >= 1 && d2.done && d2.renown > 0 && d2.loot >= 2 && d2.ev === 1 && d2.pinsAfter === d2.pins - 1, d2);
  // the saved village's notice board opens it too, the card stamped
  const d3 = await ev(page, async () => { const G = window.G, it = G.dungeon.world.interactables.find(i => i.label === 'Read the Sightings board'); if (!it) return null; it.onInteract(); await new Promise(r => setTimeout(r, 600)); return { open: G.ui.isOpen('sightings'), stamped: document.querySelectorAll('.p-sight .sg-card.done .sg-stamp').length }; });
  await shot(page, 'd-zone-board'); await ev(page, () => window.G.ui.closeAll());
  R.check("d) Takemori's notice board reads the Sightings; the beaten one is stamped", d3?.open && d3.stamped >= 1, d3);
  // a new world day: three new ones; renown survives a reload
  const d4 = await ev(page, () => { const G = window.G, a = G.peaceful.sightings().map(s => s.id).join(); G.cozy.clock.add(24); const b = G.peaceful.sightings(); G.save(); return { changed: b.map(s => s.id).join() !== a, n: b.length, fresh: b.every(s => !s.done), renown: G.peaceful.renown().n }; });
  await boot(page, 'nointro&notut');
  const d5 = await ev(page, () => window.G.peaceful.renown().n);
  R.check('d) the next world day brings three new sightings; renown survives a reload', d4.changed && d4.n === 3 && d4.fresh && d5 === d4.renown && d5 > 0, { d4, d5 });
  // ---- f) the debug actions
  const f1 = await ev(page, async () => {
    const G = window.G, { DEBUG_SECTIONS } = await import('/src/debug/registry.js'), S = DEBUG_SECTIONS.get('cozy'), act = l => S.actions.find(a => a.label === l);
    const need = ['Show wild areas', 'Go to a wild area', 'Peaceful on a zone', 'Spawn a sighting here', 'Refresh the sightings'];
    const have = need.filter(act);
    const ref = act('Refresh the sightings').run(G);
    G.enterRegion('bamboo'); await new Promise(r => { const f = () => (G.dungeon?.isRegion && !G.ui?.iris?.active ? r() : requestAnimationFrame(f)); f(); });
    const show = act('Show wild areas').run(G, true), rings = !!G.dungeon.world.scene.getObjectByName('wildDebug');
    const n0 = G.dungeon.monsters.length, sp = act('Spawn a sighting here').run(G, 'unique'), n1 = G.dungeon.monsters.length;
    act('Peaceful on a zone').run(G, { zone: 'tidepool', mode: 'on' }); const tp = G.peaceful.isPeaceful('tidepool'); act('Peaceful on a zone').run(G, { zone: 'tidepool', mode: 'auto' });
    return { have: have.length, ref: typeof ref === 'string', show: /wild areas/.test(show), rings, spawned: n1 - n0, sp, tp, back: !G.peaceful.isPeaceful('tidepool') };
  });
  R.check('f) the Cozy debug tab: show wild areas (rings), spawn a sighting here, refresh, peaceful on a zone', f1.have === 5 && f1.ref && f1.show && f1.rings && f1.spawned >= 2 && f1.tp && f1.back, f1);
  errs.push(...errors); warns.push(...w); await browser.close();
}

if (want('e')) { // the phone
  const { browser, page, errors, warns: w } = await launchTouch();
  await boot(page, 'fresh&nointro&notut&mobile&villagesaved=bamboo');
  await ev(page, () => { const G = window.G; G.state.player.lvl = 14; G.actions.recompute?.(true); G.ui.open('sightings', { at: 'village' }); });
  await sleep(page, 900);
  const audit = await ev(page, () => {
    const p = document.querySelector('.p-sight'), r = p.getBoundingClientRect(), small = [], tiny = [];
    for (const b of p.querySelectorAll('button')) { const q = b.getBoundingClientRect(); if (!q.width || getComputedStyle(b).visibility === 'hidden') continue; if (Math.min(q.height, q.width) < 43.5 && !b.classList.contains('ph-x')) small.push(b.className.split(' ')[0] + ':' + Math.round(q.height)); }
    for (const e of p.querySelectorAll('*')) { if (!e.offsetParent || !e.childNodes.length || ![...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue; const fs = parseFloat(getComputedStyle(e).fontSize) * (parseFloat(getComputedStyle(document.querySelector('.ui-root')).getPropertyValue('--m-pscale')) || 1); if (fs < 11.9 && !e.closest('.jp, .ph-jp')) tiny.push(e.className + ':' + e.textContent.trim().slice(0, 12) + ':' + fs.toFixed(1)); }
    return { phone: window.G.ui.root.classList.contains('m-phone'), fits: r.top >= -1 && r.bottom <= innerHeight + 1 && r.left >= -1 && r.right <= innerWidth + 1, cards: p.querySelectorAll('.sg-card').length, small: small.slice(0, 8), tiny: tiny.slice(0, 8) };
  });
  await shot(page, 'e-phone-board');
  R.check('e) the phone: the board fits the screen, 44 px targets, the 12 px floor', audit.phone && audit.fits && audit.cards === 3 && !audit.small.length && !audit.tiny.length, audit);
  errs.push(...errors); warns.push(...w); await browser.close();
}
console.log('  shots: ' + OUT.pathname);
process.exit(R.finish(errs, warns) ? 1 : 0);
