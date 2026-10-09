// s36: the autosave (ROADMAP R-11, core/autosave.js, docs/ARCHITECTURE.md § Save flow). The scheduler runs on its own
// clock here (G.autosave.manual = true; advance() fast-forwards it): no wall-clock waits.
//   a) the timed autosave: Settings › Autosave defaults to 2 min, fires after 2 min of play, not on paused time; the paw
//      glyph shows (no toast); Off: no timed saves; 1 min works
//   b) event autosaves: a quest step saves, the 20 s debounce folds a burst into one save, a save the game made itself
//      settles a pending event, small loot and small purchases don't count, uniques and big ones do
//   c) deferral: a boss fight holds the due autosave (never skipped); it goes a few seconds after the boss falls
//   d) the lifecycle saves: pagehide + beforeunload in one burst write once
//   e) the rotating backup: the old save → .prev; a main save that won't parse, or won't normalize, boots from .prev
//      with a gentle toast; the damaged main isn't rotated over the good .prev; no main save (New Game) ignores .prev
//   f) the glyph: inside the safe area, clear of the minimap, the orbs and the touch controls (desktop, phone with a
//      notch, tablet); prefers-reduced-motion drops the paw steps. Shots → tools/qa/tmp/s36-autosave/
//   g) the stringify cost of a fat late-game save (every hero, zone, tier, building, furniture; a full stash)
// usage: node tools/qa/s36-autosave.mjs
import fs from 'node:fs';
import { launch, boot, sleep, waitMode, makeReport, drainDialogue, BASE } from './lib.mjs';
import { launchTouch, PHONE, TABLET } from './touch-lib.mjs';

const OUT = new URL('./tmp/s36-autosave/', import.meta.url); fs.mkdirSync(OUT, { recursive: true });
const file = n => new URL(n + '.png', OUT).pathname.replace(/^\/([A-Z]:)/, '$1');
const R = makeReport('s36-autosave');
const errs = [], warns = [];
const manual = page => page.evaluate(() => { const A = window.G.autosave; A.manual = true; A.play = 0; A.due = false; A.event = null; }); // (the real clock may have ticked during the boot)
const st = page => page.evaluate(() => window.G.autosave.state());
const adv = (page, s, play = true) => page.evaluate(([s, play]) => window.G.autosave.advance(s, { play }), [s, play]);
const autos = s => s.log.length;
const page1 = async (qs = 'fresh&nointro&notut', o) => { const L = await launch(o || { w: 1600, h: 900 }); await boot(L.page, qs); await manual(L.page); return L; };
const reload = async (page, qs) => { await page.goto(`${BASE}/?${qs}&dseed=1`, { waitUntil: 'load' }); await page.waitForFunction(() => window.__ready === true && window.G?.player, null, { timeout: 60000 }); await page.evaluate(() => { window.G.autosave.manual = true; }); };

