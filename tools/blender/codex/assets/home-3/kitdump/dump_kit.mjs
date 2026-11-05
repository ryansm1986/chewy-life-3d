// Dump the kit home (src/world/buildings/homes.js) per variant to OBJ (+ vertex colours) and JSON, read-only on src.
//   node dump_kit.mjs 3            (level; all 8 variants)
// Mirrors buildings/index.js getTemplate: seed hashStr(id) + level * 977 + v * 7919, B.detail per level (home [0, 1, 2]).
// Also logs the random yard props (yardProps: kind k and yaw per spot) by wrapping the Builder's stream inside it.
import { Builder } from '../../../../../../src/world/buildings/kit.js';
import { MODELS } from '../../../../../../src/world/buildings/models.js';
import { sizeOf } from '../../../../../../src/world/buildings/catalog.js';
import fs from 'fs';
import path from 'path';
const here = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1');
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const id = 'home', L = +(process.argv[2] || 3);
const all = {};
for (let v = 0; v < 8; v++) {
  const B = new Builder((hashStr(id) + L * 977 + v * 7919) >>> 0);
  B.variant = v; B.level = L; B.id = id; B.detail = [0, 1, 2][L - 1]; B.style = null;
  B.footprint = [...sizeOf(id, L)];
  // yard prop log: B.int / B.at called straight from yardProps
  const yard = [], caller = () => (new Error().stack.split('\n')[3] || '');
  const oInt = B.int.bind(B), oAt = B.at.bind(B), oPick = B.pick.bind(B), oChance = B.chance.bind(B);
  let cur = null;
  B.int = (a, b) => { const r = oInt(a, b); if (caller().includes('yardProps')) { cur = { k: r }; yard.push(cur); } return r; };
  B.at = (p, ry, fn, s, rx, rz) => {
    if (caller().includes('yardProps') && cur && cur.pos == null) { cur.pos = [...p]; cur.ry = ry; cur.picks = []; const c0 = cur; B.pick = a => { const r = oPick(a); c0.picks.push(r); return r; }; B.chance = q => { const r = oChance(q); c0.picks.push(r); return r; }; const out = oAt(p, ry, fn, s, rx, rz); B.pick = oPick; B.chance = oChance; return out; }
    return oAt(p, ry, fn, s, rx, rz);
  };
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
    gg.computeBoundingBox(); info[k] = [gg.boundingBox.min.toArray().map(q => +q.toFixed(3)), gg.boundingBox.max.toArray().map(q => +q.toFixed(3))];
  }
  fs.writeFileSync(path.join(here, `kit-${id}-${L}-v${v}.obj`), out.join('\n'));
  const r3 = a => a.toArray().map(q => +q.toFixed(3));
  const rec = { door: r3(tpl.door), height: +tpl.height.toFixed(3), tris, footprint: tpl.footprint, smoke: tpl.smoke.map(r3), lights: tpl.lights.map(l => r3(l.pos)),
    anims: tpl.anims.length, bb: info, yard: yard.map(y => ({ k: y.k, pos: y.pos, ry: y.ry && +y.ry.toFixed(3), picks: y.picks })) };
  all[v] = rec;
  console.log(`${id}-${L}-v${v}`, JSON.stringify(rec));
}
fs.writeFileSync(path.join(here, `kit-${id}-${L}.json`), JSON.stringify(all, null, 1));
