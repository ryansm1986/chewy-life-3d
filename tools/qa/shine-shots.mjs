// The interact shine (gfx/interactShine.js): what each interactable in a world resolves to (its meshes, or the star),
// and game-camera shots of the player standing in F's reach of some of them.
// usage: node tools/qa/shine-shots.mjs [village|interior|dungeon|region] [label-regex] [--list]
import { launch, boot, waitMode, sleep } from './lib.mjs';
import fs from 'node:fs';
const [where = 'village', pick = '', ...rest] = process.argv.slice(2);
const LIST = rest.includes('--list') || process.argv.includes('--list');
const OUT = 'tools/qa/tmp/shine'; fs.mkdirSync(OUT, { recursive: true });
const { browser, page, errors } = await launch({ w: 1280, h: 720 });
const qs = { village: 'fresh&nointro&notut&hour=10', region: "fresh&nointro&notut&hour=10&region=bamboo&villagesaved=bamboo", dungeon: 'fresh&nointro&notut&floor=1', interior: 'fresh&nointro&notut&hour=10' }[where];
await boot(page, qs);
await waitMode(page, where === "interior" ? "village" : where === "region" ? "dungeon" : where, 60000);
if (where === 'interior') { // into Chewy's home
  await page.evaluate(() => { const W = window.G.world, d = W.interactables.find(i => /home|Go inside|Enter/i.test(i.label) && i.door !== false); d?.onInteract(); });
  await waitMode(page, 'interior');
}
await sleep(page, 1500);
const list = await page.evaluate(() => {
  const G = window.G, S = G.shine;
  const its = [...(G.mode === 'village' ? G.npcs.filter(n => n.visible).map(n => n.interact) : []), ...G.world.interactables];
  S.scene = G.world.scene;
  return its.map((it, i) => {
    const t = S.targets(it); let meshes = 0; const box = new G.THREE.Box3();
    for (const r of t) {
      if (r.batch) { meshes++; const g = r.batch.getGeometryIdAt(r.id), m = new G.THREE.Matrix4(); r.batch.getMatrixAt(r.id, m); box.union(r.batch.getBoundingBoxAt(g, new G.THREE.Box3()).applyMatrix4(m.premultiply(r.batch.matrixWorld))); continue; }
      if (r.inst) { meshes++; if (!r.inst.geometry.boundingBox) r.inst.geometry.computeBoundingBox(); box.union(r.inst.geometry.boundingBox.clone().applyMatrix4(r.matrix)); continue; }
      r.traverse(o => { if (o.isMesh && !o.userData.shineOverlay) meshes++; }); box.union(new G.THREE.Box3().setFromObject(r));
    }
    const sz = box.isEmpty() ? null : box.getSize(new G.THREE.Vector3()).toArray().map(v => +v.toFixed(2));
    return { i, label: it.label, node: t.map(r => r.batch ? r.batch.name + '@' + r.id : r.inst ? r.inst.name + '#' + r.i : (r.name || r.type)).join(',') || '(star)', meshes, size: sz, pos: [it.pos.x, it.pos.y, it.pos.z].map(v => +v.toFixed(1)) };
  });
});
for (const r of list) console.log(`${String(r.i).padStart(3)} ${String(r.label).padEnd(34).slice(0, 34)} ${r.node.slice(0, 30).padEnd(30)} meshes ${String(r.meshes).padStart(3)} size ${JSON.stringify(r.size)}`);
if (!LIST) {
  const re = new RegExp(pick || '.', 'i');
  const sel = list.filter(r => re.test(String(r.label))).slice(0, 14);
  for (const r of sel) {
    await page.evaluate(r => {
      const G = window.G, its = [...(G.mode === 'village' ? G.npcs.filter(n => n.visible).map(n => n.interact) : []), ...G.world.interactables];
      const it = its.filter(x => x.label === r.label).sort((a, b) => Math.hypot(a.pos.x - r.pos[0], a.pos.z - r.pos[2]) - Math.hypot(b.pos.x - r.pos[0], b.pos.z - r.pos[2]))[0];
      const p = it.pos, a = Math.PI / 4 + Math.PI / 2; // stand beside it (across the view), in reach
      const d = Math.min(1.1, (it.radius || 1.2) * 0.8);
      G.player.pos.set(p.x + Math.sin(a) * d, p.y, p.z + Math.cos(a) * d);
      G.player.moveTarget = null;
      if (it.actor) { it.actor.state = 'idle'; it.actor.goal = null; }
    }, r);
    await sleep(page, 1300);
    const name = `${where}-${String(r.i).padStart(3, '0')}-${String(r.label).replace(/[^a-z0-9]+/gi, '_').slice(0, 24)}`;
    const shown = await page.evaluate(() => { const [s, h] = window.G.shine.slots; return { it: s.it?.label || null, ov: s.overlays.length, star: !!s.star, amt: +s.amt.toFixed(2), hover: h.it?.label || null }; });
    await page.screenshot({ path: `${OUT}/${name}.png`, clip: { x: 340, y: 120, width: 600, height: 420 } });
    console.log('shot', name, JSON.stringify(shown));
  }
}
console.log(errors.slice(0, 8).join('\n') || 'no errors');
await browser.close();
