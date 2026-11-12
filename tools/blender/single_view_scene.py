# Renders for Chapter 7, Single-View Geometry.
#   room   : a level camera looking into a room corner, with boxes of known size
#            (room.jpg, room_depth.npy, room.json with exact projections)
#   forced : two identical drones of different sizes that look the same from one
#            viewpoint, seen from several camera positions (forced_0..8.jpg)
# Run: blender -b --python single_view_scene.py -- room|forced|all
import bpy, glob, os, sys, math, json
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
MODE = argv[0] if argv else 'all'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'chapters', 'media', 'single-view')
OUT = os.path.normpath(OUT)
os.makedirs(OUT, exist_ok=True)
base = os.path.expanduser('~/blenderkit_data')
W, H = 1280, 720


def fresh():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    return bpy.context.scene


def mat(pattern):
    f = glob.glob(base + '/materials/' + pattern + '/*.blend')[0]
    with bpy.data.libraries.load(f) as (s, d):
        d.materials = s.materials[:1]
    return d.materials[0]


def flat(name, rgb, rough=0.5):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*rgb, 1)
    b.inputs['Roughness'].default_value = rough
    return m


def drone(sc, pattern, size, loc, yaw):
    f = glob.glob(base + '/models/' + pattern + '/*.blend')[0]
    with bpy.data.libraries.load(f) as (s, d):
        d.collections = s.collections[:1]
    c = d.collections[0]
    sc.collection.children.link(c)
    root = [o for o in c.all_objects if o is not None and o.parent is None and o.type == 'EMPTY'][0]
    for o in c.all_objects:
        if o is None:
            continue
        top, chain = o, []
        while top:
            chain.append(top.name)
            top = top.parent
        if o.type == 'FONT' or any(n in ('Plane', 'Plane.004', 'Plane.020') for n in chain):
            o.hide_render = True
            o.hide_viewport = True
    bpy.context.view_layer.update()
    pts = []
    dg = bpy.context.evaluated_depsgraph_get()
    for o in c.all_objects:
        if o is not None and o.type == 'MESH' and not o.hide_render:
            ev = o.evaluated_get(dg)
            me = ev.to_mesh()
            mw = ev.matrix_world
            pts += [mw @ v.co for i, v in enumerate(me.vertices) if i % 5 == 0]
            ev.to_mesh_clear()
    mn = Vector([min(p[i] for p in pts) for i in range(3)])
    mx = Vector([max(p[i] for p in pts) for i in range(3)])
    k = size / max(mx.x - mn.x, mx.y - mn.y)
    center = (mn + mx) / 2
    pivot = bpy.data.objects.new('pivot', None)
    sc.collection.objects.link(pivot)
    root.parent = pivot
    root.location = root.location - Vector((center.x, center.y, (mn.z + mx.z) / 2))
    pivot.scale = (k, k, k)
    pivot.location = loc
    pivot.rotation_euler = (0, 0, math.radians(yaw))
    bpy.context.view_layer.update()
    return pivot


def render_setup(sc, samples=96, w=W, h=H):
    sc.render.engine = 'CYCLES'
    prefs = bpy.context.preferences.addons['cycles'].preferences
    dev = 'CPU'
    for t in ('OPTIX', 'CUDA', 'HIP', 'ONEAPI'):
        try:
            prefs.compute_device_type = t
            prefs.get_devices()
            if any(d.type == t for d in prefs.devices):
                for d in prefs.devices:
                    d.use = (d.type == t)
                dev = t
                break
        except Exception:
            pass
    sc.cycles.device = 'GPU' if dev != 'CPU' else 'CPU'
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    sc.render.resolution_x = w
    sc.render.resolution_y = h
    sc.render.resolution_percentage = 100
    sc.view_settings.view_transform = 'AgX'
    sc.view_settings.look = 'AgX - Medium High Contrast'
    sc.render.image_settings.file_format = 'JPEG'
    sc.render.image_settings.quality = 84


def render(sc, name):
    sc.render.filepath = os.path.join(OUT, name)
    bpy.ops.render.render(write_still=True)
    print('WROTE', name)


def box(sc, name, size, loc, material):
    sx, sy, sz = size
    bpy.ops.mesh.primitive_cube_add(size=1, location=(loc[0], loc[1], sz / 2))
    o = bpy.context.object
    o.name = name
    o.scale = (sx, sy, sz)
    bpy.ops.object.transform_apply(scale=True)
    o.data.materials.append(material)
    bpy.ops.object.modifier_add(type='BEVEL')
    o.modifiers[-1].width = 0.008
    o.modifiers[-1].segments = 2
    return o


