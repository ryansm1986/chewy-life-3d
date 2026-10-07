// Render health probes (ROADMAP R-7: the black flashes). Debug / QA only: nothing here is built unless a flag asks.
//
// A NaN or Inf pixel in the HDR scene buffer turns black at the grade's clamp, and the bloom's mip blur and the AO
// composite spread it into black blocks for a frame or two. These probes turn that into a visible, countable signal:
//   ?nanprobe (=1)   count NaN / Inf texels at each stage and PAINT them bright magenta where they first appear (the
//                    AO composite), so they stop spreading and the source pixels show; the CPU scan lists every visible
//                    mesh / instance / bone whose world matrix is singular (a zero normal matrix: NaN normals)
//   ?nanprobe=spread count, but paint only after the tone map: the magenta then shows the area the NaN poisoned
//   ?rh              luminance-only flash stats on the true image (no shader changes: NaN stays black)
// Stages: 'scene' (the RenderPass output, the raw scene), 'ao' (the AO composite), 'tone' (after bloom + tone map,
// the grade's input; probes split the grade out of the main EffectPass for it) and 'out' (after the grade: per-block
// luminance for the flash detector). Each stage reduces its buffer to one texel per 16×16 block (NaN count, dark count,
// luminance sum) on the GPU; with RH.read on (QA), the blocks are read back every frame and the flash detector runs.
// window.__rh is the live record: frames, NaN totals per stage, flash frames (with an optional PNG of each), the scan.
import * as THREE from 'three';
import { Pass } from 'postprocessing';

const B = 16; // (block edge, texels)
const BAD = /* glsl */`
bool rhBad(vec3 c) { uvec3 e = floatBitsToUint(c) & uvec3(0x7f800000u); return any(equal(e, uvec3(0x7f800000u))); }
`; // (exponent all ones = NaN or Inf; a bit test, which the HLSL compiler can't fold away the way it may `x != x`)
const VS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const REDUCE_FS = /* glsl */`
precision highp float; precision highp int;
uniform sampler2D tIn; uniform ivec2 uSize;
${BAD}
void main() {
  ivec2 o = ivec2(gl_FragCoord.xy) * ${B};
  float bad = 0.0, dark = 0.0, lum = 0.0, n = 0.0;
  for (int y = 0; y < ${B}; y++) for (int x = 0; x < ${B}; x++) {
    ivec2 p = o + ivec2(x, y);
    if (p.x >= uSize.x || p.y >= uSize.y) continue;
    vec4 c = texelFetch(tIn, p, 0);
    n += 1.0;
    if (rhBad(c.rgb)) { bad += 1.0; continue; }
    vec3 s = pow(clamp(c.rgb, 0.0, 1.0), vec3(1.0 / 2.2));
    float l = dot(s, vec3(0.2126, 0.7152, 0.0722));
    lum += l; if (l < 0.035) dark += 1.0;
  }
  gl_FragColor = vec4(bad, dark, lum, n);
}`;
const PAINT_FS = /* glsl */`
precision highp float;
uniform sampler2D tIn;
${BAD}
void main() {
  vec4 c = texelFetch(tIn, ivec2(gl_FragCoord.xy), 0);
  gl_FragColor = rhBad(c.rgb) || rhBad(vec3(c.a)) ? vec4(6.0, 0.0, 6.0, 1.0) : c; // (HDR magenta: saturates after the tone map)
}`;

const Q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
const NP = Q.get('nanprobe');
export const PROBE = Q.has('nanprobe') ? (NP === 'spread' ? 'spread' : 'paint') : Q.has('rh') ? 'stats' : null;

/** the live record (window.__rh) */
export const RH = { mode: PROBE, read: false, frames: 0, stage: {}, flashes: [], frameLog: null, scan: null, shots: 0, maxShots: 6, cfg: { drop: 0.45, minPrev: 0.1, blackBlocks: 0.03 } };
if (typeof window !== 'undefined' && PROBE) window.__rh = RH;

class Quad {
  constructor(fs) {
    this.mat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: fs, uniforms: { tIn: { value: null }, uSize: { value: new THREE.Vector2() } }, depthTest: false, depthWrite: false });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat); this.mesh.frustumCulled = false;
    this.scene = new THREE.Scene(); this.scene.add(this.mesh); this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }
  draw(renderer, tex, target, w, h) { const u = this.mat.uniforms; u.tIn.value = tex; u.uSize.value.set(w, h); renderer.setRenderTarget(target); renderer.render(this.scene, this.cam); }
}
// (uSize is an ivec2 in the shader: three uploads a Vector2 with uniform2i for an ivec2, so the plain Vector2 is fine)

