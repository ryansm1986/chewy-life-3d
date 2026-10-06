// Poe look-review shots (docs/POE.md): a real Burrow fight as Poe, each skill cast at a pack, frozen at its peak.
//   node tools/qa/poe-shots.mjs [attack fumaThrow kunaiFan ...] [--charge 1|2|3] [--close] [--follow] [--village] [--out dir]
// Writes PNGs to tools/qa/tmp/poe-shots (gitignored) (or --out) and prints any runtime errors. Time is frozen per shot
// (engine.timeScale 0) once the effect has had `at` seconds to develop, so the frame shows the move itself.
// --charge s casts the charged release at stage s with every perk (docs/CHARGE.md; the wind-up poses: charge-shots.mjs);
// --follow frames the thrown fūma half-way between her and it (as the camera would show a long throw).
import { launch, boot, waitMode, sleep } from './lib.mjs';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const flag = n => args.includes(n);
const val = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const OUT = val('--out') || 'tools/qa/tmp/poe-shots';
fs.mkdirSync(OUT, { recursive: true });
const QS = val('--qs') ? '&' + val('--qs') : '', TAG = val('--qs') ? '-' + val('--qs').replace(/[^a-z0-9]+/gi, '') : '';
const STAGE = +(val('--charge') || 0);
const ids = args.filter((a, i) => !a.startsWith('--') && !['--out', '--qs', '--charge'].includes(args[i - 1]));
// skill → the seconds after the cast to freeze at
const PLAN = {
  attack: { at: [0.22, 0.5, 0.95], rep: 3 }, fumaThrow: { at: [0.3, 0.45, 0.6, 0.75, 0.9, 1.05] }, kunaiFan: { at: [0.32, 0.45, 0.62] },
  shadowStitch: { at: [0.3, 0.55, 1.1] }, whirlingFuma: { at: [0.42, 0.9, 1.8] }, shurikenRain: { at: [0.35, 0.8, 1.3, 1.8] },
  thousandStars: { at: [0.4, 1.0, 1.8] }, smokeBomb: { at: [0.3, 0.45, 0.8, 1.6] }, puffBall: { at: [0.42, 0.65, 0.95] },
  shadowClone: { at: [0.42, 0.7, 1.5] }, substitution: { at: [0.15, 0.4, 1.2, 2.8] }, thunderPaw: { at: [0.42, 0.55, 0.75] },
  smokeDragon: { at: [0.7, 1.1, 1.6, 2.1] }, shadowStep: { at: [0.18, 0.32, 0.5, 0.7] }, afterimageDash: { at: [0.12, 0.3, 0.6, 0.85] },
  vanish: { at: [0.3, 0.6, 1.4] }, caltropFlip: { at: [0.15, 0.3, 0.55, 1.4] }, bullseyeMark: { at: [0.3, 0.55, 1.6] }, phantomBarrage: { at: [0.2, 0.45, 0.8, 1.3] },
};
const list = ids.length ? ids : Object.keys(PLAN);
const { browser, page, errors } = await launch({ w: 1600, h: 900 });
try {
  await boot(page, (flag('--village') ? 'fresh&nointro&notut&hero=poe' : 'fresh&nointro&notut&hero=poe&floor=1') + QS);
  if (!flag('--village')) await waitMode(page, 'dungeon');
  if (flag('--close')) await page.evaluate(() => { window.__close = true; });
  await sleep(page, 1200);
  // a level-30 Poe with every skill at 12 (and every perk when charging), full zoom
  await page.evaluate(async (stage) => {
    const G = window.G, P = G.state.player, { SKILLS } = await import('/src/rpg/skills.js'), { CHARGE } = await import('/src/rpg/charge.js');
    P.lvl = 30; P.stats = { str: 20, dex: 90, vit: 300, ene: 120 };
    for (const id of Object.keys(SKILLS)) if (SKILLS[id].cls === 'poe') P.skills[id] = 12;
    P.chargePerks = {};
    if (stage) for (const id of Object.keys(CHARGE)) if (SKILLS[id].cls === 'poe') P.chargePerks[id] = Object.fromEntries(Object.entries(CHARGE[id].perks).map(([k, p]) => [k, p.ranks]));
    G.actions.recompute(); G.actions.restoreAll?.();
    G.state.flags.burrowTut = true;
  }, STAGE);
  for (const id of list) {
    const plan = PLAN[id] || { at: [0.3, 0.6, 1.0] };
    // a fresh pack each time: up to 5 monsters parked 3-5 m off (to the screen's right, toward the camera), tough and still
    const ok = await page.evaluate(async () => {
      const G = window.G, P = G.player, D = G.dungeon;
      if (!D) return false;
      G.engine.timeScale = 1;
      G.skills.clearPoe?.();
      if (!window.__home) window.__home = P.pos.clone(); else { P.setPos(window.__home.x, window.__home.z); P.pos.y = G.world.heightAt(P.pos.x, P.pos.z); G.engine.rig.focus.copy(P.pos); G.engine.rig.snap(); } // (every skill from the same spot: the dashes and blinks wander)
      const live = D.monsters.filter(m => m.alive && !m.def.boss);
      const { f: cf, r: cr } = G.engine.rig.groundAxes(), L = Math.hypot(cr.x - 0.15 * cf.x, cr.z - 0.15 * cf.z), f = { x: (cr.x - 0.15 * cf.x) / L, z: (cr.z - 0.15 * cf.z) / L }; // (the pack to the screen's right, clear of the HUD)
      P.facing = P.faceTarget = Math.atan2(f.x, f.z);
      live.slice(0, 5).forEach((m, i) => { const a = (i - 2) * (window.__close ? 0.28 : 0.42), d = (3.4 + (i % 2) * 1.3) * (window.__close ? 0.8 : 1); m.pos.set(P.pos.x + (f.x * Math.cos(a) - f.z * Math.sin(a)) * d, m.pos.y, P.pos.z + (f.z * Math.cos(a) + f.x * Math.sin(a)) * d); m.aggro = false; m.lifeMax = m.life = 1e6; m.status = { stun: 999 }; m.cancelAttack?.(); });
      for (const m of live.slice(5)) if (Math.hypot(m.pos.x - P.pos.x, m.pos.z - P.pos.z) < 14) m.pos.x += 30;
      G.skills.cds = {}; G.actions.restoreAll?.();
      G.engine.rig.distTarget = window.__close ? 7.5 : 13; return true;
    });
    if (!ok) { console.log('no dungeon'); break; }
    await sleep(page, 500);
    for (let k = 0; k < plan.at.length; k++) {
      await page.evaluate(({ id, k, rep, stage }) => {
        const G = window.G, P = G.player, D = G.dungeon;
        G.engine.timeScale = 1;
        const foes = D.monsters.filter(m => m.alive && !m.def.boss).sort((a, b) => a.pos.distanceTo(P.pos) - b.pos.distanceTo(P.pos));
        const t = foes[0];
        const aim = t ? t.pos.clone() : P.pos.clone().add(new G.THREE.Vector3(Math.sin(P.facing) * 4, 0, Math.cos(P.facing) * 4));
        G.skills.cds = {}; G.state.player.zoom = null;
        if (id === 'attack') { G.skills.poeCombo = (rep ? k % 3 : 0); G.skills.poeComboT = G.engine.time; }
        if (k === 0 || id === 'attack') { G.skills.clearPoe?.(); window.__cast = G.skills.tryCast(id, aim, t || null, stage && id !== 'attack' ? { stage, t: 2 } : null); window.__t0 = G.engine.time; }
      }, { id, k, rep: plan.rep, stage: STAGE });
      await page.waitForFunction(at => { const G = window.G; return (G.engine.time - window.__t0) >= at; }, plan.at[k], { timeout: 8000 }).catch(() => {}); // (game time: it stands still while a shot is frozen)
      await page.evaluate((follow) => {
        const G = window.G; G.engine.timeScale = 0;
        const f = G.skills.poeFuma, P = G.player, R = G.engine.rig;
        if (follow && f) { R.biasTarget.set((f.pos.x - P.pos.x) * 0.6, 0, (f.pos.z - P.pos.z) * 0.6); R.snap(); }
      }, flag('--follow'));
      await sleep(page, 120);
      const f = path.join(OUT, `${id}${STAGE ? `-c${STAGE}` : ''}-${k}${flag('--close') ? '-close' : ''}${flag('--follow') ? '-follow' : ''}${TAG}.png`);
      await page.screenshot({ path: f });
      console.log('saved', f);
      await page.evaluate(() => { const G = window.G; G.engine.timeScale = 1; G.engine.rig.biasTarget.set(0, 0, 0); });
      if (id === 'attack') await sleep(page, 700);
    }
    await sleep(page, 900);
  }
} catch (e) { errors.push('[harness] ' + e.stack); }
if (errors.length) console.log('ERRORS:\n' + [...new Set(errors)].slice(0, 20).join('\n'));
await browser.close();
