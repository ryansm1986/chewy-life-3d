// Scenario 46: quests as moments (ROADMAP UX-2, docs/QUESTS.md; the owner, 2026-10-11: "Quests and their objectives seem
// to go by users without them understanding and reading them"). Waits key on game state, never on the clock.
//  a) the card on accept (the keyboard): a story quest taken opens its storybook card on a calm moment instead of the
//     "New Quest" banner (the giver's name and face, the title, the hook, the goal's action and place, the reward
//     icons); Enter presses "Let's go!", and with Settings › Shadow leads the way on Quests Shadow sets off for it; F
//     presses it too; at Off he stays; the card fits the screen
//  b) queued until calm: a quest taken during a fight (an aggroed foe beside you on a den floor), a dialogue or build mode
//     waits; it opens once the fight's over (Shadow's calm clock) / the dialogue's closed / build mode's left; a quest done
//     before its card showed drops it; the queue survives a save and reload; the guides wait for a waiting card
//  c) a request: a villager's daily ask gets the compact slip (a toast with their face), never a card
//  d) the QA's quiet sessions (?nointro without ?qcard) keep the old banner and no card
//  e) the pad (the Steam Deck's 1280×800): the focus starts on "Let's go!" with its A glyph; A presses it
//  f) touch (a phone): the card fits the phone; a tap on "Let's go!" presses it
//  g) the place title: the King of Squish on the Mossy Burrow's floor 1 ("Find the stairs down to floor 2") and floor 2
//     ("Defeat King Mochi"), each in the arrival banner's place (no "Floor n of 2" banner), with the sting; once per step
//     and area (back on floor 2: none); Pond Park walked into with Kero's quest; Takemori Village on arriving with the
//     ledger to bring home; never over a dialogue (it waits, then shows) or a boss's card (it steps aside)
//  h) Shadow's lines: the King of Squish at the Burrow door, on its two floors (after their titles), the boss in sight,
//     the way home; each once (back on floor 2: none); never in a fight (a line waits for calm, one up steps aside); a
//     rescue's line by the cage; a zone dungeon's gate
//  i) the hand-in (yours): the boss down, the quest waits ("Bring the festival mochi home to Rosie"), the pointer the way
//     out, then Rosie where she is now with Shadow leading; her place title near her; F at Rosie: her happy hop and hearts,
//     her thank-you, the reward flying from her into the bag and the coins, the "Quest complete" stamp (no banner), the
//     next quest's card after it
//  j) a crew's hand-in: the King of Squish by a crew waits for you; no "way home" line (they did it); Rosie's line about
//     the crew; the chain goes on; a zone quest's closing talk plays the same scene (Chiku)
//  k) the save migration: a real 0.5.1 save loads with its quest where it was and finishes through a hand-in; a record past
//     its last step (done, not handed in) loads waiting for its hand-in; a hand-in waiting is kept over a reload
import fs from 'node:fs';
import { launch, boot, waitMode, sleep, makeReport, BASE, installProbes, drainDialogue } from './lib.mjs';
import { launchTouch, PHONE } from './touch-lib.mjs';
import { installPad, padTap } from './pad-lib.mjs';
import { panelFit } from './ui-audit-lib.mjs';

const R = makeReport('S46 quests as moments');
const ONLY = (process.env.S46_ONLY || '').split('').filter(Boolean);
const want = k => !ONLY.length || ONLY.includes(k);
const BASE_DONE = ['welcome', 'burrow1', 'homes', 'lights'];
let { browser, page, errors, warns } = await launch({ w: 1600, h: 900 });
const allErrors = [], allWarns = [];
let ev = (f, a) => page.evaluate(f, a);
let until = (f, a, timeout = 20000) => page.waitForFunction(f, a, { timeout });
const cardOpen = async () => { try { await until(() => window.G.ui.isOpen('questCard') && !window.G.ui.panels.questCard.wrap.classList.contains('opening'), null, 20000); } catch (e) { throw new Error(`no card: ${JSON.stringify(await ev(() => ({ why: window.G.questMoments.stats.why, q: window.G.state.quests.cards, open: window.G.questMoments.open })))}`); } };
const cardClosed = () => until(() => !window.G.ui.isOpen('questCard'), null, 5000);
const card = () => ev(() => { const P = document.querySelector('.p-qcard'); if (!P || !window.G.ui.isOpen('questCard')) return null; const q = s => P.querySelector(s)?.textContent.replace(/\s+/g, ' ').trim() || ''; return { name: q('.qc-name'), title: q('.qc-title'), hook: q('.qc-hook'), act: q('.qc-goal b'), at: q('.qc-goal > div > span'), chips: [...P.querySelectorAll('.qc-chip')].map(c => c.textContent.trim()), lead: !!P.querySelector('.qc-lead:not(.off)'), face: !!P.querySelector('.qc-por img, .qc-por svg'), kind: P.dataset.kind }; });
const quiet = () => until(() => { const B = window.G.ui.banners; return !B?.busy && !B?.q?.length && !window.G.ui.iris?.active; }, null, 20000).catch(() => {});
const setup = (done = BASE_DONE) => ev(done => { const G = window.G, Q = G.state.quests; G.state.flags.burrowTut = true; G.state.flags.mokaJoined = true; G.state.flags.hints = { all: true }; Q.active = []; Q.done = [...done]; Q.cards = []; G.ui.toasts?.retire?.(9); G.events.emit('quest:update'); }, done);
const take = id => ev(id => { const G = window.G, Q = G.state.quests; Q.active = Q.active.filter(q => q.id !== id); Q.done = Q.done.filter(x => x !== id); window.__bn = []; G.story.start(id); }, id);
const spyBanners = () => ev(() => { const U = window.G.ui; if (U.__bnSpy) return; U.__bnSpy = true; const raw = U.banner.bind(U); window.__bn = []; U.banner = (t, s, o) => { window.__bn.push([t, s, o?.style]); return raw(t, s, o); }; const A = window.G.audio; window.__stings = []; if (A?.sting) { const rs = A.sting.bind(A); A.sting = (n, o) => { window.__stings.push(n); return rs(n, o); }; } });

