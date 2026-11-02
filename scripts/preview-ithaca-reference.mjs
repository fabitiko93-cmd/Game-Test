import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {Vector3,Quaternion} from 'three';
import {ithacaFixture} from '../tests/helpers/ithaca-fixture.mjs';
import {exportModelFrame} from './lib/preview-mesh.mjs';
import {gripContact} from '../tests/helpers/grip-contact.mjs';

const output=process.argv[2];if(!output)throw Error('Provide output directory');await mkdir(output,{recursive:true});
const profile=JSON.parse(await readFile(new URL('../tests/fixtures/ithaca-reference-pose.json',import.meta.url),'utf8'));
const modelPath=new URL('../tests/fixtures/ithaca-reference-cut.glb.gz',import.meta.url),frames=[];
for(const sex of ['male','female']){
 const f=await ithacaFixture(sex,{profile,modelPath}),e=f.entity;
 for(const posture of ['aim','carry']){
  f.pose({posture});const joints=Object.fromEntries(['Head','UpperArmR','WristR','Middle2R','Index4R','Thumb3R'].map(n=>[n,e.model.getObjectByName(n).getWorldPosition(new Vector3()).toArray()]));
  frames.push(exportModelFrame(e.root,sex+'-'+posture,joints));
  const probe=gripContact(e,profile.contactMesh);console.log(JSON.stringify({sex,posture,maxDepth:probe.maxDepth,inside:probe.inside.length,forward:new Vector3(0,0,1).applyQuaternion(e.weapon.getWorldQuaternion(new Quaternion())).toArray()}));
 }
 f.player.combat.triggerHeld=true;f.pose();frames.push(exportModelFrame(e.root,sex+'-trigger',Object.fromEntries(['WristR','Index4R'].map(n=>[n,e.model.getObjectByName(n).getWorldPosition(new Vector3()).toArray()]))));
 if(sex==='male'){
  e.weapon.removeFromParent();e.weapon.position.set(0,0,0);e.weapon.quaternion.identity();e.weapon.scale.setScalar(1);frames.push(exportModelFrame(e.weapon,'weapon'));
 }
 f.replay.dispose();
}
await writeFile(output+'/reference-meshes.json',JSON.stringify(frames));
