// Dump the Maple Halls kit pieces (src/dungeon/zoneKits/maple.js KIT_PIECES) to OBJ (+ vertex colours). Read-only on src.
//   node dump_kit.mjs hokora:0 culmStack:1 ...  -> kit-<name>-<seed>.obj + an info line
import '../../../../../../src/dungeon/zoneKits/index.js';
import { KIT_PIECES } from '../../../../../../src/dungeon/zoneKits/maple.js';
import fs from 'fs';
import path from 'path';
const here = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1');
const s8 = c => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055).toFixed(3);
const BUCKETS = ['body', 'glow', 'leaf', 'cloth', 'water', 'stone', 'hot'];
for (const spec of process.argv.slice(2)) {
  const [name, seedS] = spec.split(':');
  const pc = KIT_PIECES[name](+seedS);
  let out = [], nv = 1, tris = 0, info = {}, bb = [[1e9, 1e9, 1e9], [-1e9, -1e9, -1e9]];
  for (const k of BUCKETS) {
    const g = pc[k]; if (!g || !g.attributes) continue;
    out.push(`o kit_${k}`);
    const gg = g.index ? g.toNonIndexed() : g;
    const p = gg.attributes.position, c = gg.attributes.color;
    const lb = [[1e9, 1e9, 1e9], [-1e9, -1e9, -1e9]];
    for (let i = 0; i < p.count; i++) {
      const v = [p.getX(i), p.getY(i), p.getZ(i)];
      for (let a = 0; a < 3; a++) { bb[0][a] = Math.min(bb[0][a], v[a]); bb[1][a] = Math.max(bb[1][a], v[a]); lb[0][a] = Math.min(lb[0][a], v[a]); lb[1][a] = Math.max(lb[1][a], v[a]); }
      out.push(`v ${v.map(x => x.toFixed(4)).join(' ')} ${c ? s8(c.getX(i)) + ' ' + s8(c.getY(i)) + ' ' + s8(c.getZ(i)) : '1 1 1'}`);
    }
    for (let i = 0; i < p.count; i += 3) out.push(`f ${nv + i} ${nv + i + 1} ${nv + i + 2}`);
    nv += p.count; tris += p.count / 3;
    info[k] = { tris: p.count / 3, bb: lb.map(a => a.map(v => +v.toFixed(3))) };
  }
  fs.writeFileSync(path.join(here, `kit-${name}-${seedS}.obj`), out.join('\n'));
  console.log(JSON.stringify({ name, seed: +seedS, tris, bb: bb.map(a => a.map(v => +v.toFixed(3))), buckets: info,
    lights: (pc.lights || []).map(l => ({ pos: l.pos?.toArray ? l.pos.toArray().map(v => +v.toFixed(3)) : l.pos, color: l.color, radius: l.radius })) }));
}
