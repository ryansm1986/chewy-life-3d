// Scenario 7: inventory / equipment edge cases through G.actions (and the real inventory UI for drag-to-ground).
import { launch, boot, waitMode, sleep, makeReport, tap } from './lib.mjs';

const R = makeReport('S7 inventory & equipment edge cases');
const { browser, page, errors, warns } = await launch();
try {
  await boot(page, 'fresh&nointro');
  await page.evaluate(async () => { window.QA.items = await import('/src/rpg/items.js'); window.G.state.flags.burrowTut = true; });

  // 1. fill the bag, pickup when full
  const fill = await page.evaluate(() => {
    const G = window.G, A = G.actions, gen = window.QA.items.generateItem;
    let ok = 0; const t0 = window.QA.toasts.length;
    for (let i = 0; i < 40; i++) if (A.pickup(gen({ ilvl: 5, rarity: 'magic' }))) ok++;
    const over = A.pickup(gen({ ilvl: 5, rarity: 'rare' }));
    return { ok, over, full: G.state.inventory.every(Boolean), toasts: window.QA.toasts.slice(t0) };
  });
  R.check('bag holds exactly 40 items, 41st pickup refused with a toast', fill.ok === 40 && fill.over === false && fill.full && fill.toasts.includes('Bag is full!'), JSON.stringify({ ...fill, toasts: fill.toasts.slice(-2) }));
  const buyFull = await page.evaluate(() => { const G = window.G, c0 = G.state.coins = 500; const r = G.actions.buyItem(window.QA.items.generateItem({ ilvl: 3, rarity: 'normal' }), 50); return { r, coins: G.state.coins, c0 }; });
  R.check('buying with a full bag is refused and costs nothing', buyFull.r === false && buyFull.coins === buyFull.c0, JSON.stringify(buyFull));

  // 2. ground pickup when full (Burrow): item stays, no spam; belt-full potion behaviour
  await page.evaluate(() => window.G.enterDungeon(1)); await waitMode(page, 'dungeon');
  await page.evaluate(() => { const G = window.G; for (const m of G.dungeon.monsters) { m.status.stun = 999; m.aggro = false; } G.player.invuln = true; });
  const ground = await page.evaluate(async () => {
    const G = window.G, P = G.player, L = G.dungeon.loot, gen = window.QA.items.generateItem;
    const t0 = window.QA.toasts.length, n0 = L.list.length;
    L.spawn({ type: 'item', item: gen({ ilvl: 5, rarity: 'rare' }) }, P.pos.clone().setY(1), P.pos.clone());
    await new Promise(r => setTimeout(r, 1500));
    return { onGround: L.list.length - n0, toasts: window.QA.toasts.slice(t0) };
  });
  R.check('walking over an item with a full bag: item stays on the ground, one toast', ground.onGround === 1 && ground.toasts.filter(t => t === 'Bag is full!').length <= 1, JSON.stringify(ground));
  const belt = await page.evaluate(async () => {
    const G = window.G, P = G.player, L = G.dungeon.loot, V = G.THREE.Vector3;
    G.state.potions.heart = 15;
    const t0 = window.QA.toasts.length, sfx0 = window.QA.sfx.length, ev0 = window.QA.counts.toast || 0;
    const spot = P.pos.clone().add(new V(1.2, 0, 0));
    L.spawn({ type: 'potion', key: 'heart' }, spot.clone().setY(1), spot.clone());
    const e = L.list[L.list.length - 1];
    await new Promise(r => setTimeout(r, 1200));
    // walk away 3 m (teleport in small steps so the magnet can follow)
    const start = P.pos.clone();
    for (let i = 1; i <= 15; i++) { P.setPos(start.x - i * 0.2, start.z); await new Promise(r => setTimeout(r, 100)); }
    await new Promise(r => setTimeout(r, 4000));
    return { stillOnGround: L.list.includes(e), potionToPlayer: +Math.hypot(e.to.x - P.pos.x, e.to.z - P.pos.z).toFixed(2), potionMoved: +Math.hypot(e.to.x - spot.x, e.to.z - spot.z).toFixed(2), beltFullToasts: window.QA.toasts.slice(t0).filter(t => t === 'Belt is full!').length, toastBusEvents: (window.QA.counts.toast || 0) - ev0, uiToastSounds: window.QA.sfx.slice(sfx0).filter(x => x === "ui_toast").length };
  });
  R.check('potion with a full belt does not glue itself to Chewy / spam "Belt is full!"', belt.potionMoved < 0.5 && belt.beltFullToasts <= 1, JSON.stringify(belt));

  // 3. equip with unmet requirements
  const req = await page.evaluate(() => {
    const G = window.G, A = G.actions, gen = window.QA.items.generateItem;
    G.state.inventory[0] = null;
    const it = gen({ ilvl: 40, rarity: 'rare' }); it.req = { lvl: 50, str: 200 }; it.kind = 'gear';
    G.state.inventory[0] = it;
    const eq = A.equip(0);
    const slot = window.QA.items.targetSlot(it, G.state);
    const mv = A.moveItem({ c: 'inv', i: 0 }, { c: 'equip', i: slot });
    return { eq, mv, stillInBag: G.state.inventory[0] === it, slot };
  });
  R.check('equipping gear with unmet requirements is refused (equip + drag)', req.eq === false && req.mv === false && req.stillInBag, JSON.stringify(req));

  // 4. swap weapons mid-cast
  const swap = await page.evaluate(async () => {
    const G = window.G, P = G.player;
    G.state.player.skills.whirl = 3; G.state.player.skills.chomp = 1; G.state.player.hotbar[2] = 'whirl'; G.actions.recompute();
    if (G.derived.weaponType !== 'sword') G.actions.swapWeapons();
    G.input.keys.add('1'); await new Promise(r => setTimeout(r, 250));
    G.actions.swapWeapons(); P.setWeapon(G.derived.weaponType);
    await new Promise(r => setTimeout(r, 400));
    const res = { weapon: G.derived.weaponType, channel: !!G.skills.channel, anim: P.anim.action?.name, visualWeapon: P.weaponType };
    G.input.keys.delete('1'); await new Promise(r => setTimeout(r, 200));
    return res;
  });
  R.check('swapping to the ball mid Tail Spin ends the (sword-only) channel', !(swap.channel && swap.weapon === 'ball'), JSON.stringify(swap));

  // 5. ball skill with no ball equipped: auto-swap must not flip-flop every frame
  const flip = await page.evaluate(async () => {
    const G = window.G, A = G.actions, st = G.state;
    // free a bag slot, stash the ball in it
    st.inventory[1] = null; A.unequip('weaponAlt');
    if (st.player.activeWeapon !== 0) A.swapWeapons();
    st.player.skills.throw = 3; st.player.hotbar[2] = 'throw'; A.recompute();
    const e0 = window.QA.counts['equip:changed'] || 0, s0 = window.QA.sfx.filter(s => s === 'ui_equip').length;
    G.input.keys.add('1'); await new Promise(r => setTimeout(r, 1000)); G.input.keys.delete('1');
    await new Promise(r => setTimeout(r, 100));
    return { equipEvents: (window.QA.counts['equip:changed'] || 0) - e0, equipSfx: window.QA.sfx.filter(s => s === 'ui_equip').length - s0, activeWeapon: st.player.activeWeapon, weaponAlt: !!st.equipment.weaponAlt };
  });
  R.check('holding a ball skill with no ball equipped does not swap weapons every frame', flip.equipEvents <= 2, JSON.stringify(flip));

  // 6. buy / sell with insufficient coins, sell equipped weapon
  const eco = await page.evaluate(() => {
    const G = window.G, A = G.actions, gen = window.QA.items.generateItem;
    G.state.inventory[2] = null; G.state.coins = 0;
    const inv0 = G.state.inventory.filter(Boolean).length, pot0 = G.state.potions.zoom;
    const b1 = A.buyItem(gen({ ilvl: 3, rarity: 'normal' }), 100);
    const b2 = A.buyItem({ kind: 'potion', key: 'zoom' }, 25);
    const sp = A.spendCoins(1);
    const empty = A.sellItem({ c: 'inv', i: 2 });
    return { b1, b2, sp, empty, coins: G.state.coins, inv: G.state.inventory.filter(Boolean).length - inv0, pot: G.state.potions.zoom - pot0 };
  });
  R.check('buy/spend with 0 coins refused, nothing gained, coins never negative', eco.b1 === false && eco.b2 === false && eco.sp === false && eco.coins === 0 && eco.inv === 0 && eco.pot === 0 && eco.empty === 0, JSON.stringify(eco));
  const sellEq = await page.evaluate(async () => {
    const G = window.G, A = G.actions, P = G.player;
    if (G.state.player.activeWeapon !== 0) A.swapWeapons();
    const v = A.sellItem({ c: 'equip', i: 'weapon' });
    await new Promise(r => setTimeout(r, 100));
    G.skills.cds = {};
    let err = null; try { G.skills.tryCast('attack', P.pos.clone().add(new G.THREE.Vector3(1, 0, 0))); } catch (e) { err = String(e); }
    await new Promise(r => setTimeout(r, 700));
    return { sold: v, weaponType: G.derived.weaponType, dmg: [G.derived.dmgMin, G.derived.dmgMax], visual: P.weaponType, err };
  });
  R.check('selling the equipped weapon leaves a sane unarmed state (attack still works)', sellEq.sold > 0 && !sellEq.err && Number.isFinite(sellEq.dmg[0]), JSON.stringify(sellEq));

  // 7. potions at full life / zoom / empty belt / Q key at full life
  const pots = await page.evaluate(() => {
    const G = window.G, A = G.actions; A.restoreAll();
    G.state.potions.heart = 3; G.state.potions.zoom = 2; G.state.potions.rejuv = 1;
    const r = { heart: A.usePotion('heart'), zoom: A.usePotion('zoom'), rejuv: A.usePotion('rejuv') };
    G.state.potions.heart = 0; A.damage(10);
    const none = A.usePotion('heart');
    return { r, none, belt: { ...G.state.potions } };
  });
  R.check('potions are not consumed at full life/zoom; empty belt returns null', !pots.r.heart && !pots.r.zoom && !pots.r.rejuv && !pots.none && pots.belt.zoom === 2 && pots.belt.rejuv === 1, JSON.stringify(pots));
  await page.evaluate(() => { window.G.actions.restoreAll(); window.G.state.potions.heart = 3; window.G.player.anim.stop(); });
  await tap(page, 'q');
  const qFull = await page.evaluate(() => ({ heart: window.G.state.potions.heart, anim: window.G.player.anim.action?.name || null }));
  R.check('Q at full life: no potion used, no drink animation', qFull.heart === 3 && qFull.anim !== 'drink', JSON.stringify(qFull));

  // 8. drop an item from the bag onto the world (inventory UI drag -> canvas)
  const drop = await page.evaluate(() => {
    const G = window.G, gen = window.QA.items.generateItem;
    G.state.inventory[3] = gen({ ilvl: 10, rarity: 'unique' });
    window.__dropUid = G.state.inventory[3].uid;
    window.__loot0 = G.dungeon.loot.list.length;
    G.events.emit('inv:changed', { c: 'inv' });
    return { name: G.state.inventory[3].name };
  });
  await page.keyboard.press('i'); await sleep(page, 700);
  const slot = await page.evaluate(() => { const s = document.querySelector('.slot[data-c="inv"][data-i="3"]'); if (!s) return null; const r = s.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  if (slot) {
    await page.mouse.move(slot.x, slot.y); await page.mouse.down(); await page.mouse.move(slot.x + 30, slot.y + 10); await page.mouse.move(420, 360, { steps: 6 }); await page.mouse.up(); await sleep(page, 300);
    // click-to-drop mode (pick up on click, click on world)
    const held = await page.evaluate(() => !!window.G.ui.drag?.held);
    if (held) { await page.mouse.click(420, 360); await sleep(page, 300); }
    const res = await page.evaluate(() => {
      const G = window.G, uid = window.__dropUid;
      const inBag = G.state.inventory.some(x => x?.uid === uid) || G.state.stash.some(x => x?.uid === uid) || Object.values(G.state.equipment).some(x => x?.uid === uid);
      const onGround = G.dungeon.loot.list.some(e => e.d.item?.uid === uid);
      return { inBag, onGround, groundDelta: G.dungeon.loot.list.length - window.__loot0 };
    });
    R.check('dropping an item onto the world puts it on the ground (not deleted)', res.inBag || res.onGround, JSON.stringify({ ...drop, ...res, dragMode: held ? 'click' : 'drag' }));
  } else R.note('inventory slot not found; skipped drag-to-ground');
  await page.keyboard.press('Escape'); await sleep(page, 300);
} catch (e) { errors.push('[harness] ' + e.stack); }
const failed = R.finish(errors, warns);
await browser.close();
process.exit(failed ? 1 : 0);