/** one stage's block reducer: counts NaN / Inf, dark texels and the luminance of each 16×16 block of a buffer */
class Reducer {
  constructor(name) { this.name = name; this.q = new Quad(REDUCE_FS); this.rt = null; this.buf = null; this.w = 0; this.h = 0; }
  run(renderer, tex, w, h) {
    const bw = Math.ceil(w / B), bh = Math.ceil(h / B);
    if (!this.rt || this.rt.width !== bw || this.rt.height !== bh) {
      this.rt?.dispose();
      this.rt = new THREE.WebGLRenderTarget(bw, bh, { type: THREE.FloatType, format: THREE.RGBAFormat, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false });
      this.buf = new Float32Array(bw * bh * 4);
    }
    this.w = bw; this.h = bh; this.fresh = true;
    this.q.draw(renderer, tex, this.rt, w, h);
  }
  readBack(renderer) {
    if (!this.fresh) return null; // (not run this frame)
    this.fresh = false;
    renderer.readRenderTargetPixels(this.rt, 0, 0, this.w, this.h, this.buf);
    let bad = 0, dark = 0, lum = 0, n = 0; const b = this.buf;
    for (let i = 0; i < b.length; i += 4) { bad += b[i]; dark += b[i + 1]; lum += b[i + 2]; n += b[i + 3]; }
    return { bad, dark, lum: n ? lum / n : 0, n };
  }
}

/** A composer pass: reduce one or two buffers of this stage; optionally paint its NaN / Inf texels magenta */
export class ProbePass extends Pass {
  constructor(health, stage, { paint = false } = {}) {
    super('RenderHealth:' + stage);
    this.health = health; this.stage = stage; this.paint = paint;
    this.needsSwap = paint;
    this.red = new Reducer(stage);
    this.painter = paint ? new Quad(PAINT_FS) : null;
  }
  render(renderer, inputBuffer, outputBuffer) {
    const w = inputBuffer.width, h = inputBuffer.height;
    this.red.run(renderer, inputBuffer.texture, w, h);
    if (this.painter) this.painter.draw(renderer, inputBuffer.texture, this.renderToScreen ? null : outputBuffer, w, h);
    this.health.ran.push(this);
  }
}

/** the per-frame bookkeeping (Post owns one when a probe flag is set) */
export class RenderHealth {
  constructor(post) {
    this.post = post; this.ran = []; this.prevBlocks = null; this.prevLum = null; this.lumHist = [];
    RH.health = this;
  }
  /** after composer.render(): read the stages back (RH.read), run the flash detector, the CPU scan */
  afterFrame(ctx = {}) {
    const ran = this.ran; this.ran = [];
    if (!RH.read) return;
    const r = this.post.renderer, f = { i: RH.frames++, t: performance.now() | 0, ...ctx };
    try { if (RH.skipFn?.()) f.skip = true; if (RH.tag) f.tag = RH.tag; } catch (e) { /* */ }
    for (const p of ran) {
      const s = p.red.readBack(r); if (!s) continue; f[p.stage] = p.stage === 'out' ? +s.lum.toFixed(4) : s.bad; if (p.stage !== 'out') acc(p.stage, s.bad);
      if (p.stage === 'out') this.flashCheck(p.red, s, f);
    }
    if (RH.scanOn) { const sc = scanScene(this.post.scene); f.sing = sc.n; if (sc.n) { RH.scan ||= { frames: 0, hits: {} }; RH.scan.frames++; for (const k of sc.names) RH.scan.hits[k] = (RH.scan.hits[k] || 0) + 1; } }
    if (RH.frameLog) { RH.frameLog.push(f); if (RH.frameLog.length > 20000) RH.frameLog.splice(0, 10000); }
    const bad = (f.scene || 0) + (f.ao || 0) + (f.tone || 0);
    if (bad && RH.onBad) RH.onBad(f);
  }
  // a flash: the frame's mean luminance falls by RH.cfg.drop of the last frames' or a share of blocks that were lit turns
  // black. A NaN frame counts too (in 'stats' mode NaN is black on screen and shows up here as well).
  flashCheck(red, s, f) {
    const b = red.buf, nb = red.w * red.h, cur = this._cur && this._cur.length === nb ? this._cur : (this._cur = new Float32Array(nb));
    for (let i = 0; i < nb; i++) { const n = b[i * 4 + 3]; cur[i] = n ? b[i * 4 + 2] / n : 0; }
    let black = 0, lit = 0; const prev = this.prevBlocks;
    if (prev && prev.length === nb) for (let i = 0; i < nb; i++) { if (prev[i] > RH.cfg.minPrev) { lit++; if (cur[i] < 0.035) black++; } }
    const H = this.lumHist, ref = H.length ? H.reduce((a, x) => a + x, 0) / H.length : s.lum;
    const share = lit ? black / lit : 0, drop = ref > 0.05 ? 1 - s.lum / ref : 0;
    f.black = +share.toFixed(4); f.drop = +drop.toFixed(3);
    const skip = f.skip; // (a transition / iris frame the caller marks: legit darkening)
    if (!skip && H.length >= 3 && (drop > RH.cfg.drop || share > RH.cfg.blackBlocks)) {
      const e = { ...f, why: drop > RH.cfg.drop ? 'lum-drop' : 'black-blocks' };
      if (RH.shots < RH.maxShots && RH.capture) { try { e.png = this.post.renderer.domElement.toDataURL('image/png'); RH.shots++; } catch (er) { /* */ } }
      RH.flashes.push(e); if (RH.flashes.length > 200) RH.flashes.shift();
    }
    if (!skip) { H.push(s.lum); if (H.length > 6) H.shift(); } else H.length = 0;
    this.prevBlocks = skip ? null : (this.prevBlocks && this.prevBlocks.length === nb ? this.prevBlocks : new Float32Array(nb));
    if (this.prevBlocks) this.prevBlocks.set(cur);
  }
}
function acc(stage, n) { const S = RH.stage[stage] ||= { frames: 0, bad: 0, badFrames: 0, max: 0 }; S.frames++; if (n > 0) { S.bad += n; S.badFrames++; S.max = Math.max(S.max, n); } }