// ================================================================== a) b) d) the timer, events, lifecycle
{
  const { browser, page, errors, warns: w } = await page1();
  const s0 = await st(page);
  const set0 = await page.evaluate(() => window.G.ui.settings.autosave);
  R.check('a) Settings › Autosave defaults to 2 min', set0 === 2 && s0.minutes === 2, { set0, minutes: s0.minutes });
  const toasts0 = await page.evaluate(() => window.QA.toasts.length);
  let s = await adv(page, 119);
  R.check('a) no timed autosave before 2 min of play', autos(s) === autos(s0) && !s.due, { play: s.play, log: s.log });
  s = await adv(page, 2);
  const last = s.log[s.log.length - 1];
  const glyph = await page.evaluate(() => { const e = document.querySelector('.save-glyph'); return { on: e?.classList.contains('on'), shown: +e?.dataset.shown || 0 }; });
  const saved = await page.evaluate(() => { try { return !!JSON.parse(localStorage.getItem('chewy3d.save')).version; } catch (e) { return false; } });
  R.check('a) after 2 min of play the timed autosave writes the save', autos(s) === autos(s0) + 1 && last?.kind === 'timer' && saved && s.play < 2, last);
  R.check('a) the paw glyph shows for it, and no toast', glyph.on && glyph.shown >= 1 && await page.evaluate(n => window.QA.toasts.length === n, toasts0), glyph);
  s = await adv(page, 400, false);
  R.check('a) paused / hidden time is not play time: no timed save in 400 s of it', autos(s) === autos(s0) + 1 && s.play < 2, { play: s.play });
  // the Settings row through a real click: Off
  await page.evaluate(() => window.G.ui.open('menu', { view: 'settings' })); await sleep(page, 400);
  await page.evaluate(() => document.querySelector('.seg[data-k="autosave"]').scrollIntoView());
  const row = await page.evaluate(() => [...document.querySelectorAll('.seg[data-k="autosave"] button')].map(b => b.textContent + (b.classList.contains('on') ? '*' : '')));
  await page.click('.seg[data-k="autosave"] button[data-v="0"]'); await sleep(page, 200);
  await page.screenshot({ path: file('settings-row') });
  const off = await page.evaluate(() => ({ v: window.G.ui.settings.autosave, stored: JSON.parse(localStorage.getItem('chewy3d.settings') || '{}').autosave }));
  await page.evaluate(() => window.G.ui.close('menu')); await sleep(page, 300);
  R.check('a) Settings shows Off / 1 min / 2 min / 5 min (2 min picked); a click on Off is kept', row.join() === 'Off,1 min,2 min*,5 min' && off.v === 0 && off.stored === 0, { row, off });
  const n0 = autos(await st(page));
  s = await adv(page, 900);
  R.check('a) Off: no timed autosave in 15 min of play', autos(s) === n0 && s.minutes === 0, { minutes: s.minutes, log: s.log.slice(-2) });
  await page.evaluate(() => window.G.ui.setSetting('autosave', 1));
  s = await adv(page, 61);
  R.check('a) 1 min: a timed autosave after a minute', autos(s) === n0 + 1 && s.log[s.log.length - 1].kind === 'timer', s.log.slice(-1));
  await page.evaluate(() => window.G.ui.setSetting('autosave', 3)); // (5 min: out of the way of the event checks)

  // ---- b) events
  const emit = (n, p) => page.evaluate(([n, p]) => window.G.events.emit(n, p), [n, p]);
  let e0 = autos(await st(page));
  await emit('quest:update');
  s = await adv(page, 1);
  R.check('b) a quest step: an event autosave', autos(s) === e0 + 1 && s.log[s.log.length - 1].kind === 'event' && s.log[s.log.length - 1].why === 'quest:update', s.log.slice(-1));
  await emit('quest:update'); await emit('building:levelup', {}); await emit('hero:joined', { id: 'qa' });
  s = await adv(page, 10);
  const mid = autos(s);
  s = await adv(page, 11);
  R.check('b) debounce: three more events in the 20 s window → one save, at the window\'s end', mid === e0 + 1 && autos(s) === e0 + 2, { mid, after: autos(s), log: s.log.slice(-2) });
  s = await adv(page, 25);
  R.check('b) nothing pending after it', autos(s) === e0 + 2 && !s.event, s.event);
  e0 = autos(s);
  await emit('quest:update'); await page.evaluate(() => window.G.save());
  s = await adv(page, 25);
  R.check('b) a save the game made after the event settles it (no second write)', autos(s) === e0 && !s.event, s.log.slice(-1));
  await emit('item:pickup', { item: { rarity: 'magic' } }); await emit('coins:changed', { coins: 10, delta: -40 });
  const small = (await st(page)).event;
  await emit('item:pickup', { item: { rarity: 'unique' } });
  const uniq = (await st(page)).event; await adv(page, 25);
  await emit('coins:changed', { coins: 10, delta: -800 });
  const buy = (await st(page)).event; await adv(page, 25);
  await emit('expedition:back', { uid: 1 });
  const exp = (await st(page)).event; s = await adv(page, 25);
  R.check('b) small loot / small purchases don\'t count; a unique, a big purchase and an expedition do', small === null && uniq === 'item:pickup' && buy === 'purchase' && exp === 'expedition:back' && autos(s) === e0 + 3, { small, uniq, buy, exp });

  // ---- d) the lifecycle saves
  const lw = await page.evaluate(() => {
    const A = window.G.autosave, w0 = A.stat.writes;
    window.G.state.coins = 777; // (a change right after an ordinary save still goes out)
    dispatchEvent(new Event('pagehide')); const w1 = A.stat.writes; dispatchEvent(new Event('beforeunload')); const w2 = A.stat.writes;
    return { w0, w1, w2, coins: JSON.parse(localStorage.getItem('chewy3d.save')).coins, life: A.life };
  });
  R.check('d) pagehide saves (every platform); a beforeunload in the same burst doesn\'t write again', lw.w1 === lw.w0 + 1 && lw.w2 === lw.w1 && lw.coins === 777, lw);
  errs.push(...errors); warns.push(...w); await browser.close();
}

