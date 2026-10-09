// id → model builder fn(B, level, variant)
import { homeL1, homeL2, homeL3 } from './homes.js';
import { townHall, chewyHouse, rosieShop, boneSmith, dungeonGate, bulletinBoard } from './special.js';
import { shopL1, shopL2, shopL3 } from './shops.js';
import { farm, lumber, kiln, fishingHut } from './workshops.js';
import { well, waterTower, stoneLantern, streetLamp, park, shrine, onsen, clinic, school } from './services.js';
import { bench, flowerBed, fountain, sakuraPlanter, miniTorii, koiStatue, lanternString, fence, bridge, chewyStatue } from './decor.js';
import { G, C } from './kit.js';
import { sprinkler } from '../../life/gardenModels.js';
import { guild } from './guild.js';
import { BUILDINGS } from './catalog.js';

function placeholder(B) {
  const [w, d] = B.footprint;
  const g = G.box(w * 0.8, 1, d * 0.8, 0.1); g.translate(0, 0.5, 0); B.add(g, C.stoneDark);
  B.height = 1;
}

export const MODELS = {
  townHall, chewyHouse, rosieShop, boneSmith, dungeonGate, bulletinBoard, farm, lumber, kiln, fishingHut,
  well, waterTower, stoneLantern, streetLamp, park, shrine, onsen, clinic, school,
  bench, flowerBed, fountain, sakuraPlanter, miniTorii, koiStatue, lanternString, fence, bridge, chewyStatue, sprinkler,
  guild, // (the Adventurers' Guild, levels 1-3: buildings/guild.js, docs/COZY.md §5.1)
  home: (B, L) => (L === 1 ? homeL1(B) : L === 2 ? homeL2(B) : homeL3(B)),
  shop: (B, L) => (L === 1 ? shopL1(B) : L === 2 ? shopL2(B) : shopL3(B)),
};
for (const id of Object.keys(BUILDINGS)) if (!MODELS[id]) MODELS[id] = placeholder;
