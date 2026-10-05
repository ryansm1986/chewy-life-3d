// Furniture review sheets (docs/HOUSING.md, the 9/10 model bar).
//   /?test=furnsheet                      every catalog item alone: 3/4 view, studio-lit with the game's toon materials,
//                                         ~260 px cells in a grid with names (&set=tea, &cat=wall, &ids=a,b, &cols=8,
//                                         &size=260, &night = lamps lit)
//   /?test=furnsheet&vignette=basics      a set staged in a corner of a real room (InteriorWorld: the shell, the light
//                                         rig, the instanced furniture), &hour=21 for the evening, &all for every set
import * as THREE from 'three';
import { Engine } from '../core/engine.js';
import { makeToon, U } from '../gfx/materials.js';
import { setNightAll } from '../world/buildings/index.js';
import { FURNITURE, FURNITURE_IDS, SETS, CELL, footprint } from '../home/furniture.js';
import { furnitureGroup, furnitureTemplate } from '../home/furnitureMesh.js';
import { InteriorWorld, ORIGIN } from '../home/interiorWorld.js';
import { VFX } from '../gfx/vfx.js';

const P = new URLSearchParams(location.search);

export default function () {
  if (P.has('vignette')) return vignette(P.get('vignette'));
  return sheet();
}

// ------------------------------------------------------------------ the catalog sheet
function sheet() {
  const engine = new Engine(), R = engine.renderer;
  R.domElement.style.display = 'none';
  const ids = (P.get('ids')?.split(',') || FURNITURE_IDS).filter(id => FURNITURE[id] && (!P.get('set') || FURNITURE[id].set === P.get('set')) && (!P.get('cat') || FURNITURE[id].cat === P.get('cat')));
  const S = +(P.get('size') || 260), cols = +(P.get('cols') || Math.min(8, Math.ceil(Math.sqrt(ids.length * 1.5)))), rows = Math.ceil(ids.length / cols), LH = 34;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#fbf4ff', '#c8b090', 1.35));
  const key = new THREE.DirectionalLight('#fff3e0', 2.3); key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02; key.shadow.radius = 4;
  scene.add(key, key.target);
  const rim = new THREE.DirectionalLight('#ffd8f0', 0.9); rim.position.set(-4, 3, -3); scene.add(rim);
  const groundMat = makeToon({ color: '#f3e3cc', brush: 0.08, rim: 0 });
  const ground = new THREE.Mesh(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2), groundMat); ground.receiveShadow = true; scene.add(ground);
  const wallMat = makeToon({ color: '#fff3e0', brush: 0.1, rim: 0.1 });
  const wall = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.1), wallMat); wall.receiveShadow = true; wall.castShadow = false; scene.add(wall);
  const table = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.32, 0.18, 32), makeToon({ color: '#c98f5e', brush: 0.12 })); table.receiveShadow = true; scene.add(table);
  const cam = new THREE.PerspectiveCamera(22, 1, 0.05, 100);
  const rt = new THREE.WebGLRenderTarget(S * 2, S * 2, { samples: 4, colorSpace: THREE.SRGBColorSpace });
  const canvas = document.createElement('canvas'); canvas.width = cols * S; canvas.height = rows * (S + LH);
  canvas.style.cssText = 'display:block;margin:0;background:#fbf2e4'; document.body.style.margin = '0'; document.body.style.background = '#fbf2e4';
  document.body.appendChild(canvas);
  const g = canvas.getContext('2d'), tmp = document.createElement('canvas'); tmp.width = tmp.height = S * 2;
  const tg = tmp.getContext('2d'), px = new Uint8Array(S * S * 16);
  setNightAll(P.has('night') ? 1 : 0); U.uNight.value = 0; U.uOccl.value.set(-9999, -9999, 1, 0); U.uCloudShadow.value = 0; U.uWindStr.value = 0.15;
  U.uSunDir.value.set(0.55, 0.9, 0.7).normalize();
  const info = {};
  ids.forEach((id, i) => {
    const d = FURNITURE[id], grp = furnitureGroup(id), t = furnitureTemplate(id);
    grp.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    scene.add(grp);
    const wallItem = d.mount === 'wall', tableItem = d.mount === 'table', ceil = d.mount === 'ceiling';
    const yBase = tableItem ? 0.18 : ceil ? 0.6 : 0;
    grp.position.set(0, yBase, 0);
    grp.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(grp), sph = box.getBoundingSphere(new THREE.Sphere());
    ground.scale.setScalar(Math.max(0.8, sph.radius * 1.9)); ground.visible = !ceil;
    wall.visible = wallItem; table.visible = tableItem;
    if (wallItem) { wall.scale.set(Math.max(1.2, (box.max.x - box.min.x) + 0.8), Math.max(1.2, box.max.y + 0.4), 1); wall.position.set(0, wall.scale.y / 2 - 0.02, -0.05); }
    const dir = wallItem ? new THREE.Vector3(0.6, 0.42, 1.2).normalize() : new THREE.Vector3(1, 0.95, 1.15).normalize();
    const r = Math.max(sph.radius, 0.22);
    cam.position.copy(sph.center).addScaledVector(dir, r / Math.sin(THREE.MathUtils.degToRad(11)) * 1.02); cam.lookAt(sph.center);
    key.position.copy(sph.center).add(new THREE.Vector3(2.2, 4, 3)); key.target.position.copy(sph.center); key.target.updateMatrixWorld();
    const sc = key.shadow.camera, e = Math.max(1, r * 2.2); sc.left = -e; sc.right = e; sc.top = e; sc.bottom = -e; sc.near = 0.1; sc.far = 20; sc.updateProjectionMatrix();
    R.setRenderTarget(rt); R.setClearColor(0x000000, 0); R.clear(); R.render(scene, cam);
    R.readRenderTargetPixels(rt, 0, 0, S * 2, S * 2, px);
    R.setRenderTarget(null);
    scene.remove(grp);
    const img = tg.createImageData(S * 2, S * 2);
    for (let y = 0; y < S * 2; y++) img.data.set(px.subarray((S * 2 - 1 - y) * S * 8, (S * 2 - y) * S * 8), y * S * 8);
    tg.putImageData(img, 0, 0);
    const cx = (i % cols) * S, cy = Math.floor(i / cols) * (S + LH);
    const set = SETS[d.set];
    g.fillStyle = (Math.floor(i / cols) + i) % 2 ? '#fff8ee' : '#fdf0e2'; g.fillRect(cx, cy, S, S + LH);
    g.drawImage(tmp, cx, cy, S, S);
    g.fillStyle = set.color; g.fillRect(cx, cy + S, S, 4);
    g.fillStyle = '#4a2c2a'; g.font = '700 15px system-ui'; g.textAlign = 'center'; g.fillText(d.name, cx + S / 2, cy + S + 20);
    g.fillStyle = '#9a7a70'; g.font = '600 10px system-ui'; g.fillText(`${id} · ${Math.round(t.tris)} tris`, cx + S / 2, cy + S + 31);
    info[id] = Math.round(t.tris);
  });
  window.__info = { items: ids.length, size: [canvas.width, canvas.height], tris: info };
  setTimeout(() => { window.__ready = true; }, 100);
}

