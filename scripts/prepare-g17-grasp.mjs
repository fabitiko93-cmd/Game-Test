// Convert the approved static grasp into rig-aware runtime calibration only.
// Usage: node scripts/prepare-g17-grasp.mjs REVIEW10_MESH [SHOULDER_BINDING]
import {readFile,writeFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {Matrix4,Quaternion,Vector3} from 'three';
import {QUATERNIUS_MODELS,playerModelScale,playerModelAppearance} from '../docs/src/quaternius-catalog.js';
import {createPlayer} from '../docs/src/character.js';
import {orientWorld} from '../docs/src/weapon-ik.js';

const source=await readFile(process.argv[2],'utf8'),reference=JSON.parse(source);
const finger=/^(Index|Middle|Ring|Pinky|Thumb).*([RL])$/;
const scenes={},bind={};
for(const sex of ['male','female']){
  const key=sex==='male'?'male-Casual_2':'female-Casual',file=QUATERNIUS_MODELS.characters[key].file;
  const bytes=gunzipSync(await readFile(new URL('../docs/assets/quaternius/'+file,import.meta.url)));
  const model=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;
  model.updateMatrixWorld(true);scenes[sex]=model;bind[sex]={};
  model.traverse(b=>{if(b.isBone)bind[sex][b.name]=b.getWorldQuaternion(new Quaternion()).normalize();});
}
for(const [name,q]of Object.entries(reference.boneRotations))scenes.male.getObjectByName(name)?.quaternion.fromArray(q);
scenes.male.updateMatrixWorld(true);
const result={version:1,sourceReview:10,sourceCommit:'cd523c4c36cfd5114b8bc4f2b7d9483808bf28cf',sourceSha256:createHash('sha256').update(source).digest('hex'),
  rightPalm:reference.authoredRight.palm,leftPalm:reference.authoredLeft.palm,
  weaponYaw:17.292024100568522*Math.PI/180,shoulderProtraction:15*Math.PI/180,rigs:{}};
const gunQ=new Quaternion().fromArray(reference.weaponQuaternion).normalize();
for(const sex of ['male','female']){
  const model=scenes[sex],rig={fingers:{},handFrames:{}};
  const upperRest=scenes.male.getObjectByName('ShoulderR').getWorldQuaternion(new Quaternion()).normalize().multiply(bind.male.ShoulderR.clone().invert()).multiply(bind.male.UpperArmR);
  rig.upperFrame=upperRest.multiply(bind.male.UpperArmR.clone().invert()).multiply(bind[sex].UpperArmR).normalize().toArray();
  for(const side of ['R','L']){
    const wrist='Wrist'+side,maleWrist=scenes.male.getObjectByName(wrist).getWorldQuaternion(new Quaternion()).normalize();
    const axisCorrection=bind.male[wrist].clone().invert().multiply(bind[sex][wrist]);
    rig.handFrames[side]=gunQ.clone().invert().multiply(maleWrist).multiply(axisCorrection).normalize().toArray();
    const names=Object.keys(reference.boneRotations).filter(n=>finger.test(n)&&n.endsWith(side));
    for(const name of names){
      if(sex==='male'){rig.fingers[name]=reference.boneRotations[name];continue;}
      const bindRelative=bind.male[wrist].clone().invert().multiply(bind.male[name]);
      const posedRelative=maleWrist.clone().invert().multiply(scenes.male.getObjectByName(name).getWorldQuaternion(new Quaternion()).normalize());
      const deformation=posedRelative.multiply(bindRelative.invert());
      const targetRelative=bind[sex][wrist].clone().invert().multiply(bind[sex][name]);
      const target=bind[sex][wrist].clone().multiply(axisCorrection.clone().invert()).multiply(deformation).multiply(axisCorrection).multiply(targetRelative);
      orientWorld(model.getObjectByName(name),target);model.updateMatrixWorld(true);
      rig.fingers[name]=model.getObjectByName(name).quaternion.normalize().toArray();
    }
  }
  result.rigs[sex]=rig;
}
const scale=playerModelScale({sex:'male'}),appearance=playerModelAppearance(createPlayer({appearance:{sex:'male'}}));
const ground=(QUATERNIUS_MODELS.characters[appearance.feet].groundOffset-.016)*scale;
const p=n=>new Vector3(...reference.joints[n]);
result.aimHeadOffset=new Vector3(...reference.weaponOrigin).sub(p('Head')).divideScalar(scale).toArray();
result.aimRightPoleOffset=new Vector3(-.23,1.20,.26).sub(p('UpperArmR').sub(new Vector3(0,ground,0)).divideScalar(scale)).toArray();
result.aimLeftPoleOffset=p('LowerArmL').sub(p('UpperArmL')).divideScalar(scale).toArray();
result.elbowFlex=p('LowerArmR').sub(p('UpperArmR')).angleTo(p('WristR').sub(p('LowerArmR')));
result.reference={scale,head:reference.joints.Head,weapon:reference.weaponOrigin,joints:Object.fromEntries(['ShoulderR','UpperArmR','LowerArmR','WristR','ShoulderL','UpperArmL','LowerArmL','WristL'].map(n=>[n,p(n).sub(p('Head')).divideScalar(scale).toArray()]))};
await writeFile(new URL('../docs/assets/weapons/g17-grasp.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
if(process.argv[3]){
  const binding=JSON.parse(await readFile(process.argv[3],'utf8'));
  const mesh=reference.meshes.find(m=>m.name===binding.meshName),handVertices={},shoulderVertices={},shoulderAimCorrections={};
  const inverse=gunQ.clone().invert(),head=p('Head');
  for(let i=0;i<mesh.positions.length;i++){
    const names=[];for(let k=0;k<4;k++)if(binding.skinWeight[i*4+k]>1e-7)names.push(binding.boneNames[binding.skinIndex[i*4+k]]);
    if(names.length&&names.every(n=>/^(Wrist|Index|Middle|Ring|Pinky|Thumb).*[RL]$/.test(n)))handVertices[i]=new Vector3(...mesh.positions[i]).sub(new Vector3(...reference.weaponOrigin)).applyQuaternion(inverse).toArray().map(v=>Number(v.toFixed(8)));
    if(['ShoulderR','UpperArmR'].includes(mesh.boneNames[i])){
      shoulderVertices[i]=new Vector3(...mesh.positions[i]).sub(head).divideScalar(scale).toArray().map(v=>Number(v.toFixed(8)));
      // Two lower seam vertices also carry Body weight. Legs/Body stay on
      // their original heading when the spine turns. Derive their skinning
      // correction from the original review binding, never runtime output.
      const correction=new Vector3();
      for(let k=0;k<4;k++){
        const index=binding.skinIndex[i*4+k],weight=binding.skinWeight[i*4+k];
        if(!weight||binding.boneNames[index]!=='Body')continue;
        const offset=new Vector3().fromArray(binding.positions,i*3)
          .applyMatrix4(new Matrix4().fromArray(binding.bindMatrix))
          .applyMatrix4(new Matrix4().fromArray(binding.boneMatrices,index*16))
          .applyMatrix4(new Matrix4().fromArray(binding.bindMatrixInverse))
          .applyMatrix4(new Matrix4().fromArray(binding.matrixWorld)).sub(p('Hips'));
        correction.add(offset.clone().applyAxisAngle(new Vector3(0,1,0),result.weaponYaw).sub(offset).multiplyScalar(weight/scale));
      }
      if(correction.length()>1e-8)shoulderAimCorrections[i]=correction.toArray().map(v=>Number(v.toFixed(8)));
    }
  }
  await writeFile(new URL('../tests/fixtures/g17-approved-review10.json',import.meta.url),JSON.stringify({review:10,sourceCommit:result.sourceCommit,sourceSha256:result.sourceSha256,mesh:binding.meshName,handVertices,shoulderVertices,shoulderAimCorrections})+'\n');
}
console.log('Exported approved review-10 G17 grasp for both original rigs.');
