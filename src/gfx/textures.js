// Procedurally painted canvas textures (brush noise, foliage cards, particles...)
import * as THREE from 'three';
import { mulberry32, TAU } from '../core/util.js';

const cache = new Map();
function canvas(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return { c, g: c.getContext('2d') }; }
function tex(c, { repeat = false, srgb = false, mip = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.generateMipmaps = mip;
  t.needsUpdate = true;
  return t;
}
function memo(key, fn) { if (!cache.has(key)) cache.set(key, fn()); return cache.get(key); }

// Tileable painterly noise. R: fine dabs, G: big soft blotches, B: directional strokes, A: 1
export function brushTexture() {
  return memo('brush', () => {
    const S = 512, r = mulberry32(7);
    const layer = (count, minR, maxR, elong, alpha, blur) => {
      const { c, g } = canvas(S);
      g.fillStyle = '#808080'; g.fillRect(0, 0, S, S);
      g.filter = blur ? `blur(${blur}px)` : 'none';
      for (let i = 0; i < count; i++) {
        const x = r() * S, y = r() * S, rad = minR + r() * (maxR - minR), a = r() * TAU;
        const v = Math.floor(r() * 255);
        g.fillStyle = `rgba(${v},${v},${v},${alpha})`;
        for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
          const px = x + ox * S, py = y + oy * S;
          if (px < -maxR * elong || px > S + maxR * elong || py < -maxR * elong || py > S + maxR * elong) continue;
          g.save(); g.translate(px, py); g.rotate(a); g.beginPath(); g.ellipse(0, 0, rad * elong, rad, 0, 0, TAU); g.fill(); g.restore();
        }
      }
      return g.getImageData(0, 0, S, S).data;
    };
    const R = layer(4200, 3, 11, 2.2, 0.16, 0.6);
    const G = layer(260, 30, 90, 1.4, 0.13, 8);
    const B = (() => { // directional hatching
      const { c, g } = canvas(S);
      g.fillStyle = '#808080'; g.fillRect(0, 0, S, S); g.filter = 'blur(0.8px)';
      for (let i = 0; i < 2600; i++) {
        const x = r() * S, y = r() * S, len = 10 + r() * 26, v = Math.floor(r() * 255), a = -0.6 + r() * 0.25;
        g.strokeStyle = `rgba(${v},${v},${v},0.22)`; g.lineWidth = 2 + r() * 4; g.lineCap = 'round';
        for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
          const px = x + ox * S, py = y + oy * S;
          g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.cos(a) * len, py + Math.sin(a) * len); g.stroke();
        }
      }
      return g.getImageData(0, 0, S, S).data;
    })();
    const { c, g } = canvas(S);
    const out = g.createImageData(S, S);
    for (let i = 0; i < S * S * 4; i += 4) { out.data[i] = R[i]; out.data[i + 1] = G[i]; out.data[i + 2] = B[i]; out.data[i + 3] = 255; }
    g.putImageData(out, 0, 0);
    return tex(c, { repeat: true });
  });
}

// Tileable cellular 'floret' pattern for canopy clumps (Worley noise, 10x10 jittered cells, wraps seamlessly).
// R: F2-F1 (0 in the gaps between florets), G: per-floret random value, B: F1 (0 at a floret's centre).
export function floretTexture() {
  return memo('floret', () => {
    const S = 256, N = 10, cell = S / N, r = mulberry32(31);
    const pts = [];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) pts.push({ x: (i + 0.15 + r() * 0.7) * cell, y: (j + 0.15 + r() * 0.7) * cell, v: r() });
    const { c, g } = canvas(S);
    const img = g.createImageData(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const ci = Math.floor(x / cell), cj = Math.floor(y / cell);
      let f1 = 1e9, f2 = 1e9, v = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const ii = (ci + di + N) % N, jj = (cj + dj + N) % N, q = pts[jj * N + ii];
        const px = q.x + Math.floor((ci + di) / N) * S, py = q.y + Math.floor((cj + dj) / N) * S;
        const d = Math.hypot(x - px, y - py);
        if (d < f1) { f2 = f1; f1 = d; v = q.v; } else if (d < f2) f2 = d;
      }
      const k = (y * S + x) * 4;
      img.data[k] = Math.min(255, (f2 - f1) / cell * 255 * 1.4);
      img.data[k + 1] = v * 255;
      img.data[k + 2] = Math.min(255, f1 / cell * 255 * 1.3);
      img.data[k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return tex(c, { repeat: true });
  });
}

