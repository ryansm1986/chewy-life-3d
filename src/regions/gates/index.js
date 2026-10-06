// The zone dungeon gates' looks (regions/dungeonGate.js installGate; the format: ./bamboo.js). A zone whose look is
// still null falls back to the bamboo cave mouth.
import { BAMBOO_GATE } from './bamboo.js';
import { MAPLE_GATE } from './maple.js';
import { TIDEPOOL_GATE } from './tidepool.js';
import { ONSEN_GATE } from './onsen.js';

export const GATE_LOOKS = { bamboo: BAMBOO_GATE, maple: MAPLE_GATE, tidepool: TIDEPOOL_GATE, onsen: ONSEN_GATE };
/** the look for a zone's gate */
export const gateLook = zone => GATE_LOOKS[zone] || BAMBOO_GATE;
