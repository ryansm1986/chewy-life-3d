// The look review for the heroes' arrivals in Blossom Hollow (ROADMAP Z-H3): each beat of an arrival scene at the game
// camera, on the desktop (1920×1080), the Deck (1280×800, the Deck preset), a phone (844×390, touch) and an iPad
// (1180×820, touch), by day and at dusk; then the quest card. Contact sheets per device and hour with tools/qa/sheet.py.
// Poe (she tails you round the plaza), Floofy (lanterns on the Shrine Road), Stella (Captain Kaizo's boat on the beach, her
// in its bow: docs/STELLA.md §6), Foosy (on guard by the fountain); for the last three you come up to them from 5-7 m off
// (Stella: 7 m, across the screen: she floats down when you're within 6), them on screen. night: 22:30.
//   node tools/qa/arrival-shots.mjs [poe shihtzu stella golden] [desktop deck phone ipad] [day dusk night] [saved] [kaizo]
//     (kaizo: Stella's arrival on an old save with Captain Kaizo's quest running)
//     → tools/qa/tmp/arrivals/   (saved: their village saved before they came: the thank-you)
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { launch, boot, sleep, drainDialogue } from './lib.mjs';
import { launchTouch, PHONE, IPAD } from './touch-lib.mjs';

const args = process.argv.slice(2);
const pick = (all, def = all) => { const a = all.filter(x => args.includes(x)); return a.length ? a : def; };
const WHO = pick(['poe', 'shihtzu', 'stella', 'golden']), DEVS = pick(['desktop', 'deck', 'phone', 'ipad']), HOURS = pick(['day', 'dusk', 'night'], ['day', 'dusk']);
const OUT = path.resolve('tools/qa/tmp/arrivals'); fs.mkdirSync(OUT, { recursive: true });
const HOUR = { day: 11, dusk: 18.2, night: 22.5 }, SAVED = args.includes('saved'), KAIZO = args.includes('kaizo');
let bad = 0;
// ------------------------------------------------------------------ Floofy, Stella, Foosy
// beats: a dialogue line (re) → a frame; mid: a moment in the scene (a test on its state, run in the page) → a frame
const SC = {
  shihtzu: { key: 'stzJoin', show: 'kneel', ev: 'shihtzu:joinScene', lvl: 11, zone: 'maple', before: [],
    beats: [[/fr—/, '2-halt', 'Halt, traveller. …Few return fr—'], [/Strawgrin|already lifted/, '4-plea', 'his plea for Akane (or the thank-you)']],
    mid: [["S.knight?.anim.action?.name === 'stzLicked'", '3-lick', '*slurp*: the ghost pup licks him'], ["window.__ph.includes('snuff')", '5-snuff', 'the lanterns snuffed into his tome']] },
  stella: { key: 'stlJoin', show: 'land', ev: 'stella:joinScene', lvl: 18, zone: 'tidepool', before: ['shihtzu'], near: [6.6, 7.2, 8, 9],
    beats: [[/Good morning/, '3-hello', '"Good morning. You must be…"'], [/Brineclaw|chased the crabs|crabs went back|Captain Kaizo told me|before I'd even met you/, 'a-plea', 'her plea for Shiokaze Port (or the thank-you)'], [/put the kettle on/, 'b-kettle', 'Kaizo: "I\'ll row on ahead…"']],
    mid: [["S.state === 'float' && !!S.stella?.lift && S.stella.pos.y - window.G.world.heightAt(S.stella.pos.x, S.stella.pos.z) > 0.45", '2-float', 'off the bow: the wagasa catches the air'],
      ["!!S.bowing && S.stella?.anim.action?.name === 'stlGreet'", '4-bow', 'the dawn greeting; Shadow copies her: a play-bow'],
      ["S.stella?.anim.action?.name === 'stlPeek'", '5-peek', 'she peeks: a play-bow is an invitation'],
      ["S.state === 'zoomies' && S.zoomU > 0.3", '6-zoomies', 'the zoomies: Shadow chasing her'],
      ["S.state === 'zoomies' && S.zoomU > 0.72", '7-zoomies2', 'the second loop'],
      ["S.stella?.anim.action?.name === 'stlComposed'", '8-ahem', '"…Ahem. The sun is greeted."'],
      ["S.stella?.anim.action?.name === 'stlTouch' && S.stella.anim.action.t > 0.35", '9-touch', 'the warmth: a little morning light on Shadow'],
      ["S.kaizo?.anim.action?.name === 'sit' && !!S.boat && Math.hypot(S.boat.position.x - S.boatAt.x, S.boat.position.z - S.boatAt.z) > 2.5", 'c-row', 'Kaizo rows home, she waves him off'],
      ["S.state === 'leave' && !S.boat && S.stella?.anim.action?.name === 'stlFloat'", 'd-burst', 'a soft burst of light, and she\'s gone']] },
  golden: { key: 'gldJoin', show: 'guard', ev: 'golden:joinScene', lvl: 26, zone: 'onsen', before: ['shihtzu', 'stella'],
    beats: [[/against all—/, '2-vow', 'the vow: "…against all—"'], [/against all comers/, '4-ball', '"Is this yours?"'], [/besieged|broken the siege/, '6-plea', 'his plea for Yukimi (or the thank-you)']],
    mid: [['!!S.ballState?.held', '3-fetch', 'the ball! (fetch)'], ["!!window.G.companion.whelp?.on && S.beat === 'loop'", '5-whelp', 'Shadow the dragon: the loop']] },
};
// the arrivals before each (done): who joined, their zone, their quest
const PREV = { shihtzu: ['shihtzu', 'maple', 'hq_akane'], stella: ['stella', 'tidepool', 'hq_shiokaze'] };
async function other(who, { page, ev, until, shot, next }) {
  const C = SC[who];
  await ev(({ who, C, PREV, saved, kaizo }) => {
    const G = window.G, F = G.state.flags; G.sim.tickT = -1e9; setInterval(() => { G.sim.tickT = -1e9; }, 200);
    G.state.quests.active = G.state.quests.active.filter(q => q.id !== 'welcome'); G.state.quests.cards = [];
    F.hints = { travel: 1, scavDig: 1, dig: 1, garden: 1, build: 1, sprint: 1, skills: 1, stats: 1, loot: 1, potion: 1, fight: 1, stzRumour: 1, gldRumour: 1 };
    F.mokaJoined = true; const v = G.heroes.villagers.moka; if (v) { v.frozen = false; v.waitingToJoin = false; }
    F.poeJoined = true; F.arrivals = { bamboo: { how: 'scene', quest: 'start', day: 1 } }; G.state.quests.done.push('hq_takemori');
    for (const w of C.before) { const [h, z, q] = PREV[w]; if (h) F[h + 'Joined'] = true; F.arrivals[z] = { how: 'scene', quest: 'start', day: 1 }; G.state.quests.done.push(q); }
    if (saved) { G.state.zones ||= {}; G.state.zones[C.zone] = { ...(G.state.zones[C.zone] || {}), village: 'saved', savedBy: 'hero' }; }
    if (kaizo && who === 'stella') { F.arrivals.tidepool = { how: 'scene', quest: 'start', day: 1 }; G.state.quests.active.push({ id: 'hq_shiokaze', step: 0, prog: 0 }); } // (an old save: Kaizo's quest running)
    G.state.player.lvl = C.lvl; G.actions.recompute(); if (G.day) G.day.paused = true; G.heroes.spawnBench?.();
    window.__ph = []; G.events.on(C.ev, p => window.__ph.push(p.phase));
  }, { who, C: { before: C.before, lvl: C.lvl, zone: C.zone, ev: C.ev }, PREV, saved: SAVED, kaizo: KAIZO });
  await until(([k, s]) => window.G.heroes[k].state === s, [C.key, C.show], 90000);
  // you come up to them: 5-7 m off, on the paving if it can be, them on screen and in the clear from there
  await ev(([k, near]) => {
    const G = window.G, J = G.heroes[k], a = J.knight || J.stella || J.kaizo, P = G.player, W = G.world, cam = G.engine.camera, rig = G.engine.rig, V = J.view, v = new G.THREE.Vector3();
    const tries = [];
    // (5-7 m off: at the game camera's distance a figure much further up-screen of you is off the top of the frame)
    for (const r of near || [6.2, 5.6, 6.8, 5.2]) for (let i = 0; i < 24; i++) { const t = i / 24 * Math.PI * 2, x = a.pos.x + Math.sin(t) * r, z = a.pos.z + Math.cos(t) * r; if (W.walkable(x, z) === false || W.collision?.solidAt?.(x, z, 0.35)) continue; const tl = W.terrain?.tile?.(x, z); tries.push({ x, z, s: (tl === 1 || tl === 2 || tl === 4 ? 0 : 2) + Math.abs(r - (near?.[0] || 6.2)) * 0.3 + (near ? Math.abs(Math.cos(t) * Math.cos(rig.yaw) + Math.sin(t) * Math.sin(rig.yaw)) * 1.5 : 0) }); } // (Stella: from across the screen, her and the boat in the same row as you)
    if (J.far === false) J.far = true; // (Foosy: you've come up to him)
    tries.sort((p, q) => p.s - q.s);
    let first = null; // (nothing fully clear: the first that has them on screen)
    for (const c of [...tries, null]) {
      if (!c) { if (first) { P.setPos(first.x, first.z); P.faceTo(a.pos.x, a.pos.z); G.companion?.setPos?.(first.x + 0.6, first.z + 0.4); } return; }
      P.setPos(c.x, c.z); rig.focus?.copy?.(P.pos); rig.snap?.(); cam.updateMatrixWorld(); v.set(a.pos.x, a.pos.y + 0.8, a.pos.z).project(cam);
      if (!first && Math.abs(v.x) < 0.75 && v.y > -0.5 && v.y < 0.72) first = c;
      if (Math.abs(v.x) < 0.75 && v.y > -0.5 && v.y < 0.72 && !(V?.occ && (V.screened(a.pos.x, a.pos.z, [0.4, 0.9], 0.2, cam.position) || (V.covers(c.x, c.z) && V.screened(c.x, c.z, [0.5, 1.1], 0.2, cam.position))))) { P.faceTo(a.pos.x, a.pos.z); G.companion?.setPos?.(c.x + 0.6, c.z + 0.4); return; } // (them and you in the clear)
    }
  }, [C.key, C.near || null]);
  await sleep(page, 2200); await shot('1-see', who === 'shihtzu' ? 'ghostlights on the Shrine Road' : who === 'stella' ? 'a boat on the beach, Stella in its bow' : 'on guard by the fountain');
  await ev(([k, s]) => { const G = window.G, J = G.heroes[k], a = J.knight || J.stella || J.kaizo; if (J.state === s) G.player.moveTarget = new G.THREE.Vector3(a.pos.x, 0, a.pos.z); }, [C.key, C.show]);
  const done = new Set();
  for (let i = 0; i < 500; i++) {
    for (const [test, n, l] of C.mid) if (!done.has(n) && await ev(([k, f]) => { const S = window.G.heroes[k]; try { return !!new Function('S', 'return (' + f + ');')(S); } catch (e) { return false; } }, [C.key, test])) { done.add(n); await sleep(page, 350); await shot(n, l); }
    const s = await ev(() => { const D = window.G.ui.dlg; return { a: !!D?.active, typing: !!D?.typing, c: !!(D?.active && D.choices?.length && D.i >= D.lines.length - 1), t: D?.active ? String(D.lines[D.i]?.text || D.lines[D.i] || '') : '' }; });
    if (s.a && !s.typing) for (const [re, n, l] of C.beats) if (!done.has(n) && re.test(s.t)) { done.add(n); await sleep(page, 350); await shot(n, l); }
    if (!s.a && await ev(() => window.__ph.includes('done'))) break;
    if (s.typing) { await next(); await sleep(page, 90); continue; }
    if (s.c) { await drainDialogue(page, [0], 1); await sleep(page, 200); continue; }
    if (s.a) { await next(); await sleep(page, 160); continue; }
    await sleep(page, 100);
  }
  await sleep(page, 200); await shot('z-after', who === 'stella' ? 'the beach is quiet again (then the banner)' : 'POOF! (then the banner)');
  await until(() => window.G.questMoments.open, null, 15000).catch(() => {}); await sleep(page, 700);
  await shot('zz-card', 'the quest card');
  await ev(() => window.G.ui.close('questCard'));
}
for (const who of WHO) for (const dev of DEVS) for (const hr of HOURS) {
  const touch = dev === 'phone' || dev === 'ipad';
  const S = touch ? await launchTouch(dev === 'phone' ? PHONE : IPAD) : await launch(dev === 'deck' ? { w: 1280, h: 800 } : { w: 1920, h: 1080 });
  const { browser, page, errors } = S, ev = (f, a) => page.evaluate(f, a), until = (f, a, t = 20000) => page.waitForFunction(f, a, { timeout: t });
  const list = [], tag = `${who}${KAIZO && who === 'stella' ? '-kaizo' : ''}-${dev}-${hr}`;
  const shot = async (n, label) => { const f = path.join(OUT, `${tag}-${n}.png`); await page.screenshot({ path: f }); list.push([f, label]); };
  const next = async () => { if (touch) await S.F.tap(dev === 'phone' ? 420 : 590, dev === 'phone' ? 110 : 160); else await page.keyboard.press('Enter'); };
  try {
    await boot(page, `fresh&nointro&notut&arrive&qcard&hour=${HOUR[hr]}${dev === 'deck' ? '&deck' : ''}`);
    if (who !== 'poe') await other(who, { page, ev, until, shot, next, touch, dev });
    else {
      await ev(() => { const G = window.G; G.sim.tickT = -1e9; setInterval(() => { G.sim.tickT = -1e9; }, 200); G.state.quests.active = G.state.quests.active.filter(q => q.id !== 'welcome'); G.state.quests.cards = []; G.state.flags.hints = { travel: 1, scavDig: 1, dig: 1, garden: 1, build: 1, sprint: 1 }; G.state.flags.mokaJoined = true; const v = G.heroes.villagers.moka; if (v) { v.frozen = false; v.waitingToJoin = false; } G.state.player.lvl = 4; G.actions.recompute(); if (G.day) G.day.paused = true; window.__ph = []; G.events.on('poe:joinScene', p => window.__ph.push(p.phase)); });
      await until(() => window.G.heroes.poeJoin.state === 'wait');
      const marks = [[-4, 7], [-8, 2], [-7, -5], [0, -7], [7, -5], [8, 2], [4, 7]];
      for (let k = 0; k < 21 && (await ev(() => window.G.heroes.poeJoin.state)) === 'wait'; k++) {
        await ev(([dx, dz]) => { const G = window.G, F = G.world.landmarks.fountain; G.player.moveTarget = new G.THREE.Vector3(F.x + dx, 0, F.z + dz); }, marks[k % 7]);
        await until(() => !window.G.player.moveTarget || window.G.heroes.poeJoin.state !== 'wait', null, 6000).catch(() => {});
      }
      for (let k = 0; k < 2; k++) { await ev(([dx, dz]) => { const G = window.G, F = G.world.landmarks.fountain; if (G.heroes.poeJoin.state === 'tail') G.player.moveTarget = new G.THREE.Vector3(F.x + dx, 0, F.z + dz); }, marks[(k + 3) % 7]); await until(() => !window.G.player.moveTarget, null, 6000).catch(() => {}); }
      await ev(() => { window.G.player.moveTarget = null; });
      await until(() => { const S = window.G.heroes.poeJoin; return S.state !== 'tail' || (S.poe && S.onScreen(S.poe.pos.x, S.poe.pos.y, S.poe.pos.z, 0.1) && S.poe.anim.action?.name === 'sneakWalk' && !(S.view?.occ && S.view.covers(S.poe.pos.x, S.poe.pos.z) && S.view.screened(S.poe.pos.x, S.poe.pos.z, [0.4, 0.8], 0.15))); }, null, 8000).catch(() => {});
      await shot('1-tail', 'she tails you round the plaza');
      await ev(() => { const S = window.G.heroes.poeJoin, P = window.G.player; if (S.state === 'tail') { P.faceTo(S.poe.pos.x, S.poe.pos.z); P.facing = P.faceTarget; } });
      await until(() => window.G.heroes.poeJoin.frozen, null, 3000).catch(() => {}); await sleep(page, 350);
      await shot('2-freeze', 'look her way: a lantern post');
      await ev(() => { const S = window.G.heroes.poeJoin, P = window.G.player; if (S.state === 'tail') P.moveTarget = new window.G.THREE.Vector3(S.poe.pos.x, 0, S.poe.pos.z); });
      await until(() => window.__ph.includes('caught'), null, 12000).catch(() => {});
      await until(() => !!document.querySelector('.l-world, .fx-word') || true, null, 100).catch(() => {});
      await sleep(page, 700); await shot('3-achoo', 'ACHOO!');
      await until(() => window.G.ui.dlg?.active, null, 12000).catch(() => {}); await sleep(page, 700);
      await shot('4-talk', '"You saw nothing."');
      for (let i = 0; i < 40; i++) {
        const t = await ev(() => (window.G.ui.dlg?.lines || []).map(l => l.text || l).join(' '));
        if (/under siege|thank-you visit/.test(t)) { await until(() => !window.G.ui.dlg.typing, null, 4000).catch(() => {}); await sleep(page, 200); await shot('5-plea', 'the plea: Takemori is under siege'); if (process.env.DBG) console.log(tag, JSON.stringify(await ev(() => { const G = window.G, J = G.heroes.poeJoin, V = J.view, S = J.stg, P = G.player, cam = G.engine.camera.position, r = v => v && [+v.x.toFixed(2), +v.z.toFixed(2)]; return V ? { covers: V.covers(P.pos.x, P.pos.z), me: r(S.me), P: r(P.pos), her: r(S.other), poe: r(J.poe.pos), meHid: V.screened(P.pos.x, P.pos.z, undefined, 0.2, cam), herHid: V.screened(J.poe.pos.x, J.poe.pos.z, undefined, 0.2, cam), moved: S.moved, s: S.s, fb: !!S.fallback, framed: J.framed || null, hasView: !!V.occ, tris: V.occ?.n, cam: cam.toArray().map(v => +v.toFixed(2)), dist: +G.engine.rig.dist.toFixed(2), fov: G.engine.camera.fov, asp: +G.engine.camera.aspect.toFixed(2), pitch: G.engine.rig.pitch, pred: S.cam ? S.cam.toArray().map(v => +v.toFixed(2)) : null, PHidPred: S.cam ? V.screened(P.pos.x, P.pos.z, undefined, 0.2, S.cam) : null } : 'noview'; }))); break; }
        await drainDialogue(page, [1], 1); await sleep(page, 100);
      }
      for (let i = 0; i < 40 && !(await ev(() => window.__ph.includes('done'))); i++) {
        const s = await ev(() => { const D = window.G.ui.dlg; return { a: !!D.active, c: !!(D.active && D.choices?.length && D.i >= D.lines.length - 1 && !D.typing) }; });
        if (s.c) await drainDialogue(page, [0], 1); else if (s.a) await next(); else await sleep(page, 150);
        await sleep(page, 140);
      }
      await sleep(page, 120); await shot('6-poof', 'POOF! (then the banner)');
      await until(() => window.G.questMoments.open, null, 15000).catch(() => {}); await sleep(page, 700);
      await shot('7-card', 'the quest card');
      await ev(() => window.G.ui.close('questCard'));
    }
  } catch (e) { console.log(`!! ${tag}: ${String(e.message || e).split('\n')[0]}`); bad++; }
  if (errors.length) { console.log(`${tag} page errors:`, [...new Set(errors)].slice(0, 5).join('\n')); bad++; }
  await browser.close();
  const lf = path.join(OUT, `${tag}-list.txt`);
  fs.writeFileSync(lf, list.map(([f, l]) => `${f}\t${l}`).join('\n'));
  const r = spawnSync('python', [path.resolve('tools/qa/sheet.py'), lf, path.join(OUT, `sheet-${tag}.png`), '4', '520'], { encoding: 'utf8' });
  console.log(r.stdout.trim() || r.stderr.trim());
}
process.exit(bad ? 1 : 0);
