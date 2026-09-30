"""Chewy B / Toybox Chibi -- deterministic, unrigged hero asset.

Blender 4.3: blender --background --factory-startup --python build_chewy-b.py
All dimensions and joint coordinates are Blender metres; forward is -Y.
Rebuild inputs: ear-front-round5.json, ear-front-paint-round5.png,
with fresh geometric ear normals after applied surface relaxation.
"""
import bpy, bmesh, math, json, os, sys, struct, zlib, random
import numpy as np
from mathutils import Vector

ROOT = os.path.dirname(os.path.abspath(__file__))
MODEL = 'D:/projects/chewy-life-3d/public/models/chewy-b.glb'
random.seed(17)
np.random.seed(17)
bpy.ops.wm.read_factory_settings(use_empty=True)
PI = math.pi

PALETTE = {
    'fur': '#8A5634', 'warm': '#B87A4C', 'cream': '#F4ECE0',
    'iris': '#E0A040', 'iris_top': '#B8742A', 'pupil': '#2A1812',
    'nose': '#6A3A2A', 'navy': '#243A6A', 'red': '#D8402E',
    'pants': '#2E2A36', 'pink': '#B06850', 'brow': '#4A2A1C', 'shade': '#5E3A26',
}
def rgb(c):
    h = PALETTE.get(c, c).lstrip('#')
    return np.array([int(h[i:i+2], 16)/255 for i in (0,2,4)], np.float64)
def mix(a,b,t):
    return np.asarray(a)*(1-np.asarray(t)[...,None])+np.asarray(b)*np.asarray(t)[...,None]
def clamp(x): return np.clip(x,0,1)
def smooth(a,b,x):
    t=clamp((x-a)/(b-a)); return t*t*(3-2*t)
def spow(x,p): return np.sign(x)*np.abs(x)**p

# Explicit atlas charts preserve stable UVs across revisions. Four-pixel gutters.
CHARTS = {
    'head': (0,1024,1024,1024), 'eye': (1024,1536,256,512), 'eye.R': (1280,1536,256,512),
    'fur': (1536,1536,512,512), 'coat': (1024,1024,1024,512),
    'ear': (1536,512,512,512), 'pants': (0,512,512,512),
    'red': (512,512,512,512), 'cream': (1024,512,512,512),
    'navy': (512,256,512,256), 'nose': (0,0,512,512),
    'dark': (512,0,256,256), 'brow': (768,0,256,256),
    'wrap': (1024,0,512,512), 'foot': (1536,0,512,512),
}
def atlas_uv(chart,u,v):
    x,y,w,h=CHARTS[chart]; g=5
    return ((x+g+u*(w-2*g))/2048,(y+g+v*(h-2*g))/2048)

# Round 7 preserves the approved face projection and face/coat/costume atlas.
# The ear chart is reprojected to retain its approved front colour layout.
W = .675
H = .540
HEAD_CZ = 1.20-H/2
HEAD_RZ = H/2
HEAD_RX = W/2
HEAD_RY = .245
HEAD_Y = .018
MUZZLE_Z = .788
EYE_Z = 1.20-.55*H
EYE_X = .24*W
EYE_RX = .105*W
EYE_RZ = .150*H
GI_RINGS = [(.402,.276,.198),(.411,.277,.197),(.430,.265,.187),
            (.450,.229,.176),(.482,.214,.151),(.514,.201,.145),
            (.548,.198,.141),(.582,.202,.139),(.616,.203,.134),
            (.649,.178,.120),(.679,.115,.098)]

def smile_height(x):
    return 1.20-.84*H+.035*(np.abs(x)/(.175*W))**3+.010*np.exp(-(np.asarray(x)/.026)**2)

def coat_color(c):
    # Round 2 palette values are used directly, without the round 4 grey mix.
    return c

def head_radius(z):
    zn=(np.asarray(z)-HEAD_CZ)/HEAD_RZ
    # Near-vertical cheeks; greatest width a little below the midline.
    cheek=1-.11*smooth(-.20,.65,zn)
    return HEAD_RX*clamp(1-np.abs(zn)**2.8)**(1/2.8)*cheek

def head_depth(z):
    zn=(np.asarray(z)-HEAD_CZ)/HEAD_RZ
    return HEAD_RY*np.sqrt(clamp(1-zn**2))

def skull_front(x,z):
    rx=np.maximum(1e-7,head_radius(z))
    return HEAD_Y-head_depth(z)*clamp(1-(np.abs(np.asarray(x))/rx)**2.5)**(1/2.5)

def eye_socket_field(x,z):
    r2=((np.abs(x)-EYE_X)/(EYE_RX*1.05))**2+((np.asarray(z)-EYE_Z)/(EYE_RZ*1.05))**2
    return 1-smooth(1.06,1.80,r2)

def muzzle_displacement(x,z):
    # Rounded-box front is almost vertical through nose, lips and lower jaw.
    # A smooth union with the skull produces a single continuous cheek surface.
    pad=-.278+.048*(np.asarray(x)/(.255*W))**4+.028*((np.asarray(z)-MUZZLE_Z)/(.15*H))**4
    delta=skull_front(x,z)-pad
    blend=.006
    bump=.5*(delta+np.sqrt(delta*delta+blend*blend))
    return bump*(1-eye_socket_field(x,z))

def head_front(x,z):
    return skull_front(x,z)-muzzle_displacement(x,z)+.003*eye_socket_field(x,z)

def head_point(u,v):
    a=2*PI*u; p=PI*v; zn=spow(-math.cos(p),.84)
    z=HEAD_CZ+HEAD_RZ*zn
    x=float(head_radius(z))*spow(math.sin(a),.8)
    y=HEAD_Y+float(head_depth(z))*spow(math.cos(a),.8)
    front=max(0,-math.cos(a))
    # Match the analytic face used by independent eyes and surface strokes.
    y-=float(muzzle_displacement(x,z))*front**.65
    y+=.003*float(eye_socket_field(x,z))*front**.65
    return x,y,z

