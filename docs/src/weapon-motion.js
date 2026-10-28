import {Quaternion,Vector3} from 'three';

const at=(e,name)=>e.model.getObjectByName(name).getWorldPosition(new Vector3());
function frame(e,side,point,rotation){
 const root=e.root,yaw=root.getWorldQuaternion(new Quaternion());
 return {offset:root.worldToLocal(point.clone()).sub(root.worldToLocal(at(e,'UpperArm'+side))),rotation:yaw.invert().multiply(rotation)};
}
function world(e,side,pose){
 const root=e.root,shoulder=root.worldToLocal(at(e,'UpperArm'+side));
 return {point:root.localToWorld(shoulder.add(pose.offset)),rotation:root.getWorldQuaternion(new Quaternion()).multiply(pose.rotation)};
}
// Snapshot the reached pose once, after all reload/return solves. Every solve
// in the next frame reads this same anchor, so repeated fits cannot advance a
// motion limiter several times in a single displayed frame.
function blending(e){const t=e.rifleTransition;return Boolean(t&&t.elapsed<t.duration&&['carry','hip','aim'].some(k=>Math.abs(t.from[k]-Number(k===t.posture))>1e-6));}
export function rememberWeaponMotion(e){
 if(!e.weapon)return;
 e.weaponMotion||={};e.weaponMotion.last={posture:e.riflePosture,blending:blending(e),
  weapon:frame(e,'R',e.weapon.getWorldPosition(new Vector3()),e.weapon.getWorldQuaternion(new Quaternion())),
  left:frame(e,'L',at(e,'Middle2L'),e.model.getObjectByName('WristL').getWorldQuaternion(new Quaternion()))
 };
}
export function guideSupportMotion(e,point,rotation){
 const previous=e.weaponMotion?.last?.left,dt=e.pistolStep;
 if(!previous||dt>=.5||e.animationDirectEdit)return {point,rotation};
 const motion=e.weaponMotion,action=e.animationEditingReload||e.reloadLast;
 if(action)motion.joining=true;
 if(!motion.joining)return {point,rotation};
 // Follow the physical palm, not a wrist implied by an unattainable donor
 // hand rotation. The contact solver owns wrist orientation and elbow limits.
 const target=frame(e,'L',point,rotation.clone());
 const distance=(e.animationEditingReload?1.5:2.5)*Math.max(0,dt)/e.root.scale.x;
 const offset=target.offset.clone().sub(previous.offset);
 if(!action&&offset.length()<=distance)motion.joining=false;
 target.offset.copy(previous.offset).add(offset.clampLength(0,distance));
 return world(e,'L',target);
}

// Interrupt a posture blend from what was actually reached, not from its old
// abstract carry/aim weights. This avoids finishing a lowering arc after the
// player has already asked to raise the weapon again.
export function transitionWeaponMotion(e,point,rotation,dt,endpoint=null){
 const motion=e.weaponMotion||={},transition=e.rifleTransition,previous=motion.last||motion.target;
 const remember=result=>{motion.target={posture:e.riflePosture,blending:blending(e),weapon:frame(e,'R',result.point,result.rotation.clone())};return result;};
 if(!previous||!transition||dt>=.5){motion.transition=null;motion.from=null;return remember({point,rotation});}
 if(motion.transition!==transition){
  motion.transition=transition;motion.from=previous.posture===transition.posture||(endpoint&&!previous.blending)?null:previous.weapon;
  if(motion.from&&e.weapon.userData.pistol)e.pistolWeaponPose={offset:motion.from.offset.clone(),rotation:motion.from.rotation.clone()};
 }
 const t=Math.min(1,transition.elapsed/transition.duration),amount=t*t*(3-2*t);
 if(!motion.from||t>=1)return remember({point,rotation});
 const target=frame(e,'R',endpoint?.point||point,(endpoint?.rotation||rotation).clone());
 target.offset.lerpVectors(motion.from.offset,target.offset,amount);target.rotation.copy(motion.from.rotation.clone().slerp(target.rotation,amount));
 return remember(world(e,'R',target));
}
