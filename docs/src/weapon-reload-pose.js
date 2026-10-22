import {cartridgeMesh} from './cartridge-models.js';
import {Box3,Euler,Group,Quaternion,Vector3} from 'three';
import {reloadPhase} from './weapon-reload.js';
import {fitSupportContact,fitWeaponPose} from './rifle-pose.js';
import {contactWrist,pinchPoint,poseHand,poseThumb,VERTICAL_HAND} from './weapon-hands.js';
import {REVOLVER_MODEL} from './weapon-catalog.js';
import {fitPistolSupportContact,PISTOL_SUPPORT_ROTATION} from './pistol-pose.js';

const ease=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};

const v=(x,y,z)=>new Vector3(x,y,z);
function path(keys,t){for(let i=1;i<keys.length;i++)if(t<=keys[i][0])return keys[i-1][1].clone().lerp(keys[i][1],ease((t-keys[i-1][0])/(keys[i][0]-keys[i-1][0])));return keys.at(-1)[1].clone();}
const fingers=entity=>new Map([...entity.rifleHands.values()].filter(e=>/^(Index|Middle|Ring|Pinky|Thumb)/.test(e.bone.name)).map(e=>[e.bone,e.bone.quaternion.clone()]));
function blendFingers(before,weight){for(const [bone,q] of before)bone.quaternion.copy(q.clone().slerp(bone.quaternion,weight));}
export function resetWeaponParts(weapon){
  for(const [name,pose] of weapon?.userData.partPose||[]){const part=weapon.getObjectByName(name);part.position.copy(pose.position);part.quaternion.copy(pose.rotation);part.visible=pose.visible;}
  if(weapon?.userData.cartridges)weapon.userData.cartridges.visible=false;
  if(weapon?.userData.carriedRound)weapon.userData.carriedRound.visible=false;
  if(weapon?.userData.spentCartridges)weapon.userData.spentCartridges.visible=false;
}
function cartridges(weapon){
  if(!weapon.userData.cartridges){const group=new Group();group.name='ReloadCartridges';for(let i=0;i<6;i++)group.add(cartridgeMesh('ammo_44',false));weapon.add(group);weapon.userData.cartridges=group;
    const carried=cartridgeMesh('ammo_44',false);carried.name='CarriedCartridge';weapon.add(carried);weapon.userData.carriedRound=carried;}
  if(!weapon.userData.spentCartridges){const group=new Group();group.name='SpentCylinderCases';for(let i=0;i<6;i++)group.add(cartridgeMesh('ammo_44',true));weapon.add(group);weapon.userData.spentCartridges=group;}
  return weapon.userData.cartridges;
}
function gripPoint(part,pistol=false){
  // Measure the lower half of each real magazine, including the AK's curve.
  const key=pistol?'pistolHandContact':'handContact';
  if(part.userData[key])return part.userData[key].clone();
  const g=part.geometry;if(!g.boundingBox)g.computeBoundingBox();const box=g.boundingBox,y=box.min.y+(box.max.y-box.min.y)*.36,points=[];
  for(let i=0;i<(g.index?g.index.count:g.attributes.position.count);i+=3){
    const triangle=[0,1,2].map(k=>new Vector3().fromBufferAttribute(g.attributes.position,g.index?g.index.getX(i+k):i+k));
    for(let k=0;k<3;k++){const a=triangle[k],b=triangle[(k+1)%3],d=b.y-a.y;if(Math.abs(d)<1e-8)continue;const t=(y-a.y)/d;if(t>=0&&t<=1)points.push(a.clone().lerp(b,t));}
  }
  const section=points.length?new Box3().setFromPoints(points):box;
  return (part.userData[key]=v(pistol?section.max.x+.010:section.min.x+.005,y,section.max.z+.009)).clone();
}
function placeLeft(entity,base,point,rotation,profile,weight,contact='Middle2',thumbPoint=null){
  if(entity.weapon.userData.pistol){
    entity.pistolReloadClearance=weight;
    if(weight<=0)return;
    const before=fingers(entity),palm=entity.model.getObjectByName(contact+'L').getWorldPosition(new Vector3()).lerp(point,weight);
    const q=base.rotation.clone().slerp(rotation,weight);
    poseHand(entity,'L',profile,{thumbPoint});
    blendFingers(before,weight);fitPistolSupportContact(entity,palm,q,contact,{delta:base.step,key:'pistolReloadPose',clearance:weight,stage:'reload'});
    entity.root.updateMatrixWorld(true);
    poseThumb(entity,'L',profile,{thumbPoint,weight});return;
  }
  const before=fingers(entity),q=base.rotation.clone().slerp(rotation,weight);
  if(base.previous)q.copy(base.previous.clone().rotateTowards(q,base.step*10));
  poseHand(entity,'L',profile,{thumbPoint});blendFingers(before,weight);
  const baseContact=contactWrist(entity,'L',point,q,contact).sub(point).negate().add(base.point);
  const goal=baseContact.lerp(point,weight);
  fitSupportContact(entity,goal,q,contact);
  // Refit the thumb in the reached frame; it must oppose the fingers at the
  // object, not aim back at the normal fore-end's thumb socket.
  for(const [bone,old]of before)bone.quaternion.copy(old);
  poseHand(entity,'L',profile,{thumbPoint});blendFingers(before,weight);
  fitSupportContact(entity,goal,q,contact);
}
function remember(entity,state,weight){
  const weapon=entity.weapon,wrist=entity.model.getObjectByName('WristL');
  entity.reloadLast={id:state.weaponId,weight:weapon.userData.pistol?1:weight,elapsed:0,phaseTime:state.elapsed,point:weapon.getWorldPosition(new Vector3()),rotation:weapon.getWorldQuaternion(new Quaternion()),
    left:wrist.getWorldPosition(new Vector3()),palm:entity.model.getObjectByName('Middle2L').getWorldPosition(new Vector3()),leftRotation:wrist.getWorldQuaternion(new Quaternion()),fingers:fingers(entity),
    held:weapon.userData.pistol?{
      point:entity.root.worldToLocal(weapon.getWorldPosition(new Vector3())).sub(entity.root.worldToLocal(entity.model.getObjectByName('UpperArmR').getWorldPosition(new Vector3()))),
      palm:entity.root.worldToLocal(entity.model.getObjectByName('Middle2L').getWorldPosition(new Vector3())).sub(entity.root.worldToLocal(entity.model.getObjectByName('UpperArmL').getWorldPosition(new Vector3()))),
      rotation:entity.root.getWorldQuaternion(new Quaternion()).invert().multiply(weapon.getWorldQuaternion(new Quaternion())),
      hand:entity.root.getWorldQuaternion(new Quaternion()).invert().multiply(wrist.getWorldQuaternion(new Quaternion())),
      clearance:entity.pistolReloadClearance||0
    }:null,
    parts:new Map([...weapon.userData.partPose].map(([name])=>{const part=weapon.getObjectByName(name);return[name,{point:part.position.clone(),rotation:part.quaternion.clone()}];}))};
}
function finishInterrupted(entity,delta){
  const last=entity.reloadLast,weapon=entity.weapon;if(!last||last.id!==weapon?.userData.weaponId){entity.reloadLast=null;return;}
  last.elapsed+=Math.max(0,delta);const t=last.weight*(1-ease(last.elapsed/.28));if(t<.001){entity.reloadLast=null;return;}
  if(weapon.userData.pistol){
    const root=entity.root,yaw=root.getWorldQuaternion(new Quaternion());
    const at=(side,offset)=>root.localToWorld(root.worldToLocal(entity.model.getObjectByName('UpperArm'+side).getWorldPosition(new Vector3())).add(offset));
    const palm=entity.model.getObjectByName('Middle2L').getWorldPosition(new Vector3()).lerp(at('L',last.held.palm),t);
    const hand=entity.model.getObjectByName('WristL').getWorldQuaternion(new Quaternion()).slerp(yaw.clone().multiply(last.held.hand),t);
    for(const[b,q]of last.fingers)b.quaternion.slerp(q,t);
    fitWeaponPose(entity,at('R',last.held.point),yaw.clone().multiply(last.held.rotation),t);
    fitPistolSupportContact(entity,palm,hand,'Middle2',{clearance:t*last.held.clearance,stage:'reload'});
    for(const[name,pose]of last.parts){const part=weapon.getObjectByName(name);part.position.lerp(pose.point,t);part.quaternion.slerp(pose.rotation,t);}
    entity.root.updateMatrixWorld(true);return;
  }
  const point=weapon.getWorldPosition(new Vector3()).lerp(last.point,t),rotation=weapon.getWorldQuaternion(new Quaternion()).slerp(last.rotation,t);
  const wrist=entity.model.getObjectByName('WristL'),q=wrist.getWorldQuaternion(new Quaternion()).slerp(last.leftRotation,t);
  const palm=entity.model.getObjectByName('Middle2L').getWorldPosition(new Vector3()).lerp(last.palm,t);
  fitWeaponPose(entity,point,rotation,t);
  for(const [bone,old]of last.fingers)bone.quaternion.slerp(old,t);
  fitSupportContact(entity,palm,q);
  for(const[name,pose]of last.parts){const part=weapon.getObjectByName(name);part.position.lerp(pose.point,t);part.quaternion.slerp(pose.rotation,t);}
  entity.root.updateMatrixWorld(true);
}
export function applyReloadPose(entity,player,delta=1/60){
  const state=player.combat?.reload,weapon=entity.weapon;
  if(!weapon?.userData.partPose)return;
  if(player.dead){entity.reloadLast=null;return;}
  if(!state||state.weaponId!==weapon.userData.weaponId){finishInterrupted(entity,delta);return;}
  const phase=reloadPhase(state),weight=Math.min(ease(state.elapsed/.30),ease((state.duration-state.elapsed)/.28));
  if(weight===0){entity.reloadLast=null;return;}
  const bone=n=>entity.model.getObjectByName(n),wrist=bone('WristL'),base={point:wrist.getWorldPosition(new Vector3()),rotation:wrist.getWorldQuaternion(new Quaternion()),step:Math.max(0,delta)};
  const last=entity.reloadLast,step=state.elapsed-(last?.phaseTime??-1);
  if(weapon.userData.pistol&&(!last||step<0)){entity.pistolContactPole=null;entity.pistolReloadPose=null;}
  if(state.kind==='cylinder'&&last?.id===state.weaponId&&step>0&&step<.1){base.previous=last.leftRotation;base.step=step;}
  const shoulder=entity.root.worldToLocal(bone('UpperArmR').getWorldPosition(new Vector3()));
  const hips=entity.root.worldToLocal(bone('UpperLegL').getWorldPosition(new Vector3()).lerp(bone('UpperLegR').getWorldPosition(new Vector3()),.5));
  const waist=entity.root.localToWorld(hips.add(v(.24,.04,.14)));
  const cylinder=state.kind==='cylinder',handgun=Boolean(weapon.userData.grips?.handgun),pistol=Boolean(weapon.userData.pistol),motion=Math.sin(Math.PI*phase.progress)*.012;
  const goal=entity.root.localToWorld(v(handgun?.015:-.055,shoulder.y-(handgun?.27:.25)+motion,shoulder.z+(handgun?.29:.34)));
  const q=entity.root.getWorldQuaternion(new Quaternion()).multiply(new Quaternion().setFromEuler(new Euler(handgun?.48:.10,handgun?-.10:0,handgun?-.14:-.09,'YXZ')));
  const point=weapon.getWorldPosition(new Vector3()).lerp(goal,weight),rotation=weapon.getWorldQuaternion(new Quaternion()).slerp(q,weight);
  fitWeaponPose(entity,pistol?goal:point,pistol?q:rotation,weight,true);poseHand(entity,'R',pistol?'pistol':'support',{trigger:0});
  const gunQ=weapon.getWorldQuaternion(new Quaternion());
  if(cylinder)revolver(entity,state,phase,base,waist,gunQ,weight);
  else magazine(entity,state,phase,base,waist,gunQ,weight);
  entity.root.updateMatrixWorld(true);remember(entity,state,weight);
}
function magazine(entity,state,phase,base,waist,gunQ,weight){
  const weapon=entity.weapon,mag=weapon.getObjectByName(weapon.userData.magazinePart);if(!mag)return;
  const thumbBefore=[1,2,3].map(i=>entity.model.getObjectByName('Thumb'+i+'L')).map(b=>[b,b.quaternion.clone()]);
  const pistol=Boolean(weapon.userData.pistol),handFrame=pistol?PISTOL_SUPPORT_ROTATION:VERTICAL_HAND;
  const p=phase.progress,anchor=gripPoint(mag,pistol),socket=weapon.localToWorld(anchor.clone()),pull=socket.clone().add(v(0,-.17,0).applyQuaternion(entity.root.getWorldQuaternion(new Quaternion())));
  const handPoint=path([[0,socket],[.18,socket],[.29,pull],[.40,waist],[.48,waist],[.61,pull],[.68,socket],[1,socket]],p);
  const held=p>=.18&&p<.68,old=Boolean(state.beforeMagazineId),visible=(p<.40&&old)||p>=.48;
  mag.visible=visible;
  if(held){
    const tilt=weapon.userData.weaponType==='ak_762'?-.18*Math.sin(Math.PI*Math.max(0,(p-.18)/.50)):0;
    mag.quaternion.setFromAxisAngle(v(1,0,0),tilt);
    mag.position.copy(weapon.worldToLocal(handPoint.clone())).sub(anchor.clone().applyQuaternion(mag.quaternion));
  }
  const contact=mag.localToWorld(anchor.clone()),handQ=gunQ.clone().multiply(mag.quaternion).multiply(handFrame);
  const thumb=mag.localToWorld(anchor.clone().add(v(pistol?-.035:.035,.045,-.035)));
  const approach=ease(p/.18),returning=ease((p-(pistol?.68:.73))/(pistol?.30:.19)),amount=approach*(1-returning);
  // A palm contact is defined even while the magazine is hidden in the pouch.
  placeLeft(entity,base,contact,handQ,'magazine',weight*amount,'Middle2',thumb);
  if(held&&visible){
    // A shoulder-reach clamp must never leave a loose magazine floating beside
    // the fingers. Carry the object with the reached palm for detached phases.
    const palm=entity.model.getObjectByName('Middle2L').getWorldPosition(new Vector3());
    const actual=entity.model.getObjectByName('WristL').getWorldQuaternion(new Quaternion());
    const carried=gunQ.clone().invert().multiply(actual).multiply(handFrame.clone().invert());
    mag.quaternion.slerp(carried,Math.min(ease((p-.18)/.05),1-ease((p-.60)/.08)));
    mag.position.copy(weapon.worldToLocal(palm)).sub(anchor.clone().applyQuaternion(mag.quaternion));
    mag.updateMatrixWorld(true);

  }
  weapon.updateMatrixWorld(true);
  for(const[b,q]of thumbBefore)b.quaternion.copy(q);
  poseThumb(entity,'L','magazine',{thumbPoint:mag.localToWorld(anchor.clone().add(v(pistol?-.030:.030,.025,-.035))),weight:weight*amount});
}
function revolver(entity,state,phase,base,waist,gunQ,weight){
  const weapon=entity.weapon,cylinder=weapon.getObjectByName('Cylinder'),pivot=new Vector3().fromArray(REVOLVER_MODEL.reload.cylinderPivot);
  const p=phase.progress,opening=phase.clip==='revolverStart',ending=phase.clip==='revolverEnd';
  const open=opening?ease((p-.20)/.52):ending?1-ease((p-.18)/.52):1;
  const rotation=new Quaternion().setFromAxisAngle(v(0,0,1),-1.22*open);
  cylinder.quaternion.copy(rotation);cylinder.position.copy(pivot).sub(pivot.clone().applyQuaternion(rotation));cylinder.updateMatrixWorld(true);
  if(!cylinder.geometry.boundingBox)cylinder.geometry.computeBoundingBox();
  const box=cylinder.geometry.boundingBox,center=box.getCenter(new Vector3()),rear=box.min.z;
  const rest=cylinder.localToWorld(v(center.x,center.y,rear-.075));
  const cylinderQ=cylinder.getWorldQuaternion(new Quaternion()),handQ=cylinderQ.clone().multiply(VERTICAL_HAND);
  const rounds=cartridges(weapon);rounds.visible=open>.05;rounds.position.copy(cylinder.position);rounds.quaternion.copy(rotation);
  const hole=i=>v(center.x+Math.cos(i*Math.PI/3)*.016,center.y+Math.sin(i*Math.PI/3)*.016,rear+.012);
  for(let i=0;i<6;i++){
    const round=rounds.children[i];round.position.copy(hole(i));round.visible=i<state.initialRounds+state.loaded;

  }
  const spent=weapon.userData.spentCartridges;spent.visible=opening&&!state.ejected&&open>.05;
  spent.position.copy(cylinder.position);spent.quaternion.copy(rotation);
  for(let i=0;i<6;i++){spent.children[i].position.copy(hole(state.initialRounds+i));spent.children[i].visible=i<(state.spentCases||0);}
  if(opening||ending){
    const touch=cylinder.localToWorld(v(center.x+.020,center.y,rear-.008));
    const toRest=opening?ease((p-.78)/.22):1-ease(p/.20);
    const point=touch.clone().lerp(rest,toRest),amount=opening?ease(p/.28):1-ease((p-.72)/.28);
    placeLeft(entity,base,point,handQ,'pinch',weight*amount,'Index4');
  }else{
    const index=state.initialRounds+phase.round,at=hole(index);at.z=rear-.005;
    const seat=cylinder.localToWorld(at.clone()),approach=cylinder.localToWorld(at.clone().add(v(0,0,-.055)));
    const point=path([[0,rest],[.20,waist],[.32,waist],[.55,approach],[.70,seat],[.80,approach],[1,rest]],p);
    placeLeft(entity,base,point,handQ,'pinch',weight,'Index4');
    const carried=weapon.userData.carriedRound;carried.visible=p>=.30&&p<.70;
    if(carried.visible){
      const actual=pinchPoint(entity).add(v(0,0,.012).applyQuaternion(cylinderQ));
      carried.position.copy(weapon.worldToLocal(actual));carried.quaternion.copy(weapon.getWorldQuaternion(new Quaternion()).invert().multiply(cylinderQ));
    }
  }
}
