// Charged-ability look review (docs/CHARGE.md): a real Burrow fight, real mouse input (hold RMB on the skill),
// screenshots while charging at each stage and through the release.
//   node tools/qa/charge-shots.mjs [ids...] [--close] [--perks all|none|stages] [--floor 2]
//   SHOT_DIR=... (default: tools/blender/work/charge/shots) → charge-<id>-<stage|rel>.png
// Time is frozen (engine.timeScale = 0) for each shot so stages and effects are caught exactly.
import { launch, boot, waitMode, sleep } from './lib.mjs';
import path from 'node:path';
import fs from 'node:fs';

const argv = process.argv.slice(2);
const flag = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const ids = argv.filter((a, i) => !a.startsWith('--') && !(argv[i - 1] || '').startsWith('--'));
const IDS = ids.length ? ids : ['chomp', 'throw', 'splash'];
const CLOSE = argv.includes('--close'), PERKS = flag('--perks', 'all'), FLOOR = +flag('--floor', 2);
const OUT = process.env.SHOT_DIR || 'D:/projects/chewy-life-3d/tools/blender/work/charge/shots';
fs.mkdirSync(OUT, { recursive: true });

const { browser, page, errors } = await launch({ w: 1600, h: 900 });
const snap = async name => { const f = path.join(OUT, `charge-${name}${CLOSE ? '-close' : ''}.png`); await page.screenshot({ path: f }); console.log('saved', f); };
const freeze = on => page.evaluate(on => { window.G.engine.timeScale = on ? 0 : 1; }, on);
try {
  for (const id of IDS) {
    const hero = await (async () => { const m = await import('../../src/rpg/skills.js'); return m.SKILLS[id]?.cls || 'chewy'; })();
    await boot(page, `fresh&nointro${hero === 'moka' ? '&hero=moka' : ''}`);
    await page.evaluate(f => { window.G.state.flags.burrowTut = true; window.G.enterDungeon(f); }, FLOOR);
    await waitMode(page, 'dungeon');
    await sleep(page, 600);
    const info = await page.evaluate(async ({ id, PERKS, CLOSE }) => {
      const G = window.G, P = G.player, V = G.THREE.Vector3, st = G.state, pl = st.player;
      const { SKILLS } = await import('/src/rpg/skills.js');
      const { CHARGE } = await import('/src/rpg/charge.js');
      pl.lvl = 30; pl.stats.vit = 200; pl.stats.ene = 120;
      pl.skills[id] = 10;
      const def = SKILLS[id];
      if (def.wep && G.derived.weaponType !== def.wep) { G.actions.swapWeapons(); P.setWeapon(G.derived.weaponType); }
      const perks = {};
      if (PERKS !== 'none') for (const [k, p] of Object.entries(CHARGE[id].perks)) if (PERKS === 'all' || k === 'stages') perks[k] = k === 'quick' ? 0 : p.ranks;
      pl.chargePerks = { [id]: perks };
      pl.hotbar[1] = id;
      G.actions.recompute(); G.actions.restoreAll();
      // a quiet spot: clear the room, then a crescent of sturdy dummies in front (camera-up = away from the camera)
      for (const m of G.dungeon.monsters) if (m.alive) { m.status.stun = 999; m.pos.set(-999, 0, -999); }
      // stand on open floor a little away from the entrance portal, facing camera-right (the profile reads best)
      const { r: f } = G.engine.rig.groundAxes(), s0 = G.dungeon.startPos, W = G.world;
      let best = null;
      let tries = 0;
      for (let ring = 5; ring <= 16 && !best; ring += 1) for (let k = 0; k < 16 && !best; k++) {
        const a = k / 16 * Math.PI * 2, x = s0.x + Math.cos(a) * ring, z = s0.z + Math.sin(a) * ring;
        let ok = true; tries++;
        for (let dx = -2; dx <= 7 && ok; dx += 1) for (let dz = -2; dz <= 2 && ok; dz += 1) { const px = x + f.x * dx - f.z * dz, pz = z + f.z * dx + f.x * dz; if ((W.walkable && !W.walkable(px, pz)) || W.collision?.solidAt?.(px, pz, 0.3)) ok = false; }
        if (ok) best = { x, z };
      }
      window.__spot = { best, tries, s0: { x: s0.x, z: s0.z } };
      const s = best || s0; P.setPos(s.x, s.z);
      const before = G.dungeon.monsters.length;
      G.dungeon.summonAround({ pos: P.pos }, 'mochi', 4);
      const ring = G.dungeon.monsters.slice(before);
      ring.forEach((m, i) => {
        const a = (i - (ring.length - 1) / 2) * 0.42, r = 3.4 + (i % 2) * 1.2;
        const d = f.clone().applyAxisAngle(new V(0, 1, 0), a);
        m.pos.set(P.pos.x + d.x * r, 0, P.pos.z + d.z * r); m.lifeMax = m.life = 1e7; m.status.stun = 999; m.aggro = false; m.speed = 0;
      });
      P.faceTarget = P.facing = Math.atan2(f.x, f.z);
      if (CLOSE) G.engine.rig.distTarget = 13;
      G.engine.rig.focus.copy(P.pos); G.engine.rig.snap();
      window.__aimAt = P.pos.clone().addScaledVector(f, 4.2);
      return { hero: P.hero, wt: G.derived.weaponType, hb: pl.hotbar, perks, spot: window.__spot };
    }, { id, PERKS, CLOSE });
    console.log(id, JSON.stringify(info));
    await sleep(page, 900);
    // aim the cursor at the dummies, then hold RMB
    const xy = await page.evaluate(() => { const G = window.G, v = window.__aimAt.clone().project(G.engine.camera); return [(v.x * 0.5 + 0.5) * innerWidth, (-v.y * 0.5 + 0.5) * innerHeight]; });
    await page.mouse.move(xy[0], xy[1]);
    await sleep(page, 200);
    await page.mouse.down({ button: 'right' });
    for (let s = 0; s <= 3; s++) {
      if (s === 0) { await page.waitForFunction(() => window.G.skills.charge.active && window.G.skills.charge.active.t > 0.3, null, { timeout: 4000 }); }
      else {
        const ok = await page.waitForFunction(s => { const a = window.G.skills.charge.active; return a && (a.stage >= s || a.stage >= a.max); }, s, { timeout: 5000 }).then(() => true, () => false);
        if (!ok) break;
        const a = await page.evaluate(() => ({ stage: window.G.skills.charge.active.stage, max: window.G.skills.charge.active.max }));
        if (a.stage < s) break;
        await sleep(page, 90); // let the stage pulse bloom
      }
      await freeze(true); await sleep(page, 120); await snap(`${id}-${s === 0 ? 'wind' : s}`); await freeze(false);
      const a = await page.evaluate(() => window.G.skills.charge.active);
      if (!a || a.stage >= a.max) break;
    }
    await freeze(true); await sleep(page, 80);
    await page.screenshot({ path: path.join(OUT, `charge-${id}-hud.png`), clip: { x: 500, y: 740, width: 620, height: 160 } }); await freeze(false);
    await sleep(page, 300);
    await page.mouse.up({ button: 'right' });
    for (const [ms, tag] of [[110, 'rel1'], [170, 'rel2'], [260, 'rel3'], [420, 'rel4']]) { await sleep(page, ms); await freeze(true); await sleep(page, 120); await snap(`${id}-${tag}`); await freeze(false); }
    const last = await page.evaluate(() => window.G.skills.charge.last);
    console.log(id, 'release', JSON.stringify(last));
  }
} catch (e) { errors.push('[harness] ' + e.stack); }
if (errors.length) console.log([...new Set(errors)].slice(0, 12).join('\n'));
await browser.close();
