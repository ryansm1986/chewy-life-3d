// Dump the kit homes (src/world/buildings/homes.js) per variant to OBJ (+ vertex colours), plus the kit template's door,
// height, smoke, lights, and a log of the Builder's random choices the Blender build reads (variant JSON).
// Read-only on src.   node dump_kit.mjs [level] [variants...]
import { Builder } from '../../../../../../src/world/buildings/kit.js';
import { MODELS } from '../../../../../../src/world/buildings/models.js';
import { sizeOf } from '../../../../../../src/world/buildings/catalog.js';
import fs from 'fs';
import path from 'path';
const here = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1');
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const L = +(process.argv[2] || 1), id = 'home';
const vs = process.argv.length > 3 ? process.argv.slice(3).map(Number) : [0, 1, 2, 3, 4, 5, 6, 7];
const DETAIL = [0, 1, 2];
const all = {};
for (const v of vs) {
  const B = new Builder((hashStr(id) + L * 977 + v * 7919) >>> 0);
  B.variant = v; B.level = L; B.id = id; B.detail = DETAIL[L - 1]; B.style = null;
  B.footprint = [...sizeOf(id, L)];
  // instrument: an event log of the random calls and placements
  const ev = [];
  const wrap = (name, f) => { const o = B[name].bind(B); B[name] = (...a) => { const r = o(...a); f(a, r); return r; }; };
  wrap('int', (a, r) => ev.push(['int', a[0], a[1], r]));
  wrap('rand', (a, r) => ev.push(['rand', a[0], a[1], +r.toFixed(5)]));
  wrap('pick', (a, r) => ev.push(['pick', a[0].length, typeof r === 'string' ? r : String(r)]));
  wrap('chance', (a, r) => ev.push(['chance', a[0], r]));
  wrap('dchance', (a, r) => ev.push(['dchance', a[0], r]));
  wrap('dpick', (a, r) => ev.push(['dpick', a[0].map(String).join('|'), String(r)]));
  wrap('smokeAt', (a) => ev.push(['smoke', a[0]]));
  const at0 = B.at.bind(B); let depth = 0;
  B.at = (p, ry, fn, s = 1, rx = 0, rz = 0) => { const w = B.pt(p[0], p[1], p[2]); ev.push(['at', depth, w.toArray().map(x => +x.toFixed(4)), +(ry || 0).toFixed(4)]); depth++; try { return at0(p, ry, fn, s, rx, rz); } finally { depth--; } };
  MODELS[id](B, L, v);
  const tpl = B.finish();
  // ---- derived choices
  const ch = { koshi: null, yard: [], hat: null, dress: null, flowersPicked: [] };
  for (let i = 0; i < ev.length; i++) {
    const e = ev[i];
    if (e[0] === 'pick' && e[1] === 3 && ['#c9a27a', '#b88e6a', '#d8b48a'].includes(e[2]) && ch.koshi == null) ch.koshi = e[2];
    if (e[0] === 'dpick' && e[1] === 'shutter|sudare|none') ch.dress = e[2];
    if (e[0] === 'int' && e[1] === 0 && e[2] === 5) {
      let j = i + 1; const fl = [];
      while (j < ev.length && ev[j][0] !== 'at') { if (ev[j][0] === 'pick') fl.push(ev[j][2]); j++; }
      const at = ev[j]; let bushFl = null;
      for (let q = j + 1; q < Math.min(ev.length, j + 4); q++) if (ev[q][0] === 'chance') { bushFl = ev[q][2]; if (bushFl && ev[q + 1]?.[0] === 'pick') bushFl = ev[q + 1][2]; break; }
      ch.yard.push({ k: e[3], pos: at[2], ry: at[3], flowers: fl, bushFlower: bushFl });
    }
    if (e[0] === 'smoke') { for (let q = i - 1; q >= 0; q--) if (ev[q][0] === 'dchance') { ch.hat = ev[q][2]; break; } }
  }
  // chopping block yaw (a top-level at after a rand(0,1))
  for (let i = 1; i < ev.length; i++) if (ev[i][0] === 'at' && ev[i][1] === 0 && ev[i - 1][0] === 'rand' && ev[i - 1][1] === 0 && ev[i - 1][2] === 1) ch.chopRy = ev[i][3];
  let out = [], nv = 1, info = {}, tris = 0;
  const s8 = c => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055).toFixed(3);
  const dumpGeo = (k, g) => {
    out.push(`o kit_${k}`);
    const gg = g.index ? g.toNonIndexed() : g;
    const p = gg.attributes.position, c = gg.attributes.color;
    for (let i = 0; i < p.count; i++) out.push(`v ${p.getX(i).toFixed(4)} ${p.getY(i).toFixed(4)} ${p.getZ(i).toFixed(4)} ${c ? s8(c.getX(i)) + ' ' + s8(c.getY(i)) + ' ' + s8(c.getZ(i)) : '1 1 1'}`);
    for (let i = 0; i < p.count; i += 3) out.push(`f ${nv + i} ${nv + i + 1} ${nv + i + 2}`);
    nv += p.count; tris += p.count / 3;
    gg.computeBoundingBox(); info[k] = [gg.boundingBox.min.toArray().map(v => +v.toFixed(3)), gg.boundingBox.max.toArray().map(v => +v.toFixed(3))];
  };
  for (const [k, g] of Object.entries(tpl.geos)) dumpGeo(k, g);
  tpl.anims.forEach((a, i) => { for (const [k, g] of Object.entries(a.geos)) { const gg = g.clone(); gg.translate(a.pivot.x, a.pivot.y, a.pivot.z); dumpGeo('anim' + i + '_' + k, gg); } });
  fs.writeFileSync(path.join(here, `kit-${id}-${L}-v${v}.obj`), out.join('\n'));
  const rec = { door: tpl.door.toArray(), height: +tpl.height.toFixed(4), tris, smoke: tpl.smoke.map(p => p.toArray().map(x => +x.toFixed(4))), lights: tpl.lights.map(l => l.pos.toArray().map(x => +x.toFixed(4))), anims: tpl.anims.length, layers: Object.keys(tpl.geos), bb: info, choices: ch };
  all[v] = rec;
  console.log(`v${v}`, JSON.stringify(rec));
}
fs.writeFileSync(path.join(here, `kit-${id}-${L}.json`), JSON.stringify(all, null, 1));
