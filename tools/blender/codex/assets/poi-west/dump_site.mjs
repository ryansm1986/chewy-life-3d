// poi-west: dump each place's ground, pool outlines and the kit's own meshes from the running game, in each kit call's frame.
//   node tools/blender/work/codex/poi-west/dump_site.mjs      → tools/blender/work/codex/poi-west/site/<id>.json, kit-<id>.obj
import fs from 'node:fs';
import { launch, BASE } from '../../../../qa/lib.mjs';
const OUT = 'tools/blender/work/codex/poi-west/site'; fs.mkdirSync(OUT, { recursive: true });
const IDS = ['lighthouse', 'tea', 'tidepools', 'wishtree'], Y0 = { lighthouse: -1.0, tea: 0.1, tidepools: -0.8, wishtree: 0.3 };
const { browser, page, errors } = await launch({ w: 800, h: 450 });
await page.goto(`${BASE}/?fresh&nointro&hour=10.5`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__ready === true && window.G?.outskirts, null, { timeout: 90000 });
const data = await page.evaluate(async ([IDS, Y0]) => {
  const { POIS } = await import('/src/world/outskirtsPlan.js');
  const W = await import('/src/world/outskirts/pois/_west.js');
  const G = window.G, world = G.world, H = (x, z) => world.terrain.heightAt(x, z);
  const out = {};
  for (const id of IDS) {
    const p = POIS.find(q => q.id === id), y0 = Y0[id], N = 15, step = 0.25, grid = [];
    for (let k = -N * 4; k <= N * 4; k++) { const row = []; for (let i = -N * 4; i <= N * 4; i++) row.push(+(H(p.x + i * step, p.z + k * step) - y0).toFixed(3)); grid.push(row); }
    // every kit group of this place, in build order: its local frame's meshes
    const groups = G.outskirts.group.children.filter(c => c.name === `west:${id}`);
    const kits = groups.map(g => {
      g.updateMatrixWorld(true);
      const meshes = [];
      g.traverse(o => { if (!o.isMesh) return; const ge = o.geometry, pos = ge.attributes.position, col = ge.attributes.color, uv = ge.attributes.uv, idx = ge.index; const m = o.matrixWorld.clone(); const inv = g.matrixWorld.clone().invert(); m.premultiply(inv);
        const P = []; const v = pos.clone(); for (let i = 0; i < pos.count; i++) { const e = m.elements, x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i); P.push(+(e[0] * x + e[4] * y + e[8] * z + e[12]).toFixed(3), +(e[1] * x + e[5] * y + e[9] * z + e[13]).toFixed(3), +(e[2] * x + e[6] * y + e[10] * z + e[14]).toFixed(3)); } void v;
        const C = []; if (col) for (let i = 0; i < pos.count; i++) C.push(+col.getX(i).toFixed(3), +col.getY(i).toFixed(3), +col.getZ(i).toFixed(3));
        meshes.push({ name: o.name, ink: !!o.userData.isInk, mat: o.material?.name || '', tris: (idx ? idx.count : pos.count) / 3, P, C, I: idx ? Array.from(idx.array) : null, uvy: uv ? [Math.min(...Array.from({ length: Math.min(pos.count, 2000) }, (_, i) => uv.getY(i))), Math.max(...Array.from({ length: Math.min(pos.count, 2000) }, (_, i) => uv.getY(i)))] : null });
      });
      return { pos: g.position.toArray(), rot: g.rotation.toArray().slice(0, 3), meshes };
    });
    out[id] = { id, x: p.x, z: p.z, r: p.r, y0, step, N, grid, kits, pools: null };
    // the pools' outlines and water heights, exactly as tidepools.js computes them
    if (id === 'tidepools') {
      const HL = (x, z) => H(p.x + x, p.z + z) - y0;
      const POOLS = [{ x: -0.55, z: -0.35, r: 1.3 }, { x: -2.75, z: 1.55, r: 1.4 }, { x: -4.75, z: -1.25, r: 1.15 }, { x: -1.25, z: 3.55, r: 0.95 }];
      for (const q of POOLS) { q.ol = W.blob(q.r, 30, 0.17, Math.round(q.x * 97 + q.z * 31) + 400); let top = -1e9; for (const [x, z] of q.ol) for (const k of [0, 0.4, 0.75, 1.05]) top = Math.max(top, HL(q.x + x * k, q.z + z * k)); q.y = top + 0.05; }
      out[id].pools = POOLS;
    }
  }
  return out;
}, [IDS, Y0]);
for (const id of IDS) {
  const d = data[id];
  const summary = d.kits.map((k, i) => ({ k: i, pos: k.pos, rot: k.rot, meshes: k.meshes.filter(m => !m.ink).map(m => ({ name: m.name, mat: m.mat, tris: m.tris, uvy: m.uvy })) }));
  console.log(id, 'at', d.x, d.z, 'r', d.r, JSON.stringify(summary));
  // OBJ with vertex colours (per kit)
  d.kits.forEach((k, i) => {
    let s = '', base = 1;
    for (const m of k.meshes) { if (m.ink) continue; const n = m.P.length / 3; s += `o m${i}_${m.mat || 'x'}\n`;
      for (let v = 0; v < n; v++) s += `v ${m.P[v * 3]} ${m.P[v * 3 + 1]} ${m.P[v * 3 + 2]} ${m.C.length ? `${m.C[v * 3]} ${m.C[v * 3 + 1]} ${m.C[v * 3 + 2]}` : '0.7 0.7 0.7'}\n`;
      const I = m.I; const tn = I ? I.length / 3 : n / 3;
      for (let t = 0; t < tn; t++) { const a = I ? I[t * 3] : t * 3, b = I ? I[t * 3 + 1] : t * 3 + 1, c = I ? I[t * 3 + 2] : t * 3 + 2; s += `f ${a + base} ${b + base} ${c + base}\n`; }
      base += n; }
    fs.writeFileSync(`${OUT}/kit-${id}-${i}.obj`, s);
  });
  const slim = { id, x: d.x, z: d.z, r: d.r, y0: d.y0, step: d.step, N: d.N, grid: d.grid, pools: d.pools, kits: summary };
  fs.writeFileSync(`${OUT}/${id}.json`, JSON.stringify(slim));
}
console.log('errors', errors.slice(0, 5));
await browser.close();
