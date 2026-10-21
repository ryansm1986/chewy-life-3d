base=open('work/king_base.py',encoding='utf-8').read()
tail=open('work/king_tail.py',encoding='utf-8').read()
head='''# King Mochi the Squishy (Pawhaven enemy EN-1, the Mossy Burrow's boss) -- from the King Mochi callout of the
# approved mochi-slime sheet (Option A "Daifuku Drop"), on top of the approved slime (same dome, same face style).
# Deterministic build, from an empty scene:
#   blender --background --factory-startup --python build_mochi-king.py
# One rigid mesh: a single object `body`, origin (0, 0, 0) = the ground centre; the game scales it x3 (about 2.5 m).
#   dome     the slime's measured surface of revolution at 0.95 m wide (same H/W), #ffe8f0, light top, base band
#   face     the slime's shells: big eyes, stern brows, blush; a grand two-lobe moustache with curled tips and a gold
#            brooch with a ruby (raised shells with bent normals, so they shade plump); no mouth (as the callout)
#   crown    a flared gold band with 8 rounded points (front tallest), gold balls on the tips, a darker rim bead,
#            jewels as domed shells on the wall (ruby front, emeralds +-45 deg, sapphires +-90 deg); a red velvet cap
#   mantle   an ermine fur roll round the shoulders and back, its ends tucked by the crown, dark tail-tip spots
#   cape     a closed 3.5 cm shell round the back half, tucked under the fur, flaring to the floor with soft folds
# Vertex colours only (attribute `Col`, face-corner domain); one material `toon`. No rig, no textures, no UVs.
'''
s=head+base+tail
a="for f in (0.0, 0.13, 0.26, 0.385, 0.505, 0.62, 0.73, 0.83, 0.92):"
assert s.count(a)==1
s=s.replace(a,"for f in (0.0, 0.15, 0.30, 0.45, 0.60, 0.74):           # (King: the crown and cap cover the top)")
s=s.replace("CAP_Z = 0.77 * H0             # the dusted top's border (plus a gentle wave)", "CAP_Z = 0.82 * H0             # the light top's border (King r2: a little higher, so he reads pink from 45 deg)")
assert 'CAP_Z = 0.82' in s
open('build_mochi-king.py','w',encoding='utf-8',newline='\n').write(s)
