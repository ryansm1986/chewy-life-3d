// The stash's look review (ROADMAP R-18, R-19; docs/HOUSING.md "The stash"): node tools/qa/stash-shots.mjs [parts]
//   village  the Stash Chest by the plaza at the game camera: day and night, from both 45° yaws, the lid's pop when it
//            opens, and its build-palette card (Services) with the thumbnail
//   panel    the tabbed stash panel: one tab, three, all six, the "+" card, renaming (desktop 1920×1080, the Deck
//            1280×800 with its preset, a phone and an iPad with touch)
//   grid     items take up space (R-20, R-21): the bag and the stash with mixed sizes on every screen; on the desktop a
//            2 x 2 carried over a full area (red), Sort before and after, each filter, Lost & Found
//   treats   the Treats (R-22): the icon sheet (six kinds x three tiers, at cell size and 2x) and dropped treats on the
//            ground at the game camera
// Shots: tools/qa/tmp/stash/ (or OUT=…). BASE=… for a production bundle.
import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { BASE } from './lib.mjs';
import { PHONE, IPAD } from './touch-lib.mjs';

const OUT = process.env.OUT || 'tools/qa/tmp/stash';
fs.mkdirSync(OUT, { recursive: true });
const parts = process.argv.slice(2).length ? process.argv.slice(2) : ['village', 'panel'];
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const errors = [];

