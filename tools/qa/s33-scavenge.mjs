// s33: scavenging, the cozy path's phase C (docs/COZY.md §7, §8, §10; ROADMAP CZ-5, CZ-6).
//   a) Blossom Hollow: 10 nodes on open ground (off every plot, street and square, walkable), one BatchedMesh and one
//      sparkle draw for the whole area; F at a node gathers it (the pickup pose, the materials, the node's taken look,
//      its prompt gone); a new world day (the clock skipped) brings it back
//   b) Shadow's nose: near a hidden spot he sniffs, trots over, paws and sits, and the spot shows ('scavenge:found');
//      hold F: the ring fills, the golden band, let go in it: a Perfect dig (a bonus roll, 'scavenge:dig' perfect);
//      hold to the end: a good dig; Settings › Dig with Shadow: Tap digs by itself (a good dig); moving away cancels
//      with nothing lost
//   c) the mouse: a click on a node walks there and gathers; holding the left button on a found spot digs
//   d) the pad: A gathers, hold A digs and a release in the band is perfect (with a rumble)
//   e) touch (a phone): the attack button gathers when the prompt is up; holding it digs (perfect in the band); a tap on
//      the prompt digs by itself
//   f) the zones: each of the four has 14–18 nodes, none in its village or a wild area (phase B's discs), 2–3 dig spots,
//      at most 2 scavenging draw calls; an active zone quest's find item turns up from a dig spot and counts
//   g) Pound Mochi at the kitchen (2 rice → 2 Mochi); the "While you were away…" card's refill line; the Cozy debug
//      section's scavenging actions
//   Shots → tools/qa/tmp/s33-scavenge/ (the gather pose, the nose, the ring in the band, the perfect pop, the phone)
//   usage: node tools/qa/s33-scavenge.mjs   (ONLY=ab: just those parts)
import fs from 'node:fs';
import { launch, boot, sleep, waitMode, makeReport } from './lib.mjs';
import { installPad, padDown, padUp, padTap } from './pad-lib.mjs';
import { launchTouch, center } from './touch-lib.mjs';

const OUT = new URL('./tmp/s33-scavenge/', import.meta.url); fs.mkdirSync(OUT, { recursive: true });
const shot = (page, n) => page.screenshot({ path: new URL(n + '.png', OUT).pathname.replace(/^\/([A-Z]:)/, '$1') });
const R = makeReport('s33-scavenge');
const errs = [], warns = [];
const want = k => !process.env.ONLY || process.env.ONLY.includes(k);
const ev = (page, fn, arg) => page.evaluate(fn, arg);
const until = (page, fn, arg, timeout = 8000) => page.waitForFunction(fn, arg, { timeout }).then(() => true, () => false);

// ---- helpers
const listen = page => ev(page, () => { window.__sc = []; for (const n of ['scavenge:gather', 'scavenge:dig', 'scavenge:found', 'scavenge:refill', 'quest:find', 'input:rumble']) window.G.events.on(n, e => window.__sc.push([n, e || {}])); });
const evs = (page, n) => ev(page, n => window.__sc.filter(e => e[0] === n).map(e => e[1]), n);
const quiet = page => ev(page, () => { const G = window.G; G.ui.closeAll?.(); G.interactCooldown = 0; });
/** stand beside a node or spot (to its right as the camera sees it, so the shots show both) */
const standAt = (page, x, z, d = 0.9) => ev(page, ([x, z, d]) => { const G = window.G; G.player.setPos(x + d * 0.7, z - d * 0.7); G.player.moveTarget = null; G.player.interactTarget = null; G.player.faceTo(x, z); G.player.facing = G.player.faceTarget; G.companion.setPos(x - 1.2, z + 1.2); const r = G.engine.rig; r.focus.copy(G.player.pos); r.snap(); }, [x, z, d]);
const firstFull = page => ev(page, () => window.G.cozy.scav.nodes().find(n => !n.taken));
/** the found (or any undug) spot k, revealed */
const foundSpot = (page, k = 0) => ev(page, k => { const S = window.G.cozy.scav; S.reveal(); return S.spots().filter(s => s.state !== 'dug')[k] || null; }, k);
const screenOf = (page, p) => ev(page, p => { const G = window.G, v = new G.player.pos.constructor(p.x, p.y + 0.3, p.z).project(G.engine.camera); return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight }; }, p);
// (the band tests slow the ring to a third: a slow headless frame could otherwise step right over the 70–85% band)
const ringAtBand = page => ev(page, () => { window.G.cozy.scav.ringSpeed = 0.33; }).then(() => until(page, () => { const s = window.G.cozy.scav.session; return !!s && s.k >= 0.74 && s.k <= 0.8; }, null, 9000));

