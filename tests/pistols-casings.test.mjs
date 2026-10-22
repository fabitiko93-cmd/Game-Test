import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {Box3,Quaternion,Vector3} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {ITEMS} from '../docs/src/data.js';
import {createPlayer} from '../docs/src/character.js';
import {activeWeapon,addItem,createItem,equipItem,installMod,removeMod,weaponStats,weaponModSlots} from '../docs/src/inventory.js';
import {WeaponModels,weaponModelBounds,configureWeaponModel} from '../docs/src/weapon-models.js';
import {weaponModelDefinition} from '../docs/src/weapon-catalog.js';
import {applyWeaponCycle} from '../docs/src/weapon-cycle.js';
import {resetWeaponParts} from '../docs/src/weapon-reload-pose.js';
import {cartridgeData} from '../docs/src/cartridge-models.js';
import {queueCasings,updateCasings,CASING_LIMIT,CASING_LIFETIME} from '../docs/src/casings.js';
import {projectilePath} from '../docs/src/projectile-path.js';
import {beginReload,cancelReload,updateReload} from '../docs/src/weapon-reload.js';
import {CombatSystem} from '../docs/src/combat.js';
import {Renderer} from '../docs/src/render.js';
import {World} from '../docs/src/world.js';
import {QuaterniusAssets} from '../docs/src/quaternius-assets.js';
import {PlayerModels} from '../docs/src/player-models.js';
import {playerModelAppearance} from '../docs/src/quaternius-catalog.js';
import {casingImpactSound} from '../docs/src/game-audio.js';

