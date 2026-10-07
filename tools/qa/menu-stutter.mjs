// First-open menu stutter (ROADMAP R-8) on the production bundle: for each menu, a fresh page boots, settles, then the
// menu is opened by its real key (or its game call), closed, and opened again. Per open: the worst frame (the longest
// rAF interval in the 0.75 s after the press: the open and its animation), the longest long task, the synchronous open
// call, and ('then') the worst frame of the next 0.75 s, while the menu sits open. Boot: time to
// window.__ready, and the worst frame / long tasks in the 6 s after it (the idle prewarm must not hitch either).
//
// usage: node tools/qa/menu-stutter.mjs [MENUS=inv,char,skills,quests,map,menu,settings,wheel,build,shop,smith,travel]
//        [AB=1 (also each menu with ?noprewarm, same run, interleaved)] [B_ROOT=<checkout> (its bundle too, interleaved)]
//        [FLOW=title|direct] [TITLE_MS=4000] [ROUNDS=1] [SETTLE=4000] [BASE=… (skip the build)]
//        [PROF=<menu> (a CPU profile of that first open: self time per function)] [TRACE=<menu> (a timeline trace of it)]
import { chromium } from 'playwright-core';
import { startProd, CHROME, CHROME_ARGS } from './prod-server.mjs';

const env = process.env;
const MENUS = (env.MENUS || 'inv,char,skills,quests,map,menu,settings,wheel,build,shop,smith,travel').split(',');
const ROUNDS = +(env.ROUNDS || 1), SETTLE = +(env.SETTLE || 4000);


// how each menu opens: a key (the real input path) or a game call
const OPEN = {
  inv: { key: 'i', name: 'inventory' }, char: { key: 'c', name: 'character' }, skills: { key: 'k', name: 'skills' }, quests: { key: 'j', name: 'quests' },
  map: { key: 'm', name: 'map' }, menu: { key: 'Escape', name: 'menu' },
  settings: { key: 'Escape', name: 'menu', then: () => document.querySelector('.p-menu [data-a="settings"]')?.click() },
  wheel: { call: () => { const G = window.G; G.heroes.openWheel(); }, close: () => window.G.heroes.wheel?.hide(), name: 'wheel' },
  build: { key: 'b', name: 'build', close: () => { const B = window.G.build; if (B?.active) B.exit(); } },
  shop: { call: () => window.G.openShop(), name: 'shop' },
  smith: { call: () => window.G.openSmith(), name: 'smith', close: () => { window.G.ui.dlg?.active && window.G.ui.dlg.finish?.(-1); window.G.ui.closeAll(); } },
  travel: { call: () => window.G.openTravel(), name: 'travel' },
};

const server = env.BASE ? null : await startProd();
const BASE = env.BASE || server.url;
if (server) console.log(`(production bundle built in ${(server.buildMs / 1000).toFixed(1)} s)`);
// B_ROOT=<another checkout>: its bundle too, interleaved menu by menu with this one (a load-robust before / after)
const serverB = env.B_ROOT ? await startProd({ root: env.B_ROOT }) : null;
const VARIANTS = [{ name: 'current', base: BASE, qs: env.QS || '' }, ...(env.AB ? [{ name: 'noprewarm', base: BASE, qs: 'noprewarm' }] : []), ...(serverB ? [{ name: 'B_ROOT', base: serverB.url, qs: '' }] : [])];
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: CHROME_ARGS });

