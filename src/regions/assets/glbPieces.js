// Blender landmark props for the outdoor regions (ROADMAP Z-D6 "Blender everything"; tools/blender/work/codex/rg-<region>).
// A biome builds its props with a kit module's functions (`Pr.ruinedShrine(seed, opts)` → a piece: geometry per material
// key + lights); withGlb(region, module) wraps the module so a prop listed in REGION_GLB comes back with its Blender
// model's geometry instead, sorted into the same keys by material name (body, glow, leaf, cloth, water, stone), in the kit
// piece's local frame. Everything else the kit piece carries (lights, deck heights, hooks) is kept, so the Placer, the
// colliders and the lights work as before. The kit `opts.s` scale is applied to the model. Not loaded yet: the kit piece.
import * as THREE from 'three';
import { loadGlb, glbBucketGeos } from '../../gfx/glbAssets.js';
import { merge } from '../../gfx/geom.js';

export const REGION_GLB = { 'dg-bamboo': { hokora: '/models/dg-bamboo-hokora.glb', culmStack: '/models/dg-bamboo-culmStack.glb', shootBasket: '/models/dg-bamboo-shootBasket.glb', stoneMarker: ['/models/dg-bamboo-stoneMarker-v0.glb', '/models/dg-bamboo-stoneMarker-v1.glb'], rockPillar: ['/models/dg-bamboo-rockPillar-v0.glb', '/models/dg-bamboo-rockPillar-v1.glb'], rootTangle: ['/models/dg-bamboo-rootTangle-v0.glb', '/models/dg-bamboo-rootTangle-v1.glb'], fallenBamboo: '/models/dg-bamboo-fallenBamboo.glb' },'dg-maple': { hokora: '/models/dg-maple-hokora.glb', rootTangle: ['/models/dg-maple-rootTangle-v0.glb', '/models/dg-maple-rootTangle-v1.glb'], fallenBranch: ['/models/dg-maple-fallenBranch-v0.glb', '/models/dg-maple-fallenBranch-v1.glb'], stump: '/models/dg-maple-stump.glb', hoshigakiRack: '/models/dg-maple-hoshigakiRack.glb', sakeTable: '/models/dg-maple-sakeTable.glb' }, 'dg-tidepool': { umiHokora: '/models/dg-tidepool-umiHokora.glb', crabHusk: '/models/dg-tidepool-crabHusk.glb', brazier: '/models/dg-tidepool-brazier.glb', weddedPair: '/models/dg-tidepool-weddedPair.glb', planks: '/models/dg-tidepool-planks.glb', netPile: '/models/dg-tidepool-netPile.glb' }, 'dg-onsen': { frozenBarrels: '/models/dg-onsen-frozenBarrels.glb', snowHokora: '/models/dg-onsen-snowHokora.glb', bathDeck: '/models/dg-onsen-bathDeck.glb', towelRack: '/models/dg-onsen-towelRack.glb', snowMonkey: '/models/dg-onsen-snowMonkey.glb', iceSpire: ['/models/dg-onsen-iceSpire-v0.glb', '/models/dg-onsen-iceSpire-v1.glb'], coldBrazier: '/models/dg-onsen-coldBrazier.glb', storePile: '/models/dg-onsen-storePile.glb', lanternPost: '/models/dg-onsen-lanternPost.glb' }, bamboo: { ruinedShrine: '/models/rg-bamboo-ruinedShrine.glb', iwakura: '/models/rg-bamboo-iwakura.glb', torii: '/models/rg-bamboo-torii.glb', lantern: '/models/rg-bamboo-lantern.glb', chimes: '/models/rg-bamboo-chimes.glb', bambooBench: '/models/rg-bamboo-bambooBench.glb' }, maple: { lookout: '/models/rg-maple-lookout.glb', jizo: '/models/rg-maple-jizo.glb', jizoTrio: '/models/rg-maple-jizoTrio.glb', kakashi: '/models/rg-maple-kakashi.glb', tanuki: '/models/rg-maple-tanuki.glb', warabocchi: '/models/rg-maple-warabocchi.glb', hasa: '/models/rg-maple-hasa.glb', komodaru: '/models/rg-maple-komodaru.glb', taikobashi: '/models/rg-maple-taikobashi.glb', bench: '/models/rg-maple-bench.glb', sheaf: ['/models/rg-maple-sheaf-v0.glb', '/models/rg-maple-sheaf-v1.glb'], bale: ['/models/rg-maple-bale-v0.glb', '/models/rg-maple-bale-v1.glb'] }, onsen: { snowTorii: ['/models/rg-onsen-snowTorii-v0.glb', '/models/rg-onsen-snowTorii-v0.glb', '/models/rg-onsen-snowTorii-v0.glb', '/models/rg-onsen-snowTorii-v0.glb', '/models/rg-onsen-snowTorii-v0.glb', '/models/rg-onsen-snowTorii-v0.glb', '/models/rg-onsen-snowTorii-v0.glb', '/models/rg-onsen-snowTorii-v0.glb', '/models/rg-onsen-snowTorii-v0.glb', '/models/rg-onsen-snowTorii-v1.glb'], yukimiLantern: '/models/rg-onsen-yukimiLantern.glb', inn: '/models/rg-onsen-inn.glb', bathhouse: '/models/rg-onsen-bathhouse.glb', signpost: '/models/rg-onsen-signpost.glb', bench: '/models/rg-onsen-bench.glb', oke: '/models/rg-onsen-oke.glb', campRest: '/models/rg-onsen-campRest.glb' }, tidepool: { wreck: '/models/rg-tidepool-wreck.glb', seaTorii: '/models/rg-tidepool-seaTorii.glb', shoreLamp: '/models/rg-tidepool-shoreLamp.glb', giantClam: '/models/rg-tidepool-giantClam.glb', lookout: '/models/rg-tidepool-lookout.glb', netRack: '/models/rg-tidepool-netRack.glb', arenaGate: '/models/rg-tidepool-arenaGate.glb', weddedRocks: '/models/rg-tidepool-weddedRocks.glb', grottoMouth: '/models/rg-tidepool-grottoMouth.glb' } }; // prop name → /models/rg-<region>-<name>.glb
const KEYS = ['body', 'glow', 'leaf', 'cloth', 'water', 'stone', 'flat', 'rock', 'reed', 'hot']; // (the tidepool layout's pieces also carry rock / reed / hot parts)
const GEOS = new Map(); // url → { key: BufferGeometry } (the template, scale 1)
const SCALED = new Map(); // url|s → { key: BufferGeometry }

