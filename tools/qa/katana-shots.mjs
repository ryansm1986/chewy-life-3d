// The bone-shaped katana looks side by side (ROADMAP R-15, charKit.js katanaVariant, ?katana=a|b|c): for each look a
// studio turnaround (src/tests/katana.js), in Chewy's paw at the game camera (22 m) idle and mid-cut (cut1, its trail
// drawing) from both 45° yaws, a closer cut (does the trail follow the blade?), sheathed in the saya in the village, the
// noto sliding it home (does the blade fit the saya?), and the item icon. Writes the shots and katana-options.png to
// $SHOT_DIR (default tools/qa/tmp/r15).
//   node tools/qa/katana-shots.mjs [--looks ,a,b,c] [--only studio,paw,swing,sheath,back,noto,spectral,loot,icon,icons] [--sheet-only]
//     [--layout final]: one look's finished sheet (katana-final.png: + on his back, the noto frame by frame, the effects, the loot)
//   (the look '' is the classic blade, ?katana=classic; b, the bone blade, is the game's)
import { launch, boot, waitMode, sleep } from './lib.mjs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2), flag = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const OUT = process.env.SHOT_DIR || path.join(dir, 'tmp', 'r15');
const LOOKS = flag('--looks', ',a,b,c').split(','), ONLY = flag('--only', '') ? flag('--only').split(',') : null;
const on = n => !ONLY || ONLY.includes(n);
const NAME = { '': 'Classic', a: 'A  Bone tip', b: 'B  Bone blade', c: 'C  Chew-toy bone' };
const tagOf = l => l || 'classic';
fs.mkdirSync(OUT, { recursive: true });
// a few sword items' tints (items.js [blade, wrap, accent]): every look must keep taking them
const TINTS = [['Moonbone', 'e6f0ff,2c3a6a,8fd0ff'], ['Dino Bone', 'f1e2c2,3f8f8a,e8503a'], ['Rawhide', 'e8c89a,6b4a3a,c98f5e'], ['Chew Stick', 'c98f5e,8a5a3a,7cc45a']];
const GAME = 22, YAWS = [[Math.PI / 4, '+45'], [-Math.PI / 4, '−45']];
const shots = {}; // look → { key: [file, label] } (a run of --only some parts keeps the other parts' shots from the last run)
if (ONLY) try { Object.assign(shots, JSON.parse(fs.readFileSync(path.join(OUT, 'shots.json'), 'utf8'))); } catch (e) { /* first run */ }
const put = (look, key, file, label) => { (shots[tagOf(look)] ||= {})[key] = [file, label]; };
const report = [];

