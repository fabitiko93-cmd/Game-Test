// Offline retarget: KayKit CombatRanged GLB, plus JSON samples made with
// sample-revolver-fbx.c from ZenXChaos's original Unlicense FBX files.
// node scripts/prepare-weapon-animations.mjs /path/to/CombatRanged.glb /path/to/revolver-samples
import {readFile,writeFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {AnimationMixer,Quaternion,Vector3} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

const [kayPath,revolverPath]=process.argv.slice(2);
if(!revolverPath)throw Error('Pass KayKit CombatRanged GLB and the sampled revolver directory.');
const assets=new URL('../docs/assets/quaternius/',import.meta.url);
const catalog=JSON.parse(await readFile(new URL('models.json',assets)));
const parse=b=>new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');
const hash=b=>createHash('sha256').update(b).digest('hex');
const kayBytes=await readFile(kayPath),kay=await parse(kayBytes);
function bind(model){const skeletons=new Set();model.traverse(o=>{if(o.isSkinnedMesh)skeletons.add(o.skeleton);});for(const s of skeletons)s.pose();model.updateMatrixWorld(true);}
function snapshot(model){const result={};model.traverse(b=>{if(b.isBone)result[b.name]={quaternion:b.getWorldQuaternion(new Quaternion()).toArray(),position:b.getWorldPosition(new Vector3()).toArray()};});return result;}
bind(kay.scene);const kayRest=snapshot(kay.scene),sources={};
for(const [name,clipName] of [['reload1H','Ranged_1H_Reload'],['reload2H','Ranged_2H_Reload']]){
  const clip=kay.animations.find(c=>c.name===clipName),mixer=new AnimationMixer(kay.scene),action=mixer.clipAction(clip).play(),frames=[];
  const count=Math.ceil(clip.duration*30);
  for(let i=0;i<=count;i++){action.time=Math.min(clip.duration-1e-6,clip.duration*i/count);mixer.update(0);kay.scene.updateMatrixWorld(true);frames.push(snapshot(kay.scene));}
  sources[name]={sourceClip:clipName,duration:clip.duration,rest:kayRest,frames,kind:'kaykit'};mixer.stopAllAction();mixer.uncacheRoot(kay.scene);
}
const hashes={kaykit:hash(kayBytes)};
for(const [name,file] of [['revolverStart','RevolverReloadInit'],['revolverLoad','RevolverReloadLoop'],['revolverEnd','RevolverReloadEnd'],['revolverAim','RevolverAimIdle'],['revolverShoot','RevolverAimShoot']]){
  sources[name]={...JSON.parse(await readFile(`${revolverPath}/${file}.json`)),kind:'revolver'};
  hashes[file]=hash(await readFile(`${revolverPath}/${file}.fbx`));
}
const kayMap={Torso:'spine',Chest:'chest',ShoulderR:'shoulderr',UpperArmR:'upperarmr',LowerArmR:'lowerarmr',WristR:'handr',ShoulderL:'shoulderl',UpperArmL:'upperarml',LowerArmL:'lowerarml',WristL:'handl'};
// The donor has an extra twist bone in each forearm. World rotations and actual
// elbow-to-hand directions include that twist without adding bones to our rig.
const revolverMap={Torso:'Spine1',Chest:'Spine3',ShoulderR:'R_Clavicle',UpperArmR:'R_Arm',LowerArmR:'R_Forearm',WristR:'R_Hand',ShoulderL:'L_Clavicle',UpperArmL:'L_Arm',LowerArmL:'L_Forearm',WristL:'L_Hand'};
// KayKit clavicles use shoulder names only on some exports. Keep their rest
// rotations when absent; the actual upper/lower arms are always transferred.
for(const side of ['R','L'])if(!kayRest[kayMap['Shoulder'+side]])delete kayMap['Shoulder'+side];
const bones=Object.keys(revolverMap),result={sampleRate:30,bones,sourceHashes:hashes,sources:{
  kaykit:{author:'Kay Lousberg / KayKit',license:'CC0-1.0',url:'https://kaylousberg.itch.io/kaykit-character-animations'},
  revolver:{author:'ZenXChaos',license:'Unlicense',url:'https://github.com/ZenXChaos/ThirdPersonShooter-AnimationSets'}},clips:{},rigs:{}};
const children={UpperArmR:'LowerArmR',LowerArmR:'WristR',UpperArmL:'LowerArmL',LowerArmL:'WristL'};
for(const sex of ['male','female']){
  const key=sex==='male'?'male-Casual_2':'female-Casual';
  const asset=await parse(gunzipSync(await readFile(new URL(catalog.characters[key].file,assets))));bind(asset.scene);
  const rest=snapshot(asset.scene),locals={};asset.scene.traverse(b=>{if(b.isBone)locals[b.name]=b.quaternion.clone();});
  result.rigs[sex]={};
  for(const [name,source] of Object.entries(sources)){
    const map=source.kind==='kaykit'?kayMap:revolverMap,frames=[];
    for(const frame of source.frames){
      asset.scene.traverse(b=>{if(b.isBone)b.quaternion.copy(locals[b.name]);});asset.scene.updateMatrixWorld(true);
      for(const [targetName,sourceName] of Object.entries(map)){
        const bone=asset.scene.getObjectByName(targetName);
        const desired=new Quaternion().fromArray(frame[sourceName].quaternion)
          .multiply(new Quaternion().fromArray(source.rest[sourceName].quaternion).invert())
          .multiply(new Quaternion().fromArray(rest[targetName].quaternion));
        bone.quaternion.copy(bone.parent.getWorldQuaternion(new Quaternion()).invert().multiply(desired));bone.updateMatrixWorld(true);
        const child=children[targetName];
        if(child){
          const p=bone.getWorldPosition(new Vector3());
          const from=asset.scene.getObjectByName(child).getWorldPosition(new Vector3()).sub(p).normalize();
          const to=new Vector3().fromArray(frame[map[child]].position).sub(new Vector3().fromArray(frame[sourceName].position)).normalize();
          const rotation=new Quaternion().setFromUnitVectors(from,to).multiply(bone.getWorldQuaternion(new Quaternion()));
          bone.quaternion.copy(bone.parent.getWorldQuaternion(new Quaternion()).invert().multiply(rotation));bone.updateMatrixWorld(true);
        }
      }
      frames.push(bones.flatMap(n=>asset.scene.getObjectByName(n).quaternion.toArray().map(v=>Number(v.toFixed(6)))));
    }
    result.rigs[sex][name]={frames};result.clips[name]={duration:source.duration,sourceClip:source.sourceClip,source:source.kind};
  }
}
await writeFile(new URL('weapon-animations.json',assets),JSON.stringify(result)+'\n');
console.log('Prepared reloads and dedicated revolver aiming/shooting for both original rigs.',result.clips);
