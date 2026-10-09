// The cozy path's guides, every step on screen (docs/COZY.md §11; ROADMAP CZ-11): Rosie's question, "The Expedition
// Board", "Shadow's Nose", "The Adventurers' Guild" and the Peaceful paths tip, shot step by step on the desktop
// (1600×900, the mouse) and on a phone (844×390, touch: the lines in touch's words, the dock in the top band). The steps
// are driven through the game's own API (the board opened at the board, the crew picked, sent, the clock moved); s16
// g–j drives the same guides with real keys and clicks and checks them.
//   usage: node tools/qa/cozy-guide-shots.mjs [desktop|phone|all]   SHOT_DIR (default tools/qa/tmp/cozy-guides)
import fs from 'node:fs';
import path from 'node:path';
import { launch, boot, sleep, drainDialogue, waitMode } from './lib.mjs';
import { launchTouch, PHONE } from './touch-lib.mjs';

const OUT = process.env.SHOT_DIR || path.resolve('tools/qa/tmp/cozy-guides');
const WHICH = process.argv[2] || 'all';
fs.mkdirSync(OUT, { recursive: true });
let bad = 0;

async function run(dev) {
  const L = dev === 'phone' ? await launchTouch({ ...PHONE }) : await launch({ w: 1600, h: 900 });
  const { browser, page, errors } = L;
  const ev = (f, a) => page.evaluate(f, a);
  const shot = async n => { if (dev === 'phone') await ev(() => window.G.controls.setDevice('touch')); await sleep(page, 700); // (the dialogue helper's keys made the keyboard the device: the phone's lines are touch's)
    await page.screenshot({ path: path.join(OUT, `${dev}-${n}.png`) }); console.log(`  ${dev} ${n}`); };
  const step = (id, s, t = 20000) => page.waitForFunction(([id, s]) => window.G.tutorials.active === id && window.G.tutorials.cur?.step?.id === s && window.G.tutorials.cur.entered && !window.G.tutorials.paused, [id, s], { timeout: t });
  const at = (x, z, d = 1.0) => ev(([x, z, d]) => { const G = window.G, P = G.player; P.setPos(x + d * 0.7, z - d * 0.7); P.moveTarget = null; P.faceTo(x, z); P.facing = P.faceTarget; G.interactCooldown = 0; const r = G.engine.rig; r.focus.copy(P.pos); r.snap(); }, [x, z, d]);
  const ok = () => ev(() => { const b = document.querySelector('.to-ok'); if (b && getComputedStyle(b).display !== 'none') b.click(); });
  try {
    await boot(page, 'fresh&nointro&tut&hour=10&villagesaved=bamboo');
    await ev(() => { const G = window.G, S = G.state.flags.tutorials ||= {}; S.switch = { done: true }; S.house = { done: true }; G.state.flags.hints = { garden: 1, build: 1, travel: 1, skills: 1, stats: 1, loot: 1, potion: 1 }; G.story.markTalk('rosie'); });
    await page.waitForFunction(() => window.G.state.quests.active.some(q => q.id === 'burrow1'), null, { timeout: 10000 });
    await ev(() => { window.G.heroes.join('moka'); }); await sleep(page, 500); await drainDialogue(page, [0]);
    // Rosie's question
    await page.waitForFunction(() => window.G.ui.dlg.active && (window.G.ui.dlg.choices || []).length === 2, null, { timeout: 30000 });
    for (let i = 0; i < 6 && await ev(() => window.G.ui.dlg.typing || window.G.ui.dlg.i < window.G.ui.dlg.lines.length - 1); i++) { await ev(() => window.G.ui.dlg.advance?.()); await sleep(page, 200); }
    await shot('00-rosie-question');
    await drainDialogue(page, [1]);
    // the Board guide
    await step('board', 'walk'); await shot('board-1-walk');
    const B = await ev(() => { const p = window.G.cozy.board.it.pos; return { x: p.x, z: p.z }; });
    await at(B.x, B.z, 1.2); await step('board', 'open'); await shot('board-2-open');
    await ev(() => window.G.ui.open('expeditions', { at: 'board' })); await step('board', 'job'); await shot('board-3-job');
    await ok(); await step('board', 'crew'); await shot('board-4-crew');
    await ev(() => { const P = window.G.ui.panels.expeditions; P.toggle('hero:moka'); }); await step('board', 'send'); await shot('board-5-send');
    await ev(() => window.G.ui.panels.expeditions.go()); await step('board', 'away'); await shot('board-6-away');
    await ev(() => window.G.ui.closeAll()); await step('board', 'chip'); await shot('board-7-chip');
    await ok();
    // Shadow's Nose
    await step('nose', 'gather'); await shot('nose-1-gather');
    const N = await ev(() => { const q = window.G.questTarget(); return { x: q.pos.x, z: q.pos.z }; });
    await at(N.x, N.z, 0.9); await sleep(page, 400); await shot('nose-1b-at-node');
    await ev(() => { const G = window.G, n = G.cozy.scav.nodes().filter(x => !x.taken).sort((a, b) => Math.hypot(a.x - G.player.pos.x, a.z - G.player.pos.z) - Math.hypot(b.x - G.player.pos.x, b.z - G.player.pos.z))[0]; G.cozy.scav.gather(n.id); });
    await page.waitForFunction(() => window.G.tutorials.active === 'nose' && ['sniff', 'dig'].includes(window.G.tutorials.cur?.step?.id), null, { timeout: 20000 });
    if (await ev(() => window.G.tutorials.cur.step.id === 'sniff')) { await shot('nose-2-sniff'); await ev(() => window.G.cozy.scav.reveal()); }
    await step('nose', 'dig');
    const S = await ev(() => { const s = window.G.cozy.scav.spots().find(x => x.state === 'found'); return { x: s.x, z: s.z }; });
    await at(S.x, S.z, 1.0); await shot('nose-3-dig');
    await ev(() => { const s = window.G.cozy.scav.spots().find(x => x.state === 'found'); window.G.cozy.scav.digAt(s.id, { k: 0.78 }); });
    await step('nose', 'mats'); await shot('nose-4-mats');
    await ok(); await step('nose', 'back'); await shot('nose-5-back');
    await ev(() => window.G.cozy.clock.add(2.5)); await step('nose', 'report'); await shot('nose-6-report-chip');
    await ev(() => window.G.ui.open('expeditions', { view: 'reports', at: 'chip' })); await sleep(page, 400); await shot('nose-6b-report'); await sleep(page, 3500); await ev(() => window.G.ui.closeAll());
    await step('nose', 'wrap'); await shot('nose-7-rosie');
    await ok(); await ev(() => window.G.ui.closeAll());
    // the Guild
    await ev(() => { window.G.state.coins = 3000; window.G.cozy.guild.debugBuild({ level: 1 }); });
    await step('guild', 'door', 30000); await shot('guild-1-door');
    await ev(() => window.G.cozy.guild.open()); await step('guild', 'hire'); await shot('guild-2-hire');
    await ev(() => window.G.cozy.guild.hire(0)); await step('guild', 'roster'); await shot('guild-3-roster');
    await ok(); await step('guild', 'board'); await shot('guild-4-board');
    await ev(() => { window.G.ui.close('guild', true); window.G.ui.open('expeditions', { at: 'guild' }); }); await step('guild', 'two'); await shot('guild-5-two');
    await ev(() => { const P = window.G.ui.panels.expeditions; for (const m of P.members().filter(m => !P.memberWhy(m.key)).slice(0, 2)) P.toggle(m.key); }); await step('guild', 'wages'); await shot('guild-6-wages');
    await ok(); await ev(() => window.G.ui.closeAll());
    // Peaceful paths
    await ev(() => window.G.enterRegion('bamboo')); await waitMode(page, 'dungeon');
    await page.waitForFunction(() => document.querySelector('.tut')?.classList.contains('spot'), null, { timeout: 30000 }).catch(() => {});
    await shot('peaceful-tip');
  } catch (e) { console.log(`!! ${dev}: ${String(e.message || e).split('\n')[0]}`); bad++; try { console.log(await ev(() => JSON.stringify({ a: window.G.tutorials.active, s: window.G.tutorials.cur?.step?.id, p: window.G.tutorials.paused, why: window.G.tutorials.cur && window.G.tutorials.pauseReason(window.G.tutorials.cur.step) }))); } catch (e2) { /* */ } }
  if (errors.length) { console.log('page errors:', [...new Set(errors)].slice(0, 4).join('\n')); bad++; }
  await browser.close();
}
if (WHICH === 'desktop' || WHICH === 'all') await run('desktop');
if (WHICH === 'phone' || WHICH === 'all') await run('phone');
console.log(bad ? 'FAIL cozy-guide-shots' : `PASS cozy-guide-shots → ${OUT}`);
process.exit(bad ? 1 : 0);
