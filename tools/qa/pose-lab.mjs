// Pose lab: look at the hero's poses frame by frame, frozen, from the game camera (docs/HEROES.md, samurai Chewy).
//   node tools/qa/pose-lab.mjs --act cut1,cut2 --u 0.2,0.4,0.6 [--view right,front,3q] [--dist 7] [--tag name]
//   node tools/qa/pose-lab.mjs --lab frames.json [--view ...]       (frames: [{ label, A: { armR: {x,y,z}, ..., twoHand } }])
//   node tools/qa/pose-lab.mjs --cast chomp --ms 80,160,260 [--charge 2]   (a real cast at the dummies, frozen at those ms)
//   --weapon ball|sword, --saya (the round-1 sayaMount tried on the Toybox chewy_b: with --qs chewymodel=toy; the samurai model has its own), --mode village (stand in the village instead)
// Writes crops to $SHOT_DIR (default scratchpad/pose) as <tag>-<n>.png and a contact sheet <tag>.png (tools/qa/sheet.py).
import { launch, boot, waitMode, sleep } from './lib.mjs';
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const argv = process.argv.slice(2);
const flag = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const has = k => argv.includes(k);
const OUT = process.env.SHOT_DIR || 'C:/Users/there/AppData/Local/Temp/claude/D--projects-chewy-life-3d/91c675c9-ac30-57d0-b5d5-725868e188fd/scratchpad/pose';
fs.mkdirSync(OUT, { recursive: true });
const TAG = flag('--tag', 'lab'), DIST = +flag('--dist', 7), VIEWS = flag('--view', 'right').split(','), CROP = +flag('--crop', 0);
const ACTS = flag('--act', '') ? flag('--act').split(',') : [], US = flag('--u', '0,0.25,0.5,0.75').split(',').map(Number);
const LAB = flag('--lab', null) ? JSON.parse(fs.readFileSync(flag('--lab'), 'utf8')) : null;
const CAST = flag('--cast', null), MS = flag('--ms', '60,140,240,400').split(',').map(Number), STAGE = +flag('--charge', 0);
const PERKS = flag('--perks', 'none');

