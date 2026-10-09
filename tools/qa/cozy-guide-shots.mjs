// The cozy path's guides, every step on screen (docs/COZY.md §11; ROADMAP CZ-11): Rosie's question, "The Expedition
// Board", "Shadow's Nose", "The Adventurers' Guild" and the Peaceful paths tip, shot step by step on the desktop
// (1600×900, the mouse) and on a phone (844×390, touch: the lines in touch's words, the dock in the top band). The steps
// are driven through the game's own API (the board opened at the board, the crew picked, sent, the clock moved); s16
// g–j drives the same guides with real keys and clicks and checks them.
// R-14: the phones are two (844×390 and 667×375), and a second pass shows every other guide step that opens a panel
// (fishing's menu and Journal, the house tour's bag and pantry, the charge card, the house card and remodel, decorating's
// menu and palette, Meet Poe's wheel and a panel opened while it waits). At every phone shot the objective card must
// not cover the open panel's tabs, buttons or ✕, nor what the guide spotlights (ui-audit-lib guideOverlap): a FAIL.
//   usage: node tools/qa/cozy-guide-shots.mjs [desktop|phone|phone-se|all] [--cozy|--panels]   SHOT_DIR (default
//   tools/qa/tmp/cozy-guides)
import fs from 'node:fs';
import path from 'node:path';
import { launch, boot, sleep, drainDialogue, waitMode } from './lib.mjs';
import { launchTouch, PHONE } from './touch-lib.mjs';
import { guideOverlap } from './ui-audit-lib.mjs';

const OUT = process.env.SHOT_DIR || path.resolve('tools/qa/tmp/cozy-guides');
const ARGS = process.argv.slice(2), WHICH = ARGS.find(a => !a.startsWith('--')) || 'all';
const PASSES = ARGS.includes('--cozy') ? ['cozy'] : ARGS.includes('--panels') ? ['panels'] : ['cozy', 'panels'];
const DEVS = { desktop: null, phone: { ...PHONE }, 'phone-se': { ...PHONE, w: 667, h: 375 } };
fs.mkdirSync(OUT, { recursive: true });
let bad = 0, covered = 0;

/** a device's browser and its shot: the screenshot, then (on a phone) the card's overlap check */
async function open(dev) {
  const L = DEVS[dev] ? await launchTouch(DEVS[dev]) : await launch({ w: 1600, h: 900 });
  const ev = (f, a) => L.page.evaluate(f, a);
  const phone = !!DEVS[dev];
  const shot = async n => { if (phone) await ev(() => window.G.controls.setDevice('touch')); await sleep(L.page, 700); // (the dialogue helper's keys made the keyboard the device: the phone's lines are touch's)
    await L.page.screenshot({ path: path.join(OUT, `${dev}-${n}.png`) });
    const o = await ev(guideOverlap), hit = o.filter(x => x.panel); // (R-14's rule: a panel up; without one, a note)
    console.log(`  ${dev} ${n}${hit.length ? `  ${phone ? 'COVERS' : '(desktop) covers'} ${hit.length}` : ''}${o.length > hit.length ? `  (note, no panel: the card over ${o.length - hit.length})` : ''}`);
    for (const x of o.slice(0, 4)) console.log(`     card ${JSON.stringify(x.card)} over ${x.sel} ${JSON.stringify(x.rect)}`);
    if (phone && hit.length) covered++;
  };
  return { ...L, ev, shot, phone };
}

