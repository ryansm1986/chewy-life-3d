// The Golden Retriever dragoon's review shots (docs/GOLDEN.md §9): the baked model, his lance and javelins at the game
// camera, Shadow the dragon whelp (hovering, flapping, landing and sitting, indoors, the swap poof), a real Burrow fight
// with each move frozen at a few moments, the five-hero wheel and the HUD.
//   node tools/qa/golden-shots.mjs [look] [idle] [walk] [attack] [sunbeamThrust] [bonkDart] [whelp] [poof] [indoors] [wheel]
//     [coat] [pack [--stage 3] [--only a,b,all]] [--out dir] [--qs k=v]
// Writes PNGs to tools/qa/tmp/golden-shots (gitignored) (or --out) and prints any runtime errors. Time is frozen per shot
// (engine.timeScale 0) once a move has had `at` seconds to develop.
//  look: the village, the camera round him (front, both 45° yaws, behind) at the game's distance and a close one;
//  idle / walk: the Burrow, the lance drawn (the guard) at rest and walking;
//  attack and the skills: cast at a pack to the screen's right, frozen through the move;
//  whelp: Shadow in flight beside him in the village (hovering, mid-beat at both ends of the flap, following a walk,
//   landed and sitting); poof: a hero switch away and back (the outfit off and on); indoors: Chewy's house, walking;
//  wheel: all five heroes joined, Tab held (the hero wheel) and the HUD's mini portraits;
//  coat: his fur measured in the village light (the p35 / p60 of the ear drapes' lit texels facing the camera);
//  pack: real fights in a zone dungeon (Bamboo Depths B1F, as shihtzu-shots.mjs pack): a crowd of 18 closing in, each of
//   his 15 actives cast into it at level 30 / skill 12 and frozen at its moment (--stage 3: the charged releases, every
//   perk), then everything at once (pack-all).
import { launch, boot, waitMode, sleep } from './lib.mjs';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const val = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const OUT = val('--out') || 'tools/qa/tmp/golden-shots';
fs.mkdirSync(OUT, { recursive: true });
const QS = val('--qs') ? '&' + val('--qs') : '';
const ids = args.filter((a, i) => !a.startsWith('--') && !['--out', '--qs', '--only', '--stage'].includes(args[i - 1]));
const PLAN = {
  attack: { at: [0.16, 0.3, 0.46, 0.7], rep: 3 }, sunbeamThrust: { at: [0.3, 0.45, 0.6, 0.85] }, bonkDart: { at: [0.25, 0.45, 0.6, 0.9] },
  // checkpoint 2 (the hero at level 30, every skill at 12)
  sunfallJump: { at: [0.2, 0.55, 0.75, 1.0] }, pinwheelSweep: { at: [0.15, 0.25, 0.35, 0.5] }, gallantCharge: { at: [0.1, 0.25, 0.4, 0.6] }, starfallLance: { at: [0.25, 0.95, 1.2, 1.7] },
  tailwagVolley: { at: [0.2, 0.3, 0.45] }, trueFlight: { at: [0.25, 0.4, 0.55] }, emberleafJavelin: { at: [0.3, 0.8, 1.65] }, sunshower: { at: [0.35, 1.0, 1.8] },
  emberBreath: { at: [0.45, 0.8, 1.05] }, divebombSwoop: { at: [0.3, 0.55, 0.75] }, wingShield: { at: [0.4, 1.2] }, mightyRoar: { at: [0.5, 0.85] }, dragonHeart: { at: [0.6, 2.0] },
};
const want = ids.length ? ids : ['look', 'idle', 'walk', 'attack', 'sunbeamThrust', 'bonkDart', 'whelp', 'poof', 'indoors', 'wheel'];
const shot = async (page, name) => { const f = path.join(OUT, `${name}.png`); await page.screenshot({ path: f }); console.log('saved', f); };
const { browser, page, errors } = await launch({ w: 1600, h: 900 });
const camAround = async (page, list) => {
  for (const [name, dyaw, dist, fy] of list) {
    await page.evaluate(({ dyaw, dist, fy }) => {
      const G = window.G, P = G.player, R = G.engine.rig;
      G.engine.timeScale = 1; P.moveTarget = null;
      P.facing = P.faceTarget = R.yaw + dyaw; P.sync?.(); // (dyaw 0: facing the camera)
      R.distTarget = dist; R.snap();
      if (fy != null) { R.focus.y += fy; R.snap(); }
    }, { dyaw, dist, fy });
    await sleep(page, 700);
    await shot(page, name);
  }
};
try {
  if (want.includes('look')) {
    await boot(page, 'fresh&nointro&notut&hero=golden&hour=11' + QS);
    await sleep(page, 1800);
    await camAround(page, [['look-front', 0, 13], ['look-45r', Math.PI * 0.25, 13], ['look-45l', -Math.PI * 0.25, 13], ['look-back', Math.PI, 13],
      ['look-front-close', 0, 6.5], ['look-45r-close', Math.PI * 0.25, 6.5], ['look-45l-close', -Math.PI * 0.25, 6.5], ['look-back-close', Math.PI - 0.35, 6.5]]);
  }
  if (want.includes('coat')) {
    await boot(page, 'fresh&nointro&notut&hero=golden&hour=11' + QS);
    await sleep(page, 1800);
    const r = await page.evaluate(() => {
      // the lit colour of his fur: render the frame, then read back the pixels under the ear drapes' vertices that face the
      // camera (skinned positions), the 35th / 60th percentile by luminance
      const G = window.G, P = G.player, R = G.engine.rig, cam = G.engine.camera, renderer = G.engine.renderer, THREE = G.THREE;
      P.facing = P.faceTarget = R.yaw + 0.4; P.sync(); R.distTarget = 7; R.snap();
      return new Promise(res => requestAnimationFrame(() => requestAnimationFrame(() => {
        const skin = P.rig.skin, geo = skin.geometry, pos = geo.attributes.position, nrm = geo.attributes.normal, si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
        const bones = P.rig.skin.skeleton.bones, want = new Set(bones.map((b, i) => (/^ear/.test(b.name) ? i : -1)).filter(i => i >= 0));
        const v = new THREE.Vector3(), n = new THREE.Vector3(), cv = cam.position, pts = [];
        skin.updateMatrixWorld(true);
        for (let i = 0; i < pos.count; i += 3) {
          let w = 0; for (let k = 0; k < 4; k++) if (want.has(si.getComponent(i, k))) w += sw.getComponent(i, k);
          if (w < 0.6) continue;
          v.fromBufferAttribute(pos, i); skin.applyBoneTransform(i, v); v.applyMatrix4(skin.matrixWorld);
          n.fromBufferAttribute(nrm, i).transformDirection(skin.matrixWorld);
          if (n.dot(v.clone().sub(cv).normalize()) > -0.35) continue;
          const s = v.clone().project(cam); if (Math.abs(s.x) > 1 || Math.abs(s.y) > 1) continue;
          pts.push([Math.round((s.x + 1) / 2 * renderer.domElement.width), Math.round((1 - s.y) / 2 * renderer.domElement.height)]);
        }
        const c = document.createElement('canvas'); c.width = renderer.domElement.width; c.height = renderer.domElement.height;
        const g = c.getContext('2d'); g.drawImage(renderer.domElement, 0, 0);
        const px = pts.map(([x, y]) => { const d = g.getImageData(x, y, 1, 1).data; return [d[0], d[1], d[2]]; }).sort((a, b) => (a[0] * 0.3 + a[1] * 0.59 + a[2] * 0.11) - (b[0] * 0.3 + b[1] * 0.59 + b[2] * 0.11));
        const hex = p => '#' + p.map(x => x.toString(16).padStart(2, '0')).join('');
        res({ n: px.length, p35: px.length ? hex(px[Math.floor(px.length * 0.35)]) : null, p60: px.length ? hex(px[Math.floor(px.length * 0.6)]) : null, p85: px.length ? hex(px[Math.floor(px.length * 0.85)]) : null });
      })));
    });
    console.log('coat (village 11:00, ear drapes):', JSON.stringify(r));
    await shot(page, 'coat');
  }
  if (want.includes('whelp')) {
    await boot(page, 'fresh&nointro&notut&hero=golden&hour=11' + QS);
    await sleep(page, 2200);
    const sh = async (name, dist = 7, freeze = true) => {
      await page.evaluate(({ dist, freeze }) => { // (framed on Shadow at his height, a third of the way to Foosy)
        const G = window.G, R = G.engine.rig, S = G.companion, P = G.player;
        R.distTarget = dist; G.heroFocus = new G.THREE.Vector3(S.pos.x + (P.pos.x - S.pos.x) * 0.3, S.pos.y + S.whelp.lift * 0.8 - 0.3, S.pos.z + (P.pos.z - S.pos.z) * 0.3); R.focus.set(G.heroFocus.x, G.heroFocus.y + 0.6, G.heroFocus.z); R.snap();
        if (freeze) G.engine.timeScale = 0;
      }, { dist, freeze });
      await sleep(page, 200); await shot(page, name);
      await page.evaluate(() => { window.G.engine.timeScale = 1; window.G.heroFocus = null; });
    };
    // hovering beside him (the hero still, Shadow airborne), the camera at the game yaw
    await page.evaluate(() => { const G = window.G, S = G.companion, P = G.player; S.setPos(P.pos.x + 1.0, P.pos.z + 0.6); S.whelp.still = 0; S.whelp.landed = false; });
    await sleep(page, 1500);
    await sh('whelp-hover', 8);
    // mid-beat: wait for the up-stroke and the down-stroke ends
    for (const [name, want] of [['whelp-flap-up', 1], ['whelp-flap-down', -1]]) {
      await page.waitForFunction(w => { const W = window.G.companion.whelp; return W.air > 0.9 && Math.sin(W.ph) * w > 0.92; }, want, { timeout: 8000 }).catch(() => {});
      await sh(name, 5.5);
    }
    // following a walk (the pitch and the faster beat)
    await page.evaluate(() => { const G = window.G, P = G.player; P.moveTarget = new G.THREE.Vector3(P.pos.x + 9, 0, P.pos.z + 3); });
    await sleep(page, 1100);
    await sh('whelp-follow', 9);
    // landing and sitting: the hero still a while
    await page.evaluate(() => { const G = window.G; G.player.moveTarget = null; G.companion.whelp.still = 5.5; });
    await page.waitForFunction(() => { const S = window.G.companion; return S.whelp.lift < 0.02 && S.anim.action?.name === 'sit'; }, null, { timeout: 15000 }).catch(() => console.log('(no sit within 15 s)'));
    await sleep(page, 600);
    await sh('whelp-sit', 6);
  }
  if (want.includes('poof')) {
    await boot(page, 'fresh&nointro&notut&hero=golden&hour=11' + QS);
    await page.evaluate(() => { const G = window.G; for (const id of ['moka', 'poe', 'shihtzu']) G.state.flags[`${id}Joined`] = true; });
    await sleep(page, 1500);
    // the swap itself (the outfit off): force it with the camera close, frozen a beat into the poof
    await page.evaluate(() => { const G = window.G, S = G.companion, R = G.engine.rig; R.focus.copy(S.pos); R.distTarget = 6; R.snap(); S.whelp.swap(false); });
    await sleep(page, 120); await page.evaluate(() => { window.G.engine.timeScale = 0; }); await shot(page, 'poof-off'); await page.evaluate(() => { window.G.engine.timeScale = 1; });
    await sleep(page, 900);
    await page.evaluate(() => { const G = window.G, S = G.companion; S.whelp.swap(true); });
    await sleep(page, 120); await page.evaluate(() => { window.G.engine.timeScale = 0; }); await shot(page, 'poof-on'); await page.evaluate(() => { window.G.engine.timeScale = 1; });
    // a real switch to Chewy: the outfit comes off; and back
    const sw = async to => { await page.waitForFunction(() => !window.G.heroSwitching && window.G.heroes.cd <= 0, null, { timeout: 15000 }); await page.evaluate(id => window.G.heroes.switchTo(id), to); await page.waitForFunction(id => window.G.state.activeHero === id && !window.G.heroSwitching, to, { timeout: 15000 }); await sleep(page, 700); };
    await sw('chewy');
    console.log('switched to chewy; whelp on:', await page.evaluate(() => window.G.companion.whelp.on), 'model:', await page.evaluate(() => window.G.companion.rig.model));
    await sw('golden');
    console.log('back to the dragoon; whelp on:', await page.evaluate(() => window.G.companion.whelp.on), 'model:', await page.evaluate(() => window.G.companion.rig.model));
  }
  if (want.includes('indoors')) {
    await boot(page, 'fresh&nointro&notut&hero=golden&hour=11' + QS);
    await sleep(page, 1500);
    const ok = await page.evaluate(async () => { const G = window.G; const rec = G.sim.list.find(r => r.data.type === 'chewyHouse'); if (!rec || !G.housing?.enter) return false; await G.housing.enter(rec); return true; });
    if (ok) {
      await waitMode(page, 'interior').catch(() => {});
      await sleep(page, 1500);
      await page.evaluate(() => { const G = window.G, P = G.player; P.moveTarget = new G.THREE.Vector3(P.pos.x + 2.5, 0, P.pos.z - 1.5); });
      await sleep(page, 900);
      console.log('indoors: whelp lift', await page.evaluate(() => window.G.companion.whelp.lift.toFixed(2)), 'mode', await page.evaluate(() => window.G.mode));
      await shot(page, 'whelp-indoors');
    } else console.log('(no house entry hook: indoors skipped)');
  }
  for (const id of ['idle', 'walk', 'attack', ...Object.keys(PLAN).filter(k => k !== 'attack')]) {
    if (!want.includes(id)) continue;
    await boot(page, 'fresh&nointro&notut&hero=golden&floor=2' + QS);
    await waitMode(page, 'dungeon');
    await sleep(page, 1500);
    if (!['idle', 'walk', 'attack', 'sunbeamThrust', 'bonkDart'].includes(id)) await page.evaluate(async () => { const G = window.G, P = G.state.player, { SKILLS } = await import('/src/rpg/skills.js'); P.lvl = 30; P.stats = { str: 160, dex: 60, vit: 300, ene: 150 }; for (const k of Object.keys(SKILLS)) if (SKILLS[k].cls === 'golden') P.skills[k] = 12; G.actions.recompute(); G.actions.restoreAll?.(); });
    if (id === 'idle' || id === 'walk') {
      if (id === 'walk') await page.evaluate(() => { const G = window.G, P = G.player, y = G.engine.rig.yaw; P.moveTarget = new G.THREE.Vector3(P.pos.x - Math.sin(y) * 6, 0, P.pos.z - Math.cos(y) * 6); }); // (away from the camera, up the screen)
      await sleep(page, id === 'walk' ? 500 : 1200);
      await page.evaluate(() => { const G = window.G, R = G.engine.rig; R.distTarget = 9; R.focus.copy(G.player.pos); R.snap(); G.engine.timeScale = 0; });
      await sleep(page, 150); await shot(page, id);
      continue;
    }
    // a pack in front of him (parked, stunned, unkillable), the camera at the game's yaw, each moment frozen
    const plan = PLAN[id];
    for (let rep = 0; rep < (plan.rep || 1); rep++) {
      for (const at of plan.at) {
        await page.evaluate(({ id, rep }) => {
          const G = window.G, P = G.player, R = G.engine.rig, D = G.dungeon;
          G.engine.timeScale = 1; P.anim.stop();
          const yaw = R.yaw, f = { x: Math.cos(yaw), z: -Math.sin(yaw) }; // (the camera's right: the pack stands to his right on screen)
          P.facing = P.faceTarget = Math.atan2(f.x, f.z);
          const live = D.monsters.filter(m => m.alive && !m.def.boss).sort((a, b) => a.pos.distanceTo(P.pos) - b.pos.distanceTo(P.pos));
          live.slice(0, 5).forEach((m, i) => { const a = (i - 2) * 0.32, d = 2.4 + (i % 2) * 1.1; m.pos.set(P.pos.x + (f.x * Math.cos(a) - f.z * Math.sin(a)) * d, m.pos.y, P.pos.z + (f.z * Math.cos(a) + f.x * Math.sin(a)) * d); m.lifeMax = m.life = 1e6; m.status.stun = 99; });
          for (const m of live.slice(5)) if (Math.hypot(m.pos.x - P.pos.x, m.pos.z - P.pos.z) < 14) m.pos.x += 30;
          G.skills.cds = {}; G.state.player.zoom = null; G.skills.clearGolden?.();
          if (id === 'attack') { G.skills.gldCombo = rep; G.skills.gldComboT = G.engine.time; }
          const t = live[0];
          G.skills.tryCast(id, t ? t.pos.clone() : P.pos.clone().add(new G.THREE.Vector3(f.x * 3, 0, f.z * 3)), t || null);
          R.distTarget = 9; R.focus.copy(P.pos); R.snap(); window.__t0 = G.engine.time;
        }, { id, rep });
        await page.waitForFunction(at => (window.G.engine.time - window.__t0) >= at, at, { timeout: 8000 }).catch(() => {});
        await page.evaluate(() => { window.G.engine.timeScale = 0; });
        await sleep(page, 120);
        await shot(page, `${id}${plan.rep ? '-' + rep : ''}-${String(at).replace('.', '')}`);
        await page.evaluate(() => { const G = window.G; G.engine.timeScale = 1; G.player.anim.stop(); });
        await sleep(page, 450);
      }
    }
  }
  if (want.includes('strip')) { // each move frozen at 8 moments, cropped round him, front and side views, as contact sheets
    await boot(page, 'fresh&nointro&notut&hero=golden&floor=2' + QS);
    await waitMode(page, 'dungeon');
    await sleep(page, 1500);
    await page.evaluate(async () => { const G = window.G, P = G.state.player, { SKILLS } = await import('/src/rpg/skills.js'); P.lvl = 30; for (const k of Object.keys(SKILLS)) if (SKILLS[k].cls === 'golden') P.skills[k] = 12; G.actions.recompute(); });
    const moves = [['thrust1', 'attack', 0], ['thrust2', 'attack', 1], ['swat', 'attack', 2], ['sunbeam', 'sunbeamThrust', 0], ['bonk', 'bonkDart', 0],
      ['jump', 'sunfallJump', 0, 0.16], ['pinwheel', 'pinwheelSweep', 0], ['charge', 'gallantCharge', 0], ['starfall', 'starfallLance', 0], ['volley', 'tailwagVolley', 0], ['true', 'trueFlight', 0],
      ['shower', 'sunshowerThrow', 0], ['call', 'emberBreath', 0]].filter(x => !val('--only') || val('--only').split(',').includes(x[0]));
    for (const view of (val('--view') || 'front,side').split(',')) for (const [name, cast0, combo, step] of moves) {
      const cast = cast0 === 'sunshowerThrow' ? 'sunshower' : cast0;
      const rows = [];
      await page.evaluate(({ cast, combo, view }) => {
        const G = window.G, P = G.player, D = G.dungeon, R = G.engine.rig;
        G.engine.timeScale = 1; P.anim.stop();
        const live = D.monsters.filter(m => m.alive && !m.def.boss).sort((a, b) => a.pos.distanceTo(P.pos) - b.pos.distanceTo(P.pos));
        const f = P.facing, fx = Math.sin(f), fz = Math.cos(f);
        live.slice(0, 3).forEach((m, i) => { m.pos.set(P.pos.x + fx * (2.4 + i * 0.9) + fz * (i - 1) * 0.5, m.pos.y, P.pos.z + fz * (2.4 + i * 0.9) - fx * (i - 1) * 0.5); m.lifeMax = m.life = 1e6; m.status.stun = 99; });
        for (const m of live.slice(3)) if (Math.hypot(m.pos.x - P.pos.x, m.pos.z - P.pos.z) < 14) m.pos.x += 30;
        R.yawTarget = view === 'front' ? f + 0.5 : f + Math.PI / 2; R.distTarget = 6.5; R.focus.copy(P.pos); R.snap();
        G.skills.cds = {}; G.state.player.zoom = null; G.skills.gldCombo = combo; G.skills.gldComboT = G.engine.time; G.skills.clearGolden?.();
        G.skills.tryCast(cast, live[0].pos.clone(), live[0]); window.__t0 = G.engine.time;
      }, { cast, combo, view });
      for (let k = 0; k < 8; k++) {
        const at = 0.05 + k * (step || 0.085);
        await page.waitForFunction(at => (window.G.engine.time - window.__t0) >= at, at, { timeout: 8000 }).catch(() => {});
        const c = await page.evaluate(() => { const G = window.G; G.engine.timeScale = 0; const v = G.player.pos.clone().setY(G.player.pos.y + 0.6).project(G.engine.camera); return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight }; });
        await sleep(page, 90);
        const f = path.join(OUT, `strip-${name}-${view}-${k}.png`);
        await page.screenshot({ path: f, clip: { x: Math.max(0, c.x - 280), y: Math.max(0, c.y - 300), width: 560, height: 560 } });
        rows.push(f);
        await page.evaluate(() => { window.G.engine.timeScale = 1; });
      }
      fs.writeFileSync(path.join(OUT, `strip-${name}-${view}.txt`), rows.join('\n'));
      await sleep(page, 700);
    }
  }
  if (want.includes('pack')) { // real fights in a zone dungeon (Bamboo Depths B1F): a big pack closing in, each skill cast into it
    await boot(page, 'fresh&nointro&notut&hero=golden' + QS);
    await sleep(page, 1200);
    await page.evaluate(async () => {
      const G = window.G, P = G.state.player, { SKILLS } = await import('/src/rpg/skills.js');
      P.lvl = 30; P.stats = { str: 160, dex: 60, vit: 300, ene: 150 }; P.statPts = 0;
      for (const id of Object.keys(SKILLS)) if (SKILLS[id].cls === 'golden') P.skills[id] = 12;
      G.actions.recompute(); G.actions.restoreAll?.(); G.actions.addXp = () => {};
      G.state.flags.burrowTut = true;
      G.enterDungeon({ id: 'bambooDepths', floor: 1 });
    });
    await page.waitForFunction(() => window.G?.mode === 'dungeon' && window.G.dungeon?.monsters?.length && !window.G.ui?.iris?.active, null, { timeout: 40000 });
    await sleep(page, 2000);
    // the pack: 18 of the floor's kinds in a loose crowd 5 m off his facing (toward the screen's right), aggroed, tough (×30 life)
    await page.evaluate(() => {
      const G = window.G, D = G.dungeon, P = G.player, KINDS = ['takenoko', 'kodama', 'kamaitachi', 'iwabozu', 'kurage', 'tanuki'];
      D.warmMonsters?.(KINDS);
      const { f: cf, r: cr } = G.engine.rig.groundAxes(), L = Math.hypot(cr.x + 0.6 * cf.x, cr.z + 0.6 * cf.z), f = { x: (cr.x + 0.6 * cf.x) / L, z: (cr.z + 0.6 * cf.z) / L };
      const clear = (x, z) => { for (let r = 0; r <= 7.5; r += 1.5) for (let a = 0; a < 6.283; a += 0.5) { const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r; if (!G.world.walkable(px, pz) || G.world.collision?.solidAt?.(px, pz, 0.3)) return false; } return true; };
      let home = null;
      const cl = (x, z, R) => { for (let r = 0; r <= R; r += 1) for (let a = 0; a < 6.283; a += 0.6) { const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r; if (!G.world.walkable(px, pz)) return false; } return true; };
      for (const m of [...D.monsters].sort((a, b) => a.pos.distanceTo(P.pos) - b.pos.distanceTo(P.pos))) { const d = Math.hypot(m.pos.x - P.pos.x, m.pos.z - P.pos.z); if (d > 16 && d < 60 && cl(m.pos.x, m.pos.z, 5)) { home = m.pos.clone(); break; } }
      for (let d = 14; d <= 60 && !home; d += 3) for (let a = 0; a < 6.283 && !home; a += 0.3) { const x = P.pos.x + Math.cos(a) * d, z = P.pos.z + Math.sin(a) * d; if (clear(x, z)) home = new P.pos.constructor(x, G.world.heightAt(x, z), z); }
      window.__pack = { dir: f, home: home || P.pos.clone(), list: [] };
      const lvl = D.layout.mlvl || 8;
      for (let i = 0; i < 18; i++) {
        const id = KINDS[i % KINDS.length], m = D.spawnMonster(id, { level: lvl, rank: i === 5 ? 'champion' : 'normal', variant: i % 3, x: P.pos.x, z: P.pos.z });
        m.lifeMax = m.life = m.lifeMax * 30; window.__pack.list.push(m);
      }
      for (const m of D.monsters) if (m.alive && !window.__pack.list.includes(m) && Math.hypot(m.pos.x - window.__pack.home.x, m.pos.z - window.__pack.home.z) < 30) { m.pos.x += 80; m.aggro = false; }
      window.__regroup = (spread = 1) => {
        const K = window.__pack, P2 = G.player, S = G.companion; G.engine.timeScale = 1;
        G.skills.clearGolden?.();
        P2.setPos(K.home.x, K.home.z); P2.pos.y = G.world.heightAt(P2.pos.x, P2.pos.z); P2.facing = P2.faceTarget = Math.atan2(K.dir.x, K.dir.z);
        if (S) { S.setPos(K.home.x - K.dir.z * 1.1 - K.dir.x * 0.4, K.home.z + K.dir.x * 1.1 - K.dir.z * 0.4); S.fainted = 0; S.untargetable = false; S.life = S.lifeMax; S.anim.stop(); }
        K.list.forEach((m, i) => {
          if (!m.alive) return;
          const a = (i * 2.4) % 6.283, r = (0.4 + Math.sqrt(i / 18) * 2.6) * spread, d = 5.2;
          m.pos.set(K.home.x + K.dir.x * d + Math.cos(a) * r, m.pos.y, K.home.z + K.dir.z * d + Math.sin(a) * r);
          m.life = m.lifeMax; m.aggro = true; m.status = {}; m.knock?.set?.(0, 0, 0); m.cursedMul = 1;
        });
        G.actions.restoreAll?.(); G.skills.cds = {}; G.state.player.zoom = null;
        G.engine.rig.focus.set(P2.pos.x + K.dir.x * 2.2, P2.pos.y, P2.pos.z + K.dir.z * 2.2); G.engine.rig.distTarget = +(window.__dist || 15); G.engine.rig.snap();
      };
      window.__center = () => { const K = window.__pack; let x = 0, z = 0, n = 0; for (const m of K.list) if (m.alive) { x += m.pos.x; z += m.pos.z; n++; } return n ? new P.pos.constructor(x / n, P.pos.y, z / n) : P.pos.clone(); };
    });
    const STAGE = +(val('--stage') || 0);
    if (STAGE) await page.evaluate(async (s) => { const G = window.G, { CHARGE } = await import('/src/rpg/charge.js'); window.__stage = s; const P = G.state.player; P.chargePerks = {}; for (const id in CHARGE) if (CHARGE[id] && P.skills[id]) P.chargePerks[id] = Object.fromEntries(Object.entries(CHARGE[id].perks).map(([k, q]) => [k, q.ranks])); G.actions.recompute(); }, STAGE);
    // [shot name, skill, when to freeze: seconds after the cast, or 'action:u' (the hero's action at that progress)]
    const AREA = ['starfallLance', 'sunshower', 'wingShield', 'mightyRoar', 'dragonHeart'];
    const PLAN2 = [
      ['sunbeamThrust', 'sunbeamThrust', 'sunbeamThrust:0.56'], ['sunfallJump-air', 'sunfallJump', 'sunfallJump:0.5'], ['sunfallJump', 'sunfallJump', 'sunfallJump:0.8'],
      ['pinwheelSweep', 'pinwheelSweep', 'pinwheel:0.56'], ['gallantCharge', 'gallantCharge', 'gallantCharge:0.42'], ['starfallLance-fall', 'starfallLance', 1.1], ['starfallLance', 'starfallLance', 1.28],
      ['bonkDart', 'bonkDart', 0.62], ['tailwagVolley', 'tailwagVolley', 0.5], ['trueFlight', 'trueFlight', 0.5], ['emberleafJavelin-glow', 'emberleafJavelin', 1.1], ['emberleafJavelin', 'emberleafJavelin', 1.75],
      ['sunshower', 'sunshower', 1.5], ['emberBreath', 'emberBreath', 1.0], ['divebombSwoop-dive', 'divebombSwoop', 0.62], ['divebombSwoop', 'divebombSwoop', 0.8],
      ['wingShield', 'wingShield', 1.1], ['mightyRoar', 'mightyRoar', 0.95], ['dragonHeart', 'dragonHeart', 2.4],
    ].filter(x => !val('--only') || val('--only').split(',').includes(x[0]));
    for (const [name, id, at] of PLAN2) {
      await page.evaluate(() => { window.__regroup(); });
      await sleep(page, 1100); // (the crowd closes in: a real fight)
      await page.evaluate(({ id, AREA }) => {
        const G = window.G, P = G.player, c = window.__center(), K = window.__pack;
        const near = K.list.filter(m => m.alive).sort((a, b) => a.pos.distanceTo(P.pos) - b.pos.distanceTo(P.pos))[0];
        G.state.player.zoom = null; G.skills.cds = {}; if (P.anim.busy()) P.anim.stop();
        window.__ok = G.skills.tryCast(id, AREA.includes(id) ? c : near.pos.clone(), AREA.includes(id) ? null : near, window.__stage ? { stage: window.__stage } : undefined);
        window.__t0 = G.engine.time;
      }, { id, AREA });
      if (typeof at === 'string') await page.waitForFunction(([a, u]) => { const x = window.G.player.anim.action; return x?.name === a && x.t / x.dur >= +u; }, at.split(':'), { timeout: 15000, polling: 'raf' }).catch(() => {});
      else await page.waitForFunction(at => (window.G.engine.time - window.__t0) >= at, at, { timeout: 15000 }).catch(() => {});
      await page.evaluate(() => { window.G.engine.timeScale = 0; });
      await sleep(page, 150);
      await shot(page, `pack-${name}${STAGE ? '-c' + STAGE : ''}`);
      if (!(await page.evaluate(() => window.__ok))) console.log('cast refused:', name);
      if (process.env.DEBUG) console.log(' ', name, JSON.stringify(await page.evaluate(() => { const G = window.G, S = G.skills, sh = G.companion; const v = G.player.rig.root.position.clone().project(G.engine.camera); return { scr: [Math.round((v.x * 0.5 + 0.5) * innerWidth), Math.round((-v.y * 0.5 + 0.5) * innerHeight)], oy: +(G.player.rig.offsetY || 0).toFixed(2), anim: G.player.anim.action?.name, act: S.gldW?.kind, phase: S.gldW?.phase, lift: +(sh.whelp.lift || 0).toFixed(2), grow: +(sh.anim.grow || 1).toFixed(2), big: !!S.gldBig, shield: S.gldShield ? Math.round(S.gldShield.left) : null, star: S.gldStar?.state, jav: (S.gldJav || []).length, life: Math.round(G.actions.life()), sh: Math.round(sh.life) }; })));
      await page.evaluate(() => { window.G.engine.timeScale = 1; });
    }
    if (!val('--only') || val('--only').split(',').includes('all')) {
      // everything at once (readability): the shield, the dragon-sized Shadow sweeping, the roar's courage, a star falling, the
      // sunshower's rain, an Emberleaf javelin glowing and a fan of javelins, then a thrust, frozen at the game's own distance
      await page.evaluate(() => { window.__dist = 18; window.__regroup(1.25); });
      const seq = [['wingShield', 0.7], ['dragonHeart', 2.2], ['mightyRoar', 1.1], ['sunshower', 0.9], ['emberleafJavelin', 0.6], ['starfallLance', 0.5], ['tailwagVolley', 0.5], ['sunbeamThrust', 0.32]];
      for (const [id, wait] of seq) {
        await page.evaluate(({ id }) => {
          const G = window.G, P = G.player, c = window.__center(), K = window.__pack;
          const near = K.list.filter(m => m.alive).sort((a, b) => a.pos.distanceTo(P.pos) - b.pos.distanceTo(P.pos))[0];
          G.state.player.zoom = null; G.skills.cds = {}; G.actions.restoreAll?.(); for (const m of K.list) if (m.alive) m.life = m.lifeMax;
          const area = ['starfallLance', 'sunshower', 'wingShield', 'mightyRoar', 'dragonHeart'].includes(id);
          if (P.anim.busy()) P.anim.stop();
          G.skills.tryCast(id, area ? c : near.pos.clone(), area ? null : near);
        }, { id });
        await sleep(page, wait * 1000);
      }
      await page.evaluate(() => { window.G.engine.timeScale = 0; });
      await sleep(page, 150);
      await shot(page, 'pack-all');
      console.log('all at once:', JSON.stringify(await page.evaluate(() => { const S = window.G.skills; return { big: !!S.gldBig, shield: !!S.gldShield, roar: !!window.G.combat.buffs.roar, star: S.gldStar?.state || null, rain: !!S.gldRain, javelins: (S.gldJav || []).length }; })));
      await page.evaluate(() => { window.G.engine.timeScale = 1; window.__dist = 15; });
    }
  }
  if (want.includes('wheel')) {
    await boot(page, 'fresh&nointro&notut&hero=golden&hour=11' + QS);
    await page.evaluate(() => { const G = window.G; for (const id of ['moka', 'poe', 'shihtzu']) G.state.flags[`${id}Joined`] = true; G.heroes.spawnBench(); });
    await sleep(page, 1500);
    await shot(page, 'hud');
    await page.keyboard.down('Tab'); await sleep(page, 700);
    await shot(page, 'wheel');
    await page.keyboard.up('Tab');
  }
} finally {
  if (errors.length) console.log('ERRORS:\n' + errors.slice(0, 20).join('\n'));
  await browser.close();
}
