// Day / night cycle. Drives sun (moon at night), hemisphere fill, fog, rim light and colour grading.
import * as THREE from 'three';
import { U } from './materials.js';
import { clamp, lerp, smoothstep } from '../core/util.js';

const K = [
  { h: 0, sun: '#8ea8ff', si: 1.0, sky: '#4a5a9a', gnd: '#2c2848', hi: 1.15, fog: '#2a3060', zen: '#10183a', hor: '#2c3a70', rim: '#9fb8ff', lift: [0.0, 0.02, 0.08], gain: [0.92, 0.97, 1.1], sat: 1.0, night: 1 },
  { h: 4.8, sun: '#a0a8ff', si: 0.9, sky: '#5a5a9a', gnd: '#3a3050', hi: 1.1, fog: '#4a4a80', zen: '#1c2450', hor: '#4a4a88', rim: '#b0b8ff', lift: [0.02, 0.01, 0.08], gain: [0.95, 0.97, 1.08], sat: 1.0, night: 0.85 },
  { h: 6.2, sun: '#ffb89a', si: 2.0, sky: '#b0b8f0', gnd: '#c09898', hi: 1.15, fog: '#f4c8c8', zen: '#8aa8e8', hor: '#ffc8b0', rim: '#ffc8a0', lift: [0.04, 0.0, 0.05], gain: [1.06, 0.98, 0.94], sat: 1.12, night: 0.15 },
  { h: 8.5, sun: '#fff0d8', si: 2.9, sky: '#bcdcff', gnd: '#b4c28c', hi: 1.25, fog: '#cfe6ff', zen: '#7cc0ff', hor: '#d8f0ff', rim: '#fff0c8', lift: [0.02, 0.0, 0.05], gain: [1.03, 1.0, 0.96], sat: 1.12, night: 0 },
  { h: 13, sun: '#fff8ee', si: 3.1, sky: '#c4e2ff', gnd: '#b8c890', hi: 1.3, fog: '#d4ecff', zen: '#6cbcff', hor: '#e0f4ff', rim: '#fff4dc', lift: [0.02, 0.0, 0.045], gain: [1.02, 1.0, 0.97], sat: 1.12, night: 0 },
  { h: 16.5, sun: '#ffdcaa', si: 2.9, sky: '#c0d4ff', gnd: '#c8b888', hi: 1.2, fog: '#ffe4c8', zen: '#88b8f0', hor: '#ffe8d0', rim: '#ffd8a0', lift: [0.03, 0.0, 0.05], gain: [1.06, 1.0, 0.92], sat: 1.14, night: 0 },
  { h: 18.4, sun: '#ffb070', si: 2.2, sky: '#b8b4e0', gnd: '#b89080', hi: 1.1, fog: '#ffc8a8', zen: '#8878d0', hor: '#ffb890', rim: '#ffb070', lift: [0.04, 0.01, 0.05], gain: [1.08, 0.99, 0.9], sat: 1.08, night: 0.12 },
  { h: 19.6, sun: '#d898c8', si: 1.1, sky: '#7a78c0', gnd: '#584050', hi: 1.1, fog: '#7a70b0', zen: '#3a3480', hor: '#c888b8', rim: '#e0a8ff', lift: [0.03, 0.01, 0.08], gain: [0.98, 0.96, 1.06], sat: 1.05, night: 0.7 },
  { h: 21, sun: '#8ea8ff', si: 1.0, sky: '#4a5a9a', gnd: '#2c2848', hi: 1.15, fog: '#2a3060', zen: '#10183a', hor: '#2c3a70', rim: '#9fb8ff', lift: [0.0, 0.02, 0.08], gain: [0.92, 0.97, 1.1], sat: 1.0, night: 1 },
  { h: 24, sun: '#8ea8ff', si: 1.0, sky: '#4a5a9a', gnd: '#2c2848', hi: 1.15, fog: '#2a3060', zen: '#10183a', hor: '#2c3a70', rim: '#9fb8ff', lift: [0.0, 0.02, 0.08], gain: [0.92, 0.97, 1.1], sat: 1.0, night: 1 },
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
    if (!this.paused) {
      this.hour += dt * this.speed;
      if (this.hour >= 24) { this.hour -= 24; }
      if (this._lastHour !== undefined && this._lastHour < 6 && this.hour >= 6) { this.day++; this.world.onNewDay?.(this.day); }
      this._lastHour = this.hour;
    }
    this.apply();
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
