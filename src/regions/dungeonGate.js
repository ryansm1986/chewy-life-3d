// The zone dungeon gate (docs/ZONES.md §2, §8.2 as built; ROADMAP Z-C4). The outdoor boss clearing at the end of a zone's
// trail becomes the gate of its dungeon (a DungeonDef with `gate: true`, dungeon/defs.js):
//  - the region boss no longer spawns outdoors (it waits on the dungeon's floor 2: dungeon/zoneRun.js);
//  - the gate stands on the clearing's far rim, facing the camera, in the zone's own look (./gates/<zone>.js: for the
//    Bamboo Depths a mossy cave mouth in a rock outcrop with bamboo on top, a weathered torii, stone lanterns); a look
//    can name a Blender model (look.glb.url, ROADMAP Z-D6) that replaces the kit gate's own mass when it loads;
//  - it is SEALED until the zone's village is saved (rpg/zones.js villageSaved): a curtain of light across the mouth,
//    paper charms round it and a "!" over it; F says what's needed. 'village:saved' { zone } unseals it live: the
//    charms fly off, the curtain bursts, the lanterns light;
//  - open, F → "Enter <dungeon>" → G.enterDungeon({ id, floor: 1 });
//  - mode.gatePos is where the quest pointer heads (world/story.js placeFor); leaving the dungeon arrives in front of
//    the gate (G._zoneArrive = { zone, gate: true }, RegionMode.start).
// Debug until phase D's siege lands everywhere: ?villagesaved=1 (every zone) or ?villagesaved=bamboo,maple, and the
// console helper G.zoneDebug.saveVillage('bamboo') (saveVillage + the 'village:saved' event).
import * as THREE from 'three';
import { DUNGEONS, ZONE_DUNGEON } from '../dungeon/defs.js';
import { villageSaved, saveVillage } from '../rpg/zones.js';
import { villageOf } from './village/data.js';
import { Placer } from './assets/bambooKit.js';
import { gateLook } from './gates/index.js';
import { loadGlb, glbInstance } from '../gfx/glbAssets.js';
import { paint } from '../gfx/geom.js';
import { makeCanvas } from '../gfx/textures.js';
import { Events } from '../core/events.js';
import { rand, TAU, clamp } from '../core/util.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
/** the gated dungeon of a zone, or null (its boss is still outdoors) */
export function gateDef(zone) { const d = DUNGEONS[ZONE_DUNGEON[zone]]; return d?.gate ? d : null; }

