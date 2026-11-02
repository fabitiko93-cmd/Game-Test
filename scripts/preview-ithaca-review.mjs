import {writeFile,mkdir} from 'node:fs/promises';
import {Vector3} from 'three';
import {exportModelFrame} from './lib/preview-mesh.mjs';
import {ithacaFixture} from '../tests/helpers/ithaca-fixture.mjs';
import {previewBodySmoothing} from './lib/body-review.mjs';

const output=process.argv[2];if(!output)throw Error('Provide an output directory');await mkdir(output,{recursive:true});
const exportFrame=(e,id)=>exportModelFrame(e.root,id,Object.fromEntries(['Head','UpperArmR','LowerArmR','WristR','Middle2R','Index4R','Thumb3R','Hips'].map(n=>[n,e.model.getObjectByName(n).getWorldPosition(new Vector3()).toArray()])));

const results=[];
for(const sex of ['male','female']){
 const f=await ithacaFixture(sex),e=f.entity,p=f.player;
 f.pose();results.push(exportFrame(e,sex+'-hand-rest'));
 p.combat.triggerHeld=true;f.pose();results.push(exportFrame(e,sex+'-hand-trigger'));p.combat.triggerHeld=false;
 e.weapon.visible=false;f.models.pose(e,{clip:'Idle_Neutral',progress:.35,delta:1,yaw:0});
 results.push(exportFrame(e,sex+'-body-before'));
 const changed=previewBodySmoothing(e,sex);
 results.push(exportFrame(e,sex+'-body-after'));
 console.log(JSON.stringify(Object.fromEntries(Object.entries(changed).filter(([k])=>!['torso','legs'].includes(k)))));
 f.replay.dispose();
}
await writeFile(output+'/review-meshes.json',JSON.stringify(results));
