"""Prepare the selected CC0 Quaternius AK as independently visible model parts.

Usage: python scripts/prepare-ak.py --source /path/to/UltimateGuns/OBJ
No mesh is invented: magazine and stocks are extracted from the original assets.
"""
import argparse
from collections import defaultdict
import gzip
import hashlib
import json
import math
from pathlib import Path
import struct

ROOT = Path(__file__).resolve().parents[1]


def read_obj(path):
    vertices, faces, materials, colors = [], [], [], {}
    material = 'Metal'
    for line in path.read_text().splitlines():
        words = line.split()
        if not words:
            continue
        if words[0] == 'v':
            vertices.append(tuple(map(float, words[1:4])))
        elif words[0] == 'usemtl':
            material = words[1]
        elif words[0] == 'f':
            faces.append([int(word.split('/')[0]) - 1 for word in words[1:]])
            materials.append(material)
    for line in path.with_suffix('.mtl').read_text().splitlines():
        words = line.split()
        if not words:
            continue
        if words[0] == 'newmtl':
            material = words[1]
        elif words[0] == 'Kd':
            colors[material] = list(map(float, words[1:4]))
    parents = list(range(len(vertices)))

    def find(index):
        while parents[index] != index:
            parents[index] = parents[parents[index]]
            index = parents[index]
        return index

    for face in faces:
        for index in face[1:]:
            parents[find(index)] = find(face[0])
    islands = defaultdict(list)
    for index, face in enumerate(faces):
        islands[find(face[0])].append(index)
    return {'vertices': vertices, 'faces': faces, 'materials': materials,
            'colors': colors, 'components': list(islands.values()), 'source': path.name}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', type=Path, required=True)
    args = parser.parse_args()
    models = {name: read_obj(args.source / path) for name, path in {
        'base': 'AssaultRifle_3.obj', 'fixed': 'AssaultRifle_2.obj',
        'frame': 'Accessories/Stock.obj', 'optic': 'Accessories/Scope_3.obj',
        'suppressor': 'Accessories/Silencer_1.obj',
    }.items()}
    # Original X is the barrel axis. WristR uses local +Z toward the muzzle.
    scale = .17

    def gun(point):
        x, y, z = point
        return (-z * scale, (y - .05) * scale, (x - .08) * scale)

    parts = [
        ('Receiver', 'base', [0, 4, 5, 6, 10], gun),
        ('Handguard', 'base', [1, 3, 12], gun),
        ('Barrel', 'base', [7, 8, 9, 11], gun),
        ('Magazine', 'base', [2], gun),
        ('FixedStock', 'fixed', [0], lambda p: gun((p[0] + .0025, p[1] + .013, p[2]))),
        ('SkeletonStock', 'frame', [0, 1], lambda p: gun((p[0] - .087, p[1] + .5517, p[2]))),
        ('Optic3x', 'optic', [0], lambda p: (-p[2] * .095, (p[1] + .029) * .095 + .133, p[0] * .095 + .11)),
        ('Suppressor', 'suppressor', [0], lambda p: (-p[2] * .115, p[1] * .115 + .092, (p[0] + .0953) * .115 + .526)),
    ]
    gltf = {'asset': {'version': '2.0', 'generator': 'SPERRKREIS 98 · Quaternius CC0'},
            'scene': 0, 'scenes': [{'nodes': []}], 'nodes': [], 'meshes': [],
            'materials': [], 'buffers': [], 'bufferViews': [], 'accessors': []}
    binary = bytearray()
    material_ids, provenance, icon_faces = {}, {}, []

    def accessor(values):
        while len(binary) % 4:
            binary.append(0)
        offset = len(binary)
        binary.extend(struct.pack('<' + 'f' * len(values), *values))
        view = len(gltf['bufferViews'])
        gltf['bufferViews'].append({'buffer': 0, 'byteOffset': offset, 'byteLength': len(values) * 4, 'target': 34962})
        index = len(gltf['accessors'])
        vectors = [values[i:i + 3] for i in range(0, len(values), 3)]
        gltf['accessors'].append({'bufferView': view, 'componentType': 5126, 'count': len(vectors), 'type': 'VEC3',
                                  'min': [min(v[i] for v in vectors) for i in range(3)],
                                  'max': [max(v[i] for v in vectors) for i in range(3)]})
        return index

    for name, source, islands, transform in parts:
        model = models[source]
        face_ids = [face for island in islands for face in model['components'][island]]
        groups = defaultdict(lambda: ([], []))
        triangles = 0
        for face_id in face_ids:
            face = [transform(model['vertices'][index]) for index in model['faces'][face_id]]
            material = model['materials'][face_id]
            key = (material, tuple(model['colors'][material]))
            if key not in material_ids:
                material_ids[key] = len(gltf['materials'])
                gltf['materials'].append({'name': material, 'pbrMetallicRoughness': {
                    'baseColorFactor': [*key[1], 1], 'metallicFactor': .12 if 'Metal' in material else 0, 'roughnessFactor': .78}, 'doubleSided': True})
            positions, normals = groups[material_ids[key]]
            for index in range(1, len(face) - 1):
                a, b, c = face[0], face[index], face[index + 1]
                u, v = [b[i] - a[i] for i in range(3)], [c[i] - a[i] for i in range(3)]
                normal = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
                length = math.sqrt(sum(n * n for n in normal))
                if length < 1e-10:
                    continue
                positions.extend([*a, *b, *c])
                normals.extend([n / length for n in normal] * 3)
                triangles += 1
            if name in ['Receiver', 'Handguard', 'Barrel', 'Magazine']:
                icon_faces.append((face, key[1]))
        primitives = [{'attributes': {'POSITION': accessor(p), 'NORMAL': accessor(n)}, 'material': material}
                      for material, (p, n) in groups.items()]
        mesh = len(gltf['meshes'])
        gltf['meshes'].append({'name': name, 'primitives': primitives})
        gltf['scenes'][0]['nodes'].append(len(gltf['nodes']))
        gltf['nodes'].append({'name': name, 'mesh': mesh})
        provenance[name] = {'source': model['source'], 'components': islands, 'sourceFaces': len(face_ids), 'triangles': triangles}
    gltf['buffers'] = [{'byteLength': len(binary)}]
    document = json.dumps(gltf, separators=(',', ':'), ensure_ascii=True).encode()
    document += b' ' * (-len(document) % 4)
    binary += b'\0' * (-len(binary) % 4)
    glb = struct.pack('<4sII', b'glTF', 2, 28 + len(document) + len(binary))
    glb += struct.pack('<I4s', len(document), b'JSON') + document + struct.pack('<I4s', len(binary), b'BIN\0') + binary
    compressed = gzip.compress(glb, mtime=0)
    digest = hashlib.sha256(compressed).hexdigest()
    out = ROOT / 'docs/assets/weapons'
    out.mkdir(parents=True, exist_ok=True)
    filename = f'ak-{digest[:12]}.glb.gz'
    (out / filename).write_bytes(compressed)
    (out / 'ak.json').write_text(json.dumps({'file': filename, 'sha256': digest, 'author': 'Quaternius', 'license': 'CC0',
                                            'userVariant': 2, 'sourceBase': 'AssaultRifle_3', 'parts': provenance}, indent=2) + '\n')
    polygons = []
    # A real orthographic side view of the base model, for the small inventory icon.
    for face, color in sorted(icon_faces, key=lambda entry: sum(p[0] for p in entry[0]) / len(entry[0])):
        rgb = [round((12.92 * c if c <= .0031308 else 1.055 * c ** (1 / 2.4) - .055) * 255) for c in color]
        points = ' '.join(f'{14 + p[2] * 133:.2f},{32 - p[1] * 133:.2f}' for p in face)
        polygons.append(f'<polygon points="{points}" fill="rgb({rgb[0]},{rgb[1]},{rgb[2]})"/>')
    (out / 'ak-icon.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 92 58">' + ''.join(polygons) + '</svg>\n')
    print(json.dumps({'file': filename, 'bytes': len(compressed), 'parts': provenance}))


if __name__ == '__main__':
    main()
