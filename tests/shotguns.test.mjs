import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {Quaternion,Vector3} from 'three';
import {createPlayer} from '../docs/src/character.js';
import {ITEMS,LOOT_TABLES} from '../docs/src/data.js';
import {createItem,addItem,equipItem,activeWeapon,fillMagazine,emptyMagazine,installMod,removeMod,itemWeight,countType,roundsInWeapon,consumeShot,weaponCapacity,inventoryWeight} from '../docs/src/inventory.js';
import {beginReload,updateReload,cancelReload} from '../docs/src/weapon-reload.js';
import {shotgunPath} from '../docs/src/projectile-path.js';
import {weaponFixture} from './helpers/weapon-fixture.mjs';
import {createWeaponTestItems} from '../docs/src/weapon-test-crate.js';
import {weaponModelDefinition} from '../docs/src/weapon-catalog.js';
import {queueCasings,updateCasings} from '../docs/src/casings.js';
import {cartridgeData} from '../docs/src/cartridge-models.js';
import {bodyIntersections} from './helpers/body-intersections.mjs';
import {CombatSystem} from '../docs/src/combat.js';
import {pinchPoint} from '../docs/src/weapon-hands.js';
const types=['ithaca_mag10','ithaca_short','benelli_m4','mossberg_590'];
function fixture(type){const player=createPlayer();player.inventory=[];player.equipment.mainHand=null;player.baseCapacity=100;const weapon=createItem(type);addItem(player,weapon);equipItem(player,weapon.id);return{player,weapon:activeWeapon(player),game:{player,world:{emitNoise(){}},sound(){},save(){},ui:{refreshAll(){},showToast(){}}}};}
const near=(a,b,e=1e-6)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);

test('all agreed shotgun forms, compatible carriers and both shell calibres are findable and in the starting test crate',()=>{
 const crate=createWeaponTestItems();
 for(const type of types){const d=ITEMS[type];assert.equal(d.feed,'internal');assert.ok(weaponModelDefinition(type));assert.ok(crate.some(i=>i.type===type));assert.ok(crate.some(i=>i.type===d.ammoType));assert.ok(Object.values(LOOT_TABLES).flat().some(row=>row[0]===type));const carriers=Object.entries(ITEMS).filter(([,m])=>m.shellCarrier&&m.compatible.includes(type));assert.equal(carriers.length,1);assert.ok(crate.some(i=>i.type===carriers[0][0]));}
 assert.deepEqual(types.map(t=>ITEMS[t].capacity),[3,3,8,9]);assert.equal(ITEMS.ithaca_short.hands,1);assert.equal(ITEMS.ithaca_short.ammoType,'ammo_10g');assert.equal(ITEMS.benelli_m4.ammoType,'ammo_12g');
});

test('single-shell reloads transfer at each insertion, survive interruption and consume holder rounds before loose ammunition',()=>{
 for(const type of types){
  const{player,weapon,game}=fixture(type),def=ITEMS[type],holderType=Object.keys(ITEMS).find(t=>ITEMS[t].shellCarrier&&ITEMS[t].compatible.includes(type)),holder=createItem(holderType,1,{rounds:2});addItem(player,holder);installMod(player,weapon.id,holder.id);addItem(player,createItem(def.ammoType,12));
  const weight=inventoryWeight(player);assert.ok(beginReload(game).ok);let state=player.combat.reload;assert.equal(state.kind,'tube');assert.equal(weaponCapacity(weapon),def.capacity);
  updateReload(game,state.start+state.loop*(state.insertAt-.01));assert.equal(weapon.rounds,0);assert.equal(weapon.mods.carrier.rounds,2);
  updateReload(game,state.loop*.02);assert.equal(weapon.rounds,1);assert.equal(weapon.mods.carrier.rounds,1);near(inventoryWeight(player),weight);
  cancelReload(game);assert.equal(weapon.rounds,1);assert.equal(countType(player,def.ammoType),12);
  assert.ok(beginReload(game).ok);state=player.combat.reload;updateReload(game,state.duration+2);assert.equal(weapon.rounds,def.capacity);assert.equal(weapon.mods.carrier.rounds,0);assert.equal(countType(player,def.ammoType),14-def.capacity);near(inventoryWeight(player),weight);
  assert.ok(consumeShot(weapon));assert.equal(weapon.rounds,def.capacity-1);assert.equal(weapon.mods.carrier.rounds,0);
 }
});

