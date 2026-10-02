"""Install a hero_export.py export into the game: copies NAME.json / .bin / .png / _n.png from the export folder into
public/rigs/ (copying by hand with a `NAME.*` glob misses NAME_n.png, and the loader then falls back to the old rig).
  python tools/blender/codex/install_rig.py EXPORT_DIR NAME
  e.g. python tools/blender/codex/install_rig.py tools/blender/work/codex/shadow-toy/export shadow_toy
Colour fixes for the game's light live on the HERO_MODELS entry (tint, darkGrade), not in the files."""
import os
import shutil
import sys

src, name = sys.argv[1], sys.argv[2]
dst = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', 'public', 'rigs'))
for suffix in ('.json', '.bin', '.png', '_n.png'):
    f = os.path.join(src, name + suffix)
    if not os.path.exists(f):
        sys.exit(f'missing {f}')
    shutil.copyfile(f, os.path.join(dst, name + suffix))
    print('copied', f, '->', os.path.join(dst, name + suffix))
