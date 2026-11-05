// S59 combo chains (docs/COMBO.md §6), through real inputs:
//  a) Chewy: taps chain Crescent Chomp 1 → 2 → finisher (+15% damage, the flourish, the hotbar pips), then it starts over;
//     mashing (taps during the recovery) is buffered and still chains; the window running out drops it; another skill
//     and a roll drop it; a held charge released mid-chain lands as the finisher
//  b) the perks: Quick Hands (the chained steps' actions play faster, their hit frames with them), Light Touch (cheaper
//     steps), Free Finisher (no zoom, even on an empty pool), Tempo (a landed finisher quickens the next strikes); no
//     move-speed change anywhere; perks per hero through save/load, refunded by a respec
//  c) every hero's combo strikes chain to a finisher in a Burrow fight without errors (Fūma Throw waits for the fūma)
//  d) the K panel: the Combo tab beside Charge, the strip, buying a perk (one point), the level gates, the node chip, the
//     tooltip's "Tap again to chain"
//  e) pad and touch parity: the pad's RMB button and a phone's skill button chain the same way
//  f) the "Tap, tap, finish!" guide (Shadow): waits for a combo strike in a fight, then in town: chain to a finisher,
//     K, the Combo tab
// S59_ONLY=a|b|c|d|e|f runs one section (or several: S59_ONLY=af).
import { launch, boot, waitMode, sleep, makeReport, BASE } from './lib.mjs';
import { launchTouch, PHONE } from './touch-lib.mjs';
import { installPad, padDown, padUp, padReset } from './pad-lib.mjs';

const R = makeReport('S59 combo chains: taps chain to a finisher, perks, every hero, K panel, pad + touch');
const { browser, page, errors, warns } = await launch({ w: 1280, h: 720 });
const ev = (f, a) => page.evaluate(f, a);
const ONLY = process.env.S59_ONLY || '';
const on = s => !ONLY || ONLY.includes(s);
const SHOTS = 'tools/qa/tmp/s59';

async function fight(hero = 'chewy', floor = 2, pg = page) {
  await boot(pg, `fresh&nointro${hero !== 'chewy' ? `&hero=${hero}` : ''}`);
  await pg.evaluate(f => { window.G.state.flags.burrowTut = true; window.G.enterDungeon(f); }, floor);
  await waitMode(pg, 'dungeon');
}
/** clear the room, stand a line of sturdy dummies off to camera-right; record casts, hits, combo events → screen xy at
 *  the first dummy */
