import bpy, glob, os, sys, math
from mathutils import Vector
argv = sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
MODE = argv[0] if argv else 'test'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'chapters', 'media', 'curves-rendering')
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

def render(name):
    sc.render.filepath = os.path.join(OUT, name); bpy.ops.render.render(write_still=True)
    print('WROTE', name)

# ---- Render passes for Chapter 6: what a renderer computes ----
sc.render.resolution_x = 1120; sc.render.resolution_y = 630
cd.dof.use_dof = False
vl = bpy.context.view_layer

def emission_override(name, build):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial'); em = nt.nodes.new('ShaderNodeEmission')
    nt.links.new(em.outputs[0], out.inputs[0])
    build(nt, em)
    return m

def normals(nt, em):
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    vt = nt.nodes.new('ShaderNodeVectorTransform'); vt.vector_type = 'NORMAL'; vt.convert_from = 'WORLD'; vt.convert_to = 'CAMERA'
    mul = nt.nodes.new('ShaderNodeVectorMath'); mul.operation = 'MULTIPLY_ADD'
    mul.inputs[1].default_value = (0.5, 0.5, -0.5); mul.inputs[2].default_value = (0.5, 0.5, 0.5)
    nt.links.new(geo.outputs['Normal'], vt.inputs[0]); nt.links.new(vt.outputs[0], mul.inputs[0])
    nt.links.new(mul.outputs[0], em.inputs['Color'])

def depth(nt, em):
    # inverse depth: near is bright, far is dark, with good contrast on the drones
    cam = nt.nodes.new('ShaderNodeCameraData')
    inv = nt.nodes.new('ShaderNodeMath'); inv.operation = 'DIVIDE'; inv.inputs[0].default_value = 0.35
    pw = nt.nodes.new('ShaderNodeMath'); pw.operation = 'POWER'; pw.inputs[1].default_value = 0.8; pw.use_clamp = True
    nt.links.new(cam.outputs['View Z Depth'], inv.inputs[1]); nt.links.new(inv.outputs[0], pw.inputs[0])
    nt.links.new(pw.outputs[0], em.inputs['Color'])

clay = bpy.data.materials.new('clay'); clay.use_nodes = True
clay.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.62, 0.6, 0.56, 1)
clay.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.8

# 1. final image
render('final.jpg')
# 2. shading only (geometry and light, no textures)
vl.material_override = clay; render('shading.jpg')
# 3. normals and 4. depth: flat emission, standard view transform
std = (sc.view_settings.view_transform, sc.view_settings.look, sc.view_settings.exposure)
sc.view_settings.view_transform = 'Standard'; sc.view_settings.look = 'None'; sc.view_settings.exposure = 0
world_strength = bpy.data.worlds[0].node_tree.nodes['Background'].inputs[1].default_value
bpy.data.worlds[0].node_tree.nodes['Background'].inputs[1].default_value = 0
for o in bpy.data.objects:
    if o.type == 'LIGHT': o.hide_render = True
sc.cycles.samples = 16
vl.material_override = emission_override('normals', normals); render('normals.jpg')
vl.material_override = emission_override('depth', depth); render('depth.jpg')
# 5. mesh: every triangle edge drawn as a thin dark line on white
bpy.data.worlds[0].node_tree.nodes['Background'].inputs[0].default_value = (1, 1, 1, 1)
bpy.data.worlds[0].node_tree.nodes['Background'].inputs[1].default_value = 1
for l in bpy.data.worlds[0].node_tree.links:
    if l.to_node.name == 'Background' and l.to_socket.name == 'Color': bpy.data.worlds[0].node_tree.links.remove(l)
def ink(nt, em):
    em.inputs['Color'].default_value = (0.08, 0.07, 0.04, 1)
for o in list(bpy.data.objects):
    if o.type == 'MESH' and not o.hide_render:
        n = len(o.data.polygons)
        if n > 3000:
            d = o.modifiers.new('dec', 'DECIMATE'); d.ratio = max(0.01, 1500.0 / n)
        elif n < 50:
            sd = o.modifiers.new('sub', 'SUBSURF'); sd.subdivision_type = 'SIMPLE'; sd.levels = 4; sd.render_levels = 4
        w = o.modifiers.new('wire', 'WIREFRAME'); w.thickness = 0.0012; w.use_replace = True; w.use_even_offset = False
vl.material_override = emission_override('ink', ink)
render('mesh.jpg')