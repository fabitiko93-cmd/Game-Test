import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {Box3,Vector3} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {BACKGROUNDS,EQUIPMENT_SLOTS,ITEMS,LOOT_TABLES} from '../docs/src/data.js';
import {CLOTHING_ITEMS,CHARACTER_HEADS} from '../docs/src/clothing-catalog.js';
import {createPlayer} from '../docs/src/character.js';
import {addItem,createItem,equipItem,equipmentSummary,removeItem,unequipSlot,carryCapacity} from '../docs/src/inventory.js';
import {playerModelAppearance,playerHeight} from '../docs/src/quaternius-catalog.js';
import {PlayerModels} from '../docs/src/player-models.js';
import {QuaterniusAssets} from '../docs/src/quaternius-assets.js';
import {World} from '../docs/src/world.js';

test('every class and appearance starts in underwear, barefoot, with no backpack or free clothing',()=>{
  for(const background of Object.keys(BACKGROUNDS))for(const [sex,heads] of Object.entries(CHARACTER_HEADS))for(const style of Object.keys(heads)){
    const player=createPlayer({background,appearance:{sex,style}}),appearance=playerModelAppearance(player);
    assert.deepEqual(player.inventory,[]);assert.deepEqual(Object.keys(player.equipment),Object.keys(EQUIPMENT_SLOTS));
    assert.ok(Object.values(player.equipment).every(id=>id===null));assert.equal(carryCapacity(player),player.baseCapacity);
    assert.deepEqual(appearance.bare,['torso','legs','feet']);assert.equal(appearance.headwear,null);assert.equal(appearance.head,`${sex}-${style}`);
  }
});

test('all former starting garments are individual findable items, retain identity and condition, and leave their slot bare when removed',()=>{
  assert.equal(Object.keys(CLOTHING_ITEMS).length,48);
  for(const [type,definition] of Object.entries(CLOTHING_ITEMS)){
    const player=createPlayer({appearance:{sex:'female',style:'Formal'}}),before=playerModelAppearance(player),item=createItem(type,1,{condition:57});
    assert.ok(LOOT_TABLES.clothing.some(([candidate,chance,min,max])=>candidate===type&&chance>0&&min===1&&max===1),type);
    assert.equal(ITEMS[type].stack,1);assert.equal(addItem(player,item),true);assert.equal(equipItem(player,item.id).ok,true);
    const slot=definition.equipSlot,appearance=playerModelAppearance(player);
    assert.equal(appearance.head,before.head,'a hat must never change the person');
    assert.equal(slot==='head'?appearance.headwear:appearance[slot],definition.clothingModel);
    for(const other of ['torso','legs','feet'].filter(s=>s!==slot))assert.equal(appearance[other],before[other]);
    const saved=JSON.parse(JSON.stringify(player));assert.deepEqual(playerModelAppearance(saved),appearance);
    assert.equal(equipmentSummary(saved).find(entry=>entry.slot===slot).item.id,item.id);
    assert.equal(unequipSlot(player,slot).id,item.id);assert.deepEqual(playerModelAppearance(player),before);
    equipItem(player,item.id);const dropped=removeItem(player,item.id);
    assert.equal(player.equipment[slot],null);assert.equal(dropped.id,item.id);assert.equal(dropped.condition,57);
    assert.equal(addItem(player,dropped),true);equipItem(player,dropped.id);assert.deepEqual(playerModelAppearance(player),appearance);
  }
});

test('clothes are rolled by real wardrobes and laundry containers, and every garment can occur',()=>{
  const world=new World(),eligible=world.rollLoot.call({random:()=>0},'clothing');
  for(const type of Object.keys(CLOTHING_ITEMS))assert.ok(eligible.some(item=>item.type===type),type);
  for(const name of ['KOMMODE','WASCHMASCHINE','PERSONALSPIND']){
    const container=world.objects.find(object=>object.name===name);
    assert.ok(container?.interactable);assert.equal(container.container,'clothing');assert.ok(Array.isArray(container.items));
    assert.ok(container.items.every(item=>ITEMS[item.type].type==='clothing'||ITEMS[item.type].type==='bag'));
  }
  const restored=new World();restored.restore(JSON.parse(JSON.stringify(world.serialize())));
  assert.deepEqual(restored.objects.find(o=>o.name==='KOMMODE').items,world.objects.find(o=>o.name==='KOMMODE').items);
});

const parsed=new Map();
async function load(url){
  const name=new URL(url).pathname.split('/').at(-1);
  if(!parsed.has(name))parsed.set(name,(async()=>{
    const bytes=gunzipSync(await readFile(new URL('../docs/assets/quaternius/'+name,import.meta.url)));
    return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  })());return parsed.get(name);
}
function bounds(root){root.updateMatrixWorld(true);const box=new Box3();root.traverseVisible(mesh=>{if(mesh.isMesh)box.union(new Box3().setFromObject(mesh,true));});return box;}

test('underwear is real skinned geometry and all 48 garments fit both animated rigs without replacing the other body parts',async()=>{
  const library=new QuaterniusAssets({loadAsset:load}),models=new PlayerModels({},library);await models.ready;
  for(const sex of ['male','female']){
    const player=createPlayer({appearance:{sex}}),bare=models.entity(player,playerModelAppearance(player));
    models.pose(bare,{clip:'Idle_Neutral',progress:.2,delta:1,yaw:0});
    const materials=[];bare.root.traverseVisible(mesh=>{if(mesh.isMesh)materials.push(mesh.material.name);});
    assert.ok(materials.includes('Underwear'));assert.ok(!materials.includes('Red_Dark'),'flip-flops and beach shorts are removed');
    assert.ok(Math.abs(bounds(bare.root).min.y)<.035);assert.ok(Math.abs(bounds(bare.root).getSize(new Vector3()).y-playerHeight({sex}))<.15);
    const head=playerModelAppearance(player).head;
    for(const [type,definition] of Object.entries(CLOTHING_ITEMS)){
      await library.request(definition.clothingModel);
      const item=createItem(type);assert.ok(addItem(player,item));equipItem(player,item.id);
      const appearance=playerModelAppearance(player),entity=models.entity(player,appearance);assert.ok(entity,type);
      assert.equal(appearance.head,head);
      if(definition.equipSlot==='head'){
        const materials=[];entity.clothing.headwear.traverseVisible(mesh=>{if(mesh.isMesh)materials.push(mesh.material.name);});
        assert.ok(materials.length>0,'headwear must contain actual visible geometry');
        assert.ok(!materials.some(name=>['Skin','Moustache','Eye','Eyebrows'].includes(name)),'headwear contains no borrowed face');
      }
      for(const clip of ['Idle_Neutral','Walk','Crouch_Idle','Crouch_Walk','Run']){
        models.pose(entity,{clip,progress:.35,delta:1,yaw:0});
        const box=bounds(entity.root),size=box.getSize(new Vector3());
        assert.ok(size.x<1.35&&size.z<1.5&&size.y<2.4,`${sex} ${type} ${clip}: ${size.toArray()}`);
        assert.ok(box.min.y>-.09,`${sex} ${type} ${clip}: ground ${box.min.y}`);
        if(clip==='Idle_Neutral')assert.ok(Math.abs(box.min.y)<.035,`${sex} ${type}: standing sole contact`);
        entity.root.traverseVisible(mesh=>{if(mesh.isSkinnedMesh)assert.ok(mesh.skeleton.bones.every(Boolean));});
      }
      removeItem(player,item.id);
      assert.deepEqual(playerModelAppearance(player).bare,['torso','legs','feet']);
    }
    models.release(models.entities.get(player));models.entities.delete(player);
  }
});
