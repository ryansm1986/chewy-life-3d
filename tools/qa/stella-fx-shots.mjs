// Stella's effects at the game camera (docs/STELLA.md §4: sunlight, never flames; nothing washes the screen out): a real
// fight against a pack of 18 closing in, each of her actives cast into it at level 30 / skill 12 and frozen at its moment.
//   node tools/qa/stella-fx-shots.mjs [--world depths|tidepool] [--hour 22.5] [--stage 3] [--only a,b,all] [--dev desktop|deck]
//     [--out dir] [--qs k=v]   (--dev phone | ipad: a touch browser at that size)
//  depths: the Bamboo Depths B1F (a zone dungeon); any region id (bamboo, maple, tidepool, onsen: the Onsen is night, where
//  a bright light reads brightest; a region's light is its own mood, not the clock). --stage 3: the charged releases with every perk. `all`: a
//  readability shot with her whole kit going at once. Writes tools/qa/tmp/stella-fx/<world>-<hour>-<name>.png (gitignored).
import { launch, boot, sleep } from './lib.mjs';
import { launchTouch, PHONE, IPAD } from './touch-lib.mjs';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2), val = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const OUT = val('--out') || 'tools/qa/tmp/stella-fx', WORLD = val('--world') || 'depths', HOUR = val('--hour'), STAGE = +(val('--stage') || 0), DEV = val('--dev') || 'desktop';
const ONLY = val('--only') ? val('--only').split(',') : null, QS = val('--qs') ? '&' + val('--qs') : '';
fs.mkdirSync(OUT, { recursive: true });
const tag = `${WORLD}${HOUR ? '-' + HOUR : ''}${STAGE ? '-c' + STAGE : ''}${DEV === 'desktop' ? '' : '-' + DEV}`;
const { browser, page, errors } = DEV === 'phone' || DEV === 'ipad' ? await launchTouch(DEV === 'phone' ? PHONE : IPAD) : await launch(DEV === 'deck' ? { w: 1280, h: 800 } : { w: 1920, h: 1080 });
const shot = async name => { const f = path.join(OUT, `${tag}-${name}.png`); await page.screenshot({ path: f }); console.log('saved', f); };
// [shot name, skill, when to freeze: seconds after the cast, or 'action:u' (her action at that progress), reps]
const PLAN = [
  ['attack-sweep', 'attack', 'parasolSweep1:0.55'], ['attack-twirl', 'attack', 'parasolTwirl:0.6', 3],
  ['goldenRay', 'goldenRay', 'parasolAim:0.5'], ['glint', 'glint', 'parasolGlint:0.45'], ['prism', 'prism', 'parasolAim:0.5'],
  ['solarRay', 'solarRay', 1.2], ['sundial', 'sundial', 1.6],
  ['solarFlare', 'solarFlare', 'parasolRaise:0.56'], ['skippingSun', 'skippingSun', 0.75], ['sunspot', 'sunspot', 1.2],
  ['littleSun', 'littleSun', 1.4], ['risingSun-rise', 'risingSun', 0.9], ['risingSun', 'risingSun', 1.38],
  ['morningLight', 'morningLight', 'parasolRaise:0.62'], ['kindLight', 'kindLight', 'parasolAim:0.55'], ['halo', 'halo', 1.0],
  ['sunDog', 'sunDog', 1.2], ['daybreak', 'daybreak', 1.4],
].filter(x => !ONLY || ONLY.includes(x[0]));
try {
  await boot(page, `fresh&nointro&notut&noarrive&hero=stella${HOUR ? '&hour=' + HOUR : ''}${DEV === 'deck' ? '&deck' : ''}${QS}`);
  await sleep(page, 1200);
  await page.evaluate(async ([world, stage]) => {
    const G = window.G, P = G.state.player, { SKILLS } = await import('/src/rpg/skills.js'), { CHARGE } = await import('/src/rpg/charge.js');
    P.lvl = 30; P.stats = { str: 20, dex: 30, vit: 200, ene: 300 }; P.statPts = 0;
    for (const id of Object.keys(SKILLS)) if (SKILLS[id].cls === 'stella') P.skills[id] = 12;
    if (stage) { P.chargePerks = {}; for (const id in CHARGE) if (SKILLS[id].cls === 'stella') P.chargePerks[id] = Object.fromEntries(Object.entries(CHARGE[id].perks).map(([k, q]) => [k, q.ranks])); }
    G.actions.recompute(); G.actions.restoreAll?.(); G.actions.addXp = () => {};
    G.state.flags.burrowTut = true;
    if (world !== 'depths') G.enterRegion(world); else G.enterDungeon({ id: 'bambooDepths', floor: 1 }); // (a region by id: the Onsen is the night one)
  }, [WORLD, STAGE]);
  await page.waitForFunction(() => window.G?.mode === 'dungeon' && window.G.dungeon?.monsters && !window.G.ui?.iris?.active, null, { timeout: 40000 });
  await sleep(page, 2000);
  await page.evaluate(() => {
    const G = window.G, D = G.dungeon, P = G.player, KINDS = [...new Set(D.monsters.filter(m => !m.def.boss).map(m => m.id))].filter(Boolean).slice(0, 6);
    const { f: cf, r: cr } = G.engine.rig.groundAxes(), L = Math.hypot(cr.x + 0.6 * cf.x, cr.z + 0.6 * cf.z), f = { x: (cr.x + 0.6 * cf.x) / L, z: (cr.z + 0.6 * cf.z) / L };
    const cl = (x, z, R) => { for (let r = 0; r <= R; r += 1) for (let a = 0; a < 6.283; a += 0.6) { const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r; if (!G.world.walkable(px, pz) || G.world.collision?.solidAt?.(px, pz, 0.3)) return false; } return true; };
    let home = null;
    for (let d = 8; d <= 70 && !home; d += 3) for (let a = 0; a < 6.283 && !home; a += 0.3) { const x = P.pos.x + Math.cos(a) * d, z = P.pos.z + Math.sin(a) * d; if (cl(x, z, 7) && cl(x + f.x * 5, z + f.z * 5, 4)) home = new P.pos.constructor(x, G.world.heightAt(x, z), z); }
    window.__pack = { dir: f, home: home || P.pos.clone(), list: [] };
    const lvl = D.layout?.mlvl || D.mlvl || 8;
    for (let i = 0; i < 18; i++) { const m = D.spawnMonster(KINDS[i % KINDS.length], { level: lvl, rank: i === 5 ? 'champion' : 'normal', variant: i % 3, x: P.pos.x, z: P.pos.z }); if (m) { m.lifeMax = m.life = m.lifeMax * 30; window.__pack.list.push(m); } }
    for (const m of D.monsters) if (m.alive && !window.__pack.list.includes(m) && Math.hypot(m.pos.x - window.__pack.home.x, m.pos.z - window.__pack.home.z) < 30) { m.pos.x += 80; m.aggro = false; }
    window.__regroup = (spread = 1) => {
      const K = window.__pack, P2 = G.player, S = G.companion; G.engine.timeScale = 1;
      G.skills.clearStella?.(); if (G.skills.channel) G.skills.endChannel();
      P2.setPos(K.home.x, K.home.z); P2.pos.y = G.world.heightAt(P2.pos.x, P2.pos.z); P2.facing = P2.faceTarget = Math.atan2(K.dir.x, K.dir.z);
      if (S) { S.setPos(K.home.x - K.dir.z * 1.1 - K.dir.x * 0.4, K.home.z + K.dir.x * 1.1 - K.dir.z * 0.4); S.fainted = 0; S.untargetable = false; S.life = S.lifeMax * 0.5; S.anim.stop(); }
      K.list.forEach((m, i) => { if (!m.alive) return; const a = (i * 2.4) % 6.283, r = (0.4 + Math.sqrt(i / 18) * 2.6) * spread, d = 5.2; m.pos.set(K.home.x + K.dir.x * d + Math.cos(a) * r, m.pos.y, K.home.z + K.dir.z * d + Math.sin(a) * r); m.life = m.lifeMax; m.aggro = true; m.status = {}; m.knock?.set?.(0, 0, 0); });
      G.actions.restoreAll?.(); G.actions.damage(G.derived.lifeMax * 0.45); G.skills.cds = {}; G.state.player.zoom = null;
      G.engine.rig.focus.set(P2.pos.x + K.dir.x * 2.2, P2.pos.y, P2.pos.z + K.dir.z * 2.2); G.engine.rig.distTarget = +(window.__dist || 15); G.engine.rig.snap();
    };
    window.__center = () => { const K = window.__pack; let x = 0, z = 0, n = 0; for (const m of K.list) if (m.alive) { x += m.pos.x; z += m.pos.z; n++; } return n ? new P.pos.constructor(x / n, P.pos.y, z / n) : P.pos.clone(); };
    window.__cast = (id, stage) => {
      const P2 = G.player, c = window.__center(), K = window.__pack, near = K.list.filter(m => m.alive).sort((a, b) => a.pos.distanceTo(P2.pos) - b.pos.distanceTo(P2.pos))[0];
      G.state.player.zoom = null; G.skills.cds = {}; if (P2.anim.busy()) P2.anim.stop();
      const area = ['solarFlare', 'sunspot', 'risingSun'].includes(id);
      return G.skills.tryCast(id, area ? c : near.pos.clone(), area ? null : near, stage ? { stage } : undefined);
    };
    // (Solar Ray is a channel held on its key: here it holds while window.__holdRay)
    const S = G.skills, u = S.updateSolarRay.bind(S), inp = { holding: k => k === 'solarRay' && window.__holdRay };
    S.updateSolarRay = dt => u(dt, inp);
  });
  for (const [name, id, at, reps] of PLAN) {
    await page.evaluate(() => window.__regroup());
    await sleep(page, 1100);
    await page.evaluate(() => { window.__holdRay = true; });
    for (let i = 0; i < (reps || 1); i++) {
      await page.evaluate(([id, s]) => { window.__ok = window.__cast(id, s); window.__t0 = window.G.engine.time; }, [id, id === 'attack' ? 0 : STAGE]);
      if (i < (reps || 1) - 1) await page.waitForFunction(() => !window.G.player.anim.busy(), null, { timeout: 4000 }).catch(() => {});
    }
    if (typeof at === 'string') await page.waitForFunction(([a, u]) => { const x = window.G.player.anim.action; return x?.name === a && x.t / x.dur >= +u; }, at.split(':'), { timeout: 15000, polling: 'raf' }).catch(() => {});
    else await page.waitForFunction(at => (window.G.engine.time - window.__t0) >= at, at, { timeout: 15000 }).catch(() => {});
    await page.evaluate(() => { window.G.engine.timeScale = 0; });
    await sleep(page, 150);
    await shot(name);
    if (!(await page.evaluate(() => window.__ok))) console.log('cast refused:', name);
    await page.evaluate(() => { window.G.engine.timeScale = 1; window.__holdRay = false; });
  }
  if (!ONLY || ONLY.includes('all')) { // her whole kit at once (readability at the game's own distance)
    await page.evaluate(() => { window.__dist = 18; window.__regroup(1.25); });
    for (const [id, wait] of [['daybreak', 1.2], ['littleSun', 1], ['halo', 0.8], ['sunspot', 0.8], ['risingSun', 0.4], ['solarFlare', 0.6], ['prism', 0.5], ['goldenRay', 0.45]]) { await page.evaluate(([id, s]) => window.__cast(id, s), [id, STAGE]); await sleep(page, wait * 1000); }
    await page.evaluate(() => { window.G.engine.timeScale = 0; }); await sleep(page, 150);
    await shot('all');
    await page.evaluate(() => { window.G.engine.timeScale = 1; window.__dist = 15; });
  }
} catch (e) { errors.push('[harness] ' + e.stack); }
console.log(errors.length ? 'ERRORS\n' + errors.slice(0, 10).join('\n') : 'no errors');
await browser.close();
