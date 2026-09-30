"""Deterministic Chewy phase-2 rig. Blender 4.3, world-axis game contract.
Builds the approved model first, retaining authored-part labels for weighting.
Only Armature modifiers remain. No shape keys, drivers or corrective bones.
"""
import bpy,bmesh,math,json,sys,os,zlib,struct
import numpy as np
from pathlib import Path
from mathutils import Vector,Matrix
from mathutils.bvhtree import BVHTree
RIG_ROOT=Path(__file__).resolve().parent
for src,dst in [('portrait.png','portrait-round13.png'),('preview/qa-front.png','preview/qa-front-round13.png'),('preview/qa-34.png','preview/qa-34-round13.png'),('preview/qa-game-head.png','preview/qa-game-head-round13.png')]:
    import shutil
    if not (RIG_ROOT/dst).exists() and (RIG_ROOT/src).exists():shutil.copy2(RIG_ROOT/src,RIG_ROOT/dst)
build=(RIG_ROOT/'build_chewy-b.py').read_text(encoding='utf-8')
hook='''
for _pieces in parts.values():
    for _piece in _pieces:
        _vg=_piece.vertex_groups.new(name='_part_'+_piece.name)
        _vg.add(list(range(len(_piece.data.vertices))),1.0,'REPLACE')
'''
marker='# ---------------------------- production cleanup and semantic parts'
build=build.replace(marker,hook+'\n'+marker)
saved_args=sys.argv[:];sys.argv=['rig_chewy-b.py','--skip-portrait']
ns={'__file__':str(RIG_ROOT/'build_chewy-b.py'),'__name__':'chewy_model_builder'}
exec(compile(build,str(RIG_ROOT/'build_chewy-b.py'),'exec'),ns)
sys.argv=saved_args
ROOT=RIG_ROOT;J=json.loads((ROOT/'joints-round13.json').read_text())
base_objects=[o for o in bpy.context.scene.objects if o.type=='MESH']
part_labels={}
for o in base_objects:
    names=[g.name.removeprefix('_part_') for g in o.vertex_groups]
    part_labels[o.name]=[names[max(v.groups,key=lambda g:g.weight).group] for v in o.data.vertices]
    world=o.matrix_world.copy()
    for v in o.data.vertices:v.co=world@v.co
    o.matrix_world=Matrix.Identity(4)

def sm(a,b,x):
    t=max(0.,min(1.,(x-a)/(b-a)));return t*t*(3-2*t)
def smile(x):return 1.20-.84*.54+.035*(abs(x)/(.175*.675))**3+.010*math.exp(-(x/.026)**2)

# Exactly the exporter contract, with identity rest orientations (+Y tails).
BONES=['root','hips','spine','chest','neck','head','jaw']
PARENT={'root':None,'hips':'root','spine':'hips','chest':'spine','neck':'chest','head':'neck','jaw':'head',
        'tail1':'hips','tail2':'tail1','tail3':'tail2','tail4':'tail3'}
P={'root':(0,0,0),'hips':J['hips'],'spine':J['spine'],'chest':J['chest'],
   'neck':(0,.007,.672),'head':(0,.072,.692),'jaw':(0,-.181,.778)}
for tag in 'LR':
    s=1 if tag=='L' else -1
    for stem in ['eye','lidU','lidD','brow','lip','ear','earTip','upperarm','forearm','hand','thigh','shin','foot']:
        name=stem+'_'+tag;BONES.append(name)
        PARENT[name]={'earTip':'ear_'+tag,'forearm':'upperarm_'+tag,'hand':'forearm_'+tag,'thigh':'hips','shin':'thigh_'+tag,'foot':'shin_'+tag,'upperarm':'chest'}.get(stem,'head')
    # A deeper socket centre permits rigid lids to travel into the fixed head.
    # Visible approved eye caps stay exact; buried eye backs extend to this centre.
    P['eye_'+tag]=(s*.162,-.075,.903)
    P['lidU_'+tag]=(s*.162,-.075,.903)
    P['lidD_'+tag]=(s*.162,.170,1.035)
    P['brow_'+tag]=(s*.151,-.179,1.027)
    P['lip_'+tag]=(s*.118125,-.327,smile(.118125))
    P['ear_'+tag]=J['ears'][tag]['base'];P['earTip_'+tag]=(J['ears'][tag]['fold'][0],.220,1.220+(.003 if tag=='L' else 0))
    for stem,key in [('upperarm','shoulder'),('forearm','elbow'),('hand','wrist')]:P[stem+'_'+tag]=J['arms'][tag][key]
    for stem,key in [('thigh','hip'),('shin','knee'),('foot','ankle')]:P[stem+'_'+tag]=J['legs'][tag][key]
