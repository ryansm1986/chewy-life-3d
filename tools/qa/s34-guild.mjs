// s34: the Adventurers' Guild and hires, the cozy path's phase D (docs/COZY.md §5, §9, §10; ROADMAP CZ-7, CZ-8).
//   a) the Guild in the build list (locked below village rank 2, its cost has no combat-only material), built on a civic
//      plot from Build mode by a click, paid for; Old Hachi by the door; his first talk and his choices; the door opens
//      the Guild panel (Hire · Roster · Guild, the Expedition Board and the Sightings inside); shots of the model at both
//      45° yaws, the build card, Old Hachi talking
//   b) hires end to end: two signed on from the Hire tab (the fee paid, the roster), living in town as townsfolk (they
//      take the townsfolk slots first), sent on an errand from the Guild's own board with a hero (they walk off, away in
//      the roster), back with XP, morale and a level up; a siege relief with a hero and a Guard (+15%)
//   c) wages over world days (paid from coins, morale up, the morning banner's line), an empty purse (owed, glum, a break
//      after three days, back pay), time away across a world day (the away card's "At the Guild" lines)
//   d) the upgrade to level 2 (rank 3, the scaffold, the roster cap 6), level 3 (crews of 5), the Forager's Basket and
//      Shadow's Bandana; the Cozy debug section's Guild actions
//   e) save and reload (the hires, their looks and the Guild come back); an old save with no Guild state loads
//   f) the pad (LB / RB tabs, A signs on) and the phone (fits, 44 px targets, the 12 px floor) with shots of each tab
//   shots → tools/qa/tmp/s34-guild/      usage: node tools/qa/s34-guild.mjs   (ONLY=ab: just those parts)
import fs from 'node:fs';
import { launch, boot, sleep, drainDialogue, makeReport } from './lib.mjs';
import { installPad, padTap } from './pad-lib.mjs';
import { launchTouch } from './touch-lib.mjs';

const OUT = new URL('./tmp/s34-guild/', import.meta.url); fs.mkdirSync(OUT, { recursive: true });
const shot = (page, n) => page.screenshot({ path: new URL(n + '.png', OUT).pathname.replace(/^\/([A-Z]:)/, '$1') });
const R = makeReport('s34-guild');
const errs = [], warns = [];
const want = k => !process.env.ONLY || process.env.ONLY.includes(k);
const ev = (page, fn, arg) => page.evaluate(fn, arg);
const W = (page, fn, arg, timeout = 8000) => page.waitForFunction(fn, arg, { timeout }).then(() => true, () => false);
const click = async (page, sel) => { const ok = await ev(page, s => { const e = document.querySelector(s); return !!e && !e.disabled; }, sel); if (ok) { await page.click(sel); await sleep(page, 140); } return ok; };
const skip = (page, h) => ev(page, h => window.G.cozy.clock.add(h), h);
/** the Guild built for a part that doesn't test the building itself (the Cozy debug action) */
const quickGuild = page => ev(page, () => { const G = window.G; G.state.village.rankFloor = 2; G.sim.simulate(); return !!G.cozy.guild.debugBuild(); });
/** frame the Guild at the game camera from a yaw (the hero hidden, standing toward the camera so nothing cuts the model) */
async function frameGuild(page, yaw, dist = 22) {
  return ev(page, async ({ yaw, dist }) => {
    const G = window.G, rec = G.cozy.guild.rec(), P = G.player, rig = G.engine.rig, p = G.sim.worldPos(rec.data);
    const fx = Math.sin(yaw) * 4.5, fz = Math.cos(yaw) * 4.5;
    P.setPos(p.x + fx, p.z + fz); P.moveTarget = null; P.visible = false; if (G.companion) { G.companion.setPos(p.x + fx + 0.5, p.z + fz + 0.5); G.companion.visible = false; }
    rig.yawTarget = rig.yaw = yaw; rig.distTarget = rig.dist = dist; rig.biasTarget.set(-fx, 0, -fz); rig.bias.set(-fx, 0, -fz); rig.snap();
    for (const e of document.querySelectorAll('.ui-root')) e.style.opacity = '0';
    await new Promise(r => setTimeout(r, 1100));
  }, { yaw, dist });
}
async function unframe(page) { await ev(page, () => { const G = window.G; G.player.visible = true; if (G.companion) G.companion.visible = true; G.engine.rig.biasTarget.set(0, 0, 0); G.engine.rig.yawTarget = Math.PI / 4; for (const e of document.querySelectorAll('.ui-root')) e.style.opacity = ''; }); }
/** walk up to the Guild's door and press F */
async function atDoor(page) {
  await ev(page, () => { const G = window.G, rec = G.cozy.guild.rec(), th = -rec.data.rot * Math.PI / 2; G.ui.closeAll(); G.player.setPos(rec.door.x + Math.sin(th) * 0.5, rec.door.z + Math.cos(th) * 0.5); G.player.moveTarget = null; G.interactCooldown = 0; });
  await sleep(page, 300);
  await page.keyboard.press('f');
  return W(page, () => window.G.ui.isOpen('guild'), null, 5000);
}

