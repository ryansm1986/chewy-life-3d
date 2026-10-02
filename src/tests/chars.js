// Character lineup test: /?test=chars[&act=swing][&walk=1][&only=chewy][&dist=8]
//   &hats: every species x hat;  &folk=12[&seed=7]: a grid of random townsfolk (roster.randomVillagerSpec) instead of the cast; &kit=toy|disney|classic
import * as THREE from 'three';
import { makeStage } from './_stage.js';
import { buildHumanoid, buildBoston, CAST, REFINED_CAST, boneSwordGeo, tennisBall, contactShadow } from '../actors/charKit.js';
import { Animator } from '../actors/animator.js';
import { makeToon } from '../gfx/materials.js';
import { loadRefinedRigs } from '../actors/refinedRigs.js';
import { loadDisneyChewy, disneyReady, buildDisneyChewy } from '../actors/disneyChewy.js';
import { loadHeroModel, heroModelReady, buildHeroModel } from '../actors/heroModels.js';
import { VILLAGERS, randomVillagerSpec } from '../actors/roster.js';

// the named villagers (roster.js) plus a duck and a dog, the townsfolk species without a named villager
export const VILLAGER_SPECS = [
  ...VILLAGERS.map(v => v.spec),
  { name: 'Ahiru', species: 'duck', fur: '#fff8ec', fur2: '#ffffff', outfit: { top: 'shirt', topColor: '#6ab0ff', bottomColor: '#ffffff', bottom: 'shorts', hat: 'straw' } },
  { name: 'Shiba', species: 'dog', fur: '#e8c89a', fur2: '#fff8f0', outfit: { top: 'gi', topColor: '#ff8fb0', bottomColor: '#4a4a6a', sash: '#ffd24a' } },
];

export default async function () {
  await Promise.all([loadRefinedRigs(REFINED_CAST), loadDisneyChewy(), loadHeroModel('shadow'), loadHeroModel('rosie'), loadHeroModel('moka')]); // &procrigs: procedural skins, &chewy=classic: toon Chewy
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
  const face = Math.PI / 4 + +(P.get('face') ?? 0); // towards camera (&face=0.6: a three-quarter view, 1.57 the side)
  const folk = +(P.get('folk') || 0);
  let seed = +(P.get('seed') || 7); const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const hats = P.has('hats'); // &hats: every species x every hat (ear-aware hat placement check)
  const HAT_KINDS = ['straw', 'beret', 'flower', 'bandana', 'leaf', 'chef'], SPC = ['cat', 'fox', 'bunny', 'dog', 'bear', 'panda', 'tanuki', 'frog', 'duck'];
  const FURC = { cat: '#ffd8a8', fox: '#ff9a4a', bunny: '#ffffff', dog: '#e8c89a', bear: '#a86a44', panda: '#fbf8f4', tanuki: '#a08070', frog: '#8ad86a', duck: '#fff8ec' };
  const specs = hats ? HAT_KINDS.flatMap(h => SPC.map(sp => [`${sp}-${h}`, { name: sp, species: sp, fur: FURC[sp], fur2: '#fff8f0', ...(sp === 'tanuki' ? { fur3: '#4a3a34', earColor: '#4a3a34' } : {}), outfit: { top: 'shirt', topColor: '#8fd0ff', bottomColor: '#4a4a6a', hat: h, hatColor: '#ff8fb0' } }]))
    : folk ? Array.from({ length: folk }, (_, i) => { const s = randomVillagerSpec(rand); return [`folk${i}`, s]; })
    : [['chewy', CAST.chewy], ['moka', CAST.moka], ['rosie', CAST.rosie], ...VILLAGER_SPECS.map(s => [s.name.toLowerCase(), s])];
  if (folk) window.folkSpecs = specs.map(([, s]) => `${s.name} ${s.species} ${s.outfit.top}${s.outfit.hat ? ' +' + s.outfit.hat : ''}${s.outfit.scarf ? ' +scarf' : ''}${s.outfit.bag ? ' +bag' : ''}${s.outfit.bottom ? ' ' + s.outfit.bottom : ''}`);
  let i = 0;
  const lineup = only ? specs.filter(([k]) => k === only) : specs;
  for (const [k, spec] of lineup) {
    const rig = (k === 'rosie' || k === 'moka') && heroModelReady(k) ? buildHeroModel(k) : k === 'chewy' && disneyReady() ? buildDisneyChewy() : buildHumanoid(spec);
    const cols = hats ? 9 : folk ? 4 : 5, col = i % cols, row = Math.floor(i / cols);
    const x = only ? 0 : hats ? (col - 4) * 0.95 : folk ? (col - 1.5) * 1.1 : (col - 2) * 1.3 + row * 0.6, z = only ? 0 : hats ? row * 1.1 - 2.75 : folk ? row * 1.3 - 1.3 : row * 1.5 - 0.6;
    if (k === 'chewy') {
      const sw = new THREE.Mesh(boneSwordGeo(), rig.propMat || rig.mat); sw.castShadow = true;
      sw.rotation.set(Math.PI * 0.62, 0, 0); sw.position.set(0, -0.02, 0.02);
      rig.parts.handR.add(sw); rig.weapon = sw;
    }
    add(rig, x, z, face);
    i++;
  }
  if (!folk && !hats && (!only || only === 'shadow')) { const sh = heroModelReady('shadow') ? buildHeroModel('shadow') : buildBoston(); add(sh, only ? 0 : 1.9, only ? 0 : 1.6, face); }
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