for i,k in enumerate([0,1,3,4]):
    name='tail'+str(i+1);BONES.append(name);P[name]=J['tail'][k]
assert len(BONES)==37
adata=bpy.data.armatures.new('Chewy_game_skeleton');arm=bpy.data.objects.new('Chewy_Rig',adata);bpy.context.collection.objects.link(arm)
bpy.ops.object.select_all(action='DESELECT');arm.select_set(True);bpy.context.view_layer.objects.active=arm
bpy.ops.object.mode_set(mode='EDIT')
for name in BONES:
    b=adata.edit_bones.new(name);b.head=P[name];b.tail=Vector(P[name])+Vector((0,.045,0));b.roll=0
    if PARENT[name]:b.parent=adata.edit_bones[PARENT[name]]
    b.use_connect=False
bpy.ops.object.mode_set(mode='OBJECT')
for b in arm.pose.bones:b.rotation_mode='XYZ'
arm.show_in_front=True

# Four constant colour patches in unused 5-pixel chart gutters. Existing UVs
# do not sample these pixels; the approved visible atlas paint stays intact.
raw=(ROOT/'chewy-b_atlas.png').read_bytes();offset=8;chunks=[]
while offset<len(raw):
    size=struct.unpack_from('>I',raw,offset)[0]
    if raw[offset+4:offset+8]==b'IDAT':chunks.append(raw[offset+8:offset+8+size])
    offset+=size+12
rows=np.frombuffer(zlib.decompress(b''.join(chunks)),np.uint8).reshape(2048,8193)
assert not rows[:,0].any()
atlas=rows[:,1:].reshape(2048,2048,4)[::-1].copy()
COLORS={'skin':((1026,1026),'8a5634'),'mouth':((1026,2),'4a1c1c'),'tongue':((1538,2),'e07a86')}
UV={}
for key,((x,y),hexc) in COLORS.items():
    atlas[y-1:y+2,x-1:x+2,:3]=[int(hexc[i:i+2],16) for i in (0,2,4)]
    UV[key]=((x+.5)/2048,(y+.5)/2048)
UV['lash']=ns['atlas_uv']('eye',.015,.015)
def chunk(t,d):return struct.pack('>I',len(d))+t+d+struct.pack('>I',zlib.crc32(t+d)&0xffffffff)
pixels=b''.join(b'\0'+r.tobytes() for r in atlas[::-1])
rig_atlas=ROOT/'chewy-b_rig_atlas.png'
rig_atlas.write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',2048,2048,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(pixels,9))+chunk(b'IEND',b''))
mat=ns['mat'];rig_image=bpy.data.images.load(str(rig_atlas));rig_image.pack()
for node in mat.node_tree.nodes:
    if node.type=='TEX_IMAGE':node.image=rig_image

head=bpy.data.objects['Chewy_head'];head.data.calc_loop_triangles()
headuv=head.data.uv_layers.active.data
skin_faces=[tuple(p.vertices) for p in head.data.polygons if all(0<headuv[l].uv.x<.5 and .5<headuv[l].uv.y<1 for l in p.loop_indices)]
skin_tree=BVHTree.FromPolygons([v.co[:] for v in head.data.vertices],skin_faces)
def skin_y(x,z):
    hit=skin_tree.ray_cast(Vector((x,-1,z)),Vector((0,1,0)),2)[0]
    return hit.y if hit else float(ns['head_front'](x,z))
