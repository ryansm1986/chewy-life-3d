// Scenario 20: Poe, the third hero (docs/POE.md).
//  a) her joining scene in the Bamboo Grove: she tails you (crouched, 4-7 m back, on screen), freezes stiff when you
//     look her way, sneezes when you walk up to her, the dialogue, she joins and vanishes; back in town she lives at home
//  b) leaving mid-scene resets it (no actor left behind) and it starts again on the next visit; an old save (Moka
//     joined, Poe not) gets Shadow's rumour in town, once
//  c) the "Meet Poe" guide (?tut): tap Tab → the next hero, hold Tab → the wheel → a pick, her fūma, the wrap
//  d) playing Poe: every active skill tapped in a Burrow fight lands its hits with no errors; she's the baked poe_toy with
//     the Blender fūma; a real hold on Fūma Throw charges past Stage Ⅰ and releases the charged throw
//  e) perf: a burst of her fully charged releases frames like the tapped burst; GPU geometries plateau
import { launch, boot, waitMode, sleep, makeReport, drainDialogue, tap } from './lib.mjs';

const R = makeReport('S20 Poe: joining in the bamboo, the rumour, the Meet Poe guide, every skill, a real charge, perf');
const { browser, page, errors, warns } = await launch({ w: 1280, h: 720 });
const ev = (f, a) => page.evaluate(f, a);
const quiet = () => ev(() => { const G = window.G; G.sim.tickT = -1e9; clearInterval(window.__freeze); window.__freeze = setInterval(() => { G.sim.tickT = -1e9; }, 200); G.state.flags.hints = { ...(G.state.flags.hints || {}), garden: 1, build: 1, travel: 1, skills: 1, stats: 1, loot: 1, potion: 1, fight: 1 }; });
const mokaIn = () => ev(() => { const G = window.G; G.state.flags.mokaJoined = true; const v = G.heroes.villagers.moka; if (v) { v.frozen = false; v.waitingToJoin = false; } });
const toBamboo = async () => {
  await ev(() => { const G = window.G; G.state.player.lvl = 6; G.actions.recompute(); G.state.flags.burrowTut = true; window.__walkI = 0; G.enterRegion('bamboo'); });
  await waitMode(page, 'dungeon'); await sleep(page, 600);
  await ev(() => { for (const m of window.G.dungeon.monsters) { m.pos.set(-500, 0, -500); m.aggro = false; } }); // (a quiet grove)
};
/** walk n small steps: in a region along its trail from the arrival (it climbs up-screen after the first bend; the open
 *  path whatever the bamboo does round the glade), elsewhere along the camera-up ground axis (open floor only) */
