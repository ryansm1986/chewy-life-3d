// The Shih Tzu's look page (docs/SHIHTZU.md §9): /?test=shihtzu[&views=1][&act=flailSwing1][&walk=1][&hand=1][&dist=4]
// [&yaw=0.8][&portrait=1][&dg=1,7,4,-2][&withkit=1][&flails=1][&solo=1]
//  default: the baked Toybox Shih Tzu (public/rigs/shihtzu_toy.*) with his flail (in his paw with hand=1, else on his
//  back), the kit fallback beside him, and Chewy / Poe for scale;
//  views=1: the sheet's four turnaround views (front, three-quarter, side, back) side by side;
//  act=<action>: loops an animator action (his poses: actors/shihtzuPoses.js); walk=1: walks him in a circle;
//  swing=1: loops the three-swing combo; flails=1: the flail prop alone in a row (straight, hanging, swung);
//  tints=1: the twelve flail bases' props (each base's ball and rope tint) in two rows, their item icons along the bottom.
//  ghosts=1: the Ghostlight Tome's ghosts (four pups, Grandpaw, the ward's bones) on grass and on snow, with him for scale.
import * as THREE from 'three';
import { makeStage } from './_stage.js';
import { buildHumanoid, CAST, contactShadow } from '../actors/charKit.js';
import { Animator } from '../actors/animator.js';
import { loadHeroModels, heroModelReady, buildHeroModel } from '../actors/heroModels.js';
import { dressShihtzu, mountFlail, stepFlail, flailObject, setFlailLook } from '../actors/shihtzuGear.js';

