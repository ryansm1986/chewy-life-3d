// Unit tests of the desktop app's updater (tools/desktop/updater.cjs, contentpack.mjs; docs/DESKTOP.md "Updates from
// inside the app", ROADMAP CT-9), in plain Node with a local HTTP server: no Electron, no GitHub, no build needed.
//   a) versions; the URL policy (HTTPS to the three GitHub hosts only, loopback only for the QA); update.json validation;
//      decide() (content / shell / page / none, a failed version)
//   b) the content pack: packGame → extractZip round trip, reproducible; hostile zips refused (.., absolute, backslash,
//      a drive, a link, a bad CRC, a duplicate) with nothing written outside the folder
//   c) downloads: whole, through a loopback redirect; a redirect off the allowed hosts refused; a cut connection kept
//      as .part and resumed with Range; a bad hash refused and the part deleted; offline; fetchManifest 404 / too big
//   d) ContentStore: install on trial, confirm, rollback to the previous update and to the built-in game, an
//      unconfirmed trial rolled back at the next boot, minShell, a newer built-in game (after a shell update), bad packs
//      refused, and nothing outside userData/updates/ ever touched
//   e) the AppImage swap (the new file renamed over the old, the old kept as .prev, executable) and the relaunch args
// usage: node tools/qa/desktop-updater-unit.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { makeReport } from './lib.mjs';
import { packGame } from '../desktop/contentpack.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const U = createRequire(import.meta.url)(path.join(ROOT, 'tools/desktop/updater.cjs'));
const R = makeReport('desktop-updater-unit');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'pawhaven-upd-unit-'));
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const throwsMsg = async f => { try { await f(); return null; } catch (e) { return e; } };
const T = { test: true };