eye_trees={tag:BVHTree.FromPolygons([v.co[:] for v in bpy.data.objects['Chewy_eye_'+tag].data.vertices],
                   [tuple(p.vertices) for p in bpy.data.objects['Chewy_eye_'+tag].data.polygons]) for tag in 'LR'}

# Split the continuous skin along its smile. Interpolated UVs and original
# corner normals preserve the rest surface; the seam has coincident lip rims.
old=head.data;old.calc_loop_triangles();normals=[Vector(n.vector) for n in old.corner_normals]
oldlabels=part_labels[head.name];verts=[];faces=[];face_uv=[];face_norm=[];labels=[];lower=[];cache={};seam=[]
def add_vertex(record,kind):
    co,uv,no,label=record
    key=tuple(round(float(x),8) for x in (*co,*uv,*no))+(label,kind)
    if key not in cache:
        cache[key]=len(verts);verts.append(tuple(co));labels.append(label);lower.append(kind)
    return cache[key]
def emit(records,kind):
    if len(records)<3:return
    for k in range(1,len(records)-1):
        rr=[records[0],records[k],records[k+1]]
        ids=[add_vertex(r,kind) for r in rr]
        if (Vector(verts[ids[1]])-Vector(verts[ids[0]])).cross(Vector(verts[ids[2]])-Vector(verts[ids[0]])).length<1e-11:continue
        faces.append(ids);face_uv.append([tuple(r[1]) for r in rr]);face_norm.append([tuple(r[2]) for r in rr])
def clip(records,keep_upper):
    out=[]
    for i,a in enumerate(records):
        b=records[(i+1)%len(records)];fa=a[0].z-smile(a[0].x);fb=b[0].z-smile(b[0].x)
        ia=fa>=0 if keep_upper else fa<=0;ib=fb>=0 if keep_upper else fb<=0
        if ia:out.append(a)
        if ia!=ib:
            t=fa/(fa-fb);r=(a[0].lerp(b[0],t),a[1].lerp(b[1],t),a[2].lerp(b[2],t),a[3])
            out.append(r)
            if keep_upper:seam.append(tuple(r[0]))
    return out
for tr in old.loop_triangles:
    rr=[(old.vertices[old.loops[l].vertex_index].co.copy(),old.uv_layers.active.data[l].uv.copy(),normals[l].copy(),oldlabels[old.loops[l].vertex_index]) for l in tr.loops]
    is_skin=rr[0][3]=='head_soft_cheeks'
    f=[r[0].z-smile(r[0].x) for r in rr]
    cut=is_skin and max(r[0].y for r in rr)<-.22 and min(abs(r[0].x) for r in rr)<.125 and min(f)<0<max(f)
    if cut:emit(clip(rr,True),False);emit(clip(rr,False),True)
    else:emit(rr,is_skin and sum(f)<0)
me=bpy.data.meshes.new('Chewy_parted_smile');me.from_pydata(verts,[],faces);me.update()
layer=me.uv_layers.new(name='Atlas')
for poly,uu in zip(me.polygons,face_uv):
    poly.use_smooth=True
    for l,u in zip(poly.loop_indices,uu):layer.data[l].uv=u
me.normals_split_custom_set([n for nn in face_norm for n in nn]);me.materials.append(mat)
head.data=me;part_labels[head.name]=labels

def make_mesh(name,coords,polys,colors):
    me=bpy.data.meshes.new(name);me.from_pydata(coords,[],polys);me.update();layer=me.uv_layers.new(name='Atlas')
    for p,key in zip(me.polygons,colors):
        p.use_smooth=True
        for l in p.loop_indices:layer.data[l].uv=UV[key]
    bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=bm.faces[:]);bm.to_mesh(me);bm.free()
    ob=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(ob);me.materials.append(mat);return ob

def lip_weight(x,z,y,lower_lip=False):
    w=.70*math.exp(-((abs(x)-.113)/.031)**2-((z-smile(x))/.030)**2)*(1-sm(-.23,-.15,y))
    return w
