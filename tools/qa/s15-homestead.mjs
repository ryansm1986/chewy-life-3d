// Scenario 15: the homestead (docs/HOMESTEAD.md). Phase 1: the Pantry and farming —
//  a) pantry actions (add / has / spend / sell / buy, events, "New!" discovery) and the Pantry tab (P)
//  b) Usagi's Seed Stall: the starter pack, buying seeds through the shop panel (click and Shift+click)
//  c) Chewy's bed through the real keys: F tills (hoe), F opens the seed picker, 1 plants, F waters
//  d) a night's sleep grows a watered crop one stage; a dry day pauses it; F harvests a ripe crop into the pantry
//  e) strawberries step back after a harvest; a sprinkler waters its 8 neighbours at dawn
//  f) farm fields: active with their Veggie Patch, farmers' rows planted once; seed drops in the Burrow
//  g) save / load of the pantry, the garden and the Fish Log; an old (v1 layout) save loads clean with empty homestead state
// Phase 2: fishing —
//  h) Kero's "Pond Guardian's Apprentice" (offered from day 2; no rod, no prompt); talking to him gives the Bamboo Rod
//  i) at the koi pond through the real keys: F casts (rod in hand, float in the water), pressing early scares the fish,
//     a missed bite gets away, holding F through the reel bar lands it (pantry, Fish Log, toast), letting go loses it,
//     WASD reels in; three catches finish Kero's quest
//  j) fish by spot and hour; records and milestones (Kero's gift marker and gift); the Fishing Hut (rods, Kero buys fish)
//  k) region fishing: a tide-pool shore, and ice fishing on Yukimi Onsen's frozen pond
// Phase 3: cooking —
//  l) Usagi's "First Sprouts" (with the starter pack) → Rosie's "Taste Test"; the cottage's Cook panel: starters known,
//     Cook ×N through the button (cheapest fish first), Try a mix (a discovery, a refusal, a fallback), the oven
//  m) eating: the heal, Well Fed folded into the stats, the HUD chip, a new dish replaces it, G eats the quick meal;
//     it survives a Burrow round trip (where a campfire camp cooks simple recipes only) and stays with its hero; it ends
//  n) villagers: a loved dish through the paged gift picker (+16), liked (+8), others (+3); a crop request (appended
//     after the old templates: s8's 'wood' still first) delivered from the pantry teaches a recipe; 3 hearts teach a
//     signature dish; Rosie's cookbook pages and her premium for dishes
import fs from 'node:fs';
import { launch, boot, sleep, makeReport, drainDialogue, tap, waitMode, waitIdle, installProbes, BASE } from './lib.mjs';

