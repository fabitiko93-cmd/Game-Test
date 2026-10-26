// Offline calibration data only; this module is never imported by game code.
import {createHash} from 'node:crypto';
import {Vector3} from 'three';

export function geometryFingerprint(geometry){
  const a=geometry.attributes;
  const raw={positions:Array.from(a.position.array),normals:Array.from(a.normal.array),indices:Array.from(geometry.index.array),
    skinIndex:Array.from(a.skinIndex.array),skinWeight:Array.from(a.skinWeight.array)};
  return createHash('sha256').update(JSON.stringify(raw)).digest('hex');
}

export function shoulderBinding(entity){
  entity.root.updateMatrixWorld(true);
  let mesh;
  entity.root.traverseVisible(m=>{if(m.name==='BareTorso'&&m.isSkinnedMesh)mesh=m;});
  if(!mesh)throw Error('Expected the original bare torso instance');
  mesh.skeleton.update();
  const g=mesh.geometry,a=g.attributes;
  const raw={positions:Array.from(a.position.array),normals:Array.from(a.normal.array),
    indices:Array.from(g.index.array),skinIndex:Array.from(a.skinIndex.array),skinWeight:Array.from(a.skinWeight.array)};
  return{format:'sperrkreis-shoulder-binding',version:1,meshName:mesh.name,
    geometrySha256:geometryFingerprint(g),...raw,
    boneNames:mesh.skeleton.bones.map(b=>b.name),boneMatrices:Array.from(mesh.skeleton.boneMatrices),
    bindMatrix:mesh.bindMatrix.toArray(),bindMatrixInverse:mesh.bindMatrixInverse.toArray(),matrixWorld:mesh.matrixWorld.toArray(),
    bindJoints:Object.fromEntries(mesh.skeleton.bones.map((b,i)=>[b.name,new Vector3().setFromMatrixPosition(mesh.skeleton.boneInverses[i].clone().invert()).toArray()])),
  };
}
