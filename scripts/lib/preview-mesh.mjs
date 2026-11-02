import {Color,Matrix3,Matrix4,Vector3,Vector4} from 'three';

export function exportModelFrame(root,id,joints={}){
 root.updateMatrixWorld(true);const triangles=[],normals=[],colours=[];
 root.traverseVisible(mesh=>{
  if(!mesh.isMesh)return;mesh.skeleton?.update();
  const g=mesh.geometry,a=g.attributes,index=g.index,material=Array.isArray(mesh.material)?mesh.material[0]:mesh.material;
  const factor=material?.color||new Color(1,1,1),normalMatrix=new Matrix3().getNormalMatrix(mesh.matrixWorld);
  const positions=[],ns=[],cs=[];
  for(let i=0;i<a.position.count;i++){
   positions.push(mesh.getVertexPosition(i,new Vector3()).applyMatrix4(mesh.matrixWorld).toArray());
   const normal=new Vector3().fromBufferAttribute(a.normal,i);
   if(mesh.isSkinnedMesh){
    const v=new Vector4(normal.x,normal.y,normal.z,0).applyMatrix4(mesh.bindMatrix),sum=new Vector4(0,0,0,0);
    for(let k=0;k<4;k++){
     const w=a.skinWeight.getComponent(i,k);if(!w)continue;
     const matrix=new Matrix4().fromArray(mesh.skeleton.boneMatrices,a.skinIndex.getComponent(i,k)*16);
     sum.add(v.clone().applyMatrix4(matrix).multiplyScalar(w));
    }
    sum.applyMatrix4(mesh.bindMatrixInverse);normal.set(sum.x,sum.y,sum.z);
   }
   ns.push(normal.applyMatrix3(normalMatrix).normalize().toArray());
   cs.push([0,1,2].map(k=>(a.color?a.color.getComponent(i,k):1)*factor.toArray()[k]));
  }
  for(let i=0;i<(index?.count||a.position.count);i+=3){
   const ids=[0,1,2].map(k=>index?index.getX(i+k):i+k),tri=ids.map(i=>positions[i]);
   const area=new Vector3().fromArray(tri[1]).sub(new Vector3().fromArray(tri[0])).cross(new Vector3().fromArray(tri[2]).sub(new Vector3().fromArray(tri[0]))).lengthSq();
   if(area<1e-18)continue;
   triangles.push(tri);normals.push(ids.map(i=>ns[i]));colours.push(ids.map(i=>cs[i]));
  }
 });

 return{id,triangles,normals,colours,joints};
}
