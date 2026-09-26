// Scenario 8: dialogue / story. Talk to every villager through the real UI (answering with keys 1-9 / Enter),
// chat + gift + request flows, Rosie's shop hand-off, building services (home, hall, board, smith),
// heart rewards, repeat requests, and "F to advance" on the last line. controlLocked must always be released.
import { launch, boot, sleep, makeReport, drainDialogue, tap } from './lib.mjs';

const R = makeReport('S8 dialogue / story / services');
const { browser, page, errors, warns } = await launch();
const state = () => page.evaluate(() => ({ locked: window.G.player.controlLocked, dlg: !!window.G.ui.dlg.active, modal: !!window.G.ui.anyModal(), talking: window.G.npcs.filter(n => n.talking).map(n => n.id), shop: window.G.ui.isOpen('shop') }));
async function settle() { for (let i = 0; i < 6; i++) { await drainDialogue(page); await sleep(page, 250); if (!(await page.evaluate(() => window.G.ui.dlg.active))) break; } }
try {
  await boot(page, 'fresh&nointro');
  await page.evaluate(() => { const G = window.G; G.sim.tickT = -1e9; for (const k of Object.keys(G.state.materials)) G.state.materials[k] = 20; });
  const npcs = await page.evaluate(() => window.G.npcs.filter(n => !n.folk).map(n => n.id));
  R.note(`villagers: ${npcs.join(', ')}`);
  const flows = [['Chat', [0]], ['Gift', [1, 0]], ['Help', [2, 0]]];
  const lockProblems = [];
  for (const id of npcs) {
    for (const [flow, picks] of flows) {
      await page.evaluate(id => { const G = window.G, n = G.npcs.find(x => x.id === id); G.player.setPos(n.pos.x + 0.9, n.pos.z); G.talkTo(n); }, id);
      await sleep(page, 300);
      const chosen = await drainDialogue(page, [...picks]);
      await sleep(page, 300);
      if (await page.evaluate(() => window.G.ui.isOpen('shop'))) { await page.keyboard.press('Escape'); await sleep(page, 300); }
      await settle();
      const st = await state();
      if (st.locked || st.dlg || st.talking.length || st.modal) lockProblems.push(`${id}/${flow} chose ${JSON.stringify(chosen)} -> ${JSON.stringify(st)}`);
    }
  }
  R.check('every villager x (chat, gift, request): controls released, no dialogue/modal left', !lockProblems.length, lockProblems.slice(0, 4).join(' || '));
  const q = await page.evaluate(() => ({ done: window.G.state.quests.done, active: window.G.state.quests.active.map(q => q.id), friends: Object.fromEntries(Object.entries(window.G.state.friends).map(([k, f]) => [k, f.hearts + '/' + f.pts])) }));
  R.check('talking to Rosie completes "welcome"', q.done.includes('welcome'), JSON.stringify(q));
  await sleep(page, 2700);
  const q2 = await page.evaluate(() => window.G.state.quests.active.map(q => q.id));
  R.check('next story quest (burrow1) starts after welcome', q2.includes('burrow1'), q2.join(','));

  // Rosie -> "Open Rosie's shop" hand-off
  await page.evaluate(() => { const G = window.G, n = G.npcs.find(x => x.id === 'rosie'); G.player.setPos(n.pos.x + 0.9, n.pos.z); G.talkTo(n); });
  await sleep(page, 300);
  const rosieChoices = await page.evaluate(async () => { const d = window.G.ui.dlg; for (let i = 0; i < 30 && (d.typing || d.i < d.lines.length - 1); i++) { d.advance(); await new Promise(r => setTimeout(r, 50)); } return d.choices?.map(c => c.text) || []; });
  const shopIdx = rosieChoices.findIndex(t => /shop/i.test(t));
  await drainDialogue(page, [shopIdx]);
  await sleep(page, 500);
  const shop = await state();
  R.check("Rosie's shop opens from dialogue and controls are unlocked", shop.shop && !shop.locked, JSON.stringify(shop));
  await page.keyboard.press('Escape'); await sleep(page, 400);

  // F on the last line of a no-choice dialogue must not re-open the conversation
  const folkOrNpc = await page.evaluate(() => { const G = window.G; const n = G.npcs.find(x => x.id === 'kuma') || G.npcs[1]; G.player.setPos(n.pos.x + 0.8, n.pos.z); n.state = 'idle'; n.t = 99; return n.id; });
  await sleep(page, 200);
  const preF = await page.evaluate(() => { const G = window.G, k = G.npcs.find(x => x.id === 'kuma'); return { modal: G.ui.anyModal(), open: Object.keys(G.ui.panels).filter(n => G.ui.isOpen(n)), locked: G.player.controlLocked, kvis: k?.visible, kTalking: k?.talking, dist: k ? Math.hypot(k.pos.x - G.player.pos.x, k.pos.z - G.player.pos.z).toFixed(2) : null, paused: G.ui.isPaused?.(), build: G.build?.active, title: G.titleActive, dead: G.playerDead, focus: document.activeElement?.tagName + '.' + document.activeElement?.className }; });
  await tap(page, 'f'); await sleep(page, 400);
  const opened = await page.evaluate(() => window.G.ui.dlg.active);
  await page.keyboard.press('1'); await sleep(page, 500); // "Chat"
  let reopen = null;
  for (let i = 0; i < 12; i++) {
    const d = await page.evaluate(() => ({ active: window.G.ui.dlg.active, choices: !!window.G.ui.dlg.choices?.length, i: window.G.ui.dlg.i, n: window.G.ui.dlg.lines?.length }));
    if (!d.active) break;
    if (d.choices) { reopen = { reopenedWithChoices: true, afterFPresses: i }; break; }
    await tap(page, 'f', 40); await sleep(page, 200);
  }
  await sleep(page, 300);
  const after = await page.evaluate(() => ({ active: window.G.ui.dlg.active, choices: window.G.ui.dlg.choices?.map(c => c.text) || null, first: window.G.ui.dlg.lines?.[0]?.text?.slice(0, 50) }));
  R.check(`pressing F to finish the last line does not immediately re-open the chat (${folkOrNpc})`, opened && !reopen && !after.active, JSON.stringify({ opened, reopen, after, preF }));
  await settle();

  // gift twice the same day, heart reward
  const gift = await page.evaluate(async () => {
    const G = window.G, S = G.story, n = G.npcs.find(x => x.id === 'usagi');
    const f = S.friend('usagi'); f.giftDay = 0; f.pts = 28; f.hearts = 2; f.rewards = [];
    const answers = [0];
    const say = (lines, choices) => Promise.resolve(choices ? answers.shift() ?? choices.length - 1 : null);
    const c0 = G.state.coins;
    await S.giftFlow(n, say);
    const h1 = f.hearts, pending = f.pendingReward;
    let refused = null; await S.giftFlow(n, (lines) => { refused = lines[0]; return Promise.resolve(null); });
    return { heartsAfterGift: h1, pending, secondGift: refused, coins0: c0 };
  });
  R.check('gift raises hearts, 3-heart reward queued, 2nd gift same day refused', gift.heartsAfterGift >= 3 && gift.pending === 3 && /already/i.test(gift.secondGift || ''), JSON.stringify(gift));
  await page.evaluate(() => { const G = window.G, n = G.npcs.find(x => x.id === 'usagi'); G.player.setPos(n.pos.x + 0.9, n.pos.z); window.__c0 = G.state.coins; G.talkTo(n); });
  await sleep(page, 300); await drainDialogue(page, [4, 3, 2]); await settle();
  const reward = await page.evaluate(() => ({ coins: window.G.state.coins - window.__c0, locked: window.G.player.controlLocked }));
  R.check('heart reward paid out on next talk', reward.coins >= 100 && !reward.locked, JSON.stringify(reward));

  // a villager's request can be taken again after completing one
  const req = await page.evaluate(async () => {
    const G = window.G, S = G.story, n = G.npcs.find(x => x.id === 'kero') || G.npcs[2], id = n.id;
    const f = S.friend(id); f.reqDay = 0;
    delete S.Q.requests[`req_${id}`]; S.Q.active = S.Q.active.filter(q => q.id !== `req_${id}`); S.Q.done = S.Q.done.filter(q => q !== `req_${id}`);
    const rnd = Math.random; Math.random = () => 0.01; G.state.materials.wood = 20; // template 0 = 'bring <mat>', mat = wood
    await S.requestFlow(n, () => Promise.resolve(0));
    Math.random = rnd;
    const first = { active: S.Q.active.some(q => q.id === `req_${id}`), done: S.Q.done.includes(`req_${id}`), woodLeft: G.state.materials.wood };
    // next day: ask again
    G.day.day += 1;
    const offered = S.canRequest(id) && !S.Q.requests[`req_${id}`];
    await S.requestFlow(n, () => Promise.resolve(0));
    const second = { active: S.Q.active.some(q => q.id === `req_${id}`), requestStored: !!S.Q.requests[`req_${id}`], done: S.Q.done.filter(x => x === `req_${id}`).length };
    const offeredAfter = S.canRequest(id) || !S.Q.requests[`req_${id}`];
    G.day.day -= 1;
    return { id, first, offeredNextDay: offered, second };
  });
  R.check('"bring wood" request is fulfilled by handing wood over (not instantly on accept, nothing consumed)', !(req.first.done && req.first.woodLeft >= 20), JSON.stringify(req.first));
  R.check('a villager can give a new request after a completed one', req.second.active, JSON.stringify(req));

  // services: home, town hall, board, smith — each must release controls
  const svcProblems = [];
  for (const [fn, picks] of [['openHome', [2]], ['openTownHall', [1]], ['openBoard', []], ['openSmith', [3]]]) {
    await page.evaluate(fn => { window.G[fn](); }, fn); // (never return the pending promise: CDP awaitPromise on it crashed the renderer)
    await sleep(page, 300); await drainDialogue(page, [...picks]); await sleep(page, 300);
    if (await page.evaluate(() => window.G.ui.anyModal())) { await page.keyboard.press('Escape'); await sleep(page, 300); }
    await settle();
    const st = await state(); if (st.locked || st.dlg || st.modal) svcProblems.push(`${fn}: ${JSON.stringify(st)}`);
  }
  R.check('building services (home/hall/board/smith) release controls', !svcProblems.length, svcProblems.join(' | '));
  // town hall -> build mode hand-off
  await page.evaluate(() => { window.G.openTownHall(); }); await sleep(page, 300); await drainDialogue(page, [0]); await sleep(page, 600);
  const hall = await page.evaluate(() => ({ build: window.G.build.active, panel: window.G.ui.isOpen('build'), locked: window.G.player.controlLocked }));
  R.check('Blossom Hall -> "Plan the village" opens build mode unlocked', hall.build && hall.panel && !hall.locked, JSON.stringify(hall));
  await page.evaluate(() => window.G.build.exit()); await sleep(page, 300);

  // Bonesmith "upgrade" on a top-tier item: must not charge for nothing
  const smith = await page.evaluate(async () => {
    const G = window.G, { generateItem } = await import('/src/rpg/items.js');
    G.state.inventory = G.state.inventory.map(() => null);
    const it = generateItem({ ilvl: 55, rarity: 'magic', base: 'pawCrown' });
    G.state.inventory[0] = it; G.state.coins = 5000; G.state.materials.bone = 20; G.state.materials.crystal = 5;
    return { base: it.base, tier: it.tier, name: it.name, coins: G.state.coins, bone: 20, crystal: 5 };
  });
  await page.evaluate(() => { window.G.openSmith(); }); await sleep(page, 300);
  await drainDialogue(page, [2, 0]); await sleep(page, 300); await settle();
  const smithAfter = await page.evaluate(() => ({ base: window.G.state.inventory[0]?.base, name: window.G.state.inventory[0]?.name, coins: window.G.state.coins, bone: window.G.state.materials.bone, crystal: window.G.state.materials.crystal }));
  R.check('Bonesmith upgrade of a top-tier item does not take payment for nothing', !(smithAfter.base === smith.base && smithAfter.coins < smith.coins), JSON.stringify({ before: smith, after: smithAfter }));
} catch (e) { errors.push('[harness] ' + e.stack); }
const failed = R.finish(errors, warns);
await browser.close();
process.exit(failed ? 1 : 0);
