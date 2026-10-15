// Bake the CC0 Universal Animation Library's crouch clips onto the older modular
// rig. Its feet are independent root children, so rotation-only retargeting would
// disconnect the shoes from the legs. Bake their positions from the posed shins.
import { readFile,writeFile,readdir,unlink } from 'node:fs/promises';
import { gzipSync,gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { AnimationMixer,Box3,Quaternion,Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const sourcePath=process.argv[2];if(!sourcePath)throw Error('Usage: node scripts/prepare-player-animations.mjs /path/to/UAL1_Standard.glb');
const directory=new URL('../docs/assets/quaternius/',import.meta.url),metadata=JSON.parse(await readFile(new URL('models.json',directory)));
const sourceBytes=await readFile(sourcePath),targetBytes=gunzipSync(await readFile(new URL(metadata.characters['male-Casual_2'].file,directory)));
const parse=bytes=>new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
const source=await parse(sourceBytes),target=await parse(targetBytes);
for(const asset of [source,target]){let skeleton;asset.scene.traverse(o=>{if(o.isSkinnedMesh&&!skeleton)skeleton=o.skeleton;});skeleton.pose();asset.scene.updateMatrixWorld(true);}
const map={Body:'pelvis',Hips:'pelvis',Abdomen:'spine_01',Torso:'spine_02',Chest:'spine_03',Neck:'neck_01',Head:'Head'};
for(const side of ['L','R']){
 const suffix=side.toLowerCase();
 for(const [a,b] of Object.entries({Shoulder:'clavicle',UpperArm:'upperarm',LowerArm:'lowerarm',Wrist:'hand',UpperLeg:'thigh',LowerLeg:'calf',Foot:'foot'}))map[a+side]=`${b}_${suffix}`;
 for(const finger of ['Index','Middle','Ring','Pinky','Thumb'])for(let i=1;i<=(finger==='Thumb'?3:4);i++)map[`${finger}${i}${side}`]=`${finger.toLowerCase()}_0${i}${i===4?'_leaf':''}_${suffix}`;
}
const bones=[];target.scene.traverse(o=>{if(o.isBone)bones.push(o);});
const rest=new Map(bones.map(b=>[b.name,{position:b.position.clone(),rotation:b.quaternion.clone(),world:b.getWorldQuaternion(new Quaternion()),point:b.getWorldPosition(new Vector3())}]));
const sourceRest=new Map(Object.values(map).map(name=>{const b=source.scene.getObjectByName(name);if(!b)throw Error('Missing source bone '+name);return[name,{rotation:b.getWorldQuaternion(new Quaternion()),point:b.getWorldPosition(new Vector3())}];}));
const body=target.scene.getObjectByName('Body'),root=target.scene.getObjectByName('Root');
const scale=rest.get('Body').point.y/sourceRest.get('pelvis').point.y;
const mixer=new AnimationMixer(source.scene),clips=[];
for(const [name,original] of [['Crouch_Walk','Crouch_Fwd_Loop'],['Crouch_Idle','Crouch_Idle_Loop']]){
 const authored=source.animations.find(a=>a.name===original);if(!authored)throw Error('Missing clip '+original);
 mixer.stopAllAction();const action=mixer.clipAction(authored);action.play();
 const samples=Math.ceil(authored.duration*30),times=Array.from({length:samples+1},(_,i)=>authored.duration*i/samples);
 const rotations=new Map(bones.map(b=>[b.name,[]])),positions=new Map(['Root','Body','FootL','FootR'].map(n=>[n,[]]));
 let stride=0,lastFeet;
 for(const time of times){
  action.time=Math.min(time,authored.duration-1e-6);mixer.update(0);source.scene.updateMatrixWorld(true);
  for(const b of bones){const r=rest.get(b.name);b.position.copy(r.position);b.quaternion.copy(r.rotation);}target.scene.updateMatrixWorld(true);
  const pelvis=source.scene.getObjectByName('pelvis').getWorldPosition(new Vector3()).sub(sourceRest.get('pelvis').point).multiplyScalar(scale).add(rest.get('Body').point);
  body.position.copy(body.parent.worldToLocal(pelvis));target.scene.updateMatrixWorld(true);
  for(const b of bones){
   const mapped=map[b.name];if(!mapped)continue;
   const desired=source.scene.getObjectByName(mapped).getWorldQuaternion(new Quaternion()).multiply(sourceRest.get(mapped).rotation.clone().invert()).multiply(rest.get(b.name).world);
   b.quaternion.copy(b.parent.getWorldQuaternion(new Quaternion()).invert().multiply(desired));b.updateMatrixWorld(true);
  }
  for(const side of ['L','R']){
   const foot=target.scene.getObjectByName('Foot'+side),shin=target.scene.getObjectByName('LowerLeg'+side);
   const offset=rest.get(foot.name).point.clone().sub(rest.get(shin.name).point);
   offset.applyQuaternion(shin.getWorldQuaternion(new Quaternion()).multiply(rest.get(shin.name).world.clone().invert()));
   foot.position.copy(foot.parent.worldToLocal(shin.getWorldPosition(new Vector3()).add(offset)));foot.updateMatrixWorld(true);
  }
  // Ground the lowest sole, retaining authored foot lifts and the pelvis motion.
  const sole=new Box3().setFromObject(target.scene.getObjectByName(metadata.characters['male-Casual_2'].parts.feet),true).min.y;
  root.position.y-=sole;target.scene.updateMatrixWorld(true);
  for(const b of bones){rotations.get(b.name).push(...b.quaternion.toArray());if(positions.has(b.name))positions.get(b.name).push(...b.position.toArray());}
  const feet=['FootL','FootR'].map(n=>target.scene.getObjectByName(n).getWorldPosition(new Vector3()).z-body.getWorldPosition(new Vector3()).z);
  if(lastFeet)for(let i=0;i<2;i++)stride+=Math.max(0,lastFeet[i]-feet[i]);lastFeet=feet;
 }
 clips.push({name,original,duration:authored.duration,times,rotations,positions,distance:name==='Crouch_Walk'?stride:undefined});
 console.log(name,'duration',authored.duration,'stride',stride);
}

const armature=target.scene.getObjectByName('CharacterArmature'),objects=[armature,...bones],ids=new Map(objects.map((b,i)=>[b,i]));
const doc={asset:{version:'2.0',generator:'SPERRKREIS 98 CC0 animation retargeter'},scene:0,scenes:[{nodes:[0]}],nodes:objects.map(o=>({name:o.name,
 translation:(rest.get(o.name)?.position||o.position).toArray(),rotation:(rest.get(o.name)?.rotation||o.quaternion).toArray(),scale:o.scale.toArray(),children:o.children.filter(c=>ids.has(c)).map(c=>ids.get(c))})),animations:[],bufferViews:[],accessors:[]};
const blocks=[];let length=0;
function accessor(values,type){const data=Buffer.from(new Float32Array(values).buffer),view=doc.bufferViews.length;doc.bufferViews.push({buffer:0,byteOffset:length,byteLength:data.length});blocks.push(data);length+=data.length;const a={bufferView:view,componentType:5126,count:values.length/({SCALAR:1,VEC3:3,VEC4:4}[type]),type};if(type==='SCALAR'){a.min=[0];a.max=[values.at(-1)];}doc.accessors.push(a);return doc.accessors.length-1;}
for(const clip of clips){const animation={name:clip.name,samplers:[],channels:[]},input=accessor(clip.times,'SCALAR');
 for(const [path,tracks] of [['rotation',clip.rotations],['translation',clip.positions]])for(const [name,values] of tracks){const sampler=animation.samplers.length;animation.samplers.push({input,output:accessor(values,path==='rotation'?'VEC4':'VEC3'),interpolation:'LINEAR'});animation.channels.push({sampler,target:{node:ids.get(target.scene.getObjectByName(name)),path}});}
 doc.animations.push(animation);
}
doc.buffers=[{byteLength:length}];let json=Buffer.from(JSON.stringify(doc));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);const binary=Buffer.concat(blocks),header=Buffer.alloc(12),a=Buffer.alloc(8),b=Buffer.alloc(8);header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+binary.length,8);a.writeUInt32LE(json.length);a.writeUInt32LE(0x4e4f534a,4);b.writeUInt32LE(binary.length);b.writeUInt32LE(0x004e4942,4);
const compressed=gzipSync(Buffer.concat([header,a,json,b,binary]),{level:9}),file=`player-crouch-${createHash('sha256').update(compressed).digest('hex').slice(0,12)}.glb.gz`;
await writeFile(new URL(file,directory),compressed);
await writeFile(new URL('player-animations.json',directory),JSON.stringify({file,author:'Quaternius',license:'CC0-1.0',source:'https://quaternius.itch.io/universal-animation-library',sourceFile:'Unreal-Godot/UAL1_Standard.glb',sourceSha256:createHash('sha256').update(sourceBytes).digest('hex'),sampleRate:30,clips:Object.fromEntries(clips.map(c=>[c.name,{sourceClip:c.original,duration:c.duration,...(c.distance?{distance:c.distance}:{})}]))},null,2)+'\n');
for(const old of await readdir(directory))if(old.startsWith('player-crouch-')&&old.endsWith('.glb.gz')&&old!==file)await unlink(new URL(old,directory));
