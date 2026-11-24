import { activeWeapon, itemDefinition } from "./inventory.js";
import { defaultStyle, playerModelAppearance, playerModelScale, QUATERNIUS_MODELS, PLAYER_ANIMATIONS } from "./quaternius-catalog.js";
import { PUNCH_ANIMATION } from './punch-animations.js';
import { WORLD_SCALE } from "./world-scale.js";
import { hasWeaponModel } from './weapon-catalog.js';
import { meleeProgress } from './melee-attacks.js';

const modulo = value => ((value%1)+1)%1;
const clamp01 = value => Math.max(0, Math.min(1, value));

export class PlayerMotion {
  constructor() { this.entities=new WeakMap(); }
  faceShot(player){
    // A committed shot uses the character's actual firing direction. Turning
    // only the gun here can fold the wrist backwards during a fast target swap.
    // Ordinary path changes retain the existing interpolated body turn.
    const record=this.entities.get(player);
    if(record){const yaw=Math.atan2(player.facingX??0,player.facingY??1),changed=Math.abs(yaw-record.yaw)>1e-9;record.yaw=yaw;return changed;}
    return false;
  }
  sample(player,time) {
    const appearance=playerModelAppearance(player),scale=playerModelScale(appearance);
    const definition=QUATERNIUS_MODELS.characters[`${appearance.sex}-${defaultStyle(appearance.sex)}`];
    const clipData=name=>PLAYER_ANIMATIONS.clips[name]||definition.clips[name];
    let record=this.entities.get(player);
    const targetYaw=Math.atan2(player.facingX??0,player.facingY??1);
    if(!record||time<record.time){record={time,x:player.x,y:player.y,yaw:targetYaw,phase:0,attackStart:-Infinity,attackTimer:0,shots:player.shots||0};this.entities.set(player,record);}
    const delta=Math.max(0,time-record.time),combat=player.combat||{},item=activeWeapon(player),weapon=itemDefinition(item);
    const firearm=weapon?.weaponKind==="firearm";
    const attack=combat.meleeAttack;
    const freshAttack=attack&&attack.sequence!==record.meleeSequence&&!attack.cancelled
      && (item?.id??null)===attack.weaponId&&attack.elapsed<attack.duration;
    if(freshAttack){
      record.attackStart=time-attack.elapsed;
      record.attackClip=attack.clip;
      record.attackWeaponId=item?.id;
      record.attackDuration=attack.duration;
    }else if((combat.attackTimer||0)>record.attackTimer+.05){
      record.attackStart=time;
      record.attackClip=weapon?"Sword_Slash":PUNCH_ANIMATION.name;
      record.attackWeaponId=item?.id;
      record.attackDuration=weapon?0:Math.min(PUNCH_ANIMATION.duration,combat.attackCooldown||0);
    }
    if((player.shots||0)>record.shots){
      record.attackStart=time;record.attackClip=hasWeaponModel(item)?null:"Gun_Shoot";record.attackDuration=0;
    }
    const releasedIntoMotion = player.moving && attack && time - record.attackStart >= attack.releaseAt;
    if(record.attackDuration&&(attack?.cancelled||item?.id!==record.attackWeaponId||player.running||releasedIntoMotion)){
      record.attackClip=null;record.attackDuration=0;
    }
    const attackAge=time-record.attackStart,attackData=clipData(record.attackClip),crouched=player.stance==='sneak'&&!player.running;
    const gait = player.running ? 'Run' : crouched ? 'Crouch_Walk' : 'Walk';
    let clip=player.moving?gait:(crouched?'Crouch_Idle':firearm?(combat.enabled?'Idle_Gun_Pointing':'Idle_Gun'):'Idle_Neutral');
    if(item?.type==='claw_hammer'&&!player.moving&&!crouched)clip='Hammer_Idle';
    if(!player.moving&&!crouched&&!combat.enabled&&['revolver_44','pistol_9mm'].includes(item?.type))clip='Idle_Neutral';
    if (player.moving && delta > 0) {
      const dx = player.x - record.x, dy = player.y - record.y, distance = Math.hypot(dx, dy);
      const travel = distance * WORLD_SCALE.metersPerTile;
      const backwards = !player.running && dx * (player.facingX ?? 0) + dy * (player.facingY ?? 1) < -.2 * distance;
      if (travel < 3) record.phase = modulo(record.phase + (backwards ? -1 : 1) * travel / (clipData(gait).distance * scale));
    }
    let progress, footwork, blendDuration;
    if(player.dead){clip="Death";progress=1;}
    else if(record.attackDuration&&attackAge<record.attackDuration){
      clip=record.attackClip;
      progress=attack?.contacts?meleeProgress(attack,attackAge):attackAge/record.attackDuration;
      if (attack?.contacts) blendDuration = Math.min(.16, attack.contacts[0] / 2);
      if (attack?.contacts && player.moving) {
        const last = attack.contacts.at(-1);
        const weight = attackAge < last ? clamp01((attack.lockAt - attackAge) / .10)
          : clamp01((attackAge - last) / Math.min(.12, attack.releaseAt - last));
        if (weight > 0) footwork = { clip: gait, progress: record.phase, weight };
      }
    }
    else if(attackData&&attackAge<attackData.duration-.1){clip=record.attackClip;progress=Math.min(1,(attackAge+.1)/attackData.duration);}
    else {
      const data=clip==='Hammer_Idle'?{duration:1}:clipData(clip);
      if(!player.moving&&delta>0)record.phase=modulo(record.phase+delta/data.duration);
      progress=record.phase;
    }
    // A new path changes the destination immediately, not the body's orientation
    // or foot phase. Turn along the shortest arc, including across +/- PI.
    if(delta>0){
      const turn=Math.atan2(Math.sin(targetYaw-record.yaw),Math.cos(targetYaw-record.yaw));
      record.yaw+=Math.max(-9*delta,Math.min(9*delta,turn*(1-Math.exp(-14*delta))));
      record.yaw=Math.atan2(Math.sin(record.yaw),Math.cos(record.yaw));
    }
    Object.assign(record,{time,x:player.x,y:player.y,attackTimer:combat.attackTimer||0,shots:player.shots||0,meleeSequence:attack?.sequence});
    return {appearance,scale,clip,progress,delta:Math.min(.1,delta),yaw:record.yaw,crouched,footwork,blendDuration};
  }
}