// FLOW=title (default): the way the owner plays: a saved game, the title screen for TITLE_MS, Continue clicked (the
// session's first gesture), then the village. FLOW=direct: ?fresh&nointro straight into the village (no title, and the
// first menu key is the first gesture: it also pays the audio unlock).
const FLOW = env.FLOW || 'title', TITLE_MS = +(env.TITLE_MS || 4000);
async function boot(page, qs, base) {
  const BASE = base;
  let readyAt, titleAt = 0;
  if (FLOW === 'title') {
    await page.goto(`${BASE}/?fresh&nointro&notut&dseed=1&hour=10&noprewarm`); // (a save to continue)
    await page.waitForFunction(() => window.__ready === true && window.G?.player && window.G.save, null, { timeout: 90000 });
    await page.evaluate(() => { window.G.state.flags.mokaJoined = true; window.G.state.flags.poeJoined = true; window.G.save(); });
    await page.goto(`${BASE}/?notut&dseed=1&hour=10${qs ? '&' + qs : ''}`);
    await page.waitForFunction(() => window.__ready === true && window.G?.player && window.G.titleActive, null, { timeout: 90000, polling: 'raf' });
    readyAt = await page.evaluate(() => performance.now());
    await page.waitForTimeout(TITLE_MS);
    titleAt = await page.evaluate(() => performance.now());
    await page.click('[data-a="continue"]');
    await page.waitForFunction(() => !window.G.titleActive && window.G.mode === 'village' && !window.G.ui?.iris?.active, null, { timeout: 30000 });
  } else {
    await page.goto(`${BASE}/?fresh&nointro&notut&dseed=1&hour=10${qs ? '&' + qs : ''}`);
    await page.waitForFunction(() => window.__ready === true && window.G?.player, null, { timeout: 90000, polling: 'raf' });
    readyAt = await page.evaluate(() => performance.now());
  }
  // the frame / long-task recorder (from here on)
  await page.evaluate(() => {
    const R = window.__mf = { f: [], lt: [] };
    try { new PerformanceObserver(l => { for (const e of l.getEntries()) R.lt.push([e.startTime, e.duration]); }).observe({ type: 'longtask', buffered: true }); } catch (e) { /* */ }
    const f = () => { R.f.push(performance.now()); requestAnimationFrame(f); }; requestAnimationFrame(f);
    addEventListener('keydown', e => { R.key = performance.now(); }, true);
  });
  // the first six seconds of play (after ready, or after Continue): the boot's own hitches and the prewarm's
  const playAt = await page.evaluate(() => performance.now());
  await page.waitForTimeout(6000);
  const post = await page.evaluate(t0 => { const R = window.__mf; return win(R, t0, t0 + 6000); function win(R, a, b) { let w = 0, n = 0; for (let i = 1; i < R.f.length; i++) if (R.f[i] > a && R.f[i] <= b) { w = Math.max(w, R.f[i] - R.f[i - 1]); n++; } let lt = 0, lts = 0; for (const [s, d] of R.lt) if (s + d > a && s < b) { lt = Math.max(lt, d); lts += d; } return { worst: +w.toFixed(1), frames: n, lt: +lt.toFixed(0), ltSum: +lts.toFixed(0) }; } }, playAt);
  const pw = await page.evaluate(() => { const W = window.G?.ui?.prewarm; return W ? { done: W.done, left: W.left, ms: W.ms, steps: W.steps, longest: W.longest, at: W.doneAt, slow: [...W.log].sort((a, b) => b[1] - a[1]).slice(0, 5) } : null; });
  if (env.STEPS && pw) console.log('   prewarm slowest steps:', JSON.stringify(pw.slow), 'longest', pw.longest?.toFixed?.(1));
  await page.waitForTimeout(Math.max(0, SETTLE - 6000));
  return { readyAt: Math.round(readyAt), title: titleAt ? Math.round(titleAt - readyAt) : 0, post, pw };
}

const measure = (page, t0) => page.evaluate(t0 => {
  const R = window.__mf, a = R.key && R.key >= t0 - 5 ? R.key : t0, b = a + 750; // (the open itself: its spring-in animation is 0.56 s)
  let w = 0, first = 0;
  for (let i = 1; i < R.f.length; i++) if (R.f[i] > a && R.f[i - 1] < b) { const d = R.f[i] - R.f[i - 1]; if (!first) first = d; w = Math.max(w, d); } // (every frame overlapping the window: a freeze longer than it counts)
  let lt = 0; for (const [s, d] of R.lt) if (s + d > a && s < b) lt = Math.max(lt, d);
  let ws = 0; for (let i = 1; i < R.f.length; i++) if (R.f[i - 1] >= b && R.f[i] <= a + 1500) ws = Math.max(ws, R.f[i] - R.f[i - 1]); // (then the menu sits open: hidden-moment work may run)
  return { worst: +w.toFixed(1), first: +first.toFixed(1), lt: +lt.toFixed(0), sync: +(window.__openMs || 0).toFixed(1), settled: +ws.toFixed(1) };
}, t0);

async function openOnce(page, id) {
  const O = OPEN[id];
  const t0 = await page.evaluate(() => { window.__openMs = 0; const U = window.G.ui; if (!U.__timed) { const raw = U.open.bind(U); U.open = (n, o) => { const t = performance.now(); try { return raw(n, o); } finally { window.__openMs += performance.now() - t; } }; U.__timed = true; } return performance.now(); });
  if (O.key) await page.keyboard.press(O.key);
  else await page.evaluate(`void (${O.call.toString()})()`); // (void: a call that returns its dialogue's promise must not be awaited)
  if (O.then) { await page.waitForTimeout(250); await page.evaluate(`void (${O.then.toString()})()`); }
  await page.waitForTimeout(1600);
  const m = await measure(page, t0);
  const open = await page.evaluate(n => n === 'wheel' ? !!window.G.heroes.wheelOpen : n === 'build' ? !!window.G.build?.active || window.G.ui.isOpen('build') : n === 'smith' ? window.G.ui.anyModal() : window.G.ui.isOpen(n), O.name);
  // close
  if (O.close) await page.evaluate(`void (${O.close.toString()})()`); else { await page.evaluate(() => { window.G.ui.closeAll(); }); }
  await page.waitForTimeout(900);
  return { ...m, open };
}