try {
  // ================================================================ a) the card on accept (keys)
  if (want('a') || want('b') || want('c') || want('g') || want('h') || want('i') || want('j') || want('k')) {
    await boot(page, 'fresh&nointro&notut&qcard&hour=11');
    await spyBanners(); await setup(); await quiet();
  }
  if (want('a')) {
    await ev(() => window.G.ui.setSetting('shadowLead', 1));
    await take('king');
    await cardOpen();
    const c = await card(), st = await ev(() => ({ bn: window.__bn.filter(b => b[2] === 'quest').map(b => b[0]), sfx: window.QA.sfx.includes('ui_quest'), modal: window.G.ui.anyModal(), q: window.G.state.quests.cards }));
    R.check('a) "The King of Squish" taken: its card opens on a calm moment (not the "New Quest" banner), with the jingle', !!c && !st.bn.includes('New Quest') && st.sfx && st.modal, { c: !!c, ...st });
    R.check('a) the card: Rosie\'s name and face, the title, her hook, the goal ("Find King Mochi" · "the Mossy Burrow, floor 2"), the rewards as icons, Shadow\'s note', c?.name === 'Rosie' && c.face && c.title === 'The King of Squish' && /King Mochi stole/.test(c.hook) && c.act === 'Find King Mochi' && c.at === 'the Mossy Burrow, floor 2' && c.chips.length === 4 && c.chips[0] === '500' && c.lead && c.kind === 'story', c);
    const fit = await ev(panelFit);
    R.check('a) the card fits the screen (panelFit)', !fit.length, fit);
    await page.keyboard.press('Enter'); await cardClosed();
    const ld = await until(() => window.G.lead?.intent?.t?.quest === 'king' && ['go', 'wait', 'arrived'].includes(window.G.lead.state), null, 8000).then(() => true, () => false);
    R.check('a) Enter presses "Let\'s go!": the card closes and Shadow sets off for the Burrow door (Shadow leads the way: Quests)', ld, await ev(() => ({ st: window.G.lead?.state, q: window.G.lead?.intent?.t?.quest })));
    await ev(() => { const L = window.G.lead; L.toggle(); window.G.ui.setSetting('shadowLead', 0); });
    await take('keroRod'); await cardOpen();
    const c2 = await card();
    await page.keyboard.press('f'); await cardClosed();
    await sleep(page, 600);
    const l2 = await ev(() => ({ st: window.G.lead.state, ask: window.G.lead.ask, intent: window.G.lead.intent?.t?.quest || null }));
    R.check('a) F presses it too; at Off Shadow stays put (no note on the card)', c2 && !c2.lead && c2.name === 'Kero' && !l2.intent && !String(l2.ask || '').includes('keroRod'), { c2, l2 });
    await ev(() => window.G.ui.setSetting('shadowLead', 1));
  }
  // ================================================================ b) queued until calm
  if (want('b')) {
    await setup(); await quiet();
    // a dialogue
    await ev(() => { const G = window.G; G.ui.dialogue({ speaker: 'Rosie', portrait: G.portrait('rosie'), lines: ['Hold on, one more thing!'] }); });
    await take('umbrella');
    await sleep(page, 1500);
    const d0 = await ev(() => ({ open: window.G.ui.isOpen('questCard'), why: window.G.questMoments.stats.why, q: [...window.G.state.quests.cards] }));
    await ev(() => window.G.ui.dlg.finish(-1));
    await cardOpen();
    R.check('b) taken during a dialogue: it waits ("dialogue") and opens once the dialogue closes', !d0.open && d0.why === 'dialogue' && d0.q.includes('umbrella'), d0);
    await page.keyboard.press('Enter'); await cardClosed();
    // build mode
    await ev(() => window.G.build.enter()); await until(() => window.G.build.active);
    await take('tasteTest'); await sleep(page, 1500);
    const b0 = await ev(() => ({ open: window.G.ui.isOpen('questCard'), why: window.G.questMoments.stats.why }));
    await ev(() => window.G.build.exit()); await cardOpen();
    R.check('b) taken in build mode: it waits ("build") and opens once build mode is left', !b0.open && b0.why === 'build', b0);
    await page.keyboard.press('Enter'); await cardClosed();
    // a fight on a den floor: an aggroed yokai beside the hero
    await ev(() => { clearInterval(window.__inv); window.__inv = setInterval(() => { const G = window.G; if (G.player) { G.player.invuln = true; G.actions.restoreAll?.(); } }, 250); window.G.enterDungeon({ id: 'mossyBurrow', floor: 1 }); });
    await waitMode(page, 'dungeon', 60000); await quiet();
    await ev(() => { const G = window.G, P = G.player, D = G.dungeon; const ms = D.monsters.filter(m => m.alive && !m.ally).sort((a, b) => a.pos.distanceTo(P.pos) - b.pos.distanceTo(P.pos)).slice(0, 3); for (const m of ms) { m.pos.set(P.pos.x + 2, P.pos.y, P.pos.z + 1.5); m.aggro = true; } window.__foes = ms.length; });
    await until(() => window.G.questMoments.fight(), null, 8000);
    await take('shrine'); await sleep(page, 1600);
    const f0 = await ev(() => ({ open: window.G.ui.isOpen('questCard'), why: window.G.questMoments.stats.why, foes: window.__foes }));
    await ev(() => { const G = window.G, C = G.combat; for (const m of [...G.dungeon.monsters]) if (m.alive && !m.ally && m.pos.distanceTo(G.player.pos) < 30) C.applyDamageToMonster(m, Math.ceil(m.life) + 1, { silent: true }); });
    await cardOpen();
    const f1 = await card();
    R.check('b) taken in a fight (yokai on you on a den floor): it waits ("fight") and opens once things are calm, in the dungeon', !f0.open && f0.why === 'fight' && f1?.title === 'A Shrine for Wishes', { f0, f1: f1?.title });
    await page.keyboard.press('Enter'); await cardClosed();
    await ev(() => window.G.returnToVillage()); await waitMode(page, 'village', 60000); await quiet();
    // done before its card: dropped
    await ev(() => { window.G.ui.dialogue({ speaker: 'Rosie', lines: ['…'] }); }); // (not awaited: its promise resolves when it closes)
    await take('onsen');
    await ev(() => { const G = window.G, Q = G.state.quests, q = Q.active.find(x => x.id === 'onsen'); Q.active.splice(Q.active.indexOf(q), 1); Q.done.push('onsen'); G.ui.dlg.finish(-1); });
    await sleep(page, 1500);
    const g0 = await ev(() => ({ open: window.G.ui.isOpen('questCard'), q: [...window.G.state.quests.cards] }));
    R.check('b) a quest done before its card showed: the card is dropped', !g0.open && !g0.q.includes('onsen'), g0);
    // the queue survives a save and reload; the guides wait for a waiting card
    await ev(() => { const G = window.G; G.ui.dialogue({ speaker: 'Rosie', lines: ['Wait for it…'] }); });
    await take('oni');
    const sv = await ev(() => { const G = window.G, T = G.tutorials, calm = T.calm(); G.save(); return { q: [...G.state.quests.cards], guidesCalm: calm, pending: G.questMoments.cardPending }; });
    await page.goto(`${BASE}/?notitle&nointro&notut&qcard&hour=11&dseed=1`, { waitUntil: 'load' });
    await until(() => window.__ready === true && window.G?.player && window.G.questMoments, null, 60000);
    await cardOpen();
    const rl = await card();
    R.check('b) the queue survives a save and reload (the card opens after it); the guides wait while a card waits', sv.q.includes('oni') && sv.pending && !sv.guidesCalm && rl?.title === "Oni's Kitchen Nightmare", { sv, rl: rl?.title });
    await page.keyboard.press('Enter'); await cardClosed();
    await installProbes(page); await spyBanners(); // (the reload: the probes again)
  }
  // ================================================================ c) a request: the slip
  if (want('c')) {
    await setup(); await quiet();
    await ev(() => window.QA.toasts.splice(0));
    const rq = await ev(async () => { const G = window.G, npc = G.npcs.find(n => n.id === 'kero'); const p = G.story.requestFlow(npc, (lines, choices) => Promise.resolve(choices ? 0 : null)); await p; return { active: G.state.quests.active.map(q => q.id), cards: [...(G.state.quests.cards || [])] }; });
    await sleep(page, 900);
    const sl = await ev(() => ({ toasts: window.QA.toasts.filter(t => /^New request:/.test(t)), open: window.G.ui.isOpen('questCard'), bn: window.__bn.filter(b => b[0] === 'New Quest').length, img: !!document.querySelector('.toasts .toast img') }));
    R.check('c) a villager\'s daily request: the compact slip (a toast "New request: …" with their face), no card, no banner', rq.active.includes('req_kero') && !rq.cards.length && sl.toasts.length === 1 && !sl.open && !sl.bn, { rq, sl });
  }
  // ================================================================ g) the place title
  if (want('g')) {
    await setup(); await quiet();
    await ev(() => { const G = window.G, Q = G.state.quests; Q.active = [{ id: 'king', step: 0, prog: 0 }]; window.__bn = []; window.__stings = []; G.enterDungeon({ id: 'mossyBurrow', floor: 1 }); });
    await waitMode(page, 'dungeon', 60000);
    await until(() => window.G.questMoments.stats.lastTitle?.quest === 'king' && window.G.ui.banners.live?.style === 'place', null, 15000);
    const t1 = await ev(() => ({ t: window.G.questMoments.stats.lastTitle, bn: window.__bn.map(b => b[2] + ':' + b[0]), stings: [...window.__stings], text: document.querySelector('.banners .bn-place')?.textContent.replace(/\s+/g, ' ').trim() }));
    R.check('g) the Mossy Burrow, floor 1: the place title in the arrival banner\'s place ("The King of Squish" · Mossy Burrow · "Floor 1 of 2 · Find the stairs down to floor 2"), the sting', t1.t.title === 'Mossy Burrow' && t1.t.kicker === 'The King of Squish' && t1.t.sub === 'Floor 1 of 2 · Find the stairs down to floor 2' && t1.stings.includes('place') && /The King of Squish/.test(t1.text || ''), t1);
    const noArea = await ev(() => !document.querySelector('.banners .bn-area'));
    R.check('g) …and no "Floor 1 of 2" area banner over it', noArea);
    await ev(() => { window.__bn = []; window.G.enterDungeon({ id: 'mossyBurrow', floor: 2 }); });
    await waitMode(page, 'dungeon', 60000);
    await until(() => window.G.questMoments.stats.lastTitle?.step === 1 && window.G.ui.banners.live?.style === 'place', null, 15000);
    const t2 = await ev(() => ({ t: window.G.questMoments.stats.lastTitle, q: window.G.state.quests.active.find(q => q.id === 'king') }));
    R.check('g) floor 2: the floor step done on arrival, the next one titled ("Floor 2 of 2 · Defeat King Mochi")', t2.t.sub === 'Floor 2 of 2 · Defeat King Mochi' && t2.q.step === 1 && t2.q.tt.includes('1|dun:mossyBurrow:2'), t2);
    // once per step and area: floor 2 again
    await quiet();
    const n0 = await ev(() => window.G.questMoments.stats.titles);
    await ev(() => window.G.enterDungeon({ id: 'mossyBurrow', floor: 2 }));
    await waitMode(page, 'dungeon', 60000); await sleep(page, 1200);
    const again = await ev(n0 => ({ n: window.G.questMoments.stats.titles - n0, area: [...document.querySelectorAll('.banners .bn-area')].length, place: window.G.ui.banners.live?.style === 'place' }), n0);
    R.check('g) back on floor 2 with the same step: no second title (the area banner as usual)', again.n === 0 && !again.place, again);
    // a boss's card: the place title steps aside at once
    await quiet();
    await ev(() => { const G = window.G; delete G.state.quests.active[0].tt; G.questMoments.arrive(); });
    await until(() => window.G.ui.banners.live?.style === 'place', null, 8000);
    await ev(() => window.G.ui.banner('King Mochi the Squishy', 'appears!', { style: 'boss', duration: 1.2 }));
    await until(() => window.G.ui.banners.live?.style === 'boss', null, 3000).catch(() => {});
    const bs = await ev(() => ({ live: window.G.ui.banners.live?.style, place: !!document.querySelector('.banners .bn-place') }));
    R.check('g) a boss\'s card comes: the place title steps aside at once', bs.live === 'boss' && !bs.place, bs);
    // Blossom Hollow: Pond Park walked into with Kero's quest at "Visit Kero"
    await ev(() => window.G.returnToVillage()); await waitMode(page, 'village', 60000); await quiet();
    await ev(() => { const G = window.G, Q = G.state.quests; Q.active = [{ id: 'keroRod', step: 0, prog: 0 }]; G.player.setPos(112, 124); });
    await until(() => window.G.questMoments.last.includes('district:core') && !window.G.questMoments.last.includes('giver:kero'), null, 5000);
    // …with a dialogue up: it waits (walked up to Kero, where he is now: the giver's area)
    await ev(() => { const G = window.G, k = G.npcs.find(n => n.id === 'kero'); window.__t0 = G.questMoments.stats.titles; G.ui.dialogue({ speaker: 'Rosie', lines: ['Off to the pond?'] }); G.player.setPos(k.pos.x + 3, k.pos.z + 2); });
    await until(() => window.G.questMoments.last.includes('giver:kero'), null, 5000);
    await sleep(page, 800);
    const w0 = await ev(() => ({ n: window.G.questMoments.stats.titles - window.__t0, pend: [...window.G.questMoments.pend] }));
    await ev(() => window.G.ui.dlg.finish(-1));
    await until(() => window.G.questMoments.stats.titles > window.__t0 && window.G.ui.banners.live?.style === 'place', null, 8000);
    const pp = await ev(() => window.G.questMoments.stats.lastTitle);
    R.check('g) walked up to Kero with "Visit Kero": no title over the dialogue; once it closes, "Pond Guardian\'s Apprentice" · where he is now (the map\'s words: by the koi pond) · "Visit Kero, the pond guardian"', w0.n === 0 && w0.pend.includes('giver:kero') && pp.key === 'giver:kero' && !!pp.title && !/^Blossom Hollow$/.test(pp.title) && pp.kicker === "Pond Guardian's Apprentice" && pp.sub === 'Visit Kero, the pond guardian', { w0, pp });
    // a zone: Takemori saved, the ledger to bring home: the village's name on arrival
    await quiet();
    await ev(() => { const G = window.G, Q = G.state.quests; G.zoneDebug.saveVillage('bamboo'); Q.active = [{ id: 'tk_ledger', step: 1, prog: 0 }]; G.enterRegion('bamboo'); });
    await waitMode(page, 'dungeon', 60000);
    await until(() => window.G.questMoments.stats.lastTitle?.quest === 'tk_ledger' && window.G.ui.banners.live?.style === 'place', null, 15000);
    const tz = await ev(() => ({ t: window.G.questMoments.stats.lastTitle, area: !!document.querySelector('.banners .bn-area') }));
    R.check('g) the Whispering Bamboo Grove with Chiku\'s ledger to bring home: "The Missing Ledger" · Takemori Village · "Bring the ledger back to Chiku", in the zone banner\'s place', tz.t.title === 'Takemori Village' && tz.t.sub === 'Bring the ledger back to Chiku' && !tz.area, tz);
    await ev(() => window.G.returnToVillage()); await waitMode(page, 'village', 60000);
  }

  // ================================================================ h) Shadow's lines
  const said = () => ev(() => window.G.questMoments.said.map(x => `${x[0]}:${x[1]}:${x[2]}`));
  const saidOf = (q, step, beat) => until(([q, step, beat]) => window.G.questMoments.said.some(x => x[0] === q && x[1] === step && x[2] === beat), [q, step, beat], 25000).then(() => true, () => false);
  const lineToast = text => ev(t => [...document.querySelectorAll('.toasts .toast')].some(e => e.textContent.includes(t.slice(0, 24))), text);
  if (want('h') || want('i') || want('j') || want('k')) {
    await ev(() => { clearInterval(window.__inv); window.__inv = setInterval(() => { const G = window.G; if (G.player) { G.player.invuln = true; G.actions.restoreAll?.(); } }, 250); });
  }
  if (want('h')) {
    await setup(); await quiet();
    // (the den's floor 2 not reached yet, or g)'s visit would finish "Reach the second floor" on arrival at floor 1)
    await ev(() => { const G = window.G, Q = G.state.quests, r = G.state.dungeon.dens?.mossyBurrow; if (r) r.bestFloor = 0; Q.active = [{ id: 'king', step: 0, prog: 0 }]; G.questMoments.said.length = 0; G.questMoments.lineQ = []; const L = G.world.landmarks?.dungeon || { x: 178, z: 78 }; G.player.setPos(L.x + 2, L.z + 4); });
    const d0 = await saidOf('king', 0, 'door');
    const d0t = d0 && await lineToast("It smells like stolen mochi");
    R.check("h) at the Burrow door with the King of Squish: Shadow's door line (\"It smells like stolen mochi down there…\") on his card", d0 && d0t, await said());
    await ev(() => window.G.enterDungeon({ id: 'mossyBurrow', floor: 1 })); await waitMode(page, 'dungeon', 60000);
    const a1 = await saidOf('king', 0, 'arrive');
    const order = await ev(() => { const M = window.G.questMoments, G = window.G; return { titled: M.stats.lastTitle?.step === 0, banner: !!G.ui.banners.busy, last: M.stats.lastTitle?.key, tw: M.stats.titleWhy, panels: Object.keys(G.ui.panels || {}).filter(k => G.ui.isOpen(k)), why: M.stats.lineWhy, lineQ: M.lineQ.map(e => e.k), pend: [...M.pend], keys: M.last, tt: G.state.quests.active[0]?.tt, step: G.state.quests.active[0]?.step, toasts: [...document.querySelectorAll('.toasts .toast')].map(t => t.textContent.slice(0, 40)), fight: M.fight() }; });
    R.check("h) floor 1: after its place title, his arrive line (\"The King's chamber is on the second floor…\")", a1 && order.titled, { a1, order, said: await said() });
    await ev(() => window.G.enterDungeon({ id: 'mossyBurrow', floor: 2 })); await waitMode(page, 'dungeon', 60000);
    const a2 = await saidOf('king', 1, 'arrive');
    // the boss in sight (before the fight): on the screen 13 m off (he notices you at 9), no foes awake
    await ev(() => { const G = window.G, D = G.dungeon, b = D.boss, C = G.combat; for (const m of [...D.monsters]) if (m.alive && m !== b) C.applyDamageToMonster(m, Math.ceil(m.life) + 1, { silent: true }); /* (the whole floor: a pack that chased you from the stairs would be a fight, and he never talks in one) */ { const cam = G.engine.camera, f = cam.position.clone(); cam.getWorldDirection(f); f.y = 0; f.normalize(); let put = null; for (const r of [13, 12, 15, 11, 16]) for (const side of [0, 3, -3, 6, -6]) { const x = b.pos.x - f.x * r - f.z * side, z = b.pos.z - f.z * r + f.x * side; if (!put && G.world.walkable(x, z)) put = [x, z]; } if (put) G.player.setPos(put[0], put[1]); G.player.moveTarget = null; G.engine.rig.focus.copy(G.player.pos); G.engine.rig.snap(); } /* (the boss up the screen, 13 m off: in sight, not yet noticing you at 9 m) */ });
    const bl = await saidOf('king', 1, 'boss');
    const bd = bl ? null : await ev(() => { const G = window.G, M = G.questMoments, b = G.dungeon?.boss, P = G.player; return { why: M.stats.lineWhy, lineQ: M.lineQ.map(e => e.k), sl: G.state.quests.active[0]?.sl, step: G.state.quests.active[0]?.step, boss: b && { alive: b.alive, aggro: b.aggro, intro: b.introDone, d: Math.round(Math.hypot(P.pos.x - b.pos.x, P.pos.z - b.pos.z)) }, fight: M.fight(), toasts: [...document.querySelectorAll('.toasts .toast')].map(t => t.textContent.slice(0, 40)) }; });
    R.check("h) floor 2: his arrive line, and with King Mochi in sight (not fighting yet): \"Sniff… sugar and crown polish! King Mochi is just ahead.\"", a2 && bl, { said: await said(), bd });
    // once per place and step: floor 2 again
    const n2 = await ev(() => window.G.questMoments.stats.lines);
    await ev(() => window.G.enterDungeon({ id: 'mossyBurrow', floor: 2 })); await waitMode(page, 'dungeon', 60000); await sleep(page, 2500);
    const n3 = await ev(n => window.G.questMoments.stats.lines - n, n2);
    R.check('h) back on floor 2 with the same step: no line again', n3 === 0, { n3 });
    // never in a fight: a line due in a fight waits; a line up when a fight starts steps aside
    await ev(() => { const G = window.G, P = G.player, D = G.dungeon; const ms = D.monsters.filter(m => m.alive && !m.ally && m !== D.boss).sort((a, b) => a.pos.distanceTo(P.pos) - b.pos.distanceTo(P.pos)).slice(0, 2); for (const m of ms) { m.pos.set(P.pos.x + 2, P.pos.y, P.pos.z + 1); m.aggro = true; } const q = G.state.quests.active.find(x => x.id === 'king'); delete q.sl; G.questMoments.lineQ = []; G.questMoments.queueLine(q, G.story.def('king'), G.story.stepOf(q), 'arrive', 30); });
    await until(() => window.G.questMoments.fight(), null, 6000).catch(() => {});
    await sleep(page, 1500);
    const f0 = await ev(() => ({ why: window.G.questMoments.stats.lineWhy, q: window.G.questMoments.lineQ.length, fight: window.G.questMoments.fight() }));
    await ev(() => { const G = window.G, C = G.combat; for (const m of [...G.dungeon.monsters]) if (m.alive && !m.ally && m !== G.dungeon.boss && m.pos.distanceTo(G.player.pos) < 30) C.applyDamageToMonster(m, Math.ceil(m.life) + 1, { silent: true }); });
    const f1 = await saidOf('king', 1, 'arrive');
    R.check('h) never in a fight: a line due with yokai on you waits ("fight"), and is said once things are calm', f0.fight && f0.why === 'fight' && f0.q === 1 && f1, { f0, f1 });
    // a rescue's line by the cage (Kome on the Bamboo Depths' floor 2), and a zone dungeon's gate
    await ev(() => { const G = window.G, Q = G.state.quests; G.zoneDebug.saveVillage('bamboo'); Q.active = [{ id: 'tk_kome', step: 0, prog: 0 }]; G.questMoments.lineQ = []; G.enterRegion('bamboo'); });
    await waitMode(page, 'dungeon', 60000);
    await ev(() => { const G = window.G, g = G.dungeon.gatePos; if (g) G.player.setPos(g.x + 2, g.z + 2); });
    const zd = await saidOf('tk_kome', 0, 'door');
    await ev(() => window.G.enterDungeon({ id: 'bambooDepths', floor: 2 })); await waitMode(page, 'dungeon', 60000);
    const za = await saidOf('tk_kome', 0, 'arrive');
    await ev(() => { const G = window.G, D = G.dungeon, s = G.story.stepOf(G.state.quests.active.find(q => q.id === 'tk_kome')), m = D.questMark?.(s), C = G.combat; if (!m) return; for (const x of [...D.monsters]) if (x.alive && !x.ally && Math.hypot(x.pos.x - m.x, x.pos.z - m.z) < 30) C.applyDamageToMonster(x, Math.ceil(x.life) + 1, { silent: true }); for (const [dx, dz] of [[6, 0], [-6, 0], [0, 6], [0, -6], [5, 5]]) if (G.world.walkable(m.x + dx, m.z + dz)) { G.player.setPos(m.x + dx, m.z + dz); break; } });
    const zn = await saidOf('tk_kome', 0, 'near');
    R.check("h) the Missing Cook: Shadow's line at the Bamboo Depths' gate (\"I've got Kome's scent…\"), on floor 2, and by her cage (\"Kome! She's in that cage!\")", zd && za && zn, await said());
    await ev(() => window.G.returnToVillage()); await waitMode(page, 'village', 60000); await quiet();
  }
  // ================================================================ i) the hand-in (yours)
  if (want('i')) {
    await setup(); await quiet();
    await ev(() => { const G = window.G, Q = G.state.quests; Q.active = [{ id: 'king', step: 1, prog: 0 }]; G.questMoments.said.length = 0; G.enterDungeon({ id: 'mossyBurrow', floor: 2 }); });
    await waitMode(page, 'dungeon', 60000);
    await ev(() => { const G = window.G, b = G.dungeon.boss; G.combat.applyDamageToMonster(b, Math.ceil(b.life) + 1, {}); });
    await until(() => window.G.state.quests.active.find(q => q.id === 'king')?.handIn, null, 15000);
    const h0 = await ev(() => { const G = window.G, t = G.questTarget(); return { step: G.story.uiList().find(q => q.id === 'king')?.steps.at(-1)?.text, ptr: t?.label, lead: t?.lead, done: G.state.quests.done.includes('king'), marker: G.story.markerFor('rosie') }; });
    const hl = await saidOf('king', 2, 'home');
    R.check('i) King Mochi down: the quest waits for its hand-in ("Bring the festival mochi home to Rosie"), not done; the pointer: the way out, Shadow leading; Rosie\'s "!"; Shadow\'s way-home line ("Rosie\'s going to be so happy!")', h0.step === 'Bring the festival mochi home to Rosie' && !h0.done && h0.ptr === 'The way out' && h0.lead && h0.marker === '!' && hl, { h0, hl });
    await ev(() => window.G.returnToVillage()); await waitMode(page, 'village', 60000); await quiet();
    const h1 = await ev(() => { const G = window.G, t = G.questTarget(), n = G.npcs.find(x => x.id === 'rosie'); return { ptr: t?.label, d: t ? Math.hypot(t.pos.x - n.pos.x, t.pos.z - n.pos.z) : null, lead: t?.lead }; });
    R.check('i) home: the pointer is Rosie where she is now (the map\'s People lookup), Shadow leading', h1.ptr === 'Rosie' && h1.d < 0.5 && h1.lead, h1);
    // near her: the place title (her spot's name)
    await ev(() => { const G = window.G, n = G.npcs.find(x => x.id === 'rosie'); G.player.setPos(n.pos.x + 40, n.pos.z + 34); });
    await until(() => !window.G.questMoments.last.includes('giver:rosie'), null, 5000).catch(() => {});
    await ev(() => { const G = window.G, n = G.npcs.find(x => x.id === 'rosie'); window.__t0 = G.questMoments.stats.titles; G.player.setPos(n.pos.x + 2.5, n.pos.z + 1.5); G.player.moveTarget = null; });
    await until(() => window.G.questMoments.stats.titles > window.__t0 && window.G.ui.banners.live?.style === 'place', null, 8000).catch(() => {});
    const ht = await ev(() => window.G.questMoments.stats.lastTitle);
    R.check('i) near Rosie: the hand-in\'s place title ("The King of Squish" · where she is · "Bring the festival mochi home to Rosie")', ht?.key === 'giver:rosie' && ht.kicker === 'The King of Squish' && ht.sub === 'Bring the festival mochi home to Rosie' && !!ht.title, ht);
    await quiet();
    // F at Rosie: the scene
    const coins0 = await ev(() => { const G = window.G; window.__bn = []; window.__fly = 0; const fx = G.ui.layers.fx; new MutationObserver(m => { for (const r of m) for (const n of r.addedNodes) if (n.classList?.contains('fly')) window.__fly++; }).observe(fx, { childList: true }); window.__anim = []; const n = G.npcs.find(x => x.id === 'rosie'), play = n.anim.play.bind(n.anim); n.anim.play = (a, o) => { window.__anim.push(a); return play(a, o); }; return G.state.coins; });
    await ev(() => { const G = window.G, n = G.npcs.find(x => x.id === 'rosie'); G.player.setPos(n.pos.x + 1.1, n.pos.z + 0.6); G.player.faceTo(n.pos.x, n.pos.z); G.interactCooldown = 0; });
    for (let i = 0; i < 4 && !(await ev(() => window.G.ui.dlg.active)); i++) { await page.keyboard.press('f'); await until(() => window.G.ui.dlg.active, null, 1500).catch(() => {}); }
    const sc = await ev(() => ({ dlg: window.G.ui.dlg.active, text: (window.G.ui.dlg.lines || []).map(l => l.text).join(' '), anim: [...window.__anim] }));
    await drainDialogue(page);
    await until(() => !!document.querySelector('.banners .bn-stamp'), null, 8000).catch(() => {});
    await sleep(page, 900);
    const st = await ev(c0 => { const G = window.G; return { stamp: !!document.querySelector('.banners .bn-stamp .st-hanko'), title: document.querySelector('.banners .bn-stamp .st-t')?.textContent, chips: document.querySelectorAll('.banners .bn-stamp .qc-chip').length, banner: window.__bn.some(b => b[0] === 'Quest Complete!'), fly: window.__fly, coins: G.state.coins - c0, done: G.state.quests.done.includes('king'), uniques: [...G.state.inventory, ...G.state.stash].filter(x => x?.rarity === 'unique').length }; }, coins0);
    R.check('i) F at Rosie: her happy hop and hearts, her thank-you ("The festival mochi! You got it all back!…")', sc.dlg && /festival mochi/.test(sc.text) && sc.anim.includes('happy'), sc);
    R.check('i) then the reward flies from her into the coins and the bag (the coins +500, a unique), the "Quest complete" stamp on its card (4 chips), no "Quest Complete!" banner; the quest done', st.stamp && st.title === 'The King of Squish' && st.chips === 4 && !st.banner && st.fly >= 3 && st.coins >= 500 && st.uniques >= 1 && st.done, st);
    const nx = await until(() => window.G.ui.isOpen('questCard'), null, 15000).then(() => ev(() => document.querySelector('.p-qcard .qc-title')?.textContent), () => null);
    R.check('i) the chain goes on: "A Shrine for Wishes"\'s card after the stamp', nx === 'A Shrine for Wishes', { nx });
    await page.keyboard.press('Enter'); await cardClosed();
  }
  // ================================================================ j) a crew's hand-in; a zone quest's
  if (want('j')) {
    await setup(); await quiet();
    const cr = await ev(async () => {
      const G = window.G, { DEBUG_SECTIONS } = await import('/src/debug/registry.js'), Q = G.state.quests;
      Q.active = [{ id: 'king', step: 0, prog: 0 }]; Q.cards = []; G.questMoments.said.length = 0;
      DEBUG_SECTIONS.get('cozy').actions.find(a => a.label === 'Give a sure-thing crew').run(G);
      G.state.pantry = { ...(G.state.pantry || {}), onigiri: 6 }; G.state.potions.heart = 6;
      const won = () => Q.done.includes('king') || !!Q.active.find(q => q.id === 'king')?.handIn, out = { tries: 0 };
      for (let t = 0; t < 4 && !won(); t++) { out.tries++; for (const k in G.state.cozy.exp.tired) delete G.state.cozy.exp.tired[k]; const r = G.cozy.exp.send('quest:king', ['hero:moka', 'hero:poe'], { meals: { onigiri: 2 }, potions: 3 }); if (!r?.ok) { out.why = r?.why; break; } G.cozy.exp.finishAll(); await new Promise(q => setTimeout(q, 300)); }
      const q = Q.active.find(x => x.id === 'king');
      return { ...out, handIn: !!q?.handIn, crewBy: q?.crewBy || null, rep: G.cozy.exp.reports().at(-1)?.quest || null };
    });
    await sleep(page, 2500);
    const noHome = await ev(() => !window.G.questMoments.said.some(x => x[0] === 'king' && x[2] === 'home'));
    R.check('j) the King of Squish by a crew: it waits for your hand-in (the report: done, Rosie wants to hear all about it); no way-home line from Shadow (he wasn\'t there)', cr.handIn && !!cr.crewBy && cr.rep?.done && cr.rep?.handIn && noHome, { cr, noHome });
    await ev(() => { const G = window.G, n = G.npcs.find(x => x.id === 'rosie'); G.player.setPos(n.pos.x + 1.2, n.pos.z); G.talkTo(n); });
    await until(() => window.G.ui.dlg.active, null, 5000).catch(() => {});
    const cl = await ev(() => (window.G.ui.dlg.lines || []).map(l => l.text).join(' | '));
    await drainDialogue(page); await sleep(page, 400);
    const cd = await ev(() => ({ done: window.G.state.quests.done.includes('king') }));
    await until(() => window.G.state.quests.active.some(q => q.id === 'shrine'), null, 8000).catch(() => {});
    cd.next = await ev(() => window.G.state.quests.active.some(q => q.id === 'shrine'));
    R.check('j) talking to Rosie: her line about the crew ("… came by and told me the whole story!"), then her thank-you; the quest done, "A Shrine for Wishes" next', /told me the whole story/.test(cl) && /festival mochi/.test(cl) && cd.done && cd.next, { cl, cd });
    await ev(() => window.G.ui.close('questCard')); await cardClosed().catch(() => {});
    // a zone quest's closing talk plays the scene (Chiku and his ledger)
    await ev(() => { const G = window.G, Q = G.state.quests; G.zoneDebug.saveVillage('bamboo'); Q.active = [{ id: 'tk_ledger', step: 1, prog: 0 }]; Q.cards = []; G.enterRegion('bamboo'); });
    await waitMode(page, 'dungeon', 60000); await quiet();
    await ev(() => { window.__bn = []; const V = window.G.dungeon.village, v = V.villager('tk_chiku'); window.G.player.setPos(v.pos.x + 0.8, v.pos.z + 0.8); V.talk(v); });
    await until(() => window.G.ui.dlg.active, null, 5000).catch(() => {});
    const zl = await ev(() => (window.G.ui.dlg.lines || []).map(l => l.text).join(' '));
    await drainDialogue(page);
    await until(() => !!document.querySelector('.banners .bn-stamp'), null, 8000).catch(() => {});
    const zs = await ev(() => ({ stamp: document.querySelector('.banners .bn-stamp .st-t')?.textContent, done: window.G.state.quests.done.includes('tk_ledger'), banner: window.__bn.some(b => b[0] === 'Quest Complete!') }));
    R.check('j) a zone quest\'s closing talk (Chiku): his thank-you, the stamp ("The Missing Ledger"), no banner, done', /My ledger!/.test(zl) && zs.stamp === 'The Missing Ledger' && zs.done && !zs.banner, { zl, zs });
    await ev(() => window.G.returnToVillage()); await waitMode(page, 'village', 60000); await quiet();
  }
  // ================================================================ k) the save migration
  if (want('k')) {
    const fx = JSON.parse(fs.readFileSync(new URL('./fixtures/precozy-0.5.1.json', import.meta.url), 'utf8'));
    const load = async (st) => {
      await ev(s => { window.G.saveBlocked = true; localStorage.clear(); localStorage.setItem('chewy3d.save', s); }, JSON.stringify(st));
      await page.goto(`${BASE}/?notitle&nointro&notut&hour=11&dseed=1`, { waitUntil: 'load' });
      await until(() => window.__ready === true && window.G?.player && window.G.questMoments, null, 60000);
      await installProbes(page); await spyBanners();
    };
    // a real 0.5.1 save: "A Home for Everyone" at its first step (8 homes): it loads where it was
    const old = JSON.parse(fx.storage['chewy3d.save']);
    await load(old);
    const m0 = await ev(() => { const Q = window.G.state.quests, q = Q.active.find(x => x.id === 'homes'); return { step: q?.step, handIn: !!q?.handIn, done: [...Q.done] }; });
    R.check('k) a real 0.5.1 save loads with "A Home for Everyone" where it was (step 1 of 1, not waiting, not done)', m0.step === 0 && !m0.handIn && !m0.done.includes('homes') && m0.done.includes('burrow1'), m0);
    // …a record past its last step (done, never handed in): it loads waiting for its hand-in, then finishes through Rosie
    const past = JSON.parse(fx.storage['chewy3d.save']); past.quests.active = [{ id: 'homes', step: 1, prog: 0 }];
    await load(past);
    const m1 = await ev(() => { const G = window.G, q = G.state.quests.active.find(x => x.id === 'homes'); return { handIn: !!q?.handIn, done: G.state.quests.done.includes('homes'), step: G.story.uiList().find(x => x.id === 'homes')?.steps.at(-1)?.text }; });
    await ev(() => { window.G.saveBlocked = false; window.G.save(); });
    await page.goto(`${BASE}/?notitle&nointro&notut&hour=11&dseed=1`, { waitUntil: 'load' });
    await until(() => window.__ready === true && window.G?.player && window.G.questMoments, null, 60000);
    await installProbes(page);
    const m2 = await ev(() => !!window.G.state.quests.active.find(x => x.id === 'homes')?.handIn);
    await ev(() => { const G = window.G, n = G.npcs.find(x => x.id === 'rosie'); G.player.setPos(n.pos.x + 1.2, n.pos.z); G.talkTo(n); });
    await until(() => window.G.ui.dlg.active, null, 5000).catch(() => {});
    await drainDialogue(page); await sleep(page, 400);
    await until(() => window.G.state.quests.active.some(q => q.id === 'lights'), null, 8000).catch(() => {});
    const m3 = await ev(() => ({ done: window.G.state.quests.done.includes('homes'), next: window.G.state.quests.active.some(q => q.id === 'lights') }));
    R.check('k) a record past its last step (done, not handed in) loads waiting for its hand-in ("Tell Rosie the new friends are home"); the wait is kept over a save and reload; telling Rosie finishes it and "Lights of Blossom Hollow" starts', m1.handIn && !m1.done && m1.step === 'Tell Rosie the new friends are home' && m2 && m3.done && m3.next, { m1, m2, m3 });
  }
  allErrors.push(...errors); allWarns.push(...warns);
  await browser.close();

  // ================================================================ d) the QA's quiet sessions: the old banner
  if (want('d')) {
    ({ browser, page, errors, warns } = await launch({ w: 1600, h: 900 }));
    ev = (f, a) => page.evaluate(f, a); until = (f, a, timeout = 20000) => page.waitForFunction(f, a, { timeout });
    await boot(page, 'fresh&nointro&notut&hour=11');
    await spyBanners(); await setup(); await quiet();
    await take('king'); await sleep(page, 1500);
    const qd = await ev(() => ({ cards: window.G.questMoments.cards, open: window.G.ui.isOpen('questCard'), bn: window.__bn.map(b => b[0]) }));
    R.check('d) a quiet QA session (?nointro, no ?qcard): no card, the old "New Quest" banner', !qd.cards && !qd.open && qd.bn.includes('New Quest'), qd);
    allErrors.push(...errors); allWarns.push(...warns);
    await browser.close();
  }
  // ================================================================ e) the pad (the Deck)
  if (want('e')) {
    ({ browser, page, errors, warns } = await launch({ w: 1280, h: 800 }));
    ev = (f, a) => page.evaluate(f, a); until = (f, a, timeout = 20000) => page.waitForFunction(f, a, { timeout });
    await boot(page, 'fresh&nointro&notut&qcard&hour=11');
    await installPad(page); await padTap(page, 'DDown');
    // (the D-pad's ▼ is the pad's interact: a villager stood by the spawn may have started talking)
    await ev(() => { const G = window.G; if (G.ui.dlg.active) G.ui.dlg.finish(-1); }); await until(() => !window.G.ui.dlg.active && !window.G.player.controlLocked, null, 8000);
    await setup(); await quiet();
    await take('umbrella'); await cardOpen();
    await until(() => window.G.ui.padNav.cur?.classList.contains('qc-go'), null, 5000).catch(() => {});
    const pf = await ev(() => ({ dev: window.G.controls.device, focus: window.G.ui.padNav.cur?.className || null, glyph: !!document.querySelector('.p-qcard .qc-go .pad-only .kc.pad svg'), hints: document.querySelector('.pad-hints')?.textContent || '' }));
    const fit = await ev(panelFit);
    R.check('e) the pad: the focus starts on "Let\'s go!" (its A glyph on it); the card fits the Deck', pf.dev === 'pad' && /qc-go/.test(pf.focus || '') && pf.glyph && !fit.length, { pf, fit });
    await padTap(page, 'A');
    const pc = await cardClosed().then(() => true, () => false);
    R.check('e) A presses it', pc);
    allErrors.push(...errors); allWarns.push(...warns);
    await browser.close();
  }
  // ================================================================ f) touch (a phone)
  if (want('f')) {
    const T = await launchTouch({ w: PHONE.w, h: PHONE.h, dpr: PHONE.dpr, ua: PHONE.ua });
    ({ browser, page, errors, warns } = T);
    ev = (f, a) => page.evaluate(f, a); until = (f, a, timeout = 20000) => page.waitForFunction(f, a, { timeout });
    await boot(page, 'fresh&nointro&notut&qcard&hour=11');
    await setup(); await quiet();
    await take('king'); await cardOpen();
    const fit = await ev(panelFit), r = await ev(() => { const b = document.querySelector('.p-qcard .qc-go').getBoundingClientRect(), p = document.querySelector('.p-qcard').getBoundingClientRect(); return { go: [b.left + b.width / 2, b.top + b.height / 2, Math.min(b.width, b.height)], card: [p.left, p.top, p.right, p.bottom].map(Math.round), phone: window.G.ui.root.classList.contains('m-phone') }; });
    R.check('f) a phone: the card fits (panelFit), "Let\'s go!" a 44 px target', r.phone && !fit.length && r.go[2] >= 44, { fit, r });
    await T.F.tap(r.go[0], r.go[1]);
    const tc = await cardClosed().then(() => true, () => false);
    R.check('f) a tap on "Let\'s go!" presses it', tc);
    allErrors.push(...errors); allWarns.push(...warns);
    await browser.close();
  }
} catch (e) { R.check('scenario ran to the end', false, String(e.message || e).split('\n')[0]); allErrors.push(...(errors || [])); await Promise.race([browser.close().catch(() => {}), new Promise(r => setTimeout(r, 8000))]); } // (a crashed page's browser may never close)
process.exit(R.finish(allErrors, allWarns) ? 1 : 0);
