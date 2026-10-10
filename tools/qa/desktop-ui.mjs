// The desktop UI check (ROADMAP R-13): the mouse-and-keys layout at 1280×720, 1600×900 and 1920×1080, each at the UI
// sizes 80, 100 and 125 % (Settings › UI size), every panel with a header in turn: the bag's views, character, the skill
// trees of all five heroes (the long names: "Starlight Kibble", "Ghostlight Tome"), the Journal, the map, the game menu's
// pages, Rosie's shop, the stash, cooking, the workbench, the Travel Map, a house card, remodel, the cozy path's Board
// and Guild, build and decorate. A header button (a title-row button, tab or badge, or a tab row heading the body) whose
// visible part runs outside its panel's frame fails (tools/qa/ui-audit-lib.mjs headerOutside; the ✕ on the corner and
// the K panel's docked Charge drawer are by design). R-16: in the K panel scenes the Charge drawer, with each skill of
// each tree shown from its skill strip, must sit on the screen (tag to foot) with the strip on one row inside its tray
// (ui-audit-lib drawerFit). Screenshots: the K panel for each hero at 100 %, and every failure.
//   usage: node tools/qa/desktop-ui.mjs [view…]   SIZES=1280x720,1600x900,1920x1080 SCALES=0.8,1,1.25 COZY=0 (skip the
//   cozy seed) SHOT_DIR (default tools/qa/tmp/desktop-ui). Dev server only (the cozy seed imports the debug registry).
import fs from 'node:fs';
import path from 'node:path';
import { launch, boot, sleep, waitMode } from './lib.mjs';
import { headerOutside, drawerFit } from './ui-audit-lib.mjs';
import { seedCozy, quietUi } from './cozy-ui-lib.mjs';

const OUT = process.env.SHOT_DIR || path.resolve('tools/qa/tmp/desktop-ui');
fs.mkdirSync(OUT, { recursive: true });
const SIZES = (process.env.SIZES || '1280x720,1600x900,1920x1080').split(',').map(s => s.split('x').map(Number));
const SCALES = (process.env.SCALES || '0.8,1,1.25').split(',').map(Number);
const ONLY = new Set(process.argv.slice(2).filter(a => !a.startsWith('--')));
const HEROES = ['chewy', 'moka', 'poe', 'shihtzu', 'golden'];
const fails = [];
let bad = 0, checked = 0;

