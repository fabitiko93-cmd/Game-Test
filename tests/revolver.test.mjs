import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {Vector3,Quaternion} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {ITEMS} from '../docs/src/data.js';
import {World} from '../docs/src/world.js';
import {createPlayer} from '../docs/src/character.js';
import {addItem,activeWeapon,createItem,equipItem,findItem,installMod,removeMod,weaponModSlots,weaponStats,
  inventoryWeight,consumeShot,missingWeaponPart,toggleWeaponLight,weaponLight} from '../docs/src/inventory.js';
import {WeaponModels,REVOLVER_MODEL,weaponModelBounds} from '../docs/src/weapon-models.js';
import {PlayerModels} from '../docs/src/player-models.js';
import {QuaterniusAssets} from '../docs/src/quaternius-assets.js';
import {playerModelAppearance} from '../docs/src/quaternius-catalog.js';
import {applyRiflePose} from '../docs/src/rifle-pose.js';
import {CombatSystem} from '../docs/src/combat.js';
import {weaponLightCone,drawWeaponLight} from '../docs/src/weapon-light.js';
import {serialize,load} from '../docs/src/game-state.js';
import {Navigator} from '../docs/src/navigation.js';
import {StealthSystem} from '../docs/src/stealth.js';
import {PlayerVisibility} from '../docs/src/player-visibility.js';
import {kickWeapon} from '../docs/src/weapon-recoil.js';

