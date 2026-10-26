// The title screen's painting (ROADMAP TA-1): the storybook art of Chewy and Shadow on the hill over Blossom Hollow,
// brought to life in one small WebGL pass. The painting (public/title/painting.jpg) and its mask (public/title/mask.png,
// built from the painting by tools/title/build-mask.py) are drawn to cover the screen, with:
//   - the sea and the river shimmering (mask R), the sun's glitter on the water (on the sun's path: SUN);
//   - the cherry blossoms and the near grass swaying in gusts of wind (mask G);
//   - the sky's clouds breathing and the mist drifting (mask B);
//   - Chewy and Shadow blinking (painted lids at their eyes: EYES, in painting pixels), now and then twice;
//   - a slow push in and out over half a minute.
// The title's own CSS petals fall over it. With "reduce motion" it's still (the blinks stay). If WebGL fails it's the
// still painting as a CSS background. While it covers the screen, game.js skips drawing the 3D world (`covers`).
//   const art = new TitleArt(parent); art.start(); art.stop(); art.covers
import { clamp } from '../core/util.js';

const BASE = (import.meta.env?.BASE_URL || '/') + 'title/';
const IMG = { w: 1536, h: 1024 };
const FOCUS = [0.42, 0.6]; // (where the cover crop keeps its centre: the friends low left, the village right)
const SUN = 0.93; // (the sun's x in the painting, 0..1: its glitter road on the sea)
// the eyes, in painting pixels: the centre, the half-size (x, y), the lid's colour (the fur around it) and its tilt
export const EYES = {
  chewy: { c: [302, 623.5], r: [16, 19.5], lid: [0.557, 0.32, 0.183], tilt: 0.12 }, // (measured on the painting: the outline x 288-316, y 606-641)
  shadow: { c: [446, 716], r: [12.5, 16.5], lid: [0.342, 0.288, 0.313], tilt: 0.1 }, // (x 435-457, y 701-731)
};