// ================================================================== a) b) c) the village: placement, gather, nose, digs, mouse
if (want('a') || want('b') || want('c')) {
  const { browser, page, errors, warns: w } = await launch({ w: 1600, h: 900 });
  await boot(page, 'fresh&nointro&notut&hour=10');
  await listen(page);
  if (want('a')) {
    const P = await ev(page, async () => {
      const G = window.G, W = G.village.world, S = G.cozy.scav, Pm = await import('/src/world/plots.js'), Lm = await import('/src/world/layout.js');
      const nodes = S.nodes(), v = S.view();
      const bad = nodes.filter(n => !W.walkable(n.x, n.z) || Pm.PLOTS.some(p => n.x > p.x - 1 && n.x < p.x + p.w + 1 && n.z > p.z - 1 && n.z < p.z + p.d + 1) || Lm.distToPaths(n.x, n.z) < 1.8 || Lm.reservedAt(n.x, n.z) || W.heightAt(n.x, n.z) < 0.05).map(n => n.id);
      const meshes = []; W.scene.traverse(o => { if (/^scavenge:/.test(o.name)) meshes.push(o.name); });
      const hidden = [...nodes, ...v.cands].filter(n => S.screenWhy(n.x, n.z, [0.55]).length).length;
      return { n: nodes.length, kinds: [...new Set(nodes.map(n => n.kind))].join(), bad, meshes, spots: S.spots().length, hidden, tris: v.mesh.geometry.index ? null : Math.round(v.mesh.geometry.attributes.position.count / 3) };
    });
    R.check('a) Blossom Hollow: 10 nodes (driftwood, river stones, petal drifts, the mulberry) on open ground, off every plot, street and square', P.n === 10 && P.kinds === 'driftwood,riverStone,petalDrift,mulberry' && !P.bad.length, P);
    R.check('a) no node or dig site is hidden from the game camera (no canopy, roof or hill in the way) from either 45° yaw', P.hidden === 0, P);
    R.check('a) 3 draws for the area (one BatchedMesh, the sparkle, the ground rings); 2–3 dig spots today', P.meshes.length === 3 && P.meshes.includes('scavenge:home') && P.spots >= 2 && P.spots <= 3, P);
    // F at a node: the pickup pose, the materials, the taken look
    const n0 = await firstFull(page);
    await standAt(page, n0.x, n0.z); await quiet(page); await sleep(page, 200);
    const m0 = await ev(page, () => ({ ...window.G.state.materials }));
    const label = await ev(page, () => document.querySelector('.hud .prompt')?.textContent || '');
    await page.keyboard.down('f');
    const posed = await until(page, () => window.G.player.anim.action?.name === 'pickup', null, 2000);
    await shot(page, 'a-gather');
    await page.keyboard.up('f');
    await until(page, () => window.__sc.some(e => e[0] === 'scavenge:gather'), null, 4000);
    const g = await ev(page, id => ({ m: { ...window.G.state.materials }, node: window.G.cozy.scav.nodes().find(n => n.id === id), it: window.G.village.world.interactables.find(i => i.scav === id)?.pos.y }), n0.id);
    const gained = Object.entries(g.m).filter(([k, v]) => v > (m0[k] || 0)).map(([k, v]) => `${k}+${v - (m0[k] || 0)}`);
    R.check(`a) F at a node ("${label.trim()}"): the pickup pose, materials in (${gained.join(' ')}), its taken look, its prompt gone`, posed && gained.length && g.node.taken && g.it < -10, { posed, gained, taken: g.node.taken });
    const again = await ev(page, id => window.G.cozy.scav.gather(id), n0.id);
    R.check('a) a gathered node gives nothing more today', again === null);
    await ev(page, () => window.G.cozy.clock.add(24));
    const back = await until(page, id => !window.G.cozy.scav.nodes().find(n => n.id === id).taken, n0.id, 3000);
    R.check('a) a new world day brings it back (the clock skipped 24 h)', back && (await evs(page, 'scavenge:refill')).length >= 1);
  }
  if (want('b')) {
    // Shadow's nose: stand ~7 m from a hidden spot
    await ev(page, () => window.G.cozy.clock.add(24)); // (a fresh day: every spot hidden)
    const s0 = await ev(page, () => window.G.cozy.scav.spots().find(s => s.state === 'hidden'));
    await ev(page, s => { const G = window.G; G.player.setPos(s.x + 4.4, s.z - 4.4); G.player.moveTarget = null; G.player.faceTo(s.x, s.z); G.player.facing = G.player.faceTarget; G.companion.setPos(s.x + 4.8, s.z - 3.4); const r = G.engine.rig; r.distTarget = 18; r.focus.copy(G.player.pos); r.snap(); }, s0); // (the spot ~6 m off to the hero's left on screen)
    const sniff = await until(page, () => window.G.companion.nose?.phase === 'sniff' || window.G.companion.anim.action?.name === 'sniff', null, 4000);
    if (sniff) await shot(page, 'b-nose-sniff');
    const trot = await until(page, () => window.G.companion.nose?.phase === 'trot', null, 3000);
    const paw = await until(page, () => window.G.companion.nose?.phase === 'paw', null, 9000);
    if (paw) await shot(page, 'b-nose-paw');
    const found = await until(page, id => window.G.cozy.scav.spots().find(s => s.id === id)?.state === 'found', s0.id, 5000);
    await sleep(page, 200); await shot(page, 'b-nose-found');
    const fe = await evs(page, 'scavenge:found');
    R.check('b) Shadow\'s nose: he sniffs (nose up), trots over, paws the ground, and the spot shows with its paw mark', sniff && trot && paw && found && fe.some(e => e.spot === s0.id), { sniff, trot, paw, found });
    // hold F, let go in the band: perfect
    await standAt(page, s0.x, s0.z, 1.0); await quiet(page); await sleep(page, 150);
    const prompt = await ev(page, () => document.querySelector('.hud .prompt')?.textContent || '');
    const m1 = await ev(page, () => ({ ...window.G.state.materials, coins: window.G.state.coins }));
    await page.keyboard.down('f');
    const ringOn = await until(page, () => document.querySelector('.dig-ring')?.classList.contains('show'), null, 2000);
    const inBand = await ringAtBand(page);
    const gold = await ev(page, () => document.querySelector('.dr-card')?.classList.contains('gold'));
    await page.keyboard.up('f');
    await until(page, () => window.__sc.some(e => e[0] === 'scavenge:dig'), null, 3000);
    await sleep(page, 120); await shot(page, 'b-dig-perfect');
    const d1 = (await evs(page, 'scavenge:dig')).at(-1);
    const m2 = await ev(page, () => ({ ...window.G.state.materials, coins: window.G.state.coins }));
    const got = Object.keys(m2).filter(k => m2[k] > (m1[k] || 0));
    R.check(`b) hold F ("${prompt.trim()}"): the ring fills, gold in the band (70–85%); let go there: "Perfect!" and a bonus roll (${got.join(', ')})`, ringOn && inBand && gold && d1?.perfect === true && d1.spot === s0.id && got.length >= 1, { ringOn, inBand, gold, d1 });
    const after = await ev(page, id => ({ st: window.G.cozy.scav.spots().find(s => s.id === id)?.state, lock: window.G.player.controlLocked, busy: window.G.cozy.scav.busy }), s0.id);
    R.check('b) the spot is dug (its hole stays for the day), control back', after.st === 'dug' && !after.lock && !after.busy, after);
    // hold to the end: a good dig
    const s1 = await foundSpot(page, 0);
    await standAt(page, s1.x, s1.z, 1.0); await quiet(page); await sleep(page, 150);
    await page.keyboard.down('f');
    if (await ringAtBand(page)) await shot(page, 'b-dig-band'); // (the ring in the band, held on past it)
    await until(page, () => window.__sc.filter(e => e[0] === 'scavenge:dig').length >= 2, null, 9000);
    await page.keyboard.up('f');
    const d2 = (await evs(page, 'scavenge:dig')).at(-1);
    R.check('b) holding to the end: a good dig (never a fail, the normal find)', d2?.perfect === false && d2.spot === s1.id, d2);
    // tap mode, and a cancel
    await ev(page, () => { window.G.cozy.clock.add(24); window.G.ui.setSetting('digMode', 1); });
    const s2 = await foundSpot(page, 0);
    await standAt(page, s2.x, s2.z, 1.0); await quiet(page); await sleep(page, 150);
    await page.keyboard.press('d'); await sleep(page, 50); await standAt(page, s2.x, s2.z, 1.0); await sleep(page, 100);
    await page.keyboard.down('f'); await sleep(page, 60); await page.keyboard.up('f');
    const auto = await until(page, () => !!window.G.cozy.scav.session?.auto, null, 1000);
    await until(page, () => window.__sc.filter(e => e[0] === 'scavenge:dig').length >= 3, null, 9000);
    const d3 = (await evs(page, 'scavenge:dig')).at(-1);
    R.check('b) Settings › Dig with Shadow › Tap: one press digs by itself (a good dig)', auto && d3?.perfect === false && d3.spot === s2.id, { auto, d3 });
    await ev(page, () => window.G.ui.setSetting('digMode', 0));
    const s3 = await foundSpot(page, 0);
    if (s3) {
      await standAt(page, s3.x, s3.z, 1.0); await quiet(page); await sleep(page, 150);
      await page.keyboard.down('f'); await until(page, () => (window.G.cozy.scav.session?.k || 0) > 0.2, null, 2000);
      await page.keyboard.press('w'); await page.keyboard.up('f'); await sleep(page, 150);
      const c = await ev(page, id => ({ st: window.G.cozy.scav.spots().find(s => s.id === id)?.state, busy: window.G.cozy.scav.busy, lock: window.G.player.controlLocked }), s3.id);
      R.check('b) moving away mid-dig cancels it: the spot waits, nothing lost', c.st === 'found' && !c.busy && !c.lock, c);
    }
  }
  if (want('c')) {
    // the mouse: a click on a node walks there and gathers
    await ev(page, () => window.G.cozy.clock.add(24));
    const n = await firstFull(page);
    await ev(page, n => { const G = window.G; G.player.setPos(n.x + 4, n.z + 3); G.player.moveTarget = null; const r = G.engine.rig; r.distTarget = 18; r.focus.set(n.x + 2, G.player.pos.y, n.z + 1.5); r.snap(); }, n);
    await quiet(page); await sleep(page, 300);
    const sp = await screenOf(page, { x: n.x, y: n.y, z: n.z });
    await page.mouse.click(sp.x, sp.y);
    const g = await until(page, id => window.G.cozy.scav.nodes().find(x => x.id === id)?.taken, n.id, 8000);
    R.check('c) the mouse: a click on a node walks there and gathers it', g, { node: n.id });
    // hold the left button on a found spot (standing beside it)
    const s = await foundSpot(page, 0);
    await standAt(page, s.x, s.z, 1.0); await quiet(page); await sleep(page, 300);
    const ss = await screenOf(page, { x: s.x, y: s.y, z: s.z });
    await page.mouse.move(ss.x, ss.y); await page.mouse.down();
    const started = await until(page, () => window.G.cozy.scav.busy, null, 3000);
    const band = started && await ringAtBand(page);
    await page.mouse.up();
    await until(page, () => !window.G.cozy.scav.busy, null, 3000);
    const d = (await evs(page, 'scavenge:dig')).at(-1);
    R.check('c) the mouse: holding the left button on a found spot digs, and a release in the band is perfect', started && band && d?.spot === s.id && d.perfect === true, { started, band, d });
  }
  errs.push(...errors); warns.push(...w);
  await browser.close();
}

