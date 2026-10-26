"""Check preserved grasps and actual mesh/joint invariants for shoulder review."""
import argparse
import hashlib
import importlib.util
import json
import re
from pathlib import Path
import numpy as np


def check(source, before, approved, pose_path, binding_before, binding_after, probe_directory, output):
    load = lambda path: json.loads(Path(path).read_text())
    current, previous, reference, pose = map(load, (source, before, approved, pose_path))
    old_meshes = {mesh['name']: mesh for mesh in previous['meshes']}
    approved_meshes = {mesh['name']: mesh for mesh in reference['meshes']}
    assert current['sex'] == previous['sex'] == reference['sex'] == pose['sex'] == 'male'
    assert current['authoredLeft'] == pose
    assert [mesh['name'] for mesh in current['meshes']] == list(old_meshes)
    max_finger_skin_delta = max_left_skin_delta = max_weapon_delta = 0
    for mesh in current['meshes']:
        prior = old_meshes[mesh['name']]
        assert mesh['faces'] == prior['faces'] and mesh['colors'] == prior['colors']
        p = np.asarray(mesh['positions'])
        normals = np.asarray(mesh['normals'])
        assert p.shape == np.asarray(prior['positions']).shape
        assert np.isfinite(p).all() and np.isfinite(normals).all()
        assert np.abs(np.linalg.norm(normals, axis=1) - 1).max() < 1e-5
        fingers = [i for i, name in enumerate(mesh['boneNames'])
                   if re.match(r'^(Index|Middle|Ring|Pinky)[234]R$|^Thumb[23]R$', name or '')]
        if fingers:
            max_finger_skin_delta = max(max_finger_skin_delta, float(np.abs(p[fingers] - np.asarray(approved_meshes[mesh['name']]['positions'])[fingers]).max()))
        left = [i for i, side in enumerate(mesh['sides']) if side == 'L']
        if left:
            max_left_skin_delta = max(max_left_skin_delta, float(np.abs(p[left] - np.asarray(prior['positions'])[left]).max()))
        if mesh['name'] in ['Receiver', 'Slide', 'SlideRelease', 'Magazine', 'FeedRound']:
            max_weapon_delta = max(max_weapon_delta, float(np.abs(p - np.asarray(prior['positions'])).max()))
    assert max(max_finger_skin_delta, max_left_skin_delta, max_weapon_delta) < 1e-6
    hand_joint_delta = max(float(np.linalg.norm(np.asarray(pos) - previous['joints'][name]))
                           for name, pos in current['joints'].items()
                           if re.match(r'^(Wrist|Index|Middle|Ring|Pinky|Thumb).*', name))
    assert hand_joint_delta < 1e-6
    for name, q in current['boneRotations'].items():
        assert abs(np.linalg.norm(q) - 1) < 1e-5
        if name.endswith('L') or re.match(r'^(Thumb|Index|Middle|Ring|Pinky).*R$', name):
            assert np.abs(np.asarray(q) - previous['boneRotations'][name]).max() < 1e-6
    lengths = []
    for side in ['L', 'R']:
        chains = [['Shoulder' + side, 'UpperArm' + side, 'LowerArm' + side, 'Wrist' + side]]
        chains += [[f'{finger}{i}{side}' for i in range(1, 4 if finger == 'Thumb' else 5)]
                   for finger in ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky']]
        for chain in chains:
            for a, b in zip(chain, chain[1:]):
                length = lambda data: np.linalg.norm(np.asarray(data['joints'][a]) - data['joints'][b])
                lengths.append(float(abs(length(current) - length(reference))))
    assert max(lengths) < 1e-6
    arm = current['contactMetrics']['alignedRight']
    assert arm['shoulderReference'] == 'rig-rest' and arm['shoulderTurnDegrees'] < 1e-6
    assert arm['afterDegrees'] <= 27 and abs(arm['wristTwist']) < np.deg2rad(10.1)
    assert abs(arm['forearmTwist']) < np.deg2rad(90.1)
    assert arm['handPositionError'] < 1e-6 and arm['handRotationError'] < 1e-6
    def shoulder_height_difference(data):
        return abs(data['joints']['UpperArmR'][1] - data['joints']['UpperArmL'][1])
    heights = {key: shoulder_height_difference(data) for key, data in [('before', previous), ('after', current)]}
    assert heights['after'] < .005 and heights['after'] < heights['before']

    original_binding, corrected_binding = map(load, (binding_before, binding_after))
    correction = current['contactMetrics']['shoulderSkin']
    assert correction['sourceGeometrySha256'] == pose['shoulderSkin']['sourceGeometrySha256'] == original_binding['geometrySha256']
    assert correction['originalGeometryUnmodified'] and correction['geometryCloned']
    for attribute in ['positions', 'normals', 'indices', 'bindMatrix', 'bindMatrixInverse', 'matrixWorld', 'boneNames']:
        assert original_binding[attribute] == corrected_binding[attribute], attribute
    old_indices = np.asarray(original_binding['skinIndex']).reshape(-1, 4)
    new_indices = np.asarray(corrected_binding['skinIndex']).reshape(-1, 4)
    old_weights = np.asarray(original_binding['skinWeight']).reshape(-1, 4)
    new_weights = np.asarray(corrected_binding['skinWeight']).reshape(-1, 4)
    changed = np.any(old_indices != new_indices, axis=1) | np.any(old_weights != new_weights, axis=1)
    assert set(np.flatnonzero(changed)) == set(correction['changedVertexIndices'])
    assert sum(changed) == correction['changedVertices']
    assert np.isfinite(new_weights).all() and (new_weights >= 0).all()
    assert abs(new_weights.sum(axis=1) - 1).max() < 1e-6
    bind_points = np.asarray(original_binding['positions']).reshape(-1, 3)
    assert ((bind_points[changed, 0] > -.32) & (bind_points[changed, 0] < -.045) & (bind_points[changed, 1] > 1.35)).all()
    body = next(mesh for mesh in current['meshes'] if mesh['name'] == original_binding['meshName'])
    for i in np.flatnonzero(changed):
        assert not re.match(r'^(Wrist|Thumb|Index|Middle|Ring|Pinky)', old_meshes[body['name']]['boneNames'][i] or '')

    probe_checks = {}
    for name in ['neutral', 'reach']:
        a, b = [load(Path(probe_directory) / f'male-shoulder-{name}-{variant}.json') for variant in ['before', 'after']]
        assert a['joints'] == b['joints']
        old = {mesh['name']: mesh for mesh in a['meshes']}
        max_outside = 0
        for mesh in b['meshes']:
            positions = np.asarray(mesh['positions'])
            assert np.isfinite(positions).all() and np.isfinite(mesh['normals']).all()
            outside = ~changed if mesh['name'] == body['name'] else np.ones(len(positions), dtype=bool)
            max_outside = max(max_outside, float(np.abs(positions[outside] - np.asarray(old[mesh['name']]['positions'])[outside]).max()))
        assert max_outside < 1e-7
        probe_checks[name] = {'sourceClip': b['poseProbe'], 'finiteSkin': True, 'jointsUnchanged': True, 'outsidePatchMaxWorldDifferenceMetres': max_outside}

    spec = importlib.util.spec_from_file_location('contact', Path(__file__).with_name('analyze-g17-contact.py'))
    contact = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(contact)
    groups = {}
    for side in ['R', 'L']:
        for finger in ['Index', 'Middle', 'Ring', 'Pinky', 'Thumb']:
            triangles, identities = [], []
            pattern = '^' + finger + ('[23]' if finger == 'Thumb' else '[234]') + side + '$'
            for mi, mesh in enumerate(current['meshes']):
                p = np.asarray(mesh['positions'])
                labels = mesh['boneNames']
                if len(labels) != len(p):
                    continue
                for face in mesh['faces']:
                    if sum(bool(re.match(pattern, labels[i] or '')) for i in face) >= 2:
                        triangles.append(p[face])
                        identities.append(tuple(mi * 100000 + i for i in face))
            groups[finger + side] = (np.asarray(triangles), identities)
    pairs = [(a + side, b + side) for side in ['R', 'L']
             for a, b in [('Index', 'Middle'), ('Middle', 'Ring'), ('Ring', 'Pinky')]]
    pairs += [('ThumbL', 'ThumbR'), ('ThumbL', 'IndexR'), ('ThumbL', 'IndexL')]
    crossings = {}
    for a, b in pairs:
        count = contact.crossings(groups[a][0], groups[b][0], groups[a][1], groups[b][1])
        assert count == 0, (a, b, count)
        crossings[a + '/' + b] = count
    # Count actual triangle crossings without pretending that the underlying
    # body is globally collision-free. Coincident bind points share an identity.
    welded = {}
    vertex_ids = []
    for p in bind_points:
        key = tuple(np.round(p, 5))
        welded.setdefault(key, len(welded))
        vertex_ids.append(welded[key])
    faces = np.asarray(body['faces'])
    face_ids = np.asarray(vertex_ids)[faces]
    selected = changed[faces].any(axis=1)
    shoulder_crossings = {}
    for name, scene in [('before', previous), ('after', current)]:
        p = np.asarray(next(mesh for mesh in scene['meshes'] if mesh['name'] == body['name'])['positions'])
        shoulder_crossings[name] = contact.crossings(p[faces[selected]], p[faces], [tuple(ids) for ids in face_ids[selected]], [tuple(ids) for ids in face_ids])
    assert shoulder_crossings['after'] < shoulder_crossings['before']
    right_hash = hashlib.sha256(Path(pose['firingHandReference']['poseFile']).read_bytes()).hexdigest()
    assert right_hash == pose['firingHandReference']['poseSha256']
    checks = {
        'approvedRightFingerSkinMaxWorldDifferenceMetres': max_finger_skin_delta,
        'review06LeftSkinMaxWorldDifferenceMetres': max_left_skin_delta,
        'bothHandJointMaxWorldDifferenceMetres': hand_joint_delta,
        'weaponSkinMaxWorldDifferenceMetres': max_weapon_delta,
        'maxArmAndFingerSegmentLengthErrorMetres': max(lengths),
        'finiteSkinAndUnitNormalsAndQuaternions': True,
        'meshTopologyAndOriginalMaterialColorsUnchanged': True,
        'shoulderHeightDifferenceMetres': heights,
        'bodyBindPositionsNormalsAndTopologyUnchanged': True,
        'sourceBodyGeometryUnmodified': correction['originalGeometryUnmodified'],
        'shoulderSkinCorrection': correction,
        'shoulderPatchTriangleCrossingPairs': shoulder_crossings,
        'sourceClipPoseProbes': probe_checks,
        'adjacentFingerAndThumbSkinCrossingPairs': crossings,
        'rightArmAlignment': arm,
        'supportContact': current['contactMetrics']['authoredLeft'],
    }
    report = {
        'format': 'sperrkreis-shoulder-review-snapshot', 'version': 1, 'reviewVersion': 7,
        'status': 'awaiting-visual-approval', 'scope': pose['scope'],
        'poseSha256': hashlib.sha256(Path(pose_path).read_bytes()).hexdigest(),
        'firingHandReference': pose['firingHandReference'], 'checks': checks,
        'rightArmBoneRotations': {n: q for n, q in current['boneRotations'].items()
                                  if re.match(r'^(Shoulder|UpperArm|LowerArm|Wrist)R$', n)},
        'limits': [
            'The upper-arm crease offset is an authored calibration in this rig frame, not an anatomical angle.',
            'Selected finger skin pairs are checked; contact overlaps elsewhere remain possible.',
            'Shoulder triangle intersections decrease but remain; this is not a collision-free body certificate.',
            'Static male G17 preview only; no female fit, animation-transition or runtime approval.',
        ],
    }
    Path(output).write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({'checksPassed': True, 'changedShoulderVertices': correction['changedVertices'],
                      'handJointMaxDifferenceMetres': hand_joint_delta,
                      'sourceGeometryUnmodified': correction['originalGeometryUnmodified'],
                      'rightWristBendDegrees': arm['afterDegrees'],
                      'shoulderTriangleCrossings': shoulder_crossings,
                      'poseProbes': list(probe_checks)}, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('source', type=Path)
    parser.add_argument('--before', required=True, type=Path)
    parser.add_argument('--approved', required=True, type=Path)
    parser.add_argument('--pose', required=True, type=Path)
    parser.add_argument('--binding-before', required=True, type=Path)
    parser.add_argument('--binding-after', required=True, type=Path)
    parser.add_argument('--probe-directory', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    check(args.source, args.before, args.approved, args.pose, args.binding_before, args.binding_after, args.probe_directory, args.output)
