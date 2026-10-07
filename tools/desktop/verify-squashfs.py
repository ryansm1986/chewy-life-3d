"""Read a Pawhaven AppImage back with an independent SquashFS reader and compare it with the folder it was made from
(tools/desktop/appimage.mjs writes the image itself, on any OS). Checks the runtime header, every file's bytes and mode,
and the AppImage extras (AppRun, the .desktop entry, the icons).

usage: python tools/desktop/verify-squashfs.py release/desktop/Pawhaven-<v>-linux-x64.AppImage release/desktop/linux-unpacked
needs: pip install PySquashfsImage   (0.9; set PYTHONPATH if it's installed with --target)
"""
import hashlib
import os
import stat
import sys

from PySquashfsImage import SquashFsImage


def elf_end(buf):
    """the end of an ELF64 file: its section headers (where the AppImage runtime puts the image)"""
    assert buf[:4] == b'\x7fELF' and buf[4] == 2, 'not an ELF64 runtime'
    assert buf[8:11] == b'AI\x02', 'not a type-2 AppImage runtime'
    shoff = int.from_bytes(buf[0x28:0x30], 'little')
    shentsize = int.from_bytes(buf[0x3A:0x3C], 'little')
    shnum = int.from_bytes(buf[0x3C:0x3E], 'little')
    return shoff + shentsize * shnum


def main(appimage, src):
    with open(appimage, 'rb') as f:
        head = f.read(1 << 20)
    off = elf_end(head)
    with open(appimage, 'rb') as f:
        f.seek(off)
        assert f.read(4) == b'hsqs', f'no squashfs at the runtime end ({off})'
    img = SquashFsImage.from_file(appimage, offset=off)
    seen, bad = {}, []
    for entry in img:
        if entry.is_dir:
            continue
        rel = entry.path.lstrip('/')
        seen[rel] = entry
    want = {}
    for dirpath, _, files in os.walk(src):
        for name in files:
            full = os.path.join(dirpath, name)
            want[os.path.relpath(full, src).replace(os.sep, '/')] = full
    for rel, full in sorted(want.items()):
        e = seen.get(rel)
        if e is None:
            bad.append(f'missing: {rel}')
            continue
        data = e.read_bytes()
        with open(full, 'rb') as f:
            ref = f.read()
        if len(data) != len(ref) or hashlib.sha256(data).digest() != hashlib.sha256(ref).digest():
            bad.append(f'differs: {rel} ({len(data)} vs {len(ref)} bytes)')
    extras = ['AppRun', '.DirIcon', 'pawhaven.desktop', 'pawhaven.png', 'usr/share/icons/hicolor/512x512/apps/pawhaven.png']
    for x in extras:
        if x not in seen:
            bad.append(f'missing extra: {x}')
    for x, m in [('AppRun', 0o755), ('pawhaven', 0o755), ('chrome_crashpad_handler', 0o755), ('resources/app.asar', 0o644)]:
        if x in seen and stat.S_IMODE(seen[x].mode) != m:
            bad.append(f'mode {x}: {oct(stat.S_IMODE(seen[x].mode))}, want {oct(m)}')
    apprun = seen['AppRun'].read_bytes().decode() if 'AppRun' in seen else ''
    if not apprun.startswith('#!/usr/bin/env bash') or 'exec "$HERE/pawhaven"' not in apprun:
        bad.append('AppRun does not launch pawhaven')
    print(f'runtime {off} bytes; squashfs {img.sblk.bytes_used} bytes, {img.sblk.inodes} inodes; {len(want)} app files + {len(extras)} extras checked')
    for b in bad[:30]:
        print('  ' + b)
    print('FAIL' if bad else 'PASS', 'squashfs read-back')
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1], sys.argv[2]))
