// Offline pose composition: the approved hand is copied as a complete rigid
// grasp in weapon space. Shoulder, upper arm and skinning stay unchanged; the
// lower arm uses a bounded shortest swing. Body and aim have a modest yaw offset.
import {Quaternion,Vector3} from 'three';
import {contactWrist} from '../docs/src/weapon-hands.js';
import {orientWorld} from '../docs/src/weapon-ik.js';

const point=(e,n)=>e.model.getObjectByName(n).getWorldPosition(new Vector3());
const bone=(e,n)=>e.model.getObjectByName(n);
const fingers=/^(Index|Middle|Ring|Pinky|Thumb).*R$/;

function followSupport(entity,pose,reference,gunQ){
  const root=entity.root,gun=entity.weapon;
  for(const [name,q] of Object.entries(reference.leftBoneRotations))if(/^(Index|Middle|Ring|Pinky|Thumb).*L$/.test(name))bone(entity,name).quaternion.fromArray(q);
  const hand=gunQ.clone().multiply(new Quaternion().fromArray(reference.checks.supportContact.handFrame));
  const anchor=gun.localToWorld(new Vector3(...pose.palm)),goal=contactWrist(entity,'L',anchor,hand);
  const upper=bone(entity,'UpperArmL'),lower=bone(entity,'LowerArmL'),wrist=bone(entity,'WristL');
  const start=point(entity,'UpperArmL'),oldElbow=point(entity,'LowerArmL'),oldWrist=point(entity,'WristL');
  const a=start.distanceTo(oldElbow),b=oldElbow.distanceTo(oldWrist),d=start.distanceTo(goal);
  if(d>=a+b-.001||d<=Math.abs(a-b)+.001)throw Error('Approved grip is outside support-arm reach');
  const axis=goal.clone().sub(start).normalize(),radial=oldElbow.clone().sub(start);
  radial.addScaledVector(axis,-radial.dot(axis)).normalize();
  const along=(a*a-b*b+d*d)/(2*d),height=Math.sqrt(Math.max(0,a*a-along*along));
  const elbow=start.clone().addScaledVector(axis,along).addScaledVector(radial,height);
  const upperSwing=new Quaternion().setFromUnitVectors(oldElbow.clone().sub(start).normalize(),elbow.clone().sub(start).normalize());
  orientWorld(upper,upperSwing.clone().multiply(upper.getWorldQuaternion(new Quaternion())));root.updateMatrixWorld(true);
  const current=point(entity,'WristL').sub(point(entity,'LowerArmL')).normalize(),desired=goal.clone().sub(point(entity,'LowerArmL')).normalize();
  const lowerSwing=new Quaternion().setFromUnitVectors(current,desired);
  orientWorld(lower,lowerSwing.clone().multiply(lower.getWorldQuaternion(new Quaternion())));orientWorld(wrist,hand);root.updateMatrixWorld(true);
  return{upperSwingDegrees:upperSwing.angleTo(new Quaternion())*180/Math.PI,lowerSwingDegrees:lowerSwing.angleTo(new Quaternion())*180/Math.PI};
}

