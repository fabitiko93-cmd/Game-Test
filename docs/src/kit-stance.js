import {Euler,Quaternion,Vector3} from 'three';
import KIT from '../assets/quaternius/stance-kit.json' with {type:'json'};
import {poseApprovedHand,approvedHandFrame,hasApprovedGrip} from './g17-grasp.js';
import {poseOneHandFingers,poseOneHandThumb,oneHandGrasp} from './one-hand-grasp.js';
import {attachPistol,PISTOL_SUPPORT_ROTATION,fitPistolSupportContact} from './pistol-pose.js';
import {contactWrist,poseHand,poseThumb,supportHandRotation} from './weapon-hands.js';
import {fitArm,orientWorld} from './weapon-ik.js';
import {editTarget,editBone} from './animation-targets.js';
import {fitAuthoredElbow,hasElbowEdit} from './elbow-pose.js';
import {guideSupportMotion} from './weapon-motion.js';
import {armObstacles,outsideBody,routeSupportWrist} from './arm-clearance.js';

export const STANCE_KIT=KIT;
export function sampleKitStance(sex,kind,posture='aim',phase=.5){
 const clip=KIT.rigs[sex][kind][posture],frame=Math.max(0,Math.min(1,phase))*(clip.frames.length-1),a=Math.floor(frame),b=Math.min(a+1,clip.frames.length-1);
 return new Map(KIT.bones.map((name,i)=>[name,new Quaternion().fromArray(clip.frames[a],i*4).slerp(new Quaternion().fromArray(clip.frames[b],i*4),frame-a).normalize()]));
}
const GRIP=new Quaternion().setFromEuler(new Euler(-Math.PI/2,0,Math.PI/2));
const at=(e,n)=>e.model.getObjectByName(n).getWorldPosition(new Vector3());
export function kitPoseBones(e){return [...new Set(['Hips',...KIT.bones,...e.rifleHands.keys()].map(n=>e.model.getObjectByName(n)))];}
function attach(e){
 const weapon=e.weapon;if(weapon.userData.pistol){attachPistol(e);return;}
 const profile=weapon.userData.oneHandPose;
 if(profile){
  const grasp=oneHandGrasp(e),wrist=e.model.getObjectByName('WristR');
  weapon.scale.setScalar(profile.scale/wrist.getWorldScale(new Vector3()).x);weapon.quaternion.fromArray(grasp.gripQuaternion);weapon.updateMatrixWorld(true);
  const offset=new Vector3(...grasp.rightPalm).multiplyScalar(profile.scale).applyQuaternion(weapon.getWorldQuaternion(new Quaternion()));
  weapon.position.copy(wrist.worldToLocal(at(e,'Middle2R').sub(offset)));
 }else{weapon.scale.setScalar(1);weapon.quaternion.copy(GRIP);weapon.position.copy(new Vector3(...(weapon.userData.grips?.right||[-.032,0,-.14]))).negate().applyQuaternion(GRIP);}
 weapon.updateMatrixWorld(true);
}
function fit(e,side,target,hand,pole,{preserve=side==='R',maxBend=75,authored=true}={}){
 const rig=e.rifleHands,arm=['UpperArm','LowerArm','Wrist'].map(n=>e.model.getObjectByName(n+side));
 const frame={hand,axis:at(e,'Middle2'+side).sub(at(e,'Wrist'+side)).applyQuaternion(arm[2].getWorldQuaternion(new Quaternion()).invert()).normalize(),rest:rig.get('Wrist'+side).rotation,lowerRest:rig.get('LowerArm'+side).rotation,hinge:rig.get('UpperArm'+side).hinge,preserveUpperSwing:preserve,maxTwist:59*Math.PI/180,maxBend:maxBend*Math.PI/180};
 fitArm(...arm,target,pole,frame);orientWorld(arm[2],hand);e.root.updateMatrixWorld(true);
 if(authored&&hasElbowEdit(e,side))fitAuthoredElbow(e,side,arm,at(e,'Wrist'+side),pole,frame,{maxBend:75});
}
// The original locomotion owns Body and both legs. Hips is the separate spine
// root: cancel the old clip's Body rotation here, rather than adding it to the
// authored kit. Idle_Gun_Pointing otherwise adds a second 27-degree body yaw.
export function applyKitStance(e,{posture='aim',phase=.5,prepare=null,delta=null,trigger=0,supportWeight=null}={}){
 e.rifleRestore||=new Map(kitPoseBones(e).map(b=>[b,b.quaternion.clone()]));
 const weapon=e.weapon,pistol=Boolean(weapon.userData.pistol),short=Boolean(weapon.userData.oneHandPose),revolver=!pistol&&Boolean(weapon.userData.grips?.handgun),weight=Math.max(supportWeight??(revolver&&posture==='carry'?0:1),Math.max(0,e.animationEdits?.contactL?.[0]||0)),oneHand=short||revolver&&weight<=0,kind=pistol?'pistol':short?'oneHand':revolver?'revolver':'longGun',approved=hasApprovedGrip(e);
 const crouchReady=posture==='carry'&&e.clip?.startsWith('Crouch'),clipPosture=crouchReady&&!revolver?'aim':posture,pose=sampleKitStance(e.modelSex,kind,clipPosture,revolver&&clipPosture==='carry'?.2:phase);
 const pelvis=e.animationEdits?.pelvis?.slice(3)||[0,0,0];
 orientWorld(e.model.getObjectByName('Hips'),e.model.getWorldQuaternion(new Quaternion()).multiply(new Quaternion().setFromEuler(new Euler(...pelvis.map(n=>n*Math.PI/180),'YXZ'))).multiply(e.rifleHands.hipFrame));
 // Keep the free carry reference during the entire support-grip release,
 // including the last frame when the support weight reaches zero.
 for(const[name,q]of pose)if(!(revolver&&clipPosture==='carry'&&name.endsWith('L'))){const bone=e.model.getObjectByName(name);bone.quaternion.copy(revolver&&clipPosture==='carry'?e.handgunCarry?.get(bone)||q:q);}
 e.root.updateMatrixWorld(true);
 if(pistol){if(approved){poseApprovedHand(e,'R');poseApprovedHand(e,'L',weight);}else{poseHand(e,'R','pistol',{trigger});poseHand(e,'L','pistol',{weight});}}
 else if(short)poseOneHandFingers(e,trigger);
 else{poseHand(e,'R','support',{trigger});if(!oneHand)poseHand(e,'L',revolver?'revolver':weapon.userData.grips?.verticalSupport?'vertical':'support',{weight});}
 attach(e);
 const pitch=crouchReady&&!revolver?0:posture==='carry'?.75:posture==='hip'?.18:0,desired=e.root.getWorldQuaternion(new Quaternion()).multiply(new Quaternion().setFromEuler(new Euler(pitch,kind==='longGun'&&posture==='carry'&&!crouchReady?1:0,0,'YXZ'))),shoulder=e.model.getObjectByName('ShoulderR');
 if(posture!=='carry'||crouchReady||kind==='longGun')orientWorld(shoulder,desired.multiply(weapon.getWorldQuaternion(new Quaternion()).invert()).multiply(shoulder.getWorldQuaternion(new Quaternion())));
 // Different donor roll axes must not become a twisted target wrist. This
 // retarget keeps all joint points and the hand frame exactly where authored.
 // The native relaxed revolver already has the target rig's neutral axes.
 for(const side of ['R','L'])if(!(revolver&&clipPosture==='carry')&&!(revolver&&oneHand&&side==='L'))fit(e,side,at(e,'Wrist'+side),e.model.getObjectByName('Wrist'+side).getWorldQuaternion(new Quaternion()),at(e,'LowerArm'+side),{preserve:false,maxBend:0,authored:false});
 prepare?.();e.root.updateMatrixWorld(true);attach(e);
 for(const[name,channel]of [['Chest','chest'],['Head','head'],['ShoulderR','shoulderR'],['ShoulderL','shoulderL']])editBone(e,name,channel);
 e.root.updateMatrixWorld(true);
 const poles={right:at(e,'LowerArmR'),left:at(e,'LowerArmL')};editTarget(e,'elbowR',poles.right);editTarget(e,'elbowL',poles.left);
 const rotation=weapon.getWorldQuaternion(new Quaternion()),from=weapon.getWorldPosition(new Vector3()),point=from.clone();
 editTarget(e,'weapon',point,rotation);
 if(point.distanceTo(from)>1e-8||rotation.angleTo(weapon.getWorldQuaternion(new Quaternion()))>1e-6||hasElbowEdit(e,'R')){
  const turn=rotation.clone().multiply(weapon.getWorldQuaternion(new Quaternion()).invert()),hand=turn.clone().multiply(e.model.getObjectByName('WristR').getWorldQuaternion(new Quaternion()));
  fit(e,'R',at(e,'WristR').sub(from).applyQuaternion(turn).add(point),hand,poles.right);attach(e);
 }
 const clearRevolver=revolver&&e.clip?.startsWith('Crouch')&&!e.animationEditingReload&&!e.reloadLast&&!e.animationEdits?.weapon?.some(Boolean)&&!e.animationEdits?.support?.some(Boolean)&&!hasElbowEdit(e,'R')&&!hasElbowEdit(e,'L');
 if(clearRevolver){
  // A continuous knee-height envelope avoids a late collision correction
  // midway through a step. Both weapon contacts retain the same orientation.
  const wrist=at(e,'WristR'),safe=wrist.clone(),kneeHeight=Math.max(at(e,'LowerLegL').y,at(e,'LowerLegR').y)+.17*e.root.scale.x;
  for(const offset of [new Vector3(),...['Middle4','Index4','Pinky4'].map(n=>at(e,n+'R').sub(wrist))]){
   safe.y=Math.max(safe.y,kneeHeight-offset.y);
  }
  if(safe.y>wrist.y+1e-6){fit(e,'R',safe,e.model.getObjectByName('WristR').getWorldQuaternion(new Quaternion()),poles.right);attach(e);}
 }
 let supportGap=0;
 if(!oneHand){
  const gripHand=weapon.getWorldQuaternion(new Quaternion()).multiply(pistol?(approved?approvedHandFrame(e,'L'):PISTOL_SUPPORT_ROTATION):supportHandRotation(weapon)),hand=e.model.getObjectByName('WristL').getWorldQuaternion(new Quaternion()).slerp(gripHand,weight),free=at(e,'Middle2L'),profile=weapon.userData.pistol;
  const anchor=()=>{if(pistol)return weapon.localToWorld(new Vector3(...profile.leftPalm));const p=new Vector3(...(weapon.userData.grips?.left||[.145,.03,.255]));p.z-=weapon.userData.pumpOffset||0;return weapon.localToWorld(p);};
  const palm=()=>free.clone().lerp(pistol?anchor():anchor().sub(contactWrist(e,'L',new Vector3(),gripHand)),weight);
  if(clearRevolver&&posture==='hip'){
   // Lift the joined weapon only as far as the bent-leg corridor requires.
   // Moving both grip contacts together avoids detaching the support hand.
   const target=contactWrist(e,'L',palm(),hand),safe=routeSupportWrist(e,target,armObstacles(e,.02)),lift=safe.y-target.y;
   if(lift>1e-6){fit(e,'R',at(e,'WristR').add(new Vector3(0,lift,0)),e.model.getObjectByName('WristR').getWorldQuaternion(new Quaternion()),poles.right);attach(e);}
  }
  const target=contactWrist(e,'L',palm(),hand),start=at(e,'UpperArmL'),reach=start.distanceTo(at(e,'LowerArmL'))+at(e,'LowerArmL').distanceTo(at(e,'WristL'))-.004,excess=Math.max(0,target.distanceTo(start)-reach);
  if(excess>0){fit(e,'R',at(e,'WristR').add(start.clone().sub(target).setLength(Math.min(.14,excess)*weight)),e.model.getObjectByName('WristR').getWorldQuaternion(new Quaternion()),poles.right);attach(e);}
  const contact=palm();editTarget(e,'support',contact,hand);
  if(delta!==null){const guided=guideSupportMotion(e,contact,hand);contact.copy(guided.point);hand.copy(guided.rotation);}
  const previous=e.weaponMotion?.last?.left,joined=!clearRevolver||delta>=.5||previous&&e.root.localToWorld(e.root.worldToLocal(at(e,'UpperArmL')).add(previous.offset)).distanceTo(contact)<.005;
  if(delta!==null)fitPistolSupportContact(e,contact,hand,'Middle2',{pole:poles.left,maxBend:pistol?28:60,clearance:0,delta,avoidBody:clearRevolver,pinned:joined&&weight>.999&&!e.animationEditingReload&&!e.reloadLast&&!e.shotgunReload&&!e.weaponMotion?.joining});else fit(e,'L',contactWrist(e,'L',contact,hand),hand,poles.left);
  supportGap=at(e,'Middle2L').distanceTo(contact);
 }else if(hasElbowEdit(e,'L')){const hand=e.model.getObjectByName('WristL').getWorldQuaternion(new Quaternion());fit(e,'L',at(e,'WristL'),hand,poles.left);}
 else if(clearRevolver&&crouchReady){
  // Keep the free hand beside the bent leg instead of through its knee.
  // The original free-arm pose remains the target; it never joins the grip.
  const wrist=at(e,'WristL'),hand=e.model.getObjectByName('WristL').getWorldQuaternion(new Quaternion());
  const offsets=[new Vector3(),...['Middle4','Index4','Pinky4'].map(n=>at(e,n+'L').sub(wrist))],safe=outsideBody(e,wrist,offsets);
  const contact=at(e,'Middle2L').add(safe.sub(wrist));
  fitPistolSupportContact(e,contact,hand,'Middle2',{pole:poles.left,maxBend:60,clearance:0,delta:delta??1,avoidBody:true});
 }
 if(pistol&&!approved){poseHand(e,'R','pistol',{trigger});poseThumb(e,'L','pistol',{weight});}else if(short)poseOneHandThumb(e);else if(!pistol){poseHand(e,'R','support',{trigger});if(!oneHand)poseThumb(e,'L',revolver?'revolver':weapon.userData.grips?.verticalSupport?'vertical':'support',{weight});}
 e.weaponPoles=poles;e.root.updateMatrixWorld(true);
 return{kind,sourceClip:KIT.rigs[e.modelSex][kind][clipPosture].sourceClip,supportGap};
}