// ================================================================== c) deferral during a boss fight
{
  const { browser, page, errors, warns: w } = await page1('fresh&nointro&notut');
  await page.evaluate(() => { const G = window.G; G.state.flags.burrowTut = true; G.state.player.lvl = 40; G.state.player.stats.vit = 300; G.actions.recompute(); G.actions.restoreAll(); G.enterDungeon(5); });
  await waitMode(page, 'dungeon');
  await page.waitForFunction(() => window.G.dungeon?.boss, null, { timeout: 20000 });
  await page.evaluate(() => {
    const G = window.G, b = G.dungeon.boss;
    for (const [dx, dz] of [[5, 0], [-5, 0], [0, 5], [0, -5], [4, 3], [-4, -3], [3, -4]]) if (G.world.walkable(b.pos.x + dx, b.pos.z + dz)) { G.player.setPos(b.pos.x + dx, b.pos.z + dz); break; }
    G.player.invuln = true;
  });
  await page.waitForFunction(() => window.G.dungeon.boss?.aggro, null, { timeout: 15000 }).catch(() => {});
  const n0 = autos(await st(page));
  await page.evaluate(() => window.G.events.emit('quest:update'));
  let s = await adv(page, 150);
  await page.screenshot({ path: file('boss-deferred') });
  R.check('c) a boss fight holds the due autosave and the event one (deferred, not skipped)', autos(s) === n0 && s.due && s.held && s.blocked === 'boss' && s.event === 'quest:update', { due: s.due, held: s.held, blocked: s.blocked, event: s.event });
  const w0 = (await st(page)).writes;
  await page.evaluate(() => { const G = window.G, b = G.dungeon.boss; b.life = 1; G.combat.hitMonster(b, { dmgPct: 500 }); });
  await page.waitForFunction(() => !window.G.dungeon.boss, null, { timeout: 15000 });
  await drainDialogue(page);
  await page.waitForFunction(() => !window.G.autosave.state().blocked, null, { timeout: 15000 }).catch(() => {});
  const gameSaved = (await st(page)).writes > w0; // (if the game saved on its own when the boss fell, that is the save)
  s = await adv(page, 2);
  const early = autos(s);
  s = await adv(page, 4);
  R.check('c) the boss falls: the deferred autosave goes a few seconds after (not at once)', gameSaved ? s.writes > w0 : (early === n0 && autos(s) === n0 + 1 && !s.held), { gameSaved, early, after: autos(s), log: s.log.slice(-1), blocked: s.blocked });
  errs.push(...errors); warns.push(...w); await browser.close();
}

