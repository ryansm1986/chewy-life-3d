// Shiokaze Tidepools (潮溜まり) — the biome recipe (docs/REGIONS.md §2 / §3.3). Owned by Biomes B.
// The lead owns the identity fields (id, name, levels, unlock, monsters, boss, audio keys); everything else here is the
// biome agent's to design. RegionWorld (engine) consumes mood / terrain / layout / populate / effects / interactables.
//
// The map: the sea wraps the north and west (screen-up: the camera looks toward -x/-z). The trail hugs the coast from
// the start cove (south-west) up the west shore past the net racks, the wreck beach and the tide-pool terraces, round
// the sea grotto in the north-west headland, east along the north shore past the wedded rocks and the sea torii in the
// cove, under the lookout bluff, to Umibōzu's shore arena in the north-east, whose sea side opens north-north-west
// (screen-up, so the boss faces the camera). Terrain: src/regions/assets/tidepoolTerrain.js; props / FX / POIs:
// tidepoolWorld.js, tidepoolAssets.js, tidepoolFx.js.
import { TERRAIN, LAYOUT, coastDist } from '../assets/tidepoolTerrain.js';
import { tidepoolPopulate, tidepoolEffects, tidepoolInteractables } from '../assets/tidepoolWorld.js';

export default {
  id: 'tidepool', name: 'Shiokaze Tidepools', jp: '潮溜まり', sub: 'Turquoise coves, salty spray and sleepy giants', color: '#2fb8c8',
  levels: [18, 27], unlock: { level: 18, after: 'maple' },
  monsters: ['kappa', 'heikegani', 'kurage'], boss: 'umibozu',
  // Burrow stand-ins until the region's own monsters / boss are registered (src/regions/monsters, src/regions/bosses)
  fallback: { monsters: ['mochi', 'lantern', 'wisp'], boss: 'mochiKing' },
  music: 'region_tidepool', bossMusic: 'boss_tidepool', ambience: 'region_tidepool',
  // a bright turquoise coastal day: high warm sun, cool sea-blue fill, salt haze toward the horizon
  mood: {
    sky: { top: '#6cc6f0', horizon: '#d8f4fc' }, fog: { color: '#c4ecf6', near: 46, far: 150 },
    sun: { color: '#fff4dc', intensity: 3.1, dir: [0.42, 0.86, 0.3] }, hemi: { sky: '#b4e4ff', ground: '#e0cca0', intensity: 1.35 },
    rim: '#f0fcff', night: 0, grade: { lift: [0.0, 0.015, 0.025], gain: [1.0, 1.02, 1.03], sat: 1.12, vignette: 0.9, vigColor: [0.08, 0.22, 0.3] },
    bloom: { intensity: 0.8, threshold: 0.82 }, wind: { dir: [0.92, -0.38], strength: 1.15 },
  },
  terrain: TERRAIN,
  layout: LAYOUT,
  coastDist,
  populate: tidepoolPopulate,
  effects: tidepoolEffects,
  interactables: tidepoolInteractables,
  /** footstep sound under the hero (game.js plays whatever this returns) */
  footstep(pos, world) {
    const x = pos.x, z = pos.z, T = world?.terrain;
    if ((T?.waterAt?.(x, z) ?? 0) > 0.04) return 'footstep_water';
    if (world?.onDeck?.(x, z)) return 'footstep_wood';
    const s = T?.surfaceAt?.(x, z);
    if ((T?.slopeAt?.(x, z) ?? 0) > 0.3 || (s && s.accent > 0.3)) return 'footstep_stone';
    if (coastDist(x, z) < 10 || (s && s.sand > 0.45)) return 'footstep_sand';
    return 'footstep_grass';
  },
};
