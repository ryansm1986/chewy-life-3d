// itch.io build: a relative-path production build, checked against itch's HTML5 limits, zipped for upload.
//   npm run build:itch            build + check + zip  ->  release/pawhaven-itch-v<version>.zip
//   npm run build:itch -- --test  ...then boot the zip's contents inside an itch-style iframe (a sub-folder on another
//                                 origin path) with headless Chrome and fail on errors / 404s; saves a screenshot. Then
//                                 an iPad on itch's game page (CT-6): itch's own buttons over the frame (their measured
//                                 boxes) and a frame wider than the screen; the touch HUD must clear both
// itch serves HTML5 games from a CDN sub-folder inside an iframe, so every URL must be relative (base './'): an
// absolute "/assets/..." works on the dev server but 404s on itch. The checks below catch that before upload.
import { build } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'dist-itch');
const REL = path.join(ROOT, 'release');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const ZIP = path.join(REL, `pawhaven-itch-v${pkg.version}.zip`);
const TEST = process.argv.includes('--test');
// itch.io HTML5 upload limits (https://itch.io/docs/creators/html5): index.html at the zip root, at most 1000 files,
// 500 MB extracted in total, 200 MB per file, 240 characters per path (UTF-8, case-sensitive on their CDN).
const LIMITS = { files: 1000, total: 500 * 2 ** 20, file: 200 * 2 ** 20, name: 240 };

const MB = n => (n / 2 ** 20).toFixed(1) + ' MB';
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(d => (d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]));

// ---- 1. build with relative URLs
console.log('== building (base ./) ->', path.relative(ROOT, OUT));
// (VITE_ITCH: the game knows it's the itch build, so inside a frame it keeps clear of itch's buttons: ui/mobile.js, CT-6)
await build({ root: ROOT, base: './', logLevel: 'warn', define: { 'import.meta.env.VITE_ITCH': JSON.stringify('1') }, build: { outDir: OUT, emptyOutDir: true, reportCompressedSize: false, chunkSizeWarningLimit: 8192 } });

// licences of what ships inside the bundle: the UI fonts (OFL) and the runtime npm dependencies (their LICENSE files;
// the minified bundle drops the source headers). Models, textures and audio are made by this project.
const LIC = path.join(OUT, 'licenses');
fs.mkdirSync(LIC, { recursive: true });
const shipped = [];
for (const f of fs.readdirSync(path.join(ROOT, 'src/ui/fonts')).filter(f => /^OFL-.*\.txt$/.test(f))) {
  fs.copyFileSync(path.join(ROOT, 'src/ui/fonts', f), path.join(LIC, f));
  shipped.push(`${f}  (${f === 'OFL-fredoka.txt' ? 'Fredoka' : 'M PLUS Rounded 1c'} font, SIL Open Font License 1.1)`);
}
for (const dep of Object.keys(pkg.dependencies || {})) {
  const dir = path.join(ROOT, 'node_modules', dep), meta = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  const lic = fs.readdirSync(dir).find(f => /^(licen[cs]e|copying)/i.test(f));
  if (!lic) { console.warn(`   warning: ${dep} has no LICENSE file to ship`); continue; }
  fs.copyFileSync(path.join(dir, lic), path.join(LIC, `${dep}-LICENSE.txt`));
  shipped.push(`${dep}-LICENSE.txt  (${dep} ${meta.version}, ${meta.license})`);
}
fs.writeFileSync(path.join(LIC, 'README.txt'), `Pawhaven ${pkg.version}: third-party software included in this build\n\n${shipped.join('\n')}\n`);

