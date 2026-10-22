import { activeWeapon, itemDefinition } from "./inventory.js";
import { defaultStyle, playerModelAppearance, playerModelScale, QUATERNIUS_MODELS, PLAYER_ANIMATIONS } from "./quaternius-catalog.js";
import { WORLD_SCALE } from "./world-scale.js";
import { hasWeaponModel } from './weapon-catalog.js';

const modulo = value => ((value%1)+1)%1;

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
    const delta=Math.max(0,time-record.time),combat=player.combat||{},weapon=itemDefinition(activeWeapon(player));
    const firearm=weapon?.weaponKind==="firearm";
    if((combat.attackTimer||0)>record.attackTimer+.05){record.attackStart=time;record.attackClip=weapon?"Sword_Slash":"Punch_Right";}
    if((player.shots||0)>record.shots){record.attackStart=time;record.attackClip=hasWeaponModel(activeWeapon(player))?null:"Gun_Shoot";}
    const attackAge=time-record.attackStart,attackData=clipData(record.attackClip),crouched=player.stance==='sneak'&&!player.running;
    let clip=player.moving?(player.running?'Run':crouched?'Crouch_Walk':'Walk'):(crouched?'Crouch_Idle':firearm?(combat.enabled?'Idle_Gun_Pointing':'Idle_Gun'):'Idle_Neutral');
    if(!player.moving&&!crouched&&!combat.enabled&&['revolver_44','pistol_9mm'].includes(activeWeapon(player)?.type))clip='Idle_Neutral';
    let progress;
    if(player.dead){clip="Death";progress=1;}
    else if(attackData&&attackAge<attackData.duration-.1){clip=record.attackClip;progress=Math.min(1,(attackAge+.1)/attackData.duration);}
    else {
      const data=clipData(clip);
      if(player.moving) {
        const travel=Math.hypot(player.x-record.x,player.y-record.y)*WORLD_SCALE.metersPerTile;
        if(delta>0&&travel<3)record.phase=modulo(record.phase+travel/(data.distance*scale));
      } else if(delta>0)record.phase=modulo(record.phase+delta/data.duration);
      progress=record.phase;
    }
    // A new path changes the destination immediately, not the body's orientation
    // or foot phase. Turn along the shortest arc, including across +/- PI.
    if(delta>0){
      const turn=Math.atan2(Math.sin(targetYaw-record.yaw),Math.cos(targetYaw-record.yaw));
      record.yaw+=Math.max(-9*delta,Math.min(9*delta,turn*(1-Math.exp(-14*delta))));
      record.yaw=Math.atan2(Math.sin(record.yaw),Math.cos(record.yaw));
    }
    Object.assign(record,{time,x:player.x,y:player.y,attackTimer:combat.attackTimer||0,shots:player.shots||0});
    return {appearance,scale,clip,progress,delta:Math.min(.1,delta),yaw:record.yaw,crouched};
  }
}
