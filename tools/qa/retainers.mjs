// Heap-snapshot retainer finder: after village<->dungeon round trips, prints the shortest strong retainer
// paths from GC roots to leaked instances of a class (default DungeonMode).
// usage: node --max-old-space-size=8192 tools/qa/retainers.mjs [ClassName] [trips]
import { chromium } from 'playwright-core';
const CLS = process.argv[2] || 'DungeonMode';
const TRIPS = +(process.argv[3] || 2);
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--js-flags=--expose-gc'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.routeWebSocket(/.*/, ws => { ws.onMessage(() => {}); });
await page.goto('http://localhost:5173/?fresh&nointro');
await page.waitForFunction(() => window.__ready === true, null, { timeout: 40000 });
await page.waitForTimeout(1500);
for (let i = 0; i < TRIPS; i++) {
  await page.evaluate((f) => G.enterDungeon(f), i + 1); await page.waitForTimeout(7000);
  await page.evaluate(() => G.returnToVillage()); await page.waitForTimeout(5000);
}
await page.evaluate(() => { gc(); gc(); });
const cdp = await page.context().newCDPSession(page);
let chunks = [];
cdp.on('HeapProfiler.addHeapSnapshotChunk', e => chunks.push(e.chunk));
await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
const snap = JSON.parse(chunks.join('')); chunks = null;
await browser.close();
const m = snap.snapshot.meta, NF = m.node_fields.length, EF = m.edge_fields.length;
const nTypes = m.node_types[0], eTypes = m.edge_types[0];
const N = snap.nodes, E = snap.edges, S = snap.strings;
const nName = i => S[N[i * NF + m.node_fields.indexOf('name')]];
const nType = i => nTypes[N[i * NF + m.node_fields.indexOf('type')]];
const nEdgeCount = i => N[i * NF + m.node_fields.indexOf('edge_count')];
const nodeCount = N.length / NF;
const firstEdge = new Uint32Array(nodeCount + 1);
for (let i = 0; i < nodeCount; i++) firstEdge[i + 1] = firstEdge[i] + nEdgeCount(i) * EF;
const eTypeI = m.edge_fields.indexOf('type'), eNameI = m.edge_fields.indexOf('name_or_index'), eToI = m.edge_fields.indexOf('to_node');
// reverse edges (strong only)
const revHead = new Int32Array(nodeCount).fill(-1), revNext = [], revFrom = [], revEdge = [];
for (let i = 0; i < nodeCount; i++) for (let e = firstEdge[i]; e < firstEdge[i + 1]; e += EF) {
  const t = eTypes[E[e + eTypeI]]; if (t === 'weak' || t === 'shortcut') continue;
  const to = E[e + eToI] / NF; const k = revFrom.length; revFrom.push(i); revEdge.push(e); revNext.push(revHead[to]); revHead[to] = k;
}
const edgeLabel = e => { const t = eTypes[E[e + eTypeI]]; const v = E[e + eNameI]; return (t === 'element' || t === 'hidden') ? `[${v}]` : S[v]; };
const targets = []; for (let i = 0; i < nodeCount; i++) if (nName(i) === CLS && nType(i) === 'object') targets.push(i);
console.log(`${targets.length} live ${CLS} instance(s)`);
const root = 0;
for (const t of targets.slice(0, 3)) {
  // BFS backwards to the root
  const prev = new Int32Array(nodeCount).fill(-2), prevE = new Int32Array(nodeCount); prev[t] = -1;
  const q = [t]; let found = -1;
  while (q.length && found < 0) {
    const x = q.shift();
    for (let k = revHead[x]; k !== -1; k = revNext[k]) {
      const f = revFrom[k]; if (prev[f] !== -2) continue;
      prev[f] = x; prevE[f] = revEdge[k];
      if (f === root || nType(f) === 'synthetic') { found = f; break; }
      q.push(f);
    }
  }
  const path = []; let c = found;
  while (c >= 0 && c !== t) { path.push(`${nName(c)} (${nType(c)}) --${edgeLabel(prevE[c])}-->`); c = prev[c]; }
  console.log('\nretainer path:\n  ' + path.slice(-14).join('\n  ') + `\n  ${CLS}`);
}
