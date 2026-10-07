// The Linux AppImage, made on any OS (tools/desktop/build-desktop.mjs; docs/DESKTOP.md). electron-builder's AppImage
// step needs Linux (its mksquashfs is a Linux binary, and its staging makes symlinks Windows won't), so this writes the
// image itself: AppImage = the type-2 static runtime (an ELF that mounts what follows it; the one electron-builder
// ships, AppImage/type2-runtime 20251108) + a SquashFS 4.0 image of the AppDir.
//
// The SquashFS writer is the small subset an AppImage needs: regular files and directories only, gzip (zlib) data
// blocks of 128 KiB (stored raw when that's smaller), no fragments, no xattrs, no export table, one uid/gid (root), and
// the inode and directory tables stored uncompressed (each 8 KiB metadata block flagged so), which keeps every
// metadata reference a fixed offset. Layout: superblock | data blocks | inode table | directory table | id table |
// id index. tools/desktop/verify-squashfs.py reads an image back with an independent reader (PySquashfsImage).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const BLOCK = 128 * 1024, BLOCK_LOG = 17, META = 8192, NOFRAG = 0xffffffff, INVALID = 0xffffffffffffffffn;
const T_DIR = 1, T_REG = 2;

/** { name, mode, data? (Buffer, files) | children? (Map name → node, dirs) } → a SquashFS image (Buffer) */
export function squashfs(root, { mtime = Math.floor(Date.now() / 1000) } = {}) {
  // ---- number the inodes: children before their directory, the root last (as mksquashfs does)
  let n = 0;
  const number = (node, parent) => {
    node.parent = parent;
    if (node.children) for (const c of sorted(node)) number(c, node);
    node.ino = ++n;
  };
  const sorted = node => [...node.children.values()].sort((a, b) => Buffer.compare(Buffer.from(a.name), Buffer.from(b.name)));
  number(root, null);
  const total = n;

  // ---- the data blocks, file by file (from offset 96, after the superblock)
  const out = [Buffer.alloc(96)]; let pos = 96;
  const files = []; (function collect(node) { if (node.children) for (const c of sorted(node)) collect(c); else files.push(node); })(root);
  for (const f of files) {
    f.start = f.data.length ? pos : 0; f.sizes = [];
    for (let o = 0; o < f.data.length; o += BLOCK) {
      const raw = f.data.subarray(o, Math.min(o + BLOCK, f.data.length)), z = zlib.deflateSync(raw, { level: 9 });
      const keep = z.length < raw.length ? z : raw;
      f.sizes.push(keep === raw ? (raw.length | 0x1000000) : z.length);
      out.push(keep); pos += keep.length;
    }
  }

  // ---- the inode and directory tables (uncompressed metadata streams; a reference is (block × 8194, offset))
  const inodes = new Stream(), dirs = new Stream();
  const ref = (u) => ({ block: Math.floor(u / META) * (META + 2), offset: u % META });
  const base = (h, type, mode, ino) => { h.u16(type); h.u16(mode & 0o7777); h.u16(0); h.u16(0); h.u32(mtime); h.u32(ino); };
  (function write(node) {
    if (!node.children) {
      node.u = inodes.size; const h = inodes;
      base(h, T_REG, node.mode, node.ino); h.u32(node.start); h.u32(NOFRAG); h.u32(0); h.u32(node.data.length); for (const s of node.sizes) h.u32(s);
      return;
    }
    const kids = sorted(node);
    for (const c of kids) write(c);
    // the listing: runs of ≤ 256 entries whose inodes share one metadata block and stay within ±32767 of the run's base
    const listStart = dirs.size;
    for (let i = 0; i < kids.length;) {
      const r0 = ref(kids[i].u); let j = i;
      while (j < kids.length && j - i < 256 && ref(kids[j].u).block === r0.block && Math.abs(kids[j].ino - kids[i].ino) < 32767) j++;
      dirs.u32(j - i - 1); dirs.u32(r0.block); dirs.u32(kids[i].ino);
      for (let k = i; k < j; k++) {
        const c = kids[k], nm = Buffer.from(c.name);
        if (!nm.length || nm.length > 256) throw new Error(`squashfs: bad name ${c.name}`);
        dirs.u16(ref(c.u).offset); dirs.s16(c.ino - kids[i].ino); dirs.u16(c.children ? T_DIR : T_REG); dirs.u16(nm.length - 1); dirs.bytes(nm);
      }
      i = j;
    }
    const listSize = dirs.size - listStart;
    if (listSize + 3 > 0xffff) throw new Error(`squashfs: directory ${node.name} too large for a basic inode`);
    node.u = inodes.size; const h = inodes, lr = ref(listStart);
    base(h, T_DIR, node.mode, node.ino); h.u32(lr.block); h.u32(2 + kids.filter(c => c.children).length); h.u16(listSize + 3); h.u16(lr.offset); h.u32(node.parent ? node.parent.ino : total + 1);
  })(root);

  const inodeStart = pos; const it = inodes.blocks(); out.push(it); pos += it.length;
  const dirStart = pos; const dt = dirs.blocks(); out.push(dt); pos += dt.length;
  // the id table: one id (0, root) in a metadata block, then its index (one u64 pointer)
  const idBlockPos = pos; const ids = new Stream(); ids.u32(0); const idb = ids.blocks(); out.push(idb); pos += idb.length;
  const idStart = pos; const idx = Buffer.alloc(8); idx.writeBigUInt64LE(BigInt(idBlockPos)); out.push(idx); pos += 8;

  // ---- the superblock
  const sb = out[0], rr = ref(root.u);
  sb.writeUInt32LE(0x73717368, 0); sb.writeUInt32LE(total, 4); sb.writeUInt32LE(mtime, 8); sb.writeUInt32LE(BLOCK, 12); sb.writeUInt32LE(0, 16);
  sb.writeUInt16LE(1, 20); sb.writeUInt16LE(BLOCK_LOG, 22); sb.writeUInt16LE(0x0001 | 0x0010 | 0x0200 | 0x0800, 24); sb.writeUInt16LE(1, 26); sb.writeUInt16LE(4, 28); sb.writeUInt16LE(0, 30);
  sb.writeBigUInt64LE((BigInt(rr.block) << 16n) | BigInt(rr.offset), 32); sb.writeBigUInt64LE(BigInt(pos), 40); sb.writeBigUInt64LE(BigInt(idStart), 48);
  sb.writeBigUInt64LE(INVALID, 56); sb.writeBigUInt64LE(BigInt(inodeStart), 64); sb.writeBigUInt64LE(BigInt(dirStart), 72); sb.writeBigUInt64LE(BigInt(idStart), 80); sb.writeBigUInt64LE(INVALID, 88);
  // (fragment_table_start: no fragments, so it just points at the next table, as mksquashfs leaves it)
  const img = Buffer.concat(out);
  const pad = (4096 - (img.length % 4096)) % 4096; // (mksquashfs pads to 4 KiB; bytes_used doesn't count it)
  return pad ? Buffer.concat([img, Buffer.alloc(pad)]) : img;
}

