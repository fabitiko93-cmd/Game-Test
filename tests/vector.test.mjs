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
import {addItem,activeWeapon,createItem,equipItem,fillMagazine,insertMagazine,installMod,findItem,removeMod,weaponStats} from '../docs/src/inventory.js';
import {AK_MODEL,VECTOR_MODEL,WeaponModels,WeaponInspection,weaponModelBounds} from '../docs/src/weapon-models.js';
import {PlayerModels} from '../docs/src/player-models.js';
import {PlayerMotion} from '../docs/src/player-motion.js';
import {QuaterniusAssets} from '../docs/src/quaternius-assets.js';
import {playerModelAppearance} from '../docs/src/quaternius-catalog.js';
import {applyRiflePose} from '../docs/src/rifle-pose.js';
import {ModelPass} from '../docs/src/model-pass.js';
import {serialize,load} from '../docs/src/game-state.js';
import {CombatSystem} from '../docs/src/combat.js';
import {Navigator} from '../docs/src/navigation.js';
import {PlayerVisibility} from '../docs/src/player-visibility.js';
import {StealthSystem} from '../docs/src/stealth.js';

const cache=new Map();
async function parse(url){
  const name=new URL(url).pathname.split('/').at(-1),folder=/^(ak|vector)-/.test(name)?'weapons':'quaternius';
  if(!cache.has(name))cache.set(name,(async()=>{
    const bytes=gunzipSync(await readFile(new URL(`../docs/assets/${folder}/${name}`,import.meta.url)));
    return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  })());
  return cache.get(name);
}
const fullMods=()=>({stock:createItem('vector_stock'),optic:createItem('reflex_sight'),foregrip:createItem('vector_foregrip'),muzzle:createItem('vector_suppressor')});

test('the starting crate has the Vector, all four visible mods, dedicated magazines and shared 9-mm ammunition',()=>{
  const crate=new World().objects.find(o=>o.type==='weaponcrate');
  for(const type of ['vector_9mm','vector_stock','reflex_sight','vector_foregrip','vector_suppressor','mag_vector_33','ammo_9mm'])assert.ok(crate.items.some(i=>i.type===type),type);
  assert.ok(crate.items.some(i=>i.type==='mag_vector_33'&&i.rounds===33));
  assert.ok(crate.items.some(i=>i.type==='mag_vector_33'&&i.rounds===0));
  const player=createPlayer();player.baseCapacity=30;
  const weapon=createItem('vector_9mm'),magazine=createItem('mag_vector_33');
  for(const item of [weapon,magazine,createItem('ammo_9mm',30),createItem('ammo_9mm',3),createItem('mag_9mm_18',1,{rounds:18}),...Object.values(fullMods())])assert.ok(addItem(player,item));
  const live=findItem(player,weapon.id),base=weaponStats(live);
  assert.equal(fillMagazine(player,magazine.id).ok,true);assert.equal(findItem(player,magazine.id).rounds,33);
  assert.equal(insertMagazine(player,weapon.id,magazine.id).ok,true);
  const wrong=player.inventory.find(i=>i.type==='mag_9mm_18');
  assert.equal(insertMagazine(player,weapon.id,wrong.id).ok,false);
  for(const type of ['vector_stock','reflex_sight','vector_foregrip','vector_suppressor'])assert.equal(installMod(player,weapon.id,player.inventory.find(i=>i.type===type).id).ok,true);
  const stats=weaponStats(live);assert.ok(stats.recoilPerShot<base.recoilPerShot);assert.ok(stats.noise<base.noise);
  assert.equal(stats.damage,base.damage);assert.equal(stats.penetration,base.penetration);
  assert.equal(removeMod(player,weapon.id,'foregrip').ok,true);assert.ok(player.inventory.some(i=>i.type==='vector_foregrip'));
});

