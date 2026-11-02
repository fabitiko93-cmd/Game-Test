import {Euler,Quaternion,Vector3} from 'three';
import {oneHandGrasp,poseOneHandFingers,poseOneHandThumb} from './one-hand-grasp.js';
import {fitHandTarget} from './pistol-pose.js';
import {recoilPose} from './weapon-recoil.js';
import {resolveAnimationEdits,editTarget,transitionDuration} from './animation-targets.js';
import {applyCharacterPose} from './character-pose.js';
import {fitAuthoredElbow,hasElbowEdit} from './elbow-pose.js';

const v=a=>new Vector3().fromArray(a);
const q=a=>new Quaternion().setFromEuler(new Euler(...a,'YXZ'));

export function fitOneHandWeaponPose(entity,origin,rotation){
 const weapon=entity.weapon,profile=weapon.userData.oneHandPose,grasp=oneHandGrasp(entity),wrist=entity.model.getObjectByName('WristR'),middle=entity.model.getObjectByName('Middle2R');
 poseOneHandFingers(entity);
 const grip=new Quaternion().fromArray(grasp.gripQuaternion),hand=rotation.clone().multiply(grip.clone().invert());
 const offset=middle.getWorldPosition(new Vector3()).sub(wrist.getWorldPosition(new Vector3())).applyQuaternion(wrist.getWorldQuaternion(new Quaternion()).invert()).applyQuaternion(hand);
 const target=origin.clone().add(v(grasp.rightPalm).multiplyScalar(profile.scale).applyQuaternion(rotation)).sub(offset);
 const shoulder=entity.root.worldToLocal(entity.model.getObjectByName('UpperArmR').getWorldPosition(new Vector3())),pole=entity.root.localToWorld(shoulder.add(v(profile.hip.elbow)));
 fitHandTarget(entity,'R',target,hand,pole,profile.maxWristBend);
 weapon.quaternion.copy(grip);weapon.updateMatrixWorld(true);
 const anchor=v(grasp.rightPalm).multiplyScalar(profile.scale).applyQuaternion(weapon.getWorldQuaternion(new Quaternion()));
 weapon.position.copy(wrist.worldToLocal(middle.getWorldPosition(new Vector3()).sub(anchor)));weapon.updateMatrixWorld(true);
}

