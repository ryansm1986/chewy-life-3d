// Poe test page (docs/POE.md): /?test=poe[&views=1][&fumas=1][&act=fumaSlash][&walk=1][&hand=1][&dist=4][&yaw=0.8][&portrait=1]
// [&spec={"fur":"#2e2a30"}][&ghost=1]
//  default: the kit Poe (her fūma on her back), the baked Toybox Poe if it has landed (public/rigs/poe_toy.*), and Chewy for scale;
//  views=1: the sheet's four turnaround views (front, three-quarter, side, back) side by side;
//  fumas=1: the twelve fūma bases (items.js) in a row;
//  act=<action>: loops an animator action (her poses: actors/poePoses.js); hand=1: the fūma in her paw instead.
import * as THREE from 'three';
import { makeStage } from './_stage.js';
import { buildHumanoid, CAST, contactShadow } from '../actors/charKit.js';
import { Animator } from '../actors/animator.js';
import { loadHeroModels, heroModelReady, buildHeroModel } from '../actors/heroModels.js';
import { dressPoe, fumaGeo, fumaMat, ghost, tickGhost } from '../actors/poeGear.js';
import { ITEM_BASES } from '../rpg/items.js';

export default async function () {
  const ready = await loadHeroModels(['chewy', 'poe', 'shadow']);
  const P = new URLSearchParams(location.search);
  const S = makeStage({ ground: 30, hour: +(P.get('hour') ?? 10), dist: +(P.get('dist') ?? 5.5), center: [0, 0] });
  const act = P.get('act'), walk = P.has('walk'), hand = P.has('hand');
  const spec = { ...CAST.poe, ...(P.get('spec') ? JSON.parse(P.get('spec')) : {}) };
  const actors = [];
  const add = (rig, x, z, face = 0, poe = true) => {
    rig.root.position.set(x, 0, z); rig.root.rotation.y = face;
    S.scene.add(rig.root);
    const sh = contactShadow(0.32); sh.position.set(x, 0.02, z); S.scene.add(sh);
    const anim = new Animator(rig);
    if (poe) {
      if (P.has('dg')) { const v = P.get('dg').split(',').map(Number); rig.mat.userData.u?.uDarkGrade?.value.set(v[0], v[1] / 255, v[2] / 255, v[3] / 255); } // (calibrating the coat grade)
      const back = dressPoe(rig);
      if (hand) { back.visible = false; const m = new THREE.Mesh(fumaGeo(), rig.propMat || rig.mat); m.position.set(0, -0.035, 0.07); m.rotation.set(0, Math.PI / 2, 0); rig.parts.handR.add(m); rig.fumaHand = m; }
      if (P.has('ghost')) ghost(rig, true, 0.6);
    }
    actors.push({ rig, anim, sh, x, z, face, base: new THREE.Vector3(x, 0, z) });
    return anim;
  };
  if (P.has('fumas')) {
    const ids = Object.keys(ITEM_BASES).filter(id => ITEM_BASES[id].wtype === 'fuma');
    ids.forEach((id, i) => {
      const m = new THREE.Mesh(fumaGeo(ITEM_BASES[id].icon), fumaMat()); m.castShadow = true;
      m.position.set(((i % 6) - 2.5) * 0.7, 0.45, Math.floor(i / 6) * 0.8 - 0.4); m.rotation.set(-0.5, 0.4, 0);
      S.scene.add(m); actors.push({ prop: m, spin: 0.4 + i * 0.05 });
    });
    S.engine.rig.focus.set(0, 0.4, 0);
  } else if (P.has('furs')) { // &furs=3d3b38/24221f,363d33/1e221c,…: coat / mask colour candidates side by side
    const furs = P.get('furs').split(','), n = furs.length;
    furs.forEach((fm, i) => { const [f, m] = fm.split('/'); add(buildHumanoid({ ...spec, fur: '#' + f, fur2: '#' + (m || f), earColor: '#' + (m || f), nose: '#' + (m || f) }), (i - (n - 1) / 2) * 1.0, 0, Math.PI / 4 - 0.3); });
    if (P.has('shadow') && ready.shadow) add(buildHeroModel('shadow'), (n + 1) / 2 * 1.0, 0.4, Math.PI / 4 - 0.3, false);
  } else if (P.has('views')) {
    // front, three-quarter, left side (her left toward the camera), back — the sheet's turnaround
    [0, -Math.PI / 4, -Math.PI / 2, Math.PI].forEach((f, i) => add(buildHumanoid(spec), (i - 1.5) * 1.05, 0, f));
  } else {
    const list = [['kit', () => buildHumanoid(spec)]];
    if (ready.poe) list.push(['baked', () => buildHeroModel('poe')]);
    list.push(['chewy', () => (ready.chewy ? buildHeroModel('chewy') : buildHumanoid(CAST.chewy))]);
    if (P.has('shadow') && ready.shadow) list.push(['shadow', () => buildHeroModel('shadow')]); // (a black coat that reads, for calibrating hers)
    const n = list.length;
    list.forEach(([k, build], i) => { const rig = build(); add(rig, (i - (n - 1) / 2) * 1.1, 0, Math.PI / 4 - 0.3, k !== 'chewy' && k !== 'shadow'); });
  }
  S.onUpdate((dt, t) => {
    tickGhost(t);
    for (const a of actors) {
      if (a.prop) { a.prop.rotation.z += dt * a.spin; continue; }
      if (walk) {
        const ang = t * 0.8 + a.x;
        a.rig.root.position.set(a.base.x + Math.cos(ang) * 0.8, 0, a.base.z + Math.sin(ang) * 0.8);
        a.rig.root.rotation.y = -ang;
      }
      if (act && !a.anim.action) a.anim.play(act);
      a.anim.update(dt, a.rig.root.position);
      a.rig.root.position.y = a.rig.offsetY || 0;
      a.sh.position.set(a.rig.root.position.x, 0.02, a.rig.root.position.z);
    }
  });
  if (P.has('portrait')) {
    const { Portraits } = await import('../gfx/portraits.js');
    const PR = new Portraits(S.engine); PR.register('poe', CAST.poe);
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;left:16px;top:16px;width:200px;height:200px;border-radius:24px;background:radial-gradient(circle at 50% 40%,#fff,#d8e8d0);border:4px solid #4a2c2a;overflow:hidden;z-index:5';
    d.innerHTML = `<img src="${PR.get('poe')}" style="width:200px;height:200px">`;
    document.body.appendChild(d);
  }
  window.__info = { baked: !!ready.poe, actors: actors.length };
  setTimeout(() => { window.__ready = true; }, 600);
}
