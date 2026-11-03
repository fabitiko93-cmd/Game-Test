import test from 'node:test';
import assert from 'node:assert/strict';
import {Quaternion,Vector3} from 'three';
import {weaponFixture} from './helpers/weapon-fixture.mjs';
import {bodyIntersections} from './helpers/body-intersections.mjs';
import {applyKitStance,sampleKitStance,STANCE_KIT} from '../docs/src/kit-stance.js';
import G17 from '../docs/assets/weapons/g17-grasp.json' with {type:'json'};
import ITHACA from '../docs/assets/weapons/ithaca-one-hand.json' with {type:'json'};
import {readFile} from 'node:fs/promises';
import {emptyAnimation,emptyValues,putPose} from '../docs/src/animation-document.js';
const at=(e,n)=>e.model.getObjectByName(n).getWorldPosition(new Vector3());
test('the active kits carry original clip provenance and leave fingers out of the stance data',()=>{
 assert.equal(STANCE_KIT.sources.pistol.license,'CC0-1.0');assert.match(STANCE_KIT.sources.pistol.sha256,/^[a-f0-9]{64}$/);
 assert.equal(STANCE_KIT.sources.longGun.license,'CC0-1.0');assert.equal(STANCE_KIT.sources.longGun.sha256,'7fef1fc0e7b0feafd34b8e12d23f514c8c1f9d068047a691b854b56f1774dff5');
 assert.equal(STANCE_KIT.sources.revolver.license,'Unlicense');assert.match(STANCE_KIT.sources.revolver.sha256,/^[a-f0-9]{64}$/);
 assert.ok(STANCE_KIT.bones.every(n=>!/Index|Middle|Ring|Pinky|Thumb/.test(n)));
 for(const sex of ['male','female']){assert.equal(STANCE_KIT.rigs[sex].pistol.aim.sourceClip,'Pistol_Aim_Neutral');assert.equal(STANCE_KIT.rigs[sex].oneHand.aim.sourceClip,'Idle_Gun_Pointing');}
});
test('the player controller uses the shared kit evaluator',async()=>{
 const pending=[new URL('../docs/src/player-models.js',import.meta.url)],seen=new Set();
 while(pending.length){const url=pending.pop();if(seen.has(url.href))continue;seen.add(url.href);const source=await readFile(url,'utf8');for(const m of source.matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+\.js)['"]/g))pending.push(new URL(m[1],url));}
 assert.ok([...seen].some(n=>n.endsWith('/kit-stance.js')),'actual player runtime uses the reviewed evaluator');
});
test('steady authored chest and head edits remain stable across repeated runtime frames and editor draws',async()=>{
 for(const sex of ['male','female']){
  const f=await weaponFixture({sex,type:'pistol_9mm'}),values=emptyValues();values.chest[1]=7;values.head[1]=8;
  const doc=putPose(emptyAnimation(),sex+':pistol_9mm','aim',values);f.replay.setDocument(doc,1);f.replay.reset();
  const initial=['Chest','Head'].map(n=>f.entity.model.getObjectByName(n).quaternion.clone());
  for(let i=0;i<45;i++){f.replay.step(1/60);['Chest','Head'].forEach((n,j)=>assert.ok(f.entity.model.getObjectByName(n).quaternion.angleTo(initial[j])<1e-6,'body edit is applied once on '+n));}
  f.replay.previewEdits(doc,2);f.replay.previewEdits(doc,3);['Chest','Head'].forEach((n,j)=>assert.ok(f.entity.model.getObjectByName(n).quaternion.angleTo(initial[j])<1e-6,'editor reuses the same body edit on '+n));f.replay.dispose();
 }
});
test('original-kit aiming retains both approved grasps, continuous model contacts and the real source leg pose on both rigs',async()=>{
 for(const sex of ['male','female'])for(const type of ['pistol_9mm','ithaca_short']){
  const f=await weaponFixture({sex,type}),e=f.entity;
  try{
   for(const clip of ['Idle_Neutral','Idle_Gun_Pointing','Crouch_Idle','Crouch_Walk'])for(const yaw of [0,.7]){
   f.models.pose(e,{clip,progress:.5,delta:1,yaw});
   const legs=new Map(['UpperLegR','LowerLegR','FootR','UpperLegL','LowerLegL','FootL'].map(n=>{const b=e.model.getObjectByName(n);return[b,{q:b.quaternion.toArray(),p:at(e,n).toArray()}];}));
   const result=applyKitStance(e),pose=sampleKitStance(sex,type==='pistol_9mm'?'pistol':'oneHand');
   const sourceElbow=e.model.getObjectByName('LowerArmR').position.clone().angleTo(e.model.getObjectByName('WristR').position.clone().applyQuaternion(pose.get('LowerArmR')));
   assert.ok(Math.abs(at(e,'LowerArmR').sub(at(e,'UpperArmR')).angleTo(at(e,'WristR').sub(at(e,'LowerArmR')))-sourceElbow)<2e-6,'retarget preserves the authored elbow angle in '+clip);
   const fingers=type==='pistol_9mm'?G17.rigs[sex].fingers:ITHACA.rigs[sex].boneRotations;
   for(const[n,q]of Object.entries(fingers))assert.ok(e.model.getObjectByName(n).quaternion.clone().normalize().angleTo(new Quaternion(...q).normalize())<1e-6,'approved '+n);
   for(const[b,p]of legs){assert.deepEqual(b.quaternion.toArray(),p.q);assert.deepEqual(at(e,b.name).toArray(),p.p);}
   const profile=e.weapon.userData.pistol||e.weapon.userData.oneHandPose,grasp=type==='pistol_9mm'?profile:profile.rigs[sex];
   assert.ok(at(e,'Middle2R').distanceTo(e.weapon.localToWorld(new Vector3(...grasp.rightPalm)))<1e-6,'firing grip');
   assert.ok(result.supportGap<1e-6,'support grip');assert.deepEqual(bodyIntersections(e)(),[],'arms clear actual body geometry');
   assert.ok(new Vector3(0,0,1).applyQuaternion(e.weapon.getWorldQuaternion(new Quaternion())).dot(new Vector3(Math.sin(yaw),0,Math.cos(yaw)))>.999999,'muzzle follows facing');
   const a=at(e,'UpperArmR'),b=at(e,'LowerArmR'),c=at(e,'WristR'),d=at(e,'Middle2R');
   assert.ok(b.clone().sub(a).angleTo(c.clone().sub(b))<35*Math.PI/180,'gentle authored elbow');
   for(const side of ['R','L'])for(const n of ['UpperArm','LowerArm','Wrist'])assert.ok(Math.abs(e.model.getObjectByName(n+side).quaternion.length()-1)<1e-6,'contact solves retain unit rotations');
   assert.ok(c.clone().sub(b).angleTo(d.sub(c))<25*Math.PI/180,'gentle wrist/palm transition');
   }
  }finally{f.replay.dispose();}
 }
});
