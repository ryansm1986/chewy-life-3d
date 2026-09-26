// Simple painted sign symbols as chunky extruded shapes (unit size, centred, facing +z).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const S = () => new THREE.Shape();
function circ(x, y, r) { const s = S(); s.absarc(x, y, r, 0, Math.PI * 2, false); return s; }
function ell(x, y, rx, ry, rot = 0) { const s = S(); s.absellipse(x, y, rx, ry, 0, Math.PI * 2, false, rot); return s; }
function rect(x0, y0, x1, y1, r = 0.03) {
  const s = S();
  s.moveTo(x0 + r, y0); s.lineTo(x1 - r, y0); s.quadraticCurveTo(x1, y0, x1, y0 + r); s.lineTo(x1, y1 - r);
  s.quadraticCurveTo(x1, y1, x1 - r, y1); s.lineTo(x0 + r, y1); s.quadraticCurveTo(x0, y1, x0, y1 - r); s.lineTo(x0, y0 + r);
  s.quadraticCurveTo(x0, y0, x0 + r, y0);
  return s;
}
function poly(pts) { const s = S(); s.moveTo(...pts[0]); for (let i = 1; i < pts.length; i++) s.lineTo(...pts[i]); s.closePath(); return s; }
function heart(sc = 1, ox = 0, oy = 0) {
  const s = S(), P = (x, y) => [ox + x * sc, oy + y * sc];
  s.moveTo(...P(0, -0.36));
  s.bezierCurveTo(...P(-0.12, -0.24), ...P(-0.46, -0.04), ...P(-0.46, 0.13));
  s.bezierCurveTo(...P(-0.46, 0.36), ...P(-0.2, 0.44), ...P(0, 0.22));
  s.bezierCurveTo(...P(0.2, 0.44), ...P(0.46, 0.36), ...P(0.46, 0.13));
  s.bezierCurveTo(...P(0.46, -0.04), ...P(0.12, -0.24), ...P(0, -0.36));
  return s;
}
function star(r0, r1, n = 5, ox = 0, oy = 0) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) { const a = Math.PI / 2 + i * Math.PI / n, r = i % 2 ? r1 : r0; pts.push([ox + Math.cos(a) * r, oy + Math.sin(a) * r]); }
  return poly(pts);
}
function paw(sc = 1, ox = 0, oy = 0) {
  return [ell(ox, oy - 0.1 * sc, 0.2 * sc, 0.16 * sc), circ(ox - 0.25 * sc, oy + 0.1 * sc, 0.085 * sc), circ(ox - 0.09 * sc, oy + 0.24 * sc, 0.09 * sc),
    circ(ox + 0.09 * sc, oy + 0.24 * sc, 0.09 * sc), circ(ox + 0.25 * sc, oy + 0.1 * sc, 0.085 * sc)];
}
function bone(sc = 1) {
  return [rect(-0.3 * sc, -0.085 * sc, 0.3 * sc, 0.085 * sc, 0.02), circ(-0.33 * sc, 0.09 * sc, 0.11 * sc), circ(-0.33 * sc, -0.09 * sc, 0.11 * sc), circ(0.33 * sc, 0.09 * sc, 0.11 * sc), circ(0.33 * sc, -0.09 * sc, 0.11 * sc)];
}
function flower(r = 0.34, ox = 0, oy = 0) {
  const out = [];
  for (let i = 0; i < 5; i++) { const a = Math.PI / 2 + i * Math.PI * 2 / 5; out.push(ell(ox + Math.cos(a) * r * 0.5, oy + Math.sin(a) * r * 0.5, r * 0.36, r * 0.3, a)); }
  return out;
}

