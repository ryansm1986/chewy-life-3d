// Scenario 11: story-chain robustness + title flow.
//  a) quest reward items with a full bag (unique from a boss quest, heart-reward item)
//  b) reload within the 2.5 s gap between "quest complete" and "next quest starts"
//  c) title screen: New Game -> intro -> unlocked; Continue -> unlocked
import { launch, boot, sleep, makeReport, drainDialogue, BASE, installProbes } from './lib.mjs';

const R = makeReport('S11 story chain + title');
const { browser, context, page, errors, warns } = await launch();
try {
  await boot(page, 'fresh&nointro');
  // a) boss quest reward (unique) + heart reward item with a full bag
  const full = await page.evaluate(async () => {
    const G = window.G, S = G.story; const { generateItem } = await import('/src/rpg/items.js');
    for (let i = 0; i < 40; i++) G.state.inventory[i] = generateItem({ ilvl: 3, rarity: 'normal' });
    G.state.quests.active = [{ id: 'king', step: 1, prog: 0 }];
    const t0 = window.QA.toasts.length;
    G.events.emit('boss:dead', { id: 'mochiKing', floor: 5 });
    const waited = !!G.state.quests.active.find(q => q.id === 'king')?.handIn; S.handIn('king'); // (its hand-in to Rosie: docs/QUESTS.md §4)
    const uniques = G.state.inventory.filter(x => x?.rarity === 'unique').length + G.state.stash.filter(x => x?.rarity === 'unique').length;
    const f = S.friend('pan'); f.pendingReward = 6; const inv0 = G.state.inventory.map(x => x?.uid).join();
    const n = G.npcs.find(x => x.id === 'pan');
    const talk = S.talk(n);
    for (let i = 0; i < 20 && G.ui.dlg.active; i++) { G.ui.dlg.advance(); await new Promise(r => setTimeout(r, 60)); }
    // leave whatever dialogue follows
    return { kingDone: G.state.quests.done.includes('king'), waited, uniqueReceived: uniques, toasts: window.QA.toasts.slice(t0), pendingAfter: f.pendingReward, rewardDelivered: G.state.inventory.map(x => x?.uid).join() !== inv0 };
  });
  await drainDialogue(page); await sleep(page, 300);
  R.check('boss-quest unique reward is not silently lost when the bag is full (stash / ground / retry), once the quest is handed in', full.waited && full.kingDone && full.uniqueReceived > 0, JSON.stringify(full));
  R.check('6-heart reward item is not silently lost when the bag is full', full.rewardDelivered || full.pendingAfter === 6, JSON.stringify({ pendingAfter: full.pendingAfter, rewardDelivered: full.rewardDelivered }));

  // b) reload during the gap between welcome completion and burrow1 start
  await page.goto(`${BASE}/?fresh&nointro`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true && window.G?.player, null, { timeout: 60000 }); await sleep(page, 800);
  await page.evaluate(() => { const G = window.G; const Q = G.state.quests; Q.active.find(q => q.id === 'welcome').prog = 1; G.story.progress('talk'); G.save(); });
  await page.goto(`${BASE}/?notitle`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true && window.G?.player, null, { timeout: 60000 });
  await sleep(page, 6000);
  const chain = await page.evaluate(() => ({ active: window.G.state.quests.active.map(q => q.id), done: window.G.state.quests.done }));
  R.check('story chain survives a reload right after a quest completes (next quest still starts)', chain.active.includes('burrow1'), JSON.stringify(chain));

  // c) title: New Game / Continue
  await page.goto(`${BASE}/`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true && window.G?.player, null, { timeout: 60000 }); await sleep(page, 1500);
  const title = await page.evaluate(() => ({ titleActive: window.G.titleActive, uiMode: window.G.ui.mode, buttons: [...document.querySelectorAll('.l-title button')].map(b => b.textContent.trim()) }));
  R.check('title screen shows with a save present', title.titleActive && title.uiMode === 'title', JSON.stringify(title));
  const cont = title.buttons.findIndex(t => /continue/i.test(t));
  if (cont >= 0) {
    await page.evaluate(i => document.querySelectorAll('.l-title button')[i].click(), cont);
    await page.waitForFunction(() => !window.G.titleActive && !window.G.ui.iris.active, null, { timeout: 20000 }); await sleep(page, 800);
    const c = await page.evaluate(() => ({ locked: window.G.player.controlLocked, mode: window.G.ui.mode, modal: window.G.ui.anyModal() }));
    R.check('Continue -> village, unlocked', !c.locked && c.mode === 'village' && !c.modal, JSON.stringify(c));
  } else R.note('no Continue button found: ' + title.buttons.join(','));
  // New Game
  await page.goto(`${BASE}/`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true && window.G?.player, null, { timeout: 60000 }); await sleep(page, 1500);
  const ng = await page.evaluate(() => [...document.querySelectorAll('.l-title button')].findIndex(b => /new/i.test(b.textContent)));
  if (ng >= 0) {
    await page.evaluate(i => document.querySelectorAll('.l-title button')[i].click(), ng);
    await sleep(page, 800);
    // with a save, New Game opens the save-slot picker (SL-1, ui/title.js): an empty slot's New Game
    await page.evaluate(() => { const b = document.querySelector('.sl-card.empty [data-s="new"]'); b?.click(); }).catch(() => {}); // (the reload can tear the evaluate down)
    await page.waitForFunction(() => window.__ready === true && window.G?.player && !window.G.titleActive, null, { timeout: 60000 }).catch(() => {});
    // the opening plays first (world/opening.js, ~22 s): the shots, then Rosie trots in and her welcome starts
    const op = await page.waitForFunction(() => window.G.opening?.active && window.G.cutscene === 'opening' && window.G.ui.root.classList.contains('cine'), null, { timeout: 15000 }).then(() => true).catch(() => false);
    await page.waitForFunction(() => window.G.ui.dlg.active, null, { timeout: 60000 }).catch(() => {});
    const intro = await page.evaluate(op => ({ op, opDone: !window.G.opening?.active && !window.G.cutscene, dlg: window.G.ui.dlg.active, speaker: window.G.ui.dlg.active && window.G.ui.dlg.opts.speaker, locked: window.G.player.controlLocked, coins: window.G.state.coins, lvl: window.G.state.player.lvl }), op);
    await drainDialogue(page); await sleep(page, 600); await drainDialogue(page); await sleep(page, 400);
    const post = await page.evaluate(() => ({ locked: window.G.player.controlLocked, dlg: window.G.ui.dlg.active, active: window.G.state.quests.active.map(q => q.id) }));
    R.check('New Game -> the opening (the shots, the bars, the HUD away), then a fresh state + Rosie intro, controls unlocked afterwards', intro.op && intro.opDone && intro.dlg && intro.speaker === 'Rosie' && intro.lvl === 1 && !post.locked && !post.dlg, JSON.stringify({ intro, post }));
  } else R.note('no New Game button');
} catch (e) { errors.push('[harness] ' + e.stack); }
const failed = R.finish(errors, warns);
await browser.close();
process.exit(failed ? 1 : 0);
