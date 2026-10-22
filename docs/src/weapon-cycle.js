import {Quaternion,Vector3} from 'three';
import {activeWeapon,itemDefinition} from './inventory.js';

export function slideCycle(age,duration=.085){
  if(age<0||age>=duration)return 0;
  const t=age/duration;return t<.25?t/.25:1-(t-.25)/.75;
}
export function applyWeaponCycle(entity,player){
  const root=entity.weapon,item=activeWeapon(player);if(!root||!item)return;
  const impulse=player.combat?.shotImpulse,mechanism=root.userData.mechanism;
  const current=impulse?.weaponId===item.id,age=current?impulse.age:Infinity;
  if(item.type==='revolver_44'){
    const cylinder=root.getObjectByName('Cylinder');if(!cylinder||player.combat?.reload)return;
    if(!cylinder.geometry.boundingBox)cylinder.geometry.computeBoundingBox();
    const pivot=cylinder.geometry.boundingBox.getCenter(new Vector3());pivot.z=0;
    const turn=((item.cylinderIndex||0)-(current&&age<.05?1-age/.05:0))*Math.PI/3;
    const q=new Quaternion().setFromAxisAngle(new Vector3(0,0,1),turn);
    cylinder.quaternion.premultiply(q);cylinder.position.add(pivot.clone().sub(pivot.clone().applyQuaternion(q)));
    const hammer=root.getObjectByName('Hammer');if(hammer&&age<.09)hammer.rotateX(-.2*(1-age/.09));
    return;
  }
  if(!mechanism)return;
  const reload=player.combat?.reload,progress=reload?.weaponId===item.id?reload.elapsed/reload.duration:null;
  const empty=(item.magazine?.rounds||0)===0,locked=Boolean(item.slideLocked)&&(progress===null||progress<.86)&&(!current||age>=mechanism.cycle*.25);
  const rack=progress!==null&&progress>=.80&&progress<.94?Math.sin((progress-.8)/.14*Math.PI):0;
  const cycle=Math.max(slideCycle(age,mechanism.cycle),locked?1:0,rack);
  const slide=root.getObjectByName('Slide');if(slide)slide.position.z-=mechanism.slideTravel*cycle;
  // The optic plate follows the slide. Receiver-mounted lamp and suppressor
  // keep their own sockets; the Desert Eagle's barrel stays fixed.
  for(const name of ['Reflex','OpticMount']){const part=root.getObjectByName(name);if(part?.visible)part.position.z-=mechanism.slideTravel*cycle;}
  const barrel=root.getObjectByName('Barrel');if(barrel&&mechanism.barrelTilt){const pivot=new Vector3().fromArray(mechanism.barrelPivot),q=new Quaternion().setFromAxisAngle(new Vector3(1,0,0),mechanism.barrelTilt*cycle);barrel.quaternion.premultiply(q);barrel.position.add(pivot.clone().sub(pivot.clone().applyQuaternion(q)));barrel.position.z-=.004*cycle;}
  const hammer=root.getObjectByName('Hammer');if(hammer&&age<.1){const p=new Vector3().fromArray(mechanism.hammerPivot),q=new Quaternion().setFromAxisAngle(new Vector3(1,0,0),-.22*cycle);hammer.quaternion.premultiply(q);hammer.position.add(p.clone().sub(p.clone().applyQuaternion(q)));}
  const magazine=root.getObjectByName(root.userData.magazinePart);
  for(const name of ['FeedRound','MagazineRounds']){
    const part=root.getObjectByName(name);if(!part)continue;
    part.visible=Boolean(magazine?.visible)&&!empty&&(name==='FeedRound'||item.magazine.rounds>1);
    if(magazine){part.position.copy(magazine.position);part.quaternion.copy(magazine.quaternion);}
  }
}