export default async function () {
  const ready = await loadHeroModels(['chewy', 'poe', 'shihtzu']);
  const P = new URLSearchParams(location.search);
  const S = makeStage({ ground: 30, hour: +(P.get('hour') ?? 10), dist: +(P.get('dist') ?? 5.5), center: [0, 0] });
  const act = P.get('act'), walk = P.has('walk'), hand = P.has('hand') || P.has('swing') || !!act;
  const actors = [];
  const add = (rig, x, z, face = 0, stz = true) => {
    rig.root.position.set(x, 0, z); rig.root.rotation.y = face;
    S.scene.add(rig.root);
    const sh = contactShadow(0.32); sh.position.set(x, 0.02, z); S.scene.add(sh);
    const anim = new Animator(rig);
    let F = null;
    if (stz) {
      if (P.has('dg')) { const v = P.get('dg').split(',').map(Number); rig.mat.userData.u?.uDarkGrade?.value.set(v[0], v[1] / 255, v[2] / 255, v[3] / 255); } // (calibrating the coat grade)
      if (P.has('dn') && rig.mat.userData.u?.uDarkNeutral) rig.mat.userData.u.uDarkNeutral.value = +P.get('dn');
      F = dressShihtzu(rig);
      if (F && hand) mountFlail(rig, F, true);
    }
    actors.push({ rig, anim, sh, x, z, face, F, base: new THREE.Vector3(x, 0, z), combo: 0 });
    return anim;
  };
  if (P.has('ghosts')) {
    const { GhostBatch, grandpawModel, ghostTick, lanternTip } = await import('../gfx/shihtzuGhosts.js');
    const snow = new THREE.Mesh(new THREE.PlaneGeometry(8, 12).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#f4f8fc' })); snow.position.set(3.2, 0.01, 0); snow.receiveShadow = true; S.scene.add(snow);
    const pups = new GhostBatch(S.scene, 'pup', 8), bones = new GhostBatch(S.scene, 'bone', 8), gp = grandpawModel(); S.scene.add(gp.root);
    const slots = [0, 1, 2, 3, 4, 5].map(() => pups.add()), bs = [0, 1, 2, 3, 4, 5].map(() => bones.add());
    if (ready.shihtzu) add(buildHeroModel('shihtzu'), 0, 0.9, +(P.get('face') ?? 0.4));
    const { atlasCell, SF } = await import('../gfx/shihtzuFx.js'); // (the flame as the game draws it: the soft mote cell, not a bare quad)
    const fl = new THREE.Sprite(new THREE.SpriteMaterial({ map: atlasCell(SF.MOTE), color: '#5ce0c0', transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); fl.scale.setScalar(0.35); S.scene.add(fl);
    const _l = new THREE.Vector3();
    S.onUpdate((dt, t) => {
      ghostTick(t);
      slots.forEach((s, i) => { const x = (i - 2.5) * 0.85 + (i > 2 ? 0.8 : 0); pups.set(s, { x, y: 0.12 + Math.sin(t * 2.4 + i) * 0.05, z: -0.4 + (i % 2) * 0.5, yaw: 0.35 + (i % 3 - 1) * 0.4, scale: 1, phase: i * 1.7, nod: i === 1 ? Math.max(0, Math.sin(t * 5)) * 0.4 : 0, alpha: 1, wag: 1 }); });
      const gs = { x: -2.6, y: 0.1 + Math.sin(t * 1.6) * 0.06, z: -1.4, yaw: 0.5, scale: 2.4, phase: 0.3, nod: P.has('howl') ? -0.5 : 0, alpha: 1, wag: 0 };
      gp.set(gs); lanternTip(gp, gs, _l); fl.position.copy(_l); fl.material.opacity = Math.min(0.55, 0.42 + 0.1 * Math.sin(t * 9));
      bs.forEach((b, i) => { const a = t * 1.8 + (i / 6) * Math.PI * 2; bones.set(b, { x: 2.4 + Math.cos(a) * 0.9, y: 0.75 + Math.sin(a * 2) * 0.05, z: 1.4 + Math.sin(a) * 0.9, yaw: -a, roll: 0.3, scale: 1, alpha: 1 }); });
    });
    S.engine.rig.focus.set(+(P.get('fx') ?? 0), +(P.get('fy') ?? 0.5), +(P.get('fz') ?? 0)); S.engine.rig.snap();
    window.GH = { pups, bones, gp };
  } else if (P.has('tints')) {
    const { ITEM_BASES } = await import('../rpg/items.js'), { itemIcon } = await import('../rpg/icons.js');
    const bases = Object.entries(ITEM_BASES).filter(([, b]) => b.wtype === 'flail');
    const strip = document.createElement('div'); strip.style.cssText = 'position:fixed;left:0;right:0;bottom:8px;display:flex;justify-content:center;gap:6px;z-index:5';
    bases.forEach(([id, b], i) => {
      const F = flailObject(); setFlailLook(F, b.icon); F.holder.position.set((i % 6 - 2.5) * 0.62, 1.15 - Math.floor(i / 6) * 0 , Math.floor(i / 6) * -0.9); F.holder.rotation.z = Math.PI; S.scene.add(F.holder); actors.push({ prop: F, i: 1 });
      const im = document.createElement('img'); im.src = itemIcon({ ...b, base: id, rarity: 'normal' }); im.title = b.name; im.style.cssText = 'width:72px;height:72px'; strip.appendChild(im);
    });
    document.body.appendChild(strip);
    S.engine.rig.focus.set(0, 0.7, -0.45);
  } else if (P.has('flails')) {
    for (let i = 0; i < 3; i++) { const F = flailObject(); F.holder.position.set((i - 1) * 0.9, 1.1, 0); S.scene.add(F.holder); actors.push({ prop: F, i }); }
    S.engine.rig.focus.set(0, 0.6, 0);
  } else if (P.has('views')) {
    // front, three-quarter, his left side toward the camera, back — the sheet's turnaround
    [0, -Math.PI / 4, -Math.PI / 2, Math.PI].forEach((f, i) => add(ready.shihtzu ? buildHeroModel('shihtzu') : buildHumanoid(CAST.shihtzu), (i - 1.5) * 1.15, 0, f));
  } else {
    const list = [];
    if (ready.shihtzu) list.push(['baked', () => buildHeroModel('shihtzu')]);
    if (P.has('withkit') || !ready.shihtzu) list.push(['kit', () => buildHumanoid(CAST.shihtzu)]);
    if (!P.has('solo')) list.push(['chewy', () => (ready.chewy ? buildHeroModel('chewy') : buildHumanoid(CAST.chewy))]);
    if (P.has('poe') && ready.poe) list.push(['poe', () => buildHeroModel('poe')]);
    const n = list.length;
    list.forEach(([k, build], i) => { const rig = build(); add(rig, (i - (n - 1) / 2) * 1.2, 0, +(P.get('face') ?? Math.PI / 4 - 0.3), k === 'baked' || k === 'kit'); });
  }
  const SW = ['flailSwing1', 'flailSwing2', 'flailSlam'];
  S.onUpdate((dt, t) => {
    for (const a of actors) {
      if (a.prop) { const F = a.prop; F.holder.rotation.z = a.i === 2 ? t * 3 : a.i === 1 ? Math.PI : 0; F.holder.updateMatrixWorld(true); continue; }
      if (walk) {
        const ang = t * 0.8 + a.x;
        a.rig.root.position.set(a.base.x + Math.cos(ang) * 0.9, 0, a.base.z + Math.sin(ang) * 0.9);
        a.rig.root.rotation.y = -ang;
      }
      if (act && !a.anim.action) a.anim.play(act);
      if (P.has('swing') && !a.anim.action) a.anim.play(SW[a.combo++ % 3], { speed: 1.05 * [0.5, 0.48, 0.62][(a.combo - 1) % 3] });
      a.anim.update(dt, a.rig.root.position);
      a.rig.root.position.y = a.rig.offsetY || 0;
      a.sh.position.set(a.rig.root.position.x, 0.02, a.rig.root.position.z);
      if (a.F) stepFlail(a.rig, a.F, dt, 0, a.rig.root.rotation.y, a.anim.A);
    }
  });
  if (P.has('portrait')) {
    const { Portraits } = await import('../gfx/portraits.js');
    const PR = new Portraits(S.engine); PR.register('shihtzu', CAST.shihtzu);
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;left:16px;top:16px;width:200px;height:200px;border-radius:24px;background:radial-gradient(circle at 50% 40%,#fff,#e4d8ec);border:4px solid #4a2c2a;overflow:hidden;z-index:5';
    d.innerHTML = `<img src="${PR.get('shihtzu')}" style="width:200px;height:200px">`;
    document.body.appendChild(d);
  }
  window.__info = { baked: !!ready.shihtzu, actors: actors.length };
  window.STZ = { actors };
  setTimeout(() => { window.__ready = true; }, 900);
}