const { browser, page, errors } = await launch({ w: 1600, h: 900 });
const shots = [];
try {
  await boot(page, 'fresh&nointro' + (flag('--qs', '') ? '&' + flag('--qs') : '')); // (--qs chewy=classic: the kit rig)
  if (flag('--mode', 'dungeon') === 'dungeon') {
    await page.evaluate(() => { window.G.state.flags.burrowTut = true; window.G.enterDungeon(2); });
    await waitMode(page, 'dungeon');
  }
  await sleep(page, 500);
  const setup = await page.evaluate(async ({ SAYA, WEAPON, DIST, CAST, PERKS }) => {
    const G = window.G, P = G.player, V = G.THREE.Vector3, pl = G.state.player;
    if (SAYA) {
      // (the game's own instance of the module: under the dev server an edited module is served as …?t=…)
      const url = performance.getEntriesByType('resource').map(e => e.name).find(n => n.includes('/src/actors/heroModels.js')) || '/src/actors/heroModels.js';
      const { HERO_MODELS } = await import(url);
      // the samurai model's saya_mount.json tried on the Toybox chewy_b (whose waist is slimmer than the hakama's)
      HERO_MODELS.chewyToy.sayaMount = { mouth: [0.222, 0.44, 0.214], dir: [0.2676, -0.4738, -0.839], up: [0.144, 0.881, -0.451], bone: 'hips', out: 0 };
      P.replaceRig(P.constructor.buildRig(undefined, 'chewy'));
    }
    if (WEAPON && G.derived.weaponType !== WEAPON) { G.actions.swapWeapons(); P.setWeapon(G.derived.weaponType); }
    pl.lvl = 30; pl.stats.vit = 200; pl.stats.ene = 160;
    if (CAST) {
      const { SKILLS } = await import('/src/rpg/skills.js'); const { CHARGE } = await import('/src/rpg/charge.js');
      pl.skills[CAST] = 10;
      const perks = {}; if (CHARGE[CAST] && PERKS !== 'none') for (const [k, p] of Object.entries(CHARGE[CAST].perks)) if (PERKS === 'all' || k === 'stages') perks[k] = k === 'quick' ? 0 : p.ranks;
      pl.chargePerks = { [CAST]: perks };
      if (SKILLS[CAST]?.wep && G.derived.weaponType !== SKILLS[CAST].wep) { G.actions.swapWeapons(); P.setWeapon(G.derived.weaponType); }
    }
    G.actions.recompute(); G.actions.restoreAll();
    const W = G.world, { r: f } = G.engine.rig.groundAxes();
    if (G.dungeon) {
      for (const m of G.dungeon.monsters) if (m.alive) { m.status.stun = 999; m.pos.set(-999, 0, -999); }
      const s0 = G.dungeon.startPos; let best = null;
      for (let ring = 5; ring <= 16 && !best; ring++) for (let k = 0; k < 16 && !best; k++) {
        const a = k / 16 * Math.PI * 2, x = s0.x + Math.cos(a) * ring, z = s0.z + Math.sin(a) * ring; let ok = true;
        for (let dx = -3; dx <= 7 && ok; dx++) for (let dz = -3; dz <= 3 && ok; dz++) { const px = x + f.x * dx - f.z * dz, pz = z + f.z * dx + f.x * dz; if ((W.walkable && !W.walkable(px, pz)) || W.collision?.solidAt?.(px, pz, 0.3)) ok = false; }
        if (ok) best = { x, z };
      }
      const s = best || s0; P.setPos(s.x, s.z);
      if (CAST) {
        const before = G.dungeon.monsters.length;
        G.dungeon.summonAround({ pos: P.pos }, 'mochi', 3);
        G.dungeon.monsters.slice(before).forEach((m, i) => { const a = (i - 1) * 0.5, d = f.clone().applyAxisAngle(new V(0, 1, 0), a); m.pos.set(P.pos.x + d.x * 2.6, 0, P.pos.z + d.z * 2.6); m.lifeMax = m.life = 1e7; m.status.stun = 999; m.aggro = false; m.speed = 0; });
      }
    }
    G.engine.rig.distTarget = DIST; G.engine.rig.focus.copy(P.pos).setY(P.pos.y + 0.5); G.engine.rig.snap();
    G.__labFocus = () => { G.engine.rig.focus.copy(P.pos).setY(P.pos.y + 0.5); G.engine.rig.snap(); };
    return { hero: P.hero, model: P.rig.model, saya: !!P.rig.parts.saya, wt: G.derived.weaponType };
  }, { SAYA: has('--saya'), WEAPON: flag('--weapon', null), DIST, CAST, PERKS });
  console.log('setup', JSON.stringify(setup));
  await sleep(page, 600);
  // face: right = screen-right (a profile), front = toward the camera, left, back, 3q = between right and front
  const face = view => page.evaluate(view => {
    const G = window.G, P = G.player, { f, r } = G.engine.rig.groundAxes();
    const deg = { right: 0, '3q': -45, front: -90, left: 180, back: 90, '3qb': 45, '3ql': -135 }[view] ?? +view;
    const a = Math.atan2(r.x, r.z) + deg * Math.PI / 180;
    P.faceTarget = P.facing = a; return a;
  }, view);
  // the blade's direction in the hero's frame (f forward, u up, l his left) and the sword paw's height: printed under each shot
  const bladeInfo = () => page.evaluate(() => {
    const G = window.G, P = G.player, V = G.THREE.Vector3, a = new V(), b = new V(), h = new V();
    if (!P.sword || P.sword.scale.x < 0.01) return '';
    P.rig.root.updateMatrixWorld(true);
    P.sword.localToWorld(a.set(0, 0, 0)); P.sword.localToWorld(b.set(0, 0.6, 0)); b.sub(a).normalize();
    const fx = Math.sin(P.facing), fz = Math.cos(P.facing);
    const f = b.x * fx + b.z * fz, l = b.x * fz - b.z * fx;
    P.rig.parts.handL.getWorldPosition(h); const gap = h.distanceTo(P.sword.localToWorld(new V(0, -0.105, 0)));
    return `f${f.toFixed(2)} u${b.y.toFixed(2)} l${l.toFixed(2)} y${(a.y - P.pos.y).toFixed(2)} g${gap.toFixed(2)}`;
  });
  const snap = async label => {
    label = `${label}  ${await bladeInfo()}`; console.log(label);
    const clip = await page.evaluate(({ DIST, CROP }) => {
      const G = window.G, P = G.player, cam = G.engine.camera, v = new G.THREE.Vector3();
      v.copy(P.pos).setY(P.pos.y + 0.55).project(cam);
      const cx = (v.x * 0.5 + 0.5) * innerWidth, cy = (-v.y * 0.5 + 0.5) * innerHeight;
      const s = CROP || Math.round(5600 / DIST);
      return { x: Math.max(0, Math.round(cx - s / 2)), y: Math.max(0, Math.round(cy - s / 2)), width: s, height: s };
    }, { DIST, CROP });
    const file = path.join(OUT, `${TAG}-${String(shots.length).padStart(2, '0')}.png`);
    await page.screenshot({ path: file, clip });
    shots.push([file, label]);
  };
  const freeze = on => page.evaluate(on => { window.G.engine.timeScale = on ? 0 : 1; }, on);
  if (LAB) {
    // (set straight onto the animator: a dynamic import here may be another instance of animator.js than the game's)
    await page.evaluate(() => {
      window.__labDef = { dur: 99, hold: true, pose: (t, P, A) => {
        const L = window.__labA || {};
        for (const k in L) { const v = L[k]; if (v && typeof v === 'object') { for (const c in v) A[k][c] += v[c]; } else A[k] += v; }
      } };
    });
    for (const view of VIEWS) {
      for (const fr of LAB) {
        await face(fr.view || view);
        await page.evaluate(A => { window.__labA = A; const P = window.G.player; P.anim.action = { name: '__lab', def: window.__labDef, t: 0, dur: 99, fired: new Set(), onEvent: null }; window.G.__labFocus(); }, fr.A || {});
        await freeze(true); await sleep(page, 140);
        await snap(`${fr.label || ''} ${fr.view || view}`);
        await freeze(false);
      }
    }
  }
  for (const act of ACTS) for (const view of VIEWS) {
    for (const u of US) {
      await face(view);
      await page.evaluate(({ act, u }) => { const P = window.G.player; window.G.engine.timeScale = 0; P.anim.play(act); const a = P.anim.action; if (a) a.t = a.dur * u; window.G.__labFocus(); }, { act, u });
      await freeze(true); await sleep(page, 140);
      await snap(`${act} u=${u} ${view}`);
      await freeze(false);
    }
  }
  const REPEAT = +flag('--repeat', 1);
  if (CAST) for (const view of VIEWS) for (let rep = 0; rep < REPEAT; rep++) {
    await face(view); if (!rep) await sleep(page, 200);
    await page.evaluate(({ CAST, STAGE, HOLD, PRE }) => {
      const G = window.G, P = G.player, { r } = G.engine.rig.groundAxes();
      G.skills.cds = {}; G.actions.restoreAll?.();
      const aim = P.pos.clone().addScaledVector(r.clone().applyAxisAngle(new G.THREE.Vector3(0, 1, 0), P.facing - Math.atan2(r.x, r.z)), 3);
      window.__castOk = G.skills.tryCast(CAST, aim, null, STAGE ? { stage: STAGE } : null);
      if (HOLD && G.skills.channel) G.skills.channel.toggleHeld = true; // (a channel: keep it going as if the key were held)
      if (PRE) (0, eval)(PRE);
    }, { CAST, STAGE, HOLD: has('--hold'), PRE: flag('--pre', '') });
    // (game time, not wall time: it runs at a third of real speed while we wait, then freezes on the frame past ms)
    await page.evaluate(() => { window.__t0 = window.G.engine.time; });
    for (const ms of MS) {
      await page.evaluate(ms => new Promise(res => { const G = window.G; G.engine.timeScale = 0.33; const f = () => { if (G.engine.time - window.__t0 >= ms / 1000) { G.engine.timeScale = 0; res(); } else requestAnimationFrame(f); }; f(); }), ms);
      await sleep(page, 140); await snap(`${CAST}${REPEAT > 1 ? '#' + (rep + 1) : ''}${STAGE ? ' Ⅰ Ⅱ Ⅲ'.split(' ')[STAGE] : ''} +${ms}ms ${view}`);
    }
    // (a combo: let this one finish at speed and go straight into the next)
    if (rep < REPEAT - 1) { await page.evaluate(() => new Promise(res => { const G = window.G; G.engine.timeScale = 1; const f = () => { if (!G.player.anim.busy()) res(); else requestAnimationFrame(f); }; f(); })); continue; }
    await freeze(false);
    await sleep(page, 900);
  }
} catch (e) { errors.push('[harness] ' + e.stack); }
if (errors.length) console.log([...new Set(errors)].slice(0, 12).join('\n'));
await browser.close();
const list = path.join(OUT, `${TAG}.txt`);
fs.writeFileSync(list, shots.map(([f, l]) => `${f}\t${l}`).join('\n'));
try { console.log(execFileSync('python', [path.join(path.dirname(new URL(import.meta.url).pathname).replace(/^\/(\w:)/, '$1'), 'sheet.py'), list, path.join(OUT, `${TAG}.png`), flag('--cols', '4'), flag('--cell', '480')]).toString().trim()); } catch (e) { console.log('sheet failed', e.message); }