// ------------------------------------------------------------------ the gate
/** Install the zone dungeon's gate in a RegionMode (RegionMode.build, after the world and its interactables). → gate */
export function installGate(mode) {
  const def = gateDef(mode.regionId); if (!def) return null;
  const G = mode.G, W = mode.world, L = mode.layout, zone = mode.regionId, A = L.arena;
  // the region boss moved into the dungeon: no outdoor boss
  L.spawns = L.spawns.filter(sp => !sp.boss);
  L.boss = null;
  // on the clearing's far rim, facing the camera (+x / +z): the dark mouth reads straight on
  const fx = -Math.SQRT1_2, fz = -Math.SQRT1_2, R = A.r + 2.2;
  const gx = A.x + fx * R, gz = A.z + fz * R, rim = W.heightAt(A.x + fx * (A.r - 0.5), A.z + fz * (A.r - 0.5)), yaw = Math.atan2(-fx, -fz);
  const lp = (lx, lz) => [gx + Math.cos(yaw) * lx + Math.sin(yaw) * lz, gz - Math.sin(yaw) * lx + Math.cos(yaw) * lz]; // local → world
  const look = gateLook(zone);
  const main = new Placer({ heightAt: (x, z) => W.heightAt(x, z), name: 'dungeonGateMain' }), dress = new Placer({ heightAt: (x, z) => W.heightAt(x, z), name: 'dungeonGate' });
  const built = look.build({ main, dress, lp, gx, gz, yaw, rim, W, V });
  const lanterns = built.lanterns || [], mouth = built.mouth || { lz: 0.2, w: 2.5, h: 2.7 };
  const gMain = main.build(), gDress = dress.build(); W.scene.add(gMain, gDress);
  W.disposers.push(() => { main.dispose(); dress.dispose(); });
  // the rock blocks: colliders round the gate's mass, the monsters' grid closed under it
  for (const [lx, lz, r] of built.colliders || []) { const [x, z] = lp(lx, lz); W.collision.addCircle(x, z, r); W.blockCells?.(x, z, r * 0.8); }
  // the Blender gate (when the look names one): it takes the kit gate's place once loaded
  if (look.glb?.url) loadGlb(look.glb.url).then(tpl => {
    if (G.dungeon !== mode || !W.scene) return;
    const o = glbInstance(tpl, { outline: true }); o.position.set(gx, rim + (look.glb.y || 0), gz); o.rotation.y = yaw + (look.glb.yaw || 0); o.scale.setScalar(look.glb.scale || 1);
    W.scene.add(o); gMain.visible = false; W.disposers.push(() => o.removeFromParent());
  }).catch(e => console.warn('[gate] model', e));
  // ---- the seal: a curtain of light across the mouth, paper charms round it, a "!" over it
  const [mx, mz] = lp(0, mouth.lz);
  const curtain = new THREE.Mesh(new THREE.PlaneGeometry(mouth.w, mouth.h), sealMat(look.seal || '#d6ff9a'));
  curtain.position.set(mx, rim + mouth.h / 2, mz); curtain.rotation.y = yaw; curtain.renderOrder = 9; W.scene.add(curtain);
  const charms = [];
  { const cg = new THREE.PlaneGeometry(0.16, 0.42); cg.translate(0, -0.21, 0); paint(cg, (p, n, o) => o.set(Math.abs(p.x) < 0.025 && p.y < -0.08 && p.y > -0.34 ? '#c8403a' : '#fffaf0'));
    const cm = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
    for (let k = 0; k < 11; k++) { const a = Math.PI * (0.06 + 0.88 * k / 10), lx = Math.cos(a) * mouth.w * 0.54, ly = Math.sin(a) * mouth.h * 0.57; const m = new THREE.Mesh(cg, cm); const [x, z] = lp(lx, mouth.lz + 0.12); m.position.set(x, rim + 0.25 + ly, z); m.rotation.set(0, yaw, (Math.random() - 0.5) * 0.4); W.scene.add(m); charms.push(m); } }
  const mark = new THREE.Sprite(new THREE.SpriteMaterial({ map: bangTexture(), transparent: true, depthWrite: false, toneMapped: false }));
  mark.scale.set(1.1, 1.1, 1); const markY = rim + Math.max(4.4, mouth.h + 1.7); { const [x, z] = lp(0, 1.4); mark.position.set(x, markY, z); } mark.renderOrder = 20; W.scene.add(mark);
  const sealLight = W.lightPool.addSource({ pos: V(mx, rim + 1.4, mz), color: new THREE.Color(look.sealLight || look.seal || '#c8ffb0'), intensity: look.sealLightI ?? 3.5, radius: 5.5, flicker: 0.25 }); // (a look's sealLight / sealLightI)
  // ---- interaction, the pointer, the arrival
  const [ix, iz] = lp(0, 2.8), [ax, az] = lp(0, 4.6);
  const gate = { def, zone, pos: V(ix, rim, iz), arrival: V(ax, W.heightAt(ax, az), az), sealed: true, k: 0, opening: -1, curtain, charms, mark, lanterns, lit: [], sealLight };
  mode.gatePos = gate.pos;
  const vName = () => villageOf(zone)?.name || 'the village';
  const it = { pos: gate.pos, radius: 1.8,
    get label() { return gate.sealed ? `${def.name}: sealed. Save ${vName()} first` : `Enter ${def.name}`; },
    onInteract: () => {
      if (gate.sealed) { G.ui?.toast?.(`A monster's curse seals the ${def.name}. Drive the siege out of ${vName()} to break it!`, { icon: 'lock', color: '#ffd8a0' }); Events.emit('sfx', 'ui_deny'); return; }
      G.enterDungeon({ id: def.id, floor: 1 });
    } };
  W.interactables.push(it); gate.it = it;
  // already saved: open from the start (no ceremony)
  if (villageSaved(G.state, zone)) openGate(mode, gate, false);
  // the village saved while we're here: the seal breaks live
  const offs = [];
  offs.push(Events.on('village:saved', e => { if (G.dungeon !== mode) return; if (e?.zone === zone && gate.sealed) openGate(mode, gate, true); }));
  W.disposers.push(() => { for (const f of offs) f(); offs.length = 0; });
  (mode.spinners ||= []).push((dt, t) => updateGate(mode, gate, dt, t));
  setTimeout(() => { if (G.dungeon === mode) G.ui?.toast?.(gate.sealed ? `The ${def.name} lie at the end of the trail, sealed…` : `The ${def.name} wait at the end of the trail`, { icon: gate.sealed ? 'lock' : 'map', color: '#c8f0a0' }); }, 3400);
  return gate;
}
function openGate(mode, gate, ceremony) {
  const G = mode.G, W = mode.world;
  gate.sealed = false;
  if (gate.sealLight) { W.lightPool.removeSource(gate.sealLight); gate.sealLight = null; }
  for (const p of gate.lanterns) { gate.lit.push(W.lightPool.addSource({ pos: p.clone().setY(p.y + 0.5), color: new THREE.Color('#ffc27a'), intensity: gateLook(gate.zone).lanternI ?? 4.5, radius: 6, flicker: 0.6 })); } // (a look may soften them: on snow the full pool blows out)
  // a warm glow far in the throat: something waits down there
  gate.inner = W.lightPool.addSource({ pos: gate.pos.clone().add(V(0, 1.2, 0)).lerp(V(gate.curtain.position.x, gate.pos.y + 1.2, gate.curtain.position.z), 1.3), color: new THREE.Color('#ffd8a0'), intensity: 3, radius: 5, flicker: 0.4 });
  if (!ceremony) { gate.curtain.visible = false; for (const c of gate.charms) c.visible = false; gate.mark.visible = false; return; }
  gate.opening = 0;
  Events.emit('sfx', 'portal'); setTimeout(() => Events.emit('sfx', 'ui_quest'), 450);
  const c = gate.curtain.position;
  G.vfx?.light?.(c.clone(), '#eaffc8', 12, 9, 1.0); G.vfx?.ring?.(c.clone().setY(gate.pos.y + 0.1), { color: '#d6ff9a', r0: 0.4, r1: 5, life: 0.9 });
  G.vfx?.sparkle?.(c.clone(), { n: 40, color: '#f0ffc8', r: 1.4, rise: 2 });
  G.engine?.rig?.shake?.(0.25);
  setTimeout(() => G.ui?.banner?.(`The ${gate.def.name} are open!`, `${villageOf(gate.zone)?.name || 'The village'} is free; the seal on the cave is broken`, { style: 'quest' }), 600);
}
function updateGate(mode, gate, dt, t) {
  const G = mode.G;
  if (gate.sealed) { // the curtain breathes, the "!" bobs, motes rise
    gate.curtain.material.uniforms.uT.value = t;
    gate.mark.position.y += (Math.sin(t * 2.4) * 0.12 + (gate.mark.userData.y0 ??= gate.mark.position.y) - gate.mark.position.y) * Math.min(1, dt * 6);
    if (Math.random() < dt * 4) G.vfx?.spark?.spawn?.({ x: gate.curtain.position.x + rand(-1, 1), y: gate.pos.y + rand(0.2, 2.6), z: gate.curtain.position.z + rand(-1, 1), vy: 0.5, life: 1.2, size: 0.16, color: '#e8ffc0', alpha: 0.9, alpha1: 0 });
    for (const [i, c] of gate.charms.entries()) c.rotation.z = Math.sin(t * 1.7 + i) * 0.12;
    return;
  }
  if (gate.opening < 0) return;
  gate.opening += dt;
  const k = gate.opening, cur = gate.curtain;
  cur.material.uniforms.uT.value = t; cur.material.uniforms.uK.value = Math.max(0, 1 - k * 0.9);
  cur.scale.y = 1 + k * 0.6;
  gate.mark.material.opacity = Math.max(0, 1 - k * 2.5); gate.mark.position.y += dt * 2;
  for (const [i, c] of gate.charms.entries()) { // the charms peel off and flutter away
    const d = c.userData.v ||= V(rand(-1.2, 1.2), rand(1.8, 3.2), rand(-0.4, 1.4));
    if (k > i * 0.05) { c.position.addScaledVector(d, dt); d.y -= dt * 0.6; c.rotation.z += dt * (i % 2 ? 4 : -4); c.rotation.x += dt * 2; }
    if (k > 2.2) c.visible = false;
  }
  if (k > 2.4) { cur.visible = false; gate.mark.visible = false; gate.opening = -1; }
}
function sealMat(hex) {
  return new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uK: { value: 1 }, uC: { value: new THREE.Color(hex) } }, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
    vertexShader: 'varying vec2 vU; void main() { vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */`uniform float uT, uK; uniform vec3 uC; varying vec2 vU;
      float h1(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main() {
        vec2 q = vU - vec2(0.5, 0.0); float r = length(q * vec2(1.0, 0.92));
        float arch = smoothstep(0.62, 0.5, r) * smoothstep(0.0, 0.05, vU.y);   // an arch-shaped curtain filling the mouth
        float bands = 0.55 + 0.45 * sin(vU.y * 16.0 - uT * 2.4 + sin(vU.x * 8.0 + uT) * 1.4);
        vec2 g = vec2(vU.x * 16.0, vU.y * 10.0 - uT * 0.7); vec2 gi = floor(g); float sp = step(0.85, h1(gi)) * smoothstep(0.32, 0.0, length(fract(g) - 0.5));
        float ring = smoothstep(0.03, 0.0, abs(r - 0.36 - 0.02 * sin(uT * 2.0))) + smoothstep(0.02, 0.0, abs(r - 0.24));   // the seal glyph's two rings
        float a = arch * (0.16 + 0.2 * bands * (1.0 - vU.y * 0.6) + ring * 0.55) + sp * arch * 0.8;
        gl_FragColor = vec4(uC * a * 0.75 * uK, 0.0);
      }`,
  });
}
let _bang = null;
function bangTexture() { // a cream speech bubble with a red "!"
  if (_bang) return _bang;
  const { c, g } = makeCanvas(128, 128);
  g.fillStyle = 'rgba(74,44,42,0.9)'; g.beginPath(); g.arc(64, 58, 46, 0, TAU); g.fill();
  g.fillStyle = '#fff6e8'; g.beginPath(); g.arc(64, 58, 40, 0, TAU); g.fill();
  g.beginPath(); g.moveTo(54, 94); g.lineTo(64, 116); g.lineTo(74, 94); g.closePath(); g.fill();
  g.fillStyle = '#e8503a'; g.font = 'bold 64px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('!', 64, 60);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return (_bang = t);
}

// ------------------------------------------------------------------ debug (until phase D's siege lands in every zone)
/** ?villagesaved=1 | =bamboo,maple saves those villages at boot; G.zoneDebug.saveVillage(zone) saves one live */
export function installGateDebug(G, params) {
  const saveOne = zone => { const first = saveVillage(G.state, zone); Events.emit('village:saved', { zone, debug: true }); return first; };
  G.zoneDebug = { ...(G.zoneDebug || {}), saveVillage: saveOne, gate: () => G.dungeon?.gate || null };
  const q = params?.get?.('villagesaved');
  if (q != null) for (const z of (q === '' || q === '1' ? Object.keys(G.state.zones || {}) : q.split(','))) if (G.state.zones?.[z]) saveVillage(G.state, z);
}
