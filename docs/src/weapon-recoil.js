import {weaponStats} from './inventory.js';

// Visual kick is deliberately independent of the accuracy/recovery accumulator.
// Every shot gets a sharp rise followed by a short, continuous return.
export function kickWeapon(player,weapon){
  const stats=weaponStats(weapon),previous=player.combat.shotImpulse;
  const remaining=previous?Math.exp(-previous.age*20)*previous.power:0;
  player.combat.shotImpulse={weaponId:weapon.id,age:0,power:Math.min(1.5,(stats.recoilPerShot||.55)+remaining*.3),
    side:((player.shots||0)%2?1:-1)};
}

export function recoilPose(player,weaponId,handgun=false){
  const impulse=player.combat?.shotImpulse;
  if(!impulse||impulse.weaponId!==weaponId||impulse.age>.5)return {pitch:0,back:0,roll:0};
  const pulse=Math.exp(-Math.max(0,impulse.age-.018)*16),power=impulse.power*pulse;
  return {pitch:power*(handgun?.30:.23),back:power*(handgun?.055:.075),roll:power*.018*impulse.side};
}