const R = makeReport('S15 homestead: pantry + farming + fishing + cooking');
const { browser, page, errors, warns } = await launch();
const G = (fn, arg) => page.evaluate(fn, arg);
async function keyF() { await page.evaluate(() => { window.G.interactCooldown = 0; }); await tap(page, 'f', 70); }
try {
  await boot(page, 'fresh&nointro&hour=10');
  await G(() => { const G = window.G; G.sim.tickT = -1e9; window.__freeze = setInterval(() => { G.sim.tickT = -1e9; }, 200); G.state.flags.hints = { garden: 1, build: 1, travel: 1, tabSwitch: 1, skills: 1, stats: 1 }; });

  // ---------------------------------------------------------------- a) pantry actions + the Pantry tab
  const a = await G(() => {
    const G = window.G, A = G.actions, ev = []; const off = G.events.on('pantry:changed', p => ev.push(p));
    const c0 = G.state.coins;
    const n1 = A.addPantry('turnip', 3), has = A.hasPantry({ turnip: 2 }), hasNot = A.hasPantry({ turnip: 4 });
    const spent = A.spendPantry({ turnip: 1 }), spentNot = A.spendPantry({ turnip: 9 }, { quiet: true });
    const sold = A.sellPantry('turnip', 1, 'usagi');
    const bought = A.buyPantry('carrotSeed', 15, 2), bad = A.addPantry('notAThing', 1);
    return { n1, has, hasNot, spent, spentNot, sold, coins: G.state.coins - c0, bought, bad, p: { ...G.state.pantry }, first: ev.filter(e => e.first).map(e => e.id), found: Object.keys(G.state.pantryFound || {}) };
  });
  R.check('pantry: add / has / spend (all or nothing) / sell to Usagi / buy', a.n1 === 3 && a.has && !a.hasNot && a.spent && !a.spentNot && a.sold === 25 && a.bought && a.bad === 0 && a.p.turnip === 1 && a.p.carrotSeed === 2 && a.coins === 25 - 30, JSON.stringify(a));
  R.check('pantry: first discoveries flagged once (the "New!" badge)', a.first.join() === 'turnip,carrotSeed' && a.found.includes('turnip'), JSON.stringify(a.first));
  await page.keyboard.press('KeyP'); await sleep(page, 600);
  const pv = await G(() => ({ open: window.G.ui.isOpen('inventory'), view: window.G.ui.panels.inventory.view, cells: [...document.querySelectorAll('.pantry .pslot.has')].map(s => s.dataset.id), card: document.querySelector('.pt-name b')?.textContent }));
  R.check('P opens the inventory on the Pantry tab with the pantry goods in it', pv.open && pv.view === 'pantry' && pv.cells.includes('turnip') && pv.cells.includes('carrotSeed') && !!pv.card, JSON.stringify(pv));
  await page.keyboard.press('KeyI'); await sleep(page, 300);
  const iv = await G(() => ({ open: window.G.ui.isOpen('inventory'), view: window.G.ui.panels.inventory.view }));
  await page.keyboard.press('Escape'); await sleep(page, 400);
  R.check('I flips the panel back to the Bag', iv.open && iv.view === 'bag', JSON.stringify(iv));

  // ---------------------------------------------------------------- b) the Seed Stall
  await G(() => { const G = window.G, S = G.seedStall.pos; G.player.setPos(S.x, S.z); });
  await sleep(page, 300);
  const lbl = await G(() => window.G.ui.hud ? document.querySelector('.ia, .interact, [class*=interact]')?.textContent || '' : '');
  await keyF(); await sleep(page, 500);
  await drainDialogue(page); await sleep(page, 800);
  const st = await G(() => ({ shop: window.G.ui.isOpen('shop'), title: document.querySelector('.p-shop .ph-t')?.textContent, goods: [...document.querySelectorAll('.sh-item.pgood')].length, p: { ...window.G.state.pantry }, flag: !!window.G.state.flags.starterSeeds, coins: window.G.state.coins }));
  R.check("F at the Seed Stall: Usagi's starter pack (5 turnip, 3 carrot seeds), then her shop with seeds by rank", st.shop && /Seed Stall/.test(st.title) && st.goods >= 4 && st.p.turnipSeed === 5 && st.p.carrotSeed === 5 && st.flag, JSON.stringify({ ...st, lbl }));
  const buy = await G(() => {
    const G = window.G, c0 = G.state.coins, n0 = G.state.pantry.cabbageSeed || 0;
    const k = G.ui.panels.shop.entries.findIndex(e => e.pantry === 'cabbageSeed'), item = () => document.querySelectorAll('.sh-grid .sh-item')[k];
    item().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const one = (G.state.pantry.cabbageSeed || 0) - n0;
    item().dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true })); // (the grid re-renders after a sale)
    return { one, five: (G.state.pantry.cabbageSeed || 0) - n0 - one, spent: c0 - G.state.coins };
  });
  R.check('buying seeds: a click buys one, Shift+click buys five, coins spent at the stall price', buy.one === 1 && buy.five === 5 && buy.spent === 16 * 6, JSON.stringify(buy));
  await G(() => window.G.ui.closeAll()); await sleep(page, 400);

  // ---------------------------------------------------------------- c) Chewy's bed, through the real keys
  const place = () => G(() => { const G = window.G, P = G.player; P.setPos(93.5, 127.45); P.faceTarget = P.facing = 0; P.moveTarget = null; return G.life.garden.pick(); });
  const tile = await place(); await sleep(page, 250);
  const t0 = await G(() => ({ label: window.G.life.garden.label(), target: window.G.life.garden.target }));
  await keyF(); await sleep(page, 1400);
  const tilled = await G(i => { const g = window.G.life.garden, r = g.rec(i); return { till: !!r?.till, terrain: window.G.village.world.terrain.tiles[i], label: g.label() }; }, tile);
  R.check('F on a wild tile tills it (hoe), the terrain turns to soil', t0.label === 'Till the soil' && t0.target === tile && tilled.till && tilled.terrain === 3 && /Plant/.test(tilled.label), JSON.stringify({ t0, tilled }));
  await keyF(); await sleep(page, 600);
  const picker = await G(() => ({ open: window.G.ui.isOpen('seeds'), cards: [...document.querySelectorAll('.sp-card')].map(c => c.dataset.id) }));
  const turnipKey = String(picker.cards.indexOf('turnipSeed') + 1);
  await page.keyboard.press('Digit' + turnipKey); await sleep(page, 900);
  const planted = await G(i => { const G = window.G, r = G.life.garden.rec(i); return { crop: r?.crop, stage: r?.stage, seeds: G.state.pantry.turnipSeed, picker: G.ui.isOpen('seeds'), label: G.life.garden.label() }; }, tile);
  R.check('F on tilled soil opens the seed picker; its number key plants that seed (one seed spent)', picker.open && picker.cards.includes('turnipSeed') && planted.crop === 'turnip' && planted.stage === 0 && planted.seeds === 4 && !planted.picker && /Water/.test(planted.label), JSON.stringify({ picker, planted }));
  await keyF(); await sleep(page, 1500);
  const watered = await G(i => ({ wet: !!window.G.life.garden.rec(i)?.wet, tool: window.G.player.toolOut || null, sheathed: window.G.player._sheathed }), tile);
  R.check('F waters it (watering can); the tool is put away afterwards', watered.wet && !watered.tool, JSON.stringify(watered));

  // ---------------------------------------------------------------- d) growth, the dry-day pause, harvest
  const sleepNight = async () => { await G(() => window.G.sleep()); await sleep(page, 300); await waitIdle(page); await sleep(page, 300); await drainDialogue(page); };
  await sleepNight();
  const d1 = await G(i => { const r = window.G.life.garden.rec(i); return { stage: r.stage, wet: !!r.wet, day: window.G.day.day }; }, tile);
  await sleepNight();
  const d2 = await G(i => { const r = window.G.life.garden.rec(i); return { stage: r.stage, wet: !!r.wet, day: window.G.day.day }; }, tile);
  R.check('a night grows a watered crop one stage and dries the soil; an unwatered night pauses it (nothing dies)', d1.stage === 1 && !d1.wet && d2.stage === 1 && d2.day === d1.day + 1, JSON.stringify({ d1, d2 }));
  await G(i => { window.G.life.garden.ensure(i).wet = true; }, tile);
  await sleepNight();
  await place(); await sleep(page, 300);
  const ripe = await G(i => { const G = window.G; return { stage: G.life.garden.rec(i).stage, label: G.life.garden.label(), n0: G.state.pantry.turnip || 0, why: { modal: G.ui.anyModal(), iris: G.ui.iris.active, dlg: G.ui.dlg.active, locked: G.player.controlLocked, busy: G.life.tools.busy, open: Object.keys(G.ui.panels).filter(n => G.ui.isOpen(n)) } }; }, tile);
  await keyF(); await sleep(page, 1600);
  const harv = await G(i => ({ crop: window.G.life.garden.rec(i)?.crop || null, n: window.G.state.pantry.turnip || 0, till: !!window.G.life.garden.rec(i)?.till }), tile);
  R.check('ripe after its days; F harvests it into the pantry and leaves tilled soil', ripe.stage === 2 && /Harvest/.test(ripe.label) && harv.n > ripe.n0 && !harv.crop && harv.till, JSON.stringify({ ripe, harv }));

  // ---------------------------------------------------------------- e) regrowth + the sprinkler
  const re = await G(() => {
    const G = window.G, g = G.life.garden, i = g.beds[0].tiles[1], r = g.ensure(i);
    r.till = true; r.crop = 'strawberry'; r.stage = 4; g.draw(i);
    return i;
  });
  await G(i => { const G = window.G, g = G.life.garden, t = g.tiles.get(i); G.player.setPos(t.x + 0.5, t.z - 0.55); G.player.faceTarget = G.player.facing = 0; }, re);
  await sleep(page, 300); await keyF(); await sleep(page, 1500);
  const reg = await G(i => ({ crop: window.G.life.garden.rec(i)?.crop, stage: window.G.life.garden.rec(i)?.stage, berries: window.G.state.pantry.strawberry || 0 }), re);
  R.check('strawberries keep fruiting: harvested back to stage days − regrow', reg.crop === 'strawberry' && reg.stage === 2 && reg.berries >= 2, JSON.stringify(reg));
  const spr = await G(() => {
    const G = window.G, g = G.life.garden, H = { x: 91, z: 128 };
    for (const i of g.beds[0].tiles) { const r = g.ensure(i); r.till = true; r.wet = false; }
    const b = G.sim.place('sprinkler', H.x + 2, H.z + 1, 0, { free: true, silent: true });
    return { ok: !!b, blocked: g.beds[0].tiles.filter(i => g.blocked(i)).length };
  });
  await sleepNight();
  const spr2 = await G(() => { const g = window.G.life.garden, W = 224; const wet = []; for (const i of g.beds[0].tiles) if (g.rec(i)?.wet) wet.push(`${i % W},${(i / W) | 0}`); return wet.sort(); });
  R.check('a sprinkler stands in the bed (that tile blocked) and wets its 8 neighbours at dawn', spr.ok && spr.blocked === 1 && spr2.length === 8 && !spr2.includes('93,129'), JSON.stringify({ spr, spr2 }));

  // ---------------------------------------------------------------- f) fields + seed drops
  const f = await G(() => {
    const G = window.G, g = G.life.garden, beds = g.beds.map(b => ({ id: b.id, kind: b.kind, n: b.tiles.length, active: b.active }));
    const planted = g.beds.filter(b => b.kind === 'field' && b.active).map(b => b.tiles.filter(i => g.rec(i)?.crop).length);
    return { beds, planted, seeded: { ...g.S.seeded } };
  });
  R.check('farm fields: the starter Veggie Patch field is active and was planted once by the farmers', f.beds.some(b => b.kind === 'field' && b.active && b.n >= 12) && f.planted[0] > 0 && f.seeded['farm-1'], JSON.stringify(f));
  await G(() => window.G.enterDungeon(1)); await waitMode(page, 'dungeon');
  const sd = await G(async () => {
    const { seedDrops } = await import('/src/life/pantry.js');
    let x = 0; const rng = () => (x = (x * 9301 + 49297) % 233280) / 233280;
    let n = 0, kinds = new Set(); for (let i = 0; i < 400; i++) for (const d of seedDrops(5, 'boss', rng)) { n += d.n; kinds.add(d.key); }
    const G = window.G, p = G.player.pos, c0 = G.state.pantry.riceSeed || 0;
    G.dungeon.loot.drop(p.clone(), [{ type: 'pantry', key: 'riceSeed', n: 2 }]);
    await new Promise(r => setTimeout(r, 2200));
    return { n, kinds: kinds.size, got: (G.state.pantry.riceSeed || 0) - c0, toast: window.QA.toasts.some(t => /Rice Seedlings/.test(t)) };
  });
  R.check('seed drops: the treasure roll gives seeds; a packet on the Burrow floor is picked up into the pantry', sd.n > 100 && sd.kinds >= 3 && sd.got === 2 && sd.toast, JSON.stringify(sd));
  await G(() => window.G.returnToVillage()); await waitMode(page, 'village'); await sleep(page, 500);

  // ---------------------------------------------------------------- h) Kero's quest and the rod
  const POND_AT = { x: 152.5, z: 146 }, POND_C = { x: 142, z: 146 };
  const toPond = () => G(({ a, c }) => { const G = window.G, P = G.player; P.setPos(a.x, a.z); P.moveTarget = null; P.faceTo(c.x, c.z); P.facing = P.faceTarget; }, { a: POND_AT, c: POND_C });
  const fs0 = () => G(() => { const F = window.G.life.fishing, s = F.s; return s ? { phase: s.phase, fish: s.fish || null, m: s.sim?.m ?? null, prop: window.G.player.toolOut, locked: window.G.player.controlLocked, float: !!F.bobber.parent } : null; });
  const phase = (ph, timeout = 6000) => page.waitForFunction(p => (window.G.life.fishing.s?.phase || null) === p, ph, { timeout });
  // a little bot on the real keys (synthetic keydown / keyup of F): 'catch' keeps the fish in the zone, 'lose' never holds
  await G(() => {
    const key = v => window.dispatchEvent(new KeyboardEvent(v ? 'keydown' : 'keyup', { code: 'KeyF', key: 'f' }));
    let held = false; window.__reelMode = null;
    setInterval(() => {
      const s = window.G.life.fishing.s, S = s?.phase === 'reel' && s.sim;
      const want = !!S && window.__reelMode === 'catch' && S.f > S.z + S.zh * 0.5 + S.v * 0.28;
      if (want) key(true); else if (held) key(false); // (re-asserted: a real F released after the bite press can't drop it)
      held = want;
    }, 16);
  });
  const castToBite = async () => {
    await keyF(); await phase('wait');
    await G(() => { const s = window.G.life.fishing.s; s.wait = s.t + 0.01; }); await phase('bite', 3000);
  };
  await sleep(page, 2800); // (the quest is offered a moment after the morning / arrival)
  await toPond(); await sleep(page, 400);
  const h0 = await G(() => { const G = window.G; return { day: G.day.day, quest: G.story.Q.active.find(q => q.id === 'keroRod')?.step ?? (G.story.Q.done.includes('keroRod') ? 'done' : null), rod: G.state.fishing?.rod || 0, target: G.life.fishing.target }; });
  R.check("from day 2 Kero offers \"Pond Guardian's Apprentice\"; without a rod there's no fishing prompt at the pond", h0.day >= 2 && h0.quest === 0 && !h0.rod && !h0.target, JSON.stringify(h0));
  await G(() => { const G = window.G, k = G.npcs.find(n => n.id === 'kero'); G.player.setPos(k.pos.x + 1.2, k.pos.z); G.story.talk(k); });
  await sleep(page, 500); await drainDialogue(page); await sleep(page, 600);
  const h1 = await G(() => { const G = window.G, q = G.story.Q.active.find(q => q.id === 'keroRod'); return { rod: G.state.fishing.rod, gotRod: !!G.state.fishing.gotRod, step: q?.step, toast: window.QA.toasts.some(t => /Bamboo Rod/.test(t)) }; });
  R.check('talking to Kero: he gives the Bamboo Rod (toast) and the quest moves on to "Catch 3 fish"', h1.rod === 1 && h1.gotRod && h1.step === 1 && h1.toast, JSON.stringify(h1));

  // ---------------------------------------------------------------- i) at the koi pond, through the real keys
  await toPond(); await sleep(page, 400);
  const lb = await G(() => ({ label: window.G.life.fishing.label(), t: window.G.life.fishing.target }));
  await keyF(); await sleep(page, 250);
  const c0 = await fs0();
  await phase('wait');
  const c1 = await G(() => { const F = window.G.life.fishing, b = F.bobber.position, w = F.water(b.x, b.z); return { y: +b.y.toFixed(2), inWater: !!w, line: !!F.line.parent }; });
  R.check('F at the water\'s edge: "Fish 🎣 Koi Pond", the rod in paw, the cast lands the float in the water (controls locked)', /Fish .* Koi Pond/.test(lb.label) && lb.t?.spot === 'pond' && c0?.phase === 'cast' && c0.prop === 'rod1' && c0.locked && c1.inWater && c1.line, JSON.stringify({ lb, c0, c1 }));
  await tap(page, 'f', 50); await sleep(page, 400);
  const early = await G(() => ({ s: !!window.G.life.fishing.s, locked: window.G.player.controlLocked, tool: window.G.player.toolOut, toast: window.QA.toasts.some(t => /Too early/.test(t)), log: Object.keys(window.G.state.fishLog || {}).length }));
  R.check('pressing F before the bite scares the fish: the session ends, controls and the sword come back', !early.s && !early.locked && !early.tool && early.toast && early.log === 0, JSON.stringify(early));
  await sleep(page, 500); await castToBite();
  const bite = await G(() => ({ fish: window.G.life.fishing.s.fish, window: window.G.life.fishing.s.window }));
  await sleep(page, 900);
  const late = await G(() => ({ s: !!window.G.life.fishing.s, toast: window.QA.toasts.some(t => /got away/.test(t)) }));
  R.check('a bite (a ~0.6 s window) missed: "It got away!"', !!bite.fish && bite.window > 0.5 && bite.window < 0.8 && !late.s && late.toast, JSON.stringify({ bite, late }));
  await sleep(page, 500); await castToBite();
  await G(() => { window.__reelMode = 'catch'; const s = window.G.life.fishing.s; s.fish = 'koi'; });
  await tap(page, 'f', 40);
  const r0 = await G(() => ({ phase: window.G.life.fishing.s?.phase, bar: document.querySelector('.reel')?.classList.contains('show'), name: document.querySelector('.rl-name')?.textContent }));
  await page.waitForFunction(() => !window.G.life.fishing.s || window.G.life.fishing.s.phase === 'land', null, { timeout: 30000 });
  const r1 = await G(() => ({ phase: window.G.life.fishing.s?.phase || null, fm: !!window.G.life.fishing.s?.fm?.parent }));
  await page.waitForFunction(() => !window.G.life.fishing.s, null, { timeout: 5000 });
  const r2 = await G(() => { const G = window.G; return { koi: G.state.pantry.koi || 0, log: G.state.fishLog?.koi, toast: window.QA.toasts.find(t => /Koi/.test(t) && /cm/.test(t)) || null, q: G.story.Q.active.find(q => q.id === 'keroRod')?.prog, locked: G.player.controlLocked }; });
  R.check('F on the bite opens the reel bar ("???" for a new fish); holding F through it lands the fish: it arcs out of the water', r0.phase === 'reel' && r0.bar && r0.name === '???' && r1.phase === 'land' && r1.fm, JSON.stringify({ r0, r1 }));
  R.check('…into the pantry and the Fish Log (size, day, spot), with its toast (cm, "New!"), counting for Kero\'s quest', r2.koi === 1 && r2.log?.n === 1 && r2.log.best >= 30 && r2.log.spot === 'pond' && /New!/.test(r2.toast || '') && r2.q === 1 && !r2.locked, JSON.stringify(r2));
  await sleep(page, 600); await castToBite();
  await G(() => { window.__reelMode = 'lose'; }); await tap(page, 'f', 40);
  await G(() => { const S = window.G.life.fishing.s?.sim; if (S) { S.f = S.ft = 0.85; S.tt = 2; } }); // (up top, out of the resting zone: an easy fish could sit in it)
  await page.waitForFunction(() => !window.G.life.fishing.s, null, { timeout: 20000 });
  const lost = await G(() => ({ koi: window.G.state.pantry.koi || 0, n: Object.values(window.G.state.fishLog).reduce((a, e) => a + e.n, 0), bar: document.querySelector('.rl-card')?.className }));
  R.check('letting go: the fish leaves the zone, the meter drains and it escapes (nothing gained)', lost.koi === 1 && lost.n === 1 && /lost/.test(lost.bar), JSON.stringify(lost));
  await sleep(page, 600); await keyF(); await phase('wait');
  await page.keyboard.down('KeyA'); await sleep(page, 120); await page.keyboard.up('KeyA'); await sleep(page, 300);
  const wasd = await G(() => ({ s: !!window.G.life.fishing.s, locked: window.G.player.controlLocked, tool: window.G.player.toolOut, float: !!window.G.life.fishing.bobber.parent }));
  R.check('a movement key reels the line in and gives control back', !wasd.s && !wasd.locked && !wasd.tool && !wasd.float, JSON.stringify(wasd));
  const quick = async id => { // a quick catch: the fish dropped into the zone with a nearly full meter
    await toPond(); await sleep(page, 300); await castToBite();
    await G(f => { window.__reelMode = 'catch'; window.G.life.fishing.s.fish = f; }, id); await tap(page, 'f', 40);
    await G(() => { const S = window.G.life.fishing.s?.sim; if (S) { S.m = 0.97; S.z = Math.max(0, Math.min(1 - S.zh, S.f - S.zh / 2)); } });
    await page.waitForFunction(() => !window.G.life.fishing.s, null, { timeout: 15000 }); await sleep(page, 300);
  };
  await quick('crucian'); await quick('loach');
  const q3 = await G(() => { const G = window.G; return { done: G.story.Q.done.includes('keroRod'), species: Object.keys(G.state.fishLog).length }; });
  R.check("three catches finish Kero's quest", q3.done && q3.species === 3, JSON.stringify(q3));

  // ---------------------------------------------------------------- j) spots and hours, records, milestones, the Fishing Hut
  const j0 = await G(async () => {
    const D = await import('/src/life/fishData.js'), ids = (s, h, r) => D.biters(s, h, r).map(e => e.id);
    const st = {}, a = D.recordCatch(st, 'koi', 40, { spot: 'pond' }), b = D.recordCatch(st, 'koi', 38), c = D.recordCatch(st, 'koi', 52.5);
    for (const id of ['crucian', 'loach', 'ayu']) D.recordCatch(st, id, 10);
    const m = D.recordCatch(st, 'trout', 20);
    return { pondDay: ids('pond', 10), pondNight: ids('pond', 23), sea: ids('sea', 10), onsen: ids('onsen', 12), moonRod1: D.biters('pond', 23, 1).find(e => e.id === 'moonKoi').w, moonRod2: D.biters('pond', 23, 2).find(e => e.id === 'moonKoi').w, a, b, c, best: st.fishLog.koi.best, m: m.milestone, all: D.FISH_IDS.length };
  });
  R.check('fish by spot and hour (koi by day, gold / Moon Koi only at night, the sea, the frozen pond), the Moonlit Rod favours rare fish', j0.all === 15 && j0.pondDay.includes('koi') && !j0.pondDay.includes('moonKoi') && j0.pondNight.includes('moonKoi') && j0.pondNight.includes('goldKoi') && !j0.pondNight.includes('koi') && j0.sea.includes('mackerel') && j0.onsen.length >= 2 && j0.moonRod2 > j0.moonRod1, JSON.stringify(j0));
  R.check('records: the first catch is "first", a smaller one is not a record, a bigger one is (best kept); 5 kinds reach a milestone', j0.a.first && !j0.a.record && !j0.b.record && j0.c.record && j0.best === 52.5 && j0.m === 5, JSON.stringify({ a: j0.a, b: j0.b, c: j0.c, m: j0.m }));
  await quick('ayu'); await quick('trout');
  const ms = await G(() => { const G = window.G; return { species: Object.keys(G.state.fishLog).length, pending: G.state.fishing.pendingMilestone, marker: G.life.markerFor('kero') }; });
  const coins0 = await G(() => window.G.state.coins);
  await G(() => { const G = window.G, k = G.npcs.find(n => n.id === 'kero'); G.player.setPos(k.pos.x + 1.2, k.pos.z); G.story.talk(k); });
  await sleep(page, 500); await drainDialogue(page); await sleep(page, 500);
  const ms2 = await G(c0 => { const G = window.G; return { claimed: G.state.fishing.milestones, coins: G.state.coins - c0, grilled: G.state.pantry.grilledFish || 0, marker: G.life.markerFor('kero') }; }, coins0);
  R.check("5 kinds in the Fish Log: Kero's gift marker, and talking to him hands over the gift (coins, grilled fish)", ms.species === 5 && ms.pending === 5 && ms.marker === 'gift' && ms2.claimed.includes(5) && ms2.coins >= 300 && ms2.grilled === 2 && !ms2.marker, JSON.stringify({ ms, ms2 }));
  await G(() => window.G.openFishHut()); await sleep(page, 700);
  const hut = await G(() => { const G = window.G, sh = G.ui.panels.shop; return { open: G.ui.isOpen('shop'), title: document.querySelector('.p-shop .ph-t')?.textContent, goods: sh.entries.filter(e => e.goods).map(e => e.goods.id + (e.goods.locked ? ':locked' : '')), rank: G.sim.stats.rank }; });
  const sell = await G(async () => {
    const G = window.G, c0 = G.state.coins, k0 = G.state.pantry.koi;
    document.querySelector('.p-shop .sh-tabs .tab[data-t="sell"]').click(); await new Promise(r => setTimeout(r, 200));
    const items = [...document.querySelectorAll('.sh-grid .sh-item[data-pid]')].map(e => e.dataset.pid);
    document.querySelector('.sh-grid .sh-item[data-pid="koi"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const { sellPrice, PANTRY } = await import('/src/life/pantry.js');
    return { items, koi: G.state.pantry.koi || 0, k0, got: G.state.coins - c0, price: sellPrice('koi', 'kero'), base: PANTRY.koi.value, bag: document.querySelectorAll('.sh-grid .sh-item:not([data-pid])').length };
  });
  await G(() => window.G.ui.closeAll()); await sleep(page, 300);
  R.check("Kero's Fishing Hut: the Moonlit Rod waits for rank 3 (no Bamboo Rod: you have one); he buys only fish, at x1.3", hut.open && /Fishing Hut/.test(hut.title) && (hut.rank >= 3 ? hut.goods.includes('rod2') : hut.goods.includes('rod2:locked')) && !hut.goods.some(g => g.startsWith('rod1')) && sell.items.length >= 4 && sell.items.every(id => id !== 'turnip') && sell.koi === sell.k0 - 1 && sell.got === sell.price && sell.price === Math.round(sell.base * 1.3) && sell.bag === 0, JSON.stringify({ hut, sell }));

  // ---------------------------------------------------------------- k) region fishing: a tide-pool shore, the onsen's frozen pond
  const regionCatch = async (id, ice) => {
    await G(r => window.G.enterRegion(r), id); await waitMode(page, 'dungeon'); await waitIdle(page); await sleep(page, 1500);
    const spot = await G(ice => {
      const G = window.G, D = G.dungeon, W = G.world, T = W.terrain, F = G.life.fishing, P = G.player, S = D.layout.plan.start;
      for (const m of D.monsters) { m.pos.set(-400, 0, -400); m.aggro = false; m.frozen = true; }
      for (let r = 0; r < 170; r += 1.5) for (let a = 0; a < 6.283; a += 0.2) {
        const x = S.x + Math.cos(a) * r, z = S.z + Math.sin(a) * r;
        if (ice ? !T.iceAt(x, z) : (!W.walkable(x, z) || W.waterAt(x, z) > 0.02)) continue;
        for (let b = 0; b < 6.283; b += 0.39) { P.setPos(x, z); P.facing = P.faceTarget = b; const t = F.scan(); if (t && !t.blocked && !t.danger && !!t.ice === ice) return { x, z, b, t }; }
      }
      return null;
    }, ice);
    await sleep(page, 400);
    const label = await G(() => window.G.life.fishing.label());
    const n0 = await G(() => { window.__lastCatch = null; window.__catchHook ||= window.G.events.on('fish:caught', e => { window.__lastCatch = e; }) || 1; return Object.values(window.G.state.fishLog).reduce((a, e) => a + e.n, 0); });
    let res = null;
    if (spot) {
      await castToBite(); await G(() => { window.__reelMode = 'catch'; }); await tap(page, 'f', 40);
      await G(() => { const S = window.G.life.fishing.s?.sim; if (S) { S.m = 0.97; S.z = Math.max(0, Math.min(1 - S.zh, S.f - S.zh / 2)); } });
      await page.waitForFunction(() => !window.G.life.fishing.s, null, { timeout: 15000 });
      res = await G(n0 => { const L = window.G.state.fishLog; return { n: Object.values(L).reduce((a, e) => a + e.n, 0) - n0, last: window.__lastCatch }; }, n0);
    }
    await G(() => window.G.returnToVillage()); await waitMode(page, 'village'); await waitIdle(page); await sleep(page, 500);
    return { spot: spot && { spot: spot.t.spot, ice: !!spot.t.ice }, label, res };
  };
  const tide = await regionCatch('tidepool', false);
  R.check('region fishing: a tide-pool shore prompts "Fish 🎣 Tide Pools" and a catch lands there', tide.spot?.spot === 'tidepool' && /Tide Pools/.test(tide.label) && tide.res?.n === 1 && tide.res.last?.spot === 'tidepool', JSON.stringify(tide));
  const ice = await regionCatch('onsen', true);
  R.check('Yukimi Onsen: "Ice fish 🎣 Frozen Pond" through a hole in the ice, and a catch', ice.spot?.ice && /Ice fish .* Frozen Pond/.test(ice.label) && ice.res?.n === 1 && ice.res.last?.spot === 'onsen', JSON.stringify(ice));

  { // (phase 3: its own block scope)
  // ---------------------------------------------------------------- l) quests, the Cook panel, Try a mix, the oven
  const cookState = () => G(() => { const G = window.G, c = G.state.cookbook || {}; return { known: Object.keys(c.known || {}), cooked: { ...(c.cooked || {}) }, p: { ...G.state.pantry } }; });
  const fs1 = await G(() => { const G = window.G, Q = G.story.Q; return { active: Q.active.find(q => q.id === 'firstSprouts') || null, done: Q.done.includes('firstSprouts') }; });
  const sprouts = await G(async () => { // finish First Sprouts: plant and harvest through the garden's own actions
    const G = window.G, g = G.life.garden, w = () => new Promise(r => { const f = () => (G.life.tools.busy ? setTimeout(f, 50) : r()); setTimeout(f, 80); });
    G.actions.addPantry('turnipSeed', 4, { silent: true });
    const free = g.beds[0].tiles.filter(i => g.usable(i) && !g.rec(i)?.crop).slice(0, 3);
    for (const i of free) { const r = g.ensure(i); r.till = true; g.draw(i); g.plant(i, 'turnipSeed'); await w(); }
    for (const i of free) { const r = g.rec(i); if (r?.crop) { r.stage = 9; g.draw(i); g.harvest(i); await w(); } }
    return free.length;
  });
  await sleep(page, 3500);
  const fs2 = await G(() => { const G = window.G, Q = G.story.Q; return { done: Q.done.includes('firstSprouts'), carrotSoup: !!G.state.cookbook?.known && 'carrotSoup' in G.state.cookbook.known, taste: Q.active.find(q => q.id === 'tasteTest')?.step ?? null, toast: window.QA.toasts.some(t => /New recipe: Carrot Soup/.test(t)) }; });
  R.check('Usagi\'s "First Sprouts" came with the starter seeds; planting and harvesting finish it: the Carrot Soup recipe, then Rosie\'s "Taste Test"', sprouts === 3 && !!(fs1.active || fs1.done) && fs2.done && fs2.carrotSoup && fs2.taste === 0 && fs2.toast, JSON.stringify({ sprouts, fs1, fs2 }));
  await G(() => { const G = window.G, A = G.actions; for (const [id, n] of Object.entries({ crucian: 3, loach: 2, salmon: 1, rice: 3, carrot: 3, turnip: 2, daikon: 1, strawberry: 2, honey: 1 })) A.addPantry(id, n, { silent: true }); A.addMaterial('mochi', 1); G.player.setPos(95.5, 126.2); });
  // the cottage's kitchen is the stove inside the house now (docs/HOUSING.md §1): in through the door, F at the stove
  await G(() => { window.G.openHome(); });
  await page.waitForFunction(() => window.G.mode === 'interior' && !window.G.ui.iris.active, null, { timeout: 15000 }); await sleep(page, 300);
  const homeCh = [await G(() => { const G = window.G, it = G.world.interactables.find(i => i.use === 'cook'); G.player.setPos(it.pos.x, it.pos.z); G.player.moveTarget = null; G.interactCooldown = 0; return it?.label; })];
  await sleep(page, 250); await tap(page, 'f', 70); await sleep(page, 700);
  const k0 = await G(() => { const G = window.G, p = G.ui.panels.cook; return { open: G.ui.isOpen('cook'), station: p.station, rows: [...document.querySelectorAll('.ck-row.known')].map(r => r.dataset.id), first: p.sel }; });
  R.check('inside the cottage, F at the stove ("Cook something") opens the kitchen; the starters (and learned recipes) are in the cookbook', homeCh[0] === 'Cook something 🍳' && k0.open && k0.station === 'kitchen' && ['grilledFish', 'roastedVeggies', 'onigiri', 'carrotSoup'].every(r => k0.rows.includes(r)), JSON.stringify({ homeCh, k0 }));
  const ck0 = await cookState();
  await G(() => { const p = window.G.ui.panels.cook; p.select('grilledFish'); });
  await G(() => document.querySelector('.ck-det [data-q="1"]').click());
  await G(() => document.querySelector('.ck-det .ck-go').click());
  await sleep(page, 500);
  const mid = await G(() => ({ pot: document.querySelector('.ck-pot')?.className, pose: window.G.player.anim.action?.name, tool: window.G.player.toolOut, locked: window.G.player.controlLocked }));
  await page.waitForFunction(() => !window.G.ui.panels.cook.cooking, null, { timeout: 8000 }); await sleep(page, 300);
  const ck1 = await cookState();
  R.check('Cook ×2 through the button: the pot bubbles, Chewy stirs with the ladle, the two cheapest fish go in and two Grilled Fish come out', /on/.test(mid.pot || '') && mid.pose === 'cook' && mid.tool === 'ladle' && mid.locked && ck1.p.grilledFish === (ck0.p.grilledFish || 0) + 2 && ck1.p.crucian === ck0.p.crucian - 2 && ck1.p.loach === ck0.p.loach && ck1.cooked.grilledFish >= 2, JSON.stringify({ mid, before: ck0.p, after: ck1.p }));
  const mix = await G(async () => {
    const G = window.G, p = G.ui.panels.cook, wait = () => new Promise(r => { const f = () => (p.cooking ? setTimeout(f, 100) : r()); setTimeout(f, 200); });
    p.setTab('mix'); p.addPick('rice'); p.addPick('salmon'); await p.cook(); await wait();
    const disc = { known: 'salmonOnigiri' in G.state.cookbook.known, n: G.state.pantry.salmonOnigiri || 0 };
    p.setTab('mix'); p.addPick('turnip'); const t0 = G.state.pantry.turnip; await p.cook(); const refused = { turnip: G.state.pantry.turnip === t0, cooking: p.cooking };
    p.picks = {}; p.addPick('crucian'); p.addPick('turnip'); const g0 = G.state.pantry.grilledFish || 0; await p.cook(); await wait();
    return { disc, refused, fallback: (G.state.pantry.grilledFish || 0) - g0, toast: window.QA.toasts.some(t => /won.t make anything/.test(t)) };
  });
  R.check('Try a mix: rice + salmon discovers Salmon Onigiri; a lone turnip is refused (nothing spent); fish + turnip makes a fallback Grilled Fish', mix.disc.known && mix.disc.n === 1 && mix.refused.turnip && mix.toast && mix.fallback === 1, JSON.stringify(mix));
  await G(() => window.G.ui.closeAll()); await sleep(page, 300);
  await G(() => { window.G.housing.exit(); }); await waitMode(page, 'village'); // (back out to the village for Rosie)
  const taste = await G(() => window.G.story.Q.active.find(q => q.id === 'tasteTest'));
  await G(() => { const G = window.G, n = G.npcs.find(x => x.id === 'rosie'); G.player.setPos(n.pos.x + 1.2, n.pos.z); G.story.talk(n); });
  await sleep(page, 500);
  const rosieCh = [];
  for (let i = 0; i < 40; i++) { // (answer by text: Rosie's menu grows with the day's options)
    const d = await G(() => { const d = window.G.ui?.dlg; if (!d?.active) return null; return { typing: d.typing, choices: d.choices?.map(c => c.text || c) || null, last: d.i >= d.lines.length - 1 }; });
    if (!d) break;
    if (d.typing) { await page.keyboard.press('Enter'); await sleep(page, 80); continue; }
    if (d.choices && d.last) { const k = Math.max(0, d.choices.findIndex(c => /Bake with Rosie/.test(c))); rosieCh.push(...d.choices); await page.keyboard.press(String(k + 1)); await sleep(page, 450); continue; }
    await page.keyboard.press('Enter'); await sleep(page, 120);
  }
  await sleep(page, 2600);
  const oven = await G(() => { const G = window.G, p = G.ui.panels.cook; return { open: G.ui.isOpen('cook'), station: p.station, can: [...document.querySelectorAll('.ck-row.known:not(.away)')].map(r => r.dataset.id), mochi: 'strawberryMochi' in G.state.cookbook.known, done: G.story.Q.done.includes('tasteTest') }; });
  R.check('Taste Test: three dishes cooked, then Rosie tastes them (the Strawberry Mochi recipe); "Bake with Rosie" opens her oven, where only baked goods cook (and Pound Mochi: COZY §7.2)', taste?.step === 1 && oven.done && oven.mochi && rosieCh.includes('Bake with Rosie 🧁') && oven.open && oven.station === 'oven' && oven.can.length >= 1 && oven.can.every(id => ['strawberryMochi', 'honeyCake', 'melonBread', 'poundMochi'].includes(id)), JSON.stringify({ taste, rosieCh, oven }));
  await G(() => window.G.ui.closeAll()); await sleep(page, 300);

  // ---------------------------------------------------------------- m) eating and Well Fed
  const eat1 = await G(() => {
    const G = window.G, A = G.actions, d0 = { ...G.derived };
    A.damage?.(Math.round(G.derived.lifeMax * 0.6)); const l0 = A.life();
    const r = A.eat('grilledFish');
    return { l0, l1: A.life(), max: G.derived.lifeMax, dmg0: d0.dmgPct, dmg1: G.derived.dmgPct, meal: G.state.player.meal };
  });
  await sleep(page, 600);
  const chip = await G(() => [...document.querySelectorAll('.hud .buff.meal')].map(b => ({ i: b.querySelector('i')?.textContent, img: !!b.querySelector('img') })));
  R.check('eating Grilled Fish heals 35% of max life and leaves Well Fed: Strong I (+10% damage) with a HUD chip and timer', Math.abs(eat1.l1 - eat1.l0 - Math.round(eat1.max * 0.35)) <= 1 && eat1.meal?.buff === 'strong' && eat1.meal.tier === 1 && eat1.dmg1 === eat1.dmg0 + 10 && chip.length === 1 && chip[0].img && /m$/.test(chip[0].i || ''), JSON.stringify({ eat1, chip }));
  const eat2 = await G(() => { const G = window.G, A = G.actions, m0 = G.derived.moveSpeed; A.addPantry('carrotSoup', 1, { silent: true }); A.eat('carrotSoup'); return { meal: G.state.player.meal, dmg: G.derived.dmgPct, move: G.derived.moveSpeed - m0, quick: G.state.cookbook.quick }; });
  const g0 = await G(() => window.G.state.pantry.grilledFish || 0);
  await G(() => { window.G.state.cookbook.quick = 'grilledFish'; }); await tap(page, 'g', 60); await sleep(page, 500);
  const g1 = await G(() => ({ n: window.G.state.pantry.grilledFish || 0, meal: window.G.state.player.meal?.dish }));
  R.check('a new dish replaces the buff (Carrot Soup: Swift, +8% move); G eats the quick meal', eat2.meal.buff === 'swift' && eat2.dmg === eat1.dmg0 && eat2.move === 8 && g1.n === g0 - 1 && g1.meal === 'grilledFish', JSON.stringify({ eat2, g0, g1 }));
  const left0 = await G(() => window.G.state.player.meal.left);
  await G(() => window.G.enterDungeon(1)); await waitMode(page, 'dungeon'); await waitIdle(page); await sleep(page, 1200);
  const bur = await G(() => { const G = window.G, k = G.life.kitchen, c = k.camp; if (c) { for (const m of G.dungeon.monsters) { m.pos.set(-400, 0, -400); m.aggro = false; m.frozen = true; } G.player.setPos(c.pos.x + 1.5, c.pos.z); } return { meal: G.state.player.meal?.buff, left: G.state.player.meal?.left, dmg: G.derived.dmgPct, camp: !!c, d: c ? Math.hypot(c.pos.x - G.dungeon.startPos.x, c.pos.z - G.dungeon.startPos.z) : null }; });
  await sleep(page, 500);
  const lbl = await G(() => { const G = window.G; return G.life.kitchen.camp ? G.world.interactables.find(i => i === G.life.kitchen.camp.inter)?.label : null; });
  await keyF(); await sleep(page, 700);
  const camp = await G(() => { const G = window.G, p = G.ui.panels.cook; return { open: G.ui.isOpen('cook'), station: p.station, here: [...document.querySelectorAll('.ck-row.known:not(.away)')].map(r => r.dataset.id) }; });
  await G(() => window.G.ui.closeAll()); await sleep(page, 300);
  R.check('Well Fed survives the trip into the Burrow; a campfire camp by the arrival point cooks simple recipes only', bur.meal === 'strong' && bur.left <= left0 && bur.left > left0 - 60 && bur.camp && bur.d > 2 && bur.d < 7 && /campfire/.test(lbl || '') && camp.open && camp.station === 'campfire' && camp.here.length >= 2 && camp.here.every(id => ['grilledFish', 'roastedVeggies', 'grilledTrout'].includes(id)), JSON.stringify({ left0, bur, lbl, camp }));
  await G(() => window.G.returnToVillage()); await waitMode(page, 'village'); await waitIdle(page); await sleep(page, 500);
  const hero = await G(() => {
    const G = window.G, A = G.actions, c0 = G.state.player.meal?.buff;
    A.setActiveHero('moka'); const moka = { meal: G.state.player.meal || null, d: G.derived.meal || null };
    A.setActiveHero('chewy'); return { c0, moka, back: G.state.player.meal?.buff, d: G.derived.meal?.buff };
  });
  const exp = await G(async () => {
    const G = window.G, m = G.state.player.meal, d0 = G.derived.dmgPct; m.left = 0.4;
    await new Promise(r => setTimeout(r, 1200));
    return { meal: G.state.player.meal, dmg: G.derived.dmgPct, d0, chip: document.querySelectorAll('.hud .buff.meal').length, toast: window.QA.toasts.some(t => /fades/.test(t)) };
  });
  R.check("…back home it is still there, and it is per hero: Moka has none of Chewy's, and his is waiting when he's back", hero.c0 === 'strong' && !hero.moka.meal && !hero.moka.d && hero.back === 'strong' && hero.d === 'strong', JSON.stringify(hero));
  R.check('when it runs out the stats go back, the chip goes and a toast says so', exp.meal === null && exp.dmg === exp.d0 - 10 && exp.chip === 0 && exp.toast, JSON.stringify(exp));
  await G(() => { window.G.state.heroes.chewy.player.meal = { dish: 'grilledFish', buff: 'strong', tier: 1, left: 400, dur: 480 }; window.G.actions.recompute(); });

  // ---------------------------------------------------------------- n) gifts, requests, teaching, Rosie
  await G(() => { const G = window.G, f = G.story.friend('usagi'); f.giftDay = 0; G.actions.addPantry('carrotSoup', 1, { silent: true }); const n = G.npcs.find(x => x.id === 'usagi'); G.player.setPos(n.pos.x + 1.2, n.pos.z); G.story.talk(n); });
  await sleep(page, 500); await drainDialogue(page, [1]); await sleep(page, 600);
  const gp = await G(() => { const G = window.G, p = G.ui.panels.gift; return { open: G.ui.isOpen('gift'), first: p.items[0], kinds: p.items.slice(0, 3).map(i => i.key), pages: p.pages, n: p.items.length }; });
  const pts0 = await G(() => window.G.story.friend('usagi').pts);
  if (gp.pages > 1) { await page.keyboard.press('ArrowRight'); await sleep(page, 300); await page.keyboard.press('ArrowLeft'); await sleep(page, 300); }
  const pg = await G(() => window.G.ui.panels.gift.page);
  await page.keyboard.press('Digit1'); await sleep(page, 600); await drainDialogue(page); await sleep(page, 300);
  const gl = await G(p0 => ({ pts: window.G.story.friend('usagi').pts - p0, soup: window.G.state.pantry.carrotSoup || 0, toast: window.QA.toasts.some(t => /LOVES it/.test(t)), open: window.G.ui.isOpen('gift') }), pts0);
  const gifts = await G(async () => {
    const G = window.G, S = G.story, n = G.npcs.find(x => x.id === 'usagi'), f = S.friend('usagi'), out = {};
    for (const [k, key] of [['liked', 'carrot'], ['other', 'turnip']]) {
      f.giftDay = 0; const p0 = f.pts;
      G.actions.addPantry(key, 1, { silent: true });
      await S.giftFlow(n, () => Promise.resolve(null), () => Promise.resolve(key));
      out[k] = f.pts - p0;
    }
    return out;
  });
  R.check('gifts: the paged picker (dishes first) — Usagi\'s loved Carrot Soup +16 with her own line, a liked carrot +8, a turnip +3', gp.open && gp.first.key === 'carrotSoup' && gp.first.love === 'loved' && pg === 0 && gl.pts === 16 && gl.toast && !gl.open && gifts.liked === 8 && gifts.other === 3, JSON.stringify({ gp, gl, gifts }));
  const rq = await G(async () => {
    const G = window.G, S = G.story, n = G.npcs.find(x => x.id === 'usagi'), id = 'usagi', rnd = Math.random;
    const clear = () => { delete S.Q.requests['req_' + id]; S.Q.active = S.Q.active.filter(q => q.id !== 'req_' + id); S.friend(id).reqDay = 0; };
    clear(); Math.random = () => 0.01; await S.requestFlow(n, () => Promise.resolve(0)); Math.random = rnd;
    const first = S.Q.requests['req_' + id]?.def.steps[0];
    const L = 3 + S.homesteadRequests(n).length + (S.decorateRequests?.(n).length || 0); // (housing's decorate requests come after the homestead ones)
    clear(); Math.random = () => 3.5 / L; await S.requestFlow(n, () => Promise.resolve(0)); Math.random = rnd;
    const st = S.Q.requests['req_' + id]?.def.steps[0];
    return { first: first && { mat: first.mat, pantry: !!first.pantry }, L, step: st && { mat: st.mat, n: st.n, pantry: !!st.pantry, type: st.type } };
  });
  const had = await G(s => (s ? window.G.state.pantry[s.mat] || 0 : 0), rq.step); // (the crop may already be in the pantry: the gifts above)
  await G(s => { if (s) window.G.actions.addPantry(s.mat, s.n + 1, { silent: true }); }, rq.step);
  const cab0 = await G(() => 'cabbageRolls' in (window.G.state.cookbook.known || {}));
  await G(() => { const G = window.G, n = G.npcs.find(x => x.id === 'usagi'); G.story.talk(n); }); await sleep(page, 500); await drainDialogue(page); await sleep(page, 3000);
  const rq2 = await G(s => ({ left: window.G.state.pantry[s.mat] || 0, active: !!window.G.story.Q.requests.req_usagi, cab: 'cabbageRolls' in window.G.state.cookbook.known }), rq.step);
  R.check('requests: crops, fish and dishes are appended (Math.random 0.01 still asks for wood); a crop request is delivered from the pantry and teaches Usagi\'s Cabbage Rolls', rq.first?.mat === 'wood' && !rq.first.pantry && rq.L >= 5 && rq.step?.pantry && rq.step.type === 'deliver' && rq2.left === had + 1 && !rq2.active && !cab0 && rq2.cab, JSON.stringify({ rq, rq2, had }));
  const teach = await G(async () => {
    const G = window.G, S = G.story, f = S.friend('kuma'); f.pts = Math.max(f.pts, 30); f.hearts = 3;
    const marker = S.markerFor('kuma'), k0 = 'honeyCake' in G.state.cookbook.known;
    const n = G.npcs.find(x => x.id === 'kuma'); G.player.setPos(n.pos.x + 1.2, n.pos.z);
    S.talk(n); return { marker, k0 };
  });
  await sleep(page, 500); await drainDialogue(page); await sleep(page, 500);
  const teach2 = await G(() => ({ k1: 'honeyCake' in window.G.state.cookbook.known, marker: window.G.story.markerFor('kuma'), toast: window.QA.toasts.some(t => /New recipe: Honey Cake/.test(t)) }));
  R.check('at 3 hearts a villager teaches their signature dish on the next chat (Kuma: Honey Cake; a gift marker until then)', teach.marker === 'gift' && !teach.k0 && teach2.k1 && teach2.marker !== 'gift' && teach2.toast, JSON.stringify({ teach, teach2 }));
  await G(() => window.G.openShop()); await sleep(page, 700);
  const book = await G(async () => {
    const G = window.G, sh = G.ui.panels.shop, c0 = G.state.coins; G.state.coins += 500;
    const k = sh.entries.findIndex(e => e.goods?.id === 'recipe:pumpkinStew'), pages = sh.entries.filter(e => e.goods?.id?.startsWith('recipe:')).map(e => e.goods.id), honey = sh.entries.some(e => e.pantry === 'honey');
    document.querySelectorAll('.sh-grid .sh-item')[k]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise(r => setTimeout(r, 300));
    const learned = 'pumpkinStew' in G.state.cookbook.known, spent = c0 + 500 - G.state.coins;
    G.actions.addPantry('onigiri', 2, { silent: true });
    document.querySelector('.p-shop .sh-tabs .tab[data-t="sell"]').click(); await new Promise(r => setTimeout(r, 250));
    const items = [...document.querySelectorAll('.sh-grid .sh-item[data-pid]')].map(e => e.dataset.pid), b0 = G.state.coins;
    document.querySelector('.sh-grid .sh-item[data-pid="onigiri"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const { sellPrice, PANTRY } = await import('/src/life/pantry.js');
    return { pages, honey, learned, spent, items, got: G.state.coins - b0, price: sellPrice('onigiri', 'rosie'), base: PANTRY.onigiri.value, bag: !!document.querySelector('.p-inv') && window.G.ui.panels.inventory.view };
  });
  await G(() => window.G.ui.closeAll()); await sleep(page, 300);
  R.check("Rosie's shop: cookbook pages (Pumpkin Stew teaches it) and honey; she buys dishes at ×1.25 (the Bag stays beside her shop)", book.pages.includes('recipe:pumpkinStew') && book.honey && book.learned && book.spent === 240 && book.items.every(id => /Fish|Soup|onigiri|Onigiri|Veggies|Rolls|Stew|Mochi|Cake|Bread|Platter|Feast|Bento/i.test(id)) && book.got === book.price && book.price === Math.round(book.base * 1.25) && book.bag === 'bag', JSON.stringify(book));

  }

  // ---------------------------------------------------------------- g) save / load, old saves
  const before = await G(() => { const G = window.G; G.save(); return { pantry: JSON.stringify(G.state.pantry), tiles: G.state.garden.tiles.length, crops: G.state.garden.tiles.filter(r => r.crop).length, fish: JSON.stringify(G.state.fishLog), rod: G.state.fishing.rod, book: Object.keys(G.state.cookbook.known).sort().join(), meal: G.state.heroes.chewy.player.meal?.dish, left: G.state.heroes.chewy.player.meal?.left }; });
  await page.goto(`${BASE}/?notitle&nointro`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true && window.G?.player, null, { timeout: 90000 }); await installProbes(page); await sleep(page, 1200);
  const after = await G(() => { const G = window.G; return { pantry: JSON.stringify(G.state.pantry), tiles: G.state.garden.tiles.length, crops: G.state.garden.tiles.filter(r => r.crop).length, drawn: G.life.garden.view.body._instanceInfo.filter(x => x.visible).length, fish: JSON.stringify(G.state.fishLog), rod: G.state.fishing?.rod, book: Object.keys(G.state.cookbook?.known || {}).sort().join(), meal: G.state.heroes.chewy.player.meal?.dish, left: G.state.heroes.chewy.player.meal?.left, dmg: G.derived.dmgPct, chip: document.querySelectorAll('.hud .buff.meal').length }; });
  R.check('save / load keeps the pantry and every garden tile (and draws the crops)', before.pantry === after.pantry && before.tiles === after.tiles && before.crops === after.crops && after.drawn >= after.crops - 2, JSON.stringify({ before: { ...before, fish: 0 }, after: { ...after, fish: 0 } }));
  R.check('...and the Fish Log and the rod', before.fish === after.fish && after.rod === before.rod && before.rod >= 1, JSON.stringify({ b: before.fish, a: after.fish }));
  R.check('...and the cookbook and the Well Fed buff (its time left, folded into the stats, the HUD chip)', before.book === after.book && after.meal === before.meal && Math.abs(after.left - before.left) < 30 && after.dmg >= 10 && after.chip === 1, JSON.stringify({ b: [before.book, before.meal, before.left], a: [after.book, after.meal, after.left, after.dmg, after.chip] }));
  const fx = JSON.parse(fs.readFileSync(new URL('./fixtures/village-v1.json', import.meta.url), 'utf8'));
  await page.goto(`${BASE}/rigs/chewy_b.json`);
  await page.evaluate(s => localStorage.setItem('chewy3d.save', s), JSON.stringify(fx));
  await page.goto(`${BASE}/?notitle&nointro`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true && window.G?.player, null, { timeout: 90000 }); await installProbes(page); await sleep(page, 2500);
  const old = await G(() => { const G = window.G; return { mode: G.mode, pantry: G.state.pantry ? Object.keys(G.state.pantry).length : -1, garden: !!G.state.garden, beds: G.life.garden.beds.length, label: typeof G.life.garden.label(), rod: G.state.fishing?.rod || 0, log: Object.keys(G.state.fishLog || {}).length, meal: G.state.player.meal || null, quick: G.life.kitchen.quickId(), book: Object.keys(G.state.cookbook?.known || {}).length }; });
  R.check('an old save loads clean: an empty pantry, a fresh garden, the beds in place, no rod, an empty Fish Log, no meal, a fresh cookbook', old.mode === 'village' && old.pantry <= 0 && old.garden && old.beds >= 2 && old.rod === 0 && old.log === 0 && !old.meal && !old.quick && old.book <= 3, JSON.stringify(old));
} catch (e) { errors.push('[harness] ' + e.stack); }
const failed = R.finish(errors, warns);
await browser.close();
process.exit(failed ? 1 : 0);