async function profile(page, id) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 100 }); await cdp.send('Profiler.start');
  const r = await openOnce(page, id);
  const { profile: P } = await cdp.send('Profiler.stop');
  const byId = new Map(P.nodes.map(n => [n.id, n])), self = new Map();
  const dt = P.timeDeltas, smp = P.samples;
  for (let i = 0; i < smp.length; i++) { const n = byId.get(smp[i]); const k = `${n.callFrame.functionName || '(anon)'} ${(n.callFrame.url || '').split('/').pop()}:${n.callFrame.lineNumber}`; self.set(k, (self.get(k) || 0) + (dt[i] || 0) / 1000); }
  const top = [...self.entries()].filter(([k]) => !/^\(idle\)|^\(program\)|^\(garbage/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 25);
  console.log(`   PROFILE ${id} (${JSON.stringify(r)}): top self time (ms)`);
  for (const [k, ms] of top) console.log(`     ${ms.toFixed(1).padStart(7)}  ${k}`);
  // inclusive time per function (each sample counted once per distinct function on its stack)
  const parent = new Map(); for (const n of P.nodes) for (const c of n.children || []) parent.set(c, n.id);
  const inc = new Map();
  for (let i = 0; i < smp.length; i++) { const seen = new Set(); for (let id2 = smp[i]; id2 != null; id2 = parent.get(id2)) { const n = byId.get(id2), k = `${n.callFrame.functionName || '(anon)'} ${(n.callFrame.url || '').split('/').pop()}:${n.callFrame.lineNumber}`; if (seen.has(k)) continue; seen.add(k); inc.set(k, (inc.get(k) || 0) + (dt[i] || 0) / 1000); } }
  console.log('   inclusive (ms):');
  for (const [k, ms] of [...inc.entries()].filter(([k]) => !/^\(root\)|^\(idle\)|^\(program\)/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 30)) console.log(`     ${ms.toFixed(1).padStart(7)}  ${k}`);
  return r;
}

// TRACE=<menu>: a Chrome timeline trace round that first open: the main thread's time by event (script, style, layout,
// paint, image decode, GPU) inside the open's worst frame window
async function traced(page, id) {
  await browser.startTracing(page, { categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'v8.execute', 'blink', 'cc', 'gpu'] });
  const r = await openOnce(page, id);
  const buf = await browser.stopTracing();
  const T = JSON.parse(buf.toString()), ev = T.traceEvents || T;
  const main = ev.find(e => e.name === 'thread_name' && e.args?.name === 'CrRendererMain'); const tid = main?.tid, pid = main?.pid;
  const X = ev.filter(e => e.ph === 'X' && e.tid === tid && e.pid === pid && e.dur);
  const tasks = X.filter(e => e.name === 'RunTask' && e.dur > 12000).sort((a, b) => a.ts - b.ts);
  console.log(`   TRACE ${id} (${JSON.stringify(r)}): ${tasks.length} main-thread tasks over 12 ms in the trace`);
  const t00 = tasks[0]?.ts || 0;
  for (const top of tasks.slice(0, 8)) {
    const inTop = X.filter(e => e.ts >= top.ts && e.ts + e.dur <= top.ts + top.dur && e !== top);
    const by = new Map(); for (const e of inTop) by.set(e.name, (by.get(e.name) || 0) + e.dur / 1000);
    console.log(`    task at +${((top.ts - t00) / 1000).toFixed(0)} ms, ${(top.dur / 1000).toFixed(1)} ms: ${[...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 9).map(([k, ms]) => `${k} ${ms.toFixed(1)}`).join(' · ')}`);
  }
  // the other threads (the GPU process main thread, raster workers, the compositor): their longest events
  const names = new Map(ev.filter(e => e.name === 'thread_name').map(e => [e.pid + ':' + e.tid, e.args?.name]));
  const other = ev.filter(e => e.ph === 'X' && e.dur > 8000 && !(e.tid === tid && e.pid === pid));
  const byT = new Map(); for (const e of other) { const k = names.get(e.pid + ':' + e.tid) || 'tid' + e.tid; (byT.get(k) || byT.set(k, []).get(k)).push(e); }
  for (const [k, L] of byT) { L.sort((a, b) => b.dur - a.dur); console.log(`    ${k}: ${L.slice(0, 6).map(e => `${e.name} ${(e.dur / 1000).toFixed(1)}`).join(' · ')}`); }
  return r;
}

