// Pawhaven's in-app updater (docs/DESKTOP.md "Updates from inside the app", ROADMAP CT-9). Plain Node, no Electron, so
// tools/qa/desktop-updater-unit.mjs tests it directly; main.cjs wires it to the window.
//   - the manifest: update.json, an asset of the latest GitHub release (fetched with no token), strictly validated;
//   - the URL policy: HTTPS to github.com and GitHub's two asset hosts only, every redirect hop checked (the QA's
//     --update-url may use loopback http, nothing else);
//   - downloads: streamed to <file>.part with a note of the URL and hash beside it, resumed with an HTTP Range request,
//     SHA-256 checked before anything uses them (a failed check deletes the part);
//   - zips: a strict reader (plain files and folders, no links, no absolute or .. paths, capped), CRC-checked;
//   - ContentStore: userData/updates/ (game-<version>/ folders, downloads/, state.json), the built-in game vs the active
//     update, a trial for a fresh install with rollback, pruning (only ever inside its own folder);
//   - swapAppImage: a shell update on Linux (the new AppImage renamed over the running one, the old kept as .prev).
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const http = require('node:http');
const https = require('node:https');
const { pipeline } = require('node:stream/promises');
const { Transform } = require('node:stream');

const REPO = 'ryansm1986/chewy-life-3d';
const MANIFEST_URL = `https://github.com/${REPO}/releases/latest/download/update.json`;
const RELEASES_URL = `https://github.com/${REPO}/releases/latest`;
// github.com answers .../releases/download/... with a redirect to its asset host: release-assets.githubusercontent.com
// since 2025 (checked 2026-10-10), objects.githubusercontent.com before
const HOSTS = new Set(['github.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com']);
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);
const LIMITS = { manifest: 256 * 1024, content: 1024 ** 3, shell: 1.5 * 1024 ** 3, files: 20000, unpacked: 2 * 1024 ** 3, file: 512 * 1024 ** 2, notes: 4000, redirects: 6 };

// ---------------------------------------------------------------- versions (X.Y.Z, an optional leading v)
const VER = /^v?(\d{1,4})\.(\d{1,5})\.(\d{1,6})$/;
const parseVersion = v => { const m = VER.exec(String(v ?? '').trim()); return m ? [+m[1], +m[2], +m[3]] : null; };
const normVersion = v => { const p = parseVersion(v); if (!p) throw new Error(`not a version: ${v}`); return p.join('.'); };
function cmpVersion(a, b) {
  const x = parseVersion(a), y = parseVersion(b);
  if (!x || !y) throw new Error(`not a version: ${!x ? a : b}`);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  return 0;
}

// ---------------------------------------------------------------- the URL policy
/** policy: { test } (test: loopback http(s) is allowed too, for the QA's local server) */
function allowedUrl(u, policy = {}) {
  let url; try { url = new URL(u); } catch (e) { return false; }
  if (url.username || url.password) return false;
  if (url.protocol === 'https:' && HOSTS.has(url.hostname) && url.port === '') return true;
  return !!policy.test && (url.protocol === 'http:' || url.protocol === 'https:') && LOOPBACK.has(url.hostname);
}
const hostOf = u => { try { return new URL(u).host; } catch (e) { return '?'; } };

