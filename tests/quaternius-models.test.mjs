import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { Box3, Vector3 } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { ModelPass } from "../docs/src/model-pass.js";
import { PlayerModels } from "../docs/src/player-models.js";
import { PlayerMotion } from "../docs/src/player-motion.js";
import { QuaterniusAssets } from "../docs/src/quaternius-assets.js";
import { WorldModels } from "../docs/src/world-models.js";
import { QUATERNIUS_MODELS as metadata, createPlayerAppearance, playerHeight,
  playerModelAppearance, FURNITURE_MODELS, furnishingDimensions, furnishingFootprint } from "../docs/src/quaternius-catalog.js";
import { World } from "../docs/src/world.js";
import { createPlayer } from "../docs/src/character.js";
import { createItem, equipItem, addItem } from "../docs/src/inventory.js";
import { Game } from "../docs/src/game.js";
import { canInteract } from "../docs/src/interaction.js";
import { pathToPlayerInteraction, playerSegmentClear } from "../docs/src/player-navigation.js";
import { tilesToMeters, pixelsPerMeter } from "../docs/src/world-scale.js";

const root=new URL('../docs/assets/quaternius/',import.meta.url),parsed=new Map();
async function load(url) {
  const name=new URL(url).pathname.split('/').at(-1);
  if(!parsed.has(name)) parsed.set(name,(async()=>{
    const compressed=await readFile(new URL(name,root));
    assert.ok(name.includes(createHash('sha256').update(compressed).digest('hex').slice(0,12)));
    const raw=gunzipSync(compressed);
    return new GLTFLoader().parseAsync(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),'');
  })());
  return parsed.get(name);
}
const fakeRenderer=()=>({domElement:{addEventListener(){}},setClearColor(){},setPixelRatio(){},setSize(){},clear(){},render(){}});
const context=()=>({globalAlpha:1,save(){},restore(){},drawImage(){}});
const visibleBounds=root=>{root.updateMatrixWorld(true);const bounds=new Box3();root.traverseVisible(o=>{if(o.isMesh)bounds.union(new Box3().setFromObject(o,true));});return bounds;};

test("all 21 original characters keep four independent clothing slots and every authored clip",async()=>{
  assert.equal(Object.keys(metadata.characters).length,21);assert.equal(Object.keys(metadata.interiors).length,123);
  for(const [key,definition] of Object.entries(metadata.characters)) {
    const asset=await load(new URL(definition.file,root));
    assert.deepEqual(Object.keys(definition.parts).sort(),['feet','head','legs','torso']);
    for(const name of Object.values(definition.parts))assert.ok(asset.scene.getObjectByName(name),`${key}: ${name}`);
    assert.equal(asset.animations.length,24);
    for(const clip of asset.animations){assert.ok(clip.tracks.length>100);assert.ok(clip.tracks.some(t=>t.times.length>10));}
    for(const clip of ['Walk','Run','Death','Sword_Slash','Gun_Shoot','Idle_Neutral'])assert.ok(definition.clips[clip]);
    assert.ok(definition.clips.Walk.distance>1&&definition.clips.Run.distance>1.5);
  }
});

