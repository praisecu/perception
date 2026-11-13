import bpy, glob, os, sys, math
from mathutils import Vector
argv = sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
MODE = argv[0] if argv else 'test'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'chapters', 'media', r'computational-imaging')
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

# ---- Chapter 8 renders: a light field (camera array) and an HDR frame ----
cd.dof.use_dof = False
right = cam.matrix_world.to_quaternion() @ Vector((1, 0, 0))
up = cam.matrix_world.to_quaternion() @ Vector((0, 1, 0))

def render(name):
    sc.render.filepath = os.path.join(OUT, name); bpy.ops.render.render(write_still=True)
    print('WROTE', name)

if MODE in ('lf', 'all'):
    # 5 x 5 grid of parallel cameras, 1.2 cm apart
    sc.cycles.samples = 40
    sc.render.resolution_x = 640; sc.render.resolution_y = 360
    sc.render.image_settings.quality = 82
    step = 0.012
    for j in range(5):
        for i in range(5):
            cam.location = CAM + right * (i - 2) * step + up * (2 - j) * step
            render('lf_%d_%d.jpg' % (j, i))
    cam.location = CAM

if MODE in ('hdr', 'all'):
    # Dim room, one very bright panel: far more contrast than one exposure can hold
    nt.nodes['Background'].inputs[1].default_value = 0.08
    sun.data.energy = 0.3; area.data.energy = 8
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0.9, 5.55, 0.9), rotation=(math.radians(90), 0, 0))
    panel = bpy.context.object; panel.scale = (0.7, 0.45, 1)
    em = bpy.data.materials.new('panel'); em.use_nodes = True
    bsdf = em.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Emission Color'].default_value = (1.0, 0.92, 0.8, 1)
    bsdf.inputs['Emission Strength'].default_value = 60
    panel.data.materials.append(em)
    lamp = bpy.data.objects.new('lamp', bpy.data.lights.new('lamp', 'AREA')); sc.collection.objects.link(lamp)
    lamp.data.energy = 120; lamp.data.size = 0.9; lamp.location = (0.9, 5.4, 0.9)
    lamp.rotation_euler = (Vector((0.4, 1.0, 0.1)) - lamp.location).to_track_quat('-Z', 'Y').to_euler()
    sc.cycles.samples = 96
    sc.render.resolution_x = 960; sc.render.resolution_y = 540
    sc.view_settings.view_transform = 'Standard'; sc.view_settings.look = 'None'; sc.view_settings.exposure = 0
    sc.render.image_settings.file_format = 'OPEN_EXR'; sc.render.image_settings.color_depth = '32'
    sc.render.filepath = os.path.join(OUT, '_hdr_scene.exr'); bpy.ops.render.render(write_still=True)
    print('WROTE hdr')