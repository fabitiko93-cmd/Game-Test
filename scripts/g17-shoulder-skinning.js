// Preview-only skin binding correction. Original assets and cached geometry
// remain untouched; the visible instance receives a separate geometry clone.
import {Vector3} from 'three';
import {shoulderBinding,geometryFingerprint} from './g17-shoulder-binding.js';

const originals=new WeakMap();
export const originalShoulderGeometry=mesh=>originals.get(mesh);

const smoothstep=(low,high,value)=>{
  const t=Math.max(0,Math.min(1,(value-low)/(high-low)));
  return t*t*(3-2*t);
};

export function repairPreviewShoulder(entity,options){
  const {sourceGeometrySha256,iterations=12,strength=.5,side='R',bounds}=options;
  if(options.mode!=='localized-weight-diffusion')throw Error('Unsupported shoulder correction mode');
  if(entity.modelSex!=='male'||side!=='R')throw Error('Shoulder study is calibrated for the male right shoulder only');
  if(!Number.isInteger(iterations)||iterations<1||iterations>40||!(strength>0&&strength<=.5))throw Error('Invalid shoulder diffusion settings');
  if(!bounds||['xOuter','xInner','yBottom'].some(k=>!Array.isArray(bounds[k])||bounds[k].length!==2||!bounds[k].every(Number.isFinite)||bounds[k][0]>=bounds[k][1]))throw Error('Invalid shoulder patch bounds');
  const binding=shoulderBinding(entity);
  if(!sourceGeometrySha256||binding.geometrySha256!==sourceGeometrySha256)throw Error('Shoulder patch does not match the original body geometry');
  let mesh;entity.root.traverseVisible(m=>{if(m.isSkinnedMesh&&m.name===binding.meshName)mesh=m;});
  const original=mesh.geometry,g=original.clone(),a=g.attributes,count=a.position.count,boneCount=mesh.skeleton.bones.length;
  const groups=[],lookup=new Map(),groupIds=[];
  for(let i=0;i<count;i++){
    const point=new Vector3().fromBufferAttribute(a.position,i),key=point.toArray().map(n=>n.toFixed(5)).join(',');
    let id=lookup.get(key);
    if(id===undefined){id=groups.length;lookup.set(key,id);groups.push({ids:[],point:new Vector3(),weights:new Float64Array(boneCount),near:new Set()});}
    const group=groups[id];group.ids.push(i);group.point.add(point);groupIds[i]=id;
    for(let k=0;k<4;k++)group.weights[a.skinIndex.getComponent(i,k)]+=a.skinWeight.getComponent(i,k);
  }
  for(const group of groups){
    group.point.divideScalar(group.ids.length);
    for(let b=0;b<boneCount;b++)group.weights[b]/=group.ids.length;
    const p=group.point;
    group.alpha=smoothstep(...bounds.xOuter,p.x)*(1-smoothstep(...bounds.xInner,p.x))*smoothstep(...bounds.yBottom,p.y);
  }
  for(let j=0;j<g.index.count;j+=3){
    const ids=[0,1,2].map(k=>groupIds[g.index.getX(j+k)]);
    for(const [i,k] of [[0,1],[1,2],[2,0]])if(ids[i]!==ids[k]){groups[ids[i]].near.add(ids[k]);groups[ids[k]].near.add(ids[i]);}
  }
  for(let pass=0;pass<iterations;pass++){
    const next=groups.map(group=>{
      if(!group.alpha||!group.near.size)return group.weights;
      const weights=group.weights.slice(),mix=group.alpha*strength,mean=new Float64Array(boneCount);
      for(const id of group.near)for(let b=0;b<boneCount;b++)mean[b]+=groups[id].weights[b]/group.near.size;
      for(let b=0;b<boneCount;b++)weights[b]+=(mean[b]-weights[b])*mix;
      return weights;
    });
    groups.forEach((group,i)=>{group.weights=next[i];});
  }
  const changed=[];let maximumWeightDelta=0;
  for(let i=0;i<count;i++){
    const group=groups[groupIds[i]];
    if(group.alpha<=1e-12)continue;
    const entries=Array.from(group.weights,(w,b)=>[b,w]).sort((a,b)=>b[1]-a[1]||a[0]-b[0]).slice(0,4),sum=entries.reduce((total,[,w])=>total+w,0);
    const before=new Float64Array(boneCount),after=new Float64Array(boneCount);
    for(let k=0;k<4;k++)before[a.skinIndex.getComponent(i,k)]+=a.skinWeight.getComponent(i,k);
    for(let k=0;k<4;k++){
      const [bone,weight]=entries[k];a.skinIndex.setComponent(i,k,bone);a.skinWeight.setComponent(i,k,weight/sum);after[bone]+=a.skinWeight.getComponent(i,k);
    }
    const delta=Math.max(...Array.from(after,(w,b)=>Math.abs(w-before[b])));
    if(delta>1e-8){changed.push(i);maximumWeightDelta=Math.max(maximumWeightDelta,delta);}
  }
  if(!changed.length||changed.length>count*.12)throw Error('Unexpected shoulder correction extent');
  a.skinIndex.needsUpdate=true;a.skinWeight.needsUpdate=true;g.userData.clothingOwned=true;
  originals.set(mesh,original);mesh.geometry=g;
  const originalGeometryUnmodified=geometryFingerprint(original)===sourceGeometrySha256;
  if(!originalGeometryUnmodified)throw Error('Source shoulder geometry changed during preview correction');
  // Both the cached original and its bind-space positions/normals are preserved.
  return{format:'sperrkreis-shoulder-skinning-review',version:1,side,sourceGeometrySha256,
    iterations,strength,bounds,changedVertexIndices:changed,changedVertices:changed.length,maximumWeightDelta,
    originalGeometryUnmodified,geometryCloned:g!==original,bindPositionsUnchanged:true,bindNormalsUnchanged:true,topologyUnchanged:true};
}
