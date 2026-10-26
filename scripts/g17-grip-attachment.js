// Hand-local authoring. The original firing arm is a read-only reference;
// the prop follows its middle knuckle instead of pulling the arm toward it.
import {Matrix4,Quaternion,Vector3} from 'three';
import {contactWrist} from '../docs/src/weapon-hands.js';
import {orientWorld} from '../docs/src/weapon-ik.js';

const v=()=>new Vector3(),rad=n=>n*Math.PI/180;
const point=(e,n)=>e.model.getObjectByName(n).getWorldPosition(v());
const bone=(e,n)=>e.model.getObjectByName(n);

export function attachAuthoredGrip(entity,right,left,leftReference){
  const root=entity.root,gun=entity.weapon,rig=entity.rifleHands;
  root.updateMatrixWorld(true);
  const protectedNames=['Torso','Chest','Head','ShoulderR','UpperArmR','LowerArmR','WristR','ShoulderL'];
  const protectedRotations=new Map(protectedNames.map(n=>[n,bone(entity,n).quaternion.clone()]));
  const originalGun=gun.getWorldPosition(v()),gunQ=gun.getWorldQuaternion(new Quaternion()).normalize(),gunScale=gun.getWorldScale(v()),parent=gun.parent;
  const gunX=new Vector3(1,0,0).applyQuaternion(gunQ),gunY=new Vector3(0,1,0).applyQuaternion(gunQ),gunZ=new Vector3(0,0,1).applyQuaternion(gunQ);
  root.attach(gun);root.updateMatrixWorld(true);
  for(const [name,entry] of rig)if(/^(Index|Middle|Ring|Pinky|Thumb).*R$/.test(name))entry.bone.quaternion.copy(entry.rotation);
  root.updateMatrixWorld(true);
  const palm=point(entity,'Middle2R'),offset=new Vector3(...right.palm).multiply(gunScale).applyQuaternion(gunQ);
  gun.position.copy(root.worldToLocal(palm.clone().sub(offset)));root.updateMatrixWorld(true);

  // Only the child finger joints are posed. No right-arm IK, no shoulder fit,
  // no upper-arm hinge alignment and no skin-weight correction run here.
  for(const finger of ['Index','Middle','Ring','Pinky']){
    const meta=bone(entity,finger+'1R'),spread=right.spread?.[finger]||[0,0,0];
    const turn=new Quaternion().setFromAxisAngle(gunZ,rad(spread[2])).multiply(new Quaternion().setFromAxisAngle(gunY,rad(spread[1]))).multiply(new Quaternion().setFromAxisAngle(gunX,rad(spread[0])));
    orientWorld(meta,turn.multiply(meta.getWorldQuaternion(new Quaternion())));
    if(right.knuckleTargets?.[finger]){
      const start=point(entity,meta.name),from=point(entity,finger+'2R').sub(start).normalize(),to=gun.localToWorld(new Vector3(...right.knuckleTargets[finger])).sub(start).normalize();
      orientWorld(meta,new Quaternion().setFromUnitVectors(from,to).multiply(meta.getWorldQuaternion(new Quaternion())));root.updateMatrixWorld(true);
    }
    const correction=right.knuckleRotations?.[finger];
    if(correction){
      const q=new Quaternion().setFromAxisAngle(gunZ,rad(correction[2])).multiply(new Quaternion().setFromAxisAngle(gunY,rad(correction[1]))).multiply(new Quaternion().setFromAxisAngle(gunX,rad(correction[0])));
      orientWorld(meta,q.multiply(meta.getWorldQuaternion(new Quaternion())));root.updateMatrixWorld(true);
    }
    for(let i=2;i<=4;i++){
      const angle=rad(right.curls[finger].slice(0,i-1).reduce((a,b)=>a+b,0));
      const x=gunY.clone().negate(),y=gunX.clone().multiplyScalar(Math.sin(angle)).addScaledVector(gunZ,Math.cos(angle)),z=x.clone().cross(y);
      orientWorld(bone(entity,finger+i+'R'),new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(x,y,z)));
      root.updateMatrixWorld(true);
    }
  }
  for(let i=1;i<=3;i++){
    const thumb=bone(entity,'Thumb'+i+'R'),here=point(entity,thumb.name),wanted=gun.localToWorld(new Vector3(...right.thumb[i-1])).sub(here).normalize();
    const from=i<3?point(entity,'Thumb'+(i+1)+'R').sub(here).normalize():new Vector3(0,1,0).applyQuaternion(thumb.getWorldQuaternion(new Quaternion()));
    orientWorld(thumb,new Quaternion().setFromUnitVectors(from,wanted).multiply(thumb.getWorldQuaternion(new Quaternion())));root.updateMatrixWorld(true);
  }

  // The support grasp is reused in prop space. Its upper arm is transported by
  // the shortest swing from the original pose, never twisted to a new hinge.
  for(const [name,q] of Object.entries(leftReference.leftBoneRotations))if(/^(Index|Middle|Ring|Pinky|Thumb).*L$/.test(name))bone(entity,name).quaternion.fromArray(q);
  const hand=gunQ.clone().multiply(new Quaternion().fromArray(leftReference.checks.supportContact.handFrame));
  const anchor=gun.localToWorld(new Vector3(...left.palm)),goal=contactWrist(entity,'L',anchor,hand);
  const upper=bone(entity,'UpperArmL'),lower=bone(entity,'LowerArmL'),wrist=bone(entity,'WristL');
  const start=point(entity,'UpperArmL'),oldElbow=point(entity,'LowerArmL'),oldWrist=point(entity,'WristL');
  const a=start.distanceTo(oldElbow),b=oldElbow.distanceTo(oldWrist),d=start.distanceTo(goal);
  if(d>=a+b-.001||d<=Math.abs(a-b)+.001)throw Error('Support contact is unreachable without changing the protected firing arm');
  const axis=goal.clone().sub(start).normalize(),radial=oldElbow.clone().sub(start);radial.addScaledVector(axis,-radial.dot(axis)).normalize();
  const along=(a*a-b*b+d*d)/(2*d),height=Math.sqrt(Math.max(0,a*a-along*along)),elbow=start.clone().addScaledVector(axis,along).addScaledVector(radial,height);
  const upperSwing=new Quaternion().setFromUnitVectors(oldElbow.clone().sub(start).normalize(),elbow.clone().sub(start).normalize());
  orientWorld(upper,upperSwing.clone().multiply(upper.getWorldQuaternion(new Quaternion())));root.updateMatrixWorld(true);
  const current=point(entity,'WristL').sub(point(entity,'LowerArmL')).normalize(),desired=goal.clone().sub(point(entity,'LowerArmL')).normalize();
  const lowerSwing=new Quaternion().setFromUnitVectors(current,desired);
  orientWorld(lower,lowerSwing.clone().multiply(lower.getWorldQuaternion(new Quaternion())));orientWorld(wrist,hand);root.updateMatrixWorld(true);
  parent.attach(gun);root.updateMatrixWorld(true);
  let protectedError=0;
  for(const [n,q] of protectedRotations)for(const k of ['x','y','z','w'])protectedError=Math.max(protectedError,Math.abs(bone(entity,n).quaternion[k]-q[k]));
  const rightError=point(entity,'Middle2R').distanceTo(gun.localToWorld(new Vector3(...right.palm))),leftError=point(entity,'Middle2L').distanceTo(gun.localToWorld(new Vector3(...left.palm)));
  if(protectedError!==0||rightError>1e-6||leftError>1e-6)throw Error('Hand-local attachment modified its protected reference or lost a contact');
  const bend=side=>point(entity,'Wrist'+side).sub(point(entity,'LowerArm'+side)).angleTo(point(entity,'Middle2'+side).sub(point(entity,'Wrist'+side)))*180/Math.PI;
  return{mode:'hand-local-attachment',protectedBones:protectedNames,protectedQuaternionMaxDifference:protectedError,
    rightPalmError:rightError,leftPalmError:leftError,gunTranslationMetres:gun.getWorldPosition(v()).sub(originalGun).toArray(),
    rightWristBendDegrees:bend('R'),leftWristBendDegrees:bend('L'),supportUpperSwingDegrees:upperSwing.angleTo(new Quaternion())*180/Math.PI,
    supportLowerSwingDegrees:lowerSwing.angleTo(new Quaternion())*180/Math.PI,skinWeightsModified:false};
}