test('the real licensed Vector preserves its triangles and colours in independent metric modules; AK and Vector cache separately',async()=>{
  const bytes=await readFile(new URL(`../docs/assets/weapons/${VECTOR_MODEL.file}`,import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),VECTOR_MODEL.sha256);
  assert.equal(VECTOR_MODEL.license,'CC BY 4.0');assert.equal(VECTOR_MODEL.author,'TastyTony');
  const library=new WeaponModels({loadAsset:parse});await Promise.all([library.request(),library.request('vector_9mm')]);
  const weapon=createItem('vector_9mm'),bare=library.create(weapon);
  let triangles=0;
  for(const [name,metadata] of Object.entries(VECTOR_MODEL.parts)){
    const part=bare.getObjectByName(name);assert.ok(part,name);
    assert.equal(part.visible,['Receiver','Barrel'].includes(name),name);
    assert.equal(part.geometry.attributes.position.count,metadata.triangles*3,name);
    assert.equal(part.geometry.attributes.color.count,part.geometry.attributes.position.count);
    assert.equal(part.material.vertexColors,true);triangles+=metadata.triangles;
  }
  assert.equal(triangles-VECTOR_MODEL.parts.Suppressor.triangles,VECTOR_MODEL.sourceTriangles);
  weapon.magazine=createItem('mag_vector_33');weapon.mods=fullMods();
  const complete=library.create(weapon),size=weaponModelBounds(complete).getSize(new Vector3());
  for(const name of Object.keys(VECTOR_MODEL.parts))assert.equal(complete.getObjectByName(name).visible,true,name);
  assert.ok(size.z>.7&&size.z<.9);assert.ok(size.y>.25&&size.y<.4);assert.ok(size.x<.1);
  delete weapon.mods.muzzle;
  const unsuppressed=library.create(weapon);assert.ok(Math.abs(weaponModelBounds(unsuppressed).getSize(new Vector3()).z-.62)<1e-5);
  assert.ok(complete.userData.grips.verticalSupport);
  delete weapon.mods.foregrip;
  assert.equal(library.create(weapon).userData.grips.verticalSupport,false);
  const ak=library.create(createItem('ak_762'));assert.equal(ak.name,'AK');assert.ok(ak.getObjectByName('Handguard'));assert.equal(ak.getObjectByName('Foregrip'),undefined);
  assert.equal(library.entry('ak_762').asset,await parse(new URL(`../docs/assets/weapons/${AK_MODEL.file}`,import.meta.url)));
});

test('the weapon bench switches models and uses the Vector foregrip and muzzle anchors',async()=>{
  const library=new WeaponModels({loadAsset:parse});await Promise.all([library.request(),library.request('vector_9mm')]);
  const canvas={width:0,height:0,getBoundingClientRect:()=>({width:600,height:300}),getContext:()=>({})};
  const pass={status:'ready',drawInspection:()=>p=>({x:p.z,y:p.y})},inspection=new WeaponInspection(pass,library);
  const ak=inspection.draw(canvas,createItem('ak_762'));assert.equal(ak.foregrip,undefined);
  const vector=inspection.draw(canvas,createItem('vector_9mm'));assert.ok(vector.foregrip);assert.notDeepEqual(vector.muzzle,ak.muzzle);assert.equal(inspection.model.name,'Vector');
});

test('both original character rigs hold the Vector at its actual grips with and without the vertical foregrip and stock',async()=>{
  const library=new QuaterniusAssets({loadAsset:parse}),models=new PlayerModels({},library);
  models.weapons.loadAsset=parse;await Promise.all([models.ready,models.weapons.request('vector_9mm')]);
  for(const sex of ['male','female'])for(const stock of [false,true])for(const grip of [false,true]){
    const player=createPlayer({appearance:{sex}});player.equipment.back=null;
    const mods={...(stock?{stock:createItem('vector_stock')}:{}) ,...(grip?{foregrip:createItem('vector_foregrip')}:{})};
    const item=createItem('vector_9mm',1,{mods});assert.ok(addItem(player,item));equipItem(player,item.id);
    const appearance=playerModelAppearance(player);await Promise.all(['head','torso','legs','feet'].map(s=>library.request(appearance[s])));
    const entity=models.entity(player,appearance);models.equip(entity,player);
    const position=name=>entity.model.getObjectByName(name).getWorldPosition(new Vector3());
    for(const clip of ['Idle_Gun','Walk','Run','Crouch_Walk'])for(const posture of ['carry','hip','aim'])for(const yaw of [0,Math.PI/2]){
      player.moving=clip!=='Idle_Gun';models.pose(entity,{clip,progress:.4,delta:1,yaw});
      const legs=['UpperLegL','LowerLegL','UpperLegR','LowerLegR'].map(position);
      const lengths=['L','R'].flatMap(s=>[position('UpperArm'+s).distanceTo(position('LowerArm'+s)),position('LowerArm'+s).distanceTo(position('Wrist'+s))]);
      applyRiflePose(entity,player,1,posture);
      const bend=position('WristL').sub(position('LowerArmL')).angleTo(position('Middle2L').sub(position('WristL')));
      assert.ok(bend<68*Math.PI/180,`${sex} ${clip} ${posture}: support wrist`);
      ['UpperLegL','LowerLegL','UpperLegR','LowerLegR'].map(position).forEach((p,i)=>assert.ok(p.distanceTo(legs[i])<1e-7));
      const actual=['L','R'].flatMap(s=>[position('UpperArm'+s).distanceTo(position('LowerArm'+s)),position('LowerArm'+s).distanceTo(position('Wrist'+s))]);
      actual.forEach((length,i)=>assert.ok(Math.abs(length-lengths[i])<1e-5));
      const palm=entity.weapon.worldToLocal(position('Middle2L'));
      assert.ok(Math.abs(palm.x)<.03&&palm.z>.2&&palm.z<.3,`${sex} ${grip}: support palm ${palm.toArray()}`);
      assert.ok(grip?(palm.y>-.05&&palm.y<.04):(palm.y>.01&&palm.y<.08),`${sex} ${grip}: palm height ${palm.y}`);
    }
  }
});

