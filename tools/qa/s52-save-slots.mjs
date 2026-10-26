// Scenario 52: save slots (SL-1, core/autosave.js + ui/title.js). Three adventures, each its own save: slot 1 keeps the
// first keys (an old save is slot 1), New Game picks an empty slot, Load Game plays another slot (a reload onto it),
// Continue plays the one played last, a delete asks first and nothing writes a deleted slot back, all full offers
// Start over, the pad and Escape work the picker, a damaged slot shows as scrambled.
// Shots: tools/qa/tmp/slots/*.png.  node tools/qa/s52-save-slots.mjs
import fs from 'node:fs';
import { launch, boot, sleep, makeReport, drainDialogue, BASE } from './lib.mjs';

const R = makeReport('S52 save slots');
const OUT = 'tools/qa/tmp/slots'; fs.mkdirSync(OUT, { recursive: true });
const { browser, page, errors, warns } = await launch();
const key = n => (n === 1 ? 'chewy3d.save' : `chewy3d.save.${n}`);
const read = n => page.evaluate(k => { const r = localStorage.getItem(k); return r ? JSON.parse(r) : null; }, key(n));
// the title with its buttons in (their pop-in ends ~2.6 s after the page shows the title)
async function title(qs = '') {
  await page.goto(`${BASE}/${qs}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true && window.G?.titleActive && window.G.ui.mode === 'title', null, { timeout: 60000 });
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.ti-btns .btn:last-child')).opacity === '1', null, { timeout: 15000 });
}
const click = sel => page.evaluate(s => { const b = document.querySelector(s); if (!b) return false; b.click(); return true; }, sel);
// a press that reloads the page onto a slot: wait for the new page to be up in the village (skipTitle)
async function clickReload(sel) {
  const nav = page.waitForEvent('framenavigated', { timeout: 30000 });
  await click(sel).catch(() => {}); // (the reload can tear the evaluate down)
  await nav;
  await page.waitForFunction(() => window.__ready === true && window.G?.player && !window.G.titleActive, null, { timeout: 60000 });
}
// a new game opens on the cinematic (world/opening.js): Esc skips it
async function skipOpening() {
  await page.waitForFunction(() => window.G.opening?.active, null, { timeout: 10000 }).catch(() => {});
  for (let i = 0; i < 8 && await page.evaluate(() => !!window.G.opening?.active); i++) { await page.keyboard.press('Escape'); await sleep(page, 400); }
}
const cards = () => page.evaluate(() => [...document.querySelectorAll('.sl-card')].map(c => ({ n: +c.dataset.n, empty: c.classList.contains('empty'), last: c.classList.contains('last'), asking: c.classList.contains('asking'), name: c.querySelector('.sl-name')?.textContent, text: c.innerText.replace(/\s+/g, ' ').trim(), btns: [...c.querySelectorAll('[data-s]')].map(b => b.dataset.s) })));

try {
  // ---- slot 1 from an ordinary game (the keys from before slots)
  await boot(page, 'fresh&nointro');
  await page.evaluate(() => { const G = window.G; G.state.coins = 4242; G.save(); });
  const s1 = await read(1);
  R.check('a game with no slot picked saves to slot 1 (chewy3d.save), with savedAt', s1?.coins === 4242 && s1.savedAt > 0, JSON.stringify({ coins: s1?.coins, at: s1?.savedAt }));

  // ---- the title: Continue names the adventure; Load Game is there
  await title();
  const t0 = await page.evaluate(() => ({ btns: [...document.querySelectorAll('.ti-btns .btn')].map(b => [b.dataset.a, b.disabled]), sub: document.querySelector('.ti-bsub').textContent }));
  R.check('title: New Game · Continue · Load Game · Settings, Continue says "Adventure 1 · Chewy, level 1"', t0.btns.map(b => b[0]).join() === 'newGame,continue,load,settings' && !t0.btns[1][1] && !t0.btns[2][1] && t0.sub === 'Adventure 1 · Chewy, level 1', JSON.stringify(t0));
  await page.screenshot({ path: `${OUT}/title.png` });

  // ---- Load Game: three cards, slot 1 filled and last played
  await click('[data-a="load"]');
  await page.waitForFunction(() => document.querySelector('.title.picking') && document.querySelectorAll('.sl-card').length === 3, null, { timeout: 5000 });
  let c = await cards();
  R.check('Load Game: three cards, Adventure 1 filled + last played (Play, delete), 2 and 3 empty (New Game)', c.length === 3 && !c[0].empty && c[0].last && c[0].btns.join() === 'play,del' && c[1].empty && c[2].empty && c[1].btns.join() === 'new', JSON.stringify(c));
  R.check('the card shows the hero, level, day, coins and when', /Chewy/.test(c[0].text) && /Level 1/.test(c[0].text) && /Day \d+/.test(c[0].text) && /4,242/.test(c[0].text) && /Today/.test(c[0].text), c[0].text);
  await page.waitForFunction(() => [...document.querySelectorAll('.sl-card')].every(x => getComputedStyle(x).opacity === '1'), null, { timeout: 5000 });
  await page.screenshot({ path: `${OUT}/load.png` });

  // ---- Escape backs out
  await page.keyboard.press('Escape');
  const esc = await page.evaluate(() => ({ picking: !!document.querySelector('.title.picking'), t: window.G.ui.titleScreen.picking }));
  R.check('Escape closes the picker', !esc.picking && !esc.t, JSON.stringify(esc));

  // ---- New Game with a save: the picker, into the empty slot 2 → a reload, the intro, a fresh game in slot 2
  await click('[data-a="newGame"]');
  await page.waitForFunction(() => window.G.ui.titleScreen.picking === 'new', null, { timeout: 5000 });
  const hd = await page.evaluate(() => document.querySelector('.sl-head').textContent);
  c = await cards();
  R.check('New Game with a save opens the picker: filled cards say Start over, empties New Game', hd === 'Where should the new adventure go?' && c[0].btns.join() === 'over,del' && c[1].btns.join() === 'new', JSON.stringify({ hd, c: c.map(x => x.btns) }));
  await clickReload('.sl-card[data-n="2"] [data-s="new"]');
  await skipOpening(); // (a new game's opening first: world/opening.js)
  await page.waitForFunction(() => window.G.ui.dlg.active, null, { timeout: 15000 }); // (Rosie's intro: a new game)
  await drainDialogue(page); await sleep(page, 400); await drainDialogue(page);
  const g2 = await page.evaluate(() => ({ slot: window.G.saveSlot, coins: window.G.state.coins, lvl: window.G.state.player.lvl, playSec: window.G.state.playSec }));
  R.check('the new game plays slot 2: fresh coins, level 1, its play time counting from 0', g2.slot === 2 && g2.coins !== 4242 && g2.lvl === 1 && typeof g2.playSec === 'number', JSON.stringify(g2));
  await page.evaluate(() => { window.G.state.coins = 777; window.G.save(); });
  await page.waitForFunction(() => window.G.state.playSec >= 2, null, { timeout: 15000 });
  const [a1, a2] = [await read(1), await read(2)];
  R.check('slot 2 saves to chewy3d.save.2; slot 1 is untouched', a2?.coins === 777 && a1?.coins === 4242, JSON.stringify({ s1: a1?.coins, s2: a2?.coins }));

  // ---- Continue now plays slot 2 (no reload: the page already holds it)
  await title();
  const sub2 = await page.evaluate(() => document.querySelector('.ti-bsub').textContent);
  R.check('the title remembers slot 2: Continue says Adventure 2', sub2.startsWith('Adventure 2'), sub2);
  await click('[data-a="load"]');
  c = await cards();
  R.check('Load Game: Adventure 2 is last played and shows its play time', c[1].last && !c[0].last && /Played/.test(c[1].text), JSON.stringify(c.map(x => [x.last, x.text])));
  // ---- Play slot 1: a reload onto it
  await clickReload('.sl-card[data-n="1"] [data-s="play"]');
  const g1 = await page.evaluate(() => ({ slot: window.G.saveSlot, coins: window.G.state.coins, mode: window.G.ui.mode, dlg: window.G.ui.dlg.active }));
  R.check('Play on Adventure 1 reloads into it, straight to the village', g1.slot === 1 && g1.coins === 4242 && g1.mode === 'village' && !g1.dlg, JSON.stringify(g1));
  await title();
  await click('[data-a="continue"]');
  await page.waitForFunction(() => !window.G.titleActive && !window.G.ui.iris.active, null, { timeout: 20000 });
  const gc = await page.evaluate(() => ({ slot: window.G.saveSlot, coins: window.G.state.coins, locked: window.G.player.controlLocked }));
  R.check('Continue plays the last-played slot (1) without a reload', gc.slot === 1 && gc.coins === 4242 && !gc.locked, JSON.stringify(gc));

  // ---- delete asks first; Keep it keeps it; Delete empties it
  await title();
  await click('[data-a="load"]');
  await click('.sl-card[data-n="2"] [data-s="del"]');
  c = await cards();
  R.check('delete asks first (Delete / Keep it)', c[1].asking && c[1].btns.join() === 'yes,no' && /gone for good/.test(c[1].text), JSON.stringify(c[1]));
  await page.screenshot({ path: `${OUT}/ask.png` });
  await click('.sl-card[data-n="2"] [data-s="no"]');
  R.check('Keep it keeps it', !!(await read(2)) && !(await cards())[1].asking, '');
  await click('.sl-card[data-n="2"] [data-s="del"]'); await click('.sl-card[data-n="2"] [data-s="yes"]');
  c = await cards();
  const gone = await page.evaluate(() => [localStorage.getItem('chewy3d.save.2'), localStorage.getItem('chewy3d.save.2.prev')]);
  R.check('Delete empties slot 2 (its save and backup)', c[1].empty && !gone[0] && !gone[1], JSON.stringify({ c: c[1], gone }));

  // ---- deleting the slot this page holds: nothing writes it back (the lifecycle saves, a menu save)
  await click('.sl-card[data-n="1"] [data-s="del"]'); await click('.sl-card[data-n="1"] [data-s="yes"]');
  const after = await page.evaluate(() => { window.G.save(); return { s1: localStorage.getItem('chewy3d.save'), cont: document.querySelector('[data-a="continue"]').disabled, load: document.querySelector('[data-a="load"]').disabled, mode: window.G.ui.titleScreen.picking }; });
  R.check('deleting the held slot: G.save no longer writes it; Continue and Load Game disabled; the picker turns to New', !after.s1 && after.cont && after.load && after.mode === 'new', JSON.stringify(after));
  await page.evaluate(() => { dispatchEvent(new Event('pagehide')); dispatchEvent(new Event('beforeunload')); });
  R.check('a page hide does not bring the deleted slot back', !(await read(1)), '');

  // ---- all full: three saves, New Game says so and offers Start over (asks first), into slot 3
  await page.evaluate(([a1, a2]) => {
    localStorage.setItem('chewy3d.save', JSON.stringify({ ...a1, savedAt: Date.now() - 3 * 864e5 }));
    localStorage.setItem('chewy3d.save.2', JSON.stringify({ ...a2, savedAt: Date.now() - 864e5 }));
    localStorage.setItem('chewy3d.save.3', JSON.stringify({ ...a1, coins: 31337, savedAt: Date.now() - 20 * 864e5 }));
    localStorage.setItem('chewy3d.slot', '2');
  }, [a1, a2]);
  await title();
  await click('[data-a="newGame"]');
  const full = await page.evaluate(() => document.querySelector('.sl-head').textContent);
  c = await cards();
  R.check('all full: "All full!" and every card offers Start over', /All full/.test(full) && c.every(x => x.btns.join() === 'over,del'), JSON.stringify({ full, c: c.map(x => x.btns) }));
  R.check('the dates read 3 days ago / Yesterday / a month and day', /3 days ago/.test(c[0].text) && /Yesterday/.test(c[1].text) && /[A-Z][a-z]{2} \d+/.test(c[2].text), JSON.stringify(c.map(x => x.text)));
  await page.waitForFunction(() => [...document.querySelectorAll('.sl-card')].every(x => getComputedStyle(x).opacity === '1'), null, { timeout: 5000 });
  await page.screenshot({ path: `${OUT}/full.png` });

  // ---- the pad: right walks the buttons, down to Back, up back, B out
  const pad = await page.evaluate(() => {
    const T = window.G.ui.titleScreen, A = nav => ({ nav, padHit: k => k === nav, padConsume() {} });
    const at = () => { const b = document.querySelector('.ti-slots .pad-focus'); return b ? (b.closest('.sl-card')?.dataset.n || '') + b.dataset.s : null; };
    const out = [at()];
    T.pad(A(null)); out.push(at());
    for (const n of ['right', 'right', 'right', 'down', 'up', 'left']) { T.pad(A(n)); out.push(at()); }
    T.pad(A('B')); out.push(T.picking);
    return out;
  });
  R.check('pad: focus on a card, right → its delete → the next card, down → Back, up → where it was, B closes', pad[1] === '1over' && pad[2] === '1del' && pad[3] === '2over' && pad[4] === '2del' && pad[5] === 'back' && pad[6] === '2del' && pad[7] === '2over' && pad[8] === null, JSON.stringify(pad));
  await click('[data-a="newGame"]');
  await click('.sl-card[data-n="3"] [data-s="over"]');
  c = await cards();
  R.check('Start over asks first', c[2].asking && c[2].btns.join() === 'yes,no', JSON.stringify(c[2]));
  await clickReload('.sl-card[data-n="3"] [data-s="yes"]');
  await skipOpening();
  await page.waitForFunction(() => window.G.ui.dlg.active, null, { timeout: 15000 });
  await drainDialogue(page); await sleep(page, 400); await drainDialogue(page);
  const g3 = await page.evaluate(() => ({ slot: window.G.saveSlot, coins: window.G.state.coins }));
  const [b1, b2] = [await read(1), await read(2)];
  R.check('Start over: slot 3 a new game, slots 1 and 2 kept', g3.slot === 3 && g3.coins !== 31337 && b1?.coins === 4242 && b2?.coins === 777, JSON.stringify({ g3, b1: b1?.coins, b2: b2?.coins }));

  // ---- a damaged slot shows as scrambled, and Play still loads its backup
  await page.evaluate(() => { localStorage.setItem('chewy3d.save.2.prev', localStorage.getItem('chewy3d.save.2')); localStorage.setItem('chewy3d.save.2', '{oops'); });
  await title();
  await click('[data-a="load"]');
  c = await cards();
  R.check('a damaged save reads "A little scrambled" with Play and delete', c[1].name === 'A little scrambled' && c[1].btns.join() === 'play,del', JSON.stringify(c[1]));
  await clickReload('.sl-card[data-n="2"] [data-s="play"]');
  const gd = await page.evaluate(() => ({ slot: window.G.saveSlot, coins: window.G.state.coins }));
  R.check('Play on it loads the backup', gd.slot === 2 && gd.coins === 777, JSON.stringify(gd));
} catch (e) { errors.push('[harness] ' + e.stack); }
const failed = R.finish(errors, warns);
await browser.close();
process.exit(failed ? 1 : 0);