def room():
    sc = fresh()
    # floor and two walls meeting at the origin; the room lies in x > 0, y > 0
    bpy.ops.mesh.primitive_plane_add(size=1, location=(5, 5, 0))
    floor = bpy.context.object
    floor.scale = (10, 10, 1)
    bpy.ops.object.transform_apply(scale=True)
    floor.data.materials.append(mat('large-floor-tile_*'))
    walls = []
    for loc, rot, sc_ in (((5, 0, 1.5), (math.radians(90), 0, 0), (10, 3, 1)),
                           ((0, 5, 1.5), (math.radians(90), 0, math.radians(90)), (10, 3, 1))):
        bpy.ops.mesh.primitive_plane_add(size=1, location=loc, rotation=rot)
        w = bpy.context.object
        w.scale = sc_
        bpy.ops.object.transform_apply(scale=True)
        w.data.materials.append(mat('simple-bricks_*'))
        walls.append(w)
    for o in [floor] + walls:
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.uv.cube_project(cube_size=1.0)
        bpy.ops.object.mode_set(mode='OBJECT')

    gold = flat('gold', (0.78, 0.5, 0.1), 0.4)
    teal = flat('teal', (0.12, 0.42, 0.45), 0.5)
    cream = flat('cream', (0.85, 0.82, 0.74), 0.6)
    slate = flat('slate', (0.22, 0.24, 0.28), 0.5)
    objects = {
        'reference box': ((0.6, 0.6, 0.6), (3.4, 2.0), gold),
        'tall box': ((0.5, 0.5, 1.1), (1.9, 3.4), teal),
        'column': ((0.3, 0.3, 2.2), (1.0, 1.1), cream),
        'crate': ((0.8, 0.45, 0.9), (4.6, 0.9), slate),
    }
    objs = {}
    for n, (s, l, m) in objects.items():
        objs[n] = box(sc, n, s, l, m)
    drone(sc, 'dji-mavic-3-clas_*', 0.42, (3.4, 2.0, 0.6 + 0.08), 20)
    drone(sc, 'drone_31efc6b2-*', 0.45, (2.9, 3.9, 0.09), -35)

    cam_loc = Vector((6.2, 5.4, 1.5))
    yaw = math.radians(40)
    fwd = Vector((-math.cos(yaw), -math.sin(yaw), 0))
    cd = bpy.data.cameras.new('cam')
    cd.lens = 18
    cd.sensor_width = 36
    cd.sensor_fit = 'HORIZONTAL'
    cam = bpy.data.objects.new('cam', cd)
    sc.collection.objects.link(cam)
    sc.camera = cam
    cam.location = cam_loc
    cam.rotation_euler = fwd.to_track_quat('-Z', 'Y').to_euler()

    wd = bpy.data.worlds.new('w')
    sc.world = wd
    wd.use_nodes = True
    nt = wd.node_tree
    env = nt.nodes.new('ShaderNodeTexEnvironment')
    env.image = bpy.data.images.load(glob.glob(base + '/hdrs/old-forest-green_*/*_2K_*.exr')[0])
    nt.links.new(env.outputs[0], nt.nodes['Background'].inputs[0])
    nt.nodes['Background'].inputs[1].default_value = 0.8
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
    sc.collection.objects.link(sun)
    sun.data.energy = 2.6
    sun.data.angle = math.radians(6)
    sun.rotation_euler = (math.radians(52), 0, math.radians(150))
    area = bpy.data.objects.new('area', bpy.data.lights.new('area', 'AREA'))
    sc.collection.objects.link(area)
    area.data.energy = 300
    area.data.size = 3
    area.location = (5.5, 4.5, 3.2)
    area.rotation_euler = (0, 0, 0)

    render_setup(sc)
    sc.view_settings.exposure = -0.2
    bpy.context.view_layer.update()

    def px(p):
        v = world_to_camera_view(sc, cam, Vector(p))
        return [round(v.x * W, 2), round((1 - v.y) * H, 2)]

    f_px = cd.lens / cd.sensor_width * W
    info = {
        'width': W, 'height': H, 'f_px': round(f_px, 2), 'cx': W / 2, 'cy': H / 2,
        'camera_height': cam_loc.z, 'camera': list(cam_loc), 'yaw_deg': 40,
        'segments': {
            # lines parallel to the world x axis: the two edges of the wall at y = 0
            'x': [[px((0.4, 0, 0)), px((4.8, 0, 0))], [px((0.4, 0, 3)), px((4.8, 0, 3))]],
            # lines parallel to the world y axis: the two edges of the wall at x = 0
            'y': [[px((0, 0.4, 0)), px((0, 4.6, 0))], [px((0, 0.4, 3)), px((0, 4.6, 3))]],
            # vertical lines: the room corner and the column's front edge
            'z': [[px((0, 0, 0.1)), px((0, 0, 2.9))], [px((1.15, 1.25, 0)), px((1.15, 1.25, 2.2))]],
        },
        'objects': {},
    }
    # each object's vertical edge nearest the camera
    for n, (s, l, m) in objects.items():
        corners = [(l[0] + dx * s[0] / 2, l[1] + dy * s[1] / 2) for dx in (-1, 1) for dy in (-1, 1)]
        cx_, cy_ = min(corners, key=lambda c: (Vector((c[0], c[1], 0)) - cam_loc).length)
        info['objects'][n] = {'height': s[2], 'base': px((cx_, cy_, 0)), 'top': px((cx_, cy_, s[2]))}
    # exact vanishing points of the three directions
    R = cam.matrix_world.to_3x3()
    for k, d in (('x', Vector((1, 0, 0))), ('y', Vector((0, 1, 0)))):
        dc = R.transposed() @ d
        if dc.z > 0:
            dc = -dc
        info['vp_' + k] = [round(W / 2 + f_px * dc.x / -dc.z, 2), round(H / 2 - f_px * dc.y / -dc.z, 2)]
    with open(os.path.join(OUT, 'room.json'), 'w') as fh:
        json.dump(info, fh, indent=1)
    print('INFO', json.dumps(info))

    if MODE in ('room', 'all'):
        render(sc, 'room.jpg')

    # depth along the optical axis by ray casting, at quarter resolution
    import numpy as np
    dw, dh = W // 4, H // 4
    depth = np.zeros((dh, dw), np.float32)
    dg = bpy.context.evaluated_depsgraph_get()
    Rm = cam.matrix_world.to_3x3()
    for j in range(dh):
        for i in range(dw):
            u = (i + 0.5) * 4 - W / 2
            v = H / 2 - (j + 0.5) * 4
            dcam = Vector((u, v, -f_px)).normalized()
            dwld = Rm @ dcam
            hit, loc, *_ = sc.ray_cast(dg, cam_loc, dwld)
            depth[j, i] = (loc - cam_loc).dot(Rm @ Vector((0, 0, -1))) if hit else 0
    np.save(os.path.join(OUT, 'room_depth.npy'), depth)
    print('DEPTH', float(depth.min()), float(depth.max()))


