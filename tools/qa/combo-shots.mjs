// Look review for combo chains (docs/COMBO.md): each hero's finisher at the game camera, shot as it goes and as it lands
// (the flourish must read in the skill's colour and never wash the screen out), plus the hotbar's chain pips. Time is
// frozen (engine.timeScale = 0) a few frames after each moment, so the short effects are caught exactly.
//   node tools/qa/combo-shots.mjs [hero:skill ...]     → tools/qa/tmp/combo-shots/*.png
import { launch, boot, waitMode, sleep } from './lib.mjs';
import { promises as fs } from 'node:fs';
const OUT = 'tools/qa/tmp/combo-shots';
await fs.mkdir(OUT, { recursive: true });
const LIST = process.argv.slice(2).length ? process.argv.slice(2) : ['chewy:chomp', 'chewy:throw', 'moka:splash', 'poe:fumaFlurry', 'shihtzu:glumBonk', 'golden:eagerJabs', 'stella:goldenRay'];
const { browser, page, errors } = await launch({ w: 1280, h: 720 });
for (const pair of LIST) try {
  const [hero, id] = pair.split(':');
  await boot(page, `fresh&nointro${hero !== 'chewy' ? `&hero=${hero}` : ''}`);
  await page.evaluate(() => { window.G.state.flags.burrowTut = true; window.G.enterDungeon(2); });
  await waitMode(page, 'dungeon');
  const at = await page.evaluate(async id => {
    const G = window.G, P = G.player, pl = G.state.player, { SKILLS } = await import('/src/rpg/skills.js');
    pl.lvl = 30; pl.skills[id] = 10; pl.hotbar[1] = id;
    if (SKILLS[id].wep && G.derived.weaponType !== SKILLS[id].wep) { G.actions.swapWeapons(); P.setWeapon(G.derived.weaponType); }
    G.actions.recompute(); G.actions.restoreAll();
    for (const m of G.dungeon.monsters) { m.status.stun = 999; m.pos.set(-999, 0, -999); }
    const { r } = G.engine.rig.groundAxes(), n0 = G.dungeon.monsters.length;
    { const W = G.world, L = G.dungeon.layout, f = { x: -r.z, z: r.x }; // (open floor for the line: as s19 / s59)
      const open = (x, z) => { for (let d = -2; d <= 9.5; d += 0.5) for (const s of [-2.5, -1.25, 0, 1.25, 2.5]) { const px = x + r.x * d + f.x * s, pz = z + r.z * d + f.z * s; if (!W.walkable(px, pz) || W.collision.solidAt(px, pz, 0.5) || !L.at(Math.floor(px / 2), Math.floor(pz / 2))) return false; } return true; };
      if (!open(P.pos.x, P.pos.z)) { let best = null; for (let cy = 2; cy < L.H - 2 && !best; cy++) for (let cx = 2; cx < L.W - 2; cx++) { const x = (cx + 0.5) * 2, z = (cy + 0.5) * 2; if (L.at(cx, cy) && open(x, z)) { best = { x, z }; break; } } if (best) { P.setPos(best.x, best.z); G.engine.rig.focus.copy(P.pos); G.engine.rig.snap(); G.engine.rig.update(0); G.engine.camera.updateMatrixWorld(); } } }
    G.dungeon.summonAround({ pos: P.pos }, 'mochi', 3);
    G.dungeon.monsters.slice(n0).forEach((m, i) => { m.pos.set(P.pos.x + r.x * (1.7 + i * 1.1), 0, P.pos.z + r.z * (1.7 + i * 1.1)); m.lifeMax = m.life = 1e8; m.status.stun = 999; m.speed = 0; });
    window.__land = 0; window.__finT = 0; window.__hitsT = []; { const raw = G.combat.hitMonster.bind(G.combat); G.combat.hitMonster = (m, o) => { window.__hitsT.push([performance.now() | 0, o?.source || 'player', !!G.skills.chain.fin]); return raw(m, o); }; }
    window.__freezeAt = (n) => { let k = 0; const f = () => { if (++k >= n) G.engine.timeScale = 0; else requestAnimationFrame(f); }; requestAnimationFrame(f); };
    G.events.on('combo:finish', () => { window.__finT = performance.now(); if (window.__fz === 'fin') window.__freezeAt(4); }); window.__drops = []; G.events.on('combo:drop', p => window.__drops.push(p.reason + '@' + (performance.now() | 0))); G.events.on('combo:step', p => window.__drops.push('step' + p.step + '@' + (performance.now() | 0))); G.events.on('combo:land', () => { window.__land = performance.now(); if (window.__fz === 'land') window.__freezeAt(window.__fzN || 4); });
    const v = G.dungeon.monsters[n0].pos.clone().setY(0.5).project(G.engine.camera);
    return [(v.x * 0.5 + 0.5) * innerWidth, (-v.y * 0.5 + 0.5) * innerHeight];
  }, id);
  await page.mouse.move(at[0], at[1]);
  for (let i = 0; i < 2; i++) {
    await page.mouse.down({ button: 'right' }); await sleep(page, 45); await page.mouse.up({ button: 'right' });
    await page.waitForFunction(n => window.__drops.filter(d => d.startsWith('step')).length >= n, i + 1, { timeout: 6000 });
    if (i === 1) { await page.waitForFunction(() => window.G.skills.chain.view.on && window.G.skills.chain.view.step === 2, null, { timeout: 6000, polling: 16 }); await sleep(page, 40); await page.screenshot({ path: `${OUT}/${hero}-${id}-0-pips.png` }); }
    await page.waitForFunction(() => !window.G.skills.chain.cur, null, { timeout: 6000, polling: 16 });
  }
  await page.evaluate(() => { window.__fz = 'land'; window.__fzN = 3; });
  await page.mouse.down({ button: 'right' }); await sleep(page, 45); await page.mouse.up({ button: 'right' });
  await page.waitForFunction(() => window.__land > 0 && window.G.engine.timeScale === 0, null, { timeout: 6000, polling: 16 });
  await page.screenshot({ path: `${OUT}/${hero}-${id}-2-land.png` });
  // a few frames later: the ring wide, the stars out
  await page.evaluate(() => { window.G.engine.timeScale = 1; window.__freezeAt(6); });
  await page.waitForFunction(() => window.G.engine.timeScale === 0, null, { timeout: 4000, polling: 16 });
  await page.screenshot({ path: `${OUT}/${hero}-${id}-3-land.png` });
  await page.evaluate(() => { window.G.engine.timeScale = 1; window.__fz = null; });
  console.log(`${pair}: shot`);
} catch (e) { console.log(`${pair}: FAILED ${String(e.message).split(String.fromCharCode(10))[0]}`, await page.evaluate(() => JSON.stringify({ chain: window.G.skills.chain.chain, last: window.G.skills.chain.last, cur: window.G.skills.chain.cur, act: window.G.player.anim.action?.name, wep: window.G.derived.weaponType, hb: window.G.state.player.hotbar, lc: window.G.state.player.lastCast, drops: window.__drops, fin: window.__finT | 0, hits: window.__hitsT.slice(-6), clock: window.G.skills.chain.clock }))); }
if (errors.length) console.log(errors.join('\n'));
await browser.close();