if (!argv.includes('--sheet-only')) {
  const { browser, page, errors } = await launch({ w: 1600, h: 900 });
  const ev = (f, a) => page.evaluate(f, a);
  // a square crop of s px centred on him (or on window.__shotAt), yOff m up
  const shot = async (name, s, yOff = 0.55) => {
    const file = path.join(OUT, `${name}.png`);
    const clip = s ? await ev(({ s, yOff }) => { const G = window.G, P = G.player, c = window.__shotAt || P.pos, v = new G.THREE.Vector3().copy(c).setY(c.y + yOff).project(G.engine.camera); const cx = (v.x * 0.5 + 0.5) * innerWidth, cy = (-v.y * 0.5 + 0.5) * innerHeight; return { x: Math.max(0, Math.min(innerWidth - s, Math.round(cx - s / 2))), y: Math.max(0, Math.min(innerHeight - s, Math.round(cy - s / 2))), width: s, height: s }; }, { s, yOff }) : undefined;
    await page.screenshot({ path: file, clip }); return file;
  };
  // (Shadow is sent to sit 3 m beyond the hero, off to the side, so he's never between the camera and the katana)
  const cam = o => ev(o => { const G = window.G, r = G.engine.rig, P = G.player; if (o.yaw != null) r.yawTarget = r.yaw = o.yaw; if (o.dist) r.distTarget = o.dist; r.focus.copy(P.pos).setY(P.pos.y + (o.fy ?? 0.5)); r.snap();
    const S = G.companion; if (S) { const { f, r: rt } = r.groundAxes(), x = P.pos.x + f.x * 3 + rt.x * 2.2, z = P.pos.z + f.z * 3 + rt.z * 2.2; S.hold = { x, z, face: 0 }; S.setPos?.(x, z); } }, o);
  const face = view => ev(view => { const G = window.G, P = G.player, { r } = G.engine.rig.groundAxes(); const deg = { right: 0, '3q': -45, front: -90, left: 180, back: 90, '3qb': 45, '3ql': -135 }[view] ?? +view; P.faceTarget = P.facing = Math.atan2(r.x, r.z) + deg * Math.PI / 180; }, view);
  const freeze = f => ev(f => { window.G.engine.timeScale = f ? 0 : 1; }, f);
  // game time, not wall time: run at a third of real speed until the cut is `u` of the way through, then freeze
  const runToU = u => ev(u => new Promise(res => { const G = window.G, P = G.player; G.engine.timeScale = 0.33; const t0 = performance.now(); const f = () => { const a = P.anim.action; if ((a && /^cut/.test(a.name) && a.t / a.dur >= u) || performance.now() - t0 > 8000) { G.engine.timeScale = 0; res(a ? `${a.name} u${(a.t / a.dur).toFixed(2)}` : 'none'); } else requestAnimationFrame(f); }; f(); }), u);
  const burrow = async look => {
    await boot(page, `fresh&nointro&katana=${look}`);
    await ev(() => { window.G.state.flags.burrowTut = true; window.G.enterDungeon(2); }); await waitMode(page, 'dungeon'); await sleep(page, 600);
    return ev(() => { // an open spot (as pose-lab.mjs), the dummies stunned out of the way
      const G = window.G, P = G.player, W = G.world, { r: f } = G.engine.rig.groundAxes(), s0 = G.dungeon.startPos, pl = G.state.player; let best = null;
      pl.lvl = 30; pl.stats.vit = 200; G.actions.recompute(); G.actions.restoreAll();
      for (const m of G.dungeon.monsters) if (m.alive) { m.status.stun = 999; m.pos.set(-999, 0, -999); }
      // (open ground round him: walls and drops counted within 4 m; away from the arrival and its campfire)
      const near = (x, z) => { let n = 0; for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) if (dx * dx + dz * dz <= 16 && ((W.walkable && !W.walkable(x + dx, z + dz)) || W.collision?.solidAt?.(x + dx, z + dz, 0.3))) n++; return n; };
      // ...and nothing (room dressing: a camp's logs, a pot) between him and the cameras of the shots: rays from each to him
      const rig = G.engine.rig, cam = G.engine.camera, ray = new G.THREE.Raycaster(), V = G.THREE.Vector3, skip = new Set();
      for (const r of [P.rig.root, G.companion?.rig?.root, ...G.dungeon.monsters.map(m => m.rig?.root)]) r?.traverse(o => skip.add(o));
      const solids = []; G.world.scene.traverseVisible(o => { if (o.isMesh && !o.isSkinnedMesh && !skip.has(o) && !(o.material?.transparent || o.material?.depthWrite === false)) solids.push(o); });
      const hits = (ray) => { for (const o of solids) { try { if (o.raycast && ray.intersectObject(o, false).length) return true; } catch (e) { /* a mesh the raycaster can't read */ } } return false; };
      const blocked = (x, z) => {
        P.setPos(x, z); P.rig.root.updateMatrixWorld(true);
        for (const yaw of [Math.PI / 4, -Math.PI / 4]) for (const d of [22, 9]) {
          rig.yawTarget = rig.yaw = yaw; rig.distTarget = d; rig.focus.set(x, 0.5, z); rig.snap(); cam.updateMatrixWorld(true);
          for (const h of [0.35, 0.6, 0.95]) {
            const t = new V(x, P.pos.y + h, z), o = cam.getWorldPosition(new V()), L = o.distanceTo(t); ray.set(o, t.clone().sub(o).normalize()); ray.far = L - 0.35;
            if (hits(ray)) return true;
          }
        }
        return false;
      };
      // (the open spot with the fewest walls within 4 m that no ray is blocked at: the arrival is the fallback)
      let tried = 0;
      for (let ring = 6; ring <= 30; ring += 1.5) for (let k = 0; k < 24; k++) {
        const a = k / 24 * Math.PI * 2, x = s0.x + Math.cos(a) * ring, z = s0.z + Math.sin(a) * ring, n = near(x, z);
        if (n > 6 || (best && n >= best.n)) continue;
        tried++; if (!blocked(x, z)) best = { x, z, n };
        if (best && !best.n) break;
      }
      P.setPos(best ? best.x : s0.x, best ? best.z : s0.z);
      return { model: P.rig.model, saya: !!P.rig.parts.saya, look: new URLSearchParams(location.search).get('katana'), spot: best ? `${best.x.toFixed(1)},${best.z.toFixed(1)} (${best.n} walls, ${tried} tried)` : 'the arrival (no clear spot)' };
    });
  };
  for (const look of LOOKS) {
    const T = tagOf(look);
    // ---------------------------------------------------------------- the studio turnaround
    if (on('studio')) {
      for (const [k, qs, label] of [['studio', `v=${look}&dist=2.9`, 'studio: flat · ¾ · edge-on · ¾ back · other flat'], ['tip', `v=${look}&tip=1&dist=1.75&fy=0.4&pitch=0.5`, 'studio, from above: the blade flat and edge-on'], ['tints', `v=${look}&tints=${TINTS.map(t => t[1]).join('|')}`, `item tints: ${TINTS.map(t => t[0]).join(', ')}`]]) {
        await page.goto(`${process.env.BASE || 'http://localhost:5173'}/?test=katana&off=tilt&${qs}`, { waitUntil: 'load' });
        await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 }); await sleep(page, 900);
        const file = path.join(OUT, `${T}-${k}.png`); await page.screenshot({ path: file, clip: k === 'tip' ? { x: 350, y: 0, width: 900, height: 900 } : k === 'tints' ? { x: 260, y: 20, width: 1080, height: 860 } : { x: 160, y: 20, width: 1280, height: 860 } });
        if (k === 'studio') report.push(`${T}: triangles ${JSON.stringify(await ev(() => window.__info.tris))}`);
        put(look, k, file, label);
      }
    }
    // ---------------------------------------------------------------- in the paw at the game camera, idle and mid-cut
    if (on('paw') || on('swing') || on('noto') || on('spectral') || on('loot')) {
      const info = await burrow(look); console.log(T, 'burrow', JSON.stringify(info));
      if (on('paw')) for (const [yaw, yt] of YAWS) {
        await cam({ yaw, dist: GAME }); await face('3q'); await sleep(page, 700); await freeze(true); await sleep(page, 150);
        put(look, `idle${yt}`, await shot(`${T}-idle${yt}`, 240), `in the paw, idle, game camera, yaw ${yt}`); await freeze(false);
      }
      if (on('swing')) {
        await ev(() => { // three mochi dummies ahead, unkillable
          const G = window.G, P = G.player, n0 = G.dungeon.monsters.length; G.dungeon.summonAround({ pos: P.pos }, 'mochi', 3);
          G.dungeon.monsters.slice(n0).forEach(m => { m.lifeMax = m.life = 1e7; m.status.stun = 999; m.aggro = false; m.speed = 0; }); window.__dummies = G.dungeon.monsters.slice(n0);
        });
        for (const [yaw, yt, dist, key, label, u] of [[YAWS[0][0], '+45', GAME, 'swing+45', 'mid-cut, game camera, yaw +45', 0.4], [YAWS[1][0], '−45', GAME, 'swing−45', 'mid-cut, game camera, yaw −45', 0.4], [YAWS[0][0], '+45', 9, 'trail', 'at 9 m: the trail drawing on the blade', 0.445], [YAWS[1][0], '−45', 9, 'trail2', 'at 9 m: the trail drawn, the cut ending', 0.5]]) {
          await cam({ yaw, dist }); await face('3q');
          await ev(() => { const G = window.G, P = G.player, fx = Math.sin(P.facing), fz = Math.cos(P.facing); window.__dummies.forEach((m, i) => { const a = (i - 1) * 0.5, c = Math.cos(a), s = Math.sin(a); m.pos.set(P.pos.x + (fx * c + fz * s) * 2.4, 0, P.pos.z + (fz * c - fx * s) * 2.4); }); });
          await sleep(page, 400);
          await ev(() => { const G = window.G, P = G.player; G.skills.cds = {}; P.anim.stop?.(); G.skills.combo = 0; G.actions.restoreAll(); const foe = window.__dummies[1]; window.__t0 = G.engine.time; window.__cast = G.skills.tryCast('attack', foe.pos.clone(), foe); });
          const act = await runToU(u); await cam({ yaw, dist }); await sleep(page, 160);
          put(look, key, await shot(`${T}-${key}`, dist === GAME ? 240 : 560), `${label} [${act}]`);
          await freeze(false); await ev(() => new Promise(res => { const G = window.G; const f = () => { if (!G.player.anim.busy()) res(); else requestAnimationFrame(f); }; f(); })); await sleep(page, 900);
        }
      }
      // ---------------------------------------------------------------- the noto: the blade slides home into the saya
      if (on('noto')) {
        // (first let the combo's own flourish finish and its glint fade: game state, then a beat)
        await freeze(false); await page.waitForFunction(() => { const P = window.G.player; return !P.anim.action && !window.G.skills.flourish; }, null, { timeout: 8000 }).catch(() => {}); await sleep(page, 900);
        for (const u of [0.69]) {
          await cam({ yaw: YAWS[0][0], dist: 6, fy: 0.45 }); await face('3ql');
          await ev(u => { const P = window.G.player; window.G.engine.timeScale = 0; P.draw(); P.anim.play('noto'); const a = P.anim.action; if (a) a.t = a.dur * u; }, u);
          await sleep(page, 200); await cam({ yaw: YAWS[0][0], dist: 6, fy: 0.45 }); await sleep(page, 150);
          const fit = await ev(() => { // how deep the blade goes in past the mouth, against the scabbard's length (world m)
            const G = window.G, P = G.player, V = G.THREE.Vector3, s = P.rig.parts.saya; if (!s) return null;
            P.rig.root.updateMatrixWorld(true);
            const mouth = s.getWorldPosition(new V()), ax = new V(0, 1, 0).transformDirection(s.matrixWorld), sc = s.getWorldScale(new V()).x;
            const tip = P.sword.localToWorld(new V(0, 0.69, 0)), depth = tip.clone().sub(mouth).dot(ax);
            return { depth: +depth.toFixed(3), sayaWorld: +(0.553 * sc).toFixed(3), scale: +sc.toFixed(3) };
          });
          report.push(`${T}: noto u=${u} blade depth ${JSON.stringify(fit)}`);
          put(look, 'noto', await shot(`${T}-noto`, 520, 0.45), `the noto sliding it home (u ${u}), 6 m, his left side`); await freeze(false);
        }
        // the slide at the game camera, frame by frame: does a knob ever poke out of the saya?
        for (const [yaw, yt] of YAWS) for (const u of [0.5, 0.58, 0.64, 0.69]) {
          await cam({ yaw, dist: GAME }); await face('3q');
          await ev(u => { const P = window.G.player; window.G.engine.timeScale = 0; P.draw(); P.anim.play('noto'); const a = P.anim.action; if (a) a.t = a.dur * u; }, u);
          await sleep(page, 160); await cam({ yaw, dist: GAME });
          put(look, `noto${yt}@${u}`, await shot(`${T}-noto${yt}-${u}`, 200), `noto u ${u}, game camera, yaw ${yt}`); await freeze(false);
        }
        await ev(() => window.G.player.anim.stop?.());
      }
      // ---------------------------------------------------------------- Sakura Storm and Moonlit Blades (the spectral blades)
      if (on('spectral')) {
        await ev(() => { if (window.__dummies) return; const G = window.G, P = G.player, n0 = G.dungeon.monsters.length; G.dungeon.summonAround({ pos: P.pos }, 'mochi', 3); G.dungeon.monsters.slice(n0).forEach(m => { m.lifeMax = m.life = 1e7; m.status.stun = 999; m.aggro = false; m.speed = 0; }); window.__dummies = G.dungeon.monsters.slice(n0); });
        for (const [id, label, times] of [['bonestorm', 'Sakura Storm', [0.6, 1.1]], ['moonhowl', 'Moonlit Blades', [0.45, 0.6, 0.8]]]) {
          // (each on its own: the storm's orbit done first)
          await freeze(false); await page.waitForFunction(() => !window.G.player.anim.action && !window.G.skills.orbits.length, null, { timeout: 20000 }).catch(() => {}); await sleep(page, 400);
          const D = id === 'moonhowl' ? 14 : 11, C = id === 'moonhowl' ? 860 : 640, R = id === 'moonhowl' ? 1.3 : 2.2; // (the moon blades are 2.8 m tall: wider, the dummies nearer)
          await cam({ yaw: YAWS[0][0], dist: D }); await face('3q');
          await ev(([id, R]) => {
            const G = window.G, P = G.player, pl = G.state.player, fx = Math.sin(P.facing), fz = Math.cos(P.facing);
            pl.skills[id] = 10; G.actions.recompute(); G.skills.cds = {}; G.actions.restoreAll();
            (window.__dummies || []).forEach((m, i) => { const a = (i - 1) * 0.6, c = Math.cos(a), s2 = Math.sin(a); m.pos.set(P.pos.x + (fx * c + fz * s2) * R, 0, P.pos.z + (fz * c - fx * s2) * R); });
            window.__t0 = G.engine.time; window.__cast = G.skills.tryCast(id, P.pos.clone().add(new G.THREE.Vector3(fx * 2, 0, fz * 2)), null);
          }, [id, R]);
          for (const [k, tt] of times.entries()) {
            await ev(s => new Promise(res => { const G = window.G; G.engine.timeScale = 0.33; const f = () => { if (G.engine.time - window.__t0 >= s) { G.engine.timeScale = 0; res(); } else requestAnimationFrame(f); }; f(); }), tt);
            await cam({ yaw: YAWS[0][0], dist: D }); await sleep(page, 160);
            put(look, `${id}${k}`, await shot(`${T}-${id}-${k}`, C, 0.9), `${label} +${Math.round(tt * 1000)} ms, ${D} m`);
            if (k === times.length - 1) { await cam({ yaw: YAWS[0][0], dist: GAME }); await sleep(page, 160); put(look, `${id}Far`, await shot(`${T}-${id}-far`, 360), `${label}, game camera`); }
          }
          await freeze(false);
        }
      }
      // ---------------------------------------------------------------- the loot drop: three sword items on the ground
      if (on('loot')) {
        await freeze(false); await page.waitForFunction(() => !window.G.player.anim.action, null, { timeout: 8000 }).catch(() => {});
        await cam({ yaw: YAWS[0][0], dist: 7 }); await face('3q');
        await ev(async () => {
          const G = window.G, P = G.player, { generateItem } = await import('/src/rpg/items.js'), { r } = G.engine.rig.groundAxes();
          const items = [['boneSword', 5, 'normal'], ['moonboneKatana', 45, 'rare'], ['chewStick', 2, 'magic']].map(([base, ilvl, rarity]) => ({ type: 'item', item: generateItem({ base, ilvl, rarity }) }));
          const { f } = G.engine.rig.groundAxes(); window.__loot0 = G.dungeon.loot.list.length;
          items.forEach((d, i) => { const to = P.pos.clone().addScaledVector(r, 0.9 + i * 0.55).addScaledVector(f, (i - 1) * 0.4); to.y = G.world.heightAt?.(to.x, to.z) ?? 0; G.dungeon.loot.spawn(d, to.clone().setY(to.y + 0.6), to); });
          window.__shotAt = P.pos.clone().addScaledVector(r, 1.0);
        });
        await page.waitForFunction(() => { const L = window.G.dungeon.loot.list.slice(window.__loot0); return L.length >= 3 && L.every(e => e.t >= e.fly + 0.4); }, null, { timeout: 15000 }).catch(() => {});
        await freeze(true); await cam({ yaw: YAWS[0][0], dist: 7, fy: 0.3 }); await sleep(page, 160);
        put(look, 'loot', await shot(`${T}-loot`, 640, 0.3), 'the loot drop: Bone Katana, Moonbone (rare), Chew Stick (magic), 7 m');
        for (const [yaw, yt] of YAWS) { await cam({ yaw, dist: GAME, fy: 0.3 }); await sleep(page, 160); put(look, `loot${yt}`, await shot(`${T}-loot${yt}`, 300, 0.3), `the loot drop, game camera, yaw ${yt}`); }
        await ev(() => { window.__shotAt = null; }); await freeze(false);
      }
    }
    // ---------------------------------------------------------------- sheathed in the saya, in the village
    if (on('sheath')) {
      await boot(page, `fresh&nointro&hour=11&katana=${look}`); await sleep(page, 1500);
      for (const [yaw, yt] of YAWS) {
        await cam({ yaw, dist: GAME }); await face('3q'); await sleep(page, 900);
        put(look, `sheath${yt}`, await shot(`${T}-sheath${yt}`, 240), `sheathed (village), game camera, yaw ${yt}`);
      }
      await cam({ yaw: YAWS[0][0], dist: 4.2, fy: 0.45 }); await face('3q'); await sleep(page, 700);
      put(look, 'sheathClose', await shot(`${T}-sheath-close`, 520, 0.45), 'sheathed, close (yaw +45)');
      // the fallback model without a saya (the Toybox Chewy, ?chewymodel=toy): the whole katana rides on his back
      if (on('back')) {
        await boot(page, `fresh&nointro&hour=11&chewymodel=toy&katana=${look}`); await sleep(page, 1500);
        for (const [yaw, yt] of YAWS) {
          await cam({ yaw, dist: GAME }); await face('3qb'); await sleep(page, 900);
          put(look, `back${yt}`, await shot(`${T}-back${yt}`, 240), `on his back (no saya: the Toybox Chewy), yaw ${yt}`);
        }
        await cam({ yaw: YAWS[0][0], dist: 4.6, fy: 0.5 }); await face('3qb'); await sleep(page, 700);
        put(look, 'backClose', await shot(`${T}-back-close`, 560, 0.5), 'on his back (no saya), close');
      }
    }
    // ---------------------------------------------------------------- the item icon (today's: updated once a look is picked)
    if (on('icon')) {
      if (!page.url().includes('fresh')) await boot(page, 'fresh&nointro');
      const url = await ev(async () => {
        const icons = await import('/src/rpg/icons.js'), { ITEM_BASES } = await import('/src/rpg/items.js');
        icons.setIconResolution(5); const u = icons.itemIcon({ ...ITEM_BASES.boneSword, rarity: 'normal' }); icons.setIconResolution(2); return u;
      });
      const file = path.join(OUT, `${T}-icon.png`); fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
      put(look, 'icon', file, 'item icon');
    }
  }
  // ---------------------------------------------------------------- every sword base's icon and Chewy's Bone Blade skill art
  if (on('icons')) {
    if (!page.url().includes('fresh')) await boot(page, 'fresh&nointro');
    const url = await ev(async () => {
      const icons = await import('/src/rpg/icons.js'), { ITEM_BASES } = await import('/src/rpg/items.js'), { SKILLS } = await import('/src/rpg/skills.js');
      icons.setIconResolution(4);
      const swords = Object.keys(ITEM_BASES).filter(id => ITEM_BASES[id].wtype === 'sword');
      const skills = Object.keys(SKILLS).filter(id => (SKILLS[id].cls || 'chewy') === 'chewy' && !SKILLS[id].training);
      const cells = [...swords.map(id => [icons.itemIcon({ ...ITEM_BASES[id], rarity: 'normal' }), ITEM_BASES[id].name]), ...['rare', 'unique'].map(r => [icons.itemIcon({ ...ITEM_BASES.boneSword, rarity: r }), `Bone Katana (${r})`]), ...skills.map(id => [icons.skillIcon(id), SKILLS[id].name])];
      icons.setIconResolution(2);
      const S = 168, cols = 9, c = document.createElement('canvas'); c.width = cols * S; c.height = Math.ceil(cells.length / cols) * (S + 22); const g = c.getContext('2d');
      g.fillStyle = '#2e2230'; g.fillRect(0, 0, c.width, c.height); g.font = '13px sans-serif'; g.fillStyle = '#fff6e8';
      for (let i = 0; i < cells.length; i++) {
        const [src, name] = cells[i], im = new Image(); im.src = src; await im.decode();
        const x = (i % cols) * S, y = Math.floor(i / cols) * (S + 22); g.drawImage(im, x + 8, y + 2, S - 16, S - 16); g.fillText(name.slice(0, 22), x + 6, y + S + 12);
      }
      return c.toDataURL('image/png');
    });
    const file = path.join(OUT, `icons-${flag('--icon-tag', 'now')}.png`); fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64')); console.log('icons', file);
  }
  fs.writeFileSync(path.join(OUT, 'shots.json'), JSON.stringify(shots, null, 1));
  if (errors.length) console.log([...new Set(errors)].slice(0, 10).join('\n'));
  await browser.close();
} else Object.assign(shots, JSON.parse(fs.readFileSync(path.join(OUT, 'shots.json'), 'utf8')));
fs.writeFileSync(path.join(OUT, 'report.txt'), report.join('\n') + '\n'); console.log(report.join('\n'));
// ---------------------------------------------------------------- the comparison sheet (tools/qa/katana-sheet.py)
const spec = path.join(OUT, 'sheet.json');
const FINAL = flag('--layout', '') === 'final'; // (the chosen look, finished: tools/qa/katana-sheet.py's final rows)
fs.writeFileSync(spec, JSON.stringify({ looks: LOOKS.map(l => ({ tag: tagOf(l), name: NAME[l] ?? l })), shots, layout: FINAL ? 'final' : '', out: path.join(OUT, FINAL ? 'katana-final.png' : 'katana-options.png'),
  title: FINAL ? 'R-15  The Bone Katana: the bone blade (B), finished' : '', sub: FINAL ? 'Top: the blade up close (studio, item tints, the icon, sheathed, on his back, the noto at 6 m).  Then the game camera (22 m): idle, mid-cut, sheathed and on his back from both yaws; the noto frame by frame from both yaws; the trail, Sakura Storm and Moonlit Blades; the loot drop.' : '' }));
try { console.log(execFileSync('python', [path.join(dir, 'katana-sheet.py'), spec]).toString().trim()); } catch (e) { console.log('sheet failed', e.message); }