async function page({ w, h, qs = '', touch = false, dpr = 1, ua = null, deck = false }) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch, deviceScaleFactor: dpr, ...(ua ? { userAgent: ua } : {}) });
  const p = await ctx.newPage();
  // (the Deck: the desktop app's window.pawhaven, as deck-ui.mjs, so the Deck preset and UI pick themselves)
  if (deck) await p.addInitScript(() => { window.pawhaven = { desktop: true, deck: true, platform: 'linux', version: '0.6.6', isFullscreen: () => true, setFullscreen() {}, onFullscreen() {}, quit() {}, update: { info: async () => ({}), check: async () => ({ status: 'none' }), install: async () => ({ ok: false }), cancel: async () => {}, later: async () => {}, openPage: async () => {}, onProgress: () => () => {} } }; });
  await p.routeWebSocket(/.*/, ws => { ws.onMessage(() => {}); });
  p.on('pageerror', e => errors.push(`[pageerror] ${e.message}`));
  p.on('console', m => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errors.push(`[console] ${m.text()}`); });
  await p.goto(`${BASE}/?fresh&nointro&dseed=1${qs ? '&' + qs : ''}`, { waitUntil: 'load' });
  await p.waitForFunction(() => window.__ready === true && window.G?.player, null, { timeout: 60000 });
  await p.waitForTimeout(800);
  return { p, ctx };
}
const shot = async (p, name) => { await p.screenshot({ path: `${OUT}/${name}.png` }); console.log('  shot', name); };
const frames = (p, n = 3) => p.evaluate(n => new Promise(r => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

// ------------------------------------------------------------------ the Stash Chest in the village
if (parts.includes('village')) {
  const { p, ctx } = await page({ w: 1920, h: 1080 });
  const put = await p.evaluate(() => {
    const G = window.G, L = G.sim.world?.layout || null; void L;
    G.state.flags.burrowTut = true;
    G.player.setPos(113.5, 125.5); // (the plaza's south side: layout.js plaza (112, 121))
    const r = G.stashDebug.placeNear(2, 0); // (facing the street, +z)
    if (!r) return null;
    const rec = G.sim.list.find(x => x.data === r.b);
    const c = rec.group.position;
    G.player.setPos(c.x + 1.9, c.z + 2.2); G.player.faceTo?.(c.x, c.z);
    return { x: r.x, z: r.z, rot: r.b.rot, c: [c.x, c.z] };
  });
  console.log('placed', JSON.stringify(put));
  const view = async (yaw, hour, name) => {
    await p.evaluate(([yaw, hour]) => { const G = window.G, R = G.engine.rig; G.day.hour = hour; R.yawTarget = yaw; R.yaw = yaw; R.snap?.(); }, [yaw, hour]);
    await p.waitForTimeout(900); await frames(p, 4);
    await shot(p, name);
  };
  await view(Math.PI / 4, 11, 'v1-day-yaw45');
  await view(-Math.PI / 4, 11, 'v2-day-yaw-45');
  await view(Math.PI / 4, 21.5, 'v3-night-yaw45');
  await view(-Math.PI / 4, 21.5, 'v4-night-yaw-45');
  // close: the camera pulled in, the lid mid-pop as the stash opens
  await p.evaluate(() => { const G = window.G, R = G.engine.rig; G.day.hour = 11; R.yawTarget = R.yaw = Math.PI / 4; R.distTarget = R.dist = 11; R.snap?.(); });
  await p.waitForTimeout(700);
  await shot(p, 'v5-close');
  await p.evaluate(() => { const G = window.G, rec = G.sim.list.find(r => r.data.type === 'stashChest'); rec.inter.onInteract(); });
  await p.waitForTimeout(170); await shot(p, 'v6-lid-pop');
  await p.waitForTimeout(1200);
  await p.evaluate(() => window.G.ui.closeAll());
  // the build palette: the Services tab, the stash's card
  await p.evaluate(() => { const G = window.G, R = G.engine.rig; R.distTarget = R.dist = 22; R.snap?.(); G.build.enter(); });
  await p.waitForTimeout(900);
  await p.evaluate(() => { const B = window.G.ui.panels.build; B.cat = 'service'; B.render(true); });
  await p.waitForFunction(() => { const i = document.querySelector('.p-build .card[data-id="stashChest"] .cd-art img'); return i && !i.classList.contains('gi') && i.src.startsWith('data:image'); }, null, { timeout: 20000 }).catch(() => console.log('  (the thumbnail did not arrive)')); // (thumbnails come in after the palette opens)
  await p.waitForTimeout(400);
  const card = await p.$('.p-build .card[data-id="stashChest"]');
  await shot(p, 'v7-build-palette');
  if (card) {
    const b = await card.boundingBox(); await p.screenshot({ path: `${OUT}/v8-build-card-crop.png`, clip: { x: Math.max(0, b.x - 40), y: Math.max(0, b.y - 30), width: b.width + 80, height: b.height + 50 } }); console.log('  shot v8-build-card-crop');
    await card.hover(); await p.waitForTimeout(500); await shot(p, 'v9-build-card-tip');
  }
  await ctx.close();
}

// ------------------------------------------------------------------ the tabbed stash panel on every screen
if (parts.includes('panel')) {
  const DEV = [
    { id: 'desk', w: 1920, h: 1080 },
    { id: 'deck', w: 1280, h: 800, deck: true },
    { id: 'phone', ...PHONE, touch: true },
    { id: 'ipad', ...IPAD, touch: true },
  ].filter(d => !process.env.DEV || process.env.DEV.split(',').includes(d.id));
  for (const D of DEV) {
    const { p, ctx } = await page(D);
    const setup = tabs => p.evaluate(async tabs => {
      const I = await import('/src/rpg/items.js'); const G = window.G, A = G.actions, st = G.state;
      G.ui.closeAll();
      st.coins = 60000; for (const k of ['wood', 'stone', 'silk', 'crystal', 'lantern']) st.materials[k] = 500;
      while ((st.stashTabs?.length || 1) < tabs && A.buyStashTab()) { /* */ }
      const names = ['Gear', 'Treats', 'For Moka', 'Uniques', 'Spare boots', 'Gifts'], cols = ['pink', 'sky', 'mint', 'gold', 'lav', 'peach'];
      for (let t = 0; t < st.stashTabs.length; t++) { A.renameStashTab(t, names[t]); A.colorStashTab(t, cols[t]); }
      let seed = 1; const R = ['normal', 'magic', 'rare', 'unique', 'magic', 'rare'];
      for (let t = 0; t < st.stashTabs.length; t++) if (!st.stash.slice(t * 60, t * 60 + 60).some(Boolean)) for (let k = 0; k < 9 + t * 4; k++) A.stashPut(I.generateItem({ ilvl: 6 + k, rarity: R[(k + seed++) % R.length] }), t);
      if (!st.inventory.some(Boolean)) for (let i = 0; i < 9; i++) A.pickup(I.generateItem({ ilvl: 8 }));
      st.coins = 2600;
      G.ui.open('stash');
      return st.stashTabs.length;
    }, tabs);
    for (const n of [1, 3, 6]) {
      if (n === 1) await p.evaluate(() => { const st = window.G.state; st.stash.length = 60; st.stashTabs.length = 1; });
      const got = await setup(n); await p.waitForTimeout(900);
      await shot(p, `p-${D.id}-tabs${got}`);
      if (n === 3) {
        await p.click('.p-stash .st-buy', { force: true }); await p.waitForTimeout(600); await shot(p, `p-${D.id}-buy-card`);
        await p.evaluate(() => window.G.ui.hidePopover()); await p.waitForTimeout(200);
        await p.click('.p-stash .st-tab.on', { force: true }); await p.waitForTimeout(600); await shot(p, `p-${D.id}-rename`);
        await p.evaluate(() => window.G.ui.hidePopover()); await p.waitForTimeout(200);
      }
    }
    await ctx.close();
  }
}
// ------------------------------------------------------------------ items take up space: the grids on every screen
const MIX = () => window.__mix = async () => {
  const I = await import('/src/rpg/items.js'), B = I.ITEM_BASES, G = window.G, st = G.state, A = G.actions;
  const base = f => Object.keys(B).filter(k => B[k].kind === 'gear' && f(B[k]));
  let n = 0; const mk = (f, rarity) => { const ids = base(f); const it = I.generateItem({ ilvl: 8 + (n % 9), base: ids[n++ % ids.length], rarity }); it.req = { lvl: 1 }; return it; };
  const R = ['magic', 'rare', 'unique', 'normal', 'magic', 'set'];
  const kinds = [b => b.wtype === 'sword', b => b.slot === 'outfit', b => b.wtype === 'staff', b => b.slot === 'hat', b => b.wtype === 'fuma', b => b.slot === 'boots', b => b.slot === 'charm', b => b.wtype === 'lance', b => b.slot === 'paws', b => b.wtype === 'ball', b => b.slot === 'collar', b => b.wtype === 'flail'];
  st.inventory.fill(null); st.stash.fill(null);
  kinds.forEach((f, k) => A.pickup(mk(f, R[k % R.length])));
  for (const [t, k] of [['ruby', 2], ['blueberry', 0], ['lemon', 1], ['diamond', 2]]) A.pickup(I.makeGem(t, k));
  kinds.forEach((f, k) => A.stashPut(mk(f, R[(k + 2) % R.length]), 0));
  for (const [t, k] of [['cheese', 1], ['topaz', 2], ['ruby', 0]]) A.stashPut(I.makeGem(t, k), 0);
  A.sortContainer('stash', 0);
  G.ui.closeAll(); G.ui.open('stash'); G.ui.panels.stash.setTab(0); G.ui.panels.stash.setFilter('all');
};
if (parts.includes('grid')) {
  const DEV = [
    { id: 'desk', w: 1920, h: 1080 },
    { id: 'deck', w: 1280, h: 800, deck: true },
    { id: 'phone', ...PHONE, touch: true },
    { id: 'ipad', ...IPAD, touch: true },
  ].filter(d => !process.env.DEV || process.env.DEV.split(',').includes(d.id));
  for (const D of DEV) {
    const { p, ctx } = await page(D);
    await p.evaluate(MIX); await p.evaluate(() => window.__mix());
    await p.waitForTimeout(1000);
    await shot(p, `g-${D.id}-mixed`);
    if (D.id === 'phone') { await p.evaluate(() => { const M = window.G.ui.mobile; M.front = 'inventory'; M.pairs(true); }); await p.waitForTimeout(500); await shot(p, 'g-phone-mixed-bag'); }
    if (D.id === 'desk') {
      // a 2 x 2 carried over a full area: red
      const o = await p.evaluate(() => { const st = window.G.state; return st.inventory.findIndex(x => x?.slot === 'outfit'); });
      const b = await (await p.$(`.p-inv .slot[data-c="inv"][data-i="${o}"]`)).boundingBox();
      await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await p.mouse.down(); await p.mouse.move(b.x + b.width / 2 + 30, b.y + b.height / 2, { steps: 4 });
      // the spots: a 2 x 2 over two or more items (red), over free cells (green); the pointer at the footprint's centre
      const spots = await p.evaluate(async (o) => { const Gr = await import('/src/rpg/grid.js'), st = window.G.state, g = Gr.bagGrid(st), it = st.inventory[o]; let red = null, green = null; for (let y = 0; y < 3; y++) for (let x = 0; x < 9; x++) { const f = Gr.fitsAt(g, it, x, y, o); if (!red && f.under.length >= 2) red = [x, y]; if (!green && f.ok) green = [x, y]; } return { red, green }; }, o);
      const at = ([x, y]) => p.$eval('.p-inv .grid[data-g="inv"]', (e, [x, y]) => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e), C = parseFloat(cs.gridTemplateColumns), G = parseFloat(cs.columnGap), pl = parseFloat(cs.paddingLeft), bl = parseFloat(cs.borderLeftWidth), z = r.width / e.offsetWidth; return { x: r.left + (bl + pl + (x + 1) * (C + G) - G / 2) * z, y: r.top + (bl + pl + (y + 1) * (C + G) - G / 2) * z }; }, [x, y]);
      if (spots.red) { const q = await at(spots.red); await p.mouse.move(q.x, q.y, { steps: 8 }); await p.waitForTimeout(300); await shot(p, 'g-desk-carry-2x2-red'); }
      if (spots.green) { const q = await at(spots.green); await p.mouse.move(q.x, q.y, { steps: 8 }); await p.waitForTimeout(300); await shot(p, 'g-desk-carry-2x2-green'); }
      await p.mouse.up(); await p.waitForTimeout(300); await p.evaluate(() => window.G.ui.drag.cancel());
      // Sort, before and after (the bag shuffled first)
      await p.evaluate(async () => { window.__gr = await import('/src/rpg/grid.js'); });
      await p.evaluate(() => { const st = window.G.state, Gr = window.__gr, items = st.inventory.filter(Boolean); st.inventory.fill(null); let k = 7; for (const it of items) { let put = false; for (let t = 0; t < 80 && !put; t++) { k = (k * 13 + 5) % 40; if (Gr.fitsAt({ cells: st.inventory, off: 0, w: 10, h: 4 }, it, k % 10, (k / 10) | 0).ok) { st.inventory[k] = it; put = true; } } if (!put) { const j = Gr.findSpot(Gr.bagGrid(st), it); if (j >= 0) st.inventory[j] = it; else window.G.actions.stashPut(it, 1); } } window.G.ui.refreshItems(); });
      await p.waitForTimeout(500); await shot(p, 'g-desk-sort-before');
      await p.click('.p-inv .sort'); await p.waitForTimeout(800); await shot(p, 'g-desk-sort-after');
      // each filter
      for (const f of ['weapon', 'armour', 'jewel', 'treat', 'other']) { await p.click(`.p-stash .st-chip[data-f="${f}"]`); await p.waitForTimeout(350); await shot(p, `g-desk-filter-${f}`); }
      await p.evaluate(() => window.G.ui.panels.stash.setFilter('all'));
      // Lost & Found: the bag and the stash full, a reward arrives
      await p.evaluate(async () => { const I = await import('/src/rpg/items.js'), G = window.G, st = G.state, B = I.ITEM_BASES, base = f => Object.keys(B).find(k => B[k].kind === 'gear' && f(B[k]));
        for (let i = 0; i < st.stash.length; i++) st.stash[i] = I.makeGem(I.GEM_TYPES[i % 6], i % 3); st.inventory.fill(null); for (let i = 0; i < 40; i++) st.inventory[i] = I.makeGem(I.GEM_TYPES[(i + 2) % 6], (i + 1) % 3);
        for (const f of [b => b.slot === 'outfit', b => b.wtype === 'staff', b => b.wtype === 'sword', b => b.slot === 'hat']) G.story.giveItem(I.generateItem({ ilvl: 12, rarity: 'rare', base: base(f) }));
        G.ui.refreshItems(); G.ui.panels.stash.setTab(-1); });
      await p.waitForTimeout(700); await shot(p, 'g-desk-lost-and-found');
    }
    await ctx.close();
  }
}
// ------------------------------------------------------------------ Treats: the icon sheet and on the ground
if (parts.includes('treats')) {
  const { p, ctx } = await page({ w: 1100, h: 760 });
  await p.evaluate(async () => {
    const I = await import('/src/rpg/items.js'), IC = await import('/src/rpg/icons.js');
    const d = document.createElement('div'); d.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#fbf0e2;padding:16px 22px;font:600 13px Fredoka, sans-serif;color:#4a2c2a';
    let h = '<div style="font-size:20px;margin-bottom:8px">Treats: six kinds × three tiers (Crumbly · plain · Gourmet), at cell size (52 px) and 2×</div><table style="border-spacing:10px 6px"><tr><td></td>' + ['Crumbly', 'plain', 'Gourmet'].map(t => `<td colspan=2 style="text-align:center">${t}</td>`).join('') + '<td>socket dots</td></tr>';
    for (const t of I.GEM_TYPES) {
      h += `<tr><td style="width:150px">${I.GEMS[t].name}</td>`;
      for (let k = 0; k < 3; k++) { const u = IC.gemIcon(t, k); h += `<td><div style="width:52px;height:52px;border-radius:13px;border:2.5px solid rgba(74,44,42,.32);background:radial-gradient(circle at 50% 38%,#fffbf5,#f4e4cf);display:grid;place-items:center"><img src="${u}" style="width:86%;height:86%"></div></td><td><img src="${u}" style="width:104px;height:104px;background:#fff;border-radius:16px"></td>`; }
      h += `<td><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${I.GEMS[t].colors[0]};border:1px solid rgba(74,44,42,.5)"></span> <span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:${I.GEMS[t].colors[0]};border:1.5px solid rgba(74,44,42,.5)"></span></td></tr>`;
    }
    d.innerHTML = h + '</table>'; document.body.appendChild(d);
  });
  await p.waitForTimeout(500); await shot(p, 't-treat-sheet');
  await ctx.close();
  // dropped treats on open ground: the village paving (an open stretch of street, found by scanning: paved all round,
  // nothing solid or built within reach) and a Burrow floor after a kill; the game camera from both 45° yaws (the treats
  // laid in a row across the screen, in front of Chewy, for each), a closer crop; the loot labels on
  const q = await page({ w: 1920, h: 1080, qs: 'notut' });
  const LIST = [['ruby', 0], ['blueberry', 1], ['lemon', 2], ['cheese', 1], ['diamond', 0], ['topaz', 1], ['ruby', 2], ['cheese', 2]];
  const drop = (yaw, ahead = 1.5) => q.p.evaluate(async ([yaw, LIST, ahead]) => {
    const I = await import('/src/rpg/items.js'), G = window.G, P = G.player, V = G.THREE.Vector3;
    const L = G.mode === 'village' ? G.villageLoot : G.dungeon.loot, c = P.pos.clone();
    for (const e of [...L.list]) if (e.d.type === 'gem') L.remove(e);
    const rx = Math.cos(yaw), rz = -Math.sin(yaw), fx = Math.sin(yaw), fz = Math.cos(yaw); // (screen-right, toward the camera)
    LIST.forEach(([t, k], j) => { const u = (j - (LIST.length - 1) / 2) * 0.82, to = new V(c.x + rx * u + fx * ahead, 0, c.z + rz * u + fz * ahead); to.y = G.world.heightAt(to.x, to.z); L.spawn({ type: 'gem', item: I.makeGem(t, k) }, to.clone().setY(to.y + 0.6), to); });
  }, [yaw, LIST, ahead]);
  // (close: the camera's focus on the row of treats, not on Chewy, so the row sits mid-screen above the HUD)
  const cam = (yaw, d = 22) => q.p.evaluate(([yaw, d]) => { const G = window.G, R = G.engine.rig, P = G.player.pos; R.focus.copy(P); R.yawTarget = R.yaw = yaw; R.distTarget = R.dist = d; R.snap(); G.ui.labels?.setVisible?.(true); G.player.faceTo(P.x - Math.sin(yaw) * 3, P.z - Math.cos(yaw) * 3); }, [yaw, d]);
  const set = async tag => {
    for (const [yaw, n] of [[Math.PI / 4, 'a'], [-Math.PI / 4, 'b']]) { await cam(yaw); await drop(yaw); await q.p.waitForTimeout(2400); await cam(yaw); await q.p.waitForTimeout(500); await shot(q.p, `t-${tag}-treats-yaw-${n}`); }
    // close: the row laid level with Chewy, then Chewy steps 2 m toward the camera, so the row sits above him mid-screen
    await q.p.evaluate(() => { const G = window.G, P = G.player, y = Math.PI / 4; P.setPos(P.pos.x + Math.sin(y) * 2, P.pos.z + Math.cos(y) * 2); });
    await cam(Math.PI / 4, 10); await drop(Math.PI / 4, -2); await q.p.waitForTimeout(2400); // (Chewy stepped toward the camera first: he never walks through the row)
    await cam(Math.PI / 4, 10); await q.p.waitForTimeout(500); await shot(q.p, `t-${tag}-treats-close`);
  };
  const spot = await q.p.evaluate(async () => {
    const G = window.G, sim = G.sim, W = G.world, { WORLD, T } = await import('/src/world/layout.js'), tl = sim.terrain.tiles;
    G.state.flags.burrowTut = true; G.day.hour = 11;
    // the nearest stretch to the plaza that's paved (street or plaza) all round, with nothing built or solid in reach
    let best = null, bd = 1e9;
    for (let z = 96; z < 150; z++) for (let x = 90; x < 165; x++) {
      const d = Math.hypot(x - 112, z - 121); if (d < 5 || d > bd) continue;
      let ok = true;
      for (let dz = -2; dz <= 2 && ok; dz++) for (let dx = -3; dx <= 3 && ok; dx++) { const i = (z + dz) * WORLD + (x + dx), t = tl[i]; if ((t !== T.PATH && t !== T.PLAZA) || sim.occ[i] >= 0 || W.collision?.solidAt?.(x + dx + 0.5, z + dz + 0.5, 0.4)) ok = false; }
      if (ok) { best = { x: x + 0.5, z: z + 0.5 }; bd = d; }
    }
    if (best) G.player.setPos(best.x, best.z);
    return best;
  });
  console.log('village spot', JSON.stringify(spot));
  await set('village');
  // the Burrow, after a kill: the treats spill where the monster fell
  await q.p.evaluate(() => window.G.enterDungeon(1));
  await q.p.waitForFunction(() => window.G.mode === 'dungeon' && !window.G.ui.iris.active, null, { timeout: 30000 });
  await q.p.waitForTimeout(1200);
  await q.p.evaluate(async () => { const G = window.G, P = G.player; G.player.invuln = true; const ms = G.dungeon.monsters.filter(m => m.alive); ms.sort((a, b) => Math.hypot(a.pos.x - P.pos.x, a.pos.z - P.pos.z) - Math.hypot(b.pos.x - P.pos.x, b.pos.z - P.pos.z)); const m = ms[0]; for (const o of ms) { o.status.stun = 999; o.aggro = false; } if (m) P.setPos(m.pos.x, m.pos.z); for (const o of ms) if (Math.hypot(o.pos.x - P.pos.x, o.pos.z - P.pos.z) < 16) G.combat.applyDamageToMonster(o, Math.ceil(o.life) + 1, { silent: true }); });
  await q.p.waitForTimeout(2500);
  await q.p.evaluate(() => { const L = window.G.dungeon.loot; for (const e of [...L.list]) if (e.d.type !== 'gem') L.remove(e); }); // (the fight's own drops cleared: only the treats on the floor)
  await set('burrow');
  await q.ctx.close();
}
if (errors.length) console.log('ERRORS\n' + [...new Set(errors)].slice(0, 20).join('\n'));
await browser.close();