class Stream {
  constructor() { this.parts = []; this.size = 0; }
  push(b) { this.parts.push(b); this.size += b.length; }
  u16(v) { const b = Buffer.alloc(2); b.writeUInt16LE(v); this.push(b); }
  s16(v) { const b = Buffer.alloc(2); b.writeInt16LE(v); this.push(b); }
  u32(v) { const b = Buffer.alloc(4); b.writeUInt32LE(v >>> 0); this.push(b); }
  bytes(b) { this.push(b); }
  /** the stream as uncompressed metadata blocks: [u16 0x8000 | length][≤ 8192 bytes]… */
  blocks() {
    const all = Buffer.concat(this.parts), out = [];
    for (let o = 0; o < all.length || o === 0; o += META) {
      const chunk = all.subarray(o, Math.min(o + META, all.length)), h = Buffer.alloc(2); h.writeUInt16LE(0x8000 | chunk.length); out.push(h, chunk);
      if (!all.length) break;
    }
    return Buffer.concat(out);
  }
}

/** a folder → the squashfs tree (modes from isExec(relative path): 0755, else 0644; folders 0755) */
export function treeFromDir(dir, isExec, rel = '') {
  const node = { name: path.basename(dir), mode: 0o755, children: new Map() };
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name, full = path.join(dir, e.name);
    if (e.isDirectory()) node.children.set(e.name, treeFromDir(full, isExec, r));
    else if (e.isFile()) node.children.set(e.name, { name: e.name, mode: isExec(r) ? 0o755 : 0o644, data: fs.readFileSync(full) });
  }
  return node;
}