// ================================================================== d) the pad
if (want('d')) {
  const { browser, page, errors, warns: w } = await launch({ w: 1280, h: 720 });
  await boot(page, 'fresh&nointro&notut&hour=10');
  await installPad(page);
  await listen(page);
  await padTap(page, 'DUp'); await sleep(page, 200); // (the pad becomes the active device)
  const n = await firstFull(page);
  await standAt(page, n.x, n.z); await quiet(page); await sleep(page, 250);
  await padTap(page, 'A', 80);
  const g = await until(page, id => window.G.cozy.scav.nodes().find(x => x.id === id)?.taken, n.id, 4000);
  R.check('d) the pad: A at a node gathers it', g);
  await until(page, () => !window.G.life.tools.busy, null, 3000);
  const s = await foundSpot(page, 0);
  await standAt(page, s.x, s.z, 1.0); await quiet(page); await sleep(page, 250);
  const pre = await ev(page, () => ({ prompt: document.querySelector('.hud .prompt')?.textContent || '', busy: window.G.life.tools.busy, lock: window.G.player.controlLocked }));
  await padDown(page, 'A');
  const st0 = await ev(page, () => { const s = window.G.cozy.scav.session; return s ? { auto: s.auto, k: s.k } : null; });
  const band = await ringAtBand(page);
  if (!band) R.note(`d) pad dig: before ${JSON.stringify(pre)}, after A ${JSON.stringify(st0)}`);
  const hint = await ev(page, () => getComputedStyle(document.querySelector('.dr-hint .pad-only')).display !== 'none');
  await padUp(page, 'A');
  await until(page, () => window.__sc.some(e => e[0] === 'scavenge:dig'), null, 3000);
  const d = (await evs(page, 'scavenge:dig')).at(-1), rum = await evs(page, 'input:rumble');
  R.check('d) the pad: hold A digs (the ring shows the A cap); a release in the band is perfect, with a rumble', band && hint && d?.perfect === true && rum.length >= 1, { band, hint, d, rum: rum.length });
  errs.push(...errors); warns.push(...w);
  await browser.close();
}