// name -> layers [{shapes, color, z}] (z = stacking offset, in unit space)
export const SYMBOLS = {
  bone: () => [{ shapes: bone(), color: '#fff6e6' }],
  heart: () => [{ shapes: [heart()], color: '#ff6f8f' }],
  paw: () => [{ shapes: paw(), color: '#8a4a2c' }],
  pawHeart: () => [{ shapes: [heart(1.05)], color: '#ff6f7f' }, { shapes: paw(0.55, 0, 0.02), color: '#ffffff', z: 0.05 }],
  cake: () => [
    { shapes: [rect(-0.36, -0.34, 0.36, 0.02, 0.05)], color: '#fff0d8' },
    { shapes: [rect(-0.37, -0.2, 0.37, -0.12, 0.02)], color: '#ff8fb0', z: 0.04 },
    { shapes: [(() => { const s = S(); s.moveTo(-0.4, -0.04); s.lineTo(-0.4, 0.06); for (let i = 0; i <= 8; i++) { const x = -0.4 + i * 0.1; s.quadraticCurveTo(x - 0.05, 0.14, x, 0.06); } s.lineTo(0.4, -0.04); for (let i = 7; i >= 0; i--) { const x = -0.4 + i * 0.1; s.quadraticCurveTo(x + 0.05, -0.1, x, -0.04 - (i % 2) * 0.05); } return s; })()], color: '#ffb0cc', z: 0.04 },
    { shapes: [circ(0, 0.22, 0.1)], color: '#e8323a', z: 0.03 },
  ],
  onigiri: () => [
    { shapes: [(() => { const s = S(); s.moveTo(0, 0.38); s.quadraticCurveTo(0.08, 0.38, 0.38, -0.2); s.quadraticCurveTo(0.44, -0.34, 0.3, -0.34); s.lineTo(-0.3, -0.34); s.quadraticCurveTo(-0.44, -0.34, -0.38, -0.2); s.quadraticCurveTo(-0.08, 0.38, 0, 0.38); return s; })()], color: '#ffffff' },
    { shapes: [rect(-0.15, -0.36, 0.15, -0.08, 0.02)], color: '#2a3a30', z: 0.04 },
  ],
  taiyaki: () => [
    { shapes: [ell(-0.05, 0, 0.3, 0.2), poly([[0.18, 0], [0.42, 0.18], [0.36, 0], [0.42, -0.18]])], color: '#e8a050' },
    { shapes: [circ(-0.2, 0.05, 0.04)], color: '#4a2c2a', z: 0.04 },
    { shapes: [ell(0.02, -0.02, 0.12, 0.08)], color: '#f4c078', z: 0.03 },
  ],
  fish: () => [
    { shapes: [ell(-0.05, 0, 0.3, 0.17), poly([[0.18, 0], [0.42, 0.18], [0.36, 0], [0.42, -0.18]])], color: '#6aa8e0' },
    { shapes: [circ(-0.2, 0.04, 0.04)], color: '#23304a', z: 0.04 },
  ],
  teacup: () => [
    { shapes: [(() => { const s = S(); s.moveTo(-0.3, 0.12); s.lineTo(0.3, 0.12); s.quadraticCurveTo(0.28, -0.26, 0, -0.26); s.quadraticCurveTo(-0.28, -0.26, -0.3, 0.12); return s; })(), (() => { const s = circ(0.33, -0.02, 0.1); s.holes.push((() => { const h = new THREE.Path(); h.absarc(0.33, -0.02, 0.05, 0, Math.PI * 2, true); return h; })()); return s; })()], color: '#ffffff' },
    { shapes: [ell(0, -0.32, 0.36, 0.05)], color: '#9ad0e8' },
    { shapes: [ell(0, 0.1, 0.27, 0.04)], color: '#8fc070', z: 0.035 },
    { shapes: [ell(-0.08, 0.3, 0.04, 0.08), ell(0.08, 0.36, 0.04, 0.08)], color: '#fff6f0' },
  ],
  flower: () => [{ shapes: flower(0.4), color: '#ff9ec0' }, { shapes: [circ(0, 0, 0.1)], color: '#ffd24a', z: 0.04 }],
  bread: () => [
    { shapes: [(() => { const s = S(); s.moveTo(-0.42, -0.18); s.quadraticCurveTo(-0.46, 0.22, 0, 0.24); s.quadraticCurveTo(0.46, 0.22, 0.42, -0.18); s.closePath(); return s; })()], color: '#d89050' },
    { shapes: [ell(-0.18, 0.06, 0.05, 0.1, 0.5), ell(0, 0.08, 0.05, 0.11, 0.5), ell(0.18, 0.06, 0.05, 0.1, 0.5)], color: '#f8d8a0', z: 0.04 },
  ],
  star: () => [{ shapes: [star(0.42, 0.19)], color: '#ffd24a' }],
  toy: () => [{ shapes: [circ(0, 0, 0.34)], color: '#ff6f7f' }, { shapes: [rect(-0.34, -0.07, 0.34, 0.07, 0.02)], color: '#ffffff', z: 0.03 }, { shapes: [star(0.14, 0.06, 5, 0, 0)], color: '#ffd24a', z: 0.05 }],
  hammer: () => [{ shapes: [rect(-0.05, -0.38, 0.05, 0.14, 0.02)], color: '#c98f5e' }, { shapes: [rect(-0.3, 0.1, 0.3, 0.32, 0.05)], color: '#6a6878', z: 0.02 }],
  vase: () => [{ shapes: [(() => { const s = S(); s.moveTo(-0.1, 0.36); s.lineTo(0.1, 0.36); s.quadraticCurveTo(0.06, 0.2, 0.26, 0.02); s.quadraticCurveTo(0.36, -0.26, 0.14, -0.36); s.lineTo(-0.14, -0.36); s.quadraticCurveTo(-0.36, -0.26, -0.26, 0.02); s.quadraticCurveTo(-0.06, 0.2, -0.1, 0.36); return s; })()], color: '#5a8ac8' }, { shapes: [rect(-0.26, -0.08, 0.26, -0.01, 0.01)], color: '#ffffff', z: 0.03 }],
  log: () => [{ shapes: [circ(0, 0, 0.36)], color: '#a0704a' }, { shapes: [circ(0, 0, 0.27)], color: '#e8c08a', z: 0.03 }, { shapes: [circ(0, 0, 0.12)], color: '#c89868', z: 0.05 }],
  book: () => [{ shapes: [rect(-0.34, -0.26, 0.34, 0.26, 0.04)], color: '#5a7ac8' }, { shapes: [rect(-0.3, -0.22, -0.02, 0.22, 0.02), rect(0.02, -0.22, 0.3, 0.22, 0.02)], color: '#fff8ea', z: 0.03 }, { shapes: [star(0.1, 0.045, 5, 0.16, 0.02)], color: '#ffc040', z: 0.05 }],
  dango: () => [{ shapes: [rect(-0.02, -0.42, 0.02, 0.4, 0.01)], color: '#c98f5e' }, { shapes: [circ(0, 0.22, 0.13)], color: '#ff9ec0', z: 0.03 }, { shapes: [circ(0, -0.02, 0.13)], color: '#fff6ea', z: 0.03 }, { shapes: [circ(0, -0.26, 0.13)], color: '#9ad07a', z: 0.03 }],
  coin: () => [{ shapes: [(() => { const s = circ(0, 0, 0.36); const h = new THREE.Path(); h.moveTo(-0.08, -0.08); h.lineTo(-0.08, 0.08); h.lineTo(0.08, 0.08); h.lineTo(0.08, -0.08); h.closePath(); s.holes.push(h); return s; })()], color: '#f4c04a' }],
  bell: () => [{ shapes: [(() => { const s = S(); s.moveTo(-0.32, -0.24); s.quadraticCurveTo(-0.22, -0.18, -0.22, 0.08); s.quadraticCurveTo(-0.2, 0.32, 0, 0.32); s.quadraticCurveTo(0.2, 0.32, 0.22, 0.08); s.quadraticCurveTo(0.22, -0.18, 0.32, -0.24); s.closePath(); return s; })()], color: '#f4c04a' }, { shapes: [circ(0, -0.3, 0.07)], color: '#c89030', z: 0.02 }],
  leaf: () => [{ shapes: [(() => { const s = S(); s.moveTo(0, -0.38); s.quadraticCurveTo(0.4, -0.1, 0, 0.38); s.quadraticCurveTo(-0.4, -0.1, 0, -0.38); return s; })()], color: '#6ab04c' }],
  sakura: () => [{ shapes: flower(0.42), color: '#ffbcd6' }, { shapes: [circ(0, 0, 0.09)], color: '#ff7aa8', z: 0.04 }],
  mochi: () => [{ shapes: [ell(0, -0.06, 0.36, 0.26)], color: '#fff4f6' }, { shapes: [circ(-0.12, -0.02, 0.035), circ(0.12, -0.02, 0.035)], color: '#3a2a30', z: 0.04 }, { shapes: [ell(-0.2, -0.12, 0.05, 0.03), ell(0.2, -0.12, 0.05, 0.03)], color: '#ffa0b8', z: 0.04 }],
  tea: () => SYMBOLS.teacup(),
};

export function shapeGeo(shapes, depth = 0.06, bevel = 0.02, curve = 8) {
  const g = new THREE.ExtrudeGeometry(shapes, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: curve });
  g.translate(0, 0, bevel);
  g.deleteAttribute('uv');
  return g.index ? g.toNonIndexed() : g;
}

// Extruded symbol in the builder's local frame (unit symbol scaled by `size`, back at z=0)
export function symbol(B, name, size = 0.5, { depth = 0.05, colors } = {}) {
  const layers = (SYMBOLS[name] || SYMBOLS.star)();
  B.at([0, 0, 0], 0, () => {
    layers.forEach((L, i) => {
      const g = shapeGeo(L.shapes, depth, 0.018);
      g.translate(0, 0, (L.z ?? 0) + i * 0.004);
      B.add(g, colors?.[i] || L.color);
    });
  }, size);
}

// Flat (ShapeGeometry) version of a symbol's first layer, unit size — for cloth prints
export function flatSymbol(name) {
  const layers = (SYMBOLS[name] || SYMBOLS.star)();
  const g = new THREE.ShapeGeometry(layers[0].shapes, 8);
  const out = g.index ? g.toNonIndexed() : g;
  return out;
}
export { mergeGeometries };
