"""Prepare the original CC0 Quaternius M4 variants as interchangeable modules.

Usage: python scripts/prepare-m4.py --source /path/to/UltimateGuns/OBJ
Variant 1 is preserved in full. Variant 2 contributes its complete upper, so
neither its connected receiver/handguard nor its barrel needs an invented cut.
"""
import argparse
import gzip
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import struct

ROOT = Path(__file__).resolve().parents[1]
# Reuse the existing original-OBJ parser and connected-component ordering.
spec = importlib.util.spec_from_file_location('prepare_ak', ROOT / 'scripts/prepare-ak.py')
ak = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ak)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', type=Path, required=True)
    args = parser.parse_args()
    paths = {'base': 'AssaultRifle2_1.obj', 'rail': 'AssaultRifle2_2.obj',
             'frame': 'Accessories/Stock.obj', 'optic': 'Accessories/Scope_3.obj',
             'suppressor': 'Accessories/Silencer_1.obj'}
    models = {name: ak.read_obj(args.source / path) for name, path in paths.items()}
    assert len(models['base']['faces']) == 913 and len(models['rail']['faces']) == 806
    scale = .16

    def gun(point):
        x, y, z = point
        return (-z * scale, (y - .05) * scale, (x - .08) * scale)

    def center(model, component):
        ids = sorted({i for f in model['components'][component] for i in model['faces'][f]})
        return [sum(model['vertices'][i][axis] for i in ids) / len(ids) for axis in range(3)]

    # The original exports have slightly different origins. Align their identical
    # pistol grips, rather than scaling or distorting either upper assembly.
    a, b = center(models['base'], 0), center(models['rail'], 5)
    alignment = [a[i] - b[i] for i in range(3)]
    rail = lambda p: gun([p[i] + alignment[i] for i in range(3)])
    def muzzle_at(model, component, transform):
        points = [model['vertices'][i] for f in model['components'][component] for i in model['faces'][f]]
        end = max(p[0] for p in points)
        ring = [p for p in points if p[0] > end - .00001]
        return transform((end, *[(min(p[i] for p in ring) + max(p[i] for p in ring)) / 2 for i in (1, 2)]))

    muzzle = muzzle_at(models['base'], 6, gun)
    rail_muzzle = muzzle_at(models['rail'], 1, rail)
    muzzle_delta = rail_muzzle[2] - muzzle[2]
    parts = [
        ('Receiver', 'base', [0, 1, 5, 8], gun),
        ('RearSight', 'base', [9], gun),
        ('StandardUpper', 'base', [2, 6, 7, *range(10, 18)], gun),
        ('RailUpper', 'rail', [1, 4, *range(9, 36)], rail),
        ('Magazine', 'base', [3], gun),
        ('Stock', 'base', [4], gun),
        ('FrameStock', 'frame', [0, 1], lambda p: gun((p[0] - .257, p[1] + .62, p[2]))),
        ('Optic3x', 'optic', [0], lambda p: (-p[2] * .095, (p[1] + .029) * .095 + .1225, p[0] * .095 + .10)),
        ('Suppressor', 'suppressor', [0], lambda p: (-p[2] * .115 + muzzle[0], p[1] * .115 + muzzle[1], (p[0] + .0953) * .115 + muzzle[2] - .005)),
    ]
    gltf = {'asset': {'version': '2.0', 'generator': 'SPERRKREIS 98 · Quaternius CC0'},
            'scene': 0, 'scenes': [{'nodes': []}], 'nodes': [], 'meshes': [],
            'materials': [{'name': 'OriginalColours', 'pbrMetallicRoughness': {
                'baseColorFactor': [1, 1, 1, 1], 'metallicFactor': .1, 'roughnessFactor': .78}, 'doubleSided': True}],
            'buffers': [], 'bufferViews': [], 'accessors': []}
    binary, provenance, icon_faces = bytearray(), {}, []

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
        positions, normals, colors = [], [], []
        triangles = 0
        for face_id in face_ids:
            face = [transform(model['vertices'][i]) for i in model['faces'][face_id]]
            color = model['colors'][model['materials'][face_id]]
            for index in range(1, len(face) - 1):
                a, b, c = face[0], face[index], face[index + 1]
                u, v = [b[i] - a[i] for i in range(3)], [c[i] - a[i] for i in range(3)]
                normal = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
                length = math.sqrt(sum(n * n for n in normal))
                if length < 1e-10:
                    continue
                positions.extend([*a, *b, *c])
                normals.extend([n / length for n in normal] * 3)
                colors.extend(color * 3)
                triangles += 1
            if source == 'base':
                icon_faces.append((face, color))
        mesh = len(gltf['meshes'])
        gltf['meshes'].append({'name': name, 'primitives': [{'attributes': {
            'POSITION': accessor(positions), 'NORMAL': accessor(normals), 'COLOR_0': accessor(colors)}, 'material': 0}]})
        gltf['scenes'][0]['nodes'].append(len(gltf['nodes']))
        gltf['nodes'].append({'name': name, 'mesh': mesh})
        provenance[name] = {'source': paths[source], 'components': islands, 'sourceFaces': len(face_ids), 'triangles': triangles}
    # The fully assembled base must retain every original polygon exactly once.
    assert sum(p['sourceFaces'] for p in provenance.values() if p['source'] == paths['base']) == 913
    gltf['buffers'] = [{'byteLength': len(binary)}]
    document = json.dumps(gltf, separators=(',', ':')).encode()
    document += b' ' * (-len(document) % 4)
    binary += b'\0' * (-len(binary) % 4)
    glb = struct.pack('<4sII', b'glTF', 2, 28 + len(document) + len(binary))
    glb += struct.pack('<I4s', len(document), b'JSON') + document + struct.pack('<I4s', len(binary), b'BIN\0') + binary
    compressed = gzip.compress(glb, mtime=0)
    digest = hashlib.sha256(compressed).hexdigest()
    out = ROOT / 'docs/assets/weapons'
    filename = f'm4-{digest[:12]}.glb.gz'
    (out / filename).write_bytes(compressed)
    metadata = {'file': filename, 'sha256': digest, 'author': 'Quaternius', 'license': 'CC0',
                'source': 'https://quaternius.itch.io/50-lowpoly-guns', 'userVariant': 1,
                'sourceBase': 'AssaultRifle2_1', 'parts': provenance, 'railAlignment': alignment,
                'sources': {path: hashlib.sha256((args.source / path).read_bytes()).hexdigest()
                            for path in paths.values()},
                'anchors': {'stock': [0, .065, -.19], 'optic': [0, .145, .10],
                            'muzzle': muzzle, 'barrel': [0, .095, .29], 'magazine': [0, -.04, .145]},
                'grips': {'right': [-.032, 0, -.14], 'left': [.145, .075, .27],
                          'leftThumb': [.025, .12, .27], 'leftThumbPole': [.11, .145, .29]},
                'setups': {'m4_rail_barrel': {'offsets': {'Suppressor': [rail_muzzle[0] - muzzle[0], rail_muzzle[1] - muzzle[1], muzzle_delta]},
                            'anchors': {'muzzle': rail_muzzle, 'barrel': [0, .095, .25]},
                            'grips': {'left': [.145, .075, .25], 'leftThumb': [.025, .12, .25], 'leftThumbPole': [.11, .145, .27]}}}}
    (out / 'm4.json').write_text(json.dumps(metadata, indent=2) + '\n')
    polygons = []
    for face, color in sorted(icon_faces, key=lambda entry: sum(p[0] for p in entry[0]) / len(entry[0])):
        rgb = [round((12.92 * c if c <= .0031308 else 1.055 * c ** (1 / 2.4) - .055) * 255) for c in color]
        points = ' '.join(f'{32 + p[2] * 100:.2f},{29 - p[1] * 100:.2f}' for p in face)
        polygons.append(f'<polygon points="{points}" fill="rgb({rgb[0]},{rgb[1]},{rgb[2]})"/>')
    (out / 'm4-icon.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 92 58">' + ''.join(polygons) + '</svg>\n')
    print(json.dumps({'file': filename, 'bytes': len(compressed), 'parts': provenance}))


if __name__ == '__main__':
    main()
