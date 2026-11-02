import {writeFile,mkdir} from 'node:fs/promises';
import {Vector3,Quaternion,Color} from 'three';
import {ithacaFixture} from '../tests/helpers/ithaca-fixture.mjs';

const output=process.argv[2];if(!output)throw Error('Provide an output directory');await mkdir(output,{recursive:true});
const results=[];
for(const sex of ['male','female']){
 const f=await ithacaFixture(sex),{entity:e,player:p}=f;
 for(const state of ['carry','aim','shot']){
  delete p.combat.shotImpulse;
  if(state==='shot')p.combat.shotImpulse={weaponId:e.weapon.userData.weaponId,age:0,power:1,side:1};
  f.pose({posture:state==='carry'?'carry':'aim'});
  e.root.updateMatrixWorld(true);
  const triangles=[],colours=[];
  e.root.traverseVisible(mesh=>{
   if(!mesh.isMesh)return;if(mesh.isSkinnedMesh)mesh.skeleton.update();
   const geo=mesh.geometry,positions=geo.getAttribute('position'),colors=geo.getAttribute('color'),indices=geo.index;
   const material=Array.isArray(mesh.material)?mesh.material[0]:mesh.material;
   const factor=material?.color||new Color(1,1,1);
   for(let i=0;i<(indices?.count||positions.count);i+=3){
    const face=[],col=[0,0,0];
    for(let k=0;k<3;k++){
     const j=indices?indices.getX(i+k):i+k;
     face.push(mesh.getVertexPosition(j,new Vector3()).applyMatrix4(mesh.matrixWorld).toArray());
     col[0]+=(colors?colors.getX(j):1)*factor.r/3;col[1]+=(colors?colors.getY(j):1)*factor.g/3;col[2]+=(colors?colors.getZ(j):1)*factor.b/3;
    }
    triangles.push(face);colours.push(col);
   }
  });
  const at=n=>e.model.getObjectByName(n).getWorldPosition(new Vector3());
  const forward=new Vector3(0,0,1).applyQuaternion(e.weapon.getWorldQuaternion(new Quaternion()));
  const wristBend=at('WristR').sub(at('LowerArmR')).angleTo(at('Middle2R').sub(at('WristR')))*180/Math.PI;
  const joints=Object.fromEntries(['Head','UpperArmR','LowerArmR','WristR','Middle2R','Index4R','WristL'].map(n=>[n,at(n).toArray()]));
  results.push({sex,state,triangles,colours,joints,forward:forward.toArray(),wristBend});
  console.log(JSON.stringify({sex,state,forward:forward.toArray(),wristBend,joints}));
 }
 f.replay.dispose();
}
await writeFile(output+'/stance-meshes.json',JSON.stringify(results));
