// s35: the debug menu (docs/DEBUG.md, ROADMAP R-10). The password (off by default, both ways in, wrong refused, the
// breather after five, right remembered), the lazy module (never loaded with debug off), the keys / bug / pad combo,
// and the menu's main actions through real clicks: join every hero (five in the wheel), open every zone (every
// Travel Map node), a zone dungeon's floor 2, a Spirit 10 run, coins and materials, the backup and restore round trip,
// the debugUsed mark, the combat toggles, debug off. Shots: desktop, pad and phone → tools/qa/tmp/s35-debug/.
// (The cozy plan reserved s31–s34.)  usage: node tools/qa/s35-debug.mjs
import fs from 'node:fs';
import { launch, boot, sleep, waitMode, makeReport, BASE } from './lib.mjs';
import { installPad, padDown, padUp, padTap } from './pad-lib.mjs';
import { launchTouch, fingers } from './touch-lib.mjs';
import { DEBUG_PASS as PASS, skipNote } from './debug-pass.mjs'; // (the repo is public: the env or a git-ignored file; none: those checks SKIP)

const OUT = new URL('./tmp/s35-debug/', import.meta.url); fs.mkdirSync(OUT, { recursive: true });
const shot = (page, n) => page.screenshot({ path: new URL(n + '.png', OUT).pathname.replace(/^\/([A-Z]:)/, '$1') });
const R = makeReport('s35-debug');
// the right password into the open prompt; without one, on through the same path a right password ends in
// (enable: remembered, the lazy menu opens) and the password checks SKIP
async function unlock(page, submit = 'enter') {
  if (PASS) { await page.fill('.dg-in', PASS); if (submit === 'enter') await page.keyboard.press('Enter'); else await page.click('.p-dbg-gate [data-a="ok"]'); }
  else await page.evaluate(() => { window.G.ui.close('debugGate', true); window.G.debug.enable({ open: true }); });
}
const errs = [], warns = [];

// ---- helpers: the menu by real clicks
async function mark(page, tab, row, btn, field) {
  return page.evaluate(([tab, row, btn, field]) => {
    document.querySelectorAll('[data-qa]').forEach(e => e.removeAttribute('data-qa'));
    if (tab) { const t = document.querySelector(`.p-debug .dbg-tabs [data-tab="${tab}"]`); if (!t) return 'no tab ' + tab; if (!t.classList.contains('on')) t.click(); }
    const rows = [...document.querySelectorAll('.p-debug .dbg-row, .p-debug .dbg-form')];
    const r = rows.find(x => (x.querySelector('.dbg-n > span')?.childNodes[0]?.textContent || '').trim() === row); if (!r) return 'no row ' + row;
    let b;
    if (field) b = [...r.querySelectorAll(`[data-f="${field}"]`)].find(x => x.textContent.trim() === btn);
    else if (btn === 'go') b = r.querySelector('[data-go]') || r.querySelector('.btn:not(.dbg-chip), .tog');
    else b = [...r.querySelectorAll('.dbg-chip, .btn, .tog')].find(x => x.textContent.trim() === btn);
    if (!b) return `no button ${btn} in ${row}`;
    b.setAttribute('data-qa', '1'); return '';
  }, [tab, row, btn, field]);
}
async function click(page, tab, row, btn = 'go', field) { const m = await mark(page, tab, row, btn, field); if (m) { R.check(`menu: ${row} ${btn}`, false, m); return false; } await page.click('[data-qa="1"]'); await sleep(page, 120); return true; }
const openMenu = page => page.evaluate(() => window.G.debug.open()).then(() => page.waitForFunction(() => window.G.ui.isOpen('debug'), null, { timeout: 15000 }));
const debugLoaded = page => page.evaluate(() => performance.getEntriesByType('resource').some(e => /debugMenu|debugActions/.test(e.name)) || !!window.G.ui.panels.debug);
const page1 = async (qs, o) => { const L = await launch(o || { w: 1600, h: 900 }); L.page.on('pageerror', () => {}); await boot(L.page, qs); return L; };

