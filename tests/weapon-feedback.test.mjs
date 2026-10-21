import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {Quaternion,Vector3} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createPlayer} from '../docs/src/character.js';
import {activeWeapon,addItem,countType,createItem,equipItem,findItem,roundsInWeapon} from '../docs/src/inventory.js';
import {beginReload,cancelReload,reloadPhase,updateReload} from '../docs/src/weapon-reload.js';
import {WEAPON_MOTIONS} from '../docs/src/weapon-animation.js';
import {applyReloadPose,resetWeaponParts} from '../docs/src/weapon-reload-pose.js';
import {kickWeapon,recoilPose} from '../docs/src/weapon-recoil.js';
import {CombatSystem} from '../docs/src/combat.js';
import {createTracer,shotEnd,tracerSegment,updateShotEffects} from '../docs/src/gunshot-effects.js';
import {QuaterniusAssets} from '../docs/src/quaternius-assets.js';
import {PlayerModels} from '../docs/src/player-models.js';
import {WeaponModels,configureWeaponModel} from '../docs/src/weapon-models.js';
import {playerModelAppearance} from '../docs/src/quaternius-catalog.js';
import {applyRiflePose} from '../docs/src/rifle-pose.js';
import {serialize} from '../docs/src/game-state.js';
import {Renderer} from '../docs/src/render.js';