// Dedicated one-handed stockless-weapon profile. The original locomotion owns
// the legs and free arm; only the firing arm and its fingers are fitted here.
export function applyOneHandPose(entity,player,delta,posture){
 const {root,model,weapon}=entity,profile=weapon.userData.oneHandPose,grasp=oneHandGrasp(entity);
 const bone=n=>model.getObjectByName(n),at=n=>bone(n).getWorldPosition(new Vector3());
 const rig=entity.rifleHands,changed=[...rig.values()].map(e=>e.bone).filter(b=>b.name.endsWith('R'));
 entity.rifleRestore=new Map(changed.map(b=>[b,b.quaternion.clone()]));
 entity.pistolStep=delta;entity.pistolPreviousFit={...entity.pistolFits};
 const blend=entity.rifleBlend||={carry:Number(posture==='carry'),hip:Number(posture==='hip'),aim:Number(posture==='aim')};
 if(delta>=.5){for(const name of ['carry','hip','aim'])blend[name]=Number(name===posture);entity.rifleTransition=null;entity.oneHandMotion=null;}
 else{
  if(entity.rifleTransition?.posture!==posture)entity.rifleTransition={posture,from:{...blend},elapsed:0,duration:transitionDuration(entity,posture,profile.transition)};
  const t=Math.min(1,(entity.rifleTransition.elapsed+=Math.max(0,delta))/entity.rifleTransition.duration),s=t*t*(3-2*t);
  for(const name of ['carry','hip','aim'])blend[name]=entity.rifleTransition.from[name]+(Number(name===posture)-entity.rifleTransition.from[name])*s;
 }
 entity.riflePosture=posture;
 resolveAnimationEdits(entity,player,blend);applyCharacterPose(entity,player);
 for(const name of ['UpperArmR','LowerArmR','WristR'])bone(name).quaternion.copy(rig.get(name).rotation);
 root.updateMatrixWorld(true);
 poseOneHandFingers(entity);
 const crouched=Number(player.stance==='sneak'&&!player.running),last=entity.oneHandCrouch??crouched;
 entity.oneHandCrouch=delta>=.5?crouched:last+Math.max(-delta/.2,Math.min(delta/.2,crouched-last));
 const local=new Vector3(),poleOffset=new Vector3(),rotation=new Quaternion();let weight=0;
 for(const state of ['carry','hip','aim']){
  const pose=profile[state],w=blend[state],point=v(pose.wrist);
  const crouchPose=state==='carry'?profile.crouchCarry:state==='hip'?profile.crouchHip:null;
  if(crouchPose)point.lerp(v(crouchPose.wrist),entity.oneHandCrouch);
  local.addScaledVector(point,w);poleOffset.addScaledVector(v(pose.elbow),w);
  const target=q(pose.rotation);
  if(crouchPose)target.slerp(q(crouchPose.rotation),entity.oneHandCrouch);
  if(w){rotation.slerp(target,w/(weight+w));weight+=w;}
 }
 // Limit the shoulder-relative reached path as well as the posture blend,
 // including reversals during walking/crouch transitions.
 const previous=entity.oneHandMotion;
 if(previous&&delta<.5){
  local.copy(previous.offset.clone().add(local.clone().sub(previous.offset).clampLength(0,Math.max(0,delta)*profile.handSpeed/root.scale.x)));
  rotation.copy(previous.rotation.clone().rotateTowards(rotation,Math.max(0,delta)*profile.turnSpeed));
 }
 entity.oneHandMotion={offset:local.clone(),rotation:rotation.clone()};
 const yaw=root.getWorldQuaternion(new Quaternion()),shoulder=root.worldToLocal(at('UpperArmR'));
 const wristTarget=root.localToWorld(shoulder.clone().add(local));
 const gunRotation=yaw.clone().multiply(rotation),kick=recoilPose(player,weapon.userData.weaponId,false);
 gunRotation.multiply(q([-kick.pitch*profile.recoilScale,0,kick.roll]));
 wristTarget.addScaledVector(new Vector3(0,0,1).applyQuaternion(yaw),-kick.back);
 const pole=root.localToWorld(shoulder.clone().add(poleOffset));
 editTarget(entity,'elbowR',pole);editTarget(entity,'weapon',wristTarget,gunRotation);
 const gripRotation=grasp.gripQuaternion?new Quaternion().fromArray(grasp.gripQuaternion):q(profile.gripRotation),hand=gunRotation.clone().multiply(gripRotation.clone().invert());
 // Keep the source clavicle and let the existing hinge-plane solver distribute
 // arm roll; a fixed revolver upper-arm frame can turn the aimed barrel aside
 // while the crouch clip rotates the chest.
 entity.handgunUpperRest=null;
 entity.handgunRecoil=kick.pitch>0;
 fitHandTarget(entity,'R',wristTarget,hand,pole,profile.maxWristBend);
 const wrist=bone('WristR');
 weapon.scale.setScalar(profile.scale/wrist.getWorldScale(new Vector3()).x);
 weapon.quaternion.copy(gripRotation);weapon.updateMatrixWorld(true);
 const palm=at('Middle2R'),anchor=v(grasp.rightPalm).multiplyScalar(profile.scale).applyQuaternion(weapon.getWorldQuaternion(new Quaternion()));
 weapon.position.copy(wrist.worldToLocal(palm.sub(anchor)));weapon.updateMatrixWorld(true);
 const shot=player.combat?.shotImpulse,fire=player.combat?.triggerHeld||shot?.weaponId===weapon.userData.weaponId&&shot.age<.18;
 const trigger=Number(Boolean(fire)),lastTrigger=entity.oneHandTrigger??trigger;
 entity.oneHandTrigger=delta>=.5?trigger:lastTrigger+Math.max(-delta/.08,Math.min(delta/.08,trigger-lastTrigger));
 poseOneHandFingers(entity,entity.oneHandTrigger);
 poseOneHandThumb(entity);
 if(hasElbowEdit(entity,'L')){
  const arm=['UpperArmL','LowerArmL','WristL'].map(bone),hand=arm[2].getWorldQuaternion(new Quaternion()),pole=at('LowerArmL');
  for(const x of rig.values())if(x.bone.name.endsWith('L')&&!entity.rifleRestore.has(x.bone))entity.rifleRestore.set(x.bone,x.bone.quaternion.clone());
  editTarget(entity,'elbowL',pole);
  fitAuthoredElbow(entity,'L',arm,at('WristL'),pole,{hand,axis:rig.get('WristL').palm,rest:rig.get('WristL').rotation,lowerRest:rig.get('LowerArmL').rotation,hinge:rig.get('UpperArmL').hinge,maxTwist:Math.PI/3},{maxBend:75});
 }
 entity.weaponPoles={right:at('LowerArmR'),left:at('LowerArmL')};
 root.updateMatrixWorld(true);
}
