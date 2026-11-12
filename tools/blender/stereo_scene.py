import bpy, glob, os, sys, math
from mathutils import Vector
argv = sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
MODE = argv[0] if argv else 'test'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'chapters', 'media', 'stereo')
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
floor.scale = (16, 12, 1); bpy.ops.object.transform_apply(scale=True)
floor.data.materials.append(mat('oak-wood2_*'))
bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 5.6, 1.5), rotation=(math.radians(90), 0, 0)); wall = bpy.context.object
wall.scale = (16, 3, 1); bpy.ops.object.transform_apply(scale=True)
wall.data.materials.append(mat('simple-bricks_*'))
for o in (floor, wall):
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.uv.cube_project(cube_size=1.0); bpy.ops.object.mode_set(mode='OBJECT')

CAM = Vector((0, 0, 0.13))
near, nh = drone('dji-mavic-3-clas_*', 0.32, (-0.12, 0.62, 0), 25)
mid, mh = drone('drone_31efc6b2-*', 0.30, (0.24, 1.50, 0), -20)
far, fh = drone('drone_781c6634-*', 0.32, (-0.05, 4.00, 0), 10)
import json
from mathutils import Matrix

W, H = 640, 360
LENS = 35.0
B = 0.08                                   # stereo baseline in metres
LOOK = Vector((0.03, 2.2, 0.02))

cd = bpy.data.cameras.new('cam'); cd.lens = LENS; cd.sensor_width = 36; cd.sensor_fit = 'HORIZONTAL'
cam = bpy.data.objects.new('cam', cd); sc.collection.objects.link(cam); sc.camera = cam
cam.location = CAM
cam.rotation_euler = (LOOK - CAM).to_track_quat('-Z', 'Y').to_euler()
bpy.context.view_layer.update()
REST = cam.matrix_world.copy()
xaxis = REST.to_3x3() @ Vector((1, 0, 0))

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

FX = LENS / 36.0 * W
K = [[FX, 0, W / 2], [0, FX, H / 2], [0, 0, 1]]
FLIP = Matrix(((1, 0, 0), (0, -1, 0), (0, 0, -1)))

def cv_pose():
    """World-to-camera rotation and translation in the OpenCV convention."""
    bpy.context.view_layer.update()
    Rcw = (cam.matrix_world.to_3x3() @ FLIP).transposed()
    C = cam.matrix_world.translation
    t = -(Rcw @ C)
    return [list(r) for r in Rcw], list(t), list(C)

def render(name):
    sc.render.filepath = os.path.join(OUT, name); bpy.ops.render.render(write_still=True)
    print('WROTE', name)

def depth_map(step=1):
    """Ray-cast depth (distance along the optical axis) for every pixel."""
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    M = cam.matrix_world; R = M.to_3x3(); o = M.translation
    fwd = R @ Vector((0, 0, -1))
    out = []
    for v in range(0, H, step):
        row = []
        for u in range(0, W, step):
            x = (u + 0.5 - W / 2) / FX; y = (v + 0.5 - H / 2) / FX
            d = (R @ Vector((x, -y, -1))).normalized()
            hit, loc, *_ = sc.ray_cast(dg, o, d)
            row.append(round((loc - o).dot(fwd), 4) if hit else 0.0)
        out.append(row)
    return out

meta = {'width': W, 'height': H, 'K': K, 'baseline': B, 'lens_mm': LENS}

# rectified pair: same orientation, shifted along the camera x axis
cam.matrix_world = Matrix.Translation(-xaxis * B / 2) @ REST
render('left.jpg'); meta['left'] = dict(zip(('R', 't', 'C'), cv_pose()))
depth = depth_map()
cam.matrix_world = Matrix.Translation(xaxis * B / 2) @ REST
render('right.jpg'); meta['right'] = dict(zip(('R', 't', 'C'), cv_pose()))

# verged pair for epipolar geometry: right camera moved and turned toward the scene
cam.matrix_world = Matrix.Translation(-xaxis * B / 2) @ REST
bpy.context.view_layer.update()
C2 = cam.matrix_world.translation + xaxis * 0.45 + Vector((0, -0.10, 0.10))
cam.location = C2
cam.rotation_euler = (Vector((0.10, 1.6, 0.06)) - C2).to_track_quat('-Z', 'Y').to_euler()
cam.rotation_euler.y += math.radians(4)    # a little roll so epipolar lines are not horizontal
render('verged_right.jpg'); meta['verged_right'] = dict(zip(('R', 't', 'C'), cv_pose()))

with open(os.path.join(OUT, 'cameras.json'), 'w') as f: json.dump(meta, f, indent=1)
with open(os.path.join(OUT, '_depth_left.json'), 'w') as f: json.dump(depth, f)
print('DONE')