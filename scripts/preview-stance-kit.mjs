import {mkdir,writeFile} from 'node:fs/promises';
import {Vector3} from 'three';
import {weaponFixture} from '../tests/helpers/weapon-fixture.mjs';
import {exportModelFrame} from './lib/preview-mesh.mjs';
const output=process.argv[2];if(!output)throw Error('Provide output directory');await mkdir(output,{recursive:true});const frames=[],measurements=[];
const at=(e,n)=>e.model.getObjectByName(n).getWorldPosition(new Vector3());
const measure=e=>{const a=at(e,'UpperArmR'),b=at(e,'LowerArmR'),c=at(e,'WristR'),d=at(e,'Middle2R');return{elbow:b.sub(a).angleTo(c.clone().sub(at(e,'LowerArmR')))*180/Math.PI,palmAngle:c.sub(at(e,'LowerArmR')).angleTo(d.sub(at(e,'WristR')))*180/Math.PI};};
const frame=(e,id)=>exportModelFrame(e.root,id,Object.fromEntries(['Head','ShoulderR','UpperArmR','LowerArmR','WristR','Middle2R'].map(n=>[n,at(e,n).toArray()])));
for(const sex of ['male','female'])for(const type of ['pistol_9mm','ithaca_short']){
 const f=await weaponFixture({sex,type}),e=f.entity;
 const evaluate=kit=>{e.weapon.userData.stanceKit=kit;f.models.pose(e,{clip:'Idle_Gun_Pointing',progress:.5,delta:1,yaw:0});f.models.controller.evaluate(e,f.player,{delta:1},'aim');};
 evaluate(false);const before=measure(e);frames.push(frame(e,sex+'-'+type+'-before'));
 evaluate(true);frames.push(frame(e,sex+'-'+type+'-after'));measurements.push({sex,type,before,after:measure(e),...e.kitStance});f.replay.dispose();
}
await writeFile(output+'/kit-meshes.json',JSON.stringify(frames));await writeFile(output+'/kit-measurements.json',JSON.stringify(measurements,null,2)+'\n');console.log('Exported',frames.length,'original-mesh comparison frames');