const walk = async (n) => {
  for (let i = 0; i < n; i++) {
    await ev(() => {
      const G = window.G, P = G.player, ok = (x, z) => G.world.walkable(x, z) && !G.world.collision?.solidAt?.(x, z, 0.3), tr = G.dungeon?.isRegion && G.dungeon.layout?.plan?.trail;
      if (tr) {
        let bi = window.__walkI || 0, bd = 1e9; for (let j = Math.max(0, bi - 2); j < Math.min(tr.length, bi + 12); j++) { const q = Math.hypot(tr[j][0] - P.pos.x, tr[j][1] - P.pos.z); if (q < bd) { bd = q; bi = j; } } window.__walkI = bi;
        const nx = tr[Math.min(tr.length - 1, bi + 2)], L = Math.hypot(nx[0] - P.pos.x, nx[1] - P.pos.z) || 1, d = { x: (nx[0] - P.pos.x) / L, z: (nx[1] - P.pos.z) / L };
        const x = P.pos.x + d.x * 0.35, z = P.pos.z + d.z * 0.35; if (ok(x, z)) { P.setPos(x, z); P.facing = P.faceTarget = Math.atan2(d.x, d.z); }
        return;
      }
      const { f, r } = G.engine.rig.groundAxes(); for (const d of [f, r, { x: -r.x, z: -r.z }, { x: -f.x, z: -f.z }]) { const x = P.pos.x + d.x * 0.35, z = P.pos.z + d.z * 0.35; if (ok(x, z)) { P.setPos(x, z); P.facing = P.faceTarget = Math.atan2(d.x, d.z); return; } }
    });
    await sleep(page, 55);
  }
};
const J = () => ev(() => { const H = window.G.heroes, J = H.poeJoin, P = window.G.player; return { state: J.state, frozen: !!J.frozen, vis: !!J.poe?.visible, act: J.poe?.anim.action?.name || null, d: J.poe ? Math.round(Math.hypot(J.poe.pos.x - P.pos.x, J.poe.pos.z - P.pos.z) * 10) / 10 : null, joined: !!window.G.state.flags.poeJoined, poe: !!J.poe, onScreen: !!J.poe && J.onScreen(J.poe.pos.x, J.poe.pos.y, J.poe.pos.z) }; });
try {
  // ================================================================ a) the joining scene
  await boot(page, 'fresh&nointro&notut'); await quiet(); await mokaIn();
  await ev(() => { window.__scene = []; window.G.events.on('poe:joinScene', p => window.__scene.push(p.phase)); });
  await toBamboo();
  const a0 = await J();
  await walk(30);
  await page.waitForFunction(() => window.G.heroes.poeJoin.state === 'tail', null, { timeout: 30000 }).catch(() => {});
  await walk(28); await sleep(page, 300);
  await page.waitForFunction(() => { const J = window.G.heroes.poeJoin; return J.poe && J.onScreen(J.poe.pos.x, J.poe.pos.y, J.poe.pos.z); }, null, { timeout: 4000 }).catch(() => {}); // (she sneaks into view)
  const a1 = await J();
  R.check('in the bamboo she tails you: crouched on tiptoe, a few metres back, on screen (clear of the HUD) even walking up-screen', a0.state === 'wait' && a1.state === 'tail' && a1.vis && a1.act === 'sneakWalk' && a1.d > 3 && a1.d < 14 && a1.onScreen, JSON.stringify({ a0, a1 }));
  await ev(() => { const J = window.G.heroes.poeJoin, P = window.G.player; P.faceTo(J.poe.pos.x, J.poe.pos.z); P.facing = P.faceTarget; });
  await sleep(page, 400);
  const a2 = await J();
  R.check('look her way and she freezes stiff (a very convincing bamboo)', a2.frozen && a2.act === 'ninjaFreeze', JSON.stringify(a2));
  await ev(() => { const J = window.G.heroes.poeJoin, P = window.G.player; P.setPos(J.poe.pos.x + 1.4, J.poe.pos.z + 0.8); });
  await page.waitForFunction(() => window.G.ui.dlg?.active, null, { timeout: 12000 }).catch(() => {});
  const a3 = await ev(() => ({ ...{ speaker: window.G.ui.dlg?.opts?.speaker }, locked: window.G.player.controlLocked, scene: window.__scene.slice() }));
  R.check('walk up to her: ACHOO! — caught; the camera frames you and she talks (Poe speaking, controls locked)', a3.speaker === 'Poe' && a3.locked && a3.scene.includes('caught'), JSON.stringify(a3));
  const picked = await drainDialogue(page, [1, 0]);
  await page.waitForFunction(() => window.__scene.includes('done'), null, { timeout: 8000 }).catch(() => {});
  await sleep(page, 900);
  const a4 = await ev(() => { const G = window.G; return { joined: !!G.state.flags.poeJoined, lvl: G.state.heroes.poe.player.lvl, locked: G.player.controlLocked, poeActor: !!G.heroes.poeJoin.poe, state: G.heroes.poeJoin.state, roster: G.heroes.roster().map(h => h.id + (h.joined ? '+' : '-')).join(), scene: window.__scene.slice() }; });
  R.check('she joins (near the pack\'s level) and vanishes in a puff of smoke; controls back', a4.joined && a4.lvl >= 3 && !a4.locked && !a4.poeActor && ['done', 'off'].includes(a4.state) && a4.scene.includes('done') && /poe\+/.test(a4.roster), JSON.stringify({ a4, picked }));
  await ev(() => window.G.returnToVillage()); await waitMode(page, 'village'); await sleep(page, 1200);
  const a5 = await ev(() => { const G = window.G, v = G.heroes.villagers.poe, h = G.heroes.homeSpot('poe'); return { v: !!v, near: v ? Math.round(Math.hypot(v.pos.x - h.x, v.pos.z - h.z)) : -1, bench: G.heroes.bench() }; });
  R.check('back in town she lives at the cottage (a villager), two heroes on the bench', a5.v && a5.near < 12 && a5.bench.length === 2, JSON.stringify(a5));

  // ================================================================ b) a reset mid-scene; an old save's rumour
  await boot(page, 'fresh&nointro&notut'); await quiet(); await mokaIn();
  await toBamboo(); await walk(30);
  await page.waitForFunction(() => window.G.heroes.poeJoin.state === 'tail', null, { timeout: 30000 }).catch(() => {});
  await ev(() => window.G.returnToVillage()); await waitMode(page, 'village'); await sleep(page, 600);
  const b0 = await J();
  await toBamboo(); const b1 = await J();
  R.check('leaving the grove mid-scene resets it (no actor left behind); the next visit starts it again', b0.state === 'off' && !b0.poe && !b0.joined && b1.state === 'wait', JSON.stringify({ b0, b1 }));
  await ev(() => window.G.returnToVillage()); await waitMode(page, 'village'); await sleep(page, 400);
  await ev(() => { // an old save from before Poe: Moka joined, no heroes.poe at all
    const G = window.G; G.save(); const s = JSON.parse(localStorage.getItem('chewy3d.save'));
    delete s.heroes.poe; delete s.flags.poeJoined; if (s.flags.hints) delete s.flags.hints.poeRumour; s.flags.mokaJoined = true;
    window.__ignoreSave = true; localStorage.setItem('chewy3d.save', JSON.stringify(s)); removeEventListener('beforeunload', G.save); G.save = () => {};
  });
  await boot(page, 'notitle&notut'); await quiet();
  const bOld = await ev(() => { const G = window.G, st = G.state; return { poe: st.heroes.poe?.player?.lvl, joined: !!st.flags.poeJoined, v: !!G.heroes.villagers.poe, bench: G.heroes.bench(), moka: !!st.flags.mokaJoined }; });
  R.check('an old save (Moka joined, no Poe in it) loads with Poe new and not joined: no villager, Moka alone on the bench', bOld.poe === 1 && !bOld.joined && !bOld.v && bOld.moka && bOld.bench.join() === 'moka', JSON.stringify(bOld));
  await ev(() => { delete window.G.state.flags.hints.poeRumour; window.G.heroes.poeJoin.hintT = 0; });
  await page.waitForFunction(() => window.G.state.flags.hints?.poeRumour, null, { timeout: 25000 }).catch(() => {});
  const b2 = await ev(() => ({ rumour: !!window.G.state.flags.hints?.poeRumour, toast: [...document.querySelectorAll('.toast, .tst')].some(t => /Bamboo Grove/.test(t.textContent)) }));
  await sleep(page, 400);
  R.check('in town (Moka joined, Poe not): Shadow passes on the rumour about the bamboo, once', b2.rumour, JSON.stringify(b2));

  // ================================================================ c) the Meet Poe guide
  await boot(page, 'fresh&nointro&tut&hour=11'); await quiet(); await mokaIn();
  await ev(() => { const G = window.G, T = (G.state.flags.tutorials ||= {}); for (const id of ['house', 'switch', 'fishing', 'makeHome', 'remodel', 'charge']) T[id] = { done: true }; G.heroes.joinPoe(); });
  await page.waitForFunction(() => window.G.tutorials.cur?.id === 'meetPoe', null, { timeout: 20000 }).catch(() => {});
  const c0 = await ev(() => ({ id: window.G.tutorials.cur?.id, step: window.G.tutorials.cur?.step?.id, from: window.G.state.activeHero }));
  await ev(() => { window.G.heroes.cd = 0; }); await tap(page, 'Tab');
  await page.waitForFunction(() => window.G.tutorials.cur?.step?.id === 'hold', null, { timeout: 15000 }).catch(() => {});
  const c1 = await ev(() => ({ step: window.G.tutorials.cur?.step?.id, hero: window.G.state.activeHero }));
  await page.waitForFunction(() => !window.G.heroes.switching, null, { timeout: 12000 }).catch(() => {});
  await ev(() => { window.G.heroes.cd = 0; });
  await page.keyboard.down('Tab'); await page.waitForFunction(() => window.G.heroes.wheelOpen, null, { timeout: 4000 }).catch(() => {});
  const wheel = await ev(() => !!document.querySelector('.hero-wheel .hw-card[data-id="poe"]'));
  await page.keyboard.press('3'); await page.keyboard.up('Tab');
  await page.waitForFunction(() => window.G.tutorials.cur?.step?.id === 'fuma', null, { timeout: 15000 }).catch(() => {});
  await page.waitForFunction(() => !window.G.heroes.switching, null, { timeout: 12000 }).catch(() => {});
  const c2 = await ev(() => ({ step: window.G.tutorials.cur?.step?.id, hero: window.G.state.activeHero }));
  for (let i = 0; i < 2; i++) { await sleep(page, 700); await ev(() => document.querySelector('.tut .to-ack, .tut [data-act="ack"], .tut .ack')?.click()); await ev(() => window.G.tutorials.ack?.()); }
  await sleep(page, 600);
  const c3 = await ev(() => ({ cur: window.G.tutorials.cur?.id || null, rec: window.G.state.flags.tutorials?.meetPoe }));
  R.check('the Meet Poe guide: tap Tab → the next hero; hold Tab → the wheel, her card, a pick by key; her fūma; done', c0.id === 'meetPoe' && c0.step === 'tap' && c1.step === 'hold' && c1.hero !== c0.from && wheel && c2.step === 'fuma' && c2.hero === 'poe' && !c3.cur && c3.rec?.done, JSON.stringify({ c0, c1, wheel, c2, c3 }));

  // ================================================================ d) every skill tapped; a real charge
  await boot(page, 'fresh&nointro&notut&hero=poe'); await ev(() => { window.G.state.flags.burrowTut = true; window.G.enterDungeon(3); }); await waitMode(page, 'dungeon'); await sleep(page, 1200);
  const ids = await ev(async () => {
    const G = window.G, P = G.state.player, { SKILLS } = await import('/src/rpg/skills.js');
    P.lvl = 30; P.stats = { str: 20, dex: 90, vit: 300, ene: 160 };
    for (const id of Object.keys(SKILLS)) if (SKILLS[id].cls === 'poe') P.skills[id] = 10;
    G.actions.recompute(); G.actions.restoreAll();
    const raw = G.combat.hitMonster.bind(G.combat); window.__hits = 0; G.combat.hitMonster = (m, o) => { window.__hits++; return raw(m, o); };
    return Object.keys(SKILLS).filter(id => SKILLS[id].cls === 'poe' && !['passive', 'aura'].includes(SKILLS[id].kind));
  });
  const res = [];
  for (const id of ids) {
    const r = await ev(id => {
      const G = window.G, P = G.player;
      G.skills.clearPoe(); G.skills.cds = {}; P.anim.stop(); G.actions.restoreAll();
      if (G.dungeon.monsters.filter(m => m.alive && !m.def.boss).length < 6) G.dungeon.summonAround({ pos: P.pos }, 'mochi', 6);
      const { r: rr } = G.engine.rig.groundAxes();
      G.dungeon.monsters.filter(m => m.alive && !m.def.boss).slice(0, 6).forEach((m, i) => { m.pos.set(P.pos.x + rr.x * (2.5 + i * 0.8) + (i % 2) * 0.7, 0, P.pos.z + rr.z * (2.5 + i * 0.8) - (i % 2) * 0.7); m.lifeMax = m.life = 1e7; m.status.stun = 99; m.speed = 0; });
      window.__hits = 0;
      const aim = P.pos.clone().addScaledVector(rr, 3.5), tgt = G.combat.nearest(aim, 'ally', 3);
      try { return { ok: G.skills.tryCast(id, aim, tgt) }; } catch (e) { return { threw: String(e.stack || e).slice(0, 300) }; }
    }, id);
    await sleep(page, ['shadowClone', 'vanish', 'whirlingFuma', 'caltropFlip', 'thousandStars', 'bullseyeMark'].includes(id) ? 2600 : 1600);
    res.push({ id, ...r, hits: await ev(() => window.__hits) });
  }
  const noHit = res.filter(r => !['shadowClone', 'vanish', 'bullseyeMark'].includes(r.id) && !(r.hits > 0)).map(r => r.id), threw = res.filter(r => r.threw);
  R.check(`playing Poe: every active skill (${ids.length}) casts in a Burrow fight, the damage skills land hits, no errors`, ids.length === 18 && !threw.length && res.every(r => r.ok) && !noHit.length, JSON.stringify({ noHit, threw: threw.map(t => t.id + ': ' + t.threw), casts: res.map(r => `${r.id}:${r.hits}`).join(' ') }));
  const look = await ev(async () => {
    const G = window.G, P = G.player, r = P.rig, kind = h => h?.children[0]?.userData.kind || null;
    for (let i = 0; i < 30 && kind(r.parts.fumaBack) !== 'glb'; i++) await new Promise(q => setTimeout(q, 100));
    return { model: r.model, squint: r.squint, earGain: r.earGain, mount: !!r.parts.fumaMount, back: kind(r.parts.fumaBack), hand: kind(P.fumaHand) };
  });
  R.check('she is the baked Toybox Poe (poe_toy: the happy squint and ear gain from its HERO_MODELS entry) with the Blender fūma on her back and in her paw', look.model === 'poe_toy' && look.squint?.[0] === 0.58 && look.earGain === 0.5 && look.mount && look.back === 'glb' && look.hand === 'glb', JSON.stringify(look));
  // a real hold on right-click (Fūma Throw)
  const xy = await ev(() => {
    const G = window.G, P = G.player, st = G.state.player; G.skills.clearPoe(); G.skills.cds = {}; P.anim.stop(); G.actions.restoreAll();
    st.hotbar[1] = 'fumaThrow'; st.chargePerks = { fumaThrow: { stages: 2 } };
    window.__rel = []; G.events.on('charge:release', p => window.__rel.push(p));
    const { r } = G.engine.rig.groundAxes(), p = P.pos.clone().addScaledVector(r, 4), v = p.project(G.engine.camera);
    return [(v.x * 0.5 + 0.5) * innerWidth, (-v.y * 0.5 + 0.5) * innerHeight];
  });
  await page.mouse.move(xy[0], xy[1]); await sleep(page, 150);
  await page.mouse.down({ button: 'right' });
  await page.waitForFunction(() => (window.G.skills.charge.active?.stage || 0) >= 2, null, { timeout: 6000 }).catch(() => {});
  const d0 = await ev(() => ({ stage: window.G.skills.charge.active?.stage || 0, pose: window.G.player.anim.action?.style || window.G.player.anim.action?.name }));
  await page.mouse.up({ button: 'right' });
  await page.waitForFunction(() => !!window.G.skills.poeFuma, null, { timeout: 3000 }).catch(() => {});
  const d1 = await ev(() => ({ rel: window.__rel.slice(-1)[0] || null, flying: !!window.G.skills.poeFuma, size: window.G.skills.poeFuma?.h?.root?.userData?.m?.scale?.x || 0 }));
  R.check('a real hold on Fūma Throw: the fūma coils back (poeFuma pose) to Stage Ⅱ, and the release throws the Great Fūma', d0.stage >= 2 && d0.pose === 'poeFuma' && d1.rel?.stage >= 2 && d1.rel.ok && d1.flying, JSON.stringify({ d0, d1 }));

  // ================================================================ e) perf
  const burst = staged => ev(async staged => {
    const G = window.G, P = G.player, pl = G.state.player, { CHARGE } = await import('/src/rpg/charge.js');
    pl.stats.ene = 900; pl.chargePerks = {}; for (const id of ['thousandStars', 'smokeDragon', 'phantomBarrage', 'shurikenRain', 'thunderPaw', 'kunaiFan']) pl.chargePerks[id] = Object.fromEntries(Object.entries(CHARGE[id].perks).map(([k, p]) => [k, p.ranks]));
    G.actions.recompute(); G.actions.restoreAll(); G.skills.clearPoe();
    const ms = G.dungeon.monsters.filter(m => m.alive && !m.def.boss);
    if (ms.length < 14) G.dungeon.summonAround({ pos: P.pos }, 'mochi', 14 - ms.length);
    const all = G.dungeon.monsters.filter(m => m.alive && !m.def.boss).slice(0, 16);
    all.forEach((m, i) => { const a = i / all.length * Math.PI * 2, r = 2.5 + (i % 3); m.pos.set(P.pos.x + Math.cos(a) * r, 0, P.pos.z + Math.sin(a) * r); m.lifeMax = m.life = 1e7; m.status.stun = 99; });
    const dts = []; let last = performance.now(), on = true;
    (function f() { const n = performance.now(); dts.push(n - last); last = n; if (on) requestAnimationFrame(f); })();
    const c = staged ? { stage: 3, t: 2 } : undefined, at = all[0].pos.clone();
    const go = id => { G.skills.cds = {}; P.anim.stop(); G.actions.restoreAll(); G.skills.tryCast(id, at, all[0], c); };
    for (const id of ['kunaiFan', 'thunderPaw', 'shurikenRain', 'smokeDragon', 'thousandStars', 'phantomBarrage']) { go(id); await new Promise(r => setTimeout(r, 450)); }
    await new Promise(r => setTimeout(r, 2400)); on = false;
    const s = dts.slice(2).sort((a, b) => a - b);
    return { n: s.length, p50: Math.round(s[s.length >> 1]), p95: Math.round(s[Math.floor(s.length * 0.95)]), max: Math.round(s[s.length - 1]), geo: G.engine.renderer.info.memory.geometries };
  }, staged);
  await burst(true); await sleep(page, 1500); // (warm-up)
  const tapB = await burst(false); await sleep(page, 1500);
  const chgB = await burst(true); await sleep(page, 1500);
  const chgB2 = await burst(true);
  console.log('perf burst (frame ms): tapped', JSON.stringify(tapB), '· charged Ⅲ', JSON.stringify(chgB), JSON.stringify(chgB2));
  R.check(`perf: a burst of Poe's fully charged Ⅲ releases frames like the tapped burst (p95 ${chgB.p95} vs ${tapB.p95} ms, max ${chgB.max} ms); geometries plateau (${chgB.geo} → ${chgB2.geo})`, chgB.p95 <= Math.max(40, tapB.p95 * 1.6) && chgB.max < 250 && chgB2.geo <= chgB.geo + 40, JSON.stringify({ tapB, chgB, chgB2 }));
} catch (e) { errors.push('[harness] ' + e.stack); }
const failed = R.finish(errors, warns);
await browser.close();
process.exit(failed ? 1 : 0);
