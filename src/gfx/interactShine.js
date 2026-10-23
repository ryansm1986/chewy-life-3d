// The interact shine: what F (or a click) would use glows, as in most games. A soft light outline round the silhouette,
// a warm rim and a band of light that sweeps across it every second or so. Each of the object's meshes gets two copies
// that share its geometry, skeleton and morphs, drawn with a copy of its own material (so the toon shader's wind sway,
// alpha cut-outs and skinning still apply and the copy fits exactly) whose output is swapped for the glow: an additive
// pass over the front faces and an inverted hull (the back faces pushed out a few pixels) for the outline. Used for the
// interactable in F's reach and the one under the mouse (game.js handleInput). Something with no meshes to glow gets a
// twinkling star instead.
//
// Which meshes: an interactable's `actor` (a villager: its rig), its `obj` (an Object3D, a list, an InstancedMesh part
// { inst, i, matrix } or a BatchedMesh instance { batch, id }, set by whoever made it), else the props found around its
// position (findProp): the nearest prop-sized mesh or instance, grown to its group while the group stays prop-sized; a
// building's interactable looks only at buildings (a notice board glows, a house's door gets the star). `obj: null`
// gives the star only; `noShine: true` nothing. Docs: ARCHITECTURE "The interact shine".
import * as THREE from 'three';

const COL = new THREE.Color('#fff0c4'), LINE = new THREE.Color('#ffdf7e');
const SWEEP = new THREE.Vector3(0.55, 1, 0.35).normalize(); // (the band runs up and across, diagonally)
const MAX_XZ = 3.4, MAX_Y = 4.2; // a prop, not a building or the ground
const LIT = m => m && (m.isMeshToonMaterial || m.isMeshStandardMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial);

// the glow, written over the copied material's output (its `normal` and vViewPosition are in scope at the end of main)
const SHINE_PARS = /* glsl */'uniform vec3 uShCol; uniform float uShAmt; uniform float uShPhase; uniform vec2 uShSpan; uniform vec3 uShDir; uniform mat4 uShCam;\n';
const SHINE_OUT = /* glsl */`
  {
    vec3 shV = normalize(vViewPosition);
    float shRim = pow(1.0 - clamp(abs(dot(normalize(normal), shV)), 0.0, 1.0), 2.4);
    float shS = dot((uShCam * vec4(-vViewPosition, 1.0)).xyz, uShDir), shW = max(0.12, (uShSpan.y - uShSpan.x) * 0.16);
    float shC = mix(uShSpan.x - shW * 2.0, uShSpan.y + shW * 2.0, uShPhase);
    float shBand = smoothstep(shW, 0.0, abs(shS - shC));
    gl_FragColor = vec4(uShCol * (0.07 + shRim * 0.85 + shBand * 0.8) * uShAmt, 1.0);
  }
`;
const HULL_VPARS = /* glsl */'uniform float uShPx; uniform vec2 uShRes;\n';
const HULL_VOUT = /* glsl */`
  { vec4 shN = projectionMatrix * vec4(transformedNormal, 0.0);
    #ifdef FLIP_SIDED
      shN = -shN; // (a back-side material's normals come flipped: push outward, not into the object)
    #endif
    if (dot(shN.xy, shN.xy) > 1e-8) gl_Position.xy += normalize(shN.xy) * uShPx * 2.0 / uShRes * gl_Position.w; }
`;
const HULL_FPARS = /* glsl */'uniform vec3 uShLine; uniform float uShAmt;\n';
const HULL_FOUT = /* glsl */'  gl_FragColor = vec4(uShLine, uShAmt);\n';
const atEnd = (src, code) => src.replace(/\}\s*$/, code + '}\n');

