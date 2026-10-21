import { AnimationMixer, Box3, Group, LoopOnce, Quaternion, Skeleton, Vector3 } from "three";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { activeWeapon, itemDefinition } from "./inventory.js";
import { defaultStyle, playerModelScale, QUATERNIUS_MODELS } from "./quaternius-catalog.js";
import { PlayerMotion } from "./player-motion.js";
import { heldEquipment } from "./held-equipment.js";
import { WeaponModels, weaponModelSignature } from "./weapon-models.js";
import { hasWeaponModel } from './weapon-catalog.js';
import { applyRiflePose, captureRifleRig, restoreRiflePose } from "./rifle-pose.js";
import { createSoleProbes, drawSoleShadows, sampleSoleContacts } from "./character-shadow.js";
import {applyReloadPose,resetWeaponParts} from './weapon-reload-pose.js';
import {applyWeaponClip} from './weapon-animation.js';
import {reloadPhase} from './weapon-reload.js';
import {recoilPose} from './weapon-recoil.js';
import {metersToTiles} from './world-scale.js';

const PARTS=["head","torso","legs","feet"];

function rebindPart(original,model) {
  const part=original.clone(true);
  part.traverse(mesh=>{
    if(!mesh.isSkinnedMesh)return;
    const skeleton=new Skeleton(mesh.skeleton.bones.map(bone=>model.getObjectByName(bone.name)),mesh.skeleton.boneInverses);
    mesh.bind(skeleton,mesh.bindMatrix.clone());mesh.frustumCulled=false;
  });
  return part;
}

export class PlayerModels {
  constructor(pass,library) {
    this.pass=pass;this.library=library;this.entities=new Map();this.used=new Set();this.prepared=new Map();this.motion=new PlayerMotion();this.weapons=new WeaponModels();
    this.ready=Promise.all(["male-Casual_2","female-Casual","male-Worker","female-Worker","male-Swat","male-Adventurer","Knife","player-motion"].map(key=>library.request(key)));
  }
  beginFrame(){this.used.clear();this.prepared.clear();}

  entity(player,appearance) {
    const baseKey=`${appearance.sex}-${defaultStyle(appearance.sex)}`,base=this.library.get(baseKey);
    const motions=this.library.get('player-motion');
    const needed=PARTS.map(slot=>this.library.get(appearance[slot]));if(!base||!motions||needed.some(x=>!x))return null;
    const signature=PARTS.map(slot=>appearance[slot]).join("|");
    let entity=this.entities.get(player);
    if(entity?.signature===signature)return entity;
    if(entity)this.release(entity);
    const model=clone(base.scene),root=new Group();root.add(model);
    model.traverse(o=>{if(o.isMesh)o.visible=false;});
    const armature=model.getObjectByName("CharacterArmature");
    const clothing={};
    for(let i=0;i<PARTS.length;i++) {
      const slot=PARTS[i],name=QUATERNIUS_MODELS.characters[appearance[slot]].parts[slot];
      const part=rebindPart(needed[i].scene.getObjectByName(name),model);
      clothing[slot]=part;
      part.traverse(o=>{o.visible=true;});armature.add(part);
    }
    const mixer=new AnimationMixer(model),actions=new Map([...base.animations,...motions.animations].map(clip=>{
      const action=mixer.clipAction(clip).setEffectiveTimeScale(0);
      if(!["Walk","Run","Idle_Neutral","Idle_Gun","Idle_Gun_Pointing","Crouch_Walk","Crouch_Idle"].includes(clip.name)){action.setLoop(LoopOnce,1);action.clampWhenFinished=true;}
      return [clip.name,action];
    }));
    root.scale.setScalar(playerModelScale(appearance));
    root.position.y=QUATERNIUS_MODELS.characters[appearance.feet].groundOffset*root.scale.y;
    entity={root,model,mixer,actions,signature,current:null,clip:null,weapon:null,weaponKind:null};
    entity.rifleHands=captureRifleRig(model);
    const neutral=actions.get('Idle_Neutral').getClip();
    entity.handgunCarry=new Map(['ShoulderR','UpperArmR','LowerArmR','WristR'].map(name=>{
      const bone=model.getObjectByName(name),track=neutral.tracks.find(t=>t.name===`${name}.quaternion`);
      return [bone,track?new Quaternion().fromArray(track.createInterpolant().evaluate(neutral.duration*.2)):bone.quaternion.clone()];
    }));
    entity.soles=createSoleProbes(root,clothing.feet);
    this.entities.set(player,entity);return entity;
  }