def jaw_weight(x,y,z):
    return (1-sm(.064,.116,abs(x)))*(1-sm(-.245,-.14,y))*sm(.65,.685,z)
def face_weights(p,part,is_lower=False):
    x,y,z=p
    if part.startswith(('upper_eye_lash','tiny_lash_flick')):return {'lidU_'+('L' if x>0 else 'R'):.6,'head':.4}
    if part.startswith('soft_brow'):return {'brow_'+('L' if x>0 else 'R'):1}
    j=jaw_weight(x,y,z) if (is_lower or part=='lower_mouth') else 0
    lip=lip_weight(x,z,y) if ('smile' in part or part in ['head_soft_cheeks','lower_mouth','mouth_roof']) else 0
    side='L' if x>=0 else 'R'
    neck=(1-sm(.675,.723,z))*(1-sm(-.17,-.03,y)) if part=='head_soft_cheeks' else 0
    return {'lip_'+side:lip,'jaw':(1-lip)*j,'neck':(1-lip)*(1-j)*neck,'head':(1-lip)*(1-j)*(1-neck)}

# A recessed pocket joins the coincident upper/lower lip rims. Its floor and
# lower rim share the chin's weight field; ceiling follows upper lip/head.
seam=sorted(set(tuple(round(x,7) for x in p) for p in seam),key=lambda p:p[0])
rim=[]
for p in seam:
    if abs(p[0])<.145 and (not rim or abs(p[0]-rim[-1][0])>.0001):rim.append(p)
assert len(rim)>=8,len(rim)
cavity_vertices=[];cavity_w=[];cavity_faces=[];cavity_colors=[];n=len(rim);D=3
for level in ['upper','lower']:
    for j in range(D+1):
        t=j/D
        for x,y,z in rim:
            corner=1-sm(.075,.116,abs(x))
            p=(x*(1-.08*t),y+.001+.09*t,z+(.024 if level=='upper' else -.033)*t*corner)
            if j:p=(p[0],max(p[1],skin_y(p[0],p[2])+.006),p[2])
            cavity_vertices.append(p);cavity_w.append(face_weights((x,y,z),'mouth_roof' if level=='upper' else 'lower_mouth',level=='lower'))
for k in range(2):
    off=k*(D+1)*n
    for j in range(D):
        for i in range(n-1):cavity_faces.append((off+j*n+i,off+j*n+i+1,off+(j+1)*n+i+1,off+(j+1)*n+i))
for i in range(n-1):cavity_faces.append((D*n+i,D*n+i+1,(2*D+1)*n+i+1,(2*D+1)*n+i))
for i in [0,n-1]:
    for j in range(D):cavity_faces.append((j*n+i,(j+1)*n+i,(D+2+j)*n+i,(D+1+j)*n+i))
cavity_triangles=[]
for f in cavity_faces:
    for k in range(1,len(f)-1):
        a,b,c=f[0],f[k],f[k+1]
        if (Vector(cavity_vertices[b])-Vector(cavity_vertices[a])).cross(Vector(cavity_vertices[c])-Vector(cavity_vertices[a])).length>1e-12:cavity_triangles.append((a,b,c))
mouth=make_mesh('Chewy_mouth_pocket',cavity_vertices,cavity_triangles,['mouth']*len(cavity_triangles))
tongue=ns['sphere']('Chewy_tongue',(0,-.299,.742),(.039,.024,.007),'fur','head',18,10)
for l in tongue.data.uv_layers.active.data:l.uv=UV['tongue']

