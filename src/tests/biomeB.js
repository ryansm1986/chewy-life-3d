// Biomes B asset showcase (/?test=biomeB&set=tidepool|onsen): every asset builder of the two biomes in a labelled
// grid, drawn through the same Placer batches / materials the regions use.
// Params: &set=tidepool|onsen  &only=a,b  &focus=i  &dist=  &pitch=  &yaw=  &labels=0  &hour=  &cols=  &gap=  &ground=#hex
import * as THREE from 'three';
import { makeStage } from './_stage.js';
import { makeMats, Placer } from '../regions/assets/tidepoolKit.js';
import * as TP from '../regions/assets/tidepoolAssets.js';

const SETS = {
  tidepool: {
    ground: '#efd9a6', hour: 11,
    items: {
      coastPine1: [() => TP.coastPine(1), 1], coastPine2: [() => TP.coastPine(2), 1], coastPine3: [() => TP.coastPine(3), 1],
      duneGrass: [() => TP.duneGrass(1)], duneGrass2: [() => TP.duneGrass(2)], morningGlory: [() => TP.morningGlory(1)], morningGlory2: [() => TP.morningGlory(2)],
      seaStack: [() => TP.seaStack(1, 6, 1.6), 1], seaStack2: [() => TP.seaStack(2, 4, 1.2), 1],
      rockShelf: [() => TP.rockShelf(1, 4.2, 2.4, 0.9), 1], rockShelf2: [() => TP.rockShelf(2, 3, 2, 0.7), 1], boulder: [() => TP.boulder(1)], boulder2: [() => TP.boulder(3, 0.5, 0.8)],
      poolRim: [() => TP.poolRim(1, 1.8), 1], kelp: [() => TP.kelp(1)], coral: [() => TP.coral(1)], coral2: [() => TP.coral(2)], anemone: [() => TP.anemone(1)], anemone2: [() => TP.anemone(4)],
      starfish: [() => TP.starfish(1)], urchin: [() => TP.urchin(1)], shells: [() => shells()], clam: [() => TP.giantClam(1)],
      driftwood: [() => TP.driftwood(1)], wreck: [() => TP.wreck(3), 1], netRack: [() => TP.netRack(5), 1],
      walkway: [() => TP.walkway(1, [[-2.5, -1], [0, 0.4], [2.5, -0.3]]), 1], seaTorii: [() => TP.seaTorii(2), 1], weddedRocks: [() => TP.weddedRocks(4), 1],
      grotto: [() => TP.grottoMouth(9), 2], lookout: [() => TP.lookout(6), 1], shoreLamp: [() => TP.shoreLamp(1)], pebbles: [() => TP.pebbles(1)],
    },
  },
};
function shells() {
  const out = { body: [] };
  ['scallop', 'spiral', 'cowrie'].forEach((k, i) => { const g = TP.shell(i, k).body; g.translate((i - 1) * 0.25, 0, 0); out.body.push(g); });
  return out;
}

export default async function () {
  const P = new URLSearchParams(location.search);
  let setName = P.get('set') || 'tidepool';
  if (setName === 'onsen' && !SETS.onsen) {
    const ON = await import('../regions/assets/onsenAssets.js');
    SETS.onsen = ON.SHOWCASE;
  }
  const set = SETS[setName];
  const only = P.get('only')?.split(',');
  const names = Object.keys(set.items).filter(n => !only || only.includes(n));
  if (only) names.sort((a, b) => only.indexOf(a) - only.indexOf(b));
  const gap = +(P.get('gap') ?? 2.6), cols = +(P.get('cols') ?? Math.ceil(Math.sqrt(names.length * 1.6)));
  const SQ = Math.SQRT1_2, U = [SQ, -SQ], Vv = [SQ, SQ];
  const cells = []; let u = 0, v = 0, col = 0, rowH = 0;
  for (const n of names) {
    const big = set.items[n][1] || 0, w = gap * (big === 2 ? 4 : big ? 2 : 1);
    if (col >= cols) { col = 0; u = 0; v += rowH; rowH = 0; }
    const cu = u + w / 2, cv = v + w / 2;
    cells.push({ n, x: cu * U[0] + cv * Vv[0], z: cu * U[1] + cv * Vv[1], big });
    u += w; rowH = Math.max(rowH, w); col++;
  }
  const xs = cells.map(c => c.x), zs = cells.map(c => c.z);
  let center = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...zs) + Math.max(...zs)) / 2];
  const focus = P.has('focus') ? cells[Math.min(cells.length - 1, +P.get('focus'))] : null;
  if (focus) center = [focus.x, focus.z];
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)) + gap;
  const S = makeStage({ ground: Math.max(80, span * 1.6 + 30), center, dist: focus ? 7 : Math.max(12, span * 1.2), hour: set.hour, groundColor: P.get('ground') || set.ground });
  if (focus) { S.engine.rig.focus.y = focus.big ? 1.4 : 0.4; S.engine.rig.snap(); }
  const mats = makeMats({ night: set.night || 0 });
  const PL = new Placer(mats);
  const labels = [], per = {};
  for (const c of cells) {
    const out = set.items[c.n][0]();
    let tris = 0, h = 0.6;
    for (const [k, g0] of Object.entries(out)) {
      if (k === 'lights') { for (const l of g0) S.lightPool.addSource({ ...l, pos: l.pos.clone().add(new THREE.Vector3(c.x, 0, c.z)) }); continue; }
      if (!mats[k] && !['body', 'glow', 'hot', 'leaf', 'cloth', 'water', 'jet'].includes(k)) continue;
      for (const g of Array.isArray(g0) ? g0 : [g0]) {
        if (!g?.isBufferGeometry) continue;
        const key = k === 'water' ? 'body' : k;
        PL.put(key, g, c.x, 0, c.z);
        tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
        g.computeBoundingBox(); h = Math.max(h, g.boundingBox.max.y);
      }
    }
    per[c.n] = Math.round(tris);
    labels.push({ n: c.n, tris: Math.round(tris), pos: new THREE.Vector3(c.x, h + 0.25, c.z) });
  }
  S.scene.add(PL.build());
  if (P.get('labels') !== '0') {
    const root = document.createElement('div');
    root.style.cssText = 'position:fixed;inset:0;pointer-events:none;font:600 11px system-ui,sans-serif;z-index:5';
    document.body.appendChild(root);
    for (const l of labels) {
      const el = document.createElement('div');
      el.style.cssText = 'position:absolute;transform:translate(-50%,-100%);background:rgba(255,246,232,.85);color:#4a2c2a;padding:1px 6px;border-radius:8px;white-space:nowrap';
      el.textContent = `${l.n} · ${l.tris}`; root.appendChild(el); l.el = el;
    }
  }
  const v3 = new THREE.Vector3();
  S.onUpdate(() => {
    for (const l of labels) if (l.el) {
      v3.copy(l.pos).project(S.engine.camera);
      l.el.style.left = ((v3.x * 0.5 + 0.5) * innerWidth) + 'px'; l.el.style.top = ((-v3.y * 0.5 + 0.5) * innerHeight) + 'px';
      l.el.style.display = v3.z < 1 ? '' : 'none';
    }
  });
  window.__info = { count: cells.length, per, draws: () => S.engine.renderer.info.render.calls };
  S.ready();
}
