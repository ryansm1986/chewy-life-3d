// The Shih Tzu look-review shots (docs/SHIHTZU.md §9): the baked model and his flail at the game camera, a real Burrow
// fight with each move frozen at a few moments, the hero wheel and the HUD.
//   node tools/qa/shihtzu-shots.mjs [look] [idle] [walk] [attack] [woefulWallop] [drippingPaw] [wheel] [--out dir] [--qs k=v]
// Writes PNGs to tools/qa/tmp/shihtzu-shots (gitignored) (or --out) and prints any runtime errors. Time is frozen per shot
// (engine.timeScale 0) once a move has had `at` seconds to develop.
//  look: the village, the camera round him (front, both 45° yaws, behind) at the game's distance and a close one;
//  idle / walk: the Burrow, the flail in his paw at rest and walking (the chain's sway);
//  attack and the skills: cast at a pack to the screen's right, frozen through the move;
//  wheel: all four heroes joined, Tab held (the hero wheel) and the HUD's mini portraits.
import { launch, boot, waitMode, sleep } from './lib.mjs';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const val = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const OUT = val('--out') || 'tools/qa/tmp/shihtzu-shots';
fs.mkdirSync(OUT, { recursive: true });
const QS = val('--qs') ? '&' + val('--qs') : '';
const ids = args.filter((a, i) => !a.startsWith('--') && !['--out', '--qs', '--view', '--only', '--stage'].includes(args[i - 1]));
const PLAN = {
  attack: { at: [0.18, 0.38, 0.5, 0.75], rep: 3 }, woefulWallop: { at: [0.3, 0.5, 0.62, 0.8] }, drippingPaw: { at: [0.3, 0.55, 0.8, 1.6] },
};
const want = ids.length ? ids : ['look', 'idle', 'walk', 'attack', 'woefulWallop', 'drippingPaw', 'wheel'];
const shot = async (page, name) => { const f = path.join(OUT, `${name}.png`); await page.screenshot({ path: f }); console.log('saved', f); };
const { browser, page, errors } = await launch({ w: 1600, h: 900 });
try {
  if (want.includes('look')) {
    await boot(page, 'fresh&nointro&notut&hero=shihtzu&hour=11' + QS);
    await sleep(page, 1500);
    for (const [name, dyaw, dist] of [['look-front', 0, 13], ['look-45r', Math.PI * 0.25, 13], ['look-45l', -Math.PI * 0.25, 13], ['look-back', Math.PI, 13], ['look-front-close', 0, 6.5], ['look-45r-close', Math.PI * 0.25, 6.5], ['look-45l-close', -Math.PI * 0.25, 6.5], ['look-back-close', Math.PI - 0.35, 6.5]]) {
      await page.evaluate(({ dyaw, dist }) => {
        const G = window.G, P = G.player, R = G.engine.rig;
        G.engine.timeScale = 1; P.moveTarget = null;
        P.facing = P.faceTarget = R.yaw + dyaw; P.sync?.(); // (dyaw 0: facing the camera)
        R.distTarget = dist; R.snap();
      }, { dyaw, dist });
      await sleep(page, 700);
      await shot(page, name);
    }
  }
  if (want.includes('baldric')) { // the flail on his back in town, walking and sprinting, the camera at both rear and front 45° yaws
    await boot(page, 'fresh&nointro&notut&hero=shihtzu&hour=11' + QS);
    await sleep(page, 1500);
    const home = { x: 105, z: 125.2 }; // (the plaza's north side: open paving, running east past the fountain)
    for (const run of [false, true]) {
      if (run) await page.keyboard.down('Shift');
      for (const [name, dyaw] of [['r45r', Math.PI * 0.75], ['r45l', -Math.PI * 0.75], ['f45r', Math.PI * 0.25], ['f45l', -Math.PI * 0.25]]) {
        await page.evaluate(({ home, dyaw }) => {
          const G = window.G, P = G.player, R = G.engine.rig, h = Math.PI / 2; // (heading east)
          G.engine.timeScale = 1; P.setPos(home.x, home.z); P.pos.y = G.world.heightAt(P.pos.x, P.pos.z);
          P.facing = P.faceTarget = h; P.moveTarget = new P.pos.constructor(home.x + Math.sin(h) * 40, 0, home.z + Math.cos(h) * 40);
          R.focus.copy(P.pos); R.yawTarget = h + dyaw; R.distTarget = 9; R.snap();
          window.__rig = () => { R.yawTarget = h + dyaw; };
        }, { home, dyaw });
        await sleep(page, 1000);
        for (let k = 0; k < 3; k++) {
          await page.evaluate(() => { const G = window.G, P = G.player, R = G.engine.rig; window.__rig(); R.focus.copy(P.pos); R.snap(); G.engine.timeScale = 0; });
          await sleep(page, 140); // (then find him where the frozen camera settled)
          const c = await page.evaluate(() => {
            const G = window.G, P = G.player; G.engine.camera.updateMatrixWorld();
            const v = P.pos.clone().setY(P.pos.y + 0.6).project(G.engine.camera); return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight, sk: P.sprint.k };
          });
          const f = path.join(OUT, `baldric-${run ? 'run' : 'walk'}-${name}-${k}.png`);
          await page.screenshot({ path: f, clip: { x: Math.max(0, Math.min(1000, c.x - 300)), y: Math.max(0, Math.min(300, c.y - 300)), width: 600, height: 600 } });
          if (k === 0) console.log(name, run ? 'run' : 'walk', 'sprint k', c.sk.toFixed(2));
          await page.evaluate(() => { window.G.engine.timeScale = 1; }); await sleep(page, 170);
        }
      }
      if (run) await page.keyboard.up('Shift');
    }
  }
  if (want.includes('pack')) { // real fights in a zone dungeon (Bamboo Depths B1F): a big pack closing in, each skill cast into it
    await boot(page, 'fresh&nointro&notut&hero=shihtzu' + QS);
    await sleep(page, 1200);
    await page.evaluate(async () => {
      const G = window.G, P = G.state.player, { SKILLS } = await import('/src/rpg/skills.js');
      P.lvl = 30; P.stats = { str: 90, dex: 20, vit: 400, ene: 160 }; P.statPts = 0;
      for (const id of Object.keys(SKILLS)) if (SKILLS[id].cls === 'shihtzu') P.skills[id] = 12;
      G.actions.recompute(); G.actions.restoreAll?.(); G.actions.addXp = () => {};
      G.state.flags.burrowTut = true;
      G.enterDungeon({ id: 'bambooDepths', floor: 1 });
    });
    await page.waitForFunction(() => window.G?.mode === 'dungeon' && window.G.dungeon?.monsters?.length && !window.G.ui?.iris?.active, null, { timeout: 40000 });
    await sleep(page, 2000);
    // the pack: 18 of the floor's kinds in a loose crowd 4-7 m off his facing, aggroed (they close in and fight), tough (×30 life);
    // the floor's own monsters far away are moved off; regroup() puts the crowd back between shots
    await page.evaluate(() => {
      const G = window.G, D = G.dungeon, P = G.player, KINDS = ['takenoko', 'kodama', 'kamaitachi', 'iwabozu', 'kurage', 'tanuki'];
      D.warmMonsters?.(KINDS);
      const { f: cf, r: cr } = G.engine.rig.groundAxes(), L = Math.hypot(cr.x + 0.6 * cf.x, cr.z + 0.6 * cf.z), f = { x: (cr.x + 0.6 * cf.x) / L, z: (cr.z + 0.6 * cf.z) / L };
      // an open stretch of floor away from the entrance (its portal and camp): every point within 7.5 m walkable and clear
      const clear = (x, z) => { for (let r = 0; r <= 7.5; r += 1.5) for (let a = 0; a < 6.283; a += 0.5) { const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r; if (!G.world.walkable(px, pz) || G.world.collision?.solidAt?.(px, pz, 0.3)) return false; } return true; };
      let home = null;
      const cl = (x, z, R) => { for (let r = 0; r <= R; r += 1) for (let a = 0; a < 6.283; a += 0.6) { const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r; if (!G.world.walkable(px, pz)) return false; } return true; };
      for (const m of [...D.monsters].sort((a, b) => a.pos.distanceTo(P.pos) - b.pos.distanceTo(P.pos))) { const d = Math.hypot(m.pos.x - P.pos.x, m.pos.z - P.pos.z); if (d > 16 && d < 60 && cl(m.pos.x, m.pos.z, 5)) { home = m.pos.clone(); break; } } // (a room the floor's own monsters stand in)
      for (let d = 14; d <= 60 && !home; d += 3) for (let a = 0; a < 6.283 && !home; a += 0.3) { const x = P.pos.x + Math.cos(a) * d, z = P.pos.z + Math.sin(a) * d; if (clear(x, z)) home = new P.pos.constructor(x, G.world.heightAt(x, z), z); }
      window.__pack = { dir: f, home: home || P.pos.clone(), list: [] };
      const lvl = D.layout.mlvl || 8;
      for (let i = 0; i < 18; i++) {
        const id = KINDS[i % KINDS.length], m = D.spawnMonster(id, { level: lvl, rank: i === 5 ? 'champion' : 'normal', variant: i % 3, x: P.pos.x, z: P.pos.z });
        m.lifeMax = m.life = m.lifeMax * 30; window.__pack.list.push(m);
      }
      for (const m of D.monsters) if (m.alive && !window.__pack.list.includes(m) && Math.hypot(m.pos.x - window.__pack.home.x, m.pos.z - window.__pack.home.z) < 30) { m.pos.x += 80; m.aggro = false; }
      window.__regroup = (spread = 1) => {
        const K = window.__pack, P2 = G.player; G.engine.timeScale = 1;
        P2.setPos(K.home.x, K.home.z); P2.pos.y = G.world.heightAt(P2.pos.x, P2.pos.z); P2.facing = P2.faceTarget = Math.atan2(K.dir.x, K.dir.z);
        K.list.forEach((m, i) => {
          if (!m.alive) return;
          const a = (i * 2.4) % 6.283, r = (0.4 + Math.sqrt(i / 18) * 2.6) * spread, d = 5.2;
          m.pos.set(K.home.x + K.dir.x * d + Math.cos(a) * r, m.pos.y, K.home.z + K.dir.z * d + Math.sin(a) * r);
          m.life = m.lifeMax; m.aggro = true; m.status = {}; m.knock?.set?.(0, 0, 0); m.cursedMul = 1;
        });
        G.actions.restoreAll?.(); G.skills.cds = {}; G.state.player.zoom = null;
        G.engine.rig.focus.set(P2.pos.x + K.dir.x * 2.2, P2.pos.y, P2.pos.z + K.dir.z * 2.2); G.engine.rig.distTarget = +(window.__dist || 15); G.engine.rig.snap(); // (framed between him and the crowd)
      };
      window.__center = () => { const K = window.__pack; let x = 0, z = 0, n = 0; for (const m of K.list) if (m.alive) { x += m.pos.x; z += m.pos.z; n++; } return n ? new P.pos.constructor(x / n, P.pos.y, z / n) : P.pos.clone(); };
    });
    // --stage 3: the charged releases instead (every perk bought, the release cast straight at that stage: chargedShihtzu.js)
    const STAGE = +(val('--stage') || 0);
    if (STAGE) await page.evaluate(async (s) => { const G = window.G, { CHARGE } = await import('/src/rpg/charge.js'); window.__stage = s; const P = G.state.player; P.chargePerks = {}; for (const id in CHARGE) if (CHARGE[id] && P.skills[id]) P.chargePerks[id] = Object.fromEntries(Object.entries(CHARGE[id].perks).map(([k, q]) => [k, q.ranks])); }, STAGE);
    // [shot name, skill, when to freeze: seconds after the cast, or 'action:u']
    const PLAN2 = [
      ['woefulWallop', 'woefulWallop', 'sweep:0.09'], ['tugOfWoe', 'tugOfWoe', 0.55], ['maelstrom', 'maelstrom', 1.0], ['steadfastSulk', 'steadfastSulk', 0.7], ['heaviestSigh', 'heaviestSigh', 1.05],
      ['drippingPaw', 'drippingPaw', 0.9], ['grumbleCloud', 'grumbleCloud', 1.6], ['caseOfMopes', 'caseOfMopes', 0.9], ['mournfulAwoo', 'mournfulAwoo', 0.62], ['everlastingGloom', 'everlastingGloom', 1.0],
      ['ghostPups', 'ghostPups', 2.2], ['borrowedWarmth', 'borrowedWarmth', 1.2], ['boneWard', 'boneWard', 1.0], ['wayhomeLantern', 'wayhomeLantern', 1.4], ['grandpawsGhost', 'grandpawsGhost', 3.2],
    ].filter(x => !val('--only') || val('--only').split(',').includes(x[0]));
    for (const [name, id, at] of PLAN2) {
      await page.evaluate(() => { window.G.skills.clearShihtzu?.(); window.__regroup(); });
      await sleep(page, 1100); // (the crowd closes in: a real fight)
      await page.evaluate(({ id }) => {
        const G = window.G, P = G.player, c = window.__center(), K = window.__pack;
        const near = K.list.filter(m => m.alive).sort((a, b) => a.pos.distanceTo(P.pos) - b.pos.distanceTo(P.pos))[0];
        const toward = c.clone().sub(P.pos).setY(0); const ahead = P.pos.clone().addScaledVector(toward.normalize(), Math.min(2.6, P.pos.distanceTo(c)));
        const aim = ['grumbleCloud', 'caseOfMopes', 'everlastingGloom'].includes(id) ? ahead : near.pos.clone();
        G.state.player.zoom = null; G.skills.cds = {};
        if (id === 'mournfulAwoo') G.skills.stzHex(near, 60, 6, 3, 3); // (a hexed foe for the howl to spread from)
        window.__ok = G.skills.tryCast(id, aim, ['grumbleCloud', 'caseOfMopes', 'everlastingGloom', 'wayhomeLantern'].includes(id) ? null : near, window.__stage ? { stage: window.__stage } : undefined);
        if (id === 'maelstrom' && G.skills.channel) G.skills.channel.toggleHeld = true;
        window.__t0 = G.engine.time;
      }, { id });
      // (`at`: seconds after the cast, or 'action:u' — that action's own progress, so a swing freezes at its hit at any attack speed)
      if (typeof at === 'string' && at.startsWith('sweep:')) await page.waitForFunction(dt => { const f = window.G.vfx.stz?._lastSweep; return f && window.G.vfx.stz.t - f >= +dt; }, at.split(':')[1], { timeout: 15000, polling: 'raf' }).catch(() => {}); // (the wallop's sweep, its edge mid-run)
      else if (typeof at === 'string') await page.waitForFunction(([a, u]) => { const x = window.G.player.anim.action; return x?.name === a && x.t / x.dur >= +u; }, at.split(':'), { timeout: 15000, polling: 'raf' }).catch(() => {});
      else await page.waitForFunction(at => (window.G.engine.time - window.__t0) >= at, at, { timeout: 15000 }).catch(() => {});
      await page.evaluate(() => { window.G.engine.timeScale = 0; });
      await sleep(page, 150);
      await shot(page, `pack-${name}${STAGE ? '-c' + STAGE : ''}`);
      if (process.env.DEBUG) console.log('  state', name, JSON.stringify(await page.evaluate(() => { const G = window.G, P = G.player; return { flash: +(P.anim.flash || 0).toFixed(2), flashColor: '#' + P.anim.flashColor.getHexString(), life: Math.round(G.actions.life()), dead: !!G.playerDead, shadow: G.shadow ? { alive: G.shadow.alive, down: !!G.shadow.down, life: Math.round(G.shadow.life || 0) } : null, grade: P.rig.mat?.userData?.u?.uDarkGrade?.value?.toArray?.() }; })));
      const ok = await page.evaluate(() => window.__ok);
      if (!ok) console.log('cast refused:', name);
      if (process.env.DEBUG) console.log(' ', name, JSON.stringify(await page.evaluate(() => { const G = window.G, S = G.skills, B = G.vfx.stz?._pups; return { anim: G.player.anim.action?.name, chan: S.channel?.id, chanT: S.channel?.t, allies: (S.stzAllies || []).map(a => `${a.constructor.name[0]}${a.alive ? '' : 'x'}${Math.round(a.life)}`).join(' '), pupSlots: B?.slots.length, pupCount: B?.fill.count, vis: B?.fill.visible, inScene: !!B?.fill.parent }; })));
      await page.evaluate(() => { const G = window.G; G.engine.timeScale = 1; if (G.skills.channel) G.skills.endChannel(); });
    }
    if (!val('--only') || val('--only').split(',').includes('all')) {
      // everything at once (readability): the pups, Grandpaw, the ward and the lantern out, then every hex on the crowd —
      // the cloud, the mopes, the great hex, a paw, the awoo spreading it — frozen mid-fight at the game's own distance
      await page.evaluate(() => { const G = window.G; G.skills.clearShihtzu?.(); window.__dist = 18; window.__regroup(1.25); });
      const seq = [['ghostPups', 2.4], ['grandpawsGhost', 2.2], ['boneWard', 0.9], ['wayhomeLantern', 0.9], ['grumbleCloud', 0.6], ['caseOfMopes', 0.6], ['everlastingGloom', 0.9], ['drippingPaw', 0.7], ['borrowedWarmth', 0.6], ['mournfulAwoo', 0.45]];
      for (const [id, wait] of seq) {
        await page.evaluate(({ id }) => {
          const G = window.G, P = G.player, c = window.__center(), K = window.__pack;
          const near = K.list.filter(m => m.alive).sort((a, b) => a.pos.distanceTo(P.pos) - b.pos.distanceTo(P.pos))[0];
          G.state.player.zoom = null; G.skills.cds = {}; G.actions.restoreAll?.(); for (const m of K.list) if (m.alive) m.life = m.lifeMax;
          G.skills.tryCast(id, ['grumbleCloud', 'caseOfMopes', 'everlastingGloom'].includes(id) ? c : near.pos.clone(), ['grumbleCloud', 'caseOfMopes', 'everlastingGloom', 'wayhomeLantern'].includes(id) ? null : near);
        }, { id });
        await sleep(page, wait * 1000);
        if (process.env.DEBUG) console.log(' ', id, JSON.stringify(await page.evaluate(() => { const S = window.G.skills; return (S.stzAllies || []).map(a => `${a.constructor.name[0]}${a.alive ? '' : 'x'}${Math.round(a.life)}`).join(' '); })));
      }
      await page.evaluate(() => { window.G.engine.timeScale = 0; });
      await sleep(page, 150);
      await shot(page, 'pack-all');
      console.log('all at once:', JSON.stringify(await page.evaluate(() => { const S = window.G.skills; return { hexed: S.stzHexes?.size || 0, ghosts: (S.stzAllies || []).filter(a => a.alive).length, clouds: (S.stzClouds || []).length, mopes: S.stzMopes?.size || 0, tethers: (S.stzTethers || []).length, ward: !!S.stzWard, lantern: !!S.stzLantern }; })));
      await page.evaluate(() => { window.G.engine.timeScale = 1; window.__dist = 15; });
    }
  }
  const fight = want.filter(w => w !== 'look' && w !== 'wheel' && w !== 'baldric' && w !== 'pack');
  if (fight.length) {
    await boot(page, 'fresh&nointro&notut&hero=shihtzu&floor=1' + QS);
    await waitMode(page, 'dungeon');
    await sleep(page, 1200);
    await page.evaluate(async () => {
      const G = window.G, P = G.state.player, { SKILLS } = await import('/src/rpg/skills.js');
      P.lvl = 30; P.stats = { str: 90, dex: 20, vit: 300, ene: 120 };
      for (const id of Object.keys(SKILLS)) if (SKILLS[id].cls === 'shihtzu' && !SKILLS[id].training) P.skills[id] = 12;
      G.actions.recompute(); G.actions.restoreAll?.();
      G.state.flags.burrowTut = true;
    });
    const park = async (close) => page.evaluate((close) => {
      const G = window.G, P = G.player, D = G.dungeon;
      G.engine.timeScale = 1; G.skills.clearShihtzu?.();
      if (!window.__home) window.__home = P.pos.clone(); else { P.setPos(window.__home.x, window.__home.z); P.pos.y = G.world.heightAt(P.pos.x, P.pos.z); G.engine.rig.focus.copy(P.pos); G.engine.rig.snap(); }
      const live = D.monsters.filter(m => m.alive && !m.def.boss);
      const { f: cf, r: cr } = G.engine.rig.groundAxes(), L = Math.hypot(cr.x - 0.15 * cf.x, cr.z - 0.15 * cf.z), f = { x: (cr.x - 0.15 * cf.x) / L, z: (cr.z - 0.15 * cf.z) / L };
      P.facing = P.faceTarget = Math.atan2(f.x, f.z);
      live.slice(0, 5).forEach((m, i) => { const a = (i - 2) * 0.42, d = 3.0 + (i % 2) * 1.2; m.pos.set(P.pos.x + (f.x * Math.cos(a) - f.z * Math.sin(a)) * d, m.pos.y, P.pos.z + (f.z * Math.cos(a) + f.x * Math.sin(a)) * d); m.lifeMax = m.life = 1e6; m.status.stun = 99; });
      for (const m of live.slice(5)) if (Math.hypot(m.pos.x - P.pos.x, m.pos.z - P.pos.z) < 14) m.pos.x += 30;
      G.skills.cds = {}; G.actions.restoreAll?.();
      G.engine.rig.distTarget = close ? 7.5 : 13; return true;
    }, close);
    for (const id of fight) {
      if (id === 'strip') { // each swing frozen at 10 moments, cropped round him, as a contact sheet per swing
        for (const [name, cast, combo] of [['swing1', 'attack', 0], ['swing2', 'attack', 1], ['slam', 'attack', 2], ['wallop', 'woefulWallop', 0]].filter(x => !val('--only') || val('--only').split(',').includes(x[0]))) {
          await park(true); await sleep(page, 600);
          const rows = [];
          await page.evaluate(({ cast, combo, view }) => {
            const G = window.G, P = G.player, D = G.dungeon, R = G.engine.rig;
            const foes = D.monsters.filter(m => m.alive && !m.def.boss).sort((a, b) => a.pos.distanceTo(P.pos) - b.pos.distanceTo(P.pos));
            // the camera: 'front' faces him (yaw = his facing toward the foe); 'game' is the game's own camera (its yaw kept)
            const f = Math.atan2(foes[0].pos.x - P.pos.x, foes[0].pos.z - P.pos.z);
            if (view === 'front') R.yawTarget = f;
            if (view) { R.distTarget = 9; R.snap(); }
            G.skills.cds = {}; G.state.player.zoom = null; G.skills.stzCombo = combo; G.skills.stzComboT = G.engine.time;
            G.skills.tryCast(cast, foes[0].pos.clone(), foes[0]); window.__t0 = G.engine.time;
          }, { cast, combo, view: val('--view') });
          for (let k = 0; k < 10; k++) {
            const at = 0.08 + k * 0.1;
            await page.waitForFunction(at => (window.G.engine.time - window.__t0) >= at, at, { timeout: 8000 }).catch(() => {});
            const c = await page.evaluate(() => { const G = window.G; G.engine.timeScale = 0; const v = G.player.pos.clone().setY(G.player.pos.y + 0.6).project(G.engine.camera); return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight }; });
            await sleep(page, 90);
            const f = path.join(OUT, `strip-${name}${val('--view') ? '-' + val('--view') : ''}-${k}.png`);
            await page.screenshot({ path: f, clip: { x: Math.max(0, c.x - 300), y: Math.max(0, c.y - 300), width: 600, height: 600 } });
            rows.push(`${f}\t${name} ${at.toFixed(2)}s`);
            await page.evaluate(() => { window.G.engine.timeScale = 1; });
          }
          fs.writeFileSync(path.join(OUT, `strip-${name}${val('--view') ? '-' + val('--view') : ''}.txt`), rows.join('\n'));
          await sleep(page, 900);
        }
        continue;
      }
      if (id === 'idle' || id === 'walk') {
        await park(true);
        await sleep(page, 900);
        if (id === 'walk') {
          // walking across the screen (his side to the camera), a little further out: the ball drags and hops behind him
          await page.evaluate(() => { const G = window.G; G.engine.rig.distTarget = 10; for (const m of G.dungeon.monsters) if (m.alive && !m.def.boss) m.pos.x += 60; });
          for (const key of ['d', 'a']) {
            await page.keyboard.down(key); await sleep(page, 900);
            for (let k = 0; k < 3; k++) { await page.evaluate(() => { window.G.engine.timeScale = 0; }); await sleep(page, 120); await shot(page, `walk-${key}-${k}`); await page.evaluate(() => { window.G.engine.timeScale = 1; }); await sleep(page, 230); }
            await page.keyboard.up(key); await sleep(page, 900); await shot(page, `walk-${key}-stop`);
          }
        } else {
          for (const [name, dyaw] of [['idle-45r', Math.PI * 0.25], ['idle-front', 0], ['idle-back', Math.PI - 0.4]]) {
            await page.evaluate((dyaw) => { const G = window.G, P = G.player; P.facing = P.faceTarget = G.engine.rig.yaw + dyaw; }, dyaw);
            await sleep(page, 1100); await shot(page, name);
          }
        }
        continue;
      }
      const plan = PLAN[id] || { at: [0.3, 0.6, 1.0] };
      await park(true);
      await sleep(page, 500);
      for (let k = 0; k < plan.at.length; k++) {
        await page.evaluate(({ id, k, rep }) => {
          const G = window.G, P = G.player, D = G.dungeon;
          G.engine.timeScale = 1;
          const foes = D.monsters.filter(m => m.alive && !m.def.boss).sort((a, b) => a.pos.distanceTo(P.pos) - b.pos.distanceTo(P.pos));
          const t = foes[0], aim = t ? t.pos.clone() : P.pos.clone();
          G.skills.cds = {}; G.state.player.zoom = null;
          if (id === 'attack') { G.skills.stzCombo = (rep ? Math.floor(k / 2) % 3 : 0); G.skills.stzComboT = G.engine.time; }
          if (k === 0 || (id === 'attack' && k % 2 === 0)) { window.__cast = G.skills.tryCast(id, aim, t || null); window.__t0 = G.engine.time; }
        }, { id, k, rep: plan.rep });
        await page.waitForFunction(at => (window.G.engine.time - window.__t0) >= at, id === 'attack' ? plan.at[k % 2 === 0 ? 0 : 1] : plan.at[k], { timeout: 8000 }).catch(() => {});
        await page.evaluate(() => { window.G.engine.timeScale = 0; });
        await sleep(page, 120);
        await shot(page, `${id}-${k}`);
        await page.evaluate(() => { window.G.engine.timeScale = 1; });
        if (id === 'attack') await sleep(page, 500);
      }
      await sleep(page, 900);
    }
  }
  if (want.includes('wheel')) {
    await boot(page, 'fresh&nointro&notut&hero=shihtzu' + QS);
    await sleep(page, 1200);
    await page.evaluate(() => { const G = window.G; G.state.flags.mokaJoined = true; G.state.flags.poeJoined = true; for (const id of ['moka', 'poe']) if (G.heroes.villagers[id]) G.heroes.removeVillager(id); G.heroes.spawnBench(); G.heroes.cd = 0; });
    await sleep(page, 1500);
    await shot(page, 'hud-minis');
    await page.keyboard.down('Tab');
    await page.waitForFunction(() => window.G.heroes.wheelOpen, null, { timeout: 4000 }).catch(() => {});
    await sleep(page, 500);
    await shot(page, 'wheel');
    await page.keyboard.press('Escape');
    await page.keyboard.up('Tab');
  }
} catch (e) { errors.push('[harness] ' + e.stack); }
if (errors.length) console.log('ERRORS:\n' + [...new Set(errors)].slice(0, 20).join('\n'));
await browser.close();