const VS = `attribute vec2 p; varying vec2 v; void main() { v = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;
const FS = `precision highp float;
varying vec2 v;
uniform sampler2D art, mask;
uniform vec2 res, img, focus;
uniform float t, zoom, motion, sunX;
uniform vec4 eyeA, eyeB; uniform vec3 lidA, lidB; uniform vec2 shut, tilt;
float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
// a painted lid over one eye: the fur colour from the top down to the closing line, with a soft dark lash on its edge
vec3 lid(vec3 c, vec2 px, vec4 e, vec3 fur, float k, float tl) {
  if (k <= 0.001) return c;
  vec2 d = (px - e.xy) / e.zw; d.y += d.x * tl;
  float r = length(d); if (r > 1.15) return c;
  float edge = -1.0 + 2.0 * k;                    // the lid's lower edge: from the top of the eye (open) to its bottom (shut)
  float inE = smoothstep(1.08, 0.92, r);          // (inside the eye's ellipse, a little feathered)
  float cover = inE * smoothstep(edge + 0.12, edge - 0.08, d.y);
  vec3 f = fur * (0.92 + 0.12 * (1.0 - d.y) * 0.5);
  c = mix(c, f, cover);
  float lash = smoothstep(1.22, 0.98, r) * smoothstep(0.9, 0.6, abs(d.x)) * smoothstep(0.17, 0.0, abs(d.y - edge)) * smoothstep(0.0, 0.25, k); // (the lid's edge, and the closed eye's line)
  return mix(c, fur * 0.35, lash * 0.85);
}
void main() {
  // cover the screen, centred on focus, with the slow push
  float sr = res.x / res.y, ir = img.x / img.y;
  vec2 s = sr > ir ? vec2(1.0, ir / sr) : vec2(sr / ir, 1.0);
  s /= zoom;
  vec2 cen = clamp(focus, s * 0.5, 1.0 - s * 0.5); // (the crop stays inside the painting)
  vec2 uv = cen + (vec2(v.x, 1.0 - v.y) - 0.5) * s;
  vec3 m = texture2D(mask, uv).rgb; // (R water, G what the wind moves, B the sky; no alpha: a decoder may premultiply it)
  float T = t * motion;
  // wind: slow gusts rolling left to right
  float gust = 0.55 + 0.45 * sin(T * 0.7 - uv.x * 3.0) * sin(T * 0.23 + 1.3);
  vec2 w = vec2(sin(T * 1.9 + uv.y * 22.0 + uv.x * 9.0), sin(T * 1.4 + uv.x * 17.0) * 0.5) * gust;
  uv += w * m.g * vec2(0.0016, 0.0011);
  // the sky: clouds breathing sideways
  uv.x += m.b * (sin(T * 0.09 + uv.y * 7.0) * 0.0035 + sin(T * 0.05) * 0.002);
  // water: horizontal ripples
  float rip = sin(uv.y * 620.0 - T * 2.3 + sin(uv.x * 40.0 + T * 0.8) * 1.6) * 0.5 + sin(uv.y * 1300.0 + T * 3.1 + uv.x * 70.0) * 0.5;
  uv.x += rip * m.r * 0.0011;
  uv.y += sin(uv.x * 300.0 + T * 1.7) * m.r * 0.0004;
  vec3 c = texture2D(art, uv).rgb;
  // the sun's glitter on the sea, and a soft shimmer on all the water
  vec2 gp = uv * vec2(260.0, 1100.0) + vec2(T * 0.35, T * 1.5);
  float g = pow(n(gp), 14.0) * 3.2 + pow(n(gp * 1.7 + 4.0), 18.0) * 2.4;
  float path = smoothstep(0.2, 0.0, abs(uv.x - sunX) - (uv.y - 0.38) * 0.35); // (the sun's road on the sea, widening toward us)
  c += vec3(1.0, 0.93, 0.78) * g * m.r * (path * 1.0 + 0.18) * motion;
  c += vec3(0.05, 0.06, 0.07) * m.r * (0.5 + 0.5 * sin(T * 0.9 + uv.x * 25.0 - uv.y * 60.0)) * motion;
  // the mist: a slow lighter band drifting through (on the sky mask's soft lower edge)
  c += vec3(0.035) * m.b * n(uv * vec2(6.0, 14.0) + vec2(T * 0.04, 0.0)) * motion;
  // the blinks (painting pixels)
  vec2 px = uv * img;
  c = lid(c, px, eyeA, lidA, shut.x, tilt.x);
  c = lid(c, px, eyeB, lidB, shut.y, tilt.y);
  gl_FragColor = vec4(c, 1.0);
}`;

export class TitleArt {
  constructor(parent) {
    this.parent = parent; this.on = false; this.ready = false; this.covers = false; this.t = 0;
    this.blink = { chewy: this.next(1.6), shadow: this.next(2.4) }; this.shut = { chewy: 0, shadow: 0 };
    const c = this.canvas = document.createElement('canvas');
    c.className = 'ti-art';
    parent.insertBefore(c, parent.firstChild);
    this.reduce = matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    this.load();
  }
  next(base = 0) { return base + 2.4 + Math.random() * 3.6; }
  async load() {
    const im = (src) => new Promise((res, rej) => { const i = new Image(); i.decoding = 'async'; i.onload = () => res(i); i.onerror = rej; i.src = src; });
    try {
      const [art, mask] = await Promise.all([im(BASE + 'painting.jpg'), im(BASE + 'mask.png')]);
      this.art = art; this.mask = mask;
      if (!this.initGL()) throw new Error('no webgl');
      this.ready = true; this.canvas.classList.add('ready');
      if (this.on) this.loop();
    } catch (e) { // (the still painting, behind everything)
      this.canvas.remove(); this.parent.style.background = `url(${BASE}painting.jpg) ${FOCUS[0] * 100}% ${FOCUS[1] * 100}% / cover`;
      this.ready = true; this.static = true;
    }
    this.covers = this.on && this.ready;
  }
  initGL() {
    const gl = this.gl = this.canvas.getContext('webgl', { antialias: false, alpha: false, premultipliedAlpha: false, powerPreference: 'low-power' });
    if (!gl) return false;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const p = this.prog = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    gl.useProgram(p);
    const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(p, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE); // (the mask's numbers as they are)
    const tex = (im, unit) => { const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return t; };
    tex(this.art, 0); tex(this.mask, 1);
    this.u = {}; for (const k of ['art', 'mask', 'res', 'img', 'focus', 't', 'zoom', 'motion', 'sunX', 'eyeA', 'eyeB', 'lidA', 'lidB', 'shut', 'tilt']) this.u[k] = gl.getUniformLocation(p, k);
    gl.uniform1i(this.u.art, 0); gl.uniform1i(this.u.mask, 1);
    gl.uniform2f(this.u.img, IMG.w, IMG.h); gl.uniform1f(this.u.sunX, SUN); gl.uniform2f(this.u.focus, FOCUS[0], FOCUS[1]);
    const E = EYES.chewy, F = EYES.shadow;
    gl.uniform4f(this.u.eyeA, E.c[0], E.c[1], E.r[0], E.r[1]); gl.uniform4f(this.u.eyeB, F.c[0], F.c[1], F.r[0], F.r[1]);
    gl.uniform3fv(this.u.lidA, E.lid); gl.uniform3fv(this.u.lidB, F.lid); gl.uniform2f(this.u.tilt, E.tilt, F.tilt);
    this.canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); this.lost = true; });
    return true;
  }
  start() { this.on = true; this.covers = this.ready; this.canvas.style.display = ''; if (this.ready && !this.static) this.loop(); }
  stop() { this.on = false; this.covers = false; cancelAnimationFrame(this.raf); this.raf = 0; }
  /** a blink: shut in 70 ms, held 50 ms, open in 120 ms (sometimes twice) */
  blinkTick(id, dt) {
    const B = this.blink;
    B[id] -= dt;
    const b = this._b ||= {};
    if (B[id] <= 0 && !b[id]) { b[id] = { t: 0, twice: Math.random() < 0.22 }; }
    const s = b[id]; if (!s) { this.shut[id] = 0; return; }
    s.t += dt;
    const u = s.t, close = 0.07, hold = 0.05, open = 0.12;
    this.shut[id] = u < 0 ? 0 : u < close ? u / close : u < close + hold ? 1 : clamp(1 - (u - close - hold) / open);
    if (u >= close + hold + open) {
      if (s.twice) { s.twice = false; s.t = -0.08; this.shut[id] = 0; } else { b[id] = null; B[id] = this.next(); this.shut[id] = 0; }
    }
  }
  loop() {
    if (this.raf) return;
    let last = performance.now();
    const frame = now => {
      this.raf = 0;
      if (!this.on || this.lost) return;
      const dt = Math.max(0, Math.min(0.1, (now - last) / 1000)); last = now; this.t += dt; // (rAF's stamp can sit before the loop's start)
      this.draw(dt);
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }
  draw(dt) {
    const gl = this.gl, c = this.canvas, dpr = Math.min(devicePixelRatio || 1, 1.5);
    const w = Math.round(c.clientWidth * dpr), h = Math.round(c.clientHeight * dpr);
    if (!w || !h) return;
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; gl.viewport(0, 0, w, h); }
    this.blinkTick('chewy', dt); this.blinkTick('shadow', dt);
    if (this.holdShut != null) this.shut.chewy = this.shut.shadow = this.holdShut; // (the QA's shots: lids held)
    const motion = this.reduce ? 0 : 1, zoom = this.holdZoom ?? 1.015 + (this.reduce ? 0 : 0.025 * (0.5 - 0.5 * Math.cos(this.t * Math.PI * 2 / 36))); // (holdZoom: the QA's still frame)
    gl.uniform2f(this.u.res, w, h); gl.uniform1f(this.u.t, this.t); gl.uniform1f(this.u.zoom, zoom); gl.uniform1f(this.u.motion, motion);
    gl.uniform2f(this.u.shut, this.shut.chewy, this.shut.shadow);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