// ================================================================== a) the building, Old Hachi, the panel
if (want('a')) {
  const { browser, page, errors, warns: w } = await launch({ w: 1600, h: 900 });
  await boot(page, 'fresh&nointro&notut&hour=10');
  const cat = await ev(page, () => { const G = window.G, it = G.build.catalog().flatMap(c => c.items).find(i => i.id === 'guild'); return { name: it?.name, locked: it?.locked, cost: it?.cost }; });
  await ev(page, () => { const G = window.G; G.state.village.rankFloor = 2; G.sim.simulate(); G.sim.checkRings(true); G.state.coins = 2000; Object.assign(G.state.materials, { wood: 60, stone: 40, petal: 6, silk: 0, crystal: 0, lantern: 0, bone: 0 }); });
  const cat2 = await ev(page, () => window.G.build.catalog().flatMap(c => c.items).find(i => i.id === 'guild')?.locked || null);
  R.check('a) the build list: the Adventurers\' Guild, locked below village rank 2, open at rank 2; level 1 costs no combat-only material', cat.name === "Adventurers' Guild" && cat.locked === 'Village rank 2' && cat2 === null && Object.keys(cat.cost).every(k => ['coins', 'wood', 'stone', 'petal'].includes(k)), { cat, cat2 });
  // Build mode: pick it from the palette and click the west civic plot
  await ev(page, () => { const G = window.G; G.player.setPos(99, 106); G.build.enter(); });
  await sleep(page, 1500);
  await ev(page, () => { const P = window.G.ui.panels.build; const tab = [...document.querySelectorAll('.p-build .tab')].find(t => /Landmarks/.test(t.textContent)); tab?.click(); });
  await sleep(page, 500);
  const card = await ev(page, () => { const e = document.querySelector('.p-build [data-id="guild"]'); if (!e) return null; e.scrollIntoView({ block: 'center' }); e.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); return { text: e.textContent.trim().slice(0, 80), locked: e.classList.contains('locked') }; });
  await sleep(page, 600);
  await shot(page, 'a-build-card');
  await ev(page, () => { document.querySelector('.p-build [data-id="guild"]')?.click(); });
  await sleep(page, 400);
  const at = await ev(page, () => { const G = window.G, sim = G.sim, pl = G.sim.constructor && null; void pl; const P = window.__plot = (G.sim.plotOf(99.5, 102)); const sp = sim.spotFor(P, 'guild', 1); const v = new window.G.engine.camera.position.constructor(sp.x + (sp.rot % 2 ? 1.5 : 2), sim.terrain.heightAt(sp.x + 1.5, sp.z + 2), sp.z + (sp.rot % 2 ? 2 : 1.5)); v.project(G.engine.camera); return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight, plot: P?.id, tool: G.build.tool?.type }; });
  await page.mouse.move(at.x, at.y); await sleep(page, 400); await page.mouse.move(at.x + 2, at.y + 1); await sleep(page, 300);
  const coins0 = await ev(page, () => window.G.state.coins);
  await page.mouse.down(); await sleep(page, 80); await page.mouse.up();
  const built = await W(page, () => window.G.sim.S.buildings.some(b => b.type === 'guild'), null, 4000);
  const b = await ev(page, c0 => { const G = window.G, b = G.sim.S.buildings.find(x => x.type === 'guild'); return b ? { plot: b.plot, level: b.level, paid: c0 - G.state.coins, wood: G.state.materials.wood, petal: G.state.materials.petal, glevel: G.cozy.guild.level } : null; }, coins0);
  R.check('a) built from Build mode on the west civic plot by a click: 400 coins, 30 wood, 16 stone, 4 petal paid; the Guild is level 1', built && b?.plot === 'civic-w' && b.paid === 400 && b.wood === 30 && b.petal === 2 && b.glevel === 1, { at, b });
  await ev(page, () => window.G.build.exit()); await sleep(page, 1500);
  const hachi = await ev(page, () => { const G = window.G, v = G.npcs.find(n => n.id === 'hachi'), rec = G.cozy.guild.rec(); return v ? { near: Math.hypot(v.pos.x - rec.door.x, v.pos.z - rec.door.z), label: v.interact.label, toy: !!v.rig.toy } : null; });
  R.check('a) Old Hachi (a Toybox Akita) stands by the Guild\'s door', hachi && hachi.near < 3 && hachi.label === 'Talk to Old Hachi' && hachi.toy, hachi);
  for (const [n, yaw] of [['a', Math.PI / 4], ['b', -Math.PI / 4]]) { await frameGuild(page, yaw); await shot(page, `a-guild-L1-${n}`); }
  await unframe(page);
  // Old Hachi talks: his first words, then his choices
  await ev(page, () => { const G = window.G, v = G.npcs.find(n => n.id === 'hachi'); G.player.setPos(v.pos.x + 0.9, v.pos.z + 0.9); G.player.moveTarget = null; G.interactCooldown = 0; v.interacted(); });
  await W(page, () => window.G.ui.dlg.active);
  await sleep(page, 900); await shot(page, 'a-hachi-talk');
  const first = await ev(page, () => window.G.ui.dlg.lines.map(l => l.text).join(' | '));
  const picked = await drainDialogue(page, [0]);
  const opened = await W(page, () => window.G.ui.isOpen('guild') && window.G.ui.panels.guild.view === 'hire', null, 4000);
  R.check('a) Old Hachi\'s first talk (warm and gruff), then "Show me the adventurers" opens the Guild on the Hire tab', /retired|old dog|knees/.test(first) && picked[0] === 'Show me the adventurers' && opened, { first: first.slice(0, 120), picked });
  await ev(page, () => window.G.ui.closeAll()); await sleep(page, 300);
  const opened2 = await atDoor(page);
  const tabs = await ev(page, () => [...document.querySelectorAll('.p-guild .gd-tab')].map(t => t.dataset.v).join());
  await sleep(page, 900); await shot(page, 'a-panel-hire');
  await click(page, '.p-guild [data-board="exp"]');
  const board = await W(page, () => window.G.ui.isOpen('expeditions') && window.G.ui.panels.expeditions.atBoard, null, 3000);
  await ev(page, () => window.G.ui.closeAll()); await atDoor(page);
  await click(page, '.p-guild [data-board="sight"]');
  const sight = await W(page, () => window.G.ui.isOpen('sightings') && /Guild/.test(document.querySelector('.p-sight .sg-hdt span')?.textContent || ''), null, 3000);
  R.check('a) the door opens the Guild (Hire · Roster · Guild); the Expedition Board inside sends crews; the Sightings hang there too', opened2 && tabs === 'hire,roster,guild' && board && sight, { opened2, tabs, board, sight });
  errs.push(...errors); warns.push(...w); await browser.close();
}

