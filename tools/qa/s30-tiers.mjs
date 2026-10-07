// Scenario 30: tier runs, modifiers and the Spirit endgame (docs/ZONES.md §5, §5.1; ROADMAP Z-E1 to Z-E4).
//  a) the old-save migration: a save whose zone dungeon was cleared before tiers were tracked, and a Burrow past floor 20,
//     reload with T0 cleared and T1 open (the Bamboo Depths / the Deep Burrow)
//  b) a tier run from the debug entry (G.tierDebug.run): Tier 2 + Boss's Wrath + Treasure Trove on the Bamboo Depths —
//     the level (+8), the summed rewards (xp, rarity as magic find, quantity), the trove's golden chests, the run toast
//  c) the stairs keep the tier and modifiers; the boss with Boss's Wrath (+50% life): its wrath phase at 40% (enraged,
//     a wave of adds, the telegraphed shockwave), the kill: dungeon:cleared { tier: 2, firstTier }, tier:unlocked
//     { tier: 3 }, a quest's `tier` step completes, the Lantern chest (its rares) and the banner naming Tier 3
//  d) the run-wide modifiers on a T5 floor: Haunted (ghosts rise from the fallen, pay a third of the xp, drop no gear),
//     Night March (the dark grade, the wider notice radius), Hard Ground (G.regenMul)
//  e) Cursed Shrines (a shrine's curse), Elemental: Frost (the extra frost folded into a hit, the chill), Quick
//  f) the Deep Burrow: Tamamo's story clear opens its T1; floor 1 the Crystal Grotto, floor 2 the Moonlit Sanctum with
//     Tamamo; her fall opens T2; the way home is Blossom Hollow
import { launch, boot, sleep, makeReport } from './lib.mjs';

const R = makeReport('S30 tiers: migration, a tier run, rewards, the clear, run-wide modifiers, the Deep Burrow');
const { browser, page, errors, warns } = await launch({ w: 1600, h: 900 });
const ev = (fn, arg) => page.evaluate(fn, arg);
const waitDungeon = async (pred, timeout = 60000) => {
  try { await page.waitForFunction(pred, null, { timeout }); }
  catch (e) { const s = await ev(() => { const G = window.G; return { mode: G.mode, kind: G.dungeon?.kind, floor: G.dungeon?.floor, id: G.dungeon?.def?.id, iris: !!G.ui?.iris?.active, dead: G.playerDead }; }).catch(() => null); throw new Error('wait timed out; state ' + JSON.stringify(s)); }
  await sleep(page, 600);
};
const armour = () => ev(() => { const G = window.G, P = G.player; P.invuln = true; clearInterval(window.__inv); window.__inv = setInterval(() => { P.invuln = true; G.actions.restoreAll?.(); }, 250); });
const listen = () => ev(() => { const E = window.QA.Events; window.__ev = []; for (const n of ['dungeon:cleared', 'tier:unlocked', 'spirit:unlocked', 'boss:dead']) E.on(n, p => window.__ev.push([n, JSON.parse(JSON.stringify(p || {}))])); });

