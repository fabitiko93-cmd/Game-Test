import { AnimationMixer, Box3, Group, LoopOnce, Skeleton, Vector3 } from "three";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { activeWeapon, itemDefinition } from "./inventory.js";
import { defaultStyle, playerModelScale, QUATERNIUS_MODELS } from "./quaternius-catalog.js";
import { PlayerMotion } from "./player-motion.js";
import { heldEquipment } from "./held-equipment.js";

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
    this.pass=pass;this.library=library;this.entities=new Map();this.used=new Set();this.motion=new PlayerMotion();
    this.ready=Promise.all(["male-Casual_2","female-Casual","male-Worker","female-Worker","male-Swat","male-Adventurer","Knife","player-motion"].map(key=>library.request(key)));
  }
  beginFrame(){this.used.clear();}

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
    for(let i=0;i<PARTS.length;i++) {
      const slot=PARTS[i],name=QUATERNIUS_MODELS.characters[appearance[slot]].parts[slot];
      const part=rebindPart(needed[i].scene.getObjectByName(name),model);
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
    this.entities.set(player,entity);return entity;
  }

  equip(entity,player) {
    const item=activeWeapon(player),definition=itemDefinition(item),kind=definition?.weaponKind||null;
    const bag=Boolean(player.equipment?.back),key=`${kind}-${item?.type}-${bag}`;
    if(entity.weaponKind===key)return;
    if(entity.weapon){
      entity.weapon.parent.remove(entity.weapon);
      if(entity.weapon.userData.generated)entity.weapon.traverse(o=>o.geometry?.dispose());
      entity.weapon=null;
    }
    if(entity.backpack){entity.backpack.parent.remove(entity.backpack);entity.backpack=null;}
    const generated=heldEquipment(item?.type);
    if(generated) {
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
    entity.weaponKind=key;
  }

  pose(entity,pose) {
    const action=entity.actions.get(pose.clip);
    if(entity.clip!==pose.clip){action.reset().setEffectiveTimeScale(0).setEffectiveWeight(1).play();if(entity.current)entity.current.crossFadeTo(action,.16,false);entity.current=action;entity.clip=pose.clip;}
    action.time=Math.min(.999999,pose.progress)*action.getClip().duration;entity.mixer.update(pose.delta);
    for(const other of entity.actions.values())if(other!==action&&other.getEffectiveWeight()===0)other.stop();
    entity.root.rotation.y=pose.yaw;entity.root.updateMatrixWorld(true);
  }

  draw(ctx,player,time,point) {
    const pose=this.motion.sample(player,time),entity=this.entity(player,pose.appearance);if(!entity)return false;
    this.used.add(player);this.equip(entity,player);this.pose(entity,pose);
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