// ================================================================== b) hires end to end
if (want('b')) {
  const { browser, page, errors, warns: w } = await launch({ w: 1600, h: 900 });
  await boot(page, 'fresh&nointro&notut&hour=9');
  await quickGuild(page);
  await ev(page, () => { const G = window.G; G.state.coins = 3000; G.state.flags.mokaJoined = true; G.state.heroes.moka.player.lvl = 6; G.heroes.spawnBench(); G.state.pantry = { cabbageRolls: 6, onigiri: 4 }; });
  await atDoor(page);
  await click(page, '.p-guild .gd-tab[data-v="hire"]');
  const cands = await ev(page, () => window.G.cozy.guild.candidates().map(c => ({ i: c.i, cls: c.cls, lvl: c.lvl, fee: c.fee })));
  const c0 = await ev(page, () => window.G.state.coins);
  await click(page, `.p-guild .gd-sign[data-hire="${cands[0].i}"]`);
  await click(page, `.p-guild .gd-sign[data-hire="${cands[1].i}"]`);
  const hired = await ev(page, c0 => { const G = window.G; return { n: G.state.cozy.guild.hires.length, paid: c0 - G.state.coins, names: G.state.cozy.guild.hires.map(h => h.name), cls: G.state.cozy.guild.hires.map(h => h.cls) }; }, c0);
  R.check('b) two candidates signed on from the Hire tab: the sign-on fees (40 × level) paid, on the roster', hired.n === 2 && hired.paid === cands[0].fee + cands[1].fee, { hired, cands });
  await click(page, '.p-guild .gd-tab[data-v="roster"]'); await sleep(page, 900);
  await shot(page, 'b-roster');
  await ev(page, () => window.G.ui.closeAll());
  const town = await W(page, () => { const G = window.G; return G.cozy.guild.inTown() === 2 && G.state.cozy.guild.hires.every(h => G.npcs.some(n => n.hire === h.id)); });
  const slots = await ev(page, () => { const G = window.G, folk = G.npcs.filter(n => n.folk && !n.hire).length, hires = G.npcs.filter(n => n.hire).length; return { folk, hires, max: 16 }; });
  R.check('b) the hires live in town as Toybox townsfolk (taking the townsfolk slots first)', town && slots.hires === 2 && slots.folk + slots.hires <= 16, slots);
  // the Guild's board: an errand with Moka and a hire (power, class chip, class bonus)
  await atDoor(page); await click(page, '.p-guild [data-board="exp"]');
  await W(page, () => window.G.ui.isOpen('expeditions'));
  await click(page, '.p-exp .ex-tab[data-v="errands"]');
  const h0 = await ev(page, () => window.G.state.cozy.guild.hires[0]);
  await click(page, '.p-exp [data-a="clear"]:not([disabled])');
  await click(page, '.p-exp .ex-mem[data-m="hero:moka"]');
  await click(page, `.p-exp .ex-mem[data-m="hire:${h0.id}"]`);
  const info = await ev(page, () => { const P = window.G.ui.panels.expeditions, I = P.info(); return { ok: I.ok, why: I.why, crew: P.crew, chip: !!document.querySelector('.p-exp .ex-mem.hire .ex-mcls'), mul: I.crewPower.mul, cls: I.crewPower.cls }; });
  await sleep(page, 400); await shot(page, 'b-board-hire');
  await ev(page, id => { const G = window.G, h = G.state.cozy.guild.hires.find(x => x.id === id); h.xp = G.cozy.guild.hireInfo(id).xpNext - 1; }, h0.id); // (one XP short of the next level: the trip's XP levels them up once)
  await click(page, '.p-exp .ex-go:not([disabled])');
  const sent = await ev(page, id => ({ out: window.G.cozy.exp.list().length, away: !!window.G.cozy.guild.hireInfo(id).away }), h0.id);
  await ev(page, () => window.G.ui.closeAll());
  const left = await W(page, id => !window.G.npcs.some(n => n.hire === id), h0.id, 12000);
  R.check('b) sent on an errand from the Guild\'s board with Moka; the hire walks off (away in the roster)', info.ok && info.crew.length === 2 && info.chip && sent.out === 1 && sent.away && left, { info, sent, left });
  await skip(page, 3.5);
  const back = await W(page, () => window.G.cozy.exp.list().length === 0);
  const rep = await ev(page, id => { const G = window.G, r = G.cozy.exp.reports().slice(-1)[0], h = G.state.cozy.guild.hires.find(x => x.id === id); return { result: r.result, line: r.lines.find(l => l.who === 'hire:' + id)?.text, xp: r.xp['hire:' + id], lvl: r.levels['hire:' + id], hlvl: h.lvl, morale: h.morale, trips: h.trips }; }, h0.id);
  const inTown = await W(page, id => window.G.npcs.some(n => n.hire === id), h0.id, 6000);
  R.check('b) back home: a line in the hire\'s voice, XP, a level up, morale moved, back in town', back && rep.line && rep.lvl && rep.hlvl === h0.lvl + 1 &&rep.trips === 1 && rep.morale !== 1 && inTown, rep);
  await ev(page, () => window.G.ui.open('expeditions', { view: 'reports' })); await sleep(page, 900); await shot(page, 'b-report'); await ev(page, () => window.G.ui.closeAll());
  // a siege relief with a hero and a Guard: the class suits it (+15%)
  const relief = await ev(page, () => {
    const G = window.G, S = G.state; S.heroes.moka.player.lvl = 9; S.zones.bamboo.unlocked = true;
    let g = S.cozy.guild.hires.find(h => h.cls === 'guard');
    if (!g) { const c = { i: 9, seed: 77, name: 'Goro', cls: 'guard', lvl: 6, taken: false }; G.cozy.guild.debugHires(0); const st = S.cozy.guild; st.hires.push({ id: 'h' + st.seq++, seed: 77, name: 'Goro', cls: 'guard', lvl: 6, xp: 0, morale: 1, since: 0, owed: 0, unpaid: 0, floor: 0, onBreak: false, trips: 0, wins: 0 }); void c; g = st.hires[st.hires.length - 1]; }
    const crew = ['hero:moka', 'hire:' + g.id], I = G.cozy.exp.info('relief:bamboo', crew, { meals: G.cozy.exp.pickMeals(2) });
    return { id: g.id, ok: I?.ok, why: I?.why, mul: I?.crewPower?.mul, cls: I?.crewPower?.cls?.cls, odds: I?.odds?.key };
  });
  const rs = await ev(page, id => { const G = window.G, r = G.cozy.exp.send('relief:bamboo', ['hero:moka', 'hire:' + id], { meals: G.cozy.exp.pickMeals(2) }); return { ok: r.ok, why: r.why }; }, relief.id);
  await skip(page, 6.5);
  const rr = await W(page, () => window.G.cozy.exp.list().length === 0);
  const rrep = await ev(page, () => { const r = window.G.cozy.exp.reports().slice(-1)[0]; return { result: r.result, crew: r.crew, saved: !!r.saved }; });
  R.check('b) a siege relief with Moka and a Guard: the Guard suits a siege (+15%), sent and back', relief.ok && Math.abs(relief.mul - 1.25) < 0.01 && relief.cls === 'guard' && rs.ok && rr && rrep.crew.length === 2, { relief, rs, rrep });
  errs.push(...errors); warns.push(...w); await browser.close();
}

