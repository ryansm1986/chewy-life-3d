// The Golden Retriever dragoon's look page (docs/GOLDEN.md §9): /?test=golden[&views=1][&act=lanceThrust1][&walk=1]
// [&hand=1][&dist=4][&yaw=0.8][&portrait=1][&withkit=1][&solo=1][&stz=1][&lm=x,y,z,qx,qy,qz,qw][&tint=r,g,b]
//  default: the baked Toybox dragoon (public/rigs/golden_toy.*) with his lance (drawn, in the guard, with hand=1; else on
//  his back), the kit fallback beside him (withkit=1), Chewy for scale (solo drops him, stz adds the Shih Tzu);
//  views=1: the sheet's four turnaround views (front, three-quarter, side, back) side by side;
//  act=<action>: loops an animator action (his poses: actors/goldenPoses.js) with the lance drawn; combo=1: the reach
//  combo on a loop; walk=1: walks him in a circle; props=1: the lance and the javelin alone;
//  whelp=<mode>: Shadow the dragon whelp (actors/whelp.js): hover | flap (the wings frozen at flap=<deg>) | sit | walk |
//  fly (circling) | cmp (Shadow beside the whelp) | flaps (the wings at −30, 0, 30, 60 in a row); with the dragoon (golden=1);
//  lm=…: the lance's back mount (model space) live, for tuning.
import * as THREE from 'three';
import { makeStage } from './_stage.js';
import { buildHumanoid, CAST, contactShadow } from '../actors/charKit.js';
import { Animator } from '../actors/animator.js';
import { loadHeroModels, heroModelReady, buildHeroModel } from '../actors/heroModels.js';
import { dressGolden, mountLance, lanceObject, javelinObject, loadGoldenProps, installGoldenGear } from '../actors/goldenGear.js';
import { LANCE_GUARD, GUARD, K, addKey } from '../actors/goldenPoses.js';
import { loadWhelp, buildWhelpRig, buildShadowRig, dressWings } from '../actors/whelp.js';

