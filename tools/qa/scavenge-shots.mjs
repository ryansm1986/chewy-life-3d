// The scavenging look review (docs/COZY.md §7.2 "Art", ROADMAP CZ-6): the node props at the game camera.
//   lineup   every node model (full, taken) and the dig spots laid out on the plaza, at the game camera and close up
//   areas    each area (Blossom Hollow and the four zones) at its nodes, at the game camera from both 45° yaws, with a
//            draw-call count for the area's scavenging meshes
//   dig      the dig ring mid-hold (in the band), Shadow's nose (sniff, trot, paw), a gather pose
//   usage: node tools/qa/scavenge-shots.mjs [lineup|areas|dig]...   → tools/qa/tmp/scavenge-shots/
import fs from 'node:fs';
import { launch, boot, sleep, waitMode } from './lib.mjs';

const OUT = new URL('./tmp/scavenge-shots/', import.meta.url); fs.mkdirSync(OUT, { recursive: true });
const shot = (page, n) => page.screenshot({ path: new URL(n + '.png', OUT).pathname.replace(/^\/([A-Z]:)/, '$1') });
const want = new Set(process.argv.slice(2).length ? process.argv.slice(2) : ['lineup', 'areas', 'dig']);
const ev = (page, fn, arg) => page.evaluate(fn, arg);
const { browser, page, errors } = await launch({ w: 1600, h: 900 });
const cam = (page, x, z, dist = 22, yaw = Math.PI / 4) => ev(page, ([x, z, dist, yaw]) => { const G = window.G, r = G.engine.rig; G.player.setPos(x, z); G.player.moveTarget = null; G.companion.setPos(x + 1.2, z + 0.6); r.distTarget = dist; r.yawTarget = yaw; r.focus.set(x, G.world.heightAt(x, z) + 0.6, z); r.snap(); }, [x, z, dist, yaw]);
const quiet = page => ev(page, () => { const G = window.G; G.ui.closeAll?.(); document.querySelectorAll('.toast, .tst').forEach(e => e.remove()); });

if (want.has('lineup')) {
  await boot(page, 'fresh&nointro&notut&hour=11');
  // a little studio out at sea (a flat meadow disc, nothing else near), each area's kinds (full, then taken) in a row
  // along the screen's right, and the dig spots' four grounds; each row at the game camera's yaw and distance
  const rows = await ev(page, async () => { const S = await import('/src/cozy/scavenge.js'); return [...Object.keys(S.AREA_DEFS), 'digs']; });
  const SX = 18, SZ = 150, SY = 0.4;
  for (const name of rows) {
    const R = await ev(page, async ([name, SX, SZ, SY]) => {
      const G = window.G, W = G.village.world, M = await import('/src/cozy/scavengeModels.js'), S = await import('/src/cozy/scavenge.js');
      window.__lineup?.parent?.remove(window.__lineup);
      if (!window.__studio) { const T = G.player.pos.constructor, g = M.studioGround?.(); window.__studio = g; }
      const ground = name === 'onsen' ? '#eef4fc' : name === 'tidepool' ? '#e8d6a6' : name === 'maple' ? '#c8b070' : '#8cc060';
      M.studioTint?.(window.__studio, ground); window.__studio.position.set(SX, SY, SZ); if (!window.__studio.parent) W.scene.add(window.__studio);
      const list = name === 'digs' ? ['loam', 'leafy', 'sand', 'snow'].flatMap(gd => { const d = M.digGeos(gd); return [d.mound, d.dug]; }) : Object.keys(S.AREA_DEFS[name].nodes).flatMap(k => { const g = M.nodeGeos(S.NODE_KINDS[k].model); return [g.full, g.taken]; });
      const { bm, ids } = M.scavBatch(list, list.length), sp = 0.95, k0 = -(list.length - 1) / 2;
      ids.forEach((gid, c) => { const t = (k0 + c) * sp, id = bm.addInstance(gid); bm.setMatrixAt(id, M.placeAt(SX + t * 0.7071, SY, SZ - t * 0.7071, 0.3)); });
      bm.computeBoundingBox(); bm.computeBoundingSphere(); W.scene.add(bm); window.__lineup = bm;
      G.player.setPos(60, 160);
      return { n: list.length };
    }, [name, SX, SZ, SY]);
    await quiet(page);
    await ev(page, ([x, y, z, d]) => { const G = window.G, r = G.engine.rig; G.heroFocus = { x, y, z }; r.distTarget = d; r.yawTarget = Math.PI / 4; r.focus.set(x, y + 0.6, z); r.snap(); }, [SX, SY, SZ, R.n > 8 ? 15 : 13]);
    await sleep(page, 700); await shot(page, `lineup-${name}`);
    if (name === 'home') { await ev(page, () => { window.G.engine.rig.distTarget = 24; window.G.engine.rig.snap(); }); await sleep(page, 500); await shot(page, 'lineup-game'); }
  }
  await ev(page, () => { window.G.heroFocus = null; });
}