def paint(chart,U,V):
    # Smooth painted form shading, without directional cast shadows.
    if chart=='head':
        a=2*PI*U; zn=spow(-np.cos(PI*V),.84)
        Z=HEAD_CZ+HEAD_RZ*zn
        X=head_radius(Z)*spow(np.sin(a),.8)
        front=np.maximum(0,-np.cos(a))
        warm=.25*smooth(.52,.96,zn)
        C=mix(rgb('fur'),rgb('warm'),warm)
        # Crease shading is local; cheeks retain the base coat, not a dark bib.
        under_brow=np.exp(-((np.abs(X)-.155)/.069)**2-((Z-1.004)/.023)**2)*front**5
        muzzle_crease=np.exp(-((np.abs(X)-.118)/.019)**2-((Z-.781)/.044)**2)*front**5
        chin_crease=np.exp(-((X/.12)**2+((Z-.678)/.012)**2))*front**4
        C=mix(C,rgb('shade'),.09*under_brow+.07*muzzle_crease+.12*chin_crease)
        upper=np.exp(-((X/(.25*W))**2+((Z-MUZZLE_Z)/(.16*H))**2)*1.5)*front**3
        C=mix(C,rgb('warm'),upper*.065)
        C=coat_color(C)
        # Round 11: keep the approved smile-to-cream gap. Expand only
        # the lower paint footprint into a broad U over the chin and jaw.
        cream_top=smile_height(X)-.0035-.035*W
        ellipse_distance=.085*(1-np.sqrt((X/(.15*W))**2+((Z-.731)/.085)**2))
        smile_distance=cream_top-Z
        k=.006
        h=clamp(.5+.5*(smile_distance-ellipse_distance)/k)
        distance=smile_distance*(1-h)+ellipse_distance*h-k*h*(1-h)
        # Carry cream onto the anterior underside, rolling off before the
        # back of the head. No edge ends on the visible front jaw.
        anterior=1-smooth(-.12,.20,np.cos(a))
        mark=smooth(-.0015,.0015,distance)*anterior
        chin_color=mix(rgb('#E6D8C3'),rgb('cream'),smooth(.660,.701,Z))
        C=mix(C,chin_color,mark)
        return C

    if chart.startswith('eye'):
        X=(U-.5)*2; Z=(V-.5)*2
        # The fixed socket buries the globe equator. Dimensions below are
        # calibrated against its actual visible aperture, not the full globe.
        s=1 if chart=='eye' else -1
        vx=1.0; vz=1.0
        ix=-s*.30*vx; iz=.10*vz
        rx=.69*vx; rz=.90*vz
        shadow=smooth(.56*vz,.88*vz,Z)*.95
        C=mix(rgb('#fbf6ee'),rgb('#d9d2d0'),shadow)
        ex=(X-ix)/rx; ez=(Z-iz)/rz
        r=np.sqrt(ex*ex+ez*ez)
        lower=mix(rgb('#e89a2c'),rgb('#f4b848'),smooth(.05,.90,-ez))
        iris=mix(lower,rgb('#7a4414'),smooth(-.05,.85,ez))
        iris=mix(iris,rgb('#653713'),smooth(.93,1.00,r)*.90)
        ray=(np.sin(np.arctan2(ez,ex)*36+r*18)*.5+.5)*.014
        iris*=1-ray[...,None]
        ir=1-smooth(.992,1.008,r)
        C=mix(C,iris,ir)
        px=ix; pz=iz+.035*rz
        pupil=np.sqrt(((X-px)/(.70*rx))**2+((Z-pz)/(.76*rz))**2)
        C=mix(C,rgb('#140a06'),1-smooth(.988,1.012,pupil))
        # Both eyes use screen upper-left reflections; no mirrored highlights.
        hx=px-.38*rx; hz=pz+.51*rz
        large=np.sqrt(((X-hx)/(.26*rx))**2+((Z-hz)/(.185*rz))**2)
        small=np.sqrt(((X-(hx-.17*rx))/(.075*rx))**2+((Z-(hz-.29*rz))/(.065*rz))**2)
        C=mix(C,rgb('#ffffff'),np.maximum(1-smooth(.94,1.06,large),1-smooth(.90,1.10,small)))
        # A tiny unused chart corner supplies the lash colour without altering
        # the dark chart used by the approved mouth and nose details.
        C[(U<.06)&(V<.06)]=rgb('#1e120c')
        return C
    if chart=='ear':
        # Continuous projected charts retain the approved pink/brown layout.
        raw=open(os.path.join(ROOT,'ear-front-paint-round5.png'),'rb').read()
        offset=8;chunks=[]
        while offset<len(raw):
            size=struct.unpack_from('>I',raw,offset)[0]
            if raw[offset+4:offset+8]==b'IDAT':chunks.append(raw[offset+8:offset+8+size])
            offset+=size+12
        rows=np.frombuffer(zlib.decompress(b''.join(chunks)),np.uint8).reshape(512,2049)
        assert not rows[:,0].any()
        pixels=rows[:,1:].reshape(512,512,4)[::-1,:,:3].astype(np.float64)/255
        px=U*511;py=V*511;ix=px.astype(int);iy=py.astype(int);fx=px-ix;fy=py-iy
        a=pixels[iy,ix]*(1-fx[...,None])+pixels[iy,np.minimum(ix+1,511)]*fx[...,None]
        b=pixels[np.minimum(iy+1,511),ix]*(1-fx[...,None])+pixels[np.minimum(iy+1,511),np.minimum(ix+1,511)]*fx[...,None]
        return a*(1-fy[...,None])+b*fy[...,None]


    if chart=='nose':
        C=mix(rgb('#522B20'),rgb('nose'),.55+.33*V)
        hl=np.exp(-(((U-.39)/.21)**2+((V-.78)/.14)**2)*2)*.33
        C=mix(C,rgb('#B77959'),hl)
        nost=((U-.245)/.069)**2+((V-.40)/.077)**2<1
        nost|=((U-.755)/.069)**2+((V-.40)/.077)**2<1
        C[nost]=rgb('#3C231C')
        return C
    base={'fur':'fur','coat':'navy','navy':'navy','pants':'pants','red':'red','cream':'cream',
          'dark':'pupil','brow':'brow','wrap':'cream','foot':'fur'}[chart]
    light={'fur':'warm','coat':'#344F83','navy':'#344F83','pants':'#443D49','red':'#EC5037',
           'cream':'#FFF6EA','dark':'#342019','brow':'#4A2A1C','wrap':'#FFF6EA','foot':'warm'}[chart]
    amount=.18+.24*smooth(.12,.95,V)
    if chart in ('fur','foot'):amount=.25*smooth(.67,.98,V)
    if chart in ('coat','pants'): amount+=.055*np.sin(2*PI*U)**2
    C=mix(rgb(base),rgb(light),amount)
    if chart=='coat':
        Z=np.interp(V,np.linspace(0,1,len(GI_RINGS)),[p[0] for p in GI_RINGS])
        RX=np.interp(V,np.linspace(0,1,len(GI_RINGS)),[p[1] for p in GI_RINGS])
        X=RX*np.sin(U*2*PI); front=np.cos(U*2*PI)<-.65
        # Fur in the open collar: a narrow soft V above the scarf knot.
        # Keep the lower pre-existing blaze, joining it to the throat opening.
        half_width=np.where(Z>.628,.075*clamp((Z-.622)/.025),
                            .033*clamp((Z-.556)/.123))
        blaze=(1-smooth(half_width-.0015,half_width+.0015,np.abs(X)))*front*(Z>.556)
        C=mix(C,rgb('#EBDDC8'),blaze)
        # Tailored crossing edges; the ivory bands are actual rounded ribbons.
        seam=front*(Z>.401)*(Z<.570)*(1-smooth(.0015,.005,np.abs(X-(.018+.50*(.550-Z)))))
        C=mix(C,rgb('#172A4F'),seam*.85)

    if chart=='wrap':
        band=np.exp(-((V-.34)/.017)**2)+np.exp(-((V-.68)/.017)**2)
        C=mix(C,rgb('#C7B59E'),clamp(band)*.38)
    if chart=='foot':
        # Three broad toes suggested with two restrained painted creases.
        a=U*2*PI; x=np.sin(a); front=np.cos(a)<-.35
        line=(np.exp(-((x-.38)/.035)**2)+np.exp(-((x+.38)/.035)**2)+np.exp(-((x)/.035)**2))*front
        line*=np.exp(-((V-.48)/.22)**2)
        C=mix(C,rgb('#5E3A26'),clamp(line)*.35)
        # The outer toes wrap around the front corners, readable in profile.
        yy=.140*spow(np.sin(PI*V)*np.cos(a),.70)
        side=(np.abs(np.sin(a))**2)*(1-smooth(.78,.93,V))*smooth(.20,.37,V)
        side_lines=np.exp(-((yy+.078)/.006)**2)+np.exp(-((yy+.108)/.006)**2)
        C=mix(C,rgb('#5E3A26'),clamp(side_lines*side)*.48)
        pad=(V<.28)*(1-smooth(.68,.82,np.abs(x)))
        C=mix(C,rgb('#78503A'),pad*.60)
    if chart in ('fur','foot'):C=coat_color(C)
    return C

atlas=np.empty((2048,2048,4),np.uint8); atlas[:]=[106,63,43,255]
for name,(x,y,w,h) in CHARTS.items():
    u=np.clip((np.arange(w)-5)/(w-10),0,1)
    v=np.clip((np.arange(h)-5)/(h-10),0,1)
    U,V=np.meshgrid(u,v)
    atlas[y:y+h,x:x+w,:3]=np.round(clamp(paint(name,U,V))*255).astype(np.uint8)
def png_chunk(t,d): return struct.pack('>I',len(d))+t+d+struct.pack('>I',zlib.crc32(t+d)&0xffffffff)
atlas_path=os.path.join(ROOT,'chewy-b_atlas.png')
raw=b''.join(b'\x00'+r.tobytes() for r in atlas[::-1])
with open(atlas_path,'wb') as f:
    f.write(b'\x89PNG\r\n\x1a\n'+png_chunk(b'IHDR',struct.pack('>IIBBBBB',2048,2048,8,6,0,0,0))+png_chunk(b'IDAT',zlib.compress(raw,9))+png_chunk(b'IEND',b''))
del atlas
img=bpy.data.images.load(atlas_path); img.name='Chewy_B_painted_atlas_2048'; img.pack()
mat=bpy.data.materials.new('Chewy_B_atlas'); mat.use_nodes=True
bs=mat.node_tree.nodes.get('Principled BSDF')
bs.inputs['Roughness'].default_value=.75
bs.inputs['Metallic'].default_value=0
bs.inputs['Specular IOR Level'].default_value=.30
tx=mat.node_tree.nodes.new('ShaderNodeTexImage'); tx.image=img; tx.interpolation='Linear'
mat.node_tree.links.new(tx.outputs['Color'],bs.inputs['Base Color'])

parts={'body':[],'head':[],'ear.L':[],'ear.R':[],'eye.L':[],'eye.R':[],'tail':[]}
def mesh(name,verts,faces,uvs,chart,group):
    me=bpy.data.meshes.new(name); me.from_pydata(verts,[],faces); me.update()
    uv=me.uv_layers.new(name='Atlas')
    for poly,pts in zip(me.polygons,uvs):
        for li,pt in zip(poly.loop_indices,pts): uv.data[li].uv=atlas_uv(chart,*pt)
        poly.use_smooth=True
    bm=bmesh.new(); bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm,faces=bm.faces[:]); bm.to_mesh(me); bm.free()
    ob=bpy.data.objects.new(name,me); bpy.context.collection.objects.link(ob)
    ob.data.materials.append(mat); parts[group].append(ob)
    return ob

