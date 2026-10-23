import {Skeleton,Vector3} from 'three';
import {makeBareTorso} from './character-body.js';
import {makeBareLegs} from './character-legs.js';

const SKIN='Skin';
export const headwearMaterial=(name,source)=>source?.endsWith('Worker')?name==='Worker_Yellow':source?.endsWith('Swat')?/^(Swat.*|Visor)$/.test(name):['Beige','Red'].includes(name);

function underwear(part,slot,sex,waist) {
  if(slot==='torso'){makeBareTorso(part,sex,waist);return;}
  if(slot==='legs'){makeBareLegs(part,sex);return;}
  const meshes=[];part.traverse(mesh=>{if(mesh.isSkinnedMesh)meshes.push(mesh);});
  for(const mesh of meshes){
    const name=mesh.material.name;
    if(slot==='feet'){if(name!==SKIN)mesh.removeFromParent();continue;}
  }
}

function targetInverses(model) {
  let skeleton;model.traverse(mesh=>{if(!skeleton&&mesh.isSkinnedMesh)skeleton=mesh.skeleton;});
  return new Map(skeleton.bones.map((bone,i)=>[bone.name,skeleton.boneInverses[i]]));
}

export function rebindPart(original,model,{sourceSex,targetSex,bare=false,slot,headwear=false,sourceKey,coverHair=false,waist}={}) {
  const part=original.clone(true);
  if(headwear){const remove=[];part.traverse(mesh=>{if(mesh.isMesh&&!headwearMaterial(mesh.material.name,sourceKey))remove.push(mesh);});for(const mesh of remove)mesh.removeFromParent();}
  if(coverHair){
    const remove=[];part.traverse(mesh=>{
      if(!mesh.isMesh||['Skin','Eye','Eyebrows'].includes(mesh.material.name))return;
      const positions=mesh.geometry.attributes.position;
      for(let i=0;i<positions.count;i++)if(new Vector3().fromBufferAttribute(positions,i).applyMatrix4(mesh.bindMatrix).y>1.76){remove.push(mesh);break;}
    });for(const mesh of remove)mesh.removeFromParent();
  }
  if(bare)underwear(part,slot,targetSex,waist);
  const target=sourceSex&&sourceSex!==targetSex?targetInverses(model):null;
  part.traverse(mesh=>{
    if(!mesh.isSkinnedMesh)return;
    const source=mesh.skeleton,inverses=target?source.bones.map(b=>target.get(b.name).clone()):source.boneInverses;
    if(target){
      const previous=mesh.geometry,geometry=previous.clone(),positions=geometry.attributes.position,weights=geometry.attributes.skinWeight,joints=geometry.attributes.skinIndex;
      // Both packs use world-aligned T-pose meshes but different local bone
      // axes. Fit joint positions, not those axes: rotating the garment by the
      // frame difference would pinch thighs and twist collars in the rest pose.
      const offsets=source.bones.map((_,i)=>new Vector3().setFromMatrixPosition(inverses[i].clone().invert()).sub(new Vector3().setFromMatrixPosition(source.boneInverses[i].clone().invert())));
      const bindInverse=mesh.bindMatrix.clone().invert();
      for(let i=0;i<positions.count;i++){
        const p=new Vector3().fromBufferAttribute(positions,i).applyMatrix4(mesh.bindMatrix),fitted=p.clone();
        for(let k=0;k<4;k++){const w=weights.getComponent(i,k);if(w)fitted.addScaledVector(offsets[joints.getComponent(i,k)],w);}
        positions.setXYZ(i,...fitted.applyMatrix4(bindInverse).toArray());
      }
      geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();geometry.userData.clothingOwned=true;
      mesh.geometry=geometry;if(previous.userData.clothingOwned)previous.dispose();
    }
    mesh.bind(new Skeleton(source.bones.map(b=>model.getObjectByName(b.name)),inverses),mesh.bindMatrix.clone());mesh.frustumCulled=false;
  });
  return part;
}

export function disposeClothing(root) {
  const geometries=new Set(),materials=new Set();root.traverse(mesh=>{
    if(mesh.geometry?.userData.clothingOwned)geometries.add(mesh.geometry);
    if(mesh.material?.userData.clothingOwned)materials.add(mesh.material);
  });
  for(const geometry of geometries)geometry.dispose();for(const material of materials)material.dispose();
}