// ================================================================== e) the rotating backup and the recovery
{
  const { browser, page, errors, warns: w } = await page1('fresh&nointro&notut');
  const rot = await page.evaluate(() => {
    const G = window.G, get = k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return 'bad'; } };
    G.state.coins = 4242; G.save();
    const prev0 = localStorage.getItem('chewy3d.save.prev');
    G.save(); // (the same save again: nothing to rotate)
    const same = localStorage.getItem('chewy3d.save.prev') === prev0;
    G.state.coins = 1111; G.save();
    return { first: prev0, same, prev: get('chewy3d.save.prev')?.coins, main: get('chewy3d.save')?.coins, dbg: localStorage.getItem('chewy3d.save.debugBackup') };
  });
  R.check('e) the save it replaces goes to chewy3d.save.prev (not the debug backup slot); an unchanged save doesn\'t rotate', rot.same && rot.prev === 4242 && rot.main === 1111 && rot.dbg === null, rot);
  // a main save that won't parse
  await page.evaluate(() => { window.G.saveBlocked = true; localStorage.setItem('chewy3d.save', '{"version":2,"coins":99,"heroes":{'); });
  await reload(page, 'nointro&notut&notitle');
  await page.evaluate(() => { if (!window.QA) window.QA = { toasts: [] }; const T = window.G.ui.toasts; if (T?.show && !T.__qa) { const raw = T.show.bind(T); T.show = (t, o) => { window.QA.toasts.push(String(t)); return raw(t, o); }; T.__qa = 1; } });
  const rec = await page.evaluate(() => ({ coins: window.G.state.coins }));
  await page.waitForFunction(() => window.QA.toasts.some(t => /scrambled/.test(t)) || /scrambled/.test(document.querySelector('.ui-root')?.textContent || ''), null, { timeout: 10000 }).catch(() => {});
  const toast = await page.evaluate(() => window.QA.toasts.find(t => /scrambled/.test(t)) || (/scrambled/.test(document.querySelector('.ui-root')?.textContent || '') ? 'on screen' : null));
  await page.screenshot({ path: file('recovered-toast') });
  R.check('e) a main save that won\'t parse: the game boots from .prev, with a gentle toast', rec.coins === 4242 && !!toast, { rec, toast });
  const after = await page.evaluate(() => { window.G.state.coins = 5150; window.G.save(); return { prev: JSON.parse(localStorage.getItem('chewy3d.save.prev')).coins, main: JSON.parse(localStorage.getItem('chewy3d.save')).coins }; });
  R.check('e) the next save replaces the damaged main without rotating it over the good .prev', after.prev === 4242 && after.main === 5150, after);
  // a main save that parses but won't normalize
  await page.evaluate(() => { const G = window.G; G.save(); G.saveBlocked = true; localStorage.setItem('chewy3d.save', JSON.stringify({ version: 2, coins: 77, heroes: { chewy: { player: null } } })); });
  await reload(page, 'nointro&notut&notitle');
  const norm = await page.evaluate(() => ({ coins: window.G.state.coins, lvl: window.G.state.player.lvl }));
  R.check('e) a main save that won\'t normalize: .prev too', norm.coins === 5150 && norm.lvl >= 1, norm);
  // New Game: no main save → a new game, never .prev
  await page.evaluate(() => { const G = window.G; G.state.coins = 31337; G.save(); G.save(); G.state.coins = 31338; G.save(); G.saveBlocked = true; localStorage.removeItem('chewy3d.save'); });
  await reload(page, 'nointro&notut&notitle');
  const fresh = await page.evaluate(() => ({ coins: window.G.state.coins, prev: JSON.parse(localStorage.getItem('chewy3d.save.prev') || 'null')?.coins }));
  R.check('e) no main save (New Game): a new game, .prev left alone', fresh.coins !== 31337 && fresh.coins !== 31338 && fresh.prev === 31337, fresh);
  // the quota: a full storage drops .prev for room, then toasts once
  const q = await page.evaluate(() => {
    const G = window.G, A = G.autosave, raw = Storage.prototype.setItem; let calls = 0;
    G.save(); G.state.coins = 6; G.save(); // (.prev now holds something)
    const toasts = []; const T = G.ui.toasts, rawShow = T.show.bind(T); T.show = (t, o) => { toasts.push(String(t)); return rawShow(t, o); };
    Storage.prototype.setItem = function (k, v) { if (String(k).startsWith('chewy3d.save')) { calls++; const e = new Error('full'); e.name = 'QuotaExceededError'; throw e; } return raw.call(this, k, v); };
    let threw = false; const f0 = A.stat.failed;
    try { G.state.coins = 7; G.save(); G.save(); G.save(); } catch (e) { threw = true; }
    Storage.prototype.setItem = raw; T.show = rawShow;
    return { threw, failed: A.stat.failed - f0, quotaToasts: toasts.filter(t => /storage is full/.test(t)).length, prevGone: localStorage.getItem('chewy3d.save.prev') === null, calls };
  });
  R.check('e) a full storage: no exception, .prev dropped for room, one toast for three failed saves', !q.threw && q.failed === 3 && q.quotaToasts === 1 && q.prevGone, q);
  errs.push(...errors); warns.push(...w); await browser.close();
}