// Foliage card: clustered leaves (alpha) with painted value variation in RGB.
export function leafCardTexture(kind = 'leaf') {
  return memo('leaf:' + kind, () => {
    const S = 256, r = mulberry32(kind.length * 31 + 5);
    const { c, g } = canvas(S);
    g.clearRect(0, 0, S, S);
    const drawLeaf = (x, y, len, wid, a, v) => {
      g.save(); g.translate(x, y); g.rotate(a);
      const grd = g.createLinearGradient(0, -wid, 0, wid);
      grd.addColorStop(0, `rgb(${v + 30},${v + 30},${v + 30})`); grd.addColorStop(1, `rgb(${v - 30},${v - 30},${v - 30})`);
      g.fillStyle = grd;
      g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(len * 0.45, -wid, len, 0); g.quadraticCurveTo(len * 0.45, wid, 0, 0); g.fill();
      g.strokeStyle = `rgba(${v - 60},${v - 60},${v - 60},0.45)`; g.lineWidth = 1.2; g.stroke();
      g.strokeStyle = `rgba(255,255,255,0.25)`; g.beginPath(); g.moveTo(len * 0.1, 0); g.lineTo(len * 0.8, 0); g.stroke();
      g.restore();
    };
    const drawBlossom = (x, y, rad, v) => {
      for (let p = 0; p < 5; p++) {
        const a = p / 5 * TAU + r();
        g.save(); g.translate(x, y); g.rotate(a);
        g.fillStyle = `rgb(${v},${v},${v})`;
        g.beginPath(); g.ellipse(rad * 0.55, 0, rad * 0.55, rad * 0.36, 0, 0, TAU); g.fill();
        g.restore();
      }
      g.fillStyle = `rgb(${v - 70},${v - 70},${v - 70})`; g.beginPath(); g.arc(x, y, rad * 0.18, 0, TAU); g.fill();
    };
    const cx = S / 2, cy = S / 2;
    // painted clump: overlapping round lobes with scalloped leafy rims, lit from top-left
    const clump = (lobes, leafFn, base = 150) => {
      const L = [];
      for (let i = 0; i < lobes; i++) { const a = r() * TAU, d = Math.pow(r(), 0.8) * S * 0.2; L.push([cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.9, S * (0.12 + r() * 0.1)]); }
      // rim leaves
      for (const [x, y, rad] of L) for (let k = 0; k < 22; k++) {
        const a = k / 22 * TAU + r() * 0.2; leafFn(x + Math.cos(a) * rad, y + Math.sin(a) * rad, a, base - 20 + Math.floor(r() * 50));
      }
      // body with light gradient
      for (const [x, y, rad] of L) {
        const grd = g.createRadialGradient(x - rad * 0.35, y - rad * 0.4, rad * 0.1, x, y, rad * 1.05);
        grd.addColorStop(0, `rgb(${base + 95},${base + 95},${base + 95})`); grd.addColorStop(0.6, `rgb(${base + 40},${base + 40},${base + 40})`); grd.addColorStop(1, `rgb(${base - 10},${base - 10},${base - 10})`);
        g.fillStyle = grd; g.beginPath(); g.arc(x, y, rad, 0, TAU); g.fill();
      }
      // inner leaf strokes
      for (let k = 0; k < 60; k++) { const [x, y, rad] = L[Math.floor(r() * L.length)]; const a = r() * TAU, d = r() * rad * 0.85; leafFn(x + Math.cos(a) * d, y + Math.sin(a) * d, r() * TAU, base + Math.floor(r() * 90), 0.8); }
    };
    if (kind === 'blossom') {
      for (let i = 0; i < 70; i++) {
        const a = r() * TAU, d = Math.pow(r(), 0.7) * S * 0.42;
        drawBlossom(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 9 + r() * 9, 215 + Math.floor(r() * 40));
      }
    } else if (kind === 'needle') {
      g.lineCap = 'round';
      for (let i = 0; i < 300; i++) {
        const a = r() * TAU, d = Math.pow(r(), 0.6) * S * 0.42;
        const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d, v = 200 + Math.floor(r() * 40), ang = a + (r() - 0.5);
        g.strokeStyle = `rgb(${v},${v},${v})`; g.lineWidth = 4;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(ang) * 18, y + Math.sin(ang) * 18); g.stroke();
      }
    } else if (kind === 'maple') {
      for (let i = 0; i < 60; i++) {
        const a = r() * TAU, d = Math.pow(r(), 0.8) * S * 0.36;
        const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d, v = 205 + Math.floor(r() * 35), rot = r() * TAU, sz = 15 + r() * 8;
        for (let k = 0; k < 5; k++) drawLeaf(x, y, sz * (k === 2 ? 1.1 : 0.8), sz * 0.3, rot + (k - 2) * 0.62, v);
      }
    } else if (kind === 'bamboo') {
      for (let i = 0; i < 40; i++) {
        const a = r() * TAU, d = Math.pow(r(), 0.6) * S * 0.4;
        drawLeaf(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 50 + r() * 30, 7 + r() * 3, r() * TAU, 140 + Math.floor(r() * 110));
      }
    } else if (kind === 'wisteria') {
      for (let k = 0; k < 7; k++) {
        const x0 = 30 + k * 32 + r() * 10;
        for (let j = 0; j < 14; j++) {
          const y = 20 + j * 14 + r() * 4, rad = 12 - j * 0.6;
          drawBlossom(x0 + Math.sin(j * 0.8) * 4, y, Math.max(4, rad), 150 + Math.floor(r() * 100));
        }
      }
    } else {
      for (let i = 0; i < 110; i++) {
        const a = r() * TAU, d = Math.pow(r(), 0.9) * S * 0.36;
        const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
        drawLeaf(x, y, 28 + r() * 16, 10 + r() * 5, a + (r() - 0.5) * 1.2, 205 + Math.floor(r() * 30));
      }
    }
    return tex(c);
  });
}

