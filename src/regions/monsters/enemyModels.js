// Blender-made enemy models (ROADMAP EN-1; the contract: .claude/skills/codex-blender/templates/enemy-model-contract.md) as parts for
// the region monster kit (bamboo.js `assemble`). Each GLB holds one mesh node per part (`body`, `head`, `tail`,
// `mound`, …), vertex colours only, each node's translation its pivot. They become the same shared, vertex-coloured
// part geometries the procedural specs make, so the Horde still instances them (dungeon/horde.js) and each kind's
// `animate()` keeps moving the same named parts.
//
//   loadEnemyModels()          boot (game.js) and the monster test pages await this before any monster is built
//   enemySpec(kind, vkey, mat) → an `assemble` spec from the GLB, or null (not made yet, not loaded, or ?procmon)
//   enemyPivot(kind, vkey, part, fallback) → that part's pivot [x, y, z] (the procedural one when there's no GLB)
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** the kinds with a Blender model: one file per variant key (public/models/<file>.glb) */
export const ENEMY_MODELS = {
  takenoko: ['takenoko', 'takenoko_aotake', 'takenoko_golden'],
  kodama: ['kodama', 'kodama_moss', 'kodama_elder'],
  kamaitachi: ['kamaitachi', 'kamaitachi_yuki', 'kamaitachi_storm'],
  kuri: ['kuri', 'kuri_roasted', 'kuri_momiji'],
  kakashi: ['kakashi', 'kakashi_hoshigaki', 'kakashi_oni'],
  kakashiCrow: ['kakashi_crow'], // (the flying crow the scarecrow sends: maple.js crowFly)
  momijiWisp: ['momiji-wisp', 'momiji-wisp_ginkgo', 'momiji-wisp_ember'],
  iwabozu: ['iwabozu', 'iwabozu_lantern', 'iwabozu_elder'], // (the zone tanks: src/dungeon/zoneMonsters/*.js)
  tesso: ['tesso', 'tesso_sutra', 'tesso_elder'],
  sazaeOni: ['sazae-oni', 'sazae-oni_hotaru', 'sazae-oni_elder'],
  akaname: ['akaname', 'akaname_yuzu', 'akaname_elder'],
  yurei: ['yurei', 'yurei_sleepy'], // (the Haunted modifier's ghost)
  mochi: ['mochi-slime', 'mochi-slime_leaf', 'mochi-slime_snow'], // (the Burrow: dungeon/monsters.js, one rigid mesh each)
  dustbunny: ['dust-bunny', 'dust-bunny_blue', 'dust-bunny_warm'],
  kinoko: ['kinoko', 'kinoko_dream', 'kinoko_orange'],
  lantern: ['chochin', 'chochin_pink'],
  kasa: ['kasa-obake', 'kasa-obake_red', 'kasa-obake_blue'],
  wisp: ['kitsune-bi', 'kitsune-bi_violet'],
  oni: ['oni-imp', 'oni-imp_blue'],
  mochiKing: ['mochi-king'], // (the Burrow's bosses: built on their minion's builder, their own model)
  tenguMaster: ['tengu-master'], // (the region bosses: regions/bosses/*.js swap their parts' geometry in)
  karasuKozo: ['karasu-kozo', 'karasu-kozo_blue'],
  danzaburo: ['danzaburo'],
  umibozu: ['umibozu'],
  umibozuHand: ['umibozu-hand'],
  yukiOnna: ['yuki-onna'],
  kasaLord: ['kasa-lord'],
  tamamoTail: ['tamamo-tail'], // (one of Tamamo's nine tails: dungeon/monsters.js fans it)
  oniChef: ['oni-chef'],
  kappa: ['kappa', 'kappa_umi', 'kappa_kyuri'], // (the Tide Pool kinds bend their parts on the GPU: tidepool.js merges the parts and tags them)
  heikegani: ['heikegani', 'heikegani_genji', 'heikegani_shogun', 'heikegani_brineclaw'], // (key 3: Captain Brineclaw's own shape)
  kurage: ['kurage', 'kurage_ao', 'kurage_sakura'],
  yukiwarashi: ['yukiwarashi', 'yukiwarashi_snowdrift', 'yukiwarashi_camellia'],
  yukidaruma: ['yukidaruma', 'yukidaruma_dusk', 'yukidaruma_grand'],
  tsurara: ['tsurara', 'tsurara_aurora', 'tsurara_blackice'],
};
const OFF = typeof location !== 'undefined' && new URLSearchParams(location.search).has('procmon'); // (the procedural models, for A/B shots)
const FILES = new Map(); // file → { part: { geos: [BufferGeometry], at: [x, y, z] } }
const MARKS = new Map(); // file → { marker: [x, y, z] } (the GLB's empties)
let loading = null;

