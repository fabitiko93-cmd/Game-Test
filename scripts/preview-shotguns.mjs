import {writeFile,mkdir} from 'node:fs/promises';
import {Vector3} from 'three';
import {weaponFixture} from '../tests/helpers/weapon-fixture.mjs';
import {exportModelFrame} from './lib/preview-mesh.mjs';
const output=process.argv[2];if(!output)throw Error('Provide output directory');await mkdir(output,{recursive:true});const frames=[];
const frame=(e,id)=>exportModelFrame(e.root,id,Object.fromEntries(['Head','UpperArmR','UpperArmL','WristR','WristL','Index4L','Index4R'].map(n=>[n,e.model.getObjectByName(n).getWorldPosition(new Vector3()).toArray()])));
for(const sex of ['male','female'])for(const type of ['ithaca_short','ithaca_mag10','benelli_m4','mossberg_590']){
 const f=await weaponFixture({sex,type,track:'aim',mods:{carrier:type.startsWith('ithaca')?'ithaca_carrier':type==='benelli_m4'?'benelli_carrier':'mossberg_carrier'}}),e=f.entity;f.player.inventory.find(i=>i.id===f.player.equipment.mainHand).mods.carrier.rounds=3;f.replay.evaluate(1);frames.push(frame(e,sex+'-'+type+'-aim'));
 await f.replay.configure({track:'reload',movement:'crouch'});const loading=f.player.combat.reload;f.replay.seek(loading.start+loading.loop*(loading.insertAt-.01));frames.push(frame(f.entity,sex+'-'+type+'-reload'));
 if(type==='ithaca_short'){f.models.pose(f.entity,{clip:'Idle_Neutral',progress:.3,delta:1,yaw:0});f.entity.weapon.visible=false;frames.push(frame(f.entity,sex+'-body'));}
 f.replay.dispose();
}
await writeFile(output+'/shotgun-meshes.json',JSON.stringify(frames));console.log('Exported',frames.length,'runtime frames');