  equip(entity,player) {
    const item=activeWeapon(player),definition=itemDefinition(item),kind=definition?.weaponKind||null;
    const bag=Boolean(player.equipment?.back),key=`${kind}-${weaponModelSignature(item)}-${bag}`;
    if(entity.weaponKind===key)return;
    entity.reloadLast=null;entity.supportElbow=null;entity.supportTwist=null;
    if(entity.weapon){
      entity.weapon.parent.remove(entity.weapon);
      if(entity.weapon.userData.generated)entity.weapon.traverse(o=>o.geometry?.dispose());
      entity.weapon=null;
    }
    if(entity.backpack){entity.backpack.parent.remove(entity.backpack);entity.backpack=null;}
    const generated=heldEquipment(item?.type);
    if(hasWeaponModel(item)) {
      const model=this.weapons.create(item);if(!model)return;
      entity.weapon=model;entity.model.getObjectByName("WristR").add(model);
    } else if(generated) {
      entity.weapon=generated;generated.userData.generated=true;entity.model.getObjectByName("WristR").add(generated);
    } else if(kind==="firearm") {
      const gun=this.library.get("male-Swat");if(!gun)return;
      entity.weapon=rebindPart(gun.scene.getObjectByName("Pistol"),entity.model);entity.model.getObjectByName("CharacterArmature").add(entity.weapon);
    } else if(item) {
      const knife=this.library.get("Knife");if(!knife)return;
      entity.weapon=clone(knife.scene);entity.weapon.position.set(0,.035,.08);
      entity.model.getObjectByName("WristR").add(entity.weapon);
    }
    if(bag) {
      const asset=this.library.get("male-Adventurer");if(!asset)return;
      const original=asset.scene.getObjectByName("Backpack");
      if(original){entity.backpack=rebindPart(original,entity.model);entity.model.getObjectByName("CharacterArmature").add(entity.backpack);}
    }
    if(entity.weapon){entity.weapon.userData.weaponId=item?.id;entity.weapon.userData.weaponType=item?.type;}
    entity.weaponKind=key;
  }

  pose(entity,pose) {
    restoreRiflePose(entity);
    const action=entity.actions.get(pose.clip);
    if(entity.clip!==pose.clip){action.reset().setEffectiveTimeScale(0).setEffectiveWeight(1).play();if(entity.current)entity.current.crossFadeTo(action,.16,false);entity.current=action;entity.clip=pose.clip;}
    action.time=Math.min(.999999,pose.progress)*action.getClip().duration;entity.mixer.update(pose.delta);
    entity.poseProgress=pose.progress;
    for(const other of entity.actions.values())if(other!==action&&other.getEffectiveWeight()===0)other.stop();
    entity.root.rotation.y=pose.yaw;entity.root.updateMatrixWorld(true);
  }

  prepare(player,time) {
    const pose=this.motion.sample(player,time),entity=this.entity(player,pose.appearance);if(!entity)return false;
    this.used.add(player);this.equip(entity,player);this.pose(entity,pose);
    resetWeaponParts(entity.weapon);
    if(hasWeaponModel(activeWeapon(player))){applyRiflePose(entity,player,pose.delta);applyReloadPose(entity,player,pose.delta);}
    else if(itemDefinition(activeWeapon(player))?.weaponKind==='firearm'){
      const phase=reloadPhase(player.combat?.reload);
      const affected=['Torso','Chest','ShoulderL','ShoulderR','UpperArmL','UpperArmR','LowerArmL','LowerArmR','WristL','WristR'].map(n=>entity.model.getObjectByName(n)).filter(Boolean);
      entity.rifleRestore=new Map(affected.map(b=>[b,b.quaternion.clone()]));
      if(phase)applyWeaponClip(entity,player,phase.clip,phase.progress);
      else {
        const kick=recoilPose(player,activeWeapon(player)?.id,activeWeapon(player)?.type==='pistol_9mm');
        const arm=entity.model.getObjectByName('UpperArmR'),wrist=entity.model.getObjectByName('WristR');
        arm.rotateZ(kick.pitch*.35);wrist.rotateX(-kick.pitch*.65);entity.root.updateMatrixWorld(true);
      }
    }
    this.prepared.set(player,{entity,time});return entity;
  }

