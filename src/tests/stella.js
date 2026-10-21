// Stella's look page (docs/STELLA.md §9): /?test=stella[&views=1][&act=cast][&at=0.5][&walk=1][&run=1][&sit=1]
// [&hold=carry|hand|shoulder|cast][&talk=1][&blink=0..1][&dist=5.5][&yaw=0.8][&portrait=1][&solo=1][&moka=1][&props=1][&tint=r,g,b][&face=0]
//  default: the baked Toybox Weimaraner (public/rigs/stella_toy.*) with her parasol over her right shoulder (the
//  shoulder mount: her arm swings free), Chewy for scale (solo drops him; moka adds Moka);
//  views=1: the sheet's four turnaround views (front, three-quarter, side, back) side by side;
//  hold=…: where the parasol is (actors/stellaGear.js mountParasol): carry (the shoulder mount), hand (upright in her paw),
//  shoulder (in her paw over the shoulder, the arm held in its pose), cast (raised upright over her head);
//  act=<action>: loops an animator action (at=0..1 freezes it there); walk=1 / run=1: a circle at a walk / a run;
//  sit=1: the sit; props=1: the parasol alone; portrait=1: her bust as the HUD draws it; tint=: a material colour.
import * as THREE from 'three';
import { makeStage } from './_stage.js';
import { buildHumanoid, CAST, contactShadow } from '../actors/charKit.js';
import { Animator } from '../actors/animator.js';
import { loadHeroModels, buildHeroModel } from '../actors/heroModels.js';
import { dressStella, mountParasol, parasolObject, parasolStance, loadStellaProps } from '../actors/stellaGear.js';

export default async function () {
  const P = new URLSearchParams(location.search);
  const ready = await loadHeroModels(['stella', 'chewy', 'moka']);
  await loadStellaProps();
  const S = makeStage({ ground: 30, hour: +(P.get('hour') ?? 10), dist: +(P.get('dist') ?? 5.5), center: [0, 0] });
  const act = P.get('act'), walk = P.has('walk') || P.has('run'), run = P.has('run'), hold = P.get('hold') || (act === 'cast' ? 'cast' : 'carry');
  const actors = [];
  const add = (rig, x, z, face = 0, her = true) => {
    rig.root.position.set(x, 0, z); rig.root.rotation.y = face;
    S.scene.add(rig.root);
    const sh = contactShadow(0.32); sh.position.set(x, 0.02, z); S.scene.add(sh);
    const anim = new Animator(rig);
    let R = null;
    if (her) {
      if (P.has('tint')) rig.mat.color.setRGB(...P.get('tint').split(',').map(Number));
      R = dressStella(rig);
      if (R && hold !== 'carry') mountParasol(rig, R, hold);
      if (hold === 'shoulder' || hold === 'cast') anim.stance = parasolStance(hold);
    }
    const a = { rig, anim, sh, x, z, face, R, base: new THREE.Vector3(x, 0, z) };
    actors.push(a);
    return a;
  };
  const her = () => (ready.stella ? buildHeroModel('stella') : buildHumanoid(CAST.stella || CAST.moka));
  const face = +(P.get('face') ?? Math.PI / 4 - 0.3);
  if (P.has('props')) {
    const R = parasolObject(); R.holder.position.set(0, 0.25, 0); S.scene.add(R.holder);
    S.engine.rig.focus.set(0, 0.45, 0);
  } else if (P.has('views')) {
    const sp = +(P.get('sp') ?? 1.15);
    (P.has('faces') ? P.get('faces').split(',').map(Number) : [0, -Math.PI / 4, -Math.PI / 2, Math.PI]).forEach((f, i, all) => add(her(), (i - (all.length - 1) / 2) * sp, 0, f));
  } else {
    const list = [['stella', her, true]];
    if (!P.has('solo')) list.push(['chewy', () => (ready.chewy ? buildHeroModel('chewy') : buildHumanoid(CAST.chewy)), false]);
    if (P.has('moka')) list.push(['moka', () => (ready.moka ? buildHeroModel('moka') : buildHumanoid(CAST.moka)), false]);
    const n = list.length;
    list.forEach(([, build, mine], i) => add(build(), (i - (n - 1) / 2) * 1.25, 0, face, mine));
  }
  S.onUpdate((dt, t) => {
    for (const a of actors) {
      if (walk) {
        const w = run ? 2.6 : 1.2, ang = t * w + a.x, r = run ? 1.6 : 1.0;
        a.rig.root.position.set(a.base.x + Math.cos(ang) * r, 0, a.base.z + Math.sin(ang) * r);
        a.rig.root.rotation.y = -ang;
      }
      if (P.has('sit') && !a.anim.action) a.anim.play('sit');
      if (act && !a.anim.action) a.anim.play(act);
      if (act && P.has('at') && a.anim.action) { const ac = a.anim.action; ac.t = +P.get('at') * ac.dur - dt; ac.fired?.clear?.(); ac.onEvent = null; }
      if (P.has('talk')) a.anim.talk = 1;
      if (P.has('blink')) { a.anim.blinkT = 9; a.anim.blinkK = Math.asin(Math.min(1, +P.get('blink'))) / Math.PI + dt * 7; } // (blink=0..1: the lids held that far closed; 1 the full blink)
      a.anim.update(dt, a.rig.root.position);
      a.rig.root.position.y = a.rig.offsetY || 0;
      a.sh.position.set(a.rig.root.position.x, 0.02, a.rig.root.position.z);
    }
  });
  if (P.has('portrait')) {
    const { Portraits } = await import('../gfx/portraits.js');
    const PR = new Portraits(S.engine); PR.register('stella', CAST.stella || CAST.moka);
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;left:16px;top:16px;width:200px;height:200px;border-radius:24px;background:radial-gradient(circle at 50% 40%,#fff,#f0e2cc);border:4px solid #4a2c2a;overflow:hidden;z-index:5';
    d.innerHTML = `<img src="${PR.get('stella')}" style="width:200px;height:200px">`;
    document.body.appendChild(d);
  }
  window.__info = { baked: !!ready.stella, actors: actors.length, glb: !!actors[0]?.R?.glb };
  window.STL = { actors, S };
  window.actors = actors;
  setTimeout(() => { window.__ready = true; }, 1200);
}
