// Stella's in-game review shots (docs/STELLA.md §9, checkpoint 1: before her class exists). Boots the real game in
// Blossom Hollow and puts her baked rig and her parasol on the player (the class lands at checkpoint 2), then shoots her
// at the game camera in the game's light and grade, from both 45° yaws (her facing 45° either side of the camera's line):
//   node tools/qa/stella-shots.mjs [look] [walk] [run] [cast] [carry] [sit] [coat] [--dev desktop|deck|phone|ipad]
//     [--hour 11] [--world village|burrow] [--grade "…"] [--out dir] [--qs k=v]
//  look: standing (the parasol over her shoulder), the game camera's own distance and a closer one;
//  walk / run: walking and sprinting across the plaza, the parasol on its shoulder mount (her arm swings free);
//  cast: the generic cast held at its peak with the parasol raised in her paw (the 'cast' grip);
//  carry: standing with it in her paw over the shoulder (the 'shoulder' grip and its arm pose); sit: the sit;
//  coat: the lit colours measured on screen: her fur, the nose, the inner ears (texels picked by their albedo, the
//   vertices facing the camera projected and sampled; the 35th / 60th / 85th percentile by luminance).
// Writes tools/qa/tmp/stella-shots/<dev>-<hour>-<name>.png (gitignored) and prints the runtime errors.
import { launch, boot, sleep } from './lib.mjs';
import { launchTouch, PHONE, IPAD } from './touch-lib.mjs';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2), val = (n, d = null) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const OUT = val('--out', 'tools/qa/tmp/stella-shots'), DEV = val('--dev', 'desktop'), HOUR = +val('--hour', 11), WORLD = val('--world', 'village');
const QS = val('--qs') ? '&' + val('--qs') : '';
fs.mkdirSync(OUT, { recursive: true });
const ids = args.filter((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
const want = ids.length ? ids : ['look', 'walk', 'run', 'cast', 'carry', 'sit', 'coat'];
const touch = DEV === 'phone' || DEV === 'ipad';
const S = touch ? await launchTouch(DEV === 'phone' ? PHONE : IPAD) : await launch(DEV === 'deck' ? { w: 1280, h: 800 } : { w: 1920, h: 1080 });
const { browser, page, errors } = S;
const tag = `${DEV}-${HOUR}${WORLD === 'village' ? '' : '-' + WORLD}`;
const shot = async name => { const f = path.join(OUT, `${tag}-${name}.png`); await page.screenshot({ path: f }); console.log('saved', f); };

try {
  await boot(page, `fresh&nointro&notut&noarrive&hour=${HOUR}${DEV === 'deck' ? '&deck' : ''}${QS}`);
  if (WORLD === 'burrow') {
    await page.evaluate(() => window.G.enterDungeon?.({ id: 'mossyBurrow', floor: 1 }));
    await page.waitForFunction(() => window.G.mode === 'dungeon' && !window.G.ui?.iris?.active, null, { timeout: 30000 });
    await sleep(page, 1500);
  }
  // her rig on the player (the same module instances the game uses: Vite serves /src as the game imported it)
  const info = await page.evaluate(async grade => {
    const G = window.G, P = G.player;
    const HM = await import('/src/actors/heroModels.js'), SG = await import('/src/actors/stellaGear.js');
    await HM.loadHeroModel('stella'); await SG.loadStellaProps();
    if (grade) Object.assign(HM.HERO_MODELS.stellaToy, JSON.parse(grade));
    const rig = HM.buildHeroModel('stella'); SG.dressStella(rig);
    P.setWeapon('staff'); P.replaceRig(rig); P.setWeapon('staff'); P.dropStaff(); // (the katana and the ball parked and hidden)
    window.__stl = { SG, rig, home: [P.pos.x, P.pos.z] }; // (every pose starts back here: the plaza in front of the cottage)
    return { model: rig.model, glb: !!rig.parts.parasol?.glb, mode: G.mode, dist: G.engine.rig.distTarget };
  }, val('--grade'));
  console.log(JSON.stringify(info));
  await sleep(page, 800);
  const pose = async ({ dyaw = 0, dist = null, action = null, at = null, hold = 'carry', walk = 0, sprint = false }) => page.evaluate(async o => {
    const G = window.G, P = G.player, R = G.engine.rig, { SG, rig } = window.__stl;
    G.engine.timeScale = 1; P.moveTarget = null; P.controlLocked = false;
    if (!o.walk) P.setPos(window.__stl.home[0], window.__stl.home[1]);
    rig.parts.parasol.holder.visible = o.hold !== 'none';
    SG.mountParasol(rig, rig.parts.parasol, o.hold === 'none' ? 'carry' : o.hold);
    P.anim.stance = o.hold === 'shoulder' || (o.hold === 'cast' && !o.action) ? SG.parasolStance(o.hold) : null; // (the generic cast raises the arm itself)
    P.anim.action = null;
    if (o.dist) { R.distTarget = o.dist; }
    if (o.walk) { // walk (or sprint) across the screen, then shoot mid-stride
      const h = R.yaw + Math.PI / 2 + o.dyaw, ax = Math.sin(h), az = Math.cos(h); // (across the screen, turned o.dyaw toward the camera)
      P.setPos(window.__stl.home[0] - ax * 3, window.__stl.home[1] - az * 3); R.snap();
      P.moveTarget = new G.THREE.Vector3(P.pos.x + ax * 9, 0, P.pos.z + az * 9);
      if (o.sprint && P.sprint) { P.sprint._w ||= P.sprint.wanted; P.sprint.wanted = () => true; } // (Shift held, as far as the sprint knows)
      await new Promise(r => setTimeout(r, o.walk * 1000));
    } else {
      P.facing = P.faceTarget = R.yaw + o.dyaw; P.sync?.();
      if (o.action) { P.anim.play(o.action); if (o.at != null) { await new Promise(r => setTimeout(r, 30)); const a = P.anim.action; if (a) { a.t = o.at * a.dur; } G.engine.timeScale = 0.0001; } }
      R.snap();
    }
    return { pos: [P.pos.x, P.pos.z], yaw: R.yaw, act: P.anim.action?.name || null };
  }, { dyaw, dist, action, at, hold, walk, sprint });
  const free = () => page.evaluate(() => { const G = window.G; G.engine.timeScale = 1; G.player.moveTarget = null; const sp = G.player.sprint; if (sp?._w) { sp.wanted = sp._w; delete sp._w; } });
  const both = async (name, o) => { for (const [s, dy] of [['45r', Math.PI / 4], ['45l', -Math.PI / 4]]) { await pose({ ...o, dyaw: dy }); await sleep(page, o.action ? 300 : 700); await shot(`${name}-${s}`); await free(); } };
  if (want.includes('look')) {
    for (const [s, dy] of [['front', 0], ['45r', Math.PI / 4], ['45l', -Math.PI / 4], ['back', Math.PI]]) { await pose({ dyaw: dy }); await sleep(page, 700); await shot(`look-${s}`); }
    for (const [s, dy] of [['45r', Math.PI / 4], ['45l', -Math.PI / 4]]) { await pose({ dyaw: dy, dist: 7 }); await sleep(page, 900); await shot(`look-close-${s}`); }
    await page.evaluate(d => { window.G.engine.rig.distTarget = d; window.G.engine.rig.snap(); }, info.dist);
  }
  for (const [k, o] of [['walk', { walk: 1.1 }], ['run', { walk: 0.9, sprint: true }]]) {
    if (!want.includes(k)) continue;
    for (const [sd, dy] of [['45r', -Math.PI / 4], ['45l', Math.PI / 4 - Math.PI]]) { await pose({ ...o, dyaw: dy }); await shot(`${k}-${sd}`); await free(); await sleep(page, 500); }
  }
  if (want.includes('cast')) { await both('cast', { action: 'cast', at: 0.42, hold: 'cast' }); await both('raised', { hold: 'cast' }); }
  if (want.includes('carry')) await both('carry', { hold: 'shoulder' });
  if (want.includes('sit')) await both('sit', { action: 'sit', at: 0.5 });
  if (want.includes('coat')) {
    await pose({ dyaw: 0.4, dist: 7, hold: 'none' }); await sleep(page, 900);
    const r = await page.evaluate(() => new Promise(res => requestAnimationFrame(() => requestAnimationFrame(() => {
      const G = window.G, P = G.player, cam = G.engine.camera, gl = G.engine.renderer, THREE = G.THREE;
      const skin = P.rig.skin, geo = skin.geometry, pos = geo.attributes.position, nrm = geo.attributes.normal, uv = geo.attributes.uv;
      const img = P.rig.mat.map.image, tc = document.createElement('canvas'); tc.width = img.width; tc.height = img.height;
      const tx = tc.getContext('2d'); tx.drawImage(img, 0, 0); const T = tx.getImageData(0, 0, img.width, img.height).data;
      const alb = i => { const u = uv.getX(i), v = uv.getY(i), x = Math.min(img.width - 1, Math.max(0, Math.floor(u * img.width))), y = Math.min(img.height - 1, Math.max(0, Math.floor((1 - v) * img.height))), k = (y * img.width + x) * 4; return [T[k], T[k + 1], T[k + 2]]; };
      const near = (c, h, d) => { const t = [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; return Math.hypot(c[0] - t[0], c[1] - t[1], c[2] - t[2]) < d; };
      const groups = { fur: [], nose: [], earIn: [], robe: [], sash: [] };
      const v = new THREE.Vector3(), n = new THREE.Vector3(), cv = cam.position, W = gl.domElement.width, H = gl.domElement.height;
      skin.updateMatrixWorld(true);
      const dark = []; // (albedo of every nose-ish texel, to find the nose's painted colour)
      for (let i = 0; i < pos.count; i += 2) {
        const c = alb(i);
        const k = near(c, '#a9a6a2', 26) ? 'fur' : near(c, '#cfccc6', 14) ? 'earIn' : near(c, '#f0c24e', 40) ? 'robe' : near(c, '#d9573e', 34) ? 'sash' : (c[0] - c[2] > 12 && c[0] < 150 && c[1] < 120) ? 'nose' : null;
        if (!k) continue;
        v.fromBufferAttribute(pos, i); skin.applyBoneTransform(i, v); v.applyMatrix4(skin.matrixWorld);
        n.fromBufferAttribute(nrm, i).transformDirection(skin.matrixWorld);
        if (n.dot(v.clone().sub(cv).normalize()) > -0.3) continue;
        const s = v.clone().project(cam); if (Math.abs(s.x) > 1 || Math.abs(s.y) > 1) continue;
        groups[k].push([Math.round((s.x + 1) / 2 * W), Math.round((1 - s.y) / 2 * H), c]);
        if (k === 'nose') dark.push(c);
      }
      const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'); x.drawImage(gl.domElement, 0, 0);
      const D = x.getImageData(0, 0, W, H).data, hex = p => '#' + p.map(q => q.toString(16).padStart(2, '0')).join('');
      const out = {};
      for (const [k, pts] of Object.entries(groups)) {
        const px = pts.map(([sx, sy]) => { const o = (sy * W + sx) * 4; return [D[o], D[o + 1], D[o + 2]]; }).sort((a, b) => (a[0] + a[1] + a[2]) - (b[0] + b[1] + b[2]));
        const q = f => px[Math.floor(px.length * f)] || [0, 0, 0];
        const al = pts.map(p => p[2]); const am = al.length ? [0, 1, 2].map(j => Math.round(al.reduce((a, b) => a + b[j], 0) / al.length)) : [0, 0, 0];
        out[k] = { n: px.length, p35: hex(q(0.35)), p60: hex(q(0.6)), p85: hex(q(0.85)), albedo: hex(am) };
      }
      res(out);
    }))));
    console.log('coat', JSON.stringify(r));
    await shot('coat');
  }
} finally {
  console.log(errors.length ? 'ERRORS\n' + errors.slice(0, 8).join('\n') : 'no errors');
  await browser.close();
}