// ------------------------------------------------------------------ the CPU scan: singular world matrices
const _m = new THREE.Matrix4(), _i = new THREE.Matrix4();
function det3(e) { return e[0] * (e[5] * e[10] - e[6] * e[9]) - e[4] * (e[1] * e[10] - e[2] * e[9]) + e[8] * (e[1] * e[6] - e[2] * e[5]); }
const SING = 1e-24;
const label = o => { const p = []; for (let x = o; x && p.length < 4; x = x.parent) if (x.name) p.push(x.name); return (o.isInstancedMesh ? 'inst:' : o.isSkinnedMesh ? 'skin:' : '') + (p.join('<') || o.type) + (o.geometry?.type ? '/' + o.geometry.type : ''); };
/** every visible mesh, instance and bone whose world 3×3 is singular (or non-finite): their normals come out NaN */
export function scanScene(scene) {
  const names = []; let n = 0;
  scene?.traverseVisible(o => {
    if (!o.isMesh || o.isSprite) return;
    const e = o.matrixWorld.elements, d = det3(e);
    if (!Number.isFinite(d) || Math.abs(d) < SING) { if (!o.isInstancedMesh) { n++; names.push(label(o)); return; } }
    if (o.isInstancedMesh) {
      const A = o.instanceMatrix?.array; if (!A) return; // (a batch that freed its CPU copy after upload)
      for (let k = 0; k < o.count; k++) {
        _i.fromArray(A, k * 16); _m.multiplyMatrices(o.matrixWorld, _i);
        const dd = det3(_m.elements);
        if (!Number.isFinite(dd) || Math.abs(dd) < SING) { n++; names.push(label(o) + '#' + (o.name || '')); break; }
      }
      const nm = o.geometry?.attributes?.iNM; // (the Horde's per-instance normal matrix)
      if (nm) for (let k = 0; k < o.count; k++) { let z = 0, fin = true; for (let j = 0; j < 9; j++) { const v = nm.array[k * 9 + j]; if (!Number.isFinite(v)) fin = false; if (v !== 0) z++; } if (!fin || !z) { n++; names.push(label(o) + ':iNM' + (fin ? '0' : 'NaN')); break; } }
    }
    if (o.isSkinnedMesh) for (const b of o.skeleton.bones) { const dd = det3(b.matrixWorld.elements); if (!Number.isFinite(dd) || Math.abs(dd) < SING) { n++; names.push(label(o) + ':bone ' + b.name); break; } }
  });
  return { n, names };
}
