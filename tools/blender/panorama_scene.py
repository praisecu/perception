import bpy, glob, os, sys, math
from mathutils import Vector
argv = sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
MODE = argv[0] if argv else 'test'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'chapters', 'media', r'transformations')
MAT_TEX = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'landing_mat.png')
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

# floor and a wider wall, so both panorama views stay inside the room
bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 4, 0)); floor = bpy.context.object
floor.scale = (14, 14, 1); bpy.ops.object.transform_apply(scale=True)
floor.data.materials.append(mat('oak-wood2_*'))
bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 5.6, 1.5), rotation=(math.radians(90), 0, 0)); wall = bpy.context.object
wall.scale = (14, 3, 1); bpy.ops.object.transform_apply(scale=True)
wall.data.materials.append(mat('simple-bricks_*'))
for o in (floor, wall):
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.uv.cube_project(cube_size=1.0); bpy.ops.object.mode_set(mode='OBJECT')

# a flat landing mat on the floor: a planar target for homographies
MW, MH = 1.0, 0.714
bpy.ops.mesh.primitive_plane_add(size=1, location=(0.1, 2.2, 0.003)); matobj = bpy.context.object
matobj.scale = (MW, MH, 1); bpy.ops.object.transform_apply(scale=True)
mm = bpy.data.materials.new('mat'); mm.use_nodes = True
tex = mm.node_tree.nodes.new('ShaderNodeTexImage'); tex.image = bpy.data.images.load(MAT_TEX)
bsdf = mm.node_tree.nodes['Principled BSDF']; bsdf.inputs['Roughness'].default_value = 0.8
mm.node_tree.links.new(tex.outputs[0], bsdf.inputs['Base Color'])
matobj.data.materials.append(mm)

near, nh = drone('dji-mavic-3-clas_*', 0.32, (-0.9, 1.3, 0), 25)
mid, mh = drone('drone_31efc6b2-*', 0.30, (1.0, 1.9, 0), -20)
far, fh = drone('drone_781c6634-*', 0.32, (-0.2, 4.0, 0), 10)

cd = bpy.data.cameras.new('cam'); cd.lens = 35; cd.sensor_width = 36
cam = bpy.data.objects.new('cam', cd); sc.collection.objects.link(cam); sc.camera = cam

w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
nt = w.node_tree; env = nt.nodes.new('ShaderNodeTexEnvironment')
env.image = bpy.data.images.load(glob.glob(base + '/hdrs/old-forest-green_*/*_2K_*.exr')[0])
nt.links.new(env.outputs[0], nt.nodes['Background'].inputs[0]); nt.nodes['Background'].inputs[1].default_value = 0.5
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sc.collection.objects.link(sun)
sun.data.energy = 2.2; sun.data.angle = math.radians(8); sun.rotation_euler = (math.radians(50), 0, math.radians(-35))
area = bpy.data.objects.new('area', bpy.data.lights.new('area', 'AREA')); sc.collection.objects.link(area)
area.data.energy = 60; area.data.size = 3.0; area.location = (0.5, 1.0, 2.2)
area.rotation_euler = (Vector((0, 2.2, 0)) - area.location).to_track_quat('-Z', 'Y').to_euler()

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
sc.render.resolution_x = 960; sc.render.resolution_y = 540; sc.render.resolution_percentage = 100
sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = 'AgX - Medium High Contrast'; sc.view_settings.exposure = -0.3
sc.render.image_settings.file_format = 'JPEG'; sc.render.image_settings.quality = 84

from bpy_extras.object_utils import world_to_camera_view
def aim(loc, target, yaw_deg=0.0):
    cam.location = Vector(loc)
    q = (Vector(target) - cam.location).to_track_quat('-Z', 'Y')
    # rotate about the vertical axis through the camera centre
    from mathutils import Matrix
    cam.rotation_euler = (Matrix.Rotation(math.radians(yaw_deg), 4, 'Z') @ q.to_matrix().to_4x4()).to_euler()
    bpy.context.view_layer.update()

def render(name):
    sc.render.filepath = os.path.join(OUT, name); bpy.ops.render.render(write_still=True); print('WROTE', name)

def mat_corners():
    mw = matobj.matrix_world
    out = []
    for v in ((-0.5, -0.5), (0.5, -0.5), (0.5, 0.5), (-0.5, 0.5)):
        p = mw @ Vector((v[0], v[1], 0))
        c = world_to_camera_view(sc, cam, p)
        out.append((round(c.x * 960, 1), round((1 - c.y) * 540, 1)))
    return out

# two views from the same centre, turned left and right
for name, yaw in (('pano_left.jpg', 11), ('pano_right.jpg', -11)):
    aim((0, -0.4, 0.75), (0, 3.0, 0.15), yaw); render(name)

# an oblique view of the mat for the rectification figure
aim((1.1, 0.7, 0.85), (0.1, 2.25, 0.0)); render('floor_oblique.jpg')
print('MATCORNERS', mat_corners())