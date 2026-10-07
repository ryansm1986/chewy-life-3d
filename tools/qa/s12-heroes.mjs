// Scenario 12: the hero roster (docs/HEROES.md, docs/POE.md §6) — Chewy, Moka and Poe.
//  a) a fresh game: Moka waits by the fountain ('!'), switching is refused until she joins; the join scene
//  b) Tab switch in the village: transition locks input + invulnerable, state relinks, the old hero stays in town
//  c) switch cooldown; per-hero skill cooldowns survive a round trip
//  d) class-bound weapons (the bag is shared), catch-up XP
//  e) talking to the benched hero offers "Let's switch!"
//  f) switching in the Burrow: the old hero is sent home to the village, the new one tags in on the same spot
//  g) save / reload keeps the active hero; a v1 (single-hero) save migrates
//  h) repeated switches don't leak GPU geometry / textures / villagers
//  i) three heroes: Poe joins, a Tab tap cycles the joined heroes in order, holding Tab opens the hero wheel (pick by key),
//     the HUD shows a mini portrait per benched hero
import { launch, boot, waitMode, sleep, makeReport, drainDialogue, tap } from './lib.mjs';

const R = makeReport('S12 heroes: join, switch (village + Burrow), gear, XP, save/migrate, leaks');
const { browser, page, errors, warns } = await launch();
const SW = 2700; // one switch transition (zoom out, hand-off, glide, zoom in) + margin
try {
  await boot(page, 'fresh&nointro');

  // a) waiting by the fountain
  const a = await page.evaluate(() => {
    const G = window.G, v = G.heroes.villagers.moka;
    return { hasMoka: !!v, frozen: !!v?.frozen, marker: G.story.markerFor('moka'), inNpcs: G.npcs.includes(v), why: G.heroes.canSwitch(), active: G.state.activeHero, heroes: Object.keys(G.state.heroes), poeV: !!G.heroes.villagers.poe }; // (Poe isn't in town until she joins: she's in the bamboo)
  });
  R.check('fresh game: Chewy active, Moka waits in town with a "!" marker', a.active === 'chewy' && a.hasMoka && a.frozen && a.marker === '!' && a.inNpcs && a.heroes.join() === 'chewy,moka,poe,shihtzu,golden' && !a.poeV, JSON.stringify(a));
  R.check('switching is refused before Moka joins', /waiting/i.test(a.why), a.why);
  await page.evaluate(() => { const G = window.G; G.heroes.talk(G.heroes.villagers.moka); });
  await sleep(page, 300);
  await drainDialogue(page, [0]);
  await sleep(page, 400);
  const j = await page.evaluate(() => { const G = window.G, v = G.heroes.villagers.moka; return { joined: !!G.state.flags.mokaJoined, frozen: v.frozen, marker: G.story.markerFor('moka'), locked: G.player.controlLocked, can: G.heroes.canSwitch() }; });
  R.check('join scene: Moka joins, marker cleared, she carries on with her day, switching allowed', j.joined && !j.frozen && !j.marker && !j.locked && j.can === '', JSON.stringify(j));

  // b) Tab in the village
  await page.evaluate(() => { const G = window.G; G.skills.cds.chomp = 7; G.player.setPos(G.village.world.landmarks.plaza.x - 3, G.village.world.landmarks.plaza.z + 4); });
  await sleep(page, 400);
  const before = await page.evaluate(() => { const G = window.G; return { p: [G.player.pos.x, G.player.pos.z], npcs: G.npcs.filter(n => !n.folk).length, dist: G.engine.rig.distTarget, mem: window.QA.mem() }; });
  await tap(page, 'Tab');
  // (wait on the switch's own state, not the clock: under a loaded run-all 350 ms may be a frame or two, or past the hand-off)
  await page.waitForFunction(() => { const G = window.G; return G.heroes.switching && G.engine.rig.distTarget > 24; }, null, { timeout: 5000 }).catch(() => {});
  const mid = await page.evaluate(() => { const G = window.G; return { switching: G.heroes.switching, locked: G.player.controlLocked, invuln: !!G.player.invuln, zoomedOut: G.engine.rig.distTarget > 24 }; });
  R.check('Tab starts the switch: input locked, invulnerable, camera pulls out', mid.switching && mid.locked && mid.invuln && mid.zoomedOut, JSON.stringify(mid));
  await sleep(page, SW);
  const b = await page.evaluate((bp) => {
    const G = window.G, st = G.state, c = G.heroes.villagers.chewy;
    return {
      active: st.activeHero, hero: G.player.hero, name: G.player.name, wt: G.derived.weaponType, staff: !!G.player.staff,
      linked: st.player === st.heroes.moka.player && st.equipment === st.heroes.moka.equipment,
      chewyDist: c ? Math.hypot(c.pos.x - bp[0], c.pos.z - bp[1]) : 99, mokaV: !!G.heroes.villagers.moka, npcs: G.npcs.filter(n => !n.folk).length, // (townsfolk may move in meanwhile)
      locked: G.player.controlLocked, switching: G.heroes.switching, dist: G.engine.rig.distTarget, focus: !!G.heroFocus, lifeMax: G.derived.lifeMax,
      hud: document.querySelector('.pc-name')?.textContent || '', hsw: !document.querySelector('.hsw')?.hidden,
    };
  }, before.p);
  R.check('after the switch: Moka is played (staff, her stats), state.player/equipment relinked', b.active === 'moka' && b.hero === 'moka' && b.name === 'Moka' && b.wt === 'staff' && b.staff && b.linked && b.lifeMax < 90, JSON.stringify(b));
  R.check('the old hero stays in town where he stood (a villager), Moka left the villager list, villager count unchanged', b.chewyDist < 1.5 && !b.mokaV && b.npcs === before.npcs, JSON.stringify({ chewyDist: b.chewyDist, npcs: [before.npcs, b.npcs] }));
  R.check('transition over: controls back, camera restored, HUD shows Moka with a switch button', !b.locked && !b.switching && !b.focus && Math.abs(b.dist - before.dist) < 0.01 && /Moka/.test(b.hud) && b.hsw, JSON.stringify({ locked: b.locked, dist: [before.dist, b.dist], hud: b.hud, hsw: b.hsw }));

  // c) cooldowns
  const c1 = await page.evaluate(() => { const G = window.G; return { again: G.heroes.switchTo(G.heroes.next(), { quiet: true }), chomp: G.skills.cds.chomp || 0 }; });
  R.check('switch cooldown: an immediate second switch is refused; Chewy\'s cooldowns are not Moka\'s', !c1.again && !c1.chomp, JSON.stringify(c1));
  await sleep(page, 2300);
  await tap(page, 'Tab'); await sleep(page, SW);
  const c2 = await page.evaluate(() => { const G = window.G; return { active: G.state.activeHero, chomp: G.skills.cds.chomp || 0, linked: G.state.player === G.state.heroes.chewy.player, wt: G.derived.weaponType }; });
  R.check('back to Chewy after the cooldown: his sword and his skill cooldowns come back', c2.active === 'chewy' && c2.linked && c2.wt === 'sword' && c2.chomp > 0, JSON.stringify(c2));

  // d) class-bound weapons, catch-up XP
  const d = await page.evaluate(async () => {
    const G = window.G, A = G.actions, st = G.state;
    const { generateItem } = await import('/src/rpg/items.js');
    const staff = generateItem({ ilvl: 3, slot: 'weapon', wtype: 'staff', rarity: 'normal' });
    const i = A.firstFree('inv'); st.inventory[i] = staff;
    const chewyEquip = A.equip(i); // refused: Moka's staff
    const why = A.equipProblem(staff, 'weapon');
    // catch-up: Chewy lvl 12, Moka lvl 3 → Moka earns double
    st.heroes.chewy.player.lvl = 12;
    await new Promise(r => { G.heroes.cd = 0; G.heroes.switchTo('moka', { quiet: true }); setTimeout(r, 2700); });
    const P = st.player; P.lvl = 3; P.xp = 0;
    const gained = A.addXp(10), catching = A.isCatchingUp();
    const idx = st.inventory.indexOf(staff);
    const mokaEquip = A.equip(idx);
    return { chewyEquip, why, gained, catching, mokaEquip, wt: G.derived.weaponType, active: st.activeHero, eqName: st.equipment.weapon?.name };
  });
  R.check('weapons are class-bound: Chewy cannot equip a staff, Moka can', !d.chewyEquip && /Moka/.test(d.why) && d.mokaEquip && d.wt === 'staff', JSON.stringify(d));
  R.check('catch-up: a hero 3+ levels behind the pack earns double XP', d.catching && d.gained >= 20, JSON.stringify({ gained: d.gained, catching: d.catching }));

  // e) talk to the benched hero → "Let's switch!"
  await sleep(page, 2200);
  await page.waitForFunction(() => !window.G.heroes.switching, null, { timeout: 12000 }).catch(() => {}); // (game time runs slow under load)
  await page.evaluate(() => { const G = window.G, c = G.heroes.villagers.chewy; G.heroes.cd = 0; G.player.setPos(c.pos.x + 1, c.pos.z); G.talkTo(c); });
  await sleep(page, 300);
  const opts = await page.evaluate(() => { const d = window.G.ui.dlg; return d.active ? { speaker: d.opts.speaker, choices: (d.opts.choices || []).map(c => c.text) } : null; });
  await drainDialogue(page, [0]);
  await page.waitForFunction(() => window.G.heroes.switching, null, { timeout: 4000 }).catch(() => {});
  await page.waitForFunction(() => !window.G.heroes.switching && !window.G.player.controlLocked, null, { timeout: 12000 }).catch(() => {});
  await sleep(page, 400);
  const e = await page.evaluate(() => ({ active: window.G.state.activeHero, locked: window.G.player.controlLocked }));
  R.check('talking to the other hero offers a switch, and picking it switches', opts && opts.speaker === 'Chewy' && /switch/i.test(opts.choices[0] || '') && e.active === 'chewy' && !e.locked, JSON.stringify({ opts, e }));

  // f) in the Burrow
  await page.evaluate(() => { const G = window.G; G.state.flags.burrowTut = true; G.enterDungeon(1); });
  await waitMode(page, 'dungeon'); await sleep(page, 2200);
  const f0 = await page.evaluate(() => { const G = window.G; return { p: [G.player.pos.x, G.player.pos.z], mokaV: !!G.heroes.villagers.moka }; });
  await page.evaluate(() => { window.G.heroes.cd = 0; }); await tap(page, 'Tab'); await sleep(page, SW - 800);
  await page.waitForFunction(() => !window.G.heroes.switching && !window.G.player.controlLocked, null, { timeout: 12000 }).catch(() => {});
  const f = await page.evaluate((fp) => {
    const G = window.G, c = G.heroes.villagers.chewy, h = G.heroes.homeSpot('chewy');
    return { mode: G.mode, active: G.state.activeHero, same: Math.hypot(G.player.pos.x - fp[0], G.player.pos.z - fp[1]), chewyHome: c ? Math.hypot(c.pos.x - h.x, c.pos.z - h.z) : 99, chewyInVillage: c?.world === G.village.world, inDungeonScene: !!c && G.world.scene.getObjectById(c.rig.root.id) != null, locked: G.player.controlLocked };
  }, f0.p);
  R.check('Burrow switch: Moka tags in on the same spot, Chewy is sent home to the village', f0.mokaV && f.mode === 'dungeon' && f.active === 'moka' && f.same < 0.3 && f.chewyHome < 1.5 && f.chewyInVillage && !f.inDungeonScene && !f.locked, JSON.stringify(f));
  await page.evaluate(() => window.G.returnToVillage()); await waitMode(page, 'village'); await sleep(page, 800);

  // g) save / reload
  const g0 = await page.evaluate(() => { const G = window.G; G.save(); const s = JSON.parse(localStorage.getItem('chewy3d.save')); return { v: s.version, act: s.activeHero, top: 'player' in s || 'equipment' in s, heroes: Object.keys(s.heroes), mokaLvl: s.heroes.moka.player.lvl }; });
  R.check('save format v2: heroes hold the progressions, no duplicated top-level player/equipment', g0.v === 2 && g0.act === 'moka' && !g0.top && g0.heroes.join() === 'chewy,moka,poe,shihtzu,golden', JSON.stringify(g0));
  await boot(page, 'notitle');
  const g1 = await page.evaluate(() => { const G = window.G, st = G.state; return { act: st.activeHero, hero: G.player.hero, linked: st.player === st.heroes.moka.player, lvl: st.player.lvl, chewyV: !!G.heroes.villagers.chewy, mokaV: !!G.heroes.villagers.moka, wt: G.derived.weaponType }; });
  R.check('reload: still Moka (her level), Chewy lives in town', g1.act === 'moka' && g1.hero === 'moka' && g1.linked && g1.lvl === g0.mokaLvl && g1.chewyV && !g1.mokaV && g1.wt === 'staff', JSON.stringify(g1));
  await page.evaluate(() => { // hand-craft an old single-hero save
    const s = JSON.parse(localStorage.getItem('chewy3d.save'));
    const c = s.heroes.chewy; delete c.player.cls;
    const v1 = { ...s, version: 1, player: c.player, equipment: c.equipment, flags: { ...s.flags, mokaJoined: undefined } };
    delete v1.heroes; delete v1.activeHero; v1.player.lvl = 7;
    window.__ignoreSave = true; localStorage.setItem('chewy3d.save', JSON.stringify(v1));
    removeEventListener('beforeunload', window.G.save);
  });
  await page.evaluate(() => { window.G.save = () => {}; }); // the running game must not overwrite the crafted save on unload
  await boot(page, 'notitle');
  const g2 = await page.evaluate(() => { const G = window.G, st = G.state; return { v: st.version, act: st.activeHero, lvl: st.heroes.chewy.player.lvl, cls: st.player.cls, moka: st.heroes.moka?.player?.lvl, joined: !!st.flags.mokaJoined, waiting: !!G.heroes.villagers.moka?.frozen, wt: G.derived.weaponType }; });
  R.check('a v1 save migrates: Chewy keeps his progress, Moka is new and waits to join', g2.v === 2 && g2.act === 'chewy' && g2.lvl === 7 && g2.cls === 'chewy' && g2.moka === 1 && !g2.joined && g2.waiting && g2.wt === 'sword', JSON.stringify(g2));

  // h) leaks over repeated switches
  // no townsfolk moving in while measuring (each newcomer is a new rig): pin the population the sim reports
  await page.evaluate(() => { const G = window.G; G.state.flags.mokaJoined = true; Object.defineProperty(G.sim.stats, 'population', { get: () => 0, set() {}, configurable: true }); });
  await sleep(page, 1500);
  const mem = [];
  for (let k = 0; k < 7; k++) {
    await page.evaluate(() => { window.G.heroes.cd = 0; window.G.heroes.switchTo(undefined, { quiet: true }); });
    await sleep(page, SW);
    mem.push(await page.evaluate(() => ({ ...window.QA.mem(), npcs: window.G.npcs.length, heroes: Object.keys(window.G.heroes.villagers).length })));
  }
  const m = k => mem[k];
  R.note(`switch memory: ${mem.map(x => `${x.geo}g/${x.tex}t/${x.npcs}n`).join(' ')}`);
  R.check('repeated switches: no geometry / texture growth after warm-up (cycles 3→7)', m(6).geo - m(2).geo <= 4 && m(6).tex - m(2).tex <= 2, JSON.stringify({ geo: mem.map(x => x.geo), tex: mem.map(x => x.tex) }));
  R.check('repeated switches: exactly one benched hero, villager count stable', mem.every(x => x.heroes === 1 && x.npcs === mem[0].npcs), JSON.stringify(mem.map(x => [x.heroes, x.npcs])));

  // i) three heroes
  await page.evaluate(() => { const G = window.G; G.heroes.cd = 0; return G.heroes.joinPoe(); });
  await sleep(page, 600);
  const i0 = await page.evaluate(() => { const G = window.G; return { joined: !!G.state.flags.poeJoined, v: !!G.heroes.villagers.poe, bench: G.heroes.bench(), next: G.heroes.next(), minis: [...document.querySelectorAll('.hsw')].filter(b => !b.hidden).length, active: G.state.activeHero }; });
  R.check('Poe joins: she moves into town (a villager), two benched heroes, two HUD mini portraits', i0.joined && i0.v && i0.bench.length === 2 && i0.minis === 2, JSON.stringify(i0));
  const order = [i0.active];
  for (let k = 0; k < 3; k++) {
    await page.evaluate(() => { window.G.heroes.cd = 0; });
    await tap(page, 'Tab');
    await page.waitForFunction(() => window.G.heroes.switching, null, { timeout: 4000 }).catch(() => {});
    await page.waitForFunction(() => !window.G.heroes.switching, null, { timeout: 12000 }).catch(() => {});
    order.push(await page.evaluate(() => window.G.state.activeHero));
  }
  const ids = ['chewy', 'moka', 'poe'], want = [0, 1, 2, 3].map(k => ids[(ids.indexOf(order[0]) + k) % 3]);
  R.check('a Tab tap cycles the joined heroes in roster order (and wraps round)', order.join() === want.join(), JSON.stringify({ order, want }));
  // hold Tab: the wheel opens (no switch yet); a number key picks that hero
  await page.evaluate(() => { window.G.heroes.cd = 0; });
  await page.keyboard.down('Tab');
  await page.waitForFunction(() => window.G.heroes.wheelOpen, null, { timeout: 4000 }).catch(() => {});
  const w = await page.evaluate(() => ({ open: window.G.heroes.wheelOpen, cards: document.querySelectorAll('.hero-wheel .hw-card').length, roster: window.G.heroes.roster().length, switching: window.G.heroes.switching, sel: document.querySelector('.hw-card.sel .hw-t b')?.textContent || '' }));
  const pickId = await page.evaluate(() => { const G = window.G, list = G.heroes.roster(); return list.find(h => h.ready)?.id; });
  const pickKey = String(['chewy', 'moka', 'poe'].indexOf(pickId) + 1);
  await page.keyboard.press(pickKey);
  await page.keyboard.up('Tab');
  await page.waitForFunction(() => !window.G.heroes.wheelOpen, null, { timeout: 3000 }).catch(() => {});
  await page.waitForFunction(() => !window.G.heroes.switching && window.G.state.activeHero !== undefined, null, { timeout: 12000 }).catch(() => {});
  await sleep(page, 300);
  const w2 = await page.evaluate(() => ({ active: window.G.state.activeHero, open: window.G.heroes.wheelOpen, switching: window.G.heroes.switching }));
  R.check('holding Tab opens the hero wheel (a card per hero of the roster) instead of switching; a number key picks the hero', w.open && w.cards === w.roster && w.roster >= 4 && !w.switching && w2.active === pickId && !w2.open, JSON.stringify({ w, pickId, w2 }));
  // Poe as played: her fūma on her back, her class
  await page.evaluate(() => { const G = window.G; G.heroes.cd = 0; if (G.state.activeHero !== 'poe') G.heroes.switchTo('poe', { quiet: true }); });
  await page.waitForFunction(() => window.G.state.activeHero === 'poe' && !window.G.heroes.switching, null, { timeout: 12000 }).catch(() => {});
  const pz = await page.evaluate(() => { const G = window.G, P = G.player; return { hero: P.hero, wt: G.derived.weaponType, back: !!P.rig.parts.fumaBack, backVis: !!P.rig.parts.fumaBack?.visible, hand: !!P.fumaHand, linked: G.state.player === G.state.heroes.poe.player }; });
  R.check('playing Poe: her state relinked, the fūma on her back', pz.hero === 'poe' && pz.wt === 'fuma' && pz.back && pz.backVis && pz.hand && pz.linked, JSON.stringify(pz));
} catch (e) { errors.push('[harness] ' + e.stack); }
const failed = R.finish(errors, warns);
await browser.close();
process.exit(failed ? 1 : 0);