test("actual modular clothing uses one posed rig and stable male/female metre scales without exploding or floating",async()=>{
  const library=new QuaterniusAssets({loadAsset:load}),pass=new ModelPass({createRenderer:fakeRenderer});pass.beginFrame(2);
  const models=new PlayerModels(pass,library);await models.ready;
  for(const [key,definition] of Object.entries(metadata.characters)) {
    await library.request(key);
    const player=createPlayer({appearance:{sex:definition.sex,style:definition.style}});
    const entity=models.entity(player,createPlayerAppearance({sex:definition.sex,style:definition.style}));
    models.pose(entity,{clip:'Idle_Neutral',progress:0,delta:1,yaw:0});
    const bounds=visibleBounds(entity.root),size=bounds.getSize(new Vector3());
    assert.ok(Math.abs(bounds.min.y)<.035,`${key}: sole height ${bounds.min.y}`);
    assert.ok(Math.abs(size.y-playerHeight(player.appearance))<.2,`${key}: height ${size.y}`);
    assert.ok(size.x<1.2&&size.z<.8,`${key}: skeleton and meshes must stay in the same body`);
    let skins=0;entity.root.traverseVisible(mesh=>{if(mesh.isSkinnedMesh){skins++;assert.ok(mesh.skeleton.bones.every(Boolean));}});assert.ok(skins>=4);
    models.endFrame();
  }
  const player=createPlayer(),first=playerModelAppearance(player);
  assert.equal(first.torso,'male-Beach');assert.equal(first.legs,'male-Beach');assert.deepEqual(first.bare,['torso','legs','feet']);
  const jacket=createItem('leather_jacket');addItem(player,jacket);equipItem(player,jacket.id);
  assert.equal(playerModelAppearance(player).torso,'male-Punk');
  const saved=JSON.parse(JSON.stringify(player));assert.deepEqual(playerModelAppearance(saved),playerModelAppearance(player));
  const female=createPlayerAppearance({sex:'female',head:'male-Casual_2',style:'Worker'});
  assert.equal(female.head,'female-Casual');assert.equal(female.torso,'female-Worker','foreign skeleton families are not mixed');
});

test("walking and sprinting animation phases follow real metres at 30/60/120 Hz and stop with the player",()=>{
  const travel=(fps,running)=>{
    const player=createPlayer(),motion=new PlayerMotion();Object.assign(player,{moving:true,running});motion.sample(player,0);
    let pose;for(let frame=1;frame<=fps;frame++){player.x=8+frame/fps*.5;pose=motion.sample(player,frame/fps);}
    const result=motion.sample(player,1);assert.equal(result.progress,pose.progress);assert.equal(result.delta,0);
    return result;
  };
  for(const running of [false,true]) {
    const a=travel(30,running),b=travel(60,running),c=travel(120,running);
    assert.ok(Math.abs(a.progress-b.progress)<1e-12&&Math.abs(b.progress-c.progress)<1e-12);
    assert.equal(a.clip,running?'Run':'Walk');
    assert.ok(Math.abs(a.progress*metadata.characters['male-Casual_2'].clips[a.clip].distance*a.scale-1)<1e-10);
  }
});

test("authored crouch clips retarget to both modular rigs with grounded shoes and connected legs",async()=>{
  const library=new QuaterniusAssets({loadAsset:load}),pass=new ModelPass({createRenderer:fakeRenderer});pass.beginFrame(2);
  const models=new PlayerModels(pass,library);await models.ready;
  for(const sex of ['male','female'])for(const moving of [false,true]){
    const player=createPlayer({appearance:{sex}});Object.assign(player,{stance:'sneak',moving});
    for(let i=0;i<32;i++){
      player.x+=moving?.01:0;models.draw(context(),player,i/16,{x:0,y:0});
      const entity=models.entities.get(player),bounds=visibleBounds(entity.root);
      assert.equal(entity.clip,moving?'Crouch_Walk':'Crouch_Idle');
      assert.ok(bounds.max.y<1.48&&bounds.max.y>.85,'natural crouched height: '+bounds.max.y);
      assert.ok(bounds.min.y>-.04&&bounds.min.y<.04,'sole contact: '+bounds.min.y);
      for(const side of ['L','R']){
        const foot=entity.model.getObjectByName('Foot'+side).getWorldPosition(new Vector3()),knee=entity.model.getObjectByName('LowerLeg'+side).getWorldPosition(new Vector3());
        assert.ok(foot.distanceTo(knee)>.25&&foot.distanceTo(knee)<.6,'the separate foot bone follows its shin');
      }
    }
  }
});

