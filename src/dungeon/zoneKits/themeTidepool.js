// The tidepool zone dungeon's theme (docs/ZONES.md §8.2), merged into gen.js THEMES by ./themes.js. Pure data.
// Owned by the tidepool kit (./tidepool.js). Tide Sea Caves: wet sea caves under the Shiokaze Tidepools. A dim, cool
// blue-green base (the sea's light), warm amber pools from the glass-float lanterns, pale moonlight falling through the
// blowholes (accent: the shafts), and a high bloom threshold so the glowing pools and plankton never blow out.
export const TIDEPOOL_THEME = {
  seaCave: {
    name: 'Tide Sea Caves', kit: 'seaCave',
    floor: ['#a39886', '#938878', '#b4a892'], wall: ['#5c666c', '#4e585e', '#6c767a'], top: ['#3e5a54', '#30484a', '#5a7a70'],
    fog: '#04101a', ambient: ['#8ab8d0', '#1a2832'], ambientI: 1.0, sun: '#c4dcf0', sunI: 0.62,
    accent: '#a4e4ff', light: '#ffbe72', lightI: 12, bloom: { intensity: 0.8, threshold: 0.9 },
    grade: { gain: [0.97, 1.0, 1.03], sat: 1.02, lift: [0.004, 0.01, 0.016] },
    monsters: ['kappa', 'heikegani', 'kurage'], music: 'dungeon', wobble: 0.85,
  },
};
