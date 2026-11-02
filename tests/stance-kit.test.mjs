import test from 'node:test';
import assert from 'node:assert/strict';
import {Quaternion,Vector3} from 'three';
import {weaponFixture} from './helpers/weapon-fixture.mjs';
import {bodyIntersections} from './helpers/body-intersections.mjs';
import {applyKitStance,sampleKitStance,STANCE_KIT} from '../docs/src/kit-stance.js';
import G17 from '../docs/assets/weapons/g17-grasp.json' with {type:'json'};
import ITHACA from '../docs/assets/weapons/ithaca-one-hand.json' with {type:'json'};
import {readFile} from 'node:fs/promises';
const at=(e,n)=>e.model.getObjectByName(n).getWorldPosition(new Vector3());
test('the kit candidate carries original clip provenance and leaves fingers out of the stance data',()=>{
 assert.equal(STANCE_KIT.sources.pistol.license,'CC0-1.0');assert.match(STANCE_KIT.sources.pistol.sha256,/^[a-f0-9]{64}$/);
 assert.ok(STANCE_KIT.bones.every(n=>!/Index|Middle|Ring|Pinky|Thumb/.test(n)));
 for(const sex of ['male','female']){assert.equal(STANCE_KIT.rigs[sex].pistol.aim.sourceClip,'Pistol_Aim_Neutral');assert.equal(STANCE_KIT.rigs[sex].oneHand.aim.sourceClip,'Idle_Gun_Pointing');}
});
test('the unintegrated candidate stays outside the player model import graph',async()=>{
 const pending=[new URL('../docs/src/player-models.js',import.meta.url)],seen=new Set();
 while(pending.length){const url=pending.pop();if(seen.has(url.href))continue;seen.add(url.href);assert.ok(!url.pathname.endsWith('/kit-stance.js'),'unfinished kit must not replace the game controller');const source=await readFile(url,'utf8');for(const m of source.matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+\.js)['"]/g))pending.push(new URL(m[1],url));}
 assert.ok(seen.size>30,'actual player runtime dependencies are checked');
});
test('original-kit aiming retains both approved grasps, continuous model contacts and the real source leg pose on both rigs',async()=>{
 for(const sex of ['male','female'])for(const type of ['pistol_9mm','ithaca_short']){
  const f=await weaponFixture({sex,type}),e=f.entity;
  try{
   f.models.pose(e,{clip:'Idle_Neutral',progress:.5,delta:1,yaw:0});
   const legs=new Map(['UpperLegR','LowerLegR','FootR','UpperLegL','LowerLegL','FootL'].map(n=>{const b=e.model.getObjectByName(n);return[b,{q:b.quaternion.toArray(),p:at(e,n).toArray()}];}));
   const result=applyKitStance(e),pose=sampleKitStance(sex,type==='pistol_9mm'?'pistol':'oneHand');
   for(const n of ['UpperArmR','LowerArmR','WristR'])assert.ok(e.model.getObjectByName(n).quaternion.angleTo(pose.get(n))<2e-6,'kit owns '+n);
   const fingers=type==='pistol_9mm'?G17.rigs[sex].fingers:ITHACA.rigs[sex].boneRotations;
   for(const[n,q]of Object.entries(fingers))assert.ok(e.model.getObjectByName(n).quaternion.clone().normalize().angleTo(new Quaternion(...q).normalize())<1e-6,'approved '+n);
   for(const[b,p]of legs){assert.deepEqual(b.quaternion.toArray(),p.q);assert.deepEqual(at(e,b.name).toArray(),p.p);}
   const profile=e.weapon.userData.pistol||e.weapon.userData.oneHandPose,grasp=type==='pistol_9mm'?profile:profile.rigs[sex];
   assert.ok(at(e,'Middle2R').distanceTo(e.weapon.localToWorld(new Vector3(...grasp.rightPalm)))<1e-6,'firing grip');
   assert.ok(result.supportGap<1e-6,'support grip');assert.deepEqual(bodyIntersections(e)(),[],'arms clear actual body geometry');
   assert.ok(new Vector3(0,0,1).applyQuaternion(e.weapon.getWorldQuaternion(new Quaternion())).dot(new Vector3(0,0,1))>.999999,'muzzle follows facing');
   const a=at(e,'UpperArmR'),b=at(e,'LowerArmR'),c=at(e,'WristR'),d=at(e,'Middle2R');
   assert.ok(b.clone().sub(a).angleTo(c.clone().sub(b))<35*Math.PI/180,'gentle authored elbow');
   assert.ok(c.clone().sub(b).angleTo(d.sub(c))<25*Math.PI/180,'gentle wrist/palm transition');
  }finally{f.replay.dispose();}
 }
});
