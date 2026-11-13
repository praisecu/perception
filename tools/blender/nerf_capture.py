"""Chapter 13 (NeRF): a ring of posed views around one drone, like a NeRF capture.

Run with Blender 5.2:  blender -b --python nerf_capture.py -- full
Writes chapters/media/nerf/views/v00.jpg ... and chapters/media/nerf/cameras.json.
"""
import bpy, glob, os, sys, math, json
from mathutils import Vector, Matrix
argv = sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
MODE = argv[0] if argv else 'test'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'chapters', 'media', 'nerf')
os.makedirs(os.path.join(OUT, 'views'), exist_ok=True)
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
    for o in c.all_objects:
        chain = []; top = o
        while top: chain.append(top.name); top = top.parent
        if o.type == 'FONT' or any(n in ('Plane', 'Plane.004', 'Plane.020') for n in chain):
            o.hide_render = True; o.hide_viewport = True
    bpy.context.view_layer.update()
    pts = []; dg = bpy.context.evaluated_depsgraph_get()
    for o in c.all_objects:
        if o.type == 'MESH' and not o.hide_render:
            ev = o.evaluated_get(dg); me = ev.to_mesh(); mw = ev.matrix_world
            pts += [mw @ v.co for i, v in enumerate(me.vertices) if i % 5 == 0]
            ev.to_mesh_clear()
    mn = Vector([min(p[i] for p in pts) for i in range(3)]); mx = Vector([max(p[i] for p in pts) for i in range(3)])
    k = size / max(mx.x - mn.x, mx.y - mn.y); center = (mn + mx) / 2
    pivot = bpy.data.objects.new('pivot', None); sc.collection.objects.link(pivot)
    root.parent = pivot; root.location = root.location - Vector((center.x, center.y, mn.z))
    pivot.scale = (k, k, k); pivot.location = loc; pivot.rotation_euler = (0, 0, math.radians(yaw))
    bpy.context.view_layer.update()
    return pivot, (mx.z - mn.z) * k

# a round stone plinth with the drone on top
bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=0.34, depth=0.12, location=(0, 0, -0.06))
plinth = bpy.context.object; plinth.data.materials.append(mat('white-marble-flo_*'))
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.uv.cube_project(cube_size=0.6); bpy.ops.object.mode_set(mode='OBJECT')
bpy.ops.mesh.primitive_plane_add(size=12, location=(0, 0, -0.12)); ground = bpy.context.object
ground.data.materials.append(mat('pebble-stone-flo_*'))
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.uv.cube_project(cube_size=1.0); bpy.ops.object.mode_set(mode='OBJECT')
d, dh = drone('dji-mavic-3-clas_*', 0.5, (0, 0, 0), 30)

w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
nt = w.node_tree; env = nt.nodes.new('ShaderNodeTexEnvironment')
env.image = bpy.data.images.load(glob.glob(base + '/hdrs/old-forest-green_*/*_2K_*.exr')[0])
nt.links.new(env.outputs[0], nt.nodes['Background'].inputs[0]); nt.nodes['Background'].inputs[1].default_value = 0.8
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sc.collection.objects.link(sun)
sun.data.energy = 2.5; sun.data.angle = math.radians(6); sun.rotation_euler = (math.radians(45), 0, math.radians(-30))

sc.render.engine = 'CYCLES'
prefs = bpy.context.preferences.addons['cycles'].preferences
dev = 'CPU'
for t in ('OPTIX', 'CUDA', 'HIP', 'ONEAPI'):
    try:
        prefs.compute_device_type = t; prefs.get_devices()
        if any(x.type == t for x in prefs.devices):
            for x in prefs.devices: x.use = (x.type == t)
            dev = t; break
    except Exception: pass
sc.cycles.device = 'GPU' if dev != 'CPU' else 'CPU'
sc.cycles.samples = 48 if MODE == 'full' else 8; sc.cycles.use_denoising = True
W, H = 400, 300
sc.render.resolution_x = W; sc.render.resolution_y = H; sc.render.resolution_percentage = 100
sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = 'AgX - Medium High Contrast'; sc.view_settings.exposure = -0.2
sc.render.image_settings.file_format = 'JPEG'; sc.render.image_settings.quality = 85

LENS = 35.0
cd = bpy.data.cameras.new('cam'); cd.lens = LENS; cd.sensor_width = 36; cd.sensor_fit = 'HORIZONTAL'
cam = bpy.data.objects.new('cam', cd); sc.collection.objects.link(cam); sc.camera = cam
FX = LENS / 36.0 * W
FLIP = Matrix(((1, 0, 0), (0, -1, 0), (0, 0, -1)))
TARGET = Vector((0, 0, dh * 0.45))
N = 36 if MODE == 'full' else 2
R0, ELEV = 0.78, math.radians(26)
meta = {'width': W, 'height': H, 'K': [[FX, 0, W / 2], [0, FX, H / 2], [0, 0, 1]],
        'target': list(TARGET), 'views': []}
for i in range(N):
    az = 2 * math.pi * i / N
    C = TARGET + Vector((R0 * math.cos(ELEV) * math.cos(az), R0 * math.cos(ELEV) * math.sin(az), R0 * math.sin(ELEV)))
    cam.location = C
    cam.rotation_euler = (TARGET - C).to_track_quat('-Z', 'Y').to_euler()
    bpy.context.view_layer.update()
    Rcw = (cam.matrix_world.to_3x3() @ FLIP).transposed()
    name = 'views/v%02d.jpg' % i
    sc.render.filepath = os.path.join(OUT, name); bpy.ops.render.render(write_still=True)
    meta['views'].append({'file': name, 'azimuth_deg': round(math.degrees(az), 2),
                          'C': [round(v, 5) for v in C], 'R': [[round(v, 6) for v in r] for r in Rcw]})
    print('WROTE', name)
with open(os.path.join(OUT, 'cameras.json'), 'w') as f: json.dump(meta, f, indent=1)