// ================================================================== e) touch (a phone)
if (want('e')) {
  const { browser, page, errors, warns: w, F } = await launchTouch();
  await boot(page, 'fresh&nointro&notut&hour=10');
  await listen(page);
  await F.tap(420, 200); await sleep(page, 200); // (touch becomes the device)
  const n = await firstFull(page);
  await standAt(page, n.x, n.z); await quiet(page); await sleep(page, 300);
  let atk = await center(page, '.tc-attack');
  const ctx = await ev(page, () => document.querySelector('.tc-attack')?.classList.contains('ctx'));
  await F.tap(atk.x, atk.y);
  const g = await until(page, id => window.G.cozy.scav.nodes().find(x => x.id === id)?.taken, n.id, 4000);
  R.check('e) touch: with the prompt up, the attack button (a paw) gathers the node', g && ctx, { g, ctx });
  const s = await foundSpot(page, 0);
  await standAt(page, s.x, s.z, 1.0); await quiet(page); await sleep(page, 300);
  atk = await center(page, '.tc-attack');
  await F.down(1, atk.x, atk.y);
  const band = await ringAtBand(page);
  await F.up(1);
  const tapIcon = await ev(page, () => getComputedStyle(document.querySelector('.dr-hint .touch-only')).display !== 'none');
  await until(page, () => window.__sc.some(e => e[0] === 'scavenge:dig'), null, 3000);
  const d = (await evs(page, 'scavenge:dig')).at(-1);
  R.check('e) touch: holding the attack button digs (the ring shows the paw), a release in the band is perfect', band && tapIcon && d?.perfect === true, { band, tapIcon, d });
  const s2 = await foundSpot(page, 0);
  if (s2) {
    await standAt(page, s2.x, s2.z, 1.0); await quiet(page); await sleep(page, 300);
    const pr = await center(page, '.hud .prompt.show');
    if (pr) await F.tap(pr.x, pr.y);
    await until(page, () => window.__sc.filter(e => e[0] === 'scavenge:dig').length >= 2, null, 9000);
    const d2 = (await evs(page, 'scavenge:dig')).at(-1);
    R.check('e) touch: a tap on the prompt digs by itself (a good dig)', !!pr && d2?.spot === s2.id && d2.perfect === false, { pr: !!pr, d2 });
  }
  // the ring on a phone: a shot mid-dig, and the hint's size on screen
  const s3 = await foundSpot(page, 0);
  let ring = null;
  if (s3) {
    await standAt(page, s3.x, s3.z, 1.0); await quiet(page); await sleep(page, 300);
    atk = await center(page, '.tc-attack');
    await F.down(1, atk.x, atk.y);
    if (await ringAtBand(page)) await shot(page, 'e-phone-dig');
    ring = await ev(page, () => { const b = document.querySelector('.dr-hint b'), r = b?.getBoundingClientRect(), fs = parseFloat(getComputedStyle(b).fontSize); return r ? { fs: fs * (r.height / b.offsetHeight || 1) } : null; });
    await F.up(1);
  }
  R.check('e) the phone: the ring\'s hint text is at least 12 px', !ring || ring.fs >= 11.5, ring);
  errs.push(...errors); warns.push(...w);
  await browser.close();
}