// ---- 2. check against itch's rules
const files = walk(OUT);
const problems = [], notes = [];
const rel = f => path.relative(OUT, f).split(path.sep).join('/');
if (!fs.existsSync(path.join(OUT, 'index.html'))) problems.push('no index.html at the root');
let total = 0;
for (const f of files) {
  const n = fs.statSync(f).size; total += n;
  if (n > LIMITS.file) problems.push(`${rel(f)} is ${MB(n)} (itch's per-file limit is ${MB(LIMITS.file)})`);
  if (rel(f).length > LIMITS.name) problems.push(`${rel(f)}: path longer than ${LIMITS.name} characters`);
}
if (files.length > LIMITS.files) problems.push(`${files.length} files (itch allows ${LIMITS.files})`);
if (total > LIMITS.total) problems.push(`${MB(total)} in total (itch allows ${MB(LIMITS.total)})`);
// root-absolute URLs in HTML / CSS / JS ("/assets/x", url(/x)) break inside itch's sub-folder
const ABS = [/(?:src|href)\s*=\s*["']\/(?!\/)[^"']*/g, /url\(\s*["']?\/(?!\/)[^)"']*/g, /["'`]\/(?:assets|rigs|models|fonts)\/[^"'`]*/g];
const EXTERNAL = /https?:\/\/(?!www\.w3\.org)[a-z0-9.-]+\.[a-z]{2,}[^\s"'`)]*/gi;
for (const f of files.filter(f => /\.(html|css|js)$/.test(f))) {
  const s = fs.readFileSync(f, 'utf8');
  for (const re of ABS) for (const m of s.match(re) || []) problems.push(`${rel(f)}: root-absolute URL ${m.slice(0, 80)}`);
  const ext = [...new Set((s.match(EXTERNAL) || []).map(u => u.replace(/[\\,;]+$/, '')))];
  if (ext.length) notes.push(`${rel(f)} mentions ${ext.slice(0, 4).join(', ')}${ext.length > 4 ? ' …' : ''} (fine unless the game fetches it: the test below fails on any external request)`);
}
// the UI fonts are subset to the characters the source used when they were built (src/ui/fonts/chars.txt): new
// Japanese text or symbols since then would render in a fallback font until `npm run fonts` is re-run
const built = new Set(fs.readFileSync(path.join(ROOT, 'src/ui/fonts/chars.txt'), 'utf8'));
const srcFiles = [path.join(ROOT, 'index.html'), ...walk(path.join(ROOT, 'src')).filter(f => /\.(js|css|html)$/.test(f))];
const fresh = new Set();
for (const f of srcFiles) for (const c of fs.readFileSync(f, 'utf8')) if (c.codePointAt(0) > 0x7e && !built.has(c)) fresh.add(c);
if (fresh.size) notes.push(`${fresh.size} characters in the source are newer than the font subset (${[...fresh].slice(0, 20).join('')}${fresh.size > 20 ? '…' : ''}): run \`npm run fonts\``);
console.log(`   ${files.length} files, ${MB(total)} (limits: ${LIMITS.files} files, ${MB(LIMITS.total)})`);
for (const n of notes) console.log('   note:', n);
if (problems.length) {
  console.error('== NOT itch-ready:\n   ' + [...new Set(problems)].slice(0, 30).join('\n   '));
  process.exit(1);
}

// ---- 3. zip (store + deflate, no dependencies)
const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = buf => { let c = -1; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function zip(entries) { // entries: [{ name, data }] -> Buffer (zip32; fine below 4 GB / 65535 files)
  const local = [], central = []; let off = 0;
  const dosTime = 0x0000, dosDate = 0x5a21; // fixed timestamp (2025-01-01) so the same build gives the same zip
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8'), crc = crc32(data);
    const packed = zlib.deflateRawSync(data, { level: 9 });
    const useDeflate = packed.length < data.length, body = useDeflate ? packed : data, method = useDeflate ? 8 : 0;
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(method, 8);
    lh.writeUInt16LE(dosTime, 10); lh.writeUInt16LE(dosDate, 12); lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(body.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nameBuf.length, 26);
    local.push(lh, nameBuf, body);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8);
    ch.writeUInt16LE(method, 10); ch.writeUInt16LE(dosTime, 12); ch.writeUInt16LE(dosDate, 14); ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(body.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt32LE(off, 42);
    central.push(ch, nameBuf);
    off += 30 + nameBuf.length + body.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...local, cd, end]);
}
fs.mkdirSync(REL, { recursive: true });
const entries = files.map(f => ({ name: rel(f), data: fs.readFileSync(f) })).sort((a, b) => a.name.localeCompare(b.name));
fs.writeFileSync(ZIP, zip(entries));
console.log(`== itch-ready: ${path.relative(ROOT, ZIP)} (${MB(fs.statSync(ZIP).size)} zipped)`);