// ------------------------------------------------------------------ a set staged in a room corner
// cells: a 9 x 8 corner room (north and west back walls); each set lists [id, x, z, rot] or [id, 'w', side, x, z, y]
// ('c', x, z: a ceiling lamp; 't', x, z, rot: a tabletop piece on whatever stands there). &close frames the north-west corner.
const STAGES = {
  basics: { wall: 'wp_plaster', floor: 'fl_planks', items: [['futonBed', 0, 0, 0], ['treasureChest', 1, 3, 0], ['pupBasket', 4, 0, 0], ['ragRug', 3, 3, 0], ['chabudai', 4, 4, 0], ['zabutonPink', 3, 5, 0], ['zabutonBlue', 6, 4, 0], ['teaSet', 't', 4, 4, 4], ['andonLamp', 0, 6, 0], ['bookshelf', 6, 0, 0], ['pottedFern', 8, 0, 0], ['paperPendant', 'c', 4, 4], ['packPhoto', 'w', 'n', 5, 0, 1.3], ['cuckooClock', 'w', 'w', 0, 4, 1.1], ['wallShelf', 'w', 'n', 1, 0, 1.4], ['armchair', 7, 5, 3], ['sideTable', 7, 3, 0], ['mushroomLamp', 't', 7, 3, 0]] },
  kitchen: { wall: 'wp_dots', floor: 'fl_checker', items: [['tileMat', 0, 0, 0], ['kitchenCounter', 0, 0, 0], ['kitchenStove', 2, 0, 0], ['kitchenCounter', 4, 0, 0], ['plateRack', 'w', 'n', 0, 0, 1.25], ['fruitBowl', 't', 4, 0, 0], ['woodTable', 3, 4, 0], ['woodChair', 3, 3, 0], ['woodChair', 5, 6, 2], ['flowerVase', 't', 4, 4, 4], ['bookStack', 't', 5, 4, 5], ['wardrobe', 7, 0, 0], ['succulent', 't', 4, 5, 4], ['tansu', 0, 4, 3], ['teaSet', 't', 0, 4, 4]] },
  tea: { wall: 'wp_asanoha', floor: 'fl_tatami', items: [['tatamiMat', 2, 3, 0], ['byobu', 0, 0, 0], ['ikebana', 4, 0, 0], ['bonsaiStand', 6, 0, 0], ['hangingScroll', 'w', 'n', 5, 0, 1.1], ['irori', 3, 4, 0], ['zabutonBlue', 2, 4, 0], ['zabutonPink', 5, 5, 0], ['tansu', 0, 3, 3], ['teaSet', 't', 0, 3, 4], ['andonLamp', 0, 6, 0]] },
  bamboo: { wall: 'wp_asanoha', floor: 'fl_planks', items: [['bambooPlanter', 0, 0, 0], ['bambooBench', 1, 0, 0], ['bambooLantern', 4, 0, 0], ['bambooPlanter', 5, 0, 0], ['zabutonBlue', 2, 2, 0], ['sideTable', 1, 2, 0], ['succulent', 't', 1, 2, 4], ['pottedFern', 0, 2, 0], ['bambooLantern', 0, 4, 0], ['tatamiMat', 2, 3, 0], ['zabutonPink', 3, 3, 0], ['wallShelf', 'w', 'n', 6, 0, 1.4], ['packPhoto', 'w', 'w', 0, 2, 1.3]] },
  maple: { wall: 'wp_maple', floor: 'fl_planks', items: [['mapleRug', 1, 1, 0], ['acornStool', 1, 2, 0], ['acornStool', 3, 2, 0], ['sideTable', 2, 1, 0], ['fruitBowl', 't', 2, 1, 2], ['mapleWreath', 'w', 'n', 5, 0, 1.2], ['mapleWreath', 'w', 'w', 0, 3, 1.2], ['armchair', 4, 0, 2], ['bookshelf', 6, 0, 0], ['andonLamp', 0, 0, 0], ['pottedFern', 0, 4, 0], ['cuckooClock', 'w', 'n', 1, 0, 1.25]] },
  tide: { wall: 'wp_waves', floor: 'fl_planks', items: [['waveRug', 1, 2, 0], ['fishTank', 0, 0, 0], ['glassFloats', 'w', 'n', 5, 0, 1.3], ['sideTable', 2, 2, 0], ['shellLamp', 't', 2, 2, 2], ['goldfishBowl', 't', 0, 0, 0], ['woodChair', 3, 3, 3], ['tansu', 3, 0, 0], ['shellLamp', 't', 4, 0, 0], ['zabutonBlue', 1, 3, 0], ['pottedFern', 5, 0, 0], ['packPhoto', 'w', 'w', 0, 2, 1.3]] },
  onsen: { wall: 'wp_wood', floor: 'fl_stone', items: [['onsenNoren', 'w', 'n', 1, 0, 1.0], ['cypressBucket', 1, 1, 0], ['cypressBucket', 4, 0, 0], ['tatamiMat', 1, 3, 0], ['zabutonBlue', 2, 3, 0], ['zabutonPink', 3, 3, 0], ['bambooPlanter', 0, 0, 0], ['andonLamp', 5, 0, 0], ['tansu', 0, 2, 3], ['teaSet', 't', 0, 2, 4], ['bonsaiStand', 0, 5, 0], ['hangingScroll', 'w', 'w', 0, 4, 1.1]] },
  festival: { wall: 'wp_stripes', floor: 'fl_planks', items: [['taikoDrum', 0, 0, 0], ['festivalLantern', 'c', 2, 1], ['festivalLantern', 'c', 4, 2], ['sideTable', 3, 0, 0], ['daruma', 't', 3, 0, 3], ['sideTable', 0, 3, 0], ['goldfishBowl', 't', 0, 3, 5], ['zabutonPink', 2, 3, 0], ['zabutonBlue', 3, 3, 0], ['ragRug', 1, 2, 0], ['chabudai', 2, 2, 0], ['teaSet', 't', 2, 2, 0], ['packPhoto', 'w', 'n', 4, 0, 1.3], ['wallShelf', 'w', 'w', 0, 1, 1.4], ['pottedFern', 5, 0, 0]] },
  // phase 2: the villagers' own pieces (each helper may move its own stage's entries), the workshop and the finds
  kuma: { wall: 'wp_plaster', floor: 'fl_checker', items: [['tileMat', 0, 0, 0], ['kitchenStove', 0, 0, 0], ['kitchenCounter', 2, 0, 0], ['breadShelf', 4, 0, 0], ['flourSacks', 0, 2, 0], ['fruitBowl', 't', 2, 0, 0], ['woodTable', 2, 3, 0], ['woodChair', 2, 5, 2], ['melonStool', 1, 4, 0], ['flowerVase', 't', 3, 3, 0], ['plateRack', 'w', 'n', 4, 0, 1.55], ['paperPendant', 'c', 3, 3]] },
  mochi: { wall: 'wp_dots', floor: 'fl_planks', items: [['catTower', 0, 0, 0], ['artEasel', 2, 1, 0], ['sideTable', 4, 1, 0], ['paintPots', 't', 4, 1, 0], ['zabutonPink', 2, 3, 0], ['ragRug', 1, 2, 0], ['packPhoto', 'w', 'n', 5, 0, 1.3], ['pottedFern', 6, 0, 0], ['sideTable', 5, 3, 0], ['mushroomLamp', 't', 5, 3, 0], ['wallShelf', 'w', 'w', 0, 2, 1.4]] },
  pan: { wall: 'wp_wood', floor: 'fl_tatami', items: [['napPillow', 1, 1, 0], ['bambooPlanter', 0, 0, 0], ['sideTable', 3, 1, 0], ['pandaPlush', 't', 3, 1, 0], ['bambooLantern', 0, 3, 0], ['zabutonBlue', 3, 3, 0], ['tatamiMat', 1, 4, 0], ['hangingScroll', 'w', 'n', 5, 0, 1.1]] },
  usagi: { wall: 'wp_sakura', floor: 'fl_planks', items: [['plantStand', 0, 0, 0], ['pottedFern', 1, 0, 0], ['hangingPlanter', 'c', 2, 2], ['sideTable', 2, 1, 0], ['flowerVase', 't', 2, 1, 0], ['bambooPlanter', 4, 0, 0], ['plantStand', 0, 2, 1], ['succulent', 't', 2, 1, 0], ['zabutonPink', 2, 3, 0], ['wallShelf', 'w', 'n', 5, 0, 1.4]] },
  tanu: { wall: 'wp_wood', floor: 'fl_walnut', items: [['curioCabinet', 0, 0, 0], ['tanukiStatue', 2, 0, 0], ['sideTable', 3, 1, 0], ['luckyCat', 't', 3, 1, 0], ['tansu', 4, 0, 0], ['daruma', 't', 5, 0, 0], ['yokaiLantern', 0, 3, 0], ['ragRug', 1, 2, 0], ['zabutonBlue', 2, 3, 0], ['cuckooClock', 'w', 'w', 0, 2, 1.15]] },
  kitsune: { wall: 'wp_asanoha', floor: 'fl_tatami', items: [['kamidana', 'w', 'n', 1, 0, 1.18], ['foxStatue', 0, 0, 0], ['foxStatue', 3, 0, 0], ['byobu', 0, 3, 1], ['sideTable', 2, 1, 0], ['incenseBurner', 't', 2, 1, 0], ['andonLamp', 4, 0, 0], ['zabutonBlue', 2, 3, 0], ['hangingScroll', 'w', 'n', 5, 0, 1.1], ['ikebana', 6, 0, 0]] },
  kero: { wall: 'wp_waves', floor: 'fl_stone', items: [['lilyTub', 0, 0, 0], ['fishTank', 2, 0, 0], ['sideTable', 4, 1, 0], ['frogFountain', 't', 4, 1, 0], ['waveRug', 1, 3, 0], ['glassFloats', 'w', 'n', 5, 0, 1.3], ['zabutonBlue', 2, 4, 0], ['sideTable', 5, 3, 0], ['shellLamp', 't', 5, 3, 0], ['bambooPlanter', 6, 0, 0]] },
  workshop: { wall: 'wp_wood', floor: 'fl_planks', items: [['workbench', 0, 0, 0], ['melonStool', 1, 2, 0], ['pumpkinLamp', 3, 0, 0], ['flourSacks', 4, 0, 0], ['bookshelf', 5, 0, 0], ['sideTable', 0, 3, 0], ['bookStack', 't', 0, 3, 0], ['ragRug', 1, 3, 0]] },
  finds: { wall: 'wp_stripes', floor: 'fl_planks', items: [['yokaiLantern', 0, 0, 0], ['tanukiStatue', 2, 0, 0], ['sideTable', 3, 0, 0], ['luckyCat', 't', 3, 0, 0], ['pumpkinLamp', 4, 0, 0], ['sideTable', 0, 2, 0], ['frogFountain', 't', 0, 2, 0], ['hangingPlanter', 'c', 1, 3], ['zabutonPink', 2, 2, 0], ['tansu', 5, 0, 0], ['pandaPlush', 't', 5, 0, 0]] },
};
function vignette(which) {
  const engine = new Engine(), W = new InteriorWorld(engine);
  engine.setWorld(W);
  const layout = { id: 'stage', name: 'Stage', rooms: [{ x: 0, z: 0, w: 9, d: 8 }], door: { side: 's', at: 6, w: 2 }, windows: [{ side: 'n', at: 3, w: 1, y: 1.05, h: 0.75, kind: 'round' }, { side: 'w', at: 6, w: 1, y: 1.05, h: 0.75, kind: 'shoji' }] };
  const st = STAGES[which] || STAGES.basics, items = [];
  let k = 1;
  for (const e of st.items) {
    if (e[1] === 'w') items.push({ k: k++, id: e[0], mount: 'wall', side: e[2], x: e[3], z: e[4], y: e[5] });
    else if (e[1] === 'c') items.push({ k: k++, id: e[0], mount: 'ceiling', x: e[2], z: e[3], rot: 0 });
    else if (e[1] === 't') { const host = [...items].reverse().find(h => FURNITURE[h.id]?.surface && e[2] >= h.x && e[3] >= h.z && e[2] < h.x + footprint(FURNITURE[h.id], h.rot)[0] && e[3] < h.z + footprint(FURNITURE[h.id], h.rot)[1]); items.push({ k: k++, id: e[0], mount: 'table', on: host?.k || 0, x: e[2], z: e[3], rot: 0 }); }
    else items.push({ k: k++, id: e[0], mount: FURNITURE[e[0]].mount === 'rug' ? 'rug' : 'floor', x: e[1], z: e[2], rot: e[3] || 0 });
  }
  const vfx = new VFX(engine, W.scene); vfx.setLightPool(W.lightPool);
  W.load({ layout, interior: { wall: st.wall, floor: st.floor, items }, vfx });
  const hour = +(P.get('hour') ?? 11), night = hour >= 20 || hour < 5 ? 1 : hour >= 18.5 ? 0.6 : 0;
  W.applyLight(night); setNightAll(night);
  U.uCloudShadow.value = 0; U.uWindStr.value = 0.12; U.uNight.value = night * 0.45;
  const post = engine.post, gr = post.grade.uniforms;
  gr.get('uLift').value.set(0.016, 0.008, 0.02); gr.get('uGain').value.set(1.02, 1, 0.97); gr.get('uSat').value = 1.04; gr.get('uVigColor').value.set(0.32, 0.2, 0.22); gr.get('uVignette').value = 1.1;
  post.bloom.intensity = 0.7 + night * 0.45; post.bloom.luminanceMaterial.threshold = 0.82 - night * 0.22; post.tilt.focusArea = 0.9; post.tilt.feather = 0.28;
  const rig = engine.rig; rig.minDist = 4; rig.maxDist = 60;
  const close = P.has('close'); // (&close: the room corner, up close)
  rig.yawTarget = rig.yaw = +(P.get('yaw') ?? Math.PI / 4); rig.pitch = +(P.get('pitch') ?? (close ? 0.55 : 0.62)); rig.distTarget = +(P.get('dist') ?? (close ? 7.2 : 13));
  rig.focus.set(ORIGIN + +(P.get('fx') ?? (close ? 1.45 : 2.1)), +(P.get('fy') ?? (close ? 0.85 : 0.7)), ORIGIN + +(P.get('fz') ?? (close ? 1.35 : 1.9))); rig.snap();
  function frame() {
    const dt = engine.tick();
    rig.update(dt); W.updateSun(); W.lightPool.update(dt, rig.target, engine.time, 0.3 + 0.7 * night); W.update(dt, engine.time); vfx.update(dt);
    engine.render(); requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  window.__info = { set: which, items: items.length, draws: W.batches.map.size }; window.__W = W; window.__E = engine;
  setTimeout(() => { window.__ready = true; }, 600);
}
