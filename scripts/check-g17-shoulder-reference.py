"""Check the actual skinned model and preserve the approved grasp in review 10."""
import argparse
import hashlib
import importlib.util
import json
import re
from pathlib import Path
import numpy as np

spec=importlib.util.spec_from_file_location('grasp',Path(__file__).with_name('check-g17-approved-grip.py'))
grasp=importlib.util.module_from_spec(spec);spec.loader.exec_module(grasp)


def check(before_path,approved_path,after_path,before_binding,after_binding,pose_path,output):
    load=lambda p:json.loads(Path(p).read_text())
    old,ref,new,a,b,pose=map(load,[before_path,approved_path,after_path,before_binding,after_binding,pose_path])
    assert old['sex']==ref['sex']==new['sex']==pose['sex']=='male'
    assert pose['reviewVersion']==10
    assert hashlib.sha256(Path(pose['approvedGripPoseFile']).read_bytes()).hexdigest()==pose['approvedGripPoseSha256']
    metrics=new['contactMetrics']['shoulderReference']
    assert not metrics['geometryModified'] and not metrics['skinWeightsModified']
    for field in ['geometrySha256','positions','normals','indices','skinIndex','skinWeight','boneNames']:
        assert a[field]==b[field],field
    for name,q in old['boneRotations'].items():
        if name not in ['ShoulderR','UpperArmR','LowerArmR','WristR']:
            assert q==new['boneRotations'][name],name
    for name,q in ref['boneRotations'].items():
        if re.match(r'^(Index|Middle|Ring|Pinky|Thumb).*R$',name):
            assert q==new['boneRotations'][name],name
    hand_joint_delta=max(float(np.linalg.norm(np.array(new['localJoints'][name])-ref['localJoints'][name]))
                         for name in ref['localJoints'] if re.match(r'^(Wrist|Index|Middle|Ring|Pinky|Thumb).*R$',name))
    assert hand_joint_delta<1e-6,hand_joint_delta
    weights=np.asarray(b['skinWeight']).reshape(-1,4);indices=np.asarray(b['skinIndex']).reshape(-1,4)
    hand_bones=np.array([bool(re.match(r'^(Wrist|Index|Middle|Ring|Pinky|Thumb).*R$',n)) for n in b['boneNames']])
    hand_core=np.all(hand_bones[indices]|(weights<1e-7),axis=1)
    hand_error=seam_error=shoulder_displacement=0.;hand_count=0
    for mesh in new['meshes']:
        before=next(m for m in old['meshes'] if m['name']==mesh['name'])
        reference=next(m for m in ref['meshes'] if m['name']==mesh['name'])
        for key in ['faces','colors','faceSides','boneNames']:
            assert before[key]==mesh[key]==reference[key],key
        positions=np.asarray(mesh['positions']);normals=np.asarray(mesh['normals'])
        assert np.isfinite(positions).all() and np.isfinite(normals).all()
        assert np.max(abs(np.linalg.norm(normals,axis=1)-1))<1e-5
        if mesh['name']==b['meshName']:
            x=(positions-new['weaponOrigin'])@grasp.rotation(new['weaponQuaternion'])
            y=(np.asarray(reference['positions'])-ref['weaponOrigin'])@grasp.rotation(ref['weaponQuaternion'])
            delta=np.linalg.norm(x-y,axis=1)
            hand_error=float(delta[hand_core].max());hand_count=int(hand_core.sum())
            mixed=np.array([bool(re.match(r'^(Wrist|Index|Middle|Ring|Pinky|Thumb).*R$',n or '')) for n in mesh['boneNames']])&~hand_core
            seam_error=float(delta[mixed].max())
            shoulder=np.array([n=='ShoulderR' for n in mesh['boneNames']])
            shoulder_displacement=float(np.linalg.norm(positions-np.asarray(before['positions']),axis=1)[shoulder].max())
    assert hand_count>400 and hand_error<1e-6,(hand_count,hand_error)
    # The shoulder intentionally changes, unlike the rejected review-09 criterion.
    assert shoulder_displacement>.005,shoulder_displacement
    assert seam_error<.003,seam_error
    errors=[]
    for side in ['R','L']:
        chains=[['Shoulder'+side,'UpperArm'+side,'LowerArm'+side,'Wrist'+side]]
        chains += [[f+str(i)+side for i in range(1,4 if f=='Thumb' else 5)] for f in ['Thumb','Index','Middle','Ring','Pinky']]
        for chain in chains:
            for start,end in zip(chain,chain[1:]):
                length=lambda scene:np.linalg.norm(np.asarray(scene['joints'][start])-scene['joints'][end])
                errors.append(float(abs(length(old)-length(new))))
    assert max(errors)<1e-6,max(errors)
    assert metrics['fingerQuaternionMaxDifference']==0
    assert metrics['gunPositionError']<1e-6 and metrics['gunRotationErrorRadians']<1e-6
    right=metrics['sides']['R']
    assert right['wristBendDegrees']<=24.001
    assert abs(right['forearmTwistDegrees'])<=60.001 and abs(right['wristAxialTwistDegrees'])<=25
    report={'format':'sperrkreis-shoulder-reference-review','version':1,'reviewVersion':10,'status':'awaiting-visual-review',
            'poseSha256':hashlib.sha256(Path(pose_path).read_bytes()).hexdigest(),
            'checks':{'originalGeometryNormalsTopologyMaterialColoursAndSkinWeightsExactlyPreserved':True,
                      'firingFingerRotationsExactlyMatchApproved04':True,'supportGraspAndOtherBodyBoneRotationsExactlyPreserved':True,
                      'approvedRightHandWeaponLocalJointMaxDifferenceMetres':hand_joint_delta,
                      'approvedHandCoreVertexCount':hand_count,'approvedHandCoreSkinMaxDifferenceMetres':hand_error,
                      'mixedForearmHandSeamSkinMaxDifferenceMetres':seam_error,
                      'rightShoulderSkinMaxDisplacementMetres':shoulder_displacement,'maxSegmentLengthErrorMetres':max(errors),
                      'finiteSkinnedPositionsAndUnitNormals':True,'shoulderReference':metrics},
            'limits':['Static male G17 reference only; game, source assets, female transfer and animation transitions are outside this render.',
                      'The supplied photo defines the silhouette. Clothing in the photo hides precise bone centres.',
                      'Pure hand skin is preserved; mixed forearm/hand vertices deform as recorded. This is not a global collision-free certificate.']}
    Path(output).write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report['checks'],indent=2))


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('before');p.add_argument('approved');p.add_argument('after')
    for name in ['before-binding','after-binding','pose','output']:p.add_argument('--'+name,required=True)
    a=p.parse_args();check(a.before,a.approved,a.after,a.before_binding,a.after_binding,a.pose,a.output)
