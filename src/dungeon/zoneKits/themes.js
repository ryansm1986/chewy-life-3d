// The zone dungeons' themes (docs/ZONES.md §4, §8.2; ROADMAP Z-C1), merged into gen.js THEMES. Pure data (gen-fuzz runs
// gen.js in node). `kit` names the zone kit that renders the theme (dungeon/zoneKits/index.js); the colours feed the
// shared DungeonWorld (floor / wall base tones, fog, the hemisphere light, the key light, lantern light, the grade).
import { MAPLE_THEME } from './themeMaple.js';
import { TIDEPOOL_THEME } from './themeTidepool.js';
import { ONSEN_THEME } from './themeOnsen.js';

export const ZONE_THEMES = {
  ...MAPLE_THEME, ...TIDEPOOL_THEME, ...ONSEN_THEME, // (each zone's own file: its kit owns it)
  // Bamboo Depths: mossy stone caves under the Whispering Bamboo Grove, bamboo growing through the rock, little shrine
  // lanterns, paper charms and a stream. Jade shade, warm lantern pools, green-gold light falling through the cracks.
  bambooCave: {
    name: 'Bamboo Shrine Caves', kit: 'bambooCave',
    floor: ['#8f9686', '#808878', '#a2a896'], wall: ['#8a8f7a', '#7b806b', '#9ca08a'], top: ['#7cb45a', '#6aa04c', '#a8cc74'],
    fog: '#0a1512', ambient: ['#9cc4bc', '#26302a'], ambientI: 0.92, sun: '#d6e4de', sunI: 0.66,
    accent: '#eef8c4', light: '#ffc27a', lightI: 12, bloom: { intensity: 0.9, threshold: 0.84 },
    grade: { gain: [0.97, 1.01, 1.02], sat: 1.0, lift: [0.004, 0.012, 0.014] },
    monsters: ['takenoko', 'kodama', 'kamaitachi'], music: 'dungeon', wobble: 0.85,
  },
};
