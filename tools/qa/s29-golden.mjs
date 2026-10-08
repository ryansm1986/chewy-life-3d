// Scenario 29: Foosy the dragoon, the fifth hero (docs/GOLDEN.md).
//  a) his joining scene at the Onsen: he stands guard by the big hot spring, very straight, the lance upright; walk up and
//     he turns, salutes and begins his vow; a tennis ball bounces out of the bathhouse, the lance drops and he fetches it,
//     sits with it and finishes the vow; the talk; the gift: Shadow in the whelp outfit (while Foosy isn't the one played),
//     a wobbly first flap, a squeak of a roar, a loop; he joins, bows and trots off; the outfit comes off; back in town he
//     lives at home, four heroes on the bench
//  b) leaving mid-scene resets it (no actor, no ball, no lance on the ground, Shadow undressed) and it starts again on the
//     next visit; an old save (Floofy joined, him not) gets Shadow's rumour in town, once
//  c) the "Meet <name>" guide (?tut): hold Tab → the wheel with five, his card, a pick by key; the lance, the javelin,
//     Shadow the whelp taking off (keyed on his flight state), the trees; done
//  d) playing him: every active skill tapped in a Burrow fight lands its hits with no errors (Shadow breathes, swoops,
//     shields, roars, grows); a real hold on Sunbeam Thrust charges past Stage Ⅰ and releases the Noonday Thrust
//  e) perf: a burst of his fully charged releases frames like the tapped burst; GPU geometries plateau
// SHOTS=1 saves the scene beats and the guide steps to tools/qa/tmp/s29/. PART=a … picks parts.
import { launch, boot, waitMode, sleep, makeReport, drainDialogue } from './lib.mjs';
import fs from 'node:fs';
import { CLASSES } from '../../src/rpg/classes.js';