// (a model's `stone` part joins its `body`: the kit's d:stone batch holds indexed, uv-less flagstones and a BatchedMesh takes
//  every geometry in the shape of its first one, so a GLB stone part placed before them broke the whole region; body
//  pieces, kit and GLB alike, are non-indexed with uvs)
function intoBody(g) {
  if (!g.stone) return g;
  const out = { ...g }; out.body = g.body ? merge([g.body, g.stone]) : g.stone; delete out.stone;
  out.body.computeBoundingSphere(); out.body.userData.shared = true;
  return out;
}
// (a listed name maps to one url, or to an array of variant urls picked by the piece's seed: its first numeric argument)
const urlsOf = region => (region ? Object.values(REGION_GLB[region] || {}) : Object.values(REGION_GLB).flatMap(m => Object.values(m))).flat();
/** load (once) a region's models, or every region's (no argument) */
export function loadRegionGlbs(region) {
  return Promise.all(urlsOf(region).map(url => GEOS.has(url) ? null : loadGlb(url).then(t => { GEOS.set(url, intoBody(glbBucketGeos(t))); }).catch(e => console.warn('[region] model', url, e))));
}
export const regionGlbUrls = region => urlsOf(region);

function geosFor(url, s) {
  const g = GEOS.get(url); if (!g) return null;
  if (!s || Math.abs(s - 1) < 1e-4) return g;
  const k = url + '|' + s.toFixed(3);
  let o = SCALED.get(k);
  if (!o) { o = {}; for (const key in g) { o[key] = g[key].clone().scale(s, s, s); o[key].computeBoundingSphere(); o[key].userData.shared = true; } SCALED.set(k, o); }
  return o;
}
/** one piece function drawn from its Blender model when listed (the zone dungeon kits' own pieces: region 'dg-<zone>') */
export function glbFn(region, name, fn) { return withGlb(region, { [name]: fn })[name]; }
/** the module with its listed props drawn from their Blender models (others pass straight through) */
export function withGlb(region, mod) {
  const map = REGION_GLB[region] || {};
  return new Proxy(mod, {
    get(t, name) {
      const fn = t[name], urls = map[name];
      if (!urls || typeof fn !== 'function') return fn;
      return (...args) => {
        const sd = args.find(a => typeof a === 'number') | 0, url = Array.isArray(urls) ? urls[((sd % urls.length) + urls.length) % urls.length] : urls;
        const pc = fn(...args), o = args.find(a => a && typeof a === 'object' && !Array.isArray(a)), g = geosFor(url, typeof o?.s === 'number' ? o.s : 1);
        if (!g || !pc || typeof pc !== 'object') return pc;
        const out = { ...pc };
        for (const k of KEYS) delete out[k];
        return Object.assign(out, g);
      };
    },
  });
}
