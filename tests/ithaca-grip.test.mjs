import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {Vector3} from 'three';
import {ithacaFixture} from './helpers/ithaca-fixture.mjs';
import {gripContact,indexSurfaceDistance} from './helpers/grip-contact.mjs';
import {poseOneHandFingers} from '../docs/src/one-hand-grasp.js';
import REFERENCE from './fixtures/ithaca-retained-surfaces.json' with {type:'json'};

test('the authored grip is a closed game surface and retains the other credited weapon parts',async()=>{
 const bytes=gunzipSync(await readFile(new URL('../docs/assets/weapons/ithaca-short-stance.glb.gz',import.meta.url))),size=bytes.readUInt32LE(12),doc=JSON.parse(bytes.subarray(20,20+size)),binary=bytes.subarray(28+size);
 const hash=i=>{const a=doc.accessors[i],v=doc.bufferViews[a.bufferView],start=(v.byteOffset||0)+(a.byteOffset||0);return createHash('sha256').update(binary.subarray(start,start+a.count*12)).digest('hex');};
 assert.equal(doc.asset.extras.sourceAuthor,'TastyTony');assert.match(doc.asset.extras.license,/CC-BY-4.0/);
 assert.equal(doc.asset.extras.gripSourceSha256,REFERENCE.sourceSha256);
 for(const[name,attributes]of Object.entries(REFERENCE.retained)){
  const mesh=doc.meshes.find(m=>m.name===name);assert.ok(mesh,name+' retained');
  for(const[attr,digest]of Object.entries(attributes))assert.equal(hash(mesh.primitives[0].attributes[attr]),digest,name+' '+attr+' original surface');
 }
 const f=await ithacaFixture('male');
 try{
  const g=f.entity.weapon.getObjectByName('CustomGrip').geometry,a=g.attributes.position,edges=new Map(),key=i=>new Vector3().fromBufferAttribute(a,i).toArray().map(n=>n.toFixed(6)).join(',');
  for(let i=0;i<a.count;i+=3)for(const[j,k]of [[0,1],[1,2],[2,0]]){const edge=[key(i+j),key(i+k)].sort().join(';');edges.set(edge,(edges.get(edge)||0)+1);}
  assert.ok(a.count/3<512,'small decorative mesh budget');assert.ok([...edges.values()].every(n=>n===2),'no open grip edges or overlapping faces');
 }finally{f.replay.dispose();}
});

test('both real hands wrap the new grip without deep penetration and the index reaches its contact',async()=>{
 for(const sex of ['male','female']){
  const f=await ithacaFixture(sex),e=f.entity,target=new Vector3(0,-.004,.032);
  try{
   for(const clip of ['Idle_Gun','Walk','Crouch_Walk'])for(const posture of ['carry','aim']){
    f.pose({clip,posture,sneak:clip.startsWith('Crouch')});
    for(const trigger of [0,.5,1]){
     poseOneHandFingers(e,trigger);const contact=gripContact(e);
     assert.ok(contact.maxDepth<.0015,`${sex} ${clip} ${posture} ${trigger}: no visible hand/grip intersection`);
    }
   }
   f.player.combat.triggerHeld=false;f.pose();const outside=indexSurfaceDistance(e,target);
   f.player.combat.triggerHeld=true;f.pose();const firing=indexSurfaceDistance(e,target);
   assert.ok(outside>.012,'resting index remains outside the contact');
   assert.ok(firing<.006,'bent index reaches the trigger surface');
   f.player.combat.triggerHeld=false;f.pose();let previous=e.model.getObjectByName('Index3R').quaternion.clone();
   f.player.combat.triggerHeld=true;
   for(let i=0;i<7;i++){
    f.pose({delta:1/60});const next=e.model.getObjectByName('Index3R').quaternion.clone();
    assert.ok(previous.angleTo(next)<.4,'index closes continuously');previous=next;
   }
   assert.equal(e.oneHandTrigger,1,'reaches the firing contact');
  }finally{f.replay.dispose();}
 }
});