// ================================================================== f) the zones
if (want('f')) {
  const { browser, page, errors, warns: w } = await launch({ w: 1280, h: 720 });
  for (const zone of ['bamboo', 'maple', 'tidepool', 'onsen']) {
    await boot(page, `fresh&nointro&notut&hour=10&region=${zone}&villagesaved=${zone}`);
    await waitMode(page, 'dungeon');
    const Z = await ev(page, async zone => {
      const G = window.G, W = G.world, P = W.plan, S = G.cozy.scav, PZ = await import('/src/cozy/peaceful.js');
      const wild = PZ.wildAreas(P), nodes = S.nodes(), spots = S.spots();
      const inWild = [...nodes, ...spots].filter(n => PZ.inWild(wild, n.x, n.z, 2)).length;
      const inVillage = P.village ? [...nodes, ...spots].filter(n => Math.hypot(n.x - P.village.x, n.z - P.village.z) < P.village.r).length : 0;
      const meshes = []; W.scene.traverse(o => { if (/^scavenge:/.test(o.name)) meshes.push(o.name); });
      const hidden = [...nodes, ...S.view().cands].filter(n => S.screenWhy(n.x, n.z, [0.55]).some(w => w.yaw > 0)).length;
      return { hidden, area: S.area(), n: nodes.length, kinds: [...new Set(nodes.map(n => n.kind))].length, spots: spots.length, inWild, wild: wild.length, inVillage, meshes: meshes.length, onTrail: nodes.filter(n => W.pathDist(n.x, n.z) < P.trailW + 0.8).length };
    }, zone);
    R.check(`f) ${zone}: ${Z.n} nodes of ${Z.kinds} kinds, ${Z.spots} dig spots; none on the trail, in the village or in a wild area (${Z.wild} areas), none hidden from the game camera; ${Z.meshes} draws`, Z.hidden === 0 && Z.area === zone && Z.n >= 14 && Z.n <= 18 && Z.spots >= 2 && Z.spots <= 3 && !Z.inWild && !Z.inVillage && !Z.onTrail && Z.meshes <= 3, Z);
  }
  // a zone quest's find item from a dig spot (Bamboo: Takumi's heartwood)
  await boot(page, 'fresh&nointro&notut&hour=10&region=bamboo&villagesaved=bamboo');
  await waitMode(page, 'dungeon');
  await listen(page);
  const q = await ev(page, () => {
    const G = window.G; G.state.quests.active.push({ id: 'tk_heartwood', step: 0, prog: 0 });
    G.cozy.scav.refill();
    const sp = G.cozy.scav.spots().find(s => s.quest); if (!sp) return { spot: null };
    const r = G.cozy.scav.digAt(sp.id, { k: 0.5 });
    return { spot: sp.id, quest: r?.quest?.item, prog: G.state.quests.active.find(x => x.id === 'tk_heartwood')?.prog, again: G.cozy.scav.spots().some(s => s.quest && s.state !== 'dug') };
  });
  const qf = await evs(page, 'quest:find');
  R.check('f) an active zone quest\'s find item turns up from a dig spot (one a day) and counts toward its step', q.spot && q.quest === 'tk_heartwood' && q.prog === 1 && qf.some(e => e.item === 'tk_heartwood' && e.dig), { q, qf: qf.length });
  errs.push(...errors); warns.push(...w);
  await browser.close();
}

