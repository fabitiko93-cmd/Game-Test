import {Euler,Quaternion,Vector3} from 'three';
import {STANCE_KIT,applyKitStance,kitPoseBones} from './kit-stance.js';
import {orientWorld,axialAngle} from './weapon-ik.js';
import {resolveAnimationEdits,transitionDuration} from './animation-targets.js';
import {applyCharacterPose} from './character-pose.js';
import {recoilPose} from './weapon-recoil.js';
const at=(e,n)=>e.model.getObjectByName(n).getWorldPosition(new Vector3());
const editChannels={Chest:'chest',Head:'head',ShoulderR:'shoulderR',ShoulderL:'shoulderL'};
function snapshot(e,withoutEdits=false){return new Map(STANCE_KIT.bones.map(n=>{const q=e.model.getObjectByName(n).quaternion.clone(),values=withoutEdits&&e.animationEdits?.[editChannels[n]];if(values)q.multiply(new Quaternion().setFromEuler(new Euler(...values.map(v=>v*Math.PI/180),'YXZ')).invert());return[n,q.normalize()];}));}
function rememberArm(e,side){
 const lower=e.model.getObjectByName('LowerArm'+side),hand=e.model.getObjectByName('Wrist'+side),start=at(e,'UpperArm'+side),elbow=at(e,'LowerArm'+side),point=at(e,'Wrist'+side),axis=point.clone().sub(elbow).normalize(),inverse=e.root.getWorldQuaternion(new Quaternion()).invert(),saved=lower.quaternion.clone(),actual=lower.getWorldQuaternion(new Quaternion());
 lower.quaternion.copy(e.rifleHands.get('LowerArm'+side).rotation);e.root.updateMatrixWorld(true);const from=at(e,'Wrist'+side).sub(elbow).normalize(),neutral=new Quaternion().setFromUnitVectors(from,axis).multiply(lower.getWorldQuaternion(new Quaternion()));lower.quaternion.copy(saved);e.root.updateMatrixWorld(true);
 const direction=point.clone().sub(start).normalize(),bend=elbow.clone().sub(start);bend.addScaledVector(direction,-bend.dot(direction)).normalize();
 e.pistolFits||={};e.pistolFits[side]={recovering:false,upper:e.model.getObjectByName('UpperArm'+side).getWorldQuaternion(new Quaternion()).premultiply(inverse),offset:point.clone().sub(start).applyQuaternion(inverse),bend:bend.applyQuaternion(inverse),hand:hand.getWorldQuaternion(new Quaternion()).premultiply(inverse),flex:elbow.clone().sub(start).angleTo(point.clone().sub(elbow)),twist:axialAngle(actual.multiply(neutral.invert()),axis)};
}
export function applyWeaponKitPose(e,player,delta,posture){
 if(player.combat?.reload)posture=e.riflePosture||posture;
 e.rifleRestore=new Map(kitPoseBones(e).map(b=>[b,b.quaternion.clone()]));e.pistolStep=delta;e.pistolPreviousFit={...e.pistolFits};e.handgunUpperRest=null;
 const blend=e.rifleBlend||={carry:Number(posture==='carry'),hip:Number(posture==='hip'),aim:Number(posture==='aim')},fallback=e.weapon.userData.pistol?.72:e.weapon.userData.oneHandPose?.transition||.42;
 if(delta>=.5){for(const k of ['carry','hip','aim'])blend[k]=Number(k===posture);e.rifleTransition=null;e.kitPose=null;e.kitTransition=null;}
 else{if(e.rifleTransition?.posture!==posture)e.rifleTransition={posture,from:{...blend},elapsed:0,duration:transitionDuration(e,posture,fallback)};const t=Math.min(1,(e.rifleTransition.elapsed+=Math.max(0,delta))/e.rifleTransition.duration),s=t*t*(3-2*t);for(const k of ['carry','hip','aim'])blend[k]=e.rifleTransition.from[k]+(Number(k===posture)-e.rifleTransition.from[k])*s;}
 e.riflePosture=posture;resolveAnimationEdits(e,player,blend);applyCharacterPose(e,player);e.pistolCrouch=Number(player.stance==='sneak'&&!player.running);
 const fire=Boolean(player.combat?.triggerHeld||player.combat?.shotImpulse?.weaponId===e.weapon.userData.weaponId&&player.combat.shotImpulse.age<.25);
 const key=posture+':'+Boolean(posture==='carry'&&e.clip?.startsWith('Crouch'));
 e.kitStance=applyKitStance(e,{posture,trigger:Number(fire),supportWeight:e.weapon.userData.grips?.handgun&&!e.weapon.userData.pistol?blend.aim+blend.hip:1,delta,prepare:()=>{
  const target=snapshot(e);
  if(e.animationDirectEdit&&e.kitBasePose){for(const[n,q]of e.kitBasePose)e.model.getObjectByName(n).quaternion.copy(q);}
  else if(e.kitPose&&delta<.5){
   if(e.kitReturning){for(const[n,q]of e.kitPose)e.model.getObjectByName(n).quaternion.copy(q.clone().rotateTowards(target.get(n),Math.max(0,delta)*5));if(!e.animationEditingReload&&!e.reloadLast&&!e.shotgunReload){e.kitReturnElapsed=(e.kitReturnElapsed||0)+Math.max(0,delta);if(e.kitReturnElapsed>=.4){e.kitReturning=false;e.kitTransition=null;}}}
   else{if(e.kitTransition?.key!==key)e.kitTransition={key,from:e.kitPose,elapsed:0,duration:transitionDuration(e,posture,fallback)};const tr=e.kitTransition,t=Math.min(1,(tr.elapsed+=Math.max(0,delta))/tr.duration),s=t*t*(3-2*t);for(const[n,q]of target)e.model.getObjectByName(n).quaternion.copy(tr.from.get(n).clone().slerp(q,s));}
  }
  // Repeated editor draws reuse the unedited evaluated blend. Starting from
  // the last solved elbow would apply the same authored turn a second time.
  if(!e.animationDirectEdit)e.kitBasePose=snapshot(e);
  e.root.updateMatrixWorld(true);
  const kick=recoilPose(player,e.weapon.userData.weaponId,Boolean(e.weapon.userData.pistol||e.weapon.userData.grips?.handgun));
  if(kick.pitch||kick.roll){const wrist=e.model.getObjectByName('WristR'),yaw=e.root.getWorldQuaternion(new Quaternion()),turn=yaw.clone().multiply(new Quaternion().setFromEuler(new Euler(-kick.pitch,0,kick.roll))).multiply(yaw.invert());orientWorld(wrist,turn.multiply(wrist.getWorldQuaternion(new Quaternion())));}
 }});
 e.kitPose=snapshot(e,true);rememberArm(e,'R');if(e.weapon.userData.oneHandPose||e.weapon.userData.grips?.handgun&&posture==='carry')rememberArm(e,'L');
}
export function rememberKitAction(e){if(e.weapon?.userData.stanceKit&&(e.animationEditingReload||e.reloadLast||e.shotgunReload)){e.kitPose=snapshot(e,true);e.kitReturning=true;e.kitReturnElapsed=0;if(e.weaponMotion)e.weaponMotion.joining=true;}}
