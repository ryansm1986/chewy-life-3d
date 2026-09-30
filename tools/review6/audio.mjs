import { open } from './lib.mjs';
import fs from 'node:fs';
import { OUT } from './lib.mjs';
// Offline render check of every sfx / music track / sting / ambience (?test=audio); summary + problems.
const s = await open('/?test=audio', { wait: 1500 });
await s.page.setDefaultTimeout(0);
const r = await s.page.evaluate(() => window.renderCheck({ musicSeconds: 6, chain: 'full' }));
fs.writeFileSync(OUT + '/audio_check.json', JSON.stringify(r, null, 1));
console.log('ms', r.ms, 'sfx', Object.keys(r.sfx).length, 'music', Object.keys(r.music).length, 'amb', Object.keys(r.ambience).length);
console.log('problems', JSON.stringify(r.problems));
const mus = Object.entries(r.music).map(([k, v]) => `${k}: peak ${v.peak} rms ${v.rms} loud ${v.loud} cen ${v.centroid}`);
console.log(mus.join('\n'));
const sfx = Object.entries(r.sfx).sort((a, b) => b[1].loud - a[1].loud);
console.log('loudest sfx', sfx.slice(0, 6).map(([k, v]) => k + ':' + v.loud).join(' '), '\nquietest sfx', sfx.slice(-8).map(([k, v]) => k + ':' + v.loud).join(' '));
await s.close();
