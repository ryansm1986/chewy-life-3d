// The game content pack and the shell fingerprint (docs/DESKTOP.md "Updates from inside the app", ROADMAP CT-9), used by
// tools/desktop/release-desktop.mjs and the QA (tools/qa/desktop-update.mjs, desktop-updater-unit.mjs).
//   packGame(gameDir, outZip)   the production game folder (dist-desktop/app/game) → a zip the app's updater unpacks
//                               (tools/desktop/updater.cjs extractZip): plain files, sorted, UTF-8 names, one fixed
//                               timestamp (the same files give the same bytes and hash), deflated unless that's bigger
//   shellFingerprint(root)      a hash of what makes the shell: main.cjs, preload.cjs, updater.cjs, steamenv.cjs,
//                               mainlog.cjs and the Electron version. A changed fingerprint means older apps need a shell
//                               update (update.json minShell)
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';

const walk = (dir, rel = '') => fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  .flatMap(d => (d.isDirectory() ? walk(path.join(dir, d.name), rel + d.name + '/') : d.isFile() ? [rel + d.name] : []));

/** zip a folder → { file, size, sha256, files, bytes } (no zip64: refuses past 4 GB or 65535 files) */
export function packGame(gameDir, outZip) {
  const names = walk(gameDir);
  if (!names.includes('index.html')) throw new Error(`packGame: ${gameDir} has no index.html`);
  if (names.length > 65000) throw new Error('packGame: too many files for a plain zip');
  fs.mkdirSync(path.dirname(outZip), { recursive: true });
  const tmp = outZip + '.tmp', fd = fs.openSync(tmp, 'w'), hash = crypto.createHash('sha256');
  let pos = 0, bytes = 0;
  const put = b => { fs.writeSync(fd, b); hash.update(b); pos += b.length; };
  const DOS_TIME = 0, DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1; // (2026-01-01 00:00: reproducible)
  const central = [];
  try {
    for (const name of names) {
      const data = fs.readFileSync(path.join(gameDir, ...name.split('/'))), crc = zlib.crc32(data) >>> 0;
      const z = zlib.deflateRawSync(data, { level: 9 }), stored = z.length >= data.length, body = stored ? data : z, method = stored ? 0 : 8;
      const nm = Buffer.from(name, 'utf8'), lh = Buffer.alloc(30), off = pos;
      lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x800, 6); lh.writeUInt16LE(method, 8); lh.writeUInt16LE(DOS_TIME, 10); lh.writeUInt16LE(DOS_DATE, 12);
      lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(body.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nm.length, 26); lh.writeUInt16LE(0, 28);
      put(lh); put(nm); put(body); bytes += data.length;
      if (pos > 0xfffffff0) throw new Error('packGame: past 4 GB (zip64 is not supported)');
      const ch = Buffer.alloc(46);
      ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE((3 << 8) | 20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x800, 8); ch.writeUInt16LE(method, 10); ch.writeUInt16LE(DOS_TIME, 12); ch.writeUInt16LE(DOS_DATE, 14);
      ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(body.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nm.length, 28);
      ch.writeUInt32LE((0o100644 << 16) >>> 0, 38); ch.writeUInt32LE(off, 42);
      central.push(ch, nm);
    }
    const cdOff = pos; for (const b of central) put(b);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(names.length, 8); eocd.writeUInt16LE(names.length, 10); eocd.writeUInt32LE(pos - cdOff, 12); eocd.writeUInt32LE(cdOff, 16);
    put(eocd);
  } finally { fs.closeSync(fd); }
  fs.rmSync(outZip, { force: true }); fs.renameSync(tmp, outZip);
  return { file: outZip, size: pos, sha256: hash.digest('hex'), files: names.length, bytes };
}

export function sha256Of(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }

/** the shell's identity: its scripts (line endings normalised) and the Electron version */
export function shellFingerprint(root) {
  const h = crypto.createHash('sha256');
  for (const f of ['main.cjs', 'preload.cjs', 'updater.cjs', 'steamenv.cjs', 'mainlog.cjs']) h.update(f + '\0' + fs.readFileSync(path.join(root, 'tools/desktop', f), 'utf8').replace(/\r\n/g, '\n') + '\0');
  h.update('electron\0' + JSON.parse(fs.readFileSync(path.join(root, 'node_modules/electron/package.json'), 'utf8')).version);
  return h.digest('hex').slice(0, 32);
}