# Round 15: rotational upper hoods and recessed lower crescents. The approved
# eyeballs, including their buried backs, are unchanged. Rest geometry is
# hidden; moving shells mask the stationary aperture and its rim completely.
# Round 15: rotational upper hoods and recessed lower crescents. The approved
# eyeballs, including their buried backs, are unchanged. Rest geometry is
# hidden; moving shells mask the stationary aperture and its rim completely.
# Fitted rigid lid masks at the two game angles, with recessed back fans.
# Fitted rigid lid masks at the two game angles, with recessed back fans.
# Complete fitted orbital hoods. Lash paint is part of the front topology,
# so it cannot leave detached fragments or a second edge on the cheek.
# Complete fitted orbital hoods. Lash paint is part of the front topology,
# so it cannot leave detached fragments or a second edge on the cheek.
# Complete fitted orbital hoods. Lash paint is part of the front topology,
# so it cannot leave detached fragments or a second edge on the cheek.
# Complete fitted orbital hoods. Lash paint is part of the front topology,
# so it cannot leave detached fragments or a second edge on the cheek.
# Complete fitted orbital hoods. Lash paint is part of the front topology,
# so it cannot leave detached fragments or a second edge on the cheek.
# Complete fitted orbital hoods. Lash paint is part of the front topology,
# so it cannot leave detached fragments or a second edge on the cheek.
# Complete fitted orbital hoods. Lash paint is part of the front topology,
# so it cannot leave detached fragments or a second edge on the cheek.
# Complete fitted orbital hoods. Lash paint is part of the front topology,
# so it cannot leave detached fragments or a second edge on the cheek.
# Rounded orbital hoods, with a thin painted lash decal on their surface.
from mathutils.geometry import closest_point_on_tri,barycentric_transform
# Rounded orbital hoods, with a thin painted lash decal on their surface.
from mathutils.geometry import closest_point_on_tri,barycentric_transform
# Rounded orbital hoods, with a thin painted lash decal on their surface.
from mathutils.geometry import closest_point_on_tri,barycentric_transform
lid_objects=[];lid_hidden_checks={}
skin_poly_ids=[p.index for p in old.polygons if all(0<old.uv_layers.active.data[l].uv.x<.5 and .5<old.uv_layers.active.data[l].uv.y<1 for l in p.loop_indices)]
def skin_sample(x,z):
    hit,_,fi,_=skin_tree.ray_cast(Vector((x,-1,z)),Vector((0,1,0)),2)
    if hit is None:return Vector(UV['skin']),Vector((0,-1,0))
    p=old.polygons[skin_poly_ids[fi]];loops=list(p.loop_indices);best=None
    for k in range(1,len(loops)-1):
        ls=[loops[0],loops[k],loops[k+1]];vv=[old.vertices[old.loops[l].vertex_index].co for l in ls]
        q=closest_point_on_tri(hit,*vv);dist=(q-hit).length_squared
        if best is None or dist<best[0]:best=(dist,q,ls,vv)
    _,q,ls,vv=best
    uu=[Vector((*old.uv_layers.active.data[l].uv,0)) for l in ls];nn=[normals[l] for l in ls]
    uv=barycentric_transform(q,*vv,*uu);normal=barycentric_transform(q,*vv,*nn).normalized()
    return Vector((uv.x,uv.y)),normal