// ================================================================== c) wages, an empty purse, time away
if (want('c')) {
  const { browser, page, errors, warns: w } = await launch({ w: 1600, h: 900 });
  await boot(page, 'fresh&nointro&notut&hour=9');
  await quickGuild(page);
  await ev(page, () => { const G = window.G; G.state.coins = 1000; G.cozy.guild.debugHires(3); G.cozy.guild.settle(); });
  const d0 = await ev(page, () => { const G = window.G; return { coins: G.state.coins, wages: G.cozy.guild.dailyWages(), morale: G.state.cozy.guild.hires.map(h => h.morale), day: G.cozy.clock.day }; });
  await skip(page, 24 - (await ev(page, () => window.G.cozy.clock.h % 24)) + 0.2);
  await W(page, d => window.G.state.cozy.guild.wages.day > d, d0.day);
  const d1 = await ev(page, () => { const G = window.G; return { coins: G.state.coins, morale: G.state.cozy.guild.hires.map(h => h.morale), banner: G.state.cozy.guild.wages.banner }; });
  const line = await ev(page, () => window.G.cozy.guild.bannerLine());
  R.check('c) a world day\'s wages (4 × level each) come out of the coins; a paid day lifts morale; the morning banner says "Guild wages −N"', d0.coins - d1.coins === d0.wages && d1.morale.every((m, i) => m > d0.morale[i]) && line === `Guild wages −${d0.wages}`, { d0, d1, line });
  // an empty purse: owed, glum, a break after three days at the floor, back pay
  await ev(page, () => { window.G.state.coins = 0; });
  for (let i = 0; i < 6; i++) { const dd = await ev(page, () => window.G.state.cozy.guild.wages.day); await skip(page, 24); await W(page, d => window.G.state.cozy.guild.wages.day > d, dd); }
  const e1 = await ev(page, () => { const G = window.G; return G.state.cozy.guild.hires.map(h => ({ owed: h.owed, morale: h.morale, brk: h.onBreak })); });
  await atDoor(page); await click(page, '.p-guild .gd-tab[data-v="roster"]'); await sleep(page, 800);
  await shot(page, 'c-roster-break');
  const why = await ev(page, () => window.G.cozy.exp.info(window.G.cozy.exp.objectives('errands')[0].id, ['hire:' + window.G.state.cozy.guild.hires[0].id], {}).why);
  await ev(page, () => { window.G.state.coins = 5000; });
  await ev(page, () => window.G.ui.panels.guild.render());
  const id = await ev(page, () => window.G.state.cozy.guild.hires[0].id);
  await click(page, `.p-guild .gd-pay[data-pay="${id}"]`);
  const e2 = await ev(page, id => { const h = window.G.state.cozy.guild.hires.find(x => x.id === id); return { owed: h.owed, brk: h.onBreak, morale: h.morale }; }, id);
  R.check('c) an empty purse: the hires are owed and glum, then take a break (benched, not gone); paying back their wages brings them back', e1.every(h => h.owed > 0 && h.brk && h.morale === 0.85) && /On a break/.test(why) && e2.owed === 0 && !e2.brk, { e1, why, e2 });
  await ev(page, () => window.G.ui.closeAll());
  // time away across a world day: the wages settle, the away card says so
  const ta = await ev(page, async () => {
    const G = window.G, c = G.state.cozy.clock, real = Date.now;
    c.h = Math.floor(c.h / 24) * 24 + 23.6; G.state.cozy.guild.wages.day = Math.floor(c.h / 24);
    const day0 = G.state.cozy.guild.wages.day, coins0 = G.state.coins;
    c.wall = real() - 2 * 35e3; // (2 world hours away: past midnight)
    G.cozy.pulse();
    await new Promise(r => setTimeout(r, 1200));
    const A = G.cozy.awayNow();
    return { day: G.state.cozy.guild.wages.day > day0, paid: coins0 - G.state.coins, guild: A?.guild || [], card: G.ui.isOpen('awayCard') };
  });
  if (!ta.card) await ev(page, () => window.G.cozy.showAway());
  await sleep(page, 800); await shot(page, 'c-away-card');
  const cardText = await ev(page, () => document.querySelector('.p-away')?.textContent || '');
  R.check('c) time away across a world day pays the wages, and the away card has an "At the Guild" line', ta.day && ta.paid > 0 && ta.guild.length > 0 && /At the Guild/.test(cardText) && /Guild wages paid/.test(cardText), { ta, card: cardText.slice(0, 160) });
  errs.push(...errors); warns.push(...w); await browser.close();
}

