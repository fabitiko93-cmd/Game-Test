"""Split TastyTony's CC BY 4.0 Vector into metre-sized game modules.

Usage: python scripts/prepare-vector.py --source /path/to/original.glb
Requires numpy. Source URL, exact hash and changes are retained in vector.json.
The optional suppressor reuses the existing Quaternius CC0 accessory.
"""
import argparse
from collections import defaultdict
import gzip
import hashlib
import json
from pathlib import Path
import struct

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SOURCE_HASH = '3becb93d03e7a1ea26bca1338047d2f86c883ee8ef232b2752fcbfc970519d34'
SOURCE_URL = 'https://sketchfab.com/3d-models/low-poly-kriss-vector-ec2fb60fecaf4aea94b681a52ec7bc26'
MIRROR_URL = 'https://huggingface.co/datasets/allenai/objaverse/resolve/main/glbs/000-023/ec2fb60fecaf4aea94b681a52ec7bc26.glb'


def read_glb(raw):
    length = struct.unpack_from('<I', raw, 12)[0]
    doc = json.loads(raw[20:20 + length])
    size = struct.unpack_from('<I', raw, 20 + length)[0]
    binary = raw[28 + length:28 + length + size]
    types = {5121: 'u1', 5123: '<u2', 5125: '<u4', 5126: '<f4'}
    dimensions = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}

    def accessor(index):
        entry = doc['accessors'][index]
        view = doc['bufferViews'][entry['bufferView']]
        dtype = np.dtype(types[entry['componentType']])
        width = dimensions[entry['type']]
        offset = view.get('byteOffset', 0) + entry.get('byteOffset', 0)
        return np.ndarray((entry['count'], width), dtype=dtype, buffer=binary, offset=offset,
                          strides=(view.get('byteStride', dtype.itemsize * width), dtype.itemsize)).copy()

    meshes = []

    def walk(index, parent, group=None):
        node = doc['nodes'][index]
        world = parent @ np.array(node.get('matrix', np.eye(4).flatten('F'))).reshape(4, 4, order='F')
        if node.get('name') in ['Cube.005', 'Cylinder.001', 'Cylinder']:
            group = node['name']
        if 'mesh' in node:
            for primitive in doc['meshes'][node['mesh']]['primitives']:
                positions = accessor(primitive['attributes']['POSITION'])
                positions = (np.c_[positions, np.ones(len(positions))] @ world.T)[:, :3]
                faces = accessor(primitive['indices']).reshape(-1, 3) if 'indices' in primitive else np.arange(len(positions)).reshape(-1, 3)
                material = doc['materials'][primitive.get('material', 0)]
                color = material['pbrMetallicRoughness']['baseColorFactor'][:3]
                meshes.append({'group': group, 'name': node.get('name'), 'vertices': positions,
                               'faces': faces, 'color': color})
        for child in node.get('children', []):
            walk(child, world, group)

    for node in doc['scenes'][doc.get('scene', 0)]['nodes']:
        walk(node, np.eye(4))
    return meshes


