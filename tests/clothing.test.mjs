import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {Box3,Ray,Vector3} from 'three';
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

function bodyMeshes(entity){
  return ['torso','legs'].map(slot=>{let result;entity.clothing[slot].traverse(m=>{if(m.geometry?.userData[slot==='torso'?'bareTorso':'bareLegs'])result=m;});return result;});
}
function bindTriangles(mesh){
  const g=mesh.geometry,a=g.attributes,index=g.index;
  return Array.from({length:(index?.count||a.position.count)/3},(_,i)=>{
    const ids=[0,1,2].map(k=>index?index.getX(i*3+k):i*3+k);
    return {points:ids.map(id=>new Vector3().fromBufferAttribute(a.position,id).applyMatrix4(mesh.bindMatrix)),color:ids.map(id=>a.color?[a.color.getX(id),a.color.getY(id),a.color.getZ(id)]:null)};
  });
}
function surfaceHits(triangles,origin,direction,accept=()=>true){
  const ray=new Ray(origin,direction),hits=[];
  for(const triangle of triangles){
    const point=ray.intersectTriangle(...triangle.points,false,new Vector3());
    if(point&&point.distanceTo(origin)<.22&&accept(point)&&!hits.some(hit=>hit.point.distanceTo(point)<1e-5))hits.push({point,color:triangle.color});
  }
  return hits;
}

test('bare waist, abdomen and sports bra have one surface instead of overlapping skin and fabric',async()=>{
  const library=new QuaterniusAssets({loadAsset:load}),models=new PlayerModels({},library);await models.ready;
  for(const sex of ['male','female']){
    const player=createPlayer({appearance:{sex}}),entity=models.entity(player,playerModelAppearance(player)),[torso,legs]=bodyMeshes(entity),triangles=[...bindTriangles(torso),...bindTriangles(legs)];
    assert.ok(torso.material.vertexColors&&legs.material.vertexColors);
    assert.ok(!torso.geometry.attributes.uv&&!legs.geometry.attributes.uv,'body colours need no texture pipeline');
    const heights=sex==='female'?[1.08,1.105,1.12,1.125,1.14,1.18,1.25,1.31]:[.98,1,1.01,1.02,1.04,1.1,1.2,1.31];
    for(const y of heights)for(let i=0;i<32;i++){
      const angle=(i+.37)/32*Math.PI*2,hits=surfaceHits(triangles,new Vector3(0,y,.066),new Vector3(Math.sin(angle),0,Math.cos(angle)));
      assert.equal(hits.length,1,`${sex} waist ${y}, angle ${i}: one continuous surface`);
    }
    if(sex==='female')for(const y of [1.37,1.39,1.40])for(let i=0;i<32;i++){
      const angle=(i+.37)/32*Math.PI*2,hits=surfaceHits(bindTriangles(torso),new Vector3(0,y,.066),new Vector3(Math.sin(angle),0,Math.cos(angle)));
      assert.equal(hits.length,1,`sports bra ${y}, angle ${i}: no added inner or outer layer`);
      assert.ok(hits[0].color.flat().every(v=>v<.1),'fabric also covers the original side cut-outs');
    }
    models.release(entity);models.entities.delete(player);
  }
});

test('thighs have a single closed surface through the removed beach-short hems on both rigs',async()=>{
  const library=new QuaterniusAssets({loadAsset:load}),models=new PlayerModels({},library);await models.ready;
  for(const sex of ['male','female']){
    const player=createPlayer({appearance:{sex}}),entity=models.entity(player,playerModelAppearance(player)),[,legs]=bodyMeshes(entity),triangles=bindTriangles(legs);
    for(const y of sex==='female'?[.65,.67,.69,.71,.73,.76,.79,.82]:[.59,.61,.63,.65,.67,.70,.73,.76,.79])for(const side of [-1,1]){
      const section=[];
      for(const{points}of triangles)for(let k=0;k<3;k++){
        const a=points[k],b=points[(k+1)%3];if((a.y<y)===(b.y<y))continue;
        const v=a.clone().lerp(b,(y-a.y)/(b.y-a.y));if(Math.sign(v.x)===side)section.push(v);
      }
      const origin=new Vector3((Math.min(...section.map(p=>p.x))+Math.max(...section.map(p=>p.x)))/2,y,(Math.min(...section.map(p=>p.z))+Math.max(...section.map(p=>p.z)))/2);
      for(let i=0;i<24;i++){
        const angle=(i+.37)/24*Math.PI*2,hits=surfaceHits(triangles,origin,new Vector3(Math.sin(angle),0,Math.cos(angle)),p=>Math.sign(p.x)===side);
        assert.equal(hits.length,1,`${sex} thigh ${side} at ${y}, angle ${i}: no folded hem or open step`);
      }
    }
    models.release(entity);models.entities.delete(player);
  }
});

test('waist edges stay joined throughout every authored clip and movement transition on both rigs',async()=>{
  const library=new QuaterniusAssets({loadAsset:load}),models=new PlayerModels({},library);await models.ready;
  for(const sex of ['male','female']){
    const player=createPlayer({appearance:{sex}}),entity=models.entity(player,playerModelAppearance(player)),[torso,legs]=bodyMeshes(entity),pairs=[];
    for(const id of torso.geometry.userData.waistIndices){
      const p=new Vector3().fromBufferAttribute(torso.geometry.attributes.position,id).applyMatrix4(torso.bindMatrix);
      const match=legs.geometry.userData.waistIndices.find(other=>new Vector3().fromBufferAttribute(legs.geometry.attributes.position,other).applyMatrix4(legs.bindMatrix).distanceTo(p)<1e-6);
      assert.notEqual(match,undefined,'torso boundary has a matching leg boundary');pairs.push([id,match]);
    }
    assert.ok(pairs.length>=24,'the complete waist boundary is matched');
    const check=label=>{
      for(const[a,b]of pairs){const p=torso.getVertexPosition(a,new Vector3()).applyMatrix4(torso.matrixWorld),q=legs.getVertexPosition(b,new Vector3()).applyMatrix4(legs.matrixWorld);assert.ok(p.distanceTo(q)<1e-6,`${sex} ${label}: no moving waist gap`);}
      for(const mesh of [torso,legs])for(let i=0;i<mesh.geometry.attributes.position.count;i+=11)assert.ok(mesh.getVertexPosition(i,new Vector3()).toArray().every(Number.isFinite),`${sex} ${label}: finite skinning`);
    };
    for(const clip of entity.actions.keys())for(let frame=0;frame<17;frame++){models.pose(entity,{clip,progress:frame/17,delta:1,yaw:0});check(clip+' '+frame);}
    for(const clip of ['Idle_Gun_Pointing','Crouch_Idle','Crouch_Walk','Run','Walk','Idle_Neutral'])for(let frame=0;frame<12;frame++){models.pose(entity,{clip,progress:frame/12,delta:1/60,yaw:0});check('transition '+clip+' '+frame);}
    models.release(entity);models.entities.delete(player);
  }
});