test('carriers preserve individually stored ammunition through fill, detach, remount, empty and save roundtrip',()=>{
 for(const type of types){const{player,weapon}=fixture(type),def=ITEMS[type],holderType=Object.keys(ITEMS).find(t=>ITEMS[t].shellCarrier&&ITEMS[t].compatible.includes(type)),holder=createItem(holderType);addItem(player,holder);addItem(player,createItem(def.ammoType,8));const total=inventoryWeight(player);assert.ok(fillMagazine(player,holder.id).ok);near(inventoryWeight(player),total);assert.ok(installMod(player,weapon.id,holder.id).ok);assert.ok(emptyMagazine(player,weapon.mods.carrier.id).ok);assert.equal(weapon.mods.carrier.rounds,0);near(inventoryWeight(player),total);assert.ok(fillMagazine(player,weapon.mods.carrier.id).ok);const rounds=weapon.mods.carrier.rounds;assert.ok(removeMod(player,weapon.id,'carrier').ok);const detached=player.inventory.find(i=>i.id===holder.id);assert.equal(detached.rounds,rounds);assert.ok(installMod(player,weapon.id,holder.id).ok);const restored=JSON.parse(JSON.stringify(player));assert.equal(activeWeapon(restored).mods.carrier.rounds,rounds);assert.equal(roundsInWeapon(activeWeapon(restored)),0);near(inventoryWeight(restored),total);}
 const{player,weapon,game}=fixture('ithaca_short');addItem(player,createItem('ammo_12g',12));assert.equal(beginReload(game).ok,false);assert.equal(weapon.rounds,0);
});

test('shotgun pellets use a forward cone, share a finite damage budget and respect cover and intervening bodies',()=>{
 const player={x:0,y:0},front={id:'a',x:2,y:0},behind={id:'b',x:3,y:0},side={id:'c',x:2,y:1},game={player,zombies:[front,behind,side],world:{hasLineOfSight:()=>true}},stats=ITEMS.benelli_m4;
 let path=shotgunPath(game,front,stats);assert.ok(path.hits.some(h=>h.zombie===front));assert.ok(!path.hits.some(h=>h.zombie===behind||h.zombie===side));assert.ok(path.hits.reduce((s,h)=>s+h.attenuation,0)<=1);assert.equal(path.pelletPaths.length,8);
 game.world.hasLineOfSight=(a,b)=>b.x<1;path=shotgunPath(game,front,stats);assert.equal(path.hits.length,0);assert.ok(path.pelletPaths.every(p=>p.end.x<=1.001));
});

test('a loaded shell permits interrupting a tube reload to fire once, and the pump blocks a simultaneous reload',()=>{
 for(const type of types){const{player,weapon,game}=fixture(type),definition=ITEMS[type];addItem(player,createItem(definition.ammoType,12));assert.ok(beginReload(game).ok);const state=player.combat.reload;updateReload(game,state.start+state.loop*(state.insertAt+.01));assert.equal(weapon.rounds,1);
  const zombie={id:'target',x:player.x+2,y:player.y,hp:200},combat=new CombatSystem();combat.target=()=>zombie;combat.damageZombie=()=>{};let shots=0;Object.assign(game,{zombies:[zombie],random:()=>.5,renderer:{firearmShot(){shots++;}},attractMigration(){}});game.world.hasLineOfSight=()=>true;game.ui.showMessage=()=>{};player.combat.enabled=true;player.combat.targetId=zombie.id;
  assert.ok(combat.fire(game).ok);assert.equal(weapon.rounds,0);assert.equal(player.combat.reload,undefined);assert.equal(shots,1);assert.equal(player.shots,1);
  if(definition.pumpAction){assert.equal(beginReload(game).ok,false);player.combat.shotImpulse.age=.70;assert.equal(beginReload(game).ok,true);}
 }
});