const dummies = (pg = page) => pg.evaluate(() => {
  const G = window.G, P = G.player;
  for (const m of G.dungeon.monsters) { m.status.stun = 999; m.pos.set(-999, 0, -999); }
  const { r } = G.engine.rig.groundAxes(), n0 = G.dungeon.monsters.length;
  { const W = G.world, L = G.dungeon.layout, f = { x: -r.z, z: r.x };
    const open = (x, z) => { for (let d = -2; d <= 9.5; d += 0.5) for (const s of [-2.5, -1.25, 0, 1.25, 2.5]) { const px = x + r.x * d + f.x * s, pz = z + r.z * d + f.z * s; if (!W.walkable(px, pz) || W.collision.solidAt(px, pz, 0.5) || !L.at(Math.floor(px / 2), Math.floor(pz / 2))) return false; } return true; };
    if (!open(P.pos.x, P.pos.z)) { let best = null; for (let cy = 2; cy < L.H - 2 && !best; cy++) for (let cx = 2; cx < L.W - 2; cx++) { const x = (cx + 0.5) * 2, z = (cy + 0.5) * 2; if (L.at(cx, cy) && open(x, z)) { best = { x, z }; break; } } if (best) { P.setPos(best.x, best.z); G.engine.rig.focus.copy(P.pos); G.engine.rig.snap(); G.engine.rig.update(0); G.engine.camera.updateMatrixWorld(); } } }
  G.dungeon.summonAround({ pos: P.pos }, 'mochi', 3);
  const ring = G.dungeon.monsters.slice(n0);
  ring.forEach((m, i) => { m.pos.set(P.pos.x + r.x * (1.7 + i * 1.2), 0, P.pos.z + r.z * (1.7 + i * 1.2)); m.lifeMax = m.life = 1e8; m.status.stun = 999; m.speed = 0; });
  window.__dummies = ring;
  window.__hits = []; const raw = G.combat.__rawHit || (G.combat.__rawHit = G.combat.hitMonster.bind(G.combat));
  G.combat.hitMonster = (m, o) => { window.__hits.push({ pct: o?.dmgPct || 0, t: performance.now() | 0, step: G.skills.chain.last?.step || 0 }); return raw(m, o); };
  window.__casts = []; const rc = G.skills.__rawCast || (G.skills.__rawCast = G.skills.tryCast.bind(G.skills));
  G.skills.tryCast = (i, a, t, c) => { const x = rc(i, a, t, c); if (x) { const L = G.skills.chain.last; window.__casts.push({ id: i, stage: c?.stage || 0, step: L?.id === i ? L.step : 0, fin: !!(L?.id === i && L.fin), cost: L?.cost, speed: L?.speed, dur: G.player.anim.action?.dur || 0, act: G.player.anim.action?.name || '' }); } return x; };
  if (!window.__cevOn) { window.__cevOn = true; for (const n of ['combo:step', 'combo:finish', 'combo:land', 'combo:drop']) G.events.on(n, p => window.__cev.push([n, n === 'combo:drop' ? p.reason : p.step ?? (p.charged ? 'charged' : ''), p.id])); }
  window.__cev = [];
  const p = ring[0].pos.clone().setY(0.5), v = p.project(G.engine.camera);
  return [(v.x * 0.5 + 0.5) * innerWidth, (-v.y * 0.5 + 0.5) * innerHeight];
});
const learn = (o, pg = page) => pg.evaluate(async o => {
  const G = window.G, P = G.player, pl = G.state.player;
  const { SKILLS } = await import('/src/rpg/skills.js');
  pl.lvl = 30; pl.skillPts = o.pts ?? pl.skillPts;
  for (const [k, v] of Object.entries(o.skills || {})) pl.skills[k] = v;
  if (o.hotbar) o.hotbar.forEach((id, i) => { if (id) pl.hotbar[i] = id; });
  if (o.perks) pl.comboPerks = o.perks;
  const id = o.wep; if (id && SKILLS[id]?.wep && G.derived.weaponType !== SKILLS[id].wep) { G.actions.swapWeapons(); P.setWeapon(G.derived.weaponType); }
  G.actions.recompute(); G.actions.restoreAll();
}, o);
const reset = (pg = page) => pg.evaluate(() => { const G = window.G; G.skills.cds = {}; G.player.anim.stop(); G.skills.chain.clear(); delete G.combat.buffs.tempo; window.__casts = []; window.__cev = []; window.__hits = []; G.actions.restoreAll(); });
// a tap of the right mouse button: a short press (a tap is known on release, under the charge grace)
const tapRMB = async (pg = page) => { await pg.mouse.down({ button: 'right' }); await pg.waitForTimeout(45); await pg.mouse.up({ button: 'right' }); };
/** wait for n casts recorded */
const casts = (n, pg = page, timeout = 8000) => pg.waitForFunction(n => window.__casts.length >= n, n, { timeout });
/** wait for the current chain step to be over (the window open, or the chain done) */
const stepOver = (pg = page, timeout = 8000) => pg.waitForFunction(() => !window.G.skills.chain.cur, null, { timeout });

let shot = 0;
const snap = async (name, pg = page) => { await pg.screenshot({ path: `${SHOTS}/${String(++shot).padStart(2, '0')}-${name}.png` }); };
await (await import('node:fs')).promises.mkdir(SHOTS, { recursive: true });