export function attachApprovedGrip(entity,rightPose,rightReference,leftPose,leftReference,options){
  const root=entity.root,gun=entity.weapon,lower=bone(entity,'LowerArmR'),wrist=bone(entity,'WristR');
  root.updateMatrixWorld(true);
  const protectedNames=['Torso','Chest','Head','ShoulderR','UpperArmR','ShoulderL'];
  const protectedRotations=new Map(protectedNames.map(n=>[n,bone(entity,n).quaternion.clone()]));
  if(!Number.isFinite(options.weaponYawDegrees)||Math.abs(options.weaponYawDegrees)>20)throw Error('Body/aim yaw offset exceeds the authored bound');
  const originalGun=gun.getWorldPosition(new Vector3()),parent=gun.parent;
  const yaw=new Quaternion().setFromAxisAngle(new Vector3(0,1,0).transformDirection(root.matrixWorld),options.weaponYawDegrees*Math.PI/180);
  const gunQ=yaw.multiply(gun.getWorldQuaternion(new Quaternion()).normalize());
  root.attach(gun);root.updateMatrixWorld(true);
  orientWorld(gun,gunQ);root.updateMatrixWorld(true);

  // No curl reconstruction, knuckle targeting or new thumb guides: copy every
  // approved local finger rotation, then restore the approved wrist/prop frame.
  for(const [name,q] of Object.entries(rightReference.rightBoneRotations))if(fingers.test(name))bone(entity,name).quaternion.fromArray(q);
  const hand=gunQ.clone().multiply(new Quaternion().fromArray(rightReference.handFrame).normalize());
  const lowerTarget=new Vector3(...options.rightLowerArmDirection).transformDirection(root.matrixWorld);
  const forearm=point(entity,'WristR').sub(point(entity,'LowerArmR')).normalize();
  const lowerSwing=new Quaternion().setFromUnitVectors(forearm,lowerTarget);
  if(lowerSwing.angleTo(new Quaternion())>options.maxLowerSwingDegrees*Math.PI/180)throw Error('Right lower-arm swing exceeds the authored bound');
  orientWorld(lower,lowerSwing.clone().multiply(lower.getWorldQuaternion(new Quaternion())));
  orientWorld(wrist,hand);root.updateMatrixWorld(true);

  // Move the prop with the whole approved grasp; never change the hand to meet
  // a fixed prop origin. Its barrel stays level; its yaw differs from the body.
  const offset=new Vector3(...rightPose.palm).multiply(gun.getWorldScale(new Vector3())).applyQuaternion(gunQ);
  gun.position.copy(root.worldToLocal(point(entity,'Middle2R').sub(offset)));root.updateMatrixWorld(true);
  const support=followSupport(entity,leftPose,leftReference,gunQ);
  parent.attach(gun);root.updateMatrixWorld(true);

  let protectedError=0,fingerError=0;
  for(const [name,q] of protectedRotations)for(const key of ['x','y','z','w'])protectedError=Math.max(protectedError,Math.abs(bone(entity,name).quaternion[key]-q[key]));
  for(const [name,q] of Object.entries(rightReference.rightBoneRotations))if(fingers.test(name))for(let i=0;i<4;i++)fingerError=Math.max(fingerError,Math.abs(bone(entity,name).quaternion.toArray()[i]-q[i]));
  const handError=gun.getWorldQuaternion(new Quaternion()).normalize().invert().multiply(wrist.getWorldQuaternion(new Quaternion()).normalize()).normalize().angleTo(new Quaternion().fromArray(rightReference.handFrame).normalize());
  const contactError=(side,pose)=>point(entity,'Middle2'+side).distanceTo(gun.localToWorld(new Vector3(...pose.palm)));
  const rightError=contactError('R',rightPose),leftError=contactError('L',leftPose);
  if(protectedError!==0||fingerError!==0||handError>1e-6||rightError>1e-6||leftError>1e-6)throw Error('Approved hand composition changed a protected reference: '+JSON.stringify({protectedError,fingerError,handError,rightError,leftError}));
  const bend=side=>point(entity,'Wrist'+side).sub(point(entity,'LowerArm'+side)).angleTo(point(entity,'Middle2'+side).sub(point(entity,'Wrist'+side)))*180/Math.PI;
  return{mode:'approved-grip-attachment',protectedBones:protectedNames,protectedQuaternionMaxDifference:protectedError,
    approvedRightFingerQuaternionMaxDifference:fingerError,approvedHandFrameErrorRadians:handError,
    rightPalmError:rightError,leftPalmError:leftError,rightWristBendDegrees:bend('R'),leftWristBendDegrees:bend('L'),
    rightUpperArmSwingDegrees:0,rightLowerArmSwingDegrees:lowerSwing.angleTo(new Quaternion())*180/Math.PI,
    weaponYawDegrees:options.weaponYawDegrees,additionalRightUpperArmAxialRollDegrees:0,support,
    gunTranslationMetres:gun.getWorldPosition(new Vector3()).sub(originalGun).toArray(),skinWeightsModified:false};
}
