// Log the yard-prop kinds the kit picks per variant (homes.js yardProps: B.int(0,5) then the yaw B.rand(0, 2PI)).
import { Builder } from '../../../../../../src/world/buildings/kit.js';
import { MODELS } from '../../../../../../src/world/buildings/models.js';
import { sizeOf } from '../../../../../../src/world/buildings/catalog.js';
import { FLOWERS } from '../../../../../../src/world/buildings/parts.js';
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const L = +(process.argv[2] || 2), out = {};
for (let v = 0; v < 8; v++) {
  const B = new Builder((hashStr('home') + L * 977 + v * 7919) >>> 0); B.level = L; B.detail = [0, 1, 2][L - 1]; B.variant = v; B.id = 'home'; B.style = null;
  B.footprint = [...sizeOf('home', L)];
  const log = []; let want = 0, picks = [];
  const oi = B.int.bind(B), orr = B.rand.bind(B), op = B.pick.bind(B);
  B.int = (a, b) => { const k = oi(a, b); if (a === 0 && b === 5) { log.push({ k }); want = 1; } return k; };
  B.rand = (a, b) => { const r = orr(a, b); if (want) { log[log.length - 1].yaw = +r.toFixed(3); want = 0; } return r; };
  B.pick = a => { const r = op(a); if (a === FLOWERS) picks.push(r); return r; };
  MODELS.home(B, L, v);
  out[v] = { yard: log, flowerPicks: picks };
}
console.log(JSON.stringify(out));