/** one GLB → its parts (a node per part; a node with several primitives, e.g. `toon` + `glow`, is one part) */
function partsOf(gltf, marks = {}) {
  const out = {};
  gltf.scene.updateMatrixWorld(true);
  for (const node of gltf.scene.children) {
    const geos = [];
    node.traverse(o => {
      if (!o.isMesh) return;
      const g = o.geometry.clone();
      g.userData.glow = /glow/i.test(o.material?.name || ''); // (faces on the `glow` material: tidepool.js lights them)
      if (o !== node) g.applyMatrix4(o.matrix); // (a primitive's own offset inside the part node: normally none)
      const c = g.attributes.color;
      if (c && (c.itemSize === 4 || !(c.array instanceof Float32Array))) { // RGBA / 16-bit → float RGB (the kit's colours; glTF COLOR_0 is linear, like THREE.Color)
        const a = new Float32Array(c.count * 3);
        for (let i = 0; i < c.count; i++) { a[i * 3] = c.getX(i); a[i * 3 + 1] = c.getY(i); a[i * 3 + 2] = c.getZ(i); }
        g.deleteAttribute('color');
        g.setAttribute('color', new THREE.Float32BufferAttribute(a, 3));
      }
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
      geos.push(g);
    });
    if (geos.length) out[node.name] = { geos, at: [node.position.x, node.position.y, node.position.z] };
    else marks[node.name] = [node.position.x, node.position.y, node.position.z]; // (an empty: a marker the fight spawns effects at)
  }
  return out;
}

/** fetch every enemy GLB once (missing files are skipped: that kind stays procedural) */
export function loadEnemyModels() {
  if (OFF) return Promise.resolve();
  if (loading) return loading;
  const loader = new GLTFLoader();
  const files = [...new Set(Object.values(ENEMY_MODELS).flat())];
  loading = Promise.all(files.map(f => loader.loadAsync(`${import.meta.env?.BASE_URL || '/'}models/${f}.glb`)
    .then(gltf => { const m = {}, p = partsOf(gltf, m); if (p.body) { FILES.set(f, p); MARKS.set(f, m); } else console.warn('[enemyModels] no body part in', f); })
    .catch(() => { /* not built yet */ })));
  return loading;
}

const fileOf = (kind, vkey) => { const l = ENEMY_MODELS[kind]; return l ? l[vkey] ?? l[0] : null; };
/** → { mat, parts: [{ name, geo, at, parent }] } for assemble(), body first; null when this kind has no loaded GLB.
 *  The body's own pivot is where the game puts `inner` (the ground for most; the ball's centre for the kuri), so a part
 *  hung on `inner` sits at its pivot minus the body's; a part on `root` (the takenoko's mound) at its pivot as is.
 *  hung on another part (a snowball in a mitten) at its pivot minus that part's.
 *  opts.parent: { part: 'root' | 'pivot' | otherPart }; opts.rename: { glbName: gameName };
 *  opts.part: { part: { outline, shadow } } (assemble's per-part extras: a thinner face outline, no shadow);
 *  opts.outline: the model's ink width (assemble's default otherwise) */
export function enemySpec(kind, vkey, mat, opts = {}) {
  const P = !OFF && FILES.get(fileOf(kind, vkey));
  if (!P) return null;
  const onPart = n => P[opts.parent?.[n]] != null; // (hung on another part: after it, so assemble finds its group)
  const rest = Object.keys(P).filter(n => n !== 'body'), b = P.body.at;
  const names = ['body', ...rest.filter(n => !onPart(n)), ...rest.filter(onPart)];
  return {
    mat: mat || {}, outline: opts.outline,
    parts: names.map(n => {
      const parent = opts.parent?.[n] || 'inner', at = P[n].at, rel = parent === 'inner' ? b : P[parent]?.at;
      return { name: opts.rename?.[n] || n, geo: P[n].geos.map(g => g.clone()), parent: opts.rename?.[parent] || parent, ...opts.part?.[n],
        at: n === 'body' ? null : rel ? [at[0] - rel[0], at[1] - rel[1], at[2] - rel[2]] : at };
    }),
  };
}
/** one part's geometry moved to model space (its node translation added): a single merged BufferGeometry, or null */
export function enemyPartGeo(kind, vkey, part) {
  const P = !OFF && FILES.get(fileOf(kind, vkey))?.[part];
  if (!P) return null;
  const list = P.geos.map(g => g.clone().translate(...P.at));
  return list.length === 1 ? list[0] : mergeGeometries(list, false);
}
/** the raw parts of one file (for pooled looks outside the kit, e.g. the kakashi's flying crow), or null */
export const enemyParts = (kind, vkey = 0) => (!OFF && FILES.get(fileOf(kind, vkey))) || null;
/** a marker (an empty in the GLB: where the fight spawns an effect) → [x, y, z], or the fallback */
export const enemyMarker = (kind, vkey, name, fallback) => (!OFF && MARKS.get(fileOf(kind, vkey))?.[name]) || fallback;
export const enemyPivot = (kind, vkey, part, fallback) => (!OFF && FILES.get(fileOf(kind, vkey))?.[part]?.at) || fallback;
export const hasEnemyModel = (kind, vkey) => !OFF && FILES.has(fileOf(kind, vkey));
/** a variant with its own file (not the base's fallback: e.g. a captain's custom-shaped look keeps the procedural model) */
export const ownEnemyModel = (kind, vkey) => !OFF && ENEMY_MODELS[kind]?.[vkey] != null && FILES.has(ENEMY_MODELS[kind][vkey]);
if (typeof window !== 'undefined') window.__enemyModels = () => [...FILES.keys()]; // (QA: the files that loaded)
