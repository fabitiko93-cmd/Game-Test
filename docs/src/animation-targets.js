import {Euler,Quaternion,Vector3} from 'three';
import {activeWeapon} from './inventory.js';
import {emptyValues,profileKey,sampleTrack,poseValues,combineValues,POSES} from './animation-document.js';
import {PISTOL_POSES} from './weapon-poses.js';

const radians=Math.PI/180;
export function resolveAnimationEdits(entity,player,blend){
  const document=entity.animationDocument,key=profileKey(player.appearance?.sex==='female'?'female':'male',activeWeapon(player)?.type),out=emptyValues();
  const preview=entity.animationPreview,defaults=emptyValues();
  const add=(name,time,weight)=>{if(!weight)return;let values=sampleTrack(document,key,name,time);if(Object.hasOwn(POSES,name))values=combineValues(poseValues(document,key,name),values);for(const channel of Object.keys(out))out[channel]=out[channel].map((v,i)=>v+(values[channel][i]-defaults[channel][i])*weight);};
  if(preview?.track)add(preview.track,preview.progress,1);
  else{
    const crouch=player.stance==='sneak'&&!player.running;
    for(const posture of ['carry','hip','aim'])add(crouch&&posture!=='hip'?(posture==='carry'?'crouchCarry':'crouchAim'):posture,entity.poseProgress||0,blend[posture]);
    const transition=entity.rifleTransition,duration=transition?.duration||transitionDuration(entity,transition?.posture,entity.weapon?.userData.pistol?PISTOL_POSES.transition:.42);
    if(transition&&transition.elapsed<duration){const t=transition.elapsed/duration;add('to'+transition.posture[0].toUpperCase()+transition.posture.slice(1),t,Math.sin(Math.PI*t));}
    const reload=player.combat?.reload,shot=player.combat?.shotImpulse;
    if(reload)add('reload',reload.elapsed/reload.duration,Math.min(1,reload.elapsed/.25,(reload.duration-reload.elapsed)/.25));
    if(shot?.weaponId===entity.weapon?.userData.weaponId&&shot.age<.5)add('shot',shot.age/.5,1);
  }
  entity.animationEdits=out;entity.animationEditingReload=Boolean(player.combat?.reload);
  return out;
}

export function transitionDuration(entity,posture,fallback){
  const key=profileKey(entity.modelSex,entity.weapon?.userData.weaponType);
  return entity.animationDocument?.profiles?.[key]?.durations?.[posture]??fallback;
}

export function editTarget(entity,channel,point,rotation=null,stage='base'){
  if((stage==='reload')!==Boolean(entity.animationEditingReload))return;
  const values=entity.animationEdits?.[channel];if(!values)return;
  const yaw=entity.root.getWorldQuaternion(new Quaternion());
  entity.animationTargetBases||={};entity.animationTargetBases[channel]=point.clone();
  if(channel==='support'){
    const contact=entity.animationEdits.contactL[0];
    if(contact<0)point.lerp(new Vector3(...entity.animationEdits.freeHandL).applyQuaternion(yaw).add(entity.root.getWorldPosition(new Vector3())),Math.min(1,-contact));
    else if(contact>0&&stage==='base'){
      // Pistols expose a metacarpal contact. Rifle/revolver anchors describe
      // the wrist; their pose module already converts it to the palm target.
      const grip=entity.weapon?.userData.pistol?.leftPalm;
      if(grip)point.lerp(entity.weapon.localToWorld(new Vector3(...grip)),Math.min(1,contact));
    }
  }
  point.add(new Vector3(...values.slice(0,3)).applyQuaternion(yaw));
  if(rotation&&values.length===6){const correction=new Quaternion().setFromEuler(new Euler(...values.slice(3).map(v=>v*radians),'YXZ'));rotation.premultiply(yaw.clone().multiply(correction).multiply(yaw.clone().invert()));}
  entity.animationTargets||={};entity.animationTargets[channel]=point.clone();
}

export function editBone(entity,name,channel){
  const values=entity.animationEdits?.[channel],bone=entity.model.getObjectByName(name);
  if(bone&&values?.some(v=>v!==0)){bone.quaternion.multiply(new Quaternion().setFromEuler(new Euler(...values.map(v=>v*radians),'YXZ')));bone.updateMatrixWorld(true);}
}

export function editFingers(entity){
  for(const side of ['L','R']){
    const value=entity.animationEdits?.['fingers'+side]?.[0]||0;
    if(value)for(const finger of ['Index','Middle','Ring','Pinky'])for(const i of [2,3,4])entity.model.getObjectByName(`${finger}${i}${side}`)?.rotateX(-value);
  }
  entity.root.updateMatrixWorld(true);
}
