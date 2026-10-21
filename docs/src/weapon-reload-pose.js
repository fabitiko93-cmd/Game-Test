import {CylinderGeometry,Group,Mesh,MeshStandardMaterial,Quaternion,Vector3} from 'three';
import {applyWeaponClip} from './weapon-animation.js';
import {reloadPhase} from './weapon-reload.js';
import {fitSupportHand} from './rifle-pose.js';
import {REVOLVER_MODEL} from './weapon-catalog.js';

const ease=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
const cartridgeGeometry=new CylinderGeometry(.0055,.0055,.029,8),brass=new MeshStandardMaterial({color:0x9c7843,roughness:.55});
function path(keys,phase){
  for(let i=1;i<keys.length;i++)if(phase<=keys[i][0])return keys[i-1][1].clone().lerp(keys[i][1],ease((phase-keys[i-1][0])/(keys[i][0]-keys[i-1][0])));
  return keys.at(-1)[1].clone();
}
export function resetWeaponParts(weapon){
  for(const [name,pose] of weapon?.userData.partPose||[]){const part=weapon.getObjectByName(name);part.position.copy(pose.position);part.quaternion.copy(pose.rotation);part.visible=pose.visible;}
  if(weapon?.userData.cartridges)weapon.userData.cartridges.visible=false;
}
function cartridges(weapon){
  if(!weapon.userData.cartridges){
    const group=new Group();group.name='ReloadCartridges';
    for(let i=0;i<6;i++){const round=new Mesh(cartridgeGeometry,brass);round.rotation.x=Math.PI/2;group.add(round);}
    weapon.add(group);weapon.userData.cartridges=group;
  }
  return weapon.userData.cartridges;
}
export function applyReloadPose(entity,player){
  const state=player.combat?.reload,weapon=entity.weapon;
  if(!state||state.weaponId!==weapon?.userData.weaponId||player.dead)return;
  const phase=reloadPhase(state),weight=Math.min(ease(state.elapsed/.14),ease((state.duration-state.elapsed)/.17));
  const neutralLeft=entity.model.getObjectByName('WristL').getWorldPosition(new Vector3());
  applyWeaponClip(entity,player,phase.clip,phase.progress,weight);
  // Nonmodular legacy weapons still get the authored character motion.
  if(!weapon.userData.partPose)return;
  weapon.updateMatrixWorld(true);
  const grip=weapon.localToWorld(new Vector3().fromArray(weapon.userData.grips?.left||[.145,.03,.255]));
  const waist=entity.root.localToWorld(new Vector3(.24,.88,.12));
  let leftGoal;
  if(state.kind==='cylinder'){
    const pivot=new Vector3().fromArray(REVOLVER_MODEL.reload.cylinderPivot),cylinder=weapon.getObjectByName('Cylinder');
    const open=phase.clip==='revolverStart'?ease((phase.progress-.12)/.55):phase.clip==='revolverEnd'?1-ease((phase.progress-.12)/.68):1;
    const rotation=new Quaternion().setFromAxisAngle(new Vector3(0,0,1),open*1.12);
    cylinder.quaternion.copy(rotation);cylinder.position.copy(pivot).sub(pivot.clone().applyQuaternion(rotation));
    if(!cylinder.geometry.boundingBox)cylinder.geometry.computeBoundingBox();
    const center=cylinder.geometry.boundingBox.getCenter(new Vector3()),rear=center.clone().setZ(cylinder.geometry.boundingBox.min.z-.014);
    const handPoint=cylinder.localToWorld(rear.clone().add(new Vector3(.12,0,-.02)));
    if(phase.clip==='revolverStart')leftGoal=grip.clone().lerp(handPoint,ease(phase.progress*2));
    else if(phase.clip==='revolverEnd')leftGoal=handPoint.clone().lerp(neutralLeft,ease((phase.progress-.45)/.55));
    else leftGoal=path([[0,handPoint],[.25,waist],[.48,waist],[.73,handPoint],[1,handPoint]],phase.progress);
    const rounds=cartridges(weapon);rounds.visible=open>.25;rounds.position.copy(cylinder.position);rounds.quaternion.copy(rotation);
    for(let i=0;i<rounds.children.length;i++){
      const round=rounds.children[i],a=i*Math.PI/3;
      round.position.set(center.x+Math.cos(a)*.019,center.y+Math.sin(a)*.019,rear.z-.006);
      round.visible=i<state.initialRounds+state.loaded;
      // Spent cases visibly leave the open cylinder during the opening clip.
      if(phase.clip==='revolverStart'&&phase.progress>.48&&i>=state.initialRounds&&i<state.initialRounds+state.planned){
        const t=(phase.progress-.48)/.52;round.visible=t<.9;
        round.position.z-=t*.20;round.position.y-=t*t*.18;round.position.x+=Math.cos(a)*t*.04;
      }
    }
  }else{
    const magazine=weapon.getObjectByName(weapon.userData.magazinePart),anchor=new Vector3().fromArray(weapon.userData.anchors?.magazine||[0,-.08,.16]);
    const grab=weapon.localToWorld(anchor.clone().add(new Vector3(.13,-.025,-.02)));
    const p=phase.progress;
    leftGoal=path([[0,grip],[.19,grab],[.36,waist],[.51,waist],[.68,grab],[.80,grab],[1,grip]],p);
    if(magazine&&state.kind==='magazine'){
      const detached=(p>.20&&p<.47)||(p>.51&&p<.78);
      magazine.visible=p>.47&&p<=.51?false:(p>.51||weapon.userData.partPose.get(magazine.name).visible);
      if(detached){
        const movement=weapon.worldToLocal(leftGoal.clone()).sub(anchor.clone().add(new Vector3(.13,-.025,-.02)));
        magazine.position.add(movement);
      }
    }
  }
  leftGoal.lerp(neutralLeft,1-weight);
  fitSupportHand(entity,leftGoal);
  entity.root.updateMatrixWorld(true);
}
