import { open } from './lib.mjs';
// CPU profile of the first ground click (village): top functions by self time.
const s = await open('/?fresh&nointro&hour=10', { wait: 3500 });
const cdp = await s.page.context().newCDPSession(s.page);
await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
const cur = await s.ev(() => { const v = G.player.pos.clone().project(G.engine.camera); return [Math.round((v.x * .5 + .5) * innerWidth), Math.round((-v.y * .5 + .5) * innerHeight)]; });
await cdp.send('Profiler.start');
await s.page.mouse.move(cur[0] + 170, cur[1] + 50); await s.page.mouse.down(); await s.sleep(60); await s.page.mouse.up();
await s.sleep(400);
const { profile } = await cdp.send('Profiler.stop');
const self = new Map(); const byId = new Map(profile.nodes.map(n => [n.id, n]));
const dt = profile.timeDeltas; const cnt = new Map();
profile.samples.forEach((id, i) => cnt.set(id, (cnt.get(id) || 0) + (dt[i] || 0)));
for (const [id, us] of cnt) { const n = byId.get(id); const k = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').slice(-2).join('/')}:${n.callFrame.lineNumber + 1}`; self.set(k, (self.get(k) || 0) + us); }
const top = [...self].sort((a, b) => b[1] - a[1]).slice(0, 18).map(([k, us]) => `${(us / 1000).toFixed(1)}ms ${k}`);
console.log(top.join('\n'));
// inclusive: walk parents for the heaviest app frames
const parent = new Map(); for (const n of profile.nodes) for (const c of (n.children || [])) parent.set(c, n.id);
const incl = new Map();
for (const [id, us] of cnt) { const seen = new Set(); let x = id; while (x) { const n = byId.get(x); const k = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').slice(-2).join('/')}:${n.callFrame.lineNumber + 1}`; if (!seen.has(k)) { incl.set(k, (incl.get(k) || 0) + us); seen.add(k); } x = parent.get(x); } }
console.log('--- inclusive (src only)');
console.log([...incl].filter(([k]) => /src\//.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 18).map(([k, us]) => `${(us / 1000).toFixed(1)}ms ${k}`).join('\n'));
await s.close();