// itch's game page for an embedded HTML game, as an iPad in landscape (1180 wide) lays it out (CT-6; measured on the real
// page 2026-10-08, ITCH.md "Mobile"): the header leaves the frame 20 px down; the frame is the embed size (1280 x 720),
// wider than the screen; #user_tools (game.css between 960 and 1300 px wide: absolute, 10 px in from the top right,
// z-index 2) holds three 21 px buttons 10 apart, 158, 136 and 123 px wide; the frame's Fullscreen button is 30 px, 8 px
// in from its bottom right (.fullscreen_btn)
const ITCH_PAGE = src => `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>
  body { margin: 0; background: #eee; } .header { height: 20px; }
  .game_frame { position: relative; margin: 0 auto; width: 1280px; height: 720px; background: #e5e5e5; } .game_frame iframe { display: block; border: 0; }
  .fullscreen_btn { position: absolute; bottom: 0; right: 0; margin: 8px; width: 30px; height: 30px; padding: 0; border: 0; opacity: .4; background: #222; border-radius: 4px; }
  .user_tools { position: absolute; top: 0; right: 0; margin: 10px 10px 0 0; padding: 0; list-style: none; z-index: 2; text-align: right; pointer-events: none; }
  .user_tools li { margin-bottom: 10px; height: 21px; } .user_tools li:last-child { margin-bottom: 0; }
  .user_tools a { display: inline-block; height: 21px; background: rgba(0, 0, 0, .6); box-shadow: 0 0 0 1px rgba(255, 255, 255, .2); pointer-events: auto; }
</style></head><body><ul id="user_tools" class="user_tools"><li><a style="width:158px"></a></li><li><a style="width:136px"></a></li><li><a style="width:123px"></a></li></ul>
<div class="header"></div><div class="game_frame"><button class="fullscreen_btn"></button><iframe src="${src}" width="1280" height="720" allowfullscreen allow="autoplay; fullscreen *; gamepad"></iframe></div></body></html>`;

