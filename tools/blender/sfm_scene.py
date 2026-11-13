# Structure from Motion scene (Chapter 11): eight views of the three-drone scene.
# Run: blender -b --python sfm_scene.py -- full   (or "test" for a quick 16-sample pass)
import bpy, glob, os, sys, math
from mathutils import Vector
argv = sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
MODE = argv[0] if argv else 'test'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'chapters', 'media', 'sfm')
os.makedirs(OUT, exist_ok=True)
base = os.path.expanduser('~/blenderkit_data')
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene

def mat(pattern):
    f = glob.glob(base + '/materials/' + pattern + '/*.blend')[0]
    with bpy.data.libraries.load(f) as (s, d): d.materials = s.materials[:1]
    return d.materials[0]

def drone(pattern, size, loc, yaw):
    f = glob.glob(base + '/models/' + pattern + '/*.blend')[0]
    with bpy.data.libraries.load(f) as (s, d): d.collections = s.collections[:1]
    c = d.collections[0]; sc.collection.children.link(c)
    root = [o for o in c.all_objects if o.parent is None and o.type == 'EMPTY'][0]
    # hide the Mavic remote controller parts and labels
    for o in c.all_objects:
        top = o
        chain = []
        while top: chain.append(top.name); top = top.parent
        if o.type == 'FONT' or any(n in ('Plane', 'Plane.004', 'Plane.020') for n in chain if 'DJI' in pattern or 'dji' in pattern):
            o.hide_render = True; o.hide_viewport = True
    bpy.context.view_layer.update()
    pts = []
    dg = bpy.context.evaluated_depsgraph_get()
    for o in c.all_objects:
        if o.type == 'MESH' and not o.hide_render:
            ev = o.evaluated_get(dg); me = ev.to_mesh()
            mw = ev.matrix_world
            pts += [mw @ v.co for i, v in enumerate(me.vertices) if i % 5 == 0]
            ev.to_mesh_clear()
    mn = Vector([min(p[i] for p in pts) for i in range(3)]); mx = Vector([max(p[i] for p in pts) for i in range(3)])
    w = max(mx.x - mn.x, mx.y - mn.y); k = size / w
    center = (mn + mx) / 2
    pivot = bpy.data.objects.new('pivot_' + pattern[:5], None); sc.collection.objects.link(pivot)
    root.parent = pivot
    root.location = (root.location - Vector((center.x, center.y, mn.z)))
    pivot.scale = (k, k, k); pivot.location = loc; pivot.rotation_euler = (0, 0, math.radians(yaw))
    bpy.context.view_layer.update()
    return pivot, (mx.z - mn.z) * k

# floor and wall
bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 3, 0)); floor = bpy.context.object
floor.scale = (40, 12, 1); bpy.ops.object.transform_apply(scale=True)
floor.data.materials.append(mat('oak-wood2_*'))
bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 5.6, 1.5), rotation=(math.radians(90), 0, 0)); wall = bpy.context.object
wall.scale = (40, 3, 1); bpy.ops.object.transform_apply(scale=True)
wall.data.materials.append(mat('simple-bricks_*'))
for o in (floor, wall):
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.uv.cube_project(cube_size=1.0); bpy.ops.object.mode_set(mode='OBJECT')

CAM = Vector((0, 0, 0.13))
near, nh = drone('dji-mavic-3-clas_*', 0.32, (-0.12, 0.62, 0), 25)
mid, mh = drone('drone_31efc6b2-*', 0.30, (0.24, 1.50, 0), -20)
far, fh = drone('drone_781c6634-*', 0.32, (-0.05, 4.00, 0), 10)

# ---------- Structure-from-motion views ----------
# Eight views on an arc in front of the drones, as if a person walked past
# with a camera. Writes view_0.jpg ... view_7.jpg, cameras.json with the
# true K, R, t of every view, and points.json: a sparse set of true surface
# points with colours and the list of views that see each one.
import json, random
import numpy as np
from mathutils import Matrix

W, H = 640, 360
LENS = 30.0
N_VIEWS = 8
LOOK = Vector((0.05, 1.7, 0.12))

cd = bpy.data.cameras.new('cam'); cd.lens = LENS; cd.sensor_width = 36; cd.sensor_fit = 'HORIZONTAL'
cam = bpy.data.objects.new('cam', cd); sc.collection.objects.link(cam); sc.camera = cam
# lighting: HDR plus sun plus soft area light
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
nt = w.node_tree; env = nt.nodes.new('ShaderNodeTexEnvironment')
env.image = bpy.data.images.load(glob.glob(base + '/hdrs/old-forest-green_*/*_2K_*.exr')[0])
nt.links.new(env.outputs[0], nt.nodes['Background'].inputs[0]); nt.nodes['Background'].inputs[1].default_value = 0.5
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sc.collection.objects.link(sun)
sun.data.energy = 2.2; sun.data.angle = math.radians(8); sun.rotation_euler = (math.radians(50), 0, math.radians(-35))
area = bpy.data.objects.new('area', bpy.data.lights.new('area', 'AREA')); sc.collection.objects.link(area)
area.data.energy = 50; area.data.size = 2.0; area.location = (1.2, 0.8, 1.8)
area.rotation_euler = (Vector((0, 1.6, 0.1)) - area.location).to_track_quat('-Z', 'Y').to_euler()

