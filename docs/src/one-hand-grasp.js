import {Quaternion,Vector3} from 'three';
import {poseHand,poseThumb} from './weapon-hands.js';
import {orientWorld} from './weapon-ik.js';

export const oneHandGrasp=entity=>{
 const profile=entity.weapon.userData.oneHandPose;
 return profile.rigs?.[entity.modelSex]||profile;
};

// Model-specific fingers only. The shared arm solver and the source shoulder
// retain ownership of the arm; no approved pistol/rifle grasp is changed.
export function poseOneHandFingers(entity,trigger=0){
 const profile=entity.weapon.userData.oneHandPose,grasp=oneHandGrasp(entity);
 if(grasp.boneRotations){
  for(const[name,q]of Object.entries(grasp.boneRotations)){
   const bone=entity.model.getObjectByName(name);bone.quaternion.fromArray(q);
   if(name.startsWith('Index')&&grasp.triggerRotations?.[name])bone.quaternion.slerp(new Quaternion().fromArray(grasp.triggerRotations[name]),trigger);
  }
  entity.root.updateMatrixWorld(true);
  if(grasp.triggerPitch&&trigger){
   const bone=entity.model.getObjectByName('Index2R'),axis=new Vector3(1,0,0).applyQuaternion(entity.weapon.getWorldQuaternion(new Quaternion()));
   orientWorld(bone,new Quaternion().setFromAxisAngle(axis,grasp.triggerPitch*trigger).multiply(bone.getWorldQuaternion(new Quaternion())));
  }
  entity.root.updateMatrixWorld(true);return;
 }
 poseHand(entity,'R',profile.fingerProfile,{trigger});
}
export function poseOneHandThumb(entity){
 const profile=entity.weapon.userData.oneHandPose,grasp=oneHandGrasp(entity),weapon=entity.weapon;
 if(grasp.boneRotations)return;
 poseThumb(entity,'R',profile.fingerProfile,{thumbPoint:weapon.localToWorld(new Vector3(...grasp.rightThumb))});
}