const near=(a,b,t=1e-6)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
function fixture(type='ak_762',sex='male'){
  const player=createPlayer({appearance:{sex}});player.baseCapacity=100;player.inventory=[];player.equipment.mainHand=null;player.equipment.back=null;
  addItem(player,createItem(type));equipItem(player,player.inventory[0].id);const weapon=activeWeapon(player);
  const game={player,zombies:[],world:{emitNoise(){},serialize:()=>[]},sound(){},ui:{showToast(){},refreshAll(){}},save(){},elapsed:0};
  return {player,weapon,game};
}
const cache=new Map();
async function parse(url){
  const name=new URL(url).pathname.split('/').at(-1),folder=/^(ak|m4|vector|revolver)-/.test(name)?'weapons':'quaternius';
  if(!cache.has(name))cache.set(name,(async()=>{const b=gunzipSync(await readFile(new URL(`../docs/assets/${folder}/${name}`,import.meta.url)));
    return new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');})());
  return cache.get(name);
}
async function models(){const library=new QuaterniusAssets({loadAsset:parse}),model=new PlayerModels({},library);model.weapons.loadAsset=parse;await model.ready;return model;}

test('magazine transfer happens on its animation event, never at reload start; fire remains locked through the final gesture',()=>{
  const {player,weapon,game}=fixture();weapon.magazine=createItem('mag_ak_30',1,{rounds:4});
  const spare=createItem('mag_ak_30',1,{rounds:30});addItem(player,spare);const old=weapon.magazine;
  assert.equal(beginReload(game).ok,true);const state=player.combat.reload;
  near(state.duration,WEAPON_MOTIONS.clips.reload2H.duration/.8);assert.equal(weapon.magazine.id,old.id);
  assert.equal(beginReload(game).ok,false);assert.equal(new CombatSystem().fire(game).message,'WAFFE WIRD NACHGELADEN');
  updateReload(game,state.commitTime-.001);assert.equal(weapon.magazine.id,old.id);assert.ok(player.inventory.some(i=>i.id===spare.id));
  player.baseCapacity=0;updateReload(game,.002);
  assert.equal(weapon.magazine.id,spare.id);assert.equal(findItem(player,old.id).rounds,4);assert.ok(player.combat.reload);
  assert.equal(new Set([weapon.magazine.id,...player.inventory.map(i=>i.id)]).size,player.inventory.length+1);
  updateReload(game,state.duration-state.elapsed-.001);assert.ok(player.combat.reload);
  updateReload(game,.002);assert.equal(player.combat.reload,undefined);assert.equal(weapon.magazine.rounds,30);
});

test('reload cancellation before/after magazine insertion, equip changes, sprinting and changed mods preserve real items',()=>{
  for(const committed of [false,true]){
    const {player,weapon,game}=fixture();weapon.magazine=createItem('mag_ak_30',1,{rounds:3});const old=weapon.magazine;
    const spare=createItem('mag_ak_30',1,{rounds:30});addItem(player,spare);beginReload(game);
    if(committed)updateReload(game,player.combat.reload.commitTime+.001);
    cancelReload(game);assert.equal(weapon.magazine.id,committed?spare.id:old.id);
    assert.equal(findItem(player,committed?old.id:spare.id).rounds,committed?3:30);
  }
  for(const change of ['sprint','equip','mod']){
    const {player,weapon,game}=fixture();const spare=createItem('mag_ak_30',1,{rounds:30});addItem(player,spare);beginReload(game);
    if(change==='sprint')player.running=true;
    if(change==='equip'){const pistol=createItem('pistol_9mm');addItem(player,pistol);equipItem(player,pistol.id);}
    if(change==='mod')weapon.mods.stock=createItem('ak_fixed_stock');
    updateReload(game,3);assert.equal(player.combat.reload,undefined);assert.equal(weapon.magazine,null);assert.equal(findItem(player,spare.id).rounds,30);
  }
});

test('revolver start/load/end clips share the gameplay clock; partial loading and interruption cannot duplicate ammunition',()=>{
  const {player,weapon,game}=fixture('revolver_44');addItem(player,createItem('ammo_44',12));
  assert.equal(beginReload(game).ok,true);const state=player.combat.reload;
  near(state.duration,(WEAPON_MOTIONS.clips.revolverStart.duration+6*WEAPON_MOTIONS.clips.revolverLoad.duration+WEAPON_MOTIONS.clips.revolverEnd.duration)/.8);
  assert.equal(reloadPhase(state).clip,'revolverStart');updateReload(game,0);assert.equal(weapon.rounds,0);
  updateReload(game,state.start+state.loop*.69);assert.equal(weapon.rounds,0);
  updateReload(game,state.loop*.02);assert.equal(weapon.rounds,1);assert.equal(countType(player,'ammo_44'),11);
  updateReload(game,state.loop);assert.equal(weapon.rounds,2);assert.equal(countType(player,'ammo_44'),10);
  const saved=serialize({...game,zombies:[]});assert.equal(saved.player.combat.reload,undefined);assert.equal(saved.player.inventory.find(i=>i.id===weapon.id).rounds,2);
  player.running=true;updateReload(game,.01);assert.equal(player.combat.reload,undefined);assert.equal(weapon.rounds,2);
  player.running=false;beginReload(game);const second=player.combat.reload;assert.equal(second.initialRounds,2);assert.equal(second.planned,4);assert.ok(second.duration<state.duration);
  updateReload(game,second.duration);assert.equal(weapon.rounds,6);assert.equal(countType(player,'ammo_44'),6);assert.equal(player.combat.reload,undefined);
});

test('visual kick responds to every shot and to recoil-reducing parts while staying independent of accuracy recovery',()=>{
  const {player,weapon}=fixture('revolver_44');player.combat.recoil=0;kickWeapon(player,weapon);
  const first=recoilPose(player,weapon.id,true);assert.ok(first.pitch>.25);assert.ok(first.back>.04);
  player.combat.shotImpulse.age=.1;assert.ok(recoilPose(player,weapon.id,true).pitch<first.pitch*.4);
  player.combat.recoil=1.5;player.combat.shotImpulse.age=.6;assert.equal(recoilPose(player,weapon.id,true).pitch,0);
  const ak=fixture();kickWeapon(ak.player,ak.weapon);const bare=recoilPose(ak.player,ak.weapon.id);
  ak.weapon.mods.stock=createItem('ak_fixed_stock');delete ak.player.combat.shotImpulse;kickWeapon(ak.player,ak.weapon);
  assert.ok(recoilPose(ak.player,ak.weapon.id).pitch<bare.pitch*.7);
});

test('all chosen barrel assemblies and suppressors expose a geometry-derived muzzle, including every revolver length',async()=>{
  const library=new WeaponModels({loadAsset:parse});
  for(const [type,suppressor] of [['ak_762','ak_suppressor'],['vector_9mm','vector_suppressor'],['m4_556','m4_suppressor'],['revolver_44',null]]){
    await library.request(type);const weapon=createItem(type),root=library.create(weapon),muzzle=root.userData.muzzle.clone();
    assert.ok(muzzle.z>.15);assert.ok(muzzle.y>.04&&muzzle.y<.12);assert.ok(Math.abs(muzzle.x)<.003);
    if(suppressor){weapon.mods.muzzle=createItem(suppressor);configureWeaponModel(root,weapon);assert.ok(root.userData.muzzle.z>muzzle.z+.09);}
    if(type==='m4_556'){
      const standard=root.userData.muzzle.z;weapon.mods.barrel=createItem('m4_rail_barrel');configureWeaponModel(root,weapon);near(standard-root.userData.muzzle.z,.05478302,1e-5);
    }
    if(type==='revolver_44'){
      weapon.mods.barrel=createItem('revolver_long_barrel');configureWeaponModel(root,weapon);assert.ok(root.userData.muzzle.z>muzzle.z+.08);
      weapon.mods.barrel=createItem('revolver_rail_barrel');configureWeaponModel(root,weapon);assert.ok(root.userData.muzzle.z>muzzle.z+.08);
    }
  }
});

test('shots originate at the actual posed muzzle on both characters and retain the captured position after kick and movement',async()=>{
  const model=await models();await Promise.all(['ak_762','vector_9mm','m4_556','revolver_44'].map(t=>model.weapons.request(t)));
  for(const sex of ['male','female'])for(const type of ['ak_762','vector_9mm','m4_556','revolver_44'])for(const yaw of [0,Math.PI/2,Math.PI,-Math.PI/2]){
    const {player,weapon,game}=fixture(type,sex);player.x=8;player.y=9;player.facingX=Math.sin(yaw);player.facingY=Math.cos(yaw);
    const origin=model.shotMuzzle(player,1),entity=model.entities.get(player);
    assert.ok(origin);const actual=entity.weapon.localToWorld(entity.weapon.userData.muzzle.clone());
    near(origin.x,player.x+actual.x/2);near(origin.y,player.y+actual.z/2);near(origin.height,actual.y);
    assert.ok(Math.hypot(origin.x-player.x,origin.y-player.y)>.12);assert.ok(origin.height>1.1&&origin.height<1.8);
    const renderer={playerModels:model,tracers:[],gunshots:[],trace:Renderer.prototype.trace};
    game.world.hasLineOfSight=()=>true;Renderer.prototype.firearmShot.call(renderer,game,weapon,{x:8+Math.sin(yaw)*4,y:9+Math.cos(yaw)*4});
    near(renderer.tracers[0].start.x,renderer.gunshots[0].start.x);near(renderer.tracers[0].start.height,renderer.gunshots[0].start.height);
    const captured={...renderer.tracers[0].start};kickWeapon(player,weapon);player.x+=1;model.prepare(player,1.05);
    assert.deepEqual(renderer.tracers[0].start,captured);
  }
});

test('authored reload motion preserves the legs; magazines detach and revolver cylinders open and reset without accumulating transforms',async()=>{
  const model=await models();
  for(const sex of ['male','female'])for(const type of ['ak_762','vector_9mm','m4_556','revolver_44']){
    await model.weapons.request(type);const {player,weapon,game}=fixture(type,sex);
    if(type==='revolver_44')addItem(player,createItem('ammo_44',6));
    else {const mag={ak_762:'mag_ak_30',m4_556:'mag_m4_30',vector_9mm:'mag_vector_33'}[type];weapon.magazine=createItem(mag,1,{rounds:2});addItem(player,createItem(mag,1,{rounds:30}));}
    beginReload(game);const state=player.combat.reload,appearance=playerModelAppearance(player),entity=model.entity(player,appearance);model.equip(entity,player);
    for(const progress of [.08,.30,.42,.55,.74,.90,.99]){
      model.pose(entity,{clip:'Walk',progress:.3,delta:1,yaw:0});resetWeaponParts(entity.weapon);applyRiflePose(entity,player,1,'hip');
      const feet=['UpperLegL','LowerLegL','UpperLegR','LowerLegR'].map(n=>entity.model.getObjectByName(n).getWorldPosition(new Vector3()));
      state.elapsed=state.duration*progress;applyReloadPose(entity,player);
      ['UpperLegL','LowerLegL','UpperLegR','LowerLegR'].forEach((n,i)=>assert.ok(entity.model.getObjectByName(n).getWorldPosition(new Vector3()).distanceTo(feet[i])<1e-7));
      entity.root.traverse(o=>assert.ok([...o.position.toArray(),...o.quaternion.toArray()].every(Number.isFinite)));
      if(type==='revolver_44'&&progress===.42)assert.ok(Math.abs(entity.weapon.getObjectByName('Cylinder').rotation.z)>.9);
      if(type!=='revolver_44'&&progress===.30)assert.ok(entity.weapon.getObjectByName('Magazine').position.length()>.05);
    }
    cancelReload(game);resetWeaponParts(entity.weapon);
    for(const [name,pose] of entity.weapon.userData.partPose){const part=entity.weapon.getObjectByName(name);assert.ok(part.position.distanceTo(pose.position)<1e-10);near(part.quaternion.angleTo(pose.rotation),0);}
  }
});

test('shot trails are short, faint moving segments and are clipped at the first wall; a new flash survives its first render',()=>{
  const start={x:0,y:0,height:1.4},end={x:10,y:0,height:1};const tracer=createTracer(start,end);
  for(const age of [0,.01,.03,.055]){tracer.age=age;const s=tracerSegment(tracer);assert.ok(Math.hypot(s.to.x-s.from.x,s.to.y-s.from.y)<=.480001);assert.ok(s.alpha<=.32);}
  tracer.age=0;const events={tracers:[tracer],gunshots:[{age:0,fresh:true}]};updateShotEffects(events,.05);assert.equal(events.gunshots.length,1);near(events.gunshots[0].age,0);
  updateShotEffects(events,.1);assert.equal(events.gunshots.length,0);assert.equal(events.tracers.length,0);
  const clipped=shotEnd({hasLineOfSight:(_a,b)=>b.x<=3},start,end);assert.ok(clipped.x<=3&&clipped.x>2.995);near(clipped.height,1.4-.4*clipped.x/10);
});