// ---------------------------------------------------------------- update.json
function validateManifest(m, policy = {}) {
  const bad = why => { throw new Error(`update.json: ${why}`); };
  if (!m || typeof m !== 'object' || Array.isArray(m)) bad('not an object');
  if (m.schema !== 1) bad(`unknown schema ${m.schema}`);
  if (!parseVersion(m.version)) bad('no version');
  const asset = (a, what, max) => {
    if (!a || typeof a !== 'object') bad(`no ${what}`);
    if (typeof a.url !== 'string' || !allowedUrl(a.url, policy)) bad(`${what}.url is not on an allowed host (${typeof a.url === 'string' ? hostOf(a.url) : '-'})`);
    if (typeof a.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(a.sha256)) bad(`${what}.sha256`);
    if (!Number.isSafeInteger(a.size) || a.size <= 0 || a.size > max) bad(`${what}.size`);
    return { url: a.url, sha256: a.sha256, size: a.size };
  };
  const content = asset(m.content, 'content', LIMITS.content);
  if (!parseVersion(m.content.minShell)) bad('content.minShell');
  content.minShell = normVersion(m.content.minShell);
  const sh = m.shell && typeof m.shell === 'object' ? m.shell : {};
  const shell = { version: parseVersion(sh.version) ? normVersion(sh.version) : normVersion(m.version), fingerprint: typeof sh.fingerprint === 'string' ? sh.fingerprint.slice(0, 128) : '' };
  for (const k of ['linux', 'winZip', 'winPortable']) if (sh[k]) shell[k] = asset(sh[k], `shell.${k}`, LIMITS.shell);
  return {
    schema: 1, name: 'Pawhaven', version: normVersion(m.version),
    released: typeof m.released === 'string' ? m.released.slice(0, 32) : '',
    notes: typeof m.notes === 'string' ? m.notes.replace(/\r\n?/g, '\n').slice(0, LIMITS.notes) : '',
    page: typeof m.page === 'string' && allowedUrl(m.page, policy) ? m.page : RELEASES_URL,
    content, shell,
  };
}

/**
 * What a manifest means for this app → { kind, version, asset?, failed }
 *   none: nothing newer; content: download the game; shell: download a new AppImage (Linux, run as an AppImage);
 *   page: this shell is too old and can't replace itself here (Windows, the tar.gz): the release page
 * at: { shellVersion, gameVersion, platform, appImage (path or ''), bad (versions that failed to start) }
 */
function decide(m, at) {
  const version = m.version, failed = (at.bad || []).includes(version);
  if (cmpVersion(version, at.gameVersion) <= 0) return { kind: 'none', version, failed: false };
  if (cmpVersion(at.shellVersion, m.content.minShell) >= 0) return { kind: 'content', version, asset: m.content, failed };
  if (at.platform === 'linux' && at.appImage && m.shell.linux) return { kind: 'shell', version, asset: m.shell.linux, failed: false };
  return { kind: 'page', version, page: m.page, failed: false };
}

// ---------------------------------------------------------------- HTTP(S) with checked redirects
const abortError = () => Object.assign(new Error('cancelled'), { code: 'ABORT_ERR', name: 'AbortError' });
/** GET with every hop checked against the policy → { res, url } (the caller consumes or discards res) */
function get(url, { policy = {}, headers = {}, timeout = 20000, signal, ua = 'Pawhaven' } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const hop = (u, left) => {
      if (!allowedUrl(u, policy)) return reject(Object.assign(new Error(`refused: ${hostOf(u)} is not an allowed host`), { code: 'HOST_REFUSED' }));
      const mod = u.startsWith('https:') ? https : http;
      let req;
      const onAbort = () => req?.destroy(abortError());
      try {
        req = mod.get(u, { headers: { 'user-agent': ua, accept: '*/*', ...headers }, timeout }, res => {
          if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
            res.resume(); signal?.removeEventListener('abort', onAbort);
            if (left <= 0) return reject(new Error('too many redirects'));
            let next; try { next = new URL(res.headers.location, u).href; } catch (e) { return reject(new Error('a bad redirect')); }
            return hop(next, left - 1);
          }
          res.once('close', () => signal?.removeEventListener('abort', onAbort));
          resolve({ res, url: u });
        });
      } catch (e) { return reject(e); }
      req.on('timeout', () => req.destroy(Object.assign(new Error('the connection timed out'), { code: 'ETIMEDOUT' })));
      req.on('error', reject);
      signal?.addEventListener('abort', onAbort, { once: true });
    };
    hop(url, LIMITS.redirects);
  });
}