export function petalTexture() {
  return memo('petal', () => {
    const { c, g } = canvas(64);
    const grd = g.createLinearGradient(0, 8, 0, 56);
    grd.addColorStop(0, '#fff4f8'); grd.addColorStop(1, '#ff9ec0');
    g.fillStyle = grd;
    g.beginPath(); g.moveTo(32, 58);
    g.bezierCurveTo(6, 44, 8, 14, 24, 8); g.lineTo(32, 16); g.lineTo(40, 8);
    g.bezierCurveTo(56, 14, 58, 44, 32, 58); g.fill();
    return tex(c, { srgb: true });
  });
}

export function leafParticleTexture() {
  return memo('leafp', () => {
    const { c, g } = canvas(64);
    g.fillStyle = '#ffffff';
    g.beginPath(); g.moveTo(8, 32); g.quadraticCurveTo(32, 4, 58, 32); g.quadraticCurveTo(32, 60, 8, 32); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 2; g.beginPath(); g.moveTo(10, 32); g.lineTo(56, 32); g.stroke();
    return tex(c, { srgb: true });
  });
}

export function glowTexture() {
  return memo('glow', () => {
    const { c, g } = canvas(128);
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.2, 'rgba(255,255,255,0.75)');
    grd.addColorStop(0.5, 'rgba(255,255,255,0.22)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
    return tex(c);
  });
}

export function softDotTexture() {
  return memo('dot', () => {
    const { c, g } = canvas(64);
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.55, 'rgba(255,255,255,0.9)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    return tex(c);
  });
}

export function sparkleTexture() {
  return memo('sparkle', () => {
    const { c, g } = canvas(128);
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 30);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#fff';
    for (const [w, h] of [[5, 62], [62, 5]]) {
      g.beginPath(); g.moveTo(64 - w, 64); g.quadraticCurveTo(64, 64, 64, 64 - h); g.quadraticCurveTo(64, 64, 64 + w, 64);
      g.quadraticCurveTo(64, 64, 64, 64 + h); g.quadraticCurveTo(64, 64, 64 - w, 64); g.fill();
    }
    return tex(c);
  });
}

