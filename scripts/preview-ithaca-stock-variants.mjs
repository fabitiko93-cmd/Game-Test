import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {Vector3} from 'three';
import PROFILE from '../docs/assets/weapons/ithaca-short-pose.json' with {type:'json'};
import OPTIONS from './lib/ithaca-stock-options.json' with {type:'json'};
import {ithacaFixture} from '../tests/helpers/ithaca-fixture.mjs';
import {exportModelFrame} from './lib/preview-mesh.mjs';
import {gripContact} from '../tests/helpers/grip-contact.mjs';

const output=process.argv[2],reference=process.argv[3];if(!output||!reference)throw Error('Provide output and original stock GLB');await mkdir(output,{recursive:true});
const parse=async path=>{const b=await readFile(path);return(await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'')).scene;};
const results=[exportModelFrame(await parse(reference),'reference')];
for(const variant of ['a','b']){
 const profile=structuredClone(PROFILE);
 profile.model=`ithaca-stock-${variant}.glb`;profile.previewOnly=true;profile.stockVariant=variant;
 profile.designStatus='stock-contour-review';
 profile.changes='Inactive original-stock contour alternative. Original neck surfaces retained, rear rest reshaped and rounded; hand placement is preliminary for form review.';
 for(const sex of ['male','female']){
  Object.assign(profile.rigs[sex],structuredClone(OPTIONS[variant][sex]));
  const f=await ithacaFixture(sex,{profile,modelPath:output+'/'+profile.model}),e=f.entity;
  f.pose();const joints=Object.fromEntries(['UpperArmR','WristR','Middle2R','Index4R','Thumb3R'].map(n=>[n,e.model.getObjectByName(n).getWorldPosition(new Vector3()).toArray()]));
  results.push(exportModelFrame(e.root,variant+'-'+sex,joints));
  const contact=gripContact(e);console.log(JSON.stringify({variant,sex,maxDepth:contact.maxDepth,inside:contact.inside.length}));
  if(sex==='male'){
   e.weapon.removeFromParent();e.weapon.position.set(0,0,0);e.weapon.quaternion.identity();e.weapon.scale.setScalar(1);results.push(exportModelFrame(e.weapon,variant+'-weapon'));
  }
  f.replay.dispose();
 }
 await writeFile(output+`/ithaca-stock-${variant}-pose.json`,JSON.stringify(profile,null,2)+'\n');
}
await writeFile(output+'/stock-variant-meshes.json',JSON.stringify(results));
