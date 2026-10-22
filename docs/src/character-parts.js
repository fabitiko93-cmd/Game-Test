import { BufferGeometry, Float32BufferAttribute, Skeleton, Uint16BufferAttribute, Vector3 } from 'three';
import {makeBareTorso} from './character-body.js';

const SKIN='Skin',UNDERWEAR=0x343945;
export const headwearMaterial=(name,source)=>source?.endsWith('Worker')?name==='Worker_Yellow':source?.endsWith('Swat')?/^(Swat.*|Visor)$/.test(name):['Beige','Red'].includes(name);

function material(mesh,color,name) {
  const result=mesh.material.clone();
  if(color?.isColor)result.color.copy(color);else result.color.setHex(color);
  result.name=name;result.userData.clothingOwned=true;return result;
}

// Split triangles at an exact clothing hem. Newly introduced vertices preserve
// their interpolated skin weights, so the hem follows the same authored rig.
function region(mesh,height,above) {
  const input=mesh.geometry,index=input.index,attributes=input.attributes,out={position:[],skinIndex:[],skinWeight:[]};
  const vertex=i=>({p:new Vector3().fromBufferAttribute(attributes.position,i),weights:new Map(Array.from({length:4},(_,k)=>[attributes.skinIndex.getComponent(i,k),attributes.skinWeight.getComponent(i,k)]).filter(([,w])=>w>0))});
  const y=v=>v.p.clone().applyMatrix4(mesh.bindMatrix).y;
  const interpolate=(a,b,t)=>{
    const weights=new Map();for(const [i,w] of a.weights)weights.set(i,w*(1-t));
    for(const [i,w] of b.weights)weights.set(i,(weights.get(i)||0)+w*t);
    return {p:a.p.clone().lerp(b.p,t),weights};
  };
  const emit=v=>{
    out.position.push(...v.p.toArray());
    const weights=[...v.weights].sort((a,b)=>b[1]-a[1]).slice(0,4),total=weights.reduce((s,[,w])=>s+w,0);
    for(let k=0;k<4;k++){out.skinIndex.push(weights[k]?.[0]||0);out.skinWeight.push((weights[k]?.[1]||0)/total);}
  };
  const count=index?.count||attributes.position.count;
  for(let i=0;i<count;i+=3){
    const triangle=[0,1,2].map(k=>vertex(index?index.getX(i+k):i+k)),polygon=[];
    for(let k=0;k<3;k++){
      const a=triangle[k],b=triangle[(k+1)%3],ya=y(a),yb=y(b),insideA=above?ya>=height:ya<=height,insideB=above?yb>=height:yb<=height;
      if(insideA)polygon.push(a);
      if(insideA!==insideB)polygon.push(interpolate(a,b,(height-ya)/(yb-ya)));
    }
    for(let k=1;k<polygon.length-1;k++){emit(polygon[0]);emit(polygon[k]);emit(polygon[k+1]);}
  }
  const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(out.position,3));
  geometry.setAttribute('skinIndex',new Uint16BufferAttribute(out.skinIndex,4));geometry.setAttribute('skinWeight',new Float32BufferAttribute(out.skinWeight,4));
  geometry.computeVertexNormals();geometry.userData.clothingOwned=true;return geometry;
}

function underwear(part,slot,sex) {
  if(slot==='torso'){makeBareTorso(part,sex);return;}
  let skin;part.traverse(mesh=>{if(mesh.isMesh&&mesh.material.name===SKIN)skin=mesh.material.color;});
  const meshes=[];part.traverse(mesh=>{if(mesh.isSkinnedMesh)meshes.push(mesh);});
  for(const mesh of meshes){
    const name=mesh.material.name;
    if(slot==='feet'){if(name!==SKIN)mesh.removeFromParent();continue;}
    if(name===SKIN)continue;
    if(slot==='legs'){
      // Convert the original beach shorts to close-fitting boxer briefs and
      // skin below their hem, retaining the original hips/knees and seams.
      const geometry=mesh.geometry.clone(),positions=geometry.attributes.position,inverse=mesh.bindMatrix.clone().invert();
      for(let i=0;i<positions.count;i++){
        const p=new Vector3().fromBufferAttribute(positions,i).applyMatrix4(mesh.bindMatrix);
        const side=p.x<0?-1:1,axis=side*.12059,fit=1-.22*Math.min(1,Math.max(0,(1.02-p.y)/.18));
        p.x=axis+(p.x-axis)*fit;p.z=.066+(p.z-.066)*fit;
        positions.setXYZ(i,...p.applyMatrix4(inverse).toArray());
      }
      geometry.computeVertexNormals();geometry.userData.clothingOwned=true;mesh.geometry=geometry;
      const briefs=mesh.clone();briefs.geometry=region(mesh,.9,true);briefs.material=material(mesh,UNDERWEAR,'Underwear');mesh.parent.add(briefs);
      mesh.geometry=region(mesh,.9,false);geometry.dispose();mesh.material=material(mesh,skin,'Bare skin');
    }
  }
}

function targetInverses(model) {
  let skeleton;model.traverse(mesh=>{if(!skeleton&&mesh.isSkinnedMesh)skeleton=mesh.skeleton;});
  return new Map(skeleton.bones.map((bone,i)=>[bone.name,skeleton.boneInverses[i]]));
}

export function rebindPart(original,model,{sourceSex,targetSex,bare=false,slot,headwear=false,sourceKey,coverHair=false}={}) {
  const part=original.clone(true);
  if(headwear){const remove=[];part.traverse(mesh=>{if(mesh.isMesh&&!headwearMaterial(mesh.material.name,sourceKey))remove.push(mesh);});for(const mesh of remove)mesh.removeFromParent();}
  if(coverHair){
    const remove=[];part.traverse(mesh=>{
      if(!mesh.isMesh||['Skin','Eye','Eyebrows'].includes(mesh.material.name))return;
      const positions=mesh.geometry.attributes.position;
      for(let i=0;i<positions.count;i++)if(new Vector3().fromBufferAttribute(positions,i).applyMatrix4(mesh.bindMatrix).y>1.76){remove.push(mesh);break;}
    });for(const mesh of remove)mesh.removeFromParent();
  }
  if(bare)underwear(part,slot,targetSex);
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