test('Vector shots keep the moving legs; a normal save preserves its mods, magazine, ammunition and fire mode',()=>{
  const world=new World(),player=createPlayer(),weapon=createItem('vector_9mm',1,{magazine:createItem('mag_vector_33',1,{rounds:17}),mods:fullMods(),fireMode:'auto'});
  player.baseCapacity=30;addItem(player,weapon);equipItem(player,weapon.id);player.moving=true;
  const motion=new PlayerMotion();motion.sample(player,0);player.x+=.08;motion.sample(player,.1);player.shots++;player.x+=.08;
  assert.equal(motion.sample(player,.2).clip,'Walk');
  const game={world,player,combat:new CombatSystem(),navigator:new Navigator(),stealth:new StealthSystem(),zombies:[],playerVisibility:new PlayerVisibility(),renderer:{},minutes:400,mission:0,survivorCount:1,migrationTimer:60};
  const saved=serialize(game);game.saveStore={read:()=>JSON.parse(JSON.stringify(saved))};assert.equal(load(game),true);
  assert.deepEqual(activeWeapon(game.player),findItem(player,weapon.id));assert.equal(activeWeapon(game.player).magazine.rounds,17);
});

test('the Vector auto cadence is stable at 30, 60 and 120 Hz and stops when its magazine is empty',()=>{
  for(const hz of [30,60,120]){
    const player=createPlayer(),item=createItem('vector_9mm',1,{loadedRounds:33,fireMode:'auto'}),combat=new CombatSystem();
    addItem(player,item);equipItem(player,item.id);const weapon=activeWeapon(player);
    const target={id:'target',x:player.x+3,y:player.y,hp:100000,removed:false,state:'chase'};
    Object.assign(player.combat,{enabled:true,targetId:target.id,aim:1});
    const game={player,combat,zombies:[target],elapsed:0,paused:false,world:{hasLineOfSight:()=>true,emitNoise(){},blood:[]},
      renderer:{trace(){},burst(){}},random:()=>.99,attractMigration(){},sound(){},ui:{hasBlockingPanel:()=>false,showToast(){},showMessage(){}},
      killZombie(){},clearNavigation(){},approachCombatTarget(){}};
    assert.equal(combat.beginFiring(game).ok,true);
    for(let i=0;i<hz;i++){game.elapsed+=1/hz;combat.update(game,1/hz);}
    assert.equal(player.shots,14,`${hz} Hz`);assert.equal(weapon.magazine.rounds,19);
    for(let i=0;i<hz*3;i++){game.elapsed+=1/hz;combat.update(game,1/hz);}
    assert.equal(weapon.magazine.rounds,0);assert.equal(player.shots,33);assert.equal(player.combat.triggerHeld,false);
  }
});

test('Canvas model fallback retains the original dark and tan vertex colours',async()=>{
  const library=new WeaponModels({loadAsset:parse});await library.request('vector_9mm');
  const pass=new ModelPass({createRenderer:()=>{throw Error('software test');}});pass.beginFrame(1);
  const fills=[],ctx={save(){},restore(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},fill(){fills.push(this.fillStyle);}};
  const model=library.create(createItem('vector_9mm'));pass.drawSoftware(ctx,model,{x:0,y:0},false);
  const colors=fills.map(value=>value.match(/\d+/g).map(Number));
  assert.ok(colors.some(([r,g,b])=>r>g+10&&g>b+5),'original tan receiver is not rendered white');
  assert.ok(colors.some(([r,g,b])=>Math.abs(r-g)<3&&Math.abs(g-b)<3&&r<90),'dark parts remain dark');
});
