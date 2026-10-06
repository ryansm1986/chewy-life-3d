// The maple zone dungeon's theme (docs/ZONES.md §8.2), merged into gen.js THEMES by ./themes.js. Pure data.
// Owned by the maple kit (./maple.js): the Maple Root Halls under Momiji Hollow's great maple. A dim, cool-violet base
// (the earth closes overhead), warm amber lantern pools, a few amber shafts through the root cracks; the bloom threshold
// sits high so the lanterns and the glowing fungus never blow out.
export const MAPLE_THEME = {
  mapleHalls: {
    name: 'Maple Root Halls', kit: 'mapleHalls',
    floor: ['#a48e7a', '#947e6c', '#b29c86'], wall: ['#7a6656', '#6a5848', '#8c7866'], top: ['#a0603a', '#8a4e30', '#c4844c'],
    fog: '#140e10', ambient: ['#c8c2d6', '#3a3234'], ambientI: 1.18, sun: '#e2dcf2', sunI: 0.8,
    accent: '#ffcf96', light: '#ffb070', lightI: 11, bloom: { intensity: 0.85, threshold: 0.86 },
    grade: { gain: [1.0, 0.985, 0.99], sat: 1.0, lift: [0.01, 0.006, 0.014] },
    monsters: ['kuri', 'kakashi', 'momijiWisp'], music: 'dungeon', wobble: 0.85,
  },
};
