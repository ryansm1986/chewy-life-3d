// The garden's growth rules (docs/HOMESTEAD.md §2), kept pure so node can test them (tools/test-rpg.mjs); garden.js
// applies them to its tile records { till?, crop?, stage?, wet? }.
import { CROPS } from './pantry.js';

/** One night for a tile record (mutates it) → 'grew' | 'thirsty' | null; ripe: whether it's ripe afterwards.
 *  A watered crop grows one stage (up to ripe), a dry one only waits (nothing ever dies), and the soil dries. */
export function growNight(r) {
  const C = r?.crop && CROPS[r.crop];
  if (!C) { if (r) r.wet = false; return { step: null, ripe: false }; }
  const s = r.stage || 0;
  let step = null;
  if (s < C.days) { if (r.wet) { r.stage = s + 1; step = 'grew'; } else step = 'thirsty'; }
  r.wet = false;
  return { step, ripe: (r.stage || 0) >= C.days };
}
export const isRipe = r => !!(r?.crop && CROPS[r.crop] && (r.stage || 0) >= CROPS[r.crop].days);
/** Harvest a ripe record (mutates it) → how many came up. Regrowing crops step back `regrow` days and stay planted;
 *  the others leave tilled, dry soil. rng: () => [0, 1) */
export function harvestCrop(r, rng = Math.random) {
  const C = CROPS[r.crop], [a, b] = C.yield || [1, 1], n = a + Math.floor(rng() * (b - a + 1));
  if (C.regrow) { r.stage = Math.max(1, C.days - C.regrow); r.wet = false; }
  else { r.crop = null; r.stage = 0; r.wet = false; }
  return n;
}
/** The 8 tile offsets a sprinkler waters round its own tile. */
export const SPRINKLE = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
