// Log the kit's detail-stream choices per variant: window dressing (B._dress), the chimney rain hat, the zabuton colour.
import { Builder } from '../../../../../../src/world/buildings/kit.js';
import { MODELS } from '../../../../../../src/world/buildings/models.js';
import { sizeOf } from '../../../../../../src/world/buildings/catalog.js';
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const L = +(process.argv[2] || 2), out = {};
for (let v = 0; v < 8; v++) {
  const B = new Builder((hashStr('home') + L * 977 + v * 7919) >>> 0); B.level = L; B.detail = [0, 1, 2][L - 1]; B.variant = v; B.id = 'home'; B.style = null;
  B.footprint = [...sizeOf('home', L)];
  const rec = { hat: null, zabuton: null, patches: 0, sudareDrops: [] };
  const oc = B.dchance.bind(B), odp = B.dpick.bind(B);
  B.dchance = p => { const r = oc(p); const st = new Error().stack; if (/chimney/.test(st)) rec.hat = r; if (/weatherWalls/.test(st)) rec.patches += r ? 1 : 0; if (/sudare/.test(st)) rec.sudareDrops.push(r); return r; };
  B.dpick = a => { const r = odp(a); const st = new Error().stack; if (/teaSet/.test(st)) rec.zabuton = r; return r; };
  MODELS.home(B, L, v);
  rec.dress = B._dress;
  out[v] = rec;
}
console.log(JSON.stringify(out));