if (want.has('areas')) {
  for (const area of ['home', 'bamboo', 'maple', 'tidepool', 'onsen']) {
    await boot(page, `fresh&nointro&notut&hour=11${area === 'home' ? '' : `&region=${area}&villagesaved=${area}`}`);
    if (area !== 'home') await waitMode(page, 'dungeon');
    await sleep(page, 1200);
    const info = await ev(page, () => { const G = window.G, v = G.cozy.scav.view(); if (!v) return null; G.cozy.scav.reveal(); const calls = [v.mesh, v.spark].filter(Boolean).length; return { area: v.area, nodes: v.nodes.map(n => ({ id: n.id, kind: n.kind, x: n.x, z: n.z })), spots: v.spots.length, calls }; });
    console.log(area, info && { nodes: info.nodes.length, spots: info.spots, calls: info.calls, kinds: [...new Set(info.nodes.map(n => n.kind))].join(',') });
    if (!info) continue;
    // three framings an area: the first nodes of three kinds, each at the game camera from both 45° yaws
    const seen = new Set(), picks = [];
    for (const n of info.nodes) if (!seen.has(n.kind) && picks.length < 4) { seen.add(n.kind); picks.push(n); }
    for (const [i, n] of picks.entries()) {
      for (const [yk, yaw] of [['a', Math.PI / 4], ['b', -Math.PI / 4]]) {
        await quiet(page);
        await cam(page, n.x - 1.5, n.z - 1.2, 22, yaw); await sleep(page, 600);
        await shot(page, `area-${area}-${i}-${n.kind}-${yk}`);
      }
    }
  }
}