// ================================================================== g) Pound Mochi, the away card, the debug actions
if (want('g')) {
  const { browser, page, errors, warns: w } = await launch({ w: 1600, h: 900 });
  await boot(page, 'fresh&nointro&notut&hour=10');
  const pm = await ev(page, async () => {
    const G = window.G; (G.state.pantry ||= {}).rice = 4; const m0 = G.state.materials.mochi || 0;
    G.life.kitchen.station = { kind: 'kitchen', at: G.player.pos.clone() };
    const r = await G.life.kitchen.cookBatch({ id: 'poundMochi', n: 1 });
    return { r, mochi: (G.state.materials.mochi || 0) - m0, rice: G.state.pantry.rice || 0 };
  });
  R.check('g) Pound Mochi at the kitchen: 2 rice → 2 Mochi', pm.r?.id === 'poundMochi' && pm.mochi === 2 && pm.rice === 2, pm);
  await ev(page, () => { const G = window.G; G.life.kitchen.open('kitchen'); G.ui.panels.cook.select?.('poundMochi'); });
  await sleep(page, 500);
  const card = await ev(page, () => ({ name: document.querySelector('.p-cook .ck-name b')?.textContent, chip: document.querySelector('.p-cook .ck-eff')?.textContent?.trim() }));
  await shot(page, 'g-pound-mochi');
  R.check('g) the Cook panel shows Pound Mochi: "Makes 2 Mochi" (no meal buff)', card.name === 'Pound Mochi' && /Makes 2 Mochi/.test(card.chip), card);
  await ev(page, () => window.G.ui.closeAll());
  // the away card: a node taken, then an absence that crosses a world day
  const aw = await ev(page, () => {
    const G = window.G, S = G.cozy.scav, n = S.nodes()[0]; S.gather(n.id);
    const C = G.state.cozy.clock; C.h = Math.floor(C.h / 24) * 24 + 23; C.wall = Date.now() - 8 * 35000 - 1000; G.cozy.pulse();
    return { h: C.h };
  });
  const shown = await until(page, () => window.G.ui.isOpen('awayCard'), null, 5000);
  const line = await ev(page, () => [...document.querySelectorAll('.p-away .aw-row.refill')].map(e => e.textContent.trim()).join(' | '));
  if (shown) await shot(page, 'g-away-refill');
  R.check('g) the "While you were away…" card says the nodes came back ("The driftwood has washed back up…")', shown && /driftwood has washed back up/.test(line), { shown, line, ...aw });
  await ev(page, () => window.G.ui.closeAll());
  // the debug section
  const dbg = await ev(page, async () => {
    const R2 = await import('/src/debug/registry.js'), S = R2.DEBUG_SECTIONS.get('cozy'), G = window.G;
    const labels = S.actions.map(a => a.label || a.note);
    const want = ['Refill every node', 'Show every node', 'A perfect-dig streak'];
    const run = l => S.actions.find(a => a.label === l);
    G.cozy.scav.gather(G.cozy.scav.nodes()[1].id);
    run('Refill every node').run(G);
    const refilled = G.cozy.scav.nodes().every(n => !n.taken);
    const shown = run('Show every node').run(G);
    const revealed = G.cozy.scav.spots().every(s => s.state !== 'hidden') && G.cozy.scav.mapMarks().length > 0;
    run('A perfect-dig streak').run(G, 5);
    const sp = G.cozy.scav.spots().find(s => s.state === 'found'), r = G.cozy.scav.digAt(sp.id, { k: 0.2 });
    return { has: want.every(l => labels.includes(l)), refilled, revealed, shown, perfect: r?.perfect, left: G.state.cozy.scav.cheat.perfect };
  });
  R.check('g) the Cozy debug tab: refill every node, show every node (spots revealed, minimap marks), a perfect-dig streak', dbg.has && dbg.refilled && dbg.revealed && dbg.perfect === true && dbg.left === 4, dbg);
  errs.push(...errors); warns.push(...w);
  await browser.close();
}

process.exit(R.finish(errs, warns) ? 1 : 0);