// ================================================================== d) upgrades, tools, the debug actions
if (want('d')) {
  const { browser, page, errors, warns: w } = await launch({ w: 1600, h: 900 });
  await boot(page, 'fresh&nointro&notut&hour=10');
  await quickGuild(page);
  await ev(page, () => { const G = window.G; G.state.coins = 9000; Object.assign(G.state.materials, { wood: 200, stone: 200, silk: 20, lantern: 20, crystal: 20, petal: 20 }); });
  await atDoor(page); await click(page, '.p-guild .gd-tab[data-v="guild"]'); await sleep(page, 700);
  const u0 = await ev(page, () => ({ why: window.G.cozy.guild.upgradeInfo().why, dis: document.querySelector('.p-guild .gd-up')?.disabled }));
  await ev(page, () => { const G = window.G; G.state.village.rankFloor = 3; G.sim.simulate(); G.ui.panels.guild.render(); });
  await shot(page, 'd-panel-guild');
  await click(page, '.p-guild .gd-up:not([disabled])');
  const up = await W(page, () => window.G.cozy.guild.level === 2, null, 10000);
  const u1 = await ev(page, () => { const G = window.G; return { level: G.cozy.guild.level, b: G.sim.S.buildings.find(b => b.type === 'guild').level, cap: G.cozy.guild.candidates().length, perks: G.cozy.guild.upgradeInfo().now }; });
  R.check('d) the upgrade waits for village rank 3, then the builders raise the Guild to level 2: 6 bunks', /rank 3/.test(u0.why) && u0.dis && up && u1.b === 2 && u1.perks.roster === 6, { u0, u1 });
  await sleep(page, 2500);
  for (const [n, yaw] of [['a', Math.PI / 4], ['b', -Math.PI / 4]]) { await frameGuild(page, yaw); await shot(page, `d-guild-L2-${n}`); }
  await unframe(page);
  // the tools
  await atDoor(page); await click(page, '.p-guild .gd-tab[data-v="guild"]');
  await click(page, '.p-guild .gd-buy[data-tool="basket"]'); await click(page, '.p-guild .gd-buy[data-tool="bandana"]');
  const tools = await ev(page, () => ({ ...window.G.state.cozy.scav.tools, owned: document.querySelectorAll('.p-guild .gd-tool.owned').length }));
  R.check('d) Old Hachi sells the Forager\'s Basket and Shadow\'s Bandana (the scavenging flags)', tools.basket && tools.bandana && tools.owned === 2, tools);
  await ev(page, () => window.G.ui.closeAll());
  // the debug section's Guild actions
  const dbg = await ev(page, async () => {
    const { DEBUG_SECTIONS } = await import('/src/debug/registry.js'); const G = window.G, S = DEBUG_SECTIONS.get('cozy'), A = l => S.actions.find(a => a.label === l);
    const out = {};
    out.labels = ['Build the Guild now', '+1 Guild level', 'Give hires', 'Max morale', 'Pay wages'].filter(l => !!A(l));
    out.plus = A('+1 Guild level').run(G); out.level = G.cozy.guild.level;
    out.give = A('Give hires').run(G, 9); out.n = G.state.cozy.guild.hires.length;
    G.state.cozy.guild.hires[0].morale = 0.9; out.max = A('Max morale').run(G); out.allMax = G.state.cozy.guild.hires.every(h => h.morale === 1.15);
    const c0 = G.state.coins; out.pay = A('Pay wages').run(G, 'pay'); out.paid = c0 - G.state.coins;
    out.broke = A('Pay wages').run(G, 'broke'); out.owed = G.state.cozy.guild.hires.some(h => h.owed > 0);
    return out;
  });
  const five = await ev(page, () => { const G = window.G, S = G.state; S.flags.mokaJoined = true; S.heroes.moka.player.lvl = 9; for (const h of S.cozy.guild.hires) { h.owed = 0; h.onBreak = false; } const crew = ['hero:moka', ...S.cozy.guild.hires.slice(0, 4).map(h => 'hire:' + h.id)]; const o = G.cozy.exp.objectives('errands')[0]; return G.cozy.exp.info(o.id, crew, {}); });
  R.check('d) the Cozy debug section: +1 Guild level (3), give hires (fills 9), max morale, pay wages (and an empty purse); a crew of 5 at level 3', dbg.labels.length === 5 && dbg.level === 3 && dbg.n === 9 && dbg.allMax && dbg.paid > 0 && dbg.owed && five.ok, { dbg, five: { ok: five.ok, why: five.why } });
  await sleep(page, 2500);
  for (const [n, yaw] of [['a', Math.PI / 4], ['b', -Math.PI / 4]]) { await frameGuild(page, yaw); await shot(page, `d-guild-L3-${n}`); }
  await unframe(page);
  errs.push(...errors); warns.push(...w); await browser.close();
}

