// Ambient life for the overworld: drifting petals, butterflies, fireflies, koi, light shafts, chimney smoke.
import * as THREE from 'three';
import { rand, TAU, clamp, smoothstep, chance } from '../core/util.js';
import { U, makeToon } from './materials.js';
import { shaftTexture } from './textures.js';
import { paint, merge, xf } from './geom.js';

function butterflyMesh(color) {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  g.fillStyle = color; g.strokeStyle = 'rgba(60,30,50,0.8)'; g.lineWidth = 2;
  g.beginPath(); g.ellipse(22, 24, 18, 14, -0.5, 0, TAU); g.fill(); g.stroke();
  g.beginPath(); g.ellipse(24, 44, 12, 10, 0.4, 0, TAU); g.fill(); g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.7)'; g.beginPath(); g.arc(18, 20, 4, 0, TAU); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: t, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide });
  const grp = new THREE.Group();
  const wl = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), mat); wl.geometry.translate(-0.08, 0, 0);
  const wr = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), mat); wr.geometry.translate(-0.08, 0, 0); wr.scale.x = -1;
  const pl = new THREE.Group(); pl.add(wl); const pr = new THREE.Group(); pr.add(wr);
  grp.add(pl, pr);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.012, 0.07, 3, 6), new THREE.MeshBasicMaterial({ color: '#4a2c3a' })); body.rotation.x = Math.PI / 2; grp.add(body);
  grp.userData = { pl, pr };
  return grp;
}

function koiMesh(seed) {
  const white = '#fff8f0', orange = '#ff7a3a', red = '#e8442a';
  const body = new THREE.SphereGeometry(0.16, 12, 8); body.scale(0.55, 0.4, 1.4);
  paint(body, (p, n, o) => { o.set(white); if (Math.sin(p.z * 18 + seed) + Math.sin(p.x * 30) > 0.4) o.set(seed % 2 ? orange : red); });
  const tail = new THREE.ConeGeometry(0.08, 0.14, 6); tail.rotateX(-Math.PI / 2); tail.scale(1, 0.3, 1); tail.translate(0, 0, -0.27); paint(tail, (p, n, o) => o.set(orange));
  const g = merge([body, tail]);
  return new THREE.Mesh(g, makeToon({ vertexColors: true, rim: 0.4, brush: 0.05 }));
}

