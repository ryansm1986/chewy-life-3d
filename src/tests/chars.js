// Character lineup test: /?test=chars[&act=swing][&walk=1][&only=chewy][&dist=8]
import * as THREE from 'three';
import { makeStage } from './_stage.js';
import { buildHumanoid, buildBoston, CAST, REFINED_CAST, boneSwordGeo, tennisBall, contactShadow } from '../actors/charKit.js';
import { Animator } from '../actors/animator.js';
import { makeToon } from '../gfx/materials.js';
import { loadRefinedRigs } from '../actors/refinedRigs.js';
import { loadDisneyChewy, disneyReady, buildDisneyChewy } from '../actors/disneyChewy.js';

export const VILLAGER_SPECS = [
  { name: 'Mochi', species: 'cat', fur: '#fff4ea', fur2: '#ffffff', fur3: '#f4a860', earColor: '#f4a860', outfit: { top: 'kimono', topColor: '#ff9ec0', bottomColor: '#6a4a6a', sash: '#ffd24a' } },
  { name: 'Usagi', species: 'bunny', fur: '#ffffff', fur2: '#fff8f4', earColor: '#ffffff', outfit: { top: 'overalls', topColor: '#8fd0ff', bottomColor: '#5a8ad8', shirt: '#fff0a8', hat: 'flower', hatColor: '#ffb0d0' } },
  { name: 'Kuma', species: 'bear', fur: '#a86a44', fur2: '#e8c49a', outfit: { top: 'shirt', topColor: '#7cc45a', bottomColor: '#5a4a3a', apron: '#fff6e8', hat: 'chef' } },
  { name: 'Kitsune', species: 'fox', fur: '#ff9a4a', fur2: '#fff4e8', earColor: '#ff8a3a', outfit: { top: 'kimono', topColor: '#6a5ad0', bottomColor: '#3a3060', sash: '#ff5a6a' } },
  { name: 'Pan', species: 'panda', fur: '#fbf8f4', fur2: '#ffffff', outfit: { top: 'shirt', topColor: '#ff7a8a', bottomColor: '#3a3a4a', bottom: 'shorts' } },
  { name: 'Tanu', species: 'tanuki', fur: '#a08070', fur2: '#f0e0d0', fur3: '#4a3a34', earColor: '#4a3a34', outfit: { top: 'gi', topColor: '#4a8a5a', bottomColor: '#3a3a3a', hat: 'leaf' } },
  { name: 'Kero', species: 'frog', fur: '#8ad86a', fur2: '#e8f8c8', outfit: { top: 'shirt', topColor: '#ffd24a', bottomColor: '#4a6ab0', scarf: '#e8503a' } },
  { name: 'Ahiru', species: 'duck', fur: '#fff8ec', fur2: '#ffffff', outfit: { top: 'shirt', topColor: '#6ab0ff', bottomColor: '#ffffff', bottom: 'shorts', hat: 'straw' } },
];

export default async function () {
  await Promise.all([loadRefinedRigs(REFINED_CAST), loadDisneyChewy()]); // &procrigs: procedural skins, &chewy=classic: toon Chewy
  const P = new URLSearchParams(location.search);
  const S = makeStage({ ground: 30, hour: +(P.get('hour') ?? 10), dist: +(P.get('dist') ?? 11), center: [0, 0] });
  const only = P.get('only');
  const actors = [];
  const add = (rig, x, z, face = 0) => {
    rig.root.position.set(x, 0, z); rig.root.rotation.y = face;
    S.scene.add(rig.root);
    const sh = contactShadow(rig.quadruped ? 0.3 : 0.32); sh.position.set(x, 0.02, z); S.scene.add(sh);
    const anim = new Animator(rig);
    actors.push({ rig, anim, sh, x, z, base: new THREE.Vector3(x, 0, z) });
    return anim;
  };
  const face = Math.PI / 4; // towards camera
  const specs = [['chewy', CAST.chewy], ['moka', CAST.moka], ['rosie', CAST.rosie], ...VILLAGER_SPECS.map(s => [s.name.toLowerCase(), s])];
  let i = 0;
  const lineup = only ? specs.filter(([k]) => k === only) : specs;
  for (const [k, spec] of lineup) {
    const rig = k === 'chewy' && disneyReady() ? buildDisneyChewy() : buildHumanoid(spec);
    const col = i % 5, row = Math.floor(i / 5);
    const x = only ? 0 : (col - 2) * 1.3 + row * 0.6, z = only ? 0 : row * 1.5 - 0.6;
    if (k === 'chewy') {
      const sw = new THREE.Mesh(boneSwordGeo(), rig.propMat || rig.mat); sw.castShadow = true;
      sw.rotation.set(Math.PI * 0.62, 0, 0); sw.position.set(0, -0.02, 0.02);
      rig.parts.handR.add(sw); rig.weapon = sw;
    }
    add(rig, x, z, face);
    i++;
  }
  if (!only || only === 'shadow') { const sh = buildBoston(); add(sh, only ? 0 : 1.9, only ? 0 : 1.6, face); }
  const act = P.get('act');
  const walk = P.has('walk');
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
  });
  window.actors = actors; window.stage = S;
  S.ready();
}