// ================================================================== e) save and reload; an old save
if (want('e')) {
  const { browser, page, errors, warns: w } = await launch({ w: 1280, h: 800 });
  await boot(page, 'fresh&nointro&notut&hour=10');
  await quickGuild(page);
  const before = await ev(page, () => { const G = window.G; G.cozy.guild.debugHires(3); G.save(); return { level: G.cozy.guild.level, hires: G.state.cozy.guild.hires.map(h => `${h.id}:${h.name}:${h.cls}:${h.seed}`) }; });
  await boot(page, 'nointro&notut&hour=10');
  await W(page, () => window.G.cozy.guild.inTown() >= 3, null, 8000);
  const after = await ev(page, () => { const G = window.G; return { level: G.cozy.guild.level, hires: G.state.cozy.guild.hires.map(h => `${h.id}:${h.name}:${h.cls}:${h.seed}`), hachi: G.npcs.some(n => n.id === 'hachi'), town: G.cozy.guild.inTown() }; });
  R.check('e) a reload brings back the Guild, Old Hachi and the hires (same names, classes and looks), living in town', after.level === before.level && after.hires.join() === before.hires.join() && after.hachi && after.town === 3, { before, after });
  // an old save: no Guild state at all
  await ev(page, () => { const k = Object.keys(localStorage).find(k => /chewy3d\.save$/.test(k)) || 'chewy3d.save'; const s = JSON.parse(localStorage.getItem(k)); delete s.cozy.guild; s.village.buildings = s.village.buildings.filter(b => b.type !== 'guild'); localStorage.setItem(k, JSON.stringify(s)); window.__noSaveOnUnload = true; });
  await ev(page, () => { window.G.saveBlocked = true; });
  await boot(page, 'nointro&notut&hour=10');
  const old = await ev(page, () => { const G = window.G; return { level: G.cozy.guild.level, hires: G.state.cozy.guild.hires.length, open: G.cozy.guild.open() }; });
  R.check('e) an old save with no Guild state loads: no Guild, no hires, the door says to build it first', old.level === 0 && old.hires === 0 && old.open === false, old);
  errs.push(...errors); warns.push(...w); await browser.close();
}