// ================================================================== a) off by default
{
  const { browser, page, errors, warns: w } = await page1('fresh&nointro&notut');
  const s = await page.evaluate(() => ({ on: window.G.debug.on, bug: !!document.querySelector('.dbg-bug'), panel: !!window.G.ui.panels.debug, gate: !!window.G.ui.panels.debugGate }));
  await page.keyboard.press('F10'); await page.keyboard.press('Backquote'); await sleep(page, 400);
  const after = await page.evaluate(() => ({ open: window.G.ui._order.filter(n => window.G.ui.isOpen(n)), ls: localStorage.getItem('chewy3d.debug') }));
  R.check('a) off by default: no bug button, no menu panel, the prompt is built in', !s.on && !s.bug && !s.panel && s.gate, s);
  R.check('a) F10 and ` do nothing while off', !after.open.length && after.ls == null, after);
  R.check('a) the debug menu module is never fetched while off', !(await debugLoaded(page)));
  // Settings › About: the version line, and seven taps ask for the password
  await page.evaluate(() => window.G.ui.open('menu', { view: 'settings' })); await sleep(page, 500);
  const ver = await page.evaluate(() => { const b = document.querySelector('.mn-ver'); const r = b?.getBoundingClientRect(); return { text: b?.textContent, vis: !!r?.width, dbgRow: getComputedStyle(document.querySelector('.mn-debug')).display }; });
  R.check('b) Settings › About shows the version; no debug row while off', /Pawhaven v\d+\.\d+\.\d+/.test(ver.text || '') && ver.vis && ver.dbgRow === 'none', ver);
  await page.evaluate(() => document.querySelector('.mn-ver').scrollIntoView());
  for (let i = 0; i < 6; i++) { await page.click('.mn-ver'); await sleep(page, 90); }
  const six = await page.evaluate(() => window.G.ui.isOpen('debugGate'));
  await page.click('.mn-ver'); await page.waitForFunction(() => window.G.ui.isOpen('debugGate'), null, { timeout: 5000 }).catch(() => {});
  R.check('b) seven taps on the version open the password prompt (six do not)', !six && await page.evaluate(() => window.G.ui.isOpen('debugGate')));
  await page.fill('.dg-in', 'chewy'); await page.keyboard.press('Enter'); await sleep(page, 400);
  const bad = await page.evaluate(() => ({ on: window.G.debug.on, msg: document.querySelector('.dg-msg').textContent, shake: document.querySelector('.p-dbg-gate').classList.contains('dg-shake'), open: window.G.ui.isOpen('debugGate'), ls: localStorage.getItem('chewy3d.debug') }));
  R.check("b) a wrong password is refused: \"Hmm, that's not it\", a shake, still off", !bad.on && /not it/.test(bad.msg) && bad.shake && bad.open && bad.ls == null, bad);
  for (let i = 0; i < 4; i++) { await page.fill('.dg-in', 'nope' + i); await page.keyboard.press('Enter'); await sleep(page, 150); }
  const cool = await page.evaluate(() => ({ dis: document.querySelector('.dg-in').disabled, ok: document.querySelector('.p-dbg-gate [data-a="ok"]').disabled, msg: document.querySelector('.dg-msg').textContent }));
  R.check('b) five wrong tries: a short breather (the field and Unlock disabled)', cool.dis && cool.ok && /break/.test(cool.msg), cool);
  await page.evaluate(() => { const p = window.G.ui.panels.debugGate; p.until = 0; p.tickCool(); }); // (skip the 30 s wait)
  await unlock(page);
  await page.waitForFunction(() => window.G.ui.isOpen('debug'), null, { timeout: 15000 }).catch(() => {});
  const good = await page.evaluate(() => ({ on: window.G.debug.on, ls: localStorage.getItem('chewy3d.debug'), menu: window.G.ui.isOpen('debug'), bug: !!document.querySelector('.dbg-bug') }));
  if (PASS) R.check('b) the right password: on, remembered on this device, the menu opens', good.on && good.ls === '1' && good.menu && good.bug, good);
  else { skipNote('b) the right password'); R.check('b) on (the remembered flag): the menu opens, the bug button', good.on && good.ls === '1' && good.menu && good.bug, good); }
  if (PASS) { const src = await page.evaluate(() => [...document.scripts].map(s => s.textContent).join('') + performance.getEntriesByType('resource').map(e => e.name).join()); R.check('b) no plaintext password in the page', !src.includes(PASS)); }
  // remembered across a reload, no ?debug: F10, the bug button
  await page.goto(`${BASE}/?nointro&notut&notitle&dseed=1`); await page.waitForFunction(() => window.__ready === true && window.G?.player, null, { timeout: 60000 }); await sleep(page, 600);
  const re = await page.evaluate(() => ({ on: window.G.debug.on, gate: window.G.ui.isOpen('debugGate'), loaded: !!window.G.ui.panels.debug }));
  await page.keyboard.press('F10'); await page.waitForFunction(() => window.G.ui.isOpen('debug'), null, { timeout: 15000 }).catch(() => {});
  const f10 = await page.evaluate(() => window.G.ui.isOpen('debug'));
  await page.keyboard.press('F10'); await sleep(page, 400);
  const f10b = await page.evaluate(() => window.G.ui.isOpen('debug'));
  R.check('b) after a reload it stays on without asking; F10 opens and closes the menu', re.on && !re.gate && !re.loaded && f10 && !f10b, { re, f10, f10b });
  // debug off: Settings › About › Turn off
  await page.evaluate(() => window.G.ui.open('menu', { view: 'settings' })); await sleep(page, 400);
  const row = await page.evaluate(() => getComputedStyle(document.querySelector('.mn-debug')).display);
  await page.evaluate(() => document.querySelector('.mn-debug [data-a="debugOff"]').scrollIntoView()); await page.click('.mn-debug [data-a="debugOff"]'); await sleep(page, 300);
  const off = await page.evaluate(() => ({ on: window.G.debug.on, ls: localStorage.getItem('chewy3d.debug'), bug: !!document.querySelector('.dbg-bug'), row: getComputedStyle(document.querySelector('.mn-debug')).display }));
  R.check('m) Settings › About › Turn off: forgotten, the bug gone, the row hidden', row !== 'none' && !off.on && off.ls == null && !off.bug && off.row === 'none', { row, ...off });
  await page.goto(`${BASE}/?nointro&notut&notitle&dseed=1`); await page.waitForFunction(() => window.__ready === true && window.G?.player, null, { timeout: 60000 }); await sleep(page, 800);
  await page.keyboard.press('F10'); await sleep(page, 300);
  const off2 = await page.evaluate(() => ({ on: window.G.debug.on, bug: !!document.querySelector('.dbg-bug'), open: window.G.ui.isOpen('debug') }));
  R.check('m) off after a reload: no debug code loaded, no button, F10 inert', !off2.on && !off2.bug && !off2.open && !(await debugLoaded(page)), off2);
  errs.push(...errors); warns.push(...w); await browser.close();
}

