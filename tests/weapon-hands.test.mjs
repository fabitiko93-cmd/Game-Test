import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {Quaternion,Triangle,Vector3} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createPlayer} from '../docs/src/character.js';
import {activeWeapon,addItem,createItem,equipItem} from '../docs/src/inventory.js';
import {QuaterniusAssets} from '../docs/src/quaternius-assets.js';
import {PlayerModels} from '../docs/src/player-models.js';
import {playerModelAppearance} from '../docs/src/quaternius-catalog.js';
import {applyRiflePose} from '../docs/src/rifle-pose.js';
import {applyReloadPose,resetWeaponParts} from '../docs/src/weapon-reload-pose.js';
import {beginReload,cancelReload,reloadPhase,updateReload} from '../docs/src/weapon-reload.js';
import {kickWeapon} from '../docs/src/weapon-recoil.js';
const cache=new Map();async function parse(url){const n=new URL(url).pathname.split('/').at(-1);if(!cache.has(n))cache.set(n,(async()=>{const b=gunzipSync(await readFile(new URL(`../docs/assets/${/^(ak|m4|vector|revolver)-/.test(n)?'weapons':'quaternius'}/${n}`,import.meta.url)));return new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');})());return cache.get(n);}
const library=new QuaterniusAssets({loadAsset:parse}),models=new PlayerModels({},library);models.weapons.loadAsset=parse;
async function fixture(type,sex='male',mods={}){await models.ready;await models.weapons.request(type);const player=createPlayer({appearance:{sex}});player.baseCapacity=100;player.inventory=[];player.equipment.mainHand=null;player.equipment.back=null;player.facingY=1;
 const weapon=createItem(type);Object.assign(weapon.mods,Object.fromEntries(Object.entries(mods).map(([s,t])=>[s,createItem(t)])));const mag={ak_762:'mag_ak_30',m4_556:'mag_m4_30',vector_9mm:'mag_vector_33'}[type];if(mag){weapon.magazine=createItem(mag,1,{rounds:2});addItem(player,createItem(mag,1,{rounds:30}));}else addItem(player,createItem('ammo_44',12));addItem(player,weapon);equipItem(player,weapon.id);
 const a=playerModelAppearance(player);await Promise.all(['head','torso','legs','feet'].map(s=>library.request(a[s])));const entity=models.entity(player,a);models.equip(entity,player);const game={player,world:{emitNoise(){}},sound(){},save(){},ui:{showToast(){},refreshAll(){}}};return{player,weapon:activeWeapon(player),entity,game};}
const pos=(f,n)=>f.entity.model.getObjectByName(n).getWorldPosition(new Vector3());
function pose(f,posture='carry',clip='Idle_Gun',progress=.3,delta=1){models.pose(f.entity,{clip,progress,delta,yaw:0});resetWeaponParts(f.entity.weapon);applyRiflePose(f.entity,f.player,delta,posture);applyReloadPose(f.entity,f.player,delta);}
function bends(f){return ['L','R'].map(s=>pos(f,'Wrist'+s).sub(pos(f,'LowerArm'+s)).angleTo(pos(f,'Middle2'+s).sub(pos(f,'Wrist'+s)))*180/Math.PI);}
function surface(part,point){let result=Infinity;part.updateWorldMatrix(true,true);part.traverseVisible(mesh=>{if(!mesh.isMesh)return;const g=mesh.geometry,n=g.index?g.index.count:g.attributes.position.count;for(let i=0;i<n;i+=3){const p=[0,1,2].map(k=>mesh.getVertexPosition(g.index?g.index.getX(i+k):i+k,new Vector3()).applyMatrix4(mesh.matrixWorld));result=Math.min(result,new Triangle(...p).closestPointToPoint(point,new Vector3()).distanceTo(point));}});return result;}

test('both hands stay anatomical across all modular guns, locomotion phases and actual shots; vertical grip fingers wrap the real part',async()=>{
 const variants=[['ak_762',{}],['ak_762',{stock:'ak_fixed_stock'}],['ak_762',{stock:'ak_frame_stock'}],['m4_556',{}],['m4_556',{barrel:'m4_rail_barrel',stock:'ak_frame_stock'}],['vector_9mm',{}],['vector_9mm',{foregrip:'vector_foregrip',stock:'vector_stock'}],['revolver_44',{}],['revolver_44',{barrel:'revolver_long_barrel',grip:'revolver_comfort_grip'}],['revolver_44',{barrel:'revolver_rail_barrel',grip:'revolver_comfort_grip'}]];
 for(const sex of ['male','female'])for(const[type,mods]of variants){const f=await fixture(type,sex,mods);
  for(const[clip,posture]of [['Idle_Gun','carry'],['Walk','hip'],['Run','carry'],['Idle_Gun_Pointing','aim'],['Crouch_Idle','aim'],['Crouch_Walk','hip']])for(let i=0;i<12;i++){f.player.moving=['Walk','Run','Crouch_Walk'].includes(clip);f.player.running=clip==='Run';pose(f,posture,clip,i/12);const[bL,bR]=bends(f);assert.ok(bR<78,`${sex} ${type} ${clip}: right ${bR}`);if(!(type==='revolver_44'&&posture==='carry'))assert.ok(bL<68,`${sex} ${type} ${clip}: left ${bL}`);}
  if(mods.foregrip){pose(f,'aim');const local=n=>f.entity.weapon.worldToLocal(pos(f,n));assert.ok(local('Index2L').y>local('Pinky2L').y,'vertical hand is upright');for(const n of ['Index4L','Middle4L','Thumb3L'])assert.ok(surface(f.entity.weapon.getObjectByName('Foregrip'),pos(f,n))<.035,`${sex} ${n} grips the actual foregrip surface`);}
  f.player.moving=false;f.player.running=false;pose(f,'aim');const rest=pos(f,'Index4R');kickWeapon(f.player,f.weapon);pose(f,'aim');assert.ok(pos(f,'Index4R').distanceTo(rest)>.005);assert.ok(bends(f)[1]<78);
 }
});

test('magazines remain in the reached palm while detached; the seated magazine and ammo event agree on both rigs',async()=>{
 for(const sex of ['male','female'])for(const type of ['ak_762','m4_556','vector_9mm'])for(const clip of ['Idle_Gun','Crouch_Walk']){const f=await fixture(type,sex);assert.ok(beginReload(f.game).ok);const s=f.player.combat.reload;
  for(const p of [.23,.30,.38,.54,.59,.64]){s.elapsed=s.duration*p;pose(f,'carry',clip,.4);const mag=f.entity.weapon.getObjectByName('Magazine');assert.ok(mag.visible);assert.ok(surface(mag,pos(f,'Middle2L'))<.030,`${sex} ${type} ${p}: palm touches carried magazine`);assert.ok(Math.min(surface(mag,pos(f,'Index4L')),surface(mag,pos(f,'Middle4L')))<.030,'fingers wrap magazine');assert.ok(surface(mag,pos(f,'Thumb3L'))<.040,'thumb opposes fingers');const b=bends(f);assert.ok(b[0]<68&&b[1]<78);}
  s.elapsed=0;updateReload(f.game,s.commitTime+.001);pose(f,'carry',clip,.4);const mag=f.entity.weapon.getObjectByName('Magazine');assert.ok(mag.position.length()<1e-7);assert.ok(mag.quaternion.angleTo(new Quaternion())<1e-7);assert.equal(f.weapon.magazine.rounds,30);
 }
});

test('revolver cartridges are pinched between thumb and index, reach the open chamber and transfer one at a time',async()=>{
 for(const sex of ['male','female'])for(const clip of ['Idle_Gun','Crouch_Idle']){const f=await fixture('revolver_44',sex);beginReload(f.game);const s=f.player.combat.reload;
  for(const p of [.35,.50,.64,.69]){s.elapsed=s.start+s.loop*p;pose(f,'carry',clip,.4);const a=pos(f,'Index4L'),b=pos(f,'Thumb3L');assert.ok(a.distanceTo(b)<.018,'thumb and index pinch a single round');const round=f.entity.weapon.userData.carriedRound;assert.ok(round.visible);const cylinder=f.entity.weapon.getObjectByName('Cylinder'),axis=new Vector3(0,0,1).applyQuaternion(cylinder.getWorldQuaternion(new Quaternion()));const expected=a.clone().lerp(b,.5).addScaledVector(axis,.012);assert.ok(round.getWorldPosition(new Vector3()).distanceTo(expected)<1e-6,'visible cartridge stays in the fingers');assert.ok(bends(f)[0]<68);if(p===.69){const pinch=cylinder.worldToLocal(a.lerp(b,.5));cylinder.geometry.computeBoundingBox();const center=cylinder.geometry.boundingBox.getCenter(new Vector3());assert.ok(Math.hypot(pinch.x-center.x,pinch.y-center.y)<.026,'round reaches an actual chamber');assert.ok(Math.abs(pinch.z-cylinder.geometry.boundingBox.min.z)<.020,'round reaches rear face');}}
  s.elapsed=0;updateReload(f.game,s.start+s.loop*.699);assert.equal(f.weapon.rounds,0);updateReload(f.game,s.loop*.002);assert.equal(f.weapon.rounds,1);pose(f,'carry',clip,.4);assert.equal(f.entity.weapon.userData.carriedRound.visible,false);
 }
});

test('reload entry, loop seams, return and interruption retain continuous hands, intact legs and a reset weapon',async()=>{
 for(const sex of ['male','female'])for(const type of ['ak_762','m4_556','vector_9mm','revolver_44']){const f=await fixture(type,sex);pose(f);beginReload(f.game);const s=f.player.combat.reload;let previous=[pos(f,'WristL'),pos(f,'WristR')];
  for(let i=0;i<=Math.floor(s.duration*60);i++){s.elapsed=i/60;s.loaded=s.kind==='cylinder'?Math.max(0,Math.min(s.planned,Math.floor((s.elapsed-s.start)/s.loop+.3))):0;pose(f,'carry','Idle_Gun',.3,1/60);const next=[pos(f,'WristL'),pos(f,'WristR')];next.forEach((p,k)=>assert.ok(p.distanceTo(previous[k])<.065,`${sex} ${type} t=${s.elapsed}: wrist ${k} moved ${p.distanceTo(previous[k])}`));previous=next;}
  s.elapsed=s.duration*.3;pose(f);previous=[pos(f,'WristL'),pos(f,'WristR')];cancelReload(f.game);
  for(let i=0;i<30;i++){pose(f,'carry','Idle_Gun',.3,1/60);const next=[pos(f,'WristL'),pos(f,'WristR')];next.forEach((p,k)=>assert.ok(p.distanceTo(previous[k])<.065,'interruption returns continuously'));previous=next;}
  assert.equal(f.entity.reloadLast,null);for(const[name,base]of f.entity.weapon.userData.partPose){const part=f.entity.weapon.getObjectByName(name);assert.ok(part.position.distanceTo(base.position)<1e-7);assert.ok(part.quaternion.angleTo(base.rotation)<1e-7);}
 }
});

test('capturing a hip-fired muzzle does not raise the weapon or change its stance blend',async()=>{
 for(const sex of ['male','female'])for(const type of ['ak_762','m4_556','vector_9mm','revolver_44']){const f=await fixture(type,sex);Object.assign(f.player,{moving:true,running:false});f.player.combat.enabled=true;models.prepare(f.player,0);
  for(let i=1;i<=30;i++){f.player.x+=.012;models.prepare(f.player,i/60);}const before=f.entity.weapon.getWorldPosition(new Vector3()),q=f.entity.weapon.getWorldQuaternion(new Quaternion()),blend={...f.entity.rifleBlend};models.shotMuzzle(f.player,.5);assert.deepEqual(f.entity.rifleBlend,blend);assert.ok(f.entity.weapon.getWorldPosition(new Vector3()).distanceTo(before)<1e-6);assert.ok(f.entity.weapon.getWorldQuaternion(new Quaternion()).angleTo(q)<1e-6);
 }
});