def orbital_lid(tag,bone,angle,happy=False):
    s=1 if tag=='L' else -1;cx=s*.162;cz=.9188625;rx=.07425;rz=.0779625
    pivot=Vector(P[bone]);inverse=Matrix.Rotation(-angle,3,'X')
    N=40;radial=([.20,.40,.60,.80,.94,1.01,1.13,1.22] if happy else [.20,.40,.60,.80,.94,1.005,1.055,1.105]);points=[];polys=[];colors=[]
    for r,a in [(0,0)]+[(r,2*math.pi*i/N) for r in radial for i in range(N)]:
        co=math.cos(a);xx=r*rx*(math.copysign(abs(co)**.90,co) if s*co<0 else co)
        x=cx+xx;z=cz+r*rz*math.sin(a);skin=skin_y(x,z)
        hit=eye_trees[tag].ray_cast(Vector((x,-1,z)),Vector((0,1,0)),2)[0]
        y=min(hit.y if hit else skin,skin)-.005+.018*sm(1.15 if happy else 1.025,radial[-1],r)
        points.append(Vector((x,y,z)))
    for i in range(N):polys.append((0,1+i,1+(i+1)%N));colors.append('skin')
    for j in range(len(radial)-1):
        for i in range(N):polys.append((1+j*N+i,1+j*N+(i+1)%N,1+(j+1)*N+(i+1)%N,1+(j+1)*N+i));colors.append('skin')
    polys=[(f[0],f[k],f[k+1]) for f in polys for k in range(1,len(f)-1)];colors=['skin']*len(polys)
    eye_samples=[]
    for x in np.linspace(cx-rx,cx+rx,65):
        for z in np.linspace(cz-rz,cz+rz,65):
            hit=eye_trees[tag].ray_cast(Vector((float(x),-1,float(z))),Vector((0,1,0)),2)[0]
            if hit is not None and hit.y<skin_y(float(x),float(z))-.00015:eye_samples.append(hit)
    # The approved thick rim and flick rotate with the upper control. Include
    # those posed vertices in the envelope, not just the white eye surface.
    upper_pivot=Vector(P['lidU_'+tag]);upper_rot=Matrix.Rotation(.4 if happy else 1.22,3,'X')
    rim_samples=[]
    for v,label in zip(head.data.vertices,labels):
        if not label.startswith(('upper_eye_lash','tiny_lash_flick')) or (v.co.x>0)!=(s>0):continue
        w=face_weights(tuple(v.co),label)['lidU_'+tag]
        w=round(w*255)/255
        q=v.co*(1-w)+(upper_pivot+upper_rot@(v.co-upper_pivot))*w
        if q.y<skin_y(q.x,q.z)-.0002:rim_samples.append(q)
    coverage_samples=eye_samples+rim_samples
    for fit_pass in range(4):
        tree=BVHTree.FromPolygons(points,polys);corrections={}
        for ep in coverage_samples:
            hit,_,fi,_=tree.ray_cast(Vector((ep.x,-1,ep.z)),Vector((0,1,0)),2)
            if hit is not None:
                deficit=hit.y-(ep.y-.0025)
                if deficit>0:
                    for vi in polys[fi]:corrections[vi]=max(corrections.get(vi,0),deficit+.0001)
        if not corrections:break
        for vi,dy in corrections.items():points[vi].y-=dy
    tree=BVHTree.FromPolygons(points,polys);missed=0
    for ep in coverage_samples:
        hit=tree.ray_cast(Vector((ep.x,-1,ep.z)),Vector((0,1,0)),2)[0]
        if hit is None or hit.y>=ep.y-.0002:missed+=1
    lid_hidden_checks[bone]={'target_angle':angle,'visible_globe_samples':len(eye_samples),'posed_rim_samples':len(rim_samples),'uncovered_samples':missed}
    assert missed==0,(bone,missed)
    front_count=len(polys);center=sum(points,Vector())/len(points);center.y+=.065;ci=len(points);points.append(center)
    off=1+(len(radial)-1)*N
    for i in range(N):polys.append((off+i,off+(i+1)%N,ci));colors.append('skin')
    # The one visible lash follows a U for blink and an arch for happiness.
    # A 0.4 mm surface offset reads as paint, with no round tube or rim ring.
    Q=72;first=len(points);lash_start=len(polys)
    for j in range(2):
        for i in range(Q+1):
            a=-1.025+2.05*i/Q;x=cx+rx*a
            z=(.966-.045*a*a if happy else .875+.050*a*a)
            z+=.008*sm(.92,1.025,s*a)
            thick=.0025*(1-.80*sm(.92,1.025,abs(a)));z+=(j-.5)*thick
            hit=tree.ray_cast(Vector((x,-1,z)),Vector((0,1,0)),2)[0]
            if hit is None:
                points.append(Vector((x,skin_y(x,z)+.003,z)))
            else:points.append(Vector((x,hit.y-.0012,z)))
    for i in range(Q):polys.append((first+i,first+i+1,first+Q+2+i,first+Q+1+i));colors.append('lash')
    coords=[tuple(pivot+inverse@(p-pivot)) for p in points]
    ob=make_mesh('Chewy_'+bone,coords,polys,colors)
    samples=[skin_sample(p.x,p.z) for p in points];nn=[Vector(n.vector) for n in ob.data.corner_normals]
    for p,key in zip(ob.data.polygons,colors):
        if not (p.index<front_count or p.index>=lash_start):continue
        for l in p.loop_indices:
            vi=ob.data.loops[l].vertex_index
            if key=='skin':ob.data.uv_layers.active.data[l].uv=samples[vi][0]
            nn[l]=inverse@samples[vi][1]
    ob.data.normals_split_custom_set(nn);lid_objects.append((ob,bone))
