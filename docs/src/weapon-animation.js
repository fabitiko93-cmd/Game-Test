import {Quaternion} from 'three';
import MOTIONS from '../assets/quaternius/weapon-animations.json' with {type:'json'};

export function applyWeaponClip(entity,player,name,progress,weight=1){
  const clip=MOTIONS.rigs[player.appearance?.sex==='female'?'female':'male'][name];
  const frame=Math.max(0,Math.min(1,progress))*(clip.frames.length-1),a=Math.floor(frame),b=Math.min(a+1,clip.frames.length-1);
  for(let i=0;i<MOTIONS.bones.length;i++){
    const bone=entity.model.getObjectByName(MOTIONS.bones[i]);if(!bone)continue;
    const rotation=new Quaternion().fromArray(clip.frames[a],i*4).slerp(new Quaternion().fromArray(clip.frames[b],i*4),frame-a);
    bone.quaternion.slerp(rotation,weight);
  }
  entity.root.updateMatrixWorld(true);
}
export const WEAPON_MOTIONS=MOTIONS;