/** update.json → a validated manifest, or null when there is none (404: no release with one yet) */
async function fetchManifest(url, { policy = {}, timeout = 10000, signal, ua } = {}) {
  const ac = new AbortController(), stop = () => ac.abort();
  const timer = setTimeout(stop, timeout + 2000); // (an overall deadline: the socket timeout only catches a silence)
  signal?.addEventListener('abort', stop, { once: true });
  try {
    const { res } = await get(url, { policy, timeout, signal: ac.signal, ua, headers: { accept: 'application/json, */*' } });
    if (res.statusCode === 404) { res.resume(); return null; }
    if (res.statusCode !== 200) { res.resume(); throw Object.assign(new Error(`GitHub answered ${res.statusCode}`), { code: 'HTTP_' + res.statusCode }); }
    const chunks = []; let n = 0;
    for await (const c of res) { n += c.length; if (n > LIMITS.manifest) { res.destroy(); throw new Error('update.json is too large'); } chunks.push(c); }
    let j; try { j = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch (e) { throw new Error('update.json is not JSON'); }
    return validateManifest(j, policy);
  } catch (e) { if (ac.signal.aborted && !signal?.aborted && e.name === 'AbortError') throw Object.assign(new Error('the connection timed out'), { code: 'ETIMEDOUT' }); throw e; } finally { clearTimeout(timer); signal?.removeEventListener('abort', stop); }
}

async function sha256File(file) {
  const h = crypto.createHash('sha256');
  await pipeline(fs.createReadStream(file), new Transform({ transform(c, e, cb) { h.update(c); cb(); } }));
  return h.digest('hex');
}

/**
 * Download asset { url, sha256, size } to dest, resuming dest.part when its note (dest.part.json) is for the same file.
 * Resolves with dest once the size and SHA-256 match; a failed hash deletes the part (err.code 'HASH_MISMATCH'); a cut
 * connection keeps it for next time. onProgress({ got, total }) at most ~10 times a second.
 */
async function download(asset, dest, { policy = {}, onProgress, signal, timeout = 30000, ua } = {}) {
  const part = dest + '.part', note = part + '.json';
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (fs.existsSync(dest)) { if (fs.statSync(dest).size === asset.size && await sha256File(dest) === asset.sha256) return dest; fs.rmSync(dest, { force: true }); }
  let have = 0;
  try { const j = JSON.parse(fs.readFileSync(note, 'utf8')); if (j.sha256 === asset.sha256 && j.size === asset.size) have = fs.statSync(part).size; } catch (e) { /* no part, or another file's */ }
  if (have > asset.size) have = 0;
  if (!have) fs.rmSync(part, { force: true });
  fs.writeFileSync(note, JSON.stringify({ url: asset.url, sha256: asset.sha256, size: asset.size }));
  const discard = () => { fs.rmSync(part, { force: true }); fs.rmSync(note, { force: true }); };
  if (have < asset.size) {
    const { res } = await get(asset.url, { policy, timeout, signal, ua, headers: have ? { range: `bytes=${have}-` } : {} });
    let append = false;
    if (have && res.statusCode === 206) {
      const m = /^bytes (\d+)-(\d+)\/(\d+|\*)$/.exec(res.headers['content-range'] || '');
      if (!m || +m[1] !== have) { res.resume(); discard(); throw new Error('the server resumed at the wrong place'); }
      append = true;
    } else if (res.statusCode === 200) have = 0; // (no resume: start over)
    else { res.resume(); throw Object.assign(new Error(`the download answered ${res.statusCode}`), { code: 'HTTP_' + res.statusCode }); }
    let got = have, last = 0;
    const count = new Transform({
      transform(c, e, cb) {
        got += c.length;
        if (got > asset.size) return cb(Object.assign(new Error('the download is larger than expected'), { code: 'TOO_LARGE' }));
        const t = Date.now(); if (onProgress && t - last > 100) { last = t; try { onProgress({ got, total: asset.size }); } catch (err) { /* the listener's own trouble */ } }
        cb(null, c);
      },
    });
    try { await pipeline(res, count, fs.createWriteStream(part, { flags: append ? 'a' : 'w' })); }
    catch (e) { if (e.code === 'TOO_LARGE') discard(); throw e; }
    try { onProgress?.({ got, total: asset.size }); } catch (err) { /* */ }
  }
  const size = fs.statSync(part).size;
  if (size < asset.size) throw Object.assign(new Error('the download stopped early'), { code: 'SHORT' }); // (kept: the next try resumes)
  if (size > asset.size) { discard(); throw Object.assign(new Error('the download is larger than expected'), { code: 'TOO_LARGE' }); }
  if (await sha256File(part) !== asset.sha256) { discard(); throw Object.assign(new Error('the download failed its safety check (SHA-256)'), { code: 'HASH_MISMATCH' }); }
  fs.rmSync(dest, { force: true }); fs.renameSync(part, dest); fs.rmSync(note, { force: true });
  return dest;
}

// ---------------------------------------------------------------- zips (a strict reader)
const CRC_TABLE = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
const crc32 = zlib.crc32 ? b => zlib.crc32(b) >>> 0 : b => { let c = -1; for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i;
/** a zip entry's name → its path segments, or throws (absolute, .., backslashes, drive letters, control characters) */
function safeSegments(name) {
  if (!name || name.length > 400 || /[\\:\0-\x1f\x7f]/.test(name) || name.startsWith('/')) throw new Error(`zip: unsafe name ${JSON.stringify(name).slice(0, 80)}`);
  const segs = name.replace(/\/$/, '').split('/');
  for (const s of segs) if (!s || s === '.' || s === '..' || RESERVED.test(s) || /[ .]$/.test(s)) throw new Error(`zip: unsafe name ${JSON.stringify(name).slice(0, 80)}`);
  return segs;
}
/** the central directory of a zip file → [{ name, dir, method, crc, csize, usize, offset }] */
function readZipDirectory(fd, fileSize) {
  const tail = Math.min(fileSize, 22 + 65535), buf = Buffer.alloc(tail);
  fs.readSync(fd, buf, 0, tail, fileSize - tail);
  let e = -1;
  for (let i = tail - 22; i >= 0; i--) if (buf.readUInt32LE(i) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error('zip: no end record');
  const disk = buf.readUInt16LE(e + 4), cdDisk = buf.readUInt16LE(e + 6), count = buf.readUInt16LE(e + 10), cdSize = buf.readUInt32LE(e + 12), cdOff = buf.readUInt32LE(e + 16);
  if (disk || cdDisk) throw new Error('zip: multi-disk archives are not supported');
  if (count === 0xffff || cdSize === 0xffffffff || cdOff === 0xffffffff) throw new Error('zip: zip64 is not supported');
  if (count > LIMITS.files) throw new Error('zip: too many files');
  if (cdOff + cdSize > fileSize) throw new Error('zip: a bad directory');
  const cd = Buffer.alloc(cdSize); fs.readSync(fd, cd, 0, cdSize, cdOff);
  const out = []; let p = 0, total = 0;
  for (let i = 0; i < count; i++) {
    if (p + 46 > cd.length || cd.readUInt32LE(p) !== 0x02014b50) throw new Error('zip: a bad directory entry');
    const made = cd.readUInt16LE(p + 4), flags = cd.readUInt16LE(p + 8), method = cd.readUInt16LE(p + 10), crc = cd.readUInt32LE(p + 16), csize = cd.readUInt32LE(p + 20), usize = cd.readUInt32LE(p + 24);
    const nl = cd.readUInt16LE(p + 28), xl = cd.readUInt16LE(p + 30), cl = cd.readUInt16LE(p + 32), ext = cd.readUInt32LE(p + 38), offset = cd.readUInt32LE(p + 42);
    const name = cd.toString(flags & 0x800 ? 'utf8' : 'latin1', p + 46, p + 46 + nl);
    p += 46 + nl + xl + cl;
    if (flags & 0x41) throw new Error('zip: encrypted entries are not supported');
    const dir = name.endsWith('/'), mode = (made >> 8) === 3 ? ext >>> 16 : 0, type = mode & 0o170000;
    if (type && type !== 0o100000 && type !== 0o040000) throw new Error(`zip: ${name} is not a plain file (a link?)`);
    if (!dir && method !== 0 && method !== 8) throw new Error(`zip: ${name}: unsupported compression ${method}`);
    if (usize > LIMITS.file) throw new Error(`zip: ${name} is too large`);
    total += usize; if (total > LIMITS.unpacked) throw new Error('zip: too large unpacked');
    out.push({ name, segs: safeSegments(name), dir, method, crc, csize, usize, offset });
  }
  return out;
}
/** unpack zipFile into destDir (made fresh); every entry checked (names, sizes, CRC) → { files, bytes } */
async function extractZip(zipFile, destDir) {
  const root = path.resolve(destDir);
  fs.rmSync(root, { recursive: true, force: true }); fs.mkdirSync(root, { recursive: true });
  const fd = fs.openSync(zipFile, 'r');
  try {
    const size = fs.fstatSync(fd).size, entries = readZipDirectory(fd, size), seen = new Set();
    let files = 0, bytes = 0;
    for (const en of entries) {
      const dest = path.join(root, ...en.segs), key = dest.toLowerCase();
      if (dest !== root && !dest.startsWith(root + path.sep)) throw new Error(`zip: ${en.name} escapes the folder`);
      if (en.dir) { fs.mkdirSync(dest, { recursive: true }); continue; }
      if (seen.has(key)) throw new Error(`zip: ${en.name} twice`); seen.add(key);
      const lh = Buffer.alloc(30); fs.readSync(fd, lh, 0, 30, en.offset);
      if (lh.readUInt32LE(0) !== 0x04034b50) throw new Error(`zip: ${en.name}: a bad local header`);
      const start = en.offset + 30 + lh.readUInt16LE(26) + lh.readUInt16LE(28);
      if (start + en.csize > size) throw new Error(`zip: ${en.name} runs past the end`);
      const raw = Buffer.alloc(en.csize); if (en.csize) fs.readSync(fd, raw, 0, en.csize, start);
      const data = en.method === 8 ? await new Promise((res, rej) => zlib.inflateRaw(raw, { maxOutputLength: Math.max(1, en.usize) }, (e, d) => (e ? rej(new Error(`zip: ${en.name}: ${e.message}`)) : res(d)))) : raw;
      if (data.length !== en.usize || crc32(data) !== en.crc) throw new Error(`zip: ${en.name} is damaged (size or CRC)`);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      await fs.promises.writeFile(dest, data);
      files++; bytes += data.length;
    }
    return { files, bytes };
  } finally { fs.closeSync(fd); }
}

// ---------------------------------------------------------------- the content store (userData/updates/)
const readJson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
function writeJsonAtomic(file, obj) {
  const tmp = `${file}.tmp-${process.pid}`;
  const fd = fs.openSync(tmp, 'w');
  try { fs.writeSync(fd, JSON.stringify(obj, null, 1)); try { fs.fsyncSync(fd); } catch (e) { /* */ } } finally { fs.closeSync(fd); }
  fs.renameSync(tmp, file); // (the switch: the old state or the new one, never half of each)
}
/** a game folder's own version (content.json: written by tools/desktop/build-desktop.mjs), or null */
function gameVersionOf(dir) { const j = readJson(path.join(dir, 'content.json')); return j && parseVersion(j.version) ? normVersion(j.version) : null; }

class ContentStore {
  /** o: { root (userData/updates), builtInDir, builtInVersion, shellVersion, log? } */
  constructor(o) {
    this.root = path.resolve(o.root); this.builtInDir = o.builtInDir; this.builtInVersion = normVersion(o.builtInVersion); this.shellVersion = normVersion(o.shellVersion);
    this.log = o.log || (() => {});
  }
  get stateFile() { return path.join(this.root, 'state.json'); }
  get downloads() { return path.join(this.root, 'downloads'); }
  dirOf(v) { return path.join(this.root, `game-${normVersion(v)}`); }
  read() {
    const j = readJson(this.stateFile) || {}, v = x => (parseVersion(x) ? normVersion(x) : null);
    const versions = {};
    for (const [k, o] of Object.entries(j.versions && typeof j.versions === 'object' ? j.versions : {})) if (parseVersion(k) && o && parseVersion(o.minShell)) versions[normVersion(k)] = { minShell: normVersion(o.minShell), at: String(o.at || '') };
    return { schema: 1, active: v(j.active), previous: v(j.previous), trial: v(j.trial), bad: Array.isArray(j.bad) ? j.bad.filter(parseVersion).map(normVersion).slice(-20) : [], versions,
      notice: j.notice && typeof j.notice === 'object' && ['updated', 'rolledBack'].includes(j.notice.kind) ? { kind: j.notice.kind, version: v(j.notice.version), to: v(j.notice.to) } : null };
  }
  write(s) { fs.mkdirSync(this.root, { recursive: true }); writeJsonAtomic(this.stateFile, s); }
  /** can this update folder run here: unpacked whole, newer than the built-in game, and this shell is new enough */
  usable(v, s = this.read()) {
    if (!v) return false;
    const dir = this.dirOf(v);
    return fs.existsSync(path.join(dir, 'index.html')) && gameVersionOf(dir) === v && cmpVersion(v, this.builtInVersion) > 0 && cmpVersion(this.shellVersion, s.versions[v]?.minShell || '0.0.0') >= 0;
  }
  pick(s = this.read()) {
    if (this.usable(s.active, s)) return { dir: this.dirOf(s.active), version: s.active, source: 'update' };
    return { dir: this.builtInDir, version: this.builtInVersion, source: 'builtin' };
  }
  /** at launch: a trial that never reached the title last time is rolled back first; then which game to serve */
  boot() {
    const s = this.read();
    if (s.trial) { this.log(`the update ${s.trial} never started last time: rolling back`); return this.rollback(s.trial, 'it did not start last time'); }
    if (s.active && !this.usable(s.active, s)) { // (a shell update brought a newer built-in game, or the folder is gone)
      s.active = this.usable(s.previous, s) ? s.previous : null; s.previous = null; this.write(s);
    }
    this.prune();
    return this.pick();
  }
  /** unpack a verified content zip as version v, make it the active version on trial → the pick */
  async install(zipFile, { version, minShell }) {
    const v = normVersion(version);
    fs.mkdirSync(this.root, { recursive: true });
    const tmp = path.join(this.root, `.unpack-${v}-${process.pid}`);
    try {
      await extractZip(zipFile, tmp);
      if (!fs.existsSync(path.join(tmp, 'index.html'))) throw new Error('the update has no index.html');
      const got = gameVersionOf(tmp);
      if (got !== v) throw new Error(`the update says it is ${got || 'no version'}, not ${v}`);
      const s = this.read(), final = this.dirOf(v);
      if (s.active === v || s.previous === v) throw new Error(`${v} is already installed`);
      fs.rmSync(final, { recursive: true, force: true });
      fs.renameSync(tmp, final);
      const cur = this.pick(s);
      s.previous = cur.source === 'update' ? cur.version : null; s.active = v; s.trial = v;
      s.versions[v] = { minShell: normVersion(minShell), at: new Date().toISOString() };
      s.bad = s.bad.filter(x => x !== v); s.notice = null;
      this.write(s);
      return this.pick(s);
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  }
  /** the trial version reached the title: keep it (and the one before it), tidy the rest */
  confirm(v) { const s = this.read(); if (s.trial && s.trial === v) { s.trial = null; this.write(s); } this.prune(); }
  /** version v failed: back to the previous update (or the built-in game), v marked as failed → the pick */
  rollback(v, reason = '') {
    const s = this.read();
    if (s.active === v) {
      s.active = this.usable(s.previous, s) ? s.previous : null; s.previous = null;
      if (!s.bad.includes(v)) s.bad.push(v);
      s.notice = { kind: 'rolledBack', version: v, to: null };
    }
    if (s.trial === v) s.trial = null;
    const p = this.pick(s); if (s.notice?.kind === 'rolledBack') s.notice.to = p.version;
    this.write(s); this.log(`rolled back ${v} (${reason}) to ${p.version}`);
    this.prune();
    return p;
  }
  takeNotice() { const s = this.read(); const n = s.notice; if (n) { s.notice = null; this.write(s); } return n; }
  /** delete what nothing needs: update folders other than the active and previous, half-unpacked folders, finished zips */
  prune() {
    const s = this.read(), keep = new Set([s.active, s.previous].filter(Boolean).map(v => `game-${v}`));
    let names = []; try { names = fs.readdirSync(this.root); } catch (e) { return; }
    for (const n of names) {
      if ((/^game-\d+\.\d+\.\d+$/.test(n) && !keep.has(n)) || /^\.unpack-/.test(n)) { try { fs.rmSync(path.join(this.root, n), { recursive: true, force: true }); } catch (e) { this.log(`prune ${n}: ${e.message}`); } }
    }
    // finished zips go; a half download stays to be resumed, unless it's for a version no newer than the game now
    const cur = this.pick(s).version;
    try {
      for (const n of fs.readdirSync(this.downloads)) {
        const m = /^pawhaven-game-(\d+\.\d+\.\d+)\.zip\.part(\.json)?$/.exec(n);
        if (/\.zip$/.test(n) || (m && cmpVersion(m[1], cur) <= 0)) fs.rmSync(path.join(this.downloads, n), { force: true });
      }
    } catch (e) { /* none */ }
  }
}

// ---------------------------------------------------------------- shell updates (Linux, the AppImage)
/** where a shell update downloads to: a hidden file beside the AppImage (the same folder: the swap is a rename) */
const appImageTemp = target => path.join(path.dirname(target), `.${path.basename(target)}.update`);
/**
 * Put a verified new AppImage (fresh, in target's folder) in place of target: mark it executable, keep the old one as
 * target.prev (a hard link, else a copy), then rename fresh over target (atomic: Steam's shortcut keeps working; the
 * running app keeps its own open copy). → { prev: path | null }
 */
function swapAppImage(target, fresh) {
  if (path.dirname(path.resolve(target)) !== path.dirname(path.resolve(fresh))) throw new Error('swapAppImage: the new file must be next to the old one');
  try { fs.chmodSync(fresh, 0o755); } catch (e) { /* (Windows: no mode bits) */ }
  const prev = target + '.prev';
  let kept = null;
  try { fs.rmSync(prev, { force: true }); fs.linkSync(target, prev); kept = prev; }
  catch (e) { try { fs.copyFileSync(target, prev); kept = prev; } catch (e2) { /* (no room for a backup: carry on without one) */ } }
  fs.renameSync(fresh, target);
  return { prev: kept };
}
/** the arguments to start the swapped-in AppImage with: the player's own switches (not the debugger's) */
const relaunchArgs = argv => argv.slice(1).filter(a => !/^--(remote-debugging-port|remote-debugging-pipe|inspect|inspect-brk|inspect-port)(=|$)/.test(a));

/** free bytes on the disk holding dir (null: unknown) */
function freeBytes(dir) { try { const s = fs.statfsSync(dir); return Number(s.bavail) * Number(s.bsize); } catch (e) { return null; } }

module.exports = {
  REPO, MANIFEST_URL, RELEASES_URL, HOSTS, LIMITS,
  parseVersion, normVersion, cmpVersion, allowedUrl, validateManifest, decide,
  get, fetchManifest, download, sha256File, crc32, safeSegments, readZipDirectory, extractZip,
  ContentStore, gameVersionOf, swapAppImage, appImageTemp, relaunchArgs, freeBytes,
};
