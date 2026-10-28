import assert from 'node:assert/strict';
import test from 'node:test';
import {Quaternion,Vector3} from 'three';
import {reloadPhase} from '../docs/src/weapon-reload.js';
import {pinchPoint} from '../docs/src/weapon-hands.js';
import {emptyAnimation} from '../docs/src/animation-document.js';
import {weaponFixture} from './helpers/weapon-fixture.mjs';

const names=['UpperArmL','LowerArmL','WristL','UpperArmR','LowerArmR','WristR'];
function state(e){const at=n=>e.model.getObjectByName(n).getWorldPosition(new Vector3());return {q:names.map(n=>e.model.getObjectByName(n).quaternion.clone().normalize()),hands:['L','R'].map(s=>at('Wrist'+s).sub(at('UpperArm'+s)).applyQuaternion(e.root.getWorldQuaternion(new Quaternion()).invert()))};}
test('female revolver reloads retain anatomical wrists and continuous reached hands',async()=>{
 for(const movement of ['idle','walk','crouch'])for(const fps of [30,60]){
  const f=await weaponFixture({sex:'female',type:'revolver_44',track:'reload',movement,fps});let before;
  for(let i=0;i<=f.replay.frameCount;i++){f.replay.seek(f.replay.frameTime(i));const now=state(f.entity),tag=`${movement} ${fps} ${i}`;
   for(const side of ['L','R']){const s=f.replay.diagnostics.sides[side];assert.ok(s.bend<78,tag+' wrist bend '+s.bend);assert.ok(s.foreTwist<60.05&&s.wristTwist<35,tag+' axial twist');}
   const phase=reloadPhase(f.player.combat.reload);
   if(phase?.clip==='revolverLoad'&&phase.progress>.68&&phase.progress<.71){
    const cylinder=f.entity.weapon.getObjectByName('Cylinder');cylinder.geometry.computeBoundingBox();
    const p=cylinder.worldToLocal(pinchPoint(f.entity)),box=cylinder.geometry.boundingBox,center=box.getCenter(new Vector3());
    assert.ok(Math.hypot(p.x-center.x,p.y-center.y)<.026&&Math.abs(p.z-box.min.z)<.020,tag+' cartridge reaches chamber before ammunition transfer');
   }
   if(before){now.q.forEach((q,j)=>assert.ok(q.angleTo(before.q[j])<24/fps+.01,tag+' '+names[j]+' flipped'));now.hands.forEach((p,j)=>assert.ok(p.distanceTo(before.hands[j])<4/fps+.001,tag+' hand jumped'));}before=now;
  }f.replay.dispose();
 }
});
test('rifle support arms stay untwisted and continuous during reload abort and sprint return',async()=>{
 for(const sex of ['male','female'])for(const type of ['ak_762','m4_556','vector_9mm'])for(const fps of [15,30,60]){
  const f=await weaponFixture({sex,type,scenario:'interrupt',fps});let before;
  for(let i=0;i<=f.replay.frameCount;i++){f.replay.seek(f.replay.frameTime(i));const now=state(f.entity),s=f.replay.diagnostics.sides.L,tag=`${sex} ${type} ${fps} ${i}`;
   assert.ok(s.foreTwist<60.05&&s.wristTwist<35&&s.bend<68,tag+' support arm limits '+JSON.stringify(s));
   if(before){now.q.slice(0,3).forEach((q,j)=>assert.ok(q.angleTo(before.q[j])<24/fps+.01,tag+' '+names[j]+' flipped'));assert.ok(now.hands[0].distanceTo(before.hands[0])<4/fps+.001,tag+' support hand jumped');}before=now;
  }f.replay.dispose();
 }
});
test('revolver firing hand does not drop on interrupted sprint-to-aim transitions',async()=>{
 for(const sex of ['male','female'])for(const fps of [15,30,60]){
  const f=await weaponFixture({sex,type:'revolver_44',scenario:'transitions',fps});let before;
  for(let i=0;i<=f.replay.frameCount;i++){f.replay.seek(f.replay.frameTime(i));const now=state(f.entity);if(before&&f.replay.time>1.55&&f.replay.time<2)assert.ok(now.hands[1].distanceTo(before.hands[1])<3/fps+.001,`${sex} ${fps} ${i}: firing hand dropped`);before=now;}f.replay.dispose();
 }
});

test('all four pistols reverse a short sprint directly into raising the reached weapon',async()=>{
 for(const sex of ['male','female'])for(const type of ['pistol_9mm','usp_9mm','scorpion_45','desert_eagle_50'])for(const fps of [15,30,60]){
  const f=await weaponFixture({sex,type,scenario:'transitions',fps});let previous,first,last;
  for(let i=0;i<=f.replay.frameCount;i++){
   f.replay.seek(f.replay.frameTime(i));if(f.replay.time<1.55||f.replay.time>1.95)continue;
   const e=f.entity,height=e.weapon.getWorldPosition(new Vector3()).y;
   // The reached gun can settle a few millimetres as wrist constraints fit;
   // the old extra lowering arc was about fourteen centimetres.
   if(previous!==undefined)assert.ok(height>=previous-.005,`${sex} ${type} ${fps} ${i}: continued lowering after re-aim`);
   first??=height;last=height;previous=height;
  }
  assert.ok(last>first+.02,`${sex} ${type} ${fps}: weapon must rise after reversal`);f.replay.dispose();
 }
});

test('revolver reload aborts and re-aim keep both arm chains on a continuous branch',async()=>{
 for(const sex of ['male','female'])for(const fps of [15,30,60]){
  const f=await weaponFixture({sex,type:'revolver_44',scenario:'interrupt',fps});let before;
  for(let i=0;i<=f.replay.frameCount;i++){
   const time=f.replay.frameTime(i);if(time>=1.95)break;f.replay.seek(time);const now=state(f.entity);
   if(before)now.q.forEach((q,j)=>assert.ok(q.angleTo(before.q[j])<24/fps+.01,`${sex} ${fps} ${i}: ${names[j]} branch jump`));before=now;
  }f.replay.dispose();
 }
});

// Entering direct edit mode must keep the current transition's weapon target,
// rather than moving it immediately to the completed posture.
test('workshop editing preserves the evaluated transition target on both rigs',async()=>{
 for(const sex of ['male','female'])for(const type of ['pistol_9mm','usp_9mm','revolver_44','ak_762','m4_556','vector_9mm'])for(const track of ['toAim','toCarry']){
  const f=await weaponFixture({sex,type,track,fps:60});f.replay.seek(f.replay.duration*.5);
  const before=f.entity.animationTargetBases.weapon.clone();f.replay.previewEdits(emptyAnimation(),1);
  assert.ok(f.entity.animationTargetBases.weapon.distanceTo(before)<1e-6,sex+' '+type+' '+track+' target jumped on editing');f.replay.dispose();
 }
});

test('a joined rifle support palm stays on its gun throughout live recoil',async()=>{
 for(const sex of ['male','female'])for(const type of ['ak_762','m4_556','vector_9mm'])for(const scenario of ['single','interrupt']){
  const f=await weaponFixture({sex,type,track:scenario==='single'?'shot':'aim',scenario,fps:60});
  for(let i=0;i<=f.replay.frameCount;i++){f.replay.seek(f.replay.frameTime(i));if(scenario==='interrupt'&&f.replay.time<1.9)continue;const actual=f.entity.model.getObjectByName('Middle2L').getWorldPosition(new Vector3()),target=f.entity.animationTargets.support;
   assert.ok(actual.distanceTo(target)<.008,`${sex} ${type} ${i}: joined hand detached under recoil`);
  }f.replay.dispose();
 }
});
