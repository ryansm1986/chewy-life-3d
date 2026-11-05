// Dump the kit homes (src/world/buildings/homes.js) to OBJ (+ vertex colours) for reference. Read-only on src.
//   node dump_kit.mjs home:2:0 home:2:1 ...   (id:level:variant; the Builder seed as buildings/index.js getTemplate)
import { Builder } from '../../../../../../src/world/buildings/kit.js';
import { MODELS } from '../../../../../../src/world/buildings/models.js';
import { sizeOf } from '../../../../../../src/world/buildings/catalog.js';
import fs from 'fs';
import path from 'path';
const here = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1');
const DETAIL = { home: [0, 1, 2] };
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const all = {};
for (const spec of process.argv.slice(2)) {
  const [id, Ls, vs] = spec.split(':'); const L = +(Ls || 1), v = +(vs || 0);
  const B = new Builder((hashStr(id) + L * 977 + v * 7919) >>> 0); B.level = L; B.detail = DETAIL[id][L - 1]; B.variant = v; B.id = id; B.style = null;
  B.footprint = [...sizeOf(id, L)];
  MODELS[id](B, L, v);
  const tpl = B.finish();
  let out = [], nv = 1, info = {}, tris = 0;
  const s8 = c => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055).toFixed(3);
  for (const [k, g] of Object.entries(tpl.geos)) {
    out.push(`o kit_${k}`);
    const gg = g.index ? g.toNonIndexed() : g;
    const p = gg.attributes.position, c = gg.attributes.color;
    for (let i = 0; i < p.count; i++) out.push(`v ${p.getX(i).toFixed(4)} ${p.getY(i).toFixed(4)} ${p.getZ(i).toFixed(4)} ${c ? s8(c.getX(i)) + ' ' + s8(c.getY(i)) + ' ' + s8(c.getZ(i)) : '1 1 1'}`);
    for (let i = 0; i < p.count; i += 3) out.push(`f ${nv + i} ${nv + i + 1} ${nv + i + 2}`);
    nv += p.count; tris += p.count / 3;
    gg.computeBoundingBox(); info[k] = [gg.boundingBox.min.toArray().map(v => +v.toFixed(3)), gg.boundingBox.max.toArray().map(v => +v.toFixed(3))];
  }
  fs.writeFileSync(path.join(here, `kit-${id}-${L}-v${v}.obj`), out.join('\n'));
  const rec = { seed: B.seed, door: tpl.door.toArray().map(x => +x.toFixed(3)), height: +tpl.height.toFixed(3), tris, anims: tpl.anims.length,
    smoke: tpl.smoke.map(p => p.toArray().map(x => +x.toFixed(3))), lights: tpl.lights.map(l => l.pos.toArray().map(x => +x.toFixed(3))), bb: info };
  all[`${id}-${L}-v${v}`] = rec;
  console.log(id, L, v, JSON.stringify(rec));
}
fs.writeFileSync(path.join(here, 'kit-info.json'), JSON.stringify(all, null, 1));
