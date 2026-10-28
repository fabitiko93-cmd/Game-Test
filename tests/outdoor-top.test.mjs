import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {QUATERNIUS_MODELS,playerModelAppearance} from '../docs/src/quaternius-catalog.js';
import {QuaterniusAssets} from '../docs/src/quaternius-assets.js';
import {PlayerModels} from '../docs/src/player-models.js';
import {createPlayer} from '../docs/src/character.js';
import {addItem,createItem,equipItem,unequipSlot,carryCapacity} from '../docs/src/inventory.js';

const hash=value=>createHash('sha256').update(value).digest('hex'),parsed=new Map();
async function load(url){
  const name=new URL(url).pathname.split('/').at(-1);
  if(!parsed.has(name))parsed.set(name,(async()=>{
    const bytes=gunzipSync(await readFile(new URL('../docs/assets/quaternius/'+name,import.meta.url)));
    return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  })());return parsed.get(name);
}
function triangles(parts){
  const result=[];
  for(const part of parts)part.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const g=mesh.geometry,attributes=Object.keys(g.attributes).sort(),indices=g.index;
    for(let i=0;i<indices.count;i+=3){
      const vertices=[0,1,2].map(k=>{
        const id=indices.getX(i+k);
        return attributes.map(name=>{const a=g.attributes[name];return [name,...Array.from({length:a.itemSize},(_,c)=>a.getComponent(id,c))];});
      });result.push(JSON.stringify([mesh.material.name,vertices]));
    }
  });return result;
}
const geometryHash=parts=>hash(triangles(parts).sort().join('\n'));
function components(part){
  const faces=[],vertices=new Map();
  part.traverse(mesh=>{
    if(!mesh.isMesh)return;const g=mesh.geometry,p=g.attributes.position,ids=[];
    for(let i=0;i<p.count;i++){
      const key=[p.getX(i),p.getY(i),p.getZ(i)].map(n=>n.toFixed(6)).join(',');
      if(!vertices.has(key))vertices.set(key,vertices.size);ids.push(vertices.get(key));
    }
    for(let i=0;i<g.index.count;i+=3)faces.push([0,1,2].map(k=>ids[g.index.getX(i+k)]));
  });
  const parent=faces.map((_,i)=>i),edges=new Map();
  const find=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
  faces.forEach((face,i)=>{for(let k=0;k<3;k++){
    const edge=[face[k],face[(k+1)%3]].sort((a,b)=>a-b).join(',');
    if(edges.has(edge))parent[find(i)]=find(edges.get(edge));else edges.set(edge,i);
  }});return new Set(parent.map((_,i)=>find(i))).size;
}

test('the outdoor shirt and separated backpack preserve every authored surface, skin weight and animation',async()=>{
  const asset=await load(new URL('../docs/assets/quaternius/'+QUATERNIUS_MODELS.characters['female-Adventurer'].file,import.meta.url));
  const shirt=asset.scene.getObjectByName('Adventurer_Body'),bag=asset.scene.getObjectByName('Backpack');
  assert.ok(shirt&&bag);assert.equal(shirt.parent,bag.parent);
  assert.equal(triangles([shirt]).length,2854);assert.equal(components(shirt),1,'the complete shirt remains one connected surface');
  assert.equal(triangles([bag]).length,1212);assert.equal(components(bag),17);
  // Golden signatures from the unmodified CC0 source, before separating it.
  assert.equal(geometryHash([shirt,bag]),'d9ac979c694e9dc43425358ec1468c36d886b9245440a066c6d8aad83795a645');
  assert.equal(geometryHash(['Adventurer_Head','Adventurer_Legs','Adventurer_Feet'].map(name=>asset.scene.getObjectByName(name))),
    '8f156be2c8d771f2cda8220282822df8aba68106ad25ac76ef872c02371492e6');
  const clips=asset.animations.map(clip=>{const {uuid,...data}=clip.toJSON();return data;});
  assert.equal(hash(JSON.stringify(clips)),'a05ac7176aaf1d8c9cb079443d88969751ee5c349de03c608f54c837a9dc66ee');
});

test('both rigs wear the green shirt independently of the existing equipped hiking backpack',async()=>{
  const library=new QuaterniusAssets({loadAsset:load}),models=new PlayerModels({},library);await models.ready;await library.request('female-Adventurer');
  for(const sex of ['male','female']){
    const player=createPlayer({appearance:{sex}}),shirt=createItem('outdoor_top'),bag=createItem('hiking_pack');
    addItem(player,shirt);addItem(player,bag);equipItem(player,shirt.id);
    const entity=models.entity(player,playerModelAppearance(player));models.equip(entity,player);
    assert.equal(triangles([entity.clothing.torso]).length,2854);assert.ok(!entity.backpack);
    const shirtHash=geometryHash([entity.clothing.torso]);
    equipItem(player,bag.id);models.equip(entity,player);
    assert.ok(entity.backpack);assert.equal(triangles([entity.backpack]).length,1752);
    assert.equal(carryCapacity(player),player.baseCapacity+12);assert.equal(geometryHash([entity.clothing.torso]),shirtHash);
    for(const clip of ['Idle_Neutral','Walk','Crouch_Idle','Crouch_Walk','Run']){
      models.pose(entity,{clip,progress:.35,delta:1,yaw:0});
      entity.backpack.traverse(mesh=>{if(mesh.isSkinnedMesh)assert.ok(mesh.skeleton.bones.every(bone=>bone&&entity.model.getObjectByName(bone.name)===bone));});
    }
    unequipSlot(player,'back');models.equip(entity,player);
    assert.ok(!entity.backpack);assert.equal(carryCapacity(player),player.baseCapacity);
    assert.equal(geometryHash([entity.clothing.torso]),shirtHash);
    equipItem(player,bag.id);unequipSlot(player,'torso');
    const bare=models.entity(player,playerModelAppearance(player));models.equip(bare,player);
    assert.ok(bare.backpack);assert.equal(triangles([bare.backpack]).length,1752);
    assert.ok(playerModelAppearance(player).bare.includes('torso'));
    models.release(bare);models.entities.delete(player);
  }
});
