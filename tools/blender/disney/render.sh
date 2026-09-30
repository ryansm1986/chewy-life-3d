#!/bin/sh
# render.sh OUT_DIR NAME "views" [extra build.py options...] -> OUT_DIR/NAME.png (views side by side)
OUT="$1"; NAME="$2"; VIEWS="$3"; shift 3
HERE="$(cd "$(dirname "$0")" && pwd)"
"${BLENDER:-/c/Program Files/Blender Foundation/Blender 4.3/blender.exe}" -b --factory-startup -P "$HERE/build.py" -- "$OUT" views="$VIEWS" "$@" 2>&1 | grep -E "^\[sdf|^\[[a-z]+ .*(verts|WARN|strands|rig|export)|Error|Traceback|line [0-9]"
python - "$OUT" "$NAME" "$VIEWS" "$@" <<'PY'
import sys, os
from PIL import Image
out, name, views = sys.argv[1], sys.argv[2], sys.argv[3].split(',')
look = next((a.split('=')[1] for a in sys.argv[4:] if a.startswith('look=')), 'clay')
ims = [Image.open(os.path.join(out, look + '_' + v.replace(':', '-') + '.png')) for v in views]
w, h = ims[0].size
s = Image.new('RGB', (w * len(ims), h))
for i, im in enumerate(ims): s.paste(im, (i * w, 0))
s.save(os.path.join(out, name + '.png')); print('sheet', os.path.join(out, name + '.png'))
PY