function copyOf(src, uni, hull) {
  // (not src.clone(): Material.copy deep-copies userData through JSON, and a toon material's userData holds its depth
  //  material, whose textures then serialise to data URLs: 100+ ms a villager)
  const ud = src.userData; src.userData = {};
  let m; try { m = new src.constructor().copy(src); } finally { src.userData = ud; }
  const before = src.onBeforeCompile, key = src.customProgramCacheKey();
  m.onBeforeCompile = (sh, r) => {
    before.call(src, sh, r);
    Object.assign(sh.uniforms, uni);
    if (hull) {
      sh.vertexShader = HULL_VPARS + atEnd(sh.vertexShader, HULL_VOUT);
      sh.fragmentShader = HULL_FPARS + atEnd(sh.fragmentShader, HULL_FOUT);
    } else sh.fragmentShader = SHINE_PARS + atEnd(sh.fragmentShader, SHINE_OUT);
  };
  m.customProgramCacheKey = () => key + (hull ? '|shineHull' : '|shine');
  m.transparent = true; m.depthWrite = false; m.fog = false;
  if (hull) { m.side = THREE.BackSide; m.blending = THREE.NormalBlending; }
  else { m.blending = THREE.AdditiveBlending; m.depthFunc = THREE.LessEqualDepth; m.polygonOffset = true; m.polygonOffsetFactor = -1; m.polygonOffsetUnits = -1; }
  return m;
}

// an unlit material (no normal to rim): a plain additive tint over it
function tintOf(src, uni) {
  const m = new THREE.MeshBasicMaterial({ color: COL, map: src.map || null, alphaMap: src.alphaMap || null, alphaTest: src.alphaTest || 0, side: src.side, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, depthFunc: THREE.LessEqualDepth, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1, fog: false });
  m.onBeforeCompile = sh => { Object.assign(sh.uniforms, uni); sh.fragmentShader = 'uniform float uShAmt;\n' + atEnd(sh.fragmentShader, '  gl_FragColor.rgb *= 0.35 * uShAmt;\n'); };
  m.customProgramCacheKey = () => 'shineTint';
  return m;
}

// the twinkle: a soft four-point star (canvas texture, made once)
let starTex = null;
function star() {
  if (!starTex) {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 30); grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.18, 'rgba(255,246,214,.75)'); grd.addColorStop(1, 'rgba(255,240,196,0)');
    g.fillStyle = grd; g.beginPath();
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, r = i % 2 ? 7 : 31; g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r); }
    g.closePath(); g.fill();
    starTex = new THREE.CanvasTexture(c); starTex.colorSpace = THREE.SRGBColorSpace;
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTex, color: COL, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false }));
  s.renderOrder = 20; s.userData.noShine = true;
  return s;
}

const _b = new THREE.Box3(), _c = new THREE.Vector3();
const meshBox = (m, out) => {
  if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
  return out.copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld);
};
const mats = o => (Array.isArray(o.material) ? o.material : [o.material]);
// a mesh the camera draws (not a shadow-only mass on layer 1, a depth-only occluder or an outline hull)
const drawn = o => (o.layers.mask & 1) && mats(o).some(m => m && m.visible !== false && m.colorWrite !== false && m.side !== THREE.BackSide);
// (room structure, light shafts and glows are never the thing to use)
const effect = o => mats(o).every(m => !m || m.blending === THREE.AdditiveBlending || (m.transparent && m.depthWrite === false));
const moving = o => o.isInstancedMesh && (o.instanceMatrix?.usage === THREE.DynamicDrawUsage || /^critter:/.test(o.name)); // (the horde, birds: a snapshot would be left behind)
const skip = o => o.userData?.noShine || o.userData?.shineOverlay || o.isBatchedMesh || o.isSkinnedMesh || !drawn(o) || /^interior:/.test(o.name) || effect(o) || moving(o);
// a placed building's group (world/buildings: 'building:<type>'), and whether it's a prop (a notice board, a flower bed)
// or a house (merged meshes per material: a piece of one can be prop-sized, the whole never is)
const buildingOf = o => { for (let g = o.parent; g; g = g.parent) if (/^building:/.test(g.name)) return g; return null; };
const propBuildings = new WeakMap();
const isPropBuilding = g => { let v = propBuildings.get(g); if (v === undefined) { const b = groupBox(g, new THREE.Box3()); v = !!b && propSized(b) && b.max.y - b.min.y <= 2.3; propBuildings.set(g, v); } return v; }; // (2.3 m: the smallest cottage stands 2.6)
const MAX_INST = 256; // (a bigger instanced crowd is grass, flowers or leaves; the furniture batches hold a few each)
function inScene(o, scene) { for (; o; o = o.parent) if (o === scene) return true; return false; }

