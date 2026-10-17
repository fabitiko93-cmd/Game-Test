import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { Quaternion, Vector3 } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { createPlayer } from "../docs/src/character.js";
import { addItem, createItem, equipItem } from "../docs/src/inventory.js";
import { PlayerModels } from "../docs/src/player-models.js";
import { QuaterniusAssets } from "../docs/src/quaternius-assets.js";
import { playerModelAppearance } from "../docs/src/quaternius-catalog.js";
import { AK_MODEL } from "../docs/src/weapon-models.js";
import { applyRiflePose, riflePosture } from "../docs/src/rifle-pose.js";

const cache = new Map();
async function parse(url) {
  const name = new URL(url).pathname.split("/").at(-1);
  if (!cache.has(name)) cache.set(name, (async () => {
    const folder = name.startsWith("ak-") ? "weapons" : "quaternius";
    const bytes = gunzipSync(await readFile(new URL(`../docs/assets/${folder}/${name}`, import.meta.url)));
    return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "");
  })());
  return cache.get(name);
}

test("both real rigs retain their grip, arm lengths and legs in all three rifle postures", async () => {
  const library = new QuaterniusAssets({loadAsset: parse}), models = new PlayerModels({}, library);
  models.weapons.loadAsset = parse; await Promise.all([models.ready, models.weapons.request()]);
  for (const sex of ["male", "female"]) for(const stock of [null,'ak_fixed_stock','ak_frame_stock']) {
    const player = createPlayer({appearance: {sex}}); player.equipment.back = null;
    const weapon = createItem("ak_762", 1, {magazine: createItem("mag_ak_30", 1, {rounds: 30}), mods: stock?{stock: createItem(stock)}:{}});
    addItem(player, weapon); equipItem(player, weapon.id); player.combat.enabled = true;
    const appearance = playerModelAppearance(player);
    await Promise.all(["head", "torso", "legs", "feet"].map(slot => library.request(appearance[slot])));
    const entity = models.entity(player, appearance); models.equip(entity, player);
    const bone = name => entity.model.getObjectByName(name), position = name => bone(name).getWorldPosition(new Vector3());
    for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      for (const clip of ["Idle_Gun", "Idle_Gun_Pointing", "Gun_Shoot", "Walk", "Run", "Crouch_Idle", "Crouch_Walk"]) {
        for (const progress of [.1, .5, .9]) for(const posture of ['carry','hip','aim']) {
          player.moving=['Walk','Run','Crouch_Walk'].includes(clip);
          models.pose(entity, {clip, progress, delta: 1, yaw});
          const legs = ["UpperLegL", "LowerLegL", "UpperLegR", "LowerLegR"].filter(name => bone(name)).map(position);
          const armLengths = ["L", "R"].flatMap(side => [position(`UpperArm${side}`).distanceTo(position(`LowerArm${side}`)), position(`LowerArm${side}`).distanceTo(position(`Wrist${side}`))]);
          applyRiflePose(entity, player,1,posture); entity.root.updateMatrixWorld(true);
          const actualLengths = ["L", "R"].flatMap(side => [position(`UpperArm${side}`).distanceTo(position(`LowerArm${side}`)), position(`LowerArm${side}`).distanceTo(position(`Wrist${side}`))]);
          actualLengths.forEach((length, index) => assert.ok(Math.abs(length - armLengths[index]) < 1e-5, `${sex} ${clip} ${progress} arm ${index}: ${length} vs ${armLengths[index]}`));
          ["UpperLegL", "LowerLegL", "UpperLegR", "LowerLegR"].filter(name => bone(name)).map(position).forEach((p, index) => assert.ok(p.distanceTo(legs[index]) < 1e-7));
          const grip = entity.weapon.localToWorld(new Vector3(.145, .03, .255));
          assert.ok(position("WristL").distanceTo(grip) < .015, `${sex} ${clip} ${progress}: support hand`);
          const local=name=>entity.weapon.worldToLocal(position(name));
          const triggerKnuckle=local('Index2R'),gripTip=local('Middle4R'),supportPalm=local('Middle2L');
          assert.ok(Math.abs(triggerKnuckle.x)<.055&&triggerKnuckle.y>-.02&&triggerKnuckle.y<.065&&triggerKnuckle.z>-.02&&triggerKnuckle.z<.05,'index knuckle at the real trigger/grip, not 15 cm along the receiver');
          assert.ok(gripTip.x>0&&gripTip.x<.055&&Math.abs(gripTip.z)<.055,'right fingers wrap around the other side of the pistol grip');
          assert.ok(Math.abs(supportPalm.x)<.025&&supportPalm.y>0&&supportPalm.y<.055&&supportPalm.z>.24&&supportPalm.z<.31,'support palm below the supplied wooden handguard');
          const forward = new Vector3(0, 0, 1).applyQuaternion(entity.weapon.getWorldQuaternion(new Quaternion()));
          const horizontal=new Vector3(forward.x,0,forward.z).normalize();
          if(posture==='carry')assert.ok(forward.y>.65,'carry the barrel diagonally upwards in front of the body');
          else {
            assert.ok(horizontal.dot(new Vector3(Math.sin(yaw), 0, Math.cos(yaw))) > .999, `${sex} ${clip}: muzzle heading`);
            assert.ok(posture==='hip'?forward.y<-.1:Math.abs(forward.y)<.04,'hip carry and aimed fire have distinct barrel elevations');
          }
          if(posture==='aim'&&stock&&!player.moving){
            const contact=entity.weapon.localToWorld(entity.weapon.userData.stockContact.clone());
            assert.ok(contact.distanceTo(entity.rifleShoulderContact)<.025,`${sex} ${stock} ${clip} ${progress}: butt is against shoulder (${contact.distanceTo(entity.rifleShoulderContact)})`);
          }
        }
      }
    }
  }
});

