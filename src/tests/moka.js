// Moka test page: /?test=moka[&only=baked|kit|chewy][&act=swing][&walk=1][&staffs=1][&variant=drift][&dist=4]
// Lineup: the baked Disney Moka (public/rigs/moka_disney.*, if exported), the runtime-sculpted kit Moka (CAST.moka,
// disneyKit 'spaniel' head + ears) and the baked Chewy, each with their weapon; &staffs=1 stands the six staff
// designs (heroGear.js) in a row instead.
import * as THREE from 'three';
import { makeStage } from './_stage.js';
import { buildHumanoid, CAST, boneSwordGeo, contactShadow } from '../actors/charKit.js';
import { Animator } from '../actors/animator.js';
import { loadHeroModels, heroModelReady, buildHeroModel } from '../actors/heroModels.js';
import { makeStaff, attachStaff, tickStaff, setStaffGlow, STAFF_VARIANTS } from '../actors/heroGear.js';
import { disneyWizardHat } from '../actors/disneyKit.js';

export default async function () {
  const ready = await loadHeroModels(['chewy', 'moka']);
  const P = new URLSearchParams(location.search);
  const S = makeStage({ ground: 30, hour: +(P.get('hour') ?? 10), dist: +(P.get('dist') ?? 6), center: [0, 0] });
  const only = P.get('only'), act = P.get('act'), walk = P.has('walk');
  const actors = [], staffs = [];
  const add = (rig, x, z, face = Math.PI / 4) => {
    rig.root.position.set(x, 0, z); rig.root.rotation.y = face;
    S.scene.add(rig.root);
    const sh = contactShadow(0.32); sh.position.set(x, 0.02, z); S.scene.add(sh);
    const anim = new Animator(rig);
    actors.push({ rig, anim, sh, x, z, base: new THREE.Vector3(x, 0, z) });
    return anim;
  };
  const look = { variant: P.get('variant') || 'drift' };
  if (P.has('staffs')) {
    STAFF_VARIANTS.forEach((v, i) => {
      const s = makeStaff({ variant: v }); s.position.set((i - 2.5) * 0.42, 0.36, 0); s.rotation.y = Math.PI / 4;
      S.scene.add(s); staffs.push(s);
    });
  } else {
    const list = [];
    if (!only || only === 'baked') list.push(['baked', () => (ready.moka ? buildHeroModel('moka') : null)]);
    // &spec={"fur":"#7a4a32"} tries colour overrides on the kit Moka (calibrating CAST.moka)
    const kitSpec = { ...CAST.moka, ...(P.get('spec') ? JSON.parse(P.get('spec')) : {}) };
    const myHat = P.has('myhat'); // preview disneyKit's wizard hat on the kit head (instead of charKit's cone)
    if (myHat) kitSpec.outfit = { ...kitSpec.outfit, hat: null };
    if (!only || only === 'kit') list.push(['kit', () => {
      const rig = buildHumanoid(kitSpec);
      if (myHat) rig.parts.head.add(new THREE.Mesh(disneyWizardHat({ color: CAST.moka.outfit.hatColor, band: CAST.moka.outfit.sash }), rig.mat));
      return rig;
    }]);
    if (!only || only === 'chewy') list.push(['chewy', () => (ready.chewy ? buildHeroModel('chewy') : buildHumanoid(CAST.chewy))]);
    const n = list.length;
    list.forEach(([k, build], i) => {
      const rig = build(); if (!rig) { console.warn('[moka test] no', k); return; }
      const x = (i - (n - 1) / 2) * 1.1;
      if (k === 'chewy') {
        const sw = new THREE.Mesh(boneSwordGeo(), rig.propMat || rig.mat); sw.castShadow = true;
        sw.rotation.set(Math.PI * 0.62, 0, 0); sw.position.set(0, -0.02, 0.02); rig.parts.handR.add(sw);
      } else staffs.push(attachStaff(makeStaff(look), rig.parts.handR));
      rig.label = k;
      add(rig, x, 0);
    });
  }
  S.onUpdate((dt, t) => {
    for (const a of actors) {
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
    for (const s of staffs) { if (act) setStaffGlow(s, 2); tickStaff(s, dt); }
  });
  if (P.has('portrait')) { // the dialogue/HUD portraits (gfx/portraits.js) of both heroes, over the scene
    const { Portraits } = await import('../gfx/portraits.js');
    const PR = new Portraits(S.engine); PR.register('moka', CAST.moka);
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:fixed;left:16px;top:16px;display:flex;gap:16px;z-index:5';
    for (const id of ['chewy', 'moka']) {
      const d = document.createElement('div');
      d.style.cssText = 'width:200px;height:200px;border-radius:24px;background:radial-gradient(circle at 50% 40%,#fff,#ffd0e0);border:4px solid #4a2c2a;overflow:hidden';
      d.innerHTML = `<img src="${PR.get(id)}" style="width:200px;height:200px">`;
      wrap.appendChild(d);
    }
    document.body.appendChild(wrap);
  }
  window.actors = actors; window.staffs = staffs; window.stage = S; window.heroReady = ready;
  window.heroInfo = () => actors.map(a => ({ label: a.rig.label, baked: !!a.rig.bakedDisney, tris: a.rig.skin ? (a.rig.skin.geometry.index ? a.rig.skin.geometry.index.count / 3 : 0) : 0 }));
  S.ready();
}