export function ringTexture() {
  return memo('ring', () => {
    const { c, g } = canvas(256);
    const grd = g.createRadialGradient(128, 128, 60, 128, 128, 128);
    grd.addColorStop(0, 'rgba(255,255,255,0)'); grd.addColorStop(0.75, 'rgba(255,255,255,0.25)');
    grd.addColorStop(0.9, 'rgba(255,255,255,1)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
    return tex(c);
  });
}

export function smokeTexture() {
  return memo('smoke', () => {
    const S = 128, r = mulberry32(99); const { c, g } = canvas(S);
    for (let i = 0; i < 18; i++) {
      const x = 64 + (r() - 0.5) * 50, y = 64 + (r() - 0.5) * 50, rad = 18 + r() * 26;
      const grd = g.createRadialGradient(x, y, 0, x, y, rad);
      grd.addColorStop(0, 'rgba(255,255,255,0.35)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd; g.fillRect(0, 0, S, S);
    }
    return tex(c);
  });
}

// Crescent slash arc: u along the arc, v across. Bright leading edge.
export function slashTexture() {
  return memo('slash', () => {
    const W = 256, H = 64; const { c, g } = canvas(W, H);
    const img = g.createImageData(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const u = x / (W - 1), v = y / (H - 1);
      const along = Math.pow(u, 1.6) * Math.min(1, (1 - u) * 8);
      const across = Math.exp(-Math.pow((v - 0.3) / (0.12 + 0.3 * (1 - u) * 0.5), 2));
      const edge = Math.exp(-Math.pow((v - 0.18) / 0.05, 2)) * 0.8;
      const a = Math.min(1, along * (across + edge));
      const i = (y * W + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = Math.round(a * 255);
    }
    g.putImageData(img, 0, 0);
    return tex(c);
  });
}

// Painterly cloud puff for the sky
export function cloudTexture() {
  return memo('cloud', () => {
    const W = 512, H = 256, r = mulberry32(12); const { c, g } = canvas(W, H);
    const puffs = [];
    for (let i = 0; i < 16; i++) {
      const t = i / 15;
      puffs.push([80 + t * 350 + (r() - 0.5) * 30, 160 - Math.sin(t * Math.PI) * 60 - r() * 30, 40 + Math.sin(t * Math.PI) * 50 + r() * 20]);
    }
    // shadowed underside then lit top
    for (const [x, y, rad] of puffs) {
      const grd = g.createRadialGradient(x, y + rad * 0.3, rad * 0.2, x, y, rad);
      grd.addColorStop(0, 'rgba(200,205,235,1)'); grd.addColorStop(0.85, 'rgba(215,215,240,0.95)'); grd.addColorStop(1, 'rgba(215,215,240,0)');
      g.fillStyle = grd; g.beginPath(); g.arc(x, y, rad, 0, TAU); g.fill();
    }
    for (const [x, y, rad] of puffs) {
      const grd = g.createRadialGradient(x - rad * 0.2, y - rad * 0.35, 0, x, y - rad * 0.1, rad * 0.9);
      grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.7, 'rgba(255,255,255,0.6)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd; g.beginPath(); g.arc(x, y - rad * 0.1, rad * 0.9, 0, TAU); g.fill();
    }
    return tex(c, { srgb: true });
  });
}

// Light shaft gradient (vertical fade, soft sides)
export function shaftTexture() {
  return memo('shaft', () => {
    const W = 64, H = 256; const { c, g } = canvas(W, H);
    const img = g.createImageData(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const u = x / (W - 1), v = y / (H - 1);
      const side = Math.pow(Math.sin(u * Math.PI), 2.2);
      const fade = Math.pow(1 - v, 1.3) * Math.min(1, v * 6);
      const a = side * fade;
      const i = (y * W + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = Math.round(a * 255);
    }
    g.putImageData(img, 0, 0);
    return tex(c);
  });
}

// Fuzzy tennis-ball texture with the white seam
export function tennisBallTexture() {
  return memo('tennis', () => {
    const W = 256, H = 128, r = mulberry32(3); const { c, g } = canvas(W, H);
    g.fillStyle = '#e8322c'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 1800; i++) { const v = r(); g.fillStyle = v > 0.5 ? 'rgba(255,120,110,0.25)' : 'rgba(150,20,20,0.25)'; g.fillRect(r() * W, r() * H, 2, 2); }
    g.strokeStyle = '#fff6ee'; g.lineWidth = 6;
    g.beginPath();
    for (let x = 0; x <= W; x += 2) { const y = H / 2 + Math.sin((x / W) * TAU * 2) * H * 0.28; x === 0 ? g.moveTo(x, y) : g.lineTo(x, y); }
    g.stroke();
    return tex(c, { srgb: true });
  });
}

export { canvas as makeCanvas, tex as canvasTex };
