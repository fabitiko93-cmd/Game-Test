import {createInterface} from 'node:readline';
import {writeFile} from 'node:fs/promises';
import {Vector3,Quaternion} from 'three';
import {authorFiringHand} from './g17-firing-hand.js';

export async function serveFiringHand(entity,{base,data,meshData,output}){
  const root=entity.root,gun=entity.weapon;root.attach(gun);root.updateMatrixWorld(true);
  const gunPosition=gun.position.clone(),gunRotation=gun.quaternion.clone(),gunScale=gun.scale.clone();
  const byName=new Map();root.traverseVisible(m=>{if(m.isMesh){if(byName.has(m.name))throw Error('Ambiguous mesh: '+m.name);byName.set(m.name,m);}});
  const visible=data.meshes.map(m=>{const mesh=byName.get(m.name);if(!mesh||mesh.geometry.attributes.position.count!==m.positions.length)throw Error('Mesh mismatch: '+m.name);return mesh;});
  const refs=[],labels=[],faces=[];
  for(let mi=0;mi<visible.length;mi++){
    const mesh=data.meshes[mi],lookup=new Map();
    for(let i=0;i<mesh.positions.length;i++)if(/^(Wrist|Index[1-4]|Middle[1-4]|Ring[1-4]|Pinky[1-4]|Thumb[1-3])R$/.test(mesh.boneNames[i]||'')){
      lookup.set(i,refs.length);refs.push({mesh:visible[mi],i});labels.push(mesh.boneNames[i]);
    }
    for(const f of mesh.faces)if(f.every(i=>lookup.has(i)))faces.push(f.map(i=>lookup.get(i)));
  }
  const sample=()=>{
    root.updateMatrixWorld(true);for(const m of visible)m.skeleton?.update();
    return refs.map(({mesh,i})=>gun.worldToLocal(mesh.getVertexPosition(i,new Vector3()).applyMatrix4(mesh.matrixWorld)).toArray());
  };
  const receiver=data.meshes.find(m=>m.name==='Receiver'),receiverPoints=receiver.positions.map(p=>gun.worldToLocal(new Vector3(...p)).toArray());
  console.log(JSON.stringify({type:'init',labels,faces,receiver:receiver.faces.map(f=>f.map(i=>receiverPoints[i]))}));
  let pose=data.authoredRight,metrics=null;
  const reader=createInterface({input:process.stdin,terminal:false});
  for await(const line of reader){
    try{
      const request=JSON.parse(line);
      if(request.mode==='pose'){
        gun.position.copy(gunPosition);gun.quaternion.copy(gunRotation);gun.scale.copy(gunScale);
        for(const[b,q]of base)b.quaternion.copy(q);root.updateMatrixWorld(true);
        pose=request.pose;metrics=authorFiringHand(entity,pose);console.log(JSON.stringify({points:sample(),metrics}));
      }else if(request.mode==='save'){
        const joints={};entity.model.traverse(b=>{if(b.isBone)joints[b.name]=b.getWorldPosition(new Vector3()).toArray();});
        const localJoints=Object.fromEntries(Object.entries(joints).map(([n,p])=>[n,gun.worldToLocal(new Vector3(...p)).toArray()]));
        const boneRotations=Object.fromEntries([...base.keys()].map(b=>[b.name,b.quaternion.toArray()]));
        const file=`${output}/male-firing-hand-mesh.json`;
        const rotations=Object.fromEntries(Object.entries(boneRotations).filter(([n])=>/^(Wrist|Thumb|Index|Middle|Ring|Pinky)/.test(n)));
        await writeFile(file,JSON.stringify({...data,authoredRight:pose,meshes:meshData(entity),joints,localJoints,rotations,boneRotations,contactMetrics:{authoredRight:metrics},weaponOrigin:gun.getWorldPosition(new Vector3()).toArray(),weaponQuaternion:gun.getWorldQuaternion(new Quaternion()).toArray()}));
        console.log(JSON.stringify({saved:file}));
      }else if(request.mode==='quit'){console.log(JSON.stringify({done:true}));break;}
      else throw Error('Unknown request');
    }catch(error){console.log(JSON.stringify({error:error.message}));}
  }
  reader.close();
}