if (want.has('dig')) {
  // the nose, the dig ring in the band, the perfect pop and a gather at home; a quest dig in Bamboo; each framed on the
  // middle of the action at the game camera (the hero beside the spot, the spot to the hero's left on screen)
  for (const area of ['home', 'bamboo']) {
    await boot(page, `fresh&nointro&notut&hour=11${area === 'home' ? '' : '&region=bamboo&villagesaved=bamboo'}`);
    if (area !== 'home') { await waitMode(page, 'dungeon'); await ev(page, () => { const G = window.G; G.state.quests.active.push({ id: 'tk_heartwood', step: 0, prog: 0 }); G.cozy.scav.refill(); }); }
    const s = await ev(page, () => { const S = window.G.cozy.scav; return S.spots().find(x => x.quest) || S.spots()[0]; });
    const frame = d => ev(page, ([s, d]) => { const G = window.G, r = G.engine.rig; G.heroFocus = { x: s.x + 1.6, y: G.world.heightAt(s.x, s.z), z: s.z - 1.6 }; r.distTarget = d; r.yawTarget = Math.PI / 4; r.focus.set(s.x + 1.6, G.world.heightAt(s.x, s.z) + 0.6, s.z - 1.6); r.snap(); }, [s, d]);
    await ev(page, s => { const G = window.G; G.player.setPos(s.x + 3.4, s.z - 3.4); G.player.moveTarget = null; G.player.faceTo(s.x, s.z); G.player.facing = G.player.faceTarget; G.companion.setPos(s.x + 3.9, s.z - 2.6); }, s);
    await frame(16); await quiet(page);
    await page.waitForFunction(() => window.G.companion.anim.action?.name === 'sniff', null, { timeout: 6000 }).catch(() => {});
    await sleep(page, 350); await shot(page, `dig-${area}-1-sniff`);
    await page.waitForFunction(() => window.G.companion.nose?.phase === 'paw', null, { timeout: 10000 }).catch(() => {});
    await sleep(page, 300); await shot(page, `dig-${area}-2-paw`);
    await page.waitForFunction(id => window.G.cozy.scav.spots().find(x => x.id === id)?.state === 'found', s.id, { timeout: 6000 }).catch(() => {});
    await sleep(page, 900); await shot(page, `dig-${area}-3-found`);
    await ev(page, s => { const G = window.G; G.player.setPos(s.x + 0.8, s.z - 0.8); G.player.moveTarget = null; G.interactCooldown = 0; G.cozy.scav.ringSpeed = 0.33; }, s);
    await frame(14); await sleep(page, 300); await quiet(page);
    await page.keyboard.down('f');
    await page.waitForFunction(() => (window.G.cozy.scav.session?.k || 0) >= 0.76, null, { timeout: 9000 }).catch(() => {});
    await page.keyboard.up('f'); // (let go in the band first; the shot of the ring in the band is the next dig's)
    await sleep(page, 120); await shot(page, `dig-${area}-5-perfect`);
    await sleep(page, 1200); await shot(page, `dig-${area}-6-dug`);
    const s2 = await ev(page, id => { const S = window.G.cozy.scav; S.reveal(); return S.spots().find(x => x.id !== id && x.state === 'found'); }, s.id);
    if (s2) {
      await ev(page, s => { const G = window.G; G.player.setPos(s.x + 0.8, s.z - 0.8); G.player.moveTarget = null; G.interactCooldown = 0; G.companion.setPos(s.x - 1, s.z + 1); }, s2);
      await ev(page, s => { const G = window.G, r = G.engine.rig; G.heroFocus = { x: s.x + 0.6, y: G.world.heightAt(s.x, s.z), z: s.z - 0.6 }; r.distTarget = 14; r.focus.set(s.x + 0.6, G.world.heightAt(s.x, s.z) + 0.6, s.z - 0.6); r.snap(); }, s2);
      await sleep(page, 400); await quiet(page);
      await page.keyboard.down('f');
      await page.waitForFunction(() => (window.G.cozy.scav.session?.k || 0) >= 0.77, null, { timeout: 9000 }).catch(() => {});
      await shot(page, `dig-${area}-4-band`);
      await page.keyboard.up('f'); await sleep(page, 1500);
    }
    if (area === 'home') { // a gather, framed the same way
      const n = await ev(page, () => window.G.cozy.scav.nodes().find(x => x.kind === 'petalDrift'));
      await ev(page, n => { const G = window.G; G.player.setPos(n.x + 0.85, n.z - 0.85); G.player.moveTarget = null; G.player.faceTo(n.x, n.z); G.player.facing = G.player.faceTarget; G.companion.setPos(n.x + 1.6, n.z + 0.4); G.interactCooldown = 0; const r = G.engine.rig; G.heroFocus = { x: n.x + 0.5, y: G.world.heightAt(n.x, n.z), z: n.z - 0.5 }; r.distTarget = 14; r.focus.set(n.x + 0.5, G.player.pos.y + 0.6, n.z - 0.5); r.snap(); }, n);
      await sleep(page, 400); await quiet(page); await shot(page, 'dig-home-7-before-gather');
      await page.keyboard.down('f'); await page.waitForFunction(() => window.G.player.anim.action?.name === 'pickup', null, { timeout: 2000 }).catch(() => {}); await sleep(page, 180); await shot(page, 'dig-home-8-gather'); await page.keyboard.up('f');
      await sleep(page, 900); await shot(page, 'dig-home-9-gathered');
    }
    await ev(page, () => { window.G.heroFocus = null; });
  }
}
console.log(errors.slice(0, 10).join('\n'));
await browser.close();