// the box of a group's meshes (null if it holds something that isn't a prop)
function groupBox(g, out) {
  out.makeEmpty(); let ok = true;
  g.traverse(o => { if (!ok || !o.isMesh || o.userData.shineOverlay) return; if (o.isInstancedMesh || o.isBatchedMesh) { ok = false; return; } if (drawn(o)) out.union(meshBox(o, _b)); });
  return ok && !out.isEmpty() ? out : null;
}
const propSized = b => b.max.x - b.min.x <= MAX_XZ && b.max.z - b.min.z <= MAX_XZ && b.max.y - b.min.y <= MAX_Y;

const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4();
const sameMatrix = (a, b) => a.elements.every((v, k) => Math.abs(v - b.elements[k]) < 1e-4);
/** an instance of an InstancedMesh, drawn on its own: { inst, i, matrix (world) } */
const part = (inst, i) => { inst.getMatrixAt(i, _m); return { inst, i, matrix: new THREE.Matrix4().multiplyMatrices(inst.matrixWorld, _m) }; };

// one instance of a BatchedMesh ({ batch, id }, given as an interactable's `obj`: the scavenge nodes) as an instance part:
// a geometry sharing the batch's buffers, drawing only that instance's range (kept per batch and geometry, never
// disposed: disposing it would free the batch's own buffers)
const subGeos = new WeakMap();
function batchPart(bm, id) {
  if (!bm.parent || id == null || !bm.getVisibleAt?.(id)) return null;
  const gid = bm.getGeometryIdAt(id), r = bm.getGeometryRangeAt(gid);
  const per = subGeos.get(bm) || subGeos.set(bm, new Map()).get(bm);
  let g = per.get(gid);
  if (!g) {
    g = new THREE.BufferGeometry();
    for (const [k, a] of Object.entries(bm.geometry.attributes)) if (k !== 'batchId') g.setAttribute(k, a);
    if (bm.geometry.index) { g.setIndex(bm.geometry.index); g.setDrawRange(r.indexStart ?? r.start, r.indexCount ?? r.count); }
    else g.setDrawRange(r.vertexStart ?? r.start, r.vertexCount ?? r.count);
    g.boundingBox = bm.getBoundingBoxAt(gid, new THREE.Box3());
    per.set(gid, g);
  }
  bm.getMatrixAt(id, _m);
  return { inst: { material: bm.material, geometry: g, renderOrder: bm.renderOrder, layers: bm.layers, frustumCulled: false }, matrix: new THREE.Matrix4().multiplyMatrices(bm.matrixWorld, _m) };
}

/** the props around an interactable: its nearest small mesh (or instance), grown to the biggest prop-sized group holding
 *  it; an instance brings the instances of its item in the other batches (the same matrix: a sofa's wood and its cloth) */