def forced():
    sc = fresh()
    wd = bpy.data.worlds.new('w')
    sc.world = wd
    wd.use_nodes = True
    wd.node_tree.nodes['Background'].inputs[0].default_value = (0.62, 0.64, 0.66, 1)
    wd.node_tree.nodes['Background'].inputs[1].default_value = 1.0
    # the camera starts at (0, 0, 1.6); the small drone sits on the mirror image of the
    # ray to the big one at one third of the distance, so both look identical from there
    small = drone(sc, 'dji-mavic-3-clas_*', 0.5, (-0.45, 2.0, 1.6 - 0.6 / 3), 25)
    # an identical copy, three times larger (loading the same file twice is unreliable)
    bpy.ops.object.select_all(action='DESELECT')
    def sel(o):
        o.hide_set(False)
        o.select_set(True)
        for ch in o.children:
            sel(ch)
    sel(small)
    bpy.context.view_layer.objects.active = small
    bpy.ops.object.duplicate(linked=True)
    big = [o for o in bpy.context.selected_objects if o.parent is None][0]
    big.location = (1.35, 6.0, 1.0)
    big.scale = tuple(v * 3 for v in small.scale)
    key = bpy.data.objects.new('key', bpy.data.lights.new('key', 'SUN'))
    sc.collection.objects.link(key)
    key.data.energy = 3.0
    key.rotation_euler = (math.radians(35), 0, math.radians(-20))
    cd = bpy.data.cameras.new('cam')
    cd.lens = 35
    cd.sensor_width = 36
    cam = bpy.data.objects.new('cam', cd)
    sc.collection.objects.link(cam)
    sc.camera = cam
    render_setup(sc, samples=64, w=960, h=540)
    sc.view_settings.look = 'AgX - Base Contrast'
    target = Vector((0.0, 4.0, 1.2))
    positions = []
    for k in range(9):
        # move along an arc around the scene center, from the special viewpoint outward
        a = math.radians(-k * 3.5)
        p = Vector((0, 4.0, 1.6)) + Vector((math.sin(a) * 4.0, -math.cos(a) * 4.0, 0))
        cam.location = p
        cam.rotation_euler = (target - p).to_track_quat('-Z', 'Y').to_euler()
        positions.append([round(p.x, 3), round(p.y, 3)])
        if MODE in ('forced', 'all'):
            render(sc, 'forced_%d.jpg' % k)
    with open(os.path.join(OUT, 'forced.json'), 'w') as fh:
        json.dump({'camera_xy': positions, 'target': [0.0, 4.0],
                   'small': {'xy': [-0.45, 2.0], 'size': 0.5}, 'big': {'xy': [1.35, 6.0], 'size': 1.5}}, fh, indent=1)


if MODE in ('room', 'all', 'json'):
    room()
if MODE in ('forced', 'all'):
    forced()
