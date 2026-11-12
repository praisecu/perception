import bpy, glob, os, sys, math
from mathutils import Vector
argv = sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
MODE = argv[0] if argv else 'test'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'chapters', 'media', 'learned-depth')
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
floor.scale = (6, 12, 1); bpy.ops.object.transform_apply(scale=True)
floor.data.materials.append(mat('oak-wood2_*'))
bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 5.6, 1.5), rotation=(math.radians(90), 0, 0)); wall = bpy.context.object
wall.scale = (6, 3, 1); bpy.ops.object.transform_apply(scale=True)
wall.data.materials.append(mat('simple-bricks_*'))
for o in (floor, wall):
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.uv.cube_project(cube_size=1.0); bpy.ops.object.mode_set(mode='OBJECT')

CAM = Vector((0, 0, 0.13))
near, nh = drone('dji-mavic-3-clas_*', 0.32, (-0.12, 0.62, 0), 25)
mid, mh = drone('drone_31efc6b2-*', 0.30, (0.24, 1.50, 0), -20)
far, fh = drone('drone_781c6634-*', 0.32, (-0.05, 4.00, 0), 10)
targets = {}
for name, piv, h in (('near', near, nh), ('mid', mid, mh), ('far', far, fh)):
    e = bpy.data.objects.new('focus_' + name, None); sc.collection.objects.link(e)
    e.location = piv.location + Vector((0, 0, h * 0.5)); targets[name] = e

# camera
cd = bpy.data.cameras.new('cam'); cd.lens = 50; cd.sensor_width = 36
cam = bpy.data.objects.new('cam', cd); sc.collection.objects.link(cam); sc.camera = cam
cam.location = CAM
look = Vector((0.03, 2.2, 0.02)) - CAM
cam.rotation_euler = look.to_track_quat('-Z', 'Y').to_euler()

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

# render settings
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
print('DEVICE', dev)
sc.cycles.samples = 96; sc.cycles.use_denoising = True
sc.render.resolution_x = 1280; sc.render.resolution_y = 720; sc.render.resolution_percentage = 100
sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = 'AgX - Medium High Contrast'; sc.view_settings.exposure = -0.4
sc.render.image_settings.file_format = 'JPEG'; sc.render.image_settings.quality = 85


# ---------------------------------------------------------------------------
# Learning Depth (Chapter 9): an all-in-focus RGB image and its exact depth map.
# Depth is the distance along the camera's viewing axis, found by casting one
# ray per pixel through the evaluated scene. It is written as a 16-bit value in
# millimetres split across the red (high byte) and green (low byte) channels of
# a PNG, so a browser can read exact metres back from the pixels.
W, H = 480, 270
sc.render.resolution_x = W; sc.render.resolution_y = H
cd.dof.use_dof = False
sc.render.filepath = os.path.join(OUT, 'rgb.jpg'); bpy.ops.render.render(write_still=True)
print('WROTE rgb.jpg')

cam = sc.camera
dg = bpy.context.evaluated_depsgraph_get()
mw = cam.matrix_world
frame = [mw @ v for v in cam.data.view_frame(scene=sc)]  # tr, br, bl, tl
tr, br, bl, tl = frame
origin = mw.translation
forward = (mw.to_3x3() @ Vector((0, 0, -1))).normalized()
import array
depth = array.array('H', [0] * (W * H))
for y in range(H):
    v = (y + 0.5) / H
    left = tl.lerp(bl, v); right = tr.lerp(br, v)
    for x in range(W):
        p = left.lerp(right, (x + 0.5) / W)
        d = (p - origin).normalized()
        hit, loc, *_ = sc.ray_cast(dg, origin, d)
        z = (loc - origin).dot(forward) if hit else 20.0
        depth[y * W + x] = max(0, min(65535, int(round(z * 1000))))
    if y % 30 == 0: print('row', y)

# Raw little-endian uint16 millimetres; depth_pack.py turns it into the PNG.
with open(os.path.join(OUT, 'depth_mm.bin'), 'wb') as fh:
    depth.tofile(fh)
zs = [d for d in depth if d < 19000]
print('DEPTH range m', min(zs) / 1000, max(zs) / 1000)