for (const [W, H] of SIZES) {
  const { browser, page, errors } = await launch({ w: W, h: H });
  const ev = (f, a) => page.evaluate(f, a);
  const shot = name => page.screenshot({ path: path.join(OUT, name + '.png') });
  const closeAll = () => ev(() => { const U = window.G.ui; for (const n of [...U._order]) U.close(n); });
  let tag = '';
  const scene = async (name, open, close) => {
    if (ONLY.size && !ONLY.has(name) && ![...ONLY].some(o => name.startsWith(o + '-'))) return;
    try {
      await open(); await sleep(page, 650);
      const out = await ev(headerOutside); checked++;
      if (name.startsWith('skills-')) out.push(...await ev(drawerFit)); // (R-16: the Charge drawer on the screen for every skill)
      if (out.length) { for (const o of out) { console.log(`   OUTSIDE ${tag} ${name}: ${o.sel} ${JSON.stringify(o.rect)} ${o.frame ? 'frame ' + JSON.stringify(o.frame) : 'screen ' + JSON.stringify(o.screen)}`); fails.push({ where: `${tag} ${name}`, ...o }); } await shot(`fail-${tag}-${name}`); }
      else if (name.startsWith('skills-') && /@1$/.test(tag)) await shot(`${tag.replace('@', '-ui')}-${name}`);
    } catch (e) { console.log(`!! ${tag} ${name}: ${String(e.message || e).split('\n')[0]}`); bad++; }
    try { if (close) await close(); else await closeAll(); await sleep(page, 250); } catch (e) { /* next */ }
  };
  try {
    await boot(page, 'fresh&nointro&notut&hour=10');
    await ev(() => { const G = window.G; G.state.flags.mokaJoined = true; G.state.flags.poeJoined = true; G.state.flags.hints = { all: true }; G.state.coins = 2400; G.state.player.lvl = 12; G.state.player.skillPts = 3; G.state.player.statPts = 2; });
    if (process.env.COZY !== '0' && (!ONLY.size || [...ONLY].some(n => n.startsWith('cozy')))) { await seedCozy(page); await quietUi(page); }
    for (const sc of SCALES) {
      tag = `${W}x${H}@${sc}`;
      await ev(s => window.G.ui.setSetting('uiScale', s), sc); await sleep(page, 200);
      console.log(`== ${tag} (UI ×${await ev(() => window.G.ui.scale.toFixed(3))})`);
      for (const v of ['bag', 'pantry', 'furniture']) await scene('bag-' + v, () => ev(v => window.G.ui.open('inventory', { view: v }), v));
      await scene('character', () => ev(() => window.G.ui.open('character')));
      for (const c of HEROES) // (each hero's trees: the panel draws state.player's class; restored after)
        await scene('skills-' + c, () => ev(c => { const p = window.G.state.player; window.__cls0 ??= p.cls; p.cls = c; window.G.ui.close('skills'); window.G.ui.open('skills'); }, c),
          () => ev(() => { window.G.ui.close('skills'); window.G.state.player.cls = window.__cls0; }));
      for (const t of ['quests', 'fish', 'guides', 'crews']) await scene('journal-' + t, () => ev(t => window.G.ui.open('quests', t === 'quests' ? {} : { tab: t }), t));
      await scene('map', () => ev(() => window.G.ui.open('map')));
      for (const v of ['main', 'settings', 'controls']) await scene('menu-' + v, () => ev(v => { window.G.ui.open('menu'); if (v !== 'main') window.G.ui.panels.menu.setView(v); }, v));
      await scene('shop', () => ev(() => window.G.openShop()));
      await scene('stash', () => ev(() => window.G.ui.open('stash')));
      await scene('cook', () => ev(() => window.G.life.kitchen.open('kitchen')));
      await scene('craft', () => ev(() => window.G.openWorkbench?.('home')));
      await scene('travel', () => ev(() => window.G.openTravel()));
      await scene('house-card', () => ev(() => { const G = window.G, rec = G.sim.list.find(r => r.data?.owner === 'usagi') || G.sim.list.find(r => r.data?.owner); G.ui.open('houseCard', { rec }); }));
      await scene('remodel', () => ev(() => { const G = window.G, rec = G.sim.list.find(r => r.data?.owner === 'usagi') || G.sim.list.find(r => r.data?.owner); G.ui.open('remodel', { rec }); }));
      if (process.env.COZY !== '0') {
        for (const v of ['story', 'errands', 'away', 'reports']) await scene('cozy-board-' + v, () => ev(v => { const G = window.G; G.ui.open('expeditions', { at: 'board', view: v }); }, v));
        for (const v of ['hire', 'roster', 'guild']) await scene('cozy-guild-' + v, () => ev(v => window.G.cozy.guild.open(v), v));
      }
      await scene('build', async () => { await ev(() => window.G.build.enter()); await sleep(page, 400); }, async () => { await ev(() => window.G.build.exit?.()); await sleep(page, 300); });
    }
    // decorate (indoors), at each UI size
    if (!ONLY.size || ONLY.has('decorate')) {
      await ev(() => window.G.openHome()); await waitMode(page, 'interior'); await sleep(page, 700);
      for (const sc of SCALES) {
        tag = `${W}x${H}@${sc}`;
        await ev(s => window.G.ui.setSetting('uiScale', s), sc); await sleep(page, 200);
        await scene('decorate', async () => { await ev(() => window.G.housing.decor.enter()); await sleep(page, 400); }, () => ev(() => window.G.housing.decor.exit?.()));
      }
    }
  } catch (e) { console.log(`!! ${W}x${H}: ${e.message}`); bad++; }
  if (errors.length) { console.log('page errors:', [...new Set(errors)].slice(0, 4).join('\n')); bad++; }
  await browser.close();
}
console.log(`\n${checked} panel views checked; ${fails.length} header buttons outside their panel or Charge drawers off the screen. Shots: ${OUT}`);
const fail = bad || fails.length;
console.log(fail ? 'FAIL desktop-ui' : 'PASS desktop-ui');
process.exit(fail ? 1 : 0);