sc.render.engine = 'CYCLES'
prefs = bpy.context.preferences.addons['cycles'].preferences
dev = 'CPU'
for t in ('OPTIX', 'CUDA', 'HIP', 'ONEAPI'):
    try:
        prefs.compute_device_type = t; prefs.get_devices()
        if any(d.type == t for d in prefs.devices):
            for d in prefs.devices: d.use = (d.type == t)
            dev = t; break
    except Exception: pass
sc.cycles.device = 'GPU' if dev != 'CPU' else 'CPU'
sc.cycles.samples = 64; sc.cycles.use_denoising = True
sc.render.resolution_x = W; sc.render.resolution_y = H; sc.render.resolution_percentage = 100
sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = 'AgX - Medium High Contrast'; sc.view_settings.exposure = -0.4
sc.render.image_settings.file_format = 'JPEG'; sc.render.image_settings.quality = 88
cd.dof.use_dof = False


cd.dof.use_dof = False
if MODE == 'test':
    sc.cycles.samples = 16

FX = LENS / 36.0 * W
K = [[FX, 0, W / 2], [0, FX, H / 2], [0, 0, 1]]
FLIP = Matrix(((1, 0, 0), (0, -1, 0), (0, 0, -1)))

def place(i):
    a = math.radians(-30 + 60 * i / (N_VIEWS - 1))
    r = 2.0
    C = LOOK + Vector((r * math.sin(a), -r * math.cos(a), 0.0))
    C.z = 0.32 + 0.06 * math.sin(i * 1.3)
    cam.location = C
    cam.rotation_euler = (LOOK - C).to_track_quat('-Z', 'Y').to_euler()
    cam.rotation_euler.y += math.radians(2.5 * math.sin(i))
    bpy.context.view_layer.update()

def cv_pose():
    Rcw = (cam.matrix_world.to_3x3() @ FLIP).transposed()
    C = cam.matrix_world.translation
    t = -(Rcw @ C)
    return [list(r) for r in Rcw], list(t), list(C)

meta = {'width': W, 'height': H, 'K': K, 'views': []}
poses = []
for i in range(N_VIEWS):
    place(i)
    if MODE != 'points':
        sc.render.filepath = os.path.join(OUT, f'view_{i}.jpg'); bpy.ops.render.render(write_still=True)
        print('WROTE view', i)
    R, t, C = cv_pose()
    meta['views'].append({'file': f'view_{i}.jpg', 'R': R, 't': t, 'C': C})
    poses.append((np.array(R), np.array(t), np.array(C)))
with open(os.path.join(OUT, 'cameras.json'), 'w') as f: json.dump(meta, f, indent=1)

# sparse true surface points, cast from every view
dg = bpy.context.evaluated_depsgraph_get()
Kn = np.array(K)
cells = {}
STEP = 14
for vi, (R, t, C) in enumerate(poses):
    for v in range(STEP // 2, H, STEP):
        for u in range(STEP // 2, W, STEP):
            ray_c = np.array([(u - W / 2) / FX, (v - H / 2) / FX, 1.0])
            d = R.T @ ray_c; d /= np.linalg.norm(d)
            hit, loc, *_ = sc.ray_cast(dg, Vector(C), Vector(d))
            if not hit: continue
            key = tuple(int(math.floor(x / 0.03)) for x in loc)
            cells.setdefault(key, (tuple(loc), vi))
pts = list(cells.values())
random.seed(3); random.shuffle(pts)
pts = pts[:2600]

imgs = []
for i in range(N_VIEWS):
    p = os.path.join(OUT, f'view_{i}.jpg')
    im = bpy.data.images.load(p)
    a = np.array(im.pixels[:]).reshape(im.size[1], im.size[0], 4)[::-1]
    imgs.append(a)

out = []
for (X, src) in pts:
    X = np.array(X)
    vis = []
    for vi, (R, t, C) in enumerate(poses):
        xc = R @ X + t
        if xc[2] <= 0.05: continue
        u = Kn[0, 0] * xc[0] / xc[2] + Kn[0, 2]; v = Kn[1, 1] * xc[1] / xc[2] + Kn[1, 2]
        if not (2 <= u < W - 2 and 2 <= v < H - 2): continue
        d = X - C; dist = np.linalg.norm(d)
        hit, loc, *_ = sc.ray_cast(dg, Vector(C), Vector(d / dist))
        if hit and abs((Vector(loc) - Vector(C)).length - dist) < 0.02:
            vis.append(vi)
    if len(vis) < 2: continue
    R, t, C = poses[src]
    xc = R @ X + t
    u = int(Kn[0, 0] * xc[0] / xc[2] + Kn[0, 2]); v = int(Kn[1, 1] * xc[1] / xc[2] + Kn[1, 2])
    rgb = [int(round(255 * c)) for c in imgs[src][min(H - 1, v), min(W - 1, u), :3]]
    out.append({'X': [round(float(x), 4) for x in X], 'c': rgb, 'v': vis})
with open(os.path.join(OUT, 'points.json'), 'w') as f: json.dump(out, f, separators=(',', ':'))
print('POINTS', len(out))
