// Monster lineup: /?test=monsters[&only=mochi][&dist=14][&move=1][&v=1]
// Regular yokai stand on the front row, bosses (each spaced by its own size) on the back row.
import * as THREE from 'three';
import { makeStage } from './_stage.js';
import { MONSTERS, buildMonster, MonsterAnim } from '../dungeon/monsters.js';
import { contactShadow } from '../actors/charKit.js';
import { Animator } from '../actors/animator.js';

export default function () {
  const P = new URLSearchParams(location.search);
  const only = P.get('only');
  const ids = only ? [only] : Object.keys(MONSTERS);
  const S = makeStage({ ground: 60, hour: 10, dist: +(P.get('dist') ?? (only ? 16 : 30)), groundColor: '#b58e68' });
  const list = [];
  const rows = [ids.filter(id => !MONSTERS[id].boss), ids.filter(id => MONSTERS[id].boss)];
  rows.forEach((row, ri) => {
    const w = id => Math.max(2.2, (MONSTERS[id].vr || MONSTERS[id].radius) * (MONSTERS[id].boss ? 1 : MONSTERS[id].scale || 1) * 2.6);
    const total = row.reduce((a, id) => a + w(id), 0);
    let x = -total / 2;
    for (const id of row) {
      const def = MONSTERS[id];
      const m = buildMonster(id, +(P.get('v') ?? 0));
      const px = only ? 0 : x + w(id) / 2, pz = only ? 0 : (ri ? -4.5 : 2.5);
      x += w(id);
      m.root.position.set(px, 0, pz); m.root.rotation.y = Math.PI / 4;
      S.scene.add(m.root);
      const sh = contactShadow((def.vr || def.radius) * (def.boss ? 1 : def.scale || 1) * 1.1); sh.position.set(px, 0.02, pz); S.scene.add(sh);
      const anim = new MonsterAnim(m, def);
      const kit = m.rig ? new Animator(m.rig) : null;
      list.push({ m, anim, kit, def });
    }
  });
  S.onUpdate((dt) => { for (const a of list) { a.anim.update(dt, P.has('move'), 1); a.kit?.update(dt, a.m.root.position); } });
  S.ready();
}
