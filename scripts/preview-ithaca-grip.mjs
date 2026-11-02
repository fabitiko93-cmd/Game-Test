import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {Vector3,Quaternion} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {ithacaFixture} from '../tests/helpers/ithaca-fixture.mjs';
import {exportModelFrame} from './lib/preview-mesh.mjs';

const output=process.argv[2],beforePath=process.argv[3];
if(!output)throw Error('Provide an output directory, optionally followed by the prior review GLB');
await mkdir(output,{recursive:true});const frames=[];
if(beforePath){
 const bytes=await readFile(beforePath),old=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;
 frames.push(exportModelFrame(old,'weapon-before'));
}
for(const sex of ['male','female']){
 const f=await ithacaFixture(sex),e=f.entity,p=f.player;
 for(const trigger of [false,true]){
  p.combat.triggerHeld=trigger;f.pose();
  const joints=Object.fromEntries(['Head','UpperArmR','LowerArmR','WristR','Middle2R','Index4R','Thumb3R'].map(n=>[n,e.model.getObjectByName(n).getWorldPosition(new Vector3()).toArray()]));
  frames.push(exportModelFrame(e.root,sex+(trigger?'-trigger':'-rest'),joints));
  console.log(JSON.stringify({sex,trigger,joints:Object.fromEntries(Object.keys(joints).map(n=>[n,e.weapon.worldToLocal(new Vector3(...joints[n])).toArray()])),forward:new Vector3(0,0,1).applyQuaternion(e.weapon.getWorldQuaternion(new Quaternion())).toArray()}));
 }
 if(sex==='male'){
  e.weapon.removeFromParent();e.weapon.position.set(0,0,0);e.weapon.quaternion.identity();e.weapon.scale.setScalar(1);
  frames.push(exportModelFrame(e.weapon,'weapon-after'));
 }
 f.replay.dispose();
}
await writeFile(output+'/grip-meshes.json',JSON.stringify(frames));
