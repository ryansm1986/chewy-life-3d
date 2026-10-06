// Zone village building showcase (/?test=village): each building of a village theme (src/regions/village/art<Theme>.js)
// with its siege or saved overlay, in a row on grass, for close looks (docs/ZONES.md §2).
// Params: &theme=bamboo  &state=besieged|saved|plain  &only=elder,inn,…  &focus=i (centre + zoom on the i-th)  &yaw= &pitch=
//         &dist=  &hour=  &extras=1 (the gate, a lantern post, a cage, a camp: tent, banner, spikes, fire)
// window.__info = { count, tris: { id → triangles } }
import * as THREE from 'three';
import { makeStage } from './_stage.js';
import { Builder } from '../world/buildings/kit.js';
import * as Bamboo from '../regions/village/artBamboo.js';
import * as Maple from '../regions/village/artMaple.js';
import * as Tidepool from '../regions/village/artTidepool.js';
import * as Onsen from '../regions/village/artOnsen.js';
import { villageMats, tplGroup, animateParts, cageTpl, tent, warBanner, spikes, campfire, debris, bones, litLantern, tornLantern } from '../regions/village/art.js';

const THEMES = { bamboo: Bamboo, maple: Maple, tidepool: Tidepool, onsen: Onsen };
const KINDS = { bamboo: 'elder,inn,shop,dojo,craft,waypoint', maple: 'elder,inn,shop,teaHouse,waypoint', tidepool: 'elder,inn,shop,fishmonger,boatwright,waypoint', onsen: 'elder,inn,shop,bathhouse,smith,waypoint' };
export default function () {
  const P = new URLSearchParams(location.search);
  const theme = THEMES[P.get('theme')] ? P.get('theme') : 'bamboo', T = THEMES[theme], state = P.get('state') || 'besieged';
  const kinds = (P.get('only') || KINDS[theme]).split(',').filter(k => T[k]);
  const mats = villageMats(0), SQ = Math.SQRT1_2, U = [SQ, -SQ];
  const placed = [], info = { count: 0, tris: {} };
  let u = 0;
  const tris = tpl => Object.values(tpl.geos).reduce((a, g) => a + g.attributes.position.count / 3, 0);
  const add = (name, fn, w = 6) => {
    const B = new Builder(placed.length * 131 + 7); let meta = null; meta = fn(B);
    const tpl = B.finish(), g = tplGroup(tpl, mats, name);
    const cx = (u + w / 2) * U[0], cz = (u + w / 2) * U[1]; g.position.set(cx, 0, cz);
    placed.push({ name, g, cx, cz, meta }); u += w + 1.2;
    info.tris[name] = Math.round(tris(tpl)); info.count++;
    return { g, meta };
  };
  for (const k of kinds) {
    add(k, B => {
      const meta = T[k](B);
      if (state === 'besieged') meta.siege?.(B); else if (state === 'saved') meta.saved?.(B);
      for (const l of meta.lamps || []) B.at(l, 0, () => (state === 'saved' ? litLantern(B, { r: 0.14, h: 0.3 }) : state === 'besieged' ? tornLantern(B, { seed: l[0] * 7 | 0 }) : null));
      return meta;
    }, k === 'waypoint' ? 3.5 : 6);
  }
  if (P.get('extras') === '1') {
    if (T.gate) add('gate', B => T.gate(B, { w: 3.6 }), 5);
    if (T.lanternPost) add('post', B => { const h = T.lanternPost(B); B.at(h, 0, () => litLantern(B, { r: 0.14, h: 0.3, color: '#f0c860' })); }, 2);
    add('camp', B => { campfire(B, { seed: 1 }); bones(B, 1.4, { seed: 3 }); debris(B, 2, { seed: 5 }); B.at([1.6, 0, -1.2], 0, () => tent(B, { seed: 2 })); B.at([-1.6, 0, -1.4], 0, () => warBanner(B, { seed: 4 })); B.at([0, 0, 2], 0, () => spikes(B, 2.4, { seed: 6 })); }, 6);
    const c = cageTpl(3), g = tplGroup(c, mats, 'cage'); const cx = (u + 1) * U[0], cz = (u + 1) * U[1]; g.position.set(cx, 0, cz); placed.push({ name: 'cage', g, cx, cz }); u += 3;
  }
  const us = placed.map(p => p.cx * U[0] + p.cz * U[1]);
  let center = [placed.reduce((a, p) => a + p.cx, 0) / placed.length, placed.reduce((a, p) => a + p.cz, 0) / placed.length], dist = Math.max(14, (Math.max(...us) - Math.min(...us) + 8) / 0.62);
  if (P.has('focus')) { const f = placed[Math.min(placed.length - 1, +P.get('focus'))]; center = [f.cx, f.cz]; dist = 13; }
  const S = makeStage({ ground: 90, center, dist, hour: 10, groundColor: '#8ec46e' });
  S.engine.rig.focus.y = 1.2; S.engine.rig.snap();
  for (const p of placed) S.scene.add(p.g);
  S.onUpdate((dt, t) => { for (const p of placed) animateParts(p.g.userData.parts || [], S.engine.time); });
  window.__info = info;
  S.ready();
}
