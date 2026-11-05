# rig -> export -> game face for one design: scratch/cycle.sh <a|b> <tag> [states]
set -e
cd D:/projects/chewy-life-3d/tools/blender/work/codex/folk-panda-toy
D=$1; T=$2; ST=${3:-rest,blink,b85,b60,b40,squint,happy}
H=$(python -c "import json; print(json.load(open('measurements-model-$D.json'))['total_height_m'])")
timeout 900 python run_blender.py scratch/${T}_rig.log 880 -- --background --factory-startup --python rig_folk-panda-toy.py -- --design $D > /dev/null
grep "Traceback\|Error\|TRI_TOTAL" scratch/${T}_rig.log | cut -c1-300 || true
timeout 900 python run_blender.py scratch/${T}_exp.log 880 -- --background folk-panda-$D-toy_rig.blend --python D:/projects/chewy-life-3d/tools/blender/codex/hero_export.py -- --out D:/projects/chewy-life-3d/tools/blender/work/codex/folk-panda-toy/export/$D --name folk_panda_${D}_toy --height $H --no-outline eye,tongue,mouth,lid,lash > /dev/null
grep "HERO_EXPORT" scratch/${T}_exp.log
TL=$(python -c "import json; d=json.load(open('joints-rig-$D.json')); print(d['lidTilt'], d['lidClose'])")
set -- $TL
cd D:/projects/chewy-life-3d
CFG="{\"lidTilt\":$1,\"lidClose\":$2,\"shutLash\":${SHUTLASH:-[0.10,0.028,-0.046,0.05,0.0055]},\"shutLashColor\":[\"#e8e2e6\",\"#e8e2e6\"],\"squint\":${SQJ:-[0.12,-0.28]},\"darkGrade\":[1,-4,14,-9]}" RIG_DIR=D:/projects/chewy-life-3d/tools/blender/work/codex/folk-panda-toy/export/$D ID=folk_panda_$D CY=${CY:-300} timeout 600 node tools/blender/work/codex/folk-panda-toy/scratch/villager-face-cfg.mjs tools/blender/work/codex/folk-panda-toy/gameface/$D front,45l,45r $ST > tools/blender/work/codex/folk-panda-toy/scratch/${T}_gf.log 2>&1
cd tools/blender/work/codex/folk-panda-toy
python scratch/gf_montage.py gameface/$D scratch/${T}_gf.png front,45l,45r $ST 120,100,640,380 .6 > /dev/null
python -c "
from PIL import Image
st='$ST'.split(',')
ims=[Image.open('gameface/$D/front-%s.png'%s).crop((170,150,590,360)).resize((630,315),Image.LANCZOS) for s in st]
M=Image.new('RGB',(1260,315*((len(ims)+1)//2)),'white')
for i,a in enumerate(ims): M.paste(a,((i%2)*630,(i//2)*315))
M.save('scratch/${T}_gfz.png')"
echo CYCLE_DONE
