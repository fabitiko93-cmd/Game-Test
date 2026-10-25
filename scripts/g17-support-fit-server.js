import {createInterface} from 'node:readline';
import {writeFile} from 'node:fs/promises';
import {Vector3,Quaternion} from 'three';
import {authorSupportHand} from './g17-support-hand.js';
const hand=/^(Wrist|Index[1-4]|Middle[1-4]|Ring[1-4]|Pinky[1-4]|Thumb[1-3])([RL])$/;
export async function serveSupportFit(entity,{base,data,meshData,output}){
  const root=entity.root,gun=entity.weapon,byName=new Map();root.traverseVisible(m=>{if(m.isMesh)byName.set(m.name,m);});
  const meshes=data.meshes.map(m=>byName.get(m.name)),refs={R:[],L:[]},labels={R:[],L:[]},faces={R:[],L:[]};
  for(const side of ['R','L'])for(let mi=0;mi<meshes.length;mi++){
    const m=data.meshes[mi],lookup=new Map();
    for(let i=0;i<m.positions.length;i++)if(hand.test(m.boneNames[i]||'')&&m.boneNames[i].endsWith(side)){
      lookup.set(i,refs[side].length);refs[side].push({mesh:meshes[mi],i});labels[side].push(m.boneNames[i]);
    }
    for(const f of m.faces)if(f.every(i=>lookup.has(i)))faces[side].push(f.map(i=>lookup.get(i)));
  }
  const sample=side=>{
    root.updateMatrixWorld(true);for(const m of meshes)m.skeleton?.update();
    return refs[side].map(({mesh,i})=>gun.worldToLocal(mesh.getVertexPosition(i,new Vector3()).applyMatrix4(mesh.matrixWorld)).toArray());
  };
  const solids={};for(const name of ['Receiver','Slide']){
    const m=data.meshes.find(m=>m.name===name),p=m.positions.map(p=>gun.worldToLocal(new Vector3(...p)).toArray());solids[name]=m.faces.map(f=>f.map(i=>p[i]));
  }
  console.log(JSON.stringify({type:'init',faces,labels,points:{R:sample('R'),L:sample('L')},solids}));
  let pose=data.authoredLeft,metrics=data.contactMetrics.authoredLeft;
  const reader=createInterface({input:process.stdin,terminal:false});
  for await(const line of reader){try{
    const request=JSON.parse(line);
    if(request.mode==='pose'){
      for(const[b,q]of base)b.quaternion.copy(q);root.updateMatrixWorld(true);
      pose=request.pose;metrics=authorSupportHand(entity,pose);console.log(JSON.stringify({points:sample('L'),metrics}));
    }else if(request.mode==='save'){
      const joints={},boneRotations={};entity.model.traverse(b=>{if(b.isBone){joints[b.name]=b.getWorldPosition(new Vector3()).toArray();boneRotations[b.name]=b.quaternion.toArray();}});
      const localJoints=Object.fromEntries(Object.entries(joints).map(([n,p])=>[n,gun.worldToLocal(new Vector3(...p)).toArray()]));
      const rotations=Object.fromEntries(Object.entries(boneRotations).filter(([n])=>/^(Wrist|Thumb|Index|Middle|Ring|Pinky)/.test(n)));
      const file=output+'/male-both-hands-mesh.json';
      await writeFile(file,JSON.stringify({...data,authoredLeft:pose,meshes:meshData(entity),joints,localJoints,rotations,boneRotations,contactMetrics:{...data.contactMetrics,authoredLeft:metrics},weaponOrigin:gun.getWorldPosition(new Vector3()).toArray(),weaponQuaternion:gun.getWorldQuaternion(new Quaternion()).toArray()}));
      console.log(JSON.stringify({saved:file}));
    }else if(request.mode==='quit'){console.log(JSON.stringify({done:true}));break;}
    else throw Error('Unknown support-fit request');
  }catch(error){console.log(JSON.stringify({error:error.message}));}}
  reader.close();
}
