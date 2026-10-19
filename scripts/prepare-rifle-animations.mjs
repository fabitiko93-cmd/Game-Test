// Retarget the CC0 KayKit upper body once; keep the game's own feet and gait.
// Usage: node scripts/prepare-rifle-animations.mjs /path/to/Rig_Medium
import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { AnimationMixer, Quaternion, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const directory=process.argv[2];if(!directory)throw Error('Pass the KayKit Rig_Medium glTF directory.');
const assets=new URL('../docs/assets/quaternius/',import.meta.url),catalog=JSON.parse(await readFile(new URL('models.json',assets)));
const parse=b=>new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');
const map={Torso:'spine',Chest:'chest',UpperArmR:'upperarmr',LowerArmR:'lowerarmr',WristR:'handr',UpperArmL:'upperarml',LowerArmL:'lowerarml',WristL:'handl'};
const children={UpperArmR:['LowerArmR','lowerarmr'],LowerArmR:['WristR','wristr'],UpperArmL:['LowerArmL','lowerarml'],LowerArmL:['WristL','wristl']};
function bind(model){const skeletons=new Set();model.traverse(o=>{if(o.isSkinnedMesh)skeletons.add(o.skeleton);});for(const s of skeletons)s.pose();model.updateMatrixWorld(true);}
function rest(model){const result={};model.traverse(b=>{if(b.isBone)result[b.name]={q:b.quaternion.clone(),world:b.getWorldQuaternion(new Quaternion())};});return result;}
function orient(b,q){b.quaternion.copy(b.parent.getWorldQuaternion(new Quaternion()).invert().multiply(q));b.updateMatrixWorld(true);}
const sources={};for(const file of ['CombatRanged','MovementAdvanced']){const bytes=await readFile(`${directory}/Rig_Medium_${file}.glb`),asset=await parse(bytes);bind(asset.scene);sources[file]={asset,rest:rest(asset.scene),sha256:createHash('sha256').update(bytes).digest('hex')};}
const result={author:'Kay Lousberg / KayKit',license:'CC0-1.0',source:'https://kaylousberg.itch.io/kaykit-character-animations',version:'FREE 1.1',sampleRate:30,bones:Object.keys(map),sourceHashes:Object.fromEntries(Object.entries(sources).map(([n,s])=>[n,s.sha256])),rigs:{}};
for(const sex of ['male','female']){
 const key=sex==='male'?'male-Casual_2':'female-Casual',target=await parse(gunzipSync(await readFile(new URL(catalog.characters[key].file,assets))));bind(target.scene);const targetRest=rest(target.scene),clips={};
 for(const [name,file,clipName,start]of [['aim','CombatRanged','Ranged_2H_Aiming',.32],['shoot','CombatRanged','Ranged_2H_Shooting',0],['hip','MovementAdvanced','Running_HoldingRifle',0]]){
  const source=sources[file],original=source.asset.animations.find(c=>c.name===clipName),mixer=new AnimationMixer(source.asset.scene),action=mixer.clipAction(original).play();
  const duration=original.duration-start,count=Math.ceil(duration*30),frames=[];
  for(let i=0;i<=count;i++){
   action.time=Math.min(original.duration-1e-6,start+duration*i/count);mixer.update(0);source.asset.scene.updateMatrixWorld(true);
   target.scene.traverse(b=>{if(b.isBone)b.quaternion.copy(targetRest[b.name].q);});target.scene.updateMatrixWorld(true);
   for(const [targetName,sourceName]of Object.entries(map)){
    const bone=target.scene.getObjectByName(targetName),originalBone=source.asset.scene.getObjectByName(sourceName);
    orient(bone,originalBone.getWorldQuaternion(new Quaternion()).multiply(source.rest[sourceName].world.clone().invert()).multiply(targetRest[targetName].world));
    if(children[targetName]){
     const [targetChild,sourceChild]=children[targetName],position=bone.getWorldPosition(new Vector3());
     const from=target.scene.getObjectByName(targetChild).getWorldPosition(new Vector3()).sub(position).normalize();
     const to=source.asset.scene.getObjectByName(sourceChild).getWorldPosition(new Vector3()).sub(originalBone.getWorldPosition(new Vector3())).normalize();
     orient(bone,new Quaternion().setFromUnitVectors(from,to).multiply(bone.getWorldQuaternion(new Quaternion())));
    }
   }
   frames.push(Object.keys(map).flatMap(n=>target.scene.getObjectByName(n).quaternion.toArray().map(v=>Number(v.toFixed(6)))));
  }
  clips[name]={sourceClip:clipName,trimStart:start,duration,frames};mixer.stopAllAction();mixer.uncacheRoot(source.asset.scene);
 }
 result.rigs[sex]=clips;
}
await writeFile(new URL('rifle-animations.json',assets),JSON.stringify(result)+'\n');
console.log('Retargeted aiming, firing and moving rifle carry for both existing rigs.');
