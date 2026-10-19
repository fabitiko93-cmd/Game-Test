import { Quaternion } from 'three';
import MOTIONS from '../assets/quaternius/rifle-animations.json' with { type: 'json' };

const sample=(clip,phase,index)=>{
  const frame=((phase%1)+1)%1*(clip.frames.length-1),a=Math.floor(frame),b=Math.min(a+1,clip.frames.length-1);
  return new Quaternion().fromArray(clip.frames[a],index*4).slerp(new Quaternion().fromArray(clip.frames[b],index*4),frame-a);
};

// Apply the authored upper-body motion before fitting this AK. The arm solver
// supplies body-relative elbow planes and grip-aligned forearm roll; the leg
// tracks remain intact.
export function applyRifleAnimation(entity,player,blend,delta){
  const clips=MOTIONS.rigs[player.appearance?.sex==='female'?'female':'male'];
  entity.rifleTime=(entity.rifleTime||0)+Math.max(0,delta);
  const travelPhase=entity.poseProgress??0;
  const firing=Math.min(1,Math.max(0,player.combat?.recoil||0)*3);
  for(let i=0;i<MOTIONS.bones.length;i++){
    const bone=entity.model.getObjectByName(MOTIONS.bones[i]);if(!bone)continue;
    const carry=sample(clips.hip,.5,i),hip=sample(clips.hip,travelPhase,i),aim=sample(clips.aim,entity.rifleTime/clips.aim.duration,i);
    if(firing>0)aim.slerp(sample(clips.shoot,entity.rifleTime/clips.shoot.duration,i),firing);
    const moving=blend.hip+blend.aim;
    if(moving>0){hip.slerp(aim,blend.aim/moving);carry.slerp(hip,moving);}
    bone.quaternion.copy(carry);
  }
  entity.root.updateMatrixWorld(true);
}
