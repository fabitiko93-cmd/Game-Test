import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {Vector3} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {ITEMS} from '../docs/src/data.js';
import {createPlayer} from '../docs/src/character.js';
import {World} from '../docs/src/world.js';
import {activeWeapon,addItem,ammoLabel,consumeShot,createItem,equipItem,fillMagazine,findItem,
  insertMagazine,installMod,inventoryWeight,itemWeight,removeMod,weaponStats} from '../docs/src/inventory.js';
import {M4_MODEL,WeaponModels,WeaponInspection,configureWeaponModel,weaponModelBounds} from '../docs/src/weapon-models.js';
import {PlayerModels} from '../docs/src/player-models.js';
import {QuaterniusAssets} from '../docs/src/quaternius-assets.js';
import {playerModelAppearance} from '../docs/src/quaternius-catalog.js';
import {applyRiflePose} from '../docs/src/rifle-pose.js';
import {CombatSystem} from '../docs/src/combat.js';
import {serialize,load} from '../docs/src/game-state.js';
import {Navigator} from '../docs/src/navigation.js';
import {PlayerVisibility} from '../docs/src/player-visibility.js';
import {StealthSystem} from '../docs/src/stealth.js';

const cache=new Map(),near=(a,b,tolerance=1e-7)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);
async function parse(url){
  const name=new URL(url).pathname.split('/').at(-1),folder=/^(ak|vector|m4)-/.test(name)?'weapons':'quaternius';
  if(!cache.has(name))cache.set(name,(async()=>{
    const bytes=gunzipSync(await readFile(new URL(`../docs/assets/${folder}/${name}`,import.meta.url)));
    return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  })());
  return cache.get(name);
}

test('the M4 test kit has both rifle uppers, its original stock, shared attachments and its own 5.56 magazines',()=>{
  const crate=new World().objects.find(o=>o.type==='weaponcrate'),weapon=crate.items.find(i=>i.type==='m4_556');
  assert.equal(weapon.mods.stock.type,'m4_stock');assert.equal(weapon.mods.barrel.type,'m4_standard_barrel');assert.equal(weapon.magazine,null);
  for(const type of ['m4_standard_barrel','m4_rail_barrel','m4_stock','ak_frame_stock','ak_acog_3x','m4_suppressor','mag_m4_30','ammo_556x45'])
    assert.ok(crate.items.some(i=>i.type===type),type);
  assert.ok(crate.items.some(i=>i.type==='mag_m4_30'&&i.rounds===30));
  assert.ok(crate.items.some(i=>i.type==='mag_m4_30'&&i.rounds===0));
  const other=createItem('m4_556');assert.notEqual(other.mods.barrel.id,weapon.mods.barrel.id);
  assert.notEqual(other.mods.stock.id,weapon.mods.stock.id);near(itemWeight(weapon),2.8);
  const player=createPlayer();player.baseCapacity=40;
  const magazine=createItem('mag_m4_30'),rail=createItem('m4_rail_barrel');
  for(const item of [weapon,magazine,rail,createItem('ammo_556x45',30),createItem('mag_ak_30'),createItem('mag_vector_33')])assert.ok(addItem(player,item));
  const live=findItem(player,weapon.id),standard=live.mods.barrel,weight=inventoryWeight(player);
  assert.equal(installMod(player,weapon.id,rail.id).ok,true);assert.equal(live.mods.barrel.id,rail.id);
  assert.equal(findItem(player,standard.id).type,'m4_standard_barrel');near(inventoryWeight(player),weight);
  assert.ok(weaponStats(live).range<ITEMS.m4_556.range);assert.equal(weaponStats(live).damage,ITEMS.m4_556.damage);
  assert.equal(fillMagazine(player,magazine.id).ok,true);assert.equal(findItem(player,magazine.id).rounds,30);
  assert.equal(insertMagazine(player,weapon.id,magazine.id).ok,true);
  for(const type of ['mag_ak_30','mag_vector_33'])assert.equal(insertMagazine(player,weapon.id,player.inventory.find(i=>i.type===type).id).ok,false);
  assert.equal(live.magazine.id,magazine.id);
});