def sphere(name,center,radii,chart='fur',group='body',seg=32,rows=20,deform=None,orient=None):
    """Latitude rings with unique pole vertices: no degenerate pole quads."""
    if group=='body':
        seg=max(16,int(seg*.75)); rows=max(10,int(rows*.72))
    elif group=='head' and name!='head_soft_cheeks':
        seg=max(12,int(seg*.85));rows=max(8,int(rows*.85))
    us=np.linspace(0,1,seg+1);vs=np.linspace(0,1,rows+1)
    if name=='head_soft_cheeks':
        # Concentrate the existing budget on the muzzle and socket blends.
        us=np.interp(us,[0,.15,.30,.50,.70,.85,1],[0,.25,.37,.50,.63,.75,1])
        vs=np.interp(vs,[0,.18,.42,.65,.81,1],[0,.24,.38,.55,.73,1])
    c=Vector(center); rr=Vector(radii)
    def point(u,v):
        a=2*PI*u; p=PI*v
        if deform: q=Vector(deform(u,v))
        else: q=Vector((rr.x*math.sin(p)*math.sin(a),rr.y*math.sin(p)*math.cos(a),-rr.z*math.cos(p)))
        if orient is not None: q=orient@q
        return tuple(c+q)
    verts=[point(.5,0)]
    for j in range(1,rows):
        for i in range(seg): verts.append(point(float(us[i]),float(vs[j])))
    top=len(verts); verts.append(point(.5,1))
    faces=[]; uvs=[]
    idx=lambda j,i:1+(j-1)*seg+(i%seg)
    for i in range(seg):
        u0=float(us[i]); u1=float(us[i+1])
        faces.append((0,idx(1,i+1),idx(1,i))); uvs.append((((u0+u1)*.5,0),(u1,float(vs[1])),(u0,float(vs[1]))))
    for j in range(1,rows-1):
        for i in range(seg):
            u0=float(us[i]);u1=float(us[i+1]);v0=float(vs[j]);v1=float(vs[j+1])
            faces.append((idx(j,i),idx(j,i+1),idx(j+1,i+1),idx(j+1,i)))
            uvs.append(((u0,v0),(u1,v0),(u1,v1),(u0,v1)))
    for i in range(seg):
        u0=float(us[i]); u1=float(us[i+1])
        faces.append((idx(rows-1,i),idx(rows-1,i+1),top)); uvs.append(((u0,float(vs[-2])),(u1,float(vs[-2])),((u0+u1)*.5,1)))
    return mesh(name,verts,faces,uvs,chart,group)

def catmull(points,t):
    pts=[Vector(p) for p in points]; n=len(pts)-1
    k=min(int(t*n),n-1); f=t*n-k
    p0=pts[max(k-1,0)];p1=pts[k];p2=pts[k+1];p3=pts[min(k+2,n)]
    return .5*((2*p1)+(-p0+p2)*f+(2*p0-5*p1+4*p2-p3)*f*f+(-p0+3*p1-3*p2+p3)*f*f*f)
def tube(name,points,radius,chart='fur',group='body',rings=16,sides=12,flatten=1,cap=True,closed=False):
    """Sweep with parallel-transport frames and sufficient bend loops."""
    if group=='body':
        rings=max(6,int(rings*.66));sides=max(8,int(sides*.75))
    verts=[]; faces=[]; uvs=[]; previous_x=None
    for j in range(rings+(0 if closed else 1)):
        t=j/rings
        p=catmull(points,t)
        d=(catmull(points,min(1,t+.001))-catmull(points,max(0,t-.001))).normalized()
        ref=Vector((0,1,0)) if abs(d.y)<.95 else Vector((1,0,0))
        if previous_x is None:
            x=d.cross(ref).normalized()
        else:
            x=(previous_x-d*previous_x.dot(d)).normalized()
        y=d.cross(x).normalized();previous_x=x
        r=radius(t) if callable(radius) else radius
        if isinstance(r,(tuple,list)): rx,ry=r
        else: rx,ry=r,r*flatten
        for i in range(sides):
            a=2*PI*i/sides
            verts.append(tuple(p+x*(rx*math.cos(a))+y*(ry*math.sin(a))))
    nrows=rings if closed else rings+1
    for j in range(rings):
        for i in range(sides):
            nj=(j+1)%nrows;ni=(i+1)%sides
            faces.append((j*sides+i,j*sides+ni,nj*sides+ni,nj*sides+i))
            uvs.append(((i/sides,j/rings),((i+1)/sides,j/rings),((i+1)/sides,(j+1)/rings),(i/sides,(j+1)/rings)))
    if cap and not closed:
        for j in (0,rings):
            k=len(verts); verts.append(tuple(catmull(points,j/rings)))
            for i in range(sides):
                faces.append((k,j*sides+i,j*sides+(i+1)%sides))
                uvs.append(((.5,j/rings),(i/sides,j/rings),((i+1)/sides,j/rings)))
    return mesh(name,verts,faces,uvs,chart,group)

def patch(name,points,chart,group='body',thick=.009,subdiv=2):
    """A padded polygon; bevel and subdivision give cloth edges a soft toy finish."""
    n=len(points); c=sum((Vector(p) for p in points),Vector())/n
    # points are given around a front-facing border, backed in +Y.
    verts=[tuple(p) for p in points]+[tuple(Vector(p)+Vector((0,thick,0))) for p in points]
    verts.extend([tuple(c),tuple(c+Vector((0,thick,0)))])
    faces=[];uvs=[]
    xs=[p[0] for p in points];zs=[p[2] for p in points]
    def uv(p):return ((p[0]-min(xs))/(max(xs)-min(xs)+1e-7),(p[2]-min(zs))/(max(zs)-min(zs)+1e-7))
    for i in range(n):
        k=(i+1)%n
        for face in ((2*n,i,k),(2*n+1,k+n,i+n),(i,i+n,k+n,k)):
            faces.append(face);uvs.append(tuple(uv(verts[v]) for v in face))
    ob=mesh(name,verts,faces,uvs,chart,group)
    # Use a small bevel rather than subdividing the triangulated front fan.
    bpy.context.view_layer.objects.active=ob;ob.select_set(True)
    mod=ob.modifiers.new('padded cloth edge','BEVEL');mod.width=.005;mod.segments=2
    bpy.ops.object.modifier_apply(modifier=mod.name);ob.select_set(False)
    return ob

# ---------------------------- head, muzzle, nose and smile
head_surface=sphere('head_soft_cheeks',(0,0,0),(1,1,1),'head','head',76,50,deform=head_point)
# Soften the sampled socket transitions before fitting the separate eyeballs.
# Preserve crown, chin, outer silhouette and the central blunt muzzle profile.
bm=bmesh.new();bm.from_mesh(head_surface.data)
socket_verts=[v for v in bm.verts if v.co.y<-.07 and .07<abs(v.co.x)<.265 and .775<v.co.z<.995]
for _ in range(3):
    bmesh.ops.smooth_vert(bm,verts=socket_verts,factor=.40,use_axis_x=True,use_axis_y=True,use_axis_z=True)
bmesh.ops.recalc_face_normals(bm,faces=bm.faces[:]);bm.to_mesh(head_surface.data);bm.free()
from mathutils.bvhtree import BVHTree
bpy.context.view_layer.update()
head_bvh=BVHTree.FromObject(head_surface,bpy.context.evaluated_depsgraph_get())
def face_surface(x,z):
    hit,normal,index,distance=head_bvh.ray_cast(Vector((x,-1,z)),Vector((0,1,0)),2)
    return hit.y if hit is not None else float(head_front(x,z))

def nose_shape(u,v):
    a=2*PI*u;p=PI*v;z=-math.cos(p);sn=math.sin(p)
    return (.070*spow(sn*math.sin(a),.78)*(.88+.43*z),.025*sn*math.cos(a),.055*H*spow(z,.82))
NOSE_Z=1.20-.72*H
NOSE_Y=face_surface(0,NOSE_Z)-.008
nose=sphere('rounded_triangle_liver_nose',(0,NOSE_Y,NOSE_Z),(1,1,1),'nose','head',32,18,deform=nose_shape)
uv=nose.data.uv_layers.active
for poly in nose.data.polygons:
    for li in poly.loop_indices:
        co=nose.data.vertices[nose.data.loops[li].vertex_index].co
        uv.data[li].uv=atlas_uv('nose',clamp(co.x/(.21*W)+.5),clamp((co.z-(NOSE_Z-.055*H))/(.11*H)))

smile=[]
for x in np.linspace(-.175*W,.175*W,33):
    z=smile_height(x);smile.append((float(x),face_surface(float(x),z)-.0022,z))
