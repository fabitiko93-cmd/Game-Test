import assert from 'node:assert/strict';
import test from 'node:test';
import {Quaternion} from 'three';
import {cancelReload} from '../docs/src/weapon-reload.js';
import {weaponFixture} from './helpers/weapon-fixture.mjs';
import {bodyIntersections} from './helpers/body-intersections.mjs';
import {pistolClearanceCases} from './helpers/weapon-clearance-cases.mjs';

test('pistol forearm and hand paths avoid the animated body surfaces during crouching, reloads and interruptions',async()=>{
 for(const options of pistolClearanceCases()){
  const f=await weaponFixture(options),probe=bodyIntersections(f.entity);
  try{
   for(let i=0;i<=f.replay.frameCount;i++){
    f.replay.seek(f.replay.frameTime(i));
    assert.deepEqual(probe(),[],`${JSON.stringify(options)} frame ${i}: limb crosses the original body surface`);
   }
  }finally{f.replay.dispose();}
 }
});

test('G17 raising takes a short arm path instead of an almost complete shoulder revolution',async()=>{
 for(const sex of ['male','female'])for(const movement of ['idle','crouch'])for(const fps of [15,30,60]){
  const f=await weaponFixture({sex,type:'pistol_9mm',track:'toAim',movement,fps});let first,previous,travel=0;
  for(let i=0;i<Math.ceil((f.replay.duration+1)*fps);i++){
   const q=f.entity.model.getObjectByName('UpperArmR').getWorldQuaternion(new Quaternion()).normalize();
   first??=q.clone();if(previous)travel+=q.angleTo(previous);previous=q;f.replay.step(1/fps);
  }
  const direct=first.angleTo(previous),tag=`${sex} ${movement} ${fps}: ${travel*180/Math.PI} degrees`;
  assert.ok(travel<direct*1.65+.15,tag+' unnecessary rotation');
  assert.ok(travel<Math.PI,tag+' must stay below half a revolution');f.replay.dispose();
 }
});

test('G17 reload return retains its shoulder guide until arrival, then restores the calibrated aiming frame',async()=>{
 for(const sex of ['male','female'])for(const fps of [15,30,60])for(const cut of [.29,.55,1]){
  const f=await weaponFixture({sex,type:'pistol_9mm',track:'reload',movement:'crouch',fps});
  const end=f.replay.duration*cut,upper=()=>f.entity.model.getObjectByName('UpperArmR').quaternion.clone().normalize();
  while(f.replay.time<end-1e-7)f.replay.step(1/fps);
  if(cut<1)cancelReload(f.replay.game);
  let previous=upper();
  for(let i=0;i<2*fps;i++){
   f.replay.step(1/fps);const q=upper();
   assert.ok(q.angleTo(previous)<24/fps+.01,`${sex} ${fps} cut ${cut} frame ${i}: shoulder guide was released early`);previous=q;
  }
  assert.equal(f.entity.pistolFits.R.recovering,false,`${sex} ${fps} cut ${cut}: shoulder guide must complete`);
  const direction=new Quaternion().copy(f.entity.weapon.getWorldQuaternion(new Quaternion()));
  assert.ok(direction.angleTo(new Quaternion())<.001,`${sex} ${fps} cut ${cut}: settled barrel returns to the calibrated aim`);
  f.replay.dispose();
 }
});

test('crouched revolver and rifle reload aborts retain continuous arm chains at different action phases',async()=>{
 const names=['UpperArmL','LowerArmL','WristL','UpperArmR','LowerArmR','WristR'];
 for(const sex of ['male','female'])for(const type of ['revolver_44','ak_762','vector_9mm','m4_556'])for(const fps of [15,30,60])for(const abort of [.6,.9,1.2,1.5]){
  const f=await weaponFixture({sex,type,track:'reload',movement:'crouch',fps});let previous;
  for(let i=0;i<Math.ceil((abort+1.2)*fps);i++){
   if(i===Math.round(abort*fps))cancelReload(f.replay.game);
   f.replay.step(1/fps);const now=names.map(n=>f.entity.model.getObjectByName(n).quaternion.clone().normalize());
   if(previous&&i>=Math.round(abort*fps))now.forEach((q,j)=>assert.ok(q.angleTo(previous[j])<36/fps+.01,`${sex} ${type} ${fps} abort ${abort} frame ${i}: ${names[j]} flipped`));
   previous=now;
  }
  f.replay.dispose();
 }
});
