// Dungeon floor viewer: /?test=dungeon&floor=1[&dist=40]
import * as THREE from 'three';
import { Engine } from '../core/engine.js';
import { Input } from '../core/input.js';
import { generate } from '../dungeon/gen.js';
import { DungeonWorld } from '../dungeon/dungeonWorld.js';
import { buildHumanoid, CAST, boneSwordGeo } from '../actors/charKit.js';
import { Animator } from '../actors/animator.js';
import { U } from '../gfx/materials.js';

export default function () {
  const engine = new Engine();
  Input.init(engine.renderer.domElement);
  const P = engine.params;
  const floor = +(P.get('floor') ?? 1);
  const layout = generate({ floor, seed: +(P.get('seed') ?? 1) });
  const world = new DungeonWorld(engine, layout);
  engine.setWorld(world);
  const start = world.cellToWorld(layout.start.x, layout.start.y);
  const chewy = buildHumanoid(CAST.chewy); chewy.root.position.copy(start); chewy.root.rotation.y = Math.PI / 4; world.scene.add(chewy.root);
  const anim = new Animator(chewy);
  world.lightPool.addSource({ pos: start.clone().setY(1.6), color: new THREE.Color('#ffd8a0'), intensity: 8, radius: 10, priority: 10 });
  engine.rig.focus.copy(start); engine.rig.distTarget = +(P.get('dist') ?? 34); engine.rig.snap();
  window.W = world; window.layout = layout;
  function frame() {
    const dt = engine.tick();
    if (Input.mouse.wheel) engine.rig.zoom(Input.mouse.wheel);
    const { f, r } = engine.rig.groundAxes(); const mv = new THREE.Vector3();
    if (Input.down('w')) mv.add(f); if (Input.down('s')) mv.sub(f); if (Input.down('d')) mv.add(r); if (Input.down('a')) mv.sub(r);
    engine.rig.focus.addScaledVector(mv, dt * 12);
    anim.update(dt, chewy.root.position);
    engine.rig.update(dt);
    world.updateSun(engine.rig.target);
    world.lightPool.update(dt, engine.rig.target, engine.time, 1);
    world.update(dt, engine.time);
    engine.render();
    Input.endFrame();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  setTimeout(() => { window.__ready = true; }, 300);
}
