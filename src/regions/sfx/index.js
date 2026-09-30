// Every region sound, merged into the sfx table by src/audio/sfx.js (pure data files only: the audio chunk must not pull
// in model / game code).
import { SFX as env } from './env.js';
import { SFX as ambient } from './ambient.js';
import { SFX as mBamboo } from '../monsters/bamboo.sfx.js';
import { SFX as mMaple } from '../monsters/maple.sfx.js';
import { SFX as mTide } from '../monsters/tidepool.sfx.js';
import { SFX as mOnsen } from '../monsters/onsen.sfx.js';
import { SFX as bTengu } from '../bosses/tengu.sfx.js';
import { SFX as bTanuki } from '../bosses/tanuki.sfx.js';
import { SFX as bUmi } from '../bosses/umibozu.sfx.js';
import { SFX as bYuki } from '../bosses/yukionna.sfx.js';

export const REGION_SFX = {};
for (const S of [env, ambient, mBamboo, mMaple, mTide, mOnsen, bTengu, bTanuki, bUmi, bYuki]) {
  for (const k in S) { if (REGION_SFX[k]) throw new Error(`region sfx clash: ${k}`); REGION_SFX[k] = S[k]; }
}
