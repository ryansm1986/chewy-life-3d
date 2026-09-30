import { open } from './lib.mjs';
// CPU-profile the idle village from 6 s to 22 s after boot and list the functions with the most self time inside
// long frames (>16 ms). Uses the CDP Profiler with a 200 us sampling interval.
const s = await open('/?fresh&nointro&hour=9', { wait: 500 });
const cdp = await s.page.context().newCDPSession(s.page);
await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
await s.ev(() => { window.__long = []; let last = performance.now(); const f = t => { const d = t - last; if (d > 16) window.__long.push([t - d, t]); last = t; requestAnimationFrame(f); }; requestAnimationFrame(f); window.__t0 = performance.now(); });
await s.sleep(5500);
await cdp.send('Profiler.start');
const tStart = await s.ev(() => performance.now());
await s.sleep(16000);
const { profile } = await cdp.send('Profiler.stop');
const long = await s.ev(() => window.__long);
// map sample timestamps (us since profile start) to performance.now: profile.startTime is in us (monotonic)
const nodes = new Map(profile.nodes.map(n => [n.id, n]));
const parent = new Map(); for (const n of profile.nodes) for (const c of (n.children || [])) parent.set(c, n.id);
let t = profile.startTime; const selfIn = new Map(), selfAll = new Map(); let inLong = 0, total = 0;
// align: first sample ~ tStart
const off = tStart * 1000 - profile.startTime;
for (let i = 0; i < profile.samples.length; i++) {
  t += profile.timeDeltas[i]; const pt = (t + off) / 1000; const n = nodes.get(profile.samples[i]); const cf = n.callFrame;
  const key = `${cf.functionName || '(anon)'} ${cf.url.split('/').pop().split('?')[0]}:${cf.lineNumber + 1}`;
  const dt = (profile.timeDeltas[i + 1] || 200) / 1000;
  total += dt; selfAll.set(key, (selfAll.get(key) || 0) + dt);
  if (long.some(([a, b]) => pt >= a && pt <= b)) { inLong += dt; selfIn.set(key, (selfIn.get(key) || 0) + dt); }
}
const top = m => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => `${v.toFixed(1)}ms ${k}`);
console.log('long frames in window', long.filter(([a]) => a > tStart).length, 'ms sampled in long frames', inLong.toFixed(0), 'total', total.toFixed(0));
console.log('TOP self time inside long frames:\n ' + top(selfIn).join('\n '));
await s.close();
