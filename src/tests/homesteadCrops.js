// /?test=homestead&view=crops : every crop at every growth stage on its soil mound (columns: seed, sprout, young, ripe;
// the 5th column is wet soil), Chewy's bed frame, the Seed Stall and the Sprinkler, drawn with the in-game garden
// materials (life/garden.js GardenView). &only=crop  &dist=  &yaw=  &pitch=  &hour=
import * as THREE from 'three';
import { makeStage } from './_stage.js';
import { CROP_IDS } from '../life/pantry.js';
import { GardenView } from '../life/garden.js';
import { STAGES, bedFrameGeo, seedStallTemplate, sprinkler } from '../life/gardenModels.js';
import { Builder, instantiate, MATS } from '../world/buildings/kit.js';
import { FISH_IDS } from '../life/fishData.js';
import { fishGeo, rodGeo, bobberGeo, iceHoleGeo } from '../life/fishModels.js';

export function crops(P) {
  const only = P.get('only'), list = only ? only.split(',') : CROP_IDS;
  const S = makeStage({ ground: 60, hour: 10, center: [2, list.length * 0.6], dist: +(P.get('dist') || 16), groundColor: '#8fcf6a' });
  const view = new GardenView(S.scene, list.length * 5);
  list.forEach((c, r) => {
    STAGES.forEach((s, k) => view.set(r * 5 + k, k * 1.15, 0, r * 1.25, 0, { soil: true, wet: k === 1, crop: c, stage: s }));
    view.set(r * 5 + 4, 4 * 1.15, 0, r * 1.25, 0, { soil: true, wet: true });
  });
  const bed = new THREE.Mesh(bedFrameGeo(4, 3).body, MATS().body); bed.position.set(9, 0, 2); S.scene.add(bed);
  const stall = instantiate(seedStallTemplate()); stall.group.position.set(9, 0, 7); S.scene.add(stall.group);
  const B = new Builder(7); sprinkler(B); const sp = instantiate(B.finish()); sp.group.position.set(6.5, 0, 6.5); S.scene.add(sp.group);
  S.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  window.__info = { tiles: list.length * 5 };
  S.ready();
}

// /?test=homestead&view=fish : the 15 catch models (5 a row, at their in-game catch scale ×1.6), the Bamboo and Moonlit
// rods, the float and the ice-fishing hole. &dist= &hour=
export function fish(P) {
  const S = makeStage({ ground: 40, hour: 10, center: [2.4, 1.6], dist: +(P.get('dist') || 7.5), groundColor: '#bfe6f0' });
  const add = (g, x, y, z, ry = 0, s = 1) => { const m = new THREE.Mesh(g, MATS().body); m.position.set(x, y, z); m.rotation.y = ry; m.scale.setScalar(s); S.scene.add(m); return m; };
  FISH_IDS.forEach((id, i) => add(fishGeo(id), (i % 5) * 1.2, 0.35, Math.floor(i / 5) * 1.0, Math.PI / 2, 1.6));
  add(rodGeo(1), -1.2, 0.05, 0.2, 0.3); add(rodGeo(2), -1.6, 0.05, 0.4, 0.3);
  add(bobberGeo(), -1.0, 0.08, 2.2, 0, 2); add(iceHoleGeo(), 5.8, 0.01, 2.2, 0, 1.4);
  S.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  window.__info = { fish: FISH_IDS.length };
  S.ready();
}