test('the real CC0 M4 retains the complete chosen original and exchanges upper assemblies without duplicated geometry',async()=>{
  const bytes=await readFile(new URL(`../docs/assets/weapons/${M4_MODEL.file}`,import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),M4_MODEL.sha256);
  assert.equal(M4_MODEL.license,'CC0');assert.equal(M4_MODEL.sourceBase,'AssaultRifle2_1');
  assert.equal(Object.values(M4_MODEL.parts).filter(p=>p.source==='AssaultRifle2_1.obj').reduce((sum,p)=>sum+p.sourceFaces,0),913);
  const library=new WeaponModels({loadAsset:parse});await library.request('m4_556');
  const weapon=createItem('m4_556',1,{loadedRounds:30}),root=library.create(weapon);
  let triangles=0;
  root.traverseVisible(part=>{if(part.isMesh)triangles+=part.geometry.attributes.position.count/3;});
  assert.equal(triangles,1928);
  const length=weaponModelBounds(root).getSize(new Vector3()).z;assert.ok(length>.82&&length<.84);
  for(const [name,data] of Object.entries(M4_MODEL.parts)){
    const part=root.getObjectByName(name);assert.equal(part.geometry.attributes.position.count,data.triangles*3);
    assert.equal(part.material.vertexColors,true);assert.equal(part.geometry.attributes.color.count,part.geometry.attributes.position.count);
  }
  const standardLength=weaponModelBounds(root).getSize(new Vector3()).z;
  weapon.mods.barrel=createItem('m4_rail_barrel');weapon.mods.muzzle=createItem('m4_suppressor');
  configureWeaponModel(root,weapon);
  assert.equal(root.getObjectByName('StandardUpper').visible,false);assert.equal(root.getObjectByName('RailUpper').visible,true);
  const muzzle=new Vector3().fromArray(root.userData.anchors.muzzle),suppressor=weaponModelBounds(root.getObjectByName('Suppressor'));
  near(suppressor.min.z,muzzle.z-.005,1e-5);near(suppressor.getCenter(new Vector3()).y,muzzle.y,1e-5);
  delete weapon.mods.muzzle;configureWeaponModel(root,weapon);
  near(standardLength-weaponModelBounds(root).getSize(new Vector3()).z,.05478302,1e-5);
  weapon.mods.barrel=createItem('m4_standard_barrel');weapon.mods.optic=createItem('ak_acog_3x');
  configureWeaponModel(root,weapon);assert.equal(root.getObjectByName('RearSight').visible,false);
  weapon.mods.muzzle=createItem('m4_suppressor');delete weapon.mods.barrel;configureWeaponModel(root,weapon);
  for(const name of ['StandardUpper','RailUpper','RearSight','Optic3x','Suppressor'])assert.equal(root.getObjectByName(name).visible,false,name);
  weapon.mods.barrel=createItem('m4_standard_barrel');delete weapon.mods.optic;configureWeaponModel(root,weapon);
  assert.equal(root.getObjectByName('RearSight').visible,true);near(root.getObjectByName('Suppressor').position.z,0);
});

test('the M4 weapon bench follows the installed upper and suppressor instead of using a fixed muzzle position',async()=>{
  const library=new WeaponModels({loadAsset:parse});await library.request('m4_556');
  const canvas={width:0,height:0,getBoundingClientRect:()=>({width:600,height:300}),getContext:()=>({})};
  const pass={status:'ready',drawInspection:()=>p=>({x:p.z,y:p.y})},inspection=new WeaponInspection(pass,library);
  const weapon=createItem('m4_556');inspection.draw(canvas,weapon);
  const a=inspection.model.userData.anchors.muzzle[2];assert.ok(inspection.anchors.barrel);
  weapon.mods.barrel=createItem('m4_rail_barrel');inspection.draw(canvas,weapon);
  near(a-inspection.model.userData.anchors.muzzle[2],.05478302,1e-5);
});