test('posture follows movement and actual aiming, and transitions keep the weapon attached',async()=>{
  const player=createPlayer();assert.equal(riflePosture(player),'carry');
  player.combat.enabled=true;assert.equal(riflePosture(player),'carry','combat mode without a target is not aiming');
  player.combat.targetId='target';player.combat.aim=.1;assert.equal(riflePosture(player),'aim');
  player.moving=true;assert.equal(riflePosture(player),'hip');
  const library=new QuaterniusAssets({loadAsset:parse}),models=new PlayerModels({},library);
  models.weapons.loadAsset=parse;await Promise.all([models.ready,models.weapons.request()]);
  const weapon=createItem('ak_762',1,{mods:{stock:createItem('ak_fixed_stock')}});addItem(player,weapon);equipItem(player,weapon.id);
  const entity=models.entity(player,playerModelAppearance(player));models.equip(entity,player);
  const pose={clip:'Idle_Gun',progress:.2,delta:1,yaw:0};models.pose(entity,pose);applyRiflePose(entity,player,1,'carry');
  let previous=entity.weapon.getWorldPosition(new Vector3());
  for(let frame=0;frame<40;frame++){
    models.pose(entity,{...pose,delta:1/60});applyRiflePose(entity,player,1/60,'aim');
    const point=entity.weapon.getWorldPosition(new Vector3());assert.ok(point.distanceTo(previous)<.09,'raising the rifle is blended');previous=point;
  }
  assert.ok(entity.rifleBlend.aim>.99);
});

test('rifle corrections do not accumulate or survive unequipping into an unchanged animation pose',async()=>{
  const library=new QuaterniusAssets({loadAsset:parse}),models=new PlayerModels({},library);
  models.weapons.loadAsset=parse;await Promise.all([models.ready,models.weapons.request()]);
  const player=createPlayer(),weapon=createItem('ak_762');addItem(player,weapon);equipItem(player,weapon.id);
  const entity=models.entity(player,playerModelAppearance(player));models.equip(entity,player);
  const pose={clip:'Idle_Gun',progress:.3,delta:1,yaw:.7};models.pose(entity,pose);
  const names=['Chest','Head','ShoulderR','UpperArmR','LowerArmL','WristL','Middle2R','Thumb1L'];
  const bones=names.map(n=>entity.model.getObjectByName(n)),original=bones.map(b=>b.quaternion.clone());
  applyRiflePose(entity,player);const first=bones.map(b=>b.getWorldQuaternion(new Quaternion()).normalize());
  applyRiflePose(entity,player);bones.forEach((b,i)=>assert.ok(b.getWorldQuaternion(new Quaternion()).normalize().angleTo(first[i])<1e-6,`${names[i]}: reapplying a held pose is stable`));
  player.equipment.mainHand=null;models.equip(entity,player);models.pose(entity,{...pose,delta:0});
  bones.forEach((b,i)=>assert.ok(b.quaternion.clone().normalize().angleTo(original[i].normalize())<1e-6,`${names[i]} returns to the original animation`));
});
