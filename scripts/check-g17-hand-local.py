"""Verify hand-only changes against the unmodified game firing arm."""
import argparse
import hashlib
import importlib.util
import json
import re
from pathlib import Path
import numpy as np


def check(original_path,candidate_path,original_binding_path,candidate_binding_path,pose_path,output):
    load=lambda p:json.loads(Path(p).read_text())
    original,candidate,original_binding,binding,pose=map(load,[original_path,candidate_path,original_binding_path,candidate_binding_path,pose_path])
    metrics=candidate['contactMetrics']['handLocalAttachment']
    assert candidate['sex']==original['sex']==pose['sex']=='male'
    assert candidate['authoredLeft']==pose
    assert 'armAlignment' not in pose and 'shoulderSkin' not in pose
    assert not metrics['skinWeightsModified']
    assert original_binding['geometrySha256']==binding['geometrySha256']
    for attribute in ['positions','normals','indices','skinWeight','skinIndex','boneNames']:
        assert original_binding[attribute]==binding[attribute],attribute
    for n in metrics['protectedBones']:
        assert original['boneRotations'][n]==candidate['boneRotations'][n],n
    assert metrics['protectedQuaternionMaxDifference']==0
    old={m['name']:m for m in original['meshes']}
    skin_delta=0
    for mesh in candidate['meshes']:
        before=old[mesh['name']]
        assert before['faces']==mesh['faces'] and before['colors']==mesh['colors']
        assert np.isfinite(mesh['positions']).all() and np.isfinite(mesh['normals']).all()
        assert np.max(np.abs(np.linalg.norm(mesh['normals'],axis=1)-1))<1e-5
        selected=[i for i,n in enumerate(before['boneNames']) if n in ['ShoulderR','UpperArmR']]
        if selected:
            skin_delta=max(skin_delta,float(np.abs(np.asarray(mesh['positions'])[selected]-np.asarray(before['positions'])[selected]).max()))
    assert skin_delta==0,skin_delta
    length_errors=[]
    for side in ['R','L']:
        chains=[['Shoulder'+side,'UpperArm'+side,'LowerArm'+side,'Wrist'+side]]
        chains += [[f+str(i)+side for i in range(1,4 if f=='Thumb' else 5)] for f in ['Thumb','Index','Middle','Ring','Pinky']]
        for chain in chains:
            for a,b in zip(chain,chain[1:]):
                distance=lambda scene:np.linalg.norm(np.asarray(scene['joints'][a])-scene['joints'][b])
                length_errors.append(float(abs(distance(original)-distance(candidate))))
    assert max(length_errors)<1e-6
    for n,q in candidate['boneRotations'].items():assert abs(np.linalg.norm(q)-1)<1e-5,n
    assert metrics['rightPalmError']<1e-6 and metrics['leftPalmError']<1e-6
    assert metrics['rightWristBendDegrees']<21 and metrics['leftWristBendDegrees']<25

    spec=importlib.util.spec_from_file_location('contact',Path(__file__).with_name('analyze-g17-contact.py'))
    contact=importlib.util.module_from_spec(spec);spec.loader.exec_module(contact)
    groups={}
    for side in ['R','L']:
        for finger in ['Index','Middle','Ring','Pinky','Thumb']:
            triangles=[];ids=[];pattern='^'+finger+('[23]' if finger=='Thumb' else '[234]')+side+'$'
            for mi,mesh in enumerate(candidate['meshes']):
                if len(mesh['boneNames'])!=len(mesh['positions']):continue
                p=np.asarray(mesh['positions'])
                for face in mesh['faces']:
                    if sum(bool(re.match(pattern,mesh['boneNames'][i] or '')) for i in face)>=2:
                        triangles.append(p[face]);ids.append(tuple(mi*100000+i for i in face))
            groups[finger+side]=(np.asarray(triangles),ids)
    pairs=[(f+side,g+side) for side in ['R','L'] for f,g in [('Index','Middle'),('Middle','Ring'),('Ring','Pinky')]]
    pairs += [('ThumbL','ThumbR'),('ThumbR','IndexR'),('ThumbL','IndexR'),('ThumbL','IndexL')]
    crossings={}
    for a,b in pairs:
        x,ix=groups[a];y,iy=groups[b];value=contact.crossings(x,y,ix,iy)
        assert value==0,(a,b,value)
        crossings[a+'/'+b]=value
    reference_hash=hashlib.sha256(Path(pose['firingHandReference']['poseFile']).read_bytes()).hexdigest()
    assert reference_hash==pose['firingHandReference']['poseSha256']
    report={'format':'sperrkreis-hand-local-review','version':1,'reviewVersion':8,'status':'awaiting-visual-approval',
            'poseSha256':hashlib.sha256(Path(pose_path).read_bytes()).hexdigest(),
            'checks':{'originalFiringArmBoneRotationsExactlyPreserved':True,'originalRightShoulderAndUpperArmSkinMaxDifferenceMetres':skin_delta,
                      'originalMeshPositionsNormalsTopologyAndSkinWeightsExactlyPreserved':True,'maxSegmentLengthErrorMetres':max(length_errors),
                      'finiteSkinAndUnitNormalsAndQuaternions':True,'adjacentFingerAndThumbCrossingPairs':crossings,'attachment':metrics},
            'limits':['Hand/finger contacts are not a globally collision-free certificate.','Static male G17 preview only; no runtime release, female transfer or transition approval.',
                      'Finger arc parameters come from review 04; local knuckle calibration and the new attachment require visual review.']}
    Path(output).write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report['checks'],indent=2))


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('original',type=Path);p.add_argument('candidate',type=Path)
    p.add_argument('--original-binding',required=True,type=Path);p.add_argument('--candidate-binding',required=True,type=Path)
    p.add_argument('--pose',required=True,type=Path);p.add_argument('--output',required=True,type=Path);a=p.parse_args()
    check(a.original,a.candidate,a.original_binding,a.candidate_binding,a.pose,a.output)
