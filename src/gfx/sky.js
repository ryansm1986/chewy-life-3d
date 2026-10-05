// Day / night cycle. Drives sun (moon at night), hemisphere fill, fog, rim light and colour grading.
import * as THREE from 'three';
import { U } from './materials.js';
import { clamp, lerp, smoothstep } from '../core/util.js';

const K = [
  { h: 0, sun: '#8ea8ff', si: 0.85, sky: '#46558f', gnd: '#282442', hi: 0.88, fog: '#2a3060', zen: '#10183a', hor: '#2c3a70', rim: '#9fb8ff', lift: [0.0, 0.02, 0.08], gain: [0.92, 0.97, 1.1], sat: 1.0, night: 1 },
  { h: 4.8, sun: '#a0a8ff', si: 0.8, sky: '#555594', gnd: '#36304c', hi: 0.9, fog: '#4a4a80', zen: '#1c2450', hor: '#4a4a88', rim: '#b0b8ff', lift: [0.02, 0.01, 0.08], gain: [0.95, 0.97, 1.08], sat: 1.0, night: 0.85 },
  // dawn: cool blue fill, warm peach sun only in the direct light
  { h: 6.2, sun: '#ffc8a0', si: 2.3, sky: '#a8c0f0', gnd: '#a8b098', hi: 1.2, fog: '#e0d8f0', zen: '#8aa8e8', hor: '#ffd8c0', rim: '#ffd0a8', lift: [0.015, 0.01, 0.05], gain: [1.03, 1.0, 0.97], sat: 1.1, night: 0.1 },
  { h: 8.5, sun: '#fff0d8', si: 2.9, sky: '#bcdcff', gnd: '#b4c28c', hi: 1.25, fog: '#cfe6ff', zen: '#7cc0ff', hor: '#d8f0ff', rim: '#fff0c8', lift: [0.02, 0.0, 0.05], gain: [1.03, 1.0, 0.96], sat: 1.12, night: 0 },
  { h: 13, sun: '#fff8ee', si: 3.1, sky: '#c4e2ff', gnd: '#b8c890', hi: 1.3, fog: '#d4ecff', zen: '#6cbcff', hor: '#e0f4ff', rim: '#fff4dc', lift: [0.02, 0.0, 0.045], gain: [1.02, 1.0, 0.97], sat: 1.12, night: 0 },
  { h: 16.3, sun: '#ffe2b8', si: 3.0, sky: '#bcd4ff', gnd: '#b8c090', hi: 1.22, fog: '#e8ecf8', zen: '#88b8f0', hor: '#ffe8d0', rim: '#ffdca8', lift: [0.02, 0.0, 0.05], gain: [1.04, 1.0, 0.95], sat: 1.14, night: 0 },
  // golden hour: gold key light + cool lavender sky fill (not a global orange filter)
  { h: 18.2, sun: '#ffc070', si: 2.7, sky: '#a8b4e8', gnd: '#a8a488', hi: 1.15, fog: '#f0d8d0', zen: '#8a90d8', hor: '#ffc8a0', rim: '#ffc078', lift: [0.01, 0.005, 0.06], gain: [1.05, 1.0, 0.95], sat: 1.12, night: 0.05 },
  { h: 19.6, sun: '#e0a0c8', si: 1.3, sky: '#7a80c8', gnd: '#584860', hi: 1.12, fog: '#7a78b8', zen: '#3a3a88', hor: '#d098b8', rim: '#e8b0ff', lift: [0.02, 0.01, 0.08], gain: [0.98, 0.97, 1.05], sat: 1.05, night: 0.65 },
  { h: 21, sun: '#8ea8ff', si: 0.85, sky: '#46558f', gnd: '#282442', hi: 0.88, fog: '#2a3060', zen: '#10183a', hor: '#2c3a70', rim: '#9fb8ff', lift: [0.0, 0.02, 0.08], gain: [0.92, 0.97, 1.1], sat: 1.0, night: 1 },
  { h: 24, sun: '#8ea8ff', si: 0.85, sky: '#46558f', gnd: '#282442', hi: 0.88, fog: '#2a3060', zen: '#10183a', hor: '#2c3a70', rim: '#9fb8ff', lift: [0.0, 0.02, 0.08], gain: [0.92, 0.97, 1.1], sat: 1.0, night: 1 },
];
const col = {};
function C(hex) { return col[hex] || (col[hex] = new THREE.Color(hex)); }

