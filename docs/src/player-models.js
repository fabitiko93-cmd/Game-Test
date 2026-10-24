import {AnimationController,animationInputKey,presentFreshShot} from './animation-controller.js';
import {appliedAnimation} from './animation-library.js';
import { AnimationMixer, Box3, Group, LoopOnce, Quaternion, Vector3 } from "three";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { activeWeapon, itemDefinition } from "./inventory.js";
import { defaultStyle, playerModelScale, QUATERNIUS_MODELS } from "./quaternius-catalog.js";
import { PlayerMotion } from "./player-motion.js";
import { WeaponModels, weaponModelSignature } from "./weapon-models.js";
import { hasWeaponModel } from './weapon-catalog.js';
import { applyRiflePose, captureRifleRig, restoreRiflePose } from "./rifle-pose.js";
import { createSoleProbes, drawSoleShadows, sampleSoleContacts } from "./character-shadow.js";
import {metersToTiles} from './world-scale.js';
import { rebindPart, disposeClothing } from './character-parts.js';
import {bareWaist} from './character-legs.js';
import {restoreCharacterPose} from './character-pose.js';

const PARTS=["head","torso","legs","feet"];

export class PlayerModels {
  constructor(pass,library) {
    this.pass=pass;this.library=library;this.entities=new Map();this.used=new Set();this.prepared=new Map();this.motion=new PlayerMotion();this.weapons=new WeaponModels();
    this.controller=new AnimationController();
    this.ready=Promise.all(["male-Casual_2","male-Casual_Hoodie","female-Casual","female-Suit","male-Beach","female-Formal","male-Worker","female-Worker","male-Swat","male-Adventurer","Knife","player-motion"].map(key=>library.request(key)));
  }
  beginFrame(){this.used.clear();this.prepared.clear();if(this.updatedPlayer){this.used.add(this.updatedPlayer);this.updatedPlayer=null;}}

