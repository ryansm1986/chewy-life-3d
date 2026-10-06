// The onsen zone dungeon's theme (docs/ZONES.md §8.2), merged into gen.js THEMES by ./themes.js. Pure data.
// Owned by the onsen kit (./onsen.js).
// Onsen Ice Caverns: ice caves under Yukimi Onsen. A dim, cold blue base (snow and ice are bright: the key and fill stay
// low and the bloom threshold high, so a snowfield never washes the frame out) against warm pools of lantern and
// hot-spring light. The accent (lerped to white) colours the shafts falling through the ice in the roof and the motes.
export const ONSEN_THEME = {
  iceCavern: {
    name: 'Onsen Ice Caverns', kit: 'iceCavern',
    floor: ['#c6d2e0', '#b6c4d6', '#d4dde8'], wall: ['#6a7a94', '#5a6a84', '#7c8ca4'], top: ['#d8e4f0', '#c4d4e6', '#eef4fa'],
    fog: '#050a16', ambient: ['#9cb8dc', '#1a2234'], ambientI: 0.84, sun: '#c4d8f0', sunI: 0.58,
    introPulse: '#bfe4ff', introPulseK: 0.18, // (the boss intro's screen pulse: an icy flash, not the Burrow's pink)
    accent: '#b8dcff', light: '#ffb070', lightI: 12, bloom: { intensity: 0.7, threshold: 0.93 },
    grade: { gain: [0.98, 1.0, 1.03], sat: 1.04, lift: [0.004, 0.008, 0.018] },
    monsters: ['yukiwarashi', 'yukidaruma', 'tsurara'], music: 'dungeon', wobble: 0.85,
  },
};
