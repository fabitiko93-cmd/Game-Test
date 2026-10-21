import { Vector3 } from 'three';
import { PlayerModels } from './player-models.js';
import { playerHeight, playerModelAppearance } from './quaternius-catalog.js';
import { activeWeapon } from './inventory.js';
import { weaponModelSignature } from './weapon-models.js';
import { applyRiflePose } from './rifle-pose.js';
import { hasWeaponModel } from './weapon-catalog.js';

const ANCHORS={head:'Head',torso:'Chest',legs:'UpperLegL',feet:'FootL',back:'Chest',mainHand:'WristR',offHand:'WristL'};

// A separate posed rig keeps menu rotation and inspection poses out of the world.
// Geometry, outfit assets, weapon parts and the WebGL context remain shared.
export class CharacterInspection {
  constructor(pass,library,weapons){this.pass=pass;this.models=new PlayerModels(pass,library);this.models.weapons=weapons;this.player={};}
  draw(canvas,player,yaw=0){
    const appearance=playerModelAppearance(player),rect=canvas.getBoundingClientRect();
    const key=JSON.stringify([appearance,player.equipment,weaponModelSignature(activeWeapon(player)),yaw,rect.width,rect.height,globalThis.devicePixelRatio,this.pass.status]);
    if(this.key===key)return this.anchors;
    Object.assign(this.player,player,{moving:false,running:false,dead:false,stance:'walk',combat:{enabled:false,aim:0,recoil:0},hurtFlash:0});
    const entity=this.models.entity(this.player,appearance);
    if(!entity)return null;
    this.models.equip(entity,this.player);
    if(activeWeapon(this.player)&&!entity.weapon)return null;
    const clip=activeWeapon(this.player)&&!entity.weapon?.userData.grips?.handgun?'Idle_Gun':'Idle_Neutral';
    this.models.pose(entity,{clip,progress:.2,delta:1,yaw});
    if(hasWeaponModel(activeWeapon(this.player)))applyRiflePose(entity,this.player,1,'carry');
    const height=playerHeight(appearance),project=this.pass.drawInspection(canvas,entity.root,{height:height*1.16,center:new Vector3(0,height*.5,0)});
    if(!project)return null;
    this.anchors=Object.fromEntries(Object.entries(ANCHORS).map(([slot,name])=>[slot,project(entity.model.getObjectByName(name).getWorldPosition(new Vector3()))]));
    this.entity=entity;this.key=key;return this.anchors;
  }
}
