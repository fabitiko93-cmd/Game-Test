"""Prepare the chosen Quaternius revolver family (sheet R1/R2/R4).

python scripts/prepare-revolver.py --source /path/to/UltimateGuns/OBJ
Sheet numbers map to Revolver_4 / Revolver_2 / Revolver_3 respectively.
"""
import argparse
import gzip
import hashlib
import json
import math
from pathlib import Path
import runpy
import struct
import sys

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[1]
read_obj = runpy.run_path(str(ROOT / 'scripts/prepare-ak.py'))['read_obj']


def vertices(model, component):
    return [model['vertices'][i] for i in sorted({i for f in model['components'][component] for i in model['faces'][f]})]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', type=Path, required=True)
    args = parser.parse_args()
    paths = {'base': 'Revolver_2.obj', 'short': 'Revolver_4.obj', 'rail': 'Revolver_3.obj', 'light': 'Accessories/Flashlight.obj'}
    models = {key: read_obj(args.source / path) for key, path in paths.items()}
    assert [len(models[k]['faces']) for k in ['short', 'base', 'rail']] == [479, 621, 691]
    scale = .17

    def gun(p):
        return (-p[2] * scale, (p[1] + .03) * scale, (p[0] - .24) * scale)

    def shifted(offset):
        return lambda p: gun([p[i] + offset[i] for i in range(3)])

    def center(points):
        return [sum(p[i] for p in points) / len(points) for i in range(3)]

    a, b = center(vertices(models['base'], 2)), center(vertices(models['rail'], 3))
    rail_offset = [a[i] - b[i] for i in range(3)]
    # Match the barrel rib root and the grip's upper attachment independently.
    a, b = vertices(models['base'], 6), vertices(models['short'], 2)
    short_offset = [min(p[i] for p in a) - min(p[i] for p in b) for i in range(3)]
    a, b = vertices(models['base'], 11), vertices(models['short'], 10)
    grip_offset = [max(p[i] for p in a) - max(p[i] for p in b) for i in range(3)]
    top = gun([0, max(p[1] for p in vertices(models['rail'], 4)) + rail_offset[1], 0])[1]
    specs = [
        ('Receiver', 'base', [4, 5, 12], gun),
        ('Cylinder', 'base', [2], gun),
        ('Hammer', 'base', [3], gun),
        ('ShortBarrel', 'short', [2, 3, 5, 6, 7], shifted(short_offset)),
        ('LongBarrel', 'base', [6, 7, 8, 9, 10], gun),
        ('RailBarrel', 'rail', [*range(4, 15), 16, 17, 18, 19, 20], shifted(rail_offset)),
        ('WoodGrip', 'short', [10], shifted(grip_offset)),
        ('ComfortGrip', 'base', [0, 1, 11], gun),
        ('Flashlight', 'light', [0, 1, 2], lambda p: (-p[2] * .18, (p[1] + .034113) * .18 + top, (p[0] - .0773425) * .18 + .185)),
    ]
    gltf = {'asset': {'version': '2.0', 'generator': 'SPERRKREIS 98', 'extras': {
                'body': 'Quaternius · CC0', 'reflex': 'TastyTony · CC BY 4.0; reused from credited Vector'}},
            'scene': 0, 'scenes': [{'nodes': []}], 'nodes': [], 'meshes': [], 'buffers': [], 'bufferViews': [], 'accessors': [],
            'materials': [{'name': 'OriginalColours', 'pbrMetallicRoughness': {'baseColorFactor': [1, 1, 1, 1], 'metallicFactor': .1, 'roughnessFactor': .78}, 'doubleSided': True}]}
    binary, provenance, icon = bytearray(), {}, []

    def accessor(values):
        offset = len(binary)
        binary.extend(struct.pack('<' + 'f' * len(values), *values))
        view = len(gltf['bufferViews'])
        gltf['bufferViews'].append({'buffer': 0, 'byteOffset': offset, 'byteLength': len(values) * 4, 'target': 34962})
        vectors = [values[i:i + 3] for i in range(0, len(values), 3)]
        index = len(gltf['accessors'])
        gltf['accessors'].append({'bufferView': view, 'componentType': 5126, 'count': len(vectors), 'type': 'VEC3',
                                  'min': [min(p[i] for p in vectors) for i in range(3)], 'max': [max(p[i] for p in vectors) for i in range(3)]})
        return index

    def add(name, positions, normals, colors, metadata):
        mesh = len(gltf['meshes'])
        gltf['meshes'].append({'name': name, 'primitives': [{'attributes': {
            'POSITION': accessor(positions), 'NORMAL': accessor(normals), 'COLOR_0': accessor(colors)}, 'material': 0}]})
        gltf['scenes'][0]['nodes'].append(len(gltf['nodes']))
        gltf['nodes'].append({'name': name, 'mesh': mesh})
        provenance[name] = {**metadata, 'triangles': len(positions) // 9}

    for name, source, islands, transform in specs:
        model = models[source]
        face_ids = [f for island in islands for f in model['components'][island]]
        positions, normals, colors = [], [], []
        for fi in face_ids:
            face = [transform(model['vertices'][i]) for i in model['faces'][fi]]
            color = model['colors'][model['materials'][fi]]
            for j in range(1, len(face) - 1):
                a, b, c = face[0], face[j], face[j + 1]
                u, v = [b[i] - a[i] for i in range(3)], [c[i] - a[i] for i in range(3)]
                normal = [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]]
                length = math.sqrt(sum(n*n for n in normal))
                if length < 1e-10:
                    continue
                positions.extend([*a, *b, *c]);normals.extend([n/length for n in normal] * 3);colors.extend(color * 3)
            if name in ['Receiver', 'Cylinder', 'Hammer', 'ShortBarrel', 'WoodGrip']:
                icon.append((face, color))
        add(name, positions, normals, colors, {'source': paths[source], 'components': islands, 'sourceFaces': len(face_ids), 'license': 'CC0'})
    # Reuse the existing licensed red-dot geometry without fetching another asset.
    vector = json.loads((ROOT / 'docs/assets/weapons/vector.json').read_text())
    blob = gzip.decompress((ROOT / 'docs/assets/weapons' / vector['file']).read_bytes())
    size = struct.unpack_from('<I', blob, 12)[0];doc = json.loads(blob[20:20 + size]);data = blob[28 + size:]
    node = next(n for n in doc['nodes'] if n['name'] == 'Optic')
    primitive = doc['meshes'][node['mesh']]['primitives'][0]

    def values(attribute):
        a = doc['accessors'][primitive['attributes'][attribute]];v = doc['bufferViews'][a['bufferView']]
        assert a['componentType'] == 5126 and a['type'] == 'VEC3'
        return list(struct.unpack_from('<' + 'f' * a['count'] * 3, data, v.get('byteOffset', 0) + a.get('byteOffset', 0)))

    positions, normals, colors = values('POSITION'), values('NORMAL'), values('COLOR_0')
    xyz = [positions[i:i + 3] for i in range(0, len(positions), 3)]
    middle_x = (min(p[0] for p in xyz) + max(p[0] for p in xyz)) / 2
    middle_z = (min(p[2] for p in xyz) + max(p[2] for p in xyz)) / 2;bottom = min(p[1] for p in xyz)
    positions = [n for p in xyz for n in ((p[0] - middle_x)*.75, (p[1] - bottom)*.75 + top, (p[2] - middle_z)*.75 + .102)]
    add('Reflex', positions, normals, colors, {'source': 'TastyTony · Low-Poly Kriss Vector · Optic', 'license': 'CC BY 4.0', 'sourceAssetSha256': vector['sha256']})
    assert sum(p['sourceFaces'] for p in provenance.values() if p['source'] == paths['base']) == 621
    gltf['buffers'] = [{'byteLength': len(binary)}]
    document = json.dumps(gltf, separators=(',', ':')).encode();document += b' ' * (-len(document) % 4)
    binary += b'\0' * (-len(binary) % 4)
    glb = struct.pack('<4sII', b'glTF', 2, 28 + len(document) + len(binary))
    glb += struct.pack('<I4s', len(document), b'JSON') + document + struct.pack('<I4s', len(binary), b'BIN\0') + binary
    compressed = gzip.compress(glb, mtime=0);digest = hashlib.sha256(compressed).hexdigest()
    out = ROOT / 'docs/assets/weapons';filename = f'revolver-{digest[:12]}.glb.gz';(out / filename).write_bytes(compressed)
    cylinder = [gun(p) for p in vertices(models['base'], 2)]
    metadata = {'file': filename, 'sha256': digest, 'author': 'Quaternius / TastyTony (reflex)', 'license': 'CC0 + CC BY 4.0',
                'sheetSources': {'R1': paths['short'], 'R2': paths['base'], 'R4': paths['rail']}, 'parts': provenance,
                'anchors': {'barrel': [0, .095, .17], 'grip': [0, -.015, -.045], 'optic': [0, top, .102], 'utility': [0, top, .185]},
                'grips': {'handgun': True, 'right': [-.032, 0, -.14], 'left': [.135, -.015, -.02],
                          'leftThumb': [.035, .045, -.035], 'leftThumbPole': [.11, .075, -.03]},
                'reload': {'cylinderPivot': [0, min(p[1] for p in cylinder) - .005, sum(p[2] for p in cylinder)/len(cylinder)]},
                'alignment': {'shortBarrel': short_offset, 'shortGrip': grip_offset, 'rail': rail_offset},
                'sources': {path: hashlib.sha256((args.source / path).read_bytes()).hexdigest() for path in paths.values()}}
    (out / 'revolver.json').write_text(json.dumps(metadata, indent=2) + '\n')
    polygons = []
    for face, color in sorted(icon, key=lambda entry: sum(p[0] for p in entry[0])/len(entry[0])):
        rgb = [round((12.92*c if c <= .0031308 else 1.055*c**(1/2.4)-.055)*255) for c in color]
        points = ' '.join(f'{32+p[2]*205:.2f},{37-p[1]*205:.2f}' for p in face)
        polygons.append(f'<polygon points="{points}" fill="rgb({rgb[0]},{rgb[1]},{rgb[2]})"/>')
    (out / 'revolver-icon.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 92 58">' + ''.join(polygons) + '</svg>\n')
    print(json.dumps({'file': filename, 'bytes': len(compressed), 'parts': provenance}))


if __name__ == '__main__':
    main()
