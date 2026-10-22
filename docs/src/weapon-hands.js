import {Euler,Matrix4,Quaternion,Vector3} from 'three';
import {fitArm} from './weapon-ik.js';

const cradle=new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(new Vector3(0,0,1),new Vector3(-1,0,0),new Vector3(0,-1,0)));
// Index finger above the little finger on vertical grips; the old +90° frame
// inverted this relationship and curled the fingers toward the muzzle.
export const VERTICAL_HAND=new Quaternion().setFromAxisAngle(new Vector3(1,0,0),-Math.PI/2).multiply(cradle);
export const supportHandRotation=weapon=>(weapon.userData.grips?.verticalSupport||weapon.userData.grips?.handgun?VERTICAL_HAND:cradle).clone();
const profiles={support:[.72,1.20,.55],pistol:[1.10,1.38,.60],vertical:[.98,1.40,.62],revolver:[1.04,1.35,.65],magazine:[.96,1.38,.62],pinch:[1.28,1.62,.50],open:[.12,.14,.10]};

function curl(entity,side,finger,angles,weight=1){
  for(let i=1;i<=4;i++){
    const entry=entity.rifleHands.get(`${finger}${i}${side}`);if(!entry)continue;
    const q=entry.rotation.clone();
    if(i>1){const e=new Euler().setFromQuaternion(q);e.x=-angles[i-2];q.setFromEuler(e);}
    entry.bone.quaternion.slerp(q,weight);
  }
}
export function poseHand(entity,side,profile,{weight=1,trigger=0,thumbPoint=null}={}){
  const angles=profiles[profile]||profiles.support;
  for(const finger of ['Index','Middle','Ring','Pinky']){
    let a=angles;
    if(side==='R')a=finger==='Index'?[.03+( .35-.03)*trigger,.07+(1.05-.07)*trigger,.04+(.35-.04)*trigger]:profile==='pistol'?profiles.pistol:[.90,1.20,.45];
    if(profile==='pinch'&&finger!=='Index')a=[1.06,1.35,.65];
    curl(entity,side,finger,a,weight);
  }
  poseThumb(entity,side,profile,{weight,thumbPoint});
}
export function poseThumb(entity,side,profile,{weight=1,thumbPoint=null}={}){
  const thumb=[1,2,3].map(i=>entity.rifleHands.get(`Thumb${i}${side}`));
  if(!thumb.every(Boolean))return;
  const before=thumb.map(e=>e.bone.quaternion.clone());for(const e of thumb)e.bone.quaternion.copy(e.rotation);
  entity.root.updateMatrixWorld(true);
  const weapon=entity.weapon,grips=weapon.userData.grips;
  let target=thumbPoint;
  if(!target&&profile==='pinch'){
    const index=entity.model.getObjectByName('Index4'+side).getWorldPosition(new Vector3());
    target=index.add(new Vector3(0,0,.011).applyQuaternion(entity.model.getObjectByName('Wrist'+side).getWorldQuaternion(new Quaternion())));
  }
  target ||= weapon.localToWorld(new Vector3().fromArray(side==='R'?(grips?.rightThumb||[.015,.025,-.015]):grips?.leftThumb||[.025,.105,.245]));
  const pole=weapon.localToWorld(side==='R'?new Vector3(-.01,.085,-.05):new Vector3().fromArray(grips?.leftThumbPole||[.11,.13,.27]));
  fitArm(...thumb.map(e=>e.bone),target,pole);
  if(weight<1)thumb.forEach((e,i)=>e.bone.quaternion.copy(before[i].slerp(e.bone.quaternion,weight)));
  entity.root.updateMatrixWorld(true);
}
export function poseWeaponHands(entity,player,{freeLeft=0,freeLeftFingers}={}){
  const impulse=player.combat?.shotImpulse,fire=Boolean(player.combat?.triggerHeld)||impulse?.weaponId===entity.weapon.userData.weaponId&&impulse.age<.25;
  poseHand(entity,'R','support',{trigger:fire?1:0});
  const profile=entity.weapon.userData.grips?.handgun?'revolver':entity.weapon.userData.grips?.verticalSupport?'vertical':'support';
  poseHand(entity,'L',profile);
  if(freeLeft>0&&freeLeftFingers)for(const [bone,rotation] of freeLeftFingers)bone.quaternion.slerp(rotation,freeLeft);
  entity.root.updateMatrixWorld(true);
}
// Move the wrist by the actual palm/pinch offset, rather than placing the wrist
// joint at the object. This works for both original rigs and their body scale.
export function contactWrist(entity,side,point,rotation,contact='Middle2'){
  const wrist=entity.model.getObjectByName('Wrist'+side),q=wrist.getWorldQuaternion(new Quaternion());
  let p=entity.model.getObjectByName(contact+side).getWorldPosition(new Vector3());
  if(contact==='Index4')p.lerp(entity.model.getObjectByName('Thumb3'+side).getWorldPosition(new Vector3()),.5);
  const offset=p.sub(wrist.getWorldPosition(new Vector3())).applyQuaternion(q.invert()).applyQuaternion(rotation);
  return point.clone().sub(offset);
}
export function pinchPoint(entity,side='L'){
  return entity.model.getObjectByName('Index4'+side).getWorldPosition(new Vector3()).lerp(entity.model.getObjectByName('Thumb3'+side).getWorldPosition(new Vector3()),.5);
}