for tag in 'LR':
    orbital_lid(tag,'lidU_'+tag,1.22)
    orbital_lid(tag,'lidD_'+tag,-.45,True)


# Consistent spatial fields carry adjoining sleeve/skin/cuff and wrap/wrist
# overlaps together. Source-part labels keep paws and garment bands rigid.
def body_weights(p,part):
    x,y,z=p;tag='L' if x>=0 else 'R'
    if part.endswith('.L') or part.endswith('.R'):tag=part[-1]
    if any(k in part for k in ['paw','thumb']):return {'hand_'+tag:1}
    if any(k in part for k in ['upper_arm','sleeve','forearm_wrap','wrist_skin']):
        shoulder=np.array(P['upperarm_'+tag]);elbow=np.array(P['forearm_'+tag]);wrist=np.array(P['hand_'+tag])
        d=wrist-shoulder;t=float((np.array(p)-shoulder)@d/(d@d))
        hand=sm(.78,1.02,t);fore=sm(.38,.64,t)
        chest=(1-sm(-.10,.12,t))*.85
        return {'chest':chest,'upperarm_'+tag:(1-chest)*(1-fore),'forearm_'+tag:(1-chest)*fore*(1-hand),'hand_'+tag:(1-chest)*fore*hand}
    if any(k in part for k in ['hakama','pants_cuff','ankle','dog_foot']):
        if 'dog_foot' in part:return {'foot_'+tag:1}
        hips=sm(.32,.42,z)*.80;shin=1-sm(.20,.29,z);foot=1-sm(.105,.158,z)
        return {'hips':hips,'thigh_'+tag:(1-hips)*(1-shin),'shin_'+tag:(1-hips)*shin*(1-foot),'foot_'+tag:(1-hips)*shin*foot}
    if 'waist_sash' in part or 'hip_' in part:
        thigh=.22*(1-sm(.34,.48,z)) if 'tail' in part else 0
        return {'hips':1-thigh,'thigh_L':thigh}
    if any(k in part for k in ['neckerchief','kerchief','throat_knot','neck_blaze']):
        neck=sm(.60,.68,z)
        return {'chest':1-neck,'neck':neck}
    hips=1-sm(.49,.57,z);chest=sm(.54,.65,z);thigh=(1-sm(.42,.49,z))*.24
    if 'lapel' in part:thigh=0
    return {'hips':hips*(1-thigh),'spine':(1-hips)*(1-chest)*(1-thigh),'chest':(1-hips)*chest*(1-thigh),'thigh_'+tag:thigh}
def ear_weights(p,tag):
    # Distance along the descending, outward flap, rather than height above
    # the crest: the original height mask missed the hanging flap itself.
    x,y,z=p;fold=Vector(P['earTip_'+tag]);d=Vector((.082,0,-.074))
    q=Vector((abs(x)-abs(fold.x),0,z-fold.z));t=q.dot(d)/d.length_squared
    tip=sm(-.10,.62,t)*sm(.228,.267,abs(x))*sm(1.132,1.182,z)
    return {'ear_'+tag:1-tip,'earTip_'+tag:tip}
def tail_weights(p):
    pts=np.array([P['tail'+str(i)] for i in range(1,5)])
    dist=np.linalg.norm(pts-np.array(p),axis=1);i=np.argsort(dist)[:2];w=1/(dist[i]+.025)**2;w/=w.sum()
    return {'tail'+str(int(k)+1):float(a) for k,a in zip(i,w)}