export function findProp(it, scene) {
  const p = it.pos, R = Math.max(0.6, Math.min(1.5, (it.radius || 1.2) * 0.8));
  // (a building's interactable looks only at buildings: a prop-sized one glows whole, a house's door gets the star; the
  //  rest never pick a house's pieces)
  const wantBuilding = !!it.building && !it.mailbox;
  let best = null, bi = -1, bd = R;
  const box = new THREE.Box3();
  const test = (o, i) => {
    if (!propSized(box) || box.max.y - box.min.y < 0.05) return; // (decals, rugs and paths: not the thing itself)
    if (box.max.y < p.y - 0.4 || box.min.y > p.y + 2.5) return;
    const dx = Math.max(box.min.x - p.x, 0, p.x - box.max.x), dz = Math.max(box.min.z - p.z, 0, p.z - box.max.z), d = Math.hypot(dx, dz);
    if (d < bd) { bd = d; best = o; bi = i; }
  };
  scene.traverseVisible(o => {
    if (!o.isMesh || skip(o)) return;
    const bg = buildingOf(o);
    if (wantBuilding ? !bg : bg && !isPropBuilding(bg)) return;
    if (o.isInstancedMesh) {
      if (!o.instanceMatrix?.array || o.count > MAX_INST) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, _m); box.copy(o.geometry.boundingBox).applyMatrix4(_m2.multiplyMatrices(o.matrixWorld, _m)); test(o, i); }
      return;
    }
    meshBox(o, box); test(o, -1);
  });
  if (!best) return null;
  if (wantBuilding) { const bg = buildingOf(best); return bg && isPropBuilding(bg) ? bg : null; }
  if (bi >= 0) {
    const parts = [part(best, bi)];
    for (const sib of best.parent.children) {
      if (sib === best || !sib.isInstancedMesh || !sib.instanceMatrix?.array || skip(sib)) continue;
      for (let j = 0; j < sib.count; j++) { const q = part(sib, j); if (sameMatrix(q.matrix, parts[0].matrix)) { parts.push(q); break; } }
    }
    return parts;
  }
  let node = best;
  for (let g = best.parent; g && g !== scene; g = g.parent) {
    if (g.userData?.noShine) return null;
    const b = groupBox(g, box);
    if (!b || !propSized(b)) break;
    node = g;
  }
  return node;
}

export class InteractShine {
  constructor() {
    this.slots = [this.slot(1), this.slot(0.8)]; // (F's reach, the mouse: a little softer)
    this.t = 0;
    this.cache = new WeakMap();
    this.warmed = new Set(); // (material uuids + mesh kind already compiled)
    this.warmSlot = this.slot(0); this.warmGroups = [];
  }
  slot(gain) {
    const uni = {
      uShCol: { value: COL }, uShLine: { value: LINE }, uShAmt: { value: 0 }, uShPhase: { value: 0 },
      uShSpan: { value: new THREE.Vector2(0, 1) }, uShDir: { value: SWEEP }, uShCam: { value: new THREE.Matrix4() },
      uShPx: { value: 3.2 }, uShRes: { value: new THREE.Vector2(1280, 720) },
    };
    return { it: null, objs: [], overlays: [], uni, gain, copies: new WeakMap(), star: null, amt: 0 };
  }

  /** what to glow: Object3Ds and instance parts */
  targets(it) {
    if (it.noShine) return [];
    if (it.actor) return [it.actor.rig?.root].filter(Boolean);
    if ('obj' in it) return it.obj ? [].concat(it.obj) : [];
    if (it.door) return []; // (the room's door mat: the star)
    const c = this.cache.get(it);
    if (c !== undefined && (!c || (c.scene === this.scene && c.list.every(x => inScene(x.inst || x, this.scene))))) return c ? c.list : [];
    const found = findProp(it, this.scene), list = found ? [].concat(found) : [];
    this.cache.set(it, list.length ? { list, scene: this.scene } : null);
    return list;
  }

  copies(s, src) {
    let c = s.copies.get(src);
    if (!c) {
      c = LIT(src) ? { shine: copyOf(src, s.uni, false), hull: src.side === THREE.FrontSide ? copyOf(src, s.uni, true) : null } // (no hull on a double-sided card: its back would light up whole)
        : { shine: tintOf(src, s.uni), hull: null };
      s.copies.set(src, c);
    }
    return c;
  }

