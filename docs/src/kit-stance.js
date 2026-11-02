import {Euler,Quaternion,Vector3} from 'three';
import KIT from '../assets/quaternius/stance-kit.json' with {type:'json'};
import {poseApprovedHand,approvedHandFrame,hasApprovedGrip} from './g17-grasp.js';
import {poseOneHandFingers,oneHandGrasp} from './one-hand-grasp.js';
import {attachPistol,PISTOL_SUPPORT_ROTATION} from './pistol-pose.js';
import {contactWrist,poseHand,poseThumb,supportHandRotation} from './weapon-hands.js';
import {fitArm,orientWorld} from './weapon-ik.js';

export const STANCE_KIT=KIT;
export function sampleKitStance(sex,kind,posture='aim',phase=.5){
 const clip=KIT.rigs[sex][kind][posture],frame=Math.max(0,Math.min(1,phase))*(clip.frames.length-1),a=Math.floor(frame),b=Math.min(a+1,clip.frames.length-1);
 return new Map(KIT.bones.map((name,i)=>[name,new Quaternion().fromArray(clip.frames[a],i*4).slerp(new Quaternion().fromArray(clip.frames[b],i*4),frame-a).normalize()]));
}
const GRIP=new Quaternion().setFromEuler(new Euler(-Math.PI/2,0,Math.PI/2));
const at=(e,n)=>e.model.getObjectByName(n).getWorldPosition(new Vector3());
function attach(e){
 const weapon=e.weapon;
 if(weapon.userData.pistol){attachPistol(e);return;}
 const profile=weapon.userData.oneHandPose;
 if(profile){
  const grasp=oneHandGrasp(e),wrist=e.model.getObjectByName('WristR');
  weapon.scale.setScalar(profile.scale/wrist.getWorldScale(new Vector3()).x);weapon.quaternion.fromArray(grasp.gripQuaternion);weapon.updateMatrixWorld(true);
  const offset=new Vector3(...grasp.rightPalm).multiplyScalar(profile.scale).applyQuaternion(weapon.getWorldQuaternion(new Quaternion()));
  weapon.position.copy(wrist.worldToLocal(at(e,'Middle2R').sub(offset)));
 }else{weapon.scale.setScalar(1);weapon.quaternion.copy(GRIP);weapon.position.copy(new Vector3(...(weapon.userData.grips?.right||[-.032,0,-.14]))).negate().applyQuaternion(GRIP);}
 weapon.updateMatrixWorld(true);
}
// Static candidate evaluator for native mesh comparison. This module is not
// imported by the game controller; transition/action integration is pending.
export function applyKitStance(e,{posture='aim',phase=.5}={}){
 if(!['pistol_9mm','ithaca_short'].includes(e.weapon?.userData.weaponType))throw Error('Only G17 and short Ithaca are reviewed kit candidates.');
 const weapon=e.weapon,pistol=Boolean(weapon.userData.pistol),short=Boolean(weapon.userData.oneHandPose),revolver=!pistol&&Boolean(weapon.userData.grips?.handgun),oneHand=short||revolver&&posture==='carry',kind=pistol?'pistol':short?'oneHand':revolver?'revolver':'longGun',approved=hasApprovedGrip(e);
 const crouchReady=posture==='carry'&&e.clip?.startsWith('Crouch'),clipPosture=crouchReady?'aim':posture,pose=sampleKitStance(e.modelSex,kind,clipPosture,phase);
 for(const[name,q]of pose)e.model.getObjectByName(name).quaternion.copy(q);
 e.root.updateMatrixWorld(true);
 if(pistol){if(approved){poseApprovedHand(e,'R');poseApprovedHand(e,'L');}else{poseHand(e,'R','pistol');poseHand(e,'L','pistol');}}
 else if(short)poseOneHandFingers(e);
 else{poseHand(e,'R','support');if(!oneHand)poseHand(e,'L',revolver?'revolver':weapon.userData.grips?.verticalSupport?'vertical':'support');}
 attach(e);
 const pitch=crouchReady?0:posture==='carry'?.75:posture==='hip'?.18:0,desired=e.root.getWorldQuaternion(new Quaternion()).multiply(new Quaternion().setFromEuler(new Euler(pitch,kind==='longGun'&&posture==='carry'&&!crouchReady?1:0,0,'YXZ'))),shoulder=e.model.getObjectByName('ShoulderR');
 if(posture!=='carry'||crouchReady||kind==='longGun')orientWorld(shoulder,desired.multiply(weapon.getWorldQuaternion(new Quaternion()).invert()).multiply(shoulder.getWorldQuaternion(new Quaternion())));
 e.root.updateMatrixWorld(true);
 const poles={right:at(e,'LowerArmR'),left:at(e,'LowerArmL')};let supportGap=0;
 if(!oneHand){
  const hand=weapon.getWorldQuaternion(new Quaternion()).multiply(pistol?(approved?approvedHandFrame(e,'L'):PISTOL_SUPPORT_ROTATION):supportHandRotation(weapon)),profile=weapon.userData.pistol;
  const anchor=()=>pistol?weapon.localToWorld(new Vector3(...profile.leftPalm)):weapon.localToWorld(new Vector3(...(weapon.userData.grips?.left||[.145,.03,.255])));
  const palm=pistol?anchor():null,target=pistol?contactWrist(e,'L',palm,hand):anchor(),rig=e.rifleHands,start=at(e,'UpperArmL'),reach=start.distanceTo(at(e,'LowerArmL'))+at(e,'LowerArmL').distanceTo(at(e,'WristL'))-.004,excess=Math.max(0,target.distanceTo(start)-reach);
  const fit=(side,goal,rotation,pole)=>{const arm=['UpperArm','LowerArm','Wrist'].map(n=>e.model.getObjectByName(n+side));fitArm(...arm,goal,pole,{hand:rotation,axis:at(e,'Middle2'+side).sub(at(e,'Wrist'+side)).applyQuaternion(arm[2].getWorldQuaternion(new Quaternion()).invert()).normalize(),rest:rig.get('Wrist'+side).rotation,lowerRest:rig.get('LowerArm'+side).rotation,hinge:rig.get('UpperArm'+side).hinge,preserveUpperSwing:side==='R',maxTwist:Math.PI/3,maxBend:Math.PI/3});orientWorld(arm[2],rotation);e.root.updateMatrixWorld(true);};
  if(excess>0){fit('R',at(e,'WristR').add(start.clone().sub(target).setLength(Math.min(.14,excess))),e.model.getObjectByName('WristR').getWorldQuaternion(new Quaternion()),poles.right);attach(e);if(pistol){palm.copy(anchor());target.copy(contactWrist(e,'L',palm,hand));}else target.copy(anchor());}
  fit('L',target,hand,poles.left);supportGap=pistol?at(e,'Middle2L').distanceTo(palm):at(e,'WristL').distanceTo(target);
 }
 if(pistol&&!approved){poseHand(e,'R','pistol');poseThumb(e,'L','pistol');}else if(!pistol&&!short){poseHand(e,'R','support');if(!oneHand)poseThumb(e,'L',revolver?'revolver':weapon.userData.grips?.verticalSupport?'vertical':'support');}
 e.weaponPoles=poles;
 return{kind,sourceClip:KIT.rigs[e.modelSex][kind][clipPosture].sourceClip,supportGap};
}