test('both rigs keep their M4 grips and original legs for both uppers, three stock choices, carrying, aiming and sprinting',async()=>{
  const library=new QuaterniusAssets({loadAsset:parse}),models=new PlayerModels({},library);
  models.weapons.loadAsset=parse;await Promise.all([models.ready,models.weapons.request('m4_556')]);
  for(const sex of ['male','female'])for(const barrel of ['m4_standard_barrel','m4_rail_barrel'])for(const stock of [null,'m4_stock','ak_frame_stock']){
    const player=createPlayer({appearance:{sex}});player.equipment.back=null;
    const weapon=createItem('m4_556',1,{mods:{barrel:createItem(barrel),...(stock?{stock:createItem(stock)}:{})}});
    assert.ok(addItem(player,weapon));equipItem(player,weapon.id);
    const appearance=playerModelAppearance(player);await Promise.all(['head','torso','legs','feet'].map(s=>library.request(appearance[s])));
    const entity=models.entity(player,appearance);models.equip(entity,player);
    const position=name=>entity.model.getObjectByName(name).getWorldPosition(new Vector3());
    for(const clip of ['Idle_Gun','Walk','Run','Crouch_Walk'])for(const posture of ['carry','hip','aim'])for(const yaw of [0,Math.PI/2]){
      player.moving=clip!=='Idle_Gun';player.running=clip==='Run';models.pose(entity,{clip,progress:.4,delta:1,yaw});
      const legs=['UpperLegL','LowerLegL','UpperLegR','LowerLegR'].map(position);
      const lengths=['L','R'].flatMap(s=>[position('UpperArm'+s).distanceTo(position('LowerArm'+s)),position('LowerArm'+s).distanceTo(position('Wrist'+s))]);
      applyRiflePose(entity,player,1,posture);
      const target=entity.weapon.localToWorld(new Vector3().fromArray(entity.weapon.userData.grips.left));
      assert.ok(position('WristL').distanceTo(target)<.015,`${sex} ${barrel} ${stock} ${clip} ${posture}: support wrist`);
      ['UpperLegL','LowerLegL','UpperLegR','LowerLegR'].map(position).forEach((p,i)=>assert.ok(p.distanceTo(legs[i])<1e-7));
      const actual=['L','R'].flatMap(s=>[position('UpperArm'+s).distanceTo(position('LowerArm'+s)),position('LowerArm'+s).distanceTo(position('Wrist'+s))]);
      actual.forEach((length,i)=>near(length,lengths[i],1e-5));
      const palm=entity.weapon.worldToLocal(position('Middle2L'));
      assert.ok(Math.abs(palm.x)<.025&&palm.y>.06&&palm.y<.095&&palm.z>.24&&palm.z<.32,`${barrel}: palm below the original handguard ${palm.toArray()}`);
    }
    player.running=true;player.moving=true;applyRiflePose(entity,player,1);assert.equal(entity.riflePosture,'carry');
  }
});

test('removing the M4 barrel stops firing without spending a round; reassembly and saves preserve all separate parts',()=>{
  const player=createPlayer(),weapon=createItem('m4_556',1,{loadedRounds:30,fireMode:'auto'}),combat=new CombatSystem(),noises=[];
  player.baseCapacity=40;addItem(player,weapon);equipItem(player,weapon.id);const live=activeWeapon(player);
  const target={id:'target',x:player.x+3,y:player.y,hp:100000,removed:false,state:'chase'};
  Object.assign(player.combat,{enabled:true,targetId:target.id,aim:1});
  const game={player,combat,zombies:[target],elapsed:0,paused:false,
    world:{hasLineOfSight:()=>true,emitNoise:(...e)=>noises.push(e),blood:[]},renderer:{trace(){},burst(){}},random:()=>.99,
    attractMigration(){},sound(){},ui:{hasBlockingPanel:()=>false,showToast(){},showMessage(){}},killZombie(){},clearNavigation(){},approachCombatTarget(){}};
  assert.equal(combat.beginFiring(game).ok,true);assert.equal(player.shots,1);
  const barrel=live.mods.barrel,weight=inventoryWeight(player);assert.equal(removeMod(player,live.id,'barrel').ok,true);
  near(inventoryWeight(player),weight);combat.update(game,.1);
  assert.equal(player.combat.triggerHeld,false);assert.equal(player.shots,1);assert.equal(live.magazine.rounds,29);assert.equal(noises.length,1);
  assert.equal(consumeShot(live),false);assert.equal(ammoLabel(live),'LAUFMODUL FEHLT');
  assert.equal(combat.beginFiring(game).message,'LAUFMODUL FEHLT');
  assert.equal(installMod(player,live.id,barrel.id).ok,true);assert.equal(combat.beginFiring(game).ok,true);assert.equal(live.magazine.rounds,28);
  game.world=new World();game.navigator=new Navigator();game.stealth=new StealthSystem();game.playerVisibility=new PlayerVisibility();
  const saved=serialize(game);game.saveStore={read:()=>JSON.parse(JSON.stringify(saved))};assert.equal(load(game),true);
  assert.deepEqual(activeWeapon(game.player),live);assert.equal(game.player.combat.triggerHeld,false);
});