// ================================================================== c) ?debug, and the menu's actions
{
  const { browser, page, errors, warns: w } = await page1('fresh&nointro&notut&debug');
  await page.waitForFunction(() => window.G.ui.isOpen('debugGate'), null, { timeout: 15000 }).catch(() => {});
  R.check('c) ?debug asks for the password at once', await page.evaluate(() => window.G.ui.isOpen('debugGate') && !window.G.debug.on));
  await page.fill('.dg-in', 'not-the-password'); await page.click('.p-dbg-gate [data-a="ok"]'); await sleep(page, 300);
  R.check('c) a wrong password from ?debug is refused', await page.evaluate(() => !window.G.debug.on && window.G.ui.isOpen('debugGate') && /not it/.test(document.querySelector('.dg-msg').textContent)));
  await unlock(page, 'click');
  await page.waitForFunction(() => window.G.ui.isOpen('debug'), null, { timeout: 15000 }).catch(() => {});
  const m0 = await page.evaluate(() => ({ menu: window.G.ui.isOpen('debug'), tabs: [...document.querySelectorAll('.p-debug .dbg-tabs .tab')].map(t => t.dataset.tab), offer: !!document.querySelector('.dbg-offer'), used: !!window.G.state.debugUsed }));
  R.check('c) the menu: its tabs, the backup offer on the first opening, the save not marked yet', m0.menu && ['heroes', 'world', 'tiers', 'travel', 'village', 'items', 'combat', 'time', 'cozy', 'save'].every(t => m0.tabs.includes(t)) && m0.offer && !m0.used, m0);
  await shot(page, 'desktop-heroes');
  await page.click('.dbg-offer [data-x="backup"]'); await sleep(page, 300);
  const bk = await page.evaluate(() => { const b = JSON.parse(localStorage.getItem('chewy3d.save.debugBackup') || 'null'); return { has: !!b?.save, coins: b ? JSON.parse(b.save).coins : null, offer: !!document.querySelector('.dbg-offer'), asked: window.G.state.flags.debugBackupAsked }; });
  R.check('i) "Back up this save first": a copy in the backup slot, the offer gone', bk.has && !bk.offer && bk.asked, bk);
  // heroes: join all → five in the wheel
  await click(page, 'heroes', 'Join every hero');
  await page.waitForFunction(() => window.QA?.toasts?.some(t => /Joined the pack/.test(t)) || window.G.heroes.roster().every(r => r.joined), null, { timeout: 5000 }).catch(() => {});
  const ros = await page.evaluate(() => window.G.heroes.roster().map(r => r.joined + ':' + r.id));
  await page.evaluate(() => { window.G.ui.close('debug'); }); await sleep(page, 300);
  await page.evaluate(() => window.G.heroes.openWheel()); await sleep(page, 500);
  const wheel = await page.evaluate(() => [...document.querySelectorAll('.hw-card')].map(c => ({ id: c.dataset.id, q: !!c.querySelector('.hw-q') })));
  await page.evaluate(() => window.G.heroes.pickFromWheel(null));
  R.check('d) join every hero: all five joined and in the wheel (no "?" cards)', ros.every(x => x.startsWith('true')) && wheel.length === 5 && wheel.every(c => !c.q), { ros, wheel });
  R.check('d) the save is marked as touched by debug (the badge, only in the menu)', await page.evaluate(() => window.G.state.debugUsed === true && !document.querySelector('.hud .dbg-badge')));
  // levels and skills
  await openMenu(page);
  await click(page, 'heroes', 'Set level', 'All', 'hero'); await click(page, 'heroes', 'Set level', '45', 'lvl'); await click(page, 'heroes', 'Set level', 'go');
  const lv = await page.evaluate(() => Object.values(window.G.state.heroes).map(h => h.player.lvl));
  R.check('d) set level 45 for all heroes', lv.every(l => l === 45), lv);
  await click(page, 'heroes', 'Max every skill');
  const sk = await page.evaluate(() => Object.values(window.G.state.player.skills).filter(v => v === 20).length);
  R.check('d) max every skill (the active hero)', sk >= 15, sk);
  // world: every Travel Map node open
  await click(page, 'world', 'Open every zone');
  const tv = await page.evaluate(() => window.G.travel.list().map(p => p.id + ':' + p.unlocked));
  await page.evaluate(() => { window.G.ui.close('debug'); window.G.openTravel(); }); await sleep(page, 700);
  const pins = await page.evaluate(() => ({ pins: document.querySelectorAll('.tv-pin').length, locked: document.querySelectorAll('.tv-pin.locked, .tv-pin.lock').length }));
  await shot(page, 'desktop-travelmap'); await page.evaluate(() => window.G.ui.close('travel', true));
  R.check('e) open every zone: every Travel Map node open', tv.every(x => x.endsWith(':true')) && pins.pins >= 5 && !pins.locked, { tv, pins });
  // coins and materials
  await openMenu(page);
  const c0 = await page.evaluate(() => ({ c: window.G.state.coins, w: window.G.state.materials.wood, l: window.G.state.materials.lantern }));
  await click(page, 'village', 'Coins', '+1k'); await click(page, 'village', 'Every material', '+100');
  const c1 = await page.evaluate(() => ({ c: window.G.state.coins, w: window.G.state.materials.wood, l: window.G.state.materials.lantern, toast: window.QA.toasts.slice(-2) }));
  R.check('h) +1k coins and +100 of every material', c1.c === c0.c + 1000 && c1.w === c0.w + 100 && c1.l === c0.l + 100 && c1.toast.some(t => /coins/.test(t)), { c0, c1 });
  await click(page, 'village', 'Village rank', 'Rank 5');
  R.check('h) village rank 5: every building open in the palette', await page.evaluate(() => window.G.sim.stats.rank === 5 && window.G.build.catalog().flatMap(c => c.items).every(i => !i.locked || i.locked === 'Already built')));
  await click(page, 'items', 'Gear set', 'Unique', 'rarity'); await click(page, 'items', 'Gear set', 'go');
  R.check('h) a gear set equipped', await page.evaluate(() => Object.values(window.G.state.equipment).filter(Boolean).length >= 8));
  await shot(page, 'desktop-items');
  // the combat toggles
  await click(page, 'combat', 'God mode', 'go'); await click(page, 'combat', 'One-hit kills', 'go');
  const tg = await page.evaluate(() => [...document.querySelectorAll('.p-debug .tog.on')].length);
  await shot(page, 'desktop-combat');
  // travel: a zone dungeon's floor 2
  await click(page, 'travel', 'Bamboo Depths', 'Floor 2');
  await page.waitForFunction(() => window.G.mode === 'dungeon' && window.G.dungeon?.def?.id === 'bambooDepths' && window.G.dungeon.floor === 2 && !window.G.ui.iris.active, null, { timeout: 60000 }).catch(() => {});
  const dz = await page.evaluate(() => ({ id: window.G.dungeon?.def?.id, floor: window.G.dungeon?.floor, menu: window.G.ui.isOpen('debug'), boss: !!window.G.dungeon?.boss }));
  R.check('f) travel: Bamboo Depths floor 2 (the menu closes on the way)', dz.id === 'bambooDepths' && dz.floor === 2 && !dz.menu, dz);
  const hit = await page.evaluate(() => { const G = window.G, m = G.dungeon.monsters.find(x => x.alive && !x.def.boss), l0 = G.actions.life(); const d = G.combat.hitPlayer(500, { level: 60 }); G.combat.hitMonster(m, { dmgPct: 1 }); return { took: d, life: G.actions.life() >= l0, dead: !m.alive, toggles: 0 }; });
  R.check('k) god mode: no damage; one-hit kills: one tap fells a monster', hit.took === 0 && hit.life && hit.dead && tg === 2, { ...hit, tg });
  await openMenu(page); await click(page, 'combat', 'Kill every monster here');
  R.check('k) kill every monster on the floor', await page.evaluate(() => window.G.dungeon.monsters.filter(m => m.alive).length === 0));
  // tiers: Spirit 10
  await click(page, 'tiers', 'Spirit tier', 'Spirit 10');
  await click(page, 'tiers', 'Tier run', 'Spirit 10', 'run'); await click(page, 'tiers', 'Tier run', 'Swarming', 'mods'); await click(page, 'tiers', 'Tier run', 'go');
  await page.waitForFunction(() => window.G.dungeon?.spirit === 10 && window.G.dungeon.floor === 1 && !window.G.ui.iris.active, null, { timeout: 60000 }).catch(() => {});
  const sp = await page.evaluate(() => ({ spirit: window.G.dungeon?.spirit, id: window.G.dungeon?.def?.id, mods: window.G.dungeon?.mods, chip: document.querySelector('.run-chip.on')?.textContent.trim() || '' }));
  R.check('g) Spirit 10: a Spirit 10 run with its modifier', sp.spirit === 10 && sp.id === 'bambooDepths' && sp.mods?.includes('swarming') && /Spirit 10/.test(sp.chip), sp);
  await shot(page, 'desktop-spirit10');
  // pad: Select + Start, the focus ring, B closes
  await installPad(page);
  await padDown(page, 'View'); await padDown(page, 'Menu'); await padUp(page, 'Menu'); await padUp(page, 'View');
  await page.waitForFunction(() => window.G.ui.isOpen('debug'), null, { timeout: 5000 }).catch(() => {});
  await padTap(page, 'DDown'); await sleep(page, 300);
  const pad = await page.evaluate(() => ({ menu: window.G.ui.isOpen('debug'), map: window.G.ui.isOpen('map'), pause: window.G.ui.isOpen('menu'), ring: document.querySelector('.pad-ring')?.classList.contains('on'), inMenu: !!window.G.ui.padNav.cur?.closest('.p-debug'), hints: document.querySelector('.pad-hints')?.textContent || '' }));
  await padTap(page, 'RB'); await sleep(page, 300);
  const tab2 = await page.evaluate(() => document.querySelector('.p-debug .dbg-tabs .tab.on')?.dataset.tab);
  await shot(page, 'pad-menu');
  await padTap(page, 'B'); await sleep(page, 400);
  const padOff = await page.evaluate(() => window.G.ui.isOpen('debug'));
  R.check('l) pad: Select + Start opens it (not the map or the pause menu), the focus ring and hints, RB a tab, B closes', pad.menu && !pad.map && !pad.pause && pad.ring && pad.inMenu && /Tabs/.test(pad.hints) && tab2 && tab2 !== 'heroes' && !padOff, { ...pad, tab2, padOff });
  // backup → change → restore round trip
  await page.evaluate(() => window.G.controls.setDevice?.('kbm'));
  await openMenu(page);
  const before = await page.evaluate(() => JSON.parse(JSON.parse(localStorage.getItem('chewy3d.save.debugBackup')).save).coins);
  await click(page, 'village', 'Coins', '+100k');
  const mid = await page.evaluate(() => window.G.state.coins);
  await click(page, 'save', 'Restore the backup'); const armed = await page.evaluate(() => !!document.querySelector('.p-debug .btn.armed'));
  const nav = page.waitForNavigation({ timeout: 30000 }).catch(() => null);
  await click(page, 'save', 'Restore the backup'); await nav;
  await page.waitForFunction(() => window.__ready === true && window.G?.player, null, { timeout: 60000 }); await sleep(page, 800);
  const after = await page.evaluate(() => ({ coins: window.G.state.coins, url: location.search, title: !!window.G.titleActive, used: window.G.state.debugUsed || false }));
  R.check('i) restore: two taps, a reload onto the backup (coins back), straight into the game', armed && mid >= before + 100000 && after.coins === before && !/fresh/.test(after.url) && !after.title, { before, mid, after, armed });
  errs.push(...errors); warns.push(...w); await browser.close();
}