const R = makeReport('S29 Foosy: joining at the Onsen, the rumour, the Meet guide, every skill, a real charge, perf');
const { browser, page, errors, warns } = await launch({ w: 1280, h: 720 });
const ev = (f, a) => page.evaluate(f, a);
const SHOTS = !!process.env.SHOTS, OUT = 'tools/qa/tmp/s29', PART = process.env.PART || 'abcde';
if (SHOTS) fs.mkdirSync(OUT, { recursive: true });
const shot = async name => { if (SHOTS) await page.screenshot({ path: `${OUT}/${name}.png` }); };
const quiet = () => ev(() => { const G = window.G; G.sim.tickT = -1e9; clearInterval(window.__freeze); window.__freeze = setInterval(() => { G.sim.tickT = -1e9; }, 200); G.state.flags.hints = { ...(G.state.flags.hints || {}), garden: 1, build: 1, travel: 1, skills: 1, stats: 1, loot: 1, potion: 1, fight: 1 }; });
const stzIn = () => ev(() => { const G = window.G; for (const id of ['moka', 'poe', 'shihtzu']) { G.state.flags[`${id}Joined`] = true; const v = G.heroes.villagers[id]; if (v) { v.frozen = false; v.waitingToJoin = false; } } });
const toOnsen = async () => {
  await ev(() => { const G = window.G; G.state.player.lvl = 20; G.actions.recompute(); G.state.flags.burrowTut = true; G.enterRegion('onsen'); });
  await waitMode(page, 'dungeon'); await sleep(page, 600);
  await ev(() => { for (const m of window.G.dungeon.monsters) { m.pos.set(-500, 0, -500); m.aggro = false; } }); // (a quiet spa)
};
const J = () => ev(() => {
  const G = window.G, S = G.heroes.gldJoin, P = G.player, k = S.knight, sh = G.companion;
  return { state: S.state, vis: !!k?.visible, act: k?.anim.action?.name || null, d: k ? Math.round(Math.hypot(k.pos.x - P.pos.x, k.pos.z - P.pos.z) * 10) / 10 : -1, spring: k ? Math.round(Math.hypot(k.pos.x - 55.5, k.pos.z - 64.5) * 10) / 10 : -1,
    knight: !!k, ball: !!S.ball, held: !!S.ballState?.held, groundLance: !!S.groundLance, lanceUp: !!k && !k.lanceThrown && !!k.lance, whelp: !!sh?.whelp?.on, forced: sh?.whelp?.forced ?? null, lift: +(sh?.whelp?.lift || 0).toFixed(2), joined: !!G.state.flags.goldenJoined, hero: G.state.activeHero };
});
/** where the beat's actors sit on screen (0..1 across, 0..1 down; heads at +1.2 m): him, you, Shadow, the ball */
const onScreen = () => ev(() => {
  const G = window.G, S = G.heroes.gldJoin, cam = G.engine.camera, k = S.knight, P = G.player, sh = G.companion;
  const at = (p, y) => { const v = p.clone(); v.y += y; v.project(cam); return [+((v.x + 1) / 2).toFixed(2), +((1 - v.y) / 2).toFixed(2)]; };
  const r = { k: k ? at(k.pos, 1.2) : null, kf: k ? at(k.pos, 0) : null, p: at(P.pos, 1.2), pf: at(P.pos, 0), dist: +G.engine.rig.dist.toFixed(1) };
  if (S.ball && S.beat === 'fetch') r.ball = at(S.ball.position, 0);
  if (sh?.whelp?.forced || sh?.hold?.gld) r.sh = at(sh.pos, (sh.whelp?.lift || 0) + 0.6);
  return r;
});
const framed = f => Object.entries(f).every(([key, v]) => key === 'dist' || !v || (v[0] > 0.12 && v[0] < 0.88 && v[1] > 0.08 && v[1] < 0.8));
/** answer the scene's dialogues (between them the ball and the gift play) until it's done */
const drainScene = async picks => {
  const chosen = [];
  for (let i = 0; i < 14; i++) {
    if (await ev(() => window.__scene.includes('done'))) break;
    await page.waitForFunction(() => window.G.ui.dlg?.active || window.__scene.includes('done'), null, { timeout: 12000 }).catch(() => {});
    chosen.push(...await drainDialogue(page, picks));
  }
  return chosen;
};
const approach = () => ev(() => { const S = window.G.heroes.gldJoin, P = window.G.player, k = S.knight, W = window.G.world; for (const da of [0, 0.5, -0.5, 1, -1, 1.5, -1.5, 2, -2, 2.5, -2.5]) { const x = k.pos.x + Math.sin(k.facing + da) * 3.6, z = k.pos.z + Math.cos(k.facing + da) * 3.6; if (W.walkable(x, z) && !W.collision?.solidAt?.(x, z, 0.3) && (W.waterAt?.(x, z) || 0) < 0.05) { P.setPos(x, z); return true; } } P.setPos(k.pos.x + 3, k.pos.z); return false; });
try {
  const name = CLASSES.golden.name;
  if (PART.includes('a')) { // ================================================================ a) the joining scene
    await boot(page, 'fresh&nointro&notut'); await quiet(); await stzIn();
    await ev(() => { window.__scene = []; window.G.events.on('golden:joinScene', p => window.__scene.push(p.phase)); });
    await toOnsen();
    const a0 = await J();
    await page.waitForFunction(() => window.G.heroes.gldJoin.state === 'guard', null, { timeout: 20000 }).catch(() => {});
    const a1 = { ...await J(), staged: await ev(() => { const st = window.G.heroes.gldJoin.stg; return st ? { clear: st.clear, ball: !!st.ball } : null; }) };
    await ev(() => { const S = window.G.heroes.gldJoin, P = window.G.player, k = S.knight; const W = window.G.world, ok = (x, z) => W.walkable(x, z) && !W.collision?.solidAt?.(x, z, 0.3) && (W.waterAt?.(x, z) || 0) < 0.05 && [[55.5, 64.5, 2.5], [59.5, 60.2, 1.5], [52.2, 67.6, 1.3]].every(([sx, sz, r]) => Math.hypot(x - sx, z - sz) > r + 3) && !S.screened(x, z); /* (on his way in: 6-7 m off, in the open, out of the steam) */ outer: for (const r of [6.5, 7.5, 5.8]) for (let i = 0; i < 16; i++) { const a = k.facing + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.35, x = k.pos.x + Math.sin(a) * r, z = k.pos.z + Math.cos(a) * r; if (ok(x, z)) { P.setPos(x, z); P.faceTo(k.pos.x, k.pos.z); break outer; } } S.dropOcc(); /* (on his way in, past your mark: the staging's line) */ window.G.introFocus = P.pos.clone().lerp(k.pos, 0.5); const R2 = window.G.engine.rig; R2.focus.copy(window.G.introFocus); R2.snap(); });
    await sleep(page, 900); await shot('1-guard'); await ev(() => { window.G.introFocus = null; });
    R.check('at the Onsen he stands guard by the big hot spring, at attention, the lance upright in his paw (hidden until then); the scene staged in plain view of the camera (his post, your mark, the spots for Shadow and the ball)', a0.state === 'wait' && a1.state === 'guard' && a1.vis && a1.act === 'gldAttention' && a1.spring < 5 && a1.lanceUp && a1.staged?.clear && a1.staged.ball, JSON.stringify({ a0, a1 }));
    await approach();
    await page.waitForFunction(() => window.G.ui.dlg?.active, null, { timeout: 12000 }).catch(() => {});
    const a2 = await ev(() => ({ speaker: window.G.ui.dlg?.opts?.speaker, text: (window.G.ui.dlg?.lines || []).map(l => l.text || l).join(' '), locked: window.G.player.controlLocked, act: window.G.heroes.gldJoin.knight?.anim.action?.name, scene: window.__scene.slice() }));
    await sleep(page, 700); const f2 = await onScreen(); await shot('2-vow');
    R.check(`walk up: you walk to your mark, he turns, salutes and begins his vow (${name} speaking, "Halt!…", controls locked, the camera framing you both)`, a2.speaker === name && /Halt!/.test(a2.text) && /against all—/.test(a2.text) && a2.locked && a2.act === 'gldSalute' && a2.scene.includes('vow') && framed(f2), JSON.stringify({ ...a2, f2 }));
    await drainDialogue(page, []);
    await page.waitForFunction(() => window.G.heroes.gldJoin.groundLance, null, { timeout: 6000 }).catch(() => {});
    await sleep(page, 150); await shot('3-ball');
    const a3 = await J();
    await page.waitForFunction(() => window.G.heroes.gldJoin.ballState?.held, null, { timeout: 8000 }).catch(() => {});
    await sleep(page, 200); const f4 = await onScreen(); await shot('4-fetch');
    const a4 = await J();
    R.check('a tennis ball bounces out of the bathhouse: the lance drops (on the ground, not in his paw) and he fetches the ball in his mouth (him, you and the ball in frame)', a3.ball && a3.groundLance && !a3.lanceUp && a4.held && framed(f4), JSON.stringify({ a3, a4, f4 }));
    await page.waitForFunction(() => window.G.ui.dlg?.active, null, { timeout: 10000 }).catch(() => {});
    const a5 = await ev(() => ({ text: (window.G.ui.dlg?.lines || []).map(l => l.text || l).join(' '), act: window.G.heroes.gldJoin.knight?.anim.action?.name }));
    await shot('5-sit');
    R.check('back at his post he sits with it, very pleased, and finishes the vow: "—against all comers. …Is this yours?"', a5.act === 'gldSitProud' && /against all comers/.test(a5.text) && /Is this yours/.test(a5.text), JSON.stringify(a5));
    const giftShot = page.waitForFunction(() => window.G.companion.whelp.on && window.G.heroes.gldJoin.state === 'talk', null, { timeout: 40000, polling: 'raf' }).then(async () => { await sleep(page, 900); await shot('6a-gift-dressed'); return J(); }).catch(() => null);
    const loopShot = page.waitForFunction(() => window.G.companion.whelp.on && window.G.companion.whelp.lift > 1, null, { timeout: 45000, polling: 'raf' }).then(async () => { const j = await J(); await sleep(page, 700); await shot('6b-gift-loop'); return j; }).catch(() => null);
    const picked = await drainScene([0, 0, 1]);
    const ag = await giftShot, al = await loopShot;
    R.check('the gift: Shadow wears the whelp outfit though Foosy isn\'t the one played (a poof), takes his first flaps and loops round them', !!ag?.whelp && ag.forced === true && ag.hero !== 'golden' && !!al && al.lift >= 1, JSON.stringify({ ag, al }));
    await page.waitForFunction(() => window.__scene.includes('done'), null, { timeout: 15000 }).catch(() => {});
    await sleep(page, 1500); await shot('7-joined');
    const a6 = await ev(() => { const G = window.G, S = G.heroes.gldJoin; return { joined: !!G.state.flags.goldenJoined, lvl: G.state.heroes.golden.player.lvl, locked: G.player.controlLocked, knight: !!S.knight, state: S.state, scene: window.__scene.slice(), whelp: G.companion.whelp.on, forced: G.companion.whelp.forced, roster: G.heroes.roster().map(h => h.id + (h.joined ? '+' : '-')).join(' ') }; });
    R.check('he joins (near the pack\'s level), bows and trots off; controls back; Shadow\'s outfit comes off (kept for when Foosy is played)', a6.joined && a6.lvl >= 5 && !a6.locked && !a6.knight && ['done', 'off'].includes(a6.state) && a6.scene.includes('leave') && !a6.whelp && a6.forced == null && /golden\+/.test(a6.roster) && picked.length >= 2, JSON.stringify({ a6, picked }));
    await ev(() => window.G.returnToVillage()); await waitMode(page, 'village'); await sleep(page, 1200);
    const a7 = await ev(() => { const G = window.G, v = G.heroes.villagers.golden, h = G.heroes.homeSpot('golden'); return { v: !!v, near: v ? Math.round(Math.hypot(v.pos.x - h.x, v.pos.z - h.z)) : -1, bench: G.heroes.bench(), lance: !!v?.rig?.parts?.lance, ball: !!G.heroes.gldJoin.ball }; });
    R.check('back in town he lives at the cottage (a villager, his lance on his back), four heroes on the bench; nothing of the scene left', a7.v && a7.near < 12 && a7.bench.length === 4 && a7.lance && !a7.ball, JSON.stringify(a7));
  }
  if (PART.includes('b')) { // ================================================================ b) a reset mid-scene; an old save's rumour
    await boot(page, 'fresh&nointro&notut'); await quiet(); await stzIn();
    await ev(() => { window.__scene = []; window.G.events.on('golden:joinScene', p => window.__scene.push(p.phase)); });
    await toOnsen();
    await page.waitForFunction(() => window.G.heroes.gldJoin.state === 'guard', null, { timeout: 20000 }).catch(() => {});
    await ev(() => window.G.returnToVillage()); await waitMode(page, 'village'); await sleep(page, 600);
    const b0 = await J();
    await toOnsen(); const b1 = await J();
    R.check('leaving the Onsen mid-scene resets it (no knight, no ball, no lance on the ground, Shadow undressed); the next visit starts it again', b0.state === 'off' && !b0.knight && !b0.ball && !b0.groundLance && !b0.whelp && !b0.joined && b1.state === 'wait', JSON.stringify({ b0, b1 }));
    await ev(() => window.G.returnToVillage()); await waitMode(page, 'village'); await sleep(page, 400);
    await ev(() => { // an old save from before Foosy: Floofy joined, no heroes.golden at all
      const G = window.G; G.save(); const s = JSON.parse(localStorage.getItem('chewy3d.save'));
      delete s.heroes.golden; delete s.flags.goldenJoined; if (s.flags.hints) delete s.flags.hints.gldRumour; for (const id of ['moka', 'poe', 'shihtzu']) s.flags[`${id}Joined`] = true;
      window.__ignoreSave = true; localStorage.setItem('chewy3d.save', JSON.stringify(s)); removeEventListener('beforeunload', G.save); G.save = () => {};
    });
    await boot(page, 'notitle&notut'); await quiet();
    const bOld = await ev(() => { const G = window.G, st = G.state; return { lvl: st.heroes.golden?.player?.lvl, joined: !!st.flags.goldenJoined, v: !!G.heroes.villagers.golden, bench: G.heroes.bench().join() }; });
    R.check('an old save (Floofy joined, no Foosy in it) loads with him new and not joined: no villager, three heroes on the bench', bOld.lvl === 1 && !bOld.joined && !bOld.v && bOld.bench === 'moka,poe,shihtzu', JSON.stringify(bOld));
    await ev(() => { delete window.G.state.flags.hints.gldRumour; window.G.heroes.gldJoin.hintT = 0; });
    await page.waitForFunction(() => window.G.state.flags.hints?.gldRumour, null, { timeout: 30000 }).catch(() => {});
    await sleep(page, 300); await shot('8-rumour');
    const b3 = await ev(() => ({ rumour: !!window.G.state.flags.hints?.gldRumour }));
    R.check('in town (Floofy joined, him not): Shadow passes on the rumour about the knight guarding the hot springs, once', b3.rumour, JSON.stringify(b3));
  }
  if (PART.includes('c')) { // ================================================================ c) the Meet guide
    await boot(page, 'fresh&nointro&tut&hour=11'); await quiet(); await stzIn();
    await ev(() => { const G = window.G, T = (G.state.flags.tutorials ||= {}); for (const id of ['house', 'switch', 'fishing', 'makeHome', 'remodel', 'charge', 'meetPoe', 'meetShihtzu']) T[id] = { done: true }; G.heroes.spawnBench(); G.heroes.joinGolden(); });
    await page.waitForFunction(() => window.G.tutorials.cur?.id === 'meetGolden', null, { timeout: 25000 }).catch(() => {});
    await sleep(page, 900); await shot('g1-hold');
    const c0 = await ev(() => ({ id: window.G.tutorials.cur?.id, step: window.G.tutorials.cur?.step?.id, title: window.G.tutorials.cur?.guide?.title }));
    await ev(() => { window.G.heroes.cd = 0; });
    await page.keyboard.down('Tab'); await page.waitForFunction(() => window.G.heroes.wheelOpen, null, { timeout: 4000 }).catch(() => {});
    await sleep(page, 400); await shot('g2-wheel');
    const wheel = await ev(() => ({ golden: !!document.querySelector('.hero-wheel .hw-card[data-id="golden"]'), cards: document.querySelectorAll('.hero-wheel .hw-card').length }));
    await page.keyboard.press('5'); await page.keyboard.up('Tab');
    await page.waitForFunction(() => window.G.tutorials.cur?.step?.id === 'lance', null, { timeout: 15000 }).catch(() => {});
    await page.waitForFunction(() => !window.G.heroSwitching, null, { timeout: 12000 }).catch(() => {});
    await sleep(page, 700); await shot('g3-lance');
    const c1 = await ev(() => ({ step: window.G.tutorials.cur?.step?.id, hero: window.G.state.activeHero }));
    const steps = [];
    for (let i = 0; i < 6; i++) {
      const st = await ev(() => window.G.tutorials.cur?.step?.id || null); if (!st) break;
      steps.push(st); if (i) await shot(`g${3 + i}-${st}`);
      if (st === 'whelp') { // (keyed on his flight: walk a little and Shadow takes off beside you)
        await ev(() => { const P = window.G.player, { r } = window.G.engine.rig.groundAxes(); P.moveTarget = P.pos.clone().addScaledVector(r, 5); });
        await page.waitForFunction(s => window.G.tutorials.cur?.step?.id !== s, st, { timeout: 15000 }).catch(() => {});
        continue;
      }
      await sleep(page, 700); await ev(() => document.querySelector('.tut .to-ack, .tut [data-act="ack"], .tut .ack')?.click()); await ev(() => window.G.tutorials.ack?.());
      await page.waitForFunction(s => window.G.tutorials.cur?.step?.id !== s, st, { timeout: 4000 }).catch(() => {});
    }
    await sleep(page, 600);
    const c2 = await ev(() => ({ cur: window.G.tutorials.cur?.id || null, rec: window.G.state.flags.tutorials?.meetGolden, whelp: window.G.companion.whelp.on }));
    R.check(`the "Meet ${name}" guide: hold Tab → the wheel with five, his card, a pick by key; the lance, the javelin, Shadow the whelp taking off, the trees; done`, c0.id === 'meetGolden' && c0.title === `Meet ${name}` && c0.step === 'hold' && wheel.golden && wheel.cards === 5 && c1.step === 'lance' && c1.hero === 'golden' && steps.join() === 'lance,javelin,whelp,wrap' && !c2.cur && c2.rec?.done && c2.whelp, JSON.stringify({ c0, wheel, c1, steps, c2 }));
  }
  if (PART.includes('d')) { // ================================================================ d) every skill tapped; a real charge
    await boot(page, 'fresh&nointro&notut&hero=golden'); await ev(() => { window.G.state.flags.burrowTut = true; window.G.enterDungeon(3); }); await waitMode(page, 'dungeon'); await sleep(page, 1200);
    const ids = await ev(async () => {
      const G = window.G, P = G.state.player, { SKILLS } = await import('/src/rpg/skills.js');
      P.lvl = 30; P.stats = { str: 120, dex: 60, vit: 300, ene: 160 };
      for (const id of Object.keys(SKILLS)) if (SKILLS[id].cls === 'golden') P.skills[id] = 10;
      G.actions.recompute(); G.actions.restoreAll();
      const raw = G.combat.hitMonster.bind(G.combat); window.__hits = 0; G.combat.hitMonster = (m, o) => { window.__hits++; return raw(m, o); };
      return Object.keys(SKILLS).filter(id => SKILLS[id].cls === 'golden' && !['passive', 'aura'].includes(SKILLS[id].kind));
    });
    const res = [];
    for (const id of ids) {
      const r = await ev(id => {
        const G = window.G, P = G.player, sh = G.companion;
        G.skills.clearGolden(); G.skills.cds = {}; P.anim.stop(); G.actions.restoreAll(); if (sh) { sh.fainted = 0; sh.untargetable = false; sh.life = sh.lifeMax; }
        if (G.dungeon.monsters.filter(m => m.alive && !m.def.boss).length < 6) G.dungeon.summonAround({ pos: P.pos }, 'mochi', 6);
        const { r: rr } = G.engine.rig.groundAxes();
        G.dungeon.monsters.filter(m => m.alive && !m.def.boss).slice(0, 6).forEach((m, i) => { m.pos.set(P.pos.x + rr.x * (2.6 + i * 0.5) + (i % 2) * 0.6, 0, P.pos.z + rr.z * (2.6 + i * 0.5) - (i % 2) * 0.6); m.lifeMax = m.life = 1e7; m.status.stun = 99; m.speed = 0; });
        window.__hits = 0;
        const aim = P.pos.clone().addScaledVector(rr, 3), tgt = G.combat.nearest(aim, 'ally', 3);
        try { return { ok: G.skills.tryCast(id, aim, tgt) }; } catch (e) { return { threw: String(e.stack || e).slice(0, 300) }; }
      }, id);
      await sleep(page, ['starfallLance', 'sunshower', 'dragonHeart', 'wingShield', 'emberleafJavelin', 'divebombSwoop', 'emberBreath', 'mightyRoar', 'sunfallJump'].includes(id) ? 2600 : 1500);
      const extra = await ev(() => { const S = window.G.skills; return { big: !!S.gldBig, shield: !!S.gldShield, roar: !!window.G.combat.buffs.roar, grow: +(window.G.companion.anim.grow || 1).toFixed(2), lanceBack: !window.G.player.lanceThrown }; });
      res.push({ id, ...r, hits: await ev(() => window.__hits), ...extra });
    }
    const noHit = res.filter(r => !['wingShield', 'mightyRoar', 'dragonHeart'].includes(r.id) && !(r.hits > 0)).map(r => r.id), threw = res.filter(r => r.threw);
    const by = id => res.find(r => r.id === id) || {};
    const shows = by('dragonHeart').big && by('dragonHeart').grow > 2 && by('wingShield').shield && by('mightyRoar').roar && by('starfallLance').lanceBack;
    R.check(`playing him: every active skill (${ids.length}) casts in a Burrow fight, the damage skills land hits (Shadow's breath and swoop too), the shield, the roar and the big Shadow appear, the lance comes home, no errors`, ids.length === 15 && !threw.length && res.every(r => r.ok) && !noHit.length && shows, JSON.stringify({ noHit, threw: threw.map(t => t.id + ': ' + t.threw), casts: res.map(r => `${r.id}:${r.ok ? 'ok' : 'no'}/${r.hits}`).join(' ') }));
    const look = await ev(async () => { const G = window.G, P = G.player; for (let i = 0; i < 30 && !P.lance?.glb; i++) await new Promise(q => setTimeout(q, 100)); return { model: P.rig.model, lance: !!P.lance?.glb, wt: G.derived.weaponType, whelp: G.companion.whelp.on }; });
    R.check('he is the baked Toybox Foosy (golden_toy) with the Blender lance, and Shadow is the whelp', look.model === 'golden_toy' && look.lance && look.wt === 'lance' && look.whelp, JSON.stringify(look));
    // a real hold on right-click (Sunbeam Thrust)
    const xy = await ev(() => {
      const G = window.G, P = G.player, st = G.state.player; G.skills.clearGolden(); G.skills.cds = {}; P.anim.stop(); G.actions.restoreAll();
      st.hotbar[1] = 'sunbeamThrust'; st.chargePerks = { sunbeamThrust: { stages: 2 } };
      window.__rel = []; G.events.on('charge:release', p => window.__rel.push(p));
      const { r } = G.engine.rig.groundAxes(), p = P.pos.clone().addScaledVector(r, 2.5), v = p.project(G.engine.camera);
      return [(v.x * 0.5 + 0.5) * innerWidth, (-v.y * 0.5 + 0.5) * innerHeight];
    });
    await page.mouse.move(xy[0], xy[1]); await sleep(page, 150);
    await page.mouse.down({ button: 'right' });
    await page.waitForFunction(() => (window.G.skills.charge.active?.stage || 0) >= 2, null, { timeout: 6000 }).catch(() => {});
    const d0 = await ev(() => ({ stage: window.G.skills.charge.active?.stage || 0, pose: window.G.player.anim.action?.style || window.G.player.anim.action?.name }));
    await page.mouse.up({ button: 'right' });
    await page.waitForFunction(() => window.G.player.anim.action?.name === 'sunbeamThrust', null, { timeout: 3000 }).catch(() => {});
    const d1 = await ev(() => ({ rel: window.__rel.slice(-1)[0] || null, act: window.G.player.anim.action?.name }));
    R.check('a real hold on Sunbeam Thrust: crouched over the lance drawn back (gldThrust pose) to Stage Ⅱ, and the release thrusts the Noonday Thrust', d0.stage >= 2 && d0.pose === 'gldThrust' && d1.rel?.stage >= 2 && d1.rel.ok && d1.act === 'sunbeamThrust', JSON.stringify({ d0, d1 }));
  }
  if (PART.includes('e')) { // ================================================================ e) perf
    const burst = staged => ev(async staged => {
      const G = window.G, P = G.player, pl = G.state.player, { CHARGE } = await import('/src/rpg/charge.js');
      pl.stats.ene = 900; pl.chargePerks = {}; for (const id of ['sunbeamThrust', 'sunfallJump', 'pinwheelSweep', 'tailwagVolley', 'emberleafJavelin', 'emberBreath']) pl.chargePerks[id] = Object.fromEntries(Object.entries(CHARGE[id].perks).map(([k, p]) => [k, p.ranks]));
      G.actions.recompute(); G.actions.restoreAll(); G.skills.clearGolden();
      const ms = G.dungeon.monsters.filter(m => m.alive && !m.def.boss);
      if (ms.length < 14) G.dungeon.summonAround({ pos: P.pos }, 'mochi', 14 - ms.length);
      const all = G.dungeon.monsters.filter(m => m.alive && !m.def.boss).slice(0, 16);
      all.forEach((m, i) => { const a = i / all.length * Math.PI * 2, r = 2.5 + (i % 3); m.pos.set(P.pos.x + Math.cos(a) * r, 0, P.pos.z + Math.sin(a) * r); m.lifeMax = m.life = 1e7; m.status.stun = 99; });
      const dts = []; let last = performance.now(), on = true;
      (function f() { const n = performance.now(); dts.push(n - last); last = n; if (on) requestAnimationFrame(f); })();
      const c = staged ? { stage: 3, t: 2 } : undefined, at = all[0].pos.clone();
      const go = id => { G.skills.cds = {}; P.anim.stop(); G.actions.restoreAll(); G.skills.tryCast(id, at, all[0], c); };
      for (const id of ['emberBreath', 'sunbeamThrust', 'tailwagVolley', 'pinwheelSweep', 'emberleafJavelin', 'sunfallJump']) { go(id); await new Promise(r => setTimeout(r, 450)); }
      await new Promise(r => setTimeout(r, 2400)); on = false;
      const s = dts.slice(2).sort((a, b) => a - b);
      return { n: s.length, p50: Math.round(s[s.length >> 1]), p95: Math.round(s[Math.floor(s.length * 0.95)]), max: Math.round(s[s.length - 1]), geo: G.engine.renderer.info.memory.geometries };
    }, staged);
    if (!PART.includes('d')) { await boot(page, 'fresh&nointro&notut&hero=golden'); await ev(() => { window.G.state.flags.burrowTut = true; window.G.enterDungeon(3); }); await waitMode(page, 'dungeon'); await sleep(page, 1200); await ev(async () => { const G = window.G, P = G.state.player, { SKILLS } = await import('/src/rpg/skills.js'); P.lvl = 30; for (const id of Object.keys(SKILLS)) if (SKILLS[id].cls === 'golden') P.skills[id] = 10; G.actions.recompute(); }); }
    await burst(true); await sleep(page, 1500); // (warm-up)
    const tapB = await burst(false); await sleep(page, 1500);
    const chgB = await burst(true); await sleep(page, 1500);
    const chgB2 = await burst(true);
    console.log('perf burst (frame ms): tapped', JSON.stringify(tapB), '· charged Ⅲ', JSON.stringify(chgB), JSON.stringify(chgB2));
    R.check(`perf: a burst of his fully charged Ⅲ releases frames like the tapped burst (p95 ${chgB.p95} vs ${tapB.p95} ms, max ${chgB.max} ms); geometries plateau (${chgB.geo} → ${chgB2.geo})`, chgB.p95 <= Math.max(40, tapB.p95 * 1.6) && chgB.max < 250 && chgB2.geo <= chgB.geo + 40, JSON.stringify({ tapB, chgB, chgB2 }));
  }
} catch (e) { errors.push('[harness] ' + e.stack); }
const failed = R.finish(errors, warns);
await browser.close();
process.exit(failed ? 1 : 0);