const near=(a,b,t=1e-7)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`),cache=new Map();
async function parse(url){
  const name=new URL(url).pathname.split('/').at(-1),folder=/^(ak|m4|vector|revolver)-/.test(name)?'weapons':'quaternius';
  if(!cache.has(name))cache.set(name,(async()=>{const bytes=gunzipSync(await readFile(new URL(`../docs/assets/${folder}/${name}`,import.meta.url)));
    return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');})());
  return cache.get(name);
}
function kit(){
  const player=createPlayer();player.baseCapacity=40;
  const weapon=createItem('revolver_44');addItem(player,weapon);equipItem(player,weapon.id);
  for(const type of ['revolver_short_barrel','revolver_long_barrel','revolver_rail_barrel','revolver_wood_grip','revolver_comfort_grip','reflex_sight','revolver_flashlight','pistol_suppressor'])addItem(player,createItem(type));
  const mount=type=>installMod(player,weapon.id,player.inventory.find(i=>i.type===type).id);
  return {player,weapon:activeWeapon(player),mount};
}

test('one six-shot .44 family replaces the old placeholder and its complete modular kit is in the starter crate',()=>{
  assert.equal(ITEMS.revolver_38,undefined);assert.equal(ITEMS.ammo_38,undefined);
  const crate=new World().objects.find(o=>o.type==='weaponcrate'),weapon=crate.items.find(i=>i.type==='revolver_44');
  assert.ok(weapon);assert.equal(weapon.rounds,0);assert.equal(weapon.mods.barrel.type,'revolver_short_barrel');
  assert.equal(weapon.mods.grip.type,'revolver_wood_grip');assert.equal(ITEMS.revolver_44.capacity,6);
  for(const type of ['revolver_short_barrel','revolver_long_barrel','revolver_rail_barrel','revolver_wood_grip','revolver_comfort_grip','reflex_sight','revolver_flashlight','ammo_44'])assert.ok(crate.items.some(i=>i.type===type),type);
  assert.equal(createItem('revolver_44',1,{rounds:99}).rounds,6);
  assert.ok(weaponStats(weapon).damage>ITEMS.hunting_rifle.damage);assert.ok(weaponStats(weapon).recoilPerShot>2*ITEMS.ak_762.recoilPerShot);
});

test('R4 alone enables optics and lights; barrel swaps return dependent attachments without losing mass or identity at full capacity',()=>{
  const {player,weapon,mount}=kit();
  assert.deepEqual(weaponModSlots(weapon),['barrel','grip']);assert.equal(mount('reflex_sight').ok,false);assert.equal(mount('revolver_flashlight').ok,false);
  assert.equal(mount('pistol_suppressor').ok,false);assert.equal(weapon.mods.muzzle,undefined);
  assert.equal(mount('revolver_rail_barrel').ok,true);assert.ok(weaponModSlots(weapon).includes('optic'));
  assert.equal(mount('reflex_sight').ok,true);assert.equal(mount('revolver_flashlight').ok,true);
  const optic=weapon.mods.optic,lamp=weapon.mods.utility,weight=inventoryWeight(player);assert.ok(weaponLight(weapon));
  player.baseCapacity=0;
  assert.equal(mount('revolver_long_barrel').ok,true);
  assert.equal(weapon.mods.optic,undefined);assert.equal(weapon.mods.utility,undefined);assert.equal(weapon.lightOn,false);
  assert.equal(findItem(player,optic.id).type,'reflex_sight');assert.equal(findItem(player,lamp.id).type,'revolver_flashlight');near(inventoryWeight(player),weight);
  mount('revolver_rail_barrel');mount('reflex_sight');mount('revolver_flashlight');const before=inventoryWeight(player);
  assert.equal(removeMod(player,weapon.id,'barrel').ok,true);near(inventoryWeight(player),before);assert.equal(missingWeaponPart(weapon),'LAUFMODUL');
  assert.equal(consumeShot(weapon),false);assert.equal(weaponLight(weapon),null);
});

test('real modules preserve the complete R2 geometry; both grips fit all three barrels and R4 attachments occupy separate rail positions',async()=>{
  const bytes=await readFile(new URL(`../docs/assets/weapons/${REVOLVER_MODEL.file}`,import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),REVOLVER_MODEL.sha256);
  assert.deepEqual(REVOLVER_MODEL.sheetSources,{R1:'Revolver_4.obj',R2:'Revolver_2.obj',R4:'Revolver_3.obj'});
  assert.equal(Object.values(REVOLVER_MODEL.parts).filter(p=>p.source==='Revolver_2.obj').reduce((sum,p)=>sum+p.sourceFaces,0),621);
  assert.equal(REVOLVER_MODEL.parts.Reflex.license,'CC BY 4.0');assert.equal(REVOLVER_MODEL.parts.Flashlight.license,'CC0');
  const library=new WeaponModels({loadAsset:parse});await library.request('revolver_44');
  for(const barrel of ['revolver_short_barrel','revolver_long_barrel','revolver_rail_barrel'])for(const grip of ['revolver_wood_grip','revolver_comfort_grip']){
    const weapon=createItem('revolver_44',1,{mods:{barrel:createItem(barrel),grip:createItem(grip)}}),root=library.create(weapon);
    for(const [name,data] of Object.entries(REVOLVER_MODEL.parts)){
      const mesh=root.getObjectByName(name);assert.ok(mesh);assert.equal(mesh.geometry.attributes.position.count,data.triangles*3);assert.equal(mesh.material.vertexColors,true);
    }
    assert.equal(['ShortBarrel','LongBarrel','RailBarrel'].filter(n=>root.getObjectByName(n).visible).length,1);
    assert.equal(['WoodGrip','ComfortGrip'].filter(n=>root.getObjectByName(n).visible).length,1);
    const length=weaponModelBounds(root).getSize(new Vector3()).z;
    assert.ok(barrel==='revolver_short_barrel'?(length>.23&&length<.27):(length>.32&&length<.35));
  }
  const {weapon,mount}=kit();mount('revolver_rail_barrel');mount('reflex_sight');mount('revolver_flashlight');
  const root=library.create(weapon),optic=weaponModelBounds(root.getObjectByName('Reflex')),lamp=weaponModelBounds(root.getObjectByName('Flashlight'));
  assert.ok(optic.max.z<lamp.min.z,'optic and lamp do not overlap along the rail');near(optic.min.y,lamp.min.y,1e-6);
  weapon.mods.barrel=createItem('revolver_short_barrel');const bare=library.create(weapon);
  assert.equal(bare.getObjectByName('Reflex').visible,false);assert.equal(bare.getObjectByName('Flashlight').visible,false);
});

test('both real rigs support the handgun at its grips with intact legs, six module combinations and visible magnum muzzle rise',async()=>{
  const library=new QuaterniusAssets({loadAsset:parse}),models=new PlayerModels({},library);
  models.weapons.loadAsset=parse;await Promise.all([models.ready,models.weapons.request('revolver_44')]);
  for(const sex of ['male','female'])for(const barrel of ['revolver_short_barrel','revolver_long_barrel','revolver_rail_barrel'])for(const grip of ['revolver_wood_grip','revolver_comfort_grip']){
    const player=createPlayer({appearance:{sex}});player.equipment.back=null;
    const weapon=createItem('revolver_44',1,{mods:{barrel:createItem(barrel),grip:createItem(grip)}});addItem(player,weapon);equipItem(player,weapon.id);
    const appearance=playerModelAppearance(player);await Promise.all(['head','torso','legs','feet'].map(s=>library.request(appearance[s])));
    const entity=models.entity(player,appearance);models.equip(entity,player);const pos=n=>entity.model.getObjectByName(n).getWorldPosition(new Vector3());
    for(const clip of ['Idle_Gun','Walk','Run','Crouch_Walk'])for(const posture of ['carry','hip','aim']){
      player.moving=clip!=='Idle_Gun';player.running=clip==='Run';models.pose(entity,{clip,progress:.4,delta:1,yaw:.7});
      const legs=['UpperLegL','LowerLegL','UpperLegR','LowerLegR'].map(pos),lengths=['L','R'].flatMap(s=>[pos('UpperArm'+s).distanceTo(pos('LowerArm'+s)),pos('LowerArm'+s).distanceTo(pos('Wrist'+s))]);
      applyRiflePose(entity,player,1,posture);
      const leftDistance=pos('WristL').distanceTo(entity.weapon.localToWorld(new Vector3().fromArray(entity.weapon.userData.grips.left)));
      const palm=entity.weapon.worldToLocal(pos('Middle2L'));
      assert.ok(posture==='carry'?leftDistance>.10:(Math.abs(palm.x)<.035&&palm.y>-.06&&palm.y<.02&&palm.z>-.01&&palm.z<.06),'free support hand while carrying; palm wraps the firing hand when aiming');
      ['UpperLegL','LowerLegL','UpperLegR','LowerLegR'].map(pos).forEach((p,i)=>assert.ok(p.distanceTo(legs[i])<1e-7));
      ['L','R'].flatMap(s=>[pos('UpperArm'+s).distanceTo(pos('LowerArm'+s)),pos('LowerArm'+s).distanceTo(pos('Wrist'+s))]).forEach((l,i)=>near(l,lengths[i],1e-5));
      const index=entity.weapon.worldToLocal(pos('Index3R'));assert.ok(index.z>.025&&index.z<.055&&index.y>-.01&&index.y<.04,`${sex} ${barrel} ${grip} ${clip} ${posture}: index finger reaches the trigger ${index.toArray()}`);
    }
    player.moving=false;player.running=false;models.pose(entity,{clip:'Idle_Gun',progress:.4,delta:1,yaw:0});
    player.combat.recoil=0;delete player.combat.shotImpulse;applyRiflePose(entity,player,1,'aim');const before=new Vector3(0,0,1).applyQuaternion(entity.weapon.getWorldQuaternion(new Quaternion()));
    player.combat.recoil=1;kickWeapon(player,weapon);applyRiflePose(entity,player,1,'aim');const after=new Vector3(0,0,1).applyQuaternion(entity.weapon.getWorldQuaternion(new Quaternion()));assert.ok(after.y-before.y>.15);
  }
});

test('six powerful shots empty the cylinder, recoil slows follow-ups, .44 reload restores six and silencers stay incompatible',()=>{
  const {player,weapon}=kit(),combat=new CombatSystem(),sounds=[],noises=[];weapon.rounds=6;
  const target={id:'target',x:player.x+2,y:player.y,hp:10000,removed:false,state:'chase'};
  Object.assign(player.combat,{enabled:true,targetId:target.id,aim:1});
  let randomCalls=0;
  const game={player,combat,zombies:[target],paused:false,elapsed:0,world:{hasLineOfSight:()=>true,emitNoise:(...x)=>noises.push(x),blood:[]},
    renderer:{trace(){},burst(){}},random:()=>[0,.99,.5][randomCalls++%3],sound:s=>sounds.push(s),attractMigration(){},killZombie(){},
    ui:{showMessage(){},showToast(){},hasBlockingPanel:()=>false},clearNavigation(){},approachCombatTarget(){}};
  for(let i=0;i<6;i++){
    randomCalls=0;
    player.combat.attackCooldown=0;player.combat.aim=1;player.combat.recoil=0;
    const hp=target.hp;assert.equal(combat.beginFiring(game).ok,true);near(hp-target.hp,92);
    assert.equal(player.combat.triggerHeld,false);assert.equal(player.combat.attackCooldown,.9);assert.equal(player.combat.recoil,1);near(player.combat.aim,.12);
    assert.equal(combat.beginFiring(game).ok,false);
  }
  player.combat.attackCooldown=0;assert.equal(combat.beginFiring(game).ok,false);assert.equal(player.shots,6);assert.equal(weapon.rounds,0);
  assert.equal(sounds.filter(s=>s==='magnum').length,6);assert.equal(noises.filter(n=>n[3]==='gunshot').length,6);
  addItem(player,createItem('ammo_9mm',6));assert.equal(combat.reload(game,weapon).ok,false);
  addItem(player,createItem('ammo_44',12));assert.equal(combat.reload(game,weapon).ok,true);assert.equal(weapon.rounds,0);
  const duration=player.combat.reload.duration;assert.ok(duration>6);near(player.combat.attackCooldown,duration);
  combat.update(game,duration+.001);assert.equal(weapon.rounds,6);assert.equal(player.combat.reload,undefined);
});

test('the switchable weapon light follows facing, stops at walls, saves its state and never illuminates from a backpack weapon',()=>{
  const {player,weapon,mount}=kit();mount('revolver_rail_barrel');mount('revolver_flashlight');assert.ok(weaponLight(weapon));
  Object.assign(player,{x:10,y:10,facingX:1,facingY:0});const light=weaponLight(weapon);
  const wall={hasLineOfSight:(_a,b)=>b.x<=12};const points=weaponLightCone(wall,player,light);
  assert.ok(points.every(p=>p.x<=12&&p.x>11.98));const clear=weaponLightCone({hasLineOfSight:()=>true},player,light);
  near(clear[12].x,14.5);near(clear[12].y,10);
  assert.equal(toggleWeaponLight(weapon).ok,true);assert.equal(weaponLight(weapon),null);toggleWeaponLight(weapon);
  player.equipment.mainHand=null;
  const renderer={ctx:{save(){throw Error('backpack light must not render');}}};drawWeaponLight(renderer,{player,world:wall},0);
  player.equipment.mainHand=weapon.id;
  const game={player,world:new World(),combat:new CombatSystem(),navigator:new Navigator(),stealth:new StealthSystem(),playerVisibility:new PlayerVisibility(),renderer:{},zombies:[]};
  const saved=serialize(game);game.saveStore={read:()=>JSON.parse(JSON.stringify(saved))};assert.equal(load(game),true);
  assert.equal(activeWeapon(game.player).lightOn,true);assert.ok(weaponLight(activeWeapon(game.player)));
});