export class Ambient {
  constructor(G, world, vfx) {
    this.G = G; this.world = world; this.vfx = vfx;
    this.petalAcc = 0; this.leafAcc = 0; this.ffAcc = 0;
    this.butterflies = [];
    const cols = ['#ffb0d0', '#fff08a', '#a8d0ff', '#ffffff', '#ffc890', '#c8a8ff'];
    for (let i = 0; i < 14; i++) {
      const m = butterflyMesh(cols[i % cols.length]);
      world.scene.add(m);
      this.butterflies.push({ m, p: new THREE.Vector3(), target: new THREE.Vector3(), t: rand(0, 10), speed: rand(0.8, 1.4), flap: rand(14, 20) });
    }
    this.koi = [];
    const pond = world.landmarks?.pond;
    if (pond) for (let i = 0; i < 7; i++) {
      const m = koiMesh(i); m.castShadow = false; world.scene.add(m);
      this.koi.push({ m, a: rand(0, TAU), r: rand(1.2, 3.8), sp: rand(0.25, 0.5) * (i % 2 ? 1 : -1), y: rand(-0.35, -0.18), c: pond });
    }
    // light shafts (golden hour)
    this.shafts = [];
    const sm = new THREE.MeshBasicMaterial({ map: shaftTexture(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, color: '#ffe0a0', toneMapped: false, fog: false });
    for (let i = 0; i < 9; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 9), sm.clone()); m.geometry.translate(0, 4.5, 0);
      m.renderOrder = 11; world.scene.add(m);
      this.shafts.push({ m, off: new THREE.Vector3(rand(-16, 16), 0, rand(-12, 12)), w: rand(0.8, 2.2), ph: rand(0, TAU) });
    }
    this.smokeEmitters = []; // {pos, rate, acc, color}
  }
  addSmoke(pos, { rate = 2.5, color = '#f4f0ec', size = 0.5, steam = false } = {}) { const e = { pos: pos.clone(), rate, acc: rand(0, 1), color, size, steam }; this.smokeEmitters.push(e); return e; }
  update(dt, t) {
    const G = this.G, day = G.day, vfx = this.vfx;
    const focus = G.engine.rig.target;
    const night = day ? day.out.night : 0;
    const wind = U.uWindDir.value;
    // ---- sakura petals drifting across the whole view
    this.petalAcc += dt * 22;
    while (this.petalAcc > 1) {
      this.petalAcc--;
      const x = focus.x + rand(-22, 22) - wind.x * 6, z = focus.z + rand(-18, 18) - wind.y * 6;
      const ph = rand(0, TAU), amp = rand(0.3, 0.8);
      vfx.petal.spawn({
        x, y: focus.y + rand(4, 9), z, vx: wind.x * rand(0.8, 1.6), vy: -rand(0.35, 0.7), vz: wind.y * rand(0.8, 1.6),
        life: rand(8, 12), size: rand(0.2, 0.3), color: '#ffffff', alpha: 1, alpha1: 1, fadeIn: 0.6, spin: rand(-2, 2), stretch: 0.8,
        fn: (q, dt2, k) => {
          q.x += Math.sin(q.t * 1.7 + ph) * amp * dt2; q.z += Math.cos(q.t * 1.3 + ph) * amp * 0.6 * dt2;
          q.stretch = 0.5 + Math.abs(Math.sin(q.t * 2.3 + ph)) * 0.5;
          const gy = this.world.heightAt(q.x, q.z) + 0.03;
          if (q.y < gy) { q.y = gy; q.vx = q.vz = q.vy = 0; q.fn = null; q.a1 = 0; q.life = q.t + 2.5; }
          if (k > 0.92) q.a0 = Math.max(0, 1 - (k - 0.92) / 0.08);
        },
      });
    }
    // ---- fireflies at night
    if (night > 0.3) {
      this.ffAcc += dt * 14 * night;
      while (this.ffAcc > 1) {
        this.ffAcc--;
        const x = focus.x + rand(-18, 18), z = focus.z + rand(-14, 14);
        if (this.world.heightAt(x, z) < 0.3) continue;
        const ph = rand(0, TAU);
        vfx.glow.spawn({ x, y: this.world.heightAt(x, z) + rand(0.3, 1.6), z, life: rand(3, 6), size: rand(0.18, 0.3), color: chance(0.8) ? '#c8ff6a' : '#ffe07a', alpha: 1, alpha1: 0, fadeIn: 0.8, flicker: rand(3, 7),
          fn: (q, dt2) => { q.x += Math.sin(q.t * 0.9 + ph) * 0.4 * dt2; q.y += Math.sin(q.t * 1.3 + ph) * 0.25 * dt2; q.z += Math.cos(q.t * 0.7 + ph) * 0.4 * dt2; } });
      }
    }
    // ---- butterflies flit between points near the focus (daytime)
    for (const b of this.butterflies) {
      b.t += dt;
      const vis = night < 0.5;
      b.m.visible = vis;
      if (!vis) continue;
      if (b.p.distanceTo(b.target) < 0.4 || b.p.distanceTo(focus) > 26) {
        if (b.p.distanceTo(focus) > 26) b.p.set(focus.x + rand(-15, 15), 0, focus.z + rand(-12, 12));
        b.target.set(b.p.x + rand(-5, 5), 0, b.p.z + rand(-5, 5));
        b.target.y = this.world.heightAt(b.target.x, b.target.z) + rand(0.4, 1.6);
        if (b.p.y === 0) b.p.y = b.target.y;
      }
      const d = b.target.clone().sub(b.p); const L = d.length();
      if (L > 0.01) b.p.addScaledVector(d.normalize(), Math.min(L, b.speed * dt));
      b.p.y += Math.sin(b.t * 6) * 0.01;
      b.m.position.copy(b.p);
      b.m.rotation.y = Math.atan2(d.x, d.z);
      const f = Math.sin(b.t * b.flap) * 1.1;
      b.m.userData.pl.rotation.z = f; b.m.userData.pr.rotation.z = -f;
    }
    // ---- koi
    for (const k of this.koi) {
      k.a += k.sp * dt;
      const x = k.c.x + Math.cos(k.a) * k.r, z = k.c.z + Math.sin(k.a) * k.r;
      k.m.position.set(x, k.y + Math.sin(t * 2 + k.a) * 0.03, z);
      k.m.rotation.y = -k.a + (k.sp > 0 ? 0 : Math.PI);
      k.m.rotation.z = Math.sin(t * 6 + k.r) * 0.1;
    }
    // ---- golden-hour light shafts slanting with the sun
    const h = day?.hour ?? 12;
    const golden = Math.max(smoothstep(5.8, 7.2, h) * (1 - smoothstep(9.5, 11, h)), smoothstep(15.5, 17, h) * (1 - smoothstep(18.8, 19.6, h)));
    const sd = day?.sunDir || new THREE.Vector3(0, 1, 0);
    for (const s of this.shafts) {
      const x = Math.floor((focus.x + s.off.x) / 8) * 8 + 4, z = Math.floor((focus.z + s.off.z) / 8) * 8 + 4;
      s.m.position.set(x, this.world.heightAt(x, z), z);
      // tilt toward the sun, face the camera around that axis
      s.m.up.set(sd.x, sd.y, sd.z);
      s.m.lookAt(G.engine.camera.position.x, s.m.position.y, G.engine.camera.position.z);
      s.m.rotation.z += -Math.atan2(sd.x, sd.y) * 0.5;
      s.m.rotation.x += Math.atan2(sd.z, sd.y) * 0.3;
      s.m.scale.set(s.w, 1, 1);
      s.m.material.opacity = golden * (0.1 + 0.06 * Math.sin(t * 0.5 + s.ph));
      s.m.material.color.copy(day?.out?.sun || new THREE.Color('#ffe0a0'));
      s.m.visible = golden > 0.01;
    }
    // ---- chimney smoke / steam
    for (const e of this.smokeEmitters) {
      if (e.pos.distanceTo(focus) > 40) continue;
      e.acc += dt * e.rate;
      while (e.acc > 1) {
        e.acc--;
        vfx.smoke.spawn({ x: e.pos.x + rand(-0.05, 0.05), y: e.pos.y, z: e.pos.z + rand(-0.05, 0.05), vx: wind.x * 0.4 + rand(-0.1, 0.1), vy: rand(0.5, 0.9), vz: wind.y * 0.4 + rand(-0.1, 0.1), life: rand(2.2, 3.5), size: e.size * 0.5, size1: e.size * 2.2, color: e.color, alpha: e.steam ? 0.45 : 0.55, alpha1: 0, spin: rand(-0.5, 0.5), drag: 0.3, fadeIn: 0.3 });
      }
    }
  }
}