const rows = [];
const fmtRow = (id, V, b, idle, first, second, errs) => `${id.padEnd(9)} ${V.name.padEnd(10)} first: worst ${String(first.worst).padStart(6)} ms (lt ${String(first.lt).padStart(4)}, open() ${String(first.sync).padStart(5)} ms, then ${String(first.settled).padStart(5)})  second: worst ${String(second.worst).padStart(5)} ms (lt ${String(second.lt).padStart(4)})  idle ${idle} ms · ready ${b.readyAt} ms · play's first 6 s worst ${b.post.worst} / lt ${b.post.lt} (sum ${b.post.ltSum})${b.pw ? ` · prewarm ${b.pw.done ? 'done' : `${b.pw.left} left`} ${b.pw.ms | 0} ms in ${b.pw.steps} steps (longest ${(b.pw.longest || 0).toFixed(0)})` : ''}${first.open ? '' : '  [NOT OPEN]'}${errs.length ? '  ERR ' + errs[0].slice(0, 120) : ''}`;
const idleOf = page => page.evaluate(async () => { const R = window.__mf, a = performance.now(); await new Promise(q => setTimeout(q, 1500)); let w = 0; for (let i = 1; i < R.f.length; i++) if (R.f[i] > a) w = Math.max(w, R.f[i] - R.f[i - 1]); return +w.toFixed(1); });
// SESSION=1 (the default in FLOW=title): one page per variant and round, every menu opened in turn (a real session), then
// a second pass of opens; the rounds alternate the variants' order. SESSION=0: a fresh page per menu (each first open
// in a page of its own).
const SESSION = env.SESSION ? env.SESSION !== '0' : FLOW === 'title';
if (SESSION) for (let round = 0; round < ROUNDS; round++) for (const V of round % 2 ? [...VARIANTS].reverse() : VARIANTS) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  const b = await boot(page, V.qs, V.base);
  await page.evaluate(() => { const G = window.G; G.state.flags.mokaJoined = true; G.state.flags.poeJoined = true; });
  const idle = await idleOf(page), firsts = {};
  for (const id of MENUS) firsts[id] = await openOnce(page, id);
  for (const id of MENUS) { const second = await openOnce(page, id); rows.push({ id, v: V.name, round, boot: b, idle, first: firsts[id], second, errs: errs.slice(0, 2) }); console.log(fmtRow(id, V, b, idle, firsts[id], second, errs)); }
  await ctx.close();
}
else for (let round = 0; round < ROUNDS; round++) for (const id of MENUS) for (const V of VARIANTS) {
  const v = V.qs;
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  const b = await boot(page, v, V.base);
  if (id === 'wheel') await page.evaluate(() => { const G = window.G; G.state.flags.mokaJoined = true; G.state.flags.poeJoined = true; }); // (two joined heroes: the wheel has cards)
  const idle = await idleOf(page);
  const [tId, tN] = (env.TRACE || '').split(':'); // (TRACE=inv traces the first open, TRACE=inv:2 the second)
  const [pId, pN] = (env.PROF || '').split(':');
  const first = pId === id && pN !== '2' ? await profile(page, id) : tId === id && tN !== '2' ? await traced(page, id) : await openOnce(page, id);
  const second = tId === id && tN === '2' ? await traced(page, id) : pId === id && pN === '2' ? await profile(page, id) : await openOnce(page, id);
  rows.push({ id, v: V.name, round, boot: b, idle, first, second, errs: errs.slice(0, 2) });
  console.log(fmtRow(id, V, b, idle, first, second, errs));
  await ctx.close();
}
// summary per variant
for (const v of new Set(rows.map(r => r.v))) {
  const R = rows.filter(r => r.v === v), med = a => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
  console.log(`== ${v}: first-open worst frame max ${Math.max(...R.map(r => r.first.worst))} ms (median ${med(R.map(r => r.first.worst))}), second-open max ${Math.max(...R.map(r => r.second.worst))} ms; ready median ${med(R.map(r => r.boot.readyAt))} ms; play's first 6 s: worst median ${med(R.map(r => r.boot.post.worst))} ms, long-task sum median ${med(R.map(r => r.boot.post.ltSum))} ms (FLOW=${FLOW})`);
}
// the table: each menu's first-open worst frame per variant (the median over rounds) and its second open
{
  const med = a => { const q = [...a].sort((x, y) => x - y); return q.length ? q[q.length >> 1] : NaN; }, names = [...new Set(rows.map(r => r.v))];
  console.log(`
${'menu'.padEnd(9)} ${names.map(n => (n + ' 1st/2nd').padStart(22)).join('')}`);
  for (const id of MENUS) console.log(`${id.padEnd(9)} ${names.map(n => { const R = rows.filter(r => r.id === id && r.v === n); return `${med(R.map(r => r.first.worst))} / ${med(R.map(r => r.second.worst))}`.padStart(22); }).join('')}`);
}
if (env.JSON) (await import('node:fs')).writeFileSync(env.JSON, JSON.stringify(rows, null, 1));
await browser.close();
if (server) await server.close();
if (serverB) await serverB.close();