try {
  // ---------------------------------------------------------------- a) versions, the URL policy, update.json, decide
  R.check('a) versions compare numerically and only X.Y.Z (an optional v) parses',
    U.cmpVersion('0.6.10', '0.6.9') === 1 && U.cmpVersion('v1.0.0', '1.0.0') === 0 && U.cmpVersion('0.6.4', '0.7.0') === -1 && !U.parseVersion('1.0') && !U.parseVersion('1.0.0-beta') && !U.parseVersion('../1.0.0'));
  const urls = {
    'https://github.com/ryansm1986/chewy-life-3d/releases/latest/download/update.json': [true, true],
    'https://objects.githubusercontent.com/x': [true, true], 'https://release-assets.githubusercontent.com/x?sig=1': [true, true],
    'http://github.com/x': [false, false], 'https://github.com:8443/x': [false, false], 'https://evil.com/x': [false, false], 'https://github.com.evil.com/x': [false, false],
    'https://user:pw@github.com/x': [false, false], 'file:///etc/passwd': [false, false], 'http://127.0.0.1:9/x': [false, true], 'http://localhost:9/x': [false, true], 'http://10.0.0.1/x': [false, false],
  };
  const urlBad = Object.entries(urls).filter(([u, [p, t]]) => U.allowedUrl(u, {}) !== p || U.allowedUrl(u, T) !== t).map(([u]) => u);
  R.check('a) the URL policy: HTTPS to github.com and its two asset hosts only; loopback only with the QA policy', !urlBad.length, urlBad.join(' '));
  const goodM = (o = {}) => ({ schema: 1, version: '0.6.6', notes: 'New things\r\nand fixes', content: { url: 'https://github.com/a/b/releases/download/v0.6.6/pawhaven-game-0.6.6.zip', sha256: 'a'.repeat(64), size: 1000, minShell: '0.6.5' },
    shell: { version: '0.6.6', fingerprint: 'f', linux: { url: 'https://github.com/a/b/releases/download/v0.6.6/P.AppImage', sha256: 'b'.repeat(64), size: 2000 } }, ...o });
  const vm = U.validateManifest(goodM());
  const bads = [goodM({ schema: 2 }), goodM({ version: '0.6' }), goodM({ content: { ...goodM().content, url: 'https://evil.com/x.zip' } }), goodM({ content: { ...goodM().content, sha256: 'xyz' } }),
    goodM({ content: { ...goodM().content, size: -1 } }), goodM({ content: { ...goodM().content, minShell: 'soon' } }), goodM({ shell: { linux: { url: 'http://github.com/x', sha256: 'b'.repeat(64), size: 1 } } }), [], null];
  const refused = bads.map(m => { try { U.validateManifest(m); return false; } catch (e) { return true; } });
  R.check('a) update.json: a good one validates (notes normalised, a missing page → the releases page); 9 bad ones are refused',
    vm.version === '0.6.6' && vm.notes === 'New things\nand fixes' && vm.page === U.RELEASES_URL && vm.content.minShell === '0.6.5' && refused.every(Boolean), JSON.stringify(refused));
  const at = (o = {}) => ({ shellVersion: '0.6.5', gameVersion: '0.6.5', platform: 'linux', appImage: '/home/deck/Games/Pawhaven.AppImage', bad: [], ...o });
  const d = {
    content: U.decide(vm, at()).kind, none: U.decide(vm, at({ gameVersion: '0.6.6' })).kind, shell: U.decide(vm, at({ shellVersion: '0.6.4', gameVersion: '0.6.4' })).kind,
    pageWin: U.decide(vm, at({ shellVersion: '0.6.4', gameVersion: '0.6.4', platform: 'win32', appImage: '' })).kind, pageTar: U.decide(vm, at({ shellVersion: '0.6.4', gameVersion: '0.6.4', appImage: '' })).kind,
    failed: U.decide(vm, at({ bad: ['0.6.6'] })).failed,
  };
  R.check('a) decide: a content update when the shell is new enough; a shell update on an AppImage; the release page on Windows or the tar.gz; a failed version flagged',
    d.content === 'content' && d.none === 'none' && d.shell === 'shell' && d.pageWin === 'page' && d.pageTar === 'page' && d.failed === true, JSON.stringify(d));

  // ---------------------------------------------------------------- b) the content pack
  const mkGame = (dir, version, extra = {}) => {
    fs.mkdirSync(path.join(dir, 'assets/deep'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><title>Pawhaven ${version}</title>`);
    fs.writeFileSync(path.join(dir, 'content.json'), JSON.stringify({ name: 'pawhaven-game', version }));
    fs.writeFileSync(path.join(dir, 'assets/game.js'), `console.log(${JSON.stringify(version)});`.repeat(200));
    fs.writeFileSync(path.join(dir, 'assets/deep/noise.bin'), crypto.randomBytes(70000));
    fs.writeFileSync(path.join(dir, 'assets/empty.txt'), '');
    for (const [k, v] of Object.entries(extra)) fs.writeFileSync(path.join(dir, k), v);
    return dir;
  };
  const g1 = mkGame(path.join(TMP, 'src-1.0.1'), '1.0.1');
  const p1 = packGame(g1, path.join(TMP, 'packs/g-1.0.1.zip')), p1b = packGame(g1, path.join(TMP, 'packs/g-1.0.1-again.zip'));
  const x1 = await U.extractZip(p1.file, path.join(TMP, 'x1'));
  const same = ['index.html', 'content.json', 'assets/game.js', 'assets/deep/noise.bin', 'assets/empty.txt'].every(f => Buffer.compare(fs.readFileSync(path.join(g1, f)), fs.readFileSync(path.join(TMP, 'x1', f))) === 0);
  R.check('b) the content pack round-trips through the app\'s unzip byte for byte, and packing twice gives the same hash',
    same && x1.files === 5 && p1.sha256 === p1b.sha256 && p1.sha256 === sha(fs.readFileSync(p1.file)), JSON.stringify({ files: x1.files, size: p1.size }));
  // hostile zips (stored entries, made here)
  const zipOf = (entries) => {
    const parts = [], cds = []; let off = 0;
    for (const e of entries) {
      const nm = Buffer.from(e.name), data = Buffer.from(e.data ?? 'x'), crc = e.crc ?? (zlib.crc32(data) >>> 0), lh = Buffer.alloc(30);
      lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x800, 6); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nm.length, 26);
      const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE((3 << 8) | 20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x800, 8); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(data.length, 24);
      ch.writeUInt16LE(nm.length, 28); ch.writeUInt32LE(((e.mode ?? 0o100644) << 16) >>> 0, 38); ch.writeUInt32LE(off, 42);
      parts.push(lh, nm, data); cds.push(ch, nm); off += 30 + nm.length + data.length;
    }
    const cd = Buffer.concat(cds), eo = Buffer.alloc(22); eo.writeUInt32LE(0x06054b50, 0); eo.writeUInt16LE(entries.length, 8); eo.writeUInt16LE(entries.length, 10); eo.writeUInt32LE(cd.length, 12); eo.writeUInt32LE(off, 16);
    return Buffer.concat([...parts, cd, eo]);
  };
  const hostile = { dotdot: [{ name: '../evil.txt' }], deep: [{ name: 'a/../../evil.txt' }], abs: [{ name: '/evil.txt' }], back: [{ name: 'a\\..\\..\\evil.txt' }], drive: [{ name: 'C:evil.txt' }],
    link: [{ name: 'evil-link', data: '/etc/passwd', mode: 0o120777 }], crc: [{ name: 'a.txt', crc: 1234 }], dup: [{ name: 'a.txt' }, { name: 'A.txt' }], dev: [{ name: 'aux.txt' }] };
  const hz = {};
  for (const [k, ents] of Object.entries(hostile)) { const f = path.join(TMP, `hostile-${k}.zip`); fs.writeFileSync(f, zipOf(ents)); hz[k] = !!(await throwsMsg(() => U.extractZip(f, path.join(TMP, 'hx', k)))); }
  const escaped = fs.existsSync(path.join(TMP, 'evil.txt')) || fs.existsSync(path.join(TMP, 'hx', 'evil.txt')) || fs.existsSync(path.join(os.tmpdir(), 'evil.txt'));
  R.check('b) hostile zips are refused (.., absolute, backslashes, a drive, a link, a bad CRC, a duplicate, a device name) and nothing lands outside', Object.values(hz).every(Boolean) && !escaped, JSON.stringify(hz));

  // ---------------------------------------------------------------- c) downloads over a local server
  const BODY = crypto.randomBytes(300 * 1024), BODY_SHA = sha(BODY);
  const seen = []; let cutOnce = true;
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x'); seen.push({ path: u.pathname, range: req.headers.range || '' });
    const send = (buf) => {
      const m = /^bytes=(\d+)-$/.exec(req.headers.range || '');
      if (m) { const s = +m[1]; res.writeHead(206, { 'content-range': `bytes ${s}-${buf.length - 1}/${buf.length}`, 'content-length': buf.length - s }); res.end(buf.subarray(s)); }
      else { res.writeHead(200, { 'content-length': buf.length }); res.end(buf); }
    };
    if (u.pathname === '/file') return send(BODY);
    if (u.pathname === '/bad') return send(Buffer.from(BODY).fill(7, 1000, 1010));
    if (u.pathname === '/cut') { if (cutOnce && !req.headers.range) { cutOnce = false; res.writeHead(200, { 'content-length': BODY.length }); res.write(BODY.subarray(0, 120 * 1024)); setTimeout(() => res.socket.destroy(), 50); return; } return send(BODY); }
    if (u.pathname === '/to-file') { res.writeHead(302, { location: '/file' }); return res.end(); }
    if (u.pathname === '/to-evil') { res.writeHead(302, { location: 'http://example.com/file' }); return res.end(); }
    if (u.pathname === '/update.json') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(goodM({ content: { ...goodM().content, url: 'http://127.0.0.1/x.zip' } }))); }
    if (u.pathname === '/big.json') { res.writeHead(200); return res.end(Buffer.alloc(300 * 1024, 32)); }
    res.writeHead(404); res.end('no');
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const B = `http://127.0.0.1:${server.address().port}`;
  const A = p => ({ url: B + p, sha256: BODY_SHA, size: BODY.length });
  const dl = path.join(TMP, 'dl');
  const whole = await U.download(A('/to-file'), path.join(dl, 'whole.bin'), { policy: T });
  R.check('c) a download through a loopback redirect arrives whole and hash-checked', sha(fs.readFileSync(whole)) === BODY_SHA && !fs.existsSync(whole + '.part'));
  const evil = await throwsMsg(() => U.download(A('/to-evil'), path.join(dl, 'evil.bin'), { policy: T }));
  const evilProd = await throwsMsg(() => U.download(A('/file'), path.join(dl, 'evil2.bin'), { policy: {} }));
  R.check('c) a redirect to a host off the list is refused, and the player policy refuses loopback outright', evil?.code === 'HOST_REFUSED' && evilProd?.code === 'HOST_REFUSED', `${evil?.message} | ${evilProd?.message}`);
  const cut = await throwsMsg(() => U.download(A('/cut'), path.join(dl, 'cut.bin'), { policy: T }));
  const partLen = fs.existsSync(path.join(dl, 'cut.bin.part')) ? fs.statSync(path.join(dl, 'cut.bin.part')).size : 0;
  const prog = []; const res2 = await U.download(A('/cut'), path.join(dl, 'cut.bin'), { policy: T, onProgress: p => prog.push(p.got) });
  const resumeReq = seen.filter(s => s.path === '/cut').pop();
  R.check('c) a cut connection keeps its .part; the next try resumes it with a Range request and the hash matches',
    !!cut && partLen > 0 && partLen < BODY.length && resumeReq.range === `bytes=${partLen}-` && sha(fs.readFileSync(res2)) === BODY_SHA && prog[0] >= partLen, JSON.stringify({ cut: cut?.code || cut?.message, partLen, range: resumeReq.range }));
  const bad = await throwsMsg(() => U.download(A('/bad'), path.join(dl, 'bad.bin'), { policy: T }));
  R.check('c) a download whose SHA-256 is wrong is refused and its part deleted', bad?.code === 'HASH_MISMATCH' && !fs.existsSync(path.join(dl, 'bad.bin')) && !fs.existsSync(path.join(dl, 'bad.bin.part')), bad?.message);
  const m404 = await U.fetchManifest(B + '/none.json', { policy: T }), mOk = await U.fetchManifest(B + '/update.json', { policy: T });
  const mBig = await throwsMsg(() => U.fetchManifest(B + '/big.json', { policy: T }));
  const dead = http.createServer(); await new Promise(r => dead.listen(0, '127.0.0.1', r)); const deadPort = dead.address().port; await new Promise(r => dead.close(r));
  const off = await throwsMsg(() => U.fetchManifest(`http://127.0.0.1:${deadPort}/update.json`, { policy: T, timeout: 3000 }));
  R.check('c) fetchManifest: a 404 is "no update", a good one validates, a huge one is refused, offline is an error (ECONNREFUSED)',
    m404 === null && mOk?.version === '0.6.6' && /too large/.test(mBig?.message) && off?.code === 'ECONNREFUSED', JSON.stringify({ m404, ok: mOk?.version, big: mBig?.message, off: off?.code }));
  await new Promise(r => server.close(r));

  // ---------------------------------------------------------------- d) the content store
  const UD = path.join(TMP, 'userData'); fs.mkdirSync(path.join(UD, 'Local Storage/leveldb'), { recursive: true });
  fs.writeFileSync(path.join(UD, 'Local Storage/leveldb/000003.log'), 'the save'); fs.writeFileSync(path.join(UD, 'window.json'), '{"fullscreen":true}');
  const builtIn = mkGame(path.join(TMP, 'builtin'), '1.0.0');
  const store = (o = {}) => new U.ContentStore({ root: path.join(UD, 'updates'), builtInDir: builtIn, builtInVersion: '1.0.0', shellVersion: '1.0.0', ...o });
  const pk = (v, extra) => packGame(mkGame(path.join(TMP, `src-${v}`), v, extra), path.join(TMP, `packs/g-${v}.zip`)).file;
  let s = store();
  const b0 = s.boot();
  const i1 = await s.install(pk('1.0.1'), { version: '1.0.1', minShell: '1.0.0' }), st1 = s.read();
  // the app was killed before the title came up: the next boot rolls back
  const b1 = store().boot(), st1b = s.read();
  R.check('d) install puts 1.0.1 on trial; a boot with the trial unconfirmed rolls back to the built-in game, marks it failed, and leaves a notice',
    b0.source === 'builtin' && i1.version === '1.0.1' && i1.source === 'update' && st1.trial === '1.0.1' && st1.previous === null && b1.source === 'builtin' && st1b.bad.includes('1.0.1') && st1b.notice?.kind === 'rolledBack' && st1b.notice.to === '1.0.0' && !fs.existsSync(s.dirOf('1.0.1')),
    JSON.stringify({ st1, b1, st1b }));
  s = store(); s.takeNotice();
  await s.install(pk('1.0.1'), { version: '1.0.1', minShell: '1.0.0' }); s.confirm('1.0.1');
  const b2 = store().boot(), st2 = s.read();
  await s.install(pk('1.0.2'), { version: '1.0.2', minShell: '1.0.0' });
  const st3 = s.read(), rb = s.rollback('1.0.2', 'no title'), st4 = s.read();
  R.check('d) a confirmed 1.0.1 serves at the next boot (and is no longer failed); 1.0.2 then fails its trial and rolls back to 1.0.1, not the built-in game',
    b2.version === '1.0.1' && st2.trial === null && !st2.bad.includes('1.0.1') && st3.previous === '1.0.1' && st3.active === '1.0.2' && rb.version === '1.0.1' && st4.active === '1.0.1' && st4.bad.includes('1.0.2') && !fs.existsSync(s.dirOf('1.0.2')),
    JSON.stringify({ b2, st3, rb, st4 }));
  await s.install(pk('1.0.3'), { version: '1.0.3', minShell: '1.0.0' }); s.confirm('1.0.3');
  await s.install(pk('1.0.4'), { version: '1.0.4', minShell: '1.0.0' }); s.confirm('1.0.4');
  const kept = fs.readdirSync(path.join(UD, 'updates')).filter(n => n.startsWith('game-')).sort();
  R.check('d) only the active version and the one before it are kept', JSON.stringify(kept) === JSON.stringify(['game-1.0.3', 'game-1.0.4']), JSON.stringify(kept));
  fs.mkdirSync(s.downloads, { recursive: true });
  for (const n of ['pawhaven-game-1.0.2.zip.part', 'pawhaven-game-1.0.2.zip.part.json', 'pawhaven-game-5.0.0.zip.part', 'pawhaven-game-5.0.0.zip.part.json', 'pawhaven-game-5.0.0.zip']) fs.writeFileSync(path.join(s.downloads, n), 'x');
  s.prune();
  const dls = fs.readdirSync(s.downloads).sort();
  R.check('d) pruning keeps a half download of a newer version (to resume) and drops finished zips and parts for older ones', JSON.stringify(dls) === JSON.stringify(['pawhaven-game-5.0.0.zip.part', 'pawhaven-game-5.0.0.zip.part.json']), JSON.stringify(dls));
  // a pack this shell is too old for, a pack that lies about its version, a pack without index.html
  const tooNew = await s.install(pk('1.0.5'), { version: '1.0.5', minShell: '9.0.0' }).then(p => p, e => e);
  s.rollback('1.0.5', 'test'); s.takeNotice();
  const liar = await throwsMsg(() => s.install(pk('1.0.6'), { version: '1.0.7', minShell: '1.0.0' }));
  const gNo = path.join(TMP, 'src-noindex'); mkGame(gNo, '1.0.8'); fs.rmSync(path.join(gNo, 'index.html'));
  const zNo = path.join(TMP, 'packs/noindex.zip'); fs.writeFileSync(zNo, zipOf([{ name: 'content.json', data: JSON.stringify({ version: '1.0.8' }) }]));
  const noIndex = await throwsMsg(() => s.install(zNo, { version: '1.0.8', minShell: '1.0.0' }));
  const st5 = s.read();
  R.check('d) a pack needing a newer shell is not served; a pack naming another version and one without index.html are refused, the state untouched',
    tooNew.source === 'builtin' && /says it is 1\.0\.6/.test(liar?.message) && /index\.html/.test(noIndex?.message) && st5.active === '1.0.4' && !fs.readdirSync(path.join(UD, 'updates')).some(n => n.startsWith('.unpack')),
    JSON.stringify({ tooNew, liar: liar?.message, noIndex: noIndex?.message, active: st5.active }));
  // a shell update brought a newer built-in game: the old update folders go
  const builtIn2 = mkGame(path.join(TMP, 'builtin2'), '2.0.0');
  const b3 = store({ builtInDir: builtIn2, builtInVersion: '2.0.0', shellVersion: '2.0.0' }).boot();
  const left = fs.readdirSync(path.join(UD, 'updates')).filter(n => n.startsWith('game-'));
  const userDataSafe = fs.readFileSync(path.join(UD, 'Local Storage/leveldb/000003.log'), 'utf8') === 'the save' && fs.existsSync(path.join(UD, 'window.json'));
  R.check('d) after a shell update the newer built-in game serves and old update folders are pruned; the saves and window.json are untouched throughout',
    b3.source === 'builtin' && b3.version === '2.0.0' && left.length === 0 && userDataSafe, JSON.stringify({ b3, left }));
  // a corrupt state.json → the built-in game
  fs.writeFileSync(path.join(UD, 'updates/state.json'), '{not json');
  const b4 = store().boot();
  R.check('d) a corrupt state.json falls back to the built-in game', b4.source === 'builtin', JSON.stringify(b4));

  // ---------------------------------------------------------------- e) the AppImage swap, the relaunch arguments
  const AI = path.join(TMP, 'Games/Pawhaven'); fs.mkdirSync(AI, { recursive: true });
  const target = path.join(AI, 'Pawhaven.AppImage'); fs.writeFileSync(target, 'old shell'); try { fs.chmodSync(target, 0o755); } catch (e) { /* */ }
  const fresh = U.appImageTemp(target); fs.writeFileSync(fresh, 'new shell'); try { fs.chmodSync(fresh, 0o644); } catch (e) { /* */ }
  const sw = U.swapAppImage(target, fresh);
  const modeOk = process.platform === 'win32' || (fs.statSync(target).mode & 0o777) === 0o755;
  const wrongDir = await throwsMsg(() => U.swapAppImage(target, path.join(TMP, 'elsewhere.AppImage')));
  R.check('e) the AppImage swap: the new file takes the old name (executable), the old one is kept as .prev, the temp file is gone; a file from another folder is refused',
    fs.readFileSync(target, 'utf8') === 'new shell' && sw.prev === target + '.prev' && fs.readFileSync(sw.prev, 'utf8') === 'old shell' && !fs.existsSync(fresh) && modeOk && !!wrongDir && path.basename(fresh).startsWith('.'),
    JSON.stringify({ sw, fresh: path.basename(fresh), platform: process.platform }));
  const ra = U.relaunchArgs(['/tmp/.mount_x/pawhaven', '--no-sandbox', '--windowed', '--remote-debugging-port=0', '--inspect=0']);
  R.check('e) the relaunch keeps the player\'s switches and drops the debugger\'s', JSON.stringify(ra) === JSON.stringify(['--no-sandbox', '--windowed']), JSON.stringify(ra));
} catch (err) { R.check('the run finished', false, String(err.stack || err).split('\n').slice(0, 3).join(' | ')); }

try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { /* */ }
process.exit(R.finish([], []) ? 1 : 0);