tube('gentle_omega_smile',smile,.0018,'dark','head',36,6)
phil=[]
for z in np.linspace(smile_height(0),NOSE_Z-.048*H,5):
    phil.append((0,face_surface(0,float(z))-.0022,float(z)))
tube('short_philtrum',phil,.0017,'dark','head',6,6)
for s in (-1,1):
    x=s*.175*W;z=smile_height(x)
    pts=[(x-s*.005,face_surface(x-s*.005,z+.004)-.002,z+.004),
         (x,face_surface(x,z)-.002,z),(x+s*.004,face_surface(x+s*.004,z-.003)-.002,z-.003)]
    tube('smile_dimple.'+str(s),pts,.0019,'dark','head',4,6)

eye_measurements={}
def eye(s):
    # Preserve the approved anatomical centres; fit the cap to the socket.
    cx=s*EYE_X; cy=face_surface(cx,EYE_Z)+.012
    center=Vector((cx,cy,EYE_Z)); yaw=s*math.radians(17)
    seg=48;rows=15;verts=[];faces=[];coords=[]
    # Grow upward from the round-12 lower edge; anatomical pivot stays fixed.
    opening_width=.22*W
    opening_height=1.05*opening_width
    aperture_z=EYE_Z-.23*H/2+opening_height/2
    rx=opening_width/2;rz=opening_height/2
    def point(theta,a):
        co=math.cos(a);si=math.sin(a)
        # Flatten the nasal side slightly, keeping the outer side round.
        xx=rx*math.sin(theta)*(spow(co,.90) if s*co<0 else co)
        zz=rz*math.sin(theta)*si
        x=cx+xx;z=aperture_z+zz
        # Oval footprint on the socket, with a closed globe behind it.
        return (x,face_surface(x,z)-.017*math.cos(theta)-.0008,z)
    def edge(a):
        lo=0.;hi=PI/2
        for _ in range(24):
            mid=(lo+hi)*.5;x,y,z=point(mid,float(a))
            if y<face_surface(x,z):lo=mid
            else:hi=mid
        return point((lo+hi)*.5,float(a)),(lo+hi)*.5
    # Solve full ellipsoid radii to the requested exposed width and height.
    for _ in range(9):
        border=np.array([edge(a)[0] for a in np.linspace(0,2*PI,181)])
        rx*=opening_width/np.ptp(border[:,0]);rz*=opening_height/np.ptp(border[:,2])
    border=np.array([edge(a)[0] for a in np.linspace(0,2*PI,181)])
    for j in range(rows+1):
        theta=PI*j/rows
        if j in (0,rows):
            verts.append(point(theta,0));coords.append((.5,.5))
        else:
            for i in range(seg):
                a=2*PI*i/seg;co=math.cos(a)
                verts.append(point(theta,a))
                xx=math.sin(theta)*(spow(co,.90) if s*co<0 else co)
                coords.append((.5+.5*xx,.5+.5*math.sin(theta)*math.sin(a)) if j<=rows//2 else (.97,.97))
    top=len(verts)-1;idx=lambda j,i:1+(j-1)*seg+i%seg
    for i in range(seg):faces.append((0,idx(1,i),idx(1,i+1)))
    for j in range(1,rows-1):
        for i in range(seg):faces.append((idx(j,i),idx(j+1,i),idx(j+1,i+1),idx(j,i+1)))
    for i in range(seg):faces.append((idx(rows-1,i),top,idx(rows-1,i+1)))
    tag='L' if s==1 else 'R';chart='eye' if s==1 else 'eye.R'
    globe=mesh('eyeball.'+tag,verts,faces,[tuple(coords[k] for k in f) for f in faces],chart,'eye.'+tag)
    # Test actual inward/upward globe rotation in the fixed aperture. A shallow
    # ellipsoid cannot turn like a sphere: record white coverage lost to skull.
    from mathutils import Matrix
    turn=Matrix.Rotation(-s*math.radians(24),3,'Z') @ Matrix.Rotation(math.radians(-6),3,'X')
    turned=[center+turn@(Vector(v)-center) for v in verts]
    test=BVHTree.FromPolygons(turned,faces)
    missed=0;count=0
    for a in np.linspace(0,2*PI,120,endpoint=False):
        _,theta=edge(float(a))
        p=Vector(point(theta*.90,float(a)));skin=face_surface(p.x,p.z)
        hit=test.ray_cast(Vector((p.x,-1,p.z)),Vector((0,1,0)),2)[0]
        count+=1;missed+=int(hit is None or hit.y>=skin-.0003)
    eye_measurements[tag]={'center_m':list(center),'aperture_center_z_m':aperture_z,'globe_radii_m':[rx,.017,rz],
        'opening_width_m':float(np.ptp(border[:,0])),'opening_height_m':float(np.ptp(border[:,2])),
        'opening_min_m':border.min(axis=0).tolist(),'opening_max_m':border.max(axis=0).tolist(),
        'visible_UV_half_extent':[float(np.ptp(border[:,0]))/(2*rx),float(np.ptp(border[:,2]))/(2*rz)],
        'iris_fraction':[.69,.90],'iris_center_normalized':[-s*.30,.10],
        'pupil_fraction_of_iris':[.70,.76],'pupil_hex':'#140a06',
        'large_catchlight_width_scale_vs_round12':1.30*.69/.68,'upper_lash_radius_scale_vs_round12':2.0,
        'rotation_test_degrees':[24,6],'rotation_test_aperture_samples':count,'rotation_test_lost_white_samples':missed,
        'gaze_method':'nasal/upward iris paint on independent closed socket-fitted globe; fixed socket coverage preserved'}
    # Upper lid only: thick over top-outer quadrant. The bottom white has a
    # soft contact with fur; a fine brown stroke follows only the outer half.
    pts=[]
    for a in np.linspace(.30 if s==1 else 0,PI if s==1 else PI-.30,49):
        (x,y,z),_=edge(float(a));z-=.0038*math.sin(float(a));pts.append((x,face_surface(x,z)-.0035,z))
    def lash_radius(t):
        outer=(1-t) if s==1 else t
        return 2*(.0017+.0016*math.sin(PI*t)**.7+.0011*math.exp(-((outer-.27)/.22)**2))
    upper=tube('upper_eye_lash.'+tag,pts,lash_radius,chart,'head',22,6)
    for uv in upper.data.uv_layers.active.data:uv.uv=atlas_uv(chart,.015,.015)
    angles=np.linspace(-PI/2,0,25) if s==1 else np.linspace(PI,3*PI/2,25)
    pts=[]
    for a in angles:
        (x,y,z),_=edge(float(a));pts.append((x,face_surface(x,z)-.0004,z))
    tube('soft_outer_lower_lid.'+tag,pts,lambda t:.00035+.00035*math.sin(PI*t),'brow','head',10,4)
    (x,y,z),_=edge(.30 if s==1 else PI-.30)
    flick=tube('tiny_lash_flick.'+str(s),[(x,face_surface(x,z)-.0025,z),
        (x+s*.008,face_surface(x+s*.008,z+.010)-.0015,z+.010)],lambda t:.0026*(1-t)+.0005,chart,'head',6,6)
    for uv in flick.data.uv_layers.active.data:uv.uv=atlas_uv(chart,.015,.015)
    # Brows are locked to round 11.
    pts=[]
    for x,z in [(s*.098,1.020),(s*.132,1.035),(s*.172,1.031),(s*.211,1.012)]:
        pts.append((x,face_surface(x,z)-.003,z))
    tube('soft_brow.'+str(s),pts,lambda t:.0016+.0165*math.sin(PI*t)**.65,'brow','head',16,8,flatten=.76)
    return list(center)

eye_centers={tag:eye(s) for s,tag in ((-1,'R'),(1,'L'))}

# ---------------------------- folded ears, outward-facing cupped shells
ear_paths={}
def ear(s):
    # A closed, thick cupped pinna. Its front outline and front UV projection
    # come from the approved export; the fold is a compact padded relief in
    # depth, so the shell remains a filled triangle from grazing cameras.
    tag='L' if s==1 else 'R'
    ref=json.load(open(os.path.join(ROOT,'ear-front-round5.json')))[tag]
    level_z=np.array(ref['z']);lo=np.array(ref['x_min']);hi=np.array(ref['x_max'])
    # Round off the inherited flap/upright step over a 12 mm bend radius.
    # Limit this to the outer fold junction, retaining crown and front bounds.
    dz=float(level_z[1]-level_z[0]);sigma=.012/dz
    offsets=np.arange(-int(3*sigma),int(3*sigma)+1)
    kernel=np.exp(-.5*(offsets/sigma)**2);kernel/=kernel.sum()
    rounded=np.convolve(np.pad(hi,(len(offsets)//2,)*2,mode='edge'),kernel,mode='valid')
    junction=smooth(1.125,1.155,level_z)*(1-smooth(1.215,1.240,level_z))
    hi=hi*(1-junction)+rounded*junction
    front_xmin=float(lo.min());front_xmax=float(hi.max())
    def front_uv(x,z):
        return ((.03 if tag=='L' else .52)+.45*(abs(x)-front_xmin)/(front_xmax-front_xmin),
                .04+.92*(z-level_z[0])/(level_z[-1]-level_z[0]))
    n=40;m=22;verts=[];uv_front=[];faces=[];uvs=[]
    yaw=math.radians(30)
    def point(t,a):
        z=float(level_z[0]+t*(level_z[-1]-level_z[0]))
        left=float(np.interp(z,level_z,lo));right=float(np.interp(z,level_z,hi))
        mid=(left+right)*.5;half=(right-left)*.5
        x=s*(mid+half*math.cos(a));uv=front_uv(x,z)
        fold=float(smooth(-.055,.055,z-(1.440-.80*abs(x)+(.003 if s==1 else 0))))
        # Both the upright shell and its fold face thirty degrees outward.
        # A gentle backward lean exposes the broad face from elevated views.
        local_yaw=yaw
        wall=1.20*.5*W*(.060*(1-t)+.035*t)/math.cos(local_yaw)
        end=math.sqrt(max(0,min(1,t/.055,(1-t)/.055)))
        wall*=end
        # The fold's exterior hull includes the rounded bend and overlapping
        # layers, giving it a padded volume rather than a knife edge.
        folded_volume=.018*fold*end
        # A continuous U section keeps the middle of the pinna filled from
        # grazing cameras; wall thickness is independent of its curved depth.
        cup=.042*(1-.15*t)*end
        sn=math.sin(a)
        # Cup in both directions: the lengthwise convex bow prevents the
        # whole pinna from becoming a thin blade at an elevated side angle.
        bow=.027*math.sin(PI*t)**1.1
        y=-.035+.075*t+bow+s*math.tan(local_yaw)*(x-s*mid)
        # The fold crest stays back; its lower rounded tip comes forward.
        # This gives the outer cap an upward-facing broad surface in gameplay.
        dip=fold*(1-float(smooth(1.175+(.003 if s==1 else 0),1.280+(.003 if s==1 else 0),z)))
        # Fold relief is on the inner face; the exterior is one continuous cap.
        # This prevents the back-view hull developing a shoulder or notch.
        y+=wall*float(spow(sn,.60))+cup*sn*sn
        if sn<0:y-=(folded_volume+.028*dip)*float((-sn)**1.4)
        # Round 8: preserve the approved inner face and front X/Z silhouette,
        # but turn the exterior into a convex solid toy wedge. Normal depth
        # is .12 W at the root, tapering to .05 W toward the hanging tip.
        # A smooth rear hemisphere joins the existing rounded side rims.
        # The high bend is padded too: t runs to the *fold crest*, not the
        # anatomical tip. Taper across the outer hanging flap to its short,
        # rounded tip, rather than thinning the entire high part of the ear.
        tip=float(smooth(.270,.354,abs(x)))*(1-float(smooth(1.170,1.245,z)))
        normal_depth=W*(.120-.070*tip)
        added_depth=max(0,normal_depth/math.cos(local_yaw)-2*wall/max(end,1e-8))
        if sn>0:
            # A long elliptical cap rounds the high bend into a triangular
            # wedge. The rear bulk closes gradually instead of making a
            # squared-off cylinder at the last two longitudinal stations.
            rear_cap=min(end,math.sqrt(max(0,1-(max(0,t-.68)/.32)**2)))
            rear=wall*float(sn**.60)+cup*sn*sn
            y+=added_depth*rear_cap*float(sn**.70)+rear*(rear_cap/max(end,1e-8)-1)
        return (x,y,z),uv
    for t in (0,):
        p,uv=point(t,0);verts.append(p);uv_front.append(uv)
    for j in range(1,n):
        for i in range(m):
            p,uv=point(j/n,2*PI*i/m);verts.append(p);uv_front.append(uv)
    top=len(verts);p,uv=point(1,0);verts.append(p);uv_front.append(uv)
    index=lambda j,i:1+(j-1)*m+(i%m)
    def face(ids,segment):
        faces.append(tuple(ids))
        if segment>=m//2:uvs.append(tuple(uv_front[k] for k in ids))
        else:uvs.append(tuple((.01,.01) for _ in ids))
    for i in range(m):face((0,index(1,i+1),index(1,i)),i)
    for j in range(1,n-1):
        for i in range(m):face((index(j,i),index(j,i+1),index(j+1,i+1),index(j+1,i)),i)
    for i in range(m):face((index(n-1,i),index(n-1,i+1),top),i)
    ob=mesh('folded_ear.'+tag,verts,faces,uvs,'ear','ear.'+tag)
    # Round 9: apply surface relaxation, removing inherited cloth-like
    # custom normals. Taubin pairs filter ripples without shrinking the cup.
    # Keep the approved bounds, orientation, fold and colour projection.
    bm=bmesh.new();bm.from_mesh(ob.data)
    for _ in range(10):
        bmesh.ops.smooth_vert(bm,verts=bm.verts[:],factor=.35,use_axis_x=False,use_axis_y=True,use_axis_z=False)
    before=np.array([v.co[:] for v in bm.verts])
    bounds_min=before.min(axis=0);bounds_size=np.ptp(before,axis=0)
    for _ in range(8):
        for factor in (.50,-.53):
            bmesh.ops.smooth_vert(bm,verts=bm.verts[:],factor=factor,use_axis_x=True,use_axis_y=True,use_axis_z=True)
    after=np.array([v.co[:] for v in bm.verts])
    clean_min=after.min(axis=0);clean_size=np.ptp(after,axis=0)
    for v in bm.verts:
        v.co=Vector(bounds_min+(np.array(v.co)-clean_min)*bounds_size/clean_size)
    bmesh.ops.recalc_face_normals(bm,faces=bm.faces[:]);bm.to_mesh(ob.data);bm.free()
    # Continuous UV projection across the smoothed face, with the same paint.
    back_uv=Vector(atlas_uv('ear',.01,.01))
    for p in ob.data.polygons:
        is_front=any((ob.data.uv_layers.active.data[i].uv-back_uv).length>1e-6 for i in p.loop_indices)
        if is_front:
            for i in p.loop_indices:
                v=ob.data.vertices[ob.data.loops[i].vertex_index]
                ob.data.uv_layers.active.data[i].uv=atlas_uv('ear',*front_uv(v.co.x,v.co.z))
    fold_z=1.255+(.003 if s==1 else 0)
    fold_x=s*float(np.interp(fold_z,level_z,(lo+hi)*.5))
    bpy.context.view_layer.update()
    new_tree=BVHTree.FromPolygons([v.co.copy() for v in ob.data.vertices],[tuple(p.vertices) for p in ob.data.polygons])
    def joint(x,z):
        left=float(np.interp(z,level_z,lo));right=float(np.interp(z,level_z,hi))
        margin=(right-left)*.15
        x=s*min(right-margin,max(left+margin,abs(x)))
        a=new_tree.ray_cast(Vector((x,-1,z)),Vector((0,1,0)),2)[0]
        b=new_tree.ray_cast(Vector((x,1,z)),Vector((0,-1,0)),2)[0]
        assert a is not None and b is not None,(tag,x,z,'joint outside pinna')
        return (float(x),float((a.y+b.y)*.5),float(z))
    ear_paths[tag]=[joint(s*.2025,1.119),joint(s*.237,1.205),
                    joint(fold_x,fold_z),joint(s*.290,1.215),joint(s*.333,1.184)]
for s in (-1,1):ear(s)


# ---------------------------- neck, gi shell, lapels and chest blaze
sphere('visible_neck_blaze',(0,-.036,.670),(.034,.080,.080),'cream','body',24,16)
rings=GI_RINGS
verts=[];faces=[];uvs=[];N=40
for j,(z,rx,ry) in enumerate(rings):
    for i in range(N):
        a=2*PI*i/N
        wobble=.002*math.cos(a*3+.4)*(1-j/(len(rings)-1))
        if j==0:
            # Two hanging panels frame a shallow central opening; the front
            # sits ahead of the hakama instead of blending into their top.
            wobble+=.019*math.exp(-(math.sin(a)/.16)**2)*max(0,-math.cos(a))**8
        verts.append((rx*math.sin(a),ry*math.cos(a)+.011,z+wobble))
for j in range(len(rings)-1):
    for i in range(N):
        faces.append((j*N+i,j*N+(i+1)%N,(j+1)*N+(i+1)%N,(j+1)*N+i))
        uvs.append(((i/N,j/(len(rings)-1)),((i+1)/N,j/(len(rings)-1)),((i+1)/N,(j+1)/(len(rings)-1)),(i/N,(j+1)/(len(rings)-1))))
gi_shell=mesh('gi_soft_flared_shell',verts,faces,uvs,'coat','body')

def coat_front(x,z):
    rx=float(np.interp(z,[p[0] for p in rings],[p[1] for p in rings]))
    ry=float(np.interp(z,[p[0] for p in rings],[p[2] for p in rings]))
    return .011-ry*math.sqrt(max(.04,1-(x/rx)**2))-.006

def lapel(name,pts,width,depth):
    # Wide flattened rounded ribbons: ivory bands form the crossing V.
    points=[(x,coat_front(x,z)-depth,z) for x,z in pts]
    tube(name,points,lambda t:(width,.0045),'cream','body',20,12)
lapel('ivory_under_lapel',[(.099,.669),(.073,.628),(.035,.573),(-.023,.513)],.015,.003)
lapel('ivory_right_over_lapel',[(-.099,.669),(-.071,.627),(-.025,.565),(.031,.514)],.015,.010)
# Navy overlap continues beyond the white collar, under the sash and into
# the skirt: a visible tailored edge rather than pants beginning at the belt.
overlap=[(.043,.492),(.062,.454),(.081,.428),(.092,.404)]
tube('navy_lapel_overlap_below_sash',[(x,coat_front(x,z)-.001,z) for x,z in overlap],
     lambda t:(.007,.004),'navy','body',12,8)

# ---------------------------- arms, short sleeves, wraps and mitten paws
joint_arms={}
for s in (-1,1):
    tag='L' if s==1 else 'R'
    shoulder=(s*.188,.013,.641); elbow=(s*.284,-.002,.510); wrist=(s*.363,-.022,.405)
    joint_arms[tag]={'shoulder':shoulder,'elbow':elbow,'wrist':wrist}
    arm=tube('upper_arm_skin.'+tag,[(s*.226,.009,.596),(s*.280,.001,.524)],lambda t:.066-.008*t,'fur','body',10,20)
    for v in arm.data.vertices:v.co.y=.005+(v.co.y-.005)*1.16
    sleeve=tube('straight_open_gi_sleeve.'+tag,[(s*.173,.013,.640),(s*.208,.010,.612),(s*.245,.007,.572),(s*.267,.003,.548)],lambda t:(.076+.006*t,.071+.006*t),'navy','body',12,24,cap=False)
    for v in sleeve.data.vertices:v.co.y=.007+(v.co.y-.007)*1.12
    # Return the cuff into the sleeve: a true annular opening around the arm.
    p=Vector((s*.267,.003,.548));d=Vector((s*(.267-.245),-.004,-.024)).normalized()
    ex=d.cross(Vector((0,1,0))).normalized();ey=d.cross(ex).normalized()
    vv=[];ff=[];uu=[];n=18
    for rr in (.082,.071):
        for i in range(n):
            a=2*PI*i/n;q=p+ex*(rr*math.cos(a))+ey*((rr-.005)*math.sin(a));q.y=.007+(q.y-.007)*1.12;vv.append(tuple(q))
    for i in range(n):
        ff.append((i,(i+1)%n,n+(i+1)%n,n+i));uu.append(((i/n,0),((i+1)/n,0),((i+1)/n,1),(i/n,1)))
    mesh('open_sleeve_cuff.'+tag,vv,ff,uu,'navy','body')
    tube('thick_forearm_wrap.'+tag,[(s*.283,-.004,.529),(s*.316,-.011,.482),(s*.349,-.018,.433)],lambda t:(.073-.007*t,.068-.005*t),'wrap','body',10,24)
    tube('wrist_skin.'+tag,[(s*.349,-.019,.436),wrist,(s*.378,-.026,.385)],lambda t:.063+.003*t,'fur','body',7,18)
    def hand_shape(u,v,s=s):
        a=2*PI*u;p=PI*v;sn=math.sin(p);z=-math.cos(p)
        x=.071*sn*math.sin(a);y=.063*sn*math.cos(a)
        zz=.087*z
        # Two soft finger grooves cut into the lower front of one mitten.
        groove=(math.exp(-((x-.025)/.004)**2)+math.exp(-((x+.025)/.004)**2))
        y+=.006*groove*max(0,-math.cos(a))**4*math.exp(-((z+.38)/.48)**2)
        return x,y,zz
    sphere('large_mitten_paw.'+tag,(s*.385,-.029,.361),(1,1,1),'fur','body',28,20,deform=hand_shape)
    sphere('short_thumb_bump.'+tag,(s*.342,-.058,.386),(.030,.034,.039),'fur','body',18,12)

# ---------------------------- hakama, rounded feet
for s in (-1,1):
    tag='L' if s==1 else 'R'
    def pants_shape(u,v,s=s):
        a=2*PI*u;p=PI*v;sn=math.sin(p);z=-math.cos(p)
        w=1+.09*math.exp(-((z-.10)/.55)**2)
        pleat=1-.035*math.cos(a*5+.3)*sn**2
        # Retain the front widths; add a round thigh and seat in depth.
        yy=.160*spow(sn*math.cos(a),.92)*pleat
        yy+=.025*max(0,math.cos(a))*math.exp(-((z-.32)/.64)**2)*sn
        return (.133*spow(sn*math.sin(a),.75)*w,yy,.148*spow(z,.85))
    sphere('rounded_hakama.'+tag,(s*.130,.017,.284),(1,1,1),'pants','body',28,20,deform=pants_shape)
    sphere('gathered_pants_cuff.'+tag,(s*.142,.013,.155),(.088,.127,.033),'pants','body',24,14)
    sphere('ankle.'+tag,(s*.143,.012,.119),(.074,.072,.064),'fur','body',20,14)
    def foot_shape(u,v):
        a=2*PI*u;p=PI*v;sn=math.sin(p);z=-math.cos(p)
        x=.122*spow(sn*math.sin(a),.78);y=.140*spow(sn*math.cos(a),.70)
        # Three toe grooves on the top, plus a subtly flattened soft sole.
        groove=sum(math.exp(-((x-q)/.0055)**2) for q in (-.047,0,.047))
        zz=.075*spow(z,.88)-.006*groove*max(0,z)*max(0,-math.cos(a))**3
        side_groove=sum(math.exp(-((y-q)/.008)**2) for q in (-.078,-.108))
        x*=1-.10*side_groove*abs(math.sin(a))**2*math.exp(-((z-.05)/.65)**2)
        return x,y,zz
    from mathutils import Matrix
    sphere('broad_dog_foot.'+tag,(s*.148,-.043,.075),(1,1,1),'foot','body',32,27,deform=foot_shape,orient=Matrix.Rotation(s*.10,3,'Z'))

# ---------------------------- neckerchief, belt and left hip tails
def ellipse_band(name,rx,ry,z,height,chart,center_y=0,N=64,M=10):
    verts=[];faces=[];uvs=[]
    for j in range(M):
        p=2*PI*j/M
        for i in range(N):
            a=2*PI*i/N
            # Elliptical padded band with a gently rolled rim.
            verts.append(((rx+.011*math.cos(p))*math.sin(a),center_y+(ry+.011*math.cos(p))*math.cos(a),z+height*.5*math.sin(p)))
    for j in range(M):
        for i in range(N):
            faces.append((j*N+i,j*N+(i+1)%N,((j+1)%M)*N+(i+1)%N,((j+1)%M)*N+i))
            uvs.append(((i/N,j/M),((i+1)/N,j/M),((i+1)/N,(j+1)/M),(i/N,(j+1)/M)))
    return mesh(name,verts,faces,uvs,chart,'body')
ellipse_band('red_waist_sash',.219,.171,.503,.084,'red',.009,44,8)
ellipse_band('red_neckerchief_band',.151,.122,.663,.05*H,'red',-.009,40,8)
# Flattened cloth bands drape from the continuous neck wrap to the knot.
tube('kerchief_drape_R',[(-.121,-.062,.665),(-.088,-.122,.654),(-.039,-.158,.637),(0,-.170,.629)],
     lambda t:(.016,.006),'red','body',16,10)
tube('kerchief_drape_L',[(.121,-.062,.665),(.088,-.122,.654),(.039,-.160,.637),(0,-.174,.629)],
     lambda t:(.016,.006),'red','body',16,10)
sphere('flattened_throat_knot',(0,-.182,.628),(.04*W,.012,.017),'red','body',16,12)
def kerchief_tail(tag,sign,points):
    # 30% more width and length around the fixed throat attachment.
    # A small outward shear splays the triangular tips, with 12 mm padding.
    anchor=Vector((sign*.004,-.184,.617));grown=[]
    for p in points:
        q=anchor+(Vector(p)-anchor)*1.30
        q.x+=sign*.006*clamp((anchor.z-q.z)/.0923)
        grown.append(tuple(q))
    return patch('short_triangular_kerchief_tail_'+tag,grown,'red',thick=.012)
kerchief_tail('R',-1,[(-.004,-.183,.617),(-.031,-.183,.598),
      (-.037,-.177,.546),(-.010,-.183,.572),(.003,-.183,.613)])
kerchief_tail('L',1,[(.004,-.185,.617),(.033,-.181,.598),
      (.039,-.175,.546),(.011,-.184,.572),(-.002,-.185,.613)])
hip=(.206,-.125,.503)
sphere('left_hip_fat_bow_knot',hip,(.048,.033,.040),'red','body',22,16)
sphere('left_hip_bow_loop',(.242,-.094,.506),(.034,.025,.029),'red','body',18,12)
tube('left_hip_sash_tail_long',[(.195,-.150,.479),(.195,-.166,.433),(.194,-.169,.371),(.196,-.158,.326)],lambda t:(.023+.010*smooth(.25,.95,t),.010),'red','body',16,12)
tube('left_hip_sash_tail_short',[(.229,-.127,.479),(.248,-.145,.434),(.263,-.154,.382),(.268,-.148,.349)],lambda t:(.021+.010*smooth(.25,.95,t),.010),'red','body',14,12)

# Thick root, rounded rising arc, tapered tip; six semantic bend stations.
tail_path=[(0,.128,.348),(0,.206,.325),(.010,.275,.346),
           (.015,.307,.402),(.015,.304,.452),(.013,.286,.485)]
tube('thick_curled_tail',tail_path,lambda t:.048*(1-t)**.55+.0035,'fur','tail',24,18)

# ---------------------------- round 6 profile-only muzzle sculpt
def profile_extra(x,z):
    # Grow the existing blunt pad by .039m. The same rounded fourth-power
    # surface keeps a large-radius front and broad cheek puffs, while sockets
    # remain protected. Only the forward coordinate is modified.
    pad=-.317+.048*(x/(.255*W))**4+.028*((z-MUZZLE_Z)/(.15*H))**4
    delta=float(skull_front(x,z))-pad
    new=.5*(delta+math.sqrt(delta*delta+.006**2))*(1-float(eye_socket_field(x,z)))
    return (new-float(muzzle_displacement(x,z)))*float(smooth(.662,.690,z))*(1-float(smooth(.855,.885,z)))

# Recover each skull vertex's longitudinal parameter from its unchanged UVs.
head_u={}
cx,cy,cw,ch=CHARTS['head']
for poly in head_surface.data.polygons:
    for li in poly.loop_indices:
        vi=head_surface.data.loops[li].vertex_index
        head_u[vi]=(head_surface.data.uv_layers.active.data[li].uv.x*2048-cx-5)/(cw-10)
for v in head_surface.data.vertices:
    f=max(0,-math.cos(2*PI*head_u[v.index]))**.65
    v.co.y-=profile_extra(v.co.x,v.co.z)*f

nose_shift=profile_extra(0,NOSE_Z)
for v in nose.data.vertices:
    v.co.y=NOSE_Y-nose_shift+(v.co.y-NOSE_Y)*1.20
for ob in parts['head']:
    if ob.name.startswith(('gentle_omega_smile','short_philtrum','smile_dimple')):
        for v in ob.data.vertices:v.co.y-=profile_extra(v.co.x,v.co.z)

# Round 7 fills the lower bulb; the approved nose stays exactly where it was.
def lower_muzzle_extra(x,z):
    # The underside rolls back around a large chin radius, while the central
    # nose-to-lip wall remains almost vertical. Quadratic cheek puffs round it.
    target=-.336+.023*(x/(.24*W))**2+.017*(x/(.24*W))**4+.032*((z-.759)/.070)**6
    existing=float(head_front(x,z))-profile_extra(x,z)
    delta=existing-target
    addition=.5*(delta+math.sqrt(delta*delta+.003**2))
    return addition*float(smooth(.663,.690,z))*(1-float(smooth(.785,.819,z)))
for v in head_surface.data.vertices:
    f=max(0,-math.cos(2*PI*head_u[v.index]))**.65
    v.co.y-=lower_muzzle_extra(v.co.x,v.co.z)*f
for ob in parts['head']:
    if ob.name.startswith(('gentle_omega_smile','short_philtrum','smile_dimple')):
        for v in ob.data.vertices:v.co.y-=lower_muzzle_extra(v.co.x,v.co.z)

# Refit the strokes to the sampled sculpt, retaining their original relief.
# Analytic pad offsets alone leave the line slightly suspended in profile.
new_skin_tree=BVHTree.FromPolygons([v.co.copy() for v in head_surface.data.vertices],
                                  [tuple(p.vertices) for p in head_surface.data.polygons])
for ob in parts['head']:
    if ob.name.startswith(('gentle_omega_smile','short_philtrum','smile_dimple')):
        for v in ob.data.vertices:
            origin=Vector((v.co.x,-1,v.co.z));direction=Vector((0,1,0))
            old_hit=head_bvh.ray_cast(origin,direction,2)[0]
            new_hit=new_skin_tree.ray_cast(origin,direction,2)[0]
            if old_hit is not None and new_hit is not None:
                original_y=v.co.y+profile_extra(v.co.x,v.co.z)+lower_muzzle_extra(v.co.x,v.co.z)
                v.co.y=new_hit.y+float(np.clip(original_y-old_hit.y,-.0045,.0002))

# Eye-only contact polish against the FINAL locked cheek/skull surface.
# The forward cap stays just proud of the fixed socket; its closed back stays
# buried. This avoids scallops where two coarse meshes intersect.
for group in ('eye.L','eye.R'):
    globe=parts[group][0];tag=group[-1]
    for v in globe.data.vertices:
        if v.index==0:theta=0
        elif v.index==len(globe.data.vertices)-1:theta=PI
        else:theta=PI*((v.index-1)//48+1)/15
        hit=new_skin_tree.ray_cast(Vector((v.co.x,-1,v.co.z)),Vector((0,1,0)),2)[0]
        if hit is not None:
            v.co.y=hit.y-.017*math.cos(theta)-.0008
    eye_measurements[tag]['peripheral_front_contact_clearance_m']=.0008
    # Re-run the aperture coverage test on the finished socket-fitted globe.
    from mathutils import Matrix
    sign=1 if tag=='L' else -1;center=Vector(eye_centers[tag])
    turn=Matrix.Rotation(-sign*math.radians(24),3,'Z') @ Matrix.Rotation(math.radians(-6),3,'X')
    fv=[v.co.copy() for v in globe.data.vertices];ff=[tuple(p.vertices) for p in globe.data.polygons]
    before=BVHTree.FromPolygons(fv,ff);after=BVHTree.FromPolygons([center+turn@(v-center) for v in fv],ff)
    samples=0;lost=0;rx,_,rz=eye_measurements[tag]['globe_radii_m']
    for a in np.linspace(0,2*PI,120,endpoint=False):
        co=math.cos(a);x=center.x+.92*rx*(spow(co,.90) if sign*co<0 else co)
        z=eye_measurements[tag]['aperture_center_z_m']+.92*rz*math.sin(a);origin=Vector((x,-1,z));direction=Vector((0,1,0))
        skin=new_skin_tree.ray_cast(origin,direction,2)[0]
        original=before.ray_cast(origin,direction,2)[0];rotated=after.ray_cast(origin,direction,2)[0]
        if skin is not None and original is not None and original.y<skin.y-.0003:
            samples+=1;lost+=int(rotated is None or rotated.y>=skin.y-.0003)
    eye_measurements[tag]['rotation_test_aperture_samples']=samples
    eye_measurements[tag]['rotation_test_lost_white_samples']=lost

# Give the gi a soft belly and chest in profile, keeping the front X/Z and UVs.
# Carry each front costume piece with the cloth so its layout stays attached.
def torso_depth_shift(y,z):
    front=max(0,-(y-.011))
    back=max(0,y-.011)
    belly=.027*math.exp(-((z-.487)/.079)**2)
    chest=.020*math.exp(-((z-.605)/.069)**2)
    return -(belly+chest)*min(1,front/.125)+.015*math.exp(-((z-.535)/.13)**2)*min(1,back/.13)
for ob in parts['body']:
    if ob is gi_shell or ob.name.startswith(('ivory_','navy_lapel','red_waist_sash','red_neckerchief','kerchief_','flattened_throat','short_triangular','left_hip_')):
        for v in ob.data.vertices:v.co.y+=torso_depth_shift(v.co.y,v.co.z)

# Record the actual authored parts before joining, for profile QA.
body_metrics={'round':13,'parts':{}}
for prefix in ('broad_dog_foot.','rounded_hakama.','gathered_pants_cuff.','gi_soft_flared_shell','upper_arm_skin.'):
    for ob in parts['body']:
        if ob.name.startswith(prefix):
            p=np.array([v.co[:] for v in ob.data.vertices])
            entry={'min_m':p.min(axis=0).tolist(),'max_m':p.max(axis=0).tolist(),'size_m':np.ptp(p,axis=0).tolist()}
            if prefix=='broad_dog_foot.':
                tree=BVHTree.FromPolygons([v.co.copy() for v in ob.data.vertices],[tuple(p.vertices) for p in ob.data.polygons])
                cx=float((p[:,0].min()+p[:,0].max())*.5)
                entry['toe_dome_height_m']=float(tree.ray_cast(Vector((cx,-.125,1)),Vector((0,0,-1)),2)[0].z)
            body_metrics['parts'][ob.name]=entry
for tag in ('L','R'):
    a=body_metrics['parts']['rounded_hakama.'+tag]['size_m']
    b=body_metrics['parts']['gathered_pants_cuff.'+tag]['size_m']
    body_metrics['pants_to_cuff_profile_ratio_'+tag]=a[1]/b[1]
with open(os.path.join(ROOT,'body-measurements-round13.json'),'w',encoding='utf-8') as f:json.dump(body_metrics,f,indent=2)

# Preserve source-island names and boundaries for the phase 2 handoff.
rig_parts={}
for group,source_parts in parts.items():
    rig_parts[group]=[]
    for source in source_parts:
        source.data.calc_loop_triangles()
        bm=bmesh.new();bm.from_mesh(source.data)
        rig_parts[group].append({'name':source.name,'vertices':len(bm.verts),
            'triangles':len(source.data.loop_triangles),
            'boundary_edges':sum(e.is_boundary for e in bm.edges)})
        bm.free()
with open(os.path.join(ROOT,'phase2-islands-round13.json'),'w',encoding='utf-8') as f:
    json.dump(rig_parts,f,indent=2)

# ---------------------------- production cleanup and semantic parts
objects=[]
for name,group in parts.items():
    bpy.ops.object.select_all(action='DESELECT')
    for ob in group:ob.select_set(True)
    bpy.context.view_layer.objects.active=group[0]
    if len(group)>1:bpy.ops.object.join()
    ob=bpy.context.object;ob.name='Chewy_'+name.replace('.','_')
    # All source coordinates were authored in metres, so the geometry is already applied.
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    bm=bmesh.new();bm.from_mesh(ob.data)
    bmesh.ops.remove_doubles(bm,verts=bm.verts[:],dist=1e-7)
    bmesh.ops.dissolve_degenerate(bm,edges=bm.edges[:],dist=1e-7)
    bad=[f for f in bm.faces if f.calc_area()<1e-12]
    if bad:bmesh.ops.delete(bm,geom=bad,context='FACES')
    bmesh.ops.recalc_face_normals(bm,faces=bm.faces[:]);bm.to_mesh(ob.data);bm.free()
    ob.data.materials.clear();ob.data.materials.append(mat)
    for p in ob.data.polygons:p.material_index=0;p.use_smooth=True
    # Put movable pivots in their actual anatomical positions, without changing surfaces.
    piv={'head':(0,0,HEAD_CZ),'eye.L':eye_centers['L'],'eye.R':eye_centers['R'],
         'ear.L':ear_paths['L'][0],'ear.R':ear_paths['R'][0],'tail':tail_path[0],'body':(0,0,0)}
    bpy.context.scene.cursor.location=piv[name]
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    objects.append(ob)
    for v in ob.data.vertices:
        assert all(math.isfinite(c) for c in v.co), 'Nonfinite geometry in '+name
    for p in ob.data.polygons:
        assert all(math.isfinite(c) for c in p.normal), 'Nonfinite normal in '+name
    ob['phase']='Phase 1; unrigged'
    ob['front_axis']='-Y'

joints={
    'units':'metres','coordinate_system':'Blender Z-up, front -Y; character left is +X',
    'hips':[0,.015,.353],'spine':[0,.015,.469],'chest':[0,.013,.600],
    'neck':[0,.007,.667],'head':[0,0,HEAD_CZ],'jaw_pivot':[0,-.146,.808],
    'eyes':eye_centers,
    'ears':{tag:{'base':p[0],'fold':p[2],'tip':p[-1]} for tag,p in ear_paths.items()},

    'arms':joint_arms,
    'legs':{tag:{'hip':[s*.119,.014,.364],'knee':[s*.137,.007,.250],
                  'ankle':[s*.146,.011,.121],'toe':[s*.164,-.145,.075]} for s,tag in ((1,'L'),(-1,'R'))},
    'tail':tail_path,
    'notes':['No armature or weights in phase 1.','Eyes are independent closed socket-fitted globes with the original anatomical pivots; the round-13 aperture grew upward while its lower edge stayed fixed. Nasal/upward gaze is painted because inward/upward rest rotation loses white coverage in the locked sockets. Apply a matching neutral gaze offset during phase 2; validate aim limits, and refit spherical globe backs/sockets if wide rotation is required.',
             'Ears have 40 longitudinal stations / 39 full cross-section rings through surface-relaxed solid cupped wedges and padded folds; broad faces yaw 30 degrees outward. Authored normal depth .12 head widths at the base, tapering to .05 near the hanging tips, with rounded convex backs. Tail has 24 longitudinal rings.',
             'No torso skin under gi, arm skin under wraps, or thigh skin under pants.',
             'Costume and visible skin islands need weights and selective welding during phase 2.'],
}
with open(os.path.join(ROOT,'joints.json'),'w',encoding='utf-8') as f:json.dump(joints,f,indent=2)

with open(os.path.join(ROOT,'eye-measurements-round13.json'),'w',encoding='utf-8') as f:json.dump(eye_measurements,f,indent=2)

tri_count=0
for ob in objects:
    ob.data.calc_loop_triangles();tri_count+=len(ob.data.loop_triangles)
    print('PART_TRIANGLES',ob.name,len(ob.data.loop_triangles),flush=True)
print('CHEWY_BUILD_TRIANGLES',tri_count,flush=True)
assert tri_count<=30000, f'Triangle budget exceeded: {tri_count}'
bpy.ops.object.select_all(action='DESELECT')
for ob in objects:ob.select_set(True)
bpy.context.view_layer.objects.active=objects[0]
bpy.ops.export_scene.gltf(filepath=MODEL,export_format='GLB',use_selection=True,export_apply=True,
                         export_yup=True,export_attributes=True,export_vertex_color='ACTIVE',
                         export_lights=False,export_cameras=False,export_animations=False)

# ---------------------------- portrait, soft repeatable studio lighting
scene=bpy.context.scene
scene.render.engine='BLENDER_EEVEE_NEXT'
scene.render.resolution_x=1100;scene.render.resolution_y=1100;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.view_settings.view_transform='Standard'
scene.view_settings.look='Medium High Contrast' if 'Medium High Contrast' in [x.identifier for x in bpy.types.ColorManagedViewSettings.bl_rna.properties['look'].enum_items] else 'None'
scene.world=bpy.data.worlds.new('portrait_world');scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.52,.44,.36,1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.45
def area(name,loc,power,size,color):
    data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size;data.color=color
    ob=bpy.data.objects.new(name,data);scene.collection.objects.link(ob);ob.location=loc
    ob.rotation_euler=(Vector((0,0,.91))-ob.location).to_track_quat('-Z','Y').to_euler()
area('portrait_key',(-2.4,-3.4,4.0),220,3.2,(1,.85,.73))
area('portrait_fill',(2.8,-1.8,2.5),115,3.0,(.80,.88,1))
area('portrait_rim',(.6,2.0,3.0),180,2.5,(1,.79,.60))
cam=bpy.data.objects.new('portrait_camera',bpy.data.cameras.new('portrait_camera'));scene.collection.objects.link(cam)
target=Vector((0,-.045,.940));cam.location=(1.52,-2.75,1.39)
cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=.96
scene.camera=cam;scene.render.film_transparent=True
scene.use_nodes=True
nt=scene.node_tree;nt.nodes.clear()
rl=nt.nodes.new('CompositorNodeRLayers')
over=nt.nodes.new('CompositorNodeAlphaOver');over.inputs[0].default_value=1
over.inputs[1].default_value=(.82,.76,.66,1)
nt.links.new(rl.outputs['Image'],over.inputs[2])
comp=nt.nodes.new('CompositorNodeComposite');nt.links.new(over.outputs[0],comp.inputs[0])
scene.render.filepath=os.path.join(ROOT,'portrait.png')
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT,'chewy-b.blend'))
if '--skip-portrait' not in sys.argv:bpy.ops.render.render(write_still=True)
print('CHEWY_BUILD_DONE',MODEL,flush=True)
