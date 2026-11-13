"""Render the stereo drone scene (left camera) through homogeneous fog.

Reuses the scene construction from stereo_scene.py (everything before its
render section), adds a fog box around the camera and the scene, and writes
chapters/media/volumetric/fog_<density>.jpg for several fog densities.
Run with Blender 5.2:  blender -b --python volume_fog.py
"""
import bpy, os, math
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(HERE, 'stereo_scene.py'), encoding='utf-8').read()
exec(src.split('FX = LENS')[0])            # builds the scene, camera, lights and render settings

OUT = os.path.join(HERE, '..', '..', 'chapters', 'media', 'volumetric')
os.makedirs(OUT, exist_ok=True)

# same left camera as the stereo chapter, so its disparity map gives the depth
cam.matrix_world = Matrix.Translation(-xaxis * B / 2) @ REST

# a box of fog that contains the camera and the whole scene
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 2.5, 1.0))
box = bpy.context.object; box.scale = (16, 14, 4)
fog = bpy.data.materials.new('fog'); fog.use_nodes = True
nt = fog.node_tree
for n in list(nt.nodes):
    if n.type != 'OUTPUT_MATERIAL': nt.nodes.remove(n)
vol = nt.nodes.new('ShaderNodeVolumePrincipled')
vol.inputs['Color'].default_value = (0.9, 0.92, 0.95, 1)
vol.inputs['Absorption Color'].default_value = (0, 0, 0, 1)
nt.links.new(vol.outputs[0], nt.nodes['Material Output'].inputs['Volume'])
box.data.materials.append(fog)

sc.cycles.samples = 128
sc.cycles.volume_bounces = 2
for d in (0.0, 0.1, 0.2, 0.4, 0.8):
    vol.inputs['Density'].default_value = d
    box.hide_render = d == 0
    sc.render.filepath = os.path.join(OUT, 'fog_%.2f.jpg' % d)
    bpy.ops.render.render(write_still=True)
    print('WROTE', d)
print('DONE')
