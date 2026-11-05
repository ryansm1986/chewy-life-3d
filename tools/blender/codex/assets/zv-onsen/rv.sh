#!/bin/bash
# review renders for one piece:  bash rv.sh <piece> <doorx,doorz> <ty>
#   <piece>-gamecam.png (saved look), <piece>-siege-gamecam.png, <piece>-close.png, <piece>-kitcmp.png (ours | kit, both
#   overlays shown on each, yaw -45) and <piece>-b-kitcmp.png (yaw +45)
cd "$(dirname "$0")"; P=$1; G=../../../../../public/models/zv-onsen-$P.glb
bash bl.sh logs/rvg-$P.log render_views.py --in $G --out preview --tag $P --door $2 --ty $3 --only gamecam --hide siege &
bash bl.sh logs/rvs-$P.log render_views.py --in $G --out preview --tag $P-siege --door $2 --ty $3 --only gamecam --hide saved &
bash bl.sh logs/rvc-$P.log render_views.py --in $G --out preview --tag $P --door $2 --ty $3 --only close --hide siege &
wait
bash bl.sh logs/rvk-$P.log render_views.py --in $G --out preview --tag $P --door $2 --ty $3 --only kitcmp --kit kitdump/kit-$P.obj --refyaw -45 &
bash bl.sh logs/rvk2-$P.log render_views.py --in $G --out preview --tag $P-b --door $2 --ty $3 --only kitcmp --kit kitdump/kit-$P.obj --refyaw 45 &
wait