async function run(dev) {
  const { browser, page, errors, ev, shot } = await open(dev);
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
    await ev(() => { const G = window.G, T = G.state.cozy.exp.tired || {}; for (const k of Object.keys(T)) delete T[k]; G.state.coins = 3000; G.cozy.guild.debugBuild({ level: 1 }); }); // (rested: Moka home from a partial rests 6 h, and the Guild's crew of two needs her)
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
// ---------------------------------------------------------------- R-14: the other guides' panel steps
async function runPanels(dev) {
  const { browser, page, errors, ev, shot } = await open(dev);
  const go = async (n, id, st, openFn, { paused = false } = {}) => {
    try {
      await ev(([id, st]) => { const T = window.G.tutorials; if (T.active !== id) T.start(id, { replay: true }); T.goto(st); }, [id, st]);
      if (openFn) await ev(openFn);
      await page.waitForFunction(p => { const T = window.G.tutorials; return T.cur?.step && (p ? T.paused : T.cur.entered && !T.paused); }, paused, { timeout: 15000 });
      await shot(n);
    } catch (e) { console.log(`!! ${dev} ${n}: ${String(e.message || e).split('\n')[0]}`); bad++; }
  };
  const closeAll = () => ev(() => window.G.ui.closeAll());
  try {
    await boot(page, 'fresh&nointro&tut&hour=10');
    await ev(() => { const G = window.G, S = G.state.flags; S.hints = { all: true, garden: 1, build: 1, travel: 1, skills: 1, stats: 1, loot: 1, potion: 1 }; S.burrowTut = true; S.mokaJoined = true; S.poeJoined = true; S.mailboxOpened = true; S.tutorials = { switch: { done: true }, house: { done: true }, nose: { done: true } }; G.state.fishing = { ...(G.state.fishing || {}), rod: 1 }; G.state.player.lvl = 8; G.state.player.skillPts = 2; G.actions.recompute(); G.actions.addPantry('onigiri', 2); G.actions.addPantry('turnip', 3); });
    await sleep(page, 600);
    // fishing: the Fish Log (touch: the menu's Journal, then its Fish Log tab), then the wrap-up over the Journal
    await go('p-fish-menu', 'fishing', 'log', () => window.G.ui.open('menu'));
    await go('p-fish-journal', 'fishing', 'log', () => { const U = window.G.ui; U.close('menu', true); U.open('quests'); });
    await go('p-fish-wrap', 'fishing', 'wrap', () => { const P = window.G.ui.panels.quests; P.tab = 'fish'; P._sig = null; P.render(); });
    await closeAll(); await ev(() => window.G.tutorials.stop());
    // the house tour: the Pantry (the bag first), then the wrap-up over it
    await go('p-house-bag', 'house', 'pantry', () => window.G.ui.open('inventory', { view: 'bag' }));
    await go('p-house-pantry', 'house', 'wrap', () => window.G.ui.panels.inventory.setView('pantry'));
    await closeAll(); await ev(() => window.G.tutorials.stop());
    // the charge card in the Skills panel
    await go('p-charge-card', 'charge', 'card', () => window.G.ui.open('skills'));
    await go('p-charge-wrap', 'charge', 'wrap');
    await closeAll(); await ev(() => window.G.tutorials.stop());
    // remodel: the house card's Remodel, the style sets
    await go('p-remodel-card', 'remodel', 'card', () => { const G = window.G, rec = G.sim.list.find(r => r.data?.owner === 'usagi') || G.sim.list.find(r => r.data?.owner); G.ui.open('houseCard', { rec }); });
    await go('p-remodel-sets', 'remodel', 'sets', () => { const G = window.G, rec = G.sim.list.find(r => r.data?.owner === 'usagi') || G.sim.list.find(r => r.data?.owner); G.ui.close('houseCard', true); G.ui.open('remodel', { rec }); });
    await closeAll(); await ev(() => window.G.tutorials.stop());
    // Meet Poe: the hero wheel (the card steps aside), and a panel opened while a step waits (the card fades, paused)
    await go('p-poe-wheel', 'meetPoe', 'hold', () => window.G.heroes.openWheel());
    await ev(() => window.G.heroes.pickFromWheel(null)); await sleep(page, 400);
    await go('p-poe-paused-skills', 'meetPoe', 'fuma', () => window.G.ui.open('skills'), { paused: true });
    await closeAll(); await ev(() => window.G.tutorials.stop());
    // decorating (in the cottage): the menu's Decorate, then the palette's Home Rating step
    await ev(() => window.G.openHome()); await waitMode(page, 'interior'); await sleep(page, 900);
    await go('p-deco-menu', 'makeHome', 'decorate', () => window.G.ui.open('menu'));
    await go('p-deco-rating', 'makeHome', 'rating', () => { window.G.ui.close('menu', true); window.G.housing.decor.enter(); });
    await ev(() => { window.G.housing.decor.exit?.(); window.G.tutorials.stop(); });
  } catch (e) { console.log(`!! ${dev} panels: ${String(e.message || e).split('\n')[0]}`); bad++; }
  if (errors.length) { console.log('page errors:', [...new Set(errors)].slice(0, 4).join('\n')); bad++; }
  await browser.close();
}

for (const dev of WHICH === 'all' ? Object.keys(DEVS) : [WHICH]) {
  if (!(dev in DEVS)) { console.log('unknown device', dev); process.exit(2); }
  if (PASSES.includes('cozy')) await run(dev);
  if (PASSES.includes('panels')) await runPanels(dev);
}
if (covered) console.log(`${covered} phone shots with the guide card over a panel's tab, button or the spotlit target`);
console.log(bad || covered ? 'FAIL cozy-guide-shots' : `PASS cozy-guide-shots → ${OUT}`);
process.exit(bad || covered ? 1 : 0);
