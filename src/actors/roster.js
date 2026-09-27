// Named villagers of Blossom Hollow (humanoid cartoony animals).
export const VILLAGERS = [
  { id: 'mochi', anchor: { x: 57, z: 58 }, wander: 4, spec: { name: 'Mochi', species: 'cat', voice: 1.4, fur: '#fff4ea', fur2: '#ffffff', fur3: '#f4a860', earColor: '#f4a860', outfit: { top: 'kimono', topColor: '#ff9ec0', bottomColor: '#6a4a6a', sash: '#ffd24a' } },
    likes: ['fish', 'petal', 'silk'], bio: 'A dreamy calico who paints the sunrise every morning.' },
  { id: 'usagi', anchor: { x: 52, z: 64 }, wander: 5, spec: { name: 'Usagi', species: 'bunny', voice: 1.6, fur: '#ffffff', fur2: '#fff8f4', earColor: '#ffffff', outfit: { top: 'overalls', topColor: '#8fd0ff', bottomColor: '#5a8ad8', shirt: '#fff0a8', hat: 'flower', hatColor: '#ffb0d0' } },
    likes: ['carrot', 'petal'], bio: 'A bouncy gardener who knows every flower by name.' },
  { id: 'kuma', anchor: { x: 61, z: 63 }, wander: 3, spec: { name: 'Kuma', species: 'bear', voice: 0.7, fur: '#a86a44', fur2: '#e8c49a', outfit: { top: 'none', apron: '#fff6e8', hat: 'chef', scarf: '#7cc45a' } },
    likes: ['honey', 'mochi'], bio: 'Bakes the fluffiest melon-pan on the island.' },
  { id: 'kitsune', anchor: { x: 74, z: 56 }, wander: 6, spec: { name: 'Kitsune', species: 'fox', voice: 1.2, fur: '#ff9a4a', fur2: '#fff4e8', earColor: '#ff8a3a', outfit: { top: 'kimono', topColor: '#6a5ad0', bottomColor: '#3a3060', sash: '#ff5a6a' } },
    likes: ['lantern', 'crystal'], bio: 'A mysterious shrine keeper who hums old songs.' },
  { id: 'pan', anchor: { x: 55, z: 72 }, wander: 5, spec: { name: 'Pan', species: 'panda', voice: 0.9, fur: '#fbf8f4', fur2: '#ffffff', outfit: { top: 'none', scarf: '#ff7a8a' } },
    likes: ['bamboo', 'mochi'], bio: 'Naps a lot. Surprisingly good at kemari.' },
  { id: 'tanu', anchor: { x: 48, z: 58 }, wander: 4, spec: { name: 'Tanu', species: 'tanuki', voice: 0.85, fur: '#a08070', fur2: '#f0e0d0', fur3: '#4a3a34', earColor: '#4a3a34', outfit: { top: 'none', hat: 'leaf', bag: '#c8a060' } },
    likes: ['coins', 'lantern'], bio: 'A cheeky merchant. Swears the leaf hat is for fashion.' },
  { id: 'kero', anchor: { x: 67, z: 69 }, wander: 3, spec: { name: 'Kero', species: 'frog', voice: 1.1, fur: '#8ad86a', fur2: '#e8f8c8', outfit: { top: 'none', scarf: '#e8503a' } },
    likes: ['stone', 'fish'], bio: 'Guardian of the koi pond. Very serious about lily pads.' },
];

// Randomised townsfolk who move into homes as the village grows.
const NAMES = ['Momo', 'Hana', 'Sora', 'Yuki', 'Kiki', 'Riku', 'Nori', 'Mugi', 'Kuri', 'Tofu', 'Azuki', 'Ume', 'Haru', 'Natsu', 'Koko', 'Pipi', 'Fuku', 'Chibi', 'Maru', 'Suzu', 'Taro', 'Mimi', 'Beni', 'Shiro'];
const SPECIES = [
  ['cat', ['#fff4ea', '#f4a860', '#8a8a9a', '#3a3440', '#ffd8a8']], ['bunny', ['#ffffff', '#e8d0c0', '#b8a898']], ['bear', ['#a86a44', '#d8a878', '#6a4a3a']],
  ['fox', ['#ff9a4a', '#f4d0a0']], ['panda', ['#fbf8f4']], ['tanuki', ['#a08070']], ['frog', ['#8ad86a', '#6ac8a0', '#b8e070']], ['duck', ['#fff8ec', '#ffe8a0']], ['dog', ['#e8c89a', '#fff4ea', '#9a6a4a', '#3a3036']],
];
const TOPS = ['shirt', 'kimono', 'overalls', 'gi', 'dress', 'none', 'none', 'none']; // 'none' = fur + an accessory
const COLORS = ['#ff8fb0', '#8fd0ff', '#ffd24a', '#8fe0c0', '#c8a8ff', '#ff9a6a', '#6a8aff', '#ff6a7a', '#a0d060', '#f4f0e8'];
const HATS = [null, null, null, 'straw', 'beret', 'flower', 'bandana', 'leaf'];
export function randomVillagerSpec(rng = Math.random) {
  const pick = a => a[Math.floor(rng() * a.length)];
  const [species, furs] = pick(SPECIES);
  const fur = pick(furs);
  const top = pick(TOPS);
  const spec = {
    name: pick(NAMES), species, fur, fur2: '#fff8f0', voice: 0.8 + rng() * 0.8, seed: Math.floor(rng() * 1e6),
    outfit: { top, topColor: pick(COLORS), topColor2: '#ffffff', bottomColor: pick(['#4a4a6a', '#6a4a3a', '#3a5a8a', '#5a3a5a']), bottom: rng() < 0.3 ? 'shorts' : undefined, hat: pick(HATS), hatColor: pick(COLORS), sash: top === 'kimono' ? pick(COLORS) : undefined, apron: rng() < 0.12 ? '#fff6e8' : undefined },
  };
  if (top === 'none') { // fur + one signature accessory
    spec.outfit.bottom = undefined; spec.outfit.apron = undefined;
    const r = rng(); if (r < 0.5) spec.outfit.scarf = pick(COLORS); else if (r < 0.75) spec.outfit.bag = pick(COLORS); else if (!spec.outfit.hat) spec.outfit.hat = pick(['straw', 'flower', 'bandana', 'beret']);
  }
  if (species === 'tanuki') { spec.fur3 = '#4a3a34'; spec.earColor = '#4a3a34'; }
  if (species === 'cat' && rng() < 0.5) spec.fur3 = pick(furs);
  return spec;
}
