import {Quaternion,Vector3} from 'three';
import GRASP from '../assets/weapons/g17-grasp.json' with {type:'json'};
import {contactWrist} from './weapon-hands.js';
import {orientWorld} from './weapon-ik.js';

// Review 10 is the authored G17 reference. Animation targets stay live; these
// values describe the grasp and rig frame, never an entire frozen animation.
export const G17_GRASP=GRASP;
const calibrated=Object.fromEntries(Object.entries(GRASP.rigs).map(([sex,rig])=>[sex,{
  frames:Object.fromEntries(Object.entries(rig.handFrames).map(([side,q])=>[side,new Quaternion().fromArray(q).normalize()])),
  upperFrame:new Quaternion().fromArray(rig.upperFrame).normalize(),
  fingers:Object.entries(rig.fingers).map(([name,q])=>[name,new Quaternion().fromArray(q)])
}]));
export const hasApprovedGrip=e=>e.weapon?.userData.weaponType==='pistol_9mm';
export const approvedHandFrame=(e,side)=>calibrated[e.modelSex].frames[side].clone();
export function approvedUpperRest(entity){
  const upper=entity.model.getObjectByName('UpperArmR'),parent=upper.parent.getWorldQuaternion(new Quaternion()).normalize();
  const neutral=parent.clone().multiply(entity.handgunCarry.get(upper));
  const target=entity.root.getWorldQuaternion(new Quaternion()).multiply(calibrated[entity.modelSex].upperFrame);
  return parent.invert().multiply(neutral.slerp(target,entity.pistolReferenceWeight??1));
}
export function poseApprovedHand(entity,side,weight=1){
  for(const [name,q]of calibrated[entity.modelSex].fingers)if(name.endsWith(side)){
    const b=entity.rifleHands.get(name).bone;
    if(weight>=1)b.quaternion.copy(q);else b.quaternion.slerp(q,Math.max(0,weight));
  }
  entity.root.updateMatrixWorld(true);
}
export function approvedAimOrigin(entity,rotation){
  const root=entity.root,p=root.worldToLocal(entity.model.getObjectByName('Head').getWorldPosition(new Vector3()));
  const origin=root.localToWorld(p.add(new Vector3(...GRASP.aimHeadOffset)));
  const forward=new Vector3(0,0,1).applyQuaternion(rotation),profile=entity.weapon.userData.pistol;
  let shift=Infinity,left;
  for(const side of ['R','L']){
    const at=name=>entity.model.getObjectByName(name+side).getWorldPosition(new Vector3());
    const start=at('UpperArm'),a=at('LowerArm').distanceTo(start),b=at('Wrist').distanceTo(at('LowerArm'));
    const hand=rotation.clone().multiply(approvedHandFrame(entity,side));
    const palm=origin.clone().add(new Vector3(...profile[side==='R'?'rightPalm':'leftPalm']).multiplyScalar(profile.scale).applyQuaternion(rotation));
    const offset=contactWrist(entity,side,palm,hand).sub(start),along=offset.dot(forward),across=offset.lengthSq()-along*along;
    if(side==='R'){
      const reach=Math.sqrt(a*a+b*b+2*a*b*Math.cos(GRASP.elbowFlex));
      shift=-along+Math.sqrt(Math.max(0,reach*reach-across));
    }else left={offset,start,reach:a+b-.005};
  }
  // A walking/crouching torso changes the distance to the support shoulder.
  // Advance that clavicle only as far as needed instead of shortening the
  // firing arm or leaving the second palm outside its arm's reach.
  const shoulder=entity.model.getObjectByName('ShoulderL'),original=shoulder.getWorldQuaternion(new Quaternion());
  const goal=left.start.clone().add(left.offset).addScaledVector(forward,shift),axis=new Vector3(0,1,0).transformDirection(root.matrixWorld);
  const reachAt=angle=>{
    orientWorld(shoulder,new Quaternion().setFromAxisAngle(axis,-angle).multiply(original));root.updateMatrixWorld(true);
    return entity.model.getObjectByName('UpperArmL').getWorldPosition(new Vector3()).distanceTo(goal);
  };
  let angle=0;
  if(reachAt(0)>left.reach){
    const maximum=Math.PI/4;angle=maximum;
    if(reachAt(maximum)<=left.reach){let low=0,high=maximum;for(let i=0;i<8;i++){const middle=(low+high)/2;if(reachAt(middle)<=left.reach)high=middle;else low=middle;}angle=high;}
  }
  angle*=entity.rifleBlend.aim+entity.rifleBlend.hip;
  const previous=entity.pistolSupportReachAngle,delta=entity.pistolStep;
  if(previous!==undefined&&previous!==null&&delta<.5&&!entity.animationDirectEdit)angle=previous+Math.max(-delta*3,Math.min(delta*3,angle-previous));
  entity.pistolSupportReachAngle=angle;reachAt(angle);entity.pistolSupportShoulder=shoulder.quaternion.clone();
  left.start=entity.model.getObjectByName('UpperArmL').getWorldPosition(new Vector3());
  const offset=goal.clone().sub(left.start),along=offset.dot(forward),across=offset.lengthSq()-along*along;
  const retreat=Math.min(0,-along+Math.sqrt(Math.max(0,left.reach*left.reach-across)));
  return origin.addScaledVector(forward,shift+retreat);
}
export function approvedElbowPole(entity,side){
  const root=entity.root,p=root.worldToLocal(entity.model.getObjectByName('UpperArm'+side).getWorldPosition(new Vector3()));
  return root.localToWorld(p.add(new Vector3(...GRASP[side==='R'?'aimRightPoleOffset':'aimLeftPoleOffset'])));
}