// ---- 4. optional: boot it the way itch serves it (iframe -> /html/<id>/index.html) and look for errors
if (TEST) {
  const { chromium } = await import('playwright-core');
  const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav' };
  const PREFIX = '/html/1234567/';
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    if (url === '/' || url === '/index.html') {
      res.writeHead(200, { 'content-type': 'text/html' });
      return res.end(`<!doctype html><body style="margin:0;background:#111"><iframe src="${PREFIX}index.html" width="1280" height="720" allow="autoplay; fullscreen; gamepad" style="border:0"></iframe></body>`);
    }
    if (url === '/ipad.html') { // itch's game page as an iPad sees it (ITCH_PAGE above)
      res.writeHead(200, { 'content-type': 'text/html' });
      return res.end(ITCH_PAGE(`${PREFIX}index.html?fresh&nointro&notut`));
    }
    const f = url.startsWith(PREFIX) ? path.join(OUT, url.slice(PREFIX.length)) : null;
    if (!f || !f.startsWith(OUT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(f).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1300, height: 740 } });
  const errs = [], bad = [];
  page.on('console', m => { // a failed load's text has no URL; it's in location() ("/favicon.ico" is the wrapper page's)
    const where = m.location()?.url || '';
    if (m.type() === 'error' && !/favicon/.test(m.text() + where)) errs.push(m.text().slice(0, 200) + (where ? ` (${where.replace(base, '')})` : ''));
  });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('response', r => { if (r.status() >= 400 && !/favicon/.test(r.url())) bad.push(`${r.status()} ${r.url().replace(base, '')}`); });
  page.on('request', r => { const u = r.url(); if (!u.startsWith(base) && !u.startsWith('data:') && !u.startsWith('blob:')) bad.push('external request ' + u); });
  const t0 = Date.now();
  await page.goto(base + '/');
  const frame = await (await page.waitForSelector('iframe')).contentFrame();
  let state = null;
  try {
    // wait for the real title screen (the UI built and the boot overlay gone), not just G existing: G.mode is set early
    await frame.waitForFunction(() => window.__ready === true && window.G?.ui && window.G.titleActive && !document.querySelector('#boot:not(.gone)'), null, { timeout: 150000 });
    await page.waitForTimeout(3000);
    state = await frame.evaluate(() => ({ title: !!window.G.titleActive, mode: window.G.mode, ui: !!window.G.ui, audio: !!window.G.audio, fonts: [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family + ' ' + f.weight) }));
  } catch (e) { errs.push('did not reach the title screen in 150 s'); }
  const shot = path.join(REL, 'itch-test.png');
  await page.screenshot({ path: shot });
  await browser.close();
  console.log(`== iframe test (${PREFIX}): ${state ? `title in ${((Date.now() - t0) / 1000).toFixed(1)} s` : 'FAILED'} · screenshot ${path.relative(ROOT, shot)}`);
  if (state) console.log('   ' + JSON.stringify(state));
  const fails = [...new Set([...bad, ...errs])];
  if (fails.length) { console.error('   problems:\n   ' + fails.slice(0, 20).join('\n   ')); server.close(); process.exit(1); }
  console.log('== iframe test: PASS (no errors, no 404s, no external requests)');

  // ---- 5. an iPad on itch's page: the frame is 1280 wide on a 1180 screen (its right 100 px off the page), and itch's
  //         button column floats over its top right. The touch HUD must keep clear of both (ui/mobile.js, CT-6)
  const b2 = await chromium.launch({ executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist'] });
  const ctx = await b2.newContext({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' });
  const ip = await ctx.newPage();
  const errs2 = [];
  ip.on('pageerror', e => errs2.push('pageerror: ' + e.message));
  ip.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text() + (m.location()?.url || ''))) errs2.push(m.text().slice(0, 200)); });
  await ip.goto(base + '/ipad.html');
  const f2 = await (await ip.waitForSelector('iframe')).contentFrame();
  let ipad = null;
  try {
    await f2.waitForFunction(() => window.G?.ui?.ready && document.querySelector('.tc.on') && !document.querySelector('#boot:not(.gone)') && window.G.ui.mobile?.vis, null, { timeout: 150000 });
    await f2.waitForFunction(() => { const s = window.G.ui.mobile.sf; return s && s.r >= 90 && s.t >= 74; }, null, { timeout: 10000, polling: 'raf' }).catch(() => {});
    await f2.waitForFunction(() => window.G.ui.touch.layoutT > 0, null, { timeout: 5000, polling: 'raf' }).catch(() => {}); // (the touch controls laid out in it)
    const fr = await ip.evaluate(() => { const r = document.querySelector('iframe').getBoundingClientRect(); return { x: r.left, y: r.top }; });
    const over = await ip.evaluate(() => [...document.querySelectorAll('#user_tools a, .fullscreen_btn')].map(e => { const r = e.getBoundingClientRect(); return { n: e.className || 'itch user_tools', x0: r.left, y0: r.top, x1: r.right, y1: r.bottom }; }));
    const inner = await f2.evaluate(() => {
      const M = window.G.ui.mobile, sel = '.mm-wrap, .tc .tc-b, .tc-belt > .belt, .hud-tl .qt, .run-chip';
      const els = [...document.querySelectorAll(sel)].filter(e => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 0 && !e.closest('[hidden]') && cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0; });
      return { itch: M.itch, sf: M.sf, vis: M.vis, box: M.itchBox, els: els.map(e => { const r = e.getBoundingClientRect(); return { n: String(e.className.baseVal ?? e.className).split(' ').slice(0, 2).join('.'), x0: r.left, y0: r.top, x1: r.right, y1: r.bottom }; }) };
    });
    const hits = [], off = [];
    for (const e of inner.els) {
      const p = { n: e.n, x0: e.x0 + fr.x, y0: e.y0 + fr.y, x1: e.x1 + fr.x, y1: e.y1 + fr.y };
      for (const o of over) if (p.x0 < o.x1 && p.x1 > o.x0 && p.y0 < o.y1 && p.y1 > o.y0) hits.push(`${p.n} under ${o.n}`);
      if (p.x1 > 1180.5 || p.y1 > 820.5 || p.x0 < -0.5) off.push(`${p.n} off the page (${p.x0.toFixed(0)}..${p.x1.toFixed(0)}, ${p.y0.toFixed(0)}..${p.y1.toFixed(0)})`);
    }
    const page2 = await ip.evaluate(() => ({ w: innerWidth, vv: Math.round(visualViewport.width), scale: visualViewport.scale, doc: document.documentElement.scrollWidth }));
    const rnd = o => o && Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Math.round(v)]));
    ipad = { itch: inner.itch, sf: rnd(inner.sf), vis: rnd(inner.vis), page: page2, n: inner.els.length, hits, off };
  } catch (e) { errs2.push('iPad page: the game did not come up with its touch controls (' + e.message.split('\n')[0] + ')'); }
  const shot2 = path.join(REL, 'itch-test-ipad.png');
  await ip.screenshot({ path: shot2 });
  await b2.close(); server.close();
  console.log(`== iPad on itch's page: ${ipad ? JSON.stringify(ipad) : 'FAILED'} · screenshot ${path.relative(ROOT, shot2)}`);
  const fails2 = [...errs2, ...(ipad ? [...ipad.hits, ...ipad.off, ...(ipad.itch ? [] : ['the game did not see it is on itch']), ...(ipad.n >= 8 ? [] : [`only ${ipad.n} touch controls measured`])] : [])];
  if (fails2.length) { console.error('   problems:\n   ' + fails2.slice(0, 20).join('\n   ')); process.exit(1); }
  console.log("== iPad on itch: PASS (the touch HUD clears itch's buttons and stays on the page)");
}