// ================================================================== f) the glyph: safe area, clear of the HUD and touch controls
async function glyphCheck(page, label, shotName) {
  await page.evaluate(() => { const A = window.G.autosave; A.advance(0.001, { play: false }); A.play = 1e6; /* (settle saves made since the last tick first: they restart the timer) */ A.advance(1, { play: true }); });
  await page.waitForFunction(() => { const e = document.querySelector('.save-glyph'); return e && +getComputedStyle(e).opacity > 0.85; }, null, { timeout: 5000 }).catch(() => {});
  const g = await page.evaluate(() => {
    const e = document.querySelector('.save-glyph'), r = e.getBoundingClientRect(), cs = getComputedStyle(document.querySelector('.ui-root'));
    const sa = k => parseFloat(cs.getPropertyValue('--sa-' + k)) || 0;
    const safe = { l: sa('l'), t: sa('t'), r: innerWidth - sa('r'), b: innerHeight - sa('b') };
    const vis = el => { const s = getComputedStyle(el); return s.display !== 'none' && s.visibility !== 'hidden' && +s.opacity > 0.05; };
    const hits = [];
    for (const el of document.querySelectorAll('.hud-tr, .hud-tl, .hud-bc, .hud-br, .tc-b, .tc-sprint, .tc-base, .tc-belt, .mm, .tc-sq')) {
      if (!vis(el)) continue; const o = el.getBoundingClientRect(); if (!o.width || !o.height) continue;
      if (r.left < o.right && r.right > o.left && r.top < o.bottom && r.bottom > o.top) hits.push(el.className.toString().slice(0, 30));
    }
    return { rect: [r.left, r.top, r.right, r.bottom].map(v => Math.round(v)), safe, opacity: +getComputedStyle(e).opacity, inside: r.left >= safe.l && r.top >= safe.t && r.right <= safe.r && r.bottom <= safe.b, hits, pe: getComputedStyle(e).pointerEvents };
  });
  await page.screenshot({ path: file(shotName) });
  const [l, t, rr, b] = g.rect; await page.screenshot({ path: file(shotName + '-crop'), clip: { x: Math.max(0, l - 40), y: Math.max(0, t - 60), width: rr - l + 200, height: b - t + 90 } });
  R.check(`f) ${label}: the glyph shows inside the safe area, clear of the minimap, HUD and touch controls`, g.opacity > 0.85 && g.inside && !g.hits.length && g.pe === 'none', g);
  return g;
}
{
  const { browser, page, errors, warns: w } = await page1('fresh&nointro&notut&fps');
  await glyphCheck(page, 'desktop 1600×900', 'glyph-desktop');
  const fpsHit = await page.evaluate(() => { const f = [...document.querySelectorAll('body > div')].find(d => /fps/.test(d.textContent)); const a = f?.getBoundingClientRect(), b = document.querySelector('.save-glyph').getBoundingClientRect(); return a ? (b.left < a.right && b.right > a.left && b.top < a.bottom && b.bottom > a.top) : false; });
  R.check('f) desktop: clear of the FPS counter', !fpsHit);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const rm = await page.evaluate(() => { const A = window.G.autosave; A.advance(0.001, { play: false }); A.play = 1e6; /* (settle saves made since the last tick first: they restart the timer) */ A.advance(1, { play: true }); return getComputedStyle(document.querySelector('.save-glyph .sg-paws svg')).animationName; });
  R.check('f) prefers-reduced-motion: no paw steps', rm === 'none', rm);
  errs.push(...errors); warns.push(...w); await browser.close();
}
for (const [label, dev, qs, name] of [['phone, notch on the left', PHONE, 'safe=0,0,21,44', 'glyph-phone'], ['phone, left-handed, notch on the right', PHONE, 'safe=0,44,21,0', 'glyph-phone-left'], ['tablet', TABLET, '', 'glyph-tablet']]) {
  const { browser, page, errors, warns: w } = await launchTouch(dev);
  await boot(page, 'fresh&nointro&notut' + (qs ? '&' + qs : '')); await manual(page);
  if (name === 'glyph-phone-left') { await page.evaluate(() => window.G.ui.setSetting('touchLeft', true)); await sleep(page, 300); }
  await glyphCheck(page, label, name);
  errs.push(...errors); warns.push(...w); await browser.close();
}

