// The samurai Chewy model in the game (docs/HEROES.md §8): the owner's review shots. Writes PNGs and contact sheets to
// $SHOT_DIR (default: the session scratchpad's samurai3/owner folder).
//   node tools/qa/samurai-model-shots.mjs [names...]    names: village fight grip sheath walk ui
// (the skills on the model: node tools/qa/samurai-shots.mjs combo chomp zoom saya)
import { launch, boot, waitMode, sleep } from './lib.mjs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const OUT = process.env.SHOT_DIR || 'C:/Users/there/AppData/Local/Temp/claude/D--projects-chewy-life-3d/91c675c9-ac30-57d0-b5d5-725868e188fd/scratchpad/samurai3/owner';
fs.mkdirSync(OUT, { recursive: true });
const want = process.argv.slice(2).filter(a => !a.startsWith('--'));
const on = n => !want.length || want.includes(n);
const { browser, page, errors } = await launch({ w: 1600, h: 900 });
const ev = (f, a) => page.evaluate(f, a);
const sheets = [];
const sheet = (name, files, cols = 4, cell = 480) => {
  const list = path.join(OUT, `${name}.txt`); fs.writeFileSync(list, files.map(([f, l]) => `${f}\t${l}`).join('\n'));
  try { execFileSync('python', [path.join(dir, 'sheet.py'), list, path.join(OUT, `${name}.png`), String(cols), String(cell)]); sheets.push(path.join(OUT, `${name}.png`)); } catch (e) { console.log('sheet failed', e.message); }
};
// the hero, centred: a square crop of s px (0 = the whole frame)
const shot = async (name, s = 0, yOff = 0.55) => {
  const file = path.join(OUT, `${name}.png`);
  const clip = s ? await ev(({ s, yOff }) => { const G = window.G, P = G.player, v = new G.THREE.Vector3().copy(P.pos).setY(P.pos.y + yOff).project(G.engine.camera); const cx = (v.x * 0.5 + 0.5) * innerWidth, cy = (-v.y * 0.5 + 0.5) * innerHeight; return { x: Math.max(0, Math.min(innerWidth - s, Math.round(cx - s / 2))), y: Math.max(0, Math.min(innerHeight - s, Math.round(cy - s / 2))), width: s, height: s }; }, { s, yOff }) : undefined;
  await page.screenshot({ path: file, clip }); return file;
};
const cam = (o) => ev(o => { const r = window.G.engine.rig, P = window.G.player; if (o.yaw != null) r.yawTarget = r.yaw = o.yaw; if (o.dist) r.distTarget = o.dist; r.focus.copy(P.pos).setY(P.pos.y + (o.fy ?? 0.5)); r.snap(); }, o);
// face: right = screen-right, front = toward the camera, 3q = between, left, back, 3ql = toward the camera and screen-left
const face = view => ev(view => { const G = window.G, P = G.player, { r } = G.engine.rig.groundAxes(); const deg = { right: 0, '3q': -45, front: -90, left: 180, back: 90, '3qb': 45, '3ql': -135 }[view] ?? +view; P.faceTarget = P.facing = Math.atan2(r.x, r.z) + deg * Math.PI / 180; }, view);
const freeze = f => ev(f => { window.G.engine.timeScale = f ? 0 : 1; }, f);
const village = async (qs = '') => { await boot(page, `fresh&nointro&hour=11${qs}`); await sleep(page, 900); };
const burrow = async () => {
  await boot(page, 'fresh&nointro'); await ev(() => { window.G.state.flags.burrowTut = true; window.G.enterDungeon(2); }); await waitMode(page, 'dungeon'); await sleep(page, 900);
  // an open spot (as tools/qa/pose-lab.mjs)
  await ev(() => {
    const G = window.G, P = G.player, W = G.world, { r: f } = G.engine.rig.groundAxes(), s0 = G.dungeon.startPos; let best = null;
    for (let ring = 5; ring <= 16 && !best; ring++) for (let k = 0; k < 16 && !best; k++) {
      const a = k / 16 * Math.PI * 2, x = s0.x + Math.cos(a) * ring, z = s0.z + Math.sin(a) * ring; let ok = true;
      for (let dx = -4; dx <= 6 && ok; dx++) for (let dz = -4; dz <= 4 && ok; dz++) { const px = x + f.x * dx - f.z * dz, pz = z + f.z * dx + f.x * dz; if ((W.walkable && !W.walkable(px, pz)) || W.collision?.solidAt?.(px, pz, 0.3)) ok = false; }
      if (ok) best = { x, z };
    }
    if (best) P.setPos(best.x, best.z);
    for (const m of G.dungeon.monsters) { m.status.stun = 999; m.pos.set(-999, 0, -999); }
  });
};
try {
  const info = async () => ev(() => { const P = window.G.player; return { model: P.rig.model, saya: !!P.rig.parts.saya, wt: window.G.derived.weaponType }; });
  // ---------------------------------------------------------------- the village, at both 45° camera yaws
  if (on('village')) {
    await village(); console.log('village', JSON.stringify(await info()));
    const files = [];
    for (const [yaw, tag] of [[Math.PI / 4, 'yaw +45'], [-Math.PI / 4, 'yaw −45']]) {
      await cam({ yaw, dist: 13 }); await face('3q'); await sleep(page, 2500); // (idle long enough to sheathe)
      files.push([await shot(`village-${files.length}`), `village, ${tag}`]);
      await cam({ yaw, dist: 7 }); await sleep(page, 600);
      files.push([await shot(`village-${files.length}`, 700), `village close, ${tag}`]);
    }
    sheet('village', files, 2, 800);
  }
  // ---------------------------------------------------------------- a Burrow fight
  if (on('fight')) {
    await burrow(); console.log('fight', JSON.stringify(await info()));
    await ev(() => {
      const G = window.G, P = G.player, { r } = G.engine.rig.groundAxes(), n0 = G.dungeon.monsters.length;
      G.dungeon.summonAround({ pos: P.pos }, 'mochi', 5);
      G.dungeon.monsters.slice(n0).forEach((m, i) => { const a = -0.9 + i * 0.45, c = Math.cos(a), s = Math.sin(a); m.pos.set(P.pos.x + (r.x * c - r.z * s) * 2.2, 0, P.pos.z + (r.z * c + r.x * s) * 2.2); m.lifeMax = m.life = 1e6; });
      window.__foe = G.dungeon.monsters[n0 + 2];
    });
    await cam({ dist: 12 });
    const files = [];
    for (let i = 0; i < 4; i++) {
      await ev(() => { const G = window.G; G.skills.cds = {}; G.player.anim.stop(); G.actions.restoreAll(); G.skills.tryCast('attack', window.__foe.pos.clone(), window.__foe); });
      await sleep(page, 260 + (i % 2) * 120);
      files.push([await shot(`fight-${i}`, 0), `Burrow fight, cut ${i + 1}`]);
      await sleep(page, 200);
    }
    sheet('fight', files, 2, 800);
  }
  // ---------------------------------------------------------------- the katana in the paw: at rest and mid-cut, close
  if (on('grip')) {
    await burrow(); console.log('grip', JSON.stringify(await info()));
    const files = [];
    for (const v of ['3q', 'front', 'right', '3ql']) { await face(v); await cam({ dist: 4.5 }); await sleep(page, 700); files.push([await shot(`grip-${files.length}`, 640), `in the paw, at rest, ${v}`]); }
    for (const [act, u] of [['cut1', 0.32], ['cut3', 0.5]]) for (const v of ['3q', 'front']) {
      await face(v); await ev(({ act, u }) => { const G = window.G, P = G.player; G.engine.timeScale = 0; P.anim.play(act); const a = P.anim.action; if (a) a.t = a.dur * u; }, { act, u }); await cam({ dist: 4.5 }); await sleep(page, 200);
      files.push([await shot(`grip-${files.length}`, 640), `${act} u=${u}, ${v}`]); await freeze(false);
    }
    sheet('grip', files, 4, 480);
  }
  // ---------------------------------------------------------------- sheathed: the hilt in the saya mouth, at rest and walking
  if (on('sheath')) {
    await village(); console.log('sheath', JSON.stringify(await info()));
    const files = [];
    await sleep(page, 2500);
    for (const v of ['3q', 'front', 'right', 'left', '3ql', 'back']) { await face(v); await cam({ dist: 3.6, fy: 0.45 }); await sleep(page, 500); files.push([await shot(`sheath-${files.length}`, 560, 0.45), `sheathed, at rest, ${v}`]); }
    // walking: hold a key (screen-right) and catch the stride
    await cam({ dist: 5.5, fy: 0.45 });
    await page.keyboard.down('KeyD');
    for (let i = 0; i < 4; i++) { await sleep(page, 210); await cam({ dist: 5.5, fy: 0.45 }); files.push([await shot(`sheath-${files.length}`, 640, 0.5), `sheathed, moving (speed ${(await ev(() => window.G.player.anim.speed)).toFixed(1)})`]); }
    await page.keyboard.up('KeyD');
    sheet('sheath', files, 5, 400);
  }
  // ---------------------------------------------------------------- the walk and the run (the Burrow: the katana drawn)
  if (on('walk')) {
    const files = [];
    for (const where of ['village', 'burrow']) {
      if (where === 'village') await village(); else await burrow();
      await cam({ dist: 7 });
      for (const [key, tag] of [['KeyD', 'screen-right'], ['KeyS', 'toward the camera']]) {
        await page.keyboard.down(key);
        for (let i = 0; i < 3; i++) { await sleep(page, 240); await cam({ dist: 7 }); const sp = await ev(() => window.G.player.anim.speed); files.push([await shot(`walk-${files.length}`, 640), `${where}, ${tag} (speed ${sp.toFixed(1)}, run ${(await ev(() => window.G.player.anim.runAmt)).toFixed(2)})`]); }
        await page.keyboard.up(key); await sleep(page, 400);
      }
    }
    sheet('walk', files, 6, 400);
  }
  // ---------------------------------------------------------------- the HUD portrait, the hero wheel, the C and K panels
  if (on('ui')) {
    await village(); await ev(() => { const f = window.G.state.flags; f.mokaJoined = true; f.poeJoined = true; });
    await sleep(page, 600);
    const files = [];
    const box = await ev(() => { const r = document.querySelector('.pc-face')?.closest('[class*="pc"]')?.getBoundingClientRect() || document.querySelector('.pc-face')?.getBoundingClientRect(); return r ? { x: Math.max(0, r.x - 20), y: Math.max(0, r.y - 20), width: Math.min(560, r.width + 300), height: r.height + 60 } : null; });
    if (box) { const f = path.join(OUT, 'ui-hud.png'); await page.screenshot({ path: f, clip: box }); files.push([f, 'HUD portrait']); }
    await ev(() => window.G.heroes.openWheel()); await sleep(page, 900);
    { const f = path.join(OUT, 'ui-wheel.png'); await page.screenshot({ path: f, clip: { x: 400, y: 100, width: 800, height: 700 } }); files.push([f, 'hero wheel']); }
    await ev(() => window.G.heroes.wheel?.hide()); await sleep(page, 300);
    for (const [p, tag] of [['character', 'C panel'], ['skills', 'K panel']]) {
      await ev(p => window.G.ui.open(p), p); await sleep(page, 900);
      const f = path.join(OUT, `ui-${p}.png`); await page.screenshot({ path: f }); files.push([f, tag]);
      await ev(p => window.G.ui.close(p), p); await sleep(page, 300);
    }
    sheet('ui', files, 2, 800);
  }
} catch (e) { console.log('ERR', e.stack); }
console.log('page errors:', errors.length, errors.slice(0, 4).join(' | '));
for (const s of sheets) console.log(s);
await browser.close();