  shotMuzzle(player,time){
    this.motion.faceShot(player);
    const entity=this.prepare(player,time);if(!entity?.weapon)return null;
    if(hasWeaponModel(activeWeapon(player))){
      // Sample the currently visible grip without changing its posture or blend.
      // The following shot impulse acts on that same pose, including hip fire.
      entity.weapon.updateMatrixWorld(true);
      const point=entity.weapon.localToWorld(entity.weapon.userData.muzzle.clone());
      const direction=new Vector3(0,0,1).applyQuaternion(entity.weapon.getWorldQuaternion(new Quaternion()));
      return {x:player.x+metersToTiles(point.x),y:player.y+metersToTiles(point.z),height:point.y,direction:{x:direction.x,y:direction.z,height:direction.y}};
    }
    const direction=new Vector3(player.facingX||0,0,player.facingY??1).normalize(),points=[];
    entity.weapon.traverseVisible(mesh=>{if(!mesh.isMesh)return;mesh.skeleton?.update();const positions=mesh.geometry.attributes.position;
      for(let i=0;i<positions.count;i++)points.push(mesh.getVertexPosition(i,new Vector3()).applyMatrix4(mesh.matrixWorld));});
    if(!points.length)return null;
    const furthest=Math.max(...points.map(p=>p.dot(direction))),front=points.filter(p=>p.dot(direction)>furthest-.002);
    const point=front.reduce((sum,p)=>sum.add(p),new Vector3()).multiplyScalar(1/front.length);
    return {x:player.x+metersToTiles(point.x),y:player.y+metersToTiles(point.z),height:point.y};
  }

  drawShadow(ctx,player,time,point) {
    // Preserve a shot's full kick until its first visible frame, even when the
    // update had a long delta. Gameplay cooldowns continue to tick normally.
    if(player.combat?.shotImpulse?.fresh){player.combat.shotImpulse.age=0;player.combat.shotImpulse.fresh=false;}
    const entity=this.prepare(player,time);if(!entity)return false;
    entity.root.updateMatrixWorld(true);
    drawSoleShadows(ctx,sampleSoleContacts(entity.soles),point,entity.root.scale.y);return true;
  }

  draw(ctx,player,time,point) {
    const prepared=this.prepared.get(player);
    const entity=prepared?.time===time?prepared.entity:this.prepare(player,time);if(!entity)return false;
    this.prepared.delete(player);
    return this.pass.draw(ctx,entity.root,point,{software:true,hurt:player.hurtFlash>0});
  }

  drawCorpse(ctx,corpse,point) {
    const appearance=corpse.playerAppearance,entity=this.entity(corpse,appearance);if(!entity)return false;this.used.add(corpse);
    if(!entity.corpse){
      this.pose(entity,{clip:"Death",progress:1,delta:1,yaw:corpse.facingYaw||0,crouched:false});
      entity.root.updateMatrixWorld(true);const bounds=new Box3().setFromObject(entity.root,true);
      entity.root.position.add(new Vector3(-(bounds.min.x+bounds.max.x)/2,-bounds.min.y,-(bounds.min.z+bounds.max.z)/2));
      entity.corpse=true;
    }
    return this.pass.draw(ctx,entity.root,point,{software:true});
  }

  release(entity) {
    entity.mixer.stopAllAction();entity.mixer.uncacheRoot(entity.model);
    const skeletons=new Set();entity.root.traverse(o=>{if(o.isSkinnedMesh)skeletons.add(o.skeleton);});for(const skeleton of skeletons)skeleton.dispose();
    if(entity.weapon?.userData.generated)entity.weapon.traverse(o=>o.geometry?.dispose());
  }
  endFrame(){for(const [player,entity] of this.entities)if(!this.used.has(player)){this.release(entity);this.entities.delete(player);}}
}