// ================================================================== f) the pad and the phone
if (want('f')) {
  const { browser, page, errors, warns: w } = await launch({ w: 1280, h: 800 });
  await boot(page, 'fresh&nointro&notut&hour=15');
  await installPad(page);
  await quickGuild(page);
  await ev(page, () => { window.G.state.coins = 2000; });
  await padTap(page, 'A'); await sleep(page, 300);
  await atDoor(page);
  await ev(page, () => { const P = window.G.ui.panels.guild; P.view = 'hire'; P.render(); });
  await sleep(page, 600);
  await padTap(page, 'A'); await sleep(page, 500); // (the focus starts on the first Sign on)
  const pa = await ev(page, () => ({ hires: window.G.state.cozy.guild.hires.length, hints: document.querySelector('.pad-hints')?.textContent || '' }));
  await shot(page, 'f-pad-hire');
  await padTap(page, 'RB'); await sleep(page, 500);
  const v1 = await ev(page, () => window.G.ui.panels.guild.view);
  await padTap(page, 'RB'); await sleep(page, 500);
  const v2 = await ev(page, () => window.G.ui.panels.guild.view);
  await shot(page, 'f-pad-guild');
  R.check('f) the pad: A signs the focused candidate on; RB steps the tabs (Roster, Guild)', pa.hires === 1 && v1 === 'roster' && v2 === 'guild', { pa, v1, v2 });
  errs.push(...errors); warns.push(...w); await browser.close();
  // the phone
  const T = await launchTouch();
  await boot(T.page, 'fresh&nointro&notut&hour=15&mobile');
  await quickGuild(T.page);
  await ev(T.page, () => { const G = window.G; G.state.coins = 2000; G.cozy.guild.debugHires(2); });
  const audit = async () => T.page.evaluate(() => {
    const p = document.querySelector('.p-guild'), r = p.getBoundingClientRect(), small = [], tiny = [];
    for (const b of p.querySelectorAll('button')) { const q = b.getBoundingClientRect(); if (!q.width || getComputedStyle(b).visibility === 'hidden') continue; if (Math.min(q.height, q.width) < 43.5 && !b.classList.contains('ph-x')) small.push(b.className.split(' ').slice(0, 2).join('.') + ':' + Math.round(q.height)); }
    const k = parseFloat(getComputedStyle(document.querySelector('.ui-root')).getPropertyValue('--m-pscale')) || 1;
    for (const e of p.querySelectorAll('*')) { if (!e.offsetParent || !e.childNodes.length || ![...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue; const fs = parseFloat(getComputedStyle(e).fontSize) * k; if (fs < 11.9 && !e.closest('.jp, .ph-jp')) tiny.push(e.className + ':' + e.textContent.trim().slice(0, 12) + ':' + fs.toFixed(1)); }
    return { fits: r.top >= -1 && r.bottom <= innerHeight + 1 && r.left >= -1 && r.right <= innerWidth + 1, phone: window.G.ui.root.classList.contains('m-phone'), small: small.slice(0, 8), tiny: tiny.slice(0, 8) };
  });
  const res = {};
  for (const v of ['hire', 'roster', 'guild']) {
    await ev(T.page, v => { window.G.ui.closeAll(); window.G.cozy.guild.open(v); }, v); await sleep(T.page, 1000);
    res[v] = await audit(); await shot(T.page, `f-phone-${v}`);
  }
  // a tap signs a candidate on
  const sb = await ev(T.page, () => { window.G.ui.panels.guild.setView('hire'); const b = document.querySelector('.p-guild .gd-sign:not([disabled])'); b?.scrollIntoView({ block: 'center' }); const r = b?.getBoundingClientRect(); return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null; });
  await sleep(T.page, 300);
  if (sb) await T.F.tap(sb.x, sb.y);
  await sleep(T.page, 500);
  const tapped = await ev(T.page, () => window.G.state.cozy.guild.hires.length);
  R.check('f) the phone: the Guild fits, 44 px targets and the 12 px floor on every tab; a tap signs on', Object.values(res).every(a => a.phone && a.fits && !a.small.length && !a.tiny.length) && tapped === 3, { res, tapped });
  errs.push(...T.errors); warns.push(...T.warns); await T.browser.close();
}
console.log('  shots: ' + OUT.pathname);
process.exit(R.finish(errs, warns) ? 1 : 0);