test('the playable short Ithaca retains the approved original-stock model surfaces and rig calibration',async()=>{
 const raw=gunzipSync(await readFile(new URL('./fixtures/ithaca-reference-cut.glb.gz',import.meta.url))),reference=(await new GLTFLoader().parseAsync(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),'')).scene;
 for(const sex of ['male','female']){const f=await weaponFixture({sex,type:'ithaca_short'});try{const originals=[];reference.traverse(m=>{if(m.isMesh)originals.push(m);});for(const original of originals){const m=f.entity.weapon.getObjectByName(original.name);assert.ok(m);for(const key of ['position','color'])assert.deepEqual(Array.from(m.geometry.attributes[key].array),Array.from(original.geometry.attributes[key].array),key+' '+original.name);}assert.equal(f.entity.weapon.userData.oneHandPose.previewOnly,false);for(const[name,q]of Object.entries(f.entity.weapon.userData.oneHandPose.rigs[sex].boneRotations))near(f.entity.model.getObjectByName(name).quaternion.normalize().angleTo(new Quaternion(...q).normalize()),0,1e-5);}finally{f.replay.dispose();}}
});

test('Mossberg forearm and support hand follow the pump, while semi-auto forearms stay fixed and shells eject once',async()=>{
 for(const type of ['mossberg_590','benelli_m4','ithaca_mag10']){const f=await weaponFixture({type,track:'shot'});try{const e=f.entity,part=e.weapon.getObjectByName(type==='ithaca_mag10'?'Forearm':'Forearm'),base=part.position.z;f.replay.seek(.36);near(part.position.z-base,type==='mossberg_590'?-.085:0,.002);assert.ok(e.weapon.getObjectByName('Bolt').position.z<0||type!=='mossberg_590');}finally{f.replay.dispose();}}
 const renderer={},world={tileAt:()=> 'grass',emitNoise(){}},game={world,elapsed:0},socket={x:0,y:0,height:1,rotation:[0,0,0,1]};let resolved=0;queueCasings(renderer,game,'ammo_12g',socket,1,.31,()=>{resolved++;return{...socket,x:3};});updateCasings(renderer,game,.30);assert.equal(renderer.casings.length,0);assert.equal(resolved,0);updateCasings(renderer,game,.02);assert.equal(renderer.casings.length,1);assert.equal(resolved,1);assert.ok(renderer.casings[0].x>=3,'pump case starts at the moving weapon socket');updateCasings(renderer,game,.4);assert.equal(renderer.casings.length,1);assert.equal(resolved,1);assert.equal(cartridgeData('ammo_12g').definition.plastic,true);
});

test('semi-auto shotgun bolts stay open after the last shell and close at the first completed reload insertion',async()=>{
 for(const type of ['ithaca_mag10','ithaca_short','benelli_m4']){
  const f=await weaponFixture({type,track:'shot'}),weapon=activeWeapon(f.player);try{weapon.rounds=1;assert.ok(consumeShot(weapon));assert.equal(weapon.slideLocked,true);f.replay.evaluate(1);near(f.entity.weapon.getObjectByName('Bolt').position.z,-.075);assert.ok(beginReload(f.replay.game).ok);const state=f.player.combat.reload;updateReload(f.replay.game,state.start+state.loop*(state.insertAt+.01));assert.equal(weapon.slideLocked,false);assert.equal(weapon.rounds,1);}finally{f.replay.dispose();}
 }
});

