// Reusable dev stage for isolated test pages: engine + lit scene + painted ground + day/night + render loop.
// Usage:  const S = makeStage({ ground: 40, hour: 10, center:[0,0], dist: 30 });  S.scene.add(obj);  S.onUpdate(dt => ...);
import * as THREE from 'three';
import { Engine, LightPool } from '../core/engine.js';
import { Input } from '../core/input.js';
import { DayNight } from '../gfx/sky.js';
import { makeToon, U } from '../gfx/materials.js';

export function makeStage({ ground = 60, hour = 10, center = [0, 0], dist = 30, groundColor = '#7cc45a', fog = true } = {}) {
  const engine = new Engine();
  Input.init(engine.renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#cfe6ff');
  if (fog) scene.fog = new THREE.Fog('#cfe6ff', 80, 200);
  const hemi = new THREE.HemisphereLight('#bcdcff', '#b4c28c', 1.0); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff4e0', 2.5); sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  const sc = sun.shadow.camera; sc.left = -40; sc.right = 40; sc.top = 40; sc.bottom = -40; sc.near = 1; sc.far = 200;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03; sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  const lightPool = new LightPool(scene, 8);
  let groundMesh = null;
  if (ground) {
    const g = new THREE.PlaneGeometry(ground, ground, 1, 1); g.rotateX(-Math.PI / 2); g.translate(center[0], 0, center[1]);
    groundMesh = new THREE.Mesh(g, makeToon({ color: groundColor, brush: 0.25, brushScale: 0.2, rim: 0 }));
    groundMesh.receiveShadow = true; scene.add(groundMesh);
  }
  const world = {
    scene, sun, hemi, lightPool,
    onSky(o, day) { U.uSunDir.value.copy(day.sunDir); U.uSkyHor.value.copy(o.hor); },
    heightAt: () => 0,
  };
  engine.setWorld(world);
  const day = new DayNight(world, engine.post);
  day.hour = +(engine.params.get('hour') ?? hour);
  day.paused = engine.params.has('pause') || true;
  engine.rig.focus.set(center[0], 0.5, center[1]);
  engine.rig.distTarget = +(engine.params.get('dist') ?? dist);
  engine.rig.minDist = 4; engine.rig.maxDist = 200;
  if (engine.params.has('yaw')) engine.rig.yawTarget = +engine.params.get('yaw');
  if (engine.params.has('pitch')) engine.rig.pitch = +engine.params.get('pitch');
  if (engine.params.has('cx')) engine.rig.focus.set(+engine.params.get('cx'), +(engine.params.get('cy') ?? 0.5), +engine.params.get('cz'));
  engine.rig.snap();
  const updaters = [];
  const S = {
    engine, scene, sun, hemi, lightPool, day, world, ground: groundMesh, THREE, Input,
    onUpdate(fn) { updaters.push(fn); },
    ready() { setTimeout(() => { window.__ready = true; }, 250); },
    freeCam: true,
  };
  const tmp = new THREE.Vector3();
  function frame() {
    const dt = engine.tick();
    day.update(dt);
    if (S.freeCam) {
      if (Input.mouse.wheel) engine.rig.zoom(Input.mouse.wheel);
      const { f, r } = engine.rig.groundAxes();
      tmp.set(0, 0, 0);
      if (Input.down('w')) tmp.add(f); if (Input.down('s')) tmp.sub(f); if (Input.down('d')) tmp.add(r); if (Input.down('a')) tmp.sub(r);
      engine.rig.focus.addScaledVector(tmp, dt * 10);
      if (Input.hit('q')) engine.rig.yawTarget += Math.PI / 4;
      if (Input.hit('e')) engine.rig.yawTarget -= Math.PI / 4;
    }
    for (const fn of updaters) { try { fn(dt, engine.time); } catch (e) { console.error('[stage] updater failed', e); } } // (a throw must not stop the frame loop: window.advance() would hang)
    engine.rig.update(dt);
    sun.target.position.copy(engine.rig.target);
    sun.position.copy(engine.rig.target).addScaledVector(day.sunDir, 70);
    lightPool.update(dt, engine.rig.target, engine.time, day.night);
    engine.render();
    Input.endFrame();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  window.S = S;
  return S;
}
