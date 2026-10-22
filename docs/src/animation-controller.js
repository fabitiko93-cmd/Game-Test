import {activeWeapon,itemDefinition} from './inventory.js';
import {hasWeaponModel} from './weapon-catalog.js';
import {applyRiflePose} from './rifle-pose.js';
import {applyReloadPose,resetWeaponParts} from './weapon-reload-pose.js';
import {applyWeaponCycle} from './weapon-cycle.js';
import {applyWeaponClip} from './weapon-animation.js';
import {reloadPhase} from './weapon-reload.js';
import {recoilPose} from './weapon-recoil.js';
import {editFingers} from './animation-targets.js';

// One ordered evaluation owns the final skeleton. Pose modules supply the
// posture/action targets; rendering and socket queries reuse its result.
export class AnimationController{
  evaluate(entity,player,pose,posture){
    resetWeaponParts(entity.weapon);
    entity.animationTargets={};
    const weapon=activeWeapon(player),reload=player.combat?.reload;
    entity.animationOwners={legs:'Bewegung',body:'Haltung',right:'Waffenhaltung',left:'Waffenhaltung',weapon:'Schussmechanik'};
    if(player.dead){entity.animationOwners={legs:'Tod',body:'Tod',right:'Tod',left:'Tod',weapon:'Ruhe'};return;}
    if(hasWeaponModel(weapon)){
      applyRiflePose(entity,player,pose.delta,posture);
      applyReloadPose(entity,player,pose.delta);
      if(reload||entity.reloadLast){entity.animationOwners.right='Nachladen / Rückkehr';entity.animationOwners.left='Nachladen / Rückkehr';}
      editFingers(entity);
      applyWeaponCycle(entity,player);
    }else if(itemDefinition(weapon)?.weaponKind==='firearm'){
      const phase=reloadPhase(reload),affected=['Torso','Chest','ShoulderL','ShoulderR','UpperArmL','UpperArmR','LowerArmL','LowerArmR','WristL','WristR'].map(n=>entity.model.getObjectByName(n)).filter(Boolean);
      entity.rifleRestore=new Map(affected.map(b=>[b,b.quaternion.clone()]));
      if(phase)applyWeaponClip(entity,player,phase.clip,phase.progress);
      else{
        const kick=recoilPose(player,weapon?.id,weapon?.type==='pistol_9mm');
        entity.model.getObjectByName('UpperArmR').rotateZ(kick.pitch*.35);
        entity.model.getObjectByName('WristR').rotateX(-kick.pitch*.65);entity.root.updateMatrixWorld(true);
      }
    }
  }
}

// Gameplay state advances explicitly before drawing. A shot keeps its first
// visible peak even when the simulation and first displayed frame are apart.
export function presentFreshShot(player){
  const impulse=player?.combat?.shotImpulse;
  if(impulse?.fresh){impulse.age=0;impulse.fresh=false;}
}

export function animationInputKey(player,time,revision=0){
  const c=player.combat||{},w=activeWeapon(player),r=c.reload,s=c.shotImpulse;
  return JSON.stringify([time,revision,player.x,player.y,player.facingX,player.facingY,player.moving,player.running,player.stance,player.dead,player.shots,
    c.enabled,c.targetId,c.aim,c.triggerHeld,c.attackTimer,w?.id,w?.type,w?.magazine?.id,w?.magazine?.rounds,w?.rounds,w?.slideLocked,w?.cylinderIndex,
    r?.weaponId,r?.elapsed,r?.loaded,r?.committed,s?.weaponId,s?.age,s?.power,s?.fresh,player.appearance,player.equipment,w?.mods]);
}