class Carrier {}
installGoldenGear(Carrier.prototype);
export default async function () {
  const P = new URLSearchParams(location.search);
  const ready = await loadHeroModels(['chewy', 'golden', 'shihtzu', 'shadow']);
  loadGoldenProps();
  await loadWhelp();
  const S = makeStage({ ground: 30, hour: +(P.get('hour') ?? 10), dist: +(P.get('dist') ?? 5.5), center: [0, 0] });
  const act = P.get('act'), walk = P.has('walk'), hand = P.has('hand') || P.has('combo') || !!act;
  if (P.has('gk')) Object.assign(GUARD, K({ ...GUARD, ...JSON.parse(P.get('gk')) })); // (tuning the guard: gk={"armR":[…],"dir":[…]})
  const actors = [];
  const add = (rig, x, z, face = 0, gold = true) => {
    rig.root.position.set(x, 0, z); rig.root.rotation.y = face;
    S.scene.add(rig.root);
    const sh = contactShadow(rig.quadruped ? 0.28 : 0.32); sh.position.set(x, 0.02, z); S.scene.add(sh);
    const anim = new Animator(rig);
    let L = null;
    if (gold && !rig.quadruped) {
      if (P.has('tint')) rig.mat.color.setRGB(...P.get('tint').split(',').map(Number));
      if (P.has('lm') && rig.parts.lanceMount) { // (model space: the chest bone's offset is taken off; x,y,z[,ex,ey,ez] Euler in radians)
        const v = P.get('lm').split(',').map(Number), m = rig.parts.lanceMount, ch = m.parent; ch.updateWorldMatrix(true, false);
        const w = rig.root.localToWorld(new THREE.Vector3(v[0], v[1], v[2])); ch.worldToLocal(w); m.position.copy(w);
        if (v.length >= 6) { m.rotation.set(v[3], v[4], v[5]); console.log('[lm] quat', m.quaternion.toArray().map(x => x.toFixed(4)).join(',')); }
      }
      L = dressGolden(rig);
      if (L && hand) { mountLance(rig, L, 'hand'); anim.stance = LANCE_GUARD; }
    }
    // the Player's carry (goldenGear.js carryLance: the mount, the aim, the left paw, the paw's javelin) on a stand-in
    const gear = L ? Object.assign(new Carrier(), { rig, anim, lance: L, weaponType: 'lance', G: { mode: hand ? 'dungeon' : 'village' }, facing: face, _lanceT: hand ? 1e9 : 0 }) : null;
    const a = { rig, anim, sh, x, z, face, L, gear, base: new THREE.Vector3(x, 0, z), combo: 0 };
    actors.push(a);
    return a;
  };
  const W = P.get('whelp');
  if (P.has('props')) {
    const l = lanceObject(); l.holder.position.set(-0.4, 0.5, 0); l.holder.rotation.z = -Math.PI / 2; S.scene.add(l.holder);
    const j = javelinObject(); j.holder.position.set(-0.3, 0.25, 0.4); j.holder.rotation.z = -Math.PI / 2; S.scene.add(j.holder);
    S.engine.rig.focus.set(0.2, 0.4, 0.1);
  } else if (W === 'flaps') {
    [-30, 0, 30, 60].forEach((deg, i) => { const r = buildWhelpRig(); const a = add(r, (i - 1.5) * 0.8, 0, Math.PI / 4 - 0.3, false); a.flapFix = deg; a.fly = 1; });
    S.engine.rig.focus.set(0, 1.1, 0);
  } else if (W) {
    const fly = W !== 'sit' && W !== 'walk' && W !== 'cmp';
    const r = buildWhelpRig(); const a = add(r, P.has('golden') ? 0.7 : 0, 0.2, +(P.get('face') ?? Math.PI / 4 - 0.3), false);
    a.whelp = W; a.fly = fly ? 1 : 0; if (W === 'flap') a.flapFix = +(P.get('flap') ?? 30);
    if (W === 'cmp') add(buildShadowRig(), -0.75, 0.2, +(P.get('face') ?? Math.PI / 4 - 0.3), false);
    if (P.has('golden') && ready.golden) add(buildHeroModel('golden'), -0.6, -0.1, +(P.get('face') ?? Math.PI / 4 - 0.3)).walkWith = W === 'fly';
    S.engine.rig.focus.set(0, fly ? 1.0 : 0.4, 0);
  } else if (P.has('views')) {
    const sp = +(P.get('sp') ?? 1.15);
    (P.has('faces') ? P.get('faces').split(',').map(Number) : [0, -Math.PI / 4, -Math.PI / 2, Math.PI]).forEach((f, i, all) => add(ready.golden ? buildHeroModel('golden') : buildHumanoid(CAST.golden || CAST.chewy), (i - (all.length - 1) / 2) * sp, 0, f));
  } else {
    const list = [];
    if (ready.golden) list.push(['baked', () => buildHeroModel('golden')]);
    if (P.has('withkit') || !ready.golden) list.push(['kit', () => buildHumanoid(CAST.golden || CAST.chewy)]);
    if (!P.has('solo')) list.push(['chewy', () => (ready.chewy ? buildHeroModel('chewy') : buildHumanoid(CAST.chewy))]);
    if (P.has('stz') && ready.shihtzu) list.push(['stz', () => buildHeroModel('shihtzu')]);
    const n = list.length;
    list.forEach(([k, build], i) => add(build(), (i - (n - 1) / 2) * 1.2, 0, +(P.get('face') ?? Math.PI / 4 - 0.3), k === 'baked' || k === 'kit'));
  }
  const COMBO = ['lanceThrust1', 'lanceThrust2', 'lanceSwat'];
  S.onUpdate((dt, t) => {
    for (const a of actors) {
      if (walk || a.whelp === 'walk' || a.whelp === 'fly' || a.walkWith) {
        const ang = t * 0.8 + a.x;
        a.rig.root.position.set(a.base.x + Math.cos(ang) * 0.9, 0, a.base.z + Math.sin(ang) * 0.9);
        a.rig.root.rotation.y = -ang;
      }
      if (act && !a.anim.action) a.anim.play(act);
      if (act && P.has('at') && a.anim.action) { const ac = a.anim.action; ac.t = +P.get('at') * ac.dur - dt; ac.fired.clear(); ac.onEvent = null; } // (frozen at that moment of the move: at=0..1)
      if (P.has('combo') && !a.anim.action && a.L) a.anim.play(COMBO[a.combo++ % 3], { speed: 1.1 * [0.42, 0.42, 0.5][(a.combo - 1) % 3] });
      if (a.whelp === 'sit' && !a.anim.action) a.anim.play('sit');
      if (a.fly != null && a.rig.parts.wings) {
        const A = a.anim; A.flyRig = true; a.rig.root.rotation.order = 'YXZ';
        A.fly = a.fly; A.flyLift = a.fly ? 1.05 + Math.sin(t * 2.3) * 0.05 : 0; A.flyPitch = a.whelp === 'fly' ? 0.3 : 0.05; A.flyBank = a.whelp === 'fly' ? -0.2 : 0;
        const deg = a.flapFix ?? (a.fly ? 14 + 34 * Math.sin(t * (a.whelp === 'fly' ? 4.5 : 2.6) * Math.PI * 2) : 52);
        a.rig.parts.wings.flap(deg);
      }
      a.anim.update(dt, a.rig.root.position);
      a.rig.root.position.y = a.rig.offsetY || 0;
      a.sh.position.set(a.rig.root.position.x, 0.02, a.rig.root.position.z);
      if (a.gear) { a.gear.facing = a.rig.root.rotation.y; a.gear.carryLance(dt); }
      if (P.has('ak')) { const k = window.__AK || (window.__AK = K(JSON.parse(P.get('ak')))); a.anim.stance = (A, t, w) => addKey(A, k, 1); } // (a pose explorer: ak={"armR":[…],…} held)
    }
  });
  if (P.has('portrait')) {
    const { Portraits } = await import('../gfx/portraits.js');
    const PR = new Portraits(S.engine); PR.register('golden', CAST.golden || CAST.chewy);
    for (const [i, id] of ['golden', 'shadowWhelp', 'shadow'].entries()) {
      const d = document.createElement('div');
      d.style.cssText = `position:fixed;left:${16 + i * 216}px;top:16px;width:200px;height:200px;border-radius:24px;background:radial-gradient(circle at 50% 40%,#fff,#f0e2cc);border:4px solid #4a2c2a;overflow:hidden;z-index:5`;
      d.innerHTML = `<img src="${PR.get(id)}" style="width:200px;height:200px">`;
      document.body.appendChild(d);
    }
  }
  window.__info = { baked: !!ready.golden, whelp: heroModelReady('shadowWhelp'), actors: actors.length };
  window.GLD = { actors, S };
  setTimeout(() => { window.__ready = true; }, 1200);
}