test('both shotgun rigs keep continuous, clear arm paths through crouched loading and interrupted returns at 30/60 Hz',async()=>{
 const bones=['UpperArmR','LowerArmR','WristR','UpperArmL','LowerArmL','WristL'];
 for(const sex of ['male','female'])for(const type of types)for(const fps of [30,60]){
  const f=await weaponFixture({sex,type,track:'reload',movement:'crouchWalk',fps}),e=f.entity,probe=bodyIntersections(e);let previous,wrists;
  try{
   const duration=f.replay.duration;
   for(let i=0;i<Math.ceil((duration+.95)*fps);i++){
    const loading=f.player.combat.reload,inserted=loading?.loaded||0;
    f.replay.step(1/fps);
    if(loading?.loaded>inserted)assert.ok(pinchPoint(e).distanceTo(e.weapon.localToWorld(new Vector3(...e.weapon.userData.anchors.loading)))<.02,`${sex} ${type}: shell reaches the real loading port at transfer`);
    const rotations=bones.map(n=>e.model.getObjectByName(n).getWorldQuaternion(new Quaternion()).normalize()),points=['WristR','WristL'].map(n=>e.model.getObjectByName(n).getWorldPosition(new Vector3()));
    if(previous)rotations.forEach((q,j)=>assert.ok(q.angleTo(previous[j])<36/fps+.01,`${sex} ${type} ${fps} frame ${i}: ${bones[j]} takes a short path`));
    if(wrists)points.forEach((p,j)=>assert.ok(p.distanceTo(wrists[j])<3/fps+.004,`${sex} ${type} ${fps}: no hand jump`));
    assert.deepEqual(probe(),[],`${sex} ${type} ${fps} frame ${i}: arms clear the moving body`);previous=rotations;wrists=points;
   }
   assert.equal(f.player.combat.reload,undefined);assert.equal(e.shotgunReload,null,'return releases the arm to its normal controller');assert.equal(activeWeapon(f.player).rounds,ITEMS[type].capacity);
   f.replay.reset();f.replay.seek(Math.min(.8,duration*.5));cancelReload(f.replay.game);
   for(let i=0;i<fps;i++){f.replay.step(1/fps);assert.deepEqual(probe(),[],`${sex} ${type}: reload abort clears body`);}
  }finally{f.replay.dispose();}
 }
});


test('visible carrier shells are picked up and seated at the actual loading port before loose shells on both rigs',async()=>{
 for(const sex of ['male','female'])for(const type of types){
  const f=await weaponFixture({sex,type,track:'aim',movement:'crouchWalk',fps:30}),weapon=activeWeapon(f.player),holderType=Object.keys(ITEMS).find(t=>ITEMS[t].shellCarrier&&ITEMS[t].compatible.includes(type)),holder=createItem(holderType,1,{rounds:ITEMS[holderType].capacity});
  try{
   weapon.rounds=0;addItem(f.player,holder);assert.ok(installMod(f.player,weapon.id,holder.id).ok);f.replay.evaluate(1);assert.ok(beginReload(f.replay.game).ok);const state=f.player.combat.reload;f.replay.duration=state.duration;let transfers=0;
   for(let i=0;i<Math.ceil(state.duration*30);i++){
    const loaded=state.loaded;f.replay.step(1/30);const e=f.entity;
    if(state.loaded>loaded){transfers++;assert.ok(pinchPoint(e).distanceTo(e.weapon.localToWorld(new Vector3(...e.weapon.userData.anchors.loading)))<.02,`${sex} ${type} shell ${state.loaded}: actual contact at transfer`);}
    if(!e.weapon.userData.carriedShell?.visible){
     const visible=e.weapon.userData.shellParts.filter(parts=>e.weapon.getObjectByName(parts[0]).visible).length;assert.equal(visible,weapon.mods.carrier.rounds);
    }
   }
   assert.equal(transfers,ITEMS[type].capacity);assert.equal(weapon.mods.carrier.rounds,0);assert.equal(weapon.rounds,ITEMS[type].capacity);
  }finally{f.replay.dispose();}
 }
});
