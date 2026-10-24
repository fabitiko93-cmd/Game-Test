// Shared stand-pose layer. Original model geometry and locomotion stay owned
// by PlayerModels; editing is entirely optional and defaults to a no-op.
import {Euler,Quaternion,Vector3} from 'three';
import {solveLeg,worldRotation} from './character-ik.js';
const v=()=>new Vector3(),radians=Math.PI/180;
const bodyChannels=['pelvis','footR','footL','kneeR','kneeL'];
export function restoreCharacterPose(entity){
  if(!entity.characterRestore)return;
  for(const [bone,state]of entity.characterRestore){bone.position.copy(state.position);bone.quaternion.copy(state.rotation);}
  entity.characterRestore=null;
}
export function applyCharacterPose(entity,player){
  const values=entity.animationEdits;
  if(player.moving||!bodyChannels.some(name=>values[name]?.some(Boolean)))return;
  const bone=name=>entity.model.getObjectByName(name),body=bone('Body');if(!body)return;
  const all=['Body','UpperLegR','LowerLegR','FootR','UpperLegL','LowerLegL','FootL'].map(bone);
  if(all.some(b=>!b))return;
  entity.characterRestore=new Map(all.map(b=>[b,{position:b.position.clone(),rotation:b.quaternion.clone()}]));
  const root=entity.root,yaw=root.getWorldQuaternion(new Quaternion()),references={};
  for(const side of ['R','L']){
    const upper=bone('UpperLeg'+side),lower=bone('LowerLeg'+side),foot=bone('Foot'+side),point=foot.getWorldPosition(v());
    references[side]={point,rotation:foot.getWorldQuaternion(new Quaternion()),knee:lower.getWorldPosition(v()),a:upper.getWorldPosition(v()).distanceTo(lower.getWorldPosition(v())),b:lower.getWorldPosition(v()).distanceTo(point),ankle:lower.worldToLocal(point.clone())};
  }
  const pelvis=values.pelvis,position=body.getWorldPosition(v()).add(new Vector3(...pelvis.slice(0,3)).applyQuaternion(yaw));
  body.position.copy(body.parent.worldToLocal(position));
  const q=new Quaternion().setFromEuler(new Euler(...pelvis.slice(3).map(x=>x*radians),'YXZ'));
  worldRotation(body,yaw.clone().multiply(q).multiply(yaw.clone().invert()).multiply(body.getWorldQuaternion(new Quaternion())));root.updateMatrixWorld(true);
  for(const side of ['R','L']){
    const upper=bone('UpperLeg'+side),lower=bone('LowerLeg'+side),foot=bone('Foot'+side),ref=references[side],edit=values['foot'+side];
    const unpinned=lower.localToWorld(ref.ankle.clone()),pin=Math.max(0,Math.min(1,values['pin'+side][0]));
    const target=unpinned.lerp(ref.point,pin).add(new Vector3(...edit.slice(0,3)).applyQuaternion(yaw));target.y=Math.max(ref.point.y,target.y);
    const pole=ref.knee.clone().add(new Vector3(...values['knee'+side]).applyQuaternion(yaw));
    const result=solveLeg(upper,lower,foot,target,pole,ref);
    const rotation=yaw.clone().multiply(new Quaternion().setFromEuler(new Euler(...edit.slice(3).map(x=>x*radians),'YXZ'))).multiply(yaw.clone().invert()).multiply(ref.rotation);
    worldRotation(foot,rotation);root.updateMatrixWorld(true);
    entity.animationTargets['foot'+side]=target.clone();entity.animationTargets['knee'+side]=pole;
    entity.characterGaps||={};entity.characterGaps[side]=result.gap;
  }
  entity.animationOwners.legs='Standhaltung / Fußkontakte';
}
