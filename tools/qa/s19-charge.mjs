// S19 charged abilities (docs/CHARGE.md §6), through real inputs:
//  a) the hold: a tap casts normal; holding reaches Ⅰ and fires charged; Ⅱ and Ⅲ with Deeper Charge; the stage cost, paid
//     once on release; the cap when zoom is short; a roll and a panel cancel, a hit doesn't; the slow walk; Toggle and Off;
//     the number keys; perks per hero through save/load, a hero switch and a respec
//  b) unique perks at work: Second Draw, Split Shot + Boomerang Fetch, Rain Shower
//  c) the channels: Whirlwind Stance and Moonbeam wind up, then channel while held, spin out / linger when let go
//  d) every active skill of both heroes charge-casts at Ⅰ and Ⅲ with every perk, in a Burrow fight, without errors
//  e) the K panel: the Charge drawer, buying a perk (one point), level gates, the ⚡ chip picks a skill, the tooltip
//  f) a charged dash (Flash Draw, Return Stroke, Afterimage) never leaves the walkable floor: walls, cliffs, closed doors,
//     region bounds, even on a long frame
//  g) the "Hold to power up!" guide (Shadow)
//  h) perf: frame times through a burst of fully charged releases vs the same burst tapped
//  i) R-16, the drawer's skill strip by every input: the mouse, a phone's and an iPad's fingers and the pad each switch
//     the drawer to a skill that isn't the tree's default and buy a perk there; hover names, unlearned previews, each
//     tree's memory, learn and assign pick, the chip (its tooltip steps aside; 44 px to a finger; a double-tap learns
//     once), LT / RT, and the drawer on the screen at 1280×720 and UI 125 %. S19_ONLY=i runs just this
import { launch, boot, waitMode, sleep, makeReport, BASE } from './lib.mjs';
import { launchTouch, PHONE, IPAD } from './touch-lib.mjs';
import { installPad, padTap, padReset } from './pad-lib.mjs';

const R = makeReport('S19 charged abilities: hold, perks, channels, every skill, K panel, dash bounds, guide, perf');
const { browser, page, errors, warns } = await launch({ w: 1280, h: 720 });
const ev = (f, a) => page.evaluate(f, a);
const HOUR = 11;
const ONLY = process.env.S19_ONLY; // (i: only the R-16 section)

async function fight(hero = 'chewy', floor = 2) {
  await boot(page, `fresh&nointro${hero === 'moka' || hero === 'poe' || hero === 'shihtzu' || hero === 'golden' ? `&hero=${hero}` : ''}`);
  await ev(f => { window.G.state.flags.burrowTut = true; window.G.enterDungeon(f); }, floor);
  await waitMode(page, 'dungeon');
}
/** clear the room and stand a line of sturdy dummies off to camera-right; → screen xy aiming at them */
const dummies = (far = false) => ev(far => {
  const G = window.G, P = G.player;
  for (const m of G.dungeon.monsters) { m.status.stun = 999; m.pos.set(-999, 0, -999); }
  const { r } = G.engine.rig.groundAxes(), n0 = G.dungeon.monsters.length;
  G.dungeon.summonAround({ pos: P.pos }, 'mochi', 4);
  const ring = G.dungeon.monsters.slice(n0);
  ring.forEach((m, i) => { m.pos.set(P.pos.x + r.x * (2.4 + i * 1.6), 0, P.pos.z + r.z * (2.4 + i * 1.6)); m.lifeMax = m.life = 1e7; m.status.stun = 999; m.speed = 0; });
  window.__dummies = ring;
  window.__hits = new Map(); const raw = G.combat.hitMonster.bind(G.combat);
  G.combat.hitMonster = (m, o) => { window.__hits.set(m, (window.__hits.get(m) || 0) + 1); return raw(m, o); };
  window.__casts = []; const rc = G.skills.tryCast.bind(G.skills);
  G.skills.tryCast = (i, a, t, c) => { const x = rc(i, a, t, c); if (x) window.__casts.push({ id: i, stage: c?.stage || 0, free: !!c?.free }); return x; };
  window.__ev = []; for (const n of ['charge:start', 'charge:stage', 'charge:release', 'charge:spinout', 'charge:cancel']) G.events.on(n, p => window.__ev.push([n, p.stage ?? p.reason ?? '']));
  const p = far ? ring[ring.length - 1].pos.clone().setY(0.5) : P.pos.clone().addScaledVector(r, 3), v = p.project(G.engine.camera);
  return [(v.x * 0.5 + 0.5) * innerWidth, (-v.y * 0.5 + 0.5) * innerHeight];
}, far);
const learn = (o) => ev(async o => {
  const G = window.G, P = G.player, pl = G.state.player;
  const { SKILLS } = await import('/src/rpg/skills.js');
  pl.lvl = 30; pl.skillPts = o.pts ?? pl.skillPts;
  for (const [k, v] of Object.entries(o.skills || {})) pl.skills[k] = v;
  if (o.hotbar) o.hotbar.forEach((id, i) => { if (id) pl.hotbar[i] = id; });
  if (o.perks) pl.chargePerks = o.perks;
  const id = o.wep; if (id && SKILLS[id]?.wep && G.derived.weaponType !== SKILLS[id].wep) { G.actions.swapWeapons(); P.setWeapon(G.derived.weaponType); }
  G.actions.recompute(); G.actions.restoreAll();
}, o);
const reset = () => ev(() => { const G = window.G; G.skills.cds = {}; G.player.anim.stop(); window.__casts = []; window.__ev = []; G.actions.restoreAll(); });
const holdRMB = async (minStage = 1) => { await page.mouse.down({ button: 'right' }); await page.waitForFunction(s => (window.G.skills.charge.active?.stage || 0) >= s, minStage, { timeout: 8000 }); await sleep(page, 60); await page.mouse.up({ button: 'right' }); };

