"""Flatten the approved CC0 source meshes into embedded vertex-colour models.

blender -b -P scripts/prepare-melee-models.py -- HAMMER.blend COOKING-KNIFE.glb
"""
import json
import sys
from math import pi
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

hammer_path, knife_path = sys.argv[sys.argv.index('--') + 1:]
output = Path(__file__).resolve().parent.parent / 'docs/assets/weapons/melee-models.json'
bpy.ops.wm.read_factory_settings(use_empty=True)
with bpy.data.libraries.load(str(Path(hammer_path).resolve()), link=False) as (source, target):
    target.objects = ['Hammer']
hammer = target.objects[0]
bpy.context.collection.objects.link(hammer)
bpy.context.view_layer.update()
hammer_transform = Matrix.Rotation(pi, 4, 'X') @ Matrix.Scale(.34 / .4064, 4) @ Matrix.Translation((0, 0, .082)) @ hammer.matrix_world
bpy.ops.import_scene.gltf(filepath=str(Path(knife_path).resolve()))
knife, = [obj for obj in bpy.context.selected_objects if obj.type == 'MESH']
to_game = Matrix(((1, 0, 0, 0), (0, 0, 1, 0), (0, -1, 0, 0), (0, 0, 0, 1)))
knife_transform = (Matrix.Rotation(-pi / 2, 4, 'Y') @ Matrix.Scale(.285 / .71625, 4)
                   @ Matrix.Translation((-.2331, -.02, .03)) @ to_game @ knife.matrix_world)


def flatten(obj, transform):
    mesh = obj.data
    mesh.calc_loop_triangles()
    materials = []
    for material in mesh.materials:
        shader = next((node for node in material.node_tree.nodes if node.type == 'BSDF_PRINCIPLED'), None) if material.use_nodes else None
        color = shader.inputs['Base Color'].default_value[:3] if shader else material.diffuse_color[:3]
        image = next((node.image for node in material.node_tree.nodes if node.type == 'TEX_IMAGE' and node.image), None) if material.use_nodes else None
        materials.append((color, image, list(image.pixels) if image else None))
    positions, colors = [], []
    uv = mesh.uv_layers.active
    for face in mesh.loop_triangles:
        color, image, pixels = materials[face.material_index]
        if pixels and uv:
            center = sum((uv.data[index].uv for index in face.loops), Vector((0, 0))) / 3
            width, height = image.size
            x = min(width - 1, max(0, int(center.x * width)))
            y = min(height - 1, max(0, int(center.y * height)))
            offset = 4 * (y * width + x)
            color = tuple(value ** 2.2 for value in pixels[offset:offset + 3])
        for index in face.vertices:
            positions.extend(round(value, 7) for value in transform @ mesh.vertices[index].co)
            colors.extend(round(value, 7) for value in color)
    return {'positions': positions, 'colors': colors}


models = {'claw_hammer': flatten(hammer, hammer_transform), 'kitchen_knife': flatten(knife, knife_transform)}
output.write_text(json.dumps(models, separators=(',', ':')) + '\n')
for name, data in models.items():
    print(name, len(data['positions']) // 9, 'triangles')