const types=['pistol_9mm','usp_9mm','scorpion_45','desert_eagle_50'];
const cache=new Map();
async function parse(url){
  const name=new URL(url).pathname.split('/').at(-1),folder=/^(g17|usp|scorpion|deagle|ak|m4|vector|revolver)-/.test(name)?'weapons':'quaternius';
  if(!cache.has(name))cache.set(name,(async()=>{const bytes=gunzipSync(await readFile(new URL(`../docs/assets/${folder}/${name}`,import.meta.url)));return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');})());
  return cache.get(name);
}
function fixture(type='pistol_9mm',rounds=2){
  const player=createPlayer();player.inventory=[];player.baseCapacity=100;player.equipment.mainHand=null;
  addItem(player,createItem(type));equipItem(player,player.inventory[0].id);const weapon=activeWeapon(player),def=ITEMS[type];
  if(def.feed==='magazine')weapon.magazine=createItem(def.magazineTypes[0],1,{rounds});else weapon.rounds=rounds;
  const target={id:'target',x:player.x+2,y:player.y,hp:1000,state:'idle'};player.combat.enabled=true;player.combat.targetId=target.id;player.combat.aim=1;
  const world={noises:[],blood:[],hasLineOfSight:()=>true,insideBuilding:()=>({}),tileAt:()=> 'floor',emitNoise(x,y,radius,kind,duration,strength){this.noises.push({x,y,radius,kind,life:duration,maxLife:duration,strength});}};
  const game={player,world,zombies:[target],elapsed:0,random:()=>.5,renderer:{trace(){},burst(){}},stealth:{onAttack(){}},attractMigration(){},sound(){},ui:{showToast(){},showMessage(){},refreshAll(){}},save(){}};
  return{game,player,weapon,target,world};
}
const near=(a,b,eps=1e-6)=>assert.ok(Math.abs(a-b)<eps,`${a} != ${b}`);

test('all four real pistols retain source geometry and colours, metre scale, compatible test kits and animated slides',async()=>{
  const library=new WeaponModels({loadAsset:parse});
  const crate=new World(7788).objects.find(o=>o.id==='weapon-test-crate'||o.weaponTestCrate||o.name?.includes('WAFFEN-TEST'));
  assert.ok(crate);
  for(const type of types){
    const {weapon,player}=fixture(type),def=weaponModelDefinition(type);await library.request(type);const model=library.create(weapon);
    const originals=Object.entries(def.asset.parts).filter(([n,p])=>p.source===def.asset.source).reduce((sum,[n,p])=>sum+p.triangles,0);
    assert.equal(originals,def.asset.sourceTriangles);near(weaponModelBounds(model).getSize(new Vector3()).z,def.asset.length,2e-5);
    if(type!=='desert_eagle_50')for(const name of ['Suppressor','Flashlight','Reflex']){
      const colors=model.getObjectByName(name).geometry.attributes.color.array;assert.ok(colors.some(c=>c<.3),`${type}/${name}: original dark material colours`);
    }
    assert.ok(model.getObjectByName('Slide'));assert.ok(model.getObjectByName('Magazine'));assert.ok(model.getObjectByName('Receiver').geometry.attributes.color);
    assert.ok(crate.items.some(i=>i.type===type));assert.ok(crate.items.some(i=>i.type===ITEMS[type].ammoType));
    for(const mag of ITEMS[type].magazineTypes)assert.ok(crate.items.some(i=>i.type===mag));
    for(const [part]of Object.entries(def.asset.parts))assert.ok(model.getObjectByName(part));
    player.combat.shotImpulse={weaponId:weapon.id,age:.023,power:.4};applyWeaponCycle({weapon:model},player);
    assert.ok(model.getObjectByName('Slide').position.z<-.02);
    resetWeaponParts(model);player.combat.shotImpulse.age=.2;applyWeaponCycle({weapon:model},player);near(model.getObjectByName('Slide').position.z,0);
    weapon.magazine.rounds=0;weapon.slideLocked=true;resetWeaponParts(model);applyWeaponCycle({weapon:model},player);near(model.getObjectByName('Slide').position.z,-def.mechanism.slideTravel);
    player.combat.reload={weaponId:weapon.id,elapsed:.9,duration:1};weapon.magazine.rounds=3;resetWeaponParts(model);applyWeaponCycle({weapon:model},player);assert.ok(model.getObjectByName('Slide').position.z>-def.mechanism.slideTravel);
  }
});

test('pistol optics require their real mounting plate; removing it returns the optic without loss; suppressors preserve ballistics',()=>{
  for(const type of types.slice(0,3)){
    const{player,weapon}=fixture(type);const base=weaponStats(weapon);
    assert.ok(!weaponModSlots(weapon).includes('optic'));
    for(const kind of ['pistol_optic_mount','reflex_sight','sidearm_suppressor','pistol_flashlight']){
      const item=createItem(kind);assert.ok(addItem(player,item));assert.ok(installMod(player,weapon.id,item.id).ok);
    }
    const after=weaponStats(weapon);near(after.damage,base.damage);near(after.penetration,base.penetration);near(after.penetrationDamage,base.penetrationDamage);assert.ok(after.noise<base.noise);
    const optic=weapon.mods.optic;assert.ok(removeMod(player,weapon.id,'mount').ok);assert.equal(weapon.mods.optic,undefined);assert.ok(player.inventory.some(i=>i.id===optic.id));
  }
  assert.deepEqual(ITEMS.desert_eagle_50.modSlots,[]);assert.equal(ITEMS.mag_deagle_7.capacity,7);assert.equal(ITEMS.ammo_50ae.ammoType,'ammo_50ae');
});

test('real male/female rigs keep all pistol muzzle and ejection sockets on the held weapon in every direction',async()=>{
  const assets=new QuaterniusAssets({loadAsset:parse}),models=new PlayerModels({},assets);models.weapons.loadAsset=parse;await models.ready;
  for(const type of types)await models.weapons.request(type);
  for(const sex of ['male','female'])for(const type of types)for(const yaw of [0,Math.PI/2,Math.PI,Math.PI*1.5]){
    const{player,weapon}=fixture(type);player.appearance.sex=sex;player.facingX=Math.sin(yaw);player.facingY=Math.cos(yaw);player.combat.aim=1;
    const appearance=playerModelAppearance(player);await Promise.all(Object.values(appearance).filter(v=>typeof v==='string'&&v.includes('-')).map(k=>assets.request(k)));
    const entity=models.prepare(player,1);assert.ok(entity?.weapon);const muzzle=models.shotMuzzle(player,1),socket=models.ejectionSocket(player,1);
    assert.ok(muzzle&&socket);assert.ok(socket.height>.4&&socket.height<1.9,`${sex} ${type}: ${socket.height}`);assert.ok(Math.hypot(socket.x-player.x,socket.y-player.y)<.6);
    const right=entity.model.getObjectByName('WristR').getWorldPosition(new Vector3()),left=entity.model.getObjectByName('WristL').getWorldPosition(new Vector3());
    assert.ok(right.distanceTo(left)<.38,`${type}: two-handed aim`);
    for(const name of ['UpperArmR','LowerArmR','WristR','UpperArmL','LowerArmL','WristL'])assert.ok(entity.model.getObjectByName(name).quaternion.toArray().every(Number.isFinite));
  }
});

test('pistol reloads carry the actual magazine and its rounds with the support hand, then release the empty-slide lock',async()=>{
  const assets=new QuaterniusAssets({loadAsset:parse}),models=new PlayerModels({},assets);models.weapons.loadAsset=parse;await models.ready;
  for(const type of types)await models.weapons.request(type);
  for(const type of types){
    const{game,player,weapon}=fixture(type,0);weapon.slideLocked=true;
    addItem(player,createItem(ITEMS[type].magazineTypes[0],1,{rounds:ITEMS[ITEMS[type].magazineTypes[0]].capacity}));
    assert.ok(beginReload(game).ok);const state=player.combat.reload;
    for(const progress of [.29,.55,.69,.90]){
      updateReload(game,state.duration*progress-state.elapsed);
      const entity=models.prepare(player,progress*state.duration),mag=entity.weapon.getObjectByName(entity.weapon.userData.magazinePart);
      assert.ok(mag);assert.ok(mag.position.toArray().every(Number.isFinite));
      for(const name of ['FeedRound','MagazineRounds']){
        const round=entity.weapon.getObjectByName(name);if(round?.visible){near(round.position.distanceTo(mag.position),0);near(round.quaternion.angleTo(mag.quaternion),0);}
      }
      for(const side of ['L','R']){
        const upper=entity.model.getObjectByName('UpperArm'+side).getWorldPosition(new Vector3()),lower=entity.model.getObjectByName('LowerArm'+side).getWorldPosition(new Vector3()),wrist=entity.model.getObjectByName('Wrist'+side).getWorldPosition(new Vector3());
        assert.ok(upper.distanceTo(lower)<.45&&lower.distanceTo(wrist)<.45);assert.ok(entity.model.getObjectByName('Wrist'+side).quaternion.toArray().every(Number.isFinite));
      }
    }
    updateReload(game,state.duration-state.elapsed+.001);assert.equal(weapon.slideLocked,false);assert.ok(weapon.magazine.rounds>0);
    const entity=models.prepare(player,state.duration+.1);near(entity.weapon.getObjectByName('Slide').position.z,0);
  }
});

test('all ammunition follows the fired ray in order, loses damage per body and stops at walls; misses can hit a different body',()=>{
  for(const type of [...types,'revolver_44','ak_762','m4_556','vector_9mm']){
    const{game,player,target}=fixture(type),stats=weaponStats(activeWeapon(player));
    const nearBody={id:'near',x:player.x+1,y:player.y,hp:1000},second={id:'second',x:player.x+3,y:player.y,hp:1000},third={id:'third',x:player.x+4,y:player.y,hp:1000};
    game.zombies=[third,second,target,nearBody];const result=projectilePath(game,target,stats);
    assert.equal(result.hits[0].zombie,nearBody);assert.equal(result.hits.length,stats.penetration+1);
    result.hits.forEach((h,i)=>near(h.attenuation,stats.penetrationDamage**i));
    game.world.hasLineOfSight=(a,b)=>b.x<player.x+2.5;const blocked=projectilePath(game,target,stats);assert.ok(blocked.hits.every(h=>h.zombie.x<player.x+2.5));assert.ok(blocked.end.x<player.x+2.5);
    game.world.hasLineOfSight=()=>true;assert.equal(projectilePath(game,{x:target.x,y:target.y+2},stats).hits.length,0);
  }
});

test('a real shot moves the slide, consumes one round and locks open on empty; revolver keeps spent cases until reload ejection',()=>{
  for(const type of types){const{game,weapon}=fixture(type,1);assert.ok(new CombatSystem().fire(game).ok);assert.equal(weapon.magazine.rounds,0);assert.equal(weapon.slideLocked,true);}
  const{game,weapon,player}=fixture('revolver_44',3);assert.ok(new CombatSystem().fire(game).ok);assert.equal(weapon.spentCases,1);
  addItem(player,createItem('ammo_44',6));const events=[];game.renderer.ejectRevolverCases=(g,count)=>events.push(count);
  assert.ok(beginReload(game).ok);updateReload(game,player.combat.reload.start*.4);assert.equal(events.length,0);cancelReload(game);assert.equal(weapon.spentCases,1);
  beginReload(game);updateReload(game,player.combat.reload.start*.57);assert.deepEqual(events,[1]);assert.equal(weapon.spentCases,0);cancelReload(game);
  beginReload(game);updateReload(game,player.combat.reload.start*.8);assert.deepEqual(events,[1]);
});

test('cases detach in world space, fall and settle on the floor at 30/60/120 Hz; impact sounds/noises start on contact, use tiny local circles, and soft floors damp them',()=>{
  const rests=[];
  for(const hz of [30,60,120]){
    const{game,world,player}=fixture();const renderer={},snapshot={x:player.x,y:player.y,height:1.25,rotation:[0,0,0,1]};queueCasings(renderer,game,'ammo_9mm',snapshot);
    snapshot.x+=100;player.x+=50;
    for(let i=0;i<hz*.2;i++){game.elapsed+=1/hz;updateCasings(renderer,game,1/hz);}assert.equal(world.noises.length,0);
    for(let i=0;i<hz*2;i++){game.elapsed+=1/hz;updateCasings(renderer,game,1/hz);}
    const c=renderer.casings[0];assert.ok(c.settled);near(c.height,cartridgeData(c.ammoType).radius);assert.ok(c.x<snapshot.x-95);assert.ok(world.noises.length>0);assert.ok(world.noises.every(n=>n.kind==='casing'&&n.radius<=.55&&Math.hypot(n.x-player.x,n.y-player.y)>45));rests.push(c);
    updateCasings(renderer,game,CASING_LIFETIME);assert.equal(renderer.casings.length,0);
  }
  for(const c of rests.slice(1)){near(c.x,rests[0].x,.012);near(c.y,rests[0].y,.012);}
  for(const soft of [false,true]){
    const{game,world}=fixture();world.insideBuilding=()=>null;world.tileAt=()=>soft?'grass':'road';const renderer={};queueCasings(renderer,game,'ammo_50ae',{x:1,y:1,height:1,rotation:[0,0,0,1]},120,0);
    for(let i=0;i<180;i++){game.elapsed+=1/60;updateCasings(renderer,game,1/60);}
    assert.ok(renderer.casings.length<=CASING_LIMIT);assert.ok(renderer.casings.every(c=>c.settled));assert.ok(world.noises.length>0);
    assert.ok(Math.max(...world.noises.map(n=>n.radius))<(soft?.08:.56));
  }
});

test('spent cartridge geometry has an open dark mouth and no projectile; .50 AE uses a pistol case, and audible impacts pan from the landing position',()=>{
  for(const type of ['ammo_9mm','ammo_45','ammo_44','ammo_50ae','ammo_556x45','ammo_762x39']){
    const empty=cartridgeData(type,true),full=cartridgeData(type,false);assert.ok(full.length>empty.length);assert.ok(empty.positions.every(Number.isFinite));assert.ok(empty.colors.includes(.065));assert.ok(empty.geometry.attributes.position.count<1000);
  }
  near(cartridgeData('ammo_50ae').length,.033);
  const pans=[],frequencies=[];const connect={connect(){return this;},disconnect(){}};
  const game={player:{x:0,y:0},audio:{currentTime:0,destination:{},createGain:()=>({...connect,gain:{value:0,setValueAtTime(){},exponentialRampToValueAtTime(){}}}),createStereoPanner:()=>({...connect,pan:{set value(v){pans.push(v);}}}),createOscillator:()=>({...connect,frequency:{set value(v){frequencies.push(v);}},start(){},stop(){}})}};
  casingImpactSound(game,{x:1,y:0},1,'hard');assert.equal(frequencies.length,3);assert.ok(pans[0]>0);
});