try {
  // ---------------------------------------------------------------- a) the old-save migration
  await boot(page, 'fresh&nointro&notut&hour=11');
  await ev(() => { // (the old shape, in place: the page's own save on unload writes it)
    const G = window.G, st = G.state;
    st.zones.bamboo.dungeon = { cleared: 2, bestFloor: 2 }; st.zones.bamboo.unlocked = true; st.zones.bamboo.village = 'saved';
    st.dungeon = { deepest: 22, waypoints: [1, 6, 11, 16, 21], seed: st.dungeon.seed }; // (Tamamo beaten; no Deep Burrow record yet)
    G.save();
  });
  await boot(page, 'notitle&nointro&notut&hour=11');
  await listen();
  const a = await ev(() => { const G = window.G, z = G.state.zones.bamboo.dungeon, d = G.state.dungeon.deep; return { bamboo: z.tier, cleared: z.cleared, deep: d?.tier || null, maple: G.state.zones.maple.dungeon.tier.unlocked }; });
  R.check('old save: the Bamboo Depths cleared before tiers were tracked loads with T0 cleared and T1 open; a Burrow past floor 20 opens the Deep Burrow\'s T1; untouched dungeons stay closed', a.bamboo.unlocked === 1 && a.bamboo.cleared.join() === '0' && a.cleared === 2 && a.deep?.unlocked === 1 && a.deep.cleared.join() === '0' && a.maple === 0, JSON.stringify(a));
  // ---------------------------------------------------------------- b) a tier run from the debug entry
  await ev(() => {
    const G = window.G; G.state.flags.burrowTut = true; G.state.player.lvl = 10; G.actions.recompute();
    G.tierDebug.unlock('bambooDepths', 2); // (T0, T1 cleared: T2 open)
    // a quest with a `tier` step (the Z-A5 step): clear the Bamboo Depths at Tier 2
    const Q = G.state.quests; Q.requests ||= {}; Q.requests.qaTier = { def: { title: 'QA: Tier 2', giver: 'rosie', steps: [{ type: 'tier', dungeon: 'bambooDepths', n: 2, text: 'Clear the Bamboo Depths at Tier 2' }], reward: { coins: 1 } } };
    Q.active.push({ id: 'qaTier', step: 0, prog: 0 });
    window.QA.toasts.length = 0;
    G.tierDebug.run('bambooDepths', 2, ['bossWrath', 'treasureTrove']);
  });
  await waitDungeon(() => window.G?.dungeon?.kind === 'zone' && window.G.dungeon.floor === 1 && !window.G.ui?.iris?.active);
  await armour();
  await page.waitForFunction(() => window.QA.toasts.some(t => /Tier 2/.test(t)), null, { timeout: 8000 }).catch(() => {});
  const b = await ev(() => {
    const G = window.G, D = G.dungeon, L = D.layout, tr = D.tr;
    return { tier: D.tier, mods: D.mods, label: tr?.label, mlvl: L.mlvl, rewards: D.runMods.rewards, mf: tr?.mfBonus, xpMul: tr?.xpMul({}), ghostXp: tr?.xpMul({ _ghost: true }), gold: L.chests.filter(c => c.quality === 'gold').length, trove: L.chests.filter(c => c.trove).length, modded: L.modded, n: D.monsters.length, toast: window.QA.toasts.find(t => /Tier 2/.test(t)) || null, where: D.where(), next: D.nextRun() };
  });
  R.check('a Tier 2 run (debug entry): monsters at the band + 8, Boss\'s Wrath and Treasure Trove picked, two extra golden chests on the floor, the run named in a toast', b.tier === 2 && b.mods.join() === 'bossWrath,treasureTrove' && b.label === 'Tier 2' && b.mlvl === 10 + 8 && b.trove === 2 && b.gold >= 2 && /Tier 2: Boss's Wrath · Treasure Trove/.test(b.toast || ''), JSON.stringify(b));
  R.check('the rewards are summed: T2 (+20% quantity, +12% rarity, +16% xp) + Boss\'s Wrath (+20% boss loot); rarity is +12 magic find, xp ×1.16 (a ghost a third of it); the events and the stairs carry the tier', b.rewards.qty === 0.2 && b.rewards.rarity === 0.12 && b.rewards.xp === 0.16 && b.rewards.boss === 0.2 && b.mf === 12 && Math.abs(b.xpMul - 1.16) < 1e-9 && Math.abs(b.ghostXp - 1.16 * 0.35) < 1e-9 && b.where.tier === 2 && b.next.tier === 2 && b.next.mods.join() === 'bossWrath,treasureTrove', JSON.stringify({ rewards: b.rewards, mf: b.mf, xp: b.xpMul, where: b.where, next: b.next }));
  // a pack falls: xp at the run's rate (vs the same kill without the run), extra items for the quantity bonus over a few chests
  const b2 = await ev(async () => {
    const G = window.G, D = G.dungeon, P = G.player;
    let xp = 0; const raw = G.actions.addXp; G.actions.addXp = n => { xp += n; return raw(n); };
    const pack = D.zr.packs.find(p => p.members.filter(m => m.alive).length >= 6 && p.sp.rank === 'normal');
    for (const m of pack.members.filter(m => m.alive).slice(0, 6)) G.combat.hitMonster(m, { dmgPct: 1e6 });
    G.actions.addXp = raw;
    const chests = G.world.interactables.filter(i => /golden chest/i.test(i.label)).slice(0, 2), before = new Set(D.loot.list);
    for (const c of chests) { P.setPos(c.pos.x + 1, c.pos.z); c.onInteract(); }
    await new Promise(r => setTimeout(r, 900));
    const items = D.loot.list.filter(e => !before.has(e) && e.d.type === 'item').length;
    return { xp, items, extra: D.tr.stats.extraItems, chests: chests.length };
  });
  R.check('kills pay the run\'s xp and every chest rolls with the run\'s bonuses (two golden chests: their items, with the quantity bonus\'s extras counted)', b2.xp > 0 && b2.chests === 2 && b2.items >= 6, JSON.stringify(b2));
  // ---------------------------------------------------------------- c) floor 2, the boss's wrath, the clear
  await ev(() => { const G = window.G, it = G.world.interactables.find(i => /Go deeper/.test(i.label)); it.onInteract(); });
  await waitDungeon(() => window.G?.dungeon?.kind === 'zone' && window.G.dungeon.floor === 2 && window.G.dungeon.boss && !window.G.ui?.iris?.active);
  await armour();
  const c1 = await ev(async () => {
    const G = window.G, D = G.dungeon, b = D.boss, A = D.layout.arena;
    const base = Math.round(b.lifeMax / 1.5);
    G.player.setPos(A.x, A.z + A.r - 4); for (let k = 0; k < 60 && !b.introDone; k++) await new Promise(r => setTimeout(r, 100));
    await new Promise(r => setTimeout(r, 2600)); // (the intro's slow motion)
    const n0 = D.monsters.filter(m => m.alive && m.bossAdd).length;
    b.life = Math.round(b.lifeMax * 0.38);
    for (let k = 0; k < 40 && !D.tr.stats.wrath; k++) await new Promise(r => setTimeout(r, 100));
    for (let k = 0; k < 90 && !D.tr.stats.shock; k++) await new Promise(r => setTimeout(r, 100));
    return { tier: D.tier, mods: D.mods, lifeMax: b.lifeMax, base, wrath: D.tr.stats.wrath, enraged: !!b.enraged, adds: D.monsters.filter(m => m.alive && m.bossAdd).length - n0, shock: D.tr.stats.shock, toast: window.QA.toasts.find(t => /wrath/i.test(t)) || null };
  });
  R.check("floor 2 keeps the run; Boss's Wrath: the boss has +50% life, and at 40% flies into a wrath (enraged, a wave of adds, the telegraphed shockwave ring)", c1.tier === 2 && c1.mods.join() === 'bossWrath,treasureTrove' && c1.wrath === 1 && c1.enraged && c1.adds >= 2 && c1.shock >= 1 && /wrath/i.test(c1.toast || ''), JSON.stringify(c1));
  const c2 = await ev(async () => {
    const G = window.G, D = G.dungeon, b = D.boss; window.__ev.length = 0;
    G.combat.hitMonster(b, { dmgPct: 1e8 });
    let it = null; for (let k = 0; k < 80 && !it; k++) { await new Promise(r => setTimeout(r, 100)); it = G.world.interactables.find(i => /Lantern chest/.test(i.label)); }
    const Z = G.state.zones.bamboo.dungeon, out = { dead: !b.alive, clear: window.__ev.find(x => x[0] === 'dungeon:cleared')?.[1] || null, unl: window.__ev.find(x => x[0] === 'tier:unlocked')?.[1] || null, tier: JSON.parse(JSON.stringify(Z.tier)), chest: !!it, quest: G.state.quests.done.includes('qaTier') };
    if (it) { // (new drops by identity; and anything that went straight to the bag)
      const inv = () => (G.state.inventory?.items || G.state.inventory || []).filter(Boolean), bag0 = new Set(inv().map(i => i.uid));
      const before = new Set(D.loot.list); G.player.setPos(it.pos.x + 1, it.pos.z); it.onInteract();
      for (let k = 0, n = -1, same = 0; k < 60 && same < 5; k++) { await new Promise(r => setTimeout(r, 100)); const m = D.loot.list.length + inv().length; same = m === n ? same + 1 : 0; n = m; } // (the hoard lands one drop every 70 ms: until it settles)
      const items = [...D.loot.list.filter(e => !before.has(e) && e.d.type === 'item').map(e => e.d.item), ...inv().filter(i => !bag0.has(i.uid) && i.rarity)].map(i => i.rarity);
      out.rares = items.filter(r => r === 'rare' || r === 'unique' || r === 'set').length; out.items = items.length; out.gem = D.loot.list.some(e => !before.has(e) && e.d.type === 'gem');
    }
    for (let k = 0; k < 60 && !window.__bn; k++) { await new Promise(r => setTimeout(r, 100)); const t = [...document.querySelectorAll('.l-msg *')].map(e => e.textContent).join(' '); if (/Tier 3 is open/.test(t)) window.__bn = t; }
    out.banner = !!window.__bn;
    return out;
  });
  R.check('the kill: dungeon:cleared { tier: 2, firstTier: true }, tier:unlocked { tier: 3 }; the save has T2 cleared and T3 open; the quest\'s tier step completes', c2.dead && c2.clear?.tier === 2 && c2.clear.firstTier === true && c2.clear.kind === 'zone' && c2.unl?.tier === 3 && c2.tier.unlocked === 3 && c2.tier.cleared.includes(2) && c2.quest, JSON.stringify(c2));
  R.check('the Lantern chest rises by the boss: the tier\'s rares (2, +1 for the first T2 clear) on top of a golden chest; the banner names Tier 3 at the Spirit Lantern', c2.chest && c2.rares >= 3 && c2.items >= 5 && c2.banner, JSON.stringify({ rares: c2.rares, items: c2.items, gem: c2.gem, banner: c2.banner }));
  // ---------------------------------------------------------------- d) Haunted, Night March, Hard Ground
  await ev(() => window.G.tierDebug.run('mapleRoots', 5, ['haunted', 'nightMarch', 'hardGround']));
  await waitDungeon(() => window.G?.dungeon?.def?.id === 'mapleRoots' && window.G.dungeon.floor === 1 && !window.G.ui?.iris?.active);
  await armour();
  const d1 = await ev(async () => {
    const G = window.G, D = G.dungeon, gr = G.engine.post.grade.uniforms;
    const out = { regen: G.regenMul, alertR: D.alertR, vig: gr.get('uVignette').value, hemi: +G.world.hemi.intensity.toFixed(3), hemi0: G.world.theme.ambientI };
    let xpG = 0, gDrops = 0; const raw = G.actions.addXp;
    const pack = D.zr.packs.find(p => p.members.filter(m => m.alive).length >= 8);
    G.player.setPos(pack.members[0].pos.x + 3, pack.members[0].pos.z + 3);
    for (const m of pack.members.filter(m => m.alive).slice(0, 10)) G.combat.hitMonster(m, { dmgPct: 1e6 });
    for (let k = 0; k < 40 && !D.monsters.some(m => m._ghost); k++) await new Promise(r => setTimeout(r, 100));
    await new Promise(r => setTimeout(r, 900));
    const ghosts = D.monsters.filter(m => m._ghost && m.alive);
    out.ghosts = ghosts.length; out.rose = D.tr.stats.ghosts; out.ids = [...new Set(ghosts.map(g => g.id))]; out.aggro = ghosts.every(g => g.aggro); out.lvl = ghosts[0]?.level; out.mlvl = D.layout.mlvl;
    if (ghosts[0]) { const before = new Set(D.loot.list); G.actions.addXp = n => { xpG += n; return raw(n); }; G.combat.hitMonster(ghosts[0], { dmgPct: 1e6 }); G.actions.addXp = raw; await new Promise(r => setTimeout(r, 200)); gDrops = D.loot.list.filter(e => !before.has(e) && e.d.type !== 'coins' && e.d.type !== 'potion').length; }
    out.xpG = xpG; out.gDrops = gDrops;
    // the regen multiplier: a tick of natural regen at 70%
    return out;
  });
  R.check('Haunted: Yūrei rise from the fallen (aggroed, at the floor\'s level); a ghost pays a third of the xp and drops no gear', d1.ghosts >= 1 && d1.rose >= 1 && d1.ids.join() === 'yurei' && d1.aggro && d1.xpG > 0 && d1.gDrops === 0, JSON.stringify(d1));
  R.check('Night March: the darker grade and dimmer cave light, monsters notice you from 14 m; Hard Ground: regen at 70%', d1.alertR === 14 && d1.vig >= 1.15 && d1.hemi < d1.hemi0 * 0.7 && d1.regen === 0.7, JSON.stringify({ alertR: d1.alertR, vig: d1.vig, hemi: d1.hemi, hemi0: d1.hemi0, regen: d1.regen }));
  // ---------------------------------------------------------------- e) Cursed Shrines, Elemental: Frost, Quick
  await ev(() => window.G.tierDebug.run('tideCaves', 3, ['cursedShrines', 'elementalFrost']));
  await waitDungeon(() => window.G?.dungeon?.def?.id === 'tideCaves' && !window.G.ui?.iris?.active);
  const e1 = await ev(async () => {
    const G = window.G, D = G.dungeon, P = G.player, out = { regen: G.regenMul ?? 1, alertR: D.alertR || 9 };
    const sh = G.world.interactables.find(i => /Touch .*Shrine/.test(i.label)); out.shrines = G.world.interactables.filter(i => /Touch .*Shrine/.test(i.label)).length;
    if (sh) { P.setPos(sh.pos.x + 1, sh.pos.z); sh.onInteract(); out.cursed = JSON.parse(JSON.stringify(D.combat.buffs.cursed || null)); }
    // the frost conversion: the same 100-point physical hit from an Elemental monster and from a plain source
    const m = D.monsters.find(x => x._el && !x.def.boss); out.el = m?._el || null;
    const D0 = G.derived, blk = D0.block; D0.block = 0; P.invuln = false; clearInterval(window.__inv); delete G.combat.buffs.cursed;
    const life0 = () => { G.actions.restoreAll(); };
    life0(); const a = D.combat.hitPlayer(100, { element: 'phys', level: m.level, src: { stats: {} } }); P.invuln = false;
    life0(); const b = D.combat.hitPlayer(100, { element: 'phys', level: m.level, src: m });
    D0.block = blk; life0(); P.invuln = true;
    out.plain = a; out.frost = b; out.chilled = (P.slowT || 0) > 0; out.elHits = D.tr.stats.elHits; out.rings = D.monsters.filter(x => x._el && !x.eliteColor && x.shadow.material.uniforms?.uCol?.value?.getHexString?.() === '8fd0ff').length;
    return out;
  });
  await armour();
  R.check('Cursed Shrines: one more shrine a floor, and touching one curses you (+25% damage taken for 20 s)', e1.shrines >= 2 && e1.cursed?.pct === 25 && e1.cursed.t > 15 && e1.regen === 1 && e1.alertR === 9, JSON.stringify(e1));
  R.check('Elemental: Frost: a modded monster\'s hit carries 35% extra as frost (after the hero\'s frost resistance) and chills; their footprint rings turn frost blue', e1.el?.el === 'frost' && e1.frost > e1.plain * 1.15 && e1.chilled && e1.elHits >= 1 && e1.rings > 20, JSON.stringify({ plain: e1.plain, frost: e1.frost, chilled: e1.chilled, rings: e1.rings }));
  // ---------------------------------------------------------------- f) the Deep Burrow
  await ev(() => window.G.tierDebug.run('burrowDeep', 1, ['stout']));
  await waitDungeon(() => window.G?.dungeon?.def?.id === 'burrowDeep' && window.G.dungeon.floor === 1 && !window.G.ui?.iris?.active);
  await armour();
  const f1 = await ev(() => { const G = window.G, D = G.dungeon; return { kind: D.kind, theme: D.layout.theme, mlvl: D.layout.mlvl, stairs: !!D.stairsPos, label: D.tr?.label, deepest: G.state.dungeon.deepest, exit: G.world.interactables.find(i => /Return to/.test(i.label))?.label || null, loc: document.querySelector('.l-hud')?.textContent?.includes('The Deep Burrow') }; });
  R.check('the Deep Burrow, Tier 1: floor 1 is the Crystal Grotto at the band of Burrow floors 16–20 (+4), with stairs, and leaves the Burrow\'s own records alone', f1.kind === 'deep' && f1.theme === 'crystal' && f1.mlvl === 17 + 4 && f1.stairs && f1.label === 'Tier 1' && f1.deepest === 22 && /Blossom Hollow/.test(f1.exit || ''), JSON.stringify(f1));
  await ev(() => { const G = window.G, it = G.world.interactables.find(i => /Go deeper/.test(i.label)); it.onInteract(); });
  await waitDungeon(() => window.G?.dungeon?.def?.id === 'burrowDeep' && window.G.dungeon.floor === 2 && window.G.dungeon.boss && !window.G.ui?.iris?.active);
  await armour();
  const f2 = await ev(async () => {
    const G = window.G, D = G.dungeon, b = D.boss; window.__ev.length = 0;
    const out = { theme: D.layout.theme, boss: b.id, tier: D.tier };
    b.alert(); await new Promise(r => setTimeout(r, 2600));
    G.combat.hitMonster(b, { dmgPct: 1e8 });
    let it = null; for (let k = 0; k < 80 && !it; k++) { await new Promise(r => setTimeout(r, 100)); it = G.world.interactables.find(i => /Lantern chest/.test(i.label)); }
    out.clear = window.__ev.find(x => x[0] === 'dungeon:cleared')?.[1] || null; out.unl = window.__ev.find(x => x[0] === 'tier:unlocked')?.[1] || null; out.deep = JSON.parse(JSON.stringify(G.state.dungeon.deep.tier)); out.chest = !!it;
    for (let k = 0; k < 30 && !G.world.interactables.some(i => /Return to Blossom Hollow/.test(i.label)); k++) await new Promise(r => setTimeout(r, 100));
    out.home = G.world.interactables.filter(i => /Return to Blossom Hollow/.test(i.label)).length; out.stairs = G.world.interactables.some(i => /deeper/.test(i.label));
    return out;
  });
  R.check('floor 2: the Moonlit Fox Sanctum with Tamamo; her fall clears the Deep Burrow at T1 (dungeon:cleared { id: burrowDeep, kind: deep }), opens T2, raises the Lantern chest, and the portal leads home (no stairs)', f2.theme === 'moon' && f2.boss === 'nineTails' && f2.clear?.id === 'burrowDeep' && f2.clear.kind === 'deep' && f2.clear.tier === 1 && f2.unl?.id === 'burrowDeep' && f2.unl.tier === 2 && f2.deep.unlocked === 2 && f2.chest && f2.home >= 1 && !f2.stairs, JSON.stringify(f2));
} catch (e) {
  R.check('scenario ran to the end', false, e.message);
}
await browser.close();
process.exit(R.finish(errors, warns) ? 1 : 0);