def body_islands(meshes):
    vertices = np.concatenate([mesh['vertices'] for mesh in meshes])
    offsets = np.cumsum([0] + [len(mesh['vertices']) for mesh in meshes])
    faces = np.concatenate([mesh['faces'] + offsets[i] for i, mesh in enumerate(meshes)])
    unique, inverse = np.unique(np.round(vertices, 5), axis=0, return_inverse=True)
    parents = list(range(len(unique)))

    def find(index):
        while parents[index] != index:
            parents[index] = parents[parents[index]]
            index = parents[index]
        return index

    welded = inverse[faces]
    for face in welded:
        for vertex in face[1:]:
            a, b = find(int(face[0])), find(int(vertex))
            parents[max(a, b)] = min(a, b)
    roots = sorted(set(find(i) for i in range(len(unique))))
    labels = {root: i for i, root in enumerate(roots)}
    return np.array([labels[find(int(face[0]))] for face in welded]), len(roots)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', required=True, type=Path)
    args = parser.parse_args()
    raw = args.source.read_bytes()
    if hashlib.sha256(raw).hexdigest() != SOURCE_HASH:
        raise ValueError('Unexpected source revision; recheck the island selection before preparing it.')
    original = read_glb(raw)
    body = [mesh for mesh in original if mesh['group'] == 'Cube.005']
    labels, count = body_islands(body)
    assert count == 117, count
    scale = .62 / 31.783121601054816

    def transform(points):
        # Bake the source's arbitrary viewer scale. +Z is the muzzle direction;
        # the original pistol grip is aligned with the existing wrist/palm frame.
        return np.c_[-points[:, 2], points[:, 1] - .3, points[:, 0] + 8.8] * scale

    selections = {'FoldingStock': set(range(10)), 'Magazine': {41, 42}, 'Barrel': {76}}
    parts = defaultdict(list)
    offset = 0
    for mesh in original:
        if mesh['group'] == 'Cube.005':
            island = labels[offset:offset + len(mesh['faces'])]
            offset += len(mesh['faces'])
            for index, face in enumerate(mesh['faces']):
                name = next((name for name, ids in selections.items() if island[index] in ids), 'Receiver')
                parts[name].append((transform(mesh['vertices'][face]), mesh['color']))
        else:
            name = {'Cylinder.001': 'Foregrip', 'Cylinder': 'Optic'}[mesh['group']]
            parts[name].extend((transform(mesh['vertices'][face]), mesh['color']) for face in mesh['faces'])
    assert sum(len(part) for part in parts.values()) == 7419

    ak = json.loads((ROOT / 'docs/assets/weapons/ak.json').read_text())
    accessory = [mesh for mesh in read_glb(gzip.decompress((ROOT / 'docs/assets/weapons' / ak['file']).read_bytes()))
                 if mesh['name'] == 'Suppressor']
    bounds = np.concatenate([mesh['vertices'] for mesh in accessory])
    center = (bounds.min(0) + bounds.max(0)) / 2
    muzzle = np.array([0, (3.388 - .3) * scale, (9.133769078602542 + 8.8) * scale])
    for mesh in accessory:
        for face in mesh['faces']:
            points = mesh['vertices'][face].copy()
            points[:, :2] = (points[:, :2] - center[:2]) * .75 + muzzle[:2]
            points[:, 2] = (points[:, 2] - bounds.min(0)[2]) * .65 + muzzle[2] - .018
            parts['Suppressor'].append((points, mesh['color']))

    doc = {'asset': {'version': '2.0', 'generator': 'SPERRKREIS 98 · modular Vector', 'extras': {
               'author': 'TastyTony', 'title': 'Low-Poly Kriss Vector', 'source': SOURCE_URL,
               'license': 'CC BY 4.0 https://creativecommons.org/licenses/by/4.0/',
               'changes': 'Split into modules, baked metre scale, flat normals, original colours stored as vertex colours. Suppressor: Quaternius CC0.'}},
           'scene': 0, 'scenes': [{'nodes': []}], 'nodes': [], 'meshes': [],
           'materials': [{'name': 'Original vertex colours', 'doubleSided': True,
                          'pbrMetallicRoughness': {'baseColorFactor': [1, 1, 1, 1], 'metallicFactor': 0, 'roughnessFactor': .9}}],
           'buffers': [], 'bufferViews': [], 'accessors': []}
    binary = bytearray()

    def accessor(values):
        values = np.asarray(values, dtype='<f4').reshape(-1, 3)
        offset = len(binary)
        binary.extend(values.tobytes())
        view = len(doc['bufferViews'])
        doc['bufferViews'].append({'buffer': 0, 'byteOffset': offset, 'byteLength': values.nbytes, 'target': 34962})
        index = len(doc['accessors'])
        doc['accessors'].append({'bufferView': view, 'componentType': 5126, 'count': len(values), 'type': 'VEC3',
                                 'min': values.min(0).tolist(), 'max': values.max(0).tolist()})
        return index

    provenance = {}
    for name in ['Receiver', 'Barrel', 'Magazine', 'FoldingStock', 'Foregrip', 'Optic', 'Suppressor']:
        points = np.array([face for face, _ in parts[name]])
        normals = np.cross(points[:, 1] - points[:, 0], points[:, 2] - points[:, 0])
        lengths = np.linalg.norm(normals, axis=1, keepdims=True)
        normals /= np.maximum(lengths, 1e-20)
        colors = np.array([color for _, color in parts[name]])
        attributes = {'POSITION': accessor(points), 'NORMAL': accessor(np.repeat(normals, 3, axis=0)),
                      'COLOR_0': accessor(np.repeat(colors, 3, axis=0))}
        doc['meshes'].append({'name': name, 'primitives': [{'attributes': attributes, 'material': 0}]})
        doc['scenes'][0]['nodes'].append(len(doc['nodes']))
        doc['nodes'].append({'name': name, 'mesh': len(doc['meshes']) - 1})
        provenance[name] = {'triangles': len(points), 'source': 'Quaternius Ultimate Guns · Silencer_1' if name == 'Suppressor' else 'TastyTony · Low-Poly Kriss Vector'}
        if name in selections:
            provenance[name]['components'] = sorted(selections[name])
    doc['buffers'] = [{'byteLength': len(binary)}]
    document = json.dumps(doc, separators=(',', ':'), ensure_ascii=True).encode()
    document += b' ' * (-len(document) % 4)
    glb = struct.pack('<4sII', b'glTF', 2, 28 + len(document) + len(binary))
    glb += struct.pack('<I4s', len(document), b'JSON') + document + struct.pack('<I4s', len(binary), b'BIN\0') + binary
    compressed = gzip.compress(glb, mtime=0)
    digest = hashlib.sha256(compressed).hexdigest()
    out = ROOT / 'docs/assets/weapons'
    filename = f'vector-{digest[:12]}.glb.gz'
    (out / filename).write_bytes(compressed)
    metadata = {'file': filename, 'sha256': digest, 'author': 'TastyTony', 'license': 'CC BY 4.0',
                'source': SOURCE_URL, 'sourceDownload': MIRROR_URL, 'sourceSha256': SOURCE_HASH,
                'sourceTriangles': 7419, 'lengthWithStock': .62, 'parts': provenance,
                'anchors': {'stock': [0, .065, -.06], 'optic': [0, .15, .12], 'muzzle': muzzle.tolist(),
                            'magazine': [0, -.08, .11], 'foregrip': [0, -.025, .245]},
                'grips': {'right': [-.032, 0, -.14], 'left': [.145, .055, .24],
                          'foregripLeft': [.145, .005, .26], 'foregripThumb': [.015, .045, .24],
                          'foregripThumbPole': [.10, .06, .25]}}
    (out / 'vector.json').write_text(json.dumps(metadata, indent=2) + '\n')
    print(json.dumps({'file': filename, 'compressedBytes': len(compressed), 'parts': provenance}))


if __name__ == '__main__':
    main()
