// The pinnacle look review (docs/ZONES.md §5.3; ROADMAP Z-E4): a Spirit 10 run's boss floor, the Four Seasons in turn, shot
// at the game camera: each season's boss in its fight with its adds called (a big pack in the ring) and, from Summer on,
// an echo of a fallen season in flight. Waits key on game state (the season's boss up and awake, the echo's telegraph
// out), not wall time.
//   node tools/qa/pinnacle-shots.mjs [--dungeon bambooDepths] [--mods swarming] [--tag now] [--hero chewy] [--spirit 10]
// → <SHOT_DIR>/pin_<tag>_<n>_<season>_<what>.png and a line per shot (draw calls, monsters, awake, the echoes so far)
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2), arg = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const dungeon = arg('dungeon', 'bambooDepths'), mods = arg('mods', ''), tag = arg('tag', 'now'), hero = arg('hero', 'chewy'), spirit = +arg('spirit', 10);
const OUT = process.env.SHOT_DIR || path.resolve('tools/qa/out/pinnacle');
fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE || 'http://localhost:5173';
const browser = await chromium.launch({ executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.routeWebSocket(/.*/, ws => { ws.onMessage(() => {}); });
const logs = [];
page.on('console', m => { if (m.type() === 'error') logs.push('[error] ' + m.text()); });
page.on('pageerror', e => logs.push('[pageerror] ' + e.message + '\n' + (e.stack || '').split('\n').slice(1, 4).join('\n')));
const ev = (fn, a) => page.evaluate(fn, a);
const wait = (fn, a, timeout = 30000) => page.waitForFunction(fn, a, { timeout });
let n = 0;
const shot = async (season, what) => {
  const r = await ev(async () => {
    const G = window.G, R = G.engine.renderer, D = G.dungeon, pin = D.tr?.pin; R.info.autoReset = false; R.info.reset();
    await new Promise(q => requestAnimationFrame(() => requestAnimationFrame(q)));
    const o = { calls: R.info.render.calls, n: D.monsters.length, awake: D.monsters.filter(m => m.aggro).length, boss: D.boss?.id, life: D.boss ? Math.round(100 * D.boss.life / D.boss.lifeMax) : null, echoes: pin && JSON.stringify(pin.stats.echoes), spirits: pin?.statues.length };
    R.info.autoReset = true; return o;
  });
  const f = path.join(OUT, `pin_${tag}_${++n}_${season}_${what}.png`);
  await page.screenshot({ path: f });
  console.log(`${season} ${what}: ${JSON.stringify(r)} → ${f}`);
};
try {
  await page.goto(`${BASE}/?fresh&nointro&notut&hour=10&dseed=3&hero=${hero}`, { waitUntil: 'load' });
  await wait(() => window.__ready === true && window.G?.player && window.G.tierDebug, null, 60000);
  await ev(({ dungeon, mods, spirit }) => {
    const G = window.G, P = G.state.player; G.state.flags.burrowTut = true; P.lvl = 60; P.stats = { str: 140, dex: 140, vit: 400, ene: 200 }; G.actions.recompute();
    G.tierDebug.clearAll(5); G.tierDebug.run(dungeon, 5, mods ? mods.split(',') : [], spirit, 2);
  }, { dungeon, mods, spirit });
  await wait(() => window.G?.mode === 'dungeon' && window.G.dungeon?.tr?.pin && window.G.dungeon.boss && !window.G.ui?.iris?.active, null, 90000);
  await ev(() => { const G = window.G, P = G.player; P.invuln = true; clearInterval(window.__inv); window.__inv = setInterval(() => { P.invuln = true; G.actions.restoreAll?.(); }, 250); });
  // into the ring, a few metres in from the mouth (the seal rises, Spring wakes)
  await ev(() => { const G = window.G, D = G.dungeon, A = D.layout.arena, mo = D.layout.arenaMouth || { x: A.x + A.r, z: A.z }; const dx = mo.x - A.x, dz = mo.z - A.z, L = Math.hypot(dx, dz) || 1; G.player.setPos(A.x + dx / L * (A.r - 5), A.z + dz / L * (A.r - 5)); G.engine.rig.focus.copy(G.player.pos); G.engine.rig.snap(); });
  const SEASONS = ['spring', 'summer', 'autumn', 'winter'], MOVE = { tenguMaster: 'gust', umibozu: 'slam', danzaburo: 'drum', yukiOnna: 'icicles' };
  for (let k = 0; k < 4; k++) {
    await wait(k => { const D = window.G.dungeon, b = D.boss; return D.tr.pin.k === k && b?.alive && b.introDone && !window.G.ui?.iris?.active; }, k, 40000).catch(() => {});
    await ev(() => { const D = window.G.dungeon; if (!D.boss.introDone) D.boss.alert(); });
    await wait(() => performance.now() > (window.G.dungeon.introUntil || 0) + 1500, null, 15000);
    await ev(() => { const G = window.G, D = G.dungeon, A = D.layout.arena, b = D.boss, dx = b.pos.x - A.x, dz = b.pos.z - A.z, L = Math.hypot(dx, dz) || 1; G.player.setPos(A.x + dx / L * 2 - dz / L * 3, A.z + dz / L * 2 + dx / L * 3); G.engine.rig.focus.copy(G.player.pos); G.engine.rig.snap(); }); // (the hero a few metres off the boss, toward the middle)
    await page.waitForTimeout(2500);
    // its adds in the ring (the fight's own waves, called now) and one of its moves
    await ev(() => { const b = window.G.dungeon.boss; try { b.def.debug?.summon?.(b); } catch (e) { /* */ } });
    await page.waitForTimeout(1800);
    await ev(id => { const b = window.G.dungeon.boss; try { b.def.debug?.[id]?.(b); } catch (e) { /* */ } }, MOVE[await ev(() => window.G.dungeon.boss.id)]);
    await page.waitForTimeout(650);
    await shot(SEASONS[k], 'fight');
    if (k > 0) { // an echo of a fallen season, on its own beat
      await wait(() => window.G.dungeon.tr.pin.quiet(), null, 12000).catch(() => {}); // (an echo's own beat, as in play)
      await ev(k => { // the hero 7 m in from the spirit (it and its move in the frame)
        const G = window.G, D = G.dungeon, A = D.layout.arena, pin = D.tr.pin, st = pin.statues[k - 1]; pin.echoT = 99;
        const dx = A.x - st.pos.x, dz = A.z - st.pos.z, L = Math.hypot(dx, dz) || 1; G.player.setPos(st.pos.x + dx / L * 7, st.pos.z + dz / L * 7); G.engine.rig.focus.copy(G.player.pos); G.engine.rig.snap();
        const mv = ['gale', 'ink', 'roll'][st.k]; pin[mv](st); pin.hold(D.boss, 1.6);
      }, k);
      await page.waitForTimeout(800);
      await shot(SEASONS[k], 'echo');
    }
    if (k === 3) { // her whiteout: the ring must still read
      await ev(() => { const b = window.G.dungeon.boss; try { b.def.debug?.phase2?.(b); } catch (e) { /* */ } });
      await page.waitForTimeout(3500);
      await shot(SEASONS[k], 'whiteout');
    }
    await ev(() => { const G = window.G; G.combat.hitMonster(G.dungeon.boss, { dmgPct: 1e8 }); });
    if (k < 3) { await page.waitForTimeout(1300); await shot(SEASONS[k], 'falls'); }
  }
  await wait(() => window.G.dungeon.tr.pin.done && window.G.world.interactables.some(i => /Lantern chest/.test(i.label)), null, 15000).catch(() => {});
  await ev(() => { const G = window.G, c = G.dungeon.tr.chestAt; if (c) { G.player.setPos(c.x + 1.2, c.z + 1.6); G.engine.rig.focus.copy(G.player.pos); G.engine.rig.snap(); } }); // (the hero by the chest, as after the fight)
  await page.waitForTimeout(500);
  await shot('end', 'victory');
  await wait(() => { const p = window.G.dungeon.tr.pin; return p.stats.hoard && window.G.dungeon.loot.list.length >= p.stats.hoard; }, null, 15000).catch(() => {});
  await page.waitForTimeout(1800);
  await shot('end', 'hoard');
} catch (e) { console.log('FAILED', e.message.split('\n')[0]); }
if (logs.length) console.log([...new Set(logs)].slice(0, 8).join('\n'));
await browser.close();
