import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {Box3,Quaternion,Triangle,Vector3} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {ITEMS} from '../docs/src/data.js';
import {createPlayer} from '../docs/src/character.js';
import {activeWeapon,addItem,createItem,equipItem} from '../docs/src/inventory.js';
import {QuaterniusAssets} from '../docs/src/quaternius-assets.js';
import {PlayerModels} from '../docs/src/player-models.js';
import {playerModelAppearance} from '../docs/src/quaternius-catalog.js';
import {applyRiflePose} from '../docs/src/rifle-pose.js';
import {axialAngle} from '../docs/src/weapon-ik.js';
import {applyReloadPose,resetWeaponParts} from '../docs/src/weapon-reload-pose.js';
import {beginReload,cancelReload,updateReload} from '../docs/src/weapon-reload.js';
import {kickWeapon} from '../docs/src/weapon-recoil.js';
import {G17_GRASP} from '../docs/src/g17-grasp.js';

const types=['pistol_9mm','usp_9mm','scorpion_45','desert_eagle_50'];
const cache=new Map();
async function parse(url){
  const name=new URL(url).pathname.split('/').at(-1),folder=/^(g17|usp|scorpion|deagle)-/.test(name)?'weapons':'quaternius';
  if(!cache.has(name))cache.set(name,(async()=>{const b=gunzipSync(await readFile(new URL(`../docs/assets/${folder}/${name}`,import.meta.url)));return new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');})());
  return cache.get(name);
}
const assets=new QuaterniusAssets({loadAsset:parse}),models=new PlayerModels({},assets);models.weapons.loadAsset=parse;
async function fixture(type,sex,mods=false){
  await models.ready;await models.weapons.request(type);
  const player=createPlayer({appearance:{sex}});player.inventory=[];player.baseCapacity=100;player.equipment.mainHand=null;player.equipment.back=null;player.facingX=0;player.facingY=1;
  const item=createItem(type);addItem(player,item);equipItem(player,item.id);const weapon=activeWeapon(player),mag=ITEMS[type].magazineTypes[0];
  weapon.magazine=createItem(mag,1,{rounds:7});addItem(player,createItem(mag,1,{rounds:7}));
  if(mods&&type!=='desert_eagle_50')weapon.mods={mount:createItem('pistol_optic_mount'),optic:createItem('reflex_sight'),utility:createItem('pistol_flashlight'),muzzle:createItem('sidearm_suppressor')};
  Object.assign(player.combat,{enabled:true,targetId:'target',aim:1});
  const a=playerModelAppearance(player);await Promise.all(['head','torso','legs','feet'].map(s=>assets.request(a[s])));
  const entity=models.entity(player,a);models.equip(entity,player);
  const game={player,world:{emitNoise(){}},sound(){},save(){},ui:{showToast(){},refreshAll(){}}};return{player,weapon,entity,game};
}
const vec=()=>new Vector3(),position=(f,n)=>f.entity.model.getObjectByName(n).getWorldPosition(vec());
const degrees=r=>r*180/Math.PI;
const local=(f,n)=>f.entity.root.worldToLocal(position(f,n));
function pose(f,posture='aim',clip='Idle_Gun_Pointing',progress=.3,delta=1,yaw=0){
  models.pose(f.entity,{clip,progress,delta,yaw});resetWeaponParts(f.entity.weapon);applyRiflePose(f.entity,f.player,delta,posture);applyReloadPose(f.entity,f.player,delta);
}
function bend(f,side){return degrees(position(f,'Wrist'+side).sub(position(f,'LowerArm'+side)).angleTo(position(f,'Middle2'+side).sub(position(f,'Wrist'+side))));}
function rolls(f,side){
  const e=f.entity,lower=e.model.getObjectByName('LowerArm'+side),wrist=e.model.getObjectByName('Wrist'+side),rig=e.rifleHands;
  const saved=lower.quaternion.clone(),actual=lower.getWorldQuaternion(new Quaternion()),hand=wrist.getWorldQuaternion(new Quaternion());
  const start=lower.getWorldPosition(vec()),axis=wrist.getWorldPosition(vec()).sub(start).normalize();
  lower.quaternion.copy(rig.get('LowerArm'+side).rotation);e.root.updateMatrixWorld(true);
  const from=wrist.getWorldPosition(vec()).sub(start).normalize(),neutral=new Quaternion().setFromUnitVectors(from,axis).multiply(lower.getWorldQuaternion(new Quaternion()));
  lower.quaternion.copy(saved);e.root.updateMatrixWorld(true);
  return[axialAngle(actual.clone().multiply(neutral.invert()),axis),axialAngle(hand.multiply(actual.multiply(rig.get('Wrist'+side).rotation).invert()),axis)].map(a=>Math.abs(degrees(a)));
}
function surface(part,p){
  let distance=Infinity;const g=part.geometry,ps=g.attributes.position,idx=g.index;
  for(let i=0;i<(idx?idx.count:ps.count);i+=3){const tri=[0,1,2].map(k=>part.getVertexPosition(idx?idx.getX(i+k):i+k,vec()).applyMatrix4(part.matrixWorld));distance=Math.min(distance,new Triangle(...tri).closestPointToPoint(p,vec()).distanceTo(p));}
  return distance;
}
function eye(f){
  const points=[],head=f.entity.model.getObjectByName('Head');
  f.entity.clothing.head.traverseVisible(m=>{if(!m.isMesh||!['Eye','Brown'].includes(m.material?.name))return;
    for(let i=0;i<m.geometry.attributes.position.count;i++){const p=m.getVertexPosition(i,vec()).applyMatrix4(m.matrixWorld);if(head.worldToLocal(p.clone()).x<-.01)points.push(p);}
  });
  assert.ok(points.length,'original eye geometry is present');return new Box3().setFromPoints(points).getCenter(vec());
}
function bodyLengths(f){return['R','L'].flatMap(s=>[position(f,'UpperArm'+s).distanceTo(position(f,'LowerArm'+s)),position(f,'LowerArm'+s).distanceTo(position(f,'Wrist'+s))]);}
const legNames=['UpperLegL','LowerLegL','FootL','UpperLegR','LowerLegR','FootR'];

test('both real rigs keep an extended pistol arm, aligned eye/sights, intact legs and limited forearm/wrist twist through locomotion',async()=>{
  for(const sex of ['male','female'])for(const type of types)for(const mods of type==='desert_eagle_50'?[false]:[false,true]){
    const f=await fixture(type,sex,mods);
    for(const yaw of [0,Math.PI/2,Math.PI,-Math.PI/2])for(const clip of ['Idle_Gun_Pointing','Walk','Crouch_Idle','Crouch_Walk'])for(const progress of [0,.25,.5,.75]){
      const tag=`${sex} ${type} ${mods} ${clip} ${progress} ${yaw}`;
      Object.assign(f.player,{moving:['Walk','Crouch_Walk'].includes(clip),running:false,stance:clip.startsWith('Crouch')?'sneak':'walk'});
      models.pose(f.entity,{clip,progress,delta:1,yaw});const lengths=bodyLengths(f),legs=legNames.map(n=>position(f,n));
      resetWeaponParts(f.entity.weapon);applyRiflePose(f.entity,f.player,1,'aim');
      bodyLengths(f).forEach((length,i)=>assert.ok(Math.abs(length-lengths[i])<1e-6,tag+' arm length'));
      legNames.forEach((n,i)=>assert.ok(position(f,n).distanceTo(legs[i])<1e-7,tag+' original legs'));
      const shoulder=position(f,'UpperArmR'),elbow=position(f,'LowerArmR'),wrist=position(f,'WristR');
      const flex=degrees(elbow.sub(shoulder).angleTo(wrist.sub(position(f,'LowerArmR'))));assert.ok(flex>10&&flex<32,tag+` elbow ${flex}`);
      assert.ok(bend(f,'R')<(type==='pistol_9mm'?24.1:23)&&bend(f,'L')<29,tag+' wrist bend');
      for(const side of ['R','L']){const[fore,hand]=rolls(f,side);assert.ok(fore<60.05&&hand<33,tag+` ${side} twist ${fore}/${hand}`);}
      const gun=f.entity.weapon,optic=gun.getObjectByName('Reflex'),a=gun.userData.anchors.optic;
      const sight=gun.localToWorld(new Vector3(0,a[1]+(optic?.visible?.008:-.014),a[2]));
      const forward=new Vector3(0,0,1).applyQuaternion(gun.getWorldQuaternion(new Quaternion())),line=sight.clone().sub(eye(f));
      // This raw solver retains the oblique review-10 authoring frame. The
      // shared controller then aligns the complete pose with gameplay aim;
      // g17-approved.test.mjs checks that final barrel and live shot socket.
      if(type==='pistol_9mm')assert.ok(Math.abs(Math.atan2(Math.sin(Math.atan2(forward.x,forward.z)-yaw-G17_GRASP.weaponYaw),Math.cos(Math.atan2(forward.x,forward.z)-yaw-G17_GRASP.weaponYaw)))<.001,tag+' approved body/weapon yaw');
      else assert.ok(line.clone().addScaledVector(forward,-line.dot(forward)).length()<.004,tag+' eye on actual sight line');
      assert.ok(line.dot(forward)>.20&&Math.abs(forward.y)<.001,tag+' raised and level barrel');
    }
  }
});

test('pistols have the same physical size on both characters and the original grips sit between their curled fingers',async()=>{
  const lengths=new Map();
  for(const sex of ['male','female'])for(const type of types){
    const f=await fixture(type,sex);pose(f);const gun=f.entity.weapon,forward=new Vector3(0,0,1).applyQuaternion(gun.getWorldQuaternion(new Quaternion())),extent=[];
    for(const name of ['Receiver','Slide','Barrel']){const m=gun.getObjectByName(name);if(!m)continue;for(let i=0;i<m.geometry.attributes.position.count;i++)extent.push(m.getVertexPosition(i,vec()).applyMatrix4(m.matrixWorld).dot(forward));}
    const length=Math.max(...extent)-Math.min(...extent);assert.ok(length>.23&&length<.33,`${sex} ${type}: physical length ${length}`);
    if(lengths.has(type))assert.ok(Math.abs(length-lengths.get(type))<1e-6,'character height cannot shrink the gun');else lengths.set(type,length);
    const receiver=gun.getObjectByName('Receiver');
    if(type==='pistol_9mm'){
      // A knuckle marker is not a skin contact. The approved surface is tested
      // against the actual review-10 vertices instead of the superseded curls.
      for(const side of ['R','L'])assert.ok(position(f,'Middle2'+side).distanceTo(gun.localToWorld(new Vector3(...gun.userData.pistol[side==='R'?'rightPalm':'leftPalm'])))<1e-6,sex+' calibrated G17 palm');
    }else for(const name of ['Middle4R','Ring4R','Pinky4R','Thumb3R','Middle4L','Thumb3L'])assert.ok(surface(receiver,position(f,name))<.030,`${sex} ${type} ${name} stays at the original grip`);
    const r=gun.worldToLocal(position(f,'Middle2R')),l=gun.worldToLocal(position(f,'Middle2L'));
    assert.ok(r.x<-.02&&l.x>.02,'palms support opposite sides');
  }
  assert.ok(lengths.get('desert_eagle_50')>lengths.get('pistol_9mm')*1.25,'Desert Eagle retains its larger silhouette');
});

test('carry, aim, crouch and sprint transitions retain continuous joints at 30 and 60 Hz',async()=>{
  const names=['UpperArmR','LowerArmR','WristR','UpperArmL','LowerArmL','WristL'];
  for(const sex of ['male','female'])for(const type of types)for(const hz of [30,60]){
    const f=await fixture(type,sex);Object.assign(f.player.combat,{enabled:false,targetId:null,aim:0});let time=0,previous=null;models.prepare(f.player,time);
    for(const[stance,moving,running,aim]of [['walk',false,false,false],['walk',true,false,false],['walk',false,false,true],['sneak',false,false,false],['sneak',false,false,true],['sneak',true,false,false],['walk',true,true,false],['walk',false,false,false]]){
      Object.assign(f.player,{stance,moving,running});Object.assign(f.player.combat,{enabled:aim,targetId:aim?'target':null,aim:aim?1:0});
      for(let i=0;i<Math.ceil(hz*.8);i++){
        time+=1/hz;if(moving)f.player.y+=.6/hz;models.prepare(f.player,time);
        const tag=`${sex} ${type} ${hz} ${stance}/${moving}/${running}/${aim} ${i}`;
        // The original crouch clip moves the whole body vertically. Measure
        // arm continuity relative to its shoulder, independently of that lift.
        const qs=names.map(n=>f.entity.model.getObjectByName(n).quaternion.clone().normalize()),ps=['R','L'].map(s=>local(f,'Wrist'+s).sub(local(f,'UpperArm'+s)));
        // Bound actual hand travel and skin twist independently of the local
        // rotations needed by a world-space IK chain near full extension.
        if(previous){qs.forEach((q,j)=>assert.ok(q.angleTo(previous.qs[j])<16/hz+1e-5,tag+` joint ${j} jumped`));ps.forEach((p,j)=>assert.ok(p.distanceTo(previous.ps[j])<3/hz,tag+` hand ${j} jumped ${p.distanceTo(previous.ps[j])}`));}
        for(const side of ['R','L']){
          assert.ok(bend(f,side)<34.1,tag+' wrist bend');
          const[fore,hand]=rolls(f,side);assert.ok(fore<60.05&&hand<25,tag+` ${side} axial twist ${fore}/${hand}`);
        }
        previous={qs,ps};
      }
    }
  }
});

const postures={idle:['walk',false,false,false],aim:['walk',false,false,true],walk:['walk',true,false,false],crouchIdle:['sneak',false,false,false],crouchAim:['sneak',false,false,true],crouchWalk:['sneak',true,false,false],sprint:['walk',true,true,false]};
function setPosture(f,name){
  const[stance,moving,running,aim]=postures[name];Object.assign(f.player,{stance,moving,running});Object.assign(f.player.combat,{enabled:aim,targetId:aim?'target':null,aim:Number(aim)});
}
function motionCheck(f,tag){
  for(const side of ['R','L']){
    assert.ok(bend(f,side)<34.1,tag+` ${side} wrist bend`);
    const[fore,hand]=rolls(f,side);assert.ok(fore<60.05&&hand<25,tag+` ${side} skin twist ${fore}/${hand}`);
  }
  const elbow=local(f,'LowerArmL').sub(local(f,'UpperArmL'));
  assert.ok(elbow.y<.08,tag+' support elbow must not swing over the shoulder');
  return local(f,'Middle2L').sub(local(f,'UpperArmL'));
}

test('pistol hands join and leave the grip without an overhead loop, including interrupted aim on both rigs',async()=>{
  const pairs=[['crouchIdle','crouchWalk'],['crouchAim','crouchIdle'],['crouchWalk','sprint'],['walk','idle']];
  for(const sex of ['male','female'])for(const type of types)for(const hz of [30,60]){
    for(const[from,to]of pairs){
      const f=await fixture(type,sex);let time=0;setPosture(f,from);models.prepare(f.player,time);
      const tick=()=>{if(f.player.moving)f.player.y+=.6/hz;models.prepare(f.player,time+=1/hz);};
      for(let i=0;i<Math.ceil(hz*1.2);i++)tick();
      const points=[local(f,'Middle2L').sub(local(f,'UpperArmL'))];setPosture(f,to);
      for(let i=0;i<Math.ceil(hz*1.4);i++){tick();points.push(motionCheck(f,`${sex} ${type} ${hz} ${from}>${to} ${i}`));}
      const maxY=Math.max(points[0].y,points.at(-1).y)+.08;
      assert.ok(points.every(p=>p.y<=maxY),`${sex} ${type} ${hz} ${from}>${to}: hand goes over its endpoints`);
      if(to!=='sprint'){
        const distance=points[0].distanceTo(points.at(-1)),travel=points.slice(1).reduce((n,p,i)=>n+p.distanceTo(points[i]),0);
        assert.ok(travel<distance*1.8+.04,`${sex} ${type} ${hz} ${from}>${to}: circular hand path ${travel}/${distance}`);
      }
      if(to==='crouchWalk'){
        const gun=f.entity.weapon,target=gun.localToWorld(new Vector3().fromArray(gun.userData.pistol.leftPalm));
        assert.ok(position(f,'Middle2L').distanceTo(target)<.008,`${sex} ${type} ${hz} ${from}>${to}: support hand returns to the actual grip (${position(f,'Middle2L').distanceTo(target)} m)`);
        if(type==='pistol_9mm')for(const name of ['Thumb1L','Thumb2L','Thumb3L'])assert.ok(f.entity.model.getObjectByName(name).quaternion.clone().normalize().angleTo(new Quaternion(...G17_GRASP.rigs[sex].fingers[name]).normalize())<1e-5,'approved support thumb returns with the moving hand');
        else assert.ok(surface(gun.getObjectByName('Receiver'),position(f,'Thumb3L'))<.030,'support thumb returns to the grip with the moving hand');
        const optic=gun.getObjectByName('Reflex'),a=gun.userData.anchors.optic,sight=gun.localToWorld(new Vector3(0,a[1]+(optic?.visible?.008:-.014),a[2]));
        const forward=new Vector3(0,0,1).applyQuaternion(gun.getWorldQuaternion(new Quaternion())),line=sight.sub(eye(f));
        assert.ok(Math.abs(forward.y)<.02&&(type==='pistol_9mm'||line.addScaledVector(forward,-line.dot(forward)).length()<.012),'settled moving aim returns to its authored sight pose');
      }
      models.release(f.entity);models.entities.delete(f.player);models.prepared.delete(f.player);models.used.delete(f.player);
    }
    for(const mods of type==='desert_eagle_50'?[false]:[false,true]){
      const f=await fixture(type,sex,mods);let time=0;setPosture(f,'aim');models.prepare(f.player,time);
      const tick=()=>{if(f.player.moving)f.player.y+=.6/hz;models.prepare(f.player,time+=1/hz);};
      for(let i=0;i<hz;i++)tick();
      // This exact history formerly retained a nearly 360-degree wrist arc.
      for(const state of ['crouchIdle','walk','sprint','crouchWalk']){
        setPosture(f,state);for(let i=0;i<Math.ceil(hz*(state==='crouchWalk'?1.4:.4));i++){tick();motionCheck(f,`${sex} ${type} ${hz} interrupted ${state} ${i}`);}
      }
      models.release(f.entity);models.entities.delete(f.player);models.prepared.delete(f.player);models.used.delete(f.player);
    }
  }
});

test('pistol magazine changes and interruption keep anatomical hands and carry the real magazine on both rigs',async()=>{
  const names=['UpperArmR','LowerArmR','WristR','UpperArmL','LowerArmL','WristL'];
  for(const sex of ['male','female'])for(const type of types)for(const crouched of [false,true])for(const moving of [false,true])for(const cut of [1,.29,.55]){
    const f=await fixture(type,sex);f.weapon.magazine.rounds=0;f.player.stance=crouched?'sneak':'walk';f.player.moving=moving;let time=0;models.prepare(f.player,time);
    for(let i=0;i<45;i++){if(moving)f.player.y+=.6/60;models.prepare(f.player,time+=1/60);}
    assert.ok(beginReload(f.game).ok);const state=f.player.combat.reload;let previous=null;
    function check(){
      if(f.player.moving)f.player.y+=.6/60;models.prepare(f.player,time+=1/60);const tag=`${sex} ${type} ${crouched} ${moving} ${cut} ${state.elapsed}`;
      // A sprint abort also raises the original crouched body. Check the
      // hands relative to their shoulders, independently of that body lift.
      const qs=names.map(n=>f.entity.model.getObjectByName(n).quaternion.clone().normalize()),ps=['R','L'].map(side=>local(f,'Wrist'+side).sub(local(f,'UpperArm'+side)));
      if(previous){qs.forEach((q,j)=>assert.ok(q.angleTo(previous.qs[j])<Math.PI/3,tag+` joint ${j} flipped`));ps.forEach((p,j)=>assert.ok(p.distanceTo(previous.ps[j])<.09,tag+` hand ${j} detached`));}
      for(const side of ['R','L']){assert.ok(bend(f,side)<53,tag+' wrist bend');const[fore,hand]=rolls(f,side);assert.ok(fore<60.05&&hand<34,tag+` ${side} twist ${fore}/${hand}`);}
      const mag=f.entity.weapon.getObjectByName(f.entity.weapon.userData.magazinePart),p=state.elapsed/state.duration;
      if(f.player.combat.reload&&p>.23&&p<.60&&mag.visible)assert.ok(surface(mag,position(f,'Middle2L'))<.025,tag+' palm carries magazine');
      previous={qs,ps};
    }
    while(f.player.combat.reload&&state.elapsed<state.duration*cut){updateReload(f.game,Math.min(1/60,state.duration*cut-state.elapsed+.000001));check();}
    if(cut<1){cancelReload(f.game);if(moving)Object.assign(f.player,{stance:'walk',moving:true,running:true});}
    for(let i=0;i<45;i++)check();
    assert.equal(f.entity.reloadLast,null,'reload/abort returns to the held pose');
    for(const[name,base]of f.entity.weapon.userData.partPose){const part=f.entity.weapon.getObjectByName(name);assert.ok(part.position.distanceTo(base.position)<1e-7);assert.ok(part.quaternion.angleTo(base.rotation)<1e-7);}
  }
});

test('even the maximum Desert Eagle recoil pivots at the wrist and retains both grips without an axial hand twist',async()=>{
  for(const sex of ['male','female'])for(const type of types)for(const crouched of [false,true]){
    const f=await fixture(type,sex);f.player.stance=crouched?'sneak':'walk';const clip=crouched?'Crouch_Idle':'Idle_Gun_Pointing';pose(f,'aim',clip);
    const rest=position(f,'WristR'),initial=f.entity.weapon.getWorldQuaternion(new Quaternion());kickWeapon(f.player,f.weapon);f.player.combat.shotImpulse.power=1.5;
    for(const age of [0,.02,.05,.1,.2,.4]){
      f.player.combat.shotImpulse.age=age;pose(f,'aim',clip);
      assert.ok(position(f,'WristR').distanceTo(rest)<.13,'recoil does not pull the wrist down by a palm length');
      for(const side of ['R','L']){assert.ok(bend(f,side)<53,'recoil wrist bend stays limited');const[fore,hand]=rolls(f,side);assert.ok(fore<60.05&&hand<34,`${sex} ${type} ${age} ${side}: ${fore}/${hand}`);}
      if(age===0)assert.ok(f.entity.weapon.getWorldQuaternion(new Quaternion()).angleTo(initial)>.1,'visible firing impulse');
    }
  }
});