test("the original door panel and fridge have the reference dimensions; all 123 furniture assets are grounded",async()=>{
  for(const [key,definition] of Object.entries(metadata.interiors)) {
    const asset=await load(new URL(definition.file,root)),bounds=new Box3().setFromObject(asset.scene,true),size=bounds.getSize(new Vector3());
    assert.ok(Math.abs(bounds.min.y)<1e-6,key);
    assert.ok(Math.abs(size.x-definition.dimensions.width)<1e-5&&Math.abs(size.y-definition.dimensions.height)<1e-5&&Math.abs(size.z-definition.dimensions.depth)<1e-5,key);
  }
  const fridge=metadata.interiors.Kitchen_Fridge.dimensions;assert.deepEqual(fridge,{width:.6,height:1.86,depth:.665});
  const door=metadata.interiors.Door_1;assert.equal(door.dimensions.width,.86);assert.equal(door.dimensions.height,1.985);assert.equal(door.panelDepth,.04);
  assert.equal(metadata.interiors.Door_Double.dimensions.width,1.72);
  assert.ok(Math.abs(metadata.interiors.Bed_Single.dimensions.depth-1.97)<1e-8);
});

test("world collision uses the imported furniture footprint and all changed containers stay usable",()=>{
  const world=new World(),player=createPlayer();
  for(const door of world.objects.filter(o=>o.type==='door')){door.closed=false;door.solid=false;door.blocksSight=false;door.locked=false;}world.touchSight();
  for(const object of world.objects.filter(o=>furnishingDimensions(o))) {
    assert.deepEqual(object.footprint,furnishingFootprint(object));
    if(!object.interactable)continue;
    const path=pathToPlayerInteraction(world,player,object,{allowDoors:true});assert.ok(path.length,object.name);
    let previous=player;for(const point of path){assert.ok(playerSegmentClear(world,previous,point,{allowDoors:true}));previous=point;}
    assert.ok(canInteract(world,path.at(-1),object),object.name);
  }
});

test("the shared no-WebGL pass draws real posed triangles and static models are cached at device resolution",async()=>{
  const pass=new ModelPass({createRenderer:()=>{throw new Error('no WebGL');}});pass.beginFrame(3);
  const library=new QuaterniusAssets({loadAsset:load}),models=new PlayerModels(pass,library);await models.ready;
  let triangles=0;const ctx={save(){},restore(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},fill(){triangles++;}};
  assert.equal(models.draw(ctx,createPlayer(),0,{x:100,y:100}),true);assert.ok(triangles>500);
  let canvases=0,draws=0;
  const worldModels=new WorldModels(pass,library,{createCanvas:()=>{canvases++;return{getContext:()=>({...ctx,setTransform(){}})};}});await worldModels.ready;
  const screen={drawImage(){draws++;}},fridge={type:'fridge'};
  assert.equal(worldModels.draw(screen,fridge,{x:100,y:100}),true);
  const rendered=triangles;worldModels.draw(screen,fridge,{x:120,y:110});
  assert.equal(canvases,1);assert.equal(draws,2);assert.equal(triangles,rendered,'stationary furniture never re-evaluates its geometry each frame');
  pass.beginFrame(2);worldModels.draw(screen,fridge,{x:120,y:110});assert.equal(canvases,2);
});

test("a new player corpse keeps the chosen modular appearance and uses the authored death pose",async()=>{
  const game=Object.create(Game.prototype),world=new World(),player=createPlayer({appearance:{sex:'female',style:'Worker'}});
  Object.assign(game,{world,player,dead:false,input:{},renderer:{destination:null},ui:{closeAllPanels(){},showDeath(){}},clearNavigation(){},sound(){},save(){}});
  const expectedAppearance=playerModelAppearance(player);
  game.die('Test');const corpse=world.objects.find(o=>o.survivorId===player.id);
  assert.deepEqual(corpse.playerAppearance,expectedAppearance);
  const restored=new World();restored.restore(JSON.parse(JSON.stringify(world.serialize())));
  assert.deepEqual(restored.objects.find(o=>o.id===corpse.id).playerAppearance,corpse.playerAppearance);
  const library=new QuaterniusAssets({loadAsset:load}),pass=new ModelPass({createRenderer:fakeRenderer});pass.beginFrame(2);
  const models=new PlayerModels(pass,library);await models.ready;
  assert.equal(models.drawCorpse(context(),corpse,{x:50,y:50}),true);
  const entity=models.entities.get(corpse),bounds=visibleBounds(entity.root);
  assert.equal(entity.clip,'Death');assert.ok(bounds.max.y<.8&&bounds.min.y>-.02,'the chosen player lies on the ground');
});
