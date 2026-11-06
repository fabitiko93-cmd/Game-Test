// Bake Quaternius, KayKit and ZenXChaos weapon stances for the existing rigs.
// The approved weapon/finger profiles remain separate runtime inputs.
import {readFile,writeFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {AnimationMixer,Quaternion,Vector3} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
const [sourcePath,fbxDirectory,kayPath]=process.argv.slice(2);if(!sourcePath||!fbxDirectory||!kayPath)throw Error('Pass UAL1_Standard.glb, RevolverAimIdle samples directory and Rig_Medium_CombatRanged.glb');
const directory=new URL('../docs/assets/quaternius/',import.meta.url),catalog=JSON.parse(await readFile(new URL('models.json',directory)));
const parse=b=>new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');
const raw=await readFile(sourcePath),source=await parse(raw);
function bind(model){const skeletons=new Set();model.traverse(n=>{if(n.isSkinnedMesh)skeletons.add(n.skeleton);});for(const s of skeletons)s.pose();model.updateMatrixWorld(true);}
function snapshot(model){const out={};model.traverse(b=>{if(b.isBone)out[b.name]={local:b.quaternion.clone(),world:b.getWorldQuaternion(new Quaternion())};});return out;}
function orient(b,q){b.quaternion.copy(b.parent.getWorldQuaternion(new Quaternion()).invert().multiply(q));b.updateMatrixWorld(true);}
const map={Torso:'spine_02',Chest:'spine_03',Neck:'neck_01',Head:'Head',ShoulderR:'clavicle_r',UpperArmR:'upperarm_r',LowerArmR:'lowerarm_r',WristR:'hand_r',ShoulderL:'clavicle_l',UpperArmL:'upperarm_l',LowerArmL:'lowerarm_l',WristL:'hand_l'};
const children={UpperArmR:['LowerArmR','lowerarm_r'],LowerArmR:['WristR','hand_r'],UpperArmL:['LowerArmL','lowerarm_l'],LowerArmL:['WristL','hand_l']};
bind(source.scene);const rest=snapshot(source.scene),mixer=new AnimationMixer(source.scene),bones=Object.keys(map);
const result={version:1,bones,sampleRate:30,sources:{pistol:{author:'Quaternius / Gonzalo Furnier',license:'CC0-1.0',url:'https://quaternius.itch.io/universal-animation-library',sourceFile:'UAL1_Standard.glb',sha256:createHash('sha256').update(raw).digest('hex')},oneHand:{author:'Quaternius',license:'CC0-1.0',url:'https://quaternius.com/packs/ultimatemodularcharacters.html'}},rigs:{}};
for(const sex of ['male','female']){
 const key=sex==='male'?'male-Casual_2':'female-Casual',target=await parse(gunzipSync(await readFile(new URL(catalog.characters[key].file,directory))));bind(target.scene);const targetRest=snapshot(target.scene),rig={pistol:{},oneHand:{},revolver:{}};
 const reset=()=>{target.scene.traverse(b=>{if(b.isBone)b.quaternion.copy(targetRest[b.name].local);});target.scene.updateMatrixWorld(true);};
 for(const[kind,clips]of [['pistol',{carry:'Pistol_Idle_Loop',hip:'Pistol_Aim_Down',aim:'Pistol_Aim_Neutral'}],['oneHand',{carry:'Idle_Gun',hip:'Idle_Gun_Pointing',aim:'Idle_Gun_Pointing'}],['revolver',{carry:'Idle_Neutral'}]])for(const[name,sourceClip]of Object.entries(clips)){
  const original=(kind==='pistol'?source:target).animations.find(c=>c.name===sourceClip),mm=kind==='pistol'?mixer:new AnimationMixer(target.scene);mm.stopAllAction();const action=mm.clipAction(original).reset().play();const count=Math.max(1,Math.ceil(original.duration*30)),frames=[];
  for(let i=0;i<=count;i++){
   action.time=Math.min(original.duration-1e-6,original.duration*i/count);mm.update(0);
   if(kind==='pistol'){
    source.scene.updateMatrixWorld(true);reset();
    for(const[n,d]of Object.entries(map)){
     const b=target.scene.getObjectByName(n),s=source.scene.getObjectByName(d);orient(b,s.getWorldQuaternion(new Quaternion()).multiply(rest[d].world.clone().invert()).multiply(targetRest[n].world));
     if(children[n]){const[child,donor]=children[n],p=b.getWorldPosition(new Vector3()),from=target.scene.getObjectByName(child).getWorldPosition(new Vector3()).sub(p).normalize(),to=source.scene.getObjectByName(donor).getWorldPosition(new Vector3()).sub(s.getWorldPosition(new Vector3())).normalize();orient(b,new Quaternion().setFromUnitVectors(from,to).multiply(b.getWorldQuaternion(new Quaternion())));}
    }
    // Retarget the wrist relative to the already retargeted forearm. A world
    // quaternion copied after the arm-direction correction mixes rig axes.
    for(const side of ['R','L']){
     const w=target.scene.getObjectByName('Wrist'+side),s=source.scene.getObjectByName('hand_'+side.toLowerCase()),c=new Quaternion().setFromUnitVectors(s.position.clone().normalize(),w.position.clone().normalize()),delta=s.quaternion.clone().multiply(rest[s.name].local.clone().invert());
     w.quaternion.copy(c.clone().multiply(delta).multiply(c.clone().invert()).multiply(targetRest[w.name].local));w.updateMatrixWorld(true);
    }
   }else target.scene.updateMatrixWorld(true);
   frames.push(bones.flatMap(n=>target.scene.getObjectByName(n).quaternion.toArray().map(v=>+v.toFixed(8))));
  }
  rig[kind][name]={sourceClip,duration:original.duration,frames};mm.stopAllAction();
 }
 {
  const fm={Torso:'Spine1',Chest:'Spine3',Head:'Head',ShoulderR:'R_Clavicle',UpperArmR:'R_Arm',LowerArmR:'R_Forearm',WristR:'R_Hand',ShoulderL:'L_Clavicle',UpperArmL:'L_Arm',LowerArmL:'L_Forearm',WristL:'L_Hand'};
  const fc={UpperArmR:'LowerArmR',LowerArmR:'WristR',UpperArmL:'LowerArmL',LowerArmL:'WristL'};
  for(const file of ['RevolverAimIdle']){
   const donor=JSON.parse(await readFile(fbxDirectory+'/'+file+'.json','utf8')),frames=[];
   result.sources.revolver={author:'ZenXChaos',license:'Unlicense',url:'https://github.com/ZenXChaos/ThirdPersonShooter-AnimationSets',sourceFile:file+'.fbx',sha256:createHash('sha256').update(await readFile(fbxDirectory+'/'+file+'.fbx')).digest('hex')};
   const q=(f,n)=>new Quaternion().fromArray(f[n].quaternion),p=(f,n)=>new Vector3().fromArray(f[n].position);
   for(const frame of donor.frames){
    reset();
    for(const[n,d]of Object.entries(fm)){
     const b=target.scene.getObjectByName(n),desired=q(frame,d).multiply(q(donor.rest,d).invert()).multiply(targetRest[n].world);orient(b,desired);
     if(fc[n]){const cp=fc[n],from=target.scene.getObjectByName(cp).getWorldPosition(new Vector3()).sub(b.getWorldPosition(new Vector3())).normalize(),to=p(frame,fm[cp]).sub(p(frame,d)).normalize();orient(b,new Quaternion().setFromUnitVectors(from,to).multiply(b.getWorldQuaternion(new Quaternion())));}
    }
    for(const side of ['R','L']){
     const hand=fm['Wrist'+side],lower=fm['LowerArm'+side],w=target.scene.getObjectByName('Wrist'+side),joint=q(frame,lower).invert().multiply(q(frame,hand)),bindJoint=q(donor.rest,lower).invert().multiply(q(donor.rest,hand)),axis=p(donor.rest,hand).sub(p(donor.rest,lower)).applyQuaternion(q(donor.rest,lower).invert()).normalize(),c=new Quaternion().setFromUnitVectors(axis,w.position.clone().normalize());
     w.quaternion.copy(c.clone().multiply(joint.multiply(bindJoint.invert())).multiply(c.clone().invert()).multiply(targetRest[w.name].local));w.updateMatrixWorld(true);
    }
    frames.push(bones.flatMap(n=>target.scene.getObjectByName(n).quaternion.toArray().map(v=>+v.toFixed(8))));
   }
   rig.revolver.aim={sourceClip:file,duration:donor.duration,frames};rig.revolver.hip=rig.revolver.aim;
  }
 }
 {
  const bytes=await readFile(kayPath),kay=await parse(bytes);bind(kay.scene);const kr=snapshot(kay.scene),km=new AnimationMixer(kay.scene),original=kay.animations.find(c=>c.name==='Ranged_2H_Aiming'),action=km.clipAction(original).reset().play(),frames=[];
  result.sources.longGun={author:'Kay Lousberg / KayKit',license:'CC0-1.0',url:'https://kaylousberg.itch.io/kaykit-character-animations',sourceFile:'Rig_Medium_CombatRanged.glb',sha256:createHash('sha256').update(bytes).digest('hex')};
  const map={Torso:'spine',Chest:'chest',Neck:'neck',Head:'head',ShoulderR:'shoulderr',UpperArmR:'upperarmr',LowerArmR:'lowerarmr',WristR:'handr',ShoulderL:'shoulderl',UpperArmL:'upperarml',LowerArmL:'lowerarml',WristL:'handl'},children={UpperArmR:['LowerArmR','lowerarmr'],LowerArmR:['WristR','wristr'],UpperArmL:['LowerArmL','lowerarml'],LowerArmL:['WristL','wristl']};
  for(const n of Object.keys(map))if(!kr[map[n]])delete map[n];
  const from=Math.min(.32,original.duration*.5),duration=original.duration-from,count=Math.ceil(duration*30);
  for(let i=0;i<=count;i++){
   action.time=Math.min(original.duration-1e-6,from+duration*i/count);km.update(0);kay.scene.updateMatrixWorld(true);reset();
   for(const[n,d]of Object.entries(map)){
    const b=target.scene.getObjectByName(n),s=kay.scene.getObjectByName(d);orient(b,s.getWorldQuaternion(new Quaternion()).multiply(kr[d].world.clone().invert()).multiply(targetRest[n].world));
    if(children[n]){const[child,donor]=children[n],from=target.scene.getObjectByName(child).getWorldPosition(new Vector3()).sub(b.getWorldPosition(new Vector3())).normalize(),to=kay.scene.getObjectByName(donor).getWorldPosition(new Vector3()).sub(s.getWorldPosition(new Vector3())).normalize();orient(b,new Quaternion().setFromUnitVectors(from,to).multiply(b.getWorldQuaternion(new Quaternion())));}
   }
   for(const side of ['R','L']){
    const lower='lowerarm'+side.toLowerCase(),hand='hand'+side.toLowerCase(),wrist='wrist'+side.toLowerCase(),w=target.scene.getObjectByName('Wrist'+side),joint=kay.scene.getObjectByName(lower).getWorldQuaternion(new Quaternion()).invert().multiply(kay.scene.getObjectByName(hand).getWorldQuaternion(new Quaternion())),restJoint=kr[lower].world.clone().invert().multiply(kr[hand].world);
    const axis=kay.scene.getObjectByName(wrist).position.clone().normalize(),c=new Quaternion().setFromUnitVectors(axis,w.position.clone().normalize());
    w.quaternion.copy(c.clone().multiply(joint.multiply(restJoint.invert())).multiply(c.clone().invert()).multiply(targetRest[w.name].local));w.updateMatrixWorld(true);
   }
   frames.push(bones.flatMap(n=>target.scene.getObjectByName(n).quaternion.toArray().map(v=>+v.toFixed(8))));
  }
  rig.longGun={aim:{sourceClip:original.name,duration,frames}};rig.longGun.carry=rig.longGun.aim;rig.longGun.hip=rig.longGun.aim;km.stopAllAction();
 }
 result.rigs[sex]=rig;
}
await writeFile(new URL('stance-kit.json',directory),JSON.stringify(result)+'\n');console.log('Baked all weapon kit stances for both original rigs');