const file = (name, data, mode = 0o644) => ({ name, mode, data: Buffer.isBuffer(data) ? data : Buffer.from(data) });
const dirNode = (name, kids = []) => ({ name, mode: 0o755, children: new Map(kids.map(k => [k.name, k])) });

/**
 * Write an AppImage: the app folder (linux-unpacked) plus AppRun, the .desktop entry and the icon, behind the runtime.
 * o: { appDir, out, runtime (path), exe ('pawhaven'), name ('Pawhaven'), version, icon (png path), isExec, comment }
 */
export function buildAppImage(o) {
  const root = treeFromDir(o.appDir, o.isExec); root.name = '';
  const png = fs.readFileSync(o.icon);
  // AppRun: the AppImage's entry point. It adds --no-sandbox only where Chromium's namespace sandbox can't work (no
  // unprivileged user namespaces): the setuid helper can't be setuid inside a FUSE mount
  const appRun = `#!/usr/bin/env bash
# ${o.name}'s AppImage launcher (tools/desktop/appimage.mjs)
HERE="\${APPDIR:-$(dirname "$(readlink -f "$0")")}"
export PATH="$HERE\${PATH:+:$PATH}"
export LD_LIBRARY_PATH="$HERE/usr/lib\${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export XDG_DATA_DIRS="$HERE/usr/share\${XDG_DATA_DIRS:+:$XDG_DATA_DIRS}:/usr/local/share:/usr/share"
NO_SANDBOX=()
case " $* " in *" --no-sandbox "*) ;; *) unshare -Ur true 2>/dev/null || NO_SANDBOX=(--no-sandbox) ;; esac
exec "$HERE/${o.exe}" "\${NO_SANDBOX[@]}" "$@"
`;
  const desktop = `[Desktop Entry]
Name=${o.name}
Comment=${o.comment || o.name}
Exec=AppRun %U
Terminal=false
Type=Application
Icon=${o.exe}
StartupWMClass=${o.name}
Categories=Game;
X-AppImage-Version=${o.version}
`;
  for (const k of [file('AppRun', appRun, 0o755), file(`${o.exe}.desktop`, desktop), file(`${o.exe}.png`, png), file('.DirIcon', png),
    dirNode('usr', [dirNode('share', [dirNode('icons', [dirNode('hicolor', [dirNode('512x512', [dirNode('apps', [file(`${o.exe}.png`, png)])])])])])])]) root.children.set(k.name, k);
  const img = squashfs(root);
  const runtime = fs.readFileSync(o.runtime);
  if (runtime.readUInt32BE(0) !== 0x7f454c46 || runtime.subarray(8, 11).toString('latin1') !== 'AI\x02') throw new Error('appimage: the runtime is not a type-2 AppImage runtime');
  fs.writeFileSync(o.out, Buffer.concat([runtime, img]));
  try { fs.chmodSync(o.out, 0o755); } catch (e) { /* (Windows: no exec bit to set) */ }
  return { size: runtime.length + img.length, offset: runtime.length, squashfs: img.length };
}