// ================================================================== g) the stringify cost of a fat save
{
  const { browser, page, errors, warns: w } = await page1('fresh&nointro&notut');
  await page.evaluate(() => window.G.debug.enable({ open: true }));
  await page.waitForFunction(() => window.G.ui.panels.debug?.sections, null, { timeout: 15000 });
  const ran = await page.evaluate(async () => {
    const G = window.G, P = G.ui.panels.debug, secs = P.sections(), done = [];
    const find = l => { for (const s of secs) for (const a of s.actions) if (a.label === l) return a; return null; };
    const run = async (l, v) => { const a = find(l); if (!a) { done.push('missing ' + l); return; } try { await a.run(G, v); done.push(l); } catch (e) { done.push(`${l}: ${e.message}`); } };
    await run('Join every hero'); await run('Open every zone'); await run('Save every village'); await run('Clear every dungeon');
    await run('Open T1–T5 everywhere'); await run('Spirit tier', 20); await run('Coins', 100000); await run('Every material', 999);
    await run('Unlock every building and recipe'); await run('Village rank', 5); await run('All furniture and decor'); await run('Pantry', 'all');
    await run('Set level', { hero: 'all', lvl: 60 }); await run('Gems'); await run('Potions');
    for (const s of secs) for (const a of s.actions) if (a.group?.startsWith('Uniques') || ['Zone bosses', 'Everything else'].includes(a.label)) for (const c of (typeof a.choices === 'function' ? a.choices() : a.choices || [])) { try { await a.run(G, c.value); } catch (e) { /* */ } }
    G.ui.close('debug');
    return done;
  });
  // a full stash and bag of rolled gear, a busy village
  const fat = await page.evaluate(async () => {
    const G = window.G, items = await import('/src/rpg/items.js'), S = G.state, sim = G.sim, Pz = G.world.landmarks?.plaza || { x: 112, z: 121 };
    const roll = i => items.generateItem({ ilvl: 40 + (i % 20), rarity: ['magic', 'rare', 'unique', 'set'][i % 4] }) || items.generateItem({ ilvl: 40 });
    S.stash = S.stash || []; for (let i = 0; S.stash.length < 160 && i < 400; i++) { const it = roll(i); if (it) S.stash.push(it); }
    S.inventory = S.inventory || []; for (let i = 0; i < S.inventory.length; i++) if (!S.inventory[i]) S.inventory[i] = roll(i + 7);
    let placed = 0; sim.stats.rank = 5; S.coins = 1e6;
    const types = ['home', 'shop', 'farm', 'well', 'stoneLantern', 'streetLamp', 'park', 'bench', 'flowerBed', 'sakuraPlanter', 'fence', 'waterTower', 'clinic', 'school', 'onsen', 'koiStatue', 'miniTorii', 'kiln', 'lumber', 'fishingHut'];
    for (let n = 0; n < 240; n++) { const b = sim.autoPlace(types[n % types.length], Pz.x, Pz.z, 5, 90, true) || sim.place(types[(n * 7) % types.length], 20 + ((n * 37) % 184), 20 + ((n * 53) % 184), n % 4, { silent: true }); if (b) placed++; }
    for (const id in S.heroes) { const p = S.heroes[id].player; for (let k = 0; k < 40; k++) p.skills && (p.skills['qa' + k] = 0); }
    return { stash: S.stash.length, inv: S.inventory.filter(Boolean).length, buildings: sim.S.buildings.length, placed, heroes: Object.keys(S.heroes).length };
  });
  const m = await page.evaluate(() => {
    const G = window.G, { player, equipment, ...rest } = G.state, med = a => a.slice().sort((x, y) => x - y)[a.length >> 1];
    const str = [], full = []; let json = '';
    for (let i = 0; i < 25; i++) { const t0 = performance.now(); json = JSON.stringify(rest); str.push(performance.now() - t0); }
    for (let i = 0; i < 25; i++) { G.state.coins += 1; G.save(); full.push(G.autosave.stat.lastMs); }
    return { kb: Math.round(json.length / 1024), strMed: +med(str).toFixed(2), strMax: +Math.max(...str).toFixed(2), saveMed: +med(full).toFixed(2), saveMax: +Math.max(...full).toFixed(2), avg: +G.autosave.stat.avgMs.toFixed(2) };
  });
  R.note(`fat save: ${JSON.stringify(fat)}; debug actions: ${ran.filter(x => / |missing/.test(x) && /:|missing/.test(x)).join(' | ') || 'all ran'}`);
  R.note(`stringify ${m.strMed} ms median (max ${m.strMax}); the whole save (stringify + .prev rotation + setItem) ${m.saveMed} ms median (max ${m.saveMax}); ${m.kb} KB`);
  await page.waitForFunction(() => !window.G.autosave.state().blocked, null, { timeout: 15000 }).catch(() => {}); // (a joining hero's walk-in, a transition)
  const s = await page.evaluate(() => { const A = window.G.autosave; A.advance(0.001, { play: false }); A.play = 1e6; /* (settle saves made since the last tick first: they restart the timer) */ A.advance(5, { play: true }); return A.state(); });
  await page.waitForFunction(() => !window.G.autosave.idle, null, { timeout: 5000 }).catch(() => {});
  const lastLog = await page.evaluate(() => window.G.autosave.log.slice(-1)[0]);
  const idleWanted = m.avg > 4;
  R.check(`g) a fat save (${m.kb} KB, ${fat.stash} in the stash, ${fat.buildings} buildings, ${fat.heroes} heroes): the autosave ${idleWanted ? 'waits for an idle callback' : 'runs inline (under 4 ms)'}`, lastLog && lastLog.idle === idleWanted && (idleWanted ? s.idle || lastLog : true), { m, lastLog, blocked: s.blocked });
  // a slower device (a phone, the Deck on battery): a measured cost over 4 ms sends the autosave to an idle callback
  const slow = await page.evaluate(() => { const A = window.G.autosave; A.stat.avgMs = 9; A.advance(0.001, { play: false }); A.play = 1e6; const w0 = A.stat.writes; A.advance(1, { play: true }); return { queued: A.idle, wroteAtOnce: A.stat.writes > w0 }; });
  await page.waitForFunction(() => !window.G.autosave.idle, null, { timeout: 5000 }).catch(() => {});
  const slowLog = await page.evaluate(() => window.G.autosave.log.slice(-1)[0]);
  R.check('g) a save measured over 4 ms waits for requestIdleCallback, then writes', slow.queued && !slow.wroteAtOnce && slowLog?.idle === true, { slow, slowLog });
  errs.push(...errors); warns.push(...w); await browser.close();
}

process.exit(R.finish(errs, warns) ? 1 : 0);