def bind(o,weights):
    o.vertex_groups.clear();groups={b:o.vertex_groups.new(name=b) for b in BONES}
    for v,ww in zip(o.data.vertices,weights):
        pairs=sorted([(b,float(w)) for b,w in ww.items() if w>1e-5],key=lambda x:-x[1])[:4]
        total=sum(w for b,w in pairs);assert total>0,(o.name,v.index)
        # Exact 8-bit sum = 255 avoids exporter rounding changing rest scale.
        quant=np.round(np.array([w/total for b,w in pairs])*255).astype(int)
        quant[0]+=255-int(quant.sum())
        for (b,w),q in zip(pairs,quant):
            if q>0:groups[b].add([v.index],int(q)/255,'REPLACE')
    for g in list(o.vertex_groups):
        if not any(any(w.group==g.index for w in v.groups) for v in o.data.vertices):o.vertex_groups.remove(g)
    mod=o.modifiers.new('Game skin','ARMATURE');mod.object=arm;mod.use_deform_preserve_volume=False
    o.parent=arm;o.matrix_parent_inverse=Matrix.Identity(4)
for o in base_objects:
    pp=[tuple(v.co) for v in o.data.vertices]
    if o.name=='Chewy_body':weights=[body_weights(p,n) for p,n in zip(pp,part_labels[o.name])]
    elif o.name=='Chewy_head':weights=[face_weights(p,n,k) for p,n,k in zip(pp,part_labels[o.name],lower)]
    elif o.name.startswith('Chewy_ear'):weights=[ear_weights(p,o.name[-1]) for p in pp]
    elif o.name.startswith('Chewy_eye'):weights=[{'eye_'+o.name[-1]:1} for p in pp]
    else:weights=[tail_weights(p) for p in pp]
    bind(o,weights)
bind(mouth,cavity_w);bind(tongue,[{'jaw':1} for v in tongue.data.vertices])
for o,b in lid_objects:bind(o,[{b:1} for v in o.data.vertices])
objects=base_objects+[mouth,tongue]+[o for o,b in lid_objects]
total=0
for o in objects:
    o.data.calc_loop_triangles();total+=len(o.data.loop_triangles)
    assert len(o.modifiers)==1 and o.modifiers[0].type=='ARMATURE'
    for v in o.data.vertices:
        assert 1<=len(v.groups)<=4 and abs(sum(g.weight for g in v.groups)-1)<1e-6
assert total<=34000,total
scene=bpy.context.scene
arm.data.pose_position='POSE';bpy.context.view_layer.update()
for b in arm.pose.bones:b.matrix_basis=Matrix.Identity(4)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'chewy-b_rig.blend'))
bpy.ops.object.select_all(action='DESELECT');arm.select_set(True)
for o in objects:o.select_set(True)
bpy.context.view_layer.objects.active=arm
bpy.ops.export_scene.gltf(filepath='D:/projects/chewy-life-3d/public/models/chewy-b_rig.glb',export_format='GLB',use_selection=True,export_apply=False,export_yup=True,export_animations=False,export_lights=False,export_cameras=False)
rig_joints={'bones':[{ 'name':b,'parent':PARENT[b],'head_blender_m':list(P[b]),'axes':'world +X,+Y,+Z; game XYZ = Blender X,Z,-Y'} for b in BONES],
            'triangles':total,'mouth_seam_points':rim,'lid_coverage':lid_hidden_checks,'lid_coverage':lid_hidden_checks,'lid_coverage':lid_hidden_checks,'lid_coverage':lid_hidden_checks,'notes':['Head pivot is at skull base, not volume centre.','Approved eye globes remain untouched; upper/lower lid hinges are fitted independently.','Lids are rigid swept shells with a single 2.5 mm lash edge; no shape keys or drivers.','Weights quantized to exact sum 255 for baked exporter.']}
(ROOT/'joints-rig.json').write_text(json.dumps(rig_joints,indent=2))
print('CHEWY_RIG',json.dumps({'bones':len(BONES),'meshes':len(objects),'triangles':total,'blend':str(ROOT/'chewy-b_rig.blend')}),flush=True)
