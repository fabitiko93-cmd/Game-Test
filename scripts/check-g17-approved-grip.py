"""Check rendered skin, approved grasp and protected shoulder, not just curl inputs."""
import argparse
import hashlib
import importlib.util
import json
import re
from pathlib import Path
import numpy as np


def rotation(q):
    x,y,z,w=np.asarray(q)/np.linalg.norm(q)
    return np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],
                     [2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],
                     [2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]])


def check(original_path,reference_path,candidate_path,original_binding_path,reference_binding_path,candidate_binding_path,pose_path,output):
    load=lambda p:json.loads(Path(p).read_text())
    old,ref,new,old_bind,ref_bind,binding,pose=map(load,[original_path,reference_path,candidate_path,original_binding_path,reference_binding_path,candidate_binding_path,pose_path])
    metrics=new['contactMetrics']['approvedGripAttachment'];options=pose['approvedGripAttachment']
    approved=load(pose['firingHandReference']['reviewFile'])
    assert old['sex']==ref['sex']==new['sex']==pose['sex']=='male'
    assert new['authoredLeft']==pose and approved['status']=='visually-approved'
    assert not any(k in pose for k in ['armAlignment','shoulderSkin','handLocalAttachment'])
    assert not metrics['skinWeightsModified']
    for field in ['geometrySha256','positions','normals','indices','skinIndex','skinWeight','boneNames']:
        assert old_bind[field]==binding[field]==ref_bind[field],field
    for name in metrics['protectedBones']:assert old['boneRotations'][name]==new['boneRotations'][name],name
    assert metrics['protectedQuaternionMaxDifference']==metrics['additionalRightUpperArmAxialRollDegrees']==0
    finger_pattern=r'^(Index|Middle|Ring|Pinky|Thumb).*R$'
    for name,q in approved['rightBoneRotations'].items():
        if re.match(finger_pattern,name):assert ref['boneRotations'][name]==new['boneRotations'][name]==q,name
    assert metrics['approvedRightFingerQuaternionMaxDifference']==0 and metrics['approvedHandFrameErrorRadians']<1e-6
    joint_delta=max(float(np.linalg.norm(np.array(new['localJoints'][name])-ref['localJoints'][name]))
                    for name in ref['localJoints'] if re.match(r'^(Wrist|Index|Middle|Ring|Pinky|Thumb).*R$',name))
    assert joint_delta<2e-7,joint_delta

    # Pure hand skin must reproduce review 04. Mixed forearm/hand weights at the
    # seam are measured separately; no weights are changed to hide the seam.
    indices=np.asarray(binding['skinIndex']).reshape(-1,4);weights=np.asarray(binding['skinWeight']).reshape(-1,4)
    hand_bones=np.array([bool(re.match(r'^(Wrist|Index|Middle|Ring|Pinky|Thumb).*R$',name)) for name in binding['boneNames']])
    core=np.all(hand_bones[indices]|(weights<1e-7),axis=1)
    shoulder_delta=upper_delta=hand_delta=seam_delta=0.;core_count=0
    for mesh in new['meshes']:
        before=next(m for m in old['meshes'] if m['name']==mesh['name']);approved_mesh=next(m for m in ref['meshes'] if m['name']==mesh['name'])
        assert before['faces']==mesh['faces']==approved_mesh['faces']
        assert before['colors']==mesh['colors']==approved_mesh['colors']
        positions=np.asarray(mesh['positions']);normals=np.asarray(mesh['normals'])
        assert np.isfinite(positions).all() and np.isfinite(normals).all()
        assert np.max(np.abs(np.linalg.norm(normals,axis=1)-1))<1e-5
        delta=np.linalg.norm(positions-before['positions'],axis=1)
        for name in ['ShoulderR','UpperArmR']:
            mask=np.array([n==name for n in mesh['boneNames']])
            if mask.any():
                if name=='ShoulderR':shoulder_delta=max(shoulder_delta,float(delta[mask].max()))
                else:upper_delta=max(upper_delta,float(delta[mask].max()))
        if mesh['name']==binding['meshName']:
            a=(positions-new['weaponOrigin'])@rotation(new['weaponQuaternion'])
            b=(np.asarray(approved_mesh['positions'])-ref['weaponOrigin'])@rotation(ref['weaponQuaternion'])
            d=np.linalg.norm(a-b,axis=1);hand_delta=float(d[core].max());core_count=int(core.sum())
            mixed=np.array([bool(re.match(r'^(Wrist|Index|Middle|Ring|Pinky|Thumb).*R$',n or '')) for n in mesh['boneNames']])&~core
            seam_delta=float(d[mixed].max()) if mixed.any() else 0.
    assert shoulder_delta==0,shoulder_delta
    assert core_count>400 and hand_delta<1e-6,(core_count,hand_delta)
    assert seam_delta<.0021,seam_delta
    length_errors=[]
    for side in ['R','L']:
        chains=[['Shoulder'+side,'UpperArm'+side,'LowerArm'+side,'Wrist'+side]]
        chains += [[f+str(i)+side for i in range(1,4 if f=='Thumb' else 5)] for f in ['Thumb','Index','Middle','Ring','Pinky']]
        for chain in chains:
            for a,b in zip(chain,chain[1:]):
                distance=lambda scene:np.linalg.norm(np.asarray(scene['joints'][a])-scene['joints'][b])
                length_errors.append(float(abs(distance(old)-distance(new))))
    assert max(length_errors)<1e-6
    for name,q in new['boneRotations'].items():assert abs(np.linalg.norm(q)-1)<1e-5,name
    assert abs(metrics['rightWristBendDegrees']-options['rightWristBendDegrees'])<.001
    assert metrics['leftWristBendDegrees']<25 and metrics['rightLowerArmSwingDegrees']<options['maxLowerSwingDegrees']
    assert metrics['rightPalmError']<1e-6 and metrics['leftPalmError']<1e-6
    assert abs(metrics['gunTranslationMetres'][1])<options['maxWeaponHeightChangeMetres']
    barrel=rotation(new['weaponQuaternion'])@np.array([0.,0.,1.]);assert abs(barrel[1])<1e-6

    spec=importlib.util.spec_from_file_location('contact',Path(__file__).with_name('analyze-g17-contact.py'))
    contact=importlib.util.module_from_spec(spec);spec.loader.exec_module(contact)
    groups={}
    for side in ['R','L']:
        for finger in ['Index','Middle','Ring','Pinky','Thumb']:
            triangles=[];ids=[];pattern='^'+finger+('[23]' if finger=='Thumb' else '[234]')+side+'$'
            for mi,mesh in enumerate(new['meshes']):
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
        assert value==0,(a,b,value);crossings[a+'/'+b]=value
    for path,expected in [(pose['firingHandReference']['poseFile'],pose['firingHandReference']['poseSha256']),
                          (pose['firingHandReference']['reviewFile'],options['rightReviewSha256']),
                          (options['supportReviewFile'],options['supportReviewSha256'])]:
        assert hashlib.sha256(Path(path).read_bytes()).hexdigest()==expected,path
    report={'format':'sperrkreis-approved-grip-review','version':1,'reviewVersion':pose['reviewVersion'],'status':pose['status'],
        'poseSha256':hashlib.sha256(Path(pose_path).read_bytes()).hexdigest(),
        'checks':{'approvedRightFingerLocalRotationsExactlyPreserved':True,'approvedRightHandWeaponLocalJointMaxDifferenceMetres':joint_delta,
                  'approvedHandCoreSkinMaxDifferenceMetres':hand_delta,'approvedHandCoreVertexCount':core_count,
                  'mixedForearmHandSeamSkinMaxDifferenceMetres':seam_delta,'originalRightShoulderSkinMaxDifferenceMetres':shoulder_delta,
                  'distalUpperArmSkinChangeNearElbowMetres':upper_delta,'protectedOriginalBoneRotationsExactlyPreserved':metrics['protectedBones'],
                  'originalGeometryNormalsTopologyAndSkinWeightsExactlyPreserved':True,'maxSegmentLengthErrorMetres':max(length_errors),
                  'finiteSkinAndUnitNormalsAndQuaternions':True,'levelBarrel':True,'adjacentFingerAndThumbCrossingPairs':crossings,'attachment':metrics},
        'limits':['Static male G17 only. Full-pose visual approval, female transfer and animation transitions remain pending.',
                  'A 17.3-degree body/weapon yaw offset is deliberate; the forearm moves by less than 10 degrees.',
                  'The approved finger and wrist/weapon transforms are preserved. Mixed forearm weights produce a measured skin change below 2.1 mm at the seam.',
                  'Selected finger collision pairs do not certify the entire character globally collision-free. No runtime or asset changes.']}
    Path(output).write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report['checks'],indent=2))


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('original',type=Path);p.add_argument('reference',type=Path);p.add_argument('candidate',type=Path)
    for n in ['original-binding','reference-binding','candidate-binding','pose','output']:p.add_argument('--'+n,required=True,type=Path)
    a=p.parse_args();check(a.original,a.reference,a.candidate,a.original_binding,a.reference_binding,a.candidate_binding,a.pose,a.output)