export class DayNight {
  constructor(world, post) {
    this.world = world; this.post = post;
    this.hour = 8.5;
    this.speed = 24 / (14 * 60); // a full day every 14 minutes
    this.paused = false;
    this.out = {
      sun: new THREE.Color(), sky: new THREE.Color(), gnd: new THREE.Color(), fog: new THREE.Color(),
      zen: new THREE.Color(), hor: new THREE.Color(), rim: new THREE.Color(), lift: new THREE.Vector3(), gain: new THREE.Vector3(),
      si: 1, hi: 1, sat: 1, night: 0,
    };
    this.sunDir = new THREE.Vector3(0.5, 0.8, 0.3).normalize();
    this.day = 1;
    this.exposure = 0.78;
  }
  get night() { return this.out.night; }
  isNight() { return this.hour >= 19.2 || this.hour < 5.5; }
  sample(h) {
    let i = 0; while (i < K.length - 1 && K[i + 1].h <= h) i++;
    const a = K[i], b = K[Math.min(i + 1, K.length - 1)];
    const t = b.h > a.h ? smoothstep(0, 1, (h - a.h) / (b.h - a.h)) : 0;
    const o = this.out;
    o.sun.copy(C(a.sun)).lerp(C(b.sun), t); o.sky.copy(C(a.sky)).lerp(C(b.sky), t); o.gnd.copy(C(a.gnd)).lerp(C(b.gnd), t);
    o.fog.copy(C(a.fog)).lerp(C(b.fog), t); o.zen.copy(C(a.zen)).lerp(C(b.zen), t); o.hor.copy(C(a.hor)).lerp(C(b.hor), t);
    o.rim.copy(C(a.rim)).lerp(C(b.rim), t);
    o.lift.set(lerp(a.lift[0], b.lift[0], t), lerp(a.lift[1], b.lift[1], t), lerp(a.lift[2], b.lift[2], t));
    o.gain.set(lerp(a.gain[0], b.gain[0], t), lerp(a.gain[1], b.gain[1], t), lerp(a.gain[2], b.gain[2], t));
    o.si = lerp(a.si, b.si, t); o.hi = lerp(a.hi, b.hi, t); o.sat = lerp(a.sat, b.sat, t); o.night = lerp(a.night, b.night, t);
    return o;
  }
  update(dt) {
    this.tick(dt);
    this.apply();
  }
  // time passes (and the 6:00 new day) without lighting the outdoors: an interior lights itself (home/housing.js)
  tick(dt) {
    if (this.paused) return;
    this.hour += dt * this.speed;
    if (this.hour >= 24) { this.hour -= 24; }
    if (this._lastHour !== undefined && this._lastHour < 6 && this.hour >= 6) { this.day++; this.world.onNewDay?.(this.day); }
    this._lastHour = this.hour;
  }
  apply() {
    const o = this.sample(this.hour);
    const w = this.world;
    // sun path: daytime arc; at night a moon arc with the same light
    const h = this.hour;
    let el, az;
    if (h >= 5.5 && h <= 19.5) { const t = (h - 5.5) / 14; el = 0.3 + Math.sin(t * Math.PI) * 0.62; az = -1.1 + t * 2.4; }
    else { const t = ((h + 24 - 19.5) % 24) / 10; el = 0.45 + Math.sin(clamp(t) * Math.PI) * 0.45; az = 1.2 - t * 2.0; }
    this.sunDir.set(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)).normalize();
    if (w.sun) { w.sun.color.copy(o.sun); w.sun.intensity = o.si * this.exposure; }
    if (w.hemi) { w.hemi.color.copy(o.sky); w.hemi.groundColor.copy(o.gnd); w.hemi.intensity = o.hi * this.exposure * 1.0; }
    if (w.scene.fog) w.scene.fog.color.copy(o.fog);
    if (w.scene.background?.isColor) w.scene.background.copy(o.fog);
    U.uRimColor.value.copy(o.rim);
    U.uNight.value = o.night;
    if (this.post) {
      const g = this.post.grade;
      g.uniforms.get('uLift').value.copy(o.lift);
      g.uniforms.get('uGain').value.copy(o.gain);
      g.uniforms.get('uSat').value = o.sat;
      this.post.bloom.intensity = 0.8 + o.night * 0.9;
      this.post.bloom.luminanceMaterial.threshold = 0.8 - o.night * 0.35;
    }
    w.onSky?.(o, this);
  }
}
