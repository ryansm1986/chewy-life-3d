// Monster lineup: /?test=monsters[&only=mochi][&dist=14][&move=1]
import * as THREE from 'three';
import { makeStage } from './_stage.js';
import { MONSTERS, buildMonster, MonsterAnim } from '../dungeon/monsters.js';
import { contactShadow } from '../actors/charKit.js';
import { Animator } from '../actors/animator.js';

export default function () {
  const P = new URLSearchParams(location.search);
  const S = makeStage({ ground: 40, hour: 10, dist: +(P.get('dist') ?? 16), groundColor: '#b58e68' });
  const only = P.get('only');
  const ids = only ? [only] : Object.keys(MONSTERS);
  const list = [];
  ids.forEach((id, i) => {
    const def = MONSTERS[id];
    const m = buildMonster(id, +(P.get('v') ?? 0));
    const col = i % 6, row = Math.floor(i / 6);
    const x = only ? 0 : (col - 2.5) * 2.2, z = only ? 0 : (row - 0.5) * 3.2;
    m.root.position.set(x, 0, z); m.root.rotation.y = Math.PI / 4;
    S.scene.add(m.root);
    const sh = contactShadow(def.radius * (def.scale || 1) * 1.1); sh.position.set(x, 0.02, z); S.scene.add(sh);
    const anim = new MonsterAnim(m, def);
    const kit = m.rig ? new Animator(m.rig) : null;
    list.push({ m, anim, kit, def });
  });
  S.onUpdate((dt) => { for (const a of list) { a.anim.update(dt, P.has('move'), 1); a.kit?.update(dt, a.m.root.position); } });
  S.ready();
}
