// Free-camera village sandbox (WASD pans). Used for environment screenshots.
import * as THREE from 'three';
import { Engine } from '../core/engine.js';
import { Input } from '../core/input.js';
import { VillageWorld } from '../world/villageWorld.js';
import { DayNight } from '../gfx/sky.js';

export default function () {
  const engine = new Engine();
  Input.init(engine.renderer.domElement);
  const world = new VillageWorld(engine);
  engine.setWorld(world);
  const day = new DayNight(world, engine.post);
  const P = engine.params;
  if (P.has('hour')) day.hour = +P.get('hour');
  engine.rig.focus.set(56, 1, 62);
  if (P.has('cx')) engine.rig.focus.set(+P.get('cx'), 1, +P.get('cz'));
  if (P.has('dist')) engine.rig.distTarget = +P.get('dist');
  if (P.has('nofog')) { world.scene.fog.far = 1e5; world.scene.fog.near = 1e5; }
  engine.rig.snap();
  window.G = { engine, world, day, THREE };
  function frame() {
    const dt = engine.tick();
    day.update(dt);
    if (Input.mouse.wheel) engine.rig.zoom(Input.mouse.wheel);
    const { f, r } = engine.rig.groundAxes();
    const mv = new THREE.Vector3();
    if (Input.down('w')) mv.add(f); if (Input.down('s')) mv.sub(f); if (Input.down('d')) mv.add(r); if (Input.down('a')) mv.sub(r);
    engine.rig.focus.addScaledVector(mv, dt * 12);
    engine.rig.update(dt);
    world.updateSun(engine.rig.target, day.sunDir);
    world.update(dt, engine.time);
    engine.render();
    Input.endFrame();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  setTimeout(() => { window.__ready = true; }, 300);
}