// ================================================================== the phone
{
  const { browser, page, errors, warns: w } = await launchTouch();
  page.on('pageerror', () => {});
  await boot(page, 'fresh&nointro&notut&debug');
  const F = fingers(page, await page.context().newCDPSession(page));
  await page.waitForFunction(() => window.G.ui.isOpen('debugGate'), null, { timeout: 15000 }).catch(() => {});
  await shot(page, 'phone-gate');
  await unlock(page, 'click');
  await page.waitForFunction(() => window.G.ui.isOpen('debug'), null, { timeout: 15000 }).catch(() => {});
  await page.evaluate(() => { window.G.state.flags.debugBackupAsked = true; window.G.ui.panels.debug.render(); }); await sleep(page, 400);
  await shot(page, 'phone-heroes');
  const audit = async () => page.evaluate(() => {
    const p = document.querySelector('.p-debug'), r = p.getBoundingClientRect(), small = [], tiny = [];
    for (const b of p.querySelectorAll('button')) { const q = b.getBoundingClientRect(); if (!q.width) continue; if (q.height < 43.5 && !b.classList.contains('ph-x')) small.push(b.textContent.trim().slice(0, 20) + ':' + Math.round(q.height)); }
    for (const e of p.querySelectorAll('*')) { if (!e.childNodes.length || ![...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue; const fs = parseFloat(getComputedStyle(e).fontSize); if (fs < 11.9 && !e.closest('.jp, .ph-jp')) tiny.push(e.textContent.trim().slice(0, 16) + ':' + fs); }
    const head = p.querySelector('.ph').getBoundingClientRect();
    return { fits: r.top >= -1 && r.bottom <= innerHeight + 1, titleAtBottom: head.top > r.top + r.height / 2, phone: window.G.ui.root.classList.contains('m-phone'), small: small.slice(0, 6), tiny: tiny.slice(0, 6) };
  });
  const a1 = await audit();
  const tc = await page.evaluate(() => { const t = document.querySelector('.p-debug .dbg-tabs [data-tab="combat"]'); t.scrollIntoView(); const r = t.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await F.tap(tc.x, tc.y); await sleep(page, 400);
  const a2 = await audit();
  await shot(page, 'phone-combat');
  R.check('phone: the one-panel layout (the title bar at the bottom), 44 px targets, the 12 px floor, a tap switches tabs', a1.phone && a1.fits && a1.titleAtBottom && !a1.small.length && !a1.tiny.length && !a2.small.length && await page.evaluate(() => document.querySelector('.p-debug .dbg-tabs .tab.on')?.dataset.tab === 'combat'), { a1, a2 });
  await page.evaluate(() => window.G.ui.close('debug')); await sleep(page, 400);
  const bug = await page.evaluate(() => { const b = document.querySelector('.dbg-bug'); const r = b?.getBoundingClientRect(); return b && !b.classList.contains('hide') ? { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width } : null; });
  if (bug) { await F.tap(bug.x, bug.y); await page.waitForFunction(() => window.G.ui.isOpen('debug'), null, { timeout: 5000 }).catch(() => {}); }
  R.check('phone: the bug button (≥ 44 px) opens the menu with a tap', !!bug && bug.w >= 43.5 && await page.evaluate(() => window.G.ui.isOpen('debug')), bug);
  await page.evaluate(() => window.G.ui.close('debug')); await sleep(page, 400);
  await shot(page, 'phone-hud-bug');
  errs.push(...errors); warns.push(...w); await browser.close();
}
console.log('  shots: ' + OUT.pathname);
process.exit(R.finish(errs, warns) ? 1 : 0);