  /** the meshes to copy: Meshes (also skinned) and instance parts ({ inst, matrix }: an instance, a batch's instance) */
  parts(it) {
    const out = [];
    for (const root of this.targets(it)) {
      if (root.batch) { const x = batchPart(root.batch, root.id); if (x) out.push(x); continue; }
      if (root.inst) { out.push(root); continue; }
      root.traverse(o => { if (o.isMesh && !o.isInstancedMesh && !o.isBatchedMesh && !o.userData.noShine && !o.userData.shineOverlay && drawn(o)) out.push(o); });
    }
    return out;
  }

  /** one pass ('hull' | 'shine') of one part's copy, or null */
  overlay(s, x, pass) {
    const o = x.inst || x;
    const list = mats(o).map(m => (m ? this.copies(s, m) : null));
    const mat = Array.isArray(o.material) ? list.map(c => c?.[pass] || INVISIBLE) : list[0]?.[pass];
    if (!mat || (Array.isArray(mat) && mat.every(m => m === INVISIBLE))) return null;
    let ov;
    if (o.isSkinnedMesh) { // (the source's bounds, or none: a SkinnedMesh finds its own by skinning every vertex on the CPU)
      ov = new THREE.SkinnedMesh(o.geometry, mat); ov.bindMode = o.bindMode; ov.bind(o.skeleton, o.bindMatrix);
      if (o.boundingSphere) { ov.boundingSphere = o.boundingSphere; ov.boundingBox = o.boundingBox; } else ov.frustumCulled = false;
    }
    else ov = new THREE.Mesh(o.geometry, mat);
    if (o.morphTargetInfluences) { ov.morphTargetInfluences = o.morphTargetInfluences; ov.morphTargetDictionary = o.morphTargetDictionary; }
    ov.userData.shineOverlay = true; ov.userData.noShine = true; ov.renderOrder = (o.renderOrder || 0) + (pass === 'hull' ? 1 : 2);
    ov.frustumCulled = o.frustumCulled; ov.castShadow = ov.receiveShadow = false; ov.layers.mask = o.layers.mask;
    ov.raycast = () => {};
    return ov;
  }

