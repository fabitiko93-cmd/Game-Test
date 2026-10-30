import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {weaponFixture} from '../tests/helpers/weapon-fixture.mjs';
import {bodyIntersections} from '../tests/helpers/body-intersections.mjs';
import {pistolClearanceCases} from '../tests/helpers/weapon-clearance-cases.mjs';

// Independently check the deformed body surfaces, rather than reusing the
// runtime avoidance volumes. Any remaining crossing makes this command fail.
const sources=['arm-clearance','pistol-pose','rifle-pose','weapon-ik','weapon-reload-pose','elbow-pose'];
const sourceHashes=Object.fromEntries(await Promise.all(sources.map(async name=>{
 const path=`docs/src/${name}.js`;
 return [path,createHash('sha256').update(await readFile(new URL('../'+path,import.meta.url))).digest('hex')];
})));
let cases=0,frames=0;const failures=[];
for(const options of pistolClearanceCases()){
 const f=await weaponFixture(options),probe=bodyIntersections(f.entity),hits=[];
 try{
  for(let i=0;i<=f.replay.frameCount;i++){
   f.replay.seek(f.replay.frameTime(i));frames++;
   const limbs=probe();if(limbs.length)hits.push({frame:i,time:f.replay.time,limbs});
  }
  cases++;if(hits.length)failures.push({...options,hits});
 }finally{f.replay.dispose();}
}
console.log(JSON.stringify({sourceHashes,cases,frames,failedCases:failures.length,failures},null,2));
process.exitCode=failures.length?2:0;
