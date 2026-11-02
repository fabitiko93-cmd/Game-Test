import {Box3,Ray,Triangle,Vector3} from 'three';

// Probe the visible skinned hand against the closed decorative grip, rather
// than assuming that bone points stand for the outside of the fingers.
export function gripContact(entity,meshName='CustomGrip'){
 const e=entity,mesh=e.weapon.getObjectByName(meshName),a=mesh.geometry.attributes.position;
 const tris=Array.from({length:a.count/3},(_,i)=>new Triangle(...[0,1,2].map(k=>new Vector3().fromBufferAttribute(a,i*3+k))));
 const bounds=new Box3().setFromBufferAttribute(a),inside=[],vertices=[],direction=new Vector3(1,.213,.117).normalize();
 e.clothing.torso.traverse(m=>{
  if(!m.isSkinnedMesh)return;m.skeleton.update();const a=m.geometry.attributes,seen=new Set();
  for(let i=0;i<a.position.count;i++){
   const weights=Array.from({length:4},(_,k)=>[m.skeleton.bones[a.skinIndex.getComponent(i,k)].name,a.skinWeight.getComponent(i,k)]).filter(([n,w])=>/^(Wrist|Index|Middle|Ring|Pinky|Thumb).*R$/.test(n)&&w>.1);
   if(!weights.length)continue;
   const p=e.weapon.worldToLocal(m.getVertexPosition(i,new Vector3()).applyMatrix4(m.matrixWorld)),key=p.toArray().map(x=>x.toFixed(5)).join(',');
   if(seen.has(key))continue;seen.add(key);const name=weights.sort((a,b)=>b[1]-a[1])[0][0];vertices.push({p,name});
   if(!bounds.containsPoint(p))continue;
   const ray=new Ray(p,direction),hits=[];
   for(const t of tris){const h=ray.intersectTriangle(t.a,t.b,t.c,false,new Vector3());if(h&&!hits.some(v=>v.distanceTo(h)<1e-6))hits.push(h);}
   if(hits.length%2){
    const depth=Math.min(...tris.map(t=>t.closestPointToPoint(p,new Vector3()).distanceTo(p)));
    inside.push({depth,name,p});
   }
  }
 });
 return{vertices,inside,maxDepth:Math.max(0,...inside.map(v=>v.depth))};
}

export function indexSurfaceDistance(e,target){
 let nearest=Infinity;
 e.clothing.torso.traverse(m=>{
  if(!m.isSkinnedMesh)return;m.skeleton.update();const a=m.geometry.attributes,index=m.geometry.index;
  for(let i=0;i<(index?.count||a.position.count);i+=3){
   const ids=[0,1,2].map(k=>index?index.getX(i+k):i+k);
   if(!ids.some(j=>[0,1,2,3].some(k=>/^Index[34]R$/.test(m.skeleton.bones[a.skinIndex.getComponent(j,k)].name)&&a.skinWeight.getComponent(j,k)>.3)))continue;
   const tri=new Triangle(...ids.map(j=>e.weapon.worldToLocal(m.getVertexPosition(j,new Vector3()).applyMatrix4(m.matrixWorld))));
   nearest=Math.min(nearest,tri.closestPointToPoint(target,new Vector3()).distanceTo(target));
  }
 });
 return nearest;
}
