// Scenario 18: getting furniture (docs/HOUSING.md §3) — Tanu's Trinkets, the workbench and the finds.
//  a) the stall on Market Street: off the street and the plots, a collider, an F interactable that opens the shop;
//     Tanu's own "Furniture, please!" chat choice opens it too (the storage beside it)
//  b) buying a piece (coins down, storage up, "Sent to your storage", today's stock down) and a recipe scroll (learned);
//     selling a piece back pays half its price
//  c) the stock is the same after a save and reload (what was bought stays bought) and changes the next day
//  d) the workbench: inside the cottage (F at the workbench) and at the Lumber workshop — a craft spends the materials,
//     puts the piece in storage, emits furniture:crafted
//  e) finds: a forced find in a region and in the Burrow drops a 'furniture' loot (the piece's own model) that the hero
//     picks up into storage (a toast)
//  f) no leaks: 6 shop / workbench open-close cycles grow no geometry, textures, interactables or listeners
// SHOTS=<dir> saves screenshots of the key moments.
import path from 'node:path';
import { launch, boot, sleep, makeReport, tap, waitMode, waitIdle, installProbes, drainDialogue, BASE } from './lib.mjs';

const R = makeReport('S18 furniture sources: Tanu\'s Trinkets, the workbench, finds');
const { browser, page, errors, warns } = await launch({ w: 1600, h: 900 });
const G = (fn, arg) => page.evaluate(fn, arg);
const SHOTS = process.env.SHOTS;
const snap = async n => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 's18_' + n + '.png') }); };
const freeze = () => G(() => { const G = window.G; G.sim.tickT = -1e9; clearInterval(window.__freeze); window.__freeze = setInterval(() => { G.sim.tickT = -1e9; }, 200); });
const shopState = () => G(() => { const G = window.G, P = G.ui.panels.shop; return { open: G.ui.isOpen('shop'), title: P.panel?.querySelector('.ph-t')?.textContent, n: document.querySelectorAll('.p-shop .sh-item.furn').length, inv: G.ui.isOpen('inventory') && G.ui.panels.inventory.view, coins: G.state.coins }; });
try {
  await boot(page, 'fresh&nointro&hour=11');
  await freeze();
  // ---------------------------------------------------------------- a) the stall
  const a = await G(async () => {
    const G = window.G, S = G.trinketStall, W = G.village.world, Lay = await import('/src/world/layout.js'), { PLOTS } = await import('/src/world/plots.js');
    const inPlot = (x, z, m) => PLOTS.some(p => x > p.x - m && x < p.x + p.w + m && z > p.z - m && z < p.z + p.d + m);
    const inter = W.interactables.filter(i => i.label === "Tanu's Trinkets");
    return { stall: !!S?.group?.parent, inter: inter.length, walk: W.walkable(S.pos.x, S.pos.z), street: +Lay.distToPaths(S.at.x, S.at.z).toFixed(2), plot: inPlot(S.at.x, S.at.z, 0.6), solid: W.collision.solidAt(S.at.x, S.at.z), cols: S.cols.length, tanu: +Math.hypot(S.at.x - Lay.ANCHORS.tanu.x, S.at.z - Lay.ANCHORS.tanu.z).toFixed(1), market: Lay.distToPaths(S.at.x, S.at.z, [Lay.STREETS.mainE]) < 6 };
  });
  R.check("Tanu's stall stands on Market Street near his spot: off the street and the plots, solid, one F interactable on walkable ground", a.stall && a.inter === 1 && a.walk && a.street > 1.6 && !a.plot && a.solid && a.cols >= 1 && a.tanu < 8 && a.market, JSON.stringify(a));
  await G(() => { const G = window.G, S = G.trinketStall; G.player.setPos(S.pos.x, S.pos.z); G.player.moveTarget = null; G.interactCooldown = 0; });
  await sleep(page, 400);
  const prompt = await G(() => window.G.player.interactTarget?.label || document.querySelector('.hud .prompt')?.textContent || '');
  await tap(page, 'f', 70); await sleep(page, 900);
  const s1 = await shopState();
  await snap('shop');
  R.check('F at the stall opens Tanu\'s Trinkets: furniture goods, the storage beside it', /Trinkets/.test(prompt) && s1.open && /Tanu's Trinkets/.test(s1.title) && s1.n >= 12 && s1.inv === 'furniture', JSON.stringify({ prompt, s1 }));
  await G(() => window.G.ui.closeAll()); await sleep(page, 400);
  // Tanu's chat: "Furniture, please!"
  await G(() => { const G = window.G, n = G.npcs.find(x => x.id === 'tanu'); G.player.setPos(n.pos.x + 0.9, n.pos.z); G.talkTo(n); });
  await sleep(page, 300);
  const choices = await G(async () => { const d = window.G.ui.dlg; for (let i = 0; i < 30 && (d.typing || d.i < d.lines.length - 1); i++) { d.advance(); await new Promise(r => setTimeout(r, 50)); } return d.choices?.map(c => c.text) || []; });
  const fi = choices.findIndex(t => /Furniture/.test(t));
  await drainDialogue(page, [Math.max(0, fi)]); await sleep(page, 700);
  const s2 = await shopState();
  R.check('Tanu\'s "Furniture, please! 🪑" chat choice opens the shop', fi >= 0 && s2.open && /Tanu's Trinkets/.test(s2.title), JSON.stringify({ choices, s2 }));

  // ---------------------------------------------------------------- b) buy, a scroll, sell
  await G(() => { window.G.state.coins = 5000; window.G.ui.panels.shop._sig = null; window.G.ui.panels.shop.render(); });
  const b = await G(async () => {
    const G = window.G, P = G.ui.panels.shop, st = G.state, cells = [...document.querySelectorAll('.p-shop .sh-item.furn:not(.always):not(.scroll)')], { itemDef } = await import('/src/home/furniture.js');
    const cell = cells.find(c => (P.entries[+c.dataset.i].stock || 0) >= 1), e = P.entries[+cell.dataset.i];
    const id = e.furn, c0 = st.coins, n0 = st.furniture[id] || 0, stock0 = e.stock, price = e.price, t0 = window.QA.toasts.length, name = itemDef(id).name;
    cell.click(); await new Promise(r => setTimeout(r, 400));
    const T = G.trinkets(), left = P.entries.find(x => x.furn === id)?.stock ?? 0;
    return { id, price, paid: c0 - st.coins, got: (st.furniture[id] || 0) - n0, sold: T.sold[id], stock0, left, toast: window.QA.toasts.slice(t0).some(t => t.includes(name)), found: !!st.furnitureFound?.[id] };
  });
  await snap('bought');
  R.check('buying a piece: the coins go down by its price, it goes into storage, today\'s stock goes down', b.paid === b.price && b.got === 1 && b.sold === 1 && b.left === b.stock0 - 1 && b.found && b.toast, JSON.stringify(b));
  const sc = await G(async () => {
    const G = window.G, P = G.ui.panels.shop, st = G.state, { knowsRecipe } = await import('/src/home/recipes.js');
    const cell = document.querySelector('.p-shop .sh-item.scroll'); if (!cell) return { none: true };
    const e = P.entries[+cell.dataset.i], c0 = st.coins, k0 = knowsRecipe(st, e.recipe);
    cell.click(); await new Promise(r => setTimeout(r, 400));
    return { recipe: e.recipe, k0, k1: knowsRecipe(st, e.recipe), paid: c0 - st.coins, price: e.price, gone: !P.entries.some(x => x.furn === e.furn) };
  });
  R.check('a recipe scroll teaches its workbench recipe (and is gone from the shelf)', !sc.none && !sc.k0 && sc.k1 && sc.paid === sc.price && sc.gone, JSON.stringify(sc));
  await G(() => document.querySelector('.p-shop .sh-tabs .tab[data-t="sell"]').click()); await sleep(page, 500);
  await snap('sell');
  const sl = await G(async () => {
    const G = window.G, st = G.state, { FURNITURE } = await import('/src/home/furniture.js');
    const cell = document.querySelector('.p-shop .sh-item[data-fid="chabudai"]') || document.querySelector('.p-shop .sh-item[data-fid]');
    const id = cell.dataset.fid, c0 = st.coins, n0 = st.furniture[id] || 0, list = [...document.querySelectorAll('.p-shop .sh-item[data-fid]')].map(c => c.dataset.fid);
    cell.click(); await new Promise(r => setTimeout(r, 300));
    return { id, price: FURNITURE[id]?.price ?? null, got: st.coins - c0, left: (st.furniture[id] || 0) - n0, list, free: list.some(x => x === 'wp_plaster' || x === 'fl_planks') };
  });
  R.check('the Sell tab lists the storage; selling one piece pays half its price', sl.list.length >= 5 && !sl.free && sl.left === -1 && sl.got === Math.floor((sl.price ?? 0) / 2) && sl.got > 0, JSON.stringify(sl));
  await G(() => window.G.ui.closeAll()); await sleep(page, 300);

  // ---------------------------------------------------------------- c) the stock across a reload and the next day
  const before = await G(() => { const T = window.G.trinkets(); return { day: T.day, list: JSON.stringify(T.list), sold: JSON.stringify(T.sold) }; });
  await G(() => window.G.save());
  await page.goto(`${BASE}/?notitle&nointro&hour=11`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true && window.G?.player, null, { timeout: 60000 }); await sleep(page, 800); await installProbes(page);
  await freeze();
  const re = await G(id => { const G = window.G; G.openTrinkets(); const T = G.trinkets(), P = G.ui.panels.shop, e = T.list.find(x => x.id === id); return { day: T.day, list: JSON.stringify(T.list), sold: JSON.stringify(T.sold), shelf: P.entries.find(x => x.furn === id)?.stock ?? 0, want: e.stock - (T.sold[id] || 0) }; }, b.id);
  R.check('after a save and reload the stock is the same, and what was bought stays bought', re.day === before.day && re.list === before.list && re.sold === before.sold && re.shelf === re.want, JSON.stringify({ before: { day: before.day, sold: before.sold }, re: { day: re.day, sold: re.sold, shelf: re.shelf, want: re.want, same: re.list === before.list } }));
  await G(() => window.G.ui.closeAll());
  const nx = await G(() => { const G = window.G; G.day.day += 1; G.openTrinkets(); const T = G.trinkets(), ids = T.list.filter(e => !e.always).map(e => e.id).join(); G.ui.closeAll(); return { day: T.day, sold: Object.keys(T.sold).length, ids }; });
  const ids0 = JSON.parse(before.list).filter(e => !e.always).map(e => e.id).join();
  R.check('the next day Tanu restocks (a new rotation, nothing sold yet)', nx.day === before.day + 1 && nx.sold === 0 && nx.ids !== ids0, JSON.stringify({ nx, ids0 }));
  await sleep(page, 300);

  // ---------------------------------------------------------------- d) the workbench: the cottage and the Lumber workshop
  await G(() => { const G = window.G; G.state.materials.wood = 40; G.state.materials.stone = 10; G.state.materials.silk = 4; G.state.materials.petal = 10; window.__crafted = []; window.__cOff ||= window.QA.Events.on('furniture:crafted', e => window.__crafted.push(e)); });
  await G(() => window.G.openHome()); await waitMode(page, 'interior'); await sleep(page, 500);
  const wb0 = await G(async () => {
    const G = window.G, W = G.world;
    let it = W.interactables.find(i => i.use === 'craft'), placed = false;
    if (!it) { // (an old cottage without the workbench: put one in, as decorating would)
      const { nextK } = await import('/src/home/placement.js'), I = G.housing.rec.data.interior;
      I.items.push({ k: nextK(I.items), id: 'workbench', mount: 'floor', x: 11, z: 4, rot: 1 });
      if (W.items !== I.items) W.items.push(I.items[I.items.length - 1]);
      G.housing.refresh(); it = W.interactables.find(i => i.use === 'craft'); placed = true;
    }
    if (it) { G.player.setPos(it.pos.x, it.pos.z); G.player.moveTarget = null; G.interactCooldown = 0; }
    return { it: !!it, placed, label: it?.label };
  });
  await sleep(page, 300); await tap(page, 'f', 70); await sleep(page, 900);
  const wb1 = await G(() => ({ open: window.G.ui.isOpen('craft'), title: window.G.ui.panels.craft.panel?.querySelector('.ph-t')?.textContent, rows: document.querySelectorAll('.p-craft .ck-row').length, unk: document.querySelectorAll('.p-craft .ck-row.unk').length }));
  R.check('inside the cottage, F at the workbench opens the Workbench panel (known recipes, and ??? ones)', wb0.it && wb1.open && wb1.title === 'Workbench' && wb1.rows >= 12 && wb1.unk >= 1, JSON.stringify({ wb0, wb1 }));
  const craftAt = async (id) => {
    const c0 = await G(id => { const G = window.G, st = G.state; document.querySelector(`.p-craft .ck-row[data-id="${id}"]`)?.click(); return { wood: st.materials.wood, stone: st.materials.stone, n: st.furniture[id] || 0, ev: window.__crafted.length }; }, id);
    await sleep(page, 300);
    await G(() => document.querySelector('.p-craft .ck-go').click());
    await sleep(page, 900); await snap('craft_' + id);
    await page.waitForFunction(() => !window.G.workbench.busy, null, { timeout: 10000 }); await sleep(page, 500);
    await snap('craft_' + id + '_done');
    await sleep(page, 1200);
    const c1 = await G(id => { const G = window.G, st = G.state; return { wood: st.materials.wood, stone: st.materials.stone, n: st.furniture[id] || 0, ev: window.__crafted.slice(-1)[0] || null, nev: window.__crafted.length, locked: G.player.controlLocked, busy: G.ui.panels.craft.busy }; }, id);
    return { c0, c1 };
  };
  const k1 = await craftAt('sideTable');
  R.check('crafting a side table at home: wood and stone spent, one more in storage, furniture:crafted', k1.c1.wood === k1.c0.wood - 5 && k1.c1.stone === k1.c0.stone - 1 && k1.c1.n === k1.c0.n + 1 && k1.c1.nev === k1.c0.ev + 1 && k1.c1.ev?.out === 'sideTable' && !k1.c1.locked && !k1.c1.busy, JSON.stringify(k1));
  await G(() => window.G.ui.closeAll()); await sleep(page, 300);
  await G(() => window.G.world.interactables.find(i => i.door).onInteract()); await waitMode(page, 'village'); await sleep(page, 400);
  const lm = await G(() => { const G = window.G, it = G.village.world.interactables.find(i => i.building?.type === 'lumber'); if (it) { G.player.setPos(it.pos.x, it.pos.z); G.player.moveTarget = null; G.interactCooldown = 0; } return { it: !!it, label: it?.label }; });
  if (lm.it) { await sleep(page, 300); await tap(page, 'f', 70); } else await G(() => window.G.openWorkbench('lumber'));
  await sleep(page, 900);
  const lw = await G(() => ({ open: window.G.ui.isOpen('craft'), title: window.G.ui.panels.craft.panel?.querySelector('.ph-t')?.textContent }));
  const k2 = await craftAt('woodChair');
  R.check(`the Lumber workshop's workbench${lm.it ? ' (F at its door)' : ' (no lumber yard in this village: opened directly)'} crafts a wooden chair`, lw.open && /Lumber/.test(lw.title) && k2.c1.wood === k2.c0.wood - 6 && k2.c1.n === k2.c0.n + 1 && k2.c1.ev?.where === 'lumber', JSON.stringify({ lm, lw, k2 }));
  await G(() => window.G.ui.closeAll()); await sleep(page, 300);

  // ---------------------------------------------------------------- e) finds: a region and the Burrow
  const findIn = async (enter, where) => {
    await G(enter); await waitMode(page, 'dungeon'); await waitIdle(page); await sleep(page, 1500);
    const k = await G(async where => {
      const G = window.G, D = G.dungeon, P = G.player, { FIND_TABLES, anyPool } = await import('/src/home/finds.js');
      const m = D.monsters.find(x => x.alive && !x.def.boss && x !== D.boss);
      for (const o of D.monsters) if (o !== m) { o.pos.set(-400, 0, -400); o.aggro = false; o.frozen = true; }
      const l0 = D.loot.list.length; G.finds.force = 1;
      // (the hero stands back, out of the loot magnet's reach, so the find stays on the ground to be looked at)
      let sx = m.pos.x, sz = m.pos.z; for (let r = 5; r < 12; r += 0.5) { let hit = false; for (let a = 0; a < 6.283 && !hit; a += 0.3) { const x = m.pos.x + Math.cos(a) * r, z = m.pos.z + Math.sin(a) * r; if (G.world.walkable(x, z)) { sx = x; sz = z; hit = true; } } if (hit) break; }
      P.setPos(sx, sz); G.combat.hitMonster(m, { dmgPct: 1e6 });
      await new Promise(r => setTimeout(r, 1200));
      const f = D.loot.list.find(e => e.d.type === 'furniture');
      const ok = f && (FIND_TABLES[where].includes(f.d.key) || (where === 'burrow' && anyPool(G.sim.stats.rank || 1).includes(f.d.key)));
      window.__find = f ? { key: f.d.key, x: f.to.x, z: f.to.z } : null;
      let shown = false; if (f) { const pc = f.mesh.userData.piece || f.mesh; f.mesh.updateMatrixWorld(true); const box = new G.THREE.Box3().setFromObject(pc), s = box.getSize(new G.THREE.Vector3()); shown = f.mesh.parent === G.world.scene && !!f.mesh.userData.glow && Math.max(s.x, s.y, s.z) > 0.2 && Math.max(s.x, s.y, s.z) < 0.95; } // (the piece itself, about half a metre, over its glow)
      return { dead: !m.alive, force: G.finds.force, key: f?.d.key || null, ok: !!ok, shown, label: f?.label || null, n0: G.state.furniture[f?.d.key] || 0 };
    }, where);
    await snap('find_' + where);
    await G(() => { const G = window.G, f = window.__find; if (f) { G.player.setPos(f.x + 0.3, f.z); G.player.moveTarget = null; } });
    await sleep(page, 1600);
    const p = await G(key => { const G = window.G; return { gone: !G.dungeon.loot.list.some(e => e.d.type === 'furniture'), n1: G.state.furniture[key] || 0, toast: window.QA.toasts.slice(-4).join(' | ') }; }, k.key);
    await snap('find_' + where + '_picked');
    await G(() => window.G.returnToVillage()); await waitMode(page, 'village'); await waitIdle(page); await sleep(page, 500);
    return { k, p };
  };
  const fr = await findIn(() => window.G.enterRegion('maple'), 'maple');
  R.check('a forced find in a region (Maple Hollow): a kill drops one of its pieces as a \'furniture\' loot showing the piece; walking up puts it in storage with a toast', fr.k.dead && fr.k.ok && fr.k.shown && fr.k.force === 0 && fr.p.gone && fr.p.n1 === fr.k.n0 + 1 && fr.p.toast.includes(fr.k.label), JSON.stringify(fr));
  const fb = await findIn(() => window.G.enterDungeon(1), 'burrow');
  R.check('a forced find in the Burrow: an oddity (or a rank piece) drops and is picked up', fb.k.dead && fb.k.ok && fb.k.shown && fb.p.gone && fb.p.n1 === fb.k.n0 + 1 && fb.p.toast.includes(fb.k.label), JSON.stringify(fb));

  // ---------------------------------------------------------------- f) no leaks over shop / workbench cycles
  const cycle = async () => {
    await G(() => window.G.openTrinkets()); await sleep(page, 450);
    await G(() => document.querySelector('.p-shop .sh-tabs .tab[data-t="sell"]')?.click()); await sleep(page, 250);
    await G(() => window.G.ui.closeAll()); await sleep(page, 250);
    await G(() => window.G.openWorkbench('home')); await sleep(page, 450);
    await G(() => window.G.ui.closeAll()); await sleep(page, 300);
  };
  // (the villagers hold still meanwhile: their own lazily made props, such as a first fishing rod, aren't ours to count)
  await G(() => { for (const n of window.G.npcs || []) { n.__wasFrozen = n.frozen; n.frozen = true; } });
  await cycle();
  const mem = () => G(() => { const G = window.G, r = G.engine.renderer; return { geo: r.info.memory.geometries, tex: r.info.memory.textures, inter: G.village.world.interactables.length, nodes: document.getElementsByTagName('*').length, offs: G.ui.panels.craft._offs, thumbs: G.thumbs.cache.size }; });
  const m0 = await mem();
  for (let i = 0; i < 3; i++) await cycle();
  const m1 = await mem();
  for (let i = 0; i < 3; i++) await cycle();
  const m2 = await mem();
  await G(() => { for (const n of window.G.npcs || []) n.frozen = !!n.__wasFrozen; });
  R.check('6 shop / workbench open-close cycles: no geometry, texture, interactable, DOM or listener growth', m2.geo <= m1.geo && m2.tex <= m1.tex && m2.geo - m0.geo <= 1 && m2.tex - m0.tex <= 1 && m2.inter === m0.inter && m2.nodes <= m0.nodes + 20 && m2.offs === null && m2.thumbs === m0.thumbs, JSON.stringify({ m0, m1, m2 }));
} catch (e) {
  R.check('scenario ran to the end', false, e.message);
}
const failed = R.finish(errors, warns);
await browser.close();
process.exit(failed ? 1 : 0);