  attach(s, it) {
    this.detach(s);
    s.it = it; s.amt = 0;
    if (!it || it.noShine || !it.label) return;
    s.objs = this.targets(it);
    const box = new THREE.Box3(); let any = false;
    for (const x of this.parts(it)) {
      const o = x.inst || x;
      for (const pass of ['hull', 'shine']) {
        const ov = this.overlay(s, x, pass); if (!ov) continue;
        if (x.inst) { ov.matrixAutoUpdate = false; ov.matrix.copy(x.matrix); ov.frustumCulled = false; this.scene.add(ov); } // (one instance: placed by its matrix, in the scene)
        else o.add(ov);
        s.overlays.push(ov);
      }
      if (x.inst) { if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); box.union(_b.copy(o.geometry.boundingBox).applyMatrix4(x.matrix)); }
      else box.union(meshBox(o, _b)); // (a skinned mesh: its bind-pose box, near enough for the sweep, and no CPU skinning)
      any = true;
    }
    if (any) {
      // the band's travel: from the box's lowest to its highest point along the sweep
      let lo = 1e9, hi = -1e9;
      for (let i = 0; i < 8; i++) { _c.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z); const d = _c.dot(SWEEP); lo = Math.min(lo, d); hi = Math.max(hi, d); }
      s.uni.uShSpan.value.set(lo, hi);
    }
    if (!s.overlays.length) { // nothing to glow: the star over the spot
      s.star = star();
      this.scene.add(s.star);
    }
  }

  detach(s) {
    for (const ov of s.overlays) ov.removeFromParent();
    s.overlays.length = 0; s.objs = [];
    if (s.star) { s.star.removeFromParent(); s.star.material.dispose(); s.star = null; }
    s.it = null;
  }

  /** compile the copies' shaders for a world's interactables in the background (a first glow compiled on the spot
   *  stalled the frame for 100-250 ms on Windows); each material and mesh kind once, the copies then dropped */
  prewarm(renderer, camera, list) {
    const s = this.warmSlot, g = new THREE.Group();
    for (const it of list) {
      if (!it?.label || it.noShine) continue;
      for (const x of this.parts(it)) {
        const o = x.inst || x, key = mats(o).map(m => m?.uuid).join(',') + (o.isSkinnedMesh ? '|skin' : '') + (o.morphTargetInfluences ? '|morph' : '');
        if (this.warmed.has(key)) continue;
        this.warmed.add(key);
        for (const pass of ['hull', 'shine']) { const ov = this.overlay(s, x, pass); if (ov) { ov.frustumCulled = false; g.add(ov); } }
      }
    }
    if (!g.children.length) return;
    // then drawn for two frames at zero strength (their own uniforms: invisible): ANGLE builds the native shader on a
    // program's first draw, which a compile alone leaves for the first glow to pay
    const scene = this.scene, show = () => { if (this.scene === scene) { scene.add(g); this.warmGroups.push({ g, n: 2 }); } };
    const p = renderer.compileAsync?.(g, camera, scene);
    if (p?.then) p.then(show, () => {}); else show();
  }

  /** each frame: the interactables to shine (F's reach, the mouse's; null for none) in this world's scene; warm:
   *  { renderer, list() } to compile them ahead (a second and eight seconds into each world: the baked rigs land late) */
  update(dt, scene, camera, near, hover, warm) {
    this.t += dt;
    if (scene !== this.scene) { for (const s of this.slots) this.detach(s); this.scene = scene; this.warmAt = [this.t + 1, this.t + 8]; }
    for (const w of this.warmGroups) if (--w.n < 0) w.g.removeFromParent();
    this.warmGroups = this.warmGroups.filter(w => w.n >= 0);
    if (!scene) return;
    if (warm && this.warmAt?.length && this.t >= this.warmAt[0]) { this.warmAt.shift(); try { this.prewarm(warm.renderer, camera, warm.list()); } catch (e) { console.warn('[shine] prewarm', e); } }
    const want = [near || null, hover && hover !== near ? hover : null];
    const ph = (this.t % 1.7) / 1.1; // (the sweep crosses in 1.1 s, then rests for 0.6 s)
    this.slots.forEach((s, i) => {
      if (want[i] !== s.it) this.attach(s, want[i]);
      if (!s.it) return;
      if (s.it.actor && s.objs[0] !== s.it.actor.rig?.root) this.attach(s, s.it); // (a villager's rig swapped: its baked model loaded)
      s.amt = Math.min(1, s.amt + dt * 6);
      const U = s.uni;
      U.uShAmt.value = s.amt * s.gain * (0.88 + 0.12 * Math.sin(this.t * 3.2));
      U.uShPhase.value = Math.min(1, ph);
      U.uShCam.value.copy(camera.matrixWorld);
      U.uShRes.value.set(innerWidth, innerHeight);
      if (s.star) {
        const tw = 0.55 + 0.45 * Math.sin(this.t * 4.1);
        s.star.position.copy(s.it.pos).setY(s.it.pos.y + 1.8 + Math.sin(this.t * 2) * 0.07);
        s.star.scale.setScalar((0.5 + 0.16 * tw) * s.amt);
        s.star.material.rotation = this.t * 0.8;
        s.star.material.opacity = (0.55 + 0.45 * tw) * s.amt * s.gain;
      }
    });
  }

  clear() { for (const s of this.slots) this.detach(s); }
}

// (a material-array mesh's slot with nothing to draw for a pass)
const INVISIBLE = new THREE.MeshBasicMaterial({ visible: false });