  entity(player,appearance) {
    const baseKey=`${appearance.sex}-${defaultStyle(appearance.sex)}`,base=this.library.get(baseKey);
    const motions=this.library.get('player-motion');
    const needed=PARTS.map(slot=>this.library.get(appearance[slot]));if(!base||!motions||needed.some(x=>!x))return null;
    const hat=appearance.headwear?this.library.get(appearance.headwear):null;if(appearance.headwear&&!hat)return null;
    const needsBody=appearance.bare?.some(slot=>slot==='torso'||slot==='legs'),beach=this.library.get('male-Beach');
    if(needsBody&&!beach)return null;
    const signature=JSON.stringify([appearance.sex,...PARTS.map(slot=>appearance[slot]),appearance.bare,appearance.headwear]);
    let entity=this.entities.get(player);
    if(entity?.signature===signature)return entity;
    if(entity)this.release(entity);
    const model=clone(base.scene),root=new Group();root.add(model);
    model.traverse(o=>{if(o.isMesh)o.visible=false;});
    const armature=model.getObjectByName("CharacterArmature");
    const clothing={};
    const bodyLegs=needsBody?rebindPart(beach.scene.getObjectByName(QUATERNIUS_MODELS.characters['male-Beach'].parts.legs),model,{sourceSex:'male',targetSex:appearance.sex,slot:'legs',bare:true}):null;
    const waist=bodyLegs?bareWaist(bodyLegs):null;
    for(let i=0;i<PARTS.length;i++) {
      const slot=PARTS[i],name=QUATERNIUS_MODELS.characters[appearance[slot]].parts[slot];
      const part=slot==='legs'&&appearance.bare?.includes(slot)?bodyLegs:rebindPart(needed[i].scene.getObjectByName(name),model,{sourceSex:QUATERNIUS_MODELS.characters[appearance[slot]].sex,targetSex:appearance.sex,slot,bare:appearance.bare?.includes(slot),coverHair:slot==='head'&&appearance.headwear==='male-Swat',waist});
      clothing[slot]=part;
      part.traverse(o=>{o.visible=true;});armature.add(part);
    }
    if(bodyLegs!==clothing.legs&&bodyLegs){bodyLegs.traverse(m=>m.skeleton?.dispose());disposeClothing(bodyLegs);}
    if(hat){
      const definition=QUATERNIUS_MODELS.characters[appearance.headwear];
      const part=rebindPart(hat.scene.getObjectByName(definition.parts.head),model,{sourceSex:definition.sex,targetSex:appearance.sex,headwear:true,sourceKey:appearance.headwear});
      part.traverse(o=>{o.visible=true;});armature.add(part);clothing.headwear=part;
    }
    const mixer=new AnimationMixer(model),actions=new Map([...base.animations,...motions.animations].map(clip=>{
      const action=mixer.clipAction(clip).setEffectiveTimeScale(0);
      if(!["Walk","Run","Idle_Neutral","Idle_Gun","Idle_Gun_Pointing","Crouch_Walk","Crouch_Idle"].includes(clip.name)){action.setLoop(LoopOnce,1);action.clampWhenFinished=true;}
      return [clip.name,action];
    }));
    root.scale.setScalar(playerModelScale(appearance));
    root.position.y=QUATERNIUS_MODELS.characters[appearance.feet].groundOffset*root.scale.y;
    if(appearance.bare?.includes('feet'))root.position.y-=.016*root.scale.y;
    entity={root,model,mixer,actions,clothing,signature,modelSex:appearance.sex,current:null,clip:null,weapon:null,weaponKind:null};
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
    entity.animationEvaluationKey=null;
    entity.reloadLast=null;entity.supportElbow=null;entity.supportTwist=null;entity.handgunCrouchBlend=null;entity.handgunCrouchHold=0;
    entity.pistolCrouch=null;entity.pistolCrouchHold=0;entity.pistolWeaponPose=null;entity.pistolSupportPose=null;entity.pistolBodyPose=null;entity.pistolContactPole=null;entity.pistolReloadPose=null;
    entity.pistolFits=null;entity.pistolPreviousFit=null;entity.pistolAutoFits=null;entity.pistolReloadClearance=0;
    if(entity.weapon){
      entity.weapon.parent.remove(entity.weapon);
      if(entity.weapon.userData.generated)entity.weapon.traverse(o=>o.geometry?.dispose());
      entity.weapon=null;
    }
    if(entity.backpack){entity.backpack.parent.remove(entity.backpack);entity.backpack=null;}
    if(hasWeaponModel(item)) {
      const model=this.weapons.create(item);if(!model)return;
      entity.weapon=model;entity.model.getObjectByName("WristR").add(model);
    } else if(item?.type==='kitchen_knife') {
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
    restoreCharacterPose(entity);
    const action=entity.actions.get(pose.clip);
    if(entity.clip!==pose.clip){action.reset().setEffectiveTimeScale(0).setEffectiveWeight(1).play();if(entity.current)entity.current.crossFadeTo(action,.16,false);entity.current=action;entity.clip=pose.clip;}
    action.time=Math.min(.999999,pose.progress)*action.getClip().duration;entity.mixer.update(pose.delta);
    entity.poseProgress=pose.progress;
    for(const other of entity.actions.values())if(other!==action&&other.getEffectiveWeight()===0)other.stop();
    entity.root.rotation.y=pose.yaw;entity.root.updateMatrixWorld(true);
  }

  update(player,time){presentFreshShot(player);this.updatedPlayer=player;return this.prepare(player,time);}

  prepare(player,time,options={}) {
    const library=appliedAnimation(),revision=options.revision??library.revision;
    const weapon=activeWeapon(player);
    if(hasWeaponModel(weapon)&&!this.weapons.entry(weapon).asset)this.weapons.request(weapon);
    const resources=`${this.weapons.revision||0}:${this.library.revision||0}`;
    const key=animationInputKey(player,time,revision)+JSON.stringify([options.posture,options.preview,options.pose,options.document===null,resources]);
    const existing=this.entities.get(player);
    if(existing?.animationEvaluationKey===key){this.used.add(player);this.prepared.set(player,{entity:existing,time});return existing;}
    const pose=options.pose||this.motion.sample(player,time),entity=this.entity(player,pose.appearance);if(!entity)return false;
    this.used.add(player);this.equip(entity,player);this.pose(entity,pose);
    entity.animationDocument=options.document===undefined?library.document:options.document;
    entity.animationPreview=options.preview;
    this.controller.evaluate(entity,player,pose,options.posture);
    entity.animationEvaluationKey=key;
    entity.animationResources=resources;
    entity.animationRevision=revision;entity.animationTime=time;entity.animationStateKey=animationInputKey(player,time,revision);
    this.prepared.set(player,{entity,time});return entity;
  }

  faceShot(player){if(this.motion.faceShot(player)){const entity=this.entities.get(player);if(entity){entity.animationEvaluationKey=null;entity.animationStateKey=null;}}}

  socketEntity(player,time){
    const entity=this.entities.get(player);
    if(entity?.animationTime===time&&entity.animationResources===`${this.weapons.revision||0}:${this.library.revision||0}`&&entity.animationStateKey===animationInputKey(player,time,entity.animationRevision))return entity;
    return this.prepare(player,time);
  }

  shotMuzzle(player,time){
    const entity=this.socketEntity(player,time);if(!entity?.weapon)return null;
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

  ejectionSocket(player,time,cylinder=false){
    const entity=this.socketEntity(player,time),weapon=entity?.weapon;if(!weapon)return null;
    let at=weapon.userData.mechanism?.ejection;
    if(cylinder){
      const part=weapon.getObjectByName('Cylinder');if(!part)return null;
      if(!part.geometry.boundingBox)part.geometry.computeBoundingBox();
      const p=part.geometry.boundingBox.getCenter(new Vector3());p.z=part.geometry.boundingBox.min.z-.012;
      const world=part.localToWorld(p),q=part.getWorldQuaternion(new Quaternion());
      return{x:player.x+metersToTiles(world.x),y:player.y+metersToTiles(world.z),height:world.y,rotation:q.toArray(),unload:true};
    }
    if(!at){const a=weapon.userData.anchors||{};at=[.025,a.muzzle?.[1]??.07,(a.magazine?.[2]??.1)+.03];}
    const p=weapon.localToWorld(new Vector3().fromArray(at)),q=weapon.getWorldQuaternion(new Quaternion());
    return{x:player.x+metersToTiles(p.x),y:player.y+metersToTiles(p.z),height:p.y,rotation:q.toArray()};
  }

  drawShadow(ctx,player,time,point) {
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
      entity.root.position.set(0,0,0);
      this.pose(entity,{clip:"Death",progress:1,delta:1,yaw:corpse.facingYaw||0,crouched:false});
      entity.root.updateMatrixWorld(true);const bounds=new Box3();
      entity.root.traverseVisible(mesh=>{if(mesh.isMesh)bounds.union(new Box3().setFromObject(mesh,true));});
      entity.root.position.add(new Vector3(-(bounds.min.x+bounds.max.x)/2,-bounds.min.y,-(bounds.min.z+bounds.max.z)/2));
      const size=bounds.getSize(new Vector3());
      corpse.footprint={x:metersToTiles(size.x/2),y:metersToTiles(size.z/2)};
      corpse.heightMeters=size.y;
      entity.corpse=true;
    }
    return this.pass.draw(ctx,entity.root,point,{software:true});
  }

  release(entity) {
    entity.mixer.stopAllAction();entity.mixer.uncacheRoot(entity.model);
    const skeletons=new Set();entity.root.traverse(o=>{if(o.isSkinnedMesh)skeletons.add(o.skeleton);});for(const skeleton of skeletons)skeleton.dispose();
    if(entity.weapon?.userData.generated)entity.weapon.traverse(o=>o.geometry?.dispose());
    disposeClothing(entity.root);
  }
  endFrame(){for(const [player,entity] of this.entities)if(!this.used.has(player)){this.release(entity);this.entities.delete(player);}}
}