try {
  skipped: { if (ONLY === 'i') break skipped; // (S19_ONLY=i runs only section i)
  // ================================================================ a) the hold
  await fight('chewy', 2);
  await learn({ skills: { chomp: 10 }, pts: 10, hotbar: [null, 'chomp', 'chomp'] });
  await dummies();
  await page.mouse.move(800, 300);
  await reset(); await page.mouse.down({ button: 'right' }); await sleep(page, 70); await page.mouse.up({ button: 'right' }); await sleep(page, 500);
  let c = await ev(() => ({ casts: window.__casts, ev: window.__ev }));
  R.check('a tap casts one normal Crescent Chomp (no charge)', c.casts.length === 1 && c.casts[0].stage === 0 && !c.ev.some(e => e[0] === 'charge:start'), JSON.stringify(c));
  await reset(); await page.mouse.down({ button: 'right' });
  await page.waitForFunction(() => (window.G.skills.charge.active?.stage || 0) >= 1, null, { timeout: 8000 }); await sleep(page, 150);
  let st = await ev(() => { const a = window.G.skills.charge.active; return a && { stage: a.stage, max: a.max, slow: window.G.player.chargeSlow, pose: window.G.player.anim.action?.name, ring: window.G.skills.charge.view.on }; });
  await page.mouse.up({ button: 'right' }); await sleep(page, 600);
  c = await ev(() => ({ casts: window.__casts }));
  R.check('holding charges to Stage Ⅰ (one stage without perks): slow walk, the wind-up pose, the ring', st && st.stage === 1 && st.max === 1 && st.slow === 0.45 && st.pose === 'charge' && st.ring, JSON.stringify(st));
  R.check('…and letting go fires a Stage Ⅰ Grand Crescent', c.casts.length === 1 && c.casts[0].stage === 1, JSON.stringify(c.casts));
  const perk = await ev(() => { const A = window.G.actions; return [A.learnPerk('chomp', 'stages'), A.learnPerk('chomp', 'stages'), A.learnPerk('chomp', 'stages'), window.G.state.player.skillPts]; });
  R.check('Deeper Charge: Ⅱ, Ⅲ, then mastered; two points spent', perk[0] === 1 && perk[1] === 2 && perk[2] === false && perk[3] === 8, JSON.stringify(perk));
  await reset(); await ev(() => { const A = window.G.actions; window.__spent = []; if (!A.__sz) { A.__sz = A.spendZoom; A.spendZoom = n => { window.__spent.push(n); return A.__sz(n); }; } });
  await page.mouse.down({ button: 'right' }); await page.waitForFunction(() => (window.G.skills.charge.active?.stage || 0) >= 3, null, { timeout: 8000 }); await sleep(page, 200);
  st = await ev(() => { const a = window.G.skills.charge.active; return a && { stage: a.stage, full: window.G.skills.charge.view.full }; });
  await page.mouse.up({ button: 'right' }); await sleep(page, 500);
  c = await ev(() => ({ casts: window.__casts, stages: window.__ev.filter(e => e[0] === 'charge:stage').map(e => e[1]) }));
  R.check('with Deeper Charge 2: Ⅰ → Ⅱ → Ⅲ, held at full, a Stage Ⅲ release', st?.stage === 3 && st.full && c.stages.join() === '1,2,3' && c.casts[0]?.stage === 3, JSON.stringify({ st, c }));
  const cost = await ev(async () => { const Ch = await import('/src/rpg/charge.js'); const { skillRuntime } = await import('/src/rpg/skills.js'); const b = skillRuntime('chomp', window.G.state, window.G.derived).cost; return { b, c3: Ch.chargeCost(b, 3), k: 1 + 3 * Ch.SURCHARGE }; });
  const spent = await ev(() => window.__spent);
  R.check(`Stage Ⅲ costs the tap's zoom × ${cost.k}, paid once on release`, spent.length === 1 && Math.abs(spent[0] - cost.c3) < 0.01 && Math.abs(cost.c3 - cost.b * cost.k) < 0.1, JSON.stringify({ spent, cost }));
  await reset(); await page.mouse.down({ button: 'right' }); await sleep(page, 600);
  await page.keyboard.press('Space'); await sleep(page, 200); await page.mouse.up({ button: 'right' }); await sleep(page, 400);
  c = await ev(() => ({ casts: window.__casts, ev: window.__ev, slow: window.G.player.chargeSlow, lock: !!window.G.player.aimLock }));
  R.check('a roll cancels the charge: nothing cast, nothing spent, the walk and aim restored', c.casts.length === 0 && c.ev.some(e => e[0] === 'charge:cancel' && e[1] === 'roll') && c.slow === 1 && !c.lock, JSON.stringify(c));
  await reset(); await sleep(page, 900); await page.mouse.down({ button: 'right' }); await sleep(page, 500);
  await ev(() => window.G.ui.open('skills')); await sleep(page, 150); await page.mouse.up({ button: 'right' }); await ev(() => window.G.ui.close('skills')); await sleep(page, 300);
  c = await ev(() => ({ casts: window.__casts, ev: window.__ev }));
  R.check('opening a panel cancels the charge', c.casts.length === 0 && c.ev.some(e => e[0] === 'charge:cancel' && e[1] === 'modal'), JSON.stringify(c));
  await reset(); await page.mouse.down({ button: 'right' }); await sleep(page, 400);
  await ev(() => window.G.combat.hitPlayer(5, { level: 1 })); await sleep(page, 300);
  st = await ev(() => !!window.G.skills.charge.active);
  await page.mouse.up({ button: 'right' }); await sleep(page, 400);
  R.check('getting hit does not cancel the charge', st, '');
  await reset(); await sleep(page, 800);
  await ev(async () => { const { chargeCost } = await import('/src/rpg/charge.js'); const { skillRuntime } = await import('/src/rpg/skills.js'); const G = window.G, b = skillRuntime('chomp', G.state, G.derived).cost; G.state.player.zoom = chargeCost(b, 1) + 0.05; G.__tick = G.actions.tickRegen; G.actions.tickRegen = () => {}; });
  await page.mouse.down({ button: 'right' }); await page.waitForFunction(() => (window.G.skills.charge.active?.stage || 0) >= 1, null, { timeout: 8000 }); await sleep(page, 1600); // (the ring stops at the affordable stage: give Ⅱ and Ⅲ their time)
  st = await ev(() => { const a = window.G.skills.charge.active; return a && { stage: a.stage, aff: a.aff, aff3: [...window.G.skills.charge.view.aff] }; });
  await page.mouse.up({ button: 'right' }); await sleep(page, 400);
  c = await ev(() => ({ casts: window.__casts }));
  await ev(() => { const G = window.G; G.actions.tickRegen = G.__tick; G.actions.recompute(); G.actions.restoreAll(); });
  R.check('short on zoom: the ring caps at Stage Ⅰ (Ⅱ, Ⅲ greyed) and releases Stage Ⅰ', st?.stage === 1 && st.aff === 1 && st.aff3.join() === '1,0,0' && c.casts[0]?.stage === 1, JSON.stringify({ st, c }));
  await reset(); await sleep(page, 900); await ev(() => window.G.ui.setSetting('chargeMode', 2));
  await page.mouse.down({ button: 'right' }); await sleep(page, 60); await page.mouse.up({ button: 'right' });
  await page.waitForFunction(() => (window.G.skills.charge.active?.stage || 0) >= 1, null, { timeout: 8000 });
  st = await ev(() => ({ stage: window.G.skills.charge.active?.stage }));
  await page.mouse.down({ button: 'right' }); await sleep(page, 60); await page.mouse.up({ button: 'right' }); await sleep(page, 500);
  c = await ev(() => ({ casts: window.__casts }));
  await ev(() => window.G.ui.setSetting('chargeMode', 0));
  R.check('Toggle: a press starts charging hands-free, the next press releases', st.stage >= 1 && c.casts.length === 1 && c.casts[0].stage >= 1, JSON.stringify({ st, c }));
  await reset(); await ev(() => window.G.ui.setSetting('chargeMode', 1));
  await page.mouse.down({ button: 'right' }); await sleep(page, 1600); await page.mouse.up({ button: 'right' }); await sleep(page, 300);
  c = await ev(() => ({ casts: window.__casts, ev: window.__ev }));
  await ev(() => window.G.ui.setSetting('chargeMode', 0));
  R.check('Off: holding repeats normal casts, never charges', c.casts.length >= 2 && c.casts.every(x => x.stage === 0) && !c.ev.length, JSON.stringify(c.casts.length));
  await reset(); await page.keyboard.down('1');
  await page.waitForFunction(() => (window.G.skills.charge.active?.stage || 0) >= 1, null, { timeout: 8000 });
  st = await ev(() => window.G.skills.charge.active?.slot);
  await page.keyboard.up('1'); await sleep(page, 400);
  c = await ev(() => ({ casts: window.__casts }));
  R.check('a number key charges and releases like the mouse', st === 2 && c.casts[0]?.stage >= 1, JSON.stringify({ st, c }));
  const saved = await ev(() => { window.G.save(); const s = JSON.parse(localStorage.getItem('chewy3d.save')); return { chewy: s.heroes.chewy.player.chargePerks, moka: s.heroes.moka.player.chargePerks || null }; });
  R.check('perks are saved on the hero (Chewy has his, Moka none)', saved.chewy?.chomp?.stages === 2 && !saved.moka?.chomp, JSON.stringify(saved));
  await page.goto(`${BASE}/?nointro&notitle`, { waitUntil: 'load' }); // (the same origin as boot(): BASE=... runs keep their save)
  await page.waitForFunction(() => window.__ready === true && window.G?.player, null, { timeout: 60000 }); await sleep(page, 600);
  const back = await ev(() => ({ perks: window.G.state.player.chargePerks, ms: (() => { window.G.state.flags.mokaJoined = true; window.G.actions.setActiveHero('moka'); const p = window.G.state.player.chargePerks; window.G.actions.setActiveHero('chewy'); return p || null; })(), again: window.G.state.player.chargePerks }));
  R.check('after a reload Chewy keeps his perks, Moka has her own, switching back keeps them', back.perks?.chomp?.stages === 2 && !back.ms?.chomp && back.again?.chomp?.stages === 2, JSON.stringify(back));
  const resp = await ev(() => { const p0 = window.G.state.player.skillPts; window.G.actions.respec(); return { p0, after: window.G.state.player.skillPts, perks: window.G.state.player.chargePerks }; });
  R.check('a respec refunds the perk points', resp.after - resp.p0 >= 2 && !Object.keys(resp.perks || {}).length, JSON.stringify(resp));

  // ================================================================ b) unique perks
  await fight('chewy', 2); await learn({ skills: { chomp: 10 }, hotbar: [null, 'chomp'], perks: { chomp: { seconds: 1 } } });
  let xy = await dummies(); await page.mouse.move(xy[0], xy[1]); await sleep(page, 300);
  await holdRMB();
  // (on the game's clock, not the wall's: wait for the charged swing to finish, then tap; the window is 2 s of game time)
  await page.waitForFunction(() => window.__casts.length >= 1 && !['swing', 'iaiCut'].includes(window.G.player.anim.action?.name), null, { timeout: 5000 }).catch(() => {});
  await page.mouse.down({ button: 'right' }); await sleep(page, 60); await page.mouse.up({ button: 'right' });
  await page.waitForFunction(() => window.__casts.length >= 2, null, { timeout: 5000 }).catch(() => {});
  c = await ev(() => window.__casts);
  R.check('Second Draw: a tap inside 2s after a charged Crescent Chomp is a free Stage Ⅰ', c.length === 2 && c[0].stage === 1 && c[1].stage === 1 && c[1].free, JSON.stringify(c));
  await fight('chewy', 2); await learn({ skills: { throw: 10 }, hotbar: [null, 'throw'], perks: { throw: { split: 2, boomerang: 1 } }, wep: 'throw' });
  xy = await dummies(true); await page.mouse.move(xy[0], xy[1]); await sleep(page, 300);
  await ev(() => { window.__pr = []; const C = window.G.combat, raw = C.spawn.bind(C); C.spawn = o => { const p = raw(o); window.__pr.push(p); return p; }; for (const m of window.__dummies) m.knock = { add() {}, set() {}, lengthSq: () => 0, multiplyScalar() { return this; } }; });
  await holdRMB();
  // (on the game's state, not the wall's: the three balls thrown, then every one home, out of the combat's projectiles)
  await page.waitForFunction(() => window.__pr.length >= 3 && window.__pr.every(p => !window.G.combat.projectiles.includes(p)), null, { timeout: 10000 }).catch(() => {});
  const tb = await ev(() => ({ casts: window.__casts, balls: window.__pr.map(p => ({ kind: p.kind, out: p.hitSet.size, back: p.backSet?.size || 0 })) }));
  R.check('Split Shot 2 + Boomerang Fetch: three fastballs; one pierces the whole line and hits again on the way back', tb.casts[0]?.stage === 1 && tb.balls.length === 3 && tb.balls.every(b => b.kind === 'fastball') && Math.max(...tb.balls.map(b => b.out)) === 4 && tb.balls.every(b => !b.out || b.back > 0), JSON.stringify(tb));
  await fight('moka', 2); await learn({ skills: { splash: 10 }, hotbar: [null, 'splash'], perks: { splash: { split: 1, rain: 1 } } });
  xy = await dummies(); await page.mouse.move(xy[0], xy[1]); await sleep(page, 300);
  await ev(() => { window.__kinds = []; const C = window.G.combat, raw = C.spawn.bind(C); C.spawn = o => { window.__kinds.push(o.kind); return raw(o); }; });
  await holdRMB(); await sleep(page, 1800);
  const sp = await ev(() => ({ casts: window.__casts, kinds: window.__kinds }));
  const big = sp.kinds.filter(k => k === 'bigorb').length, mini = sp.kinds.filter(k => k === 'waterorb').length;
  R.check('Big Splash: Split Shot 1 → two big orbs; Rain Shower → a rain of mini bolts', sp.casts[0]?.stage === 1 && big === 2 && mini >= 5, JSON.stringify({ big, mini }));

  // ================================================================ c) the channels
  await fight('chewy', 2); await learn({ skills: { whirl: 10 }, hotbar: [null, null, 'whirl'] });
  await ev(() => { const G = window.G, P = G.player; for (const m of G.dungeon.monsters) { m.status.stun = 999; m.pos.set(-999, 0, -999); } const n0 = G.dungeon.monsters.length; G.dungeon.summonAround({ pos: P.pos }, 'mochi', 4); window.__ring = G.dungeon.monsters.slice(n0); window.__ring.forEach((m, i) => { const a = i / 4 * Math.PI * 2; m.pos.set(P.pos.x + Math.cos(a) * 3.2, 0, P.pos.z + Math.sin(a) * 3.2); m.lifeMax = m.life = 1e7; m.status.stun = 999; m.speed = 0; }); window.__ev = []; for (const n of ['charge:spinout']) G.events.on(n, p => window.__ev.push([n, p.stage])); window.__h = 0; const raw = G.combat.hitMonster.bind(G.combat); G.combat.hitMonster = (m, o) => { window.__h++; return raw(m, o); }; });
  await page.keyboard.down('1');
  await page.waitForFunction(() => window.G.skills.charge.active?.id === 'whirl' || window.G.skills.channel, null, { timeout: 4000 }).catch(() => {}); // (game time, not wall time: a busy machine runs the game slow)
  const w = await ev(() => ({ anim: window.G.player.anim.action?.name, channel: !!window.G.skills.channel }));
  await page.waitForFunction(() => window.G.skills.channel?.id === 'whirl', null, { timeout: 6000 });
  const d0 = await ev(() => window.__ring.map(m => Math.hypot(m.pos.x - window.G.player.pos.x, m.pos.z - window.G.player.pos.z)));
  await sleep(page, 1200);
  const s1 = await ev(() => ({ anim: window.G.player.anim.action?.name, stage: window.G.skills.channel?.R?.charge?.stage, hits: window.__h, d: window.__ring.map(m => Math.hypot(m.pos.x - window.G.player.pos.x, m.pos.z - window.G.player.pos.z)) }));
  R.check('Whirlwind Stance: holding winds up first, then the charged spin starts by itself, hits and pulls foes in', w.anim === 'charge' && !w.channel && s1.anim === 'spin' && s1.stage >= 1 && s1.hits >= 6 && s1.d.every((d, i) => d < d0[i] - 0.2), JSON.stringify({ w, s1, d0 }));
  await page.keyboard.up('1'); await sleep(page, 400);
  const o1 = await ev(() => ({ channel: !!window.G.skills.channel, ev: window.__ev.map(e => e.join(':')) }));
  await sleep(page, 2600);
  const e1 = await ev(() => !!window.G.skills.channel);
  R.check('…let go: it spins out on its own, then ends', o1.channel && o1.ev.includes('charge:spinout:1') && !e1, JSON.stringify({ o1, e1 }));
  await fight('moka', 2); await learn({ skills: { moonbeam: 10 }, hotbar: [null, null, 'moonbeam'] });
  await page.mouse.move(700, 330); await page.keyboard.down('1');
  await page.waitForFunction(() => window.G.skills.channel?.id === 'moonbeam', null, { timeout: 6000 });
  const mb = await ev(async () => { const { skillRuntime } = await import('/src/rpg/skills.js'); const G = window.G; return { r: G.skills.channel.beam.r, r0: skillRuntime('moonbeam', G.state, G.derived).params.radius }; });
  await sleep(page, 300); await page.keyboard.up('1'); await sleep(page, 300);
  const mb1 = await ev(() => window.G.skills.channel?.id || null);
  await sleep(page, 1600);
  const mb2 = await ev(() => window.G.skills.channel?.id || null);
  R.check('Moonbeam: a wind-up, then the charged beam; let go and it lingers, then ends', mb.r >= mb.r0 - 1e-6 && mb1 === 'moonbeam' && !mb2, JSON.stringify({ mb, mb1, mb2 }));

  // ================================================================ d) every active skill, all five heroes, Ⅰ and Ⅲ, every perk
  for (const hero of ['chewy', 'moka', 'poe', 'shihtzu', 'golden']) {
    await fight(hero, 3);
    const ids = await ev(async hero => {
      const G = window.G, pl = G.state.player;
      const { SKILLS } = await import('/src/rpg/skills.js'); const { CHARGE } = await import('/src/rpg/charge.js');
      pl.lvl = 40; pl.stats.vit = 300; pl.stats.ene = 400;
      const ids = Object.keys(CHARGE).filter(id => SKILLS[id].cls === hero);
      pl.chargePerks = {};
      for (const id of ids) { pl.skills[id] = 12; pl.chargePerks[id] = Object.fromEntries(Object.entries(CHARGE[id].perks).map(([k, p]) => [k, p.ranks])); }
      G.actions.recompute(); G.actions.restoreAll();
      window.__released = [];
      return ids;
    }, hero);
    let threw = null;
    for (const id of ids) for (const stage of [1, 3]) {
      const r = await ev(async ({ id, stage }) => {
        const G = window.G, P = G.player;
        const { SKILLS } = await import('/src/rpg/skills.js');
        G.skills.cds = {}; P.anim.stop(); P.leap = null; P.dash = null; if (P.hero === 'poe') G.skills.clearPoe(); if (P.hero === 'shihtzu') G.skills.clearShihtzu(); if (P.hero === 'golden') G.skills.clearGolden(); G.actions.restoreAll();
        if (SKILLS[id].wep && G.derived.weaponType !== SKILLS[id].wep) { G.actions.swapWeapons(); P.setWeapon(G.derived.weaponType); }
        if (G.dungeon.monsters.filter(m => m.alive).length < 5) G.dungeon.summonAround({ pos: P.pos }, 'mochi', 5);
        const { r: rr } = G.engine.rig.groundAxes();
        G.dungeon.monsters.filter(m => m.alive).slice(0, 6).forEach((m, i) => { m.pos.set(P.pos.x + rr.x * (2.5 + i * 0.9) + (i % 2) * 0.8, 0, P.pos.z + rr.z * (2.5 + i * 0.9) - (i % 2) * 0.8); m.lifeMax = m.life = 1e7; m.status.stun = 99; m.speed = 0; });
        const aim = P.pos.clone().addScaledVector(rr, 4), tgt = G.combat.nearest(aim, 'ally', 3);
        try { return { ok: G.skills.tryCast(id, aim, tgt, { stage }) }; } catch (e) { return { threw: String(e.stack || e).slice(0, 300) }; }
      }, { id, stage });
      if (r.threw) threw ||= `${id} Ⅲ${stage}: ${r.threw}`;
      await sleep(page, ['bubble', 'whirlpool', 'howl', 'bonestorm', 'decoy', 'duckDecoy'].includes(id) ? 1500 : 2300);
    }
    R.check(`${hero}: every active skill (${ids.length}) charge-casts at Ⅰ and Ⅲ with every perk, no errors`, !threw && ids.length >= (hero === 'shihtzu' || hero === 'golden' ? 15 : 16), threw || ids.join(','));
    await ev(() => window.G.returnToVillage()); await waitMode(page, 'village');
  }

  // ================================================================ e) the K panel
  await boot(page, `fresh&nointro&hour=${HOUR}`);
  await ev(() => { const G = window.G, pl = G.state.player; pl.lvl = 14; pl.skillPts = 4; Object.assign(pl.skills, { chomp: 6, dig: 3 }); pl.chargePerks = {}; G.actions.recompute(); G.ui.open('skills'); });
  await sleep(page, 700);
  const k0 = await ev(() => ({ drawer: !!document.querySelector('.p-skills .chg-drawer:not([hidden])'), id: window.G.ui.panels.skills.chg.id, perks: document.querySelectorAll('.chg-pk').length, chips: document.querySelectorAll('.node .nd-chg.on').length, title: document.querySelector('.chg-name')?.textContent }));
  R.check('K panel: the Charge drawer shows the tree\'s first skill (its 4 perks); the active skills carry a ⚡ chip', k0.drawer && k0.id === 'chomp' && k0.perks === 4 && k0.chips >= 2 && k0.title === 'Grand Crescent', JSON.stringify(k0));
  const pk = sel => ev(sel => { const n = document.querySelector(sel); if (!n) return null; const b = n.getBoundingClientRect(); return [n.dataset.p, b.x + b.width / 2, b.y + b.height / 2]; }, sel);
  const click = async xy => { await page.mouse.move(xy[1], xy[2]); await sleep(page, 150); await page.mouse.down(); await page.mouse.up(); await sleep(page, 300); };
  const can = await pk('.chg-pk.can'); if (can) await click(can);
  const k1 = await ev(() => ({ pts: window.G.state.player.skillPts, k: window.G.state.player.chargePerks, detail: document.querySelector('.chg-dt')?.textContent || '' }));
  R.check('clicking a ready perk buys one rank for one skill point; the detail shows its numbers', can && k1.pts === 3 && k1.k.chomp?.[can[0]] === 1 && /Now|Next|Mastered/.test(k1.detail), JSON.stringify({ can, k1 }));
  const lock = await pk('.chg-pk.locked, .chg-pk.open'); if (lock) await click(lock);
  const k2 = await ev(() => ({ pts: window.G.state.player.skillPts, gate: [...document.querySelectorAll('.chg-gate')].map(e => e.textContent) }));
  R.check('a gated perk refuses (no point spent) and shows its level gate', lock && k2.pts === 3 && k2.gate.some(g => /Lv \d+/.test(g)), JSON.stringify({ lock, k2 }));
  const chip = await ev(() => { const c = document.querySelector('.node[data-id="dig"] .nd-chg'); const b = c?.getBoundingClientRect(); return b && [0, b.x + b.width / 2, b.y + b.height / 2]; });
  if (chip) await click(chip);
  const k3 = await ev(() => ({ id: window.G.ui.panels.skills.chg.id, pts: window.G.state.player.skillPts, dig: window.G.state.player.skills.dig, sel: !!document.querySelector('.node[data-id="dig"] .nd-chg.sel') }));
  R.check('the ⚡ chip on Helmet Splitter shows its charge in the drawer (without learning the skill)', k3.id === 'dig' && k3.pts === 3 && k3.dig === 3 && k3.sel, JSON.stringify(k3));
  const nb = await ev(() => { const n = document.querySelector('.node[data-id="chomp"]'); const b = n.getBoundingClientRect(); return [0, b.x + b.width / 2, b.y + 8]; });
  await page.mouse.move(nb[1], nb[2]); await sleep(page, 500);
  const tip = await ev(() => document.querySelector('.tt-sect.chg')?.textContent || '');
  R.check('the skill tooltip has a "Hold to charge" section with each stage\'s numbers', /Hold to charge/.test(tip) && /Ⅰ/.test(tip) && /Ⅲ/.test(tip), tip.slice(0, 160));

  // ================================================================ f) a charged dash never leaves the walkable floor
  const dashCase = async (label, qs) => {
    await boot(page, qs);
    if (/region=/.test(qs)) await page.waitForFunction(() => window.G.mode === 'dungeon' && window.G.world?.walkable, null, { timeout: 30000 });
    else { await ev(() => { window.G.state.flags.burrowTut = true; window.G.enterDungeon(2); }); await waitMode(page, 'dungeon'); }
    await sleep(page, 600);
    await learn({ skills: { zoom: 12 }, hotbar: [null, null, 'zoom'], perks: { zoom: { stages: 2, pingpong: 1, afterimage: 1 } } });
    // stand 2–5 m from an edge (a wall, a cliff, a door, the region's bounds) and dash at it
    const at = await ev(() => {
      const G = window.G, P = G.player, W = G.world, ok = (x, z) => W.walkable(x, z) && !W.collision.solidAt(x, z, 0.35);
      for (const m of G.combat.entities) if (m !== P && m.team !== 'ally' && m.pos) { m.status && (m.status.stun = 999); }
      for (let ring = 0; ring < 30; ring++) for (let k = 0; k < 24; k++) {
        const a0 = k / 24 * Math.PI * 2, x = P.pos.x + Math.cos(a0) * ring, z = P.pos.z + Math.sin(a0) * ring;
        if (!ok(x, z)) continue;
        for (let j = 0; j < 16; j++) {
          const a = j / 16 * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a);
          let open = 0; while (open < 12 && ok(x + dx * open, z + dz * open)) open += 0.25;
          if (open >= 2 && open <= 5) { P.setPos(x, z); G.engine.rig.focus.copy(P.pos); G.engine.rig.snap?.(); window.__dash = { dx, dz, open }; return { x, z, dx, dz, open }; }
        }
      }
      return null;
    });
    if (!at) { R.check(`${label}: found an edge to dash at`, false, 'no edge found'); return; }
    const xy2 = await ev(({ dx, dz }) => { const G = window.G, P = G.player, p = P.pos.clone(); p.x += dx * 10; p.z += dz * 10; p.y = 0.3; const v = p.project(G.engine.camera); return [(v.x * 0.5 + 0.5) * innerWidth, (-v.y * 0.5 + 0.5) * innerHeight]; }, at);
    await page.mouse.move(Math.max(5, Math.min(1275, xy2[0])), Math.max(5, Math.min(715, xy2[1])));
    await ev(() => { const G = window.G, P = G.player, W = G.world; window.__bad = []; (function f() { if (!W.walkable(P.pos.x, P.pos.z) || W.collision.solidAt(P.pos.x, P.pos.z, 0.05)) window.__bad.push([P.pos.x.toFixed(2), P.pos.z.toFixed(2)]); if (!window.__stopWatch) requestAnimationFrame(f); })(); });
    await page.keyboard.down('1');
    await page.waitForFunction(() => (window.G.skills.charge.active?.stage || 0) >= 3, null, { timeout: 8000 });
    await page.keyboard.up('1'); await sleep(page, 2600);
    // a long frame: the dash moves 0.3 s at a time (6.6 m steps) — it must still stop at the edge
    const slow = await ev(({ dx, dz }) => {
      const G = window.G, P = G.player, W = G.world, bad = [];
      const { r } = { r: 0 };
      P.dash = { dir: new G.THREE.Vector3(dx, 0, dz), left: 20, speed: 22, hit: new Set(), p: { width: 1.2, dmgPct: 1 } };
      for (let i = 0; i < 5 && P.dash; i++) { G.skills.update(0.3, { holding: () => false }); if (!W.walkable(P.pos.x, P.pos.z) || W.collision.solidAt(P.pos.x, P.pos.z, 0.05)) bad.push([P.pos.x, P.pos.z]); }
      P.dash = null; P.invuln = false;
      return { bad, ok: W.walkable(P.pos.x, P.pos.z) };
    }, at);
    const res = await ev(async () => { window.__stopWatch = true; const G = window.G, P = G.player, W = G.world; const { navFor } = await import('/src/core/nav.js'); const nav = navFor(W); return { bad: window.__bad, walk: W.walkable(P.pos.x, P.pos.z), solid: W.collision.solidAt(P.pos.x, P.pos.z, 0.05), nav: nav ? nav.walkAt(P.pos.x, P.pos.z) : true, casts: window.__casts?.length }; });
    R.check(`${label}: a fully charged Flash Draw (Return Stroke, Afterimage) at an edge ${at.open.toFixed(1)} m away never leaves the walkable floor, even on a 0.3 s frame`, !res.bad.length && res.walk && !res.solid && res.nav && !slow.bad.length && slow.ok, JSON.stringify({ at, res, slow }));
  };
  await dashCase('the Burrow', 'fresh&nointro');
  await dashCase('a region (Bamboo)', 'fresh&nointro&region=bamboo');

  // ================================================================ g) the guide
  await boot(page, `fresh&nointro&tut&hour=${HOUR}`);
  await ev(() => { const G = window.G; G.sim.tickT = -1e9; window.__freeze = setInterval(() => { G.sim.tickT = -1e9; }, 200); G.state.flags.hints = { garden: 1, build: 1, travel: 1, skills: 1, stats: 1, loot: 1, potion: 1 }; const T = (G.state.flags.tutorials ||= {}); for (const id of ['house', 'switch', 'fishing', 'makeHome', 'remodel']) T[id] = { done: true }; G.state.flags.burrowTut = true; });
  const stepIs = (step, timeout = 15000) => page.waitForFunction(step => window.G.tutorials.active === 'charge' && window.G.tutorials.cur?.step?.id === step && window.G.tutorials.cur.entered && !window.G.tutorials.paused, step, { timeout });
  await stepIs('hold', 20000); await sleep(page, 600);
  const g0 = await ev(() => ({ say: document.querySelector('.tut .to-say, .tut-say, .tut .say')?.textContent || window.G.tutorials.ui?.lastSay || '', obj: document.querySelector('.tut .to-obj, .tut-obj')?.textContent || '' }));
  await page.mouse.move(640, 420); await sleep(page, 200);
  await page.mouse.down({ button: 'right' }); await sleep(page, 70); await page.mouse.up({ button: 'right' }); await sleep(page, 700);
  const g1 = await ev(() => window.G.tutorials.cur?.step?.id);
  await page.mouse.down({ button: 'right' }); await page.waitForFunction(() => (window.G.skills.charge.active?.stage || 0) >= 1, null, { timeout: 8000 }); await sleep(page, 80); await page.mouse.up({ button: 'right' });
  await stepIs('perks'); await sleep(page, 500);
  await page.keyboard.press('KeyK'); await stepIs('card'); await sleep(page, 700);
  const g2 = await ev(() => ({ open: window.G.ui.isOpen('skills'), drawer: !!document.querySelector('.p-skills .chg-drawer:not([hidden])') }));
  await ev(() => document.querySelector('.to-ok')?.click()); await stepIs('wrap'); await sleep(page, 400);
  await ev(() => document.querySelector('.to-ok')?.click()); await sleep(page, 800);
  const g3 = await ev(() => ({ active: window.G.tutorials.active, rec: window.G.state.flags.tutorials.charge }));
  R.check('the "Hold to power up!" guide: starts back in town after the Burrow; a tap doesn\'t pass the hold step, a Stage Ⅰ release does; then K → the Charge card; done', g1 === 'hold' && g2.open && g2.drawer && !g3.active && g3.rec?.done, JSON.stringify({ g0, g1, g2, g3 }));

  // ================================================================ h) perf: a burst of fully charged releases
  await fight('moka', 3);
  await learn({ skills: { meteor: 12, mallards: 12, greatWave: 12, constellation: 12 }, perks: Object.fromEntries(['meteor', 'mallards', 'greatWave', 'constellation'].map(id => [id, { stages: 2, focus: 2, shower: 1, loop: 1, tsunami: 1, chart: 1, dipper: 1 }])) });
  const burst = staged => ev(async staged => {
    const G = window.G, P = G.player, pl = G.state.player; pl.stats.ene = 900; G.actions.recompute(); G.actions.restoreAll();
    const ms = G.dungeon.monsters.filter(m => m.alive);
    if (ms.length < 14) G.dungeon.summonAround({ pos: P.pos }, 'mochi', 14 - ms.length);
    const all = G.dungeon.monsters.filter(m => m.alive).slice(0, 16);
    all.forEach((m, i) => { const a = i / all.length * Math.PI * 2, r = 3 + (i % 3); m.pos.set(P.pos.x + Math.cos(a) * r, 0, P.pos.z + Math.sin(a) * r); m.lifeMax = m.life = 1e7; m.status.stun = 99; });
    const dts = []; let last = performance.now(), on = true;
    (function f() { const n = performance.now(); dts.push(n - last); last = n; if (on) requestAnimationFrame(f); })();
    const c = staged ? { stage: 3 } : undefined, at = all[0].pos.clone();
    const go = id => { G.skills.cds = {}; P.anim.stop(); G.actions.restoreAll(); G.skills.tryCast(id, at, all[0], c); };
    go('meteor'); await new Promise(r => setTimeout(r, 500)); go('mallards'); await new Promise(r => setTimeout(r, 500)); go('greatWave'); await new Promise(r => setTimeout(r, 500)); go('constellation');
    await new Promise(r => setTimeout(r, 2500)); on = false;
    const s = dts.slice(2).sort((a, b) => a - b);
    return { n: s.length, p50: Math.round(s[s.length >> 1]), p95: Math.round(s[Math.floor(s.length * 0.95)]), max: Math.round(s[s.length - 1]) };
  }, staged);
  await burst(true); await sleep(page, 1500); // (warm-up: every shader and pool in use once)
  const tap = await burst(false); await sleep(page, 1500);
  const chg = await burst(true);
  console.log('perf burst (frame ms): tapped', JSON.stringify(tap), '· charged Ⅲ', JSON.stringify(chg));
  R.check(`perf: a burst of fully charged Ⅲ releases (Meteor + shower, Mallards + loop, Tsunami, Big Dipper) frames like the tapped burst (p95 ${chg.p95} ms vs ${tap.p95} ms, max ${chg.max} ms)`, chg.p95 <= Math.max(40, tap.p95 * 1.6) && chg.max < 250, JSON.stringify({ tap, chg }));
  } // (S19_ONLY=i: only section i)

  // ================================================================ i) R-16: the drawer's skill strip, by every input
  // The owner (2026-10-09): "I can't use the charge tree on anything but default attack. That window can't change." By
  // real input, the drawer is switched to a skill that isn't its tree's default and a perk is bought there: the mouse
  // (here, 1280×720), fingers on a phone and an iPad (their own browsers), and the pad.
  const until = (f, a, timeout = 4000, pg = page) => pg.waitForFunction(f, a, { timeout, polling: 'raf' }).then(() => true, () => false);
  const boxOf = (sel, pg = page) => pg.evaluate(sel => { const e = [...document.querySelectorAll(sel)].find(x => x.getBoundingClientRect().width > 1); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2, w: b.width, h: b.height, t: b.top, b: b.bottom }; }, sel);
  const drawer = (pg = page) => pg.evaluate(() => {
    const S = window.G.ui.panels.skills, pl = window.G.state.player, d = document.querySelector('.chg-drawer');
    return { id: S.chg.id, tree: S.tree, name: document.querySelector('.chg-name')?.textContent, sub: document.querySelector('.chg-sub')?.textContent, pts: pl.skillPts, skills: { ...pl.skills }, perks: JSON.parse(JSON.stringify(pl.chargePerks || {})),
      strip: [...document.querySelectorAll('.chg-pick .chg-sk')].map(b => b.dataset.k + (b.classList.contains('sel') ? '*' : '') + (b.classList.contains('unl') ? '-' : '') + (b.querySelector('.chg-skn:not([hidden])')?.textContent || '')),
      label: document.querySelector('.chg-plt')?.textContent, tip: !!window.G.ui.tip.on, chipSel: document.querySelector('.p-skills .nd-chg.sel')?.closest('.node')?.dataset.id || null, open: !!d?.classList.contains('m-open'),
      pop: !!document.querySelector('.pop-wrap.show'), hot: [...pl.hotbar] };
  });
  const seed = (pg = page) => pg.evaluate(() => { const G = window.G, pl = G.state.player; pl.lvl = 14; pl.skillPts = 6; Object.assign(pl.skills, { chomp: 6, whirl: 3, dig: 3 }); pl.chargePerks = {}; G.state.flags.hints = { all: true }; G.actions.recompute(); });
  const shown = (id, pg = page) => until(id => window.G.ui.panels.skills.chg.id === id && !document.querySelector('.chg-drawer.swap'), id, 4000, pg); // (and its content's slide-in done)
  const settled = (pg = page) => until(() => window.G.ui.isOpen('skills') && !document.querySelector('.pw.opening, .pw.closing') && document.querySelectorAll('.chg-pick .chg-sk').length > 0, null, 4000, pg); // (the panel's open spring done)
  // a target at rest: the same box two frames running and nothing finite animating it or its ancestors (the popover's
  // pop-in moves its slots ~70 px; measured on its first frame, a click lands outside and closes it)
  const steady = (sel, pg = page) => until(sel => {
    const e = [...document.querySelectorAll(sel)].find(x => x.getBoundingClientRect().width > 1); if (!e) return false;
    const r = e.getBoundingClientRect(), k = sel + [r.x, r.y, r.width, r.height].map(v => v.toFixed(1)).join();
    const moving = document.getAnimations().some(a => a.playState === 'running' && a.effect?.getTiming?.().iterations !== Infinity && a.effect?.target?.contains?.(e));
    const ok = !moving && window.__steady === k; window.__steady = k; return ok;
  }, sel, 4000, pg);
  const mclick = async (sel, o = {}) => { await steady(sel); const b = await boxOf(sel); if (!b) return null; await page.mouse.move(b.x + (o.dx || 0), b.y + (o.dy || 0), { steps: 3 }); await page.mouse.down({ button: o.button || 'left' }); await page.mouse.up({ button: o.button || 'left' }); return b; };
  // -------- the mouse
  await boot(page, `fresh&nointro&notut&hour=${HOUR}`); await seed();
  await page.mouse.move(1200, 360); await page.keyboard.press('KeyK');
  await settled();
  const m0 = await drawer();
  R.check('R-16 mouse: the Charge drawer leads with "Choose a skill to charge" over a strip of the tree\'s chargeable skills (learned bright, Sakura Storm dimmed, the shown one marked)', m0.id === 'chomp' && m0.strip.join() === 'chomp*,whirl,dig,bonestorm-' && /Choose a skill to charge/.test(m0.label), JSON.stringify(m0));
  const wb = await boxOf('.chg-sk[data-k="whirl"]');
  await page.mouse.move(wb.x, wb.y, { steps: 3 }); await until(() => /Whirlwind/.test(document.querySelector('.chg-plt')?.textContent || ''));
  const lab = (await drawer()).label;
  await page.mouse.down(); await page.mouse.up(); await shown('whirl');
  const m1 = await drawer();
  R.check('…hovering a strip button names it; a click shows that skill (Gale Stance), marks it and rings its ⚡ chip in the tree', /Whirlwind Stance/.test(lab) && m1.id === 'whirl' && m1.name === 'Gale Stance' && m1.strip[1] === 'whirl*' && m1.chipSel === 'whirl', JSON.stringify({ lab, m1 }));
  const wp = await ev(() => document.querySelector('.chg-pk.can')?.dataset.p || null);
  if (wp) { await mclick(`.chg-pk[data-p="${wp}"]`); await until(p => (window.G.state.player.chargePerks?.whirl?.[p] || 0) > 0, wp); }
  const m2 = await drawer();
  R.check('…and a click on a ready perk buys it for Whirlwind Stance: one point, Crescent Chomp untouched, the strip counting it', wp && m2.pts === 5 && m2.perks.whirl?.[wp] === 1 && !m2.perks.chomp && m2.strip[1] === 'whirl*1' && m2.id === 'whirl', JSON.stringify({ wp, m2 }));
  await mclick('.chg-sk[data-k="bonestorm"]'); await shown('bonestorm');
  await mclick('.chg-pk'); await until(() => !!document.querySelector('.chg-pk.deny'), null, 1500); // (the refusal's shake)
  const m3 = await drawer();
  R.check('an unlearned skill previews from the strip ("not learned yet") and its perks refuse: no point spent', m3.id === 'bonestorm' && /not learned yet/.test(m3.sub) && m3.pts === 5 && !m3.perks.bonestorm, JSON.stringify(m3));
  await mclick('.chg-sk[data-k="whirl"]'); await shown('whirl');
  await mclick('.p-skills .sk-tabs .tab[data-t="fetch"]'); await until(() => window.G.ui.panels.skills.tree === 'fetch');
  const f0 = await drawer();
  await mclick('.chg-sk[data-k="ricochet"]'); await shown('ricochet');
  await mclick('.p-skills .sk-tabs .tab[data-t="bone"]'); await until(() => window.G.ui.panels.skills.tree === 'bone');
  const b1 = await drawer();
  await page.mouse.move(1200, 360); await page.keyboard.press('KeyK'); await until(() => !window.G.ui.isOpen('skills'));
  await page.keyboard.press('KeyK'); await settled();
  const b2 = await drawer();
  await mclick('.p-skills .sk-tabs .tab[data-t="fetch"]'); await until(() => window.G.ui.panels.skills.tree === 'fetch');
  const f1 = await drawer();
  R.check('each tree remembers its pick: Fetch Mastery opens on its default, Bone Blade comes back on Whirlwind Stance (after closing and opening K too), Fetch Mastery on Ricochet', f0.id === 'throw' && b1.id === 'whirl' && b2.id === 'whirl' && f1.id === 'ricochet' && f1.strip.some(s => s.startsWith('ricochet*')), JSON.stringify({ f0: f0.id, b1: b1.id, b2: b2.id, f1: f1.id }));
  await mclick('.p-skills .sk-tabs .tab[data-t="bone"]'); await until(() => window.G.ui.panels.skills.tree === 'bone');
  const dig0 = await drawer();
  await mclick('.p-skills .node[data-id="chomp"] .nd-in', { dy: -12 }); await until(() => window.G.state.player.skills.chomp === 7);
  const l1 = await drawer();
  await mclick('.p-skills .node[data-id="dig"] .nd-in', { button: 'right', dy: -12 }); await until(() => !!document.querySelector('.pop-wrap.show .pop-slot'));
  await mclick('.pop-wrap.show .pop-slot[data-i="3"]'); await until(() => window.G.state.player.hotbar[3] === 'dig');
  const a1 = await drawer();
  R.check('learning a skill shows it in the drawer (a point in Crescent Chomp), and so does assigning one (Helmet Splitter to slot 2)', dig0.id === 'whirl' && l1.skills.chomp === 7 && l1.id === 'chomp' && a1.hot[3] === 'dig' && a1.id === 'dig', JSON.stringify({ was: dig0.id, learned: l1.id, chomp: l1.skills.chomp, assigned: a1.id, hot: a1.hot }));
  const wc = await boxOf('.p-skills .node[data-id="whirl"] .nd-chg');
  const nb = await boxOf('.p-skills .node[data-id="whirl"] .nd-in');
  await page.mouse.move(nb.x, nb.y - 14, { steps: 3 }); await until(() => window.G.ui.tip.on);
  const tipNode = (await drawer()).tip;
  await page.mouse.move(wc.x, wc.y, { steps: 3 }); await until(() => !window.G.ui.tip.on);
  const tipChip = (await drawer()).tip;
  await page.mouse.down(); await page.mouse.up(); await shown('whirl');
  const c1 = await drawer();
  R.check('the ⚡ chip: the node\'s tooltip (over the drawer) steps aside on it, and a click shows that skill without learning it', tipNode && !tipChip && c1.id === 'whirl' && !c1.tip && c1.skills.whirl === 3, JSON.stringify({ tipNode, tipChip, id: c1.id, whirl: c1.skills.whirl }));
  // the fit: 1280×720 at UI 125 %, every Bone Blade skill (the tallest tree) from the strip: the drawer on the screen, and put
  await ev(() => { const U = window.G.ui; U.setSetting('uiScale', 1.25); U.close('skills'); U.open('skills'); }); await settled();
  const fit = [];
  for (const id of ['chomp', 'whirl', 'dig', 'bonestorm']) {
    await mclick(`.chg-sk[data-k="${id}"]`); await shown(id); await page.mouse.move(1260, 400);
    fit.push(await ev(() => { const d = document.querySelector('.chg-drawer'), r = d.getBoundingClientRect(), t = d.querySelector('.chg-tag').getBoundingClientRect(); return [window.G.ui.panels.skills.chg.id, Math.round(t.top), Math.round(r.bottom), innerHeight, Math.round(d.querySelector('.chg-pick').getBoundingClientRect().top)]; }));
  }
  await ev(() => window.G.ui.setSetting('uiScale', 1));
  R.check('at 1280×720 and UI 125 % the drawer fits the screen for every Bone Blade skill (its tag to its foot) and stays put while the strip switches', fit.every(f => f[1] >= 0 && f[2] <= f[3]) && new Set(fit.map(f => f[4])).size === 1, JSON.stringify(fit));
  // -------- the pad
  await ev(() => window.G.ui.close('skills')); await until(() => !window.G.ui.isOpen('skills'));
  await installPad(page); await padTap(page, 'DUp'); await until(() => window.G.controls.device === 'pad');
  await ev(() => window.G.ui.open('skills')); await settled(); await until(() => !!window.G.ui.padNav.cur);
  await ev(() => window.G.ui.panels.skills.chg.show('chomp'));
  const p0 = await drawer();
  await padTap(page, 'RT'); await until(() => window.G.ui.panels.skills.chg.id !== 'chomp');
  const pR = (await drawer()).id;
  await padTap(page, 'LT'); await until(() => window.G.ui.panels.skills.chg.id === 'chomp');
  const pL = (await drawer()).id;
  await padTap(page, 'LT'); await until(() => window.G.ui.panels.skills.chg.id === 'bonestorm');
  const pW = (await drawer()).id;
  const pHint = await ev(() => window.G.ui.padNav.hintsEl.textContent.replace(/\s+/g, ' '));
  const pCast = await ev(() => ({ charge: !!window.G.skills.charge.active, anim: window.G.player.anim.action?.name || null }));
  R.check('R-16 pad: RT / LT step the drawer through the strip (Crescent Chomp → Whirlwind Stance, back, and round to Sakura Storm); the hints say so; nothing casts', p0.id === 'chomp' && pR === 'whirl' && pL === 'chomp' && pW === 'bonestorm' && /Charge skill/.test(pHint) && !pCast.charge, JSON.stringify({ p0: p0.id, pR, pL, pW, pHint, pCast }));
  const navTo = async (sel, max = 40) => {
    for (let i = 0; i < max; i++) {
      const s = await ev(sel => {
        const c = window.G.ui.padNav.cur, t = [...document.querySelectorAll(sel)].find(e => e.offsetParent && e.getBoundingClientRect().width > 1);
        if (!c || !t) return { err: !c ? 'no focus' : 'no target' };
        if (c === t || c.matches(sel)) return { done: true };
        const a = c.getBoundingClientRect(), b = t.getBoundingClientRect(), dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
        const rowOk = b.top < a.bottom - 2 && b.bottom > a.top + 2, colOk = b.left < a.right - 2 && b.right > a.left + 2;
        const across = rowOk || (!colOk && Math.abs(dx) > Math.abs(dy)); // (the farther way first: from the tree into the drawer is across)
        return { dir: across ? (dx > 0 ? 'DRight' : 'DLeft') : (dy > 0 ? 'DDown' : 'DUp') };
      }, sel);
      if (s.done) return true; if (s.err) return false;
      await ev(() => { window.__navWas = window.G.ui.padNav.cur; });
      await padTap(page, s.dir, 30);
      if (await ev(() => window.G.ui.padNav.cur === window.__navWas)) { for (const d of (s.dir === 'DLeft' || s.dir === 'DRight' ? ['DUp', 'DDown'] : ['DRight', 'DLeft'])) { await padTap(page, d, 30); if (!(await ev(() => window.G.ui.padNav.cur === window.__navWas))) break; } }
    }
    return false;
  };
  const onDig = await navTo('.chg-sk[data-k="dig"]');
  const digHint = await ev(() => window.G.ui.padNav.hintsEl.textContent.replace(/\s+/g, ' '));
  await padTap(page, 'A'); await shown('dig');
  const p1 = await drawer();
  const onPk = await navTo('.chg-pk.can'), dp = await ev(() => window.G.ui.padNav.cur?.dataset.p || null);
  await padTap(page, 'A'); await until(p => (window.G.state.player.chargePerks?.dig?.[p] || 0) > 0, dp);
  const p2 = await drawer();
  R.check('…the focus reaches the strip ("Show its perks"): A on Helmet Splitter shows it, and A on a ready perk buys it there (one point)', onDig && /Show its perks/.test(digHint) && p1.id === 'dig' && onPk && dp && p2.perks.dig?.[dp] === 1 && p2.pts === p1.pts - 1 && p2.strip[2] === 'dig*1', JSON.stringify({ onDig, digHint, p1: p1.id, onPk, dp, perks: p2.perks, pts: [p1.pts, p2.pts] }));
  const onNode = await navTo('.p-skills .node[data-id="whirl"]');
  await until(() => window.G.ui.tip.on, null, 1500);
  const tipN = (await drawer()).tip;
  await padTap(page, 'X'); await shown('whirl');
  const p3 = await drawer();
  R.check('…X on a skill node shows its charge, and its tooltip steps aside so the drawer shows', onNode && tipN && p3.id === 'whirl' && !p3.tip, JSON.stringify({ onNode, tipN, id: p3.id, tip: p3.tip }));
  await padReset(page); await ev(() => window.G.ui.close('skills'));
  // -------- touch: a phone (the drawer a sheet over the tree) and an iPad (docked, as on the desktop)
  for (const [dname, dev] of [['phone', PHONE], ['iPad', IPAD]]) {
    const T = await launchTouch(dev), tp = T.page, F = T.F, tev = (f, a) => tp.evaluate(f, a);
    const tapSel = async (sel, dy = 0) => { await steady(sel, tp); const b = await boxOf(sel, tp); if (b) { b.under = await tev(([x, y]) => { const e = document.elementFromPoint(x, y); return (e?.className?.baseVal ?? e?.className) || e?.tagName || null; }, [b.x, b.y + dy]); await F.tap(b.x, b.y + dy); } return b; };
    const phone = dname === 'phone', sheet = open => until(o => document.querySelector('.chg-drawer').classList.contains('m-open') === o, open, 4000, tp);
    try {
      await boot(tp, `fresh&nointro&notut&hour=${HOUR}`); await seed(tp);
      await F.tap(dev.w / 2, dev.h / 2); await until(() => window.G.controls.device === 'touch', null, 4000, tp);
      await tev(() => window.G.ui.open('skills')); await settled(tp);
      if (phone) { await tapSel('.chg-drawer .chg-tag'); await sheet(true); }
      const sizes = await tev(() => [...document.querySelectorAll('.chg-pick .chg-sk')].map(b => { const r = b.getBoundingClientRect(); return Math.round(Math.min(r.width, r.height) * 10) / 10; }));
      const tw = await tapSel('.chg-sk[data-k="whirl"]'); await shown('whirl', tp);
      const t1 = await drawer(tp);
      const tpk = await tev(() => document.querySelector('.chg-pk.can')?.dataset.p || null);
      if (tpk) { await tapSel(`.chg-pk[data-p="${tpk}"]`); await until(p => (window.G.state.player.chargePerks?.whirl?.[p] || 0) > 0, tpk, 4000, tp); }
      const t2 = await drawer(tp);
      R.check(`R-16 touch (${dname}): the strip's buttons are 44 px or more; a tap on Whirlwind Stance shows it, and a tap on a ready perk buys it there`, sizes.length === 4 && Math.min(...sizes) >= 44 && t1.id === 'whirl' && tpk && t2.perks.whirl?.[tpk] === 1 && t2.pts === 5 && !t2.perks.chomp && (!phone || t2.open), JSON.stringify({ sizes, id: t1.id, tapped: tw && [Math.round(tw.x), Math.round(tw.y), tw.under], tpk, perks: t2.perks, pts: t2.pts, open: t2.open }));
      // a press held past the long-press time on a strip button (nothing to show) is still its tap (a slow frame, a slow finger)
      await steady('.chg-sk[data-k="bonestorm"]', tp); const hb = await boxOf('.chg-sk[data-k="bonestorm"]', tp);
      if (hb) { await F.down(9, hb.x, hb.y); await tp.waitForTimeout(560); await F.up(9); } // (the hold is the input itself)
      const held = await shown('bonestorm', tp);
      R.check(`…(${dname}) a strip button held 0.56 s (past the 0.43 s long press, with no tooltip to show) still switches the drawer`, held, JSON.stringify({ id: (await drawer(tp)).id }));
      // the ⚡ chip: a tap just above its visible box lands in its hit area (it shows that skill, learns nothing)
      if (phone) { await tapSel('.chg-drawer .chg-tag'); await sheet(false); }
      const ch = await boxOf('.p-skills .node[data-id="dig"] .nd-chg', tp), cy = ch ? ch.t - 8 : 0;
      const hit = ch && await tev(([x, y]) => !!document.elementFromPoint(x, y)?.closest('.nd-chg'), [ch.x, cy]);
      const s0 = await drawer(tp);
      if (ch) { await F.tap(ch.x, cy); await shown('dig', tp); }
      const s1 = await drawer(tp);
      R.check(`…(${dname}) the ⚡ chip (${ch ? Math.round(ch.w) + '×' + Math.round(ch.h) : '?'} px) takes a finger 8 px above its box, in its hit area: it shows Helmet Splitter${phone ? ' in the opened sheet' : ''} and learns nothing`, hit && s1.id === 'dig' && s1.skills.dig === s0.skills.dig && s1.pts === s0.pts && (!phone || s1.open), JSON.stringify({ ch, hit, id: s1.id, dig: [s0.skills.dig, s1.skills.dig], pts: [s0.pts, s1.pts], open: s1.open }));
      // a double-tap on a learned node: the assign popover, and one level learned, not two
      if (phone) { await tapSel('.chg-drawer .chg-tag'); await sheet(false); }
      const nd = await boxOf('.p-skills .node[data-id="chomp"] .nd-in', tp);
      const d0 = await drawer(tp);
      if (nd) { await F.tap(nd.x + 6, nd.y - 8); await F.tap(nd.x + 6, nd.y - 8); await until(() => !!document.querySelector('.pop-wrap.show'), null, 4000, tp); }
      const d1 = await drawer(tp);
      R.check(`…(${dname}) a double-tap on a learned node opens the assign popover and learns one level, not two; the drawer shows it`, d1.pop && d1.skills.chomp === d0.skills.chomp + 1 && d1.id === 'chomp', JSON.stringify({ chomp: [d0.skills.chomp, d1.skills.chomp], pop: d1.pop, id: d1.id }));
      await tp.screenshot({ path: `tools/qa/tmp/r16/s19-${dname}.png` }).catch(() => {});
    } catch (e) { errors.push(`[${dname}] ` + e.stack); }
    for (const e of T.errors) errors.push(`[${dname}] ${e}`);
    await T.browser.close();
  }
} catch (e) { errors.push('[harness] ' + e.stack); }
const failed = R.finish(errors, warns);
await browser.close();
process.exit(failed ? 1 : 0);
