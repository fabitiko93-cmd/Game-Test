import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3,Quaternion,Box3} from 'three';
import {ithacaFixture} from './helpers/ithaca-fixture.mjs';
import {bodyIntersections} from './helpers/body-intersections.mjs';

const at=(e,n)=>e.model.getObjectByName(n).getWorldPosition(new Vector3());
const forward=e=>new Vector3(0,0,1).applyQuaternion(e.weapon.getWorldQuaternion(new Quaternion()));
function unchangedFreeArmAndLegs(f){
 assert.deepEqual(f.entity.model.getObjectByName('ShoulderR').quaternion.toArray(),f.baseline.shoulder.toArray(),'source firing shoulder is retained');
 for(const[b,q]of f.baseline.left)assert.deepEqual(b.quaternion.toArray(),q.toArray(),'free left '+b.name);
 for(const{bone,rotation}of f.baseline.legs)assert.deepEqual(bone.quaternion.toArray(),rotation.toArray(),'original leg '+bone.name);
}
function grip(e){
 const profile=e.weapon.userData.oneHandPose,contact=profile.rigs?.[e.modelSex]?.rightPalm||profile.rightPalm;
 assert.ok(at(e,'Middle2R').distanceTo(e.weapon.localToWorld(new Vector3(...contact)))<1e-6,'palm stays on the authored wood grip');
 const bend=at(e,'WristR').sub(at(e,'LowerArmR')).angleTo(at(e,'Middle2R').sub(at(e,'WristR')));
 assert.ok(bend<60*Math.PI/180,'firing wrist remains in its bend range');
 const bounds=new Box3();for(const n of ['Backing','EdgeBinding','Loop_01','Loop_02','Loop_03']){
  const m=e.weapon.getObjectByName(n);m.geometry.computeBoundingBox();bounds.union(m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld));
 }
 for(const n of ['Index4R','Middle4R','Pinky4R','Thumb3R'])assert.ok(bounds.distanceToPoint(at(e,n))>.025,n+' clears the carrier');
 e.model.traverse(b=>{if(b.isBone)assert.ok(b.quaternion.toArray().every(Number.isFinite),'finite '+b.name);});
}

test('Ithaca one-hand poses retain the real grip, original free arm and legs on both rigs',async()=>{
 for(const sex of ['male','female']){
  const f=await ithacaFixture(sex),e=f.entity,probe=bodyIntersections(e);
  try{
   for(const clip of ['Idle_Gun','Walk','Run','Crouch_Idle','Crouch_Walk'])for(const progress of [.1,.4,.8])for(const posture of ['carry','hip','aim']){
    const yaw=progress*3;
    f.pose({clip,progress,posture,yaw,sneak:clip.startsWith('Crouch'),running:clip==='Run'});
    unchangedFreeArmAndLegs(f);grip(e);
    assert.deepEqual(probe().filter(x=>x.startsWith('R')),[],`${sex} ${clip} ${progress} ${posture}: firing arm clears the body`);
    if(posture==='aim'){
     assert.ok(forward(e).dot(new Vector3(Math.sin(yaw),0,Math.cos(yaw)))>.999,'aim follows the facing direction');
     const barrel=new Box3().setFromObject(e.weapon.getObjectByName('BarrelAndRib')),shoulder=at(e,'UpperArmR').y;
     assert.ok(barrel.max.y<shoulder+.10&&barrel.min.y>shoulder-.08,`${sex} ${clip} ${progress}: aimed barrel stays at shoulder height`);
    }
    else if(posture==='carry')assert.ok(forward(e).y<(clip.startsWith('Crouch')?-.35:-.45),'standing and raised crouched carry both point downward');
   }
  }finally{f.replay.dispose();}
 }
});

test('one-hand transitions can reverse while walking, crouching and sprinting without losing contact',async()=>{
 for(const sex of ['male','female'])for(const fps of [30,60]){
  const f=await ithacaFixture(sex),e=f.entity,probe=bodyIntersections(e),dt=1/fps;
  f.pose({posture:'carry'});let previous=at(e,'WristR').sub(at(e,'UpperArmR'));
  try{
   for(let i=0;i<fps*4;i++){
    const t=i/fps,phase=Math.floor(t/.65)%4;
    const clip=['Idle_Gun','Walk','Crouch_Walk','Run'][phase];
    const posture=phase===3?'carry':Math.floor(t/.37)%2?'aim':'carry';
    f.pose({clip,progress:(t*.7)%1,posture,delta:dt,sneak:phase===2,running:phase===3});
    unchangedFreeArmAndLegs(f);grip(e);
    // The original crouch clip moves the whole shoulder rapidly downward.
    // Measure the procedural arm motion relative to that original shoulder.
    const next=at(e,'WristR').sub(at(e,'UpperArmR'));assert.ok(next.distanceTo(previous)<.075,`${sex} ${fps} frame ${i}: bounded shoulder-relative wrist step`);previous=next;
    assert.deepEqual(probe().filter(x=>x.startsWith('R')),[],`${sex} ${fps} frame ${i}: firing arm clears body during transition`);
   }
  }finally{f.replay.dispose();}
 }
});

test('the one-hand recoil raises the muzzle and settles back while the free hand stays unchanged',async()=>{
 for(const sex of ['male','female']){
  const f=await ithacaFixture(sex),e=f.entity,p=f.player;
  try{
   f.pose();const rest=forward(e);let peak=0;
   for(let i=0;i<=30;i++){
    p.combat.shotImpulse={weaponId:e.weapon.userData.weaponId,age:i/60,power:1,side:1};
    f.pose({delta:1/60});unchangedFreeArmAndLegs(f);grip(e);peak=Math.max(peak,forward(e).y-rest.y);
   }
   assert.ok(peak>.25,'visible one-hand muzzle rise');assert.ok(forward(e).angleTo(rest)<.03,'returns to aim');
  }finally{f.replay.dispose();}
 }
});