try {
  // ================================================================ a) the chain (Chewy, Crescent Chomp)
  if (on('a') || on('b')) {
    await fight('chewy', 2);
    await learn({ skills: { chomp: 10, swallow: 5 }, pts: 20, hotbar: [null, 'chomp', 'swallow'] });
    const at = await dummies();
    await page.mouse.move(at[0], at[1]);
  }
  if (on('a')) {
    await reset();
    // three taps in rhythm: each after the step before is over (inside the window)
    for (let i = 1; i <= 3; i++) { await tapRMB(); await casts(i); if (i === 2) { await page.waitForFunction(() => window.G.skills.chain.view.on && window.G.skills.chain.view.step === 2, null, { timeout: 4000 }); await snap('chewy-pips-step2'); } await stepOver(); }
    let c = await ev(() => ({ casts: window.__casts, cev: window.__cev, chain: window.G.skills.chain.chain, hits: window.__hits }));
    R.check('three taps in rhythm: step 1, step 2, then the finisher (Crescent Chomp)', c.casts.map(x => x.step).join() === '1,2,3' && c.casts[2].fin && c.cev.filter(e => e[0] === 'combo:step').map(e => e[1]).join() === '1,2' && c.cev.some(e => e[0] === 'combo:finish'), JSON.stringify(c.casts.map(x => x.step)) + ' ' + JSON.stringify(c.cev));
    const top = s => Math.max(0, ...c.hits.filter(h => h.step === s).map(h => h.pct)), h1 = top(1), h3 = top(3);
    R.check('the finisher hits 15% harder than step 1 (its dmgPct)', h1 && h3 && Math.abs(h3 / h1 - 1.15) < 0.005, JSON.stringify({ h1, h3 }));
    R.check('…and lands: its flourish event, the chain over', c.cev.some(e => e[0] === 'combo:land') && !c.chain, JSON.stringify(c.cev));
    R.check('without perks every step costs the tap\'s zoom and plays at its speed', c.casts.every(x => x.cost === c.casts[0].cost && x.speed === 1), JSON.stringify(c.casts.map(x => [x.cost, x.speed])));
    await tapRMB(); await casts(4); await stepOver();
    c = await ev(() => window.__casts.map(x => x.step));
    R.check('after a finisher the next tap starts a new chain (step 1)', c[3] === 1, JSON.stringify(c));
    // mashing: each tap right after the previous cast went off, during its swing (buffered by tryCast's queue)
    await reset();
    for (let i = 1; i <= 3; i++) { await tapRMB(); await casts(i); }
    await stepOver();
    c = await ev(() => ({ s: window.__casts.map(x => x.step), fin: window.__cev.filter(e => e[0] === 'combo:finish').length }));
    R.check('mashing: taps during the swing are buffered and still chain to the finisher', c.s.join() === '1,2,3' && c.fin === 1, JSON.stringify(c));
    // the window runs out
    await reset();
    await tapRMB(); await casts(1); await stepOver();
    await page.waitForFunction(() => window.__cev.some(e => e[0] === 'combo:drop'), null, { timeout: 4000 });
    const drop = await ev(() => ({ cev: window.__cev, until: window.G.skills.chain.chain }));
    await tapRMB(); await casts(2); await stepOver();
    c = await ev(() => window.__casts.map(x => x.step));
    R.check('the window running out drops the chain; the next tap is step 1 again', drop.cev.some(e => e[0] === 'combo:drop' && e[1] === 'window') && c.join() === '1,1', JSON.stringify({ cev: drop.cev, c }));
    // another skill drops it
    await reset();
    await tapRMB(); await casts(1); await stepOver();
    await page.keyboard.down('1'); await page.waitForTimeout(45); await page.keyboard.up('1'); await casts(2); await stepOver();
    c = await ev(() => ({ cev: window.__cev, casts: window.__casts.map(x => [x.id, x.step]) }));
    R.check('another skill (Swallow Return) drops the chain; it starts its own', c.cev.some(e => e[0] === 'combo:drop' && e[1] === 'switch' && e[2] === 'chomp') && c.casts[1][0] === 'swallow' && c.casts[1][1] === 1, JSON.stringify(c));
    // a roll drops it
    await reset();
    await tapRMB(); await casts(1); await stepOver();
    await page.keyboard.press('Space'); await page.waitForFunction(() => window.__cev.some(e => e[0] === 'combo:drop'), null, { timeout: 3000 });
    c = await ev(() => window.__cev);
    R.check('a roll drops the chain', c.some(e => e[0] === 'combo:drop' && e[1] === 'roll'), JSON.stringify(c));
    await page.waitForFunction(() => !(window.G.player.rollT > 0), null, { timeout: 3000 });
    // a held charge mid-chain is the finisher
    await reset();
    await tapRMB(); await casts(1); await stepOver();
    await page.mouse.down({ button: 'right' }); await page.waitForFunction(() => (window.G.skills.charge.active?.stage || 0) >= 1, null, { timeout: 8000 });
    const held = await ev(() => !!window.G.skills.chain.chain);
    await page.mouse.up({ button: 'right' }); await casts(2); await stepOver();
    c = await ev(() => ({ casts: window.__casts, cev: window.__cev, chain: window.G.skills.chain.chain }));
    R.check('a held charge released mid-chain lands as the finisher: Stage Ⅰ, the bonus, the chain ends', held && c.casts[1].stage === 1 && c.casts[1].fin && c.cev.some(e => e[0] === 'combo:finish' && e[1] === 'charged') && !c.chain, JSON.stringify({ held, c: c.casts.map(x => [x.stage, x.step, x.fin]), cev: c.cev }));
    // a charge outside a chain stays its own thing
    await reset(); await page.mouse.down({ button: 'right' }); await page.waitForFunction(() => (window.G.skills.charge.active?.stage || 0) >= 1, null, { timeout: 8000 }); await page.mouse.up({ button: 'right' }); await casts(1); await stepOver();
    c = await ev(() => ({ casts: window.__casts.map(x => [x.stage, x.step]), chain: window.G.skills.chain.chain }));
    R.check('a charge outside a chain neither starts nor finishes one', c.casts[0][0] === 1 && c.casts[0][1] === 0 && !c.chain, JSON.stringify(c));
  }
  // ================================================================ b) the perks
  if (on('b')) {
    await reset();
    await ev(() => { window.G.state.player.comboPerks = { chomp: { quick: 3 } }; });
    for (let i = 1; i <= 3; i++) { await tapRMB(); await casts(i); await stepOver(); }
    let c = await ev(() => window.__casts.map(x => ({ step: x.step, speed: x.speed, dur: x.dur, act: x.act })));
    R.check('Quick Hands 3: steps 2 and the finisher play 15% faster (their action ×1/1.15, hit frames with it)', c[0].speed === 1 && Math.abs(c[1].speed - 1.15) < 1e-6 && Math.abs(c[2].speed - 1.15) < 1e-6 && Math.abs(c[0].dur / c[1].dur - 1.15) < 0.02, JSON.stringify(c));
    const moves = await ev(() => { const G = window.G; return { move: G.combat.moveMul(), speed: G.derived.moveSpeed ?? G.derived.speed ?? null }; });
    R.check('no move-speed change from the chain or its perks', moves.move === 1, JSON.stringify(moves));
    await reset();
    await ev(() => { const G = window.G, A = G.actions; G.state.player.comboPerks = { chomp: { light: 2 } }; window.__spent = []; if (!A.__sz) { A.__sz = A.spendZoom; A.spendZoom = n => { window.__spent.push(n); return A.__sz(n); }; } });
    for (let i = 1; i <= 3; i++) { await tapRMB(); await casts(i); await stepOver(); }
    let sp = await ev(() => window.__spent.slice());
    R.check('Light Touch 2: steps 2 and the finisher cost 30% less zoom', sp.length === 3 && Math.abs(sp[1] - Math.round(sp[0] * 0.7 * 10) / 10) < 0.051 && Math.abs(sp[2] - sp[1]) < 1e-6, JSON.stringify(sp));
    await reset();
    await ev(() => { window.G.state.player.comboPerks = { chomp: { free: 1 } }; window.__spent = []; });
    for (let i = 1; i <= 2; i++) { await tapRMB(); await casts(i); await stepOver(); }
    await ev(() => { const G = window.G; G.state.player.zoom = 0.2; G.__tick = G.actions.tickRegen; G.actions.tickRegen = () => {}; });
    await tapRMB(); await casts(3); await stepOver();
    sp = await ev(() => ({ spent: window.__spent.slice(), casts: window.__casts.map(x => [x.step, x.cost]), z: window.G.state.player.zoom }));
    await ev(() => { const G = window.G; G.actions.tickRegen = G.__tick; G.actions.restoreAll(); });
    R.check('Free Finisher: a tapped finisher costs no zoom, and goes off on an empty pool', sp.spent.length === 2 && sp.casts[2]?.[0] === 3 && sp.casts[2][1] === 0, JSON.stringify(sp));
    await reset();
    await ev(() => { window.G.state.player.comboPerks = { chomp: { tempo: 1 } }; });
    for (let i = 1; i <= 3; i++) { await tapRMB(); await casts(i); await stepOver(); }
    const tb = await ev(() => ({ tempo: window.G.combat.buffs.tempo, move: window.G.combat.moveMul(), atk: window.G.combat.atkMul() }));
    await tapRMB(); await casts(4); await stepOver();
    c = await ev(() => window.__casts.map(x => ({ step: x.step, speed: x.speed, dur: x.dur })));
    R.check('Tempo: a landed finisher gives +8% attack speed for 3 s to the Combo strikes (the next step 1 plays ×1.08)', tb.tempo?.pct === 8 && tb.tempo.t > 2 && Math.abs(c[3].speed - 1.08) < 1e-6 && Math.abs(c[0].dur / c[3].dur - 1.08) < 0.02, JSON.stringify({ tb, c }));
    R.check('…and Tempo moves nothing: the walk and the basic attack keep their speed', tb.move === 1 && tb.atk === 1, JSON.stringify(tb));
    // buying, saving, a hero switch, a respec
    await reset();
    const buy = await ev(() => { const G = window.G, A = G.actions, pl = G.state.player; pl.comboPerks = {}; pl.skillPts = 6; pl.skills.chomp = 2; const r = [A.learnComboPerk('chomp', 'quick'), A.learnComboPerk('chomp', 'quick'), A.learnComboPerk('chomp', 'free'), A.learnComboPerk('chomp', 'light')]; return { r, pts: pl.skillPts }; });
    R.check('buying perks: one point a rank, gated by the skill\'s level (Quick Hands 2 needs Lv 3, Free Finisher Lv 8)', buy.r[0] === 1 && buy.r[1] === false && buy.r[2] === false && buy.r[3] === 1 && buy.pts === 4, JSON.stringify(buy));
    const saved = await ev(() => { window.G.save(); const s = JSON.parse(localStorage.getItem('chewy3d.save')); return { chewy: s.heroes.chewy.player.comboPerks, moka: s.heroes.moka.player.comboPerks }; });
    R.check('combo perks are saved on the hero (Chewy has his; Moka an empty set)', saved.chewy?.chomp?.quick === 1 && saved.chewy.chomp.light === 1 && saved.moka && !Object.keys(saved.moka).length, JSON.stringify(saved));
    const rs = await ev(() => { const G = window.G, pl = G.state.player; pl.skills.chomp = 10; const before = pl.skillPts, perks = 2, sk = Object.values(pl.skills).reduce((a, b) => a + b, 0); G.actions.respec(); return { ok: pl.skillPts === before + perks + sk + 0 || pl.skillPts >= before + perks + sk, combo: pl.comboPerks, pts: pl.skillPts, before, sk }; });
    R.check('a respec refunds combo perks', rs.combo && !Object.keys(rs.combo).length && rs.pts >= rs.before + 2 + rs.sk, JSON.stringify(rs));
  }
  // ================================================================ c) every hero's combo strikes chain
  if (on('c')) {
    const HEROES = { chewy: ['chomp', 'swallow', 'throw'], moka: ['splash', 'kibble'], poe: ['fumaThrow', 'fumaFlurry', 'kunaiFan'], shihtzu: ['woefulWallop', 'glumBonk'], golden: ['sunbeamThrust', 'eagerJabs', 'bonkDart'], stella: ['goldenRay', 'solarFlare'] };
    for (const [hero, ids] of Object.entries(HEROES)) {
      await fight(hero, 2);
      const have = await ev(async ids => { const { COMBO } = await import('/src/rpg/combo.js'); return ids.filter(id => COMBO[id]); }, ids);
      const miss = ids.filter(id => !have.includes(id));
      if (miss.length) R.note(`${hero}: ${miss.join(', ')} not in the combo table yet (skill not landed): skipped`);
      for (const id of have) {
        await learn({ skills: { [id]: 10 }, pts: 0, hotbar: [null, id], wep: id, perks: { [id]: { quick: 3, light: 2, free: 1, tempo: 1 } } });
        const at = await dummies(); await page.mouse.move(at[0], at[1]);
        await reset();
        let ok = true;
        for (let i = 1; i <= 3 && ok; i++) { await tapRMB(); ok = await casts(i, page, 6000).then(() => true, () => false); if (ok) ok = await stepOver(page, 6000).then(() => true, () => false); }
        const c = await ev(() => ({ s: window.__casts.map(x => x.step), cev: window.__cev.map(e => e[0].slice(6)), hits: window.__hits.length }));
        R.check(`${hero} ${id}: three taps chain to a finisher that lands`, ok && c.s.join() === '1,2,3' && c.cev.includes('finish') && c.hits > 0, JSON.stringify(c));
        const sp = await ev(() => window.__casts.map(x => ({ act: x.act, dur: x.dur, speed: x.speed })));
        if (sp[1] && sp[0].act && sp[0].act === sp[1].act) R.check(`${hero} ${id}: Quick Hands reaches its cast (step 2's ${sp[1].act} plays ×${sp[1].speed})`, Math.abs(sp[0].dur / sp[1].dur - sp[1].speed) < 0.03, JSON.stringify(sp));
      }
      if (hero === 'stella') await snap('stella-finisher');
    }
  }
  // ================================================================ d) the K panel's Combo pane
  if (on('d')) {
    await boot(page, 'fresh&nointro');
    await learn({ skills: { chomp: 3, swallow: 1 }, pts: 5, hotbar: [null, 'chomp'] });
    await ev(() => window.G.ui.open('skills'));
    await page.waitForFunction(() => window.G.ui.isOpen('skills') && !document.querySelector('.pw.opening'), null, { timeout: 5000 });
    const tab = await ev(() => { const t = document.querySelector('.p-skills .cmb-tab'); if (!t) return null; const r = t.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, hidden: t.offsetParent === null }; });
    R.check('the Combo tab sits beside the Charge tag on a tree with combo skills', tab && !tab.hidden, JSON.stringify(tab));
    if (tab) await page.mouse.click(tab.x, tab.y);
    await page.waitForFunction(() => document.querySelector('.p-skills .chg-drawer.combo .cmb-pane:not([hidden])'), null, { timeout: 4000 }).catch(() => {});
    let st = await ev(() => { const d = document.querySelector('.p-skills .chg-drawer'); const strip = [...d.querySelectorAll('.cmb-pick .chg-sk')].map(b => b.dataset.k); return { combo: d.classList.contains('combo'), strip, id: window.G.ui.panels.skills.chg.combo?.id, perks: [...d.querySelectorAll('.cmb-perks .chg-pk')].map(p => p.dataset.p + ':' + p.className.replace('chg-pk', '').trim()) }; });
    R.check('the Combo pane: the tree\'s combo skills on its strip (Crescent Chomp, Swallow Return), four perks', st.combo && st.strip.includes('chomp') && st.strip.includes('swallow') && st.perks.length === 4, JSON.stringify(st));
    await snap('kpanel-combo');
    const sb = await ev(() => { const b = document.querySelector('.cmb-pick .chg-sk[data-k="chomp"]'); const r = b.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
    await page.mouse.click(sb[0], sb[1]);
    await page.waitForFunction(() => window.G.ui.panels.skills.chg.combo.id === 'chomp' && !document.querySelector('.chg-drawer.swap'), null, { timeout: 3000 }).catch(() => {});
    st = await ev(() => ({ id: window.G.ui.panels.skills.chg.combo.id, sel: document.querySelector('.cmb-pick .chg-sk.sel')?.dataset.k, name: document.querySelector('.cmb-pane .chg-name')?.textContent }));
    R.check('the strip switches the pane to Crescent Chomp', st.id === 'chomp' && st.sel === 'chomp' && /Crescent Chomp/.test(st.name), JSON.stringify(st));
    const pk = await ev(() => { const n = document.querySelector('.cmb-perks .chg-pk[data-p="quick"]'); const r = n.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
    const pts0 = await ev(() => window.G.state.player.skillPts);
    await page.mouse.move(pk[0], pk[1]); await page.mouse.click(pk[0], pk[1]);
    await page.waitForFunction(p => window.G.state.player.skillPts === p - 1, pts0, { timeout: 3000 }).catch(() => {});
    st = await ev(() => ({ k: window.G.state.player.comboPerks?.chomp, pts: window.G.state.player.skillPts, dt: document.querySelector('.cmb-pane .chg-dt')?.textContent || '' }));
    R.check('a click on Quick Hands buys a rank (one point), the detail box shows its numbers', st.k?.quick === 1 && st.pts === pts0 - 1 && /faster/.test(st.dt), JSON.stringify(st));
    const gate = await ev(() => { const n = document.querySelector('.cmb-perks .chg-pk[data-p="tempo"]'); return { cls: n.className, gate: n.querySelector('.chg-gate')?.textContent }; });
    R.check('the level gates show (Tempo: Lv 10)', /locked|open/.test(gate.cls) && gate.gate === 'Lv 10', JSON.stringify(gate));
    await snap('kpanel-combo-bought');
    const chip = await ev(() => { const n = document.querySelector('.node[data-id="chomp"] .nd-cmb'); return n ? { on: n.classList.contains('on'), txt: n.textContent } : null; });
    R.check('the tree\'s Crescent Chomp node wears the combo chip (points spent)', chip?.on && /1/.test(chip.txt), JSON.stringify(chip));
    const tip = await ev(async () => { const S = window.G.ui.panels.skills; return S.tipHTML('chomp'); });
    R.check('the skill tooltip says "Tap again to chain"', /Tap again to chain/.test(tip), '');
    const back = await ev(() => { const t = document.querySelector('.p-skills .chg-tag'); t.click(); const d = document.querySelector('.p-skills .chg-drawer'); return !d.classList.contains('combo'); });
    R.check('the Charge tag brings the Charge card back', back, '');
    await ev(() => window.G.ui.close('skills'));
  }
  // ================================================================ e) pad and touch parity
  if (on('e')) {
    await fight('chewy', 2);
    await learn({ skills: { chomp: 10 }, pts: 0, hotbar: [null, 'chomp'] });
    await dummies();
    await installPad(page);
    await reset();
    const BTN = 'X'; // (the pad's RMB slot: core/actions.js skillAlt, CONTROLS.md)
    for (let i = 1; i <= 3; i++) { await padDown(page, BTN); await page.waitForTimeout(45); await padUp(page, BTN); await casts(i).catch(() => {}); await stepOver().catch(() => {}); }
    let c = await ev(() => window.__casts.map(x => x.step));
    R.check('the pad RMB button (X) chains three taps to a finisher', c.join() === '1,2,3', JSON.stringify(c));
    await padReset(page);
    const T = await launchTouch(PHONE), tp = T.page;
    T.page.on('pageerror', e => errors.push(`[touch pageerror] ${e.message}`));
    await fight('chewy', 2, tp);
    await learn({ skills: { chomp: 10 }, pts: 0, hotbar: [null, 'chomp'] }, tp);
    await dummies(tp); await reset(tp);
    await tp.evaluate(() => { const T = (window.G.state.flags.tutorials ||= {}); for (const id of ['house', 'switch', 'fishing', 'makeHome', 'remodel', 'charge']) T[id] = { done: true }; window.G.ui.toasts?.retire?.(0); });
    await tp.waitForFunction(() => document.querySelector('.tc.on .tc-slot[data-slot="1"] > .hb'), null, { timeout: 8000 }).catch(() => {});
    const slot = await tp.evaluate(() => { const s = document.querySelector('.tc-slot[data-slot="1"]'); const r = s.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
    for (let i = 1; i <= 3; i++) { await T.F.tap(slot[0], slot[1]); await casts(i, tp).catch(() => {}); await stepOver(tp).catch(() => {}); }
    c = await tp.evaluate(() => window.__casts.map(x => x.step));
    R.check('a phone\'s skill button chains three taps to a finisher', c.join() === '1,2,3', JSON.stringify(c));
    await T.browser.close();
  }
  // ================================================================ f) the guide
  if (on('f')) {
    await boot(page, 'fresh&nointro&tut&hour=11');
    await ev(() => { const G = window.G; G.sim.tickT = -1e9; window.__freeze = setInterval(() => { G.sim.tickT = -1e9; }, 200); G.state.flags.hints = { garden: 1, build: 1, travel: 1, skills: 1, stats: 1, loot: 1, potion: 1 }; const T = (G.state.flags.tutorials ||= {}); for (const id of ['house', 'switch', 'fishing', 'makeHome', 'remodel', 'charge', 'nose', 'board', 'guild']) T[id] = { done: true }; G.state.flags.burrowTut = true; G.state.player.hotbar[1] = 'chomp'; });
    const g0 = await ev(async () => { const { GUIDES } = await import('/src/world/guides.js'); const G = window.G, before = GUIDES.combo.trigger(G); G.state.flags.comboTut = true; return before ? 'combo' : null; }); // (it waits for a combo strike in a fight: combat/combo.js sets comboTut)
    const stepIs = (step, timeout = 15000) => page.waitForFunction(step => window.G.tutorials.active === 'combo' && window.G.tutorials.cur?.step?.id === step && window.G.tutorials.cur.entered && !window.G.tutorials.paused, step, { timeout });
    await stepIs('chain', 20000).catch(async e => { console.log('guide state', await ev(() => JSON.stringify({ a: window.G.tutorials.active, cur: window.G.tutorials.cur?.step?.id, en: window.G.tutorials.cur?.entered, p: window.G.tutorials.paused, rec: window.G.state.flags.tutorials, mode: window.G.mode, modal: window.G.ui.anyModal?.(), flag: window.G.state.flags.comboTut, ms: window.G.state.player.mouseSets }))); throw e; });
    await page.mouse.move(640, 420);
    for (let i = 0; i < 3; i++) { await tapRMB(); await page.waitForFunction(n => (window.G.skills.chain.last?.step || 0) >= n || window.G.tutorials.cur?.step?.id !== 'chain', i + 1, { timeout: 6000 }).catch(() => {}); await stepOver().catch(() => {}); }
    await stepIs('perks');
    await page.keyboard.press('KeyK'); await stepIs('card');
    const tb = await ev(() => { const t = document.querySelector('.p-skills .cmb-tab'); const r = t.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
    await page.mouse.click(tb[0], tb[1]); await page.waitForFunction(() => window.G.ui.panels.skills.chg.mode === 'combo', null, { timeout: 3000 }).catch(() => {});
    await sleep(page, 500); await snap('guide-card');
    const g2 = await ev(() => ({ mode: window.G.ui.panels.skills.chg.mode }));
    await ev(() => document.querySelector('.to-ok')?.click()); await stepIs('wrap');
    await ev(() => document.querySelector('.to-ok')?.click());
    await page.waitForFunction(() => window.G.state.flags.tutorials.combo?.done, null, { timeout: 5000 }).catch(() => {});
    const g3 = await ev(() => ({ active: window.G.tutorials.active, rec: window.G.state.flags.tutorials.combo }));
    R.check('the "Tap, tap, finish!" guide: waits for a combo strike in a fight; then three taps to a finisher, K, the Combo tab; done', g0 !== 'combo' && g2.mode === 'combo' && g3.rec?.done, JSON.stringify({ g0, g2, g3 }));
    await ev(() => clearInterval(window.__freeze));
  }
} catch (e) {
  R.check('no exceptions', false, e.stack || String(e));
}
const failed = R.finish(errors, warns);
await browser.close();
process.exit(failed ? 1 : 0);